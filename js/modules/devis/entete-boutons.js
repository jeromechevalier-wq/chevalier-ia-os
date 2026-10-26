// Boutons du haut de page d'un devis (éditeur et visualisation) : UNE règle, sans navigateur. L'écran ne fait que dessiner ce que cette fonction décide.
// Règle de Jérôme (26/10/2026) : le bouton jaune est toujours l'ÉTAPE SUIVANTE conseillée ; tout le reste reste accessible dans le menu « … ».
//   Brouillon  : « Finaliser » (jaune) + « Envoyer » grisé (un clic dit pourquoi)
//   Finalisé   : « Envoyer » (jaune) + « Passer à « Envoyé » » (contour)
//   Envoyé     : « Marquer comme signé » (jaune) + « Marquer comme refusé » (contour)
//   Signé, refusé, remplacé, archivé : aucun bouton jaune
// Aucune règle de statut nouvelle : les transitions restent celles de logique.js (TRANSITIONS) et du serveur.
import { transitionPossible } from './logique.js';

export const MESSAGE_FINALISER_POUR_ENVOYER = 'Finalise le devis pour pouvoir l’envoyer';

/**
 * LE choix du bouton jaune, isolé ici pour qu'il soit facile à changer (par exemple « Préparer l'e-mail » plutôt qu'« Envoyer » quand cette fonction sera au point).
 * `statut` : le statut STOCKÉ. Rend { cle, libelle, icone } ou null (aucun bouton jaune).
 */
export function boutonJaune({ statut, archive = false } = {}) {
  if (archive === true) return null;
  if (statut === 'brouillon') return { cle: 'finaliser', libelle: 'Finaliser', icone: 'check' };
  if (statut === 'en_attente_envoi') return { cle: 'envoyer', libelle: 'Envoyer', icone: 'mail' };
  if (statut === 'envoye') return { cle: 'signer', libelle: 'Marquer comme signé', icone: 'check' };
  return null; // signé, refusé, remplacé, statut inconnu
}

/**
 * Les boutons visibles du haut de page et ce que le menu « … » doit proposer en plus de ses actions habituelles.
 *  - statut : valeur STOCKÉE (brouillon, en_attente_envoi, envoye, accepte, refuse, remplace) ; jamais « expiré » ni « archivé » ;
 *  - expire : `estExpire(devis, aujourd'hui)` ; un devis expiré garde les boutons de son statut (seuls les statuts permettent accepter ou refuser) ;
 *  - archive : `devis.archive === true` (un drapeau, pas un statut) ;
 *  - lecture : vrai en visualisation ; la règle est la MÊME qu'en édition (un brouillon regardé se finalise aussi) ;
 *  - emailPossible : `emailPossible(statut).actif` de email-brouillon.js.
 * Rend { jaune, autre, menu } :
 *  - jaune : { cle, libelle, icone } ou null ;
 *  - autre : un second bouton visible { cle, libelle, icone, grise?, style } ou null (style : 'contour') ;
 *  - menu : { telechargerPdf, imprimer, envoyerANouveau: { present, libelle, actif } } (ce qui va dans « … »).
 */
export function boutonsEntete({ statut, expire = false, archive = false, lecture = false, emailPossible = false } = {}) {
  void expire; void lecture; // même règle quel que soit l'écran et la date de validité : rien ne dépend d'eux aujourd'hui (gardés pour que la signature ne change pas)
  const jaune = boutonJaune({ statut, archive });
  let autre = null;
  if (archive !== true) {
    if (statut === 'brouillon') autre = { cle: 'envoyer', libelle: 'Envoyer', icone: 'mail', grise: true, style: 'contour' };
    else if (statut === 'en_attente_envoi' && transitionPossible(statut, 'marquer_envoye')) autre = { cle: 'passer-envoye', libelle: 'Passer à « Envoyé »', icone: 'check', style: 'contour' };
    else if (statut === 'envoye' && transitionPossible(statut, 'refuser')) autre = { cle: 'refuser', libelle: 'Marquer comme refusé', icone: 'x', style: 'contour' };
  }
  return {
    jaune,
    autre,
    menu: {
      telechargerPdf: true,
      imprimer: true,
      // L'e-mail reste atteignable par « … » quel que soit le statut (rien ne disparaît) : un brouillon propose « Envoyer par e-mail » (l'écran dit alors de finaliser d'abord), un devis déjà finalisé « Envoyer à nouveau ».
      envoyerANouveau: { present: true, libelle: statut === 'brouillon' ? 'Envoyer par e-mail' : 'Envoyer à nouveau', actif: emailPossible === true },
    },
  };
}
