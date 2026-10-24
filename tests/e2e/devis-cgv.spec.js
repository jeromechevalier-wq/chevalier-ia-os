// Conditions générales (CGV) en A4 : capture du document d'essai (type mixte). Page statique, format A4 seulement (pas de téléphone).
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

const DOSSIER = fileURLToPath(new URL('./captures/cgv/', import.meta.url));
const ESSAI = fileURLToPath(new URL('./devis-cgv-essai.mjs', import.meta.url));

test('G11 capture A4 des CGV d\'essai (type mixte) avec son titre', { tag: '@sans-telephone' }, async ({ page }) => {
  mkdirSync(DOSSIER, { recursive: true });
  const { html } = JSON.parse(execFileSync(process.execPath, [ESSAI], { encoding: 'utf8', maxBuffer: 10_000_000 }));
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 à 96 dpi
  await page.setContent(html, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conditions générales de vente et de travaux');
  await expect(page.getByText('Médiateur Test').first()).toBeVisible();
  await page.screenshot({ path: `${DOSSIER}G11-cgv-a4.png`, fullPage: true, animations: 'disabled' });
});
