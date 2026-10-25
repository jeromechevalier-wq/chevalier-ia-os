// « Préparer l'e-mail » d'un devis : un workflow n8n crée un BROUILLON dans le Gmail du compte, avec le PDF. Ni l'appli ni n8n n'envoient jamais l'e-mail :
// la personne l'envoie elle-même depuis Gmail, puis touche « Marquer comme envoyé ». Ce fichier est PUR (aucun navigateur, aucun réseau) : les textes, les règles du menu
// et la ligne de l'Historique. L'écran est dans email-preparer-ecran.js ; la fonction du serveur dans functions/src/coeur/devis-email.js.
import { enMs } from './liste.js';
import { emailPossible, MESSAGE_FINALISER_D_ABORD, MESSAGE_PDF_EN_COURS, MESSAGE_PDF_PAS_PRET, MESSAGE_PDF_ECHEC } from './email-brouillon.js';

export const LIBELLE_PREPARER_EMAIL = 'Préparer l’e-mail';
export const TITRE_PREPARER_EMAIL = 'Préparer l’e-mail';
export const MESSAGE_CONFIRMATION = 'Le brouillon sera créé dans ton Gmail avec le PDF. Rien n’est envoyé.';
export const MESSAGE_DEMANDE_ENVOYEE = 'Demande envoyée : le brouillon apparaît dans ton Gmail dans quelques instants';
export const MESSAGE_EN_COURS = 'Demande en cours…';
export const MESSAGE_ERREUR_PAR_DEFAUT = 'La demande n’a pas pu partir. Réessaie dans un instant : rien n’a été créé dans ton Gmail.';

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Le menu peut-il proposer « Préparer l'e-mail » pour ce devis ? { actif, raison? }. `etatPdf` : 'pret' | 'en_cours' | 'a_reessayer' | 'aucun' (etatPdfDevis).
 * Un brouillon doit d'abord être finalisé ; un devis signé, refusé ou remplacé n'est plus à envoyer ; le PDF doit être prêt.
 */
export function preparerEmailPossible(devis, etatPdf) {
  if (!devis) return { actif: false, raison: 'Ce devis est introuvable.' };
  if (devis.statut === 'brouillon') return { actif: false, raison: MESSAGE_FINALISER_D_ABORD };
  const possible = emailPossible(devis.statut);
  if (!possible.actif) return possible;
  if (etatPdf === 'en_cours') return { actif: false, raison: MESSAGE_PDF_EN_COURS };
  if (etatPdf !== 'pret') return { actif: false, raison: devis.pdf?.statut === 'echec' ? MESSAGE_PDF_ECHEC : MESSAGE_PDF_PAS_PRET };
  return { actif: true };
}

/** Le devis a-t-il un destinataire ? Sans adresse, le brouillon serait inutile : on le dit avant d'appeler le serveur. */
export function aUnDestinataire(devis) {
  return (Array.isArray(devis?.destinataires) ? devis.destinataires : []).some((x) => (typeof x === 'string' ? x : x?.email ?? '').trim() !== '');
}
export const MESSAGE_SANS_DESTINATAIRE = 'Ce devis n’a pas de destinataire : ajoute une adresse e-mail dans le devis, puis réessaie.';

/**
 * La ligne de l'Historique depuis `emailPrepare` (écrit par le serveur quand n8n a fini) : null s'il n'y en a pas, sinon
 * { statut: 'ok' | 'echec', ms, jour, heure, texte }. « ok » : « E-mail préparé dans Gmail le JJ/MM/AAAA (HH h MM) ».
 */
export function lignePrepare(devis) {
  const p = devis?.emailPrepare;
  if (!p || devis.statut === 'brouillon') return null;
  const ms = enMs(p.le);
  if (ms === null || (p.statut !== 'ok' && p.statut !== 'echec')) return null;
  const jour = FORMAT_JOUR.format(new Date(ms));
  const heure = FORMAT_HEURE.format(new Date(ms)).replace(':', ' h ');
  const texte = p.statut === 'ok'
    ? `E-mail préparé dans Gmail le ${jour} (${heure})`
    : `La préparation de l’e-mail a échoué le ${jour} (${heure}). Tu peux réessayer.`;
  return { statut: p.statut, ms, jour, heure, texte };
}
