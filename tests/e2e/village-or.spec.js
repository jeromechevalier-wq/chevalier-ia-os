// Or du village, étape 6a de docs/accueil-village.md (27/11/2026) : compteur de pièces d'or sur l'accueil, annonce des bonnes nouvelles par les modules, fête.
// La fonction du serveur `villageOr` est SIMULÉE dans le navigateur (aucune fonction ne tourne dans les tests) : on vérifie ce que l'écran demande et ce qu'il montre.
// Quand la simulation « crédite », elle écrit aussi le portefeuille dans l'émulateur, comme le ferait le serveur. La base des achats est un faux réseau (crochet
// `window.__accesBase`, émulateurs seulement), copié en plus court de achatsfactures-examiner.spec.js. Un test par critère (le nom commence par son numéro) ;
// captures dans tests/e2e/captures/village-or/ (non commitées), nommées avec le projet. Données d'exemple neutres.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, JEROME, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';
import { listeComplete } from '../_donnees-achatsfactures.js';

const DOSSIER = fileURLToPath(new URL('./captures/village-or/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const ACHATS_B = { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'marche', cible: '#/tableauachats/tableau' };
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const or = (page) => page.locator('[data-role="or"]');
const fete = (page) => page.locator('[data-role="fete-or"]');

/** Simule `villageOr`. `reponse(demande)` rend { result } ou { status } (panne). Rend la liste des demandes reçues. */
async function simulerOr(page, reponse) {
  const demandes = [];
  await page.route(/cloudfunctions\.net\/villageOr$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const demande = JSON.parse(route.request().postData() ?? '{}').data;
    demandes.push(demande);
    const r = await reponse(demande);
    if (r.status) return route.fulfill({ status: r.status, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'panne' } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: r.result }) });
  });
  return demandes;
}

// ————— faux réseau de la base des achats (version courte de achatsfactures-examiner.spec.js) —————
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai',
  webhooks: { actions: https('hooks.exemple.test', '/actions'), validation: https('hooks.exemple.test', '/validation'), ajoutFacture: https('hooks.exemple.test', '/ajout'), suggestions: https('hooks.exemple.test', '/suggestions') } });
const SIRET_PP = '50000000500008';
const AGENCES = [{ id: 'ag1', fournisseur_id: 'fo1', siret: SIRET_PP, nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null }];
const FOURNISSEURS = [{ id: 'fo1', siren: SIRET_PP.slice(0, 9), nom: 'Point Q Matériaux', statut: 'actif' }];
const LIGNES_A1 = [1, 2, 3].map((p) => ({ position: p, reference_fournisseur: `REF-${p}`, designation: `Article fictif ${p}`, quantite: p, unite: 'u', prix_unitaire_ht: 100, remise_pct: 0, montant_ht: 100 * p, taux_tva: 20 }));
/** Un petit PDF d'une page, fabriqué ici (décalages calculés), comme achatsfactures-examiner.spec.js. */
function pdfFictif() {
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << >> >>', null];
  const flux = '0.9 g 20 20 260 360 re f';
  objets[3] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  let texte = '%PDF-1.4\n';
  const decalages = [];
  objets.forEach((o, i) => { decalages.push(texte.length); texte += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = texte.length;
  texte += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${decalages.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(texte, 'latin1');
}
const lignesTable = () => listeComplete().map((f) => { const { chantiers, etablissements_fournisseur, ...r } = f;
  return { ...r, chantier_id: null, etablissement_id: null, fichier_path: `espace-essai/${f.id}.pdf`, courriel_id: null, alertes_a_la_decision: null, motif_acceptation: null, archivee_par: null }; });

async function poserFauxReseau(page) {
  await page.addInitScript(({ factures, agences, fournisseurs, lignesA1 }) => {
    const faux = { factures: structuredClone(factures) };
    window.__appels = [];
    const rep = (corps, statut = 200, entetes = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    const liste = (lignes) => rep(lignes, 200, { 'Content-Range': `0-${Math.max(0, lignes.length - 1)}/${lignes.length}` });
    const filtre = (lignes, u, cles) => lignes.filter((l) => cles.every((k) => { const v = u.searchParams.get(k); if (!v) return true; if (v.startsWith('eq.')) return String(l[k]) === v.slice(3); if (v.startsWith('neq.')) return String(l[k]) !== v.slice(4); return true; }));
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      const corps = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      window.__appels.push({ chemin: u.pathname, corps });
      if (u.pathname === '/rest/v1/factures') {
        const select = u.searchParams.get('select') ?? '';
        if (select === 'id,extraction') return liste(faux.factures.filter((f) => f.statut === 'a_valider').map((f) => ({ id: f.id, extraction: f.extraction })));
        return liste(filtre(faux.factures, u, ['id', 'fournisseur_siren', 'iban_normalise']).map(({ extraction, ...r }) => (select.includes('extraction') ? { extraction, ...r } : r)));
      }
      if (u.pathname === '/rest/v1/chantiers') return liste([]);
      if (u.pathname === '/rest/v1/etablissements_fournisseur') return liste(agences);
      if (u.pathname === '/rest/v1/fournisseurs') return liste(fournisseurs);
      if (u.pathname === '/rest/v1/lignes_facture') return liste(u.searchParams.get('facture_id') === 'eq.a1' ? lignesA1 : []);
      if (u.pathname === '/rest/v1/courriels_recus' || u.pathname === '/rest/v1/ibans_confirmes') return liste([]);
      if (u.pathname === '/rest/v1/rpc/lister_favoris_os') return rep([]);
      if (u.pathname === '/rest/v1/rpc/demander_ticket_n8n') return rep('ticket-essai');
      if (u.pathname.startsWith('/storage/v1/object/sign/')) return rep({ signedURL: '/object/sign/factures/fichier.pdf?token=essai' });
      const f = corps ? faux.factures.find((x) => x.id === corps.facture_id) : null;
      if (u.pathname === '/validation') {
        if (corps.decision === 'accepter') Object.assign(f, { statut: 'acceptee', etablissement_id: corps.etablissement_id, date_decision: '2026-11-27T10:00:00Z', decide_par: 'test@exemple.example' });
        else Object.assign(f, { statut: 'refusee', motif_refus: corps.motif, date_decision: '2026-11-27T10:00:00Z', decide_par: 'test@exemple.example' });
        return rep({ ok: true });
      }
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { factures: lignesTable(), agences: AGENCES, fournisseurs: FOURNISSEURS, lignesA1: LIGNES_A1 });
  await page.route('**/storage/v1/object/sign/**', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: pdfFictif() }));
}

/** Connexion sur Réglages, `avant(uid)` (semer le portefeuille, poser une panne), puis l'accueil : le village lit le solde à l'ouverture. */
async function ouvrirVillage(page, avant = async () => {}) {
  await connecter(page, JEROME, { attendreAccueil: false, route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  const uid = await page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);
  await avant(uid);
  await page.evaluate(() => { location.hash = '#/accueil'; });
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  return uid;
}
/** Ouvre la page Examiner de la facture `id` et l'accepte (agence proposée d'après le SIRET, comme le test E3). */
async function accepterFacture(page, id = 'a1') {
  await page.evaluate((x) => { location.hash = `#/achatsfactures/examiner/${x}`; }, id);
  await expect(page.locator('[data-role="examiner"] [data-etat="chargement"]')).toHaveCount(0);
  if (estTelephone(page)) await page.locator('[data-onglet="verifications"]').click();
  const decision = page.locator('[data-bloc="decision"]');
  await expect(decision.getByRole('combobox', { name: 'Agence du fournisseur' })).toHaveValue(/Point Q Matériaux/);
  await decision.locator('[data-action="accepter"]').click();
  await expect(page.locator('[data-role="statut"]')).toHaveText('Acceptée');
}
/** Annonce une bonne nouvelle comme le ferait un module (même fichier js/os/bonnes-nouvelles.js). */
const annoncer = (page, source, detail) => page.evaluate(async ([s, d]) => { (await import(new URL('js/os/bonnes-nouvelles.js', document.baseURI).href)).annoncer(s, d); }, [source, detail]);
const credite = (uid, total) => async (demande) => { await ecrireDocument(`village_utilisateurs/${uid}`, { or: total, gagne: total, parcelles: 0 }); return { result: { ok: true, gagne: 10, or: total } }; };
const seChevauchent = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

test.describe('accueil village : pièces d’or', () => {
  test('6.1a le compteur montre le solde lu ; « 0 pièce d’or » sans portefeuille ; rien si la lecture échoue', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    // jamais d'or : pas de portefeuille, c'est une vraie valeur (0)
    const uid = await ouvrirVillage(page);
    await expect(or(page)).toHaveText('0 pièce d’or');
    await capturer(page, info, '6.1a-compteur-0');
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await ecrireDocument(`village_utilisateurs/${uid}`, { or: 120, gagne: 120, parcelles: 0 });
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(or(page)).toHaveText('120 pièces d’or');
    await expect(or(page)).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-role="batiment"]').first()).toBeVisible();
    const boite = await or(page).boundingBox();
    for (const autre of [page.getByRole('button', { name: 'Réglages de l’accueil' }), page.locator('[data-batiment-fixe="mairie-reglages"]'), page.locator('[data-role="village-phrase"]:visible')]) {
      if (await autre.count()) expect(seChevauchent(boite, await autre.first().boundingBox())).toBe(false);
    }
    await capturer(page, info, '6.1a-compteur-120');
    // lecture en panne : aucun compteur (jamais un « 0 » inventé)
    await page.evaluate(() => { location.hash = '#/reglages'; window.__chevalierTest.pannesOr = { lecture: 1 }; });
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(page.locator('[data-role="village"]')).toBeVisible();
    await expect(page.locator('[data-role="batiment"]').first()).toBeVisible();
    await expect(or(page)).toHaveCount(0);
    await capturer(page, info, '6.1a-solde-illisible');
  });

  test('6.1b accepter une facture d’achat annonce le gain et fait la fête ; le compteur suit ; refuser n’annonce rien', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ecrireDocument('base_parametres/connexion', FICHE());
    await poserFauxReseau(page);
    let uid = '';
    const demandes = await simulerOr(page, (d) => credite(uid, 130)(d));
    uid = await ouvrirVillage(page, (u) => ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0 }));
    await expect(or(page)).toHaveText('120 pièces d’or');
    await accepterFacture(page, 'a1');
    await expect(fete(page)).toContainText('+ 10 pièces d’or');
    await expect(fete(page)).toHaveAttribute('role', 'status');
    expect(await fete(page).evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    await capturer(page, info, '6.1b-fete');
    expect(demandes).toEqual([{ action: 'gain', source: 'facture-validee', id: 'a1' }]);
    await expect(fete(page)).toHaveCount(0, { timeout: 5000 }); // retirée au bout de 2,5 s
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(or(page)).toHaveText('130 pièces d’or');
    await capturer(page, info, '6.1b-compteur-130');
    // refuser une facture : aucune demande
    await page.evaluate(() => { location.hash = '#/achatsfactures/examiner/a14'; });
    await expect(page.locator('[data-role="examiner"] [data-etat="chargement"]')).toHaveCount(0);
    if (estTelephone(page)) await page.locator('[data-onglet="verifications"]').click();
    await page.locator('[data-bloc="decision"] [data-action="refuser-doublon"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Refuser' }).click();
    await expect(page.locator('[data-role="statut"]')).toHaveText('Refusée');
    await page.waitForTimeout(300);
    expect(demandes).toHaveLength(1);
  });

  test('6.1c « Animations » décoché : pas de fête animée, un simple message, l’or s’ajoute', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    let uid = '';
    const demandes = await simulerOr(page, (d) => credite(uid, 130)(d));
    uid = await ouvrirVillage(page, (u) => ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0 }));
    await page.getByRole('button', { name: 'Réglages de l’accueil' }).click();
    await page.getByRole('dialog', { name: 'Réglages de l’accueil' }).getByRole('switch', { name: 'Animations' }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await annoncer(page, 'devis-signe', { id: 'd1' });
    await expect(page.locator('#toasts')).toContainText('+ 10 pièces d’or');
    await expect(or(page)).toHaveText('130 pièces d’or');
    await expect(fete(page)).toHaveCount(0);
    expect(demandes).toEqual([{ action: 'gain', source: 'devis-signe', id: 'd1' }]);
    await capturer(page, info, '6.1c-sans-animation');
  });

  test('6.1c bis système en « moins d’animations » : pas de fête animée, un simple message', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await semer({ besoins: [FACTURES] });
    let uid = '';
    await simulerOr(page, (d) => credite(uid, 130)(d));
    uid = await ouvrirVillage(page, (u) => ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0 }));
    await expect(or(page)).toHaveText('120 pièces d’or');
    await annoncer(page, 'facture-payee', { projetId: 'p1', id: 'f1' });
    await expect(page.locator('#toasts')).toContainText('+ 10 pièces d’or');
    await expect(or(page)).toHaveText('130 pièces d’or');
    await expect(fete(page)).toHaveCount(0);
  });

  test('6.3 « déjà compté » : ni fête, ni message ; fonction en panne : pareil, et la facture est acceptée quand même', async ({ page, erreursConsole }, info) => {
    info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'la panne simulée de villageOr (500) est notée par le navigateur' });
    await semer({ besoins: [FACTURES] });
    await ecrireDocument('base_parametres/connexion', FICHE());
    await poserFauxReseau(page);
    let panne = false;
    const demandes = await simulerOr(page, () => (panne ? { status: 500 } : { result: { ok: true, gagne: 0, raison: 'deja' } }));
    await ouvrirVillage(page, (u) => ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0 }));
    await expect(or(page)).toHaveText('120 pièces d’or');
    await annoncer(page, 'devis-signe', { id: 'd1' });
    await expect.poll(() => demandes.length).toBe(1);
    await page.waitForTimeout(400);
    await expect(fete(page)).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect(or(page)).toHaveText('120 pièces d’or');
    panne = true;
    await accepterFacture(page, 'a1'); // le module n'attend pas l'or : la facture est acceptée
    await expect.poll(() => demandes.length).toBe(2);
    await page.waitForTimeout(400);
    await expect(fete(page)).toHaveCount(0);
    await expect(page.locator('.toast-erreur')).toHaveCount(0);
    await capturer(page, info, '6.3-panne-facture-acceptee');
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(or(page)).toHaveText('120 pièces d’or');
    // seule erreur admise dans la console : la panne simulée de villageOr
    expect(erreursConsole.filter((m) => !/status of 500 .*\/villageOr\)$/.test(String(m)) && !/status of 409 \(Conflict\).*documents:commit/.test(String(m)))).toEqual([]);
  });

  test('6.7x sans village (aucun besoin réglé), accepter une facture n’envoie aucune demande d’or', async ({ page }) => {
    await semer({});
    await ecrireDocument('base_parametres/connexion', FICHE());
    await poserFauxReseau(page);
    const demandes = await simulerOr(page, () => ({ result: { ok: true, gagne: 10, or: 10 } }));
    await connecter(page, JEROME, { attendreAccueil: false, route: 'achatsfactures/liste' });
    await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
    await accepterFacture(page, 'a1');
    await page.waitForTimeout(400);
    expect(demandes).toHaveLength(0);
    await expect(fete(page)).toHaveCount(0);
  });

  test('6.8 ni classement, ni série, ni notification, ni son, ni « CRM » (accueil et fête)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    let uid = '';
    await simulerOr(page, (d) => credite(uid, 130)(d));
    uid = await ouvrirVillage(page, (u) => ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0 }));
    await annoncer(page, 'devis-signe', { id: 'd1' });
    await expect(fete(page)).toContainText('+ 10 pièces d’or');
    const texte = await page.locator('body').innerText();
    expect(texte).not.toMatch(/classement|série|notification|\bCRM\b/i);
    expect(await page.evaluate(() => document.querySelectorAll('audio, video').length)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-role="fete-or"] [title], [data-role="or"] [title]')].length)).toBe(0);
    await capturer(page, info, '6.8-fete-accueil');
  });

  test('téléphone : le compteur ne couvre ni la roue, ni la Mairie, ni le bouton « Liste », ni la phrase d’aide', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au téléphone');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrirVillage(page, (u) => ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0 }));
    await expect(or(page)).toHaveText('120 pièces d’or');
    const boite = await or(page).boundingBox();
    const autres = [page.getByRole('button', { name: 'Réglages de l’accueil' }), page.locator('[data-batiment-fixe="mairie-reglages"]'), page.locator('.village-bouton-vue'), page.locator('[data-role="village-phrase"]:visible')];
    for (const autre of autres) {
      if (await autre.count()) expect(seChevauchent(boite, await autre.first().boundingBox())).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await capturer(page, info, 'telephone-compteur');
  });
});
