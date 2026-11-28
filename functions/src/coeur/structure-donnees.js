// Numéro de la forme des données attendue par ce code (28/11/2026, Console phase 2 : versions des bâtiments).
// À augmenter à chaque changement de la forme des données ; le script de migration du bâtiment écrit ensuite structure_base.
// Le tampon horaire (coeur/tampon-version.js) recopie ce numéro dans reglages_maison/version (champ structure_code) ; il n'écrit JAMAIS structure_base.
export const STRUCTURE_DONNEES = 1;
