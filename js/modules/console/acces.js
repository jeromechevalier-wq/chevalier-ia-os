// Accès à la Console : réservé à Jérôme (décision du 16/11/2026, exception écrite dans CLAUDE.md et docs/console.md).
// Ce fichier ne sert qu'à CACHER le module (menu, montage). La vraie barrière est côté serveur : la fonction `consoleEtat`
// (functions/src/console/appel.js) contrôle l'identité à chaque appel. Aucun import : testable seul.

/** Le seul compte qui voit la Console. Le compte du bot (Charles) n'y a pas accès. */
export const COMPTES_CONSOLE = Object.freeze(['jerome.chevalier@gmail.com']);

/** Ce compte peut-il voir la Console ? `compte` vient de compteAutorise (js/os/auth.js) : { email, … } ou null. */
export function peutVoirConsole(compte) {
  const email = typeof compte?.email === 'string' ? compte.email.toLowerCase() : '';
  return COMPTES_CONSOLE.includes(email);
}
