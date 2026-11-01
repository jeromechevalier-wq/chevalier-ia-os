// 7 (01/11/2026) : le texte de la mention de TVA réduite est figé sur un devis finalisé ; un brouillon suit les réglages.
// Document A4 chargé directement dans le navigateur de test (comme devis-document.spec.js) : pas d'application, pas d'émulateur. Format A4 seulement (pas de téléphone).
// Captures : tests/e2e/captures/devis-tva-reduite-figee/.
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

const DOSSIER = fileURLToPath(new URL('./captures/devis-tva-reduite-figee/', import.meta.url));
const ESSAI = fileURLToPath(new URL('./devis-tva-reduite-figee-essai.mjs', import.meta.url));
const fabriquer = (mode) => JSON.parse(execFileSync(process.execPath, [ESSAI, mode], { encoding: 'utf8', maxBuffer: 10_000_000 })).html;

test('7 un devis finalisé imprime le texte figé après changement du réglage (capture)', { tag: '@sans-telephone' }, async ({ page }) => {
  mkdirSync(DOSSIER, { recursive: true });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.setContent(fabriquer('finalise'), { waitUntil: 'load' });
  await expect(page.getByText('TEXTE DU JOUR DE LA FINALISATION')).toBeVisible();
  await expect(page.getByText('TEXTE MODIFIÉ APRÈS COUP')).toHaveCount(0);
  await page.getByText('TEXTE DU JOUR DE LA FINALISATION').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DOSSIER}7-finalise-texte-fige.png`, fullPage: true, animations: 'disabled' });
});

test('7 un brouillon (aperçu vivant) imprime le texte actuel du réglage (capture)', { tag: '@sans-telephone' }, async ({ page }) => {
  mkdirSync(DOSSIER, { recursive: true });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.setContent(fabriquer('brouillon'), { waitUntil: 'load' });
  await expect(page.getByText('TEXTE MODIFIÉ APRÈS COUP')).toBeVisible();
  await expect(page.getByText('TEXTE DU JOUR DE LA FINALISATION')).toHaveCount(0);
  await page.screenshot({ path: `${DOSSIER}7-brouillon-texte-vivant.png`, fullPage: true, animations: 'disabled' });
});
