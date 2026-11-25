// Données de la page « Examiner » du module Achats « Factures » (PR 8b). Les LECTURES passent seulement par le client de la base (js/os/supabase.js : tables nommées, colonnes nommées, tri obligatoire, plafond de pages) ;
// les ÉCRITURES qui comptent (valider, refuser, créer une agence, archiver, rouvrir, relier, ajouter une facture) seulement par la couche des actions (js/os/actions-metier.js : ticket neuf à usage unique,
// n8n garde les règles : rien n'est recopié ici). Le lien du PDF vient du client (`lienPdf` : adresse signée, jamais écrite en dur). Aucun appel réseau n'est écrit ici.
// Écart avec l'appli d'origine : elle lisait avec des jointures (`chantiers(nom)`, `fournisseurs(...)` dans les agences) ; le client ne lit qu'une table à la fois : les jointures sont refaites ici (même résultat).
import { COLONNES_COURRIEL } from './courriel.js';
import { LIMITE_HISTORIQUE, LIMITE_IBAN_AILLEURS } from './pastilles.js';
import { COLONNES_IBANS, TABLE_IBANS, TABLE_FACTURES, TABLE_CHANTIERS, TABLE_AGENCES } from './donnees.js';
import { corpsCreationAgence } from './agences.js';
import { corpsLiaison, corpsRouverture, construireCorps } from './decision.js';

export const COLONNES_FACTURE_EXAMINER = ['id', 'chantier_id', 'fournisseur', 'numero', 'date_facture', 'montant_ht', 'montant_tva', 'montant_ttc', 'statut', 'motif_refus', 'date_decision', 'decide_par',
  'fichier_path', 'email_expediteur', 'created_at', 'extraction', 'extraction_erreur', 'alertes_a_la_decision', 'acceptee_malgre_alerte', 'motif_acceptation', 'fournisseur_siren', 'numero_normalise',
  'iban_normalise', 'etablissement_id', 'type_document', 'lignes_etat', 'lignes_somme_ht', 'archivee_le', 'archivee_par', 'courriel_id'];
export const COLONNES_LIEES = ['id', 'statut', 'numero', 'numero_normalise', 'montant_ttc', 'date_facture', 'fournisseur', 'fournisseur_siren', 'iban_normalise', 'email_expediteur', 'etablissement_id', 'date_decision'];
export const COLONNES_CHANTIERS_EXAMINER = ['id', 'nom', 'client', 'adresse', 'statut', 'code', 'archive'];
export const COLONNES_AGENCES_EXAMINER = ['id', 'fournisseur_id', 'siret', 'nom_agence', 'ville', 'actif', 'fusionne_dans'];
export const TABLE_FOURNISSEURS = 'fournisseurs';
export const COLONNES_FOURNISSEURS = ['id', 'siren', 'nom', 'statut'];
export const TABLE_COURRIELS = 'courriels_recus';
export const TABLE_LIGNES_FACTURE = 'lignes_facture';
export const COLONNES_LIGNE = ['position', 'reference_fournisseur', 'designation', 'quantite', 'unite', 'prix_unitaire_ht', 'remise_pct', 'montant_ht', 'taux_tva'];
export const DOSSIER_PDF = 'factures';
export const SECONDES_LIEN_PDF = 600;

const valeur = (x) => (typeof x === 'function' ? x() : x);

/** @param {{ client: object | (() => object), actions: object | (() => object) }} dep */
export function creerDonneesExaminer({ client, actions }) {
  /** Une facture par son identifiant (null si introuvable), avec le nom de son chantier (jointure refaite ici). Lève une erreur si la lecture échoue. */
  async function lireFacture(id) {
    const c = valeur(client);
    const r = await c.lire(TABLE_FACTURES, { colonnes: COLONNES_FACTURE_EXAMINER, filtres: [['id', 'eq', id]], tri: ['id'] });
    const f = r.lignes[0];
    if (!f) return null;
    let chantiers = null;
    if (f.chantier_id) {
      try { const ch = await c.lire(TABLE_CHANTIERS, { colonnes: ['id', 'nom'], filtres: [['id', 'eq', f.chantier_id]], tri: ['id'] }); chantiers = ch.lignes[0] ? { nom: ch.lignes[0].nom } : null; } catch { chantiers = null; }
    }
    return { ...f, archivee_le: f.archivee_le ?? null, chantiers };
  }

  /** Courriel d'où vient la fiche. Ne lève JAMAIS d'erreur : identifiant vide, erreur de lecture ou courriel introuvable donnent null (une erreur ici n'empêche jamais d'ouvrir la fiche). */
  async function lireCourriel(courrielId) {
    if (!courrielId) return null;
    try {
      const r = await valeur(client).lire(TABLE_COURRIELS, { colonnes: COLONNES_COURRIEL, filtres: [['id', 'eq', courrielId]], tri: ['id'], pagesMax: 1 });
      return r.lignes[0] ?? null;
    } catch { return null; }
  }

  /** Autres factures du même fournisseur (même SIREN). Renvoie null si la liste est incomplète (limite atteinte) ; lève une erreur si la lecture échoue (l'appelant passe alors null aux contrôles). */
  async function listerMemeFournisseur(siren, sauf) {
    const r = await valeur(client).lire(TABLE_FACTURES, { colonnes: COLONNES_LIEES, filtres: [['fournisseur_siren', 'eq', siren], ['id', 'neq', sauf]], tri: ['id'], tailleLot: LIMITE_HISTORIQUE, pagesMax: 1 });
    return r.tronque || r.lignes.length >= LIMITE_HISTORIQUE ? null : r.lignes;
  }

  /** Factures d'AUTRES fournisseurs (SIREN différent) qui portent le même IBAN. Même règle : null si la limite est atteinte. */
  async function listerMemeIbanAilleurs(iban, siren, sauf) {
    const r = await valeur(client).lire(TABLE_FACTURES, { colonnes: COLONNES_LIEES, filtres: [['iban_normalise', 'eq', iban], ['fournisseur_siren', 'neq', siren], ['id', 'neq', sauf]], tri: ['id'], tailleLot: LIMITE_IBAN_AILLEURS, pagesMax: 1 });
    return r.tronque || r.lignes.length >= LIMITE_IBAN_AILLEURS ? null : r.lignes;
  }

  /** Tous les chantiers (le tri se fait côté écran). Une lecture coupée par le plafond est une erreur (jamais une liste tronquée présentée comme complète). */
  async function listerChantiers() {
    const r = await valeur(client).lire(TABLE_CHANTIERS, { colonnes: COLONNES_CHANTIERS_EXAMINER, tri: ['id'] });
    if (r.tronque) throw new Error(r.message);
    return r.lignes;
  }

  /** Toutes les agences (actives ou non), avec leur entreprise (jointure refaite ici). Lecture coupée par le plafond : erreur. */
  async function listerAgences() {
    const c = valeur(client);
    const [ag, fo] = await Promise.all([
      c.lire(TABLE_AGENCES, { colonnes: COLONNES_AGENCES_EXAMINER, tri: ['id'] }),
      c.lire(TABLE_FOURNISSEURS, { colonnes: COLONNES_FOURNISSEURS, tri: ['id'] }),
    ]);
    if (ag.tronque || fo.tronque) throw new Error(ag.message || fo.message);
    const parId = new Map(fo.lignes.map((x) => [x.id, x]));
    return ag.lignes.map((a) => ({ ...a, fournisseur: parId.get(a.fournisseur_id) ?? null }));
  }

  /** Lignes d'une facture, dans l'ordre de la facture. Lève une erreur si la lecture échoue : l'écran dit « lecture impossible », jamais un faux « aucune ligne ». */
  async function listerLignes(factureId) {
    const r = await valeur(client).lire(TABLE_LIGNES_FACTURE, { colonnes: COLONNES_LIGNE, filtres: [['facture_id', 'eq', factureId]], tri: ['position'] });
    if (r.tronque) throw new Error(r.message);
    return r.lignes;
  }

  /** Confirmations d'IBAN (actives et révoquées). Lève une erreur si la lecture échoue ou est incomplète : les contrôles d'IBAN ne passent alors jamais au vert. */
  async function listerIbansConfirmes() {
    const r = await valeur(client).lire(TABLE_IBANS, { colonnes: COLONNES_IBANS, tri: [{ col: 'confirme_le', asc: false }, 'id'] });
    if (r.tronque) throw new Error(r.message);
    return r.lignes;
  }

  /** Lien temporaire (10 minutes) vers le PDF, renvoyé par la couche d'accès (adresse signée par la base). Lève une erreur si le PDF est absent ou inaccessible. */
  const lienPdf = (chemin) => valeur(client).lienPdf(DOSSIER_PDF, chemin, SECONDES_LIEN_PDF);

  // ---------------------------------------------------------------- écritures (n8n garde les règles ; le corps est fabriqué par la logique pure, jamais l'identité de la personne)
  /** Accepter ou refuser. Lève ErreurAction (message du serveur, `code`) si refus ; lève une Error claire si un choix ou le motif manque (rien n'est envoyé). */
  const decider = (factureId, decision, motif, alertes, choix) => valeur(actions).validerFacture(construireCorps(factureId, decision, motif, alertes, choix));
  const creerAgence = (champs) => valeur(actions).appelerActionMetier('creer_agence', corpsCreationAgence(champs));
  const archiver = (id) => valeur(actions).appelerActionMetier('archiver', { facture_id: id });
  const desarchiver = (id) => valeur(actions).appelerActionMetier('desarchiver', { facture_id: id });
  const rouvrir = (id, motif) => valeur(actions).appelerActionMetier('rouvrir', corpsRouverture(id, motif));
  const relier = (id, chantierId) => valeur(actions).appelerActionMetier('relier_chantier', corpsLiaison(id, chantierId));

  return { lireFacture, lireCourriel, listerMemeFournisseur, listerMemeIbanAilleurs, listerChantiers, listerAgences, listerLignes, listerIbansConfirmes, lienPdf, decider, creerAgence, archiver, desarchiver, rouvrir, relier };
}
