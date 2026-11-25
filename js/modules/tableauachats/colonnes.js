// Module Achats « Tableau de bord 2 » : noms des vues et des colonnes lues, et conversion des lignes lues en données sûres. LOGIQUE PURE (aucun réseau, aucun import de la couche d'accès), testée par node.
import { nombre } from './formats.js';

export const VUE_FACTURES = 'v_td_factures';
export const VUE_CHANTIERS = 'v_td_chantiers';
export const VUE_PRIX_LIGNES = 'v_td_prix_lignes';
export const VUE_PRIX_ARTICLES = 'v_td_prix_evolution';
export const VUE_PRIX_PONTS = 'v_td_prix_ponts';
export const VUE_FOURN_FICHES = 'v_td_fournisseurs_fiches';
export const VUE_FOURN_AGENCES = 'v_td_fournisseurs_agences';
export const VUE_FOURN_FACTURES = 'v_td_fournisseurs_factures';

// Colonnes lues (jamais d'étoile) : ni adresse e-mail, ni IBAN, ni chemin de fichier. `archivee_le` ne sert qu'au filtre ci-dessous.
export const COLONNES_FACTURES = ['facture_id', 'fournisseur', 'numero', 'chantier_id', 'chantier', 'sans_chantier', 'client', 'type_document', 'statut', 'statut_fr', 'montant_ht', 'date_ref', 'mois', 'created_at', 'date_decision', 'nb_alertes', 'acceptee_malgre_alerte', 'jours_attente', 'date_future', 'fournisseur_affiche', 'siret_agence', 'archivee_le'];
export const COLONNES_CHANTIERS = ['chantier_id', 'chantier', 'client', 'statut', 'statut_fr', 'archive', 'budget_ht', 'budget_renseigne', 'accepte_ht', 'en_attente_ht', 'reste_ht', 'pct_budget_consomme', 'niveau'];
export const COLONNES_PRIX_LIGNES = ['ligne_id', 'facture_id', 'numero', 'date_prix', 'fournisseur', 'etablissement_id', 'nom_agence', 'ville', 'chantier_id', 'chantier', 'article_fournisseur_id', 'reference_fournisseur', 'designation', 'unite', 'unite_normalisee', 'quantite', 'montant_ht', 'prix_net', 'article_reference_id', 'libelle_reference', 'unite_reference', 'coefficient', 'prix_unite_reference', 'rapproche', 'origine_rapprochement'];
export const COLONNES_PRIX_ARTICLES = ['article_fournisseur_id', 'fournisseur', 'reference_fournisseur', 'designation', 'unite', 'article_reference_id', 'libelle_reference', 'unite_reference', 'coefficient', 'rapproche', 'origine_rapprochement'];
export const COLONNES_PRIX_PONTS = ['article_source_id', 'article_cible_id', 'fournisseur', 'designation', 'reference_cible', 'motif', 'origine', 'cible_rapprochee', 'source_rapprochee', 'applique', 'libelle_reference'];
export const COLONNES_FOURN_FICHES = ['fournisseur_id', 'fournisseur', 'siren', 'nb_agences'];
export const COLONNES_FOURN_AGENCES = ['etablissement_id', 'fournisseur_id', 'nom_agence', 'ville', 'siret'];
export const COLONNES_FOURN_FACTURES = ['facture_id', 'numero', 'date_ref', 'fournisseur_id', 'fournisseur', 'siren', 'etablissement_id', 'chantier', 'type_document', 'montant_ht', 'nb_lignes'];

/**
 * Une facture REFUSÉE puis ARCHIVÉE ne compte dans aucun montant et ne doit plus apparaître (liste, graphiques, totaux) ; une facture ACCEPTÉE archivée reste.
 * La vue expose `archivee_le` mais ne filtre rien. L'appli d'origine filtrait côté base (« ou ») ; la couche d'accès de l'OS n'a pas de filtre « ou » : le même filtre est fait ici, à la lecture.
 */
export const factureVisible = (f) => f.archivee_le === null || f.archivee_le === undefined || f.statut !== 'refusee';

const texte = (v) => (v === null || v === undefined ? null : String(v));
const origine = (v) => (v === 'valide' || v === 'automatique' ? v : null);

export function enLignePrix(x) {
  return {
    ligne_id: String(x.ligne_id), facture_id: String(x.facture_id), numero: texte(x.numero), date_prix: String(x.date_prix ?? ''), fournisseur: texte(x.fournisseur),
    etablissement_id: texte(x.etablissement_id), nom_agence: texte(x.nom_agence), ville: texte(x.ville), chantier_id: texte(x.chantier_id), chantier: texte(x.chantier),
    article_fournisseur_id: texte(x.article_fournisseur_id), reference_fournisseur: texte(x.reference_fournisseur), designation: texte(x.designation), unite: texte(x.unite), unite_normalisee: texte(x.unite_normalisee),
    quantite: nombre(x.quantite) ?? 0, montant_ht: nombre(x.montant_ht) ?? 0, prix_net: nombre(x.prix_net),
    article_reference_id: texte(x.article_reference_id), libelle_reference: texte(x.libelle_reference), unite_reference: texte(x.unite_reference),
    coefficient: nombre(x.coefficient), prix_unite_reference: nombre(x.prix_unite_reference), rapproche: x.rapproche === true, origine_rapprochement: origine(x.origine_rapprochement),
  };
}
export const enAttributs = (x) => ({
  article_fournisseur_id: String(x.article_fournisseur_id), fournisseur: texte(x.fournisseur), reference_fournisseur: texte(x.reference_fournisseur), designation: texte(x.designation), unite: texte(x.unite),
  article_reference_id: texte(x.article_reference_id), libelle_reference: texte(x.libelle_reference), unite_reference: texte(x.unite_reference), coefficient: nombre(x.coefficient),
  rapproche: x.rapproche === true, origine_rapprochement: origine(x.origine_rapprochement),
});
export const enPont = (x) => ({
  article_source_id: String(x.article_source_id), article_cible_id: String(x.article_cible_id), fournisseur: texte(x.fournisseur), designation: texte(x.designation), reference_cible: texte(x.reference_cible),
  motif: texte(x.motif), origine: texte(x.origine), cible_rapprochee: x.cible_rapprochee === true, source_rapprochee: x.source_rapprochee === true, applique: x.applique === true, libelle_reference: texte(x.libelle_reference),
});
export const enFactureTableau = (x) => ({
  ...x, montant_ht: nombre(x.montant_ht), nb_alertes: nombre(x.nb_alertes) ?? 0, jours_attente: nombre(x.jours_attente),
  acceptee_malgre_alerte: x.acceptee_malgre_alerte === null || x.acceptee_malgre_alerte === undefined ? null : x.acceptee_malgre_alerte === true,
  sans_chantier: x.sans_chantier === true, date_future: x.date_future === true, chantier: x.chantier ?? '',
});

/** Message commun des lectures qui ont atteint le plafond de pages (jamais une liste coupée présentée comme complète). */
export const messages = (...reponses) => [...new Set(reponses.map((r) => r.message).filter(Boolean))].join(' ');

