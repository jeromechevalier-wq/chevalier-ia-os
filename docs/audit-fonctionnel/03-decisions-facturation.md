# Décisions de Jérôme sur la facturation (8 octobre 2026, réponses aux questions de l'audit)

Ces réponses viennent de Jérôme. Elles ne rouvrent rien : elles confirment la règle « une facture se paie en entier ». Aucune correction n'a encore été faite dans l'appli (l'audit ne corrige rien).

| Question | Réponse de Jérôme | Constats concernés |
|---|---|---|
| Paiement partiel (700 € sur 1 000 €) | **Refuser** : l'appli refuse tout montant différent de la facture, avec un message clair. | A-05 (écran), B-04 (outil `marquer_facture_payee`) ; le test B33 qui fige le comportement actuel est à changer |
| Facture « à payer » ajoutée ou remise à payer sur un projet terminé et archivé | **Refuser** : message « Ce projet est terminé : rouvre-le d'abord ». | A-01 (écran), B-06 (outils) ; vérifier aussi A-02 (migration) |
| Migration 2.2 | **Déjà appliquée** sur les vraies données. | A-02, A-03, A-04 : voir ci-dessous |
| Supprimer une facture payée ou un projet qui en contient | **Avertir dans la confirmation** : dire quel montant et quel mois du chiffre d'affaires sont touchés. | A-09, E-07 |

## Conséquence : la migration est déjà appliquée
Les défauts A-02 (facture « à payer » posée sur un projet déjà terminé), A-03 (acompte déjà encaissé compté deux fois) et A-04 (affaire perdue ou en pause rendue « gagnée ») ont donc pu toucher de vraies données. L'audit n'a pas le droit de lire les vraies données. À faire à la prochaine session, avec l'accord de Jérôme :
1. Écrire une consigne simple pour que Jérôme regarde dans l'appli (Réglages, puis l'écran Affaires et Projets) : affaires gagnées dont le titre ou l'historique indique « perdue » ou « en pause » ; projets terminés qui affichent une pastille « Impayé » ; chiffre d'affaires d'un mois qui paraît trop haut.
2. Ou : lire la base réelle uniquement si Jérôme le demande explicitement et fournit l'accès, en lecture seule.

## Suite prévue (prochaine session)
- Étape F : parcours dans l'appli (ordinateur 1440 × 900 et téléphone 390 × 844), avec les émulateurs, puis regénérer `99-rapport.html`.
- Ces quatre décisions seront reportées dans le rapport (section Priorités) et dans le point projet.
