// Favoris (étoiles de la fenêtre « Filtres », par personne) : logique PURE du module Achats « Factures » (25/11/2026, PR 8a). Aucun import, aucun réseau.
// Recopiée de l'appli d'origine : chaque clic ne touche QUE sa clé ; l'étoile change tout de suite ; la réponse du serveur ne fixe que cette clé ;
// un échec n'annule que cette clé (jamais une « photo » entière recollée après coup : deux clics qui se croisent ne s'écrasent pas).
// Règle d'affichage : les favoris EN HAUT, un trait fin, puis tous les autres par ordre alphabétique (sans tenir compte des majuscules ni des accents).
// Genres posés ici : « chantier » (clé = identifiant du chantier) et « entreprise » (clé = SIREN, 9 chiffres). Le genre « agence » est ignoré à la lecture (converti en « entreprise » par la base).
import { normaliser } from './logique.js';

export const GENRE_CHANTIER = 'chantier';
export const GENRE_ENTREPRISE = 'entreprise';
export const GENRES = Object.freeze([GENRE_CHANTIER, GENRE_ENTREPRISE]);
export const MESSAGE_ERREUR_FAVORI = 'Impossible d’enregistrer ton favori. Réessaie.';
export const LIBELLE_METTRE_FAVORI = 'Mettre en favori';
export const LIBELLE_RETIRER_FAVORI = 'Retirer des favoris';

/** SIREN (9 premiers chiffres) d'un SIRET de 14 chiffres ; null si le SIRET est absent ou mal formé. C'est la clé du favori « entreprise ». */
export const sirenDeSiret = (siret) => (siret && /^\d{14}$/.test(siret.trim()) ? siret.trim().slice(0, 9) : null);

/** Clé du favori « entreprise » d'une facture : le SIREN du SIRET de son agence, sinon le SIREN lu sur la facture (9 chiffres) ; null si aucun des deux. */
export const cleEntreprise = (siret, siren) => sirenDeSiret(siret) ?? (siren && /^\d{9}$/.test(siren.trim()) ? siren.trim() : null);

export const cleDeFavori = (genre, cle) => `${genre}:${cle}`;
export const ensembleDeFavoris = (liste) => new Set(liste.map((f) => cleDeFavori(f.genre, f.cle)));

/** Nom accessible de l'étoile : l'action qu'un clic fera. */
export const libelleEtoile = (actif) => (actif ? LIBELLE_RETIRER_FAVORI : LIBELLE_METTRE_FAVORI);

/** Favoris lus dans la réponse de la base : seulement les genres « chantier » et « entreprise » avec une clé texte (le reste est ignoré). Une réponse qui n'est pas une liste donne une liste vide. */
export const favorisDeReponse = (reponse) => (Array.isArray(reponse) ? reponse.filter((f) => f && GENRES.includes(f.genre) && typeof f.cle === 'string' && f.cle) : []);

const comparer = (a, b) => normaliser(a).localeCompare(normaliser(b), 'fr');

/** Sépare une liste de textes en favoris (triés) et autres (triés), sans casse ni accents. Aucun favori : `favoris` est vide et la liste reste celle d'avant. */
export function ordonnerAvecFavoris(valeurs, estFavori) {
  const tries = [...valeurs].sort(comparer);
  return { favoris: tries.filter(estFavori), autres: tries.filter((v) => !estFavori(v)) };
}

/** Nom affiché (sans casse ni accents) -> clés de favori. Une paire sans clé (facture sans agence, « Sans chantier ») est ignorée : pas d'étoile. Plusieurs clés pour un même nom : l'étoile les prend alors toutes. */
export function clesParNom(paires) {
  const m = new Map();
  for (const { nom, cle } of paires) {
    if (!nom || !nom.trim() || !cle) continue;
    const k = normaliser(nom);
    const l = m.get(k) ?? [];
    if (!l.includes(cle)) l.push(cle);
    m.set(k, l);
  }
  return m;
}

/** Clés à basculer quand on clique l'étoile d'un nom : s'il est en favori, on retire celles qui le sont ; sinon on les met toutes. */
export const clesABasculer = (cles, estFavori) => (cles.some(estFavori) ? cles.filter(estFavori) : cles);

/**
 * Magasin des favoris de la personne. `appel(genre, cle)` met ou retire côté serveur et renvoie l'état APRÈS (true = en favori).
 */
export function creerMagasinFavoris(appel) {
  let favoris = new Set();
  let erreur = null;
  let ecouteurs = [];
  const emettre = () => { for (const f of ecouteurs) f(); };
  const fixer = (k, actif) => { favoris = actif ? new Set(favoris).add(k) : new Set([...favoris].filter((x) => x !== k)); };
  let enCours = {}; // clés dont un clic attend encore la réponse (la lecture initiale ne les écrase pas)
  return {
    lire: () => favoris,
    lireErreur: () => erreur,
    est: (genre, cle) => favoris.has(cleDeFavori(genre, cle)),
    abonner(f) { ecouteurs = [...ecouteurs, f]; return () => { ecouteurs = ecouteurs.filter((x) => x !== f); }; },
    /** Lecture initiale : remplace tout SAUF les clés dont un clic attend encore sa réponse. */
    charger(liste) {
      const pendantes = Object.keys(enCours);
      favoris = new Set([...ensembleDeFavoris(liste)].filter((k) => !pendantes.includes(k)).concat(pendantes.filter((k) => favoris.has(k))));
      emettre();
    },
    effacerErreur() { if (erreur) { erreur = null; emettre(); } },
    async basculer(genre, cle) {
      const k = cleDeFavori(genre, cle);
      const etait = favoris.has(k);
      erreur = null;
      enCours = { ...enCours, [k]: (enCours[k] ?? 0) + 1 };
      fixer(k, !etait); emettre();
      try {
        const apres = await appel(genre, cle);
        fixer(k, apres);
      } catch {
        fixer(k, etait);
        erreur = { genre, message: MESSAGE_ERREUR_FAVORI };
      }
      const reste = (enCours[k] ?? 1) - 1;
      enCours = reste <= 0 ? Object.fromEntries(Object.entries(enCours).filter(([c]) => c !== k)) : { ...enCours, [k]: reste };
      emettre();
    },
  };
}

/** Branche une liste de filtres sur le magasin : `genre` + table nom -> clés. `peut` dit si une valeur a une étoile ; `erreur` est le message court d'un enregistrement raté. */
export function favorisDeListe(genre, cles, magasin) {
  const clesDe = (o) => cles.get(normaliser(o)) ?? [];
  const estCle = (c) => magasin.est(genre, c);
  return {
    peut: (o) => clesDe(o).length > 0,
    est: (o) => clesDe(o).some(estCle),
    basculer: (o) => { for (const c of clesABasculer(clesDe(o), estCle)) void magasin.basculer(genre, c); },
  };
}
