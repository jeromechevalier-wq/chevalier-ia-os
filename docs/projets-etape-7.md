# Écran Projets, étape 7 sur 7 : finitions et version 2.1.0 (07/10/2026)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Dernière étape de l'écran Projets (version 2.1).

## Ce qui est construit

- *(Depuis le 18/10/2026, 2.12.0 : « Archives » n'est plus une entrée de menu ; on y va par le bouton « Archives » de l'écran Projets, l'adresse ne change pas.)* **Entrée de menu « Archives »** (sous « Projets », avant « Modèles ») : elle ouvre la liste des projets archivés ou terminés (`#/projets/archives`). Les boutons Kanban / Liste / Archives en haut de l'écran restent : « Archives » mène au même endroit, « Kanban » et « Liste » ramènent aux projets vivants. **Kanban ou Liste est mémorisé** ; Archives ne l'est pas (l'entrée « Projets » rouvre toujours les projets vivants).
- **Célébration de clôture** : quand tu termines un projet (bouton « Terminer » de la fiche, ou « Terminer » du menu d'une carte), un petit feu d'artifice avec Charles s'affiche (« Projet terminé ! », ou « Extraction terminée ! » pour une extraction). Plus sobre que celle de « Gagné ». Un clic ou Échap la ferme ; elle n'apparaît pas si ton appareil demande de réduire les animations.
- **Recherche** : la recherche de la barre du haut trouve déjà les projets vivants (construite à l'étape 2). Les projets archivés se cherchent dans la vue Archives (champ de recherche et filtres de l'écran).
- **Version 2.1.0** (`version.json` et `js/os/version.js`, vérifiées ensemble par le test D1).
- **Parcours dans le navigateur** : tous les parcours de l'écran Projets (C29 à C35) tournent aux deux formats, 1440 × 900 (ordinateur) et 390 × 844 (téléphone). Nouveau : C35 (menu Archives).

## Ce qui n'a pas changé

Aucune nouvelle collection, aucune règle Firestore à publier.

## À faire ensuite

- **Version 2.2 (facturation)** : liste de factures sur le projet, retrait des étapes « Facture envoyée / payée » des affaires avec migration, objectif et célébration rebranchés, Clôture bloquée tant qu'une facture n'est pas payée (la sortie en cas d'impayés reste à valider avec Jérôme).
- **Outils MCP des projets** : chercher, créer, changer de phase, terminer.
