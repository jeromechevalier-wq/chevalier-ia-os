# Étape B : le serveur MCP (audit fonctionnel, version 2.3.3)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Statut : complet pour le périmètre ci-dessous (lecture du code, essais sur des données fictives en mémoire, tests existants rejoués, tests de l'émulateur Firestore rejoués). Écrit le 2026-10-08.

## Ce qui n'a PAS été regardé
- Le serveur **déployé** (aucun appel au MCP de production, aucune donnée réelle) : tout ce qui suit vient du code et d'essais locaux.
- Hermes (non branché : `docs/reprise-prochaine-session.md`, ligne 8) et Claude Code branché sur le Mac : la connexion réelle n'a pas été rejouée.
- Le comportement **à grande échelle** (temps de réponse, mémoire de 256 Mo, coût Firestore quand il y aura des milliers de fiches ou de lignes de journal) : non vérifié. Les remarques de volume ci-dessous sont des lectures de code.
- Les paquets de plus de 400 écritures d'un seul coup sur Firestore réel (écriture « interrompue » à moitié) : lu dans `functions/src/coeur/ecriture.js:171-200`, jamais provoqué.
- La sécurité des jetons (`functions/src/securite/jetons.js`, `secret.js`, `journaux.js`) : hors périmètre de cet audit fonctionnel.
- L'écran lui-même (étapes A, C, D, E) : je ne l'ai lu que pour comparer ses règles à celles des outils.
- Les scripts `outils/*` (création de jeton, essai réel d'écriture), le workflow de déploiement, `docs/cahier-mcp.md`, `docs/PROMPT-PLAN-MCP.md`, `docs/playbook-mcp-firebase.md` (lus seulement par recherche de mots-clés).
- Les tests `tests/e2e` (navigateur).

## Comptage des outils (compté en exécutant le registre `functions/src/mcp/outils/index.js`)
- **Total : 51 outils**, aucun doublon de nom.
- Lecteur : 13 (`qui_suis_je` + 12 de lecture).
- Bibliothécaire : **44** (les 13 + 31 d'écriture). Ce chiffre est **exact** : la liste de `docs/branchement-mcp.md` (ligne 81) est identique au profil bibliothécaire du code, nom pour nom (comparaison faite par script ; le test `tests/statique.test.js:421-428` la garde aussi).
- Claude Code : **51** (les 44 + 7 : `supprimer_personne`, `supprimer_organisation`, `supprimer_affaire`, `supprimer_projet`, `supprimer_note`, `supprimer_activite`, `restaurer_depuis_audit`).
- Le bibliothécaire n'a ni suppression ni restauration, Claude Code a tout : conforme aux décisions de Jérôme.
- Aucun outil `ajouter_encaissement` dans le code (supprimé en 2.2) ; il reste cité dans `docs/plan-mcp.md` (voir B-20).

## Constats

### B-01 · On peut créer une affaire directement à « Gagné » : l'extraction de valeur n'est alors jamais créée
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `creer_affaire` accepte une étape (par exemple `gagne`). L'affaire naît « gagnée », sans projet d'extraction, sans l'événement « Affaire gagnée » et sans la suggestion « Envoyer la facture ». Faire passer la même affaire à « Gagné » avec `changer_etape` crée bien l'extraction. L'écran ne permet pas de créer une affaire à une autre étape que « Premier contact ».
- **Ce que ça change pour Jérôme** : une affaire gagnée par un agent peut ne jamais recevoir son projet d'extraction (règle « Gagné sans projet : extraction à Gagné »), et personne ne s'en aperçoit.
- **Où dans le code** : `functions/src/mcp/outils/ecriture.js:45-49` (paramètre `etape`), `functions/src/coeur/metier.js:156-168` (aucun appel à `planChangerEtapeAvecExtraction`), `js/modules/projets/logique.js:864-870`, `js/modules/crm/affaires.js:170` (l'écran ne donne que titre, personne, organisation, montant).
- **Règle ou décision concernée** : `js/modules/projets/logique.js:811-819` (« affaire gagnée SANS projet : à Gagné »), `docs/mcp-projets.md` (« Aucun outil ne contourne les règles »).
- **Preuve** : essai local `creer_affaire {titre, etape:'gagne'}` : statut `gagnee`, 0 projet créé, seul l'événement `affaire_creee`. Même affaire passée par `changer_etape` : `extraction: {id, titre}` renvoyée. Puis `creer_projet_depuis_affaire` sur l'affaire née gagnée : 0 extraction au total.

### B-02 · `creer_projet_depuis_affaire` avec un titre vide crée un projet sans titre
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : si l'agent envoie `titre: ""`, la vérification utilise le titre de l'affaire (`valeurs.titre || a.titre`), mais le plan écrit ensuite le titre vide par-dessus celui de l'affaire. L'écran refuse un titre vide (« Le titre est obligatoire. »).
- **Ce que ça change pour Jérôme** : un projet apparaît dans les listes avec un nom vide, difficile à retrouver.
- **Où dans le code** : `functions/src/coeur/metier.js:275` (vérification avec `||`), `js/modules/projets/logique.js:741-745` (`...valeurs` écrase `titre: affaire.titre`), `functions/src/mcp/outils/ecriture.js:72` (`titre` accepte la chaîne vide), écran : `js/modules/projets/projets.js:227` (et `:229` qui envoie `{ titre }`).
- **Règle ou décision concernée** : `js/modules/projets/logique.js:55` (« Seul le titre est obligatoire »).
- **Preuve** : essai local `creer_projet_depuis_affaire {affaireId:'a2', titre:''}` : réponse `"titre":""`, document écrit avec titre vide. `creer_projet {titre:''}` est bien refusé.

### B-03 · Dans les fiches projet, « aPayer » est un nombre de factures, pas un montant en euros
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `lister_projets` et `lire_projet` renvoient `facturation: {facture, paye, aPayer, abandonne, impaye}`. `facture`, `paye`, `abandonne` sont en euros, mais `aPayer` est remplacé par le **nombre** de factures à payer. Pour une facture de 1 000 € à payer, la réponse dit `aPayer: 1`. La description de l'outil promet « reste à payer ».
- **Ce que ça change pour Jérôme** : un agent qui lit « reste à payer : 1 » peut annoncer 1 € au lieu de 1 000 €. L'écran, lui, affiche bien le montant.
- **Où dans le code** : `functions/src/coeur/lecture.js:157` (`aPayer: PL.facturesAPayer(p).length` écrase le montant calculé par `totauxFactures`, `js/modules/projets/logique.js:207-211`), `functions/src/mcp/outils/lecture.js:67` (description).
- **Règle ou décision concernée** : `js/modules/projets/factures.js` (« reste à payer » affiché en euros), `docs/mcp-projets.md` (« facturé, payé, reste à payer, abandonné, impayé »).
- **Preuve** : essai local (facture de 1000 € à payer) : `{"facture":1000,"paye":0,"aPayer":1,...}` dans les deux outils. Le test `tests/ecriture-outils.test.js:722` écrit même ce comportement comme attendu (`[1000, 0, 1, false]`).

### B-04 · Marquer une facture payée avec un montant plus petit réduit la facture : le reste disparaît du « reste à payer »
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `marquer_facture_payee` accepte un `montant`. Il **remplace** le montant de la facture. Facture de 100 € payée avec `montant: 40` : la facture vaut maintenant 40 €, « payée », le reste à payer est 0 et la clôture n'est plus bloquée. Aucune ligne n'est créée pour les 60 € manquants, aucun avertissement. L'écran fait pareil (champ « Montant reçu » prérempli).
- **Ce que ça change pour Jérôme** : une erreur de l'agent (ou un paiement partiel) fait « perdre » une partie de ce qui est dû, sans alerte. La décision de Jérôme dit « une facture se paie en entier ».
- **Où dans le code** : `js/modules/projets/logique.js:296-299`, `functions/src/mcp/outils/ecriture.js:110-112` (description : « Une facture payée en deux fois se sépare en deux lignes », mais rien ne le fait ni ne le propose).
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md:9` (« une facture se paie en entier »), `js/modules/projets/logique.js:186`.
- **Preuve** : essai local : facture 100 €, `marquer_facture_payee {montant:40}` : `factures` = `[{montant:40, statut:'payee'}]`, `lire_projet.facturation` = `{facture:40, paye:40, aPayer:0}`. À trancher par Jérôme : refuser un montant différent, ou créer automatiquement la ligne du solde.

### B-05 · Une facture payée ou abandonnée par erreur ne peut pas être remise « à payer » par les outils ; le message de refus indique un geste impossible
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : l'écran propose « Remettre à payer ». Aucun outil ne le fait. Quand l'agent essaie de payer une facture abandonnée, le message répond « Cette facture est abandonnée : remets-la d'abord à payer. », ce qu'il ne peut pas faire. Même chose pour « Une facture payée ne s'abandonne pas : remets-la d'abord à payer ». Seul Claude Code peut défaire, avec `restaurer_depuis_audit` ; le bibliothécaire ne peut rien.
- **Ce que ça change pour Jérôme** : si Hermes marque la mauvaise facture « payée », le chiffre d'affaires encaissé du mois est faux jusqu'à ce que Jérôme corrige à l'écran. Les docs disent « pas d'outil pour modifier ou supprimer une facture » (voulu), mais pas « remettre à payer » ni que le message est trompeur.
- **Où dans le code** : `js/modules/projets/logique.js:294` et `:320` (messages), `:306-313` (`remettreFactureAPayer`, plan non branché au MCP), `js/modules/projets/factures.js:114-117` et `:124` (écran), liste des outils : `functions/src/mcp/outils/ecriture.js:106-116`.
- **Règle ou décision concernée** : `docs/mcp-projets.md` (« Il n'y a pas d'outil pour modifier ou supprimer une facture… »).
- **Preuve** : essai local : facture abandonnée, `marquer_facture_payee` : « Cette facture est abandonnée : remets-la d'abord à payer. ». Le registre compté (51 outils) ne contient aucun outil de remise à payer.

### B-06 · On peut ajouter une facture « à payer » à un projet déjà terminé : la règle de clôture est contournée après coup
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `terminer_projet` refuse tant qu'une facture est à payer (conforme). Mais après la clôture, `ajouter_facture` est accepté : le projet reste « terminé, archivé, phase Clôture » avec une facture « à payer », sans pastille « Impayé » (elle ne s'allume que pour les factures abandonnées). L'écran a le même trou (le formulaire d'ajout est toujours affiché).
- **Ce que ça change pour Jérôme** : un argent dû peut dormir dans un projet archivé et ne plus apparaître nulle part comme alerte. (À rapprocher de l'étape A.)
- **Où dans le code** : `functions/src/coeur/metier.js:365-372`, `js/modules/projets/logique.js:253-268` (aucun contrôle du statut du projet), `js/modules/projets/fiche-projet.js:163`.
- **Règle ou décision concernée** : `js/modules/projets/logique.js:150-152` (« la Clôture est BLOQUÉE tant qu'une facture du projet n'est pas payée »).
- **Preuve** : essai local : `terminer_projet` puis `ajouter_facture {montant:500}` : accepté, projet `{statut:'termine', archive:true, phase:'cloture'}` avec 1 facture `a_payer`.

### B-07 · La description de `lister_activites` dit « à faire par défaut », mais l'outil renvoie aussi les activités faites
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : sans paramètre `fait`, l'outil renvoie **toutes** les activités, triées de la plus ancienne à la plus récente, 200 au plus. La description de l'outil promet « à faire par défaut » (le schéma, lui, dit bien « absent : toutes »). Avec beaucoup d'activités déjà faites, les 200 premières lignes sont des vieilles activités faites, et les activités à venir sont coupées.
- **Ce que ça change pour Jérôme** : un agent qui prépare « ce qu'il y a à faire » peut passer à côté de rappels.
- **Où dans le code** : `functions/src/mcp/outils/lecture.js:102` (description) contre `:107` (schéma) ; `functions/src/coeur/lecture.js:140` (filtre seulement si `fait` est donné), `:143` (coupe à 200 après tri par date croissante).
- **Règle ou décision concernée** : description de l'outil elle-même.
- **Preuve** : essai local `lister_activites {}` : `[["ac3",true],["ac1",false],["ac2",false],["ac4",false]]` (une activité faite en premier). La coupure à 200 est lue dans le code, non reproduite avec 200 activités.

### B-08 · Aucun outil ne liste les personnes ou organisations, et `chercher` ignore les fiches archivées : un agent recrée des doublons de fiches archivées
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : pour retrouver une personne ou une organisation, il n'y a que `chercher` (2 lettres minimum, 50 résultats au plus par type) qui **exclut les archivées**, comme la recherche de l'écran. De plus la détection de doublons de `creer_personne` et `creer_organisation` ignore elle aussi les archivées. Résultat : un contact archivé est introuvable (on ne peut donc pas le désarchiver avec `modifier_personne archive:false`, faute de connaître son identifiant) et un agent en crée un second sans avertissement. Il n'y a pas non plus de liste par étiquette, rôle ou ville comme à l'écran. La description de `chercher` ne dit pas qu'il ignore les archivées.
- **Ce que ça change pour Jérôme** : le carnet d'adresses se remplit de doublons d'anciens contacts, et le ménage par l'agent est impossible.
- **Où dans le code** : `functions/src/coeur/lecture.js:30` et `:34-35` (filtres `!archive`), `js/modules/crm/logique.js:426` et `:436` (doublons : `p.archive` / `!o.archive` ignorés), `functions/src/mcp/outils/lecture.js:13` (description).
- **Règle ou décision concernée** : `docs/plan-mcp.md` §5.3 (seule la recherche est prévue ; pas de liste).
- **Preuve** : essai local : `chercher "Archivée"` et `chercher "Ancienne"` : 0 résultat (la personne p3 et l'organisation org3 de la base d'essai sont archivées) ; puis `creer_personne {nom:'Personne Archivée'}` accepté sans refus de doublon. Le test `tests/lecture.test.js:38` fige déjà « les fiches archivées ne sont jamais proposées ».

### B-09 · Les listes s'arrêtent à 200 lignes sans « page suivante » ; `lire_audit` ne montre que les 200 lignes les plus récentes et relit tout le journal à chaque appel
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (coupure) / PLAUSIBLE (coût de lecture)
- **Ce qui se passe** : `lister_affaires`, `lister_projets`, `lister_activites` et `lire_audit` rendent au plus 200 lignes et disent `tronque: true`, mais il n'existe ni décalage ni curseur. Pour `lire_audit`, le tri va du plus récent au plus ancien et `depuis` ne borne que le bas : les lignes plus anciennes que les 200 dernières ne sont atteignables que par un filtre (acteur, document, opération). Comme le journal ne s'efface jamais (décision de Jérôme), il grossira sans fin, et chaque appel relit la collection **entière** avant de couper.
- **Ce que ça change pour Jérôme** : « que s'est-il passé le mois dernier ? » deviendra impossible à lire par l'agent, puis lent et coûteux.
- **Où dans le code** : `functions/src/coeur/lecture.js:8-9` (plafond et `borne`), `:236` (lecture sans limite de la collection d'audit), `:247-248` (tri puis coupe), `functions/src/mcp/outils/lecture.js:7` et `:134-142` (pas de paramètre de page).
- **Règle ou décision concernée** : `docs/roadmap.md:14` et `CLAUDE.md` (journaux jamais effacés).
- **Preuve** : essai local avec 263 lignes d'audit : `{total:263, tronque:true, n:200}`, la plus ancienne renvoyée est la 64e ; `limite:500` refusé par le schéma (maximum 200). Le coût en production n'est pas mesuré : non vérifié.

### B-10 · Pas d'outil pour reporter ou corriger une activité, ni une tâche de projet : l'agent doit « tout refaire » ou faire un faux « fait »
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : l'écran sait modifier une activité (date, titre), la remettre « à faire », et modifier, déplacer une tâche de projet. Le serveur n'a que `creer_activite` / `terminer_activite` et `ajouter_tache_projet` / `terminer_tache_projet` (`terminer_tache_projet fait:false` remet seulement à faire). Reporter un rappel oblige à en créer un nouveau et à marquer l'ancien « fait » : le fil affiche alors un faux « Appel fait ». Corriger une faute dans une tâche est impossible. Seule la suppression de tâche est signalée comme « voulue » dans la doc.
- **Ce que ça change pour Jérôme** : le fil et l'accueil se salissent (faux « fait », rappels en double) dès que l'agent doit déplacer quelque chose.
- **Où dans le code** : `js/modules/crm/donnees.js:350` (`majActivite`), `js/modules/projets/donnees.js:243-248` (`majTache`, `deplacerTache`), registre des outils compté, `js/modules/crm/logique.js:1613` (`planMajActivite`, `activiteNonFaite` :975).
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md:9` et `docs/mcp-projets.md:36` (ne listent que facture, modèles, suppression de tâche comme « non faits volontairement »).
- **Preuve** : liste des 51 outils (script de comptage) : aucun outil `modifier_activite`, `modifier_tache`, `deplacer_tache`, `rouvrir_activite`.

### B-11 · D'autres gestes de l'écran n'ont pas d'outil : lier un projet existant à une affaire, note ou document sur un projet, nouvelle étiquette, opposition à la prospection
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : l'écran sait lier ou détacher un projet existant d'une affaire gagnée (`planLierProjet`, `planDelierProjet`), ajouter une note à un projet, joindre un document, créer une étiquette, enregistrer l'opposition d'un contact à la prospection. Côté serveur : `ajouter_note` et `joindre_lien` ne s'attachent qu'à une affaire, une personne ou une organisation (pas un projet), `modifier_projet` n'a pas d'`affaireId`, et `creer_personne` refuse une étiquette inconnue sans moyen de la créer. L'opposition à la prospection n'est ni modifiable ni expliquée (la fiche la renvoie, mais aucun outil ne l'enregistre).
- **Ce que ça change pour Jérôme** : l'agent ne peut pas rattacher un projet déjà créé à l'affaire gagnée (il faudrait le faire à l'écran), ni consigner un « stop, ne me contactez plus » reçu par e-mail.
- **Où dans le code** : `js/modules/projets/donnees.js:211-222` (lier, délier), `:162-166` (notes de projet), `js/modules/crm/donnees.js:404` (`creerEtiquette`), `:256` (`marquerOppositionPersonne`), `js/modules/crm/logique.js:1489-1497` (opposition), `functions/src/coeur/metier.js:389-398` (`liensCreation` : affaire, personne ou organisation seulement).
- **Règle ou décision concernée** : `docs/mcp-projets.md` (« exactement les règles de l'écran »).
- **Preuve** : registre compté : aucun outil `lier_projet`, `delier_projet`, `creer_etiquette`, `enregistrer_opposition` ; `ajouter_note` sans paramètre `projetId` (`functions/src/mcp/outils/ecriture.js:118-120`).

### B-12 · Plusieurs lectures n'ont aucune limite de taille
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE
- **Ce qui se passe** : `lister_documents` n'a pas de plafond. `lire_personne`, `lire_organisation` et `lire_affaire` renvoient toutes les activités de la fiche ; avec `avecFil`, jusqu'à 500 entrées (notes de 20 000 caractères au plus chacune), sans limite de poids. `lister_affaires` renvoie les fiches complètes (jusqu'à 5 000 caractères de « besoin » par affaire, fois 200).
- **Ce que ça change pour Jérôme** : une réponse très grosse peut saturer le contexte de l'agent ou ralentir le serveur ; aucun symptôme aujourd'hui (volumes actuels non vérifiés).
- **Où dans le code** : `functions/src/coeur/lecture.js:147-153`, `:62-111`, `js/modules/crm/logique.js:11` (`MAX_HISTORIQUE = 500`) et `:1079-1094`, `functions/src/mcp/outils/ecriture.js:119` (notes jusqu'à 20 000 caractères).
- **Règle ou décision concernée** : aucune règle écrite sur la taille des réponses.
- **Preuve** : lecture du code, non reproduit.

### B-13 · Des dates qui n'existent pas (30 février, 31 avril) sont acceptées
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : le contrôle `jourValide` (et `estJour` pour les projets) s'appuie sur `Date.parse`, qui accepte « 2026-02-30 » (devient le 2 mars). Les activités ne sont contrôlées que par la forme. Le texte reste enregistré tel quel (« 2026-04-31 »). Seuls les mois 13 et plus sont refusés. À l'écran, le sélecteur de date empêche ces valeurs.
- **Ce que ça change pour Jérôme** : une date de paiement ou de rappel affichée un autre jour que celui saisi ; le chiffre d'affaires du mois suit le texte (avril) alors que l'affichage du jour glisse en mai.
- **Où dans le code** : `functions/src/coeur/metier.js:54`, `js/modules/projets/logique.js:51`, `js/modules/crm/logique.js:930-935`, `:146-160` (`versDate` fait glisser la date).
- **Règle ou décision concernée** : aucune écrite ; « Attendu AAAA-MM-JJ » dans les schémas.
- **Preuve** : essai local : `mettre_en_pause dateReveil:'2026-02-30'`, `creer_activite date:'2026-04-31'`, `ajouter_facture dateEnvoi:'2026-02-30'` et `datePaiement:'2026-04-31'`, `ajouter_tache_projet date:'2026-04-31'`, `modifier_personne dateInterviewJtbd:'2026-02-30'` : tous acceptés et écrits tels quels. `2026-13-45` est refusé.

### B-14 · L'heure d'une activité n'est pas contrôlée (« 99:99 » passe), celle d'une tâche de projet l'est
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `creer_activite` accepte toute heure de la forme `NN:NN`. `ajouter_tache_projet` refuse « 99:99 » (« L'heure doit être au format HH:MM. »).
- **Ce que ça change pour Jérôme** : une activité avec une heure impossible se trie mal dans l'accueil.
- **Où dans le code** : `functions/src/mcp/outils/ecriture.js:124`, `js/modules/crm/logique.js:930-935` (pas de test d'heure), `js/modules/projets/logique.js:408`.
- **Règle ou décision concernée** : cohérence avec les tâches de projet.
- **Preuve** : essai local : `creer_activite heure:'99:99'` accepté ; `ajouter_tache_projet heure:'99:99'` refusé.

### B-15 · `ajouter_note` et `creer_activite` gardent un seul rattachement et ignorent les autres sans le dire
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : si l'agent donne plusieurs rattachements (par exemple `affaireId` d'une personne et `personneId` d'une autre), seul le premier compte (affaire, sinon personne, sinon organisation) ; les autres sont écartés sans message. La description dit seulement « rattachée à une affaire…, à une personne ou à une organisation ».
- **Ce que ça change pour Jérôme** : une note destinée à la fiche d'une autre personne atterrit chez la personne de l'affaire.
- **Où dans le code** : `functions/src/coeur/metier.js:389-398`, `functions/src/mcp/outils/ecriture.js:118-126`.
- **Règle ou décision concernée** : description des outils.
- **Preuve** : essai local : `ajouter_note {affaireId:'a1', personneId:'p2', organisationId:'org2'}` : note enregistrée avec `personneId:'p1'`, `organisationId:'org1'` (ceux de l'affaire), la réponse ne signale rien.

### B-16 · Lier une fiche à une personne ou organisation archivée, ou désarchiver une fiche qui fait doublon, n'est pas contrôlé
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : les listes de choix de l'écran n'offrent pas les fiches archivées ; les outils acceptent un `personneId` ou `organisationId` archivé (affaire, projet, personne). `modifier_personne archive:false` ne vérifie pas qu'une fiche active de même nom existe déjà (l'écran non plus, au désarchivage).
- **Ce que ça change pour Jérôme** : des liens vers des fiches rangées dans les archives, et des doublons actifs après un désarchivage.
- **Où dans le code** : `functions/src/coeur/metier.js:76`, `:109-115` (le contrôle de doublon ne regarde que `nom` et `emails`), `:163-164`, `:175-176`, `:264-265` ; écran : `js/modules/crm/composants.js:195-196`.
- **Règle ou décision concernée** : `js/modules/crm/logique.js:421-437` (les doublons ignorent les archivés).
- **Preuve** : essai local : `creer_affaire {personneId:'p3'}` (p3 archivée), `modifier_personne {id:'p2', organisationId:'org3'}` (org3 archivée), `creer_projet {organisationId:'org3'}` acceptés ; `modifier_personne {id:'p3', archive:false}` accepté alors qu'une personne active « Personne Archivée » existait.

### B-17 · Certains messages d'erreur sont en anglais ou trompeurs
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : (a) les erreurs de format détectées par le protocole sont en anglais : « Input validation error: Invalid arguments for tool … Too big: expected number to be <=200 », « Invalid option: expected one of "prospect"|… », « Tool inconnu_outil not found ». (b) `marquer_perdue` avec une raison hors liste répond « La raison est obligatoire. » (elle est fournie, mais inconnue). (c) `changer_etape` avec une étape inconnue répond « Étape inconnue. » sans liste, alors que `creer_affaire` donne la liste. (d) Les messages venant de l'écran sont écrits à la personne qui clique (« remets-la d'abord à payer », « rouvre-le d'abord ») et ne correspondent pas toujours à un outil (voir B-05).
- **Ce que ça change pour Jérôme** : peu pour lui, mais un agent perd du temps à deviner la valeur permise.
- **Où dans le code** : `js/modules/crm/logique.js:585-587`, `:658-660` ; `functions/src/coeur/metier.js:153` (la version avec liste, pour `creer_affaire`) ; gestionnaire du protocole : `functions/src/mcp/gestionnaire.js:101`.
- **Règle ou décision concernée** : consigne de l'audit (« message clair en français »).
- **Preuve** : essais locaux listés ci-dessus (textes copiés des réponses). Les erreurs de fond (fiche introuvable, doublon, confirmation, plafond, clôture bloquée, date de fin avant le début) sont, elles, en français clair.

### B-18 · Les outils de suppression disent encore « Récupérable 90 jours » alors que plus rien ne s'efface
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : depuis le 04/10/2026 la règle d'effacement est supprimée et Jérôme garde tout. Pourtant les descriptions de `supprimer_personne`, `supprimer_organisation`, `supprimer_affaire`, `supprimer_projet`, `supprimer_note`, `supprimer_activite` disent « Récupérable 90 jours » et `restaurer_depuis_audit` « Copies gardées 90 jours ». La **réponse** de chaque suppression contient `restaurable: "restaurer_depuis_audit (90 jours)"`. Le message `copie_expiree` parle de « gardées 90 jours ». Le code écrit toujours une date d'expiration à 90 jours (inoffensive sans règle TTL). La liste de `docs/reprise-prochaine-session.md:53` ne cite que 2 descriptions : elle est incomplète.
- **Ce que ça change pour Jérôme** : un agent peut conclure qu'une suppression de plus de 90 jours est perdue, alors qu'elle est restaurable.
- **Où dans le code** : `functions/src/mcp/outils/suppression.js:2`, `:12`, `:15`, `:18`, `:21`, `:24`, `:25`, `:26` ; `functions/src/coeur/metier.js:454` ; `functions/src/coeur/restaurer.js:7`, `:34` ; `functions/src/coeur/ecriture.js:23`, `:119`, `:157`.
- **Règle ou décision concernée** : `CLAUDE.md` du dépôt (RGPD : aucune mesure ; journaux jamais effacés) ; travail déjà prévu dans `docs/reprise-prochaine-session.md` §1 (non fait au 2026-10-08).
- **Preuve** : essai local `supprimer_note` : réponse `"restaurable":"restaurer_depuis_audit (90 jours)"`. Les 6 descriptions sont lues dans `suppression.js`. Les tests `tests/ecriture-outils.test.js:444` et `tests/ecriture.test.js:281` figent ce message.

### B-19 · Le journal lu par `lire_audit` ne montre pas les valeurs reçues ni les copies avant/après (décision « on garde tout » appliquée à moitié)
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : chaque écriture laisse bien une ligne dans `crm_audit` et une copie dans `crm_audit_avant` (vérifié, voir plus bas). Mais `crm_audit` ne garde que les **noms** des paramètres (`parametresRecus`), les valeurs ne sont que dans la copie, uniquement sur la première ligne de l'opération et coupées à 2 000 caractères. `lire_audit` n'expose ni les valeurs ni les copies avant/après : pour voir le contenu d'un ancien état, il faut passer par l'aperçu de `restaurer_depuis_audit` (qui ne montre que les actions).
- **Ce que ça change pour Jérôme** : l'agent ne peut pas répondre à « qu'avait écrit Hermes dans cette fiche ? ». Rien n'est perdu (les copies existent).
- **Où dans le code** : `functions/src/coeur/ecriture.js:137` (noms seuls), `:158` (valeurs sur `ordre === 1`), `:24` et `:39-43` (coupe à 2 000), `functions/src/coeur/lecture.js:232-250`.
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md` §1, « À faire » point 1 (garder aussi les valeurs reçues dans `crm_audit`), pas encore fait.
- **Preuve** : essai local : après `ajouter_note {texte:'Secret note texte'}` la ligne `crm_audit` a `parametresRecus:["texte","personneId"]` ; la copie `crm_audit_avant` de la première ligne contient `parametres:"{\"texte\":\"Secret note texte\",…}"`, pas les suivantes.

### B-20 · Les nombres d'outils et des outils retirés sont périmés dans plusieurs documents
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : le chiffre **44** (bibliothécaire) est juste. Mais : `docs/roadmap.md:74` dit « 3 outils de lecture, 12 d'écriture, 1 de suppression » (16) pour les projets, alors que le code compte 3 + **15** + 1 = **19** (et `docs/reprise-prochaine-session.md:7` répète « 16 outils MCP des projets »). `docs/branchement-mcp.md:12` annonce « 33 outils » pour Claude Code (il y en a **51**) ; aucun document ne donne 51 ni 13. `docs/plan-mcp.md:148` cite `montantEncaisse?` pour `changer_etape` et `:150` l'outil `ajouter_encaissement`, supprimés. `docs/plan-mcp.md` §5.3 liste aussi des outils jamais construits (`preparer_televersement`, `joindre_fichier_drive`, `sauvegarder`, `lister_sauvegardes`, `purger_sauvegardes`) sans marque « pas encore ». `docs/mcp-etape-4.md:20-24` ne montre que les outils de l'étape 4. `docs/securite-et-pannes.md:34` dit « 6 collections de données » alors que le moteur en écrit 9.
- **Ce que ça change pour Jérôme** : confusion quand il compare une liste de la doc à ce que Hermes voit.
- **Où dans le code** : `functions/src/coeur/ecriture.js:19` (9 collections), registre `functions/src/mcp/outils/index.js`.
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-b.md:24` (« listes d'outils des guides à jour »).
- **Preuve** : comptage par script du registre (13 / 44 / 51 ; projets 3 + 15 + 1).

### B-21 · Quelques descriptions d'outils sont incomplètes
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (modifier_organisation) / PLAUSIBLE (extraire_valeur_projet)
- **Ce qui se passe** : `modifier_organisation` refuse un nom qui ferait doublon sauf `forcer: true`, mais sa description ne le dit pas (celle de `modifier_personne` le dit). `extraire_valeur_projet` annonce « quatre tâches » : c'est le contenu du modèle « Extraction » par défaut, qui peut avoir été modifié à l'écran. `chercher` ne dit pas qu'il ignore les archivées (voir B-08). `lister_projets` ne rend pas les projets terminés par défaut (ils sont archivés) : c'est écrit, mais `statut: termine` seul donne 0 résultat.
- **Ce que ça change pour Jérôme** : un agent essaie, se fait refuser, puis devine.
- **Où dans le code** : `functions/src/mcp/outils/ecriture.js:40-43`, `:95` ; `functions/src/mcp/outils/lecture.js:13`, `:67`.
- **Règle ou décision concernée** : descriptions des outils.
- **Preuve** : essai local : `modifier_organisation {id:'org2', nom:'Atelier des Lilas'}` : « Organisation existante possible … recommencer avec forcer: true. » ; `lister_projets {statut:'termine'}` : 0, avec `archive:true` : 1.

### B-22 · `qui_suis_je` annonce la version 0.2.0 du serveur alors que l'application est en 2.3.3
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE
- **Ce qui se passe** : la version affichée vient de `functions/package.json` (0.2.0), distincte de `version.json` (2.3.3). Aucun document n'explique la différence.
- **Ce que ça change pour Jérôme** : une personne qui contrôle « quelle version tourne ? » voit deux numéros sans lien.
- **Où dans le code** : `functions/src/version.js:4`, `functions/package.json` (`"version": "0.2.0"`), `version.json`.
- **Règle ou décision concernée** : aucune.
- **Preuve** : import local de `functions/src/version.js` : `0.2.0`. Je n'ai pas appelé le serveur déployé.

## Vérifié et conforme

**Droits par profil et registre (51 outils)**
- Le lecteur ne voit que les 13 outils de lecture ; le bibliothécaire a 44 outils sans aucune suppression ni restauration ; Claude Code a les 51 : conforme aux décisions de Jérôme. Un outil hors profil est refusé même si l'appel arrive (`tests/mcp.test.js:102`, `tests/ecriture-outils.test.js:70-95`, rejoués : réussis).
- Liste Hermes de `docs/branchement-mcp.md:81` = profil bibliothécaire du code, nom pour nom.
- Aucune description d'outil du code ne cite un outil supprimé (`ajouter_encaissement` n'apparaît que dans la doc et dans un test négatif).

**Outils de lecture (12 + `qui_suis_je`)**
- Aucune écriture dans la couche de lecture (test `tests/lecture.test.js:186-205`, rejoué : réussi). Dates rendues en texte ISO.
- `lister_affaires`, `chercher` : mêmes règles et même ordre que l'écran (tests de parité `tests/lecture.test.js:49` et `:113`, réussis).
- Fiche inconnue : « Personne introuvable », « Projet introuvable » (clair, sans détail technique).
- Les étapes annoncées par `lister_affaires` (premier_contact, rdv_fixe, proposition_envoyee, gagne) sont celles du code.

**Outils d'écriture CRM (personnes, organisations, affaires, notes, activités, documents)**
- Doublons de personne (nom sans accents ni casse, e-mail) et d'organisation refusés à la création et au renommage, avec la liste et `forcer: true` : conforme à l'écran (essais locaux, tests existants).
- Étiquettes, offres, étapes, priorités, rôles, taille d'organisation : valeurs inconnues refusées avec message.
- `changer_etape` n'accepte que les 4 étapes (plus de « facture_payee » ni « facture_envoyee ») ; vers « gagne » sans projet, l'extraction est créée (même plan que l'écran).
- `marquer_perdue` crée l'extraction avec la raison reprise ; `mettre_en_pause`, `rouvrir_affaire` : « rien à changer » n'écrit rien et ne laisse pas de trace.
- Une affaire n'est jamais archivée automatiquement à « Gagné » (décision de Jérôme respectée).
- `joindre_lien` refuse une adresse sans http(s) ; `retirer_document` par index ou url, jamais le mauvais.

**Outils des projets et des factures**
- Clôture vers « cloture » (`changer_phase_projet`) et `terminer_projet` refusés tant qu'une facture est à payer, avec le nom des factures et les deux sorties ; sortie `impaye: {raison}` abandonne les factures restantes et garde la pastille : conforme à l'écran (même plan).
- Une seule extraction par projet, y compris après `extraire_valeur_projet` ; un projet d'extraction ne s'extrait pas.
- `creer_projet_depuis_affaire` : refus si l'affaire n'est pas gagnée ou a déjà un projet (une affaire n'a qu'un projet) ; le lien se pose des deux côtés.
- Facture abandonnée : raison obligatoire ; une facture payée ne s'abandonne pas ; paiement avant l'envoi refusé ; un projet terminé ne se met pas en pause.
- Aucun outil n'écrit directement dans la base : tout passe par `executerEcritures` (contrôlé par test, rejoué).

**Suppression et restauration (Claude Code seul)**
- Confirmation par le nom exact (ou le titre), organisation non vide refusée, choix obligatoire pour une personne qui a des affaires, projets liés gardés avec le lien vidé : conforme aux règles de l'écran.
- Restauration à l'identique (mêmes identifiants et liens) après suppression ; aperçu par défaut ; refus si le document a changé depuis (sauf `forcer`).

**Trace d'audit**
- Chaque écriture réelle laisse, par document touché, une ligne `crm_audit` (acteur, jeton, canal `mcp`, outil, action, statut) et une copie `crm_audit_avant` (avant / après) ; essai local : `creer_projet` = 2 lignes + 2 copies, égal au nombre d'écritures.
- Si le journal est en panne, rien n'est écrit (test des pannes simulées, réussi). Un appel refusé (saisie, droits) ne laisse aucune ligne.
- Tests rejoués : `mcp`, `lecture`, `ecriture-outils`, `ecriture`, `jetons` : 114 réussis, 0 échec ; avec les émulateurs Firebase : `ecriture-firestore`, `lecture-firestore`, `essai-ecriture` : 17 réussis, 0 échec.

**Plafonds**
- 120 requêtes/minute, 500 écritures/heure, 20 suppressions/jour par jeton, réglables par jeton : conforme à `docs/plan-mcp.md` §5.4 ; un refus de saisie ne consomme rien (tests existants).

## Remarques de sécurité vues en passant (sans enquête)
- `restaurer_depuis_audit` ne compte pas dans le plafond de 20 suppressions par jour, alors qu'annuler une création supprime un document (choix voulu et testé : `tests/ecriture-outils.test.js:494`).
- Le plafond de 120 requêtes/minute est compté dans la mémoire de chaque instance (3 au plus) : au pire 360 en réalité (écrit dans `functions/src/securite/limites.js:2-4`).
- Les erreurs inattendues de Firestore remontent à l'agent avec leur texte brut (non vérifié sur le serveur déployé).
