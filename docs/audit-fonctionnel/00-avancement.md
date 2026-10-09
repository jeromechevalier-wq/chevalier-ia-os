# Avancement de l'audit fonctionnel (Chevalier IA OS 2.3.3)

Branche : `claude/fervent-mayer-gme1rw` (aucune PR, rien sur `main`). Dernière mise à jour : 2026-10-08 17:58 (heure de Paris). Audit repris après la pause : rapport final écrit ; l'étape F (parcours dans l'appli) reste à faire.

| Étape | Fichier | État | Heure (Paris) |
|---|---|---|---|
| Démarrage | `git fetch` fait ; la branche est identique à `main` | terminé | 16:58 |
| Format commun | `02-format-des-constats.md` | terminé | 17:05 |
| A. Projets et factures | `10-projets-et-factures.md` | terminé, statut partiel (15 constats : 0 bloquant, 5 gênants, 10 mineurs) | 17:11 |
| B. Serveur MCP | `20-serveur-mcp.md` | terminé, statut complet (22 constats : 0 bloquant, 11 gênants, 11 mineurs) | 17:13 |
| C. Ventes et CRM | `30-ventes-crm.md` | terminé, statut partiel (24 constats : 2 bloquants, 9 gênants, 13 mineurs) | 17:10 |
| D. Journal et restauration | `40-journal-et-restauration.md` | terminé, statut partiel (17 constats : 0 bloquant, 7 gênants, 10 mineurs) | 17:25 |
| E. Accueil, objectifs, statistiques | `50-accueil-objectifs-statistiques.md` | terminé, statut partiel (17 constats : 0 bloquant, 8 gênants, 9 mineurs) | 17:19 |
| F. Parcours utilisateur | `60-parcours-utilisateur.md` | NON FAITE (pause demandée par Jérôme, puis priorité au rapport) : aucun parcours fait, 0 constat F ; émulateurs et navigateur vérifiés (démarrent bien ici) | 17:50 |
| G. Tests et qualité | `70-tests-et-qualite.md` | terminé en partie, statut partiel, 6 constats (0 bloquant, 2 gênants, 4 mineurs) : suite complète faite (17:13 à 17:34) : 744 réussis (540 tests purs + 204 dans le navigateur), 2 échecs (même test, ordinateur et téléphone), 2 sautés ; analyse des tests en cours (agent) | 17:42 |
| H. Point projet | `80-point-projet.md` | terminé, statut partiel (9 constats : 0 bloquant, 2 gênants, 7 mineurs) | 17:35 |
| Confirmations des constats plausibles | `09-confirmations.md` | terminé : sur 26, 20 confirmés, 2 non reproduits (A-12, G-04), 4 non testables ici (E-08, A-15, C-13, H-09) ; reportés dans les fichiers d'étape | 21:55 |
| I. Rapport final | `99-rapport.html` | terminé (un seul fichier HTML autonome, vérifié sur 390 px et 1440 px, filtre testé) | 17:58 |

## Décisions de Jérôme sur la facturation (08/10/2026)
Voir `03-decisions-facturation.md` : paiement partiel refusé, facture refusée sur un projet terminé, confirmation avec avertissement avant de supprimer une facture payée, migration 2.2 déjà appliquée (donc à vérifier sur les vraies données).

## Constats par gravité et par confiance
Total compté par script à partir des fichiers d'étape : **110 constats** (2 bloquants, 44 gênants, 64 mineurs ; 84 confirmés, 26 plausibles). Par étape : A 15, B 22, C 24, D 17, E 17, F 0, G 6, H 9. La confiance est celle de la première étiquette de chaque constat (un constat « confirmé en partie » est compté confirmé).

- **BLOQUANT · CONFIRMÉ** (2) : C-01, C-02
- **BLOQUANT · PLAUSIBLE** (0) : aucun
- **GÊNANT · CONFIRMÉ** (37) : A-01, A-02, A-03, A-04, A-05, B-01, B-02, B-03, B-04, B-05, B-06, B-07, B-08, B-09, B-10, B-11, C-04, C-05, C-06, C-08, C-09, C-11, D-03, D-04, D-05, D-06, D-07, E-01, E-02, E-03, E-04, E-05, E-06, E-07, G-01, H-01, H-02
- **GÊNANT · PLAUSIBLE** (7) : C-03, C-07, C-10, D-01, D-02, E-08, G-02
- **MINEUR · CONFIRMÉ** (45) : A-06, A-07, A-08, A-09, A-10, A-14, B-13, B-14, B-15, B-16, B-17, B-18, B-19, B-20, B-21, C-12, C-14, C-16, C-17, C-18, C-20, C-22, C-23, D-08, D-09, D-10, D-11, D-13, D-15, D-16, D-17, E-09, E-10, E-11, E-12, E-14, E-16, E-17, G-05, H-03, H-04, H-05, H-06, H-07, H-08
- **MINEUR · PLAUSIBLE** (19) : A-11, A-12, A-13, A-15, B-12, B-22, C-13, C-15, C-19, C-21, C-24, D-12, D-14, E-13, E-15, G-03, G-04, G-06, H-09

## Ce qui n'a PAS été couvert
- **Étape F (parcours dans l'appli, ordinateur et téléphone) : non faite.** Seul le démarrage des émulateurs et du navigateur a été vérifié. Aucun constat F. À faire : personne, affaire (avancer, gagner), projet depuis l'affaire, tâches, facture, encaissement, clôture avec facture à payer, affaire perdue, pause avec réveil, favoris, recherche globale, Journal, Réglages ; mesures de débordement, boutons trop petits, erreurs de console, retours visibles.
- **Étape G partielle** : liste des règles qu'aucun test ne couvre non consolidée ; tests qui figent un comportement douteux (ex. B33) non examinés ; couverture par module non vérifiée.
- **Étapes A, C, D, E** : lecture du code et essais purs ; pas d'essai dans un navigateur pour la plupart (les constats qui dépendent de l'écran sont « plausibles » quand ils n'ont pas été rejoués).
- Non regardé : serveur déployé, vraies données de Jérôme (migration 2.2 déjà appliquée ? non vérifié), consoles Google / Firebase / Backblaze, Hermes et le VPS, dépôt `_JEROME_OS_onGIT`, sécurité (hors mission).
- Suite de tests complète lancée le 2026-10-08 de 17:13 à 17:34 : 744 réussis (540 tests purs + 204 dans le navigateur), 2 échecs (même test `projets.spec.js:127`, ordinateur et téléphone, constat G-01), 2 sautés volontairement.
