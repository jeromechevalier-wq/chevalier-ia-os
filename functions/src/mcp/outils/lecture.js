// Outils de lecture (profils lecteur, bibliothécaire et Claude Code) : aucun n'écrit dans la base ni dans l'audit.
import { z } from 'zod';
import * as lecture from '../../coeur/lecture.js';
import * as metier from '../../coeur/metier.js';
import { resumerForme, phraseDe, ligneDeDiagnostic } from '../diagnostic-fichiers.js';

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
  description: "Liste les projets avec les filtres de l'écran : phase (identifiants dans lire_reglages, configuration.phases), statut (actif, termine). Par défaut les projets non archivés ; archive=true pour les archivés (dont les projets terminés). Chaque ligne donne l'avancement des livrables et, si l'option « Suivi des paiements » est allumée dans cet espace (lire_reglages, configuration.options), la facturation (facturé, payé, reste à payer, abandonné, impayé).",
  schema: {
    phase: z.string().max(40).optional(),
    statut: z.string().max(40).optional(),
    archive: z.boolean().optional().describe('true : projets archivés (terminés compris) seulement.'),
    affaireId: id.optional(),
    personneId: id.optional(),
    organisationId: id.optional(),
    recherche: z.string().max(200).optional().describe('Texte cherché dans le titre, la personne et l’organisation.'),
    enRetard: z.boolean().optional().describe('Avec un livrable en retard.'),
    limite,
  },
  executer: ({ args, donnees, maintenant }) => lecture.listerProjets(donnees, args, maintenant),
};

export const lire_projet = {
  nom: 'lire_projet',
  profils: TOUS,
  description: "Lit un projet avec son affaire, sa personne, son organisation, ses livrables (clé « livrables », par phase), son avancement, ses factures (dans « projet.factures », si l'option « Suivi des paiements » est allumée dans cet espace : lire_reglages, configuration.options) ; avecFil ajoute le fil du projet (événements et notes).",
  schema: { id: id.describe('Identifiant du projet.'), avecFil },
  executer: ({ args, donnees }) => lecture.lireProjet(donnees, args),
};

export const lister_modeles_projet = {
  nom: 'lister_modeles_projet',
  profils: TOUS,
  description: "Liste les modèles de projet avec leurs livrables types (clé « livrables ») : l'identifiant du modèle se donne à la création d'un projet pour partir avec ses livrables.",
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
  description: "Liste les documents joints aux affaires et aux projets, tout ou une seule affaire (affaireId) ou un seul projet (projetId) : les LIENS (documents : libellé, adresse, favori, index) pour les contrôler, et les FICHIERS déposés chez nous dans l'onglet « Documents » (fichiers : id, nom, taille, date, qui l'a déposé ; l'id désigne le fichier pour le mettre à la corbeille).",
  schema: { affaireId: id.optional(), projetId: id.optional() },
  executer: ({ args, donnees }) => lecture.listerDocuments(donnees, args),
};

export const lire_reglages = {
  nom: 'lire_reglages',
  profils: TOUS,
  description: "Lit les réglages de l'espace : offres, secteurs, sources, étiquettes, réglages, et les référentiels (étapes, statuts, rôles, types d'activité, priorités).",
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

export const lister_articles = {
  nom: 'lister_articles',
  profils: TOUS,
  description: "Liste les articles du bordereau de prix du module Devis (code, libellé, unité, prix d'achat hors taxes en euros, taux de TVA propre s'il y en a un, type, marge propre, actif). Un article de type ouvrage porte ses composants, son prixVenteForce éventuel et son calcul (prixVenteHT, deboursSecHT, margeBruteHT, tauxMarge). Par défaut les articles actifs ; statut: 'desactives' ou 'tous' pour les autres. Triés par libellé. Le mot affiché à l'utilisateur est donné par lire_reglages_devis.",
  schema: {
    statut: z.enum(['actifs', 'desactives', 'tous']).optional().describe("Défaut : actifs."),
    limite,
  },
  executer: ({ args, donnees }) => lecture.listerArticles(donnees, args),
};

export const chercher_article = {
  nom: 'chercher_article',
  profils: TOUS,
  description: "Cherche un article ACTIF du bordereau par son code ou son libellé (accents et casse ignorés, 2 lettres au moins ; tous les mots doivent y être). Renvoie l'identifiant, le code, le libellé, l'unité, le prix d'achat en euros, le type (et, pour un ouvrage, ses composants et son calcul). À utiliser avant d'ajouter un article pour ne pas créer de doublon. Le mot affiché à l'utilisateur est donné par lire_reglages_devis.",
  schema: {
    texte: z.string().min(1).max(200).describe('Mots cherchés dans le code ou le libellé.'),
    limite: z.number().int().min(1).max(50).optional().describe('Résultats au plus (défaut 20).'),
  },
  executer: ({ args, donnees }) => lecture.chercherArticle(donnees, args),
};

export const rechercher_article_par_phrase = {
  nom: 'rechercher_article_par_phrase',
  profils: TOUS,
  description: "Avant d'ajouter une ligne à un devis à partir des mots de l'utilisateur, appelle cet outil avec la phrase telle quelle (« 3 prises doubles à 25 € »). Il rend la clé comprise, la quantité et le prix de vente hors taxes dits (quantiteIncertaine et prixIncertain : true quand ils sont devinés, à faire confirmer), la décision et les articles candidats du bordereau (prix de vente hors taxes, jamais le prix d'achat ni la marge). `utiliser` : ajoute la ligne du premier candidat. `proposer` ou `demander` : pose exactement `question` à l'utilisateur et attends sa réponse, puis appelle enregistrer_reponse_vocabulaire avec la même phrase et son choix (le dictionnaire apprend). Ne choisis jamais un article à sa place. Pour ajouter la ligne, passe articleId, quantite et prixVente (s'il est dit) aux outils qui créent ou modifient un brouillon de devis (lignes de devis). Lecture seule. Le mot affiché à l'utilisateur est donné par lire_reglages_devis.",
  schema: {
    phrase: z.string().min(1).max(300).describe("La phrase de l'utilisateur, telle quelle (1 à 300 caractères)."),
    limite: z.number().int().min(1).max(5).optional().describe('Candidats au plus (défaut 3), jamais moins que les articles cités par `question`.'),
  },
  executer: ({ args, donnees }) => lecture.rechercherArticleParPhrase(donnees, args),
};

export const lire_reglages_devis = {
  nom: 'lire_reglages_devis',
  profils: TOUS,
  description: "Lit les réglages du module Devis (nom du bordereau, marge de revente des articles et marge par défaut des nouveaux devis, régime et taux de TVA proposés, durée de validité, mention de l'émetteur, « Mon entreprise ») et les familles d'articles du bordereau (id, nom, actif, parentId). Lecture seule : ces réglages se changent depuis l'écran. Donne aussi `vocabulaire` : le mot affiché à l'utilisateur pour le type ouvrage.",
  schema: {},
  executer: ({ donnees }) => lecture.lireReglagesDevis(donnees),
};

export const lister_devis = {
  nom: 'lister_devis',
  profils: TOUS,
  description: "Liste les devis du module Devis, du plus récent au plus ancien : id, numéro (vide tant que c'est un brouillon), version, statut (brouillon, en_attente_envoi = Finalisé, envoye, accepte = Signé, refuse, remplace, et expire, CALCULÉ quand la date de validité est dépassée), objet (imprimé sur le PDF), nom (interne, jamais imprimé), client, total hors taxes et TTC en euros, dates (créé, finalisé, envoyé, signé, refusé, archivé), archive, nombreEnvois (envois par e-mail enregistrés) et pdf (état : ok, en_cours, echec). Ne montre jamais de prix d'achat ni de marge (lire_devis donne les lignes). Filtres : statut ('tous' par défaut), affaireId, texte (numéro, objet, nom ou client), archives: true pour inclure les devis archivés.",
  schema: {
    statut: z.enum(['tous', 'brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', 'expire', 'remplace']).optional().describe("Défaut : tous."),
    affaireId: id.optional().describe("Seulement les devis de cette affaire."),
    texte: z.string().max(200).optional().describe("Mots cherchés dans le numéro, l'objet ou le nom du client."),
    archives: z.boolean().optional().describe("true : inclure les devis archivés (exclus par défaut)."),
    limite,
  },
  executer: ({ args, donnees, maintenant }) => lecture.listerDevis(donnees, args, maintenant),
};

export const lire_devis = {
  nom: 'lire_devis',
  profils: TOUS,
  description: "Lit un devis complet, côté artisan : client, affaire, destinataires, chantier, sections et lignes (quantité, unité, prix d'achat, marge, prix de vente unitaire et total hors taxes de chaque ligne, comme lister_articles montre les prix d'achat), remise, acomptes (liste : type pourcentage, montantHt ou montantTtc, valeur, moment ; un ancien devis à acompte unique donne une liste d'un élément) et totaux (brut, remise, hors taxes, TVA, TTC, acompteTTC = somme des acomptes, acomptesTTC = un montant TTC par acompte, resteAFacturerTTC), copie (e-mails en copie), envois (historique des envois par e-mail : date, destinataires, copie ; envoyeLe = premier envoi), archive/archiveLe et pdf (état seulement, jamais de chemin). Pour un brouillon, erreursFinalisation liste ce qui manque avant finaliser_devis (vide = prêt). Ne sert jamais à écrire au client : la vue client sans marge est celle du document. Chaque section et chaque ligne porte son `numero` (1, 1.1, 1.2… calculé, jamais stocké) et son `id` ; format: 'recapitulatif' rend seulement numéro, intitulé et quantité de chaque ligne (jamais de prix d'achat ni de marge ; avecPrix: true ajoute le prix de vente unitaire et le total hors taxes) et `phraseTotaux`, la phrase des totaux à redire telle quelle. Le mot affiché à l'utilisateur est donné par lire_reglages_devis.",
  schema: {
    id: id.describe('Identifiant du devis (voir lister_devis).'),
    format: z.enum(['complet', 'recapitulatif']).optional().describe("'recapitulatif' : structure courte pour redire le devis (défaut : 'complet')."),
    avecPrix: z.boolean().optional().describe("Avec format 'recapitulatif' : true ajoute le prix de vente unitaire et le total hors taxes de chaque ligne (jamais le prix d'achat ni la marge)."),
  },
  executer: ({ args, donnees, maintenant }) => lecture.lireDevis(donnees, args, maintenant),
};

// Garantie « aucun e-mail ne part tout seul » (29/10/2026) : le seul moyen d'obtenir le PDF d'un devis. Ne fabrique rien (le PDF est fait par le serveur à la finalisation).
export const obtenir_pdf_officiel_devis = {
  nom: 'obtenir_pdf_officiel_devis',
  profils: TOUS,
  description: "À n'appeler QUE si l'utilisateur demande explicitement le PDF d'un devis. Donne le PDF OFFICIEL d'un devis finalisé (celui que le serveur a fabriqué à la finalisation ; ni prix d'achat ni marge) : un lien de lecture COURT (5 minutes, `lien`) et le lien du devis dans l'application (`lienApplication`, connexion nécessaire). C'est le SEUL PDF de devis à utiliser : ne fabrique JAMAIS un autre PDF toi-même, même « de démonstration ». Ne transmets jamais ce PDF ni ce lien à quelqu'un d'autre sans montrer le destinataire à l'utilisateur et obtenir son « oui » clair. Refusé pour un brouillon de devis, ou si le PDF n'est pas prêt ou introuvable : dans ce cas ARRÊTE-TOI et dis-le à l'utilisateur, n'envoie rien. Un avertissement signale un devis qui n'est plus en cours (remplacé, refusé, expiré, archivé) ou l'absence de lien direct. Pour préparer l'e-mail avec ce PDF joint : preparer_email.",
  schema: { id: id.describe('Identifiant du devis finalisé (voir lister_devis).') },
  executer: ({ args, ...c }) => metier.pdfOfficielDevis(c, args),
};

// TEMPORAIRE : diagnostic de ce que l'assistant envoie quand on joint un fichier (à retirer après l'essai). Lecture seule : ni base, ni audit, ni téléchargement.
export const diagnostiquer_fichiers = {
  nom: 'diagnostiquer_fichiers',
  profils: TOUS,
  meta: { 'openai/fileParams': ['fichiers'] },
  description: "Outil d'essai, temporaire. Quand l'utilisateur joint des fichiers (photos, PDF) à la conversation, passe-les dans `fichiers`, tels que tu les as reçus. L'outil n'enregistre ni ne télécharge rien : il répond seulement ce qu'il a reçu (nombre, forme, hôte des liens).",
  schema: {
    fichiers: z.any().optional().describe('Les fichiers joints à la conversation, tels que reçus (liste de fichiers, de liens ou de textes).'),
    note: z.string().max(500).optional().describe('Remarque libre et courte (facultatif).'),
  },
  executer: ({ args, acteur }) => {
    const forme = resumerForme(args.fichiers);
    ligneDeDiagnostic({ forme, acteur, note: args.note });
    return { message: phraseDe(forme), forme };
  },
};

export const OUTILS_LECTURE = [diagnostiquer_fichiers, chercher, lire_personne, lire_organisation, lire_affaire, lister_affaires, lister_projets, lire_projet, lister_modeles_projet, lister_activites, lister_documents, lire_reglages, lire_audit, lister_articles, chercher_article, rechercher_article_par_phrase, lire_reglages_devis, lister_devis, lire_devis, obtenir_pdf_officiel_devis];
