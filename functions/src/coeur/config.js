// Configuration de l'espace pour le serveur MCP : étapes de vente, phases de projet, options et membres, lues dans crm_parametres.
// C'est LA MÊME configuration que celle de l'écran (partage/logique.js : construireConfig) : une seule règle pour les deux.
// `racine` : true = le CRM de Jérôme (valeurs historiques si les documents n'existent pas encore), false = espace client (jeu neutre).
// Le serveur ne sert aujourd'hui que la racine ; le serveur multi-clients passera `racine: false` et la liste `membres` de l'espace.
import * as L from '../../partage/logique.js';
import { COLLECTIONS as C } from './donnees.js';

export async function lireConfig(donnees, { racine = true, membres = null } = {}) {
  const [etapes, phases, reglages] = await Promise.all(['etapes', 'phases', 'reglages'].map((id) => donnees.document(C.parametres, id)));
  return L.construireConfig({ etapes, phases, reglages: L.reglagesEffectifs(reglages, { racine }) }, { racine, membres });
}
