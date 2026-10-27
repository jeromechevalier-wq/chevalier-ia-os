# Liens et documents, Google Drive (version 2.6.5, 17/10/2026)

> **Mise à jour du 22/10/2026 (version 2.19.0, I10) : l'onglet Documents (aujourd'hui « G-Drive ») a changé.** Les sections ci-dessous gardent l'historique des chantiers du 16 et 17/10/2026 ; pour l'état actuel, lire d'abord la section « Onglet G-Drive (ex-Documents), version 2 » plus bas. En particulier : plus de titre « Liens et documents », plus de bouton « Ajouter un lien web », et les deux boutons du dossier de travail passent derrière « + Ajouter ».

Chantier « Liens et documents » des décisions du 16/10/2026. **Rien n'est déployé.** Les règles Firestore ne sont **pas** modifiées. Aucune donnée existante n'est modifiée ni migrée.

## Ce que Jérôme verra

- **Fiche projet, section « Liens et documents »** (elle s'appelait « Documents ») : le formulaire reste (Libellé, « Lien web », **Ajouter**) et accepte n'importe quel lien. Un second bouton **« Ajouter un document »** ouvre la fenêtre **standard de Google** (Google Picker) avec deux onglets : **Mon Drive** (parcourir) et **Importer** (un fichier de l'ordinateur, envoyé dans le dossier de travail Drive du projet). Le lien du document entre dans la liste.
- **Fiche projet, « Détails » : « Dossier de travail »** : n'importe quel lien (Drive, serveur, NAS en `smb://`, site…). Le champ « Adresse GitHub », le bouton « Créer le GitHub » et le prompt à copier pour Claude Code **n'existent plus**. Une ancienne adresse GitHub **reste dans la base** et apparaît dans la liste avec le libellé **« GitHub »** (l'étoile la range dans la liste des documents ; la croix la retire : geste volontaire). Sur une affaire, elle reste visible dans « Détails » tant qu'elle existe.
- **« Créer un dossier dans Google Drive »** (fiche projet, sous « Dossier de travail », seulement si le projet n'a pas encore de dossier) : un seul clic, sans champ : le dossier porte le nom de la fiche (**aucune convention imposée**) ; l'OS crée le dossier et ses sous-dossiers dans Drive par l'API Google, puis enregistre le lien. Le lien repose sur l'**identifiant** du dossier : renommer ou déplacer le dossier dans Drive ne casse rien. Le bouton reste derrière l'interrupteur du ménage 2.5.0, **rebaptisé « Créer un dossier dans Google Drive »** (Réglages > Options du CRM ; allumé chez Jérôme ; **allumé par défaut** dans un nouvel espace client depuis 2.11.8, éteignable).
- **Réglages > Affaires et projets (menu de gauche) > « Dossiers de projets dans Google Drive »** (section `reglages-projets`, raccourci « Google Drive : dossiers de projets » ; visible quand l'interrupteur est allumé) : la liste des **sous-dossiers** (ajout, renommer, ordre, retrait ; 20 au plus, vide par défaut), et une phrase qui dit si Google est branché. Le **dossier parent** (choisi UNE fois dans la fenêtre Google, ou créé tout seul à défaut) se règle depuis 2.11.8 dans **Réglages > Affaires et projets > Options du CRM**, dans une zone « Dossier Drive parent » **sous la case « Créer un dossier dans Google Drive »**, visible seulement quand la case est cochée (code : `js/modules/crm/dossier-parent.js`).
- **Tant que Google n'est pas branché** (étape ci-dessous), les boutons « Ajouter un document » et « Créer un dossier dans Google Drive » sont **cachés** ; tout le reste marche (liens libres, dossier libre).

## Essai minimal de la fenêtre Google (premier livrable demandé)

- **Marche (vu dans le navigateur intégré)** : les deux scripts Google (api.js et gsi/client) se chargent depuis l'OS ; la **vraie** fenêtre Picker de Google s'ouvre, en français (code : `js/os/google-picker.js`).
- **Pas vérifiable par Claude** : l'autorisation (fenêtre surgissante Google, bloquée dans le navigateur intégré) et la suite (un faux jeton donne « 403 » dans la fenêtre : normal). Il faut les étapes ci-dessous, que seul Jérôme peut faire.
- Test réel après le branchement : une fiche projet > « Ajouter un document » (le bouton « Tester la fenêtre Google » des Réglages a été retiré en 2.7.4).

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
7. **Essayer** : Réglages > Affaires et projets > « Dossiers de projets dans Google Drive » > (le bouton « Tester la fenêtre Google » n'existe plus depuis 2.7.4 : on essaie avec « Choisir dans Google Drive » ou « Ajouter un document ») (la première fois, Google demande l'autorisation : l'accepter), puis **Choisir dans Google Drive** pour le dossier parent, ajouter les sous-dossiers, puis une fiche projet > **Créer un dossier**.

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
- **Dossier de travail libre pour tous** : le lien est visible et modifiable même quand l'interrupteur est éteint (chez un client) ; l'interrupteur ne commande que le bouton « Créer un dossier dans Google Drive » et ses réglages.
- **Valeur par défaut d'un nouvel espace (2.11.8)** : l'interrupteur est **allumé** (et « Célébrations » aussi ; « Extraction de valeur » reste éteinte). Un booléen déjà enregistré dans `crm_parametres/reglages` garde la priorité (Ingrid a `boutonsDepot=false` écrit : rien ne change chez elle) ; seul un champ absent prend la nouvelle valeur par défaut.
- **Affaires** : même « Dossier de travail » libre ; pas de « Créer un dossier dans Google Drive » (c'est sur la fiche projet, comme décidé) ; leur section « Documents » est inchangée.
- **Supprimé** (code mort, plus de convention de nommage) : les prompts Claude Code, `nomDossierSuggere` et les fonctions de nommage de dépôt, les réglages « Compte GitHub » et « Dossier Projets du Mac » (leurs valeurs restent dans la base, simplement plus affichées).
- **Version 2.6.1** (l'autre session met 2.6.0) : les conflits de numéro (`js/os/version.js`, `version.json`, `tests/statique.test.js`) sont à régler à la fusion.

## Vues de la fenêtre Google (2.6.2, après le premier essai réel de Jérôme)

Premier essai réel (plateforme, espace clientdemo) : le Picker s'ouvre, mais le choix du dossier parent montrait **à plat tous les dossiers du Drive mélangés** (vue « FOLDERS »). Maintenant :
- **Choisir le dossier parent** : vue `DocsView(DOCS)` avec `setParent('root')`, `setIncludeFolders(true)`, `setSelectFolderEnabled(true)` et le filtre « dossiers » : on part de la racine de Mon Drive et on descend dossier par dossier.
- **« Ajouter un document »** : l'onglet Mon Drive démarre **dans le dossier de travail** s'il est dans Drive, sinon à la **racine de Mon Drive** ; « Importer » reste dans le dossier de travail.
- Toujours la fenêtre standard de Google, aucun écran sur mesure. Vérifié ici avec un Google simulé (ce qu'on demande au Picker) ; l'affichage réel de ces vues n'a pas pu être vu sans jeton valide : à confirmer par Jérôme.

## Onglet G-Drive (ex-Documents), version 2 (22/10/2026, I10)

- **Dossier de travail** : ligne « Dossier de travail de cette fiche  + Ajouter ». Sans dossier, « + Ajouter » propose « Créer un dossier dans Google Drive » et « Lier un dossier Google Drive existant » ; un second clic, Échap ou « Annuler » referme (le focus clavier va sur le premier choix à l'ouverture et revient sur « + Ajouter » à la fermeture). Avec un dossier : « Ouvrir le dossier » et « Retirer » (confirmation, puis « Annuler » pendant 8 secondes).
- **Documents** : plus de titre « Liens et documents » ; une ligne « Documents  + Ajouter » (avec le « i ») est toujours en haut de la liste. Sans dossier de travail, « + Ajouter » explique pourquoi on ne peut pas (Fermer) ; sans Google branché, un message le dit et aucun bouton n'apparaît.
- **Date et heure d'ajout** : chaque document ajouté depuis l'écran porte `ajouteLe` (texte ISO) et affiche « Ajouté le jj/mm/aaaa hh:mm » (heure de Paris). Les anciens documents n'en ont pas et n'en affichent pas. `joindre_lien` (MCP) n'écrit pas ce champ ; `lister_documents` le renvoie quand il existe.
- **Plus de bouton « Ajouter un lien web »** : les adresses web se mettent dans une note (lien cliquable, I6). Les liens web déjà enregistrés restent affichés, avec crayon, étoile et croix.
- Tests : `tests/e2e/onglet-documents-v2.spec.js` et `tests/onglet-documents-v2.test.js` ; plusieurs tests des sections ci-dessous ont été adaptés (les liens web s'y créent par des données écrites en base).

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

## « Dossier de travail » identique partout, version 2.6.5

Jérôme : « c'est différent d'une fiche à l'autre ». Maintenant **un seul composant** (`js/modules/crm/lanceurs.js`) sur la fiche **affaire** et la fiche **projet** :
- **Sans dossier** : deux boutons côte à côte, **« Créer un dossier dans Google Drive »** (affiché seulement si l'interrupteur est allumé **et** Google branché) et **« Lier un dossier existant »**. Aucun champ n'est affiché avant le clic. Le premier crée tout de suite le dossier au nom de la fiche (un seul clic, plus de formulaire ; un petit champ ne revient que si le nom est inutilisable, par exemple trop long) et les sous-dossiers des Réglages, puis enregistre le lien. Le second ouvre un champ « Lien du dossier (Drive, serveur, NAS, site…) » + Enregistrer / Annuler.
- **Avec un dossier** : « Ouvrir le dossier », « Modifier », « Retirer » (retirer n'efface rien dans Drive : seul le lien est retiré).
- L'explication tient dans une icône « i » à côté du libellé (plus de texte long).
- **Vocabulaire** : « dossier » partout (plus « répertoire ») : boutons, interrupteur (« Créer un dossier dans Google Drive »), réglages, messages, tests, doc.
- **L'affaire** reçoit aussi « Créer un dossier » (même fonctionnement que le projet). Un projet créé depuis une affaire **reprend déjà** le dossier de travail de l'affaire (déjà le cas : test B28).
- **Avertissement non bloquant** quand le dossier lié sert déjà à un **autre projet** : « Ce dossier sert déjà au projet X ». Pas d'avertissement pour le projet de l'affaire elle-même. Comparaison par adresse, ou par identifiant Drive. Le dossier est enregistré malgré l'avertissement.
- Aucune migration : le champ `urlDossier` est le même.
- « Début d'activité » (année invisible) : corrigé dans une PR à part (PR 81 : champ élargi).
## Fiches affaire et projet cohérentes, version 2.6.7

- **La bande du haut** (étapes d'une affaire, phases d'un projet) n'est plus cliquable : c'est un simple indicateur. On change l'étape avec la liste **« Étape »** du Résumé de l'affaire (nouvelle), la phase avec la liste **« Phase »** du Résumé du projet, même fonction que le Kanban (boîtes de dialogue, célébration, action suggérée). Le glisser-déposer du Kanban ne change pas.
- **Même ordre des sections** sur les deux fiches : Résumé, Tâches et Factures (projets seulement), **Liens et documents**, puis **Détails**. À droite : Activité et Notes, Points clés, Historique (inchangés). *Choix : j'ai appliqué l'ordre demandé à la colonne principale (« Liens et documents » passe avant « Détails » ; la colonne de droite était déjà identique).*
- **Fiche projet** : la ligne « Affaire d'origine » n'apparaît que s'il y a une affaire (plus de « Aucune affaire liée »).
- **Étiquette d'état** (Ouverte / Actif…) : une seule fois, sous le titre, avec une icône « i » qui l'explique ; la ligne « Statut » du Résumé de l'affaire est supprimée (la raison de la perte ou la date de réveil s'affichent à côté de l'étiquette).
## Copier un fichier dans le dossier de travail (2.6.8 ; cochée par défaut depuis 2.7.4)

Quand on ajoute un document choisi dans l'onglet **Google Drive** de la fenêtre Google (un fichier qui existe déjà), le petit formulaire (nom + note) propose la case **« Copier dans le dossier de travail du projet »** (de l'affaire, sur une affaire), **cochée par défaut** (décision de Jérôme).
- **Décochée par l'utilisateur** : le lien du fichier d'origine est enregistré, sans copie.
- **Cochée (par défaut)** : le fichier est **copié** par l'API Drive (`files.copy`) dans le dossier de travail, et le lien enregistré pointe vers la **copie** ; l'original reste où il est. Jamais de déplacement automatique.
- **La case n'apparaît pas** si le dossier de travail n'est pas un dossier Drive (serveur, NAS, site), si le fichier vient d'« Importer » (il est déjà dans le dossier de travail : la fenêtre Google indique son dossier d'origine), si c'est un dossier, ni pour un lien web.
- **Si la copie échoue** (droits, fichier ou dossier introuvable…) : message simple, le lien d'origine est enregistré quand même.
- Si la fiche n'a pas encore de dossier de travail, la question habituelle (« Créer le dossier » / « Parcourir seulement ») est posée avant la fenêtre : créer le dossier le rend disponible pour la copie. *Reste à vérifier en réel* : que l'appli a bien le droit de copier un fichier choisi dans la fenêtre (portée `drive.file`) vers le dossier de travail créé par l'appli.

## Petites corrections, version 2.7.4 (17/10/2026)

Les sections plus haut décrivent l'historique ; **ce qui suit prévaut** quand il les contredit.
1. **Réglages > Affaires et projets > Google Drive** : le bouton « Tester la fenêtre Google » est retiré (inutile pour un client).
2. **Tâches (projet) et points clés (projet et affaire)** : même comportement. Un clic sur le texte le modifie sur place ; le rond à gauche coche pour terminer ; le menu « … » ne garde que les actions rares (tâches : Modifier… pour la date et la personne, Monter, Descendre, Déplacer vers, Supprimer ; points clés : Supprimer).
3. **Confirmation puis « Retiré · Annuler » 8 secondes** pour tout retrait réversible, avec un **audit** de tous les boutons : voir `audit-boutons-destructifs.md`.
4. **Sans dossier de travail, « Ajouter un document »** : la fenêtre explique qu'il n'y a pas de dossier de travail ; elle ne propose plus que « Créer le dossier » ou « Annuler » (« Parcourir seulement » est supprimé).
5. **Bloc « Dossier de travail » (affaire et projet, même composant)** : deux boutons, « Créer un dossier dans Google Drive » et « Lier un dossier Google Drive existant » (fenêtre Google en mode « choisir un dossier », depuis la racine de Mon Drive). Plus de champ pour coller une adresse (une adresse web va dans « Liens et documents > Ajouter un lien web »), plus de bouton « Modifier » : pour changer, « Retirer » (confirmation + Annuler) puis recréer ou relier. Un ancien dossier qui est une adresse non-Drive (serveur, NAS, site) reste affiché et ouvrable, sans migration. **Doublon** : avant de créer, l'appli cherche dans le dossier parent un dossier du même nom ; s'il existe : « Un dossier de ce nom existe déjà. Utilise « Lier un dossier Google Drive existant ». » **Limite honnête** : avec l'autorisation `drive.file`, l'appli ne voit que les dossiers qu'elle a créés ou que l'utilisateur lui a montrés dans la fenêtre Google ; un dossier créé à la main dans Drive n'est **pas** détectable, la vérification ne protège donc que des doublons faits par l'appli. Sans Google branché, ni création ni liaison : seul le message vers « Liens et documents » s'affiche.
6. **Icônes « i »** : toutes marchent pareil (bulle au survol, au clavier avec le focus, au toucher ; Échap ou un clic ailleurs la ferme ; la bulle reste dans l'écran). Une icône « i » est ajoutée à côté de « Liens et documents ».
7. **Lien web** : « monsite.fr » et « www.monsite.fr » reçoivent `https://` ; « http:www.monsite.fr » devient `http://www.monsite.fr` ; sinon le message est « L'adresse doit commencer par http:// ou https:// ».
8. **Case « Copier dans le dossier de travail »** : **cochée par défaut** pour un fichier choisi dans l'onglet « Google Drive ». Pour un fichier venu d'« Importer » (reconnu à son dossier d'origine, renvoyé par la fenêtre Google), la case est affichée **grisée et cochée** avec « Le fichier est envoyé dans le dossier de travail ». Aucune case si le dossier de travail n'est pas dans Drive. Échec de la copie : le lien d'origine est gardé et un message le dit.

### Recette (8 vérifications à l'écran, une par point)
1. Réglages > Affaires et projets > Dossiers de projets dans Google Drive : il n'y a plus de bouton « Tester la fenêtre Google ».
2. Fiche projet : cliquer sur le texte d'une tâche → il se modifie sur place (Entrée enregistre, Échap annule) ; le rond la coche ; le menu « … » n'a que les actions rares. Même geste sur un point clé d'une fiche affaire.
3. Retirer un lien (Liens et documents) : la fenêtre de confirmation s'ouvre ; après « Retirer », le message « Retiré · Annuler » reste 8 secondes et « Annuler » remet le lien. Idem pour retirer le dossier de travail.
4. Sur une fiche sans dossier de travail, « Ajouter un document » : la fenêtre explique la situation, boutons « Annuler » et « Créer le dossier » seulement.
5. Bloc « Dossier de travail » : mêmes deux boutons sur une affaire et sur un projet ; « Lier un dossier Google Drive existant » ouvre la fenêtre Google à la racine de Mon Drive ; créer un dossier dont le nom existe déjà (créé par l'appli) affiche le message d'erreur ; pas de champ d'adresse ni de « Modifier ».
6. Passer la souris sur le « i » de « Liens et documents », puis le choisir au clavier (Tab), puis le toucher sur téléphone : la bulle apparaît à chaque fois.
7. « Ajouter un lien web » : saisir `monsite.fr` → le lien enregistré est `https://monsite.fr` ; saisir `bonjour` → message « L'adresse doit commencer par http:// ou https:// ».
8. « Ajouter un document » depuis l'onglet « Google Drive » : la case « Copier dans le dossier de travail » est cochée ; avec « Importer » elle est grisée et cochée avec le message gris.

**Non vérifié avec le vrai Google** : la copie (`files.copy`) vers le dossier de travail avec la portée `drive.file`, la reconnaissance d'« Importer » par le dossier d'origine renvoyé par la fenêtre, la recherche de doublon par nom (`files.list`), l'affichage réel de la bulle sur un téléphone.

## Corrections, version 2.7.5 (retours de l'essai de la 2.7.4)

- **P1 Tâches** : un clic sur la date d'une tâche (ou sur « En retard ») ouvre **la même fenêtre « Changer la date »** que pour une activité (date, heure, raccourcis) ; une tâche sans date affiche « Sans date » (cliquable) et la fenêtre ajoute « Sans date » pour l'effacer. Comparaison faite : texte au clic, date au clic, rond, menu « … » existent des deux côtés ; seules les tâches se déplacent de phase et se confient à quelqu'un (« Modifier… »), seules les activités ont un type. *Sur une affaire, les « tâches » sont des activités de type Tâche : elles avaient déjà ce comportement.*
- **P2 Annuler 8 s** : suppression d'une **tâche**, d'une **activité**, d'une **note** : « Supprimé · Annuler » (la fiche revient à l'identique). Cause du manque en 2.7.4 : ces trois suppressions n'étaient que confirmées. Audit repris dans `audit-boutons-destructifs.md`.
- **P3 « Ajouter un document » sans dossier de travail** : un seul message d'information (« Cette fiche n'a pas de dossier de travail : on ne peut pas y ajouter de document. Crée ou relie d'abord le dossier de travail de cette fiche (bloc « Dossier de travail de cette fiche », en haut de cet onglet). »), un seul bouton « Fermer ». Aucune création de dossier, aucune fenêtre Google.
- **P4 Libellé** : « Dossier de travail de cette fiche » (affaire et projet).
- **P5 Fichier importé** : deux signaux, demandés à Drive (`files.get`, champs `parents` et `createdTime`) : le fichier est **dans le dossier de travail** ET a été **créé à l'instant** (moins de 5 minutes) → c'est un import : case **grisée et cochée**, « Le fichier est envoyé dans le dossier de travail », aucune copie. Un fichier **ancien** déjà dans le dossier : case grisée et cochée, « Ce fichier est déjà dans le dossier de travail » (jamais « envoyé »). Un fichier ailleurs : case active, cochée par défaut. **Si Drive ne répond pas** : on se rabat sur le dossier d'origine donné par la fenêtre Google ; s'il manque aussi, on ne **copie pas** (une copie pourrait doubler un fichier importé) : case grisée et décochée, « Impossible de vérifier le dossier de ce fichier : il reste où il est, seul son lien est gardé » (comportement le plus prudent).

### Recette 2.7.5 : ce qui est VÉRIFIÉ à l'écran (Google simulé) et ce qui ne l'est pas
| Point | Vérifié par test | Pas vérifié avec le vrai Google |
|---|---|---|
| P1 | `P1 …` (2 tests) : clic sur la date d'une tâche, badge « En retard », tâche sans date, même fenêtre que l'activité | — (aucun appel Google) |
| P2 | `P2 …` (8 tests) : tâche, activité, note, lien, dossier de travail, organisation détachée, dossier parent, sous-dossier, valeur de liste, étiquette, filtre, modèle d'affaire, **facture, tâche type, modèle de projet, détacher l'affaire / le projet** : confirmation, message « Annuler », restauration ; durée de 8 s | — |
| P3 | `P3 projet …`, `P3 affaire …` : message unique, bouton « Fermer » seul, aucun dossier créé, aucune fenêtre Google | — |
| P4 | `P4 projet …`, `P4 affaire …` | — |
| P5 | `P5 …` (5 tests) : import reconnu par `files.get` (dans le dossier + créé à l'instant), case grisée / cochée / non décochable, aucune copie ; fichier ancien déjà dans le dossier (« déjà dans le dossier ») ; secours par `parentId` ; Drive muet sans indice : on ne copie pas ; fichier d'ailleurs : case active | **Le contenu réel de `parents` et `createdTime` renvoyé par le vrai `files.get` pour un fichier déposé par « Importer »** (attendu : le dossier de travail et l'heure d'envoi, d'après le comportement documenté de `DocsUploadView.setParent`) ; la copie `files.copy` avec `drive.file` |

### Critères d'acceptation, tests et captures (lot 2.7.5)
Captures **produites par les tests e2e eux-mêmes** (refaites à chaque passage, Google simulé) : `~/chantiers-crm/captures-corrections-dossiers-2/` (`P1.png`… sur ordinateur, `P1-telephone.png`… sur téléphone ; P3 et P4 existent pour le projet et pour l'affaire).
| Point | Critère observable (une phrase) | Test | Capture |
|---|---|---|---|
| P1 | Je clique (ou je touche, sur téléphone) la date d'une tâche : la même fenêtre « Changer la date » que pour une activité s'ouvre, et la tâche n'affiche qu'UN badge « En retard ». | `P1 une tâche se traite comme une activité…` (compte les badges), `P1 (toucher)…` | `P1.png` |
| P2 | Après avoir supprimé une tâche (idem activité, note), un message « Annuler » reste affiché 8 s et la rend. | `P2 « Supprimé · Annuler » : une TÂCHE…`, `…ACTIVITÉ et NOTE…`, `P2 le message « Annuler » disparaît après 8 secondes` | `P2.png` |
| P3 | « Ajouter un document » sans dossier de travail : un message et « Fermer », rien d'autre. | `P3 projet …`, `P3 affaire …` | `P3-projet.png`, `P3-affaire.png` (fenêtre de message visible) |
| P4 | Le libellé lit « Dossier de travail de cette fiche ». | `P4 projet …`, `P4 affaire …` | `P4-projet.png`, `P4-affaire.png` |
| P5 | Un fichier importé de l'ordinateur : la case « Copier » est grisée et cochée avec le message grisé, et un clic ne la décoche pas. | `P5 un fichier IMPORTÉ…`, `Quand je décoche « Copier » pour un fichier importé de mon ordinateur…` | `P5.png` |

### Un test permanent par règle de `docs/consignes-ui.md` (`tests/e2e/consignes-ui.spec.js`, affaire ET projet, ordinateur ET téléphone)
| Règle | Test |
|---|---|
| Affaire et projet fonctionnent pareil | `Affaire et projet fonctionnent pareil : sur projet / affaire…` |
| Tâche, activité, point clé : texte, date, rond, menu | `Tâche, activité et point clé fonctionnent pareil` (projet) et (affaire) |
| Liste déroulante / bande indicateur | `Une liste déroulante change l'étape ou la phase…` |
| Retirer : confirmation puis « Annuler » 8 s | `Quand je retire un lien sur …` ; `Quand je retire le dossier parent…` |
| Pas de « Modifier » si « Retirer » puis recréer suffit | `Pas de bouton « Modifier » quand « Retirer » puis recréer suffit…` |
| « dossier », jamais « répertoire » | `On dit « dossier », jamais « répertoire »` (écrans + code) |
| Message d'erreur clair, https:// ajouté | `Message d'erreur clair, et https:// ajouté tout seul…` |
| Icône « i » : survol, clavier, toucher | `L'icône « i » explique…` |
| « Liens et documents » : deux boutons, nom et note | `« Liens et documents » : nom et note facultatifs…` + 1re règle |
| Bloc « Dossier de travail de cette fiche » identique | `Affaire et projet fonctionnent pareil…` |
| Sans dossier : message et « Fermer » | `Sans dossier de travail, « Ajouter un document »…` |
| Case « Copier » : cochée par défaut / grisée et cochée | `Case « Copier… » cochée par défaut…` ; `Quand je décoche « Copier » pour un fichier importé…` |
| Adresse hors Drive : dans « Ajouter un lien web » | `Une adresse hors Google Drive se met dans « Ajouter un lien web »…` |
| **Sans test permanent (dit clairement)** | filtres combinés / listes limitées (écran Automatisations, tests 2.7.3, non rejoués ici) ; « un mot = une seule chose » (relecture humaine) ; « cas vide, erreur, chargement décrits et testés » (règle de méthode) ; « chiffres de largeur fixe » (`tabular-nums` posé sur les compteurs existants, pas de test de rendu). |

## Dossier parent créé tout seul (version 2.10.2)

Demande de Jérôme : « quand on veut créer un dossier, paf, ça lui crée automatiquement un répertoire dans son Google Drive ». Avant, sans dossier parent choisi dans Réglages, le dossier était créé à la racine de Mon Drive (désordre). Maintenant :
- **Aucun parent enregistré** : au premier besoin, l'appli crée **UNE fois** un dossier dans Mon Drive — **« Chevalier IA OS »** pour le CRM de Jérôme, **« Chevalier IA - <nom de l'espace> »** chez un client (nom lu dans la fiche de marque) —, l'enregistre dans `dossierParentDrive` (`{ id, nom, auto: true }`, comme si l'utilisateur l'avait choisi) et crée dedans le dossier de la fiche et ses sous-dossiers. S'il existe déjà un dossier de ce nom connu de l'appli, il est réutilisé (pas de doublon).
- **Parent choisi par l'utilisateur** (« Choisir dans Google Drive ») : conservé tel quel, jamais remplacé.
- **Parent créé tout seul puis supprimé** (ou mis à la corbeille) dans Drive : recréé au prochain dossier, avec le message « Le dossier « … » avait été supprimé de ton Drive : il a été recréé pour le ranger. » Si Drive ne répond pas, on garde l'ancien (on ne conclut pas qu'il est supprimé).
- Aucune fenêtre de choix, rien à expliquer ; Réglages montre « Créé tout seul au premier dossier » tant qu'il n'y en a pas, puis son nom. Aucun changement de règles Firestore ; aucune donnée existante modifiée (le champ `dossierParentDrive` existait).
- *Choix* : à la racine de Jérôme, le dossier s'appelle « Chevalier IA OS » (et non « Chevalier IA - Chevalier IA OS »).
- Tests : `G7` (logique, faux Drive), `L4` (racine : parent créé une fois puis réutilisé), `L3` (parent choisi conservé), `P6` (parent supprimé : recréé + message ; capture `P6-parent-recree.png`), `P6` chez un client (« Chevalier IA - Studio Lune »). **Non vérifié avec le vrai Google** : la suppression réelle d'un dossier et son signalement par `files.get` (404 ou `trashed`), la création dans Mon Drive avec `drive.file`.

## Pas vérifié (à faire après le branchement)

- Le vrai parcours Google : autorisation, Picker avec « Importer » **dans le bon dossier** (`DocsUploadView.setParent`, d'après la documentation de Google), création réelle des dossiers, ouverture du lien enregistré.
- Le nom exact de l'onglet « Importer » en français (c'est Google qui le choisit : « Importer » ou « Upload »).
- Les lecteurs et appareils : fenêtre surgissante d'autorisation sur téléphone (Safari bloque parfois les fenêtres : l'autorisation se demande au clic, scripts chargés à l'avance).
- Drives partagés : non activés (le Picker ne les montre pas), les dossiers de « Mon Drive » seulement.

## Dossier de travail créé ou lié : plus de copie des PDF (27/10/2026)
Les PDF des devis ne sont plus copiés dans le Drive (décision de Jérôme, 27/10/2026) : ils vivent chez nous, dans l'onglet « Devis » de l'affaire (`docs/pdf-clients.md`). Créer ou lier un dossier de travail ne copie plus rien ; le Drive reste pour les autres documents de l'affaire.

## Nom de l'onglet (27/10/2026)
L'onglet « Documents » des fiches affaire et projet s'appelle maintenant « G-Drive » (identifiant technique `documents` inchangé) : le nom « Documents » est réservé à un futur onglet de fichiers stockés chez nous (`consignes-ui.md`).
