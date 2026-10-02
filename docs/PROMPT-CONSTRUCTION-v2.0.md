# Prompt de construction : Chevalier IA OS, version 2.0

À lancer dans Claude Code (cloud, effort élevé) sur le dépôt GitHub `jeromechevalier-wq/chevalier-ia-os`, branche `main` (version 1.0.0 en ligne). Jérôme est présent **au lancement uniquement** : il répond aux questions de la phase 0, puis la construction se déroule seule, d'un bout à l'autre.

---

Tu construis la **version 2.0.0 de Chevalier IA OS** : tu **gardes la coquille** de la version 1.0.0 (connexion Google, règles Firestore, menu, thèmes, déploiement, outillage de test) et tu **reconstruis le module CRM** autour de trois tables : **Personnes, Organisations, Affaires**. La construction se fait **en une seule fois**, mais **commence obligatoirement par la phase 0**.

## Phase 0 : questions et autorisations (OBLIGATOIRE, avant toute autre action)

Une fois la construction lancée, je ne répondrai plus. Tout ce qui est flou ou non autorisé doit donc être réglé **maintenant**.

1. Lis en entier `docs/cahier-des-charges-v2.0.md` (source de vérité) et `docs/pipedrive-reference.md`. Parcours aussi le code existant (`js/os/`, `js/modules/crm/`, `tests/`, `firebase.json`, `firestore.rules`).
2. **Avant d'écrire ou de modifier le moindre fichier**, pose moi **toutes** ces questions, en une seule séquence, avec l'outil de questions (4 questions par appel, autant d'appels que nécessaire ; la valeur par défaut en premier, marquée "recommandé"). Si l'outil de questions n'est pas disponible, écris les questions dans ta réponse et attends mes réponses :
   1. **Toutes les autorisations** listées en section 17.10 du cahier (branche `v2`, remplacement du module CRM v1, installations, émulateur, README et version, interdictions de déploiement et de push sur `main`).
   2. **Chaque point des sections 17.1 à 17.9** du cahier.
   3. **Toute autre question sans réponse** que tu as repérée en lisant le cahier, le code ou la note de référence : contradiction, champ ambigu, comportement non décrit, écart entre le cahier et le code existant. Ne devine pas : demande.
3. Quand j'ai répondu : **résume en cinq lignes** ce que tu as compris, écris ce résumé et mes réponses dans `docs/decisions-construction-v2.md`, puis **ne me pose plus aucune question**. Pour tout doute qui apparaît ensuite, choisis la solution **la plus simple** conforme à l'esprit du cahier et note la dans ce fichier (une ligne par décision).

## Sources

1. `docs/cahier-des-charges-v2.0.md` : **source de vérité unique**. En cas de doute, il prévaut sur la version 1.1, sur la note de référence et sur tes habitudes. Mes réponses de la phase 0 prévalent sur les valeurs par défaut du cahier.
2. `docs/pipedrive-reference.md` : description des écrans de Pipedrive dont on s'inspire (structure et vocabulaire, jamais la marque, les icônes ni les textes).
3. `docs/cahier-des-charges.md` (version 1.1), `docs/crm-decisions-entretien.md`, `docs/decisions-construction.md` : **contexte seulement**, pour comprendre le code existant.
4. Le code de `main` : conserve `js/os/` (adapte seulement ce que le cahier indique), `css/tokens.css`, `css/os.css`, `assets/`, `firestore.rules`, `.github/`, l'outillage de `tests/`. Remplace le module `js/modules/crm/` et `css/crm.css`.

## Règles

1. **Aucune étape de compilation** pour l'appli : HTML, CSS, modules ES, SDK Firebase 12.19.0 depuis gstatic. `package.json` uniquement dans `tests/`.
2. **Plan gratuit Firebase** : aucune Cloud Function, aucun Cloud Storage. **Aucun service worker.**
3. **Ne touche jamais aux données réelles** : tous les tests passent par les émulateurs, projet `demo-chevalier-ia-os`. Aucun `firebase deploy`, aucune publication de règles. **Ne lis, ne modifie et ne supprime jamais la collection `crm_prospects`** de production ; l'appli v2 ne l'utilise pas.
4. **Git** : travaille sur une branche `v2` créée à partir de `main`. Un commit par étape de la méthode ; **pousse `v2` au fur et à mesure**, pour que rien ne soit perdu si la session s'interrompt. **Ne pousse jamais sur `main`.** N'ouvre pas de Pull Request, sauf si je l'ai autorisé en phase 0. Ne commite jamais `node_modules`, navigateurs ni journaux des émulateurs (`.gitignore`).
5. **Création minimale** : le nom suffit pour une personne ou une organisation, le titre pour une affaire (section 7.1 du cahier). Aucun astérisque, aucun formulaire en sections.
6. **Champs de saisie intelligents** partout où le cahier les prévoit (section 8) : un seul composant `champIntelligent`, sa logique de recherche pure dans `logique.js`.
7. **Ordinateur et téléphone à égalité** : chaque écran est conçu et testé à **1440 × 900 et à 390 × 844** (section 7.10 : deux colonnes, tableaux denses, Kanban pleine largeur, raccourcis clavier sur ordinateur ; une colonne et cartes aérées sur téléphone).
8. **Aucune requête Firestore composite** (section 3.1.5) : une seule condition par requête, le reste dans le navigateur.
9. Interface en français, tutoiement ("Ajoute ta première personne"). Vocabulaire du cahier : Personnes, Organisations, Affaires, Activités, Étiquettes, Résumé, Détails, Historique, Points clés.
10. **N'ajoute aucune fonctionnalité** absente du cahier (pas de Projets, pas d'import, pas de fusion de doublons).

## Méthode : une seule livraison, construite par étapes testées

À la fin de chaque étape, lance les tests déjà écrits ; ne passe à l'étape suivante que lorsqu'ils sont tous au vert.

1. **Outillage de test** : adapte celui de la version 1.0.0 (`tests/package.json`, émulateurs Auth et Firestore, `npm test`). Installe ce qui manque dans ton environnement cloud (Java 21, Chromium). Si une installation est impossible, dis le clairement dans le rapport final et continue tout ce qui n'en dépend pas.
2. **Sécurité** : tests A (section 15.1) sur les nouvelles collections ; `firestore.rules` ne change pas.
3. **Logique métier d'abord** : `js/modules/crm/logique.js` (fonctions pures : nom, doublons, recherche intelligente, statut, retard, suggestions, objectifs, graphique depuis le début d'activité, filtres, intégrité, export) et tests B. Écris les tests avant ou en même temps que le code, à partir du cahier. Reprends de la version 1.0.0 les morceaux de logique encore valables (dates, objectifs, CSV), avec leurs tests.
4. **Données et composant commun** : `donnees.js` (écouteurs, écritures, intégrité des liens), `champIntelligent` dans `js/os/ui.js`.
5. **Personnes et Organisations** : listes, fenêtres de création, fiches, doublons.
6. **Affaires** : Kanban, liste, archives, fiche, étapes, statuts, suggestions, encaissements.
7. **Activités, notes, historique, Points clés**, puis **Accueil** : objectifs, graphique du chiffre d'affaires depuis octobre 2026 (ou la valeur choisie en phase 0), statistiques, rappel d'export.
8. **Réglages, export (JSON et CSV), recherche globale, bouton "+" et raccourcis clavier**.
9. **Finitions** : célébrations, états vides avec Charles, compteurs animés, menu et routes, `README.md`, `version.json` et `js/os/version.js` à **2.0.0**.
10. **Recette complète** : tests C et D à 100 %. Corrige et relance jusqu'à ce que tout passe, **sans désactiver ni affaiblir un test**. Vérifie visuellement des captures d'écran aux deux formats (Accueil, Personnes, fenêtre "Ajouter une personne" avec suggestions, fiche personne, fiche affaire, Kanban des affaires, menu replié et élargi, thème clair) et corrige ce qui est laid, illisible ou qui déborde.

## Définition de "terminé"

1. `cd tests && npm test` passe entièrement, depuis un clone propre.
2. Chaque critère de la section 15.1 du cahier correspond à au moins un test nommé explicitement.
3. Aucune erreur dans la console du navigateur pendant les parcours, aucun défilement horizontal de la page à 390 px.
4. Créer une personne en ne tapant que son nom fonctionne, sur ordinateur et sur téléphone.

## Rapport final

Écris le aussi dans `docs/rapport-construction-v2.md` (commité et poussé sur `v2`). En français, court :

1. Résultat des tests (nombre par catégorie A, B, C, D).
2. Ce qui a été construit, en 5 lignes.
3. Le contenu de `docs/decisions-construction-v2.md`.
4. Les actions manuelles qu'il me reste, dans l'ordre (section 16 du cahier), avec les commandes exactes pour un Mac.
5. Tout écart avec le cahier, s'il y en a, et pourquoi.
