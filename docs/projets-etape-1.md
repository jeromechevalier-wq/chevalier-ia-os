# Écran Projets, étape 1 sur 7 : le socle (06/10/2026)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Rien ne change à l'écran : cette étape pose les règles et les protections, sans bouton ni menu. L'écran Projets arrive à l'étape 2.

## Ce qui est construit

- **`js/modules/projets/logique.js`** : la logique pure du module (testée avec `node --test`, aucune règle dans les écrans).
  - Quatre phases fixes, identifiants stables : `lancement`, `decouverte`, `livraison`, `cloture`. Statuts : `actif`, `termine` (`en_pause` supprimé le 22/10/2026 ; un ancien `en_pause` s'affiche comme `actif`). Natures : `livraison` (défaut) et `extraction`.
  - Création : seul le titre est obligatoire ; phase, statut, nature et date de début sont posés tout seuls. Dates au format `AAAA-MM-JJ`, la fin ne précède pas le début.
  - Changer de phase (dans tous les sens, la première date d'entrée de chaque phase est gardée), **terminer** (Clôture, Terminé, archivé), rouvrir, archiver. Changer la phase d'un projet terminé le rouvre.
  - Avancement (tâches faites sur tâches), retard (fin prévue dépassée, ou tâche non faite dont la date est passée), pastille rouge / verte / grise comme les affaires.
  - Les plans d'écriture (créer, modifier, changer de phase, terminer, rouvrir, archiver, **supprimer** avec ses tâches et son fil) ont la même forme que ceux du CRM : le même moteur d'écriture et le même audit s'appliquent, à l'écran comme dans le serveur MCP.
  - Les événements de projet (`projet_cree`, `phase_changee`, `projet_en_pause` et `projet_repris` (anciens événements, plus créés depuis le 22/10/2026 ; encore affichés), `projet_termine`, `projet_rouvert`, `projet_archive`, `projet_desarchive`) vont dans `crm_evenements` avec un champ `projetId`, et gardent les liens vers l'affaire, la personne et l'organisation (cadrage 4.4).
- **Intégrité des liens** (cadrage 6.3) : supprimer une affaire, une personne ou une organisation **ne supprime jamais un projet**. Le projet reste, seul le lien vers la fiche disparue est vidé, et son fil (notes, événements) reste aussi. Supprimer un projet détache son affaire (`projetId` vidé), supprime ses tâches et son fil, et fait perdre sa source aux extractions qui le citaient. Fait à l'écran (`crm/donnees.js`) **et** dans le serveur MCP (`functions/src/coeur/metier.js`), avec les mêmes plans (`logique.js`). Le serveur accepte d'écrire dans les trois collections `projets_*`.
- **Journal** : les documents des projets ont un nom lisible (« projet », « tâche de projet », « modèle de projet »).

## Règles Firestore : rien à publier

Le joker de `firestore.rules` couvre déjà toute collection qui n'est pas explicitement exclue : `projets_projets`, `projets_taches` et `projets_modeles` ont les mêmes droits que le CRM (les deux comptes autorisés, e-mail vérifié, personne d'autre). Les cas de sécurité A1 à A5 (15 cas) sont rejoués sur ces trois collections (`tests/regles.test.js`). **Jérôme n'a donc rien à publier avant la fusion de cette PR.** Si une règle plus fine devient utile (par exemple un projet qui ne peut pas être supprimé sans trace), elle sera décidée avec l'étape concernée.

## Choix faits, à contredire si besoin

- Le menu et le module ne sont **pas** encore enregistrés dans `js/os/modules.js` : une entrée « Projets » vide dans le menu n'aurait servi à rien. Elle arrive avec l'étape 2.
- Pas de version publiée : `version.json` reste en 2.0.x ; la 2.1.0 viendra à l'étape 7.
- Événements de pause et de reprise ajoutés (le cadrage n'en listait que quatre) ; la pause a été supprimée le 22/10/2026, les anciens événements restent affichés dans l'historique.

## À ne pas oublier dans les étapes suivantes

- **Étape 2** : l'export JSON complet (`COLLECTIONS_CRM` dans `crm/donnees.js`) ne contient pas encore les collections `projets_*`. Dès que l'écran écoute les projets, ajouter les trois collections à l'export, sinon la « sauvegarde complète » serait incomplète. Écouteurs Firestore du module : un `donnees.js` à part dans `js/modules/projets/`.
- **Étape 3** : planCreerProjet ne touche pas l'affaire. « Créer ou lier » écrira `projetId` sur l'affaire dans le même plan.
- **Étape 6** : `terminerProjet` est l'endroit où l'extraction sera créée ; elle devra aussi l'être par `changementEtape` (affaire perdue, affaire gagnée sans projet). La copie de logique pour le serveur (`scripts/preparer-fonctions.js`) ne copie que `crm/logique.js` : il faudra y ajouter `projets/logique.js` (son import `../crm/logique.js` devra pointer vers la copie).
- **Après la 2.1** : outils MCP pour les projets (chercher, créer, changer de phase), environ 3 à 4 h.
