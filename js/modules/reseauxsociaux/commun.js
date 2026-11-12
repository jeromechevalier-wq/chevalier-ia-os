// Éléments d'écran partagés par les écrans du module (Aujourd'hui, Posts, Idées, Inspirations, Relations, Import) : barre d'onglets, chargement, lien vers Buffer, pastilles et champs de formulaire.
import { h, icone } from '../../os/ui.js';
import { barreOnglets } from '../../os/onglets.js';
import { ongletsDuModule } from '../../os/registre.js';
import { pastilleEtiquette } from '../crm/composants.js';
import * as R from './logique.js';
import { URL_BUFFER } from './logique.js';

/** Barre d'onglets du module : le menu n'a qu'une entrée « Réseaux sociaux », les écrans se rejoignent par cette barre. `actif` = route de l'écran affiché. */
export const ongletsReseauxSociaux = (actif) => barreOnglets({ onglets: ongletsDuModule('reseauxsociaux'), actif, etiquette: 'Écrans des réseaux sociaux' });

/** Rond de chargement dans un bloc (`chargement-bloc` : la classe `chargement` seule fait la hauteur de l'écran, elle est réservée à la coque). */
export const chargement = () => h('div', { class: 'chargement-bloc', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement'));

/** Lien vers Buffer, dans un nouvel onglet : Buffer reste le lieu où l'on écrit les posts. `principal` = le bouton jaune de la page. */
export function lienBuffer({ libelle = 'Ouvrir Buffer', principal = true } = {}) {
  return h('a', { class: `bouton ${principal ? 'bouton-principal' : 'bouton-secondaire'}`, href: URL_BUFFER, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-buffer' } },
    icone('external-link', { taille: 16 }), libelle);
}

// ---------------------------------------------------------------- pastilles pilier · format · service (les mêmes sur les posts et sur les idées)

// Couleurs des pastilles : variables de tokens.css (jamais de jaune plein hors bouton).
export const COULEUR_PILIER = Object.freeze({ cas_concrets: 'var(--violet-clair)', pedagogie: 'var(--corail)', actu_ia: 'var(--vert)', demarche_offre: 'var(--lilas)' });
export const COULEUR_GRISE = 'var(--bordure-forte)';

export function pastille(role, nom, couleur) {
  const el = pastilleEtiquette({ nom, couleur });
  el.dataset.role = role;
  return el;
}
export const pastillePilier = (id) => (id ? pastille('pilier', R.libellePilier(id), COULEUR_PILIER[R.convertirPilier(id)] ?? COULEUR_GRISE) : pastille('pilier-vide', 'À classer', COULEUR_GRISE));
export const pastilleFormat = (id) => (id ? pastille('format', R.libelleFormat(id), COULEUR_GRISE) : null);
export const pastilleService = (id) => (id ? pastille('service', R.libelleService(id), COULEUR_GRISE) : null);

// ---------------------------------------------------------------- champs de formulaire des fenêtres (classes du CRM : bloc-champ, etiquette, champ)

/** Champ de texte (`multiligne` = zone de texte). Rend { bloc, champ } ; `surSaisie(valeur)` est appelé à chaque frappe. */
export function champTexte({ cle, libelle, valeur = '', maxlength = null, multiligne = false, lignes = 3, aide = null, placeholder = '', surSaisie = () => {} }) {
  const attrs = { class: 'champ', id: `rs-champ-${cle}`, dataset: { champ: cle }, autocomplete: 'off', placeholder, ...(maxlength ? { maxlength: String(maxlength) } : {}), oninput: (e) => surSaisie(e.target.value) };
  const champ = multiligne ? h('textarea', { ...attrs, rows: String(lignes) }) : h('input', { ...attrs, type: 'text' });
  champ.value = valeur ?? '';
  const bloc = h('div', { class: 'bloc-champ', dataset: { bloc: cle } }, h('label', { class: 'etiquette', for: `rs-champ-${cle}` }, libelle), champ, aide ? h('p', { class: 'aide' }, aide) : null);
  return { bloc, champ };
}

/** Liste déroulante. `vide` = libellé de l'option sans valeur (null = pas d'option vide). Rend { bloc, champ }. */
export function champListe({ cle, libelle, options, valeur = null, vide = null, surChangement = () => {} }) {
  const champ = h('select', { class: 'champ', id: `rs-champ-${cle}`, dataset: { champ: cle }, onchange: (e) => surChangement(e.target.value || null) },
    vide !== null ? h('option', { value: '' }, vide) : null, options.map((o) => h('option', { value: o.id }, o.libelle)));
  champ.value = valeur ?? '';
  const bloc = h('div', { class: 'bloc-champ', dataset: { bloc: cle } }, h('label', { class: 'etiquette', for: `rs-champ-${cle}` }, libelle), champ);
  return { bloc, champ };
}

/** Lien vers LinkedIn (profil ou post) dans un nouvel onglet : jamais d'adresse sans `noopener`. L'adresse a été rangée par normaliserUrlLinkedin avant d'être écrite. */
export function lienExterne({ href, libelle, classe = 'bouton bouton-secondaire', action = 'ouvrir-linkedin', icone: ic = 'external-link' }) {
  return h('a', { class: classe, href, target: '_blank', rel: 'noopener noreferrer', dataset: { action } }, icone(ic, { taille: 16 }), libelle);
}
