# Étude de faisabilité : le module Devis vendable seul

*Étude du 04/11/2026, demandée par Jérôme (priorité haute). **Aucun code n'est écrit ici** : on vérifie ce qui existe, on dit ce qu'il faudrait changer, on propose un découpage en petites PR et on pose les questions à trancher. Chaque affirmation technique renvoie à un fichier et une ligne (état de `main` au 04/11/2026, PR 504). Les chiffres d'exemple partent de 100 €.*

## Résumé en 10 lignes (lisible sans connaître le code)

1. **Le but** : vendre le module Devis seul à un artisan. Il voit un seul « pipeline » (ses devis), sans jamais voir Personnes, Organisations, Affaires ni Projets.
2. **C'est faisable, sans deux codes séparés.** Le programme est le même ; seul change ce que le client a acheté (la liste de modules de sa fiche).
3. **Aujourd'hui c'est refusé par le code** : le module Devis déclare qu'il ne peut pas marcher sans le module Affaires (`js/os/registre.js:134`, vérifié ligne 328). Un client « Devis seul » est donc écarté dès la lecture de sa fiche.
4. **Pourquoi ce n'est pas qu'un détail** : les contacts (personnes, organisations) et les affaires vivent dans le *même* module Affaires, et le module Devis s'appuie dessus dans 23 de ses 54 fichiers. On ne peut pas simplement « l'éteindre » : il faut le **faire tourner en silence** et **cacher ses écrans**.
5. **Les données ne bougent pas.** Même base, mêmes collections. Si le client achète plus tard Affaires ou le CRM, il retrouve ses contacts et ses affaires. Aucune règle Firestore ne change (elles ne lisent pas la liste de modules, voir F).
6. **L'affaire cachée** : à chaque devis d'un client « Devis seul », l'application crée une affaire en silence (le code de création existe déjà et sert au bouton « + Créer l'affaire »). Le client ne la voit jamais.
7. **Le carnet de clients** : il faut un formulaire court (nom, e-mail, téléphone, adresse). Il n'y a rien à inventer côté données : une personne ou une organisation n'exige que le **nom** aujourd'hui.
8. **Ce qui ne change pas chez Jérôme** : ses données et son écran complet. Une règle ne doit pas casser : « même code chez Jérôme et chez les clients » (CLAUDE.md, 18/10/2026). Question à lui poser : comment tester « Devis seul » (voir G).
9. **Découpage proposé : 7 petites PR**, de la plus sûre à la plus délicate. Quatre touchent le serveur ou le registre (relecture Fable obligatoire). Aucune ne publie de règle Firestore. Aucune nouvelle fonction du serveur n'est attendue (donc rien à brancher à part dans `functions-plateforme/`).
10. **À ne pas promettre à un client** : envoi direct à un logiciel de facturation, familles libres, agent autonome, branchement à Pipedrive ou Salesforce.

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

Les sélecteurs de client se trouvent dans `js/modules/crm/composants.js:322` (`selecteurOrganisation`) et `:351` (`selecteurPersonne`). L'éditeur du devis, lui, n'utilise pas ces deux sélecteurs pour « Pour qui est ce devis ? » : il fabrique son propre champ (`js/modules/devis/editeur-ecran.js:1043-1077`, `champClientIntelligent`), qui propose trois groupes (Personnes, Organisations, Affaires) et, si rien ne correspond, « + Créer la personne » / « + Créer l'organisation ». Les deux sélecteurs servent à d'autres endroits du CRM.

### A.2 CRM et Projets → Devis (le sens inverse)

Le CRM **ne connaît aucun autre module** : il expose des crochets que le module Devis remplit en démarrant (`js/modules/devis/index.js:50-62`) et vide en s'arrêtant.

| Crochet (`js/modules/crm/pastilles-externes.js`) | Utilisé par | Effet si le module Devis est absent |
|---|---|---|
| `inscrirePastilleAffaire` / `pastillesDeAffaire` (l.7-20) | `composants.js:547` (carte Kanban) | pas de pastille « Devis : … » |
| `inscrireOngletAffaire` / `ongletsDeAffaire` (l.22-46) | `activites.js:251` (fiche d'affaire) | pas d'onglet « Devis » |
| `inscrireActionAffaire` / `actionDeAffaire` (l.47-62) | `fiche-affaire.js:104` | pas de bouton « Créer un devis » |
| `surChangementPastilles` | `affaires.js:346`, `fiche-affaire.js:225` | rien à redessiner |

Le montant d'une affaire a deux sources : `montantDevisHt` (écrit par le serveur d'après les devis) sinon `montant` (saisi à la main) : `js/modules/crm/logique.js:597-610`. Les mentions « module absent » (`logique.js:598`, `fiche-affaire.js:77`) parlent du **module Devis absent vu depuis l'affaire** (le montant est alors saisi à la main). Elles ne concernent pas notre cas, qui est l'inverse (Devis présent, Affaires absent). Détail du calcul : `docs/montant-affaire.md`.

**Projets** : aucun fichier de `js/modules/projets/` ne cite les devis (`grep` vide). Le module Projets dépend d'Affaires (`registre.js:113`), pas de Devis. « Devis seul » n'a donc **aucun lien à gérer avec Projets**.

### A.3 Serveur

Le serveur lit les collections du CRM *directement*, sans passer par le registre des modules :

- `functions/src/coeur/devis.js:134-144` (`montantDeLAffaire`, lit et écrit l'affaire d'un devis), `:162` (lit la fiche du client à la finalisation) ;
- `functions/src/coeur/metier.js:931-934` (`creerDevisBrouillon` : l'affaire est facultative, le client vient de l'affaire s'il n'est pas donné) ; `:1252-1263` (`creerDevisDepuisModele`) ;
- autres fichiers du serveur qui lisent personnes, organisations ou affaires : `coeur/devis-email.js`, `documents.js`, `donnees.js`, `ecriture.js`, `lecture.js`, `restaurer.js`, `devis/pdf-service.js` ; le PDF est rangé sous `devis/<affaire>/<devis>/…` avec le repli `'sans-affaire'` (`functions/src/devis/stockage.js:63`).

Copies faites par `scripts/preparer-fonctions.js` dans `functions/partage/` : `logique.js` (le **CRM entier**, l.9), `projets.js`, `devis.js`, `devis-articles.js`, `devis-ouvrages.js`, `devis-familles.js`, `registre.js`, `marque.js`, `chemins.js`, `membres.js` (l.88) et d'autres (vocabulaire, e-mail, brouillon, éditeur, document, numéros). Le serveur applique donc **exactement les mêmes règles que l'écran**, y compris `erreursFinalisation`.
Les dossiers `coeur`, `mcp`, `oauth`, `securite`, `clients` sont copiés tels quels dans `functions-plateforme/serveur/` (même script, `scripts/preparer-fonctions.js:98`, et `:105-108` pour les copies de `partage/`) : **tout changement du serveur partagé arrive chez les clients au déploiement « fonctions » + « mcp »** (lancé par Jérôme).

### A.4 MCP (outils de l'assistant)

- Les outils proposés à un client sont ceux des **modules actifs** : `functions/src/clients/gestionnaire.js:15-23` (`outilsDesModules`), modules actifs lus par `functions/src/clients/espaces.js:19` via la copie `functions/partage/registre.js`.
- Le module `devis` déclare 26 outils (`registre.js:133`) ; **les outils pour retrouver ou créer un client appartiennent au module `affaires`** : `chercher`, `lire_personne`, `lire_organisation`, `creer_personne`, `creer_organisation`, `modifier_personne`, `modifier_organisation`… (`registre.js:86-93`). Un client « Devis seul » n'aurait donc **aucun moyen** de désigner un client à son assistant (`creer_devis_brouillon` demande un `organisationId` ou un `personneId`).
- Le texte de `creer_devis_brouillon` dit que l'affaire est **facultative** et que la finalisation l'exige (`functions/src/mcp/outils/ecriture.js:184`) ; `chercher` renvoie aussi des affaires (`lecture.js:~13-20`, paramètre `types`).

### A.5 Règles Firestore

`firestore.rules` (Jérôme) et `firestore.plateforme.rules` (clients) décident par **rôle et par collection**, jamais par module actif (le mot `modules` n'y apparaît que pour la fiche `clients/<client>`, `firestore.plateforme.rules:41-44`). Pour `devis_devis` : un brouillon neuf doit avoir `statut=brouillon`, `numero` vide, `version=1` (`firestore.rules:71-74`) ; rien n'oblige ni n'interdit `affaireId`. **Aucune règle ne change** pour « Devis seul ».

### A.6 Exports (règle C19 / « chaque module a son bouton d'export »)

- L'export du module Devis contient seulement ses cinq collections : `js/modules/devis/donnees.js:287` (`devis_articles`, `devis_parametres`, `devis_devis`, `devis_vocabulaire`, `devis_usage_articles`).
- L'export complet (Réglages > section CRM) et les contacts `.vcf` appartiennent à l'écran du CRM : `js/modules/crm/export.js:8`, test `tests/e2e/parcours.spec.js:718` (C19, liste des collections attendue).
- Si le CRM est caché, **le client ne pourrait plus exporter ses contacts** : l'export Devis devra les inclure (voir G, PR 6).

### A.7 Recherche, « + », accueil, statistiques

- Barre « + » : `js/os/shell.js:282` rassemble les `actionsRapides` de **tous** les modules montés (Personne, Organisation, Affaire pour le CRM : `js/modules/crm/index.js:33-37` ; Devis : `devis/index.js:36-38`).
- Recherche globale : `shell.js:289-296` fusionne les groupes que chaque module rend (le CRM : Personnes, Organisations, Affaires, `crm/index.js:133`).
- Premier écran : `premiereRoute(actifs)` = premier écran du premier module actif (`registre.js:353`), donc `crm/accueil` dès que `affaires` est actif (`js/os/espace-modules.js:32`).
- Accueil et objectifs : l'Accueil (`crm/accueil`) et les indicateurs vivent dans le module Affaires ; « Devis seul » n'a **pas de tableau de bord** au départ (à dire, voir G).

---

## B. Carnet de contacts minimal

**D'où viennent les clients du champ « Pour qui est ce devis ? »** : de `CRM.etat.personnes` et `CRM.etat.organisations` (non archivées), lues par `champClientIntelligent` (`editeur-ecran.js:1043-1077`). Un devis porte `organisationId` et/ou `personneId` (le client est une organisation, ou une personne ; une personne rattachée à une organisation sert d'« À l'attention de », `editeur-ecran.js:1030`). Côté assistant, `creer_devis_brouillon` refuse les deux ensemble (`metier.js:933`) ; l'écran, lui, les accepte pour l'attention de : à noter pour l'étude, pas à corriger ici.

**Champs obligatoires aujourd'hui** : le **nom** seulement, pour une personne comme pour une organisation (`js/modules/crm/logique.js:855-872`, `validerPersonne` / `validerOrganisation`) ; l'e-mail est vérifié s'il est donné, l'adresse aussi. Les champs voulus par Jérôme existent déjà : nom, e-mails, téléphones, adresses (`nouvellePersonne` l.895, `nouvelleOrganisation` l.921). **Rien à ajouter au modèle de données.**

**Formulaire court** : la fenêtre « + Personne » existe (`js/modules/crm/personnes.js:185`, `ouvrirCreationPersonne`, avec doublon, organisation, étiquettes) et « + Organisation » aussi (`organisations.js:157`). Elles montrent des champs de CRM (organisation, étiquettes). Pour « Devis seul » il faut **un formulaire plus court** qui appelle les mêmes fonctions d'écriture (`planCreerPersonne` l.2076 de `crm/logique.js`, `CRM.creerPersonne` / `creerOrganisation`), donc **le même journal, les mêmes vérifications de doublon, le même mode test**.

**Particulier et société** : deux types de fiches existent déjà (personne, organisation). Recommandation : à l'écran, **un seul mot « Client »** avec un choix « Particulier / Société » ; derrière, « Particulier » crée une *personne* et « Société » crée une *organisation* (avec, si besoin, un contact « à l'attention de »). Cela garde exactement les données qu'un client CRM aurait. Proposer deux types de « client » distincts dans la base serait une erreur (il faudrait ensuite les convertir).

**Quand le CRM est activé plus tard** : les personnes et organisations créées en « Devis seul » sont de **vraies fiches** (mêmes collections `crm_personnes` / `crm_organisations`), elles apparaissent dans Personnes et Organisations telles quelles. Seule différence possible : une fiche complète (poste, secteur, étiquettes…) est simplement vide sur ces champs.

---

## C. L'affaire invisible

**Ce qui existe déjà.** Créer une affaire depuis un devis est déjà possible à l'écran : « + Créer l'affaire » dans la liste du champ Affaire (`editeur-ecran.js:1134-1160`, `creerAffaireDeLaListe`) appelle `CRM.creerAffaire` (`js/modules/crm/donnees.js:426`), qui appelle `planCreerAffaire` (`js/modules/crm/logique.js:2193`) : même écriture que « + Affaire », avec fil d'historique et note de départ. Les règles pures sont dans `js/modules/devis/affaire-depuis-devis.js` (nom proposé l.7, étape retenue l.16, étape à passer l.25).

**Nom de l'affaire cachée** : `nomAffaireProposee` (`affaire-depuis-devis.js:7`) = le nom interne du devis, sinon « Affaire <nom du client> » (`titreParDefaut`, `crm/logique.js:1077`). Recommandation : garder cette règle.

**Étape de l'affaire cachée.** Ce qu'il faut savoir :
- L'étape de départ vient du réglage « Étape des affaires créées depuis un devis » (`etapeAffaireCreee`, `js/modules/devis/articles.js:429`). Réglage vide = **on demande** à l'utilisateur (`etapeAPasser`, `affaire-depuis-devis.js:25`) ; un test verrouille qu'il n'y a **jamais de repli automatique** sur la première étape (commentaire `affaire-depuis-devis.js:13`, test NE2 `tests/devis-affaire-depuis-devis.test.js:32`). Pour l'affaire cachée, on ne peut pas poser la question à un client qui ne voit pas les étapes : il faut une **fonction à part** qui prend l'étape de départ du pipeline (`nouvelleAffaire` retombe déjà sur `etapeDeDepart(config)`, `crm/logique.js:1088-1090`), sans assouplir l'ancienne règle.
- Les **statuts du devis ne déplacent pas l'étape de l'affaire** : le serveur ne contient aucune notion d'étape dans `functions/src/coeur/devis.js` (0 occurrence), et `docs/montant-affaire.md` rappelle que le passage à « Gagnée » à la signature « n'est **pas** branché ». L'étape retirée des réglages le 28/10/2026 (« un devis vit à toutes les étapes », `articles.js:426`) confirme que les deux pipelines sont indépendants.

**Le pipeline propre aux devis existe déjà** : brouillon, finalisé (« à envoyer »), envoyé, signé, refusé, remplacé, archivé ; la liste des devis a la vue tableau par statut (`docs/cadrage-devis.md`, §7 et D20). Pour « Devis seul », **ce pipeline est le seul pipeline** ; l'étape de l'affaire cachée n'est pas affichée, donc pas besoin de la tenir à jour.

**Piège à l'achat du module Affaires** : toutes les affaires cachées seront à la même étape (celle du départ) alors que certains devis sont signés ou refusés, et leurs **montants** (`montantDevisHt`, écrits par le serveur à chaque changement de devis, `devis.js:134-144`) entreront dans les totaux de colonne du Kanban et le chiffre d'affaires signé (`docs/montant-affaire.md`). Deux options :
- **Option 1 (recommandée au départ)** : ne rien faire de plus ; à l'achat, un outil explicite et optionnel range les affaires selon les devis (brouillon/proposé → étape de départ, signé → Gagnée, refusé → Perdue). C'est une opération sur les données du client (liste d'arrêt : accord écrit, aperçu puis code).
- **Option 2** : tenir l'étape à jour dès maintenant, à chaque changement de statut (serveur, Fable obligatoire, risque sur le comportement de Jérôme).

**Un devis = une affaire cachée ?** Plusieurs *versions* d'un même devis restent sur la même affaire (comportement actuel). Pour deux devis différents au même client : recommandation, **une affaire par devis** (pas par client) : simple, prévisible, et c'est ce que fait déjà « + Créer l'affaire » (une affaire par clic). À l'achat d'Affaires, le client voit une affaire par devis, nommée d'après le devis.

**Mode test.** L'interrupteur d'écran pose `test: true` sur ce que l'écran crée : `CRM.creerAffaire` et `D.creerBrouillon` passent par `avecModeTest` (`js/os/mode-test.js:36-39`, `crm/donnees.js:426`, `devis/donnees.js:302`). Les créations de l'assistant ne sont jamais concernées (en-tête de `mode-test.js`). **Correction du brief** : la phrase « le repère test hérite déjà du parent à la création » **n'est pas vérifiée dans le code actuel** (aucun héritage trouvé dans `brouillon.js`, `editeur-logique.js`, `crm/logique.js`, `metier.js` ; l'héritage est un souhait du cadrage, `docs/cadrage-mode-test.md` §2.4). Risque pour nous : une affaire cachée créée par le serveur (assistant) depuis un devis de test ne serait **pas** marquée test. À traiter dans la PR 4b (serveur) en recopiant le repère du devis, ou à rattacher à la PR « héritage » du chantier mode test.

**Numérotation des devis** : aucun changement attendu. Le compteur `devis_compteurs/global` (`functions/src/coeur/devis.js:26`) est global au client, réservé au serveur, et ne dépend ni de l'affaire ni des modules.

**Toujours lié : ce qu'il faut changer.** Aujourd'hui un brouillon peut exister sans affaire (décision du 28/10/2026, « Nouveau devis sans blocage ») ; seule la finalisation l'exige : message `MESSAGE_AFFAIRE_MANQUANTE` (`js/modules/devis/logique.js:796-797`), règle `erreursFinalisation` (`logique.js:824`), appliquée par l'écran, le serveur (`devis.js:162-163`) et l'assistant. Pour « brouillon toujours lié » en mode Devis seul :
1. à la création du brouillon à l'écran (`actions-devis.js:111-126`, `creerDevisSansAffaire`, et `Ed.valeursDeCreation`), créer l'affaire cachée dans le même geste ;
2. côté serveur, `creerDevisBrouillon` et `creerDevisDepuisModele` (`metier.js:931`, `:1252`) créent l'affaire quand `affaireId` manque ET que le client n'a pas le module Affaires ;
3. réécrire les textes d'outils (`ecriture.js:184,192,220`) ;
4. rattrapage des anciens brouillons sans affaire : **à l'ouverture** (jamais par migration) ;
5. la règle de finalisation (`logique.js:824`) **ne change pas** : c'est le filet de sécurité, il reste.
En mode Devis + Affaires (Jérôme), je recommande de **ne pas changer** le comportement actuel (brouillon libre, affaire choisie par l'utilisateur) : voir question 3 en G.

---

## D. Interrupteur de modules (le fait décisif)

### D.1 Ce que fait le registre aujourd'hui

- Les modules sont déclarés dans `js/os/registre.js` (`MODULES_DECLARES`). Les modules actifs d'un client viennent du champ `modules` de sa fiche `clients/<client>` (`modulesActifsDuClient`, l.340) ; l'interrupteur `crm` allume `affaires` **et** `projets` (`INTERRUPTEURS`, l.249).
- Le module `devis` déclare `dependances: ['affaires']` (l.134) et `verifierActivation` (l.322-336) refuse un module dont une dépendance n'est pas active (l.328-331). **« Devis seul » est donc refusé aujourd'hui.** Verrous : `tests/registre.test.js` (l.41-43 vérifie l'ordre des dépendances), `tests/e2e/modules-client.spec.js`.
- Même lecture des deux côtés : écran (`js/os/espace.js:121`) et serveur (`functions/src/clients/espaces.js:19`, via la copie `functions/partage/registre.js`, `scripts/preparer-fonctions.js:88`). `functions/src/clients/config.js` ne contient **pas** la liste des modules.
- `devis_compteurs` n'est pas dans le registre (réservée au serveur, `registre.js:119`).
- Le module `affaires` regroupe **tout le CRM** : écrans Accueil, Personnes, Organisations, Affaires (`registre.js:57-61`), 7 collections `crm_*` plus `documents_stockes`, les réglages (étapes, phases, options…) et 32 outils MCP. **On ne peut pas cacher « les Affaires » sans cacher aussi les Personnes** : c'est un seul module.

### D.2 Deux façons de rendre « Devis seul » possible

| | **Option 1 : Affaires allumé mais masqué** | **Option 2 : lever la dépendance dure (recommandée)** |
|---|---|---|
| Idée | La fiche du client contient `affaires: true` + un second réglage (ex. `masques`) qui dit « ne pas l'afficher » | `devis` n'a plus `dependances: ['affaires']` mais un « noyau de données » : le CRM **démarre en silence** quand Devis est actif et `affaires` ne l'est pas |
| Ce que veut dire la fiche | Brouille « acheté » et « visible » | Une seule vérité : **la liste de modules = ce que le client a acheté** (comme le demande Jérôme) |
| À l'achat d'Affaires | Retirer le masque | Passer `affaires: true` |
| Tests du registre | Inchangés (la dépendance reste) | À adapter : `registre.test.js`, `modules-client.spec.js` |
| Risque d'erreur | Un client montré « avec Affaires » dans « Modules actifs » alors qu'il ne l'a pas payé | Il faut bien distinguer « module actif » de « module démarré » |
| Menu, « + », recherche, Réglages | À filtrer dans les deux cas | À filtrer dans les deux cas |

**Recommandation : option 2.** Elle correspond à la règle de Jérôme (un interrupteur de modules = ce qui est acheté) et ne crée pas de second réglage à tenir à jour. Dans les deux cas, le travail le plus lourd est le même : **séparer « démarré » (les données tournent) de « montré » (menu, recherche, bouton +, réglages, outils de l'assistant)**.

### D.3 Ce que chaque endroit devient en « Devis seul »

| Endroit | Aujourd'hui | En « Devis seul » | Où |
|---|---|---|---|
| Lecture des modules actifs | `verifierActivation` refuse | accepte `devis` seul ; calcule en plus la liste « démarrés » (actifs + noyau) | `registre.js:322-345` |
| Montage des modules | un module par module actif | monte aussi le CRM, **sans l'ajouter aux écrans** | `espace-modules.js:22-27` |
| Menu | un bloc par module actif | seulement « Devis » (écrans Devis, Catalogue, Vocabulaire) + le carnet « Clients » | `registre.js:389-422` |
| Premier écran | `crm/accueil` | `devis/liste` | `registre.js:353`, `espace-modules.js:32` |
| Bouton « + » | Personne, Organisation, Affaire, Devis | Devis, Client | `shell.js:282` |
| Recherche globale | Personnes, Organisations, Affaires, Devis | Clients, Devis | `shell.js:289-296` |
| Champ « Pour qui est ce devis ? » | trois groupes, dont Affaires | un groupe « Clients » ; la ligne Affaire disparaît | `editeur-ecran.js:1043-1110` |
| Liens croisés | liens vers fiche personne / organisation / affaire (`cheminPersonne`, `cheminOrganisation`, `cheminAffaire`, `editeur-ecran.js:12`, 828-829) | menent vers la fiche Client (ou sont retirés) | `editeur-ecran.js`, `liste-ecran.js:64` |
| Réglages | section CRM (étapes, phases, options, modèles, sauvegarde…) | seulement les réglages Devis | `registre.js:interrupteursDuClient 462`, `reglages.js:166` |
| Export | bouton « Exporter mes données » du module Devis (5 collections) | + contacts (et affaires cachées) | `devis/donnees.js:287` |
| Outils de l'assistant | filtrés par module actif | outils Devis + un petit jeu « clients » (voir ci-dessous) | `clients/gestionnaire.js:15-23` |
| Objectifs, accueil, statistiques | dans le module Affaires | absents au départ | `crm/index.js` |

**Outils MCP proposés à un client « Devis seul »** (sans aucun texte à coller chez l'assistant : les consignes vivent dans les descriptions des outils, décision du 30/10/2026) :
- les 26 outils du module Devis ;
- un petit jeu « clients » : chercher, lire, créer et modifier un client. Deux voies : (a) faire que `devis` déclare, en plus de ses outils, les sept outils existants (`chercher`, `lire_personne`, `lire_organisation`, `creer_personne`, `creer_organisation`, `modifier_personne`, `modifier_organisation`) ; (b) créer des outils dédiés. Recommandation : **(a)**, avec `chercher` qui n'offre pas le type « affaires » et dont les descriptions ne parlent pas d'affaires quand le module n'est pas acheté.
- exclus : tous les outils d'affaires, d'activités, de notes, de documents, de projets.

---

## E. Source de clients extensible (une page)

Jérôme ne s'engage pas : « plus tard peut-être, jamais ». On pose seulement **la bonne forme**, sans rien promettre ni chiffrer.

**Interface minimale d'une « source de clients »** : trois verbes.
1. **chercher**(texte) → liste courte `{ id, nom, sous-titre, type }` ;
2. **lire**(id) → `{ nom, e-mails, téléphones, adresse, type }` (ce dont un devis a besoin : nom du client, adresse, destinataire) ;
3. **créer**(champs) → `id`.

**Notre carnet** (le CRM interne) fournirait ces trois verbes avec `CRM.etat`, `CRM.creerPersonne` et `CRM.creerOrganisation`. Le champ « Pour qui est ce devis ? » ne devrait parler qu'à ces trois verbes (aujourd'hui il lit `CRM.etat` directement, `editeur-ecran.js:1043-1053`).

**Ce qu'un Pipedrive ou un Salesforce exigerait** (description, pas de chiffrage) : l'**authentification** de l'artisan chez ce service (jetons à renouveler) ; des **quotas d'appels** (la recherche ne peut pas se faire à chaque frappe) ; les **doublons** entre notre carnet et le leur ; le **sens de la synchronisation** (qui est la vérité : lecture seule chez eux, ou écriture dans les deux sens) ; le **vocabulaire** (un « contact » chez eux est une personne ou une organisation chez nous). Les devis garderaient leurs propres champs figés (nom, adresse) : un devis finalisé ne change jamais.

**Ce qu'on décide de NE PAS faire maintenant** : aucun connecteur, aucune synchronisation, aucune abstraction de code préventive (pas de dossier « sources » vide). La seule dépense utile est de **ne pas répandre** davantage la lecture directe de `CRM.etat` dans de nouveaux fichiers du module Devis ; les nouveaux écrans (carnet, champ client) passent par un petit fichier d'accès unique.

---

## F. Risques et pièges

| Sujet | Risque | Réponse |
|---|---|---|
| **Données de Jérôme** | Rien ne doit changer chez lui | Aucune migration. Les anciens brouillons sans affaire restent tels quels ; le rattrapage se fait à l'ouverture (jamais en masse). Toute opération sur ses données demande son accord écrit |
| **Règles Firestore** | Une règle qui devrait changer = liste d'arrêt | **Aucune règle ne doit changer** (A.5). Si un cas imprévu apparaît pendant le codage, la PR s'arrête et demande (étiquette `a-fusionner-par-jerome`, publication par workflow) |
| **Serveur** | Registre, `metier.js`, descriptions d'outils | Relecture **Fable obligatoire** (CLAUDE.md) sur les PR 1, 2, 4 et 5. Copie des fichiers de `functions/partage/` automatique |
| **`functions-plateforme/`** | Une fonction ajoutée chez Jérôme mais pas chez les clients (leçon du 26/10) | Aucune nouvelle fonction attendue : tout passe par le code partagé (`coeur`, `mcp`, `clients`) copié en entier. À vérifier à chaque PR avec `scripts/preparer-fonctions.js` ; sinon la PR écrit « absent chez les clients » avec la raison, une ligne dans `.github/A-FAIRE.md` et dans la page Réglages > Déploiement. **Contrôle des écarts entre les deux dossiers avant la première démonstration** |
| **Déploiement** | Fonctions + MCP chez les clients | Lancés un à la fois par Jérôme (« Déploiement plateforme clients »), jamais en même temps |
| **Tests qui verrouillent l'ancien comportement** | Rouges à la réécriture, vus seulement par le palier complet | Voir la liste ci-dessous : à lire (`grep`) avant d'ouvrir chaque PR et à lancer avec l'étiquette `tests-complets` |
| **Mode test** | L'affaire cachée créée côté serveur n'est pas marquée test | Voir C |
| **PDF et stockage** | Chemin `devis/<affaire>/…` | Avec l'affaire toujours présente, le repli `'sans-affaire'` (`stockage.js:63`) n'est plus utilisé pour les nouveaux devis ; pas de changement de chemin pour les anciens |
| **Dérive des PR** | Une PR qui reste ouverte se met en conflit | Une PR à la fois, fusion le jour même |

**Tests à lire ou adapter** (vérifiés présents sur `main`) :

- *Racine* : `devis-logique.test.js` (5 mentions « sans affaire » / `AFFAIRE_MANQUANTE`), `devis-serveur.test.js` (5 ; bloc `SA` l.525 : la fonction refuse de finaliser sans affaire), `devis-mcp.test.js` (7 ; bloc `SA` l.1190-1205 : SA1 brouillon sans affaire, SA2 finalisation refusée), `devis-affaire-depuis-devis.test.js` (1 ; « jamais de repli » sur l'étape), `devis-client-devis.test.js` (5), `devis-pdf-auto.test.js`, `logique.test.js`, `projets.test.js`, `registre.test.js` (10 ; dépendances l.41-43, interrupteurs l.376).
- *E2E* : `devis-sans-affaire.spec.js` (tests 1, 3, 4), `devis-nouveau-sans-blocage.spec.js` (tests 4 à 8), `devis-choix-client.spec.js` (3), `devis-editeur.spec.js` (2), `devis-editeur-mise-en-page.spec.js`, `modules-client.spec.js`, `projets.spec.js`, `parcours.spec.js` (C19, liste des collections exportées, l.718-745), `devis-barre-globale.spec.js`.
- Tout nouvel écran se teste aussi en format téléphone (`--project=telephone`), et `npm run test:module look-compact` pour tout CSS (leçons de CLAUDE.md).

---

## G. Découpage en PR et décisions à prendre

Chaque PR : une seule idée, mergée le jour même, **rien de visible chez Jérôme tant qu'aucun client n'est « Devis seul »** (sauf la PR 3, voir question 2). Les fichiers sont comptés d'après les listes des parties A à F (sans compter les tests ajoutés, ni `wiki/` régénéré).

| N° | PR | Fichiers (ordre de grandeur, vérifié) | Risque | Fable | Ce que Jérôme voit à l'écran |
|---|---|---|---|---|---|
| **1** | **Registre : « noyau de données »** : `devis` n'exige plus Affaires affiché ; calcul de « démarrés » vs « actifs » (+ `docs/activer-desactiver-modules.md`) | `registre.js`, `espace-modules.js`, `espace.js`, `reglages.js`, `scripts/plateforme/commun.js` ; tests `registre.test.js`, `modules-client.spec.js` ≈ **7** | moyen (le serveur lit le même fichier) | **obligatoire** | rien (aucun client « Devis seul » encore) |
| **2** | **Coque : cacher** menu, « + », recherche et Réglages du CRM quand il n'est pas acheté mais démarré ; premier écran = liste des devis | `shell.js`, `espace-modules.js`, `reglages.js`, `crm/index.js` ; tests `menu-vocabulaire.test.js`, `menu-coque-badge.spec.js` ≈ **6** | moyen (navigation) | **obligatoire** (structure d'écran) | rien |
| **3** | **Carnet « Clients »** : formulaire court + liste simple dans le module Devis ; « Particulier / Société » ; point d'accès unique aux clients (E) | `devis/clients-ecran.js` (nouveau), `devis/index.js`, `registre.js` (écran), `css/devis.css`, `crm/personnes.js` ou `composants.js` (réutilisation) ≈ **6** | faible à moyen | utile (nouvel écran) | selon la question 2 |
| **4a** | **Affaire cachée : écran** (création du brouillon liée, nom, étape de départ, ligne Affaire retirée du champ client) | `actions-devis.js`, `editeur-ecran.js`, `editeur-logique.js`, `affaire-depuis-devis.js`, `client-devis.js` + 4 tests e2e et 3 tests racine à réécrire ≈ **12** | **élevé** (éditeur du devis) | **obligatoire** (gros écran) | rien en mode Devis + Affaires (comportement actuel gardé) |
| **4b** | **Affaire cachée : serveur / assistant** (`creerDevisBrouillon`, `creerDevisDepuisModele`, repère test recopié, textes d'outils) | `metier.js`, `mcp/outils/ecriture.js`, `lecture.js` ; tests `devis-mcp`, `devis-serveur` ≈ **6** | **élevé** | **obligatoire** | rien |
| **5** | **Outils de l'assistant « Devis seul »** : jeu « clients » déclaré dans `devis`, `chercher` sans affaires | `registre.js`, `clients/gestionnaire.js`, `mcp/outils/lecture.js` ; tests `registre-mcp`, `mcp-clients`, `mcp-module` ≈ **6** | moyen | **obligatoire** | rien |
| **6** | **Export** : contacts et affaires cachées dans l'export Devis | `devis/donnees.js:287`, `devis/export.js` ; test C19 ≈ **3** | faible | non requise (mais E2E C19) | l'export Devis grossit |
| **7** | **Recette de bout en bout** « Devis seul » puis « Devis + Affaires » (achat en cours de route) et docs (`deploiement-client.md`, `activer-desactiver-modules.md`) | 1 e2e + 3 docs ≈ **4** | faible | non (docs) | rien |

Ordre : 1 → 2 → 3 → 4a/4b → 5 → 6 → 7. Les PR 1 et 2 se testent déjà avec un client de démonstration en « Devis seul ». Un déploiement des fonctions et du MCP chez les clients suit les PR 4b et 5 (Jérôme le lance).

### Décisions que Jérôme doit prendre (une phrase chacune)

1. **Quelle option pour « Devis seul » : lever la dépendance (option 2) ou garder Affaires allumé et masqué (option 1) ?** *Recommandation : option 2.*
2. **Comment tester chez toi sans éteindre ton propre CRM ?** *Recommandation : un client de démonstration en « Devis seul » (jamais ton espace) ; le carnet « Clients » et les écrans cachés ne s'ouvrent que si le CRM est caché, donc c'est la seule exception à « même code partout » (le code est le même, c'est la fiche qui change).*
3. **En « Devis + Affaires », le brouillon reste-t-il libre (comportement actuel) ou est-il toujours lié à une affaire ?** *Recommandation : garder le comportement actuel ; seule la finalisation exige l'affaire.*
4. **Une affaire cachée par devis (recommandé) ou une seule par client ?**
5. **À l'achat d'Affaires, range-t-on les affaires cachées selon l'état des devis (signé → Gagnée, refusé → Perdue) avec un outil que tu lances, ou les laisse-t-on à l'étape de départ ?** *Recommandation : l'outil, sur demande, jamais automatique.*
6. **Particulier / Société : un seul mot « Client » avec le choix du type ?** *Recommandation : oui.*
7. **Le client « Devis seul » a-t-il un accueil (chiffres des devis du mois) ou seulement la liste ?** *Recommandation : la liste, un accueil plus tard.*

### Tableau « module acheté / ce que le client voit »

| Modules achetés | Menu | Ce qu'il peut faire | Ses contacts | Ses affaires |
|---|---|---|---|---|
| **Devis seul** | Devis (liste, Catalogue, Vocabulaire), Clients, Réglages Devis | tout le cycle du devis (brouillon → signé), PDF, e-mail, assistant pour les devis et les clients | carnet « Clients » (nom, e-mail, téléphone, adresse) | **créées en silence**, invisibles |
| **Devis + Affaires** | Accueil, Personnes, Organisations, Affaires, Devis | comme aujourd'hui (le comportement de Jérôme) ; il retrouve ses clients (devenus Personnes / Organisations) et ses affaires | complets | visibles (une par devis) |
| **Devis + Affaires + Projets** | + Projets | comme aujourd'hui | complets | visibles, projets possibles |
| **Affaires seul** (déjà possible) | Accueil, Personnes, Organisations, Affaires | CRM sans devis ; montant d'affaire saisi à la main | complets | visibles |
