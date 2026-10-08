# Consigne « one shot » pour la prochaine session (à coller telle quelle)

> Jérôme relance à 19h01 (heure de Paris), le 8 octobre 2026. Une seule passe, sans poser de question, sauf si une règle ci-dessous l'exige. Tout est déjà sur la branche `claude/fervent-mayer-gme1rw`.

## Règles (inchangées)
- Audit FONCTIONNEL, pas de sécurité. Tu ne corriges rien dans l'appli : tu produis des constats.
- Branche unique : `claude/fervent-mayer-gme1rw`. Pas de PR, rien sur `main`. Tu n'écris que dans `docs/audit-fonctionnel/`.
- Aucune donnée réelle, jamais le MCP de production : émulateurs Firebase locaux uniquement (`cd tests && npx firebase emulators:exec --config ../firebase.json --project demo-chevalier-ia-os --only auth,firestore "<commande>"`). Ne pas lancer `npm install` (il modifie `tests/package-lock.json` : si c'est arrivé, `git checkout -- tests/package-lock.json`).
- Jamais de secret. Pas de nombre inventé (« non vérifié »). Explique en français simple, comme à quelqu'un de 18 ans.
- Format des constats : `02-format-des-constats.md` (identifiants F-01…, gravité, confiance).
- Après CHAQUE étape : mettre à jour `00-avancement.md` (heure de Paris réelle : `TZ=Europe/Paris date`) et `01-synthese-provisoire.md`, puis `git add`, `git commit`, `git push`. Maximum 3 agents en parallèle, chacun n'écrit que son fichier ; c'est toi qui commites.
- Décisions de Jérôme à appliquer dans les priorités : voir `03-decisions-facturation.md` (paiement partiel refusé ; facture refusée sur un projet terminé ; avertir avant de supprimer une facture payée ; migration 2.2 vérifiée, impact faible).

## Ce qu'il faut faire, dans l'ordre
1. `git fetch`, lire `00-avancement.md`, `03-decisions-facturation.md`, `02-format-des-constats.md`, et le début de `60-parcours-utilisateur.md`.
2. **Étape F : parcours dans l'appli.** Les émulateurs et Chromium démarrent bien ici (vérifié le 08/10/2026). Réutilise `tests/e2e/outils.js` (connexion de test, écriture dans l'émulateur) dans un script Playwright hors dépôt. Sur ordinateur 1440 × 900 ET téléphone 390 × 844, enchaîne : créer une personne ; créer une affaire ; la faire avancer puis la gagner ; créer son projet ; ajouter des tâches ; ajouter une facture ; l'encaisser ; clôturer (et essayer avec une facture à payer : deux sorties) ; perdre une affaire (raison, projet d'extraction) ; pause avec date de réveil ; favoris (étoile des documents, bloc Favoris de l'accueil, « Défaire » du retrait) ; recherche globale ; Journal ; Réglages. Note ce qui est confus, lent (indicatif), mal nommé, sans retour visible, impossible à annuler, cassé ; débordement horizontal ; boutons < 44 px ; erreurs de console. Si un constat déjà écrit (A à E) est reproduit à l'écran, cite son identifiant au lieu d'en refaire un. Écris `60-parcours-utilisateur.md` (Statut complet ou partiel), captures légères (< 150 Ko, au plus 8) dans `docs/audit-fonctionnel/captures/`.
3. **Étape G, fin** : dans `70-tests-et-qualite.md`, ajoute la liste des règles de gestion importantes qu'AUCUN test ne couvre (règle, source dans `docs/`, endroit dans le code), les tests qui figent un comportement douteux (ex. B33 : paiement partiel accepté, à changer vu la décision de Jérôme), et l'analyse des autres `toHaveCount(0)` juste après une navigation.
4. **Passer les constats PLAUSIBLES en CONFIRMÉS quand c'est possible** (26 au 08/10/2026 ; liste dans `00-avancement.md`) : écris un petit essai pur ou un essai sur émulateur hors dépôt ; si l'essai échoue à reproduire, dis-le et baisse la gravité ou retire le constat avec une note.
5. **Regénérer le rapport** : `python3 docs/audit-fonctionnel/outils/faire_rapport.py` (lit tous les fichiers d'étape, compte, écrit `99-rapport.html`). Mets à jour à la main dans ce script la section « Les 5 choses à savoir » et la phrase « Ce que cet audit n'a pas fait » si F est faite. Vérifie le HTML sur 390 px et 1440 px (pas de débordement, pas d'erreur, filtre OK).
6. Mets à jour `00-avancement.md` : liste des constats par gravité et par confiance (le script écrit `/tmp/audit-listes.md`), ce qui n'a PAS été couvert. Commit, push.
7. Termine par : le lien de la branche, le nombre de constats (compté par le script) par gravité, et les 5 constats à traiter en premier.

## Si il reste de la marge à la fin
Voir la fin du message de la session précédente : options proposées à Jérôme (vérifier à fond les constats les plus graves, deuxième regard indépendant, préparer des correctifs en petites PR sans rien fusionner, alignement de la documentation).
