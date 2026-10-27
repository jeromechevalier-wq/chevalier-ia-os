// Onglet « Documents » version 2 (idée I10) : dossier de travail en haut, ligne « Documents  + Ajouter », date d'ajout, plus de « Ajouter un lien web ».
// Google est simulé (google-simule.js). Un test par critère, nom commençant par « I10 » ; une capture par critère dans tests/e2e/captures/onglet-documents-v2/ (format ordinateur).
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, lireDocument, estTelephone, ouvrirDocumentsSiPresent } from './outils.js';
import { brancherGoogle, debrancherGoogle, choisirDansGoogle } from './google-simule.js';

const DOSSIER_CAPTURES = fileURLToPath(new URL('./captures/onglet-documents-v2/', import.meta.url));
const ID_DOSSIER = '1AbC_dEf-1234567';
const URL_DOSSIER = `https://drive.google.com/drive/folders/${ID_DOSSIER}`;
const FICHES = [
  { nom: 'affaire', hash: '#/crm/affaires/a1', section: 'affaire-documents', collection: 'crm_affaires', id: 'a1', creer: (extra = {}) => creerAffaire('a1', { titre: 'Audit des Lilas', ...extra }) },
  { nom: 'projet', hash: '#/projets/projets/pr1', section: 'projet-documents', collection: 'projets_projets', id: 'pr1', creer: (extra = {}) => creerProjet('pr1', { titre: 'Refonte site', ...extra }) },
];

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); await ouvrirDocumentsSiPresent(page); }
/** Une capture par critère, au format ordinateur seulement (la mise en page ne change pas selon la fiche ; le téléphone passe par les mêmes assertions). */
async function capturer(page, nom) { if (!estTelephone(page)) await page.screenshot({ path: `${DOSSIER_CAPTURES}${nom}.png`, fullPage: true }); }
const fichier = (id, nom) => ({ id, name: nom, url: `https://drive.google.com/file/d/${id}/view`, mimeType: 'application/pdf', parentId: ID_DOSSIER });

// Ce bac à sable n'atteint pas apis.google.com : un script vide par défaut ; brancherGoogle (enregistré ensuite, donc prioritaire) le remplace par le faux Picker quand le test en a besoin.
test.beforeEach(async ({ context }) => { await context.route('https://apis.google.com/js/api.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' })); });

for (const f of FICHES) {
  test(`I10 dossier de travail ${f.nom} : en haut de l'onglet, sans dossier « + Ajouter » propose « Créer un dossier dans Google Drive » ou « Lier un dossier Google Drive existant » (cas vide)`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    const zone = page.locator(`[data-section="${f.section}"]`);
    const dossier = zone.locator('[data-prop="dossier"]');
    await expect(dossier.locator('.prop-libelle')).toContainText('Dossier de travail');
    await expect(dossier.locator('[data-action="ajouter-dossier"]')).toHaveText('Ajouter');
    await expect(dossier.locator('.boutons-liens')).toHaveCount(0); // rien d'autre avant le clic
    await dossier.locator('[data-action="ajouter-dossier"]').click();
    await expect(dossier.locator('.boutons-liens button')).toHaveText(['Créer un dossier dans Google Drive', 'Lier un dossier Google Drive existant']);
    // Un second clic referme les choix.
    await dossier.locator('[data-action="ajouter-dossier"]').click();
    await expect(dossier.locator('.boutons-liens')).toHaveCount(0);
    await dossier.locator('[data-action="ajouter-dossier"]').click();
    // Il est au-dessus de la ligne « Documents ».
    await expect.poll(async () => { const d = await dossier.boundingBox(); const t = await zone.locator('[data-prop="documents"]').boundingBox(); return d && t ? d.y < t.y : null; }).toBe(true);
    if (f.nom === 'affaire') await capturer(page, 'I10-dossier-ajouter');
  });

  test(`I10 clavier ${f.nom} : « + Ajouter » du dossier met le focus sur le premier choix ; Échap referme les choix et rend le focus à « + Ajouter »`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    const dossier = page.locator(`[data-section="${f.section}"] [data-prop="dossier"]`);
    await dossier.locator('[data-action="ajouter-dossier"]').focus();
    await page.keyboard.press('Enter');
    await expect(dossier.locator('[data-action="ajouter-dossier"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(dossier.locator('[data-role="choix-dossier"] button').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dossier.locator('.boutons-liens')).toHaveCount(0);
    await expect(dossier.locator('[data-action="ajouter-dossier"]')).toBeFocused();
  });

  test(`I10 dossier de travail ${f.nom} : avec un dossier, « Ouvrir le dossier » et « Retirer » ; retirer demande confirmation, puis « Annuler » reste affiché 8 secondes`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    const dossier = page.locator(`[data-section="${f.section}"] [data-prop="dossier"]`);
    await expect(dossier.locator('[data-action="ouvrir-dossier"]')).toHaveText(/Ouvrir le dossier/);
    await expect(dossier.locator('[data-action="retirer-dossier"]')).toHaveText('');
    await expect(dossier.getByRole('button', { name: 'Retirer le dossier' })).toBeVisible();
    await expect(dossier.locator('[data-action="ajouter-dossier"]')).toHaveCount(0);
    if (f.nom === 'projet') await capturer(page, 'I10-dossier-ouvrir-retirer');
    await dossier.locator('[data-action="retirer-dossier"]').click();
    await expect(page.getByRole('dialog')).toContainText('Seul le lien est retiré');
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click(); // la confirmation d'abord : annuler ne retire rien
    expect((await lireDocument(`${f.collection}/${f.id}`)).urlDossier).toBe(URL_DOSSIER);
    await dossier.locator('[data-action="retirer-dossier"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
    await expect.poll(async () => (await lireDocument(`${f.collection}/${f.id}`)).urlDossier).toBe('');
    const annuler = page.locator('.toast [data-action="toast-action"]');
    await expect(annuler).toHaveText('Annuler');
    await page.waitForTimeout(6500); // toujours là presque 8 secondes plus tard
    await expect(annuler).toBeVisible();
    await annuler.click();
    await expect.poll(async () => (await lireDocument(`${f.collection}/${f.id}`)).urlDossier).toBe(URL_DOSSIER);
  });

  test(`M1 dossier de travail ${f.nom} : « Retirer » est une simple croix (nom « Retirer le dossier »), de 44 px sur téléphone, et la confirmation s'affiche avant`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    const croix = page.locator(`[data-section="${f.section}"] [data-prop="dossier"]`).getByRole('button', { name: 'Retirer le dossier' });
    await expect(croix).toBeVisible();
    await expect(croix).toHaveText('');
    if (estTelephone(page)) await expect.poll(async () => { const b = await croix.boundingBox(); return b && Math.min(b.width, b.height) >= 44; }).toBe(true);
    await capturer(page, f.nom === 'projet' ? 'M1-croix-retirer-dossier' : 'M1-croix-retirer-dossier-affaire');
    await croix.click();
    await expect(page.getByRole('dialog')).toContainText('Seul le lien est retiré');
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
    expect((await lireDocument(`${f.collection}/${f.id}`)).urlDossier).toBe(URL_DOSSIER);
  });

  test(`I10 documents ${f.nom} : plus de titre « Liens et documents » ; la ligne « Documents  + Ajouter » est toujours en haut de la liste, avec son « i »`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ documents: [{ libelle: 'Ancien devis', url: 'https://exemple.fr/ancien' }, { libelle: 'Contrat', url: 'https://exemple.fr/contrat' }] });
    await connecter(page);
    await aller(page, f.hash);
    const zone = page.locator(`[data-section="${f.section}"]`);
    await expect(zone).not.toContainText('Liens et documents');
    await expect(zone.locator('h2', { hasText: 'Liens et documents' })).toHaveCount(0);
    const ligne = zone.locator('[data-prop="documents"]');
    await expect(ligne.locator('.prop-libelle')).toContainText('Documents');
    await expect(ligne.locator('[data-role="info"]')).toHaveCount(1);
    await expect(ligne.locator('[data-action="ajouter-document-google"]')).toHaveText('Ajouter');
    await expect.poll(async () => { const l = await ligne.boundingBox(); const premier = await zone.locator('.ligne-lien').first().boundingBox(); return l && premier ? l.y < premier.y : null; }).toBe(true);
    await capturer(page, f.nom === 'projet' ? 'I10-documents-ligne-ajouter' : 'I10-documents-ligne-ajouter-affaire');
  });

  test(`I10 documents ${f.nom} : chaque document ajouté affiche la date et l'heure de son ajout ; un ancien document sans date n'en affiche pas`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER, documents: [{ libelle: 'Ancien devis', url: 'https://exemple.fr/ancien' }] });
    await connecter(page);
    await aller(page, f.hash);
    const zone = page.locator(`[data-section="${f.section}"]`);
    drive.fichiers.FICHIER_V2_0001 = { parents: [ID_DOSSIER] };
    await choisirDansGoogle(page, [fichier('FICHIER_V2_0001', 'Plan.pdf')]);
    const avant = Date.now();
    await zone.locator('[data-action="ajouter-document-google"]').click();
    await zone.locator('[data-action="valider-lien"]').click();
    const nouveau = zone.locator('.ligne-lien', { hasText: 'Plan.pdf' });
    await expect(nouveau.locator('[data-role="date-ajout"]')).toContainText(/^Ajouté le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    await expect.poll(async () => { // la date enregistrée est celle de l'ajout (l'écran l'affiche avant que la base la renvoie : on attend)
      const doc = ((await lireDocument(`${f.collection}/${f.id}`)).documents || []).find((d) => d.libelle === 'Plan.pdf');
      return doc?.ajouteLe ? Math.abs(new Date(doc.ajouteLe).getTime() - avant) < 60_000 : false;
    }).toBe(true);
    await expect(zone.locator('.ligne-lien', { hasText: 'Ancien devis' }).locator('[data-role="date-ajout"]')).toHaveCount(0);
    await capturer(page, f.nom === 'projet' ? 'I10-documents-date' : 'I10-documents-date-affaire');
  });

  test(`I10 documents ${f.nom} : plus de bouton « Ajouter un lien web » ; un lien web déjà enregistré reste affiché`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ documents: [{ libelle: 'Espace client', url: 'https://exemple.fr/espace', note: 'accès partagé' }] });
    await connecter(page);
    await aller(page, f.hash);
    const zone = page.locator(`[data-section="${f.section}"]`);
    await expect(zone.getByText('Ajouter un lien web')).toHaveCount(0);
    await expect(zone.locator('[data-action="ajouter-lien"]')).toHaveCount(0);
    await expect(zone.getByRole('link', { name: 'Espace client' })).toHaveAttribute('href', 'https://exemple.fr/espace');
    await expect(zone.locator('.lien-note')).toHaveText('accès partagé');
    if (f.nom === 'projet') await capturer(page, 'I10-lien-web-existant');
  });

  test(`I10 règle conservée ${f.nom} : sans dossier de travail, « + Ajouter » un document affiche seulement un message qui explique pourquoi, avec « Fermer » (cas d'erreur)`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    await page.locator(`[data-section="${f.section}"] [data-action="ajouter-document-google"]`).click();
    const fenetre = page.getByRole('dialog');
    await expect(fenetre).toContainText('on ne peut pas y ajouter de document');
    await expect(fenetre.locator('.dialogue-pied button')).toHaveText('Fermer');
    if (f.nom === 'affaire') await capturer(page, 'I10-sans-dossier-message');
    await fenetre.locator('.dialogue-pied button').click();
    expect(drive.requetes).toHaveLength(0);
  });

  test(`I10 cas Google non branché ${f.nom} : la ligne « Documents » le dit et ne propose ni « + Ajouter » ni choix de dossier`, async ({ page, context }) => {
    await debrancherGoogle(context);
    await f.creer({ documents: [{ libelle: 'Ancien devis', url: 'https://exemple.fr/ancien' }] });
    await connecter(page);
    await aller(page, f.hash);
    const zone = page.locator(`[data-section="${f.section}"]`);
    await expect(zone.locator('[data-role="google-absent-documents"]')).toContainText('Google Drive n’est pas branché ici');
    await expect(zone.locator('[data-role="google-absent"]')).toContainText('Google Drive n’est pas branché ici');
    await expect(zone.locator('[data-action="ajouter-document-google"], [data-action="ajouter-dossier"]')).toHaveCount(0);
    await expect(zone.getByRole('link', { name: 'Ancien devis' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); // jamais de défilement horizontal
  });
}
