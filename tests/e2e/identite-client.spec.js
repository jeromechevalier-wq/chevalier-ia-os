// Chantier 6 : chez un client, la page prend la marque du client (titre, nom, logo, icône, appli installée, accent de l'interface) et
// ne montre rien qui soit propre à Jérôme. Émulateurs, règles de la plateforme (chargées le temps de ce fichier).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, lireDocument, listerDocuments, estTelephone, basculerThemeParMenu, allerA, PROJET, FIRESTORE, URL_APP, jour, ouvrirDocuments } from './outils.js';
import { brancherGoogle, lireGoogle, choisirDansGoogle, ID_CLIENT } from './google-simule.js';

const ALICE = 'alice@exemple.test';
const COULEUR = '#336699';
const JAUNE_JEROME = 'rgb(236, 188, 6)';
const IDENTITE_JEROME = /Chevalier|Jérôme|Charles|Hermes|Claude Code|GitHub|sauvegarde mensuelle|Pense à ta sauvegarde/i;
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

// Le calcul est celui de la page elle-même (js/os/marque.js, chargé dans le navigateur) : on compare l'affichage réel à la logique testée à part.
const calculer = (page, couleur, theme) => page.evaluate(async ([c, t]) => {
  const m = await import('/js/os/marque.js');
  const a = m.accentPourTheme(c, t);
  return { ...a, contrasteTexte: m.contraste(a.accent, a.surAccent), contrasteFond: m.contraste(a.accent, m.SURFACES_THEME[t]), contrasteTrait: m.contraste(a.trait, m.SURFACES_THEME[t]) };
}, [couleur, theme]);
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const maintenant = new Date();
const base = { proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE };

test.beforeEach(async () => {
  await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: COULEUR, accueil: 'Bienvenue.' });
  await ecrireDocument('marques/cabinet', { actif: true, nom: 'Cabinet Martin', couleur: '#f0a93a', logo: 'https://images.exemple.test/logo.png' });
  await ecrireDocument('clients/studio', { modules: { affaires: true, projets: true } });
  await ecrireDocument('clients/cabinet', { modules: { affaires: true } });
  await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/cabinet/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/studio/crm_personnes/p1', {
    nom: 'Camille Dubois', prenom: 'Camille', nomFamille: 'Dubois', organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [],
    ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false, ...base,
  });
  await ecrireDocument('clients/studio/crm_affaires/a1', {
    titre: 'Audit du lac', personneId: 'p1', organisationId: null, etape: 'etape_3', statut: 'ouverte', priorite: 'tiede', montant: 1200, offreId: null,
    dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: { proposition_envoyee: maintenant }, raisonPerdue: '',
    raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false, ...base,
  });
  await ecrireDocument('clients/studio/projets_projets/pr1', {
    titre: 'Site du lac', affaireId: null, personneId: 'p1', organisationId: null, phase: 'phase_1', statut: 'actif', dateDebut: jour(0), dateFin: null,
    modeleId: null, offreId: null, dateEntreePhase: maintenant, datesPhases: { lancement: maintenant }, documents: [], factures: [], urlGithub: '', urlDossier: '',
    archive: false, ...base,
  });
  await ecrireDocument('clients/studio/projets_taches/t1', {
    titre: 'Préparer la maquette', projetId: 'pr1', phase: 'phase_1', ordre: 1, date: jour(0), heure: '', fait: false, dateFait: null, assigneA: 'jerome', auteur: ALICE, creeLe: maintenant,
  });
});

async function ouvrir(page, client, reste = '') {
  await page.route('https://images.exemple.test/**', (route) => route.fulfill({ status: 200, body: PNG_1X1, headers: { 'Content-Type': 'image/png' } }));
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
}
const couleurDe = (page, selecteur, propriete = 'backgroundColor', pseudo = null) =>
  page.locator(selecteur).first().evaluate((el, [p, ps]) => getComputedStyle(el, ps)[p], [propriete, pseudo]);
// Les couleurs changent avec une transition (200 ms) : on attend la valeur finale.
const couleurFinale = async (page, selecteur, propriete, pseudo = null) => {
  let derniere = '';
  await expect.poll(async () => { const v = await couleurDe(page, selecteur, propriete, pseudo); const stable = v === derniere; derniere = v; return stable; }, { intervals: [300, 300, 300] }).toBe(true);
  return derniere;
};
const aller = allerA; // menu principal, ou menu utilisateur pour le Journal

test('I1 titre, description, icône, appli installée et nom : ceux du client, rien de Jérôme', async ({ page }) => {
  await ouvrir(page, 'studio');
  await expect(page).toHaveTitle('Studio Lune');
  const tete = await page.evaluate(async () => {
    const q = (s) => document.head.querySelector(s);
    const manifeste = q('link[rel="manifest"]') ? await (await fetch(q('link[rel="manifest"]').href)).json() : null;
    return {
      icone: q('link[rel="icon"]')?.href, touch: !!q('link[rel="apple-touch-icon"]'), description: q('meta[name="description"]')?.content,
      appleTitre: q('meta[name="apple-mobile-web-app-title"]')?.content, marque: document.documentElement.dataset.marque,
      manifestHref: q('link[rel="manifest"]')?.href, manifeste,
    };
  });
  expect(tete.icone).toMatch(/^data:image\/svg\+xml,/);
  expect(decodeURIComponent(tete.icone)).toContain(`fill="${COULEUR}"`);
  expect(tete.touch).toBe(false);
  expect(tete.description).toBe('Studio Lune');
  expect(tete.appleTitre).toBe('Studio Lune');
  expect(tete.marque).toBe('studio');
  expect(tete.manifestHref).toMatch(/^blob:/);
  expect(tete.manifeste.name).toBe('Studio Lune');
  expect(tete.manifeste.start_url).toMatch(/\/#\/espace\/studio$/);
  expect(JSON.stringify(tete.manifeste)).not.toMatch(IDENTITE_JEROME);
  await expect(page.locator('.menu-marque')).toContainText('Studio Lune');
  await expect(page.locator('.menu-marque')).not.toContainText('OS');
  if (estTelephone(page)) await expect(page.locator('.barre-haut-marque')).toHaveText('Studio Lune');
});

test('I2 avec un logo : le logo sert d\'icône de page et d\'appli, et s\'affiche dans le menu', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page).toHaveTitle('Cabinet Martin');
  const t = await page.evaluate(() => ({
    icone: document.head.querySelector('link[rel="icon"]').getAttribute('href'),
    touch: document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
  }));
  expect(t.icone).toBe('https://images.exemple.test/logo.png');
  expect(t.touch).toBe('https://images.exemple.test/logo.png');
  await expect(page.locator('.menu-logo-client')).toHaveAttribute('src', 'https://images.exemple.test/logo.png');
});

test('I3 accent de l\'interface = couleur de marque, contraste vérifié, dans les deux thèmes ; jamais le jaune de Jérôme', async ({ page }) => {
  await ouvrir(page, 'studio');
  for (const theme of ['sombre', 'clair']) {
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) {
      await basculerThemeParMenu(page);
      if (estTelephone(page)) await page.locator('.voile-menu').click({ position: { x: 380, y: 400 } });
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const a = await calculer(page, COULEUR, theme);
    // I18 (21/10/2026) : l'Accueil n'a plus de bouton « + Personne » ; le bouton principal se lit sur la page Personnes.
    await allerA(page, 'Personnes');
    const bouton = '.page-actions .bouton-principal';
    const fond = await couleurFinale(page, bouton, 'backgroundColor');
    expect(fond, `${theme} : fond du bouton`).toBe(rgb(a.accent));
    expect(fond).not.toBe(JAUNE_JEROME);
    expect(await couleurFinale(page, bouton, 'color')).toBe(rgb(a.surAccent));
    expect(a.contrasteTexte).toBeGreaterThanOrEqual(4.5);
    expect(a.contrasteFond).toBeGreaterThanOrEqual(3);
    expect(a.contrasteTrait).toBeGreaterThanOrEqual(4.5);
    expect(await couleurFinale(page, '.bouton-plus', 'backgroundColor')).toBe(rgb(a.accent));
    expect(await couleurFinale(page, '.menu-entree.actif', 'backgroundColor')).toBe(`rgba(${[1, 3, 5].map((i) => parseInt(COULEUR.slice(i, i + 2), 16)).join(', ')}, 0.15)`);
    expect(await couleurFinale(page, '.menu-entree.actif', 'backgroundColor', '::before')).toBe(rgb(a.trait));
    expect(await couleurFinale(page, '.menu-entree.actif .icone', 'color')).toBe(rgb(a.trait));
    expect(await couleurFinale(page, '.avatar-initiale', 'backgroundColor')).toBe(rgb(a.accent));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lien').trim())).toBe(a.trait);
  }
});

test('I4 les couleurs d\'étapes ne suivent pas la marque (rouge, vert… restent sémantiques)', async ({ page }) => {
  await ouvrir(page, 'studio');
  const jetons = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return ['--etape-gagne', '--etape-facture_envoyee', '--etape-facture_payee', '--etape-perdu', '--prio-chaud', '--prio-tiede', '--retard', '--succes'].map((j) => [j, s.getPropertyValue(j).trim()]);
  });
  const attendu = { '--etape-gagne': '#ecbc06', '--etape-facture_envoyee': '#fd6455', '--etape-facture_payee': '#3fbf7f', '--etape-perdu': '#8d8993', '--prio-chaud': '#fd6455', '--prio-tiede': '#ecbc06' };
  for (const [j, v] of jetons) if (attendu[j]) expect(v, j).toBe(attendu[j]);
  await aller(page, 'Affaires');
  await expect(page.locator('.colonne[data-colonne="etape_5"]')).toBeVisible();
});

test('I5 aucun texte au nom de Jérôme sur les écrans d\'un client (accueil, listes, fiches, journal, projets)', async ({ page }) => {
  await ouvrir(page, 'studio');
  const verifier = async (nom) => {
    await expect.poll(() => page.locator('.contenu').innerText(), nom).not.toBe('');
    const visible = await page.locator('body').innerText();
    expect(visible, `${nom} : texte visible`).not.toMatch(IDENTITE_JEROME);
    const html = await page.evaluate(() => document.body.outerHTML);
    for (const motif of ['charles-portrait', 'jerome-portrait', 'marque-inverse', 'assets/logo/marque', 'charles-vide', 'charles-flottant', 'rappel-export']) {
      expect(html, `${nom} : ${motif}`).not.toContain(motif);
    }
  };
  await expect(page.locator('.page-accueil')).toBeVisible();
  await verifier('accueil');
  await expect(page.locator('.rappel-export')).toHaveCount(0);
  for (const lib of ['Personnes', 'Organisations', 'Affaires', 'Journal des modifications', 'Projets']) { // le Journal s'ouvre par le menu utilisateur // « Modèles » n'est plus dans le menu : il est dans les Réglages
    await aller(page, lib);
    await verifier(lib);
  }
  // « Archives » n'est plus au menu : on y va par le bouton de l'écran Projets
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await verifier('Archives');
  await page.evaluate(() => { location.hash = '#/espace/studio/crm/affaires/a1'; });
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await verifier('fiche affaire');
  // Le dossier de travail est un lien libre (utile à tous) ; ni GitHub, ni « Créer un dossier dans Google Drive » tant que l'interrupteur est éteint (éteint par défaut chez un client).
  await expect(page.locator('[data-prop="github"], [data-action="creer-dossier"]')).toHaveCount(0);
  await ouvrirDocuments(page);
  await expect(page.locator('[data-prop="dossier"]')).toBeVisible();
  await expect(page.locator('select[aria-label="Propriétaire"]')).toHaveCount(0);
  await expect(page.locator('[data-prop="proprietaire"] .prop-modifier')).toHaveCount(0); // lecture seule : ni liste ni crayon
  await expect(page.locator('[data-prop="proprietaire"]')).toContainText(ALICE);
  await page.evaluate(() => { location.hash = '#/espace/studio/projets/projets/pr1'; });
  await expect(page.locator('input.titre-editable')).toHaveValue('Site du lac');
  await verifier('fiche projet');
  await expect(page.locator('[data-prop="github"], [data-action="creer-dossier"]')).toHaveCount(0);
  await ouvrirDocuments(page);
  await expect(page.locator('[data-prop="dossier"]')).toBeVisible();
});

test('I6 tâche de projet : pas de « Confié à » (Jérôme / Charles) chez un client', async ({ page }) => {
  await ouvrir(page, 'studio', 'projets/projets/pr1');
  const ligne = page.locator('.tache[data-tache="t1"]');
  await expect(ligne).toBeVisible();
  await ligne.locator('[data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await expect(page.getByRole('dialog').getByLabel('Titre du livrable')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Confié à')).toHaveCount(0);
  await page.getByRole('dialog').getByLabel('Titre du livrable').fill('Maquette validée');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await listerDocuments('clients/studio/projets_taches')).find((t) => t.id === 't1')?.titre).toBe('Maquette validée');
  expect((await listerDocuments('clients/studio/projets_taches')).find((t) => t.id === 't1').assigneA, 'le champ existant n\'est pas touché').toBe('jerome');
});

test('I7 célébration neutre (« Bravo ! », sans Charles ni « Bravo Jérôme ! ») quand une affaire est gagnée chez un client : allumée par défaut', async ({ page }) => {
  await ouvrir(page, 'studio', 'crm/affaires/a1');
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await page.locator('[data-action="choisir-etape"]').selectOption({ label: 'Gagné' }); // J9 : plus de bouton « Gagnée », on passe par la liste « Étape »
  await expect.poll(async () => (await listerDocuments('clients/studio/crm_affaires')).find((a) => a.id === 'a1').statut).toBe('gagnee');
  await expect(page.locator('.celebration')).toBeVisible();
  await expect(page.locator('.celebration')).toContainText('Bravo');
  expect(await page.locator('.celebration').innerText()).not.toMatch(IDENTITE_JEROME);
  await expect(page.locator('.charles-content')).toHaveCount(0);
});

test('I7b chez un client dont le réglage « celebrations » est écrit à false : aucune célébration (le booléen enregistré garde la priorité)', async ({ page }) => {
  await ecrireDocument('clients/studio/crm_parametres/reglages', { celebrations: false });
  await ouvrir(page, 'studio', 'crm/affaires/a1');
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await page.locator('[data-action="choisir-etape"]').selectOption({ label: 'Gagné' }); // J9 : plus de bouton « Gagnée », on passe par la liste « Étape »
  await expect.poll(async () => (await listerDocuments('clients/studio/crm_affaires')).find((a) => a.id === 'a1').statut).toBe('gagnee');
  await page.waitForTimeout(600);
  await expect(page.locator('.celebration, .charles-content')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Bravo');
  expect((await lireDocument('clients/studio/crm_parametres/reglages')).celebrations).toBe(false);
});

test('I8 réglages de départ écrits chez un client : sans le compte GitHub ni le dossier de Jérôme', { tag: '@sans-telephone' }, async ({ page }) => {
  await ouvrir(page, 'studio');
  await expect.poll(async () => (await listerDocuments('clients/studio/crm_parametres')).map((d) => d.id).includes('reglages')).toBe(true);
  const r = (await listerDocuments('clients/studio/crm_parametres')).find((d) => d.id === 'reglages');
  expect(r.proprietaireGithub).toBe('');
  expect(r.cheminProjets).toBe('');
  expect(JSON.stringify(Object.values(r))).not.toMatch(IDENTITE_JEROME);
});

test('I9 la page de connexion du client (avant la connexion) n\'a aucune identité de Jérôme, même avant la lecture de la marque', { tag: '@sans-telephone' }, async ({ page }) => {
  await page.route('https://images.exemple.test/**', (route) => route.fulfill({ status: 200, body: PNG_1X1, headers: { 'Content-Type': 'image/png' } }));
  await page.goto(`${URL_APP}#/espace/studio`);
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page).toHaveTitle('Studio Lune');
  expect(await page.locator('body').innerText()).not.toMatch(IDENTITE_JEROME);
  const manifeste = await page.evaluate(() => document.head.querySelector('link[rel="manifest"]')?.getAttribute('href'));
  expect(manifeste).not.toBe('manifest.webmanifest');
  expect(await page.evaluate(() => document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '')).not.toContain('assets/icons');
});

test('I10 chez un client : « Ajouter un document » (Google branché) et dossier de travail libre ; « Créer un dossier dans Google Drive » allumé par défaut, absent quand le réglage est écrit à false, dans l\'espace du client', async ({ page, context }) => {
  const drive = await brancherGoogle(context);
  // Réglage écrit à false (comme chez Ingrid) AVANT d'ouvrir la fiche : le dossier de travail est un lien libre, pas de création ; la fenêtre Google d'ajout de document est là.
  await ecrireDocument('clients/studio/crm_parametres/reglages', { boutonsDepot: false });
  await ouvrir(page, 'studio', 'projets/projets/pr1');
  await expect(page.locator('input.titre-editable')).toHaveValue('Site du lac');
  await ouvrirDocuments(page);
  await page.locator('[data-action="ajouter-dossier"]').click(); // « + Ajouter » ouvre les choix du dossier de travail
  await expect(page.locator('[data-action="creer-dossier-ouvrir"]')).toHaveCount(0);
  await expect(page.locator('[data-action="lier-dossier"]')).toBeVisible();
  await expect(page.locator('[data-section="projet-documents"] [data-prop="documents"]')).toContainText('Documents');
  // Sans dossier de travail : « Ajouter un document » l'explique et ne propose que « Créer le dossier » ou « Annuler » (plus de « Parcourir seulement »).
  await page.locator('[data-action="ajouter-document-google"]').click();
  await expect(page.getByRole('dialog')).toContainText('Cette fiche n’a pas de dossier de travail');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Parcourir seulement' })).toHaveCount(0);
  await page.getByRole('dialog').locator('.dialogue-pied').getByRole('button', { name: 'Fermer' }).click();
  expect((await lireDocument('clients/studio/projets_projets/pr1')).documents).toEqual([]);
  // « Lier un dossier Google Drive existant » : la fenêtre Google en mode « choisir un dossier » ; aucun champ pour coller une adresse.
  await expect(page.locator('[data-champ="dossier"]')).toHaveCount(0);
  await choisirDansGoogle(page, [{ id: 'DOSSIER_LUNE_1234', name: 'Lune', url: 'https://drive.google.com/drive/folders/DOSSIER_LUNE_1234', mimeType: 'application/vnd.google-apps.folder' }]);
  if (!(await page.locator('[data-role="choix-dossier"]').count())) await page.locator('[data-action="ajouter-dossier"]').click(); // « + Ajouter » ouvre les deux choix
  await page.locator('[data-action="lier-dossier"]').click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).urlDossier).toBe('https://drive.google.com/drive/folders/DOSSIER_LUNE_1234');
  const g = await lireGoogle(page);
  expect(g.autorisations[0]).toMatchObject({ clientId: ID_CLIENT, indice: ALICE });
  expect(g.pickers[0].titre).toBe('Choisir un dossier');
  // Un document : fichier déjà dans le dossier de travail (déposé par « Importer ») → case grisée et cochée, message gris.
  drive.fichiers.F1 = { parents: ['DOSSIER_LUNE_1234'], createdTime: new Date().toISOString() };
  await choisirDansGoogle(page, [{ id: 'F1', name: 'Contrat.pdf', url: 'https://drive.google.com/file/d/F1/view', mimeType: 'application/pdf', parentId: 'DOSSIER_LUNE_1234' }]);
  await page.locator('[data-action="ajouter-document-google"]').click();
  await expect(page.locator('[data-role="case-importe"]')).toContainText('Le fichier est envoyé dans le dossier de travail');
  await expect(page.locator('[data-role="case-importe"] input')).toBeDisabled();
  await expect(page.locator('[data-role="case-importe"] input')).toBeChecked();
  await page.locator('[data-role="form-lien"] [data-action="valider-lien"]').click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).documents).toEqual([{ libelle: 'Contrat.pdf', url: 'https://drive.google.com/file/d/F1/view', ajouteLe: expect.any(String) }]);
  expect(drive.copies).toHaveLength(0);
  // Retirer le dossier de travail : confirmation, puis « Annuler » pendant 8 secondes (ici on l'utilise), puis retrait définitif.
  await page.locator('[data-action="retirer-dossier"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).urlDossier).toBe('');
  await page.locator('.toast [data-action="toast-action"]').last().click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).urlDossier).toBe('https://drive.google.com/drive/folders/DOSSIER_LUNE_1234');
  await page.locator('[data-action="retirer-dossier"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).urlDossier).toBe('');
  // On allume l'interrupteur (comme dans les Réglages) : « Créer un dossier dans Google Drive » apparaît et crée dans Drive.
  await expect.poll(async () => (await lireDocument('clients/studio/crm_parametres/reglages')) !== null).toBe(true);
  await ecrireDocument('clients/studio/crm_parametres/reglages', { ...(await lireDocument('clients/studio/crm_parametres/reglages')), boutonsDepot: true, sousDossiersDrive: ['Contrat'] });
  if (!(await page.locator('[data-role="choix-dossier"]').count())) await page.locator('[data-action="ajouter-dossier"]').click(); // « + Ajouter » ouvre les deux choix
  await page.locator('[data-action="creer-dossier-ouvrir"]').click();
  await page.locator('[data-action="creer-dossier"]').click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).urlDossier).toBe('https://drive.google.com/drive/folders/DOSSIER_2_abcdefghij');
  expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Chevalier IA - Studio Lune', 'Site du lac', 'Contrat']); // le parent est créé tout seul au premier besoin
});

test('P6 chez un client : « Créer un dossier dans Google Drive » crée TOUT SEUL « Chevalier IA - <nom de l\'espace> » une seule fois (nom lu dans la fiche de marque), puis le réutilise', async ({ page, context }) => {
  const drive = await brancherGoogle(context);
  await ouvrir(page, 'studio', 'projets/projets/pr1');
  await expect.poll(async () => (await lireDocument('clients/studio/crm_parametres/reglages')) !== null).toBe(true);
  await ecrireDocument('clients/studio/crm_parametres/reglages', { ...(await lireDocument('clients/studio/crm_parametres/reglages')), boutonsDepot: true });
  await ouvrirDocuments(page);
  if (!(await page.locator('[data-role="choix-dossier"]').count())) await page.locator('[data-action="ajouter-dossier"]').click(); // « + Ajouter » ouvre les deux choix
  await page.locator('[data-action="creer-dossier-ouvrir"]').click();
  await page.locator('[data-action="creer-dossier"]').click();
  await expect.poll(async () => (await lireDocument('clients/studio/projets_projets/pr1')).urlDossier).toMatch(/DOSSIER_2_/);
  expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Chevalier IA - Studio Lune', 'Site du lac']);
  expect(drive.requetes[0].corps.parents).toBeUndefined(); // dans Mon Drive
  expect(drive.requetes[1].corps.parents).toEqual(['DOSSIER_1_abcdefghij']);
  expect((await lireDocument('clients/studio/crm_parametres/reglages')).dossierParentDrive).toEqual({ id: 'DOSSIER_1_abcdefghij', nom: 'Chevalier IA - Studio Lune', auto: true });
});

// Connexion : une erreur réseau ne déconnecte jamais (26/10/2026). Captures dans tests/e2e/captures/auth-pas-de-deconnexion/.
const CAPTURES_AUTH = 'e2e/captures/auth-pas-de-deconnexion';
async function ouvrirAvecEchecs(page, echecs) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/studio`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((n) => { window.__chevalierTest.attentesMembre = [50, 50, 50]; window.__chevalierTest.echecsMembre = n; }, echecs);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
}

test('AUTH1 une lecture de la fiche d\'appartenance qui échoue une fois ne déconnecte pas', async ({ page }) => {
  const avertissements = [];
  page.on('console', (m) => { if (m.type() === 'warning') avertissements.push(m.text()); });
  await ouvrirAvecEchecs(page, 1);
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toHaveCount(0);
  expect(avertissements.join('\n')).toContain('unavailable');
  expect(avertissements.join('\n')).not.toContain(ALICE);
  await page.screenshot({ path: `${CAPTURES_AUTH}/AUTH1-connecte-apres-une-panne${estTelephone(page) ? '-telephone' : ''}.png` });
});

test('AUTH2 une panne persistante affiche « Connexion impossible » avec « Réessayer », sans déconnecter', async ({ page }) => {
  await ouvrirAvecEchecs(page, 99);
  await expect(page.getByRole('alert')).toContainText('Connexion impossible pour le moment');
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toHaveCount(0);
  await page.screenshot({ path: `${CAPTURES_AUTH}/AUTH2-erreur-reessayer${estTelephone(page) ? '-telephone' : ''}.png` });
  // Le compte est resté connecté : une fois la panne finie, « Réessayer » rouvre l'espace.
  await page.evaluate(() => { window.__chevalierTest.echecsMembre = 0; });
  const rechargement = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await rechargement;
  await expect(page.locator('.coquille')).toBeVisible();
});
