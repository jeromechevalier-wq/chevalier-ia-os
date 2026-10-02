# Prototype Drive : guide pas à pas (étape 1 du plan)

Référence : `plan-mcp.md`, section 5.8. Durée : environ 30 minutes, plus un contrôle 8 jours plus tard.

## À quoi ça sert

Avant de construire le serveur MCP et le téléversement depuis le téléphone, on vérifie sur ton vrai Drive cinq choses dont le plan dépend :

| Test | Question | Pourquoi c'est important |
|---|---|---|
| **A** | Peut-on obtenir une autorisation Drive limitée aux fichiers de l'appli (`drive.file`), sans échéance ? | C'est la base de tout : le serveur s'en sert pour fabriquer des clés d'une heure |
| **B** | Le serveur peut-il créer un dossier et un fichier privés dans ton Drive ? | Dossiers `Jerome IA OS Attachments` et `Jerome IA OS Backups` |
| **C** | Une clé obtenue plus tard retrouve-t-elle les mêmes fichiers (même application) ? | Les fichiers créés par le serveur et par le téléphone doivent se voir des deux côtés |
| **D** | La session de téléversement par morceaux accepte-t-elle des morceaux **sans** en-tête d'autorisation ? | Détermine comment les agents (Hermes) enverront de gros fichiers |
| **E** | Un navigateur peut-il envoyer 50 Mo directement à Drive ? | C'est ce que fera l'iPhone pour les gros fichiers (audio d'interview) |
| **F** | L'écran de consentement est-il « En production » ? | En mode « Test », Google fait expirer l'autorisation au bout de 7 jours |

Tout se passe dans un dossier de test, **`ZZ prototype Chevalier IA OS`**, que le script crée lui-même. Aucune donnée du CRM, aucun fichier existant de ton Drive n'est touché (l'autorisation `drive.file` ne permet de toute façon de voir que les fichiers créés par cette application).

## Ce que je n'ai pas pu vérifier

Les scripts ont été **testés contre un faux serveur Google** (mon environnement n'a pas accès à Google) : leur logique est validée, pas leur comportement avec le vrai Google. C'est précisément le but de ce prototype. De même, les noms exacts des menus de la console Google ci-dessous viennent de ma connaissance et pas de la documentation officielle (le proxy de ma session la bloque) : s'ils ont un peu changé, cherche le mot en gras ou dis-moi ce que tu vois.

## Deux façons de faire

- **Option A, tout sur ton Mac** : suis les étapes 0 à 10 ci-dessous.
- **Option B, Claude lance les tests depuis une session cloud** (choisie le 02/10/2026) : tu fais **seulement les étapes 1, 2 et 3** (la console Google ne peut pas être pilotée par Claude), puis la section « Option B » plus bas. Claude fait l'autorisation (par copier-coller) et les tests A à E, y compris les 50 Mo dans un vrai navigateur sans écran. Le test F (8 jours) se fait ensuite sur ton Mac.

## Étape 0 : récupérer les scripts sur ton Mac

Prérequis : Node.js 20 ou plus. Cette commande affiche la version installée (tu dois voir `v20` ou plus) :

```sh
node --version
```

Dans le dossier du dépôt `chevalier-ia-os`, cette commande télécharge les nouveautés de GitHub :

```sh
git fetch origin
```

Celle-ci se place sur la branche du chantier :

```sh
git checkout mcp
```

Celle-ci met la branche à jour :

```sh
git pull
```

## Étape 1 : activer l'API Google Drive (console Google)

1. Ouvre https://console.cloud.google.com/apis/library/drive.googleapis.com?project=chevalier-ia-os (connecté avec `jerome.chevalier@gmail.com`).
2. Vérifie que le projet affiché en haut est bien **chevalier-ia-os**.
3. Clique sur **Activer**. (Si le bouton affiche « Gérer », c'est déjà fait.)

Une API « activée » ne coûte rien tant qu'on ne s'en sert pas.

## Étape 2 : écran de consentement « En production » (console Google)

C'est l'écran que Google montre quand une appli demande un accès. **Il est déjà utilisé par la connexion Google de ton appli** : la changer ne modifie pas qui peut entrer dans Chevalier IA OS (les règles Firestore restent la seule porte).

1. Ouvre https://console.cloud.google.com/auth/overview?project=chevalier-ia-os (rubrique **Google Auth Platform**).
2. Menu de gauche, **Audience** (ou « Public cible ») : relève le **Type d'utilisateur** (attendu : *Externe*) et l'**État de la publication**.
3. Si l'état est **Test** (ou « Testing ») : clique sur **Publier l'application**, puis confirme. L'état devient **En production**.
4. Menu de gauche, **Accès aux données** (ou « Data access ») : clique sur **Ajouter ou supprimer des niveaux d'accès**, cherche `drive.file` (« Voir et gérer uniquement les fichiers et dossiers Google Drive que vous avez ouverts ou créés avec cette application »), coche-la, puis **Enregistrer**.
5. Note ce que Google indique pour cet accès : ligne « non sensible » ou « sensible ». S'il est « sensible », Google peut demander une validation de l'appli ; prends une capture d'écran et envoie-la-moi avant d'aller plus loin.

## Étape 3 : créer l'identifiant du serveur (console Google)

1. Ouvre https://console.cloud.google.com/auth/clients?project=chevalier-ia-os.
2. Clique sur **Créer un client**.
3. **Type d'application** : *Application Web*.
4. **Nom** : `Chevalier IA OS - Drive serveur`.
5. Dans **URI de redirection autorisés**, clique sur **Ajouter un URI** et saisis exactement `http://localhost:8085/` (avec la barre oblique à la fin). Laisse « Origines JavaScript autorisées » vide.
6. Clique sur **Créer**.
7. Dans la fenêtre qui s'affiche, clique sur **Télécharger au format JSON** (ou l'icône de téléchargement). Le fichier `client_secret_….json` arrive dans tes Téléchargements.

Ne touche pas à l'identifiant existant « Web client (auto created by Google Service) » : c'est celui de la connexion Google de l'appli.

**Ce fichier contient un secret.** Ne le mets jamais dans le dossier du projet (il est synchronisé avec Google Drive), ne le colle pas dans une conversation, ne le commite pas.

## Étape 4 : ranger le fichier hors du projet (Terminal)

Cette commande crée un dossier privé, lisible par toi seul, hors de Google Drive :

```sh
mkdir -p ~/.config/chevalier-ia-os && chmod 700 ~/.config/chevalier-ia-os
```

Celle-ci y déplace le fichier téléchargé en le renommant (si tu as plusieurs fichiers `client_secret_*`, remplace l'étoile par le nom exact du bon) :

```sh
mv ~/Downloads/client_secret_*.json ~/.config/chevalier-ia-os/oauth-client.json
```

Celle-ci le rend illisible pour les autres comptes de ton Mac :

```sh
chmod 600 ~/.config/chevalier-ia-os/oauth-client.json
```

## Étape 5 : donner l'autorisation une fois (Terminal)

Cette commande ouvre Google dans ton navigateur, reçoit la réponse sur ton Mac et enregistre l'autorisation (jamais affichée) dans le dossier privé :

```sh
node outils/autoriser-drive.js
```

1. Choisis `jerome.chevalier@gmail.com`.
2. Si Google affiche « Google n'a pas validé cette application », clique sur **Avancé**, puis **Accéder à Chevalier IA OS (non sécurisé)** : c'est ton application, tu en es l'auteur.
3. Autorise l'accès aux fichiers créés par l'application.
4. Au terminal, tu dois lire : `✓ Jeton de rafraîchissement enregistré`, `Portée accordée : …/auth/drive.file` et `Aucune échéance annoncée…`.

Si tu lis `⚠ … expire dans 7 jours`, l'application est encore en mode Test : retourne à l'étape 2, publie, puis **retire l'accès** sur https://myaccount.google.com/permissions (ligne « Chevalier IA OS - Drive serveur ») et relance cette étape.

## Étape 6 : tests A à D (Terminal)

Cette commande crée le dossier de test, y envoie quelques fichiers et vérifie ce qui précède :

```sh
node outils/prototype-drive.js
```

Elle affiche une ligne par test (✓ réussi, ✗ échec, ℹ à vérifier à la main) puis un tableau **à copier-coller dans la conversation**.

## Étape 7 : test E, 50 Mo depuis le navigateur (Terminal)

Cette commande démarre une page locale (visible de ton Mac seulement) qui envoie 50 Mo directement à Drive, comme le fera l'appli :

```sh
node outils/prototype-drive.js --navigateur
```

La page s'ouvre seule (sinon copie l'adresse affichée). Clique sur **Envoyer 50 Mo de test**, attends « Terminé », puis regarde le terminal. Tu peux aussi tester avec un vrai fichier (une note vocale, par exemple) avec le sélecteur de fichier de la page.

## Étape 8 : regarder dans ton Drive

Ouvre https://drive.google.com : le dossier **ZZ prototype Chevalier IA OS** doit contenir les fichiers de test. Clic droit sur le dossier, **Partager** : l'accès doit être **limité** (toi seul).

## Étape 9 : nettoyer (Terminal)

Cette commande met à la **corbeille** du Drive (récupérable 30 jours, rien n'est détruit d'un coup) le dossier et les fichiers créés par le prototype :

```sh
node outils/prototype-drive.js --nettoyer
```

Ton autorisation (le jeton de rafraîchissement) est conservée pour la suite.

## Étape 10 : contrôle à 8 jours (test F)

Dans 8 jours, relance l'étape 6 : si A1 et A3 sont encore ✓, l'autorisation n'a pas expiré, donc l'écran de consentement est bien en production. Puis refais l'étape 9. (Pendant ce temps, on peut continuer le chantier : la suite ne dépend pas de ce délai, seule la clôture en dépend.)

## Option B : Claude lance les tests depuis une session cloud

À faire par toi, après les étapes 1, 2 et 3 :

1. **Ranger l'identifiant dans l'environnement cloud**, jamais dans le chat : dans l'application Claude, ouvre le menu de l'environnement cloud (dans la barre de titre de la session), clique sur **Modifier**, puis ajoute une **variable d'environnement** nommée exactement `CHEVALIER_OAUTH_CLIENT_JSON` dont la valeur est **tout le contenu** du fichier `client_secret_….json` téléchargé à l'étape 3 (il tient sur une ligne : ouvre le fichier avec un éditeur de texte, sélectionne tout, copie, colle). Si une rubrique « Identifiants API » est proposée, utilise-la ; sinon la variable suffit. Cette valeur est lisible par les personnes qui peuvent modifier cet environnement : tu la supprimeras à la fin du prototype (et tu pourras supprimer l'identifiant dans la console).
2. **Ouvrir une nouvelle session** sur le dépôt `chevalier-ia-os` (une session déjà ouverte ne voit pas la nouvelle variable) et lui dire, par exemple : « Reprends le prototype Drive (docs/prototype-drive.md, option B). Branche `mcp`. L'identifiant OAuth est dans CHEVALIER_OAUTH_CLIENT_JSON. »

Ce que fait ensuite Claude :

1. Il lance `NODE_USE_ENV_PROXY=1 node outils/autoriser-drive.js --manuel` et te donne une adresse Google.
2. **Toi** : tu l'ouvres dans ton navigateur (connecté à `jerome.chevalier@gmail.com`), tu autorises ; Google te renvoie vers `http://localhost:8085/?state=…&code=…` et le navigateur affiche une erreur « connexion impossible » : **c'est normal**. Tu copies l'adresse complète de la barre d'adresse et tu la colles dans le chat (elle contient un code à usage unique, de quelques minutes, qui ne vaut rien sans le secret de l'identifiant).
3. Claude lance `--terminer "<adresse>"`, puis `node outils/prototype-drive.js` (tests A à D) et le test E avec `outils/prototype-drive-pilote-cloud.mjs`, puis `--nettoyer`.
4. Il te donne le tableau des résultats et propose la suite du plan.

Particularités de la session cloud : Node n'y passe par le proxy qu'avec `NODE_USE_ENV_PROXY=1` ; le jeton de rafraîchissement n'y survit pas à la fin de la session (il est rangé dans le conteneur, jamais affiché) ; le navigateur sans écran ne fait confiance qu'à la clé de l'autorité du proxy de la session (jamais de désactivation générale de la vérification TLS).

**Test F (8 jours)** : une fois le prototype terminé, tu fais l'étape 4 (ranger le fichier) et l'étape 5 (autorisation) **une fois sur ton Mac**, comme il le faudra de toute façon pour le vrai serveur ; dans 8 jours, tu relances l'étape 6 et tu me donnes le résultat de A1 et A3.

## Critères de réussite et replis

| Résultat | Conséquence |
|---|---|
| A, B, C, E et F : OUI ; D connu | Le plan continue tel quel (étape 2 : squelette des fonctions) |
| **D = NON** (les morceaux exigent l'autorisation) | Normal possible. Les agents enverront jusqu'à ~20 Mo par la fonction ; au-delà, ils déposent le fichier dans Drive autrement et le joignent **par lien** |
| **E1 = NON** (en-tête `Location` illisible depuis le navigateur) | La fonction ouvrira la session de téléversement et donnera l'adresse à la page (le plan s'adapte) |
| **E2 = NON** pour une autre raison (blocage CORS) | Le téléphone enverra par la fonction (petits fichiers) ou par lien ; je te présente les options |
| **C = NON** (le second jeton ne retrouve pas le fichier) | On abandonne l'accès partagé : les pièces jointes passent **par lien seulement** |
| **A2 = NON** (portée plus large que `drive.file`) ou **F = NON** | On s'arrête et on corrige l'écran de consentement avant d'aller plus loin |

## Ce que font (et ne font pas) les scripts

- Ils ne parlent qu'à Google (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`) et à ton propre Mac (`localhost`).
- Ils n'affichent **jamais** un jeton ni le secret de l'identifiant ; l'autorisation est écrite dans `~/.config/chevalier-ia-os/` (droits 600), hors du dépôt et hors de Google Drive.
- Ils ne publient rien, ne touchent ni à Firebase, ni à la base, ni au site. Le dossier `outils/` est exclu de la publication (`firebase.json`).
- Aucun fichier n'est supprimé définitivement : le nettoyage met à la corbeille.

## Retour arrière complet

1. Terminal : `node outils/prototype-drive.js --nettoyer`.
2. https://myaccount.google.com/permissions : retirer l'accès « Chevalier IA OS - Drive serveur ».
3. Console Google, https://console.cloud.google.com/auth/clients?project=chevalier-ia-os : supprimer l'identifiant `Chevalier IA OS - Drive serveur`.
4. Terminal : `rm -r ~/.config/chevalier-ia-os` (supprime l'identifiant et le jeton enregistrés).

L'écran de consentement « En production » peut rester tel quel.
