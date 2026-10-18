// Parcours dans le navigateur de la page de connexion OAuth (ordinateur et téléphone) : Google est remplacé par une doublure du SDK Firebase,
// le serveur est le vrai gestionnaire (données en mémoire), servi derrière l'adresse publique de l'appli (donc avec la vraie origine).
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { creerGestionnaire } from '../../functions/src/mcp/gestionnaire.js';
import { creerRouteurOauth } from '../../functions/src/oauth/routeur.js';
import { creerMagasin } from '../../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../../functions/src/coeur/donnees.js';
import { collections } from '../_donnees-essai.js';

const APPLI = 'https://chevalier-ia-os.web.app';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const IDENTITES = { 'ID-JEROME': { email: 'jerome.chevalier@gmail.com', emailVerifie: true, fournisseur: 'google.com' }, 'ID-INCONNU': { email: 'intrus@gmail.com', emailVerifie: true, fournisseur: 'google.com' } };

// Doublure du SDK Firebase : « se connecter » donne l'utilisateur choisi par le test (window.__compte), comme le ferait Google.
const FAUX_APP = 'export const initializeApp = (c) => ({ c });';
const FAUX_AUTH = `
const ecouteurs = [];
let user = null;
const faire = (jeton, email) => ({ email, getIdToken: async () => jeton });
export const getAuth = () => ({});
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (a, f) => { ecouteurs.push(f); setTimeout(() => f(user), 0); return () => {}; };
const connecter = async () => { user = faire(window.__compte.jeton, window.__compte.email); ecouteurs.forEach((f) => f(user)); };
export const signInWithPopup = connecter;
export const signInWithRedirect = connecter;
export const getRedirectResult = async () => null;
export const signOut = async () => { user = null; ecouteurs.forEach((f) => f(null)); };`;

let serveur, local;
test.beforeAll(async () => {
  const donnees = creerAccesMemoire(structuredClone(collections));
  const oauth = creerRouteurOauth({ donnees, verifierIdToken: async (j) => { const i = IDENTITES[j]; if (!i) throw new Error('non'); return i; }, limitePostParMinute: 1_000_000 });
  const gestionnaire = creerGestionnaire({ magasin: creerMagasin({ lire: async () => '[]', dureeCacheMs: 0 }), donnees, oauth, journal: () => {} });
  serveur = createServer((req, res) => {
    const morceaux = [];
    req.on('data', (m) => morceaux.push(m));
    req.on('end', () => {
      const t = Buffer.concat(morceaux).toString('utf8');
      try { req.body = t ? JSON.parse(t) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  local = `http://127.0.0.1:${serveur.address().port}`;
});
test.afterAll(() => serveur.close());

async function preparer(page, compte) {
  await page.addInitScript((c) => { window.__compte = c; }, compte);
  // L'adresse publique de l'appli est servie par le gestionnaire local ; le SDK Firebase est une doublure ; le retour vers Claude est intercepté.
  await page.route(`${APPLI}/**`, async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${local}${u.pathname}${u.search}` }) });
  });
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript', body: route.request().url().endsWith('firebase-app.js') ? FAUX_APP : FAUX_AUTH,
  }));
  await page.route('https://claude.ai/**', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'retour dans Claude' }));
}
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const adresse = (p) => `${APPLI}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: 'cli_navigateur', redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'etat-nav', resource: `${APPLI}/mcp` })}`;

test('connexion Google, consentement, retour vers Claude avec un code que le serveur échange contre un accès à /mcp', async ({ page }) => {
  const p = pkce();
  await preparer(page, { jeton: 'ID-JEROME', email: 'jerome.chevalier@gmail.com' });
  await page.goto(adresse(p));
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autoriser', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await expect(page.locator('#compte')).toHaveText('jerome.chevalier@gmail.com');
  await expect(page.locator('#destination')).toHaveText('claude.ai');
  await expect(page.getByText('supprimer')).toBeVisible();
  await page.getByRole('button', { name: 'Autoriser', exact: true }).click();
  await page.waitForURL(/claude\.ai\/api\/mcp\/auth_callback/);
  const retour = new URL(page.url());
  expect(retour.searchParams.get('state')).toBe('etat-nav');
  const code = retour.searchParams.get('code');
  expect(code).toMatch(/^cia_c_/);
  const r = await fetch(`${local}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_navigateur', code_verifier: p.verifier }) });
  const t = await r.json();
  expect(r.status).toBe(200);
  const m = await fetch(`${local}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  expect(m.status).toBe(200);
});

test('« Refuser » renvoie vers Claude avec access_denied et aucun code', async ({ page }) => {
  await preparer(page, { jeton: 'ID-JEROME', email: 'jerome.chevalier@gmail.com' });
  await page.goto(adresse(pkce()));
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await page.getByRole('button', { name: 'Refuser' }).click();
  await page.waitForURL(/claude\.ai\/api\/mcp\/auth_callback/);
  const retour = new URL(page.url());
  expect(retour.searchParams.get('error')).toBe('access_denied');
  expect(retour.searchParams.get('code')).toBeNull();
});

test('compte Google non autorisé : message clair, on reste sur la page, aucun code', async ({ page }) => {
  await preparer(page, { jeton: 'ID-INCONNU', email: 'intrus@gmail.com' });
  await page.goto(adresse(pkce()));
  await page.getByRole('button', { name: 'Se connecter avec Google' }).click();
  await page.getByRole('button', { name: 'Autoriser', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("pas autorisé");
  expect(page.url()).toContain('/oauth/authorize');
  await expect(page.getByRole('button', { name: 'Autoriser', exact: true })).toBeEnabled();
});

test('demande piégée (adresse de retour inconnue) : page d’erreur, aucun bouton de connexion', { tag: '@sans-telephone' }, async ({ page }) => {
  await preparer(page, { jeton: 'ID-JEROME', email: 'jerome.chevalier@gmail.com' });
  const p = pkce();
  await page.goto(adresse(p).replace(encodeURIComponent(CALLBACK), encodeURIComponent('https://attaquant.example/rappel')));
  await expect(page.getByText('Connexion impossible').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toHaveCount(0);
});
