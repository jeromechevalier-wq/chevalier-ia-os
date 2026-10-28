// Fichiers déposés dans l'onglet « Documents » d'une affaire ou d'un projet (28/10/2026) : stockés chez nous, dans Cloud Storage, avec une fiche dans `documents_stockes`.
// Le MÊME code sert les fonctions appelables de l'écran (documentDeposer, documentLien, documentSupprimer) chez Jérôme et chez les clients, et les outils MCP.
//  - le fichier est écrit par le SERVEUR (droits d'administration) ; aucune règle Storage ne change : le navigateur n'y a aucun accès direct, la lecture passe par un lien signé de 5 minutes ;
//  - la fiche est écrite par le serveur seulement (les règles Firestore refusent toute écriture d'un navigateur) et par le moteur d'écriture, donc avec une ligne de journal d'audit ;
//  - contrôles : type (extension ET type annoncé ET premiers octets), taille (réglage de l'espace, plafond technique), nom nettoyé ; voir js/modules/crm/fichiers-regles.js ;
//  - chemin : <espace>documents/<affaire|projet>/<id>/<uuid>-<nom> : chaque fichier est rattaché à sa fiche (de futurs droits par fiche pourront s'y appuyer) ;
//  - suppression = corbeille LOGIQUE : la fiche reçoit `supprimeLe`, le fichier ne bouge ni ne s'efface jamais. Le journal peut donc tout restaurer (restaurer_depuis_audit remet la fiche, le fichier est resté en place).
// `ecrire(operations, parametres)` : le moteur d'écriture (executerEcritures), déjà lié à l'acteur et au canal. `stockage` : stockage.js (ou un faux pour les essais).
import { randomUUID } from 'node:crypto';
import { COLLECTIONS as C } from './donnees.js';
import { executerEcritures } from './ecriture.js';
import { cheminDocument, cheminDocumentAppartientALEspace, DUREE_LIEN_MINUTES } from '../devis/stockage.js';
import {
  controlerFichier, messageTropGros, signatureCoherente, nomSansDoublon, limiteEffectiveMo, enOctets, TYPES, TEXTE_MCP_MAX_OCTETS, TYPES_ACCEPTES_TEXTE,
} from '../../partage/fichiers-regles.js';

/** code : demande_invalide | introuvable | refuse (type, taille, nom) | non_configure | stockage_droit | stockage_erreur */
export class ErreurDocument extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurDocument';
    this.code = code;
  }
}

export const MESSAGE_STOCKAGE_ABSENT = 'Le stockage des fichiers est introuvable : rien n\'a été enregistré.';
export const MESSAGE_DROIT_STOCKAGE = 'Le compte du serveur n\'a pas le droit d\'écrire dans le stockage des fichiers : rien n\'a été enregistré. Il faut donner ce droit au compte (étape à faire par Jérôme).';

/** Plafond de stockage des documents d'un espace (fichiers non supprimés) : un éditeur ne peut pas remplir le bucket. */
export const QUOTA_ESPACE_OCTETS = 2 * 1024 * 1024 * 1024;
export const MESSAGE_QUOTA = 'L\'espace a atteint sa limite de stockage de documents : retirez des fichiers avant d\'en ajouter.';
export const CIBLES = Object.freeze({ affaire: C.affaires, projet: C.projets });
const LIBELLE_CIBLE = { affaire: 'Affaire', projet: 'Projet' };

/** Taille maximale demandée par l'espace (réglage « Taille maximale d'un fichier (Mo) », crm_parametres/reglages) : jamais confiance à la valeur, le contrôle la borne (fichiers-regles.js). */
export async function lireReglageTaille(donnees) {
  const reglages = await donnees.document(C.parametres, 'reglages');
  return reglages?.tailleMaxFichierMo;
}

const motifIdentifiant = (id) => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/') && id !== '.' && id !== '..';

/** Lit { cibleType, cibleId } dans une demande : exactement un de affaireId / projetId. */
export function lireCible(demande) {
  const d = demande && typeof demande === 'object' ? demande : {};
  const aff = d.affaireId !== undefined;
  const proj = d.projetId !== undefined;
  if (aff === proj) throw new ErreurDocument('demande_invalide', 'Donner affaireId ou projetId (un seul des deux).');
  const cibleType = aff ? 'affaire' : 'projet';
  const cibleId = aff ? d.affaireId : d.projetId;
  if (!motifIdentifiant(cibleId)) throw new ErreurDocument('demande_invalide', `Identifiant ${aff ? 'd\'affaire' : 'de projet'} manquant ou invalide.`);
  return { cibleType, cibleId };
}

const manqueDroit = (e) => {
  const c = e?.cause ?? e;
  return c?.code === 403 || c?.code === 'PERMISSION_DENIED' || /does not have storage|permission|forbidden|403|accès refusé/i.test(String(c?.message ?? ''));
};

/**
 * Dépose un fichier. `octets` : Buffer déjà décodé. Rend { id, nom, taille, typeMime, operationId }.
 * Ordre : contrôles (rien n'est écrit si l'un échoue) -> fichier dans le stockage -> fiche + journal. Si la fiche échoue, le fichier est retiré (au mieux).
 */
export async function deposerDocument({ donnees, stockage, espace = '', ctx, ecrire, cibleType, cibleId, nom, typeMime, octets, reglage, uuid = randomUUID() }) {
  if (!stockage) throw new ErreurDocument('non_configure', MESSAGE_STOCKAGE_ABSENT);
  if (reglage === undefined) reglage = await lireReglageTaille(donnees); // l'appelant qui l'a déjà lu le passe (une seule lecture par dépôt)
  const controle = controlerFichier({ nom, typeMime, taille: octets?.length ?? 0 }, reglage);
  if (!controle.ok) throw new ErreurDocument('refuse', controle.erreur);
  if (!signatureCoherente(controle.extension, octets)) {
    throw new ErreurDocument('refuse', `Le contenu du fichier ne correspond pas à son extension .${controle.extension} : il est refusé.`);
  }
  // Quota par espace : la somme des fichiers non supprimés (les fiches en corbeille ne comptent pas) ne dépasse jamais QUOTA_ESPACE_OCTETS.
  const toutes = await donnees.liste(C.documentsStockes);
  const utilise = toutes.filter((f) => !f.supprimeLe).reduce((n, f) => n + (Number.isFinite(f.taille) ? f.taille : 0), 0);
  if (utilise + octets.length > QUOTA_ESPACE_OCTETS) throw new ErreurDocument('refuse', MESSAGE_QUOTA);
  const cible = await donnees.document(CIBLES[cibleType], cibleId);
  if (!cible) throw new ErreurDocument('introuvable', `${LIBELLE_CIBLE[cibleType]} introuvable.`);
  const existants = (await donnees.liste(C.documentsStockes, { champ: 'cibleId', valeur: cibleId })).filter((f) => f.cibleType === cibleType && !f.supprimeLe);
  const nomFinal = nomSansDoublon(controle.nom, existants.map((f) => f.nom));
  const chemin = cheminDocument({ espace, cibleType, cibleId, uuid, nom: nomFinal });
  try {
    await stockage.deposer(chemin, octets, controle.typeMime);
  } catch (e) {
    throw manqueDroit(e) ? new ErreurDocument('stockage_droit', MESSAGE_DROIT_STOCKAGE) : new ErreurDocument('stockage_erreur', 'Le fichier n\'a pas pu être enregistré. Réessayez.');
  }
  const id = randomUUID(); // identifiant de la fiche (pas tiré par la base : seul le moteur d'écriture et metier.js le font)
  try {
    const r = await ecrire(
      [{ type: 'creer', collection: C.documentsStockes, id, donnees: { cibleType, cibleId, nom: nomFinal, typeMime: controle.typeMime, taille: octets.length, chemin, creeLe: ctx.maintenant, creePar: ctx.acteur, supprimeLe: null } }],
      { cibleType, cibleId, nom: nomFinal, taille: octets.length },
    );
    return { id, nom: nomFinal, taille: octets.length, typeMime: controle.typeMime, operationId: r?.operationId ?? null };
  } catch (e) {
    await stockage.supprimer?.(chemin).catch(() => {}); // la fiche n'existe pas : on ne laisse pas un fichier sans fiche
    throw e;
  }
}

/** Fiche d'un fichier déposé, ou ErreurDocument introuvable (aussi pour un fichier en corbeille). */
async function ficheVisible(donnees, documentId) {
  if (!motifIdentifiant(documentId)) throw new ErreurDocument('demande_invalide', 'Identifiant de fichier manquant ou invalide.');
  const fiche = await donnees.document(C.documentsStockes, documentId);
  if (!fiche || fiche.supprimeLe) throw new ErreurDocument('introuvable', 'Fichier introuvable.');
  return fiche;
}

/** Ouvre sans télécharger ce qui s'affiche dans un onglet (PDF, images, texte) ; le reste (Office, zip) est toujours proposé en téléchargement. */
const AFFICHABLES = new Set(['pdf', 'image', 'texte']);

/**
 * Lien de lecture signé de 5 minutes. Le chemin vient de la fiche lue ICI (jamais de la demande) et doit être celui de CET espace et de CETTE cible, sinon rien n'est signé.
 * Rend { url, expireDans, nom }.
 */
export async function lienDocument({ donnees, stockage, espace = '', documentId, telecharger = false }) {
  if (!stockage) throw new ErreurDocument('non_configure', MESSAGE_STOCKAGE_ABSENT);
  const fiche = await ficheVisible(donnees, documentId);
  if (!cheminDocumentAppartientALEspace(fiche.chemin, espace, { cibleType: fiche.cibleType, cibleId: fiche.cibleId })) {
    throw new ErreurDocument('refuse', 'Ce fichier n\'est pas accessible.');
  }
  const extension = /\.([A-Za-z0-9]{1,10})$/.exec(String(fiche.nom))?.[1]?.toLowerCase();
  const regle = TYPES[extension];
  if (!regle) throw new ErreurDocument('refuse', 'Ce fichier n\'est pas accessible.');
  const url = await stockage.lienSigne(fiche.chemin, { minutes: DUREE_LIEN_MINUTES, nomAffiche: fiche.nom, telecharger: telecharger || !AFFICHABLES.has(regle.famille), typeMime: regle.type });
  return { url, expireDans: DUREE_LIEN_MINUTES * 60, nom: fiche.nom };
}

/**
 * Supprime un fichier : corbeille LOGIQUE (la fiche reçoit `supprimeLe` et `supprimePar`, le fichier reste en place), avec une ligne de journal.
 * restaurer_depuis_audit remet la fiche telle qu'elle était : le fichier, jamais déplacé, redevient visible. Rend { id, nom, operationId }.
 */
export async function supprimerDocument({ donnees, ctx, ecrire, documentId }) {
  const fiche = await ficheVisible(donnees, documentId);
  const r = await ecrire([{ type: 'modifier', collection: C.documentsStockes, id: fiche.id, patch: { supprimeLe: ctx.maintenant, supprimePar: ctx.acteur } }], { id: fiche.id });
  return { id: fiche.id, nom: fiche.nom, operationId: r?.operationId ?? null };
}

/** Les fichiers (non supprimés) d'une affaire ou d'un projet, du plus récent au plus ancien. */
export async function listerFichiers(donnees, { cibleType, cibleId }) {
  const fiches = (await donnees.liste(C.documentsStockes, { champ: 'cibleId', valeur: cibleId })).filter((f) => f.cibleType === cibleType && !f.supprimeLe);
  const ms = (d) => (typeof d?.toMillis === 'function' ? d.toMillis() : d instanceof Date ? d.getTime() : typeof d?.seconds === 'number' ? d.seconds * 1000 : 0);
  return fiches.sort((a, b) => ms(b.creeLe) - ms(a.creeLe));
}

/** Moteur d'écriture lié à un acteur et à un canal, pour les fonctions appelables de l'écran (le MCP a le sien : ctx.ecrire). */
export function ecritureEcran({ donnees, ctx, outil }) {
  return (operations, parametres) => executerEcritures({ donnees, ctx: { acteur: ctx.acteur, jeton: ctx.jeton ?? ctx.acteur, via: ctx.via ?? 'ecran', maintenant: ctx.maintenant }, outil, parametres, operations });
}

/** Décode le contenu en base64 reçu d'un appel : refuse tout ce qui n'est pas du base64 propre ou qui dépasse la taille permise AVANT de décoder. */
export function decoderBase64(contenu, reglage) {
  if (typeof contenu !== 'string' || !contenu) throw new ErreurDocument('demande_invalide', 'Le contenu du fichier est manquant.');
  const maxOctets = enOctets(limiteEffectiveMo(reglage));
  if (contenu.length > Math.ceil(maxOctets / 3) * 4 + 4) throw new ErreurDocument('refuse', messageTropGros(Math.floor(contenu.length * 3 / 4), reglage));
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contenu) || contenu.length % 4 === 1) throw new ErreurDocument('demande_invalide', 'Le contenu du fichier n\'est pas valide.');
  return Buffer.from(contenu, 'base64');
}

/** MCP : seulement du TEXTE (un assistant ne peut pas émettre les octets d'un PDF). Rend le Buffer UTF-8 ; refuse tout type qui n'est pas du texte. */
export function octetsDeTexte(nom, contenuTexte) {
  if (typeof contenuTexte !== 'string' || !contenuTexte) throw new ErreurDocument('demande_invalide', 'contenuTexte est manquant.');
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(String(nom ?? ''))?.[1]?.toLowerCase();
  if (!['txt', 'md', 'csv'].includes(ext)) {
    throw new ErreurDocument('refuse', `Par cet outil, seuls les fichiers texte (.txt, .md, .csv) peuvent être déposés. Pour un PDF, une image ou un autre fichier (${TYPES_ACCEPTES_TEXTE}) : onglet « Documents » de l'affaire ou du projet, à l'écran.`);
  }
  const octets = Buffer.from(contenuTexte, 'utf8');
  if (octets.length > TEXTE_MCP_MAX_OCTETS) throw new ErreurDocument('refuse', `Texte trop long (${octets.length} octets, maximum ${TEXTE_MCP_MAX_OCTETS / 1024} Ko) : pour un gros fichier, onglet « Documents » de l'écran.`);
  return octets;
}

// ---------------------------------------------------------------- opérations des fonctions appelables (Jérôme et clients : le même code)
// Les fonctions appelables contrôlent l'appelant (compte autorisé / membre éditeur ou lecteur), puis appellent ces trois opérations. Rien ici ne lit l'identité de l'appelant.

/** Erreur du service -> { code, message, detail } d'une erreur d'appel (HttpsError / Refus), ou null si ce n'est pas une erreur attendue. Le message est écrit pour être lu par l'utilisateur. */
export function versErreurAppel(e) {
  if (e instanceof ErreurDocument) {
    const code = { demande_invalide: 'invalid-argument', refuse: 'invalid-argument', introuvable: 'not-found', stockage_erreur: 'internal' }[e.code] ?? 'failed-precondition';
    return { code, message: e.message, detail: e.code };
  }
  return null;
}

const texteCourt = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Dépôt : { affaireId | projetId, nom, contenuBase64, typeMime? }. Rend { id, nom, taille, typeMime }. */
export async function operationDeposer({ donnees, stockage, espace = '', ctx, demande }) {
  const d = demande && typeof demande === 'object' ? demande : {};
  const { cibleType, cibleId } = lireCible(d);
  if (typeof d.nom === 'string' && d.nom.length > 400) throw new ErreurDocument('demande_invalide', 'Le nom du fichier est trop long.');
  if (!texteCourt(d.nom, 400)) throw new ErreurDocument('demande_invalide', 'Le nom du fichier est manquant.');
  if (d.typeMime !== undefined && !(typeof d.typeMime === 'string' && d.typeMime.length <= 200)) throw new ErreurDocument('demande_invalide', 'Le type du fichier n\'est pas valide.');
  if (!stockage) throw new ErreurDocument('non_configure', MESSAGE_STOCKAGE_ABSENT);
  const reglage = await lireReglageTaille(donnees);
  const octets = decoderBase64(d.contenuBase64, reglage);
  const r = await deposerDocument({ donnees, stockage, espace, ctx, reglage, ecrire: ecritureEcran({ donnees, ctx, outil: 'documentDeposer' }), cibleType, cibleId, nom: d.nom, typeMime: d.typeMime, octets });
  return { id: r.id, nom: r.nom, taille: r.taille, typeMime: r.typeMime };
}

/** Lien : { documentId, telecharger? }. Rend { url, expireDans, nom }. */
export async function operationLien({ donnees, stockage, espace = '', demande }) {
  const d = demande && typeof demande === 'object' ? demande : {};
  if (d.telecharger !== undefined && typeof d.telecharger !== 'boolean') throw new ErreurDocument('demande_invalide', 'Demande invalide.');
  return lienDocument({ donnees, stockage, espace, documentId: d.documentId, telecharger: d.telecharger === true });
}

/** Suppression : { documentId }. Rend { id, nom }. */
export async function operationSupprimer({ donnees, ctx, demande }) {
  const d = demande && typeof demande === 'object' ? demande : {};
  const r = await supprimerDocument({ donnees, ctx, ecrire: ecritureEcran({ donnees, ctx, outil: 'documentSupprimer' }), documentId: d.documentId });
  return { id: r.id, nom: r.nom };
}
