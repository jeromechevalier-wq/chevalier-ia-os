// Copie du PDF d'un devis dans le dossier de travail Drive de l'affaire (js/modules/devis/drive-copie.js). Aucun navigateur : un faux Drive répond aux requêtes.
// Un test par critère ; le nom du test commence par le numéro du critère (voir la description de la PR).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../js/modules/devis/drive-copie.js';
import { libelleDocumentDevis } from '../functions/src/devis/stockage.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const DOSSIER = 'DOSSIER_TRAVAIL_0123456789';
const DEVIS = { id: 'd1', numero: 'DEV-2026-10-25-001', version: 2, objet: 'Rénovation cuisine', statut: 'envoye', affaireId: 'a1', pdf: { statut: 'ok', chemin: 'x.pdf' } };
const AFFAIRE = { id: 'a1', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` };

/** Faux Drive : dossiers et fichiers en mémoire ; `echecEnvoi` = statut renvoyé pour l'envoi du fichier. */
function fauxDrive({ dossiers = [], fichiers = [], echecEnvoi = 0 } = {}) {
  const f = { dossiers: [...dossiers], fichiers: [...fichiers], creations: [], envois: [], recherches: 0, echecEnvoi };
  f.appel = async (url, options = {}) => {
    const rep = (statut, corps) => ({ ok: statut < 400, status: statut, json: async () => corps });
    const methode = options.method || 'GET';
    if (methode === 'GET') {
      f.recherches += 1;
      const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
      const nom = /name = '(.*?)' and/.exec(q)?.[1].replace(/\\'/g, "'");
      const parent = /and '([^']+)' in parents/.exec(q)?.[1];
      const liste = (/mimeType != /.test(q) ? f.fichiers : f.dossiers).filter((x) => x.name === nom && x.parent === parent);
      return rep(200, { files: liste.map((x) => ({ id: x.id, name: x.name })) });
    }
    if (url.includes('/upload/drive/v3/files')) {
      if (f.echecEnvoi) return rep(f.echecEnvoi, { error: { status: 'PERMISSION_DENIED' } });
      const texte = await options.body.text();
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(texte)[1]);
      f.envois.push({ ...meta, autorisation: options.headers.Authorization, contientPdf: texte.includes('%PDF-FAUX') });
      return rep(200, { id: `FICHIER_${f.envois.length}_abcdefghij`, name: meta.name });
    }
    const corps = JSON.parse(options.body);
    f.creations.push(corps);
    const id = `SOUS_DOSSIER_${f.creations.length}_abcdefghij`;
    f.dossiers.push({ id, name: corps.name, parent: corps.parents[0] });
    return rep(200, { id, name: corps.name });
  };
  return f;
}
const outils = (drive, surcharge = {}) => ({ appelFetch: drive.appel, obtenirJeton: async () => 'JETON_ESSAI', lirePdf: async () => new Blob(['%PDF-FAUX']), ...surcharge });

describe('Copie du PDF d’un devis dans le dossier de travail Drive', () => {
  test('1 le fichier porte le nom « Devis <numéro> v<version> – <objet>.pdf », le même que le document de l’affaire', () => {
    assert.equal(C.nomFichierDrive(DEVIS), 'Devis DEV-2026-10-25-001 v2 – Rénovation cuisine.pdf');
    for (const cas of [DEVIS, { numero: 'DEV-1', version: 1, objet: '' }, {}, { numero: 'A/B', version: 3, objet: 'x'.repeat(200) }, { numero: 'DEV-2', objet: 'Salle\nde bain' }]) {
      assert.equal(C.nomFichierDrive(cas), libelleDocumentDevis(cas), JSON.stringify(cas));
    }
  });

  test('2 le dossier de travail est lu dans l’adresse Drive de l’affaire ; devis pas finalisé ou PDF pas prêt = pas de copie', () => {
    assert.deepEqual(C.choisirDestination({ devis: DEVIS, affaire: AFFAIRE }), { genre: 'ok', dossierId: DOSSIER });
    assert.equal(C.choisirDestination({ devis: { ...DEVIS, statut: 'brouillon' }, affaire: AFFAIRE }).genre, 'pas-pret');
    assert.equal(C.choisirDestination({ devis: { ...DEVIS, pdf: { statut: 'echec' } }, affaire: AFFAIRE }).genre, 'pas-pret');
    assert.equal(C.choisirDestination({ devis: { ...DEVIS, pdf: { statut: 'en_cours', demarreLe: new Date() } }, affaire: AFFAIRE }).genre, 'pas-pret');
    assert.equal(C.choisirDestination({}).genre, 'pas-pret');
  });

  test('3 le sous-dossier « Devis » est créé une seule fois, puis le PDF y est envoyé sous le bon nom', async () => {
    const drive = fauxDrive();
    const r = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(drive) });
    assert.equal(r.etat, 'copie');
    assert.equal(r.message, 'PDF copié dans le dossier Devis de l’affaire');
    assert.equal(drive.creations.length, 1);
    assert.deepEqual([drive.creations[0].name, drive.creations[0].parents], ['Devis', [DOSSIER]]);
    assert.equal(drive.envois.length, 1);
    assert.equal(drive.envois[0].name, 'Devis DEV-2026-10-25-001 v2 – Rénovation cuisine.pdf');
    assert.deepEqual(drive.envois[0].parents, [drive.dossiers[0].id]);
    assert.equal(drive.envois[0].autorisation, 'Bearer JETON_ESSAI');
    assert.ok(drive.envois[0].contientPdf, 'le contenu du PDF est envoyé');
    // Un second devis dans la même affaire retrouve le sous-dossier au lieu d’en créer un autre.
    const r2 = await C.copierPdfDevis({ devis: { ...DEVIS, id: 'd2', version: 3 }, affaire: AFFAIRE, outils: outils(drive) });
    assert.equal(r2.etat, 'copie');
    assert.equal(drive.creations.length, 1, 'toujours un seul sous-dossier Devis');
    assert.equal(drive.envois.length, 2);
  });

  test('4 un fichier du même nom déjà dans le dossier Devis n’est pas recréé (ignoré, sans doublon)', async () => {
    const nom = C.nomFichierDrive(DEVIS);
    const drive = fauxDrive({ dossiers: [{ id: 'SOUS_DOSSIER_EXISTANT_01', name: 'Devis', parent: DOSSIER }], fichiers: [{ id: 'FICHIER_EXISTANT_0123', name: nom, parent: 'SOUS_DOSSIER_EXISTANT_01' }] });
    let pdfLu = false;
    const r = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(drive, { lirePdf: async () => { pdfLu = true; return new Blob(['x']); } }) });
    assert.equal(r.etat, 'deja');
    assert.equal(r.message, 'Ce PDF est déjà dans le dossier Devis de l’affaire.');
    assert.equal(drive.creations.length, 0);
    assert.equal(drive.envois.length, 0);
    assert.equal(pdfLu, false, 'le PDF n’est même pas téléchargé');
  });

  test('5 sans dossier de travail, ou dossier hors Drive, ou sans affaire : message clair, rien n’est demandé à Google (pas une erreur)', async () => {
    const drive = fauxDrive();
    let jetonDemande = false;
    const o = outils(drive, { obtenirJeton: async () => { jetonDemande = true; return 'x'; } });
    const sans = await C.copierPdfDevis({ devis: DEVIS, affaire: { id: 'a1', urlDossier: '' }, outils: o });
    assert.deepEqual([sans.etat, sans.genre], ['rien', 'sans-dossier']);
    assert.equal(sans.message, 'Cette affaire n’a pas de dossier de travail : le PDF est gardé avec le devis.');
    const nas = await C.copierPdfDevis({ devis: DEVIS, affaire: { id: 'a1', urlDossier: 'smb://serveur/clients/dupont' }, outils: o });
    assert.deepEqual([nas.etat, nas.genre], ['rien', 'pas-drive']);
    const siteWeb = await C.copierPdfDevis({ devis: DEVIS, affaire: { id: 'a1', urlDossier: 'https://exemple.fr/dossier' }, outils: o });
    assert.equal(siteWeb.genre, 'pas-drive');
    const sansAffaire = await C.copierPdfDevis({ devis: { ...DEVIS, affaireId: null }, affaire: null, outils: o });
    assert.equal(sansAffaire.genre, 'sans-affaire');
    assert.equal(jetonDemande, false);
    assert.equal(drive.recherches + drive.creations.length + drive.envois.length, 0);
  });

  test('6 Drive refusé ou non connecté : message clair (état « erreur », donc bouton Réessayer), jamais un échec silencieux', async () => {
    const drive = fauxDrive();
    const refus = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(drive, { obtenirJeton: async () => { throw Object.assign(new Error('Autorisation refusée : rien n’a été fait.'), { annule: true }); } }) });
    assert.equal(refus.etat, 'erreur');
    assert.equal(refus.message, C.MESSAGE_REFUS);
    const bloque = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(drive, { obtenirJeton: async () => { throw Object.assign(new Error('Le navigateur a bloqué la fenêtre d’autorisation Google : autorise les fenêtres surgissantes pour ce site, puis réessaie.'), { code: 'popup_failed_to_open' }); } }) });
    assert.equal(bloque.etat, 'erreur');
    assert.match(bloque.message, /bloqué la fenêtre/);
    const r403 = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(fauxDrive({ echecEnvoi: 403 })) });
    assert.equal(r403.etat, 'erreur');
    assert.match(r403.message, /droits insuffisants/);
    const r401 = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(fauxDrive({ echecEnvoi: 401 })) });
    assert.equal(r401.erreur.statut, 401);
    const reseau = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(drive, { appelFetch: async () => { throw new TypeError('Failed to fetch'); } }) });
    assert.equal(reseau.etat, 'erreur', 'une panne de réseau reste une erreur visible, jamais une exception');
  });

  test('6b le PDF illisible depuis le stockage donne un message qui dit quoi faire', async () => {
    const drive = fauxDrive();
    const r = await C.copierPdfDevis({ devis: DEVIS, affaire: AFFAIRE, outils: outils(drive, { lirePdf: async () => { throw new TypeError('Failed to fetch'); } }) });
    assert.equal(r.etat, 'erreur');
    assert.equal(r.message, C.MESSAGE_LECTURE_PDF);
    assert.equal(r.message, 'Le PDF n’a pas pu être lu pour la copie dans Drive. Réessaie ; si ça continue, il faut autoriser ce site dans le stockage (réglage à faire une fois).');
    assert.ok(!/\bPR\b/.test(r.message), 'aucun jargon de développeur');
    assert.equal(drive.envois.length, 0);
  });

  test('7 la mémoire locale est propre à un devis, une version (nom) et un dossier de travail', () => {
    const a = C.cleMemoire('d1', DOSSIER, C.nomFichierDrive(DEVIS));
    assert.notEqual(a, C.cleMemoire('d2', DOSSIER, C.nomFichierDrive(DEVIS)));
    assert.notEqual(a, C.cleMemoire('d1', 'AUTRE_DOSSIER_0123456789', C.nomFichierDrive(DEVIS)));
    assert.notEqual(a, C.cleMemoire('d1', DOSSIER, C.nomFichierDrive({ ...DEVIS, version: 3 })));
  });

  test('8 garde-fous : rien n’est écrit dans la base par le navigateur, le PDF brouillon n’est jamais copié, aucun mot interdit à l’écran', () => {
    const ecran = lire('js/modules/devis/pdf-ecran.js');
    const copie = lire('js/modules/devis/drive-copie.js');
    assert.ok(!/setDoc|updateDoc|addDoc|writeBatch/.test(ecran + copie), 'aucune écriture Firestore');
    assert.match(ecran, /brouillon \? null : h\('div'/, 'la zone de copie n’existe pas pour le PDF brouillon');
    const textes = [...copie.matchAll(/MESSAGE_[A-Z_]+ = '([^']*)'/g)].map((m) => m[1]).join(' ');
    assert.ok(textes.length > 200);
    assert.ok(!/crm|répertoire/i.test(textes), 'ni « CRM » ni « répertoire »');
  });

  test('9 sans jeton Google en mémoire, la copie automatique attend un vrai clic ; avec un jeton ou après un clic, elle part', () => {
    assert.equal(C.attendreUnClic({ automatique: true, jetonEnMemoire: false }), true);
    assert.equal(C.attendreUnClic({ automatique: true, jetonEnMemoire: true }), false);
    assert.equal(C.attendreUnClic({ automatique: false, jetonEnMemoire: false }), false, 'un bouton est un vrai clic');
    assert.equal(C.MESSAGE_AUTORISATION_DRIVE, 'Pour copier ce PDF dans Drive, appuie sur « Copier dans Drive ».');
    const ecran = lire('js/modules/devis/pdf-ecran.js');
    assert.match(ecran, /copierDansDrive\(zoneDrive, url, d, \{ automatique: true \}\)/, 'seul l’appel automatique est « sans clic »');
    assert.match(ecran, /'copier-drive'/);
  });

  test('10 l’écran attend que les affaires soient chargées avant de conclure « pas d’affaire »', () => {
    const ecran = lire('js/modules/devis/pdf-ecran.js');
    assert.match(ecran, /if \(!CRM\.estPret\(\)\)/);
    assert.match(ecran, /CRM\.surChangement\(/);
    assert.ok(ecran.indexOf('CRM.estPret()') < ecran.indexOf('choisirDestination('), 'la vérification précède le choix du dossier');
    assert.match(ecran, /if \(arretAffaires\) \{ arretAffaires\(\)/, 'l’abonnement est retiré à la sortie de l’écran');
  });

  test('11 un seul bouton jaune par écran : les boutons de la zone Drive sont en contour', () => {
    const ecran = lire('js/modules/devis/pdf-ecran.js');
    assert.match(ecran, /const boutonDrive = .*bouton-secondaire/);
    for (const action of ['recopier-drive', 'reessayer-drive', 'copier-drive']) assert.match(ecran, new RegExp(`boutonDrive\\('[^']+', '${action}'`), action);
    assert.ok(!/bouton\('[^']+', '(recopier|reessayer|copier)-drive'/.test(ecran));
  });

  test('12 si l’utilisateur quitte l’écran pendant la copie, le résultat est quand même annoncé et mémorisé', () => {
    const ecran = lire('js/modules/devis/pdf-ecran.js');
    const apres = ecran.slice(ecran.indexOf('await copierPdfDevis('), ecran.indexOf('const bouton = '));
    assert.ok(!/if \(arrete\) return;/.test(apres), 'plus de sortie anticipée avant le toast et la mémoire');
    assert.match(apres, /memoire\.ecrire\(cle\)/);
    assert.match(apres, /toast\(/);
  });

  test('13 le réglage CORS est expliqué dans docs/cors-stockage-pdf.md, sans cors.json à la racine du dépôt', () => {
    const doc = lire('docs/cors-stockage-pdf.md');
    assert.match(doc, /gsutil cors set cors\.json gs:\/\/<nom-du-bucket>/);
    assert.match(doc, /https:\/\/console\.cloud\.google\.com\/storage\/browser/);
    assert.match(doc, /"method": \["GET"\]/);
    assert.ok(!/crm/i.test(doc));
  });
});
