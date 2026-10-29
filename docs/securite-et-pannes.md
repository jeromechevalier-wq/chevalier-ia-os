# Sécurité et pannes du serveur MCP

Ce guide dit **comment la connexion est protégée**, **ce qui peut la casser** et **quoi faire quand elle casse**. Il est mis à jour à chaque étape du chantier (`plan-mcp.md`). Version du 02/10/2026, écrite à l'étape 2 et **mise à jour le 03/10/2026 à l'étape 4 (écriture, audit, plafonds, règles)** : chaque point est marqué **[en place]** (déjà dans le code ou la console), **[prévu]** (planifié dans une étape précise) ou **[à vérifier]** (je ne l'ai pas pu confirmer depuis ma session).

Règle d'or : **l'appli Chevalier IA OS ne dépend pas du serveur MCP.** Si la connexion MCP tombe, l'écran continue de fonctionner exactement comme avant. Le MCP n'est qu'une porte supplémentaire vers la même base.

## 1. Qui parle à qui

```
Claude Code (Mac) ──┐                         ┌─ Secret Manager : MCP_JETONS (empreintes des jetons)
Hermes (VPS) ───────┼─► https://chevalier-ia-os.web.app/mcp
                    │        │ réécriture Hosting
                    │        ▼
                    │   Cloud Run (service « mcp », Paris) = la fonction  ──► Firestore (base du CRM)   [étape 3 et suivantes]
                    │                                                    └─► Drive (pièces jointes, sauvegardes) [étapes 5 et 7]
Toi, dans l'appli ──────► Firebase Hosting + Firestore (comme avant, sans passer par le MCP)
GitHub (fusion sur main) ──► déploie d'abord la fonction, puis le site
```

Depuis l'étape 4 : la fonction lit et **écrit** la base (créer, modifier ; supprimer et restaurer réservés à Claude Code), toujours en passant par le même moteur, qui laisse une trace dans `crm_audit` (et la copie « avant/après » dans `crm_audit_avant`). L'appli, elle, écrit comme avant, directement.

## 2. Les couches de protection

| Couche | Ce qu'elle fait | État |
|---|---|---|
| Jeton par client | Une longue clé secrète (`cia_…`, 256 bits) par client ; chaque client a un nom (acteur) et un profil (lecteur, bibliothécaire, Claude Code) | **[en place]** |
| Empreintes seulement | Le coffre Google ne contient que le résumé irréversible (SHA-256) des jetons, jamais les jetons | **[en place]** |
| Comparaison à temps constant | Impossible de deviner un jeton en mesurant les temps de réponse | **[en place]** |
| Réponse unique au refus | Jeton absent, faux, mal formé ou révoqué : exactement la même réponse 401, sans détail | **[en place]** |
| Échec fermé | Si le coffre est illisible : 503, jamais d'accès accordé, jamais de copie périmée | **[en place]** |
| Droits par profil | Le serveur n'expose et n'exécute que les outils du profil du jeton, même si le client est mal configuré : lecteur = lecture ; bibliothécaire = + créer et modifier ; **Claude Code seul = supprimer et restaurer** | **[en place]** (étape 4), testé |
| Origine et méthode | En-tête `Origin` étranger refusé (403) ; tout sauf `POST` refusé (405) | **[en place]** |
| Seconde porte : connexion Google (OAuth) | Pour l'appli Claude du téléphone et claude.ai, qui ne savent pas envoyer de jeton `cia_…`. Compte Google de la liste uniquement (revérifié par le serveur), adresse de retour de Claude exactement, PKCE, code de 60 s, accès d'1 h, renouvellement avec rotation, 30 jours glissants, profil `claude-code`. Autorisations (empreintes seulement) dans la collection `mcp_oauth`, fermée à l'appli. Détail : `mcp-oauth.md` | **[en place depuis le 10/10/2026]**, testé, essai réel réussi sur l'ordinateur et le téléphone |
| Journaux sans secret | On ne note que : nom du jeton, acteur, profil, outil, durée, statut, code ; jamais jeton, en-tête, paramètres, contenus de fiches | **[en place]**, testé |
| Un seul chemin d'écriture | Aucun outil n'écrit directement : tout passe par le moteur d'écriture, qui n'écrit que dans les 6 collections de données du CRM (jamais l'audit, les compteurs ni les paramètres). Contrôlé par test | **[en place]** (étape 4) |
| Audit en trois temps | Avant d'écrire : trace « en_cours » + copie avant/après (si le journal est en panne, **rien n'est écrit**) ; puis les données ; puis la trace passe à « succes » ou « echec » | **[en place]** (étape 4), pannes simulées en test |
| Contrôle de concurrence | Une écriture est refusée (« recommencer ») si le document a changé depuis sa lecture, pour ne pas écraser une modification faite sur l'écran | **[en place]** (étape 4) |
| Restauration | `restaurer_depuis_audit` (Claude Code seul) défait une opération, avec aperçu ; refuse si un document a changé depuis | **[en place]** (étape 4) |
| Confirmation des suppressions | Le nom exact de la fiche est exigé (comme l'écran) ; une organisation non vide ne se supprime pas | **[en place]** (étape 4) |
| Audit des actions de l'écran | Chaque création, modification ou suppression faite **dans l'appli** écrit sa ligne d'audit et sa copie **dans le même lot atomique** que la donnée (canal `ecran`, à ton nom) ; `lire_audit` et `restaurer_depuis_audit` les comprennent. Ne couvre pas les réglages ni les modifications à la main dans la console | **[prêt, version 2.0.2]** : règles à publier AVANT la fusion (`audit-ecran.md`) |
| Journal sans contenu | `crm_audit` (conservé sans limite) ne contient aucune valeur de fiche, seulement qui, quoi, quand, quel document, quels champs ; les valeurs sont dans `crm_audit_avant`, effacé après 90 jours | **[en place]** (étape 4) ; l'effacement par la règle TTL de Google est **créé** (03/10/2026) ; son premier effacement réel (90 jours après une écriture) reste à constater |
| Règles Firestore | `crm_audit` lisible mais jamais modifiable depuis l'appli ; `crm_audit_avant` et `mcp_limites` fermés | **[en place]** (publiées le 03/10/2026, jeu actif vérifié ; appli vérifiée) |
| 3 instances au plus | Borne le coût et l'emballement | **[en place]** |
| Budget 5 €/mois avec alertes 50, 90 et 100 % | Prévient, **ne coupe rien** | **[en place]** (console) |
| Plafonds par jeton | 120 requêtes/min (mémoire de chaque instance : au pire 3 × 120), **500 écritures/heure** et **50 suppressions/jour** (par document supprimé) (compteurs exacts dans `mcp_limites`) ; réglables par jeton dans `MCP_JETONS` (`"limites"`) | **[en place]** (étape 4) |
| Sauvegardes Google : copie complète **quotidienne gardée 98 jours** et **récupération à la minute sur 7 jours** | Retour en arrière si des données sont abîmées, indépendamment du code du serveur ; une restauration crée une **nouvelle** base, jamais d'écrasement | **[en place]** (activées le 03/10/2026 par Jérôme) ; **première sauvegarde à constater** ; **aucun essai de restauration fait** |
| Copies chiffrées dans **Backblaze B2 (Europe)** : bases de données chaque semaine, GitHub chaque jour, tout Drive chaque semaine | Copie hors de Google et hors de GitHub, indépendante du Mac ; remplace l'ancien export JSON par Drive (décision du 04/10/2026) | **[prévu]** (voir la carte globale, ci-dessous) |

**Compte d'exécution dédié [en place, 03/10/2026]** : la fonction tourne avec `mcp-serveur@chevalier-ia-os.iam.gserviceaccount.com`, qui n'a que deux droits : « Utilisateur Cloud Datastore » (lire et écrire Firestore, sur le projet) et « Accesseur de secrets » (sur `MCP_JETONS` seulement). Elle ne tourne plus avec le « Default compute service account » (rôle « Éditeur » sur tout le projet). En cas de faille dans la fonction, les dégâts se limitent à ce que le CRM fait déjà. Le compte de déploiement GitHub peut agir en son nom grâce au rôle « Utilisateur du compte de service », accordé au niveau du projet (plus large que nécessaire : à resserrer au seul compte `mcp-serveur` quand on voudra).

### Carte globale des sauvegardes (décisions du 04/10/2026)

La carte de **toutes** les sauvegardes (code, second cerveau, Drive, mots de passe, bases de données, Time Machine, Backblaze), avec son schéma « Aujourd'hui » et « Cible », vit dans le dépôt du second cerveau : fiche **« Carte des sauvegardes »** de `_JEROME_OS_onGIT` (wiki, Concepts). Ici, seulement ce qui concerne le CRM :
- **Fiches du CRM** : Firestore (vérité), copies Google (quotidiennes 98 jours, retour à la minute 7 jours, depuis le 03/10/2026 21 h 19), Journal (copies avant/après de chaque écriture, restaurables par `restaurer_depuis_audit`). Depuis la décision « on garde tout » du 04/10/2026, plus aucune règle n'efface ces copies. **À venir** : export chiffré hebdomadaire de la base dans Backblaze, directement depuis la fonction (aucune étape par Drive : une copie dans Drive ne protège pas d'un compte Google bloqué).
- **Le Mac** : **aucune sauvegarde Time Machine** (disque défaillant renvoyé le 04/10/2026, pas de nouveau disque pour l'instant). Le code et le second cerveau sont dans GitHub, les documents dans Drive : ne reste exposé que ce qui n'existe que sur le Mac.
- **Autre appli** (suivi des élèves, projet `suivi-presence-eleves`) : sauvegarde planifiée chaque mercredi, 98 jours, **sans** retour à la minute ; aucune copie encore le 04/10/2026, la première est attendue le 07/10/2026.
- **Restaurer** : une fiche, par le Journal ; une base entière, depuis une copie Google (elle crée une **nouvelle** base, jamais d'écrasement) ; jamais testé à ce jour. Un essai de restauration depuis Backblaze sera fait avant de couper un autre filet.

## 3. Où sont les secrets

| Secret | Où il vit | Qui peut le lire | Comment le révoquer |
|---|---|---|---|
| Jeton d'un client (`cia_…`) | Ton gestionnaire de mots de passe, puis la configuration du client (variable d'environnement sur le Mac ou le VPS, fichier à droits 600) | Toi et le client | Passer `"actif": true` à `false` dans une **nouvelle version** du secret `MCP_JETONS` (effet en moins d'une minute) |
| Empreintes des jetons | Secret Google `MCP_JETONS` | Le compte d'exécution de la fonction (**`mcp-serveur@chevalier-ia-os.iam.gserviceaccount.com`**, compte dédié depuis le 03/10/2026 ; auparavant le « Default compute service account ») et les propriétaires du projet | Désactiver la version du secret : tout est refusé |
| Clé du compte de déploiement | Secret GitHub `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS` | GitHub Actions (jamais affichée dans les journaux) | Console Google : IAM → Comptes de service → clés, supprimer la clé ; en créer une nouvelle et remplacer le secret GitHub |
| Autorisations Drive (jetons de rafraîchissement) | **[prévu]** secret `DRIVE_OAUTH` (pièces jointes, étape 7, portée `drive.file`) ; un second jeton **`drive.readonly`** (compte Google de Jérôme) dans les secrets du dépôt `interne-sauvegardes` pour la copie de tout Drive | La fonction ; le job de sauvegarde | https://myaccount.google.com/permissions : retirer l'accès à « Chevalier IA OS - Drive serveur » |
| Jeton GitHub de sauvegarde | **[prévu]** jeton fin **lecture seule** (Contenu, Métadonnées) sur tous les dépôts, dans les secrets de `interne-sauvegardes` ; expiration notée dans l'agenda, rotation annuelle | Le job | GitHub : Settings, Developer settings, Personal access tokens : le révoquer |
| Comptes de service de lecture des bases | **[prévu]** « Lecteur Cloud Datastore », un par projet (`chevalier-ia-os`, `suivi-presence-eleves`), clé JSON dans les secrets de `interne-sauvegardes` ; le fichier de la clé est supprimé après l'avoir collée | Le job | Console Google : IAM, Comptes de service : supprimer la clé |
| Clé de chiffrement Backblaze | **[prévu]** une copie **hors de Drive** (papier, support hors ligne) ; ne jamais la ranger seulement dans KeePassXC, qui est dans Drive donc copié dans Backblaze | Toi | Sans elle, les copies sont illisibles pour toujours : ne jamais la perdre |
| Clé d'accès Backblaze du job | **[prévu]** Secret Manager ; droit d'ajouter des fichiers, pas d'en supprimer | Le job | Console Backblaze : supprimer la clé d'application |

**Le dépôt est public depuis le 20/10/2026** : tout ce qui est écrit dans le dépôt, `docs/` et `wiki/` compris, est lisible par tout le monde, historique inclus. Ne jamais y écrire de donnée de client, de secret ni de détail qui ne doit pas être public (voir la ligne du 20/10/2026 du journal, section 9).

Ne jamais mettre un jeton ou une clé : dans le dépôt, dans un dossier synchronisé avec Drive, dans une conversation, dans un message de commit. Un contrôle automatique (`tests/statique.test.js`) refuse un jeton `cia_…`, une clé privée ou un secret OAuth dans le dépôt.

## 4. Interrupteurs d'urgence, du plus rapide au plus lent

1. **Couper tout le MCP en moins d'une minute, sans rien déployer** : console Google → Secret Manager → `MCP_JETONS` → désactiver la version active. Toute requête est alors refusée. Pour rétablir : réactiver la version. https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os
2. **Couper un seul client** : nouvelle version du secret avec `"actif": false` sur sa ligne.
3. **Retirer l'accès public du service** : console Google → Cloud Run → service `mcp` → Sécurité → retirer l'invocation publique. https://console.cloud.google.com/run?project=chevalier-ia-os
4. **Passer un client en lecture seule, sans le couper** : dans une **nouvelle version** du secret `MCP_JETONS`, changer `"profil"` de sa ligne en `"lecteur"` (effet en moins d'une minute). Utile si un agent écrit n'importe quoi : il peut encore lire, plus rien écrire.
5. **Couper la connexion Google (téléphone, claude.ai)**, sans toucher Hermes ni Claude Code : console Firestore → collection `mcp_oauth` → « Supprimer la collection » (ou, pour une seule connexion, `revoque: true` sur son document `connexion_…`). Effet immédiat. Désactiver `MCP_JETONS` (point 1) ne coupe **pas** cette porte. **Pas à pas, avec les clics : `mcp-oauth.md`, « Couper l'accès du téléphone ».** Retirer le connecteur dans Claude ne suffit pas, il faut passer par Firestore. https://console.firebase.google.com/project/chevalier-ia-os/firestore/data
6. **Retirer le code** : `git revert -m 1 <commit de fusion>` sur `main` ; le workflow redéploie avec `--force`, ce qui **supprime aussi la fonction** retirée du code. Vérifier ensuite dans Cloud Run que le service `mcp` a disparu (sinon le supprimer à la main).

### Le MCP des clients (plateforme, depuis le 16/10/2026) : couper un accès
Détail dans `mcp-clients.md`. Du plus fin au plus large, tout agit à l'appel suivant (les droits sont relus à chaque appel) :
- **un membre** : le retirer (`retirer-membre <client> adresse --ecrire`) ou changer son rôle ;
- **un client** : éteindre son module (`desactiver-module <client> mcp --ecrire`) ou le désactiver (`desactiver-client <client> --ecrire`) ;
- **tous les clients** : supprimer la fonction `mcpclients` (`firebase functions:delete mcpclients --config firebase.plateforme.json --project chevalier-ia-app`). Le MCP de Jérôme (`/mcp` sur `chevalier-ia-os`) n'est pas touché ;
- **une connexion précise** : dans la console Firestore de `chevalier-ia-app`, collection `mcp_oauth`, document `connexion_<identifiant>` : mettre `revoque` à `true` (le champ `client` dit de quel client il s'agit).

## 5. Pourquoi il n'y a pas de « porte dérobée » dans le code

Idée évoquée le 02/10/2026 : prévoir un accès caché, éteint, qu'on activerait en changeant une ligne et en redéployant. **Décision : non**, pour deux raisons.
- C'est une porte qui existe en permanence dans le code. Qui obtient un accès en écriture au dépôt (jeton GitHub volé, compte piraté) l'ouvre en changeant une ligne, sans avoir besoin d'un jeton MCP.
- Elle ne répond pas aux pannes redoutées. Elle demande un déploiement : si la panne vient du déploiement (Google), elle est inutilisable ; si elle vient du client (Hermes, Claude Code), le serveur n'y est pour rien.

**À la place, des accès de secours qui ne contournent rien** (ils passent par ton identité Google, pas par le serveur) :
- **L'appli** : indépendante du MCP **[en place]**.
- **La console Firebase / Google Cloud** : tu peux lire et corriger des documents à la main (Firestore → Données) **[en place]**.
- **Un script de secours sur ton Mac** qui lit et écrit dans la base avec **ton compte Google** (connexion `gcloud auth application-default login`), sans clé à conserver et sans code de plus sur le serveur **[prévu]**. Il sera écrit et testé avant la clôture du chantier.
- **Les sauvegardes** : copies Google quotidiennes (98 jours) et récupération à la minute (7 jours) **[en place]** ; copie chiffrée dans Backblaze **[prévu]** (plus d'export JSON par Drive). Où les voir : console Google Cloud, Firestore, **Reprise après sinistre** : https://console.cloud.google.com/firestore/databases/-default-/disaster-recovery?project=chevalier-ia-os . Pour restaurer une sauvegarde, le menu d'actions de sa ligne propose « Restaurer avec Cloud Shell » (crée une nouvelle base) ; la récupération à un moment précis se demande depuis la même page ou par `gcloud` **[à confirmer au premier essai : non testé]**. Une restauration est facturée selon la taille de la base.

## 6. Pannes : symptôme, cause probable, vérification, réparation

### Déploiement (GitHub Actions)

Page de suivi : https://github.com/jeromechevalier-wq/chevalier-ia-os/actions. Un déploiement qui échoue **ne casse pas le site** : le site n'est redéployé qu'après les fonctions, il reste tel qu'il était.

| Symptôme dans le journal | Cause | Réparation |
|---|---|---|
| `Missing permissions … iam.serviceAccounts.ActAs on service account chevalier-ia-os@appspot.gserviceaccount.com` | Le compte de déploiement n'a pas le rôle « Utilisateur du compte de service » | Console IAM : https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-os , crayon sur le compte de déploiement, ajouter le rôle. La ligne « Compte de déploiement : … » du journal donne l'adresse exacte du compte à modifier. Attendre 1 à 2 minutes, puis **Re-run failed jobs**. *(Rencontré le 02/10/2026.)* |
| `Permission denied`, `403`, `API … has not been used` | Rôle manquant ou API non activée | Le message nomme le rôle ou l'API : l'ajouter (un à la fois), puis relancer |
| `billing account` / `Blaze` / `requires billing` | Le projet n'est pas relié à un compte de facturation | https://console.cloud.google.com/billing/linkedaccount?project=chevalier-ia-os *(rencontré le 02/10/2026 : le projet n'avait aucun compte associé)* |
| `Missing required permission … cloudfunctions.functions.setIamPolicy … to deploy new HTTPS functions` | Rendre la fonction publique demande le droit d'administrer les fonctions (le rôle « Développeur » ne suffit pas) | Ajouter **Administrateur Cloud Functions** au compte de déploiement (`github-action-…`), attendre 1 à 2 minutes, **Re-run failed jobs**. *(03/10/2026.)* |
| `Functions successfully deployed but could not set up cleanup policy in location europe-west9` (la commande échoue alors que la fonction est bien déployée) | En mode non interactif, l'outil ne peut pas proposer la règle de nettoyage des anciennes images | `--force` dans la commande de déploiement (déjà dans le workflow). Si l'erreur persiste avec `--force` : droit manquant sur Artifact Registry (rôle « Administrateur Artifact Registry »), ou créer la règle à la main : console → Artifact Registry → dépôt `gcf-artifacts` (Paris) → règles de nettoyage. *(03/10/2026.)* |
| `Permissions denied enabling eventarc.googleapis.com` (ou une autre API) | L'outil de déploiement a besoin d'une API non activée et le compte de déploiement n'a pas le droit de l'activer lui-même | Activer l'API à la main avec le lien du message (changer `project=NUMÉRO` en `project=chevalier-ia-os` si besoin), puis **Re-run failed jobs**. *(Eventarc, 02/10/2026.)* |
| Échec à `npm ci` | `functions/package-lock.json` absent ou désaccordé avec `package.json` | Sur le Mac : `cd functions && npm install`, puis commiter les deux fichiers |
| Avertissement `Node.js 20 is deprecated … actions/checkout@v4` | Les actions GitHub utilisées vieillissent | Pas une panne : passer à la version suivante des actions (`checkout`, `setup-node`) quand elle existe. **À faire avant que GitHub ne retire Node 20.** |
| Avertissement `ubuntu-latest will migrate to Ubuntu 26 beginning October 19, 2026` | Le système du runner change | Pas une panne, mais **à surveiller après le 19/10/2026** : si le déploiement casse sans changement de code, figer `runs-on: ubuntu-24.04` dans le workflow |
| Déploiement vert mais `/mcp` répond 404 | La réécriture Hosting vers le service Cloud Run n'a pas pris (forme **[à vérifier]**) | Essayer l'adresse directe de la fonction (visible dans Cloud Run) ; repli prévu au plan |

### Publier les règles Firestore du CRM (workflow manuel)

Les règles (`firestore.rules`) ne partent **pas** avec la fusion d'une PR. Pour les publier : GitHub > onglet Actions (https://github.com/jeromechevalier-wq/chevalier-ia-os/actions) > à gauche « Publier les règles (CRM de Jérôme) » > « Run workflow » > bouton vert. Le workflow ne tourne jamais tout seul et ne publie ni fonctions ni site. Il publie seulement les règles Firestore (le CRM n'a pas de règles Storage à la racine). Publier deux fois les mêmes règles ne change rien.

**À faire une seule fois (rôle du compte de déploiement)** : ouvrir https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-os , repérer dans la liste le compte dont l'adresse commence par `github-action-` (la ligne « Compte de déploiement : … » du journal donne l'adresse exacte), cliquer le crayon à droite, « Ajouter un autre rôle », choisir « Administrateur des règles Firebase », Enregistrer. Attendre 1 à 2 minutes. Sans ce rôle, le journal finit par un message qui rappelle ce rôle (erreur de permission).

### Réponses du serveur `/mcp`

| Réponse | Sens | Vérification / réparation |
|---|---|---|
| `401 {"error":"non_autorise"}` | Jeton absent, faux, mal collé, ou révoqué (volontairement sans détail) | Vérifier que le client envoie `Authorization: Bearer cia_…` ; recréer un jeton si doute ; vérifier dans `MCP_JETONS` que la ligne existe et que `actif` est `true` |
| `403 {"error":"origine_refusee"}` | Un navigateur (en-tête `Origin` étranger) appelle le serveur | Normal pour Hermes et Claude Code (ils n'envoient pas d'`Origin`). Si l'un d'eux en envoie un : le signaler, on adapte la liste |
| `405 {"error":"methode_refusee"}` | Un client essaie `GET` | Les clients MCP doivent utiliser `POST` (transport « Streamable HTTP » sans session) |
| `503 {"error":"indisponible"}` | Le secret `MCP_JETONS` est illisible (secret absent, version désactivée, **compte d'exécution non autorisé à le lire**, API Secret Manager coupée) | Voir le journal Cloud Run (ligne `code: secret_illisible`) ; vérifier que le secret existe, qu'une version est active et que **le compte réellement utilisé par la fonction** a le rôle « Accesseur de secrets » : le lire dans Cloud Run → service `mcp` → onglet Sécurité → Compte de service (c'est `mcp-serveur@…` depuis le 03/10/2026 ; ne pas se fier au compte `…@appspot…`). *(Cause du 503 rencontré le 03/10/2026.)* |
| `429 {"error":"limite_depassee"}` (avec `Retry-After`) | Plus de 120 requêtes en une minute pour ce jeton (souvent un client qui boucle) | Attendre la durée indiquée ; chercher pourquoi le client boucle ; si c'est légitime, relever `requetesParMinute` dans la ligne du jeton |
| Erreur d'outil `PERMISSION_DENIED` (ou `Missing or insufficient permissions`) sur une lecture | Le compte d'exécution n'a pas le droit de lire Firestore (rôle « Utilisateur Cloud Datastore » retiré, ou compte d'exécution changé) | Donner au compte lu dans Cloud Run → Sécurité (`mcp-serveur@…`) le rôle « Utilisateur Cloud Datastore » (`roles/datastore.user`) sur le projet |
| Erreur d'outil `Cloud Firestore API has not been used` | API Firestore désactivée sur le projet | La réactiver : https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=chevalier-ia-os |
| Réponse d'outil tronquée (`tronque: true`) | Plus de 200 lignes | Affiner les filtres ; ce plafond protège le client |
| Réponse lente (1 à 3 s la première fois) | Départ à froid de la fonction | Normal ; le client Hermes est réglé avec un délai de 120 s |

### Écrire : pannes et récupération (étape 4)

Ces messages arrivent comme **erreur d'outil** (réponse 200 avec `isError`), jamais comme erreur HTTP.

| Message (début) | Sens | Ce qu'il faut faire |
|---|---|---|
| `Plafond atteint pour ce jeton : … écritures par heure` / `… suppressions par jour` | Un compteur de `mcp_limites` est plein ; **rien n'a été écrit** | Attendre le délai indiqué ; si un agent boucle, révoquer ou passer son jeton en lecture seule (section 4) ; relever la limite du jeton si c'est légitime |
| `Le journal d'audit est indisponible : rien n'a été écrit.` | Impossible d'écrire dans `crm_audit` / `crm_audit_avant` (Firestore en panne, droit retiré) | Rien à nettoyer. Vérifier https://status.cloud.google.com et le rôle « Utilisateur Cloud Datastore » du compte `mcp-serveur` ; réessayer |
| `Écriture refusée, rien n'a été écrit (un document a été modifié entre-temps : recommencer)` | Quelqu'un (toi, sur l'écran) a modifié le même document entre la lecture et l'écriture | Relire la fiche et recommencer |
| `Écriture interrompue : N document(s) sur M écrits. Opération XXX…` | Panne au milieu d'une grosse opération (plusieurs paquets de 400) | `restaurer_depuis_audit` avec cet identifiant d'opération (aperçu d'abord) remet les documents déjà écrits dans l'état d'avant |
| `Écriture faite, mais le journal n'a pas pu être complété…` (champ `auditIncomplet`) | Les données sont écrites, mais la ligne d'audit est restée « en_cours » | Rien à défaire. `lire_audit` avec `incompletes: true` montre ces lignes ; elles restent restaurables |
| `Les copies « avant » de cette opération manquent : N ligne(s) sur M. Utiliser une sauvegarde…` | La restauration est demandée trop tard | Passer par une sauvegarde (copie Google, étape 5) |
| `N document(s) ont changé depuis cette opération : rien n'a été restauré` | Quelqu'un a modifié depuis ; la restauration n'écrase pas | Lire l'aperçu ; si l'écrasement est voulu, `forcer: true` |
| `PERMISSION_DENIED` à l'écriture alors que la lecture marche | Rôle « Utilisateur Cloud Datastore » retiré ou compte d'exécution changé | Voir la ligne `PERMISSION_DENIED` plus haut |
| Une fiche a un contenu inattendu après le passage d'un agent | Un agent a écrit autre chose que prévu | `lire_audit` (par `acteur` ou `docId`), puis `restaurer_depuis_audit` |

**Défaire une écriture, pas à pas** : 1) `lire_audit` avec `acteur`, `docId` ou `depuis` pour retrouver la ligne ; 2) noter son `operationId` ; 3) `restaurer_depuis_audit` avec cet `operationId` (aperçu) ; 4) relire l'aperçu : chaque ligne dit `supprimer`, `remplacer`, `recreer`, `rien` ou `conflit` ; 5) relancer avec `apercu: false`. Une restauration laisse sa propre trace et peut elle-même être restaurée.

### Après la version 2.0.2 : l'appli n'enregistre plus rien

| Symptôme | Cause probable | Réparation |
|---|---|---|
| Tous les enregistrements de l'appli échouent (« Enregistrement impossible », « Ajout impossible »), les listes s'affichent | L'appli 2.0.2 écrit le journal d'audit **dans le même lot** que les données ; si les règles Firestore ne sont pas celles de `audit-ecran.md`, Firestore refuse tout le lot | Publier les règles de `audit-ecran.md` (console Firebase, Firestore, Règles). Si ce n'est pas possible tout de suite : annuler la PR (`git revert -m 1 <commit de fusion>`), l'appli repasse en 2.0.1 |
| Un seul type d'action échoue | Un champ refusé dans la ligne d'audit ou dans la copie (par exemple une valeur interdite par Firestore) | Relever le nom de l'action dans la console du navigateur (le nom de la fonction figure dans la ligne d'audit) et me le donner |

### Côté clients

| Symptôme | Causes probables | Réparation |
|---|---|---|
| **Claude Code** ne voit plus le serveur | Mise à jour de Claude Code qui change la syntaxe `claude mcp add` ; jeton absent de la variable d'environnement | Relancer `claude mcp list` ; vérifier la variable `CHEVALIER_MCP_TOKEN` ; tester d'abord avec `curl` (voir `mcp-etape-2.md`, point 5) : si `curl` marche, le serveur est sain et le problème est côté client |
| **Hermes** ne se connecte plus | Mise à jour de Hermes (format de `config.yaml`, nom des outils) ; jeton absent du fichier d'environnement du VPS | Même test `curl` depuis le VPS ; relever `hermes --version` ; comparer avec `docs/branchement-mcp.md` (Claude Code **validé** le 03/10/2026 ; Hermes en brouillon) |
| `curl` marche depuis le Mac mais pas depuis le VPS | Pare-feu du VPS, DNS, heure du VPS | Tester `curl -I https://chevalier-ia-os.web.app` depuis le VPS |

**Méthode en trois questions** quand « ça ne marche plus » :
1. L'appli (https://chevalier-ia-os.web.app) fonctionne-t-elle ? Non → problème Firebase/Google, hors MCP.
2. `curl` avec le jeton répond-il (`qui_suis_je`) ? Non → lire le code de la réponse ci-dessus ; oui → le serveur est sain, le problème est dans le client (Hermes ou Claude Code).
3. Qu'est-ce qui a changé récemment ? (Mise à jour du client, du VPS, déploiement GitHub, alerte de Google par e-mail.)

## 7. Versions figées et mises à jour

Tout est figé à une version exacte pour qu'une mise à jour de l'extérieur ne casse rien toute seule :

| Élément | Version | Où | Pour mettre à jour |
|---|---|---|---|
| Node (fonctions) | 22 | `functions/package.json`, `firebase.json`, workflow | Google arrête Node 22 en 2028 ; prévoir le changement un an avant |
| SDK MCP | 1.32.0 | `functions/package.json` | Lire les notes de version, mettre à jour, lancer `cd tests && npm run test:fonctions` |
| `firebase-functions`, `firebase-admin`, `@google-cloud/secret-manager`, `zod` | 7.4.0, 14.5.0, 7.1.1, 4.6.5 | `functions/package.json` | Idem |
| Outil de déploiement | `firebase-tools@15.32.0` | workflow, `tests/package.json` | Changer les deux ensemble |
| Dépendances installées | figées par `functions/package-lock.json` (le workflow utilise `npm ci`) | dépôt | Jamais à la main : `npm install` sur le Mac puis commit |

Procédure de mise à jour : changer **une** version à la fois sur une branche, lancer les tests, lire le journal du déploiement, et garder le commit précédent sous la main (`git revert`).

## 8. Contrôle trimestriel (15 minutes)

- Les alertes de Google (e-mails de facturation, avis de dépréciation) sont-elles lues ?
- Le budget « Chevalier IA OS » : coût du mois, montant toujours à 5 €.
- Secret `MCP_JETONS` : chaque ligne `actif: true` correspond-elle encore à un client réellement utilisé ? Les jetons inutilisés sont passés à `false`.
- Les journaux Cloud Run (service `mcp`) montrent-ils des `401` répétés (tentatives) ?
- https://myaccount.google.com/permissions : seules les applications attendues ont accès.
- Dates à surveiller : **19/10/2026** (`ubuntu-latest` passe à Ubuntu 26), **fin de support des actions GitHub sur Node 20**, **2028** (Node 22 chez Google).
- Un test de restauration (étape 5 et suivantes) : une copie récente se restaure-t-elle ? **Jamais fait à ce jour.**
- Sauvegardes Google : la page « Reprise après sinistre » montre-t-elle une sauvegarde de moins de 24 heures, et les deux réglages (récupération à un moment précis, sauvegardes quotidiennes) sont-ils toujours « activés » ?
- Journal (étape 4) : `lire_audit` avec `incompletes: true` (lignes restées « en_cours »), et le nombre de lignes `echec` récentes ; la stratégie TTL de `crm_audit_avant` est-elle toujours active (console Firestore → Time-to-live) ? Les règles publiées sont-elles toujours celles de `firestore.rules` ?

## 9. Journal des incidents et constats

| Date | Constat | Résolution |
|---|---|---|
| 28/10/2026 | Dictionnaire de vocabulaire du module Devis (`devis_vocabulaire`, PR 3 du 28/10/2026) : tant qu'aucune règle ne la nommait, la collection tombait sous le joker de `firestore.rules` (tout compte autorisé en lecture et écriture) et sous la règle générale des éditeurs de `firestore.plateforme.rules` : un navigateur pouvait gonfler les compteurs d'une règle apprise, en inventer une, réécrire l'expression ou la supprimer | Règles écrites dans les deux fichiers (PR 4) : lecture par les membres ; création seulement d'une règle manuelle (`statut` active ou désactivée, `origine` manuelle, compteurs à zéro, sans conflit, sans exemples ni dates du serveur) ; modification limitée à `statut`, `articleId`, `articleLibelle`, `note`, `conflit` et les marques ; jamais de suppression ; collection exclue du joker (Jérôme) et ajoutée à `collectionSansSuppression` (clients). Tests `tests/devis-vocabulaire-regles.test.js` (V4a à V4i). **Règles NON publiées** : « Publier les règles (CRM de Jérôme) » (`publier-regles.yml`), puis « Déploiement plateforme clients » > `regles` (publie aussi les règles Storage inchangées), lancé par Jérôme |
| 28/10/2026 | **La suite de nuit était coupée à 45 minutes depuis le 25/10 : sept nuits rouges sans alerte.** Un job qui dépasse son délai est « annulé », pas « échoué », et l'alerte ne regardait que « échoué » ; le job unique dépassait même 89 minutes. | Délai porté à 90 min, navigateur gardé en cache, alerte aussi sur un job annulé (PR 357) ; puis nuit découpée en 13 jobs, comme les PR (PR 364). Le résultat du premier run découpé est à vérifier sur GitHub (Actions > « Tests de nuit »). |
| 25/10/2026 | Le journal des demandes « Préparer l'e-mail » d'un devis (`crm_actions_lancements`, ajouté par la PR 299) tombait sous la règle générale : un navigateur pouvait le lire (lecteur compris) et l'écrire (éditeur), donc truquer l'anti-doublon. Aucun écran ne le lit : seul le serveur l'écrit (fonction `devisPreparerEmail`, porte `devis.noterEmailPrepare`) | Collection **fermée aux navigateurs** (ni lecture ni écriture), dans `firestore.rules` et `firestore.plateforme.rules`, comme le compteur des devis ; tests C1j et C1k (`tests/devis-regles.test.js`). À publier par Jérôme (règles) |
| 20/10/2026 | **Dépôt GitHub passé en public** (les 2 000 minutes gratuites d'Actions étaient presque épuisées ; en public, elles sont illimitées). Balayage de tout l'historique : aucune clé privée, aucun jeton, aucun fichier `.env` ni compte de service ; seulement les deux clés web Firebase (publiques par conception). Tout `docs/` et `wiki/` est désormais lisible par n'importe qui | Les deux clés web sont **restreintes aux sites web** (console Google, Identifiants) : projet `chevalier-ia-os` : `https://chevalier-ia-os.web.app/*`, `https://chevalier-ia-os.firebaseapp.com/*`, `https://docs.google.com/*` ; projet `chevalier-ia-app` : `https://chevalier-ia-app.web.app/*`, `https://chevalier-ia-app.firebaseapp.com/*`, `https://docs.google.com/*` (essai réussi le 20/10/2026 sur l'espace clientdemo). **`docs.google.com` est obligatoire** : sans lui, la fenêtre Picker de Google répond « La clé de développement d'API n'est pas valide » (constaté le 20/10/2026 sur `chevalier-ia-os`, corrigé en l'ajoutant). Si le Picker casse un jour, vérifier d'abord cette liste. Plan B si besoin : une clé séparée « sélecteur Drive », limitée à Google Picker API et Google Drive API, via `googleDrive.cleApi` |
| 03/10/2026 | **Essai en réel de l'étape 4 réussi** (écrire, journaliser, refuser, supprimer, restaurer à l'identique, nettoyer), avec les nouvelles règles Firestore publiées. Au passage : le jeton copié depuis KeePassXC faisait 23 caractères au lieu de 47 (mauvais champ), détecté par un contrôle de longueur qui n'affiche pas le jeton ; et une session cloud ne voit pas le Mac (l'essai se fait dans le Terminal du Mac) | Contrôle de longueur ajouté au guide (`mcp-etape-4.md`) ; TTL créé après l'essai (la collection `crm_audit_avant` n'existe qu'après la première écriture) |
| 02/10/2026 | Le projet `chevalier-ia-os` n'avait **aucun compte de facturation** (le plan supposait le forfait Blaze actif) ; la liste des projets du budget n'en montrait qu'un | Projet relié au compte « Paiement de Firebase », budget de 5 € créé avec alertes 50, 90 et 100 % |
| 03/10/2026 | **Compte de service dédié `mcp-serveur`** créé (Utilisateur Cloud Datastore + Accesseur de secrets sur `MCP_JETONS`), option `serviceAccount` dans `functions/src/index.js` ; déploiement vert, lecture de `lister_affaires` validée en réel par `curl` | Le « Default compute service account » n'est plus utilisé par la fonction (ses droits n'ont pas été modifiés) |
| 03/10/2026 | Essais `curl` : `{"error":"indisponible"}` (503) deux fois, puis succès. Cause : l'accès au secret `MCP_JETONS` avait été donné au compte `chevalier-ia-os@appspot…`, alors que la fonction tourne avec le « Default compute service account » (lu dans Cloud Run → Sécurité) | Rôle « Accesseur de secrets Secret Manager » donné au compte `96526036520-compute@developer…` ; **`qui_suis_je` répond : la connexion de bout en bout est validée** |
| 03/10/2026 | Cinquième tentative (2 min 17 s) : **la fonction `mcp` est créée à Paris** (`https://europe-west9-chevalier-ia-os.cloudfunctions.net/mcp`) ; la commande échoue ensuite sur la règle de nettoyage des images (non interactif), donc Hosting n'est pas déployé | `--force` ajouté dans le workflow (il supprime aussi, au déploiement suivant, une fonction retirée du code) |
| 03/10/2026 | Quatrième tentative (code 40 s) : Cloud Billing activée, le déploiement a atteint la création de la fonction ; puis `cloudfunctions.functions.setIamPolicy` manquant (rôle « Développeur Cloud Functions » insuffisant pour une fonction publique) | Rôle « Administrateur Cloud Functions » à ajouter au compte `github-action-…` |
| 03/10/2026 | Troisième tentative : Eventarc et Firebase Extensions activées, le déploiement a avancé ; puis « Permissions denied enabling cloudbilling.googleapis.com » | API Cloud Billing activée à la main |
| 02/10/2026 | Deuxième tentative : API Eventarc non activée (« Permissions denied enabling eventarc »). Le rôle « Utilisateur du compte de service » était alors pris en compte (le déploiement a avancé jusqu'à l'envoi du code) | API Eventarc activée à la main |
| 02/10/2026 | Premier déploiement : `iam.serviceAccounts.ActAs` manquant sur `chevalier-ia-os@appspot.gserviceaccount.com` | Rôle « Utilisateur du compte de service » à ajouter au compte de déploiement ; ajout dans le workflow d'une ligne qui affiche l'adresse de ce compte pour éviter de la chercher |

## 10. File « À valider » : ce qui est protégé et ce qui reste ouvert (2.24.0)

- **Fonction `automatisationsDecider`** : réservée aux deux comptes autorisés, e-mail vérifié ; l'identité du décideur vient du jeton, jamais de la demande ; mêmes options et même compte de service que `tableaudebordSaisir`, aucun secret. Décision atomique (une seule gagne en cas de course). Journal à liste blanche : action, statut, code, décision, durée, jamais de contenu. Interrupteur d'urgence : retirer la déclaration de la fonction dans `functions/src/index.js` et les 5 outils de `OUTILS` (`functions/src/mcp/outils/index.js`) **et** du registre (sinon `tests/registre-mcp.test.js` rougit), puis fusionner : coupure au déploiement suivant. Sans déploiement : couper la connexion Google ; les jetons `cia_` ne peuvent de toute façon pas décider.
- **Contenu non fiable** : titre, résumé et champs d'une proposition viennent d'un e-mail. L'écran les affiche uniquement par `h()` (jamais `innerHTML`), et les réponses MCP portent un avertissement. `erreur` de `marquerEchec` est masquée si elle ressemble à un secret.
- **Fenêtre ouverte tant que les règles ne sont pas publiées** : dans ta base, `automatisations_propositions` n'est pas encore fermée à l'écriture depuis le navigateur (joker de `firestore.rules`). La PR des règles est laissée ouverte pour toi ; après sa fusion il faut publier les règles à la main dans la console Firebase (les règles de la base 1 ne se déploient pas avec la fusion), puis choisir `regles` dans le workflow de la plateforme. Même chose en base 2.
- La réponse « Déjà décidée par <e-mail> » révèle l'e-mail de l'autre compte : acceptable (les deux comptes sont les tiens), à revoir avant la plateforme clients.
- Hors de cette nuit, à ne pas oublier : en base 2, `crm_audit` et `mcp_codes` sont écrivables par un éditeur depuis le navigateur (`docs/tables.md`).

### Lignes « en préparation » restées bloquées (Logger, 22/10/2026)
Si un workflow A plante après `demarrer`, sa ligne reste « en préparation ». Aucune fonction ne les balaie : après 15 minutes sans nouvelle étape, l'écran propose le bouton gris « Classer sans suite » (deux comptes autorisés ; le serveur vérifie qu'elle est bien bloquée). Ce geste **ne dit rien à n8n** : si le workflow tourne encore, il verra ses écritures refusées. « Classer sans suite » n'existe qu'à l'écran, jamais par MCP.

## 11. Module Devis : outils d'écriture sensibles (24/10/2026, révisé le 25/10/2026)

Décision de Jérôme (25/10/2026) : les outils MCP peuvent faire autant qu'un humain devant l'écran (enregistrer un envoi, changer le statut, archiver, supprimer), parce que le journal (`crm_audit` et `crm_audit_avant`) permet de revenir en arrière. Chaque outil appelle la **même fonction** de `functions/src/coeur/devis.js` que le bouton de l'écran (une seule logique), dans une seule transaction avec sa ligne de journal. Aucune porte dérobée.

| Outil | Profil | Confirmation | Se défait avec `restaurer_depuis_audit` ? |
|---|---|---|---|
| `nouvelle_version_devis` | bibliothécaire, Claude Code | non (crée un brouillon) | oui (supprime ce brouillon) |
| `archiver_devis` (archiver ou désarchiver) | bibliothécaire, Claude Code | non | oui |
| `enregistrer_envoi_devis` (historique des envois) | bibliothécaire, Claude Code | non | oui (retire la dernière ligne) |
| `creer_devis_brouillon`, `modifier_devis_brouillon` (dont `copie`) | bibliothécaire, Claude Code | non | oui tant que le devis est un brouillon |
| `supprimer_devis` (brouillon seulement) | Claude Code | **aperçu puis code** | oui (le brouillon revient avec le même identifiant ; ses documents et fichiers n'ont jamais été touchés) |
| `finaliser_devis` | Claude Code | **aperçu puis code** | **non** (numéro consommé) |
| `changer_statut_devis` (marquer envoyé, accepter, refuser) | Claude Code | marquer envoyé : **direct** ; accepter, refuser : **aperçu puis code** | **non** (trace du statut ; « accepter » remplace les autres versions) |

- **Aperçu puis code** (`functions/src/securite/codes.js`) : le premier appel ne change rien et rend un aperçu et un code ; le second appel, avec le code, écrit. Le code est lié au jeton, à l'outil, au devis (et à l'action pour `changer_statut_devis`) et à l'**empreinte du devis** (s'il change entre les deux, le code ne vaut plus), expire en 5 minutes et ne sert qu'une fois. Le **plafond d'écriture du jeton est vérifié avant** la consommation du code : un jeton au plafond est refusé sans brûler le code. `supprimer_devis` compte aussi dans le plafond de suppressions par jour.
- **Voie de secours pour un devis finalisé** : `nouvelle_version_devis`, qui crée le brouillon suivant (même numéro) ; le message de refus de la restauration la propose. Un trou dans les numéros n'est pas grave.
- La restauration d'un archivage ou d'un envoi enregistré est permise même si le devis n'est plus un brouillon, mais **jamais de force** si le statut du devis a changé depuis (sinon on contournerait la règle des statuts).
- Aucun outil n'envoie d'e-mail : `enregistrer_envoi_devis` note seulement un envoi déjà fait par l'humain.
- **Écritures de l'écran sans journal** (constat du 25/10/2026, non modifié) : les **familles d'articles** et les **réglages du module Devis** (y compris « Mon entreprise ») sont écrits par le navigateur avec un simple `setDoc`, sans ligne dans `crm_audit` ; aucun outil MCP ne les écrit (lecture seule : `lire_reglages_devis`). Les articles et les brouillons de devis, eux, sont journalisés.
- **Vocabulaire des devis** (`devis_vocabulaire`, 28/10/2026) : lu par les membres ; le navigateur crée seulement une règle manuelle (compteurs à zéro, sans exemples ni dates du serveur) et la révise (statut, article, note, conflit) ; compteurs, origine, expression, exemples et dates de confirmation sont réservés au serveur ; jamais de suppression (une règle se désactive). Le serveur pose `via` à la création ; l'écran ne le modifie pas. Voir la ligne du journal du 28/10/2026 (section 9) et `docs/proposition-dictionnaire-vocabulaire.md`, section 4.
- **Suppression d'un brouillon et fichiers** (décision de Jérôme, 26/10/2026) : `supprimer_devis` (et le bouton de l'écran) ne touche **jamais** aux documents de l'affaire ni aux fichiers du stockage. Un « Devis brouillon – Objet – JJ-MM-AAAA HHhMM.pdf » déjà joint à l'affaire y reste, avec son fichier ; il se retire à la main avec `retirer_document` ou depuis l'affaire. Le serveur MCP n'a donc plus besoin d'aucun droit sur Cloud Storage (jusqu'au 28/10/2026 ; voir la section « Onglet Documents »). La copie « avant » du devis reste dans le journal (`restaurer_depuis_audit`).
- Interrupteurs d'urgence : ceux du serveur MCP (section 4) coupent aussi les outils Devis. Pour garder la lecture et couper seulement l'écriture, passer le jeton en profil `lecteur` (section 4, point 4) : tous les outils ci-dessus disparaissent d'un coup.

### Onglet « Documents » : fichiers déposés chez nous (28/10/2026)

- **Où** : fichiers dans Cloud Storage sous `documents/<affaire|projet>/<id>/<uuid>-<nom>` (chez un client : `clients/<client>/documents/…`), fiche dans la collection `documents_stockes` (lecture : membres ; **écriture : serveur seulement**, règle `allow write: if false`). Le navigateur n'a aucun accès direct au stockage : dépôt, lien et suppression passent par les fonctions `documentDeposer`, `documentLien` (lien signé de 5 minutes) et `documentSupprimer`. Aucune règle Storage n'est modifiée (chez Jérôme, aucun fichier de règles Storage n'est dans le dépôt : état dans la console non vérifié).
- **Quota** : 2 Go de fichiers non supprimés par espace (`QUOTA_ESPACE_OCTETS`) ; au-delà, le dépôt est refusé.
- **Contrôles** (`js/modules/crm/fichiers-regles.js`, copié sur le serveur) : extension, type annoncé et premiers octets du fichier ; exécutables, scripts, HTML, SVG et types inconnus refusés (aussi en double extension). Taille : réglage de l'espace (1 à 25 Mo, défaut 25) borné par le serveur à 20 Mo (corps d'un appel ~32 Mo en base64) ; au-delà, « envoi direct pas encore disponible » (il demandera d'ajouter PUT au CORS du bucket, avec Jérôme).
- **Suppression** = corbeille logique : la fiche reçoit `supprimeLe`, le fichier ne bouge jamais ; `restaurer_depuis_audit` remet la fiche et le fichier redevient visible. Rien n'est effacé définitivement.
- **MCP** : `deposer_document` ne reçoit que du **texte** (txt, md, csv, 64 Ko) ; un assistant ne peut pas transmettre un PDF du chat. `supprimer_document_stocke` : aperçu puis code, comme les autres suppressions.
- **Droits à donner** (sinon l'outil MCP répond « le compte du serveur n'a pas le droit d'écrire dans le stockage ») : rôle « Administrateur des objets de Storage » sur le bucket, avec condition de nom d'objet, aux comptes `mcp-serveur@chevalier-ia-os` et `porte-serveur@chevalier-ia-os` (fonctions de l'écran ; condition `documents/`) et au compte `mcp-clients@chevalier-ia-app` (condition `clients/`). Les fonctions de l'écran utilisent le compte des PDF (`porte-serveur` chez Jérôme, `devis-pdf` chez les clients, déjà autorisé sous `clients/`). Droits de `porte-serveur` sur Storage chez Jérôme : non documentés, à vérifier.

## 12. Garantie « aucun e-mail ne part tout seul » (29/10/2026)

**Décision de Jérôme** : le logiciel ne fait que **préparer un brouillon d'e-mail** que la personne relit et envoie elle-même. Jérôme peut garantir à ses clients qu'aucun e-mail ne part spontanément.

- **Ce qui est vrai dans le code** : aucune portée d'envoi Gmail (`gmail.send`, `gmail.compose`…), aucun appel à l'API Gmail, aucun SMTP dans `functions/`, `functions-plateforme/`, `js/`, `scripts/` (test `tests/devis-garantie-email.test.js`, critère 5). Le seul appel sortant lié aux e-mails est la demande « fais un brouillon » à n8n (`coeur/n8n-sortie.js`, corps fixe : `action`, `espace`, `devisId`, `demandeId`, aucun contenu).
- **Ce qui n'est PAS sous notre contrôle** : le workflow n8n « Préparer l'e-mail » (il doit rester un nœud Gmail « Créer un brouillon », jamais « Envoyer ») et un éventuel **connecteur Gmail propre à l'assistant** du client (ChatGPT, Claude…). Essai du 29/10/2026 : faute d'outil pour le PDF officiel, ChatGPT a refait un PDF et l'a envoyé avec **son** connecteur. Réponses : (1) outil `obtenir_pdf_officiel_devis`, (2) outil `preparer_email`, (3) la règle dans toutes les descriptions d'outils des devis, (4) `enregistrer_envoi_devis` garde l'`origine` de l'envoi, (5) le texte de garantie lu au client (`docs/deploiement-client.md`) lui demande de régler son connecteur en lecture ou brouillon seulement.
- **Droits à donner pour que les deux outils marchent** (sinon l'outil répond « pas branché » ou « le lien du PDF n'a pas pu être créé », rien de dangereux) : « Accesseur de secrets » sur `N8N_DEVIS_EMAIL_URL` et `N8N_DEVIS_EMAIL_SECRET` (chez les clients : les secrets avec le suffixe `_<client>`) pour `mcp-serveur@chevalier-ia-os` et `mcp-clients@chevalier-ia-app` ; et « Créateur de jetons du compte de service » donné à chacun de ces deux comptes **sur lui-même** (signer le lien de 5 minutes du PDF), l'API IAM Service Account Credentials étant déjà activée. À faire par Jérôme dans la console, puis redéployer `mcp` (jamais avant la fusion).
- **Si un doute** : le journal (`lire_audit`) montre qui a demandé un brouillon (`devisPreparerEmail`) et chaque envoi enregistré (`devisEnregistrerEnvoi`, avec `origine`). Un envoi `hors_logiciel` n'est pas passé par nous.
