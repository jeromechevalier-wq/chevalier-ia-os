# Tests de Chevalier IA OS

Tout tourne sur les émulateurs Firebase (jamais sur les vraies données).

## Les paliers (décision du 18/10/2026)

| Commande | Ce qu'elle fait | Durée visée | Qui la lance |
|---|---|---|---|
| `npm run test:module <nom>` | les fichiers `tests/<nom>*.test.js` et `tests/e2e/<nom>*.spec.js`, format ordinateur | quelques secondes à 1 minute | la session, pendant le travail |
| `npm run test:rapide` | règles, logique, statique, fonctions, porte (sans navigateur) | moins d'une minute | la session, avant d'ouvrir la PR |
| `npm run test:smoke` | 5 parcours essentiels dans le navigateur (étiquette `@smoke`), format ordinateur | environ 15 secondes | la session, avant d'ouvrir la PR |
| `npm run test:complet` (= `npm test`) | tout, format ordinateur | 5 à 10 minutes | **GitHub**, sur chaque PR (`tests.yml`) |
| `npm run test:nuit` | tout, ordinateur et téléphone, chaque scénario 1 fois (3 avec `TESTS_REPETER=3`, trop long pour le quota GitHub) | environ 25 minutes sur GitHub | **GitHub**, 1 nuit d'essai (19/10/2026) sur `main` (`tests-nuit.yml`) |

La session ne lance jamais la suite complète. Voir `docs/tests.md`.

## Plusieurs sessions en même temps

Chaque session choisit un numéro différent :

```bash
TESTS_DECALAGE=1 npm test
```

Tous les ports (émulateurs, serveur de test, hub) sont décalés de `1000 × numéro`. Sans variable, ce sont les ports d'avant (`0`). Si un port est pris, la suite s'arrête tout de suite avec : « Port X pris ; relance avec TESTS_DECALAGE=<n+1> ».

## Comment ça va plus vite (sans retirer un seul test)

- **Séries en parallèle** (`lancer-tout.js`) : `e2e` (navigateur), `noyau` (règles, logique, statique, fonctions, porte), `storage`, `outil-client`, `automatisations`. Chaque série démarre ses propres émulateurs, avec ses propres ports (`ports.js`). Les fichiers de test sont exactement ceux des scripts de `package.json`.
- **Un projet Firebase par worker** : les scénarios du navigateur tournent sur plusieurs workers (`TESTS_WORKERS`, par défaut la moitié des cœurs, 3 au plus : 3 workers vont aussi vite que 4 sur le Mac de Jérôme et se gênent moins). Le worker N utilise le projet `demo-chevalier-ia-os-wN` sur le même émulateur : ses données et ses règles ne touchent jamais celles des autres. L'appli apprend le projet et les ports par `window.__emulateurs` (posé par `e2e/outils.js`, lu seulement en mode test, voir `js/os/firebase.js`).
- **Format téléphone seulement là où il compte** : les scénarios étiquetés `@sans-telephone` (indépendants de la taille d'écran : données, droits, logique) ne tournent qu'en format ordinateur. **Dans le doute, ne pas étiqueter** : un scénario sans étiquette tourne dans les deux formats.
- Les comptes Auth ne sont vidés entre deux scénarios que s'il n'y a qu'un worker (l'émulateur Auth les range dans un projet commun à tous les workers).

## Fichiers générés

`tests/.config-ports/` : copies de `firebase.json` / `firebase.plateforme.json` avec les ports décalés, et journal de chaque série (`<décalage>-<série>.log`). Ignoré par git. Les fichiers `firebase*.json` d'origine ne changent pas.

## Variables

| Variable | Rôle | Défaut |
|---|---|---|
| `TESTS_DECALAGE` | décalage des ports (entier 0 à 40) | `0` |
| `TESTS_WORKERS` | nombre de navigateurs en parallèle | moitié des cœurs, 3 au plus |

## Lancer à la main

```bash
cd tests && npm install && npm run installer-fonctions && npm run installer-outils && npm run installer-fonctions-plateforme && npx playwright install chromium
npm run test:module projets  # un module
npm run test:rapide           # sans navigateur
npm run test:smoke            # 5 parcours navigateur
npm run test:complet          # tout, ordinateur (GitHub le lance sur chaque PR)
npm run test:sequentiel       # l'ancien enchaînement, une série après l'autre (secours)
```

Seulement le navigateur, un fichier de spec ou une répétition (mêmes ports et mêmes émulateurs que `npm test`) :

```bash
node lancer-tout.js --e2e e2e/parcours.spec.js --project=ordinateur
node lancer-tout.js --e2e --repeat-each=3
```
