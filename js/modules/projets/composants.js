// Petits éléments d'interface du module Projets, réutilisables par les fiches du CRM (affaire, personne, organisation).
import { h } from '../../os/ui.js';
import * as P from './logique.js';
import * as CRM from '../crm/donnees.js';
const cfg = () => CRM.etat.config;

export const cheminProjet = (id) => `#/projets/projets/${id}`;

/** Barre des quatre phases (comme la barre des étapes d'une affaire) : les phases atteintes sont pleines. */
export function barrePhases(projet) {
  const index = P.phasesActives(cfg()).findIndex((x) => x.id === projet.phase);
  return h('span', { class: `barre-etapes statut-${projet.statut}`, role: 'img', 'aria-label': `Phase : ${P.libellePhase(projet.phase, cfg())}` },
    P.phasesActives(cfg()).map((ph, i) => h('span', { class: `segment${i <= index ? ' plein' : ''}`, style: { '--couleur': ph.couleur } })));
}

/** Petite carte d'un projet (sections « Projet » et « Projets » des fiches). */
export function carteProjetMini(projet) {
  const etat = projet.statut === 'actif' ? P.libellePhase(projet.phase, cfg()) : P.libelleStatutProjet(projet.statut);
  return h('a', { class: 'carte-affaire-mini carte-projet-mini', href: cheminProjet(projet.id), dataset: { projet: projet.id } },
    h('span', { class: 'carte-affaire-titre' }, projet.titre),
    h('span', { class: 'carte-affaire-meta' }, etat, projet.nature === 'extraction' && P.extractionActive(cfg()) ? ' · Extraction' : '', projet.archive ? ' · Archivé' : ''),
    barrePhases(projet));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Cercle d'avancement : tâches faites sur tâches du projet. Renvoie null quand le projet n'a aucune tâche (rien à mesurer).
 * `progression` : { faites, total, ratio } (voir progressionProjet).
 */
export function anneauProgression({ faites, total, ratio }, { taille = 22 } = {}) {
  if (!total) return null;
  const rayon = 9;
  const circonference = 2 * Math.PI * rayon;
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg xmlns="${SVG_NS}" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke-width="3" aria-hidden="true">`
    + `<circle cx="12" cy="12" r="${rayon}" stroke="var(--barre-fond)"/>`
    + `<circle cx="12" cy="12" r="${rayon}" stroke="var(--succes)" stroke-linecap="round" stroke-dasharray="${(circonference * ratio).toFixed(2)} ${circonference.toFixed(2)}" transform="rotate(-90 12 12)"/></svg>`;
  const libelle = `${faites} tâche${faites > 1 ? 's' : ''} faite${faites > 1 ? 's' : ''} sur ${total}`;
  return h('span', { class: 'anneau-progression', role: 'img', 'aria-label': libelle, title: libelle, dataset: { faites: String(faites), total: String(total) } }, tpl.content.firstElementChild);
}
