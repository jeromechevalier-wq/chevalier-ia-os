# Synthèse provisoire : les 10 constats les plus importants (état à 22:25, heure de Paris)

Étapes déjà lues : A (projets et factures), B (serveur MCP), C (ventes et CRM), D (journal), E (accueil et chiffres), F (parcours dans l'appli), G (tests, partielle), H (documentation) ; cette liste est mise à jour à chaque étape. Les gravités sont celles des fichiers d'étape.

1. **C-01 · BLOQUANT** : supprimer une ancienne organisation efface aussi des notes et activités de personnes ou d'affaires qui l'ont quittée mais existent toujours (`js/modules/crm/logique.js:1545` et `:1550`). Confirmé au niveau de la règle.
2. **C-02 · BLOQUANT** : supprimer une personne efface le fil d'une affaire qui lui a été retirée et qui appartient maintenant à quelqu'un d'autre (`js/modules/crm/logique.js:1519`). Confirmé au niveau de la règle.
3. **A-05 et B-04 · GÊNANT** : un paiement partiel (700 sur 1000) est accepté à l'écran et par l'outil `marquer_facture_payee` ; la facture passe « Payée » à 700 et le reste disparaît, alors que la décision est « une facture se paie en entier » (`js/modules/projets/logique.js:290-299`). La doc se contredit, à arbitrer avec Jérôme.
4. **B-01 · GÊNANT** : l'outil `creer_affaire` accepte l'étape « gagne » : une affaire peut naître gagnée sans que le projet d'extraction soit créé (essai : 0 projet créé). L'écran ne le permet pas.
5. **A-01 et B-06 · GÊNANT** : une facture « à payer » peut revenir sur un projet déjà terminé et archivé (`js/modules/projets/logique.js:306-313`) ; l'impayé n'est plus visible.
6. **A-03 · GÊNANT** : la migration 2.2 compte deux fois un acompte déjà encaissé (chiffre d'affaires trop haut).
7. **A-04 · GÊNANT** : la migration rend « gagnée » une affaire perdue ou en pause qui était dans une étape retirée.
8. **B-03 · GÊNANT** : dans les fiches projet du serveur, « aPayer » est un nombre de factures et non des euros.
9. **E-01 · GÊNANT** : une facture payée dont on efface la date de paiement reste « Payée » mais disparaît du chiffre d'affaires de l'accueil, sans message. Reproduit par essai.
10. **E-03 · GÊNANT** : « Objectif atteint : Chiffre d'affaires encaissé » peut se redéclencher à chaque ouverture, car l'appli n'attend pas les projets (`js/modules/crm/index.js:50`). Reproduit avec un ordre d'arrivée des données simulé ; l'ordre réel n'est pas vérifié.

Autres points forts à garder en tête : D-03 (une grosse suppression faite depuis l'écran peut s'arrêter à moitié et le Journal affiche quand même « succès » ; essai : il reste 80 notes et l'organisation existe encore), D-04 (défaire la création d'une affaire ou d'une personne laisse en place les notes et affaires rattachées depuis ; l'aperçu dit « conflits : 0 »), D-01 (les réglages du CRM ne laissent aucune trace alors que l'écran Journal dit le contraire), C-03 (impossible de retirer la personne ou l'organisation d'une affaire à l'écran), C-06 (affaire gagnée marquée « Perdue » alors que son projet continue), E-02 (une affaire Gagnée sans activité reste indéfiniment dans « Sans action prévue »), E-06 (chiffre d'affaires compté deux fois entre anciens encaissements et factures).

À noter côté documentation (B-20) : nombre d'outils vérifié en exécutant le registre = 51 au total (13 lecteur, 44 bibliothécaire, 51 Claude Code). Le « 44 » est exact pour Hermes ; `roadmap.md` dit 16 outils projets (le code en compte 19) ; `branchement-mcp.md` annonce 33 outils pour Claude Code (le code : 51).

(Détail et preuves : `10-projets-et-factures.md`, `20-serveur-mcp.md`, `30-ventes-crm.md`.)

Total : 120 constats (2 bloquants, 45 gênants, 73 mineurs ; 114 confirmés, 6 plausibles). Rapport lisible par Jérôme : `99-rapport.html`. À ajouter à la liste ci-dessus : **F-01 · GÊNANT** : sur téléphone, le message vert « Ouvrir la fiche » se pose 5 secondes sur le bouton « Enregistrer » de la fenêtre suivante ; un toucher change de page et rien n'est enregistré (`css/os.css:296` et `:444`).
