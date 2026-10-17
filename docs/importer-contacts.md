# Importer des contacts de prospection dans un espace client

Outil : `scripts/importer-contacts-ingrid.mjs` (code dans `scripts/plateforme/importer-contacts.js`). Il lit un fichier JSON **qui ne va jamais dans le dépôt** (données de vraies personnes).

## Ce qu'il écrit, pour chaque contact
- une **personne** (nom, téléphone, e-mail, étiquette du groupe) et une **affaire** (titre = nom, première étape pour `nouveau_contact`, deuxième pour `echange_en_cours`, aucun montant, aucune offre) ;
- une **note** sur la personne et une **note** sur l'affaire : « Secteur : … » puis les commentaires, tels quels, une ligne chacun ;
- l'événement « créé » dans le fil de chacune, et la ligne du journal (outil `importer-contacts-ingrid`) ;
- aucune société. Les étiquettes manquantes sont ajoutées dans les réglages de l'espace ; les étapes sont lues dans les réglages de l'espace.
- Le modèle de données n'a **pas** d'étiquette sur une affaire (seulement sur les personnes et les sociétés) : le groupe est donc l'étiquette de la personne.

## Lancer
Une seule fois : `npm ci --prefix scripts/plateforme` et `gcloud auth application-default login`.

Simulation (ne lit que, n'écrit rien) :
```
node scripts/importer-contacts-ingrid.mjs --fichier CHEMIN/contacts.json
```
Écriture (après avoir lu la simulation) : la même commande avec `--ecrire`.

Relancer ne crée aucun doublon : les identifiants des fiches viennent du nom. Un contact dont une fiche existe déjà est **sauté en entier**, jamais modifié. Chaque contact est écrit en un seul lot (tout ou rien).
