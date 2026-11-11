// Module Réseaux sociaux, écran « Relations » (nuit du 11/11/2026), chez Jérôme (racine, Affaires actif). Un test par critère du cahier (F1 à F7), nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-relations/ (« -telephone » sur téléphone). Données fictives uniquement.
// Le même écran chez un client sans Affaires : tests/e2e/reseauxsociaux-relations-client.spec.js. Les règles pures : tests/reseauxsociaux-relations.test.js.
import { test, expect, connecter, creerPersonne, creerActivite, ecrireDocument, lireDocument, listerDocuments, jour, estTelephone, attendreCalme, FIRESTORE, PROJET } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-relations';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

/** Un échange LinkedIn fait, il y a `n` jours (jour de Paris). `dateFait` = maintenant : comme après un import, il ne doit jamais servir au calcul. */
const echange = (id, personneId, n, extra = {}) => creerActivite(id, { type: 'linkedin', titre: 'Échange LinkedIn', fait: true, date: jour(-n), dateFait: new Date(), personneId, sens: 'envoye', voix: 1, ...extra });

/** Six personnes fictives : une par ligne de la table des règles, plus une sans aucune activité. */
async function jeuDeSix() {
  await creerPersonne('rel-1', { nom: 'Alice Exemple' }); // rendez-vous à venir
  await creerPersonne('rel-2', { nom: 'Bastien Exemple' }); // seulement un échange pas encore fait
  await creerPersonne('rel-3', { nom: 'Chloé Exemple' }); // les deux ont écrit
  await creerPersonne('rel-4', { nom: 'David Exemple' }); // message reçu sans réponse
  await creerPersonne('rel-5', { nom: 'Emma Exemple' }); // un seul message envoyé, il y a 9 jours
  await creerPersonne('rel-6', { nom: 'Farid Exemple', etiquettes: ['partenaire'] }); // aucune activité, étiquette Partenaire
  await echange('rel-a1', 'rel-1', 3);
  await creerActivite('rel-r1', { type: 'rendez_vous', titre: 'Rendez-vous', date: jour(2), fait: false, personneId: 'rel-1' });
  await echange('rel-a2', 'rel-2', 3, { fait: false });
  await echange('rel-a3', 'rel-3', 4, { voix: 2 });
  await echange('rel-a4', 'rel-4', 2, { sens: 'recu' });
  await echange('rel-a5', 'rel-5', 9);
}

async function ouvrir(page) {
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/relations'; });
  await expect(page.getByRole('heading', { name: 'Relations', level: 1 })).toBeVisible();
  await attendreCalme(page);
}
const carte = (page, id) => page.locator(`.carte-relation[data-personne="${id}"]`);
const colonne = (page, id) => page.locator(`.kanban-relations [data-colonne="${id}"]`);
const noms = (page, id) => colonne(page, id).locator('.carte-relation .carte-nom').allTextContents();
const poserFiltres = async (page, action) => {
  await page.locator('[data-action="filtres"]').click();
  await action(page.locator('.voile-dialogue'));
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Appliquer' }).click();
};

test('F1 six personnes fictives : chacune dans la bonne colonne, le compte d’en-tête vaut le nombre de cartes ; quatre colonnes', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  await expect(page.locator('.kanban-relations [data-colonne]')).toHaveCount(4);
  await expect(page.locator('.kanban-relations h2')).toHaveText(['À écrire', 'En attente', 'En échange', 'Rendez-vous']);
  expect(await noms(page, 'a_ecrire')).toEqual(['David Exemple', 'Bastien Exemple', 'Farid Exemple']); // le badge d'abord, puis l'ordre alphabétique
  expect(await noms(page, 'en_attente')).toEqual(['Emma Exemple']);
  expect(await noms(page, 'en_echange')).toEqual(['Chloé Exemple']);
  expect(await noms(page, 'rendez_vous')).toEqual(['Alice Exemple']);
  for (const [id, texte] of [['a_ecrire', '3 relations'], ['en_attente', '1 relation'], ['en_echange', '1 relation'], ['rendez_vous', '1 relation']]) {
    await expect(colonne(page, id).locator('.colonne-totaux')).toHaveText(texte);
    expect(await colonne(page, id).locator('.carte-relation').count()).toBe(Number(texte[0]));
  }
  await expect(page.locator('.compteur-liste')).toHaveText('6 relations');
  await expect(page.locator('.bouton-principal')).toHaveCount(1); // un seul bouton jaune : « + Relation »
  await capture(page, 'F1-colonnes');
});

test('F1 la vue Liste montre les mêmes personnes avec leur étape ; le choix de vue est gardé', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  await page.locator('[data-vue="liste"]').click();
  await expect(page.locator('.tableau-relations tbody tr')).toHaveCount(6);
  await expect(page.locator('.tableau-relations tr[data-personne="rel-5"]')).toContainText('En attente');
  await expect(page.locator('.tableau-relations tr[data-personne="rel-5"]')).toContainText('À relancer · 9 j');
  await expect(page.locator('.tableau-relations tr[data-personne="rel-6"]')).toContainText('Partenaire');
  await expect(page.locator('.kanban-relations')).toHaveCount(0);
  await capture(page, 'F1-liste');
  await page.reload();
  await expect(page.locator('.tableau-relations')).toBeVisible(); // la vue Liste est gardée sur l'appareil
  await page.locator('[data-vue="kanban"]').click();
  await expect(page.locator('.kanban-relations')).toBeVisible();
});

test('F2 « À relancer · 9 j » en rouge pour un seul message envoyé il y a 9 jours, absent à 6 jours, absent avec deux messages envoyés ; « À répondre » pour un message reçu', async ({ page }) => {
  await jeuDeSix();
  await creerPersonne('rel-7', { nom: 'Gaëlle Exemple', etiquettes: ['partenaire'] });
  await echange('rel-a7', 'rel-7', 6); // six jours : pas encore
  await creerPersonne('rel-8', { nom: 'Hugo Exemple', etiquettes: ['partenaire'] });
  await echange('rel-a8', 'rel-8', 20); await echange('rel-a8b', 'rel-8', 9); // deux messages envoyés : on laisse respirer
  await ouvrir(page);
  const relance = carte(page, 'rel-5').locator('[data-badge="relancer"]');
  await expect(relance).toHaveText('À relancer · 9 j');
  await expect(relance).toHaveClass(/badge-retard/);
  const couleur = await relance.evaluate((el) => getComputedStyle(el).color);
  expect(couleur).not.toBe(await carte(page, 'rel-5').locator('.carte-nom').evaluate((el) => getComputedStyle(el).color)); // rouge du thème, pas le texte courant
  await expect(carte(page, 'rel-7').locator('[data-badge]')).toHaveCount(0);
  await expect(carte(page, 'rel-8').locator('[data-badge]')).toHaveCount(0);
  await expect(carte(page, 'rel-4').locator('[data-badge="repondre"]')).toHaveText('À répondre');
  await expect(carte(page, 'rel-4').locator('[data-badge="repondre"]')).not.toHaveClass(/badge-retard/);
  await expect(carte(page, 'rel-3').locator('[data-badge]')).toHaveCount(0);
  await capture(page, 'F2-badges');
});

test('F3 les cartes ne sont pas déplaçables ; cliquer le nom ouvre la fiche de la personne', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  await expect(page.locator('.carte-relation[draggable]')).toHaveCount(0);
  await expect(colonne(page, 'en_attente')).not.toHaveAttribute('ondrop', /.*/);
  const apres = await page.evaluate(() => { const c = document.querySelector('.carte-relation[data-personne="rel-5"]'); return { drag: c.draggable, colonne: c.closest('[data-colonne]').dataset.colonne }; });
  expect(apres).toEqual({ drag: false, colonne: 'en_attente' });
  await capture(page, 'F3-cartes');
  const lien = carte(page, 'rel-5').locator('a.carte-nom');
  await expect(lien).toHaveAttribute('href', /#\/crm\/personnes\/rel-5$/);
  await lien.click();
  await expect(page).toHaveURL(/#\/crm\/personnes\/rel-5$/);
});

test('F4 le filtre « À relancer seulement » ne garde que les cartes à badge de relance ; les filtres et la recherche se combinent', async ({ page }) => {
  await jeuDeSix();
  await creerPersonne('rel-7', { nom: 'Emmanuel Exemple', etiquettes: ['partenaire'] });
  await echange('rel-a7', 'rel-7', 10);
  await ouvrir(page);
  await poserFiltres(page, (dialogue) => dialogue.getByLabel('À relancer seulement').check());
  await expect(page.locator('.carte-relation')).toHaveCount(2);
  await expect(page.locator('.carte-relation [data-badge="relancer"]')).toHaveCount(2);
  await expect(page.locator('.pastilles-actives')).toContainText('À relancer seulement');
  await expect(page.locator('.compteur-liste')).toHaveText('2 relations sur 7');
  await capture(page, 'F4-a-relancer');
  await page.getByRole('searchbox', { name: /Rechercher une relation/ }).fill('emmanuel');
  await expect(page.locator('.carte-relation')).toHaveCount(1);
  await expect(carte(page, 'rel-7')).toBeVisible();
  await page.getByRole('searchbox', { name: /Rechercher une relation/ }).fill('david'); // David est à répondre : le filtre de relance l'écarte
  await expect(page.locator('.carte-relation')).toHaveCount(0);
  await expect(page.getByText('Aucune relation ne correspond à ces filtres.')).toBeVisible();
  await page.locator('.pastille-retrait').click(); // retirer le filtre : David revient
  await expect(page.locator('.carte-relation')).toHaveCount(1);
  await expect(carte(page, 'rel-4')).toBeVisible();
});

test('F4 le filtre « Catégorie » : Partenaire garde Farid, « Sans catégorie » garde ceux qui n’en ont pas', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  await poserFiltres(page, (dialogue) => dialogue.getByLabel('Partenaire').check());
  await expect(page.locator('.carte-relation')).toHaveCount(1);
  await expect(carte(page, 'rel-6')).toBeVisible();
  await poserFiltres(page, async (dialogue) => { await dialogue.getByLabel('Partenaire').uncheck(); await dialogue.getByLabel('Sans catégorie').check(); });
  await expect(page.locator('.carte-relation')).toHaveCount(5);
  await expect(carte(page, 'rel-6')).toHaveCount(0);
});

test('F5 sans catégories créées : le bandeau apparaît ; « Créer les catégories » (après confirmation) ajoute les manquantes en un seul lot du Journal, sans toucher aux existantes ; ensuite le bandeau disparaît', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  const avant = (await lireDocument('crm_parametres/etiquettes')).items;
  const lignesAvant = (await listerDocuments('crm_audit')).length;
  const bandeau = page.locator('[data-role="bandeau-categories"]');
  await expect(bandeau).toContainText('Les catégories ne sont pas encore créées.');
  const bouton = bandeau.locator('[data-action="creer-categories"]');
  await expect(bouton).toHaveClass(/bouton-secondaire/);
  await capture(page, 'F5-bandeau');
  await bouton.click();
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Annuler' }).click(); // annuler n'écrit rien
  expect((await lireDocument('crm_parametres/etiquettes')).items).toEqual(avant);
  await bouton.click();
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Créer les catégories' }).click();
  await expect(page.locator('.toast')).toContainText('Catégories créées');
  await expect(bandeau).toHaveCount(0);
  const apres = (await lireDocument('crm_parametres/etiquettes')).items;
  expect(apres.slice(0, avant.length)).toEqual(avant); // les étiquettes existantes sont intactes
  expect(apres.map((e) => e.id).slice(avant.length)).toEqual(['cible', 'relais', 'hors_cible', 'a_classer']);
  expect(new Set(apres.map((e) => e.id)).size).toBe(apres.length); // aucun doublon
  const lignes = (await listerDocuments('crm_audit')).filter((d) => d.collection === 'crm_parametres' && d.docId === 'etiquettes');
  expect(lignes.length, 'un seul lot, donc une seule ligne du Journal').toBe(1);
  expect((await listerDocuments('crm_audit')).length - lignesAvant).toBe(1);
  await capture(page, 'F5-apres');
});

test('F5 cas d’erreur : le document des étiquettes disparaît avant le clic = refus, message clair, rien n’est écrit', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/crm_parametres/etiquettes`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }); // le document disparaît après l'affichage
  const lignesAvant = (await listerDocuments('crm_audit')).length;
  await page.locator('[data-action="creer-categories"]').click();
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Créer les catégories' }).click();
  await expect(page.locator('.toast')).toContainText('Ouvre une fois Affaires pour préparer les catégories.');
  expect(await lireDocument('crm_parametres/etiquettes')).toBeNull();
  expect((await listerDocuments('crm_audit')).length).toBe(lignesAvant);
  await capture(page, 'F5-refus');
});

test('F6 une personne archivée ou de test n’est pas affichée (sauf filtre « Tests ») ; une personne Partenaire sans activité est dans « À écrire »', async ({ page }) => {
  await jeuDeSix();
  await creerPersonne('rel-9', { nom: 'Inès Archivée', archive: true, etiquettes: ['partenaire'] });
  await creerPersonne('rel-10', { nom: 'Jules Essai', test: true, etiquettes: ['partenaire'] });
  await ouvrir(page);
  await expect(carte(page, 'rel-9')).toHaveCount(0);
  await expect(carte(page, 'rel-10')).toHaveCount(0);
  await expect(colonne(page, 'a_ecrire').locator('[data-personne="rel-6"]')).toBeVisible();
  await poserFiltres(page, (dialogue) => dialogue.locator('select[data-cle="tests"]').selectOption('seulement'));
  await expect(page.locator('.carte-relation')).toHaveCount(1);
  await expect(carte(page, 'rel-10')).toBeVisible();
  await expect(carte(page, 'rel-10').locator('[data-badge="test"]')).toBeVisible(); // le badge [TEST] n'est montré que pour les personnes
  await expect(carte(page, 'rel-9')).toHaveCount(0); // une personne archivée n'est jamais là
  await capture(page, 'F6-tests');
});

test('F7 quatre colonnes au plus ; sur téléphone elles défilent horizontalement (accrochage) sans barre horizontale de page', async ({ page }) => {
  await jeuDeSix();
  await ouvrir(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal de la page').toBe(true);
  await expect(page.locator('.kanban-relations [data-colonne]')).toHaveCount(4);
  const kanban = await page.locator('.kanban-relations').evaluate((el) => ({ defile: el.scrollWidth > el.clientWidth, accrochage: getComputedStyle(el).scrollSnapType, debordement: getComputedStyle(el).overflowX }));
  expect(kanban.debordement).toBe('auto');
  expect(kanban.accrochage).toContain('x');
  if (estTelephone(page)) expect(kanban.defile, 'les colonnes défilent sur téléphone').toBe(true);
  await capture(page, 'F7-kanban');
});

test('Cas vide : aucune relation = phrase et lien « Importer » ; le bouton « + Relation » ajoute une personne qui reçoit la source LinkedIn et tombe dans « À écrire »', async ({ page }) => {
  await ouvrir(page);
  await expect(page.getByText('Aucune relation LinkedIn pour le moment. Importe ton archive LinkedIn ou ajoute une relation.')).toBeVisible();
  await expect(page.locator('[data-action="importer"]')).toHaveAttribute('href', /#\/reseauxsociaux\/import$/);
  await capture(page, 'F1-cas-vide');
  await page.locator('[data-action="nouvelle-relation"]').click();
  await page.locator('#creation-nom').fill('Karim Exemple');
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(colonne(page, 'a_ecrire').locator('.carte-relation')).toHaveCount(1);
  await expect(colonne(page, 'a_ecrire').locator('.carte-nom')).toHaveText('Karim Exemple');
  const creee = (await listerDocuments('crm_personnes')).find((p) => p.nom === 'Karim Exemple');
  expect(creee.source).toBe('LinkedIn');
});

test('Les échanges LinkedIn d’une personne existante la font entrer dans l’écran même sans catégorie (pastille « Sans catégorie »)', async ({ page }) => {
  await creerPersonne('rel-11', { nom: 'Lina Exemple', organisationId: 'org-rel' });
  await ecrireDocument('crm_organisations/org-rel', { nom: 'Atelier Fictif', archive: false, etiquettes: [], telephones: [], emails: [], creeLe: new Date(), modifieLe: new Date() });
  await echange('rel-a11', 'rel-11', 1);
  await ouvrir(page);
  await expect(carte(page, 'rel-11').locator('[data-categorie="aucune"]')).toHaveText('Sans catégorie');
  await expect(carte(page, 'rel-11')).toContainText('Atelier Fictif');
  await expect(carte(page, 'rel-11')).toContainText('Dernier échange');
});
