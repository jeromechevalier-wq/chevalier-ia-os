# Le MCP pour les clients (module « Accès MCP »)

**Décidé par Jérôme le 16/10/2026** : l'accès MCP est la raison pour laquelle la première cliente s'intéresse au logiciel, et il est ouvert à **tous** les clients. Il sort de la réserve du 11/10/2026 (`mcp-multi-clients-en-reserve.md`, gardé pour l'historique et le plan de tests M1 à M15). Le MCP de Jérôme (base `chevalier-ia-os`) **ne change pas**.

## Ce que ça fait
- **Un lien par client** : `https://chevalier-ia-app.web.app/mcp/<client>`. Le client l'ajoute dans Claude (ou ChatGPT) comme connecteur personnalisé.
- **Connexion Google**, puis écran « Autoriser Claude (ou ChatGPT) à accéder à <nom du client> » **aux couleurs du client** (nom, logo, couleur de sa fiche `marques/<client>`).
- **Qui peut se connecter** : les membres de l'espace (`clients/<client>/membres/<e-mail>`). Le rôle donne le profil : **lecteur** = consultation seule ; **éditeur** = consultation et modification (profil `bibliothecaire`). **Jamais de suppression ni de restauration** pour un client.
- **Outils proposés** : ceux des modules **actifs** du client (CRM = `affaires` + `projets`), d'après `js/os/registre.js`. Un client sans le module Projets ne voit aucun outil de projet.
- **Module « mcp »** : interrupteur par client, comme `affaires`, `projets`, `veille`. Éteint (ou absent) : le lien ne répond plus, la connexion est refusée, un accès déjà accordé est coupé **à l'appel suivant**.
- **Noms d'acteur** : `claude-ai-<compte>` ou `chatgpt-<compte>` (selon l'adresse de retour), dans le Journal du CRM et l'audit.
- **Page d'information** dans le module (route `mcp/infos`, lecture seule, aucun réglage) : lien à copier, mode d'emploi en trois lignes, membres avec leur rôle, lien vers le Journal du CRM.

## Comment l'isolation est assurée (le serveur contourne les règles Firestore)
1. **Le client vient de l'adresse du lien**, jamais d'un paramètre. Il est écrit dans la connexion (code, jeton d'accès, jeton de renouvellement) et **revérifié à chaque lecture** : un jeton d'un autre client est refusé comme un jeton inconnu.
2. **Toutes les données passent par `avecBase(donnees, 'clients/<client>')`** (`functions/src/coeur/donnees.js`) : la base est fixée à la création, un nom de collection doit être un simple nom, un identifiant avec « / », « . » ou « .. » ne désigne rien. Les outils ne reçoivent aucun chemin.
3. **Les droits sont relus à chaque appel** : membre présent, rôle, client actif (fiche de marque `actif: true`), module « mcp » allumé. Retirer un membre ou éteindre le module agit tout de suite.
4. **Refus neutre** : client inconnu, désactivé, module éteint, compte d'un autre espace, adresse non vérifiée, connexion non Google : même statut, même corps, même page.
5. Les compteurs d'usage (`mcp_limites`, clé `<client>__<acteur>`) et les connexions (`mcp_oauth`) sont à la racine de la base de la plateforme, fermée par défaut aux navigateurs.
6. Un test refuse tout outil qui accepte un paramètre `client`, `clientId`, `projet`, `chemin`, `collection` ou `base`.

Tests : `tests/mcp-clients.test.js` (M1 à M15, rôles, modules, écran d'autorisation), `tests/mcp-module.test.js` (registre, page, réglages de la plateforme), `tests/e2e/mcp.spec.js` (page dans le navigateur), `tests/regles-plateforme.test.js` (P9, Q8).

## Où ça tourne
Le MCP des clients lit la base de la plateforme (projet `chevalier-ia-app`), pas celle de Jérôme. C'est **le même code** (`functions/src/mcp`, `coeur`, `oauth`, `securite`, plus `functions/src/clients/`), copié avant chaque déploiement dans `functions-plateforme/serveur/` (dossier ignoré par git) par `scripts/preparer-fonctions.js`. La fonction s'appelle `mcpclients` (Paris, 3 instances au plus, invocation publique comme celle de Jérôme). `firebase.plateforme.json` réécrit vers elle : `/mcp/**`, `/oauth/**`, `/.well-known/oauth-protected-resource/mcp/**`, `/.well-known/oauth-authorization-server/mcp/**`. **Chaque client a son propre « serveur d'autorisation »** (`…/mcp/<client>` sert d'émetteur) : le client est dans toutes les adresses OAuth.

## À déployer, dans l'ordre (par Jérôme, une fois la PR fusionnée)
Rien ne part tout seul sur la plateforme. 0. **Une seule fois, avant le choix `mcp`** : créer le compte d'exécution dédié (compte de service `mcp-clients`, seul rôle « Utilisateur Cloud Datastore ») :
   ```
   gcloud iam service-accounts create mcp-clients --project chevalier-ia-app --display-name "MCP clients (Firestore seulement)"
   gcloud projects add-iam-policy-binding chevalier-ia-app --member="serviceAccount:mcp-clients@chevalier-ia-app.iam.gserviceaccount.com" --role="roles/datastore.user"
   ```
   Le compte de déploiement `deploiement-github` peut agir en son nom grâce au rôle « Utilisateur du compte de service » (déjà accordé au niveau du projet).
Dans GitHub : <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml> > **Run workflow**, branche `main`, puis :
1. choisir **regles** : publie la règle qui permet à un membre de voir la liste des membres de son espace (page d'information) ;
2. choisir **mcp** : publie seulement `mcpclients` (aucun secret nécessaire). Le choix **fonctions** publie toute la série, journal compris, et exige la clé n8n (`N8N_API_KEY`) dans Secret Manager ;
3. choisir **hosting** : publie le site et les réécritures `/mcp/…` et `/oauth/…` (à faire **après** les fonctions : Hosting refuse une réécriture vers un service qui n'existe pas encore).
4. Allumer le module chez un client : `node scripts/nouveau-client.js activer-module <client> mcp --ecrire` (voir `nouveau-client.md`), puis ouvrir `https://chevalier-ia-app.web.app/mcp/<client>` n'affiche rien d'utile dans un navigateur : l'essai se fait en ajoutant le lien dans Claude.

## Non vérifié (à essayer avec un vrai compte avant de promettre quoi que ce soit au client)
- Le parcours complet avec **le vrai claude.ai** et **le vrai ChatGPT** n'a pas été essayé : les tests utilisent un client MCP du SDK officiel et un Google factice.
- **ChatGPT** : adresse de retour `https://chatgpt.com/connector/oauth/<identifiant>` (et l'ancienne adresse fixe), relevées dans la documentation d'OpenAI le 16/10/2026 ; ses exigences changent (enregistrement dynamique, `resource`, éventuellement un document d'identité de client). À relire avant la première connexion réelle.
- Les clients MCP doivent suivre l'émetteur « avec chemin » (`…/mcp/<client>`, RFC 8414 par insertion de chemin) : c'est la norme MCP, non essayée en réel.
- Le compte dédié `mcp-clients@chevalier-ia-app.iam.gserviceaccount.com` (seulement « Utilisateur Cloud Datastore ») est dans le code (`serviceAccount`). **Il doit exister avant le déploiement `mcp`** (voir l'étape 0 ci-dessus). Non vérifié en réel : après le déploiement, Cloud Run > service `mcpclients` > Sécurité doit afficher ce compte, et un essai Claude (`qui_suis_je`, puis une écriture) doit passer. Si une lecture échoue en `PERMISSION_DENIED`, le rôle manque.

## Choix faits (à confirmer ou changer)
- Éditeur = profil `bibliothecaire` (pas de suppression ni de restauration, pas de réglage de profil par membre).
- Module `reserveAuxClients` : absent du CRM de Jérôme (son MCP est un autre serveur).
- La liste des membres devient lisible par les autres membres du même espace (règle Firestore modifiée, écriture toujours interdite).
- Pas de page Réglages : la page est dans le module (les espaces clients n'ont pas encore de Réglages).
- Le propriétaire par défaut des fiches créées par un outil reste « Jérôme » (liste des tâches assignables à tirer des membres : chantier à part, voir la fiche de cadrage).
