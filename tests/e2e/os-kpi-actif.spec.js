// Tables des objectifs de l'Accueil, interrupteur TABLE_KPI_ACTIVE allumé : os_kpi / os_kpi_saisies (les anciennes ne sont jamais écrites ni supprimées).
// Données fictives. Capture dans tests/e2e/captures/os-kpi-actif/.
import {
  test, expect, attendreCalme, connecter, ecrireDocument, listerDocuments, estTelephone, valeurObjectif, allerA, JEROME,
} from './outils.js';

const CAPTURES = 'e2e/captures/os-kpi-actif';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const mois = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const FLYERS = { id: 'flyers', libelle: 'Flyers distribués', type: 'manuel', calcul: null, cible: 100, unite: '', couleur: '#ffe56c', ordre: 1, actif: true };
const LIVRETS = { id: 'livrets', libelle: 'Livrets remis', type: 'manuel', calcul: null, cible: 20, unite: '', couleur: '#b98ee0', ordre: 2, actif: true };

test('KPI1 la nouvelle table est remplie : l’Accueil affiche ses objectifs et la saisie s’écrit dans os_kpi_saisies, jamais dans l’ancienne', async ({ page }) => {
  await ecrireDocument('os_kpi/flyers', FLYERS);
  await ecrireDocument('os_kpi/livrets', LIVRETS);
  await ecrireDocument('os_objectifs/ancien', { ...FLYERS, id: 'ancien', libelle: 'Objectif de l’ancienne table' }); // doit rester invisible
  await connecter(page, JEROME, { attendreAccueil: false });
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(2);
  await expect(page.locator('.objectif-libelle', { hasText: 'Objectif de l’ancienne table' })).toHaveCount(0);
  await page.locator('.objectif[data-objectif="flyers"]').getByRole('button', { name: 'Ajouter 10 à Flyers distribués' }).click();
  await expect.poll(() => valeurObjectif(page, 'flyers')).toBe(10);
  await expect.poll(async () => (await listerDocuments('os_kpi_saisies'))[0]?.valeur).toBe(10);
  expect(await listerDocuments('os_objectifs_saisies')).toHaveLength(0);
  expect(await listerDocuments('os_objectifs')).toHaveLength(1); // l'ancienne table est intacte
  expect(await listerDocuments('os_kpi')).toHaveLength(2);
  await page.reload();
  await expect(page.locator('.objectif[data-objectif="flyers"] .objectif-pct')).toHaveText('10 %');
  await attendreCalme(page);
  await capture(page, 'accueil');
});

test('KPI2 nouvelle table vide et ancienne remplie : repli en lecture, aucune écriture dans l’ancienne, modifier une cible est refusé proprement', async ({ page }) => {
  await ecrireDocument('os_objectifs/flyers', FLYERS);
  await ecrireDocument('os_objectifs/livrets', LIVRETS);
  await ecrireDocument(`os_objectifs_saisies/flyers_${mois}`, { objectifId: 'flyers', mois, valeur: 3 });
  await connecter(page, JEROME, { attendreAccueil: false });
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(2); // lus dans l'ancienne table
  await expect.poll(() => valeurObjectif(page, 'flyers')).toBe(3);
  expect(await listerDocuments('os_kpi')).toHaveLength(0); // pas d'objectifs de départ créés : l'ancienne table n'est pas vide
  // Réglages : modifier la cible échoue avec le message habituel, l'ancienne table ne bouge pas
  await page.evaluate(() => { location.hash = '#/reglages/crm'; });
  const sec = page.locator('#reglages-objectifs');
  await expect(sec).toBeVisible();
  await sec.getByLabel('Cible : Flyers distribués').fill('250');
  await sec.getByLabel('Cible : Flyers distribués').dispatchEvent('change');
  await expect(page.getByText('Modification impossible')).toBeVisible();
  await expect.poll(async () => (await listerDocuments('os_objectifs')).find((o) => o.id === 'flyers').cible).toBe(100);
  expect(await listerDocuments('os_kpi')).toHaveLength(0);
  // Saisie : va dans la nouvelle table, l'ancienne garde sa valeur
  await allerA(page, 'Accueil');
  await page.locator('.objectif[data-objectif="flyers"]').getByRole('button', { name: 'Ajouter 10 à Flyers distribués' }).click();
  await expect.poll(async () => (await listerDocuments('os_kpi_saisies'))[0]?.valeur).toBe(10);
  expect((await listerDocuments('os_objectifs_saisies'))[0].valeur).toBe(3);
});

test('KPI3 les deux tables vides (espace neuf) : les objectifs de départ sont créés dans os_kpi, rien dans l’ancienne', async ({ page }) => {
  await connecter(page);
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
  await expect.poll(async () => (await listerDocuments('os_kpi')).length).toBe(5);
  expect(await listerDocuments('os_objectifs')).toHaveLength(0);
  expect(await listerDocuments('os_objectifs_saisies')).toHaveLength(0);
});
