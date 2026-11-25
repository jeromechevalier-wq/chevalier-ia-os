// Favoris de chantier (étoiles, par personne) : logique PURE du module Achats « Chantiers » (24/11/2026, PR 6). Aucun import, aucun réseau.
// Recopiée de l'appli d'origine : chaque clic ne touche QUE sa clé ; l'étoile change tout de suite ; la réponse du serveur ne fixe que cette clé ;
// un échec n'annule que cette clé (jamais une « photo » entière recollée après coup : deux clics qui se croisent ne s'écrasent pas).
// Seul le genre « chantier » est posé par ce module (les deux autres genres de la base, entreprise et agence, appartiennent au module Fournisseurs).

export const GENRE_CHANTIER = 'chantier';
export const MESSAGE_ERREUR_FAVORI = 'Impossible d’enregistrer ton favori. Réessaie.';
export const LIBELLE_METTRE_FAVORI = 'Mettre en favori';
export const LIBELLE_RETIRER_FAVORI = 'Retirer des favoris';

export const cleDeFavori = (genre, cle) => `${genre}:${cle}`;
export const ensembleDeFavoris = (liste) => new Set(liste.map((f) => cleDeFavori(f.genre, f.cle)));

/** Nom accessible de l'étoile : l'action qu'un clic fera. */
export const libelleEtoile = (actif) => (actif ? LIBELLE_RETIRER_FAVORI : LIBELLE_METTRE_FAVORI);

/** Favoris de chantier lus dans la réponse de la base : seulement le genre « chantier » avec une clé texte (le reste est ignoré). Une réponse qui n'est pas une liste donne une liste vide. */
export const favorisDeChantiers = (reponse) => (Array.isArray(reponse) ? reponse.filter((f) => f && f.genre === GENRE_CHANTIER && typeof f.cle === 'string' && f.cle) : []);

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
