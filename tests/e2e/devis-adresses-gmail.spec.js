// Saisie des adresses « comme dans Gmail » (04/11/2026) dans la fenêtre « Préparer l'e-mail » : ligne « À » en puces, lien « Cc », pièce jointe en puce,
// bouton « Préparer le brouillon Gmail » en bas à GAUCHE, message de limite du serveur en gris (pas en rouge). Le serveur est SIMULÉ.
// Les blocs de l'éditeur du devis (même composant) sont vérifiés dans devis-editeur.spec.js (C1 à C5, COP1 à COP10). Le nom d'un test commence par le numéro du point du brief.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerPersonne, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-adresses-gmail/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const LIMITE = 'Une préparation est déjà en cours pour ce devis : patiente quelques instants (3 minutes au plus), puis réessaie.';
const boite = (page) => page.locator('.dialogue-preparer-email');
const confirmer = (page) => boite(page).locator('[data-action="confirmer-preparer-email"]');
const champA = (page) => boite(page).locator('[data-champ="destinataire-preparer-email"]');
const champCc = (page) => boite(page).locator('[data-champ="copie-preparer-email"]');
const puces = (page, zone) => boite(page).locator(`[data-zone="${zone}-preparer-email"] [data-adresse]`);
const lienCc = (page) => boite(page).locator('[data-action="ajouter-copie-preparer-email"]');

async function semer(id, valeurs = {}) {
  const maintenant = new Date();
  await creerPersonne('p1', { nom: 'Marie Durand', emails: [{ valeur: 'marie@exemple.fr', type: 'travail' }, { valeur: 'compta@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', personneId: 'p1' });
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: 'DEV-2026-10-25-001', statut: 'en_attente_envoi', finaliseLe: maintenant, affaireId: 'a1', personneId: 'p1', organisationId: null,
    modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31',
    objet: 'Rénovation restaurant', destinataires: ['marie@exemple.fr'], copie: [],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }] }],
    pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis DEV-2026-10-25-001 v1.pdf', tentatives: 1 },
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function simulerServeur(page, { reponses = [{ ok: true }] } = {}) {
  const etat = { appels: [] };
  await page.route('**/devisPreparerEmailEtat', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { branche: true } }) });
  });
  await page.route('**/devisPreparerEmail', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    etat.appels.push(JSON.parse(route.request().postData()).data);
    const r = reponses[Math.min(etat.appels.length - 1, reponses.length - 1)];
    if (r.erreur) return route.fulfill({ status: 412, headers: cors, body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: r.erreur } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, demandeId: 'dem_essai' } }) });
  });
  return etat;
}
async function ouvrirFenetre(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="envoyer"]:visible').first().click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Préparer l’e-mail' }).click();
  await expect(boite(page)).toBeVisible();
}

test('1 saisie : Entrée, virgule, espace et perte de focus font une puce ; Retour arrière sur le champ vide retire la dernière ; la croix retire celle qu’on vise', async ({ page }, info) => {
  await semer('dSaisie', { destinataires: [] });
  await simulerServeur(page);
  await ouvrirFenetre(page, 'dSaisie');
  await champA(page).fill('a@exemple.fr'); await champA(page).press('Enter');
  await champA(page).fill('b@exemple.fr'); await champA(page).press(',');
  await champA(page).pressSequentially('c@exemple.fr ');
  await champA(page).fill('d@exemple.fr'); await boite(page).locator('[data-champ="objet-preparer-email"]').click(); // perte de focus
  await expect(puces(page, 'destinataires')).toHaveText(['a@exemple.fr', 'b@exemple.fr', 'c@exemple.fr', 'd@exemple.fr']);
  await expect(champA(page)).toHaveValue('');
  await champA(page).press('Backspace');
  await expect(puces(page, 'destinataires')).toHaveText(['a@exemple.fr', 'b@exemple.fr', 'c@exemple.fr']);
  await boite(page).getByRole('button', { name: 'Retirer b@exemple.fr' }).click();
  await expect(puces(page, 'destinataires')).toHaveText(['a@exemple.fr', 'c@exemple.fr']);
  await expect(champA(page)).not.toHaveAttribute('placeholder', /.+/); // pas d'exemple gris qui ressemble à une vraie adresse
  await capturer(page, info, '1-puces');
});

test('1 collage de trois adresses d’un coup : trois puces ; un collage avec une adresse mal écrite s’arrête sur elle, qui reste dans le champ', async ({ page }) => {
  await semer('dColle', { destinataires: [] });
  await simulerServeur(page);
  await ouvrirFenetre(page, 'dColle');
  await champA(page).fill('a@exemple.fr, b@exemple.fr; c@exemple.fr');
  await expect(puces(page, 'destinataires')).toHaveText(['a@exemple.fr', 'b@exemple.fr', 'c@exemple.fr']);
  await expect(champA(page)).toHaveValue('');
  await champA(page).fill('d@exemple.fr pas-une-adresse e@exemple.fr');
  await expect(puces(page, 'destinataires')).toHaveText(['a@exemple.fr', 'b@exemple.fr', 'c@exemple.fr', 'd@exemple.fr']);
  await expect(boite(page).locator('[data-erreur="destinataire-preparer-email"]')).toContainText('n’est pas valide');
  await expect(champA(page)).toHaveValue('pas-une-adresse e@exemple.fr');
});

test('1 doublon, adresse invalide et trop d’adresses : un message court sous la ligne, rien d’ajouté, rien de demandé', async ({ page }) => {
  await semer('dRefus');
  const serveur = await simulerServeur(page);
  await ouvrirFenetre(page, 'dRefus');
  await champA(page).fill('MARIE@exemple.fr'); await champA(page).press('Enter');
  await expect(boite(page).locator('[data-erreur="destinataire-preparer-email"]')).toHaveText('Cette adresse est déjà dans la liste.');
  await champA(page).fill('pas-une-adresse'); await champA(page).press('Enter');
  await expect(boite(page).locator('[data-erreur="destinataire-preparer-email"]')).toContainText('n’est pas valide');
  await champA(page).fill('');
  await lienCc(page).click();
  await champCc(page).fill(Array.from({ length: 10 }, (_, i) => `c${i}@exemple.fr`).join(' '));
  await expect(puces(page, 'copie')).toHaveCount(10);
  await expect(boite(page).locator('[data-valeur="plafond-copie-preparer-email"]')).toHaveText('10 adresses : c’est le maximum.');
  await expect(champCc(page)).toBeHidden();
  expect(serveur.appels).toEqual([]);
});

test('1 le lien « Cc » ouvre la ligne Copie (fermée tant qu’elle est vide) et disparaît ; une copie déjà remplie s’ouvre d’office', async ({ page }, info) => {
  await semer('dCc');
  await simulerServeur(page);
  await ouvrirFenetre(page, 'dCc');
  await expect(boite(page).locator('[data-zone="copie-preparer-email"]')).toBeHidden();
  await expect(lienCc(page)).toHaveText('Cc');
  await lienCc(page).click();
  await expect(boite(page).locator('[data-zone="copie-preparer-email"]')).toBeVisible();
  await expect(lienCc(page)).toBeHidden();
  await expect(champCc(page)).toBeFocused();
  await champCc(page).fill('compta@exemple.fr'); await champCc(page).press('Enter');
  await capturer(page, info, '1-cc-ouvert');
});

test('2 les e-mails de la fiche du client sont proposés (liste du navigateur), sans l’adresse déjà utilisée ; la saisie libre reste possible', async ({ page }) => {
  await semer('dSug');
  await simulerServeur(page);
  await ouvrirFenetre(page, 'dSug');
  const options = await boite(page).locator('[data-zone="destinataires-preparer-email"] datalist option').evaluateAll((os) => os.map((o) => o.value));
  expect(options).toEqual(['compta@exemple.fr']); // marie@exemple.fr est déjà une puce
});

test('3 la pièce jointe est une puce avec le nom du PDF (sans poids inventé) ; « Préparer le brouillon Gmail » est en bas à GAUCHE, avant « Annuler »', async ({ page }, info) => {
  await semer('dPj');
  await simulerServeur(page);
  await ouvrirFenetre(page, 'dPj');
  const pj = boite(page).locator('[data-zone="piece-jointe-preparer-email"]');
  await expect(pj).toHaveText('Devis DEV-2026-10-25-001 v1.pdf');
  const [bp, ba] = [await confirmer(page).boundingBox(), await boite(page).locator('[data-action="annuler-preparer-email"]').boundingBox()];
  const fenetre = await boite(page).boundingBox();
  expect(bp.x, 'le bouton principal est à gauche de « Annuler »').toBeLessThan(ba.x);
  expect(bp.x - fenetre.x, 'et il touche le bord gauche de la fenêtre (marge près)').toBeLessThan(40);
  expect(Math.abs(bp.y - ba.y)).toBeLessThan(8);
  await expect(confirmer(page)).toContainText('Préparer le brouillon Gmail');
  await capturer(page, info, '3-fenetre-gmail');
});

test('3 cas vide : sans destinataire le bouton est grisé avec « Ajoute au moins un destinataire », puis actif dès qu’une puce existe', async ({ page }, info) => {
  await semer('dVide', { destinataires: [] });
  const serveur = await simulerServeur(page);
  await ouvrirFenetre(page, 'dVide');
  await expect(confirmer(page)).toBeDisabled();
  await expect(boite(page).locator('[data-zone="aide-destinataires-preparer-email"]')).toHaveText('Ajoute au moins un destinataire');
  await capturer(page, info, '3-vide');
  await champA(page).fill('nouveau@exemple.fr'); await champA(page).press('Enter');
  await expect(confirmer(page)).toBeEnabled();
  await expect(boite(page).locator('[data-zone="aide-destinataires-preparer-email"]')).toBeHidden();
  expect(serveur.appels).toEqual([]);
});

test('4 message de limite du serveur : phrase grise avec une icône d’information (pas en rouge) ; un vrai échec reste en rouge', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 412' });
  await semer('dLimite');
  await simulerServeur(page, { reponses: [{ erreur: LIMITE }, { erreur: 'Le brouillon n’a pas pu être demandé pour une autre raison.' }] });
  await ouvrirFenetre(page, 'dLimite');
  await confirmer(page).click();
  const limite = boite(page).locator('[data-zone="limite-preparer-email"]');
  await expect(limite).toContainText(LIMITE);
  await expect(limite.locator('svg')).toBeVisible();
  await expect(boite(page).locator('[data-zone="erreur-preparer-email"]')).toBeHidden();
  const couleur = await limite.evaluate((e) => getComputedStyle(e).color);
  const rouge = await page.evaluate(() => { const p = document.createElement('p'); p.className = 'erreur'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
  expect(couleur, 'pas la couleur des erreurs').not.toBe(rouge);
  await capturer(page, info, '4-limite');
  await confirmer(page).click();
  await expect(boite(page).locator('[data-zone="erreur-preparer-email"]')).toContainText('autre raison');
  await expect(limite).toBeHidden();
});

test('5 clair ET sombre, ordinateur ET téléphone : la fenêtre tient dans l’écran sans défilement horizontal, croix et champs d’au moins 44 px au doigt', async ({ page }, info) => {
  await semer('dThemes', { copie: ['compta@exemple.fr'], destinataires: ['une-adresse-assez-longue-pour-le-telephone@exemple.fr', 'marie@exemple.fr'] });
  await simulerServeur(page);
  await ouvrirFenetre(page, 'dThemes');
  await expect(boite(page).locator('[data-zone="copie-preparer-email"]')).toBeVisible(); // une copie déjà remplie ouvre la ligne Cc d'office
  for (const schema of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: schema });
    await expect.poll(async () => page.evaluate(() => { const b = document.querySelector('.dialogue-preparer-email'); return b.scrollWidth <= b.clientWidth; })).toBe(true);
    if (info.project.name === 'telephone') {
      for (const c of [champA(page), boite(page).locator('[data-action="retirer-destinataire-preparer-email"]').first(), boite(page).locator('[data-action="retirer-copie-preparer-email"]').first()]) {
        expect((await c.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
    await capturer(page, info, `5-fenetre-${schema === 'dark' ? 'sombre' : 'clair'}`);
  }
});
