# Rapport de la phase 1 : tests en paliers et CI (nuit du 17 au 18/10/2026)

## Ce qui est fusionné
- **PR 106** (`acceleration-tests`) : fusionnée après fusion de `main` dedans, règles/logique/statique verts.
- **PR 107** (`acceleration-tests-instables`) : re-pointée vers `main`, fusionnée.
- **PR 111** « Tests en paliers et CI sur les PR » : scripts `test:module`, `test:rapide`, `test:smoke`, `test:complet`, `test:nuit` ; workflows `tests.yml` et `tests-nuit.yml` ; `docs/tests.md` ; règles de tests remises à zéro dans `CLAUDE.md`, `plan-mcp.md`, `roadmap.md`, `reprise-prochaine-session.md`.
- **PR 112** : la nuit passe à 1 passage au lieu de 3.
- Cette PR (rapport + durées réelles dans `docs/tests.md`).

## Durées réelles
| Run | Durée |
|---|---|
| Palier rapide, sur le Mac | 33 à 38 s |
| Smoke (5 parcours), sur le Mac | environ 15 s |
| « Tests » sur une PR, GitHub | 14 min (PR 111), 9 min 47 s (PR 112) |
| Nuit, 1 passage, ordinateur + téléphone | 23 min 30 s |

## Ce qui a échoué, et pourquoi
- Run 1 : les dossiers `functions-plateforme` et `scripts/plateforme` n'étaient pas installés. Corrigé (`npm ci` ajouté).
- Run 2 : J4 (heure décalée de 2 h : le navigateur est en heure de Paris, pas le processus Node sur GitHub). Corrigé par `TZ: Europe/Paris`. L20 et M16 échouaient aussi : courses avec le redessin de l'écran sur machine lente ; tests stabilisés (attente de stabilité, reprise, refus accepté dans les deux ordres).
- Run 4 : C29 a échoué trois fois d'affilée, puis est passé au relancement (instable, voir ci-dessous).
- Première nuit à 3 passages : **annulée au bout de 2 h** (limite) ; elle aurait aussi épuisé le quota. D'où 1 passage (`TESTS_REPETER=3` pour revenir à 3).
- Nuit à 1 passage : **rouge**, 1 échec et 5 reprises réussies. Scénarios en cause (format téléphone surtout) : F5, C29, C36, « Veille sans aucune donnée », et L2 en ordinateur. Le vrai échec définitif est à lire dans l'artefact « tests-nuit » (journal de la série e2e). **À traiter ensuite** : ce sont des instabilités de timing déjà connues (redessin de l'écran, voir `docs/acceleration-tests-mesures.md`).

## Choix faits à ta place
- 2 reprises automatiques des scénarios sur GitHub (`retries: 2`), 2 workers, `TZ=Europe/Paris`.
- Le contrôle « aucune erreur dans la console » ignore l'erreur 409 sur `documents:commit` (rejeu normal d'une transaction), toutes les autres restent signalées.
- Smoke : C1, C3, C7, C29 (menu Projets), C36 (factures). K1 écarté (instable).
- Nuit à 1 passage au lieu de 3 (quota).
- L'ancien palier « rapide » (basé sur les specs modifiées) est remplacé par « sans navigateur ».

## Ce que je n'ai pas pu faire
- Rendre la coche « Tests » obligatoire : impossible sur le forfait gratuit d'un dépôt privé (voir ci-dessous).
- Le run de nuit programmé (2 h) n'a pas encore tourné tout seul ; seul le lancement à la main est vérifié.
- Stabiliser les scénarios instables listés plus haut.

## Les deux actions qui te restent
1. **Exiger la coche « Tests » avant fusion** : **impossible sur le forfait gratuit** (GitHub : « Upgrade to GitHub Pro or make this repository public »). Soit on reste en gratuit (Claude tient la règle sans verrou), soit GitHub Pro (environ 4 $ par mois, résiliable, 3 000 minutes d'Actions) : procédure dans `docs/reprise-prochaine-session.md`.
2. **Sortir le dépôt de Google Drive** : `git clone https://github.com/jeromechevalier-wq/chevalier-ia-os.git ~/Code-Chevalier-IA/chevalier-ia-os`, ouvrir ce dossier dans Claude Code, ne plus toucher à la copie dans Drive.
