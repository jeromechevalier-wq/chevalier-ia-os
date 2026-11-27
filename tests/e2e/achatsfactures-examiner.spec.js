// Module Achats « Factures » (25/11/2026, PR 8b) : la page EXAMINER et « + Facture ». Un test par critère (le nom commence par son numéro). Aucun réseau réel : la base, le stockage et les webhooks sont un faux réseau
// posé par le crochet de test `window.__accesBase` (émulateurs seulement), plus une route qui sert un PDF fictif fabriqué ici. Fausses données : tests/_donnees-achatsfactures.js (aucune vraie identité).
//  E1 ouverture depuis la liste : PDF, champs, lignes, message, score, contrôles ; E2 courriel complet et « Nos contrôles anti-arnaque » ; E3 accepter (agence proposée par le SIRET) ; E4 refuser un doublon, le refus du
//  serveur garde la fenêtre ouverte ; E5 accepter malgré une alerte exige un motif ; E6 relier et rouvrir une facture décidée ; E7 cas vides et cas d'erreur (introuvable, lecture en panne, PDF illisible, sans courriel) ;
//  E8 « + Facture » ; 2a/2b facture déjà ajoutée (message daté, lien vers la fiche existante, rien en double) ; E9 téléphone (une page à la fois) et thème sombre, sans défilement horizontal ; E10 séparateur au clavier.
// Captures dans tests/e2e/captures/achatsfactures/ (non commitées), une par état, nommée avec le projet : ordinateur ou telephone.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone } from './outils.js';
import { listeComplete } from '../_donnees-achatsfactures.js';

const DOSSIER = fileURLToPath(new URL('./captures/achatsfactures/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai',
  webhooks: { actions: https('hooks.exemple.test', '/actions'), validation: https('hooks.exemple.test', '/validation'), ajoutFacture: https('hooks.exemple.test', '/ajout'), suggestions: https('hooks.exemple.test', '/suggestions') } });

/** Un petit PDF d'une page, fabriqué ici (décalages calculés) : « Facture fictive ». */
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
const AGENCE_PP = { id: 'ag1', fournisseur_id: 'fo1', siret: SIRET_PP, nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null };
const FOURNISSEURS = [{ id: 'fo1', siren: SIRET_PP.slice(0, 9), nom: 'Point Q Matériaux', statut: 'actif' }, { id: 'fo2', siren: '500000013', nom: 'Loxbel Location', statut: 'actif' }];
const AGENCES = [AGENCE_PP, { id: 'ag2', fournisseur_id: 'fo2', siret: '50000001300002', nom_agence: 'Agence Centre', ville: 'Orvaleine', actif: true, fusionne_dans: null }];
const CHANTIERS = [{ id: 'c1', nom: 'Villa Orvaline', client: 'Client fictif', adresse: '1 rue des essais 75000 Valmoran', statut: 'en_cours', code: 'CH-1', archive: false },
  { id: 'c2', nom: 'Atelier Lorvan', client: null, adresse: null, statut: 'termine', code: 'CH-2', archive: false }];
const COURRIEL = { id: 'm1', recu_le: '2026-11-20T08:00:00Z', date_courriel: '2026-11-20T07:59:00Z', expediteur: 'compta@pointq.example', sujet: 'Votre facture FA-2026-0412', corps_texte: 'Bonjour,\n\nVeuillez trouver ci-joint la facture du mois.\n\n<b>Cordialement</b>', pieces_jointes: [{ nom: 'facture.pdf', type: 'application/pdf', taille: 2048 }], boite: 'factures', destinataire: 'factures@espace.example', resultat: 'cree' };
const LIGNES_A1 = [1, 2, 3].map((p) => ({ position: p, reference_fournisseur: `REF-${p}`, designation: `Article fictif ${p}`, quantite: p, unite: 'u', prix_unitaire_ht: 100, remise_pct: 0, montant_ht: 100 * p, taux_tva: 20 }));

const lignesTable = () => listeComplete().map((f) => { const { chantiers, etablissements_fournisseur, ...r } = f;
  return { ...r, chantier_id: null, etablissement_id: null, fichier_path: `espace-essai/${f.id}.pdf`, courriel_id: f.id === 'a1' ? 'm1' : null, alertes_a_la_decision: null, motif_acceptation: null, archivee_par: null }; });

/** Faux réseau posé AVANT le chargement : lectures filtrées comme le ferait la base, stockage, tickets et webhooks. `options` : { lectureEnPanne, refusValidation, pdfIllisible, listesEnPanne }. */
async function poserFauxReseau(page, options = {}) {
  await page.addInitScript(({ factures, chantiers, agences, fournisseurs, courriel, lignesA1, lectureEnPanne, refusValidation, listesEnPanne, reponseAjout }) => {
    const faux = { factures: structuredClone(factures), chantiers, agences, fournisseurs, refusValidation, lectureEnPanne, listesEnPanne };
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
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      const envoi = typeof FormData !== 'undefined' && init.body instanceof FormData ? init.body : null;
      const corps = envoi ? { champs: [...envoi.keys()], fichier: { nom: envoi.get('fichier')?.name, type: envoi.get('fichier')?.type, taille: envoi.get('fichier')?.size }, contentType: Object.keys(init.headers ?? {}).filter((k) => k.toLowerCase() === 'content-type') }
        : init.body ? JSON.parse(init.body) : null;
      window.__appels.push({ methode: init.method, chemin: u.pathname, corps });
      if (u.pathname === '/rest/v1/factures') {
        if (faux.lectureEnPanne) return rep({ message: 'panne' }, 500);
        const select = u.searchParams.get('select') ?? '';
        if (select === 'id,extraction') return liste(faux.factures.filter((f) => f.statut === 'a_valider').map((f) => ({ id: f.id, extraction: f.extraction })));
        return liste(filtre(faux.factures, u, ['id', 'fournisseur_siren', 'iban_normalise']).map(({ extraction, ...r }) => (select.includes('extraction') ? { extraction, ...r } : r)));
      }
      if (u.pathname === '/rest/v1/chantiers') return faux.listesEnPanne ? rep({ message: 'panne' }, 500) : liste(filtre(faux.chantiers, u, ['id']));
      if (u.pathname === '/rest/v1/etablissements_fournisseur') return faux.listesEnPanne ? rep({ message: 'panne' }, 500) : liste(faux.agences);
      if (u.pathname === '/rest/v1/fournisseurs') return liste(faux.fournisseurs);
      if (u.pathname === '/rest/v1/courriels_recus') return liste(filtre([courriel], u, ['id']));
      if (u.pathname === '/rest/v1/lignes_facture') return liste(u.searchParams.get('facture_id') === 'eq.a1' ? lignesA1 : []);
      if (u.pathname === '/rest/v1/ibans_confirmes') return liste([]);
      if (u.pathname === '/rest/v1/rpc/lister_favoris_os') return rep([]);
      if (u.pathname === '/rest/v1/rpc/demander_ticket_n8n') return rep('ticket-essai');
      if (u.pathname.startsWith('/storage/v1/object/sign/')) return rep({ signedURL: `/object/sign/factures/fichier.pdf?token=essai` });
      const f = corps ? faux.factures.find((x) => x.id === corps.facture_id) : null;
      if (u.pathname === '/validation') {
        if (faux.refusValidation) return rep({ ok: false, erreur: faux.refusValidation }, 400);
        if (corps.decision === 'accepter') Object.assign(f, { statut: 'acceptee', chantier_id: corps.chantier_id, etablissement_id: corps.etablissement_id, date_decision: '2026-11-25T10:00:00Z', decide_par: 'test@exemple.example', acceptee_malgre_alerte: !!corps.alertes, motif_acceptation: corps.motif ?? null });
        else Object.assign(f, { statut: 'refusee', motif_refus: corps.motif, date_decision: '2026-11-25T10:00:00Z', decide_par: 'test@exemple.example' });
        return rep({ ok: true });
      }
      if (u.pathname === '/actions') {
        if (corps.action === 'rouvrir') { Object.assign(f, { statut: 'a_valider', date_decision: null, decide_par: null }); return rep({ ok: true }); }
        if (corps.action === 'relier_chantier') { f.chantier_id = corps.chantier_id; return rep({ ok: true }); }
        if (corps.action === 'archiver') { f.archivee_le = '2026-11-25T09:00:00Z'; return rep({ ok: true }); }
        if (corps.action === 'creer_agence') { faux.agences.push({ id: 'ag-neuve', fournisseur_id: 'fo1', siret: corps.siret ?? null, nom_agence: corps.nom_agence ?? null, ville: corps.ville ?? null, actif: true, fusionne_dans: null }); return rep({ ok: true, agence_id: 'ag-neuve', fournisseur_id: 'fo1', existait: false }); }
      }
      if (u.pathname === '/ajout') return reponseAjout ? rep(reponseAjout.corps, reponseAjout.statut) : rep({ ok: true, facture_id: 'nouvelle', lecture: 'reussie', lignes_ecrites: true });
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { factures: lignesTable(), chantiers: CHANTIERS, agences: AGENCES, fournisseurs: FOURNISSEURS, courriel: COURRIEL, lignesA1: LIGNES_A1, lectureEnPanne: false, refusValidation: '', listesEnPanne: false, reponseAjout: null, ...options });
  // Le PDF fictif (ou un contenu illisible) est servi comme le ferait le stockage signé ; l'en-tête CORS laisse le lecteur le lire.
  await page.route('**/storage/v1/object/sign/**', (route) => route.fulfill({ status: 200, contentType: 'application/pdf',
    headers: { 'access-control-allow-origin': '*' }, body: options.pdfIllisible ? Buffer.from('ceci n’est pas un PDF') : pdfFictif() }));
}
const appelsVers = (page, chemin) => page.evaluate((c) => window.__appels.filter((a) => a.chemin === c).map((a) => a.corps), chemin);

async function ouvrirListe(page, options) {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page, options);
  await connecter(page, undefined, { route: 'achatsfactures/liste' });
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
  await expect(page.locator('[data-etat="chargement"]')).toHaveCount(0);
}
async function ouvrirExaminer(page, id, options) {
  await ouvrirListe(page, options);
  await page.locator(`article[data-facture="${id}"], tr[data-facture="${id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`achatsfactures/examiner/${id}$`));
  await expect(page.locator('[data-role="examiner"] [data-etat="chargement"]')).toHaveCount(0);
}
const bloc = (page, nom) => page.locator(`[data-bloc="${nom}"]`);
const surTelephone = (page) => estTelephone(page);
async function versVerifications(page) { if (surTelephone(page)) await page.locator('[data-onglet="verifications"]').click(); }

test('E1 un clic sur une carte ouvre l\'Examiner : PDF dessiné, champs, trois lignes, message, score et contrôles', async ({ page }, info) => {
  await ouvrirExaminer(page, 'a1');
  await expect(page.getByRole('heading', { name: 'Point Q Matériaux', level: 1 })).toBeVisible();
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
  await expect(page.locator('canvas.pdf-page').first()).toBeVisible({ timeout: 15000 });
  await capturer(page, info, 'E1-examiner-pdf');
  await versVerifications(page);
  await expect(bloc(page, 'champs').locator('[data-champ="numero"]')).toContainText('FA-2026-0412');
  await expect(bloc(page, 'champs').locator('[data-champ="ttc"]')).toContainText(/1\s?541,40/);
  await expect(bloc(page, 'lignes').locator('tbody tr')).toHaveCount(3);
  await expect(bloc(page, 'message').locator('[data-role="message-extrait"]')).toContainText('Veuillez trouver ci-joint la facture du mois.');
  await expect(page.locator('.score-barre')).toBeVisible();
  await expect(bloc(page, 'controles').locator('li.controle[data-etat]')).toHaveCount(9);
  await expect(bloc(page, 'controles').locator('li.controle-bientot')).toHaveCount(3);
  await expect(page.getByText('Ces contrôles sont une aide, pas une garantie').first()).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'E1-examiner-verifications');
  // L'adresse du PDF vient de la base (lien signé) : aucune adresse écrite dans la page.
  expect((await appelsVers(page, '/storage/v1/object/sign/factures/espace-essai/a1.pdf')).length).toBeGreaterThan(0);
});

test('E2 « Voir le courriel complet » (texte, jamais du HTML) et « Nos contrôles anti-arnaque »', async ({ page }, info) => {
  await ouvrirExaminer(page, 'a1');
  await versVerifications(page);
  await bloc(page, 'message').getByRole('button', { name: 'Voir le courriel complet' }).click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre).toContainText('compta@pointq.example');
  await expect(fenetre).toContainText('facture.pdf');
  await expect(fenetre.locator('[data-role="courriel-texte"]')).toContainText('<b>Cordialement</b>'); // affiché tel quel, jamais interprété
  await expect(fenetre.locator('[data-role="courriel-texte"] b')).toHaveCount(0);
  await capturer(page, info, 'E2-courriel');
  await fenetre.locator('.dialogue-pied').getByRole('button', { name: 'Fermer' }).click();
  await bloc(page, 'controles').getByRole('button', { name: 'Nos contrôles anti-arnaque' }).click();
  await expect(page.getByRole('dialog')).toContainText('À quoi ça sert');
  await expect(page.getByRole('dialog').locator('[data-controle]')).toHaveCount(9);
  await page.getByRole('dialog').locator('.dialogue-pied').getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('E3 accepter : l\'agence est proposée d\'après le SIRET, le corps envoyé n\'a ni identité ni champ en trop', async ({ page }, info) => {
  await ouvrirExaminer(page, 'a1');
  await versVerifications(page);
  await expect(bloc(page, 'decision').locator('[data-role="agence-suggeree"]')).toBeVisible();
  await expect(bloc(page, 'decision').getByRole('combobox', { name: 'Agence du fournisseur' })).toHaveValue(/Point Q Matériaux/);
  await capturer(page, info, 'E3-decision');
  await bloc(page, 'decision').locator('[data-action="accepter"]').click();
  await expect(page.locator('[data-role="statut"]')).toHaveText('Acceptée');
  const corps = await appelsVers(page, '/validation');
  expect(corps).toHaveLength(1);
  expect(corps[0]).toEqual({ facture_id: 'a1', decision: 'accepter', chantier_id: null, etablissement_id: 'ag1' });
  await expect(bloc(page, 'decision').locator('[data-role="decision-prise"]')).toContainText('Acceptée');
});

test('E4 refuser un doublon : motif proposé ; si le serveur refuse, la fenêtre reste ouverte avec son message', async ({ page }, info) => {
  await ouvrirExaminer(page, 'a14', { refusValidation: 'Cette facture a déjà été traitée par une autre personne.' });
  await versVerifications(page);
  await bloc(page, 'decision').locator('[data-action="refuser-doublon"]').click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.locator('[data-champ="motif"]')).toHaveValue(/Doublon/);
  await fenetre.getByRole('button', { name: 'Refuser' }).click();
  await expect(fenetre.locator('[data-erreur="fenetre"]')).toContainText('déjà été traitée par une autre personne');
  await expect(fenetre).toBeVisible(); // la fenêtre reste ouverte, le motif est gardé
  await expect(fenetre.locator('[data-champ="motif"]')).toHaveValue(/Doublon/);
  await capturer(page, info, 'E4-refus-serveur');
  await page.evaluate(() => { window.__faux.refusValidation = ''; });
  await fenetre.getByRole('button', { name: 'Refuser' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-role="statut"]')).toHaveText('Refusée');
  const corps = await appelsVers(page, '/validation');
  expect(corps.at(-1)).toMatchObject({ facture_id: 'a14', decision: 'refuser' });
  expect(Object.keys(corps.at(-1)).sort()).toEqual(['decision', 'facture_id', 'motif']);
});

test('E5 accepter malgré une alerte : le bouton attend un motif d\'au moins 3 caractères, qui part avec les alertes', async ({ page }) => {
  await ouvrirExaminer(page, 'a2'); // nom du SIRET différent : alerte orange
  await versVerifications(page);
  const decision = bloc(page, 'decision');
  await expect(decision.locator('[data-role="alertes-decision"]')).toBeVisible();
  await expect(decision.getByRole('combobox', { name: 'Agence du fournisseur' })).toHaveValue(/Loxbel Location/); // proposée d'après le SIRET
  await expect(decision.locator('[data-action="accepter"]')).toBeDisabled();
  await decision.locator('[data-champ="motif-acceptation"]').fill('ok');
  await expect(decision.locator('[data-action="accepter"]')).toBeDisabled();
  await decision.locator('[data-champ="motif-acceptation"]').fill('Vérifié avec le fournisseur par téléphone');
  await expect(decision.locator('[data-action="accepter"]')).toBeEnabled();
  await decision.locator('[data-action="accepter"]').click();
  await expect(page.locator('[data-role="statut"]')).toHaveText('Acceptée');
  const corps = (await appelsVers(page, '/validation'))[0];
  expect(corps.etablissement_id).toBe('ag2');
  expect(corps.motif).toBe('Vérifié avec le fournisseur par téléphone');
  expect(corps.alertes.length).toBeGreaterThan(0);
});

test('E6 facture décidée : relier à un chantier, puis rouvrir avec un motif', async ({ page }, info) => {
  await ouvrirExaminer(page, 'h1');
  await versVerifications(page);
  const decision = bloc(page, 'decision');
  await expect(decision.locator('[data-role="decision-prise"]')).toContainText('Acceptée');
  await decision.locator('[data-action="relier"]').click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.getByRole('button', { name: 'Relier', exact: true })).toBeDisabled();
  await fenetre.getByRole('combobox', { name: 'Chantier' }).click();
  await fenetre.getByRole('option', { name: /Atelier Lorvan/ }).click(); // chantier terminé : refusé avec sa phrase
  await expect(fenetre).toContainText('terminé');
  await expect(fenetre.getByRole('button', { name: 'Relier', exact: true })).toBeDisabled();
  await fenetre.getByRole('combobox', { name: 'Chantier' }).click();
  await fenetre.getByRole('option', { name: /Villa Orvaline/ }).click();
  await fenetre.getByRole('button', { name: 'Relier', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Facture reliée au chantier');
  expect((await appelsVers(page, '/actions')).at(-1)).toEqual({ facture_id: 'h1', chantier_id: 'c1', action: 'relier_chantier' });
  await expect(decision.locator('[data-action="relier"]')).toHaveCount(0);
  await decision.locator('[data-action="rouvrir"]').click();
  const motif = page.getByRole('dialog').locator('[data-champ="motif"]');
  await motif.fill('Erreur de saisie');
  await page.getByRole('dialog').getByRole('button', { name: 'Rouvrir' }).click();
  await expect(page.locator('[data-role="statut"]')).toHaveText('À valider');
  expect((await appelsVers(page, '/actions')).at(-1)).toMatchObject({ facture_id: 'h1', action: 'rouvrir', motif: 'Erreur de saisie' });
  await capturer(page, info, 'E6-rouverte');
});

test('E7 cas vides et cas d\'erreur : facture introuvable, lecture en panne puis « Réessayer », PDF illisible, sans courriel, listes illisibles', async ({ page }, info) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page);
  await connecter(page, undefined, { route: 'achatsfactures/examiner/inexistante' });
  await expect(page.locator('[data-etat="vide"]')).toContainText('introuvable');
  await expect(page.locator('[data-etat="vide"]').getByRole('link', { name: 'Retour aux factures' })).toBeVisible();
  await capturer(page, info, 'E7-introuvable');
});

test('E7a lecture en panne : message clair, puis « Réessayer » une fois la panne finie', async ({ page }, info) => {
  await ouvrirListe(page);
  await page.evaluate(() => { window.__faux.lectureEnPanne = true; });
  await page.locator('article[data-facture="a1"], tr[data-facture="a1"]').first().click();
  await expect(page.locator('[data-role="examiner"] [data-etat="erreur"]')).toContainText('Impossible de charger cette facture');
  await capturer(page, info, 'E7-erreur');
  await page.evaluate(() => { window.__faux.lectureEnPanne = false; });
  await page.locator('[data-role="examiner"] [data-action="reessayer"]').click();
  await expect(page.getByRole('heading', { name: 'Point Q Matériaux', level: 1 })).toBeVisible();
});

test('E7b PDF illisible : message clair et « Réessayer » (le reste de la page marche) ; facture sans courriel : pas de message', async ({ page }, info) => {
  await ouvrirExaminer(page, 'a4', { pdfIllisible: true });
  await expect(page.locator('[data-etat="pdf-indisponible"]')).toContainText('Le PDF n’a pas pu être lu', { timeout: 15000 });
  await expect(page.locator('[data-action="reessayer-pdf"]')).toBeVisible();
  await capturer(page, info, 'E7b-pdf-illisible');
  await versVerifications(page);
  await expect(bloc(page, 'message').locator('[data-etat="message-vide"]')).toBeVisible();
  await expect(bloc(page, 'message').getByRole('button', { name: 'Voir le courriel complet' })).toHaveCount(0);
  await expect(page.locator('[data-role="probleme-lecture"]')).toContainText('Analyse non disponible');
  await expect(bloc(page, 'lignes').locator('[data-etat="lignes-vides"]')).toBeVisible();
});

test('E7c chantiers et agences illisibles : refuser reste possible, accepter non, « Réessayer » relit', async ({ page }) => {
  await ouvrirListe(page);
  await page.evaluate(() => { window.__faux.listesEnPanne = true; });
  await page.locator('article[data-facture="a1"], tr[data-facture="a1"]').first().click();
  await expect(page.locator('[data-role="examiner"] [data-etat="chargement"]')).toHaveCount(0);
  await versVerifications(page);
  const decision = bloc(page, 'decision');
  await expect(decision.locator('[data-etat="listes-illisibles"]')).toBeVisible();
  await expect(decision.locator('[data-action="accepter"]')).toBeDisabled();
  await expect(decision.locator('[data-action="refuser"]')).toBeEnabled();
});

test('E8 « + Facture » : un fichier qui n\'est pas un PDF est refusé avant l\'envoi ; un PDF part en multipart (champ « fichier ») par les actions', async ({ page }, info) => {
  await ouvrirListe(page);
  await page.locator('[data-action="ajouter-facture"]').click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  await fenetre.locator('[data-champ="fichier-facture"]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour bonjour') });
  await expect(fenetre.locator('[data-erreur="fichier"]')).toContainText('pas un PDF');
  await expect(fenetre.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  await capturer(page, info, 'E8-ajout-refuse');
  await fenetre.locator('[data-champ="fichier-facture"]').setInputFiles({ name: 'facture.pdf', mimeType: 'application/pdf', buffer: pdfFictif() });
  await expect(fenetre.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  await fenetre.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.locator('.toast')).toContainText('Facture ajoutée');
  const corps = await appelsVers(page, '/ajout');
  expect(corps).toHaveLength(1);
  // Multipart : un seul champ « fichier », aucun Content-Type posé à la main (le navigateur met la frontière), aucun base64.
  expect(corps[0].champs).toEqual(['fichier']);
  expect(corps[0].contentType).toEqual([]);
  expect(corps[0].fichier).toMatchObject({ nom: 'facture.pdf', type: 'application/pdf' });
  expect(corps[0].fichier.taille).toBeGreaterThan(100);
});

// Point 2 (27/11/2026) : un PDF déjà ajouté ne donne plus d'erreur obscure. Une fiche déjà décidée, à identifiant de base (uuid), sert de « facture existante ».
const ID_EXISTANTE = '0b6f3c1e-2a4d-4c8e-9f10-1234567890ab';
const avecExistante = () => { const t = lignesTable(); const modele = t.find((f) => f.statut === 'acceptee') ?? t[0];
  return [...t, { ...modele, id: ID_EXISTANTE, statut: 'acceptee', created_at: '2026-11-26T13:32:00Z', archivee_le: null }]; };
async function envoyerPdf(page) {
  await page.locator('[data-action="ajouter-facture"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.locator('[data-champ="fichier-facture"]').setInputFiles({ name: 'facture.pdf', mimeType: 'application/pdf', buffer: pdfFictif() });
  await fenetre.getByRole('button', { name: 'Envoyer' }).click();
  return fenetre;
}

test('2a même PDF envoyé deux fois (refus 409) : « déjà ajoutée le … », lien vers la fiche existante, la fenêtre reste ouverte', async ({ page }, info) => {
  await ouvrirListe(page, { factures: avecExistante(), reponseAjout: { statut: 409, corps: { ok: false, code: 'doublon', facture_id: ID_EXISTANTE, erreur: 'Cette facture a déjà été ajoutée.' } } });
  const avant = await page.evaluate(() => window.__faux.factures.length);
  const fenetre = await envoyerPdf(page);
  const message = fenetre.locator('[data-erreur="fenetre"]');
  await expect(message).toContainText('Cette facture a déjà été ajoutée le 26/11/2026 à 14:32. Rien n’a été créé en double.');
  const lien = message.locator('[data-role="facture-existante"]');
  await expect(lien).toHaveText('Ouvrir la facture existante');
  await expect(lien).toHaveAttribute('href', `#/achatsfactures/examiner/${ID_EXISTANTE}`);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(await page.evaluate(() => window.__faux.factures.length)).toBe(avant);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '2a-deja-ajoutee');
  await lien.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`achatsfactures/examiner/${ID_EXISTANTE}$`));
});

test('2b réponse « ajoutée » qui désigne une fiche déjà décidée (PDF rangé par la base dans la facture existante) : même message, pas de « Facture ajoutée »', async ({ page }, info) => {
  await ouvrirListe(page, { factures: avecExistante(), reponseAjout: { statut: 200, corps: { ok: true, facture_id: ID_EXISTANTE, lecture: 'ok', lignes_ecrites: false } } });
  const fenetre = await envoyerPdf(page);
  await expect(fenetre.locator('[data-erreur="fenetre"]')).toContainText('Cette facture a déjà été ajoutée le 26/11/2026 à 14:32.');
  await expect(fenetre.locator('[data-role="facture-existante"]')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  await capturer(page, info, '2b-deja-ajoutee-fiche-decidee');
  // Cas d'erreur : « Annuler » ferme la fenêtre sans rien créer.
  await fenetre.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('E9 une page à la fois sur téléphone, thème sombre, jamais de défilement horizontal', async ({ page }, info) => {
  await ouvrirExaminer(page, 'a1');
  await expect(page.locator('canvas.pdf-page').first()).toBeVisible({ timeout: 15000 });
  if (surTelephone(page)) {
    await expect(page.locator('[data-role="colonne-pdf"]')).toBeVisible();
    await expect(page.locator('[data-role="panneau-verifications"]')).toBeHidden();
    await page.locator('[data-onglet="verifications"]').click();
    await expect(page.locator('[data-role="panneau-verifications"]')).toBeVisible();
    await expect(page.locator('[data-role="colonne-pdf"]')).toBeHidden();
  } else {
    await expect(page.locator('[data-role="colonne-pdf"]')).toBeVisible();
    await expect(page.locator('[data-role="panneau-verifications"]')).toBeVisible(); // ordinateur : côte à côte
  }
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'clair'; });
  await capturer(page, info, 'E9-clair');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'sombre'; });
  await capturer(page, info, 'E9-sombre');
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('E10 le séparateur se déplace au clavier et reste borné (ordinateur) @sans-telephone', async ({ page }) => {
  await ouvrirExaminer(page, 'a1');
  const sep = page.locator('[data-role="separateur"]');
  await sep.focus();
  const avant = Number(await sep.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowLeft');
  expect(Number(await sep.getAttribute('aria-valuenow'))).toBeLessThan(avant);
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
  expect(Number(await sep.getAttribute('aria-valuenow'))).toBe(30);
});
