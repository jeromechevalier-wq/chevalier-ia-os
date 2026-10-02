# Roadmap

Tenue à jour à chaque discussion sur l'évolution de l'appli. Dernière mise à jour : 02/10/2026, après la mise en ligne de la 2.0.0.

Légende : **décidé** = validé par Jérôme ; **piste** = à trancher avant le cahier des charges.

## Version 2.1

### Déjà prévu
- Écran Projets (Kanban de phases, lien `projetId` depuis une affaire gagnée).
- Copie quotidienne vers Google Sheet par n8n.
(voir `rapport-construction-v2.md`)

### Pièces jointes sur les affaires
- **Décidé** : les pièces jointes se rattachent aux **affaires uniquement**, pas aux personnes ni aux organisations. Raison : rester simple ; dès qu'on travaille avec quelqu'un, il y a une affaire.
- **À surveiller** : une interview JTBD d'une personne qui n'aura jamais d'affaire. Remède simple si le cas se présente : ouvrir une affaire au stade « Premier contact ». Le modèle par liens (`personneId`, `organisationId`, `affaireId`) permet d'ajouter les personnes plus tard sans refonte.
- **Décidé** : deux modes qui coexistent.
  - **Par lien** : on colle le lien Drive d'un fichier rangé à la main (devis fait à la main dans le dossier `devis` d'un projet). Aucune autorisation Google. À faire en premier.
  - **Par téléversement** : depuis le téléphone, on choisit un fichier, il part dans Google Drive et la pièce apparaît sur la fiche de l'affaire.
- Une pièce peut être reliée à plusieurs affaires sans copier le fichier.

### Téléversement vers Google Drive
- **Décidé** : un seul dossier `Jerome IA OS Attachments`, sans sous-dossiers par client ou projet. L'appli gère le rangement, le tri et la recherche. Les dossiers de travail de Jérôme (un par projet, `devis`, etc.) restent tels quels et se relient par lien.
- **Décidé** : c'est l'appli qui **crée** le dossier à la première utilisation et garde son identifiant. Jérôme peut ensuite le renommer et le déplacer à sa guise dans son Drive : l'appli le retrouve par identifiant. Il ne doit pas le supprimer.
- **Décidé** : nommage automatique `AAAA-MM-JJ - <affaire> - <contenu>`, par exemple `2026-10-02 - depannage Carrel - devis`. Le nom est figé à l'envoi.
- **Piste** : autorisation Google Drive `drive.file` (l'appli ne voit que les fichiers qu'elle crée ou que l'utilisateur choisit). Jérôme valide l'autorisation à l'écran, ça prend quelques secondes.
- **Piste** : jetons de courte durée, donc réautorisation de temps en temps sur le téléphone ; alternative : un relais n8n qui téléverse avec son propre accès à Drive.
- À faire par Jérôme : réglages Google Cloud (écran de consentement, origine autorisée). À vérifier : en-têtes de `firebase.json`.
- À prévoir : gros fichiers (audio d'interview) ; dossier Drive strictement privé (enregistrements de personnes).

### Plusieurs personnes par affaire
- **Piste** : en 2.0, une affaire ne porte qu'un `personneId`. Liste de personnes liées, avec une personne principale.

### Libellé des documents non synchronisé
- En 2.0, le libellé d'un document est saisi à la main : renommer le fichier dans Drive ne le met pas à jour. Avec un accès Drive, le nom pourrait se synchroniser.

## Plus tard, à étudier
- **Joindre un fichier depuis Claude Code** (« attache ce devis à l'affaire dépannage Carrel »). Impossible aujourd'hui : l'appli n'a pas d'interface pour cela. Piste : un relais n8n (adresse protégée) qui reçoit le fichier, le range dans Drive et crée la pièce sur l'affaire.

## Hors périmètre de la 2.0 (rappel)
Import CSV, fusion de doublons, prévisions en euros, envoi d'e-mails depuis la fiche, mode hors ligne.
