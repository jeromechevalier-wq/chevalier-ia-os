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

## Étape 2 : lui donner trois droits
Sur <https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-app>, bouton **Accorder l'accès**, principal `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com` :

1. **Utilisateur Cloud Datastore** (*Cloud Datastore User*) : lire et écrire dans Firestore.
2. **Administrateur des objets Storage** (*Storage Object Admin*), **avec une condition** pour qu'il ne touche qu'au dossier `clients/` : clique **Ajouter une condition IAM**, titre « Seulement clients », onglet **Éditeur de condition**, colle :
   ```
   resource.type == "storage.googleapis.com/Object" && resource.name.startsWith("projects/_/buckets/chevalier-ia-app.firebasestorage.app/objects/clients/")
   ```
   puis **Enregistrer**. (Même méthode que `docs/mon-espace.md`, étape 2, avec `clients/` à la place de `marques/`.)
3. **Créateur de jetons du compte de service** (*Service Account Token Creator*), donné **à ce compte sur lui-même** : c'est ce qui lui permet de signer les liens de lecture de 5 minutes. Ouvre <https://console.cloud.google.com/iam-admin/serviceaccounts?project=chevalier-ia-app>, clique `devis-pdf`, onglet **Autorisations** (*Permissions*), **Accorder l'accès**, principal `devis-pdf@chevalier-ia-app.iam.gserviceaccount.com`, rôle **Créateur de jetons du compte de service**.

Le compte de déploiement `deploiement-github` agit au nom de ce compte grâce au rôle « Utilisateur du compte de service » déjà accordé au niveau du projet (même principe que `mcp-clients`, `docs/mcp-clients.md`).

## Étape 3 : le CORS du stockage
Rien de nouveau : le réglage se fait une fois pour le stockage de la plateforme. Il est décrit dans `docs/deploiement-client.md` (tableau « Réglages Google du projet de la plateforme », ligne « CORS du stockage des PDF ») et `docs/cors-stockage-pdf.md`. Sans lui, le PDF s'ouvre mais la copie dans Drive et la pièce jointe Gmail échouent.

## Étape 4 : déployer, puis essayer
1. Ouvre <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml> > **Run workflow**, branche `main`, choix **fonctions** (seulement quand l'étape 1 et l'étape 2 sont faites). Ce choix publie **toutes** les fonctions de la plateforme (dont celles des automatisations, qui exigent la clé n8n : voir `docs/automatisations-n8n.md`).
2. Dans un espace de démonstration où le module Devis est actif : finalise un devis. Au bout de quelques secondes (jusqu'à une minute à froid), le document « Devis … .pdf » apparaît ; un lecteur du même espace l'ouvre ; un devis d'un autre client reste inaccessible.
3. Si rien n'apparaît : voir « Si le PDF n'arrive pas » plus bas.

## Cas vide et cas d'erreur
- **Cas vide** : un devis encore brouillon n'a pas de PDF automatique (seul le PDF « brouillon » filigrané, demandé par le bouton, existe). Un client dont le module Devis est inactif n'a rien de fabriqué : le déclencheur ignore ses devis.
- **Cas d'erreur** : si la fabrication échoue (3 tentatives automatiques), le devis reste finalisé, `pdf.statut` vaut « échec » avec un message lisible, et l'écran propose « Réessayer ». Si le compte de service n'a pas ses droits, l'appel répond « Une erreur est survenue. » et le journal Cloud (Cloud Functions > `devisPdf` > Journaux) donne la raison.

## Ce qui n'est PAS vérifié (à contrôler au premier essai)
- Le **vrai Chromium** dans une Cloud Function de la plateforme (mémoire 2 GiB, délais, démarrage à froid, coût) : les tests utilisent un faux navigateur.
- Le **droit de signer les liens** : « Créateur de jetons du compte de service » sur le compte lui-même suffit d'habitude, mais je ne l'ai pas vérifié dans ce projet.
- Les **rôles du déclencheur Firestore** : un déclencheur passe par Eventarc ; le compte dédié aura probablement besoin de **Récepteur d'événements Eventarc** (`roles/eventarc.eventReceiver`) et de **Demandeur Cloud Run** (*Cloud Run Invoker*) sur sa propre fonction. Ce n'est pas vérifié : si le déploiement ou le déclenchement le réclame, ajoute ces rôles à `devis-pdf`.
- Le **CORS** (copie dans Drive, pièce jointe Gmail) pour le stockage de la plateforme.

## Si le PDF n'arrive pas
1. Regarde si le devis porte `pdf.statut = échec` (message affiché dans l'écran du devis).
2. Si le statut ne change jamais (pas même « en cours »), la fonction ne s'est pas déclenchée : ouvre <https://console.cloud.google.com/eventarc/triggers?project=chevalier-ia-app> et cherche le déclencheur de `devisPdfAuto` (région `europe-west9`) ; regarde son état et ses erreurs de droits (voir « rôles du déclencheur » ci-dessus).
3. Journal de la fonction : <https://console.cloud.google.com/functions/list?project=chevalier-ia-app> > `devisPdfAuto` > **Journaux**.
