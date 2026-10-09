# Connexion Google (OAuth) du serveur MCP : téléphone et claude.ai

Écrit le 09/10/2026. Décidé par Jérôme le même jour : le téléphone doit pouvoir se brancher sur le serveur MCP, avec **tous les droits** (comme Claude Code, suppression comprise), connexion de **30 jours glissants**.

## En deux phrases

Le serveur MCP avait une seule porte : un jeton secret `cia_…` dans l'en-tête de la requête (Claude Code sur le Mac, Hermes sur le VPS). L'appli Claude du téléphone ne sait pas envoyer ce jeton : elle sait seulement se connecter par OAuth, c'est-à-dire ouvrir une page « Se connecter avec Google ». Il y a donc maintenant **une deuxième porte**, réservée aux comptes Google autorisés, et **la première ne change pas**.

## Ce qui se passe quand tu ajoutes le connecteur

1. Claude (claude.ai ou le téléphone) appelle `https://chevalier-ia-os.web.app/mcp` sans jeton et reçoit un `401` qui lui dit où lire les règles de connexion (`/.well-known/oauth-protected-resource/mcp`).
2. Claude s'enregistre (`/oauth/register`). Le serveur ne retient rien : il vérifie seulement que l'adresse de retour est bien celle de Claude (`https://claude.ai/api/mcp/auth_callback` ou la même sur `claude.com`).
3. Claude ouvre `/oauth/authorize` dans un navigateur : **la même connexion Google que l'appli** (Firebase Auth), puis un écran « Autoriser Claude à accéder à Chevalier IA OS ? » qui dit clairement que les droits incluent la suppression.
4. Quand tu appuies sur **Autoriser**, la page envoie au serveur la preuve de ta connexion Google. Le serveur la **revérifie lui-même** (signature, adresse e-mail vérifiée par Google, compte dans la liste des deux comptes autorisés, la même que dans `firestore.rules`). Seulement alors, il rend un **code à usage unique valable 60 secondes**.
5. Claude échange ce code (avec une preuve PKCE, qui empêche de voler le code en chemin) contre un **jeton d'accès d'une heure** et un **jeton de renouvellement**. Il renouvelle tout seul : chaque renouvellement repousse l'échéance de 30 jours (« 30 jours glissants »). Après 30 jours sans aucun usage, il faut se reconnecter.
6. Le jeton d'accès entre sur `/mcp` avec le profil `claude-code`. Dans l'audit, l'acteur s'appelle **`claude-ai-jerome-chevalier`** (pour le compte `jeromebot…` : `claude-ai-jeromebot-chevalierbot`).

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

## Couper l'accès du téléphone

Les autorisations sont dans la collection Firestore **`mcp_oauth`** (fermée à l'appli par les règles : seul le serveur la lit). Pas de cache : l'effet est immédiat.

- **Couper une connexion** : console Firestore → `mcp_oauth` → document `connexion_…` → mettre `revoque` à `true` (ou supprimer le document). Le jeton d'accès et le jeton de renouvellement cessent de marcher.
- **Tout couper (tous les téléphones et claude.ai)** : même endroit, menu « ⋮ » de la collection `mcp_oauth` → « Supprimer la collection ». Hermes et Claude Code ne sont **pas** touchés (ils utilisent `MCP_JETONS`).
- **Fermer la porte OAuth entièrement** : retirer les quatre lignes OAuth de `firebase.json` (`/.well-known/...` et `/oauth/**`) dans une PR, ou revert de la PR OAuth. Les jetons `cia_…` continuent.
- **Tout couper, jetons compris** : voir `securite-et-pannes.md`, section 4 (désactiver la version de `MCP_JETONS`). Cela **ne coupe pas** la porte OAuth : il faut aussi supprimer la collection `mcp_oauth`.

## Mise en route (dans l'ordre, après le « fusionne » de Jérôme)

1. **Publier les règles Firestore** (elles ne se déploient pas avec la fusion) : copier le texte de `firestore.rules` dans la console, https://console.firebase.google.com/project/chevalier-ia-os/firestore/rules , puis « Publier ». Le seul ajout est le bloc `mcp_oauth` (tout refusé) et son nom dans l'exclusion du joker. **À faire avant l'essai** : sans lui, l'appli (comptes autorisés) pourrait lire ces documents (des empreintes seulement, inutilisables, mais autant fermer).
2. **Fusion** : le workflow déploie les fonctions puis Hosting. Contrôle : `curl -s https://chevalier-ia-os.web.app/.well-known/oauth-authorization-server` répond du JSON avec `"issuer":"https://chevalier-ia-os.web.app"`.
3. **Ajouter le connecteur** (voir `branchement-mcp.md`, section 3), se connecter avec Google, autoriser.
4. **Essai** : demander à Claude « qui_suis_je » : il doit répondre `claude-ai-jerome-chevalier`, profil `claude-code`.

## Ce qu'on n'a pas pu tester ici (à regarder au premier essai)

- La **vraie** connexion Google : le test navigateur remplace Google par une doublure (`tests/e2e/oauth.spec.js`). La page utilise le même SDK, la même version (12.19.0) et la même configuration que l'appli ; si la fenêtre Google ne s'ouvre pas sur le téléphone, le bouton passe en « redirection » comme l'appli.
- Le comportement exact de claude.ai et de l'appli du téléphone : la documentation de Claude décrit ce flux (enregistrement dynamique, PKCE, adresse de retour `https://claude.ai/api/mcp/auth_callback`), et le serveur la suit à la lettre, mais seul un essai réel le confirme.
- **Non fait volontairement** : adresses de retour locales (`http://localhost:…`) de Claude Code. Claude Code continue avec son jeton `cia_…`, qui marche déjà.

## Retour arrière

`git revert -m 1 <commit de fusion>` : le workflow redéploie sans OAuth, `/mcp` redevient `Bearer` seul. Supprimer ensuite la collection `mcp_oauth` à la main si on veut. Les règles Firestore peuvent rester (elles ne gênent rien).

## Où est le code

`functions/src/oauth/` : `config.js` (réglages et décisions), `magasin.js` (codes, jetons, révocation), `routeur.js` (routes), `page.js` (page de consentement), `identite-google.js` (vérification de la connexion Google). Branché dans `functions/src/mcp/gestionnaire.js` et `functions/src/index.js`. Tests : `tests/oauth.test.js` (40 tests) et `tests/e2e/oauth.spec.js` (navigateur, ordinateur et téléphone).
