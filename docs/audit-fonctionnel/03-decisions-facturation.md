# Décisions de Jérôme sur la facturation (8 octobre 2026, réponses aux questions de l'audit)

Ces réponses viennent de Jérôme. Elles ne rouvrent rien : elles confirment la règle « une facture se paie en entier ». Aucune correction n'a encore été faite dans l'appli (l'audit ne corrige rien).

| Question | Réponse de Jérôme | Constats concernés |
|---|---|---|
| Paiement partiel (700 € sur 1 000 €) | **Refuser** : l'appli refuse tout montant différent de la facture, avec un message clair. | A-05 (écran), B-04 (outil `marquer_facture_payee`) ; le test B33 qui fige le comportement actuel est à changer |
| Facture « à payer » ajoutée ou remise à payer sur un projet terminé et archivé | **Refuser** : message « Ce projet est terminé : rouvre-le d'abord ». | A-01 (écran), B-06 (outils) ; vérifier aussi A-02 (migration) |
| Migration 2.2 | **Déjà appliquée** sur les vraies données. | A-02, A-03, A-04 : voir ci-dessous |
| Supprimer une facture payée ou un projet qui en contient | **Avertir dans la confirmation** : dire quel montant et quel mois du chiffre d'affaires sont touchés. | A-09, E-07 |

## Migration 2.2 : vérifiée par Jérôme (8 octobre 2026, 18h50)
Jérôme a appliqué la migration : « elle s'est bien passée ; j'avais juste deux ou trois affaires et zéro chiffre d'affaires ». Les défauts A-02, A-03 et A-04 existent toujours dans le code, mais n'ont rien faussé dans ses vraies données (pas de chiffre d'affaires à compter deux fois, très peu d'affaires). Leur impact réel est donc faible aujourd'hui ; ils comptent seulement si la migration est relancée un jour sur d'autres données. Gravité à garder dans le rapport : inchangée (c'est celle du code), impact noté « faible, vérifié par Jérôme ».

## Suite prévue (prochaine session)
- Étape F : parcours dans l'appli (ordinateur 1440 × 900 et téléphone 390 × 844), avec les émulateurs, puis regénérer `99-rapport.html`.
- Ces quatre décisions seront reportées dans le rapport (section Priorités) et dans le point projet.
