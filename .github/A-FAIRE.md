# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 27/10/2026, nuit (GO NUIT : 334, 337, 338, 339 fusionnées). Règle de Jérôme : **« testé par Jérôme » ne s'écrit que sur sa confirmation, et quand le test est possible** (fusionné **et** en ligne). Aucun secret ici (dépôt public).

## À tester par Jérôme (fusionné, en ligne)

| # | Sujet | PR | Testé par Jérôme |
|---|---|---|---|
| 1 | Boutons de l'état Envoyé : libellés Devis signé / Devis refusé et infobulle sur Envoyer grisé | 310 | oui pour 1, 2, 4, 5 (26/10/2026) ; le point 3 (ordre Historique, Envoyer, Devis envoyé) est refait dans la PR « ordre des boutons » (en cours) |
| 4 | Réglages « Mon entreprise » | 263 | oui (27/10/2026) |
| 5 | Une seule liste « Étape où vivent les devis » | 286 | oui (26/10/2026) |
| 7 | Copie du PDF dans le dossier Drive de l'affaire (+ correctifs) | 283, 290, 331 | à faire (réglage CORS fait le 27/10/2026 ; la PR 331, fusionnée et en ligne chez Jérôme, ajoute le bouton « Créer le dossier … et y copier le PDF » : voir « PDF et dossier de travail ») |
| 8 | E-mails en copie (la suppression d'un brouillon ne retire plus son PDF : voir 16) | 291 | à faire |
| 9 | Envoi du devis par e-mail (brouillon Gmail, « Marquer comme envoyé », historique des envois) | 292 | remplacé le 27/10/2026 par « Préparer l'e-mail » (n8n, ligne 14, PR 334) ; « Marquer comme envoyé » et l'historique restent |
| 10 | Menu des cartes, historique, « … » à côté d'Envoyer, plus de fiche du devis | 294 | à faire |
| 11 | Pastilles des réglages Devis (Général / Mon entreprise / Familles d'articles) | 295 | oui (26/10/2026) |
| 12 | Outils MCP Devis (nouvelle version, archiver, statut, supprimer, envoi) | 296 | à faire |
| 14 | « Préparer l'e-mail » (brouillon Gmail par n8n) | 299, 334 | à faire (workflow n8n publié la nuit du 27/10/2026 ; chez Jérôme seulement, absent chez les clients ; voir « À faire par Jérôme » pour la boîte Gmail) |
| 15 | Réglages > Déploiement (checklist avec contrôles) | 300 | à faire (page vue par Jérôme le 26/10 ; les cases ne sont pas encore testées : voir « Test de la page Déploiement » plus bas) |
| 16 | Supprimer un brouillon de devis ne retire plus le document de l'affaire ni le fichier ; le document « Devis brouillon – Objet – JJ-MM-AAAA HHhMM.pdf » porte la date et l'heure (Paris) du dernier téléchargement | 311 | à faire |
| 18 | Boutons du devis finalisé | 322 | à faire (fusionnée, en ligne : à vérifier à l'écran) |
| 19 | Un seul écran pour toute la vie du devis (Édition en lecture seule une fois finalisé) | 314 | à faire (fusionnée, en ligne) |
| 20 | E-mails en copie refaits (croix « Retirer » sans confirmation : à valider) | 313 | à faire (fusionnée, en ligne) |
| 21 | PDF des devis chez les clients (fonctions `fonctions` déployées, PR 324) | 324 | En service : Jérôme a généré des PDF chez le client démo (« le pdf se génère bien », 26/10/2026). Reste à confirmer par lui : l'ouverture du lien du PDF par un lecteur du même espace, et l'accès refusé à un devis d'un autre client |
| 17 | « NET À PAYER » sur fond de carte avec un trait jaune à gauche (le jaune plein reste aux boutons) | 319 | oui (27/10/2026) |
| 22 | Liens chez les clients : clic droit, Ctrl+clic et clic molette ouvrent le bon lien (plus « Espace indisponible ») | 335 | oui (27/10/2026, chez le client démo, hosting déployé) |
| 23 | Créer le dossier de travail en un clic et y copier les PDF (écran du PDF et fiche de l'affaire) | 331 | à faire (fusionnée, en ligne chez Jérôme ; chez les clients : hosting déployé le 27/10/2026) |

Déjà validés par Jérôme : 280, 282, et le 26/10/2026 : 309 (retour visuel pendant la fabrication du PDF), 315 (Historique avec date, heure et minute), 316 (Options sans flèche), 278, 284, 287 (barre du haut, pastilles des affaires), 304 (retour au devis), 305 (recherche en vrais liens), 306 (un seul bouton jaune), 308 (flèche du PDF).

## Test de la page Déploiement (point 15, jamais testée)
1. Réglages > **Déploiement** : tu vois un résumé (« X sur Y vertes ») et le bouton « Revérifier ».
2. Chaque ligne est verte, rouge, orange ou grise ; une ligne rouge dit comment réparer, avec un lien qui s'ouvre.
3. Une ligne grise : coche « C'est fait », recharge la page : la case reste cochée avec sa date.
4. Chez le client démo (`https://chevalier-ia-app.web.app/espace/clientdemo`, Réglages > Déploiement) : la page s'ouvre aussi ; deux lignes du serveur peuvent rester orange si `deploiementVerifier` n'est pas publiée.
- Cas vide : un espace sans module Devis n'affiche que les étapes communes. Cas d'erreur : serveur injoignable = lignes orange « Impossible de vérifier », jamais un écran blanc.

## À faire par Jérôme (une fois)
- **Règles Firestore : décision du 27/10/2026, Claude les publie lui-même** (chevalier-ia-os par le workflow « Publier les règles (CRM de Jérôme) », chevalier-ia-app par le workflow « Déploiement plateforme clients » > regles). Fait le 27/10/2026 : rôle « Administrateur des règles Firebase » donné au compte `github-action-…`, règles de la PR 302 publiées dans les deux projets (runs verts). Jérôme n'a plus rien à faire ici, sauf lancer lui-même le bouton quand Claude le demande (le déploiement des clients reste manuel).
- **Copie Drive (7)** : réglage CORS fait le 27/10/2026 pour les deux projets (`docs/cors-stockage-pdf.md`) ; reste à tester la copie du PDF dans Drive (7, 23).
- **« Préparer l'e-mail » (14)**, workflow n8n `interne-devis-preparer-email` : **publié la nuit du 27/10/2026** (après relecture Fable et deux corrections : message d'échec nettoyé, identifiant du brouillon seulement s'il existe). Identifiant « Header Auth » et secrets `N8N_DEVIS_EMAIL_URL` / `N8N_DEVIS_EMAIL_SECRET` faits le 27/10/2026. **Question pour Jérôme** : le brouillon part dans la boîte liée à l'identifiant n8n « Google OAuth - Charles » ; confirme que c'est bien la boîte voulue. Si le bouton reste grisé « pas branché » : vérifier le droit de lecture des deux secrets pour `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com`. Détail : `docs/ajouter-un-bouton-workflow.md`.
- **Chez les clients** : le déploiement de `devisEnregistrerEnvoi`, `devisPreparerEmail`, `deploiementVerifier` et du MCP se fait avec le workflow manuel, avec Jérôme (la porte de la base 2 n'existe pas encore : « Préparer l'e-mail » est absent chez les clients).

## À tester par Jérôme
- **Menu « Ajustement », version B** (PR 337, fusionnée) : « Définir un ajustement » montre d'un coup Ajustement global, Marge du devis, Remise client.
- **E-mail uniquement par n8n** (PR 334, fusionnée) : plus de brouillon Gmail depuis le navigateur ; « Préparer l'e-mail » est la seule entrée e-mail (menus Envoyer, « … » et cartes de la liste), grisée avec sa phrase tant que ce n'est pas branché ; « Devis envoyé » note aussi les destinataires dans l'historique.
- **Gestion des déchets** (PR 338, fusionnée) : formulaire Définir / Modifier dans l'éditeur, sans effet sur le prix.
- **Conditions de paiement** (PR 339, fusionnée) : plusieurs acomptes dans l'éditeur (valeur, % / € HT / € TTC, moment ; crayon et croix), « Reste à facturer » dans le bloc, refus si le total dépasse le TTC ; menu « Ajouter une condition » (Acompte ; Retenue de garantie grisée « bientôt »). Les anciens devis à acompte unique marchent sans migration ; les primes déjà enregistrées restent déduites du NET À PAYER. Même code chez les clients (copies générées, rien à brancher).
- **Outil de diagnostic fichiers MCP** : à tester par Jérôme (ChatGPT et Claude, ordinateur et téléphone ; scénario dans `docs/plan-mcp.md`, section 11), puis à retirer (liste de ce qui se retire au même endroit).

- **Déconnexion forcée chez le client démo (26/10)** : corrigée (PR 327, déployée chez les clients le 27/10/2026), à confirmer par Jérôme dans son Chrome normal. **Le test attend** : il ne peut pas ouvrir deux onglets en même temps tant que le bug de liens n'est pas en ligne ; maintenant que la PR 335 l'est, il peut le faire. Causes possibles : (1) une erreur réseau sur la lecture de la fiche d'appartenance (try/catch qui déconnectait), (2) un 2e onglet ouvert sur `app.html` de la plateforme sans route `#/espace/<client>` (le démarrage « Jérôme » déconnectait tout le monde, les onglets partagent la connexion), (3) piste non vérifiée : une extension Chrome (bloqueur de pub, vie privée) qui coupe par intermittence le canal Firestore.

## En cours (27/10/2026, soir)
- **Fusionnées le 27/10** : 302 (règles du journal des demandes, publiées), 327 (connexion), 329, 330, 331 (dossier de travail et copie des PDF), 332 (guide CORS), 333 (workflow « Publier les règles »), 335 (liens sous le préfixe du client).
- **Fusionnées la nuit du 27/10 (GO NUIT)** : 334 (e-mail par n8n seulement), 337 (menu Ajustement B), 338 (déchets), 339 (conditions de paiement à plusieurs acomptes) ; workflow n8n `interne-devis-preparer-email` relu par Fable puis **publié**. Les 4 PR sont en ligne chez Jérôme ; chez les clients il faut un déploiement « hosting » (avec Jérôme) pour qu'ils les aient.
- **Client démo** : Jérôme a activé Devis et le MCP ; le remplissage se lance dans son Terminal (`docs/donnees-demo.md`).

## À faire, ordre de priorité (26/10/2026, nuit)
- **PDF chez les clients : en service** (déploiement `fonctions` vert, PDF générés chez le client démo, confirmé par Jérôme). Reste : (1) Jérôme confirme l'ouverture du lien par un lecteur du même espace et l'accès refusé à un devis d'un autre client (PR 324) ; (2) **mettre les docs d'accord** : `docs/deploiement-plateforme.md` dit encore « Fonctions : non, jamais » et « le workflow n'a jamais été lancé » ; `docs/pdf-clients.md` ne parle pas des 3 droits de projet ni de l'attente de 5 minutes d'Eventarc (le doc du 2e serveur les a). Puis, en PR séparées : (a) ajouter à la page Réglages > Déploiement les lignes `pdf-stockage` et `pdf-fonctions` ; (b) protéger le champ `pdf` dans les règles Firestore (`devisBrouillonModifie`) : liste d'arrêt, Jérôme la fusionne.
- **Rôle « Administrateur Cloud Scheduler »** à donner au compte `deploiement-github` dans `chevalier-ia-app` : sans lui, `automatisationsCopieHoraire` échoue au déploiement (erreur 403 constatée le 26/10). Noté dans `docs/deploiement-plateforme.md`.
- **Fonctions orphelines** : le déploiement `fonctions` échoue si d'anciennes fonctions (`journalCopieHoraire`, `journalRafraichir`, `journalRenommer`) existent encore chez les clients sans exister dans le code ; les supprimer à la main dans la console (Jérôme l'a fait le 26/10). Noté dans `docs/deploiement-plateforme.md` (dépannage).
- **Écarts `functions/` vs `functions-plateforme/` à auditer avant chaque démonstration** : `automatisationsDecider` (« À valider »), la « porte » n8n chez les clients, `tableaudebordSaisir` (Maintenance), `veille`.
- **Outil de démo, option `--pdf`** : faite (PR « Outil de démo : fabriquer les PDF des devis fictifs »), fabrique les PDF des devis de démo par le vrai déclencheur. **À tester par Jérôme** sur le client démo : `node scripts/donnees-demo.js clientdemo --pdf` puis `--pdf --ecrire` (mode d'emploi en bas de `docs/donnees-demo.md`). Jamais lancée sur le vrai projet par Claude.
- **PDF et documents de l'affaire : tranché en D par Jérôme (26/10/2026)** : un PDF fabriqué n'est ajouté aux Documents de l'affaire (ni « Document joint : … » dans l'historique) que si l'affaire a un dossier de travail Drive. Partie serveur faite (PR `pdf-document-si-dossier`). Reste la PR 2, navigateur : bouton « Créer le dossier "<nom de l'affaire>" et y copier le PDF », un clic. Les liens déjà ajoutés ne sont pas retirés.
- **Déconnexion forcée chez le client démo** (Chrome normal de Jérôme, navigation privée OK) : constatée au moins 3 fois le 26/10. Cause probable (hypothèse, non prouvée) : `compteDuClient` dans `js/os/auth.js` déconnecte (`signOut`) sur n'importe quelle erreur de lecture de la fiche membre ; correctif en cours (PR « Connexion : une erreur réseau ne déconnecte plus »). Au prochain incident, Jérôme regarde F12 > Application > IndexedDB > firebaseLocalStorageDb > firebaseLocalStorage : ligne `firebase:authUser` présente (donc c'est l'appli) ou tableau vide (quelque chose efface les données : extension, réglage Chrome « effacer à la fermeture »). Contournement : icône à gauche de l'adresse > Paramètres du site > Effacer les données, ou navigation privée.
- **Icône du manifeste d'un client** (priorité basse) : avertissement console « Error while trying to use the following icon from the Manifest … (Resource size is not correct) » : l'icône pointe vers le logo du stockage avec `sizes: 'any'` dans `manifesteClient` (`js/os/marque.js`) ; à corriger (icône à taille déclarée, ou icône générée). Le message « Cross-Origin-Opener-Policy policy would block the window.closed call » (fenêtre de connexion Google) est normal.
- **Mettre à jour les docs périmées** : voir le point « PDF chez les clients » ci-dessus.
- **Tests** : 2 tests de `tests/e2e/devis-pdf-ecran.spec.js` (« lien signé… », « PDF pas prêt… ») échouent dans le bac à sable des agents (`popup.url()` vide), y compris sur `main`. Non vus rouges sur GitHub parce que la suite de nuit (workflow « Tests de nuit ») sur `main` a été annulée : 4 runs annulés (environ 44 à 49 min), y compris celui lancé à la main le 26/10, donc aucune information sur le rouge réel. À enquêter : durée maximale du job « Suite de nuit », répartition en parties.
- **Croix « Retirer » d'une adresse en copie** : retrait immédiat sans confirmation ; toujours à valider par Jérôme : sans confirmation, ou avec confirmation et Annuler (exception à la règle « Destructif »).
- **Accessibilité des onglets Édition / Prévisualisation** (`role=tabpanel`, `aria-controls`, flèches) : point connu, non fait.

## Reste à faire (code, rien d'urgent)

### Priorité haute (demande de Jérôme, 26/10/2026)
- **Haut de page du devis : un seul bouton jaune qui suit l'étape** (PR `devis-entete-bouton-jaune`, en brouillon, relecture Fable avant fusion) : Brouillon = « Finaliser » + « Envoyer » grisé ; Finalisé = « Envoyer » ; Envoyé = « Devis signé » + « Devis refusé » ; Signé, refusé, remplacé, archivé = aucun. « Imprimer » un brouillon donne le PDF brouillon (filigrane + pied « Brouillon v… · généré le … »), sans fenêtre « Finaliser ». Idée suivante, pas faite : « Préparer l'e-mail » comme bouton jaune quand la fonction fonctionnera pour de bon (le choix est dans `boutonJaune`, `js/modules/devis/entete-boutons.js`).

### PDF et dossier de travail (27/10/2026)
- **PR 331 fusionnée le 27/10/2026, à tester par Jérôme** (`pdf-creer-dossier-et-copier`) : écran du PDF sans dossier = bouton « Créer le dossier … et y copier le PDF » ; création ou liaison du dossier = copie des PDF des devis finalisés + liens dans les Documents.
- **Reste à faire** : alerte douce à la finalisation du devis quand l'affaire n'a pas de dossier (retirée de la PR 2 : l'éditeur est trop sensible et le PDF est « en cours » à ce moment ; l'écran du PDF porte déjà le bouton).

### Le reste
- **Compte prorata** et **Poste libre HT** : non construits (retirés de l'affichage du menu « Ajustement »). Le calcul demande une décision de Jérôme sur sa place dans le total.
- **Renvoi d'un devis déjà envoyé** depuis l'écran : pas encore noté ni conçu.
- **Docs** : à mettre d'accord avec « Claude publie les règles » (étape 16 de `docs/deploiement-nouveau-serveur-plateforme.md` vers `docs/cors-stockage-pdf.md`, mentions « publiées à la main » encore présentes).
- Barre d'étapes du devis : Jérôme a dit « pas ce soir, ni urgent ni prioritaire » (24/10/2026).
- Page Déploiement, suite (Jérôme veut la vue « tous mes clients » et, chez le client, un libellé « Santé de mon espace » : à trancher) : suivi pas à pas « où j'en suis pour ce nouveau client » ; contrôle de nuit avec alerte ; vue « tous mes clients » chez Jérôme ; contrôle automatique du MCP et de « Préparer l'e-mail » une fois la fonction d'état fusionnée dans les contrôles.
- Onglet Documents d'une fiche : remplacer le bouton « Retirer » (à côté de « Ouvrir le dossier », pas joli) par une simple croix, même comportement : la fenêtre d'avertissement « vous allez retirer… » s'affiche avant. Nom accessible « Retirer le dossier », cible tactile d'au moins 44 px (demandé par Jérôme le 26/10/2026).
- Simplifier la copie Drive faite par le navigateur (étude).
- Doublon destinataire / copie quand le client change : pas encore contrôlé.
- Cible tactile des pastilles-liens inférieure à 44 px.
- Écran du PDF : « Retour au devis » ramenait à la liste après une finalisation. Corrigé dans la PR « retour à la page d'origine » (à tester par Jérôme une fois fusionnée et en ligne), test e2e n° 4.
- **Génération du PDF trop lente** : elle prend plusieurs secondes et on a l'impression que l'outil a planté. À étudier : mesurer où passe le temps, puis afficher une progression claire (message « fabrication en cours », indicateur) et/ou accélérer (demandé par Jérôme le 26/10/2026).
- Le test `devis-email.spec.js` n°1 sur téléphone mesure 43,68 px au lieu de 44 pendant l'animation de la fenêtre (même défaut de timing corrigé dans le nouveau spec) : à stabiliser.
- Mode d'emploi d'un 2e serveur de plateforme : écrit le 26/10, à éprouver au premier vrai 2e serveur (`docs/deploiement-nouveau-serveur-plateforme.md`). Le projet `chevalier-ia-app` est écrit en dur dans le code : un 2e serveur demandera d'abord une PR de code, relue par Fable (ajouter une ligne dédiée).

## Décidé : rien à faire
- Anciens documents « Brouillon – … » : ils se renomment tout seuls au prochain PDF du même devis (décision de Jérôme, 25/10/2026).
- E-mail du devis : le client garde la responsabilité d'envoyer (l'appli n'envoie jamais) ; n8n prépare seulement le brouillon (décision du 25/10/2026).

## Fait (fusionné, en ligne, testé par Jérôme)
- PR 306 : testée par Jérôme (26/10/2026) ; PR 278 (pastille Devis), 284 (barre du haut), 304 (Retour au devis), 298 (visualisation du devis, « Passer à Envoyé », points 1 à 5 OK), 285 (e-mails en copie, points 1 à 5 OK), 287 (pastille cliquable, points 1 à 5 OK) : testées par Jérôme.
- PR 275, 277, 279, 280, 282 (voir l'historique Git). PR 115 : fermée (chemin d'un Mac dans CLAUDE.md).
