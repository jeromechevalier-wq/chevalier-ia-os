# Écran Projets, étape 3 sur 7 : créer ou lier un projet depuis une affaire gagnée (06/10/2026)

Décisions du 06/10/2026 appliquées : une affaire **gagnée** donne un projet **au choix** (on le crée ou on en lie un existant), jamais plus d'un par affaire, et une affaire gagnée peut rester sans projet. Il n'y a pas de boîte automatique au passage en « Gagné ».

## Ce qui est construit

- **Section « Projet » sur la fiche d'une affaire gagnée** (elle n'existe pas pour une affaire qui n'est pas gagnée, sauf si elle a déjà un projet) :
  - sans projet : « Créer le projet » et « Lier un projet » ;
  - avec un projet : sa carte (phase, statut, barre des phases) et « Détacher le projet » (avec confirmation ; rien n'est supprimé, le lien disparaît des deux côtés).
- **Créer le projet** : il reprend le titre, la personne, l'organisation, l'offre, l'adresse GitHub et le dossier de l'affaire, démarre en Lancement, et l'affaire reçoit son `projetId` **dans la même écriture**. Un message propose d'ouvrir le projet.
- **Lier un projet** : une fenêtre propose les projets qui n'ont pas encore d'affaire (hors archivés), par ordre alphabétique. Le projet garde ce qu'il a ; ce qui lui manque (personne, organisation, offre, GitHub, dossier) est repris de l'affaire.
- **Fiche projet** :
  - la ligne « Affaire » a un bouton « Détacher » ;
  - une section **« Documents de l'affaire »** montre, en lecture seule, les documents de l'affaire liée ; ils restent sur l'affaire ;
  - le panneau de droite montre aussi les **notes de l'affaire**, marquées « note de l'affaire », sans « Modifier » ni « Supprimer » : elles restent sur l'affaire. Les notes du projet restent modifiables. Quand on détache l'affaire, ses documents et ses notes disparaissent de la fiche projet.
- **Fiches personne et organisation** : une section « Projets » (cartes cliquables), seulement s'il y en a.
- **Journal** : trois événements dans le fil de l'affaire et du projet : « Projet créé », « Projet lié à l'affaire », « Projet détaché de l'affaire ». Chaque action écrit sa trace dans le Journal, dans le même lot que les données.
- Sur téléphone, les sections de la fiche projet sont dans l'ordre : Résumé, Notes, Documents, Détails, Historique.
- Règles dans `projets/logique.js` (testées) : `validerLienAffaire`, `planCreerProjetDepuisAffaire`, `planLierProjet`, `planDelierProjet`, `notesDuProjet`.

## Choix faits, à contredire si besoin

- **Seule une affaire gagnée** a la section (statuts « gagnée », y compris « Facture payée » archivée). Une affaire perdue ou en pause n'en a pas ; si elle avait un projet avant de passer en perdue, la section reste visible pour le détacher.
- **On ne peut pas lier un projet archivé** : on le désarchive d'abord.
- **Lier depuis le projet** n'existe pas : « Créer ou lier » se fait depuis l'affaire, comme dans Pipedrive. Le projet a seulement « Détacher ».
- **Les e-mails** n'existent pas dans l'appli : rien à montrer.
- Les notes de l'affaire sont montrées **dans l'historique** du projet (pas dans un bloc à part) ; elles se distinguent par leur mention.

## À faire dans les étapes suivantes

- **Étape 4** : tâches, cercle de progression, remontée dans l'Accueil du CRM.
- **Serveur MCP** : `lire_affaire` ne renvoie pas encore `projetId` et aucun outil ne crée ni ne lie de projet (outils MCP des projets après la 2.1).
