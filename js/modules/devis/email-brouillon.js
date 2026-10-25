// Envoi d'un devis par e-mail : l'appli crée un BROUILLON dans le Gmail de l'utilisateur (API Gmail users.drafts.create, portée gmail.compose), PDF en pièce jointe.
// L'utilisateur le relit et l'envoie LUI-MÊME dans Gmail : l'appli n'envoie jamais seule.
// Ce fichier ne touche ni au DOM ni à Firebase ni à Google directement : le jeton, la lecture du PDF et `fetch` sont donnés par l'appelant, donc tout se teste seul (node --test).
//
// Sécurité des en-têtes : une adresse ou un objet qui contient un retour à la ligne pourrait ajouter un en-tête (Bcc: …) au message. Tout ce qui entre dans un en-tête est donc
// contrôlé ici (jamais de caractère de contrôle), les accents sont encodés (RFC 2047) et le texte du message est encodé en base64 (il ne peut pas sortir de son bloc).
import { emailValide } from './logique.js';

export const PORTEE_GMAIL = 'https://www.googleapis.com/auth/gmail.compose';
export const API_BROUILLONS = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
export const MAX_ADRESSES = 10;
export const MAX_OBJET = 200;
export const MAX_MESSAGE = 20_000;
/** Un PDF de devis pèse quelques centaines de Ko ; au-delà de 5 Mo, l'envoi JSON simple de Gmail risque d'être refusé. */
export const MAX_PDF_OCTETS = 5 * 1024 * 1024;

export const OBJET_PAR_DEFAUT = 'Devis {numero} – {objet}';
export const MESSAGE_PAR_DEFAUT = [
  'Bonjour {contact},',
  '',
  'Veuillez trouver ci-joint notre devis {numero} – {objet}.',
  '',
  'Il reste valable pour la durée indiquée sur le document. N’hésitez pas à me contacter pour toute question ou pour l’adapter.',
  '',
  'Bien cordialement',
].join('\n'); // pas de signature écrite : c'est celle de Gmail de l'utilisateur

export const MESSAGE_GOOGLE_ABSENT = 'Gmail n’est pas branché sur cet espace : l’envoi par e-mail n’est pas encore possible ici.';
export const MESSAGE_RESEAU = 'Impossible de joindre Gmail. Vérifie ta connexion internet, puis réessaie.';
export const MESSAGE_REFUS = 'Gmail n’est pas connecté ou l’autorisation a été refusée : le brouillon n’a pas été créé.';
export const MESSAGE_API_DESACTIVEE = 'L’API Gmail n’est pas activée dans le projet Google de cet espace : préviens l’administrateur de ton espace (elle s’active une fois, dans la console Google).';
export const MESSAGE_PORTEE = 'Google n’a pas donné le droit de créer un brouillon Gmail. Réessaie et laisse la case « Gmail » cochée dans la fenêtre Google.';
export const MESSAGE_LECTURE_PDF = 'Le PDF n’a pas pu être lu depuis le navigateur. Réessaie ; si ça continue, il faut autoriser ce site dans le stockage (réglage à faire une fois, voir docs/cors-stockage-pdf.md).';
export const MESSAGE_PDF_TROP_GROS = 'Le PDF est trop gros pour un brouillon Gmail (5 Mo au plus).';
export const MESSAGE_BROUILLON_CREE = 'Brouillon créé dans Gmail';
export const MESSAGE_FINALISER_D_ABORD = 'Ce devis est encore un brouillon. Il faut le finaliser (numéro, prix figés, PDF) avant de l’envoyer par e-mail.';
export const MESSAGE_PDF_EN_COURS = 'Le PDF est en cours de fabrication. Réessaie dans quelques instants.';
export const MESSAGE_PDF_PAS_PRET = 'Le PDF de ce devis n’est pas prêt. Appuie sur « Réessayer » pour le fabriquer.';
export const MESSAGE_PDF_ECHEC = 'La fabrication du PDF a échoué. Appuie sur « Réessayer » pour la relancer.';
export const MESSAGE_STATUT_INTERDIT = 'Ce devis n’est plus à envoyer (il est signé, refusé ou remplacé).';

/** code : adresse_invalide | entete_invalide | pdf_trop_gros | gmail */
export class ErreurMime extends Error {
  constructor(code, message) { super(message); this.name = 'ErreurMime'; this.code = code; }
}

const CONTROLE = /[\u0000-\u001f\u007f]/;

// ---------------------------------------------------------------- qui peut recevoir un e-mail
/** « Envoyer par e-mail » : actif pour un devis finalisé ou envoyé (renvoi), et pour un brouillon (l'écran propose alors de le finaliser d'abord). */
export function emailPossible(statut) {
  if (statut === 'brouillon' || statut === 'en_attente_envoi' || statut === 'envoye') return { actif: true };
  return { actif: false, raison: MESSAGE_STATUT_INTERDIT };
}

// ---------------------------------------------------------------- message par défaut
const uneLigne = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Remplace {contact}, {numero} et {objet}. Sans objet, « – {objet} » disparaît ; sans contact, « Bonjour {contact}, » devient « Bonjour, ». */
export function remplirModele(modele, { contact = '', numero = '', objet = '' } = {}) {
  let t = String(modele ?? '');
  if (!uneLigne(objet)) t = t.replace(/\s*[–-]\s*\{objet\}/g, '');
  t = t.replace(/\{contact\}/g, uneLigne(contact)).replace(/\{numero\}/g, uneLigne(numero)).replace(/\{objet\}/g, uneLigne(objet));
  return t.replace(/ +,/g, ',').replace(/ {2,}/g, ' ');
}
export const objetParDefaut = (v) => remplirModele(OBJET_PAR_DEFAUT, v);
export const messageParDefaut = (v) => remplirModele(MESSAGE_PAR_DEFAUT, v);

// ---------------------------------------------------------------- adresses et saisie
/** Texte « a@x.fr, b@y.fr ; c@z.fr » -> liste (séparateurs : virgule, point-virgule, espace, retour à la ligne), sans doublon. */
export function lireAdresses(texte) {
  const vues = new Set();
  const liste = [];
  for (const a of (Array.isArray(texte) ? texte.map(String) : String(texte ?? '').split(/[\s,;]+/)).map((x) => x.trim()).filter(Boolean)) {
    if (vues.has(a.toLowerCase())) continue;
    vues.add(a.toLowerCase());
    liste.push(a);
  }
  return liste;
}
/** Adresse sûre pour un en-tête : valide, déjà nettoyée, sans caractère de contrôle ni espace. */
/** Pour un en-tête, seul l'ASCII imprimable est sûr (« josé@x.fr » demanderait SMTPUTF8) ; pas de caractère spécial (parenthèses, guillemet, chevrons, barre, virgule) avant le « @ ». */
export const adresseSure = (a) => typeof a === 'string' && a === a.trim() && a.length <= 254 && /^[\x21-\x7e]+$/.test(a) && !/[()"<>\\,]/.test(a.slice(0, a.lastIndexOf('@'))) && emailValide(a);
export const messageAdresseRefusee = (a) => `L’adresse « ${String(a).slice(0, 60).replace(CONTROLE, ' ')} » contient des caractères que Gmail n’accepte pas ici (lettres sans accent, chiffres et . _ - + seulement).`;
/** Adresses d'un devis (liste de textes ou d'objets { email }) -> liste de textes non vides. */
export const adressesDuDevis = (liste) => (Array.isArray(liste) ? liste : []).map((x) => (typeof x === 'string' ? x : x?.email ?? '')).map((x) => String(x).trim()).filter(Boolean);

/** Adresse bien formée mais hors ASCII ou à caractère spécial : message « Gmail n'accepte pas » ; sinon le message d'adresse invalide. */
const messageMauvaiseAdresse = (a, invalide) => (emailValide(a) ? messageAdresseRefusee(a) : invalide.replace('{a}', String(a).slice(0, 60)));

/**
 * Contrôle de la saisie du dialogue. `a` et `cc` : du texte ou une liste. Renvoie { erreurs: { a?, cc?, objet?, message? }, a, cc, objet, message } ;
 * `erreurs` vide = on peut créer le brouillon. Jamais d'envoi sans destinataire.
 */
export function validerSaisie({ a = '', cc = '', objet = '', message = '' } = {}) {
  const erreurs = {};
  const listeA = lireAdresses(a);
  let listeCc = lireAdresses(cc);
  const mauvaise = (liste) => liste.find((x) => !adresseSure(x));
  if (!listeA.length) erreurs.a = 'Écris l’adresse e-mail du destinataire.';
  else if (mauvaise(listeA)) erreurs.a = messageMauvaiseAdresse(mauvaise(listeA), 'Cette adresse e-mail n’est pas valide : {a} (exemple : contact@exemple.fr).');
  else if (listeA.length > MAX_ADRESSES) erreurs.a = `${MAX_ADRESSES} destinataires au plus.`;
  if (mauvaise(listeCc)) erreurs.cc = messageMauvaiseAdresse(mauvaise(listeCc), 'Cette adresse e-mail en copie n’est pas valide : {a}.');
  else if (listeCc.length > MAX_ADRESSES) erreurs.cc = `${MAX_ADRESSES} adresses en copie au plus.`;
  listeCc = listeCc.filter((x) => !listeA.some((y) => y.toLowerCase() === x.toLowerCase())); // déjà destinataire : pas en double
  const objetBrut = String(objet ?? '');
  if (CONTROLE.test(objetBrut)) erreurs.objet = 'L’objet tient sur une seule ligne : enlève les retours à la ligne.';
  else if (!objetBrut.trim()) erreurs.objet = 'Écris un objet pour l’e-mail.';
  else if (objetBrut.trim().length > MAX_OBJET) erreurs.objet = `L’objet est trop long (${MAX_OBJET} caractères au plus).`;
  const texte = String(message ?? '').replace(/\r\n?/g, '\n');
  if (texte.length > MAX_MESSAGE) erreurs.message = `Le message est trop long (${MAX_MESSAGE} caractères au plus).`;
  return { erreurs, a: listeA, cc: listeCc, objet: objetBrut.trim(), message: texte };
}

// ---------------------------------------------------------------- encodages
const enOctets = (texte) => new TextEncoder().encode(texte);
/** Octets -> base64 standard. */
export function base64(octets) {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}
/** base64 coupé en lignes de 76 caractères (norme MIME). */
const lignes76 = (b64) => b64.match(/.{1,76}/g)?.join('\r\n') ?? '';
/** Chaîne ASCII -> base64url (sans « = »), le format du champ `raw` de Gmail. */
export const base64url = (ascii) => btoa(ascii).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Valeur d'en-tête sûre : refuse tout caractère de contrôle (donc tout retour à la ligne) ; du texte ASCII reste tel quel, les accents sont encodés « =?UTF-8?B?…?= »
 * (RFC 2047) en morceaux de 45 octets au plus, jamais coupés au milieu d'un caractère.
 */
export function encoderEntete(valeur) {
  const t = String(valeur ?? '');
  if (CONTROLE.test(t)) throw new ErreurMime('entete_invalide', 'Un en-tête de message ne peut pas contenir de retour à la ligne.');
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const morceaux = [];
  let courant = '';
  let taille = 0;
  for (const c of t) {
    const n = enOctets(c).length;
    if (taille + n > 45) { morceaux.push(courant); courant = ''; taille = 0; }
    courant += c;
    taille += n;
  }
  if (courant) morceaux.push(courant);
  return morceaux.map((m) => `=?UTF-8?B?${base64(enOctets(m))}?=`).join('\r\n ');
}

/** Liste d'adresses pour « To: » / « Cc: » : une par ligne repliée si la ligne devient longue. */
function enteteAdresses(liste) {
  for (const a of liste) if (!adresseSure(a)) throw new ErreurMime('adresse_invalide', `Adresse e-mail refusée : ${String(a).slice(0, 60).replace(CONTROLE, ' ')}`);
  const lignes = [];
  let courante = '';
  for (const a of liste) {
    const suite = courante ? `${courante}, ${a}` : a;
    if (courante && suite.length > 72) { lignes.push(`${courante},`); courante = a; } else courante = suite;
  }
  if (courante) lignes.push(courante);
  return lignes.join('\r\n ');
}

/** Nom de fichier de la pièce jointe : sans guillemet, barre, ni caractère de contrôle ; se termine par .pdf. */
export function nomPieceJointe(nom) {
  let n = String(nom ?? '').replace(/[\\/"\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) n = 'Devis';
  if (!/\.pdf$/i.test(n)) n = `${n}.pdf`;
  return n.slice(0, 120);
}
const pourcent = (nom) => encodeURIComponent(nom).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const reserveAscii = (nom) => nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');

let compteurFrontiere = 0;
const frontiereAuHasard = () => {
  compteurFrontiere += 1;
  let h = '';
  try { h = [...globalThis.crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join(''); } catch { h = `${Date.now().toString(16)}${compteurFrontiere}`; }
  return `=_chevalier_${h}`;
};

/**
 * Message MIME complet (multipart/mixed : le texte, puis le PDF). `pdf` : Uint8Array. Renvoie du texte ASCII (tout est encodé).
 * Lève ErreurMime si une adresse ou un en-tête est dangereux, ou si le PDF est vide ou trop gros.
 */
export function construireMime({ a, cc = [], objet, texte, pdf, nomPdf, frontiere = frontiereAuHasard() }) {
  if (!Array.isArray(a) || !a.length) throw new ErreurMime('adresse_invalide', 'Il faut au moins un destinataire.');
  if (!(pdf instanceof Uint8Array) || !pdf.length) throw new ErreurMime('pdf_vide', 'Le PDF est vide.');
  if (pdf.length > MAX_PDF_OCTETS) throw new ErreurMime('pdf_trop_gros', MESSAGE_PDF_TROP_GROS);
  if (!/^[A-Za-z0-9=_.-]{8,70}$/.test(frontiere)) throw new ErreurMime('entete_invalide', 'Séparateur de message invalide.');
  const nom = nomPieceJointe(nomPdf);
  const entetes = [
    'MIME-Version: 1.0',
    `To: ${enteteAdresses(a)}`,
    ...(cc.length ? [`Cc: ${enteteAdresses(cc)}`] : []),
    `Subject: ${encoderEntete(objet)}`,
    `Content-Type: multipart/mixed; boundary="${frontiere}"`,
  ];
  const corps = String(texte ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
  return [
    ...entetes, '',
    `--${frontiere}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '',
    lignes76(base64(enOctets(corps))),
    `--${frontiere}`,
    `Content-Type: application/pdf; name="${encoderEntete(nom).replace(/\r\n /g, ' ')}"`,
    `Content-Disposition: attachment; filename="${reserveAscii(nom)}"; filename*=UTF-8''${pourcent(nom)}`,
    'Content-Transfer-Encoding: base64', '',
    lignes76(base64(pdf)),
    `--${frontiere}--`, '',
  ].join('\r\n');
}

/** Corps de la demande users.drafts.create : { message: { raw } } (le message MIME en base64url). */
export const corpsBrouillon = (params) => ({ message: { raw: base64url(construireMime(params)) } });

// ---------------------------------------------------------------- Gmail
/** Message simple pour une erreur de l'API Gmail. */
export function messageErreurGmail(statut, corps) {
  const raison = `${corps?.error?.errors?.[0]?.reason ?? ''} ${corps?.error?.status ?? ''} ${corps?.error?.message ?? ''}`;
  if (statut === 401) return 'Google a refusé l’autorisation (elle a peut-être expiré). Réessaie : la fenêtre d’autorisation se rouvrira.';
  if (statut === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(raison)) return MESSAGE_API_DESACTIVEE;
  if (statut === 403 && /insufficient|SCOPE/i.test(raison)) return MESSAGE_PORTEE;
  if (statut === 403) return 'Gmail refuse de créer le brouillon (droits insuffisants sur ce compte Google).';
  if (statut === 429) return 'Google demande de patienter un peu : réessaie dans une minute.';
  if (statut === 400 || statut === 413) return 'Gmail a refusé le message (il est peut-être trop gros). Vérifie les adresses et réessaie.';
  if (statut >= 500) return 'Gmail ne répond pas pour le moment. Réessaie dans un instant.';
  return `Gmail a répondu une erreur (${statut}).`;
}

/** Adresse qui ouvre le brouillon dans Gmail (le compte est précisé pour tomber sur la bonne boîte). */
export function adresseBrouillon({ messageId, email = '' } = {}) {
  const compte = emailValide(email) ? `?authuser=${encodeURIComponent(email)}` : '';
  return `https://mail.google.com/mail/${compte}#drafts${/^[A-Za-z0-9_-]+$/.test(messageId ?? '') ? `?compose=${messageId}` : ''}`;
}

/** Crée le brouillon. `appelFetch` est `fetch` (ou un faux dans les tests). Renvoie { id, messageId, threadId }. */
export async function creerBrouillonGmail({ jeton, corps, appelFetch = globalThis.fetch }) {
  let reponse;
  try {
    reponse = await appelFetch(API_BROUILLONS, { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  } catch (e) {
    throw Object.assign(new Error(MESSAGE_RESEAU), { reseau: true, cause: e });
  }
  let rep = null;
  try { rep = await reponse.json(); } catch { /* corps vide ou illisible */ }
  if (!reponse.ok || !rep?.id) throw Object.assign(new Error(messageErreurGmail(reponse.status, rep)), { statut: reponse.status, gmail: true });
  return { id: rep.id, messageId: rep.message?.id ?? '', threadId: rep.message?.threadId ?? '' };
}

/**
 * Message pour une erreur de la création (jeton, lecture du PDF, Gmail, réseau). Un refus de l'utilisateur ou un jeton impossible à obtenir donne « pas connecté » ;
 * une fenêtre bloquée garde son texte (il dit quoi faire).
 */
export function messagePourErreur(e) {
  if (e?.lecturePdf) return MESSAGE_LECTURE_PDF;
  if (e?.code === 'pdf_trop_gros') return MESSAGE_PDF_TROP_GROS;
  if (e?.name === 'ErreurMime') return e.message;
  if (e?.annule || e?.code === 'popup_failed_to_open' || e?.code === 'access_denied') return e?.message && !/rien n’a été fait/.test(e.message) ? e.message : MESSAGE_REFUS;
  return e?.message || 'Le brouillon Gmail n’a pas pu être créé. Réessaie dans un instant.';
}

/**
 * Tout le trajet : contrôle de la saisie, jeton Gmail (au clic), lecture du PDF, MIME, brouillon. `outils` : { obtenirJeton(), lirePdf() → Blob | ArrayBuffer | Uint8Array, appelFetch?, email? }.
 * Ne lève jamais : renvoie { etat: 'cree', brouillon, saisie, url } ou { etat: 'invalide', erreurs } ou { etat: 'erreur', message, erreur }.
 * Le jeton est demandé AVANT la lecture du PDF : la fenêtre de Google doit s'ouvrir tout de suite après le clic (sinon le navigateur la bloque).
 */
export async function preparerBrouillonGmail({ saisie, nomPdf, outils }) {
  const v = validerSaisie(saisie);
  if (Object.keys(v.erreurs).length) return { etat: 'invalide', erreurs: v.erreurs };
  try {
    const jeton = await outils.obtenirJeton();
    let octets;
    try {
      const brut = await outils.lirePdf();
      octets = brut instanceof Uint8Array ? brut : new Uint8Array(typeof brut?.arrayBuffer === 'function' ? await brut.arrayBuffer() : brut);
    } catch (e) { throw Object.assign(new Error(MESSAGE_LECTURE_PDF), { lecturePdf: true, cause: e }); }
    const corps = corpsBrouillon({ a: v.a, cc: v.cc, objet: v.objet, texte: v.message, pdf: octets, nomPdf });
    const brouillon = await creerBrouillonGmail({ jeton, corps, appelFetch: outils.appelFetch });
    return { etat: 'cree', brouillon, saisie: { a: v.a, cc: v.cc, objet: v.objet, message: v.message }, url: adresseBrouillon({ messageId: brouillon.messageId, email: outils.email || '' }) };
  } catch (e) {
    return { etat: 'erreur', message: messagePourErreur(e), erreur: e };
  }
}

// ---------------------------------------------------------------- historique des envois (affichage de la fiche)
const enMillis = (t) => {
  if (!t) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const ms = t instanceof Date ? t.getTime() : new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Écart sous lequel `envoyeLe` et le premier envoi de la liste sont le même envoi (le statut est posé juste avant l'historique). */
const MEME_ENVOI_MS = 10 * 60_000;

/**
 * Lignes de l'historique : [{ ms, jour, heure, destinataires, copie, texte }], du plus ancien au plus récent.
 * `envoyeLe` (date du premier envoi) y figure toujours : s'il n'a pas de ligne d'e-mail à côté (devis marqué envoyé sans passer par l'appli), il est montré sans adresse.
 */
export function historiqueEnvois(devis) {
  const lignes = (Array.isArray(devis?.envois) ? devis.envois : [])
    .map((e) => ({ ms: enMillis(e?.date), destinataires: adressesDuDevis(e?.destinataires), copie: adressesDuDevis(e?.copie) }))
    .filter((e) => e.ms !== null);
  const premier = enMillis(devis?.envoyeLe);
  if (premier !== null && !lignes.some((e) => Math.abs(e.ms - premier) < MEME_ENVOI_MS)) lignes.push({ ms: premier, destinataires: [], copie: [] });
  return lignes.sort((x, y) => x.ms - y.ms).map((e) => {
    const jour = FORMAT_JOUR.format(new Date(e.ms));
    const heure = FORMAT_HEURE.format(new Date(e.ms)).replace(':', ' h ');
    const aQui = e.destinataires.length ? ` à ${e.destinataires.join(', ')}` : '';
    const copie = e.copie.length ? `, en copie : ${e.copie.join(', ')}` : '';
    return { ...e, jour, heure, texte: `Envoyé le ${jour} (${heure})${aQui}${copie}` };
  });
}
