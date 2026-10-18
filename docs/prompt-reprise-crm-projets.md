# Prompt de reprise : projet interne-crm-projets

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Rédigé le 06/10/2026 à la fin de la session de cadrage. À coller tel quel au début de la prochaine session.

---

Tu reprends le chantier **« écran Projets » du CRM de Jérôme (Chevalier IA OS, version 2.1)**. Rien n'est construit : le cadrage est fait et validé, la construction n'a pas commencé.

## Où est le code (important)

Le code vit dans le dépôt **`chevalier-ia-os`** (GitHub `jeromechevalier-wq/chevalier-ia-os`, local : `Mon Drive/Chevalier-AI/Projets/chevalier-ia-os`), pas dans le dossier `interne-crm-projets`. Travaille dans ce dépôt, sur une branche par PR, jamais sur `main`.

## À lire d'abord, dans l'ordre

1. `CLAUDE.md` du dépôt (décisions permanentes et façon de travailler : explique simplement, une PR par étape cohérente, **ne fusionne qu'après le « fusionne » de Jérôme**, lance toi-même la suite de tests, jamais de secret dans la conversation ni le dépôt, pas de RGPD, pas de porte dérobée).
2. `docs/roadmap.md` puis `docs/reprise-prochaine-session.md`.
3. **`docs/cadrage-projets.md`**, surtout les sections « Décisions de Jérôme du 06/10/2026 » (elles l'emportent sur ce qui les contredit plus bas), « La vision de Jérôme », 3 (décisions), 4 (modèle de données), 7 (découpage).
4. Ticket GitHub **n° 28** « Projet d'extraction de valeur ».
5. Pour le serveur MCP : `docs/plan-mcp.md`, `docs/securite-et-pannes.md`, `docs/playbook-mcp-firebase.md`.

## Ce qui est décidé (ne pas rouvrir)

- **Quatre phases fixes, les mêmes pour tous les projets** : Lancement, Découverte, Livraison, Clôture (identifiants stables : `lancement`, `decouverte`, `livraison`, `cloture`). Statut : `actif`, `en_pause`, `termine`.
- **Données séparées** : collections `projets_projets`, `projets_taches`, `projets_modeles`. Une affaire donne **au plus un projet** (`projetId`). **Un projet peut exister sans affaire** (seul le titre est obligatoire).
- **Affaire gagnée → créer ou lier un projet** (mécanique de Pipedrive). Les fichiers et notes de l'affaire sont **montrés** dans le projet, **pas déplacés**.
- **Extraction de valeur = un projet comme les autres** (`nature` = `extraction`), mêmes phases, tâches, statut et Clôture. Modèle « Extraction » à quatre tâches : tirer les règles, comprendre les erreurs, repérer ce qui est automatisable, créer la documentation marketing. Déclenchement : affaire **perdue** → à Perdu ; affaire **gagnée avec projet** → à la **fin du projet** ; affaire **gagnée sans projet** → à Gagné. Création **automatique**, écrite dans `logique.js` (pour que l'écran et le serveur MCP fassent pareil). Jamais de boucle ; une seule extraction par source ; elle reprend `urlDossier` et `urlGithub` de sa source ; affaire perdue : la raison de la perte est reprise.
- **Facturation : tout le lot en version 2.2**, pas en 2.1 : liste de factures sur le projet (montant, date d'envoi, date de paiement), retrait des étapes « Facture envoyée » et « Facture payée » des affaires avec migration des affaires existantes, objectif « 1 000 € encaissés » et célébration rebranchés, serveur MCP et tests mis à jour, et **la Clôture BLOQUE tant qu'une facture n'est pas payée** (un projet sans facture se clôture normalement ; prévoir une sortie pour les impayés définitifs, proposition à valider). **En 2.1, les étapes actuelles restent** et la Clôture ne bloque rien.

## Plan de construction (7 PR pour la 2.1, estimation 17 à 27 h)

1. Socle : module `projets`, collections, `logique.js` et ses tests, règles Firestore et tests de sécurité (**Jérôme publie les règles AVANT la fusion**).
2. Kanban et fiche projet (phases, statut).
3. Création depuis une affaire (créer ou lier), documents et notes de l'affaire montrés dans le projet, `projetId`.
4. Tâches par phase, remontée dans l'Accueil.
5. Modèles de projet.
6. Extraction de valeur (champ `nature`, modèle, déclencheurs, serveur MCP).
7. Finitions : Archives, recherche, célébration, parcours e2e (1440 × 900 et 390 × 844), version 2.1.0.

Puis la version 2.2 (facturation). Les outils MCP pour les projets (chercher, créer, changer de phase) viennent après, environ 3 à 4 h.

## Par quoi commencer

**PR 1 (le socle).** Avant d'écrire du code : relis `js/modules/crm/logique.js`, `js/modules/crm/donnees.js` et `functions/src/coeur/` pour réutiliser la même méthode que le CRM (logique pure testée avec `node --test`, l'écran ne contient aucune règle métier). Propose le plan de la PR à Jérôme en quelques lignes, puis construis. Lance `cd tests && npm install && npm run installer-fonctions && npm test` toi-même (environ 5 minutes) avant d'ouvrir la PR.

## À trancher en cours de route (poser la question à Jérôme)

- Clôture bloquante en 2.2 : une sortie pour les impayés définitifs (abandon, avoir) ?
- Tout ce qui est marqué « Proposition » ou « À trancher » dans `cadrage-projets.md`, section 9.

## Rappels

Explique simplement, comme à quelqu'un de 18 ans, avec le lien exact et où cliquer pour toute action dans la console Google, GitHub ou le Terminal. Les e-mails n'existent pas encore dans l'appli (hors périmètre).
