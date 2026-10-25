// Module Devis (cadrage-devis.md) : montage et routes. Trois écrans : le Bordereau (articles), la liste des devis et l'éditeur d'un devis.
// Routes : devis/bordereau, devis/liste, devis/liste/<id> (la liste avec la fiche d'un devis ouverte), devis/editeur (nouveau devis : choix de l'affaire), devis/editeur/<id> (non déclarée dans le menu : on y arrive par la liste), devis/pdf/<id> et devis/pdf/<id>/brouillon (ouvrent le PDF rangé : adresse stable écrite dans les Documents de l'affaire). Le module lit le CRM (étapes des affaires) : le CRM démarre avant lui (le module Devis dépend de « affaires », pas de « projets »).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreBordereau } from './bordereau.js';
import { rendreListeDevis } from './liste-ecran.js';
import { rendreEditeurDevis } from './editeur-ecran.js';
import { rendrePdfDevis } from './pdf-ecran.js';
import { reglages as reglagesDuModule } from './reglages.js';
import { retenirDevis } from './memoire.js';
import { rechercherDevis } from './recherche.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-devis]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/devis.css', import.meta.url).href;
  l.dataset.devis = '1';
  document.head.append(l);
}

/** Entrées du bouton « + » de la barre supérieure : « Devis » ouvre « Nouveau devis » (recherche de l'affaire dès 3 lettres). */
export const actionsRapides = [
  { id: 'devis', libelle: 'Devis', icone: 'file-text', action: () => naviguer('devis/editeur') },
];

let montee = null; // { cle, quitter }

export function demarrer({ cheminBase = '' } = {}) {
  ajouterFeuille(); // aussi pour la page Réglages, qui montre une section du module
  D.demarrer(cheminBase);
}

export function arreter() {
  quitter();
  D.arreter();
}

function quitter() {
  montee?.quitter?.();
  montee = null;
  document.querySelector('.menu-pop')?.remove();
}

const VUES = {
  liste: (conteneur, segs) => rendreListeDevis(conteneur, segs[1] || null), // devis/liste/<id> : la liste avec la fiche de ce devis ouverte
  editeur: (conteneur, segs) => rendreEditeurDevis(conteneur, segs[1] || null),
  bordereau: (conteneur) => rendreBordereau(conteneur),
  pdf: (conteneur, segs) => rendrePdfDevis(conteneur, segs[1] ?? '', segs[2] === 'brouillon'), // devis/pdf/<id> et devis/pdf/<id>/brouillon : adresses stables des PDF
};

export function afficher(conteneur, segs) {
  const [vue] = segs;
  if (!VUES[vue] || (vue === 'pdf' && !segs[1])) {
    naviguer('devis/bordereau', { remplacer: true });
    return quitter;
  }
  if (vue === 'editeur') retenirDevis(segs[1]); // le Bordereau propose « Reprendre le devis en cours »
  const cle = vue === 'editeur' ? `editeur/${segs[1] ?? ''}` : vue === 'pdf' ? `pdf/${segs[1]}/${segs[2] ?? ''}` : vue; // un éditeur (ou un PDF) par devis
  if (montee?.cle === cle && conteneur.firstChild) { montee.surRoute?.(segs[1] || null); return quitter; } // la liste reste montée : seule la fiche change
  quitter();
  vider(conteneur);
  const arret = VUES[vue](conteneur, segs);
  montee = { cle, quitter: typeof arret === 'function' ? arret : null, surRoute: typeof arret?.surRoute === 'function' ? arret.surRoute : null };
  conteneur.scrollTop = 0;
  window.scrollTo?.(0, 0);
  return quitter;
}

/** Réglages du module (page Réglages > Devis) : une section, déclarée dans registre.js. */
export function reglages(page, ctx = {}) {
  return reglagesDuModule(page, ctx);
}

/** Recherche globale de la barre supérieure : numéro, client, affaire. Un résultat ouvre le devis. */
export function rechercher(saisie) {
  return rechercherDevis(saisie);
}
