// Recherche du haut : chaque résultat est un vrai lien (clic droit « Ouvrir dans un nouvel onglet », Cmd/Ctrl+clic, clic molette).
// Un test par critère (le nom commence par son numéro). Captures (données fictives) dans tests/e2e/captures/recherche-resultats-liens/.
// 1 chaque résultat est un <a href="#/…"> vers la bonne fiche ; clic simple, flèches + Entrée, aria-activedescendant : comme avant ;
// 2 Cmd/Ctrl+clic et clic molette ouvrent un nouvel onglet SANS effacer la recherche ni changer la page ;
// 3 tous les modules qui répondent (Personnes, Organisations, Affaires, Projets, Devis) donnent des liens ;
// 4 l'option « Créer … » d'un autre champ reste un bouton (pas de lien) ;
// 5 le rôle ARIA reste valide (liste, options) et le lien garde l'aspect d'une ligne (couleur héritée, pas de soulignement, 44 px au toucher) ;
// 6 cas vide : aucun résultat, aucune liste, aucun lien ; 7 cas d'erreur : un module qui échoue ne coupe pas la recherche des autres.
import {
  test, expect, connecter, ecrireDocument, creerPersonne, creerOrganisation, creerAffaire, creerProjet, estTelephone, JEROME,
} from './outils.js';

const CAPTURES = 'e2e/captures/recherche-resultats-liens';
const capture = (page, nom, cible) => cible.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const liste = (page) => page.locator('ul.suggestions[aria-label="Suggestions : Rechercher"]');

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: [], objet: '', sections: [], notesBasDePage: '',
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function semer() {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence', ville: 'Manosque' });
  await creerPersonne('p1', { nom: 'Marie Durand', organisationId: 'o1', emails: [{ valeur: 'marie@fleurs.fr', type: 'travail' }] });
  await creerPersonne('p2', { nom: 'Marc Dupont' });
  await creerAffaire('a1', { titre: 'Atelier pour Marie', personneId: 'p1', organisationId: 'o1' });
  await creerProjet('pr1', { titre: 'Chantier Marie', personneId: 'p1', organisationId: 'o1' });
  await devis('d1', { numero: 'DEV-2026-10-26-001', statut: 'envoye' });
}
async function champ(page) {
  if (estTelephone(page)) await page.getByRole('button', { name: 'Rechercher' }).click();
  return page.locator('[data-role="recherche-globale"]');
}
const lienDe = (page, texte) => liste(page).locator('a.suggestion').filter({ has: page.locator('.suggestion-libelle', { hasText: new RegExp(`^${texte}$`) }) });

test('1 chaque résultat est un vrai lien vers la bonne fiche ; clic simple, flèches + Entrée et aria-activedescendant comme avant', async ({ page }) => {
  await semer();
  await connecter(page);
  const c = await champ(page);
  await c.fill('marie');
  await expect(liste(page).locator('a.suggestion')).not.toHaveCount(0);
  await expect(lienDe(page, 'Marie Durand')).toHaveAttribute('href', /#\/crm\/personnes\/p1$/);
  await expect(lienDe(page, 'Atelier pour Marie')).toHaveAttribute('href', /#\/crm\/affaires\/a1$/);
  await expect(liste(page).locator('li.suggestion')).toHaveCount(0); // aucun résultat sans lien
  await capture(page, '1-resultats-liens', liste(page));
  // Flèches + Entrée : l'option active est le lien, l'Entrée ouvre sa fiche.
  await c.press('ArrowDown');
  const actif = await c.getAttribute('aria-activedescendant');
  expect(actif).toBeTruthy();
  const option = page.locator(`[id="${actif}"]`);
  await expect(option).toHaveClass(/actif/);
  await expect(option).toHaveAttribute('aria-selected', 'true');
  const cible = await option.getAttribute('href');
  expect(cible).toMatch(/^#\/crm\//);
  await c.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${cible.replace(/[#/]/g, (x) => `\\${x}`)}$`));
  await expect(c).toHaveValue('');
  await expect(liste(page)).toBeHidden();
  // Clic simple : même chose (adresse de la fiche, champ effacé, liste fermée).
  const c2 = await champ(page);
  await c2.fill('atelier');
  await lienDe(page, 'Atelier pour Marie').click();
  await expect(page).toHaveURL(/#\/crm\/affaires\/a1$/);
  await expect(c2).toHaveValue('');
  await expect(liste(page)).toBeHidden();
});

test('2 Cmd/Ctrl+clic et clic molette ouvrent un nouvel onglet sans effacer la recherche ni quitter la page', async ({ page, context }) => {
  await semer();
  await connecter(page);
  const c = await champ(page);
  await c.fill('marie');
  const urlAvant = page.url();
  const fiche = lienDe(page, 'Marie Durand');
  for (const geste of [{ modifiers: ['ControlOrMeta'] }, { button: 'middle' }]) {
    const [onglet] = await Promise.all([context.waitForEvent('page'), fiche.click(geste)]);
    await onglet.bringToFront();
    await expect.poll(() => onglet.url()).toMatch(/#\/crm\/personnes\/p1$/);
    await onglet.close();
    await page.bringToFront();
    expect(page.url()).toBe(urlAvant);
    await expect(c).toHaveValue('marie');
    await expect(liste(page)).toBeVisible();
    await expect(fiche).toBeVisible();
  }
  await capture(page, '2-recherche-gardee', liste(page));
});

test('3 les modules qui répondent (Personnes, Organisations, Affaires, Projets, Devis) donnent tous des liens', async ({ page }) => {
  await semer();
  await connecter(page);
  const c = await champ(page);
  await c.fill('provence');
  await expect(lienDe(page, 'Fleurs de Provence')).toHaveAttribute('href', /#\/crm\/organisations\/o1$/);
  await c.fill('chantier');
  await expect(lienDe(page, 'Chantier Marie')).toHaveAttribute('href', /#\/projets\/projets\/pr1$/);
  await c.fill('DEV-2026');
  await expect(lienDe(page, 'DEV-2026-10-26-001')).toHaveAttribute('href', /#\/devis\/voir\/d1$/);
  await c.fill('marie');
  await expect(liste(page).locator('.suggestion-groupe')).toHaveText(['Personnes', 'Affaires', 'Projets', 'Devis']);
  const nbOptions = await liste(page).locator('[role="option"]').count();
  await expect(liste(page).locator('a.suggestion[href^="#/"]')).toHaveCount(nbOptions); // aucun résultat sans lien
  await capture(page, '3-tous-les-modules', liste(page));
});

test('4 l’option « Créer … » d’un autre champ reste un bouton, pas un lien', async ({ page }) => {
  await semer();
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/crm/personnes'; });
  await page.locator('[data-action="nouvelle-personne"]').first().click();
  const dialogue = page.getByRole('dialog');
  const champOrg = dialogue.getByRole('combobox', { name: 'Organisation' });
  await champOrg.fill('Nouvelle Coop');
  const creer = dialogue.locator('.suggestion-creer');
  await expect(creer).toHaveCount(1);
  expect(await creer.evaluate((n) => n.tagName)).toBe('LI');
  await expect(dialogue.locator('ul.suggestions a')).toHaveCount(0);
  await capture(page, '4-creer-reste-bouton', dialogue.locator('ul.suggestions[aria-label="Suggestions : Organisation"]'));
});

test('5 le rôle ARIA reste valide et le lien garde l’aspect d’une ligne (couleur héritée, sans soulignement, 44 px au toucher)', async ({ page }) => {
  await semer();
  await connecter(page);
  const c = await champ(page);
  await c.fill('marie');
  await expect(lienDe(page, 'Marie Durand')).toBeVisible();
  const r = await liste(page).evaluate((ul) => {
    const options = [...ul.querySelectorAll('[role="option"]')];
    const a = ul.querySelector('a.suggestion');
    const cs = getComputedStyle(a);
    return {
      role: ul.getAttribute('role'),
      enfants: [...ul.children].map((e) => `${e.tagName}:${e.getAttribute('role') || ''}`),
      options: options.length,
      optionsAvecEnfantInteractif: options.filter((o) => o.querySelector('a, button, input')).length,
      parentsValides: options.every((o) => o.parentElement.tagName === 'LI' && o.parentElement.getAttribute('role') === 'presentation' && o.parentElement.parentElement === ul),
      ids: new Set(options.map((o) => o.id)).size === options.length && options.every((o) => o.id),
      couleur: cs.color, couleurParent: getComputedStyle(a.parentElement).color,
      soulignement: cs.textDecorationLine, hauteur: a.getBoundingClientRect().height, tabindex: a.getAttribute('tabindex'),
    };
  });
  expect(r.role).toBe('listbox');
  expect(r.options).toBeGreaterThan(1);
  expect(r.optionsAvecEnfantInteractif).toBe(0);
  expect(r.parentsValides).toBe(true);
  expect(r.ids).toBe(true);
  expect(r.enfants.every((e) => /^LI:(presentation)?$/.test(e))).toBe(true);
  expect(r.couleur).toBe(r.couleurParent);
  expect(r.soulignement).toBe('none');
  expect(r.tabindex).toBe('-1'); // le champ garde le focus : Tab ne s'arrête pas sur chaque résultat
  expect(r.hauteur).toBeGreaterThanOrEqual(estTelephone(page) ? 44 : 36);
  await expect(page.getByRole('option', { name: /^Marie Durand/ })).toBeVisible();
  await capture(page, '5-aspect-inchange', liste(page));
});

test('6 cas vide : aucun résultat, aucune liste ni lien ; une lettre seulement ne propose rien', async ({ page }) => {
  await semer();
  await connecter(page);
  const c = await champ(page);
  await c.fill('m');
  await expect(liste(page)).toBeHidden();
  await c.fill('zzzzzz');
  await expect(liste(page)).toBeHidden();
  await expect(liste(page).locator('a')).toHaveCount(0);
  await expect(c).toHaveAttribute('aria-expanded', 'false');
  await capture(page, '6-cas-vide', page.locator('.barre-outils'));
});

test('7 cas d’erreur : un module qui échoue ne coupe pas la recherche des autres', async ({ page }) => {
  await semer();
  // Une personne aux données abîmées : si le module des personnes échoue, les autres modules répondent quand même.
  await ecrireDocument('crm_personnes/p9', { nom: 'Mario Cassé', emails: 'pas-une-liste', telephones: 12, organisationId: 'fantome', archive: false, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date() });
  const echecs = [];
  page.on('console', (m) => { if (m.text().includes('Recherche : un module a échoué')) echecs.push(m.text()); });
  await connecter(page);
  const c = await champ(page);
  await c.fill('mar');
  await expect(lienDe(page, 'Chantier Marie')).toHaveAttribute('href', /#\/projets\/projets\/pr1$/);
  await expect(liste(page).locator('a.suggestion[href^="#/"]').first()).toBeVisible();
  expect(echecs.length).toBeGreaterThan(0); // le module des personnes a bien échoué (et la barre a continué)
  await capture(page, '7-module-en-echec', liste(page));
});
