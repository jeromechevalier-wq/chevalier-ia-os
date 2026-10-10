# Déployer la plateforme clients (projet `chevalier-ia-app`)

Chantier 12 de `etude-reutilisation-coque.md`. Deux projets Firebase, deux déploiements, **le même code et la même version**.

| | CRM de Jérôme | Plateforme clients |
|---|---|---|
| Projet Firebase | `chevalier-ia-os` | `chevalier-ia-app` |
| Adresse | `chevalier-ia-os.web.app` | `chevalier-ia-app.web.app/espace/<client>` |
| Workflow GitHub | `firebase-hosting.yml` : **automatique** à chaque fusion dans `main` (fonctions MCP, puis Hosting) | `deploiement-plateforme.yml` : **à la main seulement** |
| Ce qui est publié | la racine du dépôt, telle quelle | le dossier `dist/plateforme/`, construit par `scripts/preparer-hebergement.js` |
| Configuration Firebase | `js/os/firebase-config.js` (inchangé) | `scripts/projets/plateforme.json`, copiée dans le paquet à la place de `firebase-config.js` |
| Règles | `firestore.rules` (publiées à la main dans la console) | `firestore.plateforme.rules` et `storage.plateforme.rules` (publiées par le workflow si on le demande) |
| Fonctions (serveur MCP) | oui | **non**, jamais |

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
4. Dans « Sélectionner un rôle », ajouter deux rôles (bouton **Ajouter un autre rôle** pour le second) : **Administrateur Firebase** (en anglais : *Firebase Admin*) et **Consommateur Service Usage** (*Service Usage Consumer*). Cliquer **Continuer**, puis **OK**.
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

### 4. Le premier déploiement (après la fusion de la PR)

Le bouton n'apparaît dans GitHub qu'une fois le workflow fusionné dans `main`.

1. Ouvrir <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml>.
2. Cliquer **Run workflow**, laisser la branche `main`, laisser **hosting**, cliquer le bouton vert **Run workflow**.
3. Quand c'est vert, ouvrir `https://chevalier-ia-app.web.app/espace/<client>` : sans fiche de marque, tu dois voir la page neutre « Espace indisponible » (c'est normal).
4. Plus tard, quand tu es prêt à créer un premier client : relancer avec **regles**, puis créer la fiche de marque et la fiche de membre (chantiers 5 et 13).

## Si quelque chose ne va pas

- *« Le secret n'existe pas encore »* : étape 2 pas faite, ou nom du secret mal écrit.
- *Erreur de droits (403) dans le journal* : le journal affiche l'adresse du compte utilisé ; vérifier qu'elle porte bien les deux rôles de l'étape 1.
- *Retour arrière* : relancer le workflow depuis un ancien commit n'est pas prévu ; dans la console Firebase, **Hosting > Historique des versions > Restaurer** remet la version précédente de la page.
- *Connexion Google sur téléphone* : essai réel du 2026-10-11 : avec `chevalier-ia-app.firebaseapp.com` la connexion par redirection revenait sur la page de connexion sans erreur (adresse différente de la page, bloquée par le navigateur du téléphone). Le domaine d'authentification est donc `chevalier-ia-app.web.app` (`scripts/projets/plateforme.json`), avec `https://chevalier-ia-app.web.app/__/auth/handler` ajouté aux URI de redirection autorisées du client OAuth dans Google Cloud.

## Limites connues (non traitées ici)

- Le paquet de la plateforme contient encore le **code** du CRM et de Projets (modules, portraits dans `assets/`) : ils sont inertes (aucun compte n'est autorisé à y entrer), mais restent visibles dans les fichiers servis. Les retirer relève des chantiers 6 à 8.
- Les adresses de Jérôme restent dans le code du module CRM (`composants.js`), dans `firestore.rules`, dans le serveur MCP et dans `functions/src/oauth/config.js` : ils ne servent pas la plateforme (pas de fonctions, pas de `/mcp`, règles à part) et sont traités par les chantiers 6, 9 et 11.
- Le workflow n'a **jamais été lancé** (consigne du chantier : rien déployer). Les tests vérifient les fichiers, pas l'exécution réelle chez GitHub et Google.
