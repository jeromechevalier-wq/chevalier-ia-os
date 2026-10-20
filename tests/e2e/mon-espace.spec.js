// « Mon espace modifiable » (2.10.0) : un éditeur règle lui-même nom, couleur, logo, images, texte d'accueil et membres de son espace.
// Un test par critère (M1 à M23) et UNE capture par critère, enregistrée dans ~/chantiers-crm/captures-mon-espace/ (M1.png… ; « -tel » pour le format téléphone).
// Le navigateur appelle la VRAIE fonction serveur (functions-plateforme/src/espace.js) via tests/e2e/espace-faux-serveur.js, sur l'émulateur Firestore et un FAUX Storage.
// Pas essayé ici : le vrai Google Cloud (compte de service, droits Storage, vrai téléversement, vraie adresse de la fonction), un vrai iPhone.
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, lireDocument, listerDocuments, estTelephone, allerA, choisirDansMenuUtilisateur, PROJET, FIRESTORE, AUTH, URL_APP } from './outils.js';
import { brancherServeurEspace, fabriquerImage, dimensionsPng, dimensionsDansNavigateur, urlFichier } from './espace-faux-serveur.js';

const ALICE = 'alice@exemple.test'; // éditrice, seule éditrice de « studio »
const LEA = 'lea@exemple.test'; // lectrice
const DOSSIER_CAPTURES = join(homedir(), 'chantiers-crm', 'captures-mon-espace');
const COULEUR = '#336699';

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(async () => { await mkdir(DOSSIER_CAPTURES, { recursive: true }); await chargerRegles('firestore.plateforme.rules'); });
test.afterAll(() => chargerRegles('firestore.rules'));

let serveur;
test.beforeEach(async ({ page }) => {
  serveur = await brancherServeurEspace(page);
  await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: COULEUR });
  await ecrireDocument('clients/studio', { nom: 'Studio Lune', modules: { affaires: true, projets: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
  await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur', nom: 'Alice' });
  await ecrireDocument(`clients/studio/membres/${LEA}`, { role: 'lecteur', nom: 'Léa' });
});

/** Capture de l'écran (page entière) dans le dossier des captures ; le format téléphone porte « -tel ». */
async function capturer(page, nom, { fenetre = false, element = null } = {}) {
  const chemin = join(DOSSIER_CAPTURES, `${nom}${estTelephone(page) ? '-tel' : ''}.png`);
  if (element) {
    // Un bloc seul, lisible. L'écran se redessine quand Firestore renvoie les réglages : l'élément peut être remplacé pendant la prise de vue
    // (« Element is not attached to the DOM »). On attend qu'il soit de nouveau là, puis on reprend (2 reprises au plus), sans délai fixe.
    for (let essai = 0; ; essai++) {
      try { await element.waitFor({ state: 'visible' }); await element.screenshot({ path: chemin }); break; } catch (e) {
        if (essai >= 2 || !/not attached to the DOM/.test(String(e?.message))) throw e;
      }
    }
  } else await page.screenshot({ path: chemin, fullPage: !fenetre }); // fenetre : ce qu'on voit à l'écran (les messages en bas, comme « Retiré · Annuler »)
}

async function ouvrir(page, reste = 'reglages', { client = 'studio', email = ALICE } = {}) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}/${reste}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
  await expect(page.locator('.coquille')).toBeVisible();
}
const champ = (page, nom) => page.locator(`[data-champ="${nom}"]`);
const toastMessage = (page, texte) => page.locator('.toast', { hasText: texte });
const fichier = (nom, mimeType, buffer) => ({ name: nom, mimeType, buffer });
const marque = () => lireDocument('marques/studio');

/** Pose un logo déjà enregistré chez « studio » (fichier dans le faux Storage + adresse dans la fiche). */
async function poserLogo(page, { type = 'png', largeur = 200, hauteur = 100, couleur = '#cc3366', nom = 'logo-1700000000000.png' } = {}) {
  const octets = await fabriquerImage(page, { type, largeur, hauteur, couleur });
  const chemin = `marques/studio/${nom}`;
  serveur.bucket.fichiers.set(chemin, octets);
  await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: COULEUR, logo: urlFichier(chemin) });
  return { chemin, url: urlFichier(chemin), octets };
}

/** Fait le choix d'un fichier dans un sélecteur caché. */
const choisir = (page, role, f) => page.locator(`[data-role="${role}"]`).setInputFiles(f);
const imageEnAttenteDeVue = async (page) => { await page.waitForFunction(() => document.querySelector('[data-role="zone-mon-espace"] form')); };

// ---------------------------------------------------------------- M1 à M9 : l'écran Mon espace (éditeur)

test('M1 éditeur : Réglages > Mon espace montre un champ Nom, un sélecteur de couleur, « Choisir un logo », un Texte d\'accueil et « Enregistrer » (plus de simples textes)', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await expect(champ(page, 'nom')).toBeEditable();
  await expect(champ(page, 'nom')).toHaveValue('Studio Lune');
  await expect(champ(page, 'couleur')).toHaveAttribute('type', 'color');
  await expect(champ(page, 'couleur')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choisir un logo' })).toBeEnabled();
  await expect(champ(page, 'accueil')).toBeEditable();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  await expect(page.locator('[data-info]')).toHaveCount(0);
  await capturer(page, 'M1');
});

test('M2 changer le nom en « Atelier Ingrid » : « Enregistré », puis le nouveau nom dans le menu, la barre du haut, le titre de la page Réglages et le titre de l\'onglet, sans recharger', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await page.evaluate(() => { window.__sansRechargement = true; });
  await champ(page, 'nom').fill('Atelier Ingrid');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toastMessage(page, 'Enregistré')).toBeVisible();
  await expect(page.locator('[data-role="message-enregistrement"]')).toHaveText('Enregistré');
  await expect(page.locator('.menu-marque')).toContainText('Atelier Ingrid');
  await expect(page.locator('.barre-haut-marque')).toHaveText('Atelier Ingrid');
  await expect(page.locator('.page-tete-reglages .etiquette')).toHaveText('Atelier Ingrid');
  await expect(page.locator('.reglages-contenu .page-tete .etiquette')).toContainText('Atelier Ingrid');
  await expect(page).toHaveTitle('Atelier Ingrid');
  expect(await page.evaluate(() => window.__sansRechargement), 'la page n\'a pas été rechargée').toBe(true);
  expect((await marque()).nom).toBe('Atelier Ingrid');
  expect((await lireDocument('clients/studio')).nom).toBe('Atelier Ingrid');
  expect((await lireDocument('clients/studio')).modules).toEqual({ affaires: true, projets: true });
  expect(serveur.appels).toEqual([{ client: 'studio', action: 'enregistrer', nom: 'Atelier Ingrid' }]); // seul le champ modifié est envoyé
  await capturer(page, 'M2');
});

test('M3 couleur : aperçu sombre et clair ; une couleur très pâle est acceptée mais affichée corrigée ; après enregistrement, boutons et menu actif changent de couleur sans recharger', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await champ(page, 'couleur').fill('#fafafa');
  const calcul = await page.evaluate(async () => { const m = await import('/js/os/marque.js'); return { sombre: m.accentPourTheme('#fafafa', 'sombre'), clair: m.accentPourTheme('#fafafa', 'clair') }; });
  const sombre = page.locator('[data-apercu="sombre"]');
  const clair = page.locator('[data-apercu="clair"]');
  await expect(sombre).toBeVisible();
  await expect(clair).toBeVisible();
  await expect(sombre).toHaveAttribute('data-accent', calcul.sombre.accent);
  await expect(clair).toHaveAttribute('data-accent', calcul.clair.accent);
  expect(calcul.clair.accent, 'très pâle : assombrie en thème clair, jamais refusée').not.toBe('#fafafa');
  await expect(page.locator('.mon-espace')).toContainText('Ta couleur est éclaircie ou assombrie automatiquement pour rester lisible.');
  await expect(page.locator('[data-role="valeur-couleur"]')).toHaveText('#fafafa');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toastMessage(page, 'Enregistré')).toBeVisible();
  expect((await marque()).couleur).toBe('#fafafa'); // la couleur choisie est gardée telle quelle (la page la corrige à l'affichage)
  // vraie couleur de l'interface, sans recharger : le fond de « Enregistrer » et le jeton d'accent suivent le calcul de marque.js pour le thème courant
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  const attendu = (theme === 'clair' ? calcul.clair : calcul.sombre).accent;
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe(attendu);
  await page.mouse.move(0, 0); // la souris ne survole plus le bouton (le survol éclaircit la couleur)
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  await expect.poll(() => page.locator('.mon-espace-pied .bouton-principal').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(attendu));
  // une vraie couleur vive : le menu actif change aussi
  await champ(page, 'couleur').fill('#cc2244');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await marque()).couleur).toBe('#cc2244');
  const vive = await page.evaluate(async ([t]) => { const m = await import('/js/os/marque.js'); return m.accentPourTheme('#cc2244', t); }, [theme]);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe(vive.accent);
  await page.mouse.move(0, 0);
  await expect.poll(() => page.locator('.mon-espace-pied .bouton-principal').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(vive.accent));
  await capturer(page, 'M3');
  await allerA(page, 'Accueil'); // Réglages n'est plus une entrée du menu (PR B) : on regarde l'entrée allumée de l'Accueil
  await expect.poll(() => page.locator('.menu-entree.actif').first().evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe(rgb(vive.trait)); // la barre du menu actif prend le « trait » de la couleur
});

test('M4 logo PNG, JPG ou WebP valide : aperçu avant d\'enregistrer ; après « Enregistrer », le logo dans le menu et dans l\'icône de l\'onglet, sans recharger', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await page.evaluate(() => { window.__sansRechargement = true; });
  for (const [type, mime] of [['jpg', 'image/jpeg'], ['webp', 'image/webp'], ['png', 'image/png']]) {
    await choisir(page, 'fichier-logo', fichier(`logo.${type}`, mime, await fabriquerImage(page, { type, largeur: 300, hauteur: 150 })));
    await expect(page.locator('[data-role="logo-apercu"]')).toContainText('300 × 150 px');
    await expect(page.locator('[data-role="logo-image"]')).toHaveAttribute('src', /^blob:/);
  }
  expect((await marque()).logo, 'rien n\'est enregistré avant « Enregistrer »').toBeUndefined();
  expect(serveur.bucket.fichiers.size).toBe(0);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toastMessage(page, 'Enregistré')).toBeVisible();
  const logo = (await marque()).logo;
  expect(logo).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/chevalier-ia-app\.firebasestorage\.app\/o\/marques%2Fstudio%2Flogo-\d+\.png\?alt=media$/);
  await expect(page.locator('.menu-logo-client')).toHaveAttribute('src', logo);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', logo);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', logo);
  await expect(page.locator('[data-role="logo-image"]')).toHaveAttribute('src', logo);
  await expect(page.locator('.menu-logo-client')).toHaveJSProperty('complete', true);
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
  expect(serveur.bucket.fichiers.size).toBe(1);
  await capturer(page, 'M4');
});

test('M5 un SVG, un autre type de fichier ou un fichier de plus de 2 Mo : un message qui dit lequel des trois cas et quoi faire, et rien n\'est enregistré', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  const message = page.locator('[data-role="message-logo"]');
  await choisir(page, 'fichier-logo', fichier('logo.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')));
  await expect(message).toContainText('Les fichiers SVG ne sont pas acceptés');
  await expect(message).toContainText('PNG, JPG ou WebP');
  await capturer(page, 'M5-svg');
  await choisir(page, 'fichier-logo', fichier('notes.txt', 'text/plain', Buffer.from('ceci n\'est pas une image')));
  await expect(message).toContainText('n’est pas un PNG, un JPG ou un WebP');
  await capturer(page, 'M5-type');
  const signaturePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await choisir(page, 'fichier-logo', fichier('gros.png', 'image/png', Buffer.concat([signaturePng, Buffer.alloc(2.5 * 1024 * 1024)])));
  await expect(message).toContainText('pèse 2,5 Mo : 2 Mo au plus');
  await expect(message).toContainText('plus légère');
  await expect(page.locator('[data-role="logo-apercu"]')).toHaveCount(0);
  expect(serveur.appels).toEqual([]);
  expect(serveur.bucket.fichiers.size).toBe(0);
  expect((await marque()).logo).toBeUndefined();
  await capturer(page, 'M5');
});

test('M6 un logo plus large que 512 px : l\'aperçu et le fichier envoyé font 512 px de large au plus ; un logo plus petit n\'est pas agrandi', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await choisir(page, 'fichier-logo', fichier('large.png', 'image/png', await fabriquerImage(page, { largeur: 1400, hauteur: 700, transparent: true })));
  await expect(page.locator('[data-role="logo-apercu"]')).toContainText('512 × 256 px');
  expect(await page.locator('[data-role="logo-image"]').evaluate((img) => img.naturalWidth)).toBe(512);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toastMessage(page, 'Enregistré')).toBeVisible();
  const [envoye] = [...serveur.bucket.fichiers.values()];
  expect(dimensionsPng(envoye)).toEqual({ largeur: 512, hauteur: 256 });
  // un logo plus petit : jamais agrandi, envoyé tel quel
  await choisir(page, 'fichier-logo', fichier('petit.png', 'image/png', await fabriquerImage(page, { largeur: 120, hauteur: 60 })));
  await expect(page.locator('[data-role="logo-apercu"]')).toContainText('120 × 60 px');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(() => serveur.bucket.fichiers.size === 1 && dimensionsPng([...serveur.bucket.fichiers.values()][0]).largeur).toBe(120); // l'ancien fichier est supprimé après l'écriture de la fiche
  const [petit] = [...serveur.bucket.fichiers.values()];
  expect(dimensionsPng(petit)).toEqual({ largeur: 120, hauteur: 60 });
  await capturer(page, 'M6');
});

test('M7 retirer le logo (confirmation puis « Retiré · Annuler ») : les initiales à la place ; « Annuler » dans les 8 s ramène le logo ; sinon le fichier est supprimé après les 8 s', async ({ page }) => {
  const { url, chemin } = await poserLogo(page);
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await expect(page.locator('[data-role="logo-image"]')).toHaveAttribute('src', url);
  await page.getByRole('button', { name: 'Retirer', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Retirer le logo ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(page.locator('[data-role="logo-initiale"]')).toHaveText('S');
  await expect(page.locator('[data-role="pas-de-logo"]')).toHaveText('Pas de logo');
  await expect(page.locator('.toast', { hasText: 'Retiré' })).toBeVisible();
  await expect(page.locator('.toast [data-action="toast-action"]')).toHaveText('Annuler');
  await page.locator('[data-role="logo-initiale"]').scrollIntoViewIfNeeded();
  await capturer(page, 'M7', { fenetre: true });
  expect((await marque()).logo, 'le fichier n\'est supprimé qu\'après les 8 secondes').toBe(url);
  await page.locator('.toast [data-action="toast-action"]').click(); // Annuler
  await expect(page.locator('[data-role="logo-image"]')).toHaveAttribute('src', url);
  await page.waitForTimeout(9000);
  expect((await marque()).logo).toBe(url);
  expect(serveur.bucket.fichiers.has(chemin)).toBe(true);
  // sans annuler : retiré pour de bon après 8 secondes
  await page.getByRole('button', { name: 'Retirer', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await marque()).logo, { timeout: 15000 }).toBeNull();
  expect(serveur.bucket.fichiers.has(chemin)).toBe(false);
  await expect(page.locator('.menu-logo-client')).toHaveCount(0);
});

test('M8 images de la page de connexion : jusqu\'à 4 ; retrait avec confirmation puis « Retiré · Annuler » ; « Mettre en première » change le fond ; une 5e est refusée avec un message clair', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  const images = page.locator('[data-role="liste-images"] .mon-espace-image');
  await expect(page.locator('[data-role="aucune-image"]')).toHaveText('Aucune image');
  const couleurs = ['#cc3366', '#33cc66', '#3366cc', '#cccc33', '#33cccc'];
  for (let i = 0; i < 4; i++) {
    await choisir(page, 'fichier-image', fichier(`image-${i}.png`, 'image/png', await fabriquerImage(page, { largeur: 2000, hauteur: 1000, couleur: couleurs[i] })));
    await expect(images).toHaveCount(i + 1);
  }
  await expect(page.locator('[data-role="image-fond"]')).toHaveCount(1);
  for (const octets of serveur.bucket.fichiers.values()) expect(dimensionsPng(octets).largeur, 'réduite à 1600 px').toBe(1600);
  // 5e image : refusée avant tout envoi
  await choisir(page, 'fichier-image', fichier('cinq.png', 'image/png', await fabriquerImage(page, { couleur: couleurs[4] })));
  await expect(page.locator('[data-role="message-images"]')).toContainText('Tu as déjà 4 images : retire-en une avant d’en ajouter une autre.');
  await expect(images).toHaveCount(4);
  expect(serveur.appels.filter((a) => a.action === 'image-ajouter')).toHaveLength(4);
  // retrait : confirmation, « Retiré · Annuler » ; Annuler la remet
  const avant = (await marque()).images;
  await images.nth(3).getByRole('button', { name: /Retirer/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(images).toHaveCount(3);
  await expect(page.locator('.toast', { hasText: 'Retiré' })).toBeVisible();
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(images).toHaveCount(4);
  expect((await marque()).images).toEqual(avant);
  // retrait pour de bon (8 s)
  await images.nth(3).getByRole('button', { name: /Retirer/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(images).toHaveCount(3);
  await expect.poll(async () => (await marque()).images.length, { timeout: 15000 }).toBe(3);
  expect(serveur.bucket.fichiers.size).toBe(3);
  // « Mettre en première » : la troisième devient le fond de la page de connexion
  const [a, b, c] = (await marque()).images;
  await images.nth(2).getByRole('button', { name: 'Mettre en première' }).click();
  await expect.poll(async () => (await marque()).images).toEqual([c, a, b]);
  await expect(images.nth(0).locator('[data-role="image-fond"]')).toBeVisible();
  await capturer(page, 'M8');
  // page de connexion (après déconnexion) : le fond est cette image
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('.espace-fond')).toHaveAttribute('src', c);
});

test('M9 texte d\'accueil : au-delà de 500 caractères le compteur bloque ; le message « visible par tout le monde, même sans compte » est affiché sous les champs', async ({ page }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await expect(page.locator('[data-role="compteur"]')).toHaveText('0 / 500');
  await champ(page, 'accueil').fill('a'.repeat(620));
  await expect(page.locator('[data-role="compteur"]')).toHaveText('500 / 500');
  await expect(page.locator('[data-role="compteur"]')).toHaveAttribute('data-limite', 'true');
  expect(await champ(page, 'accueil').inputValue()).toHaveLength(500);
  await expect(page.locator('[data-role="message-enregistrement"]')).toContainText('Limite de 500 caractères atteinte');
  await expect(page.locator('[data-role="public"]')).toContainText('visibles par tout le monde sur la page de connexion, même sans compte');
  await expect(page.locator('[data-role="public"]')).toContainText('N’y mets rien de confidentiel');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toastMessage(page, 'Enregistré')).toBeVisible();
  expect((await marque()).accueil).toHaveLength(500);
  await capturer(page, 'M9');
});

// ---------------------------------------------------------------- M10, M11 : lecteur et refus du serveur

test('M10 lecteur : les valeurs, tous les champs désactivés, « Seul un éditeur peut modifier » ; ni « Membres et rôles » ni « Modules actifs »', async ({ page }) => {
  await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: COULEUR, accueil: 'Bienvenue chez nous.' });
  await ouvrir(page, 'reglages', { email: LEA });
  await imageEnAttenteDeVue(page);
  await expect(champ(page, 'nom')).toHaveValue('Studio Lune');
  await expect(champ(page, 'couleur')).toHaveValue(COULEUR);
  await expect(champ(page, 'accueil')).toHaveValue('Bienvenue chez nous.');
  for (const nom of ['nom', 'couleur', 'accueil']) await expect(champ(page, nom)).toBeDisabled();
  await expect(page.locator('[data-role="lecture-seule"]')).toHaveText('Seul un éditeur peut modifier');
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choisir un logo' })).toHaveCount(0);
  await expect(page.locator('.reglages-menu-lien')).not.toContainText(['Membres et rôles']);
  await expect(page.locator('.reglages-menu-lien[data-reglage="membres"], .reglages-menu-lien[data-reglage="modules"]')).toHaveCount(0);
  await capturer(page, 'M10');
});

test('M11 un lecteur, un inconnu ou un éditeur d\'un autre espace qui appelle la fonction directement reçoit « Action non autorisée. » et la fiche est inchangée', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'refus du serveur : le navigateur note le statut HTTP 4xx dans sa console' });
  await ecrireDocument('marques/autre', { actif: true, nom: 'Autre espace', couleur: '#aa0000' });
  await ecrireDocument('clients/autre', { nom: 'Autre espace' });
  await ecrireDocument('clients/autre/membres/bob@exemple.test', { role: 'editeur' });
  // Jeton de connexion de l'émulateur Auth (comme celui du bouton « Se connecter avec Google » en test) : l'appel part sans passer par l'appli, comme un pirate le ferait.
  const jetonDe = async (email) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fausse-cle`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `providerId=google.com&id_token=${encodeURIComponent(JSON.stringify({ sub: `test-${email}`, email, email_verified: true }))}`, requestUri: 'http://localhost', returnIdpCredential: true, returnSecureToken: true }),
  })).json()).idToken;
  const appeler = async (email, client, action, donnees) => {
    const jeton = await jetonDe(email);
    return page.evaluate(async ([j, c, a, d]) => {
      const r = await fetch('https://europe-west9-demo-chevalier-ia-os.cloudfunctions.net/espaceReglages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${j}` }, body: JSON.stringify({ data: { client: c, action: a, ...d } }),
      });
      const corps = await r.json();
      return { statut: r.status, message: corps.error?.message, code: corps.error?.status, accepte: corps.result !== undefined };
    }, [jeton, client, action, donnees]);
  };
  const REFUS = { statut: 403, message: 'Action non autorisée.', code: 'PERMISSION_DENIED', accepte: false };
  const avant = [await marque(), await lireDocument('clients/studio'), await lireDocument('marques/autre'), await listerDocuments('clients/studio/membres')];
  await ouvrir(page, 'reglages', { email: LEA });
  await imageEnAttenteDeVue(page);
  // 1) un lecteur de l'espace, 2) un inconnu (aucun espace), 3) un éditeur d'un autre espace, 4) un espace qui n'existe pas : même refus, mêmes mots
  const reponses = [];
  for (const [email, client, action, donnees, quoi] of [
    [LEA, 'studio', 'enregistrer', { nom: 'Pirate', couleur: '#ff0000' }, 'un lecteur : enregistrer'],
    [LEA, 'studio', 'membre-role', { email: LEA, role: 'editeur' }, 'un lecteur : se donner le rôle éditeur'],
    ['inconnu@exemple.test', 'studio', 'enregistrer', { nom: 'Pirate' }, 'un inconnu : enregistrer'],
    ['bob@exemple.test', 'studio', 'enregistrer', { nom: 'Pirate' }, 'un éditeur d’un autre espace : enregistrer'],
    ['bob@exemple.test', 'studio', 'membre-ajouter', { email: 'pirate@exemple.test', role: 'editeur' }, 'un éditeur d’un autre espace : ajouter un membre'],
    ['bob@exemple.test', 'fantome', 'enregistrer', { nom: 'Pirate' }, 'un espace qui n’existe pas'],
  ]) {
    const r = await appeler(email, client, action, donnees);
    expect(r).toEqual(REFUS);
    reponses.push(`${quoi}  →  HTTP ${r.statut} · ${r.code} · « ${r.message} »`);
  }
  expect([await marque(), await lireDocument('clients/studio'), await lireDocument('marques/autre'), await listerDocuments('clients/studio/membres')]).toEqual(avant);
  expect(serveur.bucket.journal).toEqual([]);
  // on affiche les VRAIES réponses reçues du serveur (rien n'est écrit à la main : une ligne par appel)
  await page.evaluate((lignes) => { const o = document.createElement('pre'); o.dataset.role = 'reponses-m11'; o.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff;color:#000;padding:16px;margin:0;font:600 15px/1.6 monospace;white-space:pre-wrap'; o.textContent = lignes.join('\n'); document.body.append(o); }, reponses);
  await capturer(page, 'M11');
});

// ---------------------------------------------------------------- M12 à M16 : membres et rôles

test('M12 éditeur : « Membres et rôles » liste les membres avec mon adresse marquée « (toi) » ; une adresse Google ajoutée avec un rôle apparaît tout de suite', async ({ page }) => {
  await ouvrir(page, 'reglages/membres');
  await expect(page.locator(`[data-membre="${ALICE}"] .reglages-membre-nom`)).toHaveText(`${ALICE} (toi)`);
  await expect(page.locator(`[data-membre="${LEA}"] .reglages-membre-nom`)).toHaveText(LEA);
  await expect(page.locator('.mon-espace-ajout-aide')).toHaveText('La personne doit se connecter avec le compte Google de cette adresse.');
  await page.getByLabel('Adresse Google du nouveau membre').fill('Ingrid.Atamian@gmail.com');
  await page.getByLabel('Rôle du nouveau membre').selectOption('editeur');
  await page.getByRole('button', { name: 'Ajouter un membre' }).click();
  const ligne = page.locator('[data-membre="ingrid.atamian@gmail.com"]');
  await expect(ligne).toBeVisible();
  await expect(ligne.locator('[data-role="role-membre"]')).toHaveValue('editeur');
  expect(await lireDocument('clients/studio/membres/ingrid.atamian@gmail.com')).toEqual({ role: 'editeur' });
  expect((await lireDocument('clients/studio')).equipe).toContainEqual({ email: 'ingrid.atamian@gmail.com', role: 'editeur' });
  await capturer(page, 'M12');
});

test('M13 adresse mal formée, déjà présente ou 21e adresse : un message qui explique le problème, et rien n\'est ajouté', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'refus du serveur : le navigateur note le statut HTTP 4xx dans sa console' });
  await ouvrir(page, 'reglages/membres');
  const ajouter = async (adresse) => {
    await page.getByLabel('Adresse Google du nouveau membre').fill(adresse);
    await page.getByRole('button', { name: 'Ajouter un membre' }).click();
  };
  const erreur = page.locator('[data-role="erreur-membres"]');
  const nombre = async () => (await listerDocuments('clients/studio/membres')).length;
  await ajouter('pas-une-adresse');
  await expect(erreur).toContainText('Cette adresse n’est pas valide');
  await ajouter(LEA);
  await expect(erreur).toHaveText('Cette personne est déjà dans l’espace');
  expect(await nombre()).toBe(2);
  for (let i = 3; i <= 20; i++) await ecrireDocument(`clients/studio/membres/m${i}@exemple.test`, { role: 'lecteur' });
  await ouvrir(page, 'reglages/membres');
  await expect(page.locator('.mon-espace-membre')).toHaveCount(20);
  await ajouter('vingt-et-un@exemple.test');
  await expect(erreur).toHaveText('Limite atteinte : contacte ton administrateur');
  await expect(page.locator('.mon-espace-membre')).toHaveCount(20);
  expect(await nombre()).toBe(20);
  expect(await lireDocument('clients/studio/membres/vingt-et-un@exemple.test')).toBeNull();
  await capturer(page, 'M13');
});

test('M14 changer le rôle d\'un membre : la liste est à jour, et ce membre voit l\'écran avec le droit correspondant à sa prochaine connexion', async ({ page }) => {
  await ouvrir(page, 'reglages/membres');
  await page.locator(`[data-membre="${LEA}"] [data-role="role-membre"]`).selectOption('editeur');
  await expect(toastMessage(page, `${LEA} est maintenant éditeur`)).toBeVisible();
  await expect(page.locator(`[data-membre="${LEA}"] [data-role="role-membre"]`)).toHaveValue('editeur');
  expect(await lireDocument(`clients/studio/membres/${LEA}`)).toEqual({ role: 'editeur', nom: 'Léa' });
  expect((await lireDocument('clients/studio')).equipe).toContainEqual({ email: LEA, role: 'editeur' });
  await capturer(page, 'M14');
  // sa prochaine connexion : elle modifie
  await ouvrir(page, 'reglages', { email: LEA });
  await imageEnAttenteDeVue(page);
  await expect(champ(page, 'nom')).toBeEditable();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
  await expect(page.locator('.reglages-menu-lien[data-reglage="membres"]')).toHaveCount(1);
});

test('M15 retirer un membre (confirmation puis « Retiré · Annuler » 8 s) : il disparaît de la liste ; « Annuler » le fait revenir avec le même rôle et le même nom', async ({ page }) => {
  await ouvrir(page, 'reglages/membres');
  await page.locator(`[data-membre="${LEA}"]`).getByRole('button', { name: /Retirer/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Retirer ce membre ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(page.locator(`[data-membre="${LEA}"]`)).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'Retiré' })).toBeVisible();
  await expect(page.locator('.toast [data-action="toast-action"]')).toHaveText('Annuler');
  expect(await lireDocument(`clients/studio/membres/${LEA}`)).toBeNull();
  expect((await lireDocument('clients/studio')).equipe).toEqual([{ email: ALICE, role: 'editeur' }]);
  await capturer(page, 'M15');
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(page.locator(`[data-membre="${LEA}"]`)).toBeVisible();
  await expect(page.locator(`[data-membre="${LEA}"] [data-role="role-membre"]`)).toHaveValue('lecteur');
  expect(await lireDocument(`clients/studio/membres/${LEA}`)).toEqual({ role: 'lecteur', nom: 'Léa' });
  expect((await lireDocument('clients/studio')).equipe).toContainEqual({ email: LEA, role: 'lecteur' });
});

test('M16 dernier éditeur : se retirer ou se passer en lecteur affiche « Il faut garder au moins un éditeur » et rien ne change, même si la liste affichée est périmée (la simultanéité est testée côté serveur)', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'refus du serveur : le navigateur note le statut HTTP 4xx dans sa console' });
  await ouvrir(page, 'reglages/membres');
  const erreur = page.locator('[data-role="erreur-membres"]');
  await page.locator(`[data-membre="${ALICE}"]`).getByRole('button', { name: /Retirer/ }).click();
  await expect(erreur).toHaveText('Il faut garder au moins un éditeur.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator(`[data-membre="${ALICE}"] [data-role="role-membre"]`).selectOption('lecteur');
  await expect(erreur).toHaveText('Il faut garder au moins un éditeur.');
  await expect(page.locator(`[data-membre="${ALICE}"] [data-role="role-membre"]`)).toHaveValue('editeur');
  // liste périmée : la page croit qu'il y a deux éditeurs, le serveur n'en voit plus qu'un -> le serveur refuse, avec les mêmes mots
  await ecrireDocument(`clients/studio/membres/${LEA}`, { role: 'editeur', nom: 'Léa' });
  await ouvrir(page, 'reglages/membres');
  await ecrireDocument(`clients/studio/membres/${LEA}`, { role: 'lecteur', nom: 'Léa' });
  await page.locator(`[data-membre="${ALICE}"] [data-role="role-membre"]`).selectOption('lecteur');
  // Selon la vitesse de la machine, la page a déjà reçu la nouvelle liste (le refus est alors immédiat) ou non (fenêtre de confirmation, puis refus du serveur) : dans les deux cas, mêmes mots.
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.or(erreur.filter({ hasText: 'Il faut garder au moins un éditeur.' }))).toBeVisible();
  if (await fenetre.count()) {
    await expect(fenetre).toContainText('Tu vas perdre l’accès de ce compte à l’espace');
    await fenetre.getByRole('button', { name: 'Changer mon rôle' }).click();
  }
  await expect(erreur).toHaveText('Il faut garder au moins un éditeur.');
  expect(await lireDocument(`clients/studio/membres/${ALICE}`)).toEqual({ role: 'editeur', nom: 'Alice' });
  expect((await lireDocument('clients/studio')).equipe).toContainEqual({ email: ALICE, role: 'editeur' });
  await capturer(page, 'M16');
});

test('M17 « Modules actifs » (éditeur) : la liste en lecture seule avec « Pour changer de module, contacte ton administrateur », sans bouton ni lien d\'activation', async ({ page }) => {
  await ouvrir(page, 'reglages/modules');
  const zone = page.locator('#reglages-modules');
  await expect(zone).toContainText('Pour changer de module, contacte ton administrateur');
  await expect(zone.locator('[data-interrupteur="crm"]')).toBeChecked();
  await expect(zone.locator('input')).toHaveCount(await zone.locator('input[disabled]').count());
  await expect(zone.locator('button, a[href], [role="button"]')).toHaveCount(0);
  const ecritures = serveur.appels.length;
  await zone.locator('[data-interrupteur="crm"]').click({ force: true });
  expect(serveur.appels.length).toBe(ecritures);
  await capturer(page, 'M17');
});

// ---------------------------------------------------------------- M18 : célébrations

test('M18 « Utiliser le logo de mon espace » : cochée par défaut avec un logo, grisée et décochée sans ; « Gagnée » montre le logo dans l\'animation ; jamais l\'image de Charles chez un client', async ({ page }) => {
  const maintenant = new Date();
  await ecrireDocument('clients/studio/crm_personnes/p1', {
    nom: 'Camille Dubois', prenom: 'Camille', nomFamille: 'Dubois', organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [],
    ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false, proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE,
  });
  const affaire = (id, titre) => ecrireDocument(`clients/studio/crm_affaires/${id}`, {
    titre, personneId: 'p1', organisationId: null, etape: 'etape_3', statut: 'ouverte', priorite: 'tiede', montant: 1200, offreId: null,
    dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: { proposition_envoyee: maintenant }, raisonPerdue: '',
    raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false, proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE,
  });
  await affaire('a1', 'Audit du lac');
  await affaire('a2', 'Audit de la rivière');
  // sans logo : case grisée et décochée
  await ouvrir(page, 'reglages/crm');
  // Allumées par défaut (2.11.8) : on attend que l'écran ait écrit les réglages de départ (il se redessine à ce moment), puis on vérifie la case.
  await expect.poll(async () => (await lireDocument('clients/studio/crm_parametres/reglages'))?.celebrations).toBe(true);
  await expect(page.locator('[data-option="celebrations"]')).toBeChecked();
  const caseLogo = page.locator('[data-option="logoCelebration"]');
  await expect(caseLogo).toBeVisible();
  await expect(caseLogo).toBeDisabled();
  await expect(caseLogo).not.toBeChecked();
  await expect(page.locator('[data-ligne="logoCelebration"]')).toContainText('n’a pas encore de logo');
  await capturer(page, 'M18-sans-logo', { element: page.locator('[data-ligne="logoCelebration"]') });
  // avec un logo : cochée par défaut
  const { url } = await poserLogo(page, { largeur: 180, hauteur: 120, couleur: '#dd5522' });
  await ouvrir(page, 'reglages/crm');
  await expect(page.locator('[data-option="celebrations"]')).toBeChecked();
  await expect(caseLogo).toBeEnabled();
  await expect(caseLogo).toBeChecked();
  await capturer(page, 'M18-case-cochee', { element: page.locator('[data-ligne="celebrations"], [data-ligne="logoCelebration"]').first().locator('xpath=..') });
  // « Gagnée » : le logo de l'espace dans l'animation
  await page.evaluate(() => { location.hash = '#/espace/studio/crm/affaires/a1'; });
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await page.locator('[data-action="gagnee"]').click();
  const animation = page.locator('.celebration');
  await expect(animation).toBeVisible();
  await expect(animation.locator('img')).toHaveAttribute('src', url);
  await expect(animation.locator('img')).toHaveJSProperty('complete', true);
  await page.waitForTimeout(500);
  await capturer(page, 'M18');
  await page.locator('.celebration').click();
  await expect(page.locator('.celebration')).toHaveCount(0);
  // l'image de Charles ne s'affiche jamais chez un client, même si elle se glissait dans les réglages (case « logo » décochée)
  await ecrireDocument('clients/studio/crm_parametres/reglages', { ...(await lireDocument('clients/studio/crm_parametres/reglages')), imageCelebration: 'assets/charles-portrait.png', logoCelebration: false });
  await ouvrir(page, 'crm/affaires/a2');
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit de la rivière');
  await page.locator('[data-action="gagnee"]').click();
  await expect(page.locator('.celebration')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.celebration img')).toHaveCount(0);
  await expect(page.locator('img[src*="charles"]')).toHaveCount(0);
});

// ---------------------------------------------------------------- M19 à M22 : chargement, erreurs, téléphone, vide

test('M19 chargement des réglages : un indicateur pendant le chargement ; en cas d\'échec « Chargement impossible, réessaie » avec « Réessayer »', async ({ page, context }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'réseau coupé exprès' });
  test.setTimeout(150_000);
  await ouvrir(page, 'crm/accueil');
  // 1) réseau lent : l'indicateur de chargement reste affiché le temps de la lecture
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 6000, downloadThroughput: -1, uploadThroughput: -1 });
  await page.evaluate(() => { location.hash = '#/espace/studio/reglages'; });
  await expect(page.locator('[data-etat="chargement"]', { hasText: 'Chargement' }).first()).toBeVisible();
  await capturer(page, 'M19-chargement');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await expect(champ(page, 'nom')).toHaveValue('Studio Lune', { timeout: 60_000 });
  // 2) réseau coupé : « Chargement impossible, réessaie » et « Réessayer »
  await page.evaluate(() => { location.hash = '#/espace/studio/reglages/modules'; });
  await expect(page.locator('#reglages-modules')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/espace/studio/reglages'; });
  const erreur = page.locator('.mon-espace-erreur').first();
  await expect(erreur).toBeVisible({ timeout: 60_000 });
  await expect(erreur).toContainText('Chargement impossible, réessaie');
  await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await expect(champ(page, 'nom')).toHaveCount(0);
  await capturer(page, 'M19');
  await context.setOffline(false);
  await erreur.getByRole('button', { name: 'Réessayer' }).click();
  await expect(champ(page, 'nom')).toHaveValue('Studio Lune', { timeout: 60_000 });
});

test('M20 enregistrement impossible (réseau coupé) : un message qui dit quoi faire, les saisies conservées, rien d\'affiché comme enregistré', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'appel coupé exprès' });
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  serveur.panne = true;
  await champ(page, 'nom').fill('Nom pas encore enregistré');
  await champ(page, 'accueil').fill('Mon texte');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const message = page.locator('[data-role="message-enregistrement"]');
  await expect(message).toContainText('Vérifie ta connexion internet, puis réessaie');
  await expect(message).toContainText('ce que tu as écrit est conservé');
  await expect(message).toHaveAttribute('data-etat', 'erreur');
  await expect(champ(page, 'nom')).toHaveValue('Nom pas encore enregistré');
  await expect(champ(page, 'accueil')).toHaveValue('Mon texte');
  await expect(toastMessage(page, 'Enregistré')).toHaveCount(0);
  await expect(page.locator('.menu-marque')).toContainText('Studio Lune');
  await expect(page.locator('.menu-marque')).not.toContainText('Nom pas encore enregistré');
  await expect(page).toHaveTitle('Studio Lune');
  expect((await marque()).nom).toBe('Studio Lune');
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  await capturer(page, 'M20');
  serveur.panne = false;
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toastMessage(page, 'Enregistré')).toBeVisible();
  expect((await marque()).nom).toBe('Nom pas encore enregistré');
});

test('M21 téléphone (375 px) : tous les champs et boutons sont utilisables sans défilement horizontal, et « Choisir un logo » ouvre la photothèque', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  const sansDefilement = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
  expect(await sansDefilement(), 'Mon espace : pas de défilement horizontal').toBe(true);
  for (const cible of [champ(page, 'nom'), champ(page, 'couleur'), champ(page, 'accueil'), page.getByRole('button', { name: 'Choisir un logo' }), page.getByRole('button', { name: 'Ajouter une image' }), page.getByRole('button', { name: 'Enregistrer' })]) {
    await cible.scrollIntoViewIfNeeded();
    const boite = await cible.boundingBox();
    expect(boite.x, 'dans l\'écran à gauche').toBeGreaterThanOrEqual(0);
    expect(boite.x + boite.width, 'dans l\'écran à droite').toBeLessThanOrEqual(375);
    await expect(cible).toBeEnabled();
  }
  const accept = await page.locator('[data-role="fichier-logo"]').getAttribute('accept');
  expect(accept).toBe('image/png,image/jpeg,image/webp');
  expect(await page.locator('[data-role="fichier-logo"]').getAttribute('capture'), 'pas de « capture » : la photothèque, pas seulement l\'appareil photo').toBeNull();
  const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choisir un logo' }).click()]);
  expect(selecteur.isMultiple()).toBe(false);
  await capturer(page, 'M21');
  await ouvrir(page, 'reglages/membres');
  await expect(page.locator('.mon-espace-membre').first()).toBeVisible();
  expect(await sansDefilement(), 'Membres et rôles : pas de défilement horizontal').toBe(true);
  for (const cible of [page.getByLabel('Adresse Google du nouveau membre'), page.getByLabel('Rôle du nouveau membre'), page.getByRole('button', { name: 'Ajouter un membre' })]) {
    await cible.scrollIntoViewIfNeeded();
    const boite = await cible.boundingBox();
    expect(boite.x + boite.width).toBeLessThanOrEqual(375);
  }
});

test('M22 un espace sans logo, sans image ni texte d\'accueil : « Pas de logo », « Aucune image » et un champ vide avec une aide, sans erreur', async ({ page, erreursConsole }) => {
  await ouvrir(page);
  await imageEnAttenteDeVue(page);
  await expect(page.locator('[data-role="pas-de-logo"]')).toHaveText('Pas de logo');
  await expect(page.locator('[data-role="logo-initiale"]')).toHaveText('S');
  await expect(page.locator('[data-role="aucune-image"]')).toHaveText('Aucune image');
  await expect(champ(page, 'accueil')).toHaveValue('');
  await expect(page.locator('.mon-espace')).toContainText('Tu peux le laisser vide');
  await expect(page.locator('.mon-espace-erreur, [role="alert"]:not([hidden])')).toHaveCount(0);
  expect(erreursConsole).toEqual([]);
  await capturer(page, 'M22');
});

