# Roadmap

Tenue à jour à chaque discussion sur l'évolution de l'appli. Dernière mise à jour : 02/10/2026, après l'approbation du plan du serveur MCP (`plan-mcp.md`).

Légende : **décidé** = validé par Jérôme ; **piste** = à trancher avant le cahier des charges.

## Priorité : Claude Code et les agents lisent et écrivent dans la base

Cahier des charges détaillé : `cahier-mcp.md` (brouillon du 02/10/2026). **Plan détaillé approuvé le 02/10/2026 : `plan-mcp.md`** (architecture, outils, audit, sauvegardes, pièces jointes, tests, déploiement par étapes, risques). En cas de contradiction, `plan-mcp.md` prévaut sur `cahier-mcp.md`.

État : étapes 0 (le plan) et 1 (prototype Drive) faites. **Prototype Drive, résultats du 02/10/2026 (option B, session cloud, vrai Drive de Jérôme) : A, B, C, D, E : OUI** (E : 50 Mo en 7 morceaux depuis Chromium, 12,9 Mo/s, 52 428 800 octets retrouvés dans Drive ; D : les morceaux sont acceptés sans en-tête d'autorisation). **F, partie console : confirmé par Jérôme (écran de consentement « En production »).** Aucun repli du plan ne se déclenche. Reste le test F, partie 8 jours (autorisation à refaire sur le Mac, contrôle A1 et A3 à J+8). **Étape 2 (squelette des fonctions) : code, tests et guide prêts sur la branche `mcp`** (fonction `mcp` à Paris avec `qui_suis_je`, jetons, `outils/creer-jeton.js`, workflow étendu) ; reste à faire par Jérôme dans la console avant la fusion : voir `mcp-etape-2.md` (budget, APIs, secret `MCP_JETONS`, rôles un par un).

### Décisions de la session de planification du 02/10/2026
- **Décidé (02/10/2026)** : **pas de porte dérobée dans le code** (accès caché activable par une ligne) : elle ouvrirait le CRM à quiconque obtient l'écriture sur le dépôt et ne répond pas aux pannes redoutées (Google, VPS, Claude Code). À la place : accès de secours passant par l'identité Google de Jérôme (console, **script de secours sur le Mac**, sauvegardes), interrupteurs d'urgence, et un guide vivant **`securite-et-pannes.md`** (pannes, secrets, versions figées, contrôle trimestriel) **mis à jour à chaque étape ; version complète à l'étape 6**.
- **Décidé** : fonctions à **Paris (europe-west9)**, Node 22 (Node 20 s'arrête côté Google le 30/10/2026), adresse `https://chevalier-ia-os.web.app/mcp` par réécriture Hosting (repli : adresse directe de la fonction, si la réécriture vers une fonction à Paris n'est pas prise en charge).
- **Décidé** : droits par profil de jeton. **Bibliothécaire** : lecture, écriture, pièces jointes, sauvegarde, **sans suppression ni restauration** ; **Claude Code** : tout. Le serveur refuse un outil hors profil même si Hermes est mal configuré (deuxième niveau de protection, après le filtre `tools.include` côté Hermes).
- **Décidé** : l'acteur s'inscrit dans deux champs, `auteur` (ex. `hermes-bibliothecaire`) et `via` (`mcp`) ; le fil affiche « hermes-bibliothecaire · via MCP ».
- **Décidé** : jetons = un secret `MCP_JETONS` dans Secret Manager qui ne contient que des **empreintes** ; révocation en moins d'une minute.
- **Décidé** : audit en deux collections : `crm_audit` (traces, illimitées, sans contenu) et `crm_audit_avant` (copies « avant », **effacées après 90 jours** par une règle TTL, par respect du RGPD).
- **Décidé** : sauvegardes : export JSON **hebdomadaire**, gardé 12 semaines, dans un dossier Drive dédié, fait par le bibliothécaire ; en plus, copies Google **quotidiennes gardées 7 jours** et récupération à un instant donné.
- **Décidé** : budget **5 € par mois**, alertes à 50 / 90 / 100 % (elles ne coupent rien), 3 instances au plus, plafonds d'écriture par jeton.
- **Décidé** : nouveaux utilisateurs (Paul) par liste dans le code **et** dans les règles ; Jérôme publie les règles.
- **Décidé** : téléversement depuis le téléphone par un **jeton Drive d'une heure remis par la fonction** (pas d'écran de consentement Google sur le téléphone) ; le consentement direct reste un repli si le prototype échoue.
- **Décidé** : pas de tests automatiques sur chaque Pull Request (Jérôme lance `npm test` sur son Mac avant de fusionner) ; risque assumé, noté R3 dans le plan.
- **Constats à traiter** (détail dans `plan-mcp.md`, section 3) : les enchaînements de `donnees.js` sont à extraire dans `logique.js` pour que l'écran et le serveur partagent le même code ; les règles Firestore doivent être restructurées (un bloc plus précis ne l'emporte pas sur le joker actuel) ; les tests D3 et D4 et le README sont à adapter (« aucune Cloud Function » n'est plus vrai).

- **Décidé** : c'est **indispensable**. Chevalier IA OS devient le CRM de Jérôme (aujourd'hui Notion), Claude Code sur son ordinateur est son outil principal, et des agents IA automatiseront ensuite. Ils doivent pouvoir interroger la base et y écrire, comme avec Notion.
- **Décidé** : on est en phase de développement, donc **lecture et écriture d'emblée**, sans phase en lecture seule. Les pièces jointes par lien **et** par téléversement Drive font partie du même chantier.
- **Décidé** : **un seul code, un seul déploiement, au même endroit que l'appli** : le serveur MCP est hébergé sur Firebase (Cloud Functions, forfait Blaze ; **constat du 02/10/2026 : `chevalier-ia-os` n'avait aucun compte de facturation, il a été relié au compte « Paiement de Firebase » ce jour-là**), dans le même dépôt, publié par la même fusion sur `main`. Tous les clients (Hermes Agent sur son VPS, Claude Code, tout autre outil, un futur utilisateur) se connectent à la même adresse avec un **jeton par client**, relié à un nom d'acteur tracé dans le fil et dans l'audit.
- Premier agent : **agent bibliothécaire** sur Hermes Agent (VPS de Jérôme, machine distincte). Hermes Agent sait se connecter à un serveur MCP distant (adresse + jeton, filtrage des outils).
- **Décidé (précisé par `plan-mcp.md`)** : une couche de fonctions métier (qui réutilise `logique.js`, déjà testé, pour que les écritures suivent exactement les règles de l'écran : fil d'activité, dates, doublons, objectifs), et le serveur MCP comme façade mince par-dessus. Dossier **`functions/`** dans le dépôt (et non `mcp/`).
  - Outils prévus : chercher personnes, organisations et affaires ; lire une affaire et son fil ; créer personne, organisation, affaire ; ajouter note ou activité ; changer l'étape ; joindre un document (par lien ou par téléversement dans Drive).
  - Aucune clé secrète sur le Mac ni sur le VPS : la fonction tourne avec l'identité du projet Google.
- **Piste, plus tard** : une façade API REST sur la même couche de fonctions, si un outil qui ne parle pas MCP en a besoin (webhooks, n8n, formulaires).
- **À étudier** : migration des fiches Notion existantes (l'import CSV est hors périmètre de la 2.0).
- **Décidé** : tous les droits pour les agents, suppression comprise, avec un journal d'audit (collection `crm_audit`, copie de l'état avant chaque modification) pour tout tracer et pouvoir restaurer. L'agent bibliothécaire fait aussi les sauvegardes. **Précision du 02/10/2026** : la suppression et la restauration sont réservées au jeton de Claude Code ; le jeton du bibliothécaire ne les a pas (voir les décisions ci-dessus).

## Version 2.1

### Déjà prévu
- Écran Projets (Kanban de phases, lien `projetId` depuis une affaire gagnée). **Cadrage du 03/10/2026 : `cadrage-projets.md`** (brouillon ; décisions de Jérôme du 03/10/2026 : projets en données séparées, module `projets`, phases fixes en 2.1 puis configurables plus tard, construction après l'extraction de logique du chantier MCP ; trois questions restantes).
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
- **Décidé le 03/10/2026 (principe)** : à chaque document déposé, une **fiche compagnon `.md`** du même nom est créée au même endroit (date de création, résumé, points utiles), toujours dans le même format, repris des fiches du second cerveau. Modèle, répartition code / agent, limites et deux questions : `modele-fiche-document.md`. **Précisé le 03/10/2026 (soir)** : rien n'est déposé à la main ; le résumé s'écrit à l'attachement (par l'agent via `joindre_fichier_drive`, paramètres `resume` et `fiche` ; depuis l'appli, champ « Résumé en une phrase » tapé ou dicté par Jérôme, **décidé** : pas de résumé par IA ; liens vers affaire, organisation et personne par identifiants stables et adresses absolues, pas de crochets `[[…]]`) ; un **`index.md` à la racine du dossier**, régénéré en entier par la fonction à partir de Firestore. À intégrer à `plan-mcp.md` (section 5.7 et liste des outils) quand on abordera les pièces jointes.
- **Piste** : autorisation Google Drive `drive.file` (l'appli ne voit que les fichiers qu'elle crée ou que l'utilisateur choisit). **Précisé le 02/10/2026** : Jérôme l'accorde **une seule fois, sur son Mac** (script `autoriser-drive.js`) ; la fonction garde le jeton de rafraîchissement dans Secret Manager (`DRIVE_OAUTH`) et remet à l'appli un jeton d'une heure. À valider par le prototype Drive (étape 1 du plan) ; l'écran de consentement doit être « En production » (en « Test », le jeton expire après 7 jours).
- ~~**Piste** : jetons de courte durée, donc réautorisation de temps en temps sur le téléphone ; alternative : un relais n8n.~~ **Remplacée** par le jeton d'une heure remis par la fonction (décision du 02/10/2026) : aucune réautorisation sur le téléphone. Le consentement direct sur le téléphone reste le repli.
- À faire par Jérôme : réglages Google Cloud (écran de consentement, identifiant OAuth, API Drive). À vérifier : en-têtes de `firebase.json`, sélecteur de fichiers de l'iPhone en appli installée.
- À prévoir : gros fichiers (audio d'interview) ; dossier Drive strictement privé (enregistrements de personnes).

### Plusieurs personnes par affaire
- **Piste** : en 2.0, une affaire ne porte qu'un `personneId`. Liste de personnes liées, avec une personne principale.

### Libellé des documents non synchronisé
- En 2.0, le libellé d'un document est saisi à la main : renommer le fichier dans Drive ne le met pas à jour. Avec un accès Drive, le nom pourrait se synchroniser.

## Hors périmètre de la 2.0 (rappel)
Import CSV, fusion de doublons, prévisions en euros, envoi d'e-mails depuis la fiche, mode hors ligne.
