// Écran Import du module Réseaux sociaux (11/11/2026), chez Jérôme (racine, règles du CRM). Un test par critère du cahier (G1 à G9), nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-import/ (« -telephone » sur téléphone). Données FICTIVES uniquement : l'archive est fabriquée par le test (tests/_archive-linkedin-fictive.js).
// La fonction de la boîte mail (reseauxsociauxBoite) est simulée dans le navigateur ; rien ne part vers LinkedIn ni vers aucun serveur réel.
import { test, expect, connecter, attendreCalme, listerDocuments, estTelephone, ecrireDocument, creerPersonne } from './outils.js';
import { archiveFictive, fabriquerZip, blob, messagesFictifs, csvMessages, PHRASE_TEMOIN } from '../_archive-linkedin-fictive.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-import';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google ; LinkedIn est remplacé par une page vide (sans réseau).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  await context.route('https://www.linkedin.com/**', (route) => route.fulfill({ status: 200, body: '<title>LinkedIn fictif</title>', headers: { 'Content-Type': 'text/html' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
/** Fonction `reseauxsociauxBoite` simulée : `reponse()` rend { resultat } (succès) ou { statut, code } (erreur du serveur). `recues` note les demandes. */
async function simulerBoite(page, reponse) {
  const recues = [];
  await page.route(/cloudfunctions\.net\/reseauxsociauxBoite$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    recues.push(JSON.parse(route.request().postData() ?? '{}').data);
    const r = reponse();
    if (r.statut) return route.fulfill({ status: r.statut, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: r.code, message: 'erreur simulée' } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: r.resultat }) });
  });
  return recues;
}
const attendre = (page) => page.evaluate(() => { location.hash = '#/reseauxsociaux/import'; });
const principal = (page) => page.locator('.page-actions .bouton-principal');
const zip = (octets, nom = 'export-linkedin.zip') => ({ name: nom, mimeType: 'application/zip', buffer: Buffer.from(octets) });
const octetsArchive = async (options) => Buffer.from(await archiveFictive(options).arrayBuffer());
const deposer = (page, fichier) => page.locator('[data-role="fichier"]').setInputFiles(fichier);
const compteur = (page, cle) => page.locator(`[data-compteur="${cle}"]`);
const erreurAttendue = (description) => test.info().annotations.push({ type: 'erreurs-reseau-attendues', description });
const sansDebordement = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal').toBe(true);

/** Prépare les fiches du CRM de Jérôme : Alice (existante, avec e-mail, téléphone et ville) et le document des étiquettes. */
async function preparerCrm() {
  await ecrireDocument('crm_parametres/etiquettes', { items: [{ id: 'partenaire', nom: 'Partenaire', couleur: '#3fbf7f', ordre: 1 }] });
  await creerPersonne('p-alice', { nom: 'Alice Exemple', emails: [{ valeur: 'alice@exemple.test', libelle: '' }], telephones: [{ valeur: '0100000000', libelle: '' }], ville: 'Ville Fictive', source: 'Recommandation', etiquettes: ['partenaire'] });
}

test('G1 cas vide : « Aucun import pour le moment. » et trois lignes d’explication ; un seul bouton jaune « Vérifier la boîte mail »', async ({ page }) => {
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await expect(page.getByRole('heading', { name: 'Import', level: 1 })).toBeVisible();
  await expect(page.locator('[data-carte="historique"]')).toContainText('Aucun import pour le moment.');
  await expect(page.locator('[data-role="explication"] li')).toHaveCount(3);
  await expect(page.locator('.bouton-principal')).toHaveCount(1);
  await expect(principal(page)).toHaveText('Vérifier la boîte mail');
  await expect(page.locator('[data-carte="parcours"]')).not.toContainText(/CRM/);
  await expect(page.getByText('Cet écran arrive bientôt.')).toHaveCount(0);
  await sansDebordement(page);
  await capture(page, 'G1-cas-vide');
});

test('G1 un zip fictif (2 conversations à deux voix, 1 à une voix, 1 de groupe, 1 relation sans conversation) : 2 activités linkedin, 1 personne rattachée, 1 créée « À classer » ; compte rendu exact', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ resultat: { trouve: true, lien: 'https://www.linkedin.com/psettings/member-data', recuLe: '2026-11-10T09:00:00.000Z' } }));
  await connecter(page);
  await attendre(page);
  await principal(page).click(); // « Vérifier la boîte mail »
  await expect(principal(page)).toHaveText('Ouvrir la page LinkedIn');
  const [onglet] = await Promise.all([page.context().waitForEvent('page'), principal(page).click()]);
  expect(onglet.url()).toContain('https://www.linkedin.com/psettings/member-data');
  await onglet.close();
  await expect(principal(page)).toHaveText('Choisir le fichier .zip');
  await deposer(page, zip(await octetsArchive()));
  await expect(page.locator('[data-carte="compte-rendu"]')).toBeVisible();
  const attendus = { activitesCreees: '2', personnesCreees: '1', personnesRattachees: '1', ignoreesUneVoix: '1', ignoreesGroupe: '1', ignoreesDejaVues: '0', ignoreesAmbigues: '0', ignoreesSansProfil: '0' };
  for (const [cle, n] of Object.entries(attendus)) await expect(compteur(page, cle).locator('dt')).toHaveText(n);
  await expect(page.locator('[data-carte="compte-rendu"]')).toContainText('Lu dans l’archive : 8 messages, 4 conversations, 2 relations.');
  const activites = (await listerDocuments('crm_activites')).filter((a) => a.type === 'linkedin');
  expect(activites).toHaveLength(2);
  for (const a of activites) expect([a.fait, a.voix]).toEqual([true, 2]);
  const personnes = await listerDocuments('crm_personnes');
  expect(personnes.map((p) => p.nom).sort()).toEqual(['Alice Exemple', 'Bruno Test']); // Denis (relation sans conversation) n'a PAS de fiche ; Carla (une voix) non plus
  const bruno = personnes.find((p) => p.nom === 'Bruno Test');
  expect(bruno.source).toBe('LinkedIn');
  expect(bruno.linkedin).toBe('https://www.linkedin.com/in/bruno-test');
  const etiquettes = await listerDocuments('crm_parametres');
  const etiquette = etiquettes.find((d) => d.id === 'etiquettes').items.find((e) => e.nom === 'À classer');
  expect(etiquette, 'l’étiquette « À classer » est créée au clic').toBeTruthy();
  expect(bruno.etiquettes).toEqual([etiquette.id]);
  expect(etiquettes.find((d) => d.id === 'etiquettes').items.some((e) => e.nom === 'Partenaire'), 'les étiquettes existantes sont conservées').toBe(true);
  const imports = await listerDocuments('reseauxsociaux_imports');
  expect(imports).toHaveLength(1);
  expect(imports[0]).toMatchObject({ statut: 'termine', fichier: 'export-linkedin.zip', lu: { connexions: 2, conversations: 4, messages: 8 } });
  expect(imports[0].empreinte).toMatch(/^[0-9a-f]{64}$/);
  expect(imports[0].resultat).toMatchObject({ personnesCreees: 1, personnesRattachees: 1, activitesCreees: 2, ignoreesUneVoix: 1, ignoreesGroupe: 1 });
  await expect(page.locator('[data-role="historique"] .rs-ligne')).toHaveCount(1);
  await expect(page.locator('[data-role="historique"]')).toContainText('export-linkedin.zip');
  await attendreCalme(page);
  await capture(page, 'G1-compte-rendu');
});

test('G2 aucune donnée existante n’est écrasée : e-mail, téléphone, ville, source et étiquettes d’Alice restent ; son champ LinkedIn vide est rempli', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await deposer(page, zip(await octetsArchive()));
  await expect(page.locator('[data-carte="compte-rendu"]')).toBeVisible();
  const alice = (await listerDocuments('crm_personnes')).find((p) => p.id === 'p-alice');
  expect(alice.emails).toEqual([{ valeur: 'alice@exemple.test', libelle: '' }]);
  expect(alice.telephones).toEqual([{ valeur: '0100000000', libelle: '' }]);
  expect([alice.nom, alice.ville, alice.source, alice.etiquettes, alice.organisationId]).toEqual(['Alice Exemple', 'Ville Fictive', 'Recommandation', ['partenaire'], null]);
  expect(alice.linkedin).toBe('https://www.linkedin.com/in/alice-exemple');
  // Le journal commun a gardé une ligne par écriture.
  expect((await listerDocuments('crm_audit')).length).toBeGreaterThan(5);
  await capture(page, 'G2-rien-ecrase');
});

test('G3 deux fiches du même nom : aucune écriture pour cet échange, « ignoré » dans le compte rendu', async ({ page }) => {
  await preparerCrm();
  await creerPersonne('p-alice-bis', { nom: 'Alice Exemple' });
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await deposer(page, zip(await octetsArchive({ messages: messagesFictifs().filter((m) => m.conv === 'conv-alice') })));
  await expect(compteur(page, 'ignoreesAmbigues').locator('dt')).toHaveText('1');
  await expect(compteur(page, 'activitesCreees').locator('dt')).toHaveText('0');
  expect((await listerDocuments('crm_activites')).filter((a) => a.type === 'linkedin')).toHaveLength(0);
  const personnes = await listerDocuments('crm_personnes');
  expect(personnes.find((p) => p.id === 'p-alice').linkedin).toBe('');
  expect(personnes.find((p) => p.id === 'p-alice-bis').linkedin).toBe('');
  await capture(page, 'G3-ambigu');
});

test('G4 les titres d’activité font 200 caractères au plus, sans nom ; aucune phrase des messages n’est écrite nulle part', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await deposer(page, zip(await octetsArchive()));
  await expect(page.locator('[data-carte="compte-rendu"]')).toBeVisible();
  const activites = (await listerDocuments('crm_activites')).filter((a) => a.type === 'linkedin');
  for (const a of activites) { expect(a.titre.length).toBeLessThanOrEqual(200); expect(a.titre).toMatch(/^Échange LinkedIn : \d+ messages?, le dernier (envoyé|reçu) le \d{2}\/\d{2}\/\d{4}\.$/); }
  const tout = JSON.stringify(await Promise.all(['crm_personnes', 'crm_activites', 'crm_evenements', 'crm_audit', 'crm_audit_avant', 'reseauxsociaux_imports', 'crm_parametres'].map(listerDocuments)));
  expect(tout).not.toContain(PHRASE_TEMOIN);
  expect(tout).not.toContain('Olivia');
  await capture(page, 'G4-titres');
});

test('G5 relancer le même fichier : refus avec la date, aucune écriture ; un zip plus récent aux mêmes conversations ne crée aucune activité en double', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  const octets = await octetsArchive();
  await deposer(page, zip(octets));
  await expect(page.locator('[data-carte="compte-rendu"]')).toBeVisible();
  const avant = JSON.stringify(await Promise.all(['crm_personnes', 'crm_activites', 'reseauxsociaux_imports'].map(listerDocuments)));
  await deposer(page, zip(octets, 'meme-fichier.zip'));
  await expect(page.locator('[data-role="erreur-import"]')).toContainText(/Cette archive a déjà été importée le \d{2}\/\d{2}\/\d{4}\./);
  expect(JSON.stringify(await Promise.all(['crm_personnes', 'crm_activites', 'reseauxsociaux_imports'].map(listerDocuments)))).toBe(avant);
  await capture(page, 'G5-deja-importe');
  // Archive plus récente (contenu un peu différent : une relation de plus), mêmes conversations : tout est « déjà vu ».
  const plus = fabriquerZip([
    { nom: 'messages.csv', contenu: csvMessages(messagesFictifs()) },
    { nom: 'Connections.csv', contenu: 'First Name,Last Name,URL\nZoé,Exemple,https://www.linkedin.com/in/zoe-exemple\n' },
    { nom: 'Profile.csv', contenu: 'First Name,Last Name\nOlivia,Exemple\n' },
  ]);
  await deposer(page, zip(plus, 'plus-recente.zip'));
  await expect(compteur(page, 'ignoreesDejaVues').locator('dt')).toHaveText('2');
  await expect(compteur(page, 'activitesCreees').locator('dt')).toHaveText('0');
  expect((await listerDocuments('crm_activites')).filter((a) => a.type === 'linkedin')).toHaveLength(2);
  expect((await listerDocuments('crm_personnes')).filter((p) => p.nom === 'Bruno Test')).toHaveLength(1);
  expect(await listerDocuments('reseauxsociaux_imports')).toHaveLength(2);
  await capture(page, 'G5-archive-plus-recente');
});

test('G6 archive invalide : message lisible, aucune écriture ; « echec » seulement quand le fichier a été lu jusqu’au bout', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  const donneesAvant = async () => JSON.stringify(await Promise.all(['crm_personnes', 'crm_activites', 'crm_audit'].map(listerDocuments)));
  const avant = await donneesAvant();
  const erreur = page.locator('[data-role="erreur-import"]');
  // Pas un zip (un texte renommé), fichier tronqué, mauvais type de fichier : rien n'est écrit, pas même une trace.
  await deposer(page, zip(Buffer.from('Ceci est un simple texte, pas une archive .zip du tout, loin de là.'), 'faux.zip'));
  await expect(erreur).toContainText('Ce fichier n’est pas une archive .zip lisible.');
  await capture(page, 'G6-pas-un-zip');
  const complet = await octetsArchive();
  await deposer(page, zip(complet.subarray(0, complet.length - 30), 'tronque.zip'));
  await expect(erreur).toContainText(/incomplète|pas une archive/);
  await deposer(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('texte') });
  await expect(erreur).toContainText('Choisis un fichier .zip');
  expect(await listerDocuments('reseauxsociaux_imports')).toHaveLength(0);
  expect(await donneesAvant()).toBe(avant);
  // Zip lu jusqu'au bout mais sans messages.csv : message lisible, aucune donnée du CRM écrite, mais une trace « echec ».
  await deposer(page, zip(fabriquerZip([{ nom: 'Connections.csv', contenu: 'First Name,Last Name,URL\nA,B,https://www.linkedin.com/in/a-b\n' }]), 'sans-messages.zip'));
  await expect(erreur).toContainText('Je n’ai pas trouvé tes messages dans l’archive');
  const imports = await listerDocuments('reseauxsociaux_imports');
  expect(imports).toHaveLength(1);
  expect(imports[0]).toMatchObject({ statut: 'echec', fichier: 'sans-messages.zip' });
  expect(imports[0].erreur).toContain('messages');
  expect(await donneesAvant()).not.toBe(avant); // seule la trace du journal (ligne d'audit du document d'import) a été ajoutée…
  expect((await listerDocuments('crm_personnes')).length).toBe(1); // …jamais une fiche
  expect((await listerDocuments('crm_activites')).filter((a) => a.type === 'linkedin')).toHaveLength(0);
  await expect(page.locator('[data-role="historique"] [data-statut="echec"]')).toHaveCount(1);
  await capture(page, 'G6-echec-consigne');
});

test('G6 profil non reconnu : « Je n’ai pas reconnu ton profil dans l’archive. », trace « echec », aucune fiche', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await deposer(page, zip(fabriquerZip([{ nom: 'messages.csv', contenu: csvMessages(messagesFictifs()) }, { nom: 'Profile.csv', contenu: 'First Name,Last Name\nQuelqu’un,Dautre\n' }]), 'autre-profil.zip'));
  await expect(page.locator('[data-role="erreur-import"]')).toHaveText('Je n’ai pas reconnu ton profil dans l’archive.');
  expect((await listerDocuments('reseauxsociaux_imports')).map((i) => i.statut)).toEqual(['echec']);
  expect((await listerDocuments('crm_activites')).filter((a) => a.type === 'linkedin')).toHaveLength(0);
});

test('G6 un échec consigné n’empêche jamais de relancer : le même travail repris avec la bonne archive se termine', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await deposer(page, zip(fabriquerZip([{ nom: 'messages.csv', contenu: csvMessages(messagesFictifs()) }, { nom: 'Profile.csv', contenu: 'First Name,Last Name\nQuelqu’un,Dautre\n' }]), 'premier.zip'));
  await expect(page.locator('[data-role="erreur-import"]')).toBeVisible();
  await deposer(page, zip(await octetsArchive(), 'reprise.zip'));
  await expect(page.locator('[data-carte="compte-rendu"]')).toBeVisible();
  expect((await listerDocuments('reseauxsociaux_imports')).map((i) => i.statut).sort()).toEqual(['echec', 'termine']);
  await expect(page.locator('[data-role="historique"] .rs-ligne')).toHaveCount(2);
});

test('G8 le parcours : bouton jaune « Vérifier la boîte mail » d’abord ; fonction absente (non trouvée ET erreur interne) : phrase grise et choix du fichier toujours possible', async ({ page }) => {
  erreurAttendue('fonction absente simulée (404 puis 500)');
  let code = 0;
  await simulerBoite(page, () => (code++ === 0 ? { statut: 404, code: 'NOT_FOUND' } : { statut: 500, code: 'INTERNAL' }));
  await connecter(page);
  await attendre(page);
  await expect(page.locator('.bouton-principal')).toHaveCount(1);
  await expect(principal(page)).toHaveText('Vérifier la boîte mail');
  await principal(page).click();
  const phrase = page.locator('[data-role="etat-boite"]');
  await expect(phrase).toHaveText('La vérification de la boîte mail n’est pas encore branchée. Dépose l’archive à la main.');
  await expect(phrase).toHaveClass(/aide/); // phrase grise, jamais une alerte rouge
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(principal(page)).toHaveText('Choisir le fichier .zip'); // le parcours continue
  await expect(page.locator('[data-role="fichier"]')).toBeAttached();
  await capture(page, 'G8-fonction-absente');
  // Même phrase pour une erreur interne du serveur (le code `not-found` n'est pas un contrat sûr).
  await page.reload();
  await principal(page).click();
  await expect(phrase).toHaveText('La vérification de la boîte mail n’est pas encore branchée. Dépose l’archive à la main.');
  await expect(page.locator('.bouton-principal')).toHaveCount(1);
});

test('G8 archive prête : le jaune passe à « Ouvrir la page LinkedIn » (nouvel onglet, sans référent) puis « Choisir le fichier .zip » ; aucun mail : on peut revérifier', async ({ page }) => {
  let reponse = { resultat: { trouve: false, lien: null, recuLe: null } };
  const recues = await simulerBoite(page, () => reponse);
  await connecter(page);
  await attendre(page);
  await principal(page).click();
  await expect(page.locator('[data-role="etat-boite"]')).toContainText('n’est pas encore arrivé');
  await expect(principal(page)).toHaveText('Vérifier la boîte mail');
  reponse = { resultat: { trouve: true, lien: 'https://www.linkedin.com/psettings/member-data', recuLe: '2026-11-10T09:00:00.000Z' } };
  await principal(page).click();
  await expect(page.locator('[data-role="etat-boite"]')).toContainText('Le mail de LinkedIn est arrivé le 10/11/2026.');
  const ouvrir = page.locator('a[data-action="ouvrir-linkedin"]');
  await expect(ouvrir).toHaveText('Ouvrir la page LinkedIn');
  await expect(ouvrir).toHaveAttribute('href', 'https://www.linkedin.com/psettings/member-data');
  await expect(ouvrir).toHaveAttribute('target', '_blank');
  await expect(ouvrir).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('.bouton-principal')).toHaveCount(1);
  expect(recues.every((r) => Object.keys(r ?? {}).length === 0)).toBe(true); // aucune donnée envoyée à la fonction
  await capture(page, 'G8-archive-prete');
});

test('G8 un lien qui n’est pas en https sur linkedin.com n’est jamais rendu en lien', async ({ page }) => {
  let lien = '';
  await simulerBoite(page, () => ({ resultat: { trouve: true, lien, recuLe: null } }));
  await connecter(page);
  for (const mauvais of ['http://www.linkedin.com/psettings', 'https://linkedin.com.exemple.test/x', 'https://exemple.test/linkedin.com', 'javascript:alert(1)']) {
    lien = mauvais;
    await page.reload();
    await attendre(page);
    await principal(page).click();
    await expect(page.locator('[data-role="etat-boite"]')).toContainText('son lien n’est pas sûr');
    await expect(page.locator('a[data-action="ouvrir-linkedin"]')).toHaveCount(0);
    await expect(page.locator('.page a[href*="exemple.test"], .page a[href^="javascript:"], .page a[href^="http://www.linkedin.com"]')).toHaveCount(0);
    await expect(principal(page)).toHaveText('Choisir le fichier .zip');
  }
  await capture(page, 'G8-lien-refuse');
});

test('G9 le choix du fichier et le compte rendu tiennent sans débordement (téléphone compris) ; glisser-déposer accepté', async ({ page }) => {
  await preparerCrm();
  await simulerBoite(page, () => ({ statut: 404, code: 'NOT_FOUND' })); erreurAttendue('fonction absente simulée');
  await connecter(page);
  await attendre(page);
  await sansDebordement(page);
  await expect(page.locator('[data-action="choisir-fichier-secondaire"]')).toBeVisible();
  await capture(page, 'G9-choix-du-fichier');
  // Glisser-déposer : l'événement « drop » porte le fichier.
  const octets = await octetsArchive();
  const donnees = await page.evaluateHandle(([b64]) => {
    const t = new DataTransfer();
    t.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'depose.zip', { type: 'application/zip' }));
    return t;
  }, [octets.toString('base64')]);
  await page.locator('[data-role="depot"]').dispatchEvent('drop', { dataTransfer: donnees });
  await expect(page.locator('[data-carte="compte-rendu"]')).toBeVisible();
  await expect(compteur(page, 'activitesCreees').locator('dt')).toHaveText('2');
  await attendreCalme(page);
  await sansDebordement(page);
  await capture(page, 'G9-compte-rendu');
});
