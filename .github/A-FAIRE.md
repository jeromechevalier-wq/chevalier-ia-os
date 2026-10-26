# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 26/10/2026, soir. Règle de Jérôme : **« testé par Jérôme » ne s'écrit que sur sa confirmation, et quand le test est possible** (fusionné **et** en ligne). Aucun secret ici (dépôt public).

## À tester par Jérôme (fusionné, en ligne)

| # | Sujet | PR | Testé par Jérôme |
|---|---|---|---|
| 1 | Boutons de l'état Envoyé : libellés Devis signé / Devis refusé et infobulle sur Envoyer grisé | 310 | oui pour 1, 2, 4, 5 (26/10/2026) ; le point 3 (ordre Historique, Envoyer, Devis envoyé) est refait dans la PR « ordre des boutons » (en cours) |
| 4 | Réglages « Mon entreprise » | 263 | à faire |
| 5 | Une seule liste « Étape où vivent les devis » | 286 | oui (26/10/2026) |
| 7 | Copie du PDF dans le dossier Drive de l'affaire (+ correctifs) | 283, 290 | à faire (réglage CORS d'abord) |
| 8 | E-mails en copie (la suppression d'un brouillon ne retire plus son PDF : voir 16) | 291 | à faire |
| 9 | Envoi du devis par e-mail (brouillon Gmail, « Marquer comme envoyé », historique des envois) | 292 | à faire (réglages Google d'abord) |
| 10 | Menu des cartes, historique, « … » à côté d'Envoyer, plus de fiche du devis | 294 | à faire |
| 11 | Pastilles des réglages Devis (Général / Mon entreprise / Familles d'articles) | 295 | oui (26/10/2026) |
| 12 | Outils MCP Devis (nouvelle version, archiver, statut, supprimer, envoi) | 296 | à faire |
| 14 | « Préparer l'e-mail » (brouillon Gmail par n8n) | 299 | à faire après branchement (voir « À faire par Jérôme ») |
| 15 | Réglages > Déploiement (checklist avec contrôles) | 300 | à faire (page vue par Jérôme le 26/10 ; les cases ne sont pas encore testées : voir « Test de la page Déploiement » plus bas) |
| 16 | Supprimer un brouillon de devis ne retire plus le document de l'affaire ni le fichier ; le document « Devis brouillon – Objet – JJ-MM-AAAA HHhMM.pdf » porte la date et l'heure (Paris) du dernier téléchargement | 311 | à faire |
| 18 | Boutons du devis finalisé | 322 | à faire (fusionnée, en ligne : à vérifier à l'écran) |
| 19 | Un seul écran pour toute la vie du devis (Édition en lecture seule une fois finalisé) | 314 | à faire (fusionnée, en ligne) |
| 20 | E-mails en copie refaits (croix « Retirer » sans confirmation : à valider) | 313 | à faire (fusionnée, en ligne) |
| 17 | « NET À PAYER » sur fond de carte avec un trait jaune à gauche (le jaune plein reste aux boutons) | 319 | à faire |

Déjà validés par Jérôme : 280, 282, et le 26/10/2026 : 309 (retour visuel pendant la fabrication du PDF), 315 (Historique avec date, heure et minute), 316 (Options sans flèche), 278, 284, 287 (barre du haut, pastilles des affaires), 304 (retour au devis), 305 (recherche en vrais liens), 306 (un seul bouton jaune), 308 (flèche du PDF).

## Test de la page Déploiement (point 15, jamais testée)
1. Réglages > **Déploiement** : tu vois un résumé (« X sur Y vertes ») et le bouton « Revérifier ».
2. Chaque ligne est verte, rouge, orange ou grise ; une ligne rouge dit comment réparer, avec un lien qui s'ouvre.
3. Une ligne grise : coche « C'est fait », recharge la page : la case reste cochée avec sa date.
4. Chez le client démo (`https://chevalier-ia-app.web.app/espace/clientdemo`, Réglages > Déploiement) : la page s'ouvre aussi ; deux lignes du serveur peuvent rester orange si `deploiementVerifier` n'est pas publiée.
- Cas vide : un espace sans module Devis n'affiche que les étapes communes. Cas d'erreur : serveur injoignable = lignes orange « Impossible de vérifier », jamais un écran blanc.

## À faire par Jérôme (une fois)
- **Copie Drive (7)** : réglage CORS du stockage des PDF, une fois pour chacun des deux projets Google, mode d'emploi dans `docs/cors-stockage-pdf.md`.
- **E-mail (9)** : « Gmail API » activée et portée `gmail.compose` dans l'écran de consentement. Jérôme a dit être « en production » (pas d'expiration de 7 jours).
- **« Préparer l'e-mail » (14)**, workflow n8n `interne-devis-preparer-email` (créé, NON publié) : (1) dans n8n, créer un identifiant « Header Auth » (nom d'en-tête `X-Chevalier-Secret`, valeur = un mot de passe long) et le choisir dans le nœud « Demande reçue de la plateforme » (n8n y a mis par erreur un autre identifiant, le webhook refuse tout tant que ce n'est pas fait) ; (2) ajouter l'étiquette `interne` au workflow ; (3) créer dans Secret Manager du projet `chevalier-ia-os` les secrets `N8N_DEVIS_EMAIL_URL` (adresse de production du webhook) et `N8N_DEVIS_EMAIL_SECRET` (le même mot de passe) ; (4) donner « Accesseur de secrets » à `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com` sur ces deux secrets ; (5) publier le workflow. Détail : `docs/ajouter-un-bouton-workflow.md`.
- **Chez les clients** : le déploiement de `devisEnregistrerEnvoi`, `devisPreparerEmail`, `deploiementVerifier` et du MCP se fait avec le workflow manuel, avec Jérôme (la porte de la base 2 n'existe pas encore).
- **Règles Firestore** du journal des demandes (`crm_actions_lancements`) : PR séparée « à fusionner par Jérôme » (liste d'arrêt).

## À tester par Jérôme
- **Outil de diagnostic fichiers MCP** : à tester par Jérôme (ChatGPT et Claude, ordinateur et téléphone ; scénario dans `docs/plan-mcp.md`, section 11), puis à retirer (liste de ce qui se retire au même endroit).

## En cours (PR ouvertes, 26/10/2026, soir)
- **Fusionnées ce soir** : 322 (boutons du devis finalisé), 314 (écran unique du devis), 313 (e-mails en copie), 324 (PDF fabriqué chez les clients), 323 (règle CLAUDE.md : parité Jérôme / clients). Jérôme doit encore les vérifier à l'écran (322, 314, 313) ; ne mettre « testé par Jérôme » que sur sa confirmation.
- **320** : outil de données de démonstration (`docs/donnees-demo.md`) ; ouverte, relue par Fable, sans bloquant ; à fusionner après la démonstration de Jérôme.
- **302** : règles Firestore du journal « Préparer l'e-mail » (`crm_actions_lancements`), étiquette `a-fusionner-par-jerome` ; ouverte. Jérôme la fusionne, puis publie les règles dans les deux projets.
- **Client démo** : Jérôme a activé Devis et le MCP ; le remplissage se lance dans son Terminal (`docs/donnees-demo.md`).

## À faire, ordre de priorité (26/10/2026, soir)
- **PDF chez les clients (haute priorité)** : Jérôme crée le compte de service `devis-pdf`, lui donne ses 5 droits, active l'API « IAM Service Account Credentials », puis relance le workflow `fonctions` ; ensuite essai de bout en bout chez le client démo (`docs/pdf-clients.md`). Puis, en PR séparées : (a) ajouter à la page Réglages > Déploiement les lignes `pdf-stockage` et `pdf-fonctions` ; (b) protéger le champ `pdf` dans les règles Firestore (`devisBrouillonModifie`) : liste d'arrêt, Jérôme la fusionne.
- **Rôle « Administrateur Cloud Scheduler »** à donner au compte `deploiement-github` dans `chevalier-ia-app` : sans lui, `automatisationsCopieHoraire` échoue au déploiement (erreur 403 constatée le 26/10). Noté dans `docs/deploiement-plateforme.md`.
- **Fonctions orphelines** : le déploiement `fonctions` échoue si d'anciennes fonctions (`journalCopieHoraire`, `journalRafraichir`, `journalRenommer`) existent encore chez les clients sans exister dans le code ; les supprimer à la main dans la console (Jérôme l'a fait le 26/10). Noté dans `docs/deploiement-plateforme.md` (dépannage).
- **Écarts `functions/` vs `functions-plateforme/` à auditer avant chaque démonstration** : `automatisationsDecider` (« À valider »), la « porte » n8n chez les clients, `tableaudebordSaisir` (Maintenance), `veille`.
- **Outil de démo** : après l'arrivée des PDF, une option pour fabriquer d'un coup les PDF des 12 devis de la démo (sinon voyant rouge « PDF non rangé » sur les devis écrits directement en base).
- **Tests** : 2 tests de `tests/e2e/devis-pdf-ecran.spec.js` (« lien signé… », « PDF pas prêt… ») échouent dans le bac à sable des agents (`popup.url()` vide), y compris sur `main`. Non vus rouges sur GitHub parce que la suite de nuit sur `main` a été annulée 3 nuits de suite (job « Suite de nuit » arrêté après environ 44 min : runs 15, 16, 17) : à enquêter (délai du job, répartition).
- **Croix « Retirer » d'une adresse en copie** : retrait immédiat sans confirmation ; à valider par Jérôme (exception à la règle « Destructif »).
- **Accessibilité des onglets Édition / Prévisualisation** (`role=tabpanel`, `aria-controls`, flèches) : point connu, non fait.

## Reste à faire (code, rien d'urgent)

### Priorité haute (demande de Jérôme, 26/10/2026)
- **Haut de page du devis : un seul bouton jaune qui suit l'étape** (PR `devis-entete-bouton-jaune`, en brouillon, relecture Fable avant fusion) : Brouillon = « Finaliser » + « Envoyer » grisé ; Finalisé = « Envoyer » ; Envoyé = « Devis signé » + « Devis refusé » ; Signé, refusé, remplacé, archivé = aucun. « Imprimer » un brouillon donne le PDF brouillon (filigrane + pied « Brouillon v… · généré le … »), sans fenêtre « Finaliser ». Idée suivante, pas faite : « Préparer l'e-mail » comme bouton jaune quand la fonction fonctionnera pour de bon (le choix est dans `boutonJaune`, `js/modules/devis/entete-boutons.js`).

### Le reste
- Barre d'étapes du devis : Jérôme a dit « pas ce soir, ni urgent ni prioritaire » (24/10/2026).
- Page Déploiement, suite (Jérôme veut la vue « tous mes clients » et, chez le client, un libellé « Santé de mon espace » : à trancher) : suivi pas à pas « où j'en suis pour ce nouveau client » ; contrôle de nuit avec alerte ; vue « tous mes clients » chez Jérôme ; contrôle automatique du MCP et de « Préparer l'e-mail » une fois la fonction d'état fusionnée dans les contrôles.
- Onglet Documents d'une fiche : remplacer le bouton « Retirer » (à côté de « Ouvrir le dossier », pas joli) par une simple croix, même comportement : la fenêtre d'avertissement « vous allez retirer… » s'affiche avant. Nom accessible « Retirer le dossier », cible tactile d'au moins 44 px (demandé par Jérôme le 26/10/2026).
- Simplifier la copie Drive faite par le navigateur (étude).
- Doublon destinataire / copie quand le client change : pas encore contrôlé.
- Cible tactile des pastilles-liens inférieure à 44 px.
- Écran du PDF : « Retour au devis » ramenait à la liste après une finalisation. Corrigé dans la PR « retour à la page d'origine » (à tester par Jérôme une fois fusionnée et en ligne), test e2e n° 4.
- **Génération du PDF trop lente** : elle prend plusieurs secondes et on a l'impression que l'outil a planté. À étudier : mesurer où passe le temps, puis afficher une progression claire (message « fabrication en cours », indicateur) et/ou accélérer (demandé par Jérôme le 26/10/2026).
- « Préparer l'e-mail » dans le menu de la liste des devis (aujourd'hui seulement dans l'éditeur).
- Le test `devis-email.spec.js` n°1 sur téléphone mesure 43,68 px au lieu de 44 pendant l'animation de la fenêtre (même défaut de timing corrigé dans le nouveau spec) : à stabiliser.
- Mode d'emploi d'un 2e serveur de plateforme : écrit le 26/10, à éprouver au premier vrai 2e serveur (`docs/deploiement-nouveau-serveur-plateforme.md`).

## Décidé : rien à faire
- Anciens documents « Brouillon – … » : ils se renomment tout seuls au prochain PDF du même devis (décision de Jérôme, 25/10/2026).
- E-mail du devis : le client garde la responsabilité d'envoyer (l'appli n'envoie jamais) ; n8n prépare seulement le brouillon (décision du 25/10/2026).

## Fait (fusionné, en ligne, testé par Jérôme)
- PR 306 : testée par Jérôme (26/10/2026) ; PR 278 (pastille Devis), 284 (barre du haut), 304 (Retour au devis), 298 (visualisation du devis, « Passer à Envoyé », points 1 à 5 OK), 285 (e-mails en copie, points 1 à 5 OK), 287 (pastille cliquable, points 1 à 5 OK) : testées par Jérôme.
- PR 275, 277, 279, 280, 282 (voir l'historique Git). PR 115 : fermée (chemin d'un Mac dans CLAUDE.md).
