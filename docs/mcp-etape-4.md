# Étape 4 du serveur MCP : écrire, supprimer, restaurer (guide pour Jérôme)

Référence : `plan-mcp.md`, sections 5.2 (audit), 5.3 (outils), 5.4 (plafonds), 5.5 (règles) et 5.9 (tests). Après cette étape, **Claude Code peut créer et modifier ton CRM, supprimer et restaurer** par `https://chevalier-ia-os.web.app/mcp`. Le jeton « bibliothécaire » (Hermes) pourra créer et modifier, **jamais supprimer ni restaurer** : le serveur le refuse même si Hermes est mal configuré. Chaque écriture laisse une trace et peut être défaite.

## En clair : comment ça marche

Imagine un cahier de comptes où chaque ligne écrite est photographiée avant d'être changée.
1. **Avant d'écrire**, le serveur note dans un **journal** (`crm_audit`) : qui (le jeton), quoi (l'outil), quel document, et il range dans un **tiroir** (`crm_audit_avant`) une copie du document **avant** et **après**. Si le journal est en panne, **rien n'est écrit**.
2. **Il écrit** les données, par paquets de 400 (comme l'écran). Si quelqu'un (toi, sur l'écran) a modifié le même document une seconde plus tôt, il **refuse** plutôt que d'écraser, et te dit de recommencer.
3. **Il note le résultat** dans le journal (« succes » ou « echec »). Une ligne restée « en_cours » veut dire « à vérifier » : `lire_audit` avec `incompletes: true` les montre.
4. **Restaurer** = rejouer l'opération à l'envers à partir des copies du tiroir : une création est effacée, une modification est remise comme avant, une suppression est recréée **avec le même identifiant** (donc tous les liens entre fiches reviennent). Si le document a changé depuis, il refuse, sauf `forcer: true`. Les copies du tiroir **s'effacent toutes seules après 90 jours** (RGPD) ; ensuite, ce sont les sauvegardes (étape 5) qui prennent le relais.
5. **Freins** : par jeton, 120 requêtes par minute, 500 écritures par heure, 20 suppressions par jour. Au-delà, le serveur répond « plafond atteint » avec le délai.

Les règles métier (doublons, étapes, dates de Paris, événements du fil, cascade de suppression) sont **exactement celles de l'écran** : le code est le même fichier (`logique.js`), utilisé par l'écran et par le serveur.

## Ce qui est livré

| Pour qui | Outils |
|---|---|
| Bibliothécaire **et** Claude Code | `creer_personne`, `modifier_personne`, `creer_organisation`, `modifier_organisation`, `creer_affaire`, `modifier_affaire`, `changer_etape`, `marquer_perdue`, `mettre_en_pause`, `rouvrir_affaire`, `ajouter_encaissement`, `ajouter_note`, `modifier_note`, `creer_activite`, `terminer_activite`, `joindre_lien`, `retirer_document` |
| **Claude Code seul** | `supprimer_personne`, `supprimer_organisation`, `supprimer_affaire`, `supprimer_note`, `supprimer_activite`, `restaurer_depuis_audit` |
| Tous (étape 3) | les 9 outils de lecture, dont `lire_audit` (maintenant rempli) |

Détails à connaître :
- **Doublons** : créer (ou renommer) une personne ou une organisation qui ressemble à une existante est refusé avec la liste ; `forcer: true` après vérification.
- **Suppressions** : il faut taper le **nom exact** (titre pour une affaire) dans `confirmationNom`, comme à l'écran ; une organisation qui a encore des personnes ou des affaires ne se supprime pas ; pour une personne qui a des affaires, `choix` = `affaires` (les supprimer aussi) ou `conserver`. Le message de refus ne révèle jamais le nom attendu.
- **Restauration** : `restaurer_depuis_audit` montre d'abord un **aperçu** (rien n'est écrit) ; on relance avec `apercu: false` pour l'appliquer.
- **Changer d'étape** renvoie la « suggestion » de suivi (ex. « Envoyer la facture ») mais **ne la crée pas** : à créer avec `creer_activite` si utile.
- **Propriétaire** d'une fiche créée par un agent : ton e-mail par défaut (paramètre `proprietaire` pour en choisir un autre) ; le fil et l'audit gardent le nom de l'agent. Dans le fil de l'écran, ce que crée un agent s'affiche « hermes-bibliothecaire · via MCP ».
- **Plafonds par jeton** : réglables jeton par jeton dans le secret `MCP_JETONS` (nouvelle version), en ajoutant sur la ligne du jeton `"limites": { "requetesParMinute": 60, "ecrituresParHeure": 200, "suppressionsParJour": 5 }` (chaque valeur est facultative).

## Ce que tu fais, dans cet ordre

**Ne dis « fusionne » qu'après les points 1 et 2** (les règles se publient *avant*, le déploiement se fait à la fusion). Rien à faire sur ton Mac (pas de `npm test` : je l'ai lancé ici, résultat plus bas), et **aucun nouveau droit à accorder** dans Google (« Utilisateur Cloud Datastore » suffit pour lire, écrire et faire des transactions).

### 1. Publier les nouvelles règles Firestore (toi, dans la console)

Pourquoi : aujourd'hui une seule règle couvre toutes les collections. On sort le journal et le tiroir de cette règle : le journal devient **lisible depuis l'appli mais jamais modifiable**, le tiroir et les compteurs sont **fermés** à l'appli. Le serveur n'est pas concerné (il contourne les règles). **Pour l'appli, rien ne change** : les 45 cas de sécurité d'avant sont rejoués et passent.

1. Ouvre https://console.firebase.google.com/project/chevalier-ia-os/firestore/databases/-default-/rules (menu de gauche : **Firestore Database**, puis l'onglet **Règles**).
2. Clique dans la zone de texte, **sélectionne tout** (⌘A) et **supprime**.
3. Colle exactement ce texte (c'est le contenu du fichier `firestore.rules` de la PR) :

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

4. Clique **Publier** (bouton bleu en haut). Un message confirme la publication ; l'appli continue de marcher (ouvre-la et vérifie qu'une liste s'affiche).
5. **En cas de souci** : recolle l'ancien texte ci-dessous et republie.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in [
             "jerome.chevalier@gmail.com",
             "jeromebot.chevalierbot@gmail.com"
           ];
    }
  }
}
```

### 2. Effacement automatique des copies après 90 jours (TTL)

Le tiroir `crm_audit_avant` garde chaque copie avec une date d'expiration (`expireAt`, 90 jours après l'écriture). Il faut **dire une fois à Google** de supprimer les documents dont cette date est passée.

1. Ouvre https://console.cloud.google.com/firestore/databases/-default-/time-to-live?project=chevalier-ia-os. *(Si la page ne s'ouvre pas ainsi : https://console.cloud.google.com/firestore?project=chevalier-ia-os , clique sur la base `(default)`, puis **Time-to-live** dans le menu de gauche.)*
2. **Créer une stratégie** : *Nom du groupe de collections* = `crm_audit_avant` ; *Nom du champ d'horodatage* = `expireAt` ; laisse le *décalage d'expiration* à **0** (la date contient déjà les 90 jours) ; **Créer**.
3. Si la console refuse parce que la collection n'existe pas encore, fais d'abord l'essai du point 4 (qui la crée) puis reviens ici.
4. Autre méthode (Cloud Shell, l'icône `>_` en haut de la console Google Cloud) : `gcloud firestore fields ttls update expireAt --collection-group=crm_audit_avant --enable-ttl --project=chevalier-ia-os`.

Bon à savoir : Google efface « généralement dans les 24 h » après l'expiration, pas à la seconde. La stratégie met quelques minutes à devenir active.

### 3. Fusionner

Quand j'ai ta réponse « fusionne », je fusionne la PR. Le déploiement dure 1 à 3 minutes (le site passe après les fonctions, comme avant).

### 4. Essai en réel avec Claude Code (sur des données de test, avec nettoyage)

Ouvre une **nouvelle** session Claude Code (la liste des outils est lue au démarrage ; `claude mcp list` doit montrer `chevalier-ia-os` connecté) et demande, par exemple :

> Avec le serveur chevalier-ia-os : crée une organisation « ZZ Essai MCP », montre-moi ce que dit lire_audit pour cette opération, puis supprime-la (confirmation par son nom), puis restaure-la avec restaurer_depuis_audit (aperçu d'abord), vérifie qu'elle est revenue, et supprime-la une dernière fois pour nettoyer.

Résultat attendu : l'organisation apparaît (ouvre l'écran pour la voir), le journal montre `claude-code-jerome`, `creer_organisation`, « succes » ; elle disparaît puis revient **avec le même identifiant**, puis disparaît. Dans l'écran, son fil affichait « Organisation créée : ZZ Essai MCP ». Les copies sont dans `crm_audit_avant` (visibles seulement dans la console Firestore, jamais depuis l'appli).

Variante avec `curl` (jeton dans `CHEVALIER_MCP_TOKEN`, voir `mcp-etape-2.md`) :

```sh
appel() { curl -s -X POST https://chevalier-ia-os.web.app/mcp -H "Authorization: Bearer $CHEVALIER_MCP_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "$1"; echo; }
appel '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"creer_organisation","arguments":{"nom":"ZZ Essai MCP"}}}'
```

La réponse contient `id` (la fiche) et `operationId` (à donner à `restaurer_depuis_audit` ou `lire_audit`). Sans `forcer`, une seconde création du même nom est refusée (doublon) : c'est normal.

### 5. Plus tard : si quelque chose se passe mal

Voir `securite-et-pannes.md`, sections « Écrire : pannes » et « Interrupteurs d'urgence ». Le plus important : **couper tout** = désactiver la version du secret `MCP_JETONS` (moins d'une minute) ; **défaire une écriture** = `lire_audit` pour trouver l'`operationId`, puis `restaurer_depuis_audit`.

## Écarts avec le plan (à connaître)

1. **Le contenu des paramètres n'est plus dans `crm_audit`.** Le plan listait « paramètres reçus (2 000 caractères) » dans le journal conservé sans limite, ce qui contredisait la décision « traces illimitées **sans contenu** » (RGPD) : un nom ou un e-mail saisi y serait resté à vie. Le journal garde **les noms des champs reçus** (`parametresRecus`) ; les valeurs (tronquées à 2 000 caractères) vont dans le tiroir, avec l'expiration à 90 jours.
2. **La restauration compare le document entier**, pas seulement `modifieLe` : plus sûr (les activités n'ont pas de `modifieLe`) et ça gère le cas « l’écriture n’est jamais arrivée » (ligne restée `en_cours`).
3. **Contrôle de concurrence ajouté** (non prévu) : chaque paquet d'écriture est une transaction qui vérifie que les documents sont dans l'état lu au départ ; sinon refus « recommencer ». Évite d'écraser une modification faite en même temps sur l'écran.
4. **Plafond de requêtes par minute en mémoire de chaque instance** (et non dans Firestore) pour ne pas payer une écriture par lecture : avec 3 instances au plus, le plafond réel est au pire 3 × 120. Les plafonds d'**écritures par heure** et de **suppressions par jour** sont, eux, exacts (compteur dans `mcp_limites`). « Une écriture » = un appel d'outil qui écrit, quel que soit le nombre de documents touchés ; une suppression compte aussi comme écriture ; un appel refusé pour saisie invalide ne consomme rien. Une opération touche au plus 1 000 documents.
5. **`creeLe`, `modifieLe` : heure de la fonction** (au lieu de l'heure Firestore), pour que la copie « après » de l'audit soit exacte. `via: mcp` marque la **création** (pas les modifications : un `via` resté après une modification faite à la main serait faux).
6. **`retirer_document` : `index` ou `url`** (le plan disait `documentId`) : les documents n'ont pas d'identifiant avant l'étape 7.
7. **`supprimer_note` et `supprimer_activite` sans `confirmationNom`** : l'écran n'en demande pas (une note n'a pas de nom). Les trois fiches (personne, organisation, affaire) l'exigent.
8. **Les outils sont plus stricts que l'écran** sur les liens : un `personneId`, `organisationId`, `affaireId`, une étiquette, une offre ou une étape inconnus sont refusés (l'écran, lui, ne vérifie pas).
9. **Version de l'appli inchangée (2.0.0)** : l'extraction de `donnees.js` ne change rien de visible, et « via MCP » n'apparaît que pour ce que crée un agent. La version 2.0.1 est prise par la branche `mcp` (travail « Créer le GitHub / Créer le répertoire »), que je n'ai pas touchée : un seul bandeau « nouvelle version » à la fois.
10. `crm_parametres` n'est pas écrivable par le moteur (aucun outil de réglage au plan).

## Résultat des tests (lancés ici, 03/10/2026)

`npm test` complet, sur les émulateurs : règles **55** (les 45 d'avant + 10 nouveaux, dont 7 qui échouent bien si on garde l'ancien joker), logique **131** (dont 19 sur les plans d’écriture et le fil), contrôles statiques **42**, fonctions **111** (moteur d'écriture et audit en mémoire et sur Firestore avec pannes injectées, restauration, 29 scénarios d'outils par le vrai protocole MCP, plafonds, journaux sans contenu), parcours navigateur **98 sur 98** (l'écran n'a pas régressé après l'extraction). Chargement de la fonction `mcp` dans l'émulateur Firebase : réussi.

**Non vérifié** (impossible depuis ma session) : la publication réelle des règles et leur effet sur ton appli, l'activation du TTL, les écritures depuis la fonction déployée sur ta vraie base (droits, latence), l'affichage des nouveaux outils dans ta session Claude Code, le comportement des compteurs de débit sous charge réelle. Le jeton bibliothécaire n'existe pas encore (étape 6) : son profil n'est testé que par les tests.

## Retour arrière

Revert de la PR (`git revert -m 1 <commit de fusion>`) : la fonction repasse en lecture seule. Les règles : recoller l'ancien texte (point 1.5). Les lignes déjà écrites dans `crm_audit`, `crm_audit_avant` et `mcp_limites` n'ont aucun effet sur l'appli ; elles peuvent rester ou être supprimées à la main dans la console Firestore.
