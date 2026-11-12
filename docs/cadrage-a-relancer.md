# Cadrage : bloc « À relancer » de l'Accueil (13/11/2026)

## But
Chaque matin, voir sur l'Accueil ce qui dort et mérite une relance, avec un brouillon de message prêt à copier. Une affaire qui dort est de l'argent perdu, et on l'oublie quand on est pris.

## Décisions de Jérôme (13/11/2026)
1. **Où** : une section « À relancer » sur l'Accueil, juste après « À faire » (`js/modules/crm/accueil.js`). Ni nouveau module, ni nouveau menu, ni nouvelle route.
2. **Lecture seule et modèles de texte** : aucune IA, aucune fonction du serveur, aucune règle Firestore, aucune migration, aucun envoi. Le bouton copie le texte, l'utilisateur envoie lui-même. Rien à brancher dans `functions-plateforme/`.
3. **Même code chez Jérôme et chez les clients** : la section disparaît seulement quand le module Affaires est éteint (`estNoyau()`).

## Ce que la liste contient
Seuils en constantes nommées en tête de `js/modules/crm/logique.js` (`SEUIL_AFFAIRE_QUI_DORT` 7, `SEUIL_DEVIS_SANS_REPONSE` 7, `SEUIL_PERSONNE_SANS_ACTIVITE` 14, `LIGNES_A_RELANCER` 10), pour en faire un réglage plus tard.
- **B. Devis envoyé sans réponse** : statut « envoyé » depuis 7 jours ou plus (ni accepté, ni refusé, ni archivé).
- **A. Affaire ouverte qui dort** : ni gagnée, ni perdue, ni archivée, dernier mouvement vieux de 7 jours ou plus (dernière activité faite, changement d'étape, envoi d'un devis, sinon création), sans activité prévue (celles-ci sont dans « À faire »).
- **C. Personne liée à une affaire ouverte**, sans activité (tout type, LinkedIn compris) depuis 14 jours ou plus.
- Une affaire ou une personne n'apparaît qu'une fois, avec le motif le plus fort : B, puis A, puis C.
- **Exclus** : personnes avec opposition à la prospection (`oppositionProspection`), éléments de test, éléments archivés. Ne double pas la liste « À relancer » de Réseaux sociaux (LinkedIn seul).
- Tri : le plus ancien d'abord ; dix lignes, puis « Voir tout ».

## Chaque ligne
Nom (lien vers la fiche, ou le devis), motif en français simple, ancienneté (« il y a 12 jours »), deux boutons :
- **Brouillon** : fenêtre avec un texte modèle prérempli (prénom, vouvoiement, signature du compte), modifiable, bouton « Copier ». Trois modèles (A, B, C), textes génériques.
- **J'ai relancé** : crée une activité « Email » déjà faite sur la personne et l'affaire (`planRelanceFaite`, journal commun). La ligne sort d'elle-même : une relance faite compte comme mouvement.

### Liens utiles (ajout de Jérôme, 13/11/2026)
Chaque ligne porte les liens pour agir tout de suite, **seulement s'ils existent et sont valides** (jamais de lien cassé) : « Ouvrir LinkedIn » (fiche personne, champ `linkedin` ; seulement `https://www.linkedin.com/…` ou `https://linkedin.com/…`, sans identifiant dans l'adresse ; nouvel onglet, `noopener noreferrer`), « E-mail » (`mailto:` avec l'adresse et l'objet prérempli, sans corps : il ouvre seulement le brouillon, rien ne part), « Appeler » (`tel:`), « Ouvrir le devis » pour une ligne de devis. Le canal le plus pertinent passe en premier : LinkedIn si le dernier échange (activité faite sur la personne ou l'affaire) était LinkedIn, sinon e-mail. Code : `liensUtilesRelance`, `lienLinkedinSur`, `sujetRelance`. Pas de lien vers un PDF : l'appli n'en garde pas d'adresse stable côté écran, le lien mène au devis.

## États
Chargement comme les autres blocs ; cas vide « Rien à relancer pour l'instant. » ; échec de « J'ai relancé » : message qui dit quoi faire, la ligne reste ; téléphone : la ligne passe sur deux lignes, boutons pleine largeur. Le bloc ne stocke aucune donnée à lui : pas de bouton d'export propre.

## Où est le code
- Logique pure : `aRelancer`, `brouillonRelance`, `planRelanceFaite`, `texteAnciennete` (`logique.js`) ; tests `tests/crm-a-relancer.test.js` (logique) et `tests/e2e/crm-a-relancer.spec.js` (écran).
- Les devis viennent du module Devis par une inscription (`inscrireDevisARelancer`, `pastilles-externes.js`) : le CRM ne connaît aucun module ; Devis éteint = aucun devis = seulement les motifs A et C.
- Écriture : `enregistrerRelance` (`donnees.js`), outil de journal `enregistrerRelance`.

## Décisions prises seul
- Devis dont l'affaire est perdue ou archivée : pas de ligne B. Devis sans affaire : relance comptée sur la personne.
- Un devis « envoyé » dont la date d'envoi manque utilise la date de finalisation.
- Affaire gagnée : jamais dans A ; mais ses devis « envoyés » restent en B tant qu'ils ne sont ni acceptés ni refusés.
- Plusieurs devis envoyés sur la même affaire : seul le plus ancien est montré.
