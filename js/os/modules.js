// Liste des modules de l'OS. La coquille ne connaît les modules que par cette liste.
// Ajouter un module = un dossier js/modules/<nom>/ + sa déclaration dans js/os/registre.js (écrans, collections, outils MCP) + son montage ici.
// Les déclarations (nom, écrans, dépendances…) vivent dans registre.js (sans Firebase, testable seul) ; ce fichier y ajoute seulement
// le montage (import du code du module). Le CRM de Jérôme (racine) utilise tous les modules, dans cet ordre ; chez un client, seuls les
// modules actifs de sa fiche sont montés (js/os/espace-modules.js).
import { MODULES_DECLARES } from './registre.js';

// Fonction de montage : charge le module et renvoie son interface
// { demarrer({ compte, cheminBase }), arreter(), afficher(conteneur, segments, ctx), reglages(conteneur, ctx),
//   actionsRapides: [{ libelle, icone, action }], rechercher(saisie) → { groupes } }
const MONTAGES = {
  affaires: () => import('../modules/crm/index.js'),
  projets: () => import('../modules/projets/index.js'),
};

export const MODULES = MODULES_DECLARES.map((d) => ({
  id: d.id,
  libelle: d.libelleMenu,
  icone: d.iconeMenu,
  entrees: d.ecrans.map((e) => ({ chemin: e.route, libelle: e.libelle, icone: e.icone })), // sous entrées du menu (et routes principales)
  prefixe: d.prefixe, // préfixe des routes gérées par le module (#/crm/...)
  monter: MONTAGES[d.id],
}));
