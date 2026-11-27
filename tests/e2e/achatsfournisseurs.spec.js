// Module Achats « Fournisseurs » (PR 5) : un test par critère (le nom commence par son numéro), en format ordinateur ET téléphone, avec une capture par point.
//  F1 la liste (quatre états, compteur, IBAN en groupes de 4) ; F2 les lectures nomment leurs colonnes, sont triées, et n'envoient que le badge à la base ; F3 recherche, filtre par état, pastille, « Tout effacer » ;
//  F4 tri mémorisé ; F5 confirmer un IBAN (ticket à usage unique, corps exact, texte obligatoire) ; F6 révoquer ; F7 cas d'erreur : le serveur refuse, la saisie reste ; F8 cas vide ;
//  F9 cas d'erreur de lecture + « Réessayer » ; F10 export CSV sans IBAN ; F11 Réglages > Achats > Sauvegarde ; F12 pas de défilement horizontal ; F13 accès non réglé, aucune donnée affichée.
// Le réseau est SIMULÉ par le crochet d'émulateurs (window.__accesBase, voir js/os/acces-base.js) : aucun appel réseau réel. Adresses construites dans le test (aucune adresse d'exemple dans l'appli).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, attendreCalme, ecrireDocument, estTelephone, ouvrirSectionReglages } from './outils.js';
import { jeuDemo } from '../fixtures/achats/fournisseurs.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatsfournisseurs/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('hook.exemple.test', '/actions') } });
const ROUTE = 'achatsfournisseurs/liste';
const ligne = (page, cle) => page.locator(`tr.ligne-liste[data-cle="${cle}"]`);
const CLE_ACIERS = 'f-aciers|FR7630006000011234567890189';
const CLE_NEGOCE = 'f-negoce|FR1420041010050500013M02606';
const CLE_BETON = 'f-beton|DE89370400440532013000';
const CLE_QUINC = 'f-quinc|FR7611111222223333344444555';

/** Pose la connexion (réglages enregistrés) et le faux réseau de la base AVANT l'ouverture de l'appli. `jeu` : { file, confirmations, fournisseurs }. */
async function poserBase(page, jeu = jeuDemo(), claims = { role: 'authenticated', espace_base: 'espace-essai' }) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await page.addInitScript(([donnees, c]) => {
    const etat = JSON.parse(JSON.stringify(donnees));
    window.__requetes = [];
    window.__mode = {};
    let compteur = 0;
    const rep = (statut, data, entetes = {}) => new Response(JSON.stringify(data), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    window.__accesBase = {
      jeton: 'jeton-fictif',
      claims: c,
      fetchImpl: async (url, init = {}) => {
        const u = new URL(url);
        const corps = init.body ? JSON.parse(init.body) : null;
        window.__requetes.push({ hote: u.hostname, chemin: u.pathname, requete: Object.fromEntries(u.searchParams), methode: init.method, corps, autorisation: (init.headers || {}).Authorization });
        const pageDe = (lignes) => {
          const debut = Number(u.searchParams.get('offset') || 0); const lot = Number(u.searchParams.get('limit') || 1000);
          const part = lignes.slice(debut, debut + lot);
          return rep(200, part, { 'Content-Range': part.length ? `${debut}-${debut + part.length - 1}/${lignes.length}` : `*/${lignes.length}` });
        };
        if (u.pathname === '/rest/v1/rpc/demander_ticket_n8n') { compteur += 1; return rep(200, `ticket-${compteur}`); }
        if (u.pathname.startsWith('/rest/v1/')) {
          if (window.__mode.lecture === 'panne') return rep(500, { message: 'panne simulée' });
          if (window.__mode.vide) return pageDe([]);
          if (u.pathname.endsWith('/fournisseurs_a_verifier')) return pageDe(etat.file);
          if (u.pathname.endsWith('/ibans_confirmes')) return pageDe(etat.confirmations);
          if (u.pathname.endsWith('/fournisseurs')) return pageDe(etat.fournisseurs);
          return rep(404, { message: 'inconnu' });
        }
        // Webhook des actions métier.
        if (window.__mode.action === 'refus') return rep(409, { ok: false, erreur: 'Cet IBAN est déjà confirmé pour un autre fournisseur.' });
        if (corps.action === 'confirmer_iban') {
          const i = etat.file.findIndex((l) => l.fournisseur_id === corps.fournisseur_id && l.iban === corps.iban);
          if (i >= 0) {
            const l = etat.file.splice(i, 1)[0];
            etat.confirmations.unshift({ id: `ic-${compteur}`, fournisseur_id: l.fournisseur_id, siren: l.siren, iban: l.iban, facture_id: corps.facture_id, moyen_verification: corps.moyen_verification, confirme_par: 'a@b.fr', confirme_le: '2026-11-24T10:00:00Z', revoque_le: null, motif_revocation: null });
          }
          return rep(200, { ok: true, existait: false });
        }
        if (corps.action === 'revoquer_iban') {
          const i = etat.confirmations.findIndex((x) => x.id === corps.id);
          if (i >= 0) {
            const x = etat.confirmations.splice(i, 1)[0];
            etat.file.push({ fournisseur_id: x.fournisseur_id, siren: x.siren, nom: (etat.fournisseurs.find((f) => f.id === x.fournisseur_id) || {}).nom || null, iban: x.iban, nb_factures: 1, derniere_facture_le: '2026-11-01T09:00:00Z', a_une_facture_acceptee: false, vu_seulement_sur_refusee: false, facture_a_confirmer: x.facture_id, revoque_le: '2026-11-24T11:00:00Z', motif_revocation: corps.motif, confirme_pour_autre_siren: false, vu_chez_autre_siren: false });
          }
          return rep(200, { ok: true });
        }
        return rep(200, { ok: false });
      },
    };
  }, [jeu, claims]);
}
const ouvrir = async (page) => { await connecter(page, undefined, { route: ROUTE }); await expect(page.locator('tr.ligne-liste').first()).toBeVisible(); };
const requetes = (page) => page.evaluate(() => window.__requetes);
const compteur = (page) => page.locator('.compteur-liste');

test('F1 la liste montre un IBAN par ligne, avec son état en texte, le compteur et l\'IBAN en groupes de 4 (ordinateur et téléphone)', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await expect(page.getByRole('heading', { name: 'Fournisseurs', level: 1 })).toBeVisible();
  await expect(compteur(page)).toHaveText('4 IBAN · 3 à vérifier · 1 confirmé');
  await expect(page.locator('tr.ligne-liste')).toHaveCount(4);
  await expect(ligne(page, CLE_ACIERS).locator('[data-role="etat"]')).toHaveText('À vérifier');
  await expect(ligne(page, CLE_NEGOCE).locator('[data-role="etat"]')).toHaveText('À vérifier : alerte');
  await expect(ligne(page, CLE_BETON).locator('[data-role="etat"]')).toHaveText('Confirmation révoquée');
  await expect(ligne(page, CLE_QUINC).locator('[data-role="etat"]')).toHaveText('Confirmé');
  await expect(ligne(page, CLE_ACIERS)).toContainText('FR76 3000 6000 0112 3456 7890 189');
  await expect(ligne(page, CLE_ACIERS)).toContainText('Aciers Exemple');
  await expect(ligne(page, CLE_BETON)).toContainText('Confirmation révoquée le 01/11/2026 : RIB changé');
  await expect(ligne(page, CLE_QUINC)).toContainText('Quincaillerie Fictive'); // le nom d'une confirmée vient de la table des fournisseurs
  await capturer(page, info, 'F1-liste');
});

test('F2 les lectures nomment leurs colonnes, sont triées, ne contiennent aucune étoile et n\'envoient que le badge à la base ; les fournisseurs portent leur nom', async ({ page }) => {
  await poserBase(page);
  await ouvrir(page);
  const lectures = (await requetes(page)).filter((r) => r.chemin.startsWith('/rest/v1/') && !r.chemin.includes('/rpc/'));
  const de = (nom) => lectures.find((r) => r.chemin === `/rest/v1/${nom}`);
  expect(de('fournisseurs_a_verifier').requete.select).toBe('fournisseur_id,siren,nom,iban,nb_factures,derniere_facture_le,a_une_facture_acceptee,vu_seulement_sur_refusee,facture_a_confirmer,revoque_le,motif_revocation,confirme_pour_autre_siren,vu_chez_autre_siren');
  expect(de('fournisseurs_a_verifier').requete.order).toBe('fournisseur_id.asc,iban.asc');
  expect(de('ibans_confirmes').requete.select).toBe('id,fournisseur_id,siren,iban,facture_id,moyen_verification,confirme_par,confirme_le,revoque_le,motif_revocation');
  expect(de('ibans_confirmes').requete.order).toBe('confirme_le.desc,id.asc');
  expect(de('fournisseurs').requete.select).toBe('id,nom');
  expect(de('fournisseurs').requete.order).toBe('id.asc');
  for (const r of lectures) { expect(r.requete.select).not.toContain('*'); expect(r.methode).toBe('GET'); expect(r.autorisation).toBe('Bearer jeton-fictif'); }
});

test('F3 la recherche cherche dans le nom, le SIREN et l\'IBAN (avec ou sans espaces) ; le filtre par état pose une pastille ; « Tout effacer » rend tout', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  const recherche = page.getByRole('searchbox', { name: 'Rechercher un fournisseur' });
  await recherche.fill('negoce');
  await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
  await expect(compteur(page)).toHaveText('1 sur 4 IBAN · 3 à vérifier · 1 confirmé');
  await recherche.fill('FR76 3000 6000 0112');
  await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
  await expect(ligne(page, CLE_ACIERS)).toBeVisible();
  await recherche.fill('900000003');
  await expect(ligne(page, CLE_BETON)).toBeVisible();
  // Rien ne correspond : cas « sans résultat » avec « Tout effacer ».
  await recherche.fill('zzzz');
  await expect(page.locator('[data-etat="sans-resultat"]')).toContainText('Aucun fournisseur ne correspond à ta recherche.');
  await capturer(page, info, 'F3-sans-resultat');
  await page.locator('[data-action="tout-effacer"]').click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(4);
  await expect(recherche).toHaveValue('');
  // Filtre par état.
  await page.locator('[data-action="filtres"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.getByLabel('Confirmé', { exact: true }).check();
  await fenetre.getByLabel('Confirmation révoquée').check();
  await fenetre.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(2);
  await expect(page.locator('.pastille-filtre')).toHaveCount(2);
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('2');
  await capturer(page, info, 'F3-filtre-etat');
  await page.getByRole('button', { name: 'Retirer le filtre : État : Confirmé' }).click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
  await page.locator('[data-action="filtres"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(4);
  await expect(page.locator('.pastille-filtre')).toHaveCount(0);
});

test('F4 le tri « Nom » range les fournisseurs, la flèche inverse le sens, et le choix est gardé au rechargement', async ({ page }) => {
  await poserBase(page);
  await ouvrir(page);
  const noms = () => page.locator('tr.ligne-liste .cellule-nom').allTextContents();
  await page.getByRole('combobox', { name: 'Trier par' }).selectOption('nom');
  expect(await noms()).toEqual(['Aciers Exemple', 'Béton Démo', 'Négoce Démo', 'Quincaillerie Fictive']);
  await page.locator('[data-action="inverser-tri"]').click();
  expect(await noms()).toEqual(['Quincaillerie Fictive', 'Négoce Démo', 'Béton Démo', 'Aciers Exemple']);
  await page.reload();
  await expect(page.locator('tr.ligne-liste').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Trier par' })).toHaveValue('nom');
  expect(await noms()).toEqual(['Quincaillerie Fictive', 'Négoce Démo', 'Béton Démo', 'Aciers Exemple']);
});

test('F5 confirmer un IBAN : le texte est obligatoire, l\'action part avec un ticket neuf (jamais le badge) et le corps exact, la ligne passe à « Confirmé »', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await ligne(page, CLE_ACIERS).locator('[data-action="menu-fournisseur"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Confirmer']);
  await page.getByRole('menuitem', { name: 'Confirmer', exact: true }).click();
  const formulaire = page.locator('[data-role="formulaire-iban"]');
  await expect(formulaire).toContainText('Aciers Exemple · SIREN 900000001');
  await expect(formulaire).toContainText('IBAN FR76 3000 6000 0112 3456 7890 189');
  await capturer(page, info, 'F5-formulaire');
  // Texte trop court : message français, rien n'est envoyé.
  await formulaire.getByRole('textbox').fill('ab');
  await formulaire.getByRole('button', { name: 'Confirmer cet IBAN' }).click();
  await expect(formulaire.locator('[data-role="erreur-action"]')).toHaveText('Comment as-tu vérifié cet IBAN ? : écris au moins 3 caractères.');
  expect((await requetes(page)).filter((r) => r.hote === 'hook.exemple.test')).toHaveLength(0);
  await formulaire.getByRole('textbox').fill('  Appel au numéro connu ');
  await formulaire.getByRole('button', { name: 'Confirmer cet IBAN' }).click();
  await expect(page.locator('.toast')).toContainText('IBAN confirmé');
  await expect(ligne(page, CLE_ACIERS).locator('[data-role="etat"]')).toHaveText('Confirmé');
  await expect(ligne(page, CLE_ACIERS)).toContainText('Vérifié : Appel au numéro connu');
  await expect(compteur(page)).toHaveText('4 IBAN · 2 à vérifier · 2 confirmés');
  await expect(page.locator('[data-role="formulaire-iban"]')).toHaveCount(0);
  const envoi = (await requetes(page)).filter((r) => r.hote === 'hook.exemple.test');
  expect(envoi).toHaveLength(1);
  expect(envoi[0].corps).toEqual({ action: 'confirmer_iban', fournisseur_id: 'f-aciers', iban: 'FR7630006000011234567890189', facture_id: 'fa-1', moyen_verification: 'Appel au numéro connu' });
  expect(envoi[0].autorisation).toBe('Bearer ticket-1'); // un ticket à usage unique, jamais le badge de connexion
  await capturer(page, info, 'F5-confirme');
});

test('F5 « Confirmer quand même » (alerte) et « Reconfirmer quand même » (révoqué) : l\'alerte est écrite et la mention part avec le texte', async ({ page }) => {
  await poserBase(page);
  await ouvrir(page);
  await ligne(page, CLE_NEGOCE).locator('[data-action="menu-fournisseur"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Confirmer quand même']);
  await page.getByRole('menuitem').click();
  const formulaire = page.locator('[data-role="formulaire-iban"]');
  await expect(formulaire).toContainText('appelle avant de le confirmer');
  await formulaire.getByRole('textbox').fill('Appel au gérant');
  await formulaire.getByRole('button', { name: 'Confirmer quand même' }).click();
  await expect(ligne(page, CLE_NEGOCE).locator('[data-role="etat"]')).toHaveText('Confirmé');
  await ligne(page, CLE_BETON).locator('[data-action="menu-fournisseur"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Reconfirmer quand même']);
  await page.getByRole('menuitem').click();
  await page.locator('[data-role="formulaire-iban"]').getByRole('textbox').fill('RIB papier reçu');
  await page.locator('[data-role="formulaire-iban"]').getByRole('button', { name: 'Confirmer quand même' }).click();
  await expect(ligne(page, CLE_BETON).locator('[data-role="etat"]')).toHaveText('Confirmé');
  const envois = (await requetes(page)).filter((r) => r.hote === 'hook.exemple.test').map((r) => r.corps.moyen_verification);
  expect(envois[0]).toBe('Confirmation malgré l’alerte (IBAN vu chez un autre fournisseur) : Appel au gérant');
  expect(envois[1]).toBe('Reconfirmation après révocation : RIB papier reçu');
});

test('F6 révoquer une confirmation : le motif est obligatoire, la ligne repasse en « Confirmation révoquée » avec son motif', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await ligne(page, CLE_QUINC).locator('[data-action="menu-fournisseur"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Révoquer']);
  await page.getByRole('menuitem').click();
  const formulaire = page.locator('[data-role="formulaire-iban"]');
  await expect(formulaire).toContainText('Pourquoi révoquer cette confirmation ? (obligatoire)');
  await formulaire.getByRole('button', { name: 'Révoquer' }).click();
  await expect(formulaire.locator('[data-role="erreur-action"]')).toHaveText('Pourquoi révoquer cette confirmation ? : écris au moins 3 caractères.');
  await capturer(page, info, 'F6-formulaire');
  await formulaire.getByRole('textbox').fill('RIB changé');
  await formulaire.getByRole('button', { name: 'Révoquer' }).click();
  await expect(page.locator('.toast')).toContainText('Confirmation révoquée');
  await expect(ligne(page, CLE_QUINC).locator('[data-role="etat"]')).toHaveText('Confirmation révoquée');
  await expect(ligne(page, CLE_QUINC)).toContainText('motif : RIB changé');
  const envoi = (await requetes(page)).filter((r) => r.hote === 'hook.exemple.test');
  expect(envoi[0].corps).toEqual({ action: 'revoquer_iban', id: 'ic-1', motif: 'RIB changé' });
});

test('F7 cas d\'erreur : le serveur refuse la confirmation : son message s\'affiche sous le formulaire, la saisie reste et rien ne change', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  await page.evaluate(() => { window.__mode.action = 'refus'; });
  await ligne(page, CLE_ACIERS).locator('[data-action="menu-fournisseur"]').click();
  await page.getByRole('menuitem').click();
  const formulaire = page.locator('[data-role="formulaire-iban"]');
  await formulaire.getByRole('textbox').fill('Appel au numéro connu');
  await formulaire.getByRole('button', { name: 'Confirmer cet IBAN' }).click();
  await expect(formulaire.locator('[data-role="erreur-action"]')).toHaveText('Cet IBAN est déjà confirmé pour un autre fournisseur.');
  await expect(page.locator('[data-role="erreur-envoi"]')).toHaveText('Cet IBAN est déjà confirmé pour un autre fournisseur.');
  await expect(formulaire.getByRole('textbox')).toHaveValue('Appel au numéro connu');
  await expect(formulaire.getByRole('button', { name: 'Confirmer cet IBAN' })).toBeEnabled();
  await expect(ligne(page, CLE_ACIERS).locator('[data-role="etat"]')).toHaveText('À vérifier');
  await capturer(page, info, 'F7-refus');
  await formulaire.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('[data-role="formulaire-iban"]')).toHaveCount(0);
});

test('F8 cas vide : aucune ligne dans la base : la phrase qui explique d\'où viennent les fournisseurs, sans tableau ni barre', async ({ page }, info) => {
  await poserBase(page, { file: [], confirmations: [], fournisseurs: [] });
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.locator('[data-etat="vide"]')).toContainText('Aucun IBAN de fournisseur pour l’instant. Ils apparaissent quand une facture dont le fournisseur est identifié est lue.');
  await expect(page.locator('table')).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toBeHidden();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'F8-vide');
});

test('F9 cas d\'erreur : une panne de la base à l\'ouverture donne un message clair, et « Réessayer » relit', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la base simulée répond par une erreur serveur' });
  await poserBase(page);
  await page.addInitScript(() => { window.__mode = { lecture: 'panne' }; });
  await connecter(page, undefined, { route: ROUTE, attendreAccueil: true });
  await expect(page.locator('[data-etat="erreur"]')).toContainText('Impossible de charger les fournisseurs. Vérifie ta connexion, puis réessaie.');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'F9-erreur');
  await page.evaluate(() => { window.__mode.lecture = null; });
  await page.locator('[data-action="reessayer"]').click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(4);
});

test('F10 « Exporter » télécharge la liste affichée en CSV (séparateur « ; », accents) : jamais d\'IBAN dans le fichier', async ({ page }) => {
  await poserBase(page);
  await ouvrir(page);
  await page.getByRole('searchbox', { name: 'Rechercher un fournisseur' }).fill('Démo');
  await expect(page.locator('tr.ligne-liste')).toHaveCount(2);
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-fournisseurs"]').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^fournisseurs-\d{4}-\d{2}-\d{2}\.csv$/);
  const contenu = await readFile(await telechargement.path(), 'utf8');
  expect(contenu.startsWith('﻿Fournisseur;SIREN;État;Nombre de factures;Dernière facture\r\n')).toBe(true);
  expect(contenu).toContain('Négoce Démo;900000002;À vérifier : alerte;2;15/11/2026');
  expect(contenu).toContain('Béton Démo;900000003;Confirmation révoquée;1;02/10/2026');
  expect(contenu).not.toContain('Aciers Exemple');
  expect(contenu).not.toMatch(/FR\d\d|DE\d\d/);
});

test('F11 Réglages > Achats : la section « Sauvegarde des fournisseurs » télécharge la liste complète', async ({ page }, info) => {
  await poserBase(page);
  await connecter(page, undefined, { route: 'reglages' });
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await page.locator('[data-role="sauvegardes-separees"]').click(); // depuis le 26/11/2026, la sauvegarde de chaque module est repliée sous « Sauvegardes séparées »
  await expect(page.locator('#reglages-export-achatsfournisseurs')).toContainText('Les coordonnées bancaires n’y figurent jamais.');
  await capturer(page, info, 'F11-reglages');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-achatsfournisseurs"]').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^fournisseurs-\d{4}-\d{2}-\d{2}\.csv$/);
  const contenu = await readFile(await telechargement.path(), 'utf8');
  expect(contenu.split('\r\n').filter(Boolean)).toHaveLength(5); // en-têtes + 4 fournisseurs
  expect(contenu).toContain('Quincaillerie Fictive;900000004;Confirmé;;');
});

test('F12 pas de défilement horizontal, avec un formulaire ouvert (ordinateur et téléphone)', async ({ page }, info) => {
  await poserBase(page);
  await ouvrir(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await ligne(page, CLE_BETON).locator('[data-action="menu-fournisseur"]').click();
  await page.getByRole('menuitem').click();
  await expect(page.locator('[data-role="formulaire-iban"]')).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'F12-formulaire-ouvert');
  if (estTelephone(page)) await expect(ligne(page, CLE_ACIERS)).toBeVisible();
});

test('F13 accès non réglé : aucun appel à la base, aucune donnée ; le menu mène à l\'écran', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Fournisseurs');
  await expect(page.locator('[data-role="achats-etat"]')).toHaveAttribute('data-etat', 'non-regle');
  await expect(page.locator('tr.ligne-liste')).toHaveCount(0);
});
