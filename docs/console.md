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
   Précision du 27/11/2026 (demande de Jérôme) : un schéma générique qui ne nomme que des familles d'outils (Firestore, Cloud SQL, n8n, MCP), sans nom d'hébergeur de serveur, de projet, de compte, de secret ni de client, ne contrevient pas à ce garde-fou. Ses textes sont dans `js/modules/console/schema-textes.js`, vérifiés mot à mot par une liste blanche (`tests/statique.test.js`).
6. **Les fonctions de la Console existent seulement chez Jérôme** : chacune est déclarée dans `RESERVEES_JEROME` (`tests/ecarts-fonctions.test.js`) avec la raison « normal : outil d'exploitation de Jérôme, réservé par décision du 16/11/2026 », et une ligne dans `.github/A-FAIRE.md`. Le module n'a pas d'interrupteur chez un client : `modules.console` est refusé par le registre pour tout espace client.

## 3. Les droits Google

Le serveur de la Console lira les autres projets avec des **comptes dédiés en lecture seule** (base, informations des secrets, journaux, métriques), jamais avec un droit d'écriture ni de lecture de la valeur d'un secret. Leurs noms, leurs rôles et la façon de les utiliser sont écrits dans le second cerveau, pas ici : le dépôt est public (garde-fou 5).

## 4. Les écrans (onglets)

| Onglet | Contenu | Phase |
|---|---|---|
| Vue d'ensemble | Sélecteur de plateforme (première entrée « Toutes les plateformes », la plateforme est dans l'adresse), résumé du filet, schéma d'architecture figé (27/11), réponse du serveur ; plus tard nombre d'espaces, version déployée, alertes | 0, 1 |
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
2. **Secrets, versions, cercles** : carte des secrets avec ses trois alertes, version par espace. **Versions, PR 1 (28/11/2026)** : voir la section 11.
3. **Écritures** : activer ou désactiver un module chez un espace, lancer un déploiement par bouton (workflow GitHub). PR séparée, Fable obligatoire.
4. **Création d'un espace client en une commande, sauvegardes et restauration pilotées, export planifié.**

## 7. Tests

Budget **normal** (décision du 16/11/2026) : `npm run test:module console`, puis `test:rapide` et `test:smoke` avant la PR ; la suite complète tourne sur GitHub. Le test téléphone et `look-compact` (s'il y a du CSS) sont obligatoires.

## 8. Ce qui reste à faire par Jérôme

Rien pour la phase 0. Pour tester la phase 1 sur de vrais espaces : un jeton d'une heure (une commande, que Claude donnera à ce moment-là).

## 9. Non vérifié

Le nom exact des collections lues en phase 1 (`clients/<id>` et son champ `modules`) vient de `js/os/registre.js` et n'a pas été relu sur la vraie base ; la lecture d'une base depuis un autre projet Google par un compte dédié n’a pas encore été essayée.

## 10. Le village de la Console (décisions du 26-27/11/2026)

- Jérôme veut voir dans la Console ses plateformes comme des bâtiments, avec les beaux dessins 3D du village d'accueil : Chevalier IA OS = une maison, Chevalier IA App = un immeuble (un appartement par espace client, cliquable plus tard), chaque client qui a sa propre plateforme = une maison (avec une grue si elle est en construction), les plateformes à venir en grisé.
- Au-dessus de chaque bâtiment : son nuage de données. Le MCP = un téléphone relié directement au nuage. n8n tourne sur un serveur à part.
- Informations à afficher pour chaque bâtiment (plus tard, lues en direct par le serveur, jamais écrites dans le dépôt) : projet Google, Supabase, Cloud SQL, n8n, MCP, modules actifs, état (en service, en construction, à venir).
- **Étape A (27/11/2026)** : un schéma figé et générique, sans nom de client ni montant, dans Vue d'ensemble (`js/modules/console/schema.js`, sous le résumé du filet, affiché même si les données de la Console ne se chargent pas ; deux rangées quand la section est étroite). Tests A1 et A2 de `tests/e2e/console.spec.js`, et un test de `tests/statique.test.js` qui n'accepte que les mots d'une liste blanche dans ses textes.
- **Étape B (plus tard)** : les vrais noms et les vraies informations lus depuis la base par le serveur, visibles par Jérôme seul, dessins 3D, relecture Fable obligatoire.
- Les maquettes d'origine (avec les vrais noms) sont gardées en privé sur le Mac de Jérôme, hors du dépôt.

## 11. Versions des bâtiments (phase 2, PR 1 du 28/11/2026)

Un « bâtiment » est un projet Google qui fait tourner le code : le CRM de Jérôme, l'immeuble (la plateforme des clients : tous ses appartements ont la même version, donc UNE fiche pour tout l'immeuble), et plus tard chaque maison d'un client.

- **Le tampon** : toutes les heures, la fonction planifiée `tamponVersion` (des deux côtés, même code : `functions/src/coeur/tampon-version.js`) note dans la fiche `reglages_maison/version` du bâtiment : `version` (la vraie version de l'appli, `version.json`, copié dans `functions/partage/` par `scripts/preparer-fonctions.js`), `version_depuis`, `structure_code` (le numéro `STRUCTURE_DONNEES` de `functions/src/coeur/structure-donnees.js`) et `vu_le`. Quand la version ou la structure change, une ligne `{ version, de_version, structure_code, de_structure, le }` s'ajoute dans `reglages_maison/version/historique`. Rien d'autre n'est touché ; une erreur est seulement notée dans le journal du serveur. Le tampon n'écrit jamais `structure_base` : ce sera le travail du futur script de migration d'un bâtiment. Après un déploiement, le tampon apparaît dans l'heure. **La version affichée est celle du serveur** (la copie de `version.json` dans les fonctions), pas celle du site : elle n'est mise à jour qu'au déploiement des fonctions. Chez Jérôme, chaque fusion redéploie tout. Dans l'immeuble, `tamponVersion` part avec les choix « hosting », « tout » et « fonctions » du workflow « Déploiement plateforme clients » (choix « hosting » et « tout » : ajouté le 28/11/2026 pour que la version tamponnée suive toujours le site).
- **La lecture** : la fonction `consoleVersions` (Jérôme seul, même contrôle d'identité que `consoleEtat`, absente de l'immeuble) lit la fiche et les 10 derniers changements du CRM et de l'immeuble. Elle tourne avec le compte des automatisations, le seul qui lit l'immeuble aujourd'hui ; un compte dédié en lecture seule le remplacera. Une lecture qui échoue donne « inconnue » avec un motif, jamais une erreur pour tout l'écran. Si la version de référence (`version.json` du serveur qui répond) est illisible : « inconnue ». Si `vu_le` a plus de 3 heures : « inconnue », motif « le tampon ne répond plus depuis le … ». Juste après une fusion, le CRM (bâtiment courant) peut porter l'ancienne version jusqu'au prochain tampon : si son `vu_le` est antérieur au démarrage de l'instance qui répond, l'état est « en attente du prochain tampon (moins d'une heure) » au lieu de « en retard ».
- **L'écran** : Vue d'ensemble, bloc « Versions » sous le schéma : une ligne par bâtiment, sa version et depuis quand, « vu le … » (dernier tampon), « Version : à jour / en retard / inconnue » (comparée à la version du serveur qui répond), « Structure : à jour / en retard / inconnue » (`structure_base` comparé à `structure_code` : « inconnue » partout tant que le script de migration n'existe pas), et « Historique » qui déplie les 10 derniers changements (« structure 1 → 2 » quand seule la structure a changé). Un bâtiment sans tampon dit « Version inconnue : ce bâtiment n'a pas encore été remis en ligne avec le tampon. » ; une lecture impossible ou un immeuble non relié montre seulement son motif. L'export du module (Réglages > Console) ajoute ces versions.
- **Sécurité** : aucune règle Firestore n'a changé ; la fiche et son historique ne se lisent ni ne s'écrivent depuis un navigateur (tests RM-R3 et RM-P1).
- **Tests** : V1 à V8 dans `tests/console-versions.test.js`, V10 à V14 dans `tests/console.test.js` et `tests/e2e/console.spec.js`.
- **Plus tard** : les maisons des clients (fait, section 12), et le verrou `console_active` (PR séparée).

## 12. Registre privé des bâtiments et relevé horaire (phase 2, PR 2 du 28/11/2026)

- **Le registre** : la fiche privée `reglages_maison/registre_console` de la base de Jérôme liste les maisons des clients : `{ batiments: [ { cle, nom, genre: 'maison', etat: 'en_service' | 'en_construction' | 'a_venir', projets: [ { role, libelle } ], lecture_projet } ], projets_os, projets_immeuble }`. Le CRM et l'immeuble n'y sont pas (le serveur les connaît) ; `projets_os` et `projets_immeuble` donnent leurs projets. Fermée aux navigateurs (règle de `reglages_maison`, inchangée ; tests RM-R3). Validateur strict côté serveur (`functions/src/console/registre.js`, sans dépendance) : clés `os` et `immeuble` et doublons refusés, projet à lire au format d'un identifiant de projet Google, jamais celui du CRM ni celui de l'immeuble lié (quand l'appelant le connaît), et jamais le même pour deux maisons ; une entrée invalide est ignorée avec un motif sans valeur. Fiche absente = registre vide (cas normal tant qu'elle n'est pas remplie). Les vrais noms n'existent QUE dans cette fiche : jamais dans le dépôt.
- **Remplir le registre (Jérôme, depuis le Mac)** : écrire un fichier JSON privé hors du dépôt, puis `node scripts/console-registre.js --projet <projet du CRM> --fichier <chemin>` : le script valide le fichier avec le même validateur et affiche un résumé sans aucune valeur (essai à blanc). La même commande avec `--oui` écrit la version validée (compte `gcloud` de Jérôme, comme `scripts/donner-or-village.js`). Deux garde-fous avant d'écrire (finitions du 28/11/2026) : (1) le script lit la fiche `reglages_maison/maison` du projet donné et refuse s'il n'y trouve pas de projet lié (`projet_plateforme_lie` vide : ce n'est pas le CRM de Jérôme ; la valeur lue n'est jamais affichée, elle sert seulement à refuser une maison qui pointerait vers l'immeuble) ; (2) il refuse si la validation a retiré au moins une entrée ou s'il ne reste aucun bâtiment (la fiche serait vidée). Pour écrire quand même la version validée dans le cas (2), ajouter `--forcer` (`--oui --forcer`) ; `--forcer` ne lève jamais le garde-fou (1).
- **Le relevé horaire** : la fonction planifiée `consoleReleve` (toutes les heures, au quart, après les tampons de l'heure pile ; Jérôme seul, absente de l'immeuble) lit la fiche `reglages_maison/version` du CRM, de l'immeuble et de chaque maison qui a un projet à lire, 10 secondes au plus chacune, toutes en même temps, et en garde une copie dans la base de Jérôme : `reglages_maison/registre_console/releves/{cle}` (`version`, `structure_code`, `structure_base`, `version_depuis`, `dernier_contact_ok`, `dernier_essai`, `motif`) et, quand la version ou la structure change (et au premier relevé, avec `de_version` vide), une ligne dans `.../releves/{cle}/historique`. Jamais de suppression. Une maison illisible (droit de lecture pas encore donné, hors ligne) : seulement `dernier_essai` et le motif « injoignable », sans erreur. **Exception écrite à « lecture seule d'abord »** : `consoleReleve` écrit, mais uniquement dans la base de Jérôme (jamais dans l'immeuble ni dans une maison). Déployée aussi dans les maisons (même dossier `functions/`) : sans immeuble relié, elle sort sans rien écrire.
- **La lecture pour l'écran** : `consoleBatiments` (Jérôme seul, même contrôle que `consoleEtat`) rend le registre (sans le projet à lire), les appartements de l'immeuble (collection `clients` : nom, ou l'identifiant s'il manque, et modules actifs ; 30 au plus) et les relevés avec leurs 10 dernières lignes. Une partie illisible ou trop lente (10 secondes au plus pour les appartements, autant pour les relevés) = vide + motif, jamais une erreur pour tout l'écran. Les deux fonctions tournent avec le compte des automatisations (seul lecteur de l'immeuble), à remplacer par un compte dédié en lecture seule.
- **L'écran** : quand le registre répond, l'immeuble du schéma montre les vrais noms des appartements (3 au plus, « et N autres », « À venir ») et les maisons du registre remplacent « Maison client 1 » (grue si en construction, pointillés si à venir) ; « Maison à venir » reste en dernier. Sans réponse ou registre vide : le schéma figé, inchangé, et la phrase « Registre vide : les maisons s'afficheront quand la fiche privée sera remplie. » Sous le schéma, un vrai bouton par bâtiment et par appartement ouvre le détail (nom, état, projets, modules actifs, version, depuis, structure, dernier contact, motif, historique copié chez Jérôme ; « Fermer »). Un appartement montre la version et l'historique de l'immeuble. Erreur : message et « Réessayer ». L'export ajoute le registre et les relevés, avec seulement ce que l'écran montre (appartements : nom et modules ; relevés : les champs affichés ; jamais le projet à lire ni l'identifiant d'un appartement). Avec 1 ou 2 appartements, les étages partent du bas (le premier touche le sol) et « À venir » reste en haut.
- **Deux historiques** : celui du bloc « Versions » est lu en direct dans chaque bâtiment (tampon) ; celui du détail est la copie faite chez Jérôme par le relevé. Ils peuvent différer (un changement entre deux relevés, une maison injoignable, un relevé qui commence plus tard que le tampon).
- **À faire par Jérôme** : remplir la fiche privée (script ci-dessus) et donner au compte des automatisations le droit de lecture sur le projet de chaque maison. Sans ce droit, la maison reste « injoignable », sans erreur.
- **Tests** : R1 à R10 dans `tests/console-registre.test.js` (R5 et R7 sur l'émulateur), R11 à R14 dans `tests/e2e/console.spec.js`, RM-R3 dans `tests/regles.test.js`. Finitions (relecture Fable de la PR 771) : F1 à F6 et F8 dans `tests/console-finitions.test.js`, F7 et la capture F8 dans `tests/e2e/console.spec.js`.
