// Réglages > Devis : trois pastilles en haut (Général, Mon entreprise, Familles d'articles), les mêmes « raccourcis » que les réglages Affaires et Projets :
// toutes les sections restent sur la page, la pastille fait défiler jusqu'à sa section. Chez Jérôme (racine), ordinateur et téléphone.
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/devis-reglages-pastilles/ (un fichier par format).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-reglages-pastilles/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const pastille = (page, vers) => page.locator(`.reglages-raccourcis .reglages-raccourci[data-vers="${vers}"]`);

async function ouvrirReglagesDevis(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
  await attendreCalme(page);
}
/** La section est dans l'écran (le défilement doux peut prendre un instant). */
async function dansEcran(page, selecteur) {
  await expect.poll(async () => page.locator(selecteur).evaluate((el) => { const r = el.getBoundingClientRect(); const barre = document.querySelector('.barre-haut'); const bas = barre && getComputedStyle(barre).display !== 'none' ? barre.getBoundingClientRect().bottom : 0; return r.top >= bas - 2 && r.top < window.innerHeight / 2; })).toBe(true);
}

test('1 trois pastilles en haut (Général, Mon entreprise, Familles d\'articles), et toutes les sections restent sur la page', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  const barre = page.locator('.reglages-raccourcis');
  await expect(barre).toBeVisible();
  await expect(barre.locator('.reglages-raccourci')).toHaveCount(3);
  await expect(pastille(page, 'reglages-devis')).toContainText('Général');
  await expect(pastille(page, 'reglages-entreprise')).toContainText('Mon entreprise');
  await expect(pastille(page, 'reglages-familles')).toContainText('Familles d’articles');
  await expect(page.locator('#devis-nomBordereau')).toBeVisible();
  await expect(page.locator('#mon-entreprise')).toBeAttached();
  await expect(page.locator('#reglages-familles')).toBeAttached();
  await capturer(page, info, '1-pastilles');
});

test('2 un clic sur une pastille amène sa section dans l\'écran, et les changements en cours restent (un seul bouton « Enregistrer »)', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  const enregistrer = page.locator('[data-action="enregistrer-reglages-devis"]');
  await expect(enregistrer).toBeDisabled();
  await page.locator('#devis-marge').fill('30');
  await expect(enregistrer).toBeEnabled();
  await pastille(page, 'reglages-entreprise').click();
  await dansEcran(page, '#mon-entreprise');
  await expect(enregistrer).toBeEnabled();
  await capturer(page, info, '2-mon-entreprise');
  await pastille(page, 'reglages-familles').click();
  await dansEcran(page, '#reglages-familles');
  await expect(enregistrer).toBeEnabled();
  await pastille(page, 'reglages-devis').click();
  await expect(page.locator('#devis-marge')).toHaveValue('30');
});

test('3 la pastille « Mon entreprise » a un point d\'alerte tant que des mentions manquent (assurance incomplète comprise), et le perd quand tout est rempli', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  // Taper dans un champ ne recrée pas les boutons de la barre (le focus d'une pastille ne se perd pas).
  await pastille(page, 'reglages-devis').evaluate((b) => { b.dataset.temoin = 'oui'; });
  await page.locator('[data-champ="entreprise.nom"]').pressSequentially('Atelier');
  await expect(pastille(page, 'reglages-devis')).toHaveAttribute('data-temoin', 'oui');
  await page.locator('[data-champ="entreprise.nom"]').fill('');
  const alerte = pastille(page, 'reglages-entreprise').locator('[data-role="alerte-raccourci"]');
  await expect(alerte).toBeVisible(); // entreprise vide : il manque des mentions
  await expect(pastille(page, 'reglages-devis').locator('[data-role="alerte-raccourci"]')).toHaveCount(0);
  await capturer(page, info, '3-alerte-entreprise-vide');
  const champs = {
    'entreprise.nom': 'Atelier Exemple', 'entreprise.forme': 'SARL', 'entreprise.siret': '123 456 789 00012', 'entreprise.adresse.ligne1': '1 rue des Lilas',
    'entreprise.adresse.codePostal': '75001', 'entreprise.adresse.ville': 'Paris', 'entreprise.email': 'contact@exemple.fr', 'entreprise.assurance.garantie': 'Garantie décennale',
    'entreprise.assurance.assureur': 'Assureur Exemple', 'entreprise.mediateur.nom': 'Médiateur Exemple', 'entreprise.mediateur.site': 'https://mediateur.exemple.fr',
  };
  for (const [cle, valeur] of Object.entries(champs)) await page.locator(`[data-champ="${cle}"]`).fill(valeur);
  await expect(page.locator('[data-zone="mentions-manquantes"]')).toBeHidden();
  await expect(alerte).toHaveCount(0); // même liste que « Mentions manquantes » : plus rien ne manque
  await page.locator('[data-champ="entreprise.assurance.garantie"]').fill(''); // assurance incomplète
  await expect(page.locator('[data-zone="mentions-manquantes"]')).toBeVisible();
  await expect(alerte).toBeVisible();
  await capturer(page, info, '3-alerte-assurance-incomplete');
});

test('4 cas vide : sans rien d\'enregistré, les sept familles de départ et le formulaire par défaut s\'affichent ; le lien « Réglages > Familles d\'articles » arrive sur les familles', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  await expect(page.locator('#reglages-familles [data-niveau="1"]')).toHaveCount(7);
  await expect(page.locator('[data-action="enregistrer-reglages-devis"]')).toBeDisabled();
  await page.evaluate(() => { location.hash = '#/reglages/devis/reglages-familles'; });
  await attendreCalme(page);
  await dansEcran(page, '#reglages-familles');
  await capturer(page, info, '4-lien-familles');
});
