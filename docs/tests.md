# Les tests : mode d'emploi (une page)

Écrit le 18/10/2026. Pour Jérôme : tu n'as **rien à lancer** sur ton Mac.

## Les trois paliers

| Palier | Ce que c'est | Combien de temps | Qui le lance, quand |
|---|---|---|---|
| **Rapide** | Les règles, la logique et les contrôles, sans navigateur | moins d'une minute | Claude, dans la session, avant d'ouvrir une PR |
| **Smoke** (« fumée ») | 5 parcours essentiels dans un vrai navigateur : connexion, créer une personne, une affaire, un projet, ajouter des factures. Format ordinateur seulement | environ 15 secondes | Claude, dans la session, avant d'ouvrir une PR |
| **Complet** | Tous les tests, dont tous les parcours navigateur. Format ordinateur seulement | voir « Durée réelle » ci-dessous | **GitHub**, automatiquement, sur chaque PR |
| **De nuit** | Tout, ordinateur **et téléphone**, chaque scénario 3 fois (pour attraper ceux qui échouent « au hasard ») | plus long | **GitHub**, chaque nuit à 2 h (heure de Paris) sur `main` |

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

*(à compléter avec le premier run sur GitHub : voir `docs/rapport-phase-1-tests.md`)*

## Scénarios connus pour échouer « au hasard »

Voir `docs/acceleration-tests-mesures.md`, section « Instabilités ». Sur GitHub, un scénario est repris une fois automatiquement ; s'il passe à la 2e fois, le rapport le marque « flaky » mais la coche reste verte.
