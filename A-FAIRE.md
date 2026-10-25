# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 25/10/2026. Chaque ligne a un état : **en cours**, **prêt** (code écrit, pas encore en PR), **à faire**, **à décider** (une question pour Jérôme). Quand un sujet est fusionné et testé à l'écran par Jérôme, on le passe dans « Fait ». Ne rien écrire de confidentiel ici (dépôt public).

## À faire (dans l'ordre proposé)

| # | Sujet | État | Remarque |
|---|---|---|---|
| 1 | PR 279 : un seul PDF (serveur), noms « Devis … », suppression d'un brouillon, infobulles, plus de « Fermer » | en cours (fusion automatique armée, attend la coche complète) | Tests PDF de Jérôme à faire après la fusion |
| 2 | Pastille « Devis : … » cliquable (ouvre le devis) | prêt (commit local) | Fiche d'affaire et carte du Kanban |
| 3 | Tests plus rapides (cache du navigateur ; `functions-plateforme/` ne lance plus le palier complet) | prêt (commit local) | Objectif de Jérôme : 2 à 3 minutes. Piste suivante : découper le palier complet en 6 tâches parallèles |
| 4 | E-mails en copie (« + E-mail en copie », cc seulement) | prêt (branche locale `devis-cc`) | Pas de cci (décision de Jérôme) |
| 5 | Copie du PDF dans le dossier Drive de travail de l'affaire (sous-dossier « Devis ») | à faire | « Indispensable » (Jérôme). Fait côté navigateur avec le compte Google de Jérôme. Question ouverte : qui est « Mathias » ? |
| 6 | Vue Tableau des devis plus simple | à décider (voir les questions) | Retirer le TTC et « il y a N min », garder le HT en bas ; pastilles en bas à droite comme les Affaires et les Projets ; l'avertissement « PDF non rangé » y va aussi |
| 7 | Relecture par Fable des PR 277, 278, 279 (fusionnées sans relecture) | à faire | Règle de CLAUDE.md : relecture avant fusion ; ici non faite |
| 8 | Vérifications à l'écran de Jérôme : PR 277 (« + Devis », recherche), 278 (pastille, étapes), 263 (« Mon entreprise »), 279 (PDF) | en cours | Jérôme teste |

## Idées et suites déjà évoquées
- Découper le palier complet des tests en parties parallèles (gain : 25 min vers 6 min).
- Envoi du devis par e-mail (le menu « Envoyer » montre « Envoyer par e-mail (bientôt) »).
- Anciens documents d'affaire nommés « Brouillon – … » : gardent l'ancien nom (pas de renommage automatique prévu).

## Fait
- PR 275 : un clic sur un devis ouvre l'éditeur ; « Voir la fiche » dans le menu « … ».
- PR 277 : « Devis » dans le gros « + » et dans la recherche globale (fusionnée, à tester par Jérôme).
- PR 278 : pastille « Devis : … » sur les affaires, même étape possible pour « à faire » et « envoyé » (fusionnée, à tester par Jérôme).
- PR 115 fermée (chemin d'un Mac dans CLAUDE.md).
