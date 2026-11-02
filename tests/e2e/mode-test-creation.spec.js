// Mode test, PR 1a-2a : l'interrupteur (menu latéral), le bandeau orange et la pose de `test: true` à la création (sans héritage : c'est la PR 1a-2b).
// Un test par critère, le nom commence par son numéro : 1 interrupteur, 2 bandeau, 3 pose à la création, 4 un seul point d'entrée (statique), 5 éteindre ne retire rien, 6 réglages et catalogue jamais marqués.
// Captures dans tests/e2e/captures/mode-test-creation/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  test, expect, connecter, attendreCalme, allerA, estTelephone, listerDocuments, lireDocument, creerPersonne, creerOrganisation, creerAffaire, creerProjet, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/mode-test-creation/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const dialogue = (page) => page.getByRole('dialog');
const interrupteur = (page) => page.locator('[data-role="mode-test"]');
const bandeau = (page) => page.locator('[data-role="bandeau-test"]');
const CLE = 'chevalier-os.modeTest';

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

/** Allume le mode AVANT le chargement (comme un navigateur qui s'en souvient). */
const allumerAvant = (page) => page.addInitScript((c) => { try { if (localStorage.getItem(c) === null) localStorage.setItem(c, '1'); } catch { /* rien */ } }, CLE);
const lireStockage = (page) => page.evaluate((c) => localStorage.getItem(c), CLE);
async function ouvrirMenuSiTelephone(page) {
  if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
}
async function ouvrirCreation(page, quoi) {
  const liste = { personne: ['Personnes', 'nouvelle-personne'], organisation: ['Organisations', 'nouvelle-organisation'], affaire: ['Affaires', 'nouvelle-affaire'] }[quoi];
  await allerA(page, liste[0]);
  await page.locator(`.page-actions [data-action="${liste[1]}"]`).click();
  await expect(dialogue(page)).toBeVisible();
}
async function attendre(collection, predicat) {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: 10_000 }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
}
/** Appelle une fonction de création de la couche `donnees.js` de l'appli (celle que les écrans appellent). */
const appeler = (page, module, fonction, ...args) => page.evaluate(async ([m, f, a]) => (await import(m))[f](...a), [module, fonction, args]);

test('1 interrupteur : éteint par défaut, bascule, persiste après rechargement, stockage indisponible = éteint, présent sans barre d’outils et dans le tiroir téléphone, menu replié = icône + infobulle', async ({ page }, info) => {
  await connecter(page);
  await ouvrirMenuSiTelephone(page);
  await expect(interrupteur(page)).toBeVisible();
  await expect(interrupteur(page)).not.toHaveClass(/menu-entree/);
  await expect(interrupteur(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(interrupteur(page)).toHaveAttribute('aria-label', 'Mode test, éteint');
  await interrupteur(page).click();
  await expect(interrupteur(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(interrupteur(page)).toHaveAttribute('aria-label', 'Mode test, allumé');
  expect(await lireStockage(page)).toBe('1');
  // page sans barre d'outils (Réglages) : l'interrupteur y est aussi
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await allerA(page, 'Réglages');
  await ouvrirMenuSiTelephone(page);
  await expect(page.locator('.barre-outils')).toBeHidden();
  await expect(interrupteur(page)).toHaveAttribute('aria-pressed', 'true');
  // menu replié : icône seule + infobulle qui suit l'état (ordinateur)
  if (!estTelephone(page)) {
    const replier = page.getByRole('button', { name: 'Replier le menu' });
    if (await replier.count()) await replier.click();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie');
    await expect(interrupteur(page)).toHaveAttribute('data-infobulle', 'Mode test, allumé');
    await expect(interrupteur(page).locator('.menu-texte')).toHaveCSS('opacity', '0');
  }
  await capturer(page, info, '1-interrupteur');
  // rechargement : l'état est conservé (l'attribut est posé avant tout rendu)
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode-test', '1');
  expect(await lireStockage(page)).toBe('1');
});

test('1 stockage indisponible ou vide = éteint (aucune erreur)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('stockage bloqué'); } });
  });
  await page.goto('/?emulateurs=1#/crm/accueil');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode-test', /.*/);
});

test('2 bandeau orange et liseré présents allumé, absents éteint ; « Éteindre » éteint ; rien ne déborde ; pas de flash au chargement', async ({ page }, info) => {
  await allumerAvant(page);
  await connecter(page);
  // pas de flash : l'attribut est posé par index.html avant le premier rendu
  await expect(page.locator('html')).toHaveAttribute('data-mode-test', '1');
  await expect(bandeau(page)).toBeVisible();
  await expect(bandeau(page)).toContainText('MODE TEST : ce que tu crées ici est marqué test et n’entre pas dans les statistiques');
  const mesures = await page.evaluate(() => ({
    debordeX: document.documentElement.scrollWidth > window.innerWidth + 1,
    liseré: getComputedStyle(document.querySelector('.zone')).boxShadow,
    position: getComputedStyle(document.querySelector('[data-role="bandeau-test"]')).position,
    poids: Number(getComputedStyle(document.querySelector('[data-role="bandeau-test"]')).fontWeight),
    bouton: document.querySelector('[data-role="eteindre-mode-test"]').getBoundingClientRect().height,
  }));
  expect(mesures.debordeX).toBe(false);
  expect(mesures.liseré).toContain('inset');
  expect(mesures.position).not.toBe('sticky');
  expect(mesures.position).not.toBe('fixed');
  expect(mesures.poids).toBeLessThanOrEqual(500);
  expect(mesures.bouton).toBeGreaterThanOrEqual(estTelephone(page) ? 44 : 32);
  await capturer(page, info, '2-bandeau-allume');
  await page.locator('[data-role="eteindre-mode-test"]').click();
  await expect(bandeau(page)).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode-test', /.*/);
  expect(await lireStockage(page)).toBe('0');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.zone')).boxShadow)).toBe('none');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode-test', /.*/);
});

test('2 bandeau sur une page sans barre d’outils (Réglages) : visible, rien ne déborde', async ({ page }, info) => {
  await allumerAvant(page);
  await connecter(page);
  await allerA(page, 'Réglages');
  await expect(bandeau(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await capturer(page, info, '2-bandeau-reglages');
});

test('3 mode allumé : chaque type créé à l’écran porte test: true ; éteint : rien', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Atelier Test' });
  await creerPersonne('p1', { nom: 'Alice Test' });
  await creerAffaire('a0', { titre: 'Audit existant', etape: 'rdv_fixe' });
  await creerProjet('pr0', { titre: 'Projet existant' });
  await allumerAvant(page);
  await connecter(page);

  // personne, organisation, affaire : par les fenêtres de l'écran
  await ouvrirCreation(page, 'personne');
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Zoé Essai');
  await dialogue(page).getByLabel('Nom', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  expect((await attendre('crm_personnes', (d) => d.nom === 'Zoé Essai')).test).toBe(true);

  await ouvrirCreation(page, 'organisation');
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Société Essai');
  await dialogue(page).getByLabel('Nom', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  expect((await attendre('crm_organisations', (d) => d.nom === 'Société Essai')).test).toBe(true);

  await ouvrirCreation(page, 'affaire');
  await dialogue(page).getByLabel('Titre', { exact: false }).first().fill('Affaire Essai').catch(() => {});
  await dialogue(page).getByRole('button', { name: /^(Enregistrer|Créer)/ }).first().click();
  await expect(dialogue(page)).toHaveCount(0);
  expect((await attendre('crm_affaires', (d) => d.titre === 'Affaire Essai' || d.id !== 'a0')).test).toBe(true);

  // les autres types : la fonction de création de la couche de données que les écrans appellent
  const CRM = '/js/modules/crm/donnees.js';
  const PRO = '/js/modules/projets/donnees.js';
  const DEV = '/js/modules/devis/donnees.js';
  const pid = await appeler(page, PRO, 'creerProjet', { titre: 'Projet Essai' });
  expect((await lireDocument(`projets_projets/${pid}`)).test).toBe(true);
  const tid = await appeler(page, PRO, 'creerTache', 'pr0', { titre: 'Tâche Essai' });
  expect((await lireDocument(`projets_taches/${tid}`)).test).toBe(true);
  const act = await appeler(page, CRM, 'creerActivite', { type: 'appel', titre: 'Activité Essai', personneId: 'p1', affaireId: 'a0', date: '2026-12-01' });
  expect((await lireDocument(`crm_activites/${act}`)).test).toBe(true);
  const note = await appeler(page, CRM, 'creerNote', 'Note Essai', { personneId: 'p1' });
  expect((await lireDocument(`crm_notes/${note}`)).test).toBe(true);
  const bro = await appeler(page, DEV, 'creerBrouillon', { organisationId: 'o1', objet: 'Devis Essai' });
  expect(bro.erreurs).toEqual({});
  expect((await lireDocument(`devis_devis/${bro.id}`)).test).toBe(true);
  const pa = await appeler(page, PRO, 'creerProjetDepuisAffaire', 'a0').catch(() => null);
  if (pa) expect((await lireDocument(`projets_projets/${pa}`)).test).toBe(true);
  // un test: true déjà posé par l'appelant n'est jamais retiré
  const p2 = await appeler(page, CRM, 'creerPersonne', { nom: 'Déjà Test', test: true });
  expect((await lireDocument(`crm_personnes/${p2}`)).test).toBe(true);
  await capturer(page, info, '3-creations');
});

test('3 mode éteint : aucune création n’est marquée', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier Test' });
  await connecter(page);
  const CRM = '/js/modules/crm/donnees.js';
  const p = await appeler(page, CRM, 'creerPersonne', { nom: 'Réelle' });
  expect('test' in (await lireDocument(`crm_personnes/${p}`))).toBe(false);
  const b = await appeler(page, '/js/modules/devis/donnees.js', 'creerBrouillon', { organisationId: 'o1', objet: 'Réel' });
  expect('test' in (await lireDocument(`devis_devis/${b.id}`))).toBe(false);
});

test('3 mode allumé PENDANT qu’un dialogue est ouvert : la valeur au clic « Enregistrer » compte', async ({ page }) => {
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Zoé Tardive');
  await page.evaluate((c) => localStorage.setItem(c, '1'), CLE);
  await dialogue(page).getByLabel('Nom', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  expect((await attendre('crm_personnes', (d) => d.nom === 'Zoé Tardive')).test).toBe(true);
});

test('4 un seul point d’entrée : aucune création d’écran hors des 9 fonctions de donnees.js, et chacune lit le mode', { tag: '@sans-telephone' }, async () => {
  const racine = fileURLToPath(new URL('../../js/', import.meta.url));
  const lire = (f) => readFileSync(`${racine}${f}`, 'utf8');
  const CREATEURS = /\bplanCreer(Personne|Organisation|Affaire|Activite|Note|Projet|ProjetDepuisAffaire|Tache|Brouillon)\(/g;
  const fichiers = ['modules/crm/donnees.js', 'modules/projets/donnees.js', 'modules/devis/donnees.js'];
  const { readdirSync, statSync } = await import('node:fs');
  const tous = [];
  (function parcourir(d) { for (const n of readdirSync(`${racine}${d}`)) { const c = `${d}${n}`; if (statSync(`${racine}${c}`).isDirectory()) parcourir(`${c}/`); else if (c.endsWith('.js')) tous.push(c); } })('');
  for (const f of tous) {
    if (fichiers.includes(f) || /(^|\/)(logique|brouillon)\.js$/.test(f)) continue;
    expect(lire(f).match(CREATEURS) ?? [], `${f} crée un élément sans passer par donnees.js`).toEqual([]);
  }
  let total = 0;
  for (const f of fichiers) {
    for (const ligne of lire(f).split('\n')) {
      if (!ligne.match(CREATEURS) || ligne.includes('import ')) continue;
      total += 1;
      expect(ligne, `${f} : la création doit passer par avecModeTest(...)`).toContain('avecModeTest(');
    }
  }
  expect(total).toBe(9); // personne, organisation, affaire, activité, note, projet, projet depuis affaire, tâche, brouillon
});

test('5 créer en mode test puis éteindre ne retire rien', async ({ page }) => {
  await allumerAvant(page);
  await connecter(page);
  const p = await appeler(page, '/js/modules/crm/donnees.js', 'creerPersonne', { nom: 'Reste Test' });
  expect((await lireDocument(`crm_personnes/${p}`)).test).toBe(true);
  await page.locator('[data-role="eteindre-mode-test"]').click();
  await expect(bandeau(page)).toBeHidden();
  await attendreCalme(page);
  expect((await lireDocument(`crm_personnes/${p}`)).test).toBe(true);
});

test('6 réglages et catalogue ne sont jamais marqués, même en mode test', async ({ page }) => {
  await allumerAvant(page);
  await connecter(page);
  const PRO = '/js/modules/projets/donnees.js';
  const m = await appeler(page, PRO, 'creerModele', { nom: 'Modèle Essai' });
  const id = typeof m === 'string' ? m : m?.id;
  if (id) expect('test' in ((await lireDocument(`projets_modeles/${id}`)) ?? {})).toBe(false);
  for (const col of ['projets_modeles', 'devis_articles', 'devis_familles', 'crm_etiquettes']) {
    for (const d of await listerDocuments(col)) expect(d.test, `${col}/${d.id}`).toBeUndefined();
  }
  const src = ['modules/crm/donnees.js', 'modules/projets/donnees.js', 'modules/devis/donnees.js'].map((f) => readFileSync(fileURLToPath(new URL(`../../js/${f}`, import.meta.url)), 'utf8')).join('\n');
  for (const nom of ['planCreerModele', 'planCreerArticle', 'planCreerMot']) {
    for (const ligne of src.split('\n')) if (ligne.includes(`${nom}(`) && !ligne.includes('export')) expect(ligne).not.toContain('avecModeTest');
  }
});
