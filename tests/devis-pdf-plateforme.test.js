// D (plateforme clients) : le PDF des devis chez un client (functions-plateforme/src/devis-pdf.js) : déclencheur `devisPdfAuto`, appels `devisPdf` et `devisPdfLien`.
// `db` est une FAUSSE base (seules les fiches de membre et du client sont lues), l'accès aux données est en MÉMOIRE, le convertisseur et Cloud Storage sont FAUX :
// aucun émulateur, aucun réseau, aucun vrai Chromium. node --test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, describe } from 'node:test';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { lienStablePdf } from '../functions/src/devis/pdf-service.js';
import { nouveauDevis } from '../functions/partage/devis.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const { fabriquerPdfClient, lienPdfClient, creerDeclencheurPdfClient, BASE_LIEN_PLATEFORME } = await import('../functions-plateforme/src/devis-pdf.js');
const { Refus } = await import('../functions-plateforme/src/appels.js');

const ALICE = 'alice@exemple.test'; // éditrice chez a (module devis actif)
const LEA = 'lea@exemple.test'; // lectrice chez a
const BOB = 'bob@exemple.test'; // éditeur chez b (module devis actif)
const ZOE = 'zoe@exemple.test'; // éditrice chez c (module devis INACTIF)
const MAINTENANT = new Date('2026-10-26T10:00:00Z');
const PRIX_ACHAT = 137.42; // valeur distinctive : elle ne doit apparaître nulle part dans le document du client

const FICHES = {
  'clients/a': { modules: { affaires: true, devis: true } },
  'clients/b': { modules: { affaires: true, devis: true } },
  'clients/c': { modules: { affaires: true } },
  [`clients/a/membres/${ALICE}`]: { role: 'editeur' },
  [`clients/a/membres/${LEA}`]: { role: 'lecteur' },
  [`clients/b/membres/${BOB}`]: { role: 'editeur' },
  [`clients/c/membres/${ZOE}`]: { role: 'editeur' },
};
/** Fausse base : compte les lectures de fiches (le déclencheur n'en fait aucune pour une simple modification de brouillon). */
function fauxDb() {
  const lectures = [];
  return { lectures, doc: (chemin) => ({ get: async () => { lectures.push(chemin); const f = FICHES[chemin]; return { exists: Boolean(f), get: (champ) => f?.[champ] }; } }) };
}
const auth = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });

async function monde({ finaliser = ['a', 'b'] } = {}) {
  const collections = {};
  for (const c of ['a', 'b', 'c']) {
    Object.assign(collections, {
      [`clients/${c}/devis_devis`]: [], [`clients/${c}/devis_compteurs`]: [], [`clients/${c}/crm_audit`]: [], [`clients/${c}/crm_audit_avant`]: [],
      [`clients/${c}/devis_parametres`]: [{ id: 'reglages', regimeTva: 'assujetti', emetteur: { nom: `Entreprise ${c}` } }],
      [`clients/${c}/crm_organisations`]: [{ id: 'org1', nom: 'Société Cliente Essai' }], [`clients/${c}/crm_personnes`]: [], [`clients/${c}/crm_affaires`]: [{ id: 'aff1', titre: 'Rénovation Essai', urlDossier: 'https://drive.google.com/drive/folders/DOSSIER_ESSAI', documents: [] }],
      [`clients/${c}/crm_evenements`]: [],
    });
    const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1', organisationId: 'org1', objet: 'Cuisine' }, { id: `d-${c}`, maintenant: MAINTENANT, auteur: ALICE }, { marge: 20 });
    collections[`clients/${c}/devis_devis`].push({ ...d, objet: 'Cuisine', sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'l1', libelle: 'Pose', unite: 'u', quantite: 2, prixAchat: PRIX_ACHAT }] }] });
  }
  const brut = creerAccesMemoire(collections);
  const creerDonnees = (client) => avecBase(brut, `clients/${client}`);
  for (const c of finaliser) await S.finaliser({ donnees: creerDonnees(c), ctx: { acteur: ALICE, via: 'ecran', maintenant: MAINTENANT }, devisId: `d-${c}` });
  return { collections, creerDonnees, devis: (c) => collections[`clients/${c}/devis_devis`][0] };
}

function faux({ echec = false } = {}) {
  const vus = { html: [], envois: [], signes: [], options: [] };
  const objets = new Map();
  return {
    vus, objets,
    convertir: async (html) => { vus.html.push(html); if (echec) throw new Error('PDF : le navigateur n\'a pas pu démarrer.'); return { pdf: Buffer.from('%PDF-1.4 faux'), sha256: 'a'.repeat(64) }; },
    stockage: {
      envoyer: async (chemin, pdf) => { vus.envois.push(chemin); objets.set(chemin, pdf); },
      existe: async (chemin) => objets.has(chemin),
      lienSigne: async (chemin, o) => { vus.signes.push(chemin); vus.options.push(o); return `https://stockage.exemple.test/signe?o=${encodeURIComponent(chemin)}&m=${o.minutes}`; },
    },
  };
}
const evenement = (client, devisId, avant, apres) => ({ params: { client, devisId }, data: { before: { data: () => avant }, after: { data: () => apres } } });
const FINALISE = { statut: 'en_attente_envoi', pdf: null };
const declencheur = (m, f, db = fauxDb()) => creerDeclencheurPdfClient({ db, creerDonnees: m.creerDonnees, convertir: f.convertir, stockage: f.stockage, maintenant: () => MAINTENANT.getTime() });
const fabriquer = (m, f, email, donnees, extra = {}) => fabriquerPdfClient({ db: fauxDb(), auth: email === null ? null : auth(email, extra.verifie), donnees, convertir: f.convertir, stockage: extra.stockage === undefined ? f.stockage : extra.stockage, creerDonnees: m.creerDonnees, maintenant: () => MAINTENANT.getTime() });
const lire = (m, f, email, donnees, extra = {}) => lienPdfClient({ db: fauxDb(), auth: email === null ? null : auth(email), donnees, stockage: extra.stockage === undefined ? f.stockage : extra.stockage, creerDonnees: m.creerDonnees, maintenant: () => MAINTENANT.getTime() });
const refus = async (promesse, code) => assert.rejects(promesse, (e) => e instanceof Refus && (!code || e.code === code), `refus ${code ?? ''} attendu`);

describe('D1 déclencheur : fabrique chez un client dont le module devis est actif, ignore sinon', () => {
  test('D1 le passage brouillon -> finalisé chez a fabrique le PDF, rangé sous clients/a/devis/', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    await S.finaliser({ donnees: m.creerDonnees('a'), ctx: { acteur: ALICE, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd-a' });
    const r = await declencheur(m, f)(evenement('a', 'd-a', { statut: 'brouillon' }, FINALISE));
    assert.deepEqual({ suite: r.suite, statut: r.statut }, { suite: 'traite', statut: 'ok' });
    assert.equal(f.vus.envois.length, 1);
    assert.match(f.vus.envois[0], /^clients\/a\/devis\//);
    assert.equal(m.devis('a').pdf.statut, 'ok');
    assert.match(m.devis('a').pdf.chemin, /^clients\/a\/devis\//);
  });
  test('D1 un client sans le module devis est ignoré : rien fabriqué, rien écrit', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    const r = await declencheur(m, f)(evenement('c', 'd-c', { statut: 'brouillon' }, FINALISE));
    assert.equal(r.suite, 'ignore');
    assert.equal(f.vus.envois.length, 0);
    assert.equal(f.vus.html.length, 0);
    assert.equal(m.devis('c').pdf, undefined);
  });
  test('D1 un client inconnu ou un identifiant invalide est ignoré, sans erreur', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    for (const client of ['inconnu', 'interne', '../a', 'A', '', undefined, 42]) {
      const r = await declencheur(m, f)(evenement(client, 'd-a', { statut: 'brouillon' }, FINALISE));
      assert.equal(r.suite, 'ignore', String(client));
    }
    assert.equal(f.vus.envois.length, 0);
  });
  test('D1 une simple modification de brouillon ne lit même pas la fiche du client (ordre : passage d\'abord, fiche ensuite)', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    const db = fauxDb();
    const g = declencheur(m, f, db);
    assert.equal((await g(evenement('a', 'd-a', { statut: 'brouillon' }, { statut: 'brouillon', objet: 'x' }))).suite, 'ignore');
    assert.equal((await g(evenement('a', 'd-a', FINALISE, { ...FINALISE, pdf: { statut: 'ok' } }))).suite, 'ignore');
    assert.deepEqual(db.lectures, []);
    await g(evenement('a', 'd-a', { statut: 'brouillon' }, FINALISE));
    assert.deepEqual(db.lectures, ['clients/a']);
  });
});

describe('D2 cloisonnement : un client ne touche jamais le PDF d\'un autre', () => {
  test('D2 l\'éditrice de a ne peut ni fabriquer ni lire le PDF de b, même en connaissant son devis', async () => {
    const m = await monde();
    const f = faux();
    await refus(fabriquer(m, f, ALICE, { client: 'b', devisId: 'd-b' }), 'permission-denied');
    await refus(lire(m, f, ALICE, { client: 'b', devisId: 'd-b' }), 'permission-denied');
    assert.equal(f.vus.envois.length, 0);
    assert.equal(f.vus.signes.length, 0);
  });
  test('D2 un devis d\'un client n\'est pas visible depuis l\'espace d\'un autre (même identifiant, autre client : introuvable)', async () => {
    const m = await monde();
    const f = faux();
    await refus(fabriquer(m, f, BOB, { client: 'b', devisId: 'd-a' }), 'not-found');
    await refus(lire(m, f, BOB, { client: 'b', devisId: 'd-a' }), 'not-found');
  });
  test('D2 un chemin de PDF qui sort du dossier du client n\'est jamais signé', async () => {
    const m = await monde();
    const f = faux();
    const ok = await lire(m, f, ALICE, { client: 'a', devisId: 'd-a' }).catch(() => null);
    assert.equal(ok, null); // PDF pas encore fabriqué : « pas prêt »
    await fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a' });
    const bon = await lire(m, f, ALICE, { client: 'a', devisId: 'd-a' });
    assert.match(f.vus.signes[0], /^clients\/a\/devis\//);
    assert.equal(bon.expireDans, 300);
    m.devis('a').pdf.chemin = 'clients/b/devis/aff1/d-b/autre.pdf'; // devis falsifié : pointe vers le dossier de b
    await refus(lire(m, f, ALICE, { client: 'a', devisId: 'd-a' }), 'permission-denied');
    m.devis('a').pdf.chemin = 'devis/aff1/d-a/racine.pdf'; // ni vers la racine (dossier de Jérôme)
    await refus(lire(m, f, ALICE, { client: 'a', devisId: 'd-a' }), 'permission-denied');
    assert.equal(f.vus.signes.length, 1);
  });
});

describe('D3 qui peut quoi', () => {
  test('D3 une éditrice fabrique et lit ; une lectrice lit mais ne fabrique pas', async () => {
    const m = await monde();
    const f = faux();
    const r = await fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a' });
    assert.equal(r.statut, 'ok');
    const l = await lire(m, f, LEA, { client: 'a', devisId: 'd-a' });
    assert.match(l.url, /^https:\/\/stockage\.exemple\.test\//);
    assert.equal(l.expireDans, 300);
    await refus(fabriquer(m, f, LEA, { client: 'a', devisId: 'd-a' }), 'permission-denied');
    await refus(fabriquer(m, f, LEA, { client: 'a', devisId: 'd-a', brouillon: true }), 'permission-denied');
  });
  test('D3 un non-membre, un compte non vérifié, un espace sans devis, un client invalide : refus, tous avec le même message neutre', async () => {
    const m = await monde();
    const f = faux();
    const messages = new Set();
    const noter = async (p) => { try { await p; assert.fail('refus attendu'); } catch (e) { assert.ok(e instanceof Refus); messages.add(`${e.code}|${e.message}`); } };
    await noter(fabriquer(m, f, 'inconnu@exemple.test', { client: 'a', devisId: 'd-a' }));
    await noter(lire(m, f, 'inconnu@exemple.test', { client: 'a', devisId: 'd-a' }));
    await noter(fabriquer(m, f, ZOE, { client: 'c', devisId: 'd-c' })); // module devis inactif
    await noter(lire(m, f, ZOE, { client: 'c', devisId: 'd-c' }));
    await noter(fabriquer(m, f, ALICE, { client: 'inexistant', devisId: 'x' }));
    await noter(fabriquer(m, f, ALICE, { client: 'interne', devisId: 'x' }));
    assert.deepEqual([...messages], ['permission-denied|Action non autorisée.']);
    await refus(fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a' }, { verifie: false }), 'unauthenticated');
    await refus(fabriquer(m, f, null, { client: 'a', devisId: 'd-a' }), 'unauthenticated');
    await refus(fabriquer(m, f, ALICE, { client: '../a', devisId: 'd-a' }), 'invalid-argument');
    assert.equal(f.vus.envois.length, 0);
  });
  test('D3 demande invalide (identifiant manquant, avec « / », trop long, brouillon non booléen) et « PDF non configuré »', async () => {
    const m = await monde();
    const f = faux();
    for (const devisId of [undefined, '', 'a/b', 'x'.repeat(201), 12]) await refus(fabriquer(m, f, ALICE, { client: 'a', devisId }), 'invalid-argument');
    await refus(fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a', brouillon: 'oui' }), 'invalid-argument');
    await refus(fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a' }, { stockage: null }), 'failed-precondition');
    await refus(lire(m, f, ALICE, { client: 'a', devisId: 'd-a' }, { stockage: null }), 'failed-precondition');
  });
  test('D3 (5) telecharger : passé à lienSigne chez les clients ; type invalide refusé (lien et fabrication) ; chemin hors du client refusé', async () => {
    const m = await monde();
    const f = faux();
    await fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a' });
    await lire(m, f, ALICE, { client: 'a', devisId: 'd-a' });
    await lire(m, f, ALICE, { client: 'a', devisId: 'd-a', telecharger: true });
    assert.deepEqual(f.vus.options.map((o) => o.telecharger), [false, true]);
    for (const telecharger of ['oui', 1, null]) {
      await refus(lire(m, f, ALICE, { client: 'a', devisId: 'd-a', telecharger }), 'invalid-argument');
      await refus(fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a', telecharger }), 'invalid-argument');
    }
    assert.equal(f.vus.signes.length, 2);
    m.devis('a').pdf.chemin = 'clients/b/devis/aff1/d-b/autre.pdf';
    await refus(lire(m, f, ALICE, { client: 'a', devisId: 'd-a', telecharger: true }), 'permission-denied');
    assert.equal(f.vus.signes.length, 2);
  });
  test('D3 PDF brouillon à la demande : filigrane, nom fixe sous clients/a/, lien signé ; refusé pour un devis finalisé', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    const r = await fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a', brouillon: true });
    assert.equal(r.statut, 'ok');
    assert.equal(r.lien, 'https://chevalier-ia-app.web.app/#/espace/a/devis/pdf/d-a/brouillon');
    assert.match(f.vus.envois[0], /^clients\/a\/devis\/aff1\/d-a\/brouillon\.pdf$/);
    const l = await lire(m, f, LEA, { client: 'a', devisId: 'd-a', brouillon: true });
    assert.match(decodeURIComponent(l.url), /clients\/a\/devis\/aff1\/d-a\/brouillon\.pdf/);
    await S.finaliser({ donnees: m.creerDonnees('a'), ctx: { acteur: ALICE, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd-a' });
    await refus(fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a', brouillon: true }), 'failed-precondition');
  });
});

describe('D4 le document du client ne montre jamais prix d\'achat ni marge', () => {
  test('D4 ni le prix d\'achat, ni « marge », ni coefficient dans le HTML envoyé à Chromium', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    await S.finaliser({ donnees: m.creerDonnees('a'), ctx: { acteur: ALICE, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd-a' });
    await declencheur(m, f)(evenement('a', 'd-a', { statut: 'brouillon' }, FINALISE));
    await fabriquer(m, f, BOB, { client: 'b', devisId: 'd-b', brouillon: true }); // le devis de b est encore un brouillon
    assert.equal(f.vus.html.length, 2);
    for (const html of f.vus.html) {
      assert.doesNotMatch(html, /137[.,]42/);
      assert.doesNotMatch(html, /prixAchat|prix d'achat|prix d’achat/i);
      assert.doesNotMatch(html, /marge|coefficient/i);
      assert.match(html, /Cuisine/);
    }
  });
});

describe('D5 un échec de fabrication ne touche jamais le devis', () => {
  test('D5 le déclencheur ne lève pas : pdf.statut = echec, le devis reste finalisé', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux({ echec: true });
    await S.finaliser({ donnees: m.creerDonnees('a'), ctx: { acteur: ALICE, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd-a' });
    const statutAvant = m.devis('a').statut;
    const r = await declencheur(m, f)(evenement('a', 'd-a', { statut: 'brouillon' }, FINALISE));
    assert.equal(r.suite, 'traite');
    assert.equal(m.devis('a').pdf.statut, 'echec');
    assert.ok(m.devis('a').pdf.message);
    assert.equal(m.devis('a').statut, statutAvant);
    assert.notEqual(m.devis('a').statut, 'brouillon');
    assert.equal(f.vus.envois.length, 0);
  });
  test('D5 même si la lecture de la fiche échoue : jamais d\'exception', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    const db = { doc: () => ({ get: async () => { throw new Error('base indisponible'); } }) };
    const r = await creerDeclencheurPdfClient({ db, creerDonnees: m.creerDonnees, convertir: f.convertir, stockage: f.stockage })(evenement('a', 'd-a', { statut: 'brouillon' }, FINALISE));
    assert.equal(r.suite, 'erreur');
  });
  test('D5 à la demande, l\'échec est un refus lisible (« internal »), le devis reste finalisé', async () => {
    const m = await monde();
    const f = faux({ echec: true });
    await refus(fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a' }), 'internal');
    assert.equal(m.devis('a').pdf.statut, 'echec');
    assert.notEqual(m.devis('a').statut, 'brouillon');
  });
});

describe('D6 adresse stable du PDF par client', () => {
  test('D6 lien = https://chevalier-ia-app.web.app/#/espace/a/devis/pdf/d1 (le hash porte le client), jamais …/espace/<client>/#/…', () => {
    assert.equal(BASE_LIEN_PLATEFORME, 'https://chevalier-ia-app.web.app');
    assert.equal(lienStablePdf(BASE_LIEN_PLATEFORME, 'd1', false, 'espace/a'), 'https://chevalier-ia-app.web.app/#/espace/a/devis/pdf/d1');
    assert.equal(lienStablePdf(`${BASE_LIEN_PLATEFORME}/`, 'd1', true, 'espace/b'), 'https://chevalier-ia-app.web.app/#/espace/b/devis/pdf/d1/brouillon');
  });
  test('D6 chez Jérôme, le lien est strictement inchangé (sans préfixe)', () => {
    assert.equal(lienStablePdf('https://chevalier-ia-os.web.app', 'd1'), 'https://chevalier-ia-os.web.app/#/devis/pdf/d1');
    assert.equal(lienStablePdf('https://chevalier-ia-os.web.app/', 'd1', true), 'https://chevalier-ia-os.web.app/#/devis/pdf/d1/brouillon');
    assert.equal(lienStablePdf('https://chevalier-ia-os.web.app', 'd1', false, ''), 'https://chevalier-ia-os.web.app/#/devis/pdf/d1');
  });
  test('D6 chez les clients : PDF ok sur le devis, lien rendu au bon client, l\'affaire (et les documents déjà présents) strictement inchangée, aucun « Document joint »', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    m.collections['clients/a/crm_affaires'][0].documents.push({ libelle: 'Ancien devis.pdf', url: 'https://chevalier-ia-app.web.app/#/espace/a/devis/pdf/d-a' });
    await S.finaliser({ donnees: m.creerDonnees('a'), ctx: { acteur: ALICE, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd-a' });
    await S.finaliser({ donnees: m.creerDonnees('b'), ctx: { acteur: BOB, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd-b' });
    const avant = { a: structuredClone(m.collections['clients/a/crm_affaires'][0]), b: structuredClone(m.collections['clients/b/crm_affaires'][0]) };
    await declencheur(m, f)(evenement('a', 'd-a', { statut: 'brouillon' }, FINALISE));
    const ra = await fabriquer(m, f, BOB, { client: 'b', devisId: 'd-b' });
    assert.equal(ra.statut, 'ok');
    assert.equal(ra.lien, 'https://chevalier-ia-app.web.app/#/espace/b/devis/pdf/d-b');
    assert.deepEqual(Object.keys(ra).filter((k) => !['statut', 'lien', 'nom'].includes(k)), []);
    assert.equal(m.devis('a').pdf.statut, 'ok');
    assert.equal(m.devis('b').pdf.statut, 'ok');
    assert.match(m.devis('a').pdf.chemin, /^clients\/a\/devis\//);
    assert.match(m.devis('b').pdf.chemin, /^clients\/b\/devis\//);
    assert.deepEqual(m.collections['clients/a/crm_affaires'][0], avant.a);
    assert.deepEqual(m.collections['clients/b/crm_affaires'][0], avant.b);
    for (const c of ['a', 'b']) assert.ok(!m.collections[`clients/${c}/crm_evenements`].some((e) => e.type === 'document'));
  });
  test('D6 chez les clients : un PDF brouillon ne touche ni le champ pdf ni l\'affaire', async () => {
    const m = await monde({ finaliser: [] });
    const f = faux();
    const avantAffaire = structuredClone(m.collections['clients/a/crm_affaires'][0]);
    const avantDevis = structuredClone(m.devis('a'));
    const r = await fabriquer(m, f, ALICE, { client: 'a', devisId: 'd-a', brouillon: true });
    assert.equal(r.statut, 'ok');
    assert.deepEqual(m.collections['clients/a/crm_affaires'][0], avantAffaire);
    assert.deepEqual(m.devis('a'), avantDevis);
  });
});

describe('D7 branchement (lecture du code) : comptes, options, copie, secrets', () => {
  const lireFichier = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const index = lireFichier('functions-plateforme/src/index.js');
  const section = index.slice(index.indexOf('PDF des devis chez les clients'));
  test('D7 index.js exporte devisPdf, devisPdfLien et devisPdfAuto, avec le compte dédié et les options attendues', () => {
    for (const nom of ['devisPdf', 'devisPdfLien', 'devisPdfAuto']) assert.match(index, new RegExp(`export const ${nom} = `));
    assert.match(section, /const COMPTE_PDF = 'devis-pdf@chevalier-ia-app\.iam\.gserviceaccount\.com'/);
    assert.match(section, /document: 'clients\/\{client\}\/devis_devis\/\{devisId\}', region: REGION, memory: '2GiB', timeoutSeconds: 540, concurrency: 1, maxInstances: 2, retry: false, serviceAccount: COMPTE_PDF/);
    assert.match(section, /OPTIONS_PDF = \{ region: REGION, memory: '2GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 2, serviceAccount: COMPTE_PDF \}/);
    assert.match(index, /BUCKET = 'chevalier-ia-app\.firebasestorage\.app'/);
    assert.doesNotMatch(section, /compute@developer|appspot\.gserviceaccount|chevalier-ia-os/);
  });
  test('D7 aucun secret déclaré pour le PDF (un secret absent ferait échouer le déploiement de toutes les fonctions)', () => {
    assert.doesNotMatch(section.replace(/\/\/.*$/gm, ''), /secrets\s*:|defineSecret/);
  });
  test('D7 devis-pdf.js n\'importe ni pdf-appel.js ni stockage-projet.js (comptes de Jérôme)', () => {
    const code = lireFichier('functions-plateforme/src/devis-pdf.js').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /pdf-appel|stockage-projet|devis-appel|veille/);
  });
  test('D7 la copie vers functions-plateforme/serveur/ est nominative (pas de dossier entier)', () => {
    const script = lireFichier('scripts/preparer-fonctions.js');
    assert.match(script, /\['pdf-service\.js', 'pdf-declencheur\.js', 'chromium\.js', 'stockage\.js'\]/);
    assert.doesNotMatch(script.replace(/\/\/.*$/gm, ''), /'devis'\]|pdf-appel\.js'|stockage-projet\.js'/);
  });
});
