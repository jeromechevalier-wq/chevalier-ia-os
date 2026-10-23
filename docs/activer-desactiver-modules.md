# Activer et désactiver un module chez un client

Un **module** est un bloc d'écrans (par exemple « Automatisations » ou « Affaires et projets »). Chaque client voit seulement les modules que tu as activés pour lui. Il y a **deux façons** de les gérer : à la main dans la console Firebase, ou avec une commande dans le Terminal. Les deux donnent le même résultat.

## Les modules existants

| Nom à écrire | Ce que le client voit | À savoir |
|---|---|---|
| `affaires` | « Affaires et projets », sans les projets : accueil, personnes, organisations, affaires, journal des modifications | **à écrire pour tout nouveau client** |
| `projets` | les projets (et leurs archives, depuis le bouton « Archives » de l'écran Projets) | ne marche **que si `affaires` est aussi actif** : écris `affaires: true` **et** `projets: true` |
| `crm` | **ancien raccourci (avant 2.12)** : `crm: true` allume `affaires` **et** `projets`. Il est toujours **lu** (une fiche qui le contient ne change pas, par exemple chez Ingrid), mais il n'est plus proposé : pour une nouvelle fiche, écris `affaires: true` + `projets: true` | ne plus l'écrire |
| `veille` | « Veille » : contenus et sources suivies | |
| `automatisations` | « Automatisations > Historique » (historique des workflows n8n) | l'identifiant du client doit faire 17 caractères au plus ; il faut aussi l'étiquette `client-<identifiant>` sur les workflows dans n8n. **Ancien nom : `journal`** (renommé le 16/10/2026) : une fiche qui dit encore `journal: true` marche toujours, sans rien changer ; pour un nouveau réglage, écris `automatisations`. Ne pas confondre avec l'écran « Journal des modifications » (historique des modifications), qui n'est pas un module à activer. |

Ce que change un interrupteur : les **menus du client** (au prochain rechargement de sa page). Les **données ne sont jamais effacées** : si tu rallumes un module, tout est retrouvé. Pour `automatisations`, éteint, plus rien n'est copié depuis n8n pour ce client.

## Méthode 1 : à la main, dans la console Firebase (sans Terminal)

1. Ouvre la fiche du client. Remplace `clientdemo` par l'identifiant du client dans ce lien :
   <https://console.firebase.google.com/project/chevalier-ia-app/firestore/databases/-default-/data/~2Fclients~2Fclientdemo>
   (Sinon : console Firebase > projet **chevalier-ia-app** > **Firestore Database** > onglet **Données** > collection `clients` > clique sur l'identifiant du client.)
2. Dans la colonne de droite, repère le champ **`modules`** (type *map*). Il contient une ligne par module, par exemple `affaires: true`.
3. **Pour activer** un module qui n'est pas dans la liste :
   - survole la ligne `modules`, clique sur le **+** (« Ajouter un champ » dans le champ) ;
   - **Nom du champ** : le nom du module (`affaires`, `projets`, `automatisations`, `veille`, `mcp`) ; pour « Affaires et projets », ajoute deux lignes : `affaires: true` et `projets: true` (l'ancien champ `crm: true` marche toujours, mais ne l'écris plus) ;
   - **Type** : *boolean* ; **Valeur** : `true` ;
   - clique sur **Ajouter**.
4. **Pour désactiver** : clique sur la valeur `true` du module, mets **`false`**, puis valide par **Mettre à jour**.
5. **Pour réactiver** un module qui est à `false` : même chose, mets `true`.

Contrôles :
- Le module ajouté doit être **dans** `modules`, au même niveau que les autres, pas dans un champ à part.
- Écris le nom du module exactement comme dans le tableau (minuscules, sans accent).
- Si tu actives `projets`, assure-toi que `affaires` est à `true`.

Pour voir le résultat : ouvre `https://chevalier-ia-app.web.app/espace/<identifiant>` et recharge la page (sur téléphone, ferme et rouvre l'application).

## Méthode 2 : une commande dans le Terminal

À faire une seule fois sur le Mac : avoir fait `gcloud auth application-default login` (identifiants d'administrateur).

Dans le Terminal, dans le dossier du projet :

```bash
cd "/Users/jeromechevalier/Code-Chevalier-IA/chevalier-ia-os"
```

Activer :

```bash
node scripts/nouveau-client.js activer-module <identifiant> automatisations --ecrire
```

Désactiver :

```bash
node scripts/nouveau-client.js desactiver-module <identifiant> automatisations --ecrire
```

Sans `--ecrire`, la commande **simule** : elle affiche ce qu'elle ferait, sans rien changer. L'outil refuse aussi les combinaisons invalides (par exemple `projets` sans `affaires`).

Voir l'état d'un client :

```bash
node scripts/nouveau-client.js afficher <identifiant>
```

## Si quelque chose ne marche pas

| Ce que tu vois | Cause probable |
|---|---|
| Le module n'apparaît pas chez le client | page non rechargée, nom mal écrit, valeur à `false`, ou le module est ajouté hors du champ `modules` |
| `Could not load the default credentials` dans le Terminal | l'étape `gcloud auth application-default login` n'est pas faite |
| `gcloud: command not found` | ouvre un nouveau Terminal (l'installation est dans `~/.local/google-cloud-sdk`) |
| L'historique des automatisations est vide | pas d'étiquette `client-<identifiant>` sur un workflow n8n, ou pas encore de clic sur « Rafraîchir l'historique » |

Voir aussi : `docs/nouveau-client.md` (créer un client, membres) et `docs/automatisations-n8n.md` (le module Automatisations).

## Le module « mcp » (accès d'un assistant : Claude, ChatGPT)
`activer-module <client> mcp --ecrire` allume le lien `https://chevalier-ia-app.web.app/mcp/<client>` et la page « Connecter ton assistant » ; `desactiver-module <client> mcp --ecrire` les éteint (le lien ne répond plus à l'appel suivant). Il ne dépend d'aucun autre module, mais n'a d'outils à proposer que ceux des modules actifs (CRM = `affaires` + `projets`). Tout est expliqué dans `docs/mcp-clients.md`.
