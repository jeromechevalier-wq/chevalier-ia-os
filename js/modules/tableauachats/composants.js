// Module Achats « Tableau de bord 2 » : petits composants d'écran (cartes, chiffres, tableaux triables, graphiques ECharts, rangée de filtres). Aucun accès à la base ici.
// Les textes sont toujours posés comme du texte (jamais comme du HTML). Les couleurs viennent des variables de css/tokens.css (thème clair ET sombre).
import { h, icone, iconeInfo, remplir } from '../../os/ui.js';
import { formater } from './formats.js';
import { trier, triSuivant } from './tri.js';
import { RACCOURCIS, aujourdhui, libellePlage } from './filtrage.js';

// ------------------------------------------------------------------ graphiques
const chargerEcharts = () => import('../../../assets/vendor/echarts/echarts.esm.min.js');
const variable = (s, nom, secours) => (s.getPropertyValue(nom) || '').trim() || secours;

/** Lit les couleurs du thème dans les variables CSS (le canvas ne lit pas le CSS) : relues à chaque dessin. */
export function lireCouleurs(racine = document.documentElement) {
  const s = getComputedStyle(racine);
  const accent = variable(s, '--accent-trait', '#ecbc06');
  return {
    panneau: variable(s, '--panneau', '#29292c'), texte: variable(s, '--texte', '#ececee'), texte2: variable(s, '--texte2', '#b0aeb3'), bordure: variable(s, '--bordure', '#ffffff1a'), accent,
    serie: variable(s, '--lien', '#6aa6f0'), bon: variable(s, '--succes', '#6ddba0'), attention: variable(s, '--attention', '#f2b46b'), mauvais: variable(s, '--retard', '#ff8f86'), neutre: variable(s, '--texte2', '#b0aeb3'),
    palette: [variable(s, '--lien', '#6aa6f0'), variable(s, '--attention', '#f2b46b'), variable(s, '--succes', '#6ddba0'), variable(s, '--violet-clair', '#c79bff'), variable(s, '--vert', '#4fd1c5'), variable(s, '--corail', '#e879a8'), variable(s, '--gris-lilas', '#9aa0a6')],
  };
}

/**
 * Un graphique ECharts (chargé à la demande). `option` est une donnée passée à `setOption` ; aucune chaîne n'est jamais exécutée.
 * `registre` : liste où l'instance s'inscrit, pour que l'écran la libère avant de se redessiner. `charger` se remplace dans les tests.
 */
export function graphique(registre, option, hauteur, titre, { charger = chargerEcharts } = {}) {
  const racine = h('div', { class: 'ta-graphique', style: { height: `${hauteur}px` }, role: 'img', 'aria-label': titre, dataset: { role: 'graphique' } });
  let vivant = true;
  const entree = { dispose() { vivant = false; try { entree.instance?.dispose(); } catch { /* déjà libéré */ } entree.obs?.disconnect(); } };
  registre.push(entree);
  const erreur = () => { if (vivant) racine.replaceWith(h('p', { class: 'ta-tuile-vide', role: 'status' }, 'Cette tuile n’a pas pu être dessinée.')); };
  charger().then((echarts) => {
    if (!vivant || !racine.isConnected) return;
    try {
      const ch = echarts.init(racine, undefined, { renderer: 'canvas' });
      entree.instance = ch;
      ch.setOption(option, true);
      racine.dataset.pret = '1';
      entree.obs = new ResizeObserver(() => { try { ch.resize(); } catch { /* écran quitté */ } });
      entree.obs.observe(racine);
    } catch (e) { console.warn('Graphique impossible', e?.message); erreur(); }
  }).catch((e) => { console.warn('ECharts ne se charge pas', e?.message); erreur(); });
  return racine;
}

// ------------------------------------------------------------------ cartes et chiffres
/** Carte d'une tuile : titre, « i » d'aide (texte simple), contenu. `large` : quart | tiers | moitie | pleine. */
export function carte({ titre, aide = '', large = 'moitie', role = '' }, ...enfants) {
  return h('section', { class: `ta-tuile ta-${large}`, 'aria-label': titre, dataset: role ? { role } : {} }, h('h3', {}, titre, iconeInfo(aide, titre)), ...enfants);
}
export const vide = (filtre) => h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, filtre ? 'Aucun résultat avec ces filtres.' : 'Pas encore de données.');
export const alerte = (texte) => h('p', { class: 'ta-alerte', role: 'status', style: { gridColumn: '1 / -1' } }, texte);

export function chiffre({ titre, valeur, format, sous, couleur = 'neutre', variation = null, aide, vide: estVide, large = 'tiers' }) {
  const v = variation && variation.pct !== null && Math.round(variation.pct * 10) !== 0 ? variation : null;
  const bonne = v ? (variation.mauvaiseHausse ? v.pct < 0 : v.pct > 0) : false;
  return carte({ titre, aide, large, role: 'chiffre' },
    estVide || valeur === null || valeur === undefined ? h('p', { class: 'ta-chiffre ta-neutre' }, '—') : h('p', { class: `ta-chiffre ta-${couleur}` }, formater(valeur, format)),
    sous ? h('p', { class: 'ta-sous' }, sous) : null,
    v ? h('p', { class: `ta-variation ${bonne ? 'ta-bon' : 'ta-mauvais'}` }, `${v.pct > 0 ? '▲ +' : '▼ '}${formater(Math.abs(v.pct), 'pourcent1')} ${v.texte}`) : null,
    variation && variation.pct === null ? h('p', { class: 'ta-sous' }, 'Variation non calculable.') : null);
}

export function phrases({ titre, phrases: liste, aide }) {
  return carte({ titre, aide, large: 'pleine' }, liste.map((p) => h('p', { class: 'ta-phrase' }, p)));
}

/** Pagination : « ‹ Page 1 sur 3 › ». `surPage(n)` redessine. */
export function pagination(p, pages, surPage) {
  if (pages <= 1) return null;
  return h('span', { class: 'ta-pages' },
    h('button', { type: 'button', disabled: p === 0, 'aria-label': 'Page précédente', onclick: () => surPage(p - 1) }, '‹'), ` Page ${p + 1} sur ${pages} `,
    h('button', { type: 'button', disabled: p >= pages - 1, 'aria-label': 'Page suivante', onclick: () => surPage(p + 1) }, '›'));
}
export const PAR_PAGE = 20;
export const pluriel = (n, un, plusieurs) => `${formater(n, 'entier')} ${n === 1 ? un : plusieurs}`;

/** En-tête de colonne triable : renvoie le <th>. */
export function enteteTriable(col, tri, surClic) {
  const actif = tri && tri.cle === col.cle;
  return h('th', { scope: 'col', class: col.droite ? 'ta-droite' : '', 'aria-sort': actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
    h('button', { type: 'button', onclick: surClic }, `${col.titre}${actif ? (tri.sens === 'asc' ? ' ▲' : ' ▼') : ''}`));
}

/**
 * Tableau trié au clic sur l'en-tête, avec pagination. `colonnes` : { cle, titre, format?, droite?, couleur?(l), fond? }.
 * Rend une carte pleine largeur. `surLignes(lignesTriees)` est appelé à chaque dessin (le tableau affiché sert à l'export).
 */
export function tableau({ titre, colonnes, lignes, filtre, aide, tri0 = null }) {
  let tri = tri0, page = 0;
  const corps = h('div', {});
  const dessiner = () => {
    if (lignes.length === 0) { remplir(corps, vide(filtre)); return; }
    const triees = trier(lignes, tri);
    const pages = Math.max(1, Math.ceil(triees.length / PAR_PAGE));
    page = Math.min(page, pages - 1);
    remplir(corps, 
      h('div', { class: 'ta-defile' }, h('table', { class: 'ta-tableau' },
        h('thead', {}, h('tr', {}, colonnes.map((c) => enteteTriable(c, tri, () => { page = 0; tri = triSuivant(tri, c); dessiner(); })))),
        h('tbody', {}, triees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map((l) => h('tr', {}, colonnes.map((c) => {
          const col = c.couleur ? c.couleur(l) : null;
          const classes = `${c.droite ? 'ta-droite' : ''}${col ? (c.fond ? ` ta-fond-${col}` : ` ta-${col}`) : ''}`.trim();
          return h('td', { class: classes, dataset: { libelle: c.titre } }, formater(l[c.cle], c.format ?? 'texte'));
        })))))),
      h('div', { class: 'ta-pied-tableau' }, h('span', {}, pluriel(triees.length, 'ligne', 'lignes')), pagination(page, pages, (n) => { page = n; dessiner(); })));
  };
  dessiner();
  return carte({ titre, aide, large: 'pleine', role: 'tableau' }, corps);
}

// ------------------------------------------------------------------ rangée de filtres
const resume = (v) => (v.type === 'liste' ? (v.choix.length === 1 ? v.choix[0] : `${v.choix.length} sélections`) : v.libelle || libellePlage(v.du, v.au));

function menuListe(options, valeur, surValider) {
  let choix = [...valeur];
  let recherche = '';
  const liste = h('ul', { class: 'ta-fb-liste' });
  const pied = h('div', { class: 'ta-fb-pied' });
  const champ = h('input', { class: 'ta-fb-recherche', type: 'search', placeholder: 'Recherche dans la liste', 'aria-label': 'Recherche dans la liste', oninput: (e) => { recherche = e.target.value; dessiner(); } });
  const bouton = h('button', { type: 'button', class: 'ta-fb-valider', onclick: () => surValider(choix) }, valeur.length ? 'Mettre à jour le filtre' : 'Ajouter un filtre');
  pied.append(bouton);
  const conteneur = h('div', { class: 'ta-fb-corps' });
  function dessiner() {
    const visibles = options.filter((o) => o.toLocaleLowerCase('fr').includes(recherche.trim().toLocaleLowerCase('fr')));
    bouton.disabled = choix.length === 0;
    if (options.length === 0) { remplir(conteneur, h('p', { class: 'ta-fb-vide' }, 'Aucune valeur pour l’instant.')); return; }
    if (visibles.length === 0) { remplir(conteneur, h('p', { class: 'ta-fb-vide' }, 'Aucun résultat.')); return; }
    const tous = visibles.every((o) => choix.includes(o));
    const case_ = (texte, coche, change) => h('li', {}, h('label', {}, h('input', { type: 'checkbox', checked: coche, onchange: change }), ' ', h('span', {}, texte)));
    remplir(liste, 
      case_('Tout sélectionner', tous, () => { choix = tous ? choix.filter((x) => !visibles.includes(x)) : [...new Set([...choix, ...visibles])]; dessiner(); }),
      ...visibles.map((o) => case_(o, choix.includes(o), () => { choix = choix.includes(o) ? choix.filter((x) => x !== o) : [...choix, o]; dessiner(); })));
    remplir(conteneur, liste);
  }
  dessiner();
  return [champ, conteneur, pied];
}

function menuPeriode(valeur, surChoisir) {
  const racine = h('div', {});
  let fixe = Boolean(valeur && valeur.type === 'periode' && valeur.libelle.includes('–'));
  let du = valeur && valeur.type === 'periode' ? valeur.du ?? '' : '';
  let au = valeur && valeur.type === 'periode' ? valeur.au ?? '' : '';
  const t = aujourdhui();
  function dessiner() {
    if (!fixe) {
      remplir(racine, h('ul', { class: 'ta-fb-raccourcis' },
        RACCOURCIS.map((r, i) => h('li', { class: i === 5 ? 'ta-fb-sep' : '' }, h('button', { type: 'button', onclick: () => { const [a, b] = r.plage(t); surChoisir({ type: 'periode', libelle: r.libelle, du: a, au: b }); } }, r.libelle))),
        h('li', { class: 'ta-fb-sep' }, h('button', { type: 'button', onclick: () => { fixe = true; dessiner(); } }, 'Plage de dates fixe…'))));
      return;
    }
    const inverse = Boolean(du && au && du > au);
    const valider = h('button', { type: 'button', class: 'ta-fb-valider', disabled: (!du && !au) || inverse, onclick: () => surChoisir({ type: 'periode', libelle: libellePlage(du || null, au || null), du: du || null, au: au || null }) }, valeur ? 'Mettre à jour le filtre' : 'Ajouter un filtre');
    remplir(racine, 
      h('div', { class: 'ta-fb-champs' },
        h('label', {}, 'Du ', h('input', { type: 'date', value: du, max: au || null, onchange: (e) => { du = e.target.value; dessiner(); } })),
        h('label', {}, 'Au ', h('input', { type: 'date', value: au, min: du || null, onchange: (e) => { au = e.target.value; dessiner(); } }))),
      inverse ? h('p', { class: 'ta-fb-erreur', role: 'alert' }, 'La date de début doit venir avant la date de fin.') : null,
      h('div', { class: 'ta-fb-pied' }, h('button', { type: 'button', class: 'ta-lien', onclick: () => { fixe = false; dessiner(); } }, 'Retour'), valider));
  }
  dessiner();
  return [racine];
}

/**
 * Rangée de filtres « à la Metabase » : boutons déroulants (Période, Chantier, Statut…), un menu avec recherche et cases à cocher ou raccourcis de dates, la valeur choisie écrite dans le bouton, une croix pour l'effacer.
 * `defs` : { id, libelle, type: 'liste', options } ou { id, libelle, type: 'periode' }. `valeurs` : { [id]: valeur }. `sansRepli` : sur téléphone, les filtres restent visibles (petite barre secondaire).
 */
export function filtresBarre({ defs, valeurs, modifie, surChangement, surReinit, sansRepli = false, etiquette = 'Filtres' }) {
  let ouvert = null, deplie = false;
  const racine = h('div', { class: 'ta-fb-barre', role: 'group', 'aria-label': etiquette });
  const actifs = defs.filter((d) => valeurs[d.id]);
  const fermer = () => { ouvert = null; dessiner(); };
  const dehors = (e) => { if (!racine.isConnected) { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', touche); return; } if (ouvert && !racine.contains(e.target)) fermer(); };
  const touche = (e) => { if (e.key === 'Escape' && ouvert) fermer(); };
  document.addEventListener('mousedown', dehors);
  document.addEventListener('keydown', touche);
  const poser = (id, v) => { surChangement({ ...valeurs, [id]: v }); };
  const effacer = (id) => { const { [id]: _a, ...reste } = valeurs; surChangement(reste); };
  function dessiner() {
    racine.classList.toggle('ta-fb-deplie', deplie || sansRepli);
    remplir(racine, 
      sansRepli ? null : h('button', { type: 'button', class: 'ta-fb-bouton ta-fb-replier', 'aria-expanded': String(deplie), onclick: () => { deplie = !deplie; ouvert = null; dessiner(); } }, icone('funnel', { taille: 14 }), h('span', {}, `Filtres (${actifs.length})`), icone('chevron-down', { taille: 14 })),
      !sansRepli && !deplie && actifs.length > 0 ? h('ul', { class: 'ta-fb-pastilles', 'aria-label': 'Filtres actifs' }, actifs.map((d) => h('li', {}, `${d.libelle} : ${resume(valeurs[d.id])}`))) : null,
      defs.map((d) => {
        const v = valeurs[d.id], actif = Boolean(v);
        const menu = ouvert === d.id ? h('div', { class: 'ta-fb-menu', role: 'dialog', 'aria-label': `Filtre ${d.libelle}` },
          ...(d.type === 'liste' ? menuListe(d.options, v && v.type === 'liste' ? v.choix : [], (choix) => poser(d.id, { type: 'liste', choix })) : menuPeriode(v, (x) => poser(d.id, x)))) : null;
        return h('div', { class: 'ta-fb-item', dataset: { filtre: d.id } },
          h('button', { type: 'button', class: `ta-fb-bouton${actif ? ' ta-fb-actif' : ''}${ouvert === d.id ? ' ta-fb-ouvert' : ''}`, 'aria-haspopup': 'dialog', 'aria-expanded': String(ouvert === d.id), onclick: () => { ouvert = ouvert === d.id ? null : d.id; dessiner(); } },
            icone(d.type === 'periode' ? 'calendar' : 'funnel', { taille: 14 }), h('span', {}, actif ? [`${d.libelle} : `, h('strong', {}, resume(v))] : d.libelle), actif ? null : icone('chevron-down', { taille: 14 })),
          actif ? h('button', { type: 'button', class: 'ta-fb-croix', 'aria-label': `Effacer le filtre ${d.libelle}`, onclick: () => effacer(d.id) }, icone('x', { taille: 14 })) : null,
          menu);
      }),
      modifie ? h('button', { type: 'button', class: 'ta-lien ta-fb-reinit', onclick: () => surReinit() }, 'Réinitialiser') : null);
    const champ = racine.querySelector('.ta-fb-recherche');
    if (champ) champ.focus();
  }
  dessiner();
  return racine;
}
