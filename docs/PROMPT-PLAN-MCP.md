# Prompt de planification : serveur MCP et pièces jointes de Chevalier IA OS

À lancer dans une **nouvelle session Claude Code (application de bureau, sur le Mac de Jérôme) en mode Plan**, dans le dossier du projet, branche `idees-2-1`. Le mode Plan est en lecture seule : la session explore, pose ses questions, puis présente un plan que Jérôme approuve. **Aucun code ne s'écrit dans cette session avant l'approbation.**

## Comment lancer (pour Jérôme)

1. Ferme l'ancienne session.
2. Ouvre une nouvelle session sur le dossier `chevalier-ia-os` et choisis le mode **Plan** dans le sélecteur de mode de la session.
3. Vérifie que la branche est la bonne (le prompt le fait aussi) : `git branch --show-current` doit afficher `idees-2-1`.
4. Colle tout ce qui se trouve **sous la ligne `---`** ci-dessous.

---

Tu es en **mode Plan**. Tu **ne modifies aucun fichier** et tu **n'exécutes aucune commande qui écrit** (pas d'installation, pas de déploiement, pas de commit) avant que j'aie approuvé ton plan. Tu lis, tu cherches, tu vérifies dans la documentation officielle, tu me poses des questions, puis tu présentes un plan. Je suis non développeur, nous nous tutoyons, en français ; explique chaque notion technique en une phrase.

## Contexte

**Chevalier IA OS** est mon CRM (je quitte Notion). Dépôt GitHub privé `jeromechevalier-wq/chevalier-ia-os`. La version **2.0.0** est en ligne sur https://chevalier-ia-os.web.app (Firebase Hosting, projet Firebase `chevalier-ia-os`, Firestore, connexion Google). Elle est déployée par un workflow GitHub à chaque fusion sur `main` ; la 2.0.0 y a été fusionnée le 02/10/2026 (PR #2). Les comptes autorisés sont `jerome.chevalier@gmail.com` (Jérôme) et `jeromebot.chevalierbot@gmail.com` (Charles, la mascotte) ; d'autres utilisateurs (par exemple Paul) pourront s'ajouter.

**Besoin** : mes outils d'IA doivent lire **et écrire** dans la base de l'appli, avec les mêmes règles métier que l'écran, et **tout doit être tracé** :
- **Claude Code** sur mon Mac (outil principal) ;
- des **agents** qui travaillent sans mon Mac, le premier étant un **agent bibliothécaire** sur **Hermes Agent**, installé sur un VPS à moi (machine distincte de l'appli, qui est hébergée par Google). Il vérifie les liens cassés (wiki et documents), range et retrouve les documents, écrit dans le CRM et **fait les sauvegardes** ;
- n'importe quel autre outil, plus tard.

Et, dans l'appli sur le **téléphone** : joindre des documents à une affaire **par lien** ou **par téléversement** vers mon Google Drive.

## Lis d'abord (dans cet ordre)

1. `docs/cahier-mcp.md` : **le cahier des charges de ce chantier, source de vérité**. Mes réponses dans cette session prévalent sur lui ; signale-moi toute contradiction.
2. `docs/roadmap.md` : décisions et pistes.
3. `docs/cahier-des-charges-v2.0.md` (en particulier les sections 3 sur les données, 12 sur les exports, 14 sur la sécurité et le déploiement, 15 sur la recette) et `docs/decisions-construction-v2.md`, `docs/rapport-construction-v2.md`.
4. Le code : `firebase.json`, `.firebaserc`, `firestore.rules`, `.github/workflows/firebase-hosting.yml`, `js/os/` (en particulier `auth.js`, `firebase-config.js`, la liste des comptes autorisés), `js/modules/crm/` (en particulier `logique.js`, `donnees.js`, `fiche-affaire.js`), `tests/` (`package.json`, `logique.test.js`, `regles.test.js`, `statique.test.js`).

## Décisions déjà prises (ne les remets pas en cause, sauf contradiction technique que tu m'expliques)

1. **Un seul code, un seul déploiement, au même endroit que l'appli** : le serveur MCP est hébergé sur **Firebase (Cloud Functions)**, dans ce dépôt, publié par la même fusion sur `main`. Le forfait **Blaze est déjà activé**. Aucun serveur sur mon Mac ni sur mon VPS.
2. **Un seul serveur pour tous les clients**, avec **un jeton par client**, chaque jeton relié à un **nom d'acteur** (`hermes-bibliothecaire`, `claude-code-jerome`, nom de tout autre outil). Dans l'appli, l'acteur reste la personne connectée. Chaque écriture inscrit l'acteur dans le fil d'activité (champ `auteur`) et dans l'audit, avec la mention « via MCP ».
3. **Tous les droits pour les agents, suppression comprise**, mais **chaque écriture est tracée** dans une collection `crm_audit` avec **une copie de l'état avant** (pour pouvoir restaurer). Un outil de **restauration** existe.
4. **Lecture et écriture d'emblée** (je suis en phase de développement).
5. **Les règles métier ne sont pas dupliquées** : les fonctions réutilisent `js/modules/crm/logique.js`.
6. **Pièces jointes sur les affaires uniquement** (pas sur les personnes ni les organisations), par lien **et** par téléversement. Un seul dossier Drive `Jerome IA OS Attachments`, créé par l'appli à la première utilisation (je pourrai le renommer et le déplacer). Nommage automatique `AAAA-MM-JJ - <affaire> - <contenu>`.
7. Le bibliothécaire **fait les sauvegardes** (export complet), et on active en plus la **récupération à un instant donné** de Firestore côté Google.

## Contraintes absolues

1. **Ne jamais pousser sur `main`.** Tout passe par une branche et une Pull Request que je fusionne moi-même. Pas de `firebase deploy` à la main : le déploiement passe par la fusion sur `main`.
2. **Ne jamais toucher aux données réelles** : tests uniquement sur les émulateurs (`demo-chevalier-ia-os`). **Ne jamais lire, modifier ni supprimer la collection `crm_prospects`** (données de la version 1, que je supprimerai moi-même).
3. **Ne modifie pas `firestore.rules` sans me le soumettre** : la modification prévue (journal d'audit en lecture seule pour l'appli, éventuels nouveaux utilisateurs) fait partie du plan, je la validerai et je la publierai moi-même.
4. **Aucun secret dans le dépôt ni dans les journaux** : jetons dans le coffre-fort de secrets de Google (Secret Manager). Rien de secret dans le dossier du projet, qui est synchronisé avec Google Drive.
5. **Ne crée aucune clé, aucun jeton, aucun compte, aucun réglage Google Cloud à ma place** : guide-moi pas à pas, avec la page exacte de la console et les clics.
6. Interface et messages en français, tutoiement.
7. Chaque commande que tu me demandes de lancer est expliquée en une phrase, une commande par bloc.

## Pièges déjà repérés (le plan doit les traiter)

1. `firebase.json` publie la **racine du dépôt** (`"public": "."`) avec une liste d'exclusions : le dossier des fonctions doit y être exclu, sinon son code serait **servi publiquement** avec le site.
2. Le workflow actuel (`.github/workflows/firebase-hosting.yml`) ne déploie que Hosting, avec le compte de service du secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS`. Il faut l'étendre aux fonctions : vérifie les rôles Google nécessaires à ce compte de service et dis-moi exactement lesquels ajouter et où.
3. La 2.0 imposait « plan gratuit, aucune Cloud Function » : le README, le cahier et `tests/statique.test.js` contiennent des contrôles à adapter.
4. `logique.js` est écrit pour le navigateur (modules ES, sans compilation) : vérifie qu'il s'exécute tel quel dans l'environnement des fonctions (version de Node prise en charge, modules ES, absence d'API de navigateur) et propose le moyen de le partager sans le copier.
5. **Drive côté serveur** : un compte de service n'a pas de stockage dans un Drive personnel ; il faut un jeton OAuth de Jérôme (autorisation donnée une fois, gardé dans Secret Manager), et les fichiers créés par l'appli et par la fonction ne sont visibles des deux côtés qu'avec la même application Google (autorisation `drive.file`). C'est le point le plus incertain : **prévois un prototype en premier**, avec un repli (les agents déposent le fichier dans Drive autrement, la fonction crée la pièce par lien).
6. **Fichiers volumineux** (audio d'interview) : limite de taille de requête des fonctions ; propose un téléversement direct vers Drive.
7. Le téléversement depuis le téléphone, dans l'appli, passe directement par le navigateur vers Drive (pas par le MCP) : écran de consentement Google, origine autorisée, jeton de courte durée, réautorisation sur le téléphone (l'appli est installable en PWA).
8. Hermes Agent se connecte à un serveur MCP distant par **adresse + en-tête d'autorisation** et sait **filtrer les outils** : vérifie dans sa documentation officielle la version et le format de configuration, et prévois les deux niveaux de protection (filtre côté Hermes **et** liste d'outils autorisés par jeton côté serveur).

## Phase 0 : questions (avant le plan)

Pose-moi **toutes tes questions en une seule séquence**, avec l'outil de questions (4 questions par appel, valeur recommandée en premier, marquée « Recommandé »). Ne devine pas. Au minimum :
- région des fonctions et nom de l'adresse du serveur MCP (domaine de l'appli ou domaine de la fonction) ;
- quels outils exacts pour le bibliothécaire, et lesquels pour Claude Code ;
- format du nom d'acteur et du libellé « via MCP » ;
- fréquence et destination des sauvegardes, durée de conservation ;
- comment je veux ajouter de nouveaux utilisateurs (Paul) : par liste dans le code, ou autrement ;
- budget maximal et seuils d'alerte pour les fonctions ;
- tout écart que tu trouves entre le cahier, le code et ces consignes.

## Ce que le plan doit contenir

1. **Architecture** retenue et alternatives écartées (en une phrase chacune).
2. **Arborescence** des nouveaux fichiers et modifications de `firebase.json`, du workflow, du README.
3. **Outils MCP** : liste complète, avec pour chacun nom, paramètres, effet, trace d'audit, et **quels jetons y ont droit**.
4. **Authentification** : génération, stockage, rotation, révocation des jetons ; limitation du débit ; ce qui est enregistré (et jamais) dans les journaux.
5. **Journal d'audit** : schéma exact de `crm_audit`, garanties (écrit avant de répondre « succès »), restauration, durée de conservation, règles Firestore proposées (texte exact, que je validerai).
6. **Sauvegarde** : outil, destination, fréquence, restauration testée ; récupération à un instant donné : où l'activer.
7. **Pièces jointes** : modèle de données (liens, téléversement), nommage, dossier Drive, parcours sur téléphone, écran de consentement Google.
8. **Prototype Drive** : ce qu'on teste, critères de réussite, repli.
9. **Tests** : sur émulateurs (Auth, Firestore, Functions), un test nommé par comportement important (audit écrit même si l'écriture échoue, restauration, jeton révoqué refusé, acteur correct, suppression récupérable, doublons, règles de `logique.js`), plus la recette manuelle pour moi.
10. **Déploiement** : étapes dans l'ordre, une Pull Request par étape, ce que **je** dois faire dans la console (avec les pages exactes), ce que tu fais, retour arrière pour chaque étape.
11. **Coûts** : estimation honnête, alertes de budget, limite d'instances.
12. **Risques restants** classés, et ce que tu ne sais pas encore.
13. **Définition de « terminé »**, vérifiable : Hermes Agent crée et lit une fiche, l'audit montre « hermes-bibliothecaire », une suppression est restaurée, un jeton révoqué est refusé, un fichier téléversé depuis le téléphone apparaît dans la fiche de l'affaire et dans Drive, une sauvegarde est restaurable, `cd tests && npm test` passe entièrement.

Termine par une **récapitulation en dix lignes** que je puisse relire, puis demande mon approbation. Après approbation seulement : crée la branche `mcp` à partir de `idees-2-1`, écris le plan dans `docs/plan-mcp.md`, commite et pousse la branche (jamais `main`), et mets à jour `docs/roadmap.md`.
