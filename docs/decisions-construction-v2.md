# Décisions prises pendant la construction (version 2.0.0)

## Réponses de Jérôme au lancement (phase 0)

Construction dans la session de travail, sur la branche `v2` créée à partir de la branche de session (qui contient les documents de la version 2.0, absents de `main`). Autorisations accordées : branche `v2` et push, remplacement du module CRM de la version 1.0.0, installation de l'outillage de test (Java 21, Chromium, paquets npm, émulateur Firestore), mise à jour du README et de la version 2.0.0. Pull Request : **non** (Jérôme l'ouvre lui-même). Valeurs par défaut du cahier confirmées : six étapes du pipeline, délai de paiement 30 jours, début d'activité octobre 2026, six cibles d'objectifs inchangées, listes de départ (étiquettes, offres, secteurs, sources), repartir de zéro sur les données (`crm_prospects` intacte), propriétaire non demandé à la création, notes en fil daté, pas d'écran Activités. `firestore.rules` inchangé. Interdits maintenus : aucun `firebase deploy`, aucune publication de règles, jamais de push sur `main`.

## Points non couverts ou pas assez précis dans le cahier : solution la plus simple retenue

### Données
1. Un document de réglages `crm_parametres/filtres` de la version 1.0.0 (sans champ `version: 2`) est ignoré et remplacé par les filtres de départ de la version 2.0 au premier lancement.
2. Les données affichées ne sont pas redessinées quand seul un horodatage serveur (`creeLe`, `modifieLe`) se précise après une écriture : sinon un glisser déposer en cours était interrompu.
3. L'organisation d'une affaire est reprise de la personne choisie si l'affaire n'en a pas, et reste modifiable ensuite.
4. Quand une affaire passe en Gagné pour la première fois, l'événement `affaire_gagnee` est ajouté en plus de `etape_changee`.
5. Supprimer une personne avec l'option « conserver ses affaires » met `personneId` à vide sur ses affaires, conserve leurs activités, notes et événements, et supprime ceux rattachés seulement à la personne.
6. Un encaissement manuel (affaire gagnée) est daté du jour saisi ou du jour même ; l'encaissement de « Facture payée » est daté de l'instant du changement d'étape.

### Écrans et saisie
7. « Prénom » et « Nom de famille » sont modifiables dans Détails ; modifier l'un recalcule le nom affiché, modifier le nom affiché (titre de la fiche) redécoupe au premier espace.
8. La fenêtre « Ajouter une personne » et celle des affaires créent à la volée une organisation ou une personne dont le nom a été tapé sans choisir « Créer » : si une organisation de même nom existe déjà, elle est utilisée.
9. Le bouton « + » de la barre supérieure est visible en permanence sur ordinateur ; sur téléphone la recherche passe derrière une icône et le « + » reste dans la barre du haut.
10. Les filtres de colonnes (choix des colonnes d'une liste) sont mémorisés sur l'appareil.
11. Le Kanban des affaires n'a plus de colonnes « Perdues » ni « En pause » (décision du 22/10/2026) : il ne montre que les affaires ouvertes et la dernière colonne (gagnée). Les affaires perdues ou en pause se retrouvent par les filtres de la liste.
12. La colonne « Facture payée » du Kanban affiche les affaires payées du mois en cours ; les autres sont dans la vue Archives.
13. Les raccourcis clavier `n` et `/` ne s'activent pas quand le curseur est dans un champ de texte ni quand une fenêtre est ouverte.
14. Le graphique du chiffre d'affaires est limité aux mois écoulés depuis `reglages.debutActivite` et à six mois au plus ; avant le début d'activité il montre le mois de début.

### Technique et tests
15. Le champ intelligent ferme sa liste un court instant après la perte du focus (le clic sur une suggestion doit aboutir) ; cette fermeture différée est annulée si le curseur revient dans le champ.
16. Échap ferme la fenêtre du dessus où que soit le curseur ; un champ intelligent qui ferme seulement sa liste consomme l'événement.
17. Les tests de glisser déposer rejouent les événements `dragstart`, `dragover`, `drop`, `dragend` avec un `DataTransfer` quand Chromium sans écran ignore un second glisser lancé juste après un premier (artefact connu) ; le premier essai reste un vrai glisser à la souris.
18. Le test de déconnexion attend la fin de l'initialisation des réglages et des objectifs (premier lancement) avant de se déconnecter, pour ne pas mesurer des erreurs réseau dues à la coupure de session.
19. Les tests utilisent le projet `demo-chevalier-ia-os` sur les émulateurs, comme en version 1.0.0 ; le SDK Firebase 12.19.0 est servi depuis `tests/node_modules` pendant les parcours.
