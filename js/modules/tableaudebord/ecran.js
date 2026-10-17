// Écrans du module Tableau de bord, en LECTURE SEULE : « Général » (phrase d'état, compteurs, à traiter en premier) et « Technique »
// (un bloc par famille, avec filtres). Les onglets Finance et Stocks (même présentation que Technique) n'existent que si un indicateur les porte.
// Le niveau montré est recalculé ICI (échéance, relevé trop ancien) et chaque minute : un relevé qui vieillit devient gris sans rechargement.
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML). Aucune écriture, aucun bouton qui écrit.
import { h, remplir } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import * as D from './donnees.js';
import * as L from './logique.js';

export const MESSAGE_VIDE = 'Aucun indicateur pour l\'instant. Les relevés arrivent chaque jour, après le premier passage des scripts de surveillance.';
export const MESSAGE_CHARGEMENT = 'Chargement des indicateurs…';
export const MESSAGE_ERREUR = 'Impossible de lire les indicateurs pour le moment. Vérifie ta connexion à internet, puis clique sur « Réessayer ».';
export const MESSAGE_RIEN_A_TRAITER = 'Rien à traiter.';
const SANS_RESULTAT = 'Aucun indicateur pour ces filtres.';

// Filtres de l'écran Technique : gardés d'un onglet à l'autre tant que la page reste ouverte.
const filtres = { traiter: false, famille: '' };

// ---------------------------------------------------------------- pictogrammes (icône + mot : l'état n'est jamais montré par la couleur seule)
const SVG_NS = 'http://www.w3.org/2000/svg';
const CERCLE = '<circle cx="8" cy="8" r="7"/>';
const PICTOS = {
  vert: `${CERCLE}<path d="M4.8 8.4l2.2 2.2 4.2-4.6"/>`,
  orange: '<path d="M8 1.8l6.6 11.6H1.4z"/><path d="M8 6.4v3.2M8 11.4v.1"/>',
  rouge: `${CERCLE}<path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2"/>`,
  gris: `${CERCLE}<path d="M8 4.4V8l2.4 1.6"/>`,
};
function pictogramme(niveau) {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg xmlns="${SVG_NS}" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PICTOS[niveau]}</svg>`;
  return tpl.content.firstElementChild;
}

/** Pastille d'état : icône ET mot. */
function pastille(niveau, texte = L.LIBELLES[niveau]) {
  return h('span', { class: `td-pastille td-n-${niveau}`, dataset: { pastille: niveau } }, pictogramme(niveau), h('span', {}, texte));
}

const texteReleve = (ms, maintenant) => (Number.isFinite(ms) ? `relevé ${L.depuis(ms, maintenant)}` : 'date de relevé inconnue');

function ligne(i, maintenant, { avecFamille = false } = {}) {
  const niveau = L.niveauEffectif(i, maintenant);
  const valeur = i.type === 'mesure' ? L.texteValeur(i.valeur, i.unite) : '';
  const echeance = L.texteEcheance(i.echeanceMs, maintenant);
  return h('li', { class: 'td-ligne', dataset: { id: i.id, niveau: niveau ?? 'sans' } },
    h('div', { class: 'td-nom' }, i.nom, avecFamille ? h('small', {}, L.nomFamille(i.famille)) : null),
    h('div', { class: 'td-etat' }, valeur ? h('span', { class: 'td-valeur' }, valeur) : null, niveau ? pastille(niveau) : null),
    h('div', { class: 'td-detail' },
      i.message ? [h('span', { class: 'td-message' }, i.message), ' · '] : null,
      h('span', { class: 'td-releve', dataset: { releve: Number.isFinite(i.releveMs) ? i.releveMs : '' } }, texteReleve(i.releveMs, maintenant)),
      echeance ? h('div', { class: 'td-echeance' }, echeance) : null),
    h('div', { class: 'td-outils' },
      L.LIBELLES_METHODE[i.methode] ? h('span', { class: 'td-methode', title: L.AIDE_METHODE[i.methode] }, L.LIBELLES_METHODE[i.methode]) : null,
      i.procedure ? h('span', { class: 'td-procedure' }, `Procédure : ${i.procedure}`) : null));
}

function compteursPastilles(c, { tous = false } = {}) {
  return h('div', { class: 'td-compteurs' }, L.NIVEAUX.filter((n) => tous || c[n]).map((n) => {
    const p = pastille(n, L.libelleCompteur(n, c[n]));
    p.dataset.compteur = n;
    return p;
  }));
}

// ---------------------------------------------------------------- écran Général
function vueGenerale(tous, maintenant) {
  const c = L.compter(tous, maintenant);
  const phrase = L.phraseGlobale(c);
  const niveau = L.niveauGlobal(c);
  const aFaire = L.listeATraiter(tous, maintenant);
  const releves = tous.map((i) => i.releveMs).filter(Number.isFinite);
  const dernier = releves.length ? Math.max(...releves) : null;
  return [
    h('section', { class: 'td-panneau td-global', 'aria-labelledby': 'td-phrase' },
      h('div', { class: 'td-global-texte' },
        h('h2', { id: 'td-phrase', class: `td-phrase td-t-${niveau}`, dataset: { niveau } }, pictogramme(niveau), h('span', {}, phrase)),
        dernier !== null ? h('small', { class: 'td-aide' }, 'Dernier relevé du système : ', h('span', { dataset: { releve: dernier } }, L.depuis(dernier, maintenant))) : null),
      compteursPastilles(c, { tous: true })),
    h('section', { class: 'td-panneau', 'aria-labelledby': 'td-a-traiter' },
      h('h2', { id: 'td-a-traiter' }, 'À traiter en premier'),
      aFaire.length ? h('ul', { class: 'td-liste', dataset: { liste: 'a-traiter' } }, aFaire.map((i) => ligne(i, maintenant, { avecFamille: true })))
        : h('p', { class: 'td-vide td-rien' }, MESSAGE_RIEN_A_TRAITER)),
  ];
}

// ---------------------------------------------------------------- écrans Technique (et Finance, Stocks)
function vueParFamille(duTableau, maintenant, surFiltre) {
  const possibles = L.famillesPossibles(duTableau, { traiter: filtres.traiter }, maintenant);
  if (filtres.famille && !possibles.some((f) => f.valeur === filtres.famille)) filtres.famille = ''; // chaque liste ne propose que les valeurs possibles
  const visibles = L.filtrer(duTableau, filtres, maintenant);
  const groupes = L.regrouperParFamille(visibles, maintenant, duTableau);
  const bouton = (traiter, libelle) => h('button', { type: 'button', 'aria-pressed': String(filtres.traiter === traiter), dataset: { focus: `filtre-${traiter ? 'traiter' : 'tout'}` },
    onclick: () => { filtres.traiter = traiter; surFiltre(); } }, libelle);
  const selection = h('select', { class: 'champ', 'aria-label': 'Filtrer par famille', dataset: { focus: 'filtre-famille' }, onchange: (e) => { filtres.famille = e.target.value; surFiltre(); } },
    h('option', { value: '' }, 'Toutes les familles'),
    possibles.map((f) => h('option', { value: f.valeur }, f.libelle)));
  selection.value = filtres.famille;
  return [
    h('div', { class: 'td-filtres' },
      h('div', { class: 'td-segment', role: 'group', 'aria-label': 'Filtre' }, bouton(false, 'Tout voir'), bouton(true, 'À traiter')),
      possibles.length > 1 ? selection : null),
    groupes.length
      ? groupes.map((g) => h('section', { class: 'td-panneau td-famille', dataset: { famille: g.famille }, 'aria-labelledby': L.idFamille(g.famille) },
        h('header', {}, h('h2', { id: L.idFamille(g.famille) }, g.titre), compteursPastilles(g.compteurs)),
        h('ul', { class: 'td-liste' }, g.indicateurs.map((i) => ligne(i, maintenant)))))
      : h('p', { class: 'td-vide td-rien' }, filtres.traiter ? MESSAGE_RIEN_A_TRAITER : SANS_RESULTAT),
  ];
}

// ---------------------------------------------------------------- montage
/** Monte l'écran d'un tableau ('general', 'technique', 'finance', 'stocks'). Renvoie la fonction qui l'arrête. */
export function rendreTableau(conteneur, tableau) {
  const onglets = h('nav', { class: 'td-onglets', 'aria-label': 'Tableaux' });
  const contenu = h('div', { class: 'td-contenu' });
  conteneur.append(h('div', { class: 'page page-tableaudebord' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Tableau de bord')),
    onglets, contenu));
  let signature = '';
  let signatureOnglets = '';

  function rendreOnglets() {
    const liste = L.ongletsVisibles(D.etat.indicateurs);
    const sig = `${tableau}|${liste.map((t) => t.id).join()}`;
    if (sig === signatureOnglets) return;
    signatureOnglets = sig;
    remplir(onglets, liste.map((t) => h('a', {
      class: 'td-onglet', href: lien(`tableaudebord/${t.id}`), dataset: { onglet: t.id }, 'aria-current': t.id === tableau ? 'page' : null,
    }, t.libelle)));
  }

  function etatSimple(classe, texte, role, bouton = null) {
    return h('div', { class: `td-etat-ecran ${classe}`, role }, h('p', {}, texte), bouton);
  }

  function rendre() {
    const maintenant = Date.now();
    rendreOnglets();
    const tous = D.etat.indicateurs;
    const duTableau = L.duTableau(tous, tableau);
    const lignes = tous.map((i) => [i.id, i.tableau, i.famille, i.nom, i.type, L.niveauEffectif(i, maintenant), i.message, i.valeur, i.unite, i.methode, i.procedure,
      L.texteEcheance(i.echeanceMs, maintenant), i.releveMs]);
    const sig = JSON.stringify([tableau, D.etat.erreur, D.etat.pret, filtres, lignes]);
    if (sig !== signature) {
      signature = sig;
      const actif = document.activeElement?.dataset?.focus ?? null;
      if (D.etat.erreur) {
        remplir(contenu, etatSimple('td-erreur', MESSAGE_ERREUR, 'alert',
          h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { role: 'reessayer' }, onclick: () => D.reessayer() }, 'Réessayer')));
      } else if (!D.etat.pret) {
        remplir(contenu, etatSimple('td-chargement', MESSAGE_CHARGEMENT, 'status'));
      } else if ((tableau === 'general' ? tous : duTableau).length === 0) {
        remplir(contenu, etatSimple('td-vide', MESSAGE_VIDE, 'status'));
      } else if (tableau === 'general') {
        remplir(contenu, vueGenerale(tous, maintenant));
      } else {
        remplir(contenu, vueParFamille(duTableau, maintenant, rendre));
      }
      if (actif) contenu.querySelector(`[data-focus="${actif}"]`)?.focus();
    }
    majDepuis(maintenant);
  }

  /** Les « relevé il y a … » avancent sans reconstruire la liste (le focus et le défilement ne bougent pas). */
  function majDepuis(maintenant) {
    contenu.querySelectorAll('.td-releve[data-releve]').forEach((el) => { el.textContent = texteReleve(el.dataset.releve === '' ? NaN : Number(el.dataset.releve), maintenant); });
    contenu.querySelectorAll('.td-aide [data-releve]').forEach((el) => { el.textContent = L.depuis(Number(el.dataset.releve), maintenant); });
  }

  const arretDonnees = D.surChangement(rendre);
  const minuteur = setInterval(rendre, L.MINUTE); // chaque minute : « il y a … » et passage au gris
  rendre();
  return function quitter() {
    clearInterval(minuteur);
    arretDonnees();
  };
}
