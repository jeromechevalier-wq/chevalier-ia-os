// Test de l'accès réel à Firestore (SDK d'administration) contre l'ÉMULATEUR : le même scénario que lecture.test.js doit donner les mêmes
// résultats qu'avec les données en mémoire. Lancé par « npm test » (émulateurs) ; ignoré si l'émulateur n'est pas démarré.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerAccesFirestore, creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import * as lecture from '../functions/src/coeur/lecture.js';
import { collections, MAINTENANT } from './_donnees-essai.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-chevalier-ia-os';
const enTimestamps = (x) => (x instanceof Date ? Timestamp.fromDate(x) : Array.isArray(x) ? x.map(enTimestamps) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enTimestamps(v)])) : x);

describe('Accès Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app;
  let donnees;
  before(async () => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-lecture');
    const db = getFirestore(app);
    // Base propre puis jeu d'essai (jamais de données réelles).
    for (const nom of Object.keys(collections)) for (const d of (await db.collection(nom).get()).docs) await d.ref.delete();
    for (const [nom, docs] of Object.entries(collections)) for (const { id, ...reste } of docs) await db.collection(nom).doc(id).set(enTimestamps(reste));
    donnees = creerAccesFirestore({ db });
  });
  after(async () => { await deleteApp(app); });

  test('liste, document et filtre à égalité : mêmes documents que la mémoire', async () => {
    const memoire = creerAccesMemoire(collections);
    const cle = (liste) => liste.map((d) => d.id).sort();
    assert.deepEqual(cle(await donnees.liste('crm_affaires')), cle(await memoire.liste('crm_affaires')));
    assert.deepEqual(cle(await donnees.liste('crm_activites', { champ: 'personneId', valeur: 'p2' })), ['ac2', 'ac4']);
    assert.equal((await donnees.document('crm_personnes', 'p1')).nom, 'Camille Durand');
    assert.equal(await donnees.document('crm_personnes', 'inconnu'), null);
  });

  test('les outils de lecture donnent les mêmes réponses qu’avec la mémoire (Timestamp Firestore -> texte ISO compris)', async () => {
    const memoire = creerAccesMemoire(collections);
    const scenarios = [
      (d) => lecture.chercher(d, { texte: 'lilas' }),
      (d) => lecture.lirePersonne(d, { id: 'p1', avecFil: true }),
      (d) => lecture.lireAffaire(d, { id: 'a1', avecFil: true }),
      (d) => lecture.lireOrganisation(d, { id: 'org1' }),
      (d) => lecture.listerAffaires(d, { enRetard: true }, MAINTENANT),
      (d) => lecture.listerActivites(d, { fait: false }, MAINTENANT),
      (d) => lecture.listerDocuments(d, {}),
      (d) => lecture.lireReglages(d),
      (d) => lecture.lireAudit(d, {}),
    ];
    const trie = (x) => JSON.parse(JSON.stringify(x, (k, v) => (Array.isArray(v) && v.every((e) => e && typeof e === 'object' && 'id' in e) ? [...v].sort((a, b) => a.id.localeCompare(b.id)) : v)));
    for (const [i, sc] of scenarios.entries()) assert.deepEqual(trie(await sc(donnees)), trie(await sc(memoire)), `scénario ${i}`);
  });

  test('base vide : lire_reglages et lire_audit répondent sans erreur', async () => {
    const app2 = initializeApp({ projectId: 'demo-chevalier-vide' }, 'test-vide');
    try {
      const vide = creerAccesFirestore({ db: getFirestore(app2) });
      assert.equal((await lecture.lireAudit(vide, {})).total, 0);
    } catch (e) {
      assert.fail(String(e));
    } finally { await deleteApp(app2); }
  });
});
