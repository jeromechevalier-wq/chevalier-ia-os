// Outils de création et de modification (profils bibliothécaire et Claude Code). Chacun valide sa saisie (zod), puis délègue à coeur/metier.js :
// mêmes règles que l'écran (plans de logique.js), écriture journalisée par le moteur (audit en trois lots). Aucun outil n'écrit directement.
import { z } from 'zod';
import * as L from '../../../partage/logique.js';
import * as metier from '../../coeur/metier.js';

const PROFILS = ['bibliothecaire', 'claude-code'];
const id = z.string().min(1).max(200);
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Attendu AAAA-MM-JJ').describe('Date AAAA-MM-JJ.');
const contacts = z.array(z.object({ valeur: z.string().max(200), type: z.enum(L.TYPES_CONTACT.map((t) => t.id)).optional() })).max(10);
const roles = z.array(z.enum(L.ROLES.map((r) => r.id))).max(10).describe(`Rôles possibles : ${L.ROLES.map((r) => r.id).join(', ')}.`);
const etiquettes = z.array(z.string().max(80)).max(30).describe('Identifiants d’étiquettes (voir lire_reglages, etiquettes).');
const proprietaire = z.string().max(120).optional().describe(`Propriétaire de la fiche créée (défaut : ${metier.PROPRIETAIRE_PAR_DEFAUT}).`);
const forcer = z.boolean().optional().describe('true : créer malgré un doublon possible (nom ou e-mail déjà connu), après avoir vérifié que c’est une autre fiche.');
const texteCourt = z.string().max(300);
const urlGithub = z.string().max(500).optional().describe('Adresse du dépôt GitHub de l’affaire (https://github.com/compte/nom) ; chaîne vide pour l’effacer.');
const urlDossier = z.string().max(500).optional().describe('Adresse du dossier Google Drive de travail (https://drive.google.com/drive/folders/…) ; chaîne vide pour l’effacer.');

const outil = (nom, description, schema, action, profils = PROFILS) => ({
  nom, profils, description, schema, executer: ({ args, ...c }) => action(c, args),
});

export const OUTILS_ECRITURE = [
  outil('creer_personne', "Crée une personne (seul le nom est obligatoire), avec son événement dans le fil. Refuse un doublon (même nom, accents et casse ignorés, ou même e-mail) sauf forcer: true. Le propriétaire est Jérôme par défaut.", {
    nom: z.string().min(1).max(200), organisationId: id.optional(), emails: contacts.optional(), telephones: contacts.optional(), etiquettes: etiquettes.optional(),
    roles: roles.optional(), ville: texteCourt.optional(), source: texteCourt.optional(), forcer, proprietaire,
  }, metier.creerPersonne),

  outil('modifier_personne', "Modifie des champs d'une personne (seuls les champs donnés changent) : nom, organisationId (null pour détacher), emails, telephones, etiquettes, roles, ville, source, linkedin, siteWeb, dateInterviewJtbd, archive. Ne supprime jamais. Refuse un nom ou e-mail qui ferait doublon avec une autre personne sauf forcer: true.", {
    id, nom: z.string().min(1).max(200).optional(), organisationId: id.nullable().optional(), emails: contacts.optional(), telephones: contacts.optional(), etiquettes: etiquettes.optional(),
    roles: roles.optional(), ville: texteCourt.optional(), source: texteCourt.optional(), linkedin: z.string().max(300).optional(), siteWeb: z.string().max(300).optional(),
    dateInterviewJtbd: jour.nullable().optional(), archive: z.boolean().optional().describe('true : archiver ; false : désarchiver.'), forcer,
  }, metier.modifierPersonne),

  outil('creer_organisation', "Crée une organisation (seul le nom est obligatoire), avec son événement dans le fil. Refuse un doublon de nom sauf forcer: true.", {
    nom: z.string().min(1).max(200), adresse: texteCourt.optional(), ville: texteCourt.optional(), secteur: texteCourt.optional(), etiquettes: etiquettes.optional(), forcer, proprietaire,
  }, metier.creerOrganisation),

  outil('modifier_organisation', "Modifie des champs d'une organisation : nom, adresse, ville, siteWeb, secteur, taille (Solo, 2 à 10, 11 à 50, Plus de 50, ou vide), etiquettes, archive. Ne supprime jamais.", {
    id, nom: z.string().min(1).max(200).optional(), adresse: texteCourt.optional(), ville: texteCourt.optional(), siteWeb: z.string().max(300).optional(), secteur: texteCourt.optional(),
    taille: z.string().max(20).optional(), etiquettes: etiquettes.optional(), archive: z.boolean().optional(), forcer,
  }, metier.modifierOrganisation),

  outil('creer_affaire', `Crée une affaire avec son événement. Le titre par défaut est le nom de l'organisation, sinon de la personne ; l'organisation de la personne est reprise si aucune n'est donnée. Étape (défaut premier_contact) parmi : ${L.ETAPES.map((e) => e.id).join(', ')}. Priorité : ${L.PRIORITES.map((p) => p.id).join(', ')}.`, {
    titre: z.string().max(300).optional(), personneId: id.optional(), organisationId: id.optional(), etape: z.string().max(60).optional(), priorite: z.string().max(40).optional(),
    montant: z.number().min(0).max(1e9).nullable().optional().describe('Montant en euros.'), offreId: id.optional(), dureeJours: z.number().int().min(0).max(36500).nullable().optional(),
    source: texteCourt.optional(), besoin: z.string().max(5000).optional(), urlGithub, urlDossier, proprietaire,
  }, metier.creerAffaire),

  outil('modifier_affaire', "Modifie des champs d'une affaire : titre, personneId et organisationId (null pour détacher), montant, priorite, offreId, dureeJours, source, besoin, urlGithub, urlDossier, archive. Pour l'étape ou le statut, utiliser changer_etape, marquer_perdue, mettre_en_pause, rouvrir_affaire.", {
    id, titre: z.string().min(1).max(300).optional(), personneId: id.nullable().optional(), organisationId: id.nullable().optional(), montant: z.number().min(0).max(1e9).nullable().optional(),
    priorite: z.string().max(40).optional(), offreId: id.nullable().optional(), dureeJours: z.number().int().min(0).max(36500).nullable().optional(), source: texteCourt.optional(),
    besoin: z.string().max(5000).optional(), urlGithub, urlDossier, archive: z.boolean().optional(),
  }, metier.modifierAffaire),

  outil('changer_etape', "Change l'étape d'une affaire comme l'écran (une affaire qui devient gagnée sans avoir de projet reçoit son projet d'extraction de valeur : identifiant dans « extraction ») : statut, dates d'étapes, événements du fil ; « facture_payee » archive l'affaire et enregistre l'encaissement (montantEncaisse, sinon le montant de l'affaire). Renvoie la suggestion d'activité de suivi (non créée : à créer avec creer_activite si pertinent).", {
    id, etape: z.string().min(1).max(60), montantEncaisse: z.number().min(0).max(1e9).optional(),
  }, metier.changerEtape),

  outil('marquer_perdue', `Marque une affaire perdue. Raison parmi : ${L.RAISONS_PERDUE.join(' ; ')}. Crée aussi le projet d'extraction de valeur de l'affaire (règles, erreurs, automatisable, documentation marketing), qui reprend la raison de la perte : la réponse donne son identifiant dans « extraction ».`, { id, raison: z.string().min(1).max(60), detail: z.string().max(1000).optional() }, metier.marquerPerdue),
  outil('mettre_en_pause', 'Met une affaire en pause jusqu\'à une date de réveil (AAAA-MM-JJ).', { id, dateReveil: jour }, metier.mettreEnPause),
  outil('rouvrir_affaire', 'Rouvre une affaire perdue ou en pause.', { id }, metier.rouvrirAffaire),
  outil('ajouter_encaissement', 'Ajoute un encaissement (montant positif en euros, date du jour par défaut) à une affaire, avec son événement.', { id, montant: z.number().positive().max(1e9), date: jour.optional() }, metier.ajouterEncaissement),

  outil('ajouter_note', "Ajoute une note rattachée à une affaire (qui porte aussi sa personne et son organisation), à une personne ou à une organisation. Les notes ne sont jamais modifiées automatiquement.", {
    texte: z.string().min(1).max(20000), affaireId: id.optional(), personneId: id.optional(), organisationId: id.optional(),
  }, metier.ajouterNote),
  outil('modifier_note', 'Remplace le texte d\'une note existante.', { id, texte: z.string().min(1).max(20000) }, metier.modifierNote),

  outil('creer_activite', `Planifie une activité (rappel, appel, rendez-vous…) rattachée à une affaire, une personne ou une organisation. Types : ${L.TYPES_ACTIVITE.map((t) => t.id).join(', ')} (défaut tache) ; date du jour par défaut ; heure HH:MM facultative.`, {
    type: z.enum(L.TYPES_ACTIVITE.map((t) => t.id)).optional(), titre: texteCourt.optional(), date: jour.optional(), heure: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    affaireId: id.optional(), personneId: id.optional(), organisationId: id.optional(),
  }, metier.creerActivite),
  outil('terminer_activite', "Marque une activité comme faite (et ajoute l'événement au fil).", { id }, metier.terminerActivite),

  outil('joindre_lien', "Joint un document à une affaire par son adresse (http ou https obligatoire) et un libellé facultatif.", {
    affaireId: id, url: z.string().min(1).max(2000), libelle: texteCourt.optional(),
  }, metier.joindreLien),
  outil('retirer_document', "Retire un document d'une affaire (jamais le fichier lui-même) : par index (voir lister_documents) ou par url ; si les deux sont donnés, ils doivent correspondre.", {
    affaireId: id, index: z.number().int().min(0).optional(), url: z.string().max(2000).optional(),
  }, metier.retirerDocument),
];
