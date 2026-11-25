// Module Achats « Factures » (25/11/2026, PR 8a, la LISTE seulement) : un test par critère (le nom commence par son numéro). Aucun appel réseau réel : la base et le webhook sont un faux réseau
// posé par le crochet de test `window.__accesBase` (émulateurs seulement, voir js/os/acces-base.js), qui garde ses données en mémoire dans la page. Fausses données : tests/_donnees-achatsfactures.js (aucune vraie identité).
//  F1 Kanban (3 colonnes, totaux avec avoir soustrait, étiquette Avoir) ; F2 pastilles de contrôle (couleur, forme, infobulle, jamais vert sans l'identité de l'espace) ; F3 vue Liste : tri par en-tête, recherche, filtres ;
//  F4 menu « … » : Examiner (bientôt disponible), Archiver absent d'une facture à valider ; F5 archiver (confirmation, « Annuler » 8 s), Archives, désarchiver ; F6 favoris dans Filtres ;
//  F7 cas vide ; F8 cas d'erreur + « Réessayer » ; F9 export ; F10 connexion non réglée ; F11 refus du serveur ; F12 Réglages > Achats > Sauvegarde ; F13 pas de défilement horizontal ;
//  F14 liste incomplète et analyses non lues dites à l'écran ; F15 aucune écriture hors des actions « archiver » et « desarchiver ».
// Captures dans tests/e2e/captures/achatsfactures/ (non commitées), une par état, nommée avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, attendreCalme, estTelephone, ouvrirSectionReglages } from './outils.js';
import { listeComplete } from '../_donnees-achatsfactures.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatsfactures/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('hooks.exemple.test', '/actions') } });
const ROUTE = 'achatsfactures/liste';

// Lignes de la table `factures` (les colonnes de la base, sans les jointures : le module les rattache lui-même).
const CHANTIER_DE = { a1: 'c1', a12: 'c1', a13: 'c2', h1: 'c1', h8: 'c2' };
const LIGNES_TABLE = () => {
  const lignes = listeComplete().map((f) => { const { chantiers, etablissements_fournisseur, ...r } = f; return { ...r, chantier_id: CHANTIER_DE[f.id] ?? null, etablissement_id: null }; });
  const modele = lignes.find((l) => l.id === 'h1');
  // Un avoir accepté de 20 € : il se SOUSTRAIT dans le total de la colonne « Acceptées ».
  lignes.push({ ...modele, id: 'av1', numero: 'AV-1', numero_normalise: 'AV-1', type_document: 'avoir', montant_ht: 16.67, montant_tva: 3.33, montant_ttc: 20, fournisseur: 'Bricolo Dépôt', date_facture: '2026-11-21', extraction: null });
  return lignes;
};
const CHANTIERS = [{ id: 'c1', nom: 'Villa Dupont' }, { id: 'c2', nom: 'Atelier Martin' }];
const NB_LIGNES = { a1: 3, a12: 1 };

/**
 * Faux réseau + badge simulé, posés AVANT le chargement de la page. `options` : { factures, favoris, lectureEnPanne, analysesEnPanne, refus, tronque }.
 * Les appels reçus sont gardés dans window.__appels ; les données vivent dans window.__faux (les actions les modifient comme le ferait n8n).
 */
async function poserFauxReseau(page, options = {}) {
  await page.addInitScript(({ factures, chantiers, nbLignes, favoris, lectureEnPanne, analysesEnPanne, refus, tronque }) => {
    const faux = { factures: structuredClone(factures), chantiers, favoris: [...favoris], lectureEnPanne, analysesEnPanne, refus };
    window.__faux = faux;
    window.__appels = [];
    const rep = (corps, statut = 200, entetes = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    const liste = (lignes, plus = 0) => rep(lignes, 200, { 'Content-Range': `0-${Math.max(0, lignes.length - 1)}/${lignes.length + plus}` });
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      const corps = init.body ? JSON.parse(init.body) : null;
      window.__appels.push({ methode: init.method, chemin: u.pathname, select: u.searchParams.get('select'), corps });
      if (u.pathname === '/rest/v1/factures') {
        const analyses = (u.searchParams.get('select') ?? '') === 'id,extraction';
        if (analyses) {
          if (faux.analysesEnPanne) return rep({ message: 'panne' }, 500);
          return liste(faux.factures.filter((f) => f.statut === 'a_valider').map((f) => ({ id: f.id, extraction: f.extraction })));
        }
        if (faux.lectureEnPanne) return rep({ message: 'panne' }, 500);
        const decalage = Number(u.searchParams.get('offset') ?? 0);
        const lignes = decalage > 0 ? (tronque ? [{ ...faux.factures.find((x) => x.id === 'h2'), id: `suite-${decalage}`, numero: `S-${decalage}`, numero_normalise: `S-${decalage}`, extraction: null }].map(({ extraction, ...r }) => r) : []) : faux.factures.map((f) => { const { extraction, ...r } = f; return r; });
        return tronque ? rep(lignes, 200, { 'Content-Range': `0-${Math.max(0, lignes.length - 1)}/${faux.factures.length + 5000}` }) : liste(lignes);
      }
      if (u.pathname === '/rest/v1/chantiers') return liste(faux.chantiers);
      if (u.pathname === '/rest/v1/etablissements_fournisseur') return liste([]);
      if (u.pathname === '/rest/v1/ibans_confirmes') return liste([]);
      if (u.pathname === '/rest/v1/lignes_facture') {
        const ids = (u.searchParams.get('facture_id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').map((x) => x.replace(/"/g, '')).filter(Boolean);
        return liste(ids.flatMap((id) => Array.from({ length: nbLignes[id] ?? 0 }, (_, i) => ({ facture_id: id, position: i + 1 }))));
      }
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
        const f = faux.factures.find((x) => x.id === corps.facture_id);
        if (corps.action === 'archiver') { f.archivee_le = '2026-11-25T09:00:00Z'; return rep({ ok: true }); }
        if (corps.action === 'desarchiver') { f.archivee_le = null; return rep({ ok: true }); }
      }
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { factures: LIGNES_TABLE(), chantiers: CHANTIERS, nbLignes: NB_LIGNES, favoris: [], lectureEnPanne: false, analysesEnPanne: false, refus: '', tronque: false, ...options });
}
const appels = (page) => page.evaluate(() => window.__appels);
const appelsActions = async (page) => (await appels(page)).filter((a) => a.chemin === '/actions').map((a) => a.corps);
async function ouvrir(page, options) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page, options);
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
  await expect(page.locator('[data-etat="chargement"]')).toHaveCount(0); // la première lecture est finie avant d'agir (sinon une panne posée trop tôt la fait échouer)
}
const colonne = (page, statut) => page.locator(`[data-colonne="${statut}"]`);
const carte = (page, id) => page.locator(`article[data-facture="${id}"]`);
const ligne = (page, id) => page.locator(`tr[data-facture="${id}"]`);

test('F1 le Kanban a les trois colonnes avec leurs factures, les totaux (un avoir se soustrait) et l\'étiquette « Avoir »', async ({ page }, info) => {
  await ouvrir(page);
  await expect(page.locator('[data-colonne]')).toHaveCount(3);
  await expect(colonne(page, 'a_valider').locator('article')).toHaveCount(8);
  await expect(colonne(page, 'acceptee').locator('article')).toHaveCount(4);
  await expect(colonne(page, 'refusee').locator('article')).toHaveCount(2);
  // 3 acceptées de 120 € moins l'avoir de 20 € = 340 € : l'avoir est soustrait, jamais additionné.
  await expect(colonne(page, 'acceptee').locator('.colonne-totaux')).toContainText(/4 factures · 340,00\s€/);
  await expect(carte(page, 'av1')).toContainText('Avoir');
  await expect(carte(page, 'av1')).toContainText(/-20,00\s€ TTC|−20,00\s€ TTC/);
  await expect(carte(page, 'h1')).not.toContainText('Avoir');
  await expect(carte(page, 'h2')).toHaveCount(0); // archivée : pas dans le Kanban
  await expect(page.locator('.compteur-liste')).toHaveText('14 factures');
  await expect(carte(page, 'a4')).toContainText('Ancienne facture sans analyse');
  await expect(carte(page, 'a3')).toContainText('Fournisseur inconnu');
  await capturer(page, info, 'F1-kanban');
});

test('F2 pastille de contrôle : forme, couleur, texte et infobulle ; jamais verte tant que l\'identité de l\'espace n\'est pas réglée', async ({ page }, info) => {
  await ouvrir(page);
  const pastille = (id) => carte(page, id).locator('.pastille-controles');
  // a14 : doublon d'une facture déjà acceptée : rouge, avec la phrase dans l'infobulle et le nom accessible.
  await expect(pastille('a14')).toHaveAttribute('data-niveau', 'danger');
  await expect(pastille('a14')).toHaveClass(/pastille-danger-rouge/);
  await expect(pastille('a14')).toHaveAttribute('role', 'img');
  await expect(pastille('a14')).toHaveAttribute('title', /Anomalie : .*Doublon/);
  await expect(pastille('a14')).toHaveAttribute('aria-label', /Anomalie/);
  // Facture déjà décidée : gris, « rien à contrôler ».
  await expect(pastille('h1')).toHaveAttribute('data-niveau', 'neutre');
  await expect(pastille('h1')).toHaveAttribute('title', 'Facture déjà décidée : rien à contrôler');
  // Le destinataire ne peut pas être vérifié (l'identité de l'espace n'est lue nulle part) : aucune pastille verte, jamais.
  await expect(page.locator('.pastille-controles[data-niveau="ok"]')).toHaveCount(0);
  await expect(pastille('a12')).toHaveAttribute('data-niveau', 'neutre');
  // Une carte qui ouvre l'Examiner a un nom accessible qui cite la pastille.
  await expect(carte(page, 'a14')).toHaveAttribute('aria-label', /Examiner la facture : Point Q Matériaux\. Anomalie/);
  await capturer(page, info, 'F2-pastilles');
});

test('F3 vue Liste : le tableau, le tri par en-tête, la recherche sans accents et le filtre par fournisseur', async ({ page }, info) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('tr[data-facture]')).toHaveCount(14);
  await page.getByLabel('Rechercher une facture').fill('electro');
  await expect(page.locator('tr[data-facture]')).toHaveCount(0); // la seule facture « Électro » est archivée
  await expect(page.locator('[data-etat="vide"]')).toContainText('Aucune facture ne correspond à ta recherche.');
  await page.locator('[data-etat="vide"]').getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('tr[data-facture]')).toHaveCount(14);
  await page.getByLabel('Rechercher une facture').fill('ferronnerie');
  await expect(page.locator('tr[data-facture]')).toHaveCount(2);
  await expect(page.locator('.compteur-liste')).toHaveText('2 sur 14 factures');
  await page.getByLabel('Rechercher une facture').fill('');
  await expect(page.locator('tr[data-facture]')).toHaveCount(14); // état stable avant d'enchaîner
  await expect(page.locator('.compteur-liste')).toHaveText('14 factures');
  // Clic sur l'en-tête « Montant TTC » : plus grand d'abord (l'avoir négatif en dernier), puis l'autre sens.
  await page.locator('[data-tri="montant"]').click();
  await expect(page.locator('th[aria-sort="descending"]')).toContainText('Montant TTC');
  await expect(page.locator('tr[data-facture]').first()).toHaveAttribute('data-facture', 'a1'); // 1 541,40 €
  await expect(page.locator('tr[data-facture]').last()).toHaveAttribute('data-facture', 'a5'); // montant illisible : toujours en dernier
  await page.locator('[data-tri="montant"]').click();
  await expect(page.locator('tr[data-facture]').first()).toHaveAttribute('data-facture', 'av1');
  // Filtre par fournisseur.
  await page.locator('[data-action="filtres"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-filtre="fournisseurs"]').getByRole('checkbox', { name: 'Loxbel Location' }).check();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Appliquer' })).toBeEnabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tr[data-facture]')).toHaveCount(1);
  await expect(page.locator('.pastille-filtre')).toContainText('Fournisseur : Loxbel Location');
  await capturer(page, info, 'F3-liste-filtree');
});

test('F4 menu « … » : « Examiner » dit « bientôt disponible » (sans erreur) ; « Archiver » n\'existe pas pour une facture à valider', async ({ page }, info) => {
  await ouvrir(page);
  await carte(page, 'a1').locator('[data-action="menu-facture"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Examiner (bientôt disponible)']);
  await page.getByRole('menuitem', { name: /Examiner/ }).click();
  await expect(page.locator('.toast')).toContainText('Examiner : bientôt disponible');
  await expect(page.locator('.toast-erreur')).toHaveCount(0);
  await carte(page, 'h1').locator('[data-action="menu-facture"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Examiner (bientôt disponible)', 'Archiver']);
  await page.keyboard.press('Escape');
  // Un clic sur la carte dit la même chose.
  await carte(page, 'a2').click({ position: { x: 20, y: 40 } });
  await expect(page.locator('.toast').last()).toContainText('Examiner : bientôt disponible');
  await capturer(page, info, 'F4-examiner-bientot');
});

test('F5 archiver : confirmation, puis « Annuler » ; la facture passe dans Archives ; désarchiver la remet', async ({ page }, info) => {
  await ouvrir(page);
  await carte(page, 'h1').locator('[data-action="menu-facture"]').click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  await expect(page.getByRole('dialog')).toContainText('Archiver cette facture ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(page.locator('.toast')).toContainText('Facture archivée');
  await expect(carte(page, 'h1')).toHaveCount(0);
  await capturer(page, info, 'F5-archive-annuler');
  await page.locator('[data-action="toast-action"]').click(); // « Annuler »
  await expect(carte(page, 'h1')).toBeVisible();
  await carte(page, 'h1').locator('[data-action="menu-facture"]').click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(carte(page, 'h1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archives' }).click();
  await expect(page.locator('.compteur-liste')).toHaveText('2 factures archivées');
  await expect(ligne(page, 'h2')).toBeVisible();
  await capturer(page, info, 'F5-archives');
  await ligne(page, 'h2').locator('[data-action="menu-facture"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Examiner (bientôt disponible)', 'Désarchiver']);
  await page.getByRole('menuitem', { name: 'Désarchiver' }).click();
  await expect(page.locator('.toast').last()).toContainText('Facture désarchivée');
  await expect(ligne(page, 'h2')).toHaveCount(0);
  const actions = await appelsActions(page);
  expect(actions.map((a) => [a.action, a.facture_id])).toEqual([['archiver', 'h1'], ['desarchiver', 'h1'], ['archiver', 'h1'], ['desarchiver', 'h2']]);
  expect(actions.every((a) => Object.keys(a).sort().join() === 'action,facture_id')).toBe(true); // rien d'autre que l'action et l'identifiant
});

test('F6 favoris : l\'étoile de la fenêtre « Filtres » met un fournisseur en tête avec un trait, et le retient (genre « entreprise »)', async ({ page }, info) => {
  await ouvrir(page, { favoris: [{ genre: 'chantier', cle: 'c2' }] });
  await page.locator('[data-action="filtres"]').click();
  const fournisseurs = page.locator('[data-filtre="fournisseurs"]');
  const etoileFerro = fournisseurs.locator('.ligne-favori', { hasText: 'Ferronnerie du Verdon' }).locator('.bouton-etoile');
  await expect(etoileFerro).not.toHaveClass(/est-favori/);
  await etoileFerro.click();
  await expect(fournisseurs.locator('.ligne-favori').first()).toContainText('Ferronnerie du Verdon'); // remonte en tête
  await expect(fournisseurs.locator('.favori-sep')).toHaveCount(1);
  await expect(fournisseurs.locator('.ligne-favori', { hasText: 'Ferronnerie du Verdon' }).locator('.bouton-etoile')).toHaveAttribute('aria-label', /Retirer .* des favoris/);
  // Le chantier mis en favori avant l'ouverture est déjà en tête de sa liste.
  await expect(page.locator('[data-filtre="chantiers"] .ligne-favori').first()).toContainText('Atelier Martin');
  const bascules = (await appels(page)).filter((a) => a.chemin === '/rest/v1/rpc/basculer_favori_os');
  expect(bascules.map((b) => b.corps)).toEqual([{ p_genre: 'entreprise', p_cle: '500000021' }]);
  await capturer(page, info, 'F6-favoris');
});

test('F7 cas vide : aucune facture, le message ; export grisé', async ({ page }, info) => {
  await ouvrir(page, { factures: [] });
  await expect(page.locator('[data-etat="vide"]')).toContainText('Aucune facture pour l’instant');
  await expect(page.locator('[data-action="exporter-factures"]')).toBeDisabled();
  await capturer(page, info, 'F7-vide');
});

test('F8 cas d\'erreur : la lecture des factures échoue ; message clair et « Réessayer » qui relance', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la lecture du faux réseau échoue exprès (erreur 500)' });
  await ouvrir(page, { lectureEnPanne: true });
  await expect(page.locator('[data-etat="erreur"]')).toContainText('Impossible de charger les factures');
  await expect(page.locator('[data-action="exporter-factures"]')).toBeDisabled();
  await capturer(page, info, 'F8-erreur');
  await page.evaluate(() => { window.__faux.lectureEnPanne = false; });
  await page.locator('[data-etat="erreur"] [data-action="reessayer"]').click();
  await expect(carte(page, 'a1')).toBeVisible();
});

test('F9 export : le fichier part avec le nom du jour, ne contient que ce qui est affiché et aucune coordonnée bancaire', async ({ page }) => {
  await ouvrir(page);
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-factures"]').click()]);
  expect(fichier.suggestedFilename()).toMatch(/^factures-\d{4}-\d{2}-\d{2}\.csv$/);
  const texte = await (await import('node:fs/promises')).readFile(await fichier.path(), 'utf8');
  expect(texte).toContain('Point Q Matériaux');
  expect(texte).not.toContain('Électro Services'); // archivée : pas dans la vue affichée
  expect(texte).not.toMatch(/FR76|FR14/);
  expect(texte).toContain(';-20,00;Avoir;'.replace(';-20,00;', ';-16,67;-3,33;-20,00;')); // l'avoir sort en négatif
  expect(texte.split('\r\n')[0]).toBe('﻿Numéro;Fournisseur;SIREN;Date de la facture;HT;TVA;TTC;Type;Statut;Décideur;Date de décision;Motif de refus;Chantier');
});

test('F10 connexion non réglée : l\'écran le dit avec le lien vers Réglages (aucune lecture tentée)', async ({ page }, info) => {
  await connecter(page, undefined, { route: ROUTE });
  await expect(page.locator('[data-role="achats-etat"]')).toHaveAttribute('data-etat', 'non-regle');
  await expect(page.locator('[data-role="achats-etat-texte"]')).toHaveText('Connexion à la base non réglée : Réglages > Connexion à la base');
  await expect(page.locator('[data-action="exporter-factures"]')).toBeDisabled();
  await capturer(page, info, 'F10-non-regle');
});

test('F11 le serveur refuse l\'archivage : son message est montré sur l\'écran, la liste est relue', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux webhook refuse exprès (erreur 400)' });
  await ouvrir(page, { refus: 'Cette facture est déjà archivée.' });
  await carte(page, 'h1').locator('[data-action="menu-facture"]').click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(page.locator('[data-erreur="action"]')).toBeVisible();
  await expect(page.locator('[data-erreur="action"]')).not.toBeEmpty();
  await expect(carte(page, 'h1')).toBeVisible(); // rien n'a changé
  await capturer(page, info, 'F11-refus');
});

test('F12 Réglages > Achats > Sauvegarde des factures : un bouton d\'export de toutes les données', async ({ page }, info) => {
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await expect(page.locator('#reglages-export-achatsfactures')).toBeVisible();
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-factures-toutes"]').click()]);
  expect(fichier.suggestedFilename()).toMatch(/^factures-\d{4}-\d{2}-\d{2}\.csv$/);
  const texte = await (await import('node:fs/promises')).readFile(await fichier.path(), 'utf8');
  expect(texte).toContain('Électro Services'); // l'export des Réglages prend TOUT, archivées comprises
  await capturer(page, info, 'F12-reglages');
});

test('F13 pas de défilement horizontal, dans les trois vues', async ({ page }) => {
  await ouvrir(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('tr[data-facture]').first()).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.getByRole('button', { name: 'Archives' }).click();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  if (estTelephone(page)) await expect(page.locator('.tableau-factures thead')).toBeVisible(); // en-têtes triables : une rangée de boutons défilante, pas de tableau coupé
});

test('F14 liste incomplète et analyses non lues : l\'écran le dit, les pastilles des factures à valider restent grises', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la lecture des analyses échoue exprès (erreur 500)' });
  await ouvrir(page, { analysesEnPanne: true, tronque: true });
  await expect(page.locator('[data-role="factures-avis"]')).toContainText('Les contrôles automatiques n’ont pas pu être lus');
  await expect(page.locator('[data-role="factures-incomplete"]')).toContainText('Liste incomplète');
  await expect(carte(page, 'a14').locator('.pastille-controles')).toHaveAttribute('data-niveau', 'neutre');
  await expect(carte(page, 'a14').locator('.pastille-controles')).toHaveAttribute('title', /Contrôles non faits/);
  await capturer(page, info, 'F14-avertissements');
});

test('F15 la liste n\'écrit rien : seules les actions « archiver » et « desarchiver » partent, jamais une écriture directe dans la base', async ({ page }) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Liste' }).click();
  await page.locator('[data-tri="fournisseur"]').click();
  await page.getByLabel('Rechercher une facture').fill('point');
  const ecritures = (await appels(page)).filter((a) => a.methode && a.methode !== 'GET' && !a.chemin.includes('/rpc/'));
  expect(ecritures).toEqual([]);
});

test('F16 si la relecture après un archivage échoue, un avis dit que la liste n\'est peut-être pas à jour', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la relecture du faux réseau échoue exprès (erreur 500)' });
  await ouvrir(page);
  await page.evaluate(() => { window.__faux.lectureEnPanne = true; });
  await carte(page, 'h1').locator('[data-action="menu-facture"]').click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(page.locator('[data-role="factures-avis"]')).toContainText('n’a pas pu être relue');
  await expect(page.locator('[data-etat="erreur"]')).toHaveCount(0); // l'écran garde ce qui était affiché
});
