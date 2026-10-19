// Tous les ports des tests au même endroit.
// Port = base + TESTS_DECALAGE × 1000 + rang de la série (pas de 1000 : avec 100, le port « auth » d’une session tomberait sur le port « storage » d’une autre). Sans variable (décalage 0), la série « e2e » (rang 0) garde les ports d'avant.
// Pour deux suites en même temps sur le Mac : TESTS_DECALAGE=0 pour l'une, TESTS_DECALAGE=1 pour l'autre (une valeur par session).
import net from 'node:net';

export const BASES = { auth: 9099, firestore: 8080, websocket: 9150, storage: 9199, hub: 4400, logging: 4500, serveur: 5050 };

/** Rang de chaque série lancée par `npm test` (une série = un démarrage d'émulateurs). */
export const RANGS = { e2e: 0, noyau: 1, storage: 2, 'outil-client': 3, automatisations: 4, 'e2e-telephone': 5 };

export function decalage(env = process.env) {
  const brut = env.TESTS_DECALAGE;
  if (brut === undefined || brut === '') return 0;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 0 || n > 40) throw new Error(`TESTS_DECALAGE doit être un entier entre 0 et 40 (reçu : « ${brut} »)`);
  return n;
}

/** Les ports d'une série. */
export function ports(rang = 0, env = process.env) {
  const d = decalage(env) * 1000 + rang;
  return Object.fromEntries(Object.entries(BASES).map(([nom, base]) => [nom, base + d]));
}

/** Rang de la série en cours (posé par le lanceur ; 0 si on lance Playwright à la main). */
export function rangCourant(env = process.env) {
  const n = Number(env.TESTS_RANG || 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Ports de la série en cours : c'est ce que lisent Playwright et `outils.js`. */
export const portsCourants = (env = process.env) => ports(rangCourant(env), env);

/** Vrai si quelque chose écoute déjà sur ce port (IPv4 ou IPv6). */
export function portOccupe(port) {
  const essayer = (hote) => new Promise((ok) => {
    const s = net.connect({ port, host: hote });
    const fin = (v) => { s.destroy(); ok(v); };
    s.setTimeout(500, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
  return Promise.all([essayer('127.0.0.1'), essayer('::1')]).then(([a, b]) => a || b);
}

/**
 * Vérifie que tous les ports sont libres. Renvoie la liste des ports pris (vide si tout est libre).
 * Le lanceur s'arrête tout de suite avec un message clair (au lieu d'attendre 90 s qu'un émulateur renonce).
 */
export async function portsPris(liste) {
  const pris = [];
  for (const [nom, port] of liste) if (await portOccupe(port)) pris.push({ nom, port });
  return pris;
}
