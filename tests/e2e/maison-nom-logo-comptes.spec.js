// Nom et logo d'une maison de client changés par les AUTRES comptes de la maison (27/11/2026, accord de Jérôme : plus seulement le titulaire). Un test par critère
// (le nom commence par son numéro) :
//  1 un autre compte de la maison (pas titulaire) voit le formulaire de Réglages > Mon espace, change le nom et le logo, qui s'affichent tout de suite en haut à gauche ;
//  2 chaque changement écrit une ligne dans le journal (qui, ancien et nouveau nom ; « logo changé », jamais l'image) ; le titulaire la lit dans le Journal ;
//    les règles refusent une modification sans sa ligne ;
//  3 le titulaire garde ses droits (et son changement est noté lui aussi) ; chez Jérôme (pas une maison de client) : toujours en lecture seule.
// Un lecteur n'existe pas dans une maison (tout compte de comptes_autorises écrit) : son cas est verrouillé sans navigateur (tests/applications-coque.test.js, test 3).
// Règles : tests/regles.test.js (1 RM-R5, 2 RM-R7, 4 RM-R6). Captures dans tests/e2e/captures/maison-nom-logo-comptes/ (ordinateur et téléphone). Données inventées.
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES joue ici un autre compte de la maison du client.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, listerDocuments, estTelephone, JEROME, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-nom-logo-comptes/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const NOM = 'Menuiserie Exemple';
const semer = (document, fiche) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document, fiche });

async function semerMaison() {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await semer('ecran', { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ['achatsfactures'] });
}
async function ouvrir(page, email, route) {
  await connecter(page, email, { attendreAccueil: false, route });
  await expect(page.locator('.coquille')).toBeVisible();
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Un petit PNG carré (16 x 16, une couleur), fabriqué dans le navigateur : aucune image dans le dépôt. */
const pngFictif = async (page, couleur = '#0f766e') => Buffer.from(await page.evaluate((c) => {
  const toile = document.createElement('canvas'); toile.width = 16; toile.height = 16;
  const d = toile.getContext('2d'); d.fillStyle = c; d.fillRect(0, 0, 16, 16);
  return toile.toDataURL('image/png').split(',')[1];
}, couleur), 'base64');
const deconnecterTout = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => indexedDB.databases().then((bases) => Promise.all(bases.map((b) => new Promise((r) => { const d = indexedDB.deleteDatabase(b.name); d.onsuccess = d.onerror = d.onblocked = r; })))));
  await page.goto('about:blank');
};
const lignesIdentite = async () => (await listerDocuments('crm_audit')).filter((l) => l.collection === 'reglages_maison' && l.docId === 'public');
const marque = (page) => page.locator(estTelephone(page) ? '.barre-haut-marque' : '.menu-marque-nom');

test('1 Mon espace d’une maison, autre compte du client (pas titulaire) : il change le nom et le logo, qui s’affichent tout de suite en haut à gauche', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, CHARLES, 'reglages');
  const section = page.locator('[data-role="mon-espace-maison"]');
  await expect(section).toBeVisible();
  await expect(page.locator('#reglages-identite')).toHaveCount(0); // plus la version en lecture seule
  await expect(section.locator('[data-role="aide-public"]')).toContainText('Chaque changement est noté dans le journal');
  await expect(section.locator('[data-champ="nom"]')).toHaveValue(NOM);
  await expect(section.locator('[data-champ="nom"]')).toBeEnabled();
  await section.locator('[data-champ="nom"]').fill('Menuiserie 04');
  await section.locator('[data-role="fichier-logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await pngFictif(page) });
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="message-enregistrement"]')).toContainText('Enregistré');
  await expect(marque(page)).toContainText('Menuiserie 04');
  await expect(marque(page).locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '1-autre-compte-enregistre');
  // Enregistrer sans rien changer : aucune écriture, aucune nouvelle ligne de journal.
  await expect.poll(async () => (await lignesIdentite()).length).toBe(1);
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="message-enregistrement"]')).toContainText('Enregistré');
  expect((await lignesIdentite()).length).toBe(1);
});

test('2 chaque changement du nom ou du logo écrit une ligne dans le journal (qui, ancien et nouveau nom, « logo changé » sans l’image) ; le titulaire la lit dans le Journal ; sans sa ligne, les règles refusent', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, CHARLES, 'reglages');
  const section = page.locator('[data-role="mon-espace-maison"]');
  await section.locator('[data-champ="nom"]').fill('Menuiserie 04');
  await section.locator('[data-role="fichier-logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await pngFictif(page) });
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="message-enregistrement"]')).toContainText('Enregistré');
  await expect.poll(async () => (await lignesIdentite()).length).toBe(1);
  const [ligne] = await lignesIdentite();
  expect(ligne.acteur).toBe(CHARLES);
  expect(ligne.via).toBe('ecran');
  expect(ligne.action).toBe('modifier');
  expect([...ligne.champsModifies].sort()).toEqual(['logo', 'nom_espace']);
  const copie = (await listerDocuments('crm_audit_avant')).find((c) => c.id === ligne.id);
  expect(copie.avant).toEqual({ nom_espace: NOM, logo: 'pas de logo' });
  expect(copie.apres).toEqual({ nom_espace: 'Menuiserie 04', logo: 'logo changé' });
  expect(JSON.stringify([ligne, copie])).not.toContain('data:image'); // jamais l'image dans le journal
  // Les règles refusent une modification sans sa ligne de journal, même en appelant la base à la main (le formulaire n'est pas la barrière).
  const code = await page.evaluate(async () => {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
    const { db } = await import('/js/os/firebase.js');
    try { await updateDoc(doc(db, 'reglages_maison', 'public'), { nom_espace: 'Sans trace' }); return 'accepté'; } catch (e) { return e.code; }
  });
  expect(code).toBe('permission-denied');
  // Le titulaire ouvre le Journal : l'opération de l'autre compte, avec l'ancien et le nouveau nom.
  await deconnecterTout(page);
  await ouvrir(page, JEROME, 'journal');
  const operation = page.locator('.tableau-journal tbody tr').filter({ hasText: 'nom ou logo de l’espace' });
  await expect(operation).toHaveCount(1);
  await expect(operation).toContainText('Charles');
  await capturer(page, info, '2-journal-liste');
  await operation.click();
  const dialogue = page.getByRole('dialog');
  await expect(dialogue.locator('.diff-avant', { hasText: NOM }).first()).toBeVisible();
  await expect(dialogue.locator('.diff-apres', { hasText: 'Menuiserie 04' }).first()).toBeVisible();
  await expect(dialogue.locator('.diff-apres', { hasText: 'logo changé' }).first()).toBeVisible();
  await expect(dialogue).not.toContainText('data:image');
  await capturer(page, info, '2-journal-detail');
});

test('3 le titulaire garde ses droits : il change le nom, et son changement est noté lui aussi ; chez Jérôme (pas une maison de client) : lecture seule, sans formulaire', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, JEROME, 'reglages');
  const section = page.locator('[data-role="mon-espace-maison"]');
  await section.locator('[data-champ="nom"]').fill('Nom du titulaire');
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="message-enregistrement"]')).toContainText('Enregistré');
  await expect(marque(page)).toContainText('Nom du titulaire');
  await expect.poll(async () => (await lignesIdentite()).map((l) => [l.acteur, [...l.champsModifies].join(',')])).toEqual([[JEROME, 'nom_espace']]);
  await capturer(page, info, '3-titulaire-enregistre');
  // Chez Jérôme : « public » sans nom ni connexion neutre → pas de formulaire, ni pour lui ni pour un autre compte.
  await semer('public', { mode_crm: true });
  await semer('ecran', ECRAN_PARCOURS);
  for (const email of [JEROME, CHARLES]) {
    await deconnecterTout(page);
    await ouvrir(page, email, 'reglages');
    await expect(page.locator('#reglages-identite')).toBeVisible();
    await expect(page.locator('[data-role="mon-espace-maison"]')).toHaveCount(0);
    await expect(page.locator('#reglages-identite input, #reglages-identite button')).toHaveCount(0);
  }
  await capturer(page, info, '3-chez-jerome-lecture-seule');
});
