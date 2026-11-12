// Carte mentale d'une source (13/11/2026) : une fenêtre plein écran (aucune nouvelle route : le menu et la barre d'onglets ne changent pas).
// La source au centre, une branche par pilier, les pistes au bout des branches ; couleur = pilier, marque = état. Un clic sur un pilier replie ou déplie sa branche ; un clic sur une piste ferme la carte et l'ouvre dans la liste.
// Dessin en SVG écrit à la main (aucune bibliothèque) : toutes les positions viennent de carte-logique.js. Les textes (nom, angles) sont posés comme texte (`textContent`), jamais en HTML.
// La carte ne modifie rien : elle lit les pistes et les idées déjà chargées.
import { h, icone, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as C from './carte-logique.js';
import { COULEUR_PILIER, COULEUR_GRISE } from './commun.js';

// Feuille de style de la carte, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-reseauxsociaux="reseauxsociaux-carte"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/reseauxsociaux-carte.css', import.meta.url).href;
  l.dataset.reseauxsociaux = 'reseauxsociaux-carte';
  document.head.append(l);
}

const NS = 'http://www.w3.org/2000/svg';
/** Fabrique d'élément SVG : `svg('rect', { x: 1 }, enfant…)`. Les chaînes deviennent du texte. */
function svg(tag, attrs = {}, ...enfants) {
  const el = document.createElementNS(NS, tag);
  for (const [cle, valeur] of Object.entries(attrs)) if (valeur !== null && valeur !== undefined && valeur !== false) el.setAttribute(cle, String(valeur));
  for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== false) el.append(typeof e === 'string' ? document.createTextNode(e) : e);
  return el;
}
const couleur = (pilier) => COULEUR_PILIER[R.convertirPilier(pilier)] ?? COULEUR_GRISE;
const pluriel = (n, un, plusieurs) => `${R.formaterNombre(n)} ${n > 1 ? plusieurs : un}`;

/** La marque d'un état, dessinée dans une boîte de 16 × 16 placée en (x, y). */
const marque = (etat, x, y) => svg('g', { class: 'rs-carte-marque', transform: `translate(${x} ${y})`, 'data-role': 'marque-carte', 'data-etat': etat },
  C.MARQUES_SVG[etat].map(([tag, attrs]) => svg(tag, attrs)));

/** Rend le dessin d'une carte calculée par `construireCarte`. `surPiste(piste)` : clic sur une piste ; `surBranche(cle)` : clic sur un pilier. */
export function dessinerCarte(carte, { surPiste = () => {}, surBranche = () => {} } = {}) {
  // Un clic ou la touche Entrée / Espace (au clavier, les groupes SVG ont le rôle « button »).
  const lier = (el, fn) => { el.addEventListener('click', fn); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }); return el; };
  const racine = svg('svg', { class: 'rs-carte-svg', width: carte.largeur, height: carte.hauteur, viewBox: `0 0 ${carte.largeur} ${carte.hauteur}`, role: 'group', 'aria-label': 'Carte mentale de la source', 'data-role': 'carte-svg' });
  // Les liens d'abord (sous les cadres).
  racine.append(svg('g', { class: 'rs-carte-liens', 'aria-hidden': 'true' }, carte.liens.map((l) => svg('path', { d: l.d, style: `--couleur:${couleur(l.pilier)}` }))));
  const c = carte.centre;
  racine.append(svg('g', { class: 'rs-carte-centre', 'data-role': 'centre-carte', ...(c.type ? { 'data-type': c.type } : {}) },
    svg('rect', { x: c.x, y: c.y, width: c.largeur, height: c.hauteur, rx: 12 }),
    svg('text', { x: c.x + c.largeur / 2, y: c.y + c.hauteur / 2 + 5, 'text-anchor': 'middle' }, c.texte)));
  for (const b of carte.branches) {
    const t = b.tete;
    const tete = svg('g', { class: 'rs-carte-tete', role: 'button', tabindex: '0', 'aria-expanded': String(!b.replie), 'aria-label': `${b.texte} : ${b.replie ? 'déplier' : 'replier'} la branche`, style: `--couleur:${couleur(b.pilier)}`, 'data-role': 'branche-carte', 'data-branche': b.cle, 'data-cote': b.cote, 'data-replie': String(b.replie) },
      svg('rect', { x: t.x, y: t.y, width: t.largeur, height: t.hauteur, rx: 17 }),
      svg('text', { x: t.x + t.largeur / 2, y: t.y + t.hauteur / 2 + 5, 'text-anchor': 'middle' }, b.texte));
    racine.append(lier(tete, () => surBranche(b.cle)));
    for (const p of b.pistes) {
      const g = svg('g', { class: `rs-carte-piste${p.etat === 'ecartee' ? ' rs-carte-piste-ecartee' : ''}`, role: 'button', tabindex: '0', 'aria-label': `${p.angle} (${p.libelleEtat})`, style: `--couleur:${couleur(p.pilier)}`, 'data-role': 'piste-carte', 'data-piste': p.id, 'data-etat': p.etat, 'data-branche': b.cle },
        svg('title', {}, `${p.angle} — ${p.libelleEtat}`), // l'angle complet au survol
        svg('rect', { x: p.x, y: p.y, width: p.largeur, height: p.hauteur, rx: 8 }),
        svg('rect', { class: 'rs-carte-bande', x: p.x, y: p.y, width: 5, height: p.hauteur, rx: 2 }),
        svg('text', { x: p.x + 14, y: p.y + p.hauteur / 2 + 5 }, p.texte),
        marque(p.etat, p.x + p.largeur - 24, p.y + (p.hauteur - 16) / 2));
      racine.append(lier(g, () => surPiste(p)));
    }
  }
  return racine;
}

/**
 * Ouvre la carte d'une source dans une fenêtre plein écran. `pistes` = les pistes de cette source (toutes, écartées comprises) ; `surChoisir(piste, source)` est appelé APRÈS la fermeture quand Jérôme clique sur une piste
 * (l'écran des sources ouvre alors la source et la piste dans la liste). Rend la promesse de la fenêtre (résolue à la fermeture).
 */
export function ouvrirCarte({ source, pistes, surChoisir = () => {} }) {
  ajouterFeuille();
  const inversees = new Set(); // branches cliquées : elles prennent l'état contraire à celui de départ (repliées au-delà de 30 pistes)
  const cadre = h('div', { class: 'rs-carte-cadre', tabindex: '0', dataset: { role: 'cadre-carte' }, 'aria-label': `Carte de ${source.nom || 'la source'}` });
  const resume = h('p', { class: 'aide rs-carte-resume', 'aria-live': 'polite', dataset: { role: 'resume-carte' } });
  let fermerFenetre = () => {};
  let premiere = true;
  function rendre() {
    const carte = C.construireCarte({ source, pistes, idees: D.etat.idees, inversees });
    const repliees = carte.branches.filter((b) => b.replie).length;
    resume.textContent = carte.vide
      ? 'Aucune piste pour le moment : ferme cette carte et clique sur « En tirer des idées ».'
      : `${pluriel(carte.total, 'piste', 'pistes')} sur ${pluriel(carte.branches.length, 'branche', 'branches')}${repliees ? ` (${repliees} repliée${repliees > 1 ? 's' : ''})` : ''}. Clique sur un pilier pour replier ou déplier sa branche, sur une piste pour l’ouvrir dans la liste.`;
    const avant = { gauche: cadre.scrollLeft, haut: cadre.scrollTop };
    cadre.replaceChildren(dessinerCarte(carte, {
      surBranche: (cle) => { if (inversees.has(cle)) inversees.delete(cle); else inversees.add(cle); rendre(); cadre.querySelector(`[data-branche="${cle}"][data-role="branche-carte"]`)?.focus(); },
      surPiste: (p) => { fermerFenetre(); surChoisir(pistes.find((x) => x.id === p.id), source); },
    }));
    if (premiere) { premiere = false; cadre.scrollLeft = Math.max(0, (carte.largeur - cadre.clientWidth) / 2); } // à l'ouverture, la source est au milieu de l'écran (utile sur téléphone)
    else { cadre.scrollLeft = avant.gauche; cadre.scrollTop = avant.haut; }
  }
  return dialogue({
    titre: `Carte : ${source.nom || 'source'}`,
    classe: 'dialogue-carte',
    contenu: h('div', { class: 'rs-carte' }, resume, cadre),
    boutons: [{ libelle: 'Fermer', valeur: null }],
    auMontage: ({ fermer }) => { fermerFenetre = () => fermer(null); rendre(); },
  });
}

/** Le bouton « Carte » d'une ligne de source. */
export const boutonCarte = (auClic) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'carte-source' }, onclick: auClic }, icone('git-branch', { taille: 16 }), 'Carte');
