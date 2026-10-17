// Règle de l'appli pour tout bouton « Retirer » / « Supprimer » : une fenêtre de confirmation d'abord, puis, quand l'action peut être défaite,
// un message en bas « Retiré · Annuler » pendant 8 secondes. Une action qu'on ne peut pas défaire n'a que la confirmation (et le dit).
import { toast, confirmer } from './ui.js';

export const DUREE_ANNULATION = 8000;

/**
 * - titre, message : la fenêtre de confirmation ; libelleOk : le bouton (« Retirer » par défaut) ; danger : bouton rouge
 * - faire() : retire ; defaire() : remet exactement ce qui était là (si on ne peut pas, ne pas le donner : pas de « Annuler »)
 * - messageFait : « Retiré » par défaut
 * Renvoie true si le retrait a eu lieu.
 */
export async function retirerAvecAnnulation({ titre, message = '', libelleOk = 'Retirer', danger = false, faire, defaire = null, messageFait = 'Retiré', messageErreur = 'Retrait impossible' }) {
  if (!(await confirmer(titre, message, { libelleOk, danger }))) return false;
  try {
    await faire();
  } catch (e) {
    console.warn(e);
    toast(messageErreur, { type: 'erreur' });
    return false;
  }
  if (defaire) {
    toast(messageFait, { duree: DUREE_ANNULATION, action: { libelle: 'Annuler', surClic: async () => {
      try { await defaire(); toast('Remis en place'); } catch (e) { console.warn(e); toast('Impossible d’annuler', { type: 'erreur' }); }
    } } });
  } else toast(messageFait);
  return true;
}

// ---------------------------------------------------------------- retrait DIFFÉRÉ (2.8.0)
// Pour un retrait dont l'effet se voit tout de suite mais dont l'écriture (la suppression d'un fichier, par exemple) n'a lieu qu'APRÈS les 8 secondes :
// « Annuler » pendant ce délai remet tout en place et rien n'a été écrit. Changer de page pendant le délai ne change rien (le retrait suit son cours) ; un autre enregistrement du même écran valide les retraits en attente d'abord (validerRetraitsEnAttente).
const enAttente = new Set();

/**
 * - masquer() : cache l'élément à l'écran ; remettre() : le remet (Annuler, ou échec de valider) ; valider() : l'écriture réelle, après 8 secondes
 * Renvoie true si le retrait a été confirmé (même s'il n'est pas encore écrit).
 */
export async function retirerEnDifferant({ titre, message = '', libelleOk = 'Retirer', danger = true, masquer, remettre, valider, messageFait = 'Retiré', messageErreur = 'Retrait impossible' }) {
  if (!(await confirmer(titre, message, { libelleOk, danger }))) return false;
  masquer();
  let fini = false;
  let minuteur = null;
  const attente = {
    async valider() {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      enAttente.delete(attente);
      try { await valider(); } catch (e) { console.warn(e); remettre(); toast(messageErreur, { type: 'erreur', duree: 6000 }); }
    },
  };
  minuteur = setTimeout(() => attente.valider(), DUREE_ANNULATION + 400); // un peu après la fermeture du message : « Annuler » n'est plus proposé quand l'écriture part
  enAttente.add(attente);
  toast(messageFait, { duree: DUREE_ANNULATION, action: { libelle: 'Annuler', surClic: () => {
    if (fini) { toast('Trop tard : c’est déjà retiré.', { type: 'erreur' }); return; } // écrit plus tôt (un autre enregistrement a suivi) : on ne fait pas croire qu'on a annulé
    fini = true;
    clearTimeout(minuteur);
    enAttente.delete(attente);
    remettre();
    toast('Remis en place');
  } } });
  return true;
}

/** À appeler avant un autre enregistrement du même écran : les retraits en attente sont écrits tout de suite (un retrait confirmé ne se perd pas et ne passe pas après la nouvelle valeur). */
export function validerRetraitsEnAttente() {
  return Promise.all([...enAttente].map((a) => a.valider()));
}
