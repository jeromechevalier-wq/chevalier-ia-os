// Tests A : règles de sécurité Firestore (émulateur, projet demo-chevalier-ia-os).
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, getDocs, setLogLevel, serverTimestamp, writeBatch } from 'firebase/firestore';
import { FICHE_ESSAI } from './_reglages-maison-essai.js'; // chantier 0 : les règles lisent les comptes dans reglages_maison/maison

setLogLevel('error');

const PROJET = 'demo-chevalier-ia-os';
const REGLES = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');
const [hote, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

// Collections de l'appli : comportement identique à celui d'avant l'étape 4 (cas A1 à A5, pour chaque collection de la liste).
const COLLECTIONS = [
  'crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements',
  'crm_parametres', 'os_objectifs', 'os_objectifs_saisies', 'os_kpi', 'os_kpi_saisies',
  // Module Projets (version 2.1) : couvertes par le joker, sans règle à publier ; mêmes droits que le CRM.
  'projets_projets', 'projets_taches', 'projets_modeles',
];
// Collections du serveur MCP (étape 4) : sorties du joker.
const COLLECTIONS_SERVEUR = ['crm_audit', 'crm_audit_avant', 'mcp_limites', 'mcp_oauth', 'plateforme_cles'];
// Tableau de bord : lisible par les deux comptes, jamais modifiable depuis un navigateur (les écritures passent par les fonctions).
const COLLECTIONS_TABLEAU = ['tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes'];
// File « À valider » des automatisations : mêmes droits que le tableau de bord (lecture oui, écriture non).
// + documents_stockes (fiches des fichiers de l'onglet « Documents », 28/10/2026) : lecture oui, écriture jamais depuis un navigateur.
// + reseauxsociaux_mesures (relevés hebdomadaires des posts, 12/11/2026) : lecture oui, écriture jamais depuis un navigateur (le joker ne la couvre plus).
const COLLECTIONS_AUTOMATISATIONS = ['automatisations_propositions', 'documents_stockes', 'reseauxsociaux_mesures'];
const COMPTES = ['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com'];

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJET,
    firestore: { rules: REGLES, host: hote, port: Number(port) },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Un document existant par collection, écrit sans règles, pour les lectures et suppressions.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'reglages_maison', 'maison'), { ...FICHE_ESSAI }); // chantier 0 : fiche de la maison (comptes d'avant), effacée par clearFirestore
    for (const c of [...COLLECTIONS, ...COLLECTIONS_SERVEUR, ...COLLECTIONS_TABLEAU, ...COLLECTIONS_AUTOMATISATIONS, 'crm_autre']) {
      await setDoc(doc(db, c, 'existant'), { valeur: 1 });
    }
  });
});

function contexte(email, verifie = true) {
  return env.authenticatedContext(`uid-${email}`, { email, email_verified: verifie }).firestore();
}

async function droitsComplets(db, c) {
  await assertSucceeds(getDoc(doc(db, c, 'existant')));
  await assertSucceeds(getDocs(collection(db, c)));
  await assertSucceeds(setDoc(doc(db, c, 'nouveau'), { valeur: 2 }));
  await assertSucceeds(updateDoc(doc(db, c, 'existant'), { valeur: 3 }));
  await assertSucceeds(deleteDoc(doc(db, c, 'existant')));
}

async function aucunDroit(db, c) {
  await assertFails(getDoc(doc(db, c, 'existant')));
  await assertFails(getDocs(collection(db, c)));
  await assertFails(setDoc(doc(db, c, 'nouveau'), { valeur: 2 }));
  await assertFails(updateDoc(doc(db, c, 'existant'), { valeur: 3 }));
  await assertFails(deleteDoc(doc(db, c, 'existant')));
}

describe('A. Règles de sécurité', () => {
  for (const c of COLLECTIONS) {
    test(`A1 Jérôme (email vérifié) peut lire, créer, modifier, supprimer dans ${c}`, async () => {
      await droitsComplets(contexte('jerome.chevalier@gmail.com'), c);
    });
  }

  for (const c of COLLECTIONS) {
    test(`A2 Charles (email vérifié) a les mêmes droits dans ${c}`, async () => {
      await droitsComplets(contexte('jeromebot.chevalierbot@gmail.com'), c);
    });
  }

  for (const c of COLLECTIONS) {
    test(`A3 un autre compte Google vérifié est refusé en lecture et en écriture dans ${c}`, async () => {
      await aucunDroit(contexte('quelquun.dautre@gmail.com'), c);
    });
  }

  for (const c of COLLECTIONS) {
    test(`A4 un compte autorisé dont l'email n'est pas vérifié est refusé dans ${c}`, async () => {
      await aucunDroit(contexte('jerome.chevalier@gmail.com', false), c);
      await aucunDroit(contexte('jeromebot.chevalierbot@gmail.com', false), c);
    });
  }

  for (const c of COLLECTIONS) {
    test(`A5 un visiteur non connecté est refusé dans ${c}`, async () => {
      await aucunDroit(env.unauthenticatedContext().firestore(), c);
    });
  }

  // Journal d'audit et copies : l'appli lit, et AJOUTE les lignes de ses propres actions (canal « ecran », à son nom) ; jamais de
  // modification ni de suppression ; les compteurs du serveur restent fermés.
  const ligne = (email, extra = {}) => ({ operationId: 'op', ordre: 1, acteur: email, via: 'ecran', statut: 'succes', collection: 'crm_notes', docId: 'n', action: 'creer', ...extra });
  const copie = (extra = {}) => ({ operationId: 'op', collection: 'crm_notes', docId: 'n', avant: null, apres: { texte: 'x' }, expireAt: new Date(Date.now() + 90 * 86_400_000), ...extra });

  for (const email of COMPTES) {
    test(`A6 ${email} lit le journal et peut y ajouter une ligne à son nom (canal ecran), mais ne peut ni la modifier ni la supprimer`, async () => {
      const db = contexte(email);
      await assertSucceeds(getDoc(doc(db, 'crm_audit', 'existant')));
      await assertSucceeds(getDocs(collection(db, 'crm_audit')));
      await assertSucceeds(setDoc(doc(db, 'crm_audit', 'nouvelle'), ligne(email)));
      await assertFails(updateDoc(doc(db, 'crm_audit', 'existant'), { statut: 'echec' }));
      await assertFails(updateDoc(doc(db, 'crm_audit', 'nouvelle'), { statut: 'echec' }));
      await assertFails(deleteDoc(doc(db, 'crm_audit', 'existant')));
      await assertFails(deleteDoc(doc(db, 'crm_audit', 'nouvelle')));
    });
    test(`A6 ${email} ne peut pas écrire une ligne au nom d'un autre, ni avec un autre canal que « ecran » (journal non falsifiable depuis l'appli)`, async () => {
      const db = contexte(email);
      const autre = COMPTES.find((c) => c !== email);
      await assertFails(setDoc(doc(db, 'crm_audit', 'faux1'), ligne(autre)));
      await assertFails(setDoc(doc(db, 'crm_audit', 'faux2'), ligne(email, { via: 'mcp' })));
    });
    test(`A7 ${email} lit les copies et peut en ajouter (avec une date d'expiration), mais ne peut ni les modifier ni les supprimer`, async () => {
      const db = contexte(email);
      await assertSucceeds(getDoc(doc(db, 'crm_audit_avant', 'existant')));
      await assertSucceeds(getDocs(collection(db, 'crm_audit_avant')));
      await assertSucceeds(setDoc(doc(db, 'crm_audit_avant', 'nouvelle'), copie()));
      await assertFails(setDoc(doc(db, 'crm_audit_avant', 'sansdate'), copie({ expireAt: 'demain' })));
      await assertFails(updateDoc(doc(db, 'crm_audit_avant', 'existant'), { apres: null }));
      await assertFails(deleteDoc(doc(db, 'crm_audit_avant', 'existant')));
    });
    test(`A7 ${email} ne peut rien faire dans mcp_limites (compteurs du serveur : lecture, liste, création, modification, suppression refusées)`, async () => {
      await aucunDroit(contexte(email), 'mcp_limites');
    });
    test(`A7 ${email} ne peut rien faire dans mcp_oauth (autorisations OAuth du serveur : empreintes de jetons, tout refusé)`, async () => {
      await aucunDroit(contexte(email), 'mcp_oauth');
    });
    test(`A7 ${email} ne peut rien faire dans plateforme_cles (clés de la porte : empreintes, tout refusé à un navigateur)`, async () => {
      await aucunDroit(contexte(email), 'plateforme_cles');
    });
    for (const c of [...COLLECTIONS_TABLEAU, ...COLLECTIONS_AUTOMATISATIONS]) {
      test(`A7 ${email} lit ${c} mais ne peut ni créer, ni modifier, ni supprimer (écritures réservées aux fonctions du tableau de bord)`, async () => {
        const db = contexte(email);
        await assertSucceeds(getDoc(doc(db, c, 'existant')));
        await assertSucceeds(getDocs(collection(db, c)));
        await assertFails(setDoc(doc(db, c, 'nouveau'), { valeur: 2 }));
        await assertFails(updateDoc(doc(db, c, 'existant'), { valeur: 3 }));
        await assertFails(deleteDoc(doc(db, c, 'existant')));
      });
    }
    test(`A8 ${email} garde tous ses droits dans une collection inconnue (le joker reste en place pour le reste)`, async () => {
      await droitsComplets(contexte(email), 'crm_autre');
    });
  }

  test('A6 un autre compte, un compte non vérifié et un visiteur : ni lecture ni écriture dans le journal, les copies et les compteurs', async () => {
    const contextes = [contexte('quelquun.dautre@gmail.com'), contexte('jerome.chevalier@gmail.com', false), env.unauthenticatedContext().firestore()];
    for (const db of contextes) for (const c of [...COLLECTIONS_SERVEUR, ...COLLECTIONS_TABLEAU, ...COLLECTIONS_AUTOMATISATIONS]) await aucunDroit(db, c);
    await assertFails(setDoc(doc(contextes[0], 'crm_audit', 'x'), ligne('quelquun.dautre@gmail.com')));
    await assertFails(setDoc(doc(contextes[1], 'crm_audit', 'x'), ligne('jerome.chevalier@gmail.com')));
  });

  test('A7 les trois collections du serveur restent exclues du joker : aucune sous-collection ouverte', async () => {
    for (const email of COMPTES) {
      const db = contexte(email);
      for (const c of [...COLLECTIONS_SERVEUR, ...COLLECTIONS_TABLEAU, ...COLLECTIONS_AUTOMATISATIONS]) await assertFails(setDoc(doc(db, c, 'x', 'sous', 'y'), { valeur: 1 }));
    }
  });
});

// Module Console (16/11/2026) : `console_filet` est lue et écrite par le compte de Jérôme seul ; le compte du bot, un autre compte, un compte non vérifié et un visiteur n'y ont aucun droit.
describe('C4 Console : règles de console_filet', () => {
  const JEROME = 'jerome.chevalier@gmail.com';
  const BOT = 'jeromebot.chevalierbot@gmail.com';
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'console_filet', 'budget'), { note: 'x' }); });
  });
  test('C4 Jérôme lit, écrit, modifie et supprime une vérification du filet', async () => {
    const db = contexte(JEROME);
    await assertSucceeds(getDoc(doc(db, 'console_filet', 'budget')));
    await assertSucceeds(getDocs(collection(db, 'console_filet')));
    await assertSucceeds(setDoc(doc(db, 'console_filet', 'restauration'), { note: 'y' }));
    await assertSucceeds(updateDoc(doc(db, 'console_filet', 'budget'), { note: 'z' }));
    await assertSucceeds(deleteDoc(doc(db, 'console_filet', 'budget')));
  });
  test('C4 le compte du bot ne lit ni n\'écrit console_filet (le joker ne la couvre plus)', async () => {
    const db = contexte(BOT);
    await assertFails(getDoc(doc(db, 'console_filet', 'budget')));
    await assertFails(getDocs(collection(db, 'console_filet')));
    await assertFails(setDoc(doc(db, 'console_filet', 'nouveau'), { note: 'y' }));
    await assertFails(updateDoc(doc(db, 'console_filet', 'budget'), { note: 'z' }));
    await assertFails(deleteDoc(doc(db, 'console_filet', 'budget')));
  });
  test('C4 un autre compte, un compte non vérifié et un visiteur : rien', async () => {
    for (const db of [contexte('intrus@exemple.test'), contexte(JEROME, false), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'console_filet', 'budget')));
      await assertFails(setDoc(doc(db, 'console_filet', 'nouveau'), { note: 'y' }));
    }
  });
});

// Connexion à la base des modules Achats (24/11/2026) : `base_parametres` est LUE par les comptes autorisés et ÉCRITE par le compte de Jérôme seul ; exclue du joker.
describe('B5 Connexion à la base : règles de base_parametres', () => {
  const JEROME = 'jerome.chevalier@gmail.com';
  const BOT = 'jeromebot.chevalierbot@gmail.com';
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'base_parametres', 'connexion'), { espace: 'essai' }); });
  });
  test('B5 Jérôme lit, écrit, modifie et supprime les réglages', async () => {
    const db = contexte(JEROME);
    await assertSucceeds(getDoc(doc(db, 'base_parametres', 'connexion')));
    await assertSucceeds(setDoc(doc(db, 'base_parametres', 'connexion'), { espace: 'autre' }));
    await assertSucceeds(updateDoc(doc(db, 'base_parametres', 'connexion'), { espace: 'encore' }));
    await assertSucceeds(deleteDoc(doc(db, 'base_parametres', 'connexion')));
  });
  test('B5 le compte du bot lit mais n\'écrit, ne modifie ni ne supprime rien', async () => {
    const db = contexte(BOT);
    await assertSucceeds(getDoc(doc(db, 'base_parametres', 'connexion')));
    await assertFails(setDoc(doc(db, 'base_parametres', 'connexion'), { espace: 'autre' }));
    await assertFails(setDoc(doc(db, 'base_parametres', 'nouveau'), { espace: 'autre' }));
    await assertFails(updateDoc(doc(db, 'base_parametres', 'connexion'), { espace: 'encore' }));
    await assertFails(deleteDoc(doc(db, 'base_parametres', 'connexion')));
  });
  test('B5 un autre compte, un compte non vérifié et un visiteur : ni lecture ni écriture', async () => {
    for (const db of [contexte('intrus@exemple.test'), contexte(JEROME, false), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'base_parametres', 'connexion')));
      await assertFails(setDoc(doc(db, 'base_parametres', 'connexion'), { espace: 'autre' }));
    }
  });
  test('B5 aucune sous-collection n\'est ouverte (le joker ne la couvre plus)', async () => {
    await assertFails(setDoc(doc(contexte(JEROME), 'base_parametres', 'connexion', 'sous', 'x'), { v: 1 }));
  });
});

// Module Pilotage (étape 1) : `pilotage_parametres` (réglage des tableaux) est lue et écrite par le SERVEUR seulement ; aucun compte de navigateur n'y touche, pas même Jérôme.
describe('P1 Pilotage : règles de pilotage_parametres', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'pilotage_parametres', 'reglages'), { version: 1 }); });
  });
  test('P1 les deux comptes autorisés ne lisent ni n\'écrivent pilotage_parametres', async () => {
    for (const email of COMPTES) {
      const db = contexte(email);
      await assertFails(getDoc(doc(db, 'pilotage_parametres', 'reglages')));
      await assertFails(getDocs(collection(db, 'pilotage_parametres')));
      await assertFails(setDoc(doc(db, 'pilotage_parametres', 'reglages'), { version: 2 }));
      await assertFails(setDoc(doc(db, 'pilotage_parametres', 'autre'), { version: 2 }));
      await assertFails(updateDoc(doc(db, 'pilotage_parametres', 'reglages'), { version: 3 }));
      await assertFails(deleteDoc(doc(db, 'pilotage_parametres', 'reglages')));
      await assertFails(setDoc(doc(db, 'pilotage_parametres', 'reglages', 'sous', 'x'), { v: 1 }));
    }
  });
  test('P1 un autre compte, un compte non vérifié et un visiteur : rien non plus', async () => {
    for (const db of [contexte('intrus@exemple.test'), contexte(COMPTES[0], false), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'pilotage_parametres', 'reglages')));
      await assertFails(setDoc(doc(db, 'pilotage_parametres', 'nouveau'), { v: 1 }));
    }
  });
});

// Module Rendez-vous (15/11/2026) : les SMS (rdv_messages) et les désinscrits (rdv_parametres/desinscrits) sont écrits par le SERVEUR seulement ; les réglages restent écrits par l'écran.
describe('C3 Rendez-vous : règles chez Jérôme', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'rdv_messages', 'existant'), { valeur: 1 });
      await setDoc(doc(db, 'rdv_parametres', 'reglages'), { valeur: 1 });
      await setDoc(doc(db, 'rdv_parametres', 'desinscrits'), { numeros: ['+33600000000'] });
      await setDoc(doc(db, 'rdv_rendezvous', 'existant'), { valeur: 1 });
    });
  });
  for (const email of COMPTES) {
    test(`C3 ${email} lit rdv_messages (l'historique des SMS) mais n'y écrit jamais : ni création, ni modification, ni suppression`, async () => {
      const db = contexte(email);
      await assertSucceeds(getDoc(doc(db, 'rdv_messages', 'existant')));
      await assertSucceeds(getDocs(collection(db, 'rdv_messages')));
      await assertFails(setDoc(doc(db, 'rdv_messages', 'nouveau'), { valeur: 2 }));
      await assertFails(updateDoc(doc(db, 'rdv_messages', 'existant'), { valeur: 3 }));
      await assertFails(deleteDoc(doc(db, 'rdv_messages', 'existant')));
    });
    test(`C3 ${email} lit toute la collection rdv_parametres (l'écran l'écoute) et écrit les réglages, mais jamais la liste des désinscrits`, async () => {
      const db = contexte(email);
      await assertSucceeds(getDocs(collection(db, 'rdv_parametres')));
      await assertSucceeds(getDoc(doc(db, 'rdv_parametres', 'desinscrits')));
      await assertSucceeds(updateDoc(doc(db, 'rdv_parametres', 'reglages'), { valeur: 5 }));
      await assertSucceeds(setDoc(doc(db, 'rdv_parametres', 'reglages'), { valeur: 6 }));
      await assertFails(setDoc(doc(db, 'rdv_parametres', 'desinscrits'), { numeros: [] }));
      await assertFails(updateDoc(doc(db, 'rdv_parametres', 'desinscrits'), { numeros: [] }));
      await assertFails(deleteDoc(doc(db, 'rdv_parametres', 'desinscrits')));
    });
    test(`C3 ${email} garde ses droits sur les rendez-vous et les participants (le joker reste en place)`, async () => {
      await droitsComplets(contexte(email), 'rdv_rendezvous');
    });
  }
  test('C3 un autre compte, un compte non vérifié et un visiteur : rien dans rdv_messages ni rdv_parametres', async () => {
    for (const db of [contexte('quelquun.dautre@gmail.com'), contexte('jerome.chevalier@gmail.com', false), env.unauthenticatedContext().firestore()]) {
      for (const c of ['rdv_messages', 'rdv_parametres']) {
        await assertFails(getDoc(doc(db, c, 'existant')));
        await assertFails(getDocs(collection(db, c)));
      }
      await assertFails(setDoc(doc(db, 'rdv_parametres', 'reglages'), { valeur: 9 }));
      await assertFails(setDoc(doc(db, 'rdv_messages', 'x'), { valeur: 9 }));
    }
  });
  test('C3 aucune sous-collection ouverte sous rdv_messages ni sous rdv_parametres/desinscrits', async () => {
    const db = contexte(COMPTES[0]);
    await assertFails(setDoc(doc(db, 'rdv_messages', 'x', 'sous', 'y'), { valeur: 1 }));
    await assertFails(setDoc(doc(db, 'rdv_parametres', 'desinscrits', 'sous', 'y'), { valeur: 1 }));
  });
});

// ---------------------------------------------------------------- Chantier 0 (25/11/2026) : la fiche reglages_maison
describe('Chantier 0 : les comptes viennent de la fiche reglages_maison/maison', () => {
  const [JEROME, BOT] = COMPTES;
  const ecrireFiche = (fiche) => env.withSecurityRulesDisabled(async (ctx) => {
    const ref = doc(ctx.firestore(), 'reglages_maison', 'maison');
    if (fiche === null) await deleteDoc(ref); else await setDoc(ref, fiche);
  });

  test('RM-R1 fiche absente : tout est refusé, même pour Jérôme (jamais d\'ouverture par défaut)', async () => {
    await ecrireFiche(null);
    for (const email of COMPTES) {
      await assertFails(getDoc(doc(contexte(email), 'crm_personnes', 'existant')));
      await assertFails(setDoc(doc(contexte(email), 'crm_personnes', 'nouveau'), { valeur: 2 }));
    }
  });
  test('RM-R2 un compte ajouté dans la fiche est admis, un compte retiré est refusé (adresses inventées)', async () => {
    await ecrireFiche({ ...FICHE_ESSAI, comptes_autorises: ['admin@exemple.test'], comptes_jerome_seul: ['admin@exemple.test'] });
    await assertSucceeds(getDoc(doc(contexte('admin@exemple.test'), 'crm_personnes', 'existant')));
    await assertFails(getDoc(doc(contexte('admin@exemple.test', false), 'crm_personnes', 'existant')), 'e-mail non vérifié');
    await assertFails(getDoc(doc(contexte(JEROME), 'crm_personnes', 'existant')), 'retiré de la fiche : refusé');
  });
  test('RM-R3 la fiche « maison » ne se lit ni ne s\'écrit depuis un navigateur, même par Jérôme ; aucun document reglages_maison ne s\'écrit ; la liste est refusée', async () => {
    const jerome = contexte(JEROME);
    await assertFails(getDoc(doc(jerome, 'reglages_maison', 'maison')));
    for (const id of ['maison', 'ecran', 'public', 'autre']) {
      await assertFails(setDoc(doc(jerome, 'reglages_maison', id), { comptes_autorises: [JEROME, 'intrus@exemple.test'] }));
      await assertFails(deleteDoc(doc(jerome, 'reglages_maison', id)));
    }
    await assertFails(updateDoc(doc(jerome, 'reglages_maison', 'maison'), { comptes_autorises: [JEROME, 'intrus@exemple.test'] }));
    await assertFails(getDocs(collection(jerome, 'reglages_maison')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reglages_maison', 'maison')));
  });
  // Mon espace d'une maison de client (27/11/2026) : seule écriture permise dans reglages_maison, le nom et le logo de `public`.
  const LOGO_OK = 'data:image/png;base64,iVBORw0KGgo=';
  const poserPublic = (fiche) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'reglages_maison', 'public'), fiche));
  test('RM-R5 maison d\'un client : le titulaire seul change le nom et le logo de « public » (PNG, JPEG, SVG), retire le logo ; rien d\'autre', async () => {
    await poserPublic({ mode_crm: true, nom_espace: 'Espace exemple' });
    const pub = (email) => doc(contexte(email), 'reglages_maison', 'public');
    await assertSucceeds(updateDoc(pub(JEROME), { nom_espace: 'Nouveau nom' }));
    await assertFails(updateDoc(pub(BOT), { nom_espace: 'Autre compte' }), 'un compte autorisé qui n\'est pas titulaire : refusé');
    await assertFails(updateDoc(pub(BOT), { logo: LOGO_OK }));
    await assertSucceeds(updateDoc(pub(JEROME), { nom_espace: 'Avec logo', logo: LOGO_OK }));
    await assertSucceeds(updateDoc(pub(JEROME), { logo: 'data:image/jpeg;base64,/9j/4AAQ' }));
    await assertSucceeds(updateDoc(pub(JEROME), { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }));
    await assertSucceeds(updateDoc(pub(JEROME), { logo: `data:image/png;base64,${'A'.repeat(139000)}` }), 'environ 100 Ko : accepté');
    await assertSucceeds(updateDoc(pub(JEROME), { logo: deleteField() }), 'le logo se retire');
    // refus : champs interdits, mauvaises valeurs, comptes hors fiche
    await assertFails(updateDoc(pub(JEROME), { mode_crm: false }));
    await assertFails(updateDoc(pub(JEROME), { connexion_neutre: true }));
    await assertFails(updateDoc(pub(JEROME), { nom_espace: 'Nom', autre: 1 }));
    await assertFails(updateDoc(pub(JEROME), { nom_espace: '' }));
    await assertFails(updateDoc(pub(JEROME), { nom_espace: '   ' }), 'des espaces seuls : refusé');
    await assertFails(updateDoc(pub(JEROME), { nom_espace: ' \t\n ' }));
    await assertFails(updateDoc(pub(JEROME), { nom_espace: 'x'.repeat(81) }));
    await assertFails(updateDoc(pub(JEROME), { nom_espace: 42 }));
    await assertFails(updateDoc(pub(JEROME), { nom_espace: deleteField() }), 'le nom ne se retire pas');
    for (const logo of ['https://exemple.test/logo.png', 'data:text/html;base64,AAAA', 'data:image/gif;base64,AAAA', 'data:image/png;base64,', 'data:image/png;base64,AA<script>', 42, `data:image/png;base64,${'A'.repeat(140000)}`]) {
      await assertFails(updateDoc(pub(JEROME), { logo }));
    }
    await assertFails(updateDoc(pub('intrus@exemple.test'), { nom_espace: 'Pirate' }));
    await assertFails(updateDoc(doc(contexte(JEROME, false), 'reglages_maison', 'public'), { nom_espace: 'Non vérifié' }));
    await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'reglages_maison', 'public'), { nom_espace: 'Anonyme' }));
    await assertFails(setDoc(pub(JEROME), { nom_espace: 'Remplacé' }), 'un remplacement qui efface mode_crm est refusé');
  });
  test('RM-R6 chez Jérôme (« public » sans nom_espace ni connexion_neutre) : aucune écriture, même le nom ; maison neutre sans nom : le nom peut être posé ; « ecran » et « maison » restent fermés', async () => {
    await poserPublic({ mode_crm: true });
    await assertFails(updateDoc(doc(contexte(JEROME), 'reglages_maison', 'public'), { nom_espace: 'Chez Jérôme' }));
    await assertFails(updateDoc(doc(contexte(JEROME), 'reglages_maison', 'public'), { logo: LOGO_OK }));
    await poserPublic({ mode_crm: true, connexion_neutre: true });
    await assertFails(updateDoc(doc(contexte(JEROME), 'reglages_maison', 'public'), { logo: LOGO_OK, nom_espace: '' }));
    await assertSucceeds(updateDoc(doc(contexte(JEROME), 'reglages_maison', 'public'), { nom_espace: 'Premier nom', logo: LOGO_OK }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'reglages_maison', 'ecran'), { personnes: [] }));
    await assertFails(updateDoc(doc(contexte(JEROME), 'reglages_maison', 'ecran'), { nom_espace: 'Nom', logo: LOGO_OK }));
    await assertFails(updateDoc(doc(contexte(JEROME), 'reglages_maison', 'maison'), { nom_espace: 'Nom' }));
    await assertFails(deleteDoc(doc(contexte(JEROME), 'reglages_maison', 'public')));
    await assertFails(setDoc(doc(contexte(JEROME), 'reglages_maison', 'nouveau'), { nom_espace: 'Nom' }));
  });
  test('RM-R4 « public » se lit par tous (même sans connexion) ; « ecran » seulement par les comptes de la fiche ; « autre » par personne', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reglages_maison', 'public'), { mode_crm: true });
      await setDoc(doc(ctx.firestore(), 'reglages_maison', 'ecran'), { personnes: {} });
      await setDoc(doc(ctx.firestore(), 'reglages_maison', 'autre'), { x: 1 });
    });
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'reglages_maison', 'public')));
    await assertSucceeds(getDoc(doc(contexte('intrus@exemple.test'), 'reglages_maison', 'public')));
    for (const email of COMPTES) await assertSucceeds(getDoc(doc(contexte(email), 'reglages_maison', 'ecran')));
    await assertFails(getDoc(doc(contexte('intrus@exemple.test'), 'reglages_maison', 'ecran')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reglages_maison', 'ecran')));
    await assertFails(getDoc(doc(contexte(JEROME), 'reglages_maison', 'autre')));
  });
  test('RM-R6 (navigateur, 26/11/2026) « public » et « ecran » absents se lisent quand même (document inexistant, pas un refus) ; « ecran » : e-mail non vérifié ou compte retiré de la fiche refusé ; aucune modification de « ecran » ni de « public », même par Jérôme (adresses inventées)', async () => {
    const ADMIN = 'admin@exemple.test';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reglages_maison', 'maison'), { ...FICHE_ESSAI, comptes_autorises: [ADMIN] });
    });
    // Documents absents : la lecture est permise (le navigateur distingue « absent » de « refusé »).
    const pub = await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'reglages_maison', 'public')));
    assert.equal(pub.exists(), false);
    const ecr = await assertSucceeds(getDoc(doc(contexte(ADMIN), 'reglages_maison', 'ecran')));
    assert.equal(ecr.exists(), false);
    await assertFails(getDoc(doc(contexte(ADMIN, false), 'reglages_maison', 'ecran')));
    await assertFails(getDoc(doc(contexte(JEROME), 'reglages_maison', 'ecran')), 'compte retiré de la fiche : refusé');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reglages_maison', 'public'), { mode_crm: true });
      await setDoc(doc(ctx.firestore(), 'reglages_maison', 'ecran'), { personnes: [{ email: ADMIN, nom: 'Admin', portrait: '' }], comptes_jerome_seul: [ADMIN] });
    });
    for (const id of ['public', 'ecran']) {
      await assertFails(updateDoc(doc(contexte(ADMIN), 'reglages_maison', id), { mode_crm: false }));
      await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'reglages_maison', id), { mode_crm: false }));
    }
  });
  test('RM-R5 le bot reste refusé là où il l\'était (Console, connexion à la base) : comptes_jerome_seul ne contient que Jérôme', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'console_filet', 'budget'), { note: 'x' });
      await setDoc(doc(ctx.firestore(), 'base_parametres', 'connexion'), { espace: 'essai' });
    });
    // Console : ni lecture ni écriture pour le bot ; connexion à la base : le bot lit (comme avant), seul Jérôme écrit.
    await assertFails(getDoc(doc(contexte(BOT), 'console_filet', 'budget')), 'console_filet : bot refusé');
    await assertSucceeds(getDoc(doc(contexte(BOT), 'base_parametres', 'connexion')), 'base_parametres : le bot lit, comme avant');
    for (const [c, id] of [['console_filet', 'budget'], ['base_parametres', 'connexion']]) {
      await assertFails(setDoc(doc(contexte(BOT), c, id), { note: 'y' }), `${c} : bot refusé en écriture`);
      await assertSucceeds(getDoc(doc(contexte(JEROME), c, id)), `${c} : Jérôme lit`);
      await assertSucceeds(setDoc(doc(contexte(JEROME), c, id), { note: 'z' }), `${c} : Jérôme écrit`);
    }
  });
});

// Village de l'accueil rangé par chaque utilisateur (étape 2 de docs/accueil-village.md, 27/11/2026) : village_utilisateurs/{uid}/batiments/{id}.
// Le propriétaire seul lit et écrit ses documents ; chaque champ est contrôlé par les règles (mêmes contrôles que lireBatiments de js/os/village-damier.js).
describe('Village par utilisateur (27/11/2026)', () => {
  const [J, C] = COMPTES;
  const AUTRE = 'quelquun.dautre@gmail.com';
  const chemin = (db, email, id) => doc(db, 'village_utilisateurs', `uid-${email}`, 'batiments', id);
  const BESOIN = { sorte: 'besoin', c: 2, l: 4, cache: false, nom: 'Mes factures' };
  const hote = ['exemple', 'test'].join('.');
  const LIEN = { sorte: 'lien', nom: 'Mon site', url: `https://${hote}/chemin?x=1#y`, batiment: 'phare', c: 0, l: 6 };
  const PETITE = { sorte: 'petite', parent: 'b-achatschantiers-liste', nom: 'Chantier Dupont', cible: '#/achatschantiers/liste/ch1' };
  const VALABLES = [['b-achatsfactures-liste', BESOIN], ['l-abc123', LIEN], ['p-xyz-9', PETITE]];

  test('2.R1 le propriétaire crée, lit, liste, modifie et supprime ses trois sortes de documents valables', async () => {
    const db = contexte(J);
    for (const [id, d] of VALABLES) await assertSucceeds(setDoc(chemin(db, J, id), { ...d, modifieLe: serverTimestamp() }));
    await assertSucceeds(setDoc(chemin(db, J, 'b-sans-place'), { sorte: 'besoin' }));
    for (const [id] of VALABLES) await assertSucceeds(getDoc(chemin(db, J, id)));
    const tous = await assertSucceeds(getDocs(collection(db, 'village_utilisateurs', `uid-${J}`, 'batiments')));
    assert.equal(tous.size, 4);
    await assertSucceeds(setDoc(chemin(db, J, 'b-achatsfactures-liste'), { ...BESOIN, c: 6, l: 6 }));
    await assertFails(updateDoc(chemin(db, J, 'l-abc123'), { nom: 'Autre nom' })); // l'ancienne heure `modifieLe` resterait : refusé (l'écran écrit le document entier)
    await assertSucceeds(updateDoc(chemin(db, J, 'l-abc123'), { nom: 'Autre nom', modifieLe: serverTimestamp() }));
    for (const [id] of VALABLES) await assertSucceeds(deleteDoc(chemin(db, J, id)));
    // Charles, autre compte autorisé de la maison, a lui aussi SON village
    await assertSucceeds(setDoc(chemin(contexte(C), C, 'b-achatsfactures-liste'), BESOIN));
  });

  test('2.R2 aucun autre compte ne lit, ne liste, n’écrit ni ne supprime le village d’un compte ; non autorisé, non vérifié et non connecté refusés', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(chemin(ctx.firestore(), J, 'b-x'), BESOIN); });
    const charles = contexte(C);
    await assertFails(getDoc(chemin(charles, J, 'b-x')));
    await assertFails(getDocs(collection(charles, 'village_utilisateurs', `uid-${J}`, 'batiments')));
    await assertFails(setDoc(chemin(charles, J, 'b-y'), BESOIN));
    await assertFails(setDoc(chemin(charles, J, 'b-x'), BESOIN));
    await assertFails(deleteDoc(chemin(charles, J, 'b-x')));
    const autre = contexte(AUTRE);
    await assertFails(setDoc(chemin(autre, AUTRE, 'b-x'), BESOIN)); // compte non autorisé, même sous son propre identifiant
    await assertFails(getDocs(collection(autre, 'village_utilisateurs', `uid-${AUTRE}`, 'batiments')));
    const nonVerifie = contexte(J, false);
    await assertFails(getDoc(chemin(nonVerifie, J, 'b-x')));
    await assertFails(setDoc(chemin(nonVerifie, J, 'b-z'), BESOIN));
    const visiteur = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(chemin(visiteur, J, 'b-x')));
    await assertFails(setDoc(chemin(visiteur, J, 'b-z'), BESOIN));
  });

  test('2.R3 champs invalides refusés un par un (sorte, champ en trop, place, nom, cache, identifiant, heure)', async () => {
    const db = contexte(J);
    const refus = [
      ['b-a', { ...BESOIN, sorte: 'chateau' }],
      ['b-a', { ...BESOIN, couleur: 'rouge' }],
      ['b-a', { sorte: 'besoin', c: 3 }],
      ['b-a', { sorte: 'besoin', l: 3 }],
      ['b-a', { ...BESOIN, c: -1 }],
      ['b-a', { ...BESOIN, c: 24 }],
      ['b-a', { ...BESOIN, l: 1.5 }],
      ['b-a', { ...BESOIN, c: '3' }],
      ['b-a', { ...BESOIN, nom: '' }],
      ['b-a', { ...BESOIN, nom: 'N'.repeat(41) }],
      ['b-a', { ...BESOIN, nom: 12 }],
      ['b-a', { ...BESOIN, cache: 'oui' }],
      ['l-a', BESOIN],
      ['p-a', BESOIN],
      ['b-a', LIEN],
      ['b-Majuscule', BESOIN],
      ['b-', BESOIN],
      ['b-a', { ...BESOIN, modifieLe: new Date('2026-01-01T00:00:00Z') }],
      ['b-a', {}],
    ];
    for (const [id, d] of refus) await assertFails(setDoc(chemin(db, J, id), d));
    await assertSucceeds(setDoc(chemin(db, J, 'b-a'), { ...BESOIN, c: 23, l: 0, nom: 'N'.repeat(40) }));
  });

  test('2.R4 lien : https seulement, sans identifiants, 300 caractères au plus, image bien formée, place obligatoire', async () => {
    const db = contexte(J);
    const p = (s) => s.join(':'); // les adresses refusées sont écrites en morceaux : aucune vraie adresse dans ce fichier
    const refusees = [
      `${p(['http', ''])}//${hote}/`, p(['javascript', 'alert(1)']), `//${hote}`, `${p(['ftp', ''])}//${hote}/`, `https://${hote}/a b`,
      `https://moi${'@'}${hote}/`, 'https://', `https://${hote}/${'a'.repeat(301 - 9 - hote.length)}`,
      `https://${hote}/a"onmouseover=x`, `https://${hote}/<b>`, `https://${hote}/a'b`, `https://${hote}/a\`b`, `https://${hote}/a\\b`, `https://${hote}/a[0]`, // Fable 2 : caractères qui cassent un attribut
    ];
    for (const url of refusees) await assertFails(setDoc(chemin(db, J, 'l-a'), { ...LIEN, url }));
    assert.equal(`https://${hote}/${'a'.repeat(301 - 9 - hote.length)}`.length, 301);
    await assertSucceeds(setDoc(chemin(db, J, 'l-a'), LIEN));
    await assertSucceeds(setDoc(chemin(db, J, 'l-b'), { ...LIEN, url: `https://${hote}:8443` }));
    await assertSucceeds(setDoc(chemin(db, J, 'l-c'), { ...LIEN, url: `https://${hote}/a-b_c.d?e=1&f=(2)*+,;:@$!#x~%20^|{}` })); // le reste de l'ASCII visible passe
    for (const batiment of ['Phare', '1phare', 'phare_2', 'p'.repeat(31), '']) await assertFails(setDoc(chemin(db, J, 'l-a'), { ...LIEN, batiment }));
    const { c, l, ...sansPlace } = LIEN;
    await assertFails(setDoc(chemin(db, J, 'l-a'), sansPlace));
    await assertFails(setDoc(chemin(db, J, 'l-a'), { ...sansPlace, c }));
    await assertFails(setDoc(chemin(db, J, 'l-a'), { ...sansPlace, l }));
    await assertFails(setDoc(chemin(db, J, 'l-a'), { ...LIEN, url: 42 }));
  });

  test('2.R5 petite maison : cible interne seulement, parent bien formé', async () => {
    const db = contexte(J);
    for (const cible of [`https://${hote}`, ['javascript', 'alert(1)'].join(':'), '#/crm/../reglages', '#/crm?x=1']) await assertFails(setDoc(chemin(db, J, 'p-a'), { ...PETITE, cible }));
    for (const parent of ['l-abc', 'b-', 'B-abc', 12]) await assertFails(setDoc(chemin(db, J, 'p-a'), { ...PETITE, parent }));
    await assertFails(setDoc(chemin(db, J, 'p-a'), { ...PETITE, c: 1, l: 1 }));
    await assertSucceeds(setDoc(chemin(db, J, 'p-a'), PETITE));
  });

  test('2.R6 le document parent reste fermé en écriture (lisible par son propriétaire seul depuis l’or du village, 6.R1) ; toute autre sous-collection reste fermée', async () => {
    const db = contexte(J);
    await assertFails(setDoc(doc(db, 'village_utilisateurs', `uid-${J}`), { x: 1 }));
    await assertSucceeds(getDoc(doc(db, 'village_utilisateurs', `uid-${J}`))); // or du village (27/11/2026) : le portefeuille, lu par son propriétaire (jamais écrit par le navigateur)
    await assertFails(getDoc(doc(contexte(C), 'village_utilisateurs', `uid-${J}`)));
    await assertFails(setDoc(doc(db, 'village_utilisateurs', `uid-${J}`, 'autre', 'x'), { x: 1 }));
    await assertFails(getDoc(doc(db, 'village_utilisateurs', `uid-${J}`, 'autre', 'x')));
    await assertFails(getDocs(collection(db, 'village_utilisateurs')));
  });

  test('2.R7 ce que l’écran écrit passe les règles (fabriques de js/os/village-damier.js, avec l’heure du serveur)', async () => {
    const { docDeplacement, docCacher, docRenommer, rangerVillage } = await import('../js/os/village-damier.js');
    const besoins = [{ nom: 'Factures', phrase: '', batiment: 'banque', cible: '#/achatsfactures/liste' }, { nom: 'Achats', phrase: '', batiment: 'marche', cible: '#/tableauachats/tableau', id: 'achats' }];
    const [m1, m2] = rangerVillage({ besoins }).maisons;
    const db = contexte(J);
    const ecrire = (m, d) => setDoc(chemin(db, J, m.id), { ...d, modifieLe: serverTimestamp() });
    await assertSucceeds(ecrire(m1, docDeplacement(m1, 3, 3)));
    await assertSucceeds(ecrire(m2, docDeplacement(m2, m2.c, m2.l)));
    const deplacee = { ...m1, donnees: docDeplacement(m1, 3, 3) };
    await assertSucceeds(ecrire(m1, docRenommer(deplacee, 'Mes factures')));
    await assertSucceeds(ecrire(m1, docRenommer({ ...deplacee, donnees: docRenommer(deplacee, 'Mes factures') }, '')));
    await assertSucceeds(ecrire(m1, docCacher(deplacee, true)));
    await assertSucceeds(ecrire(m1, docCacher(deplacee, false)));
    assert.equal(m2.id, 'b-achats');
  });

  test('3cb.2 petite maison cachée : cachee: true accepté (créer avec l’heure du serveur, relire, supprimer) ; cachee false, « oui », 1, null refusés ; une place refusée ; un besoin avec cachee refusé ; docCachee passe ; un autre compte : rien', async () => {
    const { docCachee } = await import('../js/os/village-petites.js');
    const db = contexte(J);
    const CACHEE = { ...PETITE, cachee: true };
    await assertSucceeds(setDoc(chemin(db, J, 'p-cache-1'), { ...CACHEE, modifieLe: serverTimestamp() }));
    const lu = await assertSucceeds(getDoc(chemin(db, J, 'p-cache-1')));
    assert.equal(lu.data().cachee, true);
    for (const cachee of [false, 'oui', 1, null]) await assertFails(setDoc(chemin(db, J, 'p-cache-2'), { ...PETITE, cachee }));
    await assertFails(setDoc(chemin(db, J, 'p-cache-2'), { ...CACHEE, c: 1, l: 1 }));
    await assertFails(setDoc(chemin(db, J, 'b-achatsfactures-liste'), { ...BESOIN, cachee: true }));
    const d = docCachee({ parent: 'b-achatschantiers-liste', nom: 'Chantier essai', cible: '#/achatschantiers/liste/ch2' });
    await assertSucceeds(setDoc(chemin(db, J, 'p-cache-3'), { ...d, modifieLe: serverTimestamp() }));
    const charles = contexte(C);
    await assertFails(getDoc(chemin(charles, J, 'p-cache-1')));
    await assertFails(setDoc(chemin(charles, J, 'p-cache-4'), CACHEE));
    await assertFails(deleteDoc(chemin(charles, J, 'p-cache-1')));
    await assertSucceeds(deleteDoc(chemin(db, J, 'p-cache-1')));
    await assertSucceeds(deleteDoc(chemin(db, J, 'p-cache-3')));
  });
});

describe('Or du village (27/11/2026)', () => {
  const [J, C] = COMPTES;
  const AUTRE = 'quelquun.dautre@gmail.com';
  const porte = (db, email) => doc(db, 'village_utilisateurs', `uid-${email}`);
  const objet = (db, email, id) => doc(db, 'village_utilisateurs', `uid-${email}`, 'batiments', id);
  const CHAMP = { sorte: 'champ', c: 4, l: 4, depuis: new Date('2026-11-26T10:00:00Z'), acheteLe: new Date('2026-11-26T10:00:00Z'), modifieLe: new Date('2026-11-26T10:00:00Z') };
  const semer = (chemin, donnees) => env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), ...chemin), donnees); });

  test('6.R1 le propriétaire lit son portefeuille ; un autre compte autorisé, un compte non autorisé, un non connecté : refusés', async () => {
    await semer(['village_utilisateurs', `uid-${J}`], { or: 120, gagne: 120, parcelles: 0 });
    const lu = await assertSucceeds(getDoc(porte(contexte(J), J)));
    assert.equal(lu.data().or, 120);
    await assertSucceeds(getDoc(porte(contexte(C), C))); // absent : lecture permise (vaut 0 à l'écran)
    await assertFails(getDoc(porte(contexte(C), J)));
    await assertFails(getDoc(porte(contexte(AUTRE), AUTRE)));
    await assertFails(getDoc(porte(contexte(J, false), J)));
    await assertFails(getDoc(porte(env.unauthenticatedContext().firestore(), J)));
  });

  test('6.R2 le propriétaire ne peut ni créer, ni modifier, ni fusionner, ni supprimer son portefeuille', async () => {
    const db = contexte(J);
    await assertFails(setDoc(porte(db, J), { or: 999999, gagne: 0, parcelles: 0 }));
    await semer(['village_utilisateurs', `uid-${J}`], { or: 10, gagne: 10, parcelles: 0 });
    await assertFails(setDoc(porte(db, J), { or: 999999, gagne: 10, parcelles: 0 }));
    await assertFails(updateDoc(porte(db, J), { or: 999999 }));
    await assertFails(setDoc(porte(db, J), { parcelles: 8 }, { merge: true }));
    await assertFails(deleteDoc(porte(db, J)));
  });

  test('6.R3 village_gains : ni lecture, ni liste, ni écriture, pour personne', async () => {
    await semer(['village_gains', 'ds-x'], { uid: `uid-${J}`, source: 'devis-signe', pieces: 50 });
    for (const db of [contexte(J), contexte(C), contexte(AUTRE), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'village_gains', 'ds-x')));
      await assertFails(getDocs(collection(db, 'village_gains')));
      await assertFails(setDoc(doc(db, 'village_gains', 'ds-y'), { uid: `uid-${J}` }));
      await assertFails(deleteDoc(doc(db, 'village_gains', 'ds-x')));
    }
  });

  test('6.R4 objet acheté : le propriétaire le lit et le déplace (c, l) ; rien d’autre ; ni création ni suppression par le navigateur ; un autre compte : rien', async () => {
    await semer(['village_utilisateurs', `uid-${J}`, 'batiments', 'o-abc'], CHAMP);
    const db = contexte(J);
    await assertSucceeds(getDoc(objet(db, J, 'o-abc')));
    // l'objet porte déjà modifieLe (écrit par le serveur) : un déplacement le renouvelle toujours, sinon il est refusé
    await assertFails(updateDoc(objet(db, J, 'o-abc'), { c: 6, l: 2 }));
    await assertSucceeds(updateDoc(objet(db, J, 'o-abc'), { c: 6, l: 2, modifieLe: serverTimestamp() }));
    await assertSucceeds(updateDoc(objet(db, J, 'o-abc'), { c: 7, modifieLe: serverTimestamp() }));
    const relu = (await getDoc(objet(db, J, 'o-abc'))).data();
    await assertSucceeds(setDoc(objet(db, J, 'o-abc'), { ...relu, c: 1, l: 1, modifieLe: serverTimestamp() })); // l'écran écrit le document entier
    for (const modif of [{ depuis: new Date('2026-11-20T10:00:00Z') }, { acheteLe: new Date() }, { sorte: 'enclos' }, { modele: 'arbre' }, { prix: 0 }, { c: 24 }, { l: deleteField() }, { c: 'deux' }]) {
      await assertFails(updateDoc(objet(db, J, 'o-abc'), modif));
    }
    await assertFails(updateDoc(objet(db, J, 'o-abc'), { c: 2, modifieLe: new Date('2020-01-01T00:00:00Z') }));
    await assertFails(deleteDoc(objet(db, J, 'o-abc')));
    for (const [id, d] of [['o-neuf', { sorte: 'decoration', modele: 'arbre', c: 1, l: 1 }], ['o-champ', { sorte: 'champ', c: 2, l: 2 }], ['o-enclos', { sorte: 'enclos', c: 3, l: 3 }], ['b-x', { sorte: 'champ', c: 1, l: 1 }]]) {
      await assertFails(setDoc(objet(db, J, id), d));
    }
    const charles = contexte(C);
    await assertFails(getDoc(objet(charles, J, 'o-abc')));
    await assertFails(updateDoc(objet(charles, J, 'o-abc'), { c: 3 }));
    await assertFails(deleteDoc(objet(charles, J, 'o-abc')));
  });

  test('6.R6 (6b) le déplacement écrit par l’écran (un lot avec update de c, l et modifieLe) passe ; un document entier sans modèle ni dates est refusé', async () => {
    const quand = new Date('2026-11-26T10:00:00Z');
    await semer(['village_utilisateurs', `uid-${J}`, 'batiments', 'o-deco'], { sorte: 'decoration', modele: 'arbre', c: 1, l: 1, acheteLe: quand, depuis: quand, modifieLe: quand });
    const db = contexte(J);
    const lot = writeBatch(db);
    lot.update(objet(db, J, 'o-deco'), { c: 5, l: 6, modifieLe: serverTimestamp() });
    await assertSucceeds(lot.commit());
    const relu = (await getDoc(objet(db, J, 'o-deco'))).data();
    assert.deepEqual([relu.c, relu.l, relu.modele], [5, 6, 'arbre']);
    assert.equal(relu.depuis.toMillis(), quand.getTime());
    // l'objet tel que l'écran le connaît juste après l'achat (réponse du serveur, sans dates) : un document entier les effacerait
    await assertFails(setDoc(objet(db, J, 'o-deco'), { sorte: 'decoration', modele: 'arbre', c: 2, l: 2, modifieLe: serverTimestamp() }));
    await assertFails(setDoc(objet(db, J, 'o-deco'), { sorte: 'decoration', c: 2, l: 2, acheteLe: quand, depuis: quand, modifieLe: serverTimestamp() }));
  });

  test('6.R5 les maisons de l’étape 3a n’ont pas bougé : une maison se crée, se modifie et se supprime ; elle ne devient jamais un objet acheté', async () => {
    const db = contexte(J);
    const BESOIN = { sorte: 'besoin', c: 2, l: 4, cache: false, nom: 'Mes factures' };
    await assertSucceeds(setDoc(objet(db, J, 'b-achatsfactures-liste'), BESOIN));
    await assertSucceeds(setDoc(objet(db, J, 'b-achatsfactures-liste'), { ...BESOIN, c: 6 }));
    await assertFails(setDoc(objet(db, J, 'b-achatsfactures-liste'), { ...BESOIN, sorte: 'champ' }));
    await assertFails(updateDoc(objet(db, J, 'b-achatsfactures-liste'), { sorte: 'champ' }));
    await assertSucceeds(deleteDoc(objet(db, J, 'b-achatsfactures-liste')));
  });
});
