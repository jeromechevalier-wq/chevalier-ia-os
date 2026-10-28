# Les tests : mode d'emploi (une page)

Écrit le 18/10/2026. Pour Jérôme : tu n'as **rien à lancer** sur ton Mac.

## Les trois paliers

| Palier | Ce que c'est | Combien de temps | Qui le lance, quand |
|---|---|---|---|
| **Rapide** | Les règles, la logique et les contrôles, sans navigateur | moins d'une minute | Claude, dans la session, avant d'ouvrir une PR |
| **Smoke** (« fumée ») | 5 parcours essentiels dans un vrai navigateur : connexion, créer une personne, une affaire, un projet, ajouter des factures. Format ordinateur seulement | environ 15 secondes | Claude, dans la session, avant d'ouvrir une PR |
| **Complet** | Tous les tests, dont tous les parcours navigateur. Format ordinateur seulement | voir « Durée réelle » ci-dessous | **GitHub**, sur une PR seulement si elle touche des fichiers sensibles (voir ci-dessous), porte l'étiquette `tests-complets`, ou si on le lance à la main |
| **De nuit** | Tout, ordinateur **et téléphone**, chaque scénario une fois (3 fois si on règle `TESTS_REPETER=3`, en local seulement) | découpée en 13 jobs parallèles (voir plus bas) | **GitHub**, chaque nuit vers 2 h 17 (heure de Paris), **seulement si `main` a reçu un commit depuis environ 26 heures** |

**Sur chaque PR (décision de Jérôme du 19/10/2026, avis de Fable ; corrigée le 21/10/2026)** : GitHub lance **rapide + smoke** (mesuré le 21/10/2026 : 2 min 34 s de bout en bout avec l'installation), **puis les parcours navigateur que la PR a elle-même ajoutés ou modifiés** (`tests/e2e/*.spec.js`, format ordinateur ; quelques dizaines de secondes par fichier). Il lance le **complet** à la place quand la PR touche `functions-plateforme/`, `firestore.rules`, `storage.rules`, `firebase*.json`, `.github/workflows/` ou l'**outillage** des tests (`tests/lancer-tout.js`, `ports.js`, `playwright.config.js`, `package-lock.json`, `e2e/outils.js`, `e2e/serveur.js` ; **pas** `tests/package.json` depuis le 22/10/2026 : ajouter un test à une liste comme `test:logique` ne doit pas déclencher les 10 minutes du palier complet), ou porte l'étiquette `tests-complets`. Avant cette correction, le moindre fichier sous `tests/` déclenchait le complet : comme chaque PR de code ajoute un test, toutes les PR de code duraient 11 à 17 minutes. Lancement à la main (Actions > Tests > Run workflow) : complet par défaut. `functions/` n'y est plus (20/10/2026) : le niveau rapide en teste déjà les fonctions (`test:fonctions`). Risque accepté : un défaut d'écran hors des 5 parcours et hors des parcours de la PR passe la coche, est déployé à la fusion et n'est vu que par le test de nuit. Pour une PR qui touche un fichier partagé par tous les écrans (`js/modules/crm/fiche-*.js`, `js/modules/projets/`, `js/os/shell.js`, `css/tokens.css`, `css/crm.css`), poser l'étiquette `tests-complets`. Si la nuit est rouge, une issue GitHub s'ouvre (email) ; retrouver la fusion en cause et la défaire (revert puis fusion). La suite complète ne se lance pas dans la session (impossible en cloud : le navigateur de test n'y est pas installé).

**Objectif de durée (Jérôme, 21/10/2026)** : un test « rapide » = environ 5 minutes ; au-delà de 10 minutes, on cherche une solution avec Fable.

Pendant le travail, Claude ne lance que les tests du module qu'il touche (`npm run test:module projets`, par exemple).

**Le palier complet est découpé en 7 jobs parallèles (25/10/2026)** : 6 parties des parcours navigateur (`Complet navigateur 1/6` à `6/6`, option `--shard` de Playwright : chaque parcours tourne dans une seule partie) et un job `Complet sans navigateur` (règles, logique, statique, fonctions, porte, storage, outil client, automatisations ; `npm run test:complet-sans-navigateur`). Un job final, nommé exactement **`Tests`**, réunit les résultats : il est vert seulement si tous les jobs requis sont verts, rouge si l'un a échoué, a été annulé ou n'a pas tourné alors qu'il devait. **Ne jamais renommer ce job** : c'est la coche obligatoire de la protection de branche. Le chemin rapide reste un seul job (`Rapide`), précédé de `Niveau de test` (quelques secondes). Le test de nuit est découpé de la même façon depuis le 28/10/2026 (voir « La nuit est découpée comme les PR »). À la main : `cd tests && TESTS_DECALAGE=1 node lancer-tout.js --e2e --project=ordinateur --shard=1/6`. `TESTS_DECALAGE` des parties : 1, 3, 4, 5, 6, 8 ; sans navigateur : 9 (jamais 2 ni 7).

**La nuit est découpée comme les PR (28/10/2026)** : le job unique de la nuit dépassait 89 minutes et GitHub l'annulait (le délai était de 45 minutes depuis le 25/10 : sept nuits rouges sans que personne le voie, 27/10/2026). Maintenant « Tests de nuit » lance 13 jobs en parallèle : `Nuit navigateur ordinateur 1/6` à `6/6` (décalages 1, 3, 4, 5, 6, 8), `Nuit navigateur telephone 1/6` à `6/6` (décalages 10 à 15), et `Nuit sans navigateur` (décalage 9). Chaque job garde ses captures et son rapport dans un artefact : `tests-nuit-navigateur-<format>-<n>` ou `tests-nuit-sans-navigateur`. Le navigateur de test est gardé en cache. Un job a au plus 30 minutes. Une seule nuit tourne à la fois (`concurrency`). **L'alerte** (issue GitHub, e-mail) s'ouvre si un job est rouge **ou annulé** : avant, une annulation passait sans bruit. Un run lancé à la main (Actions > « Tests de nuit » > « Run workflow ») tourne toujours. `--nuit` dans `tests/lancer-tout.js` ne sert plus que pour lancer toute la nuit en local ; sur GitHub, ce sont les parties ci-dessus.

## Où lire le résultat

- Sur une PR : en bas de la page de la PR, la ligne **« Tests »** : coche verte = tout va bien, croix rouge = quelque chose a échoué. Clique « Details » pour voir lequel.
- Tous les runs : https://github.com/jeromechevalier-wq/chevalier-ia-os/actions (colonne de gauche : « Tests » pour les PR, « Tests de nuit » pour la nuit).
- En cas d'échec, descends en bas de la page du run, section **Artifacts** : « tests-echec » (captures d'écran et rapport, gardés 7 jours) ou « tests-nuit-navigateur-<format>-<n> » ou « tests-nuit-sans-navigateur » (14 jours ; depuis le 28/10/2026 la nuit est découpée, voir plus bas).

## Relancer un run à la main

1. Va sur https://github.com/jeromechevalier-wq/chevalier-ia-os/actions
2. Clique « Tests » (ou « Tests de nuit ») dans la colonne de gauche.
3. Clique le bouton **« Run workflow »** (à droite), choisis la branche, puis le bouton vert « Run workflow ».

Pour relancer un run échoué : ouvre-le, puis « Re-run jobs » en haut à droite.

## Le quota (plus un sujet depuis le 20/10/2026)

Depuis que le dépôt est public (20/10/2026), les minutes de GitHub Actions sont gratuites : plus de quota à surveiller. Les mesures de minutes et les recommandations du 18/10/2026 (nuit un jour sur deux, pas de téléphone sur les PR, etc.) ne servent plus. Restent deux habitudes utiles : une PR, un sujet, fusionnée dans la journée (moins de runs gâchés), et la nuit qui saute si `main` n'a pas changé depuis 26 heures (le job « Main a-t-il changé ? »).

## Durée réelle

- **Run « Tests » sur une PR** : 10 à 14 minutes au palier complet avant le découpage en 7 jobs (mesure du 18/10/2026) ; rapide + smoke : environ 2 min 30 s.
- **Run de nuit** : en un seul job, plus de 89 minutes (27/10/2026). Découpé en 13 jobs, chacun doit tenir dans 30 minutes ; la durée réelle du premier run à 13 jobs est à vérifier sur GitHub.

## Scénarios connus pour échouer « au hasard »

Voir `docs/acceleration-tests-mesures.md`, section « Instabilités ». Sur GitHub, un scénario est repris une fois automatiquement ; s'il passe à la 2e fois, le rapport le marque « flaky » mais la coche reste verte.


## Pièges connus (nuit du 21 au 22/10/2026)

- **Numéros `TESTS_DECALAGE` à éviter** : **2** (le port Firestore 10080 est interdit par le navigateur : « bad port », tous les tests navigateur échouent) et **7** (`tests/ports-et-isolation.test.js` force lui-même le décalage 7 et échoue sur lui-même). Les autres numéros de 0 à 20 sont sûrs.
- **Fenêtre horaire de 22 h à minuit UTC (minuit à 2 h à Paris, en heure d'été)** : deux tests anciens échouent dans cette fenêtre, sur `main` comme sur les PR : `corrections-dossiers-2.spec.js` P1 et `parcours.spec.js` C12 (« Fait » ouvre la prochaine activité : la date « +7 jours » attendue diffère d'un jour). Défaut du test (calcul de « aujourd'hui »), jamais corrigé. La nuit GitHub (00 h 17 UTC) n'est pas concernée. Ne pas chercher d'erreur dans la PR quand seuls ces deux-là échouent à cette heure : relancer après 00 h UTC.
- **Sandbox cloud** : `https://apis.google.com/js/api.js` est injoignable ; les anciens specs qui vérifient « aucune erreur console » échouent donc en session, jamais sur GitHub. Pour les rejouer en session : ajouter temporairement `|apis\.google\.com` à la regex de `context.route` de `tests/e2e/outils.js` (ligne ~281), sans le commiter.
- **Tests instables sous charge** (C36 `@smoke` de `projets.spec.js` : la ligne s'affiche avant l'accusé du serveur, désormais lue avec `expect.poll` ; un test de `consignes-ui.spec.js` sur les menus d'une tâche ; `corrections-dossiers-2.spec.js` P1) : relancer une fois avant de conclure.

## Écran qui appelle une fonction : le modèle de « À valider » (22/10/2026)

`tests/e2e/automatisations-a-valider.spec.js` simule la fonction appelable avec `page.route('**/automatisationsDecider', …)` : le faux serveur applique la **vraie** logique pure (`propositions.js`, chargée par une URL `data:` car Playwright ne peut pas l'importer par son chemin), puis écrit dans l'émulateur ; l'écran voit le résultat par son écoute en direct. À reprendre pour les prochains écrans. Le test D4 de `tests/statique.test.js` liste les fonctions appelées par `automatisations/donnees.js` (elle gagne `automatisationsDecider`). Piège : `tests/e2e/automatisations.spec.js`, test J4, dépend du fuseau : vert sur GitHub (`TZ: Europe/Paris`), rouge dans le bac à sable de session (Node en UTC). Autre piège : `npm run test:module automatisations` régénère les captures de `filtres-automatisations` ; ne pas les commiter. Un worktree neuf n'a pas de `node_modules` : `npm ci` dans `tests/`, `functions/` et `functions-plateforme/`, puis `npm run preparer` avant `test:rapide`.

`tests/e2e/automatisations-a-valider-chaine.spec.js` (critères 7 à 14 du Logger) : la chaîne s'allume sans recharger, finalisation, ligne bloquée, abandon, libellé piégé, 390 px, `data-etat`. `automatisationsDecider` y est simulée comme dans `automatisations-a-valider.spec.js`.

## Pièges connus (journée du 23/10/2026)
- **Tout nouveau test d'écran se lance aussi en format téléphone** (`--project=telephone`) avant la PR : la coche de PR ne le fait pas, seule la suite de nuit l'attrape (quatre tests l'ont fait rougir le 23/10).
- **`npm run test:module <nom> -- --project=telephone` ignore l'option** : `tests/lancer-module.js` ne lit que le nom et lance toujours le format ordinateur (`--project=ordinateur`). Pour le format téléphone, depuis `tests/` : `node lancer-tout.js --e2e e2e/<fichier>.spec.js --project=telephone` (tout ce qui suit `--e2e` est passé tel quel à Playwright, avec les mêmes émulateurs ; `TESTS_DECALAGE` s'applique pareil).
- Un test qui ouvre le tiroir du menu sur téléphone doit le refermer (Échap) avant de cliquer ailleurs : le voile intercepte les clics.
- `.panneau-activite` est en `display: contents` sous 1024 px : on ne peut pas le photographier sur téléphone (utiliser `.fiche-grille`).
- Après « Détacher » sur une fiche projet, le panneau est recréé et l'onglet G-Drive se referme : le rouvrir avant de mesurer.
- `npm ci` aussi dans `functions/` et `functions-plateforme/` (puis `node scripts/preparer-fonctions.js`) avant `test:module registre` ou `statique`.
- En bac à sable, `apis.google.com` est injoignable : les parcours qui chargent le sélecteur de fichiers Google échouent sur l'erreur console `ERR_TUNNEL_CONNECTION_FAILED`. Ce n'est pas un défaut du code ; la coche GitHub fait foi.
- Deux suites de tests en même temps sur la même machine font échouer au hasard (veille-filtres, tableaudebord, porte) : relancer seul.
- La suite de nuit peut être relancée à la main (GitHub, Actions, « Tests de nuit », « Run workflow ») pour vérifier un correctif sans attendre la nuit.
