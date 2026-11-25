// Logique pure de la décision (PR 8b, portée de l'appli BTP : lib/decision.ts, liaison-chantier.ts, rouverture.ts), sans appel réseau : corps envoyés au serveur, motif, comparaison des noms.
// Le serveur (n8n) refait les mêmes contrôles de forme ; il enregistre ce que l'écran déclare, il ne recalcule pas les vérifications. Les alertes affichées viennent de controles.js (`alertesAffichees`).
import { nomsCoherents, ALERTES_MAX, TEXTE_MAX } from './controles.js';

export const MOTIF_MIN = 3;
export const MOTIF_MAX = 500;

export const motifValide = (m) => m.trim().length >= MOTIF_MIN && m.trim().length <= MOTIF_MAX;

/**
 * Corps envoyé au webhook de validation. « accepter » : `etablissement_id` obligatoire, `chantier_id` toujours envoyé (null s'il n'y en a pas) ; avec alertes : alertes + motif obligatoire ;
 * « refuser » : motif obligatoire (3 à 500 caractères), aucun chantier ni agence. Aucune identité de personne dans le corps (elle vient du ticket). Lève une erreur claire si un choix ou le motif manque.
 */
export function construireCorps(factureId, decision, motif, alertes, choix) {
  const m = (motif ?? '').trim();
  if (decision === 'refuser') {
    if (!motifValide(m)) throw new Error(`Explique pourquoi tu refuses la facture (de ${MOTIF_MIN} à ${MOTIF_MAX} caractères).`);
    return { facture_id: factureId, decision, motif: m };
  }
  if (!choix?.etablissement_id) throw new Error('Choisis l’agence du fournisseur pour accepter la facture.');
  const cible = { chantier_id: choix.chantier_id ?? null, etablissement_id: choix.etablissement_id };
  if (alertes && alertes.length > 0) {
    if (!motifValide(m)) throw new Error(`Explique pourquoi tu acceptes malgré l’alerte (au moins ${MOTIF_MIN} caractères).`);
    return { facture_id: factureId, decision, ...cible, alertes: alertes.slice(0, ALERTES_MAX), motif: m };
  }
  return { facture_id: factureId, decision, ...cible };
}

/** Comparaison du nom lu sur la facture et du nom de l'entreprise enregistrée de l'agence choisie : 'incoherent' / 'coherent', ou null si un des deux noms manque. */
export function comparerNomFournisseur(nomFacture, nomEnregistre) {
  const a = (nomFacture ?? '').trim(), b = (nomEnregistre ?? '').trim();
  if (!a || !b) return null;
  return nomsCoherents(a, b) ? 'coherent' : 'incoherent';
}

export const phraseNomDifferent = (nomFacture, nomEnregistre) =>
  `Le nom sur la facture (« ${nomFacture.trim()} ») est différent du fournisseur choisi (« ${nomEnregistre.trim()} »). Vérifie que c’est le bon.`;

/** Alerte orange ajoutée à l'acceptation quand les noms diffèrent (pas un 10e contrôle : le score reste sur 9). */
export function alerteNomFournisseur(nomFacture, nomEnregistre) {
  if (comparerNomFournisseur(nomFacture, nomEnregistre) !== 'incoherent') return null;
  return { code: 'nom-fournisseur', niveau: 'orange', message: phraseNomDifferent(nomFacture, nomEnregistre).slice(0, TEXTE_MAX) };
}

// ------------------------------------------------------------------ relier plus tard une facture acceptée à un chantier
export const AUCUN_CHANTIER = '__aucun_chantier__';
export const LIBELLE_AUCUN_CHANTIER = 'Aucun chantier pour l’instant';
export const AIDE_SANS_CHANTIER = 'Tu peux accepter sans chantier et relier la facture plus tard, depuis cet écran.';
export const PHRASE_LIAISON_ARCHIVEE = 'Sors-la des archives pour la relier à un chantier.';
export const MESSAGE_RELIEE = 'Facture reliée au chantier';

/** Ce que l'écran propose pour une facture décidée : 'aucune', 'bouton' (« Relier à un chantier ») ou 'archivee' (« sors-la des archives »). Seule une facture ACCEPTÉE et SANS chantier se relie. */
export function offreLiaison(f) {
  if (f.statut !== 'acceptee' || f.chantier_id) return 'aucune';
  return f.archivee_le ? 'archivee' : 'bouton';
}

/** Valeur du champ « Chantier » : l'option « Aucun chantier » quand rien n'est choisi. */
export const valeurChampChantier = (chantierId) => chantierId ?? AUCUN_CHANTIER;
/** Chantier à retenir pour ce que le champ renvoie (« Aucun chantier » = null). */
export const chantierDepuisChamp = (valeur) => (valeur === AUCUN_CHANTIER ? null : valeur);

/** Corps de l'action `relier_chantier` (sans l'action). Aucune identité. */
export function corpsLiaison(factureId, chantierId) {
  if (!chantierId) throw new Error('Choisis un chantier pour relier la facture.');
  return { facture_id: factureId, chantier_id: chantierId };
}

/** Refus du serveur qui disent que la FACTURE a changé depuis l'ouverture de l'écran : la fenêtre se ferme, le message s'affiche hors de la fenêtre et la facture est relue. */
export const CODES_LIAISON_PERIMEE = new Set(['facture_deja_reliee', 'liaison_facture_archivee', 'liaison_facture_non_acceptee', 'facture_introuvable']);

// ------------------------------------------------------------------ rouvrir une facture décidée
export const PHRASE_ARCHIVEE = 'Sors-la des archives pour la rouvrir.';
export const TEXTE_CONFIRMATION = 'La facture repasse « À valider ». L’ancienne décision reste dans le journal.';
export const MESSAGE_MOTIF = `Explique pourquoi tu rouvres la facture (de ${MOTIF_MIN} à ${MOTIF_MAX} caractères).`;
export const MESSAGE_ROUVERTE = 'Facture rouverte : elle est de nouveau « À valider »';

/** Ce que l'écran propose pour une facture : 'aucune' (à valider), 'bouton' ou 'archivee'. */
export function offreRouverture(f) {
  if (f.statut === 'a_valider') return 'aucune';
  return f.archivee_le ? 'archivee' : 'bouton';
}

/** Motif rogné ; lève un message français s'il n'a pas de 3 à 500 caractères. */
export function motifRouverture(motif) {
  const m = motif.trim();
  if (m.length < MOTIF_MIN || m.length > MOTIF_MAX) throw new Error(MESSAGE_MOTIF);
  return m;
}

/** Corps de l'action `rouvrir` (sans l'action). Aucune identité. */
export const corpsRouverture = (factureId, motif) => ({ facture_id: factureId, motif: motifRouverture(motif) });
