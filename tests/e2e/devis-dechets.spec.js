// Module Devis, éditeur : bloc « Gestion des déchets » (formulaire Définir / Modifier). Information imprimée sur le devis, sans effet sur le prix.
// Un test par point (le nom commence par le numéro), une capture par état : tests/e2e/captures/devis-dechets/ (ordinateur ET téléphone : la mise en page change).
//  1 cas vide : « Aucune information sur les déchets » + « Définir » ;
//  2 le formulaire a les champs décidés (type en liste de 4 + vide, point de collecte, min / max en m³, coût € TTC par m³) ; Enregistrer grisé tant que rien n'a changé, jaune dès la première modification ;
//  3 enregistrer : mêmes phrases que le PDF, écrit dans la base, « Modifier » recharge les valeurs, le total du devis ne bouge pas, la Prévisualisation montre les phrases ;
//  4 erreurs : minimum > maximum, nombre illisible, coût négatif → message sous le champ, rien d'enregistré ;
//  5 Annuler (et Échap) abandonnent la saisie ; 6 tout vider puis Enregistrer efface les déchets (retour au cas vide) ;
//  7 devis finalisé : les phrases restent, les boutons sont grisés et un clic dit pourquoi ; 8 pas de débordement, champs de 16 px, cibles de 44 px sur téléphone.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-dechets/', import.meta.url));
async function capturer(page, info, nom) {
  await page.locator('[data-zone="dechets"]').evaluate((el) => el.scrollIntoView({ block: 'start' })); // en haut : la barre « NET À PAYER » collée en bas ne cache pas le formulaire
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const bloc = (page) => page.locator('[data-zone="dechets"]');
const total = (page, cle) => page.locator(`[data-total="${cle}"]`);
const champ = (page, cle) => bloc(page).locator(`[data-champ="dechets-${cle}"]`);
const enregistrer = (page) => bloc(page).locator('[data-action="enregistrer-dechets"]');
const erreur = (page, cle) => bloc(page).locator(`[data-erreur="dechets-${cle}"]`);

async function devis(id, extra = {}) {
  await creerOrganisation('o1', { nom: 'Société Exemple', emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant',
    sections: [{ id: 's1', titre: 'Salle', lignes: [{ id: 'l1', libelle: 'Dépose', quantite: 10, unite: 'm²', prixAchat: 50, marge: 0 }] }],
    notesBasDePage: '', creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...extra,
  });
  return id;
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const sauve = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const REMPLI = { types: ['inertes'], pointCollecte: 'Déchèterie de Pantin', volumeMin: 5, volumeMax: 10, unite: 'm3', coutTtcParM3: 85 };

test('1 cas vide : le bloc dit « Aucune information sur les déchets » et propose « Définir »', async ({ page }, info) => {
  await ouvrir(page, await devis('d1'));
  await expect(bloc(page).getByRole('heading', { name: 'Gestion des déchets' })).toBeVisible();
  await expect(bloc(page).locator('[data-vide="dechets"]')).toHaveText('Aucune information sur les déchets');
  await expect(bloc(page).locator('[data-action="definir-dechets"]')).toHaveText('Définir');
  await expect(bloc(page).locator('[data-action="definir-dechets"]')).toBeEnabled();
  await capturer(page, info, '1-vide');
});

test('2 le formulaire a les champs décidés ; Enregistrer est grisé tant que rien n’a changé et jaune dès la première modification', async ({ page }, info) => {
  await ouvrir(page, await devis('d2'));
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toBeVisible();
  await expect(champ(page, 'type').locator('option')).toHaveText(['Aucun type choisi', 'Déchets inertes', 'Déchets non dangereux et non inertes', 'Déchets dangereux', 'Déchets spécifiques']);
  for (const nom of ['Type de déchets', 'Point de collecte', 'Volume minimum (m³)', 'Volume maximum (m³)', 'Coût associé (€ TTC par m³)']) await expect(bloc(page).getByLabel(nom)).toBeVisible();
  if (!estTelephone(page)) await expect(champ(page, 'type')).toBeFocused(); // ordinateur : premier champ
  await expect(enregistrer(page)).toBeDisabled();
  await expect(enregistrer(page)).not.toHaveClass(/bouton-principal/);
  await expect(bloc(page).locator('[data-action="annuler-dechets"]')).toHaveClass(/bouton-secondaire/);
  await capturer(page, info, '2-formulaire-vide');
  await champ(page, 'point').fill('Benne devant le chantier');
  await expect(enregistrer(page)).toBeEnabled();
  await expect(enregistrer(page)).toHaveClass(/bouton-principal/);
  await champ(page, 'point').fill('');
  await expect(enregistrer(page)).toBeDisabled(); // revenu à l'état de départ : grisé de nouveau
  await champ(page, 'type').selectOption('inertes');
  await champ(page, 'point').fill('Déchèterie de Pantin');
  await champ(page, 'min').fill('5');
  await champ(page, 'max').fill('10');
  await champ(page, 'cout').fill('85');
  await expect(enregistrer(page)).toHaveClass(/bouton-principal/);
  await capturer(page, info, '2-formulaire-rempli');
});

test('3 enregistrer : mêmes phrases que le PDF, écrit dans la base, « Modifier » recharge les valeurs, le total ne change pas, la Prévisualisation montre les phrases', async ({ page }, info) => {
  await ouvrir(page, await devis('d3'));
  const avant = await total(page, 'ttc').textContent();
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'type').selectOption('non_dangereux');
  await champ(page, 'point').fill('Déchèterie de Pantin');
  await champ(page, 'min').fill('5,5'); // la virgule française est acceptée
  await champ(page, 'max').fill('10');
  await champ(page, 'cout').fill('85,50');
  await enregistrer(page).click();
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toHaveCount(0);
  const phrases = bloc(page).locator('[data-dechets-ligne]');
  await expect(phrases).toHaveCount(4);
  await expect(phrases.nth(0)).toHaveText('Type de déchets collectés : Déchets non dangereux et non inertes');
  await expect(phrases.nth(1)).toHaveText('Point de collecte : Déchèterie de Pantin');
  await expect(phrases.nth(2)).toHaveText(/Volume estimé entre 5,5 et 10 m³/);
  await expect(phrases.nth(3)).toHaveText(/Coûts associés de 85,50.+TTC par m³/);
  await expect(bloc(page).locator('[data-action="definir-dechets"]')).toHaveText('Modifier');
  await expect(total(page, 'ttc')).toHaveText(avant ?? ''); // aucun impact sur le prix
  await sauve(page);
  const doc = await lireDocument('devis_devis/d3');
  expect(doc.dechets).toEqual({ types: ['non_dangereux'], pointCollecte: 'Déchèterie de Pantin', volumeMin: 5.5, volumeMax: 10, unite: 'm3', coutTtcParM3: 85.5 });
  await capturer(page, info, '3-affiche');
  // « Modifier » recharge les valeurs enregistrées ; Enregistrer est grisé tant qu'on n'y touche pas.
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await expect(champ(page, 'type')).toHaveValue('non_dangereux');
  await expect(champ(page, 'point')).toHaveValue('Déchèterie de Pantin');
  await expect(champ(page, 'min')).toHaveValue('5,5');
  await expect(champ(page, 'max')).toHaveValue('10');
  await expect(champ(page, 'cout')).toHaveValue('85,50');
  await expect(enregistrer(page)).toBeDisabled();
  await capturer(page, info, '3-modifier');
  await bloc(page).locator('[data-action="annuler-dechets"]').click();
  // La Prévisualisation (même document que le PDF) montre le bloc.
  await page.locator('.barre-devis [data-onglet="apercu"]').click();
  const apercu = page.frameLocator('iframe[data-zone="apercu"]');
  await expect(apercu.locator('.dechets h2')).toHaveText('Gestion des déchets');
  await expect(apercu.locator('.dechets')).toContainText('Point de collecte : Déchèterie de Pantin');
  await expect(apercu.locator('.dechets')).toContainText('Volume estimé entre 5,5 et 10 m³');
  await page.screenshot({ path: `${DOSSIER}3-apercu-${info.project.name}.png`, animations: 'disabled' });
});

test('4 erreurs : minimum > maximum, nombre illisible, coût négatif → message sous le champ, rien n’est enregistré', async ({ page }, info) => {
  await ouvrir(page, await devis('d4'));
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'min').fill('12');
  await champ(page, 'max').fill('4');
  await enregistrer(page).click();
  await expect(erreur(page, 'max')).toContainText('égal ou supérieur au minimum');
  await expect(champ(page, 'max')).toHaveClass(/invalide/);
  await capturer(page, info, '4-erreur-min-max');
  await champ(page, 'max').fill('douze');
  await champ(page, 'cout').fill('-3');
  await enregistrer(page).click();
  await expect(erreur(page, 'max')).toContainText('écris un nombre');
  await expect(erreur(page, 'cout')).toContainText('négatif');
  await capturer(page, info, '4-erreur-nombre-cout');
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toBeVisible(); // le formulaire reste ouvert
  await page.waitForTimeout(1200); // plus que le délai d'enregistrement automatique
  expect((await lireDocument('devis_devis/d4')).dechets ?? null).toBeNull();
  // Corriger puis enregistrer marche.
  await champ(page, 'max').fill('15');
  await champ(page, 'cout').fill('0');
  await enregistrer(page).click();
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toHaveCount(0);
  await expect(bloc(page).locator('[data-dechets-ligne]').nth(0)).toContainText('Volume estimé entre 12 et 15 m³');
});

test('5 Annuler et Échap abandonnent la saisie sans rien changer', async ({ page }) => {
  await ouvrir(page, await devis('d5', { dechets: REMPLI }));
  await expect(bloc(page).locator('[data-dechets-ligne]').nth(1)).toHaveText('Point de collecte : Déchèterie de Pantin');
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'point').fill('Autre endroit');
  await bloc(page).locator('[data-action="annuler-dechets"]').click();
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toHaveCount(0);
  await expect(bloc(page).locator('[data-dechets-ligne]').nth(1)).toHaveText('Point de collecte : Déchèterie de Pantin');
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'max').fill('99');
  await champ(page, 'max').press('Escape');
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect((await lireDocument('devis_devis/d5')).dechets).toEqual(REMPLI);
});

test('6 enregistrer avec tous les champs vides efface les déchets : retour au cas vide', async ({ page }, info) => {
  await ouvrir(page, await devis('d6', { dechets: REMPLI }));
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'type').selectOption('');
  for (const cle of ['point', 'min', 'max', 'cout']) await champ(page, cle).fill('');
  await enregistrer(page).click();
  await expect(bloc(page).locator('[data-vide="dechets"]')).toHaveText('Aucune information sur les déchets');
  await expect(bloc(page).locator('[data-action="definir-dechets"]')).toHaveText('Définir');
  await sauve(page);
  expect((await lireDocument('devis_devis/d6')).dechets ?? null).toBeNull();
  await capturer(page, info, '6-efface');
});

test('7 devis finalisé : les phrases restent affichées, les boutons sont grisés et un clic dit que le devis ne se modifie plus', async ({ page }, info) => {
  await ouvrir(page, await devis('d7', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-02-001', dechets: REMPLI }));
  await expect(bloc(page).locator('[data-dechets-ligne]')).toHaveCount(4);
  const bouton = bloc(page).locator('[data-action="definir-dechets"]');
  await expect(bouton).toHaveText('Modifier');
  await expect(bouton).toHaveAttribute('aria-disabled', 'true');
  await bouton.click({ force: true }); // grisé : aria-disabled (Playwright le croit inactif, un vrai clic passe)
  await expect(page.getByText(/Ce devis est finalisé : il ne se modifie plus/).first()).toBeVisible();
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toHaveCount(0);
  await capturer(page, info, '7-finalise');
});

test('8 le formulaire tient dans l’écran : pas de défilement horizontal, champs de 16 px au moins, cibles de 44 px au moins sur téléphone', async ({ page }, info) => {
  await ouvrir(page, await devis('d8'));
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'point').fill('Une adresse de point de collecte assez longue pour tester le retour à la ligne dans le champ');
  const mesure = await page.evaluate(() => {
    const f = document.querySelector('[data-zone="dechets-formulaire"]');
    const r = f.getBoundingClientRect();
    const champs = [...f.querySelectorAll('input, select')].map((e) => ({ h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) }));
    const boutons = [...f.querySelectorAll('button')].map((e) => e.getBoundingClientRect().height);
    return { debordeHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth, droite: r.right, largeur: window.innerWidth, champs, boutons };
  });
  expect(mesure.debordeHorizontal).toBe(false);
  expect(mesure.droite).toBeLessThanOrEqual(mesure.largeur);
  if (estTelephone(page)) {
    for (const c of mesure.champs) { expect(c.h).toBeGreaterThanOrEqual(44); expect(c.fs).toBeGreaterThanOrEqual(16); }
    for (const b of mesure.boutons) expect(b).toBeGreaterThanOrEqual(44);
    await expect(champ(page, 'type')).not.toBeFocused(); // téléphone : le clavier ne s'ouvre pas tout seul
  }
  await capturer(page, info, '8-formulaire-long');
});

test('9 un devis qui a déjà plusieurs types les garde quand on change autre chose ; Entrée enregistre ; les erreurs sont reliées aux champs', async ({ page }) => {
  await ouvrir(page, await devis('d9', { dechets: { ...REMPLI, types: ['inertes', 'non_dangereux'] } }));
  await bloc(page).locator('[data-action="definir-dechets"]').click();
  await champ(page, 'point').fill('Benne devant le chantier');
  await champ(page, 'min').fill('12');
  await champ(page, 'min').press('Enter'); // 12 > 10 : refusé, message relié au champ maximum
  await expect(bloc(page).locator('[data-erreur="dechets-max"]')).toBeVisible();
  await expect(champ(page, 'max')).toHaveAttribute('aria-invalid', 'true');
  await expect(champ(page, 'max')).toHaveAttribute('aria-describedby', 'dechets-erreur-max');
  await champ(page, 'min').fill('6');
  await champ(page, 'min').press('Enter'); // Entrée enregistre
  await expect(bloc(page).locator('[data-zone="dechets-formulaire"]')).toHaveCount(0);
  await sauve(page);
  const doc = await lireDocument('devis_devis/d9');
  expect(doc.dechets.types).toEqual(['inertes', 'non_dangereux']);
  expect(doc.dechets.pointCollecte).toBe('Benne devant le chantier');
  expect(doc.dechets.volumeMin).toBe(6);
});
