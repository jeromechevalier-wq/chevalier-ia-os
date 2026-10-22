# Écran Projets, étape 2 sur 7 : le Kanban et la fiche projet (06/10/2026)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Premier écran visible : une entrée **Projets** dans le menu (`#/projets/projets`), un projet par fiche (`#/projets/projets/<id>`), et « Projet » dans le bouton « + ».

## Ce qui est construit

- **Tableau Kanban** : une colonne par phase (Lancement, Découverte, Livraison, Clôture), chaque colonne montre son nombre de projets. Une carte : barre de couleur de la phase, titre, organisation, personne, dates début → fin, badges « Extraction », « En retard » (plus de badge « En pause » depuis le 22/10/2026), propriétaire, pastille rouge / verte / grise. On déplace une carte à la souris (glisser déposer, dans tous les sens) ou, sur téléphone, par le menu « ⋯ » → « Déplacer vers : … ».
- **Liste** (tableau sur ordinateur, cartes sur téléphone, tri par colonne) et **Archives** (les projets terminés ou rangés à la main).
- **Recherche** (titre, personne, organisation, sans accents) et **filtres** (phase, statut, nature, en retard) avec pastilles retirables, et **filtres enregistrés** (bouton marque-page : enregistrer la recherche et les filtres posés sous un nom, les réappliquer en un clic ; ils se renomment et se suppriment dans Réglages, avec ceux du CRM, et chaque liste ne montre que les siens).
- **Création** : bouton « + Projet » ou « + » de la barre du haut ; seul le titre est obligatoire ; la personne choisie apporte son organisation ; une personne tapée et inconnue est créée.
- **Fiche projet** : titre modifiable, barre des phases (un clic change la phase), boutons **Terminer** / **Rouvrir**, menu « ⋯ » (archiver, supprimer en tapant le titre), résumé (affaire, personne, organisation, offre, début, fin prévue : la fin ne peut pas précéder le début), détails (adresse GitHub et dossier de travail avec leurs boutons « Créer le GitHub » et « Créer le répertoire », les mêmes que sur l'affaire), documents par lien, **notes et historique**.
- **Notes d'un projet** : rattachées au projet **et** à son affaire, sa personne et son organisation : elles apparaissent aussi dans leurs historiques. Le panneau de droite n'a pas d'onglet « Activité » ni de « Points clés » : les tâches d'un projet viennent à l'étape 4.
- **Recherche globale** : un groupe « Projets » (les projets archivés n'y sont pas).
- **Sauvegarde complète** : l'export JSON contient désormais `projets_projets`, `projets_taches` et `projets_modeles`.
- Toutes les écritures passent par les plans de `logique.js` (étape 1) et laissent leur trace dans le Journal (même lot que la donnée).

## Choix faits, à contredire si besoin

- **Pas de cercle de progression sur les cartes** pour l'instant : il n'y a pas encore de tâches. Il arrive avec l'étape 4 (la fonction `progressionProjet` est déjà prête et testée).
- **Terminer** ne demande pas de confirmation (on peut **rouvrir** en un clic) et ne fait pas encore de célébration (étape 7).
- **Un projet terminé sort du tableau** et se retrouve dans « Archives » ; la vue Archives est dans la page Projets (bascule Kanban / Liste / Archives, comme pour les affaires). L'entrée de menu « Archives » du cadrage pourra pointer dessus à l'étape 7.
- Les entrées de menu « Modèles » et « Archives » ne sont pas créées : elles arrivent avec les étapes 5 et 7.
- Petit correctif dans le CRM : quand une règle refuse une saisie dans un champ de fiche (ici une date de fin avant le début), le message de la règle s'affiche et la valeur affichée reste celle qui est enregistrée.

## À faire dans les étapes suivantes

- **Étape 3** : « Créer ou lier » un projet depuis une affaire gagnée ; documents et notes de l'affaire **montrés** dans le projet (lecture seule) ; sections « Projets » sur les fiches personne et organisation.
- **Étape 4** : tâches, cercle de progression, remontée dans l'Accueil du CRM.
- **Étape 6** : copie de `projets/logique.js` pour le serveur MCP (voir `projets-etape-1.md`).
