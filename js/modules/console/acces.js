// Accès à la Console : réservé à Jérôme (décision du 16/11/2026, exception écrite dans CLAUDE.md et docs/console.md).
// Ce fichier ne sert qu'à CACHER le module (menu, montage). La vraie barrière est côté serveur : la fonction `consoleEtat`
// (functions/src/console/appel.js) contrôle l'identité à chaque appel.
// Chantier 0 (26/11/2026) : la liste n'est plus écrite ici ; elle vient de reglages_maison/ecran (comptes_jerome_seul), lue à la connexion
// (js/os/comptes-maison.js, sans Firebase : testable seul). Liste pas encore lue ou vide = personne ne voit la Console. Le compte du bot n'y est pas.
import { estCompteTitulaire } from '../../os/comptes-maison.js';

/** Ce compte peut-il voir la Console ? `compte` vient de js/os/auth.js : { email, … } ou null. */
export function peutVoirConsole(compte) {
  return estCompteTitulaire(compte?.email);
}
