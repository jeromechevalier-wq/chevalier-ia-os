# Consignes d'interface de Jérôme (à lire AVANT de toucher un écran)

Ces règles viennent de Jérôme (non-développeur). Elles valent pour tous les écrans, Chevalier IA OS et Chevalier IA APP. **Chaque point d'un brief qui les touche doit avoir un test dont le nom cite la règle, et une capture d'écran de l'état obtenu.** Quand Jérôme donne une nouvelle règle, on l'ajoute ici avec la date.

## Même comportement partout
- Affaire et projet fonctionnent pareil (même ordre des blocs, mêmes boutons, mêmes listes déroulantes). Tâche, activité et point clé aussi : clic sur le texte = modifier sur place ; clic sur la date = changer la date ; rond = terminer ; menu « … » = actions rares seulement. Peu de clics. *(2026-10-17)*
- Une liste déroulante change l'étape ou la phase ; la bande en haut est un simple indicateur. *(2026-10-17)*
- Les filtres se combinent toujours ; chaque liste ne propose que les valeurs possibles. *(2026-10-17)*
- Le bouton « Filtres » (entonnoir + pastille de compte, il ouvre une fenêtre avec « Tout effacer » et « Appliquer ») est le même sur les listes (Personnes, Organisations, Affaires, Projets) et sur l'Historique des fiches, dont les pastilles sont cachées au repos ; le filtre de l'Historique revient sur « Tous » en quittant la fiche. Journal, Veille, Automatisations et Tableau de bord gardent leurs listes en ligne : à aligner (I15). *(2026-10-22)*
- Le Propriétaire est une ligne modifiable du Résumé (affaire, projet, organisation, personne), jamais dans l'en-tête ; si l'écriture échoue, un message le dit et le menu revient à la valeur réelle. *(2026-10-22)*
- Les liens vers la personne et l'organisation, en haut de l'affaire et du projet, apparaissent et disparaissent tout de suite quand on choisit ou retire dans le Résumé, sans recharger la page. Taper dans une cellule remplie ne retire rien ; seule la croix retire. *(2026-10-22)*

## Destructif
- Tout bouton qui retire ou supprime : **fenêtre de confirmation**, puis un message « Retiré · Annuler » pendant **8 secondes** quand l'action est réversible. *(2026-10-17)*
- Pas de bouton « Modifier » quand « Retirer » puis recréer suffit. *(2026-10-17)*

## Vocabulaire et messages
- Un mot = une seule chose (deux compteurs n'ont jamais le même nom). *(2026-10-17)*
- On dit « dossier », jamais « répertoire ». On dit « Chevalier IA OS » et « Chevalier IA APP ». *(2026-10-17)*
- Message d'erreur clair et qui dit quoi faire ; adresse web : `https://` est ajouté tout seul (dans les liens des notes). *(2026-10-17)*
- Cas vide, cas d'erreur et chargement de chaque écran sont décrits et testés. *(2026-10-17)*
- Les compteurs qui changent chaque seconde ont des chiffres de largeur fixe (la ligne ne bouge pas). *(2026-10-17)*
- On n'écrit plus le mot « CRM » dans ce que l'utilisateur voit (menu, titres, aides, messages) : c'est un jargon qui fait peur. On dit « Réglages », « Options », « Journal des modifications », « ton espace ». Les adresses (`#/crm/…`) et les noms de fichiers gardent le mot : un utilisateur ne les lit pas et les renommer casserait les signets. *(2026-10-18)*
- On parle d'**étapes** pour les affaires et de **phases** pour les projets (mots de Pipedrive). *(2026-10-18)*
- Menu de gauche (modèle : Claude et ChatGPT) : **pas de titres de groupes**, de fines lignes entre les blocs (une ligne n'apparaît que si ses deux côtés ont des entrées) ; Réglages, Journal des modifications et « Connecter mon assistant » ne sont pas dans le menu principal : ils sont dans le **menu utilisateur** (clic sur le nom, en bas à gauche, s'ouvre vers le haut ; fermeture au clic extérieur et à Échap ; clavier : Tab, flèches, Entrée ; toucher : tap pour ouvrir, tap ailleurs pour fermer). Le bouton de repli est à droite du nom de l'espace (raccourci Cmd/Ctrl+B). L'en-tête est le même chez Jérôme et chez un client : nom + logo de l'espace, initiale du compte. *(2026-10-18)*
- L'icône « i » explique ; elle marche au survol, au clavier et au toucher. *(2026-10-17)*

## Liens, documents et dossier de travail
- Sur l'affaire et le projet, tout ça est dans l'**onglet « Documents »** de la colonne de droite, après « Activité » et « Notes » (pastille de compteur) : la ligne « Dossier de travail de cette fiche  + Ajouter » en haut, puis la ligne « Documents  + Ajouter » (plus de titre « Liens et documents »), puis la liste, puis (projet) « Documents de l'affaire ». Chaque document ajouté affiche la date et l'heure de son ajout (les anciens n'en ont pas). Ajouter ou retirer un document laisse une ligne dans l'Historique (filtre « Documents »). *(2026-10-20, modifié 2026-10-22)*
- Documents : la ligne « Documents  + Ajouter » est toujours en haut de la liste ; plus de bouton « Ajouter un lien web » (les adresses passent par les notes) ; les liens web déjà enregistrés restent affichés ; nom et note facultatifs. *(2026-10-17, modifié 2026-10-22)*
- Ligne « Dossier de travail de cette fiche  + Ajouter » identique sur l'affaire et le projet : « + Ajouter » propose « Créer un dossier dans Google Drive » ou « Lier un dossier Google Drive existant » (un second clic ou Échap referme ; le focus clavier suit). Avec un dossier : « Ouvrir le dossier » et « Retirer ». *(2026-10-17, modifié 2026-10-22)*
- Sans dossier de travail, « Ajouter un document » affiche seulement un message qui explique pourquoi on ne peut pas, avec « Fermer » : jamais de création ni de fenêtre qui s'ouvre et se ferme. *(2026-10-17)*
- Case « Copier dans le dossier de travail » : cochée par défaut pour un fichier de Drive ; **grisée et cochée** pour un fichier de l'ordinateur (il est toujours envoyé dans le dossier) avec le message grisé. *(2026-10-17)*
- Une adresse hors Google Drive se met dans une note (lien cliquable), pas dans le dossier de travail. *(2026-10-17, modifié 2026-10-22)*

## Notes et note de départ
- À la création d'une affaire ou d'un projet (écran, assistant par le MCP, projet créé depuis une affaire), une **note épinglée vide** est créée, avec un texte d'invitation grisé (« Cette affaire concerne… » / « Ce projet concerne… ») qui disparaît au clic ; elle s'enregistre en quittant le champ. Il n'y a plus de champ « description ». Un projet créé depuis une affaire reçoit une copie du texte de la note épinglée de l'affaire. Une note vide n'apparaît jamais dans l'historique ; sa croix la **supprime** (confirmation, « Annuler » pendant 8 secondes) ; la croix d'une note qui a du texte la désépingle. *(2026-10-22)*
- La note épinglée du haut garde sa croix et un seul bouton « Modifier » (sous « date · heure · auteur », toujours visible), modification sur place ; elle reste coupée à 3 lignes (« Développer tout »). *(2026-10-22)*
- Dans les notes (fil et note épinglée), une adresse `https://`, `http://` ou `www.` est un lien cliquable (nouvel onglet) ; seule l'adresse est cliquable. Une note du fil de plus de 20 lignes (12 sur téléphone) est coupée avec « … » et un bouton « Développer » / « Réduire ». *(2026-10-22)*

## Boutons (trois styles seulement, 2026-10-22)
- **Ajouter à une liste ou à un champ** : une ligne « Étiquette  + Ajouter » en texte jaune, sans cadre (comme « Offre  + Ajouter » ; composants `boutonAjouter` et `ligneAjouter`). Le formulaire d'ajout n'apparaît qu'après le clic, à la place de la ligne (Factures, Tâches, Documents, Dossier de travail).
- **L'action principale d'un écran** : bouton jaune plein, un seul par écran.
- **Toutes les autres actions** : bouton à contour.
- Un champ numérique vide peut montrer un exemple gris (le Montant de l'affaire : « 999 € »), jamais une vraie valeur, jamais compté dans les totaux ni dans l'objectif.
- **Reste à aligner (inventaire de la nuit du 21 au 22/10/2026)** : « + Ajouter une adresse email », « + Ajouter un numéro de téléphone » et « + Organisation » de la fiche personne ; « Ajouter la tâche type » (`modeles.js`, jaune plein) ; « Ajouter » du formulaire de lien (`liens-documents.js`) ; plusieurs jaunes pleins sur un même écran (« Gagnée » + une pastille choisie ; « Terminer » + pastille + filtre « Tous ») ; formulaires d'ajout toujours visibles (`objectifs.js`, `reglages.js`, `lanceurs.js`) ; pastilles Appel / Rendez-vous / Email / Tâche (le projet n'a pas « Tâche » : ses tâches sont dans le bloc Tâches) ; zone de clic des « + Ajouter » d'environ 30 px sur téléphone (44 px demandés).

## Boutons Enregistrer
- Un bouton « Enregistrer » est grisé tant qu'il n'y a rien à enregistrer et jaune dès qu'une modification est faite ; les cases à cocher d'une carte s'enregistrent toutes seules et la carte le dit (« Chaque case s'enregistre toute seule. »). « Annuler les changements » suit la même règle. Quitter la page avec un brouillon non enregistré demande confirmation. *(2026-10-18)*
