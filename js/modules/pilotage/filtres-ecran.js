// Barre de filtres du Tableau de bord : le bouton « Filtres » commun (crm/filtres.js, pastille de compte), une fenêtre « Appliquer » / « Tout effacer »
// (même gabarit que `fenetreFiltres`, avec les types de ce module : période, liste, intervalle, oui / non), les pastilles des filtres actifs avec leur croix, « Effacer tout »,
// et, sur téléphone, un panneau repliable pour les pastilles. Tout ce qui vient du serveur (libellés, valeurs) est posé avec du TEXTE, jamais du HTML.
// L'écran (ecran.js) possède la mémoire des choix et la relecture ; ici, on ne fait qu'afficher et prévenir : `surChoix(fonction(memoire) -> memoire)`.
import { h, icone, remplir, dialogue } from '../../os/ui.js';
import { boutonFiltres } from '../crm/filtres.js';
import * as FL from './filtres-logique.js';

const normaliser = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAGE = 'plage';
const NOMBRE_RECHERCHE = 8; // au-delà, un champ de recherche dans la liste à cocher

/** Options d'un filtre `liste` : choix fermés, sinon valeurs lues par le serveur ; une valeur déjà appliquée mais absente de la liste est ajoutée (elle reste visible et décochable). */
function optionsDe(d) {
  const base = d.choix.length ? d.choix.map((c) => ({ valeur: c.valeur, libelle: c.libelle })) : (d.valeurs ?? []).map((v) => ({ valeur: v, libelle: String(v) }));
  for (const v of Array.isArray(d.applique) ? d.applique : []) if (!base.some((o) => String(o.valeur) === String(v))) base.push({ valeur: v, libelle: String(v) });
  return base;
}

/** Un contrôle par filtre : { element, lire() -> { ok, valeur } | { ok: false, message } }. */
function controle(d) {
  const a = d.applique;
  const etiquette = (texte) => h('span', { class: 'etiquette' }, texte);
  if (d.type === 'periode') {
    const depart = a?.raccourci !== undefined ? a.raccourci : (a?.du !== undefined ? PLAGE : 'tout');
    const choix = h('select', { class: 'champ', dataset: { filtre: d.id, role: 'raccourci' }, 'aria-label': `${d.libelle} : durée` },
      ...FL.RACCOURCIS.map((r) => h('option', { value: r.valeur, selected: depart === r.valeur }, r.libelle)), h('option', { value: PLAGE, selected: depart === PLAGE }, 'Dates précises'));
    const du = h('input', { type: 'date', class: 'champ', value: a?.du ?? '', dataset: { filtre: d.id, role: 'du' }, 'aria-label': `${d.libelle} : du` });
    const au = h('input', { type: 'date', class: 'champ', value: a?.au ?? '', dataset: { filtre: d.id, role: 'au' }, 'aria-label': `${d.libelle} : au` });
    const dates = h('div', { class: 'pilotage-filtre-dates' }, h('label', { class: 'bloc-champ' }, etiquette('Du'), du), h('label', { class: 'bloc-champ' }, etiquette('Au'), au));
    const maj = () => { dates.hidden = choix.value !== PLAGE; };
    choix.addEventListener('change', maj);
    maj();
    return {
      element: h('div', { class: 'bloc-champ' }, etiquette(d.libelle), choix, dates),
      lire: () => {
        if (choix.value !== PLAGE) return { ok: true, valeur: { raccourci: choix.value } };
        if (!MOTIF_DATE.test(du.value) || !MOTIF_DATE.test(au.value)) return { ok: false, message: `${d.libelle} : choisis les deux dates.` };
        if (du.value > au.value) return { ok: false, message: `${d.libelle} : la première date doit venir avant la seconde.` };
        return { ok: true, valeur: { du: du.value, au: au.value } };
      },
    };
  }
  if (d.type === 'liste') {
    const options = optionsDe(d);
    const prises = new Set((Array.isArray(a) ? a : []).map(String));
    if (!options.length) {
      return { element: h('div', { class: 'bloc-champ' }, etiquette(d.libelle), h('p', { class: 'aide', dataset: { role: 'sans-valeurs', filtre: d.id } }, 'Les valeurs ne sont pas disponibles pour l\'instant.')), lire: () => ({ ok: true, valeur: FL.versRequete('liste', a) }) };
    }
    const note = d.tronquee ? h('p', { class: 'aide', dataset: { role: 'liste-tronquee', filtre: d.id } }, FL.MESSAGE_LISTE_TRONQUEE) : null;
    if (!d.multiple) {
      const choix = h('select', { class: 'champ', dataset: { filtre: d.id, role: 'choix' }, 'aria-label': d.libelle },
        h('option', { value: '' }, 'Tous'), ...options.map((o, i) => h('option', { value: String(i), selected: prises.has(String(o.valeur)) }, o.libelle)));
      return { element: h('div', { class: 'bloc-champ' }, etiquette(d.libelle), choix, note), lire: () => ({ ok: true, valeur: choix.value === '' ? [] : [options[Number(choix.value)].valeur] }) };
    }
    const cases = options.map((o, i) => ({ o, entree: h('input', { type: 'checkbox', checked: prises.has(String(o.valeur)), dataset: { filtre: d.id, i: String(i) } }) }));
    const lignes = cases.map(({ o, entree }) => ({ texte: normaliser(o.libelle), label: h('label', { class: 'case' }, entree, o.libelle) }));
    const recherche = options.length > NOMBRE_RECHERCHE
      ? h('input', { type: 'search', class: 'champ', placeholder: 'Rechercher dans la liste', 'aria-label': `${d.libelle} : rechercher`, dataset: { filtre: d.id, role: 'recherche' },
        oninput: (e) => { const q = normaliser(e.target.value.trim()); for (const l of lignes) l.label.hidden = q !== '' && !l.texte.includes(q); } })
      : null;
    return {
      element: h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, d.libelle), recherche, h('div', { class: 'cases pilotage-cases' }, ...lignes.map((l) => l.label)), note),
      lire: () => ({ ok: true, valeur: cases.filter(({ entree }) => entree.checked).map(({ o }) => o.valeur) }),
    };
  }
  if (d.type === 'intervalle') {
    const champ = (cle, libelle, valeur) => h('input', { type: 'number', step: 'any', class: 'champ', value: valeur ?? '', dataset: { filtre: d.id, role: cle }, 'aria-label': `${d.libelle} : ${libelle}` });
    const min = champ('min', 'minimum', a?.min);
    const max = champ('max', 'maximum', a?.max);
    return {
      element: h('div', { class: 'bloc-champ' }, etiquette(d.libelle), h('div', { class: 'pilotage-filtre-dates' }, h('label', { class: 'bloc-champ' }, etiquette('Minimum'), min), h('label', { class: 'bloc-champ' }, etiquette('Maximum'), max))),
      lire: () => {
        const v = {};
        for (const [cle, el] of [['min', min], ['max', max]]) {
          if (el.value.trim() === '') continue;
          const n = Number(el.value);
          if (!Number.isFinite(n)) return { ok: false, message: `${d.libelle} : ce n'est pas un nombre.` };
          v[cle] = n;
        }
        if (v.min !== undefined && v.max !== undefined && v.min > v.max) return { ok: false, message: `${d.libelle} : le minimum dépasse le maximum.` };
        return { ok: true, valeur: v };
      },
    };
  }
  // oui_non : oui / non / indifférent
  const depart = a === true ? 'oui' : (a === false ? 'non' : '');
  const choix = h('select', { class: 'champ', dataset: { filtre: d.id, role: 'oui-non' }, 'aria-label': d.libelle },
    h('option', { value: '', selected: depart === '' }, 'Indifférent'), h('option', { value: 'oui', selected: depart === 'oui' }, 'Oui'), h('option', { value: 'non', selected: depart === 'non' }, 'Non'));
  return { element: h('div', { class: 'bloc-champ' }, etiquette(d.libelle), choix), lire: () => ({ ok: true, valeur: choix.value === 'oui' ? true : (choix.value === 'non' ? false : null) }) };
}

/** La fenêtre « Filtres » : rend { editions } (identifiant -> valeur de forme requête), 'effacer', ou null si on ferme sans choisir. */
export async function fenetreFiltresPilotage(decls) {
  const controles = decls.map((d) => ({ d, c: controle(d) }));
  const message = h('p', { class: 'aide pilotage-filtre-erreur', role: 'alert', dataset: { role: 'erreur-filtres' }, hidden: true });
  const corps = h('div', { class: 'pile filtres-corps' }, ...controles.map(({ c }) => c.element), message);
  let editions = {};
  const r = await dialogue({
    titre: 'Filtres', classe: 'dialogue-formulaire dialogue-filtres dialogue-filtres-defile', contenu: corps,
    boutons: [
      { libelle: 'Tout effacer', valeur: 'effacer' },
      { libelle: 'Appliquer', valeur: 'appliquer', style: 'principal', avantFermeture: () => {
        const sortie = {};
        for (const { d, c } of controles) {
          const l = c.lire();
          if (!l.ok) { message.textContent = l.message; message.hidden = false; return false; }
          sortie[d.id] = l.valeur;
        }
        editions = sortie;
        return true;
      } },
    ],
  });
  if (r === 'effacer') return 'effacer';
  return r === 'appliquer' ? { editions } : null;
}

/**
 * La barre : `surChoix(transformer)` est appelé avec une fonction `(memoire) => memoire` (l'écran la applique à la mémoire de l'onglet puis relit l'onglet).
 * Renvoie { element, afficher(decls, { message }), vider() } ; `ouvrir()` ouvre la fenêtre (utile aux tests).
 */
export function creerBarreFiltres({ surChoix, ouvrirFenetre = fenetreFiltresPilotage }) {
  let decls = [];
  const bouton = boutonFiltres({ auClic: () => ouvrir() });
  const bascule = h('button', { type: 'button', class: 'bouton bouton-discret pilotage-filtres-bascule', 'aria-expanded': 'false', dataset: { action: 'replier-filtres' }, onclick: () => {
    const ouvert = element.classList.toggle('pilotage-filtres-ouvert');
    bascule.setAttribute('aria-expanded', String(ouvert));
  } });
  const actifs = h('div', { class: 'pilotage-filtres-actifs', dataset: { role: 'filtres-actifs' } });
  const note = h('p', { class: 'aide pilotage-filtres-note', role: 'status', hidden: true, dataset: { role: 'note-filtres' } });
  const element = h('div', { class: 'pilotage-filtres', hidden: true }, h('div', { class: 'pilotage-filtres-ligne' }, bouton.element, bascule), actifs, note);

  async function ouvrir() {
    if (!decls.length) return;
    const r = await ouvrirFenetre(decls);
    if (r === 'effacer') surChoix((m) => FL.toutEffacer(m, decls));
    else if (r?.editions) surChoix((m) => FL.fusionner(m, decls, r.editions));
  }

  function afficher(liste, { message = '' } = {}) {
    decls = Array.isArray(liste) ? liste : [];
    element.hidden = !decls.length;
    const ps = FL.pastilles(decls);
    const n = FL.nombreActifs(decls);
    bouton.majCompte(n);
    remplir(bascule, icone('funnel', { taille: 14 }), n ? `Filtres actifs (${n})` : 'Aucun filtre actif');
    bascule.disabled = !ps.length;
    if (!ps.length) { element.classList.remove('pilotage-filtres-ouvert'); bascule.setAttribute('aria-expanded', 'false'); }
    remplir(actifs,
      ...ps.map((p) => h('span', { class: 'pastille-filtre pilotage-filtre-pastille', dataset: { filtre: p.id, cle: p.cle } }, p.texte,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.texte}`, dataset: { action: 'retirer-filtre' }, onclick: () => surChoix((m) => FL.retirerPastille(m, decls, p)) }, icone('x', { taille: 12 })))),
      ps.length > 1 ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'effacer-filtres' }, onclick: () => surChoix((m) => FL.toutEffacer(m, decls)) }, 'Effacer tout') : null);
    note.textContent = message;
    note.hidden = !message;
  }

  const vider = () => { decls = []; element.hidden = true; remplir(actifs); note.hidden = true; };
  return { element, afficher, vider, ouvrir };
}
