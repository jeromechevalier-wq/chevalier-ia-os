// Console > Vue d'ensemble : schéma d'architecture FIGÉ et générique (27/11/2026, demande de Jérôme, docs/console.md §10).
// Dépôt public : ne nomme que des familles d'outils et les deux produits de Jérôme (garde-fou 5). Tous les textes affichés sont dans
// schema-textes.js, vérifiés mot à mot par une liste blanche (tests/statique.test.js). Les détails vivent dans le second cerveau.
// Deux dessins : un large (quatre bâtiments par rangée) et un étroit (deux par rangée) ; le CSS en montre un selon la largeur de la section (@container).
// Registre privé (phase 2, PR 2, 28/11/2026) : quand `consoleBatiments` répond, le modèle calculé par logique.js (modeleSchema) remplace les bâtiments et les étages
// figés ; les noms y arrivent déjà tronqués. Sans réponse ou registre vide : le schéma figé, inchangé. Ce fichier n'écrit toujours aucun texte lui-même.
import { h } from '../../os/ui.js';
import { TEXTES_SCHEMA as T } from './schema-textes.js';

const NS = 'http://www.w3.org/2000/svg';
const SOL = 290; // hauteur du sol sous le haut d'une colonne (place pour le téléphone MCP entre le nuage et le toit)
const BAS = 72; // départ des tirets n8n sous le sol, sous la 2e ligne de légende
function el(nom, attrs = {}, ...enfants) {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  for (const e of enfants) if (e != null) n.append(e);
  return n;
}

/** Les pièces du dessin ; `a` = agrandissement des textes (1 pour le dessin large, plus pour l'étroit). */
function pieces(a) {
  const texte = (x, y, contenu, classe, taille) => el('text', { x, y, 'text-anchor': 'middle', 'font-size': Math.round(taille * a * 10) / 10, class: classe }, contenu);
  // Nuage : 2 lignes, ou 3 (« Firestore / tes données / et tes réglages ») resserrées dans la même bulle.
  const nuage = (cx, cy, lignes, avenir) => {
    const ys = lignes.length > 2 ? [-15, 1, 16] : [-2, 15];
    return el('g', { class: avenir ? 'console-schema-avenir' : null },
      el('path', { class: 'console-schema-nuage', d: `M${cx - 78} ${cy + 22} a22 22 0 0 1 8 -40 a30 30 0 0 1 52 -14 a32 32 0 0 1 56 6 a22 22 0 0 1 20 48 z` }),
      ...lignes.slice(0, 3).map((l, i) => texte(cx, cy + ys[i], l, i === 0 ? 'console-schema-texte console-schema-fort' : 'console-schema-texte', i === 0 ? 13 : 12)));
  };
  // Téléphone MCP entre le nuage et le toit, relié au bas du nuage ; son mot est au-dessus du toit, il ne touche aucun mur.
  const telephone = (x, y, versX, versY) => el('g', {},
    el('line', { class: 'console-schema-lien', x1: x, y1: y, x2: versX, y2: versY }),
    el('rect', { class: 'console-schema-telephone', x: x - 10, y, width: 20, height: 32, rx: 4 }),
    el('line', { class: 'console-schema-lien', x1: x - 4, y1: y + 27, x2: x + 4, y2: y + 27 }),
    texte(x, y + 50, T.telephone, 'console-schema-texte console-schema-fort', 12));
  const maison = (cx, sol, avenir) => el('g', { class: avenir ? 'console-schema-avenir console-schema-pointilles' : null },
    el('polygon', { class: 'console-schema-toit', points: `${cx - 58},${sol - 62} ${cx},${sol - 104} ${cx + 58},${sol - 62}` }),
    el('rect', { class: 'console-schema-mur', x: cx - 48, y: sol - 62, width: 96, height: 62 }),
    el('rect', { class: 'console-schema-fenetre', x: cx - 36, y: sol - 50, width: 22, height: 20 }),
    el('rect', { class: 'console-schema-porte', x: cx + 6, y: sol - 38, width: 22, height: 38 }));
  // Étages : 4 lignes (figé) ou « À venir » + TOUS les appartements (registre, 28/11/2026, AR6). Jusqu'à 4 lignes : hauteur 140, pas de 33 ;
  // au-delà : pas de 26,5 et l'immeuble se rehausse (hauteurImmeuble ; dessin() descend le sol d'autant, le haut de l'immeuble ne bouge pas).
  // Moins de 4 lignes (1 ou 2 appartements) : « À venir » reste en haut et les autres étages partent du bas (le premier touche le sol), sans trou au rez-de-chaussée.
  const immeuble = (cx, sol, etages) => {
    const pas = pasEtages(etages);
    const haut = hauteurImmeuble(etages);
    const decalage = Math.max(0, 4 - etages.length); // places vides entre « À venir » et les étages du bas
    return el('g', {},
      el('rect', { class: 'console-schema-mur', x: cx - 70, y: sol - haut, width: 140, height: haut }),
      ...etages.map((t, i) => {
        const y = sol - haut + 8 + (i === 0 ? 0 : i + decalage) * pas;
        return el('g', { class: i === 0 ? 'console-schema-avenir' : null },
          el('rect', { class: 'console-schema-fenetre', x: cx - 62, y, width: 124, height: pas - 7, rx: 3 }),
          texte(cx, y + (pas - 7) / 2 + 5, t, 'console-schema-texte', pas > 30 ? 13 : 12));
      }));
  };
  const grue = (cx, sol) => {
    const x = cx + 66;
    return el('g', { class: 'console-schema-grue' },
      el('line', { x1: x, y1: sol, x2: x, y2: sol - 120 }),
      el('line', { x1: x - 52, y1: sol - 116, x2: x + 14, y2: sol - 116 }),
      el('line', { x1: x, y1: sol - 132, x2: x - 40, y2: sol - 116 }),
      el('line', { x1: x - 38, y1: sol - 116, x2: x - 38, y2: sol - 92 }));
  };
  /** Une colonne : nuage, bâtiment, sol, nom et légende. `cx` = centre, `haut` = haut de la colonne. */
  // `sol` : haut + SOL + rehaussement de la rangée ; `p` : place de la ligne du projet Google (0 si aucun bâtiment n'en a).
  const colonne = (cx, haut, sol, p, b, etages) => {
    return el('g', {},
      nuage(cx, haut + 44, b.nuage, b.genre === 'avenir'),
      b.genre === 'immeuble' ? immeuble(cx, sol, etages) : maison(cx, sol, b.genre === 'avenir'),
      b.genre === 'chantier' ? grue(cx, sol) : null,
      b.telephone ? telephone(cx + 82, haut + 74, cx + 62, haut + 64) : null,
      el('line', { class: 'console-schema-sol', x1: cx - 90, y1: sol, x2: cx + 90, y2: sol }),
      texte(cx, sol + 24, b.nom, 'console-schema-texte console-schema-fort', 15),
      b.projet ? texte(cx, sol + 42, b.projet, 'console-schema-texte2 console-schema-projet', 12) : null, // nom du projet Google (registre privé, AR5)
      ...b.legende.map((l, i) => texte(cx, sol + 44 + p + i * 18, l, 'console-schema-texte2', 13)));
  };
  /** Case n8n reliée en pointillés aux deux premiers bâtiments. */
  const n8n = (x, y, largeur, cibles) => el('g', {},
    ...cibles.map(([cx, cy]) => el('line', { class: 'console-schema-lien console-schema-tirets', x1: cx, y1: cy, x2: Math.min(Math.max(cx, x + 20), x + largeur - 20), y2: y })),
    el('rect', { class: 'console-schema-case', x, y, width: largeur, height: 54, rx: 8 }),
    texte(x + largeur / 2, y + 23, T.n8n[0], 'console-schema-texte console-schema-fort', 13),
    texte(x + largeur / 2, y + 42, T.n8n[1], 'console-schema-texte', 13));
  return { colonne, n8n };
}

const RANGEE = 456; // hauteur d'une rangée de bâtiments (nuage, bâtiment, nom, légende)
const HAUT_IMMEUBLE = 140; // hauteur de l'immeuble jusqu'à 4 lignes
const LIGNE_PROJET = 18; // place de la ligne du projet Google sous le nom
const pasEtages = (etages) => (etages.length > 4 ? 26.5 : 33);
/** Hauteur de l'immeuble : 140 jusqu'à 4 lignes, puis autant qu'il faut pour tous les appartements. */
export const hauteurImmeuble = (etages) => Math.max(HAUT_IMMEUBLE, 8 + etages.length * pasEtages(etages));

/**
 * Un dessin : `parRangee` bâtiments par rangée, `pasX` entre deux centres, `x0` centre du premier ; la case n8n reste sous les deux premiers bâtiments.
 * Avec les 4 bâtiments figés, les places et les tailles sont exactement celles d'avant (880 × 450 large, 400 × 810 étroit).
 */
function dessin(classe, { parRangee, pasX, x0, largeur, caseN8n, agrandissement }, modele) {
  const { colonne, n8n } = pieces(agrandissement);
  const batiments = modele?.batiments ?? T.batiments;
  const etages = modele?.etages ?? T.etages;
  const rangees = Math.ceil(batiments.length / parRangee);
  const p = batiments.some((b) => b.projet) ? LIGNE_PROJET : 0;
  // Rehaussement d'une rangée : ce qui dépasse 140 pour l'immeuble, s'il est dans cette rangée ; tout ce qui est dessous descend d'autant.
  const hausse = Array.from({ length: rangees }, (_, r) => (batiments.slice(r * parRangee, (r + 1) * parRangee).some((b) => b.genre === 'immeuble') ? hauteurImmeuble(etages) - HAUT_IMMEUBLE : 0));
  const hauts = hausse.map((_, r) => hausse.slice(0, r).reduce((t, x) => t + RANGEE + x + p, 0));
  const places = batiments.map((_, i) => {
    const r = Math.floor(i / parRangee);
    return { x: x0 + (i % parRangee) * pasX, haut: hauts[r], sol: hauts[r] + SOL + hausse[r] };
  });
  const yN8n = caseN8n.y + hausse[0] + p;
  const hauteur = rangees === 1 ? yN8n + 60 : hauts[rangees - 1] + 354 + hausse[rangees - 1] + p;
  return el('svg', { class: `console-schema ${classe}`, viewBox: `0 -14 ${largeur} ${hauteur + 14}`, role: 'img', 'aria-label': T.resume, preserveAspectRatio: 'xMidYMin meet' },
    ...batiments.map((b, i) => colonne(places[i].x, places[i].haut, places[i].sol, p, b, etages)),
    n8n(caseN8n.x, yN8n, caseN8n.largeur, [[places[0].x, places[0].sol + BAS + p], [places[1].x, places[1].sol + BAS + p]]));
}

const LARGE = { parRangee: 4, pasX: 220, x0: 110, largeur: 880, caseN8n: { x: 60, y: 390, largeur: 330 }, agrandissement: 1 };
const ETROIT = { parRangee: 2, pasX: 200, x0: 100, largeur: 400, caseN8n: { x: 35, y: 382, largeur: 330 }, agrandissement: 1.25 };

/** Les deux dessins (large puis étroit) ; `modele` = null pour le schéma figé. */
export function dessinsArchitecture(modele = null) {
  return [dessin('console-schema-large', LARGE, modele), dessin('console-schema-etroit', ETROIT, modele)];
}

/** Remplace les deux dessins d'une section déjà affichée (réponse du registre arrivée). */
export function remplacerDessins(section, modele) {
  const anciens = [...section.querySelectorAll(':scope > svg.console-schema')];
  const nouveaux = dessinsArchitecture(modele);
  if (anciens.length !== 2) return;
  anciens[0].replaceWith(nouveaux[0]);
  anciens[1].replaceWith(nouveaux[1]);
}

/** La section complète : titre, deux dessins (un seul visible selon la largeur de la section), légende, puis `enfants` (boutons des bâtiments et détail, ecran.js). */
export function schemaArchitecture(modele = null, ...enfants) {
  return h('section', { class: 'carte-section console-schema-cadre', dataset: { bloc: 'architecture' } },
    h('h2', {}, T.titre),
    ...dessinsArchitecture(modele),
    h('p', { class: 'aide' }, T.legende),
    ...enfants);
}
