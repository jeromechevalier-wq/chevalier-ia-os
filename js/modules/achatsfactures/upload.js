// Ajout d'une facture reçue par courrier (« + Facture », PR 8b), portée de l'appli BTP (lib/upload-facture.ts). Le navigateur n'écrit jamais en base : le fichier part à n8n par `actions.ajouterFacture`
// (ticket neuf à usage unique), n8n revérifie tout (type, taille, « %PDF- », ticket) et crée la fiche « À valider ».
// Le fichier part en multipart (FormData, champ `fichier`) comme dans l'appli d'origine ; la couche des actions de l'OS le transmet tel quel, sans Content-Type (le navigateur pose la frontière), avec le ticket en Bearer.
// Le délai de 120 s ne COUPE PAS l'envoi (la couche des actions n'a pas de signal d'annulation) : il dit seulement « peut-être en cours de lecture » ; l'envoi continue et le doublon par empreinte protège d'un second envoi. Aucun appel réseau n'est écrit ici.
// Facture déjà ajoutée (27/11/2026, corrigé après relecture) : refus « doublon » (409, même fichier : empreinte identique) OU réponse « ajoutée » qui désigne une fiche
// déjà DÉCIDÉE ou ARCHIVÉE (la base range un PDF de même fournisseur et même numéro dans la facture existante) : l'écran le dit avec un lien vers la fiche.
// Une fiche « à valider » déjà existante (rescan voulu, signalé par le workflow) est un SUCCÈS : sa lecture a été mise à jour. Aucune comparaison avec l'horloge de l'ordinateur.
import { dateHeureFr } from './logique.js';

/** Taille maximale d'un PDF : 10 Mo (même valeur côté serveur). */
export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
/** Un vrai PDF fait au moins quelques centaines d'octets ; en dessous, c'est un fichier vide ou tronqué. */
export const TAILLE_MIN_OCTETS = 100;
/** Délai d'attente de la réponse : la lecture par l'IA peut durer plusieurs dizaines de secondes. */
export const DELAI_MS = 120_000;
export const MESSAGE_INCERTAIN = 'La facture est peut-être en cours de lecture : regarde dans « À valider » avant de réessayer.';

export class ErreurUpload extends Error {
  constructor(message, code, { factureId = null, creeLe = null } = {}) { super(message); this.name = 'ErreurUpload'; this.code = code; this.factureId = factureId; this.creeLe = creeLe; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateValide = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Succès d'un nouveau scan d'une facture « à valider » déjà connue : la base y a rangé le document et la lecture a été refaite. */
export const MESSAGE_DEJA_CONNUE = 'Facture déjà connue : sa lecture a été mise à jour avec ce nouveau document.';
/** Relecture de la fiche rendue : au-delà de 5 secondes, on fait comme si elle avait échoué (la fenêtre ne reste jamais bloquée). */
export const DELAI_RELECTURE_MS = 5000;

/**
 * Message d'une facture déjà ajoutée. `parNumero` faux (refus 409 par empreinte, fichier identique) : « Cette facture a déjà été ajoutée le … Rien n'a été créé en double. ».
 * `parNumero` vrai (même fournisseur et même numéro, fichier pas forcément identique) : « Une facture de ce fournisseur avec ce numéro existe déjà (ajoutée le …). Ouvre-la pour vérifier. »
 */
export function messageDoublon(creeLe, { parNumero = false } = {}) {
  const quand = dateValide(creeLe) ? dateHeureFr(creeLe) : null;
  if (parNumero) return `Une facture de ce fournisseur avec ce numéro existe déjà${quand ? ` (ajoutée le ${quand})` : ''}. Ouvre-la pour vérifier.`;
  return `Cette facture a déjà été ajoutée${quand ? ` le ${quand}` : ''}. Rien n’a été créé en double.`;
}

/** Erreur « doublon » prête à afficher : message clair, identifiant de la fiche existante (si sa forme est bonne) et sa date d'ajout. `parNumero` : voir messageDoublon. */
export function erreurDoublon(factureId, creeLe, { parNumero = false } = {}) {
  const id = typeof factureId === 'string' && UUID.test(factureId) ? factureId : null;
  const quand = dateValide(creeLe) ? creeLe : null;
  return new ErreurUpload(messageDoublon(quand, { parNumero }), 'doublon', { factureId: id, creeLe: quand });
}

/** La fiche rendue est-elle déjà décidée (acceptée, refusée…) ou archivée ? Alors un nouveau document ne peut plus la changer : c'est un doublon. Fiche inconnue = non. */
export function ficheDecidee(fiche) {
  if (!fiche || typeof fiche !== 'object') return false;
  return (typeof fiche.statut === 'string' && fiche.statut !== 'a_valider') || !!fiche.archivee_le;
}

/**
 * Que dire d'une réponse « ajoutée » (`rep` : corps du workflow ; `fiche` : fiche relue ou null) ? Aucune horloge.
 *  - 'doublon' : fiche décidée ou archivée, OU le workflow dit `deja_connue` sans que la fiche ait pu être relue (prudence : on invite à l'ouvrir) ;
 *  - 'deja_connue' : fiche « à valider » existante que le workflow signale (`deja_connue` ou `fiche_relue`) : succès, lecture mise à jour ;
 *  - 'ajoutee' : tout le reste (fiche neuve, ou impossible à distinguer d'une neuve).
 */
export function issueAjout(rep, fiche) {
  if (ficheDecidee(fiche)) return 'doublon';
  const signalee = rep?.deja_connue === true || rep?.fiche_relue === true;
  if (rep?.deja_connue === true && !fiche) return 'doublon';
  return signalee ? 'deja_connue' : 'ajoutee';
}

/** « 2,4 Mo » (virgule française, sans passer par le formatage du navigateur). */
export const tailleLisibleMo = (octets) => `${(Math.round(octets / 1024 / 1024 * 10) / 10).toString().replace('.', ',')} Mo`;

/** Contrôle ce qu'on sait sans lire le fichier : type, nom et taille. Renvoie un message (tutoiement) ou null si tout va bien. */
export function verifierMetadonnees(f) {
  const estImage = /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|gif|webp|tiff?)$/i.test(f.name);
  if (estImage) return 'Pour l’instant, seuls les PDF sont acceptés. Scanne ta facture en PDF, ou prends-la en photo avec une appli de scan qui enregistre en PDF.';
  const nomPdf = /\.pdf$/i.test(f.name);
  if ((f.type && f.type !== 'application/pdf') || (!f.type && !nomPdf) || (f.type === '' && !nomPdf)) return 'Ce fichier n’est pas un PDF. Choisis un fichier qui se termine par « .pdf ».';
  if (f.size === 0) return 'Ce fichier est vide. Choisis un autre PDF.';
  if (f.size < TAILLE_MIN_OCTETS) return 'Ce fichier est trop petit pour être une facture. Choisis un autre PDF.';
  if (f.size > TAILLE_MAX_OCTETS) return `Ce PDF fait ${tailleLisibleMo(f.size)} : c’est trop gros (maximum ${tailleLisibleMo(TAILLE_MAX_OCTETS)}). Réduis-le ou scanne-le en moins haute qualité.`;
  return null;
}

const enTexte = (o) => String.fromCharCode(...o);

/** Contrôle le contenu : un vrai PDF commence par « %PDF- » et se termine par « %%EOF » (dans les derniers octets). */
export function verifierContenu(debut, fin) {
  if (!enTexte(debut.slice(0, 5)).startsWith('%PDF-')) return 'Ce fichier n’est pas un vrai PDF (il a peut-être été renommé). Choisis un autre fichier.';
  if (!enTexte(fin).includes('%%EOF')) return 'Ce PDF semble abîmé ou incomplet. Télécharge-le ou scanne-le à nouveau.';
  return null;
}

/** Contrôle complet d'un fichier choisi : message à afficher, ou null si on peut l'envoyer. */
export async function verifierFichierPdf(f) {
  const m = verifierMetadonnees(f);
  if (m) return m;
  try {
    const debut = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const fin = new Uint8Array(await f.slice(Math.max(0, f.size - 2048)).arrayBuffer());
    return verifierContenu(debut, fin);
  } catch {
    return 'Impossible de lire ce fichier. Choisis-le à nouveau.';
  }
}

/** Messages (tutoiement) par code d'erreur du serveur. */
export const MESSAGES = {
  pas_un_pdf: 'Ce fichier n’est pas un vrai PDF. Choisis un autre fichier.',
  trop_gros: 'Ce PDF est trop gros (maximum 10 Mo). Réduis-le ou scanne-le en moins haute qualité.',
  pdf_vide: 'Ce PDF est vide ou abîmé. Choisis un autre fichier.',
  fichier_absent: 'Aucun fichier reçu. Choisis un PDF puis réessaie.',
  non_autorise: 'Ta session a expiré. Reconnecte-toi puis réessaie.',
  stockage_impossible: 'Le fichier n’a pas pu être rangé. Rien n’a été créé : réessaie dans un instant.',
  enregistrement_impossible: 'Le fichier est rangé mais la fiche n’a pas pu être créée. Réessaie : il ne sera pas dupliqué.',
  verification_impossible: 'Impossible de vérifier si cette facture existe déjà. Réessaie dans un instant.',
};
const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue, réessaie dans un instant.';

/** Numéro de sélection : chaque nouveau fichier choisi prend un numéro, et la vérification d'un fichier plus ancien (qui finit après coup) est ignorée. */
export function suivreSelection() {
  let courant = 0;
  return { nouveau: () => ++courant, estCourant: (n) => n === courant };
}

/** Corps multipart envoyé au webhook d'ajout : le fichier dans le champ `fichier` (comme l'appli d'origine). Aucune identité : elle vient du ticket. */
export function corpsAjout(f) {
  const corps = new FormData();
  corps.append('fichier', f, f.name);
  return corps;
}

/**
 * Envoie le PDF par `actions.ajouterFacture(corps)`. Lève ErreurUpload (message français) si le serveur refuse.
 * Rend { factureId, lectureReussie, lignesEcrites, dejaConnue }. `delaiMs` : au-delà, message « peut-être en cours de lecture » (on ne sait pas si le serveur a fini : le doublon par empreinte protège d'un second envoi).
 * `lireFiche(id)` (facultatif) relit la fiche rendue ({ statut, created_at, archivee_le }) : une fiche décidée ou archivée lève l'erreur « doublon » (message et lien) ;
 * une fiche « à valider » signalée par le workflow rend `dejaConnue: true` (succès). Une relecture en échec ou plus longue que `delaiRelectureMs` (5 s) vaut null.
 */
export async function envoyerFacture(f, { actions, delaiMs = DELAI_MS, signal, lireFiche = null, delaiRelectureMs = DELAI_RELECTURE_MS } = {}) {
  if (!actions || typeof actions.ajouterFacture !== 'function') throw new ErreurUpload('L’ajout de facture n’est pas encore branché : préviens le support.', 'non_configure');
  if (signal?.aborted) throw new ErreurUpload('Envoi annulé.', 'annule');
  const corps = corpsAjout(f);
  if (signal?.aborted) throw new ErreurUpload('Envoi annulé.', 'annule');
  const relire = async (id) => {
    if (typeof lireFiche !== 'function' || !id) return null;
    let borne;
    const course = new Promise((resoudre) => { borne = setTimeout(() => resoudre(null), delaiRelectureMs); });
    try { return (await Promise.race([Promise.resolve().then(() => lireFiche(id)), course])) ?? null; } catch { return null; } finally { clearTimeout(borne); }
  };
  let minuteur;
  const coupure = new Promise((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new ErreurUpload(MESSAGE_INCERTAIN, 'delai')), delaiMs);
    signal?.addEventListener('abort', () => rejeter(new ErreurUpload(MESSAGE_INCERTAIN, 'delai')), { once: true });
  });
  let rep;
  try {
    rep = await Promise.race([actions.ajouterFacture(corps), coupure]);
  } catch (e) {
    if (e instanceof ErreurUpload) throw e;
    const code = e?.code ?? null;
    if (code === 'reseau') throw new ErreurUpload(MESSAGE_INCERTAIN, 'reseau');
    if (code === 'doublon') {
      clearTimeout(minuteur);
      const id = e?.factureId ?? null;
      const creeLe = e?.creeLe ?? (await relire(id))?.created_at ?? null;
      // `deja_connue` dans le 409 : reconnu par fournisseur et numéro (workflow complété), pas par empreinte : message « existe déjà, ouvre-la ».
      throw erreurDoublon(id, creeLe, { parNumero: e?.dejaConnue === true });
    }
    if (code === 'non_autorise' || code === 'refus_serveur' || code === 'reconnexion' || code === 'ticket') throw new ErreurUpload(MESSAGES.non_autorise, 'session');
    if (code === 'reponse_inattendue') throw new ErreurUpload('Réponse inattendue du serveur : la facture n’est peut-être pas ajoutée. Vérifie la liste, sinon réessaie.', 'reponse_inattendue');
    throw new ErreurUpload((code && MESSAGES[code]) || (e instanceof Error && e.message) || MESSAGE_PAR_DEFAUT, code ?? 'erreur');
  } finally {
    clearTimeout(minuteur);
  }
  if (!rep || typeof rep.facture_id !== 'string') throw new ErreurUpload('Réponse inattendue du serveur : la facture n’est peut-être pas ajoutée. Vérifie la liste, sinon réessaie.', 'reponse_inattendue');
  const fiche = await relire(rep.facture_id);
  const issue = issueAjout(rep, fiche);
  if (issue === 'doublon') throw erreurDoublon(rep.facture_id, (dateValide(rep.cree_le) ? rep.cree_le : null) ?? fiche?.created_at ?? null, { parNumero: true });
  return { factureId: rep.facture_id, lectureReussie: rep.lecture !== 'a_completer', lignesEcrites: rep.lignes_ecrites !== false, dejaConnue: issue === 'deja_connue' };
}
