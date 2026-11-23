# Pilotage : des graphiques alimentés par une base de données

Écrit le 23/11/2026 (PR navigateur du module). Le dépôt est public : aucun secret, aucun nom de vue ou de colonne réel ici, seulement des exemples fictifs.

## À quoi ça sert

Un écran « Pilotage » qui montre des graphiques (Apache ECharts 6.1.0, fichier figé dans `assets/vendor/echarts/`, jamais de CDN). Ce que chaque graphique montre est décidé par un **réglage** (un objet JSON) que Claude modifie à la demande de Jérôme ; il n'y a aucun éditeur à l'écran. Chez Jérôme seulement pour l'instant : les fonctions du serveur n'existent pas encore sur la plateforme clients (voir `docs/activer-desactiver-modules.md`).

## Qui fait quoi

1. Le **serveur** (fonction `pilotageLire`, région `europe-west9`) lit le réglage (table `pilotage_parametres`, serveur seulement), interroge la base de données, et répond avec les lignes de chaque tuile.
2. Le **navigateur** (`js/modules/pilotage/`) ne lit ni n'écrit jamais Firestore pour ce module. Il appelle `pilotageLire` **une seule fois** par affichage (ou par clic sur « Actualiser » / « Réessayer »), sans cache côté navigateur (le serveur garde 60 secondes, clé comprenant les valeurs de filtre ; jamais pour l'aperçu), injecte les lignes dans l'option ECharts de chaque tuile et dessine.
3. L'option reçue est une **donnée** : elle n'est jamais exécutée comme du code, elle est passée à `setOption`. L'infobulle est forcée en mode texte (jamais de HTML venu des données).

## Le contrat avec le serveur

Réponse de `pilotageLire({})` (sans argument ; avec `{ onglet?, filtres? }` voir plus bas) :

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

Le réglage décrit maintenant des **onglets**, des **sections** et cinq **types de tuile**. Un ancien réglage (sans `type`, sans `onglets`) marche exactement comme avant : une page unique de graphiques. Les exemples sont fictifs (`v_exemple_…`). Les **filtres** sont décrits plus bas (partie B1, serveur) : une tuile garde `vue`, `tri` et `limite`.

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
- **Variation** (chiffre) : `{ colonne, periodeColonne, periodeFormat?, hausse: "bon" | "mauvais" }`. Le serveur ne lit que les **deux dernières périodes** (`order by periodeColonne desc nulls last limit 2` (une ligne sans période n'est jamais prise)) ; sans variation, un grand chiffre lit **1 ligne** (en respectant `tri`) ; avec variation, `tri` et `limite` sont **ignorés** pour un grand chiffre. Période précédente à 0 : « Variation non calculable (période précédente à 0). » ; une variation arrondie à 0 s'affiche sans signe. L'écran range les lignes par `periodeColonne` (croissant), prend les **deux dernières** (la vue livre une ligne par mois) et affiche « ▲ +20,0 % par rapport à octobre 2026 (100 k€) ». `hausse: "mauvais"` inverse la couleur (une hausse de dépense est rouge). Valeur affichée : celle de la ligne la plus récente ; sans variation : la première ligne lue.
- **Tableaux : 500 lignes** : un tableau lit **500 lignes au plus** par défaut (`limite` du réglage sinon, jusqu'à 500). Quand ce nombre est atteint, l'écran écrit « 500 premières lignes » au lieu de « N lignes » : rien n'est tronqué en silence. Une vue qui a **exactement** 500 lignes affiche donc aussi « 500 premières lignes ». Les titres déjà enregistrés (« Marge:taux », « < 20 % ») restent lus : le filtre strict ne s'applique qu'à l'enregistrement et à l'aperçu. Les phrases s'affichent au plus 50 paragraphes puis « … ».
- **Règles** (colonne de tableau) : `[{ si, valeur, couleur }]`, `si` parmi `>=`, `>`, `<=`, `<`, `=` (liste fermée, jamais testée comme un texte) ; la **première** règle vraie gagne ; `valeur: null` avec `=` teste une valeur vide. Chantier sans budget : la vue fournit un texte d'état (« budget non renseigné ») et une règle `=` le colore.
- **Couleurs** : seulement des noms : `bon` (`--succes`), `attention` (`--attention`), `mauvais` (`--retard`), `neutre` (`--texte2`), relues dans `css/tokens.css` (fichier non modifié). Dans l'option d'un graphique, la chaîne `"@bon"`, `"@attention"`, `"@mauvais"` ou `"@neutre"` est remplacée par l'écran ; toute autre chaîne commençant par `@` est refusée.
- **Liens** : uniquement `{ "onglet": "<id>" }` (chiffre, colonne de tableau) ou `[libellé](#id-de-l-onglet)` dans un texte, vérifiés au serveur. Aucune adresse n'est jamais fabriquée à partir d'une valeur de la base.
- **Texte** : `**gras**`, `*italique*`, retour à la ligne, lien interne. Rien d'autre.
- **Tableau** : tri au clic sur l'en-tête ; pagination et compteur « N lignes » côté écran sur les lignes lues (500 au plus ; la pagination serveur viendra avec la partie B) ; au téléphone, une fiche par ligne avec une liste « Trier par… ».
- **Plein écran** : bouton à côté d'« Actualiser » (API Fullscreen, repli CSS plein fenêtre, par exemple sur Safari iPhone) ; « Quitter le plein écran », Échap ; désactivé pendant le chargement.
- **Téléphone** : une colonne, sauf les grands chiffres (2 par ligne).

### Formats nommés (liste fermée, Intl français)

`euros0` (1 234 €), `euros2`, `euros4` (4 décimales : 0,0009 €, pour les très petits coûts), `euros_abrege` (60 k€, 1,2 M€), `pourcent0`, `pourcent1` (la valeur est déjà en pourcent : 95 donne 95 %), `entier`, `jours` (« 1 jour », « 12 jours »), `date` (JJ/MM/AAAA), `date_heure` (JJ/MM/AAAA HH:mm), `mois_annee` (novembre 2026). Milliers : espace fine insécable U+202F ; espace avant « € », « % » et l'unité : insécable U+00A0. Une `date` reçue « AAAA-MM-JJ » (sans fuseau) garde son jour ; un instant ISO en UTC est affiché à l'heure de Paris, 24 h. Un nom inconnu est refusé à l'enregistrement du réglage ; une valeur illisible s'affiche telle quelle.

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

1. **Pareto** (barres HORIZONTALES + courbe de cumul en % sur un second axe en haut + ligne à 80 %). Les noms longs sont raccourcis par le thème (infobulle pour le texte entier) : pas de `rotate` ; au-delà de 8 fournisseurs, regrouper le reste en « Autres (n) » dans la vue. Deux axes de valeur : garde les formateurs dans l'option (`formats.axeY` ne vise qu'un axe).
   `{"dataset":{"dimensions":["fournisseur","achats","cumul"]},"tooltip":{"trigger":"axis"},"legend":{},"xAxis":[{"type":"value"},{"type":"value","min":0,"max":100,"position":"top","axisLabel":{"formatter":"{value} %"}}],"yAxis":{"type":"category","inverse":true},"series":[{"type":"bar","name":"Achats","encode":{"x":"achats","y":"fournisseur"}},{"type":"line","name":"Cumul (%)","xAxisIndex":1,"encode":{"x":"cumul","y":"fournisseur"},"markLine":{"silent":true,"symbol":"none","data":[{"xAxis":80}],"lineStyle":{"type":"dashed","color":"@attention"},"label":{"formatter":"80 %","position":"insideEndTop"}}}]}`
2. **Barres à puce avec trait d'objectif** (barres horizontales fines + trait à 100 %) :
   `{"dataset":{"dimensions":["chantier","consomme"]},"tooltip":{"trigger":"axis"},"xAxis":{"type":"value","max":120,"axisLabel":{"formatter":"{value} %"}},"yAxis":{"type":"category","inverse":true},"series":[{"type":"bar","name":"Budget consommé","barWidth":14,"encode":{"x":"consomme","y":"chantier"},"itemStyle":{"color":"@neutre"},"markLine":{"silent":true,"symbol":"none","data":[{"xAxis":100}],"lineStyle":{"color":"@mauvais","width":2,"type":"solid"},"label":{"formatter":"Objectif","position":"start"}}}]}`
3. **Barres empilées** (accepté vert + en attente orange) : deux séries `bar` avec le même `stack`, `itemStyle.color` en `"@bon"` et `"@attention"`, `encode` par colonne, `legend: {}`.
4. **Courbe** : une série `line` avec `areaStyle`, et sur la tuile `formats: { "axeX": "mois_annee", "axeY": "pourcent0", "infobulle": "pourcent1" }`.
5. **Anneau SANS total au centre** : `{"color":["@bon","@mauvais","@attention"],"dataset":{"dimensions":["statut","nombre"]},"tooltip":{"trigger":"item"},"legend":{},"series":[{"type":"pie","radius":["45%","70%"],"encode":{"itemName":"statut","value":"nombre"}}]}`

Habillage commun (`logique.js`, `habillage.js`) : police et couleurs du thème, grille discrète, légende défilante et en haut, infobulles en texte, animation douce, barres arrondies, libellés de catégorie raccourcis (110 px). `nettoyerOption` ne casse aucun de ces exemples et refuse toujours liens, images, `<` et `javascript:`.

### Déploiement

Le serveur change (validation du réglage, lecture par onglet) : **le déploiement des fonctions de Jérôme est à lancer**. Rien chez les clients (écart déjà listé dans `tests/ecarts-fonctions.test.js` ; `scripts/preparer-fonctions.js` ne copie pas ce module).

## Tableau de bord, partie B1 : les filtres, côté serveur (23/11/2026, version 2.48.0)

Le serveur sait filtrer, croiser et agréger ; l'écran des filtres (partie B2) vient après. L'écran actuel marche sans changement : sans filtre demandé, la requête et la réponse sont celles d'avant. Exemples fictifs (`v_exemple_…`). **Absent chez les clients** (inchangé). Le déploiement des fonctions de Jérôme part à la fusion.

### Le réglage

```json
{ "tableau": {
  "filtres": [
    { "id": "periode", "libelle": "Période", "type": "periode", "defaut": { "raccourci": "12_mois" } },
    { "id": "lieu", "libelle": "Lieu", "type": "liste", "multiple": true, "valeurs": { "vue": "v_exemple_lieux", "colonne": "nom" } },
    { "id": "etat", "libelle": "État", "type": "liste", "choix": [{ "valeur": "ouvert", "libelle": "Ouvert" }, { "valeur": "clos", "libelle": "Clos" }] },
    { "id": "montant", "libelle": "Montant", "type": "intervalle" },
    { "id": "alerte", "libelle": "Avec alerte", "type": "oui_non" } ],
  "onglets": [{ "id": "suivi", "titre": "Suivi", "filtres": ["periode", "lieu"], "tuiles": ["ventes", "classe"] }],
  "tuiles": [
    { "id": "ventes", "type": "graphique", "vue": "v_exemple_ventes", "tri": { "colonne": "date_piece", "sens": "asc" }, "option": "…",
      "filtres": { "periode": { "colonne": "date_piece" }, "lieu": { "colonne": "lieu" } }, "croisement": { "filtre": "lieu", "colonne": "lieu" } },
    { "id": "classe", "type": "tableau", "vue": "v_exemple_detail", "colonnes": [{ "colonne": "lieu" }, { "colonne": "total" }],
      "grouper": ["lieu"], "mesures": [{ "colonne": "montant", "calcul": "somme", "nom": "total" }, { "calcul": "nombre", "nom": "lignes" }],
      "tri": { "colonne": "total", "sens": "desc" }, "limite": 10, "filtres": { "periode": { "colonne": "date_piece" } },
      "mentionNonFiltre": "Non filtré par le lieu." } ] } }
```

- **Déclaration** : `tableau.filtres` (20 au plus) ; type `periode`, `liste` (`multiple?`, **soit** `valeurs: { vue, colonne }` lues dans une vue `v_…`, **soit** `choix: [{ valeur, libelle }]` fermés, 50 au plus), `intervalle` (min et/ou max), `oui_non`. `defaut?` doit convenir au type. `visiblePour?` comme pour une tuile (adresses ou groupes ; groupe inconnu ou liste vide = personne). **Attention : `visiblePour` d'un filtre cache le filtre (son id, son libellé, ses valeurs), ce n'est PAS une restriction de données** : une tuile visible reste filtrable par un autre moyen seulement si le filtre lui est ouvert ; pour cacher des données, on cache la tuile.
- **Où ils s'affichent** : `onglets[].filtres: [ids]` (un id inexistant est refusé). À l'enregistrement, une tuile ne peut déclarer qu'un filtre que son onglet liste, et un onglet ne peut lister qu'un filtre qu'une de ses tuiles déclare. Sans onglets, tous les filtres déclarés par une tuile visible sont proposés (décision prise seul).
- **Ce qu'une tuile reçoit** : seulement les filtres de SA liste `filtres: { <idFiltre>: { colonne } }` (colonne de la vue de la tuile, motif `^[a-z_][a-z0-9_]*$`, 63 caractères, jamais de texte libre dans le SQL). **La colonne d'un filtre `periode` doit être de type `date`** (le jour de Paris est calculé dans la vue) ; une colonne `timestamptz` serait comparée au fuseau de la session Postgres. La colonne d'un filtre `intervalle` est comparée en `numeric`, celle d'un filtre `liste` en texte. Une tuile sans la clé d'un filtre n'est pas filtrée par lui ; `mentionNonFiltre` (rendu seulement si l'onglet a des filtres à l'écran pour l'appelant ; 120 caractères, mêmes motifs interdits que les autres textes) est rendu à l'écran pour le dire (carte de budget, par exemple). Un texte n'a ni `filtres`, ni `croisement`, ni agrégation.
- **Croisement** : `croisement: { filtre, colonne }` : le filtre est de type `liste`, listé dans l'onglet de la tuile ; l'écran (B2) règle ce filtre au clic sur la barre ou la part. La réponse ne rend que `{ filtre }`, jamais la colonne.

### La requête du navigateur

`pilotageLire({ onglet?, filtres? })` ; `filtres` ne porte que des VALEURS : `{ periode: { raccourci } | { du, au }, <liste>: [valeurs], <intervalle>: { min?, max? }, <oui_non>: true | false }`. Chaque valeur est validée contre la déclaration (50 valeurs par liste, texte de 200 caractères au plus ou nombre fini, dates `AAAA-MM-JJ` réelles de 1900 à 2100, `du <= au`, `min <= max`, une seule valeur si pas `multiple`). Filtre inconnu, hors de l'onglet lu, interdit à l'appelant ou valeur du mauvais type : **la même** erreur `invalid-argument` « Filtre invalide. » avec `details: { code, raison: "filtre" }` (le client distingue ainsi « filtre refusé » de « Onglet inconnu. »), sans jamais répéter la valeur. Une liste vide ou absente = pas de clause ; une liste est normalisée (doublons retirés, triée) avant le SQL et la clé de cache ; pour un `oui_non`, `null` explicite = aucune clause (le défaut ne s'applique pas). Une valeur de liste absente de la vue n'est pas refusée (zéro ligne : aucun moyen de deviner ce qui existe). `apercu` + `filtres` : permis pour l'administrateur, sans cache.

**Défaut** : appliqué par le SERVEUR quand la clé du filtre est absente de la requête ; la réponse rend la valeur appliquée (dates résolues) ; « tout » s'envoie explicitement (`{ raccourci: "tout" }`).

**Raccourcis de période** (bornes incluses, jour calculé à Paris, `Europe/Paris`) : `ce_mois` = du 1er au dernier jour du mois en cours ; `mois_dernier` = du 1er au dernier jour du mois précédent ; `3_mois`, `6_mois`, `12_mois` = glissants, d'il y a N mois (même jour, ramené au dernier jour du mois s'il n'existe pas) jusqu'à aujourd'hui ; `annee` = du 1er janvier au 31 décembre de l'année civile en cours ; `tout` = aucune clause. Fuseau d'une colonne `timestamptz` : la comparaison à une date se fait au fuseau de la session Postgres : **non vérifié** (à essayer sur la vraie base).

### Le SQL (requête paramétrée)

`construireRequete(tuile, clauses) -> { sql, valeurs }` (`reglages.js`) ; `construireSql(tuile)` en rend le texte sans filtre, **identique** à avant pour une tuile simple. Identifiants entre guillemets doubles, revalidés ; valeurs en `$1…`, jamais dans le texte ; opérateurs en liste fermée :

```sql
select * from "v_exemple_ventes" where "date_piece" >= $1::date and "date_piece" < ($2::date + 1) and "lieu"::text = any($3::text[]) order by "date_piece" asc limit 200
-- valeurs : ['2026-01-01', '2026-01-31', ['Lieu A']]   (liste : valeurs passées en texte, comparées en texte, une valeur d'un autre type donne zéro ligne ; intervalle : "c" >= $n::numeric et/ou "c" <= $n::numeric ; oui_non : "c" = $n)
```

**Agrégation déclarée** (`grouper` 0 à 6 colonnes, `mesures` 1 à 6 `{ colonne?, calcul: somme | nombre | moyenne | min | max, nom }`) pour qu'un filtre agisse sur un classement ou un Pareto calculé depuis une vue de détail (le cumul en % d'un Pareto reste dans les vues de la base) :

```sql
select "lieu", sum("montant") as "total", count(*) as "lignes" from "v_exemple_detail" where "date_piece" >= $1::date and "date_piece" < ($2::date + 1) group by "lieu" order by "total" desc limit 10
```

`nombre` sans colonne = `count(*)`. `nom` : même motif de colonne, unique, différent des colonnes de `grouper`. Le `tri`, la `valeur` et la `variation` d'un chiffre, les `colonnes` d'un tableau ou de phrases et le `croisement` doivent viser une colonne de `grouper` ou un `nom` ; `periodeColonne` doit être dans `grouper` ; une `limite` sans `tri` est refusée ; un `chiffre` regroupé (`grouper` non vide) sans variation demande un `tri` ; les filtres sont dans le `where` (avant le regroupement), la colonne d'un filtre n'a pas à être groupée. Compatible avec graphique, tableau, chiffre et phrases.

**`postgres.js`** : `interroger(sql, valeurs?)` appelle `client.query(sql, valeurs)` seulement s'il y a des valeurs, sinon `client.query(sql)` comme avant ; jamais d'objet `{ name }` (pas de requête préparée nommée). **Non vérifié** : le protocole étendu (valeurs liées) à travers le pooler en mode transaction n'est pas testable en session ; la session principale doit l'essayer sur la vraie base.

### Droits et réponse

- `tuileVisible` passe en premier. Un filtre n'est appliqué qu'aux tuiles visibles et qui le déclarent ; un filtre est proposé (liste de l'onglet, racine de la réponse) s'il est visible pour l'appelant **et** déclaré par au moins une tuile visible de l'onglet lu ; sinon ni son id, ni son libellé, ni ses valeurs ne sortent et sa liste de valeurs n'est pas lue. Un filtre interdit est refusé comme un filtre inexistant. `croisement` est retiré d'une tuile dont le filtre est invisible. En aperçu, tout est visible (Jérôme règle les droits du brouillon).
- **Liste de valeurs** d'un filtre `liste` à `valeurs` : `select distinct "<col>" from "<vue>" where "<col>" is not null order by 1 limit 201`, seulement pour l'onglet lu, sur la même connexion et dans le même budget de 40 s. 200 valeurs au plus rendues, `tronquee: true` au-delà ; valeurs nulles, trop longues ou d'un autre type écartées. Liste en panne : le filtre est rendu sans `valeurs`, sans message de la base, les tuiles se lisent quand même.
- **Réponse** : racine `filtres: [{ id, libelle, type, multiple?, choix?, valeurs?, tronquee?, applique? }]` (seulement ceux de l'onglet lu ; absent s'il n'y en a pas) ; par onglet `filtres: [ids]` (filtrée) ; par tuile `filtresAppliques: [ids]`, `croisement: { filtre }`, `mentionNonFiltre`. Aucun nom de colonne ni de vue de filtre ne sort. Un ancien client ignore ces champs ; un réglage sans filtres donne la réponse d'avant.
- **Cache serveur** : clé = SQL + valeurs (dates résolues) ; 60 variantes au plus ; jamais pour l'aperçu ; une seule requête par SQL et valeurs identiques dans un même appel.

## Tableau de bord, partie B2 : l'écran des filtres (23/11/2026, version 2.49.0)

L'écran lit le contrat de la partie B1 (ci-dessus) et ne change rien au serveur, sauf le format `euros4`. **Absent chez les clients** (inchangé). Le déploiement des fonctions de Jérôme part à la fusion. Fichiers : `js/modules/pilotage/filtres-logique.js` (règles pures), `filtres-ecran.js` (barre, fenêtre, pastilles), `ecran.js` (mémoire, relecture, croisement), `export.js` et `blocs.js` (CSV).

- **Barre de filtres** sous les onglets, pour l'onglet affiché seulement : le bouton « Filtres » commun (`boutonFiltres`, pastille = nombre de filtres actifs) ouvre une fenêtre « Appliquer » / « Tout effacer » (même gabarit que les autres listes). Contrôles : **période** (liste de raccourcis, ou « Dates précises » avec deux dates, `du <= au` vérifié avant la fermeture), **liste** (à cocher si `multiple`, avec un champ de recherche au-delà de 8 valeurs ; sinon liste déroulante « Tous » ; « Liste incomplète » si le serveur a rendu `tronquee`), **intervalle** (minimum / maximum), **oui / non** (Indifférent, Oui, Non). Les libellés et valeurs sont posés en texte, jamais en HTML. Sans filtre déclaré, la barre n'existe pas : l'écran est celui d'avant.
- **Ce qui est envoyé** : la clé `filtres` n'est ajoutée à `pilotageLire` que s'il y a un choix de l'utilisateur ; sinon la requête est celle d'avant (`{}` ou `{ onglet }`) et le serveur applique les défauts. L'écran affiche toujours la valeur **appliquée** rendue par le serveur (`applique`), pas ce qu'il a envoyé. « Toute la période » s'envoie `{ raccourci: "tout" }`. Une liste vide ou un intervalle vide n'est envoyé que pour **écraser un défaut** ; un `oui_non` indifférent s'envoie `null` dans ce cas seulement. L'écran relève le défaut du serveur à la première lecture d'un onglet (valeur appliquée sans choix de l'utilisateur) : un choix égal au défaut n'est pas mémorisé.
- **Mémoire** : en mémoire du module, **par onglet**, jamais dans `sessionStorage`, `localStorage` ni l'adresse ; remise à zéro à la déconnexion (`oublierFiltresPilotage`, appelée par `js/main.js`). Un filtre mémorisé que la réponse ne connaît plus est ignoré. L'onglet est relu **à l'application** de la fenêtre, au clic sur une croix ou sur « Effacer tout », au clic sur un graphique : jamais à chaque frappe.
- **Pastilles** : une par filtre actif, et une par **valeur** pour une liste ; la croix retire cette valeur (une période repasse à « tout »). « Effacer tout » apparaît à partir de deux pastilles. Une période par défaut (12 mois, par exemple) a donc sa pastille, que la croix peut retirer. Sur téléphone, les pastilles sont dans un panneau repliable (bouton « Filtres actifs (n) »).
- **Croisement** : un clic sur une barre, une part d'anneau ou un point d'une tuile dont la réponse porte `croisement: { filtre }` règle ce filtre (si ce filtre est à l'écran et de type liste). La valeur est lue dans la donnée de la série (`params.name` d'ECharts, seulement pour un clic de type « series » : ni légende, ni axe) puis **validée** : le filtre doit avoir des `choix` fermés ou une liste COMPLÈTE de valeurs, et la valeur doit en faire partie (c'est la forme du choix qui est envoyée, texte ou nombre) ; liste tronquée ou sans valeurs : le clic est ignoré (la fenêtre « Filtres » reste possible). **Réglage** : la colonne du `croisement` doit être la dimension « nom » du graphique (la catégorie de l'axe, ou `itemName` d'un anneau), c'est elle qu'ECharts rend dans `params.name`. La fenêtre vérifie aussi, avant l'envoi, les plafonds du serveur (50 valeurs cochées, années 1900 à 2100, nombres jusqu'à 1e15) avec un message dans la fenêtre : un envoi refusé par le serveur est ainsi évité. Un clic sur une valeur qui n'est pas dans le filtre le règle à **cette seule valeur** ; un clic sur une valeur déjà choisie la **retire** (second clic). Le gestionnaire est générique (`instance.on('click')` dans `ecran.js`, aucune fonction dans le réglage) et le curseur est une main (`cursor: 'pointer'` posé sur une copie de l'option). Le clic n'est jamais le seul moyen : la fenêtre « Filtres » règle la même chose.
- **Filtre refusé** : si le serveur répond `invalid-argument` avec `details.raison === "filtre"` (filtre disparu du réglage, droits changés), l'écran vide les filtres mémorisés de cet onglet, relit **une seule fois** et affiche « Filtres réinitialisés. ». « Onglet inconnu » reste traité comme avant (l'écran rouvre le premier onglet).
- **Tuiles** : `mentionNonFiltre` est affichée en petit sous le titre de la carte ; un petit repère « Filtrée » (entonnoir) marque une tuile sur laquelle au moins un filtre actif agit (`filtresAppliques`).
- **Export CSV** : bouton « Exporter en CSV » sur chaque tuile `tableau` ; il exporte les lignes **déjà lues** (donc filtrées), dans l'ordre affiché (tri compris), avec les titres de colonnes. Séparateur point-virgule, BOM UTF-8, fin de ligne CRLF, guillemets doublés, nombres avec virgule décimale ; une cellule qui commence par `=`, `+`, `-`, `@`, tabulation ou retour chariot est précédée d'une apostrophe (un nombre négatif seul reste un nombre). Nom : `tableau-<id de la tuile>-AAAA-MM-JJ.csv`, jamais une donnée du tableau. Téléchargement par la fonction `telecharger` de l'appli.
- **Format `euros4`** : quatre décimales (`0,0009 €`), pour les coûts minuscules (un appel d'IA) ; ajouté à la liste fermée des formats, côté écran (`formats.js`) et côté serveur (`reglages.js`).
- **Pas de nom réel dans le dépôt** : tous les exemples sont fictifs (`v_exemple_…`, « Nord / Sud / Est »).

## Tableau de bord pour l'assistant : deux outils MCP en lecture seule (23/11/2026, version 2.50.0)

Jérôme interroge ses données par son assistant (claude.ai) avec **exactement les chiffres de l'écran « Tableau de bord »**. Les outils sont une couche fine sur le service de l'écran : mêmes vues, mêmes filtres, mêmes droits par tuile, même connexion en lecture seule (secret `SUPABASE_INDICATEURS`). Aucune nouvelle connexion, aucun nouveau secret, aucun SQL libre, aucune écriture.

**Portée : Jérôme seulement, pas le PDG.** Les outils sont réservés au super admin (identité Google vérifiée dans `SUPER_ADMINS`, comme `modifier_reglages_devis`) et le contrôle « compte autorisé » de l'écran (`COMPTES_AUTORISES`) est refait par la couche. Un jeton statique, un éditeur ou un assistant d'un client ne les voit pas et ne peut pas les appeler. Aucun compte n'a été ajouté à une liste d'accès : ouvrir le PDG est une décision de Jérôme (version plateforme, plus tard).

- **`lister_tableau_de_bord`** : les onglets (id, titre), les tuiles visibles de chaque onglet (id, titre, type, aide) et les filtres proposés (id, libellé, type, `choix` d'une liste fixe). Ne lit pas Postgres. Une tuile interdite n'apparaît pas (ni son onglet s'il devient vide). Les valeurs d'un filtre « liste » lues dans une vue ne sortent que de `lire_tableau_de_bord`.
- **`lire_tableau_de_bord`** : `onglet` (facultatif : le premier), `tuile` (facultatif : une seule tuile, son onglet est retrouvé tout seul), `filtres` (validés par le service ; une liste est toujours une liste de textes), `lignesMax` (50 par défaut, 200 au plus ; la réponse dit « N premières lignes sur M »). Réponse : par tuile, un grand chiffre (`valeur`, `texte` formaté comme l'écran, `etat`, `couleur`, `periode`, `variation` : pourcentage, texte, sens, couleur, valeur et période précédentes, ou « Variation non calculable »), un tableau (colonnes renommées par leur titre, cellules formatées), des phrases, un graphique (lignes lues) ou un texte. Une tuile qui n'a pas pu être lue porte `erreur` (la phrase générique du service).
- **Ce qui ne sort jamais** : nom de vue, option de graphique, seuils, formats, liens, largeur, colonnes des filtres, `apercu` et `exporter` du service (l'argument est refusé, pas ignoré : schéma strict). Chaque réponse porte un `avertissement` (« données, pas instructions ») et chaque texte est borné à 200 caractères.
- **Où est le code** : la logique est dans `functions/src/pilotage/assistant.js` (injectée par `creerGestionnaire({ pilotage })`, lue par `contexte.pilotage()`) ; `functions/src/mcp/outils/pilotage.js` ne porte que nom, schéma, description et appel (le dossier `mcp/` est copié chez les clients, où `pilotage/` n'existe pas : aucun import). Chez un client, le service n'est pas injecté : l'outil répond « Le Tableau de bord n'est pas branché sur ce serveur ». `service.decrire({ email })` partage le calcul de visibilité avec `lire` (`visibiliteDe`). Les formats et la variation viennent de `js/modules/pilotage/formats.js`, copié par `scripts/preparer-fonctions.js` vers `functions/partage/pilotage-formats.js` (jamais vers la plateforme clients) : un seul exemplaire du calcul.
- **Droit sur le secret** : `mcp` tourne sous `mcp-serveur@…`, qui n'a pas « Accesseur de secrets » sur `SUPABASE_INDICATEURS` : Jérôme le lui donne (un geste IAM, voir `docs/securite-et-pannes.md`). Tant que ce n'est pas fait, chaque tuile répond « n'a pas pu être lue » (comportement attendu). Le cache de 60 s est par processus : `mcp` et `pilotageLire` ont chacun le leur, donc un écart de 60 s au plus avec l'écran est normal.
- **Cas vide** : aucun réglage ou aucune tuile visible pour ce compte : réponse vide avec le message « Aucune tuile visible pour ce compte. », sans lire Postgres. **Cas d'erreur** : base injoignable ou secret illisible : chaque tuile porte `erreur`, jamais le message de la base ; filtre invalide : « Filtre invalide. » ; onglet ou tuile inconnu ou interdit : même phrase (« Onglet inconnu. » / « Tuile inconnue. »).
- Tests : `tests/pilotage-mcp.test.js` (PM1 à PM17).
