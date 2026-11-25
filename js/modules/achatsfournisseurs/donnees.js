// Module Achats « Fournisseurs » : lectures dans la base de l'espace et écritures par les actions métier.
// Lecture : UNIQUEMENT par `clientBase().lire(...)` (vues ou tables nommées, colonnes nommées, tri, plafond de 20 pages DIT à l'écran).
// Écritures (confirmer ou révoquer un IBAN) : UNIQUEMENT par `actionsBase()` (ticket à usage unique ; l'automatisation garde les règles). Aucun appel réseau n'est écrit ici.
import { clientBase, actionsBase, connexionPrete } from '../../os/acces-base.js';
import { corpsConfirmation, corpsRevocation } from './logique.js';

export const VUE_A_VERIFIER = 'fournisseurs_a_verifier';
export const TABLE_CONFIRMATIONS = 'ibans_confirmes';
export const TABLE_FOURNISSEURS = 'fournisseurs';

export const COLONNES_A_VERIFIER = ['fournisseur_id', 'siren', 'nom', 'iban', 'nb_factures', 'derniere_facture_le', 'a_une_facture_acceptee', 'vu_seulement_sur_refusee', 'facture_a_confirmer', 'revoque_le', 'motif_revocation', 'confirme_pour_autre_siren', 'vu_chez_autre_siren'];
export const COLONNES_CONFIRMATION = ['id', 'fournisseur_id', 'siren', 'iban', 'facture_id', 'moyen_verification', 'confirme_par', 'confirme_le', 'revoque_le', 'motif_revocation'];
export const COLONNES_FOURNISSEUR = ['id', 'nom'];

/**
 * Lit la file « fournisseurs à vérifier » et les confirmations d'IBAN (avec le nom de leur fournisseur, lu à part : la couche d'accès ne lit pas de table liée).
 * Renvoie { file, confirmations, message } ; `message` n'est pas vide quand une lecture a atteint le plafond de pages (la liste est alors peut-être incomplète : l'écran le dit).
 * Lève l'erreur de la couche d'accès (« reconnexion », « connexion », « reseau », « refus »…) : jamais une liste coupée présentée comme complète.
 */
export async function lireFournisseurs() {
  await connexionPrete();
  const base = clientBase();
  const [file, confirmations, noms] = await Promise.all([
    base.lire(VUE_A_VERIFIER, { colonnes: COLONNES_A_VERIFIER, tri: ['fournisseur_id', 'iban'] }),
    base.lire(TABLE_CONFIRMATIONS, { colonnes: COLONNES_CONFIRMATION, tri: [{ col: 'confirme_le', asc: false }, 'id'] }),
    base.lire(TABLE_FOURNISSEURS, { colonnes: COLONNES_FOURNISSEUR, tri: ['id'] }),
  ]);
  const nomDe = new Map(noms.lignes.map((f) => [f.id, f.nom ?? null]));
  return {
    file: file.lignes,
    confirmations: confirmations.lignes.map((c) => ({ ...c, nom: nomDe.get(c.fournisseur_id) ?? null })),
    message: [...new Set([file, confirmations, noms].map((r) => r.message).filter(Boolean))].join(' '),
  };
}

/** Confirme à la main un IBAN, sur la facture que porte la ligne à vérifier d'origine. Lève un message français si le corps est invalide (rien n'est envoyé) ou si le serveur refuse. `existait` : déjà confirmé. */
export async function confirmerIban(ligne, moyen) {
  const corps = corpsConfirmation(ligne, moyen);
  await connexionPrete();
  return actionsBase().appelerActionMetier('confirmer_iban', corps);
}

/** Révoque une confirmation (motif de 3 à 500 caractères). L'ancienne confirmation reste dans l'historique. */
export async function revoquerIban(id, motif) {
  const corps = corpsRevocation(id, motif);
  await connexionPrete();
  return actionsBase().appelerActionMetier('revoquer_iban', corps);
}
