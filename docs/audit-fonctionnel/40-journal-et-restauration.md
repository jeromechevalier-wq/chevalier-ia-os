# Étape D : journal d'audit et restauration (audit fonctionnel, version 2.3.3)

Statut : partiel (code relu en entier sur le périmètre, essais purs et essais sur un émulateur Firestore faits ; rien n'a été essayé dans un vrai navigateur, ni sur les données réelles, ni sur le serveur déployé).

Périmètre : collections `crm_audit` et `crm_audit_avant`, écran Journal (`js/modules/crm/journal.js`), moteur d'écriture du serveur (`functions/src/coeur/ecriture.js`, `restaurer.js`, `canonique.js`, `serialisation.js`, `donnees.js`), audit de l'écran (`js/modules/crm/logique.js` partie audit, `js/modules/crm/donnees.js`), `firestore.rules`, tests d'audit et d'écriture, docs `audit-ecran.md`, `journal-ecran.md`, `plan-mcp.md` section 5, `mcp-etape-4.md`, `securite-et-pannes.md`.

## Comment j'ai travaillé
- Relecture complète des fichiers ci-dessus, et recensement de TOUS les endroits où l'appli et le serveur écrivent dans Firestore (recherche de `setDoc`, `updateDoc`, `writeBatch`, `runTransaction`, `executer(`, `c.ecrire`).
- Essais purs avec `node --test` dans un dossier hors dépôt (fichiers `essai-d1.test.mjs` à `essai-d6.test.mjs`, appelés « essai E1, F1, G1… » plus bas) : ils utilisent le vrai moteur du serveur, avec la base en mémoire.
- Essais sur un émulateur Firestore lancé sur des ports à moi (Firestore 8190, hub 4410, journal 4510) avec un fichier de configuration hors dépôt, puis arrêté. Pour l'écran, j'ai recopié à l'identique `executer`, `lireAvants` et `ecrireDansLot` de `js/modules/crm/donnees.js` avec le vrai kit Firestore de l'appli, derrière les vraies règles `firestore.rules` (connecté comme Jérôme). La restauration est ensuite faite par le vrai moteur du serveur. Aucune donnée réelle, aucun appel au MCP de production.
- Suites existantes relancées sur cet émulateur : `ecriture.test.js`, `ecriture-outils.test.js`, `ecriture-firestore.test.js`, `audit-ecran.test.js` : 83 tests réussis, 0 échec ; `regles.test.js` : 72 tests réussis, 0 échec.
- Aucun fichier du dépôt modifié en dehors de celui-ci (`git status` : seuls les fichiers de l'audit apparaissent).

## Ce qui n'a pas été regardé
- Aucun essai dans un navigateur : l'écran Journal (affichage, clics, pastilles) est jugé sur son code et sur les fonctions pures qu'il appelle. Le parcours Playwright du Journal (`tests/e2e/`) n'a pas été relancé.
- Le serveur déployé et la vraie base : l'effet réel des règles publiées, l'état de la règle d'effacement automatique (Jérôme dit l'avoir supprimée le 04/10/2026, je n'ai pas pu le voir), les écritures simultanées depuis deux vrais appareils.
- Le plafond de 500 opérations d'un lot Firestore avec les « heures du serveur » : l'émulateur a accepté 130 actions de l'écran par lot (390 écritures), mais je ne sais pas si la vraie base compte les heures du serveur comme des écritures en plus. Non vérifié.
- Les patchs de l'écran qui contiendraient une valeur « indéfinie » (`undefined`) : le kit de l'appli les ignore (`ignoreUndefinedProperties`), ce qui pourrait fausser la copie « après » ; je n'ai pas cherché si un plan réel en produit. Non vérifié.
- Les plafonds du serveur (écritures par heure, suppressions par jour) : étape B. Je note seulement que `restaurer_depuis_audit` réserve 1 écriture et 0 suppression même quand il supprime (restauration d'une création), mais je n'ai pas enquêté.
- Les contenus des sauvegardes (Backblaze, copie Google) : étape H.
- Les règles métier des plans eux-mêmes (qui supprime quoi) : étape C, sauf quand cela touche la copie dans le journal.

## Réponses aux six questions (résumé)
1. **Qui laisse une trace ?** Toutes les actions des fiches (personnes, organisations, affaires, activités, notes, événements) et du module Projets (projets, tâches, modèles, factures, étoiles et documents, migration des anciennes affaires, changement d'étape, perte, extraction) passent par `executer` de l'écran, donc laissent une ligne et une copie dans le même lot. Les 40 appels d'écriture du serveur MCP passent tous par le moteur (`c.ecrire`). **Aucune trace** : réglages du CRM (offres, secteurs, sources, étiquettes, filtres enregistrés, délai de paiement, date de début, propriétaire GitHub, chemin des projets), date du dernier export, objectifs (valeurs saisies, +1, +10, objectifs manuels), création automatique des réglages de départ et des modèles de projet de départ (voulu). Il n'y a **pas d'import** dans l'appli (seulement un export). Voir D-01 et D-02.
2. **Restaurer remet-il exactement l'état d'avant ?** Oui pour le document lui-même : champs, `null`, tableaux vides, objets imbriqués, dates à la microseconde, même identifiant, y compris pour 211 documents d'une suppression en cascade faite depuis l'écran (essai F1). Non pour ce qui s'est rattaché à ce document après coup (D-04) ni pour les changements faits ensuite dans d'autres champs quand on force (D-05).
3. **Si le document a changé entre-temps ?** Côté serveur : refus (écriture) ou « conflit » (restauration), `forcer` possible. Côté écran : aucun contrôle (D-08). Document supprimé puis recréé par quelqu'un : refus, déjà testé (`ecriture.test.js`, « un document supprimé puis recréé par quelqu'un d'autre : conflit »). Document restauré puis re-supprimé : la fiche revient (essai E3), sans avertissement qu'elle avait déjà été restaurée.
4. **Copies complètes ?** Oui, une copie « avant/après » par document touché, cascade comprise (essai F1 : 211 lignes, 211 copies). Lots multiples : voir D-03 (écran) ; le serveur marque bien les lots non écrits en « echec » (tests existants).
5. **Textes périmés (90 jours, expiré) ?** Oui, dans l'écran Journal et dans le serveur : D-15, D-16, D-17.
6. **Lecture bornée et filtrable ?** L'écran lit 200 lignes à la fois, les plus récentes d'abord, avec un bouton pour la suite ; mais tous ses filtres sont faits dans le navigateur sur ce qui est déjà chargé (D-07). `lire_audit` rend au plus 200 lignes, sans suite (D-13).

## Constats

### D-01 · Les réglages du CRM ne laissent aucune trace dans le journal, et l'écran Journal dit le contraire
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (recensement complet des écritures dans le code ; pas rejoué dans un navigateur)
- **Ce qui se passe** : offres, secteurs, sources, étiquettes, filtres enregistrés, délai de paiement, date de début d'activité, propriétaire GitHub, chemin des projets et date du dernier export sont écrits directement (`setDoc`) dans `crm_parametres`, sans ligne de journal ni copie « avant ». Supprimer une étiquette ou un filtre, renommer une offre, changer le délai de paiement ne se retrouve nulle part et ne se défait pas. Autre cas : choisir un secteur ou une source nouveau dans une fiche écrit d'abord la liste des réglages (sans trace) puis la fiche (avec trace), en deux écritures séparées : si la seconde échoue, la liste a déjà changé.
- **Ce que ça change pour Jérôme** : la phrase de l'écran Journal « Chaque création, modification ou suppression faite dans l'appli … laisse une ligne ici » est fausse pour tous les réglages ; un réglage supprimé par erreur ne peut se retrouver que dans une sauvegarde.
- **Où dans le code** : `js/modules/crm/donnees.js:376-378` (`majParametre` = `setDoc` direct), `:380-421` (`enregistrerOffres`, `enregistrerListes`, `enregistrerEtiquettes`, `enregistrerFiltres`, `enregistrerReglages`, `noterExportComplet`), `:389-395` (`ajouterValeurListe`, appelé avant la mise à jour de la fiche : `js/modules/crm/fiche-personne.js:142`, `fiche-organisation.js:62`, `fiche-affaire.js:136`), `js/modules/crm/journal.js:170` (le texte).
- **Règle ou décision concernée** : `docs/audit-ecran.md` (« Ce qui n'est pas couvert : les réglages (offres, étiquettes, secteurs, sources, filtres, objectifs saisis à la main) ») ; demande de Jérôme du 04/10/2026 (« l'audit doit tracer aussi ce que tu fais toi-même dans l'appli »).
- **Preuve** : recensement : les seules écritures de l'appli hors `executer` sont `majParametre` (`donnees.js:377`), `initialiserParametres` (`:143-153`, réglages de départ, voulu), `initialiserModeles` (`js/modules/projets/donnees.js:78-98`, voulu et dit dans son commentaire) et `js/os/objectifs.js` (voir D-02). Le journal ne peut pas les montrer : aucune ligne n'est écrite.

### D-02 · Les objectifs saisis à la main s'écrasent sans laisser de trace
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : sur l'accueil, saisir une valeur d'objectif pour un mois, cliquer « +1 » ou « +10 », modifier ou ajouter un objectif manuel écrit directement dans `os_objectifs_saisies` et `os_objectifs`. `definirSaisie` remplace la valeur du mois par la nouvelle sans garder l'ancienne ; « +1 » et « +10 » ajoutent sans dire qui ni quand.
- **Ce que ça change pour Jérôme** : une valeur d'objectif saisie par erreur (ou écrasée) ne se retrouve pas dans le Journal ; les pourcentages de l'accueil changent sans qu'on sache pourquoi.
- **Où dans le code** : `js/os/objectifs.js:128-132` (`ajouterASaisie`, `increment`), `:134-138` (`definirSaisie`, `setDoc` avec fusion), `:140-142` (`majObjectif`), `:144-149` (`ajouterObjectifManuel`) ; boutons : `:199`, `:205-206`, `:273-293`.
- **Règle ou décision concernée** : `docs/audit-ecran.md` (« objectifs saisis à la main » listés comme non couverts).
- **Preuve** : aucun de ces appels ne passe par `executer` (`js/modules/crm/donnees.js:183`) ; `grep` de `setDoc|updateDoc|writeBatch` dans `js/` : seuls `donnees.js` (CRM), `projets/donnees.js` et `os/objectifs.js` écrivent.

### D-03 · Une grosse suppression en cascade faite depuis l'écran peut s'arrêter à moitié, sans que le Journal le dise
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai F3 sur l'émulateur, avec la copie fidèle de `executer` et les vraies règles)
- **Ce qui se passe** : l'écran découpe une action en lots de 130 documents ; chaque lot est tout-ou-rien avec ses lignes d'audit, mais l'ensemble ne l'est pas. Si un lot du milieu échoue (réseau, refus), les lots précédents restent écrits : une partie du fil est supprimée, la fiche principale (écrite en dernier) reste. Le Journal montre alors une opération « réussie » de 130 lignes, sans « Échec » ni « À vérifier », sans rien dire du reste qui n'a pas été fait.
- **Ce que ça change pour Jérôme** : après une erreur, une organisation, une personne ou une affaire existe encore mais a perdu une partie de ses notes et de ses activités ; rien dans le Journal ne dit que l'opération est incomplète (la restauration, elle, remet bien les 130 documents déjà supprimés).
- **Où dans le code** : `js/modules/crm/donnees.js:177` (`ACTIONS_PAR_LOT = 130`) et `:183-197` (un `writeBatch` par tranche, aucune ligne « échec » pour les tranches non écrites).
- **Règle ou décision concernée** : `docs/audit-ecran.md` (« chaque lot est atomique, l'ensemble ne l'est pas » ; « Non vérifié : les très grosses suppressions (plus de 130 documents d'un coup) »).
- **Preuve** : essai F3 : organisation avec 150 notes et 60 activités, un 2e lot volontairement refusé : il reste 80 notes, 0 activité, l'organisation est toujours là, et `crm_audit` contient 130 lignes toutes en « succes » pour l'opération. Le même essai F1 (sans panne) montre que 211 suppressions en deux lots passent bien les règles et se restaurent à l'identique.

### D-04 · Défaire une création laisse en place tout ce qui s'y est rattaché depuis
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essais E1 et E1b, vrai moteur du serveur, base en mémoire)
- **Ce qui se passe** : si on restaure l'opération qui a créé une affaire (ou une personne), le document créé est supprimé. Mais les notes, activités et événements ajoutés ensuite sur cette affaire, ou les affaires créées ensuite pour cette personne, ne sont pas touchés (ils ne changent pas le document, donc aucun « conflit » n'est détecté) : ils restent avec un lien vers une fiche qui n'existe plus. L'aperçu annonce « conflits : 0 » et seulement les deux documents de la création.
- **Ce que ça change pour Jérôme** : des notes et des affaires « orphelines » apparaissent (invisibles ou affichées avec un lien cassé) après une restauration qui semblait propre.
- **Où dans le code** : `functions/src/coeur/restaurer.js:13-17` (`decider` ne regarde que le document de la ligne) et `:52-56` ; aucune recherche de documents rattachés.
- **Règle ou décision concernée** : `docs/plan-mcp.md` 5.2 (« suppression annulée = recréation avec le même identifiant (les liens … restent valides) » ; rien n'est dit de l'annulation d'une création).
- **Preuve** : essai E1 : aperçu `[["even_7","supprimer"],["affa_6","supprimer"]]`, conflits 0 ; après restauration, `crm_notes` contient encore `note_11` avec `affaireId: 'affa_6'`. Essai E1b : après restauration de la création de la personne, l'affaire garde `personneId: 'pers_1'` alors que la personne a disparu.

### D-05 · « forcer » remet le document entier à l'état d'avant, et efface les changements faits depuis dans d'autres champs
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai E2)
- **Ce qui se passe** : sans `forcer`, la restauration refuse dès que le document a changé de n'importe quelle façon (bien). Avec `forcer: true`, elle remplace TOUT le document par la copie « avant » : si l'opération à défaire n'avait changé que la ville, mais qu'on a renommé la personne depuis, le renommage est perdu aussi. L'aperçu dit seulement « Le document a changé depuis cette opération », sans montrer ce qui a changé.
- **Ce que ça change pour Jérôme** : pour défaire une vieille modification d'un champ sur une fiche retouchée depuis, il n'a que deux choix : refus, ou perdre toutes les retouches ; et il ne voit pas lesquelles.
- **Où dans le code** : `functions/src/coeur/restaurer.js:49-55` (opération `remplacer` avec toute la copie « avant ») ; `functions/src/coeur/ecriture.js:99-100` (`set` complet).
- **Règle ou décision concernée** : `docs/plan-mcp.md` 5.2 (« Refus si le document a changé depuis (`modifieLe` différent de l'audit), sauf `forcer: true` ») ; `docs/securite-et-pannes.md` ligne 138 (« si l'écrasement est voulu, `forcer: true` »).
- **Preuve** : essai E2 : ville « Lille » changée en « Brest » (opération A), puis nom changé en « Camille Durand » ; l'aperçu de A donne `conflit` ; après `forcer: true` : `nom = Camille`, `ville = Lille` (le renommage a disparu).

### D-06 · L'écran Journal coupe les textes à 300 caractères : une note supprimée ne peut pas être relue en entier
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai G1 sur la fonction pure utilisée par l'écran)
- **Ce qui se passe** : le tableau « Champ / Avant / Après » écrit chaque valeur avec `formaterValeurJournal(v, max = 300)`, qui coupe à 300 caractères et ajoute « … ». Il n'y a pas de bouton pour tout voir. Une note de 1 000 caractères supprimée s'affiche sur 300 caractères (301 avec le « … »). Une note peut avoir jusqu'à 20 000 caractères côté serveur (`z.string().max(20000)`).
- **Ce que ça change pour Jérôme** : le jour où il veut retrouver à l'écran le texte d'une note ou d'un besoin supprimé (et que le MCP est en panne, ce pour quoi l'écran a été fait), il n'en voit que le début ; la doc promet « Pour un document supprimé, on voit tout ce qu'il contenait ».
- **Où dans le code** : `js/modules/crm/logique.js:1793-1800` (`formaterValeurJournal`, `max = 300`) ; `js/modules/crm/journal.js:23-36` (tableau).
- **Règle ou décision concernée** : `docs/journal-ecran.md` (« Pour un document supprimé, on voit tout ce qu'il contenait »).
- **Preuve** : essai G1 : `formaterValeurJournal('a'.repeat(1000)).length === 301` et se termine par « … ».

### D-07 · Les filtres du Journal ne portent que sur les 200 lignes déjà chargées, et une opération longue peut être coupée entre deux pages
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ pour le regroupement coupé (essai G4, fonction pure) ; PLAUSIBLE pour l'effet à l'écran (lu dans le code)
- **Ce qui se passe** : l'écran lit les 200 lignes les plus récentes (`orderBy('date','desc')`, `limit(200)`, suite par `startAfter`), ce qui borne bien la lecture. Mais la recherche, le canal, la date « Depuis le » et « À vérifier seulement » sont appliqués ensuite dans le navigateur, sur ce qui est chargé : une opération ancienne (ou une ligne restée « À vérifier » depuis longtemps) n'apparaît pas tant qu'on n'a pas cliqué plusieurs fois sur « Charger les lignes plus anciennes ». Le message est alors « Aucune opération ne correspond à ces filtres ». Par ailleurs les lignes d'une même opération sont regroupées après lecture : une suppression de 300 documents est coupée à la limite de 200 et affichée d'abord comme « Suppression de 2 notes » puis, après chargement de la suite, « Suppression de 3 notes » (exemple réduit).
- **Ce que ça change pour Jérôme** : chercher une vieille opération par son identifiant ou une date lointaine peut conclure à tort qu'elle n'existe pas ; le résumé et l'état d'une grosse opération sont faux tant que toutes ses lignes ne sont pas chargées.
- **Où dans le code** : `js/modules/crm/donnees.js:440-448` (`lireJournal`, pas de filtre dans la requête) ; `js/modules/crm/journal.js:9`, `:108-127`, `:129-148` ; `js/modules/crm/logique.js:1721-1737` (`grouperJournal`) et `:1740-1752` (`filtrerJournal`).
- **Règle ou décision concernée** : `docs/journal-ecran.md` (« Filtres : … Le bouton Actualiser relit le journal ; Charger les lignes plus anciennes va plus loin que les 200 dernières lignes »).
- **Preuve** : essai G4 : deux lignes de l'opération `opA` donnent « Suppression de 2 notes » ; avec la troisième ligne : « Suppression de 3 notes ». Lecture de `filtrerJournal` : il reçoit uniquement les opérations déjà regroupées.

### D-08 · L'écran ne détecte pas qu'un autre appareil ou Claude Code a modifié le même document : la copie « après » peut être fausse
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai F4 sur l'émulateur, avec l'écriture de l'autre appareil glissée entre la lecture et l'écriture)
- **Ce qui se passe** : l'écran lit le document « avant » juste avant d'écrire (hors transaction) et calcule la copie « après » à partir de cette lecture. Si quelqu'un modifie un autre champ de la même fiche dans l'intervalle, l'écriture passe (aucun refus, contrairement au serveur) mais la copie « après » ne contient pas ce changement. La restauration de cette opération annonce ensuite un « conflit » alors que personne n'a touché la fiche depuis, et avec `forcer` elle remet l'ancienne valeur du champ de l'autre appareil.
- **Ce que ça change pour Jérôme** : cas rare (fenêtre de quelques millisecondes entre deux appareils), mais la restauration d'une telle opération est bloquée, puis écrase la modification de l'autre appareil si on force.
- **Où dans le code** : `js/modules/crm/donnees.js:170-175` (`lireAvants` avec `getDoc`) et `:183-197` ; `js/modules/crm/logique.js:1637-1645` (`documentApres` fusionne `avant` et le patch).
- **Règle ou décision concernée** : `docs/audit-ecran.md` « Limites connues » (« la copie « avant » peut être légèrement en retard. Le serveur MCP, lui, refuse dans ce cas (transaction) ; l'écran ne le fait pas »).
- **Preuve** : essai F4 : téléphone `0102` lu, l'autre appareil écrit `9999`, l'écran écrit la ville ; document réel `tel = 9999`, `copie.apres.tel = 0102` ; aperçu : `conflits 1` ; après `forcer`, `tel = 0102`. Déjà documenté comme limite connue, d'où MINEUR.

### D-09 · Une opération de plus de 1 000 documents faite depuis l'écran ne peut plus être restaurée par l'outil
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai H1, 1 100 lignes d'audit fabriquées, vrai moteur)
- **Ce qui se passe** : l'écran n'a aucune limite de taille pour une action (découpée en lots de 130) ; le moteur du serveur refuse tout plan de plus de 1 000 écritures. Pour une suppression en cascade de plus de 1 000 documents, `restaurer_depuis_audit` en aperçu annonce « à défaire : 1 100 », puis la vraie restauration est refusée (`plan_invalide`, « Trop d'écritures en une opération (1100, maximum 1000) »).
- **Ce que ça change pour Jérôme** : cas extrême (le nombre de documents de ses fiches est non vérifié) ; il faudrait alors passer par une sauvegarde.
- **Où dans le code** : `functions/src/coeur/ecriture.js:20` et `:67` ; `functions/src/coeur/restaurer.js:52-56`.
- **Règle ou décision concernée** : `docs/securite-et-pannes.md` ligne 135 (« Écriture interrompue … `restaurer_depuis_audit` … remet les documents déjà écrits dans l'état d'avant »).
- **Preuve** : essai H1 (message cité ci-dessus).

### D-10 · « Défaire » n'existe pas dans l'appli : il faut passer par Claude Code, donc par le MCP
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (aucun bouton ni appel de restauration dans `js/` ; texte de l'écran relu)
- **Ce qui se passe** : l'écran Journal est en lecture seule et renvoie vers `restaurer_depuis_audit` de Claude Code. Il ne propose ni « Défaire » ni copie du contenu supprimé.
- **Ce que ça change pour Jérôme** : le jour où le MCP est en panne (la raison d'être de l'écran), il peut lire l'historique mais pas défaire ; combiné avec D-06, il ne peut même pas relire en entier un long texte supprimé.
- **Où dans le code** : `js/modules/crm/journal.js:2-3` et `:170` ; `docs/journal-ecran.md` (« Ce que l'écran ne fait pas »).
- **Règle ou décision concernée** : `docs/journal-ecran.md` (« L'écran Journal lit directement la base, sans passer par le serveur MCP … Il ne restaure pas »). C'est un choix décrit dans la doc, noté ici parce que la question portait sur « Défaire ».
- **Preuve** : `grep -ni "restaur\|défaire" js/` ne trouve que le texte d'aide et les libellés d'action.

### D-11 · Le tableau du Journal confond « champ absent », « vide » et « null », et montre des dates brutes dans les listes
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essais G2 et G3, fonctions pures de l'écran)
- **Ce qui se passe** : (1) un champ absent qui devient `null` n'est pas listé comme différence ; (2) un texte vide `''` qui devient `null` est listé avec « — » des deux côtés, donc une ligne « — → — » ; (3) une liste contenant des dates (ex. les factures d'un projet) s'affiche avec des nombres bruts : `{"factures":[{"dateEnvoi":{"t":1759660000000},"montant":100}]}` ; une date seule s'affiche bien (`05/10/2025 12:26`).
- **Ce que ça change pour Jérôme** : lecture du Journal parfois déroutante pour les projets et factures.
- **Où dans le code** : `js/modules/crm/logique.js:1755-1761` (`formeComparable`, dates en `{ t: … }`), `:1764-1770` (`differencesJournal`), `:1793-1800` (`formaterValeurJournal`, `'' → '—'`).
- **Règle ou décision concernée** : `docs/journal-ecran.md` (« tableau champ / avant / après »).
- **Preuve** : essais G2 et G3 (sorties citées ci-dessus).

### D-12 · Le Journal ne propose pas « Ouvrir la fiche » pour les projets
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : le lien vers la fiche n'existe que pour les personnes, organisations et affaires ; les projets, tâches et modèles (pourtant dans le Journal) n'en ont pas, alors que l'adresse d'un projet existe (`#/projets/projets/<id>`).
- **Ce que ça change pour Jérôme** : un clic de moins de confort pour les opérations sur les projets.
- **Où dans le code** : `js/modules/crm/journal.js:10` (`CHEMINS` à trois entrées) et `:40-41` ; `js/modules/projets/composants.js:5` (`cheminProjet`).
- **Règle ou décision concernée** : `docs/journal-ecran.md` (« Quand le document existe encore, un lien « Ouvrir la fiche » est proposé »).
- **Preuve** : lecture de `CHEMINS`.

### D-13 · `lire_audit` rend au plus 200 lignes, sans page suivante ni date de fin, et lit tout le journal à chaque appel
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ pour le plafond de 200 (essai I1) ; PLAUSIBLE pour la lecture complète (lu dans le code, taille réelle non vérifiée)
- **Ce qui se passe** : `lire_audit` charge toutes les lignes correspondant à un seul filtre (ou toute la collection s'il n'y en a pas), filtre le reste en mémoire, trie, puis rend les 200 plus récentes. Pour regarder « du 1er au 3 octobre » alors qu'il y a plus de 200 lignes depuis le 1er, les plus anciennes sont inatteignables (seul `depuis` existe, pas de « jusqu'au », pas de suite) sauf par `docId`, `operationId` ou `acteur`. Comme le journal ne s'efface jamais, la collection ne fait que grossir.
- **Ce que ça change pour Jérôme** : Claude Code ne peut pas parcourir tout le journal d'une période chargée ; le temps de réponse augmentera avec les mois (non vérifié).
- **Où dans le code** : `functions/src/coeur/lecture.js:232-250` (`lireAudit`), `:8-9` (`MAX_LIGNES = 200`, `borne`) ; `functions/src/mcp/outils/lecture.js:130-143`.
- **Règle ou décision concernée** : `docs/plan-mcp.md` 5.3 (outil `lire_audit`) ; décision du 04/10/2026 (journaux conservés sans limite).
- **Preuve** : essai I1 : 250 lignes depuis le 1er octobre : `total 250`, 200 rendues, `tronque true`, la plus ancienne rendue est celle de la seconde 50.

### D-14 · Les valeurs reçues par les outils sont gardées, mais nulle part où on puisse les relire
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lu dans le code)
- **Ce qui se passe** : le moteur écrit les paramètres reçus (tronqués à 2 000 caractères) dans la copie de la PREMIÈRE ligne seulement (`ordre === 1`). Le journal `crm_audit` ne garde que les noms des paramètres (`parametresRecus`), et l'écran de l'appli (`lireCopieJournal`) ne lit que `avant` et `apres`. `lire_audit` ne lit pas non plus les copies. Pour les actions de l'écran, `parametresRecus` est toujours vide.
- **Ce que ça change pour Jérôme** : sa décision du 04/10/2026 (« on garde tout, y compris les valeurs reçues ») est respectée pour l'écriture, mais ces valeurs ne se lisent que dans la console Firestore ; la tâche « garder aussi les valeurs reçues dans `crm_audit` » est encore à faire (`docs/reprise-prochaine-session.md`, §1, point 1).
- **Où dans le code** : `functions/src/coeur/ecriture.js:157-158` et `:39-43` (`tronquer`) ; `:137` (`parametresRecus` = noms) ; `js/modules/crm/donnees.js:451-456` ; `js/modules/crm/logique.js:1665`.
- **Règle ou décision concernée** : `CLAUDE.md` du dépôt (« Les journaux d'audit ne s'effacent jamais : on garde tout, y compris les valeurs reçues ») ; `docs/reprise-prochaine-session.md` §1.
- **Preuve** : `grep "parametres"` dans `functions/src/coeur/lecture.js`, `js/modules/crm/journal.js` et `donnees.js` : aucune lecture de ce champ.

### D-15 · Les textes de l'écran Journal parlent encore de « 90 jours » et d'« expiré »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (textes littéraux relus)
- **Ce qui se passe** : deux textes affichés à Jérôme annoncent un effacement qui n'existe plus : l'aide en haut de l'écran (« copie du document avant et après (gardée 90 jours) ») et le message quand une copie manque (« elle a expiré (gardée 90 jours) ou n'a pas pu être écrite »). Les commentaires du code (`donnees.js:450`, `logique.js:1629`) disent la même chose.
- **Ce que ça change pour Jérôme** : il croit que ses copies disparaissent après 90 jours, alors que sa décision est de tout garder.
- **Où dans le code** : `js/modules/crm/journal.js:50` et `:170` ; `js/modules/crm/donnees.js:450` ; `js/modules/crm/logique.js:1629`, `:1633` (`JOURS_COPIES_AUDIT = 90`).
- **Règle ou décision concernée** : `CLAUDE.md` du dépôt (RGPD du 04/10/2026, « plus de règle de durée de vie (TTL) de 90 jours ») ; `docs/reprise-prochaine-session.md` §1 (liste ces textes comme restant à aligner).
- **Preuve** : lignes citées. Le champ `expireAt` (date + 90 jours) est toujours écrit et exigé par les règles (`firestore.rules:27`) ; il est inoffensif tant que la règle d'effacement reste supprimée (non vérifié ici), et la doc de reprise propose de ne pas y toucher.

### D-16 · Les messages et descriptions d'outils du serveur MCP parlent encore de « 90 jours » et de copies « expirées »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (textes littéraux et tests relus)
- **Ce qui se passe** : les réponses d'outils de suppression disent `restaurable: 'restaurer_depuis_audit (90 jours)'`, les descriptions de `supprimer_note`, `supprimer_activite` etc. disent « Récupérable 90 jours », et la restauration d'une copie absente répond avec le code `copie_expiree` et « gardées 90 jours ». Claude Code, qui lit ces textes, peut conclure à tort qu'une restauration est impossible au bout de 90 jours. Plusieurs tests figent ces mots, donc corriger les textes oblige à corriger les tests.
- **Ce que ça change pour Jérôme** : Claude Code risque de lui dire « trop tard, plus de 90 jours » alors que les copies restent.
- **Où dans le code** : `functions/src/coeur/metier.js:454` ; `functions/src/mcp/outils/suppression.js:2`, `:12`, `:15`, `:18`, `:21`, `:24-26` ; `functions/src/coeur/restaurer.js:7`, `:34` ; `functions/src/coeur/ecriture.js:23`, `:26`, `:119`. Tests qui figent les mots : `tests/ecriture-outils.test.js:444`, `tests/ecriture.test.js:281`, `tests/audit-ecran.test.js:66`, `tests/ecriture-firestore.test.js:60`, `tests/regles.test.js:108`, `:132`, `tests/statique.test.js:223`.
- **Règle ou décision concernée** : `CLAUDE.md` du dépôt ; `docs/reprise-prochaine-session.md` §1.
- **Preuve** : lignes citées.

### D-17 · Plusieurs documents décrivent encore l'effacement à 90 jours, et deux décrivent une règle de restauration ou un champ qui ne sont pas ceux du code
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (textes relus, comparés au code)
- **Ce qui se passe** : (1) 90 jours / TTL / RGPD toujours écrits dans `docs/audit-ecran.md` (§ En clair, règles recopiées, Limites connues), `docs/journal-ecran.md`, `docs/plan-mcp.md` (lignes 34, 42, 119, 129, 223, 337, 365), `docs/mcp-etape-4.md` (§ En clair point 4, § 2 « Effacement automatique », ligne 158), `docs/securite-et-pannes.md` (lignes 40, 137, 188), `docs/roadmap.md:23` (qui contredit la ligne 14 du même fichier), `docs/playbook-mcp-firebase.md` (lignes 74, 81), `docs/cahier-des-charges-v2.0.md:395` et le commentaire de `firestore.rules:24`. En particulier `securite-et-pannes.md:188` demande de vérifier que « la stratégie TTL de `crm_audit_avant` est-elle toujours active » : Jérôme l'a supprimée volontairement, la vérification donnerait une fausse alerte. (2) `docs/plan-mcp.md:129` dit que la restauration refuse si « `modifieLe` [est] différent de l'audit » ; le code compare le document entier (`restaurer.js:13-17`, `canonique.js:35-37`), ce qui est plus strict. (3) `docs/plan-mcp.md:117` (schéma) liste un champ `parametres` dans `crm_audit` ; le code écrit `parametresRecus` (noms seulement) et met les valeurs dans la copie (voir D-14).
- **Ce que ça change pour Jérôme** : documentation trompeuse sur la durée de conservation et sur la façon dont le refus de restauration se décide.
- **Où dans le code** : voir la liste ci-dessus ; côté code : `functions/src/coeur/restaurer.js:13-17`, `functions/src/coeur/ecriture.js:137`.
- **Règle ou décision concernée** : `CLAUDE.md` du dépôt (RGPD) ; `docs/reprise-prochaine-session.md` §1 point 3 (« Mettre à jour plan-mcp.md … audit-ecran.md et journal-ecran.md, qui parlent encore du RGPD et des 90 jours »).
- **Preuve** : `grep -n "90 jours\|TTL"` sur `docs/` et comparaison avec les fichiers de code cités.

## Remarques de sécurité vues en passant (sans enquête)
- `firestore.rules:21-28` : depuis l'appli, un compte autorisé peut ajouter une ligne `crm_audit` au canal « ecran » à son nom, avec n'importe quel `collection`/`docId`/`statut`, et une copie `crm_audit_avant` avec n'importe quel contenu (seule la présence d'`expireAt` est contrôlée, et pas le lien entre la ligne et la copie). Le journal n'est donc pas infalsifiable pour les lignes de l'écran. Les deux comptes sont de confiance ; à noter pour plus tard.
- La restauration réserve une écriture et zéro suppression dans les plafonds même quand elle supprime des documents (`functions/src/mcp/gestionnaire.js:89-90`) ; à voir à l'étape B.

## Vérifié et conforme
- Toutes les actions d'écriture des fiches (personnes, organisations, affaires, activités, notes, événements) et du module Projets (projets, tâches, modèles, factures, étoiles et documents, liens affaire-projet, migration des anciennes affaires, changement d'étape, perte, extraction) passent par `executer` (`js/modules/crm/donnees.js:183`, `js/modules/projets/donnees.js:116-118`) : une ligne et une copie par document touché, dans le même lot que la donnée. Les étoiles de documents passent par `majAffaire`/`majProjet` et le Journal les résume en phrases (« Favori ajouté : … »).
- Les 40 appels d'écriture des outils MCP passent tous par `executerEcritures` (`functions/src/mcp/gestionnaire.js:74-86`) ; le serveur ne peut écrire que dans les neuf collections de données (`COLLECTIONS_ECRITES`), jamais dans les réglages ni l'audit.
- Les règles `firestore.rules` autorisent bien tout ce que l'écran écrit : essai F1 (211 suppressions en deux lots, 633 écritures dont les lignes `crm_audit` au canal « ecran » à l'adresse de Jérôme et les copies avec `expireAt`) et F2 passés avec le vrai fichier de règles ; `regles.test.js` : 72 tests réussis. Elles refusent bien la modification et la suppression du journal et des copies.
- Ordre d'écriture du serveur : lot 1 (lignes « en_cours » et copies) avant le lot 2 (données) avant le lot 3 (« succes »/« echec »), comme dans `plan-mcp.md` 5.2 ; journal en panne = rien d'écrit ; lot 2 refusé = lignes « echec » ; lot 3 en panne = avertissement et ligne « en_cours » (tests existants `ecriture.test.js`, 83 tests réussis avec les autres fichiers).
- Restauration à l'identique : champs, `null`, tableaux vides, objets imbriqués, dates à la microseconde (Timestamps), même identifiant ; 211 documents d'une cascade faite depuis l'écran remis exactement, comparaison stricte avec l'état d'avant (essai F1). La copie « après » d'une modification de l'écran, avec les heures du serveur, est identique au document réel (essai F2 : même seconde et mêmes nanosecondes que la ligne d'audit).
- Une restauration refuse tout si un seul document a changé, et dit lequel (aperçu par défaut, `forcer` explicite) ; une restauration peut elle-même être restaurée ; une opération déjà défaite répond « Déjà dans l'état d'avant » (tests `ecriture.test.js`, essai E3).
- Document supprimé puis recréé par quelqu'un d'autre : conflit, pas d'écrasement (test existant).
- Écriture du serveur concurrente : le serveur vérifie dans une transaction que chaque document est resté dans l'état lu, sinon refus sans rien écrire (`functions/src/coeur/donnees.js`, `attendus`) ; testé sur l'émulateur (`ecriture-firestore.test.js`).
- Écran Journal : lecture seule (aucune écriture), page de 200 lignes avec suite, regroupement par opération, état « À vérifier » pour les lignes restées « en_cours », échec affiché avec son message ; erreurs de lecture gérées (message + bouton Actualiser).
