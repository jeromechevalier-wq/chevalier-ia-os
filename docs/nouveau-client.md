# Créer un client, sauvegarder ses données, le supprimer

> **Module `automatisations` (chantier 14, ex-`journal`, renommé le 16/10/2026)** : `--modules affaires,projets,automatisations` ou `activer-module <client> automatisations` (l'ancien nom `journal` est encore accepté par l'outil et lu dans les fiches existantes). L'identifiant du client doit faire **17 caractères au plus** pour ce module (étiquette n8n `client-<identifiant>` limitée à 24 caractères) ; sinon l'outil refuse. Voir `docs/automatisations-n8n.md`.

Deux petits programmes à lancer **depuis le Terminal de ton Mac**, avec **ton** compte Google :

| Programme | À quoi il sert |
|---|---|
| `scripts/nouveau-client.js` | créer un client (page à ses couleurs, premier membre, modules), puis ajouter / retirer des membres, activer un module, désactiver un client |
| `scripts/donnees-client.js` | **sauvegarder** toutes les données d'un client (pour les lui remettre), puis les **supprimer** |

Règle d'or : **tout est une simulation tant que tu n'ajoutes pas `--ecrire` à la fin de la commande.** La simulation affiche exactement ce qui serait écrit, sans rien écrire. Lance toujours la simulation d'abord, relis, puis relance la même commande avec `--ecrire`.

Ces programmes visent par défaut le projet des clients `chevalier-ia-app`. Ils refusent toujours le projet du CRM (`chevalier-ia-os`). Chaque commande commence par une ligne « Base visée : … (VRAIE base) » : vérifie-la.

---

## À faire une seule fois

### 1. Installer les composants du programme

Dans le Terminal, va dans le dossier du projet `chevalier-ia-os` (clic droit sur le dossier dans le Finder > *Nouveau Terminal au dossier*), puis :

```bash
npm ci --prefix scripts/plateforme
```

(Il faut Node 22 ou plus : `node -v` doit afficher `v22…` ou plus.) Si l'installation répond une erreur de droits sur `~/.npm`, c'est un problème de ton Mac, pas du projet : npm écrit lui-même la commande à copier (elle commence par `sudo chown`) ; demande-moi si tu hésites.

### 2. Te connecter à Google (aucun mot de passe ni clé à copier)

Les programmes utilisent **tes identifiants Google**, comme `firebase login`. Il faut l'outil `gcloud` (installation : <https://cloud.google.com/sdk/docs/install>, version Mac). Puis :

```bash
gcloud auth application-default login
```

Une page Google s'ouvre : choisis **ton** compte (celui qui est propriétaire du projet `chevalier-ia-app`) et accepte. Ensuite, une seule fois :

```bash
gcloud auth application-default set-quota-project chevalier-ia-app
```

La connexion est gardée par ton Mac, dans ton dossier personnel ; **rien n'est écrit dans le projet** et il n'y a rien à coller nulle part. Pour te déconnecter : `gcloud auth application-default revoke`. La connexion expire de temps en temps : relance simplement la première commande.

### 3. Trouver le nom du stockage (seulement si les images échouent)

Par défaut, les images partent dans `chevalier-ia-app.firebasestorage.app`. Si une erreur dit que le « bucket » n'existe pas, ouvre <https://console.firebase.google.com/project/chevalier-ia-app/storage>, copie le nom qui suit `gs://` en haut de la page, et ajoute `--bucket nom-copié` aux commandes qui envoient des images.

---

## Créer un client

### Exemple complet (client fictif)

Prépare les images dans un dossier, par exemple `~/Documents/images-clientdemo/` : un logo (`logo.png`) et jusqu'à 4 photos. Formats : png, jpg, webp ou gif ; 2 Mo au plus chacune. Les svg sont refusés.

**1. Simulation** (ne change rien) :

```bash
node scripts/nouveau-client.js clientdemo --nom "Client de démonstration" --couleur "#336699" --accueil "Bienvenue dans votre espace." --membre jerome.chevalier@gmail.com:editeur --modules affaires,projets --logo ~/Documents/images-clientdemo/logo.png --images ~/Documents/images-clientdemo/photo1.jpg,~/Documents/images-clientdemo/photo2.jpg
```

Tu vois la liste « CRÉER … » avec le contenu de chaque fiche, et la phrase *SIMULATION : rien n'a été écrit*.

**2. Pour de vrai** : la même commande, avec `--ecrire` ajouté à la fin.

**3. Vérifier** :

```bash
node scripts/nouveau-client.js afficher clientdemo
```

Puis ouvre `https://chevalier-ia-app.web.app/espace/clientdemo` et connecte-toi avec l'adresse que tu as mise comme membre.

### Ce que veut dire chaque morceau

| Morceau | Explication |
|---|---|
| `clientdemo` | l'identifiant du client : sert dans l'adresse `/espace/clientdemo`. 1 à 40 caractères : minuscules sans accent, chiffres, `-` et `_`. Pas modifiable ensuite. |
| `--nom "…"` | le nom affiché (obligatoire) |
| `--couleur "#336699"` | la couleur du client (`#rgb` ou `#rrggbb`) |
| `--accueil "…"` | le texte de bienvenue sur la page de connexion (500 caractères au plus) |
| `--membre adresse:rôle` | une personne qui a le droit d'entrer. **Au moins une.** À répéter pour chaque personne. Rôles : `editeur` (lit et écrit) ou `lecteur` (lit seulement). **L'adresse en minuscules.** |
| `--modules crm,automatisations` | les écrans activés. **`crm` = l'interrupteur unique du CRM (2.6.0) : il allume `affaires` ET `projets`** (un seul bloc « CRM » dans le menu du client). `affaires` seul (CRM sans les projets) et `projets` (qui ne marche que **avec** `affaires`) restent acceptés. Sans `--modules`, le client ne voit que l'accueil provisoire. |
| `--logo`, `--images` | fichiers de ton Mac (facultatif ; 4 images au plus, séparées par des virgules, sans espace) |

### Envoyer ou changer les images plus tard

Les images partent avec la commande. Pour les changer sur un client qui existe déjà :

```bash
node scripts/nouveau-client.js clientdemo --mettre-a-jour --logo ~/Documents/images-clientdemo/nouveau-logo.png --ecrire
```

`--mettre-a-jour` ne change **que** ce qui est écrit dans la commande (ici le logo). Si tu donnes `--images`, la nouvelle liste **remplace** toute l'ancienne.

### Si le client existe déjà

Sans `--mettre-a-jour`, le programme refuse et n'écrit rien (« existe déjà »). Tu peux relancer une commande sans risque : elle ne crée jamais de doublon, et dit « Rien à changer » quand tout est déjà comme demandé.

### Les autres commandes (toutes en simulation sauf avec `--ecrire`)

```bash
node scripts/nouveau-client.js afficher clientdemo
node scripts/nouveau-client.js ajouter-membre clientdemo marie@exemple.fr:lecteur
node scripts/nouveau-client.js changer-role clientdemo marie@exemple.fr:editeur
node scripts/nouveau-client.js retirer-membre clientdemo marie@exemple.fr
node scripts/nouveau-client.js activer-module clientdemo crm        # allume affaires et projets
node scripts/nouveau-client.js desactiver-module clientdemo crm     # éteint les deux
node scripts/nouveau-client.js activer-module clientdemo projets
node scripts/nouveau-client.js desactiver-client clientdemo
node scripts/nouveau-client.js reactiver-client clientdemo
```

- `retirer-membre` : la personne perd l'accès tout de suite (le programme te prévient si c'est le dernier éditeur).
- `desactiver-client` : la page du client devient « indisponible », **sans rien effacer** (données et membres restent). `reactiver-client` la rend.
- `desactiver-module affaires` est refusé tant que `projets` est actif (utiliser `desactiver-module <client> crm` pour éteindre les deux).

---

## Remettre les données d'un client (sauvegarde)

```bash
node scripts/donnees-client.js exporter clientdemo --avec-images
```

Crée un fichier `~/Documents/sauvegardes-clients/clientdemo-<date et heure>.json` avec **toutes** les données de ce client (jamais celles d'un autre) : sa fiche, ses membres, ses personnes, organisations, affaires, projets… Avec `--avec-images`, ses images sont copiées dans un dossier à côté. Le fichier est lisible (JSON) ; les dates y sont écrites sous la forme `{"__type": "date", "secondes": …}`.

- Le programme **refuse d'enregistrer le fichier dans le dossier du projet** (pour ne jamais le publier ni le mettre sur GitHub par erreur). Pour choisir l'endroit : `--sortie ~/Documents/mon-dossier/fichier.json`.
- Il n'écrase jamais un fichier existant.
- Ce fichier contient des données de personnes : ne le mets ni dans un message, ni dans un dépôt.

## Supprimer un client (définitif)

Dans l'ordre, et sans sauter d'étape :

1. **Sauvegarder** (commande ci-dessus). Garde le chemin du fichier créé.
2. **Simuler** (ne supprime rien, compte ce qui partirait) :

```bash
node scripts/donnees-client.js supprimer clientdemo --export ~/Documents/sauvegardes-clients/clientdemo-2026-10-11T10-00-00.json
```

3. **Supprimer vraiment** : la même commande avec `--ecrire`. Le programme demande de **taper l'identifiant du client** (`clientdemo`) puis Entrée ; toute autre réponse annule.

Ce qui est supprimé : tout ce qui est sous `clients/clientdemo/` (sous-dossiers compris, membres compris), la fiche `marques/clientdemo` et les images `marques/clientdemo/`. **Rien d'autre**, jamais : ni un autre client, ni le CRM. Le journal de ce qui a été supprimé s'affiche et est enregistré à côté du fichier de sauvegarde (`….json.suppression.txt`).

Garde-fous : sauvegarde obligatoire ; si quelque chose a changé chez le client depuis la sauvegarde (un document ajouté ou modifié), le programme refuse et demande de la refaire ; un identifiant vide, `marques`, `clients` ou contenant `*` est refusé ; un seul client à la fois. Si tu lances la suppression dans une fenêtre qui ne permet pas de taper, ajoute `--confirmer clientdemo`.

Si la suppression est interrompue (coupure d'Internet), refais une sauvegarde, puis relance : le programme reprend ce qui reste.

---

## Erreurs fréquentes

| Message | Ce que ça veut dire | Que faire |
|---|---|---|
| *Les composants de l'outil ne sont pas installés* | étape 1 pas faite | `npm ci --prefix scripts/plateforme` |
| *l'ordinateur ne connaît pas encore vos identifiants* | étape 2 pas faite, ou connexion expirée | `gcloud auth application-default login` |
| *Google refuse l'accès* (403 / permission) | le compte connecté n'a pas les droits sur `chevalier-ia-app` | vérifier le compte choisi à l'étape 2 (le même que dans la console Firebase) ; vérifier le projet de quota |
| *le bucket n'existe pas* | Storage pas activé, ou nom différent | voir « Trouver le nom du stockage » ; activer Storage (`docs/deploiement-plateforme.md`, étape 3) |
| *doit être écrite en minuscules* | une adresse avec une majuscule | réécrire l'adresse en minuscules (le message donne la bonne) |
| *Le module « Projets » ne peut pas être activé sans : Affaires* | `projets` demandé sans `affaires` | `--modules affaires,projets` |
| *Le client … existe déjà* | identifiant déjà pris | choisir un autre identifiant, ou `--mettre-a-jour` |
| *mot réservé* / *pas valide* | identifiant interdit | minuscules, chiffres, `-`, `_` ; pas de mot comme `marques` |
| *La sauvegarde ne correspond pas à ce qui existe aujourd'hui* | le client a changé depuis la sauvegarde | refaire la sauvegarde puis relancer |
| *Option inconnue : --…* | faute de frappe | les options commencent par deux tirets ; `--aide` liste tout |
| une image est refusée | trop grosse (> 2 Mo), format non accepté, ou fichier qui n'est pas vraiment une image | réduire l'image ; png, jpg, webp ou gif |

Besoin de la liste complète des options : `node scripts/nouveau-client.js --aide` ou `node scripts/donnees-client.js --aide`.

Pour essayer **sans rien lire en ligne** (par exemple sans être connecté) : ajoute `--hors-ligne` à une simulation de création ; le programme ne vérifie alors pas si le client existe déjà.

---

## Pour les curieux

- Les programmes ne sont pas publiés avec le site (le dossier `scripts/` est exclu de l'envoi), et ils tournent sur ton Mac seulement.
- Ils écrivent avec les droits d'administration, donc **sans passer par les règles de sécurité** : c'est pour cela qu'ils vérifient tout eux-mêmes. Les tests (`tests/outil-client.test.js`, sur émulateurs) prouvent qu'un client créé est lisible par ses membres et refusé aux autres, qu'une simulation n'écrit rien, qu'une sauvegarde ne contient que le client demandé et qu'une suppression n'efface rien d'un autre client.
- Journal technique : `docs/journal-chantier-13.md`. Étude : `docs/etude-reutilisation-coque.md`, chantier 13.
