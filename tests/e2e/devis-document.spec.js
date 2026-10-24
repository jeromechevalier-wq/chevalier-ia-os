// Document HTML du devis (A4) : capture et PDF d'un devis d'essai (3 sections, 8 lignes, deux taux de TVA, une description sur plusieurs lignes).
// Page statique chargée directement dans le navigateur de test : pas d'application, pas d'émulateur. Format A4 seulement (pas de téléphone).
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

const DOSSIER = fileURLToPath(new URL('./captures/document/', import.meta.url));
const ESSAI = fileURLToPath(new URL('./devis-document-essai.mjs', import.meta.url));

/** Le HTML est fabriqué par un processus Node à part (les modules du dépôt ne se chargent pas dans le chargeur de Playwright). */
function fabriquer() {
  return JSON.parse(execFileSync(process.execPath, [ESSAI], { encoding: 'utf8', maxBuffer: 10_000_000 }));
}

test('H8 capture A4 du devis d\'essai, et un PDF de 2 pages au plus avec « Net à payer »', async ({ page }) => {
  mkdirSync(DOSSIER, { recursive: true });
  const { html, lignes } = fabriquer();
  expect(lignes).toBe(8);
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 à 96 dpi
  await page.setContent(html, { waitUntil: 'load' });
  await expect(page.getByText('Net à payer')).toBeVisible();
  await page.screenshot({ path: `${DOSSIER}H8-devis-a4.png`, fullPage: true, animations: 'disabled' });

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  // Le nombre de pages se lit dans les objets /Type /Page du PDF (hors /Pages).
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(1);
  expect(pages).toBeLessThanOrEqual(2);
  // Le texte du PDF est compressé : on contrôle « Net à payer » dans la page rendue en média d'impression, avec le même HTML.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Net à payer')).toBeVisible();
  writeFileSync(`${DOSSIER}H8-devis-a4.pdf.txt`, `pages : ${pages}\n`);
});
