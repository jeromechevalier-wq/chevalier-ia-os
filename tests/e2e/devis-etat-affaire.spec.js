// État des devis sur la fiche d'affaire (onglet, origine du montant) et sur le Kanban, devis archivés compris. Un test par critère (le nom commence par le numéro).
// Captures dans tests/e2e/captures/devis-etat-affaire/ (ordinateur ET téléphone). Le script de Google est simulé : apis.google.com est injoignable dans le bac à sable.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-etat-affaire/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled', fullPage: true });
}
const IL_Y_A = (jours) => new Date(Date.now() - jours * 86400000);
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 1, unite: 'u', prixAchat: 60, prixVente: 100, tauxTva: 20 }];

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const FINALISE = { numero: 'DEV-2026-10-26-004', statut: 'en_attente_envoi', finaliseLe: IL_Y_A(5), dateEmission: '2026-10-26', totaux: { ht: 100, ttc: 120 } };
const DETAIL_UN = [{ numero: 'DEV-2026-10-26-004', version: 1, ht: 100, compte: true }];

async function donneesArchive(extra = {}) {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', montantDevisHt: 100, montantDevisNature: 'propose', montantDevisDetail: DETAIL_UN, ...extra });
  await devis('dArchive', { ...FINALISE, archive: true, creeLe: IL_Y_A(6) });
}
async function ouvrirAffaire(page) {
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirOnglet(page) {
  const onglet = page.locator('.compositeur [data-onglet="devis"]');
  await expect(onglet).toBeVisible();
  if ((await onglet.getAttribute('aria-selected')) !== 'true') await onglet.click();
  const panneau = page.locator('.compositeur [role="tabpanel"][aria-label="Devis"]');
  await expect(panneau).toBeVisible();
  return panneau;
}
const compteur = (page) => page.locator('.compositeur [data-onglet="devis"] .compteur');
const origine = (page) => page.locator('.fiche-tete [data-role="origine-montant"]');
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 un devis archivé qui compte dans le montant apparaît dans l’onglet Devis avec sa pastille de statut et l’étiquette « Archivé » ; le compteur vaut 1', async ({ page }, info) => {
  await donneesArchive();
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(compteur(page)).toHaveText('1');
  const ligne = panneau.locator('li[data-devis="dArchive"]');
  await expect(ligne).toHaveAttribute('data-archive', 'oui');
  await expect(ligne.locator('[data-valeur="statut"]')).toHaveText('Finalisé');
  await expect(ligne.locator('[data-valeur="archive"]')).toHaveText('Archivé');
  await expect(ligne.locator('[data-action="supprimer-devis"]')).toHaveCount(0);
  await capturer(page, info, '1-archive-dans-onglet');
});

test('2 chaque devis de l’onglet porte sa pastille d’état avec les mots de la liste des devis', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('d1', { creeLe: IL_Y_A(1) });
  await devis('d2', { ...FINALISE, numero: 'DEV-2026-10-26-002', creeLe: IL_Y_A(2) });
  await devis('d3', { ...FINALISE, numero: 'DEV-2026-10-26-003', statut: 'envoye', envoyeLe: IL_Y_A(3), creeLe: IL_Y_A(3) });
  await devis('d4', { ...FINALISE, numero: 'DEV-2026-10-26-005', statut: 'accepte', archive: true, creeLe: IL_Y_A(4) });
  await devis('d5', { ...FINALISE, numero: 'DEV-2026-10-26-006', statut: 'refuse', creeLe: IL_Y_A(5) });
  await devis('d6', { ...FINALISE, numero: 'DEV-2026-10-26-007', statut: 'remplace', creeLe: IL_Y_A(6) });
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(compteur(page)).toHaveText('6');
  const statut = (id) => panneau.locator(`li[data-devis="${id}"] [data-valeur="statut"]`);
  await expect(statut('d1')).toHaveText('Brouillon');
  await expect(statut('d2')).toHaveText('Finalisé');
  await expect(statut('d3')).toHaveText('Envoyé');
  await expect(statut('d4')).toHaveText('Devis signé');
  await expect(panneau.locator('li[data-devis="d4"] [data-valeur="archive"]')).toHaveText('Archivé');
  await expect(statut('d5')).toHaveText('Devis refusé');
  await expect(statut('d6')).toHaveText('Devis remplacé');
  await expect(panneau.locator('[data-valeur="archive"]')).toHaveCount(1); // « Archivé » ne remplace jamais une pastille et n'est posé que sur l'archivé
  await capturer(page, info, '2-pastilles-statuts');
});

test('3 sous le montant de la fiche, l’origine du chiffre : « Devis DEV-2026-10-26-004, finalisé, archivé »', async ({ page }, info) => {
  await donneesArchive();
  await ouvrirAffaire(page);
  await expect(origine(page)).toHaveText('Devis DEV-2026-10-26-004, finalisé, archivé');
  await expect(page.locator('.fiche-tete .fiche-montant-valeur')).toContainText('100');
  await capturer(page, info, '3-origine-montant');
});

test('3b plusieurs devis signés : « Devis signés : DEV-… + DEV-… v2 » ; montant estimé : aucune ligne d’origine', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', montantDevisHt: 200, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-2026-10-26-004', version: 1, ht: 100, compte: true }, { numero: 'DEV-2026-10-26-009', version: 2, ht: 100, compte: true }] });
  await creerAffaire('a2', { titre: 'Autre chantier', organisationId: 'o1', montant: 100 });
  await devis('d1', { ...FINALISE, statut: 'accepte', creeLe: IL_Y_A(3) });
  await devis('d2', { ...FINALISE, numero: 'DEV-2026-10-26-009', version: 2, statut: 'accepte', creeLe: IL_Y_A(2) });
  await ouvrirAffaire(page);
  await expect(origine(page)).toHaveText('Devis signés : DEV-2026-10-26-004 + DEV-2026-10-26-009 v2');
  await capturer(page, info, '3b-plusieurs-signes');
  await page.evaluate(() => { location.hash = '#/crm/affaires/a2'; });
  await expect(page.locator('.fiche-tete .fiche-montant')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('[data-role="origine-montant"]')).toHaveCount(0);
  await capturer(page, info, '3b-estime-sans-origine');
});

test('4 la carte du Kanban montre « Devis : Finalisé (archivé) » et la pastille ouvre le devis ; la fiche montre la même pastille', async ({ page }, info) => {
  await donneesArchive();
  await connecter(page, undefined, { route: 'crm/affaires' });
  await attendreCalme(page);
  const pastille = page.locator('.carte-affaire[data-affaire="a1"] .pastille-externe[data-archive="oui"]');
  await expect(pastille).toHaveText('Devis : Finalisé (archivé)');
  await expect(pastille).toHaveAttribute('href', /#\/devis\/voir\/dArchive$/);
  if (estTelephone(page)) expect(await sansDebordement(page)).toBe(true);
  await capturer(page, info, '4-carte-kanban');
  await page.locator('.carte-affaire[data-affaire="a1"]').click({ position: { x: 12, y: 8 } });
  await expect(page.locator('.fiche-tete .pastille-externe')).toHaveText('Devis : Finalisé (archivé)');
  if (estTelephone(page)) expect(await sansDebordement(page)).toBe(true);
  await capturer(page, info, '4-fiche-pastille');
  await page.locator('.fiche-tete .pastille-externe').click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dArchive$/);
});

test('5 archiver puis désarchiver ne change ni le montant ni la ligne d’origine ; l’onglet et la pastille se mettent à jour sans recharger', async ({ page }, info) => {
  await donneesArchive();
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  const montant = page.locator('.fiche-tete .fiche-montant-valeur');
  await expect(montant).toContainText('100');
  await expect(panneau.locator('li[data-devis="dArchive"]')).toHaveAttribute('data-archive', 'oui');
  await expect(page.locator('.fiche-tete .pastille-externe')).toHaveText('Devis : Finalisé (archivé)');
  await ecrireDocument('devis_devis/dArchive', { ...(await lireDocument('devis_devis/dArchive')), archive: false });
  await expect(panneau.locator('li[data-devis="dArchive"]')).toHaveAttribute('data-archive', 'non');
  await expect(panneau.locator('li[data-devis="dArchive"] [data-valeur="archive"]')).toHaveCount(0);
  await expect(page.locator('.fiche-tete .pastille-externe')).toHaveText('Devis : Finalisé');
  await expect(origine(page)).toHaveText('Devis DEV-2026-10-26-004, finalisé');
  await expect(montant).toContainText('100');
  await expect(compteur(page)).toHaveText('1');
  await capturer(page, info, '5-desarchive');
  await ecrireDocument('devis_devis/dArchive', { ...(await lireDocument('devis_devis/dArchive')), archive: true });
  await expect(panneau.locator('li[data-devis="dArchive"]')).toHaveAttribute('data-archive', 'oui');
  await expect(origine(page)).toHaveText('Devis DEV-2026-10-26-004, finalisé, archivé');
  await expect(montant).toContainText('100');
  await capturer(page, info, '5-archive-de-nouveau');
});

test('6 cas vide : sans devis, « Aucun devis pour cette affaire. », compteur 0, aucune pastille ni ligne d’origine', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-role="aucun-devis"]')).toHaveText('Aucun devis pour cette affaire.');
  await expect(compteur(page)).toHaveText('0');
  await expect(page.locator('.fiche-tete .pastille-externe')).toHaveCount(0);
  await expect(origine(page)).toHaveCount(0);
  await capturer(page, info, '6-vide');
});

test('6b module Devis prêt mais détail absent : « D’après les devis »', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', montantDevisHt: 100, montantDevisNature: 'propose' });
  await devis('d1', FINALISE);
  await ouvrirAffaire(page);
  await expect(origine(page)).toHaveText('D’après les devis');
  await capturer(page, info, '6b-detail-absent');
});

test('6c erreur de lecture : message dans l’onglet et repli du mot d’état (« proposé ») sous le montant', async ({ page }, info) => {
  await donneesArchive();
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await page.evaluate(async () => {
    const D = await import('/js/modules/devis/donnees.js');
    const { signaler } = await import('/js/modules/crm/pastilles-externes.js');
    D.etat.devisPrets = false; D.etat.erreurLectureDevis = true; signaler();
  });
  await expect(panneau.locator('[data-erreur="lecture-devis"]')).toHaveText('Les devis n’ont pas pu être chargés. Recharge la page.');
  await expect(origine(page)).toHaveText('Devis DEV-2026-10-26-004, proposé');
  await capturer(page, info, '6c-erreur-lecture');
});
