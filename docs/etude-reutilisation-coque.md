# Étude : réutiliser la coque de Chevalier IA OS pour les applis des clients (10/10/2026)

Demande de Jérôme : repartir de la même coque (interface graphique + accès MCP) pour les futures applis clientes, sans développer deux fois le même code. Les clients pourraient alors consulter et piloter leurs automatisations en parlant à leur assistant (ChatGPT, Claude). Cette étude lit le code de `main` (version 2.3.3) et dit **ce qui se réutilise, ce qui doit changer, dans quel ordre**. Rien n'est modifié dans l'appli.

**Mise à jour du 10/10/2026** : le travail OAuth de Jérôme est arrivé sur GitHub (branche `claude/eager-allen-jht9kf`, commit `abb7cb9`, pas encore fusionné ni publié). La section 6 est réécrite d'après ce code. Aucune taille en jours n'est annoncée : les tailles ci-dessous sont **relatives** (petit, moyen, gros).

## 1. Verdict

**Réutilisable : oui, avec un chantier de préparation modéré.** La coque est déjà bien découpée. Le gros du travail n'est pas d'écrire du neuf mais de **retirer l'identité de Jérôme du code** et de **ranger les comptes d'utilisateurs en un seul endroit**.

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

**État : proposé par Jérôme, avis favorable de Claude, à confirmer par lui avant de mettre à jour la liste des chantiers (section 8).**

## 6. L'OAuth du MCP : ce que le code de Jérôme apporte, ce qu'il reste à généraliser

Lu le 10/10/2026 dans la branche `claude/eager-allen-jht9kf` (documentation : `docs/mcp-oauth.md` sur cette branche). Le code est dans `functions/src/oauth/` (509 lignes : `config.js`, `identite-google.js`, `magasin.js`, `page.js`, `routeur.js`) avec 39 tests et un test navigateur.

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

**Reste à faire sur la branche elle-même, avant tout** : fusion (le « fusionne » de Jérôme), publication des règles Firestore dans la console (nouveau bloc `mcp_oauth`), puis essai réel avec le téléphone. Le code n'a pas été essayé avec la vraie connexion Google ni avec le vrai claude.ai (la doc de la branche le dit).

## 7. Premier module client : suivi des automatisations

C'est le module qui donne son sens à la coque chez un client. Esquisse, à valider avant de construire.

- **Données** : collection `auto_lancements` (un document par lancement : identifiant unique, automatisation, état, étape active, liste des étapes, dates, résumé) et `auto_automatisations` (la fiche de chaque automatisation : nom, description, étapes prévues). Un même format pour toutes les automatisations.
- **Écrans** : liste des automatisations avec le compte du mois ; page d'un lancement avec la frise d'étapes mise à jour en direct (écoute Firestore, sans serveur) ; chiffres mensuels.
- **Écriture par n8n** : le workflow écrit sa progression à chaque étape. Il faut une porte sûre pour cela : de préférence **une petite fonction « écrire une progression »** protégée par un jeton de service (la mécanique des jetons de `securite/` existe déjà), plutôt qu'un accès direct à Firestore avec un compte de service stocké dans n8n.
- **Outils MCP du client** (peu nombreux, volontairement) : `lister_automatisations`, `voir_lancement`, `chiffres_du_mois`, et, si le client le veut, `relancer`. Le module déclare ses outils et ses écrans au même endroit (voir la tâche 3 ci-dessous).

## 8. Chantiers, dans l'ordre

Tailles relatives, pas des durées. Chaque ligne est une PR.

| # | Chantier | Taille | Dépend de |
|---|---|---|---|
| 1 | **Fichier de configuration du client** (nom, logo, couleurs, route d'accueil, modules actifs) ; `index.html` et `manifest` générés ; `tokens.css` séparé en marque et étapes CRM | moyen | — |
| 2 | **Comptes dans la base** : collection `utilisateurs` avec rôle ; `auth.js`, `firestore.rules`, `composants.js`, `metier.js` **et `oauth/config.js`** la lisent ; migration des deux comptes actuels | moyen (sensible : touche la sécurité) | fusion de la branche OAuth |
| 3 | **Un module déclare écrans et outils MCP** ; `outils/index.js` assemble les outils des modules actifs ; `preparer-fonctions.js` parcourt les modules | moyen | — |
| 4 | **Objectifs et célébrations** deviennent un module optionnel ; la coque n'a plus de texte propre à Jérôme | petit | 1 |
| 5 | **Serveur MCP paramétré** (région, compte de service, origines, nom) ; point d'accrochage « authentifier la requête » | moyen | 2 |
| 6 | **Déploiement paramétré** : workflow GitHub en variables ; règles Firestore déployées par le workflow ; une seule source de version | petit | 1 |
| 7 | **Script « nouveau client »** : crée le dépôt depuis le modèle, remplit la configuration, crée le projet Firebase, déploie, crée le premier utilisateur | moyen | 1, 2, 6 |
| 8 | **Dépôt modèle** et règle de fusion des corrections (`git merge coque/main`) — **inutile si l'option C est confirmée** (section 5 bis) | petit | 1 à 7 |
| 9 | **Module « suivi des automatisations »** et fonction « écrire une progression » | gros | 3, 8 |
| 10 | **OAuth du MCP pour les clients** : base déjà écrite (branche `claude/eager-allen-jht9kf`) ; reste profil par rôle, client dans la connexion, adresse de retour de ChatGPT, textes par client | moyen (au lieu de gros) | 2, 5, fusion et essai réel de la branche OAuth |

**Ordre conseillé : 1, 3, 2, 4, 5, 6, 7, 8, puis 9, puis 10.** Le chantier 2 est mis après 1 et 3, et après la fusion et l'essai réel de la branche OAuth, pour ne pas toucher à la sécurité sur deux fronts à la fois. Après 8, on dispose d'une coque clonable avec connexion et module vide ; le 9 donne la démo à montrer à un client ; le 10 ouvre l'accès par l'assistant.

**Risque principal** : le chantier 2 touche aux règles de sécurité de la vraie base de Jérôme. À faire sur une copie de la base (émulateur) puis avec une publication des règles en deux temps, comme pour l'audit de l'écran (`audit-ecran.md`), pour ne jamais se retrouver bloqué dehors.

## 9. Décisions

**Prises par Jérôme (10/10/2026)**
- Il **paie lui-même Firebase** pour ses premières applis clientes.
- Son **CRM est détaché** des projets clients (projet Firebase séparé).
- **Pas de RGPD pour l'instant** (maintenu). À prévoir comme sujet commercial : un client peut demander un contrat de sous-traitance quand ses données sont hébergées chez lui.
- **Le nom de la coque n'est pas nécessaire** pour construire : « la coque » suffit, le nom sera pris dans la configuration le moment venu.

**À confirmer**
1. **Une base pour tous les clients (option C, section 5 bis)** : oui ou non ? Si oui, la section 8 est mise à jour (espace par client, isolation du MCP, tests d'étanchéité ; fin du dépôt modèle).
2. **Premier client pour la démo** : le client du workflow Gmail est-il le bon ? Cela fixe le contenu du module « suivi des automatisations ».
3. **Connexion des clients** : compte Google seulement, ou aussi e-mail et mot de passe ? (Un client sans compte Google ne pourrait pas se connecter.)

## 10. Ce que cette étude n'a pas vérifié

- Le comportement réel de la branche OAuth : lue, mais ni exécutée ni essayée avec la vraie connexion Google ni le vrai claude.ai.
- Les exigences actuelles de ChatGPT et de Claude pour un connecteur MCP personnalisé (connexion, abonnement requis, validation par un administrateur). À relire avant le chantier 10.
- Le forfait Firebase exact nécessaire pour un projet client (Blaze pour les fonctions : à confirmer en créant le premier).
- Les tests : 5 254 lignes ; une partie dépend des noms de Jérôme et devra suivre les chantiers 1 à 3. Non détaillé ici.
