// Onglets apportés par un module sur la fiche d'une affaire (mécanisme générique, PR 1) : rien n'est inscrit en production, le test inscrit un onglet lui-même.
// Captures (données fictives) dans tests/e2e/captures/onglets-modules/.
import {
  test, expect, attendreCalme, connecter, creerAffaire, estTelephone,
} from './outils.js';

const CAPTURES = 'e2e/captures/onglets-modules';
async function capture(page, nom) {
  // Sur téléphone la barre défile dans elle-même : on amène l'onglet « Essai » (s'il existe) dans la vue, sinon la capture ne montrerait pas l'état testé.
  if (await ongletEssai(page).count()) await ongletEssai(page).scrollIntoViewIfNeeded();
  return capturer(page, nom);
}
const capturer = (page, nom) => page.locator('.compositeur').screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

/** Inscrit un fournisseur d'onglet (même instance de module que l'appli) ; `corps` est évalué dans la page. Appelle signaler(). */
async function inscrire(page, nom, corps) {
  await page.evaluate(async ({ nom, corps }) => {
    const P = await import('/js/modules/crm/pastilles-externes.js');
    window.__retraitsOnglets = window.__retraitsOnglets || {};
    // eslint-disable-next-line no-new-func
    window.__retraitsOnglets[nom] = P.inscrireOngletAffaire(new Function('affaireId', corps));
    P.signaler();
  }, { nom, corps });
}
async function retirer(page, nom) {
  await page.evaluate(async (nom) => {
    const P = await import('/js/modules/crm/pastilles-externes.js');
    window.__retraitsOnglets[nom]();
    P.signaler();
  }, nom);
}
const FOURNISSEUR_ESSAI = `return { id: 'essai', libelle: 'Essai', icone: 'file-text', element: Object.assign(document.createElement('p'), { textContent: 'Contenu essai' }), compteur: 2 };`;
const ongletEssai = (page) => page.locator('.compositeur [data-onglet="essai"]');
const panneauEssai = (page) => page.locator('.compositeur [role="tabpanel"][aria-label="Essai"]');

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 cas vide : sans module inscrit, la barre de l\'affaire a ses 3 onglets, comme avant', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const onglets = page.locator('.compositeur [role="tab"]');
  await expect(onglets.nth(0)).toContainText('Activité');
  await expect(onglets.nth(1)).toContainText('Notes');
  await expect(onglets.nth(2)).toContainText('Documents');
  await expect(page.locator('.compositeur [data-onglet="essai"]')).toHaveCount(0); // aucun onglet de démonstration en production
  await capture(page, '1-sans-module');
});

test('2 un onglet inscrit apparaît après Documents avec son compteur ; un clic l\'affiche et cache les autres panneaux ; les trois autres marchent toujours', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const onglets = page.locator('.compositeur [role="tab"]');
  const base = await onglets.count();
  await inscrire(page, 'essai', FOURNISSEUR_ESSAI);
  await expect(onglets).toHaveCount(base + 1);
  expect(await ongletEssai(page).evaluate((b) => [...b.parentElement.children].indexOf(b))).toBeGreaterThanOrEqual(3); // après Documents
  await expect(ongletEssai(page)).toBeVisible();
  await expect(ongletEssai(page)).toContainText('Essai');
  await expect(ongletEssai(page).locator('.compteur')).toHaveText('2');
  await expect(ongletEssai(page)).not.toHaveAttribute('id', /.+/); // aucun id= : une fiche affaire et une fiche projet peuvent coexister
  await expect(panneauEssai(page)).toBeHidden();
  await capture(page, '2a-onglet-inscrit');
  await ongletEssai(page).click();
  await expect(ongletEssai(page)).toHaveAttribute('aria-selected', 'true');
  await expect(panneauEssai(page)).toBeVisible();
  await expect(panneauEssai(page)).toContainText('Contenu essai');
  for (const nom of ['Activité', 'Notes', 'Documents']) await expect(page.locator(`.compositeur [role="tabpanel"][aria-label="${nom}"]`)).toBeHidden();
  await capture(page, '2b-onglet-ouvert');
  // Les trois onglets d'origine marchent toujours.
  for (const nom of ['Notes', 'Documents', 'Activité']) {
    await page.locator('.compositeur [role="tab"]', { hasText: nom }).click();
    await expect(page.locator(`.compositeur [role="tabpanel"][aria-label="${nom}"]`)).toBeVisible();
    await expect(panneauEssai(page)).toBeHidden();
    await expect(ongletEssai(page)).toHaveAttribute('aria-selected', 'false');
  }
});

test('3 retirer le fournisseur et signaler() : l\'onglet disparaît ; s\'il était actif, Activité redevient actif sans voler le focus', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const base = await page.locator('.compositeur [role="tab"]').count();
  await inscrire(page, 'essai', FOURNISSEUR_ESSAI);
  await ongletEssai(page).click(); // le focus est sur l'onglet lui-même : la fiche peut se redessiner
  await expect(panneauEssai(page)).toBeVisible();
  await retirer(page, 'essai');
  await expect(ongletEssai(page)).toHaveCount(0);
  await expect(panneauEssai(page)).toHaveCount(0);
  await expect(page.locator('.compositeur [role="tab"]')).toHaveCount(base);
  const activite = page.locator('.compositeur [role="tab"]', { hasText: 'Activité' });
  await expect(activite).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.compositeur [role="tabpanel"][aria-label="Activité"]')).toBeVisible();
  await expect(page.getByLabel('Titre de l’activité')).not.toBeFocused(); // pas de focus volé
  await expect(page.locator('.compositeur [role="tabpanel"][aria-label="Activité"]')).toHaveClass(/replie/); // le formulaire reste replié
  await capture(page, '3-apres-retrait');
});

test('4 cas d\'erreur : un fournisseur qui plante est ignoré, rien d\'autre ne casse', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const base = await page.locator('.compositeur [role="tab"]').count();
  await inscrire(page, 'panne', `throw new Error('panne simulée');`);
  await inscrire(page, 'essai', FOURNISSEUR_ESSAI);
  await expect(ongletEssai(page)).toHaveCount(1);
  await expect(page.locator('.compositeur [role="tab"]')).toHaveCount(base + 1);
  await expect(page.locator('.fiche')).toBeVisible();
  await capture(page, '4-fournisseur-en-panne');
});

test('5 un id déjà pris (autre fournisseur ou onglet fixe) est ignoré : jamais deux onglets identiques', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const base = await page.locator('.compositeur [role="tab"]').count();
  await inscrire(page, 'essai', FOURNISSEUR_ESSAI);
  await inscrire(page, 'double', FOURNISSEUR_ESSAI.replace('Essai', 'Doublon'));
  await inscrire(page, 'fixe', `return { id: 'documents', libelle: 'Faux documents', icone: 'file-text', element: document.createElement('p') };`);
  await expect(page.locator('.compositeur [role="tab"]')).toHaveCount(base + 1);
  await expect(page.locator('.compositeur [data-onglet="essai"]')).toHaveCount(1);
  await expect(ongletEssai(page)).toContainText('Essai');
  await expect(page.locator('.compositeur [data-onglet="documents"]')).toHaveCount(1);
  await expect(page.locator('.compositeur [data-onglet="documents"]')).toContainText('Documents');
  await expect(page.locator('.compositeur [role="tab"]', { hasText: 'Doublon' })).toHaveCount(0);
  await capture(page, '5-id-en-double');
});

test('6 téléphone : 5 onglets tiennent sans débordement de la page ; la barre défile dans elle-même ; onglets de 44 px au moins', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const base = await page.locator('.compositeur [role="tab"]').count();
  await inscrire(page, 'essai', FOURNISSEUR_ESSAI);
  await inscrire(page, 'rapports', `return { id: 'rapports', libelle: 'Rapports mensuels', icone: 'file-text', element: document.createElement('p'), compteur: 12 };`);
  await expect(page.locator('.compositeur [role="tab"]')).toHaveCount(base + 2);
  expect(base + 2).toBeGreaterThanOrEqual(5);
  const m = await page.evaluate(() => {
    const barre = document.querySelector('.compositeur .onglets');
    return {
      pageDeborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      barreDefile: barre.scrollWidth > barre.clientWidth,
      overflowX: getComputedStyle(barre).overflowX,
      flexWrap: getComputedStyle(barre).flexWrap,
      hauteurs: [...barre.querySelectorAll('.onglet')].map((o) => o.getBoundingClientRect().height),
    };
  });
  expect(m.pageDeborde).toBe(false);
  expect(m.flexWrap).toBe('nowrap');
  expect(m.overflowX).toBe('auto');
  expect(m.barreDefile).toBe(true);
  for (const hauteur of m.hauteurs) expect(hauteur).toBeGreaterThanOrEqual(44);
  await capture(page, '6a-cinq-onglets');
  await page.evaluate(() => { const b = document.querySelector('.compositeur .onglets'); b.scrollLeft = b.scrollWidth; });
  await capture(page, '6b-barre-defilee');
});
