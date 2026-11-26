// Module Achats « Chantiers » (24/11/2026, PR 6) : un test par critère (le nom commence par son numéro). Aucun appel réseau réel : la base et le webhook sont un faux réseau
// posé par le crochet de test `window.__accesBase` (émulateurs seulement, voir js/os/acces-base.js), qui garde ses données en mémoire dans la page.
//  C1 Kanban (4 colonnes, totaux, part du budget) ; C2 vue Liste, recherche, tri, filtres ; C3 créer ; C4 modifier + chiffres du budget (seul le champ changé part) ;
//  C5 archiver (confirmation, « Annuler » 8 s), Archives, désarchiver ; C6 étoile (favori) ; C7 cas vide ; C8 cas d'erreur + « Réessayer » ; C9 export ;
//  C10 connexion non réglée ; C11 refus du serveur dans la fenêtre ; C12 Réglages > Achats > Sauvegarde des chantiers ; C13 pas de défilement horizontal.
// Captures dans tests/e2e/captures/achatschantiers/ (non commitées), une par état, nommée avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, attendreCalme, estTelephone, ouvrirSectionReglages } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatschantiers/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('hooks.exemple.test', '/actions') } });
const ROUTE = 'achatschantiers/liste';

const CHANTIERS = [
  { id: 'c1', nom: 'Villa Dupont', code: 'CH-0001', client: 'Dupont', statut: 'en_cours', archive: false, adresse: '12 rue des Lilas, 83560 Vinon-sur-Verdon', budget_ht: 100000, date_debut: '2026-03-01', date_fin_prevue: '2026-09-30', date_fin_reelle: null },
  { id: 'c2', nom: 'Atelier Martin', code: 'CH-0002', client: 'Martin', statut: 'en_preparation', archive: false, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
  { id: 'c3', nom: 'Résidence Les Pins', code: 'CH-0003', client: 'Durand', statut: 'termine', archive: false, adresse: 'Quartier des Pins, Manosque', budget_ht: 50000, date_debut: '2025-01-10', date_fin_prevue: '2025-06-30', date_fin_reelle: '2025-07-04' },
  { id: 'c4', nom: 'Ancien hangar', code: 'CH-0004', client: null, statut: 'suspendu', archive: true, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
];
const CHIFFRES = [
  { chantier_id: 'c1', budget_ht: 100000, budget_renseigne: true, accepte_ht: 42500, en_attente_ht: 10000, reste_ht: 57500, pct_budget_consomme: 42.5, niveau: 'ok' },
  { chantier_id: 'c2', budget_ht: 0, budget_renseigne: false, accepte_ht: 0, en_attente_ht: 0, reste_ht: 0, pct_budget_consomme: null, niveau: 'budget_non_renseigne' },
];

/**
 * Faux réseau + badge simulé, posés AVANT le chargement de la page. `options` : { chantiers, chiffres, favoris, lectureEnPanne, refus }.
 * Les appels reçus sont gardés dans window.__appels ; les données vivent dans window.__faux (les actions les modifient comme le ferait n8n).
 */
async function poserFauxReseau(page, options = {}) {
  await page.addInitScript(({ chantiers, chiffres, favoris, lectureEnPanne, refus }) => {
    const faux = { chantiers: structuredClone(chantiers), chiffres, favoris: [...favoris], lectureEnPanne, refus };
    window.__faux = faux;
    window.__appels = [];
    const rep = (corps, statut = 200, entetes = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      const corps = init.body ? JSON.parse(init.body) : null;
      window.__appels.push({ methode: init.method, chemin: u.pathname, corps });
      if (u.pathname === '/rest/v1/chantiers') {
        if (faux.lectureEnPanne) return rep({ message: 'panne' }, 500);
        if (faux.retardProchaineLecture) { // la PROCHAINE lecture garde l'état d'aujourd'hui et ne répond que quand le test la libère
          faux.retardProchaineLecture = false;
          const instantane = structuredClone(faux.chantiers);
          await new Promise((r) => { window.__liberer = r; });
          return rep(instantane, 200, { 'Content-Range': `0-${Math.max(0, instantane.length - 1)}/${instantane.length}` });
        }
        return rep(faux.chantiers, 200, { 'Content-Range': `0-${Math.max(0, faux.chantiers.length - 1)}/${faux.chantiers.length}` });
      }
      if (u.pathname === '/rest/v1/v_td_chantiers') {
        if (faux.chiffresEnPanne) return rep({ message: 'panne' }, 500);
      }
      if (u.pathname === '/rest/v1/v_td_chantiers') return rep(faux.chiffres, 200, { 'Content-Range': `0-${Math.max(0, faux.chiffres.length - 1)}/${faux.chiffres.length}` });
      if (u.pathname === '/rest/v1/rpc/lister_favoris_os') return rep(faux.favoris);
      if (u.pathname === '/rest/v1/rpc/basculer_favori_os') {
        const i = faux.favoris.findIndex((f) => f.genre === corps.p_genre && f.cle === corps.p_cle);
        if (i >= 0) { faux.favoris.splice(i, 1); return rep(false); }
        faux.favoris.push({ genre: corps.p_genre, cle: corps.p_cle });
        return rep(true);
      }
      if (u.pathname === '/rest/v1/rpc/demander_ticket_n8n') return rep('ticket-essai');
      if (u.pathname === '/actions') {
        if (faux.refus) return rep({ ok: false, code: 'refus_essai', message: faux.refus }, 400);
        if (corps.action === 'creer_chantier') {
          const n = faux.chantiers.length + 1;
          faux.chantiers.push({ id: `c${n}`, code: corps.code ?? `CH-000${n}`, client: null, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null, archive: false, ...corps });
          return rep({ ok: true, chantier_id: `c${n}` });
        }
        if (corps.action === 'modifier_chantier') {
          const c = faux.chantiers.find((x) => x.id === corps.id);
          Object.assign(c, corps.champs);
          return rep({ ok: true });
        }
      }
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { chantiers: CHANTIERS, chiffres: CHIFFRES, favoris: [], lectureEnPanne: false, refus: '', ...options });
}
const appels = (page) => page.evaluate(() => window.__appels);
const appelsActions = async (page) => (await appels(page)).filter((a) => a.chemin === '/actions').map((a) => a.corps);
async function ouvrir(page, options) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page, options);
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.getByRole('heading', { name: 'Chantiers', level: 1 })).toBeVisible();
}
const colonne = (page, statut) => page.locator(`[data-colonne="${statut}"]`);
const carte = (page, id) => page.locator(`article[data-chantier="${id}"]`);
const champ = (page, cle) => page.locator(`[data-role="formulaire-chantier"] [data-champ="${cle}"]`);

test('C1 le Kanban a les quatre colonnes avec leurs chantiers, les totaux de budget et la part du budget consommé', async ({ page }, info) => {
  await ouvrir(page);
  await expect(page.locator('[data-colonne]')).toHaveCount(4);
  await expect(colonne(page, 'en_cours').locator('article')).toHaveCount(1);
  await expect(colonne(page, 'en_preparation').locator('.colonne-totaux')).toHaveText('1 chantier · —');
  await expect(colonne(page, 'en_cours').locator('.colonne-totaux')).toContainText('100 000,00');
  await expect(colonne(page, 'suspendu').locator('.colonne-vide')).toHaveText('Aucun chantier');
  await expect(carte(page, 'c1')).toContainText('Villa Dupont · Vinon-sur-Verdon');
  await expect(carte(page, 'c1').locator('[data-valeur="part-budget"]')).toContainText('42,5 % du budget');
  await expect(carte(page, 'c2').locator('[data-valeur="part-budget"]')).toHaveCount(0); // budget non renseigné : jamais « 0 % »
  await expect(carte(page, 'c4')).toHaveCount(0); // archivé : pas dans le Kanban
  await expect(page.locator('.compteur-liste')).toHaveText('3 chantiers');
  await capturer(page, info, 'C1-kanban');
});

test('C2 vue Liste : le tableau, la recherche sans accents, le tri par budget et le filtre par statut', async ({ page }, info) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('tr[data-chantier]')).toHaveCount(3);
  await page.getByLabel('Rechercher un chantier').fill('residence');
  await expect(page.locator('tr[data-chantier]')).toHaveCount(1);
  await expect(page.locator('.compteur-liste')).toHaveText('1 sur 3 chantiers');
  await page.getByLabel('Rechercher un chantier').fill('');
  await page.getByLabel('Trier par').selectOption('budget');
  await expect(page.locator('tr[data-chantier]').first()).toHaveAttribute('data-chantier', 'c1'); // 100 000 d'abord, le budget vide en dernier
  await expect(page.locator('tr[data-chantier]').last()).toHaveAttribute('data-chantier', 'c2');
  await page.locator('[data-action="filtres"]').click();
  await page.locator('[data-cle="statuts"][data-valeur="termine"]').check();
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tr[data-chantier]')).toHaveCount(1);
  await expect(page.locator('.pastille-filtre')).toContainText('Statut : Terminé');
  await capturer(page, info, 'C2-liste-filtree');
});

test('C3 « + Chantier » : le formulaire envoie les champs remplis à l\'action « creer_chantier », puis la liste est relue', async ({ page }, info) => {
  await ouvrir(page);
  await page.locator('[data-action="nouveau-chantier"]').click();
  await expect(page.locator('[data-action="enregistrer-chantier"]')).toBeDisabled(); // nom vide
  await champ(page, 'nom').fill('Maison Bernard');
  await champ(page, 'budget_ht').fill('12 500,50');
  await champ(page, 'client').fill('Bernard');
  await capturer(page, info, 'C3-nouveau');
  await page.locator('[data-action="enregistrer-chantier"]').click();
  await expect(page.locator('.toast')).toContainText('Chantier créé');
  await expect(page.locator('article[data-chantier="c5"]')).toContainText('Maison Bernard');
  expect(await appelsActions(page)).toEqual([{ nom: 'Maison Bernard', statut: 'en_preparation', client: 'Bernard', budget_ht: 12500.5, action: 'creer_chantier' }]);
});

test('C4 modifier : les chiffres du budget (base) sont montrés, et seul le champ changé est envoyé', async ({ page }, info) => {
  await ouvrir(page);
  await carte(page, 'c1').locator('[data-action="menu-chantier"]').click();
  await page.getByRole('menuitem', { name: 'Modifier' }).click();
  const chiffres = page.locator('[data-role="chantier-chiffres"]');
  await expect(chiffres).toHaveAttribute('data-etat', 'ok');
  await expect(chiffres.locator('[data-chiffre="accepte"]')).toContainText('42 500,00');
  await expect(chiffres.locator('[data-chiffre="reste"]')).toContainText('57 500,00');
  await expect(chiffres.locator('[data-chiffre="pct"]')).toContainText('42,5 %');
  await capturer(page, info, 'C4-modifier');
  await champ(page, 'nom').fill('Villa Dupont (phase 2)');
  await page.locator('[data-action="enregistrer-chantier"]').click();
  await expect(page.locator('.toast')).toContainText('Chantier modifié');
  expect(await appelsActions(page)).toEqual([{ id: 'c1', champs: { nom: 'Villa Dupont (phase 2)' }, action: 'modifier_chantier' }]);
  await expect(carte(page, 'c1')).toContainText('Villa Dupont (phase 2)');
});

test('C4 un chantier sans facture : message « chiffres » clair, et rien n\'est envoyé si rien n\'a changé', async ({ page }) => {
  await ouvrir(page);
  await carte(page, 'c3').locator('[data-action="menu-chantier"]').click();
  await page.getByRole('menuitem', { name: 'Modifier' }).click();
  await expect(page.locator('[data-role="chantier-chiffres"]')).toHaveAttribute('data-etat', 'vide');
  await page.locator('[data-action="enregistrer-chantier"]').click();
  await expect(page.locator('.toast')).toContainText('Aucune modification');
  expect(await appelsActions(page)).toEqual([]);
});

test('C5 archiver : confirmation, puis « Annuler » ; le chantier passe dans Archives ; désarchiver le remet', async ({ page }, info) => {
  await ouvrir(page);
  await carte(page, 'c2').locator('[data-action="menu-chantier"]').click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  await expect(page.getByRole('dialog')).toContainText('Archiver ce chantier ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(page.locator('.toast')).toContainText('Chantier archivé');
  await expect(carte(page, 'c2')).toHaveCount(0);
  await capturer(page, info, 'C5-archive-annuler');
  await page.locator('[data-action="toast-action"]').click(); // « Annuler »
  await expect(carte(page, 'c2')).toBeVisible();
  // Archiver pour de bon, puis le retrouver dans Archives et le désarchiver (sans confirmation).
  await carte(page, 'c2').locator('[data-action="menu-chantier"]').click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(carte(page, 'c2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archives' }).click();
  await expect(page.locator('.compteur-liste')).toHaveText('2 chantiers archivés');
  await expect(page.locator('tr[data-chantier="c4"]')).toBeVisible();
  await capturer(page, info, 'C5-archives');
  await page.locator('tr[data-chantier="c4"] [data-action="menu-chantier"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Désarchiver']); // un archivé ne se modifie pas
  await page.getByRole('menuitem', { name: 'Désarchiver' }).click();
  await expect(page.locator('.toast').last()).toContainText('Chantier désarchivé');
  await expect(page.locator('tr[data-chantier="c4"]')).toHaveCount(0);
  const actions = await appelsActions(page);
  expect(actions.map((a) => a.champs)).toEqual([{ archive: true }, { archive: false }, { archive: true }, { archive: false }]);
});

test('C6 l\'étoile met un chantier en favori tout de suite et le retient (genre « chantier » seulement)', async ({ page }, info) => {
  await ouvrir(page, { favoris: [{ genre: 'chantier', cle: 'c3' }, { genre: 'entreprise', cle: 'e9' }] });
  await expect(carte(page, 'c3').locator('.bouton-etoile')).toHaveClass(/est-favori/);
  await expect(carte(page, 'c1').locator('.bouton-etoile')).not.toHaveClass(/est-favori/);
  await carte(page, 'c1').locator('[data-action="basculer-favori"]').click();
  await expect(carte(page, 'c1').locator('.bouton-etoile')).toHaveClass(/est-favori/);
  await expect(carte(page, 'c1').locator('.bouton-etoile')).toHaveAttribute('aria-label', /Retirer .* des favoris/);
  const bascules = (await appels(page)).filter((a) => a.chemin === '/rest/v1/rpc/basculer_favori_os');
  expect(bascules.map((b) => b.corps)).toEqual([{ p_genre: 'chantier', p_cle: 'c1' }]);
  await capturer(page, info, 'C6-favori');
});

test('C7 cas vide : aucun chantier, le message et « + Chantier » actif ; export grisé', async ({ page }, info) => {
  await ouvrir(page, { chantiers: [] });
  await expect(page.locator('[data-etat="vide"]')).toContainText('Aucun chantier pour l’instant');
  await expect(page.locator('[data-action="nouveau-chantier"]')).toBeEnabled();
  await expect(page.locator('[data-action="exporter-chantiers"]')).toBeDisabled();
  await capturer(page, info, 'C7-vide');
});

test('C8 cas d\'erreur : la lecture des chantiers échoue ; message clair et « Réessayer » qui relance', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la lecture du faux réseau échoue exprès (erreur 500)' });
  await ouvrir(page, { lectureEnPanne: true });
  await expect(page.locator('[data-etat="erreur"]')).toContainText('Impossible de charger les chantiers');
  await expect(page.locator('[data-action="nouveau-chantier"]')).toBeDisabled();
  await capturer(page, info, 'C8-erreur');
  await page.evaluate(() => { window.__faux.lectureEnPanne = false; });
  await page.locator('[data-etat="erreur"] [data-action="reessayer"]').click();
  await expect(carte(page, 'c1')).toBeVisible();
});

test('C9 export : le fichier part avec le nom du jour et ne contient que ce qui est affiché', async ({ page }) => {
  await ouvrir(page);
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-chantiers"]').click()]);
  expect(fichier.suggestedFilename()).toMatch(/^chantiers-\d{4}-\d{2}-\d{2}\.csv$/);
  const texte = await (await import('node:fs/promises')).readFile(await fichier.path(), 'utf8');
  expect(texte).toContain('Villa Dupont');
  expect(texte).toContain('Atelier Martin');
  expect(texte).not.toContain('Ancien hangar'); // archivé : pas dans la vue affichée
  expect(texte.split('\r\n')[0]).toContain('Code;Nom;Client;Statut;Budget HT');
});

test('C10 connexion non réglée : l\'écran le dit avec le lien vers Réglages (aucune lecture tentée)', async ({ page }, info) => {
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.locator('[data-role="achats-etat"]')).toHaveAttribute('data-etat', 'non-regle');
  await expect(page.locator('[data-role="achats-etat-texte"]')).toHaveText('Connexion à la base non réglée : Réglages > Connexion à la base');
  await expect(page.locator('[data-action="nouveau-chantier"]')).toBeDisabled();
  await capturer(page, info, 'C10-non-regle');
});

test('C11 le serveur refuse l\'écriture : son message est montré dans la fenêtre, qui reste ouverte', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux webhook refuse exprès (erreur 400)' });
  await ouvrir(page, { refus: 'Ce chantier existe déjà.' });
  await page.locator('[data-action="nouveau-chantier"]').click();
  await champ(page, 'nom').fill('Doublon');
  await page.locator('[data-action="enregistrer-chantier"]').click();
  await expect(page.locator('[data-role="chantier-erreur"]')).toBeVisible();
  await expect(page.locator('[data-role="chantier-erreur"]')).not.toBeEmpty();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capturer(page, info, 'C11-refus');
});

test('C12 Réglages > Achats > Sauvegarde des chantiers : un bouton d\'export de toutes les données', async ({ page }, info) => {
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await page.locator('[data-role="sauvegardes-separees"]').click(); // depuis le 26/11/2026, la sauvegarde de chaque module est repliée sous « Sauvegardes séparées »
  await expect(page.locator('#reglages-export-achatschantiers')).toBeVisible();
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-chantiers-tous"]').click()]);
  expect(fichier.suggestedFilename()).toMatch(/^chantiers-\d{4}-\d{2}-\d{2}\.csv$/);
  const texte = await (await import('node:fs/promises')).readFile(await fichier.path(), 'utf8');
  expect(texte).toContain('Ancien hangar'); // l'export des Réglages prend TOUT, archivés compris
  await capturer(page, info, 'C12-reglages');
});

test('C13 pas de défilement horizontal, dans les trois vues', async ({ page }) => {
  await ouvrir(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('tr[data-chantier]').first()).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.getByRole('button', { name: 'Archives' }).click();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  if (estTelephone(page)) await expect(page.locator('.tableau-chantiers thead')).toBeHidden();
});

async function modifierNom(page, id, nom) {
  await carte(page, id).locator('[data-action="menu-chantier"]').click();
  await page.getByRole('menuitem', { name: 'Modifier' }).click();
  await champ(page, 'nom').fill(nom);
  await page.locator('[data-action="enregistrer-chantier"]').click();
}

test('C14 une lecture lente et ancienne ne remplace pas une lecture plus récente (réponse tardive ignorée)', async ({ page }) => {
  await ouvrir(page);
  await expect(carte(page, 'c1')).toBeVisible(); // la première lecture est finie : le retard ne touchera que la relecture suivante
  await page.evaluate(() => { window.__faux.retardProchaineLecture = true; });
  await modifierNom(page, 'c1', 'Premier nom'); // sa relecture reste en attente, avec « Premier nom »
  await expect(page.locator('[data-role="formulaire-chantier"]')).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'Chantier modifié' })).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('dialog[open], .dialogue-fond, [role="dialog"]'));
  await modifierNom(page, 'c1', 'Second nom'); // sa relecture répond tout de suite
  await expect(carte(page, 'c1')).toContainText('Second nom');
  await page.evaluate(() => window.__liberer()); // la vieille réponse arrive enfin
  await page.waitForTimeout(300);
  await expect(carte(page, 'c1')).toContainText('Second nom');
  await expect(carte(page, 'c1')).not.toContainText('Premier nom');
});

test('C15 relecture silencieuse : si la vue des chiffres échoue, les chiffres déjà affichés restent', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la lecture des chiffres échoue exprès (erreur 500)' });
  await ouvrir(page);
  await expect(carte(page, 'c1').locator('[data-valeur="part-budget"]')).toContainText('42,5 %');
  await page.evaluate(() => { window.__faux.chiffresEnPanne = true; });
  await modifierNom(page, 'c1', 'Nom bis');
  await expect(carte(page, 'c1')).toContainText('Nom bis');
  await expect(carte(page, 'c1').locator('[data-valeur="part-budget"]')).toContainText('42,5 %'); // gardés
  await carte(page, 'c1').locator('[data-action="menu-chantier"]').click();
  await page.getByRole('menuitem', { name: 'Modifier' }).click();
  await expect(page.locator('[data-role="chantier-chiffres"]')).toHaveAttribute('data-etat', 'ok');
});
