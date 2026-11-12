// Règles pures de la carte mentale d'une source (13/11/2026) : aucune dépendance à Firebase ni au DOM, importables par les tests Node.
// La source est au centre, une branche par pilier (réparties à gauche et à droite), les pistes au bout des branches, empilées.
// Toutes les positions sont CALCULÉES ici, avec des hauteurs fixes (une piste = une hauteur, jamais mesurée à l'écran) : deux pistes ne se superposent jamais et le test n'a pas besoin de navigateur.
// Rien n'est écrit : la carte lit les pistes, elle n'en modifie aucune. Le texte des pistes n'est jamais du texte d'un tiers (angle écrit par nous).
import * as L from '../crm/logique.js';
import * as R from './logique.js';
import * as P from './pistes-logique.js';
import * as V from './inspirations-vue-logique.js';

/** Au-delà de ce nombre de pistes dans la source, toutes les branches s'ouvrent repliées (seuil proposé dans le cahier des charges, 4.3). */
export const SEUIL_REPLI = 30;
/** Longueur du texte d'une piste dans la carte (l'angle complet est au survol). */
export const LONGUEUR_TEXTE = 40;
export const CLE_SANS_PILIER = 'sans_pilier';
export const LIBELLE_SANS_PILIER = 'Sans pilier';

// Gabarit en unités du dessin (px du SVG). Tout est fixe.
export const GABARIT = Object.freeze({
  marge: 16,
  piste: { largeur: 260, hauteur: 28, ecart: 6 },
  tete: { largeur: 224, hauteur: 34 },
  centre: { largeur: 172, hauteur: 60 },
  ecartBranches: 20,
  espaceTetePiste: 28,
  espaceCentreTete: 56,
});

const { marge: M, piste: PI, tete: TE, centre: CE } = GABARIT;
const pas = PI.hauteur + PI.ecart;

/** La marque de chaque état, dessinée dans une boîte de 16 × 16 (rond vide = en stock, étoile = retenue, crayon = en rédaction, coche = postée, tiret = écartée). */
export const MARQUES_SVG = Object.freeze({
  stock: [['circle', { cx: 8, cy: 8, r: 5 }]],
  retenue: [['path', { d: 'M8 1.8l1.8 4 4.4.5-3.3 3 .9 4.3L8 11.4 4.2 13.6l.9-4.3-3.3-3 4.4-.5z' }]],
  redaction: [['path', { d: 'M3 13l.8-3.4 7-7 2.6 2.6-7 7z' }], ['path', { d: 'M9.6 3.8l2.6 2.6' }]],
  postee: [['path', { d: 'M3 8.5l3.4 3.4L13 4.8' }]],
  ecartee: [['path', { d: 'M3 8h10' }]],
});

/** Les branches d'une source : un pilier par branche (dans l'ordre de `R.PILIERS`), puis « Sans pilier » (pistes sans pilier, ou avec un pilier inconnu). Une branche sans piste n'existe pas. */
export function brancheDe(piste) {
  return R.convertirPilier(piste?.pilier) ?? CLE_SANS_PILIER;
}

/** Vrai quand la branche est repliée : par défaut toutes le sont au-delà de SEUIL_REPLI pistes dans la source, aucune sinon ; `inversees` = les branches que Jérôme a cliquées (elles prennent l'état contraire). */
export const estReplie = (cle, total, inversees = new Set()) => (total > SEUIL_REPLI) !== inversees.has(cle);

/** Texte d'une branche : « Cas concrets » ou, repliée, « Cas concrets (42) ». */
export const libelleBranche = (libelle, nombre, replie) => (replie ? `${libelle} (${R.formaterNombre(nombre)})` : libelle);

const date = (p) => L.versDate(p?.creeLe)?.getTime() ?? 0;
/** La piste la plus récente d'abord, puis par angle et identifiant : un ordre stable, donc des positions stables. */
const plusRecenteDabord = (a, b) => date(b) - date(a) || String(a.angle ?? '').localeCompare(String(b.angle ?? ''), 'fr') || String(a.id).localeCompare(String(b.id));

const courbe = (x1, y1, x2, y2) => {
  const mx = Math.round((x1 + x2) / 2);
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
};

/**
 * Calcule toute la carte d'une source. `pistes` = les pistes de CETTE source (toutes, écartées comprises) ; `idees` = les idées (pour la marque « en rédaction » ou « postée ») ;
 * `inversees` = les branches cliquées par Jérôme (voir `estReplie`).
 * Rend { largeur, hauteur, centre, branches, liens, total, vide }. Chaque branche : { cle, pilier, libelle, texte, nombre, replie, cote, tete: {x, y, largeur, hauteur}, pistes: [{ id, x, y, largeur, hauteur, texte, angle, etat, libelleEtat, pilier }] }.
 * Chaque lien : { d, pilier } (courbe du centre vers la tête d'une branche, ou de la tête vers une piste).
 */
export function construireCarte({ source = {}, pistes = [], idees = [], inversees = new Set() } = {}) {
  const liste = (pistes || []).filter((p) => p?.id);
  const total = liste.length;
  // Regroupement : l'ordre des branches est celui des piliers du module ; dans une branche, la piste la plus récente d'abord (ordre stable).
  const parBranche = new Map();
  for (const p of [...liste].sort(plusRecenteDabord)) {
    const cle = brancheDe(p);
    if (!parBranche.has(cle)) parBranche.set(cle, []);
    parBranche.get(cle).push(p);
  }
  const ordre = [...R.PILIERS.map((x) => x.id), CLE_SANS_PILIER].filter((cle) => parBranche.has(cle));
  const branches = ordre.map((cle) => {
    const dans = parBranche.get(cle);
    const replie = estReplie(cle, total, inversees);
    const libelle = cle === CLE_SANS_PILIER ? LIBELLE_SANS_PILIER : R.libellePilier(cle);
    const hauteurPistes = replie ? 0 : dans.length * pas - PI.ecart;
    return { cle, pilier: cle === CLE_SANS_PILIER ? null : cle, libelle, texte: libelleBranche(libelle, dans.length, replie), nombre: dans.length, replie, source: dans, hauteur: Math.max(TE.hauteur, hauteurPistes) };
  });
  // Répartition gauche / droite : chaque branche va du côté le moins haut (à égalité, à droite d'abord), dans l'ordre : le résultat est stable.
  const hauteurCote = { gauche: 0, droite: 0 };
  for (const b of branches) {
    b.cote = hauteurCote.gauche < hauteurCote.droite ? 'gauche' : 'droite';
    hauteurCote[b.cote] += b.hauteur + (hauteurCote[b.cote] ? GABARIT.ecartBranches : 0);
  }
  const hautMax = Math.max(hauteurCote.gauche, hauteurCote.droite, CE.hauteur);
  const hauteur = hautMax + 2 * M;
  // Colonnes (abscisses).
  const xCentre = M + PI.largeur + GABARIT.espaceTetePiste + TE.largeur + GABARIT.espaceCentreTete;
  const xTete = { gauche: M + PI.largeur + GABARIT.espaceTetePiste, droite: xCentre + CE.largeur + GABARIT.espaceCentreTete };
  const xPiste = { gauche: M, droite: xTete.droite + TE.largeur + GABARIT.espaceTetePiste };
  const largeur = xPiste.droite + PI.largeur + M;
  const centre = { x: xCentre, y: Math.round((hauteur - CE.hauteur) / 2), largeur: CE.largeur, hauteur: CE.hauteur, texte: V.couper(source.nom || 'Source', LONGUEUR_TEXTE), type: source.type ?? null };
  const liens = [];
  const curseur = { gauche: M + Math.round((hautMax - hauteurCote.gauche) / 2), droite: M + Math.round((hautMax - hauteurCote.droite) / 2) };
  for (const b of branches) {
    const haut = curseur[b.cote];
    curseur[b.cote] += b.hauteur + GABARIT.ecartBranches;
    b.tete = { x: xTete[b.cote], y: Math.round(haut + (b.hauteur - TE.hauteur) / 2), largeur: TE.largeur, hauteur: TE.hauteur };
    const bord = (cote) => (cote === 'gauche' ? { centre: centre.x, tete: b.tete.x + TE.largeur, piste: b.tete.x } : { centre: centre.x + CE.largeur, tete: b.tete.x, piste: b.tete.x + TE.largeur });
    const e = bord(b.cote);
    liens.push({ d: courbe(e.centre, centre.y + Math.round(CE.hauteur / 2), e.tete, b.tete.y + Math.round(TE.hauteur / 2)), pilier: b.pilier });
    b.pistes = b.replie ? [] : b.source.map((p, i) => {
      const etat = P.etatAffichePiste(p, idees);
      const rect = { x: xPiste[b.cote], y: haut + i * pas, largeur: PI.largeur, hauteur: PI.hauteur };
      liens.push({ d: courbe(e.piste, b.tete.y + Math.round(TE.hauteur / 2), b.cote === 'gauche' ? rect.x + rect.largeur : rect.x, rect.y + Math.round(PI.hauteur / 2)), pilier: b.pilier });
      return { id: p.id, ...rect, texte: V.couper(p.angle, LONGUEUR_TEXTE), angle: String(p.angle ?? ''), etat, libelleEtat: V.libelleEtatAffiche(etat), pilier: b.pilier };
    });
    delete b.source;
    delete b.hauteur;
  }
  return { largeur, hauteur, centre, branches, liens, total, vide: total === 0 };
}
