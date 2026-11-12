# Audit de sécurité du 12/11/2026

Audit fait **par lecture du code et des configurations seulement** (aucune requête vers la production ni vers un service réel, aucun test d'intrusion, aucune modification du code, des règles ou de la configuration). Les corrections sont **proposées, pas faites**.

Méthode : cartographie des surfaces, recherche par domaine (règles et Hosting ; serveur MCP et OAuth ; fonctions appelables et dépôts de fichiers ; code du navigateur ; secrets, dépendances, workflows, sauvegardes), puis **vérification indépendante de chaque trouvaille par un relecteur Fable chargé de la réfuter**. Ne figurent dans le tableau que les trouvailles « confirmée » ou « partielle ».

## À lire en premier

**Aucun secret réel exposé** (clé privée, jeton, mot de passe, URL de webhook avec jeton) n'a été trouvé dans l'arbre courant du dépôt. Limite : le clone de l'audit ne contenait que 50 commits (du 06/11 au 12/11/2026) ; l'historique plus ancien n'a pas pu être rebalayé ici (`docs/securite-et-pannes.md` parle d'un balayage complet le 20/10).

**Donnée personnelle d'une cliente dans le dépôt public (S8, confirmée).** Une cliente, personne physique, est identifiée par son nom complet et son adresse e-mail personnelle, dans des tests et des docs (et donc dans `wiki/`). C'est contraire à la règle « dépôt public : aucune donnée de client ». Fichiers et lignes : adresse e-mail dans `tests/e2e/mon-espace.spec.js:375,378,381,382` et `tests/espace-reglages.test.js:291-292` ; nom complet dans `docs/mon-espace.md:3`, `docs/roadmap.md:71`, `wiki/mon-espace.html:18`, `wiki/roadmap.html:55`, `tests/google-drive.test.js:194,200,201,205`. Les valeurs ne sont volontairement pas recopiées ici. L'historique Git public les garde : réécrire l'historique est une décision de Jérôme.

## Résumé en 10 lignes (pour un non-développeur)

1. Le gros du travail est solide : chaque fonction du serveur vérifie qui appelle, un client ne peut pas lire les données d'un autre, les textes sont toujours posés comme texte (pas de faille d'injection trouvée), les jetons ne sont jamais stockés en clair.
2. Aucun secret n'est publié dans le dépôt (dans la partie de l'historique que nous avons pu lire).
3. **Le défaut le plus sérieux** : chez les clients, un éditeur peut modifier ou effacer le journal d'audit de son espace depuis son navigateur. Chez Jérôme, le journal est protégé (ajout seul). Il faut aligner les clients.
4. Une cliente est nommée avec son e-mail personnel dans le dépôt public : à anonymiser.
5. Les sites n'ont pas de protection contre l'affichage dans le cadre d'un autre site (clic piégé) ni de politique de contenu (CSP).
6. Les sauvegardes : seul Firestore est copié par Google, et la restauration n'a jamais été essayée. Les fichiers (PDF, pièces jointes) n'ont pas de sauvegarde décrite.
7. Le déploiement automatique utilise une clé de compte de service longue durée, et un des workflows n'a pas de limite de droits explicite.
8. Plusieurs fonctions tournent avec un compte Google par défaut aux droits probablement trop larges : à vérifier dans la console (je n'y ai pas accès).
9. Des paquets du serveur ont des failles connues, mais ce sont des attaques de « saturation », pas de vol de données.
10. Le reste (liens, plafonds de débit, messages d'erreur) est de la finition. Rien de critique n'a été trouvé.

## Tableau des trouvailles

Gravité = après vérification Fable (certaine quand la vérification a corrigé la gravité proposée par la recherche).

| Id | Gravité | Plateforme | Où | Risque (une phrase) | Correctif proposé (une phrase) | Vérification Fable |
|---|---|---|---|---|---|---|
| R1 | **Haute** | Clients | `firestore.plateforme.rules:182-185` (joker `clients/{client}/{collection}/{reste=**}`) ; aucun test dans `tests/regles-plateforme.test.js` | Un éditeur peut créer, modifier et supprimer `crm_audit` et `crm_audit_avant` de son espace ; il peut aussi forger une ligne que `restaurer_depuis_audit` (`functions/src/coeur/restaurer.js:44,108,122`) reprendrait, pour faire écrire le serveur dans les collections de `COLLECTIONS_ECRITES` (`functions/src/coeur/ecriture.js:19`) | Ajouter des règles dédiées en ajout seul (comme `firestore.rules:16-29`), exclure ces collections du joker, écrire le test | Confirmée (facteur aggravant `restaurer` noté par Fable, scénario non rejoué) |
| S8c | Moyenne | Dépôt public | voir l'alerte en tête (fichiers et lignes) | Nom complet et adresse e-mail personnelle d'une cliente publiés | Remplacer par des valeurs fictives (`@exemple.test`), régénérer `wiki/` ; décider si l'historique Git doit être réécrit | Confirmée |
| R3 / N2 | Moyenne à basse | Les deux | `firebase.json:43-69`, `firebase.plateforme.json` (`hosting.headers`) ; aucune balise `meta` CSP dans `index.html` ni `espace/index.html` | Ni `Content-Security-Policy`, ni `X-Frame-Options`, ni `frame-ancestors` : l'application peut être mise dans un cadre d'un site tiers (clic piégé) et rien ne freine un éventuel XSS | Ajouter d'abord `frame-ancestors 'none'` + `X-Frame-Options: DENY`, puis une CSP progressive (Picker Google : `docs.google.com`, `apis.google.com` ; 4 scripts inline dans `index.html:23-37`) | Confirmée (les pages OAuth du serveur ont déjà ces en-têtes : `functions/src/oauth/page.js:17-18`) |
| S1 | Moyenne | Les deux (pire chez les clients) | `docs/securite-et-pannes.md:46,47,104` ; `docs/roadmap.md:119` ; aucun export dans `.github/workflows`, `scripts/` | Seul Firestore est copié par Google (restauration jamais testée) ; Storage n'a aucune sauvegarde décrite ; copie hors Google « prévue » seulement ; l'état des sauvegardes du projet des clients est « pas vérifié » (`docs/preparer-fusion-369-documents.md:50,56`) | Versioning ou suppression réversible du bucket, export planifié hors Google incluant le projet des clients, un essai de restauration | Confirmée |
| S2 | Moyenne | Les deux | `.github/workflows/firebase-hosting.yml:35-54`, `publier-regles.yml:36-47`, `deploiement-plateforme.yml:49-75` | Clé JSON de compte de service longue durée en secret GitHub, passée à une action tierce sur étiquette mobile ; rôle « Utilisateur du compte de service » au niveau du projet (`docs/securite-et-pannes.md:49`) | Identité fédérée (Workload Identity) ou rotation régulière de la clé ; restreindre le rôle | Confirmée (bon point : secret au niveau de l'étape, fichier effacé par `trap`) |
| F1 | Moyenne (dépend de l'IAM) | Les deux | `functions-plateforme/src/index.js:44,50,58,87` (`OPTIONS_DEVIS` : une douzaine de fonctions) ; `functions/src/index.js:210,222,260,271` | Fonctions sans compte de service dédié : elles tournent avec le compte Compute par défaut, que la doc dit « Éditeur » sur tout le projet (`docs/securite-et-pannes.md:49,219`) | Un compte dédié aux droits minimaux par famille de fonctions | Confirmée ; rôles IAM réels non vérifiables |
| F2 | Moyenne à basse | Les deux | `functions-plateforme/src/index.js:139,177-182` ; `functions/src/index.js:63-72,80-88,126` | Un même compte (Administrateur des objets Storage) sert la « porte » publique protégée par clé et les fonctions de PDF et de documents ; deux docs se contredisent sur la condition (`docs/preparer-fusion-369-documents.md:33`, `docs/securite-et-pannes.md:287`) | Un compte séparé pour `porte` et `tableaudebord` (Firestore seulement) ; corriger le commentaire périmé `functions/src/index.js:69` | Confirmée |
| M1 | Basse à moyenne | Les deux | `functions/src/oauth/config.js:20,28-32` ; `functions/src/clients/config.js:36-41` ; `functions/src/oauth/page.js:93` | Le motif d'adresse de retour ChatGPT accepte n'importe quel connecteur (`client_id` non stocké) ; un tiers peut hameçonner une personne autorisée pour qu'elle clique « Autoriser » sur une page authentique | Afficher l'identifiant du connecteur sur l'écran de consentement (la doc `docs/portes-et-droits-mcp.md:55-56` le promet, le code ne le fait pas) ou épingler une liste de connecteurs | Partielle : une personne non autorisée n'obtient jamais de jeton, clic volontaire requis, code lié à l'adresse de retour et au PKCE ; la réussite dépend aussi de la liaison `state` chez OpenAI/Anthropic (non vérifiée) |
| M2 | Basse à moyenne (disponibilité) | Les deux | `functions/src/oauth/routeur.js:63-72,180-184` ; `functions/src/clients/routeur-oauth.js:35,180-182` ; `functions-plateforme/src/mcp-clients.js:27` | Un seul plafond de 60 requêtes/minute/instance pour `register`, `approve` et `token`, tous appelants confondus : un anonyme peut empêcher les renouvellements des assistants (de tous les espaces chez les clients) | Plafond par adresse IP ou par client, plafond séparé pour `register` | Confirmée (rien n'est perdu ni révoqué, la gêne dure le temps de l'attaque) |
| S3 | Basse à moyenne | Jérôme | `.github/workflows/firebase-hosting.yml:1-75` | Aucun bloc `permissions:` ; le jeton GitHub prend le réglage par défaut du dépôt et reste dans `.git/config` pendant `npm ci` et l'action tierce | Ajouter `permissions: contents: read` et `persist-credentials: false` ; retirer `repoToken` (l.53) s'il est inutile sur `push` | Confirmée (déclencheur `push` sur `main` seulement) |
| S4 | Basse (moyenne pour une ligne) | Jérôme | `firebase-hosting.yml:51` ; autres actions `@v4` | Actions sur étiquettes mobiles ; `FirebaseExtended/action-hosting-deploy@v0` reçoit la clé de déploiement | Épingler par SHA complet, au moins cette action | Confirmée |
| S5 | Basse | Les deux | `functions/package.json:17`, `functions-plateforme/package.json:18` (zod 4.6.5), body-parser 2.3.0, puppeteer-core 25.11.0 | `npm audit --omit=dev` : 15 (functions) et 13 (functions-plateforme) avis dont 4 « hauts », 0 critique ; en réalité 2 avis distincts (zod, body-parser), tous deux de saturation (déni de service) ; zod atteignable seulement après authentification MCP ; body-parser probablement pas sur le chemin des requêtes | zod 4.6.6, puppeteer-core 25.17.0 et `npm audit fix` dans les deux dossiers | Confirmée (correctifs sans montée majeure) |
| R2 | Basse | Clients | `firestore.plateforme.rules:182-185` ; `functions/src/securite/codes.js:6,16,34-47` | `mcp_codes` d'un espace est écrivable par un éditeur (la clé est `sha256(<client>__<acteur>\|outil\|cible)`, nom prévisible) : contournement de la durée de 5 minutes et de l'usage unique, par quelqu'un qui peut déjà supprimer | Fermer `mcp_codes` en écriture et l'exclure du joker (à faire avec R1) | Partielle : faux pour `mcp_limites` (les plafonds sont lus sur la base brute, donc aucune remise à zéro possible) |
| N1 | Basse | Les deux | `js/modules/crm/fiche-personne.js:119-120`, `fiche-organisation.js:56`, `composants.js:252` ; écriture sans filtre : `functions/src/coeur/metier.js:163,211`, `functions/src/mcp/outils/ecriture.js:109,119` | Le « Site web » et le « LinkedIn » d'une fiche ne sont filtrés nulle part : une valeur `javascript:` s'affiche en lien (un autre protocole que `http(s)` aussi) | N'accepter que `http:` et `https:` à l'affichage et à l'écriture (helpers existants `normaliserLienWeb`, `lienSur`) ; relecture Fable obligatoire (liens) | Partielle : avec `target=_blank` + `rel=noopener`, l'exécution dans un navigateur moderne est peu probable (raisonnement sur la norme, non testé) ; la protection est accidentelle ; risque entre membres d'un même espace |
| N3 | Basse | Les deux | `js/modules/crm/personnes.js:51`, `fiche-personne.js:103`, `logique.js:798-805,1124-1126` | Un e-mail enregistré avec `?subject=…&body=…` (ou `%40`) pré-remplit un brouillon dans le client de messagerie (pas de script) | Utiliser le helper sûr `L.lienEmail` (déjà en `composants.js:704`) | Confirmée |
| F3 | Basse | Les deux | tous les `onCall` des deux `index.js` | Pas d'App Check : un jeton Firebase valide suffit à appeler les fonctions depuis un script | `enforceAppCheck` au moins sur `devisPdf` et `documentDeposer` | Confirmée (appelant déjà authentifié et membre) |
| F4 | Basse | Les deux | `functions-plateforme/src/devis-pdf.js:65-93`, `functions/src/devis/pdf-appel.js:41-70` | Pas de limite par utilisateur sur le PDF brouillon (coût Chromium), borné à 2 instances | Plafond par minute et par compte (limiteur existant `securite/limites.js`) | Confirmée |
| F5 | Basse | Clients | `scripts/porte/porte.js:109-119`, `porte-tableau.js:40` (lignes corrigées par Fable) | Des clés inventées au bon format coûtent une lecture Firestore chacune avant le limiteur | Frein par adresse IP en amont | Confirmée (clé mal formée déjà rejetée avant lecture) |
| F6 | Très basse | Clients | `functions-plateforme/src/devis.js:76-85`, `deploiement.js:23-24`, `appels.js:93,121`, `espace.js:95-103` | Le refus du client nommé `interne` existe dans certaines fonctions (`devis.js:32`, `documents.js:24`, `propositions.js:29`, `devis-pdf.js:146`) et pas dans d'autres ; l'outil de création ne le réserve pas (`scripts/plateforme/nouveau-client.js:17`) | Un garde commun, et réserver `interne` à la création | Partielle : pas d'exploit montré, incohérence seulement |
| M3 | Basse | Les deux | `functions/src/mcp/gestionnaire.js:92-101`, `functions/src/oauth/magasin.js:150-151` | Un jeton de bonne forme mais inconnu coûte une lecture Firestore sans limiteur avant | Limiteur par IP ou cache négatif | Confirmée |
| M4 | Basse | Clients (chez Jérôme théorique) | `functions/src/oauth/magasin.js:35-38`, `functions/src/clients/config.js:50-53` | Deux adresses de même partie locale donnent le même nom d'acteur : plafonds, codes de confirmation et journal partagés | Ajouter un court hachage de l'adresse complète au nom d'acteur | Confirmée (pas d'élévation de droits) |
| M5 | Basse | Les deux | `functions/src/oauth/magasin.js:131` | Le renouvellement n'exige pas le `client_id` (rotation et détection de rejeu sont bien présentes) | Exiger `client_id` (écart de conformité OAuth 2.1) | Confirmée |
| M6 | Très basse | Clients | `functions/src/clients/routeur-oauth.js:121-127` | La page `authorize` distingue un client actif d'un inconnu, et dit que le module MCP est actif | Accepter (nom et logo déjà publics via `firestore.plateforme.rules:23-30`) | Partielle |
| M7 | Basse | Les deux | `functions/src/mcp/gestionnaire.js:198-203` | Les erreurs inconnues sont relancées telles quelles à l'assistant (par exemple un lien de console Firestore avec l'identifiant du projet, déjà public) | Journaliser le détail et renvoyer un message générique | Partielle : comportement du SDK non vérifié (`node_modules` absent) |
| M8 | Basse | Les deux | `functions/src/oauth/identite-google.js:9`, `functions-plateforme/src/mcp-clients.js:23` | `verifyIdToken` sans `checkRevoked` (jeton d'identité d'une heure, utilisé une fois) | `checkRevoked: true` (facultatif) | Confirmée |
| M9 | Très basse | Clients | `functions/src/clients/routeur-oauth.js:147` contre `gestionnaire.js:59` | `interne` refusé sur `/mcp/<client>` mais pas sur les routes OAuth ; impact nul aujourd'hui | Même refus dans le routeur OAuth | Confirmée |
| F7 | Information | Jérôme | `functions/src/veille/appel.js:6` | Le compte « bot » passe aussi les fonctions destructrices de l'écran ; c'est voulu et documenté (`docs/securite-et-pannes.md:229,232`) | Vérifier en console que ce compte a la double authentification | Confirmée comme fait, pas une faille |
| S8a | Information | Dépôt public | `firestore.rules:9-10`, `functions/src/oauth/config.js:14`, `functions/src/securite/super-admins.js:5` et une centaine d'autres fichiers | Les adresses de Jérôme et du compte bot sont publiques (comptes à hameçonner) ; nécessaire au fonctionnement | Aucune action ; double authentification sur les deux comptes | Confirmée |
| S8b | Basse | Dépôt public | `.github/A-FAIRE.md:19,37,39,47`, `docs/reprise-prochaine-session.md:68` (et sa copie dans `wiki/`) | Le nom d'une entreprise cliente, son identifiant d'espace et l'état de son projet (bot, workflow n8n) sont publics ; aucune donnée de son fichier client | Remplacer par « client pilote » | Confirmée |

## Réfuté ou nuancé à la baisse par Fable

- **S6 (PR de forks sur un dépôt public) : réfutée.** `tests.yml` n'utilise que `pull_request`, aucun `secret`, pas de `pull_request_target`/`workflow_run`/`issue_comment`, pas d'injection `${{ github.event.* }}` dans un `run:`.
- **M10 (SSRF dans la veille) : réfutée.** `js/modules/veille/lien.js:7-54` ne laisse passer que six hôtes YouTube et reconstruit l'adresse ; le contenu brut n'est jamais renvoyé. Résiduel : `redirect: 'follow'` (`veille/service.js:30`), troncature après lecture complète.
- **R2, partie `mcp_limites` : réfutée.** Les plafonds des clients sont tenus sur la base brute, hors de portée d'un éditeur.
- **N1, exécution du `javascript:` :** probablement non exécutée par les navigateurs modernes à cause de `noopener` (non testé).
- **F8** (saisie libre d'un e-mail de membre dans `functions-plateforme/src/espace.js:23,265-300`) : rapportée comme rappel par la recherche, sans défaut : voulu, validé, non exploitable.
- **S7** (clés web Firebase `AIza…` dans le code) : publiques par conception, restreintes aux sites selon `docs/securite-et-pannes.md:216` ; la restriction réelle n'a pas pu être vue dans la console.

## Trouvailles non vérifiées par Fable (à prendre avec prudence)

Rapportées par la recherche sur les règles et le Hosting, de gravité basse, **sans passage par un relecteur** :

- **R4** : `firebase.json:25-49`, le Hosting de Jérôme sert la racine du dépôt (`"public": "."`) avec une liste noire ; tout nouveau dossier à la racine devient public sans y penser. Correctif : servir un dossier `dist/` comme la plateforme.
- **R5** : `firestore.rules:16-22`, les lignes d'audit créées avec `via=='ecran'` n'ont pas de contrôle de forme (pas de modification ni de suppression possible).
- **R6** : `firestore.rules:5-12,179-182`, le second compte autorisé (le « bot ») a l'accès complet au joker ; voir F7.
- **R7** : `firestore.plateforme.rules:182-185`, le joker est une liste noire : toute nouvelle collection serveur sous `clients/<client>/` devient écrivable par un éditeur tant qu'on oublie de l'exclure (R1 et R2 en sont la preuve). Correctif : liste blanche des collections écrivables.

## Ce qui est bien fait

- **Isolement entre clients** : chaque chemin passe par `roleDe(client)` lu dans `clients/<client>/membres/<e-mail>` ; `connecte()` exige un e-mail vérifié ; les fiches de membres, de client et de marque ne sont pas écrivables depuis un navigateur ; fermeture par défaut en fin de fichier (`firestore.plateforme.rules:188-190`, `storage.plateforme.rules:13-15`). Storage : aucune écriture navigateur.
- **Fonctions** : toutes exigent une authentification ; le client reçu est toujours vérifié par la fiche de membre ; les chemins Firestore et Storage sont nettoyés (`[A-Za-z0-9_-]`) et les URL signées ne sont émises que pour le chemin de l'espace (5 minutes).
- **PDF (Chromium)** : JavaScript désactivé, toute requête non `data:` annulée (`functions/src/devis/chromium.js:60-71`), logo limité et vérifié par ses octets.
- **Dépôt de fichiers** : liste blanche d'extensions, contrôle de la signature, nom nettoyé, UUID dans le chemin, 20 Mo, quota 2 Go par espace, suppression en corbeille logique.
- **Jetons** : seule l'empreinte SHA-256 est stockée, comparaison à temps constant (`functions/src/securite/jetons.js:80-89`), format contrôlé avant tout, refus uniforme.
- **OAuth** : PKCE S256 obligatoire, adresse de retour comparée strictement, code à usage unique de 60 secondes, jetons d'accès d'une heure avec rotation et détection de rejeu, compte revérifié à chaque appel (retirer un membre coupe l'accès), page de consentement non encadrable.
- **Profils et identité de Jérôme** : outils hors profil non enregistrés ; `modifier_reglages_devis` verrouillé à l'enregistrement et à l'exécution (`functions/src/coeur/metier.js:760`).
- **Sorties réseau** : n8n par hôte fixe, chemin `/webhook/…`, sans redirection, corps fixe ; `joindre_lien` exige `http(s)`.
- **Porte n8n** : POST seulement, refus de tout `Origin`, client déduit de la clé, intégrité du workflow, refus uniforme.
- **Navigateur** : `h()` pose le texte par nœuds DOM ; les 4 `innerHTML` du code sont des icônes SVG statiques ; 0 `eval`, `new Function`, `document.write`, `insertAdjacentHTML`, `postMessage` ; tous les liens `target=_blank` ont `rel="noopener noreferrer"` ; iframes sandboxées ; routage `/espace/<id>` borné à `[A-Za-z0-9_-]{1,40}`.
- **Workflows** : `permissions: contents: read` partout sauf un, déploiements en `workflow_dispatch` ou `push` sur `main` seulement, `firebase-tools` figé, clé écrite en `umask 077` et effacée.
- **Journaux** : listes blanches de champs, aucun jeton ni contenu. CORS désactivé sur les fonctions. Tests statiques qui interdisent clés privées et jetons dans le dépôt.
- **Dépendances** : `tests/` à 0 avis. Aucune vulnérabilité critique.

## Ce qui n'a pas été couvert

- **Console Google et GitHub** (aucun accès) : rôles IAM réels des comptes de service (F1, F2), restriction réelle des clés web, existence réelle des sauvegardes et du bucket, secrets `MCP_JETONS` / `MCP_JETONS_CLIENTS` (profils et porteurs), réglages GitHub (protection de branche, approbation des PR de forks, permissions par défaut du jeton).
- **Historique Git avant le 06/11/2026** (clone peu profond), captures et fichiers binaires.
- **Règles publiées en production** : non comparées aux fichiers du dépôt. En-têtes réellement servis (HSTS automatique de Firebase) : non vérifiés par `curl`, interdit par le périmètre.
- **Émulateur Firebase et tests de règles** : non lancés (lecture des règles et des tests seulement).
- **Aucun test dynamique** : tout est établi par lecture du code (R1, N1 et M1 sont des scénarios non rejoués).
- **Non lus en détail** : les ~84 outils MCP individuellement (validation zod fine), `lecture.js`, `devis.js` et `devis-annulation.js` du serveur (parcours partiel), `reseauxsociaux/service.js` et `mesures.js`, `outils/` (lecture rapide), comportement du SDK MCP installé (M7).
- **Version déployée** non comparée au dépôt.

## Ordre de correction conseillé

1. **R1 (+ R2, R7)** : règles dédiées pour `crm_audit`, `crm_audit_avant`, `mcp_codes` côté clients, et le test qui manque. Touche les règles : Fable obligatoire, PR avec l'étiquette `a-fusionner-par-jerome`, publication par « Déploiement plateforme clients » > regles sur demande de Jérôme.
2. **S8c, S8b** : anonymiser la cliente et le client (tests, docs), régénérer `wiki/`. Décision de Jérôme : réécrire ou non l'historique Git.
3. **S3 et S4** : `permissions: contents: read` et `persist-credentials: false` dans `firebase-hosting.yml`, épingler l'action qui reçoit la clé (petite PR).
4. **R3/N2** : en-têtes `frame-ancestors` et `X-Frame-Options` d'abord (peu risqué), CSP ensuite.
5. **S5** : mise à jour de zod, puppeteer-core et `npm audit fix` dans les deux dossiers (serveur : Fable).
6. **N1 et N3** : liens `http(s)` seulement, helper `lienEmail` (liens : Fable obligatoire).
7. **S1** : versioning ou suppression réversible de Storage, export hors Google (projet des clients compris), un essai de restauration.
8. **F1 et F2** : relire les rôles IAM en console ; comptes de service dédiés (par étapes, avec test après chaque).
9. **S2** : identité fédérée ou rotation de la clé de déploiement.
10. **M1 et M2** : identifiant du connecteur sur l'écran de consentement, plafond OAuth par IP/client.
11. **Le reste** (F3 à F6, M3 à M9, R4 à R6) : finitions, à grouper dans une ou deux PR.
12. **Aussi en console** : double authentification sur les deux comptes autorisés (S8a, F7, R6) ; réglage GitHub « approbation pour les contributeurs externes » (S6).

Aucune de ces corrections n'a été faite dans cette PR.
