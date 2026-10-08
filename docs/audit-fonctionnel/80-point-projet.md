# Étape H : le point projet (audit fonctionnel, Chevalier IA OS 2.3.3)

## Résumé en 5 lignes
1. Le gros du travail annoncé « fait » existe vraiment dans le code et dans `main` : écran Projets (PR #32 à #38), facturation 2.2 (#40, #41), 19 outils MCP de projets (#42), Favoris et Journal lisible (#44 à #47), version 2.3.3 partout (`version.json` et `js/os/version.js`).
2. Le serveur MCP compte bien 51 outils (13 lecteur, 44 bibliothécaire, 51 Claude Code), mais plusieurs documents donnent encore d'autres nombres (voir B-20, déjà signalé).
3. Il reste surtout : la migration des sauvegardes vers Backblaze (en grande partie écrite mais jamais exécutée pour de vrai), Hermes (pas branché), les pièces jointes par téléversement (rien de codé), la recette finale, et l'alignement des textes sur « on garde tout » (le code dit encore « 90 jours »).
4. Aucune PR ni aucun ticket n'est ouvert sur GitHub ; la seule chose hors `main` qui compte est la branche d'audit (7 commits, aucune PR) ; 33 des 36 branches distantes n'ont plus rien d'inédit.
5. Côté documentation : 9 constats H (2 gênants, 7 mineurs), dont un « prompt de reprise » qui dit encore « rien n'est construit » pour l'écran Projets ; les priorités de la semaine sont les deux constats bloquants C-01 et C-02, la règle des factures (A-05, B-04, A-01, B-06) et la remise à jour des documents de reprise.

Statut : partiel (la comparaison documentation / code / git est faite ; les dépôts et consoles hors de ce dépôt n'ont pas été vus : voir la fin du fichier). Rien n'a été modifié dans le dépôt en dehors de ce fichier. Écrit le 2026-10-08.

---

## 1. Ce qui est FAIT (et vérifié dans le code ou dans git)

| Chantier annoncé | Vérifié comment | Résultat |
|---|---|---|
| Version 2.3.3 | `version.json` = `{"version": "2.3.3"}` ; `js/os/version.js` = `'2.3.3'` ; test `tests/statique.test.js:63` les compare | Conforme. Pas de service worker, donc pas de numéro de cache à aligner ; `manifest.webmanifest` ne contient aucun numéro. |
| Écran Projets en 7 étapes (PR #32 à #38) | `git log --merges` : #32, #33, #34, #35, #36, #37, #38 présents sur `main` ; `js/modules/projets/` a 9 fichiers ; `js/os/modules.js:24-30` : Projets, Archives, Modèles | Existe. |
| Facturation 2.2 (PR #40 et #41) | #40 et #41 sur `main` ; `js/modules/projets/factures.js` ; `planMigrerEtapesRetirees` dans `js/modules/projets/logique.js:343` | Existe. Les défauts de la migration sont dans A-02, A-03, A-04, A-11. |
| 19 outils MCP de projets (PR #42) | comptage du registre : 3 lecture + 15 écriture + 1 suppression = 19 ; total 51 / 13 / 44 / 51 | Existe. La documentation dit 16 (B-20). |
| `ajouter_encaissement` retiré | absent du registre ; seulement cité dans des documents et dans un test négatif | Conforme au code. Les documents qui le citent encore : B-20. |
| Favoris (PR #44 à #46), corrections (PR #47) | #44, #45, #46, #47 sur `main` ; option `favori` de `joindre_lien` (`functions/src/mcp/outils/ecriture.js:129`) | Existe, mais **aucun document** ne le décrit (H-03). |
| Rattachement des tâches dans les Points clés | PR #27 fusionnée ; `js/modules/crm/activites.js:88` (`LIENS_RATTACHEMENT`) | Existe. La roadmap le dit encore « en attente du fusionne » (H-04). |
| Journal (2.0.2 à 2.0.4), audit des actions de l'écran | PR #20, #21, #22 fusionnées ; `js/modules/crm/journal.js` | Existe (étape D de l'audit). |
| Serveur MCP, étapes 2, 3, 4 | fonction `mcp` dans `functions/`, workflow `.github/workflows/firebase-hosting.yml` (Node 22) ; tests existants | Existe. |
| Branchement de Claude Code (étape 6, première moitié) | `docs/branchement-mcp.md` §1 (validé en réel le 03/10/2026, d'après le document) | Je n'ai pas pu le rejouer ; je le crois sur parole. |
| Sauvegardes Google (récupération à la minute 7 jours, copies quotidiennes 98 jours) | d'après `docs/roadmap.md:11` et `docs/securite-et-pannes.md:45` (activées le 03/10/2026 à 21:19) | Non vérifié (c'est dans la console Google, pas dans le dépôt). |

## 2. Ce qui RESTE

| Sujet | État réel | Où c'est écrit |
|---|---|---|
| **Étape 5, sauvegardes : Backblaze** | Le job GitHub quotidien et l'essai de restauration `--github` ont été réussis le 04/10/2026 (d'après la documentation). Export des bases, copie de Drive, surveillance et leurs essais de restauration : écrits et essayés avec un faux outil, **jamais exécutés pour de vrai**. 5 secrets pas encore créés (`CLE_FIREBASE_CHEVALIER_IA_OS`, `CLE_FIREBASE_SUIVI_PRESENCE_ELEVES`, `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`). Variable `SAUVEGARDE_ACTIVE` pas encore à `oui`. Bascule (couper l'ancien système du Mac) seulement après une semaine de succès et un essai complet. | `docs/reprise-prochaine-session.md` §0 ; `docs/roadmap.md:42-48`. Le dépôt `interne-sauvegardes` n'est pas dans ce dépôt : non vu. |
| **Migration des sauvegardes** | Pas de nouveau disque Time Machine : aucune sauvegarde du Mac (décision de Jérôme, à reprendre après la migration). | `docs/roadmap.md:46` |
| **Étape 6, fin : Hermes** | Pas configuré. Il manque le jeton « bibliothécaire » et le résultat de `hermes --version`. La liste des 44 outils du guide est exacte. | `docs/branchement-mcp.md` §2 (brouillon non testé) |
| **Étape 7 : pièces jointes par téléversement vers Drive** | Rien de codé : aucun résultat pour `preparer_televersement`, `jetonDrive`, `joindre_fichier_drive`, `DRIVE_OAUTH` dans `functions/src`, `js`, `outils`, `tests`. Seules les pièces jointes par lien existent. Suppose le contrôle à 8 jours du prototype Drive (vers le 10/10/2026). | `docs/plan-mcp.md:300` ; `docs/reprise-prochaine-session.md:71` |
| **Étape 8 : recette et clôture** | Pas commencée (aucun rapport de recette dans `docs/`). | `docs/plan-mcp.md` §9 |
| **« Pas de RGPD, on garde tout » : alignement** | Pas fait : `JOURS_COPIES = 90` (`functions/src/coeur/ecriture.js:23`) et `expireAt` encore écrit (`:119`) ; textes, descriptions d'outils, tests et documents parlent encore de 90 jours (B-18, B-19, D-14 à D-17). Approche sûre déjà proposée : allonger la durée à 36 500 jours sans toucher aux règles. | `docs/reprise-prochaine-session.md` §1 |
| **Quatre points UX du 04/10/2026** | Points 3 et 4 tranchés par Jérôme (rien à faire). Points 1 et 2 : il veut « Créer le GitHub » avant « Enregistrer » ; le code n'a pas bougé (`js/modules/crm/lanceurs.js:122-123` : « Enregistrer » est toujours le premier bouton). | `docs/retours-ux-2026-10-04.md` ; H-07 |
| **Blocage du passage de phase tant que les tâches ne sont pas faites** | Proposé à Jérôme, pas demandé : non fait volontairement. Voisin de A-10 (glisser dans « Clôture »). | `docs/reprise-prochaine-session.md:10` |
| **Actions GitHub sur Node 20, `ubuntu-latest` vers Ubuntu 26** | Pas fait. Le workflow de ce dépôt utilise `actions/checkout@v4`, `actions/setup-node@v4` et `FirebaseExtended/action-hosting-deploy@v0`. Le serveur, lui, est déjà en Node 22 (`functions/package.json`, workflow). Le 19/10/2026 est la date notée dans le guide. | `docs/securite-et-pannes.md:108-109`, `:185` ; `docs/reprise-prochaine-session.md:36` |
| Outils MCP volontairement absents | Modifier ou supprimer une facture, supprimer une tâche, gérer les modèles. S'y ajoutent les manques trouvés en B-08 à B-11. | `docs/mcp-projets.md` |
| Pistes plus lointaines | Plusieurs personnes par affaire, libellé des documents synchronisé avec Drive, façade REST, migration des fiches Notion, import CSV. | `docs/roadmap.md:38-39`, `:101-108` |

## 3. Chantiers EN PAUSE ou en attente de « fusionne »

- **GitHub (lu avec les outils de lecture)** : aucune Pull Request ouverte, aucun ticket ouvert. Le ticket n° 28 (extraction de valeur) est fermé, par la PR #37.
- **Branche `claude/fervent-mayer-gme1rw` (cet audit)** : 7 commits d'avance sur `main`, aucune PR (`00-avancement.md`). Elle ne contient que des fichiers de `docs/audit-fonctionnel/`. Rien ne sera publié sur le site : le workflow ne part que sur `main`.
- **Branche distante `mcp`** : 26 commits d'avance, mais presque tout a été repris dans `main` (cadrage Projets, convention de dossiers, lanceurs GitHub, modèle de prompt). Ce qui n'existe **que** là : `docs/modele-fiche-document.md` (cité par `main`, voir H-06).
- **Branche distante `v1`** : 1 commit d'avance (`docs/synthese-chevalier-ia-os.md`, synthèse du 29/09/2026), jamais repris.
- **Les 33 autres branches distantes** (36 au total sans `main`) : 0 commit d'avance sur `main`, donc rien d'inédit ; la liste des noms est dans `git branch -r`. Je ne propose pas de les supprimer sans demande de Jérôme.
- **PR de l'autre dépôt** (`_JEROME_OS_onGIT`, carte des sauvegardes corrigée pour Time Machine) : en attente de « fusionne » d'après `docs/reprise-prochaine-session.md:22`. Non vérifié, hors de ce dépôt.
- **Test à 8 jours du prototype Drive** : à faire sur le Mac (`docs/prototype-drive.md:15`), vers le 10/10/2026.

## 4. Priorités proposées (sans conseil RGPD)

### Cette semaine
1. **Fermer les deux constats bloquants C-01 et C-02**, avec D-03 (suppression en cascade qui s'arrête à moitié) et C-24. *Pourquoi : ce sont les seuls défauts qui détruisent des notes et des activités qui n'appartiennent plus à la fiche supprimée, et la restauration (D-04, D-05) ne les rattrape pas toujours.* À livrer en petite PR, après le « fusionne » de Jérôme.
2. **Arbitrer avec Jérôme la règle des factures, puis corriger** : paiement partiel (A-05, B-04), facture ajoutée à un projet terminé (A-01, B-06), `creer_affaire` à « Gagné » (B-01), facture payée sans date (E-01). Avant qu'il applique la migration 2.2 dans Réglages : A-02, A-03, A-04 (si elle est déjà appliquée, non vérifié). *Pourquoi : le chiffre d'affaires de l'accueil, les objectifs et la célébration reposent sur ces règles, et E-06 montre qu'un double compte est déjà possible.*
3. **Remettre les documents de reprise d'aplomb en une seule PR de docs** : H-01, H-02, H-03, H-04, puis le lot « on garde tout » déjà prévu (B-18, D-15, D-16, D-17, B-19). *Pourquoi : chaque session neuve lit ces fichiers en premier (`CLAUDE.md`), et un prompt de reprise dit encore « rien n'est construit ».*
4. **À ne pas laisser passer (petits gestes de Jérôme dans la console)** : le contrôle à 8 jours de Drive (vers le 10/10) et la vérification des premières sauvegardes Firestore (H-09). *Pourquoi : les deux conditionnent l'étape 7 et la bascule des sauvegardes.*

### Ce mois
1. **Terminer la migration des sauvegardes** : comptes de service de lecture des bases, autorisation Drive, premier lancement réel des jobs bases et Drive, essai de restauration, puis `SAUVEGARDE_ACTIVE=oui`, une semaine d'observation, enfin la bascule. *Pourquoi : aujourd'hui GitHub, Drive et les copies Google sont les seules protections (aucune sauvegarde du Mac).*
2. **Mettre les actions GitHub à jour avant le 19/10/2026** (`checkout`, `setup-node`, action Hosting). *Pourquoi : le workflow déploie le site à chaque fusion sur `main` ; un déploiement qui casse bloque toute livraison.*
3. **Brancher Hermes**, une fois les manques d'outils connus : B-08 (doublons de fiches archivées), B-09 et D-13 (listes coupées à 200), B-10 et B-11 (gestes sans outil), B-07 (description trompeuse de `lister_activites`). *Pourquoi : l'agent bibliothécaire va créer des doublons et ne pourra pas reporter une activité.*
4. **Écran, petites PR au fil de l'usage** : C-03, C-05, C-07, C-08, C-09, C-10, C-11/E-02 ; chiffres de l'accueil E-03, E-04, E-05, E-08 ; Journal D-01, D-02, D-06, D-07. *Pourquoi : ce sont les défauts « gênants » que Jérôme rencontrera seul, sans aide d'un agent.*
5. **Les deux petits points UX restants (ordre des boutons GitHub)** puis clore `retours-ux-2026-10-04.md` (H-07). *Pourquoi : Jérôme a déjà dit « d'accord », c'est du travail sans décision à prendre.*
6. **Mettre le cahier des charges 2.0 et le README à jour** : C-18, E-17, A-14, H-05, H-06, H-08. *Pourquoi : le cahier se présente comme « la référence unique » et décrit encore l'ancien comportement.*
7. **À proposer à Jérôme (pas à imposer)** : un lancement automatique des tests avant fusion. *Pourquoi : le workflow ne lance aucun test (risque R3 du plan, accepté) et la PR #47 a dû corriger deux tests de parcours après coup, d'après son message de commit.*

### Plus tard
1. **Étape 7 : pièces jointes par téléversement vers Drive**, une fois le contrôle à 8 jours réussi. *Pourquoi : elle demande la partie Google la plus fragile (consentement en production, jeton d'une heure).*
2. **Étape 8 : recette et clôture** (`docs/plan-mcp.md` §9). *Pourquoi : on ne peut la faire qu'une fois Hermes et les sauvegardes en place.*
3. **Blocage du passage de phase tant que les tâches ne sont pas faites** et outils MCP de modification de facture. *Pourquoi : proposés mais jamais demandés par Jérôme.*
4. **Nettoyage complet du champ `expireAt` et des règles** en un seul lot coordonné. *Pourquoi : sans danger tant que la durée est très longue ; à faire seulement si Jérôme le veut.*
5. **Décision Time Machine** après la migration. *Pourquoi : décidée ainsi par Jérôme le 04/10/2026.*
6. **Tous les MINEURS restants** des étapes A à E, et le ménage des branches fusionnées si Jérôme le souhaite.

---

## Constats

### H-01 · Un « prompt de reprise » dit encore que l'écran Projets n'est pas construit
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `docs/prompt-reprise-crm-projets.md` est écrit pour être « collé tel quel au début de la prochaine session ». Il dit « Rien n'est construit », liste un plan en 7 PR « par quoi commencer : PR 1 (le socle) » et pose comme question en suspens « Clôture bloquante en 2.2 ? », alors que tout est fait et fusionné.
- **Ce que ça change pour Jérôme** : s'il colle ce prompt, une session neuve pourrait recommencer à construire le module Projets (collections, écrans, règles) par-dessus l'existant.
- **Où dans le code** : sans objet (documentation) : `docs/prompt-reprise-crm-projets.md:7` et `:41` ; le code existe dans `js/modules/projets/` (9 fichiers).
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md:5` (« le chantier Projets est terminé (07/10/2026) »).
- **Preuve** : lecture des deux fichiers ; `git log --merges` : PR #32 à #38 et #40 à #42 fusionnées.

### H-02 · Les sauvegardes sont décrites de trois façons différentes, avec des outils qui n'existeront pas
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : le 04/10/2026 Jérôme a abandonné l'export JSON par Drive (`docs/roadmap.md:44`). Pourtant `docs/roadmap.md:11` liste encore comme « non fait » l'étape 5 complète avec « export JSON hebdomadaire dans le Drive par le bibliothécaire, `outils/restaurer-export.js` » ; `docs/reprise-prochaine-session.md:70` dit « Reste : le job, `outils/restaurer-export.js` » alors que le §0 du même fichier décrit un autre outil (`restaurer-bases.mjs`, dans le dépôt `interne-sauvegardes`) ; `docs/plan-mcp.md:298` (tableau des étapes) liste `sauvegarder`, `purger_sauvegardes`, `restaurer-export.js`. Aucun de ces trois éléments n'existe (`outils/` ne contient pas `restaurer-export.js` ; le registre de 51 outils n'a ni `sauvegarder` ni `purger_sauvegardes`).
- **Ce que ça change pour Jérôme** : une session neuve pourrait construire ici un export et une restauration en doublon de ceux, déjà écrits, du dépôt `interne-sauvegardes`.
- **Où dans le code** : sans objet (documentation) : `docs/roadmap.md:11` et `:44`, `docs/reprise-prochaine-session.md:20` et `:70`, `docs/plan-mcp.md:298` ; fichiers absents : `outils/restaurer-export.js`.
- **Règle ou décision concernée** : `docs/roadmap.md:44` (« l'export JSON par Drive du plan 5.6 est abandonné »).
- **Preuve** : `ls outils/` (7 fichiers, aucun `restaurer-export.js`) ; comptage du registre (51 outils, voir B-20).

### H-03 · Aucun document ne parle des versions 2.0.4 et 2.3.0 à 2.3.3 (Favoris, Journal en phrases, corrections)
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : la feuille de route et la fiche de reprise s'arrêtent à la 2.2.0 et à l'outil MCP des projets (mise à jour du 07/10/2026). Les mots « Favori », « 2.3 » et « 2.0.4 » n'apparaissent dans aucun fichier de `docs/`, du `README.md` ni de `CLAUDE.md`, alors que `main` contient quatre PR (#44 à #47) qui ont créé le bloc Favoris de l'accueil, l'étoile sur les documents, l'option `favori` de `joindre_lien` et la version 2.3.3, plus la 2.0.4 (le Journal comprend les restaurations).
- **Ce que ça change pour Jérôme** : une session neuve ne sait pas que les Favoris existent (ni que `joindre_lien` a une option de plus) et ne peut pas les vérifier à la recette.
- **Où dans le code** : sans objet (documentation) : `docs/roadmap.md:3` et `:73` (dernière version citée : 2.2.0) ; code : `functions/src/mcp/outils/ecriture.js:129`.
- **Règle ou décision concernée** : `CLAUDE.md` du dépôt (au démarrage, lire `docs/roadmap.md` et `docs/reprise-prochaine-session.md`).
- **Preuve** : `grep -rn "2\.3\.\|favori" docs/ README.md CLAUDE.md` ne trouve rien (hors audit) ; `git log -- version.json` montre 2.3.0, 2.3.1, 2.3.2, 2.3.3 les 07 et 08/10/2026.

### H-04 · La feuille de route garde des « à faire » et un « en attente du fusionne » pour des choses déjà fusionnées
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : (1) `docs/roadmap.md:95` titre « Rattachement des tâches… : fait, PR en attente du « fusionne » » et `:98-99` décrit encore le défaut à corriger ; or la PR #27 est fusionnée et le code applique la règle (affaire, sinon personne, sinon organisation). (2) `docs/roadmap.md:29` dit que « les tests D3 et D4 et le README sont à adapter (« aucune Cloud Function » n'est plus vrai) » ; le README et le cahier disent déjà « une Cloud Function » et le forfait Blaze. (3) `docs/roadmap.md:11` mêle l'historique de l'étape 4 à un état d'aujourd'hui sur plus de 2 000 caractères sur une seule ligne, ce qui rend la lecture difficile.
- **Ce que ça change pour Jérôme** : on croit à tort qu'une PR attend son accord, ou qu'un correctif reste à faire.
- **Où dans le code** : sans objet (documentation) : `docs/roadmap.md:11`, `:29`, `:95-99` ; code correct : `js/modules/crm/activites.js:88`.
- **Règle ou décision concernée** : `docs/roadmap.md:3` (« tenue à jour à chaque discussion »).
- **Preuve** : `git log --merges` : « Merge pull request #27 … clever-maxwell-at4ks3 » ; README ligne 8 (« une Cloud Function, `functions/` »).

### H-05 · Le README décrit encore la version 2.0.0 et la mise en ligne de la branche `v2`
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `README.md:3` annonce « Version 2.0.0 » ; la section « Mise en ligne de la version 2.0.0 » (`:11-20`) demande d'ouvrir la PR de la branche `v2` vers `main`, de faire la recette « section 15.2 », et affirme « Rien à changer côté… règles Firestore (identiques à celui de la version 1.0.0) », ce qui n'est plus vrai (règles du journal depuis la 2.0.2). L'arborescence (`:52-63`) ne cite pas `js/modules/projets/`. La liste des tests (`:46`) oublie `projets.test.js`, `audit-ecran.test.js` et `essai-ecriture.test.js` (présents dans `tests/package.json`). `manifest.webmanifest` dit encore « CRM de prospection » ; `tests/package.json` porte `"version": "2.0.0"`.
- **Ce que ça change pour Jérôme** : le README est la première porte d'entrée d'un nouvel arrivant ; il donne une mauvaise version et une procédure de mise en ligne déjà faite.
- **Où dans le code** : sans objet (documentation) : `README.md:3`, `:11-20`, `:46`, `:52-63` ; `manifest.webmanifest` (champ `description`) ; `tests/package.json` (champ `version`).
- **Règle ou décision concernée** : `README.md` section « Mettre à jour » (« Augmenter la version… »).
- **Preuve** : `version.json` = 2.3.3 ; `git branch -r` : `origin/v2` a 0 commit que `main` n'a pas.

### H-06 · Des documents de `main` citent des fichiers qui n'existent pas dans `main`
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : sur 167 chemins vérifiés dans le README, `CLAUDE.md` et `docs/`, les seuls vrais manques sont : `docs/modele-fiche-document.md` (cité par `docs/cadrage-projets.md:149`, `:176`, `:261`, `docs/modele-prompt-creation-dossier.md:119` et `docs/roadmap.md:55`) qui n'existe que sur la branche distante `mcp` ; `tests/fonctions.test.js` et `tests/logique-partagee.test.js` (annoncés par `docs/plan-mcp.md:251`, jamais créés sous ces noms ; les tests réels sont `ecriture.test.js`, `lecture.test.js`, etc.) ; `docs/lecons-apprises.md` (annoncé « pas encore rédigé » par `docs/vision-chevalier-ia-os.md:35`). Les chemins `scripts/bases.mjs`, `scripts/drive.mjs`, `docs/restaurer.md` cités par la fiche de reprise sont ceux du dépôt `interne-sauvegardes` : normaux. `tests/package.js` est une coupure de `tests/package.json`, pas un manque.
- **Ce que ça change pour Jérôme** : un lien de la documentation mène à rien, sans que la page dise que le fichier est resté sur une autre branche.
- **Où dans le code** : sans objet (documentation) : les cinq lignes citées.
- **Règle ou décision concernée** : `docs/roadmap.md:55` (la fiche compagnon des documents « reste dans la branche `mcp`, non reprise »).
- **Preuve** : boucle de vérification d'existence sur les chemins relevés par `grep`, et `git ls-tree origin/mcp` pour `modele-fiche-document.md`.

### H-07 · `retours-ux-2026-10-04.md` se lit comme un état d'aujourd'hui, et ses quatre points sont à moitié tranchés
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : le document dit « aucun écran ne l'affiche » (le Journal) et « rien n'est construit », « les copies disparaissent après 90 jours » (`:51`, `:57`, `:60`), alors que l'écran Journal existe depuis la 2.0.3 et que plus rien ne s'efface. En même temps, la roadmap (`docs/roadmap.md:57`) et la fiche de reprise (`:73`) parlent de « quatre points à discuter / en attente de discussion », alors que Jérôme en a tranché trois : points 3 et 4 (laisser tel quel, pas de bruit dans l'historique), et l'ordre des boutons des points 1 et 2 (« Créer le GitHub » avant « Enregistrer »). Ce dernier n'est pas fait : `js/modules/crm/lanceurs.js:122-123` met toujours « Enregistrer » en premier.
- **Ce que ça change pour Jérôme** : un point simple déjà accepté (l'ordre des boutons) reste en attente dans la liste de ce qui est « à discuter ».
- **Où dans le code** : `js/modules/crm/lanceurs.js:122-123` ; documentation : `docs/retours-ux-2026-10-04.md:51`, `:57`, `:60`, `docs/roadmap.md:57`, `docs/reprise-prochaine-session.md:73`.
- **Règle ou décision concernée** : `docs/retours-ux-2026-10-04.md` section « Décisions et discussion de Jérôme (04/10/2026, après relecture) ».
- **Preuve** : lecture des lignes 122-123 de `lanceurs.js` (« Enregistrer » avant « Créer le GitHub ») ; aucune ligne de la roadmap ni de la fiche de reprise ne dit que l'inversion a été faite.

### H-08 · Plusieurs documents d'origine restent sans bandeau « historique » et contredisent l'état actuel
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `docs/cahier-mcp.md:3` dit « Brouillon… à valider par Jérôme avant tout code » alors que le serveur est livré (la roadmap précise que `plan-mcp.md` prévaut, mais le cahier ne le dit pas). `docs/cadrage-projets.md:228` dit « outils métier pas encore écrits » (A-14 a signalé la ligne 3 du même fichier, pas celle-ci). `PROMPT-CONSTRUCTION.md:19` et `docs/PROMPT-CONSTRUCTION-v2.0.md:30` imposent « aucune Cloud Function, plan gratuit » : vrai pour 1.0 et 2.0, faux depuis le 03/10/2026 (la phrase du README, elle, a été corrigée). `docs/briefing-mise-en-ligne-v2.md` et `docs/journal-mise-en-ligne-v2.md` sont des pièces de la mise en ligne 2.0.0 sans mention « terminé ». `docs/vision-chevalier-ia-os.md` reste « BROUILLON » (statut voulu par Jérôme, rien de validé).
- **Ce que ça change pour Jérôme** : un agent qui relit ces fichiers peut appliquer une règle abandonnée (par exemple « aucune Cloud Function ») ou reprendre un brouillon comme une décision.
- **Où dans le code** : sans objet (documentation) : lignes citées.
- **Règle ou décision concernée** : `docs/roadmap.md:9` (« En cas de contradiction, `plan-mcp.md` prévaut sur `cahier-mcp.md` »).
- **Preuve** : lecture des premières lignes de chaque fichier.

### H-09 · Des contrôles à date fixe n'ont aucun résultat écrit
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE (les résultats sont peut-être dans la console, que je n'ai pas vue)
- **Ce qui se passe** : trois vérifications étaient annoncées avec une date : la première sauvegarde quotidienne de Firestore « à vérifier le 04/10/2026 » (`docs/roadmap.md:11`, `docs/reprise-prochaine-session.md:68`) ; la première copie de la base `suivi-presence-eleves` « attendue le 07/10/2026 » (`docs/reprise-prochaine-session.md:70`) ; le contrôle à 8 jours du prototype Drive « vers le 10/10/2026 » (`docs/prototype-drive.md:15`, `:170`). Aucun document n'écrit que l'une d'elles a été faite. La fiche de reprise elle-même est datée du 07/10/2026 et ne fait pas le point.
- **Ce que ça change pour Jérôme** : on ne sait pas si les copies Google tournent vraiment, et l'étape 7 (téléversement) attend un contrôle dont on ne connaît pas l'issue.
- **Où dans le code** : sans objet (documentation).
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md:68` et `:71`.
- **Preuve** : aucune ligne de résultat dans `docs/` pour ces trois contrôles ; non vérifié dans la console Google.

---

## Vérifié et conforme
- Numéros de version : `version.json` et `js/os/version.js` valent 2.3.3 (test `D1` de `tests/statique.test.js:63`). Il n'y a pas de service worker (`js/os/pwa.js:1`), donc aucun nom de cache à aligner. `manifest.webmanifest` n'a pas de champ de version. `VERSION_EXPORT = '2.0.0'` (`js/modules/crm/logique.js:14`) est la version du format d'export, pas celle de l'appli. La version `0.2.0` du serveur est expliquée en B-22.
- Nombre d'outils : le registre contient bien 51 outils (13 lecteur, 44 bibliothécaire, 51 Claude Code) ; projets : 3 lecture + 15 écriture + 1 suppression = 19. `docs/mcp-projets.md` et `docs/reprise-prochaine-session.md:8` disent 44 pour Hermes : exact. Le « 33 outils » de `docs/branchement-mcp.md:12` et de `docs/mcp-etape-4.md:155` est un résultat daté du 03/10 (9 + 23 + `qui_suis_je`), exact à son époque.
- Les PR annoncées « fusionnées » le sont : #17 à #27, #29 à #38, #40 à #47 sont dans `git log --merges origin/main` ; la PR n° 39 n'existe pas (404). Aucune PR ouverte, aucun ticket ouvert.
- Workflow de déploiement : Node 22 (`.github/workflows/firebase-hosting.yml:16`), déploie les fonctions avant le site ; cohérent avec `functions/package.json` (`engines`: 22) et avec `docs/plan-mcp.md:46`.
- README : plus de phrase « aucune Cloud Function » (ligne 8 : « une Cloud Function »). Le cahier 2.0 (`:353`) a été corrigé aussi.
- Le code d'écriture est bien celui que décrit la fiche de reprise §1 : `JOURS_COPIES = 90` à `functions/src/coeur/ecriture.js:23` ; la liste « Où est le code concerné » reste exacte (voir B-18 pour les lignes manquantes).
- Liens : sur 167 chemins de fichiers cités par `README.md`, `CLAUDE.md`, `PROMPT-CONSTRUCTION.md` et `docs/*.md`, tous existent sauf ceux de H-06 et ceux qui désignent le dépôt `interne-sauvegardes` ou des fichiers hors dépôt (`PROJET.md`, `LISEZ-MOI.md`). Les quatre liens Markdown du README sont bons.
- Aucune description d'outil du code ne cite `ajouter_encaissement` (voir B-20) ; l'outil et le bouton de l'écran sont retirés comme annoncé.
- La description de `lire_audit` ne dit plus « Vide tant qu'aucun outil d'écriture n'est en service » (corrigée depuis `retours-ux-2026-10-04.md:58`).
- `.gitignore` couvre les journaux d'émulateur et `tests/test-results/` : aucun fichier de test généré n'est suivi par git.

## Ce que je n'ai PAS regardé
- **Les autres dépôts** : `interne-sauvegardes` (jobs Backblaze, secrets, journaux d'exécution), `_JEROME_OS_onGIT` (second cerveau, carte des sauvegardes), `site-chevalier-ia`, `site_massagesensoriel`. Tout ce que j'écris sur Backblaze vient des documents, pas d'une vérification.
- **Les consoles** (Google Cloud, Firebase, Backblaze, GitHub Actions) : sauvegardes Firestore réellement actives, règles Firestore réellement publiées (identiques ou non à `firestore.rules`), secrets créés, écran de consentement « En production », version réellement en ligne sur `https://chevalier-ia-os.web.app`, journaux de déploiement.
- **Hermes et le VPS** ; Notion ; n8n.
- **Les tests** : aucun test relancé pour cette étape (consigne), je me suis appuyé sur les résultats rapportés par les étapes A à E et sur la lecture du code.
- **Les documents lus en entier** : `docs/roadmap.md`, `docs/reprise-prochaine-session.md`, `docs/retours-ux-2026-10-04.md`, `docs/mcp-projets.md`. **Lus en partie ou seulement l'en-tête et les lignes trouvées par recherche** : `docs/plan-mcp.md`, `docs/securite-et-pannes.md`, `docs/branchement-mcp.md`, `docs/prototype-drive.md`, `docs/cadrage-projets.md`, les `docs/projets-etape-*.md`, les `docs/projets-facturation-*.md`, les `docs/mcp-etape-*.md`, `docs/audit-ecran.md`, `docs/journal-ecran.md`, `docs/playbook-mcp-firebase.md`, les cahiers des charges, `docs/pipedrive-reference.md`, `docs/convention-dossiers.md`, `docs/modele-prompt-creation-dossier.md`. Les anomalies de ces fichiers que je n'ai pas cherchées ne sont donc pas exclues.
- **Les constats des étapes A à E** : je les cite, je ne les ai pas recomptés ni réexaminés. Les étapes F (parcours) et G (tests) n'étaient pas écrites au moment de cet audit.
- **Le contenu des branches distantes** : j'ai comparé uniquement ce qu'elles ont en plus que `main` (nombre de commits et liste des fichiers pour `mcp` et `v1`), sans relire leur code.
- **Les numéros de version d'outils externes** (Hermes, Claude Code, Node chez Google) et les dates annoncées (19/10/2026, 30/10/2026) : repris des documents, non vérifiés.
