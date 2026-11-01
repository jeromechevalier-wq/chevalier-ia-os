// Tests des mots appris et du mot du métier de la démonstration (scripts/plateforme/donnees-demo.js, PR 2 du cadrage des démos par métier).
// ÉMULATEUR Firestore seulement (projet demo-chevalier-ia-os). Lancé avec la série « outil-client » (npm run test:module donnees-demo).
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { executerDonneesDemo, MOTS_EXEMPLE, CATALOGUE_EXEMPLE, COLLECTIONS_DEMO, MARQUEUR } from '../scripts/plateforme/donnees-demo.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';
import { ciblesDe, identifiantDeRegle, cleDeExpression, interpreter } from '../js/modules/devis/vocabulaire.js';
import { designation, resumeDesigne, estATrancher } from '../js/modules/devis/vocabulaire-plans.js';
import { motOuvrage } from '../js/modules/devis/ouvrages.js';

const MAINTENANT = new Date('2026-10-26T10:00:00Z');
const modules = { affaires: true, projets: true, devis: true };
let db;

async function lancer(argv, extra = {}) {
  const lignes = [];
  const code = await executerDonneesDemo(argv, { out: (l = '') => lignes.push(l), env: process.env, maintenant: MAINTENANT, ...extra });
  return { code, texte: lignes.join('\n') };
}
const tous = async (client, c) => (await db.collection(`clients/${client}/${c}`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
async function creerClient(id, { demo = true } = {}) {
  await db.doc(`clients/${id}`).set({ nom: id, modules, ...(demo ? { demo: true } : {}) });
  await db.doc(`clients/${id}/membres/alice@exemple.test`).set({ role: 'editeur' });
}
async function photo(prefixe) {
  const docs = [];
  const marcher = async (ref) => {
    const s = await ref.get();
    if (s.exists) docs.push([ref.path, JSON.stringify(s.data())]);
    for (const c of await ref.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
  };
  await marcher(db.doc(prefixe));
  return docs.sort();
}

before(() => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  db = ouvrir(cible({}, process.env)).db;
});

test('1. Une démonstration écrit les mots appris (marqués), valides au sens du moteur, avec un mot de chaque sorte', async () => {
  await creerClient('voc-1');
  const r = await lancer(['voc-1', '--catalogue-exemple', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /Mots appris : 8 \(vocabulaire d'exemple\)/);
  const mots = await tous('voc-1', 'devis_vocabulaire');
  assert.equal(mots.length, MOTS_EXEMPLE.length);
  const articles = CATALOGUE_EXEMPLE.map((a) => ({ ...a }));
  for (const m of mots) {
    assert.equal(m[MARQUEUR], true, `${m.id} sans marqueur`);
    assert.equal(m.id, identifiantDeRegle(cleDeExpression(m.expression)));
    assert.equal(m.cle, cleDeExpression(m.expression));
    // L'écran Vocabulaire et le serveur chargent le mot avec le vrai code : chaque cible existe et vit dans le catalogue d'exemple.
    const d = designation(m, articles, []);
    assert.equal(d.mort, false, m.id);
    assert.ok(ciblesDe(m).length >= 1 && ciblesDe(m).length <= 8);
    if (m.cibles) { assert.equal(m.articleId, ''); assert.equal(m.articleLibelle, ''); assert.match(resumeDesigne(d), /articles au choix/); } else assert.ok(m.articleId);
    assert.equal(estATrancher(m), false);
    assert.match(m.valideLe ?? '2026-10-26', /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!/ikea|leroy|castorama|legrand|schneider/i.test(JSON.stringify(m)), 'marque réelle');
  }
  const statuts = new Set(mots.map((m) => m.statut));
  assert.deepEqual([...statuts].sort(), ['a_confirmer', 'active', 'desactivee']);
  assert.ok(mots.some((m) => m.cibles?.length > 1), 'un mot à plusieurs articles au choix');
  assert.ok(mots.some((m) => m.validePar === 'humain') && mots.some((m) => m.validePar === 'reponses') && mots.some((m) => m.origine.startsWith('apprise_')));
  assert.ok(mots.filter((m) => m.statut === 'a_confirmer').every((m) => m.validePar === undefined && m.confirmations < 2));
  // Le moteur comprend une phrase qui emploie un mot actif.
  const lu = interpreter('il faut du placo', { regles: mots.filter((m) => m.statut === 'active'), articles });
  assert.ok(JSON.stringify(lu).includes('demo-f01'), 'le mot « placo » mène à la plaque de plâtre');
  assert.ok(COLLECTIONS_DEMO.includes('devis_vocabulaire'));
});

test('2. Le mot du métier est posé avec le marqueur quand le client n’a pas de réglages ; un autre mot s’il vient du jeu', async () => {
  await creerClient('voc-2');
  assert.equal((await lancer(['voc-2', '--catalogue-exemple', '--ecrire'])).code, 0);
  const reglages = (await db.doc('clients/voc-2/devis_parametres/reglages').get()).data();
  assert.equal(reglages.motOuvrage, 'ouvrage');
  assert.equal(reglages[MARQUEUR], true);
  await creerClient('voc-2b');
  const r = await lancer(['voc-2b', '--catalogue-exemple', '--ecrire'], { jeu: { motOuvrage: 'prestation' } });
  assert.equal(r.code, 0, r.texte);
  const r2 = (await db.doc('clients/voc-2b/devis_parametres/reglages').get()).data();
  assert.equal(motOuvrage(r2).singulier, 'prestation');
  await creerClient('voc-2c');
  const mauvais = await lancer(['voc-2c', '--catalogue-exemple', '--ecrire'], { jeu: { motOuvrage: 'machin' } });
  assert.equal(mauvais.code, 1);
  assert.match(mauvais.texte, /pas dans la liste du logiciel/);
  assert.equal((await tous('voc-2c', 'devis_vocabulaire')).length, 0);
});

test('3. Le mot du métier n’écrase pas un réglage existant du client ; ses mots à lui restent aussi', async () => {
  await creerClient('voc-3');
  await db.doc('clients/voc-3/devis_parametres/reglages').set({ motOuvrage: 'forfait', marge: 33 });
  await db.doc('clients/voc-3/devis_vocabulaire/placo').set({ cle: 'placo', expression: 'placo', articleId: 'reel-1', articleLibelle: 'Article réel', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [] });
  const r = await lancer(['voc-3', '--catalogue-exemple', '--ecrire', '--completer']);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /1 déjà présent\(s\) chez le client/);
  const reglages = (await db.doc('clients/voc-3/devis_parametres/reglages').get()).data();
  assert.deepEqual(reglages, { motOuvrage: 'forfait', marge: 33 });
  const placo = (await db.doc('clients/voc-3/devis_vocabulaire/placo').get()).data();
  assert.equal(placo.articleId, 'reel-1');
  assert.equal(placo[MARQUEUR], undefined);
  assert.equal((await tous('voc-3', 'devis_vocabulaire')).length, MOTS_EXEMPLE.length);
});

test('4. --retirer ne supprime que les mots de démonstration : un mot « réel » ajouté à la main reste ; le client retrouve « ouvrage »', async () => {
  await creerClient('voc-4');
  assert.equal((await lancer(['voc-4', '--catalogue-exemple', '--ecrire'])).code, 0);
  await db.doc('clients/voc-4/devis_vocabulaire/maison').set({ cle: 'maison', expression: 'maison', articleId: 'a', articleLibelle: 'A', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [] });
  await db.doc('clients/voc-4/crm_audit/garde').set({ acteur: 'serveur' });
  const sim = await lancer(['voc-4', '--retirer']);
  assert.match(sim.texte, /devis_vocabulaire : 8 document\(s\) de démonstration/);
  assert.equal((await tous('voc-4', 'devis_vocabulaire')).length, MOTS_EXEMPLE.length + 1, 'simulation : rien supprimé');
  assert.equal((await lancer(['voc-4', '--retirer', '--ecrire'])).code, 0);
  const restes = await tous('voc-4', 'devis_vocabulaire');
  assert.deepEqual(restes.map((m) => m.id), ['maison']);
  assert.equal((await db.doc('clients/voc-4/devis_parametres/reglages').get()).exists, false);
  assert.equal((await db.doc('clients/voc-4/crm_audit/garde').get()).exists, true, 'les journaux ne sont jamais effacés');
  assert.equal(motOuvrage(undefined).singulier, 'ouvrage');
});

test('5. La simulation n’écrit aucun mot ; un client non marqué est refusé sans rien écrire', async () => {
  await creerClient('voc-5');
  const avant = await photo('clients/voc-5');
  const sim = await lancer(['voc-5', '--catalogue-exemple']);
  assert.equal(sim.code, 0, sim.texte);
  assert.match(sim.texte, /Mots appris : 8/);
  assert.match(sim.texte, /SIMULATION/);
  assert.deepEqual(await photo('clients/voc-5'), avant);
  await creerClient('voc-5r', { demo: false });
  const avantR = await photo('clients/voc-5r');
  for (const argv of [['--catalogue-exemple'], ['--catalogue-exemple', '--ecrire'], ['--retirer', '--ecrire']]) {
    const r = await lancer(['voc-5r', ...argv]);
    assert.equal(r.code, 1);
    assert.match(r.texte, /n'est pas marqué comme client de démonstration/);
  }
  assert.deepEqual(await photo('clients/voc-5r'), avantR);
});

test('6. Un catalogue copié d’ailleurs (identifiants différents) ne reçoit aucun mot, et le dit', async () => {
  await creerClient('voc-6');
  const catalogue = { articles: [{ id: 'autre-1', libelle: 'Article d’ailleurs', unite: 'u', prixAchat: 10, tauxTva: 20, type: 'fourniture', familleId: 'famille-1-1', actif: true }], familles: null, reglages: { modeMarge: 'majoration', marge: 25 } };
  const r = await lancer(['voc-6', '--catalogue-depuis', 'chevalier-ia-os', '--ecrire'], { lireCatalogue: async () => catalogue });
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /Mots appris : aucun \(ce catalogue n'est pas celui d'exemple\)/);
  assert.equal((await tous('voc-6', 'devis_vocabulaire')).length, 0);
});
