# Brancher un client sur le serveur MCP (étape 6)

Référence : `plan-mcp.md` section 5.10 (configuration des clients), `securite-et-pannes.md` (jetons, urgences). Ce guide dit comment **Claude Code** (sur le Mac de Jérôme) et **Hermes Agent** (sur le VPS) se connectent à `https://chevalier-ia-os.web.app/mcp`. La partie Claude Code est **validée en réel** (03/10/2026) ; la partie Hermes est **un brouillon non testé**.

Règle commune : **le jeton n'est jamais écrit dans un fichier du dépôt, dans un dossier synchronisé avec Drive, ni dans une conversation.** Chaque client le reçoit par une variable d'environnement ou par un coffre.

## 1. Claude Code sur le Mac (validé)

### Ce qui a été testé, et où

- **Prototype dans une session cloud** (Claude Code 2.1.288, copie locale du serveur, jeton d'essai) : la commande ci-dessous se connecte (`✓ Connected`), un vrai appel d'outil réussit (`claude -p` a appelé `qui_suis_je`), avec la variable absente ou fausse Claude Code affiche une erreur claire (« Missing environment variables », puis 401) et ne se connecte pas. La configuration écrite ne contient que `${CHEVALIER_MCP_TOKEN}`, jamais le jeton.
- **Sur le Mac de Jérôme, serveur réel** : `claude mcp list` affiche `chevalier-ia-os … ✓ Connected` ; dans Claude Code, `qui_suis_je` répond `claude-code-jerome`, profil `claude-code`, 33 outils. Le Trousseau (section « Retrouver le jeton tout seul ») a été validé dans un onglet neuf.

### La commande (une seule fois)

Le jeton doit être dans la variable `CHEVALIER_MCP_TOKEN` de la fenêtre (`read -s CHEVALIER_MCP_TOKEN; export CHEVALIER_MCP_TOKEN`, puis coller le jeton depuis le gestionnaire de mots de passe ; contrôle sans l'afficher : `[ -n "$CHEVALIER_MCP_TOKEN" ] && echo "jeton : ${#CHEVALIER_MCP_TOKEN} caractères" || echo "jeton : VIDE"` doit répondre **47 caractères**). Puis :

```sh
claude mcp add --transport http --scope user chevalier-ia-os https://chevalier-ia-os.web.app/mcp --header 'Authorization: Bearer ${CHEVALIER_MCP_TOKEN}'
claude mcp list
```

Deux détails qui comptent :
- **Guillemets simples** autour de `Authorization: Bearer ${CHEVALIER_MCP_TOKEN}`. Avec des guillemets doubles, le Terminal remplacerait la variable par le jeton, et celui-ci serait écrit en clair dans `~/.claude.json`.
- **`--scope user`** rend le serveur visible depuis n'importe quel dossier. Sans lui, Claude Code l'attache au dossier où la commande a été tapée, et `claude mcp list` lancé ailleurs ne le montre pas (piège rencontré le 03/10/2026).

### Retrouver le jeton tout seul (Trousseau d'accès de macOS)

Sans cela, le jeton n'existe que dans la fenêtre où il a été saisi : dans une fenêtre neuve, le serveur apparaît en échec (« Missing environment variables »). Le Trousseau garde le jeton chiffré, et une petite fonction ne le lit **que quand `claude` est lancé**.

1. Ranger le jeton (il est demandé deux fois, sans affichage) :
   ```sh
   security add-generic-password -a "$USER" -s chevalier-mcp-token -U -w
   ```
   Contrôle sans l'afficher : `t="$(security find-generic-password -a "$USER" -s chevalier-mcp-token -w)"; echo "${#t} caractères"; unset t` doit répondre 47. Si macOS demande l'accès au Trousseau : « Toujours autoriser ».
2. Ajouter la fonction à `~/.zshrc` (le fichier peut ne pas exister : la commande le crée). **Une seule ligne**, sans collage multi-lignes (un caractère en trop après la ligne `EOF` d'un bloc multi-lignes a bloqué le Terminal le 03/10/2026) :
   ```sh
   printf '\n# Chevalier IA OS : le jeton MCP est lu dans le Trousseau seulement au lancement de claude\nclaude() {\n  CHEVALIER_MCP_TOKEN="$(security find-generic-password -a "$USER" -s chevalier-mcp-token -w 2>/dev/null)" command claude "$@"\n}\n' >> ~/.zshrc
   ```
3. Dans un **nouvel onglet** : `claude mcp list` montre `✓ Connected` sans avoir saisi le jeton, et `[ -z "$CHEVALIER_MCP_TOKEN" ] && echo "bon"` répond « bon » (le jeton n'est pas dans la fenêtre : il n'est lu que par `claude`).

Limite : un Claude Code lancé **hors du Terminal** (application, éditeur) ne passe pas par cette fonction : le serveur y apparaît en échec, sans rien casser d'autre. Les sessions lancées par `claude` héritent du jeton, comme tout programme qu'elles démarrent : c'est le jeton « claude-code », qui a tous les droits (suppression comprise).

### Permissions : garder la demande pour ce qui écrit

Claude Code demande une permission avant chaque outil du serveur. **Garder cette demande pour toutes les écritures, et surtout pour `supprimer_*` et `restaurer_depuis_audit`.** On peut, si on le souhaite, autoriser d'avance les seuls outils de lecture : leurs noms sont de la forme `mcp__chevalier-ia-os__<outil>` (par exemple `mcp__chevalier-ia-os__chercher`). Non mis en place, et à ne pas élargir aux outils d'écriture sans y réfléchir.

### Changer ou révoquer le jeton

- **Remplacer** : créer un nouveau jeton (`node outils/creer-jeton.js claude-code-jerome-2 claude-code`), ajouter sa ligne dans une **nouvelle version** du secret `MCP_JETONS`, ranger le nouveau jeton dans le Trousseau (`security add-generic-password … -U -w` remplace l'ancien), tester `claude mcp list`, puis passer l'ancienne ligne à `"actif": false`.
- **Couper tout de suite** : voir `securite-et-pannes.md`, section 4.
- **Retirer le serveur de Claude Code** : `claude mcp remove chevalier-ia-os`.

### Si `claude mcp list` affiche `✗ Failed to connect`

| Cause probable | Vérification | Remède |
|---|---|---|
| Fonction du Trousseau absente (fenêtre ouverte avant la création de `~/.zshrc`, ou fonction jamais ajoutée) | `type claude` doit dire « shell function » | Ouvrir un nouvel onglet ; sinon refaire l'étape 2 |
| Jeton absent ou mauvais dans le Trousseau | longueur lue par la commande de contrôle (47 attendu) | Refaire l'étape 1 |
| Jeton révoqué ou secret `MCP_JETONS` désactivé | un `curl` donne `401` ou `503` | Voir `securite-et-pannes.md`, « Réponses du serveur `/mcp` » |
| Claude Code lancé hors du Terminal | le serveur marche dans un onglet du Terminal | Lancer `claude` depuis le Terminal |
| Serveur en panne | `curl` (voir `mcp-etape-2.md`) | Voir `securite-et-pannes.md` |

Notes de fonctionnement, sans conséquence : le journal du serveur montre parfois `server/discover` (400) et un `GET` (405) au démarrage d'un client : Claude Code teste des variantes du protocole, le serveur répond par un refus, et la connexion se fait ensuite normalement.

## 2. Hermes Agent sur le VPS (brouillon, non testé)

**À faire quand Jérôme le décide.** Il faut d'abord : (1) le résultat de `hermes --version` sur le VPS ; (2) un jeton **bibliothécaire**.

1. **Créer le jeton** (Mac, hors ligne) : `node outils/creer-jeton.js hermes-bibliothecaire bibliothecaire` ; ajouter la ligne JSON dans une nouvelle version du secret `MCP_JETONS` ; ranger le jeton dans le gestionnaire de mots de passe.
2. **Sur le VPS** : le jeton va dans le fichier d'environnement de Hermes (droits `600`), sous le nom `CHEVALIER_MCP_TOKEN`, **pas** dans le YAML.
3. **`~/.hermes/config.yaml`** (forme relevée dans la documentation de Hermes sur GitHub, version `main`, **non vérifiée sur la version installée**) :
   ```yaml
   mcp_servers:
     chevalier_ia_os:
       url: "https://chevalier-ia-os.web.app/mcp"
       headers:
         Authorization: "Bearer ${env:CHEVALIER_MCP_TOKEN}"
       timeout: 120
       tools:
         include: [qui_suis_je, chercher, lire_personne, lire_organisation, lire_affaire, lister_affaires, lister_projets, lire_projet, lister_modeles_projet, lister_activites, lister_documents, lire_reglages, lire_audit, creer_personne, modifier_personne, creer_organisation, modifier_organisation, creer_affaire, modifier_affaire, changer_etape, marquer_perdue, rouvrir_affaire, creer_projet, creer_projet_depuis_affaire, modifier_projet, changer_phase_projet, rouvrir_projet, archiver_projet, terminer_projet, ajouter_livrable_projet, terminer_livrable_projet, ajouter_facture, marquer_facture_payee, abandonner_facture, ajouter_note, modifier_note, creer_activite, terminer_activite, joindre_lien, retirer_document]
   ```
   Ces **43 outils** sont exactement ceux du profil bibliothécaire aujourd'hui. Les outils de sauvegarde (étape 5) et de pièces jointes (étape 7) s'ajouteront à la liste quand ils existeront. Même sans ce filtre, le serveur refuse tout outil hors profil.
4. **Essai** : depuis le VPS, un `curl` avec ce jeton (`qui_suis_je` doit répondre `hermes-bibliothecaire`, profil `bibliothecaire`) avant de brancher Hermes ; puis demander à Hermes de créer une fiche de test, vérifier dans `lire_audit` et dans le fil de l'écran (« hermes-bibliothecaire · via MCP »), vérifier qu'un `supprimer_affaire` est refusé, puis nettoyer.
5. **Points à confirmer à la première connexion** : la syntaxe de `${env:…}` dans cette version de Hermes, le préfixe des noms d'outils vus par l'agent, le comportement du délai de 120 secondes au démarrage à froid.

## 3. Claude sur le téléphone et sur claude.ai (connexion Google)

**Construit le 09/10/2026, essayé en réel le 10/10/2026 sur l'ordinateur (`qui_suis_je` répond bien `claude-ai-jerome-chevalier`) **et sur le téléphone (confirmé par Jérôme)** (voir `mcp-oauth.md` : fonctionnement, sécurité, mise en route). Ici, **aucun jeton à copier** : on se connecte avec le compte Google, comme dans l'appli. Les droits sont ceux de Claude Code (suppression comprise) ; la connexion dure 30 jours glissants.

**Avant** : la PR OAuth est fusionnée, les règles Firestore sont publiées (`mcp-oauth.md`, « Mise en route »).

1. Sur l'ordinateur, ouvre **https://claude.ai/settings/connectors** (Paramètres → Connecteurs).
2. Clique **« Ajouter un connecteur personnalisé »**.
3. Nom : `Chevalier IA OS`. Adresse du serveur : `https://chevalier-ia-os.web.app/mcp`. Ne remplis **aucun** champ « avancé » (identifiant ou secret OAuth) : Claude s'enregistre tout seul. Clique **Ajouter**.
4. Clique **Se connecter** (ou « Connect ») sur la ligne du connecteur : une page s'ouvre. Connecte-toi avec ton compte Google, vérifie que la page dit bien « Retour vers : claude.ai », puis **Autoriser**.
5. Sur le téléphone : ouvre l'appli Claude → Paramètres → Connecteurs. Le connecteur ajouté depuis ton compte doit apparaître **[à confirmer au premier essai]** ; s'il demande de se connecter, refais l'étape 4 sur le téléphone. Dans une conversation, active-le (bouton « + », puis Connecteurs).
6. Essai : demande à Claude « Appelle qui_suis_je sur Chevalier IA OS ». Réponse attendue : acteur **`claude-ai-jerome-chevalier`**, profil `claude-code`.

Si ça échoue : « Couldn't reach the MCP server » → regarder `https://chevalier-ia-os.web.app/.well-known/oauth-protected-resource/mcp` dans un navigateur (doit afficher du JSON) ; « Authorization failed » → regarder les journaux Cloud Run du service `mcp` (champ `code` : `oauth_…`, qui dit à quelle étape ça casse ; jamais de secret dans les journaux). Pour **couper** l'accès : `securite-et-pannes.md`, section 4, point 5.

Note : la documentation de Claude annonce aussi une saisie d'un jeton fixe dans un en-tête pour les connecteurs (bêta, organisations choisies, pas sur tous les forfaits). Non utilisée ici : la connexion Google est plus sûre (jeton d'une heure, révocable, lié à ton compte).
