# Pilotage : des graphiques alimentés par une base de données

Écrit le 23/11/2026 (PR navigateur du module). Le dépôt est public : aucun secret, aucun nom de vue ou de colonne réel ici, seulement des exemples fictifs.

## À quoi ça sert

Un écran « Pilotage » qui montre des graphiques (Apache ECharts 6.1.0, fichier figé dans `assets/vendor/echarts/`, jamais de CDN). Ce que chaque graphique montre est décidé par un **réglage** (un objet JSON) que Claude modifie à la demande de Jérôme ; il n'y a aucun éditeur à l'écran. Chez Jérôme seulement pour l'instant : les fonctions du serveur n'existent pas encore sur la plateforme clients (voir `docs/activer-desactiver-modules.md`).

## Qui fait quoi

1. Le **serveur** (fonction `pilotageLire`, région `europe-west9`) lit le réglage (table `pilotage_parametres`, serveur seulement), interroge la base de données, et répond avec les lignes de chaque tuile.
2. Le **navigateur** (`js/modules/pilotage/`) ne lit ni n'écrit jamais Firestore pour ce module. Il appelle `pilotageLire` **une seule fois** par affichage (ou par clic sur « Actualiser » / « Réessayer »), sans cache, injecte les lignes dans l'option ECharts de chaque tuile et dessine.
3. L'option reçue est une **donnée** : elle n'est jamais exécutée comme du code, elle est passée à `setOption`. L'infobulle est forcée en mode texte (jamais de HTML venu des données).

## Le contrat avec le serveur

Réponse de `pilotageLire({})` :

```json
{
  "titre": "Mes chiffres",
  "tuiles": [
    {
      "id": "ventes",
      "titre": "Ventes par mois",
      "option": { "xAxis": { "type": "category" }, "yAxis": { "type": "value" }, "series": [{ "type": "bar", "encode": { "x": "mois", "y": "montant" } }] },
      "lignes": [{ "mois": "Janv.", "montant": 100 }, { "mois": "Févr.", "montant": 150 }]
    }
  ],
  "erreurs": [{ "id": "encaissements", "message": "…" }]
}
```

- Injection des lignes (`injecterLignes`, `js/modules/pilotage/logique.js`) : si `option.dataset` est un objet, `dataset.source = lignes` ; si c'est un tableau, `dataset[0].source = lignes` (les autres jeux, par exemple un `transform`, renvoient à lui par `fromDatasetIndex` ou `fromDatasetId`) ; sans `dataset`, `dataset: { source: lignes }`. Les séries utilisent `encode` par nom de colonne.
- `lignes` est un tableau d'**objets** `{ colonne: valeur }` et rien d'autre. Si `lignes` contient autre chose, la tuile n'est pas dessinée : « Cette tuile n'a pas pu être dessinée. » (rien n'est jeté en silence).
- Défense en profondeur : avant `setOption`, `nettoyerOption` (`logique.js`) retire de l'option les clés `link`, `sublink`, `toolbox`, les éléments `graphic` de type image, et les `backgroundColor` / `symbol` qui sont des adresses (`image://…` ou `://`). L'option reçue n'est pas modifiée.
- `pilotageLire({ exporter: true })` renvoie `{ reglages: <objet> }` (administrateur seulement : le serveur refuse les autres avec `permission-denied`). C'est ce qu'utilise le bouton « Exporter mes données » (Réglages > Pilotage > Sauvegarde).

## Ajouter une tuile

Rien à coder dans le navigateur : on ajoute une tuile au réglage (par Claude, côté serveur, fonction `pilotageEnregistrerReglages`, jamais appelée par l'écran) avec son `id`, son `titre`, sa requête et son `option` ECharts. Le thème (couleurs, police, traits) est lu dans `css/tokens.css` à chaque dessin et au changement de thème ; l'option du réglage gagne toujours sur l'habillage de base (`js/modules/pilotage/habillage.js`).

## Cas vide et cas d'erreur

1. Chargement : le rond de chargement.
2. Aucun réglage (`tuiles` et `erreurs` vides) : « Aucun tableau n'est encore réglé pour cet espace. »
3. Erreur d'appel : un message lisible (jamais de détail technique) et « Réessayer ».
4. Fonction absente (seulement les codes `not-found` et `unimplemented`, comme chez un client) : « Le Pilotage n'est pas encore branché sur cet espace. », sans « Réessayer ». Une vraie panne (`internal`, `unavailable`, `deadline-exceeded`, coupure réseau) n'est jamais dite « pas encore branché » : message « Ça n'a pas abouti. Réessaie dans un instant. » avec « Réessayer ».
5. Une tuile dans `erreurs` : sa carte dit « Cette tuile n'a pas pu être lue. » et un bouton « Réessayer » commun relance l'appel.
6. Une tuile sans ligne : « Pas encore de données. »
7. Une option que ECharts refuse : « Cette tuile n'a pas pu être dessinée. » ; les autres tuiles s'affichent.

## Chargement d'ECharts

Le fichier (1,1 Mo environ) est chargé par `import()` dans l'écran, au premier affichage de Pilotage : l'Accueil et les autres écrans ne le téléchargent pas (test P7). Un test statique (`D2c`) verrouille le fichier par son empreinte SHA-256 ; le fichier est écarté des contrôles de texte D2 (adresses) et D4 (`limit(`) parce que c'est du code tiers minifié. Mise à jour : changer le fichier, l'empreinte dans `tests/statique.test.js` et `assets/vendor/echarts/LISEZMOI.txt`.
