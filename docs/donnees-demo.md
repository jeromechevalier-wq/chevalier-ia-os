# Données de démonstration d'un client

## À quoi ça sert

Avant une démonstration, tu veux montrer un espace client **plein** : des affaires dans chaque colonne, des devis dans tous les états, des projets. Le programme `scripts/donnees-demo.js` le remplit en une commande avec des données **inventées**. Après la démonstration, une autre commande retire **seulement** ce qu'il a créé.

Il travaille dans le projet des clients (`chevalier-ia-app`), dans un client qui existe déjà (créé avec `scripts/nouveau-client.js`, voir `nouveau-client.md`). Il ne touche jamais la base de ton Chevalier IA OS (`chevalier-ia-os`), sauf pour y **lire** ton catalogue des devis.

## Avant la première fois

Mêmes préparatifs que pour `nouveau-client.js` (voir `nouveau-client.md`, « À faire une seule fois ») :

```bash
npm ci --prefix scripts/plateforme
gcloud auth application-default login
```

Toutes les commandes se tapent dans le Terminal, dans le dossier du projet. Dans les exemples, remplace `clientdemo` par l'identifiant de ton client de démonstration.

## Le garde-fou « client de démonstration » (la marque `demo: true`)

L'outil de démonstration n'écrit **que** chez un client dont la fiche (`clients/<identifiant>`) porte la marque `demo: true`. Sans elle, il **refuse** (remplissage, `--retirer` et `--pdf`), même avec `--completer`, même en simulation :

> Ce client n'est pas marqué comme client de démonstration : l'outil refuse d'écrire. Rien n'a été modifié.

Poser la marque :

- **Nouveau client de démonstration** : ajouter `--demo` à la création (`node scripts/nouveau-client.js <identifiant> --nom … --membre … --demo --ecrire`).
- **Client de démonstration qui existe déjà** (le tien) : une petite commande, à lancer dans ton Terminal (simulation, puis pour de vrai) :

```bash
node scripts/marquer-demo.js --client <identifiant>
node scripts/marquer-demo.js --client <identifiant> --ecrire
```

Remplace `<identifiant>` par l'identifiant de ton client de démonstration. Elle n'écrit que le champ `demo` (rien d'autre n'est touché), refuse ta base `chevalier-ia-os` et refuse un client qui n'existe pas.

**Règle : on ne transforme jamais un vrai client en client de démonstration (ni l'inverse) : on en crée un nouveau.**

## Les commandes

Règle d'or : **sans `--ecrire`, rien n'est écrit**. Lance toujours la simulation d'abord, relis, puis relance la même commande avec `--ecrire`.

**1. Simulation** (n'écrit rien) :

```bash
node scripts/donnees-demo.js clientdemo --catalogue-depuis chevalier-ia-os
```

La première ligne dit « Base visée : chevalier-ia-app (VRAIE base) ; SIMULATION ». Ensuite tu vois le nombre d'articles lus, les affaires par étape, la liste des devis (statut, numéro, objet, total TTC), les projets par phase, puis « SIMULATION : rien n'a été écrit ».

**2. Pour de vrai** :

```bash
node scripts/donnees-demo.js clientdemo --catalogue-depuis chevalier-ia-os --ecrire
```

**3. Retirer la démonstration** (simulation, puis pour de vrai) :

```bash
node scripts/donnees-demo.js clientdemo --retirer
node scripts/donnees-demo.js clientdemo --retirer --ecrire
```

**4. Fabriquer les PDF des devis fictifs** (simulation, puis pour de vrai) :

```bash
node scripts/donnees-demo.js clientdemo --pdf
node scripts/donnees-demo.js clientdemo --pdf --ecrire
```

On peut aussi l'ajouter au remplissage (`... --catalogue-exemple --ecrire --pdf`) : le PDF est alors fait juste après l'écriture. Sans l'option `--pdf`, **aucun PDF n'est jamais fabriqué**.

**5. Charger le jeu d'un métier** (catalogue, mots appris, devis et affaires fictifs adaptés au métier). `--metier` est l'option qui choisit le jeu :

```bash
node scripts/donnees-demo.js --metier
node scripts/donnees-demo.js clientdemo --metier etancheur
node scripts/donnees-demo.js clientdemo --metier etancheur --ecrire
```

La première commande affiche la liste des métiers prêts (sans toucher à la base). La deuxième est la simulation, la troisième écrit pour de vrai. Pour **changer de métier** (un seul métier à la fois chez le client de démonstration) :

```bash
node scripts/donnees-demo.js clientdemo --retirer --ecrire
node scripts/donnees-demo.js clientdemo --metier agence --ecrire
```

Les métiers disponibles :

| Nom à taper | Métier | Mot du métier | Contenu |
|---|---|---|---|
| `etancheur` | Étancheur | ouvrage | toiture-terrasse, balcon en résine, isolation, recherche de fuite, entretien |
| `agence` | Agence de communication | prestation | sites internet, référencement (moteurs de recherche et assistants d'IA), fiches Google My Business, communication, panneaux d'affichage, location de téléviseurs avec vidéos en boucle |
| `plombier` | Plombier | ensemble | sanitaire, chauffe-eau, robinetterie, dépannage de fuite, débouchage, entretien de chaudière |

Chaque jeu contient 28 à 33 articles dont 3 ensembles (le mot du métier ; prix de vente HT inventés et arrondis, aucune marque), 8 mots appris, 15 organisations du secteur, des affaires dans chaque étape et des devis dans chaque statut (3 de chaque). **4 devis par jeu sont écrits à la main** (un brouillon, un finalisé, un envoyé, un signé) ; les autres viennent du tirage habituel, sur le catalogue du jeu. Un métier n'apparaît dans la liste que si son jeu passe le contrôle de complétude (`tests/donnees-demo-metiers.test.js`). `--metier` ne se combine pas avec `--catalogue-depuis` ni `--catalogue-exemple`. Sans option de ce genre, `--catalogue-exemple` garde le petit jeu général (plâtre, carrelage, peinture).

**Si ton catalogue ne se lit pas** (connexion, droits), utilise le petit catalogue fictif intégré à la place :

```bash
node scripts/donnees-demo.js clientdemo --catalogue-exemple --ecrire
```

### Les options

| Option | Ce qu'elle fait |
|---|---|
| `--ecrire` | écrit vraiment (sans elle : simulation) |
| `--catalogue-depuis chevalier-ia-os` | copie ton catalogue des devis (articles, ouvrages, familles), lu **sans rien écrire** chez toi |
| `--catalogue-exemple` | utilise un petit catalogue fictif de 15 articles à la place |
| `--metier nom` | utilise le jeu complet d'un métier (liste : `--metier` seul ou `--metiers`) ; ne se combine pas avec les deux options de catalogue |
| `--masquer-prix-achat` | facultatif : dans la copie, le prix d'achat de chaque article devient son prix de vente, sans marge |
| `--completer` | ajoute la démonstration même si le client a déjà des données (les articles déjà présents sont gardés tels quels) |
| `--auteur adresse@…` | qui signe les fiches (en minuscules). Par défaut : le premier éditeur du client |
| `--pdf` | fabrique les PDF des devis de démonstration qui n'en ont pas (voir « Les PDF des devis » plus bas) ; seul, il travaille sur un client déjà rempli |
| `--retirer` | retire les données de démonstration |
| `--aide` | affiche l'aide |

## Ce qui est créé

- **15 organisations** et **20 personnes** inventées : 15 rattachées à une organisation et 5 particuliers. Les e-mails finissent par `exemple.test`, les téléphones par des zéros.
- **19 affaires** :
  - 3 dans chacune des 4 étapes ouvertes ;
  - 4 gagnées ;
  - 3 perdues.

  Le programme lit les étapes du client. S'il n'en a pas encore, ce sont les étapes par défaut : Nouveau contact, Échange en cours, Proposition, Négociation, Gagné. Chaque étape active reçoit au moins 2 affaires.
- **2 à 6 éléments par affaire** :
  - une note épinglée ;
  - un appel déjà fait ;
  - une activité à venir (pour les affaires ouvertes) ;
  - parfois une deuxième note ;
  - 0 à 2 liens fictifs (`https://exemple.test/…`).
- **2 projets par phase** (À démarrer, En cours, À valider, Terminé) : 4 viennent des affaires gagnées, les autres n'ont pas d'affaire.
- **15 devis**, 3 dans chaque statut : brouillon, finalisé, envoyé, signé, refusé.
  - **Rattachement** : chaque devis est sur une affaire qui lui correspond. Les brouillons sont en « Échange en cours », les finalisés en « Proposition », les envoyés en « Négociation », les signés sur des affaires gagnées et les refusés sur des affaires perdues.
  - **Contenu** :
    - 2 à 4 sections, qui portent le nom d'une famille du catalogue ;
    - 4 à 12 lignes avec des quantités plausibles ;
    - une TVA à 10 % (logement) ou 20 % ;
    - un acompte, un ajustement ou une remise sur certains devis ;
    - les notes de bas de page, le texte libre, les déchets et l'adresse du chantier.
  - **Numéros et dates** : un devis qui n'est plus un brouillon a un numéro `DEV-AAAA-MM-JJ-NNN`. Ses dates se suivent : créé, puis finalisé, puis envoyé, puis signé ou refusé.
- **Le catalogue copié** (tous les articles, avec la composition des ouvrages et les familles), si le client n'a pas déjà ces articles.
- **Les réglages des devis** avec une entreprise fictive dans « Mon entreprise » (SIRET `000 000 000 00000`), seulement si le client n'a pas encore de réglages des devis. Ils portent aussi le **mot du métier** du jeu (aujourd'hui « ouvrage », le mot habituel) ; un client qui a déjà ses réglages garde les siens, mot du métier compris.
- **8 mots appris** (écran « Vocabulaire ») pour le **petit catalogue fictif** : un mot pour un article (« placo »), des mots pour plusieurs articles au choix (« carrelage », « électricité »), des mots validés par toi ou par les réponses, un mot **à confirmer** (« douche ») et un mot **désactivé** (« colle »). Ils servent à montrer que le logiciel apprend le vocabulaire du client. Avec `--catalogue-depuis` (ton vrai catalogue), les identifiants des articles ne correspondent pas : aucun mot n'est créé, et l'outil le dit (« Mots appris : aucun »). Un mot que le client a déjà (même expression) n'est jamais remplacé.

## Comment c'est fabriqué (pour les curieux)

- `scripts/donnees-demo.js` lance simplement `scripts/plateforme/donnees-demo.js`, qui contient tout.
- **La construction** : la fonction `construirePlan` prépare la liste complète des documents en mémoire, sans rien écrire. Elle utilise **les mêmes règles** que l'écran et l'assistant :
  - affaires, personnes, organisations, notes et activités : `js/modules/crm/logique.js` (`planCreerAffaire`, `planMarquerPerdue`…) ;
  - projets : `js/modules/projets/logique.js` ;
  - devis : `js/modules/devis/logique.js` (`nouveauDevis`, `figerPourFinalisation`) et `js/modules/devis/editeur-logique.js` (une ligne copiée d'un article).
- **Les devis** : ceux qui ne sont plus des brouillons reçoivent ce que le serveur aurait écrit (voir `functions/src/coeur/devis.js`) : numéro, prix et totaux figés, dates d'envoi et de signature. Le compteur des numéros (`devis_compteurs/global`) est avancé.
- **Le choix des données** : un tirage « au hasard » mais toujours le même. Avec le même catalogue, deux lancements donnent les mêmes affaires et les mêmes devis.
- **Le marqueur** : chaque document créé porte le champ `donneesDemo: true`. C'est grâce à lui que `--retirer` sait quoi supprimer.
- **Le catalogue** : il est lu à la racine du projet `chevalier-ia-os` (`devis_articles`, `devis_parametres/familles` et `devis_parametres/reglages` pour la marge), **en lecture seule**. Aucun article n'est écrit dans le dépôt. Les fiches copiées sont signées par l'auteur de la démonstration, pas par toi.
- **Les tests** : `tests/donnees-demo.test.js`, sur l'émulateur, avec le catalogue fictif seulement. Pour les lancer : `npm run test:module donnees-demo` (dossier `tests/`).

## Les PDF des devis (option `--pdf`)

Les devis fictifs « finalisé, envoyé, signé, refusé » sont écrits directement en base : le serveur ne les a jamais vus être finalisés, donc ils n'ont pas de PDF et l'écran montre « ⚠ PDF non rangé ». L'option `--pdf` leur en fabrique un, **par le vrai serveur** (le déclencheur `devisPdfAuto`, voir `pdf-clients.md`) :

- pour chaque devis, le programme fait **deux écritures séparées** : il remet le devis en « brouillon » (avec le champ `donneesDemoStatutOrigine`, qui garde le statut d'origine), puis lui rend son vrai statut. Ce passage « brouillon vers finalisé » réveille le serveur, qui fabrique le PDF et le range ;
- **2 devis à la fois** (le serveur ne fait pas plus), et le programme attend, pour chacun, que le PDF soit « ok » ou « échec » (il regarde toutes les 5 secondes, 10 minutes au plus par devis). Un tableau s'affiche au fur et à mesure : numéro, statut, PDF ok / ÉCHEC / en attente ;
- sont **sautés** : les devis sans le marqueur `donneesDemo` (jamais touchés), les brouillons, ceux dont le PDF est déjà « ok », ceux dont le PDF est en cours de fabrication depuis moins de 10 minutes ;
- si **aucun** devis ne montre un PDF « en cours » dans la minute, le programme s'arrête : « Le déclencheur devisPdfAuto ne répond pas : fonctions PDF pas déployées chez les clients ? » (voir `pdf-clients.md`) ;
- **reprise après une coupure** : si le programme est coupé entre les deux écritures, un devis reste en « brouillon » avec `donneesDemoStatutOrigine`. Au lancement suivant (`--pdf --ecrire`), il est d'abord remis dans son vrai statut. On peut relancer sans risque ;
- prérequis : le module `devis` actif chez le client, et le projet `chevalier-ia-app` (jamais `chevalier-ia-os`).

## Comment c'est retiré

`--retirer --ecrire` cherche, dans chaque collection où le programme écrit, les documents qui portent `donneesDemo: true`, et supprime **ceux-là seulement**. Si des PDF ont été fabriqués, il supprime aussi leurs fichiers dans Storage, **seulement** sous `clients/<client>/devis/<identifiant de l'affaire>/` des affaires de démonstration (jamais un autre dossier). Ce que tu as créé toi-même chez ce client reste, et les autres clients ne sont jamais touchés.

## Limites à connaître

- **Pas de PDF sans l'option `--pdf`** : les devis finalisés n'ont pas de PDF tant qu'on ne lance pas `--pdf --ecrire` (l'écran affiche « PDF non rangé »). Le vrai déclencheur en ligne n'est testé que par Jérôme sur le client de démonstration.
- **Ce que la fabrication du PDF laisse derrière elle** : le serveur écrit des lignes dans les journaux d'audit (`crm_audit`, `crm_audit_avant`, acteur `declencheur-pdf`). Elles ne sont **jamais supprimées** (règle de Jérôme : les journaux ne s'effacent jamais), même par `--retirer`. Le document ajouté à l'affaire disparaît avec l'affaire ; l'événement « Document joint » (`crm_evenements`) est marqué `donneesDemo` par `--pdf` et retiré par `--retirer`. Un événement créé à la main avant de lancer `--pdf` n'est marqué qu'au prochain `--pdf --ecrire`. Depuis le 26/10/2026, les affaires de démo n'ont pas de dossier de travail : `--pdf` fabrique le PDF mais n'ajoute ni document ni événement « Document joint ».
- **Mots appris et mot du métier** : chaque mot porte `donneesDemo: true`, `--retirer` supprime ces mots-là et **aucun autre** (un mot que tu as ajouté à la main reste). Le mot du métier fait partie des réglages des devis : ils partent avec leur marqueur et le client retrouve « ouvrage ». Si tu modifies un mot à l'écran, il garde son marqueur et part quand même au retrait ; si tu enregistres les réglages à l'écran, ils perdent le marqueur et restent. Les journaux d'audit écrits par le serveur ne sont jamais effacés. Le mot du métier du jeu (« prestation » pour l'agence, « ensemble » pour le plombier) reste si tu enregistres les réglages à l'écran pendant la démonstration : ils perdent alors leur marqueur et `--retirer` ne les supprime plus (le client garde le mot du jeu). Le petit jeu général (plâtre, carrelage, peinture) garde « ouvrage ». Le mot « à confirmer » porte une confirmation datée de la **veille** du chargement : tu peux donc le confirmer et l'activer devant le prospect le jour même. Les mots sont écrits sans jamais écraser un mot du client : si un mot réel apparaît pendant le chargement, l'outil s'arrête avec un message et ne touche à rien d'autre.
- **Les réglages des devis créés par la démonstration** (« Mon entreprise » fictive) portent le marqueur : `--retirer` les supprime aussi. Le client retrouve alors les réglages vides. Si tu les as modifiés et enregistrés à l'écran pendant la démonstration, ils perdent le marqueur et restent.
- **Ce que l'écran crée pendant la démonstration n'est pas retiré.** Par exemple, une note ajoutée, ou l'événement « étape changée » quand tu déplaces une affaire : ces documents n'ont pas le marqueur. **Exception avec `--pdf`** : tous les événements « Document joint » (`crm_evenements`, type `document`) d'une affaire de démonstration sont marqués, y compris un document que tu aurais ajouté à la main sur cette affaire : ils disparaissent au retrait.
- **`--retirer` lit aussi Storage.** Si tes identifiants n'ont pas accès à Storage, tout le retrait s'arrête, sans rien supprimer (message « Impossible de lire les fichiers PDF… »). Remède : `gcloud auth application-default login` avec un compte qui a les droits, puis relancer.
- **Un devis créé à la main sur une affaire de démonstration perd son fichier PDF au retrait** : tout ce qui est sous `clients/<client>/devis/<identifiant de l'affaire de démonstration>/` est supprimé, l'affaire disparaissant avec la démonstration.
- **Le compteur des numéros de devis n'est jamais remis à zéro** : un numéro déjà donné ne doit jamais revenir.
- **Un seul client à la fois.**

## Cas vide et cas d'erreur (messages de refus)

Dans tous ces cas (sauf les trois lignes `--pdf` signalées plus bas), rien n'est écrit et le programme finit par « Rien n'a été écrit. ». Avec `--pdf`, c'est différent une fois qu'un devis a été entamé : *déclencheur muet* = 2 écritures par devis entamé (les statuts sont remis en place), *PDF ÉCHEC* = c'est le serveur qui a écrit (l'échec est noté sur le devis). Le programme finit alors par « Relancez --pdf --ecrire » : la reprise remet d'abord les statuts d'origine.

| Message | Ce que ça veut dire | Que faire |
|---|---|---|
| *Le client « … » n'existe pas* | pas de fiche `clients/<identifiant>` | créer le client avec `nouveau-client.js`, ou corriger l'identifiant |
| *Indiquez d'où vient le catalogue des devis* | ni `--catalogue-depuis`, ni `--catalogue-exemple`, ni `--metier` | ajouter l'une des trois options |
| *Métier inconnu : « … »* | le nom après `--metier` n'est pas dans la liste (la liste est rappelée dans le message) | retaper un nom de la liste |
| *--metier ne se combine pas avec …* | `--metier` avec `--catalogue-depuis` ou `--catalogue-exemple` | une seule des trois options |
| *Un mot appris est apparu chez le client pendant le chargement* | un mot réel a été créé entre la lecture et l'écriture | `--retirer --ecrire`, puis relancer le chargement |
| *Le catalogue du projet … est vide* | aucun article à copier | utiliser `--catalogue-exemple` |
| *Impossible de lire le catalogue …* | connexion, droits ou identifiants expirés | `gcloud auth application-default login`, ou `--catalogue-exemple` |
| *Ce client a déjà des données (…)* | le client a déjà des affaires, personnes, devis… | choisir un client vide, ou ajouter `--completer` |
| *Ce client a déjà des données de démonstration* | la démonstration est déjà là | `--retirer --ecrire`, puis relancer |
| *Projet « … » refusé* / *est le CRM de Jérôme* | la cible n'est pas le projet des clients | ne rien changer à l'environnement : le programme vise `chevalier-ia-app` tout seul |
| *« … » n'est pas une adresse e-mail valide* / *doit être écrite en minuscules* | `--auteur` mal écrit | réécrire l'adresse en minuscules |
| *Aucune donnée de démonstration chez ce client* | `--retirer` sur un client sans démonstration | rien à faire |
| *Aucun devis de démonstration à traiter* | (`--pdf`) tous les devis ont déjà leur PDF, ou il n'y a que des brouillons | rien à faire |
| *Le module « devis » n'est pas actif chez ce client* | (`--pdf`) le serveur ne réagirait pas | `node scripts/nouveau-client.js activer-module <client> devis --ecrire` |
| *Le déclencheur devisPdfAuto ne répond pas* | (`--pdf`) les fonctions PDF ne sont pas (ou plus) déployées | voir `pdf-clients.md`, puis relancer |
| *PDF ÉCHEC* dans le tableau | le serveur a essayé 3 fois et n'a pas réussi | relancer `--pdf --ecrire`, ou « Réessayer » sur le devis |
| *Impossible de lire les fichiers PDF du client dans Storage* | (`--retirer`) connexion ou droits | rien n'a été supprimé ; `gcloud auth application-default login` puis relancer |
| *--pdf et --retirer ne se combinent pas* | deux options opposées | une seule à la fois |

Si l'écriture est coupée en route (perte d'Internet), le programme le dit. Lance alors `--retirer --ecrire`, puis relance la démonstration.

## Mode d'emploi : les PDF de la démonstration (pour Jérôme)

1. Dans le Terminal, dans le dossier du projet : `node scripts/donnees-demo.js clientdemo --pdf`. Tu dois voir « À traiter : 12 devis, 2 à la fois » (le nombre peut varier) et « SIMULATION : rien n'a été écrit ».
2. Si la liste te va : `node scripts/donnees-demo.js clientdemo --pdf --ecrire`. Compte quelques minutes : chaque devis s'affiche avec « PDF ok » quand il est prêt.
3. À la fin, tu dois voir « ✔ Tous les PDF sont rangés. ». Ouvre un devis envoyé chez le client de démonstration : plus de « ⚠ PDF non rangé », et le PDF s'ouvre.
4. Relance la même commande : « Aucun devis de démonstration à traiter » (cas vide).
5. En cas d'erreur : le message dit quoi faire (tableau des messages ci-dessus). Un lancement coupé au milieu se rattrape en relançant la même commande.
