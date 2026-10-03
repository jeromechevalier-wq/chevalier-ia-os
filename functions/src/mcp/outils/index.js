// Registre des outils MCP. Chaque outil déclare les profils autorisés ; le serveur n'expose et n'exécute que ceux du profil
// du jeton (deuxième niveau de protection, après le filtre « tools.include » côté Hermes).
//  lecteur : lecture ; bibliothécaire : + écriture ; claude-code : + suppression et restauration.
import { qui_suis_je } from './identite.js';
import { OUTILS_LECTURE } from './lecture.js';
import { OUTILS_ECRITURE } from './ecriture.js';
import { OUTILS_SUPPRESSION } from './suppression.js';

export const OUTILS = [qui_suis_je, ...OUTILS_LECTURE, ...OUTILS_ECRITURE, ...OUTILS_SUPPRESSION];

export const outilsAutorises = (profil, outils = OUTILS) => outils.filter((o) => o.profils.includes(profil));
