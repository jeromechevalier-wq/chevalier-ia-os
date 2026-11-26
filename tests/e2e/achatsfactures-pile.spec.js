// Module Achats « Factures » : vue « Valider à la suite » (route achatsfactures/pile, 26/11/2026). Un test par critère (le nom commence par son numéro).
// Aucun réseau réel : même faux réseau que la page Examiner (crochet de test `window.__accesBase`, émulateurs seulement) et un PDF fictif fabriqué ici. Fausses données : tests/_donnees-achatsfactures.js.
//  P1 une facture à la fois, la plus ancienne d'abord, avec la page Examiner complète ; « Passer » la remet en fin de pile sans rien écrire ;
//  P2 après une acceptation réussie, la suivante s'affiche toute seule (même adresse, compteur à jour) ; P3 refus du serveur : on reste sur la même facture avec le message ;
//  P4 plus rien à valider : « Toutes les factures sont traitées » et le bouton vers la liste ; P5 cas vide à l'ouverture ; P6 accès depuis la liste, menu inchangé ; P7 téléphone.
// Captures dans tests/e2e/captures/achatsfactures-pile/ (non commitées), nommées avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone } from './outils.js';
import { listeComplete } from '../_donnees-achatsfactures.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatsfactures-pile/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
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

const SIRET_PP = '50000000500008';
const AGENCES = [{ id: 'ag1', fournisseur_id: 'fo1', siret: SIRET_PP, nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null }];
const FOURNISSEURS = [{ id: 'fo1', siren: SIRET_PP.slice(0, 9), nom: 'Point Q Matériaux', statut: 'actif' }];
const CHANTIERS = [{ id: 'c1', nom: 'Villa Orvaline', client: 'Client fictif', adresse: '1 rue des essais 75000 Valmoran', statut: 'en_cours', code: 'CH-1', archive: false }];
const LIGNES_A1 = [1, 2, 3].map((p) => ({ position: p, reference_fournisseur: `REF-${p}`, designation: `Article fictif ${p}`, quantite: p, unite: 'u', prix_unitaire_ht: 100, remise_pct: 0, montant_ht: 100 * p, taux_tva: 20 }));

/** Trois factures à valider (a1 la plus ancienne, puis a14, puis a12), plus des factures déjà décidées (dont h9, dont a14 est le doublon). */
const ARRIVEES = { a1: '2026-11-18T08:00:00Z', a14: '2026-11-19T08:00:00Z', a12: '2026-11-20T08:00:00Z' };
const lignesTable = ({ sansAValider = false } = {}) => listeComplete()
  .filter((f) => (f.statut === 'a_valider' ? !sansAValider && f.id in ARRIVEES : true))
  .map((f) => { const { chantiers, etablissements_fournisseur, ...r } = f;
    return { ...r, created_at: ARRIVEES[f.id] ?? r.created_at, chantier_id: null, etablissement_id: null, fichier_path: `espace-essai/${f.id}.pdf`, courriel_id: null, alertes_a_la_decision: null, motif_acceptation: null, archivee_par: null }; });

/** Faux réseau posé AVANT le chargement : lectures filtrées comme le ferait la base, stockage, tickets et webhooks. `options` : { sansAValider, refusValidation, lectureEnPanne }. */
async function poserFauxReseau(page, options = {}) {
  await page.addInitScript(({ factures, chantiers, agences, fournisseurs, lignesA1, refusValidation, lectureEnPanne }) => {
    const faux = { factures: structuredClone(factures), chantiers, agences, fournisseurs, refusValidation, lectureEnPanne };
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
      window.__appels.push({ methode: init.method, chemin: u.pathname, corps });
      if (u.pathname === '/rest/v1/factures') {
        if (faux.lectureEnPanne) return rep({ message: 'panne' }, 500);
        const select = u.searchParams.get('select') ?? '';
        if (select === 'id,extraction') return liste(faux.factures.filter((f) => f.statut === 'a_valider').map((f) => ({ id: f.id, extraction: f.extraction })));
        return liste(trier(filtre(faux.factures, u, ['id', 'statut', 'fournisseur_siren', 'iban_normalise']), u).map(({ extraction, ...r }) => (select.includes('extraction') ? { extraction, ...r } : r)));
      }
      if (u.pathname === '/rest/v1/chantiers') return liste(filtre(faux.chantiers, u, ['id']));
      if (u.pathname === '/rest/v1/etablissements_fournisseur') return liste(faux.agences);
      if (u.pathname === '/rest/v1/fournisseurs') return liste(faux.fournisseurs);
      if (u.pathname === '/rest/v1/courriels_recus') return liste([]);
      if (u.pathname === '/rest/v1/lignes_facture') return liste(u.searchParams.get('facture_id') === 'eq.a1' ? lignesA1 : []);
      if (u.pathname === '/rest/v1/ibans_confirmes') return liste([]);
      if (u.pathname === '/rest/v1/rpc/lister_favoris_os') return rep([]);
      if (u.pathname === '/rest/v1/rpc/demander_ticket_n8n') return rep('ticket-essai');
      if (u.pathname.startsWith('/storage/v1/object/sign/')) return rep({ signedURL: '/object/sign/factures/fichier.pdf?token=essai' });
      const f = corps ? faux.factures.find((x) => x.id === corps.facture_id) : null;
      if (u.pathname === '/validation') {
        if (faux.refusValidation) return rep({ ok: false, erreur: faux.refusValidation }, 400);
        if (corps.decision === 'accepter') Object.assign(f, { statut: 'acceptee', etablissement_id: corps.etablissement_id, date_decision: '2026-11-25T10:00:00Z', decide_par: 'test@exemple.example' });
        else Object.assign(f, { statut: 'refusee', motif_refus: corps.motif, date_decision: '2026-11-25T10:00:00Z', decide_par: 'test@exemple.example' });
        return rep({ ok: true });
      }
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { factures: lignesTable(options), chantiers: CHANTIERS, agences: AGENCES, fournisseurs: FOURNISSEURS, lignesA1: LIGNES_A1, refusValidation: '', lectureEnPanne: false, ...options });
  await page.route('**/storage/v1/object/sign/**', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: pdfFictif() }));
}
const appelsVers = (page, chemin) => page.evaluate((c) => window.__appels.filter((a) => a.chemin === c).map((a) => a.corps), chemin);

async function ouvrirPile(page, options) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page, options);
  await connecter(page, undefined, { route: 'achatsfactures/pile' });
  await expect(page.locator('[data-etat="chargement"]')).toHaveCount(0);
}
const bloc = (page, nom) => page.locator(`[data-bloc="${nom}"]`);
const numero = (page) => page.locator('.page-examiner .compteur-liste');
const restantes = (page) => page.locator('[data-role="pile-restantes"]');
async function versVerifications(page) { if (estTelephone(page)) await page.locator('[data-onglet="verifications"]').click(); }
/** Attend que la facture `num` soit affichée et lue (plus de chargement). */
async function attendreFacture(page, num) {
  await expect(numero(page)).toContainText(num);
  await expect(page.locator('[data-role="pile"] [data-etat="chargement"]')).toHaveCount(0);
}
async function refuser(page, motif = 'Facture refusée pour essai') {
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="refuser"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.locator('[data-champ="motif"]').fill(motif);
  await fenetre.getByRole('button', { name: 'Refuser' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('P1 une facture à la fois, la plus ancienne d\'abord, avec PDF, montants et décision ; « Passer » la met en fin de pile sans rien écrire', async ({ page }, info) => {
  await ouvrirPile(page);
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  await attendreFacture(page, 'FA-2026-0412'); // a1, arrivée la première
  await expect(page.getByRole('heading', { name: 'Point Q Matériaux', level: 1 })).toBeVisible();
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
  await expect(restantes(page)).toHaveText('3 restantes');
  await expect(page.locator('canvas.pdf-page').first()).toBeVisible({ timeout: 15000 });
  await capturer(page, info, 'P1-pile-premiere');
  await versVerifications(page);
  await expect(bloc(page, 'champs').locator('[data-champ="ttc"]')).toContainText(/1\s?541,40/);
  await expect(bloc(page, 'decision').locator('[data-action="accepter"]')).toBeEnabled();
  await expect(bloc(page, 'decision').locator('[data-action="refuser"]')).toBeEnabled();
  await expect(bloc(page, 'controles')).toBeVisible();
  await page.locator('[data-action="passer"]').click();
  await attendreFacture(page, 'FA-2026-0300'); // a14
  await expect(restantes(page)).toHaveText('3 restantes');
  await page.locator('[data-action="passer"]').click();
  await attendreFacture(page, 'FQ-100'); // a12
  await page.locator('[data-action="passer"]').click();
  await attendreFacture(page, 'FA-2026-0412'); // retour à a1 : la pile tourne
  await capturer(page, info, 'P1-apres-passer');
  expect(await appelsVers(page, '/validation')).toHaveLength(0);
  expect(await appelsVers(page, '/actions')).toHaveLength(0);
});

test('P2 après « Accepter », la facture suivante s\'affiche toute seule dans le même écran, compteur à jour', async ({ page }, info) => {
  await ouvrirPile(page);
  await attendreFacture(page, 'FA-2026-0412');
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="accepter"]').click();
  await attendreFacture(page, 'FA-2026-0300'); // a14, sans aucun clic
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  await expect(restantes(page)).toHaveText('2 restantes');
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
  await expect(page.locator('.toast')).toContainText('Facture acceptée');
  expect(await appelsVers(page, '/validation')).toEqual([{ facture_id: 'a1', decision: 'accepter', chantier_id: null, etablissement_id: 'ag1' }]);
  await capturer(page, info, 'P2-suivante-automatique');
});

test('P3 si le serveur refuse la décision, on reste sur la même facture avec le message, sans avancer', async ({ page }, info) => {
  await ouvrirPile(page, { refusValidation: 'Cette facture a déjà été traitée par une autre personne.' });
  await attendreFacture(page, 'FA-2026-0412');
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="accepter"]').click();
  await expect(bloc(page, 'decision').locator('[data-erreur="decision"]')).toContainText('déjà été traitée par une autre personne');
  await expect(numero(page)).toContainText('FA-2026-0412');
  await expect(restantes(page)).toHaveText('3 restantes');
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
  // Le refus aussi : la fenêtre garde le message, la facture ne change pas.
  await bloc(page, 'decision').locator('[data-action="refuser"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.locator('[data-champ="motif"]').fill('Essai de refus');
  await fenetre.getByRole('button', { name: 'Refuser' }).click();
  await expect(fenetre.locator('[data-erreur="fenetre"]')).toContainText('déjà été traitée par une autre personne');
  await capturer(page, info, 'P3-erreur-reste');
  await fenetre.getByRole('button', { name: 'Annuler' }).click();
  await expect(numero(page)).toContainText('FA-2026-0412');
  await expect(restantes(page)).toHaveText('3 restantes');
});

test('P4 quand il n\'en reste plus : « Toutes les factures sont traitées » et un bouton vers la liste', async ({ page }, info) => {
  await ouvrirPile(page);
  await attendreFacture(page, 'FA-2026-0412');
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="accepter"]').click();
  await attendreFacture(page, 'FA-2026-0300');
  await refuser(page, 'Doublon d’une facture déjà reçue.');
  await attendreFacture(page, 'FQ-100');
  await expect(restantes(page)).toHaveText('1 restante');
  await refuser(page);
  const fin = page.locator('[data-role="pile-finie"]');
  await expect(fin).toContainText('Toutes les factures sont traitées');
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  expect((await appelsVers(page, '/validation')).map((c) => [c.facture_id, c.decision])).toEqual([['a1', 'accepter'], ['a14', 'refuser'], ['a12', 'refuser']]);
  await capturer(page, info, 'P4-toutes-traitees');
  await fin.locator('[data-action="vers-liste"]').click();
  await expect(page).toHaveURL(/achatsfactures\/liste$/);
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
});

test('P5 cas vide : aucune facture à valider à l\'ouverture, même message de fin ; cas d\'erreur : lecture en panne puis « Réessayer »', async ({ page }, info) => {
  await ouvrirPile(page, { sansAValider: true, lectureEnPanne: true });
  await expect(page.locator('[data-role="pile"] [data-etat="erreur"]')).toContainText('Impossible de lire les factures à valider');
  await capturer(page, info, 'P5-cas-erreur');
  await page.evaluate(() => { window.__faux.lectureEnPanne = false; });
  await page.locator('[data-role="pile"] [data-action="reessayer"]').click();
  await expect(page.locator('[data-role="pile-finie"]')).toContainText('Toutes les factures sont traitées');
  await expect(page.locator('[data-role="pile-finie"] [data-action="vers-liste"]')).toBeVisible();
  await expect(page.locator('[data-action="passer"]')).toHaveCount(0);
  await capturer(page, info, 'P5-cas-vide');
});

test('P6 « Valider à la suite » depuis la liste ouvre la pile ; le menu mène toujours à la liste', async ({ page }, info) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page);
  await connecter(page, undefined, { route: 'achatsfactures/liste' });
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
  await expect(page.locator('[data-etat="chargement"]')).toHaveCount(0);
  const bouton = page.locator('.page-actions [data-action="valider-a-la-suite"]');
  await expect(bouton).toHaveText(/Valider à la suite/);
  await expect(page.locator('.page-actions [data-action="ajouter-facture"]')).toBeVisible(); // les boutons existants restent
  await expect(page.locator('.page-actions [data-action="exporter-factures"]')).toBeVisible();
  await expect(page.locator('a[href$="#/achatsfactures/liste"]').first()).toBeAttached(); // l'entrée du menu
  await expect(page.locator('nav a[href$="#/achatsfactures/pile"], .menu a[href$="#/achatsfactures/pile"]')).toHaveCount(0);
  await capturer(page, info, 'P6-bouton-liste');
  await bouton.click();
  await expect(page).toHaveURL(/achatsfactures\/pile$/);
  await attendreFacture(page, 'FA-2026-0412');
});

test('P7 au téléphone : une facture à la fois, onglets Facture / Vérifications, enchaînement sans défilement horizontal', async ({ page }, info) => {
  test.skip(!estTelephone(page), 'critère propre au téléphone (lancer avec --project=telephone)');
  await ouvrirPile(page);
  await attendreFacture(page, 'FA-2026-0412');
  await expect(page.locator('[data-onglet="facture"][role="tab"]')).toBeVisible();
  await expect(restantes(page)).toBeVisible();
  await expect(page.locator('[data-action="passer"]')).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'P7-telephone-facture');
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="accepter"]').click();
  await attendreFacture(page, 'FA-2026-0300');
  await expect(restantes(page)).toHaveText('2 restantes');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'P7-telephone-suivante');
});
