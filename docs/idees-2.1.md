# Idées pour la version 2.1

Notées le 02/10/2026, après la mise en ligne de la 2.0.0. Rien ici n'est commencé ni décidé : ce sont des pistes à trancher avant le cahier des charges de la 2.1.

Déjà prévu pour la 2.1 (voir `rapport-construction-v2.md`) : écran Projets, copie quotidienne vers Google Sheet par n8n.

## 1. Plusieurs personnes par affaire

En 2.0, une affaire ne porte qu'un `personneId`. Piste : une liste de personnes liées, avec une personne principale.

## 2. Pièces jointes sur personnes, organisations et affaires

Besoin : joindre l'interview d'Elliot à Elliot d'abord, puis la relier aussi à l'affaire quand elle existe, sans copier le fichier.

Piste de modèle : une collection de pièces jointes `{ libelle, url, source: lien | televersement, personneId, organisationId, affaireId }`, sur le même principe que les liens par identifiant de la 2.0. Relier une pièce à une affaire ajoute un lien, pas un fichier. Les trois fiches affichent leurs pièces.

Deux façons d'ajouter une pièce, qui doivent coexister :
- **Par lien** : on colle le lien Drive d'un fichier rangé à la main (par exemple un devis dans le dossier `devis` du projet). Aucune autorisation Google nécessaire. À faire en premier.
- **Par téléversement** : depuis le téléphone, on choisit un fichier, il part dans Google Drive et la pièce apparaît sur la fiche.

## 3. Téléversement vers Google Drive

Piste : autorisation Google Drive `drive.file` (accès limité aux fichiers créés par l'appli ou choisis par l'utilisateur), jeton demandé dans le navigateur. Points à trancher :
- L'appli crée elle-même le dossier `Jerome IA OS Attachments` à la première utilisation (avec `drive.file`, elle ne voit pas un dossier créé à la main, sauf choix via le sélecteur Google). Son identifiant est gardé dans les réglages.
- Dossier unique, sans sous-dossiers par client ou par projet : un fichier relié à une personne puis à un projet n'a qu'un seul emplacement. Les dossiers de travail existants (un par projet, `devis`, etc.) restent tels quels et se relient par lien.
- Nommage automatique : `AAAA-MM-JJ - <personne ou projet> - <contenu>`, par exemple `2026-10-02 - Elliot - interview`. Le nom est figé à l'envoi : renommer la personne ensuite ne renomme pas le fichier, le lien tient par identifiant.
- Jetons de courte durée : réautorisation régulière sur le téléphone. Alternative : un relais n8n qui téléverse avec son propre accès à Drive.
- Réglages Google Cloud à faire par Jérôme (écran de consentement, origine autorisée) ; en-têtes de `firebase.json` à vérifier.
- Gros fichiers (audio d'interview) et confidentialité du dossier (enregistrements de personnes).

## 4. Documents des affaires : libellé non synchronisé

En 2.0, le libellé d'un document est saisi à la main : renommer le fichier dans Drive ne le met pas à jour. Un accès Drive (idée 3) permettrait de synchroniser le nom.
