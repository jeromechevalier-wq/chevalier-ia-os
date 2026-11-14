// Module Rendez-vous, PR 2 (14/11/2026) : liste (Kanban | Liste | Archives), création, réglages, export, chez Jérôme (racine). Un test par consigne de Jérôme, nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/rdv/ (« -telephone » sur téléphone). Données fictives uniquement. Aucun SMS ne part : l'envoi n'est pas encore branché.
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, listerDocuments, lireDocument, ecrireDocument, estTelephone, creerPersonne } from './outils.js';

const CAPTURES = 'e2e/captures/rdv';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const dansJours = (n, h = 10) => { const d = new Date(Date.now() + n * 86400000); d.setUTCHours(h - 1, 0, 0, 0); return d.toISOString(); };
async function semer(id, extra = {}, participants = []) {
  await ecrireDocument(`rdv_rendezvous/${id}`, {
    client: 'M. Durand', objet: 'Visite avant terrassement', adresse: '12 rue des Lilas\n69000 Lyon', commune: 'Lyon', creneaux: [dansJours(5), dansJours(6, 14), dansJours(7, 9)],
    etat: 'en_attente', creneauChoisi: null, archive: false, tour: 1, relancesFaites: 0, envoiDemandeLe: null, confirmeLe: null, annule: false, ...extra,
  });
  for (const [i, p] of participants.entries()) {
    await ecrireDocument(`rdv_participants/${id}-p${i + 1}`, { rendezVousId: id, personneId: null, nom: p.nom, role: p.role || '', telephone: p.telephone || '+33600000001', reponse: '', etatReponse: p.etatReponse || 'attente', creneauxOk: p.creneauxOk || [] });
  }
}
const ouvrirListe = async (page) => { await allerA(page, 'Rendez-vous'); await expect(page.getByRole('heading', { name: 'Rendez-vous', level: 1 })).toBeVisible(); };
const menuCarte = (page, client) => page.getByRole('button', { name: `Actions : ${client}` }).first();

test('menu : « Rendez-vous » est dans le menu, un seul écran, route nue vers la liste, route inconnue renvoyée à la liste', async ({ page }) => {
  await connecter(page);
  await ouvrirListe(page);
  await expect(page).toHaveURL(/#\/rdv\/liste$/);
  await page.evaluate(() => { location.hash = '#/rdv/inconnu'; });
  await expect(page).toHaveURL(/#\/rdv\/liste$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal').toBe(true);
});

test('vide : aucun rendez-vous, une phrase simple et UN seul bouton jaune (celui de l’en-tête)', async ({ page }) => {
  await connecter(page);
  await ouvrirListe(page);
  await expect(page.locator('[data-role="vide-rdv"]')).toContainText('Aucun rendez-vous pour l’instant. Crée le premier pour proposer des créneaux par SMS.');
  await expect(page.locator('.page-rdv .bouton-principal')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Rendez-vous', exact: true })).toHaveClass(/bouton-principal/);
  await expect(page.locator('.page-rdv [data-action="creer-premier-rdv"]')).toHaveClass(/bouton-secondaire/);
  await capture(page, 'vide');
});

test('1 vues Kanban | Liste | Archives ; menu « ⋯ » de la carte : Archiver, puis Désarchiver dans Archives', async ({ page }) => {
  await semer('r1', {}, [{ nom: 'M. Durand', role: 'Client' }]);
  await connecter(page);
  await ouvrirListe(page);
  await expect(page.locator('.bascule-vue')).toHaveText(['Kanban', 'Liste', 'Archives']);
  await expect(page.locator('.bascule-vue[data-vue="kanban"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Actif|Archivé/)).toHaveCount(0);
  await menuCarte(page, 'M. Durand').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Ouvrir', 'Archiver']);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Archiver' }).click();
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.archive).toBe(true);
  await expect(page.locator('.carte-rdv')).toHaveCount(0);
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page).toHaveURL(/#\/rdv\/archives$/);
  await expect(page.locator('.bascule-vue[data-vue="archives"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
  await page.getByRole('button', { name: 'Actions : M. Durand' }).click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Ouvrir', 'Désarchiver']);
  await capture(page, '1-archives');
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Désarchiver' }).click();
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.archive).toBe(false);
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page).toHaveURL(/#\/rdv\/liste$/);
  await expect(page.locator('.carte-rdv')).toHaveCount(1);
});

test('2 le Kanban (4 colonnes, carte : client, commune, ligne d’état) et le tableau (Client, Commune, Créneau, Réponses, État)', async ({ page }) => {
  await semer('r1', {}, [{ nom: 'M. Durand', role: 'Client', etatReponse: 'comprise', creneauxOk: [1] }, { nom: 'Terrassier', role: 'Terrassier' }]);
  await semer('r2', { client: 'Mme Petit', commune: 'Annecy', etat: 'a_valider' }, [{ nom: 'Mme Petit', role: 'Client', etatReponse: 'comprise', creneauxOk: [2] }]);
  await connecter(page);
  await ouvrirListe(page);
  await expect(page.locator('.kanban .colonne-tete h2')).toHaveText(['En attente', 'À valider', 'Confirmés', 'À reprendre']);
  const carte = page.locator('.colonne[data-colonne="en_attente"] .carte-rdv');
  await expect(carte).toContainText('M. Durand');
  await expect(carte.locator('.carte-sous .icone')).toHaveCount(1); // l'icône map-pin devant la commune
  await expect(carte).toContainText('Lyon');
  await expect(carte.locator('[data-role="etat-rdv"]')).toContainText('1 réponse sur 2');
  await expect(page.locator('.colonne[data-colonne="a_valider"] .carte-rdv')).toContainText('Mme Petit');
  await expect(page.locator('.compteur-liste')).toHaveText('2 rendez-vous');
  await expect(page.getByPlaceholder('Rechercher un rendez-vous')).toBeVisible();
  await expect(page.locator('.selecteur-tri option:checked')).toHaveText('Trier par : Date du rendez-vous');
  await capture(page, '2-kanban');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('table.tableau-rdv thead th')).toContainText(['Client', 'Commune', 'Créneau', 'Réponses', 'État']);
  await expect(page.locator('table.tableau-rdv tbody tr')).toHaveCount(2);
  await expect(page.locator('table.tableau-rdv tbody tr').first()).toContainText('1 sur 2');
  await capture(page, '2-tableau');
  await page.getByPlaceholder('Rechercher un rendez-vous').fill('annecy');
  await expect(page.locator('table.tableau-rdv tbody tr')).toHaveCount(1);
});

test('4 « Adresse du rendez-vous » est un champ multiligne ; la commune est déduite ; l’adresse est proposée sur la fiche de la première personne (libellé « Chantier »), sans doublon', async ({ page }) => {
  await creerPersonne('pers1', { nom: 'M. Durand', telephones: [{ valeur: '06 00 00 00 01', type: 'perso' }] });
  await connecter(page);
  await ouvrirListe(page);
  await page.getByRole('button', { name: 'Rendez-vous', exact: true }).click();
  await expect(page).toHaveURL(/#\/rdv\/nouveau$/);
  await expect(page.getByRole('heading', { name: 'Nouveau rendez-vous', level: 1 })).toBeVisible();
  const adresse = page.getByLabel('Adresse du rendez-vous');
  expect(await adresse.evaluate((e) => e.tagName)).toBe('TEXTAREA');
  await adresse.fill('12 rue des Lilas\n69000 Lyon');
  await page.getByLabel('Objet de la visite').fill('Visite avant terrassement');
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('M. Dur');
  await page.getByRole('option', { name: /M\. Durand/ }).first().click();
  await expect(ligne.getByLabel('Téléphone mobile')).toHaveValue('06 00 00 00 01');
  await ligne.getByLabel('Rôle').selectOption('Client');
  await page.getByLabel('Créneau 1').fill('2031-03-17T10:00');
  await expect(page.locator('.rdv-libelle-creneau').first()).toHaveText('Créneau 1, lundi 17 mars à 10h');
  await expect(page.locator('[data-type="creneaux"] .bulle-texte')).toContainText('1 : lun. 17 mars 10h');
  await capture(page, '4-creation');
  await page.getByRole('button', { name: 'Enregistrer sans envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  const [rdv] = await listerDocuments('rdv_rendezvous');
  expect(rdv.adresse).toBe('12 rue des Lilas\n69000 Lyon');
  expect(rdv.commune).toBe('Lyon');
  expect(rdv.client).toBe('M. Durand');
  expect(rdv.etat).toBe('en_attente');
  const parts = await listerDocuments('rdv_participants');
  expect(parts).toHaveLength(1);
  expect(parts[0]).toMatchObject({ personneId: 'pers1', telephone: '+33600000001', role: 'Client', etatReponse: 'attente' });
  const fiche = await lireDocument('crm_personnes/pers1');
  expect(fiche.adresses.map((a) => [a.libelle, a.adresse, a.parDefaut])).toEqual([['Chantier', '12 rue des Lilas\n69000 Lyon', true]]);
  expect((await listerDocuments('crm_audit')).some((l) => l.collection === 'rdv_rendezvous')).toBe(true); // le journal commun garde la trace
});

test('création : validation (téléphone fixe, aucun créneau), « Envoyer » grisé avec sa phrase, nouvelle personne créée avec son téléphone', async ({ page }) => {
  await connecter(page, undefined, { route: 'rdv/nouveau' });
  await expect(page.getByRole('button', { name: 'Envoyer les propositions' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Envoyer les propositions' })).toHaveClass(/bouton-principal/);
  await expect(page.locator('[data-role="envoi-non-branche"]')).toContainText('L’envoi des SMS n’est pas encore branché');
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('Mme Neuve');
  await ligne.getByLabel('Téléphone mobile').fill('01 02 03 04 05');
  await page.getByRole('button', { name: 'Enregistrer sans envoyer' }).click();
  await expect(page.locator('.rdv-erreurs')).toContainText('fixe');
  await expect(page.locator('.rdv-erreurs')).toContainText('au moins un créneau');
  expect(await listerDocuments('rdv_rendezvous')).toHaveLength(0);
  await ligne.getByLabel('Téléphone mobile').fill('06.00.00.00.09');
  await page.getByLabel('Créneau 1').fill('2031-03-17T10:00');
  await page.getByLabel('Créneau 2').fill('2031-03-18T14:30');
  await page.getByRole('button', { name: 'Enregistrer sans envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  const personnes = await listerDocuments('crm_personnes');
  expect(personnes.find((p) => p.nom === 'Mme Neuve').telephones[0].valeur).toBe('06 00 00 00 09');
  expect((await listerDocuments('rdv_participants'))[0].telephone).toBe('+33600000009');
  await capture(page, 'creation-erreur');
});

test('3 rôles : de départ, ajout, suppression seulement si aucun participant ne l’utilise (cadenas et nombre sinon)', async ({ page }) => {
  await semer('r1', { archive: true }, [{ nom: 'M. Durand', role: 'Client' }, { nom: 'Terrassier A', role: 'Terrassier' }]); // même archivé, le rôle compte
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const section = page.locator('#reglages-rdv-roles');
  await expect(section.locator('[data-role="role"]')).toHaveCount(4);
  await expect(section.locator('[data-nom="Client"] .rdv-role-utilise')).toHaveText('1');
  await expect(section.locator('[data-nom="Client"] button')).toHaveCount(0);
  await expect(section.locator('[data-nom="Terrassier"] .rdv-role-utilise')).toHaveText('1');
  await expect(section.locator('[data-nom="Architecte"] .rdv-role-utilise')).toHaveCount(0);
  await section.getByRole('button', { name: 'Ajouter un rôle' }).click();
  await page.getByLabel('Nom du rôle').fill('Maçon');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(section.locator('[data-nom="Maçon"]')).toBeVisible();
  await section.getByRole('button', { name: 'Supprimer le rôle Architecte' }).click();
  await expect(section.locator('[data-nom="Architecte"]')).toHaveCount(0);
  expect((await lireDocument('rdv_parametres/reglages')).roles).toEqual(['Client', 'Terrassier', 'Géomètre', 'Maçon']);
  await capture(page, '3-roles');
});

test('9 « Nombre de relances » est une case avec les deux petites flèches (haute et basse) ; 10 « Heure du rappel » est grisée quand le rappel est éteint', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const nombre = page.getByLabel('Nombre de relances');
  expect(await nombre.getAttribute('type')).toBe('number');
  await expect(nombre).toHaveValue('3');
  await nombre.focus();
  await page.keyboard.press('ArrowUp');
  await expect(nombre).toHaveValue('4');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.relances?.nombre).toBe(4);
  await expect(page.getByLabel('Délai entre deux relances, en heures')).toHaveValue('24');
  await capture(page, '9-relances');
  const section = page.locator('#reglages-rdv-rappel');
  const heure = section.getByLabel('Heure du rappel');
  await expect(heure).toBeEnabled();
  await expect(heure).toHaveValue('19:00');
  await section.getByRole('switch', { name: 'Envoyer un rappel la veille' }).click();
  await expect(heure).toBeDisabled();
  await expect(section.locator('.rdv-reglage-ligne.grisee')).toHaveCount(1);
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.rappel?.actif).toBe(false);
  await capture(page, '10-rappel-eteint');
  await section.getByRole('switch', { name: 'Envoyer un rappel la veille' }).click();
  await expect(heure).toBeEnabled();
});

test('11 plusieurs numéros d’alerte avec un interrupteur par numéro, et le choix du numéro donné aux participants', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const section = page.locator('#reglages-rdv-alertes');
  await expect(section.locator('[data-role="aucun-numero"]')).toBeVisible();
  for (const [nom, tel] of [['Mon mobile', '06 00 00 00 01'], ['Collègue', '07 00 00 00 02']]) {
    await section.getByRole('button', { name: 'Ajouter un numéro' }).click();
    await page.getByLabel('Nom (ex. Mon mobile, Collègue)').fill(nom);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByLabel('Numéro de mobile').fill(tel);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(section.locator('.rdv-numero', { hasText: nom })).toBeVisible();
  }
  await section.getByRole('button', { name: 'Ajouter un numéro' }).click();
  await page.getByLabel('Nom (ex. Mon mobile, Collègue)').fill('Fixe');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByLabel('Numéro de mobile').fill('01 00 00 00 00');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.toast-erreur')).toContainText('fixe');
  await expect(section.locator('.rdv-numero')).toHaveCount(2);
  await section.getByRole('switch', { name: 'Alerter Mon mobile' }).click(); // vacances : on coupe ce numéro
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.numerosAlerte?.map((n) => n.actif)).toEqual([false, true]);
  await section.getByLabel('Numéro donné aux participants').selectOption({ label: 'Collègue · 07 00 00 00 02' });
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.numeroAffiche).toMatch(/.+/);
  await capture(page, '11-numeros');
  await section.getByRole('button', { name: 'Supprimer le numéro Collègue' }).click();
  await expect(section.locator('.rdv-numero')).toHaveCount(1);
  expect((await lireDocument('rdv_parametres/reglages')).numeroAffiche).toBe('');
});

test('12 le nombre de caractères de chaque SMS est affiché, la règle des accents est expliquée, un caractère spécial est remplacé', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const section = page.locator('#reglages-rdv-modeles');
  await expect(section.locator('[data-modele]')).toHaveCount(6);
  for (const m of await section.locator('.rdv-modele-compte').allTextContents()) {
    expect(m).toMatch(/^\d+ caractères · 1 SMS$/);
    expect(Number(m.split(' ')[0])).toBeLessThan(160);
  }
  await expect(section.locator('[data-role="explication-accents"]')).toContainText('ê devient e');
  await expect(section.locator('[data-role="explication-accents"]')).toContainText('70 caractères');
  await section.locator('[data-action="modifier-modele-rappel"]').click();
  const champ = page.getByLabel('Modèle : Rappel de la veille');
  await champ.fill('Rappel : forêt {client} {heure}');
  await expect(page.locator('.dialogue .compteur-sms')).toContainText('caractères sur 160 · 1 SMS');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.modeles?.rappel).toBe('Rappel : foret {client} {heure}');
  await capture(page, '12-modeles');
  await page.goto('/?emulateurs=1#/rdv/nouveau');
  await expect(page.locator('[data-type="confiance"] .compteur-sms')).toContainText(/\d+ caractères sur 160 · 1 SMS/);
  await capture(page, '12-apercu-creation');
});

test('export : Réglages > Rendez-vous > Sauvegarde télécharge un JSON avec les quatre tables ; bouton secondaire', async ({ page }) => {
  await semer('r1', {}, [{ nom: 'M. Durand', role: 'Client' }]);
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const bouton = page.locator('#reglages-export-rdv [data-action="exporter-rdv"]');
  await expect(bouton).toHaveText('Exporter les rendez-vous');
  await expect(bouton).toHaveClass(/bouton-secondaire/);
  await expect(page.locator('#reglages-export-rdv')).not.toContainText(/CRM/);
  await attendreCalme(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(dl.suggestedFilename()).toMatch(/^chevalier-ia-rendez-vous-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(Object.keys(json.collections).sort()).toEqual(['rdv_messages', 'rdv_parametres', 'rdv_participants', 'rdv_rendezvous']);
  expect(json.collections.rdv_rendezvous).toHaveLength(1);
  expect(json.collections.rdv_participants).toHaveLength(1);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('réglages : les huit sections sont dans la page Réglages de la coque, dans l’ordre voulu', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  await expect(page.locator('section.carte-section h2')).toHaveText(['Relances', 'Rappel la veille', 'Plage d’envoi', 'Numéros qui reçoivent les alertes', 'Ton nom dans les SMS', 'Rôles des participants', 'Modèles de SMS', 'Sauvegarde']);
  await page.getByLabel('Ton nom dans les SMS').fill('Mme Martin');
  await page.getByLabel('Ton nom dans les SMS').blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.nomDansLesSms).toBe('Mme Martin');
  await expect(page.locator('#reglages-rdv-modeles .rdv-modele-texte').first()).toContainText('Mme Martin');
  await capture(page, 'reglages');
});
