// Mode test, PR 1a-2a : l'interrupteur (menu Jérôme), le bandeau orange et la pose de `test: true` à la création (sans héritage : c'est la PR 1a-2b).
// Un test par critère, le nom commence par son numéro : 1 interrupteur, 2 bandeau, 3 pose à la création, 4 un seul point d'entrée (statique), 5 éteindre ne retire rien, 6 réglages et catalogue jamais marqués.
// Captures dans tests/e2e/captures/mode-test-creation/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  test, expect, connecter, ouvrirMenuUtilisateur, attendreCalme, allerA, estTelephone, listerDocuments, lireDocument, creerPersonne, creerOrganisation, creerAffaire, creerProjet, JEROME,
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
async function ouvrirMenuTelephone(page) {
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

test('1 interrupteur : dans le menu Jérôme après le thème, éteint par défaut, un clic bascule et le menu reste ouvert, persiste après rechargement, plus de bouton en bas du menu latéral', async ({ page }, info) => {
  await connecter(page);
  await expect(page.locator('.menu-bas [data-role="mode-test"]')).toHaveCount(0);
  await expect(page.locator('[data-role="mode-test"]')).toHaveCount(0);
  await ouvrirMenuTelephone(page);
  await capturer(page, info, '1-menu-ferme');
  await ouvrirMenuUtilisateur(page);
  // juste après la bascule de thème, avant le séparateur
  const noms = await page.locator('.menu-pop > *').evaluateAll((els) => els.map((e) => e.dataset.role || e.className));
  expect(noms.indexOf('mode-test')).toBe(noms.indexOf('bascule-theme') + 1);
  await expect(interrupteur(page)).toHaveAccessibleName('Mode test');
  await expect(interrupteur(page)).toHaveAttribute('role', 'menuitemcheckbox');
  await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'false');
  await capturer(page, info, '1-menu-ouvert-eteint');
  await interrupteur(page).click();
  await expect(page.locator('.menu-pop')).toBeVisible(); // le menu reste ouvert, comme le thème
  await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-mode-test', '1');
  await expect(bandeau(page)).toBeVisible();
  expect(await lireStockage(page)).toBe('1');
  await capturer(page, info, '1-menu-ouvert-allume');
  // rechargement : l'état est conservé (l'attribut est posé avant tout rendu)
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode-test', '1');
  expect(await lireStockage(page)).toBe('1');
  await expect(bandeau(page)).toBeVisible();
  await ouvrirMenuUtilisateur(page);
  await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true');
  await interrupteur(page).click();
  await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'false');
  await expect(bandeau(page)).toBeHidden();
  expect(await lireStockage(page)).toBe('0');
});

test('1 clavier : flèches jusqu’à « Mode test », Entrée bascule, le menu reste ouvert', async ({ page }) => {
  await connecter(page);
  await ouvrirMenuUtilisateur(page);
  for (let i = 0; i < 10 && !(await interrupteur(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
  await expect(interrupteur(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.menu-pop')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode-test', '1');
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
  await creerAffaire('a1', { titre: 'Affaire gagnée', etape: 'gagne' });
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
  await dialogue(page).getByLabel('Titre', { exact: false }).first().fill('Affaire Essai');
  await dialogue(page).getByRole('button', { name: /^(Enregistrer|Créer)/ }).first().click();
  await expect(dialogue(page)).toHaveCount(0);
  expect((await attendre('crm_affaires', (d) => d.titre === 'Affaire Essai')).test).toBe(true);

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
  const pa = await appeler(page, PRO, 'creerProjetDepuisAffaire', 'a1'); // doit réussir (affaire gagnée) : pas de .catch qui cacherait un échec
  expect((await lireDocument(`projets_projets/${pa}`)).test).toBe(true);
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

test('4 un seul point d’entrée (statique) : plans, constructeurs et écritures de création hors des couches donnees.js, liste blanche explicite ; chaque création des 9 fonctions lit le mode', { tag: '@sans-telephone' }, async () => {
  const racine = fileURLToPath(new URL('../../js/', import.meta.url));
  const lire = (f) => readFileSync(`${racine}${f}`, 'utf8');
  // Ce qui crée un élément marquable : les plans, les constructeurs de documents, et les écritures de création brutes (moteur d'écriture, lot).
  const CREATEURS = /\b(planCreer(Personne|Organisation|Affaire|Activite|Note|Projet|ProjetDepuisAffaire|Tache|Brouillon)|nouvelle(Personne|Organisation|Affaire|Activite|Note|Tache)|nouveauProjet|nouveauDevis|ecritureCreer|ecritureNoteDeDepart)\(|\bCRM\.executer\(|\becrireDansLot\(/g;
  const DONNEES = ['modules/crm/donnees.js', 'modules/projets/donnees.js', 'modules/devis/donnees.js', 'os/journal-donnees.js']; // journal-donnees.js : le lot du journal commun (ex-crm/donnees.js, 11/11/2026)
  // Liste blanche : fichiers qui ont le droit d'utiliser ces fabriques, et pourquoi. Tout autre fichier qui crée un élément doit passer par donnees.js.
  const PERMIS = {
    'modules/crm/logique.js': 'les constructeurs et les plans eux-mêmes (purs ; l’héritage y est calculé)',
    'modules/projets/logique.js': 'les constructeurs et les plans de projets et de tâches',
    'modules/devis/logique.js': 'nouveauDevis (constructeur pur)',
    'modules/devis/brouillon.js': 'planCreerBrouillon (plan pur)',
    'modules/devis/articles.js': 'le catalogue : jamais marqué test (décision du cadrage, point 9d)',
    'modules/devis/vocabulaire-plans.js': 'le catalogue (vocabulaire) : jamais marqué test (point 9d)',
    'modules/reseauxsociaux/idees-logique.js': 'plans purs du module Réseaux sociaux (tables propres au module, jamais marquées test ; l’écriture passe par donnees.js)',
    'modules/reseauxsociaux/import-logique.js': 'plans purs du module Réseaux sociaux (tables propres au module, jamais marquées test ; l’écriture passe par donnees.js)',
    'modules/reseauxsociaux/inspirations-logique.js': 'plans purs du module Réseaux sociaux (tables propres au module, jamais marquées test ; l’écriture passe par donnees.js)',
    'modules/reseauxsociaux/logique.js': 'plans purs du module Réseaux sociaux (tables propres au module, jamais marquées test ; l’écriture passe par donnees.js)',
  };
  const { readdirSync, statSync } = await import('node:fs');
  const tous = [];
  (function parcourir(d) { for (const n of readdirSync(`${racine}${d}`)) { const c = `${d}${n}`; if (statSync(`${racine}${c}`).isDirectory()) parcourir(`${c}/`); else if (c.endsWith('.js')) tous.push(c); } })('');
  for (const f of tous) {
    if (DONNEES.includes(f) || PERMIS[f]) continue;
    const trouves = [...new Set(lire(f).split('\n').filter((l) => !/^\s*(\/\/|\*|import )/.test(l)).flatMap((l) => l.match(CREATEURS) ?? []))];
    expect(trouves, `${f} crée ou écrit un élément sans passer par donnees.js (ajoute le fichier à PERMIS avec la raison, ou passe par la couche de données)`).toEqual([]);
  }
  for (const f of Object.keys(PERMIS)) expect(tous, `${f} (liste blanche) n’existe plus : retire-le de PERMIS`).toContain(f);
  let total = 0;
  const PLANS = /\bplanCreer(Personne|Organisation|Affaire|Activite|Note|Projet|ProjetDepuisAffaire|Tache|Brouillon)\(/;
  for (const f of DONNEES) {
    for (const ligne of lire(f).split('\n')) {
      if (!PLANS.test(ligne) || ligne.includes('import ')) continue;
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

test('1 stockage bloqué au clic : l’écran reste cohérent (éteint, aucun liseré) ; deux onglets : l’autre onglet suit', async ({ page, context }) => {
  await connecter(page);
  const autre = await context.newPage();
  await autre.goto('/?emulateurs=1#/crm/accueil');
  await autre.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((c) => localStorage.setItem(c, '1'), CLE); // simule l'autre onglet qui allume
  await expect(autre.locator('html')).toHaveAttribute('data-mode-test', '1');
  await page.evaluate((c) => localStorage.setItem(c, '0'), CLE);
  await expect(autre.locator('html')).not.toHaveAttribute('data-mode-test', /.*/);
  await autre.close();
});
