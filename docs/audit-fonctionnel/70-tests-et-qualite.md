# Étape G : tests et qualité (audit fonctionnel, version 2.3.3)

**Statut : partiel** (l'audit est mis en pause par Jérôme ; ce fichier contient ce qui avait déjà été regardé).

## Ce qui n'a PAS été regardé
- **La liste des règles de gestion qu'aucun test ne couvre** (point 2 de la mission) : non commencée. Les docs `cadrage-projets.md`, `projets-facturation-2-2-a.md` et `-b.md`, `crm-decisions-entretien.md`, `decisions-construction-v2.md`, `cahier-des-charges-v2.0.md`, `plan-mcp.md` n'ont pas été comparés aux tests par recherche. Les phrases « aucun test existant ne couvre » des fichiers `10-` à `50-` n'ont pas été consolidées.
- **Les tests qui « figent » un comportement douteux** (par exemple le test B33, paiement partiel accepté) : non regardés.
- **Les autres tests qui attendent « 0 élément »** (`toHaveCount(0)`) : repérés par recherche (`tests/e2e/projets.spec.js` lignes 81, 495, 706, 821, 1274, 1426), mais pas analysés un par un.
- **Les attentes liées à la date** dans `projets.spec.js` (autour des lignes 1464-1477 et 1508-1520, objectif « encaissé du mois » avec des dates décalées de quelques jours) : repérées, pas analysées. Un commentaire du test (ligne 1520 environ) montre que l'auteur connaît le piège du début de mois pour une des factures.
- **À quoi servent les 12 attentes fixes** (`waitForTimeout`) : non lu en détail.
- **Les fichiers `tests/*.test.js` hors `logique`, `projets`, `statique`** : seulement parcourus par recherche (dates, délais), pas lus.
- **La couverture par module** : aucun chiffre (aucun outil de couverture dans `tests/package.json`). Non vérifié.
- **Le texte de la décision R3 de `docs/plan-mcp.md`** : non relu ; je m'appuie sur la consigne reçue.
- Je n'ai relancé aucun test (le résultat de la suite complète vient du journal `/tmp/claude-0/suite-complete.log`, lancé par le coordinateur).

## Résultat de la suite complète (17:13 heure de Paris, 20,3 minutes en tout, Node 22, émulateurs auth et firestore, Chromium)
- `regles.test.js` : 72 réussis, 0 échec.
- `logique.test.js` + `projets.test.js` : 283 réussis, 0 échec.
- `statique.test.js` : 49 réussis.
- Tests des fonctions (jetons, mcp, lecture, écriture, etc.) : 136 réussis, 0 échec.
- Playwright (parcours dans le navigateur, « ordinateur » et « telephone ») : 204 réussis, 2 sautés (`parcours.spec.js:135` et `:560`, volontairement sautés sur téléphone), **2 échecs** (le même test, sur les deux formats : voir G-01).

## Constats

### G-01 · Un test de parcours attend « aucun projet au tableau » alors que la fin d'un projet en crée un nouveau
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (l'échec et sa cause) ; l'explication « le test dépend de la vitesse » reste PLAUSIBLE.
- **Ce qui se passe** : le test « C29 fiche : la barre des phases change la phase ; En pause, Reprendre, Terminer… » termine le projet « Audit Carrel », retourne sur l'écran Projets et attend 0 carte (`.carte-projet`). Mais terminer un projet crée aussitôt son projet d'extraction « Extraction : Audit Carrel » (phase Lancement, non archivé), qui s'affiche au tableau : il reste 1 carte, le test échoue après ses 10 secondes d'attente. Échec reproduit sur ordinateur et téléphone, et 3 fois sur 3 en relançant ce test seul (d'après le coordinateur).
- **Ce que ça change pour Jérôme** : la suite de tests n'est pas entièrement verte ; un vrai défaut futur pourrait passer inaperçu dans ce bruit, et le test ne dit rien sur le bon comportement (le comportement de l'appli, lui, suit la règle voulue).
- **Où dans le code** : `tests/e2e/projets.spec.js:150-151` (l'attente fausse) et `:160` (la fin du même test sait déjà que l'extraction existe : elle attend l'événement `projet_cree`) ; règle : `js/modules/projets/logique.js:881-886` (`planTerminerProjetAvecExtraction`).
- **Règle ou décision concernée** : `docs/projets-etape-6.md` (« Un projet d'extraction est créé quand … un projet est terminé »). Je n'ai trouvé dans `projets-etape-6.md` ni `projets-etape-7.md` aucune mention de ce test.
- **Preuve** : journal `/tmp/claude-0/suite-complete.log` : « Expected: 0 / Received: 1 » à `projets.spec.js:151`. Historique (`git blame`, `git show fffe518`) : la ligne 151 date du commit `0d6cd77` (6/10/2026, étape 2, avant l'existence des extractions). Le commit `fffe518` (étape 6, le même jour, « extraction de valeur automatique ») a corrigé la ligne 160 de ce test (ajout de `projet_cree`) mais pas la ligne 151. Depuis ce jour, le test est donc contradictoire avec la règle. Le test a-t-il déjà passé après cela ? Non vérifié. Hypothèse de vitesse : `toHaveCount(0)` réussit dès que le compte vaut 0, donc le test ne passe que si la vérification tombe avant l'affichage de la carte ; je n'ai pas pu le montrer. Remarque : le dernier commit (`af127b0`, 8/10, version 2.3.3) annonce justement corriger « des défauts qui faisaient échouer des tests de parcours », et ce test reste pourtant en échec : si la suite complète a été lancée avant, ce n'est pas écrit (non vérifié).

### G-02 · Aucun test ne se lance tout seul avant la mise en ligne
- **Gravité** : GÊNANT
- **Confiance** : PLAUSIBLE (lu dans le fichier ; le fichier ne contient simplement aucune étape de test)
- **Ce qui se passe** : le seul fichier de `.github/workflows` est `firebase-hosting.yml`. Il se lance à chaque envoi sur `main` et fait : installer les fonctions, déployer les fonctions, déployer le site. Il ne lance **aucun** test (ni `npm test`, ni tests purs) avant de déployer. D'après la consigne reçue, la décision R3 de `plan-mcp.md` est aussi de ne pas lancer de tests automatiques sur les Pull Requests, et Jérôme ne lance pas `npm test` sur son Mac.
- **Ce que ça change pour Jérôme** : la seule barrière est la session Claude qui lance la suite complète (environ 20 minutes) avant la PR, comme le demande `CLAUDE.md`. Si une session l'oublie ou si un test est déjà rouge (G-01), rien ne bloque la mise en ligne.
- **Où dans le code** : `.github/workflows/firebase-hosting.yml` (étapes `Installer les dépendances`, `Déployer les fonctions`, `FirebaseExtended/action-hosting-deploy`) ; `tests/package.json` (script `test`).
- **Règle ou décision concernée** : `CLAUDE.md` (« lance la suite complète toi-même dans la session ») ; décision R3 de `docs/plan-mcp.md` (non relue).
- **Preuve** : lecture complète du workflow : aucune étape de test.

### G-03 · Douze attentes de durée fixe et aucun nouvel essai en cas de lenteur
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE
- **Ce qui se passe** : des tests attendent un temps fixe au lieu d'attendre un événement : `tests/e2e/projets.spec.js` lignes 883 (1,5 s), 1026, 1067, 1238, 1245, 1310, 1332, 1340, 1408 (0,5 à 0,6 s), 1096 (1,2 s), 1303 (0,6 s), 1558 (0,4 s). Le réglage de Playwright n'a **aucune reprise** en cas d'échec (`retries: 0`), un seul travailleur (`workers: 1`), 90 s par test et 10 s par attente (`tests/playwright.config.js`).
- **Ce que ça change pour Jérôme** : sur une machine plus lente, ou un jour chargé, un test peut devenir rouge sans vrai défaut ; il faut alors tout relancer (jusqu'à 20 minutes). Je n'ai pas lu à quoi sert chaque attente.
- **Où dans le code** : `tests/e2e/projets.spec.js:883,1026,1067,1096,1238,1245,1303,1310,1332,1340,1408,1558` ; `tests/playwright.config.js`.
- **Règle ou décision concernée** : aucune décision de Jérôme ; qualité générale des tests.
- **Preuve** : recherche `waitForTimeout` dans `tests/e2e/*.js` (aucune occurrence dans `parcours.spec.js` ni `outils.js`).

### G-04 · Deux tests de parcours dépendent de l'horloge ou réussissent « dans le vide »
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE
- **Ce qui se passe** : (1) `parcours.spec.js:49-51` exige au moins 1 mois dans le graphique et que tous soient `>= 2026-10` : il suppose que l'horloge de la machine est en octobre 2026 ou après (il échouerait avec une horloge plus ancienne). (2) `parcours.spec.js:666` vérifie que tous les mois affichés sont `>= 2026-12` après avoir réglé le début d'activité à décembre 2026 ; tant que la date du jour est avant décembre 2026, le graphique est vraisemblablement vide et `every` sur une liste vide est toujours vrai : le test ne prouve rien (non vérifié que le graphique est vide).
- **Ce que ça change pour Jérôme** : un test donne une fausse impression de contrôle ; un autre pourrait casser avec une mauvaise horloge.
- **Où dans le code** : `tests/e2e/parcours.spec.js:49-51` et `:666`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` (graphique limité aux mois depuis le début d'activité ; non relu).
- **Preuve** : lecture des deux tests.

### G-05 · Le numéro de version est écrit en dur dans un test : à changer à chaque livraison
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (visible dans le commit `af127b0`)
- **Ce qui se passe** : le test « D1 versions identiques dans version.json et js/os/version.js » compare à la chaîne `'2.3.3'` écrite en dur. Chaque nouvelle version oblige à modifier aussi ce test (le commit `af127b0` modifie `tests/statique.test.js` pour cela). Si on oublie, la suite devient rouge pour une raison sans gravité.
- **Ce que ça change pour Jérôme** : une source de faux rouges et de travail en plus à chaque livraison.
- **Où dans le code** : `tests/statique.test.js` (test D1, vers les lignes 63-67).
- **Règle ou décision concernée** : `js/os/version.js` (« à augmenter à chaque livraison, en même temps que /version.json »).
- **Preuve** : `git show af127b0 -- tests/statique.test.js`.

### G-06 · Les tests de parcours ont besoin du port 5050 libre
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE
- **Ce qui se passe** : `playwright.config.js` fixe l'adresse `http://localhost:5050` et `reuseExistingServer: false` : si ce port est déjà pris (une autre session, un autre essai), le lancement échoue au lieu de s'adapter. Les émulateurs Firebase utilisent aussi leurs ports par défaut (le coordinateur a signalé qu'un autre agent s'en sert). Deux séries de tests ne peuvent donc pas tourner en même temps sur la même machine.
- **Ce que ça change pour Jérôme** : pas de lancements en parallèle ; une session qui en trouve une autre en cours doit attendre.
- **Où dans le code** : `tests/playwright.config.js` (`baseURL`, `webServer`) ; `tests/e2e/serveur.js`.
- **Règle ou décision concernée** : aucune.
- **Preuve** : lecture de `tests/playwright.config.js`.

## Qualité générale (ce qui est établi)
- Durée de la suite complète : 20,3 minutes (mesure du coordinateur). Environ 5 minutes annoncées dans `CLAUDE.md` : l'écart n'a pas été expliqué.
- Taille du code de test (lignes) : `projets.spec.js` 1611, `parcours.spec.js` 1357, `logique.test.js` 1271, `projets.test.js` 1257, `ecriture-outils.test.js` 766.
- Couverture par module : non vérifiée.

## Remarques de sécurité vues en passant
Aucune (pas d'enquête de sécurité dans cette étape).

## Décisions non rouvertes
Le RGPD et la durée de vie des copies ne sont pas rouverts (décision du 04/10/2026).

## Vérifié et conforme
- Les trois suites « pures » et celles des fonctions sont entièrement vertes : 72 + 283 + 49 + 136 réussis, 0 échec (journal de la suite complète).
- Les parcours dans le navigateur : 204 réussis ; le seul échec est celui de G-01.
- Les tests vérifient que le navigateur n'écrit aucune erreur dans la console (fixture `afterEach` dans `tests/e2e/outils.js`) et tournent sur les émulateurs (`demo-chevalier-ia-os`), jamais sur les vraies données (`tests/package.json`).
- Le fuseau horaire est fixé à Paris dans les parcours (`timezoneId: 'Europe/Paris'`) et `jour()` calcule le jour de Paris : pas de dépendance au fuseau de la machine pour ces parcours.
- Le workflow de déploiement s'arrête avant le site si les fonctions échouent (commentaire et ordre des étapes de `firebase-hosting.yml`).
