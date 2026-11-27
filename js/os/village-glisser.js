// Gestes sur les maisons du village rangé (étape 2 de docs/accueil-village.md, 27/11/2026) : glisser (souris et doigt), simple clic, double clic, appui long.
// Événements de pointeur seulement (pointerdown, pointermove, pointerup, pointercancel, setPointerCapture) : le même code pour la souris et le doigt.
//  - Appui sur une maison (ou son étiquette) puis mouvement de plus de 6 px (souris) ou 10 px (doigt) : mode rangement ; la maison suit le pointeur et le bloc visé
//    est coloré (vert : libre ; rouge : pris ou hors du damier). Relâcher sur un bloc libre : surDepose(maison, c, l). Sinon (ou pointercancel, ou Échap) : elle revient.
//  - Après un glisser ou un appui long, le clic qui suit est avalé (écoute en phase de capture) : un glisser n'ouvre jamais la maison.
//  - Ordinateur : un simple clic ouvre après 280 ms (le temps de voir s'il y a un second clic) ; un double clic ouvre les réglages de la maison.
//  - Téléphone : un toucher passe tout de suite à surOuvrir (l'écran montre la bulle puis entre, comme avant) ; un appui long (600 ms sans bouger) : les réglages.
//  - Un lien externe (<a> SVG, étape 3b) : son clic natif est toujours empêché ; l'écran l'ouvre lui-même (window.open, nouvel onglet).
//  - Entrée ou Espace : gérés par l'écran (ouverture immédiate). Pas de déplacement au clavier (décision du 27/11/2026).
//  - Petites maisons (étape 3c) : elles ne se glissent pas (un mouvement annule l'appui long, rien ne bouge) ; elles suivent leur grande pendant son glisser
//    (tout ce qui porte `data-parent="<id de la grande>"` bouge avec elle). Clic, double clic et appui long passent à l'écran, qui décide.
import { iso } from './village-batiments.js';
import { ecranVersGrille, blocSousPoint, centreBloc, blocLibre, occupation, losangeBloc } from './village-damier.js';

const NS = 'http://www.w3.org/2000/svg';
export const DELAI_CLIC = 280;
export const DELAI_APPUI_LONG = 600;
const SEUIL = Object.freeze({ mouse: 6, pen: 6, touch: 10 });
const VERT = '#6FA24A';
const ROUGE = '#E4572E';

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Branche les gestes sur le dessin `svg` (déjà dans la page). `maisons` : les maisons dessinées ; chaque groupe d'une maison porte `data-maison="<id>"`.
 * Rend une fonction qui débranche tout (timers compris).
 */
export function brancherGestes(svg, { maisons, petites = [], damier, telephone, surOuvrir, surReglages, surDepose, surDebut, surFin }) {
  const parId = new Map([...maisons, ...petites].map((m) => [m.id, m]));
  let geste = null; // { maison, id, pointeur, type, x0, y0, p0, glisse, bloc, minuteurLong }
  let avaler = false;
  let minuteurAvaler = null;
  let minuteurClic = null;

  const maisonSous = (cible) => {
    const g = cible?.closest?.('.village-batiment[data-maison], .village-lien-etiquette[data-maison]');
    return g ? parId.get(g.getAttribute('data-maison')) : null;
  };
  const groupes = (id) => [...svg.querySelectorAll(`[data-maison="${CSS.escape(id)}"], [data-parent="${CSS.escape(id)}"]`)];
  const versDessin = (e) => {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const avalerProchainClic = () => {
    avaler = true;
    clearTimeout(minuteurAvaler);
    minuteurAvaler = setTimeout(() => { avaler = false; }, 600);
  };

  // Après un appui long, la fenêtre s'ouvre SOUS le doigt : le clic que le navigateur envoie au lever du doigt ne doit pas toucher un de ses boutons
  // (3c : une maison au milieu de l'écran, « Retirer du village » juste dessous). Seul ce clic-là (même endroit, dans la seconde) est avalé.
  let avaleurDoigt = null;
  const oublierAvaleur = () => { if (avaleurDoigt) { document.removeEventListener('click', avaleurDoigt, true); avaleurDoigt = null; } };
  function avalerClicSousLeDoigt(x, y) {
    oublierAvaleur();
    const fin = Date.now() + 1000;
    avaleurDoigt = (e) => {
      const ici = Math.hypot(e.clientX - x, e.clientY - y) <= 12;
      if (Date.now() > fin || !ici) { if (Date.now() > fin) oublierAvaleur(); return; }
      oublierAvaleur();
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener('click', avaleurDoigt, true);
  }

  // Le bloc visé, coloré sur le sol (au-dessus du terrain, sous les maisons).
  const repere = document.createElementNS(NS, 'polygon');
  repere.setAttribute('data-role', 'cible-rangement');
  repere.setAttribute('opacity', '0.55');
  repere.setAttribute('pointer-events', 'none');
  const poserRepere = (bloc, libre) => {
    repere.setAttribute('points', losangeBloc(bloc.c, bloc.l, bloc.taille, damier).map(([x, y]) => `${r1(x)},${r1(y)}`).join(' '));
    repere.setAttribute('fill', libre ? VERT : ROUGE);
    repere.setAttribute('data-libre', libre ? 'oui' : 'non');
    if (!repere.isConnected) svg.querySelector('[data-role="damier"]')?.after(repere);
  };

  function arreterAppuiLong() { if (geste) { clearTimeout(geste.minuteurLong); geste.minuteurLong = null; } }

  function remettre() {
    if (!geste) return;
    for (const g of groupes(geste.id)) g.removeAttribute('transform');
    repere.remove();
  }

  function finir(depose) {
    if (!geste) return;
    const g = geste;
    arreterAppuiLong();
    try { if (svg.hasPointerCapture?.(g.pointeur)) svg.releasePointerCapture(g.pointeur); } catch { /* pointeur déjà parti */ }
    if (g.glisse) {
      avalerProchainClic();
      const bloc = g.bloc;
      remettre();
      geste = null;
      surFin?.();
      if (depose && bloc?.libre) surDepose(g.maison, bloc.c, bloc.l);
      return;
    }
    geste = null;
  }

  function surAppui(e) {
    if (e.button !== 0 || geste) return;
    const maison = maisonSous(e.target);
    if (!maison) return;
    // Au doigt, la lueur (halo) qui déborde sur l'herbe voisine ne prend pas la maison : le doigt y fait glisser le village (le toucher, lui, ouvre toujours).
    if (e.pointerType === 'touch' && e.target.closest?.('.village-halo')) return;
    const p0 = versDessin(e);
    if (!p0) return;
    geste = { maison, id: maison.id, pointeur: e.pointerId, type: e.pointerType || 'mouse', x0: e.clientX, y0: e.clientY, p0, glisse: false, bloc: null, minuteurLong: null, fixe: maison.sorte === 'petite' };
    if (geste.type === 'touch') {
      geste.minuteurLong = setTimeout(() => {
        if (!geste || geste.glisse) return;
        const m = geste.maison;
        const { x0, y0 } = geste;
        geste = null;
        avalerProchainClic();
        avalerClicSousLeDoigt(x0, y0);
        surReglages(m);
      }, DELAI_APPUI_LONG);
    }
  }

  function surMouvement(e) {
    if (!geste || e.pointerId !== geste.pointeur) return;
    if (!geste.glisse) {
      const seuil = SEUIL[geste.type] ?? 6;
      if (Math.hypot(e.clientX - geste.x0, e.clientY - geste.y0) <= seuil) return;
      arreterAppuiLong();
      if (geste.fixe) { geste = null; return; } // une petite maison ne se glisse pas : le geste s'arrête, rien ne bouge
      geste.glisse = true;
      try { svg.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      surDebut?.();
    }
    e.preventDefault();
    const p = versDessin(e);
    if (!p) return;
    const [dx, dy] = [p[0] - geste.p0[0], p[1] - geste.p0[1]];
    for (const g of groupes(geste.id)) g.setAttribute('transform', `translate(${r1(dx)} ${r1(dy)})`);
    // le centre de la maison suit le pointeur : centre d'origine + déplacement, ramené sur la grille
    const m = geste.maison;
    const [gx, gy] = centreBloc(m.c, m.l, m.taille, damier);
    const [cx, cy] = iso(gx, gy);
    const [vx, vy] = ecranVersGrille(cx + dx, cy + dy);
    const { c, l } = blocSousPoint(vx, vy, m.taille, damier);
    const libre = blocLibre(occupation(maisons), c, l, m.taille, damier, m.id);
    geste.bloc = { c, l, taille: m.taille, libre };
    poserRepere(geste.bloc, libre);
  }

  const surRelache = (e) => { if (geste && e.pointerId === geste.pointeur) finir(true); };
  const surAnnule = (e) => { if (geste && e.pointerId === geste.pointeur) finir(false); };
  const surTouche = (e) => { if (e.key === 'Escape' && geste?.glisse) { e.preventDefault(); finir(false); } };

  // Clic en phase de capture : avalé après un glisser ; sinon, sur une maison, l'écran ne voit plus le clic directement (délai et double clic ici).
  function surClic(e) {
    const maison = maisonSous(e.target);
    if (avaler) { avaler = false; e.stopPropagation(); e.preventDefault(); return; }
    if (!maison) return;
    e.stopPropagation();
    // Cmd, Ctrl ou Maj + clic sur le <a> d'un lien valable : le navigateur l'ouvre lui-même (onglet en arrière-plan, nouvelle fenêtre), rien d'autre.
    if (maison.sorte === 'lien' && !maison.invalide && (e.metaKey || e.ctrlKey || e.shiftKey) && e.target.closest?.('a[href]')) { clearTimeout(minuteurClic); minuteurClic = null; return; }
    e.preventDefault(); // la maison d'un lien externe est un <a> : jamais sa navigation native (l'écran l'ouvre lui-même, dans un nouvel onglet)
    if (telephone) { surOuvrir(maison); return; }
    clearTimeout(minuteurClic);
    minuteurClic = setTimeout(() => { minuteurClic = null; surOuvrir(maison); }, DELAI_CLIC);
  }
  function surDoubleClic(e) {
    const maison = maisonSous(e.target);
    if (!maison || telephone) return;
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(minuteurClic);
    minuteurClic = null;
    surReglages(maison);
  }
  // Safari et Firefox démarrent un glisser natif sur le <a> SVG d'un lien externe : il couperait notre glisser.
  const surGlisserNatif = (e) => { if (maisonSous(e.target)) e.preventDefault(); };
  // Appui long au doigt : pas de menu du navigateur sur une maison.
  const surMenu = (e) => { if (maisonSous(e.target)) e.preventDefault(); };
  // Chrome ignore `touch-action` sur les éléments à l'intérieur d'un SVG : sans cela, le cadre qui défile part en glisser et annule le geste
  // (pointercancel). Pendant un geste sur une maison, le défilement natif est bloqué ; toucher l'herbe fait toujours glisser le village.
  const surToucheBouge = (e) => { if (geste && e.cancelable) e.preventDefault(); };

  svg.addEventListener('pointerdown', surAppui);
  svg.addEventListener('pointermove', surMouvement);
  svg.addEventListener('pointerup', surRelache);
  svg.addEventListener('pointercancel', surAnnule);
  svg.addEventListener('click', surClic, true);
  svg.addEventListener('dblclick', surDoubleClic, true);
  svg.addEventListener('contextmenu', surMenu);
  svg.addEventListener('dragstart', surGlisserNatif);
  svg.addEventListener('touchmove', surToucheBouge, { passive: false });
  document.addEventListener('keydown', surTouche);
  return () => {
    // Un redessin pendant un glisser : la maison revient et l'écran sort du rangement (data-rangement ne reste jamais à « oui »).
    if (geste) { const glissait = geste.glisse; remettre(); arreterAppuiLong(); geste = null; if (glissait) surFin?.(); }
    clearTimeout(minuteurClic);
    clearTimeout(minuteurAvaler);
    svg.removeEventListener('pointerdown', surAppui);
    svg.removeEventListener('pointermove', surMouvement);
    svg.removeEventListener('pointerup', surRelache);
    svg.removeEventListener('pointercancel', surAnnule);
    svg.removeEventListener('click', surClic, true);
    svg.removeEventListener('dblclick', surDoubleClic, true);
    svg.removeEventListener('contextmenu', surMenu);
    svg.removeEventListener('dragstart', surGlisserNatif);
    svg.removeEventListener('touchmove', surToucheBouge);
    document.removeEventListener('keydown', surTouche);
  };
}
