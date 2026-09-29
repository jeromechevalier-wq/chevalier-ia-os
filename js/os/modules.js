// Liste des modules de l'OS. La coquille ne connaît les modules que par cette liste.
// Ajouter un module = un dossier js/modules/<nom>/ + une entrée ici.
export const MODULES = [
  {
    id: 'crm',
    libelle: 'CRM',
    icone: 'users',
    // Sous entrées du menu (et routes principales)
    entrees: [
      { chemin: 'crm/accueil', libelle: 'Accueil', icone: 'house' },
      { chemin: 'crm/kanban', libelle: 'Kanban', icone: 'square-kanban' },
      { chemin: 'crm/liste', libelle: 'Liste', icone: 'list' },
    ],
    // Préfixe des routes gérées par le module (#/crm/...)
    prefixe: 'crm',
    // Fonction de montage : charge le module et renvoie son interface
    // { demarrer(ctx), arreter(), afficher(conteneur, segments, ctx), reglages(conteneur, ctx) }
    monter: () => import('../modules/crm/index.js'),
  },
];
