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
  devis: () => import('../modules/devis/index.js'),
  veille: () => import('../modules/veille/index.js'),
  automatisations: () => import('../modules/automatisations/index.js'),
  tableaudebord: () => import('../modules/tableaudebord/index.js'),
  mcp: () => import('../modules/mcp/index.js'),
};

const versModule = (d) => ({
  id: d.id,
  libelle: d.libelleMenu,
  icone: d.iconeMenu,
  entrees: d.ecrans.map((e) => ({ chemin: e.route, libelle: e.libelle, icone: e.icone })), // sous entrées du menu (et routes principales)
  prefixe: d.prefixe, // préfixe des routes gérées par le module (#/crm/...)
  monter: MONTAGES[d.id],
});

// Espace de Jérôme (racine) : tous les modules, comme chez un client (décision du 18/10/2026 : même code chez Jérôme et chez les clients,
// une fonction existe d'abord chez lui). Le module « automatisations » existe chez Jérôme depuis le 16/10/2026 et « mcp » (Connecter l’assistant) depuis
// le 18/10/2026 : sa page ne lit rien dans la base à la racine.
export const MODULES = MODULES_DECLARES.map(versModule);
// Espace d'un client de la plateforme : tous les modules possibles (espace-modules.js ne garde que ses modules actifs).
export const MODULES_CLIENT = MODULES_DECLARES.map(versModule);
