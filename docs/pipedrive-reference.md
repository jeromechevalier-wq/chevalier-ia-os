# Écrans de référence : Pipedrive (et Notion)

Note de travail du 02/10/2026, rédigée à partir des captures d'écran de Jérôme (Pipedrive sur téléphone, Notion sur téléphone). Elle décrit **la structure et le vocabulaire** dont s'inspire la version 2.0 de Chevalier IA OS. On ne reprend **ni la marque, ni les icônes, ni les textes** de Pipedrive : l'identité visuelle reste celle de Chevalier IA (cahier, section 10). Les captures ne sont pas dans le dépôt (elles montrent des données de démonstration et des adresses de Pipedrive).

## Ce qui plaît à Jérôme

1. Le **vocabulaire** : Personnes, **Organisations** (et non "entreprises"), Affaires, Projets, Activités, Étiquettes.
2. Le **modèle** : une personne est reliée à des affaires en cours ou clôturées ; l'affaire est la partie commerciale ; le projet est la partie gestion de projet, qui commence quand l'affaire est conclue.
3. Les **fenêtres de création** courtes : on a envie de saisir.
4. De Notion : une fiche s'ouvre avec le titre, les autres propriétés affichent "Vide" et se remplissent quand on veut ; un bouton "Add a property" ajoute un champ.

## Écrans observés

### Menu et navigation
1. Une barre d'icônes étroite à gauche (modules : contacts, affaires, projets, activités, e-mails, rapports…), un menu de section à côté (Contacts : Personnes, Organisations, Chronologie des contacts, Fusionner les doublons ; Projets : Projets, Modèles, Archives, Tâches).
2. Barre supérieure : fil d'Ariane, recherche globale ("Rechercher dans …"), bouton "+", compte.
3. Un menu "Autres" regroupe le reste (produits, automatisations, importer, exporter, restaurer des données…). **Repris** : exporter les données. **Non repris** : le reste.

### Liste des personnes
1. Bouton vert **"+ Personne"** avec une petite flèche pour d'autres actions.
2. Compteur ("9 contacts"), bouton de filtre ("Nom du filtre"), menu "⋯", engrenage pour choisir les colonnes.
3. Tableau : case à cocher, **Nom, Organisation, Adresse e-mail, Téléphone** ; l'email et le téléphone sont des liens ; l'email porte son type entre parenthèses "(Travail)" ; menu "⋯" par ligne.
4. **Non repris** : les encarts d'astuces et de publicité, la sélection multiple (plus tard).

### Ajouter une personne (écran essentiel)
Fenêtre courte, le curseur est déjà dans le premier champ :
1. **Nom**
2. **Organisation** (champ avec icône d'immeuble)
3. **Téléphone** (valeur + type "Travail" + lien "+ Ajouter un numéro de téléphone")
4. **Adresse e-mail** (valeur + type "Travail" + lien "+ Ajouter une adresse e-mail")
5. **Étiquettes** ("Ajouter des étiquettes")
6. **Propriétaire** (déjà rempli avec le compte connecté)
7. Boutons : Importation, **Annuler**, **Enregistrer** (vert).
**Repris** : 1 à 5 et les deux boutons. **Non repris dans la fenêtre** : le propriétaire (automatique), l'importation.

### Ajouter une organisation
Nom, Étiquettes, Propriétaire, Adresse, Visible par ; Annuler, Enregistrer. **Repris** : Nom, Étiquettes, Adresse.

### Fiche personne
1. **En tête** : propriétaire, avatar, nom en grand, "1 abonné", bouton vert **"+ Affaire"** avec flèche, menu "⋯".
2. **Colonne de gauche** : sections repliables ("^") : **Résumé** (lien "Ajouter des étiquettes", e-mail avec son type, téléphone, "+ Organisation"), **Détails** (Prénom, Nom de famille), **Organisation** ("Aucune organisation n'est associée à cette personne", "+ Organisation"), **Affaires** (affaires en cours avec carte : titre, montant, barre de progression par étape ; "Voir toutes les affaires"), Organisations apparentées, Personnes, Vue d'ensemble, Cci intelligente, Prospects, Projets ("+ Projet", "Lier le projet"), dates de mise à jour et de création.
3. **Colonne de droite** : onglets **Activité** et **Notes** ; sous Activité, des types (Prise de rendez vous, Appel, WhatsApp, E-mail, Fichiers, Documents) et la zone "Cliquez ici pour ajouter une activité…" ; **Points clés** (activité à faire : case, titre, "Aujourd'hui" en vert, ou pastille rouge "EN RETARD" avec la date, propriétaire, personne, organisation et affaire liées) ; **Historique** avec filtres en pastilles (Tous, Activités, Notes, WhatsApp, E-mails, Fichiers, Documents, Prospects, Affaires, Modifications) et une chronologie (notes en jaune, "Personne créée", "Affaire créée" avec son montant).
4. **Repris** : en tête, Résumé, Détails, Organisation, Affaires, onglets Activité et Notes, Points clés, Historique et ses filtres. **Non repris** : Vue d'ensemble statistique, Cci intelligente, Prospects, WhatsApp, Documents, Organisations apparentées, "abonné".

### Fiche organisation
Mêmes principes : Résumé, Détails, Affaires (en cours), Organisations apparentées, **Personnes** (liste, "Afficher les détails"), Vue d'ensemble, Prospects, Projets ; historique avec "Organisation créée" et "Affaire créée".

### Affaires (Kanban)
1. Barre : bascule de vues (Kanban, liste, prévisions, archives), bouton vert **"+ Affaire"**, compteur ("6 affaires"), sélecteur de pipeline ("Pipeline de vente"), crayon pour le modifier, filtre, menu "⋯", tri ("Trier par : Activité suivante").
2. Colonnes en forme de flèche : **Nouvelle affaire, Contact effectué, Qualifié, RDV effectué, Négociations en cours, Contrat signé** ; sous le nom, **total en euros et nombre d'affaires** ("52 000 € · 3 affaires").
3. Carte : **titre**, organisation, personne, **montant**, avatar du propriétaire, **pastille d'activité** (rouge = en retard, verte = prévue, grise = aucune).
4. **Repris** : tout, avec nos 6 étapes (Premier contact, Rendez vous fixé, Proposition envoyée, Gagné, Facture envoyée, Facture payée). **Non repris** : plusieurs pipelines, prévisions, colonnes en forme de flèche (facultatif).

### Projets (version 2.1, pour mémoire)
1. Menu : Projets, Modèles, Archives ; Tâches.
2. Kanban de **phases** : Lancement, Découverte, Distribution, Facturation, Clôture ; chaque colonne affiche son nombre de projets et un "+".
3. Carte : barre de couleur, titre, **date de début** (drapeau) et **date de fin** (damier), cercle de progression, propriétaire.
4. Vues Kanban et liste, filtre "Nom du filtre".

### Notion (fiche)
Titre en grand ; propriétés listées (Blocked by, Blocking, Date d'échéance, État d'avancement, Note(s), Projet, Responsable, Start Date) avec "Vide" quand rien n'est saisi ; "Add a property" en bas ; zone de commentaire ; modèles de page. **Repris** : l'idée de propriétés vides à compléter plus tard.
