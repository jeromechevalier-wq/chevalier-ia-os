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
export const maximumAtteint = (n) => `${n} adresses : c’est le maximum.`;

/** À qui le brouillon sera adressé par défaut, tel que le serveur le lira dans le devis : { destinataires, copie } (adresses valides, sans doublon ; la copie sans l'adresse déjà destinataire). */
export function adressesDuBrouillon(devis) {
  const utilisables = (liste) => { const vues = new Set(); return adressesDuDevis(liste).filter((a) => adresseSure(a) && !vues.has(a.toLowerCase()) && vues.add(a.toLowerCase())); }; // comme le serveur (adressesUtilisables)
  const destinataires = utilisables(devis?.destinataires);
  const copie = utilisables(devis?.copie).filter((c) => !destinataires.some((a) => a.toLowerCase() === c.toLowerCase()));
  return { destinataires, copie };
}

/** Les valeurs de départ de la fenêtre : adresses du devis (comme le serveur les lira), objet et message standard remplis. `contact` : nom de la personne du devis (vide si inconnu). */
export function valeursDeDepart(devis, contact = '') {
  const { destinataires, copie } = adressesDuBrouillon(devis);
  const variables = { contact, numero: devis?.numero || '', objet: devis?.objet || '' };
  return { destinataires, copie, objet: E.objetParDefaut(variables), message: E.messageParDefaut(variables) };
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
export const peutPreparer = (valeurs) => (valeurs?.destinataires?.length ?? 0) > 0;

/**
 * Ce qu'on envoie au serveur : SEULEMENT les champs que l'utilisateur a changés (un champ absent reprend la valeur du devis ou le texte standard calculé par le serveur).
 * Rend null si rien n'a changé : l'appel est alors identique à celui d'avant la fenêtre.
 */
export function saisieModifiee(depart, courant) {
  const memeListe = (x, y) => x.length === y.length && x.every((a, i) => a === y[i]);
  const s = {};
  if (!memeListe(depart.destinataires, courant.destinataires)) s.destinataires = courant.destinataires;
  if (!memeListe(depart.copie, courant.copie)) s.copie = courant.copie;
  if (courant.objet !== depart.objet) s.objet = courant.objet;
  if (courant.message !== depart.message) s.message = courant.message;
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
