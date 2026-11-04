# Étude de faisabilité : le module Devis vendable seul

*Étude du 04/11/2026, demandée par Jérôme (priorité haute), **réécrite le 04/11/2026 (soir) après sa décision** (voir ci-dessous), **complétée le 04/11/2026 par la partie H (le menu de la plaquette : Devis, Clients, Catalogue, Relances, Statistiques) et la partie I (l'affichage par membre)**. **Mise à jour du 04/11/2026 (2e décision de Jérôme, plus récente que la PR 511) : le carnet `devis_clients` et la migration disparaissent ; les clients du devis sont de vraies fiches Personnes/Organisations, via un noyau « Contacts ». Cette décision REMPLACE celle du carnet de la PR 511.** **Aucun code n'est écrit ici** : on vérifie ce qui existe, on dit ce qu'il faudrait changer, on propose un découpage en petites PR et on pose les questions à trancher. Chaque affirmation technique renvoie à un fichier et une ligne (état de `main` au 04/11/2026). Les chiffres d'exemple partent de 100 €.*

## La décision de Jérôme (04/11/2026), qui commande tout le reste

> « Quand un client n'a que le module Devis, on n'utilise ni CRM, ni Personnes/Organisations, ni Affaires, ni Projets. Une petite table stocke les noms de clients et les e-mails déjà tapés, pour l'auto-complétion dès les 3 premières lettres. On ne fait que ça : pas besoin de faire tourner Personnes, Organisations, Affaires, Projets en tâche de fond. La règle « un devis ne peut pas exister sans affaire » s'affine : si le module Affaires existe, un devis ne peut pas exister sans affaire ; si le module Devis est seul, un devis peut exister seul, puisque Affaires n'existe pas. »

> **2e décision de Jérôme (04/11/2026, remplace le carnet ci-dessus)** : « Pas de systèmes de migration. Le plombier voit son affichage de devis ; sa secrétaire, si le module Affaires est acheté, a une autre interface avec aussi les affaires et les projets. La MÊME base de données derrière, seul l'affichage change. Le CRM minimal vit dans le vrai CRM. On utilise tout de suite les vraies bases. » Elle l'emporte sur tout passage de cette étude qui parle encore d'un carnet à part.

Ce que cela change par rapport à la première version de l'étude (les décisions 4 et 5 deviennent **caduques** : plus d'affaire cachée, donc plus de question de rangement à l'achat) :

- **Le module Devis ne dépend plus d'Affaires**, mais d'un **noyau « Contacts » léger** (personnes et organisations seulement, sans les écrans ni les écouteurs d'Affaires et de Projets) : voir D.
- **Plus de carnet à part** (2e décision) : le client saisi est une **vraie fiche minimale** du CRM.
- **La règle de finalisation s'affine** (décision 3 précisée) : l'affaire n'est exigée que si le module Affaires est actif.

## Résumé (lisible sans connaître le code)

1. **Le but** : vendre le module Devis seul à un artisan : il voit ses devis, ses clients, son catalogue, ses relances et ses statistiques, **sans** Affaires ni Projets, avec **la même base de données** que le CRM complet.
2. **C'est faisable, sans deux codes séparés** : le programme est le même ; la fiche du client dit ce qu'il a acheté, et (partie I) la fiche de chaque **membre** dit ce qu'il voit.
3. **Aujourd'hui c'est refusé par le code** : le module Devis déclare qu'il ne peut pas marcher sans Affaires (`js/os/registre.js:134`, refus dans `verifierActivation`, l.322-336).
4. **L'obstacle, plus petit que prévu** : `js/modules/devis/donnees.js:10` importe la couche de données du CRM et `demarrer()` (l.107-109) en dépend. Plutôt que de la découper, on ajoute un **mode « noyau »** qui n'écoute que `crm_personnes` et `crm_organisations` (PR 1).
5. **Les clients du devis sont de vraies fiches** (Personnes / Organisations, fiche minimale), écrites par la couche CRM existante et son journal. **Aucune collection nouvelle, aucune règle Firestore nouvelle** (vérifié : le joker de `firestore.plateforme.rules:182-184` suffit), **aucune migration**, aucun outil MCP nouveau (sept outils existants déplacés dans le module Contacts).
6. **Règle de finalisation** : avec Affaires actif, un nouveau devis finalisé exige une affaire ; en « Devis seul », non. Un devis finalisé sans affaire **reste valable** après l'achat d'Affaires (bouton existant « créer une affaire depuis ce devis »).
7. **Le menu de la plaquette (partie H)** : **Devis · Clients · Catalogue · Relances · Statistiques**. *Relances* = devis envoyés sans réponse depuis N jours (10 par défaut), brouillon d'e-mail de relance (jamais d'envoi), tracée comme une ligne d'envoi de plus. *Statistiques* = chiffres des seuls devis (règle de la PR 510 : archivé compte).
8. **L'affichage par membre (partie I)** : le plombier voit Devis ; sa secrétaire, si Affaires est acheté, voit aussi les affaires et les projets. **C'est de l'affichage, pas de la confidentialité** (les règles Firestore sont par rôle et par collection).
9. **Ce qui ne change pas chez Jérôme** : ses données et son écran complet (règle du 18/10/2026 : même code, la fiche décide).
10. **Découpage proposé : 12 PR**, 10 exigent la relecture Fable (1 à 7, 10, 11, 12), 2 non (8, 9). **Aucune PR de règles Firestore.** À ne pas promettre à un client : envoi direct à un logiciel de facturation, familles libres, agent autonome, branchement à Pipedrive ou Salesforce, cloisonnement des données entre membres.

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
- Le texte de `creer_devis_brouillon` dit que l'affaire est **facultative** et que la finalisation l'exige (`functions/src/mcp/outils/ecriture.js:184`) ; `chercher` renvoie aussi des affaires (`lecture.js:~13-20`, paramètre `types`).

### A.5 Règles Firestore

`firestore.rules` (Jérôme) et `firestore.plateforme.rules` (clients) décident par **rôle et par collection**, jamais par module actif (le mot `modules` n'y apparaît que pour la fiche `clients/<client>`, `firestore.plateforme.rules:41-44`). Pour `devis_devis` : un brouillon neuf doit avoir `statut=brouillon`, `numero` vide, `version=1` (`firestore.rules:71-74`) ; rien n'oblige ni n'interdit `affaireId`. **Aucune règle ne change, aucune n'est ajoutée** (2e décision, partie B : pas de collection nouvelle).


### A.6 Exports (règle « chaque module a son bouton d'export »)

- L'export du module Devis contient ses cinq collections : `js/modules/devis/donnees.js:287` (`devis_articles`, `devis_parametres`, `devis_devis`, `devis_vocabulaire`, `devis_usage_articles`).
- L'export complet (Réglages > section CRM) et les contacts `.vcf` appartiennent à l'écran du CRM : `js/modules/crm/export.js:8`, test `tests/e2e/parcours.spec.js:718` (C19, liste des collections attendue).
- En « Devis seul », les clients sont de vraies fiches : le module Contacts a **son propre bouton d'export** (règle du 27/10/2026), pas de 6e collection dans l'export Devis (PR 8, test C19 à vérifier).

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

## C. Plus d'affaire cachée : la règle de finalisation affinée

**Décision (04/11/2026)** : « si le module Affaires existe, un devis ne peut pas exister sans affaire ; si le module Devis est seul, un devis peut exister seul ». Les **PR 4a et 4b de la première étude** (créer une affaire en silence à chaque devis, côté écran et côté serveur) et **la décision 5** (ranger les affaires cachées à l'achat) **sont supprimées**.

**Décision prise seul : la lecture « finalisation exige l'affaire ».** La phrase se lit de deux façons : (1) « un brouillon est toujours lié à une affaire dès sa création » ou (2) « on ne peut pas **finaliser** un devis sans affaire ». J'ai choisi la **2e lecture**, qui est le comportement **actuel** de Jérôme : un brouillon vit déjà sans affaire (décision du 28/10/2026, « Nouveau devis sans blocage »), et seule la finalisation exige l'affaire (`MESSAGE_AFFAIRE_MANQUANTE`, `js/modules/devis/logique.js:797` ; contrôle `if (!devis.affaireId)` l.824 dans `erreursFinalisation`, l.820). Elle ne change donc rien chez Jérôme. **Question laissée visible pour Jérôme** : voulez-vous plus tard que, quand Affaires est actif, un brouillon soit aussi toujours lié à une affaire dès sa création ?

**Ce qui change vraiment : l'appelant, pas la fonction.** `erreursFinalisation` est une fonction **pure** (copiée dans `functions/partage/` et `functions-plateforme/serveur/`, deux dossiers **ignorés par git** et régénérés par `scripts/preparer-fonctions.js` : `.gitignore:15` et `:21`). **Aucune PR ne modifie ces copies.** On ajoute à la fonction une option (nom proposé `affairesActif`, **valeur par défaut `true`** pour ne rien changer chez Jérôme ni dans les tests existants) et chaque appelant doit lui dire si le module Affaires est actif :

| Appelant | Où | D'où vient « Affaires actif » |
|---|---|---|
| Écran (finalisation) | `js/modules/devis/editeur-ecran.js:2195` ; aussi `logique.js:1007` (finalisation préparée) | les modules actifs de l'espace (écran : `js/os/espace.js:121`) |
| Fonction du serveur `devisFinaliser` | `functions/src/coeur/devis.js:163` | modules actifs du client, lus par `functions/src/clients/espaces.js:19` (`modulesActifsDuClient`) **à faire passer jusqu'au contexte `ctx`**, qui ne les porte pas aujourd'hui |
| Assistant (`finaliser_devis`) | `functions/src/coeur/metier.js:1358` | idem (contexte `c`) |
| Lecture du devis par l'assistant (`erreursFinalisation` listées) | `functions/src/coeur/lecture.js:455` | idem |

**Décision prise seul : côté Jérôme, « Affaires actif » = vrai.** Le serveur de Jérôme (`functions/`) n'a **pas de fiche `clients/<client>`** (le serveur des clients non plus ne la lit pas pour les membres, `functions/src/coeur/config.js:5`) : il n'y a donc rien à lire, et son espace complet a toujours Affaires. La valeur par défaut (vrai) s'applique ; seuls les espaces clients passent l'information réelle. **Question restante pour Jérôme** : confirmer que son espace garde toujours le module Affaires (sinon il faudra lui donner une fiche ou un réglage).

**Textes** : `MESSAGE_AFFAIRE_MANQUANTE` n'apparaît qu'avec Affaires actif ; les textes d'outils qui disent « la finalisation exige l'affaire » (`functions/src/mcp/outils/ecriture.js:184,192,220`) doivent dire « si le module Affaires est actif ».

**Montant et PDF** : sans affaire, le calcul du montant de l'affaire ne fait rien (`functions/src/coeur/devis.js:134-137` : « pas d'affaire = null »). Le PDF est rangé sous `devis/sans-affaire/<devis>/…` (`functions/src/devis/stockage.js:63`, repli `'sans-affaire'`) : en « Devis seul », **c'est le chemin normal** ; il fonctionne déjà (à confirmer par un test dans la PR 7). Anciens chemins inchangés.

**Numérotation des devis** : aucun changement. Le compteur `devis_compteurs/global` (`functions/src/coeur/devis.js:26`) est global au client et ne dépend ni de l'affaire ni des modules.

**Mode test** : l'écran pose `test: true` sur ce qu'il crée (`avecModeTest`) ; les fiches créées en mode test portent le repère ; l'assistant ne le pose jamais. **Sans affaire cachée, le risque de la première étude disparaît**, et l'héritage du repère (« PR 1a-2b » du chantier mode test, `docs/cadrage-mode-test.md:201`, citée dans le brief comme la PR 507) **n'a plus d'utilité pour ce chantier** : rien à rattacher.

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
| Menu | un bloc par module actif | **Devis · Clients · Catalogue · Relances · Statistiques** (partie H) | `registre.js:389-422` |
| Premier écran | `crm/accueil` | `devis/liste` | `registre.js:353`, `espace-modules.js:32` |
| Bouton « + » | Personne, Organisation, Affaire, Devis | Devis, Client | `shell.js:282` |
| Recherche globale | Personnes, Organisations, Affaires, Devis | Clients, Devis | `shell.js:289-296` |
| Champ « Pour qui est ce devis ? » | trois groupes (Personnes, Organisations, Affaires) | deux groupes (Personnes, Organisations) ; la ligne Affaire est **retirée** | `editeur-ecran.js:1043-1110` |
| Liens croisés | vers fiche personne / organisation / affaire | vers la fiche du client ; pas de lien d'affaire | `editeur-ecran.js:12`, 828-829 |
| Réglages | section CRM + Devis | Devis + une section « Clients » (sauvegarde) | `js/os/reglages.js:166` |
| Export | « Exporter mes données » (5 collections de Devis) | + un bouton du module Contacts (personnes, organisations) | `devis/donnees.js:287`, PR 8 |
| Outils de l'assistant | filtrés par module actif | 26 outils Devis + les outils Contacts (ci-dessous) | `clients/gestionnaire.js:15-23` |
| Accueil, statistiques | dans le module Affaires | pas d'Accueil CRM ; **Statistiques** et **Relances** de devis (partie H) | `crm/index.js` ; `js/modules/devis/` |

**Outils MCP d'un profil « Devis seul »** : les outils pour retrouver, lire, créer et modifier un client **existent déjà** (module `affaires`, `registre.js:86-93`) : `chercher`, `lire_personne`, `lire_organisation`, `creer_personne`, `creer_organisation`, `modifier_personne`, `modifier_organisation` (sept). *Décision prise seul :* les **déclarer dans le module `contacts`** (que `affaires` et `devis` exigent) plutôt que d'en écrire de nouveaux ; `supprimer_personne`, `supprimer_organisation`, `lire_audit` et `restaurer_depuis_audit` restent dans `affaires` (supprimer ou restaurer une fiche touche aux affaires liées). Aucun nouvel outil, **mais** la liste des outils par module change : `tests/mcp-clients.test.js` (l.597-601 : `OUTILS.length - 31`, `- 26`, `seuls(['affaires'])` contient `chercher`) est à adapter **en lançant les tests, jamais à l'estime** (Devis seul = 26 + 7 = 33 outils). *Question restante :* le plombier doit-il pouvoir faire supprimer un client par son assistant ?

**Un devis finalisé sans affaire reste valable après l'achat d'Affaires.** La règle « la finalisation exige l'affaire » (partie C) ne vaut que pour les **nouveaux** devis finalisés ; les devis déjà finalisés restent lisibles, avec leur PDF, leur historique d'envois, leurs statuts (la liste écrit déjà « Sans affaire »). Le bouton existant « Créer une affaire depuis ce devis » (`js/modules/devis/affaire-depuis-devis.js`) permet de les rattacher : c'est un geste de l'utilisateur, **pas une migration**.

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
| **Données de Jérôme** | Rien ne doit changer chez lui | Aucune migration. Valeur par défaut `affairesActif = true`. Toute opération sur ses données demande son accord écrit |
| **Règles Firestore** | Aucune règle nouvelle (2e décision) ; seul risque : une fiche de membre qui porterait un droit | Le champ `vue` est de l'affichage, jamais un droit (partie I). Si une règle devenait nécessaire plus tard : liste d'arrêt, PR laissée à Jérôme |
| **Découpage de la couche de données** | Casser les écritures et le journal des devis, des articles et du vocabulaire de Jérôme | PR 1 sans aucun changement de comportement ; Fable obligatoire ; tests des modules Devis et CRM, puis « Tests de nuit » sur `main` après fusion |
| **Serveur** | Registre, `metier.js`, descriptions d'outils | Relecture **Fable obligatoire** (CLAUDE.md) sur les PR 1 à 7, 10, 11 et 12 |
| **`functions-plateforme/`** | Une fonction ajoutée chez Jérôme mais pas chez les clients (leçon du 26/10) | Aucune nouvelle fonction du serveur attendue, mais des **outils MCP déplacés vers le module Contacts**, un **nouveau contexte** (modules actifs et vue du membre) et une **nouvelle fonction du serveur** (régler la vue d'un membre, PR 4) : tout passe par le code partagé (`coeur`, `mcp`, `clients`), copié en entier par `scripts/preparer-fonctions.js`. À vérifier à chaque PR ; **contrôle des écarts entre les deux dossiers avant la première démonstration** |
| **Déploiement** | Fonctions + MCP chez les clients | Lancés un à la fois par Jérôme, jamais en même temps |
| **Tests qui verrouillent l'ancien comportement** | Rouges à la réécriture, vus seulement par le palier complet | Liste ci-dessous : à lire (`grep`) avant chaque PR et à lancer avec l'étiquette `tests-complets` |
| **PDF et stockage** | Chemin `devis/sans-affaire/…` | Devient le chemin normal en « Devis seul » ; à tester (PR 7) |
| **Dérive des PR** | Une PR ouverte se met en conflit | Une PR à la fois, fusion le jour même |

**Tests à lire ou adapter** (vérifiés présents sur `main` ; quelques mentions par fichier) :

- *Racine* : `devis-logique.test.js` (mentions « sans affaire » / `AFFAIRE_MANQUANTE` : l'option `affairesActif` ajoute des cas, l'ancien reste vrai par défaut), `devis-serveur.test.js` (bloc `SA` l.525, finalisation refusée sans affaire), `devis-mcp.test.js` (bloc `SA` l.1190-1205), `devis-client-devis.test.js`, `devis-pdf-auto.test.js`, `logique.test.js`, `registre.test.js` (l.40-44 : **ajouter** « devis sans dépendance », cas « devis seul »), `devis-affaire-depuis-devis.test.js` (inchangé : ce bouton reste utile avec Affaires).
- *E2E* : `devis-sans-affaire.spec.js`, `devis-nouveau-sans-blocage.spec.js`, `devis-choix-client.spec.js`, `devis-editeur.spec.js`, `devis-editeur-mise-en-page.spec.js`, `modules-client.spec.js` (**ajouter** un cas « devis seul »), `parcours.spec.js` (C19, l.718-745), `devis-barre-globale.spec.js`.
- Tout nouvel écran se teste aussi en format téléphone (`--project=telephone`), et `npm run test:module look-compact` pour tout CSS (leçons de CLAUDE.md).

---

## G. Découpage en PR et décisions à prendre

Chaque PR : une seule idée, fusionnée le jour même, **rien de visible chez Jérôme tant qu'aucun client n'est « Devis seul »** (sauf les PR 10 à 12 : Statistiques et Relances existent aussi chez lui, même code). **Plus aucune PR de règles Firestore ni de migration** (décision du 04/11/2026, partie B). Numérotation **refaite** : l'ancienne PR 4 (carnet + règles) et l'ancienne PR 10 (migration) n'existent plus.

| N° | PR | Dépend de | Fable | Ce que Jérôme voit à l'écran |
|---|---|---|---|---|
| **1** | **Noyau Contacts dans la couche de données** : option `noyau` de `CRM.demarrer` (seulement personnes et organisations), `demarrer()` du module Devis sans refus, listes d'affaires vides acceptées (D.3) | aucune | **obligatoire** (données, journal) | rien (aucun changement de comportement) |
| **2** | **Registre** : module `contacts` (écran Clients, collections `crm_personnes`/`crm_organisations`, sept outils MCP déplacés) ; `devis` et `affaires` en dépendent ; `devis` n'exige plus `affaires` ; tests `registre.test.js`, `modules-client.spec.js`, `mcp-clients.test.js` ; `docs/activer-desactiver-modules.md` | 1 | **obligatoire** (le serveur lit le même fichier) | rien |
| **3** | **Règle de finalisation affinée** : option `affairesActif` (défaut vrai) dans `erreursFinalisation` ; appelants écran et serveur ; modules actifs portés par le contexte ; textes d'outils ; test « un devis finalisé sans affaire reste valable après l'achat d'Affaires » | 2 | **obligatoire** (serveur) | rien |
| **4** | **Vue par membre** (partie I) : champ `vue`, modules visibles, fonction du serveur pour la régler, réglage dans « Qui peut se connecter » | 2 | **obligatoire** (serveur, données) | rien tant qu'aucun membre n'a de `vue` |
| **5** | **Source de suggestions + écran « Clients »** : champ « Pour qui est ce devis ? » et destinataires (coordination PR 508), ligne Affaire retirée sans Affaires, création de fiche minimale, texte « chantier » (H.3) | 1, 3 (et PR 508 fusionnée) | **obligatoire** (gros écran, éditeur du devis) | le champ client ne change pas avec Affaires actif |
| **6** | **Coque** : menu **Devis · Clients · Catalogue · Relances · Statistiques** selon la vue du membre (Catalogue au premier niveau ; Relances et Statistiques apparaissent quand les PR 10 à 12 sont fusionnées), « + », recherche, Réglages, premier écran sans les écrans d'Affaires quand ils ne sont pas visibles | 2, 4 | **obligatoire** (structure d'écran) | rien |
| **7** | **Serveur et assistant** : outils Contacts offerts à un profil Devis (suivant la vue), textes des outils (« si le module Affaires est actif »), comptes des tests | 2, 3, 4 | **obligatoire** (serveur) | rien |
| **8** | **Export** : bouton d'export du module Contacts (personnes, organisations) ; test C19 | 2 | non requise (lecture seule ; E2E C19) | un bouton de plus |
| **9** | **Recette de bout en bout** « Devis seul » puis « Devis + Affaires » (achat en cours de route, aucune migration, deux membres, deux vues) et docs (`deploiement-client.md`, `activer-desactiver-modules.md`) | 1 à 8, 10 à 12 | non (docs) | rien |
| **10** | **Statistiques de devis** (H.5) : fonction pure `statistiquesDevis` sur `montantDesDevis`, écran, exclusion des devis de test, règle de la PR 510 (archivé compte) | 6 ; **PR 510 fusionnée** | **obligatoire** (nouvel écran, données) | un écran Statistiques |
| **11** | **Relances côté serveur** (H.4, option (a)) : origine `relance` dans `ORIGINES_ENVOI` et `LIBELLES_ORIGINE_ENVOI`, libellé de `enregistrer_envoi_devis`, réglage du délai (10 jours, plus court que la validité) ; **aucune collection, aucune règle** | aucune | **obligatoire** (serveur, données) | rien |
| **12** | **Relances côté écran** : écran « Relances », bouton « Préparer l'e-mail de relance » (même fenêtre, brouillon Gmail, jamais d'envoi), cas vide et cas d'erreur | 6, 11 | **obligatoire** (nouvel écran, e-mail) | un écran Relances |

Ordre conseillé : 1 → 2 → (3, 4 en parallèle) → 5 (après la PR 508) → 6 → 7 → 8 → (10 après la PR 510, 11 puis 12) → 9. **10 PR sur 12 exigent Fable** (1 à 7, 10, 11, 12). Un déploiement des fonctions et du MCP chez les clients suit les PR 3, 4, 7 et 11 (Jérôme le lance). **Aucune règle Firestore à publier.**

### État des décisions

1. **Dépendance du module Devis** : « Devis seul sans CRM » (04/11/2026, PR 511) **remplacé** par un **noyau Contacts** sur les vraies fiches (04/11/2026, 2e décision de Jérôme).
2. **Comment tester chez Jérôme sans éteindre son CRM ?** *Recommandation : un client de démonstration en « Devis seul » (jamais son espace), avec deux membres de vues différentes.* Reste à confirmer.
3. **Devis et affaire** : précisée par Jérôme ; **Décision prise seul : lecture « finalisation exige l'affaire »** (voir C), seulement pour les nouveaux devis. *Question visible* : veut-il aussi, plus tard, des brouillons toujours liés quand Affaires est actif ?
4. **Une affaire cachée par devis ?** — **caduque.**
5. **Rangement à l'achat / migration d'un carnet** — **caduque** : plus de carnet, plus de migration.
6. **Particulier / Société : un seul mot « Client » avec le choix du type ?** *Recommandée : oui* ; ce sont les mots de l'écran « Clients » pour Personne / Organisation, la base garde ses noms.
7. **Accueil ou liste ?** — la **liste des devis reste le premier écran** ; l'équivalent d'un accueil est **Statistiques** (partie H). *Décision prise seul : pas d'accueil à part.* *Question restante :* Statistiques en premier écran ?
8. **Menu de la plaquette (partie H)** : décisions prises seul (Vocabulaire et Réglages hors menu principal, chantier = adresse du chantier puis libellé, relance à 10 jours, option (a), pas d'export de plus pour Relances et Statistiques), avec leurs questions dans la partie H.
9. **Vue par membre (partie I)** : décisions prises seul (champ `vue` facultatif, règle par Jérôme, outils MCP qui suivent la vue) ; question : qui règle la vue ?
10. **Nouvelles questions** : (a) son espace garde-t-il toujours Affaires (C) ? (b) la PR 508 définit-elle déjà la source de suggestions (E) ? (c) les outils de suppression de client restent-ils réservés à Affaires (D.4) ?

### Tableau « module acheté / ce que le client voit »

| Modules achetés | Menu | Ce qu'il peut faire | Ses clients | Ses affaires |
|---|---|---|---|---|
| **Devis seul** | **Devis · Clients · Catalogue · Relances · Statistiques** (Vocabulaire dans la liste, Réglages dans le menu utilisateur) | cycle du devis (brouillon → signé), PDF, e-mail, **relances**, **statistiques**, assistant pour les devis et les clients | **Clients** = les vraies fiches Personnes / Organisations (fiche minimale) | **aucune** (le module n'existe pas) ; un devis finalisé existe seul |
| **Devis + Affaires** | par membre selon sa vue : le plombier garde l'affichage Devis ; la secrétaire a en plus Accueil, Affaires (et Projets si achetés) | la même base ; un nouveau devis finalisé exige une affaire | les mêmes fiches, **sans migration** | visibles pour qui a Affaires dans sa vue |
| **Devis + Affaires + Projets** | idem + Projets | comme aujourd'hui | complets | visibles, projets possibles |
| **Affaires seul** (déjà possible) | Accueil, Personnes, Organisations, Affaires | CRM sans devis ; montant d'affaire saisi à la main | complets | visibles |

---

## H. Le menu d'un client « Devis seul » (plaquette commerciale, 04/11/2026)

**Demande de Jérôme (04/11/2026)** : la plaquette « Votre devis chiffré avant d'avoir quitté le chantier » montre, pour quelqu'un qui n'achète **que** le module Devis, un menu **Devis · Clients · Catalogue · Relances · Statistiques**, un tableau Devis (Brouillon, Envoyé, Devis signé, Devis refusé), une recherche « Numéro, client ou chantier… » et les boutons Catalogue, Vocabulaire, « + Nouveau devis ». Elle promet « relances, historique, reporting ». *« Je dois pouvoir mettre en œuvre ce genre de solution pour quelqu'un qui n'achète que le module Devis. »* Cette section adopte ce menu. Aucun prix ni nom de client de la plaquette n'est repris ici.

### H.1 Le menu retenu

| Entrée | Existe déjà ? | À créer | Vit de quelles données | PR |
|---|---|---|---|---|
| **Devis** | **Oui** : vues Liste et Tableau (`liste-ecran.js`), quatre colonnes `COLONNES_TABLEAU` = Brouillon · Envoyé (avec « Finalisé ») · Devis signé · Devis refusé (`liste.js:180-184`) ; filtres statut et période ; recherche ; « + Nouveau devis » (`liste-ecran.js:211`) | rien de nouveau ; seulement le libellé « chantier » (H.3) | `devis_devis` | aucune (PR 6 pour le menu) |
| **Clients** | **Oui** : les écrans Personnes et Organisations du CRM (`crm/personnes.js`, `crm/organisations.js`) | un écran « Clients » simplifié (liste unique Particulier / Société, fiche minimale, sans affaires ni activités), sinon les mêmes écrans | `crm_personnes`, `crm_organisations` (vraies fiches) | PR 5 (écran), PR 6 (entrée de menu) |
| **Catalogue** | **Oui** : `#/devis/bordereau` (`bordereau.js`), aujourd'hui un bouton de la liste | une **entrée de premier niveau** du menu pour ce profil ; le bouton reste dans la liste | `devis_articles` et familles | PR 6 |
| **Relances** | **Non** (aucune relance : `grep -i relance js/modules/devis` = 0) ; mais tout le nécessaire existe : `envois[]`, `envoyeLe`, `historiqueEnvois` (`email-brouillon.js:77`), « Préparer l'e-mail » déjà permis pour un devis envoyé (`emailPossible`, `email-brouillon.js:25`) | un écran « Relances » + une fonction pure + un réglage de délai (H.4) | `devis_devis` (pas de nouvelle collection si l'option (a) est retenue) | PR 11 (serveur), PR 12 (écran) |
| **Statistiques** | **Non** (`grep -iE "statisti\|reporting" js/modules/devis` = 0) | une fonction pure + un écran (H.5) | `devis_devis` | PR 10 |

**Vocabulaire et Réglages Devis restent accessibles.** *Décision prise seul :* **Vocabulaire** garde son bouton dans la liste des devis (là où il est aujourd'hui, comme sur la plaquette) et **Réglages** reste dans le menu utilisateur (`docs/consignes-ui.md`, « Menu de gauche » : Réglages n'est jamais dans le menu principal) ; ce ne sont donc pas des entrées de premier niveau. *Question restante pour Jérôme :* préfère-t-il aussi Vocabulaire au premier niveau ?

**Même code chez Jérôme et chez les clients (18/10/2026).** Relances et Statistiques de devis existent **aussi chez Jérôme** (le module Devis est le même) : il les voit chez lui, il est le bêta-testeur. C'est la **fiche du client** (sa liste de modules) qui décide du menu : avec Affaires actif, Jérôme garde son menu complet (Accueil, Personnes, Organisations, Affaires, Devis…) et trouve Relances et Statistiques **dans l'écran Devis** (onglets de la page du module, comme Veille et Automatisations : une entrée de menu par module, `docs/consignes-ui.md`, 23/10/2026) ; sans Affaires, ces mêmes écrans passent au premier niveau avec Clients et Catalogue. *Décision prise seul :* un seul jeu d'écrans, deux façons de les ranger ; aucun écran réservé aux clients. *Question restante :* Jérôme veut-il le menu « à plat » aussi chez lui ?

### H.2 « Clients » = les vraies fiches Personnes et Organisations

Depuis la 2e décision de Jérôme (04/11/2026, partie B), **Clients** n'est plus un carnet à part : c'est le **menu** qui montre les **vraies fiches** `crm_personnes` et `crm_organisations`. Le mot « Clients » n'est pas interdit par `docs/consignes-ui.md` (seul « CRM » l'est, 18/10/2026) et correspond à la décision 6 (un seul mot « Client », avec le choix Particulier / Société). *Décision prise seul :* l'écran « Clients » est **le même objet** que Personnes et Organisations (jamais un troisième type de fiche) ; il en montre la version **simplifiée** : une liste, la recherche, et la fiche minimale (nom, e-mail, téléphone, adresse). Chez Jérôme et pour qui voit Affaires, les écrans complets Personnes et Organisations restent seuls dans le menu : « Clients » n'y est pas ajouté (pas de doublon). *Question restante :* écran « Clients » simplifié, ou les écrans Personnes et Organisations tels quels sous le mot « Clients » ?

### H.3 « Chantier » en Devis seul

La plaquette dit « chantier ». En Devis seul il n'y a **pas d'affaire** ; la colonne et la recherche « chantier » se lisent ainsi. *Décision prise seul :* le **chantier d'un devis** est son **adresse de chantier** (`adresses.chantier`, déjà lue par `document.js:226` et l'éditeur `editeur-ecran.js:1001`), et, si elle est vide, le **libellé (objet) du devis**. La recherche « Numéro, client ou chantier… » (aujourd'hui « Numéro, client ou affaire », `liste-ecran.js:88`) lit ces champs quand Affaires n'est pas actif ; avec Affaires actif le texte reste « affaire ». *Question restante :* Jérôme préfère-t-il « adresse du chantier » seule, ou « libellé du devis » seul ?

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

PR concernées (le détail est dans le tableau de la partie G) : **10** Statistiques, **11** Relances côté serveur (origine `relance`, réglage du délai), **12** Relances côté écran. Les PR 5 et 6 s'élargissent (écran « Clients », entrées Catalogue, Relances, Statistiques, texte « chantier »). **Aucune collection nouvelle** si (a) est retenue : donc aucune règle Firestore et aucun export de plus. Si (b) l'est : une PR de règles (liste d'arrêt) et une collection d'export de plus. **Export par module (27/10/2026)** : les devis étant déjà exportés, Relances et Statistiques n'ont pas besoin de leur propre bouton ; *Décision prise seul :* le bouton « Exporter mes données » du module Devis reste le seul, et la page Statistiques n'en ajoute pas (ses chiffres se recalculent des devis exportés). *Question restante :* un export CSV des chiffres de la page Statistiques est-il voulu ?

---

## I. L'affichage par utilisateur : une « vue » par membre (nouveau chantier central)

**Besoin (Jérôme, 04/11/2026).** Dans un même client : le plombier voit **Devis · Clients · Catalogue · Relances · Statistiques** ; sa secrétaire, **si le client a acheté Affaires**, voit en plus les affaires et les projets. **La même base de données derrière, seul l'affichage change.**

### I.1 Ce qui existe aujourd'hui (vérifié)

- Les modules actifs sont décidés **par client** (espace), pas par membre : champ `modules` de la fiche `clients/<client>`, lu par `modulesActifsDuClient` (`js/os/registre.js:340`) et monté par `js/os/espace.js:121` ; même lecture côté serveur (`functions/src/clients/espaces.js:19`).
- Le membre est un document `clients/<client>/membres/<e-mail>` avec un `role` (`editeur` ou `lecteur`, `js/os/membres.js:8-11`) et un `nom`. **Aucun navigateur ne l'écrit** (`firestore.plateforme.rules:35-39`, `allow write: if false`) ; tout membre d'un client peut en revanche **lire** les fiches des autres membres du même client (page « Qui peut se connecter »).
- Côté assistant, le rôle donne un profil (`PROFIL_PAR_ROLE`, `functions/src/clients/config.js:28` : éditeur = `claude-code`) ; les outils proposés suivent les **modules actifs du client** (`gestionnaire.js:15-23`), pas le membre.

### I.2 Proposition : un champ `vue` sur la fiche du membre

- **Un champ facultatif `vue`** (liste d'identifiants de modules, par exemple `['contacts', 'devis']`) sur la fiche du membre. **Absent = tous les modules du client** : aucun membre existant ne change, ni chez Jérôme ni chez les clients.
- **Modules visibles d'un membre = modules actifs du client ∩ sa vue**, plus les modules dont ils dépendent (voir `dependances`, `verifierActivation`) : choisir `devis` ajoute `contacts` tout seul. Une route d'un module masqué est « introuvable » (`moduleAccessible`, `registre.js:346`) ; le menu, le « + », la recherche et la page Réglages suivent (ils partent des modules montés).
- **Où ça se règle.** Les fiches de membres ne s'écrivent pas depuis un navigateur : il faut une **fonction du serveur** « régler la vue d'un membre » (code partagé, branché chez Jérôme et chez les clients dans la même PR : règle du 26/10/2026) et un réglage dans la page « Qui peut se connecter ». *Décision prise seul :* au début, c'est **Jérôme** qui règle la vue (sur demande du client), pas le client lui-même. *Question restante :* un éditeur « responsable » du client doit-il pouvoir régler la vue de ses collègues ?
- **Règles Firestore : aucune règle nouvelle** (la fiche du membre est déjà non écrivable par un navigateur et lisible par les membres). Si le choix final était de passer par une règle, ce serait la liste d'arrêt de CLAUDE.md (laissé à Jérôme).
- **Assistant (MCP).** *Décision prise seul :* les outils proposés suivent aussi la vue (`outilsDesModules` reçoit la liste visible du membre), pour que l'assistant de la secrétaire propose les affaires et celui du plombier non. *Question restante :* confirmer ; c'est la fiche du membre qui décide, comme pour le menu (règle « même code » du 18/10/2026 : aucun comportement réservé aux clients, la fiche décide).

### I.3 L'honnêteté à écrire (et à dire au client)

**C'est de l'AFFICHAGE, pas de la confidentialité entre membres.** Les règles Firestore décident **par rôle et par collection**, jamais par module (`firestore.plateforme.rules:182-184`) : un membre dont la vue masque Affaires **peut quand même lire** les affaires avec un autre outil, ou par son assistant si les outils ne suivaient pas la vue. Il ne faut **jamais** promettre à un client « ma secrétaire voit des choses que mon plombier ne voit pas » comme une protection des données. Si un jour un vrai cloisonnement est voulu, ce sera un autre chantier (règles par collection et par membre : liste d'arrêt).

### I.4 Découpage

PR 4 (voir G) : champ `vue`, calcul des modules visibles d'un membre (fonction pure, écran et serveur), fonction du serveur pour le régler, réglage dans « Qui peut se connecter », tests (membre sans `vue` inchangé ; `vue` seule `devis` ; `vue` vers un module non acheté ignorée). **Fable obligatoire** (serveur, données, structure d'écran).
