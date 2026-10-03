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

// Collections de l'appli : comportement identique à celui d'avant l'étape 4 (les 45 cas A1 à A5).
const COLLECTIONS = [
  'crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements',
  'crm_parametres', 'os_objectifs', 'os_objectifs_saisies',
];
// Collections du serveur MCP (étape 4) : sorties du joker.
const COLLECTIONS_SERVEUR = ['crm_audit', 'crm_audit_avant', 'mcp_limites'];
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
    for (const c of [...COLLECTIONS, ...COLLECTIONS_SERVEUR, 'crm_autre']) {
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

  // Étape 4 : le journal est lisible mais jamais modifiable depuis l'appli ; copies « avant » et compteurs sont fermés.
  for (const email of COMPTES) {
    test(`A6 ${email} lit le journal d'audit (document et liste) mais ne peut ni créer, ni modifier, ni supprimer`, async () => {
      const db = contexte(email);
      await assertSucceeds(getDoc(doc(db, 'crm_audit', 'existant')));
      await assertSucceeds(getDocs(collection(db, 'crm_audit')));
      await assertFails(setDoc(doc(db, 'crm_audit', 'nouveau'), { valeur: 2 }));
      await assertFails(updateDoc(doc(db, 'crm_audit', 'existant'), { valeur: 3 }));
      await assertFails(deleteDoc(doc(db, 'crm_audit', 'existant')));
    });
    for (const c of ['crm_audit_avant', 'mcp_limites']) {
      test(`A7 ${email} ne peut rien faire dans ${c} (lecture, liste, création, modification, suppression refusées)`, async () => {
        await aucunDroit(contexte(email), c);
      });
    }
    test(`A8 ${email} garde tous ses droits dans une collection inconnue (le joker reste en place pour le reste)`, async () => {
      await droitsComplets(contexte(email), 'crm_autre');
    });
  }

  test('A6 un autre compte, un compte non vérifié et un visiteur ne lisent pas le journal d’audit', async () => {
    await aucunDroit(contexte('quelquun.dautre@gmail.com'), 'crm_audit');
    await aucunDroit(contexte('jerome.chevalier@gmail.com', false), 'crm_audit');
    await aucunDroit(env.unauthenticatedContext().firestore(), 'crm_audit');
  });

  test('A7 les trois collections du serveur sont bien exclues du joker : aucun accès en écriture même pour un nouveau document ou une sous-collection', async () => {
    for (const email of COMPTES) {
      const db = contexte(email);
      for (const c of COLLECTIONS_SERVEUR) await assertFails(setDoc(doc(db, c, 'x', 'sous', 'y'), { valeur: 1 }));
    }
  });
});
