// Fête de l'or du village (27/11/2026, étape 6a de docs/accueil-village.md, cahier §8) : une étiquette « + 10 pièces d’or » en haut de l'écran et quelques pièces qui tombent
// (environ 1,5 s), retirée au bout de 2,5 s. Jamais de son, ne bloque aucun clic (pointer-events: none), aucun classement, aucune série.
// Un gain qui arrive pendant la fête s'ajoute au nombre affiché. « Animations » décoché (roue de l'accueil) ou système en « moins d'animations » : un simple message, sans mouvement.
// Textes posés par textContent, jamais par innerHTML ; pas d'attribut `title`.
import { toast, reduireAnimations } from './ui.js';
import { animationsCoupees } from './village-reglages.js';

const NS = 'http://www.w3.org/2000/svg';
const DUREE_MS = 2500;
const PIECES_QUI_TOMBENT = 8;
let fete = null; // { element, texte, total, minuterie }

const texteGain = (n) => `+ ${n} pièces d’or`;

/** Une pièce d'or dessinée (aplat doré, reflet clair, sans contour noir), de `taille` pixels. Décorative : aria-hidden. */
export function dessinPiece(taille = 24) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const cercle = (cx, cy, r, couleur) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy)); c.setAttribute('r', String(r)); c.setAttribute('fill', couleur);
    return c;
  };
  const bord = cercle(12, 12, 11, '#D9A21B');
  const face = cercle(12, 12, 9, '#F7C548');
  const reflet = document.createElementNS(NS, 'ellipse');
  reflet.setAttribute('cx', '9'); reflet.setAttribute('cy', '8.5'); reflet.setAttribute('rx', '3.2'); reflet.setAttribute('ry', '2'); reflet.setAttribute('fill', '#E8C98A');
  reflet.setAttribute('transform', 'rotate(-30 9 8.5)');
  svg.append(bord, face, reflet);
  return svg;
}

function retirer() {
  if (!fete) return;
  clearTimeout(fete.minuterie);
  fete.element.remove();
  fete = null;
}

/** Fête un gain de `pieces` pièces d'or. */
export function feterOr(pieces) {
  const n = Number.isInteger(pieces) && pieces > 0 ? pieces : 0;
  if (!n) return;
  if (animationsCoupees() || reduireAnimations()) { toast(texteGain(n)); return; }
  if (fete && fete.element.isConnected) {
    fete.total += n;
    fete.texte.textContent = texteGain(fete.total);
    clearTimeout(fete.minuterie);
    fete.minuterie = setTimeout(retirer, DUREE_MS);
    return;
  }
  const element = document.createElement('div');
  element.className = 'fete-or';
  element.dataset.role = 'fete-or';
  element.setAttribute('role', 'status');
  const etiquette = document.createElement('div');
  etiquette.className = 'fete-or-etiquette';
  const texte = document.createElement('span');
  texte.textContent = texteGain(n);
  etiquette.append(dessinPiece(28), texte);
  const pluie = document.createElement('div');
  pluie.className = 'fete-or-pluie';
  pluie.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < PIECES_QUI_TOMBENT; i += 1) {
    const p = document.createElement('span');
    p.className = 'fete-or-piece';
    p.style.setProperty('--i', String(i));
    p.append(dessinPiece(16));
    pluie.append(p);
  }
  element.append(pluie, etiquette);
  document.body.append(element);
  fete = { element, texte, total: n, minuterie: setTimeout(retirer, DUREE_MS) };
}
