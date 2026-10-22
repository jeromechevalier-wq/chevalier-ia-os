// Pastilles « à valider » des modules (22/10/2026) : un petit magasin de nombres, un par module. La coque y écrit ce que l'écoute du module annonce ;
// le menu et la barre d'onglets le lisent. Aucun module n'est nommé ici : le registre (js/os/registre.js, champ `badge`) dit qui a une pastille.
const valeurs = new Map();
const abonnes = new Set();

/** Nombre actuel d'un module (0 s'il n'a rien annoncé). */
export const badgeDe = (idModule) => valeurs.get(idModule) ?? 0;

/** Un nombre entier positif ou 0 ; tout le reste (texte, négatif, NaN) vaut 0. */
export const nombreValide = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function definirBadge(idModule, nombre) {
  const n = nombreValide(nombre);
  if (badgeDe(idModule) === n) return;
  if (n === 0) valeurs.delete(idModule); else valeurs.set(idModule, n);
  for (const f of [...abonnes]) { try { f(idModule, n); } catch (e) { console.warn(e); } }
}

/** Remet tous les nombres à 0 (déconnexion, changement d'espace). */
export function reinitialiserBadges() {
  for (const id of [...valeurs.keys()]) definirBadge(id, 0);
}

/** Appelle `rappel(idModule, nombre)` à chaque changement. Renvoie la fonction qui arrête. */
export function surBadge(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

/** Texte de la pastille : 1 à 9, puis « 9+ ». */
export const texteBadge = (n) => (n > 9 ? '9+' : String(n));

/** Phrase pour les lecteurs d'écran : « 3 à valider ». */
export const phraseBadge = (n, texte) => `${n} ${texte}`;
