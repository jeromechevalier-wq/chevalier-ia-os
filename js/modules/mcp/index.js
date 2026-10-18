// Module « Accès MCP » : page d'information (lecture seule) sur la connexion d'un assistant (Claude, ChatGPT) à l'espace du client.
// Route : mcp/infos. Présent chez Jérôme (racine) comme chez les clients ; à la racine la page ne lit rien dans Firestore.
import { vider, h, icone } from '../../os/ui.js';
import { naviguer, lien } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreInfos } from './ecran.js';

// Feuille de style propre au module, ajoutée au premier affichage.
function ajouterFeuille() {
  if (document.querySelector('link[data-mcp]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/mcp.css', import.meta.url).href;
  l.dataset.mcp = '1';
  document.head.append(l);
}

export const actionsRapides = [];

let montee = null;

export function demarrer({ compte, cheminBase = '' } = {}) {
  D.demarrer(compte, cheminBase); // '' = racine (Jérôme) : aucune lecture dans la base
}

export function arreter() {
  quitter();
  D.arreter();
}

function quitter() {
  montee?.quitter?.();
  montee = null;
}

export function afficher(conteneur, segs) {
  if (segs[0] !== 'infos') {
    naviguer('mcp/infos', { remplacer: true });
    return quitter;
  }
  if (montee && conteneur.firstChild) return quitter;
  ajouterFeuille();
  quitter();
  vider(conteneur);
  montee = { quitter: rendreInfos(conteneur) };
  conteneur.scrollTop = 0;
  return quitter;
}

/** Réglages > Accès MCP : rien à régler, un renvoi vers la page d'information (lien de connexion, mode d'emploi, membres). */
export function reglages(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-mcp' },
    h('h2', {}, icone('link', { taille: 18 }), 'Connexion de l’assistant'),
    h('p', { class: 'aide' }, 'Ce module n’a pas de réglage à toi : il s’allume ou s’éteint pour ton espace. Le lien de connexion, le mode d’emploi et la liste des membres autorisés sont sur la page Connexion.'),
    h('a', { class: 'bouton bouton-secondaire', href: lien('mcp/infos') }, icone('link', { taille: 16 }), 'Ouvrir la page Connexion')));
  return null;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
