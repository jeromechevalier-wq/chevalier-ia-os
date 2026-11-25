// Petits composants d'écran du module Achats « Chantiers » (24/11/2026, PR 6). Même dessin que les listes du reste de l'appli (feuille css/crm.css), mais sans importer un autre module :
// un module Achats n'importe que la coque, son propre dossier, le code commun des Achats et la barre commune des listes (verrou : tests/achats-coquilles.test.js).
// Aucun appel réseau ici.
import { h, icone, remplir } from '../../os/ui.js';
import { libelleEtoile } from './favoris.js';

/** Étoile d'un chantier : jaune et pleine quand il est en favori, vide sinon. Un clic appelle `surBascule`. */
export function boutonEtoile({ favori, libelle, surBascule }) {
  return h('button', {
    type: 'button', class: `bouton-icone bouton-etoile${favori ? ' est-favori' : ''}`, dataset: { action: 'basculer-favori' },
    'aria-pressed': favori ? 'true' : 'false',
    'aria-label': favori ? `Retirer ${libelle} des favoris` : `Mettre ${libelle} en favori`,
    title: libelleEtoile(favori),
    onclick: (e) => { e.stopPropagation(); surBascule(); },
  }, icone('star', { taille: 16 }));
}

/** Menu « Trier par » + flèche du sens. Renvoie { element, maj(valeur, sens) }. `surChangement({ critere, sens })`. */
export function selecteurTri({ options, valeur, sens, surChangement }) {
  let etat = { critere: valeur, sens };
  const menu = h('select', { class: 'champ champ-tri', 'aria-label': 'Trier par', onchange: (e) => {
    const c = options.find((o) => o.id === e.target.value);
    etat = { critere: e.target.value, sens: c?.sens || 'asc' };
    maj(etat.critere, etat.sens);
    surChangement({ ...etat });
  } });
  const fleche = h('button', { type: 'button', class: 'bouton-icone bouton-tri-sens', dataset: { action: 'inverser-tri' },
    onclick: () => { etat = { critere: etat.critere, sens: etat.sens === 'asc' ? 'desc' : 'asc' }; maj(etat.critere, etat.sens); surChangement({ ...etat }); } });
  function maj(critere, sensActuel) {
    etat = { critere, sens: sensActuel };
    remplir(menu, options.map((o) => h('option', { value: o.id, selected: o.id === critere }, `Trier par : ${o.libelle}`)));
    menu.value = critere;
    const texte = sensActuel === 'asc' ? 'croissant' : 'décroissant';
    fleche.setAttribute('aria-label', `Sens du tri : ${texte}. Inverser le sens`);
    fleche.title = `Sens du tri : ${texte}`;
    fleche.dataset.sens = sensActuel;
    remplir(fleche, icone(sensActuel === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 16 }));
  }
  maj(valeur, sens);
  return { element: h('div', { class: 'selecteur-tri' }, menu, fleche), maj };
}

/** Bouton « Filtres » (entonnoir, pastille de compte quand des filtres sont posés). Renvoie { element, majCompte(n) }. */
export function boutonFiltres({ auClic }) {
  const element = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'filtres' }, onclick: auClic });
  function majCompte(n = 0) { remplir(element, icone('funnel', { taille: 16 }), 'Filtres', n ? h('span', { class: 'compteur-filtres' }, String(n)) : null); }
  majCompte(0);
  return { element, majCompte };
}

/** Cas vide : une phrase simple, et si besoin une action. */
export const etatVide = (message, { action = null, role = 'status' } = {}) => h('div', { class: 'etat-vide carte-section', role, dataset: { etat: 'vide' } }, h('p', {}, message), action);

/** Cas d'erreur : un message lisible et « Réessayer ». */
export const etatErreur = (message, surReessayer) => h('div', { class: 'etat-vide carte-section', role: 'alert', dataset: { etat: 'erreur' } },
  h('p', { class: 'mon-espace-erreur' }, icone('triangle-alert', { taille: 18 }), message),
  h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: surReessayer }, icone('refresh-cw', { taille: 16 }), 'Réessayer'));

/** Chargement. */
export const chargement = () => h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement des chantiers…'));

/** Télécharge un texte comme fichier (le fichier ne part nulle part : c'est le navigateur qui l'enregistre). */
export function telechargerTexte(nom, contenu, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenu], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: nom });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
