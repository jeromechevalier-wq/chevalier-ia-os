# Roadmap

Tenue à jour à chaque discussion sur l'évolution de l'appli. Dernière mise à jour : 02/10/2026, après la mise en ligne de la 2.0.0.

Légende : **décidé** = validé par Jérôme ; **piste** = à trancher avant le cahier des charges.

## Priorité : Claude Code et les agents lisent et écrivent dans la base

Cahier des charges détaillé : `cahier-mcp.md` (brouillon du 02/10/2026).

- **Décidé** : c'est **indispensable**. Chevalier IA OS devient le CRM de Jérôme (aujourd'hui Notion), Claude Code sur son ordinateur est son outil principal, et des agents IA automatiseront ensuite. Ils doivent pouvoir interroger la base et y écrire, comme avec Notion.
- **Décidé** : on est en phase de développement, donc **lecture et écriture d'emblée**, sans phase en lecture seule. Les pièces jointes par lien **et** par téléversement Drive font partie du même chantier.
- **Décidé** : **un seul code, un seul déploiement, au même endroit que l'appli** : le serveur MCP est hébergé sur Firebase (Cloud Functions, forfait Blaze déjà activé), dans le même dépôt, publié par la même fusion sur `main`. Tous les clients (Hermes Agent sur son VPS, Claude Code, tout autre outil, un futur utilisateur) se connectent à la même adresse avec un **jeton par client**, relié à un nom d'acteur tracé dans le fil et dans l'audit.
- Premier agent : **agent bibliothécaire** sur Hermes Agent (VPS de Jérôme, machine distincte). Hermes Agent sait se connecter à un serveur MCP distant (adresse + jeton, filtrage des outils).
- **Piste recommandée** : une couche de fonctions métier (qui réutilise `logique.js`, déjà testé, pour que les écritures suivent exactement les règles de l'écran : fil d'activité, dates, doublons, objectifs), et le serveur MCP comme façade mince par-dessus. Dossier `mcp/` dans le dépôt.
  - Outils prévus : chercher personnes, organisations et affaires ; lire une affaire et son fil ; créer personne, organisation, affaire ; ajouter note ou activité ; changer l'étape ; joindre un document (par lien ou par téléversement dans Drive).
  - Aucune clé secrète sur le Mac ni sur le VPS : la fonction tourne avec l'identité du projet Google.
- **Piste, plus tard** : une façade API REST sur la même couche de fonctions, si un outil qui ne parle pas MCP en a besoin (webhooks, n8n, formulaires).
- **À étudier** : migration des fiches Notion existantes (l'import CSV est hors périmètre de la 2.0).
- **Décidé** : tous les droits pour les agents, suppression comprise, avec un journal d'audit (collection `crm_audit`, copie de l'état avant chaque modification) pour tout tracer et pouvoir restaurer. L'agent bibliothécaire fait aussi les sauvegardes.

## Version 2.1

### Déjà prévu
- Écran Projets (Kanban de phases, lien `projetId` depuis une affaire gagnée).
- Copie quotidienne vers Google Sheet par n8n.
(voir `rapport-construction-v2.md`)

### Pièces jointes sur les affaires
- **Décidé** : les pièces jointes se rattachent aux **affaires uniquement**, pas aux personnes ni aux organisations. Raison : rester simple ; dès qu'on travaille avec quelqu'un, il y a une affaire.
- **À surveiller** : une interview JTBD d'une personne qui n'aura jamais d'affaire. Remède simple si le cas se présente : ouvrir une affaire au stade « Premier contact ». Le modèle par liens (`personneId`, `organisationId`, `affaireId`) permet d'ajouter les personnes plus tard sans refonte.
- **Décidé** : deux modes qui coexistent.
  - **Par lien** : on colle le lien Drive d'un fichier rangé à la main (devis fait à la main dans le dossier `devis` d'un projet). Aucune autorisation Google. À faire en premier.
  - **Par téléversement** : depuis le téléphone, on choisit un fichier, il part dans Google Drive et la pièce apparaît sur la fiche de l'affaire.
- Une pièce peut être reliée à plusieurs affaires sans copier le fichier.

### Téléversement vers Google Drive
- **Décidé** : un seul dossier `Jerome IA OS Attachments`, sans sous-dossiers par client ou projet. L'appli gère le rangement, le tri et la recherche. Les dossiers de travail de Jérôme (un par projet, `devis`, etc.) restent tels quels et se relient par lien.
- **Décidé** : c'est l'appli qui **crée** le dossier à la première utilisation et garde son identifiant. Jérôme peut ensuite le renommer et le déplacer à sa guise dans son Drive : l'appli le retrouve par identifiant. Il ne doit pas le supprimer.
- **Décidé** : nommage automatique `AAAA-MM-JJ - <affaire> - <contenu>`, par exemple `2026-10-02 - depannage Carrel - devis`. Le nom est figé à l'envoi.
- **Piste** : autorisation Google Drive `drive.file` (l'appli ne voit que les fichiers qu'elle crée ou que l'utilisateur choisit). Jérôme valide l'autorisation à l'écran, ça prend quelques secondes.
- **Piste** : jetons de courte durée, donc réautorisation de temps en temps sur le téléphone ; alternative : un relais n8n qui téléverse avec son propre accès à Drive.
- À faire par Jérôme : réglages Google Cloud (écran de consentement, origine autorisée). À vérifier : en-têtes de `firebase.json`.
- À prévoir : gros fichiers (audio d'interview) ; dossier Drive strictement privé (enregistrements de personnes).

### Plusieurs personnes par affaire
- **Piste** : en 2.0, une affaire ne porte qu'un `personneId`. Liste de personnes liées, avec une personne principale.

### Libellé des documents non synchronisé
- En 2.0, le libellé d'un document est saisi à la main : renommer le fichier dans Drive ne le met pas à jour. Avec un accès Drive, le nom pourrait se synchroniser.

## Hors périmètre de la 2.0 (rappel)
Import CSV, fusion de doublons, prévisions en euros, envoi d'e-mails depuis la fiche, mode hors ligne.
