// « Marge » : un seul vocabulaire, un seul mode de calcul (décisions de Jérôme, 29 et 30/10/2026). Un test par point du brief (le nom commence par le numéro du point), une capture par point.
// Captures dans tests/e2e/captures/devis-marge-vocabulaire/ (ordinateur ET téléphone). Données fictives. Le point 3 (assistant) et le point 6 (« hors taxes ») sont couverts par tests/devis-marge-vocabulaire.test.js.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import {
  test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument, listerDocuments, creerOrganisation, creerAffaire, estTelephone, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-marge-vocabulaire/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide.
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

async function semer() {
  await creerOrganisation('o1', { nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
}
/** Une ligne SANS marge propre (elle suit la marge du devis) ; `extra.marge` lui en donne une. */
const ligne = (id, libelle, prixAchat, extra = {}) => ({ id, libelle, quantite: 1, unite: 'u', prixAchat, ...extra });
async function devis(id, sections, extra = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant', sections,
    adresses: { commanditaire: { texte: '12 rue des Lilas\n75000 Paris' }, facturation: { texte: '12 rue des Lilas\n75000 Paris' }, chantier: { texte: '12 rue des Lilas\n75000 Paris' } },
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...extra,
  });
  return id;
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const lireDevis = async (id) => (await listerDocuments('devis_devis')).find((d) => d.racineId === id);

test('1 le bouton de l’éditeur s’appelle « Marge et ajustement », et la ligne dit « Marge de ce produit »', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d1', [{ id: 's1', titre: 'Travaux', lignes: [ligne('l1', 'Carrelage', 100)] }], { affichage: { afficherMarges: true } }));
  await expect(page.locator('[data-action="definir-ajustement"]')).toHaveText('Marge et ajustement');
  await expect(page.getByText('Définir un ajustement')).toHaveCount(0);
  await expect(page.locator('[data-calcul-marge="l1"]')).toContainText('Marge de ce produit 25 %');
  await capturer(page, info, '1-bouton-marge-et-ajustement');
});

test('2 Réglages > Devis : « Calcul artisan » et « Calcul comptable » avec leur exemple chiffré, « Marge de revente », « Marge par défaut des nouveaux devis »', async ({ page }, info) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await attendreCalme(page);
  const mode = page.locator('#devis-modeMarge');
  await expect(mode.locator('option')).toHaveText([
    'Calcul artisan : majoration sur le prix d’achat (achat 100 €, 25 % → vente 125 €)',
    'Calcul comptable : marge sur le prix de vente (achat 100 €, 25 % → vente 133,33 €)',
  ]);
  await expect(mode).toHaveValue('majoration'); // le calcul artisan est le défaut
  await expect(page.locator('label[for="devis-marge"]')).toContainText('Marge de revente (%)');
  await expect(page.locator('label[for="devis-margeDevis"]')).toContainText('Marge par défaut des nouveaux devis (%)');
  await expect(page.locator('#reglages-devis')).not.toContainText('Mode de marge par défaut');
  await expect(page.locator('#reglages-devis')).not.toContainText('Marge globale');
  await capturer(page, info, '2-reglages-calcul-artisan-comptable');
});

test('4 le calcul des marges est affiché sur les lignes d’un devis neuf, sans clic', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d4', [{ id: 's1', titre: 'Travaux', lignes: [ligne('l1', 'Carrelage', 100)] }], { affichage: { afficherMarges: true } }));
  await expect(page.locator('.page-editeur-devis')).toHaveAttribute('data-marges', 'oui');
  await expect(page.locator('[data-calcul-marge="l1"]')).toBeVisible();
  await capturer(page, info, '4-marges-affichees-par-defaut');
});

test('5 les lignes qui ont leur propre marge sont comptées, « Appliquer à toutes les lignes » demande confirmation puis les remet à la marge du devis', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d5', [{ id: 's1', titre: 'Travaux', lignes: [ligne('l1', 'Carrelage', 100), ligne('l2', 'Plinthe', 100, { marge: 40 }), ligne('l3', 'Joint', 100, { marge: 25 })] }], { affichage: { afficherMarges: true } }));
  await page.locator('[data-action="definir-ajustement"]').click();
  const fenetre = page.locator('.menu-devis-ajustement');
  await expect(fenetre.locator('[data-zone="marges-propres"]')).toHaveText('1 ligne a sa propre marge : la marge du devis ne la touche pas.');
  await capturer(page, info, '5-lignes-a-marge-propre');
  await fenetre.locator('[data-action="appliquer-marge-lignes"]').click();
  const confirmation = page.getByRole('dialog', { name: 'Appliquer la marge du devis ?' });
  await expect(confirmation).toContainText('1 ligne va passer à la marge du devis (25 %)');
  await confirmation.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirmation).toHaveCount(0);
  expect((await lireDevis('d5')).sections[0].lignes[1].marge).toBe(40); // annuler ne change rien
  // La fenêtre « Marge et ajustement » se rouvre toute seule après la confirmation, avec le compte à jour.
  const rouverte = page.locator('.menu-devis-ajustement');
  await expect(rouverte.locator('[data-zone="marges-propres"]')).toBeVisible();
  await rouverte.locator('[data-action="appliquer-marge-lignes"]').click();
  await page.getByRole('dialog', { name: 'Appliquer la marge du devis ?' }).getByRole('button', { name: 'Appliquer' }).click();
  await expect(rouverte.locator('[data-zone="marge-devis"]')).toBeVisible();
  await expect(rouverte.locator('[data-zone="marges-propres"]')).toBeHidden(); // cas vide : plus de ligne concernée, plus de bouton
  await expect(rouverte.locator('[data-action="appliquer-marge-lignes"]')).toBeHidden();
  await expect.poll(async () => (await lireDevis('d5')).sections[0].lignes[1].marge ?? null).toBe(null);
  const apres = await lireDevis('d5');
  expect(apres.sections[0].lignes.map((l) => l.libelle)).toEqual(['Carrelage', 'Plinthe', 'Joint']); // aucune ligne supprimée
  expect(apres.sections[0].lignes.map((l) => l.prixAchat)).toEqual([100, 100, 100]);
  await capturer(page, info, '5-marge-appliquee-a-toutes-les-lignes');
});

test('5 (cas vide) aucune ligne n’a sa propre marge : ni phrase, ni bouton', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d5v', [{ id: 's1', titre: 'Travaux', lignes: [ligne('l1', 'Carrelage', 100), ligne('l2', 'Joint', 100, { marge: 25 })] }]));
  await page.locator('[data-action="definir-ajustement"]').click();
  const fenetre = page.locator('.menu-devis-ajustement');
  await expect(fenetre.locator('[data-zone="marge-devis"]')).toBeVisible();
  await expect(fenetre.locator('[data-zone="marges-propres"]')).toBeHidden();
  await expect(fenetre.locator('[data-action="appliquer-marge-lignes"]')).toBeHidden();
  if (estTelephone(page)) await expect(fenetre).toBeVisible();
  await capturer(page, info, '5-cas-vide-aucune-marge-propre');
});
