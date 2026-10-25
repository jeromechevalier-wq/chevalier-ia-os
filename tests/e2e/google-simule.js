// Google simulé pour les parcours : aucune requête ne part vers Google, aucun jeton réel.
// - google-config.js : un identifiant client fictif (sans lui, l'appli cache les boutons Google) ;
// - api.js et gsi/client : de faux scripts qui imitent la fenêtre standard (Picker) et l'autorisation, et gardent ce qu'on leur demande dans window.__google ;
// - l'API Drive (création de dossiers) : un faux serveur qui garde les requêtes reçues et donne des identifiants à la suite.
export const ID_CLIENT = '192468914925-essaisimule0000000000000000000.apps.googleusercontent.com';
export const PARENT = 'PARENT_ID_0123456789';
export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };

const DEBUT = `window.__google = window.__google || { charges: [], autorisations: [], pickers: [], reponse: [], refus: false };`;

const SCRIPT_API = `${DEBUT}
window.gapi = { load(nom, rappel) {
  window.__google.charges.push(nom);
  class DocsView { constructor(id) { this.type = 'DocsView'; this.viewId = id; }
    setParent(p) { this.parent = p; return this; } setIncludeFolders(v) { this.dossiers = v; return this; } setSelectFolderEnabled(v) { this.choixDossier = v; return this; } setMimeTypes(m) { this.mime = m; return this; } }
  class DocsUploadView { constructor() { this.type = 'DocsUploadView'; } setParent(p) { this.parent = p; return this; } }
  class PickerBuilder {
    constructor() { this.cfg = { views: [], features: [] }; }
    setOAuthToken(t) { this.cfg.token = t; return this; } setDeveloperKey(k) { this.cfg.cle = k; return this; } setAppId(a) { this.cfg.appId = a; return this; }
    setLocale(l) { this.cfg.langue = l; return this; } setTitle(t) { this.cfg.titre = t; return this; } setOrigin(o) { this.cfg.origine = o; return this; }
    addView(v) { this.cfg.views.push(v); return this; } enableFeature(f) { this.cfg.features.push(f); return this; } setCallback(cb) { this.cb = cb; return this; }
    build() { const moi = this; return { setVisible(v) {
      if (!v) return;
      window.__google.pickers.push(JSON.parse(JSON.stringify(moi.cfg)));
      setTimeout(() => { const r = window.__google.reponse; if (r === 'annule') moi.cb({ action: 'cancel' }); else moi.cb({ action: 'picked', docs: r }); }, 0);
    } }; }
  }
  window.google = window.google || {};
  window.google.picker = { PickerBuilder, DocsView, DocsUploadView, ViewId: { DOCS: 'all', FOLDERS: 'folders' }, Feature: { MULTISELECT_ENABLED: 'multiselectEnabled' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id', NAME: 'name', URL: 'url', MIME_TYPE: 'mimeType', PARENT_ID: 'parentId' } };
  setTimeout(() => (typeof rappel === 'function' ? rappel() : rappel.callback()), 0);
} };`;

const SCRIPT_IDENTITE = `${DEBUT}
window.google = window.google || {};
window.google.accounts = { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  window.__google.autorisations.push({ clientId: cfg.client_id, scope: cfg.scope, indice: cfg.login_hint || '' });
  setTimeout(() => { if (window.__google.refus) cfg.callback({ error: 'access_denied' }); else cfg.callback({ access_token: 'ya29.SIMULE', expires_in: 3600 }); }, 0);
} }; } } };`;

/**
 * Branche le Google simulé sur un contexte de navigateur. Renvoie le faux Drive : { requetes: [{ autorisation, corps }], echecs: { <nom de dossier>: <statut> } }.
 * Dans la page : window.__google.reponse = [{ id, name, url, mimeType }] (ou 'annule') fixe ce que « l'utilisateur » choisit dans la fenêtre Google.
 */
export async function brancherGoogle(context, { idClient = ID_CLIENT } = {}) {
  const drive = { requetes: [], supprimes: new Set(), dossiers: [], fichiers: {}, lectures: [], recherches: [], echecs: {}, compteur: 0, copies: [], compteurCopies: 0, echecCopie: 0, echecLecture: 0, envois: [], echecEnvoi: 0 };
  await context.addInitScript(DEBUT);
  await context.route('**/js/os/google-config.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: `export const googleDrive = { idClient: '${idClient}' };` }));
  await context.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: SCRIPT_API }));
  await context.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: SCRIPT_IDENTITE }));
  await context.route('https://www.googleapis.com/drive/v3/files**', async (route) => {
    const requete = route.request();
    if (requete.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
    const idFichier = /\/drive\/v3\/files\/([^/?]+)\?/.exec(requete.url())?.[1];
    if (requete.method() === 'GET' && idFichier) {
      if (drive.echecLecture) { await route.fulfill({ status: drive.echecLecture, contentType: 'application/json', headers: CORS, body: '{}' }); return; } // files.get (parents) : où est ce fichier ? `drive.fichiers[id] = { parents: [...] }` ; par défaut : un dossier quelconque
      drive.lectures.push(idFichier);
      if (drive.supprimes.has(idFichier)) { await route.fulfill({ status: 404, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { status: 'NOT_FOUND' } }) }); return; } // supprimé par l'utilisateur
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: idFichier, trashed: false, parents: drive.fichiers[idFichier]?.parents || ['AUTRE_DOSSIER_123'], createdTime: drive.fichiers[idFichier]?.createdTime || '2020-01-01T00:00:00.000Z' }) });
      return;
    }
    if (requete.method() === 'GET') { // files.list : dossiers de même nom (seuls ceux que l'appli a créés, comme avec la portée drive.file)
      const q = decodeURIComponent(new URL(requete.url()).searchParams.get('q') || '');
      const nom = /name = '(.*?)' and/.exec(q)?.[1]?.replace(/\\'/g, "'");
      const parent = /and '([^']+)' in parents/.exec(q)?.[1];
      drive.recherches.push({ nom, parent });
      const trouves = drive.dossiers.filter((d) => !drive.supprimes.has(d.id) && d.name === nom && (d.parents?.[0] || 'root') === parent).map((d) => ({ id: d.id, name: d.name }));
      // Les fichiers envoyés par l'appli (copie du PDF d'un devis) sont retrouvables par leur nom, comme avec la portée drive.file.
      for (const [i, e] of drive.envois.entries()) if (e.nom === nom && (e.parents?.[0] || 'root') === parent) trouves.push({ id: `ENVOI_${i + 1}_abcdefghij`, name: e.nom });
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ files: trouves }) });
      return;
    }
    const corps = JSON.parse(requete.postData() || '{}');
    if (/\/files\/[^/?]+\/copy/.test(requete.url())) { // files.copy : { parents, name? } → la copie
      drive.copies.push({ url: requete.url(), autorisation: requete.headers().authorization, corps });
      if (drive.echecCopie) { await route.fulfill({ status: drive.echecCopie, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { status: 'NOT_FOUND', message: 'introuvable' } }) }); return; }
      drive.compteurCopies += 1;
      const id = `COPIE_${drive.compteurCopies}_abcdefghij`;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id, name: corps.name || 'Copie', webViewLink: `https://drive.google.com/file/d/${id}/view` }) });
      return;
    }
    drive.requetes.push({ url: requete.url(), autorisation: requete.headers().authorization, corps });
    if (drive.echecs[corps.name]) {
      await route.fulfill({ status: drive.echecs[corps.name], contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'refusé' } }) });
      return;
    }
    drive.compteur += 1;
    const idDossier = `DOSSIER_${drive.compteur}_abcdefghij`;
    drive.dossiers.push({ id: idDossier, name: corps.name, parents: corps.parents });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: idDossier, name: corps.name }) });
  });
  // Envoi d'un fichier (uploadType=multipart) : on garde le nom, le dossier parent et le contenu. `drive.echecEnvoi` = statut d'erreur à renvoyer.
  await context.route('https://www.googleapis.com/upload/drive/v3/files**', async (route) => {
    const requete = route.request();
    if (requete.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
    if (drive.echecEnvoi) { await route.fulfill({ status: drive.echecEnvoi, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'refusé' } }) }); return; }
    const texte = requete.postData() || '';
    const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(texte)?.[1] || '{}');
    drive.envois.push({ nom: meta.name, parents: meta.parents, autorisation: requete.headers().authorization, contientPdf: texte.includes('%PDF-') });
    const id = `ENVOI_${drive.envois.length}_abcdefghij`;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id, name: meta.name, webViewLink: `https://drive.google.com/file/d/${id}/view` }) });
  });
  return drive;
}

/** Ce que le faux Google a reçu côté navigateur (autorisations demandées, fenêtres ouvertes). */
export const lireGoogle = (page) => page.evaluate(() => window.__google);
/** Fixe le choix de l'utilisateur dans la prochaine fenêtre Google : une liste de documents, ou 'annule'. */
export const choisirDansGoogle = (page, reponse) => page.evaluate((r) => { window.__google.reponse = r; }, reponse);
export const refuserAutorisation = (page, refus = true) => page.evaluate((r) => { window.__google.refus = r; }, refus);

/** Simule un CRM sans identifiant client Google (cas d'un espace où Google n'est pas encore branché) : le dépôt, lui, porte l'identifiant réel de Jérôme. */
export async function debrancherGoogle(context) {
  await context.route('**/js/os/google-config.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: "export const googleDrive = { idClient: '' };" }));
}
