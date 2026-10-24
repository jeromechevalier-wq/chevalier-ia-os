// Tests Q (module Devis, fonction appelable devisPdf) : contrôle de l'appelant, brouillon refusé, « PDF non configuré », chemin heureux
// avec FAUX Gotenberg et FAUX Drive (aucun appel réseau), vue client sans prix d'achat ni marge, options de devisHtml, nom du fichier. node --test.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { creerAppelDevisPdf, MESSAGE_PDF_NON_CONFIGURE } from '../functions/src/devis/pdf-appel.js';
import { nomFichierDevis } from '../functions/src/devis/drive.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { devisHtml } from '../functions/partage/devis-document.js';
import { devisHtml as devisHtmlNavigateur } from '../js/modules/devis/document.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
const CONFIG = { gotenbergUrl: 'https://gotenberg.exemple.test', driveRacineId: 'RACINE_DRIVE_ESSAI_1' };
const PRIX_ACHAT = 137.42; // valeur distinctive : elle ne doit apparaître nulle part dans le document du client
const requete = (data, email = ACTEUR, extra = {}) => ({ auth: { token: { email, email_verified: true, ...extra } }, data });

/** Un monde en mémoire avec un devis FINALISÉ (par la vraie finalisation), son affaire, son client et l'identité de l'entreprise. */
async function monde({ finaliser = true, urlDossier = 'https://drive.google.com/drive/folders/DOSSIER_AFFAIRE_ESSAI' } = {}) {
  const collections = {
    [C.devis]: [], [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti', emetteur: { nom: 'Entreprise Essai', siret: '123 456 789 00010' } }],
    [C.audit]: [], [C.auditAvant]: [], [C.affaires]: [{ id: 'aff1', nom: 'Rénovation Essai', urlDossier }], [C.organisations]: [{ id: 'org1', nom: 'Société Cliente Essai' }], [C.personnes]: [],
  };
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1', organisationId: 'org1', objet: 'Cuisine' }, { id: 'd1', maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20 });
  collections[C.devis].push({ ...d, objet: 'Cuisine', sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'l1', libelle: 'Pose', unite: 'u', quantite: 2, prixAchat: PRIX_ACHAT }] }] });
  const donnees = creerAccesMemoire(collections);
  if (finaliser) await S.finaliser({ donnees, ctx: { acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd1' });
  return { collections, donnees };
}

/** Faux Gotenberg et faux Drive : ils notent ce qu'ils reçoivent. */
function faux() {
  const vus = { html: [], pieds: [], ranges: [] };
  return {
    vus,
    convertir: async (html, options) => { vus.html.push(html); vus.pieds.push(options?.pied); return { pdf: Buffer.from('%PDF-1.4 faux'), sha256: 'a'.repeat(64) }; },
    ranger: async (args) => { vus.ranges.push(args); return { fileId: 'FICHIER_ESSAI_1', lien: 'https://drive.exemple.test/fichier/1' }; },
  };
}
const appel = (m, f, extra = {}) => creerAppelDevisPdf({ donnees: () => m.donnees, config: CONFIG, convertir: f.convertir, ranger: f.ranger, maintenant: () => MAINTENANT.getTime(), ...extra });

describe('Q1 devisPdf : seul un compte autorisé et vérifié appelle', () => {
  test('Q1 refus sans connexion, avec un compte inconnu et avec un e-mail non vérifié ; rien n\'est converti ni rangé', async () => {
    const m = await monde();
    const f = faux();
    const a = appel(m, f);
    await assert.rejects(() => a({ data: { devisId: 'd1' } }), (e) => e.code === 'unauthenticated');
    await assert.rejects(() => a(requete({ devisId: 'd1' }, 'intrus@exemple.test')), (e) => e.code === 'permission-denied');
    await assert.rejects(() => a(requete({ devisId: 'd1' }, ACTEUR, { email_verified: false })), (e) => e.code === 'permission-denied');
    assert.equal(f.vus.html.length + f.vus.ranges.length, 0);
    assert.equal(m.collections[C.devis][0].pdf, undefined);
  });
});

describe('Q2 devisPdf : un brouillon est refusé', () => {
  test('Q2 le brouillon n\'a pas de PDF ; un devis inconnu ou une demande sans identifiant sont refusés aussi', async () => {
    const m = await monde({ finaliser: false });
    const f = faux();
    const a = appel(m, f);
    await assert.rejects(() => a(requete({ devisId: 'd1' })), (e) => e.code === 'failed-precondition' && /brouillon/.test(e.message));
    await assert.rejects(() => a(requete({ devisId: 'inconnu' })), (e) => e.code === 'not-found');
    await assert.rejects(() => a(requete({})), (e) => e.code === 'invalid-argument');
    assert.equal(f.vus.html.length, 0);
    assert.equal(m.collections[C.devis][0].pdf, undefined);
  });
});

describe('Q3 devisPdf : « PDF non configuré »', () => {
  test('Q3 sans adresse Gotenberg, ou sans dossier Drive racine, l\'erreur est claire et rien ne part', async () => {
    const m = await monde();
    for (const config of [{ ...CONFIG, gotenbergUrl: '' }, { ...CONFIG, driveRacineId: '' }, {}]) {
      const f = faux();
      const a = appel(m, f, { config });
      await assert.rejects(() => a(requete({ devisId: 'd1' })), (e) => e.code === 'failed-precondition' && e.message === MESSAGE_PDF_NON_CONFIGURE && /non configuré/.test(e.message));
      assert.equal(f.vus.html.length + f.vus.ranges.length, 0);
    }
  });
});

describe('Q4 devisPdf : chemin heureux', () => {
  test('Q4 le champ pdf est écrit (fileId, lien, sha256, genereLe), la réponse porte le lien, le dossier de l\'affaire est utilisé, le journal est écrit', async () => {
    const m = await monde();
    const f = faux();
    const r = await appel(m, f)(requete({ devisId: 'd1' }));
    assert.deepEqual(r, { lien: 'https://drive.exemple.test/fichier/1', fileId: 'FICHIER_ESSAI_1' });
    const devis = m.collections[C.devis][0];
    assert.equal(devis.pdf.fileId, 'FICHIER_ESSAI_1');
    assert.equal(devis.pdf.lien, 'https://drive.exemple.test/fichier/1');
    assert.equal(devis.pdf.sha256, 'a'.repeat(64));
    assert.ok(devis.pdf.genereLe instanceof Date);
    assert.equal(devis.statut, 'en_attente_envoi'); // le statut n'a pas bougé
    assert.equal(f.vus.ranges.length, 1);
    assert.equal(f.vus.ranges[0].dossierParentId, 'DOSSIER_AFFAIRE_ESSAI');
    assert.equal(f.vus.ranges[0].dossierRacineId, CONFIG.driveRacineId);
    assert.ok(f.vus.html[0].includes('Entreprise Essai') && f.vus.html[0].includes('Société Cliente Essai'));
    assert.ok(f.vus.pieds[0].includes(devis.numero)); // le pied du PDF porte le numéro du devis
    assert.ok(m.collections[C.audit].some((l) => l.outil === 'devisPdf' && l.docId === 'd1'));
  });
  test('Q4 une affaire sans dossier Drive : le rangement reçoit son nom et le dossier racine ; une panne de conversion n\'écrit rien', async () => {
    const m = await monde({ urlDossier: 'https://serveur.exemple.test/dossier' });
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1' }));
    assert.equal(f.vus.ranges[0].dossierParentId, undefined);
    assert.equal(f.vus.ranges[0].nomAffaire, 'Rénovation Essai');
    const m2 = await monde();
    const casse = { ...faux(), convertir: async () => { throw new Error('PDF : le service de conversion a répondu 500.'); } };
    await assert.rejects(() => appel(m2, casse)(requete({ devisId: 'd1' })), (e) => e.code === 'internal' && /500/.test(e.message));
    assert.equal(m2.collections[C.devis][0].pdf, undefined);
  });
});

describe('Q5 devisPdf : le document du client ne contient ni prix d\'achat ni marge', () => {
  test('Q5 le HTML envoyé à Gotenberg ne porte ni la valeur d\'achat, ni les mots achat, marge, coefficient', async () => {
    const m = await monde();
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1' }));
    const html = f.vus.html[0];
    assert.ok(html.includes('Pose')); // le document est bien là
    for (const interdit of ['137,42', '137.42', '137,4', 'prixAchat', 'coefficient']) assert.ok(!html.includes(interdit), interdit);
    assert.doesNotMatch(html, /marge|achat/i);
    assert.ok(html.includes('329,81') || html.includes('329,8'), 'prix de vente attendu (137,42 + 20 % = 164,90 x 2)'); // le client voit le prix de VENTE
  });
});

describe('Q6 devisHtml : pagesAvant et blocSignature', () => {
  const vue = { numero: 'DEV-2026-10-24-001', version: 1, objet: 'Cuisine', sections: [{ numero: '1', titre: 'Travaux', sousTotalHT: 10, lignes: [{ numero: '1.1', libelle: 'Pose', quantite: 1, unite: 'u', prixUnitaireHT: 10, totalHT: 10, tauxTva: 20 }] }], totaux: { ht: 10, tva: 2, ttc: 12, tvaParTaux: [] }, regimeTva: 'assujetti' };
  const cgv = { emetteur: { nom: 'Entreprise Essai', cgv: { afficher: true, texte: 'TEXTE-CGV' } } };
  test('Q6 sans options (ou options vides), le HTML est identique octet pour octet', () => {
    const base = devisHtml(vue, cgv);
    assert.equal(devisHtml(vue, { ...cgv, pagesAvant: [], blocSignature: '' }), base);
    assert.equal(devisHtml(vue, { ...cgv, pagesAvant: undefined, blocSignature: undefined }), base);
    assert.equal(devisHtmlNavigateur(vue, cgv), base); // la copie du serveur est la même que le fichier du navigateur
  });
  test('Q6 avec options : pages avant, chiffrage, CGV, signature, dans cet ordre ; les fragments sont repris tels quels', () => {
    const html = devisHtml(vue, { ...cgv, pagesAvant: ['<p>PAGE-UN</p>', '<p>PAGE-DEUX</p>'], blocSignature: '<p>BLOC-SIGNATURE</p>' });
    const place = (t) => { const i = html.indexOf(t); assert.ok(i >= 0, t); return i; };
    assert.ok(place('PAGE-UN') < place('PAGE-DEUX'));
    assert.ok(place('PAGE-DEUX') < place('class="lignes"'));
    assert.ok(place('class="lignes"') < place('TEXTE-CGV'));
    assert.ok(place('TEXTE-CGV') < place('BLOC-SIGNATURE'));
    assert.ok(place('BLOC-SIGNATURE') < place('</table>\n</body>'));
  });
});

describe('Q7 devisPdf : le nom du fichier suit nomFichierDevis', () => {
  test('Q7 numéro, version et objet du devis', async () => {
    const m = await monde();
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1' }));
    const devis = m.collections[C.devis][0];
    assert.equal(f.vus.ranges[0].nomFichier, nomFichierDevis({ numero: devis.numero, version: devis.version, objet: devis.objet }));
    assert.equal(f.vus.ranges[0].nomFichier, 'DEV-2026-10-24-001 v1 - Cuisine.pdf');
  });
});
