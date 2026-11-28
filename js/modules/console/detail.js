// Console > Vue d'ensemble : la rangée de boutons des bâtiments (sous le schéma) et le panneau de détail (phase 2, PR 2, 28/11/2026).
// Un vrai bouton HTML par bâtiment et par appartement (Chevalier IA OS, Chevalier IA App, chaque appartement, chaque maison du registre) : clic ou touche Entrée
// ouvre le détail sous le schéma (nom, état, projets, modules actifs, version, structure, dernier contact, motif, historique copié chez Jérôme), bouton « Fermer ».
// Les noms viennent du serveur (`consoleBatiments`, Jérôme seul) : jamais écrits ici. Le dessin reste dans schema.js (aucun texte), la mise en forme dans logique.js.
import { h, remplir } from '../../os/ui.js';
import * as L from './logique.js';

/**
 * Le bloc des bâtiments, à poser dans la section du schéma. Rend { element, afficher(reponse), erreur(message, reessayer), chargement() }.
 * `afficher` : boutons + message du registre vide + motifs ; un clic ouvre le détail.
 */
export function blocBatiments() {
  const boutons = h('div', { class: 'console-batiments', role: 'group', 'aria-label': 'Bâtiments' });
  const detail = h('div', { class: 'console-detail', hidden: true });
  const element = h('div', { class: 'console-batiments-bloc', dataset: { bloc: 'batiments' } }, boutons, detail);
  let reponse = null;
  let ouvert = null;

  function fermer() {
    detail.hidden = true;
    remplir(detail);
    const b = ouvert ? boutons.querySelector(`button[data-type="${ouvert.type}"][data-cle="${CSS.escape(ouvert.cle)}"]`) : null;
    boutons.querySelectorAll('button[aria-expanded]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
    ouvert = null;
    b?.focus();
  }

  function ouvrir(type, cle) {
    const d = L.detailBatiment(reponse, type, cle);
    if (!d) return;
    ouvert = { type, cle };
    boutons.querySelectorAll('button[aria-expanded]').forEach((x) => x.setAttribute('aria-expanded', String(x.dataset.type === type && x.dataset.cle === cle)));
    const titre = h('h3', { tabindex: '-1' }, d.titre);
    const rel = d.releve;
    remplir(detail,
      titre,
      h('p', { dataset: { champ: 'etat' } }, d.etat),
      d.note ? h('p', { class: 'aide' }, d.note) : null,
      d.projets ? h('div', { dataset: { champ: 'projets' } }, h('h4', {}, 'Projets'),
        d.projets.length ? h('ul', {}, ...d.projets.map((p) => h('li', {}, p))) : h('p', { class: 'aide' }, 'Aucun projet noté dans le registre.')) : null,
      d.modules ? h('div', { dataset: { champ: 'modules' } }, h('h4', {}, 'Modules actifs'),
        d.modules.length ? h('ul', {}, ...d.modules.map((m) => h('li', {}, m))) : h('p', { class: 'aide' }, 'Aucun module actif.')) : null,
      h('div', { dataset: { champ: 'releve' } }, h('h4', {}, 'Version'),
        rel.vide ? h('p', { class: 'aide', dataset: { vide: '1' } }, 'Aucun relevé pour l\'instant : la copie se fait toutes les heures.')
          : h('div', {}, ...rel.lignes.map((t) => h('p', {}, t)), rel.motif ? h('p', { class: 'aide', dataset: { motif: '1' } }, `Motif : ${rel.motif}.`) : null)),
      h('div', { dataset: { champ: 'historique' } }, h('h4', {}, 'Historique'),
        rel.historique.length ? h('ol', {}, ...rel.historique.map((t) => h('li', {}, t))) : h('p', { class: 'aide' }, 'Aucun changement enregistré.')),
      h('div', { class: 'ligne-boutons' }, h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'fermer-detail' }, onclick: fermer }, 'Fermer')));
    detail.dataset.detail = `${type}:${cle}`;
    detail.hidden = false;
    titre.focus();
  }

  function afficher(r) {
    reponse = r;
    const liste = L.boutonsBatiments(r);
    const propre = L.reponseBatiments(r);
    remplir(boutons,
      ...liste.map((b) => h('button', {
        type: 'button', class: 'bouton bouton-secondaire console-batiment', title: b.infobulle ?? b.libelle,
        'aria-expanded': 'false', dataset: { action: 'ouvrir-batiment', type: b.type, cle: b.cle }, onclick: () => ouvrir(b.type, b.cle),
      }, h('span', { class: 'console-batiment-nom' }, b.libelle))));
    const infos = [
      propre.maisons.length ? null : h('p', { class: 'aide', dataset: { registreVide: '1' } }, L.TEXTE_REGISTRE_VIDE),
      ...propre.motifs.map((m) => h('p', { class: 'aide', dataset: { motif: '1' } }, `Motif : ${m}.`)),
    ].filter(Boolean);
    boutons.after(...infos);
    if (ouvert) ouvrir(ouvert.type, ouvert.cle); else { detail.hidden = true; remplir(detail); }
  }

  function retirerInfos() {
    element.querySelectorAll(':scope > p, :scope > [role="alert"], :scope > [role="status"]').forEach((n) => n.remove());
  }

  return {
    element,
    chargement() {
      retirerInfos();
      remplir(boutons);
      boutons.after(h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement des bâtiments')));
    },
    afficher(r) { retirerInfos(); afficher(r); },
    erreur(message, reessayer) {
      retirerInfos();
      remplir(boutons);
      detail.hidden = true; remplir(detail); ouvert = null;
      boutons.after(h('div', { class: 'etat-vide', role: 'alert', dataset: { erreur: 'batiments' } }, h('p', {}, message),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-batiments' }, onclick: reessayer }, 'Réessayer')));
    },
  };
}
