# À faire au début de la prochaine session

Écrit le 04/10/2026, mis à jour le 22/10/2026, pour qu'une session neuve reprenne sans que Jérôme ait à recoller quoi que ce soit. **À mettre à jour ou à supprimer une fois les points faits.**

## Rapport du matin : 3e nuit « GO NUIT » (version 2.21.0)

Décisions N1 à N7 de Jérôme, un sujet par PR, relues par Fable, fusionnées seules quand la coche « Tests » est verte. Rien sur la liste d'arrêt (pas de règles, pas de migration, plateforme clients non déployée).

| Sujet | PR | État |
|---|---|---|
| N3 : filtre « Événements » de l'Historique sans recoupement | 179 | fusionnée |
| N6, N7 : colonnes Perdues / En pause retirées, surtitres retirés | 180 | fusionnée |
| N1, N2 : « Livrable Lancement », bouton jaune « Enregistrer le livrable » | 181 | fusionnée |
| N5 : étiquettes à cocher, « + Nouvelle étiquette », couleur automatique | 182 | fusionnée |
| N4 : Propriétaire comme Source (valeur + crayon, clic = liste) | 183 | fusionnée |
| Docs, version 2.21.0 | cette PR | – |

**À regarder à l'écran** : (1) projet : « Livrable Lancement » sans majuscules et bouton jaune « Enregistrer le livrable » ; (2) Historique : « Événements » ne contient ni documents ni affaires ; (3) Affaires : plus de colonnes Perdues ni En pause, plus de surtitre « Commercial » (ni « Contacts », « Livraison ») ; (4) fiche personne ou organisation : Étiquettes en cases à cocher, « + Nouvelle étiquette » ; (5) affaire : Propriétaire avec un crayon, un clic ouvre la liste (Étape, Phase, Priorité inchangées).

**Cas vide / erreur** : étiquettes, aucune existante → seul « + Nouvelle étiquette » ; nom vide ou en double → message sous le champ. Livrable : « Le titre est obligatoire. ». Propriétaire : jamais vide ; en cas d'échec d'écriture, l'ancienne valeur reste.

**Pas pu vérifier avec le vrai système** : vraie base, téléphone réel, plateforme clients (Ingrid), outils MCP renommés (visibles après redéploiement et reconnexion).

**Reste à faire** : voir la liste de la nuit précédente ci-dessous (phrases de Sources dans Réglages, I16 boutons, place de `boutonFiltres`, anciens défauts de tests). Le crayon de Propriétaire reste visible sur écran tactile (seulement lui). Le focus clavier n'est pas rendu après un choix dans la liste (comportement existant de Source).

## Rapport du matin : nuit « GO NUIT » du 22 au 23/10/2026 (version 2.20.0)

Jérôme a validé ses décisions le 22/10/2026 puis écrit « GO NUIT ». Claude a codé en autonomie, un sujet par PR, relue par Fable, fusionnée seule quand la coche « Tests » est verte.

| Sujet | PR | État |
|---|---|---|
| J8, J4 : « Appel » par défaut ; pastille « Tâche » sur le projet | 169 | fusionnée |
| J7 : Source en liste fixe, Ville regroupée | 170 | fusionnée |
| J4b : tâches de projet → livrables, outils MCP renommés | 171 | fusionnée |
| J2, J9 : montant aligné, bouton « Gagnée » retiré | 172 | fusionnée |
| M1 à M3 : textes « 90 jours » retirés | 173 | fusionnée |
| J1, J5 : un seul composant de filtres ; historique à plusieurs cases | 174 | fusionnée |
| J5 : filtres de la Veille | 175 | fusionnée |
| J5 : filtres du Journal | 176 | fusionnée |
| J5 : filtres des Automatisations | 177 | fusionnée selon la coche (voir la PR) |
| Docs, version 2.20.0, vocabulaire | cette PR | – |

**À regarder à l'écran (recette de Jérôme)** : les « 5 vérifications » de chaque PR sont dans leur description (169 à 177). Les plus importantes : (1) une affaire : plus de bouton « Gagnée », le « 999 € » est à la hauteur des boutons « Perdue / En pause » ; (2) un projet : « Livrables 0/1 », « Clique ici pour ajouter un livrable… » et la pastille « Tâche » dans l'activité ; (3) l'Historique d'une fiche : « Filtres », coche deux types, la pastille indique 2, le filtre reste quand on ouvre une autre fiche ; (4) Personnes : la Source ne propose que la liste des Réglages, la Ville n'a plus de doublon ; (5) Journal, Veille, Automatisations : le même bouton « Filtres » partout.

**Données de Jérôme modifiées pendant la nuit (accord explicite de Jérôme)** : les phrases de source qui n'étaient pas dans la liste (4 affaires, 2 personnes) ont été remplacées par une valeur de la liste, et la phrase d'origine a été gardée dans une note de la fiche (le journal des modifications garde les copies « avant »). **À faire par Jérôme** : une phrase de source n'a pas pu être retrouvée sur une fiche avec les outils disponibles ; dans Personnes, filtre « Source » pour la repérer, la remplacer, puis **retirer les phrases de la liste dans Réglages, Sources** (le code ne recopie plus rien dans cette liste). Rien n'a été modifié chez Ingrid (plateforme clients non déployée : ses changements arrivent au prochain déploiement manuel).

**Ce qui n'a pas pu être vérifié avec le vrai système** : tout a été testé sur émulateurs et avec le navigateur de test ; pas de vraie base de Jérôme ni de vrai téléphone, pas de vrais clients MCP (les outils renommés `ajouter_livrable_projet` et `terminer_livrable_projet` ne sont visibles dans l'assistant qu'après redéploiement du serveur MCP et reconnexion), pas de plateforme clients. Le test J4 des Automatisations et « assistant non administrateur » échouent en local pour des causes déjà connues (fuseau du bac à sable, erreur 409 de l'émulateur) ; ils passent sur GitHub.

**Ce que la nuit a révélé** : (1) une première coche rouge de la PR 169 venait de l'émulateur Firestore (téléchargement de son fichier au démarrage) : relancée une fois, verte ; (2) l'analyse a changé d'avis en cours de route : l'idée « gagnée = simple statut » (I19) a été abandonnée parce que la dernière colonne sert au suivi après la vente ; (3) un oubli de `completerSources` aurait annulé la migration des sources : supprimé dans la PR 170.

**Reste à faire, dans l'ordre proposé** :
1. **Jérôme** : retirer les phrases de la liste Réglages > Sources (voir plus haut) ; confirmer ou non la suppression des colonnes « Perdues » / « En pause » du kanban (« trop de colonnes »).
2. **I16 : aligner les boutons restants** (liste dans `docs/consignes-ui.md`, section « Boutons »), à discuter avec Jérôme : pastilles Appel / Rendez-vous / Email / Tâche (un 4e style ?), « Créer le projet », le style discret ; zone de clic des « + Ajouter » sur téléphone (44 px).
3. Anciens défauts de tests : P1 et C12 (fenêtre 22 h–minuit UTC) ; C30 téléphone de `projets.spec.js` ; `ports-et-isolation.test.js` ; le test « assistant non administrateur » (erreur 409 à filtrer comme dans `filtres-commun.spec.js`).
4. Roadmap : `boutonFiltres` / `fenetreFiltres` vivent dans `js/modules/crm/filtres.js` mais servent à tout (leur place logique serait `js/os/ui.js`).
5. Audit de sécurité Fable (cette semaine ou la suivante, décision de Jérôme), audit des différences Jérôme / clients, configuration des types d'activité par l'utilisateur, retours d'Ingrid.

## Rapport du matin : nuit « GO NUIT » du 21 au 22/10/2026 (version 2.19.0)

Jérôme a donné « GO NUIT » le 21/10/2026 au soir ; Claude a codé les idées de `docs/idees-affaires-projets.md` (revue faite avec Jérôme) en autonomie, un sujet par PR, relue par Fable avant chaque fusion, fusionnée seule quand la coche « Tests » est verte (protocole dans `CLAUDE.md`). **Rien n'a eu besoin de la liste d'arrêt** : aucune règle Firestore, aucune migration, aucun déploiement de la plateforme clients (le CRM d'Ingrid n'a pas bougé : il ne se met à jour que par le workflow manuel).

| Sujet | PR | État |
|---|---|---|
| I2, I13, I18 : liens personne/organisation en direct, alignement, Accueil sans « + Personne » | 160 | fusionnée |
| I4, I6, I14 : bouton Modifier, liens cliquables, notes longues | 161 | fusionnée |
| I17, I12, I11 : montant fantôme, Factures et Tâches en une ligne | 162 | fusionnée |
| I7 : Propriétaire dans le Résumé | 163 | fusionnée |
| I5 (et I8) : note de départ à la place du champ description (MCP compris) | 164 | fusionnée |
| I10 : onglet Documents version 2 | 165 | fusionnée |
| I9, I15 (début) : bouton « Filtres » de l'Historique ; bouton commun | 166 | fusionnée |
| Docs, version 2.19.0, tests remis dans la liste, workflow | cette PR | – |

**À regarder à l'écran (recette de Jérôme)** : les « 5 vérifications » de chaque PR sont dans leur description (160 à 166). Les plus importantes : (1) créer une affaire : une carte « Cette affaire concerne… » grise apparaît dans les Points clés ; (2) une adresse `www.exemple.fr` dans une note est cliquable ; (3) Documents : « Dossier de travail … + Ajouter » et « Documents + Ajouter », date d'ajout ; (4) Propriétaire dans le Résumé ; (5) bouton « Filtres » de l'Historique.

**Ce qui n'a pas pu être vérifié avec le vrai système** : tout a été testé sur émulateurs et avec le navigateur de test ; pas de vraies données, pas de vrai téléphone, pas de vrai Google (Picker/Drive simulé), pas de vrais clients MCP (ChatGPT, Hermes) ; Safari et Firefox non testés (`-webkit-line-clamp` des notes longues).

**Ce que la nuit a révélé et corrigé ou noté** :
- **Régression de la PR 160** (retrait de « + Personne » sur l'Accueil) : les tests K2 (`identite-crm`) et I3 (`identite-client`) lisaient la couleur de ce bouton ; l'étage léger de la PR ne les lance pas ; corrigé dans la PR 161 (ils lisent le bouton principal de la page Personnes).
- **Coche de PR trop longue** : tout fichier sous `tests/` déclenchait la suite complète (11 à 17 minutes) ; corrigé le 21/10 (PR 158), puis `tests/package.json` aussi (cette PR) ; mesures de la nuit : 3 à 6 minutes par PR de code.
- **Fenêtre horaire 22 h–minuit UTC** : P1 (`corrections-dossiers-2`) et C12 (`parcours`) échouent sur `main` aussi, dans cette fenêtre (voir `docs/tests.md`, « Pièges connus »). À corriger dans le test, pas dans l'appli.
- **Réglages de l'environnement cloud** (faits par Jérôme le 21/10) : auto-merge, domaines du navigateur de test, Setup script : Chromium et les dépendances étaient présents dans la session de nuit.
- **Budget Fable** : relue chaque PR en entier ; budget hebdomadaire suivi (vendredi 07h00 = réinitialisation). L'audit de sécurité Fable est **décalé à la semaine prochaine** (décision de Jérôme).

**Reste à faire, dans l'ordre proposé** :
1. **Décisions de Jérôme** (liste dans `docs/idees-affaires-projets.md`, « État au matin ») : bouton « Filtres » à 44 px sur téléphone ; fenêtre « Filtres » qui propose les 6 valeurs ; date d'ajout des documents joints par l'assistant ; I15 suite (Journal, Veille, Automatisations, Tableau de bord au bouton « Filtres »).
2. **I16 : aligner les boutons restants** (liste dans `docs/consignes-ui.md`, section « Boutons »), dont la zone de clic des « + Ajouter » sur téléphone (30 px au lieu de 44).
3. Les anciens défauts de tests : P1 et C12 (fenêtre horaire) ; C30 téléphone de `projets.spec.js` (cherche `[data-section="projet-details"]`, une section qui n'existe plus) ; `ports-et-isolation.test.js` (impose le décalage 7).
4. `js/modules/crm/journal.js` ~l.172 écrit encore « gardée 90 jours » : contraire à la décision du 04/10/2026 (point 1 plus bas : « Appliquer la décision pas de RGPD »).
5. **I11 suite, I12 suite** : rien ; **I1, I3** abandonnées.
6. Audit de sécurité Fable (semaine prochaine), audit des différences Jérôme / clients, second passage du look compact, aide client publique, chantier ChatGPT sur le MCP, allègement des fiches.
7. Retours d'Ingrid (premier client réel depuis le 21/10/2026).

## État au 21/10/2026

- **Premier client réel en service (21/10/2026)** : Ingrid utilise désormais le CRM. Appel téléphonique fait par Jérôme ce jour ; les 8 tâches de préparation du projet « Accompagnement Ingrid » étaient faites. L'e-mail prévu ce jour n'est plus à envoyer (l'appel l'a remplacé). Elle remontera ce qu'elle remarque : traiter ses retours en petites PR. Aucun détail de client dans ce dépôt public.
- **Synchronisation GitHub vérifiée le 21/10/2026** : `main` est au commit 66dbc52 (PR 155), la branche de session le contient, rien n'est en retard.
- **Champ texte libre : fusionné** (PR 145 en 2.16.0, PR 149 en 2.16.2 : hauteur fixe de 4 lignes avec ascenseur, 16 px au moins sur téléphone). Plus rien à reprendre. **Reste du chantier lié** : allègement des fiches Affaires et Projets (trop de champs affichés), inventaire champ par champ (« je le regarde » / « jamais ») puis décision avec Jérôme. Pas de tags sur les affaires et projets (décision du 19/10/2026). Détail : second cerveau, fiches `Plateforme clients - décisions du module Automatisations et de la veille` et `Idée - affaires et projets dans le CRM de Chevalier IA OS`. Règle de Jérôme : une capture ou une maquette avant tout développement d'un écran.
- **Tests de PR corrigés (PR 158, fusionnée le 21/10/2026)** : un fichier de test ajouté ne déclenche plus la suite complète ; la coche = rapide + smoke + parcours de la PR. Mesure à faire sur les premières PR de code : si la coche dépasse 10 minutes, revoir avec Fable (objectif : environ 5 minutes). Les nuits des 19, 20 et 21/10 étaient rouges (issue GitHub 156, onglet Documents en format téléphone) : Jérôme a décidé de ne pas enquêter, à revoir après la nuit du 21 au 22/10.
- **Mode nuit : « GO NUIT »** (protocole dans `CLAUDE.md`). Réglages faits par Jérôme le 21/10/2026 : auto-merge activé, domaines du navigateur de test autorisés, Setup script ; **non vérifiés** dans une session (à constater la première nuit). L'audit de sécurité Fable est décalé à la semaine prochaine.
- **En premier : idées d'amélioration du module Affaires et Projets** : revue terminée, tout est dans `docs/idees-affaires-projets.md` (I1 à I18, ordre de travail et critères).
- **(ancien texte, repris)** **Idées d'amélioration du module Affaires et Projets.** Jérôme va les soumettre. Méthode convenue : (1) numéroter chaque idée (I1, I2…) ; (2) questionner Jérôme sur chacune jusqu'à la comprendre (cas vide, cas d'erreur, ce qu'il voit à l'écran) ; (3) les prioriser avec toutes les autres pistes de `roadmap.md` (audit des différences Jérôme / clients, second passage du look compact, aide client publique, audit de sécurité Fable avant le 23/10/2026 07h00, chantier ChatGPT sur le MCP, allègement des fiches). Le tableau des idées numérotées vivra dans `docs/idees-affaires-projets.md` (à créer à la première idée).
- **En attente de Jérôme** : jugement sur les captures du look compact (`~/chantiers-crm/captures-look-compact/`) ; PR 115 (CLAUDE.md, emplacement du clone).

## Vocabulaire et registre du menu (18/10/2026) : PR 127, version 2.12.0

PR A faite, en attente du « fusionne » (voir `reglages-menu-crm-unique.md`, section du 18/10/2026). **PR B fusionnée (2.13.0, nouvelle coque du menu).** **PR C faite (2.14.0, poignée de largeur du menu), en attente du « fusionne »** : voir `roadmap.md`. Reste à Jérôme : regarder les captures de `~/chantiers-crm/captures-menu-C/` (et `captures-menu-B/` : garde-t-il sa photo ? sinon rien à faire ; pour la garder, annuler le commit « avatar = initiale »). **PR D faite (2.15.0, look compact, PR 139), en attente du jugement de Jérôme sur `~/chantiers-crm/captures-look-compact/` (avant / apres) ; ne pas fusionner avant son accord.** **Plus tard** : l'audit complet des différences entre l'espace de Jérôme et ceux des clients.

## Extraction de valeur supprimée (18/10/2026)

Retirée partout (voir `cadrage-projets.md`, section « La vision de Jérôme »). **Après la fusion de la PR, Jérôme doit** : (1) déployer le MCP des clients (workflow plateforme, choix `mcp`) pour que l'outil `extraire_valeur_projet` disparaisse ; son CRM se met à jour tout seul ; (2) fermer le ticket GitHub n° 28 ; (3) si Hermes est branché, remplacer sa liste d'outils par celle de `branchement-mcp.md` (43 outils).

## Options par défaut des nouveaux espaces (18/10/2026) : PR 122

Dossier Drive et célébrations allumés par défaut chez un nouveau client ; zone « Dossier Drive parent » sous la case (Réglages > Options). PR en attente du « fusionne » de Jérôme (visible dans Réglages). **Avant de déployer la plateforme** : vérifier dans Firestore (`clients/<client>/crm_parametres/reglages`) que les espaces existants ont `celebrations` et `boutonsDepot` écrits, car les champs absents prennent la nouvelle valeur (true). Voir `roadmap.md` et `google-drive.md`.

## Deux actions pour Jérôme : tests sur GitHub (18/10/2026)

1. **Exiger la coche « Tests » avant toute fusion** : **impossible sur le forfait gratuit** (vérifié le 18/10/2026 : GitHub répond « Upgrade to GitHub Pro or make this repository public » pour les règles de branche d'un dépôt privé). Décision de Jérôme à prendre : rester en gratuit (la règle « on ne fusionne que si la coche Tests est verte » est alors tenue par Claude, sans verrou technique) ou passer à GitHub Pro (environ 4 $ par mois, résiliable à tout moment, 3 000 minutes d'Actions). Avec le Pro : https://github.com/settings/billing/plans (« Upgrade » sur la ligne Pro), puis https://github.com/jeromechevalier-wq/chevalier-ia-os/settings/rules/new?target=branch : nom « main », statut « Active », « Add target » > « Include default branch », cocher « Require status checks to pass », « Add checks » > « Tests », « Create ».
2. **Sortir le dépôt de Google Drive** : dans le Terminal, `mkdir -p ~/Code-Chevalier-IA && git clone https://github.com/jeromechevalier-wq/chevalier-ia-os.git ~/Code-Chevalier-IA/chevalier-ia-os`, puis ouvre ce dossier dans Claude Code et ne touche plus à la copie qui est dans Drive (Drive et Git se disputent les fichiers).

## Mon espace modifiable (17/10/2026) : branche mon-espace-modifiable, version 2.10.0

Code et tests écrits, **rien déployé**, PR en attente du « fusionne ». Lire `mon-espace.md` : qui peut quoi, la fonction `espaceReglages`, les **étapes de Jérôme avant le déploiement** (créer le compte de service `espace-reglages` et lui donner deux droits, vérifier le nom « Chevalier IA - Serveur 1 » en haut de chaque page de la console, puis choisir « fonctions » dans le workflow, qui publie aussi les automatisations et exige la clé n8n) et ce qui n'est pas vérifié en réel (vrai Storage, vrai appel, iPhone). Les règles Firestore et Storage ne changent pas. Captures de recette : `~/chantiers-crm/captures-mon-espace/`.

## Tests plus rapides, plusieurs sessions en même temps (17/10/2026) : branche acceleration-tests

Les tests sont maintenant en paliers (rapide, smoke, complet) et la suite complète tourne sur GitHub à chaque PR et chaque nuit : voir `docs/tests.md`. Dans la session, on ne lance que le test du module touché, puis `npm run test:rapide` et `npm run test:smoke` ; on ne lance ni n'attend la suite complète. Mode d'emploi du lanceur : `tests/README.md`.

**Reste à faire** : les scénarios `L10`, `L14` (et par moments `L16`, `L17`, `L19`, `L20`) de `liens-documents.spec.js` échouent au hasard, **déjà avant ce chantier** (L14 : 2 mesures sur 3 sur `main`). Cause trouvée : l'écran se redessine quand Firestore renvoie la fiche, parfois avant la fin de `ecrireDossier` (`js/modules/crm/lanceurs.js`) ou de `choisirDansGoogle` (`js/modules/crm/liens-documents.js`) ; la suite de l'action écrit alors sur un morceau d'écran déjà remplacé (un vrai utilisateur verrait un formulaire resté ouvert). Correctif à écrire dans l'appli (pas dans les tests) : effacer l'état du formulaire avant l'écriture, et faire lire `formulaires` par l'écran redessiné.

## Automatisations de Jérôme + vue administrateur (17/10/2026) : branche automatisations-admin, version 2.7.0

Code et tests écrits, **rien déployé**, interrupteur `AUTOMATISATIONS_EN_SERVICE = false` dans `functions/src/index.js` (une fusion déploie toutes les fonctions : il faut d'abord le secret et le compte de service). Lire `automatisations-n8n.md` parties 10 et 11 : reconnaissance par trois signes, guide pas à pas pour Jérôme, **à confirmer avec lui : le nom exact du credential `interne` dans son n8n** (prévu : « Clé n8n - interne »).

## Liens et documents, Google Drive (16/10/2026) : branche liens-documents-drive, version 2.6.1

## Tableau de bord : porte, écran et saisie (17/10/2026), version 2.9.0

**En ligne** : la porte des scripts GitHub (`docs/tableau-de-bord.md`, PR 94, 97), l'écran en lecture (PR 98), et la saisie d'une date ou d'une mesure avec l'onglet « Historique des saisies » (PR 101 : fonction appelable `tableaudebordSaisir`, lot atomique, le script quotidien n'écrase plus une saisie même en cas de course, section 7 de `docs/tableau-de-bord.md`). Les 14 indicateurs de clés sont écrits chaque jour par `interne-surveillance-cles`.

**Constats de Jérôme à traiter en premier (17/10/2026)** : (1) une échéance à moins d'un mois doit s'afficher en rouge (clignotement discret, avec `prefers-reduced-motion`) et déclencher des e-mails d'alarme : la règle actuelle (orange sous 30 jours) est à revoir avec lui ; (2) le workflow quotidien ignore les indicateurs saisis à la main, donc aucun e-mail pour une échéance saisie : ajouter une lecture seule sur la porte (`indicateurs.lire`) que le script appelle pour les évaluer ; (3) une note saisie affichait `dat" de test a v"rifier` : le texte est stocké tel quel (le `é` est devenu `"`), l'affichage est bon : retester la saisie des accents dans le champ. Brief complet : fiche du second cerveau `Reprise - Tableau de bord, suite (2026-10-17)`.

**Reste à faire, dans l'ordre** (conception : fiche « Module Tableau de bord - conception » du second cerveau ; relecture Fable du 17/10/2026) :
1. Objectifs du mois et courbes (décision de Jérôme : calcul chaque dimanche par une fonction planifiée, et à chaque arrivée sur la page par une fonction appelable ; jamais d'écriture depuis l'écran) : migrer `os_objectifs` dans les nouvelles tables (décision de Jérôme : même code partout), lecture de `tableaudebord_releves` (index composite à créer : aucun `firestore.indexes.json` aujourd'hui), tableau Général avec les objectifs.
2. (FAIT, PR 101) Saisie des dates et des mesures par une fonction serveur, historique des saisies.
3. Boutons de rafraîchissement (demande en base, fonction qui lance le workflow GitHub avec un jeton limité, le workflow accepte une cible).
4. Retrait des indicateurs disparus de la configuration ; limites par famille de clés ; lot d'écriture atomique ; frein sur les refus 401.
5. Indicateurs des sauvegardes et des copies Google dans le tableau de bord.
6. Plateforme clients : porte `tableaudebord` dans `functions-plateforme`, réécriture `/tableau-de-bord` dans `firebase.plateforme.json`, `--usage tableaudebord` pour les clients dans `scripts/porte/outil.js`, fonction d'administration pour que Jérôme lise les bases clients, point d'étape Fable avant ouverture.
Petits points notés par la relecture : aide de la méthode (auto/semi/manuel) à rendre accessible au toucher et au clavier, vocabulaire de « à traiter », échéance écrite en texte.

**Pour les tests** : un port d'émulateur pris par une autre session ? Ne rien tuer ; copie jetable sur d'autres ports avec `/private/tmp/claude-501/sync-alt.sh` si elle existe encore (sinon refaire : ports 8180, 9199, 5150). `JAVA_HOME=$HOME/.local/jdk-21/Contents/Home`.

## Veille : ajout de lien, bouton Résumer, lecture du résumé : TERMINÉ le 17/10/2026

Fusionné (PR n° 69), secret `VEILLE_JETON_RESUMER` créé, workflow n8n `interne-veille-resumer-a-la-demande-porte` publié avec le champ `html` (version `9695bfa8` ; version de retour : `9e0f1ece`), essai réel réussi par Jérôme (« Lire le résumé » apparaît). **Rien à reprendre**, sauf l'option de changer l'ancien jeton du bouton (voir `veille-ajout-et-resume.md`, fin de la partie 3). À supprimer de cette note quand Jérôme l'aura lue.

## Chantier 14 : journal d'activité des workflows (11/10/2026)

Code, tests (Google simulé) et guide écrits ; **rien déployé**. Lire `google-drive.md` : ce que Jérôme verra, les **étapes à faire par lui dans la console Google** (API Drive et Picker, ID client OAuth, écran de consentement `drive.file`, puis donner l'ID client public à Claude), les choix faits et ce qui n'est pas vérifié en réel. Tant que l'ID client est vide, les boutons Google sont cachés.

## Réglages à menu latéral + menu CRM unique (16/10/2026) : branche reglages-menu-crm-unique, version 2.6.0

Code écrit, tests écrits, **rien déployé**, PR en attente du « fusionne ». Voir `reglages-menu-crm-unique.md` : ce que Jérôme voit, le choix de la méthode A, comment un module déclare ses réglages, et ce qui reste en lecture seule chez un client (nom, logo, membres, modules : les règles Firestore interdisent l'écriture depuis le navigateur). Reste à décider avec Jérôme : si un éditeur doit pouvoir les modifier (règles ou fonction serveur). La section Drive de « Liens et documents » s'ajoute par une déclaration dans `registre.js` (point d'accroche décrit dans la doc).

## Ménage du CRM (16/10/2026) : branche menage-crm-clients, version 2.5.0

Code écrit, **tests verts** (PR n° 73). Voir `menage-crm.md` : ce qui est fait, les choix faits, ce qui touche les données de Jérôme. Reste : relecture de la PR, « fusionne » de Jérôme. Chantiers suivants : Réglages à menu latéral, fusion du menu CRM, Drive / liens.

## MCP pour tous les clients (16/10/2026) : PR en attente du « fusionne »

Construit et testé (tests verts), **rien déployé**. Lire `mcp-clients.md` : ce qui est fait, l'isolation entre clients, les trois déploiements à lancer dans l'ordre (règles, fonctions, site, par le workflow « Déploiement plateforme clients »), et ce qui n'est **pas** vérifié (vrai claude.ai, vrai ChatGPT). Première chose à faire après le déploiement : allumer le module chez un client d'essai (`activer-module <client> mcp --ecrire`) et brancher Claude sur son lien.

## Chantier 14 : module Automatisations, ex-« journal d'activité des workflows » (11/10/2026 ; renommé le 16/10/2026)

Phases 1 et 2 écrites et testées (émulateurs + faux n8n), PR en attente du « fusionne » de Jérôme. Rien déployé. **À faire par Jérôme, dans l'ordre** (pas à pas dans `automatisations-n8n.md`, partie 7) : publier règles et page (workflow, choix `tout`), déposer la clé n8n (`firebase functions:secrets:set N8N_API_KEY --project chevalier-ia-app`, sans la montrer à personne), déployer les fonctions, étiqueter un workflow de test `client-<identifiant>` et activer le module (`activer-module <client> automatisations`). Ensuite : essai réel avec un workflow lent et un workflow qui échoue, brancher l'alerte « Nous sommes prévenus ». Phase 3 (Logger, étapes) : pas commencée, `steps` est prêt.

## En attente du feu vert de Jérôme : objectif « Chiffre d'affaires signé » (10/10/2026)

Demande d'évolution rédigée et validée, **rien n'est codé** : `demande-evolution-ca-signe.md` (définition, cas particuliers, 4 points à vérifier dans le code avant de commencer, périmètre). Cible : 1 000 € par mois. Une seule PR, suite de tests complète, fusion après le « fusionne » de Jérôme. Le contexte des 4 KPI est dans la fiche « KPI principaux de Chevalier IA » du second cerveau.

## En premier : connexion Google (OAuth) du serveur MCP pour le téléphone (09/10/2026)

PR 49 **fusionnée et déployée le 10/10/2026**, règles Firestore publiées, essai réel réussi sur l'ordinateur (`qui_suis_je` → `claude-ai-jerome-chevalier`) **et sur le téléphone** (Jérôme, 10/10/2026). Chantier terminé : rien à reprendre de ce côté. Lire `mcp-oauth.md` (mise en route dans l'ordre : publier les règles Firestore, fusionner, ajouter le connecteur sur claude.ai, essayer sur le téléphone). Si l'essai échoue : les journaux Cloud Run du service `mcp` portent un champ `code` en `oauth_…` qui dit à quelle étape ça casse. Validé en réel sur l'ordinateur et sur le téléphone. Décisions de Jérôme : tous les droits, 30 jours glissants. **Pour couper l'accès d'un téléphone : pas à pas dans `mcp-oauth.md`, « Couper l'accès du téléphone ».**

## Pour mémoire : le chantier Projets est terminé (07/10/2026)

Rien à reprendre de ce côté, tout est fusionné sur `main` et le déploiement est vert : écran Projets en 7 étapes (PR #32 à #38, version 2.1.0), facturation 2.2 (PR #40 et #41, version 2.2.0 : factures dans le projet, Clôture bloquée tant qu'une facture est à payer, sortie « clôturer avec impayé », la vente s'arrête à « Gagné », migration des anciennes affaires dans Réglages) et 16 outils MCP des projets (PR #42, détail dans `mcp-projets.md`). Jérôme a essayé l'écran et dit que tout fonctionne ; **il remontera ce qu'il remarque à l'usage** : traiter ces retours en petites PR.
- **Hermes n'est pas encore configuré** (Jérôme, 07/10/2026). Au moment de le brancher, la liste des **43 outils** à autoriser (44 avant la suppression de `extraire_valeur_projet`, le 18/10/2026) est dans `branchement-mcp.md` (vérifiée par un test) : ne pas reprendre une ancienne liste (`ajouter_encaissement` n'existe plus).
- Décisions de Jérôme à ne pas rouvrir : une affaire Gagnée n'est **pas** archivée automatiquement (il l'archive à la main) ; une facture se paie en entier ; pas de délai de paiement.
- Non faits volontairement : outils MCP de modification ou de suppression de facture et de gestion des modèles (ils restent à l'écran) ; blocage du passage de phase tant que les tâches de la phase ne sont pas faites (proposé à Jérôme, pas demandé).

## 0. Migration des sauvegardes vers Backblaze : état au 04/10/2026 (soir) et suite

**À lire d'abord si Jérôme parle de sauvegardes, de Backblaze, de Drive ou de Time Machine.** Décisions et plan : `roadmap.md` (« Sauvegardes : décisions du 04/10/2026 » et « Plan de migration vers Backblaze »). Carte complète et schéma « Aujourd'hui / Cible » : dépôt `_JEROME_OS_onGIT`, fiche « Carte des sauvegardes » (la session doit avoir ce dépôt : `add_repo`, accès en écriture).

### Ce qui existe (tout fusionné sur `main` sauf mention contraire)
- **Dépôt privé `interne-sauvegardes`** (créé par Jérôme : GitHub refuse `create_repository` à Claude, 403). Contient les jobs, `README.md` (secrets, règles, activation), `LISEZ-MOI.md` (déposé en clair dans le bucket), `docs/restaurer.md`. Pour y écrire : `add_repo` avec `access: push`, puis cloner, branche, PR (le dépôt n'accepte rien sur `main` sans PR par convention).
- **Job GitHub quotidien : testé en vrai le 04/10/2026**, 8 dépôts sauvegardés (environ 119 Mo), noms chiffrés illisibles chez Backblaze, secrets masqués dans le journal.
- **Essai de restauration (mode `--github`) : réussi le 04/10/2026** : le bundle de `chevalier-ia-os` relu dans Backblaze, déchiffré, `git fsck` propre, empreinte identique. Cela confirme que la configuration rclone par l'environnement (`RCLONE_CONFIG_*`) et le chiffrement fonctionnent.
- **Écrits et testés avec un faux rclone, jamais exécutés pour de vrai** : export des bases (`scripts/bases.mjs`, `restaurer-bases.mjs`, aller-retour exact sur l'émulateur Firestore), copie de Drive (`scripts/drive.mjs`, `autoriser-drive-lecture.mjs`), surveillance (`fraicheur.mjs`), essai de restauration `--bases` et `--drive`.
- **Secrets déjà créés par Jérôme** (noms exacts) : `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `CRYPT_PASSWORD`, `CRYPT_SALT`, `JETON_LECTURE_GITHUB`. **Pas encore créés** : `CLE_FIREBASE_CHEVALIER_IA_OS`, `CLE_FIREBASE_SUIVI_PRESENCE_ELEVES`, `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`. Jamais de valeur dans la conversation, le dépôt ni un commit.
- **En attente du « fusionne » de Jérôme** : PR 2 de `_JEROME_OS_onGIT` (carte et schéma corrigés pour Time Machine : plus de disque, aucune sauvegarde du Mac). **Deux dépôts ont une PR numérotée 2** : toujours écrire le dépôt avec le numéro.
- **Les workflows planifiés sont en sommeil** tant que la variable de dépôt `SAUVEGARDE_ACTIVE` n'est pas `oui` (sinon e-mails d'échec inutiles). Les lancements manuels marchent toujours (Actions, Run workflow ; l'essai de restauration a un menu « modes » : `--github` seul avant que Drive et les bases soient prêts).
- **L'ancien système du Mac reste en place** (cron : script des `.bundle` dans Drive chaque dimanche, vérification des changements non poussés) : on n'y touche **qu'après** une semaine de succès automatiques, 8 jours d'observation de l'autorisation Google et un essai de restauration complet réussi.

### Suite, dans l'ordre
1. **Jérôme** : copie papier des deux mots de passe de chiffrement (et dans KeePassXC) si ce n'est pas fait ; merge « Conflict » du fichier KeePassXC ; copie du fichier KeePassXC hors de Drive (clé USB).
2. **Bases de données** : Jérôme crée un compte de service « Lecteur Cloud Datastore » par projet Firebase (`chevalier-ia-os`, `suivi-presence-eleves`), colle sa clé JSON dans le secret correspondant et **supprime le fichier**. Puis lancer « Bases de données vers Backblaze » à la main ; lire le journal (`get_job_logs`) ; lancer l'essai de restauration `--bases`. Vérifier si ces projets ont des fichiers dans Cloud Storage (non couverts).
3. **Drive** : ajouter la portée `drive.readonly` à l'écran de consentement du projet `chevalier-ia-os` et le passer « En production » ; Jérôme lance `node scripts/autoriser-drive-lecture.mjs` sur son Mac (fichier JSON du client OAuth dans `~/.config/interne-sauvegardes/oauth-client.json`), puis `--copier client-id`, `--copier client-secret`, `--copier jeton` vers les trois secrets. **Risque connu** : en mode « Test » le jeton expire au bout de 7 jours (le script avertit) ; repli : compte de service avec partage des dossiers. La première copie (~200 Go) est découpée et reprend toute seule d'un jour à l'autre ; point à vérifier : comment rclone traite les Google Docs natifs.
4. **Activation** : variable `SAUVEGARDE_ACTIVE` = `oui` après la recette, puis une semaine d'exécutions automatiques réussies.
5. **Bascule** (Jérôme, sur le Mac) : retirer les deux lignes du cron, ranger les scripts de `_GITHUB_BACKUP` dans `__A_SUPPRIMER` (jamais de suppression), vérifier que tout est poussé, retirer le code et le second cerveau du Mac. Puis réécrire le `CLAUDE.md` du second cerveau et « Règles de travail Git » (branche par session, ChatGPT compris ; protection de `main` des sites en production, à vérifier selon l'abonnement GitHub).
6. **Time Machine** : pas de nouveau disque pour l'instant ; décision à reprendre après la migration.

### Limites et pièges connus
- **Une session cloud ne peut pas exécuter rclone** (le réseau de la session bloque son site) : les essais réels passent par GitHub Actions ; Claude lit les journaux avec `get_job_logs` (`return_content: true`).
- **Avertissements Node 20** dans les journaux : passer `actions/checkout`, `actions/setup-node` et `actions/setup-java` à leurs versions suivantes (`setup-java` v5) dans une PR dédiée.
- Pas dans la carte des sauvegardes : Notion, n8n, iCloud Drive, fichiers du VPS.
- Prix de Backblaze : environ 1,3 $/mois pour 200 Go, relevé sur des pages de synthèse le 04/10/2026, à confirmer.

## 1. Appliquer la décision « pas de RGPD, on garde tout » (décidée le 04/10/2026)

Décision de Jérôme : base interne, aucune mesure RGPD pour l'instant ; les journaux d'audit ne s'effacent jamais, y compris les noms, e-mails et notes ; les copies « avant / après » non plus. **La règle de durée de vie (TTL) de 90 jours est déjà supprimée dans la console** (par Jérôme, le 04/10/2026) : plus rien n'efface ces copies. Il reste à aligner le code, les tests et les docs. Ne pas réintroduire le RGPD sans que Jérôme le demande.

### Où est le code concerné (état de `main` au 04/10/2026)

| Fichier | Ce qui reste de l'ancienne règle |
|---|---|
| `functions/src/coeur/ecriture.js` | `JOURS_COPIES = 90` (ligne 23) et `expireAt` écrit avec les copies (ligne ~119 et ~157) ; `tronquer(parametres)` (ligne ~39 et ~158) : le journal `crm_audit` ne garde plus les valeurs reçues |
| `js/modules/crm/logique.js` | `JOURS_COPIES_AUDIT = 90` (ligne ~1556) et `expireAt` (ligne ~1575), pour l'audit des actions de l'écran ; la copie `functions/partage/logique.js` est générée (`node scripts/preparer-fonctions.js`) |
| `firestore.rules` | la règle sur `crm_audit_avant` exige `request.resource.data.expireAt is timestamp` (ligne ~27) |
| `functions/src/coeur/restaurer.js` | message `copie_expiree` (« n'existent plus ») |
| `js/modules/crm/journal.js` | textes « elle a expiré (gardée 90 jours) » (lignes ~46 et ~166) |
| `functions/src/mcp/outils/suppression.js` | descriptions « Récupérable 90 jours » (`supprimer_note`, `supprimer_activite`) |

### Piège d'ordre à respecter

La règle Firestore **exige** `expireAt`, et l'écran comme le serveur l'écrivent. Si le code cesse de l'écrire avant que la règle soit assouplie (ou l'inverse), des écritures sont refusées. **Approche la plus sûre (recommandée)** : ne pas toucher aux règles ni au champ ; mettre `JOURS_COPIES` et `JOURS_COPIES_AUDIT` à une très grande valeur (par exemple 36 500 jours, soit 100 ans), pour que `expireAt` reste valide mais inoffensif maintenant que le TTL est supprimé. Aucune publication de règles n'est alors nécessaire. Un nettoyage complet du champ (règles, écran, serveur, tests) pourra venir plus tard, en un seul lot coordonné, si Jérôme le veut.

### À faire

1. Garder aussi les **valeurs reçues** dans `crm_audit` (paramètres, y compris noms, e-mails, notes, tronqués à 2 000 caractères comme prévu au plan 5.2), à la place des seuls noms de champs.
2. Allonger la durée des copies comme ci-dessus, adapter les textes (« gardée 90 jours », « expiré », « Récupérable 90 jours », `copie_expiree`), les descriptions d'outils et les tests.
3. Mettre à jour `plan-mcp.md` (section 5.2, écarts de l'étape 4, risque R10), `roadmap.md` (retirer « À confirmer » de l'étape 4), `securite-et-pannes.md`, `playbook-mcp-firebase.md`, `mcp-etape-4.md`, `audit-ecran.md` et `journal-ecran.md`, qui parlent encore du RGPD et des 90 jours.
4. Lancer les tests du module touché, `npm run test:rapide` et `npm run test:smoke`, puis une PR pour Jérôme (la suite complète tourne sur GitHub).

## 2. Reste du plan du serveur MCP, dans l'ordre (voir `roadmap.md`)

- **À vérifier avec Jérôme le 04/10/2026** : la première sauvegarde quotidienne de Firestore apparaît dans la console (« Reprise après sinistre », tableau « Sauvegardes », expiration à 98 jours).
- **Étape 6, fin** : brancher **Hermes** sur le VPS (jeton « bibliothécaire », sans suppression ni restauration ; Jérôme doit fournir `hermes --version`). Mettre à jour `branchement-mcp.md`.
- **Étape 5, fin (revue le 04/10/2026)** : plus d'export JSON par Drive. La base est exportée **directement dans Backblaze B2 (Europe), chiffrée**, chaque semaine, par un job (voir `roadmap.md`, « Sauvegardes : décisions du 04/10/2026 »). Reste : le job, `outils/restaurer-export.js` et un **essai de restauration** (qui crée une nouvelle base, jamais d'écrasement). Ordre convenu : compte Backblaze et clé de chiffrement gardée **hors de Drive**, job GitHub quotidien, essai de restauration, jobs des bases et de Drive, et **seulement ensuite** couper GitHub → Drive. Sauvegarde de l'autre appli (`suivi-presence-eleves`) : mercredi, 98 jours, première copie attendue le 07/10/2026. **Plan de migration approuvé le 04/10/2026** : dépôt privé `interne-sauvegardes` (jobs GitHub quotidien, Drive et bases hebdomadaires, tous chiffrés vers Backblaze, essai de restauration automatique) ; détail et ordre dans `roadmap.md` (« Plan de migration vers Backblaze »). Drive est lu avec l'autorisation Google de Jérôme (`drive.readonly`) : surveiller l'expiration à 7 jours, repli = compte de service. **Time Machine** : disque renvoyé, aucune sauvegarde du Mac, pas de nouveau disque pour l'instant.
- **Étape 7** : pièces jointes dans l'appli (par lien d'abord, puis téléversement vers Drive). Suppose le test à 8 jours du prototype Drive (autorisation à refaire sur le Mac, contrôle vers le 10/10/2026).
- **Étape 8** : recette et clôture.
- **En attente de discussion** : quatre points d'expérience utilisateur de la version 2.0.1 (`retours-ux-2026-10-04.md`).
