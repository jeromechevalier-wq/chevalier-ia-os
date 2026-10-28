// Tests Q (module Devis, fonction appelable devisPdf) : contrôle de l'appelant, brouillon refusé (sauf PDF « brouillon » à la demande), « PDF non configuré », chemin heureux
// avec FAUX convertisseur et FAUX Cloud Storage (aucun appel réseau), vue client sans prix d'achat ni marge, options de devisHtml, nom du fichier. node --test.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { creerAppelDevisPdf, MESSAGE_PDF_NON_CONFIGURE } from '../functions/src/devis/pdf-appel.js';
import { nomFichierDevis, creerStockage } from '../functions/src/devis/stockage.js';
import { creerAppelDocument } from '../functions/src/documents/appel.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { devisHtml } from '../functions/partage/devis-document.js';
import { fragmentDePage } from '../js/modules/devis/document.js';
import { devisHtml as devisHtmlNavigateur } from '../js/modules/devis/document.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
const BASE_LIEN = 'https://appli.exemple.test';
const PRIX_ACHAT = 137.42; // valeur distinctive : elle ne doit apparaître nulle part dans le document du client
const requete = (data, email = ACTEUR, extra = {}) => ({ auth: { token: { email, email_verified: true, ...extra } }, data });

/** Un monde en mémoire avec un devis FINALISÉ (par la vraie finalisation), son affaire, son client et l'identité de l'entreprise. */
async function monde({ finaliser = true, urlDossier = 'https://drive.google.com/drive/folders/DOSSIER_AFFAIRE_ESSAI' } = {}) {
  const collections = {
    [C.devis]: [], [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti', emetteur: { nom: 'Entreprise Essai', siret: '123 456 789 00010' } }],
    [C.audit]: [], [C.auditAvant]: [], [C.affaires]: [{ id: 'aff1', nom: 'Rénovation Essai', urlDossier }], [C.organisations]: [{ id: 'org1', nom: 'Société Cliente Essai' }], [C.personnes]: [],
  };
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1', organisationId: 'org1', objet: 'Cuisine' }, { id: 'd1', maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20, margeDevis: 20 });
  collections[C.devis].push({ ...d, objet: 'Cuisine', sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'l1', libelle: 'Pose', unite: 'u', quantite: 2, prixAchat: PRIX_ACHAT }] }] });
  const donnees = creerAccesMemoire(collections);
  if (finaliser) await S.finaliser({ donnees, ctx: { acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd1' });
  return { collections, donnees };
}

/** Faux convertisseur et faux Cloud Storage : ils notent ce qu'ils reçoivent. */
function faux() {
  const vus = { html: [], pieds: [], ranges: [] };
  const objets = new Map();
  return {
    vus, objets,
    convertir: async (html, options) => { vus.html.push(html); vus.pieds.push(options?.pied); return { pdf: Buffer.from('%PDF-1.4 faux'), sha256: 'a'.repeat(64) }; },
    stockage: {
      envoyer: async (chemin, pdf) => { vus.ranges.push({ chemin, pdf }); objets.set(chemin, pdf); },
      existe: async (chemin) => objets.has(chemin),
      lienSigne: async (chemin, options) => `https://stockage.exemple.test/signe?o=${encodeURIComponent(chemin)}&m=${options.minutes}`,
    },
  };
}
const appel = (m, f, extra = {}) => creerAppelDevisPdf({ donnees: () => m.donnees, baseLien: BASE_LIEN, convertir: f.convertir, stockage: f.stockage, maintenant: () => MAINTENANT.getTime(), ...extra });

describe('Q1 devisPdf : seul un compte autorisé et vérifié appelle', () => {
  test('Q1 refus sans connexion, avec un compte inconnu et avec un e-mail non vérifié ; rien n\'est converti ni rangé', async () => {
    const m = await monde();
    const f = faux();
    const a = appel(m, f);
    await assert.rejects(() => a({ data: { devisId: 'd1' } }), (e) => e.code === 'unauthenticated');
    await assert.rejects(() => a(requete({ devisId: 'd1' }, 'intrus@exemple.test')), (e) => e.code === 'permission-denied');
    await assert.rejects(() => a(requete({ devisId: 'd1' }, ACTEUR, { email_verified: false })), (e) => e.code === 'permission-denied');
    assert.equal(f.vus.html.length + f.vus.ranges.length, 0);
    assert.equal(m.collections[C.devis][0].pdf, null); // la finalisation l'a remis à zéro
    await assert.rejects(() => a({ data: { devisId: 'd1', brouillon: true } }), (e) => e.code === 'unauthenticated'); // le brouillon à la demande est protégé de la même façon
  });
});

describe('Q2 devisPdf : un brouillon est refusé (sauf PDF « brouillon » demandé)', () => {
  test('Q2 le brouillon n\'a pas de PDF officiel ; un devis inconnu ou une demande sans identifiant sont refusés aussi', async () => {
    const m = await monde({ finaliser: false });
    const f = faux();
    const a = appel(m, f);
    await assert.rejects(() => a(requete({ devisId: 'd1' })), (e) => e.code === 'failed-precondition' && /brouillon/.test(e.message));
    await assert.rejects(() => a(requete({ devisId: 'inconnu' })), (e) => e.code === 'not-found');
    await assert.rejects(() => a(requete({})), (e) => e.code === 'invalid-argument');
    assert.equal(f.vus.html.length, 0);
    assert.equal(m.collections[C.devis][0].pdf, undefined);
  });
  test('Q2 avec brouillon: true, le brouillon est accepté : filigrane BROUILLON, champ pdf du devis intact', async () => {
    const m = await monde({ finaliser: false });
    const f = faux();
    const r = await appel(m, f)(requete({ devisId: 'd1', brouillon: true }));
    assert.equal(r.statut, 'ok');
    assert.ok(f.vus.html[0].includes('class="filigrane">BROUILLON'));
    assert.equal(m.collections[C.devis][0].pdf, undefined);
    assert.equal(f.vus.ranges[0].chemin, 'devis/aff1/d1/brouillon.pdf');
  });
});

describe('Q3 devisPdf : « PDF non configuré »', () => {
  test('Q3 sans espace de stockage, l\'erreur est claire et rien ne part', async () => {
    const m = await monde();
    for (const stockage of [null, undefined, () => null]) {
      const f = faux();
      const a = appel(m, f, { stockage });
      await assert.rejects(() => a(requete({ devisId: 'd1' })), (e) => e.code === 'failed-precondition' && e.message === MESSAGE_PDF_NON_CONFIGURE && /non configuré/.test(e.message));
      assert.equal(f.vus.html.length + f.vus.ranges.length, 0);
    }
  });
});

describe('Q4 devisPdf : chemin heureux', () => {
  test('15 Mon entreprise écrite par l\'écran (reglages.entreprise) et ses méthodes de paiement sortent dans le HTML ; un `entreprise` vide laisse l\'ancien `emetteur`', async () => {
    const m = await monde();
    m.collections[C.devisParametres][0] = { id: 'reglages', regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Ecran', paiement: { modes: ['Virement'] } } };
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1' }));
    assert.ok(f.vus.html[0].includes('Entreprise Ecran') && f.vus.html[0].includes('<li>Virement</li>'));
    const m2 = await monde();
    m2.collections[C.devisParametres][0] = { id: 'reglages', regimeTva: 'assujetti', entreprise: {}, emetteur: { nom: 'Ancien Emetteur' } };
    const f2 = faux();
    await appel(m2, f2)(requete({ devisId: 'd1' }));
    assert.ok(f2.vus.html[0].includes('Ancien Emetteur'));
  });
  test('Q4 le champ pdf est écrit (statut ok, chemin, sha256, genereLe), la réponse porte l\'adresse stable, le PDF est rangé sous le dossier de l\'affaire, le journal est écrit', async () => {
    const m = await monde();
    const f = faux();
    const r = await appel(m, f)(requete({ devisId: 'd1' }));
    assert.deepEqual(r, { statut: 'ok', lien: `${BASE_LIEN}/#/devis/pdf/d1`, nom: 'Devis DEV-2026-10-24-001 v1 – Cuisine.pdf' });
    const devis = m.collections[C.devis][0];
    assert.equal(devis.pdf.statut, 'ok');
    assert.equal(devis.pdf.chemin, 'devis/aff1/d1/DEV-2026-10-24-001 v1 - Cuisine.pdf');
    assert.equal(devis.pdf.sha256, 'a'.repeat(64));
    assert.ok(devis.pdf.genereLe instanceof Date);
    assert.equal(devis.statut, 'en_attente_envoi'); // le statut n'a pas bougé
    assert.equal(f.vus.ranges.length, 1);
    assert.equal(f.vus.ranges[0].chemin, devis.pdf.chemin);
    assert.ok(f.vus.html[0].includes('Entreprise Essai') && f.vus.html[0].includes('Société Cliente Essai'));
    assert.ok(f.vus.pieds[0].includes(devis.numero)); // le pied du PDF porte le numéro du devis
    assert.ok(m.collections[C.audit].some((l) => l.outil === 'devisPdf' && l.docId === 'd1'));
  });
  test('Q4 une panne de conversion : le message est transmis, l\'échec est noté sur le devis (statut echec), le devis reste finalisé', async () => {
    const m2 = await monde();
    const casse = { ...faux(), convertir: async () => { throw new Error('PDF : le service de conversion a répondu 500.'); } };
    await assert.rejects(() => appel(m2, casse)(requete({ devisId: 'd1' })), (e) => e.code === 'internal' && /500/.test(e.message));
    assert.equal(m2.collections[C.devis][0].pdf.statut, 'echec');
    assert.equal(m2.collections[C.devis][0].statut, 'en_attente_envoi');
  });
});

describe('Q5 devisPdf : le document du client ne contient ni prix d\'achat ni marge', () => {
  test('Q5 le HTML envoyé au convertisseur ne porte ni la valeur d\'achat, ni les mots achat, marge, coefficient', async () => {
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
    assert.equal(f.vus.ranges[0].chemin.split('/').pop(), nomFichierDevis({ numero: devis.numero, version: devis.version, objet: devis.objet }));
    assert.equal(f.vus.ranges[0].chemin.split('/').pop(), 'DEV-2026-10-24-001 v1 - Cuisine.pdf');
  });
});

describe('Q8 devisPdf : le logo externe est retiré', () => {
  test('Q8 un logo https disparaît du HTML envoyé, une image data:image est conservée', async () => {
    const m = await monde();
    m.collections[C.devisParametres][0].emetteur.logo = 'https://interne.exemple.test/logo.png';
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1' }));
    assert.ok(!f.vus.html[0].includes('interne.exemple.test') && !f.vus.html[0].includes('<img'));
    const m2 = await monde();
    m2.collections[C.devisParametres][0].emetteur.logo = 'data:image/png;base64,iVBORw0KGgo=';
    const f2 = faux();
    await appel(m2, f2)(requete({ devisId: 'd1' }));
    assert.ok(f2.vus.html[0].includes('<img src="data:image/png;base64,iVBORw0KGgo='));
  });
});

describe('Q9 devisPdf : idempotence (plus de règle des 60 secondes)', () => {
  test('Q9 PDF déjà ok : le même est renvoyé sans refabriquer, à toute heure', async () => {
    const m = await monde();
    const f = faux();
    const r1 = await appel(m, f)(requete({ devisId: 'd1' }));
    const r2 = await appel(m, f)(requete({ devisId: 'd1' }));
    assert.deepEqual(r2, r1);
    const r3 = await appel(m, f, { maintenant: () => MAINTENANT.getTime() + 61000 })(requete({ devisId: 'd1' }));
    assert.deepEqual(r3, r1);
    assert.equal(f.vus.html.length, 1);
  });
  test('Q9 finaliser et nouvelle version remettent pdf à zéro', async () => {
    const m = await monde({ finaliser: false });
    m.collections[C.devis][0].pdf = { fileId: 'x' };
    await S.finaliser({ donnees: m.donnees, ctx: { acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd1' });
    assert.equal(m.collections[C.devis][0].pdf, null);
    m.collections[C.devis][0].pdf = { fileId: 'y' };
    await S.nouvelleVersion({ donnees: m.donnees, ctx: { acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT }, devisId: 'd1' });
    assert.equal(m.collections[C.devis].find((d) => d.version === 2).pdf, undefined);
  });
});

describe('Q10 fragmentDePage', () => {
  test('Q10 le texte est échappé et la page est coupée', () => {
    const h = fragmentDePage('a <b> & c\nd');
    assert.ok(h.includes('a &lt;b&gt; &amp; c<br>d') && h.includes('page-break-after:always'));
    assert.ok(devisHtml({ numero: 'X' }, { pagesAvant: [h] }).includes(h));
  });
});

describe('Q11 devisPdf : échecs du rangement et erreurs inattendues', () => {
  test('Q11 Stockage en échec : message « Stockage : … » transmis tel quel, pdf noté en échec', async () => {
    const m = await monde();
    const f = faux();
    f.stockage.envoyer = async () => { throw new Error('Stockage : le PDF n\'a pas pu être enregistré.'); };
    await assert.rejects(() => appel(m, f)(requete({ devisId: 'd1' })), (e) => e.code === 'internal' && e.message === 'Stockage : le PDF n\'a pas pu être enregistré.');
    assert.equal(m.collections[C.devis][0].pdf.statut, 'echec');
  });
  test('Q11 erreur non préfixée : message générique, sans détail', async () => {
    const m = await monde();
    const f = { ...faux(), convertir: async () => { throw new Error('secret interne /var/task'); } };
    await assert.rejects(() => appel(m, f)(requete({ devisId: 'd1' })), (e) => e.code === 'internal' && e.message === 'Une erreur est survenue. Réessaie.' && !/secret|var\/task/.test(e.message));
    assert.ok(!/secret|var/.test(JSON.stringify(m.collections[C.devis][0].pdf))); // le message noté sur le devis est aussi générique
    assert.equal(m.collections[C.devis][0].pdf.statut, 'echec');
  });
});

describe('7 devisPdf : pied de page du PDF brouillon (date et heure de génération, heure de Paris)', () => {
  test('7 le PDF brouillon porte « Brouillon v1 · généré le … à … h … » ; le PDF finalisé garde son pied (le numéro seulement)', async () => {
    const m = await monde({ finaliser: false });
    const f = faux();
    await appel(m, f)(requete({ devisId: 'd1', brouillon: true }));
    assert.match(f.vus.pieds[0], /<span>Brouillon v1 · généré le 24\/10\/2026 à 12 h 00<\/span>/);
    assert.match(f.vus.pieds[0], /Page <span class="pageNumber">/);
    const fini = await monde();
    const g = faux();
    await appel(fini, g)(requete({ devisId: 'd1' }));
    assert.ok(!/généré le|Brouillon/.test(g.vus.pieds[0]), 'le pied du PDF finalisé ne change pas');
    assert.match(g.vus.pieds[0], /<span>DEV-2026-10-24-001<\/span>/);
  });
  test('7 la date est celle de la fabrication, à l\'heure de Paris, y compris au passage à l\'heure d\'hiver (25/10/2026 à 02 h)', async () => {
    for (const [instant, attendu] of [['2026-10-24T23:30:00Z', '25/10/2026 à 01 h 30'], ['2026-10-25T01:30:00Z', '25/10/2026 à 02 h 30'], ['2026-07-01T10:05:00Z', '01/07/2026 à 12 h 05']]) {
      const m = await monde({ finaliser: false });
      const f = faux();
      await appel(m, f, { maintenant: () => new Date(instant).getTime() })(requete({ devisId: 'd1', brouillon: true }));
      assert.ok(f.vus.pieds[0].includes(`généré le ${attendu}`), `${instant} -> ${attendu}`);
    }
  });
  test('7 sans date donnée, piedParDefaut rend exactement le pied d\'avant', async () => {
    const { piedParDefaut, dateHeureParis } = await import('../functions/src/devis/chromium.js');
    assert.ok(!piedParDefaut('DEV-1').includes('généré'));
    assert.equal(dateHeureParis('pas une date'), '');
  });
});

// ---------------------------------------------------------------- R : fichiers de l'onglet « Documents » (documentDeposer, documentLien, documentSupprimer) chez Jérôme
describe('R fichiers déposés : dépôt, lien, suppression (faux Cloud Storage, aucune règle Storage touchée)', () => {
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
  const b64 = (b) => Buffer.from(b).toString('base64');
  function mondeDocs(reglages = {}) {
    const collections = {
      [C.affaires]: [{ id: 'aff1', titre: 'A' }], [C.projets]: [{ id: 'pr1', titre: 'P' }], [C.documentsStockes]: [], [C.audit]: [], [C.auditAvant]: [],
      [C.parametres]: [{ id: 'reglages', ...reglages }],
    };
    const donnees = creerAccesMemoire(collections);
    const objets = new Map();
    const signes = [];
    const stockage = {
      deposer: async (chemin, octets, type) => { objets.set(chemin, { octets, type }); },
      supprimer: async (chemin) => { objets.delete(chemin); },
      lienSigne: async (chemin, o) => { signes.push({ chemin, ...o }); return `https://stockage.exemple.test/signe?o=${encodeURIComponent(chemin)}`; },
    };
    const a = (op, extra = {}) => creerAppelDocument(op, { donnees: () => donnees, stockage, maintenant: () => MAINTENANT.getTime(), ...extra });
    return { collections, donnees, objets, signes, stockage, a };
  }
  const depot = (m, data, email = ACTEUR) => m.a('deposer')(requete({ affaireId: 'aff1', nom: 'Plan.pdf', contenuBase64: b64(PDF), typeMime: 'application/pdf', ...data }, email));

  test('R1 un compte autorisé dépose un PDF : fichier sous documents/affaire/<id>/, fiche, journal ; les autres sont refusés', async () => {
    const m = mondeDocs();
    await assert.rejects(() => m.a('deposer')({ data: {} }), (e) => e.code === 'unauthenticated');
    await assert.rejects(() => depot(m, {}, 'intrus@exemple.test'), (e) => e.code === 'permission-denied');
    const r = await depot(m, { nom: '../Plan é.pdf' });
    assert.equal(r.nom, 'Plan é.pdf');
    const fiche = m.collections[C.documentsStockes][0];
    assert.match(fiche.chemin, /^documents\/affaire\/aff1\/[0-9a-f-]{36}-Plan é\.pdf$/);
    assert.equal(m.objets.get(fiche.chemin).type, 'application/pdf');
    assert.equal(fiche.creePar, ACTEUR);
    assert.equal(fiche.taille, PDF.length);
    assert.ok(m.collections[C.audit].some((l) => l.outil === 'documentDeposer' && l.via === 'ecran' && l.action === 'creer'));
    const projet = await depot(m, { affaireId: undefined, projetId: 'pr1', nom: 'Note.txt', contenuBase64: b64('bonjour'), typeMime: 'text/plain' });
    assert.match(m.collections[C.documentsStockes].find((f) => f.id === projet.id).chemin, /^documents\/projet\/pr1\//);
  });

  test('R2 refus : exe, html, svg, double extension, type mensonger, contenu qui ne correspond pas, inconnu, ni affaire ni projet ; rien n’est écrit', async () => {
    const m = mondeDocs();
    const faux = (data) => assert.rejects(() => depot(m, data), (e) => e.code === 'invalid-argument' || e.code === 'not-found');
    await faux({ nom: 'virus.exe', contenuBase64: b64('MZ'), typeMime: 'application/x-msdownload' });
    await faux({ nom: 'page.html', contenuBase64: b64('<script>'), typeMime: 'text/html' });
    await faux({ nom: 'image.svg', contenuBase64: b64('<svg onload=x>'), typeMime: 'image/svg+xml' });
    await faux({ nom: 'facture.pdf.exe' });
    await faux({ nom: 'facture.exe.pdf' });
    await faux({ nom: 'x.pdf', typeMime: 'text/html' }); // type annoncé mensonger
    await faux({ nom: 'x.pdf', contenuBase64: b64('MZ pas un pdf'), typeMime: 'application/pdf' }); // contenu mensonger
    await faux({ nom: 'x.inconnu', contenuBase64: b64('x'), typeMime: '' });
    await faux({ nom: '..', contenuBase64: b64('x') });
    await faux({ affaireId: undefined });
    await faux({ affaireId: 'aff1', projetId: 'pr1' });
    await faux({ affaireId: 'inconnue' });
    await faux({ contenuBase64: '***pas du base64***' });
    assert.equal(m.objets.size, 0);
    assert.equal(m.collections[C.documentsStockes].length, 0);
  });

  test('R3 taille : le réglage de l’espace, le plafond de 20 Mo, un réglage absurde ramené à 20 Mo, doublon de nom suffixé', async () => {
    const m = mondeDocs({ tailleMaxFichierMo: 1 });
    const grand = Buffer.concat([PDF, Buffer.alloc(1.5 * 1024 * 1024)]);
    await assert.rejects(() => depot(m, { contenuBase64: b64(grand) }), (e) => /taille maximale de l'espace est de 1 Mo/.test(e.message));
    const m2 = mondeDocs({ tailleMaxFichierMo: 9999 });
    const trop = Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]);
    await assert.rejects(() => depot(m2, { contenuBase64: b64(trop) }), (e) => /envoi direct n'est pas encore disponible/.test(e.message));
    await depot(m2, {});
    const r = await depot(m2, {});
    assert.equal(r.nom, 'Plan (2).pdf');
    assert.equal(m2.objets.size, 2);
  });

  test('R4 lien : 5 minutes, type servi = celui de l’extension ; chemin hors de l’espace ou de la cible : rien n’est signé', async () => {
    const m = mondeDocs();
    const r = await depot(m, {});
    const lien = await m.a('lien')(requete({ documentId: r.id }));
    assert.equal(lien.expireDans, 300);
    assert.equal(m.signes[0].minutes, 5);
    assert.equal(m.signes[0].typeMime, 'application/pdf');
    assert.equal(m.signes[0].telecharger, false);
    const img = await depot(m, { nom: 'Photo.png', contenuBase64: b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])), typeMime: 'image/png' });
    await m.a('lien')(requete({ documentId: img.id }));
    assert.equal(m.signes[1].typeMime, 'image/png');
    const piege = (id, chemin) => m.collections[C.documentsStockes].push({ id, cibleType: 'affaire', cibleId: 'aff1', nom: 'x.pdf', chemin, supprimeLe: null });
    piege('piege', 'devis/aff1/d1/secret.pdf');
    piege('piege2', 'documents/affaire/autre/0-x.pdf');
    piege('piege3', 'documents/affaire/aff1/../autre/x.pdf');
    for (const id of ['piege', 'piege2', 'piege3']) await assert.rejects(() => m.a('lien')(requete({ documentId: id })), (e) => e.code === 'invalid-argument');
    await assert.rejects(() => m.a('lien')(requete({ documentId: 'inconnu' })), (e) => e.code === 'not-found');
    await assert.rejects(() => m.a('lien')(requete({})), (e) => e.code === 'invalid-argument');
    assert.equal(m.signes.length, 2);
    // la vraie fabrication du lien : le type demandé est transmis (une image ne s'ouvre pas en PDF) ; sans type, PDF comme avant
    const recus = [];
    const bucket = { file: () => ({ getSignedUrl: async (o) => { recus.push(o); return ['https://x.test/u']; } }) };
    await creerStockage({ bucket }).lienSigne('documents/affaire/a/1-x.png', { nomAffiche: 'é.png', typeMime: 'image/png' });
    await creerStockage({ bucket }).lienSigne('devis/a/d/x.pdf', { nomAffiche: 'Devis.pdf' });
    assert.equal(recus[0].responseType, 'image/png');
    assert.equal(recus[1].responseType, 'application/pdf');
  });

  test('R5 suppression : corbeille logique (le fichier ne bouge pas), journal, plus de lien ; restaurer remet la fiche', async () => {
    const m = mondeDocs();
    const r = await depot(m, {});
    const sup = await m.a('supprimer')(requete({ documentId: r.id }));
    assert.equal(sup.nom, 'Plan.pdf');
    const fiche = m.collections[C.documentsStockes][0];
    assert.ok(fiche.supprimeLe);
    assert.equal(fiche.supprimePar, ACTEUR);
    assert.equal(m.objets.size, 1, 'le fichier reste en réserve');
    const ligne = m.collections[C.audit].find((l) => l.outil === 'documentSupprimer');
    assert.equal(ligne.action, 'modifier');
    assert.deepEqual([...ligne.champsModifies].sort(), ['supprimeLe', 'supprimePar']);
    await assert.rejects(() => m.a('lien')(requete({ documentId: r.id })), (e) => e.code === 'not-found');
    await assert.rejects(() => m.a('supprimer')(requete({ documentId: r.id })), (e) => e.code === 'not-found');
    const { restaurerOperation } = await import('../functions/src/coeur/restaurer.js');
    await restaurerOperation({ donnees: m.donnees, ctx: { acteur: ACTEUR, via: 'mcp', maintenant: MAINTENANT }, operationId: ligne.operationId, apercu: false });
    assert.equal(m.collections[C.documentsStockes][0].supprimeLe, null);
    await m.a('lien')(requete({ documentId: r.id }));
  });

  test('R6 stockage introuvable ou sans droit : message clair, rien n’est écrit', async () => {
    const m = mondeDocs();
    const sans = m.a('deposer', { stockage: null });
    await assert.rejects(() => sans(requete({ affaireId: 'aff1', nom: 'a.pdf', contenuBase64: b64(PDF) })), (e) => e.code === 'failed-precondition' && /stockage/.test(e.message));
    const droit = m.a('deposer', { stockage: { deposer: async () => { throw new Error('Stockage : x', { cause: { code: 403 } }); }, supprimer: async () => {} } });
    await assert.rejects(() => droit(requete({ affaireId: 'aff1', nom: 'a.pdf', contenuBase64: b64(PDF) })), (e) => e.code === 'failed-precondition' && /droit/.test(e.message));
    assert.equal(m.collections[C.documentsStockes].length, 0);
  });
});
