// Outils de création et de modification (profils bibliothécaire et Claude Code). Chacun valide sa saisie (zod), puis délègue à coeur/metier.js :
// mêmes règles que l'écran (plans de logique.js), écriture journalisée par le moteur (audit en trois lots). Aucun outil n'écrit directement.
import { z } from 'zod';
import * as L from '../../../partage/logique.js';
import * as PL from '../../../partage/projets.js';
import * as DA from '../../../partage/devis-articles.js';
import * as DEVIS from '../../../partage/devis.js';
import * as metier from '../../coeur/metier.js';
import { ACTIONS_STATUT } from '../../coeur/devis.js';

const PROFILS = ['bibliothecaire', 'claude-code'];
const id = z.string().min(1).max(200);
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Attendu AAAA-MM-JJ').describe('Date AAAA-MM-JJ.');
const adresses = z.array(z.object({
  id: z.string().max(40).optional(), libelle: z.string().max(60).optional(), adresse: z.string().max(500), parDefaut: z.boolean().optional(),
})).max(L.MAX_ADRESSES).describe(`Adresses enregistrées (liste complète, qui REMPLACE l'actuelle ; ${L.MAX_ADRESSES} au plus) : { libelle (facultatif, « Adresse » par défaut), adresse (texte, plusieurs lignes possibles), parDefaut (une seule à true) }. Passer l'id d'une adresse existante la garde stable. [] la vide.`);
const contacts = z.array(z.object({ valeur: z.string().max(200), type: z.enum(L.TYPES_CONTACT.map((t) => t.id)).optional() })).max(10);
const etiquettes = z.array(z.string().max(80)).max(30).describe('Identifiants d’étiquettes (voir lire_reglages, etiquettes).');
const proprietaire = z.string().max(120).optional().describe('Propriétaire de la fiche créée (facultatif ; si absent, par défaut la personne connectée).');
const forcer = z.boolean().optional().describe('true : créer malgré un doublon possible (nom ou e-mail déjà connu), après avoir vérifié que c’est une autre fiche.');
const texteCourt = z.string().max(300);
// Devis : type d'article et composants d'un ouvrage (les règles fines sont dans devis-articles.js, les mêmes que l'écran).
const typeArticle = z.enum(DA.TYPES_ARTICLE.map((t) => t.id));
const composants = z.array(z.object({ articleId: id, quantite: z.number() })).max(30).describe("Composants d'un ouvrage : [{ articleId, quantite }], 1 à 30, quantité > 0 (3 décimales au plus).");
// Devis : lignes d'un brouillon (copiées des articles du bordereau) et remise.
const ligneDevis = z.object({ articleId: id.optional(), reference: z.string().min(1).max(120).optional(), quantite: z.number().positive().max(1_000_000).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, '3 décimales au plus').optional() })
  .describe("Une ligne : articleId OU reference (référence ou code de l'article), et quantite (> 0 ; inutile pour un article de type texte).");
const lignesDevis = z.array(ligneDevis).max(200).describe("Lignes à plat, copiées des articles du bordereau.");
const sectionsDevis = z.array(z.object({ titre: z.string().max(200).optional(), lignes: z.array(ligneDevis).max(200) })).max(50).describe("Sections [{ titre, lignes }].");
const copieDevis = z.array(z.string().max(254)).max(DEVIS.MAX_COPIE).describe(`Adresses e-mail EN COPIE de l'envoi du devis (${DEVIS.MAX_COPIE} au plus, adresses valides, sans doublon, jamais une adresse déjà destinataire : mêmes règles que l'écran). Liste complète, qui REMPLACE l'actuelle ; [] la vide.`);
const remiseDevis = z.object({ type: z.enum(DEVIS.TYPES_REMISE), valeur: z.number().min(0).max(10_000_000) }).describe("Remise du devis : { type: 'pourcentage' | 'montant', valeur } (pourcentage de 0 à moins de 100 ; montant en euros).");
// Ancien paramètre « description » (texte libre supprimé par I5) : accepté sans être documenté, pour les clients MCP qui ont gardé l'ancienne liste d'outils.
// À la création, il devient le texte de la note épinglée de départ ; en modification, il est refusé avec l'explication (modifier_note).
const descriptionAncienne = z.string().max(20000).optional();
const urlGithub = z.string().max(500).optional().describe('Ancien champ « dépôt de code » (https://github.com/compte/nom), facultatif ; chaîne vide pour l’effacer. Pour un nouveau lien, préférer joindre_lien (liste « Liens et documents »).');
const urlDossier = z.string().max(500).optional().describe('Lien du dossier de travail : n’importe quel lien complet (Google Drive, serveur ou NAS en smb://, site…) ; chaîne vide pour l’effacer.');

const sourceListe = texteCourt.optional().describe('Source = une valeur de la liste des Réglages (voir lire_reglages, sources), jamais un texte libre : une autre valeur est refusée ; le détail (par exemple « recommandé par … ») va dans une note. Chaîne vide pour l’effacer.');

const outil = (nom, description, schema, action, profils = PROFILS) => ({
  nom, profils, description, schema, executer: ({ args, ...c }) => action(c, args),
});

export const OUTILS_ECRITURE = [
  outil('creer_personne', "Crée une personne (seul le nom est obligatoire), avec son événement dans le fil. Refuse un doublon (même nom, accents et casse ignorés, ou même e-mail) sauf forcer: true. Le propriétaire est, par défaut, la personne connectée si on n'en donne pas.", {
    nom: z.string().min(1).max(200), organisationId: id.optional(), emails: contacts.optional(), telephones: contacts.optional(), adresses: adresses.optional(), etiquettes: etiquettes.optional(),
    ville: texteCourt.optional(), source: sourceListe, forcer, proprietaire,
  }, metier.creerPersonne),

  outil('modifier_personne', "Modifie des champs d'une personne (seuls les champs donnés changent) : nom, organisationId (null pour détacher), emails, telephones, adresses (liste qui remplace l'actuelle), etiquettes, ville, source, linkedin, siteWeb, archive. Ne supprime jamais. Refuse un nom ou e-mail qui ferait doublon avec une autre personne sauf forcer: true.", {
    id, nom: z.string().min(1).max(200).optional(), organisationId: id.nullable().optional(), emails: contacts.optional(), telephones: contacts.optional(), adresses: adresses.optional(), etiquettes: etiquettes.optional(),
    ville: texteCourt.optional(), source: sourceListe, linkedin: z.string().max(300).optional(), siteWeb: z.string().max(300).optional(),
    archive: z.boolean().optional().describe('true : archiver ; false : désarchiver.'), forcer,
  }, metier.modifierPersonne),

  outil('creer_organisation', "Crée une organisation (seul le nom est obligatoire ; emails et telephones : listes de { valeur, type }, 10 au plus ; adresses : liste d'adresses enregistrées), avec son événement dans le fil. Refuse un doublon de nom sauf forcer: true.", {
    nom: z.string().min(1).max(200), adresse: texteCourt.optional(), ville: texteCourt.optional(), secteur: texteCourt.optional(), emails: contacts.optional(), telephones: contacts.optional(), adresses: adresses.optional(), etiquettes: etiquettes.optional(), forcer, proprietaire,
  }, metier.creerOrganisation),

  outil('modifier_organisation', "Modifie des champs d'une organisation : nom, adresse, ville, siteWeb, adresses (liste d'adresses enregistrées, qui REMPLACE l'actuelle ; les champs adresse et ville ne bougent pas), emails et telephones (listes { valeur, type } de 10 au plus, qui REMPLACENT la liste actuelle ; [] la vide), secteur, taille (Solo, 2 à 10, 11 à 50, Plus de 50, ou vide), etiquettes, archive. Les anciens champs texte email et telephone sont gardés : une valeur donnée est AJOUTÉE à la liste (jamais perdue ; pour vider, passer emails: []). Ne supprime jamais.", {
    id, nom: z.string().min(1).max(200).optional(), adresse: texteCourt.optional(), ville: texteCourt.optional(), siteWeb: z.string().max(300).optional(), emails: contacts.optional(), telephones: contacts.optional(), adresses: adresses.optional(), telephone: texteCourt.optional(), email: z.string().max(200).optional(), secteur: texteCourt.optional(),
    taille: z.string().max(20).optional(), etiquettes: etiquettes.optional(), archive: z.boolean().optional(), forcer,
  }, metier.modifierOrganisation),

  outil('creer_affaire', `Crée une affaire avec son événement. Le titre par défaut est le nom de l'organisation, sinon de la personne ; l'organisation de la personne est reprise si aucune n'est donnée. Étape (défaut : la première étape active) parmi celles de lire_reglages (configuration.etapes, referentiels.etapes). Priorité : ${L.PRIORITES.map((p) => p.id).join(', ')}. L'affaire part avec une note épinglée vide (de quoi parle l'affaire) : son identifiant est rendu dans noteEpingleeId ; l'écrire avec modifier_note.`, {
    titre: z.string().max(300).optional(), personneId: id.optional(), organisationId: id.optional(), etape: z.string().max(60).optional(), priorite: z.string().max(40).optional(),
    montant: z.number().min(0).max(1e9).nullable().optional().describe('Montant en euros.'), offreId: id.optional(), dureeJours: z.number().int().min(0).max(36500).nullable().optional(),
    source: sourceListe, besoin: z.string().max(5000).optional(), urlGithub, urlDossier, proprietaire, description: descriptionAncienne,
  }, metier.creerAffaire),

  outil('modifier_affaire', "Modifie des champs d'une affaire : titre, personneId et organisationId (null pour détacher), montant, priorite, offreId, dureeJours, source, besoin, urlGithub, urlDossier, archive. Pour l'étape ou le statut, utiliser changer_etape, marquer_perdue, rouvrir_affaire.", {
    id, titre: z.string().min(1).max(300).optional(), personneId: id.nullable().optional(), organisationId: id.nullable().optional(), montant: z.number().min(0).max(1e9).nullable().optional(),
    priorite: z.string().max(40).optional(), offreId: id.nullable().optional(), dureeJours: z.number().int().min(0).max(36500).nullable().optional(), source: sourceListe,
    besoin: z.string().max(5000).optional(), urlGithub, urlDossier, archive: z.boolean().optional(), description: descriptionAncienne,
  }, metier.modifierAffaire),

  outil('changer_etape', "Change l'étape d'une affaire comme l'écran : statut, dates d'étapes, événements du fil ; l'étape « vente gagnée » est celle que la configuration désigne (lire_reglages). Renvoie l'action suggérée par l'étape, s'il y en a une (non créée : à créer avec creer_activite si pertinent).", {
    id, etape: z.string().min(1).max(60),
  }, metier.changerEtape),

  outil('marquer_perdue', `Marque une affaire perdue. Raison parmi : ${L.RAISONS_PERDUE.join(' ; ')}.`, { id, raison: z.string().min(1).max(60), detail: z.string().max(1000).optional() }, metier.marquerPerdue),
  outil('rouvrir_affaire', 'Rouvre une affaire perdue.', { id }, metier.rouvrirAffaire),

  // ---- Projets (2.1) et factures (2.2) : mêmes règles que l'écran
  outil('creer_projet', `Crée un projet (seul le titre est obligatoire), avec son événement. modeleId (voir lister_modeles_projet) : le projet part avec les livrables du modèle, datés à partir de la date de début. Phase de départ : la première phase active de l'espace (voir lire_reglages, configuration.phases). Pour le projet d'une affaire gagnée, préférer creer_projet_depuis_affaire. Le projet part avec une note épinglée vide (de quoi parle le projet) : son identifiant est rendu dans noteEpingleeId ; l'écrire avec modifier_note.`, {
    titre: z.string().min(1).max(300), personneId: id.optional(), organisationId: id.optional(), offreId: id.optional(), modeleId: id.optional(),
    dateDebut: jour.optional(), dateFin: jour.optional(), urlGithub, urlDossier, proprietaire, description: descriptionAncienne,
  }, metier.creerProjet),

  outil('creer_projet_depuis_affaire', "Crée le projet d'une affaire GAGNÉE (comme « Créer le projet » de la fiche affaire) : reprend son titre, sa personne, son organisation, son offre, son dépôt, son dossier, et lie l'affaire au projet (une affaire n'a qu'un projet). Le projet part avec une note épinglée qui copie le texte de la note épinglée de l'affaire (vide si elle n'en a pas) : identifiant rendu dans noteEpingleeId. modeleId : tâches du modèle.", {
    affaireId: id, modeleId: id.optional(), titre: z.string().max(300).optional(), dateDebut: jour.optional(), dateFin: jour.optional(), description: descriptionAncienne,
  }, metier.creerProjetDepuisAffaire),

  outil('modifier_projet', "Modifie des champs d'un projet : titre, personneId et organisationId (null pour détacher), offreId, dateDebut, dateFin (null pour effacer), urlGithub, urlDossier. La phase et le statut passent par changer_phase_projet, terminer_projet, rouvrir_projet, archiver_projet.", {
    id, titre: z.string().min(1).max(300).optional(), personneId: id.nullable().optional(), organisationId: id.nullable().optional(), offreId: id.nullable().optional(),
    dateDebut: jour.nullable().optional(), dateFin: jour.nullable().optional(), urlGithub, urlDossier, description: descriptionAncienne,
  }, metier.modifierProjet),

  outil('changer_phase_projet', `Change la phase d'un projet, dans tous les sens (on peut revenir en arrière). Phases : celles de lire_reglages (configuration.phases). Vers la phase de clôture, refusé tant qu'une facture est à payer si les options « Suivi des paiements » et « Clôture bloquée » sont allumées (lire_reglages, configuration.options) (voir terminer_projet pour la sortie « impayé »). Changer la phase d'un projet terminé le rouvre.`, {
    id, phase: z.string().min(1).max(40),
  }, metier.changerPhaseProjet),

  outil('rouvrir_projet', 'Rouvre un projet terminé : il redevient actif et sort des archives, sans changer de phase.', { id }, metier.rouvrirProjet),
  outil('archiver_projet', "Archive un projet (archive: true) ou le sort des archives (archive: false), avec son événement. L'archivage est la voie normale pour ranger un projet : il ne le termine pas.", {
    id, archive: z.boolean().describe('true : archiver ; false : désarchiver.'),
  }, metier.archiverProjet),

  outil('terminer_projet', "Termine un projet (phase de clôture de l'espace : lire_reglages, configuration.phases, roleCloture ; statut Terminé, archivé). Si l'option « Suivi des paiements » est allumée, REFUSÉ tant qu'une facture du projet est à payer : le refus nomme les factures. Deux sorties : marquer la facture payée (marquer_facture_payee), ou recommencer avec impaye: { raison } : chaque facture restante passe à « abandonnee » avec cette raison, le projet se termine et garde sa pastille « Impayé ».", {
    id, impaye: z.object({ raison: z.string().min(1).max(500) }).optional().describe('Clôturer malgré des factures à payer : elles sont abandonnées, avec cette raison (obligatoire).'),
  }, metier.terminerProjet),

  outil('ajouter_livrable_projet', "Ajoute un livrable à un projet (phase du projet par défaut ; date AAAA-MM-JJ et heure HH:MM facultatives ; assigneA : un membre de l'espace, voir lire_reglages, referentiels.projets.assignes).", {
    projetId: id, titre: z.string().min(1).max(300), phase: z.string().max(40).optional(), date: jour.optional(),
    heure: z.string().regex(/^\d{2}:\d{2}$/, 'Attendu HH:MM').optional(), assigneA: z.string().max(40).optional(),
  }, metier.ajouterLivrableProjet),

  outil('terminer_livrable_projet', "Marque un livrable de projet comme fait (fait: false pour le remettre à faire), avec son événement dans le fil du projet. Les livrables d'un projet se lisent avec lire_projet (clé « livrables »).", {
    id, fait: z.boolean().optional().describe('Défaut true.'),
  }, metier.terminerLivrableProjet),

  outil('ajouter_facture', "Disponible seulement si l'option « Suivi des paiements » est allumée dans cet espace (lire_reglages, configuration.options). Ajoute une facture à un projet (une ligne par échéance : 30 % à la commande, 30 % en cours, 40 % à la fin = trois factures). montant en euros (> 0), libelle (ex. « Acompte 30 % »), dateEnvoi. Avec datePaiement, la facture est créée déjà payée. La clôture du projet attend que toutes soient payées ou abandonnées.", {
    projetId: id, montant: z.number().positive().max(1e7), libelle: z.string().max(200).optional(), dateEnvoi: jour.optional(), datePaiement: jour.optional(),
  }, metier.ajouterFacture),

  outil('marquer_facture_payee', "Disponible seulement si l'option « Suivi des paiements » est allumée dans cet espace (lire_reglages, configuration.options). Marque une facture payée (date du jour par défaut ; une facture se paie en entier : le montant, s'il est donné, doit être celui de la facture, sinon l'outil refuse) : elle compte alors dans le chiffre d'affaires encaissé du mois du paiement, avec son événement « Encaissement ». Une facture payée en deux fois se sépare en deux lignes.", {
    projetId: id, factureId: id, datePaiement: jour.optional(), montant: z.number().positive().max(1e7).optional().describe('Facultatif. Doit être égal au montant de la facture (une facture se paie en entier) ; une autre somme est refusée.'),
  }, metier.marquerFacturePayee),

  outil('abandonner_facture', "Disponible seulement si l'option « Suivi des paiements » est allumée dans cet espace (lire_reglages, configuration.options). Abandonne une facture qui ne sera jamais payée (raison obligatoire) : elle ne compte jamais dans l'encaissé et ne bloque plus la clôture ; le projet garde une pastille « Impayé ».", {
    projetId: id, factureId: id, raison: z.string().min(1).max(500),
  }, metier.abandonnerFacture),

  // ---- Devis : bordereau de prix (articles). Les prix d'achat viennent de l'humain : l'assistant n'en invente JAMAIS.
  outil('creer_article', "Ajoute un article au bordereau de prix du module Devis. libelle et prixAchat sont obligatoires. prixAchat : le prix d'achat HT en euros, DONNÉ PAR L'HUMAIN (jamais inventé ni estimé : le demander s'il manque), un NOMBRE (12.5), 2 décimales au plus. unite : u, m, m², m³, ml, h, jour, semaine, mois, forfait, lot, kg, t, L, paire, ensemble (ou un texte libre de 20 caractères au plus ; défaut u). code : facultatif, unique parmi les articles actifs. tauxTva : taux de TVA propre à l'article, facultatif (en %). type : facultatif (fourniture, main_oeuvre, ouvrage, sous_traitance, materiel, divers, texte) ; il se DÉDUIT de la famille si familleId est donné (donner les deux est permis seulement s'ils s'accordent, sinon erreur). Un article de type « texte » est une ligne de texte libre : prixAchat et unite facultatifs, pas de composants, il compte 0 dans un devis. reference et marque : facultatives (120 caractères). familleId : facultatif, l'identifiant d'une famille du bordereau (arbre à deux niveaux : sept familles de départ famille-1 Fournitures, famille-2 Main d'œuvre, famille-3 Ouvrages, famille-4 Sous-traitance, famille-5 Matériels, famille-6 Textes, famille-7 Divers, et des sous-familles créées par l'humain dans l'écran) ; le type de l'article est celui de la famille de premier niveau. Un OUVRAGE (type: 'ouvrage') est composé d'autres articles du bordereau : il n'a pas de prixAchat, mais composants (1 à 30 {articleId, quantite}, quantite > 0, 3 décimales au plus, jamais un autre ouvrage, jamais deux fois le même article ; chercher les identifiants avec chercher_article) et, facultatif, prixVenteForce (euros) pour imposer son prix de vente. marge : marge propre à l'article en %, facultative (sinon la marge des réglages). Chercher d'abord avec chercher_article pour éviter un doublon.", {
    libelle: z.string().min(1).max(200),
    prixAchat: z.number().min(0).max(10_000_000).optional().describe("Prix d'achat HT en euros, donné par l'humain. Obligatoire sauf pour un ouvrage."),
    type: typeArticle.optional(), composants: composants.optional(), prixVenteForce: z.number().min(0).max(10_000_000).optional().describe('Ouvrage seulement : prix de vente imposé, en euros.'),
    marge: z.number().min(0).max(1000).optional().describe("Marge propre à l'article, en %."),
    reference: z.string().max(120).optional().describe('Référence du fabricant.'), marque: z.string().max(120).optional(), familleId: z.string().max(100).optional().describe('Identifiant de la famille (famille-1 à famille-7, ou une sous-famille) : le type en est déduit.'),
    unite: z.string().max(20).optional().describe('Défaut : u.'),
    code: z.string().max(40).optional(),
    tauxTva: z.number().min(0).max(100).optional().describe("Taux de TVA propre à l'article, en %."),
    proprietaire,
  }, metier.creerArticle),

  outil('modifier_article', "Modifie des champs d'un article du bordereau : libelle, unite, prixAchat (euros, nombre donné par l'humain), code (chaîne vide pour l'effacer), tauxTva (null pour l'effacer), type (déduit de la famille : pour changer de type, changer familleId ; un type en conflit avec la famille est refusé), composants (remplace toute la liste d'un ouvrage), prixVenteForce et marge (null pour les effacer), reference, marque, familleId. Ne change jamais l'état actif : voir desactiver_article. Ne supprime jamais.", {
    id, libelle: z.string().min(1).max(200).optional(), unite: z.string().min(1).max(20).optional(),
    prixAchat: z.number().min(0).max(10_000_000).optional().describe("Prix d'achat HT en euros, donné par l'humain."),
    code: z.string().max(40).optional(), tauxTva: z.number().min(0).max(100).nullable().optional(),
    type: typeArticle.nullable().optional(), composants: composants.nullable().optional(), prixVenteForce: z.number().min(0).max(10_000_000).nullable().optional(),
    marge: z.number().min(0).max(1000).nullable().optional(),
    reference: z.string().max(120).optional().describe('Chaîne vide pour effacer.'), marque: z.string().max(120).optional(), familleId: z.string().max(100).optional().describe('Chaîne vide pour retirer la famille ; sinon le type est déduit de la nouvelle famille.'),
  }, metier.modifierArticle),

  outil('desactiver_article', "Désactive un article du bordereau (un article ne se supprime jamais : il sort de la liste par défaut et les devis déjà faits ne changent pas). reactiver: true le remet en service (refusé si son code est déjà pris par un article actif).", {
    id, reactiver: z.boolean().optional().describe('true : réactiver au lieu de désactiver.'),
  }, metier.desactiverArticle),

  // ---- Devis : brouillons. Les prix viennent des articles du bordereau (jamais inventés) ; le numéro n'est donné qu'à la finalisation.
  outil('creer_devis_brouillon', "Crée un BROUILLON de devis (jamais un devis finalisé), sans numéro : le numéro est donné par finaliser_devis. affaireId est obligatoire (voir chercher / lister_affaires). Le client et le destinataire viennent de l'affaire si on ne les donne pas (organisationId ou personneId, destinataires = adresses e-mail). Les lignes sont copiées des articles du bordereau (chercher_article) : chaque ligne donne articleId OU reference (la référence ou le code de l'article) et quantite (> 0) ; les prix, la marge et la TVA sont ceux de l'article et des réglages, calculés comme à l'écran. lignes = une liste à plat ; sections = [{ titre, lignes }] pour regrouper. remise : { type: 'pourcentage' | 'montant', valeur } (pourcentage de 0 à moins de 100 ; montant en euros). marge (%), modeMarge (majoration ou marge_vente) et tauxTvaDefaut sont facultatifs (sinon les réglages du module Devis). Renvoie l'identifiant et les totaux HT et TTC.", {
    affaireId: id, objet: z.string().max(300).optional().describe("L'objet du devis (ex. « Rénovation de la cuisine »)."),
    organisationId: id.optional(), personneId: id.optional(), destinataires: z.array(z.string().max(200)).max(10).optional().describe("Adresses e-mail des destinataires (défaut : la première adresse du client de l'affaire)."), copie: copieDevis.optional(),
    lignes: lignesDevis.optional(), sections: sectionsDevis.optional(), remise: remiseDevis.optional(),
    marge: z.number().min(0).max(1000).optional().describe('Marge du devis, en %.'), modeMarge: z.enum(DEVIS.MODES_MARGE.map((m) => m.id)).optional(),
    tauxTvaDefaut: z.number().min(0).max(100).optional().describe('Taux de TVA par défaut du devis, en %.'), proprietaire,
  }, metier.creerDevisBrouillon),

  outil('modifier_devis_brouillon', "Modifie un BROUILLON de devis (refusé pour un devis déjà finalisé : créer d'abord la version suivante avec nouvelle_version_devis). Champs : objet, organisationId, personneId, destinataires, copie (e-mails en copie, liste qui remplace l'actuelle), remise (null pour l'enlever), marge, modeMarge, tauxTvaDefaut. Les lignes : lignes ou sections REMPLACENT tout le contenu du devis (les lignes libres faites à l'écran sont perdues : relire avec lire_devis avant) ; ajouterLignes AJOUTE à la fin sans toucher au reste. Mêmes lignes que creer_devis_brouillon (articleId OU reference, quantite > 0). Renvoie les totaux HT et TTC.", {
    id, objet: z.string().max(300).optional(), organisationId: id.nullable().optional(), personneId: id.nullable().optional(), destinataires: z.array(z.string().max(200)).max(10).optional(), copie: copieDevis.optional(),
    lignes: lignesDevis.optional(), sections: sectionsDevis.optional(), ajouterLignes: lignesDevis.optional(), remise: remiseDevis.nullable().optional(),
    marge: z.number().min(0).max(1000).optional(), modeMarge: z.enum(DEVIS.MODES_MARGE.map((m) => m.id)).optional(), tauxTvaDefaut: z.number().min(0).max(100).optional(),
  }, metier.modifierDevisBrouillon),

  // Écriture sensible : elle FIGE le devis et consomme un numéro. Réservée à Claude Code (rôle éditeur chez un client), avec la double confirmation des suppressions.
  outil('finaliser_devis', "Finalise un BROUILLON de devis : attribue son numéro (DEV-AAAA-MM-JJ-NNN) et FIGE les prix, la TVA et les totaux (pour corriger ensuite, il faut créer la version suivante : nouvelle_version_devis). NE SE DÉFAIT PAS avec restaurer_depuis_audit (le numéro est consommé). Même logique serveur que le bouton « Finaliser » de l'écran. N'envoie rien au client. Refusé, en listant ce qu'il faut corriger, si le devis n'est pas prêt (destinataire, lignes, quantités, marge, remise, chantier…). Le premier appel ne finalise RIEN : il rend un APERÇU (totaux, destinataires) et un code à usage unique ; après l'accord de l'utilisateur, le second appel (mêmes arguments + codeConfirmation) finalise.", {
    id, codeConfirmation: z.string().max(40).optional().describe("Absent au premier appel : l'outil ne finalise rien, rend un APERÇU et un code. À donner au second appel, après accord de l'utilisateur."),
  }, metier.finaliserDevis, ['claude-code']),

  // Transitions du devis (25/10/2026) : la même fonction de coeur/devis.js que les boutons de l'écran, une ligne de journal chacune.
  outil('nouvelle_version_devis', "Crée la VERSION SUIVANTE d'un devis finalisé, envoyé ou refusé : un nouveau BROUILLON (même numéro, version + 1, mêmes lignes) à modifier avec modifier_devis_brouillon puis à finaliser avec finaliser_devis. C'est la voie pour corriger un devis déjà finalisé. Refusé depuis un brouillon, un devis signé ou remplacé, ou s'il existe déjà un brouillon de ce devis. Même logique serveur que le bouton de l'écran. Récupérable avec restaurer_depuis_audit (supprime ce brouillon).", {
    id: id.describe('Identifiant du devis de départ (voir lister_devis).'),
  }, metier.nouvelleVersionDevis),

  outil('archiver_devis', "Archive (archive: true) ou désarchive (archive: false) un devis. On n'archive qu'un devis Signé (accepte) ou Refusé ; un devis archivé sort de lister_devis (sauf archives: true) mais reste lisible. Aucun prix ni statut ne change. Même logique serveur que l'écran. Récupérable avec restaurer_depuis_audit.", {
    id: id.describe('Identifiant du devis (voir lister_devis).'), archive: z.boolean().describe('true : archiver ; false : désarchiver.'),
  }, metier.archiverDevis),

  outil('enregistrer_envoi_devis', "Ajoute une ligne à l'HISTORIQUE DES ENVOIS d'un devis déjà au statut « Envoyé » (envoye) : destinataires (1 à 10 adresses e-mail valides) et copie (0 à 10). À n'utiliser qu'APRÈS que l'utilisateur a confirmé que l'e-mail est vraiment parti (cet outil n'envoie rien). La date du premier envoi (envoyeLe) ne bouge pas : un renvoi ajoute simplement une ligne, les deux dates sont gardées (lire_devis, envois). Même logique serveur que l'écran. Récupérable avec restaurer_depuis_audit.", {
    id: id.describe('Identifiant du devis (statut envoye).'),
    destinataires: z.array(z.string().max(254)).min(1).max(DEVIS.MAX_COPIE).describe('Adresses e-mail auxquelles le devis a été envoyé (1 au moins).'),
    copie: z.array(z.string().max(254)).max(DEVIS.MAX_COPIE).optional().describe('Adresses e-mail en copie de cet envoi.'),
  }, metier.enregistrerEnvoiDevis),

  // Écriture sensible : le statut d'un devis ne se défait pas avec le journal (trace légale, et « Signé » remplace les autres versions). Claude Code seulement, aperçu puis code.
  outil('changer_statut_devis', "Change le statut d'un devis finalisé, comme les boutons de l'écran : action marquer_envoye (Finalisé -> Envoyé : à faire après l'envoi réel), accepter (Envoyé -> Signé ; les autres versions vivantes du même numéro passent à « Remplacé ») ou refuser (Envoyé -> Refusé). Mêmes règles de transition que l'écran, la date correspondante est posée. N'envoie rien au client. NE SE DÉFAIT PAS avec restaurer_depuis_audit (pour corriger un devis après coup : nouvelle_version_devis). marquer_envoye s'exécute DIRECTEMENT (journal écrit, mais non restaurable par le journal). accepter et refuser demandent une confirmation : le premier appel ne change RIEN et rend un APERÇU (statut avant et après, totaux, versions remplacées) et un code à usage unique ; après l'accord de l'utilisateur, le second appel (mêmes arguments + codeConfirmation) change le statut.", {
    id: id.describe('Identifiant du devis (voir lister_devis).'), action: z.enum(Object.keys(ACTIONS_STATUT)).describe('marquer_envoye | accepter (Signé) | refuser.'),
    codeConfirmation: z.string().max(40).optional().describe("Inutile pour marquer_envoye. Pour accepter et refuser, absent au premier appel : l'outil ne change rien, rend un APERÇU et un code. À donner au second appel, après accord de l'utilisateur."),
  }, metier.changerStatutDevis, ['claude-code']),

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
