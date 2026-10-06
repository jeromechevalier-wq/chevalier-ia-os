// Petits éléments d'interface du module Projets, réutilisables par les fiches du CRM (affaire, personne, organisation).
import { h } from '../../os/ui.js';
import * as P from './logique.js';

export const cheminProjet = (id) => `#/projets/projets/${id}`;

/** Barre des quatre phases (comme la barre des étapes d'une affaire) : les phases atteintes sont pleines. */
export function barrePhases(projet) {
  const index = P.PHASES.findIndex((x) => x.id === projet.phase);
  return h('span', { class: `barre-etapes statut-${projet.statut}`, role: 'img', 'aria-label': `Phase : ${P.libellePhase(projet.phase)}` },
    P.PHASES.map((ph, i) => h('span', { class: `segment${i <= index ? ' plein' : ''}`, style: { '--couleur': ph.couleur } })));
}

/** Petite carte d'un projet (sections « Projet » et « Projets » des fiches). */
export function carteProjetMini(projet) {
  const etat = projet.statut === 'actif' ? P.libellePhase(projet.phase) : P.libelleStatutProjet(projet.statut);
  return h('a', { class: 'carte-affaire-mini carte-projet-mini', href: cheminProjet(projet.id), dataset: { projet: projet.id } },
    h('span', { class: 'carte-affaire-titre' }, projet.titre),
    h('span', { class: 'carte-affaire-meta' }, etat, projet.nature === 'extraction' ? ' · Extraction' : '', projet.archive ? ' · Archivé' : ''),
    barrePhases(projet));
}
