// Données du module Achats « Factures » (25/11/2026, PR 8a) : les LECTURES passent seulement par le client de la base (js/os/supabase.js : tables nommées, colonnes nommées,
// tri obligatoire, plafond de pages dit à l'écran) ; les ACTIONS qui comptent (archiver, désarchiver) seulement par la couche des actions (js/os/actions-metier.js : ticket neuf
// à usage unique, n8n garde les règles) ; les FAVORIS par les deux fonctions de la base (lister_favoris_os, basculer_favori_os). Aucun appel réseau n'est écrit ici.
// Le fichier ne connaît pas la coque : `client` et `actions` lui sont donnés (l'écran les prend dans js/os/acces-base.js ; les tests, un faux réseau).
//
// Écart avec l'appli d'origine : elle lisait les factures AVEC leurs jointures (`chantiers(nom)`, `etablissements_fournisseur(siret)`) ; le client de la base ne lit que des colonnes nommées
// d'une seule table : les chantiers et les agences sont lus à part, puis rattachés ici (même résultat : `f.chantiers = { nom }`, `f.etablissements_fournisseur = { siret }`).
// De même, « combien de lignes par facture à valider » se lit sur `lignes_facture` filtrée par identifiants (par paquets), sans la jointure `factures!inner(statut)`.
import { favorisDeReponse } from './favoris.js';
import { MAXIMUM_FACTURES } from './pastilles.js';

export const TABLE_FACTURES = 'factures';
/** Colonnes légères de la liste : pas le texte brut du PDF ni l'analyse (`extraction`, lourde : lue à part, seulement pour les factures « à valider »). */
export const COLONNES_FACTURES = ['id', 'fournisseur', 'numero', 'date_facture', 'montant_ht', 'montant_tva', 'montant_ttc', 'statut', 'motif_refus', 'date_decision', 'decide_par', 'created_at',
  'extraction_erreur', 'acceptee_malgre_alerte', 'type_document', 'fournisseur_siren', 'numero_normalise', 'iban_normalise', 'email_expediteur', 'lignes_etat', 'lignes_somme_ht', 'archivee_le',
  'chantier_id', 'etablissement_id'];
export const COLONNES_ANALYSES = ['id', 'extraction'];
export const TABLE_CHANTIERS = 'chantiers';
export const COLONNES_CHANTIERS = ['id', 'nom'];
export const TABLE_AGENCES = 'etablissements_fournisseur';
export const COLONNES_AGENCES = ['id', 'siret'];
export const TABLE_LIGNES = 'lignes_facture';
export const COLONNES_LIGNES = ['facture_id', 'position'];
export const TABLE_IBANS = 'ibans_confirmes';
export const COLONNES_IBANS = ['id', 'fournisseur_id', 'siren', 'iban', 'facture_id', 'moyen_verification', 'confirme_par', 'confirme_le', 'revoque_le', 'motif_revocation'];
/** Nombre d'identifiants de factures par requête pour compter les lignes (l'adresse de la requête reste courte). */
export const PAQUET_LIGNES = 80;

const valeur = (x) => (typeof x === 'function' ? x() : x);

/** Ajoute les analyses (`extraction`) lues à part ; une facture sans analyse lue garde `extraction: null`. */
export const fusionnerExtractions = (liste, extractions) => liste.map((f) => (f.id in extractions ? { ...f, extraction: extractions[f.id] } : f));

/** Rattache le nom du chantier et le SIRET de l'agence aux factures (les jointures de l'appli d'origine), et normalise `archivee_le` / `extraction`. */
export function rattacher(factures, chantiers, agences) {
  const nomDe = new Map(chantiers.map((c) => [c.id, c.nom]));
  const siretDe = new Map(agences.map((a) => [a.id, a.siret ?? null]));
  return factures.map((f) => ({
    ...f,
    archivee_le: f.archivee_le ?? null,
    extraction: null,
    chantiers: f.chantier_id && nomDe.has(f.chantier_id) ? { nom: nomDe.get(f.chantier_id) } : null,
    etablissements_fournisseur: f.etablissement_id && siretDe.has(f.etablissement_id) ? { siret: siretDe.get(f.etablissement_id) } : null,
  }));
}

/** @param {{ client: object | (() => object), actions: object | (() => object) }} dep */
export function creerDonnees({ client, actions }) {
  /**
   * Toutes les factures (archivées comprises : l'écran sépare les vues), avec le nom du chantier et le SIRET de l'agence, puis les analyses des factures « à valider ».
   * Renvoie { liste, complete, analysesLues, message }. `complete` = false si le plafond de lecture est atteint (la liste est dite incomplète à l'écran) ;
   * `analysesLues` = false si la 2e lecture (analyses) échoue : la liste reste utilisable, les pastilles des factures à valider restent grises.
   */
  async function chargerFactures() {
    const c = valeur(client);
    const lue = await c.lire(TABLE_FACTURES, { colonnes: COLONNES_FACTURES, tri: [{ col: 'created_at', asc: false }, 'id'] });
    const chantiers = await c.lire(TABLE_CHANTIERS, { colonnes: COLONNES_CHANTIERS, tri: ['id'] }); // une erreur ici est celle de la liste : on ne montre pas des factures sans leur chantier
    let agences = [];
    try { agences = (await c.lire(TABLE_AGENCES, { colonnes: COLONNES_AGENCES, tri: ['id'] })).lignes; } catch { agences = []; } // seulement pour l'étoile des fournisseurs : sans elle, la clé vient du SIREN de la facture
    const complete = !lue.tronque && lue.lignes.length < MAXIMUM_FACTURES;
    const liste = rattacher(lue.lignes, chantiers.lignes, agences);
    const message = [lue.message, chantiers.message].filter(Boolean).join(' ');
    // Analyses : seulement les factures à valider ; lecture incomplète ou en échec = liste sans analyses (jamais de contrôle sans l'analyse).
    try {
      const a = await c.lire(TABLE_FACTURES, { colonnes: COLONNES_ANALYSES, filtres: [['statut', 'eq', 'a_valider']], tri: ['id'] });
      if (a.tronque) throw new Error('Lecture des analyses incomplète');
      const par = {};
      for (const l of a.lignes) par[l.id] = l.extraction;
      return { liste: fusionnerExtractions(liste, par), complete, analysesLues: true, message };
    } catch {
      return { liste, complete, analysesLues: false, message };
    }
  }

  /**
   * Nombre de lignes lues par facture, pour les factures À VALIDER seulement (par paquets d'identifiants).
   * Renvoie null si la lecture échoue ou n'est pas complète : la pastille écarte alors le contrôle « Lignes » (jamais vert, jamais de faux danger).
   */
  async function chargerNombreLignes(liste) {
    const ids = liste.filter((f) => f.statut === 'a_valider').map((f) => f.id);
    const nombres = {};
    try {
      for (let i = 0; i < ids.length; i += PAQUET_LIGNES) {
        const r = await valeur(client).lire(TABLE_LIGNES, { colonnes: COLONNES_LIGNES, filtres: [['facture_id', 'in', ids.slice(i, i + PAQUET_LIGNES)]], tri: ['facture_id', 'position'] });
        if (r.tronque) return null;
        for (const l of r.lignes) nombres[l.facture_id] = (nombres[l.facture_id] ?? 0) + 1;
      }
      return nombres;
    } catch { return null; }
  }

  /** Confirmations d'IBAN (actives et révoquées). Renvoie null si la lecture échoue ou est incomplète : les contrôles d'IBAN ne passent alors jamais au vert. */
  async function chargerIbansConfirmes() {
    try {
      const r = await valeur(client).lire(TABLE_IBANS, { colonnes: COLONNES_IBANS, tri: [{ col: 'confirme_le', asc: false }, 'id'] });
      return r.tronque ? null : r.lignes;
    } catch { return null; }
  }

  /** Favoris (chantier, entreprise) de la personne connectée. */
  async function chargerFavoris() {
    return favorisDeReponse(await valeur(client).appeler('lister_favoris_os', {}));
  }

  /** Met ou retire le favori ; renvoie l'état APRÈS (true = en favori). */
  async function basculerFavori(genre, cle) {
    const r = await valeur(client).appeler('basculer_favori_os', { p_genre: genre, p_cle: cle });
    return r === true;
  }

  /** Archive une facture déjà décidée (le serveur refuse une facture « à valider »). Corps : `{ action, facture_id }`, rien d'autre. */
  const archiver = (id) => valeur(actions).appelerActionMetier('archiver', { facture_id: id });
  const desarchiver = (id) => valeur(actions).appelerActionMetier('desarchiver', { facture_id: id });

  return { chargerFactures, chargerNombreLignes, chargerIbansConfirmes, chargerFavoris, basculerFavori, archiver, desarchiver };
}
