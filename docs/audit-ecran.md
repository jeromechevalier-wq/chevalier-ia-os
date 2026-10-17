# Audit des actions de l'écran (version 2.0.2) : guide pour Jérôme

Demande du 04/10/2026 : **l'audit doit tracer aussi ce que tu fais toi-même dans l'appli**, pas seulement ce que font Claude Code et Hermes. Choix de Jérôme : **piste A, atomique**. Cette version l'applique à toutes les actions du CRM faites à l'écran. L'**écran « Journal »** (lecture seule) est livré dans la version 2.0.3 : voir `journal-ecran.md`.

## En clair

Avant : quand tu créais, modifiais ou supprimais quelque chose à l'écran, rien n'était noté (seul le serveur MCP tenait un journal). Maintenant, **chaque action de l'écran écrit, dans le même envoi que la donnée**, une ligne dans le journal (`crm_audit` : qui, quand, quelle action, quel document, quels champs) et une copie « avant / après » du document (`crm_audit_avant`, effacée après 90 jours). « Dans le même envoi » veut dire **tout ou rien** : jamais une modification sans trace, jamais une trace sans modification. Le même schéma que le serveur MCP : `lire_audit` voit les actions de l'écran (canal `ecran`), et `restaurer_depuis_audit` peut les défaire.

**Ce qui est couvert** : toutes les créations, modifications et suppressions des personnes, organisations, affaires, activités, notes et événements, faites depuis l'appli (y compris la suppression en cascade, le changement d'étape, l'encaissement, l'archivage, les documents et les adresses GitHub / dossier).
**Ce qui n'est pas couvert** : les **réglages** (offres, étiquettes, secteurs, sources, filtres, objectifs saisis à la main), qui n'ont pas la même mécanique d'écriture ; ce qui est modifié **à la main dans la console Firestore** (les sauvegardes Google couvrent ce cas).

## ⚠️ Ordre à respecter : les règles AVANT la fusion

La nouvelle version de l'appli écrit dans `crm_audit` et `crm_audit_avant`. Avec les règles actuelles, ces écritures sont **refusées**, et comme tout est « tout ou rien », **l'appli ne pourrait plus rien enregistrer**. Il faut donc publier les nouvelles règles d'abord. Elles ne gênent pas la version actuelle de l'appli (elles autorisent seulement davantage), donc tu peux les publier sans risque dès maintenant.

### 1. Publier les nouvelles règles (toi, dans la console)

1. Ouvre https://console.firebase.google.com/project/chevalier-ia-os/overview , clique sur la carte **Firestore**, puis sur l'onglet **Règles**.
2. Clique dans l'éditeur, **⌘A** (tout sélectionner), **Suppr**.
3. Colle exactement ce texte (c'est le fichier `firestore.rules` de la PR) :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function compteAutorise() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in [
             "jerome.chevalier@gmail.com",
             "jeromebot.chevalierbot@gmail.com"
           ];
    }

    // Journal d'audit : lisible depuis l'appli. L'appli peut y AJOUTER les lignes de ses propres actions (canal « ecran », à son
    // nom), jamais les modifier ni les supprimer. Le serveur MCP écrit avec le SDK d'administration, qui contourne les règles.
    match /crm_audit/{id} {
      allow read: if compteAutorise();
      allow create: if compteAutorise()
        && request.resource.data.via == 'ecran'
        && request.resource.data.acteur == request.auth.token.email;
      allow update, delete: if false;
    }

    // Copies « avant / après » (effacées après 90 jours) : lisibles par l'appli (écran Journal), ajout seul depuis l'appli.
    match /crm_audit_avant/{id} {
      allow read: if compteAutorise();
      allow create: if compteAutorise() && request.resource.data.expireAt is timestamp;
      allow update, delete: if false;
    }

    // Compteurs de débit : réservés aux fonctions.
    match /mcp_limites/{id} {
      allow read, write: if false;
    }

    // Autorisations OAuth (connexion de Claude sur le téléphone) : empreintes de jetons, réservées aux fonctions.
    match /mcp_oauth/{id} {
      allow read, write: if false;
    }

    // Clés de la porte des workflows n8n (empreintes SHA-256, jamais les clés) : réservées aux fonctions. Aucun navigateur n'y a accès.
    match /plateforme_cles/{id} {
      allow read, write: if false;
    }

    // Tableau de bord : l'écran LIT (les deux comptes autorisés), mais n'écrit jamais lui-même. Les relevés viennent de la porte du tableau de bord (scripts GitHub)
    // et les saisies passent par une fonction serveur qui les journalise : aucune écriture depuis un navigateur.
    match /tableaudebord_indicateurs/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }
    match /tableaudebord_releves/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }
    match /tableaudebord_demandes/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // Tout le reste : comme avant (les deux comptes autorisés), sauf les collections ci-dessus.
    match /{collection}/{document=**} {
      allow read, write: if compteAutorise()
        && !(collection in ['crm_audit', 'crm_audit_avant', 'mcp_limites', 'mcp_oauth', 'plateforme_cles', 'tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes']);
    }
  }
}
```

4. Clique **Publier**. Ouvre ensuite l'appli et vérifie qu'une liste s'affiche, et qu'enregistrer quelque chose marche toujours (par exemple ajouter une note puis la supprimer).
5. Ce que ces règles changent : l'appli peut **lire** le journal et les copies, et **ajouter** des lignes à son nom (canal `ecran`) ; elle ne peut ni les modifier ni les supprimer ; un autre compte ne peut rien.

### 2. Fusionner

Dis-moi « fusionne ». Le déploiement dure 1 à 2 minutes ; recharge l'appli quand le bandeau « Nouvelle version disponible » apparaît (version 2.0.2).

### 3. Essai

1. Dans l'appli, crée une personne « ZZ Journal », puis supprime-la (nom à taper).
2. Dans le **Terminal**, lance `claude` et demande : « Avec lire_audit, montre-moi les écritures depuis aujourd'hui ». Tu dois voir des lignes avec le canal `ecran`, ton adresse comme acteur, les outils `creerPersonne` et `supprimerPersonne`.
3. Demande ensuite : « Restaure l'opération de la suppression de ZZ Journal (aperçu d'abord) ». La fiche revient, avec son identifiant. Supprime-la de nouveau pour nettoyer.

## Retour arrière

Dans cet ordre : (1) annuler la PR (`git revert -m 1 <commit de fusion>`), l'appli repasse en 2.0.1 qui n'écrit plus d'audit ; (2) **seulement ensuite**, si tu veux, republier les règles de l'étape 4 (texte ci-dessous). Dans l'ordre inverse, la nouvelle appli ne pourrait plus enregistrer.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function compteAutorise() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in [
             "jerome.chevalier@gmail.com",
             "jeromebot.chevalierbot@gmail.com"
           ];
    }

    // Journal d'audit : lisible depuis l'appli, jamais modifiable depuis l'appli.
    match /crm_audit/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // Copies « avant » et compteurs de débit : réservés aux fonctions (qui contournent les règles).
    match /crm_audit_avant/{id} {
      allow read, write: if false;
    }
    match /mcp_limites/{id} {
      allow read, write: if false;
    }

    // Tout le reste : comme avant (les deux comptes autorisés), sauf les collections ci-dessus.
    match /{collection}/{document=**} {
      allow read, write: if compteAutorise()
        && !(collection in ['crm_audit', 'crm_audit_avant', 'mcp_limites']);
    }
  }
}
```

## Ce qui a été vérifié, et ce qui ne l'a pas été

Voir la PR : tests de règles (le journal et les copies s'ajoutent à son nom, ne se modifient ni ne se suppriment), construction des lignes, restauration par le serveur d'actions faites à l'écran (suppression en cascade comprise, remise à l'identique), et deux parcours dans le navigateur sur les émulateurs avec les vraies règles. **Non vérifié** : l'effet réel sur ta base en ligne (c'est l'essai du point 3), les écritures simultanées depuis deux appareils, et les très grosses suppressions (plus de 130 documents d'un coup, découpées en plusieurs lots).

## Limites connues

- Le document « avant » est lu juste avant l'écriture ; si un autre appareil modifie la même fiche dans l'intervalle (quelques millisecondes), la copie « avant » peut être légèrement en retard. Le serveur MCP, lui, refuse dans ce cas (transaction) ; l'écran ne le fait pas.
- Une action qui touche plus de 130 documents est découpée en plusieurs lots : chaque lot est atomique, l'ensemble ne l'est pas (comme avant pour les suppressions de plus de 400 documents).
- Les copies « avant / après » contiennent des données de personnes : elles s'effacent après 90 jours (règle TTL créée le 03/10/2026).
