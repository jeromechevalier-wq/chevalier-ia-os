// Tests A : règles de sécurité Firestore (émulateur, projet demo-chevalier-ia-os).
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, setLogLevel } from 'firebase/firestore';

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
const COLLECTIONS_AUTOMATISATIONS = ['automatisations_propositions', 'documents_stockes'];
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
