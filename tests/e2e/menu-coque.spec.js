// PR B « nouvelle coque du menu » (18/10/2026), à la racine (chez Jérôme). Un test par point du brief (le nom commence par le numéro du point), UNE capture par point
// dans ~/chantiers-crm/captures-menu-B/ (« -tel » pour le format téléphone). Le point 5 chez un client et le point 6 chez un client sont dans menu-coque-client.spec.js.
// Pas de cas vide ni de cas d'erreur propres au menu utilisateur : il a toujours ses entrées (Réglages, Se déconnecter) et ne lit rien.
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, connecter, estTelephone, ouvrirMenuUtilisateur, JEROME } from './outils.js';

test.describe.configure({ mode: 'parallel' });

const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-menu-B');
async function capture(page, nom, options = {}) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: join(DOSSIER, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled', ...options });
}
const aller = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
/** Ordinateur : élargit le menu (il est replié au premier lancement) ; téléphone : ouvre le tiroir. */
async function deplier(page) {
  if (estTelephone(page)) { if (!(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); return; }
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click();
}
/** Clic à la souris sur ordinateur, tap au toucher sur téléphone. */
const toucher = (page, locator) => (estTelephone(page) ? locator.tap() : locator.click());

test('1 menu principal sans titres de groupes : blocs séparés par une fine ligne, Journal, Réglages et assistant absents du menu', async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  await expect(page.locator('.menu .menu-groupe-titre')).toHaveCount(0);
  await expect(page.locator('.menu .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Devis', 'Veille', 'Automatisations', 'Maintenance']);
  // Le menu aligne des modules : une entrée par module, jamais ses écrans (ils sont des onglets dans la page du module).
  for (const ecran of ['Contenus', 'Sources', 'Historique', 'À valider', 'Général', 'Technique']) await expect(page.locator('.menu').getByRole('link', { name: ecran, exact: true })).toHaveCount(0);
  for (const absent of ['Journal des modifications', 'Réglages', 'Connecter mon assistant', 'Assistant']) await expect(page.locator('.menu').getByRole('link', { name: absent })).toHaveCount(0);
  // Accueil | Personnes, Organisations | Affaires, Projets : trois sections dans le bloc, séparées par une ligne
  await expect(page.locator('.menu .menu-groupe[data-bloc="crm"] .menu-section')).toHaveCount(3);
  await expect(page.locator('.menu .menu-groupe[data-bloc="crm"] .menu-section').nth(1).locator('.menu-entree')).toHaveText(['Personnes', 'Organisations']);
  const lignes = await page.evaluate(() => [...document.querySelectorAll('.menu .menu-section')].map((s) => {
    const groupe = s.parentElement;
    const propre = s.previousElementSibling ? getComputedStyle(s).borderTopWidth : (groupe.previousElementSibling ? getComputedStyle(groupe).borderTopWidth : null);
    return propre;
  }));
  expect(lignes[0], 'pas de ligne au-dessus de la première section').toBeNull();
  expect(lignes.slice(1).every((l) => l === '1px'), `une fine ligne entre chaque bloc : ${lignes}`).toBe(true);
  await capture(page, '1-menu-deplie');
});

test('2 le Journal n’est plus un écran du menu mais l’adresse #/crm/journal affiche toujours sa page (signet)', async ({ page }) => {
  await connecter(page, JEROME);
  await aller(page, '#/crm/journal');
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
  await deplier(page);
  await expect(page.locator('.menu .menu-entree[data-chemin="crm/journal"]')).toHaveCount(0);
  await expect(page.locator('.menu .menu-entree[aria-current="page"]')).toHaveCount(0); // aucune entrée du menu principal n'est allumée sur cette page
  await capture(page, '2-journal-par-adresse');
});

test('3 menu utilisateur : s’ouvre vers le haut depuis le nom, contenu dans l’ordre, Échap, clic extérieur, clavier, toucher', async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  const compte = page.locator('.menu-compte');
  await toucher(page, compte);
  const pop = page.locator('.menu-pop');
  await expect(pop).toBeVisible();
  await expect(compte).toHaveAttribute('aria-expanded', 'true');
  // vers le haut : le menu se termine au-dessus du nom
  const [bp, bc] = [await pop.boundingBox(), await compte.boundingBox()];
  expect(bp.y + bp.height).toBeLessThanOrEqual(bc.y + 1);
  // contenu et ordre : e-mail (texte), Réglages, Journal, assistant, thème, ligne, Se déconnecter tout en bas
  await expect(pop.locator('> *').first()).toHaveText(JEROME);
  await expect(pop.locator('.menu-pop-texte')).toHaveAttribute('role', 'presentation');
  await expect(compte).toHaveAttribute('aria-controls', 'menu-utilisateur');
  await expect(pop).toHaveAttribute('id', 'menu-utilisateur');
  expect(await pop.evaluate((el) => getComputedStyle(el).maxHeight)).not.toBe('none'); // défile sur un écran bas (téléphone en paysage)
  await expect(pop.locator('.menu-pop-texte')).toHaveCount(1);
  await expect(pop.getByRole('menuitem')).toHaveText(['Réglages', 'Voir le journal des modifications', 'Connecter mon assistant', /Thème (clair|sombre)/, 'Se déconnecter']);
  await expect(pop.locator('[data-role="bascule-theme"]')).toHaveCount(1);
  await expect(pop.locator('> *').last()).toHaveText('Se déconnecter');
  await expect(pop.locator('.menu-pop-separateur')).toHaveCount(1);
  await capture(page, '3-menu-utilisateur');
  // Échap ferme et rend le focus au nom
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(compte).toBeFocused();
  await expect(compte).toHaveAttribute('aria-expanded', 'false');
  // un nouveau geste sur le nom ouvre puis referme ; un clic (tap) hors du menu le ferme
  await toucher(page, compte);
  await expect(pop).toBeVisible();
  await toucher(page, compte);
  await expect(pop).toHaveCount(0);
  await toucher(page, compte);
  await expect(pop).toBeVisible();
  if (estTelephone(page)) await page.touchscreen.tap(370, 120); else await page.mouse.click(900, 300);
  await expect(pop).toHaveCount(0);
  // clavier : Entrée sur le nom ouvre, le focus est sur la première entrée, flèches et Tab passent d'une entrée à l'autre, Entrée choisit
  await compte.focus();
  await page.keyboard.press('Enter');
  await expect(pop.getByRole('menuitem', { name: 'Réglages' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(pop.getByRole('menuitem', { name: 'Voir le journal des modifications' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pop.getByRole('menuitem', { name: 'Connecter mon assistant' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(pop.getByRole('menuitem', { name: 'Réglages' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/crm\/journal$/);
  await expect(pop).toHaveCount(0);
  if (estTelephone(page)) await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0); // sur téléphone, le choix referme aussi le menu
  // les autres entrées mènent à leur page
  await ouvrirMenuUtilisateur(page);
  await pop.getByRole('menuitem', { name: 'Réglages' }).click();
  await expect(page).toHaveURL(/#\/reglages$/);
  await ouvrirMenuUtilisateur(page);
  await pop.getByRole('menuitem', { name: 'Connecter mon assistant' }).click();
  await expect(page).toHaveURL(/#\/mcp\/infos$/);
  // le thème se change sans fermer le menu, puis « Se déconnecter » ramène à la connexion
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
  await pop.locator('[data-role="bascule-theme"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
  await expect(pop).toBeVisible();
  await expect(pop.locator('[data-role="bascule-theme"]')).toHaveText('Thème sombre');
  await pop.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

test('4 bouton de repli à droite du nom de l’espace : même état mémorisé, Cmd/Ctrl+B, bande de 64 px avec infobulles, caché sur téléphone', async ({ page }) => {
  await connecter(page, JEROME);
  const repli = page.locator('.menu-marque .menu-repli');
  if (estTelephone(page)) {
    await expect(repli).toBeHidden(); // sur téléphone : le menu garde son tiroir, sans bouton de repli
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(1);
    await capture(page, '4-menu-telephone');
    await page.keyboard.press('Control+b');
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie'); // sans effet sur téléphone
    return;
  }
  const menu = page.locator('.menu');
  const coquille = page.locator('.coquille');
  // replié au premier lancement : bande de 64 px, le bouton « Élargir le menu » reste visible et dans la bande
  await expect(coquille).toHaveAttribute('data-menu', 'replie');
  await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(64);
  await expect(repli).toBeVisible();
  await expect(repli).toHaveAttribute('aria-label', 'Élargir le menu');
  const b = await repli.boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(64);
  await page.locator('.menu .menu-entree[data-chemin="crm/personnes"]').hover();
  await expect(page.locator('.menu .menu-entree[data-chemin="crm/personnes"]')).toHaveAttribute('data-infobulle', 'Personnes');
  // la bande de la marque a la hauteur normale (64 px) en mode replié, pas plus
  expect(Math.round((await page.locator('.menu-marque').boundingBox()).height)).toBeLessThanOrEqual(64);
  await capture(page, '4-menu-replie');
  // le bouton élargit, et il est à droite du nom de l'espace
  await repli.click();
  await expect(coquille).toHaveAttribute('data-menu', 'elargi');
  await expect(repli).toHaveAttribute('aria-label', 'Replier le menu');
  await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(240);
  const nom = await page.locator('.menu-marque .menu-marque-nom').boundingBox();
  expect((await repli.boundingBox()).x).toBeGreaterThan(nom.x + nom.width - 1);
  // Ctrl+B replie, Cmd+B (Meta) élargit
  await page.keyboard.press('Control+b');
  await expect(coquille).toHaveAttribute('data-menu', 'replie');
  await page.keyboard.press('Meta+b');
  await expect(coquille).toHaveAttribute('data-menu', 'elargi');
  // ignoré tant qu'un menu flottant (menu utilisateur) est ouvert : on ne replie pas le menu dessous
  await page.locator('.menu-compte').click();
  await expect(page.locator('.menu-pop')).toBeVisible();
  await page.keyboard.press('Control+b');
  await expect(coquille).toHaveAttribute('data-menu', 'elargi');
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-pop')).toHaveCount(0);
  // ignoré dans un champ de saisie
  await page.locator('[data-role="recherche-globale"]').click();
  await page.keyboard.press('Control+b');
  await expect(coquille).toHaveAttribute('data-menu', 'elargi');
  await page.keyboard.press('Escape');
  await page.locator('.contenu').click({ position: { x: 5, y: 5 } });
  // ignoré quand une fenêtre de saisie est ouverte (« n » ouvre « Ajouter une personne »)
  await page.keyboard.press('n');
  await expect(page.locator('.voile-dialogue')).toBeVisible();
  await page.evaluate(() => document.activeElement?.blur()); // le focus quitte le champ de la fenêtre : seule la fenêtre ouverte doit faire ignorer le raccourci
  await page.keyboard.press('Control+b');
  await expect(coquille).toHaveAttribute('data-menu', 'elargi');
  await page.keyboard.press('Escape');
  await expect(page.locator('.voile-dialogue')).toHaveCount(0);
  // état mémorisé après rechargement
  await page.reload();
  await expect(coquille).toHaveAttribute('data-menu', 'elargi');
  await capture(page, '4-menu-deplie-avec-repli');
  await page.keyboard.press('Control+b');
  await page.reload();
  await expect(coquille).toHaveAttribute('data-menu', 'replie');
});

test('5 « Connecter mon assistant » chez Jérôme : adresse /mcp de la page, mode d’emploi Google en 3 lignes, comptes fixés par Jérôme, lien vers le Journal, aucune lecture dans la base', async ({ page }) => {
  await connecter(page, JEROME);
  const lecturesMembres = [];
  page.on('request', (r) => { if (/clients|membres/.test(r.url() + (r.postData() || ''))) lecturesMembres.push(r.url()); });
  await ouvrirMenuUtilisateur(page);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Connecter mon assistant' }).click();
  await expect(page).toHaveURL(/#\/mcp\/infos$/);
  await expect(page.getByRole('heading', { name: 'Connecter mon assistant', level: 1 })).toBeVisible();
  await expect(page.locator('input.mcp-lien')).toHaveValue(`${new URL(page.url()).origin}/mcp`);
  await expect(page.locator('.mcp-etapes li')).toHaveCount(3);
  await expect(page.locator('.mcp-etapes')).toContainText('Google');
  await expect(page.locator('.page-mcp')).toContainText('Les comptes autorisés sont fixés par Jérôme.');
  await expect(page.locator('.mcp-membre')).toHaveCount(0);
  await expect(page.locator('.page-mcp a', { hasText: 'Journal des modifications' })).toHaveAttribute('href', '#/crm/journal');
  await expect(page.locator('.page-mcp')).not.toContainText(/cia_|jeton|claude-code/i);
  await page.waitForTimeout(800);
  expect(lecturesMembres).toEqual([]);
  await capture(page, '5-connecter-mon-assistant-racine');
  await page.locator('.page-mcp a', { hasText: 'Journal des modifications' }).click();
  await expect(page).toHaveURL(/#\/crm\/journal$/);
});

test('6 en-tête du menu : nom de l’espace + logo + bouton de repli, avatar = initiale du compte (plus de photo)', async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  await expect(page.locator('.menu-marque')).toContainText('Chevalier IA OS');
  await expect(page.locator('.menu-marque .baguette')).toHaveCount(1);
  await expect(page.locator('.menu-marque > .menu-marque-nom + .menu-repli')).toHaveCount(1);
  await expect(page.locator('.menu-marque b')).toHaveText('OS'); // le « OS » jaune de la marque
  await expect(page.locator('.barre-haut-marque b')).toHaveText('OS');
  await expect(page.locator('.barre-haut .avatar-initiale')).toHaveAttribute('aria-label', 'Jérôme'); // nom accessible (visible sur téléphone)
  await expect(page.locator('.menu .menu-compte .avatar-initiale')).toHaveText('J');
  await expect(page.locator('img.avatar')).toHaveCount(0);
  await expect(page.locator('.menu-compte')).toContainText('Jérôme');
  await expect(page.locator('.menu-compte')).not.toContainText('@');
  await capture(page, '6-en-tete-apres', estTelephone(page) ? {} : { clip: { x: 0, y: 0, width: 260, height: 900 } });
});
