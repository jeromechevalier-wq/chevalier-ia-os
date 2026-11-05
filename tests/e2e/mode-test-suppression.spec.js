// Mode test, PR 4 : Réglages > « Mes tests » (aperçu des éléments de test et « Supprimer tous mes tests »). La fonction du serveur (modeTestSupprimer) est SIMULÉE
// par page.route : aucun appel réseau réel (le vrai cœur est essayé à part : tests/mode-test-suppression.test.js). Le nom de chaque test commence par le numéro du critère.
// Exemples chiffrés : un devis de test à 100 € HT. Captures dans tests/e2e/captures/mode-test-suppression/.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/mode-test-suppression/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const COMPTES = { devis: 1, taches: 0, projets: 0, activites: 0, notes: 0, evenements: 0, affaires: 1, personnes: 1, organisations: 0 };
const APERCU = { apercu: true, total: 3, comptes: COMPTES, noms: ['crm_personnes : « Paul Essai »', 'devis_devis : « Devis à 100 € HT »', 'crm_affaires : « Affaire essai »'], relies: [{ collection: 'crm_notes', id: 'n2', libelle: 'crm_notes : « Note réelle »', raison: 'élément réel gardé : son lien vers un test supprimé est vidé' }], nonRestaurables: 1, empreinte: 'EMPREINTE-1' };
const VIDE = { apercu: true, rien: true, total: 0, comptes: { ...COMPTES, devis: 0, affaires: 0, personnes: 0 }, noms: [], relies: [], nonRestaurables: 0, empreinte: 'EMPREINTE-0' };

/** Faux serveur : `apercus` = aperçus successifs (le dernier se répète) ; `suppression` = réponse à { apercu: false } (objet `{ erreur: { status, message } }` pour un refus, `null` pour une panne réseau). */
async function simuler(page, { apercus = [APERCU], suppression = { supprime: true, total: 3 } } = {}) {
  const etat = { demandes: [] };
  let n = 0;
  await page.route('**/modeTestSupprimer', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const demande = JSON.parse(route.request().postData() || '{}').data;
    etat.demandes.push(demande);
    if (demande.apercu === false) {
      if (suppression === null) return route.abort('connectionfailed');
      if (suppression.erreur) return route.fulfill({ status: 400, headers: CORS, body: JSON.stringify({ error: suppression.erreur }) });
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ result: { ok: true, tests: suppression } }) });
    }
    const a = apercus[Math.min(n, apercus.length - 1)];
    n += 1;
    if (a === null) return route.abort('connectionfailed');
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ result: { ok: true, tests: a } }) });
  });
  return etat;
}
const section = (page) => page.locator('#reglages-tests');
const bouton = (page) => page.locator('[data-action="supprimer-tests"]');
const dialogue = (page) => page.getByRole('dialog');
async function ouvrir(page) {
  await connecter(page, JEROME, { route: 'reglages/tests' });
  await expect(section(page)).toBeVisible();
  await expect(page.locator('[data-role="chargement-tests"]')).toHaveCount(0);
  await attendreCalme(page);
}

test('1 Réglages > Mes tests : les comptes par type et les premiers noms viennent du serveur ; une personne réelle n’est pas comptée', async ({ page }, info) => {
  const serveur = await simuler(page);
  await ouvrir(page);
  await expect(page.locator('.reglages-menu-lien[data-reglage="tests"]')).toHaveText('Mes tests');
  await expect(section(page).locator('[data-info="personnes"]')).toContainText('1 personne');
  await expect(section(page).locator('[data-info="devis"]')).toContainText('1 devis');
  await expect(section(page).locator('[data-info="affaires"]')).toContainText('1 affaire');
  await expect(section(page).locator('[data-info="organisations"]')).toContainText('0 organisation');
  await expect(section(page).locator('[data-role="noms-tests"]')).toContainText('Paul Essai');
  await expect(section(page).locator('[data-role="noms-tests"]')).toContainText('Devis à 100 € HT');
  await expect(section(page).locator('[data-role="relies-tests"]')).toContainText('Note réelle');
  await expect(bouton(page)).toBeEnabled();
  expect(serveur.demandes[0]).toEqual({ apercu: true });
  await capturer(page, info, '1-apercu');
});

test('2 le bouton ouvre la fenêtre ; « Supprimer 3 éléments » reste grisé tant que la phrase n’est pas tapée ; un appel { apercu: false, empreinte } ; toast ; cas vide', async ({ page }, info) => {
  const serveur = await simuler(page, { apercus: [APERCU, VIDE] });
  await ouvrir(page);
  await bouton(page).click();
  await expect(dialogue(page)).toContainText('Supprimer tous mes tests ?');
  await expect(dialogue(page)).toContainText('3 éléments');
  await expect(dialogue(page)).toContainText('TEST-');
  const confirmer = dialogue(page).getByRole('button', { name: 'Supprimer 3 éléments' });
  await expect(confirmer).toBeDisabled();
  const champ = dialogue(page).getByLabel('Tape : supprimer mes tests');
  await champ.fill('supprimer');
  await expect(confirmer).toBeDisabled();
  await capturer(page, info, '2-fenetre');
  await champ.fill('  SUPPRIMER mes tests ');
  await expect(confirmer).toBeEnabled();
  await confirmer.click();
  await expect(page.locator('.toast').first()).toContainText('3 éléments supprimés');
  await expect.poll(() => serveur.demandes.length).toBe(3);
  expect(serveur.demandes[1]).toEqual({ apercu: false, empreinte: 'EMPREINTE-1' });
  await expect(section(page).locator('[data-role="vide-tests"]')).toContainText('Aucun élément de test pour l’instant');
  await expect(bouton(page)).toBeDisabled();
  await capturer(page, info, '2-vide');
});

test('3 liste changée : message sous le bouton et aperçu rechargé ; panne réseau : message + Réessayer ; annuler ne change rien', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400 ou coupe la connexion' } }, async ({ page }, info) => {
  const serveur = await simuler(page, { suppression: { erreur: { status: 'FAILED_PRECONDITION', message: 'La liste de tes tests a changé depuis l’aperçu : relance l’aperçu.' } } });
  await ouvrir(page);
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(serveur.demandes.length).toBe(1); // annuler : aucun appel de plus
  await bouton(page).click();
  await dialogue(page).getByLabel('Tape : supprimer mes tests').fill('supprimer mes tests');
  await dialogue(page).getByRole('button', { name: 'Supprimer 3 éléments' }).click();
  await expect(section(page).locator('[data-role="message-tests"]')).toContainText('La liste de tes tests a changé');
  await expect.poll(() => serveur.demandes.length).toBe(3); // aperçu, suppression refusée, aperçu rechargé
  await expect(section(page).locator('[data-info="personnes"]')).toBeVisible();
  await capturer(page, info, '3-liste-changee');
});

test('3 panne réseau à l’ouverture : « Ça n’a pas abouti » et Réessayer ; le second essai réussit', { annotation: { type: 'erreurs-reseau-attendues', description: 'la connexion est coupée exprès' } }, async ({ page }, info) => {
  await simuler(page, { apercus: [null, APERCU] });
  await connecter(page, JEROME, { route: 'reglages/tests' });
  const erreur = section(page).locator('[data-role="erreur-tests"]');
  await expect(erreur).toContainText('Ça n’a pas abouti');
  await expect(bouton(page)).toBeDisabled();
  await capturer(page, info, '3-erreur');
  await section(page).locator('[data-action="reessayer-tests"]').click();
  await expect(section(page).locator('[data-info="personnes"]')).toContainText('1 personne');
  await expect(erreur).toHaveCount(0);
});
