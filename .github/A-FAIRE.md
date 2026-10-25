# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 25/10/2026, 16h15. Règle de Jérôme : **« testé par Jérôme » ne s'écrit que sur sa confirmation, et quand le test est possible** (fusionné **et** en ligne). Aucun secret ici (dépôt public).

## À tester par Jérôme (fusionné, en ligne)

| # | Sujet | PR | Testé par Jérôme |
|---|---|---|---|
| 1 | Pastille « Devis : … » sur les affaires (points 3 à 5) | 278 | en cours (points 1 et 2 vus) |
| 2 | Pastille cliquable ; fichier « À faire » | 280 | à faire |
| 3 | Carte du Tableau des devis simplifiée (HT, pastille d'état) | 282 | à faire |
| 4 | Barre d'outils des pages Devis | 284 | à faire |
| 5 | E-mails en copie du devis (cc) | 285 | à faire |
| 6 | Réglages « Mon entreprise » | 263 | à faire |
| 7 | Copie du PDF dans le dossier Drive de l'affaire | 283 | à faire (réglage CORS à faire d'abord, voir ci-dessous) |

## En cours (pas encore testable)

| # | Sujet | PR | État |
|---|---|---|---|
| 8 | Une seule liste « Étape où vivent les devis » | 286 | coche en cours, fusion automatique armée |
| 9 | Tests plus rapides (navigateur en cache, plateforme sans palier complet) | 281 | coche en cours, fusion automatique armée |
| 10 | Pastille cliquable chez un client ; devis archivé sans pastille | 287 | coche en cours, fusion automatique armée |
| 11 | Correctifs de la copie Drive (bouton « Copier dans Drive », messages, CORS documenté) | — | agent en cours |
| 12 | Correctifs : suppression d'un brouillon (document de l'affaire retiré), cc | — | agent en cours |
| 13 | **Envoi du devis par e-mail** : brouillon Gmail avec le PDF joint, bouton « Marquer comme envoyé », historique des envois | — | agent en cours (priorité de Jérôme) |
| 14 | Palier complet des tests découpé en 6 parties parallèles | — | à lancer après la fusion de la 281 |

## À faire par Jérôme (une fois)
- **Copie Drive (7)** : autoriser le site dans le stockage du PDF (réglage CORS). Mode d'emploi dans la PR de correctifs (11).
- **E-mail (13)** : activer « Gmail API » dans la console Google et ajouter la portée `gmail.compose` (liens exacts dans la PR). Pour les clients, faire vérifier l'application par Google plus tard.

## Décidé : rien à faire
- Anciens documents « Brouillon – … » : ils se renomment tout seuls au prochain PDF du même devis (décision de Jérôme, 25/10/2026).

## Fait (fusionné, en ligne, testé par Jérôme)
- PR 275 : un clic sur un devis ouvre l'éditeur ; « Voir la fiche » dans le menu « … ».
- PR 277 : « + Devis » dans le gros « + » et recherche globale (testé).
- PR 279 : un seul PDF (serveur), noms « Devis … », suppression d'un brouillon, infobulles (testé).
- PR 115 : fermée (chemin d'un Mac dans CLAUDE.md).
