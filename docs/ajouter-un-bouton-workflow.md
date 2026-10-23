# Ajouter un bouton qui lance un workflow (mode d'emploi)

Écrit le 23/10/2026. **Rien de tout cela n'est codé aujourd'hui** : c'est la marche à suivre le jour où un client (par exemple Ingrid) demande « un bouton Générer devis sur la fiche Affaire ». Le plan technique et les raisons sont dans `docs/actions-de-fiche.md` ; cette page dit **comment s'y prendre, dans l'ordre, et qui fait quoi**.

## Ce qu'il faut comprendre d'abord

- Un bouton n'appelle **jamais** n8n depuis la page. Il demande à une fonction du serveur, qui relit sa configuration, vérifie que la personne est éditeur, note la demande dans un journal, puis appelle l'**adresse web (webhook)** du workflow du client.
- **Un workflow par client**, avec **son** adresse secrète. Rien de propre au client (SIRET, banque, tarifs, modèle de devis) n'est dans le dépôt : tout est dans **son** workflow n8n et ses identifiants n8n. Le dépôt est public.
- Le webhook reçoit du **texte structuré (JSON)** : l'identifiant du client, de l'action et de la fiche. Le workflow **relit la fiche lui-même** par la porte (`docs/porte-cles.md`), donc toujours à jour. Des champs de texte en plus sont possibles seulement dans une **liste fermée choisie à la configuration** (à décider au moment de coder).
- Le retour (brouillon de devis, document joint à la fiche) est **l'affaire du workflow** : il écrit par la porte. Rien n'est envoyé au client final tant que la personne ne valide pas elle-même.
- Un site internet ou un fichier Excel du client peut aussi appeler un webhook, mais **chaque porte d'entrée a son propre webhook et son propre secret**, avec le minimum de droits. Ne jamais mettre le secret du bouton dans une page web ou un Excel partagé.

## Prérequis (à vérifier avant de promettre une date)

1. **La porte des workflows côté plateforme clients (base 2)** : elle n'existe pas encore (`docs/porte-cles.md`, partie 6). Prérequis absolu ; déploiement manuel, liste d'arrêt.
2. Les actions de porte `affaires.lire` et `affaires.joindreLien` (d'abord chez Jérôme, avec un workflow `interne-…`).
3. Un workflow n8n du client respectant les règles de nommage (`docs/chemin-client-pilote.md`, « Règles de création des workflows ») : étiquette `client-<identifiant>`, nom `client-<identifiant>-…`, identifiant de 17 caractères au plus.

## Les étapes, dans l'ordre

| # | Étape | Qui |
|---|---|---|
| 1 | **Cadrer avec le client** : sur quelle fiche (affaire, projet, personne), ce que doit produire le workflow, où le résultat doit atterrir (brouillon d'e-mail, document joint, nouvelle fiche), qui a le droit de cliquer (éditeurs seulement). Écrire le cahier des charges **sans** SIRET, RIB ni tarif. | Jérôme |
| 2 | **Construire d'abord chez Jérôme** (règle du 18/10/2026 : toute fonctionnalité existe d'abord dans son interface) avec un workflow `interne-…` et un **faux devis**. | Claude |
| 3 | **Table `crm_actions`** (une ligne par bouton : libellé, cible, workflow, actif, confirmation), bouton à contour sur la fiche, commande de configuration dans `scripts/nouveau-client.js` (simulation puis `--ecrire`). | Claude (sous-agent), relu par Fable |
| 4 | **Fonction de lancement** `crmLancerAction` : relit la ligne elle-même, vérifie le rôle, journalise (client, action, fiche, statut, durée), appelle le webhook. **Un seul fichier** a le droit de faire un POST vers n8n, vers un chemin fixe ; un test le borne. | Claude |
| 5 | **Adresse et secret du webhook** du client : le secret va dans Secret Manager (côté serveur), **jamais** dans la page ni dans le dépôt. | Jérôme |
| 6 | **Workflow du client** dans le n8n de Jérôme : webhook protégé par secret, lit la fiche par la porte, crée le brouillon, joint la copie, clôt le lancement par la porte. | Claude + Jérôme (identifiants) |
| 7 | **Déploiement de la plateforme** (règles, fonctions, hébergement, MCP : quatre lancements du workflow manuel « Déploiement plateforme clients »). Liste d'arrêt : jamais sans Jérôme. | Jérôme |
| 8 | **Configurer le bouton** pour ce client : `ajouter-action <client> --cible affaire --libelle "Générer devis" --workflow <identifiant>` (simulation, relire, `--ecrire`). | Jérôme |
| 9 | **Essai avec le client** : un clic, le brouillon arrive, la copie est jointe. Vérifier le cas d'erreur (workflow éteint : message clair, pas de double devis). | Jérôme + client |

## Ce qu'un éditeur client ne peut jamais faire

Choisir le `workflowId`, voir l'adresse du webhook, ou lancer un workflow d'un autre client. Plus tard, un écran de Réglages pourra seulement **allumer, éteindre et renommer** un bouton.

## À éviter (liste de `docs/actions-de-fiche.md`)

Mettre `workflowId` ou l'adresse du webhook dans la page ; envoyer le contenu de la fiche à n8n par la fonction ; accepter « n'importe quel POST » vers n8n (jamais `activate` ni `credentials`) ; confondre action demandée par une personne et proposition de l'IA (deux circuits, même journal) ; doublons de brouillons (un lancement en cours désactive le bouton quelques minutes) ; SIRET, RIB, tarif ou nom de banque dans le dépôt.

## Cas vide et cas d'erreur à prévoir dans chaque écran

- **Aucune action configurée** : aucun bouton, aucun espace vide.
- **Lancement en cours** : bouton désactivé, texte « Devis demandé ».
- **Workflow injoignable ou en erreur** : message clair avec « Réessayer », rien d'envoyé au client final, ligne dans le journal.
