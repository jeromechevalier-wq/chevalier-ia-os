# Synthèse provisoire : les 10 constats les plus importants (état à 17:40, heure de Paris)

Étapes déjà lues : A (projets et factures), C (ventes et CRM). B (serveur MCP) et D (journal) sont en cours ; cette liste est mise à jour à chaque étape. Les gravités sont celles des fichiers d'étape.

1. **C-01 · BLOQUANT** : supprimer une ancienne organisation efface aussi des notes et activités de personnes ou d'affaires qui l'ont quittée mais existent toujours (`js/modules/crm/logique.js:1545` et `:1550`). Confirmé au niveau de la règle.
2. **C-02 · BLOQUANT** : supprimer une personne efface le fil d'une affaire qui lui a été retirée et qui appartient maintenant à quelqu'un d'autre (`js/modules/crm/logique.js:1519`). Confirmé au niveau de la règle.
3. **A-05 · GÊNANT** : un paiement partiel (700 sur 1000) est accepté, la facture passe « Payée » et le reste disparaît, alors que la décision est « une facture se paie en entier » (`js/modules/projets/logique.js:290-299`). La doc se contredit, à arbitrer avec Jérôme.
4. **A-01 · GÊNANT** : une facture « à payer » peut revenir sur un projet déjà terminé et archivé (`logique.js:306-313`), l'impayé n'est plus visible.
5. **A-03 · GÊNANT** : la migration 2.2 compte deux fois un acompte déjà encaissé (chiffre d'affaires trop haut).
6. **A-04 · GÊNANT** : la migration rend « gagnée » une affaire perdue ou en pause qui était dans une étape retirée.
7. **A-02 · GÊNANT** : la migration peut poser une facture « à payer » sur un projet déjà terminé.
8. **C-03 · GÊNANT** : l'écran ne permet pas de retirer la personne ou l'organisation d'une affaire, alors que le message de suppression dit « détacher d'abord ses affaires » (`fiche-affaire.js:92` et `:96`).
9. **C-06 · GÊNANT** : une affaire gagnée peut être marquée « Perdue » alors que son projet continue.
10. **C-05 · GÊNANT** : un montant négatif est accepté sur l'écran.

(Détail et preuves : `10-projets-et-factures.md`, `30-ventes-crm.md`.)
