# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 25/10/2026, 15h45. États : **en test** (la coche GitHub tourne, fusion automatique armée), **en cours** (un agent y travaille), **prêt** (code écrit, pas encore en PR), **à faire**, **à décider**. Quand un sujet est fusionné **et** testé à l'écran par Jérôme, il passe dans « Fait ». Aucun secret ici (dépôt public).

## À faire

| # | Sujet | PR | État | Jérôme doit… |
|---|---|---|---|---|
| 1 | Un seul PDF (serveur), noms « Devis … », suppression d'un brouillon, infobulles, plus de « Fermer » | 279 | en test (coche complète, fin vers 15h47 ; le test rapide est vert) | tester les PDF après la fusion |
| 2 | Pastille « Devis : … » cliquable, plus ce fichier | 280 | en test | tester : un clic sur la pastille ouvre le devis |
| 3 | Tests plus rapides (navigateur en cache ; `functions-plateforme/` sans palier complet) | 281 | en test (touche les workflows : 25 min une seule fois) | rien (regarder la durée des prochaines coches) |
| 4 | Carte du Tableau des devis simplifiée (HT en bas, pastille ronde grise, verte, rouge) | 282 | en test | tester la vue Tableau |
| 5 | Copie du PDF dans le dossier Drive de l'affaire (sous-dossier « Devis ») | — | en cours (agent) | tester avec son compte Google (Drive réel) |
| 6 | E-mails en copie (« + E-mail en copie », cc seulement) | — | prêt (branche locale) ; à poser sur `main` quand la 279 est fusionnée | tester après |
| 7 | Relecture par Fable des PR 277 à 282 (fusionnées ou à fusionner sans relecture) | — | à faire | rien |
| 8 | Vérifications de Jérôme : PR 277 (« + Devis », recherche), 278 (pastille et étapes), 263 (« Mon entreprise ») | — | en cours | continuer ses tests |
| 9 | Palier complet découpé en 6 parties parallèles (25 min vers 6 min) | — | à faire (idée de Fable, plus risqué : le nom de la coche changerait) | décider quand |
| 10 | Envoi du devis par e-mail (« bientôt » dans le menu Envoyer) | — | à faire | prioriser |
| 11 | Anciens documents d'affaire nommés « Brouillon – … » : renommer ? | — | à décider | dire si on renomme |

## Fait
- PR 275 : un clic sur un devis ouvre l'éditeur ; « Voir la fiche » dans le menu « … ».
- PR 277 : « Devis » dans le gros « + » et la recherche globale (fusionnée ; test de Jérôme en cours).
- PR 278 : pastille d'état sur les affaires, même étape pour « à faire » et « envoyé » (fusionnée ; test de Jérôme en cours).
- PR 115 : fermée (chemin d'un Mac dans CLAUDE.md).
- Tests rapides de 3 minutes : seule la coche complète des PR sensibles reste longue (PR 281).
