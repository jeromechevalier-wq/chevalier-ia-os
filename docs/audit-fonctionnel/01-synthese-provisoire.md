# Synthèse provisoire : les constats les plus importants (état à 17:25, heure de Paris)

Étapes déjà lues : C (ventes et CRM). Les étapes A et B sont en cours ; cette liste sera mise à jour à chaque étape.

1. **C-01 · BLOQUANT** : supprimer une ancienne organisation efface aussi des notes et activités de personnes ou d'affaires qui l'ont quittée mais existent toujours (`js/modules/crm/logique.js:1545` et `:1550`). Confirmé au niveau de la règle.
2. **C-02 · BLOQUANT** : supprimer une personne efface le fil d'une affaire qui lui a été retirée et appartient maintenant à quelqu'un d'autre (`js/modules/crm/logique.js:1519`). Confirmé au niveau de la règle.
3. **C-03 · GÊNANT** : l'écran ne permet pas de retirer la personne ou l'organisation d'une affaire, alors que le message de refus de suppression d'une organisation dit de « détacher d'abord ses affaires » (`fiche-affaire.js:92` et `:96`).
4. **C-06 · GÊNANT** : une affaire gagnée peut être marquée « Perdue » alors que son projet continue.
5. **C-21 · MINEUR** : supprimer une affaire fait baisser les objectifs du mois.
6. **C-14 · MINEUR** : chaque activité faite apparaît deux fois dans l'historique « Tous ».

(Détail et preuves : `30-ventes-crm.md`. Les gravités sont celles du fichier de l'étape (relues).)
