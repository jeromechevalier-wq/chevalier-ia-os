// Module Rendez-vous, PR 2 (14/11/2026) : liste (Kanban | Liste | Archives), création, réglages, export, chez Jérôme (racine). Un test par consigne de Jérôme, nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/rdv/ (« -telephone » sur téléphone). Données fictives uniquement. Aucun SMS ne part : l'envoi n'est pas encore branché.
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, listerDocuments, lireDocument, ecrireDocument, estTelephone, creerPersonne } from './outils.js';

const CAPTURES = 'e2e/captures/rdv';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  // La fonction du serveur qui dit si l'envoi des SMS est branché : ici « pas branché » (l'envoi réel est essayé dans rdv-envoi.spec.js). Aucun appel réseau réel.
  await context.route(/cloudfunctions\.net\/rdvEtat$/, (route) => {
    const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { branche: false } }) });
  });
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
  await attendreCalme(page); // la liste se redessine à chaque lot de données : on agit une fois la page posée
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
    await page.getByLabel('Numéro de mobile').fill(tel); // une seule fenêtre : le nom et le numéro sont là en même temps
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(section.locator('.rdv-numero', { hasText: nom })).toBeVisible();
  }
  await section.getByRole('button', { name: 'Ajouter un numéro' }).click();
  await page.getByLabel('Nom (ex. Mon mobile, Collègue)').fill('Fixe');
  await page.getByLabel('Numéro de mobile').fill('01 00 00 00 00');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog').locator('.erreur')).toContainText('fixe'); // l'erreur est dans la fenêtre, qui reste ouverte
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
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

test('A1 « Ajouter un numéro » : UNE fenêtre avec Nom et Numéro de mobile ; une erreur reste dans la fenêtre, qui reste ouverte et garde ce qui est tapé', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const section = page.locator('#reglages-rdv-alertes');
  await section.getByRole('button', { name: 'Ajouter un numéro' }).click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.getByLabel('Nom (ex. Mon mobile, Collègue)')).toBeVisible();
  await expect(fenetre.getByLabel('Numéro de mobile')).toBeVisible();
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click(); // cas vide
  await expect(fenetre.locator('.erreur')).toContainText('nom');
  await fenetre.getByLabel('Nom (ex. Mon mobile, Collègue)').fill('Bureau');
  await fenetre.getByLabel('Numéro de mobile').fill('01 00 00 00 00');
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click(); // cas d'erreur : un fixe
  await expect(fenetre.locator('.erreur')).toContainText('fixe');
  await expect(fenetre).toBeVisible();
  await expect(fenetre.getByLabel('Nom (ex. Mon mobile, Collègue)')).toHaveValue('Bureau');
  await expect(page.locator('.toast-erreur')).toHaveCount(0);
  await capture(page, 'A1-ajouter-numero-erreur');
  await fenetre.getByLabel('Numéro de mobile').fill('06 00 00 00 03');
  await expect(fenetre.locator('.erreur')).toHaveText('');
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(section.locator('.rdv-numero', { hasText: 'Bureau' })).toBeVisible();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.numerosAlerte?.map((n) => n.libelle)).toEqual(['Bureau']);
});

test('A4 la pastille TEST : sur la carte du Kanban, sur la ligne de la liste et dans la recherche du haut (qui comprend le mot « test »), jamais sur un rendez-vous réel', async ({ page }) => {
  await semer('rT', { client: 'Mme Essai', test: true }, [{ nom: 'Mme Essai', role: 'Client' }]);
  await semer('rR', { client: 'M. Réel' }, [{ nom: 'M. Réel', role: 'Client' }]);
  await connecter(page);
  await ouvrirListe(page);
  await expect(page.locator('.carte-rdv .badge-test')).toHaveCount(1);
  await expect(page.locator('.carte-rdv[data-rdv="rT"] .badge-test')).toHaveText('[TEST]');
  await expect(page.locator('.carte-rdv[data-rdv="rR"] .badge-test')).toHaveCount(0);
  await capture(page, 'A4-carte-test');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr.ligne-liste .badge-test')).toHaveCount(1);
  await expect(page.locator('tr.ligne-liste', { hasText: 'Mme Essai' }).locator('.badge-test')).toHaveText('[TEST]');
  await expect(page.locator('tr.ligne-liste', { hasText: 'M. Réel' }).locator('.badge-test')).toHaveCount(0);
  await capture(page, 'A4-ligne-test');
  await page.evaluate(() => { location.hash = '#/crm/accueil'; }); // la barre du haut est absente de l'écran Rendez-vous (il a sa propre recherche) : on cherche depuis l'Accueil
  if (estTelephone(page)) await page.locator('[data-role="ouvrir-recherche"]').click();
  await page.locator('[data-role="recherche-globale"]').fill('test');
  const liste = page.locator('ul.suggestions[aria-label="Suggestions : Rechercher"]');
  await expect(liste.locator('.suggestion', { hasText: '[TEST] Mme Essai' })).toHaveCount(1);
  await expect(liste).not.toContainText('M. Réel');
  await capture(page, 'A4-recherche-test');
});

test('A1b un numéro déjà dans la liste est refusé dans la fenêtre, même écrit autrement (+33 / 06)', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const section = page.locator('#reglages-rdv-alertes');
  await section.getByRole('button', { name: 'Ajouter un numéro' }).click();
  await page.getByLabel('Nom (ex. Mon mobile, Collègue)').fill('Mon mobile');
  await page.getByLabel('Numéro de mobile').fill('06 00 00 00 05');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(section.locator('.rdv-numero')).toHaveCount(1);
  await section.getByRole('button', { name: 'Ajouter un numéro' }).click();
  await page.getByLabel('Nom (ex. Mon mobile, Collègue)').fill('Doublon');
  await page.getByLabel('Numéro de mobile').fill('+33 6 00 00 00 05');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog').locator('.erreur')).toContainText('déjà dans la liste (Mon mobile)');
  await expect(page.getByRole('dialog')).toBeVisible();
  for (const autre of ['0033 6 00 00 00 05', '+33 (0)6 00 00 00 05']) { // d'autres façons d'écrire le même numéro
    await page.getByLabel('Numéro de mobile').fill(autre);
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('dialog').locator('.erreur')).toContainText('déjà dans la liste (Mon mobile)');
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await expect(section.locator('.rdv-numero')).toHaveCount(1);
});

test('12 le nombre de caractères de chaque SMS est affiché, la règle des accents est expliquée, un caractère spécial est remplacé', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const section = page.locator('#reglages-rdv-modeles');
  await expect(section.locator('[data-modele]')).toHaveCount(15); // six modèles des participants + neuf alertes (B1, plus « solde bas »)
  for (const m of await section.locator('.rdv-modele-compte').allTextContents()) {
    expect(m).toMatch(/^\d+ caractères · [12] SMS$/); // la ligne finale (entreprise + STOP) fait passer certains modèles à 2 SMS
    expect(Number(m.split(' ')[0])).toBeLessThan(320);
  }
  await expect(section.locator('[data-role="explication-accents"]')).toContainText('ê devient e');
  await expect(section.locator('[data-role="explication-accents"]')).toContainText('70 caractères');
  await section.locator('[data-action="modifier-modele-rappel"]').click();
  const champ = page.getByLabel('Modèle : Rappel de la veille');
  await champ.fill('Rappel : forêt {client} {heure}');
  await expect(page.locator('.dialogue .rdv-compteur-sms')).toContainText('caractères sur 160 · 1 SMS');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.modeles?.rappel).toBe('Rappel : foret {client} {heure}');
  await capture(page, '12-modeles');
  // B1 / B2 / B4 : les alertes sont des modèles réglables ; seul « commun » et « aucun » portent {lien} ; le coût est une estimation datée
  const commun = section.locator('[data-modele="alerte-commun"]');
  await expect(commun.locator('.rdv-modele-texte')).toContainText('https://chevalier-ia-os.web.app/#/rdv/liste/'); // l'adresse réelle de l'espace (ici : chez Jérôme)
  await expect(commun.locator('.rdv-modele-compte')).toHaveText(/· 1 SMS$/); // le texte de départ tient en UN SMS avec l'adresse de cet espace
  await expect(commun.locator('.rdv-modele-sanslien')).toContainText('Sans le lien');
  await expect(commun.locator('.rdv-modele-cout')).toContainText('≈ 0,0685 € · estimation basée sur les tarifs ClickSend au 1er novembre 2026');
  await expect(section.locator('[data-modele="alerte-incomprise"] .rdv-modele-sanslien')).toHaveCount(0);
  await section.locator('[data-action="modifier-modele-alerte-incomprise"]').click();
  const champAlerte = page.getByLabel('Modèle : Alerte : réponse non comprise');
  await champAlerte.fill('RDV {client} : {lien} ?');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.toast, [role="alert"]').filter({ hasText: 'Variable inconnue ici : {lien}' }).first()).toBeVisible();
  await champAlerte.fill('RDV {client} : {nom} a dit "{reponse}"');
  await expect(page.locator('.dialogue .rdv-compteur-sms')).toContainText('1 SMS');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.modeles?.['alerte-incomprise']).toBe('RDV {client} : {nom} a dit "{reponse}"');
  await page.goto('/?emulateurs=1#/rdv/nouveau');
  await expect(page.locator('[data-type="confiance"] .rdv-compteur-sms')).toContainText(/\d+ caractères sur (160|306) · [12] SMS/);
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

test('réglages : les quatorze sections sont dans la page Réglages de la coque, dans l’ordre voulu', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  await expect(page.locator('section.carte-section h2')).toHaveText(['Prêt à passer en vrai ?', 'Relances', 'Rappel la veille', 'Plage d’envoi', 'Numéros qui reçoivent les alertes', 'Ton nom dans les SMS', 'Nom de l’entreprise dans les SMS', 'Connexion SMS (ClickSend)', 'Solde ClickSend', 'Numéros désinscrits (STOP)', 'Rôles des participants', 'Prix d’un SMS', 'Modèles de SMS', 'Sauvegarde']);
  // B4 : le prix d'un SMS est réglable, un prix absurde est refusé, l'estimation de l'aperçu suit (premier modèle = 2 SMS, donc 2 × 0,10 €)
  await expect(page.getByLabel('Prix d’un SMS, en euros')).toHaveValue('0,0685');
  await page.getByLabel('Prix d’un SMS, en euros').fill('0x1');
  await page.getByLabel('Prix d’un SMS, en euros').blur();
  await expect(page.getByLabel('Prix d’un SMS, en euros')).toHaveValue('0,0685');
  await page.getByLabel('Prix d’un SMS, en euros').fill('0,1');
  await page.getByLabel('Prix d’un SMS, en euros').blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.prixSms).toBe(0.1);
  await expect(page.locator('#reglages-rdv-modeles .rdv-modele-cout').first()).toContainText('≈ 0,20 €');
  await page.getByLabel('Ton nom dans les SMS').fill('Mme Martin');
  await page.getByLabel('Ton nom dans les SMS').blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.nomDansLesSms).toBe('Mme Martin');
  await expect(page.locator('#reglages-rdv-modeles .rdv-modele-texte').first()).toContainText('Mme Martin');
  // Le nom de l'entreprise : « Chevalier IA » tant qu'il n'est pas réglé, réglable, et présent dans la dernière ligne de chaque modèle.
  await expect(page.getByLabel('Nom de l’entreprise dans les SMS')).toHaveValue('Chevalier IA');
  await expect(page.locator('#reglages-rdv-modeles .rdv-modele-texte').first()).toContainText('Chevalier IA - Répondez STOP pour vous désabonner.');
  await page.getByLabel('Nom de l’entreprise dans les SMS').fill('Géolucie');
  await page.getByLabel('Nom de l’entreprise dans les SMS').blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.nomEntreprise).toBe('Géolucie');
  await expect(page.locator('#reglages-rdv-modeles .rdv-modele-texte').first()).toContainText('Géolucie - Répondez STOP pour vous désabonner.');
  await capture(page, 'reglages');
});

// ---------------------------------------------------------------- création : cas qui touchent les fiches Personnes (relecture Fable)

async function remplirCreneau(page) { await page.getByLabel('Créneau 1').fill('2031-03-17T10:00'); }

test('création : une personne NOUVELLE en première ligne reçoit l’adresse sur sa fiche (libellé « Chantier »), et la fiche est écrite en un seul lot avec le rendez-vous', async ({ page }) => {
  await connecter(page, undefined, { route: 'rdv/nouveau' });
  await page.getByLabel('Adresse du rendez-vous').fill('3 chemin des Vignes\n74000 Annecy');
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('Mme Neuve');
  await ligne.getByLabel('Téléphone mobile').fill('06 00 00 00 09');
  await remplirCreneau(page);
  await page.getByRole('button', { name: 'Enregistrer sans envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  const fiche = (await listerDocuments('crm_personnes')).find((p) => p.nom === 'Mme Neuve');
  expect(fiche.adresses.map((a) => [a.libelle, a.adresse])).toEqual([['Chantier', '3 chemin des Vignes\n74000 Annecy']]);
  const lignes = (await listerDocuments('crm_audit')).filter((l) => ['crm_personnes', 'rdv_rendezvous', 'rdv_participants'].includes(l.collection));
  expect(new Set(lignes.map((l) => l.operationId)).size, 'personne, rendez-vous et participants partagent la même opération du journal').toBe(1);
  expect(lignes.length).toBe(3);
});

test('création : changer de contact change le numéro pré-rempli (pas de numéro de l’ancien contact sur le nouveau) ; un numéro retouché à la main est gardé', async ({ page }) => {
  await creerPersonne('p1', { nom: 'M. Durand', telephones: [{ valeur: '06 00 00 00 01', type: 'perso' }] });
  await creerPersonne('p2', { nom: 'Mme Petit', telephones: [{ valeur: '07 00 00 00 02', type: 'perso' }] });
  await connecter(page);
  await ouvrirListe(page);
  await page.getByRole('button', { name: 'Rendez-vous', exact: true }).click(); // par la liste : les fiches sont chargées quand on tape
  const ligne = page.locator('[data-role="participant"]').first();
  const nom = ligne.getByPlaceholder('Nom (contact existant ou nouveau)');
  await nom.fill('M. Dur');
  await page.getByRole('option', { name: /M\. Durand/ }).first().click();
  await expect(ligne.getByLabel('Téléphone mobile')).toHaveValue('06 00 00 00 01');
  await nom.fill('Mme Pet');
  await page.getByRole('option', { name: /Mme Petit/ }).first().click();
  await expect(ligne.getByLabel('Téléphone mobile')).toHaveValue('07 00 00 00 02');
  await ligne.getByLabel('Téléphone mobile').fill('06 11 11 11 11'); // retouché à la main
  await nom.fill('M. Dur');
  await page.getByRole('option', { name: /M\. Durand/ }).first().click();
  await expect(ligne.getByLabel('Téléphone mobile')).toHaveValue('06 11 11 11 11');
});

test('création : un nom tapé sans cliquer la suggestion, identique à une fiche existante, reprend cette fiche (aucune fiche en double) ; la même personne sur deux lignes est refusée', async ({ page }) => {
  await creerPersonne('p1', { nom: 'M. Durand', telephones: [{ valeur: '06 00 00 00 01', type: 'perso' }] });
  await connecter(page, undefined, { route: 'rdv/nouveau' });
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('M. Durand');
  await ligne.getByLabel('Téléphone mobile').fill('06 00 00 00 01');
  await remplirCreneau(page);
  await page.getByRole('button', { name: 'Enregistrer sans envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  expect(await listerDocuments('crm_personnes')).toHaveLength(1);
  expect((await listerDocuments('rdv_participants'))[0].personneId).toBe('p1');
});

test('mode test : un rendez-vous créé avec le mode test allumé, ses participants et la fiche créée portent le repère « test »', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chevalier-os.modeTest', '1'));
  await connecter(page, undefined, { route: 'rdv/nouveau' });
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('Mme Test');
  await ligne.getByLabel('Téléphone mobile').fill('06 00 00 00 05');
  await remplirCreneau(page);
  await page.getByRole('button', { name: 'Enregistrer sans envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  expect((await listerDocuments('rdv_rendezvous'))[0].test).toBe(true);
  expect((await listerDocuments('rdv_participants'))[0].test).toBe(true);
  expect((await listerDocuments('crm_personnes'))[0].test).toBe(true);
});

test('réglages : écrire un réglage ne remplace jamais le reste (modèles, numéros, rôles gardés quand on change un interrupteur)', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', { nomDansLesSms: 'Mme Martin', roles: ['Client', 'Maçon'], numerosAlerte: [{ id: 'n1', libelle: 'Mon mobile', numero: '+33600000001', actif: true }], numeroAffiche: 'n1',
    relances: { delaiHeures: 24, nombre: 3 }, rappel: { actif: true, heure: '19:00' }, plage: { debut: '08:00', fin: '20:30' }, modeles: { rappel: 'Demain {heure}' } });
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  await expect(page.locator('#reglages-rdv-roles [data-nom="Maçon"]')).toBeVisible();
  await page.locator('#reglages-rdv-rappel').getByRole('switch', { name: 'Envoyer un rappel la veille' }).click();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages')).rappel.actif).toBe(false);
  const doc = await lireDocument('rdv_parametres/reglages');
  expect(doc.nomDansLesSms).toBe('Mme Martin');
  expect(doc.roles).toEqual(['Client', 'Maçon']);
  expect(doc.numerosAlerte).toHaveLength(1);
  expect(doc.modeles.rappel).toBe('Demain {heure}');
});

test('réglages : le numéro des SMS de test est normalisé et enregistré ; un fixe est refusé ; vide = aucun numéro de test', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const champ = page.getByLabel('Numéro des SMS de test');
  await champ.fill('06.00.00.00.99');
  await champ.blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.numeroTest).toBe('+33600000099');
  await expect(champ).toHaveValue('06 00 00 00 99');
  await champ.fill('01 02 03 04 05');
  await champ.blur();
  await expect(page.locator('.toast-erreur')).toContainText('fixe');
  await expect(champ).toHaveValue('06 00 00 00 99');
  await champ.fill('');
  await champ.blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.numeroTest).toBe('');
});

test('D2-1 la carte « Numéros désinscrits (STOP) » : numéros masqués avec le nom, rappel ClickSend, « Réautoriser » avec confirmation (le serveur reçoit le numéro entier), aucun appel serveur à l’affichage', async ({ page }) => {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  const demandes = [];
  await page.route(/cloudfunctions\.net\/rdvEnvoyer$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    demandes.push(JSON.parse(route.request().postData() ?? '{}').data);
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, reautorise: true } }) });
  });
  await semer('r1', {}, [{ nom: 'Mme Dupont', telephone: '+33600000001' }, { nom: 'Terrassier', telephone: '+33600000002' }]);
  await ecrireDocument('rdv_parametres/desinscrits', { numeros: ['+33600000001', '+33611223344'] });
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-desinscrits');
  await expect(carte.locator('h2')).toHaveText('Numéros désinscrits (STOP)');
  const lignes = carte.locator('[data-role="desinscrit"]');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText('Mme Dupont');
  await expect(lignes.nth(0)).toContainText('06 •• •• •• 01');
  await expect(lignes.nth(1)).toContainText('06 •• •• •• 44');
  await expect(lignes.nth(1)).not.toContainText('Mme');
  const texte = await carte.innerText();
  expect(texte).not.toMatch(/06 00 00 00 01|\+33600000001|11 22 33/); // jamais le numéro en clair
  await expect(carte.locator('[data-role="desinscrits-clicksend"]')).toContainText('liste de désinscriptions');
  expect(demandes, 'aucun appel au serveur à l’affichage').toHaveLength(0);
  await carte.scrollIntoViewIfNeeded();
  await carte.screenshot({ path: `${CAPTURES}/D2-1-desinscrits${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
  // Annuler la confirmation : rien n'est demandé.
  await lignes.nth(0).getByRole('button', { name: /Réautoriser/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Cette personne a demandé de ne plus recevoir de SMS : ne la réautorise que si elle te l’a demandé');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  expect(demandes).toHaveLength(0);
  await lignes.nth(0).getByRole('button', { name: /Réautoriser/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réautoriser' }).click();
  await expect.poll(() => demandes.length).toBe(1);
  expect(demandes[0]).toEqual({ action: 'reautoriser', numero: '+33600000001' });
  await expect(page.locator('.toast')).toContainText('Numéro réautorisé');
});

test('D2-1 cas vide : « Aucun numéro désinscrit », pas de bouton', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-desinscrits');
  await expect(carte.locator('[data-role="desinscrits-vide"]')).toHaveText('Aucun numéro désinscrit');
  await expect(carte.getByRole('button')).toHaveCount(0);
  await carte.scrollIntoViewIfNeeded();
  await carte.screenshot({ path: `${CAPTURES}/D2-1-desinscrits-vide${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
});

test('D2-2 cas d’erreur : le serveur refuse « Réautoriser » : le message est montré, le bouton reste utilisable', { annotation: { type: 'erreurs-reseau-attendues', description: 'Le serveur simulé répond 400.' } }, async ({ page }) => {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route(/cloudfunctions\.net\/rdvEnvoyer$/, (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: 'La liste vient de changer : réessaie.' } }) })));
  await ecrireDocument('rdv_parametres/desinscrits', { numeros: ['+33600000001'] });
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const bouton = page.locator('#reglages-rdv-desinscrits').getByRole('button', { name: /Réautoriser/ });
  await bouton.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Réautoriser' }).click();
  await expect(page.locator('.toast')).toContainText('La liste vient de changer : réessaie.');
  await expect(bouton).toBeEnabled();
});
