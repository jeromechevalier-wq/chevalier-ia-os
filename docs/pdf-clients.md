# PDF des devis chez les clients (à faire par Jérôme avant le déploiement)

Chez Jérôme, quand un devis passe de brouillon à finalisé, le serveur fabrique son PDF tout seul. Cette page explique ce qu'il faut préparer pour que ce soit pareil **chez les clients** (projet Google `chevalier-ia-app`, dossier `functions-plateforme/`).

## Ce que fait le code
- `devisPdfAuto` : se déclenche quand un devis de `clients/<client>/devis_devis/…` passe de brouillon à finalisé, **seulement si le module Devis est actif chez ce client**. Il fabrique le PDF avec Chromium (dans la fonction), le range dans `clients/<client>/devis/…` (jamais public) et note l'état sur le devis (`pdf.statut` : en cours, ok, échec). Un échec ne bloque jamais la finalisation : le devis reste finalisé, avec un message et un bouton « Réessayer ».
- `devisPdf` : réessai à la demande, ou PDF « brouillon » filigrané. **Éditeurs du client seulement.**
- `devisPdfLien` : lien de lecture de 5 minutes. **Éditeurs et lecteurs** du client.
- Chaque appel vérifie que la personne est membre de **ce** client (refus neutre « Action non autorisée. » sinon) : un client ne peut jamais lire ni fabriquer le PDF d'un autre.
- L'adresse stable du PDF dans l'appli est `https://chevalier-ia-app.web.app/#/espace/<client>/devis/pdf/<devis>`.

## ⚠ À lire d'abord
**Tant que le compte `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com` n'existe pas, ne lance pas le choix `fonctions` du workflow « Déploiement plateforme clients »** : ce choix publie TOUTES les fonctions de la plateforme (`mcpclients`, `espaceReglages`, `devis…`) et elles échoueraient ensemble (message `serviceAccount … does not exist`). Rien n'est déployé par la PR qui ajoute ce code.

## Étape 1 : créer le compte de service `devis-pdf` (une seule fois)
> Dans la console Google, le projet **chevalier-ia-app** s'affiche **« Chevalier IA - Serveur 1 »**. Vérifie ce nom en haut de chaque page avant de cliquer.

- Ouvre <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=chevalier-ia-app>.
- « Nom du compte de service » : `devis-pdf`. L'identifiant devient `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com` (c'est exactement ce nom que le code attend). Clique **Créer et continuer**.
- **Ne génère aucune clé** (aucune clé n'est jamais nécessaire, ni dans le dépôt).

## Étape 2 : lui donner cinq droits
Sur <https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-app>, bouton **Accorder l'accès**, principal `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com` :

1. **Utilisateur Cloud Datastore** (*Cloud Datastore User*) : lire et écrire dans Firestore.
2. **Administrateur des objets Storage** (*Storage Object Admin*), **avec une condition** pour qu'il ne touche qu'au dossier `clients/` : clique **Ajouter une condition IAM**, titre « Seulement clients », onglet **Éditeur de condition**, colle :
   ```
   resource.type == "storage.googleapis.com/Object" && resource.name.startsWith("projects/_/buckets/chevalier-ia-app.firebasestorage.app/objects/clients/")
   ```
   puis **Enregistrer**. (Même méthode que `docs/mon-espace.md`, étape 2, avec `clients/` à la place de `marques/`.)
3. **Créateur de jetons du compte de service** (*Service Account Token Creator*), donné **à ce compte sur lui-même** : c'est ce qui lui permet de signer les liens de lecture de 5 minutes. Ouvre <https://console.cloud.google.com/iam-admin/serviceaccounts?project=chevalier-ia-app>, clique `devis-pdf`, onglet **Autorisations** (*Permissions*), **Accorder l'accès**, principal `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com`, rôle **Créateur de jetons du compte de service**.
4. **Récepteur d'événements Eventarc** (*Eventarc Event Receiver*, `roles/eventarc.eventReceiver`) : sur la même page IAM, bouton **Accorder l'accès**, principal `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com`, ce rôle. (Si la ligne du compte existe déjà dans la liste : crayon à droite de la ligne, **Ajouter un autre rôle**, puis **Enregistrer**.) Le déclencheur du devis passe par Eventarc ; `firebase-tools` ne donne ce droit qu'au compte de calcul par défaut, pas à `devis-pdf`.
5. **Demandeur Cloud Run** (*Cloud Run Invoker*, `roles/run.invoker`) : même page, même méthode (crayon sur la ligne du compte `devis-pdf`, **Ajouter un autre rôle**, **Enregistrer**). Même raison que le droit 4.
   - **Si les droits 4 et 5 manquent** : la fonction se déploie, mais `pdf.statut` ne passe jamais à « en cours » quand on finalise un devis (le déclencheur n'arrive pas jusqu'à la fonction).

**Une API à activer aussi (une seule fois pour le projet)** : « IAM Service Account Credentials ». Ouvre <https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com?project=chevalier-ia-app> (vérifie le nom du projet en haut) et clique le bouton bleu **Activer** (s'il affiche déjà « Gérer », c'est fait). Sans elle, le PDF est bien fabriqué et rangé, mais `devisPdfLien` répond « Stockage : le lien du PDF n'a pas pu être créé. » : le client ne peut pas l'ouvrir.

Le compte de déploiement `deploiement-github` agit au nom de ce compte grâce au rôle « Utilisateur du compte de service » déjà accordé au niveau du projet (même principe que `mcp-clients`, `docs/mcp-clients.md`).

## Étape 3 : le CORS du stockage
Rien de nouveau : le réglage se fait une fois pour le stockage de la plateforme. Il est décrit dans `docs/deploiement-client.md` (tableau « Réglages Google du projet de la plateforme », ligne « CORS du stockage des PDF ») et `docs/cors-stockage-pdf.md`. Sans lui, le PDF s'ouvre mais la copie dans Drive et la pièce jointe Gmail échouent.

## Étape 4 : déployer, puis essayer
1. Ouvre <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml> > **Run workflow**, branche `main`, choix **fonctions** (seulement quand l'étape 1 et l'étape 2 sont faites). Ce choix publie **toutes** les fonctions de la plateforme (dont celles des automatisations, qui exigent la clé n8n : voir `docs/automatisations-n8n.md`).
2. Dans un espace de démonstration où le module Devis est actif : finalise un devis. Au bout de quelques secondes (jusqu'à une minute à froid), le document « Devis … .pdf » apparaît ; un lecteur du même espace l'ouvre ; un devis d'un autre client reste inaccessible.
3. Si rien n'apparaît : voir « Si le PDF n'arrive pas » plus bas.

## Cas vide et cas d'erreur
- **Cas vide** : un devis encore brouillon n'a pas de PDF automatique (seul le PDF « brouillon » filigrané, demandé par le bouton, existe). Un client dont le module Devis est inactif n'a rien de fabriqué : le déclencheur ignore ses devis.
- **Cas d'erreur** : si la fabrication échoue (3 tentatives automatiques), le devis reste finalisé, `pdf.statut` vaut « échec » avec un message lisible, et l'écran propose « Réessayer ». Si le compte de service n'a pas ses droits de stockage, le serveur écrit `pdf.statut = 'echec'` avec le message « Stockage : le PDF n'a pas pu être enregistré. » et l'écran du devis l'affiche (avec « Réessayer ») ; le journal Cloud (Cloud Functions > `devisPdf` ou `devisPdfAuto` > Journaux) donne la raison exacte. Chez un client, le stockage des PDF est toujours branché : le message « PDF non configuré » existe dans le code comme garde-fou, mais ne peut pas apparaître en production chez un client.

## Ce qui n'est PAS vérifié (à contrôler au premier essai)
- Le **vrai Chromium** dans une Cloud Function de la plateforme (mémoire 2 GiB, délais, démarrage à froid, coût) : les tests utilisent un faux navigateur.
- Le **droit de signer les liens** : « Créateur de jetons du compte de service » sur le compte lui-même suffit d'habitude, mais je ne l'ai pas vérifié dans ce projet.
- La **limite de deux fabrications en même temps** (`maxInstances: 2`) est partagée entre tous les clients, comme chez Jérôme : limite connue, pas un défaut.
- Le **CORS** (copie dans Drive, pièce jointe Gmail) pour le stockage de la plateforme.

## Si le PDF n'arrive pas
1. Regarde si le devis porte `pdf.statut = échec` (message affiché dans l'écran du devis).
2. Si le statut ne change jamais (pas même « en cours »), la fonction ne s'est pas déclenchée : ouvre <https://console.cloud.google.com/eventarc/triggers?project=chevalier-ia-app> et cherche le déclencheur de `devisPdfAuto` (région `europe-west9`) ; regarde son état et ses erreurs de droits (voir les droits 4 et 5 de l'Étape 2).
3. Journal de la fonction : <https://console.cloud.google.com/functions/list?project=chevalier-ia-app> > `devisPdfAuto` > **Journaux**.

## Dossier de travail et PDF (PR « pdf-creer-dossier-et-copier », 27/10/2026)
Décision de Jérôme (26/10/2026) : le PDF d'un devis est **toujours fabriqué** (jamais bloqué). Quand l'affaire n'a pas de dossier de travail, l'écran du PDF le dit (« Cette affaire n'a pas encore de dossier de travail. ») et propose en **un clic** « Créer le dossier « <titre de l'affaire> » et y copier le PDF » (bouton en contour : « Ouvrir le PDF » reste le seul bouton jaune). Le bouton n'existe que si l'option « Créer un dossier dans Google Drive » est allumée, que Google est branché et que la personne peut écrire.
- **Quand le dossier est créé OU lié** (écran du PDF, ou fiche de l'affaire > Documents), les PDF de **tous** les devis finalisés de l'affaire (toutes versions non brouillon, PDF prêt) sont copiés dans le sous-dossier « Devis », puis leurs liens stables sont ajoutés aux Documents de l'affaire s'ils n'y sont pas (« Document joint » vient de la logique existante du fil, une seule fois par lien).
- Sans doublon (recherche par nom dans « Devis »), jamais de fichier écrasé ni de dossier supprimé. Compte rendu : « 3 PDF copiés dans le dossier. » ou « 2 sur 3 copiés : réessaie. ».
- Le CRM ne connaît pas le module Devis : il appelle un crochet (`js/modules/crm/dossier-externe.js`) que le module Devis inscrit au démarrage. Un `urlDossier` posé par le serveur MCP ne déclenche rien : la copie se fait à l'ouverture de l'écran du PDF.
- Les liens écrits par le navigateur ont la même adresse que ceux du serveur (`lienStablePdfNavigateur`, deux sites en constantes, test de comparaison).
- Chaque PDF copié demande un lien signé au serveur (N appels) et une lecture CORS du stockage (étape 3 ci-dessus).
- Même code chez Jérôme et chez les clients.
- Pas fait ici (voir `.github/A-FAIRE.md`) : l'alerte douce à la finalisation du devis.
