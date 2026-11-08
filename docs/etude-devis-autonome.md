# Étude de faisabilité : le module Devis vendable seul

*Mise à jour du 05/11/2026 : décisions de Jérôme du 05/11 (ci-dessous) et PR faites (partie G, section J).* *Étude du 04/11/2026, demandée par Jérôme (priorité haute), **réécrite le 04/11/2026 (soir) après sa décision** (voir ci-dessous), **complétée le 04/11/2026 par la partie H (le menu de la plaquette : Devis, Clients, Catalogue, Relances, Statistiques) et la partie I (l'affichage par membre)**. **Mise à jour du 04/11/2026 (2e décision de Jérôme, plus récente que la PR 511) : le carnet `devis_clients` et la migration disparaissent ; les clients du devis sont de vraies fiches Personnes/Organisations, via un noyau « Contacts ». Cette décision REMPLACE celle du carnet de la PR 511. 3e mise à jour (même jour) : DEUX PORTAILS sur les mêmes données (partie I) au lieu d'une vue par membre, et la règle « finalisation exige l'affaire » est SUPPRIMÉE (partie C).** **Aucun code n'est écrit ici** : on vérifie ce qui existe, on dit ce qu'il faudrait changer, on propose un découpage en petites PR et on pose les questions à trancher. Chaque affirmation technique renvoie à un fichier et une ligne (état de `main` au 04/11/2026). Les chiffres d'exemple partent de 100 €.*

> **Mise à jour du 06/11/2026 (PR 544, étape 1 du portail)** : l'adresse est `portail-devis` (avec un **tiret**, pas un souligné), partout dans cette étude. Le portail est un **mode d'affichage de la coque** (`js/os/portail.js`), sans module ni règle. Le menu décidé par Jérôme le 06/11 prime sur les menus décrits plus bas : **Devis · Relances · Statistiques** + « + Devis » existant, plus « Espace complet » ; **pas d'entrée Clients ni Catalogue** (« Catalogue » reste un bouton de la liste). Relances et Statistiques arrivent avec leurs écrans (étapes 2 et 3). **Mise à jour du 07/11/2026** : l'écart « un client qui a Devis **et** Affaires doit choisir une affaire pour finaliser » est **supprimé** (décision de Jérôme, option A) : finaliser ne demande jamais d'affaire, un avertissement non bloquant s'affiche seulement quand le module Affaires est actif (partie C).

## La décision de Jérôme (04/11/2026), qui commande tout le reste

> « Quand un client n'a que le module Devis, on n'utilise ni CRM, ni Personnes/Organisations, ni Affaires, ni Projets. Une petite table stocke les noms de clients et les e-mails déjà tapés, pour l'auto-complétion dès les 3 premières lettres. On ne fait que ça : pas besoin de faire tourner Personnes, Organisations, Affaires, Projets en tâche de fond. La règle « un devis ne peut pas exister sans affaire » s'affine : si le module Affaires existe, un devis ne peut pas exister sans affaire ; si le module Devis est seul, un devis peut exister seul, puisque Affaires n'existe pas. »

> **2e décision de Jérôme (04/11/2026, remplace le carnet ci-dessus)** : « Pas de systèmes de migration. Le plombier voit son affichage de devis ; sa secrétaire, si le module Affaires est acheté, a une autre interface avec aussi les affaires et les projets. La MÊME base de données derrière, seul l'affichage change. Le CRM minimal vit dans le vrai CRM. On utilise tout de suite les vraies bases. » Elle l'emporte sur tout passage de cette étude qui parle encore d'un carnet à part.

> **3e décision de Jérôme (04/11/2026)** : (A) pas d'affichage par utilisateur mais **deux portails sur les mêmes données** (le portail actuel, et un second à une autre adresse qui n'affiche que Devis · Clients · Catalogue · Relances · Statistiques) ; (B) « pas de devis finalisé sans affaire » est **supprimée partout** (le plombier ne connaît même pas les affaires).

> **Décisions de Jérôme du 05/11/2026** : chaque module est vendable et utilisable seul ; aucun module n'en exige un autre ; tous s'appuient sur un **socle commun minimal** (fiches Personnes et Organisations + journal), toujours présent, invisible, jamais appelé « CRM » à l'écran ; achat ultérieur d'Affaires ou Projets = on AJOUTE des modules, aucune migration ; deux portails sur les mêmes données ; la liste des devis est la page d'arrivée du portail Devis (Statistiques en 5e entrée : *Décision prise seul : deux réponses de Jérôme se contredisaient (Statistiques ou liste en arrivée) ; on garde la liste, une ligne à changer s'il préfère l'inverse*, remplace la question restante du point 7 de l'état des décisions) ; « Projets sans Affaires » plus tard ; recette sur un client de démonstration (`clientdemo`, `docs/donnees-demo.md`), jamais l'espace de Jérôme. Le « noyau Contacts » de la version du 04/11 est ce socle.

Ce que cela change par rapport à la première version de l'étude (les décisions 4 et 5 deviennent **caduques** : plus d'affaire cachée, donc plus de question de rangement à l'achat) :

- **Le module Devis ne dépend plus d'Affaires**, mais d'un **noyau « Contacts » léger** (personnes et organisations seulement, sans les écrans ni les écouteurs d'Affaires et de Projets) : voir D.
- **Plus de carnet à part** (2e décision) : le client saisi est une **vraie fiche minimale** du CRM.
- **La règle de finalisation s'affine** (décision 3 précisée) : l'affaire n'est exigée que si le module Affaires est actif.

## Résumé (lisible sans connaître le code)

1. **Le but** : vendre le module Devis seul à un artisan : il voit ses devis, ses clients, son catalogue, ses relances et ses statistiques, **sans** Affaires ni Projets, avec **la même base de données** que le CRM complet.
2. **Deux portails, un seul jeu de données (partie I)** : le portail actuel (tous les modules achetés, pour la secrétaire) et un portail **Devis**, à `#/espace/<client>/portail-devis`, qui n'affiche que Devis · Clients · Catalogue · Relances · Statistiques. Même site, même connexion, même base. Ce n'est qu'une **route du routeur** (`portail-devis`, nom tranché par Jérôme) : **aucun changement de `firebase.json`**.
3. **Aujourd'hui c'est refusé par le code** : le module Devis déclare qu'il ne peut pas marcher sans Affaires (`js/os/registre.js:134`, refus dans `verifierActivation`, l.322-336).
4. **L'obstacle, plus petit que prévu** : `js/modules/devis/donnees.js:10` importe la couche de données du CRM et `demarrer()` (l.107-109) en dépend. On ajoute un **mode « noyau »** de `CRM.demarrer` qui n'écoute que `crm_personnes` et `crm_organisations` (PR 1).
5. **Les clients du devis sont de vraies fiches** (Personnes / Organisations, fiche minimale), écrites par la couche CRM existante et son journal. **Aucune collection nouvelle, aucune règle Firestore nouvelle** (vérifié : le joker de `firestore.plateforme.rules:182-184` suffit), **aucune migration**, aucun outil MCP nouveau (sept outils existants déplacés dans le module Contacts).
6. **La règle « finalisation exige l'affaire » est supprimée** (partie C) : un devis se finalise toujours, avec ou sans affaire. Dans le portail complet : filtre « Devis sans affaire » et bouton « Créer une affaire depuis ce devis » pour rattacher plus tard. Les montants par affaire ne comptent que les devis rattachés ; le chiffre d'affaires global compte tous les devis. Plus rien à passer au serveur sur « Affaires actif ».
7. **Le menu de la plaquette (partie H)** : **Devis · Clients · Catalogue · Relances · Statistiques**. *Relances* = devis envoyés sans réponse depuis N jours (10 par défaut), brouillon d'e-mail de relance (jamais d'envoi), tracée comme une ligne d'envoi de plus. *Statistiques* = chiffres de tous les devis (règle de la PR 510 : archivé compte).
8. **Honnêteté** : ce sont deux portes d'**affichage**, pas de la confidentialité entre membres (les règles Firestore sont par rôle et par collection).
9. **Ce qui ne change pas chez Jérôme** : ses données et son écran complet (règle du 18/10/2026 : même code).
10. **Découpage proposé : 13 PR**, 11 exigent la relecture Fable (1 à 8, 10, 11, 12), 2 non (9, 13). **Aucune PR de règles Firestore, de migration ni de `firebase*.json`.** À ne pas promettre à un client : envoi direct à un logiciel de facturation, familles libres, agent autonome, branchement à Pipedrive ou Salesforce, cloisonnement des données entre membres.

---

## A. État des dépendances (vérifié)

### A.1 Devis → CRM (le sens qui compte)

`js/modules/devis/` contient **54 fichiers**. Mesures du 04/11/2026 (`grep` sur `from '../crm/`, `from '../projets/`, `from '../../os/`) :

| Mesure | Résultat |
|---|---|
| Fichiers du module Devis qui importent `../crm/` | **23** sur 54 (38 lignes d'import ; la note du brief disait 37, c'est 38 en comptant l'import sur deux lignes d'`articles.js:16`) |
| Fichiers qui importent `../projets/` | **0** |
| Fichiers qui importent `../../os/` | **27** (42 lignes d'import) |

Les 23 fichiers, par rôle :

- **Données du CRM** (`import * as CRM from '../crm/donnees.js'`) : `actions-devis.js:6`, `donnees.js:10`, `editeur-ecran.js:15`, `email-preparer-ecran.js:7`, `index.js:14`, `liste-ecran.js:8`, `onglet-affaire.js:9`, `recherche.js:3`, `reglages.js:5`. C'est la couche qui écoute Firestore (`crm_personnes`, `crm_organisations`, `crm_affaires`…) et écrit avec le journal (`executer`). **Le module Devis écrit même ses brouillons par `CRM.executer`** (`js/modules/devis/donnees.js:304`).
- **Règles pures du CRM** (`../crm/logique.js`) : `affaire-depuis-devis.js:3`, `articles.js:16`, `brouillon.js:5`, `champ-famille.js:6`, `client-devis.js:4`, `editeur-ecran.js:13-14`, `export.js:5`, `logique.js:20`, `selecteur-catalogue-logique.js:3`, `usage.js:3`, `vocabulaire.js:6`, `vocabulaire-ecran.js:9`, `vocabulaire-plans.js:6`, `recherche.js:5`. Ce sont des outils génériques (normaliser un texte, écriture avec journal), pas des écrans de CRM.
- **Composants d'écran du CRM** (`../crm/composants.js`, `filtres.js`, `activites.js`, `personnes.js`, `organisations.js`, `pastilles-externes.js`) : `bordereau.js:6-7`, `editeur-ecran.js:12,23-24`, `liste-ecran.js:5-6`, `vocabulaire-ecran.js:7-8`, `export.js:4`, `onglet-affaire.js:8`, `origine.js:5`, `actions-devis.js:8`, `index.js:15`.

Conséquence : **le module Devis ne peut pas démarrer sans la couche de données du CRM** (`js/modules/devis/donnees.js:107-109` refuse même de démarrer si le chemin de base ne correspond pas à celui du CRM : « Le module Devis doit utiliser le même chemin de base que les affaires »). C'est le fait central de la partie D.

Les sélecteurs de client se trouvent dans `js/modules/crm/composants.js:349` (`selecteurOrganisation`) et `:378` (`selecteurPersonne`). L'éditeur du devis, lui, n'utilise pas ces deux sélecteurs pour « Pour qui est ce devis ? » : il fabrique son propre champ (`js/modules/devis/editeur-ecran.js:1043-1077`, `champClientIntelligent`), qui propose trois groupes (Personnes, Organisations, Affaires) et, si rien ne correspond, « + Créer la personne » / « + Créer l'organisation ». Les deux sélecteurs servent à d'autres endroits du CRM.

### A.2 CRM et Projets → Devis (le sens inverse)

Le CRM **ne connaît aucun autre module** : il expose des crochets que le module Devis remplit en démarrant (`js/modules/devis/index.js:50-62`) et vide en s'arrêtant.

| Crochet (`js/modules/crm/pastilles-externes.js`) | Utilisé par | Effet si le module Devis est absent |
|---|---|---|
| `inscrirePastilleAffaire` / `pastillesDeAffaire` (l.7-20) | `composants.js:547` (carte Kanban) | pas de pastille « Devis : … » |
| `inscrireOngletAffaire` / `ongletsDeAffaire` (l.22-46) | `activites.js:251` (fiche d'affaire) | pas d'onglet « Devis » |
| `inscrireActionAffaire` / `actionDeAffaire` (l.47-62) | `fiche-affaire.js:104` | pas de bouton « Créer un devis » |
| `surChangementPastilles` | `affaires.js:346`, `fiche-affaire.js:225` | rien à redessiner |

Le montant d'une affaire a deux sources : `montantDevisHt` (écrit par le serveur d'après les devis) sinon `montant` (saisi à la main) : `js/modules/crm/logique.js:597-610`. Les mentions « module absent » (`logique.js:598`, `fiche-affaire.js:77`) parlent du **module Devis absent vu depuis l'affaire** (le montant est alors saisi à la main). Elles ne concernent pas notre cas, qui est l'inverse (Devis présent, Affaires absent). Détail du calcul : `docs/montant-affaire.md`.

**Projets** : aucun import ni usage du module Devis dans `js/modules/projets/` (un seul commentaire, `projets/export.js:2`). Le module Projets dépend d'Affaires (`registre.js:113`), pas de Devis. « Devis seul » n'a donc **aucun lien à gérer avec Projets**.

### A.3 Serveur

Le serveur lit les collections du CRM *directement*, sans passer par le registre des modules :

- `functions/src/coeur/devis.js:134-144` (`montantDeLAffaire`, lit et écrit l'affaire d'un devis), `:162` (lit la fiche du client à la finalisation) ;
- `functions/src/coeur/metier.js:931-934` (`creerDevisBrouillon` : l'affaire est facultative, le client vient de l'affaire s'il n'est pas donné) ; `:1252-1263` (`creerDevisDepuisModele`) ;
- autres fichiers du serveur qui lisent personnes, organisations ou affaires : `coeur/devis-email.js`, `documents.js`, `donnees.js`, `ecriture.js`, `lecture.js`, `restaurer.js`, `devis/pdf-service.js` ; le PDF est rangé sous `devis/<affaire>/<devis>/…` avec le repli `'sans-affaire'` (`functions/src/devis/stockage.js:63`).

Copies faites par `scripts/preparer-fonctions.js` dans `functions/partage/` : `logique.js` (le **CRM entier**, `scripts/preparer-fonctions.js:12`), `projets.js`, `devis.js`, `devis-articles.js`, `devis-ouvrages.js`, `devis-familles.js`, `registre.js`, `marque.js`, `chemins.js`, `membres.js` (l.88) et d'autres (vocabulaire, e-mail, brouillon, éditeur, document, numéros). Le serveur applique donc **exactement les mêmes règles que l'écran**, y compris `erreursFinalisation`.
Les dossiers `coeur`, `mcp`, `oauth`, `securite`, `clients` sont copiés tels quels dans `functions-plateforme/serveur/` (même script, `scripts/preparer-fonctions.js:98`, et `:105-108` pour les copies de `partage/`) : **tout changement du serveur partagé arrive chez les clients au déploiement « fonctions » + « mcp »** (lancé par Jérôme).

### A.4 MCP (outils de l'assistant)

- Les outils proposés à un client sont ceux des **modules actifs** : `functions/src/clients/gestionnaire.js:15-23` (`outilsDesModules`), modules actifs lus par `functions/src/clients/espaces.js:19` via la copie `functions/partage/registre.js`.
- Le module `devis` déclare 26 outils (`registre.js:133`) ; **les outils pour retrouver ou créer un client appartiennent au module `affaires`** : `chercher`, `lire_personne`, `lire_organisation`, `creer_personne`, `creer_organisation`, `modifier_personne`, `modifier_organisation`… (`registre.js:86-93`). Un client « Devis seul » n'aurait donc **aucun moyen** de désigner un client à son assistant (`creer_devis_brouillon` demande un `organisationId` ou un `personneId`) : on déclare les sept outils utiles dans le module Contacts (D.4).
- Le texte de `creer_devis_brouillon` dit que l'affaire est **facultative** et que la finalisation l'exige (périmé le 07/11/2026 : le texte dit maintenant qu'elle ne l'exige plus) (`functions/src/mcp/outils/ecriture.js:184`) ; `chercher` renvoie aussi des affaires (`lecture.js:~13-20`, paramètre `types`).

### A.5 Règles Firestore

`firestore.rules` (Jérôme) et `firestore.plateforme.rules` (clients) décident par **rôle et par collection**, jamais par module actif (le mot `modules` n'y apparaît que pour la fiche `clients/<client>`, `firestore.plateforme.rules:41-44`). Pour `devis_devis` : un brouillon neuf doit avoir `statut=brouillon`, `numero` vide, `version=1` (`firestore.rules:71-74`) ; rien n'oblige ni n'interdit `affaireId`. **Aucune règle ne change, aucune n'est ajoutée** (2e décision, partie B : pas de collection nouvelle).


### A.6 Exports (règle « chaque module a son bouton d'export »)

- L'export du module Devis contient ses cinq collections : `js/modules/devis/donnees.js:287` (`devis_articles`, `devis_parametres`, `devis_devis`, `devis_vocabulaire`, `devis_usage_articles`).
- L'export complet (Réglages > section CRM) et les contacts `.vcf` appartiennent à l'écran du CRM : `js/modules/crm/export.js:8`, test `tests/e2e/parcours.spec.js:718` (C19, liste des collections attendue).
- En « Devis seul », les clients sont de vraies fiches. Le socle n'a pas d'écran (PR 524), donc pas de bouton « Contacts » : les trois collections de `SOCLE.collections` (`crm_personnes`, `crm_organisations`, `crm_evenements`) entrent dans l'export du module Devis (06/11/2026, test C19 inchangé).

### A.7 Recherche, « + », accueil, statistiques

- Barre « + » : `js/os/shell.js:282` rassemble les `actionsRapides` de **tous** les modules montés. Comme le CRM n'est plus monté en « Devis seul », ses entrées (Personne, Organisation, Affaire : `js/modules/crm/index.js:33-37`) n'apparaissent plus d'elles-mêmes ; Devis garde les siennes (`devis/index.js:36-38`).
- Recherche globale : `shell.js:289-296` fusionne les groupes que chaque module rend ; sans le CRM, il ne reste que le groupe des devis.
- Premier écran : `premiereRoute(actifs)` = premier écran du premier module actif (`registre.js:353`) ; sans `affaires`, ce sera donc `devis/liste` **sans rien coder de plus** (à confirmer par un test dans la PR 2).
- Accueil et objectifs : l'Accueil (`crm/accueil`) et les indicateurs vivent dans le module Affaires ; « Devis seul » n'a **pas l'Accueil du CRM**. **Mis à jour le 04/11/2026 (plaquette)** : il aura à la place un écran **Statistiques** calculé sur les seuls devis et un écran **Relances** (partie H) ; la liste des devis reste son premier écran.

---

## B. Les clients du devis : de vraies fiches, via un noyau « Contacts »

**Décision de Jérôme (04/11/2026, plus récente que la PR 511 : elle REMPLACE la décision du carnet d'adresses).** *« Pas de systèmes de migration. Le plombier voit son affichage de devis ; sa secrétaire, si le module Affaires est acheté, a une autre interface avec aussi les affaires et les projets. La MÊME base de données derrière, seul l'affichage change. Le CRM minimal vit dans le vrai CRM. On utilise tout de suite les vraies bases. »*

**Ce qui disparaît** : la collection `devis_clients` (le carnet), sa règle Firestore, ses quatre outils MCP, sa 6e collection d'export et la migration du carnet vers de vraies fiches. **Ce qui la remplace** : le client saisi dans un devis est écrit comme **vraie fiche Personne ou Organisation** (`crm_personnes` / `crm_organisations`), **fiche minimale** : nom, e-mail, téléphone, adresse (et le repère `test` du mode test, posé par l'écran via `avecModeTest`, `js/os/mode-test.js:36-39`). C'est la couche d'écriture existante qui le fait (`CRM.creerPersonne`, `CRM.creerOrganisation`, `js/modules/crm/donnees.js:358,402`, avec le journal `crm_audit`).

**Comportement** (le champ « Pour qui est ce devis ? » ne change pas pour l'utilisateur) :
1. **Auto-complétion dès 3 lettres** sur les fiches existantes (nom, e-mail).
2. **Création à la volée** : un client nouveau tapé dans le devis devient une fiche minimale (doublons vérifiés par les outils de texte du CRM, `js/modules/crm/logique.js`, pur).
3. **Un seul lieu pour retrouver ses clients** : l'écran « Clients » du menu (H.2) = les vraies fiches. Le plombier peut en modifier ou supprimer ; un devis garde ses champs figés (nom, adresse, destinataires), un devis finalisé ne change jamais.
4. **Rien à migrer** : si le client achète Affaires plus tard, les fiches sont **déjà les vraies** ; la secrétaire les retrouve dans Personnes et Organisations, avec leurs affaires et projets.

**Règles Firestore : rien à changer (vérifié).** `firestore.plateforme.rules:182-184` : un joker (`/clients/{client}/{collection}/{reste=**}`) laisse **lire** tout membre (éditeur ou lecteur) et **écrire** l'éditeur, pour toute collection qui n'est ni les membres, ni les compteurs de devis, ni les documents stockés, ni le journal des workflows, ni le tableau de bord, ni les collections sans suppression, ni les devis. `crm_personnes`, `crm_organisations` et `crm_audit` ne sont dans aucune de ces exceptions : un **éditeur** les écrit, un **lecteur** les lit seulement. Comme c'est exactement ce que fait le CRM aujourd'hui chez les clients, **la PR « règles » de la liste d'arrêt disparaît**. (À reconfirmer dans le fichier `firestore.rules` de Jérôme au codage de la PR 1 ; non relu ici.)

**Ce que le devis stocke** : inchangé, `organisationId` ou `personneId` (`editeur-ecran.js:1030`) ; le serveur lit la fiche à la finalisation (`functions/src/coeur/devis.js:162`) et `creer_devis_brouillon` demande déjà un `organisationId` ou un `personneId` (`metier.js:933`) : **plus aucun « client libre » à inventer**, c'est un avantage de cette décision.

**Journal** : tout passe par `CRM.executer` (journal `crm_audit` et copie « avant »), donc rien de nouveau à écrire ; les valeurs reçues sont gardées comme partout (décision de Jérôme du 04/10/2026, aucune mesure RGPD).

**Ce que la fiche minimale n'a pas** (volontairement, c'est de l'affichage) : l'artisan ne voit pas les liens avec les affaires, les activités ni les notes ; ils existent dans la base, la secrétaire (si Affaires est acheté) les voit.

---

## C. La règle « finalisation exige l'affaire » est SUPPRIMÉE

**Fait le 07/11/2026 (PR 1 « finaliser sans affaire partout »)** : décision de Jérôme (option A) : l'obligation disparaît PARTOUT (Jérôme, client avec Affaires, Devis seul : un seul comportement), l'option `affaireRequise` de la 526 est supprimée, et un avertissement NON bloquant (« Ce devis n'a pas d'affaire : il n'apparaîtra dans aucune fiche d'affaire ni dans son montant. Tu pourras lui choisir une affaire plus tard. ») s'affiche seulement quand le module Affaires est actif : panneau des totaux, fenêtre « Finaliser ce devis ? », champ `avertissement` de l'aperçu de `finaliser_devis` et de `lire_devis`. Cela annule la réponse « conditionnelle » du 06/11 et revient à la 3e décision du 04/11.

*Point tranché en PR 2 (08/11/2026, décision prise seule D1) :* un devis dont l'affaire a été supprimée (`affaireId` orphelin) compte comme « Sans affaire » partout où l'écran a les affaires sous la main (filtre, cellule de la liste, bouton « Choisir l'affaire ») ; le serveur permet le rattachement. Une affaire archivée n'est pas orpheline.

**Décision de Jérôme (04/11/2026, 3e décision, remplace l'affinage de la PR 511 et le champ « affaire seulement si Affaires est actif »).** *La règle « pas de devis finalisé sans affaire » est supprimée partout (le plombier ne connaît même pas les affaires) : un devis se finalise toujours, avec ou sans affaire.* Les PR 4a/4b et la décision 5 de la première étude (affaire cachée) restent supprimées. **Plus besoin de dire au serveur si « le module Affaires est actif »** : l'option `affairesActif`, le passage des modules actifs jusqu'au contexte `ctx` et la PR qui les portait **disparaissent**.

### C.1 Ce qui verrouille la règle aujourd'hui (vérifié) et qui est à retirer

| Endroit | Ligne | À faire |
|---|---|---|
| ✅ *fait le 07/11 (PR 1)* Règle pure | `js/modules/devis/logique.js:824` (`if (!devis.affaireId) erreurs.push(MESSAGE_AFFAIRE_MANQUANTE)`), constante l.797, table des champs l.877 | retirer le contrôle ; garder les autres erreurs ; la constante ne sert plus |
| ✅ *fait le 07/11 (PR 1)* Écran (finalisation) | `editeur-ecran.js:2195` (appel), `:2306` (`sansAffaire = locales.includes(MESSAGE_AFFAIRE_MANQUANTE)`), `client-devis.js:8-9` (« Choisis ou crée une affaire pour finaliser ce devis. »), `affaire-depuis-devis.js` (« Finaliser un devis sans affaire : l'application crée l'affaire », décision du 30/10/2026) | finaliser n'ouvre plus de fenêtre « crée l'affaire » ; l'affaire reste un **choix facultatif** |
| ✅ *fait le 07/11 (PR 1)* Serveur (écran) | `functions/src/coeur/devis.js:163` | aucun changement de signature ; l'erreur disparaît |
| ✅ *fait le 07/11 (PR 1)* Assistant | `functions/src/coeur/metier.js:1358` (`finaliser_devis`), `lecture.js:455` (erreurs listées par `lire_devis`), textes d'outils `functions/src/mcp/outils/ecriture.js:184,192,220` | retirer « la finalisation exige l'affaire » des descriptions |
| ✅ *fait le 07/11 (PR 1)* Tests | `tests/devis-logique.test.js:410-416` (bloc SA), `tests/devis-mcp.test.js:1190-1211` (SA1, SA2 : message « Choisis l'affaire de ce devis. »), `tests/devis-serveur.test.js:525` (bloc SA : `devisFinaliser` refuse), `tests/e2e/devis-sans-affaire.spec.js`, `devis-nouveau-sans-blocage.spec.js` | **inverser** : un devis sans affaire se finalise (palier complet : étiquette `tests-complets`) |
| ✅ *fait le 07/11 (PR 1)* Docs | `docs/consignes-ui.md:53` (« Finaliser exige l'affaire »), `docs/cadrage-devis.md:48` (« le devis est rattaché à une affaire »), `docs/montant-affaire.md` (devis sans affaire) | mises à jour **dans la PR de code** (règle du 29/10/2026 : pas de PR de docs séparée) |

*Périmé le 07/11/2026 (option A : un devis finalisé existe sans affaire partout ; question tranchée).* *Décision prise seul :* un brouillon et un devis finalisé peuvent exister sans affaire : un brouillon, oui ; un devis finalisé sans affaire : seulement sans Affaires (526) (règle du 18/10/2026 : même code). L'invitation « Choisis ou crée une affaire » (`client-devis.js:8`) est **retirée du portail Devis** et **gardée en suggestion non bloquante dans le portail complet** (jamais une erreur de finalisation). *Question restante pour Jérôme :* la garder aussi dans le portail complet, ou la retirer partout ?

### C.2 Ce qui reste vrai

- **Montants par affaire** : ne comptent que les devis rattachés ; sans affaire, le calcul ne fait rien (`functions/src/coeur/devis.js:134-137`, « pas d'affaire = null ») : inchangé. **Le chiffre d'affaires global** (Statistiques, partie H.5) se calcule sur **tous** les devis, rattachés ou non.
- **PDF** : rangé sous `devis/sans-affaire/<devis>/…` (`functions/src/devis/stockage.js:63`) : c'est un chemin **normal**, plus un cas particulier ; à confirmer par un test.
- **Numérotation** : inchangée (`devis_compteurs/global`, `devis.js:26`).
- **Mode test** : les fiches et les devis créés en mode test portent le repère ; rien à rattacher.

### C.3 Rattacher un devis à une affaire plus tard (portail complet) — **FAIT le 08/11/2026 (PR 2)** : fonction du serveur `choisirAffaire` (`devisChoisirAffaire`), bouton « Choisir l'affaire », filtre « Sans affaire »

- **Un filtre « Devis sans affaire »** dans la liste des devis du portail complet (la liste écrit déjà « Sans affaire » sous le client, `liste-ecran.js:64`).
- **Le bouton existant « Créer une affaire depuis ce devis »** (`affaire-depuis-devis.js`) rattache le devis ; ce n'est **pas une migration** : c'est un geste de l'utilisateur, un devis à la fois.
- **Point à vérifier au codage (non fait ici)** : un devis **finalisé** est intouchable pour le navigateur (règles : seul le brouillon s'écrit, `firestore.plateforme.rules:74-90`). Rattacher un devis déjà finalisé demande donc probablement **une fonction du serveur** (journal, et recalcul du montant de l'affaire dans la **même transaction**, comme `devis.js:194,227,283`). C'est la PR 4 (serveur, données : Fable obligatoire) ; si elle existe déjà, la PR devient « tests + docs ».

---

## D. Interrupteur de modules et couche de données

### D.1 Ce que fait le registre aujourd'hui

- Les modules sont déclarés dans `js/os/registre.js` (`MODULES_DECLARES`). Les modules actifs d'un client viennent du champ `modules` de sa fiche `clients/<client>` (`modulesActifsDuClient`, l.340) ; l'interrupteur `crm` allume `affaires` **et** `projets` (`INTERRUPTEURS`, l.249).
- Le module `devis` déclare `dependances: ['affaires']` (l.134) et `verifierActivation` (l.322-336) refuse un module dont une dépendance n'est pas active. **« Devis seul » est donc refusé aujourd'hui.**
- **Tests qui verrouillent cela** : `tests/registre.test.js:40-44` ne vérifie que l'ordre des dépendances et « projets exige affaires » (il ne dit rien de devis) ; `tests/e2e/modules-client.spec.js` n'a **aucun cas « devis seul »** (R5, l.124, est « projets sans affaires »). → **tests à adapter / à ajouter** (un cas « devis seul » dans chacun).
- Même lecture des deux côtés : écran (`js/os/espace.js:121`) et serveur (`functions/src/clients/espaces.js:19`, via la copie `functions/partage/registre.js`). `functions/src/clients/config.js` ne contient **pas** la liste des modules.
- Le module `affaires` regroupe **tout le CRM** (écrans Accueil, Personnes, Organisations, Affaires ; 7 collections `crm_*` plus `documents_stockes` ; 32 outils MCP). **On ne peut pas cacher « les Affaires » sans cacher aussi les Personnes** : c'est un seul module, et en « Devis seul » on ne le monte pas du tout.

### D.2 Option retenue : un petit noyau « Contacts », sans les écrans ni les écouteurs d'Affaires et de Projets

La décision du 04/11/2026 (partie B) remplace l'idée d'un module Devis « sans aucun CRM » : le module Devis a besoin des **vraies fiches Personnes et Organisations**, mais **pas** des affaires, des activités, des notes ni des projets.

| | Option 1 : Affaires allumé mais masqué | Option 2 (PR 511) : aucun CRM, carnet à part | **Option 3 retenue : noyau « Contacts » léger** |
|---|---|---|---|
| Idée | tout le CRM tourne, on masque | `devis` sans CRM, collection `devis_clients` | un module `contacts` (personnes + organisations) ; `devis` en dépend ; `affaires` en dépend aussi |
| Données | vraies | à part (puis migration) | **les vraies, tout de suite** |
| Écouteurs Firestore | tous | aucun du CRM | **seulement `crm_personnes` et `crm_organisations`** |
| Statut | écartée | **abandonnée (04/11/2026, 2e décision)** | **retenue** |

### D.3 L'obstacle, réétudié : un découpage plus modeste

Constat (vérifié) : `js/modules/devis/donnees.js:10` importe `../crm/donnees.js`, `demarrer()` (l.107-109) refuse un chemin de base différent de `CRM.cheminDeBase()` et écrit par `CRM.executer`. **Importer** ce fichier ne démarre rien : seuls ses écouteurs coûtent. Or `CRM.demarrer` (`crm/donnees.js:170-215`) en lance six : `crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_activites` (via `ecouter`) et `crm_parametres` (réglages, étapes, filtres).

Le découpage **modeste** : une option `noyau: true` pour `CRM.demarrer` qui ne lance **que** les écouteurs des personnes et des organisations (et garde `compte` et `cheminBase`, dont `executer` a besoin). Le module `contacts` appelle `D.demarrer(..., { noyau: true })` ; le module `affaires`, s'il est actif, démarre en complet **à la place** (une seule fois, jamais deux jeux d'écouteurs). Le module Devis garde ses imports : **son code ne change presque pas**, ce qui diminue beaucoup le risque de la PR 1 de la première étude (le journal et le chemin de base n'ont plus à être déplacés).

À vérifier au codage (non fait ici) : `creerPersonne` utilise-t-elle `ctx()` et les réglages (`etat.config`, `crm_parametres`) pour des champs obligatoires ou des options ? Si oui, des valeurs par défaut suffisent sans écouter `crm_parametres`. Les 23 fichiers du module Devis qui importent `../crm/` (A.1) restent inchangés ; ceux qui lisent `CRM.etat.affaires` (`onglet-affaire.js`, `editeur-ecran.js`, `liste-ecran.js`) doivent supporter une liste d'affaires **vide** (l'état d'un noyau).

### D.4 Ce que chaque endroit devient en « Devis seul »

| Endroit | Aujourd'hui | En « Devis seul » | Où |
|---|---|---|---|
| Lecture des modules actifs | `verifierActivation` refuse | accepte `devis` + `contacts` sans `affaires` | `registre.js:322-336` |
| Montage des modules | un module par module actif | monte Devis et le noyau Contacts ; **Affaires et Projets ne sont pas montés** | `espace-modules.js:22-27` |
| Menu | un bloc par module actif | selon le portail (partie I) : **Devis · Clients · Catalogue · Relances · Statistiques** (partie H) | `registre.js:389-422` |
| Premier écran | `crm/accueil` | `devis/liste` | `registre.js:353`, `espace-modules.js:32` |
| Bouton « + » | Personne, Organisation, Affaire, Devis | Devis, Client | `shell.js:282` |
| Recherche globale | Personnes, Organisations, Affaires, Devis | Clients, Devis | `shell.js:289-296` |
| Champ « Pour qui est ce devis ? » | trois groupes (Personnes, Organisations, Affaires) | deux groupes (Personnes, Organisations) ; la ligne Affaire est **retirée** | `editeur-ecran.js:1043-1110` |
| Liens croisés | vers fiche personne / organisation / affaire | vers la fiche du client ; pas de lien d'affaire | `editeur-ecran.js:12`, 828-829 |
| Réglages | section CRM + Devis | Devis + une section « Clients » (sauvegarde) | `js/os/reglages.js:166` |
| Export | « Exporter mes données » (5 collections de Devis) | + un bouton du module Contacts (personnes, organisations) | `devis/donnees.js:287`, PR 8 |
| Outils de l'assistant | filtrés par module actif | 26 outils Devis + les outils Contacts (ci-dessous) | `clients/gestionnaire.js:15-23` |
| Accueil, statistiques | dans le module Affaires | pas d'Accueil CRM ; **Statistiques** et **Relances** de devis (partie H) | `crm/index.js` ; `js/modules/devis/` |

**Outils MCP d'un profil « Devis seul »** : les outils pour retrouver, lire, créer et modifier un client **existent déjà** (module `affaires`, `registre.js:86-93`) : `chercher`, `lire_personne`, `lire_organisation`, `creer_personne`, `creer_organisation`, `modifier_personne`, `modifier_organisation` (sept le 05/11 ; neuf depuis le 06/11 avec `marquer_test` / `demarquer_test`). *Décision prise seul :* les **déclarer dans le module `contacts`** (que `affaires` et `devis` exigent) plutôt que d'en écrire de nouveaux ; `supprimer_personne`, `supprimer_organisation`, `lire_audit` et `restaurer_depuis_audit` restent dans `affaires` (supprimer ou restaurer une fiche touche aux affaires liées). Aucun nouvel outil, **mais** la liste des outils par module change : `tests/mcp-clients.test.js` (l.597-601 : `OUTILS.length - 31`, `- 26`, `seuls(['affaires'])` contient `chercher`) est à adapter **en lançant les tests, jamais à l'estime** (Devis seul = 26 + 7 = 33 outils). *Question restante :* le plombier doit-il pouvoir faire supprimer un client par son assistant ?

**Un devis finalisé sans affaire est valable, avec ou sans Affaires.** Plus aucune règle ne l'interdit (partie C) ; il garde son PDF, son historique d'envois, ses statuts (la liste écrit déjà « Sans affaire »). Le portail complet offre le filtre « Devis sans affaire » et le bouton existant « Créer une affaire depuis ce devis » (`js/modules/devis/affaire-depuis-devis.js`, C.3) : un geste de l'utilisateur, **pas une migration**.

---

## E. Une seule source de suggestions : les vraies fiches

Le champ « Pour qui est ce devis ? » et les champs de destinataires parlent à **une source** à trois verbes : **chercher**(texte, dès 3 lettres) → liste courte `{ id, nom, sousTitre, type, emails }` ; **lire**(id) → ce dont un devis a besoin ; **ajouter**(champs) → crée une fiche minimale. Depuis la décision du 04/11/2026 (partie B) il n'y a **plus deux fournisseurs** : le fournisseur « carnet » disparaît, la source lit `CRM.etat.personnes` et `CRM.etat.organisations` comme aujourd'hui (`editeur-ecran.js:1043-1053`), que le noyau Contacts ou le CRM complet les ait chargés. Chez Jérôme, rien ne change ; en « Devis seul », seule la ligne Affaire disparaît.

**Coordination avec la PR 508** (« saisie d'adresses façon Gmail », **en cours, à ne pas refaire**) : cette PR touche les champs de destinataires ; la source réutilise ce qu'elle fournit (puces d'adresses, suggestions). Contenu **non vérifié ici** (pas encore fusionnée) : relire son code avant d'écrire le brief de la PR 5.

**Ce qu'un Pipedrive ou un Salesforce exigerait** (description, pas de chiffrage) : l'authentification de l'artisan chez ce service, des quotas d'appels, les doublons, le sens de la synchronisation, le vocabulaire. Jérôme ne s'engage pas : **aucun connecteur, aucune synchronisation, aucun dossier « sources » vide**.

**À l'achat ultérieur d'Affaires** : **aucune migration** (décision du 04/11/2026). Les fiches sont déjà les vraies ; le module Affaires s'ajoute à l'affichage (partie I) et la secrétaire retrouve les mêmes clients. L'ancienne PR de migration est **supprimée**.

---

## F. Risques et pièges

| Sujet | Risque | Réponse |
|---|---|---|
| **Données de Jérôme** | Rien ne doit changer chez lui | Aucune migration, aucun champ en plus. Toute opération sur ses données demande son accord écrit |
| **Règles Firestore** | Aucune règle nouvelle | Les portails sont de l'affichage, jamais un droit (partie I). Si une règle devenait nécessaire plus tard : liste d'arrêt, PR laissée à Jérôme |
| **Découpage de la couche de données** | Casser les écritures et le journal des devis, des articles et du vocabulaire de Jérôme | PR 1 sans aucun changement de comportement ; Fable obligatoire ; tests des modules Devis et CRM, puis « Tests de nuit » sur `main` après fusion |
| **Serveur** | Registre, `metier.js`, descriptions d'outils, règle de finalisation | Relecture **Fable obligatoire** (CLAUDE.md) sur les PR 1 à 8, 10, 11 et 12 |
| **`functions-plateforme/`** | Une fonction ajoutée chez Jérôme mais pas chez les clients (leçon du 26/10) | Peu de serveur nouveau : **outils MCP déplacés vers le module Contacts** (PR 2), **règle de finalisation retirée** (PR 3), éventuellement **une fonction « rattacher un devis à une affaire »** (PR 4) : tout passe par le code partagé (`coeur`, `mcp`, `clients`), copié en entier par `scripts/preparer-fonctions.js`. À vérifier à chaque PR ; **contrôle des écarts entre les deux dossiers avant la première démonstration** |
| **Déploiement** | Fonctions + MCP chez les clients | Lancés un à la fois par Jérôme, jamais en même temps |
| **Tests qui verrouillent l'ancien comportement** | Rouges à la réécriture, vus seulement par le palier complet | Liste ci-dessous : à lire (`grep`) avant chaque PR et à lancer avec l'étiquette `tests-complets` |
| **PDF et stockage** | Chemin `devis/sans-affaire/…` | Devient le chemin normal en « Devis seul » ; à tester (PR 7) |
| **Dérive des PR** | Une PR ouverte se met en conflit | Une PR à la fois, fusion le jour même |

**Tests à lire ou adapter** (vérifiés présents sur `main` ; quelques mentions par fichier) :

- *Racine* : `devis-logique.test.js` (mentions « sans affaire » / `AFFAIRE_MANQUANTE` : bloc SA l.410 **inversé** en PR 3), `devis-serveur.test.js` (bloc `SA` l.525 : le refus est **inversé**), `devis-mcp.test.js` (bloc `SA` l.1190-1211 : idem), `devis-client-devis.test.js`, `devis-pdf-auto.test.js`, `logique.test.js`, `registre.test.js` (l.40-44 : **ajouter** « devis sans dépendance », cas « devis seul »), `devis-affaire-depuis-devis.test.js` (inchangé : ce bouton reste utile avec Affaires).
- *E2E* : `devis-sans-affaire.spec.js`, `devis-nouveau-sans-blocage.spec.js`, `devis-choix-client.spec.js`, `devis-editeur.spec.js`, `devis-editeur-mise-en-page.spec.js`, `modules-client.spec.js` (**ajouter** un cas « devis seul »), `parcours.spec.js` (C19, l.718-745), `devis-barre-globale.spec.js`.
- Tout nouvel écran se teste aussi en format téléphone (`--project=telephone`), et `npm run test:module look-compact` pour tout CSS (leçons de CLAUDE.md).

---

## G. Découpage en PR et décisions à prendre

**Ancien découpage du 04/11 (13 PR) : remplacé par les PR réelles ci-dessous.**

Chaque PR : une seule idée, fusionnée le jour même. **Rien de visible chez Jérôme tant qu'aucun client n'est « Devis seul »**, sauf les PR 3, 4, 10, 11 et 12 (finalisation sans affaire, rattachement, Statistiques, Relances : même code chez lui). **Aucune PR de règles Firestore, de migration ni de `firebase*.json`** (décisions du 04/11/2026). Numérotation **refaite** à chaque décision : la « vue par membre » et la « finalisation affinée » n'existent plus.

| N° | PR | Dépend de | Fable | Ce que Jérôme voit à l'écran |
|---|---|---|---|---|
| **1** | **FAITE** (523, 05/11) : `CLES_NOYAU`, `CLES_COMPLET`, `ecoutesDemarrees`, `estNoyau`, option `noyau` de `demarrer`, garde-fou de `supprimerPersonne` / `supprimerOrganisation` sur le socle seul, `arreter()` vide aussi les paramètres | aucune | **obligatoire** (données, journal) | rien |
| **2** | **remplacée par la PR B (524)** : la coque démarre le socle avant les modules (`js/main.js`, `js/os/espace-modules.js`), `SOCLE` (id `contacts`) déclaré HORS `MODULES_DECLARES` ; pas d'écran Clients, aucun outil déplacé (le socle prête 7 outils d'Affaires, 9 depuis la 531 du 06/11, `SOCLE.outilsMcp`) ; un client sans module actif ne démarre pas le socle | 1 | **obligatoire** (le serveur lit le même fichier) | rien |
| **3** | **FAITE** (526, C1 conditionnelle, puis **PR 1 du 07/11 : finalisation sans affaire partout**, option `affaireRequise` supprimée, avertissement non bloquant si Affaires actif) : `devis` sans dépendance, `affaireRequise`, 7 outils du socle (9 depuis la 531 du 06/11), tests inversés (`devis-articles` B1, `devis-bordereau-client` B1, `registre` B3/B4, `mcp-clients` D-S1..S3), R14-1 à R14-8 | aucune | **obligatoire** (serveur, tests qui verrouillent) | un devis se finalise sans affaire |
| **4** | **FAITE (PR 2, 08/11)** — ancien libellé gardé : **Rattacher plus tard** (C.3) : filtre « Sans affaire » dans la liste, action « Choisir l'affaire » (`choisirAffaire` côté serveur, fonction `devisChoisirAffaire`, `restaurer.js`), « Créer une affaire depuis ce devis » ; ancien libellé : filtre « Devis sans affaire », « Créer une affaire depuis ce devis » sur un devis finalisé, fonction du serveur si besoin (journal, recalcul du montant dans la même transaction) | 3 | **obligatoire** (serveur, données) | un filtre et un bouton |
| **5** | **À faire** : **Deux portails** (partie I) : déclaration des portails, route `portail-devis` lue par le routeur, préfixe, page d'arrivée (liste des devis), liens internes, modules visibles = achetés ∩ portail, page indisponible | 2 | **obligatoire** (liens et adresses, navigation) | rien (le portail complet ne change pas) |
| **6** | **FAITE** (528, C2) : ligne Affaire cachée, colonne Client, menu « + », R14-9 à R14-14 | 1, 2 (et PR 508 fusionnée) | **obligatoire** (gros écran, éditeur du devis) | le champ client ne change pas avec Affaires actif |
| **7** | **À faire** : **Menu du portail Devis** : Devis · Clients · Catalogue · Relances · Statistiques (Catalogue au premier niveau ; Relances et Statistiques s'ajoutent à la fusion des PR 10 à 12), « + », recherche, Réglages, premier écran | 2, 5, 6 | **obligatoire** (structure d'écran) | rien |
| **8** | faite par la 526 (outils du socle) | 2, 3 | **obligatoire** (serveur) | rien |
| **9** | **FAITE (535, 06/11)** : pas de bouton Contacts (le socle n'a pas d'écran, PR 524) ; les trois collections de `SOCLE.collections` entrent dans l'export du module Devis ; C19 inchangé | 2 | non requise (lecture seule ; E2E C19) | un bouton de plus |
| **10** | **À faire** : **Statistiques de devis** (H.5) : fonction pure `statistiquesDevis` sur `montantDesDevis` (tous les devis, rattachés ou non), écran, exclusion des devis de test, règle de la PR 510 (archivé compte) | 7 ; **PR 510 fusionnée** | **obligatoire** (nouvel écran, données) | un écran Statistiques |
| **11** | **FAITE (533, 06/11)** : origine `relance`, réglage `delaiRelanceJours` (10), règle pure `relances.js` (`devisARelancer`) ; aucune collection, aucune règle, aucun outil MCP nouveau. Reste l'écran (ligne 12). Ancien texte : **Relances côté serveur** (H.4, option (a)) : origine `relance` dans `ORIGINES_ENVOI` et `LIBELLES_ORIGINE_ENVOI`, libellé de `enregistrer_envoi_devis`, réglage du délai (10 jours, plus court que la validité) ; **aucune collection, aucune règle** | aucune | **obligatoire** (serveur, données) | rien |
| **12** | **À faire** : **Relances côté écran** : écran « Relances », bouton « Préparer l'e-mail de relance » (même fenêtre, brouillon Gmail, jamais d'envoi), cas vide et cas d'erreur | 7, 11 | **obligatoire** (nouvel écran, e-mail) | un écran Relances |
| **13** | **À faire** : **Recette de bout en bout** : portail Devis puis portail complet sur les mêmes données (une fiche créée d'un côté, vue de l'autre), devis finalisé sans affaire puis rattaché, docs (`deploiement-client.md`, `activer-desactiver-modules.md`) | 1 à 12 | non (docs) | rien |
| **14** | **FAITE (536, 06/11)** : recherche de la liste des devis sur le chantier (chantierDe : adresse du chantier, sinon objet), placeholder « Numéro, client ou chantier » en Devis seul (H.3) ; même botte avec Affaires actif ; R14-11 adapté, R14-16, L3 | 6 | non requise (logique pure, libellé) | rien |

**Reste au 06/11/2026 soir : S4 portails (ligne 5), S5 menu du portail (ligne 7), S6 écran Relances + e-mail de relance (ligne 12), S7 Statistiques (ligne 10), S9 recette `clientdemo` (ligne 13).**

Ordre conseillé : (1 → 2, 3 → 4 en parallèle) → 5 → 6 (après la PR 508) → 7 → 8 → 9 → (11 → 12, puis 10 après la PR 510) → 13. **11 PR sur 13 exigent Fable** (1 à 8, 10, 11, 12). Un déploiement des fonctions et du MCP chez les clients suit les PR 3, 4, 8 et 11 (Jérôme le lance). **Aucune règle Firestore à publier.**

### État des décisions

1. **Dépendance du module Devis** : « Devis seul sans CRM » (PR 511) **remplacé** par un **noyau Contacts** sur les vraies fiches (2e décision de Jérôme, 04/11/2026).
2. **Affichage** : « vue par membre » **remplacée** par **deux portails** sur les mêmes données (3e décision, 04/11/2026).
3. **Devis et affaire** : **supprimée partout le 07/11/2026 (option A, PR 1)** ; avertissement non bloquant si Affaires est actif. *(Historique : conditionnelle en 526 ; confirmée le 06/11, annulée le 07/11.)* Ancien texte : la règle « finalisation exige l'affaire » est **supprimée** (3e décision) ; rattachement possible plus tard (C.3). *Décision prise seul : brouillon et devis finalisé vivent toujours sans affaire, même chez Jérôme ; l'invitation « Choisis ou crée une affaire » est **retirée du portail Devis** (le plombier ne connaît pas les affaires) et **gardée comme suggestion non bloquante dans le portail complet**.*
4. **Une affaire cachée par devis ?** — **caduque.**
5. **Rangement à l'achat / migration** — **caduque** : plus de carnet, plus de migration.
6. **Particulier / Société : un seul mot « Client » avec le choix du type ?** *Recommandée : oui* ; mots de l'écran « Clients » pour Personne / Organisation, la base garde ses noms.
7. **Accueil ou liste ?** — la **liste des devis reste le premier écran** du portail Devis ; l'équivalent d'un accueil est **Statistiques** (partie H). *Décision prise seul : pas d'accueil à part.* *Question restante :* Statistiques en premier écran ? **Mise à jour du 05/11/2026 : décision prise seul, voir les décisions de Jérôme du 05/11 en tête (on garde la liste en arrivée).**
8. **Comment tester chez Jérôme sans éteindre son CRM ?** *Recommandation : un client de démonstration avec les deux portails (jamais son espace).* Reste à confirmer. **Confirmé le 05/11/2026 : `clientdemo`.**
9. **Menu de la plaquette (partie H)** : décisions prises seul (Vocabulaire et Réglages hors menu principal, chantier = adresse du chantier puis libellé, relance à 10 jours, option (a), pas d'export de plus pour Relances et Statistiques), questions dans la partie H.
10. **Portails (partie I)** : adresse **tranchée par Jérôme** : `#/espace/<client>/portail-devis` (le portail complet garde `#/espace/<client>/devis/liste`) ; route du routeur, pas de réécriture Hosting ; outils MCP et connexion inchangés ; décisions prises seul : « Choisis ou crée une affaire » **retirée du portail Devis**, gardée en suggestion non bloquante dans le portail complet.
11. **Nouvelles questions** : (a) son espace garde-t-il toujours Affaires ? (b) la PR 508 définit-elle déjà la source de suggestions (E) ? (c) les outils de suppression de client restent-ils réservés à Affaires (D.4) ? **Réponse du 06/11 : oui ; le socle prête 9 outils dont marquer_test / demarquer_test, jamais une suppression.** **Réponse (a) du 05/11/2026 : oui, son espace garde Affaires et Projets.**

### Tableau « module acheté / ce que le client voit »

| Modules achetés | Portail | Menu | Ce qu'il peut faire | Ses clients | Ses affaires |
|---|---|---|---|---|---|
| **Devis seul** | Devis (le complet montre la même chose) | **Devis · Clients · Catalogue · Relances · Statistiques** (Vocabulaire dans la liste, Réglages dans le menu utilisateur) | cycle du devis (brouillon → signé), PDF, e-mail, relances, statistiques, assistant pour les devis et les clients | **Clients** = vraies fiches Personnes / Organisations (fiche minimale) | **aucune** ; un devis finalisé existe seul |
| **Devis + Affaires** | **Devis** (le plombier) ou **complet** (la secrétaire) : même connexion, mêmes données | Devis : les cinq entrées, jamais Affaires. Complet : Accueil, Personnes, Organisations, Affaires, Devis | un devis se finalise avec ou sans affaire ; filtre « Devis sans affaire » et rattachement dans le portail complet | les mêmes fiches, **sans migration** | visibles dans le portail complet seulement (affichage, pas confidentialité) |
| **Devis + Affaires + Projets** | idem | idem + Projets dans le portail complet | comme aujourd'hui | complets | visibles, projets possibles |
| **Affaires seul** (déjà possible) | complet | Accueil, Personnes, Organisations, Affaires | CRM sans devis ; montant d'affaire saisi à la main | complets | visibles |

---

## H. Le menu d'un client « Devis seul » (plaquette commerciale, 04/11/2026)

**Demande de Jérôme (04/11/2026)** : la plaquette « Votre devis chiffré avant d'avoir quitté le chantier » montre, pour quelqu'un qui n'achète **que** le module Devis, un menu **Devis · Clients · Catalogue · Relances · Statistiques**, un tableau Devis (Brouillon, Envoyé, Devis signé, Devis refusé), une recherche « Numéro, client ou chantier… » et les boutons Catalogue, Vocabulaire, « + Nouveau devis ». Elle promet « relances, historique, reporting ». *« Je dois pouvoir mettre en œuvre ce genre de solution pour quelqu'un qui n'achète que le module Devis. »* Cette section adopte ce menu. Aucun prix ni nom de client de la plaquette n'est repris ici.

### H.1 Le menu retenu

| Entrée | Existe déjà ? | À créer | Vit de quelles données | PR |
|---|---|---|---|---|
| **Devis** | **Oui** : vues Kanban et Liste (`liste-ecran.js`), quatre colonnes `COLONNES_TABLEAU` = Brouillon · Envoyé (avec « Finalisé ») · Devis signé · Devis refusé (`liste.js:180-184`) ; filtres statut et période ; recherche ; « + Devis » (`liste-ecran.js:211`) | rien de nouveau ; seulement le libellé « chantier » (H.3) | `devis_devis` | aucune (PR 7 pour le menu) |
| **Clients** | **Oui** : les écrans Personnes et Organisations du CRM (`crm/personnes.js`, `crm/organisations.js`) | un écran « Clients » simplifié (liste unique Particulier / Société, fiche minimale, sans affaires ni activités), sinon les mêmes écrans | `crm_personnes`, `crm_organisations` (vraies fiches) | PR 6 (écran), PR 7 (entrée de menu) |
| **Catalogue** | **Oui** : `#/devis/bordereau` (`bordereau.js`), aujourd'hui un bouton de la liste | une **entrée de premier niveau** du menu pour ce profil ; le bouton reste dans la liste | `devis_articles` et familles | PR 7 |
| **Relances** | **Non** (aucune relance : `grep -i relance js/modules/devis` = 0) ; mais tout le nécessaire existe : `envois[]`, `envoyeLe`, `historiqueEnvois` (`email-brouillon.js:77`), « Préparer l'e-mail » déjà permis pour un devis envoyé (`emailPossible`, `email-brouillon.js:25`) | un écran « Relances » + une fonction pure + un réglage de délai (H.4) | `devis_devis` (pas de nouvelle collection si l'option (a) est retenue) | PR 11 (serveur), PR 12 (écran) |
| **Statistiques** | **Non** (`grep -iE "statisti\|reporting" js/modules/devis` = 0) | une fonction pure + un écran (H.5) | `devis_devis` | PR 10 |

**Vocabulaire et Réglages Devis restent accessibles.** *Décision prise seul :* **Vocabulaire** garde son bouton dans la liste des devis (là où il est aujourd'hui, comme sur la plaquette) et **Réglages** reste dans le menu utilisateur (`docs/consignes-ui.md`, « Menu de gauche » : Réglages n'est jamais dans le menu principal) ; ce ne sont donc pas des entrées de premier niveau. *Question restante pour Jérôme :* préfère-t-il aussi Vocabulaire au premier niveau ?

**Même code chez Jérôme et chez les clients (18/10/2026).** Relances et Statistiques de devis existent **aussi chez Jérôme** (le module Devis est le même) : il les voit chez lui, il est le bêta-testeur. Ce sont le **portail** (partie I) et les modules achetés qui décident du menu : dans le portail complet (le menu de Jérôme), Relances et Statistiques sont des **onglets de la page Devis** (une entrée de menu par module, `docs/consignes-ui.md`, 23/10/2026) ; dans le portail Devis, elles passent au premier niveau avec Clients et Catalogue. *Décision prise seul :* un seul jeu d'écrans, deux façons de les ranger ; aucun écran réservé aux clients. *Question restante :* Jérôme veut-il le menu « à plat » aussi chez lui ?

### H.2 « Clients » = les vraies fiches Personnes et Organisations

Depuis la 2e décision de Jérôme (04/11/2026, partie B), **Clients** n'est plus un carnet à part : c'est le **menu** qui montre les **vraies fiches** `crm_personnes` et `crm_organisations`. Le mot « Clients » n'est pas interdit par `docs/consignes-ui.md` (seul « CRM » l'est, 18/10/2026) et correspond à la décision 6 (un seul mot « Client », avec le choix Particulier / Société). *Décision prise seul :* l'écran « Clients » est **le même objet** que Personnes et Organisations (jamais un troisième type de fiche) ; il en montre la version **simplifiée** : une liste, la recherche, et la fiche minimale (nom, e-mail, téléphone, adresse). Chez Jérôme et pour qui voit Affaires, les écrans complets Personnes et Organisations restent seuls dans le menu : « Clients » n'y est pas ajouté (pas de doublon). *Question restante :* écran « Clients » simplifié, ou les écrans Personnes et Organisations tels quels sous le mot « Clients » ?

### H.3 « Chantier » en Devis seul

La plaquette dit « chantier ». En Devis seul il n'y a **pas d'affaire** ; la colonne et la recherche « chantier » se lisent ainsi. *Décision prise seul :* le **chantier d'un devis** est son **adresse de chantier** (`adresses.chantier`, déjà lue par `document.js:226` et l'éditeur `editeur-ecran.js:941`), et, si elle est vide, le **libellé (objet) du devis**. La recherche « Numéro, client ou chantier… » (aujourd'hui « Numéro, client ou affaire », `liste-ecran.js:218`) lit ces champs quand Affaires n'est pas actif ; avec Affaires actif le texte reste « affaire ». *Question restante :* Jérôme préfère-t-il « adresse du chantier » seule, ou « libellé du devis » seul ?

### H.4 « Relances » : devis envoyés sans réponse

**Définition.** Un devis à relancer est un devis **envoyé** (`statut = envoye`), **non archivé**, **non expiré** (`estExpire`, `logique.js:537`), dont le **dernier contact** (la plus récente des dates `envois[]` et `envoyeLe`) remonte à **N jours ou plus**. Un devis « Finalisé » jamais envoyé n'y est **pas** (il est signalé « Pas encore envoyé » dans le tableau). **N est réglable** (Réglages > Devis, à côté de la durée de validité).

**Valeur par défaut proposée : N = 10 jours.** Elle doit rester **strictement inférieure** à la durée de validité (`DUREE_VALIDITE_DEFAUT = 90`, `logique.js:48`, réglage `dureeValiditeJours`) : un réglage de N ≥ durée de validité est refusé à l'enregistrement (« Le délai de relance doit être plus court que la durée de validité du devis »). *Décision prise seul : 10 jours.* *Question restante :* 7, 10 ou 15 jours ?

**Écran.** Liste des devis à relancer, du plus ancien au plus récent : numéro, client, chantier, montant (100 € dans les exemples), « envoyé il y a 12 jours », date de la dernière relance. Bouton **« Préparer l'e-mail de relance »** : **la même fenêtre** que « Préparer l'e-mail » (`email-preparer-ecran.js`) avec un texte de relance par défaut, qui crée un **brouillon Gmail** ; **le logiciel n'envoie jamais** (docs/cadrage-devis.md:52 ; `devis-email.js:203`). Cas vide : « Aucun devis à relancer. Tes devis envoyés ont tous reçu un contact récemment. » Cas d'erreur : message de la fenêtre existante (PDF pas prêt, préparation déjà faite il y a moins de 3 minutes).

**Deux options pour garder la trace d'une relance :**

| | **(a) Une relance = une nouvelle ligne d'envoi** (`envois[]`, nouvelle origine `relance`) | (b) Une collection dédiée (`devis_relances`) |
|---|---|---|
| Collection nouvelle | **Non** | Oui |
| Règle Firestore | **Aucune** (les règles ne laissent au navigateur que le brouillon : `envois` n'est écrit que par le serveur, `functions/src/coeur/devis.js:311`) | Oui, dans `firestore.rules` **et** `firestore.plateforme.rules` : **liste d'arrêt** de CLAUDE.md, PR laissée à Jérôme |
| Export | **Aucun changement** (les devis sont déjà exportés) | **7e collection** à ajouter à l'export du module (règle du 27/10/2026) + test C19 |
| Historique du devis | **Déjà affiché** : `historiqueEnvois` montre chaque ligne (« Envoyé le … (hors logiciel) ») ; la nouvelle origine s'y lit « Relance le … » | à brancher |
| Statut du devis | inchangé (reste `envoye`) | inchangé |
| Code à toucher | `ORIGINES_ENVOI` (`functions/src/coeur/devis.js:315`, aujourd'hui `brouillon_logiciel`, `hors_logiciel`), `LIBELLES_ORIGINE_ENVOI` (`email-brouillon.js:67`), le libellé de l'outil `enregistrer_envoi_devis` (`outils/ecriture.js:237`), la limite `MAX_ENVOIS = 100` (`devis.js:312`, largement assez) | un module de données, un journal, des règles, un export |

**Recommandation : (a).** Le code le permet : `enregistrerEnvoi` ajoute déjà une ligne à `envois[]` pour un devis `envoye` sans changer le statut ni `envoyeLe` (`devis.js:337-351`) ; il suffit d'accepter une origine de plus. **Point d'attention** : `historiqueEnvois` fond `envoyeLe` avec le premier envoi s'ils sont à moins de 10 minutes (`MEME_ENVOI_MS`) : une relance n'est pas concernée (elle est des jours plus tard). Une ancienne ligne sans origine reste lue comme un envoi, jamais comme une relance. L'**appel du navigateur** (`devisEnregistrerEnvoi`, `donnees.js:320`) existe déjà : aucune nouvelle fonction du serveur, donc la règle du 26/10/2026 (branchement chez les clients dans la même PR) est respectée par le code partagé ; à confirmer par le contrôle des écarts entre `functions/` et `functions-plateforme/`.

**Assistant.** Aucun nouvel outil n'est nécessaire en (a) : `lister_devis` + `enregistrer_envoi_devis` (origine `relance`) suffisent. **Si un outil `lister_relances` est ajouté**, il change le **compte vérifié par `tests/mcp-clients.test.js`** (aujourd'hui « 26 outils du module Devis », l.599-601 : `OUTILS.length - 26` et `- 31`) ; ce test est de toute façon à adapter pour les sept outils déplacés dans le module Contacts (D.4) : un outil de plus = chiffres à mettre à jour **en lançant les tests, jamais à l'estime**. Un test à ajouter : un profil « Devis seul » reçoit bien les sept outils Contacts et aucun outil d'affaire.

### H.5 « Statistiques » : les chiffres des seuls devis

**Ce qui existe et ne convient pas.** `CALCULS.ca_signe` (`js/modules/crm/logique.js:1676`) additionne les montants d'**affaires** gagnées : inutilisable sans Affaires. L'accueil (`js/modules/crm/accueil.js`, route `crm/index.js:22`) vit dans le module Affaires.

**À créer : une fonction pure `statistiquesDevis(devis, {aujourdhui, periode})`** (dans `js/modules/devis/`, copiée sur le serveur comme les autres fichiers purs) qui s'appuie sur **`montantDesDevis`** (`logique.js:596`) pour le montant de chaque devis. Elle rend :
- le **chiffre d'affaires signé** (somme HT des devis `accepte`, par mois et sur la période) ;
- le **nombre de devis par statut** (les quatre colonnes de la plaquette) ;
- le **taux de transformation** = devis signés ÷ devis envoyés sur la période (devis signés comptés parmi les devis sortis, jamais de division par zéro : « — » s'il n'y a aucun envoi) ;
- les chiffres **par mois**.

**Règle de montant (Jérôme, 04/11/2026, PR 510).** *Un devis **archivé compte** (archiver = ranger) ; brouillon, refusé et remplacé ne comptent jamais.* **Contradiction temporaire** : sur `main`, `docs/montant-affaire.md` (l.21) et `montantDesDevis` (`logique.js:597`, `d.archive !== true`) disent encore l'ancienne règle (« archivé = ignoré ») tant que la PR 510 n'est pas fusionnée. Les statistiques appliquent la **nouvelle** règle (celle de la PR 510) ; la PR 10 attend donc la fusion de la PR 510 et reprend sa fonction sans la recopier.

**Écran.** Quatre chiffres en haut (CA signé en euros, devis en cours, taux de transformation, devis signés), un graphique par mois, un choix de période (mois, trimestre, année). Cas vide : « Pas encore de devis sur cette période. » Cas d'erreur : « Impossible de lire tes devis pour le moment. Réessaie. » Les devis **de test** (`test: true`, mode test) sont **exclus** (`docs/cadrage-mode-test.md`). Exemple : un devis signé de 100 € HT et un refusé de 100 € HT, tous deux envoyés → CA signé 100 €, taux de transformation 50 %.

### H.6 Ce que cela change dans le découpage

PR concernées (le détail est dans le tableau de la partie G) : **10** Statistiques, **11** Relances côté serveur (origine `relance`, réglage du délai), **12** Relances côté écran. Les PR 6 et 7 s'élargissent (écran « Clients », entrées Catalogue, Relances, Statistiques, texte « chantier »). **Aucune collection nouvelle** si (a) est retenue : donc aucune règle Firestore et aucun export de plus. Si (b) l'est : une PR de règles (liste d'arrêt) et une collection d'export de plus. **Export par module (27/10/2026)** : les devis étant déjà exportés, Relances et Statistiques n'ont pas besoin de leur propre bouton ; *Décision prise seul :* le bouton « Exporter mes données » du module Devis reste le seul, et la page Statistiques n'en ajoute pas (ses chiffres se recalculent des devis exportés). *Question restante :* un export CSV des chiffres de la page Statistiques est-il voulu ?

---

## I. Deux portails sur les mêmes données

**Décision de Jérôme (04/11/2026, 3e décision ; elle REMPLACE la « vue par membre » de la version précédente de cette étude, supprimée : plus de champ `vue`, plus de fonction du serveur pour la régler, plus d'outils MCP qui suivent une vue).** Pas d'affichage par utilisateur : **deux portails sur les MÊMES données** (même site, même connexion, même base, mêmes fiches réelles `crm_*`) :

- le **portail complet** (celui de la secrétaire) : tous les modules achetés, adresse inchangée, par exemple `https://chevalier-ia-app.web.app/app.html#/espace/clientdemo/devis/liste` ;
- le **portail Devis**, dont l'adresse dit clairement que c'est une vue particulière : **`https://chevalier-ia-app.web.app/app.html#/espace/<client>/portail-devis`** (exemple : `#/espace/clientdemo/portail-devis`). **Nom exact tranché par Jérôme : `portail-devis`**, placé juste après `/espace/<client>/`. Il n'affiche que **Devis · Clients · Catalogue · Relances · Statistiques** (et Vocabulaire / Réglages Devis).

### I.1 Ce qui existe (vérifié)

- Chez un client, la page est `#/espace/<client>` (`js/os/espace.js:1`). **Le routeur lit déjà `espace/<client>/<reste>`** : `routeDansEspace` (`js/os/marque.js:33-39`) rend `{ client, reste }`, et `cleEspace` (`marque.js:42`) ne garde que `espace/<client>` comme clé d'entrée (changer d'écran ne recharge pas la page).
- Les routes des modules vivent sous un préfixe : `definirPrefixe('espace/<client>')` (`js/os/espace-modules.js:26`) ; `lien()` et `naviguer()` (`js/os/router.js:10-52`) **remettent le préfixe tout seuls**, et `routeCourante()` le retire. Un module parle donc toujours en `devis/liste`.
- Les modules montés = les modules actifs de la fiche du client (`espace.js:121`, `espace-modules.js:22-27`) ; `moduleAccessible` (`registre.js:346`) rend « introuvable » une route d'un module non actif. Le menu part des modules montés.

### I.2 Le mécanisme : une route du routeur, aucun changement de Hosting

`portail-devis` n'est **qu'une route du routeur** (le premier mot du « reste »), **pas** une réécriture Firebase Hosting : **aucun changement de `firebase.json` ni de `firebase.plateforme.json`**, donc **pas de liste d'arrêt** pour cette PR. (La réécriture `/espace/**` existe déjà, `firebase.json:34` et `firebase.plateforme.json:29`, mais elle ne sert qu'aux liens courts `/espace/<client>`.)

1. **Lecture** : à l'ouverture, si le « reste » commence par `portail-devis`, le portail est « devis » ; sinon « complet ». C'est une fonction pure (dans `marque.js` ou `registre.js`), testée seule.
2. **Préfixe** : dans le portail Devis, le préfixe devient `espace/<client>/portail-devis` (`definirPrefixe`). Comme `lien()` et `naviguer()` l'ajoutent partout, **les liens internes restent sous `portail-devis` sans rien écrire** : `#/espace/<client>/portail-devis/devis/liste`, `…/portail-devis/devis/bordereau`, etc. Le module Devis ne sait pas dans quel portail il est.
3. **Page d'arrivée** : `#/espace/<client>/portail-devis` sans route derrière ouvre **la liste des devis** (`devis/liste`, `premiereRoute`, `registre.js:353`).
4. **Menu** : la coque reçoit la liste des modules visibles et, pour le portail Devis, la liste des cinq entrées (déclaration des portails dans `registre.js`, voir I.3).
5. **Adresse du portail complet** : `#/espace/<client>/devis/liste` reste celle du portail complet (aucun signet existant ne casse).

**À vérifier au codage (non fait ici)** : (a) `cleEspace` et `estRouteEspace` (`main.js:22`) ne regardent que les deux premiers mots : normal, mais un test doit prouver que passer d'un portail à l'autre ne recharge pas la page et que la connexion est conservée ; (b) **quatre liens écrits en dur** `href: '#/devis/liste'` ou voisins (`bordereau.js:440`, `selecteur-catalogue.js:181`, `bibliotheque.js:54`, `liste-ecran.js:211`) : comment ils sont traduits chez un client est à vérifier ; dans le portail Devis ils devront aussi rester sous `portail-devis` (le plus sûr : les passer par `lien()`) ; c'est exactement le genre de défaut que Fable a trouvé sur la PR 280 ; (c) le retour de connexion et les liens des e-mails (adresse d'un devis) : ouvrent le portail complet, sauf adresse explicite.

### I.3 Ce que décide le portail, et ce qu'il ne décide pas

- **Modules visibles = modules achetés par le client ∩ modules du portail**, plus les modules dont ils dépendent. Le portail « devis » déclare `['devis', 'contacts']` : il **n'affiche jamais Affaires ni Projets, même s'ils sont achetés** (la même fiche du client sert aux deux portails). Le portail complet = tous les modules achetés, comme aujourd'hui. Un client qui n'a pas acheté Devis n'a pas de portail Devis (page « Espace indisponible »).
- **Le menu dépend du portail ET des modules achetés** : dans le portail Devis, cinq entrées ; dans le portail complet, le menu d'aujourd'hui, où Relances et Statistiques sont des **onglets** de la page Devis (une entrée de menu par module, `docs/consignes-ui.md`, 23/10/2026).
- **Une route d'un module masqué dans le portail** (par exemple `…/portail-devis/crm/affaires`) est « introuvable » (même mécanisme que `moduleAccessible`).
- **Inchangés** : la connexion, les rôles (éditeur / lecteur), les règles Firestore, **les outils de l'assistant (MCP : ceux de l'espace, pas du portail)** et les fiches `clients/<client>`. Un seul jeu de données ; aucun champ en plus sur les membres ; aucune fonction du serveur nouvelle ; **aucune règle Firestore**.
- **Application installée** : le portail partage l'icône et le nom du client (`appliquerIdentite`). *Question restante :* un nom ou une icône différents pour le portail Devis sont-ils voulus ?

### I.4 L'honnêteté à écrire (et à dire au client)

**Ce sont deux portes d'AFFICHAGE, pas de la confidentialité entre membres.** Les règles Firestore décident **par rôle et par collection**, jamais par module ni par portail (`firestore.plateforme.rules:182-184`) : quelqu'un qui entre par le portail Devis **peut lire** les affaires s'il connaît l'adresse du portail complet, et son assistant (outils de l'espace) peut les lister. Il ne faut **jamais** promettre à un client que son plombier « ne peut pas voir » les affaires comme une protection. Un vrai cloisonnement serait un autre chantier (règles par collection et par membre : liste d'arrêt).

### I.5 Découpage

PR 5 (voir G) : déclaration des portails, lecture de `portail-devis`, préfixe, page d'arrivée, modules visibles (fonction pure, testée), cas « portail Devis sans module Devis acheté », « route d'un module masqué = introuvable », liens écrits en dur ; tests de navigation et de connexion en format ordinateur **et téléphone**. **Fable obligatoire** (liens et adresses : un vrai bug chez les clients sur la PR 280 n'a été vu que par Fable, CLAUDE.md).

## J. Audit d'indépendance des modules (05/11/2026, état après les PR 523-526 et 528)

Chaque ligne a été relue contre le code de `main` (568b868e).

- **Indépendants (`dependances: []`)** : `affaires` (`js/os/registre.js` l.66, l.108), `devis` (l.136, l.150 ; `socle: true` l.151 : **fait le 05/11**), `veille` (l.157, l.170), `automatisations` (l.176, l.191), `tableaudebord` = Maintenance (l.198, l.210), `mcp` (l.218, l.230). Encore dépendant : **`projets`** (l.111, `dependances: ['affaires']` l.128 ; `js/modules/projets/donnees.js` l.47 refuse un autre chemin de base que les affaires ; ses phases sont créées par le CRM : `initialiserParametres`, `js/modules/crm/donnees.js` l.282, appelée l.225, à partir de `parametresDepart`, `js/modules/crm/logique.js` l.433). « Projets sans Affaires » = plus tard (décision de Jérôme).
- **Le socle** est le mode noyau de `CRM.demarrer` (`js/modules/crm/donnees.js` l.64-73 : `CLES_NOYAU` = personnes, organisations ; `CLES_COMPLET` ajoute affaires, activités, paramètres ; `estNoyau` l.70 ; `estPret` l.73 est vrai en mode noyau). Il est démarré par `js/main.js` l.75 et `js/os/espace-modules.js` l.29. `SOCLE.collections` = `crm_personnes`, `crm_organisations`, `crm_evenements` (le journal est écrit mais non listé). Les suppressions de fiches sont refusées sur le socle seul (`donnees.js` l.424, l.450). Devis sur le socle : `surSocleSeul` (`js/modules/devis/donnees.js` l.109) est le seul point d'entrée (verrou `tests/socle-donnees.test.js` S1) ; `demarrer` l.111-113 exige le socle démarré sur le même chemin ; l'éditeur attend encore `CRM.estPret()` (`editeur-ecran.js` l.172, `index.js` l.145 : vrai en mode noyau).
- **Veille, Automatisations et Maintenance** importent des fonctions pures du CRM (`../crm/barre-liste.js` ×4, `composants.js` ×3, `filtres.js` ×3, `logique.js` ×3 ; fichiers : `automatisations/{a-valider,ecran,export}.js`, `tableaudebord/{ecran,export}.js`, `veille/{ecran,export}.js`). Le module `mcp` de l'écran n'importe rien de `../crm/`. À déplacer un jour vers `js/os/` (pas urgent : ce sont des fonctions pures).
- **Affaires porte les réglages de Projets** (`reglages-phases` l.85, `reglages-projets` l.95) et l'export complet lit `COLLECTIONS_CRM` (`js/modules/crm/donnees.js` l.21).
- **Serveur** : `functions/src/clients/gestionnaire.js` l.74-79 : un `lireConfig` en échec répond 503 `reglages_illisibles` (un espace sans `crm_parametres` est à vérifier le jour d'un vrai client Devis seul) ; `affaireRequise` n'existe plus (PR 1 du 07/11) : les modules actifs ne servent plus qu'à l'avertissement `avertissement` (`functions/src/coeur/metier.js` `finaliserDevis`, `lecture.js` `lireDevis`).
- **Tests qui verrouillent l'état actuel** : `tests/registre.test.js` l.41-43 (projets → affaires) et l.100-120 (B3 devis sans dépendance, B4 `outilsMcpActifs`) ; `tests/mcp-clients.test.js` l.625-635 (comptes 31 / 26 / 9 ; Devis seul = 2 + 26 + 9 = 37, depuis la 531) ; `tests/mcp-module.test.js` l.27 ; `tests/e2e/modules-client.spec.js` l.154 (R5 projets sans affaires refusé), l.298 (R13 Veille seul : socle invisible), l.338 (R14 Devis seul).
