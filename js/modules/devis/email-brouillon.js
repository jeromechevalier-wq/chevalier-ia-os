// Règles pures de l'e-mail d'un devis (aucun navigateur, aucun réseau) : message et objet par défaut, qui peut recevoir un e-mail, adresses, nom de la pièce jointe, historique des envois.
// L'e-mail du devis passe UNIQUEMENT par n8n (« Préparer l'e-mail », email-preparer-ecran.js) : le navigateur ne parle plus à Gmail (décision de Jérôme, 27/10/2026).
// Ce fichier est copié tel quel sur le serveur (functions/partage/devis-email.js) : le serveur calcule le MÊME texte que l'écran. La personne envoie elle-même l'e-mail : l'appli n'envoie jamais.
import { emailValide } from './logique.js';

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

export const MESSAGE_FINALISER_D_ABORD = 'Ce devis est encore un brouillon. Il faut le finaliser (numéro, prix figés, PDF) avant de l’envoyer par e-mail.';
export const MESSAGE_PDF_EN_COURS = 'Le PDF est en cours de fabrication. Réessaie dans quelques instants.';
export const MESSAGE_PDF_PAS_PRET = 'Le PDF de ce devis n’est pas prêt. Appuie sur « Réessayer » pour le fabriquer.';
export const MESSAGE_PDF_ECHEC = 'La fabrication du PDF a échoué. Appuie sur « Réessayer » pour la relancer.';
export const MESSAGE_STATUT_INTERDIT = 'Ce devis n’est plus à envoyer (il est signé, refusé ou remplacé).';

// ---------------------------------------------------------------- qui peut recevoir un e-mail
/** « Préparer l'e-mail » : actif pour un devis finalisé ou envoyé (renvoi), et pour un brouillon (l'écran propose alors de le finaliser d'abord). */
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

// ---------------------------------------------------------------- adresses
/** Seul l'ASCII imprimable est sûr (« josé@x.fr » demanderait SMTPUTF8) ; pas de caractère spécial (parenthèses, guillemet, chevrons, barre, virgule) avant le « @ ». */
export const adresseSure = (a) => typeof a === 'string' && a === a.trim() && a.length <= 254 && /^[\x21-\x7e]+$/.test(a) && !/[()"<>\\,]/.test(a.slice(0, a.lastIndexOf('@'))) && emailValide(a);
/** Adresses d'un devis (liste de textes ou d'objets { email }) -> liste de textes non vides. */
export const adressesDuDevis = (liste) => (Array.isArray(liste) ? liste : []).map((x) => (typeof x === 'string' ? x : x?.email ?? '')).map((x) => String(x).trim()).filter(Boolean);

/** Nom de fichier de la pièce jointe : sans guillemet, barre, ni caractère de contrôle ; se termine par .pdf. */
export function nomPieceJointe(nom) {
  let n = String(nom ?? '').replace(/[\\/"\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) n = 'Devis';
  if (!/\.pdf$/i.test(n)) n = `${n}.pdf`;
  return n.slice(0, 120);
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
/** D'où est parti l'e-mail (29/10/2026, champ facultatif de la ligne d'envoi : les anciennes lignes n'en ont pas). Le logiciel ne fait que préparer un brouillon ; l'envoi est toujours fait par la personne. */
export const LIBELLES_ORIGINE_ENVOI = Object.freeze({ brouillon_logiciel: 'depuis le brouillon du logiciel', hors_logiciel: 'hors logiciel' });
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
    .map((e) => ({ ms: enMillis(e?.date), destinataires: adressesDuDevis(e?.destinataires), copie: adressesDuDevis(e?.copie), origine: Object.hasOwn(LIBELLES_ORIGINE_ENVOI, e?.origine) ? e.origine : null }))
    .filter((e) => e.ms !== null);
  const premier = enMillis(devis?.envoyeLe);
  if (premier !== null && !lignes.some((e) => Math.abs(e.ms - premier) < MEME_ENVOI_MS)) lignes.push({ ms: premier, destinataires: [], copie: [], origine: null });
  return lignes.sort((x, y) => x.ms - y.ms).map((e) => {
    const jour = FORMAT_JOUR.format(new Date(e.ms));
    const heure = FORMAT_HEURE.format(new Date(e.ms)).replace(':', ' h ');
    const aQui = e.destinataires.length ? ` à ${e.destinataires.join(', ')}` : '';
    const copie = e.copie.length ? `, en copie : ${e.copie.join(', ')}` : '';
    const origine = e.origine ? ` (${LIBELLES_ORIGINE_ENVOI[e.origine]})` : '';
    return { ...e, jour, heure, texte: `Envoyé le ${jour} (${heure})${aQui}${copie}${origine}` };
  });
}

// ---------------------------------------------------------------- contenu personnalisé d'un envoi (01/11/2026)
// La fenêtre « Préparer l'e-mail » et l'outil `preparer_email` de l'assistant peuvent donner destinataires, copie, objet et message POUR CET ENVOI SEULEMENT (le devis et le texte standard ne changent pas).
// Les mêmes règles tournent dans l'écran et sur le serveur (ce fichier est copié sur le serveur) ; le serveur reste le garde-fou : il revalide tout.
export const MAX_ADRESSES_PAR_CHAMP = 10;
export const MAX_OBJET = 200;
export const MAX_MESSAGE = 5000;
export const MESSAGE_AJOUTER_DESTINATAIRE = 'Ajoute au moins un destinataire';
const apercuAdresse = (a) => String(a ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60);

/** Message court si l'adresse ne convient pas (sous le champ), sinon null. */
export function refusAdresse(adresse) {
  const a = String(adresse ?? '').trim();
  return adresseSure(a) ? null : 'Cette adresse e-mail n’est pas valide (exemple : contact@exemple.fr).';
}

/** Texte libre propre : retours à la ligne normalisés, caractères de contrôle et balises HTML retirés, pas plus de deux lignes vides de suite, espaces de bout retirés. */
export function nettoyerTexteLibre(t) {
  return String(t ?? '').replace(/\r\n?/g, '\n').replace(/<\/?[a-zA-Z!][^>]*>/g, '').replace(/\t/g, ' ').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[ ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const nettoyerObjet = (t) => nettoyerTexteLibre(t).replace(/\s*\n\s*/g, ' ');

function listeAdresses(valeur, nom) {
  if (!Array.isArray(valeur) || valeur.some((a) => typeof a !== 'string')) return { erreur: `${nom} : une liste d’adresses e-mail est attendue.` };
  const vues = new Set();
  const liste = [];
  for (const brute of valeur) {
    const a = brute.trim();
    if (!a) continue;
    if (!adresseSure(a)) return { erreur: `L’adresse « ${apercuAdresse(a)} » (${nom.toLowerCase()}) n’est pas valide.` };
    if (!vues.has(a.toLowerCase())) { vues.add(a.toLowerCase()); liste.push(a); }
  }
  if (liste.length > MAX_ADRESSES_PAR_CHAMP) return { erreur: `${nom} : ${MAX_ADRESSES_PAR_CHAMP} adresses au plus.` };
  return { liste };
}

/**
 * Contenu final d'un envoi. `saisie` : { destinataires?, copie?, objet?, message? } (tout est facultatif ; un champ absent ou vide reprend la valeur par défaut) ;
 * `defauts` : { destinataires, copie, variables: { contact, numero, objet } } (adresses déjà nettoyées du devis).
 * Rend { ok: true, destinataires, copie, sujet, message } ou { ok: false, code: 'saisie_invalide' | 'sans_destinataire', erreur }.
 */
export function contenuDeLEnvoi(saisie, defauts) {
  const s = saisie && typeof saisie === 'object' ? saisie : {};
  let destinataires = defauts.destinataires;
  if (s.destinataires !== undefined) {
    const r = listeAdresses(s.destinataires, 'Destinataires');
    if (r.erreur) return { ok: false, code: 'saisie_invalide', erreur: r.erreur };
    destinataires = r.liste;
  }
  if (!destinataires.length) return { ok: false, code: 'sans_destinataire', erreur: MESSAGE_AJOUTER_DESTINATAIRE };
  let copie = defauts.copie;
  if (s.copie !== undefined) {
    const r = listeAdresses(s.copie, 'Copie');
    if (r.erreur) return { ok: false, code: 'saisie_invalide', erreur: r.erreur };
    copie = r.liste;
  }
  const dejaDestinataire = copie.find((c) => destinataires.some((a) => a.toLowerCase() === c.toLowerCase()));
  if (s.copie !== undefined && dejaDestinataire) return { ok: false, code: 'saisie_invalide', erreur: `L’adresse « ${apercuAdresse(dejaDestinataire)} » est déjà destinataire : elle ne peut pas être aussi en copie.` };
  copie = copie.filter((c) => !destinataires.some((a) => a.toLowerCase() === c.toLowerCase()));
  let sujet = objetParDefaut(defauts.variables);
  if (s.objet !== undefined) {
    if (typeof s.objet !== 'string') return { ok: false, code: 'saisie_invalide', erreur: 'Objet : un texte est attendu.' };
    const o = nettoyerObjet(s.objet);
    if (o.length > MAX_OBJET) return { ok: false, code: 'saisie_invalide', erreur: `L’objet est trop long (${MAX_OBJET} caractères au plus).` };
    if (o) sujet = o;
  }
  let message = messageParDefaut(defauts.variables);
  if (s.message !== undefined) {
    if (typeof s.message !== 'string') return { ok: false, code: 'saisie_invalide', erreur: 'Message : un texte est attendu.' };
    const m = nettoyerTexteLibre(s.message);
    if (m.length > MAX_MESSAGE) return { ok: false, code: 'saisie_invalide', erreur: `Le message est trop long (${MAX_MESSAGE} caractères au plus).` };
    if (m) message = m;
  }
  return { ok: true, destinataires, copie, sujet, message };
}
