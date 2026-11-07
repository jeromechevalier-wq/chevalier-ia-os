// « Préparer l'e-mail » d'un devis : un workflow n8n crée un BROUILLON dans le Gmail du compte, avec le PDF. Ni l'appli ni n8n n'envoient jamais l'e-mail :
// la personne l'envoie elle-même depuis Gmail, puis touche « Devis envoyé ». C'est le SEUL chemin de l'e-mail d'un devis (le navigateur ne parle plus à Gmail, décision du 27/10/2026). Ce fichier est PUR (aucun navigateur, aucun réseau) : les textes, les règles du menu
// et la ligne de l'Historique. L'écran est dans email-preparer-ecran.js ; la fonction du serveur dans functions/src/coeur/devis-email.js.
import { enMs } from './liste.js';
import * as E from './email-brouillon.js';
import { adresseSure, adressesDuDevis } from './email-brouillon.js';

export const LIBELLE_PREPARER_EMAIL = 'Préparer l’e-mail';
export const TITRE_PREPARER_EMAIL = 'Préparer l’e-mail';
export const MESSAGE_CONFIRMATION = 'Le brouillon sera créé dans ton Gmail avec le PDF. Rien n’est envoyé.';
export const MESSAGE_DEMANDE_ENVOYEE = 'Demande envoyée : le brouillon apparaît dans ton Gmail dans quelques instants';
export const MESSAGE_EN_COURS = 'Demande en cours…';
export const TEXTE_PREPARATION_EN_COURS = 'Préparation de l’e-mail en cours…';
export const TEXTE_SANS_REPONSE = 'Aucune réponse du workflow depuis plus de 15 minutes. Tu peux réessayer.';
/** Au-delà, une demande restée sans réponse n'est plus « en cours » (le serveur ne relit plus une demande de plus de 15 minutes). */
export const DELAI_SANS_REPONSE_MS = 15 * 60_000;
export const MESSAGE_NON_BRANCHE = 'La préparation de l’e-mail n’est pas encore branchée sur cet espace : préviens l’administrateur de ton espace.';
export const MESSAGE_ERREUR_PAR_DEFAUT = 'La demande n’a pas pu partir. Réessaie dans un instant : rien n’a été créé dans ton Gmail.';

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// ---------------------------------------------------------------- la fenêtre (01/11/2026) : destinataires, copie, objet, message
export const TITRE_FENETRE = 'Préparer l’e-mail';
export const LIBELLE_PREPARER_BROUILLON = 'Préparer le brouillon Gmail';
export const MESSAGE_AJOUTER_DESTINATAIRE = E.MESSAGE_AJOUTER_DESTINATAIRE;
export const MESSAGE_FENETRE_ERREUR = 'Le brouillon n’a pas pu être demandé. Ton texte est gardé : réessaie dans un instant.';
// Les deux phrases de limite du SERVEUR (functions/src/coeur/devis-email.js, code `deja_demande`) : ce ne sont pas des pannes, la fenêtre les montre en gris avec une icône d'information,
// pas en rouge. Un test relit le fichier du serveur pour garantir que les phrases sont identiques.
export const MESSAGE_LIMITE_BROUILLON_CREE = 'Un brouillon vient d’être créé pour ce devis : regarde dans ton Gmail. Tu pourras en demander un autre dans quelques minutes.';
export const MESSAGE_LIMITE_EN_COURS = 'Une préparation est déjà en cours pour ce devis : patiente quelques instants (3 minutes au plus), puis réessaie.';
/** Vrai si le message est l'une des deux phrases de limite du serveur (à montrer comme une information, pas comme une erreur). */
export const estMessageDeLimite = (message) => [MESSAGE_LIMITE_BROUILLON_CREE, MESSAGE_LIMITE_EN_COURS].includes(String(message ?? '').trim());
export const maximumAtteint = (n) => `${n} adresses : c’est le maximum.`;

/** À qui le brouillon sera adressé par défaut, tel que le serveur le lira dans le devis : { destinataires, copie } (adresses valides, sans doublon ; la copie sans l'adresse déjà destinataire). */
export function adressesDuBrouillon(devis) {
  const utilisables = (liste) => { const vues = new Set(); return adressesDuDevis(liste).filter((a) => adresseSure(a) && !vues.has(a.toLowerCase()) && vues.add(a.toLowerCase())); }; // comme le serveur (adressesUtilisables)
  const destinataires = utilisables(devis?.destinataires);
  const copie = utilisables(devis?.copie).filter((c) => !destinataires.some((a) => a.toLowerCase() === c.toLowerCase()));
  return { destinataires, copie };
}

/**
 * Les valeurs de départ de la fenêtre : adresses du devis (comme le serveur les lira), objet et message standard remplis. `contact` : nom de la personne du devis (vide si inconnu).
 * `{ relance: true }` : texte de relance au lieu du texte standard (objet tronqué pour tenir dans MAX_OBJET, le serveur refuse au-delà) ; objet ET message partent alors toujours.
 */
export function valeursDeDepart(devis, contact = '', { relance = false } = {}) {
  const { destinataires, copie } = adressesDuBrouillon(devis);
  const variables = { contact, numero: devis?.numero || '', objet: devis?.objet || '' };
  // Relance : la fenêtre s'ouvre sur le texte de relance, que le serveur ne connaît pas (il mettrait le texte standard) : objet ET message partent toujours, même sans modification.
  if (relance) {
    let objet = E.objetRelanceParDefaut(variables);
    if (objet.length > E.MAX_OBJET) { // on raccourcit l'objet du devis (pas le numéro) pour que le motif entier tienne
      const reste = Math.max(0, String(variables.objet).length - (objet.length - E.MAX_OBJET));
      objet = E.objetRelanceParDefaut({ ...variables, objet: String(variables.objet).slice(0, reste).trimEnd() }).slice(0, E.MAX_OBJET);
    }
    return { destinataires, copie, objet, message: E.messageRelanceParDefaut(variables), objetAEnvoyer: true, messageAEnvoyer: true, relance: true };
  }
  // Le nom du contact vient du cache du navigateur, le serveur relit la base : si la personne existe mais que son nom n'est pas connu ici, le message affiché est PARTI SANS nom ;
  // on l'envoie alors toujours, pour que ce que la personne relit soit exactement ce qui part (`messageAEnvoyer`).
  return { destinataires, copie, objet: E.objetParDefaut(variables), message: E.messageParDefaut(variables), messageAEnvoyer: Boolean(devis?.personneId) && !String(contact ?? '').trim() };
}

const memeAdresse = (a, b) => a.toLowerCase() === b.toLowerCase();
/**
 * Ajout d'une adresse dans « destinataires » ou « copie ». `champ` : 'destinataires' | 'copie'. Rend { liste } (nouvelle liste, ou la même si le champ était vide : rien à faire)
 * ou { erreur } (message court à écrire sous le champ ; le texte tapé reste).
 */
export function ajouterAdresse({ destinataires, copie }, champ, saisie) {
  const texte = String(saisie ?? '').trim();
  const liste = champ === 'copie' ? copie : destinataires;
  const autre = champ === 'copie' ? destinataires : copie;
  if (!texte) return { liste };
  const refus = E.refusAdresse(texte);
  if (refus) return { erreur: refus };
  if (liste.some((a) => memeAdresse(a, texte))) return { erreur: 'Cette adresse est déjà dans la liste.' };
  if (autre.some((a) => memeAdresse(a, texte))) return { erreur: champ === 'copie' ? 'Cette adresse est déjà destinataire : choisis-en une autre.' : 'Cette adresse est déjà en copie : choisis-en une autre.' };
  if (liste.length >= E.MAX_ADRESSES_PAR_CHAMP) return { erreur: maximumAtteint(E.MAX_ADRESSES_PAR_CHAMP) };
  return { liste: [...liste, texte] };
}

/** Le bouton « Préparer le brouillon Gmail » est grisé sans destinataire (cas vide). */
export const MESSAGE_OBJET_VIDE = 'L’objet ne peut pas être vide.';
export const MESSAGE_MESSAGE_VIDE = 'Le message ne peut pas être vide.';
/** En relance, un objet ou un message vidé ferait revenir le serveur au texte STANDARD, que personne n'a relu : on exige les deux. Rend une phrase d'aide, ou null (hors relance : toujours null). */
export function refusTexteRelance(valeurs) {
  if (!valeurs?.relance) return null;
  if (!String(valeurs.objet ?? '').trim()) return MESSAGE_OBJET_VIDE;
  if (!String(valeurs.message ?? '').trim()) return MESSAGE_MESSAGE_VIDE;
  return null;
}
export const peutPreparer = (valeurs) => (valeurs?.destinataires?.length ?? 0) > 0 && refusTexteRelance(valeurs) === null;

/**
 * Ce qu'on envoie au serveur : SEULEMENT les champs que l'utilisateur a changés (un champ absent reprend la valeur du devis ou le texte standard calculé par le serveur).
 * Rend null si rien n'a changé : l'appel est alors identique à celui d'avant la fenêtre.
 */
export function saisieModifiee(depart, courant) {
  const memeListe = (x, y) => x.length === y.length && x.every((a, i) => a === y[i]);
  const s = {};
  if (!memeListe(depart.destinataires, courant.destinataires)) s.destinataires = courant.destinataires;
  if (!memeListe(depart.copie, courant.copie)) s.copie = courant.copie;
  if (courant.objet !== depart.objet || depart.objetAEnvoyer === true) s.objet = courant.objet;
  if (courant.message !== depart.message || depart.messageAEnvoyer === true) s.message = courant.message;
  return Object.keys(s).length ? s : null;
}

/**
 * La ligne de l'Historique depuis `emailPrepare` (écrit par le serveur : « demandee » quand l'écran demande, puis « ok » ou « echec » quand n8n a fini) : null s'il n'y en a pas, sinon
 * { statut: 'demandee' | 'ok' | 'echec', ms, jour, heure, texte, sansReponse? }.
 *  - ok : « E-mail préparé dans Gmail le JJ/MM/AAAA (HH h MM) » ; echec : « La préparation … a échoué … Tu peux réessayer. » ;
 *  - demandee depuis moins de 15 minutes : « Préparation de l'e-mail en cours… » ; au-delà : « Aucune réponse du workflow depuis plus de 15 minutes. Tu peux réessayer. »
 *    (le serveur laisse redemander dès 3 minutes : l'anti-doublon est plus court que ce texte, ce qui évite de bloquer quelqu'un devant un workflow muet).
 */
export function lignePrepare(devis, maintenant = Date.now()) {
  const p = devis?.emailPrepare;
  if (!p || devis.statut === 'brouillon') return null;
  const ms = enMs(p.le);
  if (ms === null || !['ok', 'echec', 'demandee'].includes(p.statut)) return null;
  const jour = FORMAT_JOUR.format(new Date(ms));
  const heure = FORMAT_HEURE.format(new Date(ms)).replace(':', ' h ');
  if (p.statut === 'demandee') {
    const sansReponse = maintenant - ms > DELAI_SANS_REPONSE_MS;
    return { statut: 'demandee', ms, jour, heure, sansReponse, texte: sansReponse ? TEXTE_SANS_REPONSE : TEXTE_PREPARATION_EN_COURS };
  }
  const texte = p.statut === 'ok'
    ? `E-mail préparé dans Gmail le ${jour} (${heure})`
    : `La préparation de l’e-mail a échoué le ${jour} (${heure}). Tu peux réessayer.`;
  return { statut: p.statut, ms, jour, heure, texte };
}
