# Liens et documents, Google Drive (version 2.6.3, 16/10/2026)

Chantier « Liens et documents » des décisions du 16/10/2026. **Rien n'est déployé.** Les règles Firestore ne sont **pas** modifiées. Aucune donnée existante n'est modifiée ni migrée.

## Ce que Jérôme verra

- **Fiche projet, section « Liens et documents »** (elle s'appelait « Documents ») : le formulaire reste (Libellé, « Lien web », **Ajouter**) et accepte n'importe quel lien. Un second bouton **« Ajouter un document »** ouvre la fenêtre **standard de Google** (Google Picker) avec deux onglets : **Mon Drive** (parcourir) et **Importer** (un fichier de l'ordinateur, envoyé dans le dossier de travail Drive du projet). Le lien du document entre dans la liste.
- **Fiche projet, « Détails » : « Dossier de travail »** : n'importe quel lien (Drive, serveur, NAS en `smb://`, site…). Le champ « Adresse GitHub », le bouton « Créer le GitHub » et le prompt à copier pour Claude Code **n'existent plus**. Une ancienne adresse GitHub **reste dans la base** et apparaît dans la liste avec le libellé **« GitHub »** (l'étoile la range dans la liste des documents ; la croix la retire : geste volontaire). Sur une affaire, elle reste visible dans « Détails » tant qu'elle existe.
- **« Créer le répertoire »** (fiche projet, sous « Dossier de travail », seulement si le projet n'a pas encore de dossier) : on tape le nom (le nom du projet est proposé, **aucune convention imposée**), on clique : l'OS crée le dossier et ses sous-dossiers dans Drive par l'API Google, puis enregistre le lien. Le lien repose sur l'**identifiant** du dossier : renommer ou déplacer le dossier dans Drive ne casse rien. Le bouton reste derrière l'interrupteur du ménage 2.5.0, **rebaptisé « Créer le répertoire dans Google Drive »** (Réglages > Options du CRM ; allumé chez Jérôme, éteint par défaut chez un client).
- **Réglages > CRM (menu de gauche) > « Dossiers de projets dans Google Drive »** (section `reglages-projets`, raccourci « Google Drive : dossiers de projets » ; visible quand l'interrupteur est allumé) : le **dossier parent** (choisi UNE fois dans la fenêtre Google, ou la racine de Mon Drive à défaut), la liste des **sous-dossiers** (ajout, renommer, ordre, retrait ; 20 au plus, vide par défaut), un bouton **« Tester la fenêtre Google »** et une phrase qui dit si Google est branché.
- **Tant que Google n'est pas branché** (étape ci-dessous), les boutons « Ajouter un document » et « Créer le répertoire » sont **cachés** ; tout le reste marche (liens libres, dossier libre).

## Essai minimal de la fenêtre Google (premier livrable demandé)

- **Marche (vu dans le navigateur intégré)** : les deux scripts Google (api.js et gsi/client) se chargent depuis l'OS ; la **vraie** fenêtre Picker de Google s'ouvre, en français (code : `js/os/google-picker.js`).
- **Pas vérifiable par Claude** : l'autorisation (fenêtre surgissante Google, bloquée dans le navigateur intégré) et la suite (un faux jeton donne « 403 » dans la fenêtre : normal). Il faut les étapes ci-dessous, que seul Jérôme peut faire.
- Test réel après le branchement : Réglages > « Tester la fenêtre Google » (renvoie le lien du fichier choisi).

## Ce que Jérôme doit faire (une seule fois par projet Google)

Il y a deux projets Google : **`chevalier-ia-app`** (plateforme clients, la priorité) et **`chevalier-ia-os`** (son propre CRM). Les liens ci-dessous sont pour `chevalier-ia-app` ; pour le CRM, remplace `chevalier-ia-app` par `chevalier-ia-os` dans l'adresse. Vérifie toujours le nom du projet en haut de la page de la console.

1. **Activer deux API** (bouton bleu **Activer**) :
   - Google Drive API : <https://console.cloud.google.com/apis/library/drive.googleapis.com?project=chevalier-ia-app>
   - Google Picker API : <https://console.cloud.google.com/apis/library/picker.googleapis.com?project=chevalier-ia-app>
2. **Clé de navigateur** : ouvrir <https://console.cloud.google.com/apis/credentials?project=chevalier-ia-app>, section **Clés API**, cliquer sur la clé « Browser key (auto created by Firebase) ». Sous **Restrictions relatives aux API** : si c'est « Ne pas restreindre la clé », rien à faire ; si c'est « Restreindre la clé », **ajouter « Google Picker API » et « Google Drive API »** à la liste, puis **Enregistrer**. (Cette clé est déjà publique dans la page, c'est voulu ; on ne crée pas de clé en plus.)
3. **ID client OAuth** : sur la même page, section **ID clients OAuth 2.0**, cliquer sur « Web client (auto created by Google Service) » (celui de la connexion Google). Sous **Origines JavaScript autorisées**, **Ajouter un URI** : `https://chevalier-ia-app.web.app` (pour le CRM : `https://chevalier-ia-os.web.app`), puis **Enregistrer**. Copier l'**ID client** (forme `123456789012-xxxxxxxx.apps.googleusercontent.com`). **Ne copie jamais le « code secret du client ».**
4. **Écran de consentement** (la fenêtre d'autorisation que Jérôme accepte) :
   - Accès aux données : <https://console.cloud.google.com/auth/scopes?project=chevalier-ia-app> > **Ajouter ou supprimer des niveaux d'accès** > cocher **`…/auth/drive.file`** (« Afficher et gérer uniquement les fichiers et dossiers Google Drive que vous avez ouverts ou créés avec cette application ») > **Mettre à jour** > **Enregistrer**. C'est la seule portée demandée : l'OS ne voit jamais le reste du Drive.
   - Audience : <https://console.cloud.google.com/auth/audience?project=chevalier-ia-app> > si l'état est « Test », cliquer **Publier l'application** (« En production »), sinon seuls les « utilisateurs test » pourraient autoriser. À ma connaissance, `drive.file` n'est pas une portée sensible (pas de vérification Google à passer) : **à confirmer à l'écran**.
5. **Donner l'ID client à Claude** (il n'est **pas** confidentiel : Google l'affiche à chaque autorisation) : Claude l'écrit dans `scripts/projets/plateforme.json` (champ `googleDrive.idClient`, plateforme clients) et/ou `js/os/google-config.js` (CRM de Jérôme), dans une PR. Un test refuse tout ce qui ressemble à un secret.
6. **Publier** : la plateforme se publie par le workflow à la main « Déploiement plateforme clients » (choix `hosting`) ; le CRM de Jérôme se publie à la fusion dans `main`.
7. **Essayer** : Réglages > CRM > « Dossiers de projets dans Google Drive » > **Tester la fenêtre Google** (la première fois, Google demande l'autorisation : l'accepter), puis **Choisir dans Google Drive** pour le dossier parent, ajouter les sous-dossiers, puis une fiche projet > **Créer le répertoire**.

## Comment c'est fait (court)

- `js/os/google-drive.js` : logique sans écran (réglages lus, adresses de dossiers, noms, création du dossier et des sous-dossiers par l'API Drive `files.create`). Testée avec un faux Google (`tests/google-drive.test.js`).
- `js/os/google-picker.js` : chargement des scripts Google au premier besoin, autorisation (Google Identity Services, portée `drive.file`, jeton gardé **en mémoire seulement**, une heure), fenêtre Picker. Jamais de jeton écrit dans la base ni sur le disque.
- Réglage Google : `js/os/google-config.js` (identifiant client ; **remplacé à la construction du paquet de la plateforme** par un fichier généré depuis `scripts/projets/plateforme.json`, comme `firebase-config.js`). La clé de navigateur et le numéro de projet sont ceux de Firebase (publics). **Choix** : l'identifiant vient d'un réglage de la plateforme, jamais écrit dans le code des écrans ; vide tant que Jérôme ne l'a pas créé.
- Réglages enregistrés dans le document existant `crm_parametres/reglages` : `dossierParentDrive` (`{ id, nom }`) et `sousDossiersDrive` (liste de noms). Aucune nouvelle collection.
- Serveur MCP : la restriction « Google Drive seulement » de `urlDossier` est levée (`modifier_affaire`, `modifier_projet`, `creer_affaire`, `creer_projet` : n'importe quel lien complet) ; `urlGithub` est gardé (ancien champ, facultatif) ; `joindre_lien` ajoute à « Liens et documents ».

## Choix faits sans poser de question

- **« Ajouter un document » sans dossier de travail** : une question (« Créer le dossier » / « Parcourir seulement »). Créer le dossier le range comme dossier de travail (avec parent et sous-dossiers des Réglages, ou à la racine de Mon Drive sans réglage), puis la fenêtre s'ouvre avec « Importer » dans ce dossier. « Parcourir seulement » : « Mon Drive » sans « Importer », rien créé.
- **Dossier de travail hors Drive** (serveur, NAS, site) : « Importer » n'est pas proposé (il faut un dossier Drive) ; « Mon Drive » reste disponible.
- **Plusieurs fichiers** peuvent être choisis d'un coup ; un lien déjà dans la liste n'est pas ajouté deux fois.
- **Sans dossier parent** dans les Réglages : création à la racine de Mon Drive.
- **Un sous-dossier qui échoue** n'empêche pas le reste : le dossier du projet existe, le message nomme les sous-dossiers manquants.
- **Dossier de travail libre pour tous** : le lien est visible et modifiable même quand l'interrupteur est éteint (chez un client) ; l'interrupteur ne commande que le bouton « Créer le répertoire » et ses réglages.
- **Affaires** : même « Dossier de travail » libre ; pas de « Créer le répertoire » (c'est sur la fiche projet, comme décidé) ; leur section « Documents » est inchangée.
- **Supprimé** (code mort, plus de convention de nommage) : les prompts Claude Code, `nomDossierSuggere` et les fonctions de nommage de dépôt, les réglages « Compte GitHub » et « Dossier Projets du Mac » (leurs valeurs restent dans la base, simplement plus affichées).
- **Version 2.6.1** (l'autre session met 2.6.0) : les conflits de numéro (`js/os/version.js`, `version.json`, `tests/statique.test.js`) sont à régler à la fusion.

## Vues de la fenêtre Google (2.6.2, après le premier essai réel de Jérôme)

Premier essai réel (plateforme, espace clientdemo) : le Picker s'ouvre, mais le choix du dossier parent montrait **à plat tous les dossiers du Drive mélangés** (vue « FOLDERS »). Maintenant :
- **Choisir le dossier parent** : vue `DocsView(DOCS)` avec `setParent('root')`, `setIncludeFolders(true)`, `setSelectFolderEnabled(true)` et le filtre « dossiers » : on part de la racine de Mon Drive et on descend dossier par dossier.
- **« Ajouter un document »** : l'onglet Mon Drive démarre **dans le dossier de travail** s'il est dans Drive, sinon à la **racine de Mon Drive** ; « Importer » reste dans le dossier de travail.
- Toujours la fenêtre standard de Google, aucun écran sur mesure. Vérifié ici avec un Google simulé (ce qu'on demande au Picker) ; l'affichage réel de ces vues n'a pas pu être vu sans jeton valide : à confirmer par Jérôme.

## Liens et documents, version 2.6.3 (retours de l'essai réel)

- **Un seul composant** (`js/modules/crm/liens-documents.js`) pour la fiche **projet** et la fiche **affaire** (section « Liens et documents », qui remplace l'ancienne section « Documents » des affaires). Aucune donnée existante n'est modifiée : les anciens documents restent tels quels.
- **Deux boutons côte à côte** : « Ajouter un document » (fenêtre Google, si Google est branché) et « Ajouter un lien web ». Plus de champs permanents sous la liste.
- **Petit formulaire en place** après le choix d'un document Google (**nom** prérempli avec le nom du fichier, modifiable ; **note** facultative) ou pour un lien web (**lien**, **nom** facultatif : sans nom, on affiche le nom du site, ex. `exemple.fr` ; **note** facultative). Le formulaire en cours de saisie survit au redessin de la fiche. Un lien déjà dans la liste n'est pas ajouté deux fois.
- **La liste** : un clic sur le nom ouvre le lien, la note est en petit dessous, **crayon** pour modifier nom et note (nom vide = nom du site, note vide = champ effacé), étoile, croix.
- **Données** : champ facultatif `note` (300 caractères au plus) sur l'élément de `documents` ; aucun élément ancien n'a besoin de migration.
- **Serveur MCP** : `joindre_lien` accepte une `note` facultative et `lister_documents` la renvoie. Pas d'outil pour modifier une note après coup (reste à faire si besoin : il faut retirer puis rejoindre le lien).
- **Mon Drive est libre** : l'onglet part de la racine de Mon Drive (`setParent('root')`), jamais du dossier de travail. Seul « Importer » est limité au dossier de travail. **Choix** : pas d'onglet supplémentaire « Ce projet » (les deux onglets standard suffisent ; deux vues portant le même titre « Google Drive » auraient prêté à confusion).
- **Affaires** : même logique que les projets pour le dossier de travail (proposer de créer le dossier Drive de la fiche, ou « Parcourir seulement »). L'ancienne ligne « GitHub » de « Détails » est supprimée : l'adresse est dans la liste.
- **Fenêtre Google** : titres adaptés (« Choisir un dossier », « Ajouter un document ») ; Réglages : phrase qui explique que seuls les dossiers s'affichent dans le choix du dossier parent.
- **Réglages** : la ligne « Dossier Drive parent » est alignée (libellé, nom, boutons au même niveau ; nom long tronqué avec « … ; sur téléphone la ligne passe à la ligne sans défilement horizontal).

## Fiches affaire et projet cohérentes, version 2.6.7

- **La bande du haut** (étapes d'une affaire, phases d'un projet) n'est plus cliquable : c'est un simple indicateur. On change l'étape avec la liste **« Étape »** du Résumé de l'affaire (nouvelle), la phase avec la liste **« Phase »** du Résumé du projet, même fonction que le Kanban (boîtes de dialogue, célébration, action suggérée). Le glisser-déposer du Kanban ne change pas.
- **Même ordre des sections** sur les deux fiches : Résumé, Tâches et Factures (projets seulement), **Liens et documents**, puis **Détails**. À droite : Activité et Notes, Points clés, Historique (inchangés). *Choix : j'ai appliqué l'ordre demandé à la colonne principale (« Liens et documents » passe avant « Détails » ; la colonne de droite était déjà identique).*
- **Fiche projet** : la ligne « Affaire d'origine » n'apparaît que s'il y a une affaire (plus de « Aucune affaire liée »).
- **Étiquette d'état** (Ouverte / Actif…) : une seule fois, sous le titre, avec une icône « i » qui l'explique ; la ligne « Statut » du Résumé de l'affaire est supprimée (la raison de la perte ou la date de réveil s'affichent à côté de l'étiquette).

## Pas vérifié (à faire après le branchement)

- Le vrai parcours Google : autorisation, Picker avec « Importer » **dans le bon dossier** (`DocsUploadView.setParent`, d'après la documentation de Google), création réelle des dossiers, ouverture du lien enregistré.
- Le nom exact de l'onglet « Importer » en français (c'est Google qui le choisit : « Importer » ou « Upload »).
- Les lecteurs et appareils : fenêtre surgissante d'autorisation sur téléphone (Safari bloque parfois les fenêtres : l'autorisation se demande au clic, scripts chargés à l'avance).
- Drives partagés : non activés (le Picker ne les montre pas), les dossiers de « Mon Drive » seulement.
