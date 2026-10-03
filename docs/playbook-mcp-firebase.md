# Playbook : mettre un serveur MCP sur Firebase (pour une nouvelle appli)

Tiré de l'expérience réelle de Chevalier IA OS (02 et 03/10/2026). Objectif : refaire la même chose pour une autre appli **en un seul déploiement vert**, au lieu des cinq tentatives qu'il a fallu ici. Remplacer `PROJET` par l'identifiant du projet Firebase de la nouvelle appli et `NUMERO` par son numéro de projet (visible dans la console Google, « Informations sur le projet »).

Temps estimé : 30 à 45 minutes si tout est préparé avant le premier déploiement (ce guide), plus de 2 heures si on découvre les erreurs une par une.

## 0. Ce que l'on obtient

Une Cloud Function HTTP (2e génération, Node 22) qui parle le protocole MCP « Streamable HTTP » sans session, joignable par `https://PROJET.web.app/mcp` (réécriture Firebase Hosting), protégée par un **jeton par client** (seules les empreintes sont stockées, dans Secret Manager), avec des droits par profil. Le code de référence est dans `functions/` de ce dépôt ; la sécurité est détaillée dans `securite-et-pannes.md`.

## 1. Avant de toucher au code : la console Google (à faire dans cet ordre)

Se connecter avec le compte propriétaire du projet. Remplacer `PROJET` dans chaque lien.

1. **Facturation (forfait Blaze)** : https://console.cloud.google.com/billing/linkedaccount?project=PROJET → « Associer un compte de facturation ». *Piège rencontré : le projet n'avait aucun compte associé alors qu'on le croyait en Blaze ; la page affichait « Ce projet ne comporte aucun compte de facturation ». Sans facturation, aucun déploiement de fonction.*
2. **Budget d'alerte** : https://console.cloud.google.com/billing/budgets → « Créer un budget » → dans **Projets**, cocher **seulement** `PROJET` (la liste n'affiche que les projets reliés au compte : s'il manque, retour à l'étape 1) → montant (5 €) → seuils 50, 90 et 100 % → e-mails. *Une alerte ne coupe rien. Ne jamais modifier le budget d'un autre projet.*
3. **Activer ces 8 API** (liens `https://console.cloud.google.com/apis/library/<API>?project=PROJET`, bouton « Activer ») :
   `cloudfunctions.googleapis.com`, `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, **`eventarc.googleapis.com`**, **`cloudbilling.googleapis.com`**, `firebaseextensions.googleapis.com`.
   *Eventarc et Cloud Billing ne sont pas évidentes (le déploiement les réclame même pour une fonction HTTP) ; l'outil tente de les activer lui-même mais le compte de déploiement n'en a pas le droit : « Permissions denied enabling … ». Les autres API (Pub/Sub, Storage) étaient déjà actives.*
4. **Rôles du compte de déploiement GitHub** : https://console.cloud.google.com/iam-admin/iam?project=PROJET → ligne `github-action-…@PROJET.iam.gserviceaccount.com` (celle dont la clé est dans le secret GitHub) → crayon → « Ajouter un autre rôle ». Rôles présents par défaut (créés par `firebase init hosting:github`) : Administrateur Firebase Hosting, Administrateur Firebase Authentication, Consommateur Service Usage, Lecteur Cloud Run, Lecteur de clés API, **Développeur** Cloud Functions. **À ajouter** :
   - **Administrateur Cloud Functions** (le rôle « Développeur » ne suffit pas : rendre la fonction publique exige `cloudfunctions.functions.setIamPolicy`) ;
   - **Utilisateur du compte de service** (`iam.serviceAccounts.ActAs` sur le compte d'exécution de la fonction). *Accordé au niveau du projet : plus large que nécessaire, à resserrer plus tard au seul compte d'exécution si on veut.*
   Les droits mettent 1 à 2 minutes à s'appliquer. Après un rôle manquant, la bonne méthode est « Re-run failed jobs » sur GitHub.
5. **Premier jeton** (sur le Mac, hors ligne, sans le dépôt) : la commande d'une ligne `node -e '…'` donnée dans `mcp-etape-2.md` (ou `node outils/creer-jeton.js <nom> <profil>`). Elle affiche le jeton **une seule fois** et une ligne JSON (empreinte). **Ranger le jeton dans le gestionnaire de mots de passe tout de suite.**
6. **Secret `MCP_JETONS`** : https://console.cloud.google.com/security/secret-manager?project=PROJET → « Créer un secret », nom exact `MCP_JETONS`, valeur = la ligne JSON (pas le jeton).
7. **Compte de service dédié à la fonction (recommandé dès le départ, à créer AVANT le premier déploiement)** : https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=PROJET → nom `mcp-serveur` → rôle « Utilisateur Cloud Datastore » (si la fonction lit ou écrit Firestore) → terminé. Dans le code : `serviceAccount: 'mcp-serveur@PROJET.iam.gserviceaccount.com'` dans les options de `onRequest`. Sans cela, la fonction tourne avec le « Default compute service account » (rôle « Éditeur » sur tout le projet), beaucoup trop large. Le compte de déploiement doit pouvoir agir en son nom (rôle « Utilisateur du compte de service », étape 4). *Ici, ce compte a été créé après coup (étape 3 validée avec le compte par défaut, puis changement d'une ligne, déploiement vert, essai réel concluant).*
8. **Droit de lecture du secret pour le compte d'exécution** : onglet Autorisations du secret → « Accorder l'accès » → **le compte réellement utilisé par la fonction (`mcp-serveur` si l'étape 7 est faite)** → rôle « Accesseur de secrets Secret Manager ». **Piège rencontré : ce n'est PAS forcément `PROJET@appspot.gserviceaccount.com`.** Ici, c'était le « Default compute service account » `NUMERO-compute@developer.gserviceaccount.com`. Pour le savoir sans deviner (une fois la fonction déployée) : Cloud Run → service `mcp` → onglet Sécurité → champ « Compte de service » : https://console.cloud.google.com/run/detail/europe-west9/mcp/security?project=PROJET . Avant ce droit, la fonction répond `503 {"error":"indisponible"}` : c'est normal et sans danger (échec fermé).

## 2. Dans le dépôt

- `functions/` : `package.json` (Node 22, `"type":"module"`, **versions exactes**, pas de `^`), `package-lock.json` (le workflow fait `npm ci`), `src/index.js` (fonction `mcp`, région, `maxInstances: 3`, `invoker: 'public'`, `cors: false`), `src/mcp/gestionnaire.js`, `src/securite/*`.
- `firebase.json` : bloc `functions` (`source`, `codebase`, `runtime: nodejs22`) ; `functions/**` dans `hosting.ignore` (sinon le code serait servi publiquement) ; réécriture `{ "source": "/mcp", "run": { "serviceId": "mcp", "region": "europe-west9" } }` ; émulateur functions. *Validé : la réécriture vers un service Cloud Run à Paris fonctionne.*
- Workflow GitHub : `actions/setup-node` Node 22 ; `npm ci --prefix functions` ; déploiement des fonctions **avant** Hosting ; identifiants écrits dans un fichier temporaire à droits 600 supprimé en sortie ; commande `npx firebase-tools@VERSION deploy --only functions --project PROJET --non-interactive --force`. **`--force` est indispensable en mode automatique** : sans lui l'outil déploie la fonction puis échoue (« could not set up cleanup policy ») et le site n'est pas déployé. Conséquence : une fonction retirée du code est supprimée au déploiement suivant.
- Une étape de diagnostic qui affiche **l'adresse** (jamais la clé) du compte de déploiement évite de chercher quel compte autoriser. Attention YAML : une commande contenant `: ` doit être dans un bloc `run: |`.
- Tests : jetons (format, empreinte, révocation par cache de 60 s, échec fermé), protocole avec un vrai client MCP, droits par profil, journaux sans secret, contrôles statiques (aucun secret dans le dépôt, versions figées, `functions/` non publié, workflow). Vérifier aussi que la fonction se charge dans l'émulateur Firebase : `firebase emulators:exec --only functions` puis un `curl`.

## 3. Les erreurs rencontrées, dans l'ordre, avec le remède

| # | Message du journal GitHub | Cause | Remède |
|---|---|---|---|
| 1 | `Missing permissions … iam.serviceAccounts.ActAs on service account PROJET@appspot…` | Rôle « Utilisateur du compte de service » absent | Étape 1.4 |
| 2 | `Permissions denied enabling eventarc.googleapis.com` | API non activée | Étape 1.3 |
| 3 | `Permissions denied enabling cloudbilling.googleapis.com` | API non activée | Étape 1.3 |
| 4 | `Missing required permission … cloudfunctions.functions.setIamPolicy … deploy new HTTPS functions` | Rôle « Développeur Cloud Functions » insuffisant | Ajouter « Administrateur Cloud Functions » |
| 5 | `Functions successfully deployed but could not set up cleanup policy in location europe-west9` | Mode non interactif, règle de nettoyage des images | `--force` dans la commande (nécessite un nouveau commit : un « Re-run » rejoue l'ancien workflow) |
| 6 | `/mcp` répond `503 indisponible` | Le compte d'exécution ne peut pas lire `MCP_JETONS` | Étape 1.8, avec le bon compte |

Remarque : le déploiement d'une fonction prend 1 à 3 minutes ; les tentatives 1 à 3 s'arrêtaient en moins d'une minute, signe d'une erreur de droits ou d'API et non d'une erreur de code.

## 4. Modèle de sécurité à reprendre tel quel

Un jeton par client (nom + profil + 256 bits) ; seules les empreintes SHA-256 dans Secret Manager ; comparaison à temps constant ; réponse 401 identique pour tout refus ; échec fermé si le secret est illisible ; profils (lecteur, bibliothécaire, claude-code) filtrant les outils côté serveur ; refus des `Origin` étrangers et de tout sauf `POST` ; journaux à liste blanche ; 3 instances au plus ; budget d'alerte ; interrupteur d'urgence (désactiver la version du secret). **Pas de porte dérobée dans le code** (voir `securite-et-pannes.md`, section 5). Le jeton ne va jamais dans le dépôt ni dans une conversation.

## 5. Ce qui n'est pas encore validé (à vérifier sur la prochaine appli, ou aux étapes suivantes ici)

Lecture de Firestore par la fonction : **validée en réel** (étape 3, avec le compte `mcp-serveur`). Écriture, audit, restauration et plafonds de débit : **code et émulateurs validés** (étape 4), validation en réel à consigner ici après la recette de `mcp-etape-4.md`. Drive côté serveur (étape 5), connexion réelle de Claude Code et de Hermes (étape 6 : syntaxe `claude mcp add`, configuration `mcp_servers`) : à venir.

## 6. Liste de contrôle « prêt à déployer »

- [ ] Compte de facturation relié, budget d'alerte créé sur le bon projet
- [ ] 8 API activées
- [ ] Compte de déploiement : Administrateur Cloud Functions + Utilisateur du compte de service
- [ ] Premier jeton créé, **rangé dans le gestionnaire de mots de passe**
- [ ] Secret `MCP_JETONS` créé avec la ligne d'empreinte
- [ ] Compte `mcp-serveur` créé (Utilisateur Cloud Datastore), accès au secret, `serviceAccount` dans le code
- [ ] `--force`, Node 22, `npm ci`, `functions/**` ignoré par Hosting, réécriture `/mcp` dans le dépôt
- [ ] Tests verts, fonction chargée dans l'émulateur
- [ ] Après le déploiement : lire le compte d'exécution dans Cloud Run → Sécurité, lui donner l'accès au secret, tester `qui_suis_je` avec `curl`

## 7. Ajouter l'écriture à un serveur MCP (acquis de l'étape 4)

- **Droits Google** : le rôle « Utilisateur Cloud Datastore » du compte d'exécution suffit pour écrire **et** pour les transactions (`beginTransaction` ne demande que `datastore.databases.get`). Rien à ajouter dans IAM.
- **Un seul chemin d'écriture** : un moteur unique (trace avant, données, trace après, restauration) que tous les outils appellent ; un test interdit qu'un outil écrive directement. Les règles métier sont des fonctions pures partagées avec l'appli (ici `logique.js`), pour qu'un agent ne contourne jamais les règles de l'écran.
- **Le journal ne doit pas garder de contenu de personnes** : les valeurs reçues vont dans une copie à durée limitée (stratégie TTL de Firestore sur un champ `expireAt`, à créer une fois dans la console ou par `gcloud firestore fields ttls update`), le journal durable ne garde que des noms de champs.
- **Règles Firestore** : une règle plus précise ne l'emporte pas sur un joker qui autorise ; il faut **exclure** les collections du serveur du joker. Écrire des tests qui **échouent** avec l'ancien fichier de règles prouve que les nouveaux tests mordent.
- **Tests en parallèle sur un même émulateur** : `node --test fichier1 fichier2` lance les fichiers en parallèle ; un fichier qui vide la base fait échouer les autres. Donner à chaque fichier d'essai son propre identifiant de projet de démonstration (`demo-…`).
- **Plafonds** : un compteur Firestore par jeton coûte une transaction par appel ; réserver cela aux limites rares (écritures par heure, suppressions par jour) et garder le débit par minute en mémoire de l'instance.
- **Tester les outils de bout en bout, par le vrai protocole** : les tests du moteur seul ne montrent pas tout ; ici, un test d'outil a trouvé un `forcer: true` ignoré (la vérification de doublon s'exécutait toujours).

