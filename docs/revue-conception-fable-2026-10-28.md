# Revue de conception (Fable, 28/10/2026) : quatre points que Jérôme soupçonne bancals

Revue en lecture seule (aucun code applicatif touché, aucun test lancé), faite sur `origin/main` (`eb5d2696`) et sur la branche de la PR 369 (`claude/zealous-davinci-3mq3l5`). Les numéros de ligne sont ceux de ces versions. Aucun secret, aucune donnée de client ici.

## Synthèse

| Point | Verdict | Urgence |
|---|---|---|
| 1. Parité `functions/` ↔ `functions-plateforme/` | **Solide sur le fond, fragile sur la forme** : la copie marche, mais elle repose sur des listes en dur et le contrôle d'accès des clients est réécrit à la main dans 6 fichiers, avec de petites différences. | Moyenne : corriger en une PR courte, avant la prochaine fonction cliente. |
| 2. Exports « Exporter mes données » | **Correct mais incomplet et trompeur** : le journal d'audit et le compteur des numéros de devis ne sont dans aucune sauvegarde ; les listes par module ne sont pas verrouillées par un test contre le registre. | Moyenne : une PR de tests + deux décisions de Jérôme. |
| 3. Documents stockés chez nous (PR 369) | **Bien conçue** (fiche écrite par le serveur seul, lien signé, chemin vérifié, corbeille). **Une vérification bloquante avant fusion** : les règles Storage du projet de Jérôme ne sont pas dans le dépôt. | **Haute** : vérifier 4 choses dans la console avant de fusionner. |
| 4. Étude n°12 « affaire vers projet » | **Recommandation juste** (deux fiches liées, améliorer l'affichage). Le modèle actuel a un défaut à régler avant toute évolution : le lien est écrit **des deux côtés** (`affaire.projetId` et `projet.affaireId`). | Basse : décider d'abord, pas de code avant. |

**Les 3 urgences** : (a) règles Storage de `chevalier-ia-os` à vérifier dans la console avant de fusionner la PR 369 ; (b) les droits IAM des trois comptes de service, sinon le dépôt échoue (message clair, mais le bouton est inutilisable) ; (c) décider si le journal d'audit (`crm_audit`, `crm_audit_avant`) et `devis_compteurs` doivent entrer dans une sauvegarde serveur, parce qu'aucun bouton ne les exporte aujourd'hui.

---

## 1. Parité `functions/` ↔ `functions-plateforme/`

### Ce qui est solide
- **Un seul exemplaire du code métier.** `scripts/preparer-fonctions.js` copie `coeur/`, `mcp/`, `oauth/`, `securite/`, `clients/` en entier (l. 85) et quatre fichiers du PDF un par un (l. 89). Les fichiers qui portent les comptes de Jérôme (`pdf-appel.js`, `stockage-projet.js`, `*-appel.js`) ne sont jamais copiés : c'est écrit dans le script et un test le verrouille (`tests/devis-pdf-plateforme.test.js`, D7 l. 345 : la liste nominative est exigée, `'devis'` entier interdit).
- **L'ordre des copies est juste** : `functions/partage/` est fabriqué d'abord (l. 10-79), puis recopié vers `functions-plateforme/serveur/partage/` (l. 92-95). Les imports relatifs réécrits (`../crm/logique.js` → `./logique.js`) sont contrôlés par `throw` si l'import attendu manque (l. 18, 27, 50).
- **Le dossier `serveur/` est effacé avant chaque copie** (`rmSync`, l. 84) : pas de fichier fantôme d'une ancienne version.
- **L'audit `docs/audit-ecarts-fonctions.md` est honnête** : chaque écart a sa raison et son risque.

### Ce qui est fragile
1. **Deux listes en dur à tenir à la main** : les fichiers écrits dans `functions/partage/` (l. 12-79) et la liste de ceux qu'on recopie vers la plateforme (l. 92). Un fichier ajouté à la première et oublié dans la seconde ne casse rien chez Jérôme et casse la plateforme **au déploiement seulement** (import introuvable). La PR 369 a justement dû toucher les deux (`fichiers-regles.js`). Rien ne compare les deux listes.
2. **Le test de présence des fichiers copiés est conditionnel** : `tests/mcp-module.test.js` l. 114 (`if (existsSync(...))`) ne vérifie la copie que si `npm run preparer` a déjà tourné. Sur une machine propre, le test passe sans rien vérifier.
3. **Le contrôle d'accès des clients est réécrit six fois, pas tout à fait pareil** :
   - `emailDe()` est copié-collé dans `devis.js` l. 21, `appels.js` l. 78, `espace.js` l. 72, `deploiement.js` l. 10, et en ligne dans `propositions.js` l. 24-26 ; `REFUS_NEUTRE` est défini cinq fois.
   - `devis.js` a une bonne fonction commune `controlerAppelant()` (l. 28-37, avec le refus de l'espace `interne` l. 31) ; mais dans le **même fichier**, `transitionDevis()` refait le contrôle à la main (l. 73-79) **sans** le refus de `interne`.
   - Le refus de `interne` existe dans `controlerAppelant`, `deciderClient` (`propositions.js` l. 29) et le déclencheur PDF (`devis-pdf.js` l. 122) ; il manque dans `transitionDevis`, `renommer` (`appels.js` l. 118-128), `verifierDeploiementClient` (`deploiement.js` l. 20-25) et `reglerEspace`. Risque réel faible (sans fiche `clients/interne/membres/<email>`, le refus tombe quand même), mais c'est le genre d'écart qui finit par mordre.
   - `espace.js` a **son propre motif d'identifiant** (`MOTIF_ID`, l. 22) au lieu de `MOTIF_IDENTIFIANT_CLIENT` ; un identifiant mal formé y reçoit le refus neutre (l. 97) alors que partout ailleurs c'est `invalid-argument` ; il vérifie `marques/<client>.actif` (l. 100-101) quand les autres vérifient `clients/<client>.modules`. Deux définitions de « l'espace existe ».
4. **Rien ne compare les `export const` des deux `index.js` aux noms passés à `httpsCallable` dans `js/`** : l'audit le demande à la main (point 3 de « À traiter ») ; `tableaudebordSaisir` et `veille` ont été oubliés exactement comme ça.

### Risques réels
- Pas de fuite entre clients vue : tout passe par `avecBase(..., clients/<client>)` et la fiche de membre est relue à chaque appel.
- Risque d'**incohérence Jérôme/clients** : une fonction ajoutée chez Jérôme sans son double (c'est arrivé deux fois). Dette : six copies d'un même contrôle.

### Recommandation (ordre)
1. **Maintenant, petite PR serveur (relecture Fable obligatoire, ~1 h)** : un fichier `functions-plateforme/src/acces.js` avec `emailDe`, `Refus`, `REFUS_NEUTRE` et `controlerMembre({ db, auth, client, roles, module })` ; les six fichiers l'importent ; `transitionDevis` utilise `controlerAppelant`. Comportement inchangé, tests existants verts.
2. **Maintenant, test statique (~30 min)** : (a) la liste de la l. 92 contient tout ce que les l. 12-79 écrivent (lire le script et comparer les deux ensembles) ; (b) chaque nom passé à `httpsCallable(fonctions(), '…')` dans `js/` est exporté par `functions/src/index.js` **et** par `functions-plateforme/src/index.js`, sauf une liste blanche nommée (`veille`, `tableaudebordSaisir`, `automatisationsAdmin`) qui cite la ligne d'`A-FAIRE.md`.
3. **Plus tard** : rendre le test de `mcp-module.test.js` inconditionnel en lançant `preparer` dans le test. Laisser le reste.

---

## 2. Exports « Exporter mes données »

### Ce qui est solide
- Six boutons, même présentation, même fonction `exportJson` / `nomFichierExport` (`js/modules/crm/logique.js` l. 2462-2481), un fichier JSON daté, dates converties en ISO (`versSerialisable`, l. 2445).
- **La sauvegarde « complète » est verrouillée par un test** : `tests/registre.test.js` l. 49-57 compare les collections déclarées par le registre (sauf `automatisations` et `tableaudebord`, exception écrite) à `COLLECTIONS_CRM` de `js/modules/crm/donnees.js`. Oublier une collection dans le registre ou dans la liste fait rougir.
- Chaque export par module a un parcours e2e qui vérifie les clés du JSON (`tests/e2e/devis-export.spec.js` l. 53, etc.).

### Ce qui est fragile
1. **Les listes par module sont en dur et pas reliées au registre** : `devis/donnees.js` l. 162, `projets/donnees.js` l. 276, `veille/donnees.js` l. 51, `tableaudebord/donnees.js` l. 35, `automatisations/donnees.js` l. 190. Le registre (`js/os/registre.js`, champ `collections`) déclare la même chose, mais rien ne le vérifie : une collection ajoutée au registre et oubliée dans `lireToutPourExport` passe les tests (le e2e verrouille l'ancienne liste, il ne détecte pas l'oubli).
2. **Quatre fonctions `lireToutPourExport` recopient la même boucle** au lieu d'appeler `CRM.collectionsParNoms(moduleDeclare(id).collections)` comme le fait `devis/donnees.js`.
3. **Ce qu'aucun bouton n'exporte** : `crm_audit` et `crm_audit_avant` (le journal qui « ne s'efface jamais » : décision du 04/10, il n'existe dans aucune sauvegarde) ; `devis_compteurs` (volontaire : « jamais dans l'export », `registre.js` l. 126) ; `crm_actions_lancements`, `mcp_*`. Les fichiers eux-mêmes (PDF des devis, documents de la PR 369) ne sont pas exportés : la PR 369 le dit clairement (`donnees.js` l. 20).
4. **Le mot « complet » est trompeur** : Réglages > Sauvegarde dit « Télécharge toutes tes données » (`reglages.js`), mais Automatisations et Maintenance en sont exclus par décision ; il faut cliquer six boutons pour tout avoir. Seul l'export CRM note `dernierExport`.
5. **Volume** : `collectionsParNoms` charge toute la collection en mémoire du navigateur (`getDocs`) puis `JSON.stringify(..., null, 2)`. `crm_evenements`, `executions` et `devis_devis` (une fiche par version) grossissent sans fin. Pas de pagination, pas de flux. Chez Jérôme c'est quelques Mo ; chez un client actif depuis deux ans, cela finira par bloquer l'onglet sur téléphone.

### Risques réels
- **Perte de données en cas de restauration** : restaurer `devis_devis` sans `devis_compteurs` donne des **numéros de devis en double** (le compteur repart). Le journal d'audit n'est récupérable que par les sauvegardes Firestore côté Google (à vérifier qu'elles existent).
- Pas de fuite : un export lit l'espace du client (`chemin(nom)`), les règles Firestore font le reste.

### Recommandation (ordre)
1. **Maintenant, test (~30 min)** : pour chaque module avec un bouton, la liste lue par `lireToutPourExport` = `moduleDeclare(id).collections` (test statique sur le texte, comme celui du registre). Et remplacer les quatre boucles par `collectionsParNoms(...)`.
2. **Maintenant, deux questions à Jérôme** : (a) une **sauvegarde serveur** (export Firestore planifié vers un bucket, hors écran) pour `crm_audit*` et `devis_compteurs` ? C'est de la console, pas du code ; (b) renommer « Télécharge toutes tes données » en « Télécharge les données des Affaires, Projets, Devis, Veille et Documents » (retouche d'interface, sans Fable).
3. **Plus tard** : export en flux (une collection à la fois, fichier zip) quand un client dépassera ~20 Mo. Laisser le reste.

---

## 3. Documents stockés chez nous (PR 369, non fusionnée)

### Ce qui est solide
- **La fiche `documents_stockes` n'est jamais écrite par un navigateur** (`firestore.rules` l. 57-60 et `firestore.plateforme.rules` l. 34-37 : `allow write: if false`), tests de règles ajoutés (K3 plateforme, `COLLECTIONS_AUTOMATISATIONS` chez Jérôme). C'est la bonne protection : sinon un éditeur écrirait un chemin de son choix que `documentLien` signerait.
- **Le chemin signé vient de la fiche, jamais de la demande**, et il est vérifié deux fois : préfixe de l'espace **et** de la cible (`cheminDocumentAppartientALEspace`, `stockage.js` l. 545-549), extension dans `TYPES` (`documents.js` l. 350-352). Lien signé de 5 minutes, `no-store`, jamais public.
- **Contrôles du fichier côté serveur** (extension finale et du milieu, type annoncé, premiers octets, nom nettoyé, quota 2 Go par espace, taille bornée à 20 Mo).
- **Corbeille logique + journal d'audit** : `supprimeLe` par le moteur d'écriture, `restaurer_depuis_audit` remet la fiche, le fichier n'a pas bougé. Cohérent avec « on ne supprime jamais ».
- **Même code chez Jérôme et chez les clients** (`coeur/documents.js`), fonctions branchées dans les deux `index.js` dans la même PR, outil MCP texte seulement (64 Ko).
- Chez les clients, `controlerMembreDocuments` réutilise `emailDe` de `devis.js` (exporté par la PR) : c'est le début du fichier commun demandé au point 1.

### Pièges et failles à regarder avant de fusionner
1. **Règles Storage de `chevalier-ia-os` : absentes du dépôt.** La PR l'écrit (`securite-et-pannes.md` : « état dans la console non vérifié »). Les règles Storage par défaut d'un projet Firebase autorisent souvent **tout utilisateur connecté** à lire et écrire tout le bucket. Chez Jérôme, l'écran n'accède jamais au bucket, mais un compte Google quelconque qui se connecte à l'appli pourrait, avec le SDK, lire `documents/…` si les règles sont ouvertes. **C'est la vérification n°1.** Le dépôt a `storage.plateforme.rules` (tout refusé sauf `marques/`) mais pas de `storage.rules` pour Jérôme.
2. **Droits IAM (runtime, pas déploiement)** : trois comptes à régler, sinon le bouton répond « le compte du serveur n'a pas le droit » (message prévu, l. 257). Chez Jérôme : `porte-serveur` (fonctions de l'écran, `index.js` l. 119) et `mcp-serveur` (outil MCP, l. 51) ; chez les clients : `devis-pdf` (déjà autorisé sur `clients/`) et `mcp-clients`. La doc demande « Administrateur des objets », ce qui donne aussi le droit d'effacer : nécessaire pour le repli (`stockage.supprimer` l. 324) mais à savoir. `documentLien` signe des URL v4 : le compte doit pouvoir signer (« Créateur de jetons du compte de service » sur lui-même) ; les PDF le font déjà avec `porte-serveur` et `devis-pdf`, donc normalement acquis, mais `mcp-serveur` ne signe pas (il ne fait que déposer).
3. **Orphelins et quota** : supprimer une affaire ou un projet ne touche pas ses fiches `documents_stockes` (`planSupprimerAffaire` l. 2204, `planSupprimerProjet` l. 945). Elles restent **invisibles** (plus de cible) mais **comptent dans le quota** de 2 Go (`documents.js` l. 303-305 : seules les fiches `supprimeLe` sont exclues). À terme, un espace peut être « plein » sans rien à l'écran. Même chose pour un `restaurer_depuis_audit` d'un dépôt : la fiche disparaît, le fichier reste (voulu, mais hors quota et hors liste).
4. **Le quota est calculé en lisant toute la collection à chaque dépôt** (l. 303) et sans transaction : deux dépôts en même temps peuvent dépasser 2 Go d'un fichier. Acceptable aujourd'hui ; à remplacer par un compteur si un espace dépasse quelques milliers de fichiers.
5. **Jamais de purge** : le fichier d'une fiche en corbeille reste pour toujours. C'est la décision du 04/10 ; il faut juste savoir que le bucket ne diminue jamais et que la corbeille ne compte pas dans le quota (on peut donc dépasser 2 Go réels).
6. **Plateforme : module exigé = Affaires ou Projets actif** (`documents.js` plateforme, l. 104), mais la lecture Firestore de `documents_stockes` est ouverte à tout membre sans condition de module (règle l. 35). Pas une faille (il faut être membre), juste une asymétrie.
7. **Fichier zip déguisé en `.docx`** : les deux ont la même signature `zip` (`fichiers-regles.js`) ; un zip renommé passe. Sans danger (Office le refuse, servi en téléchargement), à savoir.
8. **Fonction `collectionDesDocuments` en double protection** dans les règles plateforme (l. 31-33 puis l. 43) : inutile mais inoffensive.

### Liste de vérifications pour Jérôme avant de fusionner (puis de déployer)
1. **Console Firebase, projet `chevalier-ia-os` > Storage > Règles** : lire les règles. Si elles contiennent `allow read, write: if request.auth != null` (ou plus ouvert) sur tout le bucket, demander à Claude d'ajouter un `storage.rules` « tout refusé » au dépôt (copie de `storage.plateforme.rules` sans `marques/`), branché dans `firebase.json`, et le publier **avant** la PR 369.
2. **IAM `chevalier-ia-os`** : `porte-serveur@` et `mcp-serveur@` ont « Administrateur des objets Storage » avec la condition `documents/` sur le bucket du projet. Tester : Réglages > Déploiement reste vert, puis déposer un `.txt` dans une affaire de test.
3. **IAM `chevalier-ia-app`** : `mcp-clients@` a le même rôle avec la condition `clients/` ; `devis-pdf@` l'a déjà (PDF). Ne déployer `fonctions` chez les clients qu'après.
4. **Essai de bout en bout chez Jérôme** : déposer un PDF, l'ouvrir (lien de 5 min), attendre 6 min, recharger : le vieux lien doit être refusé ; retirer le fichier : il disparaît, ligne dans l'Historique, `restaurer_depuis_audit` le remet.
5. **Essai d'un compte non autorisé** (n'importe quel compte Google) : l'écran refuse l'accès comme avant, et avec les règles Storage corrigées, une lecture directe du bucket est refusée.

### Recommandation
Fusionner **après** les vérifications 1 à 3. Plus tard, petite PR : marquer `supprimeLe` sur les fiches d'une affaire ou d'un projet supprimé (dans le même plan), pour que le quota et `lister_documents` restent justes. Laisser le reste.

---

## 4. Étude n°12 « affaire vers projet »

### Ce qui est solide
- L'étude (`docs/etude-affaire-vers-projet.md`) est fidèle à Pipedrive et au code : deux collections, lien dans les deux sens, un projet par affaire au plus, devis et notes sur l'affaire, chiffre d'affaires compté à « Gagnée », encaissé sur les factures du projet. La recommandation **B+** (garder deux fiches, améliorer l'affichage croisé, aucune migration) est la bonne : l'option A (fiche unique) contredirait la décision du 03/10 et imposerait une migration des données de Jérôme (liste d'arrêt).
- Les plans sont symétriques : `planLierProjet` écrit les deux côtés (`projets/logique.js` l. 784-792), `planSupprimerProjet` détache l'affaire (l. 947), `planSupprimerAffaire` détache les projets (`crm/logique.js` l. 2208). Le moteur d'écriture est en lots atomiques pour ces petits plans.

### Ce qui est fragile
1. **Deux sources de vérité pour un seul lien** : `affaire.projetId` et `projet.affaireId`. Tant que tout passe par les plans, ça tient ; mais une écriture directe (console, ancien script, restauration partielle depuis un export) peut les désaccorder, et rien ne le détecte (pas d'indicateur de Maintenance, pas d'outil MCP de contrôle). `planSupprimerProjet` ne détache que si `affaire.projetId === projet.id` (l. 947) : une affaire désaccordée garde un `projetId` mort.
2. **La règle « un projet par affaire » est vérifiée en lisant la liste des projets** (`validerLienAffaire`) : deux créations simultanées (écran + assistant) peuvent passer toutes les deux. Sans transaction, l'affaire garde le dernier `projetId` écrit et l'autre projet pointe vers elle sans retour.
3. **L'étude laisse ouverte l'option « plusieurs projets par affaire »** sans dire ce qu'elle coûte : `affaire.projetId` (un seul) devrait disparaître ou devenir une liste ; tous les écrans, outils MCP (`creer_projet_depuis_affaire`, `lire_affaire`) et tests qui le lisent changent ; c'est une **migration de données existantes** (liste d'arrêt).
4. L'étude ne tranche pas ce que montre le projet des devis (aujourd'hui : rien, « pas d'onglet Devis sur la fiche projet pour l'instant », `consignes-ui.md`).

### Risques réels
- Pas de perte tant qu'on reste en B+ (affichage seulement). Dette : le double lien. Pas d'écart Jérôme/clients (même code).

### Recommandation (ordre)
1. **Maintenant, décision de Jérôme** (pas de code) : répondre aux six questions de l'étude, en commençant par « plusieurs projets par affaire ? ». Si **non** : B+ tel quel. Si **oui** : faire de `projet.affaireId` la **seule** vérité, dériver la liste des projets d'une affaire par lecture, et retirer `affaire.projetId` par une migration (une PR de la liste d'arrêt, ~1 jour avec tests et outils MCP).
2. **Plus tard, quel que soit le choix (~2 h, Fable obligatoire)** : un contrôle de cohérence du double lien (un indicateur Maintenance ou une vérification dans `deploiementVerifier`), et le détachement inconditionnel dans `planSupprimerProjet` (toute affaire dont `projetId` vaut l'id supprimé).
3. **Laisser** le modèle à deux collections : c'est celui de Pipedrive et de la décision du 03/10.

---

## Ce que cette revue n'a pas pu vérifier
- L'état réel des règles Storage et des rôles IAM dans les deux consoles Google (lecture du code seulement).
- Le comportement des exports sur de gros volumes (aucun test lancé, décision de la mission).
- Les fonctions réellement déployées sur `chevalier-ia-app` (voir `docs/audit-ecarts-fonctions.md`, section 4).
