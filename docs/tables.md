# Les tables (collections Firestore) de Chevalier IA OS

Écrit le 22/10/2026 pour que Jérôme ait la liste sous les yeux. Source : `js/os/registre.js` (la déclaration de chaque module), `firestore.plateforme.rules` et `docs/porte-cles.md`. **À mettre à jour quand un module change de collections.** Aucun secret ici.

## Deux bases

- **Base 1, Chevalier IA OS** (projet `chevalier-ia-os`) : les données de Jérôme, à la racine.
- **Base 2, plateforme clients** (projet `chevalier-ia-app`) : les mêmes noms de collections, mais sous `clients/<identifiant>/…`, une par client.

Le code est le même (règle du 18/10/2026) : un module a les mêmes collections chez Jérôme et chez un client.

## Collections par module

| Module | Collections |
|---|---|
| Affaires (CRM) | `crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_activites`, `crm_notes`, `crm_evenements`, `crm_parametres` |
| Projets | `projets_projets`, `projets_taches`, `projets_modeles` |
| Veille | `veille_sources`, `veille_contenus`, `veille_resumes`, `veille_pages` |
| Automatisations | `workflows`, `executions`, `sync` (noms historiques, **jamais renommés**) |
| Tableau de bord | `tableaudebord_indicateurs`, `tableaudebord_releves`, `tableaudebord_demandes` |
| Accès MCP | aucune |

`tableaudebord_demandes` est déclarée mais aucun code ne l'écrit pour l'instant.

## Hors modules (plateforme)

`marques` (fiche d'un client : nom, logo, couleur, actif), `clients/<id>` (fiche et `modules`), `clients/<id>/membres` (qui a accès, avec quel rôle), `plateforme_cles` (empreintes des clés de la porte), `plateforme_journal` (signalements), `mcp_oauth` (connexions des assistants), `mcp_limites` (compteurs d'usage). Les navigateurs n'ont aucun accès à ces dernières.

## Prévu

- `automatisations_propositions` : la file « À valider » (`docs/chemin-client-pilote.md`). Elle suit la règle des nouveaux noms (`<module>_<table>`). **Elle doit être fermée à l'écriture depuis le navigateur** dans les règles de la plateforme (aujourd'hui toute collection non listée est écrivable par un éditeur). Modification de règles : PR laissée à Jérôme.
- Tables d'indicateurs (KPI), voir plus bas.

## Les indicateurs (KPI) : proposition, à discuter

Rien n'existe aujourd'hui : aucun module n'a de table d'indicateurs qui remonte à l'Accueil. Le Tableau de bord a les siennes, alimentées par des scripts de surveillance, pas par les modules.

**Proposition de Jérôme et de Claude (à faire relire par Fable)** : **chaque module a sa table d'indicateurs**, par exemple `automatisations_kpi`, et le Tableau de bord les lit.
- Un module connaît ses données et calcule ses indicateurs. Le Tableau de bord n'a pas à connaître le détail de chaque module.
- Un client sans Tableau de bord garde les KPI de ses modules.
- On ne mélange pas les écritures des modules avec celles des scripts de surveillance (`tableaudebord_*`).

**Format commun** : module, identifiant de l'indicateur, libellé, valeur, unité, période, `principal` (vrai pour les 1 ou 2 indicateurs de l'Accueil). Chaque module déclare sa table dans le registre, comme ses collections ; le Tableau de bord affiche tout le détail, l'Accueil seulement les principaux.

**Exemples pour les automatisations** : nombre d'exécutions ce mois-ci (calculable avec `executions`), nombre en erreur, propositions en attente. Le **coût** n'est pas dans les données de n8n : il faudra une saisie ou un calcul par workflow, à décider.

**Pas de chevauchement aujourd'hui** entre le Tableau de bord (état de la surveillance : clés, sauvegardes) et Automatisations (historique des workflows). Il apparaîtrait si des KPI d'automatisation étaient écrits dans `tableaudebord_*` sans règle commune.

**À faire avant de coder** : lire le module Tableau de bord en détail (non fait pour ce document) ; ces tables touchent tous les modules et l'Accueil, donc elles passent par une PR dédiée avec les captures de recette.
