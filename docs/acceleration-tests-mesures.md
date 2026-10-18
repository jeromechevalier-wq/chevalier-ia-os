# Tests plus rapides : mesures avant / après (17/10/2026)

Branche `acceleration-tests`. Mac de Jérôme : 10 cœurs. **Le Mac n'a jamais été au repos pendant les mesures** : d'autres sessions lançaient leurs propres tests (charge de 4 à 17 sur 10 cœurs). Les chiffres sont donc des mesures « Mac chargé » ; au repos, ce sera plus court.

## Avant (3 mesures, `main`, ordre d'origine : tout en série, 1 navigateur)

Les ports 8080 / 9099 étaient pris par une autre session : mesuré sur d'autres ports (même code de test, seuls les ports changent).

| Mesure | Charge au départ | regles | logique | fonctions | e2e (navigateur) | storage + outil-client + automatisations | **Total** |
|---|---|---|---|---|---|---|---|
| 1 | 10,4 | 10 s | 1 s | 14 s | 684 s | 3 + 5 + 13 s | **736 s (12 min 16 s)** |
| 2 | 6,7 | 10 s | 1 s | 11 s | 586 s | 3 + 6 + 11 s | **632 s (10 min 32 s)** |
| 3 | 4,2 | 9 s | 0 s | 18 s | 600 s | 3 + 6 + 11 s | **653 s (10 min 53 s)** |

Le navigateur tournait en série : 427, 428 et 426 scénarios réussis (430 exécutions). Échecs « avant » : `L14` (mesures 1 et 3), `L17` (mesure 3) : **ces scénarios étaient déjà instables avant ce chantier**.

Durée par fichier de spec (moyenne des 3 mesures, en secondes ; ordinateur / téléphone) : projets 95 / 136, parcours 56 / 71, liens-documents 37 / 35, tableaudebord 23 / 40, identite-client 11 / 15, mcp 11 / 11, modules-client 6 / 8, automatisations 7 / 7 (+ racine 4 / 7), veille 5 / 5, identite-crm 4 / 6, fiches-coherentes 3 / 3, espace 2 / 2, controles 1 / 4, oauth 1 / 1.

Les 20 scénarios les plus lents : `C32` « Créer le projet » d'une affaire gagnée et « + Projet » avec un modèle (13 s, téléphone), `MCP4` (10 s, les deux formats), `C33` affaire gagnée sans projet (9 s), `L15` (9 s), `I3` (5 s), `L2` (4 à 5 s), `C36` (3 à 4 s), `C29` filtres enregistrés (4 s), `C23` défilement horizontal (4 s). Aucun scénario ne dépasse 13 s : le temps vient du **nombre** de scénarios, pas d'un scénario géant (donc le parallélisme est le bon levier).

## Après

Nouveau fonctionnement : cinq séries d'émulateurs en même temps (navigateur, noyau, storage, outil-client, automatisations), 3 workers pour le navigateur, un projet Firebase par worker.

| Mesure (`npm test` complet) | Charge au départ | Total |
|---|---|---|
| Seul, n° 1 | 6,9 | **268 s (4 min 28 s)** |
| Seul, n° 2 | 4,2 | **248 s (4 min 08 s)** |
| Seul, n° 3 | 8,1 | **276 s (4 min 36 s)** |
| Deux suites en même temps, n° 1 (les deux) | 9,8 | 380 s et 394 s |
| Deux suites en même temps, n° 2 | 12,1 | 361 s et 405 s |
| Deux suites en même temps, n° 3 | 11,6 | 367 s et 388 s (**pire : 405 s = 6 min 45 s**) |

Par étape (seul, n° 2) : navigateur 4 min 08 s (dont démarrage des émulateurs 7 s), noyau (règles 21 s, logique 1 s, statique 1 s, fonctions 19 s, porte 1 s) 50 s, storage 3 s, outil-client 10 s, automatisations 19 s. **Chemin critique : le navigateur.** Cumul de tous les scénarios ≈ 560 s ; divisé par 3 workers ≈ 190 s, plus le démarrage et la charge du Mac.

Autres mesures avec l'appli corrigée (PR 2) : 216 s (vert) et 243 s (3 échecs d'instabilité), charge 6 à 7.

### Nombre de workers (navigateur seul, charge 3 à 7)

| Workers | 2 | 3 | 4 | 6 | 8 |
|---|---|---|---|---|---|
| Durée | 266 s | 193 s | 186 s | 203 s | 188 s |

3 workers vont aussi vite que 4 ou 8 : **défaut retenu : moitié des cœurs, 3 au plus** (moins de navigateurs qui se gênent). Réglable : `TESTS_WORKERS`.

## Couverture (A3)

`npx playwright test --list` avant : 430 exécutions ; après : 409. Différence des noms (avant / après, numéros de ligne ignorés) : **0 exécution retirée en format ordinateur** ; 23 exécutions retirées en format téléphone (liste ci-dessous, étiquette `@sans-telephone` : donnée lue en base, droit, logique ou texte sans mise en page) ; 2 exécutions ajoutées (le test d'isolation entre workers, format ordinateur seulement). Aucun scénario supprimé ni raccourci.

| Fichier | Scénario (retiré en format téléphone seulement) |
|---|---|
| automatisations-racine.spec.js | Automatisations chez Jérôme administrateur : si la fonction n'est pas encore en service, ses propres work |
| automatisations-racine.spec.js | Automatisations chez l'assistant : si des workflows sont présents à la racine, ils s'affichent (lecture s |
| automatisations.spec.js | J11 le navigateur ne peut écrire dans aucune collection des automatisations (règles) |
| automatisations.spec.js | J3 isolation : le journal d'un autre client n'apparaît jamais ; un autre client voit le sien seul |
| automatisations.spec.js | J5 mise à jour en direct : une exécution écrite par le serveur apparaît sans recharger, et « en cours » d |
| automatisations.spec.js | J7 aucune demande envoyée au serveur ne porte un identifiant de client (le serveur le déduit de l'identit |
| controles.spec.js | D1 aucun service worker enregistré, manifeste valide et icônes servies |
| espace.spec.js | E1 client inconnu, fiche inactive ou adresse mal formée : même page neutre, aucun bouton de connexion |
| espace.spec.js | E4 refus IDENTIQUE pour un compte inconnu et pour un membre d'un autre client, sans rien révéler |
| espace.spec.js | E5 le CRM de Jérôme à la racine n'est pas touché : sans lien /espace/, l'écran de connexion habituel s'af |
| identite-client.spec.js | I8 réglages de départ écrits chez un client : sans le compte GitHub ni le dossier de Jérôme |
| identite-client.spec.js | I9 la page de connexion du client (avant la connexion) n'a aucune identité de Jérôme, même avant la lectu |
| modules-client.spec.js | R5 « projets » sans « affaires » est refusé : aucun écran, accueil provisoire, rien ne casse |
| modules-client.spec.js | R7 un lecteur lit les modules de son client ; un membre d'un autre client est refusé comme avant |
| oauth.spec.js | demande piégée (adresse de retour inconnue) : page d’erreur, aucun bouton de connexion |
| parcours.spec.js | C15 les objectifs calculés suivent les nouveaux contacts et les propositions |
| parcours.spec.js | C2 un compte non autorisé : accès refusé, retour à la connexion, aucune donnée affichée |
| projets.spec.js | C32 premier lancement : les modèles Audit, Accompagnement et Extraction sont créés une seule fois, avec l |
| projets.spec.js | C37 Réglages : les restes de la 2.2 ont disparu (migration, délai de paiement, encaissements de la fiche  |
| tableaudebord.spec.js | R2 un « vert » au relevé périmé s'affiche gris « Relevé trop ancien » ; un « rouge » reste rouge même pér |
| tableaudebord.spec.js | R3 une échéance dans 12 jours affiche « À surveiller » même si le script a écrit « vert » ; une échéance  |
| tableaudebord.spec.js | R9 le « relevé il y a … » et le gris se recalculent chaque minute, sans recharger |
| tableaudebord.spec.js | R9 mise à jour en direct : un indicateur modifié dans la base change à l'écran sans recharger |

Objectif « 30 à 50 % » du brief **non atteint exprès** (5 % des exécutions) : dans le doute, on garde les deux formats (menus, grilles, défilement et « i » sont différents en petit écran).

## Instabilités (voir aussi `docs/reprise-prochaine-session.md`)

- `L10`, `L14` (et par moments `L2`, `L7`, `L16` à `L20`) de `liens-documents.spec.js` : **déjà instables avant ce chantier**. Cause trouvée et confirmée par des essais répétés : l'écran se redessine quand Firestore renvoie la fiche, parfois avant la fin de l'action en cours (`ecrireDossier` dans `js/modules/crm/lanceurs.js`, `choisirDansGoogle` dans `js/modules/crm/liens-documents.js`) ; l'action écrit alors sur un morceau d'écran déjà remplacé. C'est un défaut de l'appli (un vrai utilisateur peut voir un formulaire resté ouvert) : **correctif dans la PR 2**, pas dans celle-ci (cette PR ne touche pas l'appli, hors `js/os/firebase.js`). Avec ce correctif, `L14` passe 6 fois sur 6 (avant : 9 échecs sur 9 sous charge).
- `R6` (tableau de bord) : lisait la liste avant son affichage ; corrigé (il attend maintenant les 14 lignes).
- **Reste non corrigé** : des erreurs « 409 Conflict » (et rarement « 400 » sur le canal d'écoute) dans la console du navigateur, qui font échouer au hasard le contrôle « aucune erreur dans la console » : vus `C13`, `C14`, `C20`, `C22`, `C29`, `C31`, `C33`, `C36`, `D1`, `F5`, `K5`, `R8`, `Favoris`, `veille`, `automatisations-racine` n° 1. Cause supposée : l'écriture directe du test dans l'émulateur tombe pendant une transaction de l'appli sur le même document ; la transaction est refusée puis rejouée, le navigateur le note dans sa console. Apparaît surtout quand le Mac est très chargé (deux suites plus les autres sessions) ; avec 4 workers sous double charge, 29 et 38 échecs sur 1 200 exécutions (`--repeat-each=3`). À faire : attendre la fin des écritures de l'appli avant chaque écriture du test, scénario par scénario.
