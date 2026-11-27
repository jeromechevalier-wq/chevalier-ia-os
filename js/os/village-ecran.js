// Écran d'accueil « village » d'une maison (26/11/2026) : un terrain isométrique, un bâtiment par besoin, rien d'autre (ni journal, ni carrés).
// Étape 2 de docs/accueil-village.md (27/11/2026) : le terrain est un DAMIER de 8 x 8 cases (js/os/village-damier.js) que CHAQUE utilisateur range :
//  - les besoins arrivent déjà vérifiés (js/os/maison-village.js, 12 au plus) et filtrés sur les modules allumés pour ce compte (js/main.js) ;
//  - le rangement de l'utilisateur (une place, un nom à lui, caché ou non, par maison) est lu UNE fois à l'ouverture (js/os/village-donnees.js) ;
//    sans rangement lu (pas de données, lecture refusée ou en panne) : le village d'office, sans glisser ni double clic ;
//  - une grande maison occupe 2 x 2 cases ; au premier rangement, les maisons prennent les places d'office (D10) ;
//  - gestes (js/os/village-glisser.js) : glisser une maison sur des cases libres (souris ou doigt) ; double clic (ordinateur) ou appui long (téléphone) : ses réglages ;
//  - le décor (arbres, fleurs) n'est posé que sur des cases libres ; il n'est ni cliquable ni atteignable au clavier (aria-hidden).
// Sous chaque bâtiment, une étiquette permanente : le nom seul. Au survol ou au focus clavier, une BULLE (carte blanche avec une petite flèche) : le nom, la phrase,
// la pastille du compteur s'il y en a un (js/os/village-compteurs.js ; « Compte en cours » pendant la lecture, illisible = pas de pastille) et « Cliquez pour entrer ».
// Aucun `title` ni <title> SVG (infobulle grise du navigateur en double avec la bulle) : le nom accessible est l'aria-label du bâtiment. Textes par textContent, jamais innerHTML.
// Ordinateur : un clic (après 280 ms quand le rangement est possible), Entrée ou Espace sur un bâtiment ouvre sa cible (une route interne « #/… »).
// Téléphone (moins de 768 px) : le dessin fait 160 % de la largeur de l'écran et glisse au doigt ; un premier toucher montre la bulle, un second ouvre la cible ;
// un bouton « Liste » montre les mêmes maisons en liste de liens (js/os/village-liste.js).
// Étape 1 de docs/accueil-village.md (27/11/2026) : hors du terrain (HTML, pas dans le SVG), une roue dentée en haut à droite (js/os/village-reglages.js :
// réglages de l'ACCUEIL seulement), et deux îlots fixes dans les coins bas : la Mairie (bas gauche, toujours ; ouvre la page Réglages) et la
// Console (bas droite, seulement si `console` est vrai, c'est-à-dire si la Console est dans les modules de la session : titulaire seul). Un îlot est un vrai lien
// (Tab, Entrée) ; sur téléphone, un seul toucher l'ouvre (nom et sous-titre déjà écrits dessous, pas de bulle). Les îlots n'ont ni data-role="batiment", ni
// data-maison : ils ne comptent pas parmi les besoins, ne se déplacent pas et ne se cachent pas.
// Étape 3b (27/11/2026) : un LIEN EXTERNE est une maison (document `lien`) dessinée comme un <a> SVG (href, target="_blank", rel="noopener noreferrer") ; son clic
// passe par les gestes puis window.open(url, '_blank', 'noopener,noreferrer') : jamais location.href ni aller(). L'adresse est posée par setAttribute et
// textContent, jamais injectée en HTML. Une adresse qui ne passe plus le contrôle (adresseExterne) : maison grisée, sans href, jamais ouverte.
// Étape 4 (petites maisons « vue filtrée », étape 3c du 27/11/2026, js/os/village-petites.js) : une petite maison (1 x 1 case, le dessin de sa grande à
// demi-taille, sans étiquette) est collée à une grande maison d'un module qui sait montrer un seul élément ; son clic ouvre « ce chantier seulement ».
//  - manuelles : documents `petite`, ajoutées par « Ajouter une petite maison » (fenêtre de la grande), réglées par double clic ou appui long ;
//  - automatiques (un chantier en cours, un projet actif) : jamais écrites, calculées à chaque affichage ; leur fenêtre n'a que « Cacher du village » (3c-bis) ;
//  - les éléments sont lus UNE fois par affichage et par module (js/os/village-petites-lecture.js, 20 s au plus) ; pendant la lecture, aucune petite maison ;
//    en panne : aucune automatique, toutes les manuelles ; un élément disparu d'une lecture réussie : sa manuelle n'est pas montrée (document gardé) ;
//  - une petite maison ne se glisse pas : elle suit sa grande ; sa place n'est jamais enregistrée (recalculée autour de la grande à chaque dessin).
// Étape 6b (boutique, 27/11/2026) : à droite du compteur d'or, un bouton « Boutique » (js/os/village-boutique.js) ; l'achat passe par js/os/village-or.js.
//  - le damier montré grandit avec les parcelles achetées : le plus grand entre damierDe(parcelles connues) et le damier qui contient toutes les places enregistrées ;
//  - un objet acheté (décoration) est dessiné sur sa case (data-role="objet", sans lien, sans bulle, sans halo) ; il se glisse comme une maison et rien d'autre
//    (clic, double clic, appui long : rien) ; il n'est ni dans la liste, ni dans la roue, ni compté parmi les maisons ;
//  - la case proposée à l'achat est la case libre la plus « devant » du damier payé (caseLibreDevant, celui que le serveur vérifie), hors des maisons,
//    petites maisons, objets, places enregistrées et cases déjà refusées par le serveur pendant l'affichage ;
//  - un objet se saisit partout sur sa case : un losange transparent sous son dessin prend le pointeur (pas sous une maison dessinée devant lui).
// 3c-bis (27/11/2026) : les projets actifs ont aussi leur petite maison automatique ; une automatique se cache (double clic ou appui long, « Cacher du village » :
// un document `petite` avec `cachee: true`) et se remontre par la roue dentée (« Petites maisons cachées », « Remontrer »). Plus de plafond de petites maisons
// par personne : seule limite, une case voisine libre (12 au plus par grande). Une petite maison se saisit sur toute sa case (losange transparent « prise-petite »).
// Téléphone : une bulle ouverte ne relance plus le redessin toutes les 300 ms ; il part quand la bulle se ferme.
// Étape 7 (champs et enclos à cochons, 27/11/2026) : un champ ou un enclos (2 x 2 cases) est dessiné selon son état, recalculé à chaque dessin avec la même règle
// que le serveur (etatRecolte) : champ semé, qui pousse, mûr, prêt ; enclos vide ou bien gras. Prêt : une petite pièce d'or immobile au-dessus. Un clic (ou un toucher,
// ou Entrée et Espace sur un objet prêt) demande la récolte au serveur (js/os/village-or.js, ramasserOr) ; pas prêt : un message neutre, aucune demande.
// Aucune minuterie : l'état est recalculé au dessin, au retour sur l'onglet (visibilitychange) et au moment du clic. `depuis` n'est jamais écrit par l'écran.
import { dessinBatiment, pastilleBulle, ETIQUETTE_Y } from './maison-village.js';
import { lireCompteur } from './village-compteurs.js';
import { BATIMENTS_FIXES, dessinBatimentFixe, iso } from './village-batiments.js';
import { boutonReglagesAccueil, animationsCoupees, fenetreMaison, fenetreLien, fenetreChoixPetite, fenetrePetite, fenetrePetiteAuto } from './village-reglages.js';
import {
  DAMIER_DEPART, TAILLE_GRANDE, centreBloc, vueVillage, formesDamier, lignesDamier, losangeBloc, decorLibre, occupation, blocLibre, premierBlocLibre,
  lireBatiments, rangerVillage, docDeplacement, docCacher, docRenommer, docLien, nomCourt, LIENS_MAX, damierPourPlaces, estSorteJeu, caseLibreDevant,
} from './village-damier.js';
import { rangerPetites, sourcePour, docPetite, docCachee, petitesCachees, moduleDeCible, CACHEES_MAX } from './village-petites.js';
import { dessinJeu, DESSINS_JEU, ETAPES_CHAMP, ETATS_ENCLOS } from './village-jeu-dessins.js';
import { ouvrirBoutique } from './village-boutique.js';
import { brancherGestes, groupeSous } from './village-glisser.js';
import { listeMaisons, boutonVue, vueChoisie } from './village-liste.js';
import { lien } from './router.js';
import { toast, icone } from './ui.js';
import { texteOr, damierDe, casesEnregistrees, OBJETS_MAX, SORTES_RECOLTE, etatRecolte, TAILLES } from './village-jeu-regles.js';
import { dessinPiece } from './village-fete.js';

const NS = 'http://www.w3.org/2000/svg';
const TROP_DE_LIENS = `${LIENS_MAX} liens au plus : retire un lien pour en ajouter un.`;
const VILLAGE_PLEIN = 'Ton village est plein : cache une maison pour faire de la place.';
const TROP_DE_CACHEES = `${CACHEES_MAX} petites maisons cachées au plus : remontre-en une avec la roue dentée.`;
const PLUS_DE_PLACE = 'Plus de place autour de cette maison : déplace-la ou retire une petite maison.';
const TELEPHONE = '(max-width: 767px)';
// Tailles des étiquettes en unités du dessin (le dessin est agrandi d'environ 1,8 fois sur un écran d'ordinateur 1440 x 900 ; sur un téléphone de 390 px,
// il fait 160 % de la largeur de l'écran, soit environ 0,95 fois).
const ORDI = Object.freeze({ nom: 11.5, hauteur: 19, rx: 7, largeurMax: 140, carNom: 0.62, marge: 14 });
const TEL = Object.freeze({ nom: 15, hauteur: 24, rx: 9, largeurMax: 140, carNom: 0.62, marge: 14 });

function el(nom, attrs = {}) {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  return n;
}
const r1 = (v) => Math.round(v * 10) / 10;
const points = (liste, dx, dy) => liste.map(([x, y]) => `${r1(x + dx)},${r1(y + dy)}`).join(' ');

function forme(f, dx = 0, dy = 0) {
  if (f.cercle) {
    const [cx, cy, r] = f.cercle;
    return el('circle', { cx: r1(cx + dx), cy: r1(cy + dy), r, fill: f.fill, stroke: f.trait, 'stroke-width': f.trait ? 1.5 : undefined, opacity: f.opacite });
  }
  if (f.ellipse) {
    const [cx, cy, rx, ry] = f.ellipse;
    return el('ellipse', { cx: r1(cx + dx), cy: r1(cy + dy), rx, ry, fill: f.fill, opacity: f.opacite });
  }
  if (f.ligne) {
    const [[x1, y1], [x2, y2]] = f.ligne;
    return el('line', { x1: r1(x1 + dx), y1: r1(y1 + dy), x2: r1(x2 + dx), y2: r1(y2 + dy), stroke: f.trait, 'stroke-width': f.epaisseur, 'stroke-linecap': 'round' });
  }
  return el('polygon', { points: points(f.poly, dx, dy), fill: f.fill, opacity: f.opacite });
}

/** Une ligne d'étiquette : resserrée (textLength) seulement si elle dépasse la largeur permise. */
function texte(contenu, attrs, largeurEstimee, largeurMax) {
  const t = el('text', { 'text-anchor': 'middle', ...attrs });
  if (largeurEstimee > largeurMax) { t.setAttribute('textLength', r1(largeurMax)); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  t.textContent = contenu;
  return t;
}

/** Étiquette permanente sous le bâtiment : le nom seul (la phrase et le compteur sont dans la bulle). */
function etiquette(besoin, x, y, telephone, externe = false) {
  const t = telephone ? TEL : ORDI;
  const g = el('g', { class: 'village-etiquette' });
  const largeurNom = besoin.nom.length * t.nom * t.carNom;
  const icon = externe ? t.nom * 0.95 : 0; // petite marque « lien externe » à droite du nom
  const ecart = externe ? 3 : 0;
  const largeur = Math.min(largeurNom, t.largeurMax) + t.marge + icon + ecart;
  g.append(el('rect', { x: r1(x - largeur / 2), y: r1(y), width: r1(largeur), height: t.hauteur, rx: t.rx, fill: '#FFFDF6', stroke: '#3b2412', 'stroke-opacity': 0.18, 'stroke-width': telephone ? 1 : 0.6 }));
  const xNom = x - (icon + ecart) / 2;
  g.append(texte(besoin.nom, { x: r1(xNom), y: r1(y + t.hauteur * 0.69), 'font-size': t.nom, 'font-weight': 800, fill: '#2A1A2C', 'data-role': 'batiment-nom' }, largeurNom, t.largeurMax));
  if (externe) {
    const marque = icone('external-link');
    for (const [k, v] of Object.entries({ x: r1(xNom + Math.min(largeurNom, t.largeurMax) / 2 + ecart), y: r1(y + (t.hauteur - icon) / 2), width: r1(icon), height: r1(icon), color: '#2A1A2C', 'data-role': 'marque-externe' })) marque.setAttribute(k, String(v));
    g.append(marque);
  }
  return g;
}

/** Le besoin tel que l'utilisateur le voit : son nom choisi à la place du nom d'origine. */
const besoinVu = (maison) => ({ ...maison.besoin, nom: maison.nom });
const estLien = (maison) => maison.sorte === 'lien';
const estPetite = (maison) => maison.sorte === 'petite';

/** Ouvre une maison : un besoin va sur sa route ; un lien externe valable s'ouvre dans un NOUVEL onglet, sans lien avec l'appli (noopener, noreferrer). */
function ouvrir(maison, ctx) {
  if (estPetite(maison)) { ctx.aller(maison.cible); return; } // une petite maison : l'écran de son module sur ce seul élément
  if (!estLien(maison)) { ctx.aller(maison.besoin.cible); return; }
  if (maison.invalide) return;
  window.open(maison.url, '_blank', 'noopener,noreferrer');
}

/**
 * Bâtiment (le lien accessible). `ctx` : { telephone, aller, bulle, gestes } ; `place` : { x, y } à l'écran.
 * Ordinateur : clic, Entrée, Espace ouvrent la cible. Téléphone : le premier toucher montre la bulle, le second ouvre la cible (Entrée et Espace ouvrent toujours).
 * Avec le rangement (ctx.gestes), le clic passe par js/os/village-glisser.js (délai, double clic, glisser) : l'écoute du clic ci-dessous ne le reçoit plus.
 */
function batiment(maison, place, ctx) {
  const besoin = besoinVu(maison);
  const lienExterne = estLien(maison);
  const g = el(lienExterne ? 'a' : 'g', {
    class: `village-batiment${maison.invalide ? ' village-batiment-invalide' : ''}`, tabindex: 0, role: 'link', 'data-role': 'batiment', 'data-batiment': besoin.batiment,
    'data-cible': besoin.cible, 'data-maison': maison.id, 'data-case': `${maison.c}-${maison.l}`, 'data-sorte': lienExterne ? 'lien' : undefined,
  });
  if (lienExterne && !maison.invalide) { g.setAttribute('href', maison.url); g.setAttribute('target', '_blank'); g.setAttribute('rel', 'noopener noreferrer'); }
  if (lienExterne) g.setAttribute('aria-label', maison.invalide ? `${besoin.nom} : adresse refusée` : `${besoin.nom} : ouvre ${maison.url} dans un nouvel onglet`);
  else g.setAttribute('aria-label', besoin.phrase ? `${besoin.nom} : ${besoin.phrase}` : besoin.nom); // pas de <title> : il ferait une infobulle grise en plus de la bulle
  g.append(el('ellipse', { class: 'village-halo', cx: r1(place.x), cy: r1(place.y - 40), rx: 96, ry: 84, fill: 'url(#village-halo)' }));
  const lever = el('g', { class: 'village-lever' });
  for (const f of dessinBatiment(besoin.batiment)) lever.append(forme(f, place.x, place.y));
  g.append(lever);
  g.addEventListener('click', (e) => { e.preventDefault(); toucher(ctx.maisonSous?.(e) ?? maison, ctx); });
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    ouvrir(maison, ctx);
  });
  // Survol et focus : seulement sur ordinateur (sur téléphone, un toucher déclenche aussi le survol et le focus : la bulle y suit les touchers).
  // le survol (souris) est suivi par le dessin entier (dessiner) : la lueur d'une voisine ne vole pas la bulle (3c, Fable B1)
  g.addEventListener('focus', () => { if (!ctx.telephone) ctx.bulle.montrer(maison); });
  g.addEventListener('blur', () => { if (!ctx.telephone) ctx.bulle.cacher(maison.id); });
  return g;
}
/**
 * Petite maison (étape 3c) : le dessin de sa grande à demi-taille sur une case, sans étiquette (le nom est dans la bulle). Mêmes gestes que les grandes
 * (clic, Entrée, Espace ; téléphone : la bulle d'abord). `data-parent` : elle suit sa grande pendant un glisser. Pas de data-role="batiment" (elle ne compte
 * pas parmi les besoins).
 */
function petiteMaison(petite, place, ctx) {
  const g = el('g', {
    class: 'village-batiment village-petite', tabindex: 0, role: 'link', 'data-role': 'petite-maison', 'data-maison': petite.id, 'data-parent': petite.parent,
    'data-case': `${petite.c}-${petite.l}`, 'data-sorte': 'petite', 'data-auto': petite.auto ? 'oui' : 'non', 'data-cible': petite.cible, 'data-batiment': petite.batiment,
  });
  g.setAttribute('aria-label', petite.sousTitre ? `${petite.nom} : ${petite.sousTitre}` : petite.nom);
  g.append(el('ellipse', { class: 'village-halo', cx: r1(place.x), cy: r1(place.y - 20), rx: 46, ry: 40, fill: 'url(#village-halo)' }));
  // 3c-bis (4a) : la prise, toute la case, transparente (comme prise-objet ; ce n'est pas une lueur : groupeSous la prend pour un corps)
  g.append(el('polygon', { points: points(losangeBloc(petite.c, petite.l, 1, ctx.damier), 0, 0), fill: 'transparent', 'pointer-events': 'all', 'data-role': 'prise-petite' }));
  const lever = el('g', { class: 'village-lever' });
  const reduit = el('g', { transform: `translate(${r1(place.x)} ${r1(place.y)}) scale(0.5)` });
  for (const f of dessinBatiment(petite.batiment)) reduit.append(forme(f));
  lever.append(reduit);
  g.append(lever);
  g.addEventListener('click', (e) => { e.preventDefault(); toucher(ctx.maisonSous?.(e) ?? petite, ctx); });
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    ouvrir(petite, ctx);
  });
  g.addEventListener('focus', () => { if (!ctx.telephone) ctx.bulle.montrer(petite); });
  g.addEventListener('blur', () => { if (!ctx.telephone) ctx.bulle.cacher(petite.id); });
  return g;
}

/** Date d'un document (Date à l'écran après un achat ou une récolte, Timestamp à la lecture) en millisecondes ; null sinon. */
function enMs(v) {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

/** État de récolte d'un champ ou d'un enclos à l'heure `maintenant` (la même règle que le serveur) ; null pour une décoration. */
const etatDeLObjet = (o, maintenant) => (SORTES_RECOLTE.includes(o.sorte) ? etatRecolte(o.sorte, enMs(o.donnees?.depuis), maintenant) : null);

/** Dessin d'un objet acheté : la décoration choisie ; champ : son étape de pousse ; enclos : vide ou bien gras (étape 7). */
function dessinDeLObjet(o, maintenant) {
  if (o.sorte === 'decoration') return o.modele;
  const e = etatDeLObjet(o, maintenant);
  return o.sorte === 'champ' ? ETAPES_CHAMP[e?.etape ?? 0] : ETATS_ENCLOS[e?.pieces > 0 ? 1 : 0];
}

/** Nom accessible d'un objet : le nom de son dessin ; un enclos qui a des pièces dit combien (sans compte à rebours). */
function nomDeLObjet(o, maintenant) {
  const e = etatDeLObjet(o, maintenant);
  if (o.sorte === 'enclos' && e?.pieces > 0) return `Enclos à cochons : ${texteOr(e.pieces)} à ramasser`;
  return DESSINS_JEU[dessinDeLObjet(o, maintenant)]?.nom ?? 'Décoration';
}

/** Message d'un clic sur un champ ou un enclos pas encore prêt. */
const pasPret = (sorte) => (sorte === 'champ' ? 'Ça pousse encore.' : 'Rien à ramasser pour l’instant.');

/** La petite pièce d'or IMMOBILE posée au-dessus d'un objet prêt (couleurs de dessinPiece, sans contour noir ; aucune animation). */
function piecePrete(place) {
  const g = el('g', { 'data-role': 'pret', 'aria-hidden': 'true', 'pointer-events': 'none' });
  const x = r1(place.x);
  const y = r1(place.y - 34); // au milieu de l'objet : au-dessus, l'étiquette d'une maison voisine la cachait (capture 7.1 téléphone)
  g.append(el('circle', { cx: x, cy: y, r: 10, fill: '#D9A21B' }), el('circle', { cx: x, cy: y, r: 8, fill: '#F7C548' }), el('ellipse', { cx: r1(x - 2.6), cy: r1(y - 3), rx: 3, ry: 1.9, fill: '#E8C98A' }));
  return g;
}

/**
 * Objet acheté (6b) : ses formes posées au centre de sa case, sans mise à l'échelle. Sans lien, sans bulle, sans halo, sans `title` : il se glisse
 * (js/os/village-glisser.js le trouve par data-maison). Une décoration, un champ ou un enclos pas prêt : une image (role="img"). Étape 7 : un champ ou un enclos
 * PRÊT est un bouton (tabindex, Entrée et Espace récoltent), avec la pièce prête ; `data-dessin` dit le dessin montré et `data-etat` « pret » ou « attente ».
 */
function objetJeu(o, place, damier, ctx) {
  const maintenant = ctx?.maintenant ?? Date.now();
  const id = dessinDeLObjet(o, maintenant);
  const e = etatDeLObjet(o, maintenant);
  const g = el('g', {
    class: 'village-objet', 'data-role': 'objet', 'data-maison': o.id, 'data-sorte': o.sorte, 'data-modele': o.modele, 'data-case': `${o.c}-${o.l}`, role: e?.pret ? 'button' : 'img',
    'data-dessin': id, 'data-etat': e ? (e.pret ? 'pret' : 'attente') : undefined, tabindex: e?.pret ? 0 : undefined,
  });
  g.setAttribute('aria-label', nomDeLObjet(o, maintenant));
  // la prise : toute la case, transparente (un objet fin, comme la clôture, se saisit sans viser son dessin)
  g.append(el('polygon', { points: points(losangeBloc(o.c, o.l, o.taille || 1, damier), 0, 0), fill: 'transparent', 'pointer-events': 'all', 'data-role': 'prise-objet' }));
  for (const f of dessinJeu(id)) g.append(forme(f, place.x, place.y));
  if (e?.pret) {
    g.append(piecePrete(place)); // un enfant du groupe, après les formes, qui ne prend pas le pointeur
    g.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ctx?.recolter?.(o);
    });
  }
  return g;
}

/** Clic ou toucher : sur téléphone, la bulle d'abord ; sinon (ou si la bulle de ce bâtiment est déjà ouverte) la cible. */
function toucher(maison, ctx) {
  if (ctx.telephone && !ctx.bulle.ouverte(maison.id)) { ctx.bulle.montrer(maison); return; }
  ouvrir(maison, ctx);
}

/** L'étiquette d'un bâtiment, dessinée après tout le reste (un toit voisin ne la cache jamais). Même effet que le bâtiment ; le lien accessible reste le bâtiment. */
function lienEtiquette(maison, place, b, ctx) {
  const g = el('g', { class: 'village-lien-etiquette', 'aria-hidden': 'true', 'data-role': 'etiquette', 'data-maison': maison.id, 'data-case': `${maison.c}-${maison.l}`, 'data-cible': maison.besoin.cible });
  g.append(etiquette(besoinVu(maison), place.x, place.y + ETIQUETTE_Y, ctx.telephone, estLien(maison)));
  g.addEventListener('click', () => toucher(maison, ctx));
  g.addEventListener('mouseenter', () => { b.classList.add('survol'); if (!ctx.telephone && !ctx.rangementEnCours()) ctx.bulle.montrer(maison); });
  g.addEventListener('mouseleave', () => { b.classList.remove('survol'); if (!ctx.telephone) ctx.bulle.cacher(maison.id); });
  for (const [ev, oui] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) b.addEventListener(ev, () => g.classList.toggle('actif', oui));
  return g;
}

function dessiner(maisons, ctxRendu, petites = [], objets = []) {
  const damier = ctxRendu.damier || DAMIER_DEPART;
  const parId = new Map([...maisons, ...petites].map((m) => [m.id, m]));
  /** La maison (grande ou petite) sous le pointeur, lueurs des voisines écartées (village-glisser.js, groupeSous). */
  const maisonSous = (e) => { const r = groupeSous(e); return r ? parId.get(r.groupe.getAttribute('data-maison')) ?? null : null; };
  const ctx = { ...ctxRendu, maisonSous };
  const vue = vueVillage(damier);
  const svg = el('svg', {
    class: 'village-scene', viewBox: `${r1(vue.x)} ${r1(vue.y)} ${r1(vue.largeur)} ${r1(vue.hauteur)}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': 'Accueil : choisis ce que tu veux faire', 'data-role': 'village', 'data-disposition': ctx.telephone ? 'terrain-telephone' : 'terrain',
  });
  const defs = el('defs');
  const halo = el('radialGradient', { id: 'village-halo', cx: 0.5, cy: 0.5, r: 0.5 });
  halo.append(el('stop', { offset: 0, 'stop-color': '#FFF3B0', 'stop-opacity': 0.95 }), el('stop', { offset: 1, 'stop-color': '#FFF3B0', 'stop-opacity': 0 }));
  defs.append(halo);
  svg.append(defs);

  // 1. Le terrain (tranche et herbe), le quadrillage (visible seulement pendant le rangement), puis la place pavée de chaque maison (à plat).
  const terrain = el('g', { class: 'village-terrain', 'aria-hidden': 'true' });
  for (const f of formesDamier(damier)) terrain.append(forme(f));
  svg.append(terrain);
  const quadrillage = el('g', { class: 'village-damier', 'data-role': 'damier', 'data-colonnes': damier.colonnes, 'data-lignes': damier.lignes, 'aria-hidden': 'true' });
  for (const f of lignesDamier(damier)) quadrillage.append(forme(f));
  svg.append(quadrillage);
  for (const m of maisons) {
    const sol = el('g', { class: 'village-sol', 'aria-hidden': 'true', 'data-maison': m.id });
    sol.append(el('polygon', { points: points(losangeBloc(m.c, m.l, m.taille, damier, 0.35), 0, 0), fill: '#EFD9AE' }));
    svg.append(sol);
  }
  for (const p of petites) { // le sol d'une petite maison suit sa grande pendant un glisser (data-parent)
    const sol = el('g', { class: 'village-sol', 'aria-hidden': 'true', 'data-parent': p.parent });
    sol.append(el('polygon', { points: points(losangeBloc(p.c, p.l, 1, damier, 0.3), 0, 0), fill: '#EFD9AE' }));
    svg.append(sol);
  }
  // 2. Ce qui est debout (décor des cases libres et bâtiments), du fond vers l'avant (ordre du peintre).
  const debout = [];
  for (const o of decorLibre(occupation([...maisons, ...petites, ...objets]), damier)) {
    debout.push({ profondeur: o.profondeur, noeud: () => { const g = el('g', { class: 'village-decor', 'data-role': 'decor', 'data-case': o.case, 'aria-hidden': 'true' }); for (const f of o.formes) g.append(forme(f)); return g; } });
  }
  const places = new Map(maisons.map((m) => { const [x, y] = iso(...centreBloc(m.c, m.l, m.taille, damier)); return [m.id, { x, y }]; }));
  const noeuds = new Map(maisons.map((m) => [m.id, batiment(m, places.get(m.id), ctx)]));
  for (const m of maisons) {
    const [gx, gy] = centreBloc(m.c, m.l, m.taille, damier);
    debout.push({ profondeur: gx + gy + 0.01, noeud: () => noeuds.get(m.id) });
  }
  for (const p of petites) {
    const [gx, gy] = centreBloc(p.c, p.l, 1, damier);
    const [x, y] = iso(gx, gy);
    noeuds.set(p.id, petiteMaison(p, { x, y }, ctx));
    // une petite sur un côté (même profondeur que sa grande) est dessinée après elle : la lueur de la grande ne la recouvre pas
    debout.push({ profondeur: gx + gy + 0.015, noeud: () => noeuds.get(p.id) });
  }
  for (const o of objets) { // 6b : pas de sol pavé sous un objet
    const [gx, gy] = centreBloc(o.c, o.l, o.taille, damier);
    const [x, y] = iso(gx, gy);
    debout.push({ profondeur: gx + gy + 0.005, noeud: () => objetJeu(o, { x, y }, damier, ctx) });
  }
  debout.sort((u, v) => u.profondeur - v.profondeur);
  for (const o of debout) svg.append(o.noeud());
  // 3. Les étiquettes, devant tout, dans l'ordre des besoins.
  const calque = el('g', { class: 'village-etiquettes' });
  for (const m of maisons) calque.append(lienEtiquette(m, places.get(m.id), noeuds.get(m.id), ctx));
  svg.append(calque);
  // Survol à la souris : la bulle de la maison dont le CORPS est sous le pointeur (une lueur seule n'en change pas). Les étiquettes gardent leurs écoutes.
  let survolee = null;
  const quitter = () => { if (survolee) ctx.bulle.cacher(survolee); survolee = null; };
  svg.addEventListener('mousemove', (e) => {
    if (ctx.telephone || ctx.rangementEnCours()) return;
    const r = groupeSous(e);
    if (r?.groupe.classList.contains('village-lien-etiquette')) { survolee = null; return; } // l'étiquette montre la bulle elle-même
    const id = r ? r.groupe.getAttribute('data-maison') : null;
    if (id === survolee) return;
    quitter();
    if (id && parId.has(id)) { survolee = id; ctx.bulle.montrer(parId.get(id)); }
  });
  svg.addEventListener('mouseleave', () => { if (!ctx.telephone) quitter(); });
  return { svg, noeuds };
}

/**
 * La bulle (HTML, au-dessus du dessin) : nom, phrase, pastille du compteur (si lu), « Cliquez pour entrer » (« Touchez encore pour entrer » sur téléphone).
 * `compteurs` : Map(id de maison → nombre lu) ; absent = lecture en cours, ou pas de compteur ; null = illisible ou trop lent. Le nombre reste connu pour les survols suivants.
 */
function creerBulle(cadre, compteurs, { surFermee } = {}) {
  const bulle = document.createElement('div');
  bulle.className = 'village-bulle';
  bulle.dataset.role = 'bulle';
  bulle.setAttribute('aria-hidden', 'true'); // le lien accessible (aria-label) porte déjà le nom et la phrase
  bulle.hidden = true;
  let maison = null;
  let noeuds = new Map();
  let telephone = false;
  function remplir() {
    const b = besoinVu(maison);
    const nom = document.createElement('b');
    nom.dataset.role = 'bulle-nom';
    nom.textContent = b.nom;
    const enfants = [nom];
    if (estPetite(maison)) { // petite maison : le nom, l'élément (code, statut), l'aide au tutoiement
      if (maison.sousTitre) {
        const sous = document.createElement('em');
        sous.dataset.role = 'bulle-phrase';
        sous.textContent = maison.sousTitre;
        enfants.push(sous);
      }
      const aide = document.createElement('small');
      aide.dataset.role = 'bulle-aide';
      aide.textContent = telephone ? `Touche encore pour voir ${maison.un} seulement` : `Clique pour voir ${maison.un} seulement`;
      enfants.push(aide);
      if (maison.auto) { // 3c-bis (S8) : la bulle ne prend pas le pointeur, le geste pour cacher est écrit
        const cacher = document.createElement('small');
        cacher.dataset.role = 'bulle-cacher';
        cacher.textContent = telephone ? 'Appui long pour la cacher' : 'Double clic pour la cacher';
        enfants.push(cacher);
      }
      bulle.replaceChildren(...enfants);
      bulle.dataset.maison = maison.id;
      return;
    }
    if (estLien(maison)) {
      const adresse = document.createElement('em');
      adresse.dataset.role = 'bulle-adresse';
      adresse.className = 'village-bulle-adresse';
      adresse.textContent = maison.invalide ? 'Adresse refusée : modifie ou retire cette maison.' : maison.url;
      enfants.push(adresse);
      if (!maison.invalide) {
        const aide = document.createElement('small');
        aide.textContent = telephone ? 'Touche encore pour ouvrir le site dans un nouvel onglet' : 'Clique pour ouvrir le site dans un nouvel onglet';
        enfants.push(aide);
      }
      bulle.replaceChildren(...enfants);
      bulle.dataset.maison = maison.id;
      return;
    }
    if (b.phrase) {
      const phrase = document.createElement('em');
      phrase.dataset.role = 'bulle-phrase';
      phrase.textContent = b.phrase;
      enfants.push(phrase);
    }
    const etat = b.compteur ? pastilleBulle(b.compteur, compteurs.get(maison.id)) : null;
    if (etat) {
      const pastille = document.createElement('span');
      pastille.dataset.role = etat.attente ? 'bulle-attente' : 'bulle-pastille';
      pastille.className = etat.attente ? 'village-pastille-attente' : (etat.zero ? 'village-pastille-zero' : '');
      pastille.textContent = etat.texte;
      enfants.push(pastille);
    }
    const aide = document.createElement('small');
    aide.textContent = telephone ? 'Touchez encore pour entrer' : 'Cliquez pour entrer';
    enfants.push(aide);
    bulle.replaceChildren(...enfants);
    bulle.dataset.maison = maison.id;
  }
  function placer() {
    const cible = noeuds.get(maison.id)?.querySelector('.village-lever')?.getBoundingClientRect();
    if (!cible) return;
    const boite = cadre.getBoundingClientRect();
    const demi = bulle.offsetWidth / 2;
    let x = cible.left + cible.width / 2 - boite.left;
    x = Math.max(demi + 6, Math.min(boite.width - demi - 6, x));
    let y = cible.top - boite.top - 6;
    if (y < bulle.offsetHeight + 8) y = bulle.offsetHeight + 8;
    bulle.style.left = `${Math.round(x)}px`;
    bulle.style.top = `${Math.round(y)}px`;
  }
  const ouverte = (id) => maison?.id === id && !bulle.hidden;
  return {
    element: bulle,
    brancher(n, tel) { noeuds = n; telephone = tel; maison = null; bulle.hidden = true; },
    montrer(m) { maison = m; remplir(); bulle.hidden = false; placer(); },
    cacher(id) {
      if (id !== undefined && id !== maison?.id) return;
      const etaitOuverte = !bulle.hidden;
      maison = null;
      bulle.hidden = true;
      if (etaitOuverte) surFermee?.(); // 3c-bis : le redessin qui attendait la fermeture de la bulle (téléphone)
    },
    ouverte,
    /** Un compteur vient d'être lu : la bulle ouverte sur cette maison se met à jour. */
    rafraichir(id) { if (ouverte(id)) { remplir(); placer(); } },
  };
}

/** Petite vignette d'un bâtiment (roue dentée, vue Liste) : décorative (aria-hidden). */
function vignette(formes) {
  const svg = el('svg', { viewBox: '-100 -150 200 200', 'aria-hidden': 'true', focusable: 'false', class: 'village-vignette' });
  for (const f of formes) svg.append(forme(f));
  return svg;
}

/** Sous-titre court écrit sous le nom d'un îlot. */
const SOUS_TITRE_ILOT = Object.freeze({ 'mairie-reglages': 'Réglages', console: 'Espaces' });

/** Îlot d'un bâtiment fixe (Mairie, Console) : un lien HTML avec un petit dessin (herbe, place pavée, bâtiment), le nom et un sous-titre. */
function ilot(id, route) {
  const fixe = BATIMENTS_FIXES[id];
  const a = document.createElement('a');
  a.className = 'village-ilot';
  a.dataset.role = 'batiment-fixe';
  a.dataset.batimentFixe = id;
  a.href = lien(route);
  a.setAttribute('aria-label', `${fixe.nom} : ${fixe.phrase}`);
  const svg = el('svg', { viewBox: '-90 -100 180 152', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    el('polygon', { points: '-80,0 0,40 0,48 -80,8', fill: '#8A6A45' }),
    el('polygon', { points: '0,40 80,0 80,8 0,48', fill: '#6F5436' }),
    el('polygon', { points: '0,-40 80,0 0,40 -80,0', fill: '#A9C46E' }),
    el('polygon', { points: '0,-26 52,0 0,26 -52,0', fill: '#EFD9AE' }),
  );
  const lever = el('g', { class: 'village-lever' });
  for (const f of dessinBatimentFixe(id)) lever.append(forme(f));
  svg.append(lever);
  const nom = document.createElement('span');
  nom.className = 'village-ilot-nom';
  nom.dataset.role = 'batiment-fixe-nom';
  nom.textContent = fixe.nom;
  const sous = document.createElement('small');
  sous.textContent = SOUS_TITRE_ILOT[id];
  a.append(svg, nom, sous);
  return a;
}

/**
 * Monte le village dans `conteneur`. `besoins` : 1 à 12 besoins vérifiés et servis ; `aller(cible)` : ouvre une route (« #/… ») ;
 * `console` : vrai si la Console est dans les modules de la session (titulaire seul) : l'îlot Console est alors posé en bas à droite ;
 * `donnees` : la couche de données du rangement (js/os/village-donnees.js : { lire, enregistrer, retirer }), ou null (village d'office, sans rangement).
 * `or` : { lire, suivre, connu } (js/os/village-or.js : lireOr, surOr, orConnu), ou null : le compteur de pièces d'or en haut à gauche. Le dernier solde connu de la session
 *   s'affiche dès le montage ; sinon sa place est gardée (invisible) pendant la lecture, pour que la phrase d'aide ne saute pas. Illisible et rien de connu : pas de compteur
 *   (jamais un « 0 » inventé). Mis à jour après chaque gain.
 * `petites` : { sources, lire(module) } (js/os/village-petites-lecture.js : creerPetitesVillage), ou null : aucune petite maison (étape 3c).
 * Rend la fonction qui démonte l'écran (arrête l'écoute du format téléphone / ordinateur et les gestes).
 */
export function monterVillage(conteneur, besoins, { aller, console: avecConsole = false, donnees = null, or = null, petites = null }) {
  const page = document.createElement('section');
  page.className = 'page-village';
  page.dataset.role = 'page-village';
  page.dataset.rangement = 'non';
  page.dataset.vue = 'village';
  const majAnimations = () => { page.dataset.animations = animationsCoupees() ? 'non' : 'oui'; };
  majAnimations();
  const titre = document.createElement('h1');
  titre.className = 'sr-only';
  titre.textContent = 'Accueil';
  const cadre = document.createElement('div');
  cadre.className = 'village-cadre';
  const defile = document.createElement('div');
  defile.className = 'village-defile';
  const phrase = document.createElement('p');
  phrase.className = 'village-phrase';
  phrase.dataset.role = 'village-phrase';
  const bandeau = document.createElement('div');
  bandeau.className = 'village-bandeau';
  bandeau.dataset.role = 'village-bandeau';
  bandeau.setAttribute('role', 'alert');
  const zoneListe = document.createElement('div');
  zoneListe.className = 'village-zone-liste';
  page.append(titre, cadre);
  conteneur.append(page);
  const compteurs = new Map();
  const bulle = creerBulle(cadre, compteurs, {
    surFermee: () => { if (redessinApresBulle) { redessinApresBulle = false; minuteurRedessin = setTimeout(redessinerQuandLibre, 0); } },
  });
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(TELEPHONE) : null;
  let damier = DAMIER_DEPART; // 6b : grandit avec les parcelles (ranger)
  let parcellesVues = null; // les parcelles connues au dernier rangement

  // État : `lecture` = 'attente' | 'ok' | 'refus' | 'erreur' | 'sans' (pas de données) ; `batiments` : Map(id → document) ; `rangement` : résultat de rangerVillage.
  let lecture = donnees ? 'attente' : 'sans';
  let batiments = new Map(); // ce que l'écran montre : la base confirmée + les écritures optimistes encore en route
  let confirmes = new Map(); // ce que la base a confirmé (lecture, puis chaque écriture réussie)
  let enRoute = []; // écritures optimistes pas encore confirmées, dans l'ordre : [{ liste }]
  let ignores = new Set(); // documents mal formés, ignorés à la lecture : jamais réécrits d'office (seul un geste sur la maison les remplace)
  let file = Promise.resolve(); // les écritures partent une à une, dans l'ordre des gestes
  let rangement = { maisons: [], cachees: [], sansPlace: [], objets: [], objetsSansPlace: [] };
  let monte = true;
  let debrancher = null;
  let premierRendu = true;
  let centreAuto = null; // la position posée par le centrage automatique : si le doigt a déjà fait glisser le village, le rendu suivant ne le recentre pas
  const rangementPossible = () => lecture === 'ok';
  // Petites maisons (étape 3c) : `elements` = Map(module → résultat de la lecture) ; absent = lecture en cours (aucune petite maison).
  const elements = new Map();
  const lancesPetites = new Set();
  let rangementPetites = { petites: [], sansPlace: [] };
  let redessinAttendu = false; // des éléments sont arrivés pendant un glisser : le redessin attend la fin du glisser
  let redessinApresBulle = false; // 3c-bis : téléphone, des éléments sont arrivés sous une bulle ouverte : le redessin part quand elle se ferme
  const ranger = () => {
    // 6b (B14) : le plus grand entre le damier payé et celui qui contient toutes les places enregistrées (portefeuille illisible : rien n'est reclassé d'office)
    parcellesVues = or?.parcelles?.() ?? null;
    const paye = damierDe(parcellesVues);
    const places = damierPourPlaces(batiments);
    damier = places.colonnes > paye.colonnes ? places : paye;
    rangement = rangerVillage({ besoins, batiments, damier });
    rangementPetites = petites ? rangerPetites({ maisons: rangement.maisons, batiments, elements, modules: petites.sources, damier, objets: rangement.objets }) : { petites: [], sansPlace: [] };
  };
  const maisonsVisibles = () => (lecture === 'attente' ? [] : rangement.maisons);
  const objetsVisibles = () => (lecture === 'attente' ? [] : rangement.objets);
  /** Cases prises pour une grande maison : les maisons et les objets montrés (F2 : jamais une maison ni un lien sur une décoration). */
  const prisesGrandes = () => occupation([...rangement.maisons, ...rangement.objets]);
  const signaturePetites = () => JSON.stringify([...rangementPetites.petites, ...rangementPetites.sansPlace].map((p) => [p.id, p.nom, p.sousTitre, p.c, p.l, p.cible]));
  const petitesVisibles = () => (lecture === 'attente' ? { petites: [], sansPlace: [] } : rangementPetites);

  /** Une seule lecture par module et par affichage, pour chaque module source dont une grande maison est visible. */
  function lancerPetites() {
    if (!petites) return;
    for (const m of maisonsVisibles()) {
      const source = sourcePour(m);
      if (!source || !petites.sources.includes(source.module) || lancesPetites.has(source.module)) continue;
      lancesPetites.add(source.module);
      lireElements(source.module);
    }
    majSignal();
  }

  /** UNE lecture en cours par module (la fenêtre de choix réutilise celle des petites maisons) ; un résultat « ok » n'est jamais remplacé par une erreur. */
  const enCours = new Map();
  function lireElements(module) {
    if (elements.get(module)?.etat === 'ok') return Promise.resolve(elements.get(module));
    if (enCours.has(module)) return enCours.get(module);
    const promesse = petites.lire(module).catch(() => ({ etat: 'erreur' })).then((r) => {
      enCours.delete(module);
      if (!monte) return r;
      if (elements.get(module)?.etat === 'ok' && r?.etat !== 'ok') { majSignal(); return elements.get(module); }
      const avant = signaturePetites();
      elements.set(module, r?.etat === 'ok' ? r : { etat: 'erreur' });
      ranger();
      // rien ne change à l'écran (aucun chantier en cours, par exemple) : pas de redessin, qui couperait un geste du doigt en cours
      if (signaturePetites() !== avant) redessinerQuandLibre();
      majSignal();
      return r;
    });
    enCours.set(module, promesse);
    majSignal();
    return promesse;
  }

  /** Redessin des petites maisons : après un glisser (surFin), et jamais pendant qu'un clic attend son délai (double clic) ni sous une bulle ouverte. */
  let minuteurRedessin = null;
  function redessinerQuandLibre() {
    clearTimeout(minuteurRedessin);
    minuteurRedessin = null;
    if (!monte) return;
    if (page.dataset.rangement === 'oui') { redessinAttendu = true; majSignal(); return; }
    // téléphone : la bulle ouverte (premier toucher) attend le second toucher ; le redessin part quand elle se ferme (3c-bis, surFermee), sans essai répété
    if (Boolean(media?.matches) && !bulle.element.hidden) { redessinApresBulle = true; majSignal(); return; }
    // ordinateur : la bulle du survol se rouvre au mouvement suivant ; un geste ou un clic en attente : essai toutes les 300 ms (occupe() est borné)
    if (debrancher?.occupe?.()) { minuteurRedessin = setTimeout(redessinerQuandLibre, 300); majSignal(); return; }
    rendre();
  }

  /** Signal pour les tests et l'accessibilité : data-petites-lues="oui" quand plus aucune lecture ni redessin des petites maisons n'attend. */
  function majSignal() {
    const fini = lecture !== 'attente' && enCours.size === 0 && !minuteurRedessin && !redessinAttendu && !redessinApresBulle;
    page.dataset.petitesLues = fini ? 'oui' : 'non';
  }

  // Une seule lecture par compteur et par affichage du village, lancée dès que la maison est montrée (jamais au survol) ; la bulle ouverte se met à jour quand le nombre arrive.
  const lances = new Set();
  function lancerCompteurs() {
    for (const m of maisonsVisibles()) {
      const b = m.besoin;
      if (!b.compteur || lances.has(m.id)) continue;
      lances.add(m.id);
      lireCompteur(b.compteur).catch(() => null).then((n) => {
        if (!monte) return;
        compteurs.set(m.id, n);
        bulle.rafraichir(m.id);
        if (page.dataset.vue === 'liste') rendre();
      });
    }
    lancerPetites();
  }

  /** Ce que l'écran montre : la base confirmée, puis les écritures optimistes encore en route, dans l'ordre. */
  const recalculer = () => {
    const vue = new Map(confirmes);
    for (const { liste } of enRoute) for (const { id, donnees: d } of liste) vue.set(id, d);
    batiments = vue;
  };

  /**
   * Écrit des maisons (une seule écriture groupée) : `modifs` = [{ id, donnees }]. Les maisons visibles dont la place n'est pas encore enregistrée sont écrites
   * en même temps à leur place (D10 : plus rien ne bouge tout seul ensuite), sauf celles dont le document a été ignoré (mal formé). `optimiste` : l'écran change
   * d'abord, et revient en arrière si l'écriture échoue. Les écritures partent une à une (file) : deux gestes rapprochés ne désaccordent jamais l'écran et la base.
   */
  function appliquer(modifs, { optimiste = false } = {}) {
    if (!rangementPossible()) return Promise.resolve(false);
    const touchees = new Set(modifs.map((m) => m.id));
    const liste = [...modifs];
    for (const m of rangement.maisons) if (!m.enregistree && !touchees.has(m.id) && !ignores.has(m.id)) liste.push({ id: m.id, donnees: docDeplacement(m, m.c, m.l) });
    const envoi = { liste };
    if (optimiste) { enRoute.push(envoi); recalculer(); ranger(); rendre(); }
    // Limite connue : si une écriture échoue alors qu'une autre attend derrière, la base peut garder deux maisons sur la même case (la seconde a été
    // calculée avec la place de la première). Sans danger : rangerVillage replace la seconde d'office à la lecture, et le prochain geste la réécrit.
    const resultat = file.then(() => donnees.enregistrer(liste)).catch(() => false);
    file = resultat;
    return resultat.then((ok) => {
      if (optimiste) enRoute = enRoute.filter((e) => e !== envoi);
      // 7 (C11) : pour un objet du jeu, seuls `c` et `l` sont écrits : un vieux `depuis` (gardé dans le geste) ne remplace jamais celui d'une récolte
      if (ok) {
        for (const { id, donnees: d } of liste) {
          confirmes.set(id, estSorteJeu(d?.sorte) && confirmes.has(id) ? { ...confirmes.get(id), c: d.c, l: d.l } : d);
          ignores.delete(id);
        }
      }
      if (!monte) return ok;
      recalculer();
      ranger();
      // succès d'une écriture optimiste : l'écran la montre déjà, pas de redessin (il couperait un glisser en cours)
      if (!(ok && optimiste)) { rendre(); lancerCompteurs(); }
      return ok;
    });
  }

  /** Remet une maison cachée (ou hors du départ) dans le village : à sa place enregistrée si elle est libre, sinon au premier bloc libre. */
  async function montrer(entree) {
    const prises = prisesGrandes();
    const { c, l } = entree.donnees;
    const place = Number.isInteger(c) && Number.isInteger(l) && blocLibre(prises, c, l, TAILLE_GRANDE, damier) ? { c, l } : premierBlocLibre(prises, TAILLE_GRANDE, damier);
    if (!place) return false;
    return appliquer([{ id: entree.id, donnees: { ...entree.donnees, sorte: 'besoin', cache: false, c: place.c, l: place.l } }]);
  }

  const etatRoue = () => {
    if (!rangementPossible()) return null;
    return {
      cachees: rangement.cachees,
      plein: !premierBlocLibre(prisesGrandes(), TAILLE_GRANDE, damier),
      telephone: Boolean(media?.matches),
      dessin: (nom) => vignette(dessinBatiment(nom)),
      surAfficher: (entree) => montrer(entree),
      liens: nombreLiens(),
      surAjouterLien: (valeurs) => ajouterLien(valeurs),
      // 3c-bis (S9) : les petites maisons cachées, avec le bâtiment de leur grande (vignette)
      cacheesPetites: petitesCachees(batiments).map((p) => ({ ...p, batiment: rangement.maisons.find((m) => m.id === p.parent)?.besoin?.batiment })),
      surRemontrer: (id) => retirer(id),
    };
  };

  const nombreLiens = () => [...batiments.values()].filter((d) => d.sorte === 'lien').length;

  /** Nouveau lien externe (roue) au premier bloc libre ; l'identifiant suit l'heure de création (ordre des liens). */
  function ajouterLien({ nom, url, batiment }) {
    if (nombreLiens() >= LIENS_MAX) return Promise.resolve(TROP_DE_LIENS);
    const place = premierBlocLibre(prisesGrandes(), TAILLE_GRANDE, damier);
    if (!place) return Promise.resolve(VILLAGE_PLEIN);
    const d = docLien({ nom, url, batiment, c: place.c, l: place.l });
    if (!d) return Promise.resolve(false);
    const id = `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return appliquer([{ id, donnees: d }]);
  }

  /** Retire le document d'une maison (lien externe), dans la file des écritures. */
  function retirer(id) {
    if (!rangementPossible()) return Promise.resolve(false);
    const resultat = file.then(() => donnees.retirer(id)).catch(() => false);
    file = resultat;
    return resultat.then((ok) => {
      if (ok) confirmes.delete(id);
      if (!monte) return ok;
      recalculer();
      ranger();
      rendre();
      return ok;
    });
  }

  function reglagesLien(maison) {
    const actuel = { ...maison.donnees };
    fenetreLien(maison, {
      dessin: (nom) => vignette(dessinBatiment(nom)),
      surEnregistrer: ({ nom, url, batiment }) => {
        const d = docLien({ nom, url, batiment, c: maison.c, l: maison.l });
        return d ? appliquer([{ id: maison.id, donnees: d }]) : Promise.resolve(false);
      },
      surRetirer: () => retirer(maison.id),
      // « Annuler » : le lien est recréé tel quel, à sa place si elle est libre, sinon au premier bloc libre (village plein : échec et message).
      surRemettre: () => {
        if (nombreLiens() >= LIENS_MAX) return Promise.resolve(TROP_DE_LIENS);
        const prises = prisesGrandes();
        const place = blocLibre(prises, actuel.c, actuel.l, TAILLE_GRANDE, damier) ? { c: actuel.c, l: actuel.l } : premierBlocLibre(prises, TAILLE_GRANDE, damier);
        return place ? appliquer([{ id: maison.id, donnees: { ...actuel, c: place.c, l: place.l } }]) : Promise.resolve(VILLAGE_PLEIN);
      },
    });
  }

  /** Les éléments d'un module pour la fenêtre de choix : la lecture de l'affichage si elle a réussi, sinon une nouvelle lecture (bouton « Réessayer »). */
  const elementsPour = (module) => lireElements(module);

  /** Identifiant d'un nouveau document `petite` (manuelle ou cachée). */
  const idPetite = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  /** Vrai si le document `d` d'identifiant `id` serait posé sur une case (3c-bis : seule limite, une case voisine libre). */
  const placePour = (id, d) => rangerPetites({ maisons: rangement.maisons, batiments: new Map(batiments).set(id, d), elements, modules: petites.sources, damier, objets: rangement.objets })
    .petites.some((p) => p.id === id);

  /** Nouvelle petite maison manuelle sous `grande` (non optimiste) ; refus expliqué : aucune case voisine libre (plus de plafond par personne, 3c-bis). */
  function ajouterPetite(grande, element) {
    const d = docPetite({ parent: grande.id, nom: element.nom, cible: element.cible });
    if (!d) return Promise.resolve(false);
    const id = idPetite();
    if (!placePour(id, d)) return Promise.resolve(PLUS_DE_PLACE);
    return appliquer([{ id, donnees: d }]);
  }

  function choisirPetite(grande, source) {
    const deja = (cible) => [...batiments.values()].some((d) => d.sorte === 'petite' && d.parent === grande.id && d.cible === cible && d.cachee !== true);
    fenetreChoixPetite({
      un: source.module === 'projets' ? 'projet' : 'chantier',
      pluriel: source.module === 'projets' ? 'projets' : 'chantiers',
      lire: () => elementsPour(source.module),
      deja,
      surChoisir: (element) => ajouterPetite(grande, element),
    });
  }

  /** Fenêtre d'une petite maison manuelle : renommer (vide = le nom de l'élément), retirer, puis « Annuler » qui recrée le document tel quel. */
  function reglagesPetite(petite) {
    const actuel = { ...petite.donnees };
    fenetrePetite(petite, {
      surRenommer: (nom) => {
        let court = nomCourt(nom);
        if (!court) { // vide : le nom de l'élément s'il est lu, sinon le nom actuel
          const lu = elements.get(moduleDeCible(actuel.cible));
          const element = lu?.etat === 'ok' ? lu.liste.find((e) => e.cible === actuel.cible) : null;
          court = (element && nomCourt(element.nom)) || actuel.nom;
        }
        return appliquer([{ id: petite.id, donnees: { ...actuel, nom: court } }]);
      },
      surRetirer: () => retirer(petite.id),
      surRemettre: () => (placePour(petite.id, actuel) ? appliquer([{ id: petite.id, donnees: actuel }]) : Promise.resolve(PLUS_DE_PLACE)), // S13
    });
  }

  /** Fenêtre d'une petite maison automatique (3c-bis) : « Cacher du village » écrit un document `cachee` ; « Annuler » le retire. */
  function reglagesAutomatique(petite) {
    let idCachee = null;
    fenetrePetiteAuto(petite, {
      surCacher: () => {
        if (petitesCachees(batiments).length >= CACHEES_MAX) return Promise.resolve(TROP_DE_CACHEES);
        const d = docCachee({ parent: petite.parent, nom: petite.nom, cible: petite.cible });
        if (!d) return Promise.resolve(false);
        const id = idPetite();
        return appliquer([{ id, donnees: d }]).then((ok) => { if (ok) idCachee = id; return ok; });
      },
      surRemontrer: () => (idCachee ? retirer(idCachee) : Promise.resolve(false)),
    });
  }

  function reglagesMaison(maison) {
    if (estSorteJeu(maison.sorte)) return; // un objet acheté n'a pas de réglages
    bulle.cacher();
    if (estPetite(maison)) { if (maison.auto) reglagesAutomatique(maison); else reglagesPetite(maison); return; } // une automatique : « Cacher du village » (3c-bis)
    if (estLien(maison)) { reglagesLien(maison); return; }
    const placee = { ...maison, donnees: docDeplacement(maison, maison.c, maison.l) };
    const source = petites ? sourcePour(maison) : null;
    fenetreMaison(maison, {
      surRenommer: (nom) => appliquer([{ id: maison.id, donnees: docRenommer(placee, nom) }]),
      surCacher: () => appliquer([{ id: maison.id, donnees: docCacher(placee, true) }]),
      surMontrer: () => {
        const entree = rangement.cachees.find((e) => e.id === maison.id);
        return entree ? montrer(entree) : Promise.resolve(true);
      },
      surAjouterPetite: source && petites.sources.includes(source.module) && rangementPossible() ? () => choisirPetite(maison, source) : null,
    });
  }

  async function deposer(maison, c, l) {
    const ok = await appliquer([{ id: maison.id, donnees: docDeplacement(maison, c, l) }], { optimiste: true });
    if (!ok && monte) toast('Le déplacement n’a pas été enregistré. Réessaie.', { type: 'erreur' });
  }

  // Hors du dessin et gardés à chaque redessin (passage téléphone / ordinateur) : la roue dentée, la Mairie, la Console (titulaire seul).
  const fixes = [boutonReglagesAccueil({ surChangement: majAnimations, maisons: etatRoue }), ilot('mairie-reglages', 'reglages')];
  if (avecConsole) fixes.push(ilot('console', 'console/vue'));
  const routesFixes = [{ id: 'mairie-reglages', route: 'reglages' }, ...(avecConsole ? [{ id: 'console', route: 'console/vue' }] : [])];

  // ---- récolte (étape 7)
  const recoltesEnCours = new Set(); // objets dont la récolte est demandée : un second clic pendant l'appel ne fait rien

  /** Nouveau `depuis` rendu par le serveur : dans la base confirmée ET dans les déplacements encore en route du même objet (C11), puis redessin. */
  function majDepuis(id, depuisMs) {
    const depuis = new Date(depuisMs);
    if (confirmes.has(id)) confirmes.set(id, { ...confirmes.get(id), depuis });
    for (const envoi of enRoute) for (const x of envoi.liste) if (x.id === id) x.donnees = { ...x.donnees, depuis };
    recalculer();
    ranger();
    redessinerQuandLibre();
  }

  /** Clic, toucher ou Entrée sur un champ ou un enclos : l'état est recalculé MAINTENANT ; prêt : une demande au serveur, sans jamais de nouvel essai. */
  async function recolter(o) {
    if (!or?.ramasser || !o || !SORTES_RECOLTE.includes(o.sorte) || recoltesEnCours.has(o.id)) return;
    const d = batiments.get(o.id);
    if (!d) return;
    const e = etatRecolte(d.sorte, enMs(d.depuis), Date.now());
    if (!e.pret) { toast(pasPret(d.sorte)); return; }
    recoltesEnCours.add(o.id);
    try {
      const r = await or.ramasser({ objet: o.id });
      if (!monte) return;
      if (r?.etat === 'ok') {
        if (Number.isInteger(r.depuisMs)) majDepuis(o.id, r.depuisMs); else relireApresAchat();
      } else if (r?.etat === 'refus' && r.raison === 'pas_pret') {
        toast(pasPret(d.sorte));
        if (Number.isInteger(r.depuisMs)) majDepuis(o.id, r.depuisMs);
      } else if (r?.etat === 'refus' && r.raison === 'objet') {
        relireApresAchat();
      } else if (r?.etat === 'refus' && r.raison === 'lecture_seule') {
        toast('Ton accès est en lecture seule : tu ne peux pas récolter.');
      } else {
        toast('La récolte n’a pas abouti. Réessaie.', { type: 'erreur' });
      }
    } finally {
      recoltesEnCours.delete(o.id);
    }
  }

  const ctxCommun = { aller, bulle, rangementEnCours: () => page.dataset.rangement === 'oui', recolter: (o) => recolter(o) };
  const rendre = () => {
    redessinApresBulle = false; // 3c-bis (R2) : ce dessin montre déjà les éléments arrivés
    clearTimeout(minuteurRedessin); // et aucun redessin en attente ne reste programmé
    minuteurRedessin = null;
    const telephone = Boolean(media?.matches);
    const defileAvant = defile.scrollLeft; // remplacer le dessin remet le défilement à zéro : on le garde (3c : les petites maisons arrivent après le rangement)
    debrancher?.();
    debrancher = null;
    const maisons = maisonsVisibles();
    const { petites: posees, sansPlace: petitesSansPlace } = petitesVisibles();
    const objets = objetsVisibles();
    const ctx = { ...ctxCommun, telephone, damier, maintenant: Date.now() };
    const { svg, noeuds } = dessiner(maisons, ctx, posees, objets);
    bulle.brancher(noeuds, telephone);
    defile.replaceChildren(svg);
    // phrase d'aide (cas vides) et bandeau (panne de lecture)
    // (6b : un objet acheté ne compte pas, la phrase reste tant qu'aucune maison n'est rangée)
    const rangees = [...batiments.values()].some((d) => !estSorteJeu(d?.sorte));
    const texte = lecture === 'attente' ? '' : !maisons.length ? 'Affiche tes maisons avec la roue dentée.' : (lecture === 'ok' && !rangees ? 'Glisse les maisons pour ranger ton village.' : '');
    phrase.textContent = texte;
    phrase.hidden = !texte;
    if (lecture === 'erreur') {
      const message = document.createElement('span');
      message.textContent = 'Ton rangement n’a pas pu être lu. Réessaie.';
      const reessayer = document.createElement('button');
      reessayer.type = 'button';
      reessayer.className = 'bouton bouton-secondaire';
      reessayer.dataset.role = 'reessayer-village';
      reessayer.textContent = 'Réessayer';
      reessayer.addEventListener('click', () => { lire(); });
      bandeau.replaceChildren(message, reessayer);
      bandeau.hidden = false;
    } else {
      bandeau.replaceChildren();
      bandeau.hidden = true;
    }
    // vue « Liste » (téléphone seulement)
    const vue = telephone ? vueChoisie() : 'village';
    page.dataset.vue = vue;
    const enfants = [defile, bulle.element, ...fixes, ...(barreOr ? [barreOr] : []), phrase, bandeau];
    if (telephone) {
      enfants.push(boutonVue(vue, () => rendre()));
      zoneListe.replaceChildren(listeMaisons({ maisons, petites: [...posees, ...petitesSansPlace], fixes: routesFixes, compteurs, dessin: (nom) => vignette(dessinBatiment(nom)), dessinFixe: (id) => vignette(dessinBatimentFixe(id)) }));
      zoneListe.hidden = vue !== 'liste';
      enfants.push(zoneListe);
    }
    cadre.replaceChildren(...enfants);
    if (telephone && premierRendu && vue === 'village' && (centreAuto === null || defileAvant === centreAuto)) {
      defile.scrollLeft = Math.max(0, (defile.scrollWidth - defile.clientWidth) / 2);
      centreAuto = defile.scrollLeft;
    } else defile.scrollLeft = defileAvant;
    if (lecture !== 'attente') premierRendu = false;
    if (rangementPossible()) {
      debrancher = brancherGestes(svg, {
        maisons: [...maisons, ...objets], petites: posees, damier, telephone,
        // un objet : la bulle ouverte se referme ; un champ ou un enclos : la récolte (étape 7) ; une décoration : rien
        surOuvrir: (m) => { if (!estSorteJeu(m.sorte)) { toucher(m, ctx); return; } bulle.cacher(); if (SORTES_RECOLTE.includes(m.sorte)) recolter(m); },
        surReglages: reglagesMaison,
        surDepose: deposer,
        surDebut: () => { page.dataset.rangement = 'oui'; bulle.cacher(); },
        surFin: () => {
          page.dataset.rangement = 'non';
          if (redessinAttendu) { redessinAttendu = false; setTimeout(redessinerQuandLibre, 0); } // les éléments arrivés pendant le glisser
        },
      });
    }
    majBoutique();
    majSignal();
  };

  async function lire() {
    if (!donnees) { ranger(); rendre(); lancerCompteurs(); return; }
    const r = await donnees.lire();
    if (!monte) return;
    if (r.etat === 'ok') {
      const { parId, avertissements, ignores: malFormes } = lireBatiments(r.docs);
      for (const a of avertissements) console.warn(a);
      confirmes = parId;
      ignores = malFormes;
      lecture = 'ok';
    } else {
      confirmes = new Map();
      ignores = new Set();
      lecture = r.etat === 'refus' ? 'refus' : 'erreur';
    }
    enRoute = [];
    recalculer();
    ranger();
    rendre();
    lancerCompteurs();
  }

  // Compteur de pièces d'or (étape 6a) : hors du dessin, en haut à gauche (jamais sur la roue ni sur les îlots).
  // 6b : il vit dans une barre (div.village-or-barre) qui porte la position ; le bouton « Boutique » est à sa droite, dans la même barre.
  let barreOr = null;
  let compteurOr = null;
  let texteCompteur = null;
  let boutonBoutique = null;
  let soldeVu = null;
  const poserCompteur = () => {
    if (compteurOr) return;
    barreOr = document.createElement('div');
    barreOr.className = 'village-or-barre';
    barreOr.dataset.role = 'or-barre';
    compteurOr = document.createElement('div');
    compteurOr.className = 'village-or';
    compteurOr.dataset.role = 'or';
    compteurOr.setAttribute('aria-live', 'polite');
    texteCompteur = document.createElement('span');
    compteurOr.append(dessinPiece(22), texteCompteur);
    barreOr.append(compteurOr);
    page.dataset.or = 'oui';
    if (phrase.parentNode === cadre) cadre.insertBefore(barreOr, phrase); else cadre.append(barreOr);
  };
  const montrerOr = (n) => {
    if (!monte || !Number.isInteger(n)) return;
    poserCompteur();
    compteurOr.classList.remove('village-or-attente');
    compteurOr.removeAttribute('aria-hidden');
    texteCompteur.textContent = texteOr(n);
    soldeVu = n;
    majBoutique();
    // de nouvelles parcelles : le damier grandit (pendant un glisser, le redessin attend sa fin)
    // seulement si la taille du damier change : pas de redessin de trop à l'ouverture
    if (lecture !== 'attente' && (or?.parcelles?.() ?? null) !== parcellesVues) {
      const avant = damier.colonnes;
      ranger();
      if (damier.colonnes !== avant) redessinerQuandLibre();
    }
  };
  /** Lecture illisible : la place gardée s'en va (rien de connu, donc rien à montrer). */
  const oublierPlace = () => {
    if (!compteurOr || !compteurOr.classList.contains('village-or-attente')) return;
    barreOr.remove();
    barreOr = null;
    compteurOr = null;
    boutonBoutique = null;
    delete page.dataset.or;
  };

  // ---- boutique (6b)
  /** Premier bloc libre de `taille` x `taille` cases pour un objet (7 : 2 x 2 pour un champ ou un enclos), dans le damier PAYÉ (celui que le serveur vérifie) :
   *  hors des maisons, petites maisons, objets et places enregistrées. */
  const caseAchat = (taille = 1) => {
    const prises = occupation([...rangement.maisons, ...rangement.objets, ...rangementPetites.petites]);
    for (const k of casesEnregistrees([...batiments.values()])) if (!prises.has(k)) prises.set(k, k);
    for (const k of casesRefusees) if (!prises.has(k)) prises.set(k, k);
    return caseLibreDevant(prises, damierDe(or?.parcelles?.()), taille);
  };
  const casesRefusees = new Set(); // cases refusées par le serveur (case, case_prise) pendant cet affichage : jamais reproposées
  const nombreObjets = () => [...batiments.values()].filter((d) => estSorteJeu(d?.sorte)).length;
  /** Vignette d'un article : une décoration du catalogue, un carré d'herbe pour la parcelle ; champ (prêt) et enclos (7) : 2 x 2 cases, cadre deux fois plus grand. */
  const vignetteArticle = (id) => {
    const grand = id === 'champ' || id === 'enclos';
    const svg = el('svg', { viewBox: grand ? '-74 -66 148 112' : '-32 -46 64 56', 'aria-hidden': 'true', focusable: 'false', class: 'village-vignette' });
    const formes = id === 'parcelle'
      ? [{ poly: [[-28, 0], [0, 14], [0, 19], [-28, 5]], fill: '#8A6A45' }, { poly: [[0, 14], [28, 0], [28, 5], [0, 19]], fill: '#6F5436' }, { poly: [[0, -14], [28, 0], [0, 14], [-28, 0]], fill: '#A9C46E' }]
      : dessinJeu(id === 'champ' ? 'champ-pret' : id === 'enclos' ? 'enclos-cochons' : id);
    for (const f of formes) svg.append(forme(f));
    return svg;
  };

  /** Achat demandé par la boutique : { ok: true } | { ok: false, or?, parcelles?, manque?, message? } (sans message, la boutique écrit « L’achat n’a pas abouti. Réessaie. »). */
  async function acheterDansVillage(article, modele) {
    let place = null;
    const objet = article !== 'parcelle'; // décoration (1 x 1), champ ou enclos (2 x 2, étape 7)
    if (objet) { place = caseAchat(TAILLES[article] ?? 1); if (!place) return { ok: false }; }
    const r = await or.acheter(place ? { article, modele, c: place.c, l: place.l } : { article });
    if (!monte) return { ok: r?.etat === 'ok' };
    if (r?.etat === 'ok') {
      const o = r.objet;
      const valable = Boolean(o && estSorteJeu(o.sorte));
      if (valable) {
        confirmes.set(o.id, { sorte: o.sorte, c: o.c, l: o.l, ...(o.modele ? { modele: o.modele } : {}), ...(Number.isInteger(o.depuisMs) ? { depuis: new Date(o.depuisMs) } : {}) });
        ignores.delete(o.id);
        recalculer();
      }
      ranger();
      rendre();
      if (objet && !valable) relireApresAchat(); // réponse sans objet valable : la base fait foi
      toast(article === 'parcelle' ? 'Ton terrain s’agrandit' : article === 'champ' ? 'Champ acheté' : article === 'enclos' ? 'Enclos acheté' : 'Décoration achetée');
      return { ok: true };
    }
    const solde = Number.isInteger(r?.or) ? r.or : undefined;
    const parcellesSues = or?.parcelles?.() ?? undefined;
    if (r?.etat !== 'refus') return { ok: false, or: solde, parcelles: parcellesSues };
    if (r.raison === 'pas_assez' && Number.isInteger(r.manque) && r.manque > 0) return { ok: false, or: solde, parcelles: parcellesSues, manque: r.manque };
    if (r.raison === 'maximum') return { ok: false, or: solde, parcelles: parcellesSues, message: 'Ton terrain est au plus grand.' };
    if (r.raison === 'trop_objets') return { ok: false, or: solde, parcelles: parcellesSues, message: `${OBJETS_MAX} objets au plus.` };
    if (r.raison === 'lecture_seule') return { ok: false, or: solde, parcelles: parcellesSues, message: 'Ton accès est en lecture seule : tu ne peux pas acheter.' };
    if (r.raison === 'case' || r.raison === 'case_prise') {
      if (place) casesRefusees.add(`${place.c}-${place.l}`);
      relireApresAchat(); // la base a une place que l'écran ne connaissait pas : on relit
    }
    return { ok: false, or: solde, parcelles: parcellesSues };
  }

  /** Relecture après un achat : les déplacements encore en route sont gardés (recalculer) et le redessin attend la fin d'un geste. */
  async function relireApresAchat() {
    if (!donnees) return;
    const r = await donnees.lire();
    if (!monte || r?.etat !== 'ok') return;
    const { parId, ignores: malFormes } = lireBatiments(r.docs);
    confirmes = parId;
    ignores = malFormes;
    recalculer();
    ranger();
    redessinerQuandLibre();
  }

  function ouvrirBoutiqueVillage() {
    bulle.cacher();
    ouvrirBoutique({
      or: soldeVu, parcelles: or?.parcelles?.() ?? 0, objets: nombreObjets(), caseLibre: (t) => caseAchat(t), dessin: vignetteArticle,
      surAcheter: acheterDansVillage,
    });
  }

  /** Le bouton « Boutique » : seulement si l'achat est branché, le solde connu et affiché, et le rangement lu (on ne vend pas ce qu'on ne peut pas poser). */
  function majBoutique() {
    if (!barreOr) return;
    const voir = typeof or?.acheter === 'function' && Number.isInteger(soldeVu) && !compteurOr.classList.contains('village-or-attente') && lecture === 'ok'
      && (typeof or.parcelles !== 'function' || or.parcelles() !== null);
    if (voir && !boutonBoutique) {
      boutonBoutique = document.createElement('button');
      boutonBoutique.type = 'button';
      boutonBoutique.className = 'bouton bouton-secondaire village-boutique-bouton';
      boutonBoutique.dataset.role = 'boutique';
      boutonBoutique.textContent = 'Boutique';
      boutonBoutique.addEventListener('click', ouvrirBoutiqueVillage);
      barreOr.append(boutonBoutique);
    } else if (!voir && boutonBoutique) {
      boutonBoutique.remove();
      boutonBoutique = null;
    }
  }
  const arretOr = or?.suivre ? or.suivre(montrerOr) : null;
  const connu = or?.connu ? or.connu() : null;
  if (Number.isInteger(connu)) montrerOr(connu); // le dernier solde connu, tout de suite
  else if (or?.lire) { poserCompteur(); compteurOr.classList.add('village-or-attente'); compteurOr.setAttribute('aria-hidden', 'true'); } // la place, gardée pendant la lecture

  rendre(); // 1. le terrain tout de suite (vide pendant la lecture)
  lire(); // 2. le rangement, puis les maisons et leurs compteurs
  if (or?.lire) or.lire().then((r) => { if (r?.etat === 'ok') montrerOr(r.or); else oublierPlace(); }).catch(oublierPlace); // 3. le solde (illisible : le dernier connu reste, sinon rien)
  // Téléphone : un toucher hors des bâtiments referme la bulle.
  const fermer = (e) => { if (!e.target.closest?.('.village-batiment, .village-lien-etiquette')) bulle.cacher(); };
  cadre.addEventListener('click', fermer);
  media?.addEventListener?.('change', rendre);
  // 7 (C14) : retour sur l'onglet : les champs et les enclos sont redessinés seulement si leur état (dessin, nom) a changé ; aucune minuterie
  const signatureEtats = (maintenant) => JSON.stringify(objetsVisibles().filter((o) => SORTES_RECOLTE.includes(o.sorte)).map((o) => [o.id, dessinDeLObjet(o, maintenant), nomDeLObjet(o, maintenant)]));
  const signatureDessinee = () => JSON.stringify([...defile.querySelectorAll('.village-objet[data-etat]')].map((g) => [g.getAttribute('data-maison'), g.getAttribute('data-dessin'), g.getAttribute('aria-label')]));
  const surVisible = () => {
    if (!monte || document.visibilityState !== 'visible') return;
    if (signatureEtats(Date.now()) !== signatureDessinee()) redessinerQuandLibre();
  };
  document.addEventListener('visibilitychange', surVisible);
  return () => { monte = false; debrancher?.(); arretOr?.(); media?.removeEventListener?.('change', rendre); document.removeEventListener('visibilitychange', surVisible); };
}
