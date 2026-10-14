# La porte et les clés des workflows n8n

> **État au 2026-10-14 : en service pour ton CRM (base 1).** La porte est déployée à l'adresse `https://chevalier-ia-os.web.app/porte`, la clé `interne` est dans n8n, et un workflow d'essai (lecture seule) a lu les sources de la veille avec succès. Reste à faire : la porte pour la base 2 (clients) et la copie des workflows réels (étape 3).

## 1. À quoi ça sert

Les workflows n8n (collecte de la veille, résumés…) doivent **lire et écrire dans les données d'un module** (par exemple la veille), dans la base Firebase. Pour cela, ils passent par une **porte** : une petite fonction Firebase qui vérifie qui appelle, puis fait seulement les actions prévues.

Une **clé** est ce que le workflow présente à la porte. Une clé par **propriétaire** :
- un **client** (par exemple `audrey`) : la clé lui permet d'écrire dans **ses** données, et dans les modules qu'il a achetés ;
- **toi** (propriétaire « interne ») : pour tes propres workflows (veille interne, produit, perso), dans ton CRM.

La clé est **la même pour tous les modules d'un client** : quand on active un nouveau module, on ne change rien. On la règle une fois dans n8n.

## 2. Comment c'est fait (le principe)

```
 workflow n8n ──(clé)──▶  PORTE  ──▶ 1. la clé existe et n'est pas révoquée ?
                                     2. le module demandé est actif pour ce client ?
                                     3. le workflow appelant appartient bien à ce propriétaire ?
                                     4. les données sont-elles valides et de taille raisonnable ?
                                     5. écriture (un identifiant fixe : jamais de doublon)
```

- La porte n'offre **que des actions précises** (lire les sources, ajouter un contenu, ajouter un résumé…), jamais « écris où tu veux » : une clé volée ne peut donc rien faire d'autre.
- Il y a **une porte dans chaque base** : une dans ton CRM (base 1, `chevalier-ia-os`) pour tes workflows, une dans la plateforme (base 2, `chevalier-ia-app`) pour ceux des clients. Les clés sont indépendantes d'une base à l'autre.

## 3. À quoi ressemble une clé

`cle-n8n.<propriétaire>.<43 caractères aléatoires>`

- `cle-n8n.audrey.Xr4k…` : une clé du client `audrey` ; `cle-n8n.interne.…` : une clé de tes workflows.
- Le début (`cle-n8n.audrey.`) est une **étiquette** : elle te permet de reconnaître à quel client une clé appartient en ouvrant n8n, et aide les outils de détection de secrets. **Ce n'est pas elle qui ouvre la porte** : c'est la partie aléatoire. Écrire `cle-n8n.audrey.` devant n'importe quoi n'ouvre rien.
- Aucun espace dans la clé (un en-tête HTTP n'en accepte pas). Un point sépare le nom du client des caractères aléatoires : un identifiant de client ne contient jamais de point, donc il n'y a aucune ambiguïté.

**Ce qui est enregistré dans la base** (table `plateforme_cles`, un document par clé) : **jamais la clé**, seulement son **empreinte** (SHA-256, 64 caractères) qui sert d'identifiant du document, le propriétaire, un **identifiant court** (les 8 premiers caractères de l'empreinte, pour s'y retrouver), la date de création, la date de **dernier usage** (à 5 minutes près), l'état (active ou révoquée) et la date de révocation. Si quelqu'un lisait toute la table, il ne pourrait pas reconstituer une clé.

**Conséquence importante : une clé perdue ne se retrouve pas.** Personne ne peut la relire, ni toi, ni Claude. On en crée une autre (section 5).

Les navigateurs n'ont **aucun accès** à cette table : dans la base 2, les règles refusent tout par défaut ; dans la base 1, une règle spécifique la ferme à tes comptes (`plateforme_cles` est exclue du joker de `firestore.rules`, avec un test). **Cette règle doit être publiée avant de créer la première clé** (section 7).

## 4. Utiliser l'outil de gestion des clés

Un seul programme : `scripts/cles.js`. Comme l'outil « nouveau client » (voir `nouveau-client.md`), il se lance **depuis le Terminal de ton Mac**, avec **ton** compte Google (`gcloud auth application-default login`, composants installés avec `npm ci --prefix scripts/plateforme`).

**Règle d'or : tout est une simulation tant que tu n'ajoutes pas `--ecrire`.** Lance toujours la simulation d'abord.

Le paramètre `--projet` choisit la base : `crm` (ton CRM, base 1, propriétaire « interne » seulement) ou `plateforme` (les clients, base 2, le client doit déjà exister).

### Voir les clés

```bash
node scripts/cles.js lister --projet plateforme --proprietaire audrey
node scripts/cles.js lister --projet crm
```

Chaque ligne : identifiant court, `active` ou `révoquée`, dernier usage, et **`(EN SERVICE)`** si la clé a servi dans les dernières 24 h. Sans `--proprietaire`, l'outil liste tous les propriétaires du projet.

### Créer une clé

```bash
node scripts/cles.js creer --projet plateforme --proprietaire audrey --ecrire
```

- La valeur complète (`Bearer ` + la clé) est **copiée dans ton presse-papiers** et **n'est pas affichée** (pour qu'elle ne reste pas dans l'historique du Terminal). Colle-la tout de suite dans n8n (section suivante) : **elle ne s'affichera plus jamais**.
- Si tu préfères la voir : ajoute `--afficher`.
- Si le presse-papiers ne marche pas, l'outil le dit et **ne crée rien**.
- Maximum **3 clés actives** par propriétaire.

### La mettre dans n8n

Dans n8n : *Credentials* > *Add credential* > **Header Auth**.
- Nom (*Name*) : `Authorization`
- Valeur (*Value*) : **colle telle quelle** ce que l'outil a copié : c'est déjà `Bearer ` (avec une espace) suivi de la clé. Ne retape rien.
- Nom du credential : `Clé n8n - <client>` (par exemple `Clé n8n - Audrey`).

**Un seul credential par client**, utilisé par **tous** ses workflows. Pour changer la clé plus tard, on ne modifie que ce credential.

### Changer de clé (sans rien couper)

Cas : par précaution, tous les six mois, ou parce que tu ne retrouves plus la clé.
1. `creer ... --ecrire` : une **nouvelle clé** est créée. **L'ancienne reste valable.**
2. Dans n8n, remplace la valeur du credential du client par la nouvelle clé.
3. Attends que les workflows aient tourné, puis `lister` : regarde le **dernier usage de l'ancienne clé**. Si elle n'a plus servi depuis un bon moment, plus aucun workflow ne l'utilise.
4. Révoque l'ancienne (ci-dessous).

### Révoquer une clé

```bash
node scripts/cles.js revoquer --projet plateforme --proprietaire audrey --cle ab12cd34 --ecrire
```

(`ab12cd34` = l'identifiant court donné par `lister`.) La révocation agit **tout de suite** : la clé est refusée dès l'appel suivant. La clé n'est pas supprimée : elle est marquée révoquée.
- Si la clé a servi dans les dernières 24 h, **l'outil refuse** et te dit que des workflows vont s'arrêter. Si tu es sûr, ajoute `--forcer`.
- Si c'est la dernière clé active, l'outil te prévient que plus aucun workflow ne pourra entrer.

### Les cas particuliers

| Situation | Que faire |
|---|---|
| **Clé perdue** (plus dans le presse-papiers, pas dans n8n) | Elle ne se retrouve pas. Crée-en une nouvelle, colle-la dans n8n, puis révoque l'ancienne. |
| **Clé corrompue** (le workflow reçoit un refus alors qu'elle devrait marcher) | Idem : nouvelle clé, nouveau credential, révocation de l'ancienne. |
| **Clé volée ou diffusée par erreur** | `revoquer ... --forcer` **tout de suite**, puis nouvelle clé. Les workflows du client s'arrêtent le temps de coller la nouvelle : c'est voulu. |
| **Plus de place (3 clés actives)** | Révoque d'abord une clé inutile (`lister` montre laquelle n'a pas servi depuis longtemps). |
| **Un client s'en va** | Révoque toutes ses clés (`lister`, puis `revoquer` pour chacune). |

## 4 bis. Appeler la porte depuis n8n

**Une seule adresse par base** : `POST https://chevalier-ia-os.web.app/porte` (base 1, tes workflows). Dans n8n : un nœud *HTTP Request*, méthode `POST`, authentification *Header Auth* avec le credential du propriétaire, corps JSON :

```json
{
  "module": "veille",
  "action": "contenus.ajouter",
  "workflowId": "{{ $workflow.id }}",
  "donnees": { "contenus": [ { "id": "abc123", "sourceId": "UC2UmrCDeb8CEB7t6v6Kqt7A", "titre": "Titre de la vidéo", "url": "https://…", "datePublication": "2026-10-12T15:30:32Z" } ] }
}
```

`workflowId` est **obligatoire** : la porte s'en sert pour vérifier que le workflow appartient bien au propriétaire de la clé (section 6). Aucun autre champ n'est accepté (ni « client », ni chemin) : **le propriétaire et l'endroit où l'on écrit viennent de la clé, jamais du corps de la requête.**

**Actions du module Veille** (toutes les écritures créent sans jamais écraser : rappeler la même action ne change rien) :

| Action | Ce qu'elle fait |
|---|---|
| `sources.lire` | Renvoie les sources suivies (`actifSeulement`: vrai par défaut). |
| `contenus.lire` | Renvoie les contenus, filtrables par `etat` (nouveau, en_cours, resume, echec), 200 au plus. |
| `contenus.ajouter` | Ajoute jusqu'à 100 contenus à l'état « nouveau ». Les sources doivent exister (sinon rien n'est écrit). Un contenu déjà présent n'est pas touché. |
| `contenus.changerEtat` | Change l'état d'un contenu qui existe (`id`, `etat`, et `etapeEchec` pour un échec). Ne crée jamais. |
| `resumes.ajouter` | Enregistre un résumé : `contenuId`, `idExecution` (le numéro d'exécution n8n, qui rend l'appel répétable sans doublon), modèle, coût réel, devise, qui paie (`jerome` ou `client`), nom de la clé d'IA (un **nom** comme `openrouter-jerome`, jamais la clé elle-même : une vraie clé est refusée) et les liens des fichiers. |

**Réponses** : `200 {"ok": true, "resultat": …}` ou `{"ok": false, "erreur": "<code>", "message": "…"}`.

| Statut | Code | Signification |
|---|---|---|
| 401 | `cle_refusee` | Clé absente, inconnue, mal formée, révoquée… (toujours le même message : la réponse ne dit pas pourquoi). |
| 403 | `module_non_actif` | Le module n'est pas actif pour ce propriétaire. |
| 403 | `workflow_refuse` | Le workflow n'appartient pas au propriétaire de la clé (mauvaise étiquette ou mauvais nom). |
| 400 | `requete_invalide` / `action_inconnue` | Corps mal formé, champ inconnu, valeur interdite (le message nomme le champ). |
| 404 | `source_inconnue` / `contenu_inconnu` | L'élément cité n'existe pas chez ce propriétaire. |
| 413 | `corps_trop_gros` | Plus de 256 Ko. |
| 429 | `limite_depassee` | Plus de 120 requêtes par minute pour cette clé. |
| 503 | `verification_indisponible` | n8n ne répond pas ou la clé d'API n8n manque : **la porte se ferme** plutôt que de laisser passer sans contrôle. Réessayer plus tard. |

Un navigateur ne peut pas appeler la porte (toute requête avec une origine est refusée). Seul n8n l'appelle.

## 5. Comprendre les protections (et leurs limites)

- **La clé n'est jamais stockée** : seulement son empreinte. La recherche se fait par l'empreinte (une lecture directe) : il n'y a aucune comparaison de secrets qu'on pourrait chronométrer.
- **Le format est vérifié avant toute lecture** dans la base : une entrée absurde ne coûte rien.
- **Un document « actif » douteux est refusé** : seul `actif: true` exact est accepté (jamais « actif par défaut »).
- **L'étiquette doit correspondre au propriétaire enregistré** : si les deux diffèrent, la clé est refusée.
- **Plusieurs clés actives en même temps** : le changement de clé ne coupe rien.
- **La vérification d'intégrité** : la porte lit le workflow appelant dans n8n (**lecture seule, un seul GET**, la clé d'API n8n ne sort jamais ailleurs) et vérifie : pour un client, l'étiquette `client-<id>` (et aucune autre étiquette de client) et un nom qui commence par `client-<id>-` ; pour toi (propriétaire « interne »), exactement une étiquette parmi `interne`, `produit`, `perso`, aucune étiquette de client, et un nom qui commence par ce mot suivi d'un tiret. Un contrôle réussi est gardé 60 secondes. **Si n8n est injoignable, la porte se ferme** (503). Elle **protège des erreurs** (la clé d'un client collée dans le workflow d'un autre), **pas d'une personne qui détiendrait la clé** : celle-ci pourrait annoncer l'identifiant d'un workflow du même propriétaire. Garde donc les clés secrètes comme des mots de passe. **Limite** : un client dont l'identifiant dépasse **17 caractères** ne peut pas avoir de clé (l'étiquette n8n `client-<id>` ferait plus de 24 caractères).
- **Isolation** : le nom des tables est écrit dans le code, jamais reçu ; une clé n'écrit que sous son propriétaire (`clients/<id>/…` dans la base 2, la racine dans la base 1) ; une clé de client n'ouvre rien dans la base 1.
- **Aucune suppression** : la porte sait créer (sans écraser), mettre à jour ce qui existe, et lire. Elle n'a aucun moyen de supprimer.
- **Journal** : une ligne par appel (clé courte, propriétaire, module, action, workflow, statut, durée). **Jamais** la clé, les données reçues, les titres ni la clé d'API n8n (liste blanche de champs, testée).
- **Plafond** : 120 requêtes par minute et par clé (compteur en mémoire de l'instance : un frein grossier, pas une garantie ; 3 instances au plus).

## 6. Où en est-on

| Élément | État |
|---|---|
| Bibliothèque des clés (`scripts/porte/cles.js`) | ✅ écrite et testée (`tests/porte-cles.test.js`) |
| Outil de gestion (`scripts/cles.js`, `scripts/porte/outil.js`) | ✅ écrit et testé (`tests/porte-outil.test.js`) ; lancé sur la vraie base le 2026-10-14 (il copie maintenant `Bearer` + la clé, prête à coller dans n8n) |
| Cœur de la porte (`scripts/porte/porte.js`, `validation.js`, `actions-veille.js`, `adaptateur.js`, `n8n.js`) | ✅ écrit et testé : attaques en mémoire (`tests/porte.test.js`), contre un Firestore d'essai (`tests/porte-firestore.test.js`), assemblage avec un faux n8n (`tests/porte-fonction.test.js`) |
| Fermeture de `plateforme_cles` aux navigateurs (base 1) : règles, cahier des charges, guide `audit-ecran.md`, tests | ✅ faite et **publiée dans Firebase le 2026-10-14** |
| Fonction de la porte pour la base 1 (`functions/src/porte.js`) | ✅ **en ligne depuis le 2026-10-14** : fonction `porte` dans `functions/src/index.js` (Paris, compte `porte-serveur`, 3 instances au plus), réécriture `/porte` dans `firebase.json` |
| Porte pour la base 2 (clients) | ⏳ à faire avec le premier client : même code, autre assemblage, copie partagée et règles à adapter |
| Mise en service (section 7) | ✅ faite le 2026-10-14 (points 1 à 5) |

## 7. Mise en service dans ton CRM (base 1), dans l'ordre

**Tout ceci a été fait le 2026-10-14.** Chaque point est soit **à toi** (identifiants, secrets), soit **à moi** (code), soit **à nous deux**. La fonction n'a été branchée qu'après les points 1 à 3.

1. **Toi : un compte de service dédié** `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com`, avec seulement « Utilisateur Cloud Datastore » (Firestore) et « Accesseur de secrets » sur le seul secret `N8N_API_KEY`. Même principe que le compte `mcp-serveur` du serveur MCP : on ne réutilise pas son compte, pour que chaque porte ait ses propres droits.
2. **Toi : déposer la clé d'API de n8n** dans Secret Manager (projet `chevalier-ia-os`, nom `N8N_API_KEY`). Je ne la vois jamais et je ne la manipule pas : tu la crées dans n8n (*Settings* › *n8n API*, en lecture seule si ton n8n le propose), tu la copies, puis dans le Terminal : `pbpaste | gcloud secrets create N8N_API_KEY --project chevalier-ia-os --data-file=-`.
3. **Toi : publier les règles Firestore** de la base 1 (celles de `firestore.rules`, qui ferment `plateforme_cles`), **avant** de créer une clé.
4. **Moi : brancher la fonction** (`functions/src/index.js` avec le compte de service du point 1), la réécriture `/porte` dans `firebase.json`, et adapter les tests qui figent ces fichiers. **Attention : la fusion de la branche dans `main` déploie les fonctions toute seule** : on ne fusionne qu'après les points 1 à 3.
5. **Nous deux : créer ta première clé** (`node scripts/cles.js creer --projet crm --proprietaire interne --ecrire`), la mettre dans n8n (section 4), et tester avec un workflow d'essai de ta veille.

### Leçons de la mise en service (2026-10-14)

- **Un workflow qui appelle la porte doit s'appeler `interne-…` (ou `produit-…`, `perso-…`) et porter l'étiquette correspondante** : sans cela, la porte répond 403 (`pour_qui_absent_ou_multiple`).
- **La valeur du credential n8n est `Bearer ` + la clé** : l'outil copie maintenant ce texte complet, à coller tel quel dans le champ *Value*. Sans `Bearer`, la porte répond 401 (`cle_format`).
- **Ne rien copier d'autre entre la création de la clé et le collage** : copier une commande remplace le presse-papiers.
- **La clé d'API n8n** se dépose avec un champ caché : `read -s "K?…" && printf %s "$K" | gcloud secrets versions add N8N_API_KEY …`. La porte la garde 5 minutes en mémoire : attendre avant de retester.
- **Sur Firebase, le corps de la requête est déjà lu** quand la porte le reçoit : elle le lit dans `req.rawBody` (corrigé le 2026-10-14, test dédié dans `tests/porte.test.js`).

## 8. Décisions et dates

- **2026-10-13** : une clé technique par propriétaire, commune à tous ses modules (même base, tables reliables) ; l'ancienne clé reste valable jusqu'à sa révocation (décision de Jérôme : « le plus sûr » pour la production) ; table de clés nommée selon la règle `module_table`.
- **2026-10-14** : format `cle-n8n.<propriétaire>.<aléatoire>` (le nom du client au début) ; 3 clés actives au plus par propriétaire ; porte dans les deux bases, une adresse par base ; la clé d'API n8n sera déposée dans la base 1 par Jérôme pour la vérification d'intégrité.

Décisions plus larges (une base pour Jérôme, une pour les clients, un site dédié par client) : fiche du second cerveau *Plateforme clients - décisions du module Automatisations et de la veille*.
- **2026-10-14** : porte en service pour la base 1 (fonction `porte`, compte `porte-serveur`, secret `N8N_API_KEY`) ; première clé `interne` en usage, les deux clés d'essai révoquées.
