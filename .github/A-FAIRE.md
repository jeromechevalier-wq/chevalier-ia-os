# À faire : module Devis et outils (liste maintenue à jour)

Mise à jour : 25/10/2026, 16h45. Règle de Jérôme : **« testé par Jérôme » ne s'écrit que sur sa confirmation, et quand le test est possible** (fusionné **et** en ligne). Aucun secret ici (dépôt public).

## À tester par Jérôme (fusionné, en ligne)

| # | Sujet | PR | Testé par Jérôme |
|---|---|---|---|
| 1 | Pastille « Devis : … » sur les affaires (points 3 à 5) | 278 | en cours (points 1 et 2 vus) |
| 2 | Pastille cliquable ; fichier « À faire » | 280 | à faire |
| 3 | Carte du Tableau des devis simplifiée (HT, pastille d'état) | 282 | à faire |
| 4 | Barre d'outils des pages Devis | 284 | à faire |
| 5 | E-mails en copie du devis (cc) | 285 | à faire |
| 6 | Réglages « Mon entreprise » | 263 | à faire |
| 7 | Une seule liste « Étape où vivent les devis » | 286 | à faire |
| 8 | Pastille cliquable corrigée (chez un client aussi) ; devis archivé sans pastille | 287 | à faire |
| 9 | Copie du PDF dans le dossier Drive de l'affaire (+ correctifs) | 283, 290 | à faire (réglage CORS d'abord, voir ci-dessous) |
| 10 | Suppression d'un brouillon retire son PDF brouillon ; corrections des e-mails en copie | 291 | à faire |
| 11 | **Envoi du devis par e-mail** (brouillon Gmail avec le PDF, « Marquer comme envoyé », historique des envois) | 292 | à faire (réglages Google d'abord, voir ci-dessous) |

## Fait, rien à tester à l'écran
- Tests plus rapides : navigateur en cache, plateforme sans palier complet (PR 281).
- Palier complet découpé en 6 parties parallèles, coche « Tests » finale : environ 5 minutes au lieu de 25-30 (PR 289).

## À faire par Jérôme (une fois)
- **Copie Drive (9)** : autoriser le site dans le stockage du PDF (réglage CORS), mode d'emploi dans `docs/cors-stockage-pdf.md`.
- **E-mail (11)** : console Google, projet de l'appli : « API et services » > « Bibliothèque » > activer « Gmail API » ; puis « Écran de consentement OAuth » > « Accès aux données » > ajouter la portée `https://www.googleapis.com/auth/gmail.compose`. En mode Test la connexion Gmail expire après 7 jours ; pour les clients, Google devra vérifier l'application (portée restreinte).
- **Déploiement chez les clients** : la fonction `devisEnregistrerEnvoi` est dans le code de la plateforme clients ; elle n'y sera mise en ligne que par le workflow manuel, avec Jérôme.

## Reste à faire (code)
- Mettre à jour `docs/` (consignes d'interface, réglage CORS, envoi par e-mail) et régénérer `wiki/`, dans la dernière PR de la nuit.
- 263 « Mon entreprise » et 278 points 3 à 5 : à tester.
- Doublon destinataire / copie quand le client change (e-mail repris de la fiche) : pas encore contrôlé.
- Cible tactile des pastilles-liens inférieure à 44 px (déjà dans « Reste à aligner »).

## Décidé : rien à faire
- Anciens documents « Brouillon – … » : ils se renomment tout seuls au prochain PDF du même devis (décision de Jérôme, 25/10/2026).

## Fait (fusionné, en ligne, testé par Jérôme)
- PR 275 : un clic sur un devis ouvre l'éditeur ; « Voir la fiche » dans le menu « … ».
- PR 277 : « + Devis » dans le gros « + » et recherche globale.
- PR 279 : un seul PDF (serveur), noms « Devis … », suppression d'un brouillon, infobulles.
- PR 115 : fermée (chemin d'un Mac dans CLAUDE.md).
