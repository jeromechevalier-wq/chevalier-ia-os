# Préparer la fusion de la PR 369 (onglet « Documents ») : guide pas à pas pour Jérôme

Écrit le 29/10/2026 d'après `docs/revue-conception-fable-2026-10-28.md`. Aucun secret ici (dépôt public). Claude ne fusionne pas la PR 369 : elle garde l'étiquette `a-fusionner-par-jerome`.

## 0. État de la PR 369

- Branche de la PR : `claude/zealous-davinci-3mq3l5`. Elle appartient à une **autre session** que celle qui a écrit ce guide : rien n'y a été poussé.
- Elle a 25 commits de retard sur `main`, mais la fusion avec `main` se fait **sans conflit** (vérifié). La session qui possède la branche doit y fusionner `origin/main` et pousser pour relancer la coche « Tests » ; sinon, bouton « Update branch » sur la page de la PR (https://github.com/jeromechevalier-wq/chevalier-ia-os/pull/369), puis attendre la coche verte.
- Ne fusionne **pas** avant les étapes 1 et 2 ci-dessous.

## 1. Urgence 1 : lire les règles Storage du projet `chevalier-ia-os`

**Pourquoi** : le dépôt n'a aucun fichier de règles Storage pour ton projet (seulement `storage.plateforme.rules` pour les clients). Les règles par défaut d'un projet Firebase laissent parfois **tout compte connecté** lire et écrire tout le bucket. La PR 369 met des fichiers dans ce bucket (`documents/…`) : il faut être sûr qu'un inconnu ne peut pas les lire en contournant l'application.

**Où cliquer**
1. Ouvre https://console.firebase.google.com/project/chevalier-ia-os/storage (connecté avec ton compte Google de Jérôme).
2. Si la page propose « Commencer » / « Get started », **n'y touche pas** et dis-le à Claude (le stockage n'est alors pas activé, il y a un autre sujet).
3. En haut de la page, clique l'onglet **Règles** (Rules). Lien direct : https://console.firebase.google.com/project/chevalier-ia-os/storage/chevalier-ia-os.firebasestorage.app/rules
4. Tu vois un petit éditeur de texte avec les règles. **Ne modifie rien, ne clique pas « Publier ».** Copie le texte et colle-le à Claude (il n'y a aucun secret dedans).

**Ce que tu dois y voir pour que ce soit sûr**
- Bon : `allow read, write: if false;` (tout refusé), ou aucune ligne `allow` du tout.
- Mauvais : `allow read, write: if request.auth != null;` (tout compte connecté), `if true`, ou une date limite du type `request.time < timestamp.date(...)` (mode test). Dans ces trois cas, ne fusionne pas ; dis-le à Claude.
- Pourquoi « tout refusé » ne casse rien : l'application n'utilise jamais le stockage depuis le navigateur (aucun accès Storage dans `js/`), et les fonctions du serveur passent par l'administration Google, qui **ignore ces règles**. La PR 369 écrit les fichiers uniquement depuis le serveur.

**Proposition (PR séparée, liste d'arrêt, à ne pas fusionner par Claude)** : si les règles sont ouvertes, ou même si elles sont fermées mais sans source dans le dépôt, Claude prépare une PR qui ajoute un `storage.rules` « tout refusé » (copie de `storage.plateforme.rules` sans le dossier `marques/`), la branche dans `firebase.json`, et un workflow manuel de publication. Elle porte l'étiquette `a-fusionner-par-jerome`. Ordre : **fusion et publication de cette PR avant la PR 369** si les règles actuelles sont ouvertes ; sinon après, à ton rythme (elle sert alors à garder une trace dans le dépôt). Ce travail n'est pas fait dans la présente PR : dis « oui » pour que Claude le prépare, après avoir lu ce que tu as collé.

## 2. Urgence 2 : droits IAM des trois comptes de service

**Pourquoi** : sans ces droits, l'écran « Documents » affiche « le compte du serveur n'a pas le droit d'écrire dans le stockage » et le bouton est inutilisable. On donne le droit **seulement sur le dossier concerné** (condition sur le nom de l'objet), pas sur tout le bucket.

**Chez toi (projet `chevalier-ia-os`), deux comptes : `porte-serveur@…` et `mcp-serveur@…`**
1. Ouvre https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-os
2. Dans le filtre en haut de la liste, tape `porte-serveur` ; repère la ligne dont l'adresse est `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com`. Clique le **crayon** à droite de la ligne (« Modifier le compte principal »).
3. Clique **« Ajouter un autre rôle »**. Dans « Sélectionner un rôle », tape `Administrateur des objets` et choisis **« Administrateur des objets de Storage »** (Storage Object Admin).
4. Sous ce rôle, clique **« Ajouter une condition IAM »** (Add IAM condition). Titre : `documents seulement`. Choisis l'onglet **« Éditeur de conditions »** (Condition editor) et colle exactement :
   ```
   resource.name.startsWith("projects/_/buckets/chevalier-ia-os.firebasestorage.app/objects/documents/")
   ```
   Clique **Enregistrer** (de la condition), puis **Enregistrer** (du compte).
5. Recommence les étapes 2 à 4 pour `mcp-serveur@chevalier-ia-os.iam.gserviceaccount.com`.
6. Si le nom du bucket n'est pas `chevalier-ia-os.firebasestorage.app` : l'ouvrir dans https://console.cloud.google.com/storage/browser?project=chevalier-ia-os et remplacer le nom dans la condition par celui qui s'affiche (le code de l'écran utilise ce nom-là, `js/os/firebase-config.js`).
7. **Signature des liens** : le lien de 5 minutes est signé par `porte-serveur`. Les PDF des devis le font déjà avec ce compte, donc le droit existe normalement. Si le lien d'un document est refusé après la fusion, ajoute à `porte-serveur` le rôle « Créateur de jetons du compte de service » sur **lui-même** (page du compte de service, onglet « Autorisations »), et dis-le à Claude. `mcp-serveur` ne signe pas de lien : il ne fait que déposer du texte.

**Chez les clients (projet `chevalier-ia-app`), un compte : `mcp-clients@…`**
1. Ouvre https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-app
2. Même geste : filtre `mcp-clients`, crayon, « Ajouter un autre rôle » > « Administrateur des objets de Storage ».
3. Condition IAM, titre `espaces clients seulement`, éditeur de conditions :
   ```
   resource.name.startsWith("projects/_/buckets/chevalier-ia-app.firebasestorage.app/objects/clients/")
   ```
4. Enregistrer. `devis-pdf@…` a déjà ce droit sous `clients/` (pour les PDF) : rien à faire pour lui.
5. Le dépôt contient le nom `chevalier-ia-app.firebasestorage.app` dans `functions-plateforme/src/index.js` ; si la console montre un autre nom de bucket, utilise celui de la console.

**Vérifier que ça a pris** : les droits mettent 1 à 2 minutes. Preuve : après la fusion et le déploiement, déposer un petit `.txt` dans une affaire de test (étape 5 du paragraphe 6). Un message « droit manquant » veut dire qu'une condition est mal recopiée ou qu'il faut attendre.

**À savoir** : « Administrateur des objets » donne aussi le droit d'effacer des fichiers de ce dossier. C'est nécessaire (repli en cas d'échec d'écriture) et limité au dossier par la condition.

## 3. Urgence 3 : sauvegarde serveur de `crm_audit`, `crm_audit_avant` et `devis_compteurs`

**Constat** : aucun bouton « Exporter mes données » ne couvre ces trois collections (le journal d'audit « ne s'efface jamais », et restaurer `devis_devis` sans `devis_compteurs` donnerait des **numéros de devis en double**).

**Nuance importante** : la copie Google complète de la base (quotidienne, gardée 98 jours, plus récupération à la minute sur 7 jours, `docs/securite-et-pannes.md`) contient déjà ces collections **chez toi**. Ce qui manque, c'est une copie **à part, ciblée**, qu'on peut lire ou restaurer sans recréer toute la base. Il faut aussi vérifier que le projet des clients (`chevalier-ia-app`) a les mêmes sauvegardes Google : non vérifié.

**Proposition (PR séparée, relecture Fable obligatoire, modèle `fable`)** : un workflow GitHub manuel puis planifié (chaque nuit) qui lance un export Firestore ciblé (`gcloud firestore export` avec les identifiants de collection `crm_audit`, `crm_audit_avant`, `devis_compteurs`, ce qui couvre aussi ces collections dans les espaces clients) vers un bucket **privé et distinct** de celui des documents. Décisions à prendre avant : bucket dédié (région `europe-west9`, accès restreint, suppression des anciennes copies après N jours **sauf** décision contraire de Jérôme, le journal ne s'efface jamais), compte de service d'export avec les seuls rôles « Administrateur d'import/export Datastore » et écriture sur ce bucket, une clé ou un accès sans clé (de préférence sans clé). Le brief de cette PR sera relu par Fable avant envoi, puis le code aussi. Cette PR ne se fait pas dans le présent lot.

## 4. Ce qui n'est pas vérifié avec le vrai système

Les règles Storage actuelles et les rôles IAM (aucun accès aux consoles depuis cette session) ; le nom exact des deux buckets dans les consoles ; l'état des sauvegardes Google du projet des clients ; le comportement de la condition IAM avec le vrai Cloud Storage (le code a été testé avec un faux stockage seulement).

## 5. Liste ordonnée pour Jérôme

Chaque étape finit par ce que tu vérifies à l'écran. Ne passe à la suivante que si la vérification est bonne.

1. **Règles Storage de `chevalier-ia-os`** (paragraphe 1) : lis-les, colle-les à Claude. *À l'écran* : onglet Règles lu sans rien modifier. Si elles sont ouvertes : on prépare et on publie le `storage.rules` « tout refusé » d'abord.
2. **Droits IAM chez toi** (paragraphe 2, `porte-serveur` et `mcp-serveur`). *À l'écran* : sur chaque compte, dans la liste IAM, le rôle « Administrateur des objets de Storage » apparaît avec « Condition : documents seulement ».
3. **Mettre la PR 369 à jour** (« Update branch » ou session propriétaire), attendre « Tests » vert, puis **la fusionner** (https://github.com/jeromechevalier-wq/chevalier-ia-os/pull/369). Le déploiement des fonctions chez toi part tout seul. *À l'écran* : onglet Actions, le déploiement est vert ; Réglages > Déploiement reste vert.
4. **Publier les règles Firestore** : GitHub > Actions (https://github.com/jeromechevalier-wq/chevalier-ia-os/actions) > « Publier les règles (CRM de Jérôme) » > « Run workflow » > bouton vert. À faire **après** la fusion de la PR 369 et, si elle est fusionnée, de la PR 391 (le fichier de règles contient alors les deux ajouts, `documents_stockes` et `devis_vocabulaire`). *À l'écran* : le workflow finit vert, et le journal dit « Règles lues ».
5. **Essai de bout en bout chez toi** : ouvre une affaire de test > dernier onglet « Documents » > « + Ajouter un fichier » : un petit `.txt`, puis un PDF. *À l'écran* : la ligne apparaît avec nom, taille, date, ton e-mail ; le nom ouvre le fichier ; attends 6 minutes, recharge : l'ancien lien est refusé ; la croix demande confirmation, « Retirer » fait disparaître la ligne, et l'Historique montre la suppression. Un compte Google quelconque non autorisé reste refusé comme avant.
6. **Droits IAM chez les clients** (paragraphe 2, `mcp-clients`). *À l'écran* : le rôle avec la condition `clients/` apparaît sur la ligne du compte.
7. **Déploiements chez les clients**, avec Claude, via le workflow manuel « Déploiement plateforme clients » (Claude ne le lance jamais seul) : d'abord `hosting` puis `fonctions` (après l'étape 6), puis `regles` (après l'étape 4). *À l'écran* : chez le client de démo, une affaire > « Documents » > déposer un fichier, l'ouvrir, le retirer ; un lecteur voit la liste sans bouton ni croix.
8. **Sauvegarde ciblée** (paragraphe 3) : décider, puis PR séparée relue par Fable. *À l'écran, une fois en place* : un fichier daté apparaît dans le bucket de sauvegarde après la première nuit.
