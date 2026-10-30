# Préparer la fusion de la PR 369 (onglet « Documents ») : guide pas à pas pour Jérôme

Écrit le 29/10/2026 d'après `docs/revue-conception-fable-2026-10-28.md`. Aucun secret ici (dépôt public). Claude ne fusionne pas la PR 369 : elle garde l'étiquette `a-fusionner-par-jerome`.

## 0. État de la PR 369

- Branche de la PR : `claude/zealous-davinci-3mq3l5`. Elle appartient à une **autre session** que celle qui a écrit ce guide : rien n'y a été poussé.
- Elle a 25 commits de retard sur `main` et **12 fichiers en conflit** (dont `functions/src/coeur/ecriture.js`, `js/os/registre.js`, `scripts/preparer-fonctions.js`, des tests MCP), à cause des PR 387 à 390. La résolution est faite par la session principale, avec relecture Fable ; le bouton « Update branch » ne suffira pas. Il faut ensuite attendre la coche « Tests » verte sur https://github.com/jeromechevalier-wq/chevalier-ia-os/pull/369.
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

## 2. Urgence 2 : droits IAM sur les buckets (constat du 29/10/2026, fait par Jérôme)

**Constat** : les deux buckets (`chevalier-ia-os.firebasestorage.app` et `chevalier-ia-app.firebasestorage.app`, région `europe-west9`) sont en **« Accès précis : les LCA d'objet sont activées »**, pas en accès uniforme. Une condition IAM sur le nom de l'objet (`documents/`, `clients/`) n'y est donc **pas possible** : le guide ne demande plus de condition. Le message « Accès public » de la console est générique ; aucun `allUsers` n'apparaît dans les droits des buckets. Passer en accès uniforme n'est pas fait (il changerait le fonctionnement des objets existants).

**Quels droits, pour qui** (vérifié dans le code de la PR 369 et sur les écrans de la console) :
- **`porte-serveur@` (chez Jérôme)** et **`devis-pdf@` (chez les clients)** exécutent `documentDeposer`, `documentLien` et `documentSupprimer`. Ils ont **déjà** « Administrateur des objets Storage » sur leur bucket, sans condition : **rien à faire**.
- **`mcp-serveur@` (chez Jérôme)** et **`mcp-clients@` (chez les clients)** ne font que déposer un fichier texte (`deposer_document`) : il leur faut seulement **« Créateur d'objets Storage »**, **sans condition**, posé sur le bucket. Ils ne lisent, ne listent et ne signent rien. Seul inconvénient : si l'enregistrement de la fiche échoue après le dépôt, le nettoyage du fichier (`supprimer`) est refusé et son erreur ignorée : le fichier reste, sans fiche (orphelin invisible, rare, sans danger). « Utilisateur des objets Storage » nettoierait ce cas, mais donne lecture et suppression sur tout le bucket : non retenu pour des comptes exposés à l'assistant.

**Les clics (pour chaque bucket)**
1. Chez Jérôme : https://console.cloud.google.com/storage/browser/chevalier-ia-os.firebasestorage.app;tab=permissions?project=chevalier-ia-os . Chez les clients : https://console.cloud.google.com/storage/browser/chevalier-ia-app.firebasestorage.app;tab=permissions?project=chevalier-ia-app
2. **Accorder l'accès**. Principal : `mcp-serveur@chevalier-ia-os.iam.gserviceaccount.com` (chez Jérôme) ou `mcp-clients@chevalier-ia-app.iam.gserviceaccount.com` (chez les clients). Rôle : **Créateur d'objets Storage**. **Aucune condition.** Enregistrer.
3. Contrôle : la liste « Afficher par principal » montre le compte avec « Créateur d'objets Storage » et « Pas d'héritage ». *(Fait et contrôlé le 29/10/2026, sur les deux buckets.)*

**Signature des liens**
1. **Signature des liens** : le lien de 5 minutes est signé par `porte-serveur` (chez les clients : `devis-pdf`). Les PDF des devis le font déjà avec ces comptes, donc le droit existe normalement (« Créateur de jetons du compte de service » sur lui-même, et l'API « IAM Service Account Credentials » activée). Si un lien est refusé après la fusion, deux causes : ce droit de signature manque (page du compte de service, onglet « Autorisations »), ou le compte qui signe n'a pas le droit de **lire** l'objet sous `documents/` (couvert par le rôle de l'étape 2). Dis-le à Claude. `mcp-serveur` et `mcp-clients` ne signent pas de lien : ils ne font que déposer du texte.

**Vérifier que ça a pris** : après la fusion et le déploiement, déposer un petit `.txt` avec l'assistant dans une affaire de test (en plus du PDF déposé depuis l'écran). Un message « droit manquant » veut dire qu'il faut attendre 1 à 2 minutes ou revérifier le rôle.

## 3. Urgence 3 : sauvegarde serveur de `crm_audit`, `crm_audit_avant` et `devis_compteurs`

**Constat** : aucun bouton « Exporter mes données » ne couvre ces trois collections (le journal d'audit « ne s'efface jamais », et restaurer `devis_devis` sans `devis_compteurs` donnerait des **numéros de devis en double**).

**Nuance importante** : la copie Google complète de la base (quotidienne, gardée 98 jours, plus récupération à la minute sur 7 jours, `docs/securite-et-pannes.md`) contient déjà ces collections **chez toi**. Ce qui manque, c'est une copie **à part, ciblée**, qu'on peut lire ou restaurer sans recréer toute la base. Il faut aussi vérifier que le projet des clients (`chevalier-ia-app`) a les mêmes sauvegardes Google : non vérifié.

**Proposition (PR séparée, relecture Fable obligatoire, modèle `fable`)** : un workflow GitHub manuel puis planifié (chaque nuit) qui lance un export Firestore ciblé (`gcloud firestore export` avec les identifiants de collection `crm_audit`, `crm_audit_avant`, `devis_compteurs`, qui couvrent aussi les sous-collections du même nom dans les espaces clients) vers un bucket **privé et distinct** de celui des documents. **Un export par projet** : `chevalier-ia-os` (toi) et `chevalier-ia-app` (clients) sont deux projets Google, donc deux lancements, deux buckets, deux comptes. Le bucket doit être dans une région compatible avec la base (à vérifier dans la console Firestore de chaque projet). L'export est écrit par l'agent de service Firestore, qui doit pouvoir créer des objets dans ce bucket. Décisions à prendre avant : bucket dédié (région `europe-west9`, accès restreint, suppression des anciennes copies après N jours **sauf** décision contraire de Jérôme, le journal ne s'efface jamais), compte de service d'export avec les seuls rôles « Administrateur d'import/export Datastore » et écriture sur ce bucket, une clé ou un accès sans clé (de préférence sans clé). Le brief de cette PR sera relu par Fable avant envoi, puis le code aussi. Cette PR ne se fait pas dans le présent lot.

## 4. Ce qui n'est pas vérifié avec le vrai système

**Vu par Jérôme dans les consoles le 29/10/2026** : règles Storage de `chevalier-ia-os` (« tout refusé »), mode d'accès des deux buckets (accès précis), rôles des comptes de service. **Essayé en vrai le 29/10/2026** : dépôt d'un texte par l'assistant et ouverture du lien chez le client démo (accents mal affichés : voir `.github/A-FAIRE.md`). **Pas vérifié** : l'état des sauvegardes Google du projet des clients ; l'essai de l'assistant chez Jérôme.

## 5. Liste ordonnée pour Jérôme

Chaque étape finit par ce que tu vérifies à l'écran. Ne passe à la suivante que si la vérification est bonne.

1. **Règles Storage de `chevalier-ia-os`** (paragraphe 1) : lis-les, colle-les à Claude. *À l'écran* : onglet Règles lu sans rien modifier. Si elles sont ouvertes : on prépare et on publie le `storage.rules` « tout refusé » d'abord.
2. **Droits sur le bucket chez toi** (paragraphe 2) : `porte-serveur` n'a rien à recevoir ; `mcp-serveur` reçoit « Créateur d'objets Storage » sans condition. *Fait le 29/10/2026.* *À l'écran* : `mcp-serveur@` apparaît avec ce rôle et « Pas d'héritage ».
3. **Attendre que la PR 369 soit mise à jour avec `main`** (conflits résolus par Claude), attendre « Tests » vert, puis **la fusionner** (https://github.com/jeromechevalier-wq/chevalier-ia-os/pull/369). Le déploiement (fonctions et site) chez toi part tout seul. *À l'écran* : onglet Actions, le déploiement est vert ; Réglages > Déploiement reste vert. **Enchaîne tout de suite l'étape 4** : tant que les règles ne sont pas publiées, l'onglet « Documents » affiche une erreur de lecture.
4. **Publier les règles Firestore** : GitHub > Actions (https://github.com/jeromechevalier-wq/chevalier-ia-os/actions) > « Publier les règles (CRM de Jérôme) » > « Run workflow » > bouton vert. À faire **après** la fusion de la PR 369 et, si elle est fusionnée, de la PR 391 (le fichier de règles contient alors les deux ajouts, `documents_stockes` et `devis_vocabulaire`). *À l'écran* : le workflow finit vert, et le journal dit « Règles lues ».
5. **Essai de bout en bout chez toi** : ouvre une affaire de test > dernier onglet « Documents » > « + Ajouter un fichier » : un petit `.txt`, puis un PDF. *À l'écran* : la ligne apparaît avec nom, taille, date, ton e-mail ; le nom ouvre le fichier ; garde l'onglet du fichier ouvert, attends 6 minutes, recharge **cet onglet** : l'ancien lien est refusé ; la croix demande confirmation, « Retirer » fait disparaître la ligne, et l'Historique montre la suppression. Un compte Google quelconque non autorisé reste refusé comme avant.
6. **Droits sur le bucket chez les clients** (paragraphe 2) : `devis-pdf` n'a rien à recevoir ; `mcp-clients` reçoit « Créateur d'objets Storage » sans condition. *Fait le 29/10/2026.* *À l'écran* : `mcp-clients@` apparaît avec ce rôle et « Pas d'héritage ».
7. **Déploiements chez les clients**, avec Claude, via le workflow manuel « Déploiement plateforme clients » (Claude ne le lance jamais seul) : dans cet ordre sûr : `fonctions` (après l'étape 6), puis `regles`, puis `hosting` en dernier (sinon la page appelle des fonctions et lit une collection qui n'existent pas encore). *À l'écran* : chez le client de démo, une affaire > « Documents » > déposer un fichier, l'ouvrir, le retirer ; un lecteur voit la liste sans bouton ni croix.
8. **Sauvegarde ciblée** (paragraphe 3) : décider, puis PR séparée relue par Fable. *À l'écran, une fois en place* : un fichier daté apparaît dans le bucket de sauvegarde après la première nuit.
