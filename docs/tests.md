# Les tests : mode d'emploi (une page)

Écrit le 18/10/2026. Pour Jérôme : tu n'as **rien à lancer** sur ton Mac.

## Les trois paliers

| Palier | Ce que c'est | Combien de temps | Qui le lance, quand |
|---|---|---|---|
| **Rapide** | Les règles, la logique et les contrôles, sans navigateur | moins d'une minute | Claude, dans la session, avant d'ouvrir une PR |
| **Smoke** (« fumée ») | 5 parcours essentiels dans un vrai navigateur : connexion, créer une personne, une affaire, un projet, ajouter des factures. Format ordinateur seulement | environ 15 secondes | Claude, dans la session, avant d'ouvrir une PR |
| **Complet** | Tous les tests, dont tous les parcours navigateur, en format ordinateur. **Si la PR touche le CSS ou un écran** (`css/`, `js/`, `index.html`, `espace/`, `assets/`, `manifest.webmanifest`, `tests/e2e/`, `tests/playwright.config.js`), le format **téléphone** est ajouté. Une PR qui ne touche que de la doc, des règles ou des fonctions saute le téléphone (il tourne la nuit) | voir « Durée réelle » ci-dessous | **GitHub**, automatiquement, sur chaque PR |
| **De nuit** | Tout, ordinateur **et téléphone**, chaque scénario une fois (3 fois si on règle `TESTS_REPETER=3`, trop long pour le quota gratuit) | plus long | **GitHub**, chaque nuit à 2 h (heure de Paris) sur `main` |

Pendant le travail, Claude ne lance que les tests du module qu'il touche (`npm run test:module projets`, par exemple).

## Où lire le résultat

- Sur une PR : en bas de la page de la PR, la ligne **« Tests »** : coche verte = tout va bien, croix rouge = quelque chose a échoué. Clique « Details » pour voir lequel.
- Tous les runs : https://github.com/jeromechevalier-wq/chevalier-ia-os/actions (colonne de gauche : « Tests » pour les PR, « Tests de nuit » pour la nuit).
- En cas d'échec, descends en bas de la page du run, section **Artifacts** : « tests-echec » (captures d'écran et rapport, gardés 7 jours) ou « tests-nuit » (14 jours).

## Relancer un run à la main

1. Va sur https://github.com/jeromechevalier-wq/chevalier-ia-os/actions
2. Clique « Tests » (ou « Tests de nuit ») dans la colonne de gauche.
3. Clique le bouton **« Run workflow »** (à droite), choisis la branche, puis le bouton vert « Run workflow ».

Pour relancer un run échoué : ouvre-le, puis « Re-run jobs » en haut à droite.

## Le quota

Les minutes de GitHub Actions sont limitées : **2 000 minutes par mois** en plan gratuit pour un dépôt privé. Une minute sur ce type de machine (Ubuntu) compte pour une minute. Le run de nuit compte aussi.

Estimation : voir « Durée réelle » ci-dessous (mise à jour avec les premiers runs). Règle simple : coût d'une PR = durée du run × nombre de poussées sur la PR (un nouveau push annule le run précédent, qui s'arrête tout de suite). Le run de nuit, lui, compte une fois par nuit, soit environ 30 fois par mois.

## Durée réelle

Mesures du 18/10/2026 (machine GitHub Ubuntu, petite : 2 workers) :

- **Run « Tests » sur une PR** (complet, ordinateur) : **10 à 14 minutes** (14 min 0 s sur la PR 111, 9 min 47 s sur la PR 112).
- **Run de nuit** (ordinateur + téléphone, 1 passage) : **23 min 30 s**.
- Coût par mois, à titre d'ordre de grandeur : une PR avec 3 poussées ≈ 40 minutes ; 20 PR ≈ 800 minutes ; la nuit ≈ 30 × 24 = 720 minutes. Le total (~1 500 minutes) tient dans les 2 000 minutes, mais sans grande marge : si le quota se vide, passer la nuit à un jour sur deux ou rendre le dépôt public (minutes gratuites).

## Scénarios connus pour échouer « au hasard »

Voir `docs/acceleration-tests-mesures.md`, section « Instabilités ». Sur GitHub, un scénario est repris une fois automatiquement ; s'il passe à la 2e fois, le rapport le marque « flaky » mais la coche reste verte.

<!-- essai -->
