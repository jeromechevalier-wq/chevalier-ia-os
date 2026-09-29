// Outils communs aux parcours : émulateurs, SDK Firebase servi localement, connexion, journal de la console.
import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const PROJET = 'demo-chevalier-ia-os';
export const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;
export const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
export const JEROME = 'jerome.chevalier@gmail.com';
export const CHARLES = 'jeromebot.chevalierbot@gmail.com';
export const URL_APP = '/?emulateurs=1';

const DOSSIER_FIREBASE = fileURLToPath(new URL('../node_modules/firebase/', import.meta.url));

// ---------------------------------------------------------------- émulateurs

export async function reinitialiser() {
  const r1 = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
  const r2 = await fetch(`${AUTH}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
  if (!r1.ok || !r2.ok) throw new Error('Réinitialisation des émulateurs impossible');
}

function versValeur(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(versValeur) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versValeur(x)])) } };
  return { stringValue: String(v) };
}

function depuisValeur(v) {
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(depuisValeur);
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, depuisValeur(x)]));
  return v.stringValue;
}

const ENTETES_ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Écrit un document en contournant les règles (compte "owner" de l'émulateur). */
export async function ecrireDocument(chemin, donnees) {
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/${chemin}`, {
    method: 'PATCH',
    headers: ENTETES_ADMIN,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(donnees).map(([k, v]) => [k, versValeur(v)])) }),
  });
  if (!r.ok) throw new Error(`Écriture impossible : ${chemin} ${await r.text()}`);
}

export async function lireDocument(chemin) {
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/${chemin}`, { headers: ENTETES_ADMIN });
  if (r.status === 404) return null;
  const d = await r.json();
  return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, depuisValeur(v)]));
}

export async function listerDocuments(collection) {
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/${collection}?pageSize=300`, { headers: ENTETES_ADMIN });
  const d = await r.json();
  return (d.documents || []).map((doc) => ({
    id: doc.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, depuisValeur(v)])),
  }));
}

/** Jour civil à Paris décalé de n jours ("AAAA-MM-JJ"). */
export function jour(n = 0) {
  const d = new Date(Date.now() + n * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Crée une fiche complète directement dans l'émulateur. */
export async function creerFiche(id, valeurs = {}) {
  const maintenant = new Date();
  const fiche = {
    nom: 'Fiche test', entreprise: '', roles: ['prospect'], dateInterviewJtbd: null, secteur: '', taille: '', ville: '',
    telephone: '', email: '', siteWeb: '', linkedin: '', source: 'Flyer', etape: 'premier_contact',
    dateEntreeEtape: maintenant, datesEtapes: { premier_contact: maintenant }, priorite: 'tiede', besoin: '',
    offreId: null, dureeJours: null, montant: null, datePremierContact: jour(0), dateDernierEchange: maintenant,
    prochaineAction: '', dateProchaineAction: null, dateRdv: null, rdvTenu: false, dateRdvTenu: null, notes: '',
    notesRapides: [], historique: [], documents: [], raisonPerdu: null, raisonPerduDetail: null, dateReveil: null,
    encaissements: [], oppositionProspection: false, dateOpposition: null, archive: false,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME,
    ...valeurs,
  };
  await ecrireDocument(`crm_prospects/${id}`, fiche);
  return fiche;
}

// ---------------------------------------------------------------- connexion (vrai parcours Google via l'émulateur Auth)

export function estTelephone(page) {
  return (page.viewportSize()?.width || 1440) < 768;
}

/**
 * Ouvre l'appli et connecte un compte Google fictif sur l'émulateur Auth.
 * (La fenêtre Google elle même a besoin d'apis.google.com : le bouton est testé à part.)
 */
export async function connecter(page, email = JEROME, { attendreAccueil = true, emailVerifie = true, route = 'crm/accueil' } = {}) {
  await page.goto(`${URL_APP}#/${route}`);
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate(([e, v]) => window.__chevalierTest.connecter(e, v), [email, emailVerifie]);
  if (attendreAccueil) {
    await expect(page.locator('.coquille')).toBeVisible();
    if (route === 'crm/accueil') await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(6);
  }
}

/** Ouvre le menu sur téléphone si nécessaire, puis clique sur une entrée. */
export async function allerA(page, libelle) {
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.menu').getByRole('link', { name: libelle, exact: true }).click();
}

export async function valeurObjectif(page, id) {
  return Number(await page.locator(`.objectif[data-objectif="${id}"]`).getAttribute('data-valeur'));
}

// ---------------------------------------------------------------- fixture : SDK local, console, émulateurs propres

export const test = base.extend({
  erreursConsole: [async ({ page, context }, use) => {
    // Le SDK Firebase 12.19.0 est chargé depuis gstatic dans l'appli ; pendant les tests, il est servi
    // depuis node_modules (même version) pour ne pas dépendre du réseau.
    await context.route('https://www.gstatic.com/firebasejs/12.19.0/**', async (route) => {
      const nom = new URL(route.request().url()).pathname.split('/').pop();
      try {
        const corps = await readFile(`${DOSSIER_FIREBASE}${nom}`);
        await route.fulfill({ status: 200, body: corps, headers: { 'Content-Type': nom.endsWith('.map') ? 'application/json' : 'text/javascript', 'Access-Control-Allow-Origin': '*' } });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    });
    // La page de connexion de l'émulateur Auth charge des styles externes facultatifs.
    await context.route(/https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) =>
      route.fulfill({ status: 200, body: '', headers: { 'Content-Type': route.request().url().endsWith('.js') ? 'text/javascript' : 'text/css' } }));
    const erreurs = [];
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
    await reinitialiser();
    await use(erreurs);
  }, { auto: true }],
});

/** C20 : aucune erreur dans la console du navigateur pendant le parcours. */
test.afterEach(async ({ erreursConsole }, info) => {
  if (info.annotations.some((a) => a.type === 'erreurs-reseau-attendues')) return;
  expect(erreursConsole, 'Erreurs dans la console du navigateur').toEqual([]);
});

export { expect };
