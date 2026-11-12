// Outils du module Réseaux sociaux (13/11/2026) : sources d'inspiration, pistes de posts, exemples et idées. 12 outils : 4 de lecture, 8 d'écriture, AUCUN de suppression
// (une piste se met « écartée », une idée « abandonnée » : tout est gardé). Chacun valide sa saisie (zod, listes de champs fermées : aucun champ `extrait`, jamais le texte
// d'un post tiers), puis délègue à coeur/reseauxsociaux.js, qui applique les plans purs du module (les mêmes que l'écran) ; l'écriture est journalisée par le moteur.
// Lecture : profils lecture, ecriture et complet. Écriture : ecriture et complet seulement (jamais agent-devis ni assistant-devis).
import { z } from 'zod';
import * as RS from '../../coeur/reseauxsociaux.js';
import { MAX_LIGNES } from '../../coeur/lecture.js';
import * as R from '../../../partage/rs-logique.js';
import * as I from '../../../partage/rs-idees.js';
import * as N from '../../../partage/rs-inspirations.js';
import * as P from '../../../partage/rs-pistes.js';

const LECTURE = ['lecture', 'ecriture', 'complet'];
const ECRITURE = ['ecriture', 'complet'];
const id = z.string().min(1).max(200);
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Attendu AAAA-MM-JJ').describe('Jour AAAA-MM-JJ.');
const limite = z.number().int().min(1).max(MAX_LIGNES).optional().describe(`Nombre maximal de lignes (défaut et plafond : ${MAX_LIGNES}).`);
const ids = (liste) => liste.map((x) => x.id).join(', ');
const pilier = z.enum(R.PILIERS.map((x) => x.id)).describe(`Pilier : ${ids(R.PILIERS)}.`);
const format = z.enum(R.FORMATS.map((x) => x.id)).describe(`Format : ${ids(R.FORMATS)}.`);
const service = z.enum(R.SERVICES.map((x) => x.id)).describe(`Service : ${ids(R.SERVICES)}.`);
const typeSource = z.enum(N.TYPES_SOURCE.map((x) => x.id)).describe(`Type de source : ${ids(N.TYPES_SOURCE)} (sans type, une fiche vaut profil).`);
const CONSIGNE_TEXTE_TIERS = "Jamais le texte d'un post écrit par quelqu'un d'autre : seulement un lien et une analyse écrite avec tes mots.";

const outil = (nom, profils, description, schema, action) => ({ nom, profils, description, schema, executer: ({ args, ...c }) => action(c, args) });

const champsSource = {
  nom: z.string().min(1).max(N.MAX_NOM).describe('Nom de la source (un profil, un site, un résumé de veille).'),
  url: z.string().max(N.MAX_URL).optional().describe('Adresse : LinkedIn pour un profil (obligatoire), https pour un site (obligatoire), facultative pour un résumé de veille.'),
  pourquoi: z.string().max(N.MAX_ANALYSE).optional().describe(`« Ce qui m'inspire » (${N.MAX_ANALYSE} caractères au plus), écrit avec tes mots.`),
  piliers: z.array(pilier).max(R.PILIERS.length).optional(),
  formats: z.array(format).max(R.FORMATS.length).optional(),
  resume: z.string().max(I.MAX_RESUME).optional().describe('Résumé de veille fait à la main : nom EXACT du fichier résumé du second cerveau.'),
  veilleContenuId: z.string().max(90).regex(/^[A-Za-z0-9_-]+$/, 'Lettres, chiffres, tiret et tiret bas seulement').optional().describe('Résumé de veille fait par n8n : la fiche prend alors l’identifiant « veille-<contenu> ». Identifiant du contenu : identifiant du contenu dans la table veille_contenus.'),
  moyenneReactions: z.number().min(0).max(1e9).optional().describe('Profil : moyenne des réactions de ses posts de plus de deux semaines, relevée par toi.'),
  moyenneCommentaires: z.number().min(0).max(1e9).optional().describe('Profil : moyenne des commentaires, relevée par toi.'),
  nombrePostsReleves: z.number().int().min(0).max(1e6).optional().describe('Profil : nombre de posts pris pour les deux moyennes.'),
  releveLe: jour.optional().describe('Profil : jour du relevé des moyennes.'),
};
const sourceDeIdee = z.object({
  type: z.enum(I.SOURCES_IDEE.map((x) => x.id)).optional().describe(`Type : ${ids(I.SOURCES_IDEE)}.`),
  titre: z.string().max(I.MAX_TITRE_SOURCE).optional(), url: z.string().max(500).optional(), ancre: z.string().max(I.MAX_TITRE_SOURCE).optional().describe('Section ou page, en texte.'),
  resume: z.string().max(I.MAX_RESUME).optional().describe('Veille : nom exact du fichier résumé.'), motsCles: z.string().max(I.MAX_RESUME).optional().describe('Veille : mots-clés pour retrouver le passage.'),
  consulteLe: jour.optional(), archive: z.string().max(500).optional().describe('Adresse d’une copie archivée.'),
}).describe(`Une source de l'idée : un lien et un titre, JAMAIS le texte d'un tiers (pas de champ extrait).`);
const champsIdee = {
  angle: z.string().min(1).max(I.MAX_ANGLE),
  sources: z.array(sourceDeIdee).max(I.MAX_SOURCES).optional().describe(`D'où vient l'idée (${I.MAX_SOURCES} au plus). À la modification, la liste donnée REMPLACE l'actuelle.`),
  pilier: pilier.optional(), format: format.optional(), service: service.optional(),
  etat: z.enum(I.ETATS_IDEE.map((x) => x.id)).optional().describe(`État : ${ids(I.ETATS_IDEE)}.`),
  texte: z.string().max(R.LIMITE_LINKEDIN).optional().describe("Le texte d'un post DE L'UTILISATEUR (brouillon), jamais celui d'un tiers. Il s'efface du module quand l'idée passe « Dans Buffer »."),
};
const unePiste = z.object({
  angle: z.string().min(1).max(P.MAX_ANGLE).describe('La piste en une phrase, avec tes mots.'),
  note: z.string().max(P.MAX_NOTE).optional().describe('Pourquoi c’est une bonne piste (écrit par toi).'),
  ancre: z.string().max(P.MAX_ANCRE).optional().describe('La section du site, ou les mots-clés pour retrouver le passage du résumé.'),
  accroche: z.string().max(P.MAX_ACCROCHE).optional().describe('La première phrase du post (écrite par toi).'),
  brouillon: z.string().max(P.MAX_BROUILLON * 2).optional().describe('Le post presque prêt : accroche, développement en paragraphes courts, appel final. Nos mots, jamais ceux d’un tiers.'),
  visuel: z.string().max(P.MAX_VISUEL).optional().describe('Proposition de visuel ou d’animation qui accompagne le post (ce qu’on y voit).'),
  pilier: pilier.optional().describe('Ancien champ : un seul pilier. Préfère piliers.'),
  piliers: z.array(pilier).min(1).max(P.MAX_PILIERS).optional().describe(`TOUS les piliers que la piste sert (1 à ${P.MAX_PILIERS}), le premier est le principal.`),
  url: z.string().max(500).optional().describe('Lien facultatif en https (page du site, post LinkedIn).'),
  exempleId: z.string().max(100).optional().describe("L'exemple de post (de cette source) qui a donné la piste."),
  format: format.optional(), service: service.optional(),
}).describe(`Une piste. ${CONSIGNE_TEXTE_TIERS} Champs fermés : aucun texte ni extrait.`);

export const OUTILS_RESEAUX_LECTURE = [
  outil('lister_sources_inspiration', LECTURE, "Liste les sources d'inspiration du module Réseaux sociaux (profils LinkedIn, sites, résumés de veille) avec, pour chacune, ses compteurs calculés : pistes, retenues, postées (l'idée liée est « Dans Buffer »). Filtres : type, sansPiste (sources qui n'ont encore aucune piste : celles à traiter). Les identifiants servent à lire_source_inspiration et ajouter_pistes.", {
    type: typeSource.optional(), sansPiste: z.boolean().optional().describe('true : seulement les sources à 0 piste.'), limite,
  }, RS.listerSources),
  outil('lire_source_inspiration', LECTURE, "Lit une source d'inspiration avec ses compteurs, ses exemples de posts (lien et analyse, chiffres et écart à la moyenne du profil ; jamais le texte d'un post) et toutes ses pistes (avec leur état affiché : stock, retenue, rédaction, postée, écartée).", { id: id.describe('Identifiant de la source.') }, RS.lireSource),
  outil('lister_pistes', LECTURE, `Liste les pistes de posts (le stock). Filtres : sourceId, etat (${ids(P.ETATS_PISTE)}), pilier, format, lot (étiquette d'un arrivage). ${MAX_LIGNES} lignes au plus.`, {
    sourceId: id.optional(), etat: z.enum(P.ETATS_PISTE.map((x) => x.id)).optional(), pilier: pilier.optional(), format: format.optional(), lot: z.string().max(P.MAX_LOT).optional(), limite,
  }, RS.listerPistes),
  outil('lister_idees', LECTURE, `Liste les idées de posts (les pistes retenues et les idées libres). Filtres : etat (${ids(I.ETATS_IDEE)}), pilier. Le texte d'un brouillon est rendu ; les mots d'un tiers saisis à l'écran (extrait) ne le sont jamais.`, {
    etat: z.enum(I.ETATS_IDEE.map((x) => x.id)).optional(), pilier: pilier.optional(), limite,
  }, RS.listerIdees),
];

export const OUTILS_RESEAUX_ECRITURE = [
  outil('creer_source_inspiration', ECRITURE, `Ajoute une source d'inspiration : un profil LinkedIn (type profil, adresse LinkedIn obligatoire), un site (type site, adresse https obligatoire) ou un résumé de veille (type veille). Refuse un doublon (même nom ou même adresse, accents et casse ignorés) sauf forcer: true. ${CONSIGNE_TEXTE_TIERS}`, {
    type: typeSource.optional(), ...champsSource, forcer: z.boolean().optional().describe('true : créer malgré un doublon possible, après avoir vérifié que c’est une autre source.'),
  }, RS.creerSource),
  outil('modifier_source_inspiration', ECRITURE, "Modifie des champs d'une source (seuls les champs donnés changent) : type, nom, url, pourquoi, piliers et formats (listes qui remplacent les actuelles), resume, veilleContenuId et, pour un profil, les moyennes relevées. Les pistes ne sont pas touchées.", {
    id: id.describe('Identifiant de la source.'), type: typeSource.optional(), ...Object.fromEntries(Object.entries(champsSource).map(([k, v]) => [k, k === 'nom' ? v.optional() : v])),
  }, RS.modifierSource),
  outil('ajouter_pistes', ECRITURE, `Ajoute 1 à ${P.MAX_PISTES_PAR_LOT} pistes à une source, en un appel (au-delà : plusieurs appels). Mêmes contrôles que le collage de l'écran : un angle déjà en stock pour cette source (accents, casse et ponctuation ignorés) ou répété dans l'appel est ignoré et listé dans « ignorees » ; un pilier, format ou service hors liste refuse l'appel (la liste permise est donnée). Les pistes arrivent à l'état nouvelle, auteur claude, avec un lot (défaut : AAAA-MM-JJ-claude). Pour le résumé de veille d'un contenu de veille_contenus qui n'a pas encore de fiche : sourceId = « veille- » suivi de veilleContenuId, avec veilleContenuId et nom (la fiche est créée). ${CONSIGNE_TEXTE_TIERS}`, {
    sourceId: id.describe('Identifiant de la source (lister_sources_inspiration).'),
    nom: z.string().max(N.MAX_NOM).optional().describe('Seulement pour créer la fiche d’un résumé de veille qui n’existe pas encore.'),
    veilleContenuId: z.string().max(90).regex(/^[A-Za-z0-9_-]+$/, 'Lettres, chiffres, tiret et tiret bas seulement').optional().describe('Seulement pour créer la fiche d’un résumé de veille qui n’existe pas encore.'),
    lot: z.string().max(P.MAX_LOT).optional().describe('Étiquette de l’arrivage, pour le retrouver d’un coup.'),
    pistes: z.array(unePiste).min(1).max(P.MAX_PISTES_PAR_LOT),
  }, RS.ajouterPistes),
  outil('modifier_piste', ECRITURE, "Modifie une piste : angle, accroche, brouillon, note, ancre, piliers (liste), pilier, format, service, et etat (nouvelle pour la remettre en stock, ecartee pour l'écarter : elle reste retrouvable, rien ne se supprime). Pour retenir une piste, utiliser retenir_piste.", {
    id: id.describe('Identifiant de la piste.'), angle: z.string().min(1).max(P.MAX_ANGLE).optional(), note: z.string().max(P.MAX_NOTE).optional(), ancre: z.string().max(P.MAX_ANCRE).optional(),
    accroche: z.string().max(P.MAX_ACCROCHE).optional(), brouillon: z.string().max(P.MAX_BROUILLON * 2).optional(), visuel: z.string().max(P.MAX_VISUEL).optional(), piliers: z.array(pilier).max(P.MAX_PILIERS).optional().describe('Remplace la liste des piliers.'),
    pilier: pilier.nullable().optional(), format: format.nullable().optional(), service: service.nullable().optional(), etat: z.enum(P.ETATS_PISTE.map((x) => x.id)).optional().describe('nouvelle : remettre en stock ; ecartee : écarter. « retenue » est refusé ici : utiliser retenir_piste.'),
  }, RS.modifierPiste),
  outil('retenir_piste', ECRITURE, "Retient une piste (comme « En faire une idée » à l'écran) : crée l'idée (angle, brouillon recopié comme texte, pilier principal, format, service et source recopiés) et lie les deux ; la piste passe à « retenue ». Refusé si la piste est déjà devenue une idée.", { id: id.describe('Identifiant de la piste.') }, RS.retenirPiste),
  outil('enregistrer_exemple', ECRITURE, `Enregistre l'exemple d'un post d'un profil : son lien LinkedIn et TON analyse (accroche, structure, longueur, pourquoi ça marche), avec les chiffres relevés (reactions, commentaires, releveLe). Il n'y a PAS de champ pour le texte du post. Refuse un lien déjà enregistré pour ce profil ; avec id, met à jour l'exemple existant (chiffres, analyse). ${CONSIGNE_TEXTE_TIERS}`, {
    id: id.optional().describe("Seulement pour mettre à jour un exemple existant."), profilId: id.optional().describe('Identifiant du profil (une source de type profil). Obligatoire à la création.'),
    url: z.string().max(N.MAX_URL).optional().describe('Lien du post sur LinkedIn. Obligatoire à la création.'), date: jour.optional().describe('Jour du post.'),
    accroche: z.string().max(N.MAX_ANALYSE).optional().describe('Décris l’accroche avec tes mots : ne recopie pas la phrase du post.'), structure: z.string().max(N.MAX_ANALYSE).optional(), longueur: z.string().max(N.MAX_ANALYSE).optional(), pourquoi: z.string().max(N.MAX_ANALYSE).optional(),
    format: format.optional(), pilier: pilier.optional(), service: service.optional(),
    reactions: z.number().int().min(0).max(1e9).optional(), commentaires: z.number().int().min(0).max(1e9).optional(), releveLe: jour.optional().describe('Jour où les chiffres ont été relevés.'),
  }, RS.enregistrerExemple),
  outil('creer_idee', ECRITURE, "Crée une idée de post (état idee par défaut). Refuse un angle déjà pris par une autre idée (accents et casse ignorés) sauf forcer: true. Pour transformer une piste en idée, utiliser retenir_piste. texte = un brouillon de l'utilisateur, jamais le texte d'un tiers ; une idée « dans_buffer » n'a pas de texte dans le module.", {
    ...champsIdee, forcer: z.boolean().optional().describe('true : créer malgré un doublon possible.'),
  }, RS.creerIdee),
  outil('modifier_idee', ECRITURE, "Modifie une idée (seuls les champs donnés changent) : angle, sources (la liste donnée remplace l'actuelle), pilier, format, service, etat, texte. Passer « dans_buffer » efface le texte du module : refusé sans effacerLeTexte: true quand l'idée a un texte.", {
    id: id.describe("Identifiant de l'idée."), ...Object.fromEntries(Object.entries(champsIdee).map(([k, v]) => [k, k === 'angle' ? v.optional() : v])),
    effacerLeTexte: z.boolean().optional().describe('true : confirmer que le texte peut s’effacer du module (il est déjà dans Buffer).'),
  }, RS.modifierIdee),
];
