# Format commun des constats (audit fonctionnel, version 2.3.3)

Ce fichier fixe la façon d'écrire chaque constat, pour que le rapport final (`99-rapport.html`) puisse les compter et les rassembler sans erreur.

## Identifiants
Un constat = un identifiant `LETTRE-NN` : la lettre de l'étape, puis un numéro à deux chiffres.
A = projets et factures, B = serveur MCP, C = ventes et CRM, D = journal et restauration, E = accueil et statistiques, F = parcours, G = tests, H = point projet.
Exemple : `A-01`, `B-07`.

## Modèle à recopier (un bloc par constat)

```
### A-01 · Titre simple, sans jargon
- **Gravité** : BLOQUANT | GÊNANT | MINEUR
- **Confiance** : CONFIRMÉ | PLAUSIBLE
- **Ce qui se passe** : une ou deux phrases.
- **Ce que ça change pour Jérôme** : une phrase concrète.
- **Où dans le code** : `fichier:ligne` (plusieurs possibles)
- **Règle ou décision concernée** : `docs/fichier.md` (et la phrase de la règle)
- **Preuve** : la ligne de code citée, ou le nom du test / de l'essai qui le montre.
```

## Définitions des gravités
- **BLOQUANT** : perte ou corruption de données, ou une action importante est impossible, ou une règle de Jérôme est violée de façon silencieuse.
- **GÊNANT** : un résultat faux ou trompeur, ou une règle contournable, mais sans perte de données ; Jérôme peut s'en sortir.
- **MINEUR** : confort, libellé, documentation périmée, incohérence sans effet sur les données.

## Définitions de la confiance
- **CONFIRMÉ** : reproduit par un test (existant ou écrit dans la session, hors du dépôt) ou par un essai réel sur les émulateurs.
- **PLAUSIBLE** : lu dans le code, pas encore reproduit. À vérifier.

## Règles d'écriture
- Français simple, comme à quelqu'un de 18 ans. Pas de jargon sans explication.
- Aucun nombre inventé : un chiffre non vérifié s'écrit « non vérifié ».
- Pas de constat sans preuve (ligne de code ou test).
- Pas de constat de sécurité ici : s'il y en a, ils vont dans une section « Remarques de sécurité vues en passant » à la fin du fichier de l'étape, sans enquête.
- Les décisions de Jérôme ne sont pas rouvertes (RGPD : aucune mesure ; journaux jamais effacés).
- En tête de chaque fichier d'étape : `Statut : complet` ou `Statut : partiel`, puis ce qui n'a pas été regardé.
- Fin de chaque fichier d'étape : une liste « Vérifié et conforme » (ce qui a été regardé et marche bien).
- Les constats se trouvent sous un titre `## Constats` et chaque constat commence par `### X-NN ·`.
