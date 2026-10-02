# Journal de la mise en ligne de la version 2.0.0

Session du 02/10/2026, Jérôme guidé pas à pas (briefing de départ : `briefing-mise-en-ligne-v2.md`).

## Ce qui a été fait

| Étape | Résultat |
|---|---|
| Vérifications avant fusion | `main` = `06b714a` (1.0.0 en ligne). `v2` poussée ; un seul commit ajouté depuis le briefing (`44d1dcf`, le briefing lui-même). `firestore.rules`, `firebase.json` et `.github/` absents des fichiers modifiés par la PR. Secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS` présent. |
| Tests sur le Mac (étape 1) | **Non faits**, choix de Jérôme (résultats du dernier passage avant la session : règles 45/45, logique 112/112, contrôles statiques 23/23, parcours Playwright 98 réussis et 2 ignorés). |
| Pull Request | [PR #2](https://github.com/jeromechevalier-wq/chevalier-ia-os/pull/2) « Version 2.0.0 : module CRM refait », `v2` vers `main`, 6 commits, 40 fichiers. |
| Fusion | Faite par la session, sur confirmation explicite de Jérôme. **Commit de fusion : `28788e0`.** |
| Déploiement | Workflow « Déploiement Firebase Hosting #2 » : 49 s. `https://chevalier-ia-os.web.app/version.json` renvoie `{"version": "2.0.0"}`. |
| Documents ajoutés ensuite | [PR #3](https://github.com/jeromechevalier-wq/chevalier-ia-os/pull/3) (`870696f`) : `roadmap.md`, `cahier-mcp.md`, `PROMPT-PLAN-MCP.md`. Déploiement #3 : 49 s, appli inchangée. |

## Premier lancement en production (vu par Jérôme)

- Accueil : 6 objectifs, graphique limité à octobre 2026, rappel de sauvegarde mensuelle affiché (normal avant un premier export).
- Réglages : s'ouvrent normalement (offres, secteurs).
- Console du navigateur : aucune erreur rouge, aucune erreur « requires an index ». Les « 43 issues » de Chrome sont des remarques (par exemple l'autofocus), non examinées une à une.

## Recette manuelle (section 5 du briefing)

| Point | État |
|---|---|
| 1. Connexion `jerome.chevalier@gmail.com` | OK (après l'incident ci-dessous) |
| 2. Accès refusé avec un autre compte Google | **Non fait** (choix de Jérôme) ; sécurité couverte par les 45 tests de règles, règles inchangées |
| 3. Chronomètre, création d'une personne en moins de 10 s | **Non fait** (choix de Jérôme) |
| 4. Organisation créée à la volée | OK |
| 5. Affaire jusqu'à Gagné puis encaissement ; objectif chiffre d'affaires | OK : l'Accueil affiche 99 € |
| 6. Téléphone (installation, personne, note dictée) | **À faire** |
| 7. Export JSON et CSV | **À faire** (le rappel de l'Accueil disparaît après le premier export) |
| 8. Connexion avec le compte de Charles | OK (Accueil « Bonjour Charles ») |

**Données de test présentes en production**, à supprimer par Jérôme dans l'appli (la liste n'est pas exhaustive) : l'affaire « Affaire reseaux sociaux » (99 €, Ingrid), l'organisation « Société de Ingrid », l'organisation « depannage Carrel » avec la personne Eliot, la personne « micheline », et toute affaire créée pour essai.

## Incident de connexion

Une connexion de `jerome.chevalier@gmail.com` a affiché chez Google : **« Erreur 400 : redirect_uri_mismatch »**. Après déconnexion, puis reconnexion depuis `https://chevalier-ia-os.web.app`, la connexion a fonctionné pour Jérôme et pour Charles. **Cause non confirmée** : sans doute l'adresse ou la fenêtre d'où la connexion avait été lancée. Le code de connexion (`js/os/auth.js`) est identique à celui de la 1.0.0 ; le domaine d'authentification est `chevalier-ia-os.web.app`. Si l'erreur revient : cliquer sur « détails de l'erreur », relever la ligne `redirect_uri=…`, puis vérifier dans Google Cloud (projet `chevalier-ia-os`, Identifiants, client OAuth « Web client (auto created by Google Service) ») que `https://chevalier-ia-os.web.app/__/auth/handler` est autorisée.

## Constats sur le produit (à garder pour la suite)

- Une affaire ne porte qu'**une seule personne** (`personneId`).
- La section « Documents » d'une affaire n'enregistre que des **liens** (libellé + adresse) : aucun fichier n'est stocké, l'appli n'a aucun accès à Google Drive. Un lien Drive contient l'identifiant du fichier, donc renommer ou déplacer le fichier ne casse pas le lien ; le libellé affiché ne suit pas.
- Les fiches personne et organisation n'ont **pas** de section « Documents ».
- Suites décidées : voir `roadmap.md`, `cahier-mcp.md` et `PROMPT-PLAN-MCP.md`.

## Retour arrière (inchangé)

`git revert -m 1 28788e0` sur une branche, puis Pull Request et fusion : le workflow redéploie la 1.0.0. Les collections créées par la 2.0 restent en base ; les filtres enregistrés de la 1.0.0 (`crm_parametres/filtres`) ont été remplacés au premier lancement et ne sont pas récupérés par un retour arrière.

## Outillage constaté

`gh` (ligne de commande GitHub) n'est pas installé sur le Mac : la Pull Request a été ouverte et fusionnée par le navigateur intégré de l'application Claude, où Jérôme est connecté à GitHub.

## Reste à faire

1. Recette points 6 et 7 ; points 2 et 3 si Jérôme le souhaite.
2. Suppression des données de test (Jérôme, dans l'appli).
3. Premier export réel.
4. Suppression de la collection `crm_prospects` dans la console Firebase (Jérôme seul, après l'export).
5. Session en mode Plan pour le serveur MCP (`PROMPT-PLAN-MCP.md`).
6. Mise à jour du wiki de Jérôme : Firebase est passé au forfait Blaze le 02/10/2026 (alerte de budget conseillée).
