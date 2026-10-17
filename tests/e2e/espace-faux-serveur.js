// Faux serveur de « Mon espace » pour les tests dans le navigateur (2.10.0).
// Le navigateur appelle la VRAIE fonction (functions-plateforme/src/espace.js, la même qu'en production) : on la fait tourner ici, dans Node, sur l'ÉMULATEUR Firestore,
// avec un FAUX Storage en mémoire (les adresses des fichiers envoyés sont servies au navigateur). L'identité de l'appelant est lue dans son jeton de connexion (émulateur Auth).
// Ce qui n'est PAS essayé ici : le vrai Google Cloud (compte de service, droits Storage, adresse réelle de la fonction), un vrai téléversement.
import { createRequire } from 'node:module';
import { reglerEspace } from '../../functions-plateforme/src/espace.js';
import { Refus } from '../../functions-plateforme/src/appels.js';
import { PROJET } from './outils.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJET;
const requireFn = createRequire(new URL('../../functions-plateforme/package.json', import.meta.url));
const { initializeApp, getApps } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJET });

export const NOM_BUCKET = 'chevalier-ia-app.firebasestorage.app';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
const HTTP = { 'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403, 'not-found': 404, 'already-exists': 409, 'failed-precondition': 400, 'resource-exhausted': 429, internal: 500 };

/** Adresse publique d'un fichier du faux Storage (même format que le serveur et l'outil de Jérôme). */
export const urlFichier = (chemin) => `https://firebasestorage.googleapis.com/v0/b/${NOM_BUCKET}/o/${encodeURIComponent(chemin)}?alt=media`;

function identiteDuJeton(entete) {
  const jeton = String(entete || '').replace(/^Bearer\s+/i, '');
  try {
    const p = JSON.parse(Buffer.from(jeton.split('.')[1], 'base64url').toString('utf8'));
    return { uid: p.user_id || p.sub || 'uid', token: { email: p.email, email_verified: p.email_verified === true } };
  } catch { return null; }
}

/**
 * Branche le faux serveur sur une page : la fonction « espaceReglages » et les adresses des fichiers de marque.
 * Renvoie { bucket, appels, panne } : `bucket.fichiers` (chemin -> octets), `appels` (données reçues, sans le contenu des images), `panne` (true : le réseau est coupé pour la fonction).
 */
export async function brancherServeurEspace(page) {
  const bucket = { name: NOM_BUCKET, fichiers: new Map(), journal: [] };
  bucket.file = (chemin) => ({
    save: async (octets) => { bucket.fichiers.set(chemin, octets); bucket.journal.push(['envoi', chemin]); },
    delete: async () => { bucket.fichiers.delete(chemin); bucket.journal.push(['suppression', chemin]); },
  });
  const faux = { bucket, appels: [], panne: false, delaiMs: 0, reponses: [] };

  await page.route('**/espaceReglages', async (route) => {
    const requete = route.request();
    if (requete.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (faux.panne) return route.abort('connectionfailed');
    const donnees = JSON.parse(requete.postData()).data;
    faux.appels.push({ ...donnees, image: donnees.image ? '(image)' : undefined, logo: donnees.logo && typeof donnees.logo === 'object' ? '(image)' : donnees.logo });
    if (faux.delaiMs) await new Promise((r) => setTimeout(r, faux.delaiMs));
    try {
      const resultat = await reglerEspace({ db: getFirestore(), bucket, nomBucket: NOM_BUCKET, auth: identiteDuJeton(requete.headers().authorization), donnees });
      faux.reponses.push(resultat);
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ result: resultat }) });
    } catch (e) {
      const code = e instanceof Refus ? e.code : 'internal';
      return route.fulfill({ status: HTTP[code] ?? 500, headers: CORS, body: JSON.stringify({ error: { message: e instanceof Refus ? e.message : 'INTERNAL', status: code.toUpperCase().replaceAll('-', '_') } }) });
    }
  });

  await page.route('https://firebasestorage.googleapis.com/**', (route) => {
    const m = new URL(route.request().url()).pathname.match(/\/o\/(.+)$/);
    const octets = m ? bucket.fichiers.get(decodeURIComponent(m[1])) : null;
    if (!octets) return route.fulfill({ status: 404, body: '' });
    const type = octets[0] === 0xff ? 'image/jpeg' : octets[0] === 0x52 ? 'image/webp' : 'image/png';
    return route.fulfill({ status: 200, body: Buffer.from(octets), headers: { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' } });
  });
  return faux;
}

/** Une image de la couleur donnée, fabriquée DANS le navigateur (canvas) : PNG, JPG ou WebP, de la taille voulue. Renvoie un Buffer. */
export async function fabriquerImage(page, { type = 'png', largeur = 200, hauteur = 100, couleur = '#cc3366', transparent = false }) {
  const base64 = await page.evaluate(async ([t, l, h, c, tr]) => {
    const canvas = document.createElement('canvas');
    canvas.width = l; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!tr) { ctx.fillStyle = c; ctx.fillRect(0, 0, l, h); } else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(l / 2, h / 2, Math.min(l, h) / 3, 0, 7); ctx.fill(); }
    const blob = await new Promise((r) => canvas.toBlob(r, { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[t], 0.92));
    return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob); });
  }, [type, largeur, hauteur, couleur, transparent]);
  return Buffer.from(base64, 'base64');
}

/** Largeur et hauteur d'un PNG (en-tête IHDR) ; pour un JPG ou un WebP : décodage dans le navigateur (voir dimensionsDansNavigateur). */
export function dimensionsPng(octets) {
  const b = Buffer.from(octets);
  return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
}

export async function dimensionsDansNavigateur(page, octets) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:application/octet-stream;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    return { largeur: bmp.width, hauteur: bmp.height };
  }, Buffer.from(octets).toString('base64'));
}
