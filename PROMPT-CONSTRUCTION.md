# Prompt de construction : Chevalier IA OS, version 1

Exécuté par Claude Code dans le cloud (tâche planifiée, effort élevé), sur le dépôt GitHub `jeromechevalier-wq/chevalier-ia-os`, qui contient déjà ce kit à sa racine (`docs/`, `ressources/`, ce fichier).

---

Tu construis la version 1 de **Chevalier IA OS** (coquille + module CRM) **en une seule fois, de bout en bout, sans me poser de question**. Je ne serai pas là pendant la construction : ne t'arrête qu'une fois l'appli terminée et tous les tests au vert.

## Sources

1. `docs/cahier-des-charges.md` est la **source de vérité unique**. Lis le en entier avant d'écrire la moindre ligne. En cas de doute, il prévaut sur tout le reste, y compris sur tes habitudes.
2. `docs/crm-decisions-entretien.md` donne le contexte des décisions (pour comprendre, pas pour ajouter des fonctionnalités).
3. `ressources/` contient les éléments de marque du site chevalier-ia.fr : portraits de Charles et Jérôme, logo et baguette en SVG, polices, `styles.css` (couleurs) et `tally-merci.html` (modèle des célébrations et de l'écran de connexion). Copie ce dont tu as besoin dans `assets/` ; réduis `charles-portrait.png` et `jerome-portrait.png` (WebP ou PNG optimisé, 512 px de large au plus) sans les redessiner ni les modifier. Ne publie pas le dossier `ressources/` (à ignorer dans `firebase.json`).

## Règles

1. Respecte exactement l'arborescence de la section 10, la configuration et les règles de la section 8, les identifiants de champs de la section 3.
2. **Aucune étape de compilation** pour l'appli : HTML, CSS, modules ES, SDK Firebase 12.19.0 depuis gstatic. `package.json` uniquement dans `tests/`.
3. **Plan gratuit Firebase** : aucune Cloud Function, aucun Cloud Storage. **Aucun service worker.**
4. **Ne touche jamais aux données réelles** : tous les tests passent par les émulateurs avec le projet `demo-chevalier-ia-os`. Ne lance aucune commande `firebase deploy`, ne publie pas de règles.
5. **Git** : travaille sur une branche `v1` créée à partir de `main`. Fais des commits réguliers (un par étape de la méthode) et **pousse la branche `v1` sur GitHub au fur et à mesure**, pour que rien ne soit perdu si la session s'interrompt. **Ne pousse jamais sur `main`** et n'ouvre pas de fusion : c'est moi qui fusionnerai, une fois la mise en ligne préparée. Ne commite jamais de fichiers d'installation (`node_modules`, navigateurs, journaux des émulateurs) : mets les dans `.gitignore`.
6. Si un point n'est pas couvert par le cahier, choisis la solution **la plus simple** qui respecte l'esprit du cahier, et note le dans `docs/decisions-construction.md` (une ligne par décision). N'ajoute aucune fonctionnalité absente du cahier.
7. Textes de l'interface en français, avec tutoiement ("Ajoute ton premier prospect").

## Méthode : une seule livraison, construite par étapes testées

Avance dans cet ordre. À la fin de chaque étape, lance les tests déjà écrits ; ne passe à l'étape suivante que lorsqu'ils sont tous au vert.

1. **Outillage de test** : `tests/package.json`, émulateurs Auth et Firestore dans `firebase.json`, script `npm test` qui démarre les émulateurs, lance tous les tests et les arrête. Installe ce qui manque dans ton environnement cloud (Java 21 pour les émulateurs, par exemple avec le gestionnaire de paquets du système ; Chromium pour Playwright, ou le Chromium déjà présent). Si une installation est impossible, dis le clairement dans le rapport final et continue tout ce qui n'en dépend pas.
2. **Sécurité** : `firestore.rules` et tests A (section 13.1).
3. **Logique métier** : `js/modules/crm/logique.js` (fonctions pures) et tests B. Écris les tests avant ou en même temps que le code, à partir du cahier.
4. **Coquille OS** : connexion Google (fenêtre surgissante sur ordinateur, redirection sur téléphone et en appli installée), contrôle des comptes autorisés, menu latéral repliable, thèmes sombre et clair, routage, détection de version, bandeau hors ligne, écran de connexion.
5. **Module CRM** : données, fiche, Liste avec filtres et recherche, Kanban, Accueil avec objectifs, À faire et statistiques, Réglages, export CSV et rappel d'export.
6. **Finitions** : célébrations, compteurs animés, états vides avec Charles, manifeste et icônes PWA générées à partir de la baguette, en têtes, `robots.txt`, `README.md`, `.github/workflows/firebase-hosting.yml`, `version.json` et `js/os/version.js` à `1.0.0`.
7. **Recette complète** : tests C (parcours Playwright, formats 1440 × 900 et 390 × 844) et D. Corrige et relance jusqu'à ce que **100 % des tests passent**, sans désactiver ni affaiblir un test. Vérifie visuellement quelques captures d'écran (Accueil, Kanban, fiche, connexion, menu replié et élargi, thème clair, format téléphone) et corrige ce qui est laid, illisible ou qui déborde.

## Définition de "terminé"

1. `cd tests && npm test` passe entièrement, depuis un clone propre.
2. Chaque critère de la section 13.1 correspond à au moins un test nommé explicitement.
3. Aucune erreur dans la console du navigateur pendant les parcours.

## Rapport final

Écris le aussi dans `docs/rapport-construction.md` (commité et poussé sur `v1`), puisque je lirai peut être le résultat plus tard. En français, court :

1. Résultat des tests (nombre par catégorie A, B, C, D).
2. Ce qui a été construit, en 5 lignes.
3. Le contenu de `docs/decisions-construction.md`.
4. Les actions manuelles qu'il me reste, dans l'ordre (section 14 du cahier), avec les commandes exactes pour un Mac.
5. Tout écart avec le cahier, s'il y en a, et pourquoi.
