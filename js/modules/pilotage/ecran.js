// Écran du Tableau de bord : une barre d'onglets (si le réglage en a), puis des cartes, une par tuile : grand chiffre, tableau, texte, phrases ou graphique ECharts.
// Trois états : chargement, vide, erreur (avec « Réessayer »). ECharts est chargé À LA DEMANDE (import dynamique, jamais depuis index.js) et seulement si une tuile est un graphique.
// Un seul appel au serveur par affichage d'onglet (ou par clic sur « Actualiser » / « Réessayer ») ; aucun cache. Le serveur ne lit que l'onglet demandé.
import { h, icone, iconeInfo, remplir } from '../../os/ui.js';
import { barreOnglets } from '../../os/onglets.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import * as B from './blocs.js';
import { creerGraphique, lireCouleursNommees } from './habillage.js';

const chargerEcharts = () => import('../../../assets/vendor/echarts/echarts.esm.min.js');
const ROUTE_ECRAN = 'pilotage/pilotage';

const chargement = () => h('div', { class: 'chargement-bloc', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement'));

/** Monte l'écran dans `conteneur` ; `onglet` = identifiant de l'onglet de l'adresse (facultatif). Renvoie la fonction qui libère les graphiques et les observateurs (appelée à la sortie de l'écran). */
export function rendreEcran(conteneur, { lire = D.lireTableau, charger = chargerEcharts, onglet = null } = {}) {
  const titre = h('h1', {}, L.TITRE_PAGE);
  const actualiser = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'actualiser' }, onclick: () => lancer() }, icone('refresh-cw', { taille: 16 }), 'Actualiser');
  const pleinEcran = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'plein-ecran' }, 'aria-pressed': 'false', onclick: () => basculerPleinEcran() }, icone('maximize', { taille: 16 }), 'Plein écran');
  const navigation = h('div', { class: 'pilotage-navigation' });
  const zone = h('div', { class: 'pilotage-zone', 'aria-live': 'polite' });
  const racine = h('div', { class: 'page page-pilotage' }, h('header', { class: 'page-tete' }, titre, h('div', { class: 'pilotage-actions' }, actualiser, pleinEcran)), navigation, zone);
  conteneur.append(racine);

  let graphiques = []; // [{ instance, element, tuile }]
  let reponse = null;
  let ongletDemande = onglet || null;
  let numero = 0; // un compteur par APPEL au serveur : la réponse tardive d'un ancien appel est ignorée
  let dessin = 0; // un compteur par DESSIN : un dessin plus ancien (import d'ECharts en cours) s'arrête quand un nouveau commence
  let appelEnCours = false;
  let echartsCharge = false;
  let ferme = false;
  let plein = false;

  const sectionsParId = new Map(); // id de section -> élément (pour les pastilles)
  const sortirNatif = () => { try { document.exitFullscreen()?.catch?.(() => {}); } catch (e) { console.warn(e); } };
  const liberer = () => { graphiques.forEach((g) => { try { g.instance.dispose(); } catch (e) { console.warn(e); } }); graphiques = []; };
  const redimensionner = () => graphiques.forEach((g) => { try { g.instance.resize(); } catch (e) { console.warn(e); } });

  // ----- Plein écran : API Fullscreen si elle existe (pas sur Safari iPhone), sinon (ou si elle refuse) plein fenêtre par le CSS ; Échap quitte dans les deux cas -----
  function majPleinEcran() {
    racine.classList.toggle('pilotage-plein', plein);
    pleinEcran.setAttribute('aria-pressed', String(plein));
    remplir(pleinEcran, icone(plein ? 'minimize' : 'maximize', { taille: 16 }), plein ? 'Quitter le plein écran' : 'Plein écran');
    redimensionner();
  }
  async function basculerPleinEcran() {
    if (appelEnCours) return;
    if (plein) { sortirPleinEcran(); return; }
    plein = true;
    majPleinEcran();
    if (typeof racine.requestFullscreen === 'function') { try { await racine.requestFullscreen(); } catch (e) { console.warn('plein écran natif refusé, plein fenêtre', e?.message); } }
  }
  function sortirPleinEcran() {
    if (!plein) return;
    plein = false;
    if (document.fullscreenElement === racine) sortirNatif();
    majPleinEcran();
  }
  // Échap en plein écran natif ne déclenche pas « keydown » : c'est `fullscreenchange` qui prévient. En repli CSS, c'est « keydown ».
  const surChangementPleinEcran = () => { if (plein && !document.fullscreenElement && racine.requestFullscreen) { plein = false; majPleinEcran(); } };
  const surTouche = (e) => { if (e.key === 'Escape' && plein) sortirPleinEcran(); };
  document.addEventListener('fullscreenchange', surChangementPleinEcran);
  document.addEventListener('keydown', surTouche);

  const observateurTaille = typeof ResizeObserver === 'function' ? new ResizeObserver(redimensionner) : null;
  observateurTaille?.observe(zone);
  // Le canvas ne lit pas le CSS : au changement de thème (ou de couleur de marque), les graphiques sont redessinés avec les couleurs relues, sans nouvel appel.
  // Ignoré pendant un appel en cours et tant qu'ECharts n'est pas chargé (le dessin en attente utilisera de toute façon les couleurs du moment).
  const observateurTheme = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (reponse && !ferme && !appelEnCours && echartsCharge) dessinerEnSecurite(reponse); }) : null;
  observateurTheme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-marque'] });

  function erreur(message, nonBranche) {
    dessin += 1;
    liberer();
    titre.textContent = L.TITRE_PAGE;
    remplir(navigation);
    remplir(zone, h('div', { class: 'etat-vide', role: 'alert', dataset: { etat: nonBranche ? 'non-branche' : 'erreur' } },
      h('p', {}, message),
      nonBranche ? null : h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => lancer() }, 'Réessayer')));
  }

  function carteDe(c, titreDe = 'h2') {
    const t = c.tuile;
    const corps = h('div', { class: 'pilotage-corps' });
    let aDessiner = false;
    if (c.genre === 'erreur') corps.append(h('p', { class: 'aide', role: 'alert' }, L.MESSAGE_TUILE_ERREUR));
    else if (c.genre === 'invalide') corps.append(h('p', { class: 'aide', role: 'alert' }, L.MESSAGE_TUILE_INVALIDE));
    else if (c.genre === 'vide') corps.append(h('p', { class: 'aide' }, L.MESSAGE_TUILE_VIDE));
    else if (c.genre === 'graphique') { corps.classList.add('pilotage-graphique'); aDessiner = true; }
    else if (c.genre === 'chiffre') corps.append(B.rendreChiffre(t));
    else if (c.genre === 'tableau') corps.append(B.rendreTableau(t));
    else if (c.genre === 'phrases') corps.append(B.rendrePhrases(t));
    else if (c.genre === 'texte') corps.append(B.rendreTexte(t));
    const aide = t?.aide ? iconeInfo(t.aide, c.titre) : null;
    const type = t?.type ?? 'graphique';
    const section = h('section', { class: `carte-section pilotage-carte pilotage-l-${t?.largeur ?? 'moitie'} pilotage-t-${type}`, dataset: { tuile: c.id, genre: c.genre, type } },
      h('div', { class: 'pilotage-carte-tete' }, h(titreDe, {}, c.titre), aide), corps);
    return { section, corps, aDessiner, c };
  }

  function barre(p) {
    if (!p.onglets.length) { remplir(navigation); return; }
    remplir(navigation, barreOnglets({
      onglets: p.onglets.map((o) => ({ route: `${ROUTE_ECRAN}/${o.id}`, libelle: o.titre, id: o.id })),
      actif: `${ROUTE_ECRAN}/${p.actif.id}`, etiquette: 'Onglets du tableau de bord', classeBarre: 'pilotage-onglets',
    }));
  }

  /** Pastilles de navigation rapide d'un onglet à sections : un bouton par section, qui fait défiler jusqu'à elle (jamais d'onglets imbriqués, jamais de changement d'adresse). */
  function pastilles(blocs) {
    const sections = blocs.filter((b) => b.section);
    if (sections.length < 2) return null;
    return h('nav', { class: 'pilotage-pastilles', 'aria-label': 'Aller à une section' }, ...sections.map((b) => h('button', {
      type: 'button', class: 'pilotage-pastille', dataset: { section: b.section.id },
      onclick: () => sectionsParId.get(b.section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }, b.section.titre)));
  }

  async function dessiner(r) {
    const mon = ++dessin;
    liberer();
    titre.textContent = L.titreDePage(r);
    if (r.vide) { remplir(navigation); remplir(zone, h('div', { class: 'etat-vide', dataset: { etat: 'vide' } }, h('p', {}, L.MESSAGE_VIDE))); return; }
    const p = L.plan(r);
    barre(p);
    const aDessiner = [];
    sectionsParId.clear();
    const blocs = p.blocs.map((b) => {
      const grille = h('div', { class: 'pilotage-grille' });
      for (const c of b.cartes) {
        const carte = carteDe(c, b.section ? 'h3' : 'h2'); // sous un titre de section (h2), les titres de cartes sont des h3
        if (carte.aDessiner) aDessiner.push({ c, corps: carte.corps });
        grille.append(carte.section);
      }
      if (!b.section) return grille;
      const el = h('section', { class: 'pilotage-section', dataset: { sectionBloc: b.section.id } },
        h('h2', { class: 'pilotage-section-titre' }, b.section.titre), b.section.intro ? h('p', { class: 'aide pilotage-intro' }, b.section.intro) : null, grille);
      sectionsParId.set(b.section.id, el);
      return el;
    });
    const bandeau = p.blocs.some((b) => b.cartes.some((c) => c.genre === 'erreur'))
      ? h('div', { class: 'pilotage-bandeau', role: 'alert' }, h('span', {}, 'Certaines tuiles n\'ont pas pu être lues.'), h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => lancer() }, 'Réessayer'))
      : null;
    remplir(zone, bandeau, p.intro ? h('p', { class: 'aide pilotage-intro', dataset: { role: 'intro-onglet' } }, p.intro) : null, pastilles(p.blocs), ...blocs);
    if (!aDessiner.length) return;
    let echarts;
    try { echarts = await charger(); } catch (e) { console.warn(e); if (mon === dessin && !ferme) erreur('Les graphiques ne se chargent pas pour l\'instant.', false); return; }
    echartsCharge = true;
    if (mon !== dessin || ferme) return;
    const couleurs = lireCouleursNommees();
    for (const { c, corps } of aDessiner) {
      try {
        const instance = creerGraphique(echarts, corps);
        graphiques.push({ instance, element: corps, tuile: c.id });
        instance.setOption(L.optionFinale(c.tuile.option, c.tuile.lignes, { formats: c.tuile.formats, couleurs }));
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

  /** Dessine sans jamais laisser une exception sortir ni afficher un texte technique : message générique avec « Réessayer ». */
  async function dessinerEnSecurite(r) {
    try { await dessiner(r); } catch (e) {
      console.warn('Pilotage : dessin impossible', e?.message);
      if (!ferme) erreur('Cette tuile n\'a pas pu être dessinée.', false);
    }
  }

  async function lancer() {
    const mon = ++numero;
    dessin += 1; // un dessin en cours d'un ancien appel s'arrête
    appelEnCours = true;
    actualiser.disabled = true;
    pleinEcran.disabled = true;
    remplir(zone, chargement());
    try {
      let r;
      try { r = await lire(ongletDemande ? { onglet: ongletDemande } : undefined); } catch (e) {
        if (mon !== numero || ferme) return;
        if (e?.ongletInconnu && ongletDemande) { // adresse périmée (onglet retiré du réglage) : on rouvre le premier onglet
          ongletDemande = null;
          appelEnCours = false;
          lancer();
          return;
        }
        reponse = null;
        erreur(e?.message || 'Ça n\'a pas abouti. Réessaie dans un instant.', !!e?.nonBranche);
        return;
      }
      if (mon !== numero || ferme) return;
      reponse = r;
      appelEnCours = false;
      await dessinerEnSecurite(r);
    } finally {
      if (mon === numero) { appelEnCours = false; actualiser.disabled = false; pleinEcran.disabled = false; }
    }
  }

  lancer();
  const liberation = () => {
    ferme = true; numero += 1; dessin += 1;
    document.removeEventListener('fullscreenchange', surChangementPleinEcran);
    document.removeEventListener('keydown', surTouche);
    if (document.fullscreenElement === racine) sortirNatif();
    observateurTaille?.disconnect(); observateurTheme?.disconnect(); liberer();
  };
  /** Un autre onglet (l'adresse a changé) : une nouvelle lecture de CET onglet, sans quitter l'écran (le plein écran reste). */
  liberation.changerOnglet = (id) => {
    const voulu = id || null;
    if (voulu === ongletDemande || (voulu && voulu === reponse?.onglet)) return; // déjà affiché (y compris l'onglet par défaut) : pas d'appel inutile
    ongletDemande = voulu;
    racine.scrollTop = 0; conteneur.scrollTop = 0; // un autre onglet commence en haut
    lancer();
  };
  liberation.monte = () => !ferme && racine.isConnected;
  return liberation;
}
