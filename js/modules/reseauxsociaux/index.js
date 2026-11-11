// Module Réseaux sociaux (squelette, 11/11/2026) : suivre ses posts LinkedIn (lus dans Buffer, jamais copiés), la suite de ses échanges LinkedIn (activités du CRM)
// et préparer ses publications. Routes : reseauxsociaux/aujourdhui, posts, relations, import. Chez Jérôme, les tables sont à la racine de la base
// (reseauxsociaux_posts, reseauxsociaux_imports) ; chez un client, sous clients/<client>/. Le module n'exige aucun autre module (il marche quand Affaires est éteint).
// Modèle : js/modules/veille/index.js. Mode d'emploi pour créer un module : docs/creer-un-module.md.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { declarerLibellesJournal } from '../../os/journal.js';
import * as D from './donnees.js';
import { reglagesExportReseauxSociaux } from './export.js';
import { LIBELLES_JOURNAL } from './libelles-journal.js';

// Chaque écran est chargé à la demande : { rendre, oublier } sont lus dans son fichier.
const VUES = {
  aujourdhui: () => import('./aujourdhui.js').then((m) => ({ rendre: m.rendreAujourdhui, oublier: m.oublierFiltresAujourdhui })),
  posts: () => import('./posts-ecran.js').then((m) => ({ rendre: m.rendrePosts, oublier: m.oublierFiltresPosts })),
  relations: () => import('./relations-ecran.js').then((m) => ({ rendre: m.rendreRelations, oublier: m.oublierFiltresRelations })),
  import: () => import('./import-ecran.js').then((m) => ({ rendre: m.rendreImport, oublier: m.oublierFiltresImport })),
};

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé), puis celle de l'écran s'il en a une.
function ajouterFeuille(nom) {
  if (document.querySelector(`link[data-reseauxsociaux="${nom}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL(`../../../css/${nom}.css`, import.meta.url).href;
  l.dataset.reseauxsociaux = nom;
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran : les posts s'écrivent dans Buffer

/** Réglages du module : une seule section, « Sauvegarde » (export des données). */
export function reglages(page) {
  reglagesExportReseauxSociaux(page);
}

let montee = null;
let ecranMonte = '';
let jeton = 0; // un écran chargé à la demande n'est monté que si c'est toujours celui qu'on veut

export function demarrer({ compte, cheminBase = '' } = {}) {
  declarerLibellesJournal(LIBELLES_JOURNAL);
  D.demarrer(compte, cheminBase);
}

export function arreter() {
  quitter();
  D.arreter();
}

function quitter() {
  jeton++;
  montee?.quitter?.();
  montee = null;
  ecranMonte = '';
}

/** Remet à zéro les filtres mémorisés de chaque écran (déconnexion ou changement de compte). Appelée par la coque (main.js, espace.js). */
export async function oublierFiltres() {
  for (const charger of Object.values(VUES)) {
    try { (await charger()).oublier?.(); } catch (e) { console.warn(e); }
  }
}

export function afficher(conteneur, segs) {
  const ecran = segs[0];
  if (!Object.hasOwn(VUES, ecran)) {
    naviguer('reseauxsociaux/aujourdhui', { remplacer: true });
    return quitter;
  }
  if (montee && ecranMonte === ecran && conteneur.firstChild) return quitter;
  ajouterFeuille('reseauxsociaux');
  quitter();
  vider(conteneur);
  const monJeton = jeton;
  ecranMonte = ecran;
  VUES[ecran]().then((vue) => {
    if (monJeton !== jeton) return; // l'utilisateur est déjà ailleurs
    montee = { quitter: vue.rendre(conteneur) };
    conteneur.scrollTop = 0;
  }).catch((e) => {
    console.warn(e);
    if (monJeton === jeton) ecranMonte = '';
  });
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
