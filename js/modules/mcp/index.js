// Module « Accès MCP » : page d'information (lecture seule) sur la connexion d'un assistant (Claude, ChatGPT) à l'espace du client.
// Route : mcp/infos. Réservé aux clients de la plateforme (registre.js, reserveAuxClients) : le MCP de Jérôme est un autre serveur, qui ne change pas.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
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
  if (!cheminBase) throw new Error('Le module Accès MCP n’existe que chez un client (clients/<client>)');
  D.demarrer(compte, cheminBase);
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

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
