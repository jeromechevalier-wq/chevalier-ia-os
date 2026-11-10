// Bandeaux de confirmation (toast) : pas d'empilement. 1 au plus 2 visibles ; 2 textes identiques = un seul ; 3 une erreur reste.
import { test, expect, connecter, attendreCalme } from './outils.js';

const envoyer = (page, liste) => page.evaluate(async (l) => {
  const { toast } = await import('/js/os/ui.js');
  for (const [m, o] of l) toast(m, { ...o, duree: 20000 });
}, liste);

test('1 trois confirmations rapides de textes différents : au plus 2 bandeaux visibles', async ({ page }) => {
  await connecter(page); await attendreCalme(page);
  await envoyer(page, [['Client ajouté'], ['Devis finalisé'], ['Devis marqué envoyé']]);
  await expect(page.locator('.toast')).toHaveCount(2);
  await expect(page.locator('.toast').first()).toContainText('Devis finalisé');
  await expect(page.locator('.toast').last()).toContainText('Devis marqué envoyé');
  await page.screenshot({ path: `e2e/captures/bandeaux/1-deux-bandeaux-au-plus-${test.info().project.name}.png`, animations: 'disabled' });
});

test('2 deux confirmations identiques : un seul bandeau', async ({ page }) => {
  await connecter(page); await attendreCalme(page);
  await envoyer(page, [['Client ajouté'], ['Client ajouté']]);
  await expect(page.locator('.toast')).toHaveCount(1);
  await page.screenshot({ path: `e2e/captures/bandeaux/2-un-seul-bandeau-${test.info().project.name}.png`, animations: 'disabled' });
});

test('3 une erreur reste affichée même si deux succès arrivent après', async ({ page }) => {
  await connecter(page); await attendreCalme(page);
  await envoyer(page, [['Enregistrement impossible', { type: 'erreur' }], ['Devis finalisé'], ['Devis marqué signé']]);
  await expect(page.locator('.toast-erreur')).toHaveCount(1);
  await expect(page.locator('.toast-erreur')).toContainText('Enregistrement impossible');
  await expect(page.locator('.toast')).toHaveCount(2);
  await page.screenshot({ path: `e2e/captures/bandeaux/3-erreur-conservee-${test.info().project.name}.png`, animations: 'disabled' });
});
