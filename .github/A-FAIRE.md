# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 26/10/2026, nuit « GO NUIT ». Règle de Jérôme : **« testé par Jérôme » ne s'écrit que sur sa confirmation, et quand le test est possible** (fusionné **et** en ligne). Aucun secret ici (dépôt public).

## À tester par Jérôme (fusionné, en ligne)

| # | Sujet | PR | Testé par Jérôme |
|---|---|---|---|
| 1 | Pastille « Devis : … » sur les affaires (points 3 à 5) | 278 | en cours (points 1 et 2 vus) |
| 2 | Barre d'outils des pages Devis | 284 | à faire |
| 3 | E-mails en copie du devis (cc) | 285 | à faire |
| 4 | Réglages « Mon entreprise » | 263 | à faire |
| 5 | Une seule liste « Étape où vivent les devis » | 286 | à faire |
| 6 | Pastille cliquable corrigée (chez un client aussi) ; devis archivé sans pastille | 287 | à faire |
| 7 | Copie du PDF dans le dossier Drive de l'affaire (+ correctifs) | 283, 290 | à faire (réglage CORS d'abord) |
| 8 | Suppression d'un brouillon retire son PDF brouillon ; e-mails en copie | 291 | à faire |
| 9 | Envoi du devis par e-mail (brouillon Gmail, « Marquer comme envoyé », historique des envois) | 292 | à faire (réglages Google d'abord) |
| 10 | Menu des cartes, historique, « … » à côté d'Envoyer, plus de fiche du devis | 294 | à faire |
| 11 | Pastilles des réglages Devis (Général / Mon entreprise / Familles d'articles) | 295 | à faire |
| 12 | Outils MCP Devis (nouvelle version, archiver, statut, supprimer, envoi) | 296 | à faire |
| 13 | Visualisation du devis : document seul, en-tête harmonisé, « Passer à Envoyé » | 298 | à faire |
| 14 | « Préparer l'e-mail » (brouillon Gmail par n8n) | 299 | à faire après branchement (voir « À faire par Jérôme ») |
| 15 | Réglages > Déploiement (checklist avec contrôles) | 300 | à faire |

Déjà validés par Jérôme : 280, 282.

## À faire par Jérôme (une fois)
- **Copie Drive (7)** : réglage CORS du stockage des PDF, une fois pour chacun des deux projets Google, mode d'emploi dans `docs/cors-stockage-pdf.md`.
- **E-mail (9)** : « Gmail API » activée et portée `gmail.compose` dans l'écran de consentement. Jérôme a dit être « en production » (pas d'expiration de 7 jours).
- **« Préparer l'e-mail » (14)**, workflow n8n `interne-devis-preparer-email` (créé, NON publié) : (1) dans n8n, créer un identifiant « Header Auth » (nom d'en-tête `X-Chevalier-Secret`, valeur = un mot de passe long) et le choisir dans le nœud « Demande reçue de la plateforme » (n8n y a mis par erreur un autre identifiant, le webhook refuse tout tant que ce n'est pas fait) ; (2) ajouter l'étiquette `interne` au workflow ; (3) créer dans Secret Manager du projet `chevalier-ia-os` les secrets `N8N_DEVIS_EMAIL_URL` (adresse de production du webhook) et `N8N_DEVIS_EMAIL_SECRET` (le même mot de passe) ; (4) donner « Accesseur de secrets » à `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com` sur ces deux secrets ; (5) publier le workflow. Détail : `docs/ajouter-un-bouton-workflow.md`.
- **Chez les clients** : le déploiement de `devisEnregistrerEnvoi`, `devisPreparerEmail`, `deploiementVerifier` et du MCP se fait avec le workflow manuel, avec Jérôme (la porte de la base 2 n'existe pas encore).
- **Règles Firestore** du journal des demandes (`crm_actions_lancements`) : PR séparée « à fusionner par Jérôme » (liste d'arrêt).

## Reste à faire (code, rien d'urgent)
- Barre d'étapes du devis : Jérôme a dit « pas ce soir, ni urgent ni prioritaire » (24/10/2026).
- Page Déploiement, suite : suivi pas à pas « où j'en suis pour ce nouveau client » ; contrôle de nuit avec alerte ; vue « tous mes clients » chez Jérôme ; contrôle automatique du MCP et de « Préparer l'e-mail » une fois la fonction d'état fusionnée dans les contrôles.
- Simplifier la copie Drive faite par le navigateur (étude).
- Doublon destinataire / copie quand le client change : pas encore contrôlé.
- Cible tactile des pastilles-liens inférieure à 44 px.
- Onglet Documents d'une fiche : remplacer le bouton « Retirer » (à côté de « Ouvrir le dossier », pas joli) par une simple croix, même comportement : la fenêtre d'avertissement « vous allez retirer… » s'affiche avant. Nom accessible « Retirer le dossier », cible tactile d'au moins 44 px (demandé par Jérôme le 26/10/2026).
- Droit Cloud Storage du serveur MCP pour effacer le PDF brouillon (non bloquant).
- « Préparer l'e-mail » dans le menu de la liste des devis (aujourd'hui seulement dans l'éditeur).
- Le test `devis-email.spec.js` n°1 sur téléphone mesure 43,68 px au lieu de 44 pendant l'animation de la fenêtre (même défaut de timing corrigé dans le nouveau spec) : à stabiliser.

## Décidé : rien à faire
- Anciens documents « Brouillon – … » : ils se renomment tout seuls au prochain PDF du même devis (décision de Jérôme, 25/10/2026).
- E-mail du devis : le client garde la responsabilité d'envoyer (l'appli n'envoie jamais) ; n8n prépare seulement le brouillon (décision du 25/10/2026).

## Fait (fusionné, en ligne, testé par Jérôme)
- PR 275, 277, 279, 280, 282 (voir l'historique Git). PR 115 : fermée (chemin d'un Mac dans CLAUDE.md).
