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
    await setDoc(doc(db, 'clients', 'a'), { nom: 'Client A', modules: { affaires: true, projets: false } });
    await setDoc(doc(db, 'clients', 'b'), { nom: 'Client B', modules: { affaires: true, projets: true } });
    await setDoc(doc(db, 'marques', 'a'), { actif: true, nom: 'Client A', couleur: '#336699' });
    await setDoc(doc(db, 'marques', 'b'), { actif: true, nom: 'Client B', couleur: '#993366' });
    await setDoc(doc(db, 'marques', 'dormant'), { actif: false, nom: 'Client dormant' });
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

  test('P8 un membre est refusé à la racine (collections du CRM) ; la fiche de son client se lit mais ne s\'écrit pas (chantier 7)', async () => {
    const db = ctx(ALICE);
    await assertFails(getDoc(doc(db, 'crm_personnes', 'existant')));
    await assertFails(getDocs(collection(db, 'crm_personnes')));
    await assertFails(setDoc(doc(db, 'crm_personnes', 'nouveau'), { valeur: 2 }));
    await assertSucceeds(getDoc(doc(db, 'clients', 'a')));
    await assertFails(setDoc(doc(db, 'clients', 'a'), { nom: 'Autre' }));
    await assertFails(getDocs(collection(db, 'clients')));
    await assertFails(setDoc(doc(db, 'divers', 'x'), { valeur: 1 }));
  });

  test('P9 un membre lit les fiches de membres de SON client (liste comprise), jamais celles d\'un autre client', async () => {
    const db = ctx(ALICE);
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'membres', ALICE)));
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'membres', CLARA)));
    const liste = await assertSucceeds(getDocs(collection(db, 'clients', 'a', 'membres')));
    assert.equal(liste.size, 3); // alice, clara, lea : ceux de A seulement
    await assertSucceeds(getDocs(collection(ctx(LEA), 'clients', 'a', 'membres'))); // un lecteur aussi
    await assertFails(getDoc(doc(db, 'clients', 'b', 'membres', BOB)));
    await assertFails(getDocs(collection(db, 'clients', 'b', 'membres')));
    const chezB = await assertSucceeds(getDoc(doc(db, 'clients', 'b', 'membres', ALICE))); // sa propre fiche chez B n'existe pas : réponse « vide », rien de B n'est révélé
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

  // ---- Modules actifs d'un client (chantier 7) : champ « modules » du document clients/<client>.
  describe('modules actifs (clients/<client>)', () => {
    const fiche = (db, client) => getDoc(doc(db, 'clients', client));
    const ecritures = (db, client) => [
      () => setDoc(doc(db, 'clients', client), { modules: { affaires: true, projets: true } }),
      () => setDoc(doc(db, 'clients', client), { modules: { projets: true } }, { merge: true }),
      () => updateDoc(doc(db, 'clients', client), { modules: { affaires: true, projets: true } }),
      () => updateDoc(doc(db, 'clients', client), { 'modules.projets': true }),
      () => deleteDoc(doc(db, 'clients', client)),
    ];

    test('Q1 un éditeur lit les modules actifs de SON client', async () => {
      const f = await assertSucceeds(fiche(ctx(ALICE), 'a'));
      assert.deepEqual(f.data().modules, { affaires: true, projets: false });
    });
    test('Q2 un lecteur lit aussi les modules de son client', async () => {
      const f = await assertSucceeds(fiche(ctx(LEA), 'a'));
      assert.deepEqual(f.data().modules, { affaires: true, projets: false });
    });
    test('Q3 jamais d\'écriture depuis un navigateur : ni éditeur, ni lecteur (créer, modifier, activer un module, supprimer)', async () => {
      for (const email of [ALICE, LEA, CLARA]) {
        for (const ecrire of ecritures(ctx(email), 'a')) await assertFails(ecrire());
      }
      await env.withSecurityRulesDisabled(async (c) => {
        const f = await getDoc(doc(c.firestore(), 'clients', 'a'));
        assert.deepEqual(f.data().modules, { affaires: true, projets: false }); // rien n'a bougé
      });
    });
    test('Q4 un membre d\'un autre client ne lit pas les modules de ce client (et ne les écrit pas)', async () => {
      await assertFails(fiche(ctx(BOB), 'a'));
      await assertFails(fiche(ctx(ALICE), 'b'));
      for (const ecrire of ecritures(ctx(BOB), 'a')) await assertFails(ecrire());
      for (const ecrire of ecritures(ctx(ALICE), 'b')) await assertFails(ecrire());
    });
    test('Q5 un compte sans client, un e-mail non vérifié, un visiteur sans connexion : rien', async () => {
      for (const db of [ctx(ZOE), ctx(ALICE, false), env.unauthenticatedContext().firestore()]) {
        await assertFails(fiche(db, 'a'));
        await assertFails(fiche(db, 'b'));
        for (const ecrire of ecritures(db, 'a')) await assertFails(ecrire());
      }
    });
    test('Q6 pas de liste des clients (ni pour un membre) ; un membre de deux clients lit les deux, chacun avec ses modules', async () => {
      await assertFails(getDocs(collection(ctx(ALICE), 'clients')));
      const a = await assertSucceeds(fiche(ctx(CLARA), 'a'));
      const b = await assertSucceeds(fiche(ctx(CLARA), 'b'));
      assert.equal(a.data().modules.projets, false);
      assert.equal(b.data().modules.projets, true);
    });
    test('Q7 un client sans document : la lecture passe pour un membre (document absent = aucun module), refusée pour les autres', async () => {
      await env.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'clients', 'sans-fiche', 'membres', ALICE), { role: 'editeur' });
      });
      const f = await assertSucceeds(fiche(ctx(ALICE), 'sans-fiche'));
      assert.equal(f.exists(), false);
      await assertFails(fiche(ctx(BOB), 'sans-fiche'));
    });
    test('Q8 la lecture de la fiche ne change rien aux autres droits : la liste des membres d\'un autre client reste fermée, la racine aussi', async () => {
      const db = ctx(ALICE);
      await assertFails(getDocs(collection(db, 'clients', 'b', 'membres')));
      await assertFails(getDoc(doc(db, 'clients', 'b', 'membres', BOB)));
      await assertFails(getDoc(doc(db, 'crm_personnes', 'existant')));
      await assertFails(setDoc(doc(db, 'clients', 'a', 'membres', ALICE), { role: 'editeur', modules: {} }));
    });
  });

  // ---- Fiche de marque (chantier 5) : publique en lecture d'un document précis, jamais en liste, jamais en écriture.
  describe('fiche de marque (marques/<client>)', () => {
    const profils = () => [['visiteur sans connexion', env.unauthenticatedContext().firestore()], ['membre de A', ctx(ALICE)], ['compte sans client', ctx(ZOE)], ['e-mail non vérifié', ctx(ALICE, false)]];

    test('M1 une fiche active se lit sans connexion (et avec n\'importe quel compte)', async () => {
      for (const [, db] of profils()) {
        const f = await assertSucceeds(getDoc(doc(db, 'marques', 'a')));
        assert.equal(f.data().nom, 'Client A');
      }
    });
    test('M2 aucune liste : on ne peut pas énumérer les clients', async () => {
      for (const [, db] of profils()) await assertFails(getDocs(collection(db, 'marques')));
    });
    test('M3 aucune écriture depuis un navigateur : ni créer, ni modifier, ni supprimer (même un membre du client)', async () => {
      for (const [, db] of profils()) {
        await assertFails(setDoc(doc(db, 'marques', 'a'), { actif: true, nom: 'Pirate' }));
        await assertFails(setDoc(doc(db, 'marques', 'nouveau'), { actif: true, nom: 'Nouveau' }));
        await assertFails(updateDoc(doc(db, 'marques', 'a'), { nom: 'Pirate' }));
        await assertFails(deleteDoc(doc(db, 'marques', 'a')));
      }
    });
    test('M4 une fiche inactive et une fiche absente sont refusées de la même façon (on ne devine pas quels clients existent)', async () => {
      const db = env.unauthenticatedContext().firestore();
      const refus = async (id) => {
        try { await getDoc(doc(db, 'marques', id)); return 'lu'; } catch (e) { return e.code; }
      };
      assert.equal(await refus('dormant'), 'permission-denied');
      assert.equal(await refus('inconnu'), 'permission-denied');
    });
    test('M5 pas de fuite : sans connexion, ni membres, ni données, ni fiche du client lui-même', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'clients', 'a', 'membres', ALICE)));
      await assertFails(getDocs(collection(db, 'clients', 'a', 'membres')));
      await assertFails(getDoc(doc(db, 'clients', 'a')));
      for (const c of DONNEES) await assertFails(getDoc(doc(db, 'clients', 'a', c, 'existant')));
      await assertFails(getDoc(doc(db, 'crm_personnes', 'existant')));
    });
    test('M6 les fiches de marque ne donnent aucun droit sur les données : un membre de A reste sans accès à B', async () => {
      await aucunDroit(ctx(ALICE), 'b', 'crm_personnes');
      await assertFails(getDoc(doc(ctx(ALICE), 'clients', 'b', 'membres', BOB)));
    });
    test('M7 sous-collection d\'une fiche : refusée', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'marques', 'a', 'prive', 'x')));
      await assertFails(setDoc(doc(db, 'marques', 'a', 'prive', 'x'), { v: 1 }));
    });
  });
});

// Tableau de bord : lecture par les membres, écriture par le serveur seulement (même un éditeur ne peut pas se fabriquer un « vert »).
describe('K. Tableau de bord : lecture seule pour tous les navigateurs', () => {
  const TABLEAU = ['tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes'];
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      for (const client of ['a', 'b']) for (const col of TABLEAU) await setDoc(doc(db, 'clients', client, col, 'existant'), { valeur: 1 });
    });
  });
  for (const col of TABLEAU) {
    test(`K1 ${col} : un éditeur et un lecteur du client LISENT, aucun des deux n'écrit (ni crée, ni modifie, ni supprime)`, async () => {
      await lectureSeule(ctx(ALICE), 'a', col);
      await lectureSeule(ctx(LEA), 'a', col);
    });
    test(`K2 ${col} : un membre d'un autre client, un visiteur : ni lecture ni écriture`, async () => {
      await aucunDroit(ctx(BOB), 'a', col);
      await aucunDroit(ctx(ZOE), 'a', col);
      await aucunDroit(env.unauthenticatedContext().firestore(), 'a', col);
    });
  }
});

// Journal d'activité des workflows (chantier 14) : lecture par les membres, écriture par le serveur seulement.
describe('J. Journal des workflows : lecture seule pour tous les navigateurs', () => {
  const JOURNAL = ['workflows', 'executions', 'sync'];
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      for (const client of ['a', 'b']) {
        for (const col of JOURNAL) await setDoc(doc(db, 'clients', client, col, 'existant'), { valeur: 1 });
        await setDoc(doc(db, 'clients', client, 'executions', 'existant', 'steps', 's1'), { valeur: 1 });
      }
    });
  });
  for (const col of JOURNAL) {
    test(`J1 ${col} : un éditeur et un lecteur du client LISENT, aucun des deux n'écrit (ni crée, ni modifie, ni supprime)`, async () => {
      await lectureSeule(ctx(ALICE), 'a', col); // éditrice
      await lectureSeule(ctx(LEA), 'a', col); // lectrice
    });
    test(`J2 ${col} : un membre d'un autre client ne lit rien et n'écrit rien`, async () => {
      await aucunDroit(ctx(BOB), 'a', col);
      await aucunDroit(ctx(ZOE), 'a', col);
      await aucunDroit(env.unauthenticatedContext().firestore(), 'a', col);
    });
  }
  test('J3 les étapes (sous-collection steps) suivent la même règle : lecture oui, écriture non', async () => {
    const db = ctx(ALICE);
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'executions', 'existant', 'steps', 's1')));
    await assertFails(setDoc(doc(db, 'clients', 'a', 'executions', 'existant', 'steps', 's2'), { valeur: 2 }));
    await assertFails(deleteDoc(doc(db, 'clients', 'a', 'executions', 'existant', 'steps', 's1')));
    await assertFails(getDoc(doc(ctx(BOB), 'clients', 'a', 'executions', 'existant', 'steps', 's1')));
  });
  test('J4 clara (éditrice chez A, lectrice chez B) lit les deux journaux et écrit dans aucun', async () => {
    await lectureSeule(ctx(CLARA), 'a', 'executions');
    await lectureSeule(ctx(CLARA), 'b', 'executions');
  });
  test('J5 le libellé d\'un workflow ne se change pas depuis un navigateur : seule la fonction « renommer » (serveur) le peut', async () => {
    await assertFails(updateDoc(doc(ctx(ALICE), 'clients', 'a', 'workflows', 'existant'), { libelle: 'Mon nom' }));
  });
  test('J6 les autres collections de l\'éditeur ne changent pas (il écrit toujours ses données métier)', async () => {
    await droitsComplets(ctx(ALICE), 'a', 'crm_personnes');
  });
});
