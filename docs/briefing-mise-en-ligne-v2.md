# Briefing technique : mettre Chevalier IA OS 2.0.0 en ligne (à coller dans la session qui a GitHub et l'ordinateur de Jérôme)

## Rôle de la session

Accompagner Jérôme (non développeur, tutoiement, français) pas à pas pour publier la version 2.0.0 de **Chevalier IA OS** : relire et fusionner la Pull Request, vérifier le déploiement, faire la recette, nettoyer. Une étape à la fois, commandes exactes pour **Mac**, confirmation avant toute action irréversible.

## État actuel (vérifié le 02/10/2026)

- Dépôt GitHub **privé** : `jeromechevalier-wq/chevalier-ia-os`.
- `main` = `06b714a` (version 1.0.0, en ligne sur https://chevalier-ia-os.web.app).
- Branche **`v2`** = `61080f5`, poussée sur GitHub. La branche `ccr-97f33a28-bccj8x` est au même commit (branche de session, sans intérêt). **Aucune Pull Request n'est ouverte** (Jérôme voulait l'ouvrir lui-même).
- Contenu de `v2` par rapport à `main` : cahier v2.0 + prompt + note Pipedrive (`docs/`), module CRM entièrement refait (`js/modules/crm/`), composants communs (`js/os/ui.js`, `shell.js`, `modules.js`), `css/`, tests, `version.json` et `js/os/version.js` à **2.0.0**, README. **`firestore.rules` identique à `main`** (0 ligne de différence).
- Tests (sur émulateurs, projet `demo-chevalier-ia-os`) tous au vert au dernier passage : A 45/45, B 112/112, D statiques 23/23, parcours Playwright 98 réussis et 2 ignorés (clavier, ordinateur seulement). Détail : `docs/rapport-construction-v2.md`. Décisions : `docs/decisions-construction-v2.md`. Référence : `docs/cahier-des-charges-v2.0.md` (recette manuelle en 15.2, actions manuelles en 16).
- **Déploiement** (`.github/workflows/firebase-hosting.yml`) : se déclenche **uniquement sur push vers `main`** (`FirebaseExtended/action-hosting-deploy@v0`, canal `live`, projet `chevalier-ia-os`, secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS`). Il n'y a **ni test automatique ni aperçu** sur les Pull Requests : la fusion = mise en ligne immédiate.
- Données : Firestore `(default)`, `europe-west9`. La v2 utilise 9 collections (`crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_activites`, `crm_notes`, `crm_evenements`, `crm_parametres`, `os_objectifs`, `os_objectifs_saisies`) et **ne lit ni ne modifie `crm_prospects`** (données de la v1, à repartir de zéro). Les règles Firestore (jokers, deux comptes vérifiés `jerome.chevalier@gmail.com` et `jeromebot.chevalierbot@gmail.com`) couvrent déjà les nouvelles collections : **rien à publier**.

## Ce qui reste à faire (dans l'ordre)

### 1. Avant de fusionner (sur le Mac, facultatif mais recommandé)
```sh
git clone https://github.com/jeromechevalier-wq/chevalier-ia-os.git   # ou git fetch si déjà cloné
cd chevalier-ia-os && git checkout v2
brew install openjdk@21 && export PATH="$(brew --prefix openjdk@21)/bin:$PATH"   # Java 21 pour les émulateurs
cd tests && npm install && npx playwright install chromium && npm test
```
Attendu : tout au vert (environ 4 minutes). Si un parcours de glisser déposer échoue une fois, relancer ; c'est un artefact connu de Chromium sans écran (décision 17), pas un défaut de l'appli.

### 2. Pull Request `v2` → `main`
- Ouvrir la PR, relire le résumé (`docs/rapport-construction-v2.md`), vérifier que `firestore.rules` n'apparaît pas dans les fichiers modifiés.
- **Vérifier avant de fusionner** que le secret GitHub `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS` existe (Settings → Secrets and variables → Actions) : la v1 a été publiée avec, donc il doit être là.
- Fusionner (« Merge pull request » ; pas de squash obligatoire). Ne jamais pousser directement sur `main`.

### 3. Vérifier le déploiement
- Onglet Actions du dépôt : le workflow « Déploiement Firebase Hosting » doit finir vert (1 à 2 minutes).
- `curl -s https://chevalier-ia-os.web.app/version.json` doit renvoyer `{"version": "2.0.0"}`.
- Les onglets déjà ouverts affichent « Nouvelle version disponible » avec « Recharger ». Aucun service worker : si l'ancienne version s'affiche, recharger sans cache.

### 4. Premier lancement en production (vérifier, ne rien forcer)
Au premier lancement connecté, l'appli crée toute seule les documents manquants :
- `crm_parametres/etiquettes` (4 étiquettes de départ) ;
- `crm_parametres/filtres` : **remplacé** par les filtres de départ de la v2 (le document de la v1 n'a pas `version: 2`, il est ignoré puis écrasé) ;
- `crm_parametres/reglages` : le document de la v1 n'a pas `debutActivite` ; l'appli applique `2026-10` par défaut en mémoire, et il s'écrit quand Jérôme le modifie dans Réglages ;
- `os_objectifs` existe déjà (mêmes 6 identifiants qu'en v1).
Contrôles : Accueil (6 objectifs, graphique limité à octobre 2026), Réglages (étiquettes, début d'activité, bouton Exporter), console du navigateur sans erreur (en particulier aucune erreur « The query requires an index » : toutes les requêtes n'ont qu'une condition d'égalité).

### 5. Recette manuelle (cahier 15.2, environ 10 minutes, Jérôme au clavier)
1. Mac : ouvrir l'adresse, se connecter avec `jerome.chevalier@gmail.com` (Google).
2. Fenêtre de navigation privée avec un autre compte Google : « Accès refusé ».
3. **Chronomètre** : créer une personne en ne tapant que son nom → moins de 10 secondes.
4. Créer une organisation à la volée depuis la fenêtre d'une autre personne (champ « Organisation », taper 2 lettres, « Créer … »), puis la retrouver en retapant 2 lettres.
5. Depuis une fiche personne, « + Affaire », la faire avancer jusqu'à Gagné (feu d'artifice) puis Facture payée ; vérifier l'objectif chiffre d'affaires ; **supprimer ensuite ces données de test** (Supprimer définitivement, nom exigé).
6. Téléphone : ouvrir l'adresse, se connecter (redirection Google sur mobile), installer sur l'écran d'accueil, créer une personne, ajouter une note dictée.
7. Réglages → « Exporter mes données » : ouvrir le JSON, puis exporter un CSV d'une liste et l'ouvrir dans Excel.
8. Se connecter une fois avec le compte de Charles (`jeromebot.chevalierbot@gmail.com`).

Points de vigilance jamais testés sur le vrai Firebase (testés seulement sur émulateur) : la connexion Google réelle (inchangée depuis la v1), la latence Firestore réelle, l'impression des dates en fuseau Europe/Paris sur le téléphone.

### 6. Nettoyage (action de Jérôme uniquement, dans la console)
- Quand il le souhaite : console Firebase → Firestore Database → supprimer la collection `crm_prospects` (la v2 ne l'utilise pas). **La session ne supprime rien en production** ; elle guide seulement.
- Supprimer les éventuelles données de test créées pendant la recette.

### 7. Après la mise en ligne
- Premier export réel (`reglages.dernierExport` s'écrit à chaque export complet) : faire un premier export réel pour désactiver le rappel de l'Accueil.
- Prochaine version **2.1** (non commencée) : écran Projets (Kanban de phases, lien `projetId` depuis une affaire gagnée) et **copie quotidienne vers Google Sheet par n8n**. Hors périmètre de la 2.0 : import CSV, fusion de doublons, prévisions en euros, envoi d'e-mails depuis la fiche, mode hors ligne.

## Retour arrière si quelque chose casse
`git revert -m 1 <commit de fusion>` sur une branche, PR, fusion : le workflow redéploie la v1 (`version.json` repasse à 1.0.0, ce qui déclenche aussi le bandeau « Nouvelle version »). Les nouvelles collections Firestore créées par la v2 restent en place et ne gênent pas la v1.

## Règles pour la session
- Ne pas déployer à la main (`firebase deploy`) ni publier de règles : le déploiement passe par la fusion sur `main`.
- Ne jamais pousser sur `main` directement, ne rien supprimer des données de production, ne pas modifier `firestore.rules`.
- Expliquer chaque commande en une phrase ; attendre la confirmation de Jérôme avant la fusion et avant toute suppression.
- En cas de problème de connexion Google après mise en ligne : vérifier dans Google Cloud Console (projet `chevalier-ia-os`, Identifiants, client OAuth « Web client (auto created by Google Service) ») que l'URI de redirection `https://chevalier-ia-os.web.app/__/auth/handler` est bien autorisée (déjà fait pour la v1).
