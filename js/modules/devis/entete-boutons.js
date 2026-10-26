// Boutons du haut de page d'un devis (éditeur et visualisation) : UNE règle, sans navigateur. L'écran ne fait que dessiner ce que cette fonction décide.
// Règle de Jérôme (26/10/2026) : le bouton jaune est toujours l'ÉTAPE SUIVANTE conseillée ; tout le reste reste accessible dans le menu « … ».
//   Brouillon  : « Finaliser » (jaune) + « Envoyer » grisé (un clic dit pourquoi)
//   Finalisé   : « Envoyer » (jaune) puis, à sa droite, « Devis envoyé » (contour) : on envoie d'abord, puis on marque comme envoyé (26/10/2026)
//   Envoyé     : « Devis signé » (jaune) + « Devis refusé » (contour) ; le statut stocké et la pastille restent « Signé » / « Refusé »
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
  if (statut === 'envoye') return { cle: 'signer', libelle: 'Devis signé', icone: 'check' };
  return null; // signé, refusé, remplacé, statut inconnu
}

/**
 * Règle de Jérôme (26/10/2026) : le menu « … » ne répète jamais un bouton visible du haut de page.
 * Pour chaque bouton visible (`cle` rendue par boutonsEntete), les clés des entrées du menu « … » qui font la même chose :
 *  - clés `statut:<action>`, `envoyer_email` : celles de entreesActionsDevis (liste.js) ;
 *  - `envoyer-a-nouveau` et `preparer-email` : les entrées e-mail propres à l'éditeur et à la visualisation.
 * « Envoyer » GRISÉ (brouillon) n'ouvre aucun menu : il ne masque rien (ni « Envoyer par e-mail », qui dit de finaliser d'abord, ni « Préparer l'e-mail »). Seul un « Envoyer » actif, dont le menu les propose, les masque.
 */
const MENU_PAR_BOUTON = {
  finaliser: ['statut:finaliser'],
  envoyer: ['envoyer_email', 'envoyer-a-nouveau'],
  'passer-envoye': ['statut:marquer_envoye'],
  signer: ['statut:accepter'],
  refuser: ['statut:refuser'],
};
/** Les clés d'entrées du menu « … » déjà faites par un bouton visible ({ jaune, autre } de boutonsEntete) : le menu les retire. Fonction pure. */
export function clesMenuDejaVisibles({ jaune = null, autre = null } = {}) {
  const cles = [];
  for (const b of [jaune, autre]) {
    if (!b) continue;
    if (b.cle === 'envoyer' && b.grise === true) continue; // grisé : pas de menu, ce que « … » propose n'a pas d'autre accès
    cles.push(...(MENU_PAR_BOUTON[b.cle] ?? []));
    if (b.cle === 'envoyer') cles.push('preparer-email'); // « Envoyer » actif : son menu propose déjà « Préparer l'e-mail »
  }
  return [...new Set(cles)];
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
 *  - menu : { telechargerPdf, imprimer, envoyerANouveau: { present, libelle, actif }, dejaVisibles } (ce qui va dans « … » ; `dejaVisibles` : clés à retirer, voir clesMenuDejaVisibles).
 */
export function boutonsEntete({ statut, expire = false, archive = false, lecture = false, emailPossible = false } = {}) {
  void expire; void lecture; // même règle quel que soit l'écran et la date de validité : rien ne dépend d'eux aujourd'hui (gardés pour que la signature ne change pas)
  const jaune = boutonJaune({ statut, archive });
  let autre = null;
  if (archive !== true) {
    if (statut === 'brouillon') autre = { cle: 'envoyer', libelle: 'Envoyer', icone: 'mail', grise: true, style: 'contour' };
    else if (statut === 'en_attente_envoi' && transitionPossible(statut, 'marquer_envoye')) autre = { cle: 'passer-envoye', libelle: 'Devis envoyé', icone: 'check', style: 'contour' };
    else if (statut === 'envoye' && transitionPossible(statut, 'refuser')) autre = { cle: 'refuser', libelle: 'Devis refusé', icone: 'x', style: 'contour' };
  }
  const dejaVisibles = clesMenuDejaVisibles({ jaune, autre });
  return {
    jaune,
    autre,
    menu: {
      dejaVisibles,
      telechargerPdf: true,
      imprimer: true,
      // L'e-mail est dans « … » seulement quand aucun bouton « Envoyer » n'est visible (envoyé, signé, refusé, remplacé, archivé : « Envoyer à nouveau ») ; sinon c'est le bouton qui le fait.
      envoyerANouveau: { present: !dejaVisibles.includes('envoyer-a-nouveau'), libelle: statut === 'brouillon' ? 'Envoyer par e-mail' : 'Envoyer à nouveau', actif: emailPossible === true },
    },
  };
}
