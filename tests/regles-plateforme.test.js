// Tests des règles de la plateforme clients (firestore.plateforme.rules) : appartenance par client, étanchéité entre clients.
// Émulateur, projet demo-chevalier-ia-os. Lancé après regles.test.js, jamais en parallèle (les règles chargées sont remplacées).
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, setLogLevel } from 'firebase/firestore';

setLogLevel('error');

const PROJET = 'demo-chevalier-ia-os';
const REGLES = readFileSync(fileURLToPath(new URL('../firestore.plateforme.rules', import.meta.url)), 'utf8');
const [hote, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

// Noms inventés. alice = éditrice chez A ; bob = éditeur chez B ; clara = membre de A et de B ; lea = lectrice chez A ; zoe = chez personne.
const ALICE = 'alice@exemple.test';
const BOB = 'bob@exemple.test';
const CLARA = 'clara@exemple.test';
const LEA = 'lea@exemple.test';
const ZOE = 'zoe@exemple.test';
const DONNEES = ['crm_personnes', 'crm_affaires', 'projets_projets'];

let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules: REGLES, host: hote, port: Number(port) } });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const membre = (client, email, role) => setDoc(doc(db, 'clients', client, 'membres', email), { role });
    await membre('a', ALICE, 'editeur');
    await membre('a', CLARA, 'editeur');
    await membre('a', LEA, 'lecteur');
    await membre('b', BOB, 'editeur');
    await membre('b', CLARA, 'lecteur');
    for (const client of ['a', 'b']) {
      for (const c of DONNEES) await setDoc(doc(db, 'clients', client, c, 'existant'), { valeur: 1 });
    }
    await setDoc(doc(db, 'crm_personnes', 'existant'), { valeur: 1 });
    await setDoc(doc(db, 'clients', 'a'), { nom: 'Client A' });
  });
});

const ctx = (email, verifie = true) => env.authenticatedContext(`uid-${email}`, { email, email_verified: verifie }).firestore();

async function droitsComplets(db, client, c) {
  await assertSucceeds(getDoc(doc(db, 'clients', client, c, 'existant')));
  await assertSucceeds(getDocs(collection(db, 'clients', client, c)));
  await assertSucceeds(setDoc(doc(db, 'clients', client, c, 'nouveau'), { valeur: 2 }));
  await assertSucceeds(updateDoc(doc(db, 'clients', client, c, 'existant'), { valeur: 3 }));
  await assertSucceeds(deleteDoc(doc(db, 'clients', client, c, 'existant')));
}
async function lectureSeule(db, client, c) {
  await assertSucceeds(getDoc(doc(db, 'clients', client, c, 'existant')));
  await assertSucceeds(getDocs(collection(db, 'clients', client, c)));
  await assertFails(setDoc(doc(db, 'clients', client, c, 'nouveau'), { valeur: 2 }));
  await assertFails(updateDoc(doc(db, 'clients', client, c, 'existant'), { valeur: 3 }));
  await assertFails(deleteDoc(doc(db, 'clients', client, c, 'existant')));
}
async function aucunDroit(db, client, c) {
  await assertFails(getDoc(doc(db, 'clients', client, c, 'existant')));
  await assertFails(getDocs(collection(db, 'clients', client, c)));
  await assertFails(setDoc(doc(db, 'clients', client, c, 'nouveau'), { valeur: 2 }));
  await assertFails(updateDoc(doc(db, 'clients', client, c, 'existant'), { valeur: 3 }));
  await assertFails(deleteDoc(doc(db, 'clients', client, c, 'existant')));
}

describe('P. Règles de la plateforme clients', () => {
  for (const c of DONNEES) {
    test(`P1 l'éditrice du client A lit et écrit chez A (${c})`, async () => { await droitsComplets(ctx(ALICE), 'a', c); });
    test(`P2 l'éditrice du client A est refusée chez B (${c})`, async () => { await aucunDroit(ctx(ALICE), 'b', c); });
    test(`P3 un non-membre est refusé chez A et chez B (${c})`, async () => {
      for (const client of ['a', 'b']) await aucunDroit(ctx(ZOE), client, c);
    });
    test(`P4 un visiteur non connecté est refusé partout (${c})`, async () => {
      const db = env.unauthenticatedContext().firestore();
      for (const client of ['a', 'b']) await aucunDroit(db, client, c);
    });
    test(`P5 un membre dont l'e-mail n'est pas vérifié est refusé (${c})`, async () => {
      await aucunDroit(ctx(ALICE, false), 'a', c);
    });
    test(`P6 la lectrice lit chez A mais n'écrit pas (${c})`, async () => { await lectureSeule(ctx(LEA), 'a', c); });
    test(`P7 le compte membre de A (éditeur) et de B (lecteur) : droits complets chez A, lecture seule chez B (${c})`, async () => {
      const db = ctx(CLARA);
      await droitsComplets(db, 'a', c);
      await lectureSeule(db, 'b', c);
    });
  }

  test('P8 un membre est refusé à la racine (collections du CRM) et sur la fiche du client lui-même', async () => {
    const db = ctx(ALICE);
    await assertFails(getDoc(doc(db, 'crm_personnes', 'existant')));
    await assertFails(getDocs(collection(db, 'crm_personnes')));
    await assertFails(setDoc(doc(db, 'crm_personnes', 'nouveau'), { valeur: 2 }));
    await assertFails(getDoc(doc(db, 'clients', 'a')));
    await assertFails(setDoc(doc(db, 'clients', 'a'), { nom: 'Autre' }));
    await assertFails(getDocs(collection(db, 'clients')));
    await assertFails(setDoc(doc(db, 'divers', 'x'), { valeur: 1 }));
  });

  test('P9 un membre lit sa propre fiche (et seulement la sienne) ; pas de liste des membres', async () => {
    const db = ctx(ALICE);
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'membres', ALICE)));
    await assertFails(getDoc(doc(db, 'clients', 'a', 'membres', CLARA)));
    await assertFails(getDocs(collection(db, 'clients', 'a', 'membres')));
    const chezB = await assertSucceeds(getDoc(doc(db, 'clients', 'b', 'membres', ALICE))); // sa fiche chez B n'existe pas : réponse « vide », rien de B n'est révélé
    assert.equal(chezB.exists(), false);
  });

  test('P10 un membre ne peut pas modifier la liste des membres : ni ajouter, ni changer un rôle, ni retirer', async () => {
    for (const email of [ALICE, LEA]) {
      const db = ctx(email);
      await assertFails(setDoc(doc(db, 'clients', 'a', 'membres', ZOE), { role: 'editeur' }));          // ajouter quelqu'un
      await assertFails(setDoc(doc(db, 'clients', 'a', 'membres', email), { role: 'editeur' }));        // se donner un rôle
      await assertFails(updateDoc(doc(db, 'clients', 'a', 'membres', email), { role: 'editeur' }));
      await assertFails(updateDoc(doc(db, 'clients', 'a', 'membres', CLARA), { role: 'lecteur' }));
      await assertFails(deleteDoc(doc(db, 'clients', 'a', 'membres', CLARA)));
      await assertFails(deleteDoc(doc(db, 'clients', 'a', 'membres', email)));
    }
  });

  test("P11 un non-membre ne peut pas s'ajouter comme membre, chez A ni chez un client qui n'existe pas encore", async () => {
    const db = ctx(ZOE);
    await assertFails(setDoc(doc(db, 'clients', 'a', 'membres', ZOE), { role: 'editeur' }));
    await assertFails(setDoc(doc(db, 'clients', 'nouveau', 'membres', ZOE), { role: 'editeur' }));
    await assertFails(setDoc(doc(db, 'clients', 'nouveau', 'crm_personnes', 'x'), { valeur: 1 }));
  });

  test("P12 un membre d'un client ne peut pas se faire passer pour un autre : la fiche lue est celle de son propre e-mail (casse ignorée)", async () => {
    const db = ctx('Alice@Exemple.Test');
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'crm_personnes', 'existant')));
    await assertFails(getDoc(doc(db, 'clients', 'b', 'crm_personnes', 'existant')));
  });

  test('P13 une fiche sans rôle connu ne donne aucun droit', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'clients', 'a', 'membres', ZOE), { role: 'administrateur' });
      await setDoc(doc(c.firestore(), 'clients', 'b', 'membres', ZOE), {});
    });
    await aucunDroit(ctx(ZOE), 'a', 'crm_personnes');
    await aucunDroit(ctx(ZOE), 'b', 'crm_personnes');
  });

  test('P14 sous-collections profondes : mêmes droits (A oui, B non)', async () => {
    const db = ctx(ALICE);
    await assertSucceeds(setDoc(doc(db, 'clients', 'a', 'automatisations', 'x', 'etapes', 'y'), { valeur: 1 }));
    await assertFails(setDoc(doc(db, 'clients', 'b', 'automatisations', 'x', 'etapes', 'y'), { valeur: 1 }));
    await assertFails(setDoc(doc(db, 'clients', 'a', 'membres', 'x', 'sous', 'y'), { valeur: 1 }));
  });
});
