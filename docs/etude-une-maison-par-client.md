# Étude : une maison par client (25/11/2026)

Étude d'architecture demandée par Jérôme le 25/11/2026, relue par Fable le même jour (corrections intégrées). **Rien n'est codé, rien n'est décidé ici** : ce document décrit, compare et liste les décisions qui restent à Jérôme.

Sources lues sur `origin/main` au commit `aa07c176` (25/11/2026, version 2.52.0). Les numéros de ligne renvoient à ce commit. Dépôt public : aucun secret, aucun nom de client, aucune adresse e-mail, aucune adresse de serveur, aucun identifiant de projet Supabase ou de VPS n'est écrit ici. Les tailles de travail sont **relatives** (petit, moyen, gros) : aucune durée n'est annoncée.

Conventions : « **non vérifié** » = pas vu dans le code ; « **à vérifier dans leur documentation** » = affirmation sur Google, Supabase ou Hostinger sans source lue pour cette étude ; « **à revérifier en direct** » = chiffre tiré d'une page publique de l'éditeur, qui peut changer.

---

## 1. Résumé pour Jérôme (en simple)

| | Aujourd'hui | Demain : « une maison par client » |
|---|---|---|
| Image | Tous tes clients dans **un seul immeuble** (`chevalier-ia-app`), un appartement chacun, séparés par des serrures (les règles) | **Une maison par client** : son Google, son Supabase, son serveur (VPS) avec son n8n. Seul **le plan de la maison** (le code) est commun |
| Mélange de données | Évité par les serrures, qu'il faut tester sans cesse | Impossible entre clients : **pas de mur commun** |
| Départ d'un client | Difficile : il faut extraire son appartement | Facile : on lui **donne les clés** de sa maison |
| Une correction qui casse | Touche tous les clients d'un coup | Chez toi d'abord, puis un client pilote, puis les autres ; **retour arrière chez un seul client** |
| Ce que ça coûte | Un seul immeuble à entretenir | **Plus de maisons à entretenir**. En A : un abonnement Supabase par client (environ 25 $ par mois, à revérifier) + un VPS (prix à vérifier). En C2 (tout Google) : **coût inconnu, à mesurer** ; n8n allumé jour et nuit chez Google sera sans doute le plus gros poste. **Rien ne dit aujourd'hui que C2 coûte moins cher que A** |
| Ce qu'il faut d'abord | — | **Sortir du code tous les noms de projets et d'adresses écrits en dur** : aujourd'hui le code ne sait pas tourner dans un troisième projet sans être retouché |
| Les anciens modules (Devis, Affaires…) | Dans Firestore (Google) | Peuvent rester dans Firestore au début, puis déménager vers Supabase **un par un** |
| Trois façons de bâtir la maison | — | **A** : Google + Supabase + VPS avec n8n. **B** : sans Google (très gros déménagement). **C** : tout chez Google (Cloud SQL remplace Supabase) + n8n, soit sur un VPS (**C1**), soit chez Google aussi (**C2**, un seul fournisseur, une seule cession) |
| Ma recommandation | — | **Commencer tout de suite le nettoyage du code** (chantier 0, utile à A comme à C) et, **en même temps, faire un essai de C2 dans un projet Google à part**, avec de fausses données, sans toucher ton CRM. Choisir A ou C2 pour le premier client **avec les résultats de l'essai** (attention : commencer en A puis passer en C = déménager ce client deux fois). B reste une idée de long terme. **C'est toi qui décides** (section 11) |

---

## 2. Ce qui existe aujourd'hui (avec les sources)

### 2.1 Deux projets Firebase

| Fait | Source |
|---|---|
| Deux projets seulement : `chevalier-ia-os` (défaut, ton CRM) et `chevalier-ia-app` (alias `plateforme`, tous les clients) | `.firebaserc:3-4` |
| Ton CRM : Hosting depuis la racine, fonctions `functions/` (Node 22), règles `firestore.rules`, **aucune règle Storage** | `firebase.json:2-6`, `.github/workflows/publier-regles.yml:4-5` |
| Plateforme clients : fonctions `functions-plateforme/`, règles `firestore.plateforme.rules` et `storage.plateforme.rules`, Hosting depuis `dist/plateforme` | `firebase.plateforme.json:2-21` |
| Réécritures Hosting vers Cloud Run (région `europe-west9`) : chez toi `/mcp` (l. 35), OAuth, `/porte`, `/depot/**` (dépôt de documents) et `/tableau-de-bord` ; chez les clients seulement `/mcp/**`, OAuth et `/porte` | `firebase.json:34-42`, `firebase.plateforme.json:30-75` |
| Ton CRM se déploie **tout seul à chaque fusion sur `main`** | `.github/workflows/firebase-hosting.yml:6-9`, `:49-62` |
| La plateforme se déploie **à la main**, projet en dur | `.github/workflows/deploiement-plateforme.yml:12-13`, `:75` |
| Le paquet de la plateforme est le **même code, même version** que le CRM, avec une autre configuration web Firebase ; la liste des projets construits est en dur (`PROJETS = { plateforme: … }`) | `scripts/hebergement.js:3-7`, `:23-25` |
| Une seule version pour tout le monde : `2.52.0` | `js/os/version.js:2`, `version.json` |
| Dans la plateforme, chaque client est rangé sous `clients/{client}/…` (option C) | `firestore.plateforme.rules:35-199` |
| L'outil « nouveau client » écrit dans **un** projet (défaut `chevalier-ia-app`) | `scripts/plateforme/nouveau-client.js:1-31` |
| Le choix « une base pour tous les clients » (option C) date du 10/10/2026 ; sa condition 6 était déjà une **porte de sortie** | `docs/etude-reutilisation-coque.md:73-89`, l. 82 |
| Fonctions : **47 distinctes**, dont **28 communes** aux deux dossiers (comptage des `export const` de `functions/src/index.js` et `functions-plateforme/src/index.js`) | — |
| Fonctions présentes chez toi seulement (`RESERVEES_JEROME`) : MCP de Jérôme, automatisations internes, Maintenance (`tableaudebord`, `tableaudebordSaisir`), Veille, Buffer et relevés LinkedIn, dépôt de documents, Console, Pilotage (2 fonctions), `baseAccorderAcces` | `tests/ecarts-fonctions.test.js:27-44` |

### 2.2 Ce qui est écrit en dur dans le code (vérifié)

C'est le premier obstacle à « une maison par client » : aujourd'hui le code connaît **le nom de ses deux projets et l'adresse de ton n8n**.

| Ce qui est en dur | Où (exemples vérifiés) |
|---|---|
| Projet `chevalier-ia-app` (stockage, secrets, adresse de réponse SMS) | `functions-plateforme/src/index.js:37, 132, 160-163` (Fable cite aussi l. 145 et 187, `mcp-clients.js:17, 31-33`, `porte.js:16`, `devis-pdf.js:21` : **non relus un par un**) |
| Projet `chevalier-ia-os` (adresse de réponse SMS, lien des devis, compte de service) | `functions/src/index.js:209, 253, 392` |
| Le serveur de Jérôme **lit la base de `chevalier-ia-app`** | `functions/src/index.js:392-398` |
| Émetteur OAuth du MCP | `functions/src/oauth/config.js:6` (Fable cite aussi `oauth/config.js:46`, `oauth/page.js:8-9`, `clients/config.js:6-13` : non relus un par un) |
| Comptes de Jérôme écrits en dur (accès OAuth, super admins, règles) | `functions/src/oauth/config.js:14`, `functions/src/securite/super-admins.js:5`, `firestore.rules:7-18` (Fable cite aussi `coeur/metier.js:33`, `console/appel.js:8`, `js/os/administrateur.js:5`) |
| Adresse du n8n de Jérôme | `functions-plateforme/src/n8n.js:9`, `functions/src/veille/service.js:6`, `scripts/porte/n8n.js` (non relu) |

Conséquence : **le paquet « racine » (celui de ton CRM) n'est pas utilisable par un client** : ses règles et son serveur n'ouvrent la porte qu'à tes comptes, et il n'a pas de règles Storage. Le paquet « plateforme » (avec un seul client dedans) marche presque tel quel, **une fois les noms de projet sortis du code**.

### 2.3 Supabase

| Fait | Source |
|---|---|
| Les 5 modules Achats n'ont **aucune collection Firestore** : leurs données sont dans « la base de l'espace » (Supabase) | `js/os/registre.js:301-378` (`collections: []`), `docs/modules-achats.md` |
| Ils sont réservés au propriétaire (`seulJerome: true`) | `js/os/registre.js:306, 323, 339, 355, 371` |
| **Une connexion par espace** (adresse de la base, clé publique, nom court, 4 webhooks n8n) dans `base_parametres/connexion` | `js/os/base-reglages.js:1-10`, `firestore.rules:210` |
| Lecture par le navigateur avec un **badge Firebase** (`role = authenticated`, `espace_base = <espace>`) | `js/os/supabase.js:63-71`, `js/os/acces-base.js:24-32` |
| Badge posé par `baseAccorderAcces` (toi seul) | `functions/src/index.js:124-127`, `functions/src/base/acces-appel.js:3, 10` |
| Un compte n'a qu'**un seul** `espace_base` à la fois | `.github/A-FAIRE.md:30` |
| **Les écritures passent par n8n** (ticket à usage unique) | `docs/modules-achats.md:19-21` |
| Pilotage et outils MCP du tableau de bord lisent Postgres en lecture seule (secret `SUPABASE_INDICATEURS`) | `functions/src/pilotage/postgres.js:1-10`, `docs/securite-et-pannes.md:326` |
| Les migrations de la base et les workflows n8n des Achats vivent dans **un autre dépôt** (dépôt BTP : migration 034, workflows 02, 03, 05, 08) | `docs/reprise-prochaine-session.md`, tableau du 25/11 |
| Projet Supabase actuel en offre gratuite | `docs/reprise-prochaine-session.md:66` |

**Non vérifié** : le réglage « Third-Party Auth Firebase » côté Supabase. La décision « une base Supabase par espace » du 24/11 n'est écrite telle quelle dans aucun fichier : elle se lit dans le contrat de connexion par espace ci-dessus.

### 2.4 n8n et secrets

| Fait | Source |
|---|---|
| **Un seul n8n**, le tien, sert ton CRM et les clients : son adresse est écrite en dur dans le serveur | `functions-plateforme/src/n8n.js:9`, `functions/src/veille/service.js:6` |
| Les workflows entrent dans la base par la **porte** (une clé par propriétaire) | `docs/porte-cles.md:1-20` |
| Le brouillon d'e-mail des devis passe aussi par n8n | `docs/securite-et-pannes.md:296` |
| n8n tourne sur un VPS ; sa sauvegarde n'est pas faite | `.github/A-FAIRE.md:191` |
| Hébergeur de ce VPS | **non vérifié** |
| Secrets suffixés par client dans le projet partagé (`CLICKSEND_RDV_<client>`, `MCP_JETONS_CLIENTS`, `N8N_DEVIS_EMAIL_*_<client>`) | `docs/rdv-sms-clicksend.md:26-29`, `docs/securite-et-pannes.md:300, 314` |
| La Console (phase 1) doit **lire toutes les plateformes** ; versions par espace et cercles prévus en phase 2 | `docs/console.md:24, 53`, sections 4 et 6 |

---

## 3. Architecture cible (scénario A : Google + Supabase + VPS)

```
                        ┌──────────── GitHub (dépôt public) ─────────────┐
                        │  UN SEUL CODE + workflows de déploiement        │
                        │  (aucun nom de projet client dans le dépôt)     │
                        └──────┬──────────────┬──────────────┬───────────┘
                    vague 0    │     vague 1  │      vague 2 │
                               ▼              ▼              ▼
  ┌───────── MAISON DE JÉRÔME ─────────┐ ┌──── MAISON CLIENT PILOTE ────┐ ┌──── MAISON CLIENT N ────┐
  │ Google : chevalier-ia-os           │ │ Google : projet du client     │ │  (même plan)            │
  │  Hosting, Auth, Firestore, Storage │ │  (client co-propriétaire)     │ │                         │
  │  Functions, Secret Manager, OAuth  │ │  Hosting, Auth, Firestore,    │ │                         │
  │ Supabase : base de Jérôme          │ │  Storage, Functions, Secrets, │ │                         │
  │ VPS : n8n de Jérôme                │ │  client OAuth et ses URI      │ │                         │
  │ + Console (toi seul)               │ │ Supabase : organisation du    │ │                         │
  └────────────────────────────────────┘ │  client, son projet           │ └─────────────────────────┘
                                         │ Hostinger : compte du client, │
                                         │  VPS avec SON n8n             │
                                         └───────────────────────────────┘
```

| Reste chez Jérôme | Va dans chaque maison |
|---|---|
| Dépôt GitHub et workflows | Toutes les données du client |
| Console (lecture des maisons par un compte dédié en lecture seule, `docs/console.md` section 3) | Ses secrets, sous le **même nom** que chez toi (`CLICKSEND_RDV` et non `CLICKSEND_RDV_<client>`) |
| Liste des maisons et de leur version (hors dépôt public) | Son n8n, ses workflows, sa clé n8n (`N8N_API_KEY` par maison) |
| Ton CRM | Son client OAuth et ses adresses de retour |
| Sauvegardes hors Google (Backblaze, **prévu**, `docs/securite-et-pannes.md:47`) | Ses sauvegardes (Firestore, Storage, Supabase, VPS) |

**Liens partagés qui subsistent et sont à couper ou à assumer** :

| Lien | Source | À faire |
|---|---|---|
| Le serveur de Jérôme lit la base de `chevalier-ia-app` | `functions/src/index.js:392-398` | Ne pas reproduire pour les maisons, ou par un compte en lecture seule retiré à la cession |
| La Console lit toutes les maisons | `docs/console.md:24, 53` | Compte dédié en lecture seule par maison, retiré à la cession |
| Tes comptes sont super admins **dans le code livré** | `functions/src/securite/super-admins.js:5`, `functions/src/oauth/config.js:14` | Après le départ d'un client, le code qu'il garde contient encore tes comptes : à sortir du code (réglage par maison) |

**Paquet d'une maison client** : « plateforme avec un seul client » (`clients/<id>/…`) marche presque tel quel ; « racine » (comme ton CRM) est un **gros** chantier, car il est verrouillé sur tes comptes (section 2.2). Décision 3.

---

## 4. Ce que le code devra savoir faire

### 4.1 Chantier 0 : sortir du code tous les identifiants de projet

Préalable à tout le reste. Chaque nom de projet, adresse de fonction, bucket, compte de service, émetteur OAuth, adresse n8n et compte autorisé de la section 2.2 devient un **réglage de la maison** (variable d'environnement de la fonction, `process.env.GCLOUD_PROJECT`, ou fichier de la maison hors dépôt). Taille **moyenne**, relecture Fable **obligatoire** (serveur, OAuth, liens).

### 4.2 Déployer le même code vers N maisons, par vagues

| Élément | Aujourd'hui | À construire |
|---|---|---|
| Liste des maisons | `PROJETS` en dur (`scripts/hebergement.js:23-25`) | Liste par maison (projet Google, configuration web, vague) **hors dépôt public** (variable GitHub ou dépôt privé, décision 4) |
| Workflow | Un projet en dur par workflow | « Déployer une maison / une vague » : manuel, une maison après l'autre, arrêt à la première erreur |
| Contrôle bloquant avant chaque publication | Aucun | Vérifier que **le projet de la clé de déploiement = le projet de la maison = le `projectId` du paquet** ; sinon arrêt |
| Accès de GitHub à Google | Clé JSON en secret GitHub (`deploiement-plateforme.yml:49`) | **Fédération d'identité sans clé** + **Environnement GitHub avec approbation par maison** : obligatoires dès le premier client (section 6.2) |
| Version par maison | Une version pour tous | Déployer une **étiquette Git** ; la Console note « maison X = version Y » |
| Migrations Supabase | Dans le dépôt BTP | Rapatriées ou référencées ; appliquées par vague (CLI Supabase : **à vérifier dans leur documentation**) |
| Workflows n8n | Dans ton n8n et le dépôt BTP | Versionnés (JSON sans identifiants), importés dans chaque n8n par son API, par vague |

**Retour arrière par maison : ce qu'il rend et ce qu'il ne rend pas**

| Revient en arrière | Ne revient PAS tout seul |
|---|---|
| Code des écrans (Hosting) | Règles Firestore et Storage (à republier à part) |
| Code des fonctions | Données écrites par la nouvelle version |
| | Schéma Supabase (les migrations doivent rester compatibles avec la version d'avant : ajouter une colonne, jamais en retirer dans la même version) |
| | Workflows n8n (à réimporter dans leur version d'avant) |

Risque nouveau : avec des vagues, **plusieurs versions tournent en même temps** dans des maisons différentes, alors que les tests ne tournent que sur `main`. Une version ancienne restée chez un client n'est plus testée.

### 4.3 Créer un nouveau client (une maison)

| Étape | Automatisable ? | Remarque |
|---|---|---|
| Projet Google **sans organisation**, client **co-propriétaire dès le jour 1** | Commande depuis ton Mac ; l'invitation du client est un clic de sa part | **à vérifier dans leur documentation** (quota de projets, invitation) |
| Facturation | Commande, mais **choix de Jérôme** (décision 6) | Blaze requis pour les fonctions (`docs/cahier-mcp.md:13`) |
| API Firebase, Auth, Firestore, Storage, Functions, Secret Manager | Commandes | **à vérifier dans leur documentation** pour chaque API |
| Connexion Google dans Firebase Auth | Clics probablement | non vérifié |
| Écran de consentement et client OAuth, **adresses de retour des assistants** (MCP OAuth) | Clics en grande partie | **à vérifier dans leur documentation** |
| **Restriction de la clé web Firebase** (sites autorisés) | Commande | Modèle : ton CRM (`CLAUDE.md`, décision du 20/10/2026) |
| **CORS du bucket** (PDF des devis) | Commande | `docs/cors-stockage-pdf.md` |
| Comptes de service et leurs droits | Commandes `gcloud` (`docs/securite-et-pannes.md:304`) | Changer des droits = **accord de Jérôme** |
| Sauvegardes Firestore | Commande | Modèle : `docs/securite-et-pannes.md:46` |
| **Adresse entrante ClickSend** (`rdvReponseSms`, aujourd'hui en dur) | Réglage de la règle ClickSend du client | Dépend du chantier 0 |
| Organisation et projet Supabase au nom du client | Projet : API ; organisation : **à vérifier dans leur documentation** | |
| Third-Party Auth Firebase dans Supabase | **à vérifier dans leur documentation** | Indispensable pour le badge |
| Schéma Supabase | CLI | Dépend du dépôt BTP (section 2.3) |
| Compte Hostinger du client | **Clics** (création de compte, paiement) | Jamais automatisé par Claude |
| **Domaine et DNS du n8n du client** | Clics ou API du fournisseur DNS | Nécessaire pour le https |
| VPS : système, pare-feu, Docker, n8n, https | Script après accès SSH | API Hostinger : **à vérifier dans leur documentation** |
| Configuration de l'OS (marque, membres, modules) | Existe (`scripts/plateforme/nouveau-client.js`, option `--projet`) | Toi en éditeur d'office (règle du 16/11) |
| Connexion à la base de l'espace | Écran existant | `js/os/base-reglages.js` |

### 4.4 Leçons de la première mise en service (26/11/2026)

Ajouté après la mise en service du premier client en maison (Achats sur Cloud SQL, PR 700 à 702). À suivre pour chaque nouvelle maison, en plus du tableau 4.3 :

| Étape | Ce qu'il faut faire | Pourquoi |
|---|---|---|
| Écran neutre | Écrire `reglages_maison/ecran` avec `configuration_crm = 'neutre'` **avant toute première ouverture du site** | Sinon le premier lancement installe la configuration de Jérôme (étapes, modèles de projets) dans la maison du client |
| Rôle sur mesure du compte d'accès à la base | Créer le rôle `baseAccesComptes` (lire et modifier les comptes Firebase) et le donner au compte de service d'accès à la base | Il manquait : créé à la main pendant la mise en service ; sans lui, l'accès donné par l'écran échoue |
| Premier déploiement des fonctions | Prévoir **deux passages** : relancer le déploiement s'il échoue au premier | Au premier passage, des créations de stockage et de Cloud Run ont raté ; le second a tout mis en service |
| Porte Cloud SQL | Dans Réglages > Connexion à la base, mettre l'**adresse Cloud Run directe** de la fonction `basePorte` (celle qui finit par `run.app`), **pas** l'adresse `cloudfunctions.net` | Les workflows n8n et l'écran parlent à la porte par cette adresse ; la connexion n8n est limitée à ce domaine |
| Mentions d'accès aux données | Donner l'accès d'un compte **par l'écran**, puis cliquer sur « Revérifier » | Pas besoin de se déconnecter : « Revérifier » suffit pour que l'accès soit pris en compte |
| Compte de calcul par défaut | Il garde le rôle « éditeur » à la création du projet | Le retirer peut casser la construction des fonctions : décision de Jérôme en attente |
| IA (lecture des factures) | Vérifier le crédit du compte OpenRouter avant l'essai | Sans crédit, la lecture échoue (erreur 402) et la facture reste vide |
| Photos de la page de connexion (27/11/2026) | Ranger 1 à 3 photos JPEG du métier du client (1600 px de large au plus) **hors du dépôt**, sur le Mac, dans un dossier `photos-maisons/<id du projet Firebase>/connexion/` ; **juste avant chaque déploiement d'une maison**, lancer `node scripts/copier-photos-maison.js --projet <id du projet Firebase> <ce dossier>` (ou `--retirer` pour une maison sans photo) : il les copie dans `maison/connexion-1.jpg` à `-3.jpg` du dossier publié (dossier ignoré par git), retire leurs métadonnées (EXIF, XMP, IPTC, commentaires, et la vidéo ou seconde image qui suit une photo de téléphone ; le profil de couleur reste), refuse une photo tournée par l'appareil (la tourner avec Aperçu), remplace celles de la maison d'avant et note le projet dans `maison/.projet` (jamais publié). **Puis, juste avant CHAQUE déploiement d'hébergement depuis le Mac (maison ou CRM de Jérôme)** : `node scripts/verifier-photos-maison.js <id du projet qu'on déploie>` ; s'il répond « Échec », ne pas déployer | Le dépôt est public : les photos d'un client n'y vont jamais. Sans photo, la page de connexion reste sobre ; chez Jérôme, aucune photo n'est demandée (`js/os/connexion-photos.js`). Le garde-fou est un script à lancer à la main : le brancher dans `firebase.json` (« predeploy ») demande l'accord de Jérôme (PR 720). Une photo remplacée est rechargée malgré le cache d'un an (adresse versionnée par l'ETag) |

---

## 5. Les anciens modules qui stockent dans Firestore

| Module | Collections Firestore | Source |
|---|---|---|
| Socle (Personnes, Organisations, journal) | `crm_personnes`, `crm_organisations`, `crm_evenements` (+ `crm_audit`, `crm_audit_avant`) | `registre.js:43-46`, `firestore.rules:23, 32` |
| Affaires | `crm_affaires`, `crm_activites`, `crm_notes`, `crm_parametres`, `documents_stockes` (+ `crm_actions_lancements`) | `registre.js:102`, `firestore.rules:103, 109` |
| Projets | `projets_projets`, `projets_taches`, `projets_modeles` | `registre.js:123` |
| Devis | `devis_articles`, `devis_parametres`, `devis_devis`, `devis_vocabulaire`, `devis_usage_articles` (+ `devis_compteurs`, `devis_habitudes`) | `registre.js:152`, `firestore.rules:93, 116` |
| Veille | `veille_sources`, `veille_contenus`, `veille_resumes`, `veille_pages` | `registre.js:172` |
| Réseaux sociaux | 6 collections `reseauxsociaux_*` (+ `reseauxsociaux_mesures`) | `registre.js:196`, `firestore.rules:180` |
| Rendez-vous | `rdv_rendezvous`, `rdv_participants`, `rdv_messages`, `rdv_parametres` | `registre.js:231` |
| Automatisations | `workflows`, `executions`, `sync`, `automatisations_propositions` | `registre.js:253` |
| Pilotage | `pilotage_parametres` | `registre.js:271` |
| Tableau de bord (Maintenance) | `tableaudebord_indicateurs`, `_releves`, `_demandes` | `registre.js:291` |
| Console (toi seul) | `console_filet` | `registre.js:418` |
| Technique | `mcp_limites`, `mcp_oauth`, `plateforme_cles`, `base_parametres` | `firestore.rules:39-49, 210` |

### Ordre proposé pour les déplacer vers Supabase (sans urgence)

Avec une maison par client, Firestore n'est plus un risque de mélange : le déplacement **n'est pas une condition** pour installer le premier client.

| Ordre | Module | Taille | Risque | Pourquoi cet ordre |
|---|---|---|---|---|
| 1 | Pilotage et Tableau de bord | petit | faible | Un document de réglages ; chiffres déjà dans Postgres |
| 2 | Veille | moyen | faible | Peu lié aux autres |
| 3 | Réseaux sociaux | moyen | faible | Isolé, surtout chez toi |
| 4 | Automatisations | moyen | moyen | Copie horaire planifiée (`functions-plateforme/src/index.js:49`) |
| 5 | Rendez-vous | moyen | moyen à fort | SMS planifiés (`functions/src/index.js:236`) : doublon ou oubli possible |
| 6 | Projets | moyen | moyen | Lié aux Affaires |
| 7 | Devis | **gros** | **fort** | Numérotation, PDF officiel, MCP, transactions, règles fines (`firestore.rules:87-173`) |
| 8 | Socle + Affaires + journal | **gros** | **fort** | Tout en dépend ; journal « on garde tout » et `restaurer_depuis_audit` à refaire |

Le serveur MCP est touché par **chaque** déplacement (Fable obligatoire).

**Question à trancher avant le premier déplacement (décision 13) : comment écrivent les modules déplacés ?**

| Voie d'écriture | Ce que ça implique |
|---|---|
| Par n8n (comme les Achats, `docs/modules-achats.md:19-21`) | Chaque module déplacé rend **le VPS plus critique** : s'il tombe, plus personne n'écrit |
| Par une fonction du serveur (Firebase aujourd'hui) | Le VPS reste secondaire ; écriture contrôlée côté serveur, comme le Devis aujourd'hui |
| Directement depuis le navigateur, protégée par RLS | Le plus simple à brancher ; toute la sécurité repose sur les politiques RLS, à tester comme les règles Firestore |

---

## 6. Sécurité et exploitation pour des clients à 1 M€

### 6.1 Sauvegardes, mises à jour, accès, surveillance

| Sujet | Firebase (Google) | Supabase | VPS (n8n) |
|---|---|---|---|
| Sauvegardes | Firestore : quotidienne 98 jours + à la minute 7 jours, en place chez toi (`docs/securite-et-pannes.md:46`). **À ajouter** : fichiers Cloud Storage (PDF officiels des devis), **comptes Auth** (export) | Selon l'offre (**à vérifier dans leur documentation**) + `pg_dump` chiffré vers Backblaze (**prévu**) | Instantanés Hostinger (**à vérifier**) + volumes Docker + workflows + **clé de chiffrement de n8n** (sans elle, les identifiants sauvegardés sont illisibles) ; aujourd'hui **pas fait** (`.github/A-FAIRE.md:191`) |
| Restauration essayée | **Aucune** à ce jour (`docs/securite-et-pannes.md:46`) | — | — |
| Mises à jour | Google | Supabase (Postgres : **à vérifier**) | **À ta charge** : système, Docker, n8n (version figée, mise à jour par vague) |
| Accès | IAM minimal | Organisation du client, toi membre | SSH par clé seulement, pare-feu (22, 80, 443), https |
| Surveillance | Alertes Google existantes | Journaux et conseils de Supabase | Sonde externe, disque, certificat https |
| Journaux | `crm_audit` (« on garde tout ») | À prévoir pour les tables métier | Exécutions n8n (tickets lisibles 60 s) |

**Condition avant le premier client** : **une restauration réellement essayée par maison** (Firestore, Storage, Supabase, VPS). Sans restauration essayée, une sauvegarde n'est qu'un espoir.

### 6.2 Les clés : un vol ne doit pas ouvrir toutes les maisons

| Danger | Parade (obligatoire dès le premier client) |
|---|---|
| N clés de déploiement en secrets d'un **dépôt public** | **Fédération d'identité GitHub → Google sans clé** (**à vérifier dans leur documentation**) |
| Un seul workflow peut publier partout | **Environnements GitHub avec approbation** : une par maison |
| Ton compte Google propriétaire de toutes les maisons | **Client co-propriétaire dès le jour 1** ; ton compte protégé (double facteur matériel, à vérifier dans ta configuration) |
| Clés SSH de tous les VPS sur ton Mac | Une clé par maison, retirée à la cession ; non vérifié : où elles seraient gardées |

### 6.3 Tests d'étanchéité

| Test | Statut avec des maisons |
|---|---|
| « Le client A ne lit rien chez B » dans un même projet (`firestore.plateforme.rules`, `tests/mcp-clients.test.js` PJ1 à PJ8) | Moins utile ; à **garder** tant que `chevalier-ia-app` existe |
| Lecteur ≠ éditeur dans une maison | Toujours utile |
| Compte sans badge refusé par Supabase | Toujours utile |
| **Badge d'une maison refusé par la base d'une autre** | Nouveau test à écrire |
| Fonctions réservées à Jérôme | Toujours utile |
| **Dérive** (maison oubliée à une vieille version, réglage fait à la main) | Nouveau contrôle dans la Console |

---

## 7. Le départ (cession) d'un client

| Où | Étapes | État |
|---|---|---|
| Google | Client déjà co-propriétaire ; il met **sa** facturation ; retirer Jérôme, ses comptes de service, le compte de la Console ; supprimer l'Environnement GitHub de la maison | **à vérifier dans leur documentation** |
| Supabase | Organisation déjà au nom du client : retirer Jérôme | Transfert de projet : **à vérifier dans leur documentation** |
| Hostinger | Compte déjà au nom du client : retirer les clés SSH de Jérôme | **à vérifier dans leur documentation** |
| Clés à refaire | Jetons MCP, clé de la porte, clé n8n, secrets n8n, secret OAuth, clés Supabase (`service_role`, JWT), mot de passe Postgres, clés SSH, ClickSend si le compte était celui de Jérôme | Liste par maison dans la Console |
| Code | Tes comptes restent super admins dans le code livré tant que le chantier 0 ne les a pas sortis | Chantier 0 |
| Contrat | Droit d'usage du code, mises à jour après le départ | Décision 9 ; **guide de cession avant la signature du premier contrat** |

---

## 8. Que devient `chevalier-ia-app` et ses clients actuels ?

| Option | Avantage | Inconvénient |
|---|---|---|
| 1. Le garder pour les clients actuels, maisons pour les nouveaux | Rien à déménager | Deux façons de déployer à entretenir |
| 2. Déménager chaque client dans sa maison | Un seul modèle | **Migration de données** : accord de Jérôme, jamais de nuit |
| 3. En faire la maison de démonstration (`--demo`) | Sert les démos | Il faut d'abord régler les clients réels |

Cette étude ne tranche pas (décision 2).

---

## 9. Coûts

Règle : aucun nombre inventé. Les chiffres Supabase viennent de leur page publique des prix et de leur documentation de facturation, **à revérifier en direct** avant d'en parler à un client.

| Poste | Ce qu'on sait | Statut |
|---|---|---|
| Supabase, offre Pro | 25 $ par mois **par organisation**, donc par client (une organisation par client) | à revérifier en direct |
| Supabase, puissance (Compute) | Un crédit de 10 $ par mois couvre une instance Micro ; une instance Small coûte environ 15 $ par mois (exemple de leur documentation) | à revérifier en direct |
| Supabase, plafond de dépenses | Ne couvre **pas** la puissance (Compute) | à revérifier en direct |
| **Total Supabase probable par client** | **Environ 25 $ par mois** avec une instance Micro, **non garanti** | à revérifier en direct |
| Google (Firebase Blaze) par maison | Paiement à l'usage ; Blaze requis (`docs/cahier-mcp.md:13`) | montant **à vérifier** |
| Restauration Firestore | « facturée selon la taille de la base » (`docs/securite-et-pannes.md:104`) | montant **à vérifier** |
| VPS Hostinger par client | — | prix **à vérifier dans leur documentation** |
| n8n auto-hébergé | Édition communautaire | conditions d'usage commercial **à vérifier dans leur documentation** |
| Temps d'entretien de Jérôme | Proportionnel au nombre de VPS | non chiffré |

Qui paie chaque facture : décision 6.

---

## 10. Scénario B : une maison **sans Google**

Demande de Jérôme du 25/11/2026 : écrans, n8n et données hors de Google (VPS Hostinger du client + Supabase).

### 10.1 Chaque service Google utilisé aujourd'hui, et son remplaçant

| Service Google (source) | Remplaçant | Taille | Reste-t-il un petit projet Google ? |
|---|---|---|---|
| **Firebase Hosting** (`firebase.json:34-42`) | Hébergement web géré d'Hostinger ou Cloudflare Pages (de préférence), ou Caddy sur le VPS | petit | Non |
| **Firebase Auth**, « Se connecter avec Google » (`js/os/auth.js:3-5, 59-69`) | Supabase Auth | **gros** : le badge Firebase est partout (`js/os/acces-base.js`, `baseAccorderAcces`, règles, MCP OAuth) | **Oui si on garde « avec Google »** : un client OAuth Google |
| **Firestore** (22 fichiers de `js/` d'après un `git grep`, non relus) | Postgres de Supabase ; écoutes en direct par Supabase Realtime (**à vérifier dans leur documentation**) | **gros** | Non |
| **Règles Firestore** | Politiques RLS | gros | Non |
| **Cloud Storage** (`functions/src/devis/stockage-projet.js:4-10`) | Supabase Storage | moyen | Non |
| **Cloud Functions** (47 fonctions distinctes) | Supabase Edge Functions, ou programme Node sur le VPS | **gros** | Non |
| **Serveur MCP** avec OAuth (`firebase.json:35`, `docs/mcp-oauth.md:13`) | Edge Function : **probable, à vérifier dans leur documentation** ; sinon programme sur le VPS | gros | Oui si l'OAuth du MCP reste « avec Google » |
| **PDF des devis** (Chromium : `functions/src/devis/chromium.js`, `@sparticuz/chromium`) | **Gotenberg sur le VPS** (Chromium ne tourne pas dans les Edge Functions) | moyen | Non |
| **SMS ClickSend** (`functions/src/coeur/sms-direct.js`, d'après `CLAUDE.md`) | Edge Function simple | petit | Non |
| **Tâches planifiées** (`functions/src/index.js:236, 368, 404`, `functions-plateforme/src/index.js:49, 170`) | `pg_cron` de Supabase ou planification n8n | moyen | Non |
| **Secret Manager** | Supabase Vault (**à vérifier dans leur documentation**) ou secrets des Edge Functions | moyen | Non |
| **Drive Picker** (`js/os/google-picker.js`, `js/os/google-drive.js`) | Garder Drive, ou dépôt dans Supabase Storage | moyen | **Oui si on garde Drive** |
| **Gmail** : aucun appel direct, brouillon par n8n (`docs/securite-et-pannes.md:296`) | Inchangé (n8n : Gmail ou SMTP, `docs/etude-brouillon-email-hors-google.md:42`) | petit | Connexion Gmail de n8n : client OAuth Google (**à vérifier**) |
| **Sauvegardes Firestore** | Sauvegardes Supabase + `pg_dump` + instantanés VPS | moyen | Non |
| **Journaux et alertes Google Cloud** | Journaux Supabase + Docker + sonde externe | moyen | Non |

**Parade au risque « le VPS tombe, les écrans tombent »** : publier les écrans sur un hébergement **géré** (hébergement web d'Hostinger ou Cloudflare Pages) ; le VPS ne garde que n8n et Gotenberg.

### 10.2 Comparaison A / B

| Critère | A : Google + Supabase + VPS | B : Supabase + VPS, sans Google |
|---|---|---|
| Sécurité | Firebase et Supabase gérés ; le VPS porte n8n | Plus de choses sur le VPS (Gotenberg, éventuellement le MCP) ; une faille du VPS expose davantage |
| Entretien | 3 consoles par client, 2 gérées | 2 consoles, VPS plus chargé |
| Panne du VPS | Arrête n8n, **donc les écritures des modules Supabase et le brouillon d'e-mail** ; les modules Firestore continuent | Arrête n8n, les PDF, et les écrans si on les y met (d'où la parade ci-dessus) |
| Risque du chantier | Moyen : chantier 0 (noms de projets en dur) puis réutilisation du code | Fort : authentification, 47 fonctions, règles, MCP à réécrire |
| « Jérôme d'abord » | Ton CRM reste sur Google, comme les clients | Ton CRM devrait passer sans Google lui aussi |
| Coût | 3 factures par client (Supabase ≈ 25 $ par mois à revérifier, le reste **à vérifier**) | 2 factures par client (même remarque) + plus de temps d'entretien |
| Départ du client | 3 transferts | 2 transferts, **plus simple** s'il ne reste aucun projet Google |

### 10.3 Recommandation entre A et B (Jérôme décide ; la recommandation d'ensemble, scénario C compris, est en 10 bis.8)

| | |
|---|---|
| **Commencer par A** | Le code existant (paquet par projet, Supabase par espace) est réutilisable **après le chantier 0** ; on respecte « même code chez Jérôme et chez les clients » sans réécrire ton CRM |
| **Mais savoir que le VPS devient critique** | Même en A, chaque module déplacé vers Supabase **et écrit par n8n** rend le VPS plus important : la décision 13 (voie d'écriture) compte autant que le choix A/B |
| **B comme direction de long terme** | Chaque module déplacé vers Supabase rapproche de B ; la question « garder Google ? » se reposera avec des coûts et un temps d'entretien **mesurés** |

---

## 10 bis. Scénario C : tout chez Google + n8n

Demande de Jérôme du 25/11/2026 : il a confiance dans Google, veut rester « Google focus » et garder n8n. Par client, **un seul projet Google** porte tout. Section relue par Fable le 25/11/2026 (corrections intégrées).

### 10 bis.1 Ce que porte le projet Google du client

| Besoin | Service Google | Aujourd'hui | Remarque |
|---|---|---|---|
| Écrans | Firebase Hosting | idem (`firebase.json`) | Inchangé |
| Connexion | Firebase Auth | idem (`js/os/auth.js`) | Inchangé |
| Anciens modules (Devis, Affaires…) | Firestore | idem | Inchangé ; déplacement vers SQL possible plus tard |
| Données SQL (Achats, Pilotage) | **Cloud SQL pour PostgreSQL** | Supabase (même moteur Postgres) | Remplace Supabase |
| Accès SQL depuis les écrans | **Firebase SQL Connect** (ancien nom : Data Connect), ou des **fonctions serveur** | Appels directs du navigateur à Supabase | Voir 10 bis.4 : les fonctions serveur semblent plus simples ici |
| Fichiers (PDF officiels, PDF des factures) | Cloud Storage | Cloud Storage + stockage Supabase (`lienPdf`, `js/os/supabase.js:142-150`) | Un seul stockage |
| SMS, MCP, PDF des devis | Functions / Cloud Run | idem | Inchangé |
| Secrets | Secret Manager | idem | Y compris la clé de chiffrement de n8n en C2 |
| Automatisations | **n8n** (C1 ou C2) | n8n de Jérôme sur un VPS | Un n8n par client |
| Région | **Union européenne obligatoire** | Tout est à Paris (`europe-west9`, `firebase.json:34-42`) | Disponibilité de SQL Connect à Paris : **non vérifiée** ; tarifs Cloud Run et Cloud SQL **par région** |

### 10 bis.2 Où tourne n8n : C1 ou C2

| Critère | C1 : n8n sur le VPS Hostinger du client | C2 : n8n chez Google, dans le même projet |
|---|---|---|
| Fournisseurs par client | 2 (Google + Hostinger) | **1** (Google) |
| Cession | 2 transferts | **1 transfert** |
| Accès de n8n à Cloud SQL | Par Internet : **Cloud SQL Auth Proxy** sur le VPS avec un compte de service limité (une clé de plus à garder sur le VPS), ou adresse publique + adresse du VPS autorisée + SSL obligatoire (**à vérifier dans leur documentation**) | **Connecteur Cloud SQL intégré** à Cloud Run (chiffré, contrôlé par IAM), sur une instance qui a **par défaut une adresse publique**. Un vrai réseau privé demande un VPC en plus ; la compatibilité de SQL Connect avec une instance sans adresse publique est **non vérifiée** |
| Guide officiel | Installation Docker classique | **Oui** : guide n8n « Deploy to Google Cloud Run » (docs.n8n.io, Hosting > Server setups > Google Cloud Run), lu le 25/11/2026 |
| Ce que le guide fait, à corriger | — | Base créée **sans sauvegarde** (`--no-backup`), plus petite taille (`db-f1-micro`), disque HDD, une seule zone ; image `n8nio/n8n:latest` (le guide lui-même dit que la version `stable` est faite pour la production) |
| Réglages indispensables | Version figée de l'image Docker | **Instances min = 1 ET max = 1** (toujours allumé, et jamais deux n8n en même temps : sinon planifications en double) ; CPU toujours alloué (`--no-cpu-throttling`, dans le guide) ; **image figée** (jamais `latest`) ; adresse publique des webhooks (`N8N_WEBHOOK_URL` depuis n8n 2.30.0, `WEBHOOK_URL` avant, d'après le guide) ; l'adresse `/healthz` entre en conflit avec les contrôles de Cloud Run (le guide le signale) |
| Points à tester | — | Au redéploiement, l'ancienne et la nouvelle version peuvent tourner un instant ensemble (doublon de planification ?) ; **disque éphémère** : fichiers binaires et nœuds communautaires perdus au redémarrage ; déclencheurs planifiés et webhooks (le guide n'en parle pas) |
| Clé de chiffrement n8n | Fichier sur le VPS, à sauvegarder | Secret Manager (recommandé par le guide) |
| Mises à jour de n8n | À ta charge (Docker) | À ta charge (changer la version de l'image, redéployer) ; système géré par Google |
| Sauvegardes | Volumes + instantanés Hostinger | **Désactivées par le guide** : à activer (quotidiennes + restauration à un instant donné) + export hors du projet + restauration essayée |
| Surveillance | Sonde à ajouter | Journaux et alertes Google |
| Coût | VPS : **à vérifier** | **Inconnu, à mesurer** (voir 10 bis.3) |

Variante de C2 : une petite VM Compute Engine avec Docker (plus proche de C1, mais un système à entretenir).

### 10 bis.3 Coûts

Sources : pages officielles de prix Firebase SQL Connect et Cloud SQL lues le 25/11/2026, **à revérifier par région** (Paris). Aucun chiffre ci-dessous n'est garanti.

| Poste | Chiffre | Statut |
|---|---|---|
| Plus petite instance Cloud SQL | Environ 9,37 $ par mois : un cœur **partagé** et environ 0,6 Go de mémoire, **partagés entre n8n et les données** en C2 | à revérifier ; probablement trop petit pour un client |
| Essai Cloud SQL gratuit | 3 mois sur Blaze, configuration par défaut ; **5 essais au plus par compte de facturation, un par projet, arrêté si on change la configuration** | à revérifier |
| SQL Connect | 250 000 opérations par mois incluses ; au-delà 0,90 $ par million (page lue le 25/11) | à revérifier |
| Stockage de la base, sauvegardes, trafic sortant | Non chiffrés | **à vérifier** |
| **n8n toujours allumé sur Cloud Run (C2)** | CPU toujours alloué, 24 h sur 24 : **probablement le plus gros poste** | **à calculer avec le calculateur de prix Google** |
| **Total C2 par client** | **Inconnu, à mesurer** pendant l'essai 0 bis | — |
| Repère A | Supabase Pro ≈ 25 $ par mois + VPS (à vérifier) | section 9 |

**Rien ne permet de dire aujourd'hui que C2 coûte moins cher que A.**

### 10 bis.4 Travail à prévoir (d'après le code)

| Travail | Ce que dit le code | Taille |
|---|---|---|
| Déplacer les tables Supabase des Achats vers Cloud SQL | Schéma et migrations dans le dépôt BTP (migration 034, `docs/reprise-prochaine-session.md`) | moyen |
| **Refaire la barrière d'accès** | Aujourd'hui la barrière est **dans la base** : fonctions SQL qui lisent le jeton, refus SQL `acces_base_refuse` (`js/os/supabase.js:66-67, 90-91`, `docs/modules-achats.md`). SQL Connect se connecte avec **son propre compte de service** : tout l'accès est à réécrire (règles `@auth` ou contrôles dans les fonctions) et à retester | **moyen, Fable obligatoire** |
| Remplacer la couche du navigateur | Deux fichiers seulement importent `js/os/supabase.js` : `js/os/acces-base.js` et `js/os/actions-metier.js`. Les 18 fichiers des Achats et des réglages passent par `acces-base.js`. Les gestes à refaire : `lire`, `appeler`, `lienPdf`, `demanderTicket`, `tester` (`js/os/supabase.js:169`) | voir ligne suivante |
| … avec SQL Connect | Environ 35 lectures génériques sur une vingtaine de tables et vues, et une dizaine de fonctions SQL (comptage de la relecture Fable, **non recompté**) ; **une requête déclarée par lecture** ; le SQL libre (« Native SQL ») est en **Preview** ; **deux maîtres du schéma** (migrations BTP + schéma SQL Connect) pendant que n8n écrit à côté | **gros** |
| … avec des fonctions serveur | Modèle existant : `functions/src/pilotage/postgres.js` (connexion Postgres, lecture seule, contrôles côté serveur) | moyen à gros ; **semble plus simple** (décision 1 bis) |
| Badge `espace_base`, `baseAccorderAcces`, Third-Party Auth | Servent à faire accepter un jeton Firebase par Supabase (`functions/src/index.js:124-127`) | Probablement inutiles en C : à retirer (petit), **après** que la nouvelle barrière est en place |
| PDF des factures (`lienPdf`) | Stockage Supabase | Vers Cloud Storage : petit à moyen |
| n8n branché sur Cloud SQL au lieu de Supabase | Workflows 02, 03, 05, 08 (dépôt BTP), ticket à usage unique | moyen |
| Pilotage et outils MCP du tableau de bord | `functions/src/pilotage/postgres.js` est écrit pour le **pooler de Supabase** (mode transaction) ; à brancher sur le connecteur Cloud SQL ; secret `SUPABASE_INDICATEURS` à renommer | **petit à moyen** |
| Appli BTP (`btp-assistant-mvp`), qui dépend aussi de Supabase | Hors de ce dépôt | **non vérifié** ; tant qu'elle tourne, Supabase reste chez toi |

### 10 bis.5 Ce que C change au chantier 0 et à la cession

| Sujet | A | C1 | C2 |
|---|---|---|---|
| Chantier 0 (sortir les identifiants du code) | Projets Google + adresse n8n + connexion Supabase par espace | **Le même chantier 0**, plus la connexion Cloud SQL par maison | Idem C1 ; l'adresse n8n devient celle du Cloud Run de la maison |
| Transferts à la cession | 3 (Google, Supabase, Hostinger) | 2 (Google, Hostinger) | **1 (Google)** |
| Comptes à retirer à la cession | Google, Supabase, SSH | Google, SSH, clé du proxy Cloud SQL | Google seulement |

Le chantier 0 sert **aussi bien à A qu'à C** : il peut partir tout de suite, l'essai C2 en parallèle.

### 10 bis.6 L'essai C2 (chantier 0 bis) : conditions écrites

| Condition | Pourquoi |
|---|---|
| **Nouveau projet Google séparé**, créé pour l'essai | Rien ne doit toucher ton CRM |
| Ni `chevalier-ia-os`, ni le n8n actuel, ni Supabase ne sont touchés | Idem |
| **Données fictives uniquement** | Les tables Achats contiennent de vraies données bancaires (IBAN de fournisseurs) |
| Code de l'essai sur une **branche jamais fusionnée** dans `main` | `main` se déploie tout seul sur ton CRM |
| **Alerte de budget** sur le compte de facturation de l'essai | Cloud Run toujours allumé coûte même sans usage |
| Réglages de 10 bis.2 appliqués (min = max = 1, image figée, sauvegardes activées, région Paris) | Mesurer le vrai coût, pas celui du guide |
| À mesurer : coût réel par jour, planifications (pas de doublon), webhooks, redéploiement, redémarrage (disque éphémère), restauration de la base | Lever les inconnues de C2 |
| **Suppression du projet à la fin** | Pas de coût ni de surface d'attaque oubliés |

### 10 bis.7 Comparaison A / B / C

| Critère | A : Google + Supabase + VPS | B : sans Google | C1 : Google + n8n sur VPS | C2 : tout Google |
|---|---|---|---|---|
| Fournisseurs par client | 3 | 2 | 2 | **1** |
| Travail de départ | Chantier 0 | Très gros | Chantier 0 + Achats sur Cloud SQL + nouvelle barrière d'accès | Idem C1 + n8n sur Cloud Run |
| Ce que le code sait déjà faire | Supabase par espace (branché les 24-25/11) | Peu | Firebase partout ; SQL Connect jamais utilisé | Idem C1 |
| Serveur à entretenir | VPS (n8n) | VPS (n8n, PDF) | VPS (n8n) | Aucun système (Cloud Run géré) ; n8n reste à mettre à jour |
| Sécurité | 3 consoles, 3 jeux de clés | 2 | 2 ; accès Internet à Cloud SQL à protéger | Un seul IAM ; connecteur chiffré, adresse publique par défaut |
| Coût par client | Supabase ≈ 25 $ par mois (à revérifier) + VPS (à vérifier) | à vérifier | Cloud SQL (à vérifier, probablement plus que 9,37 $) + VPS | **Inconnu, à mesurer** (n8n toujours allumé) |
| Départ du client | 3 transferts | 2 | 2 | **1** |
| Appli BTP | Inchangée | — | Reste sur Supabase | Idem |

### 10 bis.8 Recommandation (Jérôme décide)

| | |
|---|---|
| **C2 est la cible la plus simple à vivre et à céder** | Un fournisseur, une console, un IAM, une cession ; guide officiel n8n pour Cloud Run |
| **Mais C2 a trois inconnues** | n8n sur Cloud Run (planifications, redéploiement, disque éphémère) ; coût réel (n8n toujours allumé) ; effort de la nouvelle barrière d'accès (SQL Connect ou fonctions serveur) |
| **A reste le chemin le plus court vers le premier client** | Supabase par espace est déjà branché ; le chantier 0 suffit |
| **Attention aux deux déménagements** | Installer le pilote en A puis passer en C, c'est déménager ce client **deux fois** (Supabase → Cloud SQL) |
| **C1 est un compromis** | Retire Supabase, garde un VPS ; l'accès Internet à Cloud SQL est le point faible |
| Proposition | Lancer **tout de suite le chantier 0** (utile à A comme à C) et, **en parallèle, l'essai C2 dans un projet Google séparé** (10 bis.6) ; choisir A ou C2 pour le pilote **avec les résultats de l'essai** |

---

## 11. Décisions qui restent à Jérôme

| N° | Décision | À trancher avant |
|---|---|---|
| 1 | Scénario A, B, C1 ou C2 pour le pilote ? (proposition : chantier 0 tout de suite, essai C2 en parallèle dans un projet séparé, choix après l'essai) | Pilote |
| 1 a | Lancer l'essai C2 (projet Google séparé, alerte de budget, données fictives, projet supprimé à la fin) ? | Chantier 0 bis |
| 1 bis | En C : écrans vers Cloud SQL par SQL Connect, ou par des fonctions serveur (modèle `functions/src/pilotage/postgres.js`, qui semble plus simple) ? | Essai C2 |
| 1 ter | En C : l'appli BTP reste-t-elle sur Supabase (donc Supabase gardé chez toi), ou passe-t-elle aussi sur Cloud SQL ? | Essai C2 |
| 2 | `chevalier-ia-app` : garder, déménager, ou maison de démonstration ? | Fin des chantiers |
| 3 | Paquet d'une maison : « plateforme avec un client » (presque prêt) ou « racine » (gros chantier) ? | **Chantier 1** |
| 4 | Liste des maisons : variable GitHub ou dépôt privé (jamais le dépôt public) ? | Chantier 1 |
| 5 | Qui crée le compte Hostinger et l'organisation Supabase : toi pour le client, ou le client ? | Chantier 3 |
| 6 | Qui paie Google, Supabase, Hostinger : toi (refacturé) ou le client ? | Premier contrat |
| 7 | Offre Supabase d'un client (Pro conseillée pour les sauvegardes et l'absence de pause, à revérifier) | **Chantier 1** |
| 8 | Connexion : « avec Google » seulement, ou aussi par e-mail ? | Chantier 3 |
| 9 | Contrat de cession : droit d'usage du code, mises à jour après départ ? | **Premier contrat** |
| 10 | Nombre de vagues, client pilote ? | Chantier 2 |
| 11 | Workflows n8n et migrations Supabase : rapatriés dans ce dépôt, ou laissés dans le dépôt BTP ? | Chantiers 4 et 7 |
| 12 | Sauvegarde du VPS n8n : instantanés Hostinger, Backblaze, ou les deux ? | Pilote |
| 13 | Voie d'écriture des modules déplacés vers Supabase : n8n, fonction serveur, ou RLS ? | Premier déplacement |

---

## 12. Ordre de chantiers proposé (une PR par sujet)

| N° | Chantier | Taille | Fable | Dépend de |
|---|---|---|---|---|
| — | Décisions 3, 4 et 7 | — | — | — |
| 0 bis | **Essai C2, en parallèle du chantier 0** (conditions de 10 bis.6) : **nouveau projet Google séparé** ; ni `chevalier-ia-os`, ni le n8n actuel, ni Supabase touchés ; **données fictives** (les Achats contiennent de vrais IBAN) ; code sur une **branche jamais fusionnée** dans `main` ; **alerte de budget** ; région Paris ; n8n sur Cloud Run avec instances min = max = 1, image figée, `N8N_WEBHOOK_URL`, sauvegardes Cloud SQL activées ; un module Achats par SQL Connect ou par fonction serveur ; mesurer coût par jour, planifications, webhooks, redéploiement, redémarrage, restauration ; **projet supprimé à la fin** | moyen | **obligatoire** (sécurité, réseau) | décision 1 a |
| — | En C1 / C2, les chantiers 4 (Supabase) et 6 (VPS) changent : 4 devient « Cloud SQL + nouvelle barrière d'accès (SQL Connect `@auth` ou fonctions serveur) + retrait du badge `espace_base` » (gros, Fable obligatoire), 6 devient « n8n sur Cloud Run » (C2) ou reste « VPS + proxy Cloud SQL » (C1) | — | — | — |
| 0 | **Sortir du code tous les identifiants de projet**, adresses de fonctions, bucket, comptes de service, émetteur OAuth, adresse n8n, comptes autorisés (section 2.2) | moyen | **obligatoire** | — |
| 1 | Liste des maisons hors dépôt et paquet par maison (`scripts/hebergement.js`) | petit | oui (liens) | 0, décisions 3 et 4 |
| 2 | Workflow « Déployer une maison / une vague » : fédération d'identité sans clé, Environnement GitHub avec approbation par maison, **contrôle bloquant projet de la clé = projet de la maison = `projectId` du paquet** | moyen | **obligatoire** | 1 |
| 3 | Script « nouvelle maison » côté Google (section 4.3, client co-propriétaire, restriction de la clé web, CORS, sauvegardes) | moyen | **obligatoire** | 2 |
| 4 | Côté Supabase : projet, migrations (dépendance au dépôt BTP), Third-Party Auth, test « badge d'une autre maison refusé » | moyen | **obligatoire** | 3, décision 11 |
| 5 | Ouvrir aux clients ce qui manque (`tests/ecarts-fonctions.test.js:28-44`) : Achats (`baseAccorderAcces`, `base_parametres`), Pilotage, Veille, dépôt de documents, Maintenance, Buffer | moyen à gros (un module par PR) | **obligatoire** | 4 |
| 6 | Script « VPS + n8n » : SSH par clé, pare-feu, mises à jour automatiques, Docker, n8n figé, https, domaine, sauvegarde avec clé de chiffrement | moyen | **obligatoire** | décision 12 |
| 7 | Workflows n8n versionnés et déployés par vague (dépendance au dépôt BTP) | moyen | **obligatoire** | 6, décision 11 |
| 8 | **Surveillance + une restauration essayée par maison**. En C2 : sauvegardes Cloud SQL **désactivées par le guide n8n** (`--no-backup`) : à activer (quotidiennes + restauration à un instant donné) + export hors du projet + restauration essayée | moyen | **obligatoire** | 3, 4, 6 — **avant le pilote** |
| 9 | **Guide de cession** et liste des clés à refaire | petit | non (docs) | **avant la signature du premier contrat** |
| 10 | Console phase 2 : version par maison, cercles, alertes de dérive | moyen | **obligatoire** | 2 |
| 11 | Déplacements Firestore → base SQL de la maison (Supabase en A, Cloud SQL en C), un module par PR (section 5) | du petit au gros | **obligatoire** | décisions 1 et 13 |
| 12 | Selon la décision 2 : sort de `chevalier-ia-app` (migration de données : accord de Jérôme, jamais de nuit) | gros | **obligatoire** | décision 2 |

---

## 13. Ce que cette étude n'a pas vérifié

| Point | Pourquoi |
|---|---|
| Réglage réel de Supabase (Third-Party Auth, offre, sauvegardes) | Console Supabase non lue |
| Hébergeur et configuration du VPS n8n actuel | Absent du dépôt |
| Lignes citées par Fable et non relues une par une (`mcp-clients.js`, `porte.js`, `devis-pdf.js`, `oauth/page.js`, `clients/config.js`, `coeur/metier.js`, `console/appel.js`, `js/os/administrateur.js`, `scripts/porte/n8n.js`) | Les lignes principales de chaque catégorie ont été relues ; l'inventaire complet se fera au chantier 0 |
| Prix Supabase | Tirés de leur page publique : à revérifier en direct |
| Tout ce qui est marqué « à vérifier dans leur documentation » | Google, Supabase, Hostinger, n8n |
| Compatibilité du MCP avec les Edge Functions | Scénario B |
| Nombre exact de fichiers à toucher pour remplacer Firestore | Simple comptage `git grep` |
| Scénario C : disponibilité de SQL Connect à Paris, SQL Connect sans adresse publique, prix par région, comportement de n8n sur Cloud Run (planifications, redéploiement, disque éphémère) | À lever par l'essai 0 bis |
| Comptage « environ 35 lectures, une vingtaine de tables et vues, une dizaine de fonctions SQL » | Repris de la relecture Fable, non recompté |
