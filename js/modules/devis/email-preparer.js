// « Préparer l'e-mail » d'un devis : un workflow n8n crée un BROUILLON dans le Gmail du compte, avec le PDF. Ni l'appli ni n8n n'envoient jamais l'e-mail :
// la personne l'envoie elle-même depuis Gmail, puis touche « Devis envoyé ». C'est le SEUL chemin de l'e-mail d'un devis (le navigateur ne parle plus à Gmail, décision du 27/10/2026). Ce fichier est PUR (aucun navigateur, aucun réseau) : les textes, les règles du menu
// et la ligne de l'Historique. L'écran est dans email-preparer-ecran.js ; la fonction du serveur dans functions/src/coeur/devis-email.js.
import { enMs } from './liste.js';
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

/** Le devis a-t-il un destinataire ? Sans adresse, le brouillon serait inutile : on le dit avant d'appeler le serveur. */
export function aUnDestinataire(devis) {
  return (Array.isArray(devis?.destinataires) ? devis.destinataires : []).some((x) => (typeof x === 'string' ? x : x?.email ?? '').trim() !== '');
}
export const MESSAGE_SANS_DESTINATAIRE = 'Ce devis n’a pas de destinataire : ajoute une adresse e-mail dans le devis, puis réessaie.';
/** Sur un devis finalisé (qui ne se modifie plus), on demande l'adresse dans la fenêtre : seul le destinataire est enregistré, le contenu du devis ne change pas. */
export const MESSAGE_SANS_DESTINATAIRE_ICI = 'Ce devis n’a pas de destinataire. Saisis l’adresse e-mail de ton client : elle est ajoutée au devis (le contenu du devis ne change pas), puis le brouillon est préparé.';
export const MESSAGE_CHANGER_ADRESSE_ICI = 'Saisis la bonne adresse e-mail de ton client : elle remplace la première adresse du devis. Les autres destinataires et les adresses en copie sont gardés (le contenu du devis ne change pas).';
export const MESSAGE_DESTINATAIRE_INVALIDE = 'Cette adresse e-mail n’est pas valide.';
export const LIBELLE_CHANGER_ADRESSE = 'Changer l’adresse';
export const LIBELLE_ENREGISTRER_ET_PREPARER = 'Enregistrer et préparer l’e-mail';
export const LIBELLE_ENREGISTRER_ADRESSE = 'Enregistrer l’adresse';
export const MESSAGE_CHANGER_ADRESSE = 'Ce n’est pas la bonne adresse ? Clique sur « Changer l’adresse » avant de préparer le brouillon.';
/** À qui le brouillon sera adressé, tel que le serveur le lira dans le devis : { destinataires, copie } (la copie sans l'adresse déjà destinataire). */
export function adressesDuBrouillon(devis) {
  const utilisables = (liste) => { const vues = new Set(); return adressesDuDevis(liste).filter((a) => adresseSure(a) && !vues.has(a.toLowerCase()) && vues.add(a.toLowerCase())); }; // comme le serveur (adressesUtilisables)
  const destinataires = utilisables(devis?.destinataires);
  const copie = utilisables(devis?.copie).filter((c) => !destinataires.some((a) => a.toLowerCase() === c.toLowerCase()));
  return { destinataires, copie };
}
/**
 * Les adresses après « Changer l'adresse » : `nouvelle` remplace seulement `depart` (la première adresse) ; les autres destinataires et la copie sont gardés.
 * Sans adresse de départ (devis sans destinataire), `nouvelle` devient l'unique destinataire. Jamais de doublon : la nouvelle adresse déjà ailleurs dans les destinataires n'y est qu'une fois,
 * et si elle était en copie elle en est retirée (`copieChangee` dit alors qu'il faut réécrire la copie).
 */
export function adressesApresChangement({ destinataires = [], copie = [] }, depart, nouvelle) {
  const meme = (a, b) => a.toLowerCase() === b.toLowerCase();
  const remplaces = depart && destinataires.some((a) => a === depart) ? destinataires.map((a) => (a === depart ? nouvelle : a)) : [nouvelle, ...destinataires];
  const vues = new Set();
  const nouveauxDestinataires = remplaces.filter((a) => !vues.has(a.toLowerCase()) && vues.add(a.toLowerCase()));
  const nouvelleCopie = copie.filter((c) => !nouveauxDestinataires.some((a) => meme(a, c)));
  return { destinataires: nouveauxDestinataires, copie: nouvelleCopie, copieChangee: nouvelleCopie.length !== copie.length };
}
/** Texte montré dans la confirmation : l'adresse du client (et la copie) avant de créer le brouillon. */
export const texteAdresses = ({ destinataires, copie }) => `Adressé à : ${destinataires.join(', ')}${copie.length ? ` · En copie : ${copie.join(', ')}` : ''}`;
/** Message à afficher si l'adresse saisie ne convient pas, sinon null. */
export const refusDestinataire = (adresse) => (adresseSure(String(adresse ?? '').trim()) ? null : MESSAGE_DESTINATAIRE_INVALIDE);

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
