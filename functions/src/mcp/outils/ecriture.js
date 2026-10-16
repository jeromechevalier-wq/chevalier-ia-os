// Outils de création et de modification (profils bibliothécaire et Claude Code). Chacun valide sa saisie (zod), puis délègue à coeur/metier.js :
// mêmes règles que l'écran (plans de logique.js), écriture journalisée par le moteur (audit en trois lots). Aucun outil n'écrit directement.
import { z } from 'zod';
import * as L from '../../../partage/logique.js';
import * as PL from '../../../partage/projets.js';
import * as metier from '../../coeur/metier.js';

const PROFILS = ['bibliothecaire', 'claude-code'];
const id = z.string().min(1).max(200);
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Attendu AAAA-MM-JJ').describe('Date AAAA-MM-JJ.');
const contacts = z.array(z.object({ valeur: z.string().max(200), type: z.enum(L.TYPES_CONTACT.map((t) => t.id)).optional() })).max(10);
const etiquettes = z.array(z.string().max(80)).max(30).describe('Identifiants d’étiquettes (voir lire_reglages, etiquettes).');
const proprietaire = z.string().max(120).optional().describe(`Propriétaire de la fiche créée (défaut : ${metier.PROPRIETAIRE_PAR_DEFAUT}).`);
const forcer = z.boolean().optional().describe('true : créer malgré un doublon possible (nom ou e-mail déjà connu), après avoir vérifié que c’est une autre fiche.');
const texteCourt = z.string().max(300);
const urlGithub = z.string().max(500).optional().describe('Ancien champ « dépôt de code » (https://github.com/compte/nom), facultatif ; chaîne vide pour l’effacer. Pour un nouveau lien, préférer joindre_lien (liste « Liens et documents »).');
const urlDossier = z.string().max(500).optional().describe('Lien du dossier de travail : n’importe quel lien complet (Google Drive, serveur ou NAS en smb://, site…) ; chaîne vide pour l’effacer.');

const outil = (nom, description, schema, action, profils = PROFILS) => ({
  nom, profils, description, schema, executer: ({ args, ...c }) => action(c, args),
});

export const OUTILS_ECRITURE = [
  outil('creer_personne', "Crée une personne (seul le nom est obligatoire), avec son événement dans le fil. Refuse un doublon (même nom, accents et casse ignorés, ou même e-mail) sauf forcer: true. Le propriétaire est Jérôme par défaut.", {
    nom: z.string().min(1).max(200), organisationId: id.optional(), emails: contacts.optional(), telephones: contacts.optional(), etiquettes: etiquettes.optional(),
    ville: texteCourt.optional(), source: texteCourt.optional(), forcer, proprietaire,
  }, metier.creerPersonne),

  outil('modifier_personne', "Modifie des champs d'une personne (seuls les champs donnés changent) : nom, organisationId (null pour détacher), emails, telephones, etiquettes, ville, source, linkedin, siteWeb, archive. Ne supprime jamais. Refuse un nom ou e-mail qui ferait doublon avec une autre personne sauf forcer: true.", {
    id, nom: z.string().min(1).max(200).optional(), organisationId: id.nullable().optional(), emails: contacts.optional(), telephones: contacts.optional(), etiquettes: etiquettes.optional(),
    ville: texteCourt.optional(), source: texteCourt.optional(), linkedin: z.string().max(300).optional(), siteWeb: z.string().max(300).optional(),
    archive: z.boolean().optional().describe('true : archiver ; false : désarchiver.'), forcer,
  }, metier.modifierPersonne),

  outil('creer_organisation', "Crée une organisation (seul le nom est obligatoire), avec son événement dans le fil. Refuse un doublon de nom sauf forcer: true.", {
    nom: z.string().min(1).max(200), adresse: texteCourt.optional(), ville: texteCourt.optional(), secteur: texteCourt.optional(), etiquettes: etiquettes.optional(), forcer, proprietaire,
  }, metier.creerOrganisation),

  outil('modifier_organisation', "Modifie des champs d'une organisation : nom, adresse, ville, siteWeb, secteur, taille (Solo, 2 à 10, 11 à 50, Plus de 50, ou vide), etiquettes, archive. Ne supprime jamais.", {
    id, nom: z.string().min(1).max(200).optional(), adresse: texteCourt.optional(), ville: texteCourt.optional(), siteWeb: z.string().max(300).optional(), secteur: texteCourt.optional(),
    taille: z.string().max(20).optional(), etiquettes: etiquettes.optional(), archive: z.boolean().optional(), forcer,
  }, metier.modifierOrganisation),

  outil('creer_affaire', `Crée une affaire avec son événement. Le titre par défaut est le nom de l'organisation, sinon de la personne ; l'organisation de la personne est reprise si aucune n'est donnée. Étape (défaut : la première étape active) parmi celles de lire_reglages (configuration.etapes, referentiels.etapes). Priorité : ${L.PRIORITES.map((p) => p.id).join(', ')}.`, {
    titre: z.string().max(300).optional(), personneId: id.optional(), organisationId: id.optional(), etape: z.string().max(60).optional(), priorite: z.string().max(40).optional(),
    montant: z.number().min(0).max(1e9).nullable().optional().describe('Montant en euros.'), offreId: id.optional(), dureeJours: z.number().int().min(0).max(36500).nullable().optional(),
    source: texteCourt.optional(), besoin: z.string().max(5000).optional(), urlGithub, urlDossier, proprietaire,
  }, metier.creerAffaire),

  outil('modifier_affaire', "Modifie des champs d'une affaire : titre, personneId et organisationId (null pour détacher), montant, priorite, offreId, dureeJours, source, besoin, urlGithub, urlDossier, archive. Pour l'étape ou le statut, utiliser changer_etape, marquer_perdue, mettre_en_pause, rouvrir_affaire.", {
    id, titre: z.string().min(1).max(300).optional(), personneId: id.nullable().optional(), organisationId: id.nullable().optional(), montant: z.number().min(0).max(1e9).nullable().optional(),
    priorite: z.string().max(40).optional(), offreId: id.nullable().optional(), dureeJours: z.number().int().min(0).max(36500).nullable().optional(), source: texteCourt.optional(),
    besoin: z.string().max(5000).optional(), urlGithub, urlDossier, archive: z.boolean().optional(),
  }, metier.modifierAffaire),

  outil('changer_etape', "Change l'étape d'une affaire comme l'écran (une affaire qui devient gagnée sans avoir de projet reçoit son projet d'extraction de valeur : identifiant dans « extraction ») : statut, dates d'étapes, événements du fil ; l'étape « vente gagnée » est celle que la configuration désigne (lire_reglages). Renvoie l'action suggérée par l'étape, s'il y en a une (non créée : à créer avec creer_activite si pertinent).", {
    id, etape: z.string().min(1).max(60),
  }, metier.changerEtape),

  outil('marquer_perdue', `Marque une affaire perdue. Raison parmi : ${L.RAISONS_PERDUE.join(' ; ')}. Crée aussi le projet d'extraction de valeur de l'affaire (règles, erreurs, automatisable, documentation marketing), qui reprend la raison de la perte : la réponse donne son identifiant dans « extraction ».`, { id, raison: z.string().min(1).max(60), detail: z.string().max(1000).optional() }, metier.marquerPerdue),
  outil('mettre_en_pause', 'Met une affaire en pause jusqu\'à une date de réveil (AAAA-MM-JJ).', { id, dateReveil: jour }, metier.mettreEnPause),
  outil('rouvrir_affaire', 'Rouvre une affaire perdue ou en pause.', { id }, metier.rouvrirAffaire),

  // ---- Projets (2.1) et factures (2.2) : mêmes règles que l'écran
  outil('creer_projet', `Crée un projet (seul le titre est obligatoire), avec son événement. modeleId (voir lister_modeles_projet) : le projet part avec les tâches du modèle, datées à partir de la date de début. Phase de départ : lancement. Pour le projet d'une affaire gagnée, préférer creer_projet_depuis_affaire.`, {
    titre: z.string().min(1).max(300), personneId: id.optional(), organisationId: id.optional(), offreId: id.optional(), modeleId: id.optional(),
    dateDebut: jour.optional(), dateFin: jour.optional(), urlGithub, urlDossier, proprietaire,
  }, metier.creerProjet),

  outil('creer_projet_depuis_affaire', "Crée le projet d'une affaire GAGNÉE (comme « Créer le projet » de la fiche affaire) : reprend son titre, sa personne, son organisation, son offre, son dépôt et son dossier, lie l'affaire au projet (une affaire n'a qu'un projet) et range l'extraction faite à Gagné si rien n'y a été fait. modeleId : tâches du modèle.", {
    affaireId: id, modeleId: id.optional(), titre: z.string().max(300).optional(), dateDebut: jour.optional(), dateFin: jour.optional(),
  }, metier.creerProjetDepuisAffaire),

  outil('modifier_projet', "Modifie des champs d'un projet : titre, personneId et organisationId (null pour détacher), offreId, dateDebut, dateFin (null pour effacer), urlGithub, urlDossier. La phase et le statut passent par changer_phase_projet, mettre_projet_en_pause, reprendre_projet, terminer_projet, rouvrir_projet, archiver_projet.", {
    id, titre: z.string().min(1).max(300).optional(), personneId: id.nullable().optional(), organisationId: id.nullable().optional(), offreId: id.nullable().optional(),
    dateDebut: jour.nullable().optional(), dateFin: jour.nullable().optional(), urlGithub, urlDossier,
  }, metier.modifierProjet),

  outil('changer_phase_projet', `Change la phase d'un projet, dans tous les sens (on peut revenir en arrière). Phases : celles de lire_reglages (configuration.phases). Vers la phase de clôture, refusé tant qu'une facture est à payer si le suivi des paiements et la règle de clôture bloquée sont allumés (voir terminer_projet pour la sortie « impayé »). Changer la phase d'un projet terminé le rouvre.`, {
    id, phase: z.string().min(1).max(40),
  }, metier.changerPhaseProjet),

  outil('mettre_projet_en_pause', 'Met un projet en pause (un projet terminé ne se met pas en pause : le rouvrir d’abord).', { id }, metier.mettreProjetEnPause),
  outil('reprendre_projet', 'Reprend un projet en pause.', { id }, metier.reprendreProjet),
  outil('rouvrir_projet', 'Rouvre un projet terminé : il redevient actif et sort des archives, sans changer de phase.', { id }, metier.rouvrirProjet),
  outil('archiver_projet', "Archive un projet (archive: true) ou le sort des archives (archive: false), avec son événement. L'archivage est la voie normale pour ranger un projet : il ne le termine pas.", {
    id, archive: z.boolean().describe('true : archiver ; false : désarchiver.'),
  }, metier.archiverProjet),

  outil('terminer_projet', "Termine un projet (phase Clôture, statut Terminé, archivé) et crée son projet d'extraction de valeur (sauf pour une extraction, et une seule par projet : identifiant dans « extraction »). REFUSÉ tant qu'une facture du projet est à payer : le refus nomme les factures. Deux sorties : marquer la facture payée (marquer_facture_payee), ou recommencer avec impaye: { raison } : chaque facture restante passe à « abandonnee » avec cette raison, le projet se termine et garde sa pastille « Impayé ».", {
    id, impaye: z.object({ raison: z.string().min(1).max(500) }).optional().describe('Clôturer malgré des factures à payer : elles sont abandonnées, avec cette raison (obligatoire).'),
  }, metier.terminerProjet),

  outil('extraire_valeur_projet', "Déclenche à la main l'extraction de valeur d'un projet, sans attendre sa fin (utile quand le paiement tarde) : crée son projet d'extraction (modèle « Extraction », quatre tâches). Une seule extraction par projet : si elle existe déjà, rien n'est créé et son identifiant est rendu. Un projet d'extraction ne s'extrait pas.", { id }, metier.extraireProjet),

  outil('ajouter_tache_projet', "Ajoute une tâche à un projet (phase du projet par défaut ; date AAAA-MM-JJ et heure HH:MM facultatives ; assigneA : un membre de l'espace, voir lire_reglages, referentiels.projets.assignes).", {
    projetId: id, titre: z.string().min(1).max(300), phase: z.string().max(40).optional(), date: jour.optional(),
    heure: z.string().regex(/^\d{2}:\d{2}$/, 'Attendu HH:MM').optional(), assigneA: z.string().max(40).optional(),
  }, metier.ajouterTacheProjet),

  outil('terminer_tache_projet', "Marque une tâche de projet comme faite (fait: false pour la remettre à faire), avec son événement dans le fil du projet. Les tâches d'un projet se lisent avec lire_projet.", {
    id, fait: z.boolean().optional().describe('Défaut true.'),
  }, metier.terminerTacheProjet),

  outil('ajouter_facture', "Ajoute une facture à un projet (une ligne par échéance : 30 % à la commande, 30 % en cours, 40 % à la fin = trois factures). montant en euros (> 0), libelle (ex. « Acompte 30 % »), dateEnvoi. Avec datePaiement, la facture est créée déjà payée. La clôture du projet attend que toutes soient payées ou abandonnées.", {
    projetId: id, montant: z.number().positive().max(1e7), libelle: z.string().max(200).optional(), dateEnvoi: jour.optional(), datePaiement: jour.optional(),
  }, metier.ajouterFacture),

  outil('marquer_facture_payee', "Marque une facture payée (date du jour par défaut ; montant seulement si le client a payé une autre somme) : elle compte alors dans le chiffre d'affaires encaissé du mois du paiement, avec son événement « Encaissement ». Une facture payée en deux fois se sépare en deux lignes.", {
    projetId: id, factureId: id, datePaiement: jour.optional(), montant: z.number().positive().max(1e7).optional(),
  }, metier.marquerFacturePayee),

  outil('abandonner_facture', "Abandonne une facture qui ne sera jamais payée (raison obligatoire) : elle ne compte jamais dans l'encaissé et ne bloque plus la clôture ; le projet garde une pastille « Impayé ».", {
    projetId: id, factureId: id, raison: z.string().min(1).max(500),
  }, metier.abandonnerFacture),

  outil('ajouter_note', "Ajoute une note rattachée à une affaire (qui porte aussi sa personne et son organisation), à une personne ou à une organisation. Les notes ne sont jamais modifiées automatiquement.", {
    texte: z.string().min(1).max(20000), affaireId: id.optional(), personneId: id.optional(), organisationId: id.optional(),
  }, metier.ajouterNote),
  outil('modifier_note', 'Remplace le texte d\'une note existante.', { id, texte: z.string().min(1).max(20000) }, metier.modifierNote),

  outil('creer_activite', `Planifie une activité (rappel, appel, rendez-vous…) rattachée à une affaire, une personne ou une organisation. Types : ${L.TYPES_ACTIVITE.map((t) => t.id).join(', ')} (défaut tache) ; date du jour par défaut ; heure HH:MM facultative.`, {
    type: z.enum(L.TYPES_ACTIVITE.map((t) => t.id)).optional(), titre: texteCourt.optional(), date: jour.optional(), heure: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    affaireId: id.optional(), personneId: id.optional(), organisationId: id.optional(),
  }, metier.creerActivite),
  outil('terminer_activite', "Marque une activité comme faite (et ajoute l'événement au fil).", { id }, metier.terminerActivite),

  outil('joindre_lien', "Ajoute un lien ou un document à la liste « Liens et documents » d'une affaire (affaireId) ou d'un projet (projetId), un seul des deux, par son adresse (http ou https obligatoire : Drive, serveur, site, dépôt GitHub…), un libellé facultatif ; favori: true le met en favori (étoile, visible sur l'accueil de l'OS) ; note facultative.", {
    affaireId: id.optional(), projetId: id.optional(), url: z.string().min(1).max(2000), libelle: texteCourt.optional(), note: z.string().max(300).optional().describe('Note facultative affichée sous le nom (300 caractères au plus), ex. « envoyé au client ».'), favori: z.boolean().optional(),
  }, metier.joindreLien),
  outil('retirer_document', "Retire un document d'une affaire (affaireId) ou d'un projet (projetId) (jamais le fichier lui-même) : par index (voir lister_documents) ou par url ; si les deux sont donnés, ils doivent correspondre.", {
    affaireId: id.optional(), projetId: id.optional(), index: z.number().int().min(0).optional(), url: z.string().max(2000).optional(),
  }, metier.retirerDocument),
];
