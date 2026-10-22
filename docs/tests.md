# Les tests : mode d'emploi (une page)

Écrit le 18/10/2026. Pour Jérôme : tu n'as **rien à lancer** sur ton Mac.

## Les trois paliers

| Palier | Ce que c'est | Combien de temps | Qui le lance, quand |
|---|---|---|---|
| **Rapide** | Les règles, la logique et les contrôles, sans navigateur | moins d'une minute | Claude, dans la session, avant d'ouvrir une PR |
| **Smoke** (« fumée ») | 5 parcours essentiels dans un vrai navigateur : connexion, créer une personne, une affaire, un projet, ajouter des factures. Format ordinateur seulement | environ 15 secondes | Claude, dans la session, avant d'ouvrir une PR |
| **Complet** | Tous les tests, dont tous les parcours navigateur. Format ordinateur seulement | voir « Durée réelle » ci-dessous | **GitHub**, sur une PR seulement si elle touche des fichiers sensibles (voir ci-dessous), porte l'étiquette `tests-complets`, ou si on le lance à la main |
| **De nuit** | Tout, ordinateur **et téléphone**, chaque scénario une fois (3 fois si on règle `TESTS_REPETER=3`, trop long pour le quota gratuit) | plus long | **GitHub**, chaque nuit vers 2 h 17 (heure de Paris), **seulement si `main` a reçu un commit depuis environ 26 heures** |

**Sur chaque PR (décision de Jérôme du 19/10/2026, avis de Fable ; corrigée le 21/10/2026)** : GitHub lance **rapide + smoke** (mesuré le 21/10/2026 : 2 min 34 s de bout en bout avec l'installation), **puis les parcours navigateur que la PR a elle-même ajoutés ou modifiés** (`tests/e2e/*.spec.js`, format ordinateur ; quelques dizaines de secondes par fichier). Il lance le **complet** à la place quand la PR touche `functions-plateforme/`, `firestore.rules`, `storage.rules`, `firebase*.json`, `.github/workflows/` ou l'**outillage** des tests (`tests/lancer-tout.js`, `ports.js`, `playwright.config.js`, `package-lock.json`, `e2e/outils.js`, `e2e/serveur.js` ; **pas** `tests/package.json` depuis le 22/10/2026 : ajouter un test à une liste comme `test:logique` ne doit pas déclencher les 10 minutes du palier complet), ou porte l'étiquette `tests-complets`. Avant cette correction, le moindre fichier sous `tests/` déclenchait le complet : comme chaque PR de code ajoute un test, toutes les PR de code duraient 11 à 17 minutes. Lancement à la main (Actions > Tests > Run workflow) : complet par défaut. `functions/` n'y est plus (20/10/2026) : le niveau rapide en teste déjà les fonctions (`test:fonctions`). Risque accepté : un défaut d'écran hors des 5 parcours et hors des parcours de la PR passe la coche, est déployé à la fusion et n'est vu que par le test de nuit. Pour une PR qui touche un fichier partagé par tous les écrans (`js/modules/crm/fiche-*.js`, `js/modules/projets/`, `js/os/shell.js`, `css/tokens.css`, `css/crm.css`), poser l'étiquette `tests-complets`. Si la nuit est rouge, une issue GitHub s'ouvre (email) ; retrouver la fusion en cause et la défaire (revert puis fusion). La suite complète ne se lance pas dans la session (impossible en cloud : le navigateur de test n'y est pas installé).

**Objectif de durée (Jérôme, 21/10/2026)** : un test « rapide » = environ 5 minutes ; au-delà de 10 minutes, on cherche une solution avec Fable.

Pendant le travail, Claude ne lance que les tests du module qu'il touche (`npm run test:module projets`, par exemple).

## Où lire le résultat

- Sur une PR : en bas de la page de la PR, la ligne **« Tests »** : coche verte = tout va bien, croix rouge = quelque chose a échoué. Clique « Details » pour voir lequel.
- Tous les runs : https://github.com/jeromechevalier-wq/chevalier-ia-os/actions (colonne de gauche : « Tests » pour les PR, « Tests de nuit » pour la nuit).
- En cas d'échec, descends en bas de la page du run, section **Artifacts** : « tests-echec » (captures d'écran et rapport, gardés 7 jours) ou « tests-nuit » (14 jours).

## Relancer un run à la main

1. Va sur https://github.com/jeromechevalier-wq/chevalier-ia-os/actions
2. Clique « Tests » (ou « Tests de nuit ») dans la colonne de gauche.
3. Clique le bouton **« Run workflow »** (à droite), choisis la branche, puis le bouton vert « Run workflow ».

Pour relancer un run échoué : ouvre-le, puis « Re-run jobs » en haut à droite.

## Le quota

Les minutes de GitHub Actions sont limitées : **2 000 minutes par mois** en plan gratuit pour un dépôt privé. Une minute sur ce type de machine (Ubuntu) compte pour une minute. Le run de nuit compte aussi.

Estimation : voir « Durée réelle » ci-dessous (mise à jour avec les premiers runs). Règle simple : coût d'une PR = durée du run × nombre de poussées sur la PR (un nouveau push annule le run précédent, qui s'arrête tout de suite). Le run de nuit, lui, compte une fois par nuit où `main` a changé, soit au plus 30 fois par mois.

## Durée réelle

Mesures du 18/10/2026 (machine GitHub Ubuntu, petite : 2 workers) :

- **Run « Tests » sur une PR, palier complet** (ordinateur ; avant le 19/10/2026 c'était le seul niveau) : **10 à 14 minutes** (14 min 0 s sur la PR 111, 9 min 47 s sur la PR 112).
- **Run de nuit** (ordinateur + téléphone, 1 passage) : **23 min 30 s** (mesuré sur le run du 18/10/2026, qui s'est terminé en échec : la durée d'un run entièrement vert peut être un peu plus longue).
- Coût par mois, à titre d'ordre de grandeur : une PR avec 3 poussées ≈ 40 minutes ; 20 PR ≈ 800 minutes ; la nuit ≈ 30 × 24 = 720 minutes au maximum (moins si `main` ne change pas tous les jours). Le total (~1 500 minutes) tient dans les 2 000 minutes, mais sans grande marge : si le quota se vide, passer la nuit à un jour sur deux ou rendre le dépôt public (minutes gratuites).

## Recommandations sur le quota (mesure du 18/10/2026)

Mesure faite avec `gh` sur les runs du 01 au 18/10/2026 (207 runs, environ 924 minutes, soit environ 1 040 une fois arrondi par minute comme le fait GitHub). **Attention : une seule journée de runs « Tests » existe** (le workflow date du 17/10 au soir) et le 18/10 était chargé (712 minutes sur 924). Le vrai total se lit sur https://github.com/settings/billing/summary (Usage, puis Actions) : `gh` n'a pas accès à la facturation.

| Runs de PR par mois | Nuit chaque soir | Un jour sur deux | Pas de nuit |
|---|---|---|---|
| 60 | 1 800 min | 1 410 min | 1 050 min |
| 100 | **2 270 min (dépasse)** | 1 890 min (limite) | 1 530 min |
| 150 | 2 870 min (dépasse) | 2 490 min (dépasse) | 2 130 min (dépasse) |

(Hypothèses : environ 330 minutes fixes par mois pour les déploiements, 12 minutes par run de PR, 24 minutes par nuit.) Environ 40 % des minutes des runs « Tests » sont parties dans des runs annulés ou en échec.

Ce qu'on retient :

1. **Rythme de la nuit** : une nuit sur deux, ou mieux, seulement si `main` a changé depuis la dernière nuit (une nuit sans nouveau commit ne sert à rien). **Mis en place le 18/10/2026** (Jérôme ne développe pas tous les jours) : le job « Main a-t-il changé ? » de `tests-nuit.yml` saute la nuit s'il n'y a eu aucun commit sur `main` depuis 26 heures. Un lancement à la main (`workflow_dispatch`) tourne toujours.
2. **Dépôt public** : dernier recours si le quota se vide. Les minutes deviennent gratuites, mais le code devient visible : décision de Jérôme.
3. **Navigateur sur 2 machines GitHub : non.** Le run irait deux fois plus vite, mais la préparation (1 min 15 s) est payée deux fois : +20 à +30 % de minutes pour les PR, donc pas d'économie.
4. **Format téléphone sur les PR qui touchent le CSS ou un écran : seulement si le dépôt est public ou si le rythme des PR est bas.** Il ajouterait environ 330 à 360 minutes par mois (30 % de 100 PR).
5. **Garde-fou** : `timeout-minutes: 45` sur la nuit (un run normal dure environ 24 minutes). Le 18/10, un run de nuit bloqué a tourné 120 minutes, soit 13 % du total du mois.
6. **Moins de runs gâchés** : une PR, un sujet, fusionnée dans la journée ; pas de PR d'essai ; un nouveau push annule déjà le run en cours (`concurrency`).

## Scénarios connus pour échouer « au hasard »

Voir `docs/acceleration-tests-mesures.md`, section « Instabilités ». Sur GitHub, un scénario est repris une fois automatiquement ; s'il passe à la 2e fois, le rapport le marque « flaky » mais la coche reste verte.


## Pièges connus (nuit du 21 au 22/10/2026)

- **Numéros `TESTS_DECALAGE` à éviter** : **2** (le port Firestore 10080 est interdit par le navigateur : « bad port », tous les tests navigateur échouent) et **7** (`tests/ports-et-isolation.test.js` force lui-même le décalage 7 et échoue sur lui-même). Les autres numéros de 0 à 20 sont sûrs.
- **Fenêtre horaire de 22 h à minuit UTC (minuit à 2 h à Paris, en heure d'été)** : deux tests anciens échouent dans cette fenêtre, sur `main` comme sur les PR : `corrections-dossiers-2.spec.js` P1 et `parcours.spec.js` C12 (« Fait » ouvre la prochaine activité : la date « +7 jours » attendue diffère d'un jour). Défaut du test (calcul de « aujourd'hui »), jamais corrigé. La nuit GitHub (00 h 17 UTC) n'est pas concernée. Ne pas chercher d'erreur dans la PR quand seuls ces deux-là échouent à cette heure : relancer après 00 h UTC.
- **Sandbox cloud** : `https://apis.google.com/js/api.js` est injoignable ; les anciens specs qui vérifient « aucune erreur console » échouent donc en session, jamais sur GitHub. Pour les rejouer en session : ajouter temporairement `|apis\.google\.com` à la regex de `context.route` de `tests/e2e/outils.js` (ligne ~281), sans le commiter.
- **Tests instables sous charge** (C36 `@smoke` de `projets.spec.js` : la ligne s'affiche avant l'accusé du serveur, désormais lue avec `expect.poll` ; un test de `consignes-ui.spec.js` sur les menus d'une tâche ; `corrections-dossiers-2.spec.js` P1) : relancer une fois avant de conclure.

## Écran qui appelle une fonction : le modèle de « À valider » (22/10/2026)

`tests/e2e/automatisations-a-valider.spec.js` simule la fonction appelable avec `page.route('**/automatisationsDecider', …)` : le faux serveur applique la **vraie** logique pure (`propositions.js`, chargée par une URL `data:` car Playwright ne peut pas l'importer par son chemin), puis écrit dans l'émulateur ; l'écran voit le résultat par son écoute en direct. À reprendre pour les prochains écrans. Le test D4 de `tests/statique.test.js` liste les fonctions appelées par `automatisations/donnees.js` (elle gagne `automatisationsDecider`). Piège : `tests/e2e/automatisations.spec.js`, test J4, dépend du fuseau : vert sur GitHub (`TZ: Europe/Paris`), rouge dans le bac à sable de session (Node en UTC). Autre piège : `npm run test:module automatisations` régénère les captures de `filtres-automatisations` ; ne pas les commiter. Un worktree neuf n'a pas de `node_modules` : `npm ci` dans `tests/`, `functions/` et `functions-plateforme/`, puis `npm run preparer` avant `test:rapide`.

