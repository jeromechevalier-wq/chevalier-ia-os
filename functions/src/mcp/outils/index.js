// Registre des outils MCP. Chaque outil déclare les profils autorisés ; le serveur n'expose et n'exécute que ceux du profil
// du jeton (deuxième niveau de protection, après le filtre « tools.include » côté Hermes).
import { qui_suis_je } from './identite.js';
import { OUTILS_LECTURE } from './lecture.js';

export const OUTILS = [qui_suis_je, ...OUTILS_LECTURE];

export const outilsAutorises = (profil, outils = OUTILS) => outils.filter((o) => o.profils.includes(profil));
