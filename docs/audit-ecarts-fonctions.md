# Audit des écarts entre les fonctions de Jérôme et celles des clients

Écrit le 28/10/2026 (audit de lecture, aucun code changé). Règle de départ : `CLAUDE.md`, décision du 26/10/2026 (une fonction du serveur existe chez Jérôme **et** chez les clients, ou la PR dit pourquoi). À refaire avant chaque démonstration chez un client.

## En deux mots

- **Chez Jérôme** : `functions/src/index.js` (projet `chevalier-ia-os`). **Chez les clients** : `functions-plateforme/src/index.js` (projet `chevalier-ia-app`, déploiement manuel avec Jérôme).
- Le script `scripts/preparer-fonctions.js` copie vers `functions-plateforme/serveur/` (dossier ignoré par git) : `coeur`, `mcp`, `oauth`, `securite`, `clients`, quatre fichiers de `devis/` (`pdf-service`, `pdf-declencheur`, `chromium`, `stockage`), `version.js` et `partage/`. Dans l'autre sens, `functions-plateforme/src/` (`n8n`, `etiquettes`, `synchro`) est copié vers `functions/partage/automatisations/`.
- **Jamais copiés** (volontairement, ils portent les comptes autorisés de Jérôme) : `devis/pdf-appel.js`, `devis/stockage-projet.js`, `porte.js`, `tableaudebord*.js`, `veille/`, `automatisations/`, `deploiement-appel.js`, `devis-appel.js`, `devis-email-appel.js`. Les clients ont leur équivalent dans `functions-plateforme/src/` (`devis.js`, `devis-pdf.js`, `deploiement.js`), avec un contrôle d'accès par espace (éditeur du client, module actif) au lieu de la liste de comptes de Jérôme.
- Ce qui compte pour un client : une fonction **appelée par l'écran** (`httpsCallable`) mais absente côté plateforme. L'écran se débrouille alors avec un message d'erreur générique.

## 1. Absentes chez les clients

| Nom | Fichier (Jérôme) | Intentionnel ? | Risque chez un client | Correction proposée |
|---|---|---|---|---|
| `automatisationsDecider` | `functions/src/automatisations/decider-appel.js` | **Résolu le 28/10/2026** (décision de Jérôme : le client a besoin de l'écran « À valider ») | Aucun : branchée chez les clients (`functions-plateforme/src/propositions.js`) : appelant éditeur de son espace, module « automatisations » actif (ancienne clé `journal: true` comprise), refus neutre sinon, propositions lues et écrites sous `clients/<client>/`, même code métier `coeur/propositions.js` que chez Jérôme. Déployée au prochain déploiement « fonctions » de la plateforme (lancé par Jérôme). | Fait. L'écran envoie l'espace de la session ; le serveur le revérifie. |
| `porte` (workflows n8n, actions `devis.lireEmail`, `devis.noterEmailPrepare`…) | `functions/src/porte.js` | Intentionnel, annoncé (« la porte de la base 2 n'existe pas encore », `docs/porte-cles.md`) | Élevé pour « Préparer l'e-mail » (jamais utilisable chez un client : entrée grisée avec une phrase claire) ; propositions « À valider » et écritures des workflows impossibles. | Chantier à part (porte de la base 2, liste d'arrêt) ; en attendant, garder la ligne dans `.github/A-FAIRE.md` et la phrase « pas encore branchée ». |
| `tableaudebord` (porte HTTP des scripts de surveillance) | `functions/src/tableaudebord.js` | Intentionnel : les indicateurs sont ceux de Jérôme | Faible : le module Maintenance s'affiche vide chez un client (déjà dit dans `js/os/registre.js`). | Rien tant qu'aucun client n'a de script de surveillance ; sinon lui donner sa propre porte. |
| `tableaudebordSaisir` | `functions/src/tableaudebord-saisie.js` | Oubli (le module est activable chez un client et ses boutons de saisie appellent cette fonction) | Faible à moyen : un client qui active Maintenance et saisit une échéance reçoit « Le serveur ne répond pas pour le moment ». | Ne pas activer Maintenance chez un client, ou brancher la fonction avec le contrôle par espace. |
| `veille` | `functions/src/veille/appel.js` | Oubli (le module est activable par Jérôme dans la fiche du client, `registre.js` le dit) | Moyen si Veille est activée : « Ajouter » et « Résumer » échouent avec « Le serveur ne répond pas ». Le jeton `VEILLE_JETON_RESUMER` n'existe pas dans `chevalier-ia-app`. | Ne pas activer Veille chez un client tant que la fonction n'est pas branchée ; sinon la porter avec un secret par client. |
| `automatisationsInterneHoraire` | `functions/src/index.js` | Intentionnel : copie des workflows « interne » de Jérôme | Aucun (les clients ont `automatisationsCopieHoraire`). | Rien. |
| `automatisationsAdmin` | `functions/src/index.js` | Intentionnel : vue administrateur, réservée à Jérôme (`estAdmin` ne vaut vrai qu'à la racine) | Aucun : l'écran client n'appelle jamais cette fonction. | Rien. |
| `mcp` | `functions/src/mcp/` | Intentionnel : le MCP des clients est `mcpclients` (un lien par client) | Aucun. Le code `mcp/` est bien copié dans `serveur/`. | Rien. |

## 2. Seulement chez les clients

| Nom | Fichier | Intentionnel ? | Risque | Correction proposée |
|---|---|---|---|---|
| `automatisationsCopieHoraire` | `functions-plateforme/src/appels.js` | Oui : copie des workflows de chaque client | Rôle « Administrateur Cloud Scheduler » à donner au compte de déploiement (noté dans A-FAIRE.md) | Rien de plus. |
| `automatisationsRafraichir` | idem | Oui : le bouton « Rafraîchir » d'un client (Jérôme passe par `automatisationsAdmin`) | Aucun | Rien. |
| `automatisationsRenommer` | idem | Écart d'interface à trancher : l'icône « Renommer » n'apparaît que chez un éditeur de client (`peutRenommer` : `base !== ''`), jamais chez Jérôme | Aucun pour le client ; chez Jérôme, impossible de renommer ses propres workflows, ce qui va contre la règle « même code chez Jérôme et chez les clients » (18/10/2026) | Décider : l'ouvrir à Jérôme (fonction `functions/` + copie du code commun) ou noter l'écart dans la liste des différences à supprimer. |
| `mcpclients` | `functions-plateforme/src/mcp-clients.js` | Oui (équivalent client de `mcp`) | Compte dédié à créer avant déploiement (`docs/mcp-clients.md`) | Rien. |
| `espaceReglages` | `functions-plateforme/src/espace.js` | Oui : « Mon espace » règle un client ; chez Jérôme les réglages se font en direct | Faible : l'écran « Mon espace » de la racine n'appelle pas cette fonction | Rien. |

## 3. Présentes des deux côtés : comportement comparé

| Nom | Différence | Intentionnel ? | Risque chez un client | Correction proposée |
|---|---|---|---|---|
| `devisPreparerEmail` | Jérôme : compte Google parmi `COMPTES_AUTORISES`, espace fixe, secrets sans suffixe. Client : éditeur du client, module `devis` actif, espace `interne` refusé, secrets `N8N_DEVIS_EMAIL_*_<client>`. Compte de service par défaut (pas de compte dédié). | Oui | Faible : sans secrets du client ni porte, la fonction répond « pas branchée » ; le compte de service par défaut devra recevoir « Accesseur de secrets » le jour du branchement. | Au branchement, créer un compte dédié comme pour le PDF. |
| `devisPreparerEmailEtat` | Mêmes différences d'accès. Un **lecteur** du client reçoit un refus (éditeur requis) ; l'écran traite `permission-denied` comme « non branché » (entrée grisée). | Oui | Faible : un lecteur voit l'entrée grisée même si c'est branché. | Accepter ; ou autoriser les lecteurs pour l'état seulement. |
| `deploiementVerifier` | Jérôme : tout compte autorisé ; contrôle « membres » = la liste de comptes du code n'est pas vide. Client : éditeur de l'espace demandé ; « membres » = les listes `equipe` et `membres` de la fiche concordent. Même version, mêmes lignes PDF. | Oui | Aucun connu. Limite : `pdf-fonctions` voit seulement que les trois fonctions sont déclarées, pas qu'elles sont déployées (Eventarc, `devisPdfAuto`). | Rien ; vérifier `devisPdfAuto` dans la console après chaque déploiement `fonctions`. |
| `devisFinaliser`, `devisChangerStatut`, `devisNouvelleVersion`, `devisArchiver`, `devisSupprimer`, `devisEnregistrerEnvoi` | Même code métier (`coeur/devis.js`). Accès : comptes de Jérôme / éditeur + module actif. Compte de service dédié chez Jérôme, défaut chez les clients. Plafond d'instances différent (3 contre 5). | Oui | Aucun | Rien. |
| `devisPdf`, `devisPdfLien`, `devisPdfAuto` | Même moteur (`pdf-service`, `chromium`, `stockage`). Jérôme : bucket du projet, déclencheur sur `devis_devis/{id}`, comptes autorisés. Client : bucket `chevalier-ia-app`, déclencheur sur `clients/{client}/devis_devis/{id}`, module `devis` actif, lien signé ouvert aux lecteurs aussi. | Oui | Le compte `devis-pdf@chevalier-ia-app…` doit exister avant tout déploiement (`docs/pdf-clients.md`), sinon tout le déploiement échoue. | Rien. |

## 4. Ce que cet audit n'a pas pu vérifier

- Les fonctions réellement déployées dans les consoles Google des deux projets (lecture du code seulement) : comparer avec la liste Cloud Functions de `chevalier-ia-app` avant la démonstration.
- Le comportement à l'écran chez un client réel des modules Veille, Maintenance et « À valider » (activation dans la fiche du client).

## À traiter avant la prochaine démonstration

1. `automatisationsDecider` est branchée chez les clients (28/10/2026, déploiement « fonctions » de la plateforme à lancer par Jérôme). `veille` et `tableaudebordSaisir` (Veille et Maintenance) restent réservées à Jérôme pour l'instant (décision du 28/10/2026) : ne pas activer ces modules chez un client.
2. Trancher l'écart `automatisationsRenommer` (renommer invisible chez Jérôme).
3. Relancer cet audit : comparer les `export const` des deux `index.js` avec les noms passés à `httpsCallable` dans `js/`.
