// Tests des règles de la plateforme clients (firestore.plateforme.rules) : appartenance par client, étanchéité entre clients.
// Émulateur, projet demo-chevalier-ia-os. Lancé après regles.test.js, jamais en parallèle (les règles chargées sont remplacées).
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, setLogLevel, serverTimestamp, collectionGroup } from 'firebase/firestore';

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
const DONNEES = ['crm_personnes', 'crm_affaires', 'projets_projets', 'devis_parametres', 'reseauxsociaux_pistes'];
// Bordereau du module Devis : lu par les membres, créé et modifié par les éditeurs, jamais supprimé (un article se désactive).
const SANS_SUPPRESSION = ['devis_articles'];

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
      for (const c of [...DONNEES, ...SANS_SUPPRESSION]) await setDoc(doc(db, 'clients', client, c, 'existant'), { valeur: 1 });
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

  // B8 : le bordereau du module Devis
  async function droitsSansSuppression(db, client, c) {
    await assertSucceeds(getDoc(doc(db, 'clients', client, c, 'existant')));
    await assertSucceeds(getDocs(collection(db, 'clients', client, c)));
    await assertSucceeds(setDoc(doc(db, 'clients', client, c, 'nouveau'), { valeur: 2 }));
    await assertSucceeds(updateDoc(doc(db, 'clients', client, c, 'existant'), { valeur: 3 }));
    await assertFails(deleteDoc(doc(db, 'clients', client, c, 'existant')));
    await assertFails(deleteDoc(doc(db, 'clients', client, c, 'nouveau')));
  }
  for (const c of SANS_SUPPRESSION) {
    test(`B8 l'éditrice du client A lit, crée et modifie chez A (${c}) mais ne supprime jamais`, async () => { await droitsSansSuppression(ctx(ALICE), 'a', c); });
    test(`B8 l'éditrice du client A est refusée chez B, un non-membre et un visiteur partout (${c})`, async () => {
      await aucunDroit(ctx(ALICE), 'b', c);
      for (const client of ['a', 'b']) { await aucunDroit(ctx(ZOE), client, c); await aucunDroit(env.unauthenticatedContext().firestore(), client, c); }
      await aucunDroit(ctx(ALICE, false), 'a', c);
    });
    test(`B8 la lectrice lit chez A mais n'écrit pas (${c})`, async () => { await lectureSeule(ctx(LEA), 'a', c); });
    test(`B8 le compte membre de A (éditeur) et de B (lecteur) : lecture et écriture sans suppression chez A, lecture seule chez B (${c})`, async () => {
      await droitsSansSuppression(ctx(CLARA), 'a', c);
      await lectureSeule(ctx(CLARA), 'b', c);
    });
    test(`B8 une sous-collection du bordereau n'ouvre pas de suppression (${c})`, async () => {
      await assertFails(deleteDoc(doc(ctx(ALICE), 'clients', 'a', c, 'x', 'sous', 'y')));
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

// Fiches des fichiers de l'onglet « Documents » (28/10/2026) : lecture par les membres, écriture par le serveur seulement (même un éditeur ne peut pas y inscrire un chemin de son choix).
describe('K. Documents déposés : fiches en lecture seule pour tous les navigateurs', () => {
  const col = 'documents_stockes';
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      for (const client of ['a', 'b']) await setDoc(doc(db, 'clients', client, col, 'existant'), { valeur: 1 });
    });
  });
  test('K3 documents_stockes : un éditeur et un lecteur du client LISENT, aucun des deux n\'écrit (ni crée, ni modifie, ni supprime)', async () => {
    await lectureSeule(ctx(ALICE), 'a', col);
    await lectureSeule(ctx(LEA), 'a', col);
  });
  test('K3 documents_stockes : un membre d\'un autre client, un visiteur : ni lecture ni écriture', async () => {
    await aucunDroit(ctx(BOB), 'a', col);
    await aucunDroit(ctx(ZOE), 'a', col);
    await aucunDroit(env.unauthenticatedContext().firestore(), 'a', col);
  });
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
  test('J6 automatisations_propositions (file « À valider ») : un éditeur et un lecteur la LISENT, aucun navigateur n\'y écrit ; un autre client ou un visiteur n\'y a aucun droit', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'clients', 'a', 'automatisations_propositions', 'existant'), { valeur: 1 });
    });
    await lectureSeule(ctx(ALICE), 'a', 'automatisations_propositions');
    await lectureSeule(ctx(LEA), 'a', 'automatisations_propositions');
    await aucunDroit(ctx(BOB), 'a', 'automatisations_propositions');
    await aucunDroit(env.unauthenticatedContext().firestore(), 'a', 'automatisations_propositions');
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

// Module Rendez-vous (15/11/2026) : les SMS (rdv_messages) et la liste des désinscrits sont écrits par le SERVEUR seulement ; les réglages restent écrits par un éditeur.
describe('C3 Rendez-vous : règles de la plateforme clients', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      for (const client of ['a', 'b']) {
        await setDoc(doc(db, 'clients', client, 'rdv_messages', 'existant'), { valeur: 1 });
        await setDoc(doc(db, 'clients', client, 'rdv_parametres', 'reglages'), { valeur: 1 });
        await setDoc(doc(db, 'clients', client, 'rdv_parametres', 'desinscrits'), { numeros: ['+33600000000'] });
        await setDoc(doc(db, 'clients', client, 'rdv_rendezvous', 'existant'), { valeur: 1 });
      }
    });
  });
  test('C3 un éditeur et un lecteur LISENT rdv_messages ; aucun navigateur n\'y écrit', async () => {
    await lectureSeule(ctx(ALICE), 'a', 'rdv_messages');
    await lectureSeule(ctx(LEA), 'a', 'rdv_messages');
  });
  test('C3 un autre client, un compte sans espace et un visiteur n\'ont aucun droit sur rdv_messages', async () => {
    await aucunDroit(ctx(BOB), 'a', 'rdv_messages');
    await aucunDroit(ctx(ZOE), 'a', 'rdv_messages');
    await aucunDroit(env.unauthenticatedContext().firestore(), 'a', 'rdv_messages');
  });
  test('C3 un éditeur lit toute la collection rdv_parametres et écrit les réglages, jamais la liste des désinscrits', async () => {
    const db = ctx(ALICE);
    await assertSucceeds(getDocs(collection(db, 'clients', 'a', 'rdv_parametres')));
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'desinscrits')));
    await assertSucceeds(updateDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'reglages'), { valeur: 5 }));
    await assertSucceeds(setDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'reglages'), { valeur: 6 }));
    await assertFails(setDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'desinscrits'), { numeros: [] }));
    await assertFails(updateDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'desinscrits'), { numeros: [] }));
    await assertFails(deleteDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'desinscrits')));
  });
  test('C3 un lecteur lit rdv_parametres (réglages et désinscrits) mais n\'écrit rien', async () => {
    const db = ctx(LEA);
    await assertSucceeds(getDocs(collection(db, 'clients', 'a', 'rdv_parametres')));
    await assertFails(setDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'reglages'), { valeur: 5 }));
    await assertFails(updateDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'reglages'), { valeur: 5 }));
    await assertFails(deleteDoc(doc(db, 'clients', 'a', 'rdv_parametres', 'reglages')));
  });
  test('C3 clara (éditrice chez A, lectrice chez B) écrit les réglages chez A seulement', async () => {
    await assertSucceeds(updateDoc(doc(ctx(CLARA), 'clients', 'a', 'rdv_parametres', 'reglages'), { valeur: 5 }));
    await assertFails(updateDoc(doc(ctx(CLARA), 'clients', 'b', 'rdv_parametres', 'reglages'), { valeur: 5 }));
    await assertFails(updateDoc(doc(ctx(BOB), 'clients', 'a', 'rdv_parametres', 'reglages'), { valeur: 5 }));
  });
  test('C3 un éditeur garde tous ses droits sur les rendez-vous (le joker reste en place pour le reste)', async () => {
    await droitsComplets(ctx(ALICE), 'a', 'rdv_rendezvous');
  });
});

// Chantier 0 (25/11/2026) : la fiche reglages_maison (comptes, n8n, projet lié) existe aussi dans le projet de la plateforme ; aucune règle ne l'ouvre :
// elle tombe dans le refus par défaut (firestore.plateforme.rules n'est pas modifié), seul le SDK d'administration du serveur la lit.
describe('Chantier 0 : reglages_maison fermée au navigateur sur la plateforme', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      for (const id of ['maison', 'ecran', 'public']) await setDoc(doc(c.firestore(), 'reglages_maison', id), { comptes_autorises: ['admin@exemple.test'] });
    });
  });
  test('RM-P1 personne ne lit, ne liste ni n\'écrit reglages_maison (éditrice, lecteur, visiteur, compte cité dans la fiche)', async () => {
    for (const db of [ctx(ALICE), ctx(LEA), ctx('admin@exemple.test'), env.unauthenticatedContext().firestore()]) {
      for (const id of ['maison', 'ecran', 'public']) {
        await assertFails(getDoc(doc(db, 'reglages_maison', id)));
        await assertFails(setDoc(doc(db, 'reglages_maison', id), { comptes_autorises: ['intrus@exemple.test'] }));
        await assertFails(deleteDoc(doc(db, 'reglages_maison', id)));
      }
      await assertFails(getDocs(collection(db, 'reglages_maison')));
    }
  });
});

// Village par utilisateur sur la plateforme (27/11/2026) : mêmes contrôles que chez Jérôme, sous clients/<client>/village_utilisateurs/<uid>/batiments.
// Seul le compte lui-même, membre (éditeur ou lecteur) de ce client, lit et écrit ; exclu du joker des données du client.
describe('Village par utilisateur sur la plateforme (27/11/2026)', () => {
  const chemin = (db, client, email, id) => doc(db, 'clients', client, 'village_utilisateurs', `uid-${email}`, 'batiments', id);
  const liste = (db, client, email) => collection(db, 'clients', client, 'village_utilisateurs', `uid-${email}`, 'batiments');
  const hote = ['exemple', 'test'].join('.');
  const BESOIN = { sorte: 'besoin', c: 2, l: 4, cache: false, nom: 'Mes factures' };
  const LIEN = { sorte: 'lien', nom: 'Mon site', url: `https://${hote}/chemin?x=1#y`, batiment: 'phare', c: 0, l: 6 };
  const PETITE = { sorte: 'petite', parent: 'b-achatschantiers-liste', nom: 'Chantier Dupont', cible: '#/achatschantiers/liste/ch1' };

  test('P-V1 une éditrice et une lectrice écrivent, lisent, listent et suppriment chacune LEUR village', async () => {
    for (const email of [ALICE, LEA]) {
      const db = ctx(email);
      await assertSucceeds(setDoc(chemin(db, 'a', email, 'b-achatsfactures-liste'), { ...BESOIN, modifieLe: serverTimestamp() }));
      await assertSucceeds(setDoc(chemin(db, 'a', email, 'l-abc123'), LIEN));
      await assertSucceeds(setDoc(chemin(db, 'a', email, 'p-xyz-9'), PETITE));
      await assertSucceeds(getDoc(chemin(db, 'a', email, 'l-abc123')));
      const tous = await assertSucceeds(getDocs(liste(db, 'a', email)));
      assert.equal(tous.size, 3);
      await assertSucceeds(updateDoc(chemin(db, 'a', email, 'b-achatsfactures-liste'), { c: 5, modifieLe: serverTimestamp() }));
      await assertSucceeds(deleteDoc(chemin(db, 'a', email, 'p-xyz-9')));
    }
  });

  test('P-V2 aucun autre membre, ni membre d’un autre client, ni non-membre ; rien sous un client dont on n’est pas membre', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(chemin(c.firestore(), 'a', ALICE, 'b-x'), BESOIN); });
    for (const email of [CLARA, LEA, BOB, ZOE]) {
      const db = ctx(email);
      await assertFails(getDoc(chemin(db, 'a', ALICE, 'b-x')));
      await assertFails(getDocs(liste(db, 'a', ALICE)));
      await assertFails(setDoc(chemin(db, 'a', ALICE, 'b-y'), BESOIN));
      await assertFails(setDoc(chemin(db, 'a', ALICE, 'b-x'), BESOIN));
      await assertFails(deleteDoc(chemin(db, 'a', ALICE, 'b-x')));
    }
    await assertFails(setDoc(chemin(ctx(ZOE), 'a', ZOE, 'b-x'), BESOIN)); // membre de rien, même sous son propre identifiant
    await assertFails(getDocs(liste(ctx(ZOE), 'a', ZOE)));
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'clients', 'a', 'membres', 'max@exemple.test'), { role: 'invite' }); });
    await assertFails(setDoc(chemin(ctx('max@exemple.test'), 'a', 'max@exemple.test', 'b-x'), BESOIN)); // rôle inconnu, même sous son propre identifiant
    await assertFails(updateDoc(chemin(ctx(CLARA), 'a', ALICE, 'b-x'), { c: 7 })); // un autre membre éditeur ne modifie pas le village d'alice
    await assertFails(getDocs(collectionGroup(ctx(ALICE), 'batiments'))); // aucune lecture de tous les villages d'un coup
    await assertFails(setDoc(chemin(ctx(ALICE), 'b', ALICE, 'b-x'), BESOIN)); // alice n'est pas membre du client b
    await assertFails(getDocs(liste(ctx(ALICE), 'b', ALICE)));
    await assertSucceeds(setDoc(chemin(ctx(CLARA), 'b', CLARA, 'b-x'), BESOIN)); // clara, lectrice chez b, y a son village
    await assertFails(getDoc(chemin(ctx(ALICE, false), 'a', ALICE, 'b-x'))); // e-mail non vérifié
    const visiteur = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(chemin(visiteur, 'a', ALICE, 'b-x')));
    await assertFails(setDoc(chemin(visiteur, 'a', ALICE, 'b-z'), BESOIN));
  });

  test('P-V3 champs invalides refusés un par un (sorte, champ en trop, place, nom, cache, identifiant, heure, petite maison)', async () => {
    const db = ctx(ALICE);
    const refus = [
      ['b-a', { ...BESOIN, sorte: 'chateau' }], ['b-a', { ...BESOIN, couleur: 'rouge' }], ['b-a', { sorte: 'besoin', c: 3 }],
      ['b-a', { ...BESOIN, c: -1 }], ['b-a', { ...BESOIN, c: 24 }], ['b-a', { ...BESOIN, l: 1.5 }], ['b-a', { ...BESOIN, c: '3' }],
      ['b-a', { ...BESOIN, nom: '' }], ['b-a', { ...BESOIN, nom: 'N'.repeat(41) }], ['b-a', { ...BESOIN, nom: 12 }],
      ['b-a', { ...BESOIN, cache: 'oui' }], ['l-a', BESOIN], ['p-a', BESOIN], ['b-a', LIEN], ['b-Majuscule', BESOIN],
      ['b-a', { ...BESOIN, modifieLe: new Date('2026-01-01T00:00:00Z') }], ['b-a', {}],
      ['p-a', { ...PETITE, cible: `https://${hote}` }], ['p-a', { ...PETITE, parent: 'l-abc' }],
    ];
    for (const [id, d] of refus) await assertFails(setDoc(chemin(db, 'a', ALICE, id), d));
    await assertSucceeds(setDoc(chemin(db, 'a', ALICE, 'b-a'), { ...BESOIN, c: 23, l: 0, nom: 'N'.repeat(40) }));
  });

  test('P-V4 lien : https seulement (adresses refusées écrites en morceaux)', async () => {
    const db = ctx(ALICE);
    const p = (s) => s.join(':');
    for (const url of [`${p(['http', ''])}//${hote}/`, p(['javascript', 'alert(1)']), `//${hote}`, `${p(['ftp', ''])}//${hote}/`, `https://moi${'@'}${hote}/`, 'https://', `https://${hote}/a b`]) {
      await assertFails(setDoc(chemin(db, 'a', ALICE, 'l-a'), { ...LIEN, url }));
    }
    await assertSucceeds(setDoc(chemin(db, 'a', ALICE, 'l-a'), LIEN));
  });

  test('P-V5 le parent (portefeuille d’or, étape 6a) se lit par son propriétaire seulement et ne s’écrit jamais ; toute autre sous-collection reste fermée : le joker ne couvre plus le village', async () => {
    const db = ctx(ALICE);
    await assertFails(setDoc(doc(db, 'clients', 'a', 'village_utilisateurs', `uid-${ALICE}`), { x: 1 }));
    await assertSucceeds(getDoc(doc(db, 'clients', 'a', 'village_utilisateurs', `uid-${ALICE}`))); // 6a : son portefeuille (détail en P-V6)
    await assertFails(setDoc(doc(db, 'clients', 'a', 'village_utilisateurs', `uid-${ALICE}`, 'autre', 'x'), { x: 1 }));
    await assertFails(getDoc(doc(db, 'clients', 'a', 'village_utilisateurs', `uid-${ALICE}`, 'autre', 'x')));
    await assertFails(getDocs(collection(db, 'clients', 'a', 'village_utilisateurs')));
    await assertFails(setDoc(doc(db, 'clients', 'a', 'village_utilisateurs', 'nimporte'), { x: 1 })); // l'éditrice n'y écrit plus par le joker
  });

  test('P-V6 or du village : le propriétaire lit son portefeuille, un autre non ; personne ne l’écrit ; le registre des gains est fermé à tous, même à l’éditrice', async () => {
    const porte = (db, client, email) => doc(db, 'clients', client, 'village_utilisateurs', `uid-${email}`);
    const gain = (db, client, cle) => doc(db, 'clients', client, 'village_gains', cle);
    await env.withSecurityRulesDisabled(async (c) => {
      for (const email of [ALICE, LEA]) await setDoc(porte(c.firestore(), 'a', email), { or: 120, gagne: 120, parcelles: 0, version: 3 });
      await setDoc(gain(c.firestore(), 'a', 'ds.d1'), { uid: `uid-${ALICE}`, source: 'devis-signe', pieces: 50 });
    });
    // Le propriétaire (éditrice ou lectrice) lit le sien.
    for (const email of [ALICE, LEA]) {
      const lu = await assertSucceeds(getDoc(porte(ctx(email), 'a', email)));
      assert.equal(lu.get('or'), 120);
    }
    // Un autre membre (éditeur ou lecteur), un membre d'un autre client, un non-membre, un visiteur : non. Aucune liste de tous les portefeuilles.
    for (const email of [CLARA, LEA, BOB, ZOE]) await assertFails(getDoc(porte(ctx(email), 'a', ALICE)));
    await assertFails(getDoc(porte(ctx(ALICE, false), 'a', ALICE))); // e-mail non vérifié
    await assertFails(getDoc(porte(env.unauthenticatedContext().firestore(), 'a', ALICE)));
    await assertFails(getDocs(collection(ctx(ALICE), 'clients', 'a', 'village_utilisateurs')));
    await assertFails(getDoc(porte(ctx(ALICE), 'b', ALICE))); // pas membre du client b
    // Personne n'écrit un portefeuille, pas même le sien (or, version, parcelles) : seule la fonction villageOr le fait.
    for (const email of [ALICE, LEA]) {
      const db = ctx(email);
      await assertFails(setDoc(porte(db, 'a', email), { or: 99999, gagne: 99999, parcelles: 0, version: 99 }));
      await assertFails(updateDoc(porte(db, 'a', email), { or: 99999 }));
      await assertFails(setDoc(porte(db, 'a', email), { version: 99 }, { merge: true }));
      await assertFails(deleteDoc(porte(db, 'a', email)));
    }
    await assertFails(setDoc(porte(ctx(ZOE), 'a', ZOE), { or: 1 }));
    // Registre des gains : ni lu, ni listé, ni créé, ni modifié, ni supprimé, même par l'éditrice qui a gagné.
    for (const email of [ALICE, LEA, CLARA, ZOE]) {
      const db = ctx(email);
      await assertFails(getDoc(gain(db, 'a', 'ds.d1')));
      await assertFails(getDocs(collection(db, 'clients', 'a', 'village_gains')));
      await assertFails(setDoc(gain(db, 'a', 'ds.d2'), { uid: `uid-${email}`, source: 'devis-signe', pieces: 50 }));
      await assertFails(updateDoc(gain(db, 'a', 'ds.d1'), { pieces: 500 }));
      await assertFails(deleteDoc(gain(db, 'a', 'ds.d1')));
    }
    // Les valeurs n'ont pas bougé.
    await env.withSecurityRulesDisabled(async (c) => {
      assert.equal((await getDoc(porte(c.firestore(), 'a', ALICE))).get('or'), 120);
      assert.equal((await getDoc(gain(c.firestore(), 'a', 'ds.d1'))).get('pieces'), 50);
    });
  });

  test('P-V7 (6b) objet acheté chez le client a : l’éditrice et la lectrice déplacent le leur (c, l) ; tout le reste est refusé ; un autre membre, un autre client : rien', async () => {
    const quand = new Date('2026-11-26T10:00:00Z');
    const OBJET = { sorte: 'decoration', modele: 'arbre', c: 4, l: 4, depuis: quand, acheteLe: quand };
    await env.withSecurityRulesDisabled(async (c) => {
      for (const email of [ALICE, LEA]) await setDoc(chemin(c.firestore(), 'a', email, 'o-abc'), OBJET);
    });
    for (const email of [ALICE, LEA]) {
      const db = ctx(email);
      await assertSucceeds(getDoc(chemin(db, 'a', email, 'o-abc')));
      await assertSucceeds(updateDoc(chemin(db, 'a', email, 'o-abc'), { c: 6, l: 2 }));
      await assertSucceeds(updateDoc(chemin(db, 'a', email, 'o-abc'), { c: 7, modifieLe: serverTimestamp() }));
      for (const modif of [{ depuis: new Date('2026-11-20T10:00:00Z') }, { acheteLe: new Date() }, { sorte: 'enclos' }, { modele: 'banc' }, { prix: 0 }, { c: 24 }, { c: 'deux' }]) {
        await assertFails(updateDoc(chemin(db, 'a', email, 'o-abc'), modif));
      }
      await assertFails(updateDoc(chemin(db, 'a', email, 'o-abc'), { c: 2, modifieLe: new Date('2020-01-01T00:00:00Z') }));
      await assertFails(deleteDoc(chemin(db, 'a', email, 'o-abc')));
      for (const [id, d] of [['o-neuf', { sorte: 'decoration', modele: 'arbre', c: 1, l: 1 }], ['o-champ', { sorte: 'champ', c: 2, l: 2 }], ['o-enclos', { sorte: 'enclos', c: 3, l: 3 }], ['b-x', { sorte: 'champ', c: 1, l: 1 }]]) {
        await assertFails(setDoc(chemin(db, 'a', email, id), d));
      }
    }
    for (const email of [CLARA, BOB, ZOE]) {
      const db = ctx(email);
      await assertFails(getDoc(chemin(db, 'a', ALICE, 'o-abc')));
      await assertFails(updateDoc(chemin(db, 'a', ALICE, 'o-abc'), { c: 3 }));
      await assertFails(deleteDoc(chemin(db, 'a', ALICE, 'o-abc')));
    }
    await assertFails(updateDoc(chemin(ctx(ALICE), 'b', ALICE, 'o-abc'), { c: 3 })); // pas membre du client b
    await env.withSecurityRulesDisabled(async (c) => {
      const lu = (await getDoc(chemin(c.firestore(), 'a', ALICE, 'o-abc'))).data();
      assert.deepEqual([lu.c, lu.l, lu.modele, lu.sorte], [7, 2, 'arbre', 'decoration']);
    });
  });

  test('P-V8 (6b) une maison b-… se supprime toujours ; elle ne devient jamais un objet acheté', async () => {
    const db = ctx(ALICE);
    await assertSucceeds(setDoc(chemin(db, 'a', ALICE, 'b-achatsfactures-liste'), BESOIN));
    await assertFails(setDoc(chemin(db, 'a', ALICE, 'b-achatsfactures-liste'), { ...BESOIN, sorte: 'decoration' }));
    await assertFails(updateDoc(chemin(db, 'a', ALICE, 'b-achatsfactures-liste'), { sorte: 'champ' }));
    await assertSucceeds(setDoc(chemin(db, 'a', ALICE, 'b-achatsfactures-liste'), { ...BESOIN, c: 6 }));
    await assertSucceeds(deleteDoc(chemin(db, 'a', ALICE, 'b-achatsfactures-liste')));
  });
});
