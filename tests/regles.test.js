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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, setLogLevel } from 'firebase/firestore';
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
