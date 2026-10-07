# Facturation 2.2, partie B : la vente s'arrête à Gagné (07/10/2026)

Deuxième et dernière PR de la 2.2 (version **2.2.0**). La partie A avait ajouté les factures du projet ; la B retire les deux étapes des affaires et migre celles qui y étaient.

## Ce qui change

- **Les affaires n'ont plus que quatre étapes** : Premier contact, Rendez vous fixé, Proposition envoyée, Gagné. « Facture envoyée » et « Facture payée » disparaissent du Kanban, des filtres, de l'Accueil (« Affaires par étape ») et du serveur MCP (`changer_etape` les refuse comme toute étape inconnue).
- **Plus d'encaissement sur l'affaire** : le bouton « Ajouter un encaissement » et l'outil MCP `ajouter_encaissement` sont retirés (l'argent se saisit à un seul endroit : les factures du projet). La section « Encaissements » de la fiche affaire ne reste, en lecture seule, que si l'affaire a un historique d'avant la 2.2. Ces encaissements comptent toujours dans le chiffre d'affaires du mois où ils ont eu lieu.
- **Plus de suggestion « Vérifier le paiement »** ni de colonne « Facture payée du mois ». Le réglage « Délai de paiement » reste dans Réglages mais n'est plus utilisé.
- **Aucune étape de vente n'archive plus l'affaire** : une affaire Gagnée reste dans la colonne Gagné jusqu'à ce que tu l'archives (menu de la carte ou de la fiche).

## Migration (Réglages, section « Migration de la facturation (2.2) »)

La section n'apparaît que s'il reste des affaires dans les deux anciennes étapes. « Voir ce qui va changer » ouvre un **aperçu** ; rien n'est écrit tant que tu n'as pas cliqué « Migrer ».

- **Affaire « Facture payée »** : passe à Gagné ; archivage et encaissements conservés (ton chiffre d'affaires ne bouge pas) ; un événement dans son fil.
- **Affaire « Facture envoyée »** (un paiement est attendu) :
  - avec un projet et un montant : passe à Gagné et son projet reçoit une facture « À payer » du montant de l'affaire (date d'envoi reprise) : la clôture du projet attend ce paiement ;
  - sans projet, sans montant, ou avec une simple extraction : passe à Gagné et est listée **« à traiter à la main »** (l'événement du fil le dit). Aucun projet n'est jamais créé à ta place.
- **Une seule opération d'audit** : la migration se restaure d'un coup. Elle est **idempotente** (une affaire migrée n'est plus concernée) et ne touche pas aux autres affaires.

## Côté serveur MCP

`changer_etape` n'accepte plus que les quatre étapes ; `montantEncaisse` et `ajouter_encaissement` n'existent plus. Les listes d'outils des guides (`branchement-mcp.md`, `mcp-etape-4.md`, `plan-mcp.md`) sont à jour : si ton agent Hermes a une liste d'outils autorisés, retire `ajouter_encaissement` (la liste donnée dans le guide est vérifiée par un test). Les outils MCP des projets (factures comprises) viendront ensuite.

## Tests

Règles pures : B6 (étapes retirées), B9, B12, B16, B17 et B31 adaptés ; B35 (migration : payée, envoyée avec projet, cas « à la main », idempotence, deux affaires sur un même projet). Serveur : refus des anciennes étapes, outil retiré. Parcours dans le navigateur : C10, C18, C21 adaptés ; C37 (aperçu, migration, chiffre d'affaires intact, clôture bloquée par la facture reprise, journal).

## Ensuite

- Outils MCP des projets (chercher, créer, changer de phase, terminer, factures).
- À décider : archiver automatiquement l'affaire quand son projet est clôturé (aujourd'hui, une affaire Gagnée reste dans la colonne Gagné tant qu'on ne l'archive pas).
