# Créer un module : la fiche unique

Écrite le 11/11/2026 avec le module « Réseaux sociaux ». Elle regroupe en un seul endroit les règles qui étaient dispersées dans `CLAUDE.md`, `docs/tables.md`, `docs/activer-desactiver-modules.md`, `docs/consignes-ui.md`, `docs/etude-reutilisation-coque.md` et `js/os/registre.js`. Chaque règle cite son fichier : en cas de doute, c'est le fichier qui fait foi. **À mettre à jour quand une règle change.** Aucun secret ici.

Le modèle le plus petit à copier : le module **Veille** (`js/modules/veille/index.js`, 63 lignes). Le module **Réseaux sociaux** (`js/modules/reseauxsociaux/index.js`) montre la même structure avec quatre écrans chargés à la demande.

## 1. Les règles de fond (à respecter avant d'écrire une ligne)

- **Même code chez Jérôme et chez les clients** : toute nouvelle fonctionnalité existe d'abord chez Jérôme, puis s'ouvre aux clients ; jamais une fonction réservée aux clients, ni l'inverse (`CLAUDE.md:11`). Le module est donc déclaré une seule fois, pour les deux.
- **Une fonction du serveur existe des deux côtés** : une fonction ajoutée dans `functions/` est branchée dans la même PR dans `functions-plateforme/` (`scripts/preparer-fonctions.js` copie le code commun). Sinon la PR écrit « absent chez les clients » avec la raison, une ligne dans `.github/A-FAIRE.md` et l'entrée de la page Réglages > Déploiement (`CLAUDE.md:13`). Le test `tests/ecarts-fonctions.test.js:26` (`RESERVEES_JEROME`) refuse une fonction exportée d'un seul côté sans sa raison.
- **Le navigateur n'appelle une fonction du serveur que depuis une liste blanche** : `tests/statique.test.js:277` (`AVEC_FONCTIONS`) liste les fichiers autorisés à contenir `httpsCallable`, et `tests/statique.test.js:292` fige le nom appelé. Un nouvel appel = une ligne dans ce test.
- **Chaque module a son bouton d'export** : une section « Sauvegarde » dans les Réglages du module (`CLAUDE.md:15` ; modèle : `js/modules/veille/export.js`).
- **Chaque module est vendable et utilisable seul** : aucun module n'en exige un autre ; tous s'appuient sur le socle commun (fiches Personnes et Organisations, journal), qui n'est pas un module (`CLAUDE.md:16`, `js/os/registre.js:43`). Un module qui lit les fiches Personnes déclare `socle: true` et `dependances: []`.
- **Écrans de liste** : une seule barre, `js/modules/crm/barre-liste.js` (`CLAUDE.md:17`, `docs/consignes-ui.md:220`).
- **Dépôt public** : jamais de secret, de donnée de client ni de nom réel dans le code, les docs ou les tests ; des données fictives partout (`CLAUDE.md:8`).
- **Le mot « CRM » n'apparaît dans aucun texte visible** (`CLAUDE.md:18`), et les textes disent « tu » sans nom propre.

## 2. La déclaration dans le registre

Dans `js/os/registre.js`, ajoute un objet à `MODULES_DECLARES` (`js/os/registre.js:66`), à la place voulue dans le menu (l'ordre du tableau est l'ordre du menu et l'ordre de démarrage). Le fichier n'importe rien : il se teste seul. Le commentaire qui explique chaque champ est juste au-dessus de la liste (`js/os/registre.js:50`). Les champs :

| Champ | Rôle |
|---|---|
| `id` | identifiant dans le champ `modules` d'une fiche client (lettres minuscules seulement : `tests/registre.test.js:23`) |
| `nom`, `libelleMenu`, `iconeMenu` | nom montré, titre de l'entrée du menu, icône (une icône qui n'existe pas dans `ICONES` de `js/os/ui.js:4` ne dessine rien : en choisir une qui y est) |
| `prefixe` | premier morceau des routes (`#/reseauxsociaux/…`) ; chaque route d'écran commence par lui |
| `entreeMenu` | route d'arrivée de l'UNIQUE entrée du menu ; les autres écrans sont des onglets (`js/os/onglets.js`) |
| `ecrans` | `{ route, libelle, icone }` pour chaque écran ; leur ordre est l'ordre des onglets (sinon `ordreOnglets`) |
| `reglages` | les sections de Réglages du module : `{ sections: [{ id: 'reglages-…', libelle }] }` |
| `collections` | les noms « nus » des tables du module |
| `outilsMcp` | les outils MCP du module (liste de noms ; vide si aucun) |
| `dependances` | modules à activer avant celui-ci (vide pour un module autonome) |
| `socle` | `true` si le module lit les fiches Personnes du socle sans Affaires (il reçoit alors les outils du socle : `tests/registre.test.js:122`) |
| `badge`, `horsMenu`, `ordreOnglets` | facultatifs (pastille rouge « à valider », module sans entrée de menu, ordre des onglets) |

Un module absent de la fiche d'un client est invisible pour lui ; un module dont la dépendance manque est refusé (`js/os/registre.js:338` à `js/os/registre.js:390`).

## 3. Le montage dans la coque

- **`js/os/modules.js`** : la seule liste du code de chaque module. Ajoute une ligne à `MONTAGES` (`js/os/modules.js:11`) : `reseauxsociaux: () => import('../modules/reseauxsociaux/index.js')`. La coque ne connaît les modules que par ce fichier et par `registre.js` (`docs/etude-reutilisation-coque.md:28`).
- **Le contrat du module** (`js/modules/<nom>/index.js`) : `demarrer({ compte, cheminBase })`, `arreter()`, `afficher(conteneur, segs)` (rend la fonction qui quitte l'écran), `reglages(page)`, `actionsRapides` (tableau, vide si rien à créer), `rechercher()` (`{ groupes: [] }` si pas de recherche globale). Un seul `demarrer` appelle l'écoute des données : `js/main.js:86` (Jérôme, `cheminBase` vide) et `js/os/espace-modules.js:42` (client, `cheminBase` = `clients/<client>`).
- **Une ligne dans `js/main.js:129` et une dans `js/os/espace.js:137`** : à la déconnexion, la coque appelle `oublierFiltres()` du module pour remettre à zéro les filtres mémorisés (un autre compte ne doit pas hériter de ceux du précédent).
- **Le journal commun** : toute écriture passe par `executer` de `js/os/journal-donnees.js:58` (la donnée, sa ligne `crm_audit` et sa copie `crm_audit_avant` dans le même lot), jamais par `setDoc` direct. Pour que le Journal nomme tes tables, déclare leurs libellés dans `demarrer` avec `declarerLibellesJournal` (`js/os/journal.js:29`) ; sinon il affiche le nom brut de la collection.
- **Une feuille de style propre au module** (`css/<nom>.css`) se charge au premier affichage, comme dans `js/modules/veille/index.js`. Tout fichier CSS touché impose `npm run test:module look-compact` : jamais de taille ni de poids de texte en dur, toujours les variables de `css/tokens.css`.

## 4. Les tables (collections)

- **Nom de table = `module_table`** (`reseauxsociaux_posts`, `veille_sources`) : un module emporte ses tables sans collision (`docs/etude-reutilisation-coque.md:31`). Les tables du module sont déclarées dans `collections` du registre.
- **Une table n'existe qu'à la première écriture** : l'écran doit donc accepter une table absente (afficher « vide », pas une erreur).
- **Chez un client** : les mêmes noms sous `clients/<client>/…` (`cheminCollection`, `js/os/chemins.js:26`) ; ne jamais écrire un chemin à la main.
- **Pas de règle Firestore à écrire** pour une table de module : le joker de `firestore.rules:172` (base de Jérôme) et la règle générique de `firestore.plateforme.rules:182` (base des clients) les couvrent. Toucher un fichier de règles fait passer la PR au palier complet de tests et la met sur la liste d'arrêt.
- **Requêtes sans index** : aucun `orderBy`, aucun `limit`, une seule condition `where` (opérateur `==`) par requête ; le tri se fait dans le navigateur (`tests/statique.test.js:198`, test « D4 »).
- **Sauvegarde complète** : ajoute les tables à `COLLECTIONS_CRM` (`js/modules/crm/donnees.js:22`), puis adapte la liste exacte de `tests/socle-donnees.test.js:65` et celle de `tests/e2e/parcours.spec.js:730`.
- **Documente-les** : une ligne dans le tableau de `docs/tables.md` (« Collections par module »).

## 5. L'activation chez un client

- Le module s'allume avec un champ dans la fiche du client : `modules: { <id>: true }` (`docs/activer-desactiver-modules.md:5`). Ajoute sa ligne dans le tableau « Les modules existants » : nom à écrire, ce que le client voit, ce qu'il faut savoir (module autonome ou non, fonction du serveur absente).
- Les interrupteurs de l'écran « Modules actifs » et l'outil « nouveau client » se construisent tout seuls à partir du registre (`js/os/registre.js:523`, `scripts/plateforme/commun.js:121`).
- Les données ne sont jamais effacées quand on éteint un module.

## 6. L'interface

Tout est dans `docs/consignes-ui.md`. L'essentiel pour un nouveau module :

- **Barre commune des listes** : `enteteListe`, `barreListe`, `basculeVues`, `champRecherche` de `js/modules/crm/barre-liste.js` ; ne jamais poser un champ `type: 'search'` ni des boutons de vue à la main (`tests/barre-liste.test.js:15` : ajoute l'écran à sa liste s'il s'agit d'un écran de liste).
- **Un seul bouton jaune par écran** (l'action principale), les autres actions à contour ; le jaune plein n'est jamais un badge (`docs/consignes-ui.md:92`).
- **Composants à réutiliser tels quels** : cartes `carte-section`, pastilles (`pastilleEtiquette`), colonnes `.kanban` et `.carte-affaire` (`css/crm.css`), `etatVide`, `dialogue`, `confirmer`, `toast` (`js/modules/crm/composants.js`, `js/os/ui.js`). Quatre colonnes au plus par Kanban.
- **Chaque écran a ses trois états** : cas vide (une phrase simple), cas d'erreur (un message lisible et, si utile, un bouton « Réessayer »), chargement (`rond-chargement`).
- **Téléphone** : tout nouvel écran se teste aussi en format téléphone (`node lancer-tout.js --e2e e2e/<fichier>.spec.js --project=telephone`, depuis `tests/`) ; pas de défilement horizontal de la page.
- **Une action de Jérôme = un test dont le nom commence par le numéro du point + une capture** (`docs/consignes-ui.md:3`).

## 7. La liste de contrôle (à cocher avant d'ouvrir la PR)

1. Dossier `js/modules/<nom>/` avec `index.js` (contrat du §3), `donnees.js`, `logique.js` (règles pures, sans Firebase, testables par Node), `export.js`.
2. Déclaration dans `js/os/registre.js` (§2) et ligne dans `js/os/modules.js` (§3).
3. Une ligne `oublierFiltres` dans `js/main.js` et dans `js/os/espace.js` (§3).
4. Tables dans `COLLECTIONS_CRM` (§4).
5. Tests qui énumèrent les modules, à adapter : `tests/registre.test.js` (liste blanche des modules sans outil MCP `:25`, menu attendu `:220`, entrées `:379`, interrupteurs `:445`, modules `socle` `:122`), `tests/statique.test.js` (D4 : `AVEC_FONCTIONS` `:277`), `tests/ecarts-fonctions.test.js` (`RESERVEES_JEROME` `:26`), `tests/socle-donnees.test.js` (S5 `:65`), `tests/outil-client.test.js` (les listes `modules` d'une fiche client), les parcours dont une liste exacte contient le menu ou les Réglages (`tests/e2e/menu-coque.spec.js`, `menu-coque-modules.spec.js`, `devis-bordereau.spec.js`, `identite-crm.spec.js`, `mon-espace-racine.spec.js`) et la sauvegarde complète (`tests/e2e/parcours.spec.js:730`). Cherche par `grep` dans `tests/` le nom d'un module voisin (par exemple `veille`) : ce sont les mêmes endroits.
6. Nom de fichier de sauvegarde : si `nomFichierExport` du CRM ne connaît pas ton module, fais le nom dans le module (comme `nomFichierExportReseauxSociaux`).
7. Docs : cette fiche si une règle a changé, `docs/tables.md`, `docs/activer-desactiver-modules.md`, puis la nouvelle page dans `scripts/wiki/sommaire.json` et `node scripts/wiki/construire.js` (le test `tests/wiki.test.js:76` exige que `wiki/` soit identique à `docs/`).
8. Avant la PR : `npm run test:module <préfixe>`, `npm run test:rapide`, `npm run test:smoke` ; jamais la suite complète en session.
