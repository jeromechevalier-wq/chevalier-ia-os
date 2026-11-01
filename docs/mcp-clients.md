# Le MCP pour les clients (module « Accès MCP »)

> Vue d'ensemble (qui entre par quelle porte, avec quels droits) : [portes-et-droits-mcp.md](portes-et-droits-mcp.md).

**Décidé par Jérôme le 16/10/2026** : l'accès MCP est la raison pour laquelle la première cliente s'intéresse au logiciel, et il est ouvert à **tous** les clients. Il sort de la réserve du 11/10/2026 (`mcp-multi-clients-en-reserve.md`, gardé pour l'historique et le plan de tests M1 à M15). Le MCP de Jérôme (base `chevalier-ia-os`) **ne change pas**.

## Ce que ça fait
- **Un lien par client** : `https://chevalier-ia-app.web.app/mcp/<client>`. Le client l'ajoute dans Claude (ou ChatGPT) comme connecteur personnalisé.
- **Connexion Google**, puis écran « Autoriser Claude (ou ChatGPT) à accéder à <nom du client> » **aux couleurs du client** (nom, logo, couleur de sa fiche `marques/<client>`).
- **Qui peut se connecter** : les membres de l'espace (`clients/<client>/membres/<e-mail>`). Le rôle donne le profil : **lecteur** = consultation seule ; **éditeur** = consultation, modification, suppression et restauration (profil `claude-code`, décidé le 17/10/2026), comme dans son écran. Les suppressions sont journalisées et restaurables (`restaurer_depuis_audit`), plafond de **50 par jour** (compté par document supprimé), **double confirmation** (un premier appel donne l'aperçu de ce qui serait supprimé et un code à usage unique de 5 minutes, le second supprime ; voir [portes-et-droits-mcp.md](portes-et-droits-mcp.md)), et un client ne supprime que dans **son** espace.
- **Outils proposés** : ceux des modules **actifs** du client (Affaires, Projets, Devis, Automatisations), d'après `js/os/registre.js`. Un client sans le module Projets ne voit aucun outil de projet. Le module **Devis** apporte 18 outils (bordereau d'articles, recherche d'un article par une phrase, apprentissage du vocabulaire (`enregistrer_reponse_vocabulaire`, écriture), brouillons, finalisation, versions, statuts, envois, archivage, suppression) : un lecteur n'a que ceux de lecture (`lister_articles`, `chercher_article`, `lire_reglages_devis`, `lister_devis`, `lire_devis`, `rechercher_article_par_phrase`), un éditeur a les 18. Ce sont les mêmes outils que chez Jérôme (`functions/src/mcp/outils/`), aucun code n'est copié dans `mcpclients`. Tests : `tests/mcp-clients.test.js`, « Devis » (devis-1 à devis-8). Le prix de vente passe librement par l'assistant (décision du 28/10/2026) ; seule `lister_devis` cache prix d'achat et marge.
- **Module « mcp »** : interrupteur par client, comme `affaires`, `projets`, `veille`. Éteint (ou absent) : le lien ne répond plus, la connexion est refusée, un accès déjà accordé est coupé **à l'appel suivant**.
- **Noms d'acteur** : `claude-ai-<compte>` ou `chatgpt-<compte>` (selon l'adresse de retour), dans le Journal des modifications et l'audit.
- **Page d'information** dans le module (route `mcp/infos`, lecture seule, aucun réglage) : lien à copier, mode d'emploi en trois lignes, membres avec leur rôle, lien vers le Journal des modifications.

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
- Éditeur = profil `claude-code` (le nom vient du profil de Claude Code ; il est écrit en première ligne de `functions/src/mcp/outils/suppression.js`) (écriture, suppression et restauration ; pas de réglage de profil par membre). Décision de Jérôme du 17/10/2026.
- Le module « mcp » n'est plus réservé aux clients (18/10/2026, PR B) : chez Jérôme (racine) la page « Connecter mon ChatGPT » existe aussi. Elle ne lit **rien** dans Firestore : elle montre l'adresse `<origine de la page>/mcp` (jamais écrite en dur), le mode d'emploi de la connexion par compte Google en trois lignes (voir `mcp-oauth.md`), la phrase « Les comptes autorisés sont fixés par Jérôme » (chez Jérôme les comptes sont dans les règles, pas dans la base) et le lien vers le Journal des modifications. Le serveur MCP de Jérôme ne change pas.
- La liste des membres devient lisible par les autres membres du même espace (règle Firestore modifiée, écriture toujours interdite).
- La page s'ouvre depuis le **menu utilisateur** (« Connecter mon ChatGPT ») et depuis les Réglages ; elle n'est plus une entrée du menu principal (`horsMenu` dans `registre.js`).
- Propriétaire par défaut d'une fiche créée par un outil (19/10/2026, 2.16.1) : l'**e-mail de la personne connectée** (connexion Google, relu à chaque appel ; même résultat avec Claude et ChatGPT), jamais Jérôme chez un client. Un `proprietaire` fourni est écrit tel quel (aucune validation). Sur le serveur de Jérôme, une connexion Google donne l'e-mail du compte (Jérôme ou Charles) ; les jetons `cia_…` (claude-code, Hermes, scripts) gardent `PROPRIETAIRE_PAR_DEFAUT`. Chez un client sans e-mail (cas défensif) : propriétaire vide. L'e-mail n'est ni dans le journal du serveur (Cloud Logging) ni dans `qui_suis_je` ; il n'est **pas** caché dans le Journal des modifications, où la copie « après » d'une fiche créée montre son propriétaire aux membres de l'espace (comme le propriétaire affiché sur la fiche). Liste des tâches assignables à tirer des membres : chantier à part.

## Textes des outils et options (2.11.0)
- Les textes des outils ne citent plus rien de propre à Jérôme (étapes, phases, offres, adresse e-mail) : ils renvoient vers `lire_reglages` (`configuration.etapes`, `configuration.phases`, `configuration.options`). Un test verrou (D1a) fait échouer la suite si un de ces mots revient.
- Les outils `ajouter_facture`, `marquer_facture_payee`, `abandonner_facture` (option « Suivi des paiements ») ne sont **listés** que si l'option est allumée dans les réglages du client (`OUTILS_PAR_OPTION`, `functions/src/clients/gestionnaire.js`). Les réglages sont relus à chaque appel (trois documents de `crm_parametres` du client en plus), sans cache ; si la lecture échoue : 503 « indisponible ». Le serveur de Jérôme ne passe pas par là : sa liste d'outils ne change pas. Les refus dans la logique (« … est désactivé dans les réglages du CRM. ») restent la deuxième barrière.
- **18/10/2026 : l'outil `extraire_valeur_projet` et l'option « Extraction de valeur » sont supprimés.** `OUTILS_PAR_OPTION` ne contient plus que `suiviPaiements` ; un ancien réglage `extractionValeur` resté dans la base d'un client est ignoré (aucune erreur). Le MCP des clients doit être redéployé (workflow plateforme, choix « mcp ») pour que l'outil disparaisse ; en attendant, l'ancien outil existe encore mais ne marche plus que si l'option était allumée.
- Un client déjà connecté à claude.ai doit **republier** le MCP (workflow plateforme, choix « mcp ») pour voir le changement, puis rafraîchir la liste des outils.
- ~~Question ouverte : propriétaire = Jérôme chez un client~~ : réglé en 2.16.1 (voir plus haut). **Fiches déjà créées** : toute fiche créée par un outil chez un client sans `proprietaire` fourni avant 2.16.1 porte encore `proprietaire: jerome.chevalier@gmail.com` (repérable par `via: 'mcp'`). Aucune migration n'a été faite ; la fiche chez un client n'offre pas de choix du propriétaire (lecture seule). Correction possible : par Jérôme dans la console Firestore, ou chantier « choix du propriétaire parmi les membres ». La restauration depuis l'audit rejoue la copie « avant » entière : une fiche ancienne reprend son ancien propriétaire (voulu).

## Pour que ton client voie les outils Devis (28/10/2026)

Trois conditions, toutes les trois nécessaires :
1. **Le module Devis doit être ACTIF dans l'espace du client** (il demande le module Affaires, allumé avant). Sans lui, aucun outil de devis n'est proposé.
2. **Le MCP des clients doit être REDÉPLOYÉ** : sur GitHub, onglet Actions, workflow « Déploiement plateforme clients », choix `mcp`. C'est toi qui le lances ; Claude ne déploie jamais la plateforme clients. Tant que ce n'est pas fait, le serveur en ligne garde l'ancienne liste d'outils.
3. **Dans ChatGPT, appuyer sur « Actualiser les outils »** (bas de la page du connecteur) ; dans Claude, ouvrir une nouvelle conversation. Sinon l'assistant garde l'ancienne liste.

Un client qui a le rôle **lecteur** ne verra jamais les outils d'écriture (créer un brouillon, finaliser, supprimer) : il faut le rôle **éditeur**.

## Première connexion et outils manquants (2.11.6)

Chaque outil envoie maintenant ses annotations (lecture seule, destructif) et le serveur d'un espace client se présente sous le nom neutre `espace-client`. Chez le client : **Claude** = ouvrir une **nouvelle conversation** et régler les **permissions par outil** dans les réglages du connecteur ; **ChatGPT** = bouton **« Actualiser les outils »** en bas de la page du connecteur après chaque mise à jour. Détail : [portes-et-droits-mcp.md](portes-et-droits-mcp.md).
