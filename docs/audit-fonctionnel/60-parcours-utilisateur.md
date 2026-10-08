# Étape F : parcours utilisateur (ordinateur 1440 × 900 et téléphone 390 × 844)

Statut : partiel (arrêté à la demande de Jérôme, avant le premier vrai parcours). Aucun constat F n'est écrit : rien n'a encore été vu à l'écran, et la règle du format est « pas de constat sans preuve ».

## Ce qui a été fait

- Lecture du format des constats (`02-format-des-constats.md`), de `CLAUDE.md`, des titres des constats déjà écrits (A, B, C, D, E) pour ne pas les répéter.
- Lecture des outils d'essai du dépôt : `tests/e2e/outils.js` (connexion de test, écriture dans l'émulateur), `tests/e2e/serveur.js`, `tests/playwright.config.js`, `tests/package.json`, et des parcours déjà écrits dans `tests/e2e/parcours.spec.js` et `tests/e2e/projets.spec.js` (pour connaître les boutons et les textes à l'écran).
- Lecture de `js/modules/crm/fiche-affaire.js` (fiche d'une affaire : boutons Gagnée / Perdue / En pause, section Projet, documents avec étoile).
- Mise en place d'un petit banc d'essai hors du dépôt (dossier de travail de la session, pas dans le dépôt) : un fichier de configuration Playwright qui lance l'appli avec les deux formats d'écran, et qui réutilise les outils de `tests/e2e/outils.js`.
- **Essai de fumée réussi** : avec les émulateurs Firebase locaux (auth + firestore, projet `demo-chevalier-ia-os`) et Chromium (`/opt/pw-browsers`), la connexion de test puis l'arrivée sur l'Accueil ont fonctionné sur ordinateur et sur téléphone (2 essais sur 2 réussis, environ 5 s et 3 s, mesure indicative). Les émulateurs et Chromium tournent donc bien dans cet environnement.
- Aucune donnée réelle, aucun appel à la production. Les émulateurs ont été fermés à la fin de chaque lancement ; aucun processus ne reste actif. Rien n'a été modifié dans le code, les tests ou les règles ; aucun git.

## Ce qui n'a PAS été fait (parcours restants)

Tous les parcours demandés, sur ordinateur ET téléphone :

1. Créer une personne.
2. Créer une affaire, la faire avancer, la gagner.
3. Créer le projet depuis l'affaire gagnée.
4. Ajouter des tâches.
5. Facturer (ajouter une facture) puis encaisser (marquer payée).
6. Clôturer le projet, avec une facture à payer (blocage et deux sorties).
7. Perdre une affaire (raison, projet d'extraction).
8. Mettre une affaire en pause avec date de réveil.
9. Favoris : étoile des documents (affaires et projets), bloc Favoris de l'accueil, « Défaire » du retrait.
10. Recherche globale.
11. Écran Journal.
12. Réglages.

Et les mesures transversales prévues, jamais lancées : débordement horizontal sur téléphone, boutons de moins de 44 px, textes coupés, erreurs dans la console du navigateur, messages de confirmation absents, gestes impossibles à annuler, lenteurs (mesure indicative en ms), captures d'écran (aucune capture gardée dans `docs/audit-fonctionnel/captures/`).

## Constats

Aucun constat F pour l'instant (0 BLOQUANT, 0 GÊNANT, 0 MINEUR).

## Pour reprendre

Le banc d'essai est à reconstruire (il est hors du dépôt) : un fichier de configuration Playwright pointant vers `tests/node_modules/@playwright/test`, avec deux projets (ordinateur, téléphone), lancé depuis `tests/` avec la commande `npx firebase emulators:exec --config ../firebase.json --project demo-chevalier-ia-os --only auth,firestore "npx playwright test --config <fichier>"`. Les captures doivent être écrites avec un chemin absolu (sinon elles tombent dans `tests/`).

## Vérifié et conforme

- Les émulateurs Firebase (auth, firestore) et Chromium démarrent dans cet environnement ; la connexion de test et l'arrivée sur l'Accueil fonctionnent sur ordinateur et sur téléphone (essai de fumée, 0 erreur de test).
