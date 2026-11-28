// Tous les textes affichés par le schéma d'architecture de la Console (js/modules/console/schema.js), et rien d'autre.
// Fichier sans import : tests/statique.test.js le lit et vérifie que chaque mot appartient à sa liste blanche (dépôt public, garde-fou 5 de docs/console.md).
export const TEXTES_SCHEMA = Object.freeze({
  titre: 'Architecture',
  resume: 'Schéma d\'architecture : Chevalier IA OS est une maison, Chevalier IA App un immeuble avec un appartement par client, '
    + 'une maison client est en construction et une autre est à venir ; chaque bâtiment a son nuage de données, le MCP va droit au nuage, '
    + 'et n8n tourne sur un VPS Hostinger.',
  batiments: [
    { nom: 'Chevalier IA OS', genre: 'maison', nuage: ['Firestore', 'tes données', 'et tes réglages'], telephone: true, legende: ['Ta maison : tu testes', 'tout ici en premier'] },
    { nom: 'Chevalier IA App', genre: 'immeuble', nuage: ['Firestore', 'un tiroir par espace'], telephone: true, legende: ['L\'immeuble : un', 'appartement par client'] },
    { nom: 'Maison client 1', genre: 'chantier', nuage: ['Cloud SQL', 'les données'], legende: ['En construction'] },
    { nom: 'Maison à venir', genre: 'avenir', nuage: ['Données', 'à venir'], legende: ['À venir'] },
  ],
  etages: ['À venir', 'Appartement 3', 'Appartement 2', 'Appartement 1'],
  telephone: 'MCP',
  // Textes fixes du schéma quand le registre privé répond (phase 2, PR 2) : jamais un nom (les noms arrivent du serveur, pour Jérôme seul).
  etats: { en_service: 'En service', en_construction: 'En construction', a_venir: 'À venir' },
  nuageMaison: ['Données', 'à part'], // maison du registre sans projet noté ; avec projets : le rôle du dernier projet, puis « les données »
  lesDonnees: 'les données',
  // « VPS Hostinger » : décision explicite de Jérôme du 28/11/2026, exception au garde-fou 5 de docs/console.md (aucune description de l'infrastructure).
  n8n: ['n8n : automatisations', 'sur VPS Hostinger'],
  legende: 'Nuage = données · téléphone = MCP, va droit au nuage · grue = en construction · pointillés = à venir. '
    + 'Schéma figé : les détails (projets, serveurs) sont dans le second cerveau.',
});
