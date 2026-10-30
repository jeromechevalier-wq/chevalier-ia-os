# Plan : serveur MCP, audit, sauvegardes et pièces jointes de Chevalier IA OS

Rédigé le 02/10/2026 en mode plan, **approuvé par Jérôme le 02/10/2026**. Ce document complète `cahier-mcp.md` (qui reste la source de vérité du besoin) ; en cas de contradiction, les décisions de la section 2 prévalent sur le cahier. Branche de travail : `mcp`, créée à partir de `main` (voir l'écart 6 de la section 3). Aucune étape de code n'est commencée : ce document est l'étape 0.

## 0. Lexique en une phrase par notion

- **MCP** : un langage commun qui permet à un outil d'IA d'appeler les « outils » d'un serveur (chercher une affaire, ajouter une note…).
- **Cloud Function** : un petit programme hébergé par Google qui ne tourne et ne coûte que quand on l'appelle.
- **Jeton** : une longue clé secrète que chaque client (Hermes, Claude Code) envoie pour prouver qui il est ; **empreinte** = son résumé irréversible, seul à être gardé côté serveur.
- **Secret Manager** : le coffre-fort de Google pour les secrets.
- **Audit** : un journal écrit à chaque modification, avec une copie de l'état d'avant pour pouvoir restaurer.
- **Émulateur** : une copie de Firestore/Auth qui tourne sur ordinateur, pour tester sans toucher aux vraies données.
- **PITR** (récupération à un instant donné) : Google garde chaque minute des 7 derniers jours de ta base et peut la remettre dans l'état d'une minute précise.
- **TTL** : une règle Google qui supprime automatiquement un document à une date donnée.
- **OAuth / jeton de rafraîchissement** : l'autorisation que tu donnes une fois à l'appli pour agir dans ton Drive ; le jeton de rafraîchissement permet d'obtenir des clés d'une heure sans te redemander.
- **Rôle IAM** : un droit nommé dans la console Google qu'on accorde à un compte (ici le compte de service du déploiement).

## 1. Contexte

Chevalier IA OS devient ton CRM (tu quittes Notion). Claude Code (Mac) et des agents (premier : bibliothécaire Hermes Agent sur ton VPS) doivent lire et écrire dans Firestore avec les mêmes règles que l'écran, avec une trace de chaque action. L'appli doit aussi joindre des documents à une affaire par lien ou téléversement vers ton Drive, depuis le téléphone.

## 2. Mes réponses de la phase 0 (elles prévalent sur le cahier)

| Sujet | Décision |
|---|---|
| Région, adresse | Fonctions à **Paris (europe-west9)**, adresse **`https://chevalier-ia-os.web.app/mcp`** par réécriture Hosting ; repli : adresse directe de la fonction |
| Droits | **Bibliothécaire** : lecture, écriture, pièces jointes, sauvegarde, **sans suppression ni restauration** ; **Claude Code** : tout |
| Acteur | Deux champs : `auteur` (ex. `hermes-bibliothecaire`) et `via` (`mcp`) ; le fil affiche « hermes-bibliothecaire · via MCP » |
| Nouveaux utilisateurs | Liste dans le code **et** dans les règles (deux endroits), règles publiées par toi |
| Sauvegardes | JSON **hebdomadaire**, gardé **12 semaines**, déposé dans Drive ; en plus copies Google **quotidiennes gardées 7 jours** et PITR |
| Budget | **5 €/mois**, alertes à 50 / 90 / 100 % ; 3 instances au plus ; plafonds d'écriture par jeton |
| Téléphone | **Jeton Drive fourni par la fonction** (pas d'écran Google sur le téléphone) ; le consentement direct reste un repli |
| Jetons | Un secret Secret Manager (`MCP_JETONS`) contenant les **empreintes**, jamais le jeton en clair |
| Audit | Traces illimitées sans contenu ; **copies « avant » effacées après 90 jours** (TTL) |
| Tests sur PR | **Oui**, workflow `tests.yml` (18/10/2026) |

## 3. Écarts trouvés (cahier, code, consignes) et ce que je propose

1. **La couche métier n'est pas que `logique.js`.** Les enchaînements (création d'une affaire avec événement et organisation héritée, suppression en cascade, estampilles `creeLe/modifiePar`) sont écrits dans `js/modules/crm/donnees.js`, qui utilise le SDK navigateur (imports `https://www.gstatic.com/...`) et le cache `etat` de l'écran : inutilisable côté serveur. Réécrire cette orchestration dans les fonctions serait précisément dupliquer des règles. **Proposition** : extraire ces enchaînements en fonctions pures dans `logique.js` (comme `planSuppressionPersonne` l'est déjà), et les faire utiliser par `donnees.js` ET par les fonctions. Les 98 parcours Playwright existants prouvent que l'écran n'a pas régressé.
2. **Les règles Firestore : une règle plus précise ne l'emporte pas sur le joker.** Dans Firestore, si deux blocs correspondent, il suffit qu'un seul autorise. Ajouter un bloc `crm_audit` en lecture seule à côté du joker actuel ne protégerait rien. Le texte proposé (section 5.5) exclut explicitement l'audit du joker.
3. **« Audit écrit avant le succès » (cahier) et « audit écrit même si l'écriture échoue » (tes tests)** : un seul lot atomique écrirait les deux ou aucun. Je retiens un journal en deux temps (section 5.2).
4. **RGPD** : une copie « avant » garde les données d'une personne supprimée. Les copies sont donc dans une collection à part avec expiration à 90 jours.
5. **Cahier** : « `functions/coeur/` » et roadmap : « dossier `mcp/` ». Je retiens **`functions/`**.
6. **Branche** : tu demandes `mcp` à partir de `idees-2-1`. La PR #3 est fusionnée : `main` (870696f) contient les mêmes documents plus le commit de fusion. Je propose de créer `mcp` **à partir de `main`**. L'outil GitHub affiche `merged: false` pour les PR #1, #2 et #3 alors que #1 et #2 sont bien dans `main` : ce champ n'est pas fiable ici, `main` contient `cahier-mcp.md` et fait foi.
7. **Ma copie locale du dépôt est en retard** : `docs/cahier-mcp.md` et `docs/roadmap.md` n'y sont pas ; je les ai lus sur GitHub (`main`). Un `git fetch` sera nécessaire après approbation.
8. **Node 20** : arrêt des fonctions Node 20 prévu le **30/10/2026** (dans 28 jours). On utilise **Node 22** (pris en charge jusqu'au 31/10/2028). Ton README annonce « Node 20 ou plus » : à passer à 22.
9. **`firestore.rules`** : le test D3 compare le fichier au bloc du cahier (section 11.4) et D4 exige « deux `match` ». Modifier les règles impose d'adapter ces deux tests et la section 11.4 du cahier 2.0.
10. **La règle « aucun `package.json` hors de `tests/` » (D4) et « pas de Cloud Function » (D4, README, cahier 11.2)** sont à lever explicitement.
11. **`proprietaire` d'une affaire** vaut `ctx.auteur` : une affaire créée par un agent aurait `proprietaire = "hermes-bibliothecaire"`. Par défaut, je mettrai ton e-mail comme propriétaire (paramètre facultatif pour en choisir un autre). *Réglé en 2.16.1 : l'e-mail de la personne connectée, voir `mcp-clients.md`.*
12. **Export JSON actuel** : il convertit les dates en texte ISO ; ce n'est donc pas un format de restauration direct. La restauration d'un JSON passe par un script qui reconvertit les dates ; la vraie restauration reste celle de Google (copies planifiées, PITR).
13. **Documentation consultée** : le proxy de cette session bloque `firebase.google.com`, `docs.cloud.google.com`, `modelcontextprotocol.io` et le site Hermes. J'ai donc vérifié via GitHub (sources de `firebase-tools`, docs de Hermes sur `main`, spécification MCP) et des recherches ; chaque point non confirmé est marqué **[à confirmer]** et testé par le prototype ou au premier déploiement.

## 4. Architecture retenue et alternatives écartées

**Retenu** : une Cloud Function HTTP 2e génération (`mcp`, Node 22, Paris, 3 instances au plus) = serveur MCP « Streamable HTTP » sans session (chaque appel est indépendant), derrière `https://chevalier-ia-os.web.app/mcp`. Elle vérifie le jeton, applique la couche métier partagée, écrit l'audit, répond. Une seconde fonction `jetonDrive` remet à l'appli un jeton Drive d'1 h. Même dépôt, même fusion sur `main`.

**Écarté** (une phrase chacun) :
- *Serveur sur le Mac ou le VPS* : une machine de plus à surveiller, et ton Mac éteint coupe les agents.
- *1re génération des fonctions* : plus de Node 22, limites plus basses, en voie d'abandon.
- *Écrire dans Firestore avec une clé de compte de service sur chaque client* : une clé qui circule sur des machines, sans règle métier ni audit central.
- *Un jeton Firebase Auth par agent* : les agents ne sont pas des comptes Google ; les règles actuelles ne les accepteraient pas.
- *Serveur sur Cloud Run à part* : même effet, mais deux endroits à déployer ; le cahier impose « un seul déploiement ».
- *n8n comme passerelle* : utile pour d'autres usages, mais n'applique pas `logique.js` ; piste REST « plus tard » du roadmap.

**Sécurité du point d'entrée** [à confirmer] : l'invocation doit être publique côté Google (pas de compte Google pour Hermes) ; la porte est le jeton. Je refuse toute requête avec un en-tête `Origin` inconnu (exigence de la spécification MCP contre les attaques par navigateur) et toute méthode autre que `POST`.

## 5. Contenu technique

### 5.1 Arborescence et modifications

```
functions/                      (nouveau, jamais publié avec le site)
  package.json                  {"type":"module","engines":{"node":"22"}}, versions figées
  package-lock.json
  src/index.js                  exporte mcp et jetonDrive
  src/mcp/serveur.js            protocole MCP (SDK officiel, version figée à l'étape 2 après vérification)
  src/mcp/outils/*.js           un fichier par famille d'outils (lecture, ecriture, suppression, sauvegarde, audit, pieces-jointes)
  src/securite/jetons.js        lecture du secret, empreinte, comparaison à temps constant, droits par outil
  src/securite/limites.js       débit et plafonds
  src/securite/journaux.js      journal sûr (liste blanche de champs)
  src/coeur/operations.js       exécute les « plans » de logique.js avec le SDK d'administration
  src/coeur/audit.js            journal en deux temps, restauration
  src/drive/client.js           Drive côté serveur, jeton de rafraîchissement
  partage/logique.js            COPIE GÉNÉRÉE de js/modules/crm/logique.js (ignorée par git)
scripts/preparer-fonctions.js   copie logique.js vers functions/partage/ (lancé par « predeploy »)
outils/creer-jeton.js           génère un jeton (hors ligne) et l'empreinte à coller dans Secret Manager
outils/autoriser-drive.js       obtient une fois le jeton de rafraîchissement Drive (tu le lances sur ton Mac)
outils/prototype-drive.js       prototype de l'étape 1
outils/restaurer-export.js      réimporte un export JSON (dates reconverties)
docs/plan-mcp.md, docs/branchement-mcp.md
.github/workflows/firebase-hosting.yml   étendu (5.10)
```

**`firebase.json`** : ajouter `"functions": [{ "source": "functions", "codebase": "default", "runtime": "nodejs22", "predeploy": ["node scripts/preparer-fonctions.js"] }]` ; ajouter `"functions/**"`, `"scripts/**"`, `"outils/**"` à `hosting.ignore` (piège n° 1 : sans cela le code serait servi publiquement) ; ajouter la réécriture `{ "source": "/mcp", "run": { "serviceId": "mcp", "region": "europe-west9" } }` (forme **documentée** pour Cloud Run, une fonction 2e génération étant un service Cloud Run ; la forme `function` avec région Paris n'est pas confirmée **[à confirmer]**) ; ajouter l'émulateur `functions` (port 5001).
**Partage de `logique.js` sans copie dans git** : le déploiement des fonctions n'envoie que le dossier `functions/` ; `predeploy` y dépose une copie générée à chaque déploiement et chaque test, ignorée par git, contrôlée par un test (identique octet pour octet). `functions/package.json` déclare `"type":"module"` donc le fichier s'exécute tel quel. Vérifié : `logique.js` n'utilise que `Date`, `Intl`, `Math` (aucune API de navigateur) ; `Intl` avec `Europe/Paris` fonctionne sur Node 22 standard.
**README, cahier 11.2 et `tests/statique.test.js`** : remplacer « plan gratuit, aucune Cloud Function » par « forfait Blaze, une fonction MCP » ; D3 (workflow, ignore), D4 (functions, package.json), arborescence 13.

### 5.2 Journal d'audit (schéma exact)

Deux collections, toutes deux écrites **uniquement** par les fonctions.

`crm_audit/{auditId}` (traces, conservées sans limite, sans contenu de fiches) :

| Champ | Contenu |
|---|---|
| `operationId` | regroupe toutes les écritures d'un même appel (une suppression en cascade = 1 opération, plusieurs lignes) |
| `ordre` | numéro de la ligne dans l'opération |
| `date` | horodatage serveur |
| `acteur`, `jeton` | nom d'acteur et nom du jeton (jamais sa valeur) |
| `via` | `mcp` |
| `outil` | nom de l'outil appelé |
| `collection`, `docId` | document touché |
| `action` | `creer`, `modifier`, `supprimer`, `restaurer` |
| `statut` | `en_cours`, `succes`, `echec` |
| `erreur` | message court en cas d'échec |
| `champsModifies` | liste des noms de champs (pas des valeurs) |
| `parametres` | paramètres reçus, tronqués à 2 000 caractères |

`crm_audit_avant/{auditId}` (même identifiant) : `avant` (copie complète du document avant modification ou suppression, `null` à la création), `apres` (état écrit), `expireAt` (date + 90 jours, règle TTL Google à activer une fois dans la console).

**Garanties** (par appel) :
1. Le jeton est vérifié et le droit à l'outil contrôlé ; un refus va dans les journaux Google (pas dans Firestore, pour qu'un client malveillant ne puisse pas le remplir).
2. Lecture des documents concernés ; le plan est calculé avec `logique.js`.
3. **Lot 1** : lignes d'audit (`en_cours`) + copies « avant ». S'il échoue, rien n'est écrit dans les données et l'appel échoue.
4. **Lot 2** : écritures de données (par paquets de 400, comme l'écran).
5. **Lot 3** : lignes d'audit passées à `succes` (ou `echec` + erreur) avec `apres`.
6. La réponse « succès » n'est envoyée qu'après le lot 3. Si le serveur s'arrête entre 3 et 5, la ligne reste `en_cours` : `lire_audit` la signale (« à vérifier »).

**Restauration** (`restaurer_depuis_audit`, par `operationId`, aperçu par défaut) : en ordre inverse, création annulée = suppression ; modification annulée = remise de `avant` ; suppression annulée = recréation avec le **même identifiant** (les liens `personneId`… restent valides). Refus si le document a changé depuis (`modifieLe` différent de l'audit), sauf `forcer: true`. Chaque restauration écrit elle-même des lignes d'audit. Au-delà de 90 jours la copie n'existe plus : message clair, et la sauvegarde prend le relais.

### 5.3 Outils MCP (liste complète)

Profils : **L** lecteur · **B** bibliothécaire (L + écriture + pièces jointes + sauvegarde) · **C** `claude-code-jerome` (tout). « Audit » = écrit dans `crm_audit`.

| Outil | Paramètres principaux | Effet | Audit | Jetons |
|---|---|---|---|---|
| `qui_suis_je` | — | acteur, profil, outils autorisés, version | non | L B C |
| `chercher` | `texte`, `types[]` | personnes, organisations, affaires (recherche de l'écran, `rechercherSuggestions`) | non | L B C |
| `lire_personne` / `lire_organisation` / `lire_affaire` | `id`, `avecFil` | fiche + notes, événements, activités | non | L B C |
| `lister_affaires` | `etape`, `statut`, `archive`, `personneId`, `organisationId` | liste filtrée (`filtrerAffaires`) | non | L B C |
| `lister_activites` | `affaireId` / `personneId`, `fait`, `enRetard` | activités | non | L B C |
| `lister_documents` | `affaireId?` | tous les documents joints (lien, libellé, Drive ou non) pour contrôler les liens cassés | non | L B C |
| `lire_reglages` | — | offres, listes, étiquettes, réglages | non | L B C |
| `lire_audit` | `acteur`, `docId`, `operationId`, `depuis`, `incompletes` | lignes d'audit (sans les copies) | non | L B C |
| `creer_personne`, `modifier_personne` | champs de la fiche | `nouvellePersonne`/patchs + détection de doublons (refus si doublon, `forcer`) + événement | oui | B C |
| `creer_organisation`, `modifier_organisation` | idem | idem | oui | B C |
| `creer_affaire`, `modifier_affaire` | champs, `proprietaire?` | `nouvelleAffaire`, titre par défaut, organisation héritée, événement ; depuis le 22/10/2026 : plus de paramètre `description` documenté, `creer_*` rend `noteEpingleeId` (la note épinglée de départ, à remplir avec `modifier_note`) | oui | B C |
| `changer_etape` | `id`, `etape`, `montantEncaisse?` | `changementEtape` (événements, statut) | oui | B C |
| `marquer_perdue`, `rouvrir_affaire` | `id`, raison (`mettre_en_pause` supprimé le 22/10/2026) | règles de l'écran | oui | B C |
| `ajouter_encaissement` | `id`, `montant`, `date?` | `ajouterEncaissement` | oui | B C |
| `ajouter_note`, `modifier_note` | liens, `texte` | notes (jamais modifiées automatiquement) | oui | B C |
| `creer_activite`, `terminer_activite` | champs / `id` | `nouvelleActivite`, `activiteFaite` | oui | B C |
| `joindre_lien` | `affaireId` ou `projetId`, `url`, `libelle`, `favori` | `ajouterDocument` (http obligatoire) | oui | B C |
| `retirer_document` | `affaireId`, `index` ou `url` (réalisation étape 4) | retire la pièce (jamais le fichier Drive) | oui | B C |
| `preparer_televersement` | `affaireId`, `contenu`, `mimeType`, `taille` | crée une session de téléversement Drive reprenable, renvoie l'adresse d'envoi et le nom final | oui | B C |
| `joindre_fichier_drive` | `affaireId`, `fileId` | vérifie le fichier (visible par l'appli), le renomme `AAAA-MM-JJ - <affaire> - <contenu>`, ajoute la pièce et un événement | oui | B C |
| `sauvegarder` | — | export complet JSON (même format que « Exporter mes données ») déposé dans le dossier Drive des sauvegardes ; note `dernierExport` | oui | B C |
| `lister_sauvegardes`, `purger_sauvegardes` | `plusAncienQue` | liste ; supprime **uniquement** les fichiers de ce dossier plus vieux que 12 semaines (l'appli ne voit que ses propres fichiers, par construction) | oui | B C |
| `supprimer_note`, `supprimer_activite`, `supprimer_organisation`, `supprimer_personne`, `supprimer_affaire` | `id`, `choix?`, `confirmationNom` | règles d'intégrité 3.10 (refus si l'organisation a encore des personnes ; choix pour les affaires d'une personne) ; **confirmation du nom exigée** comme l'écran (`confirmationValide`) | oui (avec copies) | C |
| `restaurer_depuis_audit` | `operationId`, `apercu`, `forcer` | voir 5.2 | oui | C |

#### Outils du module Devis (24/10/2026, révisés le 25/10/2026)

| Outil | Effet | Profils | Se défait avec `restaurer_depuis_audit` |
|---|---|---|---|
| `lister_devis` | liste des devis avec **les totaux seuls** (HT, TVA, TTC), jamais les lignes ni la marge ; montre aussi `archive`, `archiveLe`, `envoyeLe`, `nombreEnvois` et l'état du PDF | L B C | — |
| `lire_devis` | un devis complet, lignes et **marge visibles**, comme `lister_articles` montre le prix d'achat ; `copie`, `envois` (historique des envois par e-mail), état du PDF (jamais le chemin du fichier) | L B C | — |
| `obtenir_pdf_officiel_devis` | **seulement si l'utilisateur demande le PDF** : le PDF OFFICIEL d'un devis finalisé, par un **lien signé de 5 minutes** (`lien`) et le lien du devis dans l'application (`lienApplication`) ; sans droit de lecture du stockage, seul le lien de l'application est rendu, avec la raison ; avertissement si le devis n'est plus en cours ; refusé pour un brouillon ou si le PDF n'est pas prêt (« arrête-toi et dis-le ») ; ne fabrique rien ; jamais transmis sans montrer le destinataire et un « oui » clair (29/10/2026, option A) | L B C | — |
| `lire_reglages_devis` | réglages du module Devis (marge des articles, **marge par défaut des nouveaux devis `margeDevis`** (le mode de calcul n’est jamais montré à l’assistant), TVA, validité, « Mon entreprise » avec les **méthodes de paiement**) et familles d'articles, lecture seule | L B C | — |
| `creer_devis_brouillon` | (chaque ligne accepte `prixVente` facultatif, 28/10/2026 : euros HT par unité, 2 décimales ; la marge de la ligne s'ajuste comme à l'écran, le prix d'achat ne change jamais ; refusé pour un texte, un article sans prix d'achat ou un prix impossible ; même chose dans `modifier_devis_brouillon`) crée un brouillon, l'affaire est facultative (`finaliser_devis` l'exige) (`copie` : e-mails en copie, mêmes règles que l'écran, 10 au plus ; `nom` : nom interne du devis, jamais imprimé ; la **marge globale du devis** des réglages, 20 % par défaut, est appliquée d'office comme à l'écran) | B C | oui |
| `modifier_devis_brouillon` | modifie un brouillon seulement (refusé si le devis est finalisé), `copie` comprise ; `affaireId` pose l'affaire d'un brouillon créé sans affaire | B C | oui |
| `modifier_lignes_devis` | 1 à 30 opérations (modifier, supprimer, ajouter, ajouterSection, renommerSection, supprimerSection) sur les lignes et sections d'un brouillon, désignées par leur numéro (« 1.2 ») lu dans le devis d'avant l'appel ; `attendu` obligatoire pour modifier et supprimer ; tout ou rien, UNE ligne de journal (un `operationId`), dans une transaction qui relit le devis ; `changementImportant` calculé par le serveur ; annotation « destructif » ; pas de ligne libre, de sous-section ni de déplacement (30/10/2026, PR A2) | B C | oui |
| `annuler_derniere_modification_devis` | défait la dernière modification d'un brouillon avec la logique de `restaurer_depuis_audit` (sans `forcer`), UN seul niveau, et répond en une phrase ce qui a été remis ; refus : devis finalisé, rien à annuler, déjà annulé, dernière modification faite à l'écran, devis créé (voir `supprimer_devis`), devis changé depuis ; l'annulation s'écrit au journal sous son propre nom (action « restaurer ») ; annotation « destructif » ; `restaurer_depuis_audit` reste réservé à Claude Code (30/10/2026, PR A3) | B C | oui |
| `creer_devis_depuis_modele` | crée un NOUVEAU brouillon à partir d'un devis lisible (le modèle n'est jamais écrit) : lignes aux prix du catalogue d'aujourd'hui (ancienne quantité), `ajustements` (opérations de `modifier_lignes_devis`, numéros du modèle, tout ou rien) ; ni adresses, ni destinataires, ni chantier, ni acomptes, ni remise ; les lignes dont l'article est désactivé ou supprimé et les lignes libres ne sont pas copiées (`aReviser`) ; journal : action « creer » (annulation refusée, `supprimer_devis`) ; pas « destructif » (30/10/2026, PR N1) | B C | oui |
| `nouvelle_version_devis` | crée le brouillon suivant d'un devis finalisé, envoyé ou refusé (même numéro, version + 1) : la voie pour corriger un devis finalisé | B C | oui (supprime ce brouillon) |
| `archiver_devis` | archive (devis finalisé jamais envoyé, signé ou refusé) ou désarchive | B C | oui |
| `enregistrer_envoi_devis` | ajoute un envoi (destinataires, copie, et `origine` facultative : `brouillon_logiciel` ou `hors_logiciel`, 29/10/2026) à l'historique d'un devis « Envoyé » ; les deux dates sont gardées en cas de renvoi ; n'envoie rien | B C | oui |
| `modifier_destinataires_devis` | change le destinataire (1 à 10 adresses) et, si donnée, la copie d'un devis **finalisé ou envoyé** (option A de Jérôme, 29/10/2026) : seuls ces deux champs sont écrits, le journal garde l'avant et l'après, le geste ne se défait PAS avec `restaurer_depuis_audit` (le devis est finalisé : il suffit de rappeler l'outil avec l'ancienne adresse) ; refusé pour un brouillon, un devis signé, refusé ou remplacé ; l'assistant doit demander l'adresse à l'utilisateur. La fonction `devisModifierDestinataires` existe chez Jérôme et chez les clients | B C | non (rappeler l'outil avec l'ancienne adresse) |
| `recalculer_montants_affaires` | recalcule le montant affiché des affaires d'après leurs devis (`docs/montant-affaire.md`) : aperçu (liste avant, après) puis code, n'écrit que `montantDevisHt`, `montantDevisNature` et `montantDevisDetail`, 50 affaires par appel, idempotent (30/10/2026) | C | non (relançable) |
| `preparer_email` | outil **générique** `{ type, id }` (type « devis » seul pour l'instant ; fonction `preparerBrouillonEmail` et registre `SOURCES_EMAIL` de `functions/src/coeur/brouillon-email.js` : facture ou autre = une ligne de plus) ; demande à n8n de créer un **BROUILLON** d'e-mail (PDF joint) dans la messagerie de l'utilisateur, comme le bouton « Préparer l'e-mail » ; destinataires, objet, texte et pièce jointe sont fixés par le serveur, **jamais écrits par l'assistant** ; **n'envoie rien**, l'utilisateur relit et envoie lui-même ; répond « pas encore branché » si l'espace n'a pas son workflow n8n (29/10/2026) | B C | **non** (le brouillon créé reste, et `restaurer_depuis_audit` refuse l'opération pour un devis finalisé) |
| `supprimer_devis` | supprime un **brouillon** (ne touche jamais aux documents de l'affaire ni aux fichiers, « Devis brouillon … .pdf » compris) ; **aperçu puis code** | C seulement | oui |
| `finaliser_devis` | attribue le numéro, fige les prix, verrouille la version ; **aperçu puis code** | C seulement | **non** |
| `changer_statut_devis` | marquer envoyé, accepter (Signé) ou refuser, mêmes transitions que l'écran ; `marquer_envoye` **direct**, `accepter` et `refuser` en **aperçu puis code** | C seulement | **non** |

- **Une seule logique** : `nouvelle_version_devis`, `archiver_devis`, `enregistrer_envoi_devis`, `changer_statut_devis`, `supprimer_devis` et `finaliser_devis` appellent les fonctions de `functions/src/coeur/devis.js` que les fonctions appelables de l'écran utilisent (`devisNouvelleVersion`, `devisArchiver`…). Chacune est une transaction unique qui écrit la donnée et sa ligne de journal (`crm_audit` + `crm_audit_avant`, canal `mcp`).
- **Aperçu puis code** (finaliser, accepter, refuser, supprimer ; `marquer_envoye` s'exécute directement, journal écrit, non restaurable) : le premier appel ne change rien et rend un **code** et un résumé ; le second appel, avec ce code, écrit. Le code est **lié à l'empreinte du devis** (si le devis change entre les deux, il ne marche plus), **expire au bout de 5 minutes** et ne sert **qu'une fois**. Cela force l'assistant à montrer l'opération à l'humain.
- **Limite connue** : une finalisation et un changement de statut ne se défont **pas** avec `restaurer_depuis_audit` (un numéro attribué ne se reprend pas, le statut est une trace). Le refus propose la voie de secours, `nouvelle_version_devis`. Les autres opérations sur un devis (création, modification d'un brouillon, nouvelle version, archivage, envoi enregistré, suppression d'un brouillon) se restaurent.
- **Profils, noir sur blanc** : `enregistrer_envoi_devis` (bibliothécaire et Claude Code) exige un devis **déjà « Envoyé »** ; passer le devis à « Envoyé » (`changer_statut_devis` avec `marquer_envoye`) est **réservé au profil Claude Code**. Un bibliothécaire ne peut donc enregistrer un envoi que sur un devis que Claude Code ou l'écran a déjà marqué envoyé.
- **Plafonds et codes** : un code faux ou expiré ne coûte aucune écriture ; le plafond d'écriture est réservé après un code valable (s'il est atteint, le code est déjà consommé : refaire un aperçu). `supprimer_devis` n'émet aucun code quand le plafond de suppressions du jour est atteint (`depassePlafond: true`).
- **Restauration d'un devis supprimé** : refusée si la racine a déjà un brouillon ou un devis de même version (sinon deux devis finalisés pourraient porter le même numéro) ; voie de secours : `nouvelle_version_devis`. Elle peut aussi entrer en conflit avec l'affaire modifiée depuis (`forcer` écrase les documents ajoutés entre-temps).
- **Garantie « aucun e-mail ne part tout seul » (29/10/2026)** : aucun outil n'envoie d'e-mail, aucune portée d'envoi Gmail n'existe dans le code (test `devis-garantie-email`). Le logiciel ne fait que **préparer un brouillon** (`preparer_email`) que l'utilisateur relit et envoie lui-même. La règle « n'envoie jamais d'e-mail, ne refais jamais un PDF, arrête-toi si le PDF officiel manque, dis d'ouvrir son brouillon » est ajoutée à la description de **tous** les outils dont le nom contient `devis` (`functions/src/mcp/outils/garantie.js`) : c'est le socle en dur (lisible, non modifiable), pas une consigne configurable. Elle ne peut pas empêcher un connecteur Gmail propre à l'assistant de l'utilisateur (voir `docs/deploiement-client.md`).

### 5.3 bis Couverture MCP vs écran (révision du 25/10/2026)

Relevé des fonctions de l'écran et de l'outil MCP qui les couvre. « manque » = aucun outil ; les trous simples ont été corrigés dans la même révision (voir la dernière colonne), les autres sont listés plus bas, non codés. Tous les outils d'écriture passent par le journal (`crm_audit`), sauf `valider_proposition` et `refuser_proposition` (la décision est écrite dans la proposition elle-même, avec qui et quand).

| Fonction de l'écran | Outil MCP | Remarque |
|---|---|---|
| Recherche globale | `chercher` | nom, 2 lettres au moins |
| Personnes : fiche, créer, modifier, archiver, supprimer | `lire_personne`, `creer_personne`, `modifier_personne` (`archive`), `supprimer_personne` | |
| Personnes : liste avec filtres (étiquette, source, ville, propriétaire, archivées) | manque | seulement `chercher` par nom |
| Personnes : « opposition à la prospection », « e-mail envoyé » | manque | |
| Organisations : fiche, créer, modifier, archiver, supprimer | `lire_organisation`, `creer_organisation`, `modifier_organisation`, `supprimer_organisation` | |
| Organisations : liste avec filtres | manque | seulement `chercher` |
| Affaires : liste filtrée | `lister_affaires` | étape, statut, archivées, retard, sans action |
| Affaires : fiche, créer, modifier, étape, perdue, rouvrir, supprimer | `lire_affaire`, `creer_affaire`, `modifier_affaire`, `changer_etape`, `marquer_perdue`, `rouvrir_affaire`, `supprimer_affaire` | |
| Projets : liste, fiche, créer (aussi depuis une affaire), modifier, phase, terminer, rouvrir, archiver, supprimer | `lister_projets`, `lire_projet`, `creer_projet`, `creer_projet_depuis_affaire`, `modifier_projet`, `changer_phase_projet`, `terminer_projet`, `rouvrir_projet`, `archiver_projet`, `supprimer_projet` | |
| Projets : lier ou délier un projet et une affaire | manque (seule `creer_projet_depuis_affaire` lie) | |
| Livrables : ajouter, fait / pas fait | `ajouter_livrable_projet`, `terminer_livrable_projet` | modifier, déplacer, supprimer un livrable : manque |
| Modèles de projets | `lister_modeles_projet` | créer, modifier, supprimer un modèle : manque |
| Factures de projet : ajouter, payée, abandonnée | `ajouter_facture`, `marquer_facture_payee`, `abandonner_facture` | modifier, remettre à payer, supprimer une facture : manque |
| Notes : ajouter, modifier, supprimer | `ajouter_note`, `modifier_note`, `supprimer_note` | épingler / désépingler une note : manque |
| Activités : lister, créer, faite, supprimer | `lister_activites`, `creer_activite`, `terminer_activite`, `supprimer_activite` | modifier / reporter une activité : manque |
| Documents et liens | `lister_documents`, `joindre_lien`, `retirer_document` | modifier le libellé ou le favori d'un lien : manque (retirer puis rajouter) |
| Réglages du CRM (étapes, phases, options, offres, secteurs, sources, étiquettes, indicateurs, filtres enregistrés) | `lire_reglages` (lecture) | **aucune écriture** : voulu, ces réglages se changent à l'écran ; filtres enregistrés et objectifs ne sont pas lisibles |
| Bordereau : articles, ouvrages, recherche | `lister_articles`, `chercher_article`, `rechercher_article_par_phrase` (lecture, 28/10/2026 : les mots de l'utilisateur -> article du bordereau, avec décision `utiliser` / `proposer` / `demander`, quantité et prix dits ; prix de vente HT seulement, jamais prix d'achat ni marge ; règles lues dans `devis_vocabulaire`, absente ou vide = catalogue seul ; `limite` 1 à 5, défaut 3, jamais moins que les articles cités par `question`), `creer_article`, `modifier_article`, `desactiver_article` (`reactiver: true`), `enregistrer_reponse_vocabulaire` (écriture journalisée B C, 28/10/2026 : la réponse de l'utilisateur à une question de `rechercher_article_par_phrase` devient une règle de `devis_vocabulaire` ; `phrase` + `reponse` `confirme` / `autre` / `aucun` + `articleId` ; **pas de code de réponse** : le serveur recalcule les candidats de la phrase, `confirme` n'est accepté que pour un article qui aurait été proposé, `autre` seulement si une question a dû être posée, donc le pire cas est une règle `a_confirmer` ; activation seule après 2 confirmations de jours différents sans contradiction, par `decisionApprentissage` du moteur ; une confirmation vers un autre article contredit la règle (conflit si elle était active) ; `aucun` n'écrit rien ; plafonds 500 actives / 300 à confirmer ; défaite avec `restaurer_depuis_audit`, qui supprime la règle créée) | pas de suppression d'article (jamais, comme à l'écran) |
| Familles d'articles | famille lisible avec `lire_reglages_devis` ; écriture : manque | l'écran écrit les familles **sans journal** |
| Réglages du module Devis | `lire_reglages_devis` (ajouté le 25/10/2026) ; écriture : manque | l'écran les écrit **sans journal** |
| Devis : liste, fiche, brouillon, copie, finaliser, statut, nouvelle version, archiver, envoi, supprimer | voir le tableau ci-dessus | PDF du devis (fabrication, lien) et brouillon Gmail : écran seulement, hors MCP |
| Automatisations : propositions, workflows | `lister_propositions`, `lire_proposition`, `valider_proposition`, `refuser_proposition`, `lister_automatisations` | « Classer sans suite » : écran seulement, voulu (voir `securite-et-pannes.md`) ; historique des exécutions : manque |
| Journal des modifications et annulation | `lire_audit`, `restaurer_depuis_audit` | couvre `devis_devis` et `devis_articles` ; familles et réglages Devis n'y sont pas (écrits sans journal) |
| Veille (sources, contenus, résumés) | manque | module en lecture seule à l'écran, aucun outil MCP déclaré |
| Maintenance (tableau de bord) | manque | idem |
| Accueil (indicateurs, tâches du jour) | en partie : `lister_activites` (en retard, à faire), `lister_affaires` (`sansAction`) | indicateurs chiffrés et objectifs : manque |
| Sauvegarde / export JSON | manque | écran seulement (Réglages) |

**Trous plus gros, non codés** (à décider) : listes filtrées de personnes et d'organisations ; réglages du CRM et du module Devis en écriture (et leur journalisation côté écran) ; modification et suppression des livrables, des factures, des modèles de projet ; modifier une activité ; épingler une note ; lier ou délier un projet ; lecture de la Veille, de la Maintenance, de l'historique des automatisations et des indicateurs de l'Accueil.

**Trous corrigés dans la révision du 25/10/2026** : `lire_devis` et `lister_devis` exposent `copie`, `envois`, `archiveLe`, `nombreEnvois` et l'état du PDF (sans son chemin) ; `lire_reglages_devis` ajouté ; la description de `modifier_devis_brouillon` renvoie vers `nouvelle_version_devis` au lieu de « depuis l'écran » ; `restaurer_depuis_audit` sait défaire un archivage et un envoi enregistré sur un devis finalisé (il refusait tout devis qui n'était plus un brouillon).

Collisions de règles : l'écran impose la confirmation par le nom pour une suppression ; les outils font de même, pour qu'un agent ne puisse pas supprimer « par erreur d'un seul paramètre ».
**Deux niveaux de protection pour Hermes** : (1) côté Hermes, `tools.include` liste exactement les outils du profil B ; (2) côté serveur, l'empreinte du jeton porte son profil : un outil hors profil est refusé même si Hermes est mal configuré.

> **Ajout du 09/10/2026 : seconde porte OAuth (connexion Google)** pour l'appli Claude du téléphone et claude.ai, qui ne peuvent pas envoyer un jeton en en-tête. Les jetons `cia_…` décrits ci-dessous ne changent pas. Détail, décisions et sécurité : `mcp-oauth.md`.

### 5.4 Authentification, jetons, débit, journaux

- **Génération** : tu lances `node outils/creer-jeton.js hermes-bibliothecaire bibliothecaire` sur ton Mac (hors ligne). Il affiche **une seule fois** un jeton de 256 bits (`cia_…`) et la ligne `{ "jeton": "hermes-bibliothecaire", "acteur": "hermes-bibliothecaire", "profil": "bibliothecaire", "empreinte": "<sha256>", "actif": true, "creeLe": "…" }` que tu colles dans le secret `MCP_JETONS` (nouvelle version). Je ne génère aucun jeton à ta place.
- **Stockage** : le secret ne contient que des empreintes. Lu à l'exécution par l'API Secret Manager (cache 60 s) : une révocation agit en moins d'une minute, sans redéploiement. Le compte d'exécution de la fonction reçoit « Accesseur de secrets » sur ce seul secret (toi, dans la console).
- **Comparaison** : à temps constant ; le jeton est transmis en `Authorization: Bearer`, jamais dans l'adresse.
- **Rotation** : ajouter une 2e ligne pour le même acteur, mettre à jour le client, puis passer l'ancienne à `actif: false`. Garder au plus 6 versions actives du secret (au-delà, ~0,06 $/version/mois).
- **Révocation** : `actif: false` (< 1 min). **Coupure d'urgence** : désactiver la version du secret (toute requête est refusée) ou retirer l'invocation publique du service dans Cloud Run.
- **Débit** : par jeton, 120 requêtes/min, 500 écritures/heure, 50 suppressions/jour (par document supprimé) (valeurs modifiables dans l'entrée du jeton) ; compteurs gardés dans `mcp_limites` (collection fermée à l'appli par les règles) ; dépassement = erreur 429 explicite. 3 instances au plus bornent le reste.
- **Journaux Google** : on enregistre date, nom du jeton, acteur, outil, `operationId`, durée, statut, code d'erreur. **Jamais** : le jeton ou l'en-tête d'autorisation, les paramètres, les contenus de fiches (noms, e-mails, notes), les réponses, les jetons Drive. Un test vérifie, en espionnant la sortie, que le jeton n'y apparaît pas même lors d'une erreur.

### 5.5 Règles Firestore proposées (texte exact, que tu valides et publies)

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

Les fonctions utilisent le SDK d'administration, qui contourne les règles : elles n'en dépendent pas. Les nouveaux tests A vérifient pour `crm_audit` (lecture permise aux deux comptes, toute écriture refusée), `crm_audit_avant` et `mcp_limites` (tout refusé), et que les neuf collections existantes se comportent comme avant (45 cas actuels inchangés). Ajouter Paul = ajouter son e-mail dans `compteAutorise()` et dans `COMPTES_AUTORISES` (une Pull Request), puis republier les règles. Aucune modification de `crm_prospects` ni de son accès. **Je ne publie rien.** Tu colles ce texte dans la console (Firestore Database → Règles → Publier). Aucun ordre obligatoire avec le déploiement des fonctions ; à publier **avant** la première écriture d'un agent.

### 5.6 Sauvegardes et récupération

- **[Remplacé le 04/10/2026 : la base va directement dans Backblaze, chiffrée, sans passer par Drive ; voir `roadmap.md`, « Sauvegardes : décisions du 04/10/2026 »]** **Sauvegarde JSON (bibliothécaire, hebdomadaire)** : outil `sauvegarder` → fichier `chevalier-ia-os-AAAA-MM-JJ.json` dans le dossier Drive `Jerome IA OS Backups` (créé par la fonction à la première utilisation, privé), puis `purger_sauvegardes` (12 semaines). Le JSON inclut les 7 collections `crm_*` comme l'export de l'écran ; `crm_audit` est exporté dans un fichier à part.
- **Restauration d'un JSON** : `outils/restaurer-export.js` (testé sur émulateur : sauvegarde → effacement → restauration → comparaison).
- **Réalisation (03/10/2026)** : récupération à un moment précis **activée** et sauvegardes quotidiennes **activées par Jérôme dans la console, avec 98 jours de conservation** au lieu des 7 prévus (il peut s'absenter deux mois ; le stockage supplémentaire est négligeable ; 98 jours est le maximum de Google et reste proche des 90 jours des copies d'audit). Aucun essai de restauration fait.
- **Copies planifiées Google (quotidiennes, 7 jours)** [commande à confirmer au moment de l'étape] : `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d`. Tu le lances dans Cloud Shell (le terminal de la console) ; une restauration crée une **nouvelle** base, jamais d'écrasement.
- **Récupération à un instant donné** : console Google Cloud → Firestore → base `(default)` → Reprise après sinistre / Récupération à un instant donné → Activer (7 jours, ~0,15 $/Go/mois ; ta base fait quelques Mo : centimes).
- **TTL de l'audit** : console → Firestore → Index/TTL → créer une stratégie TTL sur `crm_audit_avant`, champ `expireAt`.
- **Test de restauration** : jamais sur la vraie base ; sur émulateur pour le JSON, et restauration d'une copie Google vers une base de test **à ta demande** pendant la recette.

### 5.7 Pièces jointes

**Modèle** (sur l'affaire uniquement, tableau `documents` existant, compatible avec les entrées actuelles `{libelle, url}`) :
`{ id, libelle, url, source: "lien" | "drive", driveFileId?, nomFichier?, mimeType?, taille?, ajouteLe, ajoutePar, via? }`. Une même pièce peut figurer sur plusieurs affaires (même `driveFileId`) sans copie du fichier. `logique.js` gagne `ajouterDocument` étendu, `nomFichierPieceJointe` (pur, testé) et l'événement `document_ajoute` (type à ajouter à la liste 3.7 du cahier).
**Nommage** : `AAAA-MM-JJ - <affaire> - <contenu>.<extension>` ; date du jour à Paris ; l'affaire est nettoyée des caractères interdits (`/ \ : * ? " < > |`) et limitée à 60 caractères ; « contenu » = ce que tu saisis (par défaut `document`) ; en cas de doublon, ` (2)`. Le nom est figé à l'envoi.
**Dossiers Drive** : `Jerome IA OS Attachments` (et `Jerome IA OS Backups`) créés par la fonction à la première utilisation (même application Google que l'appli, donc visibles des deux côtés), identifiants gardés dans `crm_parametres/drive`. Tu peux les renommer et les déplacer ; il ne faut pas les supprimer. Privés (aucun partage). **Gros fichiers** : jamais par la fonction ; téléversement reprenable par morceaux, directement vers Drive.
**Parcours sur téléphone** : fiche de l'affaire → G-Drive → « Téléverser un fichier » (sélecteur d'iOS : photos, fichiers) → choix du « contenu » → barre de progression → la pièce apparaît. En coulisse : l'appli demande à `jetonDrive` un jeton d'1 h (la fonction vérifie ta connexion Firebase : e-mail vérifié et autorisé), puis envoie le fichier directement à Drive.
**Écran de consentement Google** : une seule fois, **sur ton Mac**, via `outils/autoriser-drive.js` (portée `drive.file`) ; plus rien sur le téléphone. Application « externe », à publier **« En production »** (en « Test », le jeton expire au bout de 7 jours : documenté par Google) ; `drive.file` est annoncée comme portée non sensible **[à confirmer dans la console]**. Le consentement direct sur le téléphone reste le repli si le prototype échoue.
**À vérifier sur ton iPhone** : le sélecteur de fichiers dans l'appli installée (`Permissions-Policy` de `firebase.json` interdit la caméra : le choix « Prendre une photo » doit quand même fonctionner) ; recette section 9.

### 5.8 Prototype Drive (étape 1, avant tout le reste)

Script local (`outils/prototype-drive.js`) que **tu** lances sur ton Mac, avec un dossier de test `ZZ prototype Chevalier IA OS` (rien de réel). Ce que ça teste : (A) obtenir un jeton de rafraîchissement avec la portée `drive.file` seule ; (B) créer un dossier et téléverser un fichier côté serveur, visibles et privés dans ton Drive ; (C) un second jeton d'1 h obtenu plus tard par le même client retrouve, renomme et lit ce fichier (visibilité commune) ; (D) la session de téléversement reprenable accepte-t-elle des morceaux **sans** en-tête d'autorisation (une source tierce affirme que non ; non confirmé par la doc officielle) ; (E) un envoi depuis un navigateur (page locale) de 50 Mo par morceaux fonctionne (CORS) ; (F) l'écran de consentement est bien « En production ».
**Critères de réussite** : A, B, C, E et F vrais ; D connu. **Replis** : si D est faux, pour les agents : (1) la fonction relaie les fichiers jusqu'à ~20 Mo (limite d'une requête, base64 compris) ; (2) au-delà, l'agent dépose le fichier dans Drive autrement et `joindre_lien` crée la pièce par lien (consigne de repli). Si C est faux : on abandonne `drive.file` partagé, les pièces passent **par lien seulement**.

**Résultat (02/10/2026) : A, B, C, D, E vrais, F (console) confirmé ; aucun repli déclenché.** Détail dans `prototype-drive.md`. Reste le contrôle F à 8 jours.

**Étape 2, écarts de réalisation (02/10/2026)** : SDK MCP figé en **1.32.0** (avec `firebase-functions` 7.4.0, `firebase-admin` 14.5.0, `@google-cloud/secret-manager` 7.1.1, `zod` 4.6.5) ; format du secret `MCP_JETONS` : une entrée JSON par ligne (un tableau JSON est aussi accepté) ; `predeploy` et `scripts/preparer-fonctions.js` sont reportés à l'étape 3 (premier besoin de `logique.js` côté serveur) ; les limites de débit arrivent avec l'écriture (étape 4). Guide : `mcp-etape-2.md`.

**Étape 3, écarts de réalisation (03/10/2026)** : étape limitée à la **lecture** ; l'extraction des enchaînements d'écriture de `donnees.js` vers `logique.js` est reportée à l'étape 4 (là où elle sert, et pour ne pas toucher l'écran sans nécessité) ; `predeploy` et `scripts/preparer-fonctions.js` sont faits ; l'accès aux données passe par une petite interface (`liste`, `document`) réalisée pour Firestore et pour la mémoire (tests) ; `lire_audit` est en service sur une collection encore vide. Guide : `mcp-etape-3.md`.

**Étape 4, écarts de réalisation (03/10/2026)** : écriture, suppression, audit, restauration et plafonds livrés ; l'extraction des plans d'écriture vers `logique.js` (reportée de l'étape 3) est faite, avec les 98 parcours rejoués. Écarts : (1) `crm_audit` ne garde **pas** les paramètres reçus (contenu de fiches conservé à vie : contraire à la décision « sans contenu ») mais seulement leurs noms (`parametresRecus`) ; les valeurs, tronquées à 2 000 caractères, vont dans `crm_audit_avant` avec l'expiration à 90 jours ; (2) la restauration compare le document **entier** à la copie « après » (et non `modifieLe`) ; (3) contrôle de concurrence ajouté : chaque paquet d'écriture est une transaction qui vérifie l'état lu au départ ; (4) plafond de requêtes par minute **en mémoire de l'instance** (au pire 3 × 120), écritures par heure et suppressions par jour dans `mcp_limites` ; « une écriture » = un appel d'outil ; (5) `creeLe`/`modifieLe` portent l'heure de la fonction, `via: mcp` marque la création ; (6) `retirer_document` prend `index` ou `url` (pas d'identifiant de document avant l'étape 7) ; `supprimer_note` et `supprimer_activite` n'exigent pas de confirmation par le nom (l'écran non plus) ; (7) les outils vérifient l'existence des liens, étiquettes, offres et étapes (l'écran non) ; (8) version de l'appli inchangée (2.0.0), la 2.0.1 étant prise par la branche `mcp`. Les règles Firestore 5.5 sont dans `firestore.rules` (publiées par Jérôme, ordre : règles puis fusion) ; le TTL de 90 jours se crée dans la console. Guide : `mcp-etape-4.md`. **Résultat (03/10/2026) : validée en réel**, essai de 15 vérifications par `outils/essai-ecriture.mjs` sur le serveur déployé, règles publiées, TTL créé.

### 5.9 Tests (émulateurs Auth, Firestore, Functions ; `cd tests && npm test`)

Nouveaux fichiers : `tests/fonctions.test.js` (couche métier, audit, outils), `tests/jetons.test.js`, `tests/logique-partagee.test.js` (importe la copie de `functions/partage/` et rejoue des cas de `logique.js` sous Node 22), `tests/regles.test.js` étendu. Un test nommé par comportement :

1. **Audit écrit même si l'écriture échoue** (on fait échouer le lot 2 ; la ligne d'audit existe avec `statut: echec`).
2. **Rien d'écrit si le lot 1 échoue** (pas d'audit = pas de donnée).
3. **Acteur correct** : un jeton `hermes-bibliothecaire` écrit `auteur: hermes-bibliothecaire`, `via: mcp` dans le fil et l'audit ; un jeton Claude Code écrit le sien.
4. **Jeton révoqué refusé** (`actif: false` pris en compte après expiration du cache) ; jeton inconnu, absent, mal formé refusés ; aucun détail sur la raison dans la réponse.
5. **Droits par profil** : le bibliothécaire ne peut ni supprimer ni restaurer (refus côté serveur, même si l'appel arrive).
6. **Suppression récupérable** : supprimer une personne avec choix « affaires » puis `restaurer_depuis_audit` redonne exactement les mêmes documents (mêmes identifiants, mêmes liens).
7. **Restauration refusée si le document a changé depuis** ; `forcer` la permet.
8. **Copie « avant » expirée** : message clair.
9. **Doublons** : créer une personne de même nom/e-mail est refusé (`trouverDoublonsPersonne`), comme sur l'écran ; `forcer` documenté.
10. **Intégrité** : supprimer une organisation qui a des personnes est refusé (`verifierSuppressionOrganisation`) ; la confirmation par le nom est exigée.
11. **Règles de `logique.js` appliquées** : changement d'étape (événements, statut, archive en « Facture payée »), perdue/rouvrir (la pause a été supprimée le 22/10/2026), encaissement, dates Paris ; **test de parité** : mêmes scénarios exécutés par les fonctions et par les fonctions pures de l'écran donnent les mêmes documents.
12. **Copie de `logique.js` identique à la source** (octet pour octet).
13. **Débit** : le 121e appel d'une minute reçoit 429 ; le plafond de suppressions est respecté.
14. **Journaux sans secret** : aucune sortie ne contient le jeton, l'en-tête, des contenus de fiches.
15. **Origin et méthode** : `Origin` inconnu refusé, `GET` refusé.
16. **Nommage des pièces jointes** (caractères interdits, doublon, extension) ; **`joindre_lien`** refuse un lien sans `http`.
17. **Règles Firestore** : voir 5.5 ; les 45 cas actuels restent verts.
18. **Export/restauration** : sauvegarde → effacement → `restaurer-export.js` → identique (dates comprises).
19. **Contrôles statiques adaptés** : `functions/**` exclu de la publication ; aucune clé ni jeton dans le dépôt (analyse de motifs `cia_`, clés privées, `client_secret`) ; `crm_prospects` jamais référencé ; Node 22 ; workflow étendu.
20. **Parcours Playwright (existants, 98)** inchangés ; nouveau : ajout d'un lien, téléversement simulé (Drive remplacé par un faux serveur local) sur ordinateur et téléphone.

**Ce que les émulateurs ne prouvent pas** (donc recette manuelle) : Drive réel, Secret Manager réel, la réécriture Hosting, le déploiement, le consentement Google, l'iPhone, Hermes réel. Aucun test n'utilise de vraies données ; le projet de test reste `demo-chevalier-ia-os`.

### 5.10 Déploiement, rôles Google et workflow

**Workflow étendu** (`.github/workflows/firebase-hosting.yml`) : à la suite de l'étape actuelle (action Hosting inchangée, pour ne pas toucher à ce qui marche), une étape préalable déploie **d'abord** les fonctions (`npx firebase-tools@15.32.0 deploy --only functions --project chevalier-ia-os --non-interactive`, identifiants écrits dans un fichier temporaire à partir du même secret), puis Hosting (qui contient la réécriture vers la fonction). Si les fonctions échouent, Hosting n'est pas déployé. Les règles Firestore restent **hors** déploiement (comme aujourd'hui). Ce n'est pas un `firebase deploy` à la main : il tourne dans le workflow, déclenché par ta fusion sur `main`.

**Rôles Google du compte de service du secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS`** [liste à confirmer au premier déploiement ; je ne peux pas lire ta console]. Page : console Google Cloud → projet `chevalier-ia-os` → **IAM et administration → IAM**, ligne du compte `…@chevalier-ia-os.iam.gserviceaccount.com` créé pour GitHub, crayon « Modifier le compte principal » → « Ajouter un autre rôle ». Rôles probables à ajouter :
1. **Administrateur Cloud Functions** (`roles/cloudfunctions.admin`).
2. **Utilisateur du compte de service** (`roles/iam.serviceAccountUser`) — idéalement accordé seulement sur le compte d'exécution des fonctions (IAM → Comptes de service → ce compte → Autorisations → Accorder l'accès).
3. **Administrateur Cloud Run** (`roles/run.admin`) : un service Cloud Run « public » demande de régler son invocation.
4. **Rédacteur Artifact Registry** (`roles/artifactregistry.writer`) et l'accès au bucket de sources des fonctions : demandés selon les messages d'erreur du premier déploiement.
Je procède **un rôle à la fois** : le déploiement échoue avec le rôle manquant nommé, tu l'ajoutes, on relance. Le déploiement lit les secrets **à l'exécution** (pas de liaison au déploiement), donc **pas** de rôle d'administration de secrets pour le workflow.
**APIs à activer** (console → API et services → Bibliothèque) : Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Google Drive. Elles ne coûtent rien tant qu'on ne s'en sert pas.
**Nettoyage des images** : activer une stratégie de suppression des anciennes versions dans Artifact Registry (sinon quelques centimes qui s'accumulent) **[à confirmer]**.

**Ordre des étapes, une Pull Request chacune** (j'ai avancé le déploiement : c'est la partie la plus risquée) :

| # | Pull Request | Ce que je fais | Ce que tu fais (console / Mac) | Retour arrière |
|---|---|---|---|---|
| 0 | Plan | branche `mcp`, `docs/plan-mcp.md`, roadmap | relire, fusionner | revert |
| 1 | Prototype Drive | `outils/prototype-drive.js`, `autoriser-drive.js`, doc | activer l'API Drive ; écran de consentement « externe » puis « En production » ; créer l'identifiant OAuth « application Web » (URI de redirection `http://localhost:8085/`) ; lancer les scripts | supprimer l'identifiant OAuth ; rien n'est déployé |
| 2 | Squelette des fonctions | `functions/`, `firebase.json`, workflow étendu, `qui_suis_je`, jetons, tests statiques, README | APIs ; rôles du compte de service un par un ; secret `MCP_JETONS` (créé avec `creer-jeton.js`) + accès au compte d'exécution ; budget 5 € ; fusion ; essai `curl` | revert de la PR ; supprimer le service `mcp` dans Cloud Run (le CLI ne supprime pas seul) |
| 3 | Couche métier + audit + lecture | extraction dans `logique.js`, `donnees.js` adapté, `coeur/`, outils de lecture, tests 11 et parité | relancer `npm test` ; fusionner | revert |
| 4 | Écriture, suppression, restauration | outils d'écriture/suppression/restauration, tests 1 à 10 | **publier les règles 5.5** ; activer le TTL sur `crm_audit_avant` ; fusionner | revert ; republier les anciennes règles |
| 5 | Sauvegardes | `sauvegarder`, `purger_sauvegardes`, `restaurer-export.js` | PITR et copies planifiées ; secret `DRIVE_OAUTH` ; dossier de sauvegarde | revert ; désactiver PITR et la planification |
| 6 | Branchement des clients | `docs/branchement-mcp.md` (Hermes, Claude Code ; **Claude Code fait et validé le 03/10/2026**, Hermes à faire) | config Hermes sur le VPS ; ajout dans Claude Code ; 1 jeton par client | révoquer le jeton |
| 7 | Pièces jointes dans l'appli | modèle, écrans (ordinateur et téléphone), `jetonDrive`, `preparer_televersement`, `joindre_fichier_drive`, version **2.1.0** (`version.json` + `js/os/version.js`) [à confirmer : 2.1.0 ou 2.0.1] | essai sur l'iPhone | revert (le bandeau « Nouvelle version » reprend la précédente) |
| 8 | Recette et clôture | rapport, `roadmap.md`, README | recette 9, définition de « terminé » | — |

Chaque fusion déploie seule ; je ne lance jamais de déploiement, ne publie jamais de règles, ne pousse jamais sur `main`.

**Configuration des clients** (étape 6) :
- **Hermes Agent** (`~/.hermes/config.yaml`, vérifié dans leur documentation sur GitHub, version `main`) :
  ```yaml
  mcp_servers:
    chevalier_ia_os:
      url: "https://chevalier-ia-os.web.app/mcp"
      headers:
        Authorization: "Bearer ${env:CHEVALIER_MCP_TOKEN}"
      timeout: 120
      tools:
        include: [qui_suis_je, chercher, lire_personne, lire_organisation, lire_affaire, lister_affaires, lister_activites, lister_documents, lire_reglages, lire_audit, creer_personne, modifier_personne, creer_organisation, modifier_organisation, creer_affaire, modifier_affaire, changer_etape, marquer_perdue, rouvrir_affaire, ajouter_note, modifier_note, creer_activite, terminer_activite, joindre_lien, retirer_document, preparer_televersement, joindre_fichier_drive, sauvegarder, lister_sauvegardes, purger_sauvegardes]
  ```
  Transport par défaut = Streamable HTTP ; `include` prime sur `exclude` ; les noms de la liste sont les noms natifs du serveur. Le jeton va dans le fichier d'environnement du VPS (permissions 600), pas dans le YAML. **Je n'ai trouvé aucune version minimale ni de numéro de version à jour : lance `hermes --version` sur le VPS et envoie-moi le résultat** ; l'exacte forme du préfixe des noms d'outils vus par l'agent est à confirmer à la première connexion.
- **Claude Code** : `claude mcp add --transport http chevalier-ia-os https://chevalier-ia-os.web.app/mcp --header "Authorization: Bearer $CHEVALIER_MCP_TOKEN"` [syntaxe à confirmer dans l'aide de ta version] ; le jeton reste dans une variable d'environnement de ton Mac, **jamais** dans un fichier du dossier synchronisé avec Drive.

## 6. Coûts (estimation honnête, non vérifiée sur les pages de prix : le proxy les bloque)

Usage supposé : quelques milliers d'appels par mois. Fonctions : 2 millions de requêtes gratuites par mois (donc 0 €). Firestore : l'audit ajoute environ 3 écritures par écriture métier, très en dessous des quotas gratuits quotidiens. Secret Manager : 6 versions actives et 10 000 accès gratuits par mois ; avec un cache de 60 s, une instance chaude fait jusqu'à ~43 000 accès/mois, soit environ 0,10 $ au-delà. PITR : ~0,15 $/Go/mois, base de quelques Mo. Copies planifiées : quelques centimes. Cloud Build et images : quotas gratuits, nettoyage conseillé. **Ordre de grandeur : de 0 à 1 € par mois.** Garde-fous : budget 5 € avec alertes (console → Facturation → **Budgets et alertes**) ; l'alerte **ne coupe rien** (Google le précise) ; vrais freins : 3 instances, plafonds par jeton, coupure d'urgence 5.4.

## 7. Risques restants (du plus au moins grave) et ce que je ne sais pas

| # | Risque | Parade |
|---|---|---|
| R1 | Un jeton volé donne l'accès en écriture à toute la base | jetons longs, profils, plafonds, révocation < 1 min, copies Google, audit |
| R2 | Un agent boucle ou écrit massivement de mauvaises données | plafonds, audit, restauration par opération, PITR |
| R3 | Fusion « rouge » publiée | Tests sur PR : oui, workflow `tests.yml` (18/10/2026) ; on fusionne quand la coche « Tests » est verte |
| R4 | Le prototype Drive échoue (visibilité commune, session de téléversement) | repli par lien / relais ≤ 20 Mo |
| R5 | Rôles Google du compte de service incomplets : déploiements en échec | un rôle à la fois, messages du CLI |
| R6 | Écran de consentement resté en « Test » : accès Drive coupé après 7 jours | passer « En production », contrôle avant la clôture |
| R7 | Parité écran/serveur : une règle divergente | extraction dans `logique.js` + test de parité |
| R8 | Départ à froid (1 à 3 s au premier appel) | timeout Hermes de 120 s ; pas d'instance minimale (coût) |
| R9 | Version de Hermes ou du SDK MCP différente de ce que décrit la documentation | prototype de connexion à l'étape 6 |
| R10 | Données personnelles dans l'audit | copies 90 jours, paramètres tronqués |

**Je ne sais pas encore** : la forme exacte de la réécriture Hosting vers une fonction à Paris ; la liste exacte des rôles du compte de service ; si la session de téléversement Drive accepte des morceaux sans en-tête ; si `drive.file` est bien non sensible pour la mise en production ; la version de ton Hermes ; la version exacte du SDK MCP à figer ; les prix en vigueur (pages bloquées) ; le comportement du sélecteur de fichiers sur l'iPhone en appli installée.

## 8. Fichiers existants à réutiliser

`js/modules/crm/logique.js` (toutes les règles pures : `nouvellePersonne`, `nouvelleAffaire`, `changementEtape`, `marquerPerdue`, `rouvrirAffaire`, `ajouterEncaissement`, `ajouterDocument`, `trouverDoublonsPersonne`, `trouverDoublonsOrganisation`, `planSuppressionPersonne`, `verifierSuppressionOrganisation`, `confirmationValide`, `exportJson`, `nomFichierExport`, `rechercherSuggestions`, `filtrerAffaires`) ; `donnees.js` (modèle d'orchestration à extraire) ; `tests/logique.test.js` (772 lignes de cas à rejouer sur la copie) ; `tests/regles.test.js` (modèle des tests A) ; `tests/e2e/serveur.js` (serveur statique de test) ; `activites.js` ligne 214 (affichage `auteur`, à compléter par `via`).

## 9. Recette manuelle (toi) et définition de « terminé »

1. Dans la console (étape 2), vérifier : budget 5 € avec 3 alertes ; le secret `MCP_JETONS` ne contient aucun jeton en clair.
2. `curl` sur `/mcp` avec un jeton valide : `qui_suis_je` répond ; sans jeton ou avec un jeton révoqué : refus.
3. Hermes crée une affaire de test et la relit ; `lire_audit` affiche `hermes-bibliothecaire`, `via: mcp` ; la fiche de l'écran affiche « hermes-bibliothecaire · via MCP ».
4. Claude Code supprime cette affaire de test ; `restaurer_depuis_audit` la remet à l'identique.
5. Le bibliothécaire tente `supprimer_affaire` : refusé.
6. Jeton révoqué dans Secret Manager : refus en moins d'une minute.
7. Sur l'iPhone (appli installée) : téléverser un fichier sur une affaire ; il apparaît dans la fiche et dans Drive (dossier `Jerome IA OS Attachments`, nom `AAAA-MM-JJ - affaire - contenu`), privé.
8. Sauvegarde hebdomadaire exécutée par Hermes ; fichier dans Drive ; restauration du JSON essayée sur une base de test ; copie Google quotidienne et PITR visibles dans la console.
9. `cd tests && npm test` passe entièrement ; l'écran de consentement est « En production » depuis plus de 8 jours et l'accès Drive marche toujours.

**Terminé** = les points 3 à 9 vérifiés + `roadmap.md` à jour + rapport de construction.

## 10. Récapitulation en dix lignes

1. Une fonction Google à Paris (Node 22) sert le MCP sur `chevalier-ia-os.web.app/mcp`, déployée par ta fusion sur `main`, comme le site.
2. Un jeton par client ; seules les empreintes sont dans Secret Manager ; révocation en moins d'une minute.
3. Bibliothécaire : lire, écrire, joindre, sauvegarder ; Claude Code : tout, y compris supprimer et restaurer.
4. Les règles métier restent uniques : j'extrais dans `logique.js` les enchaînements aujourd'hui cachés dans `donnees.js`, utilisés par l'écran et par les fonctions.
5. Chaque écriture est journalisée en deux temps ; copies « avant » gardées 90 jours (RGPD) ; restauration par opération.
6. Règles Firestore : l'audit devient lisible mais non modifiable depuis l'appli (le joker actuel est restructuré), à publier par toi.
7. Sauvegardes : JSON hebdomadaire 12 semaines dans Drive, copies Google quotidiennes 7 jours, PITR.
8. Pièces jointes sur les affaires, par lien ou téléversement ; le téléphone reçoit un jeton Drive d'1 h de la fonction, sans écran Google.
9. D'abord un prototype Drive (sur ton Mac), puis le squelette de déploiement, puis le métier, l'écriture, la sauvegarde, les clients, l'appli : une PR par étape.
10. Budget 5 € en alerte, 3 instances, plafonds par jeton ; zéro secret dans le dépôt ; aucune donnée réelle dans les tests.

## 11. Diagnostic des fichiers joints (outil TEMPORAIRE, ajouté le 26/10/2026)

**Pourquoi.** On ne sait pas ce que ChatGPT et Claude envoient réellement à un outil MCP quand tu joins une photo ou un PDF à la conversation et que tu dis « mets ça dans la fiche de X » : un vrai lien de téléchargement, un simple mot comme `chat_upload`, ou rien. L'outil `diagnostiquer_fichiers` sert à le savoir par un essai réel, avant de construire quoi que ce soit.

**Ce que fait l'outil.** Lecture seule, ouvert aux trois profils (lecteur, bibliothécaire, Claude Code) comme les autres outils de lecture, et il passe par la même porte (`servirMcp`) : aucune nouvelle entrée, aucune porte dérobée. Il ne télécharge rien, n'écrit rien dans la base ni dans l'audit (`crm_audit`). Il répond une phrase française courte, par exemple « J'ai reçu 3 éléments : 3 liens de téléchargement (hôte files.…), types image/jpeg. Rien n'a été enregistré. », ou « J'ai reçu le mot « chat_upload » au lieu d'un lien : l'assistant n'a pas transmis le fichier. ».

**Ce qui est noté (liste blanche).** Une seule ligne dans le journal technique de la fonction (`message: mcp_diagnostic`, pas dans Firestore) : nombre d'éléments, type de chaque élément, noms des champs, longueur des textes, **nom d'hôte seulement** des adresses (jamais l'adresse complète, jamais ses paramètres), `mime_type`, `file_name` s'il fait 80 caractères au plus et ne contient pas `://`, et la longueur de la note (jamais son texte). Une seule fonction (`resumerForme`, dans `functions/src/mcp/diagnostic-fichiers.js`) fabrique la réponse **et** la ligne de journal : elles ne peuvent pas différer.

**ChatGPT.** Le champ `fichiers` est déclaré comme paramètre de fichier (`_meta["openai/fileParams"] = ["fichiers"]`) ; `servirMcp` transmet maintenant le champ `meta` d'un outil (partagé avec le serveur des clients, sans effet pour les autres outils). **Non vérifié** : la référence d'OpenAI (Apps SDK, descripteur d'outil `_meta`, https://developers.openai.com/apps-sdk/reference) est bloquée depuis le bac à sable ; la forme attendue `{ download_url, file_id?, mime_type?, file_name? }` est à confirmer par l'essai.

**Interrupteurs d'urgence.** Aucun code nouveau : ceux de `securite-et-pannes.md`, section 4, coupent cet outil comme les autres (secret `MCP_JETONS` pour Claude Code et Hermes, collection `mcp_oauth` pour le téléphone et claude.ai).

**À retirer après l'essai** (voir `.github/A-FAIRE.md`) : l'outil dans `functions/src/mcp/outils/lecture.js`, le fichier `functions/src/mcp/diagnostic-fichiers.js`, le nom dans `js/os/registre.js` (`OUTILS_COMMUNS`), `tests/mcp-diagnostic-fichiers.test.js`, et le compte d'outils dans `tests/mcp-clients.test.js`, `tests/mcp.test.js` et `tests/lecture.test.js`. Le champ `meta` de `servirMcp` peut rester (inoffensif).

### Scénario d'essai pour Jérôme (10 minutes)

Connecteur déjà branché dans l'assistant (ChatGPT et Claude). Ne joins que des fichiers sans importance (une photo de ton bureau, un PDF vide), jamais un document de client.

1. **Ordinateur, Claude** : nouvelle conversation, joins 2 photos et 1 PDF, puis écris : « Mets ces 3 fichiers dans la fiche de Dupont. Utilise seulement l'outil diagnostiquer_fichiers pour l'instant. » Note la phrase que l'outil renvoie.
2. **Téléphone, Claude** : même chose avec 1 photo prise sur le moment.
3. **Ordinateur, ChatGPT** : mêmes fichiers, même phrase. Note la phrase.
4. **Téléphone, ChatGPT** : 1 photo, même phrase.
5. **Cas vide** : dans l'un des deux, sans rien joindre : « Utilise l'outil diagnostiquer_fichiers. » La réponse doit dire qu'aucun fichier n'a été reçu.

Rapporte à Claude les 4 ou 5 phrases telles quelles. Si un assistant répond qu'il ne trouve pas l'outil ou ne sait pas passer le fichier, note-le aussi : c'est une réponse utile.
