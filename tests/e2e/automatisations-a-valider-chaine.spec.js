// Écran « À valider », partie « Logger » : la zone « En préparation » et la chaîne d'étapes qui s'allument en direct, dans le navigateur, sur les émulateurs.
// Un test par critère (nom commençant par le numéro : 7 à 14, ceux du brief du Logger) ; une capture par critère dans tests/e2e/captures/a-valider-chaine/.
// La fonction appelable `automatisationsDecider` est SIMULÉE comme dans automatisations-a-valider.spec.js : le faux serveur applique la VRAIE logique (propositions.js :
// abandonner, seulement si estBloquee est vrai, comme le vrai serveur) puis écrit le résultat dans l'émulateur Firestore. L'écran voit tout arriver par l'écoute en direct.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, lireDocument, estTelephone, JEROME, PROJET, FIRESTORE } from './outils.js';

const P = await import(`data:text/javascript;base64,${(await readFile(fileURLToPath(new URL('../../js/modules/automatisations/propositions.js', import.meta.url)))).toString('base64')}`);

const MIN = 60000;
const JOUR = 24 * 60 * MIN;
const il_y_a = (ms) => new Date(Date.now() - ms);
const CAPTURES = 'e2e/captures/a-valider-chaine';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };

test.beforeEach(async () => {
  const contenu = await readFile(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées : ${await r.text()}`);
});

const PLAN = [
  { cle: 'a-lire', libelle: 'Lire l’e-mail' }, { cle: 'a-chercher', libelle: 'Chercher la personne' }, { cle: 'a-rediger', libelle: 'Rédiger la fiche' }, { cle: 'a-deposer', libelle: 'Déposer la proposition' },
];
const etapes = (...etats) => PLAN.map((e, i) => ({ ...e, etat: etats[i] || 'a_venir', ...(etats[i] && etats[i] !== 'a_venir' ? { le: il_y_a((5 - i) * 1000) } : {}) }));
const enPreparation = (extra = {}) => ({
  type: 'Nouveau contact', titre: 'Contact reçu par e-mail', resume: '', champsProposes: [], champsValides: null, lien: null, etat: 'en_preparation',
  creeLe: il_y_a(MIN), expireLe: null, valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null, tentatives: 0, derniereErreur: null,
  executions: { proposer: '1201', appliquer: null, refuser: null }, etapes: etapes(), source: 'porte', ...extra,
});

let appels;
async function brancherDecider(page) {
  appels = [];
  await page.route('**/automatisationsDecider', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData()).data;
    appels.push(d);
    const erreur = (message) => route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: { message, status: 'FAILED_PRECONDITION' } }) });
    const chemin = `automatisations_propositions/${d.id}`;
    const doc = await lireDocument(chemin);
    if (!doc) return erreur('Proposition inconnue.');
    if (d.decision !== 'abandonner') return erreur('Décision inattendue dans ce test.');
    if (!P.estBloquee(doc, Date.now())) return erreur('Ce traitement tourne encore : il ne peut pas être classé sans suite.');
    const r = P.abandonner(doc, { erreur: 'Abandonné à l’écran : le workflow n’a pas répondu.', par: JEROME, canal: 'interface', maintenant: new Date() });
    if (!r.ok) return erreur(r.message);
    await ecrireDocument(chemin, r.proposition);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, etat: r.proposition.etat } }) });
  });
}
async function ouvrir(page) {
  await connecter(page, JEROME);
  await page.evaluate(() => { location.hash = '#/automatisations/a-valider'; });
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
}
const carte = (page, id) => page.locator(`.prop-carte[data-id="${id}"]`);
const noeud = (page, id, cle) => carte(page, id).locator(`.etape-noeud[data-cle="${cle}"]`);
const zonePrep = (page) => page.locator('[data-zone="en-preparation"]');
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('7 une ligne en préparation montre sa chaîne d’étapes, sans aucun bouton, et les étapes s’ajoutent sans recharger', async ({ page }) => {
  await brancherDecider(page);
  await ouvrir(page);
  await expect(zonePrep(page)).toBeHidden(); // cas vide : pas de zone, pas de message de zone vide
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: [] }));
  await expect(zonePrep(page)).toBeVisible();
  await expect(zonePrep(page).locator('h2')).toHaveText('En préparation');
  await expect(carte(page, 'p1').locator('[data-aucune="etape"]')).toHaveText('Aucune étape annoncée pour l’instant.');
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: etapes('fait', 'en_cours') }));
  await expect(carte(page, 'p1').locator('.etape-noeud')).toHaveCount(4);
  await expect(carte(page, 'p1').locator('button')).toHaveCount(0);
  await expect(carte(page, 'p1').locator('.autom-pastille')).toHaveText('En préparation');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capture(page, '7-en-preparation');
});

test('8 quand le workflow finalise, la ligne passe de « En préparation » à « À valider » avec ses boutons et garde ses étapes', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: etapes('fait', 'fait', 'en_cours') }));
  await ouvrir(page);
  await expect(zonePrep(page).locator('.prop-carte[data-id="p1"]')).toBeVisible();
  await ecrireDocument('automatisations_propositions/p1', enPreparation({
    etat: 'a_valider', resume: 'Une personne demande un rendez-vous.', champsProposes: [{ nom: 'Prénom', valeur: 'Alex' }], expireLe: new Date(Date.now() + 30 * JOUR), etapes: etapes('fait', 'fait', 'fait', 'fait'),
  }));
  await expect(page.locator('[data-zone="a-valider"] .prop-carte[data-id="p1"]')).toBeVisible();
  await expect(zonePrep(page)).toBeHidden();
  await expect(carte(page, 'p1').getByRole('button', { name: 'Valider', exact: true })).toBeVisible();
  await expect(carte(page, 'p1').locator('.prop-etapes > summary')).toHaveText('Étapes (4)');
  await carte(page, 'p1').locator('.prop-etapes > summary').click();
  await expect(carte(page, 'p1').locator('.etape-noeud[data-etat="fait"]')).toHaveCount(4);
  await capture(page, '8-finalisee');
});

test('9 une ligne en préparation depuis plus de 15 minutes montre « Bloqué… » et un bouton gris « Classer sans suite » qui la ferme', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/b1', enPreparation({ creeLe: il_y_a(20 * MIN), etapes: [{ cle: 'a-lire', libelle: 'Lire l’e-mail', etat: 'en_cours', le: il_y_a(18 * MIN) }, ...PLAN.slice(1).map((e) => ({ ...e, etat: 'a_venir' }))] }));
  await ecrireDocument('automatisations_propositions/f1', enPreparation({ titre: 'Encore en route', creeLe: il_y_a(2 * MIN) }));
  await ouvrir(page);
  await expect(carte(page, 'b1').locator('[data-alerte="bloquee"]')).toHaveText('Bloqué depuis plus de 15 minutes : le workflow n’a pas répondu.');
  await expect(carte(page, 'b1').locator('[data-indication="classer"]')).toHaveText('Ne l’arrête pas dans n8n : ferme seulement cette ligne.');
  const bouton = carte(page, 'b1').getByRole('button', { name: 'Classer sans suite' });
  await expect(bouton).toBeVisible();
  await expect(bouton).not.toHaveClass(/bouton-principal/);
  // Une ligne qui tourne encore n'a ni bandeau ni bouton.
  await expect(carte(page, 'f1').locator('[data-alerte], button')).toHaveCount(0);
  await expect(page.locator('.bouton-principal')).toHaveCount(0);
  await capture(page, '9-bloquee');
  await bouton.click();
  await expect(page.locator('[data-zone="recentes"] .prop-carte[data-id="b1"]')).toBeVisible();
  await expect(carte(page, 'b1').locator('.autom-pastille')).toHaveText('Abandonnée');
  expect(appels).toEqual([{ id: 'b1', decision: 'abandonner' }]);
  const doc = await lireDocument('automatisations_propositions/b1');
  expect(doc.etat).toBe('abandonnee');
  expect(doc.abandonneePar).toBe(JEROME);
});

test('10 une ligne abandonnée apparaît dans « Traitements récents » avec la frise « Abandonné », la dernière erreur et ses étapes en échec ou ignorées', async ({ page }) => {
  await brancherDecider(page);
  const r = P.abandonner(enPreparation({ etapes: etapes('fait', 'en_cours') }), { erreur: 'Le service de lecture ne répond pas', maintenant: new Date() });
  await ecrireDocument('automatisations_propositions/x1', r.proposition);
  await ouvrir(page);
  const c = page.locator('[data-zone="recentes"] .prop-carte[data-id="x1"]');
  await expect(c).toBeVisible();
  await expect(c.locator('.autom-erreur')).toContainText('Le service de lecture ne répond pas');
  await expect(c.locator('.prop-frise [data-cle="propose"]')).toHaveAttribute('data-etat', 'echec');
  await expect(c.locator('.etape-noeud[data-cle="a-chercher"]')).toHaveAttribute('data-etat', 'echec');
  await expect(c.locator('.etape-noeud[data-cle="a-rediger"]')).toHaveAttribute('data-etat', 'ignoree');
  await expect(c.locator('.prop-etapes')).toHaveAttribute('open', ''); // une étape a échoué : la chaîne est ouverte
  await expect(c.locator('button')).toHaveCount(0);
  await expect(zonePrep(page)).toBeHidden();
  await capture(page, '10-abandonnee');
});

test('11 un libellé d’étape piégé est affiché tel quel et rien n’est exécuté', async ({ page }) => {
  await brancherDecider(page);
  const piege = '<img src=x onerror="window.__pirate=1">';
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: [{ cle: 'a-lire', libelle: piege, etat: 'en_cours', le: il_y_a(1000) }, { cle: 'a-suite', libelle: '<b>gras</b>', etat: 'a_venir' }] }));
  await ouvrir(page);
  await expect(noeud(page, 'p1', 'a-lire').locator('.etape-libelle')).toHaveText(piege);
  await expect(noeud(page, 'p1', 'a-suite').locator('.etape-libelle')).toHaveText('<b>gras</b>');
  await expect(carte(page, 'p1').locator('.etape-chaine img, .etape-chaine b')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pirate)).toBeUndefined();
  await capture(page, '11-libelle-piege');
});

test('12 sur téléphone (390 px) la chaîne de 8 étapes aux libellés de 60 caractères tient sans défilement horizontal', async ({ page }) => {
  await brancherDecider(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const long = (i) => `Étape ${i} ${'très longue '.repeat(8)}`.slice(0, 60);
  const huit = Array.from({ length: 8 }, (_, i) => ({ cle: `a-${i}`, libelle: long(i), etat: ['fait', 'fait', 'en_cours', 'a_venir', 'a_venir', 'a_venir', 'a_venir', 'a_venir'][i], ...(i < 3 ? { le: il_y_a(1000) } : {}) }));
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: huit, titre: 'Un titre assez long pour vérifier que la carte ne déborde jamais de l’écran' }));
  await ouvrir(page);
  await expect(carte(page, 'p1').locator('.etape-noeud')).toHaveCount(8);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  const sens = await carte(page, 'p1').locator('.etape-chaine').evaluate((el) => getComputedStyle(el).flexDirection);
  expect(sens).toBe('column');
  await page.screenshot({ path: `${CAPTURES}/12-telephone-390.png`, animations: 'disabled' });
});

test('13 la chaîne entière est grise, puis un nœud devient jaune, puis vert, sans recharger', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: etapes() }));
  await ouvrir(page);
  await expect(carte(page, 'p1').locator('.etape-noeud[data-etat="a_venir"]')).toHaveCount(4);
  const couleur = (n) => n.locator('.etape-point').evaluate((el) => getComputedStyle(el).borderTopColor);
  const grise = await couleur(noeud(page, 'p1', 'a-lire'));
  await capture(page, '13-1-tout-gris');
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: etapes('en_cours') }));
  await expect(noeud(page, 'p1', 'a-lire')).toHaveAttribute('data-etat', 'en_cours');
  await expect(noeud(page, 'p1', 'a-lire')).toHaveAttribute('aria-current', 'step');
  await expect(carte(page, 'p1').locator('.etape-noeud[data-etat="a_venir"]')).toHaveCount(3);
  const jaune = await couleur(noeud(page, 'p1', 'a-lire'));
  await capture(page, '13-2-un-noeud-jaune');
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: etapes('fait', 'en_cours') }));
  await expect(noeud(page, 'p1', 'a-lire')).toHaveAttribute('data-etat', 'fait');
  await expect(noeud(page, 'p1', 'a-lire')).not.toHaveAttribute('aria-current', /.*/);
  const vert = await couleur(noeud(page, 'p1', 'a-lire'));
  expect(new Set([grise, jaune, vert]).size).toBe(3); // trois couleurs différentes
  await capture(page, '13-3-premier-noeud-vert');
});

test('14 l’attribut data-etat de chaque nœud reflète l’état, et chaque nœud porte un texte d’état caché', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', enPreparation({ etapes: [
    { cle: 'e1', libelle: 'Un', etat: 'fait', le: il_y_a(4000) }, { cle: 'e2', libelle: 'Deux', etat: 'echec', le: il_y_a(3000) }, { cle: 'e3', libelle: 'Trois', etat: 'ignoree', le: il_y_a(2000) },
    { cle: 'e4', libelle: 'Quatre', etat: 'en_cours', le: il_y_a(1000) }, { cle: 'e5', libelle: 'Cinq', etat: 'a_venir' }] }));
  await ouvrir(page);
  const attendu = { e1: ['fait', 'fait'], e2: ['echec', 'en échec'], e3: ['ignoree', 'ignorée'], e4: ['en_cours', 'en cours'], e5: ['a_venir', 'à venir'] };
  for (const [cle, [etat, mot]] of Object.entries(attendu)) {
    await expect(noeud(page, 'p1', cle)).toHaveAttribute('data-etat', etat);
    await expect(noeud(page, 'p1', cle).locator('.sr-only')).toContainText(mot);
  }
  await expect(carte(page, 'p1').locator('.etape-chaine')).toHaveAttribute('aria-label', 'Étapes du traitement');
  await expect(noeud(page, 'p1', 'e1')).toHaveAttribute('title', /^fait · \d\d:\d\d$/);
  await expect(noeud(page, 'p1', 'e5')).toHaveAttribute('title', 'à venir');
  await capture(page, '14-etats');
});
