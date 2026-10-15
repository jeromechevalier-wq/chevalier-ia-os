# Étape A : projets et factures (audit fonctionnel, version 2.3.3)

Statut : partiel (la logique pure, les écrans lus et la migration sont couverts ; les parcours dans le navigateur n'ont pas été rejoués : voir la liste « Ce qui n'a PAS été regardé » juste en dessous). Rien n'a été modifié dans le code, les tests, les règles ni les autres docs.

Branche auditée : `claude/fervent-mayer-gme1rw` (identique à `main` au démarrage). Aucune donnée réelle, aucun appel au serveur MCP de production, aucun émulateur lancé.

## Comment j'ai travaillé
- Lecture complète de `js/modules/projets/logique.js`, `donnees.js`, `factures.js`, `taches.js`, `modeles.js`, `projets.js`, `fiche-projet.js` ; lecture ciblée de `js/modules/crm/logique.js` (étapes, `changementEtape`, calcul du chiffre d'affaires encaissé, suppression d'une affaire, `ETAPES_RETIREES`), `js/modules/crm/donnees.js` (`executer`), `js/modules/crm/reglages.js` (migration), `js/modules/crm/affaires.js` et `accueil.js` (appels), `functions/src/coeur/metier.js` (outils MCP de projets, lus seulement).
- Lecture des règles : `docs/cadrage-projets.md`, `docs/projets-facturation-2-2-a.md` et `2-2-b.md`, `docs/projets-etape-1..7.md`, `docs/reprise-prochaine-session.md`, `docs/mcp-projets.md`, `docs/roadmap.md` (extraits), `docs/decisions-construction-v2.md` et `docs/crm-decisions-entretien.md` (extraits).
- Tests existants lancés : `node --test logique.test.js projets.test.js` → 283 tests, 283 réussis, 0 échec.
- Essais écrits pour l'audit, **hors du dépôt**, dans `/tmp/claude-0/-home-user/463bd024-058f-5054-a0ba-ff407483affe/scratchpad/` : `sonde1.mjs` (factures et clôture), `sonde2.mjs` (extraction et suppression), `sonde3.mjs` (migration et chiffre d'affaires), `sonde4.mjs` (tâches, retard, fuseau), `sonde5.mjs` (cas divers). Ce sont de petits scripts qui appellent les vraies fonctions de `logique.js` sur des données en mémoire (même méthode que `tests/projets.test.js`). Quand un constat dit « CONFIRMÉ », c'est qu'un de ces essais l'a reproduit.

## Ce qui n'a PAS été regardé
- **Les parcours dans le navigateur (`tests/e2e/projets.spec.js`, Playwright) n'ont pas été lancés** : ils demandent les émulateurs et environ 5 minutes, et d'autres étapes de l'audit tournent en même temps (risque de collision sur les mêmes ports). Je n'ai donc rien vu à l'écran : tout ce qui touche à l'affichage (mise en page, téléphone, textes à l'écran) est lu dans le code, pas observé.
- La suite complète avec émulateurs (règles Firestore, serveur MCP, `ecriture-outils.test.js`) n'a pas été lancée. Je n'ai relu que les fonctions de projets de `functions/src/coeur/metier.js`, pas le reste du serveur (c'est l'étape B).
- `js/modules/crm/fiche-affaire.js` (section « Projet » de la fiche affaire), `fiche-personne.js`, `fiche-organisation.js`, `celebrations.js`, `js/os/objectifs.js` (seulement vérifié comment les projets lui arrivent), les écrans Accueil et Archives : non relus en détail.
- Les vraies données de Jérôme : non regardées (interdit). Je ne sais donc **pas** combien d'affaires sont encore en « Facture envoyée » / « Facture payée », ni s'il existe des affaires perdues ou en pause dans ces étapes, ni combien de projets ont des factures : « non vérifié » partout où cela compte.
- Les accès simultanés (deux onglets, ou l'écran et un agent en même temps) : raisonné dans le code, jamais essayé.
- La sécurité (règles Firestore, droits des profils MCP) : hors périmètre. Aucune remarque de sécurité vue en passant.

## Constats

### A-01 · Une facture « à payer » peut revenir sur un projet déjà terminé et archivé, sans que rien ne le dise
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : on peut « Remettre à payer » une facture abandonnée (ou payée) et même ajouter une nouvelle facture sur un projet qui est déjà « Terminé » et rangé dans les Archives, sans le rouvrir. Le projet reste terminé avec une facture « à payer » dedans. Le code de la règle ne regarde jamais le statut du projet, et le menu de la facture est proposé tel quel sur la fiche d'un projet terminé.
- **Ce que ça change pour Jérôme** : un impayé peut dormir dans les Archives, hors de vue : il n'existe aucun écran qui liste toutes les factures à payer, et la pastille « Impayé » ne s'allume que pour une facture *abandonnée*, donc plus du tout une fois la facture remise « à payer ».
- **Où dans le code** : `js/modules/projets/logique.js:306-313` (`remettreFactureAPayer`), `js/modules/projets/logique.js:253-268` (`ajouterFacture`), `js/modules/projets/factures.js:119-127` (`menuFacture`, aucune condition sur le projet), `js/modules/projets/fiche-projet.js:163` (la section Factures est toujours construite)
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` (« On peut rouvrir le projet, remettre la facture à payer si le client finit par payer, l'encaisser, et clôturer normalement » : le chemin prévu passe par la réouverture) ; `docs/cadrage-projets.md` (la Clôture BLOQUE tant qu'une facture est à payer).
- **Preuve** : essai `sonde1.mjs` (cas « remise à payer sur projet terminé ») : après clôture avec impayé, `remettreFactureAPayer` rend `statut: "termine"`, `archive: true`, facture `a_payer`. Même essai : `ajouterFacture` sur ce projet terminé ne renvoie aucune erreur (2 factures). Le test B33 « rouvrir un projet clôturé avec impayé » couvre seulement le chemin correct (réouverture d'abord) et ne teste pas ce cas.

### A-02 · La migration peut déposer une facture « à payer » dans un projet déjà terminé ou archivé
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : pour une affaire « Facture envoyée » qui a un projet, la migration ajoute la facture au projet sans regarder si le projet est terminé ou archivé. Seul un projet « d'extraction » est écarté (renvoyé « à traiter à la main »).
- **Ce que ça change pour Jérôme** : après « Migrer », un projet terminé peut se retrouver avec une facture à payer cachée dans les Archives (même problème que A-01), alors que l'aperçu ne le signale pas.
- **Où dans le code** : `js/modules/projets/logique.js:356-368` (la seule condition est `!cible || estExtraction(cible)`)
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-b.md` (« la clôture du projet attend ce paiement » : or un projet déjà clos n'attend plus rien) ; `docs/cadrage-projets.md` (Clôture bloquée tant qu'une facture est à payer).
- **Preuve** : essai `sonde3.mjs` cas « M2 projet terminé reçoit facture à payer » : projet `termine`/archivé → après migration `factures: ["a_payer"]`, `aTraiterAMain: []`. Le projet archivé non terminé (cas M6) reçoit lui aussi la facture. Combien de vrais projets sont dans ce cas : non vérifié.

### A-03 · Migration : un acompte déjà encaissé sur l'affaire est compté une deuxième fois
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : une affaire « Facture envoyée » de 1 000 € dont 300 € ont déjà été encaissés (avant la 2.2, on pouvait saisir un encaissement partiel sur l'affaire à n'importe quelle étape) reçoit sur son projet une facture « à payer » de **1 000 €** (le montant complet). Les 300 € restent comptés dans les encaissements de l'affaire. Quand Jérôme marque la facture payée, le chiffre d'affaires du mois monte de 1 300 € pour une vente de 1 000 €.
- **Ce que ça change pour Jérôme** : l'objectif « chiffre d'affaires encaissé » et le graphique de l'Accueil peuvent être gonflés après la migration, sans alerte.
- **Où dans le code** : `js/modules/projets/logique.js:358-363` (montant = `a.montant`, sans retirer `a.encaissements`) ; `js/modules/crm/logique.js:1136-1140` (le calcul additionne les encaissements d'affaires et les factures payées)
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-b.md` (« ton chiffre d'affaires ne bouge pas » pour la migration ; « Ces encaissements comptent toujours dans le chiffre d'affaires du mois où ils ont eu lieu »).
- **Preuve** : essai `sonde3.mjs` cas M1 : facture créée à 1000, `L.CALCULS.ca_encaisse` d'octobre = 1300 une fois payée. Que l'ancien code ait permis l'encaissement partiel : `git show 73873aa^:js/modules/crm/logique.js` (fonction `ajouterEncaissement`, aucune limite d'étape). Si de telles affaires existent aujourd'hui : non vérifié.

### A-04 · Migration : une affaire perdue ou en pause qui était dans une étape retirée redevient « gagnée »
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : la migration écrit `statut: 'gagnee'` pour toute affaire en « Facture envoyée » ou « Facture payée », même si Jérôme l'avait marquée « Perdue » ou « En pause » (marquer perdue laisse l'étape en place). La raison de perte reste écrite, et, pour « Facture envoyée » avec un projet et un montant, une facture « à payer » est ajoutée.
- **Ce que ça change pour Jérôme** : une affaire qu'il avait abandonnée peut réapparaître gagnée, avec une facture à encaisser, après un clic sur « Migrer ». L'aperçu n'en parle pas.
- **Où dans le code** : `js/modules/projets/logique.js:349` (le filtre ne regarde que l'étape) et `:373` (`statut: 'gagnee'` écrit sans condition)
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-b.md` (la migration « ne touche pas aux autres affaires » ; une affaire perdue n'est pas « Gagnée »).
- **Preuve** : essai `sonde3.mjs` cas M4 : statuts `perdue` et `en_pause` → après migration `statutApres: "gagnee"`, `raisonPerdue: "Prix"` conservée, une facture ajoutée. Probabilité réelle : non vérifiée sur les vraies données (je pense le cas rare).

### A-05 · Un paiement partiel est accepté : le reste de la facture disparaît sans avertissement
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : dans « Marquer payée », le montant reçu est modifiable. Si Jérôme saisit 700 sur une facture de 1 000, la facture devient « Payée » à **700 €** : le montant d'origine est écrasé, la facture n'est plus « à payer », le projet peut être clôturé, et les 300 € manquants ne sont plus visibles nulle part (« Facturé 700 · payé 700 · reste 0 »). Aucun message ne prévient.
- **Ce que ça change pour Jérôme** : la décision « une facture se paie en entier » n'est pas protégée : un paiement en deux fois saisi sur la même ligne perd silencieusement le solde, au lieu de demander de séparer en deux lignes.
- **Où dans le code** : `js/modules/projets/logique.js:290-303` (`marquerFacturePayee`, lignes 296 et 299 : `montant` remplace `f.montant`) ; `js/modules/projets/factures.js:25,38` (le champ « Montant reçu » est proposé et envoyé tel quel) ; même règle côté MCP : `functions/src/coeur/metier.js` (`marquerFacturePayee`).
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md` (« une facture se paie en entier ») ; `docs/projets-facturation-2-2-a.md` (« Une facture est payée en entier ou pas : si un client règle une même facture en deux fois, sépare-la en deux lignes »).
- **Preuve** : essai `sonde1.mjs` cas « payée 700 sur 1000 » : `factures: [{ montant: 700, statut: "payee" }]`, totaux `facture 700, aPayer 0`. À noter : le test B33 « montant corrigé si le client a payé autre chose » (280 sur 300) fixe volontairement ce comportement, et la doc 2.2-A dit « modifiables si le client a payé une autre somme » : les deux phrases de la doc se contredisent. À arbitrer avec Jérôme (par exemple : si le montant reçu est plus petit, proposer de créer une ligne pour le reste).

### A-06 · On peut créer une facture à 0 € alors que la règle exige « supérieur à zéro »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : la vérification regarde le montant *avant* l'arrondi au centime. Un montant comme 0,004 passe la vérification puis est arrondi à 0. La facture « à 0 € » bloque ensuite la clôture, et ne peut pas être marquée payée avec son montant proposé (0 est refusé), il faut la corriger ou la supprimer.
- **Ce que ça change pour Jérôme** : cas très improbable à la main (il faut taper moins d'un demi-centime), mais possible par un agent via le MCP ; la ligne « Facture de 0 € » est déroutante.
- **Où dans le code** : `js/modules/projets/logique.js:233` (contrôle `montant > 0` avant arrondi) et `:260`, `:281`, `:299` (arrondi après)
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` / test B33 (« montant > 0 obligatoire »).
- **Preuve** : essai `sonde1.mjs` : `ajouterFacture` avec 0.004, "0,004" et 1e-7 → aucune erreur, `montant: 0`; puis `terminerProjet` répond « Clôture bloquée : … Facture de 0 € (0 €) ».

### A-07 · Des dates impossibles (31 février) sont acceptées pour un projet, une facture ou une tâche
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : le contrôle de date (`estJour`) vérifie la forme AAAA-MM-JJ puis `Date.parse`, qui accepte `2026-02-31` (et `2026-04-31`). La même faiblesse est dans le serveur MCP (`jourValide`). L'écran est protégé par le sélecteur de date du navigateur, pas le serveur.
- **Ce que ça change pour Jérôme** : un agent peut écrire une date de fin ou d'envoi qui n'existe pas ; les comparaisons de retard restent presque justes, mais l'affichage et les délais des modèles (début + N jours) peuvent décaler d'un mois.
- **Où dans le code** : `js/modules/projets/logique.js:51` (`estJour`) ; `functions/src/coeur/metier.js:54` (`jourValide`)
- **Règle ou décision concernée** : `docs/cadrage-projets.md` 4 (« dates AAAA-MM-JJ »).
- **Preuve** : essai `sonde1.mjs` : `validerProjet({ dateDebut: '2026-02-31' })` et `'2026-04-31'` → `{}` (aucune erreur) ; `sonde4.mjs` : `planCreerTache` avec `date: '2026-02-31'` → aucune erreur ; `sonde5.mjs` : `validerFacture` avec `dateEnvoi: '2026-02-31'` → `{}`. `2026-13-01` et `2026-00-10` sont bien refusés.

### A-08 · Les tâches : la modification ne contrôle pas les champs, et une tâche peut se retrouver sans phase (invisible)
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `planMajTache` écrit tout ce qu'on lui donne (`fait`, `projetId`, `ordre`, et une phase vide `''` ou un assigné vide `''` passent la validation). Une tâche dont la phase est vide ou inconnue n'apparaît dans aucune des quatre listes de la fiche (la liste est construite phase par phase), alors qu'elle est comptée dans l'avancement du projet et peut remonter dans l'Accueil. Même famille : `nouvelleTache` garde une heure sans date (l'outil MCP `ajouter_tache_projet` permet de la donner), alors que la doc dit « pas d'heure sans date ».
- **Ce que ça change pour Jérôme** : aujourd'hui l'écran n'envoie jamais ces valeurs, donc rien ne se voit ; mais le jour où un agent ou un nouvel écran appellera cette règle, une tâche pourrait disparaître de la fiche en gardant son poids dans « 3 / 5 tâches ».
- **Où dans le code** : `js/modules/projets/logique.js:473-481` (`planMajTache`), `:429-435` (`tachesParPhase`), `:438-451` (`nouvelleTache`, ligne 445 pour l'heure)
- **Règle ou décision concernée** : `docs/projets-etape-4.md` (« Pas de tâche sans projet, pas d'heure sans date »).
- **Preuve** : essai `sonde4.mjs` : `planMajTache(patch { phase: '' })` → patch accepté ; `patch { fait: true, projetId: 'autre', ordre: -5 }` → accepté tel quel ; tâches de phase `distribution`/vide → `visiblesParPhase: [1,0,0,0]` pour 3 tâches, avancement `total: 3`. `sonde5.mjs` : tâche créée avec `heure: "10:00"` et `date: null`. Latent aujourd'hui (aucun appelant n'envoie ces valeurs) d'où MINEUR.

### A-09 · Supprimer une facture payée ou un projet efface des euros encaissés, sans le dire dans la confirmation
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : les factures vivent dans le projet. Supprimer une facture payée, ou supprimer le projet, retire ces encaissements du chiffre d'affaires du mois du paiement. La fenêtre de confirmation d'une facture dit seulement « sera retirée du projet » ; celle d'un projet parle de tâches, notes et événements, jamais des factures ni des euros encaissés, et ajoute « L'affaire liée n'est pas touchée ».
- **Ce que ça change pour Jérôme** : l'objectif « chiffre d'affaires encaissé » et le graphique baissent d'un coup. Pour une facture supprimée seule, la ligne « Encaissement » reste dans le fil du projet alors que la facture n'existe plus (le fil et la liste ne racontent plus la même chose) ; pour un projet supprimé, ses événements d'encaissement partent avec lui. Il peut rétablir par le Journal (restauration), mais rien ne l'avertit avant.
- **Où dans le code** : `js/modules/projets/factures.js:109-112` (`retirer`), `js/modules/projets/projets.js:120-136` (`demanderSuppressionProjet`), `js/modules/projets/logique.js:1013-1028` (`planSupprimerProjet`)
- **Règle ou décision concernée** : `docs/projets-etape-1.md` (suppression d'un projet : tâches et fil supprimés ; rien sur les factures) ; `docs/cadrage-projets.md` (« l'archivage est la voie normale »).
- **Preuve** : essai `sonde3.mjs` : chiffre d'affaires d'octobre = 2000 avec un projet qui a une facture payée de 2000, = 0 une fois le projet retiré. Le comportement « supprimer efface le fil du projet » est lui voulu par la doc (étape 1).

### A-10 · Glisser une carte dans « Clôture » ne termine pas le projet
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : déposer une carte dans la colonne Clôture (ou cliquer « Clôture » dans la barre des phases) change seulement la phase : le projet reste « Actif », n'est pas archivé, ne déclenche ni extraction ni célébration. Pour un projet « En pause », il reste en pause. Seul le bouton « Terminer » termine vraiment. Le blocage par les factures, lui, s'applique bien aux deux gestes.
- **Ce que ça change pour Jérôme** : on peut croire un projet fini parce qu'il est dans la colonne Clôture, alors qu'il reste dans le tableau, sans extraction créée.
- **Où dans le code** : `js/modules/projets/logique.js:120-137` (`changementPhase`) ; `js/modules/projets/projets.js:65-70` et `:321-327` (dépôt de carte) ; `js/modules/projets/fiche-projet.js:32-39`
- **Règle ou décision concernée** : `docs/projets-etape-1.md` (« terminer (Clôture, Terminé, archivé) » comme geste distinct) ; `docs/projets-facturation-2-2-a.md` (la Clôture est bloquée aussi « par le déplacement d'une carte vers la phase Clôture », sans dire que la carte termine le projet). Le texte ne tranche pas l'intention : à confirmer avec Jérôme.
- **Preuve** : essai `sonde1.mjs` : `changementPhase(projet, 'cloture')` → `phase: "cloture"`, `statut: "actif"`, `archive: false`, un seul événement `phase_changee` ; projet en pause → `phase: "cloture"`, `statut: "en_pause"`.

### A-11 · Migration en plusieurs lots : un échec en cours de route peut créer une facture en double au deuxième essai
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE
- **Ce qui se passe** : les écritures d'une migration sont envoyées par paquets de 130 écritures (`ACTIONS_PAR_LOT`) ; chaque paquet est atomique mais pas l'ensemble. Pour chaque affaire, le plan écrit d'abord la facture sur le projet, puis le changement d'étape de l'affaire. Si la coupure tombe entre les deux (un paquet réussi, le suivant refusé), l'affaire reste en « Facture envoyée » alors que sa facture existe déjà ; au relancement, une seconde facture identique est ajoutée.
- **Ce que ça change pour Jérôme** : la promesse « idempotente, se restaure d'un coup » n'est tenue que si tout tient dans un seul paquet ; avec beaucoup d'affaires, une panne réseau pourrait laisser un état à moitié migré. Nombre d'affaires concernées : non vérifié (donc risque non chiffré).
- **Où dans le code** : `js/modules/crm/donnees.js:176-197` (`executer`, découpage en lots) ; `js/modules/projets/logique.js:367-373` (ordre des écritures) ; `js/modules/projets/donnees.js:292-296`
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-b.md` (« Une seule opération d'audit : la migration se restaure d'un coup. Elle est idempotente »).
- **Preuve** : lecture du code uniquement, non reproduit (il faudrait simuler un échec du deuxième paquet sur l'émulateur). J'ai bien vérifié que rejouer le même plan sur un état à jour ne fait rien (`sonde3.mjs` cas M3 : 0 écriture au deuxième passage, 1 seule facture), et que deux plans calculés sur le même état de départ n'ajoutent pas deux factures (le tableau est remplacé, cas M3b).

### A-12 · Les factures sont une liste unique dans le projet : deux modifications simultanées peuvent s'écraser
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE ; essai du 2026-10-08 : NON REPRODUIT (voir `09-confirmations.md`)
- **Ce qui se passe** : ajouter, modifier ou payer une facture réécrit la liste `factures` entière du projet, calculée à partir de la copie lue juste avant. Si l'écran et un agent MCP (qui lit puis écrit de son côté) modifient le même projet à quelques secondes d'écart, la dernière écriture peut effacer l'ajout de l'autre.
- **Ce que ça change pour Jérôme** : une facture ajoutée par Hermes pendant que Jérôme en marque une autre payée pourrait disparaître sans trace visible (l'événement du fil resterait, mais pas la ligne de facture).
- **Où dans le code** : `js/modules/projets/logique.js:267`, `:286`, `:302` (patch = tableau complet) ; `functions/src/coeur/metier.js` (`ajouterFacture`, lecture puis écriture)
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` (« Les factures sont stockées dans le projet (champ `factures`) »).
- **Preuve** : lecture du code uniquement, non reproduit. Le risque est faible tant que Jérôme est seul et qu'Hermes n'est pas branché (`docs/reprise-prochaine-session.md` : pas encore configuré).

### A-13 · Le réglage « Délai de paiement » est encore dans Réglages (et encore passé au calcul), alors qu'il n'y a pas de délai
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE
- **Ce qui se passe** : la section « Délai de paiement » (30 jours par défaut, de 1 à 365) reste modifiable, avec la mention « Plus utilisé depuis la 2.2 ». Le paramètre est toujours transmis à `suggestionPourEtape`, qui ne s'en sert plus.
- **Ce que ça change pour Jérôme** : un réglage qui ne fait rien, et qui laisse croire qu'un délai existe, alors qu'il a décidé « pas de délai de paiement ».
- **Où dans le code** : `js/modules/crm/reglages.js:52-58` et `:223` ; `js/modules/crm/logique.js:590` (paramètre inutilisé) et `:654` ; `js/modules/crm/donnees.js:68`
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md` (« pas de délai de paiement ») ; `docs/projets-facturation-2-2-b.md` (« reste dans Réglages mais n'est plus utilisé » : la doc le dit donc, c'est voulu pour l'instant).
- **Preuve** : lecture du code : le paramètre `delaiPaiementJours` n'est lu nulle part pour calculer quoi que ce soit (`grep` sur `js/` et `functions/src/`). Non vérifié à l'écran.

### A-14 · Trois docs de projets disent encore « à faire » ou « à valider » pour des choses déjà décidées ou construites
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : `docs/projets-etape-7.md` (« la sortie en cas d'impayés reste à valider avec Jérôme » et « Outils MCP des projets : chercher, créer, changer de phase, terminer » en « à faire ») ; `docs/projets-facturation-2-2-b.md` (« À décider : archiver automatiquement l'affaire quand son projet est clôturé » alors que `docs/reprise-prochaine-session.md` indique que Jérôme a décidé que non, il archive à la main ; et « Les outils MCP des projets (factures comprises) viendront ensuite » alors qu'ils sont construits) ; `docs/cadrage-projets.md` garde en tête l'avertissement « Rien de l'écran Projets ni de l'extraction n'est construit ».
- **Ce que ça change pour Jérôme** : une session neuve qui lit ces fichiers pourrait reproposer ou refaire des choses déjà réglées (par exemple l'archivage automatique d'une affaire gagnée).
- **Où dans le code** : sans objet (documentation) : `docs/projets-etape-7.md` (section « À faire ensuite »), `docs/projets-facturation-2-2-b.md` (sections « Côté serveur MCP » et « Ensuite »), `docs/cadrage-projets.md:3`
- **Règle ou décision concernée** : `docs/reprise-prochaine-session.md` (« une affaire Gagnée n'est **pas** archivée automatiquement » ; « le chantier Projets est terminé »).
- **Preuve** : les phrases citées ci-dessus, relues dans les fichiers. Le code, lui, respecte la décision (voir la liste « Vérifié et conforme »).

### A-15 · La date du jour est « figée » dans la liste des tâches d'une fiche laissée ouverte
- **Gravité** : MINEUR
- **Confiance** : PLAUSIBLE ; essai du 2026-10-08 : non testable ici (voir `09-confirmations.md`)
- **Ce qui se passe** : `sectionTaches` lit « aujourd'hui » une fois, quand la fiche est dessinée, et s'en sert pour les badges « En retard » / « Aujourd'hui ». Passé minuit à Paris, si la fiche reste ouverte sans qu'aucune donnée ne change, les badges restent ceux de la veille jusqu'au prochain rafraîchissement. (Le calcul lui-même est juste : il utilise bien le fuseau Europe/Paris.)
- **Ce que ça change pour Jérôme** : un badge peut afficher « Aujourd'hui » pour une tâche qui est déjà en retard, s'il laisse la fiche ouverte la nuit.
- **Où dans le code** : `js/modules/projets/taches.js:60` (constante figée), à comparer avec `js/modules/projets/projets.js:26` et `factures.js:11` qui relisent la date à chaque appel
- **Règle ou décision concernée** : `docs/projets-etape-4.md` (retard d'une tâche).
- **Preuve** : lecture du code uniquement, non reproduit.

## Vérifié et conforme
- **Décision « une affaire Gagnée n'est pas archivée automatiquement »** : aucun chemin du code n'archive une affaire au passage en Gagné (`changementEtape` écrit `archive: false`, le seul `archive: true` côté projets est celui de la fin du projet et du rangement d'une extraction). La migration garde l'archivage existant des anciennes « Facture payée ». Recherche sur `archive: true` dans `js/modules/crm`, `js/modules/projets` et `functions/src`.
- **Une facture se paie en entier / pas de délai de paiement / statuts À payer, Payée, Abandonnée** : trois statuts exactement (`STATUTS_FACTURE`), aucun mécanisme de rappel ou d'échéance dans le module Projets ; le chiffre d'affaires encaissé ne compte que les factures « payées » (test B34, relu dans `crm/logique.js:1136-1140`), dans le mois du paiement (date civile saisie, pas de risque de fuseau).
- **Clôture bloquée par une facture « à payer »** : bien appliquée à « Terminer », au déplacement vers la Clôture, et côté MCP (`terminer_projet`, `changer_phase_projet`) ; message nommant les factures ; sortie « clôturer avec impayé » avec raison obligatoire, factures restantes abandonnées, projet terminé, extraction créée une seule fois ; facture abandonnée seule = rien ne bloque (tests B33 + essais `sonde1.mjs`).
- **Projet sans facture, ou tout payé, ou tout abandonné** : se clôture sans blocage. **Projet en pause puis « Terminer »** : possible, donne bien `termine` et `archive` (essai `sonde1.mjs`). **Plusieurs factures** (30/30/40) : totaux justes, fusion de plusieurs factures sur un même projet à la migration sans écraser la première (test B35).
- **Extraction de valeur** : créée à Perdu (avec la raison), à la fin du projet, à Gagné sans projet ; rangée (archivée) quand le projet est créé ou lié et qu'aucune tâche n'est faite ; jamais de boucle (terminer une extraction ne crée rien) ; une seule par source (affaire : perdre deux fois, rouvrir puis gagner ; projet : réouvrir puis terminer deux fois, ou bouton « Extraire la valeur » puis « Terminer ») ; l'extraction n'est jamais « le projet » de l'affaire. Essais `sonde2.mjs` scénarios A, B et C. Remarque (pas un défaut) : à chaque Gagné sans projet, une extraction est créée puis rangée dès que le projet est créé ; c'est le choix de Jérôme du 06/10/2026 (`docs/projets-etape-6.md`).
- **Modèles de projet** : Audit (3 tâches sans date), Accompagnement (1 tâche), Extraction (4 tâches à J+7) conformes à `docs/cadrage-projets.md` 3.4 ; création des modèles de départ avec identifiants fixes et repère `crm_parametres/modeles_projet` (pas de doublon, pas de recréation si Jérôme les supprime) ; l'extraction retombe sur la copie livrée si le modèle de la base a disparu.
- **Tâches** : ajout (à la fin de la phase), ordre (Monter / Descendre remet 1, 2, 3 et n'écrit que les places qui changent, même avec deux tâches de même rang : essai `sonde4.mjs`), déplacement vers une autre phase (à la fin), cocher/décocher avec événement, suppression d'un projet qui supprime ses tâches et seulement les siennes.
- **Avancement et retard** : pas de division par zéro (0 tâche → 0, et le cercle n'est pas affiché) ; un projet terminé, archivé ou en pause n'est jamais « en retard » ; fin prévue dépassée ou tâche non faite datée passée → rouge ; il n'existe pas de statut de tâche « annulée » (donc rien à exclure). **Fuseau Europe/Paris** : `aujourdhuiParis` est utilisé partout (essai `sonde4.mjs` : 23 h 30 UTC le 15 octobre → « 2026-10-16 » à Paris, tâche du 15 en retard ; passage à l'heure d'hiver du 25 octobre correct).
- **Liens projet / affaire** : au plus un projet par affaire (les deux côtés écrits dans le même plan), seule une affaire « gagnée » peut en avoir un, projet archivé non liable, supprimer une affaire ou une personne ou une organisation garde le projet et vide le lien (tests B25, relus dans `crm/logique.js:1446-1460` et `:1590-1598`), supprimer un projet détache l'affaire et laisse les extractions orphelines mais gardées.
- **Migration 2.2** : aperçu avant écriture, « facture payée » → Gagné avec encaissements et archivage conservés, « facture envoyée » avec projet et montant → facture « à payer » reprenant la date d'envoi, sans projet / sans montant / projet d'extraction → « à traiter à la main » (aucun projet créé à la place de Jérôme), idempotente quand elle va au bout d'un seul paquet (essai `sonde3.mjs` cas M3 : 0 écriture au deuxième passage).
- **Export JSON complet** : contient bien `projets_projets`, `projets_taches` et `projets_modeles` (`js/modules/crm/donnees.js:20-23`).
- **Tests existants** : 283 tests de `logique.test.js` et `projets.test.js` passent (lancés dans cette session).
