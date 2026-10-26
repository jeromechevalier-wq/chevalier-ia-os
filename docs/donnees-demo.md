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
| `--masquer-prix-achat` | facultatif : dans la copie, le prix d'achat de chaque article devient son prix de vente, sans marge |
| `--completer` | ajoute la démonstration même si le client a déjà des données (les articles déjà présents sont gardés tels quels) |
| `--auteur adresse@…` | qui signe les fiches (en minuscules). Par défaut : le premier éditeur du client |
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
- **Les réglages des devis** avec une entreprise fictive dans « Mon entreprise » (SIRET `000 000 000 00000`), seulement si le client n'a pas encore de réglages des devis.

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

## Comment c'est retiré

`--retirer --ecrire` cherche, dans chaque collection où le programme écrit, les documents qui portent `donneesDemo: true`, et supprime **ceux-là seulement**. Ce que tu as créé toi-même chez ce client reste, et les autres clients ne sont jamais touchés.

## Limites à connaître

- **Pas de PDF pour les devis finalisés** : aucun PDF n'a été fabriqué, donc l'écran peut afficher « PDF pas prêt » et proposer de le fabriquer.
- **Les réglages des devis créés par la démonstration** (« Mon entreprise » fictive) portent le marqueur : `--retirer` les supprime aussi. Le client retrouve alors les réglages vides. Si tu les as modifiés et enregistrés à l'écran pendant la démonstration, ils perdent le marqueur et restent.
- **Ce que l'écran crée pendant la démonstration n'est pas retiré.** Par exemple, une note ajoutée, ou l'événement « étape changée » quand tu déplaces une affaire : ces documents n'ont pas le marqueur.
- **Le compteur des numéros de devis n'est jamais remis à zéro** : un numéro déjà donné ne doit jamais revenir.
- **Un seul client à la fois.**

## Cas vide et cas d'erreur (messages de refus)

Dans tous ces cas, rien n'est écrit et le programme finit par « Rien n'a été écrit. ».

| Message | Ce que ça veut dire | Que faire |
|---|---|---|
| *Le client « … » n'existe pas* | pas de fiche `clients/<identifiant>` | créer le client avec `nouveau-client.js`, ou corriger l'identifiant |
| *Indiquez d'où vient le catalogue des devis* | ni `--catalogue-depuis` ni `--catalogue-exemple` | ajouter l'une des deux options |
| *Le catalogue du projet … est vide* | aucun article à copier | utiliser `--catalogue-exemple` |
| *Impossible de lire le catalogue …* | connexion, droits ou identifiants expirés | `gcloud auth application-default login`, ou `--catalogue-exemple` |
| *Ce client a déjà des données (…)* | le client a déjà des affaires, personnes, devis… | choisir un client vide, ou ajouter `--completer` |
| *Ce client a déjà des données de démonstration* | la démonstration est déjà là | `--retirer --ecrire`, puis relancer |
| *Projet « … » refusé* / *est le CRM de Jérôme* | la cible n'est pas le projet des clients | ne rien changer à l'environnement : le programme vise `chevalier-ia-app` tout seul |
| *« … » n'est pas une adresse e-mail valide* / *doit être écrite en minuscules* | `--auteur` mal écrit | réécrire l'adresse en minuscules |
| *Aucune donnée de démonstration chez ce client* | `--retirer` sur un client sans démonstration | rien à faire |

Si l'écriture est coupée en route (perte d'Internet), le programme le dit. Lance alors `--retirer --ecrire`, puis relance la démonstration.
