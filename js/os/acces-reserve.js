// Qui est Jérôme, pour CACHER ce qui lui est réservé dans l'écran (24/11/2026 : Réglages > « Connexion à la base »).
// Même principe que js/modules/console/acces.js : ce fichier ne fait que montrer ou cacher ; la vraie barrière est ailleurs
// (règles Firestore de `base_parametres` : écriture réservée à son compte ; fonction `baseAccorderAcces` : identité contrôlée côté serveur à chaque appel).
// Aucun import : testable seul.

/** Le seul compte pour qui ces réglages existent. */
export const COMPTES_RESERVES = Object.freeze(['jerome.chevalier@gmail.com']);

/** Ce compte est-il celui de Jérôme ? `compte` vient de compteAutorise (js/os/auth.js) : { email, … } ou null. */
export function compteReserve(compte) {
  const email = typeof compte?.email === 'string' ? compte.email.toLowerCase() : '';
  return COMPTES_RESERVES.includes(email);
}
