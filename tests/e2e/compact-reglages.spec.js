// Réglages plus compacts (nuit du 23/10/2026) : sections « Indicateurs » et « Phases des projets » (et « Étapes des affaires », même composant).
// Un test par critère du brief (nom commençant par le numéro), une capture par critère dans tests/e2e/captures/compact-reglages/. Ordinateur (1280 px) ET téléphone.
// Données fictives. Les hauteurs « avant » sont celles mesurées par boundingBox() sur la version précédente, avec les mêmes données (espace neuf).
import { test, expect, connecter, allerAuxReglagesCrm, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/compact-reglages';
const capture = (page, cible, nom) => cible.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const AVANT = {
  ordinateur: { objectifs: 1042, phases: 1235 },
  telephone: { objectifs: 1575, phases: 1780 },
};
const avant = (page) => (estTelephone(page) ? AVANT.telephone : AVANT.ordinateur);

// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide.
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

async function ouvrir(page) {
  if (!estTelephone(page)) await page.setViewportSize({ width: 1280, height: 900 });
  await connecter(page);
  await allerAuxReglagesCrm(page);
}

async function verifierSansDebordement(page, zone) {
  const largeur = page.viewportSize().width;
  const { page: l, droite } = await zone.evaluate((el) => ({ page: document.documentElement.scrollWidth, droite: el.getBoundingClientRect().right }));
  expect(l).toBeLessThanOrEqual(largeur);
  expect(droite).toBeLessThanOrEqual(largeur);
}

test('1 Indicateurs : la section est au moins 35 % moins haute sur ordinateur (pas plus haute sur téléphone), avec les mêmes fonctions', async ({ page }) => {
  await ouvrir(page);
  const sec = page.locator('#reglages-objectifs');
  await expect(sec.locator('.ligne-objectif')).toHaveCount(5);
  const hauteur = (await sec.boundingBox()).height;
  const ref = avant(page).objectifs;
  console.log(`Indicateurs : ${Math.round(ref)} px avant, ${Math.round(hauteur)} px après (${Math.round((1 - hauteur / ref) * 100)} %)`);
  if (estTelephone(page)) expect(hauteur).toBeLessThanOrEqual(ref);
  else expect(hauteur).toBeLessThanOrEqual(ref * 0.65);
  // plus de paragraphe d'aide sous chaque ligne : seule l'icône « i » reste
  await expect(sec.locator('p[data-role="explication"]')).toHaveCount(0);
  // mêmes fonctions : libellé, cible, couleur, actif, flèches
  const ligne = sec.locator('.ligne-objectif[data-objectif="ca_encaisse"]');
  await expect(ligne.getByLabel(/^Cible : Chiffre d.affaires encaissé$/)).toBeVisible();
  await expect(ligne.getByLabel(/^Couleur : Chiffre d.affaires encaissé$/)).toBeVisible();
  await expect(ligne.getByLabel(/^Afficher : Chiffre d.affaires encaissé$/)).toBeVisible();
  await expect(ligne.getByLabel('Monter')).toBeVisible();
  await expect(ligne.getByLabel('Descendre')).toBeVisible();
  // l'explication reste lisible : au clavier (focus sur « i ») la bulle s'ouvre
  await ligne.locator('[data-role="info"]').focus();
  await expect(ligne.locator('[data-role="explication"]')).toContainText('marquées payées');
  await capture(page, sec, '1-indicateurs');
});

test('2 Phases des projets : la section est au moins 35 % moins haute sur ordinateur (pas plus haute sur téléphone)', async ({ page }) => {
  await ouvrir(page);
  const sec = page.locator('#reglages-phases');
  await expect(sec.locator('.emplacement')).toHaveCount(6);
  const hauteur = (await sec.boundingBox()).height;
  const ref = avant(page).phases;
  console.log(`Phases des projets : ${Math.round(ref)} px avant, ${Math.round(hauteur)} px après (${Math.round((1 - hauteur / ref) * 100)} %)`);
  if (estTelephone(page)) expect(hauteur).toBeLessThanOrEqual(ref);
  else expect(hauteur).toBeLessThanOrEqual(ref * 0.65);
  await expect(sec.getByLabel('Description de l’emplacement 1')).toBeVisible();
  await expect(sec.locator('[data-role="action-active"]')).toHaveCount(6);
  await capture(page, sec, '2-phases');
});

test('3 Phases : une explication écrite reste visible, une phase vide permet d’en saisir une en un clic ; le champ grandit avec le texte', async ({ page }) => {
  await ouvrir(page);
  const sec = page.locator('#reglages-phases');
  const champ = sec.getByLabel('Description de l’emplacement 2');
  const vide = await champ.boundingBox();
  await expect(champ).toHaveValue('');
  // un seul clic : on tape tout de suite
  await champ.click();
  await champ.pressSequentially('On découvre le besoin du client. ');
  await expect(sec.locator('[data-action="enregistrer-phase"]')).toBeEnabled();
  await champ.fill('On découvre le besoin du client, ses contraintes, son budget, ses dates et les personnes qui décident, puis on note tout ici pour que chacun retrouve l’essentiel sans relire les échanges. '.repeat(3));
  const long = await champ.boundingBox();
  expect(long.height).toBeGreaterThan(vide.height);
  await capture(page, sec.locator('.emplacement[data-emplacement="decouverte"]'), '3-phase-texte-long');
  await champ.fill('On découvre le besoin du client.');
  await sec.locator('[data-action="enregistrer-phase"]').click();
  await expect(page.locator('.toast', { hasText: 'Phases enregistrées' })).toBeVisible();
  // après rechargement la phase montre toujours son explication, l'autre reste vide
  await page.reload();
  await allerAuxReglagesCrm(page);
  await expect(sec.getByLabel('Description de l’emplacement 2')).toHaveValue('On découvre le besoin du client.');
  await expect(sec.getByLabel('Description de l’emplacement 1')).toHaveValue('');
  await capture(page, sec, '3-phase-avec-explication');
});

test('4 Téléphone et ordinateur : zones de clic de 44 px sur téléphone, aucun débordement', async ({ page }) => {
  await ouvrir(page);
  const obj = page.locator('#reglages-objectifs');
  const pha = page.locator('#reglages-phases');
  await verifierSansDebordement(page, obj);
  await verifierSansDebordement(page, pha);
  if (estTelephone(page)) {
    const zones = [
      ...(await obj.locator('.ligne-objectif [data-role="info"]').all()),
      ...(await obj.locator('.ligne-objectif label.case').all()),
      ...(await pha.locator('.emplacement label.case').all()),
      ...(await pha.locator('.emplacement textarea').all()),
    ];
    expect(zones.length).toBeGreaterThan(20);
    for (const z of zones) {
      const b = await z.boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(43.5);
      if ((await z.getAttribute('data-role')) === 'info') expect(b.width).toBeGreaterThanOrEqual(43.5);
    }
  }
  await capture(page, pha.locator('.emplacement').first(), '4-zones-de-clic');
});

test('5 Étapes des affaires : même composant, même compacité que les phases, le mot « étape » reste', async ({ page }) => {
  await ouvrir(page);
  const sec = page.locator('#reglages-etapes');
  await expect(sec.locator('.emplacement')).toHaveCount(6);
  await expect(sec.locator('.emplacement .ligne-explication textarea').first()).toHaveAttribute('placeholder', /Explication de cette étape/);
  await expect(sec.locator('.emplacement')).toContainText(['Vente gagnée']);
  const hauteur = (await sec.boundingBox()).height;
  const ref = avant(page).phases; // même composant : mêmes lignes qu'avant
  if (estTelephone(page)) expect(hauteur).toBeLessThanOrEqual(ref);
  else expect(hauteur).toBeLessThanOrEqual(ref * 0.65);
  await verifierSansDebordement(page, sec);
  await capture(page, sec, '5-etapes-affaires');
});
