# Connexion Google (OAuth) du serveur MCP : téléphone et claude.ai

> Vue d'ensemble (qui entre par quelle porte, avec quels droits) : [portes-et-droits-mcp.md](portes-et-droits-mcp.md).

Écrit le 09/10/2026. Décidé par Jérôme le même jour : le téléphone doit pouvoir se brancher sur le serveur MCP, avec **tous les droits** (comme Claude Code, suppression comprise), connexion de **30 jours glissants**.

## Depuis l'appli (18/10/2026)

Dans Chevalier IA OS, **menu utilisateur (clic sur ton nom, en bas à gauche) > Connecter mon assistant** : la page donne l'adresse du serveur (`<adresse de l'appli>/mcp`) et rappelle les trois gestes (coller le lien dans les connecteurs de Claude, se connecter avec Google, cliquer sur « Autoriser »). Elle ne contient ni jeton ni secret et ne lit rien dans la base.

## En deux phrases

Le serveur MCP avait une seule porte : un jeton secret `cia_…` dans l'en-tête de la requête (Claude Code sur le Mac, Hermes sur le VPS). L'appli Claude du téléphone ne sait pas envoyer ce jeton : elle sait seulement se connecter par OAuth, c'est-à-dire ouvrir une page « Se connecter avec Google ». Il y a donc maintenant **une deuxième porte**, réservée aux comptes Google autorisés, et **la première ne change pas**.

## Ce qui se passe quand tu ajoutes le connecteur

1. Claude (claude.ai ou le téléphone) appelle `https://chevalier-ia-os.web.app/mcp` sans jeton et reçoit un `401` qui lui dit où lire les règles de connexion (`/.well-known/oauth-protected-resource/mcp`).
2. Claude s'enregistre (`/oauth/register`). Le serveur ne retient rien : il vérifie seulement que l'adresse de retour est bien celle de Claude (`https://claude.ai/api/mcp/auth_callback` ou la même sur `claude.com`).
3. Claude ouvre `/oauth/authorize` dans un navigateur : **la même connexion Google que l'appli** (Firebase Auth), puis un écran « Autoriser Claude à accéder à Chevalier IA OS ? » qui dit clairement que les droits incluent la suppression.
4. Quand tu appuies sur **Autoriser**, la page envoie au serveur la preuve de ta connexion Google. Le serveur la **revérifie lui-même** (signature, adresse e-mail vérifiée par Google, compte dans la liste des deux comptes autorisés, la même que dans `firestore.rules`). Seulement alors, il rend un **code à usage unique valable 60 secondes**.
5. Claude échange ce code (avec une preuve PKCE, qui empêche de voler le code en chemin) contre un **jeton d'accès d'une heure** et un **jeton de renouvellement**. Il renouvelle tout seul : chaque renouvellement repousse l'échéance de 30 jours (« 30 jours glissants »). Après 30 jours sans aucun usage, il faut se reconnecter.
6. Le jeton d'accès entre sur `/mcp` avec le profil `claude-code`. Dans l'audit, l'acteur s'appelle **`claude-ai-jerome-chevalier`** (pour le compte `jeromebot…` : `claude-ai-jeromebot-chevalierbot`). Depuis ChatGPT (adresse de retour `https://chatgpt.com/connector/oauth/<identifiant>`, ajoutée le 20/10/2026), le préfixe est `chatgpt-` : `chatgpt-jerome-chevalier`. Le serveur le calcule lui-même d'après l'adresse de retour, le client ne peut pas le choisir ; ce nom a ses propres plafonds sur `/mcp`.

## Ce qui est protégé, et comment

| Risque | Protection | Testé |
|---|---|---|
| Un inconnu se connecte | Il faut un compte Google de la liste, adresse vérifiée, connexion « google.com ». Vérifié **côté serveur** : la page peut être falsifiée, le serveur ne la croit pas | oui |
| Un site pirate reçoit le code | L'adresse de retour doit être **exactement** celle de Claude. Une adresse inconnue donne une page d'erreur, jamais une redirection | oui |
| Code volé en chemin | PKCE (S256) obligatoire ; code de 60 s, usage unique ; un code rejoué **coupe la connexion qu'il a ouverte** | oui |
| Jeton de renouvellement volé | Chaque renouvellement consomme l'ancien. Un ancien jeton rejoué **coupe toute la connexion** | oui |
| Clic piégé (page cachée sous un autre site) | La page refuse d'être encadrée (`X-Frame-Options`, `frame-ancestors 'none'`) ; l'approbation exige l'origine de l'appli | oui |
| Fuite par les journaux ou la base | Jamais de jeton en clair : seules des **empreintes SHA-256** sont gardées ; les journaux ne contiennent ni code, ni jeton, ni adresse de retour | oui |
| Martelage | 60 requêtes POST par minute et par instance sur les routes OAuth ; plafonds par jeton sur `/mcp` comme avant (nom de jeton : `claude-ai-<compte>`) | oui |
| Panne de Firestore | `/mcp` répond **503** (jamais 401, pour que Claude ne croie pas son jeton mauvais) | oui |

## Couper l'accès du téléphone (pas à pas)

**Quand** : téléphone perdu ou volé, appareil prêté, doute sur une connexion, ou simplement envie de repartir de zéro. **Effet immédiat** : il n'y a aucun cache, la prochaine requête du téléphone est refusée.

**À savoir avant de commencer**
- **Retirer le connecteur dans Claude (claude.ai → Paramètres → Connecteurs) ne suffit pas** : ça n'efface que ce que Claude garde de son côté. Les autorisations restent valables côté serveur tant qu'on ne les coupe pas dans Firestore. **C'est la console Firestore qui coupe vraiment.**
- Les connexions de l'ordinateur et du téléphone **se ressemblent** : toutes deux sont au nom de ton compte Google et portent seulement une date de création (`creeLe`) et de dernier renouvellement (`renouvelleLe`). Impossible de lire « celle-ci est le téléphone ». Deux façons de s'y prendre : couper **toutes** les connexions (le plus simple et le plus sûr) puis reconnecter ce que tu veux ; ou couper une seule connexion en te fiant aux dates.
- Hermes et Claude Code ne sont **pas** touchés : ils ont leurs propres jetons (`securite-et-pannes.md`, section 4).

### A. Tout couper (recommandé : téléphone perdu, ou dans le doute)

1. Ouvre la collection : https://console.firebase.google.com/project/chevalier-ia-os/firestore/databases/-default-/data/~2Fmcp_oauth (si le lien ne va pas droit dessus : https://console.firebase.google.com/project/chevalier-ia-os/firestore/data → colonne de gauche, clique sur **`mcp_oauth`**).
2. En haut de la colonne `mcp_oauth`, clique sur les **trois petits points ⋮** à côté du nom de la collection.
3. Clique **« Supprimer la collection »**, puis confirme (la console demande de retaper le nom `mcp_oauth`, puis **Supprimer**).
4. C'est fait. Le téléphone et claude.ai sur ordinateur sont déconnectés à la requête suivante.

### B. Couper une seule connexion

1. Même page, collection `mcp_oauth`. Parmi les documents, **ceux dont le nom commence par `connexion_`** sont les connexions (les `acces_`, `refresh_` et `code_` sont les jetons : on n'y touche pas).
2. Clique sur un `connexion_…` : tu vois `email`, `creeLe` et, après un premier renouvellement, `renouvelleLe` (des nombres : millisecondes depuis 1970 ; un convertisseur comme https://www.epochconverter.com/ les traduit en date). La plus récente est en général celle que tu utilises le plus.
3. Pour la couper : soit **⋮ à côté du document → « Supprimer le document »**, soit modifier le champ **`revoque`** de `false` à `true` (clique sur la valeur, change-la, **Mettre à jour**).
4. Teste : l'appareil concerné doit être refusé ; si c'est le mauvais, il demandera simplement de se reconnecter.

### C. Après avoir coupé : reconnecter ce que tu veux garder

Dans Claude (ordinateur ou téléphone) : Paramètres → Connecteurs → **Chevalier IA OS** → **Se connecter** (ou « Reconnecter ») → connexion Google → **Autoriser**. Une nouvelle connexion est créée. Si le connecteur n'y est plus, le rajouter comme à la première fois (`branchement-mcp.md`, section 3).

### D. Vérifier que c'est bien coupé

- Dans la collection `mcp_oauth`, plus aucun `connexion_…` indésirable (ou `revoque: true`).
- Sur l'appareil coupé, demander « Appelle qui_suis_je » : il doit répondre par une erreur d'autorisation ou demander de se reconnecter.
- Dans la console Firestore → collection `crm_audit`, filtre `acteur` = `claude-ai-jerome-chevalier` : aucune ligne nouvelle après l'heure de la coupure venant de l'appareil perdu.

### E. Cas particuliers

- **Téléphone volé** : coupe tout (A), puis change le mot de passe de ton compte Google et déconnecte l'appareil sur https://myaccount.google.com/device-activity . Pense aussi à l'effacer à distance (Localiser).
- **Fermer complètement la porte OAuth** (plus aucune connexion Google, jetons `cia_…` intacts) : PR qui retire de `firebase.json` les quatre lignes `/.well-known/...` et `/oauth/**` (ou `git revert -m 1` de la fusion de la PR 49).
- **Tout couper, jetons Hermes et Claude Code compris** : `securite-et-pannes.md`, section 4, points 1 à 3, **et** supprimer la collection `mcp_oauth` (A ci-dessus). Désactiver `MCP_JETONS` ne coupe pas la connexion Google.

## Mise en route (dans l'ordre, après le « fusionne » de Jérôme)

1. **Publier les règles Firestore** (elles ne se déploient pas avec la fusion) : copier le texte de `firestore.rules` dans la console, https://console.firebase.google.com/project/chevalier-ia-os/firestore/rules , puis « Publier ». Le seul ajout est le bloc `mcp_oauth` (tout refusé) et son nom dans l'exclusion du joker. **À faire avant l'essai** : sans lui, l'appli (comptes autorisés) pourrait lire ces documents (des empreintes seulement, inutilisables, mais autant fermer).
2. **Fusion** : le workflow déploie les fonctions puis Hosting. Contrôle : `curl -s https://chevalier-ia-os.web.app/.well-known/oauth-authorization-server` répond du JSON avec `"issuer":"https://chevalier-ia-os.web.app"`.
3. **Ajouter le connecteur** (voir `branchement-mcp.md`, section 3), se connecter avec Google, autoriser.
4. **Essai** : demander à Claude « qui_suis_je » : il doit répondre `claude-ai-jerome-chevalier`, profil `claude-code`.

## Essai réel du 10/10/2026 : réussi

Après la fusion (PR 49) et la publication des règles Firestore, Jérôme a ajouté le connecteur sur claude.ai et s'est connecté avec Google : `qui_suis_je` répond `claude-ai-jerome-chevalier`, profil `claude-code`, serveur 0.2.0, 51 outils, depuis l'appli Claude sur le Mac, et le connecteur est apparu dans une session cloud de Claude Code. **Téléphone : confirmé par Jérôme le 10/10/2026** (le connecteur fonctionne depuis l'appli Claude de l'iPhone).

## Ce qu'on n'avait pas pu tester avant la fusion (la connexion réelle l'a confirmé pour l'ordinateur)

- La **vraie** connexion Google : le test navigateur remplace Google par une doublure (`tests/e2e/oauth.spec.js`). La page utilise le même SDK, la même version (12.19.0) et la même configuration que l'appli ; si la fenêtre Google ne s'ouvre pas sur le téléphone, le bouton passe en « redirection » comme l'appli.
- Le comportement exact de claude.ai et de l'appli du téléphone : la documentation de Claude décrit ce flux (enregistrement dynamique, PKCE, adresse de retour `https://claude.ai/api/mcp/auth_callback`), et le serveur la suit à la lettre, mais seul un essai réel le confirme.
- **Non fait volontairement** : adresses de retour locales (`http://localhost:…`) de Claude Code. Claude Code continue avec son jeton `cia_…`, qui marche déjà.

## Retour arrière

`git revert -m 1 <commit de fusion>` : le workflow redéploie sans OAuth, `/mcp` redevient `Bearer` seul. Supprimer ensuite la collection `mcp_oauth` à la main si on veut. Les règles Firestore peuvent rester (elles ne gênent rien).

## Où est le code

`functions/src/oauth/` : `config.js` (réglages et décisions), `magasin.js` (codes, jetons, révocation), `routeur.js` (routes), `page.js` (page de consentement), `identite-google.js` (vérification de la connexion Google). Branché dans `functions/src/mcp/gestionnaire.js` et `functions/src/index.js`. Tests : `tests/oauth.test.js` (40 tests) et `tests/e2e/oauth.spec.js` (navigateur, ordinateur et téléphone).
