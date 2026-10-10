# À faire au début de la prochaine session

Écrit le 04/10/2026, mis à jour le 07/10/2026 à la fin du chantier Projets, pour qu'une session neuve reprenne sans que Jérôme ait à recoller quoi que ce soit. **À mettre à jour ou à supprimer une fois les points faits.**

## En premier : connexion Google (OAuth) du serveur MCP pour le téléphone (09/10/2026)

PR 49 **fusionnée et déployée le 10/10/2026**, règles Firestore publiées, essai réel réussi sur l'ordinateur (`qui_suis_je` → `claude-ai-jerome-chevalier`) **et sur le téléphone** (Jérôme, 10/10/2026). Chantier terminé : rien à reprendre de ce côté. Lire `mcp-oauth.md` (mise en route dans l'ordre : publier les règles Firestore, fusionner, ajouter le connecteur sur claude.ai, essayer sur le téléphone). Si l'essai échoue : les journaux Cloud Run du service `mcp` portent un champ `code` en `oauth_…` qui dit à quelle étape ça casse. Validé en réel sur l'ordinateur et sur le téléphone. Décisions de Jérôme : tous les droits, 30 jours glissants.

## Pour mémoire : le chantier Projets est terminé (07/10/2026)

Rien à reprendre de ce côté, tout est fusionné sur `main` et le déploiement est vert : écran Projets en 7 étapes (PR #32 à #38, version 2.1.0), facturation 2.2 (PR #40 et #41, version 2.2.0 : factures dans le projet, Clôture bloquée tant qu'une facture est à payer, sortie « clôturer avec impayé », la vente s'arrête à « Gagné », migration des anciennes affaires dans Réglages) et 16 outils MCP des projets (PR #42, détail dans `mcp-projets.md`). Jérôme a essayé l'écran et dit que tout fonctionne ; **il remontera ce qu'il remarque à l'usage** : traiter ces retours en petites PR.
- **Hermes n'est pas encore configuré** (Jérôme, 07/10/2026). Au moment de le brancher, la liste des **44 outils** à autoriser est dans `branchement-mcp.md` (vérifiée par un test) : ne pas reprendre une ancienne liste (`ajouter_encaissement` n'existe plus).
- Décisions de Jérôme à ne pas rouvrir : une affaire Gagnée n'est **pas** archivée automatiquement (il l'archive à la main) ; une facture se paie en entier ; pas de délai de paiement.
- Non faits volontairement : outils MCP de modification ou de suppression de facture et de gestion des modèles (ils restent à l'écran) ; blocage du passage de phase tant que les tâches de la phase ne sont pas faites (proposé à Jérôme, pas demandé).

## 0. Migration des sauvegardes vers Backblaze : état au 04/10/2026 (soir) et suite

**À lire d'abord si Jérôme parle de sauvegardes, de Backblaze, de Drive ou de Time Machine.** Décisions et plan : `roadmap.md` (« Sauvegardes : décisions du 04/10/2026 » et « Plan de migration vers Backblaze »). Carte complète et schéma « Aujourd'hui / Cible » : dépôt `_JEROME_OS_onGIT`, fiche « Carte des sauvegardes » (la session doit avoir ce dépôt : `add_repo`, accès en écriture).

### Ce qui existe (tout fusionné sur `main` sauf mention contraire)
- **Dépôt privé `interne-sauvegardes`** (créé par Jérôme : GitHub refuse `create_repository` à Claude, 403). Contient les jobs, `README.md` (secrets, règles, activation), `LISEZ-MOI.md` (déposé en clair dans le bucket), `docs/restaurer.md`. Pour y écrire : `add_repo` avec `access: push`, puis cloner, branche, PR (le dépôt n'accepte rien sur `main` sans PR par convention).
- **Job GitHub quotidien : testé en vrai le 04/10/2026**, 8 dépôts sauvegardés (environ 119 Mo), noms chiffrés illisibles chez Backblaze, secrets masqués dans le journal.
- **Essai de restauration (mode `--github`) : réussi le 04/10/2026** : le bundle de `chevalier-ia-os` relu dans Backblaze, déchiffré, `git fsck` propre, empreinte identique. Cela confirme que la configuration rclone par l'environnement (`RCLONE_CONFIG_*`) et le chiffrement fonctionnent.
- **Écrits et testés avec un faux rclone, jamais exécutés pour de vrai** : export des bases (`scripts/bases.mjs`, `restaurer-bases.mjs`, aller-retour exact sur l'émulateur Firestore), copie de Drive (`scripts/drive.mjs`, `autoriser-drive-lecture.mjs`), surveillance (`fraicheur.mjs`), essai de restauration `--bases` et `--drive`.
- **Secrets déjà créés par Jérôme** (noms exacts) : `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `CRYPT_PASSWORD`, `CRYPT_SALT`, `JETON_LECTURE_GITHUB`. **Pas encore créés** : `CLE_FIREBASE_CHEVALIER_IA_OS`, `CLE_FIREBASE_SUIVI_PRESENCE_ELEVES`, `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`. Jamais de valeur dans la conversation, le dépôt ni un commit.
- **En attente du « fusionne » de Jérôme** : PR 2 de `_JEROME_OS_onGIT` (carte et schéma corrigés pour Time Machine : plus de disque, aucune sauvegarde du Mac). **Deux dépôts ont une PR numérotée 2** : toujours écrire le dépôt avec le numéro.
- **Les workflows planifiés sont en sommeil** tant que la variable de dépôt `SAUVEGARDE_ACTIVE` n'est pas `oui` (sinon e-mails d'échec inutiles). Les lancements manuels marchent toujours (Actions, Run workflow ; l'essai de restauration a un menu « modes » : `--github` seul avant que Drive et les bases soient prêts).
- **L'ancien système du Mac reste en place** (cron : script des `.bundle` dans Drive chaque dimanche, vérification des changements non poussés) : on n'y touche **qu'après** une semaine de succès automatiques, 8 jours d'observation de l'autorisation Google et un essai de restauration complet réussi.

### Suite, dans l'ordre
1. **Jérôme** : copie papier des deux mots de passe de chiffrement (et dans KeePassXC) si ce n'est pas fait ; merge « Conflict » du fichier KeePassXC ; copie du fichier KeePassXC hors de Drive (clé USB).
2. **Bases de données** : Jérôme crée un compte de service « Lecteur Cloud Datastore » par projet Firebase (`chevalier-ia-os`, `suivi-presence-eleves`), colle sa clé JSON dans le secret correspondant et **supprime le fichier**. Puis lancer « Bases de données vers Backblaze » à la main ; lire le journal (`get_job_logs`) ; lancer l'essai de restauration `--bases`. Vérifier si ces projets ont des fichiers dans Cloud Storage (non couverts).
3. **Drive** : ajouter la portée `drive.readonly` à l'écran de consentement du projet `chevalier-ia-os` et le passer « En production » ; Jérôme lance `node scripts/autoriser-drive-lecture.mjs` sur son Mac (fichier JSON du client OAuth dans `~/.config/interne-sauvegardes/oauth-client.json`), puis `--copier client-id`, `--copier client-secret`, `--copier jeton` vers les trois secrets. **Risque connu** : en mode « Test » le jeton expire au bout de 7 jours (le script avertit) ; repli : compte de service avec partage des dossiers. La première copie (~200 Go) est découpée et reprend toute seule d'un jour à l'autre ; point à vérifier : comment rclone traite les Google Docs natifs.
4. **Activation** : variable `SAUVEGARDE_ACTIVE` = `oui` après la recette, puis une semaine d'exécutions automatiques réussies.
5. **Bascule** (Jérôme, sur le Mac) : retirer les deux lignes du cron, ranger les scripts de `_GITHUB_BACKUP` dans `__A_SUPPRIMER` (jamais de suppression), vérifier que tout est poussé, retirer le code et le second cerveau du Mac. Puis réécrire le `CLAUDE.md` du second cerveau et « Règles de travail Git » (branche par session, ChatGPT compris ; protection de `main` des sites en production, à vérifier selon l'abonnement GitHub).
6. **Time Machine** : pas de nouveau disque pour l'instant ; décision à reprendre après la migration.

### Limites et pièges connus
- **Une session cloud ne peut pas exécuter rclone** (le réseau de la session bloque son site) : les essais réels passent par GitHub Actions ; Claude lit les journaux avec `get_job_logs` (`return_content: true`).
- **Avertissements Node 20** dans les journaux : passer `actions/checkout`, `actions/setup-node` et `actions/setup-java` à leurs versions suivantes (`setup-java` v5) dans une PR dédiée.
- Pas dans la carte des sauvegardes : Notion, n8n, iCloud Drive, fichiers du VPS.
- Prix de Backblaze : environ 1,3 $/mois pour 200 Go, relevé sur des pages de synthèse le 04/10/2026, à confirmer.

## 1. Appliquer la décision « pas de RGPD, on garde tout » (décidée le 04/10/2026)

Décision de Jérôme : base interne, aucune mesure RGPD pour l'instant ; les journaux d'audit ne s'effacent jamais, y compris les noms, e-mails et notes ; les copies « avant / après » non plus. **La règle de durée de vie (TTL) de 90 jours est déjà supprimée dans la console** (par Jérôme, le 04/10/2026) : plus rien n'efface ces copies. Il reste à aligner le code, les tests et les docs. Ne pas réintroduire le RGPD sans que Jérôme le demande.

### Où est le code concerné (état de `main` au 04/10/2026)

| Fichier | Ce qui reste de l'ancienne règle |
|---|---|
| `functions/src/coeur/ecriture.js` | `JOURS_COPIES = 90` (ligne 23) et `expireAt` écrit avec les copies (ligne ~119 et ~157) ; `tronquer(parametres)` (ligne ~39 et ~158) : le journal `crm_audit` ne garde plus les valeurs reçues |
| `js/modules/crm/logique.js` | `JOURS_COPIES_AUDIT = 90` (ligne ~1556) et `expireAt` (ligne ~1575), pour l'audit des actions de l'écran ; la copie `functions/partage/logique.js` est générée (`node scripts/preparer-fonctions.js`) |
| `firestore.rules` | la règle sur `crm_audit_avant` exige `request.resource.data.expireAt is timestamp` (ligne ~27) |
| `functions/src/coeur/restaurer.js` | message `copie_expiree` (« n'existent plus ») |
| `js/modules/crm/journal.js` | textes « elle a expiré (gardée 90 jours) » (lignes ~46 et ~166) |
| `functions/src/mcp/outils/suppression.js` | descriptions « Récupérable 90 jours » (`supprimer_note`, `supprimer_activite`) |

### Piège d'ordre à respecter

La règle Firestore **exige** `expireAt`, et l'écran comme le serveur l'écrivent. Si le code cesse de l'écrire avant que la règle soit assouplie (ou l'inverse), des écritures sont refusées. **Approche la plus sûre (recommandée)** : ne pas toucher aux règles ni au champ ; mettre `JOURS_COPIES` et `JOURS_COPIES_AUDIT` à une très grande valeur (par exemple 36 500 jours, soit 100 ans), pour que `expireAt` reste valide mais inoffensif maintenant que le TTL est supprimé. Aucune publication de règles n'est alors nécessaire. Un nettoyage complet du champ (règles, écran, serveur, tests) pourra venir plus tard, en un seul lot coordonné, si Jérôme le veut.

### À faire

1. Garder aussi les **valeurs reçues** dans `crm_audit` (paramètres, y compris noms, e-mails, notes, tronqués à 2 000 caractères comme prévu au plan 5.2), à la place des seuls noms de champs.
2. Allonger la durée des copies comme ci-dessus, adapter les textes (« gardée 90 jours », « expiré », « Récupérable 90 jours », `copie_expiree`), les descriptions d'outils et les tests.
3. Mettre à jour `plan-mcp.md` (section 5.2, écarts de l'étape 4, risque R10), `roadmap.md` (retirer « À confirmer » de l'étape 4), `securite-et-pannes.md`, `playbook-mcp-firebase.md`, `mcp-etape-4.md`, `audit-ecran.md` et `journal-ecran.md`, qui parlent encore du RGPD et des 90 jours.
4. Lancer la suite complète de tests dans la session (parcours Playwright compris : l'écran est touché), puis une PR pour Jérôme.

## 2. Reste du plan du serveur MCP, dans l'ordre (voir `roadmap.md`)

- **À vérifier avec Jérôme le 04/10/2026** : la première sauvegarde quotidienne de Firestore apparaît dans la console (« Reprise après sinistre », tableau « Sauvegardes », expiration à 98 jours).
- **Étape 6, fin** : brancher **Hermes** sur le VPS (jeton « bibliothécaire », sans suppression ni restauration ; Jérôme doit fournir `hermes --version`). Mettre à jour `branchement-mcp.md`.
- **Étape 5, fin (revue le 04/10/2026)** : plus d'export JSON par Drive. La base est exportée **directement dans Backblaze B2 (Europe), chiffrée**, chaque semaine, par un job (voir `roadmap.md`, « Sauvegardes : décisions du 04/10/2026 »). Reste : le job, `outils/restaurer-export.js` et un **essai de restauration** (qui crée une nouvelle base, jamais d'écrasement). Ordre convenu : compte Backblaze et clé de chiffrement gardée **hors de Drive**, job GitHub quotidien, essai de restauration, jobs des bases et de Drive, et **seulement ensuite** couper GitHub → Drive. Sauvegarde de l'autre appli (`suivi-presence-eleves`) : mercredi, 98 jours, première copie attendue le 07/10/2026. **Plan de migration approuvé le 04/10/2026** : dépôt privé `interne-sauvegardes` (jobs GitHub quotidien, Drive et bases hebdomadaires, tous chiffrés vers Backblaze, essai de restauration automatique) ; détail et ordre dans `roadmap.md` (« Plan de migration vers Backblaze »). Drive est lu avec l'autorisation Google de Jérôme (`drive.readonly`) : surveiller l'expiration à 7 jours, repli = compte de service. **Time Machine** : disque renvoyé, aucune sauvegarde du Mac, pas de nouveau disque pour l'instant.
- **Étape 7** : pièces jointes dans l'appli (par lien d'abord, puis téléversement vers Drive). Suppose le test à 8 jours du prototype Drive (autorisation à refaire sur le Mac, contrôle vers le 10/10/2026).
- **Étape 8** : recette et clôture.
- **En attente de discussion** : quatre points d'expérience utilisateur de la version 2.0.1 (`retours-ux-2026-10-04.md`).
