# Cahier des charges : serveur MCP de Chevalier IA OS et pièces jointes

Brouillon du 02/10/2026, à valider par Jérôme avant tout code. Complète `roadmap.md`.

## 1. Objectif

Claude Code (Mac de Jérôme) et des agents (premier : **agent bibliothécaire**, sur Hermes Agent, VPS de Jérôme, machine distincte de l'appli) lisent **et écrivent** dans la base de Chevalier IA OS (Firestore, collections `crm_*`), avec les mêmes règles métier que l'écran. Chaque action est **tracée**. Parallèlement, l'appli permet de joindre des documents à une affaire par lien ou par téléversement vers Google Drive, depuis le téléphone.

## 2. Décisions de Jérôme

1. Lecture et écriture d'emblée, **tous les droits** pour les agents, **suppression comprise**.
2. Confiance et contrôle : tout est enregistré dans une table d'audit.
3. **Un seul code, un seul déploiement, au même endroit que l'appli** : le serveur MCP est hébergé sur Firebase (Cloud Functions, forfait Blaze, déjà activé par Jérôme), dans le même dépôt, déployé par la même fusion sur `main`. Pas de serveur sur le Mac, pas de serveur sur le VPS : tous les clients (Hermes Agent, Claude Code, tout autre outil, un futur utilisateur) se connectent à la même adresse avec leur jeton.
4. Le bibliothécaire : vérifie les liens cassés (wiki et liens de documents), range et retrouve les documents, écrit dans le CRM, **fait les sauvegardes**.
5. Pièces jointes **sur les affaires uniquement**, par lien ou par téléversement ; un seul dossier Drive `Jerome IA OS Attachments` créé par l'appli ; nommage `AAAA-MM-JJ - <affaire> - <contenu>`.

## 3. Architecture

- **Couche métier** (`functions/coeur/` ou équivalent) : fonctions qui réutilisent `js/modules/crm/logique.js` (déjà testé) et écrivent dans Firestore avec le SDK d'administration. Aucune règle métier dupliquée.
- **Façade MCP** : une fonction HTTP (Cloud Function, adresse servie par le domaine de l'appli ou par celui de la fonction) qui parle le protocole MCP en HTTP. Un outil par fonction métier.
- **Aucun fichier de clé** : la fonction tourne avec l'identité du projet Google. Rien à stocker sur le Mac ni sur le VPS.
- **Authentification par jeton, un jeton par client**, chaque jeton relié à un nom d'acteur (`hermes-bibliothecaire`, `claude-code-jerome`, nom de tout autre outil). Jetons longs et aléatoires, stockés dans le coffre-fort de secrets de Google (jamais dans le dépôt), révocables séparément. Hermes Agent se configure avec adresse + en-tête d'autorisation.
- **Acteur** : le nom du jeton s'inscrit dans `auteur` du fil d'activité (comme Jérôme ou Charles aujourd'hui), avec la mention « via MCP », et dans l'audit. Dans l'appli, l'acteur reste la personne connectée (Jérôme, Charles, et tout futur utilisateur comme Paul).
- **Même dépôt, même déploiement** : la fusion sur `main` publie le site **et** les fonctions (le workflow de déploiement est étendu ; jamais de déploiement à la main).

## 4. Outils (première liste)

- **Lecture** : chercher (personnes, organisations, affaires), lire une personne / organisation / affaire avec son fil, lister affaires et tâches, lister les documents joints (pour contrôle des liens), lire les réglages.
- **Écriture** : créer et modifier personne, organisation, affaire ; changer l'étape ; gagnée / perdue (pas de pause depuis le 22/10/2026) ; ajouter note, activité, encaissement ; terminer une activité ; joindre un document par lien ; téléverser un document dans Drive puis le joindre ; supprimer personne, organisation, affaire.
- **Sauvegarde** : exporter toutes les collections en JSON (même format que « Exporter mes données »).
- **Audit** : lire le journal d'audit ; **restaurer** un document depuis une entrée d'audit.

## 5. Journal d'audit

Collection `crm_audit`, une entrée par écriture, **créée avant** de renvoyer le succès :
`date` (serveur), `acteur`, `outil`, `collection`, `docId`, `avant` (copie complète du document avant la modification ou la suppression), `apres`, `parametres`, `resultat`.

Conséquence : une suppression est tracée **et récupérable** (le contenu est dans `avant`). Tracer ne suffit pas : sans copie de l'état d'avant, on saurait ce qui a disparu mais pas le rétablir.

**Protection du journal** : les règles actuelles de Firestore autorisent Jérôme et Charles à tout modifier. Pour que le journal ne puisse pas être modifié ni effacé depuis l'appli, il faut une **modification de `firestore.rules`** (lecture seule pour les comptes de l'appli sur `crm_audit`). Les serveurs MCP écrivent avec la clé d'administration, qui contourne les règles. Cette modification est la seule dans `firestore.rules` : elle est soumise à Jérôme et publiée par lui.

## 6. Sauvegardes

L'agent bibliothécaire déclenche l'export régulier (outil de sauvegarde) vers un dossier Drive dédié. Un agent qui a tous les droits ne doit pas être la seule protection de ses propres erreurs : en plus, activer la **récupération à un instant donné** de Firestore côté Google (indépendante des agents).

## 7. Pièces jointes dans l'appli (téléphone)

- Onglet « G-Drive » de l'affaire : bouton « Ajouter un lien » (existant) et « Téléverser un fichier » (nouveau).
- Téléversement : autorisation Google Drive limitée aux fichiers créés par l'appli (`drive.file`), demandée à l'écran. Le dossier `Jerome IA OS Attachments` est créé à la première utilisation ; son identifiant est gardé dans les réglages. Jérôme peut le renommer et le déplacer.
- Réglages Google Cloud (écran de consentement, origine autorisée) : faits par Jérôme.

## 8. Risques et points à prototyper en premier

1. **Drive côté serveur** : un compte de service n'a pas d'espace de stockage dans un Drive personnel. Pour que la fonction téléverse dans le Drive de Jérôme, il faut un jeton de Jérôme (autorisation donnée une fois), gardé dans le coffre-fort de secrets. Les fichiers créés par l'appli et par la fonction ne sont visibles des deux côtés qu'avec la même application Google : **à valider par un essai** avant de s'engager. Sans résultat, repli : les agents déposent le fichier dans Drive par un autre moyen, puis le serveur crée la pièce **par lien**.
2. **Fichiers volumineux** (audio d'interview) : une fonction a une limite de taille de requête. Le téléversement des gros fichiers doit aller directement vers Drive, pas à travers la fonction.
3. **Jetons des clients** : ce sont les clés d'accès à la base entière. Longs, aléatoires, un par client, révocables, jamais dans les journaux.
4. **Agents autonomes** : un agent qui se trompe peut écrire beaucoup de mauvaises données. Parades : audit, restauration, récupération à un instant donné.
5. **Coûts** : Blaze est actif ; prévoir une alerte de budget et limiter le nombre d'instances de la fonction.
6. **Cohérence** : toute évolution de `logique.js` doit rester compatible avec la fonction (les tests de la logique servent aux deux).
7. **Publication du dossier des fonctions** : `firebase.json` publie aujourd'hui la racine du dépôt (`public: "."`) avec une liste d'exclusions. Le dossier des fonctions doit y être exclu, sinon son code serait servi publiquement avec le site.
8. **Règle de la 2.0 à lever** : la 2.0 imposait « aucune Cloud Function, plan gratuit ». Le README et les contrôles statiques doivent être mis à jour.

## 9. Ordre de travail

1. Valider ce cahier, puis un plan détaillé (session en mode plan).
2. Prototype Drive côté serveur (point 8.1).
3. Couche métier + audit + outils de lecture, avec tests sur les émulateurs.
4. Outils d'écriture, suppression, restauration, sauvegarde.
5. Authentification par jetons ; déploiement des fonctions via le workflow.
6. Branchement de Hermes Agent, puis de Claude Code.
7. Téléversement depuis le téléphone dans l'appli.
8. Modification de `firestore.rules` pour le journal (et, si nécessaire, pour de nouveaux utilisateurs), publiée par Jérôme.
