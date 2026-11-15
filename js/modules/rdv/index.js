// Module Rendez-vous (14/11/2026) : proposer 1 à 3 créneaux de rendez-vous par SMS, lire les réponses, trouver le créneau commun ; seule la professionnelle confirme.
// Routes : rdv/liste (Kanban | Liste), rdv/archives, rdv/nouveau, rdv/liste/<id> (fiche). Chez Jérôme, les tables sont à la racine de la base (rdv_rendezvous, rdv_participants,
// rdv_messages, rdv_parametres) ; chez un client, sous clients/<client>/. Le module n'exige aucun autre module (les participants sont des fiches Personnes du socle).
// Modèle : js/modules/veille/index.js. Mode d'emploi pour créer un module : docs/creer-un-module.md.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { declarerLibellesJournal } from '../../os/journal.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import { reglages as reglagesRdv } from './reglages.js';
import { LIBELLES_JOURNAL } from './libelles-journal.js';

const VUES = {
  liste: (id) => (id ? import('./fiche.js').then((m) => ({ rendre: (c) => m.rendreFiche(c, id) })) : import('./liste.js').then((m) => ({ rendre: (c) => m.rendreListeRdv(c) }))),
  archives: () => import('./liste.js').then((m) => ({ rendre: (c) => m.rendreListeRdv(c, { archives: true }) })),
  nouveau: () => import('./creation.js').then((m) => ({ rendre: m.rendreCreation })),
};

function ajouterFeuille() {
  if (document.querySelector('link[data-rdv]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/rdv.css', import.meta.url).href;
  l.dataset.rdv = '1';
  document.head.append(l);
}

/** Bouton « + » de la barre supérieure. */
export const actionsRapides = [{ id: 'rdv', libelle: 'Rendez-vous', icone: 'calendar-check', action: () => naviguer('rdv/nouveau') }];

/** Réglages du module (page Réglages de la coque) : relances, rappel, plage, alertes, nom, rôles, modèles, sauvegarde. */
export function reglages(page) {
  ajouterFeuille();
  return reglagesRdv(page);
}

let montee = null;
let cleMontee = '';
let jeton = 0;

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
  cleMontee = '';
  document.querySelector('.menu-pop')?.remove();
}

/** Remet à zéro les filtres mémorisés (déconnexion ou changement de compte). Appelée par la coque (main.js, espace.js). */
export async function oublierFiltres() {
  try { (await import('./liste.js')).oublierFiltresRdv(); } catch (e) { console.warn(e); }
}

export function afficher(conteneur, segs) {
  const [vue, id] = segs;
  if (!Object.hasOwn(VUES, vue)) {
    naviguer('rdv/liste', { remplacer: true });
    return quitter;
  }
  const cle = `${vue}/${id || ''}`;
  if (montee && cleMontee === cle && conteneur.firstChild) return quitter;
  ajouterFeuille();
  quitter();
  vider(conteneur);
  const monJeton = jeton;
  cleMontee = cle;
  VUES[vue](id).then((m) => {
    if (monJeton !== jeton) return;
    const arret = m.rendre(conteneur);
    montee = { quitter: typeof arret === 'function' ? arret : null };
    conteneur.scrollTop = 0;
  }).catch((e) => {
    console.warn(e);
    if (monJeton === jeton) cleMontee = '';
  });
  return quitter;
}

/** Recherche globale : les rendez-vous non archivés (client, commune, objet). */
export function rechercher(saisie) {
  const items = D.etat.rendezVous.filter((r) => !r.archive).map((r) => ({
    id: r.id, libelle: L.libelleAvecTest(r.client || 'Rendez-vous', r.test), sousTitre: r.commune || '', extra: [r.commune, r.objet].filter(Boolean), chemin: `rdv/liste/${r.id}`,
  }));
  const resultats = L.rechercherSuggestions(saisie, items, {}).resultats;
  return { groupes: resultats.length ? [{ titre: 'Rendez-vous', resultats }] : [] };
}
