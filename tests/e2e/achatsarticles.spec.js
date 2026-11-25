// Module Articles (PR 7) : un test par point de recette (le nom commence par son numéro), ordinateur et téléphone.
//  E1 la liste (compteur, filtres en un clic avec leur nombre, pastilles) ; E2 cas vide ; E3 cas d'erreur de lecture + « Réessayer » ; E4 rapprocher deux articles libres (création de l'article interne, coefficients) ;
//  E5 refuser une suggestion de groupe puis « Annuler » ; E6 « Demander des suggestions à l'IA » ; E7 filtre « Rapprochés » : une ligne par association ; E8 export (écran et Réglages) ;
//  E9 connexion non réglée ; E10 une écriture refusée par le serveur est dite et ne casse rien.
// Réseau et badge SIMULÉS (crochet `window.__accesBase` du mode émulateurs) : jamais la vraie base, jamais n8n. Aucune adresse d'exemple n'est écrite dans le code de l'appli.
// Captures dans tests/e2e/captures/achatsarticles/ (non commitées), une par point de recette, nommée avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, ecrireDocument, ouvrirSectionReglages, estTelephone } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatsarticles/', import.meta.url));
async function capturer(page, info, nom) { await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' }); }
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('n8n.exemple.test', '/actions'), suggestions: https('n8n.exemple.test', '/suggestions') } });
const ROUTE = 'achatsarticles/liste';

const T0 = '2026-03-01T10:00:00Z';
const DONNEES = () => ({
  fournisseurs: [{ id: 'f1', nom: 'Bois du Sud' }, { id: 'f2', nom: 'Fer et Fils' }, { id: 'f3', nom: 'Quincaillerie des Alpes' }],
  articles_fournisseur: [
    { id: 'a1', fournisseur_id: 'f1', reference: 'PL27', designation: 'Planche sapin 27 mm', unite: 'u', created_at: T0 },
    { id: 'a2', fournisseur_id: 'f2', reference: null, designation: 'Planche sapin 27x200', unite: 'u', created_at: T0 },
    { id: 'a3', fournisseur_id: 'f1', reference: 'VIS4', designation: 'Vis inox 4x40 boîte', unite: 'u', created_at: T0 },
    { id: 'a4', fournisseur_id: 'f2', reference: null, designation: 'Vis inox 4x40 b/200', unite: 'u', created_at: T0 },
    { id: 'a5', fournisseur_id: 'f3', reference: 'COL1', designation: 'Colle bois', unite: 'u', created_at: T0 },
    { id: 'a6', fournisseur_id: 'f1', reference: null, designation: 'Colle à bois 750 g', unite: 'u', created_at: T0 },
    { id: 'a7', fournisseur_id: 'f3', reference: null, designation: 'Pointe tête plate', unite: 'kg', created_at: T0 },
  ],
  articles_reference: [{ id: 'r1', nom: 'Planche sapin 27', unite_reference: 'u', actif: true }, { id: 'r2', nom: 'Colle à bois', unite_reference: 'u', actif: true }],
  rapprochements_articles: [
    { article_fournisseur_id: 'a1', article_reference_id: 'r1', coefficient: 1, valide_le: T0, valide_par: 'Essai', suggere_par_ia: false },
    { article_fournisseur_id: 'a2', article_reference_id: 'r1', coefficient: 1, valide_le: T0, valide_par: 'Essai', suggere_par_ia: false },
    { article_fournisseur_id: 'a5', article_reference_id: 'r2', coefficient: 1, valide_le: null, valide_par: null, suggere_par_ia: true },
    { article_fournisseur_id: 'a6', article_reference_id: 'r2', coefficient: 0.5, valide_le: null, valide_par: null, suggere_par_ia: true },
  ],
  suggestions_refusees: [{ article_fournisseur_id: 'a7', refuse_par: 'Essai', refuse_le: T0, article_reference_id: null, coefficient: null }],
  factures: [{ id: 'fa1', statut: 'acceptee', type_document: 'facture', date_facture: '2026-03-01', created_at: T0 }],
  lignes_facture: [
    { id: 'l1', article_fournisseur_id: 'a1', quantite: 2, montant_ht: 20, facture_id: 'fa1' },
    { id: 'l2', article_fournisseur_id: 'a2', quantite: 1, montant_ht: 12, facture_id: 'fa1' },
    { id: 'l3', article_fournisseur_id: 'a3', quantite: 1, montant_ht: 30, facture_id: 'fa1' },
    { id: 'l4', article_fournisseur_id: 'a4', quantite: 2, montant_ht: 50, facture_id: 'fa1' },
    { id: 'l5', article_fournisseur_id: 'a5', quantite: 1, montant_ht: 9, facture_id: 'fa1' },
  ],
  v_td_prix_lignes: [{ ligne_id: 'l1', article_fournisseur_id: 'a1', nom_agence: null, ville: 'Manosque' }, { ligne_id: 'l2', article_fournisseur_id: 'a2', nom_agence: 'Agence Nord', ville: 'Gap' }],
});

/** Faux réseau + badge simulés dans la page (avant son chargement). `pannes` : tables qui répondent une erreur ; `refus` : actions refusées par le serveur ; `delaiIA` : durée du faux travail de l'IA. */
async function installerFausseBase(page, { tables = DONNEES(), pannes = [], refus = {}, delaiIA = 300 } = {}) {
  await page.addInitScript(({ tables: t0, pannes: p0, refus: r0, delaiIA: d0 }) => {
    const tables = JSON.parse(JSON.stringify(t0));
    const etat = { pannes: new Set(p0), refus: r0, appels: [], lectures: [] };
    window.__base = { tables, etat };
    window.__appels = etat.appels;
    window.__corrigerPannes = () => etat.pannes.clear();
    let ticket = 0; let suite = 100;
    const rep = (status, corps, entetes = {}) => ({ ok: status < 300, status, headers: { get: (n) => entetes[n] ?? null }, json: async () => corps });
    const retirer = (nom, article) => { tables[nom] = (tables[nom] ?? []).filter((l) => l.article_fournisseur_id !== article); };
    const actions = {
      creer_article_reference: (c) => {
        const deja = tables.articles_reference.find((r) => r.nom.toLowerCase() === c.nom.toLowerCase());
        if (deja) return { ok: true, article_reference_id: deja.id };
        const id = `r${suite += 1}`; tables.articles_reference.push({ id, nom: c.nom, unite_reference: c.unite_reference, actif: true }); return { ok: true, article_reference_id: id };
      },
      valider_rapprochement: (c) => {
        retirer('rapprochements_articles', c.article_fournisseur_id); retirer('suggestions_refusees', c.article_fournisseur_id);
        tables.rapprochements_articles.push({ article_fournisseur_id: c.article_fournisseur_id, article_reference_id: c.article_reference_id, coefficient: c.coefficient, valide_le: '2026-11-24T10:00:00Z', valide_par: 'Essai', suggere_par_ia: false });
        return { ok: true };
      },
      refuser_suggestion: (c) => {
        const r = tables.rapprochements_articles.find((x) => x.article_fournisseur_id === c.article_fournisseur_id && !x.valide_le);
        if (!r) return { statut: 409, corps: { erreur: 'Cette suggestion n’existe plus.', code: 'suggestion_introuvable' } };
        retirer('rapprochements_articles', c.article_fournisseur_id);
        tables.suggestions_refusees.push({ article_fournisseur_id: c.article_fournisseur_id, refuse_par: 'Essai', refuse_le: '2026-11-24T10:00:00Z', article_reference_id: r.article_reference_id, coefficient: r.coefficient });
        return { ok: true };
      },
      reprendre_suggestion: (c) => {
        const s = tables.suggestions_refusees.find((x) => x.article_fournisseur_id === c.article_fournisseur_id);
        if (!s || !s.article_reference_id) return { statut: 409, corps: { erreur: 'Cette suggestion ne peut pas être reprise.', code: 'refus_introuvable' } };
        retirer('suggestions_refusees', c.article_fournisseur_id);
        tables.rapprochements_articles.push({ article_fournisseur_id: c.article_fournisseur_id, article_reference_id: s.article_reference_id, coefficient: s.coefficient, valide_le: null, valide_par: null, suggere_par_ia: true });
        return { ok: true };
      },
      dissocier_rapprochement: (c) => { retirer('rapprochements_articles', c.article_fournisseur_id); return { ok: true }; },
      renommer_reference: (c) => {
        if (tables.articles_reference.some((r) => r.id !== c.article_reference_id && r.nom.toLowerCase() === c.nom.toLowerCase())) return { statut: 409, corps: { erreur: 'Ce nom existe déjà.', code: 'nom_deja_pris' } };
        tables.articles_reference.find((r) => r.id === c.article_reference_id).nom = c.nom; return { ok: true, article_reference_id: c.article_reference_id };
      },
    };
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      if (u.pathname.startsWith('/rest/v1/rpc/')) return u.pathname.endsWith('demander_ticket_n8n') ? rep(200, `ticket-${ticket += 1}`) : rep(200, []);
      if (u.pathname.startsWith('/rest/v1/')) {
        const nom = u.pathname.replace('/rest/v1/', '');
        etat.lectures.push(nom);
        if (etat.pannes.has(nom)) return rep(500, { message: 'panne' });
        if (!tables[nom]) return rep(404, { message: 'introuvable' });
        let lignes = tables[nom];
        for (const [cle, val] of u.searchParams) {
          if (['select', 'order', 'limit', 'offset'].includes(cle)) continue;
          const [op, ...reste] = val.split('.'); const v = reste.join('.');
          if (op === 'eq') lignes = lignes.filter((l) => String(l[cle]) === v);
          else if (op === 'gt') lignes = lignes.filter((l) => Number(l[cle]) > Number(v));
          else if (op === 'in') { const liste = JSON.parse(`[${v.slice(1, -1)}]`); lignes = lignes.filter((l) => liste.includes(l[cle])); }
        }
        const debut = Number(u.searchParams.get('offset') ?? 0); const taille = Number(u.searchParams.get('limit') ?? 1000);
        const page = lignes.slice(debut, debut + taille);
        return rep(200, page, { 'Content-Range': `${page.length ? debut : '*'}-${debut + page.length - 1}/${lignes.length}` });
      }
      // Webhooks (n8n) : le corps est l'action et ses champs.
      const corps = JSON.parse(init.body);
      if (u.pathname.endsWith('/suggestions')) {
        etat.appels.push({ action: 'suggestions' });
        await new Promise((ok) => setTimeout(ok, d0));
        tables.articles_reference.push({ id: 'r-ia', nom: 'Vis inox 4x40', unite_reference: 'u', actif: true });
        for (const a of ['a3', 'a4']) tables.rapprochements_articles.push({ article_fournisseur_id: a, article_reference_id: 'r-ia', coefficient: 1, valide_le: null, valide_par: null, suggere_par_ia: true });
        return rep(200, { ok: true, suggestions: 2, groupes: 1, ignorees: 0, articles_envoyes: 2 });
      }
      etat.appels.push(corps);
      if (etat.refus[corps.action]) return rep(409, { erreur: etat.refus[corps.action], code: 'refus_essai' });
      const r = actions[corps.action](corps);
      return r.statut ? rep(r.statut, r.corps) : rep(200, r);
    };
    window.__accesBase = { jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' }, fetchImpl };
  }, { tables, pannes, refus, delaiIA });
}
async function ouvrirEcran(page, options) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await installerFausseBase(page, options);
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.getByRole('heading', { name: 'Articles', level: 1 })).toBeVisible();
}
const ligne = (page, id) => page.locator(`tr[data-article="${id}"]`);
const appels = (page) => page.evaluate(() => window.__appels.map((a) => a.action));
const fenetre = (page) => page.locator('.dialogue-association');
const enregistrer = (page) => page.locator('[data-action="assoc-enregistrer"]');

test('E1 la liste : compteur, filtres en un clic avec leur nombre, une ligne par article avec sa pastille et son dernier prix', async ({ page }, info) => {
  await ouvrirEcran(page);
  await expect(page.locator('.compteur-liste')).toHaveText('7 articles · 2 à rapprocher · 2 suggestions IA à valider · 2 rapprochés · 1 refusé');
  await expect(page.locator('[data-filtre="a_rapprocher"] .filtre-rapide-nombre')).toHaveText('2');
  await expect(page.locator('[data-filtre="suggere"] .filtre-rapide-nombre')).toHaveText('2');
  await expect(page.locator('[data-filtre="valide"] .filtre-rapide-nombre')).toHaveText('2');
  await expect(page.locator('tr[data-article]')).toHaveCount(7);
  await expect(ligne(page, 'a1')).toContainText('Bois du Sud');
  await expect(ligne(page, 'a1')).toContainText('10,00');
  await expect(ligne(page, 'a1').locator('.pastille-rapprochement')).toContainText('Groupe « Planche sapin 27 » · 2');
  await expect(ligne(page, 'a5').locator('.pastille-rapprochement')).toContainText('À valider · groupe de 2');
  await expect(ligne(page, 'a3').locator('.pastille-rapprochement')).toHaveText('À rapprocher');
  await expect(ligne(page, 'a7').locator('.pastille-rapprochement')).toHaveText('Refusé');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E1-liste');
  // Un clic allume un filtre (les autres lignes disparaissent), un second clic l'éteint ; la recherche garde le focus pendant la frappe.
  await page.locator('[data-filtre="a_rapprocher"]').click();
  await expect(page.locator('tr[data-article]')).toHaveCount(2);
  await expect(page.locator('[data-filtre="a_rapprocher"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-filtre="a_rapprocher"]').click();
  await expect(page.locator('tr[data-article]')).toHaveCount(7);
  const recherche = page.getByRole('searchbox', { name: 'Rechercher un article' });
  await recherche.click();
  await recherche.pressSequentially('colle');
  await expect(page.locator('tr[data-article]')).toHaveCount(2);
  await expect(recherche).toBeFocused();
  await recherche.fill('zzz');
  await expect(page.getByText('Aucun article ne correspond à ta recherche ou à tes filtres.')).toBeVisible();
  await page.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(page.locator('tr[data-article]')).toHaveCount(7);
});

test('E2 cas vide : aucun article dans la base : la phrase qui dit comment ils arrivent', async ({ page }, info) => {
  await ouvrirEcran(page, { tables: { ...DONNEES(), articles_fournisseur: [], rapprochements_articles: [], suggestions_refusees: [], lignes_facture: [] } });
  await expect(page.locator('[data-etat="vide"]')).toContainText('Aucun article pour l’instant : ils apparaissent quand tu acceptes des factures avec leurs lignes.');
  await expect(page.locator('[data-action="exporter-articles"]')).toBeDisabled();
  await expect(page.locator('[data-action="demander-suggestions"]')).toBeEnabled();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E2-vide');
});

test('E3 cas d\'erreur : la lecture échoue : phrase claire et « Réessayer » qui relit', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la base simulée répond une erreur exprès' });
  await ouvrirEcran(page, { pannes: ['articles_fournisseur'] });
  await expect(page.locator('[data-etat="erreur"]')).toContainText('Impossible de charger les articles. Vérifie ta connexion, puis réessaie.');
  await expect(page.locator('[data-action="demander-suggestions"]')).toBeDisabled();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E3-erreur');
  await page.evaluate(() => window.__corrigerPannes());
  await page.locator('[data-etat="erreur"] [data-action="reessayer"]').click();
  await expect(page.locator('tr[data-article]')).toHaveCount(7);
});

test('E4 rapprocher deux articles libres : cases, barre d\'action, nom proposé, coefficients, un article interne créé puis chaque article validé', async ({ page }, info) => {
  await ouvrirEcran(page);
  await ligne(page, 'a3').locator('input[type=checkbox]').check();
  await expect(page.locator('.barre-action-articles')).toBeVisible();
  // Une seule case : pas de bouton, un texte d'aide ; la seconde case fait apparaître « Rapprocher ces 2 articles ».
  await expect(page.locator('.baa-aide')).toContainText('Coche au moins un autre article.');
  await ligne(page, 'a4').locator('input[type=checkbox]').check();
  await expect(page.locator('[data-action="ouvrir-association"]')).toHaveText('Rapprocher ces 2 articles');
  await capturer(page, info, 'E4-selection');
  await page.locator('[data-action="ouvrir-association"]').click();
  await expect(fenetre(page)).toBeVisible();
  await expect(page.locator('[data-role="assoc-nom"]')).toHaveValue('Vis inox 4x40 boîte');
  await expect(enregistrer(page)).toBeDisabled(); // pas de coefficient : on ne devine jamais
  const coefs = page.locator('[data-role="assoc-coef"]');
  await coefs.nth(0).fill('1');
  await coefs.nth(1).fill('0,5');
  await expect(enregistrer(page)).toBeEnabled();
  await expect(fenetre(page).locator('.bandeau-comparaison')).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E4-fenetre');
  await enregistrer(page).click();
  await expect(fenetre(page)).toHaveCount(0);
  await expect(page.locator('#toasts')).toContainText('Association enregistrée.');
  await expect(ligne(page, 'a3').locator('.pastille-rapprochement')).toContainText('Groupe « Vis inox 4x40 boîte » · 2');
  expect(await appels(page)).toEqual(['creer_article_reference', 'valider_rapprochement', 'valider_rapprochement']);
  const corps = await page.evaluate(() => window.__appels.filter((a) => a.action === 'valider_rapprochement').map((a) => [a.article_fournisseur_id, a.coefficient]));
  expect(corps).toEqual([['a3', 1], ['a4', 0.5]]);
  await capturer(page, info, 'E4-apres');
});

test('E5 refuser une suggestion de groupe (décocher dans la fenêtre), puis « Annuler » dans les 8 secondes', async ({ page }, info) => {
  await ouvrirEcran(page);
  await ligne(page, 'a5').locator('.pastille-rapprochement').click();
  await expect(fenetre(page)).toBeVisible();
  await expect(fenetre(page).locator('li[data-article]')).toHaveCount(2);
  await expect(fenetre(page).locator('li[data-article="a6"]')).toContainText('suggéré par l’IA');
  await capturer(page, info, 'E5-suggestion');
  await fenetre(page).locator('li[data-article="a6"] input[type=checkbox]').uncheck();
  await expect(fenetre(page).locator('.fa-message')).toContainText('l’association sera défaite');
  await enregistrer(page).click(); // première demande : confirmation (jamais d'écriture sans « Tu confirmes ? »)
  await expect(fenetre(page).locator('.avertissement-fort')).toContainText('Tu confirmes ?');
  await capturer(page, info, 'E5-confirmation');
  await page.waitForTimeout(500);
  await enregistrer(page).click();
  await expect(fenetre(page)).toHaveCount(0);
  await expect(page.locator('#toasts')).toContainText('2 suggestions refusées.');
  expect(await appels(page)).toEqual(['refuser_suggestion', 'refuser_suggestion']);
  await expect(ligne(page, 'a5').locator('.pastille-rapprochement')).toHaveText('Refusé');
  await expect(ligne(page, 'a5').locator('[data-action="reprendre"]')).toBeVisible();
  await capturer(page, info, 'E5-refus');
  await page.locator('#toasts [data-action="toast-action"]', { hasText: 'Annuler' }).click();
  await expect(page.locator('#toasts')).toContainText('Refus annulé : les 2 suggestions sont revenues.');
  expect(await appels(page)).toEqual(['refuser_suggestion', 'refuser_suggestion', 'reprendre_suggestion', 'reprendre_suggestion']);
  await expect(ligne(page, 'a5').locator('.pastille-rapprochement')).toContainText('À valider · groupe de 2');
});

test('E6 « Demander des suggestions à l\'IA » : bouton occupé, résultat gardé jusqu\'à « Fermer », liste relue', async ({ page }, info) => {
  await ouvrirEcran(page, { delaiIA: 700 });
  await page.locator('[data-action="demander-suggestions"]').click();
  await expect(page.locator('[data-action="demander-suggestions"]')).toContainText('L’IA réfléchit…');
  await expect(page.locator('[data-action="demander-suggestions"]')).toBeDisabled();
  await expect(page.locator('[data-role="resultat-ia"]')).toContainText('L’IA a proposé 1 groupe (2 articles).');
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-role="resultat-ia"]')).toBeVisible(); // pas de minuteur : il reste jusqu'à « Fermer »
  await expect(page.locator('[data-filtre="suggere"] .filtre-rapide-nombre')).toHaveText('4');
  await expect(page.locator('[data-action="demander-suggestions"]')).toBeEnabled();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E6-ia');
  await page.locator('[data-action="fermer-ia"]').click();
  await expect(page.locator('[data-role="resultat-ia"]')).toBeHidden();
});

test('E7 filtre « Rapprochés » seul : une ligne par association ; un clic ouvre la fenêtre de l\'association avec ses deux articles', async ({ page }, info) => {
  await ouvrirEcran(page);
  await page.locator('[data-filtre="valide"]').click();
  await expect(page.locator('tr[data-association]')).toHaveCount(1);
  const l = page.locator('tr[data-association="r1"]');
  await expect(l).toContainText('Planche sapin 27');
  await expect(l).toContainText('Bois du Sud');
  await expect(l).toContainText('Fer et Fils');
  await expect(l.locator('.pastille-rapprochement')).toHaveText('Groupe · 2');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E7-associations');
  await l.locator('.pastille-rapprochement').click();
  await expect(fenetre(page).locator('li[data-article]')).toHaveCount(2);
  await expect(fenetre(page).locator('li[data-article="a2"] .dg-lieu')).toContainText('Agence Nord'); // villes d'achat lues dans la vue des prix
  await expect(fenetre(page).locator('li[data-article="a1"]')).toContainText('validé');
  await expect(enregistrer(page)).toBeDisabled(); // rien n'a changé : « Rien à enregistrer. »
  await expect(fenetre(page).locator('.fa-message')).toHaveText('Rien à enregistrer.');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E7-fenetre');
  await page.locator('[data-action="assoc-retour"]').click();
  await expect(fenetre(page)).toHaveCount(0);
});

test('E8 export : le bouton « Exporter » de l\'écran et la section « Sauvegarde » de Réglages donnent un fichier CSV', async ({ page }, info) => {
  await ouvrirEcran(page);
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-articles"]').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^articles-\d{4}-\d{2}-\d{2}\.csv$/);
  const contenu = await readFile(await telechargement.path(), 'utf8');
  expect(contenu.startsWith('﻿Fournisseur;Référence;Désignation;Unité;Dernier prix HT;')).toBe(true);
  expect(contenu.split('\r\n').filter(Boolean)).toHaveLength(8); // en-têtes + 7 articles
  expect(contenu).toContain('Bois du Sud;PL27;Planche sapin 27 mm;u;10;01/03/2026;1;Validé;Planche sapin 27;u;1');
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await ouvrirSectionReglages(page, 'Achats');
  await expect(page.locator('#reglages-export-achatsarticles')).toBeVisible();
  await expect(page.locator('[data-role="aucun-reglage"]')).toHaveCount(0);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E8-reglages');
  const [second] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-achatsarticles"]').click()]);
  expect(second.suggestedFilename()).toMatch(/^articles-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('E9 connexion non réglée : la carte d\'état avec le lien vers Réglages > Connexion à la base, aucune lecture', async ({ page }, info) => {
  await installerFausseBase(page);
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.locator('[data-role="achats-etat"]')).toHaveAttribute('data-etat', 'non-regle');
  await expect(page.locator('[data-role="achats-etat-texte"]')).toHaveText('Connexion à la base non réglée : Réglages > Connexion à la base');
  await expect(page.locator('tr[data-article]')).toHaveCount(0);
  await expect(page.locator('[data-action="demander-suggestions"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__base.etat.lectures.length)).toBe(0);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E9-non-regle');
});

test('E10 une écriture refusée par le serveur : le message du serveur est dit, la fenêtre reste ouverte, rien d\'autre n\'est envoyé', async ({ page }, info) => {
  await ouvrirEcran(page, { refus: { creer_article_reference: 'Création impossible pour l’instant.' } });
  await ligne(page, 'a3').locator('input[type=checkbox]').check();
  await ligne(page, 'a4').locator('input[type=checkbox]').check();
  await page.locator('[data-action="ouvrir-association"]').click();
  const coefs = page.locator('[data-role="assoc-coef"]');
  await coefs.nth(0).fill('1');
  await coefs.nth(1).fill('1');
  await enregistrer(page).click();
  await expect(fenetre(page).locator('.erreur[role="alert"]:not([hidden])')).toContainText('Création impossible pour l’instant.');
  await expect(fenetre(page)).toBeVisible();
  expect(await appels(page)).toEqual(['creer_article_reference']);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E10-refus');
  if (estTelephone(page)) await expect(fenetre(page)).toBeInViewport();
});
