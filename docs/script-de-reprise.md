# Script de reprise et sessions séparées

Écrit le 29/10/2026. La session principale (« colonne vertébrale ») est devenue trop longue : elle garde les **décisions** et le **tableau** (`.github/A-FAIRE.md`). Le travail se fait dans des sessions séparées, courtes, chacune avec un seul sujet. Aucun secret ici (dépôt public).

## Comment ça marche
1. Ouvre une **nouvelle session** sur le dépôt `chevalier-ia-os`.
2. Colle le **script de reprise commun** (juste en dessous), puis le **script du sujet** choisi.
3. À chaque étape, la session envoie un court message à la session principale (qui est ainsi réveillée) ; à la fin elle met à jour sa ligne dans `.github/A-FAIRE.md`. Tu peux aussi demander à la session principale « où en est la session 1 ? » : elle va lire.
4. La session principale ne reçoit que le résultat en une phrase, pas le détail.

## Script de reprise commun (à coller au début de chaque session)

```
Reprise de travail sur Chevalier IA OS. Lis dans cet ordre, sans rien modifier :
1. CLAUDE.md (décisions permanentes et façon de travailler : explique simplement, donne les liens exacts, jamais de secret).
2. .github/A-FAIRE.md, la « Vue d'ensemble » en haut : état de tout le projet au 29/10/2026 (version 2.34.0).
3. docs/reprise-prochaine-session.md, le rapport du matin de la 3e nuit.
Puis fais UNIQUEMENT le sujet ci-dessous. Une PR par sujet, depuis la dernière version de main. Ne touche pas à la version ni au wiki sauf si le sujet le dit. Ne déploie jamais la plateforme clients sans que Jérôme lance le bouton. À chaque étape terminée (et à la fin), envoie un court message à la session principale avec l'outil send_message de claude-code-remote, session_id session_01MBW4b4ELa55fEs2cP41e2G : une ligne « étape faite / bloqué / décision attendue », sans secret ni donnée de client. À la fin : mets à jour la ligne du sujet dans .github/A-FAIRE.md et résume en 5 lignes simples pour Jérôme.
```

## Session 1 : Mise en service du dictionnaire (Jérôme + Claude, environ 1 heure)

À faire dans cet ordre, parce que chaque étape dépend de la précédente.

```
SUJET : mettre en service le dictionnaire de vocabulaire.
1. Vérifie que la PR 391 (règles Firestore de devis_vocabulaire) est à jour et verte ; dis à Jérôme de la fusionner (étiquette a-fusionner-par-jerome). Après fusion : git show origin/main:firestore.rules | grep -c devis_vocabulaire doit valoir environ 5.
2. Publie les règles chez Jérôme (workflow « Publier les règles (CRM de Jérôme) »).
3. Demande à Jérôme de lancer « Déploiement plateforme clients » > regles, puis hosting, fonctions, mcp (un par un, avec le lien exact du workflow). Vérifie chaque run.
4. Déploie aussi functions/ chez Jérôme (renommer un workflow, outils MCP du dictionnaire).
5. Vérifie sur le client démo : Réglages > Déploiement (ligne « Personnes autorisées » repassée au vert), module Devis actif dans l'espace, onglet Vocabulaire visible.
6. Guide Jérôme pour l'essai avec un vrai ChatGPT : « Actualiser les outils », puis une phrase au client du genre « un devis avec 3 prises à 25 € et un disjoncteur 32 » ; vérifier que l'assistant enchaîne rechercher_article_par_phrase puis creer_devis_brouillon, pose une question si c'est ambigu, et que la réponse apparaît dans l'écran Vocabulaire (à confirmer).
Cas à signaler : outil absent après actualisation, question jamais posée, prix d'achat visible.
```

## Session 2 : Onglet « Documents » (PR 369), les 3 urgences (Claude seul, puis Jérôme pour la console)

```
SUJET : préparer la PR 369 (onglet Documents) pour une fusion sûre par Jérôme. Aucune fusion par Claude.
1. Mets la branche à jour sur main, relance les tests de la PR (coche « Tests » verte).
2. Urgence 1 : règles Storage du projet chevalier-ia-os (elles n'ont pas de source dans le dépôt) : écris pas à pas à Jérôme comment les lire dans la console Firebase (lien exact, où cliquer) et ce qu'il doit voir ; propose de versionner ces règles dans le dépôt.
3. Urgence 2 : droits IAM de porte-serveur@, mcp-serveur@ et mcp-clients@ (rôle « Administrateur des objets de Storage » avec condition sur le préfixe documents/ ou clients/) : liste les clics exacts.
4. Urgence 3 : sauvegarde serveur de crm_audit* et devis_compteurs (aucun bouton d'export ne les couvre) : propose une PR séparée avec Fable.
5. Donne à Jérôme la liste dans l'ordre : fusion, règles Firestore, déploiement des clients.
Relecture Fable obligatoire pour tout code ajouté.
```

## Session 3 : Génération du PDF trop lente (Claude seul, de nuit possible)

```
SUJET : le PDF d'un devis prend plusieurs secondes et on croit que l'outil a planté.
1. Mesure où passe le temps (démarrage du navigateur du serveur, mise en page, enregistrement, lien) avec des chiffres, chez Jérôme (functions/) ; ne modifie rien avant la mesure.
2. Propose et code la correction la plus simple : d'abord une progression claire à l'écran (« fabrication en cours… » avec étapes), puis l'accélération si une cause nette ressort.
3. Parité obligatoire : le même code existe dans functions-plateforme/ (voir CLAUDE.md, décision du 26/10/2026).
Relecture Fable obligatoire (serveur). Captures de recette en format ordinateur et téléphone.
```

## Ce qui reste dans la session principale (décisions de Jérôme)
- Réponses Q1 à Q10 de `docs/proposition-dictionnaire-vocabulaire.md` (valeurs par défaut déjà en place).
- Prix d'achat visibles ou non par l'assistant (aujourd'hui seule `lister_devis` les cache).
- PR 388 « Montant de l'affaire » : libellés, règle HT/TTC/acceptés, lien avec le Kanban.
- Dates des travaux obligatoires à la finalisation (avis de Claude : non).
- Études n°11 (e-mail hors Google) et n°12 (affaire vers projet).
- Choix de la prochaine « nuit » de code (programme dans `.github/A-FAIRE.md`).

## Ordre conseillé
Session 1 d'abord (elle débloque tout ce que tu veux tester avec ChatGPT). La session 3 peut tourner en parallèle, c'est du code seul. La session 2 attend que tu aies du temps pour la console Google.
