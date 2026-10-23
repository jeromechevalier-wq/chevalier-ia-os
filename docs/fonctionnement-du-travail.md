# Comment le travail se fait (mode d'emploi pour Jérôme)

Écrit le 23/10/2026. Cette page décrit **ce qui existe déjà** et que Claude applique ; elle n'ajoute aucune règle. Les décisions de Jérôme à retenir d'une session à l'autre sont dans `CLAUDE.md` (c'est ce fichier que Claude lit au début de chaque session).

## En une minute

- Jérôme dit ce qu'il veut. Claude décide **comment**, écrit un brief précis, et confie le travail à un **sous-agent** (un assistant qui code dans une copie isolée du dépôt).
- **Fable** (un autre modèle d'IA) **relit** : les briefs avant l'envoi, puis le code avant la fusion. Il a trouvé des erreurs à chaque fois : on garde cette étape.
- Chaque sujet est **une PR** (une proposition de changement sur GitHub). Elle est fusionnée quand la coche « Tests » est verte. Rien ne part sur `main` autrement que par une PR.
- Les changements qui touchent **les données de Jérôme, les règles Firebase ou la plateforme clients** ne sont jamais fusionnés sans lui.

## Les acteurs

| Qui | Rôle |
|---|---|
| Jérôme | Décide, teste à l'écran, donne les accords écrits (modifier ses données, fusionner un cas sensible). |
| Claude (session principale) | Comprend la demande, écrit le brief, relit les captures, pousse la branche, ouvre la PR, fusionne. Seule la session principale pousse sur GitHub. |
| Sous-agent exécutant | Code un seul sujet dans un répertoire isolé, lance les tests, rend un rapport. Il ne pousse jamais. |
| Fable | Relecteur indépendant, en lecture seule. Il ne modifie rien. |
| GitHub | Lance la suite de tests de chaque PR et celle de la nuit, déploie le site de Jérôme à chaque fusion sur `main`. |

## Le chemin d'un sujet, étape par étape

1. **Brief** : un fichier qui dit quoi faire, les fichiers concernés, des **critères d'acceptation** (une phrase observable chacun), les pièges connus.
2. **Relecture du brief par Fable** : lignes inexactes, collisions avec d'autres PR, critères ambigus. Claude corrige le brief **avant** de l'envoyer.
3. **Sous-agent** : une branche locale depuis `main`, un test et une capture d'écran par critère, `test:module` de la zone touchée, puis `test:rapide` et `test:smoke`.
4. **Rapport** : fichiers, résultats avant/après, décisions prises seul, **5 vérifications à l'écran** pour Jérôme, cas vide, cas d'erreur, et surtout **ce qui n'a pas pu être vérifié**.
5. **Claude relit** le rapport et les captures (les tests verts ne suffisent pas), fusionne `origin/main`, pousse, ouvre la PR en brouillon et s'y abonne.
6. **Relecture du code par Fable** (lecture seule) : bloquant / à corriger / ok.
7. **PR prête, fusion automatique** armée : GitHub fusionne dès que la coche « Tests » est verte. Si elle ne part pas seule, Claude fusionne directement quand tout est vert.
8. Claude remet la branche de session identique à `main`. **Une seule PR à la fois** sur cette branche.

## Les tests : trois paliers

- Pendant le travail : le test du module touché seulement.
- Avant la PR : `npm run test:rapide`, puis `npm run test:smoke`.
- Sur GitHub : la coche « Tests » de la PR (rapide, smoke, et les parcours **de la PR**), et la **suite de nuit** sur `main` (tout, ordinateur et téléphone, moins de 45 minutes, délai du workflow).

Conséquence à retenir : **la coche de PR ne lance pas les anciens parcours ni le format téléphone des nouveaux tests**. C'est la suite de nuit qui les attrape. Voir `docs/tests.md`.

## Le protocole « GO NUIT »

Quand Jérôme écrit « GO NUIT », Claude travaille sans poser de question jusqu'au matin : une hésitation devient une ligne « Décision prise seul » dans la PR, ou le sujet est sauté avec sa raison. Il fusionne lui-même ce qui est vert, **sauf** la liste d'arrêt : règles Firestore ou Storage, modification des données existantes de Jérôme, déploiement de la plateforme clients, `firebase*.json`, secret manquant. Ces PR restent ouvertes, vertes, avec l'étiquette `a-fusionner-par-jerome` et leurs 5 vérifications. Le matin, Claude met à jour `docs/reprise-prochaine-session.md` (tableau sujet / PR / état).

## Ce qui est interdit, toujours

Pousser sur `main`, déployer la plateforme clients (workflow manuel, que Jérôme seul lance), écrire un secret, une clé ou une donnée de client dans le dépôt (il est **public**), supprimer ou ignorer un test pour passer au vert, ajouter une porte dérobée au serveur MCP.

## Leçons apprises (les plus utiles)

- **Une PR à la fois** sur la branche de session : pousser la suivante avant la fusion de la précédente écrase la première.
- **Avant de retirer ou déplacer un élément d'écran**, chercher dans `tests/e2e/` les tests qui lisent son sélecteur.
- **Toute PR qui touche du CSS** lance `npm run test:module look-compact` (tailles et poids de texte en dur refusés).
- **Tout nouveau test d'écran se lance aussi en format téléphone** (`--project=telephone`) avant la PR : quatre tests écrits le 23/10 n'avaient été vus rouges que par la suite de nuit.
- Un test sur téléphone qui ouvre le menu doit le refermer (Échap) avant de cliquer ailleurs : le voile du tiroir intercepte les clics.
- Les captures régénérées par le bac à sable se rendent un peu différemment : ne committer que celles du dossier de la PR.
- En bac à sable, `apis.google.com` est injoignable : les parcours qui chargent le sélecteur de fichiers Google échouent sur l'erreur console `ERR_TUNNEL_CONNECTION_FAILED`. Ce n'est pas un défaut du code ; la vraie réponse vient de la coche GitHub.
- Deux suites de tests en même temps sur la même machine font échouer des tests au hasard : relancer seul.
- Une coche rouge sans test en échec (émulateur Firestore qui s'arrête) : relancer une fois avant de chercher.
- Un test instable ne se « prouve » pas corrigé par un seul passage vert : le dire.
- Fable a une limite d'usage : si elle est atteinte, la relecture attend ; on ne fusionne jamais en laissant croire qu'elle a eu lieu.

## Ce que Jérôme ne voyait peut-être pas

- Claude **reconstruit la branche de session depuis `main`** après chaque fusion (c'est normal, rien n'est perdu).
- Un petit message du système dit parfois « commit non poussé » : faux positif, pousser la branche (identique à `main`) le calme.
- Les sous-agents laissent des copies de travail dans `.claude/worktrees/` : elles sont jetables.
- La suite de nuit s'ouvre toute seule une **alerte GitHub** (une « issue » titrée « Tests de nuit rouges ») quand elle échoue.
- Claude peut **relancer la suite de nuit à la demande** depuis GitHub (workflow « Tests de nuit », lancement manuel) pour vérifier un correctif sans attendre la nuit.

## Où est quoi

| Sujet | Page |
|---|---|
| Décisions permanentes et protocole de nuit | `CLAUDE.md` |
| Règles d'interface | `docs/consignes-ui.md` |
| Tests, quota, pièges | `docs/tests.md` |
| Où reprendre la prochaine session | `docs/reprise-prochaine-session.md` |
| Ajouter un bouton qui appelle un workflow | `docs/ajouter-un-bouton-workflow.md` |
| Déployer chez un nouveau client | `docs/deploiement-client.md` |
