// Module Achats « Tableau de bord 2 » (PR 9) : un test par critère (le nom commence par son numéro), en format ordinateur ET téléphone, avec une capture par point.
//  T1 Dirigeant (chiffres, graphique, tableau, clair et sombre) ; T2 lecture seule (que des GET sur des vues v_td_*, colonnes nommées, badge seul) ; T3 filtres : Période et Chantier communs, mémoire par onglet ;
//  T4 Liste des factures (rappel « à valider », période cachée dite, export CSV) ; T5 Prix et hausses (tableau, courbe, détail, hausses seulement, pont automatique) ; T6 Lignes et articles (vues, total, recherche) ;
//  T7 Fournisseurs et agences (liste complète, détail) ; T8 cas vide de chaque écran ; T9 cas d'erreur (panne de lecture, « Réessayer », panne des seuls prix) ; T10 plafond de pages dit à l'écran ;
//  T11 Réglages > Achats > Sauvegarde ; T12 accès non réglé : aucune donnée ; T13 plein écran.
// Le réseau est SIMULÉ par le crochet d'émulateurs (window.__accesBase, voir js/os/acces-base.js) : aucun appel réseau réel. Données : tests/fixtures/achats/tableauachats.js (fictives).
// Captures dans tests/e2e/captures/tableauachats/ (non commitées), une par point, nommée avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, ecrireDocument, attendreCalme, jour, ouvrirSectionReglages } from './outils.js';
import { jeuTableauAchats } from '../fixtures/achats/tableauachats.js';

const DOSSIER = fileURLToPath(new URL('./captures/tableauachats/', import.meta.url));
async function capturer(page, info, nom) {
  await page.waitForTimeout(700); // laisse finir l'animation des graphiques (300 ms) avant la capture
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: {} });
const ROUTE = 'tableauachats/tableau';
const onglet = (page, cle) => page.locator(`.ta-onglets [data-onglet="${cle}"]`);
const panneau = (page, cle) => page.locator(`.ta-grille[data-onglet="${cle}"]`);
const clair = (page) => page.evaluate(() => { document.documentElement.dataset.theme = 'clair'; });
const sombre = (page) => page.evaluate(() => { document.documentElement.dataset.theme = 'sombre'; });
const graphiquesPrets = (page, n = 1) => expect(page.locator('[data-role="graphique"][data-pret="1"]')).toHaveCount(n);

/** Pose la connexion (réglages enregistrés) et le faux réseau de la base AVANT l'ouverture de l'appli. `modes` : panne | pannePrix | vide | plafond (changeables ensuite dans window.__mode). */
async function poserBase(page, modes = {}) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  const jeu = jeuTableauAchats(jour);
  await page.addInitScript(([donnees, m]) => {
    window.__requetes = [];
    window.__mode = { ...m };
    const rep = (statut, data, entetes = {}) => new Response(JSON.stringify(data), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    window.__accesBase = {
      jeton: 'jeton-fictif',
      claims: { role: 'authenticated', espace_base: 'espace-essai' },
      fetchImpl: async (url, init = {}) => {
        const u = new URL(url);
        window.__requetes.push({ hote: u.hostname, chemin: u.pathname, requete: Object.fromEntries(u.searchParams), methode: init.method, autorisation: (init.headers || {}).Authorization });
        if (!u.pathname.startsWith('/rest/v1/')) return rep(404, { message: 'inconnu' });
        const vue = u.pathname.replace('/rest/v1/', '');
        const debut = Number(u.searchParams.get('offset') || 0);
        const lot = Number(u.searchParams.get('limit') || 1000);
        if (window.__mode.panne) return rep(500, { message: 'panne simulée' });
        if (window.__mode.pannePrix && vue.startsWith('v_td_prix')) return rep(500, { message: 'panne simulée' });
        if (window.__mode.vide) return rep(200, [], { 'Content-Range': '*/0' });
        if (window.__mode.plafond && vue === 'v_td_factures') {
          const modele = donnees.v_td_factures[0];
          const part = Array.from({ length: lot }, (_, i) => ({ ...modele, facture_id: `plafond-${debut + i}` }));
          return rep(200, part, { 'Content-Range': `${debut}-${debut + lot - 1}/500000` });
        }
        const lignes = donnees[vue];
        if (!lignes) return rep(404, { message: 'inconnu' });
        const part = lignes.slice(debut, debut + lot);
        return rep(200, part, { 'Content-Range': part.length ? `${debut}-${debut + part.length - 1}/${lignes.length}` : `*/${lignes.length}` });
      },
    };
  }, [jeu, modes]);
}
const ouvrir = async (page) => {
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.getByRole('heading', { name: 'Tableau de bord 2', level: 1 })).toBeVisible();
  await expect(panneau(page, 'dirigeant')).toBeVisible();
};
const aller = async (page, cle) => { await onglet(page, cle).click(); await expect(onglet(page, cle)).toHaveAttribute('aria-pressed', 'true'); };
const requetes = (page) => page.evaluate(() => window.__requetes);
const filtre = (page, id) => page.locator(`.ta-fb-item[data-filtre="${id}"]`);
async function choisirDansFiltre(page, id, valeurs) {
  await filtre(page, id).locator('.ta-fb-bouton').first().click();
  for (const v of valeurs) await page.locator('.ta-fb-menu').getByLabel(v, { exact: true }).check();
  await page.locator('.ta-fb-menu .ta-fb-valider').click();
}

test('T1 Dirigeant : les quatre chiffres, le résumé du jour, le graphique des achats par mois et les chantiers en cours, en clair et en sombre', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await expect(page.locator('.ta-onglets .ta-bouton')).toHaveText(['Dirigeant', 'Pilotage', 'Liste des factures', 'Prix et hausses', 'Lignes et articles', 'Fournisseurs et agences']);
  await expect(onglet(page, 'dirigeant')).toHaveAttribute('aria-pressed', 'true');
  const chiffres = panneau(page, 'dirigeant').locator('[data-role="chiffre"]');
  await expect(chiffres).toHaveCount(4);
  await expect(chiffres.nth(0)).toContainText('À décider');
  await expect(chiffres.nth(0)).toContainText('2 factures');
  await expect(chiffres.nth(1)).toContainText('Achats du mois');
  await expect(chiffres.nth(2)).toContainText('Chantiers à surveiller');
  await expect(chiffres.nth(3)).toContainText('Les 3 premiers fournisseurs');
  await expect(panneau(page, 'dirigeant').getByText('Résumé du jour')).toBeVisible();
  await expect(panneau(page, 'dirigeant').locator('[data-role="tableau"] tbody tr')).toHaveCount(3);
  await graphiquesPrets(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T1-dirigeant-sombre');
  await clair(page);
  await graphiquesPrets(page); // le thème change : le graphique est redessiné avec les couleurs du thème clair
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T1-dirigeant-clair');
  await sombre(page);
  await graphiquesPrets(page);
});

test('T2 lecture seule : que des lectures (GET) de vues v_td_*, colonnes nommées (jamais « * »), tri donné, le badge seul comme clé, aucune écriture', async ({ page }) => {
  await poserBase(page);
  await ouvrir(page);
  for (const cle of ['pilotage', 'liste', 'prix', 'lignes', 'fournisseurs']) { await aller(page, cle); await attendreCalme(page); }
  const r = await requetes(page);
  expect(r.length).toBeGreaterThan(5);
  const vues = new Set(r.map((x) => x.chemin.replace('/rest/v1/', '')));
  expect([...vues].sort()).toEqual(['v_td_chantiers', 'v_td_factures', 'v_td_fournisseurs_agences', 'v_td_fournisseurs_factures', 'v_td_fournisseurs_fiches', 'v_td_prix_evolution', 'v_td_prix_lignes', 'v_td_prix_ponts']);
  for (const x of r) {
    expect(x.methode).toBe('GET');
    expect(x.hote).toBe('base.exemple.test');
    expect(x.requete.select).toMatch(/^[a-z_]+(,[a-z_]+)*$/);
    expect(x.requete.select).not.toContain('*');
    expect(x.requete.order).toBeTruthy();
    expect(x.requete.or).toBeUndefined();
    expect(x.autorisation).toBe('Bearer jeton-fictif');
  }
  // Chaque vue n'est lue qu'une fois à l'ouverture de son onglet (les lignes d'achat sont partagées par Prix, Lignes et Fournisseurs).
  expect(r.filter((x) => x.chemin.endsWith('/v_td_prix_lignes')).length).toBe(1);
});

test('T3 filtres : Période et Chantier sont communs à Pilotage, Liste, Prix, Lignes et Fournisseurs ; Statut et Fournisseur sont propres à la Liste ; Dirigeant n\'en a pas', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await expect(page.locator('.ta-fb-barre')).toHaveCount(0);
  await aller(page, 'pilotage');
  await expect(filtre(page, 'periode')).toContainText('12 mois glissants');
  await expect(page.locator('.ta-fb-item')).toHaveCount(2);
  await choisirDansFiltre(page, 'chantier', ['Maison Essai']);
  await expect(filtre(page, 'chantier')).toContainText('Maison Essai');
  await capturer(page, info, 'T3-filtres-pilotage');
  await aller(page, 'liste');
  await expect(page.locator('.ta-fb-item')).toHaveCount(4); // Période, Chantier, Statut, Fournisseur
  await expect(filtre(page, 'chantier')).toContainText('Maison Essai');
  await choisirDansFiltre(page, 'statut', ['Refusée']);
  await expect(panneau(page, 'liste').locator('tbody tr')).toHaveCount(1);
  await aller(page, 'prix');
  await expect(filtre(page, 'chantier')).toContainText('Maison Essai');
  await expect(page.locator('.ta-fb-item[data-filtre="statut"]')).toHaveCount(0);
  await aller(page, 'liste');
  await expect(filtre(page, 'statut')).toContainText('Refusée'); // la mémoire de la Liste est gardée
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(filtre(page, 'chantier')).not.toContainText('Maison Essai');
  await expect(page.locator('.ta-fb-item[data-filtre="periode"] .ta-fb-actif')).toHaveCount(1);
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('T4 Liste des factures : le rappel « à valider » dit les factures cachées par la période, l\'export CSV ne contient que ce qui est affiché (jamais une refusée archivée)', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await aller(page, 'liste');
  const lignes = panneau(page, 'liste').locator('[data-role="tableau"] tbody tr');
  await expect(lignes).toHaveCount(16); // 18 factures dans le jeu, dont 1 refusée archivée (cachée) et 1 trop ancienne pour la période
  await expect(page.locator('[data-role="rappel-a-valider"]')).toContainText('2 à valider');
  await expect(page.locator('[data-role="rappel-a-valider"]')).toContainText('1 facture à valider hors de la période.');
  await capturer(page, info, 'T4-liste-rappel');
  await page.locator('[data-action="n-a-valider"]').click();
  await expect(lignes).toHaveCount(2);
  await expect(filtre(page, 'statut')).toContainText('À valider');
  await expect(page.locator('[data-role="rappel-a-valider"]')).toHaveCount(1);
  await capturer(page, info, 'T4-liste-a-valider');
  await expect(page.locator('[data-action="toutes-periodes"]')).toHaveCount(0); // la période est déjà retirée : plus rien de caché
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(lignes).toHaveCount(16);
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter"]').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^tableau-achats-factures-\d{4}-\d{2}-\d{2}\.csv$/);
  const texte = (await readFile(await telechargement.path(), 'utf8'));
  expect(texte.startsWith('﻿Date;Fournisseur;Numéro;Chantier;Statut;Montant HT;Alertes')).toBe(true);
  expect(texte.trim().split('\r\n')).toHaveLength(17);
  expect(texte).not.toContain('F-1018'); // la refusée archivée
  expect(texte).not.toMatch(/iban|@/i);
  expect(texte).toContain('-300,00'); // l'avoir
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('T5 Prix et hausses : un article par fournisseur, la variation en rouge ou en vert, la courbe en base 100 et le détail des achats au clic, « hausses seulement », le pont automatique', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await aller(page, 'prix');
  const lignes = panneau(page, 'prix').locator('[data-role="articles"] tbody tr');
  await expect(lignes).toHaveCount(5);
  await expect(panneau(page, 'prix').locator('[data-role="resume"]')).toContainText('5 articles achetés sur la sélection, dont 2 en hausse');
  const rond = panneau(page, 'prix').locator('tr[data-article="art-rond"]');
  await expect(rond).toContainText('▲ +20');
  await expect(rond).toContainText('Rapprochement validé');
  await expect(panneau(page, 'prix').locator('tr[data-article="art-vis"]')).toContainText('Peu de données');
  await capturer(page, info, 'T5-prix-tableau');
  await rond.click();
  const detail = panneau(page, 'prix').locator('[data-role="detail-article"]');
  await expect(detail).toBeVisible();
  await graphiquesPrets(page);
  await expect(detail.locator('[data-role="achats-article"] tbody tr')).toHaveCount(3);
  await expect(detail.locator('[data-role="autres-fournisseurs"] tbody tr')).toHaveCount(1); // le même article de référence chez le négoce
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T5-prix-detail-sombre');
  await clair(page);
  await graphiquesPrets(page);
  await capturer(page, info, 'T5-prix-detail-clair');
  await sombre(page);
  await panneau(page, 'prix').locator('tr[data-article="art-treillis"]').click();
  await expect(panneau(page, 'prix').locator('.ta-prix-pont')).toContainText('Rapprochement automatique');
  await page.locator('[data-role="hausses"]').check();
  await expect(lignes).toHaveCount(2);
  await page.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(lignes).toHaveCount(5);
});

test('T6 Lignes et articles : six présentations (par article de référence d\'abord), le total de la sélection, la recherche, le graphique et le tableau de chaque présentation', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await aller(page, 'lignes');
  await expect(page.locator('.ta-lignes-vues .ta-fb-bouton')).toHaveText(['Par article de référence', 'Par article', 'Par chantier', 'Par fournisseur', 'Par mois', 'Lignes']);
  await expect(page.locator('[data-vue="reference"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-role="total"]')).toContainText('12 lignes');
  await graphiquesPrets(page);
  await capturer(page, info, 'T6-lignes-reference');
  for (const vue of ['article', 'chantier', 'fournisseur', 'mois']) {
    await page.locator(`[data-vue="${vue}"]`).click();
    await expect(page.locator(`[data-vue="${vue}"]`)).toHaveAttribute('aria-pressed', 'true');
    await graphiquesPrets(page);
    await expect(panneau(page, 'lignes').locator('[data-role="tableau"]')).toHaveCount(1);
  }
  await page.locator('[data-vue="lignes"]').click();
  await expect(panneau(page, 'lignes').locator('[data-role="lignes-achat"] tbody tr')).toHaveCount(12);
  await page.locator('[data-role="recherche"]').fill('treillis');
  await expect(panneau(page, 'lignes').locator('[data-role="lignes-achat"] tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-role="total"]')).toContainText('2 lignes');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T6-lignes-recherche');
  await page.locator('[data-role="recherche"]').fill('introuvable-xyz');
  await expect(panneau(page, 'lignes').locator('[data-role="tuile-vide"]')).toContainText('Aucune ligne avec ces filtres');
  await page.locator('[data-action="tout-afficher"]').click();
  await expect(panneau(page, 'lignes').locator('[data-role="lignes-achat"] tbody tr')).toHaveCount(12);
});

test('T7 Fournisseurs et agences : tous les fournisseurs enregistrés (même sans facture), le détail au clic : agences, dépenses par agence et articles', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await aller(page, 'fournisseurs');
  const lignes = panneau(page, 'fournisseurs').locator('[data-role="fournisseurs"] tbody tr');
  await expect(lignes).toHaveCount(4);
  await expect(panneau(page, 'fournisseurs').locator('tr[data-fournisseur="f:f-negoce"]')).toContainText('Négoce Imaginaire');
  await expect(panneau(page, 'fournisseurs').locator('[data-role="resume"]')).toContainText('4 fournisseurs, dont 3 avec au moins une facture acceptée');
  await capturer(page, info, 'T7-fournisseurs');
  await panneau(page, 'fournisseurs').locator('tr[data-fournisseur="f:f-beton"]').click();
  const detail = page.locator('[data-role="detail-fournisseur"]');
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Béton Exemple SARL : ses agences')).toBeVisible();
  await graphiquesPrets(page);
  await expect(detail.locator('[data-role="tableau"]').first().locator('tbody tr')).toHaveCount(2);
  await expect(detail.locator('[data-role="articles-fournisseur"], [data-role="tableau"]').last()).toContainText('Béton C25/30');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T7-fournisseur-detail');
  await detail.getByRole('button', { name: 'Fermer le détail' }).click();
  await expect(detail).toHaveCount(0);
  await page.locator('[data-role="recherche"]').fill('999000111'); // le SIREN fictif d'un fournisseur
  await expect(lignes).toHaveCount(1);
});

test('T8 cas vide : chaque écran dit qu\'il n\'y a rien, sans graphique cassé ; « Exporter » sur une liste vide le dit', async ({ page }, info) => {
  await poserBase(page, { vide: true });
  await ouvrir(page);
  await expect(panneau(page, 'dirigeant').locator('[data-role="tuile-vide"]').first()).toHaveText('Pas encore de données.');
  await expect(panneau(page, 'dirigeant').locator('[data-role="chiffre"]').first()).toContainText('—');
  await capturer(page, info, 'T8-vide-dirigeant');
  await aller(page, 'pilotage');
  await expect(panneau(page, 'pilotage').locator('[data-role="tuile-vide"]').first()).toBeVisible();
  await aller(page, 'liste');
  await expect(panneau(page, 'liste').locator('[data-role="tuile-vide"]')).toContainText('Aucun résultat avec ces filtres'); // la période du haut est active
  await page.locator('[data-action="exporter"]').click();
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'Rien à exporter' }).first()).toBeVisible();
  await aller(page, 'prix');
  await expect(panneau(page, 'prix').locator('[data-role="tuile-vide"]')).toContainText('Aucun achat sur cette sélection.');
  await aller(page, 'lignes');
  await expect(panneau(page, 'lignes').locator('[data-role="tuile-vide"]')).toContainText('Aucune ligne d’achat sur cette sélection.');
  await aller(page, 'fournisseurs');
  await expect(panneau(page, 'fournisseurs').locator('[data-role="tuile-vide"]')).toContainText('Aucun fournisseur enregistré pour l’instant.');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T8-vide-fournisseurs');
});

test('T9 cas d\'erreur : la lecture échoue : message clair et « Réessayer » ; une panne des seuls prix ne touche pas les autres onglets', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la base répond 500 exprès' });
  await poserBase(page, { panne: true });
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.locator('[data-etat="erreur"]')).toContainText('Les chiffres n’ont pas pu être lus. Réessaie dans un instant.');
  await expect(page.getByRole('heading', { name: 'Tableau de bord 2', level: 1 })).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T9-erreur');
  await page.evaluate(() => { window.__mode = { pannePrix: true }; });
  await page.locator('[data-etat="erreur"] [data-action="reessayer"]').click();
  await expect(panneau(page, 'dirigeant')).toBeVisible();
  await aller(page, 'prix');
  await expect(page.locator('[data-etat="erreur"]')).toContainText('Les prix n’ont pas pu être lus. Réessaie dans un instant.');
  await aller(page, 'liste'); // les factures, elles, se lisent
  await expect(panneau(page, 'liste').locator('tbody tr').first()).toBeVisible();
  await capturer(page, info, 'T9-erreur-prix-seuls');
  await page.evaluate(() => { window.__mode = {}; });
  await aller(page, 'prix');
  await page.locator('[data-etat="erreur"] [data-action="reessayer"]').click();
  await expect(panneau(page, 'prix').locator('[data-role="articles"] tbody tr')).toHaveCount(5);
});

test('T10 plafond de pages : quand la lecture atteint son plafond, l\'écran le dit (jamais une liste coupée présentée comme complète)', async ({ page }, info) => {
  await poserBase(page, { plafond: true });
  await ouvrir(page);
  await expect(page.locator('[data-role="plafond"]')).toContainText('Lecture limitée à 20 pages de 1000 lignes : la liste est peut-être incomplète.');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T10-plafond');
});

test('T11 Réglages > Achats > Sauvegarde : « Exporter mes données » télécharge le fichier des factures', async ({ page }, info) => {
  await poserBase(page);
  await connecter(page, undefined, { route: 'reglages' });
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await page.locator('[data-role="sauvegardes-separees"]').click(); // depuis le 26/11/2026, la sauvegarde de chaque module est repliée sous « Sauvegardes séparées »
  await expect(page.locator('#reglages-export-tableauachats')).toBeVisible();
  await capturer(page, info, 'T11-reglages');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-tableauachats"]').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^tableau-achats-factures-\d{4}-\d{2}-\d{2}\.csv$/);
  const texte = await readFile(await telechargement.path(), 'utf8');
  expect(texte).toContain('Aciers Essai SAS');
  expect(texte).not.toContain('F-1018'); // la refusée archivée
});

test('T12 accès non réglé : le titre et l\'état s\'affichent, aucun onglet, aucune donnée, aucune lecture', async ({ page }, info) => {
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.getByRole('heading', { name: 'Tableau de bord 2', level: 1 })).toBeVisible();
  await expect(page.locator('[data-role="achats-etat"]')).toHaveAttribute('data-etat', 'non-regle');
  await expect(page.locator('.ta-onglets')).toHaveCount(0);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'T12-non-regle');
});

test('T13 plein écran : la zone des graphiques prend toute la fenêtre, « Quitter » et Échap la rendent', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await graphiquesPrets(page);
  await page.locator('[data-action="plein-ecran"]').click();
  await expect(page.locator('.ta-zone.ta-plein')).toBeVisible();
  await graphiquesPrets(page);
  await capturer(page, info, 'T13-plein-ecran');
  await page.locator('[data-action="quitter-plein"]').click();
  await expect(page.locator('.ta-zone.ta-plein')).toHaveCount(0);
  await page.locator('[data-action="plein-ecran"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ta-zone.ta-plein')).toHaveCount(0);
  expect(await sansDefilementHorizontal(page)).toBe(true);
});
