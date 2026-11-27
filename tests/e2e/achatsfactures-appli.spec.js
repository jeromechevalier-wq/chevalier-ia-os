// « L'application Factures » (27/11/2026, maquette v3 validée) : routes achatsfactures/pile, achatsfactures/tableau, achatsfactures/reglages. Un test par critère (le nom commence par son numéro).
// Aucun réseau réel : faux réseau du crochet de test `window.__accesBase` (émulateurs seulement) et un PDF fictif fabriqué ici. Fausses données : tests/_donnees-achatsfactures.js.
//  1 en-tête (maison › Factures ; statistiques puis roue dentée ; ni menu ni tuiles) ; 2 tableau de bord des factures ; 3 volet (à droite ; du bas sur téléphone) ; 4 fiche : plus de boutons de choix ;
//  5 clic sur le fournisseur d'une facture ; 6 fiche : la mise en page ne bouge pas en modification ; 7 IBAN modifié : alerte orange ; 8 « Nouveau fournisseur détecté » et « + Fournisseur » ;
//  9 plein écran et touches V, R, P, Échap ; 10 bilan de fin de pile ; 11 animations ; 12 la règle générale tient sur les trois écrans de l'appli.
// Corrections de la relecture (27/11/2026), un test par défaut, nommé « C<numéro> » : C1 double clic sur « Annuler » ; C2 relecture silencieuse après une écriture du volet ;
//  C3 changement d'IBAN signalé (tests 6 et 7) ; C4 « Annuler » pendant qu'une décision s'écrit ; C5 focus, Échap et fenêtre du volet ; C6 fournisseur non reconnu ; C7 roue du volet ;
//  C8 alerte IBAN (tests unitaires) ; C9 relecture en échec après un enregistrement réussi ; C10 bandeaux de la facture précédente ; C11 touche V pendant un chargement ou une écriture.
// Captures dans tests/e2e/captures/achatsfactures-appli/ (non commitées), nommées avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';
import { listeComplete } from '../_donnees-achatsfactures.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatsfactures-appli/', import.meta.url));
async function capturer(page, info, nom, options = {}) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled', ...options });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai',
  webhooks: { actions: https('hooks.exemple.test', '/actions'), validation: https('hooks.exemple.test', '/validation'), ajoutFacture: https('hooks.exemple.test', '/ajout'), suggestions: https('hooks.exemple.test', '/suggestions') } });

/** Un petit PDF d'une page, fabriqué ici (décalages calculés). */
function pdfFictif() {
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << >> >>', null];
  const flux = '0.9 g 20 20 260 360 re f';
  objets[3] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  let texte = '%PDF-1.4\n';
  const decalages = [];
  objets.forEach((o, i) => { decalages.push(texte.length); texte += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = texte.length;
  texte += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${decalages.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(texte, 'latin1');
}

// Numéros inventés mais valides (clé de l'IBAN) : aucune vraie donnée.
const SIRET_PP = '50000000500008';
const SIREN_PP = SIRET_PP.slice(0, 9);
const IBAN_CONFIRME = 'FR7830004000010000012345678';
const IBAN_NOUVEAU = 'FR4810278000010002000000001';
const AGENCES = [{ id: 'ag1', fournisseur_id: 'fo1', siret: SIRET_PP, nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null }];
const FOURNISSEURS = [{ id: 'fo1', siren: SIREN_PP, nom: 'Point Q Matériaux', statut: 'actif' }];
const CHANTIERS = [{ id: 'c1', nom: 'Villa Orvaline', client: 'Client fictif', adresse: '1 rue des essais 75000 Valmoran', statut: 'en_cours', code: 'CH-1', archive: false }];
const ARTICLES = [{ id: 'ar1', fournisseur_id: 'fo1', reference: 'REF-1', designation: 'Ciment fictif 35 kg', unite: 'sac' }];
const LIGNES_A1 = [1, 2, 3].map((p) => ({ position: p, reference_fournisseur: `REF-${p}`, designation: `Article fictif ${p}`, quantite: p, unite: 'u', prix_unitaire_ht: 100, remise_pct: 0, montant_ht: 100 * p, taux_tva: 20 }));
const IBANS = [{ id: 'ib1', fournisseur_id: 'fo1', siren: SIREN_PP, iban: IBAN_CONFIRME, facture_id: 'h9', moyen_verification: 'Appel au numéro connu', confirme_par: 'test@exemple.example', confirme_le: '2026-06-01T08:00:00Z', revoque_le: null, motif_revocation: null }];

/** Trois factures à valider : a1 (Point Q Matériaux, fournisseur connu), a14 (Point Q Matériaux, doublon), a12 (Ferronnerie du Verdon, fournisseur INCONNU de la table). Les factures décidées sont anciennes. */
const ARRIVEES = { a1: '2026-11-18T08:00:00Z', a14: '2026-11-19T08:00:00Z', a12: '2026-11-20T08:00:00Z' };
const lignesTable = ({ sansAValider = false, retouches = {} } = {}) => listeComplete()
  .filter((f) => (f.statut === 'a_valider' ? !sansAValider && f.id in ARRIVEES : true))
  .map((f) => { const { chantiers, etablissements_fournisseur, ...r } = { ...f, ...(retouches[f.id] ?? {}) };
    return { ...r, created_at: ARRIVEES[f.id] ?? '2025-03-01T08:00:00Z', date_decision: r.date_decision ? '2025-03-03T08:00:00Z' : null, chantier_id: null, etablissement_id: null, fichier_path: `espace-essai/${f.id}.pdf`, courriel_id: null, alertes_a_la_decision: null, motif_acceptation: null, archivee_par: null }; });

/**
 * Faux réseau posé AVANT le chargement : lectures filtrées comme le ferait la base, stockage, tickets, webhook de validation et actions métier (rouvrir, revoquer_iban, creer_agence, modifier_chantier).
 * `options` : { sansAValider, decideesCeMois (h1 acceptée et h2 refusée « maintenant »), fournisseursEnPanne, retouches ({ idFacture: champs remplacés }), ibans }. Les décisions sont datées de l'instant du test (bilan du jour).
 * Pendant le test : `window.__faux.fournisseursEnPanne` / `chantiersEnPanne` (pannes), et `retenir` / `lacher` (une réponse retenue le temps de regarder l'écran qui attend).
 */
async function poserFauxReseau(page, options = {}) {
  await page.addInitScript(({ factures, chantiers, agences, fournisseurs, articles, ibans, lignesA1, decideesCeMois, fournisseursEnPanne }) => {
    const maintenant = () => new Date().toISOString();
    const faux = { factures: structuredClone(factures), chantiers: structuredClone(chantiers), agences: structuredClone(agences), fournisseurs: structuredClone(fournisseurs), articles, ibans: structuredClone(ibans), fournisseursEnPanne, chantiersEnPanne: false, attentes: [] };
    if (decideesCeMois) for (const f of faux.factures) {
      if (f.id === 'h1') Object.assign(f, { date_decision: maintenant(), created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() });
      if (f.id === 'h2') Object.assign(f, { date_decision: maintenant(), archivee_le: null });
    }
    window.__faux = faux;
    window.__appels = [];
    const rep = (corps, statut = 200, entetes = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    const liste = (lignes) => rep(lignes, 200, { 'Content-Range': `0-${Math.max(0, lignes.length - 1)}/${lignes.length}` });
    const filtre = (lignes, u, cles) => lignes.filter((l) => cles.every((k) => {
      const v = u.searchParams.get(k);
      if (!v) return true;
      if (v.startsWith('eq.')) return String(l[k]) === v.slice(3);
      if (v.startsWith('neq.')) return String(l[k]) !== v.slice(4);
      return true;
    }));
    const trier = (lignes, u) => (u.searchParams.get('order')?.startsWith('created_at.asc') ? [...lignes].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : lignes);
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      const corps = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      window.__appels.push({ methode: init.method, chemin: u.pathname, corps, id: u.searchParams.get('id') });
      for (const a of [...faux.attentes]) if (a.chemin === u.pathname && (!a.id || u.searchParams.get('id') === `eq.${a.id}`) && (!a.factureId || corps?.facture_id === a.factureId)) await a.promesse; // réponse retenue par le test
      if (u.pathname === '/rest/v1/factures') {
        const select = u.searchParams.get('select') ?? '';
        if (select === 'id,extraction') return liste(faux.factures.filter((f) => f.statut === 'a_valider').map((f) => ({ id: f.id, extraction: f.extraction })));
        return liste(trier(filtre(faux.factures, u, ['id', 'statut', 'fournisseur_siren', 'iban_normalise']), u).map(({ extraction, ...r }) => (select.includes('extraction') ? { extraction, ...r } : r)));
      }
      if (u.pathname === '/rest/v1/chantiers') return faux.chantiersEnPanne ? rep({ message: 'panne' }, 500) : liste(filtre(faux.chantiers, u, ['id']));
      if (u.pathname === '/rest/v1/etablissements_fournisseur') return liste(faux.agences);
      if (u.pathname === '/rest/v1/fournisseurs') return faux.fournisseursEnPanne ? rep({ message: 'panne' }, 500) : liste(faux.fournisseurs);
      if (u.pathname === '/rest/v1/articles_fournisseur') return liste(faux.articles);
      if (u.pathname === '/rest/v1/courriels_recus') return liste([]);
      if (u.pathname === '/rest/v1/lignes_facture') return liste(u.searchParams.get('facture_id') === 'eq.a1' ? lignesA1 : []);
      if (u.pathname === '/rest/v1/ibans_confirmes') return liste(faux.ibans);
      if (u.pathname === '/rest/v1/rpc/lister_favoris_os') return rep([]);
      if (u.pathname === '/rest/v1/rpc/demander_ticket_n8n') return rep('ticket-essai');
      if (u.pathname.startsWith('/storage/v1/object/sign/')) return rep({ signedURL: '/object/sign/factures/fichier.pdf?token=essai' });
      const f = corps ? faux.factures.find((x) => x.id === corps.facture_id) : null;
      if (u.pathname === '/validation') {
        if (corps.decision === 'accepter') Object.assign(f, { statut: 'acceptee', etablissement_id: corps.etablissement_id, date_decision: maintenant(), decide_par: 'test@exemple.example' });
        else Object.assign(f, { statut: 'refusee', motif_refus: corps.motif, date_decision: maintenant(), decide_par: 'test@exemple.example' });
        return rep({ ok: true });
      }
      if (u.pathname === '/actions') {
        if (corps.action === 'rouvrir') { Object.assign(f, { statut: 'a_valider', date_decision: null, decide_par: null, motif_refus: null }); return rep({ ok: true }); }
        if (corps.action === 'revoquer_iban') { Object.assign(faux.ibans.find((x) => x.id === corps.id), { revoque_le: maintenant(), motif_revocation: corps.motif }); return rep({ ok: true }); }
        if (corps.action === 'modifier_chantier') { Object.assign(faux.chantiers.find((x) => x.id === corps.id), corps.champs); return rep({ ok: true }); }
        if (corps.action === 'creer_agence') {
          const siren = corps.siren ?? (corps.siret ? corps.siret.slice(0, 9) : null);
          faux.fournisseurs.push({ id: 'fo-nouveau', siren, nom: corps.nom_fournisseur, statut: 'actif' });
          faux.agences.push({ id: 'ag-nouvelle', fournisseur_id: 'fo-nouveau', siret: corps.siret ?? null, nom_agence: corps.nom_agence ?? null, ville: corps.ville ?? null, actif: true, fusionne_dans: null });
          return rep({ ok: true, agence_id: 'ag-nouvelle' });
        }
      }
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { factures: lignesTable(options), chantiers: CHANTIERS, agences: AGENCES, fournisseurs: FOURNISSEURS, articles: ARTICLES, ibans: IBANS, lignesA1: LIGNES_A1, decideesCeMois: false, fournisseursEnPanne: false, ...options });
  await page.route('**/storage/v1/object/sign/**', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: pdfFictif() }));
}
const appelsVers = (page, chemin) => page.evaluate((c) => window.__appels.filter((a) => a.chemin === c).map((a) => a.corps), chemin);
/** Retient les réponses du faux réseau pour ce chemin (et cette facture) jusqu'à `lacher(page, cle)` : le test regarde l'écran pendant qu'il attend. */
const retenir = (page, cle, filtre) => page.evaluate(({ cle, filtre }) => {
  let ouvrir; const promesse = new Promise((r) => { ouvrir = r; });
  window.__faux.attentes.push({ cle, ...filtre, promesse, ouvrir });
}, { cle, filtre });
const lacher = (page, cle) => page.evaluate((c) => { const f = window.__faux; for (const a of f.attentes.filter((x) => x.cle === c)) a.ouvrir(); f.attentes = f.attentes.filter((x) => x.cle !== c); }, cle);
const lecturesFacture = (page, id) => page.evaluate((i) => window.__appels.filter((a) => a.chemin === '/rest/v1/factures' && a.id === `eq.${i}`).length, id);
const fenetre = (page) => page.locator('.voile-dialogue .dialogue'); // les fenêtres (le volet est lui aussi une fenêtre sur téléphone : `getByRole('dialog')` ne suffit plus)
const focusDans = (page) => page.evaluate(() => { const a = document.activeElement; return { volet: !!a?.closest?.('[data-role="volet"]'), role: a?.dataset?.role ?? null, action: a?.dataset?.action ?? null, onglet: a?.dataset?.onglet ?? null, balise: a?.tagName ?? null }; });
const coupes = (loc) => loc.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));

async function ouvrirAppli(page, options = {}, route = 'achatsfactures/pile') {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page, options);
  await connecter(page, undefined, { route });
  await expect(page.locator('[data-role="appli-factures"]')).toBeVisible();
  await expect(page.locator('[data-role="appli-factures"] [data-etat="chargement"]')).toHaveCount(0);
}
const bloc = (page, nom) => page.locator(`[data-bloc="${nom}"]`);
const numero = (page) => page.locator('.page-examiner .compteur-liste');
const restantes = (page) => page.locator('[data-role="pile-restantes"]');
const volet = (page) => page.locator('[data-role="volet"]');
const fiche = (page) => volet(page).locator('[data-role="fiche"]');
async function versVerifications(page) { if (estTelephone(page)) await page.locator('[data-onglet="verifications"]').click(); }
/** Attend que la facture `num` soit affichée, lue (plus de chargement) et arrivée (plus d'animation d'entrée en attente). */
async function attendreFacture(page, num) {
  await expect(numero(page)).toContainText(num);
  await expect(page.locator('[data-role="pile"] [data-etat="chargement"]')).toHaveCount(0);
  await expect(page.locator('[data-role="pile-facture"].af-attend')).toHaveCount(0);
}
const passer = (page) => page.locator('[data-action="passer"]').click();
async function accepter(page) { await versVerifications(page); await bloc(page, 'decision').locator('[data-action="accepter"]').click(); }
async function refuser(page, motif = 'Facture refusée pour essai') {
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="refuser"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.locator('[data-champ="motif"]').fill(motif);
  await fenetre.getByRole('button', { name: 'Refuser' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
/** Le grand bouton « Fournisseurs, Chantiers, Articles » : dans l'en-tête sur ordinateur, en bas de l'écran sur téléphone. */
const grandBouton = (page) => page.locator(estTelephone(page) ? '[data-action="ouvrir-volet-telephone"]' : '[data-action="ouvrir-volet"]');
async function ouvrirVolet(page) {
  await grandBouton(page).click();
  await expect(volet(page)).toBeVisible();
  await expect(volet(page).locator('[data-etat="chargement"]')).toHaveCount(0);
  await volet(page).evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished))); // l'animation d'arrivée est finie : les positions sont stables
}
async function ouvrirFicheFournisseur(page, nom = 'Point Q Matériaux') {
  await ouvrirVolet(page);
  await volet(page).locator('[data-role="volet-liste"] button', { hasText: nom }).click();
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText(nom);
}
/** Position et taille (arrondies au demi-pixel) des éléments d'un sélecteur, dans l'ordre. */
const boites = (loc) => loc.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const a = (n) => Math.round(n * 2) / 2; return { x: a(r.x), y: a(r.y), l: a(r.width), h: a(r.height) }; }));

// ---------------------------------------------------------------- maison avec un village (critère 1 : la maison ramène au village d'accueil)
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const semerVillage = () => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS,
  besoins: [{ nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/pile' }] } });

test('1 en-tête : « maison › Factures » à gauche (la maison ramène au village, « Factures » à la pile), statistiques puis roue dentée à droite ; ni menu à gauche ni tuiles au-dessus de la pile', async ({ page }, info) => {
  await semerVillage();
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  const entete = page.locator('[data-role="appli-entete"]');
  const maison = entete.locator('[data-action="accueil"]');
  const nom = entete.locator('[data-action="vers-pile"]');
  await expect(maison).toBeVisible();
  await expect(maison).toHaveAttribute('aria-label', 'Revenir à l’accueil');
  await expect(nom).toHaveText('Factures');
  const [bm, bn] = [await maison.boundingBox(), await nom.boundingBox()];
  expect(bm.x).toBeLessThan(bn.x); // la maison d'abord, puis le nom
  expect(bn.x).toBeLessThan(page.viewportSize().width / 2); // à gauche
  // À droite : l'icône statistiques puis la roue dentée, tout au bout.
  const outils = await entete.locator('[data-role="appli-outils"] > [data-action]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.dataset.action));
  expect(outils.slice(-2)).toEqual(['tableau-de-bord', 'reglages-factures']);
  expect(outils).toEqual(estTelephone(page) ? ['plein-ecran', 'tableau-de-bord', 'reglages-factures'] : ['ouvrir-volet', 'plein-ecran', 'tableau-de-bord', 'reglages-factures']);
  const roue = await entete.locator('[data-action="reglages-factures"]').boundingBox();
  expect(roue.x + roue.width).toBeGreaterThan(page.viewportSize().width - 40);
  // Pas de menu à gauche, pas de barre de la coque, pas de tuiles de chiffres au-dessus de la pile.
  await expect(page.locator('.coquille .menu')).toBeHidden();
  await expect(page.locator('.coquille .barre-haut')).toBeHidden();
  await expect(page.locator('[data-role="appli-factures"] .af-tuile')).toHaveCount(0);
  expect((await page.locator('[data-role="appli-factures"]').boundingBox()).x).toBe(0);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '1-entete-pile');
  // « Factures » ramène à la pile depuis une autre page de l'appli.
  await entete.locator('[data-action="reglages-factures"]').click();
  await expect(page).toHaveURL(/achatsfactures\/reglages$/);
  await page.locator('[data-role="appli-entete"] [data-action="vers-pile"]').click();
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  await attendreFacture(page, 'FA-2026-0412');
  // La maison ramène au village d'accueil, où la coque retrouve son menu.
  await page.locator('[data-role="appli-entete"] [data-action="accueil"]').click();
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  await expect(page).toHaveURL(/#\/accueil$/);
  await expect(page.locator(estTelephone(page) ? '.coquille .barre-haut' : '.coquille .menu')).toBeVisible();
  await capturer(page, info, '1-retour-village');
});

test('2 l\'icône statistiques ouvre la page « Tableau de bord des factures » (chiffres des factures seulement), avec « ← Retour à la pile »', async ({ page }, info) => {
  await ouvrirAppli(page, { decideesCeMois: true });
  await attendreFacture(page, 'FA-2026-0412');
  await page.locator('[data-role="appli-entete"] [data-action="tableau-de-bord"]').click();
  await expect(page).toHaveURL(/achatsfactures\/tableau$/);
  const tableau = page.locator('[data-role="tableau-factures"]');
  await expect(tableau.getByRole('heading', { name: 'Tableau de bord des factures', level: 1 })).toBeVisible();
  await expect(tableau.locator('[data-etat="chargement"]')).toHaveCount(0);
  const tuile = (cle) => tableau.locator(`[data-tuile="${cle}"] .af-chiffre`);
  await expect(tuile('a-valider')).toHaveText('3');
  await expect(tuile('validees')).toHaveText('1');
  await expect(tuile('refusees')).toHaveText('1');
  await expect(tuile('montant')).toHaveText(/^120,00\s€$/);
  await expect(tuile('delai')).toHaveText('1 jour');
  await expect(tableau.locator('[data-bloc="top3"]')).toContainText('Bricolo Dépôt');
  await expect(tableau.locator('[data-bloc="semaines"] li')).toHaveCount(4);
  await expect(tableau.locator('.af-tuile')).toHaveCount(7); // cinq chiffres et deux blocs : rien d'autre que les factures
  await expect(page.locator('[data-role="appli-entete"] [data-action="tableau-de-bord"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.coquille .menu')).toBeHidden();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '2-tableau-de-bord');
  const retour = tableau.locator('[data-action="retour-pile"]');
  await expect(retour).toHaveText('Retour à la pile');
  await retour.click();
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  await attendreFacture(page, 'FA-2026-0412');
});

test('2 tableau de bord : cas vide (aucune facture : chiffres à zéro, délai « — ») ', async ({ page }, info) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page);
  await page.addInitScript(() => { window.__faux.factures = []; });
  await connecter(page, undefined, { route: 'achatsfactures/tableau' });
  const tableau = page.locator('[data-role="tableau-factures"]');
  await expect(tableau.locator('[data-etat="vide"]')).toContainText('Aucune facture pour l’instant');
  await expect(tableau.locator('[data-tuile="a-valider"] .af-chiffre')).toHaveText('0');
  await expect(tableau.locator('[data-tuile="delai"] .af-chiffre')).toHaveText('—');
  await expect(tableau.locator('[data-bloc="top3"]')).toContainText('Aucune facture validée ce mois');
  await capturer(page, info, '2-tableau-cas-vide');
});

test('3 le grand bouton « Fournisseurs, Chantiers, Articles » ouvre le volet (à droite ; du bas sur téléphone) avec les trois boutons en haut ; la croix le ferme', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await expect(grandBouton(page)).toHaveText('Fournisseurs, Chantiers, Articles');
  expect((await grandBouton(page).boundingBox()).height).toBeGreaterThanOrEqual(40); // un GRAND bouton
  await expect(volet(page)).toBeHidden();
  await ouvrirVolet(page);
  const onglets = volet(page).locator('[data-role="volet-onglets"] button');
  await expect(onglets).toHaveText(['Fournisseurs', 'Chantiers', 'Articles']);
  await expect(onglets.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Point Q Matériaux');
  const v = await volet(page).boundingBox();
  const vue = page.viewportSize();
  if (estTelephone(page)) {
    expect(Math.round(v.y + v.height)).toBe(vue.height); // collé en bas
    expect(v.y).toBeGreaterThan(vue.height * 0.1); // il monte du bas, il ne couvre pas tout
    expect(Math.round(v.width)).toBe(vue.width);
    await expect(page.locator('[data-role="voile-volet"]')).toBeVisible();
  } else {
    expect(Math.round(v.x + v.width)).toBe(vue.width); // collé à droite
    expect(v.x).toBeGreaterThan(vue.width / 2);
    const carte = await page.locator('[data-role="pile-facture"]').boundingBox(); // la facture reste visible, à gauche du volet
    expect(carte.x + carte.width).toBeLessThanOrEqual(v.x + 1);
  }
  await capturer(page, info, '3-volet-fournisseurs');
  await onglets.nth(1).click();
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Villa Orvaline');
  await onglets.nth(2).click();
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Ciment fictif 35 kg');
  await expect(onglets.nth(2)).toHaveAttribute('aria-pressed', 'true');
  // La recherche filtre la liste ; rien ne correspond : un message, pas une liste vide muette.
  await volet(page).getByRole('searchbox').fill('introuvable');
  await expect(volet(page).locator('[data-etat="sans-resultat"]')).toBeVisible();
  await volet(page).locator('[data-action="fermer-volet"]').click();
  await expect(volet(page)).toBeHidden();
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('3 volet : cas d\'erreur (fournisseurs illisibles) avec « Réessayer », et cas vide', async ({ page }, info) => {
  await ouvrirAppli(page, { fournisseursEnPanne: true });
  await attendreFacture(page, 'FA-2026-0412');
  await grandBouton(page).click();
  await expect(volet(page).locator('[data-etat="erreur"]')).toContainText('Impossible de lire les fournisseurs');
  await capturer(page, info, '3-volet-cas-erreur');
  await page.evaluate(() => { window.__faux.fournisseursEnPanne = false; window.__faux.fournisseurs = []; });
  await volet(page).locator('[data-action="reessayer"]').click();
  await expect(volet(page).locator('[data-etat="vide"]')).toContainText('Aucun fournisseur pour l’instant');
  await capturer(page, info, '3-volet-cas-vide');
});

test('4 une fiche ouverte dans le volet cache les trois boutons : il reste « ← » (retour à la liste) et la croix', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  for (const [rang, ligne, titre, retour] of [[0, 'Point Q Matériaux', 'Point Q Matériaux', 'Fournisseurs'], [1, 'Villa Orvaline', 'Villa Orvaline', 'Chantiers'], [2, 'Ciment fictif 35 kg', 'Ciment fictif 35 kg', 'Articles']]) {
    if (!(await volet(page).isVisible())) await ouvrirVolet(page);
    await volet(page).locator('[data-role="volet-onglets"] button').nth(rang).click();
    await volet(page).locator('[data-role="volet-liste"] button', { hasText: ligne }).click();
    await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText(titre);
    await expect(volet(page).locator('[data-role="volet-onglets"]')).toHaveCount(0);
    const boutons = await volet(page).locator('.af-volet-tete button').evaluateAll((els) => els.map((e) => e.dataset.action));
    expect(boutons).toEqual(['retour-liste-volet', 'fermer-volet']);
    if (rang === 0) await capturer(page, info, '4-fiche-sans-les-trois-boutons');
    await volet(page).locator('[data-action="retour-liste-volet"]').click(); // « ← » ramène à la bonne liste, avec ses trois boutons
    await expect(volet(page).locator('[data-role="volet-onglets"] button').nth(rang)).toHaveAttribute('aria-pressed', 'true');
    await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText(retour === 'Fournisseurs' ? 'Point Q Matériaux' : ligne);
  }
  // La croix ferme depuis une fiche ; le grand bouton rouvre sur la liste (pas d'onglet mémorisé).
  await volet(page).locator('[data-role="volet-liste"] button').first().click();
  await volet(page).locator('[data-action="fermer-volet"]').click();
  await expect(volet(page)).toBeHidden();
  await ouvrirVolet(page);
  await expect(volet(page).locator('[data-role="volet-onglets"] button').first()).toHaveAttribute('aria-pressed', 'true');
});

test('5 cliquer sur le nom du fournisseur d\'une facture ouvre directement sa fiche dans le volet', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  const nom = page.locator('.page-examiner h1 [data-action="fiche-fournisseur"]');
  await expect(nom).toHaveText('Point Q Matériaux');
  await expect(volet(page)).toBeHidden();
  await nom.click();
  await expect(volet(page)).toBeVisible();
  await expect(volet(page)).toHaveAttribute('data-vue', 'fiche');
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Point Q Matériaux');
  await volet(page).evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  await expect(volet(page).locator('[data-role="volet-onglets"]')).toHaveCount(0); // la fiche, pas la liste
  await expect(fiche(page).locator('[data-ligne="siren"] dd')).toHaveText(SIREN_PP);
  await expect(fiche(page).locator('[data-ligne="agences"] dd')).toHaveText('Agence Nord · Valmoran');
  await expect(fiche(page).locator('[data-ligne="nb"] dd')).toHaveText('3'); // a1, a14 et h9
  await expect(numero(page)).toContainText('FA-2026-0412'); // la facture reste derrière
  await capturer(page, info, '5-fiche-depuis-la-facture');
});

test('6 fiche fournisseur (C3) : en lecture seule, l\'IBAN masqué tient en entier dans sa case, « Signaler un changement d\'IBAN » demande une confirmation ; y renoncer ne change rien et la mise en page ne bouge pas', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await ouvrirFicheFournisseur(page);
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  await expect(fiche(page).locator('dt')).toHaveText(['Nom', 'SIREN', 'Agence(s)', 'Adresse', 'E-mail', 'IBAN', 'IBAN confirmé', 'Nombre de factures', 'Dernière facture']);
  await expect(fiche(page).locator('[data-ligne="iban"] dd')).toHaveText('FR78 •••• 5678'); // jamais l'IBAN entier
  await expect(fiche(page).locator('[data-ligne="iban-confirme"] dd')).toHaveText('Oui, le 01/06/2026');
  expect(await coupes(fiche(page).locator('[data-ligne="iban"] .af-valeur, [data-ligne="iban-confirme"] .af-valeur'))).toEqual([]); // rien n'est coupé dans sa case (ordinateur et téléphone)
  expect(await coupes(volet(page).locator('[data-role="historique-iban"] .af-iban'))).toEqual([]);
  // L'IBAN ne se saisit plus dans la fiche : aucun champ, pas de « Modifier » (rien n'est modifiable ici), un seul bouton.
  await expect(fiche(page).locator('input')).toHaveCount(0);
  await expect(fiche(page).locator('[data-action="modifier-fiche"], [data-action="enregistrer-fiche"], [data-action="annuler-fiche"]')).toHaveCount(0);
  const signaler = fiche(page).locator('[data-action="signaler-iban"]');
  await expect(signaler).toHaveText('Signaler un changement d’IBAN');
  await capturer(page, info, '6-fiche-lecture');
  await signaler.scrollIntoViewIfNeeded(); // sur téléphone le bouton est plus bas dans le volet : on mesure une fois le volet défilé jusqu'à lui
  const libellesAvant = await boites(fiche(page).locator('dt'));
  const valeursAvant = await boites(fiche(page).locator('dd > *'));
  const lignesAvant = await boites(fiche(page).locator('.af-fiche-ligne'));
  // Confirmation explicite : la fenêtre dit ce qui va se passer ; « Annuler » n'envoie rien.
  await signaler.click();
  await expect(fenetre(page)).toContainText('Signaler un changement d’IBAN ?');
  await expect(fenetre(page)).toContainText('L’IBAN confirmé de Point Q Matériaux (FR78 •••• 5678) ne sera plus reconnu');
  await expect(fenetre(page).locator('[data-champ="nouvel-iban"]')).toHaveValue('');
  await capturer(page, info, '6-fenetre-signaler-iban');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(fenetre(page)).toHaveCount(0);
  expect(await appelsVers(page, '/actions')).toHaveLength(0);
  await expect(fiche(page).locator('[data-ligne="iban-confirme"] dd')).toHaveText('Oui, le 01/06/2026');
  expect(await boites(fiche(page).locator('dt'))).toEqual(libellesAvant);
  expect(await boites(fiche(page).locator('dd > *'))).toEqual(valeursAvant);
  expect(await boites(fiche(page).locator('.af-fiche-ligne'))).toEqual(lignesAvant);
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('6 fiche chantier : lecture, « Modifier », « Enregistrer » / « Annuler » ; en modification la mise en page ne bouge pas (libellés, valeurs et lignes aux mêmes positions) ; seul ce qui a changé est enregistré ; double clic : un seul envoi', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await ouvrirVolet(page);
  await volet(page).locator('[data-role="volet-onglets"] button').nth(1).click();
  await volet(page).locator('[data-role="volet-liste"] button', { hasText: 'Villa Orvaline' }).click();
  await expect(fiche(page).locator('dt')).toHaveText(['Nom', 'Code', 'Client', 'Adresse', 'Statut']);
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  await expect(fiche(page).locator('input')).toHaveCount(0);
  await expect(fiche(page).locator('[data-action="enregistrer-fiche"], [data-action="annuler-fiche"]')).toHaveCount(0);
  const libellesAvant = await boites(fiche(page).locator('dt'));
  const valeursAvant = await boites(fiche(page).locator('dd > *'));
  const lignesAvant = await boites(fiche(page).locator('.af-fiche-ligne'));
  await capturer(page, info, '6-fiche-chantier-lecture');
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await expect(fiche(page)).toHaveAttribute('data-mode', 'modification');
  await expect(fiche(page).locator('[data-action="modifier-fiche"]')).toHaveCount(0);
  await expect(fiche(page).locator('[data-action="enregistrer-fiche"]')).toHaveText('Enregistrer');
  await expect(fiche(page).locator('[data-action="annuler-fiche"]')).toHaveText('Annuler');
  // Texte long (règle commune du 27/11/2026) : une valeur lue sur plusieurs lignes (l'adresse, sur ordinateur) devient un champ sur plusieurs lignes (textarea) de la même hauteur.
  await expect(fiche(page).locator('input, textarea')).toHaveCount(4);
  await expect(fiche(page).locator('[data-champ="client"]')).toHaveValue('Client fictif'); // modifiable sur place, avec sa valeur
  // LA MISE EN PAGE NE BOUGE PAS : mêmes positions et mêmes tailles, au demi-pixel, pour les libellés, les cases de valeur et les lignes.
  expect(await boites(fiche(page).locator('dt'))).toEqual(libellesAvant);
  expect(await boites(fiche(page).locator('dd > *'))).toEqual(valeursAvant);
  expect(await boites(fiche(page).locator('.af-fiche-ligne'))).toEqual(lignesAvant);
  // « Annuler » jette la saisie : la valeur d'origine revient, en lecture comme au prochain « Modifier » ; le focus revient sur « Modifier ».
  await fiche(page).locator('[data-champ="client"]').fill('Saisie jetée');
  await fiche(page).locator('[data-action="annuler-fiche"]').click();
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  await expect(fiche(page).locator('[data-ligne="client"] dd')).toHaveText('Client fictif');
  expect(await boites(fiche(page).locator('dt'))).toEqual(libellesAvant);
  expect((await focusDans(page)).action).toBe('modifier-fiche');
  // « Enregistrer » sans rien changer : retour à la lecture, rien n'est envoyé.
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await expect(fiche(page).locator('[data-champ="client"]')).toHaveValue('Client fictif');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  expect(await appelsVers(page, '/actions')).toHaveLength(0);
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  // Cas d'erreur : un nom vide est refusé avec une phrase, on reste en modification avec la saisie.
  await fiche(page).locator('[data-champ="nom"]').fill('');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect(fiche(page).locator('[data-erreur="fiche"]')).toHaveText('Le nom du chantier est obligatoire.');
  await expect(fiche(page)).toHaveAttribute('data-mode', 'modification');
  await fiche(page).locator('[data-champ="nom"]').fill('Villa Orvaline');
  await fiche(page).locator('[data-champ="client"]').fill('Nouveau client fictif');
  await capturer(page, info, '6-fiche-chantier-modification');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').dblclick();
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  await expect(fiche(page).locator('[data-ligne="client"] dd')).toHaveText('Nouveau client fictif');
  expect(await appelsVers(page, '/actions')).toEqual([{ id: 'c1', champs: { client: 'Nouveau client fictif' }, action: 'modifier_chantier' }]);
});

test('7 changement d\'IBAN signalé dans la fiche (C3) : l\'ancien IBAN est retiré, le nouveau n\'est écrit nulle part en entier ; alerte orange sur les factures suivantes de ce fournisseur dans la pile, et sur celles-là seulement', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await expect(page.locator('[data-role="alerte-iban"]')).toHaveCount(0); // avant : aucune alerte
  await ouvrirFicheFournisseur(page);
  await fiche(page).locator('[data-action="signaler-iban"]').click();
  const champ = fenetre(page).locator('[data-champ="nouvel-iban"]');
  const valider = fenetre(page).getByRole('button', { name: 'Retirer l’ancien IBAN' });
  // Cas d'erreur : un IBAN impossible, ou l'IBAN déjà confirmé, sont refusés dans la fenêtre (qui reste ouverte) ; rien n'est envoyé.
  await champ.fill('FR76 0000 0000 0000');
  await valider.click();
  await expect(fenetre(page).locator('[data-erreur="fenetre"]')).toContainText('Cet IBAN n’est pas valide');
  await champ.fill('FR78 3000 4000 0100 0001 2345 678');
  await valider.click();
  await expect(fenetre(page).locator('[data-erreur="fenetre"]')).toContainText('C’est l’IBAN déjà confirmé');
  expect(await appelsVers(page, '/actions')).toHaveLength(0);
  await champ.fill('FR48 1027 8000 0100 0200 0000 001');
  await valider.click();
  await expect(fenetre(page)).toHaveCount(0);
  await expect(volet(page).locator('[data-role="alerte-iban-fiche"]')).toContainText('L’IBAN a été changé le');
  // L'écriture réutilise l'action existante (révocation de la confirmation). Le nouvel IBAN n'y figure que MASQUÉ ; il n'est écrit en entier dans aucun appel.
  expect(await appelsVers(page, '/actions')).toEqual([{ id: 'ib1', motif: 'Changement d’IBAN signalé depuis la fiche du fournisseur. Nouvel IBAN annoncé : FR48 •••• 0001.', action: 'revoquer_iban' }]);
  expect(await page.evaluate(() => JSON.stringify(window.__appels).replace(/\s/g, ''))).not.toContain('FR4810278000010002000000001');
  await expect(page.locator('.toast').filter({ hasText: 'Ancien IBAN retiré : le nouveau sera confirmé à la prochaine facture' })).toBeVisible();
  // La fiche ne montre plus l'ancien IBAN comme confirmé, ne prétend pas connaître le nouveau, et n'offre plus rien à signaler ; l'historique garde la trace.
  await expect(fiche(page).locator('[data-ligne="iban-confirme"] dd')).not.toContainText('Oui');
  await expect(volet(page)).not.toContainText('FR48');
  await expect(fiche(page).locator('[data-action="signaler-iban"]')).toHaveCount(0);
  await expect(volet(page).locator('[data-role="historique-iban"]')).toContainText('révoqué le');
  expect((await focusDans(page)).role).toBe('fiche-titre'); // après le redessin, le focus est sur le titre de la fiche (jamais derrière le volet)
  await capturer(page, info, '7-fiche-iban-change');
  await volet(page).locator('[data-action="retour-liste-volet"]').click();
  await expect(volet(page).locator('[data-role="puce-iban"]')).toHaveText('IBAN changé');
  await volet(page).locator('[data-action="fermer-volet"]').click();
  // Dans la pile : alerte orange sur la facture de ce fournisseur…
  const alerte = page.locator('[data-role="alerte-iban"]');
  await attendreFacture(page, 'FA-2026-0412');
  await expect(alerte).toContainText('IBAN changé récemment : vérifie avant de payer');
  const couleurs = await alerte.locator('b').evaluate((e) => { // la couleur « attention » du thème (orange), jamais le rouge ni le jaune
    const temoin = document.createElement('span'); temoin.style.color = 'var(--attention)'; document.body.append(temoin);
    const r = { titre: getComputedStyle(e).color, attention: getComputedStyle(temoin).color }; temoin.remove(); return r; });
  expect(couleurs.titre).toBe(couleurs.attention);
  await capturer(page, info, '7-alerte-orange-pile');
  // … sur sa facture suivante aussi…
  await passer(page);
  await attendreFacture(page, 'FA-2026-0300');
  await expect(alerte).toBeVisible();
  // … mais pas sur la facture d'un autre fournisseur.
  await passer(page);
  await attendreFacture(page, 'FQ-100');
  await expect(alerte).toHaveCount(0);
  // « Voir la fiche » de l'alerte ouvre la fiche du fournisseur.
  await passer(page);
  await attendreFacture(page, 'FA-2026-0412');
  await alerte.locator('[data-action="voir-fiche-fournisseur"]').click();
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Point Q Matériaux');
});

test('8 bandeau « Nouveau fournisseur détecté » sur une facture au fournisseur inconnu : formulaire pré-rempli depuis la facture ; et bouton « + Fournisseur » dans le volet', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  const bandeau = page.locator('[data-role="nouveau-fournisseur"]');
  await expect(bandeau).toHaveCount(0); // fournisseur connu : pas de bandeau
  await passer(page); await attendreFacture(page, 'FA-2026-0300');
  await passer(page); await attendreFacture(page, 'FQ-100');
  await expect(bandeau).toContainText('Nouveau fournisseur détecté : Ferronnerie du Verdon.');
  await capturer(page, info, '8-bandeau-nouveau-fournisseur');
  await bandeau.locator('[data-action="ajouter-fournisseur"]').click();
  await expect(volet(page)).toHaveAttribute('data-vue', 'nouveau');
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Nouveau fournisseur');
  await expect(volet(page).locator('[data-role="prerempli"]')).toContainText('Pré-rempli depuis la facture FQ-100');
  await expect(volet(page).locator('[data-role="volet-onglets"]')).toHaveCount(0);
  await expect(fiche(page).locator('[data-champ="nom_fournisseur"]')).toHaveValue('Ferronnerie du Verdon');
  await expect(fiche(page).locator('[data-champ="siret"]')).toHaveValue('50000002100005');
  await expect(fiche(page).locator('[data-champ="siren"]')).toHaveValue('500000021');
  await capturer(page, info, '8-formulaire-pre-rempli');
  await fiche(page).locator('[data-champ="nom_agence"]').fill('Agence du Lac');
  await fiche(page).locator('[data-champ="ville"]').fill('Valmoran');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect(volet(page)).toHaveAttribute('data-vue', 'fiche'); // la fiche du fournisseur créé s'ouvre
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Ferronnerie du Verdon');
  expect(await appelsVers(page, '/actions')).toEqual([{ nom_fournisseur: 'Ferronnerie du Verdon', siret: '50000002100005', siren: '500000021', nom_agence: 'Agence du Lac', ville: 'Valmoran', action: 'creer_agence' }]);
  await expect(bandeau).toHaveCount(0); // le fournisseur est connu : le bandeau disparaît
  // « + Fournisseur » dans le volet : formulaire vide ; un nom manquant est refusé avec une phrase ; « Annuler » ramène à la liste.
  await volet(page).locator('[data-action="retour-liste-volet"]').click();
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Ferronnerie du Verdon');
  const plus = volet(page).locator('[data-action="nouveau-fournisseur"]');
  await expect(plus).toHaveText('Fournisseur');
  await plus.click();
  await expect(volet(page).locator('[data-role="prerempli"]')).toHaveCount(0);
  await expect(fiche(page).locator('[data-champ="nom_fournisseur"]')).toHaveValue('');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect(fiche(page).locator('[data-erreur="fiche"]')).toHaveText('Indique le nom de l’entreprise.');
  await fiche(page).locator('[data-action="annuler-fiche"]').click();
  await expect(volet(page)).toHaveAttribute('data-vue', 'liste');
  expect(await appelsVers(page, '/actions')).toHaveLength(1);
});

test('9 plein écran « concentration » : bouton, touches V = valider, R = refuser, P = passer, Échap = sortir ; plus aucune touche n\'agit après la sortie', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  const appli = page.locator('[data-role="appli-factures"]');
  await page.locator('[data-action="plein-ecran"]').click();
  await expect(appli).toHaveClass(/af-focus/);
  await expect(page.locator('[data-role="focus-entete"]')).toContainText('Factures · concentration');
  await expect(page.locator('[data-action="quitter-plein-ecran"]')).toBeVisible();
  await expect(page.locator('[data-role="appli-entete"]')).toBeHidden();
  await expect(page.locator('[data-role="focus-restantes"]')).toHaveText('3 restantes');
  if (!estTelephone(page)) await expect(page.locator('[data-role="focus-touches"]')).toHaveText(/V\s*valider\s*R\s*refuser\s*P\s*passer\s*Échap\s*sortir/);
  const b = await appli.boundingBox();
  expect([Math.round(b.x), Math.round(b.y), Math.round(b.width)]).toEqual([0, 0, page.viewportSize().width]); // tout l'écran
  await capturer(page, info, '9-plein-ecran');
  // V = valider (la facture a1 est validable : son agence est proposée).
  await page.keyboard.press('v');
  await attendreFacture(page, 'FA-2026-0300');
  expect(await appelsVers(page, '/validation')).toEqual([{ facture_id: 'a1', decision: 'accepter', chantier_id: null, etablissement_id: 'ag1' }]);
  await expect(page.locator('[data-role="focus-restantes"]')).toHaveText('2 restantes');
  // V sur une facture qui ne peut pas être validée tout de suite (doublon : il faut un motif) : un message, aucune décision.
  await page.keyboard.press('V');
  await expect(page.locator('.toast').filter({ hasText: 'ne peut pas être validée tout de suite' })).toBeVisible();
  expect(await appelsVers(page, '/validation')).toHaveLength(1);
  // P = passer.
  await page.keyboard.press('p');
  await attendreFacture(page, 'FQ-100');
  // Une touche tapée dans un champ n'agit pas.
  await versVerifications(page);
  const champ = bloc(page, 'decision').locator('input').first();
  await champ.click();
  await page.keyboard.type('pvr');
  await expect(numero(page)).toContainText('FQ-100');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await champ.fill('');
  await page.locator('[data-role="focus-restantes"]').click(); // sortir du champ
  // R = refuser : la fenêtre du motif s'ouvre ; Échap ferme la fenêtre, PAS le mode.
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toContainText('Refuser la facture');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(appli).toHaveClass(/af-focus/);
  expect(await appelsVers(page, '/validation')).toHaveLength(1);
  // Échap = sortir.
  await page.locator('[data-role="focus-restantes"]').click();
  await page.keyboard.press('Escape');
  await expect(appli).not.toHaveClass(/af-focus/);
  await expect(page.locator('[data-role="appli-entete"]')).toBeVisible();
  await expect(page.locator('[data-role="focus-entete"]')).toBeHidden();
  // Après la sortie : les touches ne font plus rien (aucun écouteur ne reste).
  await page.locator('[data-role="appli-entete"] .af-chevron').click({ force: true });
  await page.keyboard.press('p');
  await page.keyboard.press('v');
  await page.keyboard.press('r');
  await page.waitForTimeout(900); // plus long que l'animation de « Passer » (550 ms) et de sortie (700 ms)
  await expect(numero(page)).toContainText('FQ-100');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await appelsVers(page, '/validation')).toHaveLength(1);
  // Le bouton « Quitter le plein écran » sort aussi du mode ; quitter l'écran en plein écran ne laisse rien derrière.
  await page.locator('[data-action="plein-ecran"]').click();
  await expect(appli).toHaveClass(/af-focus/);
  await page.locator('[data-action="quitter-plein-ecran"]').click();
  await expect(appli).not.toHaveClass(/af-focus/);
  await page.locator('[data-action="plein-ecran"]').click();
  await page.evaluate(() => { location.hash = '#/achatsfactures/tableau'; });
  await expect(page.locator('[data-role="tableau-factures"]')).toBeVisible();
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/achatsfactures\/tableau$/);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('10 fin de pile : le bilan du jour (traitées, validées avec le montant, refusées) et un lien vers le tableau de bord', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await accepter(page);
  await attendreFacture(page, 'FA-2026-0300');
  await refuser(page, 'Doublon d’une facture déjà reçue.');
  await attendreFacture(page, 'FQ-100');
  await expect(restantes(page)).toHaveText('1 restante');
  await refuser(page);
  const fin = page.locator('[data-role="pile-finie"]');
  await expect(fin).toContainText('Toutes les factures sont traitées');
  await expect(fin.locator('[data-role="bilan"]')).toHaveText(/^3 factures traitées aujourd’hui · 1 validée \(1\s541,40\s€\) · 2 refusées$/);
  await expect(restantes(page)).toBeHidden();
  await expect(page.locator('[data-action="passer"]')).toHaveCount(0);
  await expect(fin.locator('[data-action="vers-liste"]')).toBeVisible();
  const lienTableau = fin.locator('[data-action="vers-tableau"]');
  await expect(lienTableau).toHaveText('Voir le tableau de bord');
  await capturer(page, info, '10-bilan-fin-de-pile');
  await lienTableau.click();
  await expect(page).toHaveURL(/achatsfactures\/tableau$/);
  await expect(page.getByRole('heading', { name: 'Tableau de bord des factures', level: 1 })).toBeVisible();
});

test('10 fin de pile : cas vide dès l\'ouverture (rien à valider, rien de traité aujourd\'hui)', async ({ page }, info) => {
  await ouvrirAppli(page, { sansAValider: true });
  const fin = page.locator('[data-role="pile-finie"]');
  await expect(fin).toContainText('Toutes les factures sont traitées');
  await expect(fin.locator('[data-role="bilan"]')).toHaveText('Aucune facture traitée aujourd’hui.');
  await expect(fin.locator('[data-action="vers-tableau"]')).toBeVisible();
  await capturer(page, info, '10-fin-cas-vide');
});

/** Note, à chaque changement de classe, l'animation réellement jouée par le navigateur (nom, durée, courbe) pour le tampon, la carte et le compteur. */
async function espionnerAnimations(page) {
  await page.evaluate(() => {
    window.__anims = [];
    const noter = (quoi, el) => { const s = getComputedStyle(el); if (s.animationName !== 'none') window.__anims.push({ quoi, nom: s.animationName, duree: s.animationDuration, courbe: s.animationTimingFunction }); };
    const voir = () => {
      document.querySelectorAll('.af-sort-valide .af-tampon-v, .af-sort-refuse .af-tampon-r').forEach((e) => noter('tampon', e));
      document.querySelectorAll('.af-sort-valide .af-carte, .af-sort-refuse .af-carte, .af-sort-passe .af-carte').forEach((e) => noter('sortie', e));
      document.querySelectorAll('.af-carte.af-entre').forEach((e) => noter('entree', e));
      document.querySelectorAll('[data-role="pile-restantes"].af-pulse').forEach((e) => noter('compteur', e));
    };
    new MutationObserver(voir).observe(document.querySelector('[data-role="appli-factures"]'), { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  });
}
const DUREE_PASSER_MAX_SANS_ANIMATION = 5000; // large : seule l'absence d'animation est vérifiée finement (aucune animation notée)
const animations = (page, quoi) => page.evaluate((q) => [...new Map(window.__anims.filter((a) => a.quoi === q).map((a) => [JSON.stringify(a), a])).values()], quoi);

test('11 animations de la maquette : tampon (−12°, 1,6× à 1×, 350 ms), glissement à gauche 700 ms, « Passer » 550 ms, suivante 450 ms, « Annuler » 3,2 s, compteur ×1,18 en 500 ms, fin 500 ms ; animations réduites respectées', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await espionnerAnimations(page);
  // Le tampon au repos : invisible, tourné de −12°, agrandi 1,6 fois.
  const matrice = (sel) => page.locator(sel).evaluate((e) => { const m = new DOMMatrixReadOnly(getComputedStyle(e).transform); return { echelle: Math.hypot(m.a, m.b), angle: Math.atan2(m.b, m.a) * 180 / Math.PI, opacite: getComputedStyle(e).opacity }; });
  const repos = await matrice('[data-role="tampon-validee"]');
  expect(repos.echelle).toBeCloseTo(1.6, 2);
  expect(repos.angle).toBeCloseTo(-12, 1);
  expect(repos.opacite).toBe('0');
  await expect(page.locator('[data-role="tampon-validee"]')).toHaveText('Validée');
  await expect(page.locator('[data-role="tampon-refusee"]')).toHaveText('Refusée');
  // « Passer » : la facture descend en 550 ms, la suivante arrive en 450 ms.
  const t0 = Date.now();
  await passer(page);
  await attendreFacture(page, 'FA-2026-0300');
  expect(Date.now() - t0).toBeGreaterThanOrEqual(500);
  expect(await animations(page, 'sortie')).toEqual([{ quoi: 'sortie', nom: 'af-sort-bas', duree: '0.55s', courbe: 'ease' }]);
  expect(await animations(page, 'entree')).toEqual([{ quoi: 'entree', nom: 'af-entre', duree: '0.45s', courbe: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }]);
  expect(await animations(page, 'compteur')).toEqual([]); // « Passer » ne fait pas battre le compteur
  await passer(page); await attendreFacture(page, 'FQ-100');
  await passer(page); await attendreFacture(page, 'FA-2026-0412');
  // Valider : tampon « Validée » en 350 ms, glissement à gauche en 700 ms, compteur qui bat en 500 ms.
  await page.evaluate(() => { window.__anims = []; });
  await accepter(page);
  const message = page.locator('.toast').filter({ hasText: 'Facture acceptée' });
  await expect(message).toBeVisible();
  const debut = Date.now();
  await expect(message.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await attendreFacture(page, 'FA-2026-0300');
  await expect(restantes(page)).toHaveText('2 restantes');
  expect(await animations(page, 'tampon')).toEqual([{ quoi: 'tampon', nom: 'af-tampon', duree: '0.35s', courbe: 'ease' }]);
  expect(await animations(page, 'sortie')).toEqual([{ quoi: 'sortie', nom: 'af-sort-gauche', duree: '0.7s', courbe: 'ease' }]);
  expect(await animations(page, 'compteur')).toEqual([{ quoi: 'compteur', nom: 'af-pulse', duree: '0.5s', courbe: 'ease' }]);
  // Le message « Annuler » reste 3,2 s.
  await expect(page.locator('.toast:not(.sortie)').filter({ hasText: 'Facture acceptée' })).toHaveCount(0, { timeout: 6000 });
  const duree = Date.now() - debut;
  expect(duree).toBeGreaterThanOrEqual(2700);
  expect(duree).toBeLessThanOrEqual(4300);
  // Capture du tampon posé (animation figée à la fin du tampon, avant le glissement), puis du compteur à son plus gros.
  await page.evaluate(() => {
    document.querySelector('[data-role="pile-cartes"]').classList.add('af-sort-refuse');
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = a.animationName === 'af-tampon' ? 350 : 0; }
  });
  const pose = await matrice('[data-role="tampon-refusee"]');
  expect(pose.echelle).toBeCloseTo(1, 2);
  expect(pose.angle).toBeCloseTo(-12, 1);
  expect(pose.opacite).toBe('1');
  await capturer(page, info, '11-tampon-refusee', { animations: 'allow' });
  await page.evaluate(() => { for (const a of document.getAnimations()) a.cancel(); document.querySelector('[data-role="pile-cartes"]').classList.remove('af-sort-refuse'); });
  const battement = await page.evaluate(() => {
    const p = document.querySelector('[data-role="pile-restantes"]');
    p.classList.add('af-pulse');
    const a = p.getAnimations()[0]; a.pause(); a.currentTime = 200; // 40 % de 500 ms : le plus gros
    const m = new DOMMatrixReadOnly(getComputedStyle(p).transform); a.cancel(); p.classList.remove('af-pulse');
    return m.a;
  });
  expect(battement).toBeCloseTo(1.18, 2);
  // « Annuler » du message : la facture validée revient (action métier `rouvrir`), le compteur remonte.
  await accepterPuisAnnuler(page);
  // Refuser : tampon « Refusée », même glissement.
  await page.evaluate(() => { window.__anims = []; });
  await refuser(page, 'Doublon d’une facture déjà reçue.');
  await expect(page.locator('.toast').filter({ hasText: 'Facture refusée' }).getByRole('button', { name: 'Annuler' })).toBeVisible();
  await attendreFacture(page, 'FQ-100');
  expect(await animations(page, 'tampon')).toEqual([{ quoi: 'tampon', nom: 'af-tampon', duree: '0.35s', courbe: 'ease' }]);
  expect(await animations(page, 'sortie')).toEqual([{ quoi: 'sortie', nom: 'af-sort-gauche', duree: '0.7s', courbe: 'ease' }]);
  // Animations réduites (réglage de l'appareil) : aucune animation, et on n'attend pas.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.__anims = []; });
  const t1 = Date.now();
  await passer(page); // il ne reste que cette facture : elle revient tout de suite, sans descendre
  await expect(page.locator('[data-role="pile-cartes"]:not([class*="af-sort"]) [data-role="pile-facture"]:not(.af-attend)')).toBeVisible();
  await attendreFacture(page, 'FQ-100');
  expect(await page.evaluate(() => window.__anims)).toEqual([]);
  expect(Date.now() - t1).toBeLessThan(DUREE_PASSER_MAX_SANS_ANIMATION);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Écran de fin : il arrive en 500 ms.
  await refuser(page);
  const fin = page.locator('[data-role="pile-finie"]');
  await expect(fin).toBeVisible();
  await accepterDernier(page, fin);
});

/** Valide la facture affichée (a14 demande un motif : c'est un doublon), puis clique « Annuler » dans le message : elle revient, à valider. */
async function accepterPuisAnnuler(page) {
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-champ="motif-acceptation"]').fill('Vérifié avec le fournisseur : ce n’est pas un doublon.');
  await bloc(page, 'decision').locator('[data-action="accepter"]').click();
  const message = page.locator('.toast').filter({ hasText: 'Facture acceptée' });
  await message.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Décision annulée : la facture est de nouveau à valider' })).toBeVisible();
  await attendreFacture(page, 'FA-2026-0300');
  await expect(restantes(page)).toHaveText('2 restantes');
  const actions = await appelsVers(page, '/actions');
  expect(actions).toEqual([{ facture_id: 'a14', motif: 'Décision annulée tout de suite depuis la pile (bouton « Annuler »).', action: 'rouvrir' }]);
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
}
/** L'écran de fin joue l'animation d'arrivée de 500 ms ; le bilan compte ce qui reste décidé (a1 validée ; a14 et a12 refusées). */
async function accepterDernier(page, fin) {
  const style = await fin.evaluate((e) => { const s = getComputedStyle(e); return { nom: s.animationName, duree: s.animationDuration }; });
  expect(style).toEqual({ nom: 'af-entre', duree: '0.5s' });
  await expect(fin.locator('[data-role="bilan"]')).toHaveText(/^3 factures traitées aujourd’hui · 1 validée \(1\s541,40\s€\) · 2 refusées$/);
}

test('12 la règle générale tient sur les trois écrans de l\'appli : même haut de page, et la roue dentée ne montre QUE les réglages des factures', async ({ page }, info) => {
  await ouvrirAppli(page, {}, 'achatsfactures/reglages');
  const reglages = page.locator('[data-role="reglages-factures"]');
  await expect(reglages.getByRole('heading', { name: 'Réglages des factures', level: 1 })).toBeVisible();
  await expect(reglages.locator('.carte-section')).toHaveCount(1); // seulement la section des factures (« Sauvegarde »), rien des autres modules ni de l'espace
  await expect(reglages.locator('#reglages-export-achatsfactures')).toContainText('Sauvegarde');
  await expect(reglages.locator('[data-action="retour-pile"]')).toHaveText('Retour à la pile');
  await capturer(page, info, '12-reglages-des-factures-seulement');
  for (const route of ['reglages', 'tableau', 'pile']) {
    await page.evaluate((r) => { location.hash = `#/achatsfactures/${r}`; }, route);
    await expect(page.locator(`[data-role="appli-factures"][data-vue="${route}"]`)).toBeVisible();
    const entete = page.locator('[data-role="appli-entete"]');
    await expect(entete.locator('.af-ariane > *')).toHaveCount(3); // maison, chevron, nom
    await expect(entete.locator('[data-action="accueil"]')).toBeVisible();
    await expect(entete.locator('[data-action="vers-pile"]')).toHaveText('Factures');
    const outils = await entete.locator('[data-role="appli-outils"] > [data-action]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.dataset.action));
    expect(outils.slice(-2), route).toEqual(['tableau-de-bord', 'reglages-factures']);
    await expect(page.locator('.coquille .menu')).toBeHidden();
    await expect(page.locator('.coquille .barre-haut')).toBeHidden();
    expect(await sansDefilementHorizontal(page), route).toBe(true);
  }
  // « Retour à la pile » depuis les réglages ramène à l'accueil de l'appli, pas à l'accueil de l'espace.
  await page.evaluate(() => { location.hash = '#/achatsfactures/reglages'; });
  await page.locator('[data-role="reglages-factures"] [data-action="retour-pile"]').click();
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  // Hors de l'appli (la liste des factures), la coque retrouve son menu.
  await page.evaluate(() => { location.hash = '#/achatsfactures/liste'; });
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
  await expect(page.locator(estTelephone(page) ? '.coquille .barre-haut' : '.coquille .menu')).toBeVisible();
});

// ================================================================ corrections de la relecture (27/11/2026) : un test par défaut, « C<numéro> »
const pageExaminer = (page) => page.locator('[data-role="pile"] .page-examiner');
/** Marque la page Examiner affichée : si elle est remontée (au lieu d'être relue en silence), la marque disparaît. */
const marquer = (page) => pageExaminer(page).evaluate((e) => { e.dataset.temoin = 'oui'; });

test('C1 double clic sur « Annuler » du message : un seul « rouvrir » part, la facture revient une seule fois', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await accepter(page);
  await page.locator('.toast').filter({ hasText: 'Facture acceptée' }).getByRole('button', { name: 'Annuler' }).dblclick();
  await expect(page.locator('.toast').filter({ hasText: 'Décision annulée : la facture est de nouveau à valider' })).toBeVisible();
  await attendreFacture(page, 'FA-2026-0412');
  await expect(restantes(page)).toHaveText('3 restantes');
  await page.waitForTimeout(500); // plus long que la sortie du message (250 ms) : un second envoi serait déjà parti
  expect(await appelsVers(page, '/actions')).toEqual([{ facture_id: 'a1', motif: 'Décision annulée tout de suite depuis la pile (bouton « Annuler »).', action: 'rouvrir' }]);
  await expect(page.locator('.toast').filter({ hasText: 'Décision annulée' })).toHaveCount(1);
  await expect(page.locator('.toast-erreur')).toHaveCount(0);
  await capturer(page, info, 'C1-annuler-double-clic');
});

test('C2 une écriture dans le volet relit la facture EN SILENCE : le chantier et le motif déjà choisis restent, la page n\'est pas remontée, le focus reste dans le volet', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await passer(page);
  await attendreFacture(page, 'FA-2026-0300'); // un doublon : il demande un motif
  await versVerifications(page);
  const decision = bloc(page, 'decision');
  await decision.locator('[data-champ="motif-acceptation"]').fill('Vérifié avec le fournisseur : ce n’est pas un doublon.');
  await decision.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Villa Orvaline/ }).click();
  await expect(decision.getByRole('combobox').first()).toHaveValue(/Villa Orvaline/);
  await marquer(page);
  const lecturesAvant = await lecturesFacture(page, 'a14');
  // Dans le volet : on modifie le chantier (son client).
  await ouvrirVolet(page);
  await volet(page).locator('[data-role="volet-onglets"] button').nth(1).click();
  await volet(page).locator('[data-role="volet-liste"] button', { hasText: 'Villa Orvaline' }).click();
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await fiche(page).locator('[data-champ="client"]').fill('Nouveau client fictif');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect(fiche(page).locator('[data-ligne="client"] dd')).toHaveText('Nouveau client fictif');
  await expect.poll(() => lecturesFacture(page, 'a14')).toBeGreaterThan(lecturesAvant); // la facture affichée a bien été relue
  await expect(page.locator('[data-role="pile"] [data-etat="chargement"]')).toHaveCount(0);
  // Le focus est sur le titre de la fiche, dans le volet : il n'est pas parti derrière.
  expect(await focusDans(page)).toMatchObject({ volet: true, role: 'fiche-titre' });
  await capturer(page, info, 'C2-volet-apres-ecriture');
  await volet(page).locator('[data-action="fermer-volet"]').click();
  // La page Examiner est la même (pas remontée) et rien de ce qui était choisi n'a été effacé.
  await expect(pageExaminer(page)).toHaveAttribute('data-temoin', 'oui');
  await expect(numero(page)).toContainText('FA-2026-0300');
  await expect(decision.getByRole('combobox').first()).toHaveValue(/Villa Orvaline/);
  await expect(decision.locator('[data-champ="motif-acceptation"]')).toHaveValue('Vérifié avec le fournisseur : ce n’est pas un doublon.');
  await expect(decision.locator('[data-action="accepter"]')).toBeEnabled();
  await capturer(page, info, 'C2-choix-gardes');
});

test('C4 « Annuler » pendant qu\'une décision s\'écrit sur la facture suivante : cette écriture va au bout (son résultat n\'est pas perdu), puis la facture rouverte revient', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // sans animation : le message « Annuler » (3,2 s) est encore là quand la décision suivante s'écrit
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await passer(page); await attendreFacture(page, 'FA-2026-0300');
  await passer(page); await attendreFacture(page, 'FQ-100'); // ordre de la séance : FQ-100, puis FA-2026-0412, puis FA-2026-0300
  await retenir(page, 'validation-a1', { chemin: '/validation', factureId: 'a1' });
  await refuser(page);
  const annuler = page.locator('.toast').filter({ hasText: 'Facture refusée' }).getByRole('button', { name: 'Annuler' });
  await attendreFacture(page, 'FA-2026-0412');
  await marquer(page);
  await accepter(page); // l'écriture part, et reste en attente
  await expect(bloc(page, 'decision').locator('[data-action="accepter"]')).toBeDisabled();
  await annuler.click();
  await expect(page.locator('.toast').filter({ hasText: 'Décision annulée : la facture est de nouveau à valider' })).toBeVisible();
  // La page qui écrit n'est ni arrêtée ni remplacée.
  await expect(pageExaminer(page)).toHaveAttribute('data-temoin', 'oui');
  await expect(numero(page)).toContainText('FA-2026-0412');
  await lacher(page, 'validation-a1');
  // Sa décision aboutit, avec son message ; puis la facture rouverte est de retour dans la pile.
  await expect(page.locator('.toast').filter({ hasText: 'Facture acceptée' })).toBeVisible();
  await attendreFacture(page, 'FQ-100');
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
  await expect(restantes(page)).toHaveText('2 restantes');
  expect((await appelsVers(page, '/validation')).map((c) => [c.facture_id, c.decision])).toEqual([['a12', 'refuser'], ['a1', 'accepter']]);
  expect((await appelsVers(page, '/actions')).map((c) => [c.facture_id, c.action])).toEqual([['a12', 'rouvrir']]);
});

test('C5 volet : focus sur le premier bouton à l\'ouverture, sur le titre après chaque redessin d\'une fiche, retour au bouton d\'origine à la fermeture ; Échap ferme le volet (sauf fenêtre ouverte) ; sur téléphone c\'est une fenêtre et la page ne défile pas derrière', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  const origine = estTelephone(page) ? 'ouvrir-volet-telephone' : 'ouvrir-volet';
  const defilement = () => page.evaluate(() => getComputedStyle(document.documentElement).overflowY);
  expect(await defilement()).toBe('visible');
  await ouvrirVolet(page);
  // Ouverture : le premier bouton du volet (la liste « Fournisseurs »).
  expect(await focusDans(page)).toMatchObject({ volet: true, onglet: 'fournisseurs', balise: 'BUTTON' });
  if (estTelephone(page)) {
    await expect(volet(page)).toHaveAttribute('role', 'dialog');
    await expect(volet(page)).toHaveAttribute('aria-modal', 'true');
    expect(await defilement()).toBe('hidden'); // la page ne défile pas derrière
    // Fenêtre sur téléphone : Tab (et Maj+Tab) tourne dans le volet, sans jamais partir dans la page derrière.
    for (let i = 0; i < 12; i += 1) { await page.keyboard.press('Tab'); expect((await focusDans(page)).volet, `Tab ${i + 1}`).toBe(true); }
    for (let i = 0; i < 12; i += 1) { await page.keyboard.press('Shift+Tab'); expect((await focusDans(page)).volet, `Maj+Tab ${i + 1}`).toBe(true); }
    await volet(page).locator('[data-role="volet-onglets"] button').first().focus();
  } else {
    expect(await volet(page).getAttribute('role')).toBeNull(); // sur ordinateur la facture reste utilisable à côté : ce n'est pas une fenêtre
  }
  await capturer(page, info, 'C5-volet-focus-ouverture');
  // Changer de liste : le focus suit le bouton de la liste active ; ouvrir une fiche : son titre ; retour : le bouton de la liste.
  await volet(page).locator('[data-role="volet-onglets"] button').nth(1).click();
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Villa Orvaline');
  expect(await focusDans(page)).toMatchObject({ volet: true, onglet: 'chantiers' });
  await volet(page).locator('[data-role="volet-onglets"] button').nth(0).click();
  await volet(page).locator('[data-role="volet-liste"] button', { hasText: 'Point Q Matériaux' }).click();
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Point Q Matériaux');
  expect(await focusDans(page)).toMatchObject({ volet: true, role: 'fiche-titre' });
  await capturer(page, info, 'C5-volet-focus-fiche');
  // Une fenêtre ouverte par-dessus : Échap ferme la fenêtre, PAS le volet.
  await fiche(page).locator('[data-action="signaler-iban"]').click();
  await expect(fenetre(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(fenetre(page)).toHaveCount(0);
  await expect(volet(page)).toBeVisible();
  await expect(volet(page)).toHaveAttribute('data-vue', 'fiche');
  // Échap ferme le volet ; le focus revient au bouton d'où il a été ouvert ; la page défile de nouveau.
  await page.keyboard.press('Escape');
  await expect(volet(page)).toBeHidden();
  expect((await focusDans(page)).action).toBe(origine);
  expect(await defilement()).toBe('visible');
  // Ouvert depuis le nom du fournisseur de la facture : la croix rend le focus à ce nom.
  await page.locator('.page-examiner h1 [data-action="fiche-fournisseur"]').click();
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Point Q Matériaux');
  await volet(page).locator('[data-action="fermer-volet"]').click();
  expect((await focusDans(page)).action).toBe('fiche-fournisseur');
  // Après la fermeture, Échap ne fait plus rien (l'écouteur est retiré) et quitter l'écran volet ouvert ne laisse pas la page figée.
  await page.keyboard.press('Escape');
  await expect(numero(page)).toContainText('FA-2026-0412');
  await ouvrirVolet(page);
  await page.evaluate(() => { location.hash = '#/achatsfactures/tableau'; });
  await expect(page.locator('[data-role="tableau-factures"]')).toBeVisible();
  expect(await defilement()).toBe('visible');
});

test('C6 SIREN non lu : pas de « Nouveau fournisseur détecté » à tort ; le fournisseur est retrouvé par son nom exact (fiche et alerte IBAN), sinon « Fournisseur non reconnu »', async ({ page }, info) => {
  const sansSiren = { fournisseur_siren: null, extraction: null };
  await ouvrirAppli(page, { retouches: { a14: sansSiren, a12: sansSiren }, ibans: [{ ...IBANS[0], revoque_le: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), motif_revocation: 'Changement signalé' }] });
  await attendreFacture(page, 'FA-2026-0412');
  const nouveau = page.locator('[data-role="nouveau-fournisseur"]');
  const nonReconnu = page.locator('[data-role="fournisseur-non-reconnu"]');
  const alerte = page.locator('[data-role="alerte-iban"]');
  await expect(alerte).toBeVisible(); // SIREN lu : alerte IBAN, comme avant
  // Même fournisseur, SIREN non lu sur cette facture : retrouvé par son nom exact. Ni « nouveau », ni « non reconnu » ; l'alerte IBAN le suit.
  await passer(page); await attendreFacture(page, 'FA-2026-0300');
  await expect(alerte).toBeVisible();
  await expect(nouveau).toHaveCount(0);
  await expect(nonReconnu).toHaveCount(0);
  await page.locator('.page-examiner h1 [data-action="fiche-fournisseur"]').click();
  await expect(volet(page)).toHaveAttribute('data-vue', 'fiche'); // sa fiche, pas le formulaire « Nouveau fournisseur »
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Point Q Matériaux');
  await volet(page).locator('[data-action="fermer-volet"]').click();
  // SIREN non lu et nom inconnu : « Fournisseur non reconnu », jamais « nouveau » ; le bouton montre la liste (pas de création en double).
  await passer(page); await attendreFacture(page, 'FQ-100');
  await expect(nonReconnu).toContainText('Fournisseur non reconnu. Son SIREN n’a pas été lu sur la facture');
  await expect(nouveau).toHaveCount(0);
  await expect(alerte).toHaveCount(0);
  await capturer(page, info, 'C6-fournisseur-non-reconnu');
  await nonReconnu.locator('[data-action="voir-fournisseurs"]').click();
  await expect(volet(page)).toHaveAttribute('data-vue', 'liste');
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Point Q Matériaux');
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('C7 volet : la roue d\'une liste ne reste jamais bloquée quand on passe à une autre liste pendant sa lecture', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await ouvrirVolet(page);
  const onglets = volet(page).locator('[data-role="volet-onglets"] button');
  await retenir(page, 'chantiers', { chemin: '/rest/v1/chantiers' });
  await onglets.nth(1).click(); // Chantiers : la lecture part et attend
  await expect(volet(page).locator('[data-etat="chargement"]')).toBeVisible();
  await onglets.nth(2).click(); // Articles : lus pendant ce temps
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Ciment fictif 35 kg');
  await onglets.nth(1).click(); // retour à Chantiers : toujours en lecture
  await expect(volet(page).locator('[data-etat="chargement"]')).toBeVisible();
  await lacher(page, 'chantiers');
  await expect(volet(page).locator('[data-role="volet-liste"]')).toContainText('Villa Orvaline'); // la liste arrive : la roue s'arrête
  await expect(volet(page).locator('[data-etat="chargement"]')).toHaveCount(0);
  await capturer(page, info, 'C7-liste-chantiers-arrivee');
});

test('C9 relecture en échec après un enregistrement réussi : jamais « fiche introuvable » ; le fournisseur dit « impossible de lire » avec « Réessayer », le chantier garde ses lignes', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  // Chantier : l'enregistrement réussit, la relecture échoue. La fiche montre la nouvelle valeur, avec un mot et « Réessayer ».
  await ouvrirVolet(page);
  await volet(page).locator('[data-role="volet-onglets"] button').nth(1).click();
  await volet(page).locator('[data-role="volet-liste"] button', { hasText: 'Villa Orvaline' }).click();
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await fiche(page).locator('[data-champ="client"]').fill('Nouveau client fictif');
  await page.evaluate(() => { window.__faux.chantiersEnPanne = true; });
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect(page.locator('.toast').filter({ hasText: 'Chantier enregistré' })).toBeVisible();
  const perimee = volet(page).locator('[data-role="liste-perimee"]');
  await expect(perimee).toContainText('La liste n’a pas pu être relue');
  // « Réessayer » de cette note ne jette jamais une saisie en cours : pendant une modification, il ne fait rien.
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await fiche(page).locator('[data-champ="adresse"]').fill('Saisie en cours');
  await perimee.locator('[data-action="reessayer"]').click();
  await page.waitForTimeout(300);
  await expect(fiche(page)).toHaveAttribute('data-mode', 'modification');
  await expect(fiche(page).locator('[data-champ="adresse"]')).toHaveValue('Saisie en cours');
  await fiche(page).locator('[data-action="annuler-fiche"]').click();
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  await expect(fiche(page).locator('[data-ligne="client"] dd')).toHaveText('Nouveau client fictif');
  await expect(volet(page)).not.toContainText('introuvable');
  await capturer(page, info, 'C9-chantier-relecture-en-echec');
  await page.evaluate(() => { window.__faux.chantiersEnPanne = false; });
  await perimee.locator('[data-action="reessayer"]').click();
  await expect(perimee).toHaveCount(0);
  await expect(fiche(page).locator('[data-ligne="client"] dd')).toHaveText('Nouveau client fictif');
  // Fournisseur : l'ancien IBAN est retiré, puis la relecture échoue. Ni « introuvable », ni l'ancien IBAN encore « confirmé » : un état d'erreur, et « Réessayer ».
  await volet(page).locator('[data-action="retour-liste-volet"]').click();
  await volet(page).locator('[data-role="volet-onglets"] button').nth(0).click();
  await volet(page).locator('[data-role="volet-liste"] button', { hasText: 'Point Q Matériaux' }).click();
  await fiche(page).locator('[data-action="signaler-iban"]').click();
  await page.evaluate(() => { window.__faux.fournisseursEnPanne = true; });
  await retenir(page, 'fournisseurs', { chemin: '/rest/v1/fournisseurs' });
  await fenetre(page).getByRole('button', { name: 'Retirer l’ancien IBAN' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Ancien IBAN retiré' })).toBeVisible();
  await expect(fiche(page).locator('[data-action="signaler-iban"]')).toBeDisabled(); // pendant la relecture : pas de second signalement
  await lacher(page, 'fournisseurs');
  const erreur = volet(page).locator('[data-etat="erreur"]');
  await expect(erreur).toContainText('Impossible de lire les fournisseurs');
  await expect(volet(page)).not.toContainText('introuvable');
  await expect(volet(page)).not.toContainText('Oui, le');
  await expect(volet(page)).toHaveAttribute('data-vue', 'fiche');
  await capturer(page, info, 'C9-fournisseur-relecture-en-echec');
  await page.evaluate(() => { window.__faux.fournisseursEnPanne = false; });
  await erreur.locator('[data-action="reessayer"]').click();
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText('Point Q Matériaux');
  await expect(volet(page).locator('[data-role="alerte-iban-fiche"]')).toBeVisible();
  expect((await appelsVers(page, '/actions')).map((c) => c.action)).toEqual(['modifier_chantier', 'revoquer_iban']);
});

test('C10 les bandeaux de la facture précédente ne restent pas au-dessus de la suivante pendant qu\'elle charge', async ({ page }, info) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await passer(page); await attendreFacture(page, 'FA-2026-0300');
  await passer(page); await attendreFacture(page, 'FQ-100');
  const bandeau = page.locator('[data-role="nouveau-fournisseur"]');
  await expect(bandeau).toContainText('Ferronnerie du Verdon');
  await retenir(page, 'facture-a1', { chemin: '/rest/v1/factures', id: 'a1' });
  await passer(page);
  // La facture suivante se montre alors qu'elle charge encore (au bout de 1,5 s) : plus aucun bandeau de la précédente au-dessus.
  await expect(page.locator('[data-role="pile-facture"][data-facture="a1"]:not(.af-attend)')).toBeVisible();
  await expect(page.locator('[data-role="pile-facture"][data-facture="a1"] [data-etat="chargement"]')).toBeVisible();
  await expect(bandeau).toHaveCount(0);
  await expect(page.locator('[data-role="pile-bandeaux"] > *')).toHaveCount(0);
  await capturer(page, info, 'C10-suivante-en-chargement-sans-bandeau');
  await lacher(page, 'facture-a1');
  await attendreFacture(page, 'FA-2026-0412');
  await expect(bandeau).toHaveCount(0); // fournisseur connu : toujours rien
});

test('C11 touche V pendant qu\'une décision s\'écrit ou que la facture charge : aucun message rouge trompeur ; il reste dit quand il manque vraiment quelque chose', async ({ page }) => {
  await ouvrirAppli(page);
  await attendreFacture(page, 'FA-2026-0412');
  await page.locator('[data-action="plein-ecran"]').click();
  await expect(page.locator('[data-role="appli-factures"]')).toHaveClass(/af-focus/);
  const rouge = page.locator('.toast-erreur');
  await retenir(page, 'validation-a1', { chemin: '/validation', factureId: 'a1' });
  await retenir(page, 'facture-a14', { chemin: '/rest/v1/factures', id: 'a14' });
  // Pendant l'écriture : V une première fois lance la décision ; V de nouveau ne dit rien.
  await page.keyboard.press('v');
  await expect.poll(async () => (await appelsVers(page, '/validation')).length).toBe(1);
  await page.keyboard.press('v');
  await page.waitForTimeout(300);
  await expect(rouge).toHaveCount(0);
  expect(await appelsVers(page, '/validation')).toHaveLength(1);
  await lacher(page, 'validation-a1');
  // Pendant le chargement de la facture suivante : V ne dit rien non plus.
  await expect(page.locator('[data-role="pile-facture"][data-facture="a14"]')).toHaveCount(1);
  await page.keyboard.press('v');
  await page.waitForTimeout(300);
  await expect(rouge).toHaveCount(0);
  await lacher(page, 'facture-a14');
  await attendreFacture(page, 'FA-2026-0300');
  await page.keyboard.press('v'); // facture lue, mais il manque le motif (doublon) : là, le message est juste
  await expect(rouge.filter({ hasText: 'ne peut pas être validée tout de suite' })).toBeVisible();
  expect(await appelsVers(page, '/validation')).toHaveLength(1);
});

test('C1 bis message avec « Annuler » : un clic pendant le fondu de sortie (250 ms) compte encore, et l\'action ne part qu\'une fois', async ({ page }) => {
  await ouvrirAppli(page);
  const r = await page.evaluate(async () => {
    const { toast } = await import(new URL('js/os/ui.js', document.baseURI).href);
    let n = 0;
    toast('Message d’essai', { duree: 30, action: { libelle: 'Annuler', surClic: () => { n += 1; } } });
    const message = [...document.querySelectorAll('.toast')].find((t) => t.textContent.includes('Message d’essai'));
    const debut = Date.now();
    while (!message.classList.contains('sortie') && Date.now() - debut < 2000) await new Promise((ok) => setTimeout(ok, 5));
    const enSortie = message.classList.contains('sortie') && message.isConnected; // le message s'efface, il est encore à l'écran
    const bouton = message.querySelector('[data-action="toast-action"]');
    bouton.click(); bouton.click(); bouton.click();
    return { enSortie, n };
  });
  expect(r).toEqual({ enSortie: true, n: 1 });
});

// Texte long (règle commune du 27/11/2026, docs/consignes-ui.md « Texte long : liste et fiche ») : T1 dans les listes du volet, 2 lignes au plus puis « … », texte entier au survol ;
// T2 au clic, la fiche montre le texte entier, jamais coupé. Données fictives aux noms très longs.
const LONG_FO = 'Société fictive des matériaux de construction et de la quincaillerie générale du plateau de Valmoran et des communes voisines';
const LONG_CH = 'Rénovation complète fictive de la grande maison de maître avec extension, piscine, pool house et aménagement paysager du parc';
const LONG_CLIENT = 'Client fictif au nom particulièrement long pour vérifier le retour à la ligne du détail, puis sa coupe après deux lignes, même sur un grand écran d’ordinateur';
const LONG_AR = 'Ciment fictif gris haute résistance pour fondations, dalles, chapes et maçonnerie courante, sac de trente-cinq kilogrammes';
const optionsLongues = () => ({
  fournisseurs: [{ ...FOURNISSEURS[0], nom: LONG_FO }],
  chantiers: [{ ...CHANTIERS[0], nom: LONG_CH, client: LONG_CLIENT, adresse: `${'12 chemin fictif des essais, lieu-dit très long, '.repeat(2)}75000 Valmoran` }],
  articles: [{ ...ARTICLES[0], designation: LONG_AR, reference: 'REF-FICTIVE-TRES-LONGUE-0123456789-ABCDEFGHIJ' }],
});
/** Pour chaque élément : nombre de lignes affichées (hauteur / hauteur d'une ligne), coupé ou non, et texte. */
const lignesDe = (loc) => loc.evaluateAll((els) => els.map((e) => { const s = getComputedStyle(e); const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
  return { lignes: Math.round(e.getBoundingClientRect().height / lh), coupe: e.scrollHeight > e.clientHeight + 1, texte: e.textContent }; }));

test('T1 texte long (règle commune) : dans les listes Fournisseurs, Chantiers et Articles, le titre et le détail vont à la ligne, 2 lignes au plus puis « … », le texte entier au survol', async ({ page }, info) => {
  await ouvrirAppli(page, optionsLongues());
  await attendreFacture(page, 'FA-2026-0412');
  await ouvrirVolet(page);
  const onglets = volet(page).locator('[data-role="volet-onglets"] button');
  const cas = [[0, LONG_FO, null], [1, LONG_CH, `En cours · ${LONG_CLIENT}`], [2, LONG_AR, null]];
  for (const [rang, titre, detail] of cas) {
    await onglets.nth(rang).click();
    const bouton = volet(page).locator('[data-role="volet-liste"] button.af-ligne').first();
    await expect(bouton.locator('[data-role="ligne-titre"]')).toHaveText(titre);
    const [t] = await lignesDe(bouton.locator('[data-role="ligne-titre"]'));
    expect(t.lignes).toBe(2); // deux lignes, pas une seule
    expect(t.coupe).toBe(true); // la suite est cachée derrière « … »
    expect(await bouton.locator('[data-role="ligne-titre"]').evaluate((e) => getComputedStyle(e).webkitLineClamp)).toBe('2');
    const [d] = await lignesDe(bouton.locator('[data-role="ligne-detail"]'));
    expect(d.lignes).toBeLessThanOrEqual(2);
    expect(await bouton.locator('[data-role="ligne-detail"]').evaluate((e) => getComputedStyle(e).webkitLineClamp)).toBe('2');
    if (detail) expect(d).toMatchObject({ lignes: 2, coupe: true }); // le détail long (chantier) est coupé après 2 lignes, puis « … »
    const infobulle = await bouton.getAttribute('title');
    expect(infobulle.split('\n')[0]).toBe(titre); // le texte entier au survol
    if (detail) expect(infobulle).toContain(detail);
    if (rang === 0) await capturer(page, info, 'T1-liste-fournisseurs-texte-long');
    if (rang === 1) await capturer(page, info, 'T1-liste-chantiers-texte-long');
    if (rang === 2) await capturer(page, info, 'T1-liste-articles-texte-long');
  }
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('T2 texte long (règle commune) : au clic la fiche s\'ouvre et montre le texte entier, jamais coupé (fournisseur, chantier, article) ; en modification la mise en page ne bouge pas, même avec des textes longs', async ({ page }, info) => {
  await ouvrirAppli(page, optionsLongues());
  await attendreFacture(page, 'FA-2026-0412');
  await ouvrirVolet(page);
  const onglets = volet(page).locator('[data-role="volet-onglets"] button');
  const ouvrir = async (rang) => { await onglets.nth(rang).click(); await volet(page).locator('[data-role="volet-liste"] button.af-ligne').first().click(); };
  const entiers = async (loc) => (await lignesDe(loc)).filter((x) => x.coupe || false);
  // Fournisseur : le titre et la valeur « Nom » entiers.
  await ouvrir(0);
  await expect(volet(page).locator('[data-role="fiche-titre"]')).toHaveText(LONG_FO);
  await expect(fiche(page).locator('[data-ligne="nom"] .af-valeur')).toHaveText(LONG_FO);
  expect((await lignesDe(fiche(page).locator('[data-ligne="nom"] .af-valeur')))[0].lignes).toBeGreaterThan(1); // il va à la ligne
  expect(await entiers(fiche(page).locator('.af-valeur, dt'))).toEqual([]);
  expect(await coupes(fiche(page).locator('.af-valeur, dt'))).toEqual([]);
  await capturer(page, info, 'T2-fiche-fournisseur-texte-entier');
  // Chantier : nom, client et adresse entiers ; en modification, la ligne « Code » (courte) ne bouge pas de hauteur.
  await volet(page).locator('[data-action="retour-liste-volet"]').click();
  await ouvrir(1);
  await expect(fiche(page).locator('[data-ligne="nom"] .af-valeur')).toHaveText(LONG_CH);
  await expect(fiche(page).locator('[data-ligne="client"] .af-valeur')).toHaveText(LONG_CLIENT);
  expect(await entiers(fiche(page).locator('.af-valeur, dt'))).toEqual([]);
  expect(await coupes(fiche(page).locator('.af-valeur, dt'))).toEqual([]);
  await capturer(page, info, 'T2-fiche-chantier-texte-entier');
  // Positions relatives à la première ligne : sur téléphone, le volet défile quand le focus entre dans le premier champ (ce n'est pas la mise en page qui bouge).
  const relatives = async () => { const b = await boites(fiche(page).locator('.af-fiche-ligne')); return b.map((x) => ({ ...x, y: x.y - b[0].y })); };
  const lignesAvant = await relatives();
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await expect(fiche(page).locator('textarea[data-champ="nom"]')).toHaveValue(LONG_CH); // valeur longue : champ sur plusieurs lignes, texte entier
  await expect(fiche(page).locator('input[data-champ="code"]')).toHaveValue('CH-1'); // valeur courte : champ d'une ligne, comme avant
  expect(await relatives()).toEqual(lignesAvant); // la mise en page ne bouge pas, même avec des textes longs
  await capturer(page, info, 'T2-fiche-chantier-modification-texte-long');
  // Un texte collé sur plusieurs lignes est enregistré sur UNE ligne (aucun retour à la ligne n'arrive dans la base).
  await fiche(page).locator('textarea[data-champ="nom"]').fill('Nom fictif\nsur deux lignes');
  await fiche(page).locator('[data-action="enregistrer-fiche"]').click();
  await expect.poll(async () => (await appelsVers(page, '/actions')).find((c) => c.action === 'modifier_chantier')?.champs?.nom).toBe('Nom fictif sur deux lignes');
  await expect(fiche(page)).toHaveAttribute('data-mode', 'lecture');
  // Article : la désignation entière.
  await volet(page).locator('[data-action="retour-liste-volet"]').click();
  await ouvrir(2);
  await expect(fiche(page).locator('[data-ligne="designation"] .af-valeur')).toHaveText(LONG_AR);
  expect(await entiers(fiche(page).locator('.af-valeur, dt'))).toEqual([]);
  await capturer(page, info, 'T2-fiche-article-texte-entier');
  expect(await sansDefilementHorizontal(page)).toBe(true);
});
