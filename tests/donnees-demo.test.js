// Tests de l'outil « données de démonstration » (scripts/plateforme/donnees-demo.js). ÉMULATEUR Firestore seulement (projet demo-chevalier-ia-os) :
// jamais la vraie base. Lancé avec la série « outil-client » (npm run test:module donnees-demo). Catalogue : uniquement le catalogue FICTIF intégré.
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { createRequire } from 'node:module';
import { executerDonneesDemo, CATALOGUE_EXEMPLE, COLLECTIONS_DEMO, MARQUEUR } from '../scripts/plateforme/donnees-demo.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';
import * as D from '../js/modules/devis/logique.js';
import * as L from '../js/modules/crm/logique.js';

const { getApps, initializeApp } = createRequire(new URL('../scripts/plateforme/package.json', import.meta.url))('firebase-admin/app');
const { getFirestore } = createRequire(new URL('../scripts/plateforme/package.json', import.meta.url))('firebase-admin/firestore');

const CLIENT = 'demo-essai';
const AUTRE = 'demo-autre';
const SOURCE = 'demo-source-catalogue';
const MAINTENANT = new Date('2026-10-26T10:00:00Z');
let db;

async function lancer(argv, extra = {}) {
  const lignes = [];
  const code = await executerDonneesDemo(argv, { out: (l = '') => lignes.push(l), env: process.env, maintenant: MAINTENANT, ...extra });
  return { code, texte: lignes.join('\n') };
}
async function photo(prefixe = 'clients') {
  const docs = [];
  const marcher = async (ref) => {
    const s = await ref.get();
    if (s.exists) docs.push([ref.path, JSON.stringify(s.data())]);
    for (const c of await ref.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
  };
  for (const r of await db.collection(prefixe).listDocuments()) await marcher(r);
  return docs.sort();
}
const tous = async (client, c) => (await db.collection(`clients/${client}/${c}`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
const versDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v);

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  db = ouvrir(cible({}, process.env)).db;
  for (const c of [CLIENT, AUTRE]) {
    await db.doc(`clients/${c}`).set({ demo: true, nom: `Client ${c}`, modules: { affaires: true, projets: true, devis: true } });
    await db.doc(`clients/${c}/membres/alice@exemple.test`).set({ role: 'editeur' });
  }
  await db.doc(`clients/${AUTRE}/crm_affaires/reelle`).set({ titre: 'Affaire réelle', etape: 'etape_1', statut: 'ouverte' });
});

test('1. Sans --ecrire, la simulation affiche le plan et n\'écrit rien', async () => {
  const avant = await photo();
  const r = await lancer([CLIENT, '--catalogue-exemple']);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /SIMULATION : rien n'a été écrit/);
  assert.match(r.texte, /Devis : 15/);
  assert.deepEqual(await photo(), avant);
});

test('2. Refuse le CRM de Jérôme et tout autre projet que celui des clients', async () => {
  const r1 = await lancer([CLIENT, '--catalogue-exemple', '--ecrire'], { env: { ...process.env, GCLOUD_PROJECT: 'chevalier-ia-os' } });
  assert.equal(r1.code, 1);
  assert.match(r1.texte, /CRM de Jérôme|refusé/);
  // Hors émulateur, un autre projet est refusé AVANT toute connexion.
  const r2 = await lancer([CLIENT, '--catalogue-exemple'], { env: { GCLOUD_PROJECT: 'un-autre-projet' } });
  assert.equal(r2.code, 1);
  assert.match(r2.texte, /un-autre-projet» refusé|« un-autre-projet » refusé/);
});

test('3. Refuse un client sans fiche, et une commande sans catalogue', async () => {
  const r = await lancer(['inconnu', '--catalogue-exemple', '--ecrire']);
  assert.equal(r.code, 1);
  assert.match(r.texte, /n'existe pas/);
  assert.equal((await db.collection('clients/inconnu/crm_affaires').get()).size, 0);
  const r2 = await lancer([CLIENT]);
  assert.equal(r2.code, 1);
  assert.match(r2.texte, /--catalogue-depuis/);
});

test('4. --ecrire : tout est marqué, les devis sont valides, numéros et dates cohérents', async () => {
  const autreAvant = await photo();
  const r = await lancer([CLIENT, '--catalogue-exemple', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  for (const c of COLLECTIONS_DEMO) for (const d of await tous(CLIENT, c)) assert.equal(d[MARQUEUR], true, `${c}/${d.id} sans marqueur`);
  assert.equal((await tous(CLIENT, 'crm_organisations')).length, 15);
  assert.equal((await tous(CLIENT, 'crm_personnes')).length, 20);
  assert.equal((await tous(CLIENT, 'devis_articles')).length, CATALOGUE_EXEMPLE.length);
  // L'autre client n'a pas changé.
  assert.deepEqual((await photo()).filter(([p]) => p.startsWith(`clients/${AUTRE}`)), autreAvant.filter(([p]) => p.startsWith(`clients/${AUTRE}`)));

  // Affaires : au moins 2 par étape active.
  const config = L.construireConfig({}, { racine: false, membres: [] });
  const affaires = await tous(CLIENT, 'crm_affaires');
  for (const e of L.etapesActives(config)) assert.ok(affaires.filter((a) => a.etape === e.id).length >= 2, `étape ${e.id}`);
  // Projets : 2 par phase active.
  const projets = await tous(CLIENT, 'projets_projets');
  for (const ph of config.phases.filter((x) => x.actif)) assert.equal(projets.filter((p) => p.phase === ph.id).length, 2, `phase ${ph.id}`);
  // Fiches : 2 à 6 éléments (notes, activités, documents) par affaire.
  const notes = await tous(CLIENT, 'crm_notes');
  const activites = await tous(CLIENT, 'crm_activites');
  for (const a of affaires) {
    const n = notes.filter((x) => x.affaireId === a.id).length + activites.filter((x) => x.affaireId === a.id).length + (a.documents ?? []).length;
    assert.ok(n >= 2 && n <= 6, `affaire ${a.titre} : ${n} fiches`);
  }

  const devis = await tous(CLIENT, 'devis_devis');
  const emetteurDemo = (await db.doc(`clients/${CLIENT}/devis_parametres/reglages`).get()).data().entreprise; // « Mon entreprise » de démonstration : fictive, mais complète pour finaliser
  const parStatut = {};
  for (const d of devis) parStatut[d.statut] = (parStatut[d.statut] ?? 0) + 1;
  for (const s of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse']) assert.ok(parStatut[s] >= 2 && parStatut[s] <= 3, `${s} : ${parStatut[s]}`);
  const numeros = new Set();
  for (const brut of devis) {
    const d = Object.fromEntries(Object.entries(brut).map(([k, v]) => [k, versDate(v)]));
    assert.equal(d.racineId, d.id);
    assert.equal(d.version, 1);
    const affaire = affaires.find((a) => a.id === d.affaireId);
    assert.ok(affaire, 'devis rattaché à une affaire');
    if (d.statut === 'accepte') assert.equal(affaire.statut, 'gagnee');
    if (d.statut === 'refuse') assert.equal(affaire.statut, 'perdue');
    const lignes = d.sections.flatMap((s) => s.lignes);
    assert.ok(d.sections.length >= 2 && d.sections.length <= 4, `${d.objet} : ${d.sections.length} sections`);
    assert.ok(lignes.length >= 4 && lignes.length <= 12, `${d.objet} : ${lignes.length} lignes`);
    if (d.statut === 'brouillon') {
      assert.deepEqual(D.erreursFinalisation(d, { emetteur: emetteurDemo, aujourdhui: L.aujourdhuiParis(MAINTENANT) }), []);
      assert.equal(d.numero, null);
      continue;
    }
    // Ce que le serveur aurait écrit : numéro du jour de finalisation, totaux recalculables, dates dans l'ordre.
    assert.match(d.numero, /^DEV-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.equal(d.numero.slice(4, 14), L.aujourdhuiParis(d.finaliseLe));
    assert.ok(!numeros.has(d.numero));
    numeros.add(d.numero);
    assert.deepEqual(D.erreursFinalisation({ ...d, statut: 'brouillon' }, { emetteur: emetteurDemo, aujourdhui: L.aujourdhuiParis(d.finaliseLe) }), []); // le jour est celui de la finalisation
    assert.deepEqual(d.totaux, D.totauxDevis(d));
    assert.ok(d.totaux.ttc > 300 && d.totaux.ttc < 20000, `total TTC ${d.totaux.ttc}`);
    assert.ok(d.creeLe < d.finaliseLe);
    if (d.statut !== 'en_attente_envoi') assert.ok(d.finaliseLe < d.envoyeLe);
    if (d.statut === 'accepte') assert.ok(d.envoyeLe < d.accepteLe && d.accepteLe < MAINTENANT);
    if (d.statut === 'refuse') assert.ok(d.envoyeLe < d.refuseLe && d.refuseLe < MAINTENANT);
  }
  const compteur = (await db.doc(`clients/${CLIENT}/devis_compteurs/global`).get()).data();
  assert.equal(compteur.valeur, numeros.size);
  const taux = new Set(devis.flatMap((d) => d.sections.flatMap((s) => s.lignes.map((l) => l.tauxTva))));
  assert.ok(taux.has(10) && taux.has(20));
});

test('5. Un second lancement est refusé (données déjà là), même avec --completer', async () => {
  const avant = await photo();
  const r = await lancer([CLIENT, '--catalogue-exemple', '--ecrire', '--completer']);
  assert.equal(r.code, 1);
  assert.match(r.texte, /déjà des données de démonstration/);
  const r2 = await lancer([AUTRE, '--catalogue-exemple', '--ecrire']);
  assert.equal(r2.code, 1);
  assert.match(r2.texte, /déjà des données/);
  assert.deepEqual(await photo(), avant);
});

test('6. --retirer simule, puis ne supprime que les documents marqués', async () => {
  await db.doc(`clients/${CLIENT}/crm_affaires/a-garder`).set({ titre: 'Affaire ajoutée à la main', etape: 'etape_1', statut: 'ouverte' });
  const avant = await photo();
  const s = await lancer([CLIENT, '--retirer']);
  assert.equal(s.code, 0, s.texte);
  assert.match(s.texte, /SIMULATION/);
  assert.deepEqual(await photo(), avant);
  const r = await lancer([CLIENT, '--retirer', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  for (const c of COLLECTIONS_DEMO) assert.equal((await tous(CLIENT, c)).filter((d) => d[MARQUEUR]).length, 0, c);
  assert.ok((await db.doc(`clients/${CLIENT}/crm_affaires/a-garder`).get()).exists);
  assert.ok((await db.doc(`clients/${CLIENT}/devis_compteurs/global`).get()).exists, 'le compteur des numéros reste');
  assert.ok((await db.doc(`clients/${AUTRE}/crm_affaires/reelle`).get()).exists);
});

test('7. --catalogue-depuis lit le catalogue d\'un projet source sans rien y écrire, et --completer garde les données existantes', async () => {
  const app = getApps().find((a) => a.name === 'essai-source') || initializeApp({ projectId: SOURCE }, 'essai-source');
  const src = getFirestore(app);
  for (const a of CATALOGUE_EXEMPLE) { const { id, ...x } = a; await src.doc(`devis_articles/${id}`).set({ ...x, proprietaire: 'source@exemple.test' }); }
  await src.doc('devis_parametres/familles').set({ liste: [{ id: 'famille-perso', nom: 'Famille perso', actif: true }] });
  const lireSource = async () => (await src.collection('devis_articles').get()).docs.map((d) => [d.id, JSON.stringify(d.data())]).sort();
  const avantSource = await lireSource();
  const r = await lancer([CLIENT, '--catalogue-depuis', SOURCE, '--ecrire', '--completer']);
  assert.equal(r.code, 0, r.texte);
  assert.deepEqual(await lireSource(), avantSource);
  const copies = await tous(CLIENT, 'devis_articles');
  assert.equal(copies.length, CATALOGUE_EXEMPLE.length);
  assert.ok(copies.every((a) => a.proprietaire === 'alice@exemple.test'), "l'auteur des copies est celui du client");
  assert.deepEqual(copies.find((a) => a.id === 'demo-o01').composants, CATALOGUE_EXEMPLE.find((a) => a.id === 'demo-o01').composants);
  assert.equal((await db.doc(`clients/${CLIENT}/devis_parametres/familles`).get()).data().liste[0].nom, 'Famille perso');
  assert.ok((await db.doc(`clients/${CLIENT}/crm_affaires/a-garder`).get()).exists);
  // Lecture impossible : message clair, rien d'écrit.
  const r2 = await lancer([AUTRE, '--catalogue-depuis', SOURCE, '--ecrire', '--completer'], { lireCatalogue: async () => { throw new Error('PERMISSION_DENIED'); } });
  assert.equal(r2.code, 1);
  assert.match(r2.texte, /--catalogue-exemple/);
});
