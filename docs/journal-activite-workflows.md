# Journal d'activité des workflows n8n (chantier 14, phases 1 et 2)

Chaque client voit, dans son espace, ce que font ses automatisations n8n : ce qui tourne **en ce moment** et l'**historique**. L'application ne parle jamais à n8n : elle lit une **copie** rangée dans Firebase. Cahier des charges de Jérôme : <https://claude.ai/artifact/DqhJ4UZ4sucD93d2z7F56H>.

**État : tout est écrit et testé sur des émulateurs avec un FAUX n8n. Rien n'est déployé, aucun appel réel à n8n, aucune écriture dans la vraie base.** Les étapes pour mettre en service sont dans la partie 7 (c'est à toi, Jérôme, de les faire).

---

## 1. Comment ça marche (en simple)

```
n8n  ──(lecture seule, toutes les heures + à chaque « Rafraîchir »)──►  fonctions Firebase  ──►  Firestore  ──►  l'écran du client
```

- **Trois fonctions Firebase** (dossier `functions-plateforme/`, projet `chevalier-ia-app`, région Paris) :
  - `journalCopieHoraire` : tourne **toutes les heures** et copie le journal de tous les clients qui ont le module.
  - `journalRafraichir` : appelée par le bouton **« Rafraîchir l'historique »** et par la mise à jour automatique de l'écran.
  - `journalRenommer` : change le nom affiché d'une automatisation (partie 4).
- **L'écran** (module `journal`, menu « Automatisations » > « Historique ») lit Firestore **en direct** : dès que le serveur écrit, la liste change sans recharger. Tant que la page est visible et la case « Mise à jour automatique (10 s) » cochée, elle demande une copie au serveur toutes les 10 secondes (le serveur refuse poliment si la dernière date de moins de 10 secondes).
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

La copie garde les dernières données, note « n8n injoignable » dans `sync/state`, et l'écran affiche le **bandeau jaune** : « n8n ne répond pas pour le moment. Vous voyez les données de HH:MM:SS. Nous sommes prévenus. » L'erreur est aussi écrite dans les journaux de Google Cloud (gravité *ERROR*). **« Nous sommes prévenus » n'est pas encore branché sur une alerte** (e-mail ou SMS) : à faire plus tard dans *Google Cloud > Surveillance > Alertes*, en filtrant sur « Journal : n8n injoignable ». Tant que ce n'est pas fait, la phrase est à relire avec soin.

---

## 2. Rattacher un workflow à un client : l'ÉTIQUETTE

Dans n8n, sur le workflow : **ajouter l'étiquette `client-<identifiant du client>`**, par exemple `client-audrey` pour le client dont l'identifiant est `audrey`. C'est tout. Il n'y a pas de commande « ajouter-workflow ».

| Situation | Ce qui se passe |
|---|---|
| Une étiquette `client-audrey`, client connu **avec** le module journal | le workflow est copié chez `audrey` |
| **Aucune** étiquette de client | **jamais copié** (cas normal des workflows de Jérôme) |
| Étiquette d'un client **inconnu** | ignoré et **signalé** (raison `client-inconnu`) |
| Étiquette d'un client **sans** le module | ignoré et signalé (`sans-module`) |
| **Deux** étiquettes de client sur le même workflow | **refusé** pour les deux, signalé (`deux-clients`) |
| Étiquette mal écrite (`client-`, `client-A B`) | ignoré et signalé (`etiquette-invalide`) |
| On **change** l'étiquette d'un workflow | les anciennes exécutions **restent chez l'ancien client** ; les nouvelles vont chez le nouveau |

Les signalements sont écrits dans le document `plateforme_journal/signalements` (lisible par toi seul dans la console, jamais par un client, car il nomme les étiquettes de plusieurs clients) et dans les journaux Cloud. Les majuscules sont acceptées (`Client-Audrey` = `client-audrey`).

Les **dossiers et projets** de n8n ne servent pas (ta formule n8n n'a pas de projets ; les dossiers ne sont pas visibles par l'API).

### ⚠ Limite : 24 caractères

n8n limite le nom d'une étiquette à **24 caractères** (vérifié dans le code de n8n, `TagEntity`). `client-` en prend 7 : **l'identifiant d'un client qui a le module journal tient donc en 17 caractères au plus**, alors qu'un identifiant peut aller jusqu'à 40. Conséquence : pour un client au nom long (`cabinet-de-conseil-martin`), choisis un identifiant court (`cabinet-martin`). L'outil « nouveau client » **refuse** d'activer le module journal sur un identifiant trop long, en le disant. Le nom affiché du client (page, menu) reste, lui, aussi long que tu veux.

---

## 3. Activer le module chez un client

Avec l'outil du chantier 13 (voir `docs/nouveau-client.md`) :

```bash
node scripts/nouveau-client.js activer-module audrey journal          # simulation
node scripts/nouveau-client.js activer-module audrey journal --ecrire # pour de vrai
```

ou, à la création : `--modules affaires,projets,journal`. Le module n'a pas de dépendance. Il n'existe **pas dans le CRM de Jérôme** (il n'apparaît ni dans son menu ni dans ses routes).

---

## 4. Renommer une automatisation

Par défaut, l'écran affiche le **nom du workflow dans n8n**. Un **éditeur** du client (pas un lecteur) peut **cliquer sur le nom** pour le changer ; laisser le champ vide revient au nom d'origine.

- Le nom choisi est gardé dans `clients/<client>/workflows/<id>`, champ `libelle`. La copie horaire **ne l'écrase jamais** (le champ `nom`, lui, suit n8n). **n8n n'est jamais modifié.**
- C'est la fonction `journalRenommer` qui l'écrit, après avoir vérifié que l'appelant est **éditeur de ce client** et que le workflow existe déjà chez lui. Elle ne modifie **que** ce champ, 80 caractères au plus, texte simple.
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

**Pas testé** (impossible sans toucher aux vrais services) : le vrai n8n (la forme exacte de ses réponses a été lue dans la documentation et d'après ton essai du 11/10/2026 ; le faux n8n l'imite), le déploiement sur Google Cloud (planificateur, secret, droits), les fonctions appelables **par le vrai SDK** depuis un navigateur (l'écran a été essayé avec des réponses simulées), l'alerte « Nous sommes prévenus ».

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
2. Active le module : `node scripts/nouveau-client.js activer-module <client> journal --ecrire`.
3. Ouvre `https://chevalier-ia-app.web.app/espace/<client>`, connecte-toi, clique **Automatisations > Historique** puis **Rafraîchir l'historique**.
4. Prévois deux workflows de test : un **lent** (une pause de quelques dizaines de secondes, pour voir la pastille « En cours » qui pulse) et un qui **échoue volontairement** (pour voir l'étape et le message d'erreur).

### e. Si quelque chose se passe mal

- **Écran vide** : le workflow a-t-il l'étiquette exacte ? Le module est-il actif ? Regarde `plateforme_journal/signalements` dans la console Firestore.
- **Bandeau jaune permanent** : clé absente ou refusée. Journaux : <https://console.cloud.google.com/functions/list?project=chevalier-ia-app> > `journalRafraichir` > *Journaux*.
- **Tout arrêter** : *Run workflow* n'a pas de bouton d'arrêt ; supprime les fonctions avec `firebase functions:delete journalCopieHoraire journalRafraichir journalRenommer --project chevalier-ia-app`, ou désactive le module chez le client (`desactiver-module <client> journal --ecrire`) : plus rien ne lui est copié.

---

## 8. Coût et limites à connaître

- Une page ouverte et visible demande une copie **toutes les 10 secondes** ; chaque copie lit la liste des workflows du client (réponse lourde de n8n, jetée aussitôt) puis seulement les exécutions nouvelles. Volume faible attendu ; si un client ouvre beaucoup de pages, on pourra espacer (le délai est un seul réglage : `DELAI_MINI_RAFRAICHISSEMENT_MS` côté serveur, `DELAI_RAFRAICHIR_MS` côté écran).
- Première copie d'un workflow : ses **200 dernières** exécutions. Ensuite, au plus **500 nouvelles par passage** et par workflow (au-delà, `sync/state.tronque` passe à `true`).
- L'écran affiche les **300 exécutions les plus récentes**.
- n8n garde 14 jours d'historique : avec une copie toutes les heures, rien ne se perd.

## 9. Phase 3 (pas faite)

Le Logger dans les workflows et la frise d'étapes. Rien à changer pour l'ajouter plus tard : la sous-collection `steps` et le champ `runGroupId` existent déjà, vides ; la règle Firestore ferme déjà `steps` à l'écriture navigateur.
