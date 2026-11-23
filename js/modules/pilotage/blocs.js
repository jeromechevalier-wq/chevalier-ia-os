// Blocs du Tableau de bord qui ne sont pas des graphiques : grand chiffre, tableau, texte, phrases. Tout ce qui vient du serveur est posé avec du TEXTE (jamais de HTML) ;
// un lien ne mène qu'à un onglet du tableau (adresse fabriquée par le routeur, jamais à partir d'une valeur de la base).
import { h } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import * as F from './formats.js';

const adresseOnglet = (id) => lien(`pilotage/pilotage/${id}`);
const classeCouleur = (c) => (F.estCouleur(c) ? `couleur-${c}` : '');
export const MESSAGE_SANS_VALEUR = '—';

/** Lignes de segments d'un texte -> éléments (gras, italique, lien vers un onglet) séparés par des retours à la ligne. */
export function elementsDeTexte(texte) {
  const sortie = [];
  F.analyserTexte(texte).forEach((ligne, i) => {
    if (i > 0) sortie.push(h('br'));
    for (const seg of ligne) {
      if (seg.onglet) sortie.push(h('a', { href: adresseOnglet(seg.onglet), class: 'pilotage-lien' }, seg.texte));
      else if (seg.gras) sortie.push(h('strong', {}, seg.texte));
      else if (seg.italique) sortie.push(h('em', {}, seg.texte));
      else sortie.push(seg.texte);
    }
  });
  return sortie;
}

/** Bloc « texte » : un paragraphe, balisage minimal. */
export const rendreTexte = (tuile) => h('p', { class: 'pilotage-texte' }, ...elementsDeTexte(tuile.texte));

/** Bloc « phrases » : une ligne par phrase prête de la vue (une par ligne, une par colonne déclarée). */
export const PHRASES_MAX = 50;
export function rendrePhrases(tuile) {
  const phrases = tuile.lignes.flatMap((l) => tuile.colonnes.map((c) => l[c])).filter((v) => !F.estVide(v)).map(String);
  return h('div', { class: 'pilotage-phrases' }, ...phrases.slice(0, PHRASES_MAX).map((p) => h('p', { class: 'pilotage-phrase' }, p)), phrases.length > PHRASES_MAX ? h('p', { class: 'pilotage-phrase', dataset: { role: 'phrases-suite' } }, '…') : null);
}

/** Bloc « chiffre » : la valeur en grand, sa couleur de seuil, son libellé, la variation entre les deux dernières périodes, et un lien éventuel vers un onglet. */
export function rendreChiffre(tuile) {
  const v = tuile.valeur ?? {};
  const ligne = F.ligneDuChiffre(tuile.lignes, tuile.variation);
  const brute = ligne ? ligne[v.colonne] : null;
  const seuil = F.seuilDe(tuile.seuils, brute);
  const texteValeur = F.formater(v.format, brute) || MESSAGE_SANS_VALEUR;
  const couleur = seuil && F.estCouleur(seuil.couleur) ? seuil.couleur : null;
  const enfants = [h('p', { class: `pilotage-chiffre-valeur ${classeCouleur(couleur)}`.trim(), dataset: { role: 'chiffre-valeur', couleur: couleur ?? '' } }, texteValeur)];
  if (seuil?.libelle) enfants.push(h('p', { class: `pilotage-chiffre-libelle ${classeCouleur(couleur)}`.trim(), dataset: { role: 'chiffre-libelle' } }, seuil.libelle));
  if (tuile.variation) {
    const vr = F.calculerVariation(tuile.lignes, tuile.variation);
    if (vr.pourcent !== null) {
      const fleche = vr.sens === 'hausse' ? '▲' : (vr.sens === 'baisse' ? '▼' : '■');
      const periode = F.formater(tuile.variation.periodeFormat, vr.periodePrecedente);
      const avant = F.formater(v.format, vr.precedente);
      enfants.push(h('p', { class: `pilotage-chiffre-variation ${classeCouleur(vr.couleur)}`.trim(), dataset: { role: 'chiffre-variation', sens: vr.sens, couleur: vr.couleur } },
        h('span', { 'aria-hidden': 'true' }, fleche), h('span', { class: 'sr-only' }, vr.sens === 'hausse' ? 'En hausse ' : (vr.sens === 'baisse' ? 'En baisse ' : 'Stable ')),
        ` ${F.texteVariation(vr.pourcent)}`, periode ? ` par rapport à ${periode}` : '', avant ? ` (${avant})` : ''));
    } else enfants.push(h('p', { class: 'pilotage-chiffre-variation couleur-neutre', dataset: { role: 'chiffre-variation', sens: '' } }, vr.precedenteNulle ? 'Variation non calculable (période précédente à 0).' : 'Pas de période précédente à comparer.'));
  }
  if (tuile.lien) enfants.push(h('a', { class: 'pilotage-lien pilotage-chiffre-lien', href: adresseOnglet(tuile.lien.onglet), dataset: { role: 'chiffre-lien' } }, 'Voir le détail'));
  return h('div', { class: 'pilotage-chiffre' }, ...enfants);
}

/** Bloc « tableau » : tri au clic, pagination, compteur de lignes ; sur téléphone, une fiche par ligne (CSS). Les couleurs viennent des règles de chaque colonne (la première règle vraie gagne). */
export function rendreTableau(tuile) {
  const colonnes = tuile.colonnes.filter((c) => c && typeof c.colonne === 'string');
  let tri = null; // { colonne, sens }
  let page = 1;
  const corps = h('tbody');
  const pied = h('div', { class: 'pilotage-tableau-pied' });
  const entetes = colonnes.map((c) => {
    const bouton = h('button', { type: 'button', class: 'pilotage-tri', dataset: { colonne: c.colonne }, onclick: () => {
      tri = tri?.colonne === c.colonne ? { colonne: c.colonne, sens: tri.sens === 'asc' ? 'desc' : 'asc' } : { colonne: c.colonne, sens: 'asc' };
      page = 1;
      dessiner();
    } }, c.titre || c.colonne, h('span', { class: 'pilotage-tri-fleche', 'aria-hidden': 'true' }));
    return { c, bouton, th: h('th', { scope: 'col', 'aria-sort': 'none' }, bouton) };
  });
  // Au téléphone, l'en-tête du tableau est caché (fiches) : le tri passe par cette liste, cachée sur ordinateur par le CSS.
  const choixTri = h('select', { class: 'pilotage-tri-mobile', 'aria-label': 'Trier par', dataset: { role: 'tri-mobile' }, onchange: (e) => {
    const [colonne, sens] = String(e.target.value).split(':');
    tri = colonne ? { colonne, sens } : null;
    page = 1;
    dessiner();
  } }, h('option', { value: '' }, 'Trier par…'), ...colonnes.flatMap((c) => [
    h('option', { value: `${c.colonne}:asc` }, `${c.titre || c.colonne} (croissant)`), h('option', { value: `${c.colonne}:desc` }, `${c.titre || c.colonne} (décroissant)`)]));
  const cellule = (c, ligne) => {
    const brute = ligne[c.colonne];
    const t = F.formater(c.format, brute) || MESSAGE_SANS_VALEUR;
    const couleur = F.couleurDeRegles(c.regles, brute);
    const contenu = c.lien?.onglet && !F.estVide(brute) ? h('a', { class: 'pilotage-lien', href: adresseOnglet(c.lien.onglet) }, t) : t;
    return h('td', { dataset: { label: c.titre || c.colonne, couleur: couleur ?? '' }, class: classeCouleur(couleur) }, contenu);
  };
  function dessiner() {
    const lignes = tri ? F.trierLignes(tuile.lignes, tri.colonne, tri.sens) : tuile.lignes;
    const p = F.pageDe(lignes, page, tuile.parPage);
    page = p.page;
    corps.replaceChildren(...p.lignes.map((l) => h('tr', {}, ...colonnes.map((c) => cellule(c, l)))));
    for (const { c, th, bouton } of entetes) {
      const actif = tri?.colonne === c.colonne;
      th.setAttribute('aria-sort', actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none');
      bouton.querySelector('.pilotage-tri-fleche').textContent = actif ? (tri.sens === 'asc' ? '▲' : '▼') : '';
    }
    choixTri.value = tri ? `${tri.colonne}:${tri.sens}` : '';
    const compteur = h('span', { class: 'pilotage-compteur', dataset: { role: 'compteur' } }, tuile.limite && lignes.length >= tuile.limite ? `${lignes.length} premières lignes` : `${lignes.length} ${lignes.length > 1 ? 'lignes' : 'ligne'}`); // la lecture s'arrête à la limite : on le dit
    const pager = p.pages > 1
      ? h('span', { class: 'pilotage-pager' },
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'page-precedente' }, disabled: p.page <= 1, 'aria-label': 'Page précédente', onclick: () => { page -= 1; dessiner(); } }, 'Précédente'),
        h('span', { dataset: { role: 'page' }, 'aria-live': 'polite' }, `Page ${p.page} sur ${p.pages}`),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'page-suivante' }, disabled: p.page >= p.pages, 'aria-label': 'Page suivante', onclick: () => { page += 1; dessiner(); } }, 'Suivante'))
      : null;
    pied.replaceChildren(compteur, ...(pager ? [pager] : []));
  }
  dessiner();
  return h('div', { class: 'pilotage-tableau' }, choixTri,
    h('table', { class: 'pilotage-table' }, h('thead', {}, h('tr', {}, ...entetes.map((e) => e.th))), corps), pied);
}
