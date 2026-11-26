// Modules allumés dans une « maison » (déploiement à part, CRM racine), 27/11/2026. Sans Firebase : se teste seul (tests/maison-modules.test.js).
// Le réglage est le champ FACULTATIF `modules` de reglages_maison/ecran (lu à la connexion par js/os/comptes-maison.js) : une liste d'identifiants de modules
// (ceux de MODULES_DECLARES, js/os/registre.js), par exemple ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'].
//  - champ ABSENT (ou null) : comportement d'avant, inchangé (maison d’origine) : tous les modules ; Console et modules Achats (`seulJerome`) pour le seul titulaire ;
//  - champ PRÉSENT : seuls les modules listés, pour TOUS les comptes de la maison (y compris les modules Achats), dépendances vérifiées par la même logique que
//    la plateforme (`verifierActivation`) ; la Console s'y ajoute pour le titulaire SEUL (comptes_jerome_seul), jamais pour un autre compte, même si elle est listée ;
//    un identifiant inconnu est ignoré (avertissement dans la console du navigateur) ; une valeur qui n'est pas une liste n'allume aucun module (prudence).
// Ce fichier ne fait que montrer ou cacher : les vraies barrières restent les règles Firestore, la porte de la base et les contrôles du serveur (Console : `consoleEtat`).
import { moduleDeclare, verifierActivation } from './registre.js';

const ID_CONSOLE = 'console';

/** Range la valeur brute du champ : { reglage, demandes, avertissements }. `reglage` faux = champ absent (comportement d'avant). */
export function lireModulesMaison(brut) {
  if (brut === undefined || brut === null) return { reglage: false, demandes: [], avertissements: [] };
  if (!Array.isArray(brut)) {
    return { reglage: true, demandes: [], avertissements: ['reglages_maison/ecran : le champ « modules » doit être une liste d’identifiants de modules ; aucun module n’est allumé.'] };
  }
  const demandes = [];
  const avertissements = [];
  for (const v of brut) {
    const id = typeof v === 'string' ? v.trim() : '';
    if (id === ID_CONSOLE) { avertissements.push('reglages_maison/ecran : « console » ne s’allume pas par le champ « modules » : elle reste réservée au titulaire, ignorée.'); continue; }
    if (!id || !moduleDeclare(id)) { avertissements.push(`reglages_maison/ecran : module inconnu ignoré : « ${String(v)} ».`); continue; }
    if (!demandes.includes(id)) demandes.push(id);
  }
  return { reglage: true, demandes, avertissements };
}

/**
 * Modules de la session dans une maison. `tous` = la liste des modules montables (js/os/modules.js, dans l'ordre de démarrage) ; `titulaire` = le compte est dans
 * comptes_jerome_seul ; `brut` = valeur du champ `modules` (modulesEcranBrut()). Rend { modules, accueil, avertissements } :
 * `accueil` = première route de la session (premier écran du PREMIER module de la liste du réglage qui est allumé ; 'console/vue' ou 'reglages' s'il n'y en a aucun),
 * ou null sans réglage (accueil d'avant : crm/accueil).
 */
export function modulesDeLaMaison(tous, { titulaire = false, brut } = {}) {
  const lu = lireModulesMaison(brut);
  if (!lu.reglage) return { modules: tous.filter((m) => !m.seulJerome || titulaire), accueil: null, avertissements: [] };
  const v = verifierActivation(lu.demandes, { maison: true });
  const modules = tous.filter((m) => (m.id === ID_CONSOLE ? titulaire === true : v.actifs.includes(m.id)));
  const premier = lu.demandes.map(moduleDeclare).find((d) => d && v.actifs.includes(d.id) && d.ecrans.length);
  const accueil = premier ? (premier.entreeMenu || premier.ecrans[0].route) : (modules.some((m) => m.id === ID_CONSOLE) ? 'console/vue' : 'reglages');
  return { modules, accueil, avertissements: [...lu.avertissements, ...v.erreurs] };
}
