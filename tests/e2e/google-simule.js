// Google simulé pour les parcours : aucune requête ne part vers Google, aucun jeton réel.
// - google-config.js : un identifiant client fictif (sans lui, l'appli cache les boutons Google) ;
// - api.js et gsi/client : de faux scripts qui imitent la fenêtre standard (Picker) et l'autorisation, et gardent ce qu'on leur demande dans window.__google ;
// - l'API Drive (création de dossiers) : un faux serveur qui garde les requêtes reçues et donne des identifiants à la suite.
export const ID_CLIENT = '192468914925-essaisimule0000000000000000000.apps.googleusercontent.com';
export const PARENT = 'PARENT_ID_0123456789';
export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };

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
    Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id', NAME: 'name', URL: 'url', MIME_TYPE: 'mimeType' } };
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
  const drive = { requetes: [], echecs: {}, compteur: 0 };
  await context.addInitScript(DEBUT);
  await context.route('**/js/os/google-config.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: `export const googleDrive = { idClient: '${idClient}' };` }));
  await context.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: SCRIPT_API }));
  await context.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: SCRIPT_IDENTITE }));
  await context.route('https://www.googleapis.com/drive/v3/files**', async (route) => {
    const requete = route.request();
    if (requete.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
    const corps = JSON.parse(requete.postData() || '{}');
    drive.requetes.push({ url: requete.url(), autorisation: requete.headers().authorization, corps });
    if (drive.echecs[corps.name]) {
      await route.fulfill({ status: drive.echecs[corps.name], contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'refusé' } }) });
      return;
    }
    drive.compteur += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: `DOSSIER_${drive.compteur}_abcdefghij`, name: corps.name }) });
  });
  return drive;
}

/** Ce que le faux Google a reçu côté navigateur (autorisations demandées, fenêtres ouvertes). */
export const lireGoogle = (page) => page.evaluate(() => window.__google);
/** Fixe le choix de l'utilisateur dans la prochaine fenêtre Google : une liste de documents, ou 'annule'. */
export const choisirDansGoogle = (page, reponse) => page.evaluate((r) => { window.__google.reponse = r; }, reponse);
export const refuserAutorisation = (page, refus = true) => page.evaluate((r) => { window.__google.refus = r; }, refus);
