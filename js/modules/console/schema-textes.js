// Tous les textes affichés par le schéma d'architecture de la Console (js/modules/console/schema.js), et rien d'autre.
// Fichier sans import : tests/statique.test.js le lit et vérifie que chaque mot appartient à sa liste blanche (dépôt public, garde-fou 5 de docs/console.md).
export const TEXTES_SCHEMA = Object.freeze({
  titre: 'Architecture',
  resume: 'Schéma d\'architecture : Chevalier IA OS est une maison, Chevalier IA App un immeuble avec un appartement par client, '
    + 'une maison client est en construction et une autre est à venir ; chaque bâtiment a son nuage de données, le MCP va droit au nuage, '
    + 'et n8n tourne sur un serveur à part.',
  batiments: [
    { nom: 'Chevalier IA OS', genre: 'maison', nuage: ['Firestore', 'tes données'], telephone: true, legende: ['Ta maison : tu testes', 'tout ici en premier'] },
    { nom: 'Chevalier IA App', genre: 'immeuble', nuage: ['Firestore', 'un tiroir par espace'], telephone: true, legende: ['L\'immeuble : un', 'appartement par client'] },
    { nom: 'Maison client 1', genre: 'chantier', nuage: ['Cloud SQL', 'les factures'], legende: ['En construction'] },
    { nom: 'Maison à venir', genre: 'avenir', nuage: ['Données', 'à venir'], legende: ['À venir'] },
  ],
  etages: ['À venir', 'Appartement 3', 'Appartement 2', 'Appartement 1'],
  telephone: 'MCP',
  // Textes fixes du schéma quand le registre privé répond (phase 2, PR 2) : jamais un nom (les noms arrivent du serveur, pour Jérôme seul).
  autres: ['et', 'autres'], // « et 4 autres » : le nombre est ajouté entre les deux mots
  etats: { en_service: 'En service', en_construction: 'En construction', a_venir: 'À venir' },
  nuageMaison: ['Données', 'à part'],
  n8n: ['n8n : automatisations', 'sur un serveur à part'],
  legende: 'Nuage = données · téléphone = MCP, va droit au nuage · grue = en construction · pointillés = à venir. '
    + 'Schéma figé : les détails (projets, serveurs) sont dans le second cerveau.',
});
