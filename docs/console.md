# Console : le module d'exploitation de Jérôme

Cahier des charges écrit le 16/11/2026, d'après les fiches du second cerveau du 15/11 (« Console d'exploitation » et « filet de sécurité de la plateforme clients »). **Décision de Jérôme du 16/11/2026 : la Console est un module de Chevalier IA OS** (et non un dépôt séparé comme prévu le 15/11), **accessible à Jérôme seul**. Ce document remplace l'option « dépôt séparé » pour la suite.

Le dépôt est public : ce document ne contient aucun secret, aucune valeur, aucune donnée de client. Il nomme des projets et des comptes de service parce qu'ils sont déjà écrits dans `docs/securite-et-pannes.md` et `docs/deploiement-plateforme.md`.

## 1. À quoi sert la Console

Gérer l'architecture : voir d'un coup d'œil les espaces qui existent, les modules actifs chez chacun, l'activité, les secrets et le filet de sécurité (sauvegardes, retour arrière, versions). Jérôme y pilote, plus tard, les activations et les déploiements.

## 2. Exception à la règle « même code chez Jérôme et chez les clients » (accordée le 16/11/2026)

Le code de la Console est dans le dépôt commun, mais **seul Jérôme y a accès** : ni un client, ni un éditeur, ni un lecteur, ni un jeton de bot, ni un assistant (même de profil `complet`). C'est l'esprit de la décision du 09/11 sur les réglages d'espace : le code est le même, l'accès est restreint. Garde-fous obligatoires :

1. **Contrôle de l'identité côté serveur, à chaque appel** (pas seulement un menu caché). Un seul compte est autorisé : celui de Jérôme, e-mail vérifié. Le compte du bot n'y est pas.
2. **Chaque cas est verrouillé par un test** : éditeur client, lecteur, jeton de bot, assistant d'un client, appel sans connexion.
3. **Lecture seule d'abord.** Les écritures (activer un module, déployer, créer un secret) arrivent en phases 3 et 4, chacune dans une PR séparée relue par Fable.
4. **Aucune valeur de secret n'est jamais lue ni affichée**, ni par le serveur, ni par l'écran, ni par un assistant.
5. **Aucune description de l'infrastructure dans le code** (le dépôt est public) : noms de secrets, comptes, projets clients sont lus en direct par le serveur, jamais écrits dans un fichier du dépôt.
6. **Les fonctions de la Console existent seulement chez Jérôme** : chacune est déclarée dans `RESERVEES_JEROME` (`tests/ecarts-fonctions.test.js`) avec la raison « normal : outil d'exploitation de Jérôme, réservé par décision du 16/11/2026 », et une ligne dans `.github/A-FAIRE.md`. Le module n'a pas d'interrupteur chez un client : `modules.console` est refusé par le registre pour tout espace client.

## 3. Les droits Google

Le serveur de la Console lira les autres projets avec des **comptes dédiés en lecture seule** (base, informations des secrets, journaux, métriques), jamais avec un droit d'écriture ni de lecture de la valeur d'un secret. Leurs noms, leurs rôles et la façon de les utiliser sont écrits dans le second cerveau, pas ici : le dépôt est public (garde-fou 5).

## 4. Les écrans (onglets)

| Onglet | Contenu | Phase |
|---|---|---|
| Vue d'ensemble | Sélecteur de plateforme (première entrée « Toutes les plateformes », la plateforme est dans l'adresse), résumé du filet, réponse du serveur ; plus tard nombre d'espaces, version déployée, alertes | 0, 1 |
| Espaces et modules | Tableau espaces × modules (champ `modules` de chaque espace), dépendances manquantes en alerte | 1 |
| Activité | Écritures du journal par jour, par module et par espace ; espaces silencieux depuis 7 jours | 1 |
| Secrets | Carte : nom, rôle, projet, dernière version, comptes ayant accès ; alertes manquant, orphelin, droit absent | 2 |
| Déploiements | Version par espace, cercles Jérôme / Bêta / Stable, historique, contrôle après déploiement, retour arrière | 2, 3 |
| Filet de sécurité | Check-list du 15/11 (sauvegarde restaurée, retour arrière essayé, second propriétaire, budget, guide « Jérôme indisponible »…) avec date de dernière vérification, rouge si trop ancienne | 0 |

## 5. Critères d'acceptation (un test chacun, nom du test = numéro)

- **C1** Un appel à la fonction de la Console sans connexion est refusé (« Connexion nécessaire »).
- **C2** Le compte de Jérôme, e-mail vérifié, est accepté ; le même e-mail non vérifié est refusé.
- **C3** Le compte du bot, un éditeur client, un lecteur, un jeton d'assistant sont refusés.
- **C4** Le menu « Console » n'apparaît que pour le compte de Jérôme ; chez un client il n'existe pas, et `modules.console: true` y est refusé.
- **C5** L'écran Filet de sécurité affiche la liste et la date de dernière vérification de chaque ligne ; une ligne trop ancienne est rouge.
- **C6** Cas vide : « Aucune vérification enregistrée » ; cas d'erreur : message lisible et bouton « Réessayer ».
- **C7** Aucune réponse du serveur ne contient la valeur d'un secret (test sur de fausses valeurs).
- **C8** Le sélecteur de plateforme change la plateforme dans l'adresse de la page et garde « Toutes les plateformes » en premier.
- **C9** Le bouton « Exporter mes données » du module exporte la check-list du Filet (règle du 27/10).
- **C10** L'écran tient sur téléphone sans défilement horizontal.

## 6. Phases (chacune utile seule)

0. **Cadre (fait le 16/11/2026)** : exception écrite, accès verrouillé et testé (fonction `consoleEtat`, menu et montage cachés aux autres comptes), deux écrans (Vue d'ensemble avec sélecteur de plateforme, Filet de sécurité de 7 vérifications que Jérôme date à la main dans la table `console_filet`), export des données. `consoleEtat` tourne avec le compte de service de la porte tant qu'elle ne lit rien : elle passera à un compte dédié en lecture seule en phase 1, avec l'autorisation de déploiement à lui donner en même temps (un compte sans cette autorisation ferait échouer le déploiement des fonctions).
1. **Lecture** : espaces, modules actifs, activité (lecture seule des deux projets, par un compte dédié en lecture seule).
2. **Secrets, versions, cercles** : carte des secrets avec ses trois alertes, version par espace.
3. **Écritures** : activer ou désactiver un module chez un espace, lancer un déploiement par bouton (workflow GitHub). PR séparée, Fable obligatoire.
4. **Création d'un espace client en une commande, sauvegardes et restauration pilotées, export planifié.**

## 7. Tests

Budget **normal** (décision du 16/11/2026) : `npm run test:module console`, puis `test:rapide` et `test:smoke` avant la PR ; la suite complète tourne sur GitHub. Le test téléphone et `look-compact` (s'il y a du CSS) sont obligatoires.

## 8. Ce qui reste à faire par Jérôme

Rien pour la phase 0. Pour tester la phase 1 sur de vrais espaces : un jeton d'une heure (une commande, que Claude donnera à ce moment-là).

## 9. Non vérifié

Le nom exact des collections lues en phase 1 (`clients/<id>` et son champ `modules`) vient de `js/os/registre.js` et n'a pas été relu sur la vraie base ; la lecture d'une base depuis un autre projet Google par un compte dédié n’a pas encore été essayée.
