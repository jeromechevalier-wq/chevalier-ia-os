# Rapport de construction : Chevalier IA OS 2.0.0

Construit le 02/10/2026 dans la session de travail, sur la branche `v2`, à partir de `docs/cahier-des-charges-v2.0.md` (source de vérité).

## 1. Résultat des tests (`cd tests && npm test`, depuis les émulateurs, projet `demo-chevalier-ia-os`)

| Catégorie | Contenu | Résultat |
|---|---|---|
| **A** Règles de sécurité | 9 collections × 5 cas (Jérôme, Charles, autre compte vérifié, e-mail non vérifié, visiteur) | **45 sur 45** |
| **B** Logique métier | `node --test` sur `logique.js` : nom, doublons, recherche intelligente, statut, perdue / en pause, encaissements, retard et pastilles, dates rapides, suggestions, activités, notes, historique, objectifs, graphique depuis octobre 2026, filtres, intégrité, export JSON et CSV | **112 sur 112** |
| **D** Contrôles statiques | manifeste, icônes, aucun service worker, versions 2.0.0, domaines, `firebase.json`, règles identiques, arborescence, aucune requête composite, aucun appel à `crm_prospects`, collections attendues | **23 sur 23** |
| **C et D** Parcours Playwright | chaque parcours rejoué à 1440 × 900 (ordinateur) et 390 × 844 (téléphone) | **98 réussis, 2 ignorés** (les deux tests de clavier propres à l'ordinateur ne tournent pas sur téléphone) |

Zéro erreur de console pendant les parcours, zéro défilement horizontal de la page à 390 px (y compris avec des textes très longs).

## 2. Ce qui a été construit

1. **Coquille conservée** (connexion Google, règles, menu, thèmes, déploiement) avec une barre supérieure : recherche globale groupée (Personnes, Organisations, Affaires), bouton « + » et raccourcis clavier (`/`, `n`, Échap).
2. **Modèle Personnes, Organisations, Affaires**, plus activités, notes et journal : neuf collections Firestore, identifiants automatiques, liens par identifiant, intégrité testée.
3. **Création minimale** : « Ajouter une personne » se résume au nom (curseur déjà dedans, Entrée enregistre) ; **champs intelligents** à partir de 2 lettres, avec « Créer … » à la volée et détection de doublons.
4. **Fiches** (personne, organisation, affaire) à la Pipedrive : sections repliables, « + Ajouter » à la demande, activité, notes, Points clés, historique filtrable ; deux colonnes sur ordinateur, une colonne dans l'ordre voulu sur téléphone.
5. **Affaires** : Kanban (totaux en euros, pastille d'activité, glisser déposer, « Déplacer vers… » sur téléphone), liste, archives, Gagnée / Perdue / En pause / Rouvrir, encaissements ; **Accueil** avec les six objectifs, Points clés et graphique du chiffre d'affaires **depuis octobre 2026** ; export JSON complet et CSV.

## 3. Décisions prises

Voir `docs/decisions-construction-v2.md` (réponses de Jérôme au lancement et choix techniques).

## 4. Actions manuelles restantes (dans l'ordre)

1. Sur GitHub, ouvrir la Pull request `v2` vers `main` et la fusionner : l'action publie la version 2.0.0 sur https://chevalier-ia-os.web.app.
2. Faire la recette manuelle de la section 15.2 du cahier (10 minutes), en particulier le chronomètre « une personne en moins de 10 secondes ».
3. Quand tu le souhaites, supprimer la collection `crm_prospects` dans la console Firebase (Firestore Database) : la version 2.0 ne l'utilise pas.
4. Rien à faire côté règles Firestore ni authentification.
5. Ensuite : version 2.1 (écran Projets, copie quotidienne vers Google Sheet par n8n).

Commandes utiles sur un Mac, si tu veux relancer les tests :

```sh
brew install openjdk@21
export PATH="$(brew --prefix openjdk@21)/bin:$PATH"
cd ~/chemin/vers/chevalier-ia-os/tests
npm install
npx playwright install chromium
npm test
```

## 5. Écarts avec le cahier

- Le cahier prévoit la branche `v2` créée depuis `main` ; elle l'a été depuis la branche de session, parce que les documents de la version 2.0 n'étaient pas encore sur `main`. Le résultat est identique (`main` plus ces documents).
- Les tests de glisser déposer passent par un vrai glisser à la souris, avec un repli sur les événements `drag` quand Chromium sans écran ignore un second glisser (artefact connu) : voir la décision 17.
- Le cahier (section 7.5) place « Activité et Notes » avant « Points clés » ; les deux sont dans la colonne de droite sur ordinateur et dans cet ordre sur téléphone.
- Aucun écart sur le périmètre : pas de Projets, pas d'écran Activités, pas d'import, pas de fusion de doublons.
