# Sécurité et pannes du serveur MCP

Ce guide dit **comment la connexion est protégée**, **ce qui peut la casser** et **quoi faire quand elle casse**. Il est mis à jour à chaque étape du chantier (`plan-mcp.md`). Version du 02/10/2026, écrite à l'étape 2 : chaque point est marqué **[en place]** (déjà dans le code ou la console), **[prévu]** (planifié dans une étape précise) ou **[à vérifier]** (je ne l'ai pas pu confirmer depuis ma session).

Règle d'or : **l'appli Chevalier IA OS ne dépend pas du serveur MCP.** Si la connexion MCP tombe, l'écran continue de fonctionner exactement comme avant. Le MCP n'est qu'une porte supplémentaire vers la même base.

## 1. Qui parle à qui

```
Claude Code (Mac) ──┐                         ┌─ Secret Manager : MCP_JETONS (empreintes des jetons)
Hermes (VPS) ───────┼─► https://chevalier-ia-os.web.app/mcp
                    │        │ réécriture Hosting
                    │        ▼
                    │   Cloud Run (service « mcp », Paris) = la fonction  ──► Firestore (base du CRM)   [étape 3 et suivantes]
                    │                                                    └─► Drive (pièces jointes, sauvegardes) [étapes 5 et 7]
Toi, dans l'appli ──────► Firebase Hosting + Firestore (comme avant, sans passer par le MCP)
GitHub (fusion sur main) ──► déploie d'abord la fonction, puis le site
```

À l'étape 2 : la fonction ne fait que répondre à `qui_suis_je`. Elle ne lit ni n'écrit encore la base.

## 2. Les couches de protection

| Couche | Ce qu'elle fait | État |
|---|---|---|
| Jeton par client | Une longue clé secrète (`cia_…`, 256 bits) par client ; chaque client a un nom (acteur) et un profil (lecteur, bibliothécaire, Claude Code) | **[en place]** |
| Empreintes seulement | Le coffre Google ne contient que le résumé irréversible (SHA-256) des jetons, jamais les jetons | **[en place]** |
| Comparaison à temps constant | Impossible de deviner un jeton en mesurant les temps de réponse | **[en place]** |
| Réponse unique au refus | Jeton absent, faux, mal formé ou révoqué : exactement la même réponse 401, sans détail | **[en place]** |
| Échec fermé | Si le coffre est illisible : 503, jamais d'accès accordé, jamais de copie périmée | **[en place]** |
| Droits par profil | Le serveur n'expose et n'exécute que les outils du profil du jeton, même si le client est mal configuré | **[en place]** (un seul outil pour l'instant) |
| Origine et méthode | En-tête `Origin` étranger refusé (403) ; tout sauf `POST` refusé (405) | **[en place]** |
| Journaux sans secret | On ne note que : nom du jeton, acteur, profil, outil, durée, statut, code ; jamais jeton, en-tête, paramètres, contenus de fiches | **[en place]**, testé |
| 3 instances au plus | Borne le coût et l'emballement | **[en place]** |
| Budget 5 €/mois avec alertes 50, 90 et 100 % | Prévient, **ne coupe rien** | **[en place]** (console) |
| Plafonds par jeton (débit, écritures, suppressions) | Freine un agent qui boucle ou un jeton volé | **[prévu]** étape 4 |
| Journal d'audit et restauration | Chaque écriture tracée, copie « avant » gardée 90 jours | **[prévu]** étape 4 |
| Sauvegardes (copies Google quotidiennes, récupération à la minute, export JSON hebdomadaire) | Retour en arrière si des données sont abîmées | **[prévu]** étape 5 |

## 3. Où sont les secrets

| Secret | Où il vit | Qui peut le lire | Comment le révoquer |
|---|---|---|---|
| Jeton d'un client (`cia_…`) | Ton gestionnaire de mots de passe, puis la configuration du client (variable d'environnement sur le Mac ou le VPS, fichier à droits 600) | Toi et le client | Passer `"actif": true` à `false` dans une **nouvelle version** du secret `MCP_JETONS` (effet en moins d'une minute) |
| Empreintes des jetons | Secret Google `MCP_JETONS` | Le compte d'exécution de la fonction (`chevalier-ia-os@appspot.gserviceaccount.com`, **[à vérifier]** au premier déploiement) et les propriétaires du projet | Désactiver la version du secret : tout est refusé |
| Clé du compte de déploiement | Secret GitHub `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS` | GitHub Actions (jamais affichée dans les journaux) | Console Google : IAM → Comptes de service → clés, supprimer la clé ; en créer une nouvelle et remplacer le secret GitHub |
| Autorisation Drive (jeton de rafraîchissement) | **[prévu]** étape 5 : secret `DRIVE_OAUTH` | La fonction | https://myaccount.google.com/permissions : retirer l'accès à « Chevalier IA OS - Drive serveur » |

Ne jamais mettre un jeton ou une clé : dans le dépôt, dans un dossier synchronisé avec Drive, dans une conversation, dans un message de commit. Un contrôle automatique (`tests/statique.test.js`) refuse un jeton `cia_…`, une clé privée ou un secret OAuth dans le dépôt.

## 4. Interrupteurs d'urgence, du plus rapide au plus lent

1. **Couper tout le MCP en moins d'une minute, sans rien déployer** : console Google → Secret Manager → `MCP_JETONS` → désactiver la version active. Toute requête est alors refusée. Pour rétablir : réactiver la version. https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os
2. **Couper un seul client** : nouvelle version du secret avec `"actif": false` sur sa ligne.
3. **Retirer l'accès public du service** : console Google → Cloud Run → service `mcp` → Sécurité → retirer l'invocation publique. https://console.cloud.google.com/run?project=chevalier-ia-os
4. **Retirer le code** : `git revert -m 1 <commit de fusion>` sur `main` (le workflow redéploie), puis supprimer le service `mcp` dans Cloud Run (le déploiement ne supprime pas seul une fonction retirée du code).

## 5. Pourquoi il n'y a pas de « porte dérobée » dans le code

Idée évoquée le 02/10/2026 : prévoir un accès caché, éteint, qu'on activerait en changeant une ligne et en redéployant. **Décision : non**, pour deux raisons.
- C'est une porte qui existe en permanence dans le code. Qui obtient un accès en écriture au dépôt (jeton GitHub volé, compte piraté) l'ouvre en changeant une ligne, sans avoir besoin d'un jeton MCP.
- Elle ne répond pas aux pannes redoutées. Elle demande un déploiement : si la panne vient du déploiement (Google), elle est inutilisable ; si elle vient du client (Hermes, Claude Code), le serveur n'y est pour rien.

**À la place, des accès de secours qui ne contournent rien** (ils passent par ton identité Google, pas par le serveur) :
- **L'appli** : indépendante du MCP **[en place]**.
- **La console Firebase / Google Cloud** : tu peux lire et corriger des documents à la main (Firestore → Données) **[en place]**.
- **Un script de secours sur ton Mac** qui lit et écrit dans la base avec **ton compte Google** (connexion `gcloud auth application-default login`), sans clé à conserver et sans code de plus sur le serveur **[prévu]**. Il sera écrit et testé avant la clôture du chantier.
- **Les sauvegardes** : copies Google quotidiennes, récupération à la minute, export JSON **[prévu]** étape 5.

## 6. Pannes : symptôme, cause probable, vérification, réparation

### Déploiement (GitHub Actions)

Page de suivi : https://github.com/jeromechevalier-wq/chevalier-ia-os/actions. Un déploiement qui échoue **ne casse pas le site** : le site n'est redéployé qu'après les fonctions, il reste tel qu'il était.

| Symptôme dans le journal | Cause | Réparation |
|---|---|---|
| `Missing permissions … iam.serviceAccounts.ActAs on service account chevalier-ia-os@appspot.gserviceaccount.com` | Le compte de déploiement n'a pas le rôle « Utilisateur du compte de service » | Console IAM : https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-os , crayon sur le compte de déploiement, ajouter le rôle. La ligne « Compte de déploiement : … » du journal donne l'adresse exacte du compte à modifier. Attendre 1 à 2 minutes, puis **Re-run failed jobs**. *(Rencontré le 02/10/2026.)* |
| `Permission denied`, `403`, `API … has not been used` | Rôle manquant ou API non activée | Le message nomme le rôle ou l'API : l'ajouter (un à la fois), puis relancer |
| `billing account` / `Blaze` / `requires billing` | Le projet n'est pas relié à un compte de facturation | https://console.cloud.google.com/billing/linkedaccount?project=chevalier-ia-os *(rencontré le 02/10/2026 : le projet n'avait aucun compte associé)* |
| Échec à `npm ci` | `functions/package-lock.json` absent ou désaccordé avec `package.json` | Sur le Mac : `cd functions && npm install`, puis commiter les deux fichiers |
| Avertissement `Node.js 20 is deprecated … actions/checkout@v4` | Les actions GitHub utilisées vieillissent | Pas une panne : passer à la version suivante des actions (`checkout`, `setup-node`) quand elle existe. **À faire avant que GitHub ne retire Node 20.** |
| Avertissement `ubuntu-latest will migrate to Ubuntu 26 beginning October 19, 2026` | Le système du runner change | Pas une panne, mais **à surveiller après le 19/10/2026** : si le déploiement casse sans changement de code, figer `runs-on: ubuntu-24.04` dans le workflow |
| Déploiement vert mais `/mcp` répond 404 | La réécriture Hosting vers le service Cloud Run n'a pas pris (forme **[à vérifier]**) | Essayer l'adresse directe de la fonction (visible dans Cloud Run) ; repli prévu au plan |

### Réponses du serveur `/mcp`

| Réponse | Sens | Vérification / réparation |
|---|---|---|
| `401 {"error":"non_autorise"}` | Jeton absent, faux, mal collé, ou révoqué (volontairement sans détail) | Vérifier que le client envoie `Authorization: Bearer cia_…` ; recréer un jeton si doute ; vérifier dans `MCP_JETONS` que la ligne existe et que `actif` est `true` |
| `403 {"error":"origine_refusee"}` | Un navigateur (en-tête `Origin` étranger) appelle le serveur | Normal pour Hermes et Claude Code (ils n'envoient pas d'`Origin`). Si l'un d'eux en envoie un : le signaler, on adapte la liste |
| `405 {"error":"methode_refusee"}` | Un client essaie `GET` | Les clients MCP doivent utiliser `POST` (transport « Streamable HTTP » sans session) |
| `503 {"error":"indisponible"}` | Le secret `MCP_JETONS` est illisible (secret absent, version désactivée, **compte d'exécution non autorisé à le lire**, API Secret Manager coupée) | Voir le journal Cloud Run (ligne `code: secret_illisible`) ; vérifier que le secret existe, qu'une version est active et que le compte d'exécution a le rôle « Accesseur de secrets » |
| `429` | **[prévu]** étape 4 : plafond de débit atteint | Attendre ou relever le plafond du jeton |
| Réponse lente (1 à 3 s la première fois) | Départ à froid de la fonction | Normal ; le client Hermes est réglé avec un délai de 120 s |

### Côté clients

| Symptôme | Causes probables | Réparation |
|---|---|---|
| **Claude Code** ne voit plus le serveur | Mise à jour de Claude Code qui change la syntaxe `claude mcp add` ; jeton absent de la variable d'environnement | Relancer `claude mcp list` ; vérifier la variable `CHEVALIER_MCP_TOKEN` ; tester d'abord avec `curl` (voir `mcp-etape-2.md`, point 5) : si `curl` marche, le serveur est sain et le problème est côté client |
| **Hermes** ne se connecte plus | Mise à jour de Hermes (format de `config.yaml`, nom des outils) ; jeton absent du fichier d'environnement du VPS | Même test `curl` depuis le VPS ; relever `hermes --version` ; comparer avec `docs/branchement-mcp.md` **[prévu]** étape 6 |
| `curl` marche depuis le Mac mais pas depuis le VPS | Pare-feu du VPS, DNS, heure du VPS | Tester `curl -I https://chevalier-ia-os.web.app` depuis le VPS |

**Méthode en trois questions** quand « ça ne marche plus » :
1. L'appli (https://chevalier-ia-os.web.app) fonctionne-t-elle ? Non → problème Firebase/Google, hors MCP.
2. `curl` avec le jeton répond-il (`qui_suis_je`) ? Non → lire le code de la réponse ci-dessus ; oui → le serveur est sain, le problème est dans le client (Hermes ou Claude Code).
3. Qu'est-ce qui a changé récemment ? (Mise à jour du client, du VPS, déploiement GitHub, alerte de Google par e-mail.)

## 7. Versions figées et mises à jour

Tout est figé à une version exacte pour qu'une mise à jour de l'extérieur ne casse rien toute seule :

| Élément | Version | Où | Pour mettre à jour |
|---|---|---|---|
| Node (fonctions) | 22 | `functions/package.json`, `firebase.json`, workflow | Google arrête Node 22 en 2028 ; prévoir le changement un an avant |
| SDK MCP | 1.32.0 | `functions/package.json` | Lire les notes de version, mettre à jour, lancer `cd tests && npm run test:fonctions` |
| `firebase-functions`, `firebase-admin`, `@google-cloud/secret-manager`, `zod` | 7.4.0, 14.5.0, 7.1.1, 4.6.5 | `functions/package.json` | Idem |
| Outil de déploiement | `firebase-tools@15.32.0` | workflow, `tests/package.json` | Changer les deux ensemble |
| Dépendances installées | figées par `functions/package-lock.json` (le workflow utilise `npm ci`) | dépôt | Jamais à la main : `npm install` sur le Mac puis commit |

Procédure de mise à jour : changer **une** version à la fois sur une branche, lancer les tests, lire le journal du déploiement, et garder le commit précédent sous la main (`git revert`).

## 8. Contrôle trimestriel (15 minutes)

- Les alertes de Google (e-mails de facturation, avis de dépréciation) sont-elles lues ?
- Le budget « Chevalier IA OS » : coût du mois, montant toujours à 5 €.
- Secret `MCP_JETONS` : chaque ligne `actif: true` correspond-elle encore à un client réellement utilisé ? Les jetons inutilisés sont passés à `false`.
- Les journaux Cloud Run (service `mcp`) montrent-ils des `401` répétés (tentatives) ?
- https://myaccount.google.com/permissions : seules les applications attendues ont accès.
- Dates à surveiller : **19/10/2026** (`ubuntu-latest` passe à Ubuntu 26), **fin de support des actions GitHub sur Node 20**, **2028** (Node 22 chez Google).
- Un test de restauration (étape 5 et suivantes) : une copie récente se restaure-t-elle ?

## 9. Journal des incidents et constats

| Date | Constat | Résolution |
|---|---|---|
| 02/10/2026 | Le projet `chevalier-ia-os` n'avait **aucun compte de facturation** (le plan supposait le forfait Blaze actif) ; la liste des projets du budget n'en montrait qu'un | Projet relié au compte « Paiement de Firebase », budget de 5 € créé avec alertes 50, 90 et 100 % |
| 02/10/2026 | Premier déploiement : `iam.serviceAccounts.ActAs` manquant sur `chevalier-ia-os@appspot.gserviceaccount.com` | Rôle « Utilisateur du compte de service » à ajouter au compte de déploiement ; ajout dans le workflow d'une ligne qui affiche l'adresse de ce compte pour éviter de la chercher |
