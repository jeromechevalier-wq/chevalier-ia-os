// Pages allégées (N6, N7) : le kanban des Affaires perd les colonnes « Perdues » et « En pause » (la pause elle-même est supprimée le 22/10/2026) ; quatre pages perdent leur surtitre gris.
// Les captures vont dans tests/e2e/captures/pages-allegees/ (aucune donnée réelle).
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerAffaire, creerPersonne, creerOrganisation, creerProjet, estTelephone } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/pages-allegees/', import.meta.url));
async function capturer(page, info, nom) { await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true }); }
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('N6 : le kanban n’a plus de colonnes Perdues ni En pause, la Liste montre les perdues ; une ancienne affaire en pause reste visible comme ouverte', async ({ page }, info) => {
  test.skip(estTelephone(page), 'Le kanban se vérifie sur ordinateur.');
  await creerAffaire('a1', { titre: 'Affaire ouverte', etape: 'rdv_fixe' });
  await creerAffaire('a2', { titre: 'Affaire perdue', etape: 'rdv_fixe', statut: 'perdue', raisonPerdue: 'Prix' });
  await creerAffaire('a3', { titre: 'Ancienne affaire en pause', etape: 'rdv_fixe', statut: 'en_pause', dateReveil: '2027-01-15' });
  await connecter(page);
  await aller(page, '#/crm/affaires');
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page.locator('.carte-affaire[data-affaire="a1"]')).toBeVisible();
  // plus de colonne de sortie, ni de zone de dépôt, ni de carte perdue ; l'ancienne affaire en pause (donnée ancienne tolérée) est une carte ouverte
  await expect(page.locator('.colonne[data-colonne="perdue"], .colonne[data-colonne="en_pause"], .kanban-sorties')).toHaveCount(0);
  await expect(page.locator('.colonne h2', { hasText: /^(Perdues|En pause)$/ })).toHaveCount(0);
  await expect(page.locator('.carte-affaire[data-affaire="a2"]')).toHaveCount(0);
  await expect(page.locator('.carte-affaire[data-affaire="a3"]')).toBeVisible();
  // le compteur ne compte que les affaires vivantes (a1 et l'ancienne a3)
  await expect(page.locator('.compteur-liste')).toHaveText('2 affaires');
  await capturer(page, info, 'N6-kanban');
  // la vue Liste les montre, avec leur statut
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr.ligne-liste[data-id="a2"]')).toBeVisible();
  await expect(page.locator('tr.ligne-liste[data-id="a3"]')).toBeVisible();
  await expect(page.locator('tr.ligne-liste[data-id="a2"]')).toContainText('Perdue');
  await expect(page.locator('tr.ligne-liste[data-id="a3"]')).not.toContainText('En pause');
  await expect(page.locator('tr.ligne-liste[data-id="a3"]')).toContainText(((await page.locator('tr.ligne-liste[data-id="a1"] td[data-libelle="Étape"]').textContent()) || '').trim());
});

test('N6 : cas vide du kanban inchangé', async ({ page }) => {
  test.skip(estTelephone(page), 'Le kanban se vérifie sur ordinateur.');
  await connecter(page);
  await aller(page, '#/crm/affaires');
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page.locator('.zone-affaires')).toContainText('Ajoute ta première affaire');
});

test('N7 : ces quatre pages n’ont plus de surtitre, les trois autres le gardent', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerOrganisation('o1', { nom: 'Fleurs SARL' });
  await creerAffaire('a1', { titre: 'Une affaire' });
  await creerProjet('pr1', { titre: 'Un projet' });
  await connecter(page);
  const quatre = [['#/crm/personnes', 'Personnes'], ['#/crm/organisations', 'Organisations'], ['#/crm/affaires', 'Affaires'], ['#/projets/projets', 'Projets']];
  for (const [hash, titre] of quatre) {
    await aller(page, hash);
    const tete = page.locator('.page-tete').first();
    await expect(tete.locator('h1')).toHaveText(titre);
    await expect(tete.locator('.etiquette')).toHaveCount(0);
    // le titre commence tout en haut de l'en-tête (pas de trou laissé par le surtitre) et le bouton « + … » est toujours là
    const boiteTitre = await tete.locator('h1').boundingBox();
    const boiteEntete = await tete.boundingBox();
    await expect(tete.locator('.page-actions .bouton-principal')).toBeVisible();
    expect(boiteTitre.y - boiteEntete.y).toBeLessThan(8);
    if (titre === 'Personnes') await capturer(page, info, 'N7-personnes');
  }
  // les trois autres gardent leur surtitre
  await aller(page, '#/crm/accueil');
  await expect(page.locator('.page-tete .etiquette').first()).toBeVisible();
  await aller(page, '#/crm/journal');
  await expect(page.locator('.page-tete .etiquette')).toHaveText('Lecture seule');
  await aller(page, '#/projets/modeles');
  await expect(page.locator('.page-tete .etiquette')).toHaveText('Réglages');
});
