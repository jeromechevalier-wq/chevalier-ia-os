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
| Automatisations | `workflows`, `executions`, `sync` (noms historiques, **jamais renommés**), et la sous-collection `executions/<n>/steps` (restée vide : les étapes sont dans la proposition) |
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

- `automatisations_propositions` : la file « À valider » (`docs/chemin-client-pilote.md`), **déjà écrite par la porte** (2.24.0) et lue par l'écran (`js/modules/automatisations/a-valider.js`, écoute en direct, aucune écriture depuis le navigateur). Champs : `id`, `type`, `titre`, `resume`, `champsProposes`, `champsValides`, `lien`, `etat`, `creeLe`, `expireLe`, `valideePar`, `valideeLe`, `canal`, `refuseePar`, `refuseeLe`, `raison`, `tentatives`, `derniereErreur`, `executions` (`proposer`, `appliquer`, `refuser`), `etapes` (la chaîne d'étapes du Logger, 10 au plus), `abandonneePar`, `source`, `ecritPar`, et `relanceeLe` après une relance ; tous les horodatages sont des `Date` (Timestamp). **Elle n'est pas encore déclarée dans le registre ni fermée à l'écriture depuis le navigateur dans les deux bases** : c'est la PR des règles (liste d'arrêt, laissée à Jérôme), qui doit déclarer la collection au registre en même temps (un test compare le registre aux règles). Tant qu'elle n'est pas publiée, un éditeur (base 2) ou un des deux comptes de Jérôme (base 1) pourrait écrire dans la file depuis le navigateur.
- Tables d'indicateurs (KPI), voir plus bas.

## Nommage des tables

Les nouvelles tables portent le nom de leur module : `<module>_<table>` (`crm_`, `projets_`, `veille_`, `tableaudebord_`, donc `automatisations_propositions`), règle `module_table` de `docs/porte-cles.md` ; un test compare les collections déclarées par chaque module aux collections réelles. Seules les trois tables historiques d'Automatisations (`workflows`, `executions`, `sync`) gardent des noms nus et ne seront pas renommées.

## Les indicateurs (KPI) : EN DISCUSSION avec Jérôme (22/10/2026, rien n'est décidé ni codé)

**Ce qui existe** : les **objectifs de l'Accueil** (`js/os/objectifs.js`) : les modules déclarent des calculs (`enregistrerCalculs`, le CRM y déclare les siens), les valeurs sont **calculées à l'écran** à partir des fiches déjà chargées (jamais stockées) ; la base ne garde que la **définition** de chaque objectif (`os_objectifs` : libellé, calcul, cible, unité, ordre) et les **saisies à la main** du mois (`os_objectifs_saisies`, par exemple les posts LinkedIn). Le module **Tableau de bord** actuel est en réalité un module de **maintenance** (clés et jetons, sauvegardes, surveillance) : ses indicateurs sont écrits par le serveur ; la famille `automatisations` y est déjà prévue.

**Le vrai blocage d'Ingrid** (cliente, CRM seulement, pas de Tableau de bord) n'est pas le nom des tables : la section des objectifs est **désactivée chez les clients dans le code** (`objectifs: false`, `js/os/espace-modules.js`) et la lecture des objectifs ne passe pas par le dossier du client (pas de `chemin()`). Il y a là un écart avec la règle « même code chez Jérôme et chez les clients » (18/10/2026).

**Position de Jérôme (22/10/2026)** : chaque module tient **sa propre table de KPI** (`crm_kpi`, `automatisations_kpi`…, règle `<module>_<table>`) et déclare ce qu'il montre sur l'Accueil ; `os_objectifs` serait une table du CRM ; il préfère le mot « KPI » à « objectif » ; le Tableau de bord actuel est technique, le « vrai » tableau de bord n'existe pas encore. Il a refusé l'idée d'un registre commun tenu par la coque.

**Avis de Fable (relecture indépendante), à discuter** :
1. Sain pour les **données** : un champ `kpi` au registre de chaque module (table et ce qui va à l'Accueil), code générique dans la coque.
2. Mais **ne pas stocker les valeurs calculées** du CRM dans `crm_kpi` (deux vérités, un écrivain inutile) : la table ne porte que définitions, cibles et saisies. Pour Automatisations, dont les exécutions ne sont pas toutes chargées à l'écran, une table `automatisations_kpi` **écrite par le serveur** (fermée aux navigateurs) est au contraire la bonne solution.
3. Les KPI saisis à la main sans module (posts LinkedIn) existent déjà : à loger dans la coque (`os_kpi`) selon Fable, ou dans `crm_kpi` selon Jérôme. **À trancher.**
4. À l'écran : « Indicateurs » (et « objectif du mois » pour la cible) plutôt que « KPI », sigle anglais contraire à la consigne « explique simplement » ; `_kpi` reste le nom technique.
5. Module Tableau de bord : changer **seulement le libellé** affiché (« Maintenance » ou « Surveillance »), pas les identifiants (209 occurrences dans 41 fichiers, deux fonctions déployées, des données écrites chaque jour par un dépôt externe). Un futur vrai tableau de bord serait un module `indicateurs` (pas `kpi`).
6. Ordre conseillé : (1) indicateurs chez un client **sans renommage** (`chemin()`, `objectifs: true`, déclaration au registre, **CA signé** selon `docs/demande-evolution-ca-signe.md`), d'abord chez Jérôme puis chez Ingrid, aucune donnée touchée ; (2) libellé « Maintenance » ; (3) renommage des tables par un script de migration avec `--ecrire` (copie, double lecture, retrait du repli) : **liste d'arrêt, accord écrit de Jérôme** ; (4) KPI d'Automatisations écrits par le serveur ; (5) plus tard, un outil MCP de lecture.

## Décisions de Jérôme du 22/10/2026 (au soir) et avis de Fable : rien n'est codé

- **Ce qui compte, c'est l'évolution** : un **relevé chaque semaine** (dimanche) de tous les indicateurs de l'Accueil, pour tracer les courbes (nouveaux contacts par mois, etc.). Les posts LinkedIn et autres **saisies à la main restent dans la coque**. Le CRM porte les indicateurs qu'il calcule, la maintenance les siens. À l'écran : **« Indicateur »**. L'Accueil n'en montre que 5 ou 6 ; un futur module **Tableau de bord** les analysera finement (courbes).
- **Ingrid** choisit les indicateurs qu'elle voit (nouveaux contacts et chiffre d'affaires oui, flyers non) et fixe des **cibles mensuelles**.
- Jérôme veut **renommer les tables** (et éventuellement les fonctions), et **renommer dès maintenant** le module technique actuel « Tableau de bord ».
- **Schéma recommandé par Fable** : (1) définitions, choix d'affichage et cibles : `os_objectifs` devient `os_kpi` (champs ajoutés `module`, `accueil`), écrit par l'éditeur depuis l'écran ; le catalogue des calculs reste dans le code du module ; (2) saisies à la main : `os_objectifs_saisies` devient `os_kpi_saisies` ; (3) historique : une table par module, **écrite par le serveur seulement**, `crm_kpi_releves`, `os_kpi_releves`, `automatisations_kpi_releves`, **un document par semaine** (`2026-S43` : `releveLe`, `valeurs`, `cibles`), fermée aux navigateurs. Écrite par une **fonction planifiée** (dimanche soir, aucun point d'entrée HTTP, aucun secret) qui réutilise les mêmes calculs que l'écran. Le réglage d'Ingrid = l'écran Réglages « Objectifs du mois » renommé « Indicateurs » et monté chez les clients (`objectifs: true`, `chemin()`).
- **Risques du renommage** : `os_objectifs*` demande un script de migration (liste d'arrêt, accord écrit) ; `tableaudebord` vers `maintenance` touche 209 occurrences, deux fonctions déployées, la réécriture `/tableau-de-bord` appelée par un dépôt externe et l'usage stocké dans `plateforme_cles` : seulement avec des alias, un jour calme. Le **libellé seul** (« Maintenance ») se change sans risque.
- **Ordre** : (1) vocabulaire « Indicateur » et libellé « Maintenance » ; (2) indicateurs chez un client sans renommage, CA signé, d'abord chez Jérôme puis Ingrid ; (3) relevé hebdomadaire (règles : liste d'arrêt) ; (4) renommage `os_objectifs*` ; (5) renommage `tableaudebord` avec alias ; (6) module d'analyse quand 8 à 10 semaines d'historique existent. **Rien ne se fait tant que tout n'a pas été testé sur la plateforme de Jérôme.**

**Reste ouvert** : le coût d'une automatisation n'est pas dans les données de n8n (saisie ou frais d'IA chez OpenRouter, à décider).
