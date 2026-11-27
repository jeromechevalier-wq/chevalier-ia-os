// Vue « Liste » du village sur téléphone (étape 2 de docs/accueil-village.md, 27/11/2026) : les mêmes maisons en liste de vrais liens, un seul toucher ouvre.
// D'abord la Mairie (et la Console si elle est montrée), puis chaque maison visible dans l'ordre des besoins : petit dessin (aria-hidden), nom choisi, phrase,
// pastille du compteur. Le bouton « Liste » / « Village » (téléphone seulement) bascule ; le choix est gardé sur l'appareil (préférence `accueil-vue`).
// Textes posés par h() (nœuds texte), jamais par innerHTML. Un lien externe (étape 3b) : un vrai <a target="_blank" rel="noopener noreferrer"> vers son adresse,
// avec la marque « lien externe » ; une adresse refusée : une ligne sans lien.
// Étape 3c (27/11/2026) : sous la ligne d'une grande maison, ses petites maisons (vrais liens vers « ce chantier seulement », en retrait), y compris
// celles qui n'ont pas trouvé de case libre autour d'elle dans le dessin.
import { h, icone, lirePreference, ecrirePreference } from './ui.js';
import { lien } from './router.js';
import { BATIMENTS_FIXES } from './village-batiments.js';
import { pastilleBulle } from './maison-village.js';

export const CLE_VUE = 'accueil-vue';

/** La vue choisie sur cet appareil : 'liste' ou 'village' (par défaut). */
export function vueChoisie() {
  return lirePreference(CLE_VUE, 'village') === 'liste' ? 'liste' : 'village';
}

/** Bouton qui bascule la vue ; `surChoix(vue)` après chaque changement. */
export function boutonVue(vue, surChoix) {
  const liste = vue === 'liste';
  return h('button', {
    type: 'button', class: 'bouton bouton-secondaire village-bouton-vue', dataset: { role: 'vue-liste' }, 'aria-pressed': liste ? 'true' : 'false',
    onclick: () => { const suivante = liste ? 'village' : 'liste'; ecrirePreference(CLE_VUE, suivante); surChoix(suivante); },
  }, icone(liste ? 'house' : 'list'), liste ? 'Village' : 'Liste');
}

/**
 * La liste des maisons. `dessin(batiment)` : fabrique d'une petite vignette SVG (fournie par l'écran) ; `compteurs` : Map(id de maison → nombre lu) ;
 * `fixes` : [{ id, route }] des îlots montrés (Mairie, Console) ; `petites` : les petites maisons (posées ou sans place), chacune avec `parent`.
 */
export function listeMaisons({ maisons, petites = [], fixes, compteurs, dessin, dessinFixe }) {
  const ligne = (href, vignette, nom, phrase, pastille, role, externe = null) => h('li', {},
    h(externe?.invalide ? 'span' : 'a', {
      href: externe?.invalide ? null : href, class: 'village-liste-lien', dataset: externe ? { role, sorte: 'lien' } : { role },
      target: externe && !externe.invalide ? '_blank' : null, rel: externe && !externe.invalide ? 'noopener noreferrer' : null,
    },
      h('span', { class: 'village-liste-vignette', 'aria-hidden': 'true' }, vignette),
      h('span', { class: 'village-liste-textes' },
        h('strong', { dataset: { role: 'liste-nom' } }, nom),
        phrase ? h('small', {}, phrase) : null),
      pastille,
      externe ? icone('external-link', { taille: 16 }) : null));
  const lignes = fixes.map(({ id, route }) => ligne(lien(route), dessinFixe(id), BATIMENTS_FIXES[id].nom, BATIMENTS_FIXES[id].phrase, null, 'liste-fixe'));
  for (const m of maisons) {
    if (m.sorte === 'lien') {
      lignes.push(ligne(m.url, dessin(m.besoin.batiment), m.nom, m.invalide ? 'Adresse refusée : modifie ou retire cette maison.' : m.url, null, 'liste-maison', { invalide: m.invalide }));
      continue;
    }
    const etat = m.besoin.compteur ? pastilleBulle(m.besoin.compteur, compteurs.get(m.id)) : null;
    const pastille = etat && !etat.attente ? h('span', { class: `village-liste-pastille${etat.zero ? ' village-pastille-zero' : ''}` }, etat.texte) : null;
    lignes.push(ligne(lien(m.besoin.cible), dessin(m.besoin.batiment), m.nom, m.besoin.phrase, pastille, 'liste-maison'));
    for (const p of petites.filter((x) => x.parent === m.id)) {
      lignes.push(h('li', { class: 'village-liste-petite', dataset: { role: 'liste-petite', maison: p.id, auto: p.auto ? 'oui' : 'non' } },
        h('a', { href: lien(p.cible), class: 'village-liste-lien' },
          h('span', { class: 'village-liste-vignette', 'aria-hidden': 'true' }, dessin(p.batiment)),
          h('span', { class: 'village-liste-textes' }, h('strong', {}, p.nom), p.sousTitre ? h('small', {}, p.sousTitre) : null))));
    }
  }
  return h('ul', { class: 'village-liste', dataset: { role: 'liste-maisons' } }, lignes);
}
