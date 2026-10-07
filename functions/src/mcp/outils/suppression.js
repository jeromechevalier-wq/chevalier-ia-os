// Outils de suppression et de restauration : réservés au profil Claude Code (le serveur les refuse à tout autre jeton, même si le client est mal
// configuré). Les suppressions exigent la confirmation par le nom de la fiche, comme l'écran, et gardent une copie « avant » 90 jours.
import { z } from 'zod';
import * as metier from '../../coeur/metier.js';

const PROFILS = ['claude-code'];
const id = z.string().min(1).max(200);
const confirmation = (quoi) => z.string().min(1).max(300).describe(`${quoi} (comparaison sans accents ni casse), comme la confirmation de l'écran.`);
const outil = (nom, description, schema, action) => ({ nom, profils: PROFILS, description, schema, executer: ({ args, ...c }) => action(c, args) });

export const OUTILS_SUPPRESSION = [
  outil('supprimer_personne', "Supprime définitivement une personne, ses activités, notes et événements. Si elle a des affaires, choix est obligatoire : \"affaires\" (les supprimer aussi, avec leur fil) ou \"conserver\" (les garder, sans personne). Récupérable 90 jours avec restaurer_depuis_audit.", {
    id, choix: z.enum(['affaires', 'conserver']).optional(), confirmationNom: confirmation('Le nom exact de la personne'),
  }, metier.supprimerPersonne),
  outil('supprimer_organisation', "Supprime définitivement une organisation et son fil. Refusé tant qu'elle a des personnes ou des affaires (les détacher ou l'archiver d'abord). Récupérable 90 jours.", {
    id, confirmationNom: confirmation('Le nom exact de l’organisation'),
  }, metier.supprimerOrganisation),
  outil('supprimer_affaire', "Supprime définitivement une affaire, ses activités, notes et événements. Récupérable 90 jours.", {
    id, confirmationNom: confirmation('Le titre exact de l’affaire'),
  }, metier.supprimerAffaire),
  outil('supprimer_projet', "Supprime définitivement un projet, ses tâches et son fil (événements, notes). Gardés, avec un lien vidé : l'affaire d'origine et les projets d'extraction qui le citent. L'archivage (archiver_projet) est la voie normale. Récupérable 90 jours.", {
    id, confirmationNom: confirmation('Le titre exact du projet'),
  }, metier.supprimerProjet),
  outil('supprimer_note', 'Supprime une note. Récupérable 90 jours.', { id }, metier.supprimerNote),
  outil('supprimer_activite', 'Supprime une activité. Récupérable 90 jours.', { id }, metier.supprimerActivite),
  outil('restaurer_depuis_audit', "Défait une opération d'écriture d'après le journal (operationId, donné par l'outil d'écriture ou par lire_audit) : création annulée = suppression, modification annulée = état d'avant, suppression annulée = recréation avec le même identifiant. Par défaut APERÇU seulement (apercu: true) : relire, puis rappeler avec apercu: false. Refuse un document qui a changé depuis (forcer: true l'écrase). Copies gardées 90 jours.", {
    operationId: id, apercu: z.boolean().optional().describe('Défaut true : montre ce qui serait fait sans rien écrire.'), forcer: z.boolean().optional(),
  }, metier.restaurer),
];
