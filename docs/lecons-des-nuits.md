# Leçons des nuits et des journées de codage

Déplacées de `CLAUDE.md` le 15/11/2026, à la demande de Jérôme : ce fichier faisait 47 166 octets, dont plus de la moitié de leçons, rechargées à chaque début de session. Le texte est repris tel quel, sans changement de fond ; seuls les titres passent d'un niveau. Les renvois « voir plus haut » visent `CLAUDE.md`. Les pièges qui coûtent le plus cher restent résumés dans `CLAUDE.md`.

**À lire en entier avant un « GO NUIT », avant une PR sensible (serveur, règles, données, menus, navigation) et avant de lancer des sessions de code en parallèle.**

## Leçons de la première nuit (21 au 22/10/2026)
- La coche de PR (« rapide + smoke + parcours de la PR ») ne lance **pas** les anciens parcours : avant de retirer ou déplacer un élément d'écran, chercher par `grep` dans `tests/e2e/` les tests qui lisent son sélecteur (la PR 160 a cassé K2 et I3 en retirant « + Personne » de l'Accueil) et les adapter dans la même PR.
- `TESTS_DECALAGE` : jamais 2 (port 10080 interdit par le navigateur) ni 7 (le test de ports l'impose) ; voir `docs/tests.md`, « Pièges connus ».
- Entre 22 h et minuit UTC, P1 (`corrections-dossiers-2`) et C12 (`parcours`) échouent sur `main` aussi : ne pas chercher l'erreur dans la PR, relancer après minuit UTC.
- Une PR en brouillon ne peut pas être armée en auto-merge : la passer en « prête » d'abord ; si toutes les vérifications sont déjà vertes, fusionner directement.
- Les sous-agents travaillent chacun dans un répertoire de travail isolé (`isolation: worktree`) sur une branche locale ; seule la session principale pousse, une PR à la fois, sur la branche désignée de la session ; relecture Fable avant la fusion de chaque PR (sauf petites retouches d'interface, voir plus haut) ; chaque nouvelle PR fusionne d'abord `origin/main`.

## Leçons de la deuxième nuit (22 au 23/10/2026)
- Une branche poussée sur le nom de la session écrase la PR précédente tant qu'elle n'est pas fusionnée : **une PR à la fois**, ne pousser la suivante qu'après la fusion (vérifier `merged` avant).
- Chaque nouvelle PR fusionne d'abord `origin/main` ; les ajouts « une ligne » dans `js/main.js`, `js/os/espace.js` et `tests/package.json` (liste `test:logique`) provoquent des conflits à résoudre **en gardant toutes les lignes**.
- Une coche rouge sans test en échec (émulateur Firestore qui s'arrête au démarrage) : relancer une fois (`rerun_failed_jobs`) avant de chercher.
- Une relecture Fable des briefs avant l'envoi a trouvé des erreurs à chaque fois (dépôt local en retard, lignes inexactes, collisions entre PR) : la garder.
- Données de Jérôme modifiées pendant la nuit : seulement avec son accord écrit dans la session, avec les outils MCP, après la fusion du code, sans rien écrire dans le dépôt public (ni noms ni phrases).

## Leçons des 5e et 6e nuits « GO NUIT » (22 au 23/10/2026, suite des leçons ci-dessus)
- La coche de PR ne lance **pas** `look-compact` (taille ou poids de texte en dur) : toute PR qui touche du CSS lance `npm run test:module look-compact` avant l'ouverture (la PR du badge l'avait fait rougir sans le voir).
- Le hook « commit non poussé » est un faux positif juste après la recréation de la branche de session depuis `main` : pousser la branche (identique à `main`) le calme, sans rien publier.
- Fable a une limite d'usage : si elle est atteinte, la relecture attend la levée, la fusion de la PR concernée aussi (jamais de « non relue par Fable » sans le dire).
- Les captures de recette régénérées par le bac à sable se rendent un peu différemment : ne committer que celles du dossier de la PR en cours.

## Leçons du 23/10/2026 (journée après les nuits)
- **Tout nouveau test d'écran se lance aussi en format téléphone** (`--project=telephone`) avant la PR : la coche de PR ne le fait pas (quatre tests n'ont été vus rouges que par la suite de nuit). Un test qui ouvre le tiroir du menu le referme (Échap) avant de cliquer ailleurs.
- Après une série de PR qui touchent l'interface, **relancer la suite de nuit à la main** sur `main` (workflow « Tests de nuit ») pour savoir s'il reste du rouge, sans attendre la nuit.
- Un test instable ne se prouve pas corrigé par un seul passage vert : le dire dans la PR.
- La relecture Fable de chaque brief et de chaque PR de la liste « obligatoire » reste la règle (les petites retouches d'interface en sont dispensées) ; un sous-agent qui se réveille sans fin (tâche de fond) est arrêté (`TaskStop`) une fois son travail fusionné.
- Mode d'emploi pour Jérôme : `docs/fonctionnement-du-travail.md` ; bouton qui lance un workflow : `docs/ajouter-un-bouton-workflow.md` ; déploiement chez un client : `docs/deploiement-client.md`.

## Leçons de la nuit du 11 au 12/11/2026 (tests, goulot d'étranglement)
- **Le palier complet se déclenche selon les fichiers touchés** (`firestore.rules`, serveur, menus) ; une PR qui ne touche que des tests ou du CSS ne passe que le « rapide ». Conséquence : du rouge peut rester caché sur `main` après des PR fusionnées au palier rapide (les PR 578, 581 et 582 ont laissé les menus, le Journal et une liste blanche rouges, vus seulement par la PR 590).
- **Après chaque fusion d'écran ou de menu, lancer « Tests de nuit » sur `main`** et réparer le rouge avant d'ouvrir la PR sensible suivante : sinon elle porte les échecs des autres. Un menu qui gagne une entrée = `grep` des décomptes (« 9 entrées ») dans `tests/e2e/` avant la PR.
- **Grouper les changements sensibles** (règles, serveur, secrets) en une seule PR plutôt que trois petites : chaque PR sensible relance le palier complet et la file d'attente GitHub s'allonge. Les petites PR (tests, CSS, textes) restent à part, elles passent le rapide.
- **Avant le push d'une PR sensible, lancer en local les specs navigateur de la zone touchée** (menu, Journal, `mode-test-creation`, `consignes-ui`), pas seulement `test:module` et `test:rapide`.
- **Un seul push par correction** : chaque push relance les tests ; corriger tout d'un coup. Poser l'étiquette `tests-complets` AVANT de mettre la branche à jour (un seul lancement).
- **Sur « rouge », comparer d'abord avec `main`** (« Tests de nuit » récents) : si les mêmes tests y sont rouges, la cause n'est pas la PR ; corriger dans une PR à part.
- **Ne jamais commiter de captures** générées par les tests (un agent en a poussé 89 : second commit pour les retirer).

## Leçons de la 3e nuit et des sessions séparées (28 au 29/10/2026)
- **Un brief se vérifie contre le code avant l'envoi** : sur cette nuit, la relecture Fable a trouvé des briefs faux (outils MCP « à brancher » alors que les 16 outils Devis l'étaient déjà ; `lienStablePdf` sans aucun consommateur ; `exigerStatut` inexistant dans la transaction). Avant de promettre un chantier, `grep` ce qui existe déjà : le bon résultat est parfois « tests de verrouillage + doc » ou « ne pas faire ».
- **Faux rouges** : un push annule le lancement précédent de « Tests » (croix rouge « annulé »), et ajouter une étiquette relance les tests. Avant de chercher une erreur, ouvrir la liste des lancements et regarder si le rouge est un lancement annulé. `get_job_logs` : `failed_only` exige un `run_id` ; utiliser `return_content` + `tail_lines`.
- **Changer un comportement ou une liste = chercher les tests qui la lisent** : la liste des collections exportées (C19) et « finaliser sans affaire » ont rendu rouges `parcours`, `devis-barre-globale` et `devis-document`, vus seulement par le palier complet que déclenche `firestore.rules`. Avant d'ouvrir la PR : `grep` dans `tests/e2e/` des sélecteurs, des listes et des essais qui finalisent un devis.
- **Une PR laissée ouverte pour Jérôme dérive** : la PR 369 est passée de « sans conflit » à 12 fichiers en conflit en quelques heures (dictionnaire fusionné entre-temps). Avant de dire « prête », vérifier `mergeable` sur la dernière version de `main` ; si elle a dérivé, résoudre en gardant les deux côtés, compter à nouveau les outils et les listes en lançant les tests (jamais à l'estime), et ne la faire fusionner qu'après « résolue et verte ». La résolution de conflits touche au serveur : relecture Fable.
- **Agents en parallèle** : jamais `kill` d'un processus qui n'est pas le sien (un agent a arrêté le serveur de test d'un autre) ; un `TESTS_DECALAGE` différent par agent ; un agent isolé (`isolation: worktree`) ne pousse pas, la session principale pousse.
- **Une seule PR de docs par session**, ou la docs dans la PR de code ; jamais une PR de docs par petite étape (décision de Jérôme, 29/10/2026 : chaque PR relance les tests, chaque fusion sur `main` redéploie le site, et il attend). Pas de pushes répétés sur une PR ouverte, pas d'étiquette pendant que les tests tournent. Piste à traiter (workflow, Fable obligatoire) : ne pas redéployer Hosting pour une fusion qui ne touche que `docs/`, après avoir vérifié que `wiki/` n'est pas servi par le site.
- **Sessions séparées** : la session principale est la colonne vertébrale (décisions, tableau `.github/A-FAIRE.md`) ; un travail long ou isolé se fait dans une session séparée avec le script de `docs/script-de-reprise.md`, un seul sujet, un message `send_message` à la session principale à chaque étape (sans secret). Jamais deux déploiements en même temps ; Jérôme lance les workflows de déploiement un par un ; les clics de console se donnent avec le lien exact.
- **Retirer un réglage** (ex. « Étape où vivent les devis ») : `setDoc` sans fusion peut ressusciter l'ancienne valeur ; prévoir le motif de recopie et ne rien effacer en base.
- **Bac à sable de Claude** : `apis.google.com` est injoignable, donc certains parcours de fiche d'affaire n'y finissent pas ; le dire dans la PR, la coche GitHub fait foi.
- **Valeurs par défaut prises seul** : écrire « Décision prise seul : … » dans la PR et dans le tableau, avec la question restante pour Jérôme, pour qu'il corrige sans chercher.

## Leçons de la nuit du 30 au 31/10/2026
- **Ne jamais compter sur une notification** pour savoir qu'une session ou un lancement a fini : armer un rappel programmé et relire le résultat soi-même. Avant de dire « j'attends », relire le dernier résultat.
- **Une session de code bloquée note la PR qui la bloque** (dans son message à la session principale).
- **Un brief et une conception se vérifient contre le code** : cette nuit, un brief À/CC avait des noms inexistants et touchait le serveur à tort ; la relecture de la conception du logiciel de facturation a montré que le choix « n8n ne reçoit que des identifiants » était verrouillé par un test (`tests/devis-email-sortie.test.js`).
- **Ne jamais mêler, dans une discussion de conception, les nouvelles des autres sessions** (demande de Jérôme).
- **Économiser Fable** : relecture seulement pour le serveur, les données, les règles, et les briefs ou conceptions qui touchent le code.
- **PR de docs : une seule** par session (voir plus haut).
- **La porte de n8n existe aussi chez les clients depuis la PR 463 (31/10/2026)** (`functions-plateforme/src/porte.js`, même logique que chez Jérôme). Ce qui reste vrai : un client n'est branché que si SES secrets (`N8N_DEVIS_EMAIL_URL_<client>` / `N8N_DEVIS_EMAIL_SECRET_<client>`) et SON workflow (nom `client-<id>-…`, étiquette `client-<id>`) existent ; sinon « Préparer l'e-mail » reste grisé (« La préparation de l’e-mail n’est pas encore branchée sur cet espace »). La facturation n'utilise plus n8n (31/10) : `docs/cadrage-logiciel-facturation.md`. (Ligne corrigée le 08/11/2026 : elle disait « n'existe pas ».)

## Leçons de la journée et nuit du 31/10/2026
- **« Tests de nuit » (`tests-nuit.yml`) teste TOUJOURS `main`** (checkout `ref: main` en dur) : le lancer « sur une branche » ne teste PAS la branche. Pour valider une PR AVANT fusion : poser l'étiquette `tests-complets` (palier complet de `tests.yml`) puis lire la coche « Tests » ; poser l'étiquette AVANT de mettre la branche à jour (un seul lancement). Après chaque fusion d'écran ou de serveur : lancer « Tests de nuit » sur `main` et lire le résultat (la PR 466 a laissé 4 tests de menus rouges sur `main`, corrigés par la PR 476).
- Une PR en conflit (`mergeable_state: dirty`) ne lance AUCUN test : résoudre d'abord (fusionner `main`, garder toutes les lignes des listes de `tests/package.json`).
- Une session de code peut rester inactive avec un travail non poussé (la session des champs manquants : 50 minutes) : polling toutes les 15 minutes (`send_later` enchaîné + filet horaire), lire l'état de chaque session, relancer ou remplacer.
- Un brief se vérifie contre le code par un agent Fable avant l'envoi (confirmé encore cette nuit, et le 01/11 : 4 briefs sur 4 avaient encore des erreurs ; « 10 messages » étaient 13 et touchaient le serveur ; « réglage de modèle d'e-mail » n'existait pas ; adresses de la fiche : déjà fait à 80 %).
- Voie « Docs » (PR 470) : une PR qui ne touche que `docs/`, `wiki/`, `README.md`, `CLAUDE.md`, `PROMPT-CONSTRUCTION.md`, `.github/A-FAIRE.md` lance le job `Docs` (≈ 1-2 min) ; une fusion de docs seules ne redéploie plus le site.
- La facturation n'utilise plus n8n (décision du 31/10) : la porte n8n chez les clients (PR 463) reste utile pour « Préparer l'e-mail », les propositions et la veille.

## Leçons de la journée du 06/11/2026 (suite)
- **Décision de Jérôme** : le portail devis seul est un **mode d'affichage de la coque**, jamais un module ni un espace séparé ; le client final n'y a jamais accès.
- **Un brief se vérifie contre le code** : le brief des en-têtes de colonne avait oublié une partie de la demande (complément arrivé trop tard) ; renvoyer le complément au même agent et attendre sa nouvelle réponse.
- **PR de navigation (portail)** : deux relectures Fable, la seconde sur le delta. Elle a trouvé une icône inexistante que les tests ne voyaient pas (`icone()` rend un svg vide si le nom n'est pas dans `ICONES` : le verrouiller par un test statique) et un lien construit à partir de l'adresse tapée (toujours vérifier : commence par `#/`, identifiant validé).
- **Une session de code ne pose jamais l'étiquette `tests-complets` et ne pousse pas plusieurs fois** (un push annule et relance) : regrouper les corrections de relecture en UN push, en fusionnant `main` dans le même push.
- **Une PR qui touche les mêmes fichiers qu'une autre passe APRÈS** : la 541 a eu un conflit après la 540, résolu en gardant les deux côtés.
- **« Tests de nuit » 112 et 115 rouges pour une seule capture** d'un bloc redessiné (test 1.2 des familles) : cause lue seulement au 115, corrigée par la 539. Lire la cause dès le premier rouge.
- **Un devis « Archivé » compte toujours dans le montant** : l'écran doit le dire (étiquette, PR 540).

## Leçons de la nuit du 09 au 10/11/2026
- **Un brief se vérifie par Fable ET par grep avant l'envoi** (encore 4 erreurs trouvées sur 2 briefs) : « le schéma allégé refuse » était faux (le SDK retire les champs inconnus sans erreur) ; « bug `lister_devis` dans `outils/lecture.js` » : le code ne dépend pas du profil, donc **un bug signalé qu'on ne reproduit pas se garde comme test verrou, on n'invente pas de correctif** (la cause est dans les arguments du bot n8n) ; un plafond « à ajouter » existait déjà ; un fichier de docs n'était pas sur `main`.
- **Un plafond ajouté côté écran peut faire disparaître du PDF un logo que « Mon espace » accepte** (plafonds différents : 2 Mo d'octets contre 1,5 M caractères) : vérifier le chemin réel de la donnée avant d'aligner deux limites.
- **En Devis seul (socle seul), `crm_parametres` n'est pas lu** : toute écriture qui part d'une liste lue dans cet état (étiquettes, secteurs, sources) ÉCRASE les listes déjà en base ; masquer le champ plutôt que l'écrire.
- **Le profil allégé d'un outil ne doit pas être strict** : un champ technique ajouté par le client MCP du bot aurait tout cassé ; refuser seulement ce qui doit l'être (`lignes`, `sections`) et tolérer le reste comme sur `main`.
- **Le poids du bot vient surtout de sa MÉMOIRE** (30 messages ≈ 17 000 tokens à chaque appel), pas des descriptions d'outils : mesurer avant d'optimiser, lire l'exécution n8n (`get_workflow_execution` avec `nodeNames`, puis `python3` sur le fichier de résultat, jamais à l'écran).
- **Sessions de code en parallèle** (5 sessions, `TESTS_DECALAGE` 3 à 6, un seul push chacune) : zéro collision ; les briefs disent « ne touche NI `docs/` NI `wiki/` » pour éviter les conflits sur le wiki (la PR de docs de fin de nuit les régénère une fois). Une session qui ouvre sa PR envoie son numéro, la session principale relit (Fable : serveur, données, nouvel écran), renvoie les bloquants en UN message, et arme l'auto-merge quand c'est corrigé.
- **Écart à une décision de Jérôme écrite (ex. la garantie du 29/10)** : la PR le dit dans « Décision prise seul », reste en brouillon sans étiquette et attend son accord ; ne jamais la fusionner de nuit.

## Leçons de la journée du 01/11/2026
- Confirmé à nouveau le 01/11 (leçons déjà écrites plus haut) : le palier de PR ne lance pas tous les parcours, donc « Tests de nuit » sur `main` après chaque fusion d'écran, runs 79 à 83 verts (79 = #490, 80 = #495, 81 = #496, 82 = #497, 83 = #498) ; un lancement « Tests » rouge peut être un lancement annulé.
- **Webhook n8n d'un client** : le nom commence par `client-<id>-` ET l'étiquette `client-<id>` est posée, sinon la porte répond 403 `workflow_refuse` (recette : `docs/deploiement-client.md`).
- **`maintenant = Date.now` passé sans l'appeler** donne `new Date(fonction)` invalide, Firestore refuse, et les tests avec un nombre fixe ne le voient pas (PR 493, « Préparer l'e-mail » cassé chez les clients). `functions-plateforme/src/devis.js` accepte maintenant un nombre ou une fonction.
- **Diagnostiquer une fonction** : `gcloud logging read` sur son service. Jamais les données d'exécution n8n (les en-têtes contiennent le secret).
- **L'e-mail depuis l'assistant d'un client passe par `mcp-clients@`, pas par le compte de l'écran** : deux comptes de service, deux droits « Accesseur de secrets » sur les deux secrets.
- **Droits des assistants** : un profil OAuth (ChatGPT, Gemini, claude.ai) reçoit le profil `complet` (ancien nom `claude-code` ; `PROFIL_OAUTH`, `functions/src/oauth/config.js`) ; `finaliser_devis` (aperçu + code) leur est DÉJÀ ouvert. Profils depuis la PR 549 (07/11/2026) : `lecture`, `ecriture`, `complet`, et `agent-devis` (PR 550, liste blanche de 21 outils, par jeton seulement) ; les anciens noms `lecteur`, `bibliothecaire`, `claude-code` restent valables pour toujours comme alias (`ALIAS_PROFILS`, `functions/src/securite/jetons.js`). Le jeton d'Hermes est le seul jeton `ecriture` (bibliothécaire) connu (les porteurs sont dans le secret `MCP_JETONS`, hors dépôt : à vérifier là). Chez un client, rôle éditeur = `complet`, rôle lecteur = `lecture` (`PROFIL_PAR_ROLE`, `functions/src/clients/config.js`). Une première réponse « réservé à Claude Code » a été fausse : **vérifier le code avant de répondre sur les droits**.
- **Une session créée sans `source_url` n'a pas le dépôt** (`config:no-git-repo`) : toujours le passer.

## Leçons de la journée du 05/11/2026
- **`deploiement-plateforme.yml` = la plateforme des CLIENTS**, lancée avec l'accord de Jérôme ; le site de Jérôme se déploie TOUT SEUL à chaque push sur `main` (`firebase-hosting.yml`) : ne pas les confondre.
- **Une session de code a fusionné sa propre PR** alors que le brief disait que le parent fusionne : écrire toujours « tu ne fusionnes pas ta PR ».
- **Chaque brief se vérifie contre le code par un agent Fable, à chaque fois** : erreurs trouvées ce jour : `npm run test:module crm` inexistant, comptes d'outils faux (83 au lieu de 84), lignes citées décalées, fichier hors périmètre, « CA global » décrit comme fait alors que c'est un projet.
- **Un faux rouge « Tests » juste après la pose d'une étiquette** = le lancement précédent annulé : lire le run par son id avant de chercher.
- **Une PR en conflit (`dirty`) ne lance aucun test** ; mettre la branche à jour APRÈS la relecture Fable (sinon deux lancements, et la relecture porte sur un diff périmé).
- **Une PR de nuit qui supprime des données (525) = deux relectures Fable** : la seconde a validé le correctif d'un bloquant.
- **Relire son diff « en adversaire »** avec un jeu de données adversarial (reliés réels, `DEV-` marqué test, événements mixtes, ancienne donnée sans le nouveau champ). Consigne, pas un fait vécu.
- **Plafond du MCP : 50 suppressions par jour, par document** (une affaire = plusieurs documents) : les suppressions de données se planifient sur plusieurs jours.
- **`actions_list` d'un workflow rend 50 Ko** : lire UN run par son id (`mcp__github__actions_get`, `get_workflow_run`), ou lire la sortie par `python3` sur le fichier.
- **Un 503 de Google sur « Déployer les fonctions »** (`firebase-hosting.yml` l.43) saute le déploiement du site : relancer une fois (`rerun_failed_jobs`).
- **Décisions de Jérôme du 05/11 sur Devis seul** (voir la décision permanente) : socle commun, modules indépendants, deux portails, liste des devis en arrivée, Projets sans Affaires plus tard, recette sur `clientdemo`.

## Leçons de la journée du 06/11/2026
- **Décisions de Jérôme du 06/11** : finalisation conditionnelle confirmée, puis **annulée le 07/11** (voir ci-dessous) ; pas de socle sans module actif ; un `DEV-` marqué test n'est jamais supprimé en lot ; les événements d'une affaire de test partent avec elle ; restaurer un `DEV-` reste permis ; un client Devis seul marque et démarque un test par son assistant (`marquer_test` / `demarquer_test` dans `SOCLE.outilsMcp`, 9 outils, Devis seul = 2 + 26 + 9 = 37) mais `supprimer_tous_les_tests` reste dans Réglages > Mes tests ; vocabulaire : « test », jamais « essai ».
- **Décision de Jérôme du 07/11/2026 (option A) : finaliser un devis ne demande plus jamais d'affaire, nulle part** (chez Jérôme, chez un client avec Affaires, en Devis seul : un seul comportement). Un avertissement NON bloquant s'affiche seulement quand le module Affaires est actif : « Ce devis n'a pas d'affaire : il n'apparaîtra dans aucune fiche d'affaire ni dans son montant. Tu pourras lui choisir une affaire plus tard. » (`AVERTISSEMENT_SANS_AFFAIRE`, `js/modules/devis/logique.js`), dans le panneau des totaux, dans la fenêtre « Finaliser ce devis ? » et dans le champ `avertissement` de l'aperçu de `finaliser_devis` et de `lire_devis` (brouillon). Annule la finalisation « conditionnelle » du 06/11 (PR 526, option `affaireRequise` supprimée). PR 1 sur 2. **PR 2 faite (08/11/2026)** : « Choisir l'affaire » sur un devis finalisé sans affaire (sens unique, toutes les versions, montant recalculé dans la même transaction, restaurable, fonction `devisChoisirAffaire` chez Jérôme ET chez les clients) et filtre « Sans affaire » (rien en Devis seul) ; l'outil MCP viendra plus tard.
- **Sessions parallèles** : des sessions de code avec `TESTS_DECALAGE` 3, 4 et 5 ont tenu toute la journée sans collision.
- **Deux PR qui ajoutent un test du même nom** (R14-15 dans la 535, prévu aussi dans la 536) : la seconde renomme (R14-16) avant la fusion, jamais de doublon de nom dans un `describe`.
- **Une PR sans écart à son brief n'existe presque pas** : la 536 a dû lire aussi l'objet du devis pour que son test passe ; la PR écrit l'écart et la session principale le relit.


## Leçons de la journée du 07/11/2026 et de la nuit du 07 au 08/11
- **Deux relectures Fable sur chaque PR de navigation, d'e-mail, de sécurité ou de serveur** (547, 548, 549, 551, 552 ; trois sur la 553), la seconde sur le delta : elles ont trouvé à chaque fois des défauts que les tests ne voyaient pas (texte de relance sur un devis jamais envoyé, objet tronqué au milieu d'un emoji, client nommé `interne` qui donnait un lien faux, un test C7-CA qui comparait une clé inexistante donc ne prouvait rien, un refus de restauration trop large).
- **Une session de code fait UN SEUL push final** (merge `origin/main` + corrections de relecture + wiki régénéré dans le même push) : un push annule le lancement précédent de « Tests » et relance tout ; un mineur de relecture ne vaut pas un push de plus : il va dans la PR de docs ou dans une petite PR de code.
- **Ordre de fusion quand deux sessions touchent les mêmes fichiers** (550 de l'autre session de Jérôme et 551 : `lecture.js`, `metier.js`, `plan-mcp.md`, wiki) : la première prête fusionne, la seconde reçoit un message « merge `origin/main`, régénère le wiki, push unique », corrige en local et NE POUSSE PAS avant le signal.
- **« Tests de nuit » toujours lus par id** (`actions_get` du run), jamais « le dernier » : deux runs de suite peuvent porter le même sha (121 et 122) et un run peut être en cours au moment du rapport.
- **Un push annule le lancement précédent de « Tests »** : une croix rouge « annulé » juste après un push ou une étiquette n'est pas un échec ; lire le run par son id avant de chercher.
- **La restauration du journal est le garde-fou de toute opération sur un devis finalisé** (choix de l'affaire, archivage, envoi enregistré) : `restaurer.js` refuse plutôt que de laisser une racine à moitié rattachée ; un refus à tort est acceptable (rien n'est perdu), une restauration à tort ne l'est pas (limite connue dans `docs/montant-affaire.md`).
- **Décisions de Jérôme du 07/11** : portail devis seul = Relances à la main d'abord (même bouton « Préparer l'e-mail », texte de relance validé, brouillon Gmail, jamais d'envoi) ; profils `lecture` / `ecriture` / `complet` avec les anciens noms en alias durables ; **option A** : finalisation sans affaire partout (chez lui, chez un client avec Affaires, en Devis seul), avertissement non bloquant quand Affaires est actif, « Choisir l'affaire » plus tard ; changement de règle de finalisation = **pas de déploiement chez les clients de nuit**, accord explicite le matin.
- **Secret `MCP_JETONS` : une seule ligne par jeton**. `trouverJeton` (`functions/src/securite/jetons.js`) compare toutes les lignes et garde la DERNIÈRE qui correspond ; codes de confirmation et plafonds sont liés au NOM du jeton : changer un profil = modifier la ligne en place, attendre une minute (cache 60 s).

## Leçons de la matinée du 10/11/2026
- **Le poids du bot vient surtout de sa mémoire, de ses outils et de ses consignes** : mesurer avant d'optimiser (30 → 12 échanges a été le gain principal).
- **Une modification n8n par l'API ne change que le brouillon** : publier aussi la version active, sinon le bot garde l'ancienne.
- **`gh workflow run` et GraphQL sont refusés en session** : lancer un workflow avec l'outil GitHub MCP, lire avec `gh api` REST.
- **Après un déploiement `mcp` chez un client, envoyer un message de test à son bot** (le profil réel du jeton ne se lit pas toujours depuis la session).
- **Ne jamais lire les données d'exécution des nœuds HTTP de n8n** : les en-têtes contiennent le secret.
