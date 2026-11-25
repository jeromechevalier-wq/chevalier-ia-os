// Fausses données du module Achats « Fournisseurs » (tout est inventé : aucun vrai fournisseur, aucun vrai IBAN valable). Jamais importées par le code de l'appli (tests/ n'est pas publié).
// Servent aux tests de logique (node) et aux parcours navigateur (faux réseau du crochet window.__accesBase).
export const IBAN = 'FR7630006000011234567890189';
export const IBAN2 = 'FR1420041010050500013M02606';
export const IBAN3 = 'DE89370400440532013000';

/** Une ligne de la vue des fournisseurs à vérifier. */
export const ligne = (o = {}) => ({
  fournisseur_id: 'fo', siren: '830825741', nom: 'Point P', iban: IBAN, nb_factures: 2, derniere_facture_le: '2026-11-18T09:00:00Z', a_une_facture_acceptee: false, vu_seulement_sur_refusee: false,
  facture_a_confirmer: 'f1', revoque_le: null, motif_revocation: null, confirme_pour_autre_siren: false, vu_chez_autre_siren: false, ...o,
});

/** Une confirmation d'IBAN lue dans la table des IBAN confirmés (avec le nom du fournisseur). */
export const conf = (o = {}) => ({
  id: 'c1', fournisseur_id: 'fo', nom: 'Point P', siren: '830825741', iban: IBAN, facture_id: 'f1', moyen_verification: 'Appel au numéro connu', confirme_par: 'a@b.fr',
  confirme_le: '2026-11-10T10:00:00Z', revoque_le: null, motif_revocation: null, ...o,
});

/**
 * Jeu de démonstration des parcours navigateur : un fournisseur de chaque état.
 * Lu par le faux réseau : `fournisseurs_a_verifier` (file), `ibans_confirmes` (sans le nom) et `fournisseurs` (id, nom).
 */
export function jeuDemo() {
  const file = [
    ligne({ fournisseur_id: 'f-aciers', nom: 'Aciers Exemple', siren: '900000001', iban: IBAN, nb_factures: 4, derniere_facture_le: '2026-11-20T09:00:00Z', facture_a_confirmer: 'fa-1' }),
    ligne({ fournisseur_id: 'f-negoce', nom: 'Négoce Démo', siren: '900000002', iban: IBAN2, nb_factures: 2, derniere_facture_le: '2026-11-15T09:00:00Z', facture_a_confirmer: 'fa-2', vu_chez_autre_siren: true }),
    ligne({ fournisseur_id: 'f-beton', nom: 'Béton Démo', siren: '900000003', iban: IBAN3, nb_factures: 1, derniere_facture_le: '2026-10-02T09:00:00Z', facture_a_confirmer: 'fa-3', revoque_le: '2026-11-01T08:00:00Z', motif_revocation: 'RIB changé' }),
  ];
  const confirmations = [
    { id: 'ic-1', fournisseur_id: 'f-quinc', siren: '900000004', iban: 'FR7611111222223333344444555', facture_id: 'fa-9', moyen_verification: 'Appel au numéro connu', confirme_par: 'a@b.fr', confirme_le: '2026-11-10T10:00:00Z', revoque_le: null, motif_revocation: null },
  ];
  const fournisseurs = [
    { id: 'f-aciers', nom: 'Aciers Exemple' }, { id: 'f-negoce', nom: 'Négoce Démo' }, { id: 'f-beton', nom: 'Béton Démo' }, { id: 'f-quinc', nom: 'Quincaillerie Fictive' },
  ];
  return { file, confirmations, fournisseurs };
}
