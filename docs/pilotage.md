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
- Défense en profondeur : avant `setOption`, `nettoyerOption` (`logique.js`) nettoie l'OPTION (jamais les lignes de données, injectées après) : clés `link` (sauf `axisPointer.link`), `sublink`, `toolbox`, éléments `graphic` de type image (objet seul ou liste), `backgroundColor` / `color` qui sont des motifs d'image, `backgroundColor` / `symbol` qui sont des adresses (`image://…` ou `://`), clés `icon` / `handleIcon` / `*Icon` valant `image://…`. L'option reçue n'est pas modifiée.
- `pilotageLire({ exporter: true })` renvoie `{ reglages: <objet> }` (administrateur seulement : le serveur refuse les autres avec `permission-denied`). C'est ce qu'utilise le bouton « Exporter mes données » (Réglages > Pilotage > Sauvegarde).

## Ajouter une tuile

Rien à coder dans le navigateur : on ajoute une tuile au réglage (par Claude, côté serveur, fonction `pilotageEnregistrerReglages`, jamais appelée par l'écran) avec son `id`, son `titre`, sa requête et son `option` ECharts. Le thème (couleurs, police, traits) est lu dans `css/tokens.css` à chaque dessin et au changement de thème ; l'option du réglage gagne toujours sur l'habillage de base (`js/modules/pilotage/habillage.js`).

## Cas vide et cas d'erreur

1. Chargement : le rond de chargement.
2. Aucun réglage (`tuiles` et `erreurs` vides) : « Aucun tableau n'est encore réglé pour cet espace. »
3. Erreur d'appel : un message lisible (jamais de détail technique) et « Réessayer ».
4. Fonction absente : l'appel part vers le serveur de fonctions ; chez un client la fonction n'existe pas, le serveur répond une page 404 sans en-têtes CORS, le navigateur la bloque et le SDK rend `internal`. L'écran affiche donc l'erreur normale : « Ça n'a pas abouti. Réessaie dans un instant. » avec « Réessayer ». La mention « Le Pilotage n'est pas encore branché sur cet espace. » (sans « Réessayer ») n'apparaît que si le serveur répond lui-même `not-found` ou `unimplemented`. Une vraie panne (`internal`, `unavailable`, `deadline-exceeded`, coupure réseau) n'est jamais dite « pas encore branché ». La ligne de Réglages > Déploiement dit, elle, que le Pilotage est absent chez les clients.
5. Une tuile dans `erreurs` : sa carte dit « Cette tuile n'a pas pu être lue. » et un bouton « Réessayer » commun relance l'appel.
6. Une tuile sans ligne : « Pas encore de données. »
7. Une option que ECharts refuse : « Cette tuile n'a pas pu être dessinée. » ; les autres tuiles s'affichent.

## Chargement d'ECharts

Le fichier (1,1 Mo environ) est chargé par `import()` dans l'écran, au premier affichage de Pilotage : l'Accueil et les autres écrans ne le téléchargent pas (test P7). Un test statique (`D2c`) verrouille le fichier par son empreinte SHA-256 ; le fichier est écarté des contrôles de texte D2 (adresses) et D4 (`limit(`) parce que c'est du code tiers minifié. Mise à jour : changer le fichier, l'empreinte dans `tests/statique.test.js` et `assets/vendor/echarts/LISEZMOI.txt`.

## Tableau de bord, partie A (23/11/2026, version 2.47.0)

Le réglage décrit maintenant des **onglets**, des **sections** et cinq **types de tuile**. Un ancien réglage (sans `type`, sans `onglets`) marche exactement comme avant : une page unique de graphiques. Les exemples sont fictifs (`v_exemple_…`). Les **filtres** viennent dans une partie B ultérieure : une tuile garde `vue`, `tri` et `limite`.

### Onglets et sections

- `tableau.onglets: [{ id, titre, intro?, tuiles: [ids], sections?: [{ id, titre, intro?, tuiles: [ids] }] }]`. Les tuiles restent déclarées à plat dans `tableau.tuiles` ; chacune est placée **une seule fois** dans un onglet ou une section ; une tuile non placée est refusée.
- **Pas de sous-onglets** (décision de Jérôme du 23/10/2026, `docs/consignes-ui.md`) : une **section** est un titre (intro facultative) dans un même onglet, plus une rangée de pastilles de navigation rapide qui font défiler jusqu'à la section (boutons, aucun changement d'adresse). Décision prise seul : le cahier des charges parlait de sous-onglets.
- L'onglet actif est dans l'adresse : `#/pilotage/pilotage/<id-de-l-onglet>` (le routeur ne connaît pas « ? »). La barre est celle de la coque (`barreOnglets`, vrais liens, `aria-current="page"`). Un onglet retiré du réglage : l'écran rouvre le premier.
- Plafonds : 20 tuiles **par onglet** (page unique sans onglets : 20), 80 au total, 8 onglets, 8 sections par onglet. Taille du réglage inchangée : 300 000 caractères.

### Types de tuile

Champs communs : `id`, `titre`, `type` (défaut `graphique`), `largeur` (`tiers`, `moitie`, `deux-tiers`, `pleine` ; défauts : graphique moitié, chiffre tiers, le reste pleine), `aide` (texte du « i », 300 caractères), `visiblePour`. Tous les textes (titre, aide, intro, texte, libellés) passent par les mêmes motifs interdits que l'option (adresse web, `javascript:`, `<`…) avec une longueur maximale ; l'écran les pose toujours avec `textContent`.

| type | champs obligatoires | notes |
|---|---|---|
| `graphique` | `vue`, `option` | `formats?: { axeY, axeX, infobulle, etiquettes }` (noms de la liste fermée) |
| `chiffre` | `vue`, `valeur: { colonne, format? }` | `seuils?`, `variation?`, `lien?` ; pas d'`option` |
| `tableau` | `vue`, `colonnes: [{ colonne, titre?, format?, regles?, lien? }]` | `parPage` (1 à 100, défaut 20) ; pas d'`option` |
| `phrases` | `vue`, `colonnes: ["col", …]` (1 à 5) | une phrase par ligne et par colonne ; pas d'`option` |
| `texte` | `texte` | **ni `vue` ni `option`** : ne lit jamais la base |

- **Seuils** (chiffre) : `[{ jusqua?, couleur, libelle? }]`, rangés du plus petit `jusqua` au plus grand ; la **première** ligne dont `jusqua` est ≥ valeur gagne (borne incluse) ; seule la dernière peut ne pas avoir de `jusqua`. « Vert à 0, orange sinon » : `[{ "jusqua": 0, "couleur": "bon", "libelle": "Rien n'attend" }, { "couleur": "attention", "libelle": "Des factures attendent" }]`.
- **Variation** (chiffre) : `{ colonne, periodeColonne, periodeFormat?, hausse: "bon" | "mauvais" }`. L'écran range les lignes par `periodeColonne` (croissant), prend les **deux dernières** (la vue livre une ligne par mois) et affiche « ▲ +20,0 % par rapport à octobre 2026 (100 k€) ». `hausse: "mauvais"` inverse la couleur (une hausse de dépense est rouge). Valeur affichée : celle de la ligne la plus récente ; sans variation : la première ligne lue.
- **Règles** (colonne de tableau) : `[{ si, valeur, couleur }]`, `si` parmi `>=`, `>`, `<=`, `<`, `=` (liste fermée, jamais testée comme un texte) ; la **première** règle vraie gagne ; `valeur: null` avec `=` teste une valeur vide. Chantier sans budget : la vue fournit un texte d'état (« budget non renseigné ») et une règle `=` le colore.
- **Couleurs** : seulement des noms : `bon` (`--succes`), `attention` (`--attention`), `mauvais` (`--retard`), `neutre` (`--texte2`), relues dans `css/tokens.css` (fichier non modifié). Dans l'option d'un graphique, la chaîne `"@bon"`, `"@attention"`, `"@mauvais"` ou `"@neutre"` est remplacée par l'écran ; toute autre chaîne commençant par `@` est refusée.
- **Liens** : uniquement `{ "onglet": "<id>" }` (chiffre, colonne de tableau) ou `[libellé](#id-de-l-onglet)` dans un texte, vérifiés au serveur. Aucune adresse n'est jamais fabriquée à partir d'une valeur de la base.
- **Texte** : `**gras**`, `*italique*`, retour à la ligne, lien interne. Rien d'autre.
- **Tableau** : tri au clic sur l'en-tête ; pagination et compteur « N lignes » côté écran sur les lignes lues (500 au plus ; la pagination serveur viendra avec la partie B) ; au téléphone, une fiche par ligne avec une liste « Trier par… ».
- **Plein écran** : bouton à côté d'« Actualiser » (API Fullscreen, repli CSS plein fenêtre, par exemple sur Safari iPhone) ; « Quitter le plein écran », Échap ; désactivé pendant le chargement.
- **Téléphone** : une colonne, sauf les grands chiffres (2 par ligne).

### Formats nommés (liste fermée, Intl français)

`euros0` (1 234 €), `euros2`, `euros_abrege` (60 k€, 1,2 M€), `pourcent0`, `pourcent1` (la valeur est déjà en pourcent : 95 donne 95 %), `entier`, `jours` (« 1 jour », « 12 jours »), `date` (JJ/MM/AAAA), `date_heure` (JJ/MM/AAAA HH:mm), `mois_annee` (novembre 2026). Milliers : espace fine insécable U+202F ; espace avant « € », « % » et l'unité : insécable U+00A0. Une `date` reçue « AAAA-MM-JJ » (sans fuseau) garde son jour ; un instant ISO en UTC est affiché à l'heure de Paris, 24 h. Un nom inconnu est refusé à l'enregistrement du réglage ; une valeur illisible s'affiche telle quelle.

### Contrat de réponse étendu

`pilotageLire({ onglet? })` : `onglet` est un identifiant d'onglet vérifié contre le réglage (jamais un nom de vue) ; **seul cet onglet est lu** (sans lui : le premier). Un onglet inconnu ou interdit : `invalid-argument` « Onglet inconnu. » (même réponse dans les deux cas, rien ne fuit). Sans onglets dans le réglage, `onglet` est ignoré. Budget global de 40 s inchangé ; **une seule requête par SQL identique** dans un même appel.

```json
{
  "titre": "Mes chiffres",
  "onglet": "resume",
  "onglets": [{ "id": "resume", "titre": "Résumé", "intro": "…", "tuiles": ["a"], "sections": [{ "id": "s1", "titre": "…", "intro": "…", "tuiles": ["b"] }] }],
  "tuiles": [
    { "id": "a", "titre": "À décider", "type": "chiffre", "largeur": "tiers", "aide": "…", "valeur": { "colonne": "total", "format": "euros0" }, "lien": { "onglet": "detail" }, "lignes": [{ "total": 0 }] }
  ],
  "erreurs": []
}
```

Par tuile : `type`, `largeur?`, `aide?` et la configuration validée du type (`valeur`, `seuils`, `variation`, `lien` pour un chiffre ; `colonnes`, `parPage` pour un tableau ; `colonnes` pour des phrases ; `formats` et `option` pour un graphique ; `texte` pour un texte). À la racine : `onglets` (structure **filtrée**) et `onglet` (celui qui est lu). L'écran tolère la réponse de l'**ancien serveur** (ni `type`, ni `onglets`).

**Aucune fuite par la structure** : pour chaque appelant, les ids de tuiles interdits sont retirés de `onglets[].tuiles` et `sections[].tuiles` ; une section ou un onglet sans tuile visible n'est pas listé (son titre ne sort jamais) ; un `lien.onglet` vers un onglet invisible est retiré ; un lien `[…](#onglet)` d'un texte vers un onglet invisible redevient du texte simple. Pour **chiffre, tableau et phrases**, le serveur ne rend que les colonnes **déclarées** dans le réglage (la requête reste `select *`, le filtrage se fait après lecture) ; un graphique garde toutes les colonnes (son option choisit).

### Exemples de réglage de graphiques (essayés pour de vrai : `tests/e2e/pilotage-tdb-a.spec.js`)

L'option se met en chaîne JSON dans `option`. Les lignes arrivent par `dataset` (la série `gauge` ne le lit pas : **jauge et anneau avec total au centre ne sont pas dans cette partie**).

1. **Pareto** (barres + courbe de cumul sur l'axe de droite en % + ligne à 80 %). Barres verticales (la courbe suit les catégories) ; noms longs raccourcis par le thème (infobulle pour le texte entier), `rotate` pour les incliner ; au-delà de 8 fournisseurs, regrouper le reste en « Autres (n) » dans la vue. Avec deux axes Y, `formats.axeY` s'appliquerait aux deux : garde les formateurs dans l'option.
   `{"dataset":{"dimensions":["fournisseur","achats","cumul"]},"grid":{"right":48},"tooltip":{"trigger":"axis"},"legend":{},"xAxis":{"type":"category","axisLabel":{"rotate":30}},"yAxis":[{"type":"value"},{"type":"value","min":0,"max":100,"axisLabel":{"formatter":"{value} %"}}],"series":[{"type":"bar","name":"Achats","encode":{"x":"fournisseur","y":"achats"}},{"type":"line","name":"Cumul (%)","yAxisIndex":1,"encode":{"x":"fournisseur","y":"cumul"},"markLine":{"silent":true,"symbol":"none","data":[{"yAxis":80}],"lineStyle":{"type":"dashed","color":"@attention"},"label":{"formatter":"80 %","position":"insideStartTop"}}}]}`
2. **Barres à puce avec trait d'objectif** (barres horizontales fines + trait à 100 %) :
   `{"dataset":{"dimensions":["chantier","consomme"]},"tooltip":{"trigger":"axis"},"xAxis":{"type":"value","max":120,"axisLabel":{"formatter":"{value} %"}},"yAxis":{"type":"category","inverse":true},"series":[{"type":"bar","name":"Budget consommé","barWidth":14,"encode":{"x":"consomme","y":"chantier"},"itemStyle":{"color":"@neutre"},"markLine":{"silent":true,"symbol":"none","data":[{"xAxis":100}],"lineStyle":{"color":"@mauvais","width":2,"type":"solid"},"label":{"formatter":"Objectif"}}}]}`
3. **Barres empilées** (accepté vert + en attente orange) : deux séries `bar` avec le même `stack`, `itemStyle.color` en `"@bon"` et `"@attention"`, `encode` par colonne, `legend: {}`.
4. **Courbe** : une série `line` avec `areaStyle`, et sur la tuile `formats: { "axeX": "mois_annee", "axeY": "pourcent0", "infobulle": "pourcent1" }`.
5. **Anneau SANS total au centre** : `{"color":["@bon","@mauvais","@attention"],"dataset":{"dimensions":["statut","nombre"]},"tooltip":{"trigger":"item"},"legend":{},"series":[{"type":"pie","radius":["45%","70%"],"encode":{"itemName":"statut","value":"nombre"}}]}`

Habillage commun (`logique.js`, `habillage.js`) : police et couleurs du thème, grille discrète, légende défilante et en haut, infobulles en texte, animation douce, barres arrondies, libellés de catégorie raccourcis (110 px). `nettoyerOption` ne casse aucun de ces exemples et refuse toujours liens, images, `<` et `javascript:`.

### Déploiement

Le serveur change (validation du réglage, lecture par onglet) : **le déploiement des fonctions de Jérôme est à lancer**. Rien chez les clients (écart déjà listé dans `tests/ecarts-fonctions.test.js` ; `scripts/preparer-fonctions.js` ne copie pas ce module).
