# Les tables (collections Firestore) de Chevalier IA OS

Écrit le 22/10/2026 pour que Jérôme ait la liste sous les yeux. Source : `js/os/registre.js` (la déclaration de chaque module), `firestore.plateforme.rules` et `docs/porte-cles.md`. **À mettre à jour quand un module change de collections.** Aucun secret ici.

## Deux bases

- **Base 1, Chevalier IA OS** (projet `chevalier-ia-os`) : les données de Jérôme, à la racine.
- **Base 2, plateforme clients** (projet `chevalier-ia-app`) : les mêmes noms de collections, mais sous `clients/<identifiant>/…`, une par client.

Le code est le même (règle du 18/10/2026) : un module a les mêmes collections chez Jérôme et chez un client.

## Collections par module

| Module | Collections |
|---|---|
| Affaires (CRM) | `crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_activites`, `crm_notes`, `crm_evenements`, `crm_parametres`, plus `crm_audit` et `crm_audit_avant` (journal des modifications et copies « avant », lus par l'écran Journal) |
| Projets | `projets_projets`, `projets_taches`, `projets_modeles` |
| Veille | `veille_sources`, `veille_contenus`, `veille_resumes`, `veille_pages` |
| Automatisations | `workflows`, `executions`, `sync` (noms historiques, **jamais renommés**), et la sous-collection `executions/<n>/steps` (préparée pour la frise d'étapes, vide) |
| Tableau de bord | `tableaudebord_indicateurs`, `tableaudebord_releves`, `tableaudebord_demandes` |
| Accès MCP | aucune |
| Coque (Accueil) | `os_objectifs`, `os_objectifs_saisies` (objectifs du mois ; **base 1 seulement**, non montés chez un client) |

`tableaudebord_demandes` est déclarée mais aucun code ne l'écrit pour l'instant.

## Hors modules (plateforme)

`marques` (fiche d'un client : nom, logo, couleur, actif), `clients/<id>` (fiche et `modules`), `clients/<id>/membres` (qui a accès, avec quel rôle), `plateforme_cles` (empreintes des clés de la porte), `plateforme_journal` (signalements), `mcp_oauth` (connexions des assistants), `mcp_limites` (compteurs d'usage), `mcp_codes` (codes à usage unique de la double confirmation des suppressions MCP ; sous `clients/<id>/` chez un client).

**Accès depuis le navigateur** : `marques/<id>` se lit sans connexion (un document à la fois, jamais la liste) ; `clients/<id>` et ses `membres` se lisent par les membres du client ; `plateforme_cles`, `mcp_oauth` et `mcp_limites` sont fermées partout ; `plateforme_journal` est fermée en base 2 mais **ouverte aux deux comptes de Jérôme en base 1** (le joker de `firestore.rules`).

**Même noms dans les deux bases**, avec deux exceptions : `os_objectifs*` n'existent qu'en base 1, et `mcp_oauth` / `mcp_limites` sont à la racine des deux bases.

**À fermer (hors périmètre de ces documents)** : en base 2, `crm_audit` et `mcp_codes` sont écrivables par un éditeur depuis le navigateur (`firestore.plateforme.rules` : seules `membres`, le journal et le tableau de bord sont fermées). Un éditeur pourrait fabriquer un code de confirmation ou une ligne d'audit.

## Prévu

- `automatisations_propositions` : la file « À valider » (`docs/chemin-client-pilote.md`). Elle suit la règle des nouveaux noms (`<module>_<table>`). **Elle doit être fermée à l'écriture depuis le navigateur dans les deux bases** : `firestore.plateforme.rules` (aujourd'hui toute collection non listée est écrivable par un éditeur) et `firestore.rules` (liste d'exclusion du joker, test D4 de `tests/statique.test.js`). Modification de règles : PR laissée à Jérôme.
- Tables d'indicateurs (KPI), voir plus bas.

## Les indicateurs (KPI) : deux mécanismes existent déjà

La première version de ce document disait « rien n'existe » : c'était inexact (relecture Fable).

- **Objectifs de la coque** (`js/os/objectifs.js`) : les modules déclarent des calculs (`enregistrerCalculs`, le CRM y déclare les siens), les objectifs manuels s'ajoutent, tables `os_objectifs` et `os_objectifs_saisies`, affichage sur l'Accueil avec objectif chiffré, unité, pourcentage. C'est déjà « un module déclare ses indicateurs, l'Accueil montre les principaux » (`docs/demande-evolution-ca-signe.md`).
- **Tableau de bord** : format générique de l'indicateur (`scripts/porte/actions-tableaudebord.js` : identifiant, tableau, famille, nom, type état ou mesure, niveau, valeur, unité, objectif, date, méthode, source) ; la famille **`automatisations` est déjà prévue** (`js/modules/tableaudebord/logique.js`).

**Proposition de Fable, à discuter avec Jérôme** (elle remplace l'idée d'une table `<module>_kpi` par module) : écrire les compteurs d'automatisation (exécutions du mois, erreurs, propositions en attente) dans `tableaudebord_indicateurs` (famille `automatisations`, méthode automatique) depuis une fonction serveur du module, et déclarer les 1 ou 2 « principaux » comme calculs d'objectifs de l'Accueil (ou, chez un client où les objectifs ne sont pas montés, une entrée d'Accueil lue dans `tableaudebord_indicateurs` filtrée sur un champ `principal`). Avantage : une seule source, le Tableau de bord ne lit pas N tables. **L'idée de Jérôme (une table par module, lue par le Tableau de bord) reste possible** ; la décision est à prendre avant de coder.

Le **coût** d'une automatisation n'est pas dans les données de n8n : saisie ou calcul par workflow, à décider. Ces changements touchent tous les modules et l'Accueil : PR dédiée, avec captures de recette.
