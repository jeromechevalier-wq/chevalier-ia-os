// Étape des modules Achats pour la page Réglages > Déploiement (règle du 26/10/2026 : une fonction absente chez les clients se dit à l'écran). LOGIQUE PURE.
// Une seule ligne pour les cinq modules (et pour la fonction basePorte, 26/11/2026) (portée par le premier : elle n'existe que si le module est actif, donc jamais chez un client) ; étape à cocher à la main.
const geler = (liste) => Object.freeze(liste.map((e) => Object.freeze(e)));

export const ETAPES_DEPLOIEMENT_ACHATS = geler([
  { id: 'achats-plateforme', groupe: 'avant', module: 'achatsfournisseurs', type: 'manuel', libelle: 'Modules Achats : absents chez les clients',
    reparation: 'Les cinq modules Achats n’existent que dans cet espace. Pour les ouvrir à un autre espace, il reste à faire : relier sa base au projet de connexion, régler la connexion par espace, et fermer les règles de la plateforme. Tant que ce n’est pas fait, ils ne sont pas activables ailleurs. La porte de la base (fonction basePorte) n’existe pas non plus sur la plateforme des autres espaces : elle n’existe que dans un espace qui a sa propre base.',
    route: 'reglages/base' },
]);
