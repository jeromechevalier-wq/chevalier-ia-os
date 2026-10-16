// Fenêtre STANDARD de Google (Google Picker) et autorisation Drive (Google Identity Services). Aucune fenêtre sur mesure :
// « Mon Drive » pour parcourir, « Importer » pour envoyer un fichier de l'ordinateur dans un dossier précis.
// Les deux scripts de Google (api.js et gsi/client) ne sont chargés qu'au premier besoin. Rien n'est gardé sur disque : le jeton vit en mémoire.
// La configuration vient de js/os/google-config.js (identifiant client) et de js/os/firebase-config.js (clé de navigateur, numéro de projet) : jamais écrite ici.
import * as configFirebase from './firebase-config.js';
import * as configGoogleDrive from './google-config.js';
import { lireConfigGoogle, PORTEE_DRIVE, TYPE_DOSSIER } from './google-drive.js';

const SCRIPT_API = 'https://apis.google.com/js/api.js';
const SCRIPT_IDENTITE = 'https://accounts.google.com/gsi/client';

/** Réglages Google de cette plateforme, ou null tant que l'identifiant client n'est pas renseigné (les boutons Google sont alors cachés). */
export const configGoogle = () => lireConfigGoogle({ firebaseConfig: configFirebase.firebaseConfig, googleDrive: configGoogleDrive.googleDrive });
export const googleDisponible = () => configGoogle() !== null;

function chargerScript(src) {
  return new Promise((resoudre, rejeter) => {
    const existant = [...document.scripts].find((s) => s.src === src);
    if (existant?.dataset.charge === '1') { resoudre(); return; }
    const script = existant || Object.assign(document.createElement('script'), { src, async: true });
    script.addEventListener('load', () => { script.dataset.charge = '1'; resoudre(); }, { once: true });
    script.addEventListener('error', () => { script.remove(); rejeter(new Error('Impossible de joindre Google. Vérifie ta connexion internet (ou un bloqueur de publicités).')); }, { once: true });
    if (!existant) document.head.append(script);
  });
}

let preparation = null;

/** Charge les scripts de Google (une seule fois). À appeler tôt (affichage de la fiche) pour que le clic suivant ouvre la fenêtre sans délai. */
export function preparerGoogle() {
  if (!googleDisponible()) return Promise.reject(new Error('Google Drive n’est pas encore branché sur cet espace.'));
  if (!preparation) {
    preparation = Promise.all([chargerScript(SCRIPT_API), chargerScript(SCRIPT_IDENTITE)])
      .then(() => new Promise((resoudre, rejeter) => {
        window.gapi.load('picker', { callback: resoudre, onerror: () => rejeter(new Error('La fenêtre Google n’a pas pu se charger.')) });
      }))
      .catch((e) => { preparation = null; throw e; });
  }
  return preparation;
}

let jeton = null; // { valeur, email, expire } en mémoire seulement

/**
 * Jeton d'accès Drive. La première fois, Google ouvre sa fenêtre d'autorisation (portée drive.file : fichiers créés ou choisis par l'appli).
 * `email` aide Google à proposer le bon compte. À appeler depuis un clic (sinon le navigateur bloque la fenêtre).
 */
export async function obtenirJeton({ email = '' } = {}) {
  if (jeton && jeton.email === email && jeton.expire > Date.now() + 30_000) return jeton.valeur; // jamais le jeton d'un autre compte (déconnexion, changement de compte)
  await preparerGoogle();
  const conf = configGoogle();
  return new Promise((resoudre, rejeter) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: conf.idClient,
      scope: PORTEE_DRIVE,
      ...(email ? { login_hint: email } : {}),
      callback: (reponse) => {
        if (reponse?.error || !reponse?.access_token) {
          rejeter(Object.assign(new Error(reponse?.error === 'access_denied' ? 'Autorisation refusée : rien n’a été fait.' : 'L’autorisation Google a échoué.'), { annule: reponse?.error === 'access_denied', code: reponse?.error }));
          return;
        }
        jeton = { valeur: reponse.access_token, email, expire: Date.now() + (Number(reponse.expires_in) || 3600) * 1000 };
        resoudre(jeton.valeur);
      },
      error_callback: (e) => {
        const fermee = e?.type === 'popup_closed';
        const bloquee = e?.type === 'popup_failed_to_open';
        rejeter(Object.assign(new Error(fermee ? 'Fenêtre d’autorisation fermée : rien n’a été fait.'
          : bloquee ? 'Le navigateur a bloqué la fenêtre d’autorisation Google : autorise les fenêtres surgissantes pour ce site, puis réessaie.'
            : 'L’autorisation Google a échoué.'), { annule: fermee, code: e?.type }));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Oublie le jeton (déconnexion, ou Google l'a refusé). */
export function oublierJeton() { jeton = null; }

/**
 * Ouvre la fenêtre Google. Renvoie la liste des éléments choisis [{ id, nom, url, type }], ou [] si l'utilisateur ferme la fenêtre.
 * - mode 'documents' : onglets « Mon Drive » (parcourir) et, si `dossierImport` est donné, « Importer » (le fichier de l'ordinateur est envoyé dans ce dossier) ;
 * - mode 'dossier' : choisir UN dossier existant (réglage du dossier parent).
 */
export async function ouvrirFenetreGoogle({ mode = 'documents', dossierImport = '', email = '', multiple = true } = {}) {
  const conf = configGoogle();
  const token = await obtenirJeton({ email });
  const g = window.google.picker;
  const constructeur = new g.PickerBuilder()
    .setOAuthToken(token)
    .setDeveloperKey(conf.cleApi)
    .setAppId(conf.idApp)
    .setLocale('fr')
    .setOrigin(window.location.protocol + '//' + window.location.host);
  if (mode === 'dossier') {
    constructeur.addView(new g.DocsView(g.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(TYPE_DOSSIER));
  } else {
    constructeur.addView(new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true)); // l'onglet s'appelle « Mon Drive » en français chez Google
    if (dossierImport) constructeur.addView(new g.DocsUploadView().setParent(dossierImport));
    if (multiple) constructeur.enableFeature(g.Feature.MULTISELECT_ENABLED);
  }
  return new Promise((resoudre) => {
    constructeur.setCallback((donnees) => {
      const action = donnees[g.Response.ACTION];
      if (action === g.Action.PICKED) {
        resoudre((donnees[g.Response.DOCUMENTS] || []).map((d) => ({ id: d[g.Document.ID], nom: d[g.Document.NAME], url: d[g.Document.URL], type: d[g.Document.MIME_TYPE] })));
      } else if (action === g.Action.CANCEL) {
        resoudre([]);
      }
    });
    constructeur.build().setVisible(true);
  });
}
