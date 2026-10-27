// Dossier de travail et PDF des devis : à la création (ou liaison) du dossier, les PDF des devis finalisés de l'affaire y sont copiés (drive-copie.js), puis leurs liens stables
// rejoignent les Documents de l'affaire. Aucun navigateur : un faux Drive répond. Le nom de chaque test commence par le numéro du point du brief.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../js/modules/devis/drive-copie.js';
import { lienStablePdf } from '../functions/src/devis/pdf-service.js';
import { BASE_LIEN_PLATEFORME } from '../functions-plateforme/src/devis-pdf.js';
import { lienStablePdfNavigateur, BASE_LIEN_JEROME } from '../js/modules/devis/pdf.js';
import { changementsDocumentsJournal } from '../js/modules/crm/logique.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const DOSSIER = 'DOSSIER_TRAVAIL_0123456789';
const AFFAIRE = { id: 'a1', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` };
const devis = (id, numero, surcharge = {}) => ({ id, numero, version: 1, objet: 'Cuisine', statut: 'envoye', affaireId: 'a1', pdf: { statut: 'ok', chemin: `${id}.pdf` }, ...surcharge });
const LISTE = [devis('d1', 'DEV-1'), devis('d2', 'DEV-2'), devis('d3', 'DEV-3', { statut: 'brouillon', pdf: undefined }), devis('d4', 'DEV-4', { affaireId: 'autre' }), devis('d5', 'DEV-5', { pdf: { statut: 'echec' } })];

function fauxDrive({ fichiers = [], echecEnvoiPour = '' } = {}) {
  const f = { dossiers: [], fichiers: [...fichiers], creations: [], envois: [] };
  f.appel = async (url, options = {}) => {
    const rep = (statut, corps) => ({ ok: statut < 400, status: statut, json: async () => corps });
    if ((options.method || 'GET') === 'GET') {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
      const nom = /name = '(.*?)' and/.exec(q)?.[1];
      const parent = /and '([^']+)' in parents/.exec(q)?.[1];
      const liste = (/mimeType != /.test(q) ? f.fichiers : f.dossiers).filter((x) => x.name === nom && x.parent === parent);
      return rep(200, { files: liste.map((x) => ({ id: x.id, name: x.name })) });
    }
    if (url.includes('/upload/')) {
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(await options.body.text())[1]);
      if (echecEnvoiPour && meta.name.includes(echecEnvoiPour)) return rep(403, { error: { status: 'PERMISSION_DENIED' } });
      f.envois.push(meta);
      f.fichiers.push({ id: `F${f.envois.length}_abcdefghijk`, name: meta.name, parent: meta.parents[0] });
      return rep(200, { id: `F${f.envois.length}_abcdefghijk`, name: meta.name });
    }
    const corps = JSON.parse(options.body);
    f.creations.push(corps);
    const id = `SOUS_${f.creations.length}_abcdefghijk`;
    f.dossiers.push({ id, name: corps.name, parent: corps.parents[0] });
    return rep(200, { id, name: corps.name });
  };
  return f;
}
const outils = (drive, surcharge = {}) => ({ appelFetch: drive.appel, obtenirJeton: async () => 'JETON', lirePdf: async () => new Blob(['%PDF-FAUX']), ...surcharge });

describe('Dossier de travail : copie de tous les PDF des devis finalisés', () => {
  test('2 seuls les devis de CETTE affaire, finalisés et au PDF prêt sont copiés (pas de brouillon, pas d’autre affaire, pas de PDF en échec)', () => {
    assert.deepEqual(C.devisAvecPdfDeAffaire(LISTE, 'a1').map((d) => d.id), ['d1', 'd2']);
    assert.deepEqual(C.devisAvecPdfDeAffaire(LISTE, 'autre').map((d) => d.id), ['d4']);
    assert.deepEqual(C.devisAvecPdfDeAffaire(null, 'a1'), []);
    assert.deepEqual(C.devisAvecPdfDeAffaire(LISTE, ''), []);
  });

  test('2 tous les PDF partent dans un seul sous-dossier « Devis », sous le bon nom, le jeton n’est demandé qu’une fois', async () => {
    const drive = fauxDrive();
    let jetons = 0;
    const r = await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: LISTE, outils: outils(drive, { obtenirJeton: async () => { jetons += 1; return 'JETON'; } }) });
    assert.deepEqual([r.total, r.copies, r.deja, r.echecs], [2, 2, 0, 0]);
    assert.equal(r.texte, '2 PDF copiés dans le dossier.');
    assert.equal(drive.creations.length, 1);
    assert.deepEqual(drive.envois.map((e) => e.name), ['Devis DEV-1 v1 – Cuisine.pdf', 'Devis DEV-2 v1 – Cuisine.pdf']);
    assert.equal(jetons, 1);
  });

  test('2 sans doublon : un second passage (deux onglets, dossier lié après coup) ne recopie rien et ne supprime rien', async () => {
    const drive = fauxDrive();
    await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: LISTE, outils: outils(drive) });
    const r = await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: LISTE, outils: outils(drive) });
    assert.deepEqual([r.copies, r.deja, r.echecs], [0, 2, 0]);
    assert.equal(r.texte, 'Les PDF des devis sont déjà dans le dossier.');
    assert.equal(drive.envois.length, 2);
    assert.equal(drive.creations.length, 1);
  });

  test('2 compte rendu simple : un PDF, des PDF dont certains déjà là, rien à copier', () => {
    assert.equal(C.messageCopieLot({ total: 1, copies: 1 }).texte, '1 PDF copié dans le dossier.');
    assert.equal(C.messageCopieLot({ total: 3, copies: 3 }).texte, '3 PDF copiés dans le dossier.');
    assert.equal(C.messageCopieLot({ total: 3, copies: 2, deja: 1 }).texte, '2 PDF copiés dans le dossier (1 était déjà présent).');
    assert.equal(C.messageCopieLot({ total: 0 }).texte, '');
  });

  test('2 échec partiel : « 2 sur 3 copiés : réessaie », jamais silencieux, et les autres PDF sont quand même copiés', async () => {
    const drive = fauxDrive({ echecEnvoiPour: 'DEV-2' });
    const liste = [...LISTE, devis('d6', 'DEV-6')];
    const r = await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: liste, outils: outils(drive) });
    assert.deepEqual([r.total, r.copies, r.echecs], [3, 2, 1]);
    assert.equal(r.type, 'erreur');
    assert.match(r.texte, /^2 sur 3 copiés : réessaie\. /);
    assert.deepEqual(drive.envois.map((e) => e.name), ['Devis DEV-1 v1 – Cuisine.pdf', 'Devis DEV-6 v1 – Cuisine.pdf']);
  });

  test('2 Drive refusé (fenêtre d’accord fermée) : tous les PDF sont « à réessayer », un seul message, rien n’est envoyé', async () => {
    const drive = fauxDrive();
    const r = await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: LISTE, outils: outils(drive, { obtenirJeton: async () => { throw Object.assign(new Error('Autorisation refusée : rien n’a été fait.'), { annule: true }); } }) });
    assert.deepEqual([r.total, r.copies, r.echecs], [2, 0, 2]);
    assert.equal(r.type, 'erreur');
    assert.match(r.texte, /0 sur 2 copiés : réessaie\./);
    assert.equal(drive.envois.length + drive.creations.length, 0);
  });

  test('2 PDF illisible (stockage sans autorisation du site) : message qui dit quoi faire, pas d’exception', async () => {
    const drive = fauxDrive();
    const r = await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: LISTE, outils: outils(drive, { lirePdf: async () => { throw new TypeError('Failed to fetch'); } }) });
    assert.equal(r.echecs, 2);
    assert.ok(r.texte.includes(C.MESSAGE_LECTURE_PDF));
  });

  test('2 affaire sans devis finalisé : rien à copier, aucun appel à Google', async () => {
    const drive = fauxDrive();
    let jeton = false;
    const r = await C.copierPdfsAffaire({ affaire: AFFAIRE, devisListe: [LISTE[2]], outils: outils(drive, { obtenirJeton: async () => { jeton = true; return 'x'; } }) });
    assert.deepEqual([r.total, r.texte], [0, '']);
    assert.equal(jeton, false);
  });
});

describe('Dossier de travail : liens stables dans les Documents de l’affaire', () => {
  test('3 l’adresse stable du navigateur est EXACTEMENT celle du serveur, chez Jérôme et chez un client (modèle S1 de devis-pdf-ecran)', () => {
    assert.match(lire('functions/src/index.js'), new RegExp(`const BASE_LIEN_DEVIS = '${BASE_LIEN_JEROME.replace(/\./g, '\\.')}';`));
    assert.equal(lienStablePdfNavigateur('d 1'), lienStablePdf(BASE_LIEN_JEROME, 'd 1'));
    assert.equal(lienStablePdfNavigateur('d1', { client: 'ingrid' }), lienStablePdf(BASE_LIEN_PLATEFORME, 'd1', false, 'espace/ingrid'));
    assert.match(lire('functions-plateforme/src/devis-pdf.js'), /const routeDe = \(client\) => `espace\/\$\{client\}`;/);
  });

  test('3 seuls les liens absents sont ajoutés (reconnus par leur adresse) : pas de doublon avec ceux du serveur ; libellé = nom du PDF', () => {
    const deja = [{ libelle: 'Devis DEV-1 v1 – Cuisine.pdf', url: lienStablePdf(BASE_LIEN_JEROME, 'd1'), ajouteLe: '2026-10-26T10:00:00.000Z' }, { libelle: 'Plan', url: 'https://exemple.fr/plan' }];
    const liste = C.devisAvecPdfDeAffaire(LISTE, 'a1').map((d) => (d.id === 'd2' ? { ...d, pdf: { statut: 'ok', nom: 'Devis DEV-2 v1 – Nom du serveur.pdf' } } : d));
    const nouveaux = C.documentsAAjouter({ devisListe: liste, documents: deja, maintenant: new Date('2026-10-26T12:00:00Z') });
    assert.deepEqual(nouveaux, [{ libelle: 'Devis DEV-2 v1 – Nom du serveur.pdf', url: lienStablePdf(BASE_LIEN_JEROME, 'd2'), ajouteLe: '2026-10-26T12:00:00.000Z' }]);
    assert.deepEqual(C.documentsAAjouter({ devisListe: liste, documents: [...nouveaux, ...deja] }), []);
  });

  test('3 un lien de Jérôme n’est pas pris pour celui d’un client', () => {
    const jerome = [{ url: lienStablePdf(BASE_LIEN_JEROME, 'd1') }];
    assert.equal(C.documentsAAjouter({ devisListe: [LISTE[0]], documents: jerome, client: 'ingrid' }).length, 1);
  });

  test('3 « Document joint » ne sort que pour un lien nouveau (logique existante du journal : on ne l’écrit pas à la main)', () => {
    const avant = [{ libelle: 'Devis DEV-1 v1 – Cuisine.pdf', url: lienStablePdf(BASE_LIEN_JEROME, 'd1') }];
    const nouveaux = C.documentsAAjouter({ devisListe: C.devisAvecPdfDeAffaire(LISTE, 'a1'), documents: avant });
    assert.deepEqual(changementsDocumentsJournal(avant, [...avant, ...nouveaux]), ['Document joint : Devis DEV-2 v1 – Cuisine.pdf']);
    assert.ok(!/evenement|ecrireEvenement/.test(lire('js/modules/devis/dossier-travail.js').replace(/\/\/.*$/gm, '')), 'aucun événement écrit par le module Devis');
  });
});

describe('Dossier de travail : crochet du CRM', () => {
  test('1 le crochet reçoit « annoncer », un module qui plante donne un compte rendu d’erreur générique (jamais un silence), un module qui n’a rien à faire ne dit rien', async () => {
    const X = await import('../js/modules/crm/dossier-externe.js');
    const annonces = [];
    const retire = [X.inscrireApresDossierAffaire(async ({ annoncer }) => { annoncer('début'); return { texte: 'ok', type: 'info' }; }), X.inscrireApresDossierAffaire(async () => null), X.inscrireApresDossierAffaire(async () => { throw new Error('boum'); })];
    const origine = console.warn; console.warn = () => {};
    const r = await X.lancerApresDossierAffaire({ affaireId: 'a1', urlDossier: 'u', annoncer: (t) => annonces.push(t) });
    console.warn = origine;
    retire.forEach((f) => f());
    assert.deepEqual(annonces, ['début']);
    assert.deepEqual(r.map((x) => x.type), ['info', 'erreur']);
    assert.ok(!/PDF|devis/i.test(r[1].texte), 'texte de repli générique');
    assert.deepEqual(await X.lancerApresDossierAffaire({ affaireId: 'a1', urlDossier: 'u' }), [], 'aucun module inscrit : rien ne se passe');
  });

  test('1 garde-fous du crochet Devis : devis non chargés = compte rendu (pas de null silencieux), jeton refusé (401) = oublié, liens relus juste avant l’écriture, créer sans doublon si le dossier existe déjà', () => {
    const g = lire('js/modules/devis/dossier-travail.js');
    assert.match(g, /attendreDevis\(\)\)\) return \{ texte: 'Le dossier est prêt, mais les devis ne sont pas encore chargés/);
    assert.match(g, /bilan\.erreur\?\.statut === 401\) oublierJeton\(\)/);
    assert.match(g, /const affaire = CRM\.affaire\(affaireId\); \/\/ lecture la plus récente/);
    assert.match(g, /annoncer\('Copie des PDF des devis dans le dossier…'\)/);
    const e = lire('js/modules/devis/pdf-ecran.js');
    assert.match(e, /const frais = CRM\.affaire\(affaire\.id\);\s+if \(String\(frais\?\.urlDossier/);
    assert.match(e, /creerDossierDeLAffaire\(\{ affaire, nom: affaire\.titre, silencieux: true \}\)/);
    assert.match(e, /apresDossierAffaire\(affaire\.id, urlDossier, \{ silencieux: true \}\)/);
  });
});

describe('Dossier de travail : architecture et écrans', () => {
  test('1 le CRM n’importe aucun fichier du module Devis (il passe par le crochet dossier-externe.js) et le module Devis s’inscrit et se désinscrit', () => {
    for (const f of ['lanceurs.js', 'dossier-externe.js']) assert.ok(!/from '\.\.\/devis\//.test(lire(`js/modules/crm/${f}`)), f);
    const index = lire('js/modules/devis/index.js');
    assert.match(index, /inscrireApresDossierAffaire\(apresDossierDeTravail\)/);
    assert.match(index, /retirerCrochetDossier\?\.\(\); retirerCrochetDossier = null;/);
  });

  test('1 l’écran du PDF propose UN clic pour créer le dossier (bouton en contour : « Ouvrir le PDF » reste le seul jaune), seulement si on peut le créer', () => {
    const ecran = lire('js/modules/devis/pdf-ecran.js');
    assert.match(ecran, /dest\.genre === 'sans-dossier' && affaire && dossierCreable\(\)/);
    assert.match(lire('js/modules/devis/dossier-travail.js'), /boutonsDepot === true && googleDisponible\(\) && CRM\.compteCourant\(\)\?\.ecrit !== false/);
    assert.match(ecran, /boutonDrive\(`Créer le dossier « \$\{affaire\.titre\} » et y copier le PDF`, 'creer-dossier-et-copier'/);
    assert.match(ecran, /creerDossierDeLAffaire\(\{ affaire, nom: affaire\.titre/);
    assert.equal(C.MESSAGE_SANS_DOSSIER_ECRAN, 'Cette affaire n’a pas encore de dossier de travail.');
  });

  test('2 la fiche de l’affaire (création et liaison) lance le même crochet, jamais pour un projet', () => {
    const l = lire('js/modules/crm/lanceurs.js');
    assert.equal((l.match(/if \(typeFiche === 'affaire'\) await apresDossierAffaire\(fiche\.id/g) || []).length, 2);
  });

  test('5 les messages ne disent plus « rangé dans l’affaire seulement » et ne contiennent ni « CRM » ni « répertoire »', () => {
    const textes = [C.MESSAGE_SANS_DOSSIER, C.MESSAGE_SANS_DOSSIER_ECRAN, C.MESSAGE_DOSSIER_PAS_DRIVE, C.MESSAGE_GOOGLE_ABSENT, C.messageCopieLot({ total: 3, copies: 2, echecs: 1 }).texte].join(' ');
    assert.ok(!/affaire seulement|crm|répertoire/i.test(textes));
  });
});
