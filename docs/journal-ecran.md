# Écran Journal (version 2.0.3) : guide pour Jérôme

Demande du 04/10/2026 : « le jour où je veux auditer, c'est que j'ai un problème, peut-être que MCP ne marchera pas ce jour-là ». L'écran **Journal** lit directement la base (comme le reste de l'appli), **sans passer par le serveur MCP**. Il est **en lecture seule** : on regarde, on comprend, on ne modifie rien.

## Où le trouver

Menu de gauche, sous « Affaires » : **Journal** (icône d'horloge fléchée). Adresse directe : `#/crm/journal`.

## Ce qu'on y voit

- Une **ligne par opération** (une action faite dans l'appli, ou un appel d'outil de Claude Code ou de Hermes), la plus récente en haut : quand, qui (Jérôme, Charles, ou le nom du jeton comme `claude-code-jerome`), canal (**Appli** ou **MCP**), ce qui s'est passé (« Suppression de 1 événement, 1 affaire »), et l'outil employé.
- Une pastille **À vérifier** quand une opération est restée « en cours » (le serveur s'est arrêté au milieu : à contrôler), ou **Échec**.
- En cliquant sur une ligne : le **détail document par document**, avec un tableau **champ / avant / après** (la copie « avant / après », gardée sans limite de durée). Pour un document supprimé, on voit tout ce qu'il contenait. Pour un document créé, « avant » est vide. Quand le document existe encore, un lien « Ouvrir la fiche » est proposé.

## Filtres

Recherche (qui, outil, type de document, identifiant ; **pas** le contenu des documents, le journal n'en garde pas dans ses lignes), date de début ; le bouton commun « Filtres » (22/10/2026) ouvre une fenêtre à cases à cocher : canal (Appli, MCP) et « À vérifier seulement » ; les filtres sont gardés jusqu'au rechargement de la page. Le bouton **Actualiser** relit le journal ; **Charger les lignes plus anciennes** va plus loin que les 200 dernières lignes.

## Ce que l'écran ne fait pas

- Il **ne restaure pas**. Pour défaire une opération : dans Claude Code, « restaure l'opération `<identifiant>` (aperçu d'abord) » (`restaurer_depuis_audit`). L'identifiant est affiché dans le détail.
- Il ne montre que ce que le journal contient (voir `audit-ecran.md` : les réglages et les modifications faites à la main dans la console Firestore n'y sont pas ; les sauvegardes Google couvrent ce cas).
- Les copies ne s'effacent pas ; si une ligne n'a pas de copie (elle n'a pas pu être écrite), le détail dit « Pas de copie ».

## Sécurité

Aucune règle Firestore à changer : les règles de la 2.0.2 autorisaient déjà la **lecture** de `crm_audit` et `crm_audit_avant` (et la création seule). L'écran n'écrit rien, même en le consultant (test C28).

## Retour arrière

Annuler la PR (`git revert -m 1 <commit de fusion>`) : l'appli repasse en 2.0.2, le journal continue d'être écrit, seul l'écran disparaît.
