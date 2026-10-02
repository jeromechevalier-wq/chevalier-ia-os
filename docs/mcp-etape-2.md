# Étape 2 du serveur MCP : squelette des fonctions (guide pour Jérôme)

Référence : `plan-mcp.md`, sections 5.4 et 5.10. Cette étape pose la **porte d'entrée** (une fonction Google à Paris, `https://chevalier-ia-os.web.app/mcp`) avec un seul outil, `qui_suis_je`, et la sécurité par jeton. Aucune donnée du CRM n'est encore accessible par cette porte.

## Ce qui est livré

- `functions/` : la fonction `mcp` (Node 22, Paris, 3 instances au plus, invocation publique côté Google : **la porte, c'est le jeton**). Jamais publiée avec le site.
- `outils/creer-jeton.js` : génère un jeton (sur ton Mac, hors ligne).
- `firebase.json` : réécriture `/mcp` vers la fonction, `functions/**` exclu du site.
- `.github/workflows/firebase-hosting.yml` : à chaque fusion sur `main`, déploie **d'abord les fonctions, puis le site** (si les fonctions échouent, le site n'est pas touché, il reste tel qu'il est).
- Tests : `tests/jetons.test.js`, `tests/mcp.test.js`, et les contrôles statiques D5.

Ce que la fonction fait, dans l'ordre : refuse un en-tête `Origin` étranger (403) → refuse toute méthode autre que `POST` (405) → lit le secret `MCP_JETONS` (cache 60 s) → compare l'empreinte du jeton présenté (401 identique pour jeton absent, inconnu, mal formé ou révoqué) → n'expose que les outils du profil du jeton. Si le secret est illisible : 503, jamais d'accès. Les journaux Google ne contiennent que : jeton (son nom), acteur, profil, outil, durée, statut, code.

Pas encore fait (étapes suivantes) : limites de débit (étape 4, avec l'écriture), couche métier et audit (étapes 3 et 4), `scripts/preparer-fonctions.js` (étape 3, quand `logique.js` sera partagé).

## Ce que tu fais, dans cet ordre

Ne **fusionne la PR qu'après les points 0 à 3** : la fusion lance le déploiement.

### 0. Relier le projet à un compte de facturation (forfait Blaze)
Sans cela, Google refuse de déployer des fonctions. Page : https://console.cloud.google.com/billing/linkedaccount?project=chevalier-ia-os → **Associer un compte de facturation** → « Paiement de Firebase » (le compte déjà utilisé pour un autre projet) → **Définir le compte**. *(Fait le 02/10/2026 : le projet n'avait aucun compte associé, contrairement à ce que le plan supposait.)* Blaze n'a plus de plafond automatique : seules les alertes du point 1 et nos limites (3 instances, plafonds par jeton) protègent.

### 1. Budget de 5 € avec trois alertes
Console → Facturation → **Budgets et alertes** : https://console.cloud.google.com/billing/budgets (compte « Paiement de Firebase » ; **ne modifie pas** le budget existant d'un autre projet). **Créer un budget** (dans « Projets », coche **seulement** `chevalier-ia-os`) : nom `Chevalier IA OS`, projet `chevalier-ia-os`, montant 5 €, seuils 50 %, 90 % et 100 %, e-mails vers `jerome.chevalier@gmail.com`. Une alerte ne coupe rien : elle prévient seulement.

### 2. Activer cinq API (gratuites tant qu'on ne s'en sert pas)
Ouvre chaque lien (projet `chevalier-ia-os`) et clique sur **Activer** (si tu vois « Gérer », c'est déjà fait) :
- Cloud Functions : https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=chevalier-ia-os
- Cloud Run : https://console.cloud.google.com/apis/library/run.googleapis.com?project=chevalier-ia-os
- Cloud Build : https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=chevalier-ia-os
- Artifact Registry : https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=chevalier-ia-os
- Secret Manager : https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=chevalier-ia-os

### 3. Créer ton premier jeton et le secret `MCP_JETONS`
1. Sur ton Mac, deux façons équivalentes : soit dans le dossier du dépôt (branche `mcp` à jour) `node outils/creer-jeton.js claude-code-jerome claude-code`, soit **sans le dépôt**, la commande d'une ligne `node -e '…'` que Claude donne dans la conversation (même jeton, même ligne). Le terminal affiche **une fois** le jeton (`cia_…`) et une ligne JSON. **Range le jeton tout de suite** (gestionnaire de mots de passe) ; il n'est enregistré nulle part ailleurs. Ne le colle jamais dans un fichier du dossier synchronisé avec Drive, ni dans une conversation.
2. Console → Sécurité → **Secret Manager** : https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os → **Créer un secret** : nom exactement `MCP_JETONS`, valeur = **la ligne JSON** (pas le jeton), le reste par défaut.
3. **À faire après le premier déploiement** (le compte d'exécution réel n'est connu qu'alors ; d'ici là, `/mcp` répond 503, c'est normal). Dans ce secret, onglet **Autorisations** → **Accorder l'accès** : compte principal = le compte d'exécution des fonctions (en général `NUMÉRO-compute@developer.gserviceaccount.com`, que tu vois dans https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-os ; **[à confirmer au premier déploiement]**), rôle **Accesseur de secrets Secret Manager**.
Pour ajouter un client plus tard : relancer `creer-jeton.js`, puis ajouter la nouvelle ligne dans une **nouvelle version** du secret. Pour révoquer : passer `"actif": true` à `false` dans une nouvelle version (effet en moins d'une minute).

### 4. Rôles du compte de service du déploiement (un à la fois)
Le compte `…@chevalier-ia-os.iam.gserviceaccount.com` créé pour GitHub (celui du secret GitHub `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS`) doit pouvoir déployer des fonctions. Console → IAM : https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-os → crayon sur sa ligne → **Ajouter un autre rôle**. Rôles probables, **à ajouter un par un seulement quand le déploiement les réclame** (le message d'erreur du déploiement nomme le rôle manquant ; je te le donnerai) :
1. Administrateur Cloud Functions ;
2. Utilisateur du compte de service (idéalement sur le seul compte d'exécution) ;
3. Administrateur Cloud Run (rendre le service public) ;
4. Rédacteur Artifact Registry (et accès au bucket de sources) selon les messages.

Pour relancer un déploiement raté sans nouvelle fusion : GitHub → onglet **Actions** → https://github.com/jeromechevalier-wq/chevalier-ia-os/actions → la dernière exécution → **Re-run failed jobs**.

### 5. Essai
Dans ton terminal Mac (le jeton est saisi sans s'afficher, donc pas dans l'historique) :

```sh
read -s CHEVALIER_MCP_TOKEN; export CHEVALIER_MCP_TOKEN
curl -s -X POST https://chevalier-ia-os.web.app/mcp \
  -H "Authorization: Bearer $CHEVALIER_MCP_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"qui_suis_je","arguments":{}}}'
```

Résultat attendu : une réponse JSON contenant `claude-code-jerome`, le profil `claude-code` et la liste `["qui_suis_je"]`. Sans l'en-tête `Authorization` (ou avec un jeton faux) : `{"error":"non_autorise"}`. Avec `-X GET` : `{"error":"methode_refusee"}`.

## Ce que j'ai vérifié, et ce que je n'ai pas pu vérifier

Vérifié (dans ma session, sans Google) : les tests (jetons, protocole avec un vrai client MCP, droits par profil, journaux sans secret) et le chargement de la fonction `mcp` (région Paris) dans l'émulateur Firebase 15.32.0, où elle répond 405 à un `GET` et **refuse tout (503)** quand le secret est introuvable.
**Non vérifié** (je n'ai pas accès à ton projet Google) : le déploiement réel, la liste exacte des rôles, la réécriture Hosting vers un service Cloud Run à Paris (forme documentée pour Cloud Run ; repli prévu : adresse directe de la fonction), le compte d'exécution exact, l'accès à Secret Manager.

## Retour arrière
Revert de la PR (`git revert -m 1 <commit de fusion>`) puis suppression du service `mcp` dans Cloud Run (le déploiement ne supprime pas de lui-même une fonction retirée du code) : https://console.cloud.google.com/run?project=chevalier-ia-os. Coupure d'urgence sans rien déployer : désactiver la version du secret `MCP_JETONS` (tout est alors refusé) ou retirer l'invocation publique du service dans Cloud Run.
