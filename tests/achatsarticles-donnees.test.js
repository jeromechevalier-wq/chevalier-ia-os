// Module Articles : lecture des données (js/modules/achatsarticles/donnees.js), exports et actions. Faux réseau en mémoire : aucun appel réel.
// Remplace le test « lecture par tranches » du code d'origine : la lecture par pages et le plafond de 20 pages sont ceux de js/os/supabase.js, on vérifie ici que le module les respecte et les dit.
// Adresses, clés et jetons : inventés (domaine réservé « .invalid »).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerClient, PAGES_MAX, TAILLE_PAGE } from '../js/os/supabase.js';
import { creerActions } from '../js/os/actions-metier.js';
import { lireDonnees, lireVilles, messageLecture, COLONNES } from '../js/modules/achatsarticles/donnees.js';
import { construireListe, statistiquesLignes, TEXTE_ERREUR_LECTURE, TEXTE_TRONQUE } from '../js/modules/achatsarticles/logique.js';
import { articlesCsv, ENTETES, BOM, protegerFormule, nomFichier, exporterTout, construireCsv } from '../js/modules/achatsarticles/export.js';

const BASE = ['https', '://base-essai.invalid'].join('');
const connexion = () => ({ adresseBase: BASE, clePublique: 'cle-publique-inventee', espace: 'essai', webhooks: { actions: ['https', '://n8n-essai.invalid/actions'].join(''), suggestions: ['https', '://n8n-essai.invalid/suggestions'].join('') } });
const badgeBon = async () => ({ jeton: 'badge-inventé', claims: { role: 'authenticated', espace_base: 'essai' } });

/** Faux réseau : `tables` = { nom: lignes } ; honore select, limit, offset, order, et les filtres eq/gt/in. Une table absente répond 404. */
function fauxReseau(tables) {
  const appels = [];
  const f = async (url) => {
    const u = new URL(url);
    appels.push(u);
    const nom = u.pathname.replace('/rest/v1/', '');
    const r = (status, corps, entetes = {}) => ({ ok: status < 300, status, headers: { get: (n) => entetes[n] ?? null }, json: async () => corps });
    if (!Object.hasOwn(tables, nom)) return r(404, { message: 'introuvable' });
    let lignes = tables[nom];
    for (const [cle, val] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(cle)) continue;
      const [op, ...reste] = val.split('.');
      const v = reste.join('.');
      if (op === 'eq') lignes = lignes.filter((l) => String(l[cle]) === v);
      else if (op === 'gt') lignes = lignes.filter((l) => Number(l[cle]) > Number(v));
      else if (op === 'in') { const liste = JSON.parse(`[${v.slice(1, -1)}]`); lignes = lignes.filter((l) => liste.includes(l[cle])); }
    }
    const debut = Number(u.searchParams.get('offset') ?? 0);
    const taille = Number(u.searchParams.get('limit') ?? TAILLE_PAGE);
    const page = lignes.slice(debut, debut + taille);
    return r(200, page, { 'Content-Range': `${page.length ? debut : '*'}-${debut + page.length - 1}/${lignes.length}` });
  };
  f.appels = appels;
  return f;
}
const clientDe = (tables) => { const f = fauxReseau(tables); return { f, c: creerClient({ lireConnexion: connexion, obtenirBadge: badgeBon, fetchImpl: f }) }; };

const FAUSSES = () => ({
  fournisseurs: [{ id: 'f1', nom: 'Bois du Sud' }, { id: 'f2', nom: 'Fer et Fils' }],
  articles_fournisseur: [
    { id: 'a1', fournisseur_id: 'f1', reference: 'R1', designation: 'Planche 27 mm', unite: 'u', created_at: '2026-01-02T10:00:00Z' },
    { id: 'a2', fournisseur_id: 'f2', reference: null, designation: 'Planche 27', unite: 'u', created_at: '2026-01-03T10:00:00Z' },
    { id: 'a3', fournisseur_id: 'f-inconnu', reference: null, designation: 'Vis', unite: 'boîte', created_at: '2026-01-04T10:00:00Z' },
  ],
  articles_reference: [{ id: 'r1', nom: 'Planche 27', unite_reference: 'u', actif: true }],
  rapprochements_articles: [{ article_fournisseur_id: 'a1', article_reference_id: 'r1', coefficient: '1', valide_le: '2026-02-01T10:00:00Z', valide_par: 'x', suggere_par_ia: false }],
  factures: [
    { id: 'fa1', statut: 'acceptee', type_document: 'facture', date_facture: '2026-03-01', created_at: '2026-03-02T10:00:00Z' },
    { id: 'fa2', statut: 'a_valider', type_document: 'facture', date_facture: '2026-03-05', created_at: '2026-03-06T10:00:00Z' },
    { id: 'fa3', statut: 'acceptee', type_document: 'avoir', date_facture: '2026-03-07', created_at: '2026-03-08T10:00:00Z' },
  ],
  lignes_facture: [
    { id: 'l1', article_fournisseur_id: 'a1', quantite: 2, montant_ht: 20, facture_id: 'fa1' },
    { id: 'l2', article_fournisseur_id: 'a1', quantite: 1, montant_ht: 99, facture_id: 'fa2' }, // facture pas acceptée : ignorée
    { id: 'l3', article_fournisseur_id: 'a1', quantite: 1, montant_ht: 50, facture_id: 'fa3' }, // avoir : ignoré
    { id: 'l4', article_fournisseur_id: null, quantite: 1, montant_ht: 5, facture_id: 'fa1' }, // sans article : ignorée
    { id: 'l5', article_fournisseur_id: 'a2', quantite: 0, montant_ht: 5, facture_id: 'fa1' }, // quantité nulle : ignorée
    { id: 'l6', article_fournisseur_id: 'a2', quantite: '4', montant_ht: '10', facture_id: 'fa1' },
  ],
  suggestions_refusees: [],
  v_td_prix_lignes: [
    { ligne_id: 'l1', article_fournisseur_id: 'a1', nom_agence: null, ville: 'Manosque' },
    { ligne_id: 'l6', article_fournisseur_id: 'a2', nom_agence: 'Agence Nord', ville: 'Gap' },
  ],
});

describe('D1 lecture : jointures en JavaScript et filtres', () => {
  test('D1 les articles reçoivent le nom de leur fournisseur ; les lignes ne gardent que les factures acceptées, de type facture, de quantité > 0 ; les nombres sont convertis', async () => {
    const { f, c } = clientDe(FAUSSES());
    const d = await lireDonnees(c);
    assert.deepEqual(d.articles.map((a) => [a.id, a.fournisseurs?.nom ?? null]), [['a1', 'Bois du Sud'], ['a2', 'Fer et Fils'], ['a3', null]]);
    assert.deepEqual(d.lignes.map((l) => l.id), ['l1', 'l6']);
    assert.equal(d.lignes[1].quantite, 4);
    assert.equal(d.lignes[1].montant_ht, 10);
    assert.equal(d.lignes[0].factures.statut, 'acceptee');
    assert.equal(d.tronque, false);
    assert.equal(d.refuseesIndisponibles, false);
    // Les colonnes sont nommées (aucune étoile) et les filtres partent à la base, pas dans le navigateur seulement.
    for (const u of f.appels) assert.doesNotMatch(u.searchParams.get('select'), /\*/);
    const lignes = f.appels.find((u) => u.pathname.endsWith('/lignes_facture'));
    assert.equal(lignes.searchParams.get('quantite'), 'gt.0');
    const factures = f.appels.find((u) => u.pathname.endsWith('/factures'));
    assert.equal(factures.searchParams.get('statut'), 'eq.acceptee');
    assert.equal(factures.searchParams.get('type_document'), 'eq.facture');
    // Même résultat que le code d'origine : dernier prix = montant HT / quantité de la dernière ligne comptée.
    const stats = statistiquesLignes(d.lignes);
    assert.equal(stats.get('a1').dernierPrix, 10);
    assert.equal(stats.get('a2').dernierPrix, 2.5);
    const liste = construireListe(d.articles, d.rapprochements, d.references, stats, d.refusees);
    assert.equal(liste.find((x) => x.article.id === 'a1').etat, 'valide');
    assert.equal(liste.find((x) => x.article.id === 'a3').fournisseur, 'Fournisseur inconnu');
  });
  test('D1 chaque table lue a des colonnes nommées valides pour la couche de lecture', () => {
    for (const [table, colonnes] of Object.entries(COLONNES)) {
      assert.match(table, /^[a-z_][a-z0-9_]*$/);
      assert.ok(colonnes.length > 0 && colonnes.every((x) => /^[a-z_][a-z0-9_]*$/.test(x)), table);
    }
  });
});

describe('D2 plafond de lecture : dit à voix haute, jamais une liste coupée en silence', () => {
  test('D2 au-delà de 20 pages de 1 000 lignes : `tronque` est vrai, 20 000 lignes sont lues, la phrase de l’écran existe', async () => {
    const t = FAUSSES();
    t.articles_fournisseur = Array.from({ length: PAGES_MAX * TAILLE_PAGE + 500 }, (_, i) => ({ id: `a${String(i).padStart(6, '0')}`, fournisseur_id: 'f1', reference: null, designation: `Article ${i}`, unite: 'u', created_at: '2026-01-01T00:00:00Z' }));
    const { f, c } = clientDe(t);
    const d = await lireDonnees(c);
    assert.equal(d.tronque, true);
    assert.equal(d.articles.length, PAGES_MAX * TAILLE_PAGE);
    assert.match(TEXTE_TRONQUE, /trop longue pour être lue en entier/);
    // Tri obligatoire dès la 2e page : chaque lecture porte un « order ».
    for (const u of f.appels) assert.ok(u.searchParams.get('order'), u.pathname);
  });
});

describe('D3 lecture de secours des suggestions refusées', () => {
  test('D3 si la table des refus répond une erreur, le reste charge et l’écran le dit', async () => {
    const t = FAUSSES();
    delete t.suggestions_refusees;
    const { c } = clientDe(t);
    const d = await lireDonnees(c);
    assert.equal(d.refuseesIndisponibles, true);
    assert.deepEqual(d.refusees, []);
    assert.equal(d.articles.length, 3);
  });
  test('D3 une autre table en panne fait échouer toute la lecture (jamais un écran à moitié faux)', async () => {
    const t = FAUSSES();
    delete t.articles_reference;
    const { c } = clientDe(t);
    await assert.rejects(() => lireDonnees(c));
  });
  test('D3 le message de l’écran : « Reconnecte-toi » tel quel, sinon la phrase habituelle', async () => {
    const lireReco = creerClient({ lireConnexion: connexion, obtenirBadge: async () => ({ jeton: 'x', claims: {} }), fetchImpl: fauxReseau({}) });
    let erreur = null;
    try { await lireDonnees(lireReco); } catch (e) { erreur = e; }
    assert.equal(erreur?.code, 'reconnexion');
    assert.match(messageLecture(erreur), /Reconnecte-toi/);
    assert.equal(messageLecture(new Error('autre')), TEXTE_ERREUR_LECTURE);
  });
});

describe('D4 villes d’achat', () => {
  test('D4 lues dans la vue des prix, filtrées sur les articles demandés, agence sinon ville ; aucun appel sans article', async () => {
    const { f, c } = clientDe(FAUSSES());
    assert.deepEqual(await lireVilles([], c), {});
    assert.equal(f.appels.length, 0);
    const v = await lireVilles(['a1', 'a2'], c);
    assert.deepEqual(v, { a1: ['Manosque'], a2: ['Agence Nord'] });
    assert.equal(f.appels[0].searchParams.get('article_fournisseur_id'), 'in.("a1","a2")');
    assert.equal(f.appels[0].searchParams.get('order'), 'ligne_id.asc');
  });
  test('D4 vue absente : la lecture lève une erreur (la fenêtre s’ouvre quand même et dit « Villes indisponibles »)', async () => {
    const t = FAUSSES();
    delete t.v_td_prix_lignes;
    const { c } = clientDe(t);
    await assert.rejects(() => lireVilles(['a1'], c));
  });
});

describe('D5 export CSV', () => {
  test('D5 fichier lisible dans Excel : marque d’ordre, « ; », virgule décimale, formules protégées, une ligne par article', async () => {
    const { c } = clientDe(FAUSSES());
    const d = await lireDonnees(c);
    const liste = construireListe(d.articles, d.rapprochements, d.references, statistiquesLignes(d.lignes), d.refusees);
    const csv = articlesCsv(liste);
    assert.ok(csv.startsWith(BOM));
    const lignes = csv.slice(1).split('\r\n');
    assert.equal(lignes[0], ENTETES.join(';'));
    assert.equal(lignes.length, 1 + liste.length + 1); // en-têtes + articles + fin de ligne
    assert.match(lignes[1], /^Bois du Sud;R1;Planche 27 mm;u;10;01\/03\/2026;1;Validé;Planche 27;u;1$/);
    assert.match(lignes[2], /^Fer et Fils;;Planche 27;u;2,5;01\/03\/2026;1;À rapprocher;;;$/);
    assert.equal(protegerFormule('=SOMME(A1)'), '\'=SOMME(A1)');
    assert.equal(construireCsv(['a'], [['x;y']]), `${BOM}a\r\n"x;y"\r\n`);
  });
  test('D5 nom du fichier avec la date de Paris ; l’export de Réglages relit tout et dit quand la liste est tronquée', async () => {
    assert.equal(nomFichier(new Date('2026-11-24T23:30:00Z')), 'articles-2026-11-25.csv');
    const envois = [];
    const lu = { articles: [], references: [], rapprochements: [], lignes: [], refusees: [], tronque: false };
    const avis = [];
    const prevenir = (m) => avis.push(m);
    assert.equal(await exporterTout({ lire: async () => lu, telecharger: (nom, contenu) => envois.push([nom, contenu]), maintenant: new Date('2026-11-24T10:00:00Z'), prevenir }), true);
    assert.equal(envois.length, 1);
    assert.deepEqual(avis, ['0 article exporté']);
    assert.equal(await exporterTout({ lire: async () => ({ ...lu, tronque: true }), telecharger: () => {}, prevenir }), true);
    assert.match(avis[1], /trop longue/);
    assert.equal(envois[0][0], 'articles-2026-11-24.csv');
    assert.equal(await exporterTout({ lire: async () => { throw new Error('panne'); }, telecharger: () => { throw new Error('ne doit pas partir'); }, prevenir }), false);
    assert.equal(avis.at(-1), 'Export impossible : vérifie ta connexion à la base, puis réessaie.');
  });
});

describe('D6 écritures : seulement par les actions métier, un ticket neuf à chaque appel', () => {
  test('D6 chaque geste envoie son action et ses champs au webhook « actions » ; l’IA passe par « suggestions »', async () => {
    const envoyes = [];
    const tickets = [];
    const reseau = async (url, init) => {
      envoyes.push({ url, corps: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, article_reference_id: 'r9', suggestions: 3 }) };
    };
    const actions = creerActions({ lireConnexion: connexion, demanderTicket: async (usage) => { tickets.push(usage); return `ticket-${tickets.length}`; }, fetchImpl: reseau });
    const m = await import('../js/modules/achatsarticles/logique.js');
    await actions.appelerActionMetier('valider_rapprochement', m.corpsValidation('a1', 'r1', 0.5));
    await actions.appelerActionMetier('refuser_suggestion', m.corpsRefus('a2'));
    await actions.appelerActionMetier('reprendre_suggestion', m.corpsReprise('a2'));
    await actions.appelerActionMetier('dissocier_rapprochement', m.corpsDissociation('a1'));
    await actions.appelerActionMetier('renommer_reference', m.corpsRenommage('r1', '  Planche   27 '));
    await actions.appelerActionMetier('creer_article_reference', m.corpsCreationReference('Planche  28', ' u '));
    await actions.demanderSuggestions();
    assert.deepEqual(envoyes.map((e) => e.corps.action ?? 'suggestions'), ['valider_rapprochement', 'refuser_suggestion', 'reprendre_suggestion', 'dissocier_rapprochement', 'renommer_reference', 'creer_article_reference', 'suggestions']);
    assert.deepEqual(envoyes[0].corps, { article_fournisseur_id: 'a1', article_reference_id: 'r1', coefficient: 0.5, action: 'valider_rapprochement' });
    assert.deepEqual(envoyes[4].corps, { article_reference_id: 'r1', nom: 'Planche 27', action: 'renommer_reference' });
    assert.deepEqual(envoyes[5].corps, { nom: 'Planche 28', unite_reference: 'u', action: 'creer_article_reference' });
    assert.equal(new Set(envoyes.map((e) => e.auth)).size, 7, 'un ticket neuf par appel');
    assert.deepEqual(tickets, ['actions', 'actions', 'actions', 'actions', 'actions', 'actions', 'suggestions']);
  });
});
