// Boutique du village (étape 6b de docs/accueil-village.md, 27/11/2026) : la fenêtre où l'on dépense ses pièces d'or. Ouverte par le bouton « Boutique », à droite
// du compteur d'or (js/os/village-ecran.js). Ce fichier ne parle ni à la base ni au serveur : l'écran lui donne le solde, les parcelles, le nombre d'objets,
// la case libre, les vignettes et la fonction d'achat (`surAcheter`), qui passe par js/os/village-or.js.
//  - une ligne par article : les 5 décorations (20 pièces) puis la parcelle de terrain (500 pièces) ; champ et enclos viendront à l'étape 7 ;
//  - un article qu'on ne peut pas acheter a son bouton grisé et une phrase neutre dessous (pas assez d'or, terrain au plus grand, 40 objets, village plein),
//    sans aucune demande au serveur ;
//  - pendant un achat, tous les boutons sont grisés (un double clic ne fait qu'une demande) ; réussite : la fenêtre se ferme ; refus « pas assez » :
//    la ligne passe grisée avec ce qui manque ; autre refus ou panne : la fenêtre reste, avec « L’achat n’a pas abouti. Réessaie. ».
// Textes par h() (textContent), tutoiement, apostrophes typographiques. Aucun son.
import { h, dialogue } from './ui.js';
import { PRIX, PARCELLES_MAX, OBJETS_MAX, MODELES_DECORATION, manque, texteManque, texteOr } from './village-jeu-regles.js';
import { DESSINS_JEU } from './village-jeu-dessins.js';

export const ECHEC_ACHAT = 'L’achat n’a pas abouti. Réessaie.';
const TERRAIN_MAX = 'Ton terrain est au plus grand.';
const OBJETS_PLEIN = `${OBJETS_MAX} objets au plus.`;
const PLEIN_PARCELLE = 'Ton village est plein : achète une parcelle.';
const PLEIN = 'Ton village est plein.';

/** Pourquoi un article ne peut pas être acheté (phrase), ou null s'il peut l'être. */
function refusAvant(article, { or, parcelles, objets, caseLibre }) {
  if (article === 'parcelle') {
    if (parcelles >= PARCELLES_MAX) return TERRAIN_MAX;
    return or < PRIX.parcelle ? texteManque(manque(PRIX.parcelle, or)) : null;
  }
  if (objets >= OBJETS_MAX) return OBJETS_PLEIN;
  if (!caseLibre()) return parcelles >= PARCELLES_MAX ? PLEIN : PLEIN_PARCELLE;
  return or < PRIX.decoration ? texteManque(manque(PRIX.decoration, or)) : null;
}

/**
 * Ouvre la boutique. `or`, `parcelles`, `objets` : nombres connus ; `caseLibre()` : une case { c, l } libre pour une décoration, ou null ;
 * `dessin(id)` : la vignette SVG d'un article ; `surAcheter(article, modele)` : Promise { ok: true } | { ok: false, or?, parcelles?, message?, manque? } (`or`, `parcelles` : ce qui est connu après le refus).
 */
export function ouvrirBoutique({ or, parcelles, objets, caseLibre, dessin, surAcheter }) {
  const etat = { or: Number.isInteger(or) ? or : 0, parcelles: Number.isInteger(parcelles) ? parcelles : 0, objets: Number.isInteger(objets) ? objets : 0, caseLibre };
  const message = h('p', { class: 'village-boutique-message', role: 'alert', dataset: { role: 'boutique-message' }, hidden: true });
  let fermerFenetre = null;
  let occupe = false;
  const lignes = [];

  const articles = [
    ...MODELES_DECORATION.map((modele) => ({ article: 'decoration', modele, nom: DESSINS_JEU[modele]?.nom ?? modele, phrase: '', prix: PRIX.decoration })),
    { article: 'parcelle', modele: '', nom: 'Parcelle de terrain', phrase: 'Ton terrain gagne 2 cases en largeur et en profondeur.', prix: PRIX.parcelle },
  ];

  /** Grise (ou non) une ligne, avec sa phrase. */
  function poserRefus(ligne, texte) {
    ligne.refus = texte;
    ligne.manque.textContent = texte || '';
    ligne.manque.hidden = !texte;
    ligne.bouton.disabled = Boolean(texte) || occupe;
    ligne.li.classList.toggle('village-boutique-grise', Boolean(texte));
    if (texte) ligne.bouton.setAttribute('aria-describedby', ligne.manque.id); else ligne.bouton.removeAttribute('aria-describedby');
  }
  const majBoutons = () => { for (const l of lignes) l.bouton.disabled = Boolean(l.refus) || occupe; };

  async function acheter(ligne) {
    if (occupe || ligne.refus) return;
    occupe = true;
    majBoutons();
    message.hidden = true;
    let r;
    try { r = await surAcheter(ligne.article, ligne.modele || undefined); } catch { r = { ok: false }; }
    occupe = false;
    if (r?.ok) { fermerFenetre?.(true, true); return; }
    // le solde du serveur a pu changer (dépensé ailleurs) : toutes les lignes sont revues avec lui, pas seulement celle-ci
    if (Number.isInteger(r?.or) && r.or >= 0) etat.or = r.or;
    if (Number.isInteger(r?.parcelles) && r.parcelles > etat.parcelles) etat.parcelles = r.parcelles;
    for (const l of lignes) poserRefus(l, refusAvant(l.article, etat));
    if (Number.isInteger(r?.manque) && r.manque > 0) poserRefus(ligne, texteManque(r.manque));
    else { message.textContent = r?.message || ECHEC_ACHAT; message.hidden = false; }
    majBoutons();
  }

  const liste = h('ul', { class: 'village-boutique-liste' });
  articles.forEach((a, i) => {
    const id = `boutique-manque-${i}-${Math.random().toString(36).slice(2, 6)}`;
    const manqueEl = h('small', { id, class: 'village-boutique-manque', dataset: { role: 'manque' }, hidden: true });
    const bouton = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { role: 'acheter' } }, 'Acheter');
    const textes = h('span', { class: 'village-boutique-textes' },
      h('b', { class: 'village-boutique-nom' }, a.nom),
      a.phrase ? h('span', { class: 'village-boutique-phrase' }, a.phrase) : null,
      h('span', { class: 'village-boutique-prix', dataset: { role: 'prix' } }, texteOr(a.prix)),
      manqueEl);
    const vignette = h('span', { class: 'village-boutique-vignette', 'aria-hidden': 'true' });
    const image = dessin(a.article === 'parcelle' ? 'parcelle' : a.modele);
    if (image) vignette.append(image);
    const li = h('li', { class: 'village-boutique-ligne', dataset: { article: a.article, modele: a.modele } }, vignette, textes, bouton);
    const ligne = { ...a, li, bouton, manque: manqueEl, refus: null };
    bouton.addEventListener('click', () => { void acheter(ligne); });
    lignes.push(ligne);
    poserRefus(ligne, refusAvant(a.article, etat));
    liste.append(li);
  });

  return dialogue({
    titre: 'Boutique',
    classe: 'village-boutique',
    contenu: h('div', { class: 'village-boutique-corps', dataset: { role: 'boutique' } }, liste, message),
    boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }],
    auMontage: ({ fermer }) => { fermerFenetre = fermer; },
  });
}
