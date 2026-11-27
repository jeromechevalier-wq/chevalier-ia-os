// Réglages > Achats : « Sauvegarde complète des achats » en .zip (26/11/2026). Un test par critère (le nom commence par son numéro).
//  Z1 une carte en haut, UN bouton, un .zip daté avec un fichier par table, chaque fichier identique à celui du bouton de son module (sans coordonnées bancaires) ;
//  Z2 seulement les modules allumés (maison réglée sur 3 modules) ; une table en panne = aucun téléchargement et un message qui la nomme ;
//  Z3 les boutons de chaque module restent, repliés sous « Sauvegardes séparées » ; Z4 titres « Sauvegarde des chantiers » et « Sauvegarde des factures » ;
//  Z6 téléphone (--project=telephone) : le bouton se voit, se touche, et la page ne défile pas de côté.
// Aucun appel réseau réel : faux réseau de la base posé par le crochet de test `window.__accesBase` (émulateurs seulement, voir js/os/acces-base.js), comme les autres tests Achats.
// La logique et le créateur de zip sont testés sans navigateur : tests/achats-sauvegarde-zip.test.js.
// Captures dans tests/e2e/captures/achats-sauvegarde-zip/ (non commitées), nommées avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, ecrireDocument, attendreCalme, estTelephone, jour, ouvrirSectionReglages, JEROME, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';
import { jeuTableauAchats } from '../fixtures/achats/tableauachats.js';
import { jeuDemo, IBAN, IBAN2, IBAN3 } from '../fixtures/achats/fournisseurs.js';

const DOSSIER = fileURLToPath(new URL('./captures/achats-sauvegarde-zip/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: {} });
const IBAN_FACTURE = 'FR7699999888887777766666555';

function donnees() {
  const demo = jeuDemo();
  return {
    ...jeuTableauAchats(jour),
    fournisseurs_a_verifier: demo.file,
    ibans_confirmes: demo.confirmations,
    fournisseurs: demo.fournisseurs,
    chantiers: [
      { id: 'c1', nom: 'Villa Essai', code: 'CH-0001', client: 'Client Essai', statut: 'en_cours', archive: false, adresse: null, budget_ht: 100, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
      { id: 'c2', nom: 'Hangar archivé', code: 'CH-0002', client: null, statut: 'suspendu', archive: true, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
    ],
    factures: [
      { id: 'fa-1', fournisseur: 'Aciers Exemple', numero: 'F-100', date_facture: '2026-11-20', montant_ht: 100, montant_tva: 20, montant_ttc: 120, statut: 'acceptee', motif_refus: null, date_decision: '2026-11-21T10:00:00Z', decide_par: 'a@b.fr', created_at: '2026-11-20T08:00:00Z',
        extraction_erreur: null, acceptee_malgre_alerte: false, type_document: 'facture', fournisseur_siren: '900000001', numero_normalise: 'F-100', iban_normalise: IBAN_FACTURE, email_expediteur: null, lignes_etat: null, lignes_somme_ht: null, archivee_le: null,
        chantier_id: 'c1', etablissement_id: null },
    ],
  };
}

/** Faux réseau de la base, posé AVANT le chargement : toute table connue répond ses lignes, une table inconnue répond une liste vide ; `pannes` : tables qui répondent une erreur 500. */
async function poserBase(page, { pannes = [] } = {}) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await page.addInitScript(([d, p]) => {
    window.__requetes = [];
    window.__pannes = p;
    const rep = (statut, data, entetes = {}) => new Response(JSON.stringify(data), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    window.__accesBase = {
      jeton: 'jeton-fictif',
      claims: { role: 'authenticated', espace_base: 'espace-essai' },
      fetchImpl: async (url, init = {}) => {
        const u = new URL(url);
        window.__requetes.push(u.pathname);
        if (!u.pathname.startsWith('/rest/v1/')) return rep(404, { message: 'inconnu' });
        const table = u.pathname.replace('/rest/v1/', '');
        if (window.__pannes.includes(table)) return rep(500, { message: 'panne simulée' });
        const lignes = d[table] ?? [];
        const debut = Number(u.searchParams.get('offset') || 0);
        const lot = Number(u.searchParams.get('limit') || 1000);
        const part = lignes.slice(debut, debut + lot);
        return rep(200, part, { 'Content-Range': part.length ? `${debut}-${debut + part.length - 1}/${lignes.length}` : `*/${lignes.length}` });
      },
    };
  }, [donnees(), pannes]);
}

async function ouvrirAchats(page) {
  await connecter(page, undefined, { route: 'reglages' });
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await expect(page.locator('#reglages-sauvegarde-achats')).toBeVisible();
}

const bouton = (page) => page.locator('[data-action="sauvegarde-achats-zip"]');
const ouvrirSeparees = (page) => page.locator('[data-role="sauvegardes-separees"]').click();

/** Lecture minimale d'une archive « stored » (méthode 0), écrite ici : le répertoire central donne chaque entrée et ses données (Playwright ne charge pas les modules de l'appli). */
async function lireZip(telechargement) {
  const o = new Uint8Array(await readFile(await telechargement.path()));
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const fin = o.length - 22;
  expect(v.getUint32(fin, true)).toBe(0x06054b50);
  const decodeur = new TextDecoder('utf-8', { ignoreBOM: true });
  const fichiers = {};
  let p = v.getUint32(fin + 16, true);
  for (let n = 0; n < v.getUint16(fin + 10, true); n++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    expect(v.getUint16(p + 10, true)).toBe(0);
    const taille = v.getUint32(p + 24, true);
    const longNom = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const nom = decodeur.decode(o.subarray(p + 46, p + 46 + longNom));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    fichiers[nom] = decodeur.decode(o.subarray(debut, debut + taille));
    p += 46 + longNom;
  }
  return fichiers;
}
const nomDate = (prefixe) => new RegExp(`^${prefixe}-\\d{4}-\\d{2}-\\d{2}\\.(csv|zip)$`);

test('Z1 une carte en haut, UN bouton : le .zip daté contient une table par module, identique au fichier du bouton de chaque module, sans coordonnées bancaires', async ({ page }, info) => {
  await poserBase(page);
  await ouvrirAchats(page);
  const premiere = page.locator('.reglages-sections > *').first();
  await expect(premiere).toHaveAttribute('id', 'reglages-sauvegarde-achats');
  await expect(premiere.locator('h2')).toHaveText('Sauvegarde complète des achats');
  await expect(premiere.locator('button')).toHaveCount(1);
  await capturer(page, info, 'Z1-carte');
  const [zip] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  expect(zip.suggestedFilename()).toMatch(/^sauvegarde-achats-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(page.locator('.toast').filter({ hasText: 'Sauvegarde téléchargée : 5 tables' })).toBeVisible();
  const fichiers = await lireZip(zip);
  const noms = Object.keys(fichiers);
  expect(noms).toHaveLength(5);
  for (const prefixe of ['fournisseurs', 'chantiers', 'articles', 'factures', 'tableau-achats-factures']) expect(noms.some((n) => nomDate(prefixe).test(n))).toBe(true);
  const tout = Object.values(fichiers).join('\n');
  for (const iban of [IBAN, IBAN2, IBAN3, IBAN_FACTURE]) expect(tout).not.toContain(iban); // jamais de coordonnées bancaires
  expect(tout).toContain('Hangar archivé'); // comme le bouton du module : archivés compris
  await capturer(page, info, 'Z1-telecharge');

  // Même contenu que chaque bouton séparé.
  await ouvrirSeparees(page);
  for (const action of ['exporter-achatsfournisseurs', 'exporter-chantiers-tous', 'exporter-achatsarticles', 'exporter-factures-toutes', 'exporter-tableauachats']) {
    const [seul] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-action="${action}"]`).click()]);
    const nom = seul.suggestedFilename();
    expect(Object.keys(fichiers), action).toContain(nom);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await readFile(await seul.path())), `${action} : même contenu`).toBe(fichiers[nom]);
  }
});

test('Z2 seuls les modules Achats allumés de la maison sont dans le .zip (Articles et Tableau de bord éteints)', async ({ page }, info) => {
  await semerFicheEmulateur({ projet: PROJET, hote: new URL(FIRESTORE).host, document: 'ecran', fiche: { ...ECRAN_PARCOURS, modules: ['achatsfournisseurs', 'achatschantiers', 'achatsfactures'] } });
  await poserBase(page);
  await connecter(page, JEROME, { route: 'reglages', attendreAccueil: false });
  await expect(page.locator('.coquille')).toBeVisible();
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await expect(page.locator('#reglages-sauvegarde-achats')).toBeVisible();
  const [zip] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  const noms = Object.keys(await lireZip(zip)).sort();
  expect(noms).toHaveLength(3);
  expect(noms.map((n) => n.replace(/-\d{4}-\d{2}-\d{2}\.csv$/, ''))).toEqual(['chantiers', 'factures', 'fournisseurs']);
  await ouvrirSeparees(page);
  await expect(page.locator('#reglages-export-achatsarticles')).toHaveCount(0);
  await expect(page.locator('#reglages-export-tableauachats')).toHaveCount(0);
  await capturer(page, info, 'Z2-trois-modules');
});

test('Z2 cas d’erreur : une table en panne = aucun .zip, et le message nomme la table', async ({ page }, info) => {
  await poserBase(page, { pannes: ['chantiers'] }); // lue par Chantiers ET par Factures (noms des chantiers)
  await ouvrirAchats(page);
  let telecharge = false;
  page.on('download', () => { telecharge = true; });
  await bouton(page).click();
  const erreur = page.locator('[data-role="sauvegarde-achats-erreur"]');
  await expect(erreur).toBeVisible();
  await expect(erreur).toContainText('Sauvegarde non téléchargée : les tables Chantiers et Factures n’ont pas pu être lues.');
  await expect(bouton(page)).toBeEnabled();
  await page.waitForTimeout(500);
  expect(telecharge).toBe(false);
  await capturer(page, info, 'Z2-erreur');
  // La panne réparée, « réessayer » marche et efface le message.
  await page.evaluate(() => { window.__pannes = []; });
  const [zip] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  await expect(erreur).toBeHidden();
});

test('Z3 les boutons de chaque module restent, repliés sous « Sauvegardes séparées »', async ({ page }, info) => {
  await poserBase(page);
  await ouvrirAchats(page);
  const separees = page.locator('#reglages-sauvegardes-separees');
  await expect(separees).not.toHaveAttribute('open', '');
  for (const id of ['achatsfournisseurs', 'achatschantiers', 'achatsarticles', 'achatsfactures', 'tableauachats']) await expect(page.locator(`#reglages-export-${id}`)).toBeHidden();
  await expect(page.locator('.reglages-raccourcis')).toBeHidden(); // pas de raccourci vers une section repliée
  await ouvrirSeparees(page);
  for (const id of ['achatsfournisseurs', 'achatschantiers', 'achatsarticles', 'achatsfactures', 'tableauachats']) {
    await expect(separees.locator(`#reglages-export-${id}`)).toBeVisible();
    await expect(separees.locator(`#reglages-export-${id} button`)).toHaveText('Exporter mes données');
  }
  await capturer(page, info, 'Z3-separees');
});

test('Z4 titres précis des sections séparées : « Sauvegarde des chantiers », « Sauvegarde des factures »', async ({ page }, info) => {
  await poserBase(page);
  await ouvrirAchats(page);
  await ouvrirSeparees(page);
  await expect(page.locator('#reglages-export-achatschantiers h2')).toHaveText('Sauvegarde des chantiers');
  await expect(page.locator('#reglages-export-achatsfactures h2')).toHaveText('Sauvegarde des factures');
  await expect(page.locator('.sauvegardes-separees-contenu h2', { hasText: /^Sauvegarde$/ })).toHaveCount(0);
  await page.locator('#reglages-export-achatsfactures').scrollIntoViewIfNeeded();
  await capturer(page, info, 'Z4-titres');
});

test('Z6 téléphone : le bouton se voit, se touche et télécharge ; pas de défilement de côté', async ({ page }, info) => {
  await poserBase(page);
  await ouvrirAchats(page);
  await expect(bouton(page)).toBeVisible();
  const boite = await bouton(page).boundingBox();
  if (estTelephone(page)) expect(boite.height).toBeGreaterThanOrEqual(40);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'Z6-bouton');
  const [zip] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  expect(zip.suggestedFilename()).toMatch(/^sauvegarde-achats-\d{4}-\d{2}-\d{2}\.zip$/);
  await ouvrirSeparees(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'Z6-separees');
});
