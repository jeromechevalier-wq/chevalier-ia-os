# Cadrage : un mot du dictionnaire qui désigne plusieurs articles ou des familles

Écrit le 30/10/2026 (**document de cadrage, aucun code**). Il prolonge `docs/cadrage-devis-fluide.md` (sections 4.3, 4.4, 5 et 8) et `docs/proposition-dictionnaire-vocabulaire.md`. Les décisions de Jérôme du 30/10/2026 sont marquées **Décidé** ; ce que j'ai choisi seul est marqué **Décision prise seule** (avec la question restante à la section 6). Tous les exemples sont inventés (« prise étanche », « interrupteur ») : aucun nom réel, aucune donnée de client (dépôt public). Le code lu est celui de `origin/main` au 30/10/2026 (PR 424, 427 et 429 fusionnées) ; la PR 430 (7b, écran de validation humaine) était en cours de fusion : ce document la lit sur sa branche et ne la contredit pas (là où elle change une ligne citée, c'est dit).

## 0. En cinq lignes

1. **Aujourd'hui** un mot du dictionnaire pointe vers **un seul article** (`articleId`), et un mot court comme « prise » n'aide pas à comprendre « prise étanche » : il ne compte que si la phrase entière est « prise ».
2. **Demain** un mot porte une liste de **cibles** (jusqu'à 8) : des articles « au choix » et/ou des **familles** (une famille se résout toujours à l'instant de la recherche : un article ajouté plus tard est inclus). Les mots existants ne bougent pas (aucune migration).
3. **L'idée centrale** : un mot qui désigne une famille dit de **quoi on parle** (« prise » = les prises) ; les autres mots de la phrase (« étanche ») sont cherchés **seulement dans cette famille**. Résultat : le bon article du premier coup, avec **une seule question oui/non** et sans afficher de liste ; la liste n'apparaît que s'il reste un vrai doute.
4. **Rien ne s'ajoute tout seul** : un mot à plusieurs cibles ne donne jamais `utiliser` (ligne ajoutée sans question) ; l'assistant n'apprend pas ces mots (c'est l'écran qui les crée, validés par Jérôme) ; aucun nouvel outil, aucune consigne à coller chez l'assistant.
5. **Plan** : 6 PR de code après la PR 430 **et** l'écran de revue (PR 11 du cadrage devis fluide) : le sélecteur d'arbre du catalogue d'abord, les règles Firestore (une seule porte pour Jérôme), puis « plusieurs articles au choix » (serveur puis écran), puis « famille et contexte » (moteur et serveur, puis écran).

## 1. Ce qui existe (vérifié dans le code)

| Sujet | Ce qui existe | Où |
|---|---|---|
| **Un mot = un article** | Un document par mot dans `devis_vocabulaire`, identifiant = la clé (« prise_double »), **un seul** `articleId` + une copie `articleLibelle`. `chercherCandidats` ne lit que `parId.get(regle.articleId)` : une règle sans article trouvé est sautée (`if (!article) continue`) | `js/modules/devis/vocabulaire.js` 207-248 ; modèle : `docs/proposition-dictionnaire-vocabulaire.md` section 3 |
| **Un mot court n'est pas un contexte** | Une règle ne sert que si sa clé est **égale** à la clé de la phrase (score 1,00 active, 0,70 à confirmer, 0,50 en conflit) ou si elle est **active** et que sa clé **contient tous les mots de la phrase** (« règle partielle », 0,65). Le sens inverse (la clé « prise » dans la phrase « prise étanche ») ne fait rien | `vocabulaire.js` 230-238 |
| **Recherche dans le catalogue** | `scoreLibelle` : l'article doit contenir **tous** les mots de la clé (à une faute près) ; score 0,80 × (mots de la clé ÷ mots du libellé), plancher 0,60, ×0,90 si faute. Un libellé complet qui contient 4 mots pour 2 cherchés tombe au plancher 0,60 : « prise étanche » ne se distingue de « interrupteur étanche » que parce que le mot « prise » doit aussi s'y trouver | `vocabulaire.js` 163-175 et 240-246 |
| **Décision** | `utiliser` : meilleur score ≥ 0,85 **et** écart ≥ 0,15 avec le deuxième, sans quantité, prix ni suggestion incertains. `proposer` : ≥ 0,50. Sinon `demander`. Un libellé seul plafonne à 0,80 : **seuls une règle validée (1,00) ou un libellé / code exact (0,95) donnent `utiliser`**. 5 candidats au plus, 3 cités dans la question. Tous les seuils sont dans `SEUILS` (test V8 : aucun 0,85 ni 0,15 ailleurs) | `vocabulaire.js` 10-39 et 296-325 |
| **Un moteur pur, un seul code** | Le même `interpreter` tourne à l'écran (« Essayer une phrase ») et sur le serveur. Il importe **seulement** `../crm/logique.js` et `./ouvrages.js` (test V8, `tests/devis-vocabulaire.test.js` 431-436, liste exacte des imports). Il est copié en `functions/partage/devis-vocabulaire.js` avec ses imports réécrits (`scripts/preparer-fonctions.js` 40-44) ; `familles.js` est déjà copié (`devis-familles.js`, même script ligne 104) mais **jamais importé par le moteur** | `vocabulaire.js` 6-7 |
| **Apprentissage** | `decisionApprentissage` : 2 confirmations de **jours différents**, 0 contradiction, clé pas « trop générale » (un mot de 3 lettres ou moins seul, ou plus de 5 articles qui collent) → `active`, `validePar: 'reponses'`, revue à 6 mois. Un mot **validé** n'est jamais modifié : à la 2e contradiction il reçoit une `suggestion` (PR 427). Plafonds : 500 mots actifs, 300 à confirmer | `vocabulaire.js` 329-394 ; `functions/src/coeur/metier.js` 708-793 |
| **Réponse enregistrée** | `enregistrerReponseVocabulaire` **recalcule** la phrase avec le moteur ; une confirmation n'est acceptée que pour un article proposé (`propose = r.candidats.some(...)`). La règle créée a toujours **un** article. Pour un mot existant, `existante.articleId !== articleId` compte une contradiction | `metier.js` 726-793 |
| **Outils MCP** | `rechercher_article_par_phrase` (lecture) et `enregistrer_reponse_vocabulaire` (écriture) ; le serveur lit les articles, les mots et les réglages (`rechercherArticleParPhrase`, `lecture.js` 316-326) ; il **ne lit pas** `devis_parametres/familles` ici (seul `lireReglagesDevis` le lit, `lecture.js` 330-335). `lister_articles` n'a **aucun filtre de famille** (`statut` et `limite` seulement, `outils/lecture.js` 146-155). 25 outils dans `OUTILS_DEVIS` (`tests/mcp-clients.test.js` 1118) | `functions/src/mcp/outils/lecture.js` 168-171, `ecriture.js` 177-178 |
| **Familles** | Document `devis_parametres/familles` = `{ liste: [{ id, nom, actif, parentId? }] }`, **deux niveaux** : 7 familles de départ verrouillées (ni renommées, ni désactivées) et des sous-familles libres. **Jamais supprimées**, seulement désactivées (`planDesactiverFamille`). Un article porte un `familleId` facultatif ; `familleEffective(article)` donne sa famille, **ou la famille de départ de son type** pour un ancien article sans famille. `idsAvecSousFamilles` = la famille et ses sous-familles. `arbreFamilles` donne l'arbre | `js/modules/devis/familles.js` (copié en `devis-familles.js`) |
| **Sélecteurs existants** | (1) Écran Vocabulaire : `selecteurArticle` = un champ « Chercher un article du catalogue » dès la première lettre, 8 résultats, un seul article choisi (création d'un mot et « Changer l'article »). (2) Éditeur de devis : `bibliotheque.js` = arbre des familles à gauche (2 niveaux) + articles cochables à droite. (3) `champ-famille.js` = champ intelligent qui choisit **une famille** par son chemin (« Fournitures › Carrelage ») | `vocabulaire-ecran.js` 39-65 ; `bibliotheque.js` 36-47 ; `champ-famille.js` |
| **Règles Firestore** | `vocabulaireManuelNeuf` (création : manuelle, compteurs à 0, validation humaine) et `vocabulaireRevise` (le navigateur ne change que `statut`, `articleId`, `articleLibelle`, `note`, `conflit`, les marques, et depuis la PR 424 `valideLe`, `validePar`, `revoirLe`, `suggestionTraiteeLe`). Suppression interdite. **La création n'a pas de liste blanche de champs** (elle interdit une liste de champs, ne limite pas les autres) | `firestore.rules` 118-141 ; `firestore.plateforme.rules` 127-150 |
| **Écran** | Table (ordinateur) et cartes (téléphone, 44 px), menu « … », « Essayer une phrase », export CSV (`ENTETE_CSV` : Expression, Article, Statut, Origine, Confirmations, Dernière utilisation), cas vide et cas d'erreur. `planCreerMot`, `planChangerArticle`, `planChangerStatut` (plans purs) | `vocabulaire-ecran.js`, `vocabulaire-plans.js` ; `CHAMPS_MODIFIABLES` : `vocabulaire-plans.js` 12 (la PR 430 y ajoute les 4 champs de validation) |

**Surprise utile (leçon du 29/10 : un brief se vérifie contre le code).** (a) Le moteur est déjà capable de « contexte » dans un cas voisin : `chercherAvecSynonyme` (255-272) retire le mot du métier (« ensemble ») de la phrase et cherche le **reste** parmi les ouvrages. Le mécanisme « un mot réduit l'ensemble, le reste est cherché dedans » existe donc déjà, pour un seul mot codé en dur ; on le généralise. (b) Les familles ne sont **pas** lues par le serveur du dictionnaire : il faut ajouter cette lecture (un document de plus, en parallèle des trois lectures actuelles). (c) Aucun outil n'est à ajouter : les deux outils existent, seuls leurs textes et leurs réponses changent (le compte d'outils ne bouge pas).

## 2. Conception

### 2.1 Les décisions de Jérôme (30/10/2026)

- **Décidé** : un mot pointe vers **un ou plusieurs articles** et/ou **une ou plusieurs familles ou sous-familles** (« comme si je taguais »).
- **Décidé** : plusieurs articles = **au choix** (l'assistant demande lequel, seulement entre ces cibles). Ce n'est pas « tous ajoutés d'un coup » : ça, ce sont les « ensembles » (autre chantier, cadrage devis fluide).
- **Décidé, idée centrale** : le tag repère le **contexte**. Dans « une prise… étanche », « prise » dit de quelle famille on parle ; « étanche » est cherché **seulement dans cette famille** et trouve la prise étanche sans la confondre avec un interrupteur étanche. Objectif : **le bon article du premier coup**, sans afficher la liste. La liste des articles d'une famille n'est proposée que s'il reste un vrai doute ; jamais d'ajout d'une ligne que l'utilisateur n'a pas choisie.
- **Décidé** : à l'écran, choisir l'article ou la famille **en parcourant l'arbre** du catalogue, **en plus** de la recherche dès 2-3 lettres que Jérôme aime.
- **Décidé** : pas de migration ; les mots existants gardent leur `articleId` unique.
- **Décidé** : l'ordre des PR (section 3) et le départ **après la PR 430 et l'écran de revue** (PR 11).

### 2.2 Modèle de données

Un mot garde tous ses champs d'aujourd'hui. **Un seul champ est ajouté**, facultatif :

```
cibles: [ { genre: 'article' | 'famille', id: '<articleId ou familleId>', libelle: '<copie du libellé ou du chemin>' } ]   // 8 au plus
```

| Règle | Pourquoi |
|---|---|
| **`cibles` absent ou vide = le mot désigne l'article `articleId`.** Aucun document existant n'est touché. `ciblesDe(regle)` (fonction pure) rend la liste : `cibles` si elle est valable, sinon `[{ genre: 'article', id: articleId, libelle: articleLibelle }]` | pas de migration ; relecture tolérante : une cible mal formée est ignorée, jamais d'exception |
| **`cibles` n'est écrit que pour 2 cibles ou plus, ou dès qu'il y a une famille.** Dans ce cas **`articleId` et `articleLibelle` valent `''`**. Revenir à une seule cible article remet `cibles: []` et recopie `articleId` | **sécurité en déploiement mixte** (le navigateur, le serveur de Jérôme et ceux des clients ne se mettent pas à jour ensemble) : un ancien moteur voit un mot **sans article** et le saute (`if (!article) continue`), il n'applique jamais « le premier article » d'un « au choix ». Un ancien écran affiche une ligne « article indisponible » le temps de la mise à jour |
| **8 cibles au plus par mot** | assez pour « les trois prises + la famille Interrupteurs » ; la taille du document reste petite ; vérifié par les règles Firestore |
| **Une famille est une cible vivante** : au moment de chercher, elle se résout en « tous les articles actifs dont `familleEffective(article)` est la famille ou une de ses sous-familles » (`idsAvecSousFamilles`) | un article créé demain dans « Prises » est inclus sans toucher au mot ; un article déplacé ou désactivé en sort ; les anciens articles sans `familleId` comptent dans la famille de départ de leur type |
| **Cible morte** : article désactivé ou introuvable ; famille **désactivée** ou introuvable (une famille n'est jamais supprimée, c'est le même cas qu'une désactivation) | la cible est **ignorée** par le moteur (comme un article désactivé aujourd'hui). Si toutes les cibles sont mortes, le mot est sauté, exactement comme aujourd'hui. À l'écran : pastille grise « Cible indisponible » + « Changer ce que le mot désigne » |
| **Famille vide** (aucun article actif dedans) | cible vivante mais sans article : ignorée par le moteur ; pastille « Famille vide » à l'écran |
| Les copies `libelle` des cibles | pour afficher même si la cible est renommée ou désactivée (comme `articleLibelle`) ; le libellé suit à la prochaine modification du mot |

**Décision prise seule : `cibles` plutôt qu'`articleIds` + `familleIds`.** Une liste d'objets garde l'ordre choisi par Jérôme et porte la copie du libellé de chaque cible ; deux listes de textes seraient plus simples pour les règles mais obligeraient à retrouver les libellés ailleurs.

### 2.3 Le moteur (`vocabulaire.js`, toujours pur, sans IA, testé avec `node --test`)

**Entrées** : `interpreter(phrase, { regles, articles, reglages, familles })` ; `familles` est nouveau et facultatif (`famillesDe(brut)` côté serveur ; vide = les familles de départ). Le moteur importe `./familles.js` (pur, sans import) : le test V8 sur la liste des imports change **exprès**, et le script `preparer-fonctions.js` réécrit cet import (`from './familles.js'` vers `'./devis-familles.js'`, ligne 43) dans la même PR.

**Ce qui ne change pas.** `analyserPhrase` (quantité, prix, mots vides, pluriels), les mots à **une seule cible article** (leur chemin dans `chercherCandidats` est celui d'aujourd'hui, mot pour mot), les seuils de `utiliser` / `proposer`, la règle « un libellé seul plafonne à 0,80 ». Un test de non-régression rejoue le jeu d'essai V1 à V9 à l'identique.

**Nouveau : les marqueurs.** Un **marqueur** est un mot `active` qui a **une famille**, ou **au moins 2 articles** (jamais un mot à un seul article : il garde son rôle d'aujourd'hui). Un mot `a_confirmer` n'est jamais un marqueur (seul un humain en crée, section 2.4).

**Pas à pas** pour une phrase :

1. `analyserPhrase` donne les mots, la quantité, le prix (inchangé).
2. **Repérer les marqueurs** : suite de mots **contiguë et dans l'ordre de la clé** du marqueur (même principe que le mot du métier, 262-264). Les plus longs d'abord, puis le plus à gauche ; deux marqueurs ne se chevauchent pas. L'**ordre des autres mots est sans importance** (« étanche prise » = « prise étanche »).
3. **La portée** : pour un marqueur, l'**union** de ses cibles résolues (article = lui-même, famille = ses articles actifs, articles de type texte exclus comme aujourd'hui). Pour plusieurs marqueurs dans la phrase, l'**intersection** des portées (« prise » et « étanche » tous deux marqueurs : on garde ce qui est dans les deux). Intersection vide = **conflit de contexte** : on ignore les marqueurs et on retombe sur le moteur d'aujourd'hui (aucun risque d'inventer).
4. **Le reste** = les mots de la phrase hors marqueurs. Chaque article de la portée est noté sur le reste, avec `scoreLibelle` (déjà là : tous les mots du reste doivent se trouver dans le libellé, à une faute près, ×0,90) :

| Situation (constantes à ajouter dans `SEUILS`) | Score | Décision |
|---|---|---|
| Le **seul** article de la portée qui contient tout le reste (`contexteUnique`) | 0,80 | `proposer` avec **1 seul choix** : « C'est bien 1 × « Prise étanche 16 A » ? » |
| Plusieurs articles de la portée contiennent le reste (`contextePlusieurs`) | 0,65 chacun | `proposer`, 3 choix cités au plus |
| Le reste est vide et la cible est un **article choisi** par l'humain (`cibleAuChoix`) | 0,70 chacun | `proposer` entre ces articles (au plus 5 cités, la liste est courte par construction, 8 cibles au plus) |
| Le reste est vide et la cible est une **famille** (`familleSansReste`) | 0,60 chacun | `proposer` : la question dit « une prise parmi 12 » et cite 3 articles ; ou, si la phrase vient de plusieurs familles, la question demande la **famille** (voir ci-dessous) |
| Le reste ne trouve rien dans la portée | — | on retombe sur le moteur d'aujourd'hui (tout le catalogue) ; la question cite la famille (« je ne trouve pas « rouge » parmi les prises ») |

5. **Fusion** : les candidats du contexte s'ajoutent à ceux d'aujourd'hui (règle exacte, règle partielle, libellé) ; pour un même article on garde le **meilleur score** (`garder`, ligne 210). Une règle exacte à 1,00 l'emporte donc toujours.
6. **Aucun score du contexte n'atteint 0,85 : un mot à plusieurs cibles ne donne jamais `utiliser` tout seul.** Verrouillé par un test. **Décision prise seule** : au premier passage c'est une question oui/non à un seul choix ; pas de liste, et le bon article du premier coup. Le mot long « prise étanche » s'apprend ensuite par les confirmations habituelles (2 jours) et devient une règle à un article qui donne `utiliser` (question Q1).

**Scores et ordre.** Départage inchangé : score, libellé, identifiant. Les mots d'une famille ne sont pas classés par popularité (hors périmètre, voir « Plus tard »).

**Ambiguïté résiduelle (les trois sorties possibles).**
- *Un seul candidat net* → une question à un choix (oui/non).
- *Quelques candidats* (2 à 5) → la question en cite 3 et dit combien d'autres existent (« ou une des 4 autres prises »).
- *Une famille entière, ou plusieurs familles pour un même mot* (« tableau » désigne les familles « Tableaux électriques » et « Tableaux de communication », sans reste) → **`demander` avec `etape: 'famille'`** : la question nomme les **familles** (« Tu parles des tableaux électriques ou de communication ? »), pas leurs articles. L'assistant pose la question, puis **rappelle `rechercher_article_par_phrase` avec la phrase complétée** (« tableau électrique 2 rangées ») : aucun nouvel outil, aucune réponse spéciale à enregistrer pour une question de famille.

**Cas décrits.** « une prise étanche » : « prise » est marqueur (famille « Prises »), le reste « étanche » ne se trouve que dans la prise étanche → 1 choix. « étanche » seul : pas de marqueur (sauf si Jérôme en a créé un) → comportement d'aujourd'hui : plusieurs candidats (prise, interrupteur, boîte…) à 0,60, `proposer` à 3 choix alphabétiques et la question ne prétend pas qu'il n'y en a que 3 (`autres: N`). Si « étanche » est lui-même marqueur de deux familles, la question demande la famille. Deux familles qui partagent un mot : union, puis question de famille si le reste est vide, recherche dans l'union sinon. Une famille vide ou morte : sautée. Cible supprimée : sautée (section 2.2).

**Sortie ajoutée** (rien n'est retiré) : `portee: { marqueurs: ['prise'], cibles: [{ genre, id, libelle }], nombreArticles, reste: ['etanche'] }` (ou `null`), `etape: 'article' | 'famille'`, `choixFamilles: [{ id, chemin }]` (quand `etape` vaut `famille`), `autres: N` (candidats non cités), et de nouvelles valeurs de `pourquoi` : `contexte_unique`, `contexte_plusieurs`, `cible_au_choix`, `contexte_famille`. Jamais de prix d'achat ni de marge (le calcul passe par `prixVenteHT` comme aujourd'hui, test V6).

**Coût.** Une résolution de portée parcourt le catalogue une fois par marqueur : de l'ordre du millier d'articles, négligeable à côté de l'appel réseau (la lenteur est un point sensible, le serveur lit simplement un document de plus, en parallèle).

### 2.4 Apprentissage, validation humaine, trois états

- **Les mots à plusieurs cibles ou à famille sont créés par un humain, à l'écran, et seulement là.** Le serveur et l'assistant n'en créent jamais (donc **aucune règle des « 2 confirmations »** ne les concerne : ils naissent `active`, `validePar: 'humain'`, `revoirLe` à 6 mois, comme un mot ajouté à la main aujourd'hui). La règle des 2 confirmations sur 2 jours reste telle quelle pour les mots **appris**, qui ont toujours **une** cible article.
- **Une réponse de l'utilisateur ne modifie pas un mot à cibles multiples.** `enregistrerReponseVocabulaire` : si le mot trouvé pour la clé a des `cibles`, la réponse n'écrit rien et le dit (« Ce mot a plusieurs articles au choix : rien n'est appris »). Sans cette garde, l'écriture actuelle compterait un choix légitime parmi les cibles comme une **contradiction** (`existante.articleId !== articleId`, ligne ~755) et poserait une fausse suggestion.
- **La réponse à une question de contexte apprend la phrase entière.** L'utilisateur confirme « Prise étanche 16 A » pour « prise étanche » : le serveur recalcule, voit que l'article a été proposé (`propose`), crée la règle « prise etanche » → cet article, `a_confirmer`, puis `active` après 2 jours. C'est le chemin existant, inchangé : le marqueur « prise » n'est jamais modifié.
- **Trois états inchangés** : Proposé (`a_confirmer`), Validé (`active`), Désactivé (`desactivee`). La suggestion de la PR 427 (contradiction répétée d'un mot validé) ne concerne que les mots à un article, puisque les mots à cibles multiples ne donnent jamais `utiliser`. Désactiver un marqueur le retire de la recherche (jamais supprimé).
- **Plafonds** inchangés (500 actifs, 300 à confirmer). Un marqueur compte comme un mot actif.
- **Plus tard (hors périmètre)** : proposer à la revue « ces 4 mots appris pointent tous dans la famille Prises : créer le mot « prise » pour la famille ? » (une suggestion de la revue, PR 11 et suivantes) ; mémoriser quel article de l'« au choix » l'utilisateur prend le plus souvent pour le proposer en premier.

### 2.5 Règles Firestore (liste d'arrêt, deux fichiers)

Deux changements, **dans les deux fichiers** (`firestore.rules` bloc 118-141 et `firestore.plateforme.rules` bloc 127-150, même texte pour les deux fonctions) :

- `vocabulaireRevise` : ajouter `cibles` à la liste `hasOnly` (le navigateur peut changer `cibles`, `articleId` et `articleLibelle` ensemble), avec `cibles is list`, `cibles.size() <= 8` et, **pour chacune des 8 positions**, `cibleValide(c)` : `c is map`, `c.genre in ['article', 'famille']`, `c.id` texte de 1 à 100 caractères, `c.libelle` texte de 120 caractères au plus. Les règles n'ont pas de boucle : on écrit la fonction une fois et on l'appelle pour les positions 0 à 7 (`size() < n+1 || cibleValide(cibles[n])`). **Recommandation** plutôt que de ne contrôler que la taille.
- `vocabulaireManuelNeuf` : même contrôle à la création. **À noter** : la création n'a pas de liste blanche de champs aujourd'hui (elle interdit seulement quelques champs), donc un navigateur peut écrire un champ quelconque ; ce n'est pas nouveau, et c'est la base interne de l'utilisateur lui-même. La PR n'ajoute pas de liste blanche à la création (hors sujet, risque de casser l'écran) ; elle le note dans `docs/securite-et-pannes.md` (question Q4).
- **Le moteur reste tolérant** : une cible mal formée est ignorée, quoi que dise la base.
- `suggestion`, les compteurs, `origine`, `expression` et `exemples` restent réservés au serveur (inchangé). Pas de suppression (inchangé).
- **Tests à changer exprès** : `tests/devis-vocabulaire-regles.test.js` (regex du `hasOnly`) et `tests/devis-vocabulaire.test.js` (`CHAMPS_MODIFIABLES`, qui passe de 9 champs après la PR 430 à 10). **Publication** : Claude lance « Publier les règles (CRM de Jérôme) » après la fusion ; chez les clients, « Déploiement plateforme clients > regles » reste lancé par Jérôme.

### 2.6 L'écran

**Principe.** L'écran Vocabulaire (devenu « Ce que l'IA a appris » par la PR 11) garde sa forme. Le choix de ce que le mot désigne passe par un **sélecteur du catalogue** réutilisable (PR C1), puis il se généralise (PR C3b, C4b).

**Le sélecteur du catalogue** (nouveau fichier, `selecteur-catalogue.js`). Une fenêtre (plein écran sur téléphone, `consignes-ui.md`), avec :
- en haut, **la recherche qu'aime Jérôme**, dès 2-3 lettres (le champ actuel s'affiche dès la première lettre : on garde ce comportement), qui cherche les articles **et** les familles (deux groupes : « Familles », « Articles ») ;
- en dessous, **l'arbre** : famille › sous-famille › articles (deux niveaux de familles comme `bibliotheque.js` 36-47, l'arbre existant). Chaque famille se déplie ; une ligne famille a un bouton « Choisir cette famille » ; une ligne article est cochable ;
- un **mode** : `article` (un seul), `articles` (plusieurs), `mixte` (articles et familles). Les puces des choix faits sont sous la recherche (« Prise étanche × », « Famille Prises × ») ; maximum 8, au-delà la case est grisée avec le message « 8 au plus : retire-en un d'abord » (`aria-disabled`, jamais `disabled`) ;
- **un seul jaune plein par fenêtre** : « Enregistrer » grisé tant qu'il n'y a rien de choisi, jaune ensuite (règle de la création d'un mot).
- Un article désactivé ou de type texte n'est jamais choisissable ; une famille désactivée non plus (comme `groupesDeFamilles`).
- Le sélecteur sert d'abord à **choisir l'article d'un mot** (remplace `selecteurArticle`, création et « Changer l'article ») ; ensuite à plusieurs articles, puis aux familles.

**Colonnes et cartes.** La colonne « Article » devient « Désigne » : un article (lien vers le catalogue, comme aujourd'hui), « 3 articles au choix » (clic = déplie la liste), « Famille Prises (12 articles) », ou un mélange (« Famille Prises + 2 articles »). Pastilles : « Cible indisponible » (gris, toutes les cibles mortes), « Famille vide ». Le menu « … » : « Changer ce que le mot désigne » (remplace « Changer l'article » quand le mot a plusieurs cibles ; une entrée qui fait la même chose qu'un bouton visible n'existe pas).

**Cas vide** : catalogue vide dans le sélecteur → « Ton catalogue est vide : crée tes articles dans le catalogue » avec le lien (message de la bibliothèque). Famille sans article → « Aucun article dans cette famille. » (le même texte que la bibliothèque), et le bouton « Choisir cette famille » reste possible (la famille se remplira). Recherche sans résultat → « Aucun article ni famille ne correspond. »

**Cas d'erreur** : catalogue ou familles illisibles → « La liste n'a pas pu être mise à jour… » et « Réessayer » (jamais de déconnexion) ; écriture refusée → message sous le champ, valeur réelle gardée ; mot dont la cible vient d'être désactivée → pastille « Cible indisponible ».

**« Essayer une phrase »** affiche la portée comprise (« Je comprends : prise = famille Prises, et je cherche « étanche » dedans ») : même code que le serveur, rien n'est écrit.

**Ordinateur ET téléphone** : tout nouveau test d'écran se lance aussi avec `--project=telephone`; cartes de 44 px, fenêtres plein écran, tiroir refermé avant tout clic; captures dans les deux formats; `look-compact` lancé (du CSS est touché). Vocabulaire : « mot appris », « famille », « désigne » ; jamais « cible », « tag » ni « CRM » à l'écran.

**Export.** Le module a déjà son export : `devis_vocabulaire` est dans les `collections` du module (sauvegarde JSON), donc `cibles` y entre sans rien faire. Le CSV (`ENTETE_CSV`) garde « Article » (les articles désignés, séparés par « / ») et gagne une colonne « Famille » (les chemins), les tests du CSV changent exprès. Aucun nouveau bouton d'export n'est nécessaire (décision du 27/10/2026 respectée).

### 2.7 Outils MCP (aucun outil nouveau)

- **Compte d'outils inchangé** (`OUTILS_DEVIS.length` reste 25, `tests/mcp-clients.test.js` 1118, et le total). Aucune entrée à ajouter à `registre.js`.
- **`rechercher_article_par_phrase`** (`outils/lecture.js` 168-171) : le texte gagne trois phrases : « `portee` dit de quoi on parle ; quand `etape` vaut `famille`, pose la question puis rappelle cet outil avec la phrase complétée du mot de la famille choisie, sans appeler enregistrer_reponse_vocabulaire ; ne liste jamais les articles d'une famille si la décision est nette. » La **question est fabriquée par le serveur** (`formulerQuestion`) : l'assistant la redit telle quelle, c'est le motif existant, et l'intelligence reste de notre côté (décision du 30/10/2026 : jamais de texte à coller chez l'assistant).
- **`enregistrer_reponse_vocabulaire`** (`outils/ecriture.js` 177) : le texte ajoute : « un mot qui désigne plusieurs articles ou une famille ne s'apprend pas : la réponse n'écrit rien ».
- **`typeAffiche`** : les candidats de contexte passent par la même fonction que les autres (`rechercherArticleParPhrase`, 321-324) ; un ouvrage dans une famille s'affiche donc avec le mot du métier (« ensemble ») sans autre travail. Les libellés de `portee.cibles` n'ont pas de type : rien à afficher.
- **Lire les familles** : `rechercherArticleParPhrase` et `enregistrerReponseVocabulaire` lisent `devis_parametres/familles` en plus (`Promise.all`, comme `lireReglagesDevis`). Document absent = familles de départ.
- **`lister_articles` ne sait pas filtrer par famille** : si on veut que l'assistant puisse montrer « les prises » à la demande, on ajoute un paramètre `familleId` (`DA.filtrerArticles` le sait déjà). Ce n'est **pas** requis par la décision de Jérôme (la liste n'est pas une obligation) ; décision prise seule : **non** pour cette série, à rouvrir si le besoin se présente (Q5).

### 2.8 Parité `functions/` et `functions-plateforme/` (règle du 26/10/2026)

| Élément | Chez Jérôme | Chez les clients | Action |
|---|---|---|---|
| Moteur `vocabulaire.js` + import de `familles.js` | `functions/partage/devis-vocabulaire.js` | copie dans `functions-plateforme/serveur/partage/` | `scripts/preparer-fonctions.js` ligne 43 : ajouter `.replaceAll("from './familles.js'", "from './devis-familles.js'")`. **Sans cela l'import casse au chargement du serveur chez les clients et tous les outils tombent** : un test charge la copie préparée |
| `metier.js`, `lecture.js`, descriptions des deux outils | `functions/src/` | copiés par le script (dossiers `coeur`, `mcp`) | rien à brancher |
| Règles Firestore | `firestore.rules` | `firestore.plateforme.rules` | même texte, même PR, publication séparée (2.5) |
| Écran, sélecteur, CSS | `js/modules/devis/` | même code | rien (« même code chez Jérôme et chez les clients ») |
| Déploiement | automatique à la fusion | Jérôme lance `fonctions`, `mcp`, `hosting` ; « Actualiser les outils » dans ChatGPT | à écrire dans chaque PR de serveur |

Avant la prochaine démonstration chez un client : refaire le contrôle d'écarts (`docs/audit-ecarts-fonctions.md`).

## 3. Découpage en PR (dans l'ordre voulu par Jérôme)

**Toutes après** la PR 430 (7b) **et** l'écran de revue (PR 11 du cadrage devis fluide), parce qu'elles touchent les mêmes fichiers (`vocabulaire-ecran.js`, `vocabulaire-plans.js`, `devis-vocabulaire.spec.js`) et les mêmes règles. Le fichier du sélecteur (nouveau) pourrait s'écrire avant, mais son branchement dans l'écran se ferait deux fois : on attend. Tailles : **S** moins de 200 lignes, **M** 200 à 500, **L** plus de 500. Une PR à la fois, chacune fusionne d'abord `origin/main`.

| # | PR | Contenu | Taille | Fable | Liste d'arrêt |
|---|---|---|---|---|---|
| **C1** | Sélecteur d'arbre du catalogue | `selecteur-catalogue.js` (recherche + arbre, mode `article`), remplace `selecteurArticle` dans la création d'un mot et « Changer l'article » ; aucun changement de données ; e2e ordinateur et téléphone, captures, `look-compact` ; les tests e2e qui lisent `recherche-article` et `article-choisi` sont adaptés (`grep` dans `tests/e2e/`) | M | **Oui** (nouveau composant qui change la structure de deux formulaires) | non |
| **C2** | Règles : `cibles` | liste blanche + contrôle des 8 positions, **deux fichiers** ; tests `devis-vocabulaire-regles` et `CHAMPS_MODIFIABLES` changés exprès | S | **Oui** (règles) | **Oui** : une seule porte pour Jérôme ; publiée par Claude ensuite |
| **C3a** | Un mot, plusieurs articles au choix : moteur et serveur | `ciblesDe`, `cibleAuChoix`, jamais `utiliser`, garde de `enregistrerReponseVocabulaire`, textes des deux outils, V8 (imports) et tests de non-régression | M à L | **Oui** (serveur et moteur) | non (mais déploiement `fonctions` et `mcp` chez les clients par Jérôme) |
| **C3b** | Plusieurs articles : écran | sélecteur en mode `articles` (puces, 8 au plus), colonne « Désigne », « Changer ce que le mot désigne », CSV, « Essayer une phrase », cas vide et erreur ; e2e deux formats | M | **Oui** | non |
| **C4a** | Une famille et le contexte : moteur et serveur | `familles` dans `interpreter`, marqueurs, portée, `contexteUnique`, `etape: 'famille'`, lecture des familles côté serveur, copie `preparer-fonctions.js` + test de copie | L | **Oui** | non (déploiement par Jérôme) |
| **C4b** | Une famille : écran | sélecteur en mode `mixte` (« Choisir cette famille »), pastilles « Famille vide » et « Cible indisponible », « Essayer une phrase » avec la portée ; e2e deux formats | M | **Oui** | non |
| **C5** | Docs, version, wiki | la docs de chaque sujet va dans **sa PR de code** ; une seule PR finale pour la version et le wiki | S | non requise | non |

**Raisons.** C1 d'abord : Jérôme le veut en premier, il ne change aucune donnée et se juge à l'œil. C2 avant tout écrit de `cibles` : une règle manquante refuserait l'écriture de l'écran. C3 avant C4 : « plusieurs articles » est la moitié simple (pas de contexte, pas de familles) ; elle fixe le modèle et la garde de l'apprentissage. C4 apporte l'idée centrale. L'écran suit toujours le serveur (comme 7a puis 7b).

**Fichiers qui se touchent** : `vocabulaire-ecran.js`, `vocabulaire-plans.js`, `css/devis.css`, `tests/e2e/devis-vocabulaire.spec.js` (C1, C3b, C4b, et la PR 11) ; `vocabulaire.js` et `tests/devis-vocabulaire.test.js` (C3a, C4a, et V8) ; `firestore.rules`, `firestore.plateforme.rules` (C2 seulement) ; `metier.js` (C3a, C4a). Les PR de la série passent **l'une après l'autre**.

## 4. Tests à écrire

Procédure de `CLAUDE.md` : chaque point = une phrase observable, **un test dont le nom commence par son numéro**, une capture quand il y a un écran. Pendant le travail : `npm run test:module devis`, avant l'ouverture `test:rapide` et `test:smoke`.

| Numéro | Point | Où |
|---|---|---|
| **K1** | « une prise étanche » avec le marqueur « prise » (famille « Prises ») trouve la prise étanche, **une seule question à un choix, sans liste**, et jamais l'interrupteur étanche | `tests/devis-vocabulaire-cibles.test.js` (moteur pur) |
| **K2** | « étanche » seul, sans marqueur, reste ambigu : `proposer` à 3 choix et `autres` > 0 ; avec « étanche » marqueur de deux familles : `demander`, `etape: 'famille'`, les deux familles | idem |
| **K3** | deux familles qui partagent un mot : union ; avec un deuxième marqueur, intersection ; intersection vide = comportement d'aujourd'hui | idem |
| **K4** | famille vide, famille désactivée et cible supprimée : le mot est sauté, aucune exception, le moteur répond comme sans le mot | idem |
| **K5** | un article ajouté **après** dans la famille est trouvé sans toucher au mot ; un article désactivé n'est plus trouvé | idem |
| **K6** | un mot à plusieurs cibles ne donne jamais `utiliser`, même avec toutes les cibles à 1,00 | idem |
| **K7** | non-régression : le jeu d'essai V1 à V9 (25 articles, 10 mots, 65 phrases) rend les mêmes décisions et les mêmes candidats qu'avant la PR | `tests/devis-vocabulaire.test.js` |
| **K8** | `ciblesDe` : sans `cibles` = `articleId` ; `cibles` mal formée ignorée ; plus de 8 cibles tronquées ; un ancien moteur (simulé) saute un mot dont `articleId` vaut `''` | moteur |
| **K9** | « au choix » : l'utilisateur prend l'une des cibles → `enregistrer_reponse_vocabulaire` n'écrit rien, ne compte aucune contradiction, ne crée aucune suggestion | `tests/devis-vocabulaire-metier.test.js` |
| **K10** | confirmer l'article proposé pour « prise étanche » crée la règle « prise etanche » (une cible), le marqueur « prise » n'est pas modifié | idem |
| **K11** | la sortie ne contient jamais de prix d'achat ni de marge (test V6 étendu aux candidats de contexte) ; `typeAffiche` présent sur un ouvrage de la famille | `tests/devis-vocabulaire.test.js`, `tests/mcp-clients.test.js` |
| **K12** | règles Firestore : `cibles` acceptée jusqu'à 8, refusée à 9, refusée si un élément n'a pas `genre` valide ; `suggestion` reste refusée ; les deux fichiers | `tests/devis-vocabulaire-regles.test.js` |
| **K13** | copie préparée : `functions/partage/devis-vocabulaire.js` et la copie client se chargent (import de `devis-familles.js` résolu) | nouveau test de copie |
| **K14** | sélecteur : la recherche dès 2-3 lettres trouve articles et familles ; l'arbre se déplie ; 8 puces au plus ; catalogue vide ; famille vide ; **ordinateur ET téléphone**, capture de chaque | `tests/e2e/devis-vocabulaire-cibles.spec.js` (aussi `--project=telephone`) |
| **K15** | écran : créer un mot « prise » pour la famille « Prises », le retrouver dans la table avec « Famille Prises (N articles) » ; changer ce qu'il désigne ; CSV avec la colonne « Famille » ; « Essayer une phrase » affiche la portée | idem |
| **K16** | outils : le compte d'outils reste 25 dans `OUTILS_DEVIS` et le total n'a pas bougé ; les deux descriptions contiennent les nouvelles phrases | `tests/mcp-clients.test.js` |

Tests existants qui **changent exprès** : V8 (liste des imports du moteur), `CHAMPS_MODIFIABLES`, le `hasOnly` des règles, l'en-tête CSV, les sélecteurs e2e du champ de recherche d'article (C1). Aucun test supprimé ni désactivé.

## 5. Risques

1. **Un contexte trompeur** : « chemin de câble » avec le marqueur « câble » (famille « Câbles ») cherche « chemin » dans les câbles. Parade : si le reste ne trouve rien dans la portée, on retombe sur tout le catalogue (tableau de la section 2.3) ; test K3/K4.
2. **Déploiement mixte** (hosting, serveur de Jérôme, serveurs des clients à des moments différents) : parade `articleId: ''` pour les mots à plusieurs cibles (section 2.2) et ordre des fusions (C2 règles publiées avant C3b écran).
3. **Import cassé chez les clients** (`familles.js`) : parade K13.
4. **Trop de marqueurs** (Jérôme tague large, par exemple la famille « Fournitures » entière) : la portée est énorme, le reste est cherché dans tout. Ce n'est pas dangereux (rien n'est ajouté sans question), mais ça n'aide pas. Parade à l'écran : une famille de premier niveau affiche « 400 articles » et un message discret « Une famille plus précise donnera de meilleures réponses » (jamais un blocage).
5. **Lenteur** : une lecture de plus (familles) ; mesurée dans la PR C4a, sinon repli en cache.

## 6. Questions ouvertes pour Jérôme (au plus 5, avec ma recommandation)

- **Q1. Le bon article du premier coup : une question oui/non, ou ajout direct ?** Quand « prise » (famille) et « étanche » (reste) désignent un seul article, je propose une question à **un seul choix** (« C'est bien 1 × Prise étanche 16 A ? ») la première fois ; après 2 jours de oui, la phrase s'apprend et la ligne s'ajoute sans question. Ajouter la ligne directement dès le premier passage irait contre « jamais d'ajout d'une ligne que l'utilisateur n'a pas choisie » et contre le principe « rien n'est appliqué de façon cachée ». **Recommandation : une question à un choix** (un seul réglage `contexteUnique` à changer plus tard si tu veux plus d'automatisme).
- **Q2. Quand « étanche » désigne deux familles, qui tranche ?** Je pose la question **sur la famille** (« les prises ou les interrupteurs ? »), puis l'assistant refait la recherche avec la phrase complétée. **Recommandation : oui, c'est plus court qu'une liste d'articles.**
- **Q3. Un mot appris par l'assistant peut-il, un jour, devenir un marqueur ?** Aujourd'hui **non** : les marqueurs sont créés à l'écran, validés par toi. **Recommandation : non maintenant ; plus tard, une suggestion de la revue (« 4 mots pointent dans la famille Prises, créer « prise » ? »).**
- **Q4. Fixer une liste blanche de champs à la création d'un mot (règles Firestore) ?** Elle n'existe pas aujourd'hui (un navigateur peut écrire un champ quelconque dans sa propre base). **Recommandation : pas dans cette série** (risque de casser l'écran), notée dans `docs/securite-et-pannes.md`, à traiter dans une PR de règles à part si tu le veux.
- **Q5. L'assistant doit-il pouvoir lister les articles d'une famille à ta demande (« montre-moi les prises ») ?** Ça demande un filtre `familleId` dans `lister_articles`. **Recommandation : pas dans cette série** (la liste n'est pas une obligation) ; on l'ajoute dès que tu en as le besoin.

## Annexe. Relecture Fable

À remplir par la relecture (agent Fable, contre le code) avant « prête » : nombre de défauts trouvés et corrigés.
