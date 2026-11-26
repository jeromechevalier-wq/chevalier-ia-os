// Outils proposés par le serveur MCP d'une maison (26/11/2026, chantier « Achats par l'assistant ») : fonction PURE, sans Firebase (testée seule et par le serveur complet).
// Le réglage est le champ facultatif `modules` de reglages_maison/ecran (le même que l'écran : js/os/maison-modules.js, copié dans functions/partage/) :
//  - champ ABSENT (le CRM de Jérôme) : `outils` tels quels, au caractère près ; les outils Achats ne sont PAS ajoutés (chez Jérôme, ses écrans Achats lisent une autre base) ;
//  - champ PRÉSENT : `qui_suis_je`, puis les outils des modules listés et actifs (mêmes dépendances que l'écran : verifierActivation en mode maison),
//    ceux du socle si un module listé déclare `socle: true` (comme outilsMcpActifs), `diagnostiquer_fichiers` seulement avec Affaires ou Projets,
//    et les outils Achats (`outilsAchats`) seulement si `achatsfactures` est listé. Identifiant inconnu ignoré, « console » ignorée, valeur qui n'est pas une liste = aucun module.
// L'ordre est celui de `outils`, puis celui de `outilsAchats`.
import { lireModulesMaison } from '../../partage/maison-modules.js';
import { MODULES_DECLARES, SOCLE, verifierActivation } from '../../partage/registre.js';

export const MODULE_ACHATS_ASSISTANT = 'achatsfactures';
const MODULES_DIAGNOSTIC = Object.freeze(['affaires', 'projets']);

/** Modules réellement actifs pour le réglage brut (liste d'identifiants), dans l'ordre de démarrage. */
export function modulesActifsMaison(brut) {
  const lu = lireModulesMaison(brut);
  return verifierActivation(lu.demandes, { maison: true }).actifs;
}

/**
 * `outils` : le catalogue du serveur (OUTILS) ; `outilsAchats` : le catalogue à part des outils Achats ; `reglage` : `{ etat, brut }` de lireModulesEcran (coeur/config.js).
 * Rend la liste des outils à proposer (avant le filtre par profil, fait par servirMcp).
 */
export function outilsDeLaMaison({ outils, outilsAchats = [], reglage }) {
  if (!reglage || reglage.etat !== 'present') return outils;
  const actifs = modulesActifsMaison(reglage.brut);
  const noms = new Set(['qui_suis_je']);
  for (const m of MODULES_DECLARES) if (actifs.includes(m.id)) for (const n of m.outilsMcp) noms.add(n);
  if (MODULES_DECLARES.some((m) => actifs.includes(m.id) && m.socle === true)) for (const n of SOCLE.outilsMcp) noms.add(n);
  if (actifs.some((id) => MODULES_DIAGNOSTIC.includes(id))) noms.add('diagnostiquer_fichiers');
  const gardes = outils.filter((o) => noms.has(o.nom));
  return actifs.includes(MODULE_ACHATS_ASSISTANT) ? [...gardes, ...outilsAchats] : gardes;
}
