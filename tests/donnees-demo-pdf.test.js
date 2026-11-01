// Tests de l'option --pdf de l'outil « données de démonstration » (scripts/plateforme/donnees-demo-pdf.js). ÉMULATEUR Firestore + Storage seulement
// (projet demo-chevalier-ia-os) : jamais la vraie base. L'émulateur n'a PAS de déclencheur : le test joue le rôle du serveur (voir `serveur`),
// et l'attente est injectée (horloge simulée, aucune vraie pause). Lancé avec la série « outil-client » (npm run test:module donnees-demo).
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { createRequire } from 'node:module';
import { executerDonneesDemo, MARQUEUR } from '../scripts/plateforme/donnees-demo.js';
import { CHAMP_ORIGINE, SECOURS_DELAI_EN_COURS_MS } from '../scripts/plateforme/donnees-demo-pdf.js';
import { DELAI_EN_COURS_MS } from '../functions/src/coeur/devis.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';

const { DocumentReference, Firestore } = createRequire(new URL('../scripts/plateforme/package.json', import.meta.url))('firebase-admin/firestore');

const CLIENT = 'demo-pdf';
const SANS_DEVIS = 'demo-pdf-sans-devis';
const AFFAIRE = 'affaire-demo';
const AFFAIRE_REELLE = 'affaire-reelle';
let db;
let bucket;

/** Horloge simulée : chaque « pause » fait avancer le temps, sans attendre. */
function horloge() {
  const h = { t: Date.now(), pauses: 0 };
  h.pdf = { intervalleMs: 5000, plafondMs: 600_000, detectionMs: 60_000, horloge: () => h.t, dormir: async () => { h.t += 5000; h.pauses += 1; if (h.serveur) await h.serveur(); } };
  return h;
}
async function lancer(argv, extra = {}) {
  const lignes = [];
  const code = await executerDonneesDemo(argv, { out: (l = '') => lignes.push(l), env: process.env, maintenant: new Date('2026-10-26T10:00:00Z'), ...extra });
  return { code, texte: lignes.join('\n') };
}
const col = (c, client = CLIENT) => db.collection(`clients/${client}/${c}`);
const lire = async (c, client = CLIENT) => Object.fromEntries((await col(c, client).get()).docs.map((d) => [d.id, d.data()]));
async function photo() {
  const docs = [];
  for (const nom of ['devis_devis', 'crm_affaires', 'crm_evenements']) for (const d of (await col(nom).get()).docs) docs.push([d.ref.path, JSON.stringify(d.data())]);
  const [fichiers] = await bucket.getFiles({ prefix: `clients/${CLIENT}/` });
  return [...docs.sort(), ...fichiers.map((f) => f.name).sort()];
}

/** Part d'un client propre : 1 affaire de démo, 1 affaire réelle, des devis dans chaque état. */
async function preparer(devis, { modules = { affaires: true, devis: true } } = {}) {
  for (const c of ['devis_devis', 'crm_affaires', 'crm_evenements']) for (const d of await col(c).listDocuments()) await d.delete();
  await bucket.deleteFiles({ prefix: `clients/${CLIENT}/`, force: true });
  await db.doc(`clients/${CLIENT}`).set({ demo: true, nom: 'Client démo PDF', modules });
  await col('crm_affaires').doc(AFFAIRE).set({ titre: 'Affaire fictive', statut: 'ouverte', [MARQUEUR]: true });
  await col('crm_affaires').doc(AFFAIRE_REELLE).set({ titre: 'Affaire réelle', statut: 'ouverte' });
  for (const [id, d] of Object.entries(devis)) await col('devis_devis').doc(id).set({ affaireId: AFFAIRE, numero: `DEV-2026-10-26-${id}`, objet: id, ...d });
}
/** Ce que ferait le serveur : un devis finalisé sans PDF reçoit `pdf = ok`, un événement « Document joint » (sans marqueur) et un fichier. */
function serveur(hor, { echec = [] } = {}) {
  return async () => {
    for (const d of (await col('devis_devis').get()).docs) {
      const x = d.data();
      // Comme le vrai déclencheur : n'agit qu'après l'écriture 1 (pdf remis à null) et le retour au statut d'origine.
      if (x.statut === 'brouillon' || x.pdf !== null || CHAMP_ORIGINE in x || !x[MARQUEUR]) continue;
      if (echec.includes(d.id)) { await d.ref.update({ pdf: { statut: 'echec', message: 'Chromium absent' } }); continue; }
      await d.ref.update({ pdf: { statut: 'en_cours', tentatives: 1, demarreLe: new Date(hor.t) } });
      await bucket.file(`clients/${CLIENT}/devis/${x.affaireId}/${d.id}/devis.pdf`).save('%PDF-1.4 fictif');
      await col('crm_evenements').add({ type: 'document', texte: `Document joint : ${d.id}`, affaireId: x.affaireId, auteur: 'declencheur-pdf' });
      await d.ref.update({ pdf: { statut: 'ok', chemin: `clients/${CLIENT}/devis/${x.affaireId}/${d.id}/devis.pdf`, genereLe: new Date(hor.t) } });
    }
  };
}
const DEMO = { [MARQUEUR]: true };

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "FIREBASE_STORAGE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  ({ db, bucket } = ouvrir(cible({}, process.env)));
  await db.doc(`clients/${SANS_DEVIS}`).set({ demo: true, nom: 'Sans devis', modules: { affaires: true, devis: false } });
});

test('1. Sans --ecrire, --pdf liste ce qu\'il ferait et n\'écrit rien', async () => {
  await preparer({ a: { statut: 'envoye', pdf: null, ...DEMO }, b: { statut: 'accepte', ...DEMO } });
  const avant = await photo();
  const h = horloge();
  const r = await lancer([CLIENT, '--pdf'], { pdf: h.pdf });
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /À traiter : 2 devis/);
  assert.match(r.texte, /SIMULATION : rien n'a été écrit/);
  assert.deepEqual(await photo(), avant);
  assert.equal(h.pauses, 0);
});

test('2. Seuls les devis de démo sans PDF sont traités : sans marqueur, brouillon, pdf ok et en_cours récent sont sautés', async () => {
  const h = horloge();
  await preparer({
    a: { statut: 'envoye', ...DEMO },
    b: { statut: 'refuse', pdf: { statut: 'echec' }, ...DEMO },
    reel: { statut: 'envoye' }, // pas de marqueur : jamais touché
    brouillon: { statut: 'brouillon', ...DEMO },
    fait: { statut: 'accepte', pdf: { statut: 'ok', chemin: 'x' }, ...DEMO },
  });
  await col('devis_devis').doc('cours').set({ affaireId: AFFAIRE, numero: 'DEV-cours', statut: 'en_attente_envoi', pdf: { statut: 'en_cours', demarreLe: new Date(h.t - 60_000) }, ...DEMO });
  await col('devis_devis').doc('vieux').set({ affaireId: AFFAIRE, numero: 'DEV-vieux', statut: 'envoye', pdf: { statut: 'en_cours', demarreLe: new Date(h.t - 3_600_000) }, ...DEMO });
  const avant = await lire('devis_devis');
  const appels = [];
  const update = DocumentReference.prototype.update;
  DocumentReference.prototype.update = function (...a) { appels.push([this.id, a[0]]); return update.apply(this, a); };
  h.serveur = serveur(h);
  let r;
  try { r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf }); } finally { DocumentReference.prototype.update = update; }
  assert.equal(r.code, 0, r.texte);
  const apres = await lire('devis_devis');
  // Touchés : a, b, vieux (en_cours vieux de plus de 10 min = abandonné).
  for (const id of ['a', 'b', 'vieux']) assert.equal(apres[id].pdf.statut, 'ok', id);
  for (const id of ['reel', 'brouillon', 'fait', 'cours']) assert.deepEqual(apres[id], avant[id], `${id} ne doit pas bouger`);
  assert.ok(!appels.some(([id]) => ['reel', 'brouillon', 'fait', 'cours'].includes(id)));
  // Statuts d'origine rétablis, marqueur de reprise disparu.
  assert.equal(apres.a.statut, 'envoye');
  assert.equal(apres.b.statut, 'refuse');
  for (const d of Object.values(apres)) assert.equal(CHAMP_ORIGINE in d, false);
});

test('3. Deux update() séparés par devis : d\'abord brouillon + pdf null + statut d\'origine, puis le statut d\'origine ; jamais de lot ni de set', async () => {
  const h = horloge();
  await preparer({ a: { statut: 'envoye', pdf: { statut: 'echec' }, ...DEMO } });
  h.serveur = serveur(h);
  const appels = [];
  const update = DocumentReference.prototype.update;
  const set = DocumentReference.prototype.set;
  // Les entrées publiques d'un lot ou d'une transaction (db.batch(), runTransaction, bulkWriter) : ref.update() n'en passe par aucune.
  const entrees = ['batch', 'runTransaction', 'bulkWriter'];
  const lot = entrees.map((m) => Firestore.prototype[m]);
  entrees.forEach((m, i) => { Firestore.prototype[m] = function (...a) { appels.push(['lot', m]); return lot[i].apply(this, a); }; });
  DocumentReference.prototype.update = function (...a) { appels.push(['update', this.id, a[0]]); return update.apply(this, a); };
  DocumentReference.prototype.set = function (...a) { appels.push(['set', this.id, a[0]]); return set.apply(this, a); };
  try { await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf }); } finally { DocumentReference.prototype.update = update; DocumentReference.prototype.set = set; entrees.forEach((m, i) => { Firestore.prototype[m] = lot[i]; }); }
  const siens = appels.filter(([, id]) => id === 'a').filter(([, , d]) => 'statut' in d);
  assert.equal(appels.filter(([t, id]) => t === 'set' && id === 'a').length, 0);
  assert.equal(appels.filter(([t]) => t === 'lot').length, 0, 'jamais de lot ni de transaction');
  assert.ok(siens.length >= 2);
  assert.equal(siens[0][2].statut, 'brouillon');
  assert.equal(siens[0][2].pdf, null);
  assert.equal(siens[0][2][CHAMP_ORIGINE], 'envoye');
  assert.equal(siens[1][2].statut, 'envoye');
  assert.ok(!('pdf' in siens[1][2]));
  assert.ok(CHAMP_ORIGINE in siens[1][2] && typeof siens[1][2][CHAMP_ORIGINE] !== 'string', 'le champ de reprise est supprimé (FieldValue.delete)');
  assert.equal((await col('devis_devis').doc('a').get()).data().statut, 'envoye');
});

test('4. Reprise après panne : un devis laissé en brouillon avec son statut d\'origine est rétabli avant tout', async () => {
  const h = horloge();
  await preparer({ coupe: { statut: 'brouillon', pdf: null, [CHAMP_ORIGINE]: 'accepte', ...DEMO } });
  h.serveur = serveur(h);
  // Simulation : annonce la reprise, ne change rien.
  const avant = await photo();
  const s = await lancer([CLIENT, '--pdf'], { pdf: h.pdf });
  assert.match(s.texte, /Reprise : 1 devis/);
  assert.deepEqual(await photo(), avant);
  const ecrits = [];
  const update = DocumentReference.prototype.update;
  DocumentReference.prototype.update = function (...a) { if (this.id === 'coupe') ecrits.push(a[0]); return update.apply(this, a); };
  let r;
  try { r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf }); } finally { DocumentReference.prototype.update = update; }
  assert.equal(r.code, 0, r.texte);
  assert.ok(!ecrits.some((e) => e.statut === 'brouillon'), 'un devis repris est seulement attendu, pas remis en brouillon une seconde fois');
  const d = (await col('devis_devis').doc('coupe').get()).data();
  assert.equal(d.statut, 'accepte');
  assert.equal(CHAMP_ORIGINE in d, false);
  assert.equal(d.pdf.statut, 'ok');
});

test('5. Pas de déclencheur : arrêt après 60 s avec le message prévu, et aucun devis laissé en brouillon', async () => {
  const h = horloge(); // aucun serveur
  const debut = h.t;
  await preparer({ a: { statut: 'envoye', ...DEMO }, b: { statut: 'accepte', ...DEMO }, c: { statut: 'refuse', ...DEMO } });
  const r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf });
  assert.equal(r.code, 1);
  assert.match(r.texte, /Le déclencheur devisPdfAuto ne répond pas : fonctions PDF pas déployées chez les clients \? \(voir docs\/pdf-clients\.md\)/);
  assert.match(r.texte, /Relancez --pdf --ecrire/);
  assert.doesNotMatch(r.texte, /repartir de zéro|--retirer/);
  assert.ok(h.t - debut >= 60_000 && h.t - debut <= 80_000, `arrêt vers 60 s, pas 10 minutes (${h.t - debut} ms)`);
  for (const d of Object.values(await lire('devis_devis'))) {
    assert.notEqual(d.statut, 'brouillon');
    assert.equal(CHAMP_ORIGINE in d, false);
  }
});

test('6. Un échec est signalé sans bloquer les autres ; le tableau s\'affiche au fur et à mesure', async () => {
  const h = horloge();
  await preparer({ a: { statut: 'envoye', ...DEMO }, b: { statut: 'accepte', ...DEMO }, c: { statut: 'refuse', ...DEMO } });
  h.serveur = serveur(h, { echec: ['b'] });
  const r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf });
  assert.equal(r.code, 1, r.texte);
  assert.match(r.texte, /DEV-2026-10-26-a\s+Envoyé\s+PDF ok/i);
  assert.match(r.texte, /DEV-2026-10-26-b\s+.+?\s+PDF ÉCHEC/);
  assert.match(r.texte, /Bilan : 2 PDF ok, 1 en échec/);
});

test('7. Les événements « Document joint » du serveur sont marqués démo ; ceux des autres affaires ne le sont pas', async () => {
  const h = horloge();
  await preparer({ a: { statut: 'envoye', ...DEMO } });
  await col('crm_evenements').doc('reel').set({ type: 'document', texte: 'Document joint : x', affaireId: AFFAIRE_REELLE });
  h.serveur = serveur(h);
  const r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf });
  assert.equal(r.code, 0, r.texte);
  const ev = await lire('crm_evenements');
  assert.equal(ev.reel[MARQUEUR], undefined);
  const miens = Object.entries(ev).filter(([id]) => id !== 'reel');
  assert.equal(miens.length, 1);
  assert.equal(miens[0][1][MARQUEUR], true);
});

test('8. Module devis inactif, projet du CRM de Jérôme et client sans fiche : refus, rien d\'écrit', async () => {
  const h = horloge();
  await col('devis_devis', SANS_DEVIS).doc('a').set({ statut: 'envoye', pdf: null, ...DEMO });
  const r = await lancer([SANS_DEVIS, '--pdf', '--ecrire'], { pdf: h.pdf });
  assert.equal(r.code, 1);
  assert.match(r.texte, /module « devis » n'est pas actif/);
  assert.equal((await col('devis_devis', SANS_DEVIS).doc('a').get()).data().statut, 'envoye');
  const r2 = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf, env: { ...process.env, GCLOUD_PROJECT: 'chevalier-ia-os' } });
  assert.equal(r2.code, 1);
  assert.match(r2.texte, /CRM de Jérôme|refusé/);
  const r3 = await lancer(['inconnu-pdf', '--pdf'], { pdf: h.pdf });
  assert.equal(r3.code, 1);
  assert.match(r3.texte, /n'existe pas/);
  assert.equal(h.pauses, 0);
});

test('9. --pdf et --retirer ne se combinent pas ; --pdf seul n\'accepte pas les options de remplissage', async () => {
  assert.match((await lancer([CLIENT, '--pdf', '--retirer'])).texte, /ne se combinent pas/);
  assert.match((await lancer([CLIENT, '--pdf', '--completer'])).texte, /--pdf seul/);
});

test('10. --retirer supprime les événements marqués et les fichiers PDF des affaires de démo, et rien d\'autre', async () => {
  const h = horloge();
  await preparer({ a: { statut: 'envoye', ...DEMO } });
  await col('crm_evenements').doc('reel').set({ type: 'document', texte: 'Document joint : x', affaireId: AFFAIRE_REELLE });
  h.serveur = serveur(h);
  assert.equal((await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf })).code, 0);
  await bucket.file(`clients/${CLIENT}/devis/${AFFAIRE_REELLE}/b/reel.pdf`).save('%PDF réel');
  await bucket.file(`clients/${CLIENT}/devis/${AFFAIRE}x/c/voisin.pdf`).save('%PDF voisin'); // préfixe qui ressemble, autre affaire
  await bucket.file(`marques/${CLIENT}/logo.png`).save('png');
  const nomsAvant = (await bucket.getFiles({ prefix: 'clients/' }))[0].map((f) => f.name);
  assert.ok(nomsAvant.includes(`clients/${CLIENT}/devis/${AFFAIRE}/a/devis.pdf`));

  const s = await lancer([CLIENT, '--retirer']);
  assert.match(s.texte, /Storage : 1 fichier/);
  assert.equal((await bucket.getFiles({ prefix: 'clients/' }))[0].length, nomsAvant.length, 'la simulation ne supprime rien');

  const r = await lancer([CLIENT, '--retirer', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  const noms = (await bucket.getFiles({ prefix: 'clients/' }))[0].map((f) => f.name).sort();
  assert.deepEqual(noms, [`clients/${CLIENT}/devis/${AFFAIRE_REELLE}/b/reel.pdf`, `clients/${CLIENT}/devis/${AFFAIRE}x/c/voisin.pdf`].sort());
  assert.ok((await bucket.file(`marques/${CLIENT}/logo.png`).exists())[0]);
  const ev = await lire('crm_evenements');
  assert.deepEqual(Object.keys(ev), ['reel']);
  assert.deepEqual(Object.keys(await lire('devis_devis')), []);
  assert.ok((await col('crm_affaires').doc(AFFAIRE_REELLE).get()).exists);
});

test('11. Remplissage + --pdf dans la même commande : simulation sans écriture, puis les devis finalisés reçoivent leur PDF', async () => {
  const COMPLET = 'demo-pdf-complet';
  await db.doc(`clients/${COMPLET}`).set({ demo: true, nom: 'Client complet', modules: { affaires: true, projets: true, devis: true } });
  await db.doc(`clients/${COMPLET}/membres/alice@exemple.test`).set({ role: 'editeur' });
  const h = horloge();
  const s = await lancer([COMPLET, '--catalogue-exemple', '--pdf'], { pdf: h.pdf });
  assert.equal(s.code, 0, s.texte);
  assert.match(s.texte, /Avec --pdf : après l'écriture/);
  assert.equal((await col('crm_affaires', COMPLET).get()).size, 0);
  const nonBrouillons = async () => (await col('devis_devis', COMPLET).get()).docs.filter((d) => d.data().statut !== 'brouillon');
  h.serveur = async () => {
    for (const d of await nonBrouillons()) if (!d.data().pdf) await d.ref.update({ pdf: { statut: 'ok', chemin: 'x' } });
  };
  const r = await lancer([COMPLET, '--catalogue-exemple', '--pdf', '--ecrire'], { pdf: h.pdf });
  assert.equal(r.code, 0, r.texte);
  const devis = (await col('devis_devis', COMPLET).get()).docs.map((d) => d.data());
  assert.equal(devis.filter((d) => d.statut !== 'brouillon').length, 12);
  assert.ok(devis.filter((d) => d.statut !== 'brouillon').every((d) => d.pdf?.statut === 'ok'));
  assert.ok(devis.filter((d) => d.statut === 'brouillon').every((d) => !d.pdf));
  assert.equal((await lancer([COMPLET, '--retirer', '--ecrire'])).code, 0);
});

/** Fait échouer `n` fois l'écriture 2 (retour au statut d'origine) du devis `cible`. */
function paniquerEcriture2(cible, n) {
  const update = DocumentReference.prototype.update;
  let restant = n;
  DocumentReference.prototype.update = function (...a) {
    if (this.id === cible && a[0] && a[0].statut && a[0].statut !== 'brouillon' && CHAMP_ORIGINE in a[0] && restant > 0) { restant -= 1; return Promise.reject(new Error('coupure réseau simulée')); }
    return update.apply(this, a);
  };
  return () => { DocumentReference.prototype.update = update; };
}

test('12. Seconde chance : une écriture 2 qui échoue une fois est refaite, le devis finit en ordre', async () => {
  const h = horloge();
  await preparer({ a: { statut: 'envoye', ...DEMO } });
  h.serveur = serveur(h);
  const fin = paniquerEcriture2('a', 1);
  let r;
  try { r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf }); } finally { fin(); }
  assert.equal(r.code, 0, r.texte);
  const d = (await col('devis_devis').doc('a').get()).data();
  assert.equal(d.statut, 'envoye');
  assert.equal(d.pdf.statut, 'ok');
});

test('13. Écriture 2 qui échoue deux fois : arrêt propre, message de reprise, et le lancement suivant rétablit le statut', async () => {
  const h = horloge();
  await preparer({ a: { statut: 'envoye', ...DEMO }, b: { statut: 'accepte', ...DEMO }, c: { statut: 'refuse', ...DEMO } });
  h.serveur = serveur(h);
  const fin = paniquerEcriture2('a', 2);
  let r;
  try { r = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf }); } finally { fin(); }
  assert.equal(r.code, 1);
  assert.match(r.texte, /coupure réseau simulée/);
  assert.match(r.texte, /Relancez --pdf --ecrire/);
  assert.doesNotMatch(r.texte, /repartir de zéro/);
  const coupe = (await col('devis_devis').doc('a').get()).data();
  assert.equal(coupe.statut, 'brouillon');
  assert.equal(coupe[CHAMP_ORIGINE], 'envoye');
  const r2 = await lancer([CLIENT, '--pdf', '--ecrire'], { pdf: h.pdf });
  assert.equal(r2.code, 0, r2.texte);
  for (const [id, st] of [['a', 'envoye'], ['b', 'accepte'], ['c', 'refuse']]) {
    const d = (await col('devis_devis').doc(id).get()).data();
    assert.equal(d.statut, st, id);
    assert.equal(CHAMP_ORIGINE in d, false);
    assert.equal(d.pdf.statut, 'ok', id);
  }
});

test('14. La valeur de secours du délai « en cours » est celle du serveur', () => {
  assert.equal(SECOURS_DELAI_EN_COURS_MS, DELAI_EN_COURS_MS);
});
