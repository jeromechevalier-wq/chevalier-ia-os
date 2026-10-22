// Livrables : affichage (N1, N2). Les captures (format ordinateur) vont dans tests/e2e/captures/livrables-affichage/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerProjet, creerTacheProjet, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/livrables-affichage/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function ouvrir(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('N1 titres des groupes : « Livrable Lancement » (1) et « Livrables Découverte » (2), sans majuscules forcées', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'lancement' });
  await creerTacheProjet('t1', { titre: 'Courrier de lancement', phase: 'lancement' });
  await creerTacheProjet('t2', { titre: 'Interview Carrel', phase: 'decouverte' });
  await creerTacheProjet('t3', { titre: 'Synthèse', phase: 'decouverte', ordre: 2 });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const titres = section.locator('.groupe-taches .titre-livrables');
  await expect(titres).toHaveCount(2);
  const lus = await titres.evaluateAll((els) => els.map((el) => ({
    texte: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
    casse: getComputedStyle(el).textTransform,
  })));
  expect(lus).toEqual([{ texte: 'Livrable Lancement', casse: 'none' }, { texte: 'Livrables Découverte', casse: 'none' }]);
  await expect(titres.nth(0).locator('.compteur')).toHaveText('0/1');
  await expect(titres.nth(1).locator('.compteur')).toHaveText('0/2');
  await capturer(page, info, 'N1-titres-groupes');
});

test('N2 le bouton d’ajout d’un livrable est jaune plein « Enregistrer le livrable » ; titre vide refusé ; l’ajout fonctionne', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  await section.getByLabel('Nouveau livrable').click();
  const bouton = section.locator('[data-action="ajouter-tache"]');
  await expect(bouton).toHaveText('Enregistrer le livrable');
  await expect(bouton).toHaveClass(/bouton-principal/);
  await capturer(page, info, 'N2-bouton-enregistrer');
  // cas d'erreur : titre vide
  await bouton.click();
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  expect(await listerDocuments('projets_taches')).toHaveLength(0);
  // ajout
  await section.getByLabel('Nouveau livrable').fill('Rapport final');
  await bouton.click();
  await expect.poll(async () => (await listerDocuments('projets_taches')).map((d) => d.titre)).toEqual(['Rapport final']);
  await expect(section.locator('.groupe-taches .titre-livrables')).toContainText('Livrable Découverte');
});

test('N2 le formulaire de modification d’un livrable garde ses boutons', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerTacheProjet('t1', { titre: 'Écrire le devis' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  await page.locator('.tache[data-tache="t1"] [data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await expect(page.getByRole('dialog')).toContainText('Modifier le livrable');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer le livrable' })).toHaveCount(0);
});
