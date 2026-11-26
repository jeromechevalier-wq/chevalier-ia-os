# Plan de la future base (Google Cloud SQL, PostgreSQL 17, sans Supabase)

**Ce dossier est un PLAN.** Rien ici n'est branché à une vraie base. Les fichiers décrivent la base de demain ; un petit programme (`tester.js`) les essaie sur une base jetable, créée sur le Mac pour quelques secondes puis arrêtée.

## En deux mots

Aujourd'hui, les données des achats (factures, fournisseurs, chantiers, articles) vivent chez Supabase. Demain, elles vivront dans une base PostgreSQL chez Google, rangée **par espace** (un espace = un client, ou Jérôme). Ce plan reprend **toutes** les tables, vues et fonctions d'aujourd'hui (dépôt BTP, état après la migration 034), avec les **mêmes noms** et les **mêmes colonnes**, pour que les écrans de l'OS et le Pilotage continuent de marcher sans changement. Il ajoute les règles de Jérôme partout.

## Comment l'essayer

```
node outils/base/tester.js
node outils/base/tester.js --avec-a-activer
node outils/base/tester.js --comme-cloudsql
```

- La 1re commande joue les migrations deux fois (pour prouver qu'on peut les rejouer), puis chaque fichier de `tests/` sur une copie neuve.
- La 2e fait la même chose, puis essaie en plus le fichier « à activer » (le blocage des reflets).
- La 3e joue tout **comme dans Cloud SQL** : le compte qui installe la base n'y est **pas** superutilisateur (le compte `postgres` de Cloud SQL, membre de `cloudsqlsuperuser`, peut créer des rôles et des bases ; il peut aussi créer les extensions permises par Google et des déclencheurs d'événements, ce que `admin_cloudsql` ne peut pas : ce mode est donc **plus strict** que Cloud SQL). Ici, un compte `admin_cloudsql` (sans superutilisateur ni `BYPASSRLS`) crée la base et les rôles, joue les migrations, puis les tests ; la sécurité par ligne forcée s'applique donc aussi à lui. Pour les tests seulement, il se donne le droit de « devenir » `porte`, `robot_reflets` et `indicateurs` (`set role`), sans hériter de leurs droits. Se combine avec `--avec-a-activer`.
- Il faut Postgres.app (PostgreSQL 17) sur le Mac, ou le dossier des programmes dans `PG_BIN`. Le programme refuse une version plus ancienne que 17.
- Le programme **refuse de démarrer** si `PGHOST` ou `DATABASE_URL` existe (signe qu'une vraie base est réglée dans le terminal). Il ne parle qu'à la base qu'il vient de créer, par une prise locale, jamais par le réseau, et l'arrête avec `pg_ctl stop`.
- Pas encore branché à la coche « Tests » de GitHub (à brancher plus tard).

## Les fichiers

| Fichier | Ce qu'il contient |
|---|---|
| `migrations/001_socle.sql` | Les 3 rôles, l'espace et la personne de chaque requête, les règles communes (qui et quand, pas de suppression, journal), le registre. |
| `migrations/002_referentiels.sql` | Fournisseurs, agences, chantiers, articles, rapprochements, favoris, tickets n8n. |
| `migrations/003_reflets.sql` | Les copies de ce qui vit ailleurs : courriels reçus, coûts de l'IA, exécutions n8n, relevés OpenRouter. |
| `migrations/004_factures.sql` | Les factures coupées en 4 (voir plus bas) et la vue `factures` qui les recolle. |
| `migrations/005_fonctions_metier.sql` | Toutes les fonctions d'aujourd'hui, mêmes noms, mêmes paramètres. |
| `migrations/006_vues.sql` | Les 67 vues des tableaux de bord et du Pilotage, recopiées à l'identique. |
| `migrations/007_droits_et_registre.sql` | Qui a le droit de faire quoi, et la liste des tables (source ou reflet). |
| `migrations/008_porte.sql` | `consommer_ticket_porte` : comme `consommer_ticket` (mêmes paramètres, mêmes colonnes), mais l'identifiant de la personne est un uuid stable tiré de `app.utilisateur` (l'e-mail posé par la porte) : `md5('chevalier-ia-os:personne:' \|\| lower(e-mail))::uuid` (le préfixe évite l'empreinte Gravatar, retrouvable par dictionnaire), car les workflows n8n exigent un uuid. La fonction tourne avec les droits de l'appelant : **la porte doit poser `app.espace_id` et une personne (`app.utilisateur`) avant l'appel**, dans la transaction. L'espace vient de la configuration de la porte (secret propre à l'espace, côté serveur), jamais de la requête reçue. Droits : `porte` et `robot_reflets` ; `indicateurs` ne peut plus ni demander ni consommer de ticket. |
| `a-activer/001_bloquer_reflets.sql` | **Pas appliqué.** Réserve l'écriture des reflets aux robots. |
| `tests/*.sql` | Les vérifications (voir plus bas). |
| `tester.js` | Le programme qui essaie tout sur une base jetable. |

## Les 12 règles de Jérôme, et comment la base les tient

| N° | Règle | Comment c'est tenu | Vérifié par |
|---|---|---|---|
| 1 | `espace_id` partout, et dans toutes les unicités | Colonne obligatoire posée par la base sur chaque table ; chaque unicité commence par `espace_id` ; les liens entre tables passent par `(espace_id, id)`, donc un lien ne peut pas viser un autre espace. | `01`, `02`, `06` |
| 2 | Chaque table est **source** ou **reflet**, jamais les deux | Table `registre_tables`. Les tables mixtes sont coupées en deux, une vue les recolle. | `01` |
| 3 | Le blocage des reflets est préparé, pas branché | `a-activer/001_bloquer_reflets.sql`, essayé seulement avec `--avec-a-activer`. | `tests/a-activer/01` |
| 4 | Qui et quand remplis par la base | `cree_le`, `cree_par`, `modifie_le`, `modifie_par` écrits par un déclencheur, à partir de `app.utilisateur`. Ce que la requête envoie dans ces colonnes est ignoré. Sans personne connue, rien ne s'écrit. | `03` |
| 5 | Dates-heures avec fuseau | Toutes en `timestamptz`. | `01` |
| 6 | Jamais de vraie suppression | On archive (`archive_le`, `archive_par`). Personne n'a le droit DELETE ; même le propriétaire est arrêté par un déclencheur. | `01`, `04` |
| 7 | Journal avant / après, en ajout seul | `journal_modifications` : une ligne par ajout ou modification de chaque table ; elle ne se modifie ni ne s'efface. | `04` |
| 8 | Reflets : `source_nom`, `source_ref`, `copie_le` | Sur chaque reflet, avec l'unicité `(espace_id, source_nom, source_ref)` : la même chose n'est jamais recopiée deux fois. | `01`, `06`, `07` |
| 9 | `not null`, `check`, clés étrangères partout | Repris d'aujourd'hui et complétés. | `01` |
| 10 | Montants en `numeric` | Aucun nombre à virgule flottante. | `01` |
| 11 | Identifiants `uuid` | Partout, sauf le compteur du journal (voir « à valider »). | `01` |
| 12 | Garde-fou de simultanéité | **Plus tard** (voir plus bas). | — |

### Sécurité par espace

- Trois rôles : `porte` (la future porte des Cloud Functions), `robot_reflets` (les robots qui recopient), `indicateurs` (le Pilotage, lecture seule). Aucun n'est superutilisateur, aucun n'a le droit de passer outre la sécurité par ligne (`bypassrls`).
- À chaque requête, la porte dira « je suis dans l'espace X, pour la personne Y » (`app.espace_id` et `app.utilisateur`). La base ne montre et n'écrit **que** les lignes de l'espace X.
- **Important pour la porte** : elle pose ces deux réglages avec `set_config(…, true)` **à l'intérieur d'une transaction** (`begin` … `commit`). Ainsi ils disparaissent à la fin de la transaction. Sinon, avec un pool de connexions (des connexions réutilisées d'un client à l'autre), l'espace du client précédent pourrait rester posé sur la connexion.
- **Sans espace (absent, vide ou blanc), rien n'est visible et rien ne s'écrit.**
- Sécurité par ligne **forcée** sur toutes les tables (même pour leur propriétaire), toutes les vues lisent avec les droits de celui qui demande (`security_invoker`), **aucune** fonction ne passe outre (`security definer` : zéro).
- Le test `02` remplit deux espaces A et B, puis vérifie depuis A, avec chacun des 3 rôles : chaque table, **chaque vue** (les 74) et chaque fonction de lecture ; et que les fonctions d'écriture ne trouvent pas les lignes de B.

## Les tables

| Table | Nature | Ce qu'elle garde |
|---|---|---|
| `fournisseurs` | source | Les entreprises (SIREN). |
| `etablissements_fournisseur` | source | Les agences (SIRET). |
| `chantiers` | source | Chantiers, budget, statut. |
| `articles_fournisseur` | source | Le catalogue de chaque fournisseur. |
| `articles_reference` | source | Les articles qui regroupent plusieurs fournisseurs. |
| `rapprochements_articles_tous` | source (à valider) | Les liens article → référence ; les liens défaits restent, archivés. |
| `suggestions_refusees_tous` | source | Les suggestions de l'IA refusées. |
| `suggestions_tentees` | source | Le compteur des passages de l'IA. |
| `favoris`, `favoris_os` | source | Les étoiles (appli BTP, OS). |
| `tickets_n8n`, `tickets_n8n_demandes` | source (à valider) | Les tickets d'une minute pour n8n. |
| `ibans_confirmes` | source | Les IBAN vérifiés par une personne. |
| `journal_modifications` | source | Le journal avant / après. |
| `registre_tables` | source | La liste des tables (sans espace). |
| `factures_identite` | source | Qui est la facture (fournisseur + numéro, agence, chantier, archivage). |
| `factures_decisions` | source | Accepter, refuser, rouvrir (ajout seul). |
| `factures_corrections` | source | Les corrections faites à la main (ajout seul). |
| `lignes_facture_articles` | source | Le lien de chaque ligne vers l'article. |
| `factures_scans` | reflet | Chaque lecture d'une facture (ajout seul). |
| `lignes_facture_lues` | reflet | Les lignes lues sur la facture. |
| `courriels_recus` | reflet | Les courriels reçus. |
| `couts_ia` | reflet | Le coût de chaque appel à l'IA. |
| `n8n_executions` | reflet | Le relevé des exécutions n8n. |
| `openrouter_cles_releves` | reflet | Le relevé de consommation OpenRouter. |

### Les tables coupées en deux (règle 2)

| Avant (une table) | Après | La vue qui recolle, avec les colonnes d'avant |
|---|---|---|
| `factures` | `factures_identite` (source) + `factures_scans` (reflet) + `factures_corrections` (source) + `factures_decisions` (source) | `factures` (exactement les 33 colonnes d'avant, même ordre). Les robots peuvent toujours écrire `insert into factures` et `update factures set statut = …` : la base range chaque écriture dans la bonne table. |
| `journal_decisions` | `factures_decisions` | `journal_decisions` |
| `lignes_facture` | `lignes_facture_lues` (reflet) + `lignes_facture_articles` (source) | `lignes_facture` |
| `rapprochements_articles` | `rapprochements_articles_tous` (avec les liens archivés) | `rapprochements_articles` (seulement ceux en cours) |
| `suggestions_refusees` | `suggestions_refusees_tous` | `suggestions_refusees` |

Les garde-fous des factures ne tiennent pas seulement par la vue : ils sont **aussi posés sur les tables** (la porte peut les écrire en direct). Une facture décidée a son identité figée (fournisseur, numéro, agence ; le chantier seulement par `relier_facture_chantier`) ; seule une facture décidée s'archive ; une décision « accepter » exige une agence active et l'identifiant du décideur ; on ne décide pas deux fois sans rouvrir. Le test `07` le vérifie par des écritures directes.

Il n'y a **pas** de table des bons de livraison. Une facture re-scannée (avec des notes à la main) est un **2e scan de la même facture** : même SIREN + même numéro = même facture, jamais un doublon. Si deux scans ne disent pas la même chose (montant, date, IBAN), la vue `v_factures_desaccords` le montre ; le robot ne tranche pas.

## Ce qui a été enlevé de Supabase, et pourquoi

| Enlevé | Pourquoi |
|---|---|
| `auth.uid()`, `auth.jwt()`, les rôles `anon`, `authenticated`, `service_role` | Ils n'existent que chez Supabase. La personne vient désormais de `app.utilisateur`, posé par la porte. |
| Le schéma `storage` (les PDF chez Supabase) | Les PDF iront ailleurs (voir « à valider »). On garde le chemin du fichier dans `factures_scans.fichier_path`. |
| `acces_firebase_reglage`, `initialiser_acces_firebase()`, `acces_base_autorise()`, les règles par badge Firebase | Remplacés par la porte (correction C1). `identite_appelant()` lit maintenant `app.utilisateur`. |
| Les fonctions `security definer` | Elles passaient outre la sécurité par espace. Toutes s'exécutent maintenant avec les droits de l'appelant. |
| L'extension `pgcrypto` | Inutile : PostgreSQL 17 sait faire `gen_random_uuid()` et `sha256()`. |
| Le rôle `metabase_ro` | Supprimé (C6). `indicateurs_ro` devient `indicateurs`, avec le droit de lire toutes les vues. |
| Les règles « lecture indicateurs USING (true) » | Elles montraient tous les espaces. Une seule règle reste : celle de l'espace. |
| Les `DELETE` dans les fonctions | Remplacés par l'archivage (dissocier, refuser, reprendre une suggestion, retirer un favori, remplacer les lignes, consommer un ticket). |
| La colonne stockée `lignes_etat` / `lignes_somme_ht` et ses recalculs | Calculées en direct par la vue `factures` (toujours justes). `recalculer_lignes_facture()` existe encore mais ne fait plus rien. |

## Noms gardés pour l'OS (correction C7)

Les nouvelles colonnes s'appellent `cree_le`, `modifie_le`, `archive_le`, etc. Ce que l'OS lit garde ses anciens noms :

| Ancien nom (gardé à la lecture) | Où vit la valeur maintenant |
|---|---|
| `created_at` (fournisseurs, agences, chantiers, articles, rapprochements) | Colonne calculée, toujours égale à `cree_le`. |
| `factures.created_at` | `factures_identite.cree_le` |
| `factures.decide_par`, `decide_par_id` | `factures_decisions.decide_par`, `decide_par_id` (dernière décision) |
| `factures.date_decision` | `factures_decisions.decide_le` |
| `factures.statut`, `motif_refus`, `motif_acceptation`, `alertes_a_la_decision`, `acceptee_malgre_alerte` | `factures_decisions` (dernière décision) |
| `factures.archivee_le`, `archivee_par` | `factures_identite.archive_le`, `archive_par`. La personne qui archive est **toujours** celle de la requête (`app.utilisateur`) : le nom envoyé dans `archivee_par` ne sert plus qu'au libellé du journal. |
| `factures.montant_ht`, `numero`, `date_facture`… | Dernière correction si elle existe, sinon dernier scan reçu avant la décision |
| `lignes_facture.created_at` | `lignes_facture_lues.cree_le` |
| `lignes_facture.article_fournisseur_id` | `lignes_facture_articles` (lien en cours) |
| `chantiers.archive` (vrai / faux) | Gardé, et suit `archive_le` dans les deux sens |
| `tickets_n8n.espace` | **Renommé** `espace_id` (comme partout). `consommer_ticket()` rend toujours une colonne `espace`. |
| `favoris.utilisateur`, `favoris_os.utilisateur`, `tickets_n8n.utilisateur`, `tickets_n8n_demandes.utilisateur` | **Changent de type** : uuid de Supabase → texte (ce que la porte met dans `app.utilisateur`). |

Le test `05` vérifie, sur le schéma d'aujourd'hui relevé automatiquement : les 88 tables et vues gardent leur nom ; chaque vue (et `factures`, `lignes_facture`, `journal_decisions`, `rapprochements_articles`, `suggestions_refusees`) garde **exactement** ses colonnes dans le même ordre ; chaque table garde toutes ses anciennes colonnes ; les 43 fonctions gardent leur nom et leurs paramètres ; `renommer_reference` (le nom utilisé par l'OS) existe en plus. Une comparaison faite à la main a aussi trouvé que les **types** des colonnes sont les mêmes partout, sauf les 5 changements écrits ci-dessus.

## À valider par Jérôme

1. **Où vivront les PDF des factures** (Google Cloud Storage ?). Le plan garde seulement le chemin du fichier.
2. **Tickets n8n** (`tickets_n8n`, `tickets_n8n_demandes`, `demander_ticket_n8n`, `consommer_ticket`) : gardés, mais sans doute inutiles quand la porte existera. Les supprimer ?
3. **La règle « doublon refusé avec motif »** : aujourd'hui, une 2e facture au même fournisseur + numéro est refusée par la personne avec un motif. Demain, un 2e scan **rejoint** la même facture (pas de doublon du tout). Le seul cas qui reste : une correction de numéro qui tomberait sur une autre facture ; elle est **refusée** (pas de fusion automatique) et la vue `v_factures_doublons_possibles` montre les deux factures. Comment fusionner deux factures à la main : à décider.
4. **La clé de la facture** : le plan dit « une facture = SIREN lu + numéro dans l'espace » (le robot lit un SIREN, pas notre fiche) **et** « une facture = fiche fournisseur + numéro » dès que la fiche est connue (correction C3). Les deux règles existent ensemble. À savoir : tant qu'une facture est à valider, l'arrivée d'un nouveau scan peut **réécrire** `factures_identite.fournisseur_siren` et `numero_normalise` (la base les recale sur la dernière lecture, sauf si une autre facture les porte déjà). Une fois décidée, l'identité est figée (garde-fou posé sur la table elle-même, pas seulement sur la vue).
5. **Un scan qui arrive sans facture** (`factures_scans.facture_id` vide) : la base le range tout de suite dans la facture qui a le même SIREN + numéro, ou en crée une nouvelle (à identifier). D'accord ?
6. **Une facture décidée est entièrement figée**, y compris ce qui a été lu (aujourd'hui, une nouvelle lecture pouvait encore changer certaines valeurs). Un scan arrivé après la décision est gardé mais ne change pas ce qui s'affiche.
7. **`rapprochements_articles_tous` classée source** alors qu'elle contient aussi des suggestions de l'IA (une suggestion est une proposition, la vérité est la validation par une personne).
8. **Le registre n'a pas d'espace** (il décrit la structure, commune à tous).
9. **Le journal garde un compteur** (`bigint`) au lieu d'un uuid, pour garder l'ordre exact des écritures.
10. **Le code automatique des chantiers (CH-0001) est compté par espace** (chaque client commence à CH-0001).
11. **`indicateurs` lit les tables entières de son espace**, et non plus colonne par colonne (obligatoire avec les vues `security_invoker`). Il ne lit ni le journal, ni les favoris, ni les tickets.
12. **`decide_par_id` reste obligatoire** pour décider (comme aujourd'hui).
13. **Coûts de l'IA sans identifiant d'appel** : la base fabrique une référence unique ; il vaudrait mieux que n8n envoie l'identifiant de l'appel chez OpenRouter. Même chose pour une exécution n8n sans numéro.
14. **L'heure `cree_le` des reflets** (`couts_ia`, `n8n_executions`, `openrouter_cles_releves`) est l'heure de la base : si un robot envoyait l'heure de l'événement dans `cree_le`, elle est ignorée. Faut-il une colonne « heure de l'événement » à part ?
15. **Des noms viennent encore de la requête, pas de `app.utilisateur`** : `journal_modifications.qui` (écrit par les fonctions métier avec `p_qui`), `factures_decisions.decide_par`, `rapprochements.valide_par`, `suggestions_refusees.refuse_par`, `ibans_confirmes.confirme_par` (tous venant de `p_qui`). Et la porte peut ajouter une ligne au journal (elle ne peut ni la modifier ni l'effacer, l'heure vient de la base). Plus tard : prendre ces noms dans `app.utilisateur`, et réserver l'écriture du journal (fonction filtrée par espace). En revanche `cree_par`, `modifie_par` et `archive_par` viennent toujours de `app.utilisateur`.
16. **Les favoris de l'appli BTP** (`favoris`, `basculer_favori`, `lister_favoris`) : gardés tant que l'appli BTP existe.
17. **Une facture déjà décidée qui revient** (ex. refusée, puis renvoyée par le fournisseur avec le même numéro) : le nouveau scan rejoint la facture, qui **garde** sa décision (elle reste refusée et visible ; le robot reçoit le vrai statut). Le scan est montré dans la vue `v_factures_scans_apres_decision` pour qu'une personne regarde. Faut-il plutôt rouvrir la facture toute seule ?
18. **Compteurs communs à tous les espaces** : le numéro du journal (`journal_modifications.id`) et les rangs (`rang`) des scans, décisions et corrections sont des compteurs de toute la base, pas un par espace. Ils ne servent qu'à ranger dans l'ordre ; un client pourrait seulement deviner, aux trous dans les numéros, que d'autres écritures existent. D'accord ?
19. **Heure réelle pour les scans et les décisions** : `copie_le` et `decide_le` prennent l'heure exacte (`clock_timestamp()`), pas l'heure du début de la transaction, pour savoir sans erreur si un scan est arrivé avant ou après une décision.
20. **Deux uuid pour la même personne, avant et après la bascule** : les données reprises de Supabase gardent l'uuid Supabase de la personne (`factures_decisions.decide_par_id`, `journal_modifications.qui_id`, `ibans_confirmes.confirme_par_id` et `revoque_par_id`), alors que les nouvelles décisions portent l'uuid de `consommer_ticket_porte` (tiré de l'e-mail). Choix : accepter la coupure (l'e-mail, lui, reste le même dans `decide_par` / `qui`), ou une table de correspondance ancien uuid → nouvel uuid appliquée à la reprise.

## Plus tard

- **Garde-fou de simultanéité (règle 12)** : refuser une écriture faite sur une version périmée d'une ligne (deux personnes qui modifient la même fiche en même temps). Pas fait dans ce plan. Les verrous d'aujourd'hui (`for update`, verrous par fournisseur, par IBAN, par code de chantier, par facture) sont gardés.
- Brancher `tester.js` sur la coche « Tests » de GitHub.
- Activer `a-activer/001_bloquer_reflets.sql` quand les robots auront leur propre compte.
- Créer les vrais comptes de connexion (la porte, les robots, le Pilotage) et leur donner ces rôles.

## Ce qui n'est pas fait (correction C8)

| Point | État |
|---|---|
| 1. Tables, registre, rôles, sécurité par espace, qui / quand, journal, et leurs tests | Fait et testé (`01` à `04`, `06`). |
| 2. Vues et fonctions lues par l'OS (C4) | Faites ; noms et colonnes vérifiés (`05`) ; isolement vérifié (`02`) ; les fonctions Articles essayées (`08`), les factures essayées (`07`). |
| 3. Le reste des vues | Toutes recopiées à l'identique (`006_vues.sql`) et passées au test d'isolement ; leurs **chiffres** ne sont pas comparés un à un avec ceux d'aujourd'hui. |
| 4. Tests de simultanéité (009, 013, 014, 034 du dépôt BTP) | **Pas faits.** |
| Les ~50 fichiers de tests du dépôt BTP | **Pas recopiés** (ils utilisent les rôles et les jetons de Supabase). Ce qu'ils vérifient est en partie couvert par `02`, `04`, `07` et `08`. À reprendre un par un. |

Aucune vue ni aucun test n'a été vidé pour passer au vert.
