// Outils de lecture (profils lecteur, bibliothécaire et Claude Code) : aucun n'écrit dans la base ni dans l'audit.
import { z } from 'zod';
import * as lecture from '../../coeur/lecture.js';

const TOUS = ['lecteur', 'bibliothecaire', 'claude-code'];
const id = z.string().min(1).max(200);
const limite = z.number().int().min(1).max(lecture.MAX_LIGNES).optional().describe(`Nombre maximal de lignes (défaut et plafond : ${lecture.MAX_LIGNES}).`);
const avecFil = z.boolean().optional().describe("Joindre le fil : activités faites, notes et événements, du plus récent au plus ancien.");

export const chercher = {
  nom: 'chercher',
  profils: TOUS,
  description: "Recherche des personnes, organisations et affaires par leur nom (accents et casse ignorés, 2 lettres au moins), comme la recherche de l'écran. Renvoie type, id, libellé et sous-titre ; lire ensuite la fiche avec lire_personne, lire_organisation ou lire_affaire.",
  schema: {
    texte: z.string().min(1).max(200).describe('Texte recherché.'),
    types: z.array(z.enum(['personnes', 'organisations', 'affaires'])).optional().describe('Limiter à ces types (défaut : les trois).'),
    limite: z.number().int().min(1).max(50).optional().describe('Résultats par type (défaut 8).'),
  },
  executer: ({ args, donnees }) => lecture.chercher(donnees, args),
};

export const lire_personne = {
  nom: 'lire_personne',
  profils: TOUS,
  description: "Lit la fiche d'une personne avec son organisation, ses affaires (résumé) et ses activités ; avecFil ajoute le fil.",
  schema: { id: id.describe('Identifiant de la personne.'), avecFil },
  executer: ({ args, donnees }) => lecture.lirePersonne(donnees, args),
};

export const lire_organisation = {
  nom: 'lire_organisation',
  profils: TOUS,
  description: "Lit la fiche d'une organisation avec ses personnes, ses affaires (résumé) et ses activités ; avecFil ajoute le fil.",
  schema: { id: id.describe("Identifiant de l'organisation."), avecFil },
  executer: ({ args, donnees }) => lecture.lireOrganisation(donnees, args),
};

export const lire_affaire = {
  nom: 'lire_affaire',
  profils: TOUS,
  description: "Lit une affaire avec sa personne, son organisation et ses activités ; avecFil ajoute le fil (activités faites, notes, événements).",
  schema: { id: id.describe("Identifiant de l'affaire."), avecFil },
  executer: ({ args, donnees }) => lecture.lireAffaire(donnees, args),
};

export const lister_affaires = {
  nom: 'lister_affaires',
  profils: TOUS,
  description: "Liste les affaires avec les filtres de l'écran. Par défaut les affaires non archivées ; archive=true pour les archivées. Étapes : voir lire_reglages (configuration.etapes) pour les identifiants.",
  schema: {
    etape: z.string().max(60).optional().describe("Identifiant d'étape."),
    statut: z.string().max(60).optional().describe('Statut (voir lire_reglages, referentiels.statuts).'),
    archive: z.boolean().optional().describe('true : affaires archivées seulement.'),
    personneId: id.optional(),
    organisationId: id.optional(),
    recherche: z.string().max(200).optional().describe('Texte cherché dans le titre, la personne et l’organisation.'),
    enRetard: z.boolean().optional().describe('Avec une activité en retard.'),
    sansAction: z.boolean().optional().describe('Affaires actives sans aucune activité à venir.'),
    limite,
  },
  executer: ({ args, donnees, maintenant }) => lecture.listerAffaires(donnees, args, maintenant),
};

export const lister_projets = {
  nom: 'lister_projets',
  profils: TOUS,
  description: "Liste les projets (livraison ou extraction de valeur) avec les filtres de l'écran : phase (identifiants dans lire_reglages, configuration.phases), statut (actif, en_pause, termine), nature (livraison, ou extraction si l'option « Extraction de valeur » est allumée). Par défaut les projets non archivés ; archive=true pour les archivés (dont les projets terminés). Chaque ligne donne l'avancement des tâches et, si l'option « Suivi des paiements » est allumée dans cet espace (lire_reglages, configuration.options), la facturation (facturé, payé, reste à payer, abandonné, impayé).",
  schema: {
    phase: z.string().max(40).optional(),
    statut: z.string().max(40).optional(),
    nature: z.string().max(40).optional(),
    archive: z.boolean().optional().describe('true : projets archivés (terminés compris) seulement.'),
    affaireId: id.optional(),
    personneId: id.optional(),
    organisationId: id.optional(),
    recherche: z.string().max(200).optional().describe('Texte cherché dans le titre, la personne et l’organisation.'),
    enRetard: z.boolean().optional().describe('Avec une tâche en retard.'),
    limite,
  },
  executer: ({ args, donnees, maintenant }) => lecture.listerProjets(donnees, args, maintenant),
};

export const lire_projet = {
  nom: 'lire_projet',
  profils: TOUS,
  description: "Lit un projet avec son affaire, sa personne, son organisation, ses tâches (par phase), son avancement, ses factures (dans « projet.factures », si l'option « Suivi des paiements » est allumée dans cet espace : lire_reglages, configuration.options), son extraction de valeur (si l'option « Extraction de valeur » est allumée) et, si c'est une extraction, sa source ; avecFil ajoute le fil du projet (événements et notes).",
  schema: { id: id.describe('Identifiant du projet.'), avecFil },
  executer: ({ args, donnees }) => lecture.lireProjet(donnees, args),
};

export const lister_modeles_projet = {
  nom: 'lister_modeles_projet',
  profils: TOUS,
  description: "Liste les modèles de projet avec leurs tâches types : l'identifiant du modèle se donne à la création d'un projet pour partir avec ses tâches.",
  schema: {},
  executer: ({ donnees }) => lecture.listerModelesProjet(donnees),
};

export const lister_activites = {
  nom: 'lister_activites',
  profils: TOUS,
  description: "Liste les activités (à faire par défaut dans l'ordre des dates, ou faites avec fait=true), filtrables par affaire, personne ou organisation, ou seulement celles en retard.",
  schema: {
    affaireId: id.optional(),
    personneId: id.optional(),
    organisationId: id.optional(),
    fait: z.boolean().optional().describe('true : faites ; false : à faire ; absent : toutes.'),
    enRetard: z.boolean().optional(),
    limite,
  },
  executer: ({ args, donnees, maintenant }) => lecture.listerActivites(donnees, args, maintenant),
};

export const lister_documents = {
  nom: 'lister_documents',
  profils: TOUS,
  description: "Liste les documents joints aux affaires et aux projets (libellé, adresse, favori), tout ou une seule affaire (affaireId) ou un seul projet (projetId), pour contrôler les liens.",
  schema: { affaireId: id.optional(), projetId: id.optional() },
  executer: ({ args, donnees }) => lecture.listerDocuments(donnees, args),
};

export const lire_reglages = {
  nom: 'lire_reglages',
  profils: TOUS,
  description: "Lit les réglages du CRM : offres, secteurs, sources, étiquettes, réglages, et les référentiels (étapes, statuts, rôles, types d'activité, priorités).",
  schema: {},
  executer: ({ donnees }) => lecture.lireReglages(donnees),
};

export const lire_audit = {
  nom: 'lire_audit',
  profils: TOUS,
  description: "Lit le journal d'audit des écritures faites par les outils (qui, quand, quel outil, quel document). incompletes=true : lignes restées « en_cours » (à vérifier). Voit aussi les actions faites dans l'appli (via: 'ecran').",
  schema: {
    acteur: z.string().max(80).optional(),
    docId: id.optional(),
    operationId: id.optional(),
    depuis: z.string().max(40).optional().describe('Date AAAA-MM-JJ ou date ISO.'),
    incompletes: z.boolean().optional(),
    limite,
  },
  executer: ({ args, donnees }) => lecture.lireAudit(donnees, args),
};

export const OUTILS_LECTURE = [chercher, lire_personne, lire_organisation, lire_affaire, lister_affaires, lister_projets, lire_projet, lister_modeles_projet, lister_activites, lister_documents, lire_reglages, lire_audit];
