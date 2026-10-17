# Module Automatisations : historique des workflows n8n (chantier 14, phases 1 et 2)

> **Renommage du 16/10/2026** : ce module s'appelait `journal` dans le code (et « journal d'activité des workflows » dans cette page). Il s'appelle maintenant **`automatisations`**, comme son menu, pour ne plus le confondre avec l'écran **« Journal » du CRM** (historique des modifications et restauration, `docs/journal-ecran.md`), qui garde son nom. Ce qui change : l'identifiant du module, les routes (`automatisations/historique`), les dossiers (`js/modules/automatisations/`, `css/automatisations.css`), les trois fonctions Firebase (`automatisationsCopieHoraire`, `automatisationsRafraichir`, `automatisationsRenommer`) et ce fichier. Ce qui **ne change pas** : les collections Firestore (`workflows`, `executions`, `sync`, `plateforme_journal/signalements`), l'étiquette n8n `client-<identifiant>`, la clé `N8N_API_KEY`, et le préfixe « Journal : » des messages dans les journaux Google Cloud (l'alerte e-mail le cherche). **Compatibilité** : un client dont la fiche dit encore `journal: true` garde son module (voir la partie 3), et les anciens liens `…/journal/historique` sont redirigés.

Chaque client voit, dans son espace, ce que font ses automatisations n8n : ce qui tourne **en ce moment** et l'**historique**. L'application ne parle jamais à n8n : elle lit une **copie** rangée dans Firebase. Cahier des charges de Jérôme : <https://claude.ai/artifact/DqhJ4UZ4sucD93d2z7F56H>.

**État : tout est écrit et testé sur des émulateurs avec un FAUX n8n. Rien n'est déployé, aucun appel réel à n8n, aucune écriture dans la vraie base.** Les étapes pour mettre en service sont dans la partie 7 (c'est à toi, Jérôme, de les faire). Depuis le 16/10/2026 le module est aussi **visible dans ton propre OS** (menu « Automatisations »), avec un écran vide tant que tes workflows ne sont pas copiés (partie 10).

---

## 1. Comment ça marche (en simple)

```
n8n  ──(lecture seule, toutes les heures + à chaque « Rafraîchir »)──►  fonctions Firebase  ──►  Firestore  ──►  l'écran du client
```

- **Trois fonctions Firebase** (dossier `functions-plateforme/`, projet `chevalier-ia-app`, région Paris) :
  - `automatisationsCopieHoraire` : tourne **toutes les heures** et copie l'historique de tous les clients qui ont le module.
  - `automatisationsRafraichir` : appelée par le bouton **« Rafraîchir l'historique »** et par la mise à jour automatique de l'écran.
  - `automatisationsRenommer` : change le nom affiché d'une automatisation (partie 4).
- **L'écran** (module `automatisations`, menu « Automatisations » > « Historique ») lit Firestore **en direct** : dès que le serveur écrit, la liste change sans recharger. Tant que la page est visible et la case « Mise à jour automatique (10 s) » cochée, elle demande une copie au serveur toutes les 10 secondes (le serveur refuse poliment si la dernière date de moins de 10 secondes).
- **Les fonctions ne font que LIRE n8n** (requêtes `GET`). Un test échoue si le code emploie un autre verbe. n8n n'est jamais modifié, jamais relancé.

### Ce qui est copié dans Firebase (et ce qui ne l'est jamais)

Sous `clients/<client>/` :

| Document | Contenu |
|---|---|
| `executions/<numéro>` | une ligne par exécution : numéro, workflow et son nom, **état**, `stale` (« à vérifier »), mode de déclenchement, début, fin, durée, relance d'origine, message d'erreur et étape en échec (courts, seulement pour les erreurs), `runGroupId` (vide), `source`, `lastSyncedAt`, `expireAt` (vide) |
| `executions/<numéro>/steps/…` | **préparé pour la phase 3, vide** |
| `workflows/<id>` | `nom` (celui de n8n), `libelle` (le nom choisi par le client, voir partie 4), `active`, `stepsPlan` (vide) |
| `sync/state` | où en est la copie : dernière copie, n8n joignable ou non, verrou, curseurs |

**Jamais dans Firebase** : le contenu des données traitées (noms, e-mails, photos…), la définition des workflows, les identifiants des connexions, la clé de n8n. La liste de n8n renvoie la définition complète de chaque workflow : le code la lit puis la **jette** aussitôt, en ne gardant que l'identifiant, le nom, « actif ou non » et les étiquettes. Un test écrit des données personnelles et de faux secrets dans le faux n8n, lance la copie, puis relit **toute** la base : aucune trace.

Pas de limite de conservation pour l'instant (`expireAt` reste vide). Pas de mesure RGPD (décision de Jérôme du 04/10/2026).

### Les états

Ceux de n8n, **tels quels** : `new` (Démarrée), `running` (En cours), `waiting` (En attente), `success` (Terminée), `error` (En erreur), `canceled` (Annulée), `unknown` (Inconnu). Un plantage (`crashed`) est affiché « En erreur ». S'y ajoute **« À vérifier »** (`stale`) : une exécution « en cours » depuis **plus de 10 minutes**. L'écran le recalcule à chaque seconde, donc elle passe en « À vérifier » même entre deux copies. Une exécution « En attente » (nœud *Wait*) n'est jamais « à vérifier ».

### Pas de doublon

Chaque exécution est écrite dans un document qui porte **son numéro**, avec « remplace ou crée » : la copier deux fois ne change rien. De plus, un **verrou** dans `sync/state` empêche deux copies de tourner en même temps pour un même client (il expire tout seul après 3 minutes si une copie plante).

### Si n8n ne répond pas

La copie garde les dernières données, note « n8n injoignable » dans `sync/state`, et l'écran affiche le **bandeau jaune** : « n8n ne répond pas pour le moment. Vous voyez les données de HH:MM:SS. » (la phrase « Nous sommes prévenus » a été retirée le 11/10/2026 : un e-mail reçu n'est pas un e-mail lu). L'erreur est aussi écrite dans les journaux de Google Cloud (gravité *ERROR*, message commençant par « Journal : »), et **une alerte envoie un e-mail à Jérôme** (voir ci-dessous).

---

## 2. Rattacher un workflow à un client : l'ÉTIQUETTE

Dans n8n, sur le workflow : **ajouter l'étiquette `client-<identifiant du client>`**, par exemple `client-audrey` pour le client dont l'identifiant est `audrey`. C'est tout. Il n'y a pas de commande « ajouter-workflow ».

| Situation | Ce qui se passe |
|---|---|
| Une étiquette `client-audrey`, client connu **avec** le module automatisations | le workflow est copié chez `audrey` |
| **Aucune** étiquette de client | **jamais copié** (cas normal des workflows de Jérôme) |
| Étiquette d'un client **inconnu** | ignoré et **signalé** (raison `client-inconnu`) |
| Étiquette d'un client **sans** le module | ignoré et signalé (`sans-module`) |
| **Deux** étiquettes de client sur le même workflow | **refusé** pour les deux, signalé (`deux-clients`) |
| Étiquette mal écrite (`client-`, `client-A B`) | ignoré et signalé (`etiquette-invalide`) |
| On **change** l'étiquette d'un workflow | les anciennes exécutions **restent chez l'ancien client** ; les nouvelles vont chez le nouveau |

Les signalements sont écrits dans le document `plateforme_journal/signalements` (lisible par toi seul dans la console, jamais par un client, car il nomme les étiquettes de plusieurs clients) et dans les journaux Cloud. Les majuscules sont acceptées (`Client-Audrey` = `client-audrey`).

Les **dossiers et projets** de n8n ne servent pas (ta formule n8n n'a pas de projets ; les dossiers ne sont pas visibles par l'API).

### ⚠ Limite : 24 caractères

n8n limite le nom d'une étiquette à **24 caractères** (vérifié dans le code de n8n, `TagEntity`). `client-` en prend 7 : **l'identifiant d'un client qui a le module automatisations tient donc en 17 caractères au plus**, alors qu'un identifiant peut aller jusqu'à 40. Conséquence : pour un client au nom long (`cabinet-de-conseil-martin`), choisis un identifiant court (`cabinet-martin`). L'outil « nouveau client » **refuse** d'activer le module automatisations sur un identifiant trop long, en le disant. Le nom affiché du client (page, menu) reste, lui, aussi long que tu veux.

---

## 3. Activer le module chez un client

Avec l'outil du chantier 13 (voir `docs/nouveau-client.md`) :

```bash
node scripts/nouveau-client.js activer-module audrey automatisations          # simulation
node scripts/nouveau-client.js activer-module audrey automatisations --ecrire # pour de vrai
```

ou, à la création : `--modules affaires,projets,automatisations`. Le module n'a pas de dépendance.

**Ancien nom** : l'outil accepte encore `journal` (`activer-module audrey journal` active `automatisations`). Une fiche client écrite avant le renommage (`modules: { journal: true }`) est comprise telle quelle par l'application et par les fonctions : **rien à migrer à la main**. Si les deux clés sont présentes, la nouvelle (`automatisations`, vraie ou fausse) l'emporte. La prochaine fois que tu passes par l'outil pour ce client, il écrit `automatisations` ; la vieille clé `journal` reste dans la fiche sans gêner (tu peux la supprimer dans la console Firestore quand tu veux).

Ton propre OS (le CRM de Jérôme) n'a pas de fiche `modules` : il montre le module Automatisations en permanence (partie 10).

---

## 4. Renommer une automatisation

Par défaut, l'écran affiche le **nom du workflow dans n8n**. Un **éditeur** du client (pas un lecteur) peut **cliquer sur le nom** pour le changer ; laisser le champ vide revient au nom d'origine.

- Le nom choisi est gardé dans `clients/<client>/workflows/<id>`, champ `libelle`. La copie horaire **ne l'écrase jamais** (le champ `nom`, lui, suit n8n). **n8n n'est jamais modifié.**
- C'est la fonction `automatisationsRenommer` qui l'écrit, après avoir vérifié que l'appelant est **éditeur de ce client** et que le workflow existe déjà chez lui. Elle ne modifie **que** ce champ, 80 caractères au plus, texte simple.
- C'est la **seule écriture** possible depuis un écran. Les règles Firestore interdisent toute écriture dans `workflows`, `executions` et `sync` depuis un navigateur, même à un éditeur.

---

## 5. Sécurité en bref

- **Un client ne voit que ses données** : les règles Firestore ne lisent que `clients/<son client>/…` ; la copie range chaque exécution chez le client de l'étiquette. Testé avec plusieurs clients (règles, copie, écran).
- **« Rafraîchir »** ne reçoit **aucun** nom de client : le serveur retrouve les clients de l'appelant par son adresse e-mail vérifiée et ses fiches de membre. Un inconnu reçoit « Action non autorisée. ».
- **Délai de 10 secondes** entre deux rafraîchissements, par client (pas par personne).
- Les fonctions n'ont **aucune porte dérobée** et ne touchent pas au CRM de Jérôme (autre projet, autre dossier de fonctions).

---

## 6. Ce qui est testé, et ce qui ne l'est pas

Testé sur émulateur, avec un **faux n8n** (petit serveur local) : isolation entre clients, pas de doublon, verrou, « à vérifier », états, erreurs (message et étape), étiquettes invalides, aucun contenu ni secret écrit, n8n en panne / coupé / trop lent / clé refusée, **seulement des GET**, rafraîchissement par l'identité, délai de 10 s, renommage réservé aux éditeurs du bon client, règles Firestore, écran (ordinateur et téléphone), outil « nouveau client ».

**Pas testé** (impossible sans toucher aux vrais services) : le vrai n8n (la forme exacte de ses réponses a été lue dans la documentation et d'après ton essai du 11/10/2026 ; le faux n8n l'imite), le déploiement sur Google Cloud (planificateur, secret, droits), les fonctions appelables **par le vrai SDK** depuis un navigateur (l'écran a été essayé avec des réponses simulées), l'alerte e-mail sur une **vraie** panne de n8n (testée seulement avec une erreur écrite à la main dans les journaux, le 11/10/2026 : l'e-mail est bien arrivé).

---

## 7. Mise en service : ce que tu fais, dans l'ordre

À faire **après** avoir dit « fusionne » (attention : toute fusion dans `main` redéploie automatiquement le CRM, c'est normal et sans effet sur le journal).

### a. Publier les règles et la page (workflow existant)

GitHub > <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions> > *Déploiement plateforme clients* > *Run workflow* > choix **`tout`** (page + règles). Les nouvelles règles ferment l'écriture du journal.

### b. Déposer la clé de n8n dans Secret Manager (sans jamais me la montrer)

Dans le Terminal, dans le dossier du projet (une fois `firebase login` fait) :

```bash
firebase functions:secrets:set N8N_API_KEY --project chevalier-ia-app
```

Le programme te **demande la valeur** : colle ta clé n8n (elle ne s'affiche pas à l'écran) puis Entrée. Rien n'est écrit dans un fichier ni dans l'historique du Terminal. Si Firebase demande d'activer l'API *Secret Manager*, réponds oui.

Variante avec `gcloud` (même résultat ; la valeur est lue sur l'entrée du clavier, tape-la puis `Ctrl+D`) :

```bash
gcloud secrets create N8N_API_KEY --project chevalier-ia-app --replication-policy=automatic --data-file=-
```

Contrôle sans afficher la valeur : <https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-app> doit lister `N8N_API_KEY` (version 1 « activée »). La clé n8n expire : quand tu la renouvelles, relance la première commande, puis redéploie les fonctions (étape c) pour qu'elles prennent la nouvelle version.

### c. Déployer les fonctions

Le plus simple, la première fois, depuis ton Mac (tu es propriétaire du projet, donc tous les droits sont là) :

```bash
npm ci --prefix functions-plateforme
firebase deploy --only functions:plateforme --config firebase.plateforme.json --project chevalier-ia-app
```

Firebase propose d'activer des services Google (Cloud Functions, Cloud Build, Cloud Scheduler, Artifact Registry…) : réponds oui. Le **forfait Blaze** est requis (c'est déjà le cas).

Variante par GitHub : *Run workflow* > choix **`fonctions`**. Elle exige que le compte de service du secret GitHub ait les droits « Administrateur Cloud Functions », « Utilisateur du compte de service », « Administrateur Cloud Scheduler » et « Administrateur Secret Manager » ; fais d'abord le premier déploiement depuis le Mac, c'est plus simple.

Le choix `tout` du workflow ne déploie **jamais** les fonctions.

### d. Étiqueter un workflow de test et activer le module

1. Dans n8n, ajoute l'étiquette `client-<identifiant du client de test>` à un workflow de test (partie 2).
2. Active le module : `node scripts/nouveau-client.js activer-module <client> automatisations --ecrire`.
3. Ouvre `https://chevalier-ia-app.web.app/espace/<client>`, connecte-toi, clique **Automatisations > Historique** puis **Rafraîchir l'historique**.
4. Prévois deux workflows de test : un **lent** (une pause de quelques dizaines de secondes, pour voir la pastille « En cours » qui pulse) et un qui **échoue volontairement** (pour voir l'étape et le message d'erreur).

### e. Si quelque chose se passe mal

- **Écran vide** : le workflow a-t-il l'étiquette exacte ? Le module est-il actif ? Regarde `plateforme_journal/signalements` dans la console Firestore.
- **Bandeau jaune permanent** : clé absente ou refusée. Journaux : <https://console.cloud.google.com/functions/list?project=chevalier-ia-app> > `automatisationsRafraichir` > *Journaux*.
- **Anciennes fonctions encore en ligne** : si tu avais déjà déployé les fonctions sous leurs anciens noms (`journalCopieHoraire`, `journalRafraichir`, `journalRenommer`), le déploiement des nouvelles ne les retire pas : supprime-les avec `firebase functions:delete journalCopieHoraire journalRafraichir journalRenommer --project chevalier-ia-app` (sinon la copie horaire tournerait en double). Le premier déploiement décrit en partie 7 n'avait pas encore eu lieu au 16/10/2026, donc normalement rien à supprimer.
- **Tout arrêter** : *Run workflow* n'a pas de bouton d'arrêt ; supprime les fonctions avec `firebase functions:delete automatisationsCopieHoraire automatisationsRafraichir automatisationsRenommer --project chevalier-ia-app`, ou désactive le module chez le client (`desactiver-module <client> automatisations --ecrire`) : plus rien ne lui est copié.

---

## 8. Coût et limites à connaître

- Une page ouverte et visible demande une copie **toutes les 10 secondes** ; chaque copie lit la liste des workflows du client (réponse lourde de n8n, jetée aussitôt) puis seulement les exécutions nouvelles. Volume faible attendu ; si un client ouvre beaucoup de pages, on pourra espacer (le délai est un seul réglage : `DELAI_MINI_RAFRAICHISSEMENT_MS` côté serveur, `DELAI_RAFRAICHIR_MS` côté écran).
- Première copie d'un workflow : ses **200 dernières** exécutions. Ensuite, au plus **500 nouvelles par passage** et par workflow (au-delà, `sync/state.tronque` passe à `true`).
- L'écran affiche les **300 exécutions les plus récentes**.
- n8n garde 14 jours d'historique : avec une copie toutes les heures, rien ne se perd.

## 9. Phase 3 (pas faite)

Le Logger dans les workflows et la frise d'étapes. Rien à changer pour l'ajouter plus tard : la sous-collection `steps` et le champ `runGroupId` existent déjà, vides ; la règle Firestore ferme déjà `steps` à l'écriture navigateur.

## Alerte e-mail quand n8n tombe (mise en place le 11/10/2026)

- **Ce qui se déclenche** : toute erreur de gravité *ERROR* dont le message contient « Journal : » dans les journaux de Google Cloud (projet `chevalier-ia-app`) : n8n qui ne répond pas, **clé n8n expirée ou refusée** (même message), liste des workflows illisible, erreur inattendue. Les simples avertissements (workflow ignoré, cause d'erreur illisible) ne déclenchent rien.
- **Qui est prévenu** : `jerome.chevalier@gmail.com`, par e-mail de « Google Cloud Alerting » (regarde aussi les courriers indésirables).
- **Fréquence** : un e-mail à l'ouverture de la panne, puis **un rappel au plus une fois par jour** tant que les erreurs continuent. Il n'y a **pas d'e-mail de retour à la normale** (Google ne le permet pas pour ce type d'alerte) : pour vérifier, ouvre l'espace d'un client et regarde si le journal se remet à jour.
- **Où la voir ou la modifier** : Google Cloud > Surveillance (Monitoring) > Alertes > règles > « Journal des workflows : n8n injoignable ou erreur de copie » ; le destinataire est dans *Canaux de notification*. Elle a été créée par l'API de Monitoring avec les identifiants d'administrateur, pas par le code du dépôt : elle n'est pas recréée par un déploiement.
- **Que faire quand l'e-mail arrive** : le texte de l'e-mail le dit (n8n en panne : relancer ; clé refusée : nouvelle clé dans n8n > Settings > n8n API, puis `firebase functions:secrets:set N8N_API_KEY --project chevalier-ia-app` et redéploiement des fonctions).
- **Tester sans casser n8n** : écrire une fausse erreur dans les journaux. L'alerte reconnaît le type de journal des fonctions (`cloud_run_revision`) ; une entrée de type « global » n'a pas déclenché l'alerte lors du premier essai.

## 10. Chez Jérôme (Chevalier IA OS) : tes workflows et la vue administrateur (2.7.0, 17/10/2026)

Règle posée le 16/10/2026 : **tout module existe d'abord chez toi (bêta-testeur), puis s'ouvre aux clients**. Depuis la 2.7.0, la copie de **tes** workflows et la vue de **tous** les propriétaires sont codées et testées ; **rien n'est déployé** (partie 11 : ce que tu dois faire).

### Même code partout
Le code qui lit n8n, reconnaît le propriétaire et copie vers Firestore est **le même** pour toi et pour les clients (`functions-plateforme/src/`, copié tel quel dans `functions/partage/automatisations/` par `scripts/preparer-fonctions.js`). Seul l'endroit d'écriture change :

| Propriétaire | Où la copie est écrite | Quelle fonction |
|---|---|---|
| un client (`audrey`) | `clients/audrey/…` dans **Chevalier IA APP** (projet `chevalier-ia-app`) | `automatisationsCopieHoraire` (inchangée) |
| toi (`interne`) | à la **racine** de **Chevalier IA OS** (`workflows`, `executions`, `sync`, projet `chevalier-ia-os`) | `automatisationsInterneHoraire` (nouvelle, toutes les heures) |

Avec tout l'historique, comme pour les clients (pas de lecture à la volée). Le choix « où lire » est fait par source : un autre serveur n8n pourra s'ajouter plus tard en ajoutant une source, sans toucher à l'écran (non codé).

### Comment un workflow est reconnu : trois signes qui doivent concorder
| Signe | Pour toi (`interne`) | Pour un client (`audrey`) |
|---|---|---|
| **(a) Étiquette n8n** | `interne` | `client-audrey` (comme avant) |
| **(b) Nom du workflow** | commence par `interne-` (exigé) | peut commencer par `audrey-` ou `client-audrey-` (convention de la porte) ; **pas exigé** (compatibilité : la doc n'a jamais imposé de nom) |
| **(c) Clé de la porte** : le credential que les nœuds utilisent | `Clé n8n - interne` (exigé) | `Clé n8n - audrey` ; **pas exigé** (compatibilité), mais s'il y en a un il doit être le bon |

Le nom du credential est comparé **sans tenir compte** des majuscules, des accents, des espaces ni du type de tiret : « Clé n8n - interne », « CLE N8N – Interne » et « cle n8n-interne » sont le même. Seuls les **noms** des credentials sont lus dans n8n (jamais leur contenu).

Ce qui se passe :
- **Les trois concordent** → copié chez le bon propriétaire.
- **Aucun signe** → ignoré sans bruit (cas normal d'un brouillon).
- **Un signe manque ou en désigne un autre** (ex. nom `interne-…` sans l'étiquette `interne`, ou étiquette `client-audrey` avec la clé `interne`) → **jamais copié**, et rangé dans **« À vérifier »** avec la raison en français simple (« Il manque : l'étiquette « interne » »). Pour un client, une étiquette de client sans module ou inconnu, ou deux étiquettes, restent signalés comme avant.
- Le dossier n8n **« Audrey »** : ses workflows portent `client-audrey` / « Clé n8n - Audrey », donc **jamais** copiés chez toi. S'il leur manque l'étiquette, ils sont signalés « étiquette manquante » (pour Audrey, pas pour toi).

**⚠ À vérifier avec toi :** le nom exact du credential `interne` dans ton n8n n'est pas confirmé (« Clé n8n - interne » est le nom prévu par `porte-cles.md`). Si le tien s'appelle autrement (« Clé n8n - Jérôme » par exemple), renomme-le dans n8n (*Credentials*), ou dis-le-moi et on adapte la règle. Tant que ça ne concorde pas, tes workflows apparaissent dans « À vérifier » avec cette raison : c'est le bon test.

### Mises au point du 17/10/2026 (version 2.7.3, après l'essai réel)
- **Le credential est reconnu par son IDENTIFIANT d'abord** (`IDENTIFIANTS_CLES` dans `etiquettes.js`), puis par son nom. Raison : n8n recopie le *nom* du credential dans chaque nœud quand on le choisit ; **renommer ensuite le credential ne met pas les workflows à jour** (ils affichaient encore « Clé n8n - Jérôme »). L'identifiant, lui, ne change jamais. La clé `interne` de la porte est donc reconnue même avec l'ancien nom. L'API publique de n8n ne permet pas de retrouver le nom à jour à partir de l'identifiant.
- **Deux catégories bien séparées, avec les mêmes mots partout** : **« Workflows non reconnus (n) »** (à corriger dans n8n) et **« Clients sans le module (n) »** (workflow en règle d'un client qui n'a pas le module : rien à corriger). Le mot « à vérifier » ne désigne plus que les **exécutions** (compteur « exécutions à vérifier », état « À vérifier »).
- **Chaque carte donne le vrai nom du workflow** et **une ligne par signe** : ✔ concorde / ✘ manque ou diverge (étiquette : présente ou absente et lesquelles ; nom : commence par quoi ; clé : credentials lus et attendu). Le dossier n8n n'est pas affiché : l'API n8n ne le fournit pas.
- **Source unique** : la copie interne (horaire et bouton Rafraîchir) lit la liste complète de n8n et juge **tous** les workflows (les tiens aux trois signes, ceux des clients comme leur propre copie), puis écrit le résultat dans ta base. Les anciens signalements au format sans nom, écrits par l'ancienne version des fonctions de la plateforme, ne sont plus affichés. Si la base des clients n'est pas lisible, les workflows des clients ne sont pas jugés (pas de faux « client inconnu »).

### Ce que tu vois (menu Automatisations > Historique)
- **Avec ton compte** (`jerome.chevalier@gmail.com`, le seul administrateur ; le compte d'assistant ne l'est pas) : un **filtre « propriétaire »** : *Tous les propriétaires*, *Interne (toi)*, un client par son nom, et **À vérifier (n)**. Chaque ligne porte une pastille du propriétaire. Un rappel jaune « n workflows à vérifier : voir pourquoi » mène à la catégorie. Le bouton **Rafraîchir** recopie **tes** workflows maintenant (les clients sont copiés toutes les heures par leur propre fonction). Les clients sont **relus toutes les 30 secondes** tant que la page est visible.
- **Les clients ne voient que leurs workflows** (inchangé). Jamais le contenu des données : seulement noms, états, erreurs, étapes.
- **La base des clients n'est jamais écrite** depuis Chevalier IA OS : la fonction lit avec un compte qui n'a que le droit de lecture (voir partie 11), et un test compare la base avant/après.
- Compte d'assistant : écran vide propre comme avant (pas de filtre, pas de bouton, aucun appel).

### Les deux fonctions (projet `chevalier-ia-os`, `functions/src/automatisations/appels.js`)
- `automatisationsInterneHoraire` : toutes les heures, liste les workflows de n8n, garde ceux aux trois signes, copie, écrit les « À vérifier » dans `plateforme_journal/signalements` de ta base.
- `automatisationsAdmin` (appelable, administrateur seulement, refus neutre sinon) : `lire` (clients + « À vérifier » des deux bases, lecture seule, 300 exécutions les plus récentes) et `rafraichir` (tes workflows).
- Clé n8n : **la même `N8N_API_KEY`**, mais un **secret du même nom dans chevalier-ia-os** (le secret de chevalier-ia-app n'est pas visible de l'autre projet).
- **Interrupteur** `AUTOMATISATIONS_EN_SERVICE` dans `functions/src/index.js` : **`false` pour l'instant**. Pourquoi : chaque fusion dans `main` déploie toutes les fonctions de `functions/` ; si le secret ou le compte de service n'existe pas encore, le déploiement échouerait et le CRM ne se mettrait plus à jour. Il passe à `true` dans une petite PR, après la partie 11. D'ici là, l'écran affiche tes workflows (vides) et le bandeau « Les clients ne sont pas lisibles pour le moment ».

**Règles Firestore : aucune modification.** Tes règles actuelles (« tout le reste : tes deux comptes ») couvrent déjà la lecture de `workflows`, `executions`, `sync` et `plateforme_journal`. Les clients ne sont pas lus par le navigateur mais par la fonction (SDK d'administration).

**Sauvegarde** : ces collections (copie de n8n, refaisable) ne sont pas dans l'export JSON du CRM.

### Plus tard : un autre serveur
La vue lit « par source » (ta base, la base des clients). Un second serveur = une source de plus dans `lireVueAdministrateur` et une fonction de copie. Rien n'est codé pour ça.

---

## 11. Guide pour Jérôme : mettre en service tes automatisations (à faire dans l'ordre)

Rien ici ne touche à tes données existantes. Compte ~20 minutes.

**1. Déposer la clé n8n dans chevalier-ia-os** (la même clé que pour chevalier-ia-app, sans la montrer à personne). Dans le Terminal, dans le dossier du projet :

```bash
firebase functions:secrets:set N8N_API_KEY --project chevalier-ia-os
```

Le Terminal te demande la valeur : colle la clé (champ caché, rien ne s'affiche) puis Entrée. Contrôle : <https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os> doit lister `N8N_API_KEY`.

**2. Créer le compte de service** : <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=chevalier-ia-os>
- Nom : `automatisations-serveur` (l'adresse sera `automatisations-serveur@chevalier-ia-os.iam.gserviceaccount.com`).
- Étape « Accorder l'accès » : ajoute **Utilisateur Cloud Datastore** (*Cloud Datastore User*). *OK*.
- Comme pour `mcp-serveur` : le compte qui déploie depuis GitHub doit pouvoir « agir en tant que » lui (rôle *Utilisateur du compte de service* sur ce compte) ; si le déploiement refuse, la phrase d'erreur le dit.

**3. Lui donner la clé** : <https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os> > clique `N8N_API_KEY` > onglet *Autorisations* > *Accorder l'accès* > principal `automatisations-serveur@chevalier-ia-os.iam.gserviceaccount.com`, rôle **Accesseur de secrets Secret Manager**.

**4. Lui donner la LECTURE SEULE des clients** : <https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-app> > *Accorder l'accès* > même adresse > rôle **Lecteur Cloud Datastore** (*Cloud Datastore Viewer*) **et rien d'autre**. C'est ce qui garantit que Chevalier IA OS ne peut jamais écrire chez les clients.

**5. n8n** (<https://n8n.chevalier-ia.fr>) : sur chacun de tes workflows de veille : étiquette `interne` ; nom commençant par `interne-` ; les nœuds qui appellent la porte utilisent le credential **« Clé n8n - interne »** (*Credentials* : vérifie son nom exact, partie 10). Ne touche pas au dossier « Audrey ».

**6. Dis-moi « active les automatisations »** : je passe l'interrupteur à `true` dans une PR ; je la fusionne seulement si les tests sont verts, et la fusion déploie les deux fonctions. Ensuite ouvre Chevalier IA OS > Automatisations : tes workflows apparaissent après la première copie (clique **Rafraîchir**), ceux qui ne concordent pas sont dans **À vérifier**.

**Si ça ne marche pas** : bandeau jaune « n'est pas lisible » = droits des étapes 2 à 4 ; liste vide = regarde « À vérifier » ; journaux : <https://console.cloud.google.com/functions/list?project=chevalier-ia-os>. Pour tout arrêter : remettre l'interrupteur à `false` (la fusion suivante supprime les deux fonctions).

