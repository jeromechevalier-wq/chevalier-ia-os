// Outils communs aux parcours : émulateurs, SDK Firebase servi localement, connexion, journal de la console.
import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { portsCourants } from '../ports.js';

// Un projet Firebase par worker Playwright (sur le même émulateur) : deux workers ne voient jamais les données l'un de l'autre.
// Hors Playwright (TEST_PARALLEL_INDEX absent), le projet d'avant.
const PORTS = portsCourants();
const INDEX_WORKER = process.env.TEST_PARALLEL_INDEX;
const PROJET_DE_BASE = 'demo-chevalier-ia-os';
export const PROJET = INDEX_WORKER === undefined ? PROJET_DE_BASE : `${PROJET_DE_BASE}-w${INDEX_WORKER}`;
const HOTE_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || `127.0.0.1:${PORTS.firestore}`;
const HOTE_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || `127.0.0.1:${PORTS.auth}`;
export const FIRESTORE = `http://${HOTE_FIRESTORE}`;
export const AUTH = `http://${HOTE_AUTH}`;
const separer = (h) => ({ hote: h.slice(0, h.lastIndexOf(':')), port: Number(h.slice(h.lastIndexOf(':') + 1)) });
/** Ce que l'appli lit (window.__emulateurs) en mode test pour parler au bon projet et aux bons ports. */
export const EMULATEURS_APPLI = { projet: PROJET, auth: separer(HOTE_AUTH), firestore: separer(HOTE_FIRESTORE) };
export const JEROME = 'jerome.chevalier@gmail.com';
export const CHARLES = 'jeromebot.chevalierbot@gmail.com';
export const URL_APP = '/?emulateurs=1';

const DOSSIER_FIREBASE = fileURLToPath(new URL('../node_modules/firebase/', import.meta.url));

// ---------------------------------------------------------------- émulateurs

/**
 * Vide les données du projet de CE worker. Les comptes Auth sont vidés seulement quand un seul worker travaille :
 * l'émulateur Auth range toujours les connexions du navigateur dans son projet par défaut, partagé entre workers
 * (les vider en plein test d'un autre worker le déconnecterait). Les comptes de test sont identiques d'un test à l'autre.
 */
export async function reinitialiser({ viderAuth = true } = {}) {
  const r1 = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
  const r2 = viderAuth ? await fetch(`${AUTH}/emulator/v1/projects/${PROJET_DE_BASE}/accounts`, { method: 'DELETE' }) : { ok: true };
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

/** Crée une personne directement dans l'émulateur (contourne l'interface). */
export async function creerPersonne(id, valeurs = {}) {
  const maintenant = new Date();
  const emails = valeurs.emails || [];
  const nom = (valeurs.nom || 'Personne test').trim();
  const espace = nom.indexOf(' ');
  const doc = {
    nom, prenom: espace === -1 ? '' : nom.slice(0, espace), nomFamille: espace === -1 ? nom : nom.slice(espace + 1), organisationId: null, telephones: [], emails,
    emailsNormalises: emails.map((e) => e.valeur.toLowerCase()), etiquettes: [],
    ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false,
    proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  };
  await ecrireDocument(`crm_personnes/${id}`, doc);
  return doc;
}

export async function creerOrganisation(id, valeurs = {}) {
  const maintenant = new Date();
  const doc = {
    nom: 'Organisation test', adresse: '', ville: '', siteWeb: '', secteur: '', taille: '', etiquettes: [], archive: false,
    proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  };
  await ecrireDocument(`crm_organisations/${id}`, doc);
  return doc;
}

export async function creerAffaire(id, valeurs = {}) {
  const maintenant = new Date();
  const etape = valeurs.etape || 'premier_contact';
  const doc = {
    titre: 'Affaire test', personneId: null, organisationId: null, etape,
    statut: ['gagne', 'facture_envoyee', 'facture_payee'].includes(etape) ? 'gagnee' : 'ouverte', priorite: 'tiede', montant: null, offreId: null,
    dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: { [etape]: maintenant }, raisonPerdue: '',
    raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false,
    proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  };
  await ecrireDocument(`crm_affaires/${id}`, doc);
  return doc;
}

export async function creerProjet(id, valeurs = {}) {
  const maintenant = new Date();
  const phase = valeurs.phase || 'lancement';
  const doc = {
    titre: 'Projet test', affaireId: null, personneId: null, organisationId: null, phase, statut: 'actif', dateDebut: jour(0), dateFin: null,
    modeleId: null, offreId: null, dateEntreePhase: maintenant, datesPhases: { [phase]: maintenant }, documents: [], factures: [], urlGithub: '', urlDossier: '',
    nature: 'livraison', projetSourceId: null, archive: false,
    proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  };
  await ecrireDocument(`projets_projets/${id}`, doc);
  return doc;
}

export async function creerTacheProjet(id, valeurs = {}) {
  const doc = {
    titre: 'Tâche test', projetId: 'pr1', phase: 'lancement', ordre: 1, date: null, heure: '', fait: false, dateFait: null, assigneA: 'jerome',
    auteur: JEROME, creeLe: new Date(), ...valeurs,
  };
  await ecrireDocument(`projets_taches/${id}`, doc);
  return doc;
}

export async function creerActivite(id, valeurs = {}) {
  const doc = {
    type: 'tache', titre: 'Activité test', date: jour(0), heure: '', fait: false, dateFait: null,
    personneId: null, organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), ...valeurs,
  };
  await ecrireDocument(`crm_activites/${id}`, doc);
  return doc;
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
    if (route === 'crm/accueil') await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
  }
}

/** Ouvre le menu sur téléphone si nécessaire, puis clique sur une entrée. */
export async function allerA(page, libelle) {
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.menu').getByRole('link', { name: libelle, exact: true }).click();
}

/** Ouvre une section de la page Réglages par le menu de gauche (« Mon espace », « CRM »…). Sur téléphone, le menu replié s'ouvre d'abord. */
export async function ouvrirSectionReglages(page, nom) {
  const menu = page.locator('.reglages-menu');
  if (estTelephone(page)) await menu.locator('.reglages-menu-bouton').click();
  await menu.getByRole('link', { name: nom, exact: true }).click();
}

/** Réglages du CRM : menu principal « Réglages », puis « CRM » dans le menu de gauche (tout ce que le CRM règle est dans cette page). */
export async function allerAuxReglagesCrm(page) {
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'CRM');
}

export async function valeurObjectif(page, id) {
  return Number(await page.locator(`.objectif[data-objectif="${id}"]`).getAttribute('data-valeur'));
}

// ---------------------------------------------------------------- fixture : SDK local, console, émulateurs propres

export const test = base.extend({
  erreursConsole: [async ({ page, context }, use, testInfo) => {
    // Avant le chargement de l'appli : projet et ports de ce worker (lus par js/os/firebase.js en mode test).
    await context.addInitScript((e) => { window.__emulateurs = e; }, EMULATEURS_APPLI);
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
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`${m.text()}${m.location()?.url ? ` (${m.location().url})` : ''}`); });
    page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
    await reinitialiser({ viderAuth: testInfo.config.workers === 1 });
    await use(erreurs);
  }, { auto: true }],
});

/** C20 : aucune erreur dans la console du navigateur pendant le parcours. */
test.afterEach(async ({ erreursConsole }, info) => {
  if (info.annotations.some((a) => a.type === 'erreurs-reseau-attendues')) return;
  // Une transaction Firestore refusée (409) pendant une écriture directe du test est rejouée par le SDK : le navigateur la note dans sa console,
  // mais ce n'est pas une erreur de l'appli (cause des échecs au hasard « 409 Conflict », voir docs/acceleration-tests-mesures.md). Toute autre erreur reste signalée.
  const reelles = erreursConsole.filter((m) => !/status of 409 \(Conflict\).*documents:commit/.test(String(m)));
  expect(reelles, 'Erreurs dans la console du navigateur').toEqual([]);
});

export { expect };
