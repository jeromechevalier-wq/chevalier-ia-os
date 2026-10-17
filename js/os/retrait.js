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
