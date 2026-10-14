# La porte et les clés des workflows n8n

> **État au 2026-10-14 : en construction.** Les clés et l'outil qui les gère sont écrits et testés. **La porte elle-même (la fonction que n8n appelle) n'est pas encore écrite ni déployée.** Ce guide est mis à jour à chaque étape ; la section « Où en est-on » dit ce qui marche aujourd'hui.

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
                                     3. le workflow appelant appartient bien à ce propriétaire ?   (à venir)
                                     4. les données sont-elles valides et de taille raisonnable ?  (à venir)
                                     5. écriture (un identifiant fixe : jamais de doublon)         (à venir)
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

Les navigateurs n'ont **aucun accès** à cette table : dans la base 2, les règles refusent tout par défaut ; dans la base 1, une règle spécifique la ferme à tes comptes (à venir, avec la porte).

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

- La clé est **copiée dans ton presse-papiers** et **n'est pas affichée** (pour qu'elle ne reste pas dans l'historique du Terminal). Colle-la tout de suite dans n8n (section suivante) : **elle ne s'affichera plus jamais**.
- Si tu préfères la voir : ajoute `--afficher`.
- Si le presse-papiers ne marche pas, l'outil le dit et **ne crée rien**.
- Maximum **3 clés actives** par propriétaire.

### La mettre dans n8n

Dans n8n : *Credentials* > *Add credential* > **Header Auth**.
- Nom (*Name*) : `Authorization`
- Valeur (*Value*) : `Bearer ` (avec une espace) **suivi de la clé collée**.
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

## 5. Comprendre les protections (et leurs limites)

- **La clé n'est jamais stockée** : seulement son empreinte. La recherche se fait par l'empreinte (une lecture directe) : il n'y a aucune comparaison de secrets qu'on pourrait chronométrer.
- **Le format est vérifié avant toute lecture** dans la base : une entrée absurde ne coûte rien.
- **Un document « actif » douteux est refusé** : seul `actif: true` exact est accepté (jamais « actif par défaut »).
- **L'étiquette doit correspondre au propriétaire enregistré** : si les deux diffèrent, la clé est refusée.
- **Plusieurs clés actives en même temps** : le changement de clé ne coupe rien.
- **Ce que la vérification d'intégrité fera, et ne fera pas** (à venir) : la porte lira le workflow appelant dans n8n (lecture seule) et vérifiera que son tag `client-<id>` et le préfixe de son nom (`client-<id>-…`) correspondent au propriétaire de la clé. Elle **protège des erreurs** (la clé d'un client collée dans le workflow d'un autre), **pas d'une personne qui détiendrait la clé** : celle-ci pourrait annoncer l'identifiant d'un workflow du même client. Garde donc les clés secrètes comme des mots de passe.

## 6. Où en est-on

| Élément | État |
|---|---|
| Bibliothèque des clés (`scripts/porte/cles.js`) : format, empreinte, vérification | ✅ écrite et testée (`tests/porte-cles.test.js`) |
| Outil de gestion (`scripts/cles.js`, `scripts/porte/outil.js`) : lister, créer, révoquer | ✅ écrit et testé (`tests/porte-outil.test.js`), essayé en émulateur ; **jamais lancé sur une vraie base** |
| La porte (fonction Firebase) et ses actions de veille | ⏳ à écrire |
| Vérification d'intégrité auprès de n8n | ⏳ à écrire (demande de déposer la clé d'API n8n dans la base 1, par Jérôme) |
| Fermeture de `plateforme_cles` aux navigateurs dans les règles de la base 1 | ⏳ à faire avec la porte (modifier aussi le cahier des charges et ses tests) |
| Déploiement | ⏳ seulement avec l'accord de Jérôme |

## 7. Décisions et dates

- **2026-10-13** : une clé technique par propriétaire, commune à tous ses modules (même base, tables reliables) ; l'ancienne clé reste valable jusqu'à sa révocation (décision de Jérôme : « le plus sûr » pour la production) ; table de clés nommée selon la règle `module_table`.
- **2026-10-14** : format `cle-n8n.<propriétaire>.<aléatoire>` (le nom du client au début) ; 3 clés actives au plus par propriétaire ; porte dans les deux bases, une adresse par base ; la clé d'API n8n sera déposée dans la base 1 par Jérôme pour la vérification d'intégrité.

Décisions plus larges (une base pour Jérôme, une pour les clients, un site dédié par client) : fiche du second cerveau *Plateforme clients - décisions du module Automatisations et de la veille*.
