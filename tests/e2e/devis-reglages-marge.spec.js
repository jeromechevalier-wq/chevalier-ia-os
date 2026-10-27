// Réglages > Devis : champs jumeaux alignés (point 14) et « Marge globale du devis » (point 13). Un test par point (le nom commence par le numéro).
// Captures dans tests/e2e/captures/devis-reglages-marge/ (ordinateur ET téléphone). Données fictives.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, lireDocument, ecrireDocument, listerDocuments, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-reglages-marge/', import.meta.url));
async function capturer(page, info, nom, cible = page) {
  await mkdir(DOSSIER, { recursive: true });
  await cible.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}

// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide.
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

async function ouvrirSection(page, section) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, section);
  await attendreCalme(page);
}

/** Pour chaque rangée de champs (`.ligne-champs`, formulaire d'ajout d'un membre), l'écart vertical le plus grand entre les libellés ET entre les champs de blocs placés côte à côte. */
function ecartsDeRangees(page) {
  return page.evaluate(() => {
    const rangees = [];
    for (const rangee of document.querySelectorAll('.ligne-champs, .mon-espace-ajout')) {
      const blocs = [...rangee.querySelectorAll(':scope > .bloc-champ')].filter((b) => b.offsetParent !== null);
      const boite = (el) => el.getBoundingClientRect();
      const champ = (b) => b.querySelector('input:not([type="hidden"]), select, textarea');
      let pire = 0; let paires = 0;
      for (let i = 0; i < blocs.length; i++) for (let j = i + 1; j < blocs.length; j++) {
        const a = boite(blocs[i]); const b = boite(blocs[j]);
        if (!(a.top < b.bottom && b.top < a.bottom)) continue; // pas sur la même rangée
        const ca = champ(blocs[i]); const cb = champ(blocs[j]);
        if (!ca || !cb) continue;
        paires++;
        pire = Math.max(pire, Math.abs(boite(ca).top - boite(cb).top));
        const la = blocs[i].querySelector('.etiquette'); const lb = blocs[j].querySelector('.etiquette');
        if (la && lb) pire = Math.max(pire, Math.abs(boite(la).top - boite(lb).top));
      }
      if (paires) rangees.push({ rangee: blocs.map((b) => b.dataset.reglage ?? champ(b)?.dataset.champ ?? champ(b)?.id ?? '?').join(' | '), ecart: Math.round(pire * 10) / 10 });
    }
    return rangees;
  });
}

for (const [section, minimum] of [['Devis', 2], ['Affaires et projets', 0], ['Mon espace', 0]]) {
  test(`14 ${section} : les champs d'une même rangée sont alignés en haut (écart d'au plus 1 px)`, async ({ page }, info) => {
    await ouvrirSection(page, section);
    const rangees = await ecartsDeRangees(page);
    console.log(`14 ${section} (${info.project.name}) :`, JSON.stringify(rangees));
    // Téléphone : les champs passent l'un sous l'autre, il n'y a presque plus de rangée à comparer.
    if (!estTelephone(page)) expect(rangees.length).toBeGreaterThanOrEqual(minimum);
    for (const r of rangees) expect(r.ecart, `rangée ${r.rangee}`).toBeLessThanOrEqual(1);
    if (section === 'Devis') await capturer(page, info, '14-reglages-devis-general', page.locator('#reglages-devis'));
  });
}

// ------------------------------------------------------------------ point 13 : marge globale du devis

const champ = (page) => page.locator('#devis-margeDevis');
const enregistrer = (page) => page.locator('[data-action="enregistrer-reglages-devis"]');

test('13a le champ « Marge globale du devis (%) » existe, vaut 20 sans réglage enregistré, s\'enregistre et se relit', async ({ page }, info) => {
  await ouvrirSection(page, 'Devis');
  await expect(page.getByText('Marge par défaut des articles (%)')).toBeVisible();
  await expect(champ(page)).toHaveValue('20'); // cas vide : réglage jamais enregistré
  expect(await lireDocument('devis_parametres/reglages')).toBeNull(); // rien n'a été écrit pour autant
  await champ(page).fill('12,5');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.margeDevis).toBe(12.5);
  await page.reload();
  await ouvrirSectionReglages(page, 'Devis');
  await expect(champ(page)).toHaveValue('12,5');
  await capturer(page, info, '13a-champ-marge-globale', page.locator('#reglages-devis'));
});

test('13f une valeur invalide (négatif, texte, trop grande) est refusée avec un message, rien n\'est écrit', async ({ page }) => {
  await ouvrirSection(page, 'Devis');
  for (const mauvaise of ['-5', 'beaucoup', '1001']) {
    await champ(page).fill(mauvaise);
    await enregistrer(page).click();
    await expect(page.locator('[data-erreur="margeDevis"]')).toContainText('pourcentage entre 0 et 1000');
  }
  expect(await lireDocument('devis_parametres/reglages')).toBeNull();
});

async function semerAffaire() {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
}
async function creerDevisParOnglet(page) {
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.compositeur [data-onglet="devis"]').click();
  await page.locator('.compositeur [role="tabpanel"][aria-label="Devis"] [data-action="ajouter-devis"]').click();
  await expect(page.locator('.page-editeur-devis')).toBeVisible();
  await attendreCalme(page);
}

test('13b un nouveau devis créé par l\'onglet Devis a 20 % de marge, visible dans Ajustement', async ({ page }, info) => {
  await semerAffaire();
  await creerDevisParOnglet(page);
  expect((await listerDocuments('devis_devis'))[0].marge).toBe(20);
  await page.locator('[data-action="definir-ajustement"]').click();
  await expect(page.locator('#ajust-marge')).toHaveValue('20');
  await capturer(page, info, '13b-ajustement-marge-20');
});

test('13c un devis existant n\'est pas modifié quand le réglage change', async ({ page }) => {
  await semerAffaire();
  await ecrireDocument('devis_devis/ancien', {
    racineId: 'ancien', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', modeMarge: 'majoration', marge: 7, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Ancien', destinataires: [], sections: [],
    creePar: JEROME, proprietaire: JEROME, creeLe: new Date(),
  });
  await ouvrirSection(page, 'Devis');
  await champ(page).fill('35');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.margeDevis).toBe(35);
  expect((await lireDocument('devis_devis/ancien')).marge).toBe(7);
});

test('13d 0 = aucune marge : le nouveau devis a une marge de 0', async ({ page }) => {
  await semerAffaire();
  await ecrireDocument('devis_parametres/reglages', { modeMarge: 'majoration', marge: 20, margeDevis: 0 });
  await creerDevisParOnglet(page);
  expect((await listerDocuments('devis_devis'))[0].marge).toBe(0);
  await page.locator('[data-action="definir-ajustement"]').click();
  await expect(page.locator('#ajust-marge')).toHaveValue('0');
});
