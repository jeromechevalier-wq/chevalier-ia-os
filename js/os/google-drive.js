// Aide Google Drive (sans écran, sans Firebase, sans navigateur obligatoire : se teste seule avec un faux `fetch`).
// Sert à « Créer le répertoire » (dossier du projet + sous-dossiers, créés par l'API Google Drive) et à lire / écrire les adresses de dossiers.
// L'autorisation (jeton) et la fenêtre de choix (Picker) sont dans google-picker.js.
//
// Portée demandée : drive.file = l'appli ne voit QUE les fichiers et dossiers qu'elle a créés ou que l'utilisateur lui a montrés dans la
// fenêtre Google. Jamais le reste du Drive.

export const PORTEE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const TYPE_DOSSIER = 'application/vnd.google-apps.folder';
const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';

const MAX_NOM = 200;
const MAX_SOUS_DOSSIERS = 20;
const IDENTIFIANT = /^[A-Za-z0-9_-]{10,}$/;
const MOTIF_ADRESSE_DOSSIER = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)(?:[/?#]\S*)?$/;

/**
 * Réglages Google lus dans la configuration de la plateforme (google-config.js pour l'identifiant client, firebase-config.js pour la clé et le projet) :
 * - idClient : l'identifiant « client OAuth Web » du projet (public par nature, visible dans toute page qui demande une autorisation Google) ;
 * - cleApi : clé de navigateur pour la fenêtre Picker (par défaut, la clé web Firebase du projet, déjà publique) ;
 * - idApp : numéro du projet Google Cloud (par défaut `messagingSenderId` de Firebase).
 * Renvoie null tant que l'identifiant client n'est pas renseigné : les boutons Google restent alors cachés.
 */
export function lireConfigGoogle(module) {
  const brut = module?.googleDrive;
  const idClient = typeof brut?.idClient === 'string' ? brut.idClient.trim() : '';
  if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(idClient)) return null;
  const fb = module?.firebaseConfig ?? {};
  const cleApi = (typeof brut.cleApi === 'string' && brut.cleApi.trim()) || fb.apiKey || '';
  const idApp = (typeof brut.idApp === 'string' && brut.idApp.trim()) || fb.messagingSenderId || '';
  if (!cleApi || !idApp) return null;
  return { idClient, cleApi, idApp };
}

/** Identifiant d'un dossier Drive d'après son adresse, ou '' (un dossier d'un serveur, d'un NAS ou d'un site n'a pas d'identifiant Drive). */
export function idDossierDrive(url) {
  const m = MOTIF_ADRESSE_DOSSIER.exec(String(url ?? '').trim());
  return m && IDENTIFIANT.test(m[1]) ? m[1] : '';
}

/** Adresse stable d'un dossier : elle repose sur l'identifiant, donc renommer le dossier dans Drive ne la casse pas. */
export function adresseDossierDrive(id) {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** Nom d'un dossier à créer : espaces nettoyés, ni vide ni trop long. Renvoie { nom, erreur }. */
export function nettoyerNomDossier(nom) {
  const n = String(nom ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return { nom: '', erreur: 'Donne un nom au dossier.' };
  if (n.length > MAX_NOM) return { nom: n, erreur: `Le nom du dossier est trop long (${MAX_NOM} caractères au plus).` };
  return { nom: n, erreur: '' };
}

/** Liste de sous-dossiers : noms nettoyés, sans doublon (casse ignorée), sans ligne vide, 20 au plus. Renvoie { liste, erreur }. */
export function nettoyerSousDossiers(noms) {
  const vus = new Set();
  const liste = [];
  for (const brut of Array.isArray(noms) ? noms : []) {
    const { nom, erreur } = nettoyerNomDossier(brut);
    if (erreur) { if (String(brut ?? '').trim()) return { liste, erreur: `Sous-dossier « ${String(brut).trim().slice(0, 40)} » : ${erreur}` }; continue; }
    const cle = nom.toLocaleLowerCase('fr');
    if (vus.has(cle)) continue;
    vus.add(cle);
    liste.push(nom);
  }
  if (liste.length > MAX_SOUS_DOSSIERS) return { liste: liste.slice(0, MAX_SOUS_DOSSIERS), erreur: `${MAX_SOUS_DOSSIERS} sous-dossiers au plus.` };
  return { liste, erreur: '' };
}

/** Message simple pour une erreur de l'API Drive. */
export function messageErreurDrive(statut, corps) {
  const raison = corps?.error?.errors?.[0]?.reason || corps?.error?.status || '';
  if (statut === 401) return 'Google a refusé l’autorisation (elle a peut-être expiré). Réessaie : la fenêtre d’autorisation se rouvrira.';
  if (statut === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(`${raison} ${corps?.error?.message ?? ''}`)) return 'L’API Google Drive n’est pas activée dans le projet Google (voir docs/google-drive.md).';
  if (statut === 403) return 'Google refuse la création ici (droits insuffisants sur le dossier parent).';
  if (statut === 404) return 'Le dossier parent est introuvable : choisis-le de nouveau dans les Réglages.';
  if (statut === 429) return 'Google demande de patienter un peu : réessaie dans une minute.';
  return `Google Drive a répondu une erreur (${statut}).`;
}

/** Crée UN dossier. `appelFetch` est `fetch` (ou un faux dans les tests). Renvoie { id, nom, url }. */
export async function creerDossier({ jeton, nom, parentId = '', appelFetch = globalThis.fetch }) {
  const { nom: propre, erreur } = nettoyerNomDossier(nom);
  if (erreur) throw Object.assign(new Error(erreur), { saisie: true });
  if (parentId && !IDENTIFIANT.test(parentId)) throw Object.assign(new Error('Le dossier parent est invalide : choisis-le de nouveau dans les Réglages.'), { saisie: true });
  const reponse = await appelFetch(`${API_FICHIERS}?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: propre, mimeType: TYPE_DOSSIER, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  let corps = null;
  try { corps = await reponse.json(); } catch { /* corps vide ou illisible */ }
  if (!reponse.ok || !corps?.id) throw Object.assign(new Error(messageErreurDrive(reponse.status, corps)), { statut: reponse.status });
  return { id: corps.id, nom: corps.name || propre, url: adresseDossierDrive(corps.id) };
}

/**
 * Copie un fichier Drive DANS un dossier (files.copy) : l'original reste où il est. Renvoie { id, nom, url } de la COPIE.
 * Il faut que l'appli ait accès au fichier (choisi dans la fenêtre Google) et au dossier (créé par l'appli ou choisi dans la fenêtre).
 */
export async function copierFichier({ jeton, fichierId, parentId, nom = '', appelFetch = globalThis.fetch }) {
  if (!IDENTIFIANT.test(fichierId || '') || !IDENTIFIANT.test(parentId || '')) throw Object.assign(new Error('Fichier ou dossier invalide pour la copie.'), { saisie: true });
  const propre = nettoyerNomDossier(nom).nom;
  const reponse = await appelFetch(`${API_FICHIERS}/${fichierId}/copy?supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parents: [parentId], ...(propre ? { name: propre } : {}) }),
  });
  let corps = null;
  try { corps = await reponse.json(); } catch { /* corps vide ou illisible */ }
  if (!reponse.ok || !corps?.id) throw Object.assign(new Error(messageErreurDrive(reponse.status, corps)), { statut: reponse.status });
  const url = /^https:\/\/(?:drive|docs)\.google\.com\//.test(corps.webViewLink || '') ? corps.webViewLink : `https://drive.google.com/file/d/${corps.id}/view`;
  return { id: corps.id, nom: corps.name || propre, url };
}

/**
 * Crée le dossier d'un projet puis ses sous-dossiers, dans l'ordre de la liste. Si le dossier principal échoue, tout s'arrête (rien n'est créé).
 * Si un sous-dossier échoue, on continue avec les suivants : le résultat dit lesquels manquent (`manquants`), le dossier principal est bien créé.
 * Renvoie { dossier: { id, nom, url }, sousDossiers: [{ id, nom, url }], manquants: [nom] }.
 */
export async function creerArborescence({ jeton, nom, parentId = '', sousDossiers = [], appelFetch = globalThis.fetch }) {
  const { liste, erreur } = nettoyerSousDossiers(sousDossiers);
  if (erreur) throw Object.assign(new Error(erreur), { saisie: true });
  const dossier = await creerDossier({ jeton, nom, parentId, appelFetch });
  const crees = [];
  const manquants = [];
  for (const sous of liste) {
    try { crees.push(await creerDossier({ jeton, nom: sous, parentId: dossier.id, appelFetch })); } catch (e) { console.warn('Sous-dossier non créé', e?.statut); manquants.push(sous); }
  }
  return { dossier, sousDossiers: crees, manquants };
}

/** Un document choisi dans la fenêtre Google : { libelle, url } prêt à entrer dans la liste « Liens et documents ». */
export function documentDepuisChoix(choix) {
  const url = String(choix?.url ?? '').trim();
  if (!/^https:\/\/(?:drive|docs)\.google\.com\//.test(url)) return null;
  return { libelle: String(choix?.nom ?? '').replace(/\s+/g, ' ').trim() || url, url };
}
