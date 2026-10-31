# Cadrage : la revue mensuelle de l'apprentissage

Écrit le 31/10/2026 (**document de cadrage, aucun code, rien n'est lancé, aucune donnée touchée**). C'est la **suite** de `docs/cadrage-devis-fluide.md` : le bloc B (suite : la revue visible, section 4.4) et le bloc D (devis proches et ensembles, section 4.2). Il ne remplace pas ce document : il dit ce qui est livré depuis, ce qui reste, et dans quel ordre. Ce que j'ai choisi seul est marqué **Décision prise seule**. Exemples inventés, chiffrés à 100 €.

## 0. Le problème en 5 lignes

1. Le logiciel apprend : des **mots** (le client dit « prise », le dictionnaire apprend quel article), bientôt des **ensembles** d'articles qui reviennent, des **devis proches**.
2. **Principe central de Jérôme (29/10/2026)** : toute cette intelligence est **visible et modifiable par l'humain** lors d'une revue mensuelle avec son client ; **rien n'est appliqué en cachette**.
3. La revue dure environ **15 minutes** : un écran « 12 nouveautés à valider depuis le mois dernier ».
4. **Pas de « figer »** (jugé dangereux le 29/10/2026) : l'apprentissage ne modifie **jamais** ce qu'un humain a validé ; s'il voit une dérive, il crée une **suggestion**.
5. Trois états seulement : **Proposé**, **Validé**, **Désactivé**. L'assistant **dit** quand il s'appuie sur un motif appris (« comme tes derniers devis de salle de bain »).

**Exemple suivi dans tout le document.** Sur 8 devis de salle de bain finalisés dans les 12 derniers mois, 6 contiennent « receveur + bonde + joint » (vendus 100 € hors taxes les trois). Le calcul de nuit écrit un **ensemble Proposé**. À la revue, le client le **valide** et le renomme « Remplacement de receveur ». Au 9e devis de salle de bain, l'assistant dit : « Comme tes derniers devis de salle de bain, je propose receveur, bonde et joint (100 € hors taxes) ; ça te va ? » Six mois plus tard, sur ses 8 derniers devis contenant un de ces articles, 6 n'ont plus de joint : l'écran affiche **une suggestion de dérive** à côté de l'ensemble validé, qui, lui, **n'a pas bougé**.

## 1. Ce qui est livré (vérifié par `grep` le 31/10/2026)

| Morceau | Où | État |
|---|---|---|
| Écran « Vocabulaire » et ses états (À confirmer, Actif, Désactivé) | `js/modules/devis/vocabulaire-ecran.js` | livré |
| Validation humaine des mots : `valideLe`, `validePar` (`humain` ou `reponses`), `revoirLe` (6 mois) | moteur `js/modules/devis/vocabulaire.js:565-614` (copié vers le serveur par `scripts/preparer-fonctions.js`) (PR 427) ; plans `vocabulaire-plans.js:14, 132-135` ; mention « Validé par toi » / « Validé par tes réponses » à l'écran `vocabulaire-ecran.js:404-415` (PR 430) | livré |
| Suggestion de dérive d'un mot validé : à la 2e contradiction, le serveur écrit `suggestion` ; le mot validé ne bouge pas ; `suggestionTraiteeLe` écrit par le navigateur ; 3 jours de confirmation retirent la suggestion | `js/modules/devis/vocabulaire.js:45-46, 209-222, 584-607` ; `estATrancher` (`vocabulaire-plans.js:114`) ; ligne « L'assistant propose : … » `vocabulaire-ecran.js:347-351` | livré |
| Règles Firestore : champs de validation, `suggestion` interdite au navigateur, collection `devis_habitudes` en **lecture seule** pour les membres, écriture serveur seulement | `firestore.rules:109` et suivantes, `firestore.plateforme.rules` (PR 424) ; test `devis-vocabulaire-regles.test.js` (V4l) | livré (**la collection est vide**) |
| Requête bornée par date (prérequis du calcul des 12 mois) | `functions/src/coeur/donnees.js`, commentaire d'en-tête (PR 421) | livré |
| Mot du métier (réglage et écrans) | `ouvrages.js:21` (PR 422, 432) | livré |
| Compteur d'usage des articles | `coeur/usage-articles.js`, `devis_usage_articles` (lecture seule) | livré |
| Outils de modification sûre : par numéro, annulation, devis copié aux prix du jour | `modifier_lignes_devis`, `annuler_derniere_modification_devis`, `creer_devis_depuis_modele` (déclarés dans `functions/src/mcp/outils/ecriture.js` ; `index.js` ne fait que les lister comme destructifs) | livrés (à confirmer ligne à ligne dans `docs/reprise-prochaine-session.md`) |
| Dictionnaire à plusieurs articles et à familles | PR 452, 454, 455, 458 | livré |

## 2. Ce qu'il reste (rien de ceci n'existe dans le code)

| Manque | Preuve (`grep` sans résultat) |
|---|---|
| Le **calcul de nuit** des ensembles et la fonction planifiée | aucun code n'écrit `devis_habitudes` (seulement les règles et les tests de règles) |
| `trouver_devis_proches` (l'outil) et `suggestions` dans les réponses des outils | aucun résultat dans `functions/src` |
| `phrasePourquoi` : la phrase que l'assistant dit quand il se sert d'un motif | aucun résultat |
| La **revue** à l'écran : « n nouveautés à valider », bloc « À revoir » avec **Toujours bon**, bouton « Revue terminée » (`derniereRevueLe`) | aucun résultat dans `js/` ; `revoirLe` est posé mais jamais **affiché** ni comparé à la date du jour |
| Les blocs **ensembles** dans l'écran | l'écran ne lit que `devis_vocabulaire` |
| **Historique et retour en arrière** en un clic | `journal.js` : « aucun bouton de restauration ici » ; `restaurer_depuis_audit` défait une opération entière, pas un champ |
| **Exclure de l'apprentissage** (`devisEcartes`) | aucun résultat |
| La phrase « sur tes 8 derniers devis, 6 font autrement » pour un ensemble (dérive des ensembles) | aucun résultat |
| Le **verrou « rien de caché »** (un test qui garantit que tout motif donné à l'assistant est listé à l'écran) | à écrire avec les `suggestions` |

**Dit autrement** : pour les **mots**, la validation humaine et la dérive sont faites côté serveur et côté fiche ; il manque l'écran **de revue** (la vue d'ensemble mensuelle). Pour les **ensembles et les devis proches**, tout est à faire, **mais** les règles et la requête bornée par date sont déjà en place.

## 3. Conception de ce qui reste

### 3.1 Les trois états (déjà décidés, rappel)

| État | Sens | L'assistant | Dans le code des mots |
|---|---|---|---|
| **Proposé** | vu par l'apprentissage, jamais validé par un humain | n'en parle qu'en **demandant** | `a_confirmer` |
| **Validé** | validé par un humain (à la revue, à la main, ou par 2 confirmations sur 2 jours) | s'en sert **en le disant** | `active` |
| **Désactivé** | mis de côté, réactivable, **jamais supprimé** | n'en parle pas | `desactivee` |

Pour un ensemble : champs `statut` (`propose` / `valide` / `desactive`), mêmes noms que ceux déjà prévus dans `cadrage-devis-fluide.md`, section 4.4.

### 3.2 L'écran de revue

Le plus cohérent (déjà décidé) : l'écran « Vocabulaire » devient l'écran de revue, avec des **blocs repliables** (« Mots appris » = le tableau actuel, « Ensembles qui reviennent », plus tard « Consignes », voir `cadrage-consignes-stockees.md`) et **une phrase en tête** : « 12 nouveautés à valider depuis le mois dernier · 3 à revoir · 2 dérives » (zéros omis).
- **Nouveautés** : éléments Proposés apparus ou modifiés depuis `derniereRevueLe`, un réglage du module écrit par « Revue terminée » (journalisé).
- **Chaque ligne** dit pourquoi : « Proposé parce que 6 de tes 8 devis de salle de bain contiennent ces trois articles ensemble », avec les devis sources (5 au plus) et la date.
- **Actions** : Valider, Corriger (un mot), Renommer (un ensemble), Désactiver (avec « Annuler » 8 secondes), Réactiver, **Toujours bon**, Historique. **Pas de suppression, pas de « figer ».**
- **Date de revue à 6 mois** : `revoirLe` ; passée, l'élément passe dans « À revoir » ; « Toujours bon » la prolonge de 6 mois. Pas de rappel par e-mail (garantie « aucun e-mail ne part tout seul ») : le calcul se fait à l'ouverture de l'écran, en comparant la date du jour.
- **Export** (bouton du menu « … », règle du 27/10/2026) ; **téléphone** : cartes de 44 px, fenêtres plein écran ; **cas vide** et **cas d'erreur** comme dans le cadrage d'origine.

**Décision prise seule** : la première livraison de l'écran ne traite que les **mots** (« À revoir », « Toujours bon », « Revue terminée », phrase en tête). Elle n'a besoin ni de nouvelle règle ni du serveur (le navigateur peut déjà écrire `revoirLe` : `CHAMPS_MODIFIABLES`, `vocabulaire-plans.js:14`), et Jérôme voit la revue **tout de suite**, avant que les ensembles existent.

### 3.3 Détection de dérive

- **Mots** : déjà faite (la suggestion du serveur). La revue la **montre** dans « dérives ».
- **Ensembles** : le calcul de nuit compare un ensemble **validé** aux 8 derniers devis de la fenêtre qui contiennent au moins un de ses articles ; si 6 de ces 8 font autrement, il écrit seulement `derive` / `suggestion` sur le document, **jamais** l'ensemble lui-même. Message : « Cet ensemble date de mars ; sur tes 8 derniers devis, 6 font autrement. Le mettre à jour ? »
- **Seuil** (**Décision prise seule**, à ajuster sur de vraies données) : un ensemble est proposé s'il est dans au moins **3 devis** de la fenêtre de 12 mois **et** au moins **50 %** des devis où l'un de ses articles apparaît.

### 3.4 Historique et retour en arrière

Un nouveau bouton « Revenir à cette version » : il écrit un **nouveau patch** des seuls champs de la liste blanche (statut, nom, article d'un mot, validation) tiré de la copie « avant » du journal (`crm_audit_avant`), journalisé comme toute écriture d'écran. Rien n'est effacé (les journaux ne s'effacent jamais). **À vérifier en R2/R5** : `firestore.plateforme.rules` n'a aucun bloc `crm_audit_avant` (le joker des clients s'applique) ; la lecture de la copie « avant » par un éditeur chez les clients doit être confirmée par un test. Première version : filtrage en mémoire des pages du journal ; un index Firestore seulement si c'est trop lent (aucun fichier d'index n'existe aujourd'hui).

### 3.5 L'assistant le dit

- Chaque `suggestion` donnée à l'assistant porte `phrasePourquoi` (fabriquée par le serveur, pas par l'assistant).
- Consigne de départ (couche « Jérôme » de `cadrage-consignes-stockees.md`, annexe A de `cadrage-devis-fluide.md`, point 7) : « Quand tu utilises un motif appris, dis-le en une phrase avec `phrasePourquoi`. Un élément Proposé ne s'utilise qu'en demandant. »
- **Verrou « rien de caché »** : un test vérifie que tout élément présent dans un champ `suggestions` existe dans la collection lue par l'écran de revue ; et que la PR des suggestions arrive **après** celle de l'écran.

### 3.6 Données

- `devis_habitudes` : un document par ensemble (identifiant = clé triée des articles), écrit **par le serveur** par le moteur d'audit (une ligne de journal par changement, pas par nuit) ; champs humains (`nom`, `statut`, `valideLe`, `revoirLe`) écrits par l'écran. Les champs exacts sont en 4.4 de `cadrage-devis-fluide.md` ; **règle à vérifier avant la PR de l'écran** : le bloc `devis_habitudes` de `firestore.rules` est aujourd'hui `allow write: if false` (test V4l) ; pour que l'écran puisse nommer, valider et désactiver un ensemble, il faudra des règles à liste blanche, comme `devis_vocabulaire` (**PR de règles séparée, liste d'arrêt**).
- Aucune donnée existante de Jérôme n'est modifiée par les PR ci-dessous.

## 4. Risques

| Risque | Parade |
|---|---|
| Un apprentissage change un motif validé | aucune écriture serveur sur les champs humains ; test de non-régression sur `validePar: 'humain'` |
| Le client ne fait jamais la revue | la phrase en tête reste ; l'assistant ne se sert d'un motif Proposé qu'en demandant ; rien ne s'applique seul |
| Trop de nouveautés d'un coup | plafond de 30 ensembles (cadrage d'origine), tri par nombre de devis |
| Calcul de nuit lent ou coûteux | un parcours de la fenêtre de 12 mois, par client, écriture des seuls changements ; mesure sur le client démo. L'en-tête de `functions/src/coeur/donnees.js` dit qu'égalité + borne de date exige un index composite : aucun `firestore.indexes.json` n'existe ; le créer touche `firebase.json` (**liste d'arrêt**), à ajouter à R3 si la mesure l'exige |
| Chez les clients, la fonction planifiée manque | PR « chez Jérôme ET chez les clients » ; droit « Cloud Scheduler » à donner (liste d'arrêt) |
| Des données de client dans les docs | exemples inventés uniquement |
| L'écran de revue devient trop gros | un seul écran, blocs repliables, pas de sous-onglets (`docs/consignes-ui.md`) |

## 5. Découpage en PR (mises à jour de la section 5 de `cadrage-devis-fluide.md`)

Déjà fusionnées : 6 (règles, 424), 7 (validation humaine, 427 et 430), 8 et 9 (mot du métier, 422 et 432), 13 (requête bornée, 421).

| # | PR | Contenu | Taille | Fable | Liste d'arrêt |
|---|---|---|---|---|---|
| R1 | Revue des **mots** | écran : phrase en tête, « À revoir » + « Toujours bon » (écrit `revoirLe`), « Revue terminée » (`derniereRevueLe`), export ; e2e ordinateur et téléphone, captures | M | Oui (écran qui change de structure) | non |
| R2 | Règles de `devis_habitudes` | liste blanche des champs humains, création/suppression interdites au navigateur ; adapter V4l exprès | S | Oui | **Oui** (règles, deux fichiers) |
| R3 | Calcul de nuit (index éventuel : `firebase*.json`) | fonction planifiée, `devis_habitudes`, moteur d'audit, **nouveau** canal `nuit` à ajouter au moteur d'audit et au libellé du Journal (les canaux existants sont `mcp`, `porte`, `ecran`), branché chez Jérôme **et** chez les clients | L | Oui | **Oui** (déploiement `fonctions`, Cloud Scheduler) |
| R4 | Blocs « Ensembles » dans l'écran | lecture, valider/renommer/désactiver/réactiver, dérive affichée, « Exclure de l'apprentissage » | L | Oui | non |
| R5 | Historique et retour | « Revenir à cette version », par élément | M | Oui | non |
| R6 | Devis proches | `trouver_devis_proches` + `suggestions` + `phrasePourquoi`, après R4 et après la mesure de la ligne « Lenteur » | M | Oui | non |
| R7 | Consigne « dis-le » | livrée par le chantier « Consignes stockées » (pas en dur) ; c'est du texte du dépôt servi par le serveur : dépend de la PR 2 des consignes | S | **Oui** (serveur) | non |
| R8 | Docs, version, wiki | une seule PR de fin de session | S | non requise | non |

Ordre : **R1 d'abord** (Jérôme la voit tout de suite, sans serveur), puis R2, R3, R4, R5, R6.

## 6. Questions pour Jérôme (5)

1. **Commence-t-on par la revue des mots seulement (R1) ?** Recommandé : oui.
2. **Qui clique « Revue terminée » ?** Recommandé : toi, avec le client, à la fin des 15 minutes.
3. **Seuil des ensembles : 3 devis et 50 % ?** Recommandé : oui au départ, à ajuster sur de vrais devis.
4. **Garde-t-on « Exclure de l'apprentissage » (devis ignorés par le calcul) ?** Recommandé : oui, mais dans la PR R4 (pas avant).
5. **La revue couvre-t-elle aussi les consignes de l'assistant (`cadrage-consignes-stockees.md`) ?** Recommandé : oui, un bloc de plus dans le même écran, ajouté quand elles existeront.

## 7. Ce qui n'est PAS fait

Aucun écran de revue, aucun calcul de nuit, aucune écriture de `devis_habitudes`, aucune règle changée, aucun outil ajouté, aucun déploiement, aucune donnée lue ou écrite chez Jérôme ou un client. La répartition « livré / à faire » est vérifiée par recherche dans le code au 31/10/2026 ; le détail de chaque PR livrée reste dans `docs/reprise-prochaine-session.md`.
