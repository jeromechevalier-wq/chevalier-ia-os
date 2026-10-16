// Aide Google Drive (js/os/google-drive.js) : réglages, adresses de dossiers, noms, création du dossier d'un projet et de ses sous-dossiers.
// Google est simulé par un faux `fetch` : aucune requête ne part, aucun jeton réel.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/os/google-drive.js';

const ID_CLIENT = '192468914925-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com';
const FB = { apiKey: 'AIzaSyBozQGcRbt3sOUr3K2pygTUFdCZKcvxTtI', messagingSenderId: '192468914925' };

/** Faux Google Drive : garde les requêtes reçues, crée des identifiants à la suite ; `echecs` : noms de dossiers refusés (statut donné). */
function fauxDrive({ echecs = {} } = {}) {
  const appels = [];
  let n = 0;
  const appelFetch = async (url, options) => {
    const corps = JSON.parse(options.body);
    appels.push({ url, options, corps });
    if (echecs[corps.name]) return { ok: false, status: echecs[corps.name], json: async () => ({ error: { status: 'ERREUR', message: 'refusé' } }) };
    n += 1;
    return { ok: true, status: 200, json: async () => ({ id: `ID_DOSSIER_${String(n).padStart(3, '0')}_xyz`, name: corps.name }) };
  };
  return { appels, appelFetch };
}

describe('G1 réglages Google : lus dans la configuration, rien en dur', () => {
  test('G1 sans identifiant client (ou mal formé) : null, donc boutons cachés', () => {
    assert.equal(G.lireConfigGoogle({ firebaseConfig: FB }), null);
    assert.equal(G.lireConfigGoogle({ firebaseConfig: FB, googleDrive: { idClient: '' } }), null);
    assert.equal(G.lireConfigGoogle({ firebaseConfig: FB, googleDrive: { idClient: 'pas-un-id' } }), null);
    assert.equal(G.lireConfigGoogle(null), null);
  });
  test('G1 avec l\'identifiant : la clé et le numéro de projet de Firebase sont repris, sauf s\'ils sont donnés', () => {
    assert.deepEqual(G.lireConfigGoogle({ firebaseConfig: FB, googleDrive: { idClient: ID_CLIENT } }), { idClient: ID_CLIENT, cleApi: FB.apiKey, idApp: '192468914925' });
    assert.deepEqual(G.lireConfigGoogle({ firebaseConfig: FB, googleDrive: { idClient: ID_CLIENT, cleApi: 'AIzaAutreCle', idApp: '123' } }), { idClient: ID_CLIENT, cleApi: 'AIzaAutreCle', idApp: '123' });
  });
  test('G1 la portée demandée est drive.file (fichiers créés ou choisis par l\'appli), jamais le Drive entier', () => {
    assert.equal(G.PORTEE_DRIVE, 'https://www.googleapis.com/auth/drive.file');
  });
});

describe('G2 adresses et noms de dossiers', () => {
  test('G2 l\'identifiant d\'un dossier Drive se lit dans son adresse ; les autres liens n\'en ont pas', () => {
    assert.equal(G.idDossierDrive('https://drive.google.com/drive/folders/1AbC_dEf-1234567'), '1AbC_dEf-1234567');
    assert.equal(G.idDossierDrive('https://drive.google.com/drive/u/0/folders/1AbC_dEf-1234567?usp=sharing'), '1AbC_dEf-1234567');
    for (const autre of ['', null, 'smb://nas/clients', 'https://exemple.fr/drive/folders/1AbC_dEf-1234567', 'https://drive.google.com/file/d/1AbC_dEf-1234567/view', 'https://drive.google.com/drive/folders/court']) {
      assert.equal(G.idDossierDrive(autre), '', String(autre));
    }
  });
  test('G2 l\'adresse d\'un dossier repose sur son identifiant : renommer le dossier dans Drive ne la change pas', () => {
    assert.equal(G.adresseDossierDrive('1AbC_dEf-1234567'), 'https://drive.google.com/drive/folders/1AbC_dEf-1234567');
    assert.equal(G.idDossierDrive(G.adresseDossierDrive('1AbC_dEf-1234567')), '1AbC_dEf-1234567');
  });
  test('G2 nom de dossier : espaces nettoyés, ni vide ni trop long, aucune convention imposée', () => {
    assert.deepEqual(G.nettoyerNomDossier('  Refonte   du site \n'), { nom: 'Refonte du site', erreur: '' });
    assert.deepEqual(G.nettoyerNomDossier('Client Carrel / Devis (2026)'), { nom: 'Client Carrel / Devis (2026)', erreur: '' });
    assert.match(G.nettoyerNomDossier('   ').erreur, /nom/);
    assert.match(G.nettoyerNomDossier('x'.repeat(201)).erreur, /trop long/);
    assert.equal(G.nettoyerNomDossier(null).nom, '');
  });
  test('G2 sous-dossiers : sans doublon (casse ignorée), sans ligne vide, 20 au plus', () => {
    assert.deepEqual(G.nettoyerSousDossiers([' Contrat ', 'contrat', '', 'Livrables', '  ']), { liste: ['Contrat', 'Livrables'], erreur: '' });
    assert.deepEqual(G.nettoyerSousDossiers(undefined), { liste: [], erreur: '' });
    assert.match(G.nettoyerSousDossiers(Array.from({ length: 21 }, (_, i) => `Dossier ${i}`)).erreur, /20/);
    assert.match(G.nettoyerSousDossiers(['ok', 'x'.repeat(201)]).erreur, /trop long/);
  });
});

describe('G3 création du dossier d\'un projet dans Google Drive', () => {
  test('G3 un dossier : requête vers l\'API Drive avec le jeton, le nom, le type dossier et le parent ; le lien repose sur l\'identifiant', async () => {
    const { appels, appelFetch } = fauxDrive();
    const r = await G.creerDossier({ jeton: 'ya29.TEST', nom: ' Refonte du site ', parentId: 'PARENT_0123456789', appelFetch });
    assert.deepEqual(r, { id: 'ID_DOSSIER_001_xyz', nom: 'Refonte du site', url: 'https://drive.google.com/drive/folders/ID_DOSSIER_001_xyz' });
    assert.equal(appels.length, 1);
    assert.match(appels[0].url, /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\?supportsAllDrives=true/);
    assert.equal(appels[0].options.method, 'POST');
    assert.equal(appels[0].options.headers.Authorization, 'Bearer ya29.TEST');
    assert.deepEqual(appels[0].corps, { name: 'Refonte du site', mimeType: 'application/vnd.google-apps.folder', parents: ['PARENT_0123456789'] });
  });
  test('G3 sans parent : créé à la racine de Mon Drive (pas de champ parents)', async () => {
    const { appels, appelFetch } = fauxDrive();
    await G.creerDossier({ jeton: 'j', nom: 'Racine', appelFetch });
    assert.equal('parents' in appels[0].corps, false);
  });
  test('G3 un nom vide ou un parent invalide est refusé avant tout appel', async () => {
    const { appels, appelFetch } = fauxDrive();
    await assert.rejects(G.creerDossier({ jeton: 'j', nom: ' ', appelFetch }), (e) => e.saisie === true);
    await assert.rejects(G.creerDossier({ jeton: 'j', nom: 'ok', parentId: '../../etc', appelFetch }), (e) => e.saisie === true);
    assert.equal(appels.length, 0);
  });
  test('G3 l\'arborescence : le dossier du projet d\'abord, puis les sous-dossiers dans l\'ordre, DANS le dossier du projet', async () => {
    const { appels, appelFetch } = fauxDrive();
    const r = await G.creerArborescence({ jeton: 'j', nom: 'Projet Carrel', parentId: 'PARENT_0123456789', sousDossiers: ['Contrat', 'Livrables', 'Échanges'], appelFetch });
    assert.deepEqual(appels.map((a) => a.corps.name), ['Projet Carrel', 'Contrat', 'Livrables', 'Échanges']);
    assert.deepEqual(appels[0].corps.parents, ['PARENT_0123456789']);
    for (const a of appels.slice(1)) assert.deepEqual(a.corps.parents, ['ID_DOSSIER_001_xyz']);
    assert.equal(r.dossier.url, 'https://drive.google.com/drive/folders/ID_DOSSIER_001_xyz');
    assert.deepEqual(r.sousDossiers.map((s) => s.nom), ['Contrat', 'Livrables', 'Échanges']);
    assert.deepEqual(r.manquants, []);
  });
  test('G3 un sous-dossier refusé ne bloque pas les autres : le dossier existe, les manquants sont nommés', async () => {
    const { appelFetch } = fauxDrive({ echecs: { Livrables: 500 } });
    const r = await G.creerArborescence({ jeton: 'j', nom: 'Projet', sousDossiers: ['Contrat', 'Livrables', 'Échanges'], appelFetch });
    assert.deepEqual(r.manquants, ['Livrables']);
    assert.deepEqual(r.sousDossiers.map((s) => s.nom), ['Contrat', 'Échanges']);
  });
  test('G3 le dossier principal refusé : tout s\'arrête, aucun sous-dossier n\'est tenté, message simple', async () => {
    const { appels, appelFetch } = fauxDrive({ echecs: { Projet: 404 } });
    await assert.rejects(G.creerArborescence({ jeton: 'j', nom: 'Projet', parentId: 'PARENT_0123456789', sousDossiers: ['Contrat'], appelFetch }), (e) => e.statut === 404 && /parent est introuvable/.test(e.message));
    assert.equal(appels.length, 1);
  });
  test('G3 liste de sous-dossiers invalide : refusée avant de créer quoi que ce soit', async () => {
    const { appels, appelFetch } = fauxDrive();
    await assert.rejects(G.creerArborescence({ jeton: 'j', nom: 'Projet', sousDossiers: ['x'.repeat(300)], appelFetch }), (e) => e.saisie === true);
    assert.equal(appels.length, 0);
  });
  test('G3 messages d\'erreur de Google en français simple (autorisation expirée, API non activée, droits, quota)', () => {
    assert.match(G.messageErreurDrive(401, {}), /autorisation/);
    assert.match(G.messageErreurDrive(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } }), /API Google Drive n’est pas activée/);
    assert.match(G.messageErreurDrive(403, {}), /droits/);
    assert.match(G.messageErreurDrive(429, {}), /patienter/);
    assert.match(G.messageErreurDrive(500, null), /500/);
  });
});

describe('G5 copie d\'un fichier dans le dossier de travail', () => {
  /** Faux Drive qui répond à files.copy. */
  const fauxCopie = (statut = 200) => {
    const appels = [];
    return { appels, appelFetch: async (url, options) => {
      appels.push({ url, options, corps: JSON.parse(options.body) });
      return { ok: statut === 200, status: statut, json: async () => (statut === 200 ? { id: 'COPIE_0123456789', name: 'Scan.jpg', webViewLink: 'https://drive.google.com/file/d/COPIE_0123456789/view?usp=drivesdk' } : { error: { status: 'NOT_FOUND' } }) };
    } };
  };
  test('G5 files.copy : le fichier est copié DANS le dossier (parents), le lien rendu est celui de la COPIE', async () => {
    const { appels, appelFetch } = fauxCopie();
    const r = await G.copierFichier({ jeton: 'ya29.TEST', fichierId: 'FICHIER_0123456789', parentId: 'DOSSIER_0123456789', nom: ' Scan.jpg ', appelFetch });
    assert.deepEqual(r, { id: 'COPIE_0123456789', nom: 'Scan.jpg', url: 'https://drive.google.com/file/d/COPIE_0123456789/view?usp=drivesdk' });
    assert.match(appels[0].url, /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/FICHIER_0123456789\/copy\?supportsAllDrives=true/);
    assert.equal(appels[0].options.method, 'POST');
    assert.equal(appels[0].options.headers.Authorization, 'Bearer ya29.TEST');
    assert.deepEqual(appels[0].corps, { parents: ['DOSSIER_0123456789'], name: 'Scan.jpg' });
  });
  test('G5 échec de Google : erreur claire (le code appelant garde alors le lien d\'origine) ; identifiants invalides refusés avant tout appel', async () => {
    await assert.rejects(G.copierFichier({ jeton: 'j', fichierId: 'FICHIER_0123456789', parentId: 'DOSSIER_0123456789', appelFetch: fauxCopie(404).appelFetch }), (e) => e.statut === 404 && /introuvable/.test(e.message));
    const { appels, appelFetch } = fauxCopie();
    await assert.rejects(G.copierFichier({ jeton: 'j', fichierId: '../x', parentId: 'DOSSIER_0123456789', appelFetch }), (e) => e.saisie === true);
    await assert.rejects(G.copierFichier({ jeton: 'j', fichierId: 'FICHIER_0123456789', parentId: '', appelFetch }), (e) => e.saisie === true);
    assert.equal(appels.length, 0);
  });
});

describe('G4 document choisi dans la fenêtre Google', () => {
  test('G4 un document Drive ou Docs entre dans la liste avec son nom ; autre chose est écarté', () => {
    assert.deepEqual(G.documentDepuisChoix({ nom: ' Devis  signé.pdf ', url: 'https://drive.google.com/file/d/abc/view?usp=drive_web' }), { libelle: 'Devis signé.pdf', url: 'https://drive.google.com/file/d/abc/view?usp=drive_web' });
    assert.deepEqual(G.documentDepuisChoix({ nom: '', url: 'https://docs.google.com/document/d/abc/edit' }), { libelle: 'https://docs.google.com/document/d/abc/edit', url: 'https://docs.google.com/document/d/abc/edit' });
    assert.equal(G.documentDepuisChoix({ nom: 'x', url: 'javascript:alert(1)' }), null);
    assert.equal(G.documentDepuisChoix({ nom: 'x', url: 'https://exemple.fr/file' }), null);
    assert.equal(G.documentDepuisChoix(null), null);
  });
});
