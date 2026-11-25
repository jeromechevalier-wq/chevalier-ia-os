// Ajout d'une facture reçue par courrier (« + Facture », PR 8b), portée de l'appli BTP (lib/upload-facture.ts). Le navigateur n'écrit jamais en base : le fichier part à n8n par `actions.ajouterFacture`
// (ticket neuf à usage unique), n8n revérifie tout (type, taille, « %PDF- », ticket) et crée la fiche « À valider ».
// ÉCART avec l'appli d'origine : elle envoyait le fichier en multipart (FormData) avec le jeton de la personne. La couche des actions de l'OS envoie du JSON : le fichier part donc en base64 dans un corps JSON
// (`{ nom_fichier, type, fichier_base64 }`). Le workflow n8n d'ajout doit accepter ce corps (écrit dans la PR et dans .github/A-FAIRE.md). Aucun appel réseau n'est écrit ici.

/** Taille maximale d'un PDF : 10 Mo (même valeur côté serveur). */
export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
/** Un vrai PDF fait au moins quelques centaines d'octets ; en dessous, c'est un fichier vide ou tronqué. */
export const TAILLE_MIN_OCTETS = 100;
/** Délai d'attente de la réponse : la lecture par l'IA peut durer plusieurs dizaines de secondes. */
export const DELAI_MS = 120_000;
export const MESSAGE_INCERTAIN = 'La facture est peut-être en cours de lecture : regarde dans « À valider » avant de réessayer.';

export class ErreurUpload extends Error {
  constructor(message, code) { super(message); this.name = 'ErreurUpload'; this.code = code; }
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

/** Fichier → base64 (par morceaux : pas de dépassement de pile sur un gros fichier). */
export async function enBase64(f) {
  const octets = new Uint8Array(await f.arrayBuffer());
  let texte = '';
  for (let i = 0; i < octets.length; i += 0x8000) texte += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(texte);
}

/** Corps JSON envoyé au webhook d'ajout : le nom, le type et le contenu. Aucune identité (elle vient du ticket). */
export async function corpsAjout(f) {
  return { nom_fichier: f.name, type: 'application/pdf', fichier_base64: await enBase64(f) };
}

/**
 * Envoie le PDF par `actions.ajouterFacture(corps)`. Lève ErreurUpload (message français) si le serveur refuse.
 * Rend { factureId, lectureReussie, lignesEcrites }. `delaiMs` : au-delà, message « peut-être en cours de lecture » (on ne sait pas si le serveur a fini : le doublon par empreinte protège d'un second envoi).
 */
export async function envoyerFacture(f, { actions, delaiMs = DELAI_MS, signal } = {}) {
  if (!actions || typeof actions.ajouterFacture !== 'function') throw new ErreurUpload('L’ajout de facture n’est pas encore branché : préviens le support.', 'non_configure');
  if (signal?.aborted) throw new ErreurUpload('Envoi annulé.', 'annule');
  const corps = await corpsAjout(f);
  if (signal?.aborted) throw new ErreurUpload('Envoi annulé.', 'annule');
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
    if (code === 'doublon') throw new ErreurUpload('Cette facture a déjà été ajoutée.', 'doublon');
    if (code === 'non_autorise' || code === 'refus_serveur' || code === 'reconnexion' || code === 'ticket') throw new ErreurUpload(MESSAGES.non_autorise, 'session');
    if (code === 'reponse_inattendue') throw new ErreurUpload('Réponse inattendue du serveur : la facture n’est peut-être pas ajoutée. Vérifie la liste, sinon réessaie.', 'reponse_inattendue');
    throw new ErreurUpload((code && MESSAGES[code]) || (e instanceof Error && e.message) || MESSAGE_PAR_DEFAUT, code ?? 'erreur');
  } finally {
    clearTimeout(minuteur);
  }
  if (!rep || typeof rep.facture_id !== 'string') throw new ErreurUpload('Réponse inattendue du serveur : la facture n’est peut-être pas ajoutée. Vérifie la liste, sinon réessaie.', 'reponse_inattendue');
  return { factureId: rep.facture_id, lectureReussie: rep.lecture !== 'a_completer', lignesEcrites: rep.lignes_ecrites !== false };
}
