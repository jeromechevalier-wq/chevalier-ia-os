// I5 (21/10/2026) : le champ « description » des affaires et des projets disparaît ; à la création (écran, MCP, projet créé depuis une affaire), une note épinglée
// VIDE le remplace, avec un texte d'invitation grisé qui disparaît au clic. Les fiches déjà là ne reçoivent rien. Captures : tests/e2e/captures/description-supprimee/.
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import {
  test, expect, attendreCalme, connecter, allerA, creerAffaire, creerProjet, ecrireDocument, lireDocument, listerDocuments, estTelephone, JEROME, FIRESTORE, PROJET,
} from './outils.js';

const DOSSIER_CAPTURES = fileURLToPath(new URL('./captures/description-supprimee/', import.meta.url));
mkdirSync(DOSSIER_CAPTURES, { recursive: true });
// Une capture par critère, dans un seul format : ordinateur, sauf le critère du téléphone (7).
const capture = async (page, nom, { telephone = false } = {}) => { if (estTelephone(page) === telephone) await page.screenshot({ path: `${DOSSIER_CAPTURES}${nom}.png`, animations: 'disabled' }); };

const INVITATION_AFFAIRE = 'Cette affaire concerne… (le besoin du client, ce qu’on lui propose, où on en est)';
const INVITATION_PROJET = 'Ce projet concerne… (ce qu’on construit, pour qui, où on en est)';
const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
async function attendre(collection, predicat) {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: 10_000 }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
}
// Ce bac à sable n'a pas accès à apis.google.com : le script est remplacé par un fichier vide (sinon « erreur console » sans rapport avec I5).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const champNote = (page) => page.locator('.points-cles [data-champ="note-depart"]');
/** Note épinglée vide, comme celle que crée l'écran à la création d'une fiche. */
const noteVide = (id, liens) => ecrireDocument(`crm_notes/${id}`, { texte: '', epinglee: true, personneId: null, organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date(), ...liens });

test('I5 affaire créée à l’écran : une note épinglée vide, texte d’invitation grisé qui disparaît au clic ; plus de champ description ; rien dans l’historique tant qu’elle est vide', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('.page-actions [data-action="nouvelle-affaire"]').click();
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Boulangerie Martin');
  await dialogue(page).getByRole('button', { name: /^(Enregistrer|Créer quand même)$/ }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const a = await attendre('crm_affaires', (d) => d.titre === 'Boulangerie Martin');
  expect('description' in a).toBe(false);
  const n = await attendre('crm_notes', (d) => d.affaireId === a.id);
  expect(n).toMatchObject({ texte: '', epinglee: true, auteur: JEROME });
  expect((await listerDocuments('crm_notes')).length).toBe(1);
  // La note passe par le même moteur que les autres écritures : sa ligne est dans le Journal des modifications.
  await attendre('crm_audit', (l) => l.docId === n.id && l.collection === 'crm_notes' && l.outil === 'creerAffaire');
  await aller(page, `#/crm/affaires/${a.id}`);
  await expect(page.locator('[data-champ="description"], .description-fiche')).toHaveCount(0);
  const champ = champNote(page);
  await expect(champ).toBeVisible();
  await expect(champ).toHaveAttribute('placeholder', INVITATION_AFFAIRE);
  await expect(champ).toHaveValue('');
  await expect(page.locator('.historique .fil-note')).toHaveCount(0);
  await expect(page.locator('[data-action="developper-tout"]')).toHaveCount(0);
  await capture(page, '1-affaire');
  await champ.click();
  await expect(champ).toHaveAttribute('placeholder', '');
  // Rien tapé : l'invitation revient.
  await page.locator('.fiche-titre input.titre-editable').click();
  await expect(champ).toHaveAttribute('placeholder', INVITATION_AFFAIRE);
  // On écrit : la note s'enregistre en quittant le champ et devient une note épinglée ordinaire (dans l'historique aussi).
  await champ.click();
  await champ.fill('Besoin : une appli de commande.\nDevis à envoyer.');
  await page.locator('.fiche-titre input.titre-editable').click();
  await expect.poll(async () => (await lireDocument(`crm_notes/${n.id}`)).texte).toBe('Besoin : une appli de commande.\nDevis à envoyer.');
  await expect(page.locator('.points-cles .note-epinglee .note-texte')).toContainText('Besoin : une appli de commande.');
  await expect(page.locator('.historique .fil-note')).toHaveCount(1);
});

test('I5 projet créé à l’écran : une note épinglée vide « Ce projet concerne… »', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Projets');
  await page.locator('.page-actions [data-action="nouveau-projet"]').click();
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Refonte du site');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre('projets_projets', (d) => d.titre === 'Refonte du site');
  expect('description' in p).toBe(false);
  const n = await attendre('crm_notes', (d) => d.projetId === p.id);
  expect(n).toMatchObject({ texte: '', epinglee: true });
  await aller(page, `#/projets/projets/${p.id}`);
  await expect(page.locator('[data-champ="description"], .description-fiche')).toHaveCount(0);
  await expect(champNote(page)).toHaveAttribute('placeholder', INVITATION_PROJET);
  await capture(page, '2-projet');
  await champNote(page).click();
  await expect(champNote(page)).toHaveAttribute('placeholder', '');
});

test('I5 projet créé depuis une affaire : il reçoit une COPIE du texte de la note épinglée de l’affaire, affichée une seule fois', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'gagne' });
  await ecrireDocument('crm_notes/na1', { texte: 'Besoin : audit du site.\nDevis signé.', epinglee: true, personneId: null, organisationId: null, affaireId: 'a1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]').click();
  await dialogue(page).getByRole('button', { name: 'Créer le projet' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre('projets_projets', (d) => d.affaireId === 'a1');
  const copie = await attendre('crm_notes', (d) => d.projetId === p.id);
  expect(copie).toMatchObject({ texte: 'Besoin : audit du site.\nDevis signé.', epinglee: true, affaireId: 'a1' });
  expect(copie.id).not.toBe('na1');
  expect((await lireDocument('crm_notes/na1')).texte).toBe('Besoin : audit du site.\nDevis signé.');
  // Sur l'affaire comme sur le projet : une seule carte et une seule ligne d'historique (la copie et l'originale ont le même texte).
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(1);
  await expect(page.locator('.historique .fil-note')).toHaveCount(1);
  await aller(page, `#/projets/projets/${p.id}`);
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(1);
  await expect(page.locator('.historique .fil-note')).toHaveCount(1);
  await expect(page.locator('.historique')).not.toContainText('note de l’affaire');
  await expect(page.locator('.points-cles .note-epinglee')).toContainText('Besoin : audit du site.');
  await expect(page.locator('.points-cles .note-epinglee')).not.toContainText('note de l’affaire');
  await capture(page, '3-copie');
});

test('I5 désépinglée ou supprimée, la note vide ne revient pas (ni après un rechargement)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await noteVide('nv1', { affaireId: 'a1' });
  await ecrireDocument('crm_notes/nv2', { texte: 'Épinglée puis supprimée', epinglee: true, personneId: null, organisationId: null, affaireId: null, projetId: 'pr1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.locator('.points-cles [data-action="desepingler-note"]').click();
  await expect.poll(async () => (await lireDocument('crm_notes/nv1')).epinglee).toBe(false);
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  await expect(page.locator('.historique .fil-note')).toHaveCount(0);
  await page.reload();
  await attendreCalme(page);
  await expect(page.locator('.points-cles')).toBeVisible();
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  await capture(page, '4-desepinglee');
  // Projet : on supprime la note depuis l'historique ; elle ne revient pas non plus.
  await aller(page, '#/projets/projets/pr1');
  await page.locator('.historique .fil-note [data-action="supprimer-note"]').click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => (await listerDocuments('crm_notes')).some((d) => d.id === 'nv2')).toBe(false);
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  await page.reload();
  await attendreCalme(page);
  await expect(page.locator('.points-cles')).toBeVisible();
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  expect((await listerDocuments('crm_notes')).filter((d) => d.epinglee).length).toBe(0);
});

test('I5 cas vide : une affaire ou un projet déjà existant ne reçoit pas de note, même ouvert ; un ancien texte « description » resté en base n’est plus affiché', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', description: 'Ancien texte libre' });
  await creerProjet('pr1', { titre: 'Refonte site', description: 'Ancien texte du projet' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.points-cles')).toContainText('Aucune activité à faire.');
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  await expect(page.locator('.fiche')).not.toContainText('Ancien texte libre');
  await capture(page, '5-existante');
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  await expect(page.locator('.fiche')).not.toContainText('Ancien texte du projet');
  expect(await listerDocuments('crm_notes')).toEqual([]);
  expect((await lireDocument('crm_affaires/a1')).description).toBe('Ancien texte libre'); // rien n'est migré ni effacé
});

test('I5 cas d’erreur : si l’enregistrement échoue, un message le dit et le texte tapé reste dans la note', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await noteVide('nv1', { affaireId: 'a1' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const champ = champNote(page);
  await champ.click();
  await champ.fill('Texte à garder');
  // La note disparaît de la base pendant la frappe (supprimée ailleurs) : l'enregistrement est refusé.
  await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/crm_notes/nv1`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  await page.locator('.fiche-titre input.titre-editable').click();
  await expect(page.locator('.toast', { hasText: 'Enregistrement impossible' })).toBeVisible();
  await expect(champ).toHaveValue('Texte à garder');
  await capture(page, '6-erreur');
});

test('I5 sur téléphone, la note épinglée prend toute la largeur, comme le bloc Factures', async ({ page }) => {
  test.skip(!estTelephone(page), 'critère du téléphone');
  await creerProjet('pr1', { titre: 'Refonte site' });
  await noteVide('nv1', { projetId: 'pr1' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const carte = page.locator('.points-cles .note-epinglee');
  const factures = page.locator('[data-section="projet-factures"]');
  await expect(carte).toBeVisible();
  await expect(factures).toBeVisible();
  const [bc, bf] = [await carte.boundingBox(), await factures.boundingBox()];
  expect(Math.abs(bc.width - bf.width)).toBeLessThanOrEqual(6);
  expect(Math.abs(bc.x - bf.x)).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await carte.scrollIntoViewIfNeeded();
  await capture(page, '7-telephone', { telephone: true });
});
