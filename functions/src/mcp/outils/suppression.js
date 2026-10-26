// Outils de suppression et de restauration : réservés au profil Claude Code (le serveur les refuse à tout autre jeton, même si le client est mal
// configuré). Chez un client, ce profil « claude-code » est celui du rôle ÉDITEUR (clients/config.js, PROFIL_PAR_ROLE).
// Les suppressions exigent la confirmation par le nom de la fiche, comme l'écran, puis une DOUBLE confirmation : un premier appel rend l'aperçu
// de tout ce qui partirait et un code à usage unique, le second (avec codeConfirmation) supprime. Une copie « avant » est gardée.
import { z } from 'zod';
import * as metier from '../../coeur/metier.js';

const PROFILS = ['claude-code'];
const id = z.string().min(1).max(200);
const confirmation = (quoi) => z.string().min(1).max(300).describe(`${quoi} (comparaison sans accents ni casse), comme la confirmation de l'écran.`);
const codeConfirmation = z.string().max(40).optional().describe("Absent au premier appel : l'outil ne supprime rien, rend un APERÇU et un code. À donner au second appel, après accord de l'utilisateur.");
const outil = (nom, description, schema, action) => ({ nom, profils: PROFILS, description, schema, executer: ({ args, ...c }) => action(c, args) });

export const OUTILS_SUPPRESSION = [
  outil('supprimer_personne', "Supprime définitivement une personne, ses activités, notes et événements. Si elle a des affaires, choix est obligatoire : \"affaires\" (les supprimer aussi, avec leur fil) ou \"conserver\" (les garder, sans personne). Récupérable avec restaurer_depuis_audit.", {
    id, choix: z.enum(['affaires', 'conserver']).optional(), confirmationNom: confirmation('Le nom exact de la personne'), codeConfirmation,
  }, metier.supprimerPersonne),
  outil('supprimer_organisation', "Supprime définitivement une organisation et son fil. Refusé tant qu'elle a des personnes ou des affaires (les détacher ou l'archiver d'abord). Récupérable avec restaurer_depuis_audit.", {
    id, confirmationNom: confirmation('Le nom exact de l’organisation'), codeConfirmation,
  }, metier.supprimerOrganisation),
  outil('supprimer_affaire', "Supprime définitivement une affaire, ses activités, notes et événements. Récupérable avec restaurer_depuis_audit.", {
    id, confirmationNom: confirmation('Le titre exact de l’affaire'), codeConfirmation,
  }, metier.supprimerAffaire),
  outil('supprimer_projet', "Supprime définitivement un projet, ses livrables et son fil (événements, notes). L'affaire d'origine est gardée, son lien vidé. L'archivage (archiver_projet) est la voie normale. Récupérable avec restaurer_depuis_audit.", {
    id, confirmationNom: confirmation('Le titre exact du projet'), codeConfirmation,
  }, metier.supprimerProjet),
  outil('supprimer_note', 'Supprime une note (aperçu puis code, comme les autres). Récupérable avec restaurer_depuis_audit.', { id, codeConfirmation }, metier.supprimerNote),
  outil('supprimer_activite', 'Supprime une activité (aperçu puis code, comme les autres). Récupérable avec restaurer_depuis_audit.', { id, codeConfirmation }, metier.supprimerActivite),
  outil('supprimer_devis', "Supprime définitivement un BROUILLON de devis (jamais un devis finalisé : il se garde, et s'archive avec archiver_devis s'il est signé ou refusé). Ne touche jamais aux documents de l'affaire ni aux fichiers (un « Devis brouillon … .pdf » déjà joint à l'affaire reste). Premier appel : APERÇU et code à usage unique, rien n'est supprimé ; second appel (mêmes arguments + codeConfirmation) : supprime. Récupérable avec restaurer_depuis_audit.", { id, codeConfirmation }, metier.supprimerDevis),
  outil('restaurer_depuis_audit', "Défait une opération d'écriture d'après le journal (operationId, donné par l'outil d'écriture ou par lire_audit) : création annulée = suppression, modification annulée = état d'avant, suppression annulée = recréation avec le même identifiant. Restaurer la suppression d'un devis peut entrer en conflit si l'affaire a changé depuis (forcer: true écrase alors ses documents ajoutés entre-temps) ; elle est refusée si une autre version brouillon ou de même version existe déjà. Couvre aussi les devis (devis_devis, devis_articles) : création, modification, archivage, nouvelle version, envoi enregistré et suppression d'un brouillon. NE défait PAS une finalisation ni un changement de statut de devis (finaliser_devis, changer_statut_devis : le numéro est consommé) : le refus indique la voie de secours, nouvelle_version_devis. Par défaut APERÇU seulement (apercu: true) : relire, puis rappeler avec apercu: false. Refuse un document qui a changé depuis (forcer: true l'écrase). Copies gardées sans limite de durée.", {
    operationId: id, apercu: z.boolean().optional().describe('Défaut true : montre ce qui serait fait sans rien écrire.'), forcer: z.boolean().optional(),
  }, metier.restaurer),
];
