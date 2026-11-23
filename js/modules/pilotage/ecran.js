// Écran du Pilotage : une grille de cartes, une par tuile (titre + graphique ECharts). Trois états : chargement, vide, erreur (avec « Réessayer »).
// ECharts est chargé À LA DEMANDE (import dynamique, jamais depuis index.js) : l'Accueil et les autres écrans ne le téléchargent pas.
// Un seul appel au serveur par affichage (ou par clic sur « Actualiser » / « Réessayer ») ; aucun cache.
import { h, icone, remplir } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { creerGraphique } from './habillage.js';

const chargerEcharts = () => import('../../../assets/vendor/echarts/echarts.esm.min.js');

const chargement = () => h('div', { class: 'chargement-bloc', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement'));

/** Monte l'écran dans `conteneur` ; renvoie la fonction qui libère les graphiques et les observateurs (appelée à la sortie de l'écran). */
export function rendreEcran(conteneur, { lire = D.lireTableau, charger = chargerEcharts } = {}) {
  const titre = h('h1', {}, L.TITRE_PAGE);
  const actualiser = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'actualiser' }, onclick: () => lancer() }, icone('refresh-cw', { taille: 16 }), 'Actualiser');
  const zone = h('div', { class: 'pilotage-zone', 'aria-live': 'polite' });
  conteneur.append(h('div', { class: 'page page-pilotage' }, h('header', { class: 'page-tete' }, titre, h('div', { class: 'pilotage-actions' }, actualiser)), zone));

  let graphiques = []; // [{ instance, element, tuile }]
  let reponse = null;
  let numero = 0; // une réponse tardive d'un ancien appel est ignorée
  let ferme = false;

  const liberer = () => { graphiques.forEach((g) => { try { g.instance.dispose(); } catch (e) { console.warn(e); } }); graphiques = []; };

  const observateurTaille = typeof ResizeObserver === 'function' ? new ResizeObserver(() => graphiques.forEach((g) => { try { g.instance.resize(); } catch (e) { console.warn(e); } })) : null;
  observateurTaille?.observe(zone);
  // Le canvas ne lit pas le CSS : au changement de thème (ou de couleur de marque), les graphiques sont redessinés avec les couleurs relues, sans nouvel appel.
  const observateurTheme = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (reponse && !ferme) dessiner(reponse); }) : null;
  observateurTheme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-marque'] });

  function erreur(message, nonBranche) {
    liberer();
    titre.textContent = L.TITRE_PAGE;
    remplir(zone, h('div', { class: 'etat-vide', role: 'alert', dataset: { etat: nonBranche ? 'non-branche' : 'erreur' } },
      h('p', {}, message),
      nonBranche ? null : h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => lancer() }, 'Réessayer')));
  }

  async function dessiner(r) {
    const mon = numero;
    liberer();
    titre.textContent = L.titreDePage(r);
    if (r.vide) { remplir(zone, h('div', { class: 'etat-vide', dataset: { etat: 'vide' } }, h('p', {}, L.MESSAGE_VIDE))); return; }
    const liste = L.cartes(r);
    const grille = h('div', { class: 'pilotage-grille' });
    const aDessiner = [];
    for (const c of liste) {
      const corps = h('div', { class: 'pilotage-corps' });
      if (c.genre === 'erreur') corps.append(h('p', { class: 'aide', role: 'alert' }, L.MESSAGE_TUILE_ERREUR));
      else if (c.genre === 'vide') corps.append(h('p', { class: 'aide' }, L.MESSAGE_TUILE_VIDE));
      else { corps.classList.add('pilotage-graphique'); aDessiner.push({ c, corps }); }
      grille.append(h('section', { class: 'carte-section pilotage-carte', dataset: { tuile: c.id, genre: c.genre } }, h('h2', {}, c.titre), corps));
    }
    const bandeau = liste.some((c) => c.genre === 'erreur')
      ? h('div', { class: 'pilotage-bandeau', role: 'alert' }, h('span', {}, 'Certaines tuiles n\'ont pas pu être lues.'), h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => lancer() }, 'Réessayer'))
      : null;
    remplir(zone, bandeau, grille);
    if (!aDessiner.length) return;
    let echarts;
    try { echarts = await charger(); } catch (e) { console.warn(e); if (mon === numero && !ferme) erreur('Les graphiques ne se chargent pas pour l\'instant.', false); return; }
    if (mon !== numero || ferme) return;
    for (const { c, corps } of aDessiner) {
      try {
        const instance = creerGraphique(echarts, corps);
        graphiques.push({ instance, element: corps, tuile: c.id });
        instance.setOption(L.optionFinale(c.tuile.option, c.tuile.lignes));
      } catch (e) {
        console.warn('tuile non dessinée', c.id, e?.message);
        const g = graphiques.find((x) => x.element === corps);
        try { g?.instance.dispose(); } catch { /* déjà libéré */ }
        graphiques = graphiques.filter((x) => x.element !== corps);
        corps.classList.remove('pilotage-graphique');
        corps.dataset.invalide = '1';
        remplir(corps, h('p', { class: 'aide', role: 'alert' }, L.MESSAGE_TUILE_INVALIDE));
      }
    }
  }

  async function lancer() {
    const mon = ++numero;
    actualiser.disabled = true;
    remplir(zone, chargement());
    try {
      const r = await lire();
      if (mon !== numero || ferme) return;
      reponse = r;
      await dessiner(r);
    } catch (e) {
      if (mon !== numero || ferme) return;
      reponse = null;
      erreur(e?.message || 'Le tableau ne se charge pas pour l\'instant.', !!e?.nonBranche);
    } finally {
      if (mon === numero) actualiser.disabled = false;
    }
  }

  lancer();
  return () => { ferme = true; numero += 1; observateurTaille?.disconnect(); observateurTheme?.disconnect(); liberer(); };
}
