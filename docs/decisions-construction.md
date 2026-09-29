# Décisions prises pendant la construction (version 1.0.0)

Points non couverts ou pas assez précis dans le cahier des charges : la solution la plus simple, dans l'esprit du cahier. Une ligne par décision.

## Données

1. Les champs "date" (`datePremierContact`, `dateProchaineAction`, `dateInterviewJtbd`, `dateReveil`) sont stockés en texte `AAAA-MM-JJ` (jour civil, sans fuseau) ; `dateRdv` en `AAAA-MM-JJTHH:MM` (heure de Paris) ; les champs "timestamp" en Timestamp Firestore.
2. `dateDernierEchange` est renseignée dès la création de la fiche (la création correspond au premier échange).
3. La création d'une fiche n'ajoute pas de ligne à l'historique (non listée dans les types d'historique du cahier).
4. "Nouvelle affaire" remet aussi `datesEtapes` à `{premier_contact}` (pour que la nouvelle affaire compte à nouveau ses propositions), vide raison de perte, date de réveil et "Rendez vous tenu" ; notes, notes rapides, historique et encaissements sont conservés.
5. Décocher "Rendez vous tenu" remet `dateRdvTenu` à vide ; cocher ajoute une ligne "Rendez vous tenu" à l'historique.
6. Encaissement sans montant sur la fiche : 0 € proposé dans la boîte de dialogue (modifiable).
7. Identifiant d'une nouvelle offre : dérivé de son nom (`atelier_ia`), rendu unique si besoin.
8. Couleurs relevées : corail de Charles `#fd6455` (mesuré sur `charles-portrait.png`), vert Facture payée `#3fbf7f`, gris lilas Premier contact `#b9adc9`.

## Pipeline, À faire, objectifs

9. La colonne Facture payée affiche le nombre et le total des factures payées du mois en cours (les cartes payées sont archivées et quittent le Kanban, comme demandé en 4.2).
10. "Aujourd'hui" contient les actions datées du jour (fiches ni archivées ni perdues) et les fiches Pas maintenant dont la date de réveil est atteinte.
11. "Fait" sur une ligne "Reprendre contact" (réveil) remet la fiche en Premier contact, puis ouvre le choix de la prochaine action.
12. La date de réveil est préremplie à +3 mois dans la boîte "Pas maintenant" (modifiable).
13. Les fiches Interviewé JTBD ne sont pas bloquées en Premier contact : le glisser déposer reste libre, la règle 4.4 décrit l'usage.
14. "Objectif atteint" : la référence est prise au chargement des données ; la célébration se déclenche quand un objectif du mois en cours passe de moins de 100 % à 100 % ou plus pendant la session.
15. Les objectifs manuels ajoutés dans Réglages ne se suppriment pas : on les désactive (case "Actif").
16. La célébration Gagné affiche "Bravo Jérôme !" quel que soit le compte connecté (Charles travaille pour Jérôme).
17. Les statistiques "Fiches par étape" comptent toutes les fiches, archivées et sorties comprises.

## Filtres, Liste, export

18. Sans le filtre "Archivés", les fiches archivées sont masquées ; avec lui, seules les archivées s'affichent.
19. "À relancer cette semaine" : semaine du lundi au dimanche, retards inclus, fiches perdues et archivées exclues.
20. Les filtres (et la recherche) sont partagés entre la Liste et le Kanban pendant la session ; un filtre enregistré se crée depuis la barre de filtres et se renomme ou se supprime dans Réglages.
21. La liste des villes du filtre est construite à partir des villes saisies sur les fiches.
22. Export depuis la Liste sans filtre ni recherche : toutes les fiches (archivées comprises), compté comme export complet (`dernierExport`) ; avec un filtre : les fiches affichées, sans mettre à jour `dernierExport`. Le bouton Exporter de l'Accueil fait toujours un export complet.
23. CSV : toutes les colonnes de la section 3.1 plus l'identifiant, libellés en français, nombres avec virgule, dates `JJ/MM/AAAA HH:MM` (Paris), notes rapides, documents, encaissements et historique sur plusieurs lignes dans leur cellule.
24. Secteurs et sources : ajout, renommage et retrait dans Réglages ; une valeur retirée reste affichée sur les fiches qui l'utilisent.

## Fiche

25. Les champs de la fiche s'enregistrent à chaque modification ; les Notes s'enregistrent 0,7 s après la frappe et à la sortie du champ.
26. Le bouton "Email envoyé" est désactivé dans les mêmes cas que "Écrire un email" (pas d'adresse ou opposition).
27. Suppression définitive : le nom tapé est comparé sans tenir compte des accents ni des majuscules.
28. Ajout rapide de l'Accueil : prénom et nom, entreprise, source ; la fiche s'ouvre ensuite (pour la note rapide dictée).
29. "Sans action prévue" propose un bouton "Planifier" (même boîte que la prochaine action).

## Coquille, PWA, sécurité

30. La baguette est `marque.svg` / `marque-inverse.svg` du site selon le thème ; le favicon est `logo/favicon.svg` du site ; les icônes PWA sont générées depuis `marque-inverse.svg` sur fond sombre avec le halo violet.
31. Portraits réduits à 512 px de large en PNG optimisé (noms de fichiers inchangés, conformes à la configuration 8.3).
32. Sur téléphone, le menu s'ouvre toujours élargi par dessus le contenu ; l'état replié ou élargi ne concerne que l'ordinateur.
33. La connexion par redirection est utilisée sur téléphone, en appli installée, et pour toute fenêtre de moins de 768 px ; si la fenêtre surgissante est bloquée, repli automatique sur la redirection.
34. Le résultat d'une redirection n'est lu qu'au retour d'une connexion par redirection (évite de charger apis.google.com à chaque ouverture).
35. `Permissions-Policy` : caméra, micro, géolocalisation, paiement, USB, capteurs, capture d'écran, lecture auto et MIDI désactivés (la dictée du clavier iPhone n'en a pas besoin).
36. `firebase.json` publie la racine du dépôt en ignorant aussi `ressources/`, `PROMPT-CONSTRUCTION.md` et `firestore.rules`.
37. Kanban : pas de nouveau rendu pendant un glisser déposer (sinon la carte tenue serait détruite par une mise à jour Firestore).

## Tests

38. En mode test uniquement (`localhost` avec `?emulateurs=1`), l'appli expose `window.__chevalierTest.connecter(email)` qui connecte un compte Google fictif sur l'émulateur Auth ; la vraie fenêtre Google a besoin d'apis.google.com. Le bouton "Se connecter avec Google" est testé à part (fenêtre ou redirection lancée).
39. Pendant les tests, Playwright sert le SDK Firebase 12.19.0 depuis `tests/node_modules/firebase` (même version, mêmes fichiers que gstatic) : les tests ne dépendent pas du réseau.
40. Les appareils de test n'ayant pas d'accès aux serveurs Google, l'émulateur Firestore officiel (`cloud-firestore-emulator-v1.22.0.jar`, empreinte SHA-256 vérifiée) a été récupéré une fois via le navigateur du Mac ; `firebase-tools` le télécharge normalement tout seul.
41. Serveur statique minimal pour les parcours (`tests/e2e/serveur.js`, port 5050) plutôt que l'émulateur Hosting.
42. Tests D répartis entre `tests/statique.test.js` (fichiers) et `tests/e2e/controles.spec.js` (navigateur) ; parcours C dans `tests/e2e/parcours.spec.js`.
43. Émulateurs sur `127.0.0.1`, interface web des émulateurs désactivée ; Playwright figé en 1.56.1 (Chromium 141).
