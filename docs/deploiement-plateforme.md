# Déployer la plateforme clients (projet `chevalier-ia-app`)

> **Un deuxième serveur de plateforme** (nouveau projet Google) : liste complète dans l'ordre dans [deploiement-nouveau-serveur-plateforme.md](deploiement-nouveau-serveur-plateforme.md).

Chantier 12 de `etude-reutilisation-coque.md`. Deux projets Firebase, deux déploiements, **le même code et la même version**.

| | CRM de Jérôme | Plateforme clients |
|---|---|---|
| Projet Firebase | `chevalier-ia-os` | `chevalier-ia-app` |
| Adresse | `chevalier-ia-os.web.app` | `chevalier-ia-app.web.app/espace/<client>` |
| Workflow GitHub | `firebase-hosting.yml` : **automatique** à chaque fusion dans `main` (fonctions MCP, puis Hosting) | `deploiement-plateforme.yml` : **à la main seulement** |
| Ce qui est publié | la racine du dépôt, telle quelle | le dossier `dist/plateforme/`, construit par `scripts/preparer-hebergement.js` |
| Configuration Firebase | `js/os/firebase-config.js` (inchangé) | `scripts/projets/plateforme.json`, copiée dans le paquet à la place de `firebase-config.js` |
| Règles | `firestore.rules` (publiées par le workflow manuel « Publier les règles (CRM de Jérôme) », jamais sans PR fusionnée et « Tests » vert) | `firestore.plateforme.rules` et `storage.plateforme.rules` (publiées par le workflow si on le demande) |
| Fonctions (serveur MCP) | oui | **oui**, par le choix `fonctions` (ou `tout`) du workflow, lancé par Jérôme (premier déploiement réussi le 26/10/2026, PR 324 : PDF des devis) |

## Comment ça marche (en bref)

1. **Un fichier de configuration par projet, choisi à la construction du paquet** (et non une détection de l'adresse dans le navigateur). C'est le plus simple à tester : on lit les fichiers, on voit exactement ce qui sera publié, et une page ne peut pas « se tromper de projet » parce qu'elle est ouverte sur une autre adresse.
2. `node scripts/preparer-hebergement.js plateforme` copie le site (`index.html`, `css`, `js`, `assets`, `espace`, `version.json`, …) dans `dist/plateforme/` et remplace seulement `js/os/firebase-config.js` par un fichier généré. Ce fichier contient la configuration web de `chevalier-ia-app` et une liste de comptes **vide** : la plateforme ne contient ni les adresses de Jérôme, ni sa connexion. L'accès d'un client vient de sa fiche `clients/<client>/membres/<e-mail>` (chantier 3).
3. **Une seule source de version** : `version.json` et `js/os/version.js` sont copiés tels quels dans les deux déploiements. On augmente le numéro une fois (comme avant) et les deux déploiements le reprennent. Rien n'est écrit en dur dans le workflow.
4. Les valeurs de `scripts/projets/plateforme.json` sont **publiques par nature** (elles apparaissent dans n'importe quelle page Firebase). Ce n'est pas un secret. La sécurité vient des règles. Un test refuse tout fichier qui ressemble à une clé de compte de service.

## Ce que fait le workflow « Déploiement plateforme clients »

Déclenché par le bouton **Run workflow** seulement. Il demande quoi publier :

- `hosting` (choix par défaut) : la page seulement. Aucune règle n'est touchée.
- `regles` : les règles Firestore **et** Storage de la plateforme.
- `tout` : les deux.

Avant de publier, il relance sans réseau les contrôles `tests/plateforme-deploiement.test.js` (le CRM garde sa configuration, la plateforme prend la sienne, aucun secret), puis construit le paquet, puis vérifie que le secret existe.

## Ce que Jérôme doit faire lui-même (une seule fois)

### 1. Créer le compte de service de déploiement (Google Cloud)

Le workflow a besoin d'un « badge » pour avoir le droit de publier sur `chevalier-ia-app`. Ce badge est un fichier secret : **il ne se colle jamais dans une conversation ni dans le dépôt**, seulement dans GitHub.

1. Ouvrir <https://console.cloud.google.com/iam-admin/serviceaccounts?project=chevalier-ia-app> (en haut, vérifier que le projet est bien `chevalier-ia-app`).
2. Cliquer **Créer un compte de service**.
3. Nom : `deploiement-github`. Cliquer **Créer et continuer**.
4. Dans « Sélectionner un rôle », ajouter les rôles suivants (bouton **Ajouter un autre rôle** pour chacun) : **Administrateur Firebase** (en anglais : *Firebase Admin*), **Consommateur Service Usage** (*Service Usage Consumer*) et, pour publier des fonctions (choix `fonctions`, ex. le MCP des clients), **Utilisateur du compte de service** (*Service Account User*). Pour les fonctions programmées (ex. `automatisationsCopieHoraire`), ajouter aussi **Administrateur Cloud Scheduler** (*Cloud Scheduler Admin*) : sans lui le déploiement échoue avec une erreur 403 (constatée le 26/10/2026). Sans le rôle « Utilisateur du compte de service », le choix `fonctions` échoue avec « Missing permissions … iam.serviceAccounts.ActAs ». Pour l'ajouter après coup : <https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-app>, crayon à droite de `deploiement-github@…`, **Ajouter un autre rôle**, **Utilisateur du compte de service**, **Enregistrer**. Cliquer **Continuer**, puis **OK**.
5. Dans la liste, cliquer sur l'adresse du compte `deploiement-github@chevalier-ia-app.iam.gserviceaccount.com`, onglet **Clés**, bouton **Ajouter une clé**, **Créer une clé**, choisir **JSON**, **Créer**. Un fichier `.json` se télécharge sur le Mac.
   - Si Google refuse (« la création de clés est désactivée par une règle »), dis-le : on prendra une autre voie, ne contourne rien toi-même.

### 2. Mettre ce fichier dans GitHub (secret)

1. Ouvrir <https://github.com/jeromechevalier-wq/chevalier-ia-os/settings/secrets/actions>.
2. Cliquer **New repository secret**.
3. **Name** : `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_APP` (exactement, en majuscules).
4. **Secret** : ouvrir le fichier `.json` téléchargé avec TextEdit, tout sélectionner (⌘A), copier (⌘C), coller dans la case. Cliquer **Add secret**.
5. **Supprimer le fichier `.json` du Mac** (Téléchargements, puis vider la corbeille). GitHub garde la seule copie utile.

### 3. Activer Storage (pour les images des clients)

1. Ouvrir <https://console.firebase.google.com/project/chevalier-ia-app/storage>.
2. Cliquer **Commencer** (ou *Get started*). Choisir **Démarrer en mode production**. Emplacement : **europe-west9** (le même que la base ; on ne pourra plus le changer). Cliquer **OK**.
3. Tant que Storage n'est pas activé, ne choisis pas `regles` ni `tout` : le déploiement des règles Storage échouerait.

### 3 bis. CORS du stockage des PDF : plus nécessaire (27/10/2026)

Le navigateur ne lit plus le PDF d'un devis (lien signé ouvert ou téléchargé), donc ce réglage n'est plus demandé pour le module Devis. Le mode d'emploi reste dans [cors-stockage-pdf.md](cors-stockage-pdf.md) pour mémoire.

### 4. Le premier déploiement (après la fusion de la PR)

Le bouton n'apparaît dans GitHub qu'une fois le workflow fusionné dans `main`.

1. Ouvrir <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml>.
2. Cliquer **Run workflow**, laisser la branche `main`, laisser **hosting**, cliquer le bouton vert **Run workflow**.
3. Quand c'est vert, ouvrir `https://chevalier-ia-app.web.app/espace/<client>` : sans fiche de marque, tu dois voir la page neutre « Espace indisponible » (c'est normal).
4. Plus tard, quand tu es prêt à créer un premier client : relancer avec **regles**, puis créer la fiche de marque, la fiche du client et la fiche de membre avec l'outil « nouveau client » : pas à pas dans `docs/nouveau-client.md`.

## Si quelque chose ne va pas

- *« Le secret n'existe pas encore »* : étape 2 pas faite, ou nom du secret mal écrit.
- *Erreur de droits (403) dans le journal* : le journal affiche l'adresse du compte utilisé ; vérifier qu'elle porte bien les deux rôles de l'étape 1.
- *Le déploiement `fonctions` échoue alors que le code est bon* : d'anciennes fonctions (`journalCopieHoraire`, `journalRafraichir`, `journalRenommer`) existent encore chez le client sans exister dans le code. Les supprimer à la main dans la console Google Cloud (Cloud Functions du projet), puis relancer (fait par Jérôme le 26/10/2026).
- *Retour arrière* : relancer le workflow depuis un ancien commit n'est pas prévu ; dans la console Firebase, **Hosting > Historique des versions > Restaurer** remet la version précédente de la page.
- *Connexion Google sur téléphone* : essai réel du 2026-10-11 : avec `chevalier-ia-app.firebaseapp.com` la connexion par redirection revenait sur la page de connexion sans erreur (adresse différente de la page, bloquée par le navigateur du téléphone). Le domaine d'authentification est donc `chevalier-ia-app.web.app` (`scripts/projets/plateforme.json`), avec `https://chevalier-ia-app.web.app/__/auth/handler` ajouté aux URI de redirection autorisées du client OAuth dans Google Cloud.

## Limites connues (non traitées ici)

- Le paquet de la plateforme contient encore le **code** du CRM et de Projets (modules, portraits dans `assets/`) : ils sont inertes (aucun compte n'est autorisé à y entrer), mais restent visibles dans les fichiers servis. Les retirer relève des chantiers 6 à 8.
- Les adresses de Jérôme restent dans le code du module CRM (`composants.js`), dans `firestore.rules`, dans le serveur MCP et dans `functions/src/oauth/config.js` : ils ne servent pas la plateforme (règles à part, fonctions propres aux clients dans `functions-plateforme/`) et sont traités par les chantiers 6, 9 et 11.
- Les tests vérifient les fichiers, pas l'exécution réelle chez GitHub et Google : le workflow a été lancé pour de vrai, `fonctions` compris, le 26/10/2026 (voir `pdf-clients.md`).

## Activer des modules pour un client (chantier 7)

Les écrans d'un client dépendent du document `clients/<client>` (champ `modules`). Il se crée à la main dans la console Firebase (Firestore Database du projet `chevalier-ia-app`) : document `clients/<client>`, champ `modules` de type « map », avec `affaires` et/ou `projets` à `true`. Projets exige Affaires. Sans ce champ, le client voit seulement l'accueil provisoire. Les règles qui permettent aux membres de LIRE ce document sont publiées avec le choix `regles` ou `tout` du workflow.

## Ce que le client voit (chantier 6)

La fiche `marques/<client>` ne change pas : `actif`, `nom`, `couleur`, `logo`, `images`, `accueil`. Aucun champ nouveau.
- `couleur` sert aussi d'**accent de toute l'interface** (boutons, menu actif, liens). Choisis une couleur franche : si elle est trop pâle ou trop foncée pour être lue, elle est éclaircie ou assombrie automatiquement (contraste vérifié), ce qui peut la rendre un peu différente de celle du client dans l'un des deux thèmes.
- `nom` = titre de l'onglet, menu et nom de l'appli installée. `logo` = image du menu et icône de page (en https ; à défaut, une pastille à la couleur du client avec son initiale). Pour une icône d'appli installée nette sur téléphone, un logo carré d'au moins 512 px convient le mieux (non essayé sur téléphone).
