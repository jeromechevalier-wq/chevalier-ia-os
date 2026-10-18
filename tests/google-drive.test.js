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

describe('G6 que faire de la case « Copier » (import reconnu par deux signaux)', () => {
  const D = 'DOSSIER_0123456789';
  const maintenant = Date.parse('2026-10-17T12:00:00Z');
  const info = (parents, creeLe) => ({ parents, creeLe: creeLe ? new Date(creeLe) : null });
  test('G6 dans le dossier ET créé à l\'instant → importé ; dans le dossier mais ancien → déjà dedans ; ailleurs → copiable', () => {
    assert.equal(G.etatCopie({ info: info([D], '2026-10-17T11:58:00Z'), dossierId: D, maintenant }), 'importe');
    assert.equal(G.etatCopie({ info: info([D], '2026-10-16T11:58:00Z'), dossierId: D, maintenant }), 'dejaDans');
    assert.equal(G.etatCopie({ info: info(['AUTRE_01234567'], '2026-10-17T11:59:00Z'), dossierId: D, maintenant }), 'copiable');
  });
  test('G6 Drive ne répond pas : on se rabat sur le dossier d\'origine de la fenêtre Google ; sans rien : incertain (on ne copie pas)', () => {
    assert.equal(G.etatCopie({ info: null, parentIdFenetre: D, dossierId: D, maintenant }), 'importe');
    assert.equal(G.etatCopie({ info: null, parentIdFenetre: 'AUTRE_01234567', dossierId: D, maintenant }), 'copiable');
    assert.equal(G.etatCopie({ info: null, parentIdFenetre: '', dossierId: D, maintenant }), 'incertain');
  });
  test('G6 files.get demande parents et createdTime ; une erreur de Google donne null', async () => {
    let url = '';
    const r = await G.infoFichier({ jeton: 'j', fichierId: 'FICHIER_0123456789', appelFetch: async (u) => { url = u; return { ok: true, json: async () => ({ parents: [D], createdTime: '2026-10-17T11:59:00Z' }) }; } });
    assert.match(url, /fields=parents,createdTime/);
    assert.deepEqual(r.parents, [D]);
    assert.equal(r.creeLe.toISOString(), '2026-10-17T11:59:00.000Z');
    assert.equal(await G.infoFichier({ jeton: 'j', fichierId: 'FICHIER_0123456789', appelFetch: async () => ({ ok: false, status: 500 }) }), null);
    assert.equal(await G.infoFichier({ jeton: 'j', fichierId: '../x' }), null);
  });
});

describe('G7 dossier parent créé tout seul au premier besoin', () => {
  /** Faux Drive : annuaire de dossiers (créés par l'appli) ; `supprimes` : identifiants qui n'existent plus. */
  const faux = ({ existants = [], supprimes = [] } = {}) => {
    const appels = []; let n = 0;
    const appelFetch = async (url, options = {}) => {
      appels.push({ url, methode: options.method || 'GET', corps: options.body ? JSON.parse(options.body) : null });
      if (!options.method) { // GET : files.list (par nom) ou files.get (existence)
        const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
        if (q) { const nom = /name = '(.*?)' and/.exec(q)[1]; return { ok: true, status: 200, json: async () => ({ files: existants.filter((e) => e.name === nom) }) }; }
        const id = /files\/([^/?]+)\?/.exec(url)[1];
        return supprimes.includes(id) ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ id, trashed: false }) };
      }
      n += 1;
      return { ok: true, status: 200, json: async () => ({ id: `NOUVEAU_DOSSIER_${n}_xyz`, name: JSON.parse(options.body).name }) };
    };
    return { appels, appelFetch };
  };
  test('G7 nom du dossier : « Chevalier IA OS » à la racine, « Chevalier IA - <espace> » chez un client', () => {
    assert.equal(G.nomDossierParentAuto('Ingrid Atamian', false), 'Chevalier IA - Ingrid Atamian');
    assert.equal(G.nomDossierParentAuto('Chevalier IA OS', true), 'Chevalier IA OS');
    assert.equal(G.nomDossierParentAuto('', false), 'Chevalier IA - Mon espace');
  });
  test('G7 aucun parent : créé UNE fois dans Mon Drive (sans champ parents), enregistré avec auto: true', async () => {
    const { appels, appelFetch } = faux();
    const r = await G.preparerDossierParent({ jeton: 'j', parent: null, nomAuto: 'Chevalier IA - Ingrid Atamian', appelFetch });
    assert.deepEqual(r.parent, { id: 'NOUVEAU_DOSSIER_1_xyz', nom: 'Chevalier IA - Ingrid Atamian', auto: true });
    assert.equal(r.cree, true);
    assert.equal(r.recree, false);
    const creation = appels.find((a) => a.methode === 'POST');
    assert.deepEqual(creation.corps, { name: 'Chevalier IA - Ingrid Atamian', mimeType: 'application/vnd.google-apps.folder' });
  });
  test('G7 un dossier de ce nom déjà connu de l\'appli est réutilisé (pas de doublon)', async () => {
    const { appels, appelFetch } = faux({ existants: [{ id: 'DEJA_LA_0123456789', name: 'Chevalier IA OS' }] });
    const r = await G.preparerDossierParent({ jeton: 'j', parent: null, nomAuto: 'Chevalier IA OS', appelFetch });
    assert.equal(r.parentId, 'DEJA_LA_0123456789');
    assert.equal(appels.some((a) => a.methode === 'POST'), false);
  });
  test('G7 un parent CHOISI par l\'utilisateur est conservé sans rien demander à Drive', async () => {
    const { appels, appelFetch } = faux();
    const parent = { id: 'CHOISI_0123456789', nom: 'Clients 2026' };
    const r = await G.preparerDossierParent({ jeton: 'j', parent, nomAuto: 'Chevalier IA OS', appelFetch });
    assert.deepEqual([r.parentId, r.cree, r.recree], ['CHOISI_0123456789', false, false]);
    assert.equal(appels.length, 0);
  });
  test('G7 un parent automatique encore là est gardé ; supprimé (404) ou à la corbeille : recréé (recree: true) ; Drive muet : on garde', async () => {
    const auto = { id: 'AUTO_DOSSIER_0123456', nom: 'Chevalier IA OS', auto: true };
    assert.equal((await G.preparerDossierParent({ jeton: 'j', parent: auto, nomAuto: 'Chevalier IA OS', appelFetch: faux().appelFetch })).cree, false);
    const recree = await G.preparerDossierParent({ jeton: 'j', parent: auto, nomAuto: 'Chevalier IA OS', appelFetch: faux({ supprimes: [auto.id] }).appelFetch });
    assert.deepEqual([recree.cree, recree.recree, recree.parent.auto], [true, true, true]);
    assert.notEqual(recree.parentId, auto.id);
    const muet = await G.preparerDossierParent({ jeton: 'j', parent: auto, nomAuto: 'Chevalier IA OS', appelFetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    assert.deepEqual([muet.parentId, muet.cree], [auto.id, false]);
    const corbeille = await G.preparerDossierParent({ jeton: 'j', parent: auto, nomAuto: 'Chevalier IA OS', appelFetch: async (u, o = {}) => (o.method ? { ok: true, status: 200, json: async () => ({ id: 'NEUF_0123456789', name: 'Chevalier IA OS' }) } : /q=/.test(u) ? { ok: true, json: async () => ({ files: [] }) } : { ok: true, status: 200, json: async () => ({ id: auto.id, trashed: true }) }) });
    assert.equal(corbeille.recree, true);
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
