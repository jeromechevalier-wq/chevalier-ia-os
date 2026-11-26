// Outils d'essai des tests Achats de l'assistant (tests/mcp-achats-*.test.js) : un faux `pg` qui garde des tables en mémoire et comprend les SELECT
// fabriqués par functions/src/base/porte-requetes.js, un faux réseau (webhooks n8n) et le service creerAssistantAchats prêt à l'emploi.
// Aucune donnée réelle : adresses en exemple.test, identifiants inventés.
import { validerConfiguration } from '../functions/src/base/porte-base.js';
import { SQL_CATALOGUE_RELATIONS, SQL_CATALOGUE_FONCTIONS } from '../functions/src/base/porte-requetes.js';
import {
  creerAssistantAchats, COLONNES_FACTURE, COLONNES_CHANTIERS, COLONNES_AGENCES, COLONNES_FOURNISSEURS, COLONNES_LIGNE, COLONNES_IBANS,
} from '../functions/src/base/assistant-achats.js';

export const EMAIL = 'lea@exemple.test';
export const INTRUS = 'intrus@exemple.test';
export const N8N = 'https://n8n.exemple.test';
export const WEBHOOKS = {
  validation: `${N8N}/webhook/validation`, actions: `${N8N}/webhook/actions`, suggestions: `${N8N}/webhook/suggestions`, ajoutFacture: `${N8N}/webhook/ajout`,
};
export const CONNEXION = { adresseBase: 'https://base.exemple.test', webhooks: WEBHOOKS };
export const CONFIG = validerConfiguration(JSON.stringify({
  instance: 'projet-essai:europe-west9:base', base: 'achats', utilisateur: 'porte_fn', mot_de_passe: 'mdp-essai', espace: 'espace-essai',
  bucket: 'reserve-essai', cle_liens: 'k'.repeat(48), origines: ['https://site-essai.web.app'],
}));

/** Identifiants inventés (uuid valides). */
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const F1 = id(1); // à valider
export const F2 = id(2); // acceptée, sans chantier
export const F3 = id(3); // refusée, archivée
export const CH_OUVERT = id(101);
export const CH_TERMINE = id(102);
export const AG_ACTIVE = id(201);
export const AG_INACTIVE = id(202);
export const FO1 = id(301);

const TABLES_COLONNES = {
  factures: COLONNES_FACTURE,
  chantiers: COLONNES_CHANTIERS,
  etablissements_fournisseur: COLONNES_AGENCES,
  fournisseurs: COLONNES_FOURNISSEURS,
  lignes_facture: [...COLONNES_LIGNE, 'facture_id', 'id'],
  ibans_confirmes: COLONNES_IBANS,
  favoris_os: ['utilisateur', 'cle'], // hors liste de l'assistant : jamais lue
};
const RELATIONS = Object.entries(TABLES_COLONNES).flatMap(([t, cols]) => [...new Set(cols)].map((c) => ({ relation: t, colonne: c, type: c === 'id' || c.endsWith('_id') ? 'uuid' : 'text' })));
const FONCTIONS = [
  { nom: 'demander_ticket_n8n', ensemble: false, composite: false, vide: false, noms: ['p_usage'], modes: [], types: ['text'] },
  { nom: 'rouvrir_facture', ensemble: false, composite: false, vide: false, noms: ['p_id'], modes: [], types: ['uuid'] },
];

/** Extraction « propre » : totaux justes, SIRET présent ; les contrôles de l'écran n'y voient rien d'anormal (ou peu). */
const extraction = { total_ht: 100, total_tva: 20, total_ttc: 120, fournisseur: { nom: 'Matériaux Essai', siret: '12345678900011' }, iban: 'FR7612345678901234567890123' };

export function donneesDeBase() {
  return {
    factures: [
      { id: F1, fournisseur: 'Matériaux Essai', numero: 'FA-1', date_facture: '2026-11-20', montant_ht: 100, montant_tva: 20, montant_ttc: 120, statut: 'a_valider', archivee_le: null, type_document: 'facture', chantier_id: CH_OUVERT, extraction_erreur: null, created_at: '2026-11-20T10:00:00Z', extraction, fichier_path: 'espace-essai/2026/fa-1.pdf', decide_par: null, archivee_par: null, alertes_a_la_decision: null, fournisseur_siren: '123456789', numero_normalise: 'FA1', iban_normalise: null, etablissement_id: AG_ACTIVE, email_expediteur: 'factures@fournisseur.exemple.test' },
      { id: F2, fournisseur: 'Bois Essai', numero: 'FB-2', date_facture: '2026-11-18', montant_ht: 50, montant_ttc: 60, statut: 'acceptee', archivee_le: null, type_document: 'facture', chantier_id: null, extraction_erreur: 'echec', created_at: '2026-11-18T10:00:00Z', extraction: null, fichier_path: null, decide_par: 'chef@exemple.test', archivee_par: null },
      { id: F3, fournisseur: 'Peinture Essai', numero: 'FC-3', date_facture: '2026-10-01', montant_ht: 10, montant_ttc: 12, statut: 'refusee', archivee_le: '2026-11-01T00:00:00Z', type_document: 'facture', chantier_id: null, extraction_erreur: null, created_at: '2026-10-01T10:00:00Z', archivee_par: 'chef@exemple.test' },
    ],
    chantiers: [
      { id: CH_OUVERT, nom: 'Maison Dupont', client: 'Dupont', adresse: '1 rue Essai', statut: 'en_cours', code: 'C-1', archive: false },
      { id: CH_TERMINE, nom: 'Garage Martin', client: 'Martin', adresse: '2 rue Essai', statut: 'termine', code: 'C-2', archive: false },
    ],
    etablissements_fournisseur: [
      { id: AG_ACTIVE, fournisseur_id: FO1, siret: '12345678900011', nom_agence: 'Agence Manosque', ville: 'Manosque', actif: true, fusionne_dans: null },
      { id: AG_INACTIVE, fournisseur_id: FO1, siret: '12345678900029', nom_agence: 'Agence fermée', ville: 'Digne', actif: false, fusionne_dans: null },
    ],
    fournisseurs: [{ id: FO1, siren: '123456789', nom: 'Matériaux Essai', statut: 'actif' }],
    lignes_facture: [{ id: id(401), facture_id: F1, position: 1, designation: 'Ciment', quantite: 1, unite: 'u', prix_unitaire_ht: 100, montant_ht: 100, taux_tva: 20 }],
    ibans_confirmes: [],
    favoris_os: [],
  };
}

// ————— évaluation des SELECT fabriqués par porte-requetes.js —————

function regexLike(motif) {
  let r = '';
  for (let i = 0; i < motif.length; i += 1) {
    const c = motif[i];
    if (c === '\\' && i + 1 < motif.length) { r += motif[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); i += 1; } else if (c === '%') r += '.*';
    else if (c === '_') r += '.';
    else r += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`, 'is');
}

function filtrer(lignes, where, valeurs) {
  if (!where) return lignes;
  const conditions = where.split(' and ').map((m) => {
    let neg = false;
    let t = m;
    if (t.startsWith('not (') && t.endsWith(')')) { neg = true; t = t.slice(5, -1); }
    let x;
    let f;
    if ((x = t.match(/^"(\w+)" is (not )?null$/))) f = (l) => ((l[x[1]] ?? null) === null) !== !!x[2];
    else if ((x = t.match(/^"(\w+)" = any\(\$(\d+)\)$/))) f = (l) => valeurs[x[2] - 1].includes(String(l[x[1]]));
    else if ((x = t.match(/^"(\w+)"::text ilike \$(\d+)$/))) { const re = regexLike(valeurs[x[2] - 1]); f = (l) => re.test(String(l[x[1]] ?? '')); }
    else if ((x = t.match(/^"(\w+)" (=|<>) \$(\d+)$/))) f = (l) => (String(l[x[1]]) === String(valeurs[x[3] - 1])) === (x[2] === '=');
    else throw new Error(`condition non comprise par le faux pg : ${t}`);
    return neg ? (l) => !f(l) : f;
  });
  return lignes.filter((l) => conditions.every((c) => c(l)));
}

/**
 * Faux `pg` : tables en mémoire (`donnees`), journal de chaque requête, `panne(sql)` peut lever. Le ticket : `tickets` (compteur), ou `ticket(usage)`.
 * Toute écriture SQL (insert, update, delete) fait échouer le test (l'assistant n'écrit jamais en SQL).
 */
export function fausseBase({ donnees = donneesDeBase(), panne = null, ticket = null } = {}) {
  const journal = [];
  let tickets = 0;
  const transactions = [];
  const ouvrir = async () => ({
    async interroger(sql, valeurs = []) {
      journal.push({ sql, valeurs });
      if (panne) { const r = panne(sql, valeurs); if (r) return r; }
      if (sql === SQL_CATALOGUE_RELATIONS) return { rows: RELATIONS };
      if (sql === SQL_CATALOGUE_FONCTIONS) return { rows: FONCTIONS };
      if (sql.startsWith('begin')) { transactions.push({ lectureSeule: sql === 'begin read only' }); return { rows: [] }; }
      if (/^(commit|rollback|set local role)/.test(sql) || sql.startsWith("select set_config('app.espace_id'")) return { rows: [] };
      if (sql.includes('"demander_ticket_n8n"')) { tickets += 1; return { rows: [{ valeur: ticket ? ticket(valeurs[0]) : `ticket-${tickets}` }] }; }
      if (/^(insert|update|delete)/i.test(sql)) throw new Error(`écriture SQL interdite à l'assistant : ${sql.slice(0, 60)}`);
      let x = sql.match(/^select count\(\*\) as total from public\."(\w+)"(?: where (.*))?$/s);
      if (x) return { rows: [{ total: filtrer(donnees[x[1]] ?? [], x[2], valeurs).length }] };
      x = sql.match(/^select (.+?) from public\."(\w+)"(?: where (.*?))?(?: order by .*?)? limit \$(\d+) offset \$(\d+)$/s);
      if (x) {
        const cols = x[1].split(', ').map((c) => c.replace(/"/g, ''));
        const limite = valeurs[x[4] - 1];
        const decalage = valeurs[x[5] - 1];
        const lignes = filtrer(donnees[x[2]] ?? [], x[3], valeurs).slice(decalage, decalage + limite);
        return { rows: lignes.map((l) => Object.fromEntries(cols.map((c) => [c, l[c] ?? null]))) };
      }
      throw new Error(`requête non comprise par le faux pg : ${sql.slice(0, 80)}`);
    },
    liberer() {},
  });
  return {
    ouvrir, journal, donnees, transactions,
    sqls: () => journal.map((j) => j.sql),
    tickets: () => tickets,
    tablesLues: () => [...new Set(journal.map((j) => j.sql.match(/from public\."(\w+)"/)?.[1]).filter(Boolean))],
  };
}

/** Réponse HTTP minimale. */
export const reponse = (status, corps) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (corps === undefined) throw new Error('pas de JSON'); return corps; } });

/** Faux réseau : note chaque appel ({ url, init }) ; `repondre(appel, n)` rend une réponse ou lève. */
export function fauxReseau(repondre = () => reponse(200, { ok: true })) {
  const appels = [];
  const reseau = async (url, init) => { appels.push({ url, init }); return repondre({ url, init }, appels.length); };
  return { reseau, appels };
}

/** Service prêt à l'emploi ; tout se surcharge. */
export function service({
  base = fausseBase(), reseau = fauxReseau(), comptes = [EMAIL], connexion = CONNEXION, n8n = N8N, config = async () => CONFIG, maintenant = () => 1_800_000_000_000, journal = [], ouvertures = { n: 0 },
} = {}) {
  const s = creerAssistantAchats({
    lireConfiguration: config,
    ouvrirConnexion: async (c) => { ouvertures.n += 1; return base.ouvrir(c); },
    estCompteAutorise: async (email) => comptes.includes(email),
    lireConnexion: async () => (typeof connexion === 'function' ? connexion() : connexion),
    lireAdresseN8n: async () => n8n,
    reseau: reseau.reseau,
    maintenant,
    journal: (e) => journal.push(e),
  });
  return { s, base, reseau, journal, ouvertures };
}

/** Un PDF minimal acceptable par les contrôles de l'écran (en-tête %PDF-, fin %%EOF, taille suffisante). */
export function pdfEssai(taille = 4096) {
  const debut = Buffer.from('%PDF-1.7\n');
  const fin = Buffer.from('\n%%EOF\n');
  return Buffer.concat([debut, Buffer.alloc(Math.max(0, taille - debut.length - fin.length), 0x20), fin]);
}
