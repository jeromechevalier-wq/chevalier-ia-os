// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js, js/os/village-ecran.js, js/main.js).
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village/ (nommée avec le projet : ordinateur ou téléphone).
// Même méthode que tests/e2e/maison-modules.spec.js : la fiche `ecran` est réécrite dans l'émulateur avant la connexion. Données d'exemple neutres.
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé de la maison. Logique sans navigateur : tests/maison-village.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, estTelephone, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-village/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const TROIS = [
  FACTURES,
  { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'entrepot', cible: '#/tableauachats/tableau' },
  { nom: 'Chantiers', phrase: 'Suivre les dépenses de mes chantiers', batiment: 'atelier', cible: '#/achatschantiers/liste' },
];
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });

/** Connexion sur une adresse vide (#/) : la maison choisit elle-même son accueil. */
async function ouvrir(page, email = CHARLES) {
  await connecter(page, email, { attendreAccueil: false, route: '' });
  await expect(page.locator('.coquille')).toBeVisible();
}
const batiments = (page) => page.locator('[data-role="village"] [data-role="batiment"]');

test.describe('accueil village d’une maison', () => {
  test('V11 un seul besoin : l’adresse vide ouvre le village (#/accueil), un bâtiment avec son nom et sa phrase, rien d’autre (ni journal, ni carrés)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(batiments(page)).toHaveCount(1);
    const b = batiments(page).first();
    await expect(b).toHaveAttribute('aria-label', 'Factures : Valider mes factures fournisseurs');
    await expect(b.locator('[data-role="batiment-nom"]')).toHaveText('Factures');
    await expect(b.locator('[data-role="batiment-phrase"]')).toHaveText(['Valider mes factures', 'fournisseurs']);
    await expect(b).toBeVisible();
    // le contenu de l'accueil n'est que le dessin
    const enfants = await page.locator('#contenu > *').evaluateAll((els) => els.map((e) => e.dataset.role));
    expect(enfants).toEqual(['page-village']);
    await expect(page.locator('.grille-objectifs, .journal, [data-role="page-introuvable"]')).toHaveCount(0);
    await expect(page.locator('.barre-outils')).toBeHidden(); // ni recherche ni « + » sur l'accueil
    // phrase lisible : au moins 11 px à l'écran
    const taille = await b.locator('[data-role="batiment-phrase"]').first().evaluate((t) => t.getBoundingClientRect().height);
    expect(taille).toBeGreaterThanOrEqual(11);
    await capturer(page, info, 'V11-un-besoin');
  });

  test('V12 un clic sur le bâtiment ouvre sa cible (le module des factures d’achat) ; le logo ramène au village', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await batiments(page).first().click();
    await expect(page).toHaveURL(/#\/achatsfactures\/liste$/);
    await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
    await capturer(page, info, 'V12-clic-factures');
    if (estTelephone(page)) await page.locator('.barre-haut-marque').click();
    else await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(batiments(page)).toHaveCount(1);
  });

  test('V13 au clavier : Tab amène sur le bâtiment, Entrée ouvre sa cible', async ({ page }, info) => {
    test.skip(estTelephone(page), 'clavier : parcours de l’ordinateur');
    await semer({ besoins: TROIS });
    await ouvrir(page);
    const deuxieme = batiments(page).filter({ has: page.locator('[data-role="batiment-nom"]', { hasText: 'Achats' }) });
    await deuxieme.focus();
    await expect(deuxieme).toBeFocused();
    await capturer(page, info, 'V13-focus-clavier');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/tableauachats\/tableau$/);
  });

  test('V14 trois besoins (plus un quatrième et des entrées mal formées, ignorés) : trois bâtiments côte à côte, serrés, sans grand vide', async ({ page }, info) => {
    await semer({ besoins: [{ nom: 'Piège', cible: 'javascript:alert(1)' }, 'texte seul', ...TROIS, { nom: 'Quatrième', phrase: 'En trop', cible: '#/achatsfournisseurs/liste' }] });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(3);
    await expect(batiments(page).locator('[data-role="batiment-nom"]')).toHaveText(['Factures', 'Achats', 'Chantiers']);
    await expect(page.locator('[data-role="village"]')).toHaveAttribute('data-disposition', estTelephone(page) ? 'colonne' : 'ligne');
    await expect(page.getByText('Piège')).toHaveCount(0);
    await expect(page.getByText('Quatrième')).toHaveCount(0);
    // zoom : les bâtiments occupent l'essentiel de la largeur (ordinateur) ou de la hauteur (téléphone) du dessin
    const r = await page.evaluate(() => {
      const svg = document.querySelector('[data-role="village"]').getBoundingClientRect();
      const bs = [...document.querySelectorAll('[data-role="batiment"]')].map((b) => b.getBoundingClientRect());
      const g = Math.min(...bs.map((b) => b.left)); const d = Math.max(...bs.map((b) => b.right));
      const h = Math.min(...bs.map((b) => b.top)); const bas = Math.max(...bs.map((b) => b.bottom));
      return { largeur: (d - g) / svg.width, hauteur: (bas - h) / svg.height, defile: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(Math.max(r.largeur, r.hauteur)).toBeGreaterThan(0.8);
    expect(r.defile).toBe(false);
    await capturer(page, info, 'V14-trois-besoins');
  });

  test('V15a sans `besoins` (maison des parcours, comme chez Jérôme) : l’accueil d’avant ne change pas', async ({ page }, info) => {
    await connecter(page, undefined, { attendreAccueil: false, route: '' }); // ECRAN_PARCOURS : sans besoins
    await expect(page).not.toHaveURL(/#\/accueil$/); // adresse vide : l'accueil d'avant (crm/accueil), comme avant cette PR
    await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
    await expect(page.locator('[data-role="village"]')).toHaveCount(0);
    await capturer(page, info, 'V15a-sans-besoins-accueil-davant');
  });

  test('V15b besoins tous refusés (liens externes) : pas de village, l’accueil d’avant de la maison reste', async ({ page }, info) => {
    await semer({ besoins: [{ nom: 'Piège', phrase: 'lien externe', cible: 'https://exemple.test' }, { nom: 'Piège 2', cible: '//exemple.test' }] });
    await ouvrir(page);
    await expect(page).toHaveURL(/#\/achatsfactures\/liste$/); // réglage `modules` : son premier écran, comme avant
    await expect(page.locator('[data-role="village"]')).toHaveCount(0);
    await expect(page.getByText('Piège')).toHaveCount(0);
    await capturer(page, info, 'V15b-besoins-refuses-accueil-davant');
  });

  test('V16 téléphone : les bâtiments sont l’un sous l’autre, tous visibles sans défilement horizontal, et un toucher ouvre la cible', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au format téléphone');
    await semer({ besoins: TROIS });
    await ouvrir(page);
    await expect(page.locator('[data-role="village"]')).toHaveAttribute('data-disposition', 'colonne');
    const boites = await batiments(page).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom }; }));
    const larg = await page.evaluate(() => window.innerWidth);
    for (const b of boites) { expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(larg); }
    const tops = boites.map((b) => b.top).sort((a, b) => a - b);
    expect(tops[2] - tops[0]).toBeGreaterThan(150); // vraiment l'un sous l'autre
    await capturer(page, info, 'V16-telephone-colonne');
    await batiments(page).filter({ has: page.locator('[data-role="batiment-nom"]', { hasText: 'Chantiers' }) }).click();
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
  });
});
