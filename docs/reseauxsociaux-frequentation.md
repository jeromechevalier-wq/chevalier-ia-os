# Réseaux sociaux : l'écran « Fréquentation du site » (écrit le 14/11/2026)

Écrit pour Jérôme. Version 2.46.0. Tu vois les visites de chevalier-ia.fr dans Chevalier IA OS, dans le module Réseaux sociaux, onglet **Site web**. Aucun secret ici.

## 1. Ce que c'est

Le tableau de bord de Plausible (l'outil qui compte les visites, sans cookies) est affiché dans un cadre de l'écran. Les chiffres sont ceux de Plausible, lus en direct : Chevalier IA OS ne les copie pas et ne les recalcule pas. Les trois clics de contact du site (« Contact formulaire », « Contact téléphone », « Contact WhatsApp ») apparaissent dans le bloc des objectifs, en bas du tableau.

**Pourquoi un cadre et pas des chiffres recopiés** : l'API de statistiques de Plausible demande l'offre Business, et la clé créée a été refusée. Le lien de partage du tableau de bord (que tu as accepté de rendre public) est la voie la plus simple : rien à payer, rien à synchroniser.

## 2. Où est le lien

Le lien de partage n'est **pas dans le code** (le dépôt est public). Tu le colles dans l'écran la première fois (Plausible : Paramètres du site > Liens partagés) ; il est gardé dans tes réglages (`crm_parametres/frequentation_site`, champ `lien`, écrit par le journal commun). Seuls les liens `plausible.io/share/…` sont acceptés. Pas de nouvelle table, donc pas de changement des règles Firestore.

## 3. Les états de l'écran

- **Chargement** : un rond de chargement pendant la lecture du lien.
- **Aucun lien** : une phrase (« Aucun tableau de bord relié… ») et un champ pour coller le lien. Le bouton « Enregistrer le lien » est grisé tant que le champ est vide ; un lien qui n'est pas de Plausible est refusé avec une phrase qui dit quoi faire.
- **Lien enregistré** : le tableau de bord dans le cadre, « Ouvrir dans Plausible » (bouton jaune, nouvel onglet), « Changer le lien » et « Retirer le lien » (confirmation d'abord ; le tableau n'est plus affiché, les statistiques restent dans Plausible).
- **Cadre qui ne répond pas** : au bout de 10 secondes, un message propose d'ouvrir le tableau dans un nouvel onglet.
- **Erreur de lecture du lien** : « Connexion impossible pour le moment » et « Réessayer ». Aucune déconnexion.

## 4. Pour les développeurs

Fichiers : `js/modules/reseauxsociaux/frequentation-logique.js` (règles pures), `frequentation-donnees.js` (lecture et écriture), `frequentation-ecran.js` (écran). Tests : `tests/reseauxsociaux-frequentation.test.js` (Q1 à Q6) et `tests/e2e/reseauxsociaux-frequentation.spec.js` (Q7 à Q12). `firebase.json` n'a aucune politique de sécurité de contenu : le cadre vers plausible.io n'est pas bloqué (un test le verrouille ; si une politique est ajoutée un jour, il faudra autoriser `frame-src https://plausible.io`).

**Limite connue** : le navigateur ne dit pas à la page si un cadre est refusé par le site distant ; l'écran se contente donc du message après 10 secondes sans réponse. Si Plausible change son lien de partage, Jérôme colle le nouveau.
