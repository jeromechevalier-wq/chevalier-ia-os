# Étude : réutiliser la coque de Chevalier IA OS pour les applis des clients (10/10/2026)

Demande de Jérôme : repartir de la même coque (interface graphique + accès MCP) pour les futures applis clientes, sans développer deux fois le même code. Les clients pourraient alors consulter et piloter leurs automatisations en parlant à leur assistant (ChatGPT, Claude). Cette étude lit le code de `main` (version 2.3.3) et dit **ce qui se réutilise, ce qui doit changer, dans quel ordre**. Rien n'est modifié dans l'appli.

**Mise à jour du 10/10/2026** : le travail OAuth de Jérôme est arrivé sur GitHub (PR n° 49, 40 tests) et **a été fusionné dans `main` le jour même, à 01:44 (heure de Paris)** ; le code est celui que l'étude a lu, sans changement. Jérôme a ensuite publié les règles Firestore et essayé la connexion : **le MCP répond depuis son téléphone (10/10/2026)**, ce qui termine l'étape 0. La section 6 est réécrite d'après ce code. **Jérôme a validé le même jour le modèle « une base pour tous les clients »** (section 5 bis), la connexion Google seule pour commencer, et une **page de connexion personnalisée par client** (section 5 ter) ; les sections 8 et 9 sont refaites en conséquence. Aucune taille en jours n'est annoncée : les tailles ci-dessous sont **relatives** (petit, moyen, gros).

## 1. Verdict

**Réutilisable : oui, avec un chantier de préparation modéré.** La coque est déjà bien découpée. Le gros du travail n'est pas d'écrire du neuf mais de **retirer l'identité de Jérôme du code** et de **ranger les comptes d'utilisateurs en un seul endroit**. Avec le modèle validé par Jérôme (une base pour tous les clients, une page de connexion par client), s'ajoutent un espace de données par client, l'appartenance des comptes à chaque client et l'isolation dans le MCP.

## 2. Ce qu'on a mesuré

| Zone | Lignes (JS et CSS) | Rôle |
|---|---|---|
| `js/os/` | 1 492 | la coque (connexion, menu, routage, thème, écrans communs) |
| `js/modules/crm/` | 5 387 | module CRM (propre à Jérôme) |
| `js/modules/projets/` | 2 665 | module Projets (propre à Jérôme) |
| `css/` | 1 002 | styles |
| `functions/src/coeur/` | 1 250 | écriture, lecture, audit, restauration (métier CRM) |
| `functions/src/mcp/` | 458 | serveur MCP et ses outils |
| `functions/src/securite/` | 172 | jetons, plafonds, journaux |
| `tests/` | 5 254 | tests |

La coque représente environ 15 % du code de l'écran (1 492 lignes sur 9 668, `main.js` compris). Le CRM et les Projets, qui n'iront pas chez un client, représentent l'essentiel.

## 3. Ce qui est déjà générique (à garder tel quel)

- **`js/os/modules.js`** : seule liste des modules. La coque ne connaît les modules que par ce fichier, et `js/os/` n'importe rien d'autre venant des modules. Ajouter un module = un dossier + une entrée.
- **Contrat de module** : chaque module expose `demarrer`, `arreter`, `afficher`, `reglages`, `actionsRapides`, `rechercher`. La recherche globale, les actions rapides et les réglages se branchent donc tout seuls.
- **`router.js`, `pwa.js`, `firebase.js`** : sans lien avec le métier.
- **Noms de collections Firestore par module** (`crm_*`, `projets_*`, `os_*`) : un module emporte ses collections avec lui, sans collision.
- **Serveur MCP** (`functions/src/mcp/`, `securite/`) : registre d'outils avec profils (`lecteur`, `bibliothecaire`, `claude-code`), plafonds par jeton, journal, audit. Le noyau est générique, seuls les outils sont du CRM.

## 4. Ce qui est lié à Jérôme (à sortir, fichier par fichier)

| Où | Quoi | Remède |
|---|---|---|
| `js/os/firebase-config.js` | clés du projet Firebase, **liste des deux comptes** et leurs portraits | fichier de configuration du client |
| `firestore.rules` | **les deux adresses** en dur dans `compteAutorise()` | lire les droits dans la base (collection `utilisateurs`) |
| `js/modules/crm/composants.js` (l. 82-83 et 310-311) | les deux adresses et leurs prénoms | lire la liste des utilisateurs |
| `js/modules/crm/logique.js` (l. 89, 744, 1694) | chemin du Drive de Jérôme, adresse de l'appli, prénoms | restent dans le module CRM (il ne part pas chez un client) |
| `functions/src/coeur/metier.js` (l. 9) | propriétaire par défaut = l'adresse de Jérôme | prendre le premier administrateur du projet |
| `js/os/shell.js` (l. 63, 103, 148, 151) | nom « Chevalier IA OS », lien `#/crm/accueil`, classe d'avatar `charles` / `jerome` | nom, logo et route d'accueil lus dans la configuration |
| `js/os/router.js` | route par défaut `crm/accueil` | route d'accueil donnée par le premier module actif |
| `js/os/celebrations.js` | texte « Facture payée, merci Charles ! » | module optionnel (voir ci-dessous) |
| `js/os/objectifs.js` | objectifs de chiffre d'affaires (le crochet `objectifsDepart` vient déjà des modules) | module optionnel « Objectifs » |
| `index.html`, `manifest.webmanifest` | titre, noms, couleurs, icônes, `start_url` | générés depuis la configuration |
| `css/tokens.css` | couleurs de la marque, **et** couleurs des étapes du pipeline CRM | marque dans le fichier du client, couleurs d'étapes dans `crm.css` |
| `assets/` | portraits, logos, polices | par client |
| `functions/src/oauth/config.js` (branche OAuth) | **sixième endroit** où les deux adresses sont écrites (un test les compare à `firestore.rules`) ; adresse de l'appli, adresses de retour de Claude seulement, profil unique `claude-code` | `utilisateurs` en base ; profil déduit du rôle ; adresses de retour par client MCP |
| `functions/src/index.js` et `gestionnaire.js` | région, compte de service `mcp-serveur@chevalier-ia-os…`, `ORIGINES_AUTORISEES`, nom du serveur `chevalier-ia-os` | tirés du nom du projet Firebase |
| `.github/workflows/firebase-hosting.yml` | identifiant du projet et nom du secret de déploiement en dur | variables par dépôt |
| `scripts/preparer-fonctions.js` | copie en dur `crm/logique.js` et `projets/logique.js` vers `functions/partage/` | parcourir les modules actifs |
| Versions | trois endroits : `version.json`, `js/os/version.js`, `functions/package.json` | une seule source |

Deux points méritent une explication.

- **Les comptes, aujourd'hui, sont à cinq endroits** (config, règles, composants, logique, métier du serveur). Pour un client, c'est le défaut principal : un oubli ouvre ou ferme un accès sans qu'on le voie.
- **Les règles Firestore ne sont pas déployées par le workflow** (publiées à la main dans la console). Pour des clients, un script doit les déployer, sinon chaque nouveau projet exige un geste manuel de plus.

## 5. Trois façons de réutiliser, et ma recommandation

| | A. Dépôt modèle copié | B. Coque installée comme paquet | C. Une seule appli pour tous les clients |
|---|---|---|---|
| Principe | un dépôt « coque » ; chaque client en reçoit une copie | la coque est un paquet versionné que chaque appli cliente importe | un seul projet Firebase, les clients séparés par un identifiant |
| Séparation des données | complète (un projet Firebase par client) | complète | **par les règles seulement** |
| Corriger un défaut une fois | non, à reporter dans chaque copie (par fusion depuis le dépôt modèle) | oui, on monte la version | oui |
| Complexité de départ | faible | moyenne | élevée (droits, facturation, export par client) |
| Facture Firebase | un projet par client | un projet par client | un seul |

**Première recommandation (écrite avant l'échange avec Jérôme) : A pour démarrer.** Elle écartait C, jugé risqué. **Cet avis est révisé : voir 5 bis.**

## 5 bis. Choix de Jérôme : plusieurs clients sur une même base (option C), avis révisé

Jérôme veut **une seule appli et plusieurs clients sur la même base Firestore**, protégés les uns des autres par la connexion et les règles. Son CRM reste un projet **à part**, jamais mélangé aux clients. Il paie lui-même Firebase pour ses premières applis. **Avis révisé : C est un bon choix pour un développeur seul** : une seule base de code vivante, une correction pour tous, pas de copies à fusionner (ce qui supprime le problème que A cherchait à résoudre). Conditions pour que ce soit sûr :

1. **Données rangées par client** : tout sous `clients/<identifiant>/…`, jamais de collection commune avec un champ « client ».
2. **L'identifiant du client est porté par la connexion** (droit attaché au compte ou fiche d'appartenance dans `utilisateurs`), jamais par une valeur envoyée par la page ou par l'assistant.
3. **Les règles Firestore protègent l'écran, pas le serveur.** Le serveur MCP et la fonction qui reçoit la progression de n8n lisent et écrivent avec les droits d'administration, qui contournent les règles. Leur isolation s'écrit **dans le code** : client déduit de l'identité authentifiée, toute requête limitée à son espace.
4. **Tests d'étanchéité** obligatoires à chaque modification : « le client A ne lit ni n'écrit rien chez B », à l'écran (émulateur, comme `regles.test.js`) et dans le MCP.
5. **Modules activables par client**, pour qu'un défaut ou un client particulier n'oblige pas à tout bloquer.
6. **Porte de sortie** : le code reste utilisable seul dans un projet dédié (un client exigeant, une exigence contractuelle) sans le réécrire.
7. **Outil de remise ou de suppression des données d'un client** (facile si tout est sous son espace), car l'export complet de Firestore prend tout le monde.

Compromis assumés : un déploiement défectueux touche tous les clients en même temps (les tests et l'activation par module le limitent) ; l'usage de tous s'additionne sur la facture de Jérôme (les plafonds par jeton existent déjà côté MCP).

Conséquence sur l'organisation du code : le CRM continue d'écrire à la racine (`crm_*`, rien n'est migré). Chaque module reçoit de la coque son **chemin de base** : la racine pour le CRM, `clients/<identifiant>` pour la plateforme clients. Le dépôt modèle du chantier 8 devient inutile.

**État : validé par Jérôme le 10/10/2026.** Les chantiers (section 8) en tiennent compte. Son CRM reste en dehors : projet Firebase séparé.

## 5 ter. Connexion et apparence de chaque client (validé par Jérôme le 10/10/2026)

**Objectif de Jérôme** : le client se sent chez lui dès la connexion, avec ses couleurs, son logo **et ses propres images** (par exemple une photo du bâtiment de son entreprise). Techniquement une seule page suffirait ; il veut quand même une page par client, avec son propre lien.

- **Un lien par client**, de la forme `<identifiant du projet>.web.app/espace/<client>` (chemin dans l'adresse, pas de sous-domaine par client : pas de domaine à ajouter par client dans Firebase ni dans les domaines autorisés de la connexion Google). Un nom de domaine propre à un client reste possible plus tard.
- **Pas de sous-domaine : l'adresse par défaut de Firebase** (décision de Jérôme, 10/10/2026), comme pour son CRM (`chevalier-ia-os.web.app`) et l'appli d'Audrey (`suivi-presence-eleves.web.app`). `app.chevalier-ia.fr` ne peut de toute façon pas porter la plateforme : il est servi par Hostinger (dossier `app/` du dépôt du site), et un domaine ne pointe que vers un seul hébergeur. Avantages : aucun réglage DNS dans Cloudflare, aucun domaine à ajouter à Firebase ni à la connexion Google (les adresses `.web.app` et `.firebaseapp.com` sont déjà autorisées). Contrepartie à connaître : le client voit une adresse `.web.app` et non celle de la marque de Jérôme. Un nom de domaine pourra être ajouté plus tard sans changer le code, mais **les clients qui auraient déjà installé l'appli sur leur téléphone devraient la réinstaller** (une appli installée est liée à son adresse) : à décider avant d'avoir beaucoup de clients installés, pas après.
- **Connexion Google seule pour commencer** (compte Google, pas forcément Gmail : une adresse professionnelle sur Google Workspace convient). Si un client n'a pas Google : un **lien de connexion envoyé par e-mail** (sans mot de passe) est le repli recommandé, et l'e-mail avec mot de passe est possible aussi. Deux détails à connaître : les règles exigent une adresse **vérifiée** (donc un e-mail de confirmation), et la porte OAuth du MCP n'accepte aujourd'hui que la connexion Google (contrôle à assouplir si on ajoute ces modes).
- **Un compte n'ouvre que l'espace dont il est membre.** Après la connexion, la page vérifie l'appartenance au client de ce lien. Si le compte appartient à un autre client, la page **déconnecte** et affiche « ce compte n'a pas accès à cet espace » : elle ne redirige jamais vers l'autre client et ne dit pas que le compte existe ailleurs.
- **Cette vérification de l'écran n'est que de l'affichage.** La vraie protection est dans les règles Firestore et dans le code du MCP, qui contrôlent l'appartenance à chaque lecture et à chaque écriture.
- **Un compte peut appartenir à plusieurs clients** (Jérôme, un consultant) : c'est le lien utilisé qui choisit l'espace ouvert. L'appartenance est donc une **liste par client** (`clients/<client>/membres/<e-mail>` avec le rôle), pas un identifiant unique attaché au compte.
- **Le MCP suit la même logique** : un lien par client (`…/mcp/<client>`). Le client l'ajoute dans son assistant, et l'écran « Autoriser … à accéder à … » prend ses couleurs.
- **Limite incontournable** : l'écran de choix de compte de **Google** est le même pour tous les clients (il affiche le nom du projet). Tout le reste, avant et après, est à leurs couleurs.
- **Option, plus tard** : l'icône et le nom de l'appli installée sur le téléphone, par client, demandent un manifeste par client (généré par une fonction). Non nécessaire au départ.
- **L'identifiant du projet Firebase de la plateforme clients est définitif** (il ne se change pas après la création) **et il devient visible dans l'adresse de chaque client** : `<identifiant>.web.app/espace/dupont`. Il se choisit donc avec soin (court, sans le mot « test », lisible au téléphone). Choisi le 10/10/2026 : `chevalier-ia-app`. Le nom de la coque n'est pas nécessaire ; le nom affiché du projet reste modifiable.

## 5 quater. Portail de démo sur `app.chevalier-ia.fr` (idée de Jérôme, 10/10/2026)

`app.chevalier-ia.fr` devient **un portail de démos**, pas une plateforme (cohérent avec la décision du 28/09/2026 sur la vitrine de solutions). Précision sur Audrey : sa vraie appli tourne sur Firebase ; l'adresse `app.chevalier-ia.fr/suivi-eleves-yoga/audrey/` n'est plus qu'une page de redirection.

- **Décidé** : le portail affiche des **vignettes** (une par solution, à la DA de la solution). Un clic **redirige directement vers l'adresse Firebase par défaut** de l'appli, en mode démo. Aucun sous-domaine intermédiaire.
- **Les vraies applis des clients n'apparaissent jamais** dans le portail.
- **Cibles possibles** : démo d'Audrey (`suivi-presence-eleves.web.app/?demo`, existe déjà) ; démo de la plateforme clients (client fictif « démo », `<identifiant>.web.app/espace/demo`).
- **Proposé par Claude, non contredit, à confirmer** : la démo ne demande **aucune connexion** à un prospect (il n'a pas de compte). Elle s'ouvre sur l'écran de connexion personnalisé du client fictif, qui montre l'effet « chez soi » (couleurs, images), avec un bouton **« Entrer dans la démo »**, sans Google. Les données sont inventées et rien de réel n'est lu ni écrit. Reste à choisir : démo en lecture seule, démo calculée dans le navigateur du visiteur (comme `?demo` chez Audrey), ou démo remise à zéro chaque nuit.
- **Plus tard** : un contrôle automatique qui ouvre chaque démo une fois par jour, pour repérer une démo cassée par l'évolution de l'appli.
- **Précaution** : le portail vit dans le dépôt `site-chevalier-ia`, qui est le site public ; rien n'y est poussé sans l'accord explicite de Jérôme.

## 6. L'OAuth du MCP : ce que le code de Jérôme apporte, ce qu'il reste à généraliser

Lu le 10/10/2026 dans la branche `claude/eager-allen-jht9kf` (PR n° 49, fusionnée dans `main` ; documentation : `docs/mcp-oauth.md`). Le code est dans `functions/src/oauth/` (509 lignes : `config.js`, `identite-google.js`, `magasin.js`, `page.js`, `routeur.js`) avec 40 tests et un test navigateur.

**Ce qui est déjà fait, et bien fait (donc réutilisable tel quel)**
- La **seconde porte** de `/mcp` : métadonnées de découverte, enregistrement du client, écran d'autorisation, échange de code, renouvellement. La porte des jetons `cia_…` (Hermes, Claude Code) ne change pas.
- La connexion Google est **revérifiée côté serveur** (signature, adresse vérifiée, compte autorisé) : la page peut être falsifiée sans effet.
- PKCE obligatoire ; code à usage unique de 60 s ; jeton d'accès d'une heure ; renouvellement qui consomme l'ancien jeton ; **un jeton rejoué coupe toute la connexion** ; seules des empreintes sont gardées ; limites de requêtes ; révocation immédiate dans la collection `mcp_oauth`.
- Le point d'accrochage est exactement celui que l'étude supposait : `oauth.verifierAcces(bearer)` renvoie la même forme qu'un jeton (`acteur`, `profil`), donc profils, plafonds, audit et outils ne changent pas.

**Ce qu'il reste à généraliser pour des clients** (rien de cela n'est une erreur : le code a été écrit pour les deux comptes de Jérôme, comme demandé)
1. **Les comptes** : `COMPTES_AUTORISES` dans `oauth/config.js` est une liste en dur de plus. Elle doit lire `utilisateurs` (e-mail, rôle, client).
2. **Le profil** : `PROFIL_OAUTH = 'claude-code'` donne tous les droits, suppression comprise, à toute connexion. Choix voulu pour Jérôme. Pour un client, le profil doit se déduire de son rôle (`lecteur` ou `bibliothecaire`).
3. **L'identité du client dans la connexion** : la connexion OAuth enregistrée dans `mcp_oauth` doit porter l'identifiant du client (voir la section 5 bis sur le choix multi-clients). Le serveur MCP lit avec les droits d'administration, qui **contournent les règles Firestore** : l'isolation entre clients doit y être écrite dans le code, jamais déduite d'un paramètre envoyé par l'assistant.
4. **Les adresses de retour** : seules celles de Claude sont acceptées (`claude.ai` et `claude.com`). **ChatGPT n'y est pas.** Il faut relever l'adresse de retour de ChatGPT et les exigences de son connecteur, puis l'ajouter (liste par client MCP). Non vérifié pour cette étude.
5. **Les textes et l'émetteur** : « Autoriser Claude à accéder à Chevalier IA OS » et l'adresse de l'émetteur (`EMETTEUR`, `ORIGINES_AUTORISEES`) sont en dur ; ils viennent de la configuration du client.
6. **Les noms d'acteur** : `claude-ai-<compte>` ne dit pas quel assistant s'est connecté. À prévoir si on branche plusieurs assistants.

**Fait le 10/10/2026** : fusion, règles Firestore publiées par Jérôme dans la console (bloc `mcp_oauth`), essai réel : le MCP répond depuis son téléphone. Le code n'a pas été essayé avec la vraie connexion Google ni avec le vrai claude.ai (la doc de la branche le dit).

## 7. Premier module client : suivi des automatisations

C'est le module qui donne son sens à la coque chez un client. Esquisse, à valider avant de construire.

- **Données** : collection `auto_lancements` (un document par lancement : identifiant unique, automatisation, état, étape active, liste des étapes, dates, résumé) et `auto_automatisations` (la fiche de chaque automatisation : nom, description, étapes prévues). Un même format pour toutes les automatisations.
- **Écrans** : liste des automatisations avec le compte du mois ; page d'un lancement avec la frise d'étapes mise à jour en direct (écoute Firestore, sans serveur) ; chiffres mensuels.
- **Écriture par n8n** : le workflow écrit sa progression à chaque étape. Il faut une porte sûre pour cela : de préférence **une petite fonction « écrire une progression »** protégée par un jeton de service (la mécanique des jetons de `securite/` existe déjà), plutôt qu'un accès direct à Firestore avec un compte de service stocké dans n8n.
- **Outils MCP du client** (peu nombreux, volontairement) : `lister_automatisations`, `voir_lancement`, `chiffres_du_mois`, et, si le client le veut, `relancer`. Le module déclare ses outils et ses écrans au même endroit (voir le chantier 7).

## 8. Chantiers, dans l'ordre (refaits pour « une base pour tous les clients »)

Tailles relatives, pas des durées. Chaque ligne est une PR. Le CRM de Jérôme reste à la racine de sa propre base et n'est pas migré.

**Étape 0 : avant tout.** **Terminée le 10/10/2026** : la PR n° 49 (OAuth) est fusionnée, les règles `mcp_oauth` sont publiées, l'essai réel avec le téléphone est réussi.

| # | Chantier | Taille | Dépend de |
|---|---|---|---|
| 1 | **Projet Firebase de la plateforme clients** (identifiant soigné, car visible dans l'adresse de chaque client ; forfait payant, compte de service, règles de départ « tout refusé »), séparé du CRM ; adresse par défaut `<identifiant>.web.app` (pas de sous-domaine) | petit | — |
| 2 | **Chemin de base donné aux modules** : le CRM garde la racine, un module client écrit sous `clients/<client>/…` | moyen | — |
| 3 | ✅ **Appartenance par client** (`clients/<client>/membres/<e-mail>` avec rôle) ; règles Firestore par chemin ; `auth.js` et `compteAutorise` la lisent | moyen (sensible : sécurité) | 1, 2 |
| 4 | **Tests d'étanchéité** à l'écran (émulateur) : « le client A ne lit ni n'écrit rien chez B », à relancer à chaque modification | moyen | 3 |
| 5 | ✅ **Fiche de marque et page de connexion par client** (`/espace/<client>`, images, texte d'accueil, refus neutre d'un compte d'un autre client) ; téléversement des images par Jérôme | moyen | 3 |
| 6 | **Retirer l'identité de Jérôme de la coque** : nom, logo, textes, route d'accueil lus dans la marque ; `index.html` et titres ; couleurs de marque séparées des couleurs d'étapes du CRM | moyen | 5 |
| 7 | **Un module déclare écrans et outils MCP** ; modules actifs par client (activables un à un) | moyen | 2 |
| 8 | **Objectifs et célébrations** sortis de la coque, module optionnel du CRM | petit | 6 |
| 9 | **MCP multi-clients** : client déduit de l'identité authentifiée, jamais d'un paramètre ; lien `…/mcp/<client>` ; isolation écrite dans le code (le MCP contourne les règles) | gros (sensible) | 3, 7 |
| 10 | **Tests d'étanchéité du MCP** | moyen | 9 |
| 11 | **OAuth pour les clients** (base de la PR n° 49, fusionnée) : comptes lus dans les membres, profil déduit du rôle, client porté par la connexion, écran d'autorisation à ses couleurs, adresse de retour de ChatGPT, noms d'acteur | moyen | 0, 9 |
| 12 | **Déploiement** : règles Firestore déployées par le workflow, une seule source de version, workflow paramétré | petit | 1 |
| 13 | **Outil « nouveau client »** (fiche de marque, images, premier membre, modules actifs) et outil de **remise ou suppression** des données d'un client | moyen | 3, 5 |
| 14 | **Module « suivi des automatisations »** et fonction « écrire une progression » (jeton de service par client) | gros | 7, 9 |
| 15 | **Connexion par lien envoyé par e-mail** (si un client n'a pas Google) | petit | 3 |
| 16 | **Option : manifeste par client** (icône et nom de l'appli installée) | petit | 5 |

**Chantier 1, état (10/10/2026)** : projet `chevalier-ia-app` créé par Jérôme. Dans le dépôt : alias `plateforme` dans `.firebaserc` (le CRM reste `default` = `chevalier-ia-os`), règles « tout refusé » dans `firestore.plateforme.rules`, configuration de déploiement séparée `firebase.plateforme.json` (le `firebase.json` du CRM n'est pas modifié, sauf deux fichiers ajoutés à la liste des fichiers non publiés). **Non publié** : pour publier les règles, après l'accord de Jérôme : `firebase deploy --only firestore:rules --config firebase.plateforme.json --project plateforme`. Le CRM se déploie toujours comme avant (`--project default`, ou le workflow GitHub, qui cible `chevalier-ia-os` par son nom).

**Règles « tout refusé » publiées sur chevalier-ia-app le 10/10/2026** (chantier 1 terminé).

**Chantier 2, état (10/10/2026, PR en attente du « fusionne »)** : nouveau fichier `js/os/chemins.js` (sans dépendance, testé seul) : `cheminCollection(base, nom)` ajoute le préfixe, `cheminBaseClient(client)` donne `clients/<client>`, `normaliserBase` refuse tout chemin douteux. La coque passe `cheminBase` à `demarrer({ compte, cheminBase })` de chaque module (aujourd'hui `''` = la racine, donc le CRM est strictement identique). Les modules CRM et Projets passent par `chemin(nom)` dans leurs `donnees.js` ; les **plans d'écriture** de `logique.js` (partagés avec `functions/`) gardent leurs noms de collection nus, le préfixe n'est ajouté qu'au moment de parler à Firestore (le serveur MCP n'est pas touché : chantier 9). Projets exige le même chemin de base que le CRM. **Restent pour la suite** : `js/os/objectifs.js` (collections `os_objectifs*` à la racine, sortira de la coque au chantier 8), `firestore.rules` (règles par chemin : chantier 3), et le choix du client dans `main.js` (chantiers 3 et 5). Tests : `tests/chemins.test.js`.

**Chantier 3, état (10/10/2026, PR en attente du « fusionne »)** : **appartenance par client**. Modèle : `clients/<client>/membres/<e-mail en minuscules>` avec un champ `role`. **Deux rôles** (proposition, à valider par Jérôme) : `editeur` (lit et écrit chez son client) et `lecteur` (lit seulement). Un compte peut avoir une fiche chez plusieurs clients, avec un rôle différent à chacun. Règles dans `firestore.plateforme.rules` (**non publiées**) : tout est refusé par défaut ; un compte à e-mail vérifié lit sous `clients/<son client>/…` s'il a une fiche (éditeur ou lecteur), écrit s'il est éditeur ; rien à la racine, rien chez un autre client, rien sur le document `clients/<client>` lui-même. **Les fiches d'appartenance ne s'écrivent jamais depuis un navigateur** : on ne peut ni s'ajouter, ni changer son rôle, ni retirer quelqu'un ; elles sont créées par le serveur (outil « nouveau client », chantier 13 ; d'ici là, à la main dans la console Firebase). Chacun lit **sa propre fiche** seulement (pas de liste des membres). Côté code : `js/os/membres.js` (logique pure, testée seule) et `auth.js` : `surveillerCompte(rappel, { client })` lit la fiche du client demandé ; **sans option, le CRM de Jérôme est strictement inchangé** (`compteAutorise`, liste fixe, `firestore.rules` non touché). Rien ne passe encore `client` : le choix du client par le lien `/espace/<client>` viendra au chantier 5. Tests : `tests/regles-plateforme.test.js` (règles, émulateur) et `tests/membres.test.js`. **Pas de rôle « administrateur » du client** pour l'instant : gérer les membres est réservé à Jérôme (serveur). À décider plus tard si un client doit gérer ses propres membres.

**Chantier 5, état (11/10/2026, PR en attente du « fusionne »)** : **fiche de marque et page de connexion par client**. Rien n'est publié ni déployé.
- **Fiche de marque** : document Firestore `marques/<client>` (collection à part, pas sous `clients/`, pour ne rien ouvrir de l'espace privé du client). Champs : `actif` (booléen, obligatoire), `nom`, `couleur` (`#rgb` ou `#rrggbb`), `logo` (adresse https), `images` (jusqu'à 4, adresse https ou `{ url, alt }` ; la première sert de fond), `accueil` (texte, 500 caractères au plus). **Visuel seulement : rien de confidentiel, car lisible sans connexion.**
- **Règles** (`firestore.plateforme.rules`, non publiées) : lecture d'**un document précis** autorisée à tous si `actif == true`, **jamais de liste**, **jamais d'écriture** depuis un navigateur. Une fiche absente et une fiche inactive sont refusées de la même façon : on ne peut pas deviner quels clients existent. La fiche ne donne aucun droit sur les données ni sur les membres (testé).
- **Images** : Firebase Storage, dossier `marques/<client>/`. Règles dans **`storage.plateforme.rules`** (non publiées) : lecture d'un fichier précis pour tous, pas de liste, aucune écriture depuis un navigateur, tout le reste refusé. Déclarées dans `firebase.plateforme.json` ; le `firebase.json` du CRM n'a pas de bloc Storage.
- **Page `#/espace/<client>`** (`js/os/espace.js`, logique pure dans `js/os/marque.js`) : lit la fiche, applique nom, couleur, logo, images, texte ; bouton « Se connecter avec Google » ; après connexion, `surveillerCompte(…, { client })` vérifie l'appartenance. **Refus identique** (« Ce compte n'a pas accès à cet espace. ») pour un compte inconnu et pour un membre d'un autre client : le compte est déconnecté, on reste sur la page du client, rien n'est dit sur les autres clients. Client inconnu, fiche inactive ou adresse mal formée : page neutre « Espace indisponible » (sans bouton de connexion). Réseau en panne : page « Chargement impossible » avec « Réessayer ». Après la connexion, la page affiche seulement un accueil provisoire (nom, e-mail, rôle, déconnexion) : les écrans du client viennent avec les chantiers 6 et 7.
- **Lien court** : `/espace/<client>` (adresse sans `#`) est redirigé par `espace/index.html` vers `/#/espace/<client>` (règle de réécriture ajoutée à `firebase.json`, seul changement de ce fichier avec la liste des fichiers non publiés ; le CRM à la racine est strictement inchangé). Seul un identifiant de la forme attendue est repris.
- **Lisibilité** : le texte du bouton est noir ou blanc selon la couleur de marque (contraste d'au moins 4,5 garanti, même pour un jaune pâle) ; la couleur de marque utilisée comme trait ou texte est éclaircie si elle serait illisible sur le fond sombre ; une photo de fond est recouverte d'un voile sombre ; boutons de 52 px, focus visible, marges de sécurité des téléphones.
- **À faire par Jérôme avant que ça serve** : (1) activer Storage dans la console (clics dans la PR) ; (2) publier les règles Firestore et Storage ; (3) envoyer les images dans `marques/<client>/` et créer la fiche `marques/<client>` (à la main dans la console, ou par l'outil « nouveau client » du chantier 13) ; (4) **le déploiement de la page sur `chevalier-ia-app.web.app` relève du chantier 12** : `js/os/firebase-config.js` pointe encore sur le projet du CRM (`chevalier-ia-os`) ; la page client doit lire la base `chevalier-ia-app`, donc le déploiement de la plateforme devra fournir sa propre configuration.
- **Limite connue** : l'écran de choix de compte de Google est le même pour tous les clients (il affiche le nom du projet Firebase). Tout le reste, avant et après, est à leurs couleurs.
- Tests : `tests/marque.test.js` (logique pure et contrôles statiques), `tests/regles-plateforme.test.js` (M1 à M7), `tests/regles-storage.test.js` (émulateur Storage, `npm run test:storage`), `tests/e2e/espace.spec.js` (navigateur, ordinateur et téléphone).

**Ordre conseillé** : étape 0, puis 1, 2, 3, 4, 12, 5, 6, 7, 8, 9, 10, 11, 13, puis 14 (la démo à montrer à un client), 15 et 16 selon les besoins. Le dépôt modèle de la première version de l'étude disparaît : il n'y a plus de copies à tenir à jour.

**Risques principaux**
- **L'isolation du MCP (chantier 9)** : le serveur lit avec les droits d'administration. Une requête non limitée à l'espace du client exposerait ses données à un autre. Aucune mise en ligne du MCP multi-clients sans le chantier 10.
- **Les règles Firestore** : un blocage de la base touche tous les clients. Publication en deux temps (comme pour l'audit de l'écran, `audit-ecran.md`) et tests d'étanchéité avant toute publication.
- **Un déploiement défectueux** touche tous les clients en même temps ; l'activation des modules un à un et les tests le limitent.

## 9. Décisions

**Prises par Jérôme (10/10/2026)**
- Il **paie lui-même Firebase** pour ses premières applis clientes.
- Son **CRM est détaché** des projets clients (projet Firebase séparé).
- **Une seule base pour tous les clients**, séparés par les règles et par le code du MCP (section 5 bis).
- **Connexion Google seule pour commencer** ; e-mail ou lien par e-mail ajouté seulement si un client n'a pas Google.
- **Une page de connexion et un lien par client**, entièrement personnalisés, images propres au client comprises (section 5 ter).
- **Pas de RGPD pour l'instant** (maintenu). À prévoir comme sujet commercial : un client peut demander un contrat de sous-traitance quand ses données sont hébergées chez lui.
- **Le nom de la coque n'est pas nécessaire** pour construire ; seul l'identifiant du projet Firebase est définitif et se choisit neutre.

- **Jérôme envoie lui-même les images des clients** (le client ne téléverse rien).
- **Pas de sous-domaine pour la plateforme** : adresse Firebase par défaut (section 5 ter).
- **Les liens des clients ont la forme `/espace/<client>`** (et non `/c/<client>`), choisi par Jérôme le 10/10/2026 : plus lisible, et le préfixe évite qu'un nom de client entre en conflit avec les adresses techniques (`/mcp`, `/oauth`, `/.well-known`, dossiers `css` et `js`).
- **Identifiant du projet Firebase : `chevalier-ia-app`** (numéro 192468914925, nom affiché « Chevalier IA - Serveur 1 »), donc `chevalier-ia-app.web.app/espace/<client>`. Le nom `chevalier-ia` (proposé d'abord par Jérôme le 10/10/2026) n'a pas été retenu : le projet a été créé sous `chevalier-ia-app` (le repli prévu). Forfait Blaze, budget 5 €, Google Sign-In activé, Firestore (default) en europe-west9 mode production, application web enregistrée.
- **`app.chevalier-ia.fr` = portail de démos** avec vignettes qui redirigent directement vers l'adresse Firebase de la démo (section 5 quater).
- **Étape 0 (OAuth du MCP) terminée.**

**À décider plus tard**
1. **Pour quel client est faite la première démo** : pas encore connu. Cela fixe seulement le contenu du module de suivi ; on peut commencer par une démo avec des automatisations fictives.
2. **La forme de la démo** : lecture seule, calculée dans le navigateur, ou remise à zéro chaque nuit ; et la confirmation du bouton « Entrer dans la démo » sans connexion (section 5 quater).

## 10. Ce que cette étude n'a pas vérifié

- Le comportement réel de la branche OAuth : lue, mais ni exécutée ni essayée avec la vraie connexion Google ni le vrai claude.ai.
- Les exigences actuelles de ChatGPT et de Claude pour un connecteur MCP personnalisé (connexion, abonnement requis, validation par un administrateur). À relire avant le chantier 11.
- Le forfait Firebase exact nécessaire pour un projet client (Blaze pour les fonctions : à confirmer en créant le premier).
- Les tests : 5 254 lignes ; une partie dépend des noms de Jérôme et devra suivre les chantiers 1 à 3. Non détaillé ici.
