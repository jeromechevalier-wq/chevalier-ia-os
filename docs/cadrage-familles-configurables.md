# Cadrage : des familles d'articles configurables (Catalogue du module Devis)

Écrit le 01/11/2026 (**document de cadrage, aucun code, rien n'est lancé, aucune donnée touchée**). Demande de Jérôme du 01/11/2026. Tout ce qui est dit « existe » a été relu dans le code ce jour-là (fichier:ligne, sur `main` au commit `870650a`). Ce qui n'a **pas** pu être vérifié est dit à la section 9.

## 0. Le problème en 6 lignes

1. Le Catalogue range les articles dans **sept familles de premier niveau** (Fournitures, Main d'œuvre, Ouvrages, Sous-traitance, Matériels, Textes, Divers). Elles sont **verrouillées** : ni renommées, ni masquées, et on ne peut pas en créer d'autres au premier niveau.
2. Leurs sous-familles de départ (Gros œuvre, Carrelage, Maçon, Sols…) sont celles d'un artisan du bâtiment. Pour une agence de communication, rien n'a de sens.
3. Jérôme veut : **(a)** des familles configurables (renommer, masquer, créer les siennes, y compris au premier niveau) ; **(b)** cacher celles dont son métier n'a pas besoin ; **(c)** le même code chez lui et chez les clients ; **(d)** que l'outil de démo écrive des familles propres à chaque métier.
4. Le vrai nœud : **le type de l'article** (fourniture, main d'œuvre, ouvrage…) **se déduit de la famille de premier niveau**. Une famille « libre » n'a donc pas de type aujourd'hui.
5. Bonne nouvelle : les **sous-familles sont déjà libres** (création, renommage, désactivation), et le code **tolère déjà** des familles libres de premier niveau dans les données (`famillesDe`, `familles.js:53`). Il manque surtout le déverrouillage, le « type » d'une famille neuve, et les boutons du devis qui sont écrits en dur.
6. Recommandation : **trois petites PR** (section 5), la première utile à elle seule (renommer et masquer les sept familles), **sans aucune migration**.

## 1. Le modèle actuel (ce qui est lu, où)

### 1.1 Le document et les identifiants

- Un seul document `devis_parametres/familles` = `{ liste: [{ id, nom, actif, parentId? }] }` (`familles.js:3-5`, écrit en entier à chaque changement par `donnees.js:273-283`, sans journal). Document absent = familles par défaut (`familles.js:42-44`).
- Les sept familles de départ ont des identifiants **stables** `famille-1` à `famille-7` (`familles.js:13`) ; leurs sous-familles `famille-<n>-<m>` (`familles.js:24`). Un article peut donc s'y rattacher **avant** que le document existe.
- **Le type est une table en dur** : `TYPE_DE_DEPART` (`familles.js:28`) = `famille-1` → fourniture, `-2` → main_oeuvre, `-3` → ouvrage, `-4` → sous_traitance, `-5` → materiel, `-6` → texte, `-7` → divers.
- Le verrou : `estFamilleDepart` (`familles.js:34`) est appelé à **4 endroits** : `famillesDe` **jette** toute entrée stockée portant un id de départ (`familles.js:47`, donc un ancien document n'est jamais dangereux), `planRenommerFamille` (`:136`), `planDesactiverFamille` (`:148`) et l'écran des réglages (`reglages-familles.js:78`, badge « Famille de départ », aucun bouton). Le refus de créer au premier niveau est à part : `planCreationFamille` (« le premier niveau ne change pas », `:121`). Document absent = familles par défaut : `familles.js:46`.

### 1.2 Où le type d'article est déduit de la famille

| Endroit | Ce qu'il fait |
|---|---|
| `familles.js:76-82` `typeDeFamille` | famille → famille de premier niveau → `TYPE_DE_DEPART`. Famille inconnue ou libre : `null` |
| `familles.js:84` `familleDeType` et `:87` `familleEffective` | sens inverse : un article **sans** `familleId` est rangé dans la famille de départ de son type (« les anciens articles n'ont pas de migration ») |
| `articles.js:204-226` `validerArticle` | le type suit la famille choisie ; un type donné à part doit s'accorder (sinon erreur) ; type inconnu refusé (`TYPES_ARTICLE`, `articles.js:142-150`) |
| `articles.js:332-345` `planMajArticle` | changer la famille change le type ; on ne peut pas effacer le type d'un article rangé dans une famille qui en porte un ; si l'article quitte « ouvrage », composants et prix forcé s'effacent |
| `articles.js:397-406` `filtrerArticles` | filtre par famille (avec sous-familles), « sans famille » = pas de `familleEffective` |
| `bordereau.js:112, 132-146` | colonne Famille : changer une famille « ouvrage » ouvre la composition (`typeDeFamille(...) === 'ouvrage'`, `:136, :143`) |
| `bordereau.js:298, 315` | `FAMILLE_DEFAUT = 'famille-1'` : un nouvel article démarre dans « Fournitures » (sans contrôle de `actif`) |
| `bordereau.js:138` | message de refus qui cherche le nom de `'famille-3'` en dur |
| `bordereau.js:333` | `typeChoisi()` du formulaire d'article neuf |
| `bordereau.js:428, 457` | filtre « Famille » en arbre cochable (`optionsFamillesArbre`, `familles.js:104-112`) |

### 1.3 Éditeur du devis (les boutons « + »)

- **`editeur-ecran.js:1377-1384`** : trois boutons principaux écrits en dur `type('Fourniture','famille-1')`, `type('Main d’œuvre','famille-2')`, `type(<mot du métier>,'famille-3')`, et le menu « … » avec `famille-4` (Sous-traitance), `famille-5` (Matériel), `famille-7` (Divers). Le mot « Ouvrage » y suit le **mot du métier** réglé (ex. « Prestation »), pas le nom de la famille.
- **`editeur-ecran.js:1574-1581`** : le menu « insérer avant/après » refait la même liste en dur.
- **`editeur-ecran.js:1354-1355, 1441`** : le filtre de la boîte de recherche ne garde que les familles actives ; `ouvrirRecherche(familleId)` retombe sur « toutes les familles » si la famille est inactive ou absente.
- **Ce qui ne dépend PAS des familles** : les boutons « Texte », « Section », « Sous-section » et « Ligne libre » (`editeur-ecran.js:1389-1393`) sont des structures du devis, pas des familles.
- La **ligne de devis** reçoit une **copie** de `type` et `familleId` au moment où elle est créée (`editeur-logique.js:131-135`) : plus rien ne change si l'article change ensuite. Le PDF et le document (`document.js`, `html-devis.js`, `pdf.js`) ne lisent **aucune** famille (aucune occurrence relevée) : **un devis finalisé ne dépend pas de la liste des familles**.

### 1.4 Vocabulaire, recherche, MCP, serveur

- **Dictionnaire** (`vocabulaire.js`) : une cible « famille » se résout à l'instant de la recherche en tous les articles dont `familleEffective` est la famille ou une sous-famille (`vocabulaire.js:253-273`, `idsAvecSousFamilles`). **Famille désactivée ou introuvable = cible morte, ignorée** : déjà prévu, rien à ajouter. Sans liste fournie, le moteur reprend `famillesDe(null)` (`vocabulaire.js:490`). Même chose dans `vocabulaire-plans.js:61-62`, `selecteur-catalogue.js:41`, `selecteur-catalogue-logique.js:2, 24`.
- **Serveur** : `functions/src/coeur/metier.js:677-682` (`famillesDevis`, utilisée par `creerArticle`, `modifierArticle`, `enregistrerReponseVocabulaire`) et `functions/src/coeur/lecture.js:312-317, 325, 340-348` (`famillesLues`, `rechercherArticleParPhrase`, `lireReglagesDevis`). Le code des familles y arrive par **copie** (`scripts/preparer-fonctions.js:35`, sous le nom `devis-familles.js`), donc **un seul fichier** à changer pour Jérôme et pour les clients.
- **Outils MCP** : `creer_article` et `modifier_article` acceptent `familleId` (`functions/src/mcp/outils/ecriture.js:156, 169`) ; `lire_reglages_devis` rend la liste des familles (`lecture.js:182`, via `lecture.js:348`) **sans le type** de chaque famille ; `rechercher_article_par_phrase` rend les questions de famille avec le chemin (`vocabulaire.js:320`). **Aucun outil MCP ne crée, renomme ni désactive une famille.** Aucun `famille-N` n'est écrit en dur dans le **code** de `functions/`, mais la **description** de `creer_article` (`functions/src/mcp/outils/ecriture.js:156`, champ `familleId`) cite « famille-1 à famille-7, ou une sous-famille » : elle sera fausse dès la PR 2 (voir PR 2). La description de `lire_reglages_devis` (`functions/src/mcp/outils/lecture.js:182`) est à compléter de la même façon.
- **Export** : `export.js` copie `devis_parametres` en entier (`donnees.js:286`) : un champ de plus dans une famille s'exporte tout seul.
- **Règles Firestore** : `devis_parametres` tombe sous la règle générique (`firestore.rules:172-175`, `firestore.plateforme.rules:182-184`) : **aucune règle à changer** pour les 3 PR, donc aucune PR en liste d'arrêt pour ce motif.

### 1.5 La démo

- `scripts/plateforme/jeux-demo/index.js:21-31` `catalogueDuJeu` : les familles du jeu sont des triplets `[id, nom, parentId]` → `{ liste: [...] }`. **Seules des sous-familles sont possibles** ; elles s'accrochent à `famille-1`, `-2`, `-3` ou `-5` (ex. le jeu `agence.js:17-21` met « Création de sites internet » sous `famille-2`, avec des articles de type `main_oeuvre`).
- Les articles des jeux citent aussi les **sous-familles de départ** par leur id (`etancheur.js` : `famille-1-3`, `plombier.js` : `famille-1-7`…), et `donnees-demo.js:75-92` fait pareil pour le jeu de base.
- `donnees-demo.js:278-283` : les titres de section des devis de démo prennent le **nom de la famille** (`famillesDe` + `nomsFamilles`), sinon le libellé du type.

## 2. Ce qui doit rester vrai (contraintes de Jérôme)

1. **Aucune migration destructive** : on n'efface, ne renomme et ne déplace rien dans la base.
2. **Aucun article orphelin** : un article garde son `familleId`, même si sa famille est masquée.
3. **L'identifiant reste stable** : `famille-1` à `famille-7` ne changent jamais (le nom et le masquage sont des réglages par-dessus).
4. **Un devis finalisé ne change pas** : ses lignes portent leur copie de `type` et `familleId` (§1.3) ; aucune des options ci-dessous n'y touche.
5. **Même code chez Jérôme et chez les clients** : aucun interrupteur « réservé aux clients ». Le « profil de métier » est une **donnée**, jamais une branche de code.
6. **Pas de porte dérobée, pas de texte à coller chez l'assistant** : les consignes vivent dans les réponses des outils.
7. **Une fonction du serveur existe des deux côtés** : `familles.js` est copié par `preparer-fonctions.js`, donc la règle est tenue d'office ; aucune fonction, aucun déclencheur n'est ajouté.
8. **Bouton d'export** : le module a déjà son export (`export.js`) ; aucune nouvelle donnée hors `devis_parametres`.

## 3. Les options de conception

### Option A : le premier niveau devient renommable et masquable, il garde ses sept types

- Les sept familles gardent leurs id et leur type. Le **nom** et l'état **actif** se règlent comme ceux d'une sous-famille. On ne peut toujours pas créer une famille de premier niveau.
- **Données** : on écrit `{ id: 'famille-1', nom: 'Supports', actif: true }` dans la liste (comme une sous-famille de départ modifiée). Rien n'est migré : un document sans ces entrées donne les noms d'origine. Un ancien code qui relirait le document **jette** ces entrées (`familles.js:47`) et revient aux noms d'origine : retour arrière sans dégât.
- **MCP et assistant** : les noms vus par l'assistant (`lire_reglages_devis`, questions de famille) deviennent ceux de l'utilisateur. Le type d'un article reste déduit comme aujourd'hui. Aucun nouvel outil.
- **Risques** : les boutons « + » du devis écrits en dur (§1.3) doivent suivre le nom et disparaître quand la famille est masquée ; `FAMILLE_DEFAUT` et le message de `bordereau.js:138` aussi. Une famille masquée qui contient des articles : ils restent, rangés et visibles dans le Catalogue.
- **Limite** : pour l'agence, « Agence » n'existe pas au premier niveau : il faut renommer par exemple « Main d'œuvre » en « Agence » (son type reste main d'œuvre), et masquer les six autres. Ça marche, mais c'est un détour.
- **PR** : 1. **Tests** : `familles`, `articles`, `vocabulaire-familles`, `devis-mcp`, parcours du devis. **Fable** : oui (copie serveur + éditeur du devis, gros écran).

### Option B : le premier niveau est libre, avec un « type » choisi à la création de la famille

- Option A **plus** la création de familles de premier niveau. Une famille neuve porte un champ `type` (un des sept) choisi à la création : `{ id: '<id neuf>', nom: 'Agence', actif: true, type: 'main_oeuvre' }`. `typeDeFamille` lit la table pour `famille-1..7` et `f.type` pour les autres.
- **Données** : champ ajouté seulement aux familles neuves. Les identifiants neufs viennent de `nouvelId` (jamais `famille-N`, donc aucune collision). Aucun article ni devis existant n'est touché.
- **MCP et assistant** : `lire_reglages_devis` doit **rendre le type de chaque famille** (sinon l'assistant doit le deviner) : c'est un ajout à la réponse, visible dans `tests/devis-mcp.test.js`. `creer_article` marche tel quel avec les identifiants neufs, le type se déduit.
- **Risques** :
  - **Type qui change après coup** : si on modifie le type d'une famille qui contient des articles, ils changeraient de type en silence (et les ouvrages perdraient leurs composants, `articles.js:343-345`). Parade : **le type est fixé à la création et ne se change pas** (le nom, lui, se change).
  - **Fenêtre de déploiement** : un ancien serveur ne connaît pas `type` et `typeDeFamille` rend `null` : un article créé par l'assistant dans la famille neuve naîtrait **sans type** (« non classé »), sans erreur. Parade : déployer le serveur (`mcp`) **avant** de montrer le bouton de création (`hosting`), un déploiement à la fois ; ces articles restent corrigeables.
  - Famille libre « sans type » : à ne pas permettre (question 2).
- **PR** : 2 (A d'abord). **Fable** : oui (serveur + données).

### Option C : un « profil de métier » proposé au démarrage

- Un choix (« bâtiment », « agence », « plombier ») qui **écrit** un jeu de familles tout fait dans `devis_parametres/familles`. C'est de la donnée, pas du code : le même programme chez tout le monde.
- **Dépend de A + B** : un profil « agence » doit pouvoir masquer des familles de départ et en créer une au premier niveau. Sans cela il se limite à des sous-familles (c'est ce que fait déjà la démo, §1.5).
- **Risques** : un profil appliqué sur un catalogue déjà rempli ne doit **jamais** effacer ni déplacer : il ajoute, il masque, rien d'autre. Un écran de choix à la création du compte touche au parcours d'inscription (hors périmètre de cette demande).
- **PR** : 1 à 2, **après** B. Ce n'est **pas demandé** par Jérôme (« pouvoir configurer ») ; à ne faire que s'il le veut.

### Option D (écartée) : détacher le type de la famille

- Le type serait choisi **article par article**, la famille ne servirait plus qu'à ranger. Le plus propre sur le papier, mais : `validerArticle`, `planMajArticle`, `familleEffective`, la colonne Famille du Catalogue, `creer_article` (le type deviendrait obligatoire), `bordereau.js:136-143` (famille « ouvrage ») et une trentaine de tests sont à réécrire, avec risque sur les devis en cours. **Trop gros** pour le besoin ; à garder en tête seulement si B montre ses limites.

### Comparatif

| | A | B (= A + création) | C (= B + profils) | D |
|---|---|---|---|---|
| Renommer et masquer les sept | oui | oui | oui | oui |
| Créer « Agence » au premier niveau | non (détour) | **oui** | oui | oui |
| Migration | aucune | aucune | aucune | aucune, mais gros chantier |
| Nouveau champ en base | non | `type` sur les familles neuves | idem | non |
| Serveur touché | copie de `familles.js` | idem + réponse de `lire_reglages_devis` | idem | beaucoup |
| PR | 1 | 2 | 3 à 4 | 6 ou plus |
| Risque principal | boutons du devis en dur | type figé, ordre de déploiement | écraser un catalogue rempli | régression sur les devis |

## 4. Recommandation

**A, puis B, puis la démo (jeux par métier avec familles propres). Pas C, pas D pour l'instant.**

Raison : A répond déjà à (b) et à une grande partie de (a) avec **une seule PR sans nouveau champ en base** ; B ajoute seulement « créer au premier niveau avec un type » ; la démo (d) devient alors un simple jeu de données. Le « profil de métier » (C) est une simple **donnée** qu'on pourra ajouter ensuite sans changer le modèle.

## 5. Découpage en PR (une PR, un sujet, fusion dans la journée)

> Toutes ces PR touchent `familles.js`, copié sur le serveur, et les boutons de l'éditeur du devis : **relecture Fable obligatoire** (serveur, données, gros écran). Chaque PR fusionne d'abord `origin/main`. Chaque nouveau test d'écran se lance aussi en format téléphone.

### PR 1 : « Renommer et masquer les sept familles de départ » (la plus petite utile)

**Ce que ça fait** : lève le verrou de `estFamilleDepart` sur le **nom** et l'**état actif** (id et type inchangés) ; `famillesDe` lit une entrée stockée d'une famille de départ comme il le fait pour une sous-famille de départ (nom et actif seulement) ; l'écran Réglages > Familles d'articles donne aux sept familles les mêmes boutons (renommer, désactiver, réactiver) et son texte d'aide (`reglages-familles.js:15`, « Les sept grandes familles sont fixes… ») est réécrit (aucun test ne doit le lire : à vérifier par `grep` ; la recherche de « sept grandes familles » dans `tests/` n'a rien rendu) ; `planCreationFamille` (`familles.js:119-129`) refuse de créer une sous-famille sous une famille désactivée (« Réactive d'abord « Matériels » ») ; **les boutons « + » du devis, le menu « insérer », `FAMILLE_DEFAUT` et le message de `bordereau.js:138` suivent** les familles actives et leurs noms.

**Critères d'acceptation observables** (un test dont le nom commence par le numéro, une capture chacun) :

1. 1.1 Dans Réglages > Familles d'articles, « Fournitures » se renomme en « Supports » : le nouveau nom apparaît dans le Catalogue (colonne Famille, filtre en arbre) et dans la boîte de recherche du devis.
2. 1.2 « Matériels » se désactive (avec confirmation qui dit combien d'articles y sont rangés) : le bouton « Matériel » disparaît du menu « … » de l'éditeur et du menu « insérer » ; l'article déjà rangé dedans reste visible dans le Catalogue. **Filtre du Catalogue** : `optionsFamillesArbre` (`familles.js:104-110`) n'a aucun filtre `actif`, donc une famille désactivée y reste proposée (alors que l'éditeur la masque, `editeur-ecran.js:1355`) ; par défaut elle reste dans le filtre du Catalogue **avec la mention « désactivée »**. À savoir : le sélecteur du Vocabulaire (`selecteur-catalogue-logique.js:24`, `selecteur-catalogue.js:41`) range ces articles sous « Sans famille ».
3. 1.3 On ne peut pas désactiver la **dernière** famille active : message simple « Il en faut au moins une ».
4. 1.4 Réactiver « Matériels » remet le bouton et rien d'autre ne change.
5. 1.5 Les identifiants `famille-1` à `famille-7` et leurs types sont inchangés après renommage et désactivation (test sur `familles.js`) ; un devis finalisé avant le changement s'affiche et s'exporte à l'identique.
6. 1.6 Un document `devis_parametres/familles` **ancien** (sans entrées de départ) donne exactement les noms d'origine ; un document avec entrées de départ lu par l'**ancien** code les ignore sans erreur (test de non-régression sur la liste filtrée).
7. 1.7 Côté assistant : `lire_reglages_devis` rend les noms et états choisis ; `creer_article` dans une famille de départ désactivée garde le comportement des sous-familles (refusé, sauf si l'article y est déjà) ; la copie préparée du serveur charge (test K13 existant).
8. 1.8 Créer une sous-famille sous « Matériels » désactivée est refusé avec « Réactive d'abord « Matériels » » (message sous la famille).
9. 1.9 Cas vide et erreur de l'écran : aucune sous-famille = « Aucune sous-famille » (existant) ; nom en double ou trop long = message sous la famille (existant) ; écriture refusée = message, rien de perdu.

**Tests existants à adapter** (à confirmer par `grep` avant d'ouvrir la PR, leçon du 29/10) : unitaires qui verrouillent le verrou : `devis-familles-ergonomie.test.js` P1 (`:51`) et `devis-familles-unique.test.js` F5 (`:103`) (leur énoncé change ; `devis-familles.test.js` F3/F5 ne testent pas le verrou) ; parcours : `devis-boite-ajout`, `devis-ecran-unique`, `devis-editeur-mise-en-page`, `devis-editeur`, `devis-familles-ergonomie`, `devis-mot-metier`, `devis-editeur-sections-saut` (`.spec.js`) ; le palier complet se déclenche si on touche `firestore.rules` (ce n'est pas prévu). Le script `preparer-fonctions.js` doit être relancé (copie serveur) et le test K13 (`tests/devis-vocabulaire-copie.test.js`) couvre le chargement de la copie.

### PR 2 : « Créer ses propres familles de premier niveau »

**Ce que ça fait** : `planCreationFamille` accepte un `parentId` vide **avec un type obligatoire** (un des sept, présenté en mots simples) ; `typeDeFamille` lit `f.type` pour les familles non-départ ; le type est **fixé** (le nom se change) ; `famillesDe` (`familles.js:48`) ne recopie aujourd'hui que `id`, `nom`, `actif`, `parentId` : elle doit garder **et contrôler** `type` (une des sept valeurs de `DEPART`, sans importer `articles.js`) ; `lire_reglages_devis` rend `type` pour chaque famille (`functions/src/coeur/lecture.js:348`) et sa description (`functions/src/mcp/outils/lecture.js:182`) le dit ; la description de `creer_article` (`functions/src/mcp/outils/ecriture.js:156`) devient « famille-1 à famille-7, une famille créée par l'utilisateur, ou une sous-famille » (deux fichiers de plus à la PR 2) ; les boutons « + » du devis montrent d'abord les trois premières familles actives, les autres vont dans le menu « … ».

**Critères d'acceptation** :

1. 2.1 Dans Réglages, « Nouvelle famille » (premier niveau) demande un nom et un type ; « Agence » + type « Temps passé (main d'œuvre) » apparaît en tête de l'arbre avec ses sous-familles possibles.
2. 2.2 Un article créé dans « Agence » a le type main d'œuvre, sans autre choix (`validerArticle`, `planMajArticle`).
3. 2.3 Le devis propose un bouton « + Agence » (ou dans le menu « … »), et la boîte de recherche est déjà filtrée dessus.
4. 2.4 Le type d'une famille existante ne se change pas : le champ est absent à l'écran et refusé par `planRenommerFamille`/le plan de mise à jour.
5. 2.5 `creer_article` avec l'id de la famille « Agence » rend un article typé (jamais « non classé ») ; `lire_reglages_devis` montre `type` pour toutes les familles.
6. 2.6 L'identifiant d'une famille neuve n'est jamais `famille-<n>` (pas de collision avec le départ) ; deux familles de même nom au premier niveau sont refusées (existant).
7. 2.7 Cas vide : un compte sans famille créée par l'utilisateur voit exactement ce qu'il voyait avant (comparaison avec la PR 1). Cas d'erreur : type absent = message « Choisis ce que cette famille contient ».

**Ordre de déploiement chez les clients** (Jérôme lance un déploiement à la fois) : `mcp` **avant** `hosting` (voir le risque « article sans type », option B). À dire dans la PR et dans Réglages > Déploiement.

### PR 3 : « La démo écrit des familles propres à chaque métier »

**Ce que ça fait** : le format des jeux (`jeux-demo/*.js`) accepte une famille de premier niveau avec son type et une liste de familles de départ à masquer ; `catalogueDuJeu` les écrit dans le document `familles` du client de démo ; le jeu « agence » devient : une famille « Agence » (type main d'œuvre) avec 4 à 5 sous-familles (ex. Création de sites, Référencement, Contenus, Fiches Google, Installation), les familles de départ du bâtiment masquées ; le jeu « plombier » et « étancheur » masquent ce qui ne leur sert pas. `donnees-demo.js` garde les titres de section pris dans le nom de la famille.

**Critères d'acceptation** :

1. 3.1 Après `--metier agence`, le Catalogue du client de démo montre « Agence » et ses sous-familles, et aucune famille du bâtiment visible. Le document `familles` est écrit à `scripts/plateforme/donnees-demo.js:682`, **seulement s'il n'existe pas déjà** : un document `familles` non marqué « démo » arrête le programme avec un message clair.
2. 3.2 Tous les articles des jeux ont un `familleId` qui existe dans la liste écrite (le contrôle de complétude des jeux existant échoue sinon).
3. 3.3 Les devis de démo ont des titres de section qui portent les noms de famille de l'agence (pas « Gros œuvre »).
4. 3.4 Aucun jeu n'écrit dans un vrai client (garde existante de `marquer-demo.js`, test inchangé) et l'effacement de la démo (`--retirer`) retire aussi le document `familles` : c'est déjà vrai (`devis_parametres` est dans `COLLECTIONS_DEMO`), le test le verrouille.
5. 3.5 Cas vide : un jeu sans `familles` ni masquage écrit rien (comportement actuel) ; cas d'erreur : une famille de départ à masquer qui n'existe pas, ou un type inconnu, arrête le programme avec un message clair (y compris le document `familles` déjà présent et non marqué démo).

**Hors PR** : `scripts/plateforme/*` n'est pas déployé ; aucun secret ; pas de donnée de client.

### Après (si Jérôme le veut, pas dans ce cadrage)

- **PR 4 : choisir l'ordre des familles** (flèches haut/bas) : sans cela l'ordre est « départ d'abord, puis par création ».
- **PR 5 : « profil de métier »** (option C) : un jeu de familles proposé à la création du compte.
- Des outils MCP « gérer les familles » : non recommandé maintenant (les familles se règlent par l'humain, à l'écran ; l'assistant les lit).

## 6. Risques et pièges, en une liste

1. **Les boutons « + » du devis** (`editeur-ecran.js:1377-1384, 1574-1581`) sont le gros morceau de la PR 1 : ils lisent aujourd'hui `famille-1` à `famille-7` en dur. Un gros écran, trois à quatre défauts par PR en moyenne : la relecture Fable est indispensable.
2. **Le mot du métier contre le nom de la famille** : le bouton « Ouvrage » suit aujourd'hui le mot du métier (« Prestation »), pas le nom de la famille. Si l'utilisateur renomme « Ouvrages » en « Forfaits », quel mot gagne ? (question 1).
3. **Badge de type** (`bibliotheque.js:64`, `editeur-ecran.js:1500`) : il affiche le libellé du **type** (« Fourniture »), pas le nom de la famille. Après renommage, les deux peuvent différer. Acceptable, à dire à Jérôme.
4. **Articles sans famille** (`familleEffective`, `familles.js:87`) : ils sont rangés dans la famille de départ de leur type. Si cette famille est masquée, ils restent dedans : le filtre « Famille » doit encore pouvoir les trouver (critère 1.2). **Piège** : le champ intelligent `champ-famille.js:15` saute une famille de premier niveau désactivée **avec ses sous-familles** : un article déjà rangé dans « Matériels › Outillage » ne pourrait plus être re-choisi par ce champ. À dire à Jérôme et à tester. Un article créé sans `familleId` avec le type « matériel » tombe dans la famille désactivée sans refus : acceptable. Les sous-familles de « Textes » (`famille-6`) n'ont aucun bouton « + » : à dire si « Textes » peut devenir un des 3 boutons (question 7).
5. **Dictionnaire** : un mot dont la cible est une famille masquée devient une « cible morte, ignorée » (`vocabulaire.js:253-257`). C'est voulu ; l'écran de masquage doit le dire.
6. **Écran des réglages = un document réécrit en entier** (`donnees.js:273-283`, sans fusion) : deux onglets ouverts qui modifient les familles s'écrasent (comme les autres réglages). Pas de nouveau risque, mais à garder en tête pour la PR 2 (retirer un réglage : `setDoc` sans fusion peut ressusciter l'ancienne valeur).
7. **Devis finalisés** : rien à faire (§1.3), mais un test de bout en bout les reprend dans la PR 1 (critère 1.5).

## 7. Ce que Fable devra relire

- `familles.js` (la logique pure, copiée sur le serveur) : le filtre de `famillesDe`, la règle « au moins une famille active », la lecture et le contrôle du `type` des familles libres (`famillesDe` doit le recopier, valeur parmi les sept, sans importer `articles.js`).
- Les anciens documents : preuve que ni l'ancien ni le nouveau code ne perdent rien (critères 1.6 et 2.6).
- Les boutons du devis (PR 1 et 2), en format téléphone aussi.
- La réponse de `lire_reglages_devis` (PR 2) et l'ordre de déploiement `mcp` puis `hosting`.
- Le brief de chaque PR **contre le code** avant l'envoi (leçon du 28/10 : les briefs se vérifient).

## 8. Questions pour Jérôme (réponse proposée par défaut, exemples à 100 €)

1. **Le nom du bouton « + » suit-il le nom de la famille ?** Exemple : tu renommes « Ouvrages » en « Forfaits ». Le bouton du devis dit « + Forfaits » ou garde ton mot du métier « + Prestation » ? *Par défaut : le bouton suit le nom de la famille dès qu'elle est renommée ; tant qu'elle ne l'est pas, il garde le mot du métier.* (Code concerné : `bordereau.js:138` ; test `devis-mot-metier.spec.js`.)
2. **Une famille neuve doit-elle avoir un type ?** Le type dit comment l'article est compté (un site à 100 € = « du temps passé » ou « un forfait composé » ?). *Par défaut : oui, obligatoire, choisi à la création parmi les sept en mots simples (« je l'achète », « du temps passé », « un forfait composé », « sous-traité », « du matériel loué », « du texte », « divers »), et il ne se change pas ensuite.* Pour l'agence : « du temps passé ».
3. **Peut-on tout masquer ?** *Par défaut : non, il reste toujours au moins une famille.*
4. **Masquer ou désactiver ?** Le logiciel dit « désactiver » pour les articles et les sous-familles. *Par défaut : même mot, « désactiver » ; un article déjà rangé dans une famille désactivée reste visible dans le Catalogue.*
5. **L'ordre des familles** : *par défaut, ordre actuel (départ d'abord, puis par création) ; flèches haut/bas seulement si tu les demandes.*
6. **Un « profil de métier »** à la création du compte (option C) ? *Par défaut : pas maintenant ; la démo par métier sert de modèle.*
7. **« Textes » peut-il devenir un des trois boutons « + » ?** Aujourd'hui ses sous-familles n'ont aucun bouton. *Par défaut : non, « Textes » reste dans le menu « Texte » existant.*

## 9. Ce qui reste non vérifié

Réponses de la relecture Fable du 01/11/2026 intégrées : règles Firestore (aucune à changer, §1.4), filtre en arbre du Catalogue (sans filtre `actif`, critère 1.2), endroit d'écriture de la démo (`donnees-demo.js:682`, critère 3.1).

- **Aucun essai** : rien n'a été lancé (pas de test, pas de capture), puisque cette session ne code pas.
- **La liste des tests à adapter** (PR 1) vient de `grep` et de la relecture, pas d'une exécution : à confirmer avant d'ouvrir la PR.
- **Le texte d'aide** `reglages-familles.js:15` : aucun test ne semble le lire (recherche de « sept grandes familles » dans `tests/` sans résultat) ; à reconfirmer.

## 10. Où c'est rangé

- `.github/A-FAIRE.md` : une ligne (priorité proposée : 🟠 moyenne).
- `docs/roadmap.md` : une courte section « Familles d'articles configurables (01/11/2026) : piste ».
- Aucun code, aucune version, `docs/reprise-prochaine-session.md` non modifié.
