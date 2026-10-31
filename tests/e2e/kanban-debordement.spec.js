// Kanban des Affaires et des Projets : rien ne déborde des cartes ni des colonnes à largeur réduite (820 px), la dernière colonne est atteignable.
// Captures : e2e/captures/kanban-debordement/. Ordinateur ET téléphone. Données fictives.
import { test, expect, estTelephone, connecter, attendreCalme, ecrireDocument, creerAffaire, creerProjet, JEROME } from './outils.js';

const JOUR = 86400000;
const CAPTURES = 'e2e/captures/kanban-debordement';
const capture = (page, nom) => page.locator('.kanban').screenshot({ path: `${CAPTURES}/${nom}-${estTelephone(page) ? 'telephone' : 'ordinateur'}.png`, animations: 'disabled' });

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: new Date(Date.now() + 60 * JOUR).toISOString().slice(0, 10),
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}

/** Mesures : aucune carte ni aucun corps de colonne ne déborde ; la dernière colonne se laisse amener entièrement dans le cadre. */
async function mesurer(page) {
  const debordements = await page.evaluate(() => {
    const trop = (el) => el.scrollWidth > el.clientWidth + 1;
    return {
      // Les éléments visibles de la carte restent dans la carte (scrollWidth ne convient pas : la zone tactile invisible de 44 px du bouton « … » le dépasse volontairement).
      cartes: [...document.querySelectorAll('.carte-affaire')].filter((c) => {
        const r = c.getBoundingClientRect();
        return [...c.querySelectorAll('*')].some((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1); });
      }).map((e) => e.getAttribute('aria-label')),
      corps: [...document.querySelectorAll('.colonne-corps')].filter(trop).length,
      pastilles: [...document.querySelectorAll('.carte-pastilles-externes .pastille-statut')].filter((p) => {
        const c = p.closest('.carte-affaire').getBoundingClientRect(); const r = p.getBoundingClientRect();
        return r.right > c.right + 1 || p.scrollWidth > p.clientWidth + 1;
      }).length,
    };
  });
  expect(debordements).toEqual({ cartes: [], corps: 0, pastilles: 0 });
  await page.evaluate(() => { const k = document.querySelector('.kanban'); k.scrollLeft = k.scrollWidth; });
  const bornes = await page.evaluate(() => {
    const k = document.querySelector('.kanban').getBoundingClientRect(); const c = [...document.querySelectorAll('.kanban > .colonne')].pop().getBoundingClientRect();
    return { gauche: Math.round(c.left - k.left), droite: Math.round(k.right - c.right) };
  });
  expect(bornes.droite).toBeGreaterThanOrEqual(0); // la dernière colonne finit dans le cadre, pas au-delà
  expect(bornes.gauche).toBeGreaterThanOrEqual(0);
}

test('D1 à largeur réduite (820 px), ni les cartes ni les colonnes des Affaires ne débordent et la dernière colonne est atteignable', async ({ page }) => {
  if (!estTelephone(page)) await page.setViewportSize({ width: 820, height: 900 });
  await creerAffaire('a1', { titre: 'Rénovation complète de la cuisine et de la salle de bain de la maison familiale', etape: 'rdv_fixe' });
  await devis('d1', { affaireId: 'a1', statut: 'envoye', numero: 'DEV-1', finaliseLe: new Date(Date.now() - 6 * JOUR), envoyeLe: new Date(Date.now() - 4 * JOUR - 3600000), creeLe: new Date(Date.now() - 7 * JOUR) });
  await creerAffaire('a2', { titre: 'Terrasse', etape: 'gagne' });
  await devis('d2', { affaireId: 'a2', statut: 'envoye', numero: 'DEV-2', finaliseLe: new Date(Date.now() - 6 * JOUR), envoyeLe: new Date(Date.now() - 4 * JOUR - 3600000), creeLe: new Date(Date.now() - 7 * JOUR) });
  await connecter(page, undefined, { route: 'crm/affaires' });
  await attendreCalme(page);
  const pastille = page.locator('.carte-affaire[data-affaire="a1"] .pastille-externe');
  await expect(pastille).toHaveText('Devis : Envoyé il y a 4 jours');
  await expect(page.locator('.carte-affaire[data-affaire="a2"] .pastille-externe')).toHaveText('Devis : Envoyé il y a 4 jours');
  await attendreCalme(page);
  await mesurer(page);
  await capture(page, '1-affaires');
});

test('D1 idem pour les Projets (même carte, même colonne)', async ({ page }) => {
  if (!estTelephone(page)) await page.setViewportSize({ width: 820, height: 900 });
  await creerProjet('p1', { titre: 'Rénovation complète de la cuisine et de la salle de bain de la maison familiale' });
  await connecter(page, undefined, { route: 'projets/projets' });
  await attendreCalme(page);
  await expect(page.locator('.carte-projet[data-projet="p1"]')).toBeVisible();
  await mesurer(page);
  await capture(page, '2-projets');
});
