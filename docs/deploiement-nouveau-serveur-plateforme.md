# Déployer un deuxième serveur de plateforme (nouveau projet Google pour des clients)

Écrit le 26/10/2026, à partir de ce qui a été appris en déployant les fonctions et le PDF chez les clients (projet `chevalier-ia-app`). **Jamais essayé de bout en bout sur un vrai deuxième projet** : chaque libellé de la console Google que le dépôt ne confirme pas est marqué « à vérifier au premier essai ». Après le premier vrai essai, corrige ce document tout de suite.

Ce document est la **liste dans l'ordre**. Il ne recopie pas les modes d'emploi qui existent déjà : il renvoie vers eux. Lis-les au moment indiqué.

> Public : le dépôt est public. Ici, jamais de clé, de secret, de numéro de projet réel ni de donnée de client. Les valeurs à remplacer sont écrites entre chevrons.

## Les valeurs à remplacer

| Valeur | Ce que c'est | Où la trouver |
|---|---|---|
| `<ID-DU-NOUVEAU-PROJET>` | L'identifiant du projet Google, par exemple `mon-serveur-2` (en minuscules, tirets, définitif) | Choisi à l'étape 1 ; visible en haut de la console Google |
| `<NUMERO-DU-PROJET>` | Un long nombre, différent de l'identifiant | Firebase : roue dentée > **Paramètres du projet** > « Numéro de projet » ; ou page d'accueil de la console Google Cloud, carte « Informations sur le projet » (à vérifier au premier essai) |
| `<NOM-DU-BUCKET>` | Le nom du stockage, en général `<ID-DU-NOUVEAU-PROJET>.firebasestorage.app` | Console Firebase > Storage, le nom qui suit `gs://` ; ne le devine pas |
| `<SITE>` | L'adresse du site : `https://<ID-DU-NOUVEAU-PROJET>.web.app` | Par défaut, l'identifiant du projet |
| `<CLIENT>` | L'identifiant d'un client (17 caractères au plus s'il aura des automatisations) | Tu le choisis, voir `docs/nouveau-client.md` |

**Les trois pièges à connaître avant de commencer** :

1. **Le projet est écrit en dur dans le code** (voir l'étape 0). Un deuxième serveur n'est donc pas qu'un réglage Google : il faut d'abord une PR de code, faite par Claude.
2. **Dans la console Google, le projet s'affiche avec son nom, pas son identifiant** (`chevalier-ia-app` s'affiche « Chevalier IA - Serveur 1 »). Avant chaque clic, lis le nom du projet en haut de la page et vérifie que c'est le nouveau, jamais `chevalier-ia-os` (le CRM de Jérôme) ni `chevalier-ia-app` (le serveur 1).
3. **Ne crée jamais de clé de compte de service**, sauf la seule clé de `deploiement-github` (étape 7), qui va dans GitHub et nulle part ailleurs.

---

## Étape 0. Préparer le code (Claude, avant que Jérôme clique quoi que ce soit)

Aujourd'hui, `chevalier-ia-app` est écrit en dur à plusieurs endroits. Une PR de code, relue par Fable (serveur, règles et workflow : relecture obligatoire), doit les rendre propres au nouveau projet : soit en copiant le dossier de configuration pour le nouveau projet, soit en transformant la valeur en réglage. Liste relevée dans le dépôt le 26/10/2026 (à relancer par `grep -rn "chevalier-ia-app"` avant de commencer, la liste peut avoir bougé) :

- [ ] `.firebaserc` : ajouter un alias pour le nouveau projet.
- [ ] `scripts/projets/plateforme.json` (configuration web publique du projet) et `scripts/hebergement.js` (`projetFirebase`) : un fichier de configuration et une entrée par projet. La configuration web se copie depuis Firebase > Paramètres du projet > « Vos applications » (valeurs publiques par nature ; jamais de clé de compte de service : un test le refuse).
- [ ] `.github/workflows/deploiement-plateforme.yml` : le nom du secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_APP` et l'option `--project chevalier-ia-app` ; il faut un second workflow ou un choix de projet.
- [ ] `functions-plateforme/src/index.js` : région, bucket (`BUCKET`) et comptes de service (`mcp-clients@…`, `espace-reglages@…`, `COMPTE_PDF`). Ce sont des adresses complètes avec le nom du projet.
- [ ] `functions-plateforme/src/devis-pdf.js`, `functions-plateforme/src/mcp-clients.js`.
- [ ] `functions/src/clients/config.js` (adresse du site, origines autorisées, domaine d'authentification), `functions/src/clients/gestionnaire.js`, `functions/src/index.js` (projet de la plateforme lu par le serveur de Jérôme).
- [ ] `scripts/plateforme/commun.js` (`PROJET_PLATEFORME`), `scripts/plateforme/nouveau-client.js`, `scripts/plateforme/donnees-client.js`, `scripts/porte/outil.js`.
- [ ] `firestore.plateforme.rules` et `storage.plateforme.rules` : seulement des commentaires citent le projet ; vérifier que les règles ne contiennent rien d'autre de propre à `chevalier-ia-app`. Le nom du bucket est dans la console, pas dans les règles (à vérifier au premier essai).
- [ ] Les tests qui citent le projet (`tests/plateforme-deploiement.test.js`, `tests/mcp-clients.test.js`, etc.) sont adaptés dans la même PR.
- [ ] Même règle que d'habitude (`CLAUDE.md`, 26/10/2026) : tout ce qui est ajouté dans `functions/` existe aussi dans `functions-plateforme/`. Le contrôle des écarts entre les deux dossiers se refait avant le déploiement.
- [ ] La PR est fusionnée avant l'étape 14 (premier déploiement). Les étapes 1 à 13 (console Google) peuvent se faire pendant ce temps.

---

## Partie A. Le projet Google

### Étape 1. Créer le projet et la facturation

- [ ] Ouvre <https://console.firebase.google.com/> > **Ajouter un projet** (*Add project*). Nom : ce que tu veux ; **l'identifiant** (`<ID-DU-NOUVEAU-PROJET>`) apparaît sous le nom : note-le, il ne se change plus. Google Analytics : tu peux refuser. Tu dois voir le tableau de bord du projet. Erreur « identifiant déjà pris » : change-le.
- [ ] Facturation : en bas à gauche de la console Firebase, **Spark** > **Mettre à niveau** > forfait **Blaze** (*pay as you go*), et choisis ou crée un compte de facturation. Réussi quand le bas à gauche affiche « Blaze ». Sans Blaze, les fonctions ne se déploient pas. (Conseil : crée aussi une alerte de budget dans Google Cloud > Facturation > Budgets et alertes, libellé à vérifier au premier essai.)
- [ ] Vérifie que tu es **propriétaire** du projet : <https://console.cloud.google.com/iam-admin/iam?project=<ID-DU-NOUVEAU-PROJET>>, ta ligne doit porter « Propriétaire ».

### Étape 2. Activer les APIs

Pour chacune, ouvre le lien, vérifie le nom du projet en haut, clique le bouton bleu **Activer** (s'il affiche déjà « Gérer », c'est fait). Remplace `<ID-DU-NOUVEAU-PROJET>` dans l'adresse.

- [ ] Cloud Functions : <https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Cloud Build : <https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Artifact Registry : <https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Eventarc : <https://console.cloud.google.com/apis/library/eventarc.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Cloud Run : <https://console.cloud.google.com/apis/library/run.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Pub/Sub : <https://console.cloud.google.com/apis/library/pubsub.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Cloud Scheduler : <https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Secret Manager : <https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Firestore : <https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Cloud Storage (normalement activée par Firebase Storage à l'étape 4) : <https://console.cloud.google.com/apis/library/storage.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] **IAM Service Account Credentials** (la plus oubliée : sans elle, le lien de lecture du PDF ne se crée pas) : <https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com?project=<ID-DU-NOUVEAU-PROJET>>
- [ ] Le workflow GitHub utilise aussi des APIs que Firebase active lui-même (Service Usage, Firebase Hosting, Cloud Resource Manager, IAM…). Si un déploiement dit « API has not been used in project … before or it is disabled », le message donne le lien : clique-le, **Activer**, attends 2 minutes, relance.
- Les APIs de Drive et Picker (étape 17) viennent plus tard.

### Étape 3. Firestore (la base) et région

- [ ] Ouvre <https://console.firebase.google.com/project/<ID-DU-NOUVEAU-PROJET>/firestore> > **Créer une base de données**. Édition : **Standard** (à vérifier au premier essai). Emplacement : **europe-west9** (Paris, comme le serveur 1 ; **définitif**). Mode : **production** (les règles viennent de l'étape 15). Réussi quand tu vois la page vide « Données ».
- [ ] Toutes les fonctions sont en `europe-west9` (`REGION` dans `functions-plateforme/src/index.js`). Ne choisis pas une autre région pour la base : les déclencheurs de Firestore exigent des régions compatibles.

### Étape 4. Storage (les images et les PDF)

- [ ] Ouvre <https://console.firebase.google.com/project/<ID-DU-NOUVEAU-PROJET>/storage> > **Commencer** > **Démarrer en mode production** > emplacement **europe-west9** (définitif) > **OK**. Réussi quand le nom du bucket s'affiche en haut (`gs://…`). Note `<NOM-DU-BUCKET>`.
- Tant que Storage n'est pas activé, ne publie pas les règles (étape 15) : le déploiement des règles Storage échouerait.

### Étape 5. Hébergement (le site) et connexion Google

- [ ] Ouvre <https://console.firebase.google.com/project/<ID-DU-NOUVEAU-PROJET>/hosting> > **Commencer** (si Firebase propose d'installer l'outil en ligne de commande, ignore : le workflow s'en charge) ; le site par défaut est `<SITE>`. Si le nom du site par défaut n'est pas `<ID-DU-NOUVEAU-PROJET>`, note-le : l'étape 0 doit l'utiliser.
- [ ] Authentification : <https://console.firebase.google.com/project/<ID-DU-NOUVEAU-PROJET>/authentication> > **Commencer** > fournisseur **Google** > **Activer** > choisis un e-mail d'assistance > **Enregistrer**.
- [ ] Domaines autorisés (même page > onglet **Paramètres** > **Domaines autorisés**) : `<ID-DU-NOUVEAU-PROJET>.web.app` doit y être (à vérifier au premier essai).
- [ ] Connexion sur téléphone : le domaine d'authentification du code doit être `<ID-DU-NOUVEAU-PROJET>.web.app`, pas `.firebaseapp.com` (essai réel du 11/10/2026, détail dans `docs/deploiement-plateforme.md`, « Si quelque chose ne va pas »). Ajoute `<SITE>/__/auth/handler` aux « URI de redirection autorisés » du client OAuth web : <https://console.cloud.google.com/apis/credentials?project=<ID-DU-NOUVEAU-PROJET>> > ouvre le client « Web client » > **URI de redirection autorisés** > **Ajouter un URI** > **Enregistrer** (libellés à vérifier au premier essai).

---

## Partie B. Les comptes de service et leurs droits

Tous se créent ici : <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=<ID-DU-NOUVEAU-PROJET>>. Les droits se donnent ici : <https://console.cloud.google.com/iam-admin/iam?project=<ID-DU-NOUVEAU-PROJET>> > bouton **Accorder l'accès** (*Grant access*). Pour changer une ligne déjà présente : crayon à droite de la ligne > **Ajouter un autre rôle** > **Enregistrer**. Libellés français entre parenthèses : repris des autres documents ; si un libellé diffère, cherche le nom anglais ou l'identifiant `roles/…`.

Un compte de service s'appelle `<nom>@<ID-DU-NOUVEAU-PROJET>.iam.gserviceaccount.com`. **Le nom doit être exactement celui que le code attend.**

### Étape 6. Récapitulatif des comptes (à lire d'abord)

| Compte | Sert à | Droits (rôle) | Mode d'emploi détaillé |
|---|---|---|---|
| `deploiement-github` | Le workflow GitHub qui publie | Administrateur Firebase ; Consommateur Service Usage ; Utilisateur du compte de service ; **Administrateur Cloud Scheduler** | Étape 7 ; `docs/deploiement-plateforme.md` |
| `mcp-clients` | Fonction `mcpclients` | Utilisateur Cloud Datastore (`roles/datastore.user`), rien d'autre | Étape 8 ; `docs/mcp-clients.md` |
| `espace-reglages` | Fonction `espaceReglages` (« Mon espace ») | Utilisateur Cloud Datastore ; Administrateur des objets Storage **avec condition** sur `marques/` | Étape 9 ; `docs/mon-espace.md` |
| `devis-pdf` | Fonctions `devisPdf`, `devisPdfLien`, `devisPdfAuto` | Utilisateur Cloud Datastore ; Administrateur des objets Storage **avec condition** sur `clients/` ; Créateur de jetons du compte de service **sur lui-même** ; Récepteur d'événements Eventarc (`roles/eventarc.eventReceiver`) ; Demandeur Cloud Run (`roles/run.invoker`) | Étape 10 ; `docs/pdf-clients.md` |
| Compte de calcul par défaut `<NUMERO-DU-PROJET>-compute@developer.gserviceaccount.com` | Les fonctions sans compte dédié (automatisations, devis, déploiement) et le transport des déclencheurs | Demandeur Cloud Run ; Récepteur d'événements Eventarc (étape 11) ; accès au secret `N8N_API_KEY` (étape 12) | Étape 11 |
| Agent de service Pub/Sub `service-<NUMERO-DU-PROJET>@gcp-sa-pubsub.iam.gserviceaccount.com` | Livrer les événements de Firestore | Créateur de jetons du compte de service (`roles/iam.serviceAccountTokenCreator`) | Étape 11 |

Si le code mentionne un autre compte de service (par exemple pour la marque ou « Mon espace »), cherche `serviceAccount:` dans `functions-plateforme/src/index.js` : au 26/10/2026 il n'y en a que trois (`mcp-clients`, `espace-reglages`, `devis-pdf`). **Tous doivent exister avant le premier déploiement `fonctions`** : un seul absent fait échouer toutes les fonctions ensemble avec « serviceAccount … does not exist ».

### Étape 7. Le compte de déploiement `deploiement-github` (et sa clé, la seule)

Mode d'emploi complet : `docs/deploiement-plateforme.md`, sections 1 et 2.

- [ ] Crée le compte `deploiement-github` (nom exact). **Créer et continuer**.
- [ ] Donne-lui ces quatre rôles (**Ajouter un autre rôle** pour chacun) :
  - **Administrateur Firebase** (*Firebase Admin*)
  - **Consommateur Service Usage** (*Service Usage Consumer*)
  - **Utilisateur du compte de service** (*Service Account User*) : sans lui, le choix `fonctions` échoue avec « Missing permissions … iam.serviceAccounts.ActAs ».
  - **Administrateur Cloud Scheduler** (*Cloud Scheduler Admin*) : sans lui, erreur 403 `cloudscheduler.jobs.update` sur la fonction `automatisationsCopieHoraire` (constaté le 26/10/2026).
- [ ] Réussi : sur la page IAM, la ligne `deploiement-github@…` porte les 4 rôles.
- [ ] Clé (unique exception à « jamais de clé ») : clique le compte > onglet **Clés** > **Ajouter une clé** > **Créer une clé** > **JSON** > **Créer**. Le fichier se télécharge sur le Mac. Si Google refuse (« la création de clés est désactivée par une règle »), arrête-toi et dis-le : on prendra une autre voie, ne contourne rien.
- [ ] Mets-la dans GitHub (voir l'étape 13), puis **supprime le fichier du Mac** et vide la corbeille. Elle ne va jamais dans une conversation ni dans le dépôt.

### Étape 8. Le compte `mcp-clients`

Mode d'emploi : `docs/mcp-clients.md`, « À déployer, dans l'ordre », point 0.

- [ ] Crée le compte `mcp-clients` (nom d'affichage libre). **Aucune clé.**
- [ ] Donne-lui seulement **Utilisateur Cloud Datastore** (*Cloud Datastore User*, `roles/datastore.user`). Variante en ligne de commande dans Cloud Shell (les deux commandes sont dans `docs/mcp-clients.md`, avec `--project <ID-DU-NOUVEAU-PROJET>`).
- [ ] Réussi : après le déploiement `mcp`, Cloud Run > service `mcpclients` > Sécurité affiche ce compte.

### Étape 9. Le compte `espace-reglages`

Mode d'emploi : `docs/mon-espace.md`, « À faire par Jérôme avant le déploiement », points 1 et 2.

- [ ] Crée le compte `espace-reglages`. **Aucune clé.**
- [ ] Rôle 1 : **Utilisateur Cloud Datastore**.
- [ ] Rôle 2 : **Administrateur des objets Storage** (*Storage Object Admin*) avec la condition IAM (titre « Seulement marques », onglet **Éditeur de condition**), en remplaçant le bucket :
  ```
  resource.type == "storage.googleapis.com/Object" && resource.name.startsWith("projects/_/buckets/<NOM-DU-BUCKET>/objects/marques/")
  ```
  Si Google refuse la condition (le bucket n'est pas en accès uniforme) : dis-le à Claude, on mettra le droit sur le bucket plutôt que sur le projet.

### Étape 10. Le compte `devis-pdf`

Mode d'emploi : `docs/pdf-clients.md`, étapes 1 et 2. **Tant que ce compte n'existe pas avec ses droits, ne lance pas le choix `fonctions`.**

- [ ] Crée le compte `devis-pdf`. **Aucune clé.**
- [ ] Droit 1 : **Utilisateur Cloud Datastore**.
- [ ] Droit 2 : **Administrateur des objets Storage** avec condition, titre « Seulement clients » :
  ```
  resource.type == "storage.googleapis.com/Object" && resource.name.startsWith("projects/_/buckets/<NOM-DU-BUCKET>/objects/clients/")
  ```
- [ ] Droit 3 : **Créateur de jetons du compte de service**, donné **à ce compte sur lui-même** : <https://console.cloud.google.com/iam-admin/serviceaccounts?project=<ID-DU-NOUVEAU-PROJET>> > clique `devis-pdf` > onglet **Autorisations** (*Permissions*) > **Accorder l'accès** > principal `devis-pdf@<ID-DU-NOUVEAU-PROJET>.iam.gserviceaccount.com` > ce rôle. Sans ce droit (ou sans l'API IAM Service Account Credentials de l'étape 2) : « Stockage : le lien du PDF n'a pas pu être créé. »
- [ ] Droit 4 : **Récepteur d'événements Eventarc** (`roles/eventarc.eventReceiver`), au niveau du projet.
- [ ] Droit 5 : **Demandeur Cloud Run** (`roles/run.invoker`), au niveau du projet. Sans les droits 4 et 5, la fonction se déploie mais `pdf.statut` ne passe jamais à « en cours ».
- [ ] Réussi : la page IAM montre la ligne `devis-pdf@…` avec 4 rôles (le 5e, sur lui-même, est sur la page du compte).

### Étape 11. Les trois droits du premier déclencheur Firestore (une fois par projet, AVANT le premier `fonctions`)

Découvert au 2e essai de déploiement `fonctions` du 26/10/2026. Le premier déploiement d'une fonction à déclencheur Firestore (`devisPdfAuto`, via Eventarc) dans un projet échoue avec :

> Failed to verify the project has the correct IAM bindings… We failed to modify the IAM policy for the project

parce que `deploiement-github` n'a pas le droit de modifier la politique IAM du projet. Comme il ne doit pas l'avoir, on donne **à la main** ces trois droits, au niveau du projet (page IAM > **Accorder l'accès**), en remplaçant `<NUMERO-DU-PROJET>` :

- [ ] (1) Principal `service-<NUMERO-DU-PROJET>@gcp-sa-pubsub.iam.gserviceaccount.com` (agent de service Pub/Sub), rôle **Créateur de jetons du compte de service** (`roles/iam.serviceAccountTokenCreator`). Si Google ne trouve pas cet agent, active d'abord l'API Pub/Sub (étape 2) ou crée un sujet Pub/Sub quelconque pour le faire apparaître, ou coche « Inclure les attributions de rôles fournies par Google » dans la liste IAM (à vérifier au premier essai).
- [ ] (2) Principal `<NUMERO-DU-PROJET>-compute@developer.gserviceaccount.com` (compte de calcul par défaut), rôle **Demandeur Cloud Run** (`roles/run.invoker`).
- [ ] (3) Même principal, rôle **Récepteur d'événements Eventarc** (`roles/eventarc.eventReceiver`).

Alternative : coller les trois commandes dans Cloud Shell (icône `>_` en haut à droite de la console Google, projet bien choisi) :

```
gcloud projects add-iam-policy-binding <ID-DU-NOUVEAU-PROJET> --member=serviceAccount:service-<NUMERO-DU-PROJET>@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator
gcloud projects add-iam-policy-binding <ID-DU-NOUVEAU-PROJET> --member=serviceAccount:<NUMERO-DU-PROJET>-compute@developer.gserviceaccount.com --role=roles/run.invoker
gcloud projects add-iam-policy-binding <ID-DU-NOUVEAU-PROJET> --member=serviceAccount:<NUMERO-DU-PROJET>-compute@developer.gserviceaccount.com --role=roles/eventarc.eventReceiver
```

**Puis attends environ 5 minutes avant de relancer `fonctions`.** Au premier déploiement d'une fonction 2e génération à déclencheur Firestore dans un projet, `devisPdfAuto` peut échouer avec « Permission denied while using the Eventarc Service Agent … may take a few minutes before all necessary permissions are propagated » (« first time using 2nd gen functions … Retry the deployment in a few minutes »). Remède constaté le 26/10/2026 : **attendre 5 minutes et relancer `fonctions`**, sans autre rôle. Seulement si l'échec revient avec le même message après ce délai : vérifier que `service-<NUMERO-DU-PROJET>@gcp-sa-eventarc.iam.gserviceaccount.com` porte le rôle « Agent de service Eventarc » (`roles/eventarc.serviceAgent`, libellé à vérifier au premier essai ; jamais nécessaire jusqu'ici).

Ordre réellement vécu le 26/10/2026 : (1) 1er `fonctions` : fonctions orphelines à supprimer ; (2) rôle Cloud Scheduler sur `deploiement-github` ; (3) les 3 droits ci-dessus ; (4) attendre 5 minutes, relancer. Sur un projet neuf, fais (2) et (3) avant le 1er `fonctions`.

Réussi : chaque commande affiche la liste des liaisons (`bindings:`) sans erreur ; ou les trois lignes apparaissent sur la page IAM.

---

## Partie C. Les secrets et GitHub

### Étape 12. Les secrets (noms seulement ; les valeurs ne se voient jamais ici)

| Où | Nom | Pour quoi | Comment |
|---|---|---|---|
| Secret Manager du projet Google | `N8N_API_KEY` | Fonctions des automatisations (lecture de n8n) | `docs/automatisations-n8n.md`, partie 7.b (commande `firebase functions:secrets:set N8N_API_KEY --project <ID-DU-NOUVEAU-PROJET>` : le programme demande la valeur, colle-la, elle ne s'affiche pas). Contrôle : <https://console.cloud.google.com/security/secret-manager?project=<ID-DU-NOUVEAU-PROJET>> liste `N8N_API_KEY`, version 1 « activée ». |
| Secrets GitHub du dépôt | `FIREBASE_SERVICE_ACCOUNT_<NOUVEAU-PROJET>` (nom exact à fixer par l'étape 0) | Clé JSON de `deploiement-github` | Étape 13 |

- [ ] **Sans `N8N_API_KEY`, le choix `fonctions` s'arrête avant d'avoir rien publié.** Si le nouveau serveur n'aura aucun client avec automatisations, demande à Claude, dans l'étape 0, de ne pas déclarer ces fonctions pour ce projet plutôt que de poser une fausse clé.
- [ ] Les fonctions des devis n'ont **aucun secret** déclaré (volontairement : un secret absent ferait échouer toutes les fonctions). Le bouton « Préparer l'e-mail » a besoin de secrets propres à n8n, voir `docs/ajouter-un-bouton-workflow.md` (le compte de service de la fonction doit avoir « Accesseur de secrets » sur eux). À vérifier au premier essai.

### Étape 13. GitHub : le secret et les variables

- [ ] Ouvre <https://github.com/jeromechevalier-wq/chevalier-ia-os/settings/secrets/actions> > **New repository secret**. **Name** : le nom exact choisi à l'étape 0 (pour le serveur 1 : `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_APP`). **Secret** : ouvre le fichier `.json` avec TextEdit, ⌘A, ⌘C, colle, **Add secret**. Puis supprime le fichier du Mac.
- [ ] Variables du dépôt ou de l'environnement : le workflow actuel n'en utilise **aucune** (seulement le secret, le projet est écrit dans la commande). Si l'étape 0 ajoute un choix de projet, la PR doit lister ici les noms des variables à créer (<https://github.com/jeromechevalier-wq/chevalier-ia-os/settings/variables/actions>). Valeurs jamais dans le dépôt.
- [ ] Réussi : au premier lancement du workflow, le journal affiche « Compte de déploiement : deploiement-github arobase <ID-DU-NOUVEAU-PROJET>… ». Si le journal dit « Le secret … n'existe pas encore », le nom est mal écrit.

---

## Partie D. Premier déploiement, dans le bon ordre

Workflow : <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml> > **Run workflow** > branche `main` > le choix > bouton vert. **Seul Jérôme le lance** (jamais Claude). Choix possibles : `hosting`, `regles`, `tout`, `fonctions`, `mcp`, `espace`. **`tout` = hosting + règles, JAMAIS les fonctions.** Les fonctions se publient toujours à part.

### Étape 14. L'ordre

Pour chaque lancement : attends le vert (la roue jaune devient une coche verte) avant le suivant.

1. - [ ] **`regles`** (en premier : la base existe, les règles Firestore et Storage). Prérequis : étapes 3 et 4. Échec « storage » : Storage n'est pas activé.
2. - [ ] **Étapes 15 et 16** (index ; le CORS n'est plus nécessaire depuis le 27/10/2026) : rien à publier ici, voir plus bas.
3. - [ ] **Avant `fonctions`** : vérifie que les comptes de l'étape 6 existent (surtout `devis-pdf`, `mcp-clients`, `espace-reglages`), que les trois droits de l'étape 11 sont donnés, que `N8N_API_KEY` existe, que la PR de l'étape 0 est fusionnée, et **qu'il n'y a pas de fonction orpheline** (voir l'encadré ci-dessous).
4. - [ ] **`fonctions`** : publie TOUTES les fonctions : automatisations (`automatisationsCopieHoraire`, `automatisationsRafraichir`, `automatisationsRenommer`, `automatisationsDecider`), `mcpclients`, `espaceReglages`, les fonctions des devis, `deploiementVerifier`, les trois du PDF (`devisPdf`, `devisPdfLien`, `devisPdfAuto`). Peut durer plusieurs minutes. Réussi : les fonctions sont listées sur <https://console.cloud.google.com/functions/list?project=<ID-DU-NOUVEAU-PROJET>>, région `europe-west9`.
   - Variantes plus petites : `mcp` publie seulement `mcpclients` (aucun secret nécessaire), `espace` publie seulement `espaceReglages`. Utiles pour corriger une seule fonction.
5. - [ ] **`hosting`** (en dernier : le site et ses réécritures vers `/mcp/…` et `/oauth/…`). **Si tu le lances avant les fonctions**, Hosting refuse une réécriture vers un service qui n'existe pas encore.
6. - [ ] Ouvre `<SITE>/espace/<CLIENT>` : sans fiche de marque, tu dois voir la page neutre « Espace indisponible » (c'est normal).

**Ce qui échoue si l'ordre est mauvais** :

| Mauvais ordre | Ce qui arrive |
|---|---|
| `hosting` avant `fonctions` / `mcp` | Hosting refuse la réécriture vers un service inexistant |
| `regles` avant Storage activé | Échec du déploiement des règles Storage |
| `fonctions` avant le compte `devis-pdf`, `mcp-clients` ou `espace-reglages` | Toutes les fonctions échouent ensemble : `serviceAccount … does not exist` |
| `fonctions` avant l'étape 11 | `Failed to verify the project has the correct IAM bindings… We failed to modify the IAM policy for the project` |
| `fonctions` sans le rôle Cloud Scheduler | 403 `cloudscheduler.jobs.update` sur `automatisationsCopieHoraire` |
| `fonctions` sans le rôle « Utilisateur du compte de service » | « Missing permissions … iam.serviceAccounts.ActAs » |
| `fonctions` sans `N8N_API_KEY` | Le déploiement s'arrête avant d'avoir rien publié |
| `tout` en croyant publier les fonctions | Rien côté fonctions : `tout` = hosting + règles |

> **Piège : les fonctions orphelines.** Le déploiement `fonctions` s'arrête si une ancienne fonction existe en ligne sans exister dans le code. Sur un projet neuf, cela ne devrait pas arriver ; mais si un message parle de fonctions « à supprimer » (exemple vécu : `journalCopieHoraire`, `journalRafraichir`, `journalRenommer`), supprime-les à la main : console Firebase > Functions (<https://console.firebase.google.com/project/<ID-DU-NOUVEAU-PROJET>/functions>), menu « … » de la ligne > **Supprimer** ; ou console Google Cloud > Cloud Functions (<https://console.cloud.google.com/functions/list?project=<ID-DU-NOUVEAU-PROJET>>), case à cocher > **Supprimer**. Puis relance `fonctions`.

> Si une erreur de déploiement réclame encore un droit : le journal de GitHub donne l'adresse du compte utilisé (vérifie qu'elle porte les 4 rôles) et le droit manquant. Ajoute-le, puis relance le même choix (le workflow est sans danger à relancer).

### Étape 15. Règles Firestore et Storage, index

- [ ] Les règles sont dans `firestore.plateforme.rules` et `storage.plateforme.rules`, publiées par le choix `regles` (ou `tout`) : rien à coller dans la console. Ne modifie jamais les règles à la main dans la console : le prochain déploiement les écraserait.
- [ ] Index Firestore : le dépôt n'a **pas** de fichier d'index pour la plateforme (`firebase.plateforme.json` n'en cite aucun au 26/10/2026). Si un écran affiche une erreur « The query requires an index » avec un lien, clique le lien, **Créer**, attends que l'état passe à « Activé », et signale-le à Claude pour qu'il l'ajoute au dépôt.
- [ ] Réussi : <https://console.firebase.google.com/project/<ID-DU-NOUVEAU-PROJET>/firestore/rules> et `…/storage/rules` affichent les règles du dépôt avec la date du jour.

### Étape 16. CORS du stockage : plus nécessaire (27/10/2026)

Le navigateur ne lit plus le PDF d'un devis (lien signé ouvert ou téléchargé) : rien à régler. Le mode d'emploi reste dans `docs/cors-stockage-pdf.md` pour mémoire.

### Étape 17. Drive et Picker (seulement si les modules Affaires, Projets ou Devis servent)

Tableau « Réglages Google du projet de la plateforme » de `docs/deploiement-client.md` (API Drive et Picker, origine autorisée `<SITE>` ; plus d'API Gmail ni de portée `gmail.compose` depuis le 27/10/2026) et `docs/google-drive.md`. L'écran de consentement OAuth est propre à chaque projet : à refaire pour le nouveau, libellés à vérifier au premier essai. Les clés web Firebase du nouveau projet sont restreintes aux sites web, avec `https://docs.google.com/*` en plus pour le Picker (décision du 20/10/2026, `docs/securite-et-pannes.md`) : à vérifier au premier essai.

---

## Partie E. Le premier client de démonstration

### Étape 18. Créer le client

Tout est dans `docs/nouveau-client.md` (composants à installer, connexion Google `gcloud auth application-default login`, simulation puis `--ecrire`). Rappels :

- [ ] La connexion `gcloud` doit viser le **nouveau** projet : `gcloud auth application-default set-quota-project <ID-DU-NOUVEAU-PROJET>`, et les scripts doivent avoir été adaptés à l'étape 0 (sinon ils écriraient dans `chevalier-ia-app` : **vérifie le projet affiché dans la simulation avant tout `--ecrire`**).
- [ ] Commande type : `node scripts/nouveau-client.js <CLIENT> --nom "Client de démonstration" --membre <adresse-google>:editeur --modules affaires,projets` (simulation d'abord, relis, puis ajoute `--ecrire`). Le script crée `marques/<CLIENT>`, `clients/<CLIENT>` et `clients/<CLIENT>/membres/<adresse>`.
- [ ] Le champ `modules` de `clients/<CLIENT>` est un objet (« map ») : `affaires`, `projets`, `devis`, `automatisations`, `mcp` à `true` selon le besoin. Projets exige Affaires. Sans ce champ le client ne voit que l'accueil provisoire. À la main : console Firebase > Firestore du nouveau projet > document `clients/<CLIENT>` > champ `modules`.
- [ ] Ajouter ou retirer un membre, un module : les commandes `ajouter-membre`, `activer-module`, etc. sont dans `docs/nouveau-client.md`. Les adresses Google se tapent en minuscules.
- [ ] Données de démonstration : le dépôt ne contient pas de `docs/donnees-demo.md` au 26/10/2026 (fichier cité dans la demande, introuvable) : à créer ou à retrouver. En attendant, crée à la main une fiche de test, un catalogue de 2 ou 3 articles et un devis d'essai.
- [ ] Réussi : `node scripts/nouveau-client.js afficher <CLIENT>` montre le client, ses modules et ses membres ; `<SITE>/espace/<CLIENT>` affiche la page de connexion aux couleurs du client.

---

## Partie F. Vérifier : la page Déploiement

Connecte-toi en éditeur à `<SITE>/#/espace/<CLIENT>/reglages/deploiement` (Réglages > Déploiement). Mode d'emploi : `docs/page-deploiement.md`. Vert = en ordre, rouge « À réparer » = manque (la phrase dit quoi faire), orange « Impossible de vérifier » = clique **Revérifier**, gris = étape humaine à cocher « C'est fait ». Les contrôles se lancent à l'ouverture.

### Étape 19. Ce que chaque ligne vérifie

Lignes automatiques de la coque (`ETAPES_COQUE`, `js/os/deploiement.js`) :

| Ligne | Ce que le contrôle fait | Si c'est rouge ou orange |
|---|---|---|
| Les fonctions du serveur répondent (`fonctions-serveur`) | Appelle la fonction `deploiementVerifier` (contrôle serveur `fonctions`) | Orange : la fonction n'est pas publiée (choix `fonctions`) ou pas à jour |
| Personnes autorisées bien enregistrées (`membres`) | Compare `equipe` de `clients/<CLIENT>` et les fiches `membres/<adresse>` : mêmes adresses, mêmes rôles, au moins un éditeur (contrôle serveur `membres`) | Rouge : réparer avec `docs/nouveau-client.md` (`ajouter-membre`, `changer-role`) |
| Règles de la base publiées et à jour | Case à cocher (non vérifiable par l'appli) | Choix `regles` |
| Connexion vérifiée, E-mail de bienvenue, Assistant (MCP) configuré, Appli installée, Raccourci, Rendez-vous, Sauvegarde, Mise en route notée | Cases à cocher | On les fait, puis « C'est fait » |

Lignes de modules (seulement si le module est actif) :

| Module | Lignes automatiques | Lignes à cocher |
|---|---|---|
| Affaires (`js/modules/crm/deploiement.js`) | Dossier Google Drive racine des projets choisi | API Drive et Picker activées, adresse du site autorisée |
| Devis (`js/modules/devis/deploiement.js`) | « Mon entreprise » complète ; catalogue rempli | Catalogue et anciens devis rassemblés, « Préparer l'e-mail » branché, essai de bout en bout, `liste mes devis` vérifié |

Les deux contrôles du serveur (`CONTROLES_SERVEUR` = `fonctions`, `membres`, `pdf-stockage`, `pdf-fonctions`, dans `functions/src/coeur/deploiement.js`) sont les seuls qui passent par le serveur. La page ne vérifie **pas** : les comptes de service et leurs droits, les secrets, les déclencheurs Eventarc, les APIs. C'est pour cela que ce document existe : une page toute verte ne prouve pas que le PDF marche, l'étape 20 le prouve.

---

## Partie G. Essai de bout en bout

### Étape 20. Essayer (avec un espace où le module Devis est actif)

- [ ] **Connexion** : ouvre `<SITE>/espace/<CLIENT>` avec ton compte Google ; tu vois ton espace.
- [ ] **Finaliser un devis** (sur une affaire de test : créer un devis, **Finaliser**). Attention : un devis finalisé a un vrai numéro et ne se supprime plus (il s'archive).
- [ ] **PDF** : au bout de quelques secondes (jusqu'à une minute à froid), le PDF est prêt (onglet « Devis » de l'affaire). Console Firestore : `clients/<CLIENT>/devis_devis/<id>` > champ `pdf.statut` passe par « en cours » puis « ok ».
- [ ] **Lien de lecture** : ouvre le PDF depuis le menu « … » du devis (lien valable 5 minutes). Un lecteur de l'espace doit pouvoir l'ouvrir ; un devis d'un autre client reste inaccessible (« Action non autorisée. »).
- [ ] **Télécharger** : menu « … » du devis > « Télécharger le PDF » enregistre le PDF sur l'appareil (fonctions déployées après la PR « télécharger » du 27/10/2026).
- [ ] **MCP** : ajoute `<SITE>/mcp/<CLIENT>` dans Claude comme connecteur personnalisé, connecte-toi, demande `qui_suis_je`, puis « liste mes devis ». Le module `mcp` doit être allumé pour ce client (`activer-module <CLIENT> mcp --ecrire`). Non essayé en réel avec le vrai claude.ai au 26/10/2026.
- [ ] **Mon espace** : Réglages > Mon espace : change le nom, enregistre, le menu change (fonction `espaceReglages`).
- [ ] **Automatisations** (si activées) : l'écran se remplit après la copie horaire ou **Rafraîchir**.
- [ ] **Page Déploiement** : toutes les lignes vertes ou cochées.
- [ ] Cas vide : un espace sans module Devis ne fabrique aucun PDF ; un devis brouillon n'a que le PDF filigrané. Cas d'erreur : voir le tableau suivant.

---

## Symptôme, cause, remède

| Symptôme | Cause probable | Remède |
|---|---|---|
| « PDF non rangé » / « Stockage : le PDF n'a pas pu être enregistré. » (`pdf.statut = echec`) | Fonctions du PDF absentes, ou le compte `devis-pdf` n'a pas son droit de stockage (ou sa condition sur `clients/` est mal écrite) | Étape 10 ; choix `fonctions` ; journal : Cloud Functions > `devisPdf` / `devisPdfAuto` > Journaux |
| `pdf.statut` ne passe jamais à « en cours » | Le déclencheur n'arrive pas à la fonction : rôles Eventarc / Cloud Run manquants (étapes 10 et 11) | Ajouter `roles/eventarc.eventReceiver` et `roles/run.invoker`; voir aussi <https://console.cloud.google.com/eventarc/triggers?project=<ID-DU-NOUVEAU-PROJET>> (déclencheur de `devisPdfAuto`, région `europe-west9`) |
| « Stockage : le lien du PDF n'a pas pu être créé. » | API **IAM Service Account Credentials** non activée, ou « Créateur de jetons du compte de service » manquant à `devis-pdf` sur lui-même | Étapes 2 et 10 |
| 403 `cloudscheduler.jobs.update` au déploiement | `deploiement-github` sans « Administrateur Cloud Scheduler » | Étape 7 puis relancer `fonctions` |
| « Missing permissions … iam.serviceAccounts.ActAs » | `deploiement-github` sans « Utilisateur du compte de service » | Étape 7 |
| « serviceAccount … does not exist » | Un compte attendu par le code n'existe pas dans le projet (ou nom mal écrit) | Étapes 8 à 10 ; ou l'étape 0 n'a pas mis le bon projet dans les adresses |
| « Failed to verify the project has the correct IAM bindings… We failed to modify the IAM policy for the project » | Premier déclencheur Firestore dans ce projet, droits de l'étape 11 absents | Étape 11, puis relancer `fonctions` |
| Le déploiement `fonctions` s'arrête alors que le code est bon, en parlant de fonctions à supprimer | Fonction orpheline (en ligne, absente du code) | Encadré de l'étape 14 |
| « Permission denied while using the Eventarc Service Agent… may take a few minutes… propagated » | Premier usage des fonctions 2e génération dans le projet, permissions pas encore propagées | Attendre 5 minutes et relancer `fonctions` (aucun rôle ajouté en 2026) ; si ça persiste : rôle « Agent de service Eventarc » de `service-<NUMERO-DU-PROJET>@gcp-sa-eventarc.iam.gserviceaccount.com` |
| Le déploiement `fonctions` s'arrête avant de publier, parlant d'un secret | `N8N_API_KEY` absent de Secret Manager | Étape 12 |
| « Le secret … n'existe pas encore » | Secret GitHub absent ou nom mal écrit | Étape 13 |
| Hosting refuse une réécriture | Fonctions pas encore publiées | Lancer `fonctions` (ou `mcp`) avant `hosting` |
| « API … has not been used in project … or it is disabled » | API non activée | Étape 2 (le lien est dans le message) |
| Espace « indisponible » | Espace désactivé, ou adresse absente des membres (minuscules) | `docs/nouveau-client.md`, « Erreurs fréquentes » |
| « Action non autorisée. » alors que tu es éditeur | Fiche `membres/<adresse>` sans le rôle `editeur`, ou espace désactivé | Console Firestore, ou `changer-role` |
| La connexion Google revient à la page de connexion sur téléphone | Domaine d'authentification `.firebaseapp.com` au lieu de `.web.app`, ou redirection non autorisée | Étape 5 |
| Page Déploiement : deux lignes orange | `deploiementVerifier` non publiée | Choix `fonctions` |
| `PERMISSION_DENIED` dans le journal d'une fonction | Rôle manquant au compte de cette fonction | Étape 6 : comparer le tableau au compte de la fonction (Cloud Run > service > Sécurité) |
| « Préparer l'e-mail » grisé, « pas encore branchée » | La porte des workflows n'existe pas pour cet espace (voir `.github/A-FAIRE.md`) | Normal tant que ce chantier n'est pas fait |
| Le MCP du client ne répond pas | Module `mcp` éteint, ou fonction `mcpclients` absente | `activer-module <CLIENT> mcp`, choix `mcp` ; interrupteurs d'urgence : `docs/securite-et-pannes.md` |

## Retour arrière et arrêt

- Le site : console Firebase > **Hosting > Historique des versions > Restaurer**.
- Une fonction en panne : la republier avec le choix `mcp`, `espace` ou `fonctions` depuis un code corrigé ; l'arrêt d'urgence est dans `docs/securite-et-pannes.md`.
- Un client qui part : `desactiver-client` (`docs/nouveau-client.md`).
- Ne supprime jamais le projet Google « pour recommencer » sans une sauvegarde (`node scripts/donnees-client.js exporter <CLIENT> --avec-images`).

## Ce qui n'a pas été vérifié

- Tout le parcours sur un vrai deuxième projet (ce document est une première version).
- L'étape 0 : la liste des endroits en dur vient d'une recherche dans le dépôt, pas d'un essai.
- Les libellés exacts de la console Google marqués « à vérifier au premier essai ».
- Les droits du compte de calcul par défaut sur le secret `N8N_API_KEY` (Firebase les donne d'habitude au déploiement).
- Le vrai Chromium dans la fonction du PDF sur le nouveau projet (mémoire 2 GiB, démarrage à froid, coût).

## Pour aller plus loin

`docs/deploiement-plateforme.md` (serveur 1, compte de déploiement) · `docs/deploiement-client.md` (checklist par client) · `docs/pdf-clients.md` · `docs/mon-espace.md` · `docs/mcp-clients.md` · `docs/cors-stockage-pdf.md` · `docs/automatisations-n8n.md` · `docs/page-deploiement.md` · `docs/nouveau-client.md`.
