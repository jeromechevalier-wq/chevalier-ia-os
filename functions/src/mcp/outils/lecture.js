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
  description: "Liste les affaires avec les filtres de l'écran. Par défaut les affaires non archivées ; archive=true pour les archivées. Étapes : premier_contact, rdv_fixe, proposition_envoyee, gagne, facture_envoyee, facture_payee (voir lire_reglages pour les valeurs exactes).",
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
  description: "Liste les documents joints aux affaires (libellé et adresse), toutes affaires ou une seule, pour contrôler les liens.",
  schema: { affaireId: id.optional() },
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
  description: "Lit le journal d'audit des écritures faites par les outils (qui, quand, quel outil, quel document). incompletes=true : lignes restées « en_cours » (à vérifier). Vide tant qu'aucun outil d'écriture n'est en service.",
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

export const OUTILS_LECTURE = [chercher, lire_personne, lire_organisation, lire_affaire, lister_affaires, lister_activites, lister_documents, lire_reglages, lire_audit];
