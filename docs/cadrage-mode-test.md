# Cadrage : le « mode test » (02/11/2026)

**Statut : cadrage seulement, aucun code.** Demande de Jérôme du 02/11/2026 (« oui, avec le temps 2 inclus »). Les questions ouvertes sont tout en bas (section 14) : **rien n'est décidé tant que Jérôme n'a pas répondu**, surtout sur la suppression d'un devis de test déjà finalisé (section 8.3, contradiction).

## 1. Le problème, en simple

Jérôme fait beaucoup d'essais dans sa vraie base (personnes, organisations, affaires, devis). Ses clients feront pareil avec leur assistant (« crée-moi un client de test »). Deux dégâts :

1. **Les statistiques sont faussées** : un devis de test à 100 € HT compte dans le chiffre d'affaires, les étapes, les objectifs.
2. **Chaque devis de test finalisé consomme un vrai numéro** (le compteur `devis_compteurs/global` ne revient jamais en arrière et un devis finalisé ne se supprime jamais). Le premier vrai devis serait le n° 37 au lieu du n° 1.

## 2. Souhaits de Jérôme (repris tels quels)

1. Un **vrai repère « test »** (pas seulement du texte) sur personnes, organisations, affaires, devis, projets. L'écran écrit « [TEST] » devant le nom ; le préfixe s'ajoute tout seul à la création.
2. **Trois déclencheurs** : (a) l'assistant (MCP) : quand l'utilisateur dit « test », il marque l'élément ; la consigne vit **chez nous** (descriptions et réponses des outils ; jamais de texte à coller chez l'assistant, décision du 30/10/2026) ; (b) un interrupteur **« Mode test »** à l'écran, éteint par défaut, très visible quand il est allumé ; (c) **« Marquer comme test » / « Ce n'est plus un test »** dans le menu « … » de chaque élément (pour rattraper les tests existants).
3. **Toujours disponible pour tous, sans réglage d'activation** (même code chez Jérôme et chez les clients). Les éléments test sont **toujours exclus des statistiques**. Un filtre « masquer les tests » dans les listes : plus tard.
4. **Héritage** : un devis ou une affaire créés depuis un contact de test sont marqués test.
5. **Temps 2 inclus** : numérotation **séparée** des devis de test (`TEST-001`, compteur propre) pour que le premier vrai devis soit le n° 1 ; **suppression possible** des devis de test finalisés ; bouton **« Supprimer tous mes tests »** (aperçu, confirmation).
6. Les **données existantes de Jérôme ne sont jamais modifiées** par Claude sans son accord écrit : ce document décrit seulement le moyen (section 13).

## 3. Ce qui existe déjà (vérifié dans le code le 02/11/2026)

| Sujet | Où | Ce que ça fait |
|---|---|---|
| Numéro de devis | `functions/src/coeur/devis.js:154-176` (`finaliser`) | attribué à la **première finalisation**, dans la transaction, avec le compteur `devis_compteurs/global` (`ID_COMPTEUR`, `devis.js:26` ; collection `donnees.js:35`) ; une version 2 ou plus **garde le numéro de sa racine** |
| Format | `js/modules/devis/logique.js:530-534` (`numeroDevis`) | `DEV-AAAA-MM-JJ-NNN` ; refuse un compteur < 1 ; le préfixe `DEV-` est en dur ; plus de 60 fichiers de tests contiennent « DEV- » |
| Règles Firestore (Jérôme) | `firestore.rules:70-90` | brouillon neuf : `numero == null` ; un brouillon se modifie, un devis finalisé **jamais** depuis le navigateur ; `delete: if false` sur `devis_devis` ; `devis_compteurs` ni lu ni écrit |
| Règles Firestore (clients) | `firestore.plateforme.rules:77-97` | mêmes règles sous `clients/<client>/` |
| Suppression d'un devis | `functions/src/coeur/devis.js:293-299`, outil `supprimer_devis` (`functions/src/mcp/outils/suppression.js:32`) | **TOUS les statuts depuis le 04/11/2026** (avec toutes les versions) ; la copie « avant » reste dans `crm_audit_avant` |
| Qui peut écrire quoi | `firestore.rules:172-174` | personnes, organisations, affaires, projets : règle générique, écriture libre pour un compte autorisé. Un devis : oui tant que brouillon, **non une fois finalisé** (`devisBrouillonModifie`, l.75-78) |
| Aperçu puis code | `functions/src/securite/codes.js` | modèle de `supprimer_devis` et `finaliser_devis` ; plafond de suppressions par jour : `docs/securite-et-pannes.md:149`, aperçu puis code `:250` |
| Marqueur déjà existant | `scripts/plateforme/donnees-demo.js:7,36` : `donneesDemo: true` | sert au jeu de démonstration livré ; `--retirer` ne supprime que ces documents |
| Création d'un devis | **navigateur** : `js/modules/devis/actions-devis.js:114,146` → `D.creerBrouillon` (`donnees.js:299`, plan `brouillon.js:15`). Serveur : `creer_devis_brouillon` (`ecriture.js:184`), `creer_devis_depuis_modele` (208), `nouvelle_version_devis` (225) | il n'existe **pas** de fonction serveur « devis depuis une affaire » : le bouton « Nouveau devis » écrit depuis le navigateur |
| Recherche | `js/os/shell.js:267` (écran), outil `chercher` (`functions/src/mcp/outils/lecture.js:13`, personnes / organisations / affaires) | recherche par nom |
| Exports | `js/modules/{crm,devis,projets,automatisations,tableaudebord,veille}/export.js` (CRM : `export.js:7-11`, liste `js/os/registre.js:119`) | chaque module a son export |
| Préférences d'écran | `js/os/ui.js:292-295` : `localStorage`, clés `chevalier-os.*` | par navigateur, jamais côté serveur |

**Où le numéro se calcule (vérifié par la relecture du 02/11/2026)** : le fichier `functions-plateforme/serveur/partage/devis-numeros.js` existe (copie générée par `scripts/preparer-fonctions.js:46-49` et `104-107`, ignorée par git), mais c'est la copie de `js/modules/devis/numeros-lignes.js`, le résolveur « 1.2 » → ligne de devis : **rien à voir avec le numéro du devis**. `tests/devis-numeros.test.js` teste ce résolveur ; le vrai test du numéro est `tests/devis-logique.test.js`. Le numéro se calcule ainsi : chez Jérôme, `functions/src/coeur/devis.js` (`finaliser`) et `numeroDevis` dans `js/modules/devis/logique.js` (copié vers `functions/partage/devis.js`) ; chez les clients, `functions-plateforme/src/devis.js` (`devisFinaliser`, `avecBase` l.49) → `functions-plateforme/serveur/src/coeur/devis.js` (copie de `functions/src/coeur/devis.js`) → `functions-plateforme/serveur/partage/devis.js` (copie de `js/modules/devis/logique.js`). **Une seule source** : une modification, deux dossiers.

## 4. Modèle de données (recommandation)

### 4.1 Un champ, pas un préfixe dans le nom

- **Champ `test: true`** sur le document. **Absent = pas un test** (aucune migration : tout l'existant reste réel).
- Collections concernées : `crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_activites` (et notes), `projets_projets` (et tâches), `devis_devis`. Les activités, notes et tâches **héritent** du repère de leur parent à la création (elles ne s'affichent pas seules, mais elles servent aux comptages « À faire »).
- Le repère est écrit par l'écran ou le serveur dans le **même document**, donc dans l'audit (`crm_audit`, `crm_audit_avant`) comme tout autre champ.
- **Qui l'écrit** : voir section 5.

### 4.2 « [TEST] » : calculé à l'affichage, pas stocké dans le nom

| | Stocké dans le nom (« [TEST] Dupont ») | Calculé à l'affichage (recommandé) |
|---|---|---|
| Recherche « test » | trouve | **ne trouve pas, sauf si on cherche aussi le champ** → on le fait (voir 11) |
| Tri alphabétique | tous les tests se regroupent au « [ » | les tests restent à leur place dans l'alphabet |
| PDF du devis | `figerPourFinalisation` fige `clientNom` (`devis.js:171`) : le nom « [TEST] … » sort **sur le PDF** | le PDF porte le vrai nom de la fiche et le numéro `TEST-001` |
| E-mails (brouillon Gmail) | le « [TEST] » part dans l'objet et le texte | rien de plus que le numéro |
| « Ce n'est plus un test » | il faut réécrire le nom (risque d'écraser une modification faite entre-temps) | on écrit `test: false` (= réel, comme absent), le nom ne bouge pas |
| Un doublon de nom | deux fiches « Dupont » différentes par le préfixe | le badge « TEST » les distingue à l'écran |

**Recommandation : champ `test` + badge « [TEST] » calculé** (une petite fonction `libelleAvecTest(nom, test)` utilisée par tous les écrans), **et la recherche (écran et `chercher`) comprend le champ** : taper « test » ramène les éléments marqués. Le PDF d'un devis de test garde le vrai nom du client ; ce qui l'identifie est le numéro `TEST-…` (voir 11 pour un éventuel « DEVIS DE TEST » sur le PDF).

### 4.3 Valeur par défaut et règles Firestore

- Défaut : champ absent. Les règles actuelles laissent déjà écrire un champ libre sur personnes, organisations, affaires, projets (`firestore.rules:172-174`) et sur un **brouillon** de devis (`devisBrouillonModifie` n'interdit que `numero, racineId, version, statut, finaliseLe`). **Aucun changement de règle n'est nécessaire** pour le temps 1 : et un devis finalisé reste hors d'atteinte du navigateur, ce qui est le garde-fou voulu (section 8.2).
- Seule modification de règle envisagée (temps 2, **liste d'arrêt : PR à fusionner par Jérôme**) : aucune pour `devis_compteurs` (le compteur de test est un second document `devis_compteurs/test`, déjà couvert par `allow read, write: if false` de la ligne 88 et son équivalent `firestore.plateforme.rules`). À confirmer à l'écriture de la PR 3 ; si on peut s'en passer, on s'en passe.
- **Piège de rédaction** : une mise à jour qui enlève le champ (`setDoc` sans fusion) le ferait disparaître sans bruit. Les écritures du repère utilisent `updateDoc` ou la fusion.

## 5. Où le repère est posé

### 5.1 À l'écran

- **Création** : si l'interrupteur « Mode test » est allumé, tout ce qui est créé (personne, organisation, affaire, projet, devis, activité) reçoit `test: true`. Le bouton « Nouveau devis » de la fiche d'affaire appelle `D.creerBrouillon` depuis le navigateur : c'est là que le repère doit être posé (`actions-devis.js:114,146`).
- **Menu « … »** de chaque fiche : « Marquer comme test » / « Ce n'est plus un test » (écriture libre depuis le navigateur pour les fiches et les brouillons).
- **Devis finalisé** : le navigateur n'a pas le droit (règle `devisBrouillonModifie`). Le menu appelle une fonction du serveur (voir 5.3 et 8.2).

### 5.2 Par l'assistant (MCP)

- Paramètre optionnel **`test`** (booléen) sur : `creer_personne` (`ecriture.js:62`), `creer_organisation` (73), `creer_affaire` (82), `creer_projet` (102), `creer_projet_depuis_affaire` (107), `creer_devis_brouillon` (184), `creer_devis_depuis_modele` (208), `creer_activite` (277). `nouvelle_version_devis` (225) **hérite déjà** du repère de la version source sans rien coder : `nouvelleVersion` (`js/modules/devis/logique.js:1034-1046`) fait un `structuredClone` du devis et ne retire pas `test`. `creer_devis_depuis_modele` (208) **n'hérite pas** du repère du modèle (un modèle n'est pas un essai) : le devis reçoit le repère de son affaire ou de l'interrupteur, comme tout nouveau devis.
- Deux **nouveaux outils** : `marquer_test` et `demarquer_test` (une personne, une organisation, une affaire, un projet, un devis ; aperçu puis code seulement pour un devis finalisé, voir 8.2).
- **La consigne vit chez nous** : (1) la description du paramètre `test` dit « mets `true` si l'utilisateur parle d'un test, d'un essai, d'une démo ; sinon n'envoie rien ; ne devine jamais » ; (2) la **réponse** de chaque création rappelle `test: true/false` et, si le nom contient « test » alors que le repère n'est pas posé, ajoute une ligne : « Le nom contient "test" : appelle `marquer_test` si c'est un essai. » (un conseil, jamais une pose automatique) ; (3) les futures « Consignes stockées » (`docs/cadrage-consignes-stockees.md`) pourront reprendre ce texte. **Rien à coller chez ChatGPT ou Claude.**
- `lister_*` et `chercher` : chaque résultat porte `test: true` quand il est posé ; un paramètre `tests` (`inclure` par défaut, `exclure`, `seulement`) les filtre. Par défaut on inclut : l'utilisateur doit pouvoir dire « montre-moi mon client de test ».

### 5.3 Côté serveur

- Un **cœur commun** (fonctions `marquerTest` / `demarquerTest`) dans `functions/src/coeur/` : écrit le champ, écrit la ligne d'audit, et pour un devis applique les garde-fous de la section 8.2. L'écran (fonction appelable) et l'outil MCP appellent **le même cœur** (règle « une fonction du serveur existe aux deux endroits », section 9).

### 5.4 Héritage

À la **création** seulement (pas de recopie en cascade après coup) :

- affaire créée depuis (ou liée à) une personne / organisation de test → test ; devis créé sur une affaire de test → test ; projet créé depuis une affaire de test → test ; activité ou note sur un élément de test → test ;
- **à la finalisation, le serveur revérifie** : un devis dont l'affaire ou la fiche client est de test devient un devis de test (il ne doit **jamais** consommer un vrai numéro pour un client de test). L'aperçu de `finaliser_devis` et l'écran le disent clairement : « Ce devis est un devis de test : numéro `TEST-001`, il pourra être supprimé. »
- Le cas inverse (devis de test sur une affaire réelle) est permis : il ne compte pas dans le montant de l'affaire (voir 7).

### 5.5 Projets

Le repère est posé sur les projets exactement comme sur les affaires (même règle générique), et les projets de test sortent du chiffre d'affaires (`caParMois`, défini `logique.js:1801`, lit les projets ; l'appel est `accueil.js:192`). **À confirmer par Jérôme** (question 7).

## 6. Interrupteur « Mode test » à l'écran

- **Où** : une entrée du **menu Jérôme** (le menu du bas, `js/os/shell.js`), juste après la bascule de thème ; cliquer bascule le mode et le menu reste ouvert (`role="menuitemcheckbox"`, `aria-checked`). *(Déplacée le 05/11/2026 : c'était d'abord un bouton en bas du menu latéral.)* Accessible sur toutes les pages ordinateur et dans le tiroir du téléphone. *(Correction du 02/11/2026 : le cadrage disait « barre du haut », ce qui est faux dans le code : `.barre-haut` est cachée sur ordinateur et `.barre-outils` l'est sur téléphone et sur Réglages, Veille, Automatisations, journal.)* Ce n'est pas une entrée `menu-entree`.
- **Mémoire** : `localStorage`, clé `chevalier-os.modeTest` (`js/os/ui.js:292-295`), donc **par navigateur**, comme les autres préférences. Éteint par défaut. Un navigateur neuf ou qui a perdu son stockage retombe sur éteint (le plus sûr).
- **Très visible** quand il est allumé : un **bandeau orange sur toute la largeur** « MODE TEST : ce que tu crées ici est marqué test et n'entre pas dans les statistiques », et un liseré orange autour de la page. Il se voit sur téléphone aussi.
- **Ce que l'assistant en sait** : **rien**. Il ne voit jamais l'écran. Le mode ne concerne que ce qui est créé à l'écran ; l'assistant marque un test parce que l'utilisateur le dit (section 5.2). Raison : un interrupteur resté allumé sur un ordinateur ne doit pas rendre « test » ce que l'assistant crée pour de vrai ailleurs, et inversement. Alternative écartée : un réglage serveur « mode test » par utilisateur que `qui_suis_je` rendrait (question 3).

## 7. Statistiques : tableau complet

Règle commune : **un élément test n'entre dans aucun chiffre**. Une fonction `sansTests(liste)` (dans `js/modules/crm/logique.js`, copiée au serveur par `preparer-fonctions.js`) est appliquée **à l'entrée de chaque calcul**, pas à l'affichage (sinon un chiffre oublié reste faux).

| Chiffre | Où (fichier:ligne) | Règle |
|---|---|---|
| Affaires par étape (Accueil) | `js/modules/crm/accueil.js:187-190`, `compterParEtape` `js/modules/crm/logique.js:1780` | les affaires de test ne comptent pas |
| Chiffre d'affaires encaissé par mois (Accueil, avec `suiviPaiements`) | `accueil.js:192-206`, `caParMois` (affaires **et** projets, `accueil.js:192`) | affaires et projets de test exclus |
| Objectifs et célébration du CA | `logique.js:1620-1775` | exclus (sinon un objectif est « atteint » par un essai) |
| Bloc « À faire » (`pointsCles`) | `logique.js:1458` | **ne change pas** : c'est une liste d'actions, pas une statistique ; l'élément de test s'y affiche avec son badge « [TEST] » pour qu'on puisse le travailler |
| Montant d'une affaire | `montantDesDevis` `js/modules/devis/logique.js:596` ; outil `recalculer_montants_affaires` (`ecriture.js:263`, cœur `functions/src/coeur/metier.js:1513-1541`) | un devis compte dans le montant de son affaire **seulement si son repère est le même que celui de l'affaire** : devis de test sur affaire de test = montant visible pour tester ; devis de test sur affaire réelle = ignoré |
| Usage des articles | `functions/src/coeur/usage-articles.js:6-8` ; outil `recalculer_usage_articles` (`ecriture.js:268`) | ajouter à la liste des règles de comptage : « **jamais un devis de test** » (même fonction pour la finalisation et pour le recalcul) |
| Liste des devis et pastilles de nombre | module Devis (listes, pastille « Devis ») | les devis de test restent dans la liste (avec leur badge) mais n'entrent pas dans les nombres des pastilles ni dans les totaux. `peutArchiver` (`logique.js:565`) ne change pas : un devis de test s'archive comme les autres |
| Tableau de bord, Veille, Automatisations | `js/modules/tableaudebord/`, `veille/`, `automatisations/` | **à repérer par `grep` au début de la PR 1b** : tout calcul qui lit affaires, projets, devis ou personnes applique `sansTests` ; le résultat du `grep` est écrit dans la PR |
| Exports | `export.js` de chaque module | les tests sont **inclus**, avec une colonne/un champ `test` visible (on exporte « mes données » ; question 4) |
| Recherche globale | `js/os/shell.js:267` ; outil `chercher` (`lecture.js:13`) | les tests sont trouvés (par le nom ou par le mot « test ») et affichent leur badge |
| Compteur global des numéros | `devis_compteurs/global` | ne bouge **jamais** pour un devis de test (voir 8.1) |

## 8. Temps 2 : numérotation séparée et suppression des devis de test

### 8.1 Numérotation

- Un **second document de compteur** `devis_compteurs/test` et une **fonction distincte `numeroDevisTest(compteur)`** → `TEST-001` (3 chiffres au moins, sans date). On ne touche **pas** à `numeroDevis` ni au compteur `global` : le test C2 (10 finalisations simultanées, `tests/devis-serveur-firestore.test.js:54-60`), `tests/devis-logique.test.js` et les plus de 60 fichiers de tests qui contiennent « DEV- » restent verts sans changement.
- Dans `finaliser` (`functions/src/coeur/devis.js:154-176`), **le serveur seul décide** si le devis est un devis de test :
  - version 1 (pas de numéro) : test si `devis.test === true`, ou si l'affaire ou la fiche client est de test (5.4) ; si oui, compteur `test` et `numeroDevisTest` ; sinon, compteur `global` comme aujourd'hui ;
  - version 2 ou plus (la racine a déjà un numéro) : le numéro **ne change pas** et le statut test est celui du **préfixe du numéro** (`TEST-` = test, `DEV-` = réel), quel que soit le champ du brouillon (que le navigateur peut modifier). Un brouillon marqué test sur une racine `DEV-` est donc remis réel à la finalisation, et un brouillon « réel » sur une racine `TEST-` reste test.
- Le serveur écrit alors `test: true` ou `test: false` explicite sur le devis finalisé.
- Ce qui peut encore lire `DEV-` : `functions/src/devis/stockage.js:20,39` (nom du PDF « DEV-… v2 – Objet.pdf »), les textes de `js/modules/crm/logique.js:617-618` et `js/modules/devis/onglet-affaire-logique.js:21`. Ce sont des exemples ou des noms construits à partir du numéro : `TEST-…` y passe sans changement ; **à vérifier par `grep` au début de la PR 3**.

### 8.2 Sécurité : un devis réel ne peut jamais être supprimé

C'est le point le plus important. Le garde-fou, en trois verrous :

1. **Le numéro `TEST-` est donné par le serveur, une seule fois, à la première finalisation, et seulement si le repère existait avant.** Ensuite il ne change plus (comme `numero` aujourd'hui : le navigateur ne peut plus écrire un devis finalisé).
2. **La suppression d'un devis finalisé n'est acceptée que si son numéro commence par `TEST-`** (et que `test === true`). Un devis `DEV-` ne se supprime jamais, quel que soit son champ `test`. On ne peut donc pas « rendre un vrai devis supprimable en le déclarant test après coup » : le préfixe ne se réécrit pas.
3. **Test → réel interdit après finalisation** pour un numéro `TEST-` (« démarquer » est refusé : le numéro dirait le contraire). Pour garder ce devis, on crée un **nouveau devis** ; `nouvelle_version_devis` d'un devis de test **hérite** du repère et garde son numéro `TEST-`.

4. **(si question 6 = non) Pas de restauration d'un devis `TEST-` supprimé** : `restaurer_depuis_audit` refuse explicitement une ligne d'audit d'action `supprimer` sur `devis_devis` dont le `numero` est non nul (aujourd'hui `restaurer.js:53-55` ne refuse que si le devis courant existe et n'est plus brouillon).

Pour un brouillon, rien ne change : on bascule librement test / réel, il n'a pas de numéro.

**Précision sur « Ce n'est plus un test »** : le verrou 3 ne concerne que les `TEST-`. Pour un devis `DEV-` marqué test après coup (question 5), « Ce n'est plus un test » reste **permis** (il n'a jamais pu être supprimé). Conséquences, à dire à Jérôme : un essai à 100 € HT finalisé sous `DEV-…-007` marqué test **sort** du montant de son affaire (`montantDesDevis` l'exclut quand les repères diffèrent) et **retire 1** à l'usage de chaque article qu'il contient (`recalculer_usage_articles`) ; le démarquer fait l'inverse, le chiffre d'affaires de 100 € HT revient.

Le seul moyen d'obtenir un devis supprimable est donc de le déclarer test **avant** sa finalisation, ce qui lui donne un numéro `TEST-`, jamais un vrai. L'aperçu de `finaliser_devis` écrit « devis de test, numéro TEST-001, supprimable » pour qu'on le sache au moment de finaliser. Reste le risque humain (un devis déclaré test par erreur puis envoyé à un vrai client) : voir les risques, section 12.

### 8.3 Contradiction avec une décision écrite : à dire explicitement

> **MISE À JOUR du 04/11/2026 : cette question est tranchée par Jérôme, tout devis (même `DEV-`) se supprime à tous ses statuts** (`docs/cadrage-devis.md`, D18bis). La suppression spéciale des devis `TEST-` n'est plus nécessaire ; la numérotation `TEST-` séparée reste utile. Ce qui suit est l'ancien raisonnement, gardé pour mémoire.
>
> **Supprimer un devis de test FINALISÉ contredisait une décision écrite (avant le 04/11/2026)** : `docs/cadrage-devis.md` (« Les versions restent visibles, jamais supprimées », remplacé), `functions/src/coeur/devis.js` (`supprimer` : « Seul un brouillon peut être supprimé », remplacé) et `firestore.rules:84` (`delete: if false`). **Ce n'est pas à Claude de trancher.** Question 1 ci-dessous, avec la recommandation : **oui, pour les seuls devis dont le numéro est `TEST-`**, par une fonction du serveur uniquement ; la règle Firestore reste `delete: if false` (le navigateur ne supprime toujours rien) et `supprimer_devis` garde son message pour les `DEV-`.

Si Jérôme dit non : le temps 2 est réduit à la seule numérotation séparée (les devis `TEST-` restent, mais n'abîment plus la suite des vrais numéros ni les statistiques).

### 8.4 Le compteur de test se remet-il à zéro ?

Le compteur global ne revient jamais en arrière pour qu'un numéro ne soit **jamais donné deux fois**. Pour `TEST-`, un numéro en double serait sans gravité (jamais envoyé à un vrai client, et tous les devis de test sont supprimés d'un coup). **Recommandation : « Supprimer tous mes tests » remet le compteur de test à 0 quand plus aucun devis `TEST-` n'existe.** Question 2.

## 9. « Supprimer tous mes tests »

- Une action de **Réglages > Mes tests** (aussi un outil MCP `supprimer_tous_les_tests`). **Aperçu d'abord** : la liste chiffrée (« 3 personnes, 2 organisations, 4 affaires, 5 devis, 1 projet ») et les noms ; rien n'est écrit.
- **Code à usage unique** (`functions/src/securite/codes.js`, même modèle que `supprimer_devis` : lié au jeton, à l'action et à l'**empreinte de la liste**, 5 minutes, une seule fois). Si la liste change entre l'aperçu et la confirmation, le code ne vaut plus.
- **Plafond quotidien** de suppressions respecté (`docs/securite-et-pannes.md:149`, plafond de suppressions par jour ; aperçu puis code : `:250`) : au-delà, le travail se fait en plusieurs fois, et l'aperçu le dit.
- **Ne supprime que** les documents dont le repère `test` est posé ; pour un **devis**, seulement si son numéro est `TEST-` **ou nul** (brouillon). Un devis `DEV-` marqué test (voir question 5) n'est **jamais** supprimé.
- Ordre : devis, puis activités et notes, puis affaires et projets, puis personnes et organisations. Chaque suppression passe par les fonctions de suppression existantes de chaque type (règles de cascade inchangées : `functions/src/coeur/metier.js:609-614` pour une affaire ne touche aucun devis, d'où l'ordre).
- **Supprimer une affaire ne touche aucun devis** (`planSupprimerAffaire`, `js/modules/crm/logique.js:2265`, et `functions/src/coeur/metier.js:609-614` ; aucun refus pour une affaire qui a des devis). Le cas « affaire de test avec un vrai devis `DEV-` » apparaît donc dans l'aperçu « reliés à un test, non supprimés » : l'affaire part, le devis `DEV-` reste (sans affaire), et l'aperçu le dit avant le code.
- Un élément **non marqué** relié à un élément de test (par exemple une vraie note sur une personne de test) n'est pas supprimé tout seul : l'aperçu l'affiche dans une section « reliés à un test, non supprimés ».
- Le **journal** garde tout (`crm_audit`, `crm_audit_avant`), sans durée de vie : décision RGPD du 04/10/2026, rien à changer. Une suppression de test reste donc **restaurable** par `restaurer_depuis_audit` pour tout sauf un devis finalisé `TEST-`. **Attention (relecture)** : `functions/src/coeur/restaurer.js:53-55` ne refuse que si le devis courant existe ET n'est plus un brouillon ; un devis supprimé n'a plus de document courant, donc `restaurer_depuis_audit` recréerait un `TEST-` finalisé AVEC son numéro. Si Jérôme répond « non » à la question 6, il faut un **refus explicite** (4e verrou, voir 8.2).

## 10. Chez les clients

- Règle du 26/10/2026 : **tout ce qu'on ajoute dans `functions/` existe dans la même PR dans `functions-plateforme/`** (le script `scripts/preparer-fonctions.js` copie le code commun). Donc : cœur `marquerTest`, finalisation avec compteur de test, suppression des devis `TEST-`, outils MCP, fonction appelable de l'écran, **tous aux deux endroits**.
- Tout est écrit sous `clients/<client>/` (`functions-plateforme/src/devis.js:8,49`, `avecBase`) : le compteur de test d'un client est `clients/<client>/devis_compteurs/test`. Le client A n'atteint jamais le compteur du client B.
- Les règles `firestore.plateforme.rules:77-97` ont les mêmes lignes que celles de Jérôme et se traitent ensemble.
- **Même code chez Jérôme et chez les clients** (18/10/2026) : pas de réglage d'activation, pas de section « client seulement ».
- **Déploiement par éléments** : serveur MCP (`mcp`) **avant** le site (`hosting`), jamais le contraire (sinon l'écran appelle une fonction qui n'existe pas encore). Le déploiement de la plateforme clients reste lancé par Jérôme.
- Un contrôle des écarts entre `functions/` et `functions-plateforme/` se refait avant la démonstration.
- Les règles Firestore sont publiées par Claude (27/10/2026), jamais sans PR fusionnée et « Tests » vert.

## 11. Collisions de concept (section demandée)

| Collision | Constat | Recommandation |
|---|---|---|
| `donneesDemo: true` (jeu de démonstration, `donnees-demo.js:7,36`) | deux idées proches : « livré par Jérôme pour une démo » et « essai de l'utilisateur » | **champ distinct `test`**. `--retirer` ne doit pas supprimer les essais d'un client, et « Supprimer tous mes tests » ne doit pas supprimer une démo livrée. Un document peut avoir les deux. |
| Recherche | le « [TEST] » calculé n'est pas dans le nom | la recherche lit aussi le champ (4.2) |
| Exports | `export.js` de chaque module sort tout | inclus, avec le champ visible (question 4) |
| PDF et e-mails | un devis de test peut être mis en page et un brouillon Gmail créé | le PDF porte le vrai nom du client et le numéro `TEST-…` ; **hors périmètre** : un filigrane « DEVIS DE TEST » (n8n reçoit `test: true` dans le JSON « vue client » si Jérôme le veut, question 8) |
| `restaurer_depuis_audit` | restaure d'après le journal | un devis de test finalisé supprimé a sa copie « avant » ; voir question 6 |
| « À faire » (`pointsCles`) | n'est pas une statistique | les tests y restent (7) |

## 12. Découpage en PR

Une PR = un sujet, fusionnée dans la journée. **Huit PR** (1a-1, 1a-2a, 1a-2b-1, 1a-2b-2, 1b, 2, 3, 4 : la 1a était trop grosse, Fable l'a fait couper en deux le 02/11/2026, puis la 1a-2 en deux, puis la 1a-2b en deux). Toutes avec **relecture Fable obligatoire** (données, serveur, règles, statistiques). Chaque nouveau test d'écran se lance aussi en format téléphone (`--project=telephone`). Chaque PR vérifie `grep` dans `tests/e2e/` des sélecteurs et listes qu'elle change.

| # | Sujet | Contenu | Dépend de | Liste d'arrêt ? |
|---|---|---|---|---|
| 1a-1 | **Repère + badge + menus** | champ `test` accepté par les constructeurs de documents, `libelleAvecTest` (badge « [TEST] » séparé du titre), menu « … » (Marquer comme test / Ce n'est plus un test) sur les fiches, listes, cartes et brouillons de devis ; devis finalisé : entrée grisée | rien | non (écran ; aucune donnée existante modifiée) |
| 1a-2a | **Interrupteur + bandeau + pose à la création** | interrupteur dans le menu latéral, bandeau orange, `avecModeTest` dans les 9 fonctions de création des couches `donnees.js` | 1a-1 | non |
| 1a-2b-1 | **Héritage à la création** | `heriterTest(valeurs, { personne, organisation, affaire, projet })` (crm/logique.js, copiée au serveur) : une fiche créée à côté d'un élément de test reçoit `test: true` (jamais `test: false`, jamais de cascade après coup) ; durcissement des tests de la 1a-2a | 1a-2a | non |
| 1a-2b-2 | **Retouches de la coque** | interrupteur déplacé dans le menu utilisateur + désabonnement (`aria-label` et stockage bloqué déjà faits) | 1a-2a | non |
| 1b | **Statistiques + recherche + exports** | `sansTests` appliqué à tous les chiffres du tableau 7 (avec le `grep` des modules Tableau de bord, Veille, Automatisations), recherche par le mot « test », export avec colonne test | 1a-2b-1 | non |
| 2 | **Outils MCP + consigne côté serveur** (**FAITE le 05/11/2026**, voir le journal ; avec les exclusions de `recalculer_*`) | paramètre `test` sur les 8 outils de création, `nouvelle_version_devis` hérite, **hérite déjà pour `creer_affaire`, `creer_projet_depuis_affaire`, `ajouter_livrable_projet`, `creer_devis_brouillon` et `creer_devis_depuis_modele` dès la 1a-2b-1** (le serveur appelle les plans purs avec les parents) ; la PR 2 complète `creer_personne`, `creer_projet` (plan sans parents), `creer_activite` et `ajouter_note` avec `heriterTest`, `marquer_test` / `demarquer_test` (cœur commun), filtre `tests` sur `lister_*` et `chercher`, `recalculer_*` excluent les tests, réponses avec conseil « le nom contient test » ; **aux deux endroits** (`functions-plateforme/`) | PR 1a-2b-1 et 1b | non |
| 3 | **Numérotation séparée + suppression des devis de test** | `numeroDevisTest`, compteur `devis_compteurs/test`, `finaliser` (8.1), garde-fou du préfixe (8.2), `supprimer` accepte un devis finalisé `TEST-` (seulement si la question 1 est « oui »), aperçu de `finaliser_devis`, règles si nécessaire ; **aux deux endroits** | PR 2 (cœur de marquage) | **oui si une règle Firestore change** : PR laissée ouverte, verte, étiquette `a-fusionner-par-jerome`, 5 vérifications à l'écran dans la description |
| 4 | **« Supprimer tous mes tests »** | écran Réglages > Mes tests, outil MCP, aperçu puis code, plafond, ordre de suppression, remise à zéro du compteur de test (si question 2 = oui) ; **aux deux endroits** | PR 3 | non (le code est fusionné ; l'usage sur les données de Jérôme demande son accord) |

Ce qui n'est **pas** fait dans ce chantier : filtre « masquer les tests » dans les listes (plus tard), filigrane « DEVIS DE TEST » sur le PDF, réglage serveur « mode test » pour l'assistant, marquage automatique par mot dans le nom, tout marquage des données existantes de Jérôme.

### Tests à écrire

- **Repère** : `test` absent = réel ; le badge s'affiche et la recherche « test » le trouve ; l'interrupteur allumé marque une personne, une affaire, un devis, un projet créés ; éteint, aucune pose ; téléphone aussi.
- **Héritage** : affaire depuis une personne de test = test ; devis sur une affaire de test = test ; à la finalisation, le serveur rend test un devis dont la fiche est de test.
- **Statistiques** : une ligne de test par chiffre du tableau 7 (étapes, CA, objectifs, montant d'affaire, usage des articles) : le chiffre ne bouge pas quand on ajoute un test à 100 € HT.
- **Numérotation** : 1re finalisation d'un devis de test = `TEST-001`, la suivante `TEST-002`, `devis_compteurs/global` **inchangé** ; un vrai devis juste après = `DEV-…-001` (et non 003) ; 10 finalisations de test simultanées sans doublon (sur le modèle du test C2) ; version 2 d'un devis de test garde `TEST-001`.
- **Sécurité (les plus importants)** : suppression d'un devis `DEV-` finalisé **refusée** même si on lui pose `test: true` après coup ; démarquer un devis `TEST-` finalisé refusé ; le navigateur ne peut pas écrire `test` sur un devis finalisé ; un brouillon `test:true` sur racine `DEV-` est finalisé en `DEV-` réel ; `supprimer_devis` d'un `TEST-` exige l'aperçu puis le code ; `restaurer_depuis_audit` refuse de recréer un devis `TEST-` supprimé (si question 6 = non) ; une affaire de test avec un devis `DEV-` apparaît dans « reliés, non supprimés ».
- **Supprimer tous mes tests** : l'aperçu ne supprime rien ; le code change si la liste change ; plafond respecté ; un devis `DEV-` marqué test n'est jamais supprimé ; élément non marqué relié à un test conservé et listé ; audit conservé.
- **Clients** : mêmes tests dans `functions-plateforme/`, un client ne touche pas le compteur de l'autre.

### Risques

1. **Un devis déclaré test par erreur, puis envoyé à un vrai client** : il porterait un numéro `TEST-` et serait supprimable. Parades : aperçu de finalisation très clair, badge « [TEST] » visible dans l'éditeur, option d'un filigrane plus tard.
2. **Un chiffre oublié dans les statistiques** : d'où `sansTests` à l'entrée des calculs et le `grep` de la PR 1b.
3. **Un interrupteur resté allumé** : le bandeau orange est là pour ça ; il retombe sur éteint dans un navigateur neuf.
4. **Tests de verrouillage existants** qui listent des collections, des champs ou des outils (C19, `parcours`, `devis-barre-globale`, `devis-document`) : à relancer avant l'ouverture de chaque PR (leçon du 29/10/2026) ; les compteurs d'outils MCP se recomptent en lançant les tests.
5. **Un `setDoc` sans fusion** qui efface le repère (4.3).
6. **Dérive de la PR 3 laissée ouverte** (règles) : vérifier `mergeable` avant de dire « prête ».

## 13. Les données existantes de Jérôme

- Rien à migrer : le champ est absent, tout l'existant est réel.
- **Claude ne marque aucun test existant sans l'accord écrit de Jérôme dans la session.** Les moyens, une fois les PR 1a et 2 fusionnées : (a) **un par un**, Jérôme clique « Marquer comme test » dans le menu « … » de la fiche (aucune intervention de Claude) ; (b) **en lot**, un outil `marquer_test` avec liste d'identifiants, aperçu puis code, sur la liste que Jérôme valide. Rien n'est écrit dans le dépôt public (ni noms ni phrases).
- **Cas des devis de test déjà finalisés de Jérôme** : ils ont un vrai numéro `DEV-` consommé. Ils **ne peuvent pas** devenir `TEST-` (le préfixe ne se réécrit pas, 8.2) et **ne seront jamais supprimables**. Les marquer « test » après coup les sortirait seulement des statistiques : question 5.

## 14. Questions ouvertes pour Jérôme

Chaque question : la recommandation de Claude en premier. Exemples à 100 €.

1. **Supprimer un devis de test déjà finalisé ?** (contradiction avec « les versions ne sont jamais supprimées »). **Recommandation : oui, seulement quand son numéro commence par `TEST-`** ; un vrai devis (`DEV-`) ne se supprime jamais, même marqué test. Exemple : un devis `TEST-004` à 100 € HT finalisé s'efface ; `DEV-…-012` à 100 € HT reste. Si non : les devis de test restent, mais sans fausser les numéros ni les chiffres.
2. **Remettre le compteur de test à zéro** quand « Supprimer tous mes tests » a tout effacé ? **Recommandation : oui** (le compteur global, lui, ne revient jamais en arrière). Le premier devis de test suivant s'appellerait de nouveau `TEST-001`.
3. **Le mode test de l'écran doit-il aussi s'appliquer à l'assistant ?** **Recommandation : non** (il marque un test seulement quand tu le dis). Sinon il faudrait un réglage enregistré sur le serveur, qu'il lirait avant chaque création.
4. **Les exports** doivent-ils contenir les éléments de test ? **Recommandation : oui, avec une colonne `test`** (on exporte ses données, on filtre ensuite).
5. **Marquer « test » un devis déjà finalisé avec un vrai numéro** (pour sortir tes anciens essais des statistiques) ? **Recommandation : oui, par le serveur seulement, pour les statistiques ; il reste `DEV-`, il reste visible et jamais supprimable.** Exemple : un essai à 100 € HT finalisé sous `DEV-…-007` sort du chiffre d'affaires mais garde son numéro 7.
6. **Un devis `TEST-` supprimé** peut-il être rétabli par `restaurer_depuis_audit` ? **Recommandation : non** (un test supprimé doit rester supprimé ; la copie « avant » reste lisible dans le journal). Cela demande un refus explicite dans `restaurer_depuis_audit` (4e verrou, 8.2), sinon l'outil recréerait le devis avec son numéro.
7. **Les projets** ont-ils aussi leur repère « test » et sortent-ils du chiffre d'affaires ? **Recommandation : oui** (ils comptent dans `caParMois`).
8. **Un filigrane « DEVIS DE TEST »** sur le PDF et l'e-mail (n8n reçoit `test: true`) ? **Recommandation : plus tard** ; au début, le numéro `TEST-` suffit à les reconnaître.
9. **Comment marquer tes essais existants** : un par un via le menu « … » (**recommandé**, aucun risque) ou en lot après aperçu (plus rapide, demande ton accord écrit avant) ?
10. **Ordre de fusion et déploiement** : PR 1a, 1b et 2 faites aujourd'hui, PR 3 (règles possibles) demandera ton clic de fusion, déploiement des clients par toi seul : d'accord ?

## 15. Journal

- **02/11/2026** : cadrage écrit (docs seulement). Aucun code, aucune donnée de Jérôme touchée, `version.js` inchangé. Relecture Fable du contenu : faite par la session principale.
- **02/11/2026, PR 1a-1 faite** (repère + badge + menus, sans interrupteur ni héritage). Le champ `test: true` est accepté par `nouvellePersonne`, `nouvelleOrganisation`, `nouvelleAffaire`, `nouvelleActivite`, `nouvelleNote` (par le lien), `nouveauProjet`, `nouvelleTache` et `nouveauDevis` (conditionnel : absent = réel, `false` ou toute autre valeur n'est pas écrite). `libelleAvecTest(nom, test)` et `estTest(fiche)` sont dans `js/modules/crm/logique.js` (copié au serveur par `scripts/preparer-fonctions.js` : réutilisable en PR 2). Le badge « [TEST] » est un `span` à part (jamais dans la valeur d'un titre éditable, qui l'enregistrerait). Retirer le repère écrit `test: false`. Aucune règle Firestore modifiée (`firestore.rules:172-174` joker ; `devisBrouillonModifie` n'interdit que 5 clés). **Endroits laissés** : sélecteurs `champIntelligent`, résultats de recherche (PR 1b), Accueil, PDF / e-mails / exports (gardent le vrai nom). **Écarts** : `ecritureNoteDeDepart`, `ecrituresActivitesModeleAffaire` et `ecrituresTachesModele` examinées, non changées (elles ne reçoivent pas `test` : la pose et l'héritage sont la PR 1a-2) ; sur le devis finalisé, l'entrée est grisée « Marquer comme test (bientôt disponible) » (la vraie fonction du serveur vient en PR 2/3). Le cas d'erreur « lecteur » est testé par un refus simulé (`permission-denied`), pas par un vrai compte lecteur chez un client.
- **02/11/2026, PR 1a-2a faite** (déplacé le 05/11 : voir la PR 1a-2b-2 ; interrupteur + bandeau + pose à la création, sans héritage). `js/os/mode-test.js` : `modeTestAllume()`, `definirModeTest()`, `surModeTest()`, `avecModeTest(valeurs)` (stockage `chevalier-os.modeTest`, valeur `'1'`, tout le reste = éteint ; attribut `data-mode-test` sur `<html>`, posé aussi par `index.html` avant le premier rendu). **Interrupteur** : bouton `[data-role="mode-test"]` dans `menu-bas` (pas une `menu-entree`), `aria-pressed`, infobulle qui suit l'état en menu replié. **Bandeau** : élément propre de `.zone`, avant la barre d'outils, non collant, avec son bouton « Éteindre » ; liseré `box-shadow: inset` sur `.zone`. **Pose** : un seul point d'entrée, les 9 fonctions de création de `donnees.js` (CRM : personne, organisation, affaire, activité, note ; projets : projet, projet depuis affaire, tâche ; devis : brouillon) lisent le mode au moment de l'appel ; un `test: true` déjà posé n'est jamais retiré ; réglages et catalogue jamais marqués. Un test statique (4) vérifie qu'aucun écran ne crée sans passer par là. **Reste pour la 1a-2b** : les documents créés avec l'élément (notes de départ `ecritureNoteDeDepart`, activités du modèle d'affaire, tâches du modèle de projet) ne reçoivent pas encore le repère ; la note créée par `creerNote(texte, liens)` le reçoit.
- **04/11/2026, PR 1a-2b-1 faite** (héritage à la création + durcissement des tests de la 1a-2a). `heriterTest(valeurs, { personne, organisation, affaire, projet })` (`js/modules/crm/logique.js`) n'écrit que `test: true`. Règles : affaire sur une personne ou une organisation de test, **ou sur une personne réelle d'une organisation de test** (décision prise seule) = test, avec sa note de départ et les activités du modèle ; personne créée dans une organisation de test ; projet depuis une affaire de test ou sur une personne/organisation de test (tâches du modèle et note de départ comprises) ; tâche d'un projet de test ; brouillon de devis sur une affaire ou pour un client de test ; **dupliquer un devis de test** (le `test` passe dans l'objet de `creerBrouillon`, pas par `contenu`) ; activité et note sur une affaire, personne, organisation ou projet de test (les liens d'un projet portent `test: true` seulement s'il est vrai). Le devis de test sur une affaire réelle est permis ; **un brouillon réel auquel on rattache ensuite une affaire de test reste réel** (pas d'héritage rétroactif : la PR 3 revérifie à la finalisation). Le serveur hérite déjà, par le code copié, pour `creer_affaire`, `creer_projet_depuis_affaire`, `ajouter_livrable_projet`, `creer_devis_brouillon`, `creer_devis_depuis_modele` ; pas encore pour `creer_personne`, `creer_projet`, `creer_activite`, `ajouter_note` (PR 2). Le « + Devis » de la liste crée sans client : pas de badge avant le choix du client (pas d'héritage rétroactif). `creerBrouillon` hérite de l'affaire et du client de ses valeurs (dupliquer un devis réel rattaché à une affaire de test donne un devis de test). Cas nommés : (a) une restauration remet le document tel quel (`test` conservé) ; (b) `crm_evenements` du fil non marqués (à confirmer en PR 1b si une statistique les lit) ; (c) une personne ou une organisation tapée à la volée n'est pas encore connue de l'écran : pas d'héritage par elle (une personne tapée dans une organisation de test hérite par l'organisation) ; (d) le catalogue (`articles.js`, `vocabulaire-plans.js`) n'est jamais marqué, et le test statique a une liste blanche explicite.
- **04/11/2026, règle élargie (décision prise seule, PR 1a-2b-1)** : une activité, une note, un projet ou une affaire créés sur une personne **réelle** d'une organisation de test, ou sur une affaire démarquée dont le parent est de test, deviennent de test (le parent est cherché à la création, jamais après coup). Côté serveur, `creer_affaire` est couvert par un vrai test sans émulateur (`tests/ecriture-outils.test.js`, « test 11 bis » : personne réelle d'une organisation de test → affaire et note de test ; sur du réel, aucune clé `test`).
- **05/11/2026, PR 1a-2b-2 faite** : l'interrupteur « Mode test » passe dans le menu Jérôme, après le thème (`menuitemcheckbox`, le menu reste ouvert) ; l'ancien bouton et `.menu-mode-test` sont supprimés ; l'abonnement `surModeTest` de la coque est maintenant arrêté avec la coque. Décision prise seule : `ouvrirMenu` garde le `role` d'un `{ noeud }` qui en a déjà un (changement d'une ligne dans `ui.js`), plutôt qu'un nouveau type d'entrée. Même code chez les clients.
- **05/11/2026, PR 1b faite** (statistiques sans les tests, recherche par le mot « test », exports). `sansTests(liste)` (`js/modules/crm/logique.js`, copiée au serveur) est appliquée à l'ENTRÉE de chaque calcul, jamais à l'affichage : les sept `CALCULS` (`nouveaux_contacts`, `rdv_tenus`, `passages_etape`, `ca_signe`, `propositions_envoyees`, `ca_facture`, `ca_encaisse`), `compterParEtape` (Accueil), `caParMois` (graphique, via `ca_encaisse`) et le MONTANT de `totauxColonne`. `montantDesDevis(devis, affaire = null)` ne compte un devis que si son repère est celui de l'affaire (sans second argument : règle d'avant ; `functions/src/coeur/devis.js` passe l'affaire, donc `recalculer_montants_affaires` suit). La recherche du haut (écran) et l'outil `chercher` (serveur) affichent « [TEST] Nom » et ajoutent `test` aux mots cherchables ; pas de champ `test` dans les résultats ni de paramètre `tests` (PR 2). **Exports : rien à coder**, `exportJson` garde le champ `test: true` dans chaque document (« colonne test » = le champ lui-même, test de verrouillage 8). **Grep des modules annexes** : `grep -rn "crm/donnees\|etat.affaires\|etat.projets\|etat.devis\|etat.personnes" js/modules/tableaudebord js/modules/veille js/modules/automatisations` ne rend aucune ligne : aucun calcul de ces modules ne lit affaires, projets, devis ou personnes. Même constat pour `crm_evenements` (note (b) de la 1a-2b-1) : aucun calcul de `CALCULS` ni `pointsCles` ne les lit, rien à marquer. **Inchangés, avec test** : `pointsCles` et `tachesPointsCles` (une liste d'actions, pas une statistique), `comptesParEtape`, `comptesArchivesParEtape` et `comptesParPhase` (Réglages : une affaire de test empêche encore de désactiver son étape). **Décisions prises seul** : (1) un nombre de lignes ou de cartes dit combien d'éléments sont affichés, pas une statistique (« un mot = une seule chose ») : `.compteur-liste`, « N affaires » de l'en-tête de colonne, « N devis » et « N projets » des Kanban restent comptés tests compris ; (2) l'usage des articles reste en PR 2 ; (3) « [TEST] » en texte dans les suggestions de recherche ; (4) `chercher` du serveur aligné sur l'écran (parité) ; (5) la « pastille de nombre » du module Devis citée au §7 est introuvable dans le code (le seul badge de menu est celui d'Automatisations) : rien à changer. Même code chez Jérôme et chez les clients (`functions-plateforme/serveur/` est généré).
- **05/11/2026, risque connu pour la PR 2 (relecture Fable de la PR 1b)** : basculer le repère `test` d'une affaire ne recalcule pas `montantDevis*` (recalcul seulement à une transition de devis ou par `recalculer_montants_affaires`). La PR 2 doit recalculer le montant au marquage et au démarquage d'une affaire. Descriptions des outils MCP `chercher`, `modifier_affaire` et `recalculer_montants_affaires` précisées (libellé « [TEST] », même repère que l'affaire), sans changement de comportement.
- **05/11/2026, PR 2 faite** (outils de l'assistant et consigne côté serveur ; en brouillon, relecture Fable à faire). **Outils** : `marquer_test` / `demarquer_test` (`type` + `id` + `codeConfirmation`), cœur commun `functions/src/coeur/mode-test.js` (`basculerTest`, UNE transaction, ligne de journal `marquerTest` / `demarquerTest` : le nom ne commence pas par « devis », donc une fiche, un brouillon ou une affaire se restaurent avec leur montant ; un devis finalisé est refusé par `restaurer.js`). **Paramètre `test`** sur les 8 créations (jamais `test: false` à la création), réponse avec `test: true|false` et `conseil` si le mot « test » seul est dans le nom et que le repère n'est pas posé (jamais de pose automatique). **Héritage serveur complété** : `creer_personne` (organisation), `creer_projet` (personne, organisation), `creer_activite` et `ajouter_note` (affaire, sa personne et son organisation ; ou personne et son organisation ; ou organisation) ; les autres héritaient déjà (tests de verrouillage 2b). **Filtre `tests`** (`inclure`, `exclure`, `seulement`) sur `lister_affaires`, `lister_projets`, `lister_activites`, `lister_devis`, `chercher`, `test: true` dans chaque résultat. **Usage des articles** : un devis de test ne compte jamais (`usageDepuisLesDevis` et `finaliser`). **Affaire** : le montant `montantDevis*` est recalculé dans la même opération (1 200 → 100 → 1 200). Même code chez les clients (copié par `preparer-fonctions.js`) ; 83 outils (+ 2). **Décisions prises seul** : (1) profils `bibliothecaire` et `claude-code` (comme `modifier_*`), jamais le lecteur ; (2) un devis finalisé marqué : toutes les versions de la racine reçoivent le même repère ; (3) pas de paramètre `test` sur `ajouter_note` (elle hérite seulement) ; (4) l'usage des articles n'est pas touché au marquage : la réponse conseille `recalculer_usage_articles` ; (5) conseil sur le mot « test » SEUL ; (6) **le brief disait « un jeton au plafond est refusé sans brûler le code » : faux dans le code** (`confirmerDevis` consomme le code puis réserve le plafond, comme pour tous les outils à code) : au plafond, l'écriture est refusée, rien n'est écrit, et il faut un nouvel aperçu ; non changé ici (code partagé) ; (7) cas « version de référence de test, nouvelle version réelle » impossible avant la PR 3 (toutes les versions portent le même repère). **Après relecture Fable** : (8) « finalisé » se décide sur TOUTES les versions de la racine (viser la version brouillon d'un devis signé exige aussi l'aperçu et le code) ; l'aperçu montre chaque affaire touchée (`montantsAffaires`) ; (9) **décision prise seule, question pour Jérôme** : le profil bibliothécaire (Hermes) ne peut ni finaliser un devis ni marquer ou démarquer un devis finalisé (« réservé à Claude Code »), il marque seulement fiches et brouillons ; à confirmer ; (10) le refus de restaurer un marquage de devis finalisé indique l'outil inverse, pas une nouvelle version ; (11) les listes ne rendent `test: true` que s'il est posé (jamais `test: false`). **Reste** : la fonction appelable de l'écran pour « Marquer comme test » d'un devis finalisé (entrée grisée, avec `OPERATIONS.marquerTest`) part avec la PR 3 ; la limite « marquer depuis l'ÉCRAN une affaire ne recalcule pas `montantDevis*` » reste (`docs/montant-affaire.md`).
