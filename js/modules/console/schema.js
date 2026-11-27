// Console > Vue d'ensemble : schéma d'architecture FIGÉ et générique (27/11/2026, demande de Jérôme, docs/console.md §10).
// Dépôt public : ne nomme que des familles d'outils (Firestore, Cloud SQL, n8n, MCP) et les deux produits de Jérôme ;
// aucun nom de client, de projet, de compte, de serveur ni de secret (garde-fou 5). Les détails vivent dans le second cerveau.
// Deux dessins : un large (une rangée) et un étroit (deux rangées, sous 760 px) ; le CSS n'en montre qu'un.
import { h } from '../../os/ui.js';

const NS = 'http://www.w3.org/2000/svg';
function el(nom, attrs = {}, ...enfants) {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  for (const e of enfants) n.append(e);
  return n;
}
// Agrandissement des textes du dessin étroit (téléphone), réglé par dessin() pendant la construction.
let agrandir = 1;
const texte = (x, y, contenu, classe = 'console-schema-texte', taille = 14) => el('text', { x, y, 'text-anchor': 'middle', 'font-size': Math.round(taille * agrandir * 10) / 10, class: classe }, contenu);

const RESUME = 'Schéma d\'architecture : Chevalier IA OS est une maison, Chevalier IA App un immeuble avec un appartement par client, '
  + 'une maison client est en construction et une autre est à venir ; chaque bâtiment a son nuage de données, le MCP va droit au nuage, '
  + 'et n8n tourne sur un serveur à part.';

/** Nuage de données en deux lignes, centré sur (cx, cy). */
function nuage(cx, cy, l1, l2, avenir) {
  return el('g', { class: avenir ? 'console-schema-avenir' : null },
    el('path', { class: 'console-schema-nuage', d: `M${cx - 78} ${cy + 22} a22 22 0 0 1 8 -40 a30 30 0 0 1 52 -14 a32 32 0 0 1 56 6 a22 22 0 0 1 20 48 z` }),
    texte(cx, cy - 2, l1, 'console-schema-texte console-schema-fort', 13), texte(cx, cy + 15, l2, 'console-schema-texte', 12));
}
/** Petit téléphone « MCP » relié au bas du nuage. */
function telephone(x, y, versX, versY) {
  return el('g', {},
    el('line', { class: 'console-schema-lien', x1: x, y1: y, x2: versX, y2: versY }),
    el('rect', { class: 'console-schema-telephone', x: x - 10, y, width: 20, height: 32, rx: 4 }),
    el('line', { class: 'console-schema-lien', x1: x - 4, y1: y + 27, x2: x + 4, y2: y + 27 }),
    texte(x, y + 48, 'MCP', 'console-schema-texte console-schema-fort', 12));
}
function maison(cx, sol, { avenir = false } = {}) {
  return el('g', { class: avenir ? 'console-schema-avenir console-schema-pointilles' : null },
    el('polygon', { class: 'console-schema-toit', points: `${cx - 58},${sol - 62} ${cx},${sol - 104} ${cx + 58},${sol - 62}` }),
    el('rect', { class: 'console-schema-mur', x: cx - 48, y: sol - 62, width: 96, height: 62 }),
    el('rect', { class: 'console-schema-fenetre', x: cx - 36, y: sol - 50, width: 22, height: 20 }),
    el('rect', { class: 'console-schema-porte', x: cx + 6, y: sol - 38, width: 22, height: 38 }));
}
function immeuble(cx, sol) {
  const etages = ['À venir', 'Appartement 3', 'Appartement 2', 'Appartement 1'];
  return el('g', {},
    el('rect', { class: 'console-schema-mur', x: cx - 70, y: sol - 140, width: 140, height: 140 }),
    ...etages.map((t, i) => {
      const y = sol - 132 + i * 33;
      return el('g', { class: i === 0 ? 'console-schema-avenir' : null },
        el('rect', { class: 'console-schema-fenetre', x: cx - 62, y, width: 124, height: 26, rx: 3 }),
        texte(cx, y + 18, t, 'console-schema-texte', 13));
    }));
}
function grue(cx, sol) {
  const x = cx + 66;
  return el('g', { class: 'console-schema-grue' },
    el('line', { x1: x, y1: sol, x2: x, y2: sol - 120 }),
    el('line', { x1: x - 52, y1: sol - 116, x2: x + 14, y2: sol - 116 }),
    el('line', { x1: x, y1: sol - 132, x2: x - 40, y2: sol - 116 }),
    el('line', { x1: x - 38, y1: sol - 116, x2: x - 38, y2: sol - 92 }));
}
/** Une colonne : nuage, bâtiment, sol, nom et légende. `cx` = centre, `haut` = haut de la colonne. */
function colonne(cx, haut, b) {
  const sol = haut + 250;
  return el('g', {},
    nuage(cx, haut + 44, b.nuage[0], b.nuage[1], b.genre === 'avenir'),
    b.genre === 'immeuble' ? immeuble(cx, sol) : maison(cx, sol, { avenir: b.genre === 'avenir' }),
    b.genre === 'chantier' ? grue(cx, sol) : null,
    b.telephone ? telephone(cx + 82, haut + 104, cx + 56, haut + 66) : null,
    el('line', { class: 'console-schema-sol', x1: cx - 90, y1: sol, x2: cx + 90, y2: sol }),
    texte(cx, sol + 24, b.nom, 'console-schema-texte console-schema-fort', 15),
    ...b.legende.map((l, i) => texte(cx, sol + 44 + i * 18, l, 'console-schema-texte2', 13)));
}
const BATIMENTS = [
  { nom: 'Chevalier IA OS', genre: 'maison', nuage: ['Firestore', 'tes données'], telephone: true, legende: ['Ta maison : tu testes', 'tout ici en premier'] },
  { nom: 'Chevalier IA App', genre: 'immeuble', nuage: ['Firestore', 'un tiroir par espace'], telephone: true, legende: ['L\'immeuble : un', 'appartement par client'] },
  { nom: 'Maison client 1', genre: 'chantier', nuage: ['Cloud SQL', 'les factures'], legende: ['En construction'] },
  { nom: 'Maison à venir', genre: 'avenir', nuage: ['Données', 'à venir'], legende: ['À venir'] },
];
/** Case n8n reliée en pointillés aux deux premiers bâtiments. */
function n8n(x, y, largeur, cibles) {
  return el('g', {},
    ...cibles.map(([cx, cy]) => el('line', { class: 'console-schema-lien console-schema-tirets', x1: cx, y1: cy, x2: Math.min(Math.max(cx, x + 20), x + largeur - 20), y2: y })),
    el('rect', { class: 'console-schema-case', x, y, width: largeur, height: 54, rx: 8 }),
    texte(x + largeur / 2, y + 23, 'n8n : automatisations', 'console-schema-texte console-schema-fort', 13),
    texte(x + largeur / 2, y + 42, 'sur un serveur à part', 'console-schema-texte', 13));
}
/** Les colonnes posées : [cx, haut] pour chaque bâtiment, puis la case n8n. */
function dessin(classe, largeur, hauteur, places, caseN8n, agrandissement = 1) {
  agrandir = agrandissement;
  const svg = el('svg', { class: `console-schema ${classe}`, viewBox: `0 -14 ${largeur} ${hauteur + 14}`, role: 'img', 'aria-label': RESUME, preserveAspectRatio: 'xMidYMin meet' },
    ...BATIMENTS.map((b, i) => colonne(places[i][0], places[i][1], b)),
    n8n(caseN8n.x, caseN8n.y, caseN8n.largeur, [[places[0][0], places[0][1] + 316], [places[1][0], places[1][1] + 316]]));
  agrandir = 1;
  return svg;
}

/** La section complète : titre, deux dessins (un seul visible selon la largeur), légende. Aucune donnée lue. */
export function schemaArchitecture() {
  return h('section', { class: 'carte-section', dataset: { bloc: 'architecture' } },
    h('h2', {}, 'Architecture'),
    dessin('console-schema-large', 880, 410, [[110, 0], [330, 0], [550, 0], [770, 0]], { x: 60, y: 346, largeur: 330 }),
    dessin('console-schema-etroit', 400, 730, [[100, 0], [300, 0], [100, 400], [300, 400]], { x: 35, y: 336, largeur: 330 }, 1.25),
    h('p', { class: 'aide' }, 'Nuage = données · téléphone = MCP, va droit au nuage · grue = en construction · pointillés = à venir. '
      + 'Schéma figé : les détails (projets, serveurs) sont dans le second cerveau.'));
}
