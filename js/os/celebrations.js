// Célébrations (feu d'artifice repris de tally-merci.html), Charles, compteurs animés.
import { h, reduireAnimations } from './ui.js';

const COULEURS = ['#ecbc06', '#ffe56c', '#e3cdee', '#ffffff', '#b98ee0'];
const AVATAR_CHARLES = 'assets/charles-portrait.png';

let file = Promise.resolve();

/** Met les célébrations en file : une seule à la fois. */
function enFile(fn) {
  file = file.then(fn, fn);
  return file;
}

// ---------------------------------------------------------------- moteur de particules

function creerCanvas() {
  const canvas = h('canvas', { class: 'celebration-canvas', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const particules = [];
  let W = 0;
  let H = 0;
  function redimensionner() {
    W = canvas.width = window.innerWidth * dpr;
    H = canvas.height = window.innerHeight * dpr;
  }
  redimensionner();
  let actif = true;
  function etape() {
    if (!actif) return;
    ctx.clearRect(0, 0, W, H);
    for (let i = particules.length - 1; i >= 0; i--) {
      const p = particules[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.992;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > H + 20) { particules.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(etape);
  }
  requestAnimationFrame(etape);
  return {
    canvas,
    dpr,
    gerbe(xRel, yRel, nombre = 70, couleurs = COULEURS) {
      const x = window.innerWidth * xRel * dpr;
      const y = window.innerHeight * yRel * dpr;
      for (let i = 0; i < nombre; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vitesse = (Math.random() * 3.2 + 1.4) * dpr;
        particules.push({
          x, y,
          vx: Math.cos(angle) * vitesse,
          vy: Math.sin(angle) * vitesse,
          g: 0.045 * dpr,
          size: (Math.random() * 2.6 + 1.4) * dpr,
          color: couleurs[Math.floor(Math.random() * couleurs.length)],
          life: 1,
          decay: Math.random() * 0.012 + 0.009,
        });
      }
    },
    pluie(nombre = 6, couleurs = ['#ecbc06', '#ffe56c', '#fff3b0']) {
      for (let i = 0; i < nombre; i++) {
        particules.push({
          x: Math.random() * W,
          y: -10 * dpr,
          vx: (Math.random() - 0.5) * 0.6 * dpr,
          vy: (Math.random() * 2 + 1.5) * dpr,
          g: 0.02 * dpr,
          size: (Math.random() * 2 + 1.2) * dpr,
          color: couleurs[Math.floor(Math.random() * couleurs.length)],
          life: 1,
          decay: 0.004 + Math.random() * 0.004,
        });
      }
    },
    arreter() { actif = false; },
  };
}

/** Superposition cliquable qui se ferme seule après `duree` ms. */
function superposition({ classe, contenu, duree, animer }) {
  return new Promise((resoudre) => {
    const moteur = creerCanvas();
    const couche = h('div', { class: `celebration ${classe}`, role: 'dialog', 'aria-live': 'assertive', tabindex: '-1', title: 'Clique pour fermer' },
      moteur.canvas,
      h('div', { class: 'celebration-contenu' }, contenu));
    document.body.append(couche);
    couche.focus({ preventScroll: true });
    const minuteurs = animer(moteur) || [];
    let fini = false;
    function fermer() {
      if (fini) return;
      fini = true;
      minuteurs.forEach((m) => { clearTimeout(m); clearInterval(m); });
      couche.classList.add('sortie');
      setTimeout(() => { moteur.arreter(); couche.remove(); resoudre(); }, 220);
    }
    couche.addEventListener('click', fermer);
    couche.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') fermer(); });
    minuteurs.push(setTimeout(fermer, duree));
  });
}

function scene(message, sousTitre) {
  return h('div', { class: 'scene-charles' },
    h('div', { class: 'scene' },
      h('div', { class: 'orbite o1' }),
      h('div', { class: 'orbite o2' }),
      h('div', { class: 'charles-flottant' }, h('img', { src: AVATAR_CHARLES, alt: 'Charles, l’assistant IA', width: '512', height: '384' }))),
    h('p', { class: 'celebration-titre' }, message),
    sousTitre ? h('p', { class: 'celebration-sous-titre' }, sousTitre) : null);
}

// ---------------------------------------------------------------- célébrations publiques

/** Carte passée en Gagné : grand feu d'artifice et Charles au centre. */
export function celebrerGagne(message = 'Bravo Jérôme !', sousTitre = '') {
  if (reduireAnimations()) return Promise.resolve();
  return enFile(() => superposition({
    classe: 'celebration-gagne',
    duree: 2800,
    contenu: scene(message, sousTitre),
    animer: (m) => [
      setTimeout(() => m.gerbe(0.25 + Math.random() * 0.1, 0.25, 90), 60),
      setTimeout(() => m.gerbe(0.7 + Math.random() * 0.1, 0.22, 90), 450),
      setTimeout(() => m.gerbe(0.5, 0.15, 110), 900),
      setTimeout(() => m.gerbe(0.35, 0.3, 70), 1400),
    ],
  }));
}

/** Facture payée : compteur du chiffre d'affaires qui défile et pluie d'étincelles jaunes. */
export function celebrerPaiement(avant, apres, format = (n) => String(Math.round(n))) {
  if (reduireAnimations()) return Promise.resolve();
  const compteur = h('span', { class: 'celebration-compteur' }, format(avant));
  return enFile(() => superposition({
    classe: 'celebration-paiement',
    duree: 2800,
    contenu: h('div', { class: 'scene-paiement' },
      h('p', { class: 'etiquette' }, "Chiffre d'affaires encaissé ce mois"),
      compteur,
      h('p', { class: 'celebration-sous-titre' }, 'Facture payée, merci Charles !')),
    animer: (m) => {
      animerCompteur(compteur, avant, apres, { duree: 1600, format });
      return [setInterval(() => m.pluie(8), 60)];
    },
  }));
}

/** Objectif atteint : feu d'artifice et "Objectif atteint : <libellé>". */
export function celebrerObjectif(libelle) {
  if (reduireAnimations()) return Promise.resolve();
  return enFile(() => superposition({
    classe: 'celebration-objectif',
    duree: 2600,
    contenu: h('div', { class: 'scene-objectif' },
      h('p', { class: 'celebration-titre' }, `Objectif atteint : ${libelle}`)),
    animer: (m) => [
      setTimeout(() => m.gerbe(0.3, 0.3, 80), 50),
      setTimeout(() => m.gerbe(0.7, 0.25, 80), 500),
      setTimeout(() => m.gerbe(0.5, 0.2, 100), 1000),
    ],
  }));
}

/** Dernière action du jour faite : petite animation de Charles (non bloquante). */
export function charlesContent(message = 'Tout est fait pour aujourd’hui') {
  if (reduireAnimations()) return;
  document.querySelector('.charles-content')?.remove();
  const bulle = h('div', { class: 'charles-content', role: 'status' },
    h('img', { src: AVATAR_CHARLES, alt: '', width: '512', height: '384' }),
    h('span', {}, message));
  bulle.addEventListener('click', () => bulle.remove());
  document.body.append(bulle);
  setTimeout(() => bulle.classList.add('sortie'), 2600);
  setTimeout(() => bulle.remove(), 3000);
}

/** Compteur qui défile de `de` à `a`. */
export function animerCompteur(el, de, a, { duree = 900, format = (n) => String(Math.round(n)) } = {}) {
  if (!el) return;
  if (reduireAnimations() || de === a) { el.textContent = format(a); return; }
  const debut = performance.now();
  function pas(t) {
    const x = Math.min(1, (t - debut) / duree);
    const lisse = 1 - Math.pow(1 - x, 3);
    el.textContent = format(de + (a - de) * lisse);
    if (x < 1 && el.isConnected) requestAnimationFrame(pas);
    else el.textContent = format(a);
  }
  requestAnimationFrame(pas);
}
