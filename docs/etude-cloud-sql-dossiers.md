# Étude : les données métier dans Cloud SQL, et une seule table « dossiers » (26/11/2026)

Étude demandée par Jérôme le 26/11/2026. **Rien n'est codé, rien n'est migré.** Ce document décrit, mesure et liste les décisions qui restent à Jérôme.

Sources : `origin/main` au commit `ed7bc5cd` (26/11/2026). Les numéros de ligne renvoient à ce commit. L'étude « une maison par client » (`docs/etude-une-maison-par-client.md`) a été lue dans la copie de travail du Mac : elle a été ajoutée à `docs/` le 26/11/2026, avec cette étude. Dépôt public : aucun nom de client, aucun secret, aucune adresse, aucun identifiant de projet Google d'un client.

Conventions : « **non mesuré** » = aucun comptage fait ; « **à vérifier** » = affirmation sur Google sans source lue pour cette étude ; les tailles (petit, moyen, gros) sont relatives, aucune durée n'est annoncée.

---

## Résumé en 10 lignes

1. **Bonne nouvelle : le terrain est déjà préparé.** Le plan de la base Cloud SQL existe (`outils/base/`, PR 695) avec ses 12 règles (espace partout, journal avant/après, jamais de suppression). Et la décision « le navigateur ne parle jamais à la base, nos fonctions serveur le font » est déjà prise (`CLAUDE.md:27`).
2. **Le code est bien rangé** : toutes les écritures des Personnes, Organisations, Affaires et Projets passent par des « plans » communs à l'écran et au serveur MCP. Les appels à Firestore de ces modules tiennent dans **3 fichiers** côté écran et **1 fichier** côté serveur.
3. **Mais beaucoup de choses s'appuient dessus** : 22 fichiers d'écran lisent les listes en mémoire, 146 fichiers de tests (dont 87 tests d'écran) nomment ces collections, 53 outils MCP les touchent.
4. **Ce qu'on perd en quittant Firestore** : la mise à jour en direct des écrans, les règles de sécurité, les sauvegardes déjà en place, les émulateurs de test. Tout se remplace, mais c'est du travail (section B).
5. **« dossiers » est une bonne idée**, avec un piège : aujourd'hui **une affaire = un seul projet** (`js/modules/projets/logique.js:731`). « 1 vente → plusieurs réalisations » est un vrai changement d'écran, pas seulement de base.
6. **Il existe déjà une table SQL `chantiers`** (Achats, `outils/base/migrations/002_referentiels.sql:197`) : deux notions de « chantier » cohabitent. Il faut les réunir.
7. **Le vocabulaire par client n'existe pas encore dans le code** : il n'y a qu'un plan (`docs/vocabulaire-configurable.md`). C'est un préalable pour que la base garde des noms neutres.
8. **Recommandation d'organisation : une instance Cloud SQL par maison, une seule base dedans, `espace_id` sur chaque ligne** (déjà prévu par le plan). Pas de schéma par client.
9. **Ordre proposé** : couche d'accès commune, puis le socle chez le client BTP, puis le client rendez-vous, puis les dossiers, puis Achats et Pilotage, et **le CRM de Jérôme en dernier, avec son accord**.
10. **Coût** : un prix fixe par instance et par mois. Seul chiffre trouvé dans un document : environ 9,37 $ par mois pour la plus petite instance, **à revérifier**, et probablement trop petite.

---

## A. Inventaire mesuré

Mesuré avec `grep` sur `origin/main` (commit `ed7bc5cd`).

### A.1 Où vivent les noms des collections

Les noms ne sont pas éparpillés : ils sont rangés dans **trois listes**.

| Liste | Où | Rôle |
|---|---|---|
| `COLLECTIONS_PLAN` | `js/modules/crm/logique.js:2382-2393` | Les noms utilisés par les « plans » d'écriture (communs à l'écran et au serveur) |
| `COLLECTIONS` | `functions/src/coeur/donnees.js:23-49` | Les noms utilisés par le serveur MCP |
| `COLLECTIONS_CRM` | `js/modules/crm/donnees.js:22-30` | La liste de la sauvegarde complète (export) |
| Déclarations des modules | `js/os/registre.js:46` (socle), `:102` (Affaires), `:123` (Projets) | Ce que chaque module déclare |

### A.2 Qui parle vraiment à Firestore pour ces données

| Côté | Fichier | Appels Firestore comptés | Ce qu'il fait |
|---|---|---|---|
| Écran | `js/modules/crm/donnees.js` (593 lignes) | 13 | Écoute en direct personnes, organisations, affaires, activités, paramètres ; écritures |
| Écran | `js/modules/projets/donnees.js` (282 lignes) | 11 | Écoute en direct les projets, livrables, modèles ; écritures |
| Écran | `js/os/journal-donnees.js` (103 lignes) | 6 | Écrit la donnée + la ligne `crm_audit` + la copie `crm_audit_avant` dans le même lot |
| Écran | `js/modules/reseauxsociaux/import-actions.js:55` | 1 | Lit directement `crm_personnes` (à faire passer par le socle) |
| Serveur | `functions/src/coeur/donnees.js` (276 lignes) | — | **Une petite interface** (`liste`, `document`, `appliquer`, `mettreAJour`, `transaction`) avec deux réalisations : Firestore (l. 98) et mémoire pour les tests (l. 205) |

Conséquence : **pour le serveur, il « suffit » d'écrire une troisième réalisation de cette interface, pour Postgres.** Pour l'écran, il faut remplacer 3 fichiers par des appels à nos fonctions serveur.

### A.3 Qui utilise ces données (sans parler à Firestore)

| Mesure | Nombre | Commande |
|---|---|---|
| Fichiers `js/` qui lisent les listes en mémoire (`etat.personnes`, `etat.affaires`, `etat.projets`…) | 22 | `grep -rlE "etat\.(personnes|organisations|affaires|activites|projets)"` |
| Fichiers du module CRM (Affaires) qui importent `./donnees.js` | 19 sur 27 | |
| Fichiers hors module CRM qui importent `crm/donnees.js` | 29 (Devis 10, Projets 8, Rendez-vous 5, Réseaux sociaux 2, coque 4) | |
| Fichiers du module CRM qui importent `projets/donnees.js` | 9 | (Affaires et Projets sont très liés à l'écran) |
| Fichiers `js/` qui manipulent un lien `affaireId` / `personneId` / `organisationId` / `projetId` | 25 / 32 / 26 / 9 | |
| Fichiers `functions/src` qui manipulent `affaireId` / `personneId` | 14 / 10 | |
| Fichiers `functions/src` qui utilisent ces collections (par leur nom ou leur clé `C.…`) | 12 | dont `coeur/metier.js` (70 usages), `coeur/lecture.js` (28), `coeur/devis.js` (13), `coeur/ecriture.js` (6) |
| Outils MCP concernés | 53 (37 d'Affaires, 16 de Projets ; dont 9 prêtés au socle) | `js/os/registre.js:47, 103-108, 124-128` |
| Scripts | 2 | `scripts/plateforme/donnees-demo.js`, `donnees-demo-pdf.js` |
| Fichiers de tests qui nomment ces collections | 146 sur 492 (dont 87 tests d'écran `tests/e2e/`) | |

### A.4 Les règles de sécurité

| Où | Ce qui protège ces données |
|---|---|
| `firestore.rules:36-50` | `crm_audit` et `crm_audit_avant` (journal) |
| `firestore.rules:229-231` | Une règle générale pour toutes les autres collections, dont les fiches du CRM (aucune règle propre aux personnes, affaires ou projets) |
| `firestore.plateforme.rules:193-198` | Chez les clients : lecture pour éditeur et lecteur, sous `clients/<client>/…` |

### A.5 Le journal « on garde tout »

Fichiers qui touchent `crm_audit` : 3 côté écran (`crm/donnees.js`, `crm/logique.js`, `os/journal-donnees.js`) et 9 côté serveur (`coeur/donnees.js`, `ecriture.js`, `lecture.js`, `metier.js`, `restaurer.js`, `devis.js`, `devis-email.js`, `index.js` et `pilotage/service.js`).

### A.6 Ce qui n'est pas mesuré

| Point | Pourquoi |
|---|---|
| Nombre de fiches (personnes, affaires, projets) chez Jérôme, chez la cliente de la plateforme, chez les autres | Pas de lecture des bases pour cette étude ; à compter avant la migration (export ou Console) |
| Modules réellement allumés chez la cliente de la plateforme | La doc dit « CRM seulement » (`docs/tables.md:55`, `docs/activer-desactiver-modules.md:11`) ; **à vérifier dans la Console** |
| Maison ou immeuble pour le client rendez-vous et le client BTP | Non écrit dans le dépôt : **à vérifier** (si l'un est dans la plateforme clients, il y faudra aussi une instance Cloud SQL) |
| Chantiers déjà saisis dans l'appli BTP séparée (`btp-assistant-mvp`) | L'appli a une table `chantiers` dans Supabase (ses migrations l'utilisent), mais son contenu n'a pas été lu : **à vérifier** |

---

## B. Ce qui disparaît en quittant Firestore, et comment le remplacer

| Ce que Firestore fait aujourd'hui | Où dans le code | Ce qui le remplace avec Cloud SQL | Taille |
|---|---|---|---|
| **Mise à jour en direct** : chaque écran a toutes les listes en mémoire, et elles changent toutes seules quand quelqu'un (ou l'assistant MCP) écrit | `js/modules/crm/donnees.js:1-4` (une écoute par collection toute la session) | Cloud SQL ne prévient personne. Proposition : **un petit « signal » dans Firestore** (un document par espace avec un compteur, que la fonction serveur augmente après chaque écriture). L'écran écoute ce signal et recharge ce qui a changé. On garde ainsi l'effet « en direct » sans tout recharger sans cesse | moyen |
| **Règles de sécurité par espace** (qui lit, qui écrit) | `firestore.rules:229-231`, `firestore.plateforme.rules:193-198` | **La « porte »** : nos fonctions serveur vérifient le compte Google connecté, son espace et son rôle, puis parlent à la base. Dans la base, la **sécurité par ligne** (`espace_id`) est déjà prévue et testée (`outils/base/REGLES.md`, tests `02`). SQL Connect est écarté : la décision « porte option A » est prise (`CLAUDE.md:27`) | gros, Fable obligatoire |
| **Journal « on garde tout »** : chaque écriture laisse sa ligne et sa copie « avant » dans le même lot | `js/os/journal-donnees.js` ; restauration `functions/src/coeur/restaurer.js` | Table `journal_modifications` déjà prévue : avant / après, ajout seul, remplie par la base elle-même (`outils/base/migrations/001_socle.sql:126-170`). **À refaire** : `lire_audit` et `restaurer_depuis_audit` sur cette table. **L'ancien journal Firestore reste en place, en lecture, jamais effacé** | moyen |
| **Contrôle « quelqu'un a modifié entre-temps »** (le serveur MCP refuse d'écraser) | `functions/src/coeur/donnees.js:9-12` (`attendus`, erreur `conflit`) | Le plan de la base le range en « plus tard » (`outils/base/REGLES.md`, règle 12). **Il doit être fait dès la couche d'accès**, sinon on perd une protection qui existe aujourd'hui | moyen |
| **Sauvegardes** : quotidiennes 98 jours + retour à la minute 7 jours | `docs/securite-et-pannes.md:46, 54` | Sauvegardes Cloud SQL automatiques + retour à un instant donné (durées et prix **à vérifier**), plus un export hors de Google. **Une restauration essayée avant de mettre de vraies données** | petit à moyen |
| **Mode hors ligne** | Aucun cache durable n'est réglé (`js/os/firebase.js` n'a pas de `persistentLocalCache`) | Rien de durable à perdre. Seule différence : Firestore garde une écriture en attente pendant une courte coupure ; une fonction serveur échoue tout de suite. Il faut **un message clair** (« pas de réseau, réessaie ») | petit |
| **Émulateurs de test** : 87 tests d'écran tournent sur un faux Firestore | `.github/workflows/tests.yml:307` | Une base Postgres jetable dans GitHub (service Postgres) et sur le Mac (`outils/base/tester.js` existe déjà, **pas encore branché sur la coche « Tests »**) | moyen |
| **Écritures en lot sans serveur** (l'écran écrit lui-même) | `js/modules/crm/donnees.js`, `js/modules/projets/donnees.js` | Les **plans** restent les mêmes (ils sont déjà partagés avec le serveur) ; c'est la fonction serveur qui les exécute dans **une transaction SQL** | moyen |
| **Rapidité** : lire une liste en mémoire est instantané | — | Le premier chargement passe par une fonction serveur (démarrage à froid possible). À mesurer ; garder le chargement complet en mémoire comme aujourd'hui | à mesurer |

---

## C. Le schéma proposé

### C.1 Le principe

| Reste dans Firestore (réglages) | Va dans Cloud SQL (données métier) |
|---|---|
| Étapes de vente, phases de réalisation, étiquettes, offres, sources, secteurs (`crm_parametres`) | Personnes, organisations |
| Modèles d'affaires et de projets (`projets_modeles`, `modeles_affaire`) | Dossiers (ventes et réalisations) |
| Vocabulaire de l'espace | Activités, notes, fil des événements, livrables, factures d'un dossier |
| Réglages de la maison (`reglages_maison`), membres, modules allumés | Journal (`journal_modifications`) |
| Le « signal » de mise à jour (section B) | |

**Attention** : une étape ou une phase est rangée dans Firestore, le dossier dans Cloud SQL. La base ne peut pas vérifier que l'étape existe : **la porte le vérifie**.

### C.2 Les tables (en mots simples)

Toutes les tables reçoivent les colonnes communes du plan : `espace_id`, `cree_le`, `cree_par`, `modifie_le`, `modifie_par`, `archive_le`, `archive_par` (`outils/base/migrations/001_socle.sql`, procédure `poser_socle`).

| Table | Colonnes principales | Remarques |
|---|---|---|
| `personnes` | nom, prénom, e-mails, téléphones, organisation, rôles, opposition aux e-mails, test | Le module Rendez-vous y lit les mobiles (`js/modules/rdv/creation.js:21`) |
| `organisations` | nom, SIRET, SIREN, N° de TVA, ville, secteur, source, test | |
| `dossiers` | **type** (voir C.3), **parent** (facultatif), titre, statut, **étape** (si vente), **phase** (si réalisation), montant (`numeric`), personne, organisation, date prévue, raison de perte, adresse, budget, code (CH-0001), dates de début, fin prévue, fin réelle, test | Une ligne = une vente **ou** une réalisation |
| `activites` | type (Appel, Rendez-vous, Email, Tâche), date, fait ou non, lien vers personne, organisation, dossier | |
| `notes` | texte, épinglée, liens | |
| `evenements` | le fil (« Affaire créée… ») | |
| `livrables` | dossier, phase, titre, fait | Aujourd'hui `projets_taches` |
| `factures_dossier` | dossier, montant, date, payée, abandonnée | Aujourd'hui un champ `factures` dans le document du projet (`js/modules/projets/donnees.js:252`) |
| `journal_modifications` | déjà prévue | |

### C.3 Le type et le parent

| Règle | Proposition |
|---|---|
| Nom technique du type | Le mot « vente » est **justement le mot affiché chez le client BTP** (`docs/vocabulaire-configurable.md`, « vente » puis « chantier ») : il viole la décision 4. Proposition : **`commercial`** et **`realisation`** (aucun n'est un mot proposé aux clients tel quel) |
| Parent | Facultatif. **Une seule marche** : seule une réalisation peut avoir un parent, et ce parent est une vente du **même espace** (vérifié par la base, comme tous les liens du plan qui passent par `(espace_id, id)`) |
| 1 vente → plusieurs réalisations | Permis par la base. **Mais l'écran ne le sait pas** : aujourd'hui `affaire.projetId` ↔ `projet.affaireId`, un seul projet par affaire (`js/modules/projets/logique.js:709, 731, 743`). La fiche de la vente devra afficher **une liste** de réalisations |
| Réalisation sans vente | Permise. Dans `js/os/registre.js:130`, `dependances: ['affaires']` de Projets **disparaît** |
| Une vente gagnée sans réalisation | Reste permise (comme aujourd'hui, l. 731) |

### C.4 Les identifiants : un piège à trancher

Le plan de la base veut des identifiants `uuid` partout (règle 11). Mais les fiches existantes ont des identifiants Firestore (20 caractères), **cités ailleurs** : dans les devis (14 fichiers de Devis manipulent `affaireId`), les rendez-vous (participants), les réseaux sociaux, les documents stockés, l'ancien journal, les dossiers Drive.

| Option | Avantage | Inconvénient |
|---|---|---|
| 1. Garder l'identifiant actuel (texte) ; les nouvelles fiches reçoivent un uuid écrit en texte | Rien à réécrire ailleurs ; l'ancien journal reste lisible | Écart écrit à la règle 11 |
| 2. uuid neuf + colonne `ancien_id` | Règle 11 respectée | **Tous les liens** des autres modules à réécrire, ou une table de correspondance à garder pour toujours |

**Recommandation : option 1** (question 3).

### C.5 Une base par client, ou un schéma par client ?

| Option | Pour | Contre |
|---|---|---|
| **Une instance par maison, une base, `espace_id` sur chaque ligne** | Déjà le plan (PR 695), déjà testé (« A ne voit rien de B », test `02`) ; la cession = donner le projet Google ; marche aussi dans la plateforme clients où plusieurs espaces vivent ensemble | Un prix fixe par instance |
| Une instance commune, une base par client | Moins d'instances | Contraire à « une maison par client » ; à la cession, il faut extraire la base |
| Une instance commune, un schéma par client | Idem | Les migrations à jouer N fois ; contraire au plan et à la maison |

**Recommandation : une instance Cloud SQL par maison (région `europe-west9`), une seule base, `espace_id` partout.** Pour la plateforme clients (l'immeuble), une instance pour tous ses espaces, séparés par `espace_id`.

### C.6 Les deux « chantiers »

| | Projets (Firestore) | Achats > Chantiers (SQL) |
|---|---|---|
| Où | `projets_projets` | table `chantiers` (`outils/base/migrations/002_referentiels.sql:197-215`) |
| Contenu | phase, livrables, factures clients, lien vers l'affaire | code CH-0001, budget HT, statut, adresse, dates ; les factures fournisseurs y sont rattachées |
| Utilisé par | Jérôme, la cliente de la plateforme | Jérôme (Achats) ; l'appli BTP séparée |

Proposition : **la réalisation est le seul « chantier »**. La table `chantiers` devient une **vue** sur les dossiers de type `realisation` (même méthode que pour `factures`, déjà employée dans le plan), pour que les écrans Achats, le Pilotage et n8n ne voient aucune différence (question 5).

### C.7 Le vocabulaire : ce qui existe et ce qui manque

| Point | État | Source |
|---|---|---|
| Décision « chaque client choisit ses mots » | **Décidé** le 24/10/2026 | `docs/roadmap.md:31-32` |
| Plan (dictionnaire, genre, articles, réglage, test) | Écrit | `docs/vocabulaire-configurable.md` |
| Code (`js/os/vocabulaire.js`, fonction `mot()`) | **N'existe pas** | aucun fichier trouvé ; « Rien n'est encore remplacé dans l'écran » (`docs/reprise-prochaine-session.md:946`) |
| Ampleur | 54 fichiers `js/`, 27 `functions/`, 27 `functions-plateforme/` (mesure du 24/10, **non refaite**) | `docs/vocabulaire-configurable.md` |
| Ce que le plan prévoit déjà de bon | Les noms stockés et les noms d'outils MCP ne changent jamais ; seul l'affichage change ; le genre est porté par chaque mot (« un dossier client » / « une vente ») | idem, point 5 |

Ce qui manque pour « dossiers » :

1. Les notions du dictionnaire doivent suivre **le type technique** (`commercial`, `realisation`) au lieu de « affaire » et « projet ».
2. Ajouter « étape » et « phase » (le plan les cite « plus tard »).
3. Les mots composés (« dossier client ») : l'accord se fait sur le premier mot ; le plan le permet si le genre est saisi.
4. Les outils MCP : leurs noms restent (`creer_affaire`, `creer_projet`) mais leurs **descriptions** doivent dire le mot du client.
5. Le **vocabulaire doit être fait avant** de faire voir « dossiers » à un client : sinon l'écran montrerait « Affaires / Projets » au client BTP.

---

## D. Supabase → Cloud SQL pour Achats et Pilotage

| Sujet | Aujourd'hui (Supabase) | Demain (Cloud SQL) | Taille |
|---|---|---|---|
| Schéma | Migrations dans le dépôt BTP | **Déjà réécrit** dans `outils/base/` (mêmes noms de tables, vues et fonctions, vérifié par le test `05`) | fait (plan) |
| Lecture par l'écran | Le navigateur appelle Supabase avec un badge Firebase (`js/os/supabase.js:63-71`) ; 18 fichiers passent par `js/os/acces-base.js` | Les **mêmes gestes** (`lire`, `appeler`, `lienPdf`) passent par la porte. Les 18 fichiers ne changent pas si `acces-base.js` garde ses fonctions | moyen |
| Barrière | Badge `espace_base`, fonction `baseAccorderAcces` (`functions/src/index.js:128-131`) | Inutiles : la porte pose `app.espace_id` et `app.utilisateur` **dans une transaction** (`outils/base/REGLES.md`, « Sécurité par espace ») ; retrait **après** que la porte marche | petit |
| Écritures | Par n8n, avec un ticket à usage unique (`js/os/actions-metier.js`) | Deux voies : n8n écrit en SQL directement (il faut alors ouvrir la base à n8n), ou **n8n appelle la porte** (la base reste fermée). Recommandation : la porte (question 7) | moyen |
| PDF des factures | Stockage Supabase (`lienPdf`) | Cloud Storage (point 1 « À valider » de `REGLES.md`) | petit à moyen |
| Pilotage | `functions/src/pilotage/postgres.js` : seul fichier qui parle à Postgres ; écrit pour le **pooler de Supabase** (pas de requête préparée nommée) ; secret `SUPABASE_INDICATEURS` (l. 10) | Brancher le connecteur Cloud SQL ; rôle `indicateurs` déjà prévu ; **renommer le secret** (sans « SUPABASE ») | petit à moyen |
| Données réelles | Chez Jérôme : vraies factures et vrais IBAN de fournisseurs | Migration = **accord de Jérôme**, jamais de nuit | moyen |
| Appli BTP séparée | Sur Supabase | Tant qu'elle tourne, **Supabase reste** pour elle | à décider (question 8) |
| Coût | Supabase en offre gratuite (d'après l'étude du 25/11) | **Un prix fixe en plus** pour l'instance de Jérôme | voir F |

Idée utile : **Achats est le meilleur terrain d'essai de la porte**. Le schéma est prêt et testé, les écrans passent déjà par un seul fichier, et seul Jérôme s'en sert.

---

## E. Ordre proposé, en petites PR

Chaque étape = une PR (ou quelques-unes), relue par Fable (serveur, données, sécurité : obligatoire).

| N° | Étape | Taille | Risque | Retour en arrière |
|---|---|---|---|---|
| 0 | **Décisions** de la section H (noms de type, identifiants, chantiers) | — | — | — |
| 1 | **Vocabulaire** : dictionnaire + réglage + premiers écrans, mots par défaut identiques (rien ne change tant que rien n'est réglé) | moyen à gros (plusieurs PR) | faible | facile (le code revient, aucune donnée) |
| 2 | **Base de test dans la coche « Tests »** : brancher `outils/base/tester.js` (Postgres jetable dans GitHub) | petit | faible | facile |
| 3 | **Couche d'accès commune** : une réalisation Postgres de l'interface `functions/src/coeur/donnees.js` (`liste`, `document`, `appliquer` avec le contrôle « modifié entre-temps », `transaction`) + la **porte** (fonction serveur qui vérifie le compte, l'espace, le rôle) + le « signal » de mise à jour | gros | moyen (sécurité) | facile : rien ne s'en sert encore |
| 4 | **Interrupteur par espace** : un réglage dans `reglages_maison` dit « socle dans Firestore » ou « socle dans Cloud SQL » ; le code sait faire les deux pendant la transition | moyen | moyen | facile tant qu'aucune donnée réelle n'est écrite en SQL |
| 5 | **Instance Cloud SQL** dans la maison du client BTP (Paris, sauvegardes activées, restauration essayée, alerte de budget) | petit | faible | facile (supprimer l'instance) ; **coût dès la création** : accord de Jérôme |
| 6 | **Socle (personnes, organisations) chez le client BTP**, dans Cloud SQL. Il ne s'en sert pas encore : **pas de migration** si l'espace est vide | moyen | moyen | facile tant que peu de données ; ensuite, une copie inverse serait à écrire |
| 7 | **Dossiers** : tables, écran Réalisations (« chantiers » chez le client BTP) sans vente, retrait de `dependances: ['affaires']` | gros | moyen | moyen |
| 8 | **Socle chez le client rendez-vous** : le module Rendez-vous lit `CRM.etat.personnes` (`js/modules/rdv/creation.js:21`) ; la même façon de lire doit rester. Ses fiches existantes : migration avec l'accord de Jérôme | moyen | **fort** (SMS planifiés qui lisent les numéros) | difficile après la bascule (données neuves écrites en SQL) |
| 9 | **Ventes** dans `dossiers`, avec « 1 vente → plusieurs réalisations » à l'écran (fiche de la vente : liste des réalisations) | gros | moyen | moyen |
| 10 | **Achats et Pilotage** de Supabase vers Cloud SQL, chez Jérôme (peut passer **avant** l'étape 5 comme essai de la porte : question 6) | moyen | moyen (vrais IBAN) | possible tant que Supabase est gardé en lecture |
| 11 | **Plateforme clients** (la cliente CRM) : instance, migration avec l'accord de Jérôme | moyen | fort | difficile |
| 12 | **CRM de Jérôme en dernier** : migration de toutes ses fiches, accord écrit, **jamais de nuit** ; le Devis reste dans Firestore et garde ses liens grâce aux identifiants conservés (C.4) | gros | **fort** | difficile : on garde Firestore intact, en lecture, plusieurs semaines |
| 13 | Retirer le badge `espace_base`, `baseAccorderAcces`, et le code Firestore devenu inutile | petit | faible | facile |

Pour chaque migration de données réelles : un **comptage avant / après**, une **restauration essayée**, l'ancien Firestore **gardé intact**.

---

## F. Coûts

| Poste | Ce qu'on sait | Source |
|---|---|---|
| Plus petite instance Cloud SQL | Environ **9,37 $ par mois** (un cœur partagé, environ 0,6 Go de mémoire) ; « probablement trop petit pour un client » | `docs/etude-une-maison-par-client.md`, 10 bis.3 (page Google lue le 25/11/2026) : **à revérifier sur la page de prix Google**, pour la région Paris |
| Instance de taille utile | — | **à vérifier sur la page de prix Google** |
| Stockage, sauvegardes, retour à un instant donné | — | **à vérifier sur la page de prix Google** |
| Essai gratuit | 3 mois, conditions strictes (5 essais par compte de facturation) | même étude : **à revérifier** |
| Fonctions serveur de la porte | Paiement à l'usage | **à vérifier** |
| Nombre d'instances | Une par maison + une pour la plateforme clients + une pour Jérôme | déduit de C.5 |
| Ce qu'on économise | Supabase (offre gratuite aujourd'hui chez Jérôme : économie nulle tant que l'appli BTP reste dessus) | étude du 25/11, 2.3 |

**Règle** : une instance coûte **même si personne ne s'en sert**. Ne pas créer l'instance d'un client avant d'en avoir besoin.

---

## G. Risques, et ce qui ferait renoncer ou attendre

### G.1 Risques

| Risque | Pourquoi | Parade |
|---|---|---|
| L'écran ne se met plus à jour tout seul | Cloud SQL ne prévient personne | Le « signal » Firestore (section B), testé avec l'assistant MCP qui écrit pendant que l'écran est ouvert |
| Une faille dans la porte ouvre les données d'un autre espace | Toute la sécurité passe par elle | Sécurité par ligne dans la base **en plus** ; tests « A ne voit rien de B » repris pour chaque table ; Fable |
| L'espace du client précédent reste posé sur une connexion réutilisée | Réserves de connexions | Réglages posés **dans la transaction** (`REGLES.md`, déjà écrit) |
| Deux sources de vérité pendant la transition | Devis et Rendez-vous dans Firestore, fiches dans SQL | Identifiants conservés (C.4) ; interrupteur par espace (étape 4) |
| Perte du contrôle « modifié entre-temps » | Repoussé à « plus tard » dans le plan | À faire dans l'étape 3 |
| Les 87 tests d'écran à réécrire | Ils attendent le faux Firestore | Interface identique côté écran ; Postgres jetable dans GitHub |
| Lenteur au premier chargement | Démarrage à froid d'une fonction + connexion à la base | À mesurer à l'étape 3 ; une instance minimale toujours allumée si besoin (coût) |
| Coût fixe par client | Une instance par maison | Créer l'instance seulement quand le client en a besoin |
| Le client voit « affaire » ou « projet » | Vocabulaire pas encore codé | Étape 1 avant tout écran « dossiers » chez un client |
| Restauration jamais essayée | Aucune restauration Firestore essayée non plus (`docs/securite-et-pannes.md:46`) | Une restauration Cloud SQL essayée avant toute vraie donnée |

### G.2 Ce qui ferait attendre ou renoncer

1. **Attendre** si la porte (étape 3) montre une lenteur gênante à l'écran (à mesurer : une liste de personnes doit s'ouvrir aussi vite qu'aujourd'hui, ou presque).
2. **Attendre** tant que le vocabulaire n'est pas en place chez le client concerné.
3. **Attendre** tant qu'une restauration Cloud SQL n'a pas été essayée pour de vrai.
4. **Renoncer pour le CRM de Jérôme** (le garder dans Firestore) si, après les clients, le gain ne vaut pas le risque : la règle « même code chez Jérôme et chez les clients » demande alors un code qui sait lire les deux, ce qui coûte cher à entretenir. À trancher **après** l'étape 11, pas avant.
5. **Renoncer à « tout en SQL »** si le coût fixe par client dépasse ce que le client paie (prix à vérifier).

---

## H. Questions à trancher par Jérôme

| N° | Question | Ma recommandation |
|---|---|---|
| 1 | Nom technique des deux types de dossier ? | `commercial` et `realisation` (« vente » est un mot affiché chez le client BTP) |
| 2 | Un seul niveau de parent (une vente → des réalisations), ou des niveaux libres ? | **Un seul niveau** (plus simple à afficher et à vérifier) |
| 3 | Identifiants : garder ceux de Firestore (texte), ou uuid neufs ? | **Garder ceux de Firestore** (écart écrit à la règle 11) |
| 4 | Une instance Cloud SQL par maison, une base, `espace_id` partout ? | **Oui** |
| 5 | Les « chantiers » des Achats deviennent-ils les réalisations (avec une vue `chantiers` pour la compatibilité) ? | **Oui** |
| 6 | Commencer par Achats chez Jérôme comme essai de la porte (données déjà en SQL, seul Jérôme s'en sert) ? | **Oui**, sur une copie, avant le client BTP |
| 7 | n8n écrit-il en SQL directement, ou en passant par la porte ? | **Par la porte** (la base n'est pas ouverte à Internet) |
| 8 | L'appli BTP séparée reste-t-elle sur Supabase ? | Oui tant qu'elle sert ; à éteindre quand l'OS la remplace |
| 9 | Le vocabulaire par client passe-t-il avant « dossiers » ? | **Oui**, c'est un préalable |
| 10 | Le « signal » Firestore pour garder l'écran à jour en direct ? | **Oui** |
| 11 | Les outils MCP gardent-ils leurs noms (`creer_affaire`, `creer_projet`) ? | **Oui** (noms jamais changés, descriptions dans le mot du client), comme le plan du vocabulaire |
| 12 | Les modèles d'affaires et de projets restent-ils dans Firestore (réglages) ? | **Oui** |
| 13 | Le CRM de Jérôme : migration décidée maintenant, ou après les clients ? | **Après les clients** (étape 12), avec son accord écrit |
| 14 | Qui paie l'instance Cloud SQL de chaque client ? | Lié à la décision 6 de l'étude du 25/11 : à trancher avant le premier contrat |

---

## Ce que cette étude n'a pas vérifié

| Point | Pourquoi |
|---|---|
| Nombre de fiches dans chaque espace | Bases non lues |
| Modules allumés chez la cliente de la plateforme | Console non lue |
| Où vivent le client BTP et le client rendez-vous (maison ou plateforme) | Non écrit dans le dépôt |
| Contenu de la table `chantiers` de l'appli BTP | Base non lue |
| Prix Cloud SQL par région, durée et prix des sauvegardes | Page de prix Google non relue ; seul chiffre repris de l'étude du 25/11 |
| Vitesse de la porte (démarrage à froid, connexion) | Rien n'est construit |
| Ampleur exacte du vocabulaire aujourd'hui | Mesure du 24/10 non refaite |
| Que `functions-plateforme/` reçoit bien tout le code de `functions/src/coeur/` | Le dossier n'en contient pas de copie visible : copié par `scripts/preparer-fonctions.js` (non relu) |

---

## Décisions de Jérôme (26/11/2026), après lecture de l'étude

| N° | Décision |
|---|---|
| 1 | Noms techniques : on garde `affaire` et `projet` (déjà dans le code et dans les noms des outils MCP). Le client ne voit jamais ces noms : il voit son mot (« chantier », « dossier client »…). Un futur troisième type = une valeur de plus dans la case « type ». |
| 2 | Un seul niveau de parent. La base permet **plusieurs projets par affaire** dès le départ ; l'écran reste à « une affaire → un projet » tant que le besoin ne se présente pas. |
| 3 | Identifiants actuels des fiches gardés. |
| 4 | **Une base Cloud SQL par bâtiment** (une maison = un client ; l'immeuble = la plateforme clients, plusieurs clients dans la même base), `espace_id` sur chaque ligne partout, même dans une maison à un seul client. |
| 4 bis | `espace_id` technique : **3 à 8 caractères, minuscules et chiffres**, lisible (le nom court du client, pas un numéro), choisi à la création, jamais changé, jamais réutilisé. Les espaces actuels aux noms longs reçoivent leur code court au déménagement ; une table fait le lien ancien nom ↔ code court. |
| 5 à 13 | Recommandations de l'étude acceptées (chantiers des Achats → projets ; essai avec Achats d'abord ; n8n passe par la porte ; appli BTP séparée inchangée pour l'instant ; vocabulaire avant dossiers ; signal pour l'écran en direct ; noms des outils MCP gardés ; modèles dans les réglages ; CRM de Jérôme en dernier). |
| 14 | Qui paie : chaque maison est payée par son client ; la base de l'immeuble est payée par Jérôme (clients partenaires gratuits pour l'instant, pas d'abonnement). |

Où vivent les clients : le client rendez-vous et la cliente CRM sont dans l'immeuble ; le client BTP aura sa propre maison.
