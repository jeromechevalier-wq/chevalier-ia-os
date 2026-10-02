# Chevalier IA OS

Espace de travail en ligne de Chevalier IA (Jérôme et Charles). **Version 2.0.0** : la coquille (connexion Google, menu, thèmes, recherche globale) et le module **CRM** refondu autour de trois tables : **Personnes**, **Organisations** et **Affaires** (Accueil avec objectifs et Points clés, Kanban des affaires, fiches, activités, notes, historique, Réglages, export).

La référence unique est [`docs/cahier-des-charges-v2.0.md`](docs/cahier-des-charges-v2.0.md) (le cahier de la version 1 reste dans [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md), pour mémoire). Les choix faits pendant la construction sont dans [`docs/decisions-construction-v2.md`](docs/decisions-construction-v2.md) ; le rapport de la construction est dans [`docs/rapport-construction-v2.md`](docs/rapport-construction-v2.md).

* Adresse : https://chevalier-ia-os.web.app
* Hébergement : Firebase Hosting, base Firestore `europe-west9` (Paris), forfait Blaze (budget 5 €/mois) pour le serveur MCP (une Cloud Function, `functions/`)
* Code : HTML, CSS et modules JavaScript, **sans étape de compilation** ; SDK Firebase 12.19.0 chargé depuis gstatic ; aucun service worker

## Mise en ligne de la version 2.0.0

L'hébergement et le déploiement automatique sont déjà en place (version 1.0.0 en ligne). Pour publier la version 2.0.0 :

1. Sur GitHub, ouvrir la Pull request de la branche `v2` vers `main`, relire, puis **fusionner** : l'action publie le site automatiquement.
2. Les appareils déjà ouverts affichent « Nouvelle version disponible » avec un bouton « Recharger ».
3. Faire la recette manuelle de la section 15.2 du cahier (10 minutes).
4. Quand tu le souhaites, supprimer la collection `crm_prospects` de la version 1.0.0 dans la console Firebase (Firestore Database) : la version 2.0 ne l'utilise pas et ne la touche pas.

Rien à changer côté authentification ni règles Firestore (`firestore.rules` est identique à celui de la version 1.0.0 : les jokers couvrent les nouvelles collections).

## Mettre à jour

1. Modifier le code, lancer les tests (ci dessous).
2. **Augmenter la version** dans les deux fichiers : `version.json` et `js/os/version.js` (par exemple `2.0.1`).
3. Pousser sur `main` : le déploiement est automatique. Les appareils déjà ouverts affichent "Nouvelle version disponible" avec un bouton "Recharger".

Les règles Firestore (`firestore.rules`) sont identiques à celles publiées dans la console ; elles ne sont pas déployées par l'action.

## Tests

Tous les tests tournent sur les **émulateurs Firebase** (projet `demo-chevalier-ia-os`), jamais sur les données réelles.

Prérequis sur le Mac : Node.js 22, Java 21.

```sh
brew install openjdk@21        # ou tout autre JDK 21
export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
cd tests
npm install
npm run installer-fonctions   # dépendances du serveur MCP (functions/), nécessaires aux tests jetons et MCP
npx playwright install chromium
npm test
```

`npm test` démarre les émulateurs Auth (9099) et Firestore (8080), lance les tests A (règles de sécurité des neuf collections), B (logique métier), D (contrôles statiques, dont D5 : serveur MCP), les tests des jetons et du serveur MCP (`jetons.test.js`, `mcp.test.js`) puis C et D (parcours Playwright, chacun rejoué en 1440 × 900 pour l'ordinateur et 390 × 844 pour le téléphone), et arrête les émulateurs.

Pour ouvrir l'appli sur les émulateurs à la main : lancer `npx firebase emulators:start --config ../firebase.json --project demo-chevalier-ia-os --only auth,firestore` depuis `tests/`, servir la racine du dépôt (`node tests/e2e/serveur.js`) puis ouvrir http://localhost:5050/?emulateurs=1.

## Organisation

```
index.html, manifest.webmanifest, version.json, robots.txt
css/        tokens.css (couleurs, thèmes, polices), os.css (coquille), crm.css (module CRM)
js/main.js  démarrage
js/os/      coquille : Firebase, connexion, routage, menu, objectifs communs, célébrations, version, composants
js/modules/crm/  module CRM : donnees.js (Firestore), logique.js (toutes les règles métier pures, testées sans navigateur), personnes, organisations, affaires, fiches, activites, accueil, reglages, export
assets/     portraits, logo et baguette, polices du site, icônes PWA
tests/      tests (non publiés)
functions/  serveur MCP (Cloud Function `mcp`, Paris), non publié avec le site ; déployé avant le site par le workflow GitHub
```

Ajouter un module : créer `js/modules/<nom>/index.js` (fonctions `demarrer`, `arreter`, `afficher`, `reglages`, et facultativement `actionsRapides` et `rechercher` pour le bouton « + » et la recherche globale) et ajouter une entrée dans `js/os/modules.js`. Les collections du module sont préfixées (`<nom>_…`), les éléments communs par `os_`.

## Outils hors site (`outils/`)

Scripts lancés à la main sur le Mac, jamais publiés avec le site (exclus par `firebase.json`) : `autoriser-drive.js` et `prototype-drive.js` (prototype Google Drive du chantier MCP, voir `docs/prototype-drive.md` et `docs/plan-mcp.md`) et `creer-jeton.js` (jeton d'un client MCP, voir `docs/mcp-etape-2.md`). Ils n'ont aucune dépendance (Node 22) et gardent leurs secrets dans `~/.config/chevalier-ia-os/`, jamais dans le dépôt.

## Raccourcis clavier (ordinateur)

`/` place le curseur dans la recherche globale, `n` ouvre « Ajouter une personne », `Échap` ferme une fenêtre ou une liste de suggestions, les flèches et Entrée pilotent les champs intelligents.
