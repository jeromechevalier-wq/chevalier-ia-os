// Adresse de retour « boucle locale » des applications installées sur l'ordinateur (RFC 8252 §7.3), utilisée par Claude Code sur le Mac (28/11/2026).
// Fichier SANS dépendance : importé par oauth/config.js (serveur de Jérôme et maisons) et par clients/config.js (plateforme clients) : même règle partout.
// Forme acceptée, testée sur la chaîne brute (aucune normalisation par new URL) :
//   http://localhost:<port>/callback  ou  http://127.0.0.1:<port>/callback
//   - http seulement (la boucle locale n'a pas de certificat ; RFC 8252 §7.3) ;
//   - port obligatoire, de 1024 à 65535, sans zéro de tête (Claude Code prend un port libre au hasard à chaque connexion) ;
//   - chemin exactement /callback ; ni requête, ni fragment, ni identifiant@, ni majuscules, ni autre hôte (localhost.exemple.com refusé).
// Le port n'est pas retenu à l'enregistrement (rien n'y est stocké) ; il est comparé EXACTEMENT entre le consentement et l'échange du code (magasin.js).
// Ce qui protège : le code n'arrive qu'à un programme de l'ordinateur de la personne, PKCE S256 obligatoire, compte Google autorisé, et le clic
// « Autoriser » sur une page qui dit en clair que le code part vers un programme de CET ordinateur.

const FORME = /^http:\/\/(?:localhost|127\.0\.0\.1):([1-9][0-9]{3,4})\/callback$/;

/** Vrai si `uri` est une adresse de retour de boucle locale acceptée (voir plus haut). */
export function redirectionBoucleLocale(uri) {
  if (typeof uri !== 'string') return false;
  const m = FORME.exec(uri);
  if (!m) return false;
  const port = Number(m[1]);
  return port >= 1024 && port <= 65535;
}
