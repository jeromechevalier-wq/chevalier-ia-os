// Écritures du module Articles : TOUTES passent par les actions métier (js/os/acces-base.js > actionsBase, webhooks n8n, un ticket neuf par appel).
// Jamais d'écriture directe dans la base depuis le navigateur. Les corps des appels sont fabriqués par logique.js (testés).
import { actionsBase, connexionPrete } from '../../os/acces-base.js';
import { corpsCreationReference, corpsDissociation, corpsRefus, corpsRenommage, corpsReprise, corpsValidation } from './logique.js';

async function appeler(action, champs) {
  await connexionPrete();
  return actionsBase().appelerActionMetier(action, champs);
}

export const creerArticleReference = (nom, unite) => appeler('creer_article_reference', corpsCreationReference(nom, unite));
export const validerRapprochement = (articleFournisseurId, articleReferenceId, coefficient) => appeler('valider_rapprochement', corpsValidation(articleFournisseurId, articleReferenceId, coefficient));
export const refuserSuggestion = (articleFournisseurId) => appeler('refuser_suggestion', corpsRefus(articleFournisseurId));
/** Remet une suggestion refusée (même référence, même coefficient). Sert aussi au bouton « Annuler » du bandeau de 8 secondes. */
export const reprendreSuggestion = (articleFournisseurId) => appeler('reprendre_suggestion', corpsReprise(articleFournisseurId));
/** Dissocie un rapprochement VALIDÉ : l'article redevient « à rapprocher ». */
export const dissocierRapprochement = (articleFournisseurId) => appeler('dissocier_rapprochement', corpsDissociation(articleFournisseurId));
/** Renomme un article de référence (même identifiant : les articles déjà liés suivent). Refus « nom_deja_pris » (code de l'erreur) si une autre référence porte ce nom. */
export const renommerReference = (articleReferenceId, nom) => appeler('renommer_reference', corpsRenommage(articleReferenceId, nom));

/** L'IA propose des GROUPES d'au moins 2 articles (jamais validés). Peut durer plusieurs minutes. */
export async function demanderSuggestions() {
  await connexionPrete();
  return actionsBase().demanderSuggestions();
}
