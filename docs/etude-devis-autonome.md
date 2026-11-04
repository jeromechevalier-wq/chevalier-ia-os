# Étude de faisabilité : le module Devis vendable seul

*Étude du 04/11/2026, demandée par Jérôme (priorité haute), **réécrite le 04/11/2026 (soir) après sa décision** (voir ci-dessous). **Aucun code n'est écrit ici** : on vérifie ce qui existe, on dit ce qu'il faudrait changer, on propose un découpage en petites PR et on pose les questions à trancher. Chaque affirmation technique renvoie à un fichier et une ligne (état de `main` au 04/11/2026). Les chiffres d'exemple partent de 100 €.*

## La décision de Jérôme (04/11/2026), qui commande tout le reste

> « Quand un client n'a que le module Devis, on n'utilise ni CRM, ni Personnes/Organisations, ni Affaires, ni Projets. Une petite table stocke les noms de clients et les e-mails déjà tapés, pour l'auto-complétion dès les 3 premières lettres. On ne fait que ça : pas besoin de faire tourner Personnes, Organisations, Affaires, Projets en tâche de fond. La règle « un devis ne peut pas exister sans affaire » s'affine : si le module Affaires existe, un devis ne peut pas exister sans affaire ; si le module Devis est seul, un devis peut exister seul, puisque Affaires n'existe pas. »

Ce que cela change par rapport à la première version de l'étude (les décisions 4 et 5 deviennent **caduques** : plus d'affaire cachée, donc plus de question de rangement à l'achat) :

- **Option 2 « lever la dépendance » retenue, sans « noyau » CRM** : le module Devis ne dépend plus d'Affaires, et aucun morceau du CRM ne démarre en silence (décision 1 tranchée).
- **Le « carnet d'adresses du devis »** remplace les fiches cachées : une petite collection du module Devis (nom, e-mail, téléphone, adresse).
- **La règle de finalisation s'affine** (décision 3 précisée) : l'affaire n'est exigée que si le module Affaires est actif.

## Résumé en 10 lignes (lisible sans connaître le code)

1. **Le but** : vendre le module Devis seul à un artisan. Il voit un seul « pipeline » (ses devis), sans jamais voir Personnes, Organisations, Affaires ni Projets, et **rien de tout cela ne tourne en coulisses**.
2. **C'est faisable, sans deux codes séparés.** Le programme est le même ; seul change ce que le client a acheté (la liste de modules de sa fiche).
3. **Aujourd'hui c'est refusé par le code** : le module Devis déclare qu'il ne peut pas marcher sans le module Affaires (`js/os/registre.js:134`, refus dans `verifierActivation`, l.322-336).
4. **L'obstacle principal** : le module Devis lit et écrit **par la couche de données du CRM** (`js/modules/devis/donnees.js:10` importe `../crm/donnees.js`, `demarrer()` l.107-109 refuse de démarrer sans le chemin du CRM, et ses écritures passent par `CRM.executer`, l.204-312). « Ne pas faire tourner le CRM » impose de **découper cette couche** : c'est la PR 1.
5. **Le carnet d'adresses du devis** : une petite collection `devis_clients` (nouvelle, dans le module Devis), remplie par ce que le client tape dans ses devis, exportée avec le module Devis, et que le client peut effacer à la main. Elle ajoute des règles Firestore (PR laissée à Jérôme).
6. **Une seule source de suggestions, deux fournisseurs** : chez Jérôme (Affaires actif), les suggestions viennent des fiches Personnes et Organisations ; en « Devis seul », du carnet. Même écran, même code.
7. **Règle de finalisation** : avec Affaires actif, un devis finalisé exige une affaire (comme aujourd'hui) ; en « Devis seul », il n'en exige pas. Une seule fonction pure change (`erreursFinalisation`) ; ce qui change vraiment, ce sont ses appelants.
8. **Ce qui ne change pas chez Jérôme** : ses données et son écran complet. La règle « même code chez Jérôme et chez les clients » (CLAUDE.md, 18/10/2026) est respectée : le code est le même, la fiche du client décide.
9. **À l'achat ultérieur d'Affaires ou de Contacts** : le carnet peut être migré vers de vraies fiches, **sur PROPOSITION, jamais automatiquement** (PR 10, différée).
10. **Découpage proposé : 10 PR (1 à 10)**, 8 exigent la relecture Fable (1, 2, 3, 4, 5, 6, 7, 10), 2 non (8, 9). La PR 4 ajoute une règle Firestore : elle est **laissée à Jérôme** (étiquette `a-fusionner-par-jerome`). À ne pas promettre à un client : envoi direct à un logiciel de facturation, familles libres, agent autonome, branchement à Pipedrive ou Salesforce.

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
- Le module `devis` déclare 26 outils (`registre.js:133`) ; **les outils pour retrouver ou créer un client appartiennent au module `affaires`** : `chercher`, `lire_personne`, `lire_organisation`, `creer_personne`, `creer_organisation`, `modifier_personne`, `modifier_organisation`… (`registre.js:86-93`). Un client « Devis seul » n'aurait donc **aucun moyen** de désigner un client à son assistant (`creer_devis_brouillon` demande un `organisationId` ou un `personneId`).
- Le texte de `creer_devis_brouillon` dit que l'affaire est **facultative** et que la finalisation l'exige (`functions/src/mcp/outils/ecriture.js:184`) ; `chercher` renvoie aussi des affaires (`lecture.js:~13-20`, paramètre `types`).

### A.5 Règles Firestore

`firestore.rules` (Jérôme) et `firestore.plateforme.rules` (clients) décident par **rôle et par collection**, jamais par module actif (le mot `modules` n'y apparaît que pour la fiche `clients/<client>`, `firestore.plateforme.rules:41-44`). Pour `devis_devis` : un brouillon neuf doit avoir `statut=brouillon`, `numero` vide, `version=1` (`firestore.rules:71-74`) ; rien n'oblige ni n'interdit `affaireId`. **Aucune règle existante ne change** ; en revanche la **nouvelle collection du carnet (`devis_clients`) demande une règle nouvelle** dans les deux fichiers (voir B et PR 4).


### A.6 Exports (règle « chaque module a son bouton d'export »)

- L'export du module Devis contient ses cinq collections : `js/modules/devis/donnees.js:287` (`devis_articles`, `devis_parametres`, `devis_devis`, `devis_vocabulaire`, `devis_usage_articles`).
- L'export complet (Réglages > section CRM) et les contacts `.vcf` appartiennent à l'écran du CRM : `js/modules/crm/export.js:8`, test `tests/e2e/parcours.spec.js:718` (C19, liste des collections attendue).
- En « Devis seul », il n'y a **pas de fiches** à exporter : le carnet `devis_clients` devient la **sixième collection** de l'export du module Devis (PR 8), et le test C19 est à adapter.

### A.7 Recherche, « + », accueil, statistiques

- Barre « + » : `js/os/shell.js:282` rassemble les `actionsRapides` de **tous** les modules montés. Comme le CRM n'est plus monté en « Devis seul », ses entrées (Personne, Organisation, Affaire : `js/modules/crm/index.js:33-37`) n'apparaissent plus d'elles-mêmes ; Devis garde les siennes (`devis/index.js:36-38`).
- Recherche globale : `shell.js:289-296` fusionne les groupes que chaque module rend ; sans le CRM, il ne reste que le groupe des devis.
- Premier écran : `premiereRoute(actifs)` = premier écran du premier module actif (`registre.js:353`) ; sans `affaires`, ce sera donc `devis/liste` **sans rien coder de plus** (à confirmer par un test dans la PR 2).
- Accueil et objectifs : l'Accueil (`crm/accueil`) et les indicateurs vivent dans le module Affaires ; « Devis seul » n'a **pas de tableau de bord** au départ.

---

## B. Le carnet d'adresses du devis

**Ce que c'est** : une petite collection du module Devis, `devis_clients` (nom proposé), qui garde les clients **déjà tapés** pour les proposer ensuite. Rien d'autre : ce n'est pas un CRM (pas d'étiquettes, d'organisation liée, d'activités, de notes, de statistiques).

**Contenu d'une entrée** : nom, type (« Particulier » ou « Société », voir décision 6), e-mails, téléphone, adresse, date de création, et le repère `test` du mode test (l'écran le pose via `avecModeTest`, `js/os/mode-test.js:36-39` ; l'assistant ne le pose jamais, comme partout).

**Comportement**

1. **Auto-complétion dès 3 lettres** dans le champ « Pour qui est ce devis ? » (nom) et dans les champs de destinataires (e-mails).
2. **Alimenté par la saisie dans le devis** : quand l'utilisateur tape un client ou une adresse qui n'est pas dans le carnet, l'entrée est créée (avec doublon vérifié sur le nom et l'e-mail normalisés, par les mêmes outils de texte que le CRM : `js/modules/crm/logique.js` pur, sans le démarrer).
3. **Exporté avec le module Devis** (PR 8).
4. **Supprimable à la main** : un petit écran « Carnet d'adresses » dans le module Devis (liste, modifier, supprimer). Supprimer une entrée ne touche à aucun devis : **un devis garde ses propres champs figés** (nom, adresse, destinataires), un devis finalisé ne change jamais.
5. **Pas de fiche Personne / Organisation** : l'artisan ne voit pas ces mots.

**Ce que le devis stocke aujourd'hui, et ce qui change** : un devis porte `organisationId` et/ou `personneId` (`editeur-ecran.js:1030`, `champClientIntelligent` l.1043-1077). À la finalisation, le serveur lit la fiche du client pour figer son nom (`functions/src/coeur/devis.js:162`). En « Devis seul », il n'y a pas de fiche : le devis portera **les champs du client saisis** (et, si on le souhaite, l'identifiant de l'entrée du carnet, sans que le devis en dépende). Le détail de ce stockage est à fixer **au codage de la PR 5 et de la PR 7** (client libre côté écran et côté assistant : `creer_devis_brouillon` demande aujourd'hui un `organisationId` ou un `personneId`, et refuse les deux ensemble, `functions/src/coeur/metier.js:933`) ; **non vérifié aujourd'hui**, à relire dans le code avant d'envoyer le brief de ces PR.

**Règles Firestore** : la collection est nouvelle, donc **une règle est à ajouter dans `firestore.rules` (Jérôme) et `firestore.plateforme.rules` (clients)**. Aucun écart de sécurité n'est accepté : mêmes rôles que `devis_devis` (lecture : membre ; écriture : éditeur). C'est la liste d'arrêt de CLAUDE.md : **PR laissée à Jérôme** (étiquette `a-fusionner-par-jerome`), puis publication des règles par Claude avec les workflows habituels (« Publier les règles (CRM de Jérôme) » ; « Déploiement plateforme clients » > regles, lancé par Jérôme), jamais avant la fusion et le « Tests » vert.

**Journal** : les écritures du carnet doivent passer par le même journal que les autres modules, sans passer par `CRM.executer` (voir D, PR 1). Les valeurs reçues (noms, e-mails) sont gardées dans le journal comme partout (décision de Jérôme du 04/10/2026, aucune mesure RGPD).

**Ce que le CRM fournissait et que le carnet n'a pas** (volontairement) : fiches détaillées, organisation d'une personne, historique d'activités, import vCard. Pas de bouton « Importer des contacts » au départ.

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

**Mode test** : l'écran pose `test: true` sur ce qu'il crée (`avecModeTest`) ; avec le carnet, les entrées créées en mode test portent le repère ; l'assistant ne le pose jamais. **Sans affaire cachée, le risque de la première étude disparaît**, et l'héritage du repère (« PR 1a-2b » du chantier mode test, `docs/cadrage-mode-test.md:201`, citée dans le brief comme la PR 507) **n'a plus d'utilité pour ce chantier** : rien à rattacher.

---

## D. Interrupteur de modules et couche de données

### D.1 Ce que fait le registre aujourd'hui

- Les modules sont déclarés dans `js/os/registre.js` (`MODULES_DECLARES`). Les modules actifs d'un client viennent du champ `modules` de sa fiche `clients/<client>` (`modulesActifsDuClient`, l.340) ; l'interrupteur `crm` allume `affaires` **et** `projets` (`INTERRUPTEURS`, l.249).
- Le module `devis` déclare `dependances: ['affaires']` (l.134) et `verifierActivation` (l.322-336) refuse un module dont une dépendance n'est pas active. **« Devis seul » est donc refusé aujourd'hui.**
- **Tests qui verrouillent cela** : `tests/registre.test.js:40-44` ne vérifie que l'ordre des dépendances et « projets exige affaires » (il ne dit rien de devis) ; `tests/e2e/modules-client.spec.js` n'a **aucun cas « devis seul »** (R5, l.124, est « projets sans affaires »). → **tests à adapter / à ajouter** (un cas « devis seul » dans chacun).
- Même lecture des deux côtés : écran (`js/os/espace.js:121`) et serveur (`functions/src/clients/espaces.js:19`, via la copie `functions/partage/registre.js`). `functions/src/clients/config.js` ne contient **pas** la liste des modules.
- Le module `affaires` regroupe **tout le CRM** (écrans Accueil, Personnes, Organisations, Affaires ; 7 collections `crm_*` plus `documents_stockes` ; 32 outils MCP). **On ne peut pas cacher « les Affaires » sans cacher aussi les Personnes** : c'est un seul module, et en « Devis seul » on ne le monte pas du tout.

### D.2 Option retenue : lever la dépendance, sans noyau CRM

| | Option 1 : Affaires allumé mais masqué | **Option 2 retenue : lever la dépendance, rien ne démarre en silence** |
|---|---|---|
| Idée | `affaires: true` plus un réglage « masqué » | `devis` n'a plus `dependances: ['affaires']` ; le module `affaires` n'est **pas monté** s'il n'est pas acheté |
| Fiche du client | brouille « acheté » et « visible » | une seule vérité : la liste de modules = ce qui est acheté |
| Statut | écartée | **tranchée par Jérôme le 04/11/2026** |

L'ancienne variante « le CRM démarre en silence » (**un noyau de données**) est **abandonnée** : Jérôme ne veut pas faire tourner Personnes, Organisations, Affaires, Projets en tâche de fond.

### D.3 L'obstacle à traiter : la couche de données du module Devis

Mesures (voir A.1) : 9 fichiers du module Devis importent `../crm/donnees.js` (`actions-devis.js:6`, `donnees.js:10`, `editeur-ecran.js:15`, `email-preparer-ecran.js:7`, `index.js:14`, `liste-ecran.js:8`, `onglet-affaire.js:9`, `recherche.js:3`, `reglages.js:5`), et `demarrer()` (`js/modules/devis/donnees.js:107-109`) **refuse de démarrer** si le chemin de base ne correspond pas à celui du CRM. Les écritures du module Devis (articles, vocabulaire, brouillons) passent par `CRM.executer` (`donnees.js:204-312`, 11 appels) : c'est le journal d'audit.

À découper (PR 1) :
- un petit module commun (nom à fixer, par exemple dans `js/os/`) qui porte le **journal d'écriture** (`executer`), le **chemin de base** (`cheminDeBase`, `crm/donnees.js:116`) et le contexte (`ctx`, aujourd'hui `CRM.ctx()`, `editeur-ecran.js:2195`) ; le CRM l'utilise à son tour, le module Devis ne dépend plus de `crm/donnees.js` ;
- les **imports purs** `../crm/logique.js` ne posent **pas** de problème (fonctions pures, rien ne démarre) : ils restent ;
- les **composants d'écran** du CRM (`composants.js`, `filtres.js`, `activites.js`, `personnes.js`, `organisations.js`) importés par `bordereau.js`, `editeur-ecran.js`, `liste-ecran.js`, `vocabulaire-ecran.js`, `export.js`, `onglet-affaire.js`, `origine.js`, `actions-devis.js`, `index.js` se **chargent** sans démarrer ; mais tout ce qui lit `CRM.etat` (personnes, organisations, affaires, réglages du CRM) doit passer par la **source de suggestions** (E) et par des réglages propres au module Devis ; à **chiffrer au codage** (liste fichier par fichier dans la PR 1, non faite ici) ;
- l'`onglet-affaire.js` et les crochets `pastilles-externes.js` (A.2) restent inchangés : sans CRM monté, personne ne les affiche.

**Réglages du CRM lus par le module Devis** (étapes de départ, options, etc.) : en « Devis seul », il n'y en a pas ; les valeurs par défaut du module doivent suffire. À vérifier dans la PR 1.

### D.4 Ce que chaque endroit devient en « Devis seul »

| Endroit | Aujourd'hui | En « Devis seul » | Où |
|---|---|---|---|
| Lecture des modules actifs | `verifierActivation` refuse | accepte `devis` seul | `registre.js:322-336` |
| Montage des modules | un module par module actif | monte **seulement** Devis (le CRM n'est jamais monté) | `espace-modules.js:22-27` |
| Menu | un bloc par module actif | seulement « Devis » (liste, Catalogue, Vocabulaire) + « Carnet d'adresses » | `registre.js:389-422` |
| Premier écran | `crm/accueil` | `devis/liste` | `registre.js:353`, `espace-modules.js:32` |
| Bouton « + » | Personne, Organisation, Affaire, Devis | Devis seulement | `shell.js:282` |
| Recherche globale | Personnes, Organisations, Affaires, Devis | Devis | `shell.js:289-296` |
| Champ « Pour qui est ce devis ? » | trois groupes (Personnes, Organisations, Affaires) | un groupe « Clients » (carnet), plus la ligne Affaire **retirée** | `editeur-ecran.js:1043-1110` |
| Liens croisés | vers fiche personne / organisation / affaire (`editeur-ecran.js:12`, 828-829) | retirés (pas de fiche) | `editeur-ecran.js`, `liste-ecran.js:64` |
| Réglages | section CRM + Devis | seulement les réglages Devis | `js/os/reglages.js:166` |
| Export | bouton « Exporter mes données » (5 collections) | + le carnet (6 collections) | `devis/donnees.js:287` |
| Outils de l'assistant | filtrés par module actif | outils Devis + un petit jeu « carnet » (ci-dessous) | `clients/gestionnaire.js:15-23` |
| Accueil, statistiques | dans le module Affaires | absents | `crm/index.js` |

**Outils MCP proposés à un client « Devis seul »** (aucun texte à coller chez l'assistant : les consignes vivent dans les descriptions des outils, décision du 30/10/2026) : les 26 outils du module Devis (`registre.js:133`) plus **quatre outils dédiés au carnet** (chercher, ajouter, modifier, supprimer une entrée). L'ancienne idée de réutiliser les sept outils du module `affaires` (`chercher`, `creer_personne`…) **tombe** : ils écrivent de vraies fiches `crm_*`, que le client n'a pas. **Décision prise seul : ces quatre outils ne sont offerts que quand Affaires n'est pas actif** (chez Jérôme, `chercher` et les fiches existent déjà). **Question restante pour Jérôme** : préfère-t-il les voir aussi chez lui ? (une fonction visible chez les clients et pas chez lui est contraire à la règle du 18/10/2026 ; ici c'est la fiche qui décide, comme pour le menu, mais je laisse la question visible.)

---

## E. Une source de suggestions, deux fournisseurs

Le champ « Pour qui est ce devis ? » (et les champs de destinataires) ne doit parler qu'à **une source de suggestions** à trois verbes :
1. **chercher**(texte, dès 3 lettres) → liste courte `{ id, nom, sousTitre, type, emails }` ;
2. **lire**(id) → `{ nom, e-mails, téléphone, adresse, type }` (ce dont un devis a besoin) ;
3. **ajouter**(champs) → `id` (pour le carnet ; pour les fiches du CRM, c'est le bouton « + Créer la personne » existant).

**Deux fournisseurs, un seul écran** (« même code », décision du 18/10/2026) :
- **fournisseur « fiches »** (Affaires actif, donc chez Jérôme) : lit `CRM.etat.personnes` et `CRM.etat.organisations` comme aujourd'hui (`editeur-ecran.js:1043-1053`) ;
- **fournisseur « carnet »** (« Devis seul ») : lit `devis_clients`.

C'est le module Devis qui choisit son fournisseur d'après les modules actifs. **Coordination avec la PR 508** (« saisie d'adresses façon Gmail », **en cours, à ne pas refaire**) : cette PR touche les champs de destinataires ; la source de suggestions doit **réutiliser** ce qu'elle fournit (puces d'adresses, suggestions) et lui brancher le fournisseur « carnet ». Contenu de la PR 508 **non vérifié ici** (elle n'est pas encore fusionnée) : relire son code avant d'écrire le brief de la PR 5 et, si elle définit déjà une source de suggestions, partir de la sienne.

**Ce qu'un Pipedrive ou un Salesforce exigerait** (description, pas de chiffrage) : l'authentification de l'artisan chez ce service, des quotas d'appels (pas de recherche à chaque frappe), les doublons avec notre carnet, le sens de la synchronisation, le vocabulaire. Jérôme ne s'engage pas (« plus tard peut-être, jamais ») : **aucun connecteur, aucune synchronisation, aucun dossier « sources » vide**. La seule dépense utile est de ne pas répandre la lecture directe de `CRM.etat` dans de nouveaux fichiers du module Devis.

**À l'achat ultérieur d'Affaires ou de Contacts** : le client retrouve le carnet à côté de ses nouvelles fiches. Une **migration du carnet vers de vraies fiches** (Personne pour « Particulier », Organisation pour « Société ») est **proposée**, jamais lancée seule : aperçu, nombre d'entrées, doublons avec les fiches existantes, puis confirmation du client avec un code (même mécanique que les autres opérations sur les données de client, liste d'arrêt). Les devis déjà faits ne sont pas relinkés d'office. C'est la PR 10, différée (ni urgente ni nécessaire pour vendre le module).

---

## F. Risques et pièges

| Sujet | Risque | Réponse |
|---|---|---|
| **Données de Jérôme** | Rien ne doit changer chez lui | Aucune migration. Valeur par défaut `affairesActif = true`. Toute opération sur ses données demande son accord écrit |
| **Règles Firestore** | Une règle nouvelle (`devis_clients`) = liste d'arrêt | PR 4 laissée à Jérôme, étiquette `a-fusionner-par-jerome`, avec ses 5 vérifications, cas vide et cas d'erreur ; publication par workflow après fusion et « Tests » vert |
| **Découpage de la couche de données** | Casser les écritures et le journal des devis, des articles et du vocabulaire de Jérôme | PR 1 sans aucun changement de comportement ; Fable obligatoire ; tests des modules Devis et CRM, puis « Tests de nuit » sur `main` après fusion |
| **Serveur** | Registre, `metier.js`, descriptions d'outils | Relecture **Fable obligatoire** (CLAUDE.md) sur les PR 1, 2, 3, 4, 5, 6, 7 et 10 |
| **`functions-plateforme/`** | Une fonction ajoutée chez Jérôme mais pas chez les clients (leçon du 26/10) | Aucune nouvelle fonction du serveur attendue, mais de **nouveaux outils MCP** (carnet) et un **nouveau contexte** (modules actifs) : tout passe par le code partagé (`coeur`, `mcp`, `clients`), copié en entier par `scripts/preparer-fonctions.js`. À vérifier à chaque PR ; **contrôle des écarts entre les deux dossiers avant la première démonstration** |
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

Chaque PR : une seule idée, fusionnée le jour même (sauf la PR 4, laissée à Jérôme), **rien de visible chez Jérôme tant qu'aucun client n'est « Devis seul »**.

| N° | PR | Dépend de | Fable | Ce que Jérôme voit à l'écran |
|---|---|---|---|---|
| **1** | **Couper la couche de données du module Devis** : plus d'import de `crm/donnees.js`, journal et chemin de base dans un module commun, `demarrer()` sans chemin du CRM | aucune | **obligatoire** (données, écriture avec journal) | rien (aucun changement de comportement) |
| **2** | **Registre** : `devis` sans dépendance à `affaires`, Affaires non monté s'il n'est pas acheté ; tests `registre.test.js` et `modules-client.spec.js` (cas « devis seul ») ; `docs/activer-desactiver-modules.md` | 1 | **obligatoire** (le serveur lit le même fichier) | rien |
| **3** | **Règle de finalisation affinée** : option `affairesActif` (défaut vrai) dans `erreursFinalisation`, appelants écran (`editeur-ecran.js:2195`, `logique.js:1007`), serveur (`devis.js:163`, `metier.js:1358`, `lecture.js:455`), modules actifs portés par le contexte, textes d'outils | 2 | **obligatoire** (serveur) | rien |
| **4** | **Carnet : collection `devis_clients`, règles Firestore (deux fichiers), accès aux données** | 1 | **obligatoire** (règles, données) | rien. **PR laissée à Jérôme** (étiquette `a-fusionner-par-jerome`) |
| **5** | **Source de suggestions à deux fournisseurs + écrans** : champ « Pour qui est ce devis ? » et destinataires (coordination PR 508), ligne Affaire retirée sans Affaires, alimentation automatique, écran « Carnet d'adresses » | 1, 3, 4 (et PR 508 fusionnée) | **obligatoire** (gros écran, éditeur du devis) | le champ client ne change pas avec Affaires actif |
| **6** | **Coque** : menu, « + », recherche, Réglages et premier écran sans les écrans du CRM quand Affaires n'est pas actif | 2 | **obligatoire** (structure d'écran) | rien |
| **7** | **Serveur et assistant** : client libre ou entrée du carnet pour `creer_devis_brouillon` / `creer_devis_depuis_modele`, lecture du client à la finalisation, quatre outils du carnet, textes | 3, 4 | **obligatoire** (serveur) | rien |
| **8** | **Export** : le carnet comme sixième collection de l'export Devis ; test C19 | 4 | non requise (lecture seule ; E2E C19) | l'export Devis grossit |
| **9** | **Recette de bout en bout** « Devis seul » puis « Devis + Affaires » (achat en cours de route) et docs (`deploiement-client.md`, `activer-desactiver-modules.md`) | 1 à 8 | non (docs) | rien |
| **10** | **Migration du carnet vers de vraies fiches, sur proposition** (aperçu, doublons, code de confirmation) | 9 ; **différée**, à l'achat d'Affaires ou de Contacts | **obligatoire** (données de client) | rien tant qu'aucun client n'achète |

Ordre conseillé : 1 → 2 → (3 et 4 et 6 en parallèle) → 5 (après la PR 508) → 7 → 8 → 9 ; la 10 plus tard. **8 PR sur 10 exigent Fable** (1, 2, 3, 4, 5, 6, 7, 10). Un déploiement des fonctions et du MCP chez les clients suit les PR 3 et 7 (Jérôme le lance), et la publication des règles suit la PR 4.

### État des décisions

1. **Lever la dépendance (option 2)** et **pas de noyau CRM** : **tranchée par Jérôme (04/11/2026).**
2. **Comment tester chez Jérôme sans éteindre son CRM ?** *Recommandation : un client de démonstration en « Devis seul » (jamais son espace). Le code est le même, c'est la fiche du client qui change.* Reste à confirmer.
3. **Devis et affaire** : **précisée par Jérôme (04/11/2026)** ; **Décision prise seul : lecture « finalisation exige l'affaire »** (voir C). *Question visible* : veut-il aussi, plus tard, des brouillons toujours liés quand Affaires est actif ?
4. **Une affaire cachée par devis ?** — **caduque** (plus d'affaire cachée).
5. **Rangement des affaires cachées à l'achat** — **caduque** ; remplacée par la migration du carnet **sur proposition** (PR 10).
6. **Particulier / Société : un seul mot « Client » avec le choix du type ?** *Recommandée : oui.*
7. **Le client « Devis seul » a-t-il un accueil ou seulement la liste ?** *Recommandée : la liste, un accueil plus tard.*
8. **Nouvelles questions** : (a) son espace garde-t-il toujours le module Affaires (C) ? (b) les outils du carnet visibles aussi chez lui (D.4) ? (c) la PR 508 définit-elle déjà la source de suggestions (E) ?

### Tableau « module acheté / ce que le client voit »

| Modules achetés | Menu | Ce qu'il peut faire | Ses clients | Ses affaires |
|---|---|---|---|---|
| **Devis seul** | Devis (liste, Catalogue, Vocabulaire), Carnet d'adresses, Réglages Devis | tout le cycle du devis (brouillon → signé), PDF, e-mail, assistant pour les devis et le carnet | **carnet d'adresses du devis** (nom, e-mail, téléphone, adresse) | **aucune** (le module n'existe pas) ; un devis finalisé existe seul |
| **Devis + Affaires** | Accueil, Personnes, Organisations, Affaires, Devis | comme aujourd'hui (le comportement de Jérôme) ; un devis finalisé exige une affaire | complets (fiches) ; carnet gardé, migration **proposée** (PR 10) | visibles |
| **Devis + Affaires + Projets** | + Projets | comme aujourd'hui | complets | visibles, projets possibles |
| **Affaires seul** (déjà possible) | Accueil, Personnes, Organisations, Affaires | CRM sans devis ; montant d'affaire saisi à la main | complets | visibles |
