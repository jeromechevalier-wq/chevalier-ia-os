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
      { chemin: 'crm/personnes', libelle: 'Personnes', icone: 'user' },
      { chemin: 'crm/organisations', libelle: 'Organisations', icone: 'building-2' },
      { chemin: 'crm/affaires', libelle: 'Affaires', icone: 'briefcase' },
      { chemin: 'crm/journal', libelle: 'Journal', icone: 'history' },
    ],
    // Préfixe des routes gérées par le module (#/crm/...)
    prefixe: 'crm',
    // Fonction de montage : charge le module et renvoie son interface
    // { demarrer(ctx), arreter(), afficher(conteneur, segments, ctx), reglages(conteneur, ctx),
    //   actionsRapides: [{ libelle, icone, action }], rechercher(saisie) → { groupes } }
    monter: () => import('../modules/crm/index.js'),
  },
];
