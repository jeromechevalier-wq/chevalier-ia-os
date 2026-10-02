// Outils hors ligne (jamais publiés avec le site) : accès Google partagé par les scripts de l'étape 1.
// Aucune dépendance : Node 20 ou plus suffit. Les secrets vivent dans ~/.config/chevalier-ia-os/ (hors du
// dossier du projet, qui est synchronisé avec Google Drive), jamais dans le dépôt, jamais affichés.
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DOSSIER_CONFIG = process.env.CHEVALIER_CONFIG_DIR || join(homedir(), '.config', 'chevalier-ia-os');
export const FICHIER_CLIENT = join(DOSSIER_CONFIG, 'oauth-client.json');
export const FICHIER_JETON = join(DOSSIER_CONFIG, 'drive-refresh-token.json');
export const FICHIER_ETAT = join(DOSSIER_CONFIG, 'prototype-drive-etat.json');
export const FICHIER_AUTORISATION_EN_COURS = join(DOSSIER_CONFIG, 'autorisation-en-cours.json');

// Les adresses ne changent qu'en test (faux serveur local) ; en vrai, ce sont celles de Google.
export const URL_AUTORISATION = 'https://accounts.google.com/o/oauth2/v2/auth';
export const URL_JETON = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
export const URL_API = process.env.DRIVE_API_URL || 'https://www.googleapis.com';

export const PORTEE = 'https://www.googleapis.com/auth/drive.file';
export const PORT_REDIRECTION = 8085;
export const REDIRECTION = `http://localhost:${PORT_REDIRECTION}/`;

export async function lireJson(chemin) {
  return JSON.parse(await readFile(chemin, 'utf8'));
}

/** Écrit un fichier lisible par toi seul (droits 600), dans un dossier privé (700). */
export async function ecrireSecret(chemin, objet) {
  await mkdir(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  await writeFile(chemin, JSON.stringify(objet, null, 2), { mode: 0o600 });
  await chmod(chemin, 0o600);
}

/**
 * Identifiant OAuth « application Web ». Trois sources, dans cet ordre :
 *  1. CHEVALIER_OAUTH_CLIENT_ID (session cloud) : l'identifiant public seul. Le secret n'est jamais vu par les scripts :
 *     le proxy de la session l'ajoute lui-même (en-tête Authorization Basic) aux appels vers oauth2.googleapis.com/token.
 *  2. CHEVALIER_OAUTH_CLIENT_JSON : le contenu du fichier téléchargé dans la console (secret compris).
 *  3. Le fichier privé ~/.config/chevalier-ia-os/oauth-client.json (sur le Mac).
 * `secret` vaut null dans le cas 1.
 */
export async function lireClient() {
  if (process.env.CHEVALIER_OAUTH_CLIENT_ID) {
    return { id: process.env.CHEVALIER_OAUTH_CLIENT_ID.trim(), secret: null, redirections: [REDIRECTION] };
  }
  let brut;
  try {
    brut = process.env.CHEVALIER_OAUTH_CLIENT_JSON ? JSON.parse(process.env.CHEVALIER_OAUTH_CLIENT_JSON) : await lireJson(FICHIER_CLIENT);
  } catch {
    throw new Error(`Identifiant OAuth introuvable ou illisible (variable CHEVALIER_OAUTH_CLIENT_ID, variable CHEVALIER_OAUTH_CLIENT_JSON ou fichier ${FICHIER_CLIENT}).\nRelis l'étape 3 du guide (docs/prototype-drive.md).`);
  }
  const c = brut.web || brut.installed;
  if (!c?.client_id || !c?.client_secret) throw new Error(`${FICHIER_CLIENT} ne contient pas client_id et client_secret.`);
  return { id: c.client_id, secret: c.client_secret, redirections: c.redirect_uris || [] };
}

/**
 * Appelle le point d'échange de jetons de Google. Le secret ne passe jamais dans le corps de la requête :
 * - session cloud (client.secret nul) : aucun en-tête Authorization, le proxy injecte « Basic » ;
 * - sinon (Mac) : en-tête Authorization Basic fabriqué ici (client_secret_basic, RFC 6749 §2.3.1).
 * Renvoie { r, j } : la réponse HTTP et son corps JSON (ou { brut } si ce n'est pas du JSON).
 */
export async function appelJeton(client, parametres) {
  const entetes = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (client.secret) {
    const basic = (x) => encodeURIComponent(x).replace(/%20/g, '+');
    entetes.Authorization = `Basic ${Buffer.from(`${basic(client.id)}:${basic(client.secret)}`).toString('base64')}`;
  }
  const r = await fetch(URL_JETON, { method: 'POST', headers: entetes, body: new URLSearchParams({ client_id: client.id, ...parametres }) });
  return { r, j: await lireReponseJson(r) };
}

async function lireReponseJson(reponse) {
  const texte = await reponse.text();
  try { return JSON.parse(texte); } catch { return { brut: texte.slice(0, 300) }; }
}

/** Échange le jeton de rafraîchissement contre un jeton d'accès d'une heure. Ne l'affiche jamais. */
export async function nouveauJetonAcces() {
  const client = await lireClient();
  let jeton;
  try {
    jeton = await lireJson(FICHIER_JETON);
  } catch {
    throw new Error(`Pas de jeton de rafraîchissement (${FICHIER_JETON}). Lance d'abord : node outils/autoriser-drive.js`);
  }
  const { r, j } = await appelJeton(client, { refresh_token: jeton.refresh_token, grant_type: 'refresh_token' });
  if (!r.ok || !j.access_token) {
    throw new Error(`Jeton refusé par Google (HTTP ${r.status}) : ${j.error || ''} ${j.error_description || j.brut || ''}`.trim());
  }
  return { accessToken: j.access_token, scope: j.scope || '', expiresIn: j.expires_in };
}

/** Appel de l'API Drive avec un jeton d'accès ; renvoie { statut, entetes, donnees }. */
export async function appelDrive(accessToken, chemin, { methode = 'GET', json, corps, entetes = {}, brut = false } = {}) {
  const enTetes = { Authorization: `Bearer ${accessToken}`, ...entetes };
  let body = corps;
  if (json !== undefined) {
    enTetes['Content-Type'] = 'application/json; charset=UTF-8';
    body = JSON.stringify(json);
  }
  const r = await fetch(`${URL_API}${chemin}`, { method: methode, headers: enTetes, body, redirect: 'manual' });
  if (brut) return { statut: r.status, entetes: r.headers, donnees: Buffer.from(await r.arrayBuffer()) };
  return { statut: r.status, entetes: r.headers, donnees: await lireReponseJson(r) };
}

export async function lireEtat() {
  try { return await lireJson(FICHIER_ETAT); } catch { return { dossiers: [], fichiers: [] }; }
}

export async function ecrireEtat(etat) {
  await ecrireSecret(FICHIER_ETAT, etat); // pas un secret, mais même dossier privé
}
