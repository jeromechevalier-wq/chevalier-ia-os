# Facturation 2.2, partie A : les factures du projet (07/10/2026)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Première des deux PR de la 2.2. **Rien n'est retiré** : les étapes « Facture envoyée » et « Facture payée » des affaires restent (partie B, après ta validation sur tes vraies données).

## Ce qui est construit

- **Une liste de factures sur chaque projet** (section « Factures » de la fiche). Une ligne par échéance : libellé (ex. « Acompte 30 % »), montant, date d'envoi, statut, date de paiement. 30 % à la commande, 30 % en cours, 40 % à la fin = trois lignes. Les factures sont stockées dans le projet (champ `factures`), donc rien à publier côté règles Firestore.
- **Trois statuts** : À payer, Payée, Abandonnée (un seul statut pour l'impayé, avec sa raison).
- **Marquer payée** : date du paiement proposée, modifiable. **Une facture se paie en entier** (décision de Jérôme, 08/10/2026, appliquée en 2.15.3) : il n'y a plus de champ « montant reçu » ; si un client paie une autre somme, on modifie le montant de la facture ou on la sépare en deux lignes. Un montant donné par le serveur MCP qui diffère de la facture est refusé avec un message clair. Un message « Paiement enregistré » et la célébration du chiffre d'affaires. Chaque paiement écrit un événement « Encaissement » dans le fil du projet.
- **Projet terminé (2.15.3)** : on ne peut ni ajouter une facture « à payer » ni remettre une facture à payer (« Ce projet est terminé : rouvre-le d'abord. ») ; payer, abandonner et ajouter une facture déjà payée restent possibles. **Une facture payée garde sa date de paiement** : la vider est refusé (sinon elle sortirait du chiffre d'affaires).
- **Une facture est payée en entier ou pas** : si un client règle une même facture en deux fois, sépare-la en deux lignes.
- **La Clôture est bloquée** tant qu'une facture est « À payer » : « Terminer », et aussi le déplacement d'une carte vers la phase Clôture. Le message nomme les factures et propose **deux sorties** :
  1. **Marquer payée** (puis la clôture reprend toute seule) ;
  2. **Clôturer avec impayé** : une raison obligatoire, les factures restantes passent à « Abandonnée », le projet se termine (et son extraction est créée comme d'habitude).
- **Pastille « Impayé »** sur la fiche et dans les Archives pour un projet qui a au moins une facture abandonnée. On peut rouvrir le projet, remettre la facture à payer si le client finit par payer, l'encaisser, et clôturer normalement.
- Un projet **sans facture** (chantier interne, extraction) se clôture comme avant.
- **Objectif « chiffre d'affaires encaissé » et graphique de l'Accueil** : ils comptent aussi les factures **payées** des projets, dans le **mois du paiement**. Les factures à payer ou abandonnées ne comptent jamais. Les encaissements des affaires comptent toujours : **tant que la partie B n'est pas faite, ne saisis pas deux fois le même argent** (une facture sur le projet ET une étape « Facture payée » sur l'affaire).

## Choix faits, à contredire si besoin

- Pas de délai ni de rappel automatique pour les impayés (décision du 07/10/2026).
- Abandonner une facture se fait aussi à la main (menu de la ligne) ; on peut aussi remettre à payer une facture payée par erreur.
- Le serveur MCP n'a pas encore d'outil de projet : rien à brancher de ce côté. Les règles sont écrites dans `projets/logique.js`, prêtes pour les outils MCP des projets.

## Tests

Règles pures : B33 (factures, blocage, sortie impayé) et B34 (objectif encaissé). Parcours dans le navigateur (C36, à 1440 × 900 et 390 × 844) : trois échéances payées une à une avec l'objectif de l'Accueil, blocage et sortie par le paiement, clôture avec impayé puis réouverture, déplacement vers la Clôture refusé, pastille dans les Archives.

## Ensuite

- **Partie B** : retrait des étapes « Facture envoyée / payée » des affaires, migration des affaires existantes (tu valides sur tes vraies données avant la fusion), objectif et célébration entièrement rebranchés sur les factures.
- Outils MCP des projets.
