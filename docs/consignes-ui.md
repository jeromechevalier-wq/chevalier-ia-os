# Consignes d'interface de Jérôme (à lire AVANT de toucher un écran)

Ces règles viennent de Jérôme (non-développeur). Elles valent pour tous les écrans, Chevalier IA OS et Chevalier IA APP. **Chaque point d'un brief qui les touche doit avoir un test dont le nom cite la règle, et une capture d'écran de l'état obtenu.** Quand Jérôme donne une nouvelle règle, on l'ajoute ici avec la date.

## Même comportement partout
- Affaire et projet fonctionnent pareil (même ordre des blocs, mêmes boutons, mêmes listes déroulantes). Tâche, activité et point clé aussi : clic sur le texte = modifier sur place ; clic sur la date = changer la date ; rond = terminer ; menu « … » = actions rares seulement. Peu de clics. *(2026-10-17)*
- Une liste déroulante change l'étape ou la phase ; la bande en haut est un simple indicateur. *(2026-10-17)*
- Les filtres se combinent toujours ; chaque liste ne propose que les valeurs possibles. *(2026-10-17)*

## Destructif
- Tout bouton qui retire ou supprime : **fenêtre de confirmation**, puis un message « Retiré · Annuler » pendant **8 secondes** quand l'action est réversible. *(2026-10-17)*
- Pas de bouton « Modifier » quand « Retirer » puis recréer suffit. *(2026-10-17)*

## Vocabulaire et messages
- Un mot = une seule chose (deux compteurs n'ont jamais le même nom). *(2026-10-17)*
- On dit « dossier », jamais « répertoire ». On dit « Chevalier IA OS » et « Chevalier IA APP ». *(2026-10-17)*
- Message d'erreur clair et qui dit quoi faire ; adresse web : `https://` est ajouté tout seul. *(2026-10-17)*
- Cas vide, cas d'erreur et chargement de chaque écran sont décrits et testés. *(2026-10-17)*
- Les compteurs qui changent chaque seconde ont des chiffres de largeur fixe (la ligne ne bouge pas). *(2026-10-17)*
- On n'écrit plus le mot « CRM » dans ce que l'utilisateur voit (menu, titres, aides, messages) : c'est un jargon qui fait peur. On dit « Réglages », « Options », « Journal des modifications », « ton espace ». Les adresses (`#/crm/…`) et les noms de fichiers gardent le mot : un utilisateur ne les lit pas et les renommer casserait les signets. *(2026-10-18)*
- On parle d'**étapes** pour les affaires et de **phases** pour les projets (mots de Pipedrive). *(2026-10-18)*
- L'icône « i » explique ; elle marche au survol, au clavier et au toucher. *(2026-10-17)*

## Liens, documents et dossier de travail
- « Liens et documents » : deux boutons côte à côte, « Ajouter un document » et « Ajouter un lien web » ; nom et note facultatifs. *(2026-10-17)*
- Bloc « Dossier de travail de cette fiche » identique sur l'affaire et le projet : « Créer un dossier dans Google Drive » et « Lier un dossier Google Drive existant ». *(2026-10-17)*
- Sans dossier de travail, « Ajouter un document » affiche seulement un message qui explique pourquoi on ne peut pas, avec « Fermer » : jamais de création ni de fenêtre qui s'ouvre et se ferme. *(2026-10-17)*
- Case « Copier dans le dossier de travail » : cochée par défaut pour un fichier de Drive ; **grisée et cochée** pour un fichier de l'ordinateur (il est toujours envoyé dans le dossier) avec le message grisé. *(2026-10-17)*
- Une adresse hors Google Drive se met dans « Ajouter un lien web », pas dans le dossier de travail. *(2026-10-17)*

## Boutons Enregistrer
- Un bouton « Enregistrer » est grisé tant qu'il n'y a rien à enregistrer et jaune dès qu'une modification est faite ; les cases à cocher d'une carte s'enregistrent toutes seules et la carte le dit (« Chaque case s'enregistre toute seule. »). « Annuler les changements » suit la même règle. Quitter la page avec un brouillon non enregistré demande confirmation. *(2026-10-18)*
