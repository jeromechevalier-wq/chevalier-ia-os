# Étude : réutiliser la coque de Chevalier IA OS pour les applis des clients (10/10/2026)

Demande de Jérôme : repartir de la même coque (interface graphique + accès MCP) pour les futures applis clientes, sans développer deux fois le même code. Les clients pourraient alors consulter et piloter leurs automatisations en parlant à leur assistant (ChatGPT, Claude). Cette étude lit le code de `main` (version 2.3.3) et dit **ce qui se réutilise, ce qui doit changer, dans quel ordre**. Rien n'est modifié dans l'appli.

**Limite de l'étude** : le travail OAuth de Jérôme est en cours sur son Mac et n'est dans aucune branche GitHub au 10/10/2026. Les passages OAuth (section 6) sont donc des hypothèses à confronter à son travail. Aucune taille en jours n'est annoncée : les tailles ci-dessous sont **relatives** (petit, moyen, gros).

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

**Recommandation : A pour démarrer, avec une discipline qui prépare B.** Un client ne touche qu'un petit nombre de fichiers (configuration, modules propres à lui, assets) ; tout le reste vient du dépôt modèle et se récupère par fusion (`git remote add coque …`, puis `git merge coque/main`). Quand il y aura trois clients ou plus, on regarde B. **C est écarté** : une erreur de règle exposerait les données d'un client à un autre, et on ne pourrait pas remettre ou supprimer les données d'un seul client proprement.

Conséquence à connaître : une fonction Cloud (donc le serveur MCP) exige le forfait Firebase **Blaze** (à confirmer au moment de créer le premier projet client). Une appli client **sans** MCP peut tourner sur le forfait gratuit. Qui paie le compte de facturation du projet est une décision à prendre (voir section 8).

## 6. Où brancher l'OAuth (hypothèses, à confronter au travail de Jérôme)

- **Connexion à l'écran** (`js/os/auth.js`) : `compteAutorise` regarde aujourd'hui `COMPTES_AUTORISES` (fichier de configuration). Elle devrait lire la collection `utilisateurs` (e-mail, rôle, actif). Les règles Firestore font de même avec un `get()`.
- **Connexion du MCP** (`functions/src/mcp/gestionnaire.js`) : aujourd'hui, un jeton secret par client (`trouverJeton` dans `securite/jetons.js`). Un assistant grand public (ChatGPT) a besoin d'une connexion en un clic. Le point d'accrochage est propre : remplacer l'appel à `trouverJeton` par une fonction **« authentifier la requête »** qui renvoie `{ acteur, profil }`, que ce soit un jeton ou un jeton OAuth. Les profils, plafonds, audit et outils ne changent pas.
- **Ce qui s'ajoute côté serveur** (à vérifier contre les exigences actuelles de ChatGPT et de Claude, non relues pour cette étude) : les adresses de découverte (`/.well-known/…`), l'écran d'autorisation, l'échange de jeton et l'enregistrement du client. Cela demande des réécritures Hosting en plus de `/mcp`, et l'en-tête `WWW-Authenticate` de la réponse 401 doit pointer vers elles.
- **Même identité pour les deux entrées** : l'utilisateur OAuth du MCP doit correspondre à une ligne de `utilisateurs`, avec son rôle. Le profil MCP (`lecteur`, `bibliothecaire`) se déduit du rôle. Un client peut ainsi donner un accès en lecture seule à un collègue, depuis la liste.
- **Jetons de service conservés** pour les machines (n8n, Hermes, Claude Code) : l'OAuth s'ajoute, il ne remplace pas.

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
| 2 | **Comptes dans la base** : collection `utilisateurs` avec rôle ; `auth.js`, `firestore.rules`, `composants.js`, `metier.js` la lisent ; migration des deux comptes actuels | moyen (sensible : touche la sécurité) | travail OAuth de Jérôme |
| 3 | **Un module déclare écrans et outils MCP** ; `outils/index.js` assemble les outils des modules actifs ; `preparer-fonctions.js` parcourt les modules | moyen | — |
| 4 | **Objectifs et célébrations** deviennent un module optionnel ; la coque n'a plus de texte propre à Jérôme | petit | 1 |
| 5 | **Serveur MCP paramétré** (région, compte de service, origines, nom) ; point d'accrochage « authentifier la requête » | moyen | 2 |
| 6 | **Déploiement paramétré** : workflow GitHub en variables ; règles Firestore déployées par le workflow ; une seule source de version | petit | 1 |
| 7 | **Script « nouveau client »** : crée le dépôt depuis le modèle, remplit la configuration, crée le projet Firebase, déploie, crée le premier utilisateur | moyen | 1, 2, 6 |
| 8 | **Dépôt modèle** et règle de fusion des corrections (`git merge coque/main`) | petit | 1 à 7 |
| 9 | **Module « suivi des automatisations »** et fonction « écrire une progression » | gros | 3, 8 |
| 10 | **OAuth du MCP** pour ChatGPT et Claude | gros | 2, 5 |

**Ordre conseillé : 1, 3, 2, 4, 5, 6, 7, 8, puis 9, puis 10.** Le chantier 2 est mis après 1 et 3 pour que le travail OAuth de Jérôme ait le temps d'arriver. Après 8, on dispose d'une coque clonable avec connexion et module vide ; le 9 donne la démo à montrer à un client ; le 10 ouvre l'accès par l'assistant.

**Risque principal** : le chantier 2 touche aux règles de sécurité de la vraie base de Jérôme. À faire sur une copie de la base (émulateur) puis avec une publication des règles en deux temps, comme pour l'audit de l'écran (`audit-ecran.md`), pour ne jamais se retrouver bloqué dehors.

## 9. Décisions à prendre par Jérôme

1. **Dépôt modèle (A)** pour démarrer, B plus tard ? (recommandé)
2. **Qui paie le projet Firebase d'un client** : le client (compte de facturation à son nom) ou Jérôme (refacturé dans l'abonnement) ? Cela décide aussi si le MCP peut être inclus dans l'offre de base.
3. **Données des clients et conservation** : sa décision « pas de RGPD, on garde tout » vaut pour sa base interne. Chez un client, les données sont celles de **ses** clients à lui. Prévoir un réglage par client (durée de conservation du journal, suppression à la demande), désactivé par défaut, tranché avec chaque client.
4. **Le nom de la coque** (ex. « socle » ou un nom commercial) : elle sera visible dans les offres.
5. **Premier client pour la démo** : le client du workflow Gmail est-il le bon ? Cela fixe le contenu du module 9.

## 10. Ce que cette étude n'a pas vérifié

- Le travail OAuth en cours de Jérôme, absent de GitHub.
- Les exigences actuelles de ChatGPT et de Claude pour un connecteur MCP personnalisé (connexion, abonnement requis, validation par un administrateur). À relire avant le chantier 10.
- Le forfait Firebase exact nécessaire pour un projet client (Blaze pour les fonctions : à confirmer en créant le premier).
- Les tests : 5 254 lignes ; une partie dépend des noms de Jérôme et devra suivre les chantiers 1 à 3. Non détaillé ici.
