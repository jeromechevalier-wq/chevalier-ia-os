// Lecteur de PDF de la page Examiner (PR 8b, porté de PdfPages.tsx et ZonePdf de l'appli BTP). pdf.js est VENDU dans assets/vendor/pdfjs/ (version et licence dans LISEZMOI.txt) et chargé à la demande :
// jamais depuis un CDN, aucune adresse écrite ici. L'adresse du PDF vient de `lienPdf(chemin)` (lien temporaire signé par la base), renouvelée avant son expiration.
// Les pages sont dessinées en images (canvas) à la largeur de la zone, nettes sur écran dense ; zoom 50 à 300 %, glisser la feuille à la souris, double-clic (ou double-appui) pour zoomer.
// Cas : lien impossible ou PDF illisible = message clair + « Réessayer » ; aucun PDF rattaché = message sans bouton. Les réponses tardives d'un lien ou d'un document remplacé sont ignorées (numéro de chargement).
import { h, icone, remplir } from '../../os/ui.js';
import { positionApresGlissement, defilementApresZoom, estDoubleAppui, zoomApresDoubleClic, ZOOM_MIN, ZOOM_MAX } from './pdf-deplacement.js';

const PAS = 0.25;
const RENOUVELLEMENT_MS = 8 * 60 * 1000;
let promessePdfjs = null;

/** Charge la bibliothèque vendue (une seule fois). */
function chargerPdfjs() {
  if (!promessePdfjs) {
    promessePdfjs = import('../../../assets/vendor/pdfjs/pdf.min.js').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../../../assets/vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
      return m;
    }).catch((e) => { promessePdfjs = null; throw e; });
  }
  return promessePdfjs;
}

/**
 * Zone du PDF. `chemin` : chemin du fichier dans la base (null = aucun PDF rattaché). `lienPdf(chemin)` : promesse d'une adresse signée.
 * Renvoie { element, arreter }.
 */
export function creerZonePdf({ chemin, lienPdf }) {
  const racine = h('div', { class: 'pdf-zone', dataset: { role: 'zone-pdf' } });
  let vivant = true;
  let numero = 0; // chaque (re)chargement prend un numéro : la réponse d'un chargement plus ancien est ignorée
  let minuteur = null;
  let session = null; // { doc, tache, arreter }

  const message = (titre, detail, surReessayer) => h('div', { class: 'pdf-indispo', role: 'alert', dataset: { etat: 'pdf-indisponible' } },
    icone('triangle-alert', { taille: 28 }),
    h('p', {}, h('b', {}, titre)),
    detail ? h('p', { class: 'aide' }, detail) : null,
    surReessayer ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-pdf' }, onclick: surReessayer }, icone('refresh-cw', { taille: 16 }), 'Réessayer') : null);
  const chargementPdf = () => h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement-pdf' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement du PDF…'));

  function fermerSession() {
    if (session) { session.arreter(); session = null; }
  }

  async function demarrer() {
    const mon = ++numero;
    window.clearTimeout(minuteur);
    fermerSession();
    if (!chemin) { remplir(racine, message('Aucun PDF dans ce courriel.', 'Aucun fichier n’est rattaché à cette facture.', null)); return; }
    remplir(racine, chargementPdf());
    let url;
    try { url = await lienPdf(chemin); } catch {
      if (!vivant || mon !== numero) return;
      remplir(racine, message('Le PDF n’est pas disponible.', 'Il est introuvable ou le lien a expiré.', demarrer));
      return;
    }
    if (!vivant || mon !== numero) return;
    // Le lien est renouvelé avant son expiration (pour « Ouvrir dans un nouvel onglet » et pour recharger) ; le document déjà ouvert n'est pas rechargé.
    minuteur = window.setTimeout(() => { lienPdf(chemin).then((u) => { if (vivant && mon === numero) lien.href = u; }).catch(() => {}); }, RENOUVELLEMENT_MS);
    const lien = h('a', { class: 'pdf-lien', href: url, target: '_blank', rel: 'noopener noreferrer' }, icone('external-link', { taille: 16 }), 'Ouvrir le PDF dans un nouvel onglet');
    let pdfjs;
    try { pdfjs = await chargerPdfjs(); } catch {
      if (!vivant || mon !== numero) return;
      remplir(racine, message('Le lecteur de PDF n’a pas pu démarrer.', 'Recharge la page, ou ouvre le PDF dans un nouvel onglet.', demarrer), h('div', { class: 'pdf-outils' }, lien));
      return;
    }
    if (!vivant || mon !== numero) return;
    const tache = pdfjs.getDocument({ url });
    let doc;
    try { doc = await tache.promise; } catch (e) {
      console.warn("PDF illisible", e?.name, e?.message);
      tache.destroy?.();
      if (!vivant || mon !== numero) return;
      remplir(racine, message('Le PDF n’a pas pu être lu.', 'Il est abîmé, introuvable, ou le lien a expiré.', demarrer), h('div', { class: 'pdf-outils' }, lien));
      return;
    }
    if (!vivant || mon !== numero) { tache.destroy?.(); return; }
    session = montrerDocument(doc, tache, lien, () => { if (vivant && mon === numero) remplir(racine, message('Le PDF n’a pas pu être lu.', 'Il est abîmé, introuvable, ou le lien a expiré.', demarrer), h('div', { class: 'pdf-outils' }, lien)); });
  }

  /** Dessine le document : barre d'outils (lien, zoom) et pages empilées. Renvoie { arreter }. */
  function montrerDocument(doc, tache, lien, surEchec) {
    let zoom = 1;
    let largeur = 0;
    let rendus = []; // tâches de dessin en cours
    let a = true;
    const colonne = h('div', { class: 'pdf-defilement', tabIndex: 0, role: 'region', 'aria-label': 'Facture en PDF', dataset: { role: 'pdf-defilement' } });
    const pages = h('div', { class: 'pdf-pages' });
    const zoomTexte = h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'zoom-100' }, onclick: () => definirZoom(1) });
    const moins = h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'aria-label': 'Réduire', dataset: { action: 'zoom-moins' }, onclick: () => changer(-PAS) }, '−');
    const plus = h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'aria-label': 'Agrandir', dataset: { action: 'zoom-plus' }, onclick: () => changer(PAS) }, '+');
    colonne.append(pages);
    const canvas = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const c = h('canvas', { class: 'pdf-page', role: 'img', 'aria-label': `Page ${i} de la facture`, dataset: { page: String(i) } });
      canvas.push(c); pages.append(c);
    }
    remplir(racine, h('div', { class: 'pdf-visionneuse' }, h('div', { class: 'pdf-outils' }, lien, h('span', { class: 'pdf-zoom' }, moins, zoomTexte, plus)), colonne));

    const majOutils = () => {
      zoomTexte.textContent = `${Math.round(zoom * 100)} %`;
      zoomTexte.setAttribute('aria-label', `Zoom ${Math.round(zoom * 100)} % : revenir à 100 %`);
      moins.disabled = zoom <= ZOOM_MIN; plus.disabled = zoom >= ZOOM_MAX;
    };

    function dessiner() {
      if (!a || largeur <= 0) return;
      for (const t of rendus) { try { t.cancel(); } catch { /* déjà fini */ } }
      rendus = [];
      const cible = Math.floor(largeur * zoom);
      pages.style.width = `${cible}px`;
      canvas.forEach((c, i) => {
        doc.getPage(i + 1).then((page) => {
          if (!a || cible !== Math.floor(largeur * zoom)) return;
          const base = page.getViewport({ scale: 1 });
          const echelle = cible / base.width;
          const dpr = window.devicePixelRatio || 1;
          const vue = page.getViewport({ scale: echelle * dpr });
          c.width = Math.floor(vue.width); c.height = Math.floor(vue.height);
          c.style.width = `${cible}px`;
          c.style.aspectRatio = `1 / ${base.height / base.width}`;
          const t = page.render({ canvas: c, viewport: vue });
          rendus.push(t);
          t.promise.catch(() => {});
        }).catch((e) => { console.warn("PDF page illisible", e?.name, e?.message); if (a && i === 0) surEchec(); });
      });
    }

    function definirZoom(z, point = null) {
      const avant = { zoom, gauche: colonne.scrollLeft, haut: colonne.scrollTop };
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
      majOutils();
      dessiner();
      if (point) {
        const page = colonne.querySelector('.pdf-page');
        const geometrie = page && largeur > 0 ? { largeur, hauteurPage: page.offsetHeight / avant.zoom, vue: colonne.clientWidth, ecart: parseFloat(getComputedStyle(pages).rowGap) || 0 } : undefined;
        // Le défilement est calculé après la mise en page du nouveau zoom (les canvas gardent leur rapport hauteur / largeur).
        requestAnimationFrame(() => {
          const p = defilementApresZoom(avant, point, zoom, { x: colonne.scrollWidth - colonne.clientWidth, y: colonne.scrollHeight - colonne.clientHeight }, geometrie);
          colonne.scrollLeft = p.gauche; colonne.scrollTop = p.haut;
        });
      }
    }
    const changer = (d) => definirZoom(zoom + d);
    const zoomerSur = (x, y) => {
      const r = colonne.getBoundingClientRect();
      definirZoom(zoomApresDoubleClic(zoom), { x: x - r.left, y: y - r.top });
      window.getSelection()?.removeAllRanges();
    };

    // Taille de la zone : on redessine (avec un petit délai) quand elle change.
    let delai = null;
    const mesurer = () => { const l = Math.floor(colonne.clientWidth); if (l !== largeur) { largeur = l; dessiner(); } };
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { window.clearTimeout(delai); delai = window.setTimeout(mesurer, 120); }) : null;
    obs?.observe(colonne);
    requestAnimationFrame(mesurer);
    majOutils();

    // La molette ne piège jamais le défilement : au bout (ou tout en haut) du PDF, elle fait défiler la page.
    colonne.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      const auBout = e.deltaY > 0 && colonne.scrollTop + colonne.clientHeight >= colonne.scrollHeight - 1;
      const enHaut = e.deltaY < 0 && colonne.scrollTop <= 0;
      if (!auBout && !enHaut) return;
      e.preventDefault();
      window.scrollBy({ top: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY });
    }, { passive: false });

    // Glisser la feuille comme une carte (souris). Au doigt et au stylet, c'est le navigateur qui fait défiler ; on ne garde que le double-appui.
    const surAscenseur = (e) => { const r = colonne.getBoundingClientRect(); return e.clientX - r.left >= colonne.clientWidth || e.clientY - r.top >= colonne.clientHeight; };
    let glisse = null; let doigt = null; let dernierAppui = null;
    const finGlisse = (e) => { glisse = null; colonne.classList.remove('pdf-saisie'); try { if (colonne.hasPointerCapture(e.pointerId)) colonne.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ } };
    colonne.addEventListener('pointerdown', (e) => {
      if (surAscenseur(e)) return;
      if (e.pointerType !== 'mouse') { doigt = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
      if (e.button !== 0) return;
      glisse = { id: e.pointerId, x: e.clientX, y: e.clientY, gauche: colonne.scrollLeft, haut: colonne.scrollTop };
      try { colonne.setPointerCapture(e.pointerId); } catch { /* le glissement marche aussi sans capture */ }
      colonne.classList.add('pdf-saisie');
    });
    colonne.addEventListener('pointermove', (e) => {
      if (!glisse || glisse.id !== e.pointerId) return;
      if (e.buttons === 0) { finGlisse(e); return; }
      const p = positionApresGlissement(glisse, { x: e.clientX, y: e.clientY }, { x: colonne.scrollWidth - colonne.clientWidth, y: colonne.scrollHeight - colonne.clientHeight });
      colonne.scrollLeft = p.gauche; colonne.scrollTop = p.haut;
    });
    const relache = (e) => {
      if (doigt?.id === e.pointerId) {
        const d = doigt; doigt = null;
        if (e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) {
          const appui = { t: e.timeStamp, x: e.clientX, y: e.clientY };
          if (estDoubleAppui(dernierAppui, appui)) { dernierAppui = null; zoomerSur(e.clientX, e.clientY); } else dernierAppui = appui;
        }
        return;
      }
      if (glisse?.id === e.pointerId) finGlisse(e);
    };
    colonne.addEventListener('pointerup', relache);
    colonne.addEventListener('pointercancel', relache);
    colonne.addEventListener('dblclick', (e) => { if (!surAscenseur(e)) zoomerSur(e.clientX, e.clientY); });
    colonne.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); changer(PAS); } else if (e.key === '-') { e.preventDefault(); changer(-PAS); } else if (e.key === '0') { e.preventDefault(); definirZoom(1); }
    });

    return {
      arreter() {
        a = false; window.clearTimeout(delai); obs?.disconnect();
        for (const t of rendus) { try { t.cancel(); } catch { /* déjà fini */ } }
        try { tache.destroy?.(); } catch { /* déjà détruit */ }
      },
    };
  }

  void demarrer();
  return { element: racine, arreter() { vivant = false; window.clearTimeout(minuteur); fermerSession(); } };
}
