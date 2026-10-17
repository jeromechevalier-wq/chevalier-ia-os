# Tests de Chevalier IA OS

Tout tourne sur les émulateurs Firebase (jamais sur les vraies données).

## Les deux niveaux

| Commande | Ce qu'elle fait | Durée visée |
|---|---|---|
| `npm run test:rapide` | règles, logique, contrôles statiques + les scénarios (ordinateur seulement) des fichiers de spec que ta branche a modifiés + les scénarios `@rapide` (un test de fumée par grand écran) | moins d'une minute |
| `npm test` | **tout** : toutes les séries, formats ordinateur et téléphone | 5 minutes ou moins |

**Le rapide ne remplace JAMAIS le complet avant une fusion** (règle de `CLAUDE.md`). Il sert à avancer vite pendant le codage.

Le niveau rapide compare ta branche à `origin/main` (`git fetch` d'abord). Sans réseau, il saute le `fetch` et le dit.

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
npm test                      # complet
npm run test:rapide           # rapide
npm run test:sequentiel       # l'ancien enchaînement, une série après l'autre (secours)
```

Seulement le navigateur, un fichier de spec ou une répétition (mêmes ports et mêmes émulateurs que `npm test`) :

```bash
node lancer-tout.js --e2e e2e/parcours.spec.js --project=ordinateur
node lancer-tout.js --e2e --repeat-each=3
```
