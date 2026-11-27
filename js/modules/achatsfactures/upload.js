// Ajout d'une facture reçue par courrier (« + Facture », PR 8b), portée de l'appli BTP (lib/upload-facture.ts). Le navigateur n'écrit jamais en base : le fichier part à n8n par `actions.ajouterFacture`
// (ticket neuf à usage unique), n8n revérifie tout (type, taille, « %PDF- », ticket) et crée la fiche « À valider ».
// Le fichier part en multipart (FormData, champ `fichier`) comme dans l'appli d'origine ; la couche des actions de l'OS le transmet tel quel, sans Content-Type (le navigateur pose la frontière), avec le ticket en Bearer.
// Le délai de 120 s ne COUPE PAS l'envoi (la couche des actions n'a pas de signal d'annulation) : il dit seulement « peut-être en cours de lecture » ; l'envoi continue et le doublon par empreinte protège d'un second envoi. Aucun appel réseau n'est écrit ici.
// Facture déjà ajoutée (27/11/2026) : refus « doublon » (409, même fichier) OU réponse « ajoutée » qui désigne une fiche ANCIENNE (la base range un PDF déjà connu,
// mais pas forcément identique au premier, dans la facture qui a le même fournisseur et le même numéro) : l'écran dit « déjà ajoutée le … » avec un lien vers la fiche.
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

/** Écart d'horloge toléré entre l'ordinateur et la base : une fiche créée plus de 15 minutes avant l'envoi n'est pas celle de cet envoi. */
export const MARGE_FICHE_ANCIENNE_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateValide = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** « Cette facture a déjà été ajoutée le 26/11/2026 à 14:32. » (sans la date si elle est inconnue), puis « rien n'a été créé en double ». */
export function messageDoublon(creeLe) {
  return `Cette facture a déjà été ajoutée${dateValide(creeLe) ? ` le ${dateHeureFr(creeLe)}` : ''}. Rien n’a été créé en double.`;
}

/** Erreur « doublon » prête à afficher : message clair, identifiant de la fiche existante (si sa forme est bonne) et sa date d'ajout. */
export function erreurDoublon(factureId, creeLe) {
  const id = typeof factureId === 'string' && UUID.test(factureId) ? factureId : null;
  const quand = dateValide(creeLe) ? creeLe : null;
  return new ErreurUpload(messageDoublon(quand), 'doublon', { factureId: id, creeLe: quand });
}

/**
 * La fiche rendue par une réponse « ajoutée » existait-elle déjà ? Oui si elle est déjà décidée (acceptée ou refusée), archivée, ou créée bien avant l'envoi.
 * Jamais pour une fiche RELUE exprès (`ficheRelue` : renvoi d'un PDF dont la première lecture n'avait rien donné, voulu par le workflow) ; fiche inconnue = non.
 */
export function ficheDejaConnue(fiche, debutMs, { ficheRelue = false } = {}) {
  if (ficheRelue || !fiche || typeof fiche !== 'object') return false;
  if (typeof fiche.statut === 'string' && fiche.statut !== 'a_valider') return true;
  if (fiche.archivee_le) return true;
  return dateValide(fiche.created_at) && Number.isFinite(debutMs) && Date.parse(fiche.created_at) < debutMs - MARGE_FICHE_ANCIENNE_MS;
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
 * Rend { factureId, lectureReussie, lignesEcrites }. `delaiMs` : au-delà, message « peut-être en cours de lecture » (on ne sait pas si le serveur a fini : le doublon par empreinte protège d'un second envoi).
 * `lireFiche(id)` (facultatif) relit la fiche rendue ({ statut, created_at, archivee_le }) : une fiche qui existait déjà lève l'erreur « doublon » (message et lien), comme le refus 409.
 * Une relecture en échec ne change rien (la réponse du serveur reste vraie). `maintenant` : horloge (essais).
 */
export async function envoyerFacture(f, { actions, delaiMs = DELAI_MS, signal, lireFiche = null, maintenant = () => Date.now() } = {}) {
  if (!actions || typeof actions.ajouterFacture !== 'function') throw new ErreurUpload('L’ajout de facture n’est pas encore branché : préviens le support.', 'non_configure');
  if (signal?.aborted) throw new ErreurUpload('Envoi annulé.', 'annule');
  const corps = corpsAjout(f);
  if (signal?.aborted) throw new ErreurUpload('Envoi annulé.', 'annule');
  const debut = maintenant();
  const relire = async (id) => { if (typeof lireFiche !== 'function' || !id) return null; try { return await lireFiche(id); } catch { return null; } };
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
      throw erreurDoublon(id, creeLe);
    }
    if (code === 'non_autorise' || code === 'refus_serveur' || code === 'reconnexion' || code === 'ticket') throw new ErreurUpload(MESSAGES.non_autorise, 'session');
    if (code === 'reponse_inattendue') throw new ErreurUpload('Réponse inattendue du serveur : la facture n’est peut-être pas ajoutée. Vérifie la liste, sinon réessaie.', 'reponse_inattendue');
    throw new ErreurUpload((code && MESSAGES[code]) || (e instanceof Error && e.message) || MESSAGE_PAR_DEFAUT, code ?? 'erreur');
  } finally {
    clearTimeout(minuteur);
  }
  if (!rep || typeof rep.facture_id !== 'string') throw new ErreurUpload('Réponse inattendue du serveur : la facture n’est peut-être pas ajoutée. Vérifie la liste, sinon réessaie.', 'reponse_inattendue');
  // Réponse « ajoutée » qui désigne une fiche déjà connue : le workflow le dit (deja_connue), ou la relecture le montre (fiche décidée, archivée ou ancienne).
  if (rep.deja_connue === true) throw erreurDoublon(rep.facture_id, rep.cree_le ?? (await relire(rep.facture_id))?.created_at ?? null);
  const fiche = await relire(rep.facture_id);
  if (ficheDejaConnue(fiche, debut, { ficheRelue: rep.fiche_relue === true })) throw erreurDoublon(rep.facture_id, fiche.created_at ?? null);
  return { factureId: rep.facture_id, lectureReussie: rep.lecture !== 'a_completer', lignesEcrites: rep.lignes_ecrites !== false };
}
