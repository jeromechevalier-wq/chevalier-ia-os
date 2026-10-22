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

- `automatisations_propositions` : la file « À valider » (`docs/chemin-client-pilote.md`), **déjà écrite par la porte** (2.24.0) et lue par l'écran (`js/modules/automatisations/a-valider.js`, écoute en direct, aucune écriture depuis le navigateur). Champs : `id`, `type`, `titre`, `resume`, `champsProposes`, `champsValides`, `lien`, `etat`, `creeLe`, `expireLe`, `valideePar`, `valideeLe`, `canal`, `refuseePar`, `refuseeLe`, `raison`, `tentatives`, `derniereErreur`, `executions` (`proposer`, `appliquer`, `refuser`), `etapes` (vide), `source`, `ecritPar`, et `relanceeLe` après une relance ; tous les horodatages sont des `Date` (Timestamp). **Elle n'est pas encore déclarée dans le registre ni fermée à l'écriture depuis le navigateur dans les deux bases** : c'est la PR des règles (liste d'arrêt, laissée à Jérôme), qui doit déclarer la collection au registre en même temps (un test compare le registre aux règles). Tant qu'elle n'est pas publiée, un éditeur (base 2) ou un des deux comptes de Jérôme (base 1) pourrait écrire dans la file depuis le navigateur.
- Tables d'indicateurs (KPI), voir plus bas.

## Nommage des tables

Les nouvelles tables portent le nom de leur module : `<module>_<table>` (`crm_`, `projets_`, `veille_`, `tableaudebord_`, donc `automatisations_propositions`), règle `module_table` de `docs/porte-cles.md` ; un test compare les collections déclarées par chaque module aux collections réelles. Seules les trois tables historiques d'Automatisations (`workflows`, `executions`, `sync`) gardent des noms nus et ne seront pas renommées.

## Les indicateurs (KPI) : deux mécanismes existent déjà

La première version de ce document disait « rien n'existe » : c'était inexact (relecture Fable).

- **Objectifs de la coque** (`js/os/objectifs.js`) : les modules déclarent des calculs (`enregistrerCalculs`, le CRM y déclare les siens), les objectifs manuels s'ajoutent, tables `os_objectifs` et `os_objectifs_saisies`, affichage sur l'Accueil avec objectif chiffré, unité, pourcentage. C'est déjà « un module déclare ses indicateurs, l'Accueil montre les principaux » (`docs/demande-evolution-ca-signe.md`).
- **Tableau de bord** : format générique de l'indicateur (`scripts/porte/actions-tableaudebord.js` : identifiant, tableau, famille, nom, type état ou mesure, niveau, valeur, unité, objectif, date, méthode, source) ; la famille **`automatisations` est déjà prévue** (`js/modules/tableaudebord/logique.js`).

**Proposition de Fable, à discuter avec Jérôme** (elle remplace l'idée d'une table `<module>_kpi` par module) : écrire les compteurs d'automatisation (exécutions du mois, erreurs, propositions en attente) dans `tableaudebord_indicateurs` (famille `automatisations`, méthode automatique) depuis une fonction serveur du module, et déclarer les 1 ou 2 « principaux » comme calculs d'objectifs de l'Accueil (ou, chez un client où les objectifs ne sont pas montés, une entrée d'Accueil lue dans `tableaudebord_indicateurs` filtrée sur un champ `principal`). Avantage : une seule source, le Tableau de bord ne lit pas N tables. **Décision de principe de Jérôme (22/10/2026)** : tous les indicateurs vivent dans le Tableau de bord, et l'Accueil n'en garde qu'une **recopie** (lecture seule) de quelques-uns, ceux marqués « principal » : une seule source de vérité, le Tableau de bord. Les objectifs de la coque (`os_objectifs*`) seraient donc à terme regroupés dans le Tableau de bord, en chantier à part : il touche des données existantes de Jérôme et ce que son Accueil affiche, donc **accord explicite avant tout code**. Argument de poids pour cette fusion : `os_objectifs*` n'existent qu'en base 1, ce qui est un écart avec la règle « même code chez Jérôme et chez les clients » (18/10/2026). À porter dans la fusion : objectif chiffré du mois, saisies manuelles, célébration.

Le **coût** d'une automatisation n'est pas dans les données de n8n : saisie ou calcul par workflow, à décider. Ces changements touchent tous les modules et l'Accueil : PR dédiée, avec captures de recette.
