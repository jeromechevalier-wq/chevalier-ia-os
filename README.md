# Chevalier IA OS

Espace de travail en ligne de Chevalier IA (Jérôme et Charles). Version 1 : la coquille (connexion Google, menu, thèmes) et le module **CRM de prospection** (Accueil avec objectifs et À faire, Kanban, Liste, fiche, Réglages).

La référence unique est [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md). Les choix faits pendant la construction sont dans [`docs/decisions-construction.md`](docs/decisions-construction.md).

* Adresse : https://chevalier-ia-os.web.app
* Hébergement : Firebase Hosting (plan gratuit Spark), base Firestore `europe-west9` (Paris)
* Code : HTML, CSS et modules JavaScript, **sans étape de compilation** ; SDK Firebase 12.19.0 chargé depuis gstatic ; aucun service worker

## Mise en ligne (une seule fois, sur le Mac)

1. Installer Node.js LTS (https://nodejs.org), puis dans le Terminal :
   ```sh
   npm install -g firebase-tools
   firebase login
   cd ~/chemin/vers/chevalier-ia-os
   firebase init hosting:github
   ```
   Répondre : dépôt `jeromechevalier-wq/chevalier-ia-os`, pas de script de build, déploiement automatique sur `main`. Si la commande propose d'écraser `.github/workflows/firebase-hosting.yml` ou `firebase.json`, répondre **non** (garder les fichiers fournis).
2. Google Cloud Console, projet `chevalier-ia-os`, Identifiants, client OAuth "Web client (auto created by Google Service)" : ajouter l'URI de redirection autorisée `https://chevalier-ia-os.web.app/__/auth/handler`.
3. Fusionner la branche `v1` dans `main` sur GitHub : l'action publie le site automatiquement.

## Mettre à jour

1. Modifier le code, lancer les tests (ci dessous).
2. **Augmenter la version** dans les deux fichiers : `version.json` et `js/os/version.js` (par exemple `1.0.1`).
3. Pousser sur `main` : le déploiement est automatique. Les appareils déjà ouverts affichent "Nouvelle version disponible" avec un bouton "Recharger".

Les règles Firestore (`firestore.rules`) sont identiques à celles publiées dans la console ; elles ne sont pas déployées par l'action.

## Tests

Tous les tests tournent sur les **émulateurs Firebase** (projet `demo-chevalier-ia-os`), jamais sur les données réelles.

Prérequis sur le Mac : Node.js 20 ou plus, Java 21.

```sh
brew install openjdk@21        # ou tout autre JDK 21
export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
cd tests
npm install
npx playwright install chromium
npm test
```

`npm test` démarre les émulateurs Auth (9099) et Firestore (8080), lance les tests A (règles de sécurité), B (logique métier), D (contrôles statiques) puis C et D (parcours Playwright en 1440 × 900 et 390 × 844), et arrête les émulateurs.

Pour ouvrir l'appli sur les émulateurs à la main : lancer `npx firebase emulators:start --config ../firebase.json --project demo-chevalier-ia-os --only auth,firestore` depuis `tests/`, servir la racine du dépôt (`node tests/e2e/serveur.js`) puis ouvrir http://localhost:5050/?emulateurs=1.

## Organisation

```
index.html, manifest.webmanifest, version.json, robots.txt
css/        tokens.css (couleurs, thèmes, polices), os.css (coquille), crm.css (module CRM)
js/main.js  démarrage
js/os/      coquille : Firebase, connexion, routage, menu, objectifs communs, célébrations, version, composants
js/modules/crm/  module CRM ; logique.js contient toutes les règles métier pures (testées sans navigateur)
assets/     portraits, logo et baguette, polices du site, icônes PWA
tests/      tests (non publiés)
```

Ajouter un module : créer `js/modules/<nom>/index.js` (fonctions `demarrer`, `arreter`, `afficher`, `reglages`) et ajouter une entrée dans `js/os/modules.js`. Les collections du module sont préfixées (`<nom>_…`), les éléments communs par `os_`.
