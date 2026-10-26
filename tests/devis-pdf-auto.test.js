// Tests R (module Devis, PDF fabriqué par le serveur à la finalisation) : déclencheur Firestore (ignoré hors passage brouillon -> finalisé, idempotent, sans boucle),
// états du PDF (en_cours, ok, echec), 3 tentatives automatiques au plus, réessai à la demande, brouillon qui remplace le brouillon, document de l'affaire, lien signé court.
// FAUX convertisseur et FAUX Cloud Storage : aucun appel réseau. node --test.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, avecBase, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { creerAppelDevisPdf, creerAppelDevisPdfLien } from '../functions/src/devis/pdf-appel.js';
import { creerDeclencheurPdf, estFinalisation } from '../functions/src/devis/pdf-declencheur.js';
import { nouveauDevis } from '../functions/partage/devis.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-25T10:00:00Z');
const BASE_LIEN = 'https://appli.exemple.test';
const requete = (data, email = ACTEUR) => ({ auth: { token: { email, email_verified: true } }, data });

async function monde({ finaliser = false, affaire = true } = {}) {
  const collections = {
    [C.devis]: [], [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti', emetteur: { nom: 'Entreprise Essai' } }],
    [C.audit]: [], [C.auditAvant]: [], [C.evenements]: [], [C.organisations]: [{ id: 'org1', nom: 'Société Cliente Essai' }], [C.personnes]: [],
    [C.affaires]: affaire ? [{ id: 'aff1', titre: 'Rénovation Essai', documents: [{ libelle: 'Plan', url: 'https://exemple.test/plan' }] }] : [],
  };
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: affaire ? 'aff1' : null, organisationId: 'org1', objet: 'Cuisine' }, { id: 'd1', maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20 });
  collections[C.devis].push({ ...d, objet: 'Cuisine', sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'l1', libelle: 'Pose', unite: 'u', quantite: 2, prixAchat: 100 }] }] });
  const donnees = creerAccesMemoire(collections);
  if (finaliser) await finaliserDevis(donnees);
  return { collections, donnees };
}
const finaliserDevis = (donnees) => S.finaliser({ donnees, ctx: { acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd1' });

function faux({ echecs = 0 } = {}) {
  const vus = { conversions: 0, envois: [] };
  const objets = new Map();
  let restant = echecs;
  return {
    vus, objets,
    convertir: async () => {
      vus.conversions += 1;
      await new Promise((ok) => setTimeout(ok, 5)); // laisse une seconde demande arriver pendant la fabrication
      if (restant > 0) { restant -= 1; throw new Error('PDF : le navigateur n\'a pas pu démarrer.'); }
      return { pdf: Buffer.from('%PDF-1.4 faux'), sha256: 'b'.repeat(64) };
    },
    stockage: {
      envoyer: async (chemin, pdf) => { vus.envois.push(chemin); objets.set(chemin, pdf); },
      existe: async (chemin) => objets.has(chemin),
      lienSigne: async (chemin, o) => `https://stockage.exemple.test/signe?o=${encodeURIComponent(chemin)}&m=${o.minutes}`,
    },
  };
}
const evenement = (avant, apres, devisId = 'd1') => ({ params: { devisId }, data: { before: { data: () => avant }, after: { data: () => apres } } });
const declencheur = (m, f, extra = {}) => creerDeclencheurPdf({ donnees: () => m.donnees, baseLien: BASE_LIEN, convertir: f.convertir, stockage: f.stockage, maintenant: () => MAINTENANT.getTime(), ...extra });
const appel = (m, f, extra = {}) => creerAppelDevisPdf({ donnees: () => m.donnees, baseLien: BASE_LIEN, convertir: f.convertir, stockage: f.stockage, maintenant: () => MAINTENANT.getTime(), ...extra });
const BROUILLON = { statut: 'brouillon' };
const FINALISE = { statut: 'en_attente_envoi', pdf: null };

describe('R1 déclencheur : seul le passage brouillon -> finalisé compte', () => {
  test('R1 estFinalisation', () => {
    assert.ok(estFinalisation(BROUILLON, FINALISE));
    assert.ok(!estFinalisation(BROUILLON, BROUILLON));
    assert.ok(!estFinalisation(FINALISE, { ...FINALISE, statut: 'envoye' }));
    assert.ok(!estFinalisation(undefined, FINALISE));
    assert.ok(!estFinalisation(BROUILLON, undefined));
  });
  test('R1 une mise à jour sans passage (brouillon modifié, archivage, écriture de pdf) ne fabrique rien', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    const g = declencheur(m, f);
    for (const [a, b] of [[BROUILLON, BROUILLON], [FINALISE, { ...FINALISE, archive: true }], [FINALISE, { ...FINALISE, pdf: { statut: 'ok' } }], [{ statut: 'envoye' }, { statut: 'accepte' }]]) {
      assert.deepEqual(await g(evenement(a, b)), { suite: 'ignore' });
    }
    assert.equal(f.vus.conversions, 0);
  });
});

describe('R2 déclencheur : un PDF par version, rangé dans l\'affaire', () => {
  test('R2 finalisation -> pdf ok, chemin Storage, document « Devis DEV-… v1 – Cuisine.pdf » dans les Documents de l\'affaire, événement du fil', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    const r = await declencheur(m, f)(evenement(BROUILLON, FINALISE));
    assert.deepEqual(r, { suite: 'traite', statut: 'ok' });
    const devis = m.collections[C.devis][0];
    assert.equal(devis.statut, 'en_attente_envoi');
    assert.equal(devis.pdf.statut, 'ok');
    assert.equal(devis.pdf.chemin, 'devis/aff1/d1/DEV-2026-10-25-001 v1 - Cuisine.pdf');
    assert.deepEqual(f.vus.envois, [devis.pdf.chemin]);
    const docs = m.collections[C.affaires][0].documents;
    assert.equal(docs.length, 2);
    assert.equal(docs[0].libelle, 'Plan'); // l'existant est intact
    assert.equal(docs[1].libelle, 'Devis DEV-2026-10-25-001 v1 – Cuisine.pdf');
    assert.equal(docs[1].url, `${BASE_LIEN}/#/devis/pdf/d1`);
    assert.doesNotMatch(docs[1].url, /signe|token|X-Goog|storage/i); // adresse stable : ni signée ni publique
    assert.ok(m.collections[C.evenements].some((e) => e.type === 'document' && e.affaireId === 'aff1' && /DEV-2026-10-25-001/.test(e.texte)));
    assert.ok(m.collections[C.audit].some((l) => l.outil === 'devisPdf' && l.collection === C.devis));
  });
  test('R2 deux événements simultanés pour la même version : UN seul PDF, UN seul document', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    const g = declencheur(m, f);
    const [a, b] = await Promise.all([g(evenement(BROUILLON, FINALISE)), g(evenement(BROUILLON, FINALISE))]);
    assert.equal(f.vus.conversions, 1);
    assert.equal(f.vus.envois.length, 1);
    assert.equal(m.collections[C.affaires][0].documents.length, 2);
    assert.ok([a.statut, b.statut].includes('ok'));
    // un événement rejoué plus tard ne refait rien non plus
    await g(evenement(BROUILLON, FINALISE));
    assert.equal(f.vus.conversions, 1);
  });
  test('R2 pas de boucle : l\'écriture de pdf ne change pas le statut, donc ne relance jamais le déclencheur', async () => {
    const m = await monde({ finaliser: true });
    const avant = structuredClone(m.collections[C.devis][0]);
    await declencheur(m, faux())(evenement(BROUILLON, FINALISE));
    const apres = m.collections[C.devis][0];
    assert.equal(apres.statut, avant.statut);
    assert.ok(!estFinalisation({ statut: avant.statut, pdf: avant.pdf }, { statut: apres.statut, pdf: apres.pdf }));
  });
  test('R2 devis sans affaire : le PDF est rangé et marqué ok, sans document d\'affaire', async () => {
    const m = await monde({ finaliser: true, affaire: false });
    const f = faux();
    await declencheur(m, f)(evenement(BROUILLON, FINALISE));
    assert.equal(m.collections[C.devis][0].pdf.statut, 'ok');
    assert.match(m.collections[C.devis][0].pdf.chemin, /^devis\/sans-affaire\/d1\//);
    assert.equal(m.collections[C.affaires].length, 0);
  });
  test('R2 chez un client le chemin est sous clients/<client>/', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    await declencheur(m, f, { espace: 'clients/dupont/' })(evenement(BROUILLON, FINALISE));
    assert.match(m.collections[C.devis][0].pdf.chemin, /^clients\/dupont\/devis\/aff1\/d1\//);
  });
});

describe('R3 échecs : la finalisation ne dépend jamais du PDF', () => {
  test('R3 échec -> pdf.statut echec avec un message court sans HTML ni chemin ; le devis reste finalisé ; 3 tentatives au plus', async () => {
    const m = await monde({ finaliser: true });
    const f = faux({ echecs: 99 });
    const g = declencheur(m, f);
    const r = await g(evenement(BROUILLON, FINALISE));
    assert.deepEqual(r, { suite: 'traite', statut: 'echec' });
    assert.equal(f.vus.conversions, 3);
    const devis = m.collections[C.devis][0];
    assert.equal(devis.statut, 'en_attente_envoi');
    assert.equal(devis.pdf.statut, 'echec');
    assert.equal(devis.pdf.tentatives, 3);
    assert.ok(devis.pdf.message.length <= 200 && !/[<>/]/.test(devis.pdf.message), devis.pdf.message);
    assert.equal(m.collections[C.affaires][0].documents.length, 1);
    // un événement rejoué ne fait pas de 4e tentative
    await g(evenement(BROUILLON, FINALISE));
    assert.equal(f.vus.conversions, 3);
  });
  test('R3 la demande explicite repart de zéro après un échec définitif ; deux échecs puis un succès tiennent dans les 3 tentatives', async () => {
    const m = await monde({ finaliser: true });
    const f = faux({ echecs: 3 });
    await declencheur(m, f)(evenement(BROUILLON, FINALISE));
    assert.equal(m.collections[C.devis][0].pdf.statut, 'echec');
    const r = await appel(m, f)(requete({ devisId: 'd1' }));
    assert.equal(r.statut, 'ok');
    assert.equal(m.collections[C.devis][0].pdf.statut, 'ok');
    assert.equal(m.collections[C.devis][0].pdf.tentatives, 1);
    const m2 = await monde({ finaliser: true });
    const f2 = faux({ echecs: 2 });
    assert.deepEqual(await declencheur(m2, f2)(evenement(BROUILLON, FINALISE)), { suite: 'traite', statut: 'ok' });
    assert.equal(m2.collections[C.devis][0].pdf.tentatives, 3);
  });
  test('R3 le déclencheur ne lève jamais (pas de rejeu infini), même si les données sont illisibles', async () => {
    const m = await monde({ finaliser: true });
    const casse = { ...m, donnees: () => { throw new Error('base indisponible'); } };
    const r = await declencheur(casse, faux())(evenement(BROUILLON, FINALISE));
    assert.equal(r.suite, 'erreur');
    assert.equal((await declencheur(m, faux(), { stockage: null })(evenement(BROUILLON, FINALISE))).suite, 'ignore');
  });
});

describe('R4 états : en cours, ok, abandon', () => {
  test('R4 « en cours » : la demande répond en_cours sans refuser ni refabriquer ; un en cours trop vieux est repris', async () => {
    const m = await monde({ finaliser: true });
    m.collections[C.devis][0].pdf = { statut: 'en_cours', tentatives: 1, demarreLe: new Date(MAINTENANT.getTime() - 60_000) };
    const f = faux();
    const r = await appel(m, f)(requete({ devisId: 'd1' }));
    assert.equal(r.statut, 'en_cours');
    assert.equal(f.vus.conversions, 0);
    m.collections[C.devis][0].pdf = { statut: 'en_cours', tentatives: 1, demarreLe: new Date(MAINTENANT.getTime() - S.DELAI_EN_COURS_MS - 1000) };
    assert.equal((await appel(m, f)(requete({ devisId: 'd1' }))).statut, 'ok');
    assert.equal(f.vus.conversions, 1);
  });
  test('R4 horloge décalée : un « en cours » daté du futur ne bloque pas non plus pour toujours', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    m.collections[C.devis][0].pdf = { statut: 'en_cours', tentatives: 1, demarreLe: new Date(MAINTENANT.getTime() + 60_000) }; // un peu dans le futur : encore « en cours »
    assert.equal((await appel(m, f)(requete({ devisId: 'd1' }))).statut, 'en_cours');
    m.collections[C.devis][0].pdf = { statut: 'en_cours', tentatives: 1, demarreLe: new Date(MAINTENANT.getTime() + S.DELAI_EN_COURS_MS + 60_000) }; // très loin dans le futur : abandonné
    assert.equal((await appel(m, f)(requete({ devisId: 'd1' }))).statut, 'ok');
  });
  test('R4 pdfAReessayer : vrai pour un devis finalisé dont le PDF n\'est pas ok', () => {
    assert.ok(S.pdfAReessayer({ statut: 'en_attente_envoi', pdf: null }));
    assert.ok(S.pdfAReessayer({ statut: 'envoye', pdf: { statut: 'echec' } }));
    assert.ok(S.pdfAReessayer({ statut: 'envoye', pdf: { statut: 'en_cours' } }));
    assert.ok(!S.pdfAReessayer({ statut: 'envoye', pdf: { statut: 'ok' } }));
    assert.ok(!S.pdfAReessayer({ statut: 'brouillon' }));
  });
  test('R4 messagePdfCourt : pas de HTML, pas de chemin, 200 caractères', () => {
    const t = S.messagePdfCourt('<html>/var/task/x</html> ' + 'a'.repeat(500));
    assert.ok(t.length <= 200 && !/[<>/\\]/.test(t));
    assert.equal(S.messagePdfCourt(''), 'La fabrication du PDF a échoué.');
  });
});

describe('R5 brouillon à la demande : remplace le précédent', () => {
  test('R5 deux brouillons de suite : un seul fichier, un seul document « Devis brouillon – Cuisine – JJ-MM-AAAA HHhMM.pdf » qui prend l’heure du dernier téléchargement ; champ pdf du devis intact', async () => {
    const m = await monde({ finaliser: false });
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1', brouillon: true })); // 25/10/2026 10:00 UTC = 11 h 00 à Paris (heure d'hiver)
    const plusTard = new Date('2026-10-25T13:32:00Z').getTime(); // 14 h 32 à Paris
    await appel(m, f, { maintenant: () => plusTard })(requete({ devisId: 'd1', brouillon: true }));
    assert.equal(f.vus.envois.length, 2);
    assert.deepEqual([...new Set(f.vus.envois)], ['devis/aff1/d1/brouillon.pdf']); // même nom : le second remplace le premier
    assert.equal(f.objets.size, 1);
    const docs = m.collections[C.affaires][0].documents.filter((d) => /brouillon/i.test(d.libelle));
    assert.equal(docs.length, 1);
    assert.equal(docs[0].libelle, 'Devis brouillon – Cuisine – 25-10-2026 14h32.pdf');
    assert.equal(docs[0].url, `${BASE_LIEN}/#/devis/pdf/d1/brouillon`);
    assert.equal(m.collections[C.devis][0].pdf, undefined); // le champ pdf du devis n'a pas été touché
  });
  test('R5 le PDF brouillon est refusé pour un devis déjà finalisé (message clair, rien fabriqué)', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    await assert.rejects(() => appel(m, f)(requete({ devisId: 'd1', brouillon: true })), (e) => e.code === 'failed-precondition' && /déjà finalisé/.test(e.message));
    assert.equal(f.vus.conversions, 0);
  });
  test('R5 devis inconnu : not-found ; demande invalide (brouillon non booléen) refusée', async () => {
    const m = await monde();
    await assert.rejects(() => appel(m, faux())(requete({ devisId: 'inconnu', brouillon: true })), (e) => e.code === 'not-found');
    await assert.rejects(() => appel(m, faux())(requete({ devisId: 'd1', brouillon: 'oui' })), (e) => e.code === 'invalid-argument');
  });
});

describe('R6 lien signé de courte durée', () => {
  const lien = (m, f, extra = {}) => creerAppelDevisPdfLien({ donnees: () => m.donnees, stockage: f.stockage, maintenant: () => MAINTENANT.getTime(), ...extra });
  test('R6 compte autorisé : lien de 5 minutes ; sans connexion, compte inconnu ou e-mail non vérifié : refus', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    await declencheur(m, f)(evenement(BROUILLON, FINALISE));
    const a = lien(m, f);
    const r = await a(requete({ devisId: 'd1' }));
    assert.equal(r.expireDans, 300);
    assert.match(r.url, /m=5$/);
    assert.equal(r.nom, 'Devis DEV-2026-10-25-001 v1 – Cuisine.pdf');
    await assert.rejects(() => a({ data: { devisId: 'd1' } }), (e) => e.code === 'unauthenticated');
    await assert.rejects(() => a(requete({ devisId: 'd1' }, 'intrus@exemple.test')), (e) => e.code === 'permission-denied');
    await assert.rejects(() => a({ auth: { token: { email: ACTEUR, email_verified: false } }, data: { devisId: 'd1' } }), (e) => e.code === 'permission-denied');
  });
  test('R6 PDF pas prêt (echec, en cours, brouillon) : refus clair, aucun lien', async () => {
    const m = await monde({ finaliser: true });
    const f = faux();
    await assert.rejects(() => lien(m, f)(requete({ devisId: 'd1' })), (e) => e.code === 'failed-precondition');
    await assert.rejects(() => lien(m, f)(requete({ devisId: 'd1', brouillon: true })), (e) => e.code === 'not-found');
    const mb = await monde({ finaliser: false });
    await assert.rejects(() => lien(mb, f)(requete({ devisId: 'd1' })), (e) => e.code === 'failed-precondition'); // un brouillon n'a pas de PDF officiel
    await appel(mb, f)(requete({ devisId: 'd1', brouillon: true }));
    assert.match((await lien(mb, f)(requete({ devisId: 'd1', brouillon: true }))).url, /brouillon\.pdf/);
  });
  test('R6 autre espace : un devis d\'un autre client est introuvable, et un chemin hors de l\'espace n\'est jamais signé', async () => {
    const collections = { 'clients/a/devis_devis': [{ id: 'dA', statut: 'envoye', affaireId: 'x', pdf: { statut: 'ok', chemin: 'clients/a/devis/x/dA/DEV.pdf', nom: 'DEV.pdf' } }] };
    const base = creerAccesMemoire(collections);
    const f = faux();
    const chezB = lien({ donnees: avecBase(base, 'clients/b') }, f, { espace: 'clients/b/' });
    await assert.rejects(() => chezB(requete({ devisId: 'dA' })), (e) => e.code === 'not-found');
    const chezA = lien({ donnees: avecBase(base, 'clients/a') }, f, { espace: 'clients/a/' });
    assert.match((await chezA(requete({ devisId: 'dA' }))).url, /clients%2Fa%2Fdevis/);
    // un devis qui porterait le chemin d'un autre espace est refusé
    collections['clients/a/devis_devis'][0].pdf.chemin = 'clients/b/devis/x/dB/DEV.pdf';
    await assert.rejects(() => chezA(requete({ devisId: 'dA' })), (e) => e.code === 'permission-denied');
    collections['clients/a/devis_devis'][0].pdf.chemin = 'marques/a/logo.pdf';
    await assert.rejects(() => chezA(requete({ devisId: 'dA' })), (e) => e.code === 'permission-denied');
  });
});
