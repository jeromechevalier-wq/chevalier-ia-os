# Étape C : ventes et CRM (audit fonctionnel, version 2.3.3)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Statut : partiel (lecture du code et essais de règles pures faits ; aucun essai dans un navigateur ni sur les émulateurs, voir ci-dessous).

Périmètre : personnes, organisations, affaires (étapes, perdue, pause, gagné, archivage, suppression), activités, notes, documents et favoris, recherche, filtres, export, réglages du CRM, lien affaire-projet.

Comment j'ai travaillé : lecture de `js/modules/crm/` en entier (sauf les chiffres de l'accueil), des plans d'écriture partagés avec le serveur MCP, des docs de référence, puis des essais de règles avec `node --test` dans un dossier hors dépôt (fichiers `essai-c.test.mjs`, `essai-c2.test.mjs`, `essai-c3.test.mjs`, appelés « essai E1 », « essai E2 »… plus bas). La suite existante `tests/logique.test.js` passe : 158 tests réussis, 0 échec (relancée dans la session). Aucune donnée réelle, aucun appel au MCP de production.

## Ce qui n'a pas été regardé
- Aucun essai dans un vrai navigateur (Playwright) ni sur les émulateurs Firebase : les constats qui dépendent de l'écran sont donc « PLAUSIBLE » quand la preuve est une lecture de code, ou « CONFIRMÉ » seulement au niveau de la règle (fonction pure), et je le dis à chaque fois.
- Les chiffres de l'accueil (objectifs, statistiques, graphique du chiffre d'affaires) : autre étape. Je n'ai relevé que ce qui touche une suppression ou une pause.
- Projets, factures, extraction de valeur (autre agent) : seulement le lien affaire-projet (créer, lier, détacher, suppression).
- Outils du serveur MCP (autre agent) : seulement leurs validations de dates et de montant, pour les comparer à celles de l'écran.
- `js/modules/crm/journal.js` (écran Journal) et la restauration : étape D.
- Les règles Firestore, le style (CSS), l'affichage téléphone, l'accessibilité.
- L'état réel des données de Jérôme (migration des étapes retirées faite ou non : non vérifié).
- `tests/e2e/parcours.spec.js` : lu par extraits (noms des tests et les passages sur l'export, l'historique, la suppression), pas relancé.

## Constats

### C-01 · Supprimer une organisation efface aussi des notes et des activités de personnes ou d'affaires qui l'ont quittée
- **Gravité** : BLOQUANT
- **Confiance** : CONFIRMÉ (règle de suppression, essais E1 et E1b) ; le chemin complet depuis l'écran est lu dans le code, pas rejoué dans un navigateur
- **Ce qui se passe** : quand on note ou planifie quelque chose sur une personne (ou une affaire), l'élément reçoit le lien vers l'organisation du moment. Si la personne change d'organisation, ou si l'affaire est rattachée à une autre organisation, les anciens éléments gardent l'ancien lien. Ensuite, supprimer l'ancienne organisation (permis, puisqu'elle n'a plus ni personne ni affaire) supprime tout ce qui porte son lien, y compris les notes et activités d'une personne ou d'une affaire qui existent toujours.
- **Ce que ça change pour Jérôme** : il peut perdre sans avertissement l'historique d'une affaire ou d'une personne en nettoyant une ancienne organisation ; la confirmation par le nom ne parle que de l'organisation.
- **Où dans le code** : `js/modules/crm/logique.js:1545` et `:1550` (tout ce qui a `organisationId` est supprimé, sauf les éléments de projet) ; `js/modules/crm/donnees.js:246-248` (changer l'organisation d'une personne ne touche que la personne) ; `js/modules/crm/fiche-affaire.js:96` (idem pour l'affaire) ; `js/modules/crm/fiche-personne.js:179` (les nouveaux éléments prennent l'organisation du moment).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 3.10 point 5 (« détacher une personne de son organisation ne supprime rien ») et point 2 (supprimer une organisation vide).
- **Preuve** : essai E1 : une note `{personneId:'p1', organisationId:'o1'}` alors que `p1` est passée chez `o2` : le plan de suppression de `o1` contient `supprimer crm_notes/n1`. Essai E1b : une activité de l'affaire `a1` (toujours vivante, maintenant chez `o2`) est supprimée de la même façon. Aucun test existant ne couvre ce cas (`tests/logique.test.js`, B17).

### C-02 · Supprimer une personne efface le fil d'une affaire qui lui a été retirée
- **Gravité** : BLOQUANT
- **Confiance** : CONFIRMÉ (règle de suppression, essai E2) ; chemin écran lu dans le code
- **Ce qui se passe** : si une affaire est réattribuée de la personne A à la personne B, ses anciennes activités, notes et événements gardent le lien vers A. Supprimer A (même avec « conserver ses affaires ») supprime tout ce qui porte le lien de A, donc le fil de l'affaire qui est maintenant à B.
- **Ce que ça change pour Jérôme** : une affaire vivante peut perdre son historique quand on supprime l'ancienne personne.
- **Où dans le code** : `js/modules/crm/logique.js:1517-1519` (la dernière branche supprime tout élément ayant `personneId` de la personne, même si son affaire n'est pas dans la liste supprimée ou détachée) ; `js/modules/crm/fiche-affaire.js:91-95` (changer la personne de l'affaire ne met à jour que l'affaire).
- **Règle ou décision concernée** : `docs/decisions-construction-v2.md` point 5 (« conserver ses affaires » : on garde leurs activités, notes et événements).
- **Preuve** : essai E2 : activité `ac1 {personneId:'p1', affaireId:'a1'}` avec `a1` rattachée à `p2` : le plan « conserver » contient `supprimer crm_activites/ac1`.

### C-03 · L'écran ne permet pas de retirer la personne ou l'organisation d'une affaire
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : dans la fiche d'une affaire, la croix du champ « Personne » ou « Organisation » vide le champ à l'écran mais n'enregistre rien (le code ignore le choix vide). Au rafraîchissement, l'ancienne valeur revient. On ne peut que remplacer. Le serveur MCP, lui, sait détacher (`null`).
- **Ce que ça change pour Jérôme** : le message de refus de suppression d'une organisation lui dit « détache d'abord ses affaires », ce qui est impossible depuis l'écran (il doit déplacer chaque affaire vers une autre organisation, ou la supprimer).
- **Où dans le code** : `js/modules/crm/fiche-affaire.js:92` (`if (!el || el.id === a.personneId) return;`) et `:96` (`if (el && el.id !== a.organisationId)`) ; `js/os/ui.js:343-344` (la croix appelle `surChoix(null)`) ; message : `js/modules/crm/logique.js:1390`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 3.10 point 2 (« détacher d'abord ses personnes »).
- **Preuve** : lecture des lignes citées ; `functions/src/mcp/outils/ecriture.js:51-52` accepte `personneId`/`organisationId` à `null`, pas l'écran.

### C-04 · La détection de doublons a des trous (personnes archivées, rattachement silencieux, pas de contrôle à la modification)
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E6) pour les archivées et les noms inversés ; PLAUSIBLE (code) pour le rattachement silencieux
- **Ce qui se passe** : (1) une personne archivée n'est jamais signalée comme doublon : on peut recréer « Marie Dupont » sans avertissement. (2) Dans la fenêtre « Ajouter une affaire », si on tape un nom de personne sans choisir de suggestion, l'affaire est rattachée sans question à une personne existante du même nom (un homonyme sera donc confondu). (3) Aucun contrôle quand on renomme une personne ou une organisation, ou qu'on ajoute un e-mail sur une fiche existante. (4) « Dupont Marie » et « Marie Dupont » ne sont pas vus comme identiques ; un même numéro de téléphone non plus.
- **Ce que ça change pour Jérôme** : des fiches en double ou, pire, une affaire accrochée à la mauvaise personne sans qu'il le voie.
- **Où dans le code** : `js/modules/crm/logique.js:421-431` (`if (p.archive) return false;` ligne 426 ; comparaison du nom seulement) ; `js/modules/crm/affaires.js:166-169` (réutilisation silencieuse) ; `js/modules/crm/fiche-personne.js:87` et `:62` (renommer, modifier les e-mails sans contrôle) ; `js/modules/crm/fiche-organisation.js:34`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 8 point 4 (bandeau « Cette personne existe déjà » ; « Créer quand même ») et 14 point 2 (« aucune alerte pour deux personnes différentes »). Le cahier ne dit rien des archivées ni de la fenêtre d'affaire (`docs/decisions-construction-v2.md` point 8 la décrit comme un choix simple).
- **Preuve** : essai E6 : 0 doublon trouvé pour une personne archivée de même nom, 0 pour « Dupont Marie » contre « Marie Dupont », 0 pour un même téléphone.

### C-05 · Un montant négatif est accepté sur l'écran ; la durée n'est pas contrôlée
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E3) ; le champ de l'écran est lu dans le code, pas essayé dans un navigateur
- **Ce qui se passe** : la règle de création d'affaire garde tout nombre fini, négatif compris (`-50` donne `-50`). Les champs de montant de l'écran n'ont pas de plancher appliqué par le code (l'attribut `min` du formulaire de création n'est pas vérifié, la fiche n'en a pas). La durée en jours est enregistrée telle quelle (`'3 jours'` est conservé). Le serveur MCP, lui, refuse un montant négatif ou trop grand (`min(0).max(1e9)`) et exige un entier pour la durée.
- **Ce que ça change pour Jérôme** : une faute de frappe (« -2000 ») fausse le total de la colonne du Kanban et le montant affiché, sans message.
- **Où dans le code** : `js/modules/crm/logique.js:557-558`, `:567` ; `js/modules/crm/affaires.js:134` ; `js/modules/crm/fiche-affaire.js:64` et `:134` ; `js/modules/crm/composants.js:157` et `:169` ; `js/modules/crm/logique.js:1219` (total de colonne) ; MCP : `functions/src/mcp/outils/ecriture.js:47`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 3.4 (`montant` « estimé, puis facturé » ; `dureeJours` « pas de 0,5 »). Le commentaire de `logique.js:1415-1417` dit qu'une règle ne s'écrit qu'à un seul endroit.
- **Preuve** : essai E3 : montants `-50` donne `-50`, `1e3` donne `1000`, `'3 jours'` conservé comme durée.

### C-06 · Une affaire gagnée peut être marquée « Perdue » alors que son projet continue
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E7)
- **Ce qui se passe** : sur la fiche d'une affaire gagnée, le bouton « Perdue » est proposé. La règle l'accepte : l'affaire devient « perdue » en gardant l'étape « Gagné », et un projet d'extraction est créé même si le vrai projet de livraison est toujours lié et en cours. « Rouvrir » remet la vente en « gagnée » mais ne retire pas l'extraction.
- **Ce que ça change pour Jérôme** : un clic de trop sur « Perdue » crée un projet d'extraction inutile et déplace une vente gagnée dans la colonne « Perdues ».
- **Où dans le code** : `js/modules/crm/logique.js:662-670` (aucune vérification de l'étape ou du projet lié) ; `js/modules/crm/fiche-affaire.js:71-75` ; `js/modules/projets/logique.js:873-877` (l'extraction ne regarde que l'extraction déjà existante).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 4 point 2.4 (une affaire perdue garde son étape, c'est voulu) ; `docs/cadrage-projets.md` (affaire gagnée avec projet : extraction à la fin du projet, pas avant). Le cas « gagnée puis perdue » n'est pas tranché.
- **Preuve** : essai E7 : `marquerPerdue` sur `{etape:'gagne', statut:'gagnee'}` donne `statut:'perdue'` sans erreur.

### C-07 · Une activité ne peut être ni modifiée, ni reportée, ni « dé-faite » depuis l'écran
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : le menu d'une activité à faire ne propose que « Supprimer ». Les fonctions pour modifier (`majActivite`) et pour annuler un « Fait » (`activiteNonFaite`) existent mais aucun écran ne les appelle. Une activité déjà faite n'a aucun bouton (ni annuler, ni supprimer) dans l'historique.
- **Ce que ça change pour Jérôme** : pour reporter une relance il faut la supprimer et la recréer ; un « Fait » cliqué par erreur ne peut plus être défait depuis l'écran.
- **Où dans le code** : `js/modules/crm/activites.js:99-102` (menu : « Supprimer » seulement) et `:232-234` (ligne d'activité faite sans action) ; `js/modules/crm/donnees.js:350` ; `js/modules/crm/logique.js:975` (jamais appelées côté écran : recherche dans `js/`).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 5 point 2 (« Fait » ouvre l'activité suivante) ; rien n'interdit le report, mais rien ne le prévoit non plus.
- **Preuve** : recherche des appels de `majActivite` et `activiteNonFaite` dans `js/` : aucun hors définition.

### C-08 · La recherche d'une liste ne trouve pas un numéro de téléphone tapé sans espaces ou avec +33
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E5)
- **Ce qui se passe** : la recherche de la liste des personnes inclut les téléphones, mais compare le texte tel qu'il est enregistré. « 0612345678 » ne retrouve pas « 06 12 34 56 78 » ; « +33612345678 » non plus.
- **Ce que ça change pour Jérôme** : en collant un numéro depuis un appel manqué, il voit « Aucune personne ne correspond » alors que la personne existe.
- **Où dans le code** : `js/modules/crm/logique.js:1254-1256` et `:1258-1261`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 9 point 2 (« mêmes règles de normalisation » que la recherche intelligente : accents et casse seulement).
- **Preuve** : essai E5 : recherche `0612345678` : 0 résultat ; `06 12 34` : 1 résultat ; `+33612345678` : 0 résultat.

### C-09 · Les nombres de personnes d'une organisation ne sont pas les mêmes selon l'écran, et le refus de suppression cite des personnes qu'on ne voit pas
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai E15 pour le refus) ; les écarts d'affichage sont lus dans le code
- **Ce qui se passe** : la liste des organisations et le refus de suppression comptent les personnes archivées ; la fiche de l'organisation les cache. De même la colonne « Affaires en cours » de la liste ne compte que les affaires qui portent l'organisation, alors que la fiche ajoute les affaires de ses personnes même si l'affaire a une autre organisation ou aucune.
- **Ce que ça change pour Jérôme** : le message « cette organisation a encore 1 personne » alors que la fiche affiche « Aucune personne » ; des totaux qui se contredisent.
- **Où dans le code** : `js/modules/crm/organisations.js:12-13` ; `js/modules/crm/fiche-organisation.js:29-32` ; `js/modules/crm/logique.js:1374-1392`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 3.10 point 2 et 7 (colonnes « Personnes (nombre) », « Affaires en cours »).
- **Preuve** : essai E15 : une personne archivée et une affaire archivée suffisent à bloquer la suppression (« encore 1 personne et 1 affaire »).

### C-10 · Renommer une source ou un secteur dans les Réglages ne suit pas les fiches ni les filtres enregistrés
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : les sources et secteurs sont des textes recopiés dans chaque fiche. Renommer « Réseau entrepreneuses » dans les Réglages change la liste, mais pas les fiches existantes ni le filtre enregistré « Réseau entrepreneuses » (qui cherche l'ancien texte). Les anciennes et nouvelles valeurs coexistent ensuite dans les filtres. Retirer une étiquette laisse son identifiant dans les fiches (invisible, sans erreur).
- **Ce que ça change pour Jérôme** : après un renommage, un filtre enregistré ne montre plus que la moitié des fiches.
- **Où dans le code** : `js/modules/crm/reglages.js:155-168` (renommage de la liste seulement) ; `js/modules/crm/logique.js:101` (filtre de départ qui contient le texte) ; `js/modules/crm/filtres.js:16` (la liste de filtres mélange les valeurs des Réglages et celles des fiches).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 7.2 (« renommer, colorer, retirer » ; seul le retrait précise que « les fiches gardent leur valeur »).
- **Preuve** : lecture des lignes citées ; non rejoué.

### C-11 · Une affaire gagnée reste dans « Sans action prévue » tant qu'elle n'a pas d'activité ni d'archivage
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E11)
- **Ce qui se passe** : depuis la 2.2 la vente s'arrête à « Gagné », et (décision de Jérôme) une affaire gagnée n'est pas archivée automatiquement. Or la règle « Sans action prévue » compte les affaires gagnées non archivées sans activité. Chaque affaire gagnée apparaît donc dans le bloc de l'accueil jusqu'à ce qu'on lui invente une tâche ou qu'on l'archive à la main. Dans le Kanban, l'archivage n'est pas proposé dans le menu de la carte (seulement dans la liste et la fiche).
- **Ce que ça change pour Jérôme** : le bloc « Sans action prévue » se remplit de ventes déjà conclues et perd son sens.
- **Où dans le code** : `js/modules/crm/logique.js:703-705` (`estAffaireActive` compte « gagnee ») et `:1011-1013` ; `js/modules/crm/affaires.js:91-97` (menu de la carte sans « Archiver »).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 4 point 7 (« ouverte ou gagnée non archivée », écrit quand « Gagné » n'était pas la fin) ; décision à ne pas rouvrir : « Gagnée » n'est pas archivée automatiquement. Je ne remets pas la décision en cause : je signale seulement l'effet, à lui présenter.
- **Preuve** : essai E11 : une affaire `{statut:'gagnee', etape:'gagne'}` sans activité donne 1 élément dans `sansAction`.

### C-12 · Une date de réveil ou d'activité impossible (31 février) ou déjà passée est acceptée par la règle et par le MCP
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (règles, essai E4 et vérification de `Date.parse`)
- **Ce qui se passe** : les règles ne vérifient que la forme `AAAA-MM-JJ`. `2026-02-31` est enregistré tel quel ; comme les comparaisons se font sur le texte, une affaire en pause jusqu'au « 31/02/2026 » se réveille dès le 1er mars (au lieu du jour réel visé). Le contrôle de date du serveur MCP (`Date.parse(...)`) accepte aussi `2026-02-31`. Une date de réveil dans le passé est acceptée (l'affaire est « à réveiller » immédiatement). Sur l'écran, le sélecteur de date empêche l'impossible : le risque vient surtout des agents.
- **Ce que ça change pour Jérôme** : peu de chose en usage normal ; un agent peut poser une date qui s'affiche « 31/02/2026 ».
- **Où dans le code** : `js/modules/crm/logique.js:681-682` (`mettreEnPause`), `:932-935` (`validerActivite`), `:1015-1017` ; `functions/src/coeur/metier.js:54` (`jourValide`).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 3.4 (`dateReveil` « date », « préremplie à +3 mois »).
- **Preuve** : essai E4 : `mettreEnPause` avec `2026-02-31` et avec `2020-01-01` : aucune erreur ; `estAReveiller` avec `2026-02-31` le 2026-10-08 : vrai. `Date.parse("2026-02-31T12:00:00Z")` renvoie un nombre (pas `NaN`).

### C-13 · Les boutons « Demain », « +3 jours »… et l'accueil restent sur la date d'ouverture si la page reste ouverte après minuit
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE (lu dans le code ; essai E13 sur la fonction seulement) ; essai du 2026-10-08 : non testable ici (voir `09-confirmations.md`)
- **Ce qui se passe** : le sélecteur de date calcule « aujourd'hui » une seule fois à l'ouverture de la fiche. Si l'onglet reste ouvert pendant la nuit, « Demain » donne la date du jour. L'accueil regroupe En retard / Aujourd'hui au moment du dernier rafraîchissement des données, sans minuteur.
- **Ce que ça change pour Jérôme** : sur un Mac qu'il laisse ouvert, une relance « demain » peut être planifiée sur le jour même.
- **Où dans le code** : `js/modules/crm/activites.js:13` (`const aujourdhui = D.ctx().aujourdhui;` au montage) et `:138` ; `js/modules/crm/accueil.js:159` ; aucun `setInterval` côté CRM (recherche dans `js/`).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 5 point 1 (boutons de date rapide) ; fuseau Europe/Paris voulu partout.
- **Preuve** : essai E13 : `dateRapide('demain', '2026-10-07')` donne `2026-10-08` (la veille), d'où un jour d'écart si la date de référence n'est pas rafraîchie.

### C-14 · Chaque activité faite apparaît deux fois dans l'historique « Tous »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (règle, essai E14)
- **Ce qui se passe** : « Fait » écrit un événement `activite_faite`, et l'historique ajoute aussi l'activité faite elle-même. Les deux lignes disent « Appel fait : … ». Les tests ne le voient pas : le test d'historique fabrique une activité faite sans son événement.
- **Ce que ça change pour Jérôme** : l'historique est plus long que nécessaire et atteint plus vite la limite de 500 lignes.
- **Où dans le code** : `js/modules/crm/logique.js:1079-1094` (`entreesHistorique` ne retire pas les événements `activite_faite`) et `:608-611` ; `tests/e2e/parcours.spec.js:480-503` (C14 sans l'événement).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 5 point 5 (« fil unique ... mêlant activités faites, notes et événements »).
- **Preuve** : essai E14 : une activité faite et son événement donnent 2 entrées (`activite`, `evenement`) dans « Tous ».

### C-15 · Adresses LinkedIn, site web et documents saisies sans contrôle sérieux
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE pour LinkedIn et site web (lu dans le code) ; CONFIRMÉ pour le document (essai E8)
- **Ce qui se passe** : LinkedIn et site web (personne, organisation) acceptent n'importe quel texte et en font un lien tel quel : « www.exemple.fr » devient un lien relatif vers une page de l'appli. Un document accepte « https:// » sans nom de site ; le même lien peut être ajouté deux fois (le journal ne voit alors qu'un seul document). En revanche l'adresse GitHub et l'adresse du dossier Drive sont bien contrôlées.
- **Ce que ça change pour Jérôme** : un lien qui ne mène nulle part.
- **Où dans le code** : `js/modules/crm/composants.js:137` (`href: lienVers(courant)`) ; `js/modules/crm/fiche-personne.js:139-140` ; `js/modules/crm/fiche-organisation.js:56` ; `js/modules/crm/logique.js:707-713` ; `js/modules/crm/logique.js:1776-1790`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 3 (champs `linkedin`, `siteWeb`, `documents`).
- **Preuve** : essai E8 : `ajouterDocument(..., 'https://')` : aucune erreur ; deux documents de même adresse : `changementsDocumentsJournal` renvoie `[]`.

### C-16 · Le nom est coupé au premier espace : « Jean Pierre Martin » devient prénom « Jean », nom « Pierre Martin »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai E6)
- **Ce qui se passe** : prénoms composés avec espace et noms à particule sont mal découpés ; ces champs servent aux colonnes « Prénom » et « Nom de famille » de l'export CSV et à l'écran Détails.
- **Ce que ça change pour Jérôme** : un export CSV avec des prénoms ou noms faux pour certains contacts ; corrigeable à la main dans Détails.
- **Où dans le code** : `js/modules/crm/logique.js:319-326`.
- **Règle ou décision concernée** : `docs/decisions-construction-v2.md` point 7 (« redécoupe au premier espace » : choix assumé).
- **Preuve** : essai E6 : `decouperNom('Jean Pierre Martin')` donne `{prenom:'Jean', nomFamille:'Pierre Martin'}`.

### C-17 · La recherche ne cherche pas dans les notes (ni le besoin, ni la source) alors que l'entretien le demandait
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai E5)
- **Ce qui se passe** : l'entretien du 29/09 voulait une recherche sur « nom, entreprise, ville, notes ». Le cahier 2.0 l'a réduite (personnes : nom, e-mail, organisation ; affaires : titre) et le code suit le cahier. Rien n'explique l'abandon des notes. Une recherche de liste sur un mot du besoin identifié ou de la source ne renvoie rien.
- **Ce que ça change pour Jérôme** : il ne retrouvera pas une fiche à partir d'un mot qu'il a écrit dans une note.
- **Où dans le code** : `js/modules/crm/logique.js:1254-1256`, `:1300` ; `js/modules/crm/index.js:94-105`.
- **Règle ou décision concernée** : `docs/crm-decisions-entretien.md` Bloc 5 point 3 contre `docs/cahier-des-charges-v2.0.md` 9 points 1 et 2.
- **Preuve** : essai E5 : recherche « refonte » (mot du besoin) : 0 affaire ; recherche « Flyer » (source) : 0 personne.

### C-18 · Le cahier des charges 2.0 décrit encore six étapes, l'encaissement et l'archivage « Facture payée »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (comparaison texte et code)
- **Ce qui se passe** : le cahier se présente comme « la référence unique » mais n'a pas de bandeau « remplacé en 2.2 » : étapes 5 et 6, `archive` vrai en `facture_payee`, `projetId` « toujours vide en 2.0 », bouton d'encaissement, tests 5 et 10 de la recette. Le code n'a plus que quatre étapes et `projetId` est utilisé.
- **Ce que ça change pour Jérôme** : toute personne (ou agent) qui relit le cahier pour vérifier l'appli croira à des erreurs qui n'en sont pas.
- **Où dans le code** : `js/modules/crm/logique.js:18-23` et `:32-35` (4 étapes ; étapes retirées) ; `docs/cahier-des-charges-v2.0.md:105-108`, `:161-174`, `:535`.
- **Règle ou décision concernée** : `docs/roadmap.md` (facturation 2.2 : « la vente s'arrête à Gagné »).
- **Preuve** : lecture comparée des deux fichiers.

### C-19 · Une affaire restée dans une étape retirée n'apparaît dans aucune colonne du Kanban
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code) ; si la migration a déjà été faite en ligne, le problème n'existe plus (non vérifié)
- **Ce qui se passe** : le Kanban ne dessine que les quatre colonnes actuelles. Une affaire en « Facture envoyée » ou « Facture payée » (avant migration) est comptée dans le compteur « N affaires » mais n'a pas de carte. La liste, elle, l'affiche. Le seul indice est la section « Migration » des Réglages.
- **Ce que ça change pour Jérôme** : le compteur et les cartes ne concordent pas tant que la migration n'est pas lancée.
- **Où dans le code** : `js/modules/crm/affaires.js:289-297` ; `js/modules/crm/reglages.js:206-212`.
- **Règle ou décision concernée** : `js/modules/crm/logique.js:28-31` (« ces affaires restent gagnées et lisibles »).
- **Preuve** : lecture des lignes citées ; non rejoué.

### C-20 · Pause et affaire perdue : l'accueil et les fiches ne montrent pas les mêmes activités ; un réveil en retard reste dans « Aujourd'hui »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai E11) pour l'accueil ; PLAUSIBLE pour la fiche (lu dans le code)
- **Ce qui se passe** : les Points clés de l'accueil ignorent les activités des affaires perdues, en pause ou archivées ; les Points clés d'une fiche personne ou organisation affichent toutes les activités non faites, sans ce filtre. Une même activité peut donc être « En retard » sur une fiche et absente de l'accueil. Par ailleurs, une affaire dont la date de réveil est passée depuis des semaines reste dans « Aujourd'hui » (jamais « En retard »), sans indiquer depuis quand.
- **Ce que ça change pour Jérôme** : un doute sur ce qui est vraiment à faire ; un réveil ancien passe inaperçu.
- **Où dans le code** : `js/modules/crm/logique.js:1023-1033` (`pointsCles`) et `:1036-1041` (`pointsClesFiche`, sans filtre) ; `js/modules/crm/activites.js:207` ; `js/modules/crm/accueil.js:172-179`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 4 point 4 (réveil dans « Aujourd'hui ») et 5 point 4.
- **Preuve** : essai E11 : activité en retard d'une affaire `en_pause` : 0 élément dans `enRetard`.

### C-21 · Supprimer une affaire fait baisser les objectifs du mois (rendez-vous tenus, propositions envoyées)
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : les objectifs « Rendez vous tenus » et « Propositions envoyées » se calculent à partir des activités faites et des dates d'étapes. Supprimer une affaire (ou une personne avec ses affaires) supprime ces activités et ces dates : les compteurs du mois passé baissent. La confirmation ne le dit pas.
- **Ce que ça change pour Jérôme** : après un nettoyage de fiches d'essai, un objectif déjà atteint peut repasser sous 100 %.
- **Où dans le code** : `js/modules/crm/logique.js:1122-1131` et `:1590-1599`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6 (objectifs calculés).
- **Preuve** : lecture des lignes citées ; non rejoué (chiffres de l'accueil : étape E).

### C-22 · L'export CSV des affaires laisse de côté plusieurs champs utiles
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (lecture de la liste des colonnes)
- **Ce qui se passe** : absents du CSV : la précision de la perte (`raisonPerdueDetail`), l'adresse GitHub, le dossier, le projet lié, la date d'entrée dans l'étape. Le CSV des personnes n'a pas la date d'opposition ; celui des organisations n'a pas les affaires. Le bouton « Exporter » d'une liste filtrée n'exporte que les lignes affichées : c'est dit dans le cahier mais pas sur le bouton.
- **Ce que ça change pour Jérôme** : un export ouvert dans Excel n'est pas une image complète de la fiche.
- **Où dans le code** : `js/modules/crm/logique.js:1863-1887` ; boutons : `js/modules/crm/affaires.js:347-350`, `js/modules/crm/personnes.js:109`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 12 point 5.2.
- **Preuve** : liste des colonnes lue.

### C-23 · La « sauvegarde complète » JSON ne contient pas les objectifs ni leurs saisies manuelles
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (liste des collections exportées ; le test `C19` fige cette liste)
- **Ce qui se passe** : le fichier JSON contient `crm_*` et `projets_*`, pas `os_objectifs` (cibles modifiées) ni `os_objectifs_saisies` (flyers). Le texte du bouton dit « toutes tes données ». Il n'existe aucun import dans l'appli (choix de la V1), donc cette sauvegarde sert à lire, pas à restaurer.
- **Ce que ça change pour Jérôme** : si ces deux collections se perdaient, elles ne seraient pas dans le fichier téléchargé (les copies Google quotidiennes les couvrent, d'après `docs/securite-et-pannes.md` : non revérifié ici).
- **Où dans le code** : `js/modules/crm/donnees.js:20-23` ; `js/modules/crm/reglages.js:98` ; `tests/e2e/parcours.spec.js:693`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 12 point 5.1 (« toutes les collections `crm_*` » : conforme à la lettre).
- **Preuve** : lecture de `COLLECTIONS_CRM` et du test C19.

### C-24 · Une grosse suppression est écrite en plusieurs lots qui ne sont pas liés entre eux
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code, jamais interrompu en essai)
- **Ce qui se passe** : au-delà de 130 écritures, `executer` coupe en lots successifs. Chaque lot est atomique (donnée et trace ensemble) mais pas l'ensemble : si le réseau tombe au milieu de la suppression d'une personne très fournie, une partie du fil est supprimée et le reste non. L'ordre prévu (détachements, suppressions du fil, personne en dernier) permet de relancer.
- **Ce que ça change pour Jérôme** : cas rare (plus de 130 éléments) ; on peut recommencer la suppression.
- **Où dans le code** : `js/modules/crm/donnees.js:177` et `:190-197`.
- **Règle ou décision concernée** : `js/modules/crm/donnees.js:180-181` (« jamais de modification sans trace, jamais de trace sans modification » : tenu lot par lot, pas sur l'ensemble).
- **Preuve** : lecture des lignes citées.

## Remarques de sécurité vues en passant

(Sans enquête, hors du périmètre fonctionnel.)

- Les champs LinkedIn et site web deviennent un lien `href` sans contrôle de la forme (`js/modules/crm/composants.js:137`, `fiche-personne.js:139-140`, `fiche-organisation.js:56`) : une adresse de type `javascript:` y serait cliquable.
- L'export CSV recopie les textes sans neutraliser un texte qui commence par `=`, `+`, `-` ou `@` (`js/modules/crm/logique.js:1803-1806`, essai E10) : Excel pourrait l'exécuter comme formule.

## Vu en passant pour l'étape D (journal)

Pour l'étape D : le code écrit encore une date d'expiration de 90 jours sur chaque copie « avant / après » de l'écran (`js/modules/crm/logique.js:1633`, `:1652`, `:1668`) et les commentaires parlent d'effacement après 90 jours (`donnees.js:450`), alors que la décision du 04/10 est « aucun effacement, la règle de durée de vie est supprimée ». À vérifier dans la console : le champ est inoffensif tant que la règle n'existe plus, mais le texte est trompeur.

## Vérifié et conforme
- Cohérence statut/étape : `statutPourEtape`, `marquerPerdue`, `mettreEnPause`, `rouvrirAffaire` et `changementEtape` effacent chacun ce qui ne va plus ensemble (raison de la perte, date de réveil) ; pas d'état « perdue avec date de réveil » ni « en pause avec raison » produit par l'écran (lecture de `logique.js:550-696`, tests B existants).
- Raison de la perte obligatoire (liste fermée) et date de réveil obligatoire : refusées avec message dans la règle et dans les deux boîtes de dialogue (`logique.js:658-660`, `:681-682` ; `affaires.js:32-71`).
- Étape inconnue : refusée par `changementEtape` (essai E12) ; une étape inconnue à la création retombe sur « Premier contact ».
- Gagné : l'événement `affaire_gagnee` n'est écrit qu'une fois même si on revient en arrière puis qu'on repasse en Gagné ; rien n'est archivé automatiquement (conforme à la décision).
- Archivage : une affaire, personne ou organisation archivée sort des listes, du Kanban, de la recherche globale, des favoris et des Points clés ; l'état « archivée et active » n'est pas produit (`estAffaireActive`).
- Pause : `estAReveiller` exclut les archivées, ignore une pause sans date ; la date de réveil par défaut tombe bien en fin de mois (2026-11-30 donne 2027-02-28, essai E9).
- Fuseau Europe/Paris : `aujourdhuiParis` donne le bon jour à 23 h 30 UTC l'été et à 00 h 30 UTC au passage à l'heure d'hiver (25/10/2026) ; `dateHeureParisVersDate` gère l'heure qui n'existe pas (29/03) ; semaine du lundi au dimanche correcte (essai E9).
- Suppression : confirmation par le nom (sans accents ni casse) ; organisation avec personnes ou affaires refusée (archivées comprises) ; projets liés gardés avec leur lien vidé, éléments de projet jamais supprimés avec la fiche CRM ; l'ordre « détachements puis suppressions, la fiche en dernier » est respecté (tests B17).
- Lien affaire-projet : créer, lier, détacher écrivent les deux côtés dans le même plan ; une affaire non gagnée ne peut pas recevoir de projet ; un projet déjà lié ou archivé est refusé (`projets/logique.js:716-794`).
- Adresse GitHub et dossier Drive : contrôles stricts, une valeur invalide écrite hors écran n'est pas rendue cliquable (`logique.js:806-840`, `lanceurs.js:97`). Documents : seules les adresses `http(s)` sont acceptées.
- Recherche : accents et majuscules ignorés, plusieurs mots (tous requis), « Créer » absent quand une valeur identique existe, 8 résultats par groupe.
- E-mail : validation de forme à la création et à la modification ; normalisation (casse, espaces) pour la détection de doublons.
- Opposition à la prospection : bouton « Écrire un email » désactivé, événement écrit.
- Export : CSV avec BOM UTF-8, séparateur « ; », guillemets doublés, virgule décimale ; JSON avec dates en texte ISO ; rappel après 30 jours.
- Suite `tests/logique.test.js` : 158 tests réussis, 0 échec, relancée dans la session.
