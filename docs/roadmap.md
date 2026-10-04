# Roadmap

Tenue à jour à chaque discussion sur l'évolution de l'appli. Dernière mise à jour : 03/10/2026, après la validation en réel de l'étape 4 du serveur MCP (`plan-mcp.md`, `mcp-etape-4.md`).

Légende : **décidé** = validé par Jérôme ; **piste** = à trancher avant le cahier des charges.

## Priorité : Claude Code et les agents lisent et écrivent dans la base

Cahier des charges détaillé : `cahier-mcp.md` (brouillon du 02/10/2026). **Plan détaillé approuvé le 02/10/2026 : `plan-mcp.md`** (architecture, outils, audit, sauvegardes, pièces jointes, tests, déploiement par étapes, risques). En cas de contradiction, `plan-mcp.md` prévaut sur `cahier-mcp.md`.

État : étapes 0 (le plan) et 1 (prototype Drive) faites. **Prototype Drive, résultats du 02/10/2026 (option B, session cloud, vrai Drive de Jérôme) : A, B, C, D, E : OUI** (E : 50 Mo en 7 morceaux depuis Chromium, 12,9 Mo/s, 52 428 800 octets retrouvés dans Drive ; D : les morceaux sont acceptés sans en-tête d'autorisation). **F, partie console : confirmé par Jérôme (écran de consentement « En production »).** Aucun repli du plan ne se déclenche. Reste le test F, partie 8 jours (autorisation à refaire sur le Mac, contrôle A1 et A3 à J+8). **Étape 2 (squelette des fonctions) : TERMINÉE le 03/10/2026, validée de bout en bout** (`qui_suis_je` répond par `https://chevalier-ia-os.web.app/mcp` avec le jeton de Claude Code ; PR #6 et #8 fusionnées) ; code, tests et guides (fonction `mcp` à Paris avec `qui_suis_je`, jetons, `outils/creer-jeton.js`, workflow étendu) . **Étape 3 (lecture du CRM) : TERMINÉE le 03/10/2026, validée en réel** (PR #10 ; `lister_affaires` renvoie les vraies affaires) ; **la fonction tourne depuis avec un compte de service dédié `mcp-serveur`** (PR #11) (9 outils de lecture, copie partagée de `logique.js`, accès Firestore ; l'extraction des écritures est reportée à l'étape 4) : voir `mcp-etape-3.md`. **Étape 4 (écriture, suppression, audit, restauration) : TERMINÉE le 03/10/2026, validée en réel** (PR #13 et #14 ; essai de 15 vérifications réussi sur le serveur déployé avec la vraie base : créer, journaliser, refuser doublon et suppression non confirmée, supprimer, restaurer à l'identique, nettoyer) : moteur d'écriture avec audit en trois lots et restauration, plans d'écriture partagés entre l'écran et le serveur (extraction faite, 98 parcours rejoués), règles Firestore du plan 5.5, 23 outils d'écriture/suppression/restauration, plafonds par jeton ; règles Firestore publiées et TTL de 90 jours créé par Jérôme (l'effacement lui-même est à contrôler à la première échéance). **À noter : Claude Code n'est pas encore branché sur le serveur** (c'est l'étape 6) ; jusqu'ici le serveur a été essayé par `curl` et par le script `outils/essai-ecriture.mjs`. **Étape 6, partie Claude Code : faite le 03/10/2026** (`branchement-mcp.md` : `claude mcp add --scope user` avec le jeton lu dans une variable, retrouvé dans le Trousseau de macOS ; `claude mcp list` affiche `✓ Connected` dans une fenêtre neuve et `qui_suis_je` répond `claude-code-jerome`). **Reste de l'étape 6 : Hermes sur le VPS** (jeton bibliothécaire et `hermes --version` à fournir). **Sauvegardes Google activées le 03/10/2026 à 21:19 (heure de Paris), par Jérôme dans la console** (Firestore, « Reprise après sinistre ») : le constat du jour était qu'aucune n'était active (récupération à un moment précis et sauvegardes planifiées désactivées, aucune sauvegarde). Maintenant : **récupération à un moment précis activée** (conservation 7 jours, première version à 21:19) et **sauvegardes planifiées quotidiennes, conservées 98 jours** (maximum de Google ; durée choisie par Jérôme, qui peut s'absenter deux mois : plus longue que les 7 jours du plan, voir `plan-mcp.md` 5.6). Coût : de l'ordre de zéro (tarifs publiés : environ 0,15 $ par Go et par mois pour la récupération à un moment précis, 0,03 $ pour les sauvegardes ; la base fait quelques Mo ; tarif de Paris non lu). **À vérifier le 04/10/2026** : la première sauvegarde quotidienne apparaît dans le tableau « Sauvegardes » avec une date d'expiration à 98 jours. **Non faits** : l'étape 5 complète (export JSON hebdomadaire dans le Drive par le bibliothécaire, `outils/restaurer-export.js`), reportée par Jérôme, et un **essai de restauration** (une restauration crée une nouvelle base, jamais d'écrasement).

### À confirmer (étape 4, 03/10/2026)
- **Écart à confirmer** : le journal `crm_audit` (conservé sans limite) **ne garde plus les valeurs reçues** (noms, e-mails, notes) mais seulement les noms des champs ; les valeurs vont dans `crm_audit_avant` (effacé après 90 jours). Raison : la décision « traces illimitées sans contenu » (RGPD) contredisait le tableau du plan 5.2, qui mettait les paramètres dans `crm_audit`. Autres écarts de réalisation : `plan-mcp.md`, étape 4.

### Décisions de la session de planification du 02/10/2026
- **Décidé (03/10/2026)** : tout ce qui a été appris en déployant le MCP (ordre des étapes console, rôles, API, pièges, erreurs rencontrées) est consigné dans **`playbook-mcp-firebase.md`**, pour refaire un serveur MCP sur une autre appli en un seul déploiement vert.
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

## Audit des actions de l'écran, version 2.0.2 (04/10/2026)

**Demande de Jérôme, choix atomique (piste A) tranché le 04/10/2026** : toute action du CRM faite dans l'appli écrit sa ligne dans `crm_audit` et sa copie avant/après dans `crm_audit_avant` **dans le même lot** que la donnée (même schéma que le serveur MCP : `lire_audit` et `restaurer_depuis_audit` les comprennent, canal `ecran`). Les règles Firestore passent à « lecture, et création seule » pour ces deux collections (jamais de modification ni de suppression depuis l'appli). **Règles à publier AVANT la fusion** : `audit-ecran.md`. Non couvert : réglages et objectifs saisis, modifications à la main dans la console Firestore. **À venir, autre PR** : l'écran « Journal » en lecture seule (liste, filtres, copies avant et après) ; l'outil `lire_copie_audit` est abandonné (l'écran lit les copies).

## Version 2.0.1 : adresse GitHub et dossier de travail d'une affaire (reprise le 03/10/2026)

La fonction écrite dans la branche `mcp` (commit de code `24a8e96`) est **reprise sur une branche neuve à partir de `main`** (`mcp-lanceurs-github`), sans toucher à `mcp` : deux champs sur la fiche d'une affaire, **Adresse GitHub** (doit être `https://github.com/compte/nom`) et **Dossier** (dossier Google Drive), chacun avec un bouton « Créer le GitHub » / « Créer le répertoire » qui ouvre une fenêtre avec un **prompt à copier dans Claude Code** ; réglages « GitHub et dossiers de projets » ; version **2.0.1**. Les outils MCP `creer_affaire` et `modifier_affaire` acceptent aussi `urlGithub` et `urlDossier` (mêmes validations ; chaîne vide = effacer), et les outils de lecture les renvoient. Documents repris de `mcp` : `convention-dossiers.md` et `modele-prompt-creation-dossier.md`. **Restent dans la branche `mcp`, non repris** : le cadrage de l'écran Projets (`cadrage-projets.md`), la fiche compagnon des documents (`modele-fiche-document.md`) et les notes de vision. Toujours à valider en réel dans l'appli par Jérôme après fusion.

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
