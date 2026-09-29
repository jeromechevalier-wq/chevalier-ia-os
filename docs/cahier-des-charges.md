# Cahier des charges : Chevalier IA OS, version 1 (coquille + module CRM)

Version 1.1 du 29/09/2026 (relecture : suppression du hors ligne, du cache du service worker, des taux de passage, de la question de rendez vous, du retour d'Apple Mail, du signalement RGPD à 3 ans et du tri des filtres ; ajout du rappel d'export mensuel). Rédigé à partir de l'entretien avec Jérôme Chevalier (décisions détaillées : `crm-decisions-entretien.md`). Ce document est la référence unique pour construire, tester et livrer la version 1.

---

## 1. Contexte et objectifs

1. Chevalier IA est l'entreprise solo de Jérôme Chevalier (Manosque), "Chief AI Officer externalisé". L'équipe se présente comme un duo : **Jérôme** (humain) et **Charles** (assistant IA, robot corail).
2. L'activité démarre : aucun client, quelques dizaines de prospects au maximum (réseau personnel, réseau d'entrepreneuses, commerçants locaux, interviews "Jobs to be Done").
3. **Chevalier IA OS** est l'espace de travail en ligne de Chevalier IA. La version 1 contient la coquille (connexion, menu, thèmes) et **un seul module : le CRM de prospection**. D'autres modules viendront, partageant à terme la même base.
4. Objectifs du CRM :
   1. ne perdre aucun prospect de vue et ne rater aucune relance ;
   2. voir ses objectifs du mois et leur avancement dès l'ouverture ;
   3. avoir un outil beau, fidèle à la DA de chevalier-ia.fr, agréable et un peu ludique (Kanban animé, compteurs, célébrations avec Charles).
5. Succès à 3 mois : beaucoup de prospects saisis, des cartes qui avancent dans le Kanban, les objectifs mensuels suivis.

## 2. Utilisateurs et usages

1. **Utilisateurs autorisés** (et eux seuls) :
   1. `jerome.chevalier@gmail.com`, affiché "Jérôme", avatar `assets/jerome-portrait.png` ;
   2. `jeromebot.chevalierbot@gmail.com`, affiché "Charles", avatar `assets/charles-portrait.png` (assistant IA).
   Les deux voient et modifient les mêmes données.
2. **Appareils** : Mac au quotidien (saisie, Kanban, revue) ; iPhone de temps en temps (ajout rapide après une rencontre, note dictée, consultation avant un rendez vous). Appli installable sur l'écran d'accueil (PWA).
3. **Journée type** :
   1. **8 h 30, Mac** : Jérôme ouvre l'OS, arrive sur l'Accueil. Il voit ses 6 objectifs du mois, 2 actions en retard (en rouge) et 3 pour aujourd'hui. Il traite chaque ligne : ouvre la fiche, fait l'action, fixe la prochaine action avec le bouton "+1 semaine". Quand la liste est vide, Charles le félicite.
   2. **11 h, commerce en ville** : il rencontre une commerçante. Sur l'iPhone, il crée la fiche (nom, entreprise, source "Commerçant local"), puis dicte une note rapide avec le micro du clavier.
   3. **14 h, Mac** : il déplace la carte d'un prospect de "Rendez vous fixé" à "Proposition envoyée". L'appli propose "Relancer la proposition" à +3 jours ; il valide. Il écrit le compte rendu du rendez vous dans les Notes et coche "Rendez vous tenu".
   4. **17 h** : un client passe en "Gagné" : feu d'artifice, Charles apparaît.
   5. **Vendredi** : revue de la semaine avec le filtre "À relancer cette semaine" et la section "Sans action prévue". Il ajoute "+10" à l'objectif flyers.

## 3. Modèle de données (Firestore)

Base par défaut, région `europe-west9` (Paris). Convention OS : chaque module préfixe ses collections (`crm_…`) ; les éléments communs sont préfixés `os_`.

### 3.1 Collection `crm_prospects` (un document = une personne)

| Champ (id) | Libellé | Type | Obligatoire | Valeurs, règle | Exemple |
|---|---|---|---|---|---|
| `nom` | Prénom et nom | string | oui | | "Marie Durand" |
| `entreprise` | Entreprise | string | non | | "Fleurs de Provence" |
| `roles` | Rôles | array de string | oui (au moins 1) | `prospect`, `partenaire`, `interview_jtbd` | ["prospect","interview_jtbd"] |
| `dateInterviewJtbd` | Date de l'interview JTBD | date | non | vide = non faite | 2026-10-12 |
| `secteur` | Secteur | string | non | liste de `crm_parametres/listes.secteurs` | "Commerce local" |
| `taille` | Taille | string | non | Solo, 2 à 10, 11 à 50, Plus de 50 | "Solo" |
| `ville` | Ville | string | non | | "Manosque" |
| `telephone` | Téléphone | string | non | lien `tel:` | "06 12 34 56 78" |
| `email` | Email | string | non | format email, lien email | "marie@exemple.fr" |
| `siteWeb` | Site web | string | non | URL | |
| `linkedin` | LinkedIn | string | non | URL | |
| `source` | Source | string | oui | liste de `crm_parametres/listes.sources` | "Réseau entrepreneuses" |
| `etape` | Étape | string | oui | voir section 4 | "rdv_fixe" |
| `dateEntreeEtape` | Entrée dans l'étape | timestamp | auto | mise à jour à chaque changement d'étape | |
| `datesEtapes` | Première date par étape | map étape → timestamp | auto | renseignée la première fois qu'une fiche atteint une étape | {"proposition_envoyee": …} |
| `priorite` | Priorité | string | oui | `chaud`, `tiede`, `froid` (défaut `tiede`) | "chaud" |
| `besoin` | Besoin identifié | string | non | | "Automatiser ses posts Instagram" |
| `offreId` | Offre envisagée | string | non | id du catalogue `crm_parametres/offres` | "audit" |
| `dureeJours` | Durée (jours) | number | non | pas de 0,5 | 2.5 |
| `montant` | Montant (€) | number | non | estimé, puis facturé | 1200 |
| `datePremierContact` | Premier contact | date | oui | défaut : aujourd'hui | |
| `dateDernierEchange` | Dernier échange | timestamp | auto | mis à jour : note rapide, changement d'étape, bouton "Email envoyé", rendez vous tenu, action faite | |
| `prochaineAction` | Prochaine action | string | non (fortement conseillé) | | "Relancer la proposition" |
| `dateProchaineAction` | Date prochaine action | date | non | | 2026-10-15 |
| `dateRdv` | Date du rendez vous | date + heure | non | | |
| `rdvTenu` | Rendez vous tenu | boolean | non | case à cocher | true |
| `dateRdvTenu` | | timestamp | auto | égale à `dateRdv` si elle est renseignée, sinon date où la case a été cochée | |
| `notes` | Notes | string (long) | non | grand texte libre, géré uniquement par l'utilisateur, jamais modifié par l'appli | |
| `notesRapides` | Notes rapides | array de {id, texte, date, auteur} | non | ajout, suppression, "copier dans Notes" | |
| `historique` | Historique automatique | array de {date, auteur, type, texte} | auto | changements d'étape, email envoyé, rendez vous tenu, action faite, encaissement ; limité aux 200 dernières entrées | |
| `documents` | Documents | array de {libelle, url} | non | liens Google Drive | |
| `raisonPerdu` | Raison si perdu | string | si étape `perdu` | Prix, Pas le moment, Pas de besoin, Concurrent, Sans réponse, Autre | |
| `raisonPerduDetail` | | string | non | | |
| `dateReveil` | Date de réveil | date | si étape `pas_maintenant` | | |
| `encaissements` | Encaissements | array de {date, montant, offreId} | auto | ajouté quand la fiche passe en `facture_payee` (montant = `montant` de la fiche, modifiable dans la boîte de dialogue) | |
| `oppositionProspection` | Opposition à la prospection | boolean | non | désactive le bouton email | |
| `dateOpposition` | | timestamp | auto | | |
| `archive` | Archivé | boolean | auto | vrai en `facture_payee` (masqué du Kanban) | |
| `creeLe`, `modifieLe` | | timestamp | auto | `serverTimestamp()` | |
| `creePar`, `modifiePar` | | string | auto | email du compte | |

Bouton **"Nouvelle affaire"** sur une fiche archivée ou perdue : remet la fiche en `premier_contact`, vide offre, durée, montant, prochaine action et rendez vous, conserve notes, historique et encaissements.

### 3.2 Collection `crm_parametres`

1. Document `offres` : `{ items: [{id, nom, actif, ordre}] }`. Départ : Audit, Accompagnement. Ajout, renommage, archivage et tri depuis Réglages ; une offre archivée reste lisible sur les anciennes fiches.
2. Document `listes` : `{ secteurs: [...], sources: [...] }`, modifiables dans Réglages. Départ secteurs : Commerce local, Artisanat, Services, Bien être, Conseil, Associatif, Autre. Départ sources : Réseau personnel, Réseau entrepreneuses, Commerçant local, LinkedIn, Recommandation, Événement, Flyer, Autre.
3. Document `filtres` : `{ items: [{id, nom, criteres, ordre}] }`, filtres enregistrés modifiables (voir 6.3).
4. Document `reglages` : `{ delaiPaiementJours: 30, dernierExport: timestamp ou null }`.

### 3.3 Collections communes à l'OS

1. `os_objectifs` : un document par objectif `{ id, libelle, type: "calcule" | "manuel", calcul (si calculé), cible, unite, couleur, ordre, actif }`.
2. `os_objectifs_saisies` : un document par objectif manuel et par mois, id `<objectifId>_<AAAA-MM>`, `{ objectifId, mois, valeur, maj }`.

Initialisation : au premier lancement, si ces documents n'existent pas, l'appli les crée avec les valeurs de départ ci dessus et de la section 6.1.

## 4. Pipeline, statuts et alertes

1. **Étapes du Kanban** (ordre, id, couleur) :
   1. Premier contact, `premier_contact`, gris lilas ;
   2. Rendez vous fixé, `rdv_fixe`, lilas `#e3cdee` ;
   3. Proposition envoyée, `proposition_envoyee`, violet clair `#b98ee0` ;
   4. Gagné, `gagne`, jaune `#ecbc06` ;
   5. Facture envoyée, `facture_envoyee`, corail (couleur de Charles, relevée sur `charles-portrait.png`) ;
   6. Facture payée, `facture_payee`, vert.
2. **Facture payée** : la carte disparaît du Kanban (`archive = true`) après l'animation ; la fiche reste dans la Liste (filtre "Archivés") et dans les statistiques.
3. **Sorties**, en colonnes repliées à droite du Kanban : Perdu (`perdu`, raison obligatoire) et Pas maintenant (`pas_maintenant`, date de réveil obligatoire). À la date de réveil, la fiche apparaît dans "Aujourd'hui" avec l'action "Reprendre contact".
4. Les fiches dont le seul rôle est Interviewé JTBD restent en Premier contact.
5. **Glisser déposer** dans tous les sens, y compris retour en arrière ; sur téléphone, le changement d'étape se fait aussi par un menu "Déplacer vers…" sur la carte.
6. **Alerte "En retard"** : `dateProchaineAction` < aujourd'hui, sur une fiche ni archivée, ni perdue. Pas de durée de stagnation par étape. Badge rouge sur la carte et section "En retard" à l'Accueil.
7. **"Sans action prévue"** : fiche active (ni archivée, ni perdue, ni pas maintenant) sans `dateProchaineAction`.

## 5. Tâches, relances et rappels

1. Une seule prochaine action par fiche (texte + date). Boutons de date rapide : Demain, +3 jours, +1 semaine, +2 semaines, et sélecteur de date.
2. **Suggestions douces** au changement d'étape : une petite boîte préremplie, que l'on peut valider, modifier ou fermer sans rien changer.
   1. vers Proposition envoyée : "Relancer la proposition", +3 jours ;
   2. vers Gagné : "Envoyer la facture", aujourd'hui ;
   3. vers Facture envoyée : "Vérifier le paiement", + `delaiPaiementJours` (30 par défaut, hypothèse réglable).
3. Marquer l'action comme faite : bouton "Fait" qui vide l'action, ajoute une ligne à l'historique, met à jour `dateDernierEchange` et ouvre directement le choix de la prochaine action.
4. Rendez vous : une date et une case "Rendez vous tenu" ; aucune question automatique.
5. **Email** : bouton "Écrire un email" (lien `mailto:` avec l'adresse du prospect), désactivé si pas d'email ou opposition cochée. À côté, bouton "Email envoyé" qui met à jour `dateDernierEchange` et ajoute une ligne à l'historique. Pas de modèles en V1.
6. Aucun rappel hors de l'appli en V1.

## 6. Objectifs, filtres, recherche, vues

### 6.1 Objectifs mensuels (Accueil)

| Objectif | Type | Calcul (mois civil en cours, fuseau Europe/Paris) | Cible |
|---|---|---|---|
| Interviews JTBD réalisées | calculé | fiches avec `dateInterviewJtbd` dans le mois | 10 |
| Nouveaux contacts | calculé | fiches avec `creeLe` dans le mois | 10 |
| Rendez vous tenus | calculé | fiches avec `rdvTenu` et `dateRdvTenu` dans le mois | 4 |
| Propositions envoyées | calculé | fiches avec `datesEtapes.proposition_envoyee` dans le mois | 3 |
| Chiffre d'affaires encaissé | calculé | somme des `encaissements.montant` datés du mois | 1 000 € |
| Flyers distribués | manuel | valeur de `os_objectifs_saisies` du mois, boutons +1, +10, et saisie directe | 100 |

1. Chaque objectif : libellé, valeur / cible, barre de progression en couleur animée au chargement, compteur qui défile.
2. Cibles, libellés, couleurs, ordre et activation modifiables dans Réglages ; ajout d'objectifs **manuels** depuis Réglages (les objectifs calculés sont fixés dans le code, dans une liste facile à étendre).
3. Sélecteur de mois pour voir les mois précédents.
4. Objectif atteint (passage sous puis au dessus de 100 % pendant la session) : célébration (section 7.5).

### 6.2 Filtres et recherche (Liste et Kanban)

1. Filtres combinables : étape, rôle, source, secteur, ville, priorité, offre, en retard, sans action prévue, interview JTBD faite / non faite, archivés.
2. Recherche instantanée (côté navigateur, insensible aux accents et à la casse) dans nom, entreprise, ville, notes, notes rapides.
3. Les filtres actifs s'affichent sous forme de pastilles supprimables ; bouton "Tout effacer".

### 6.3 Filtres enregistrés

Départ, tous modifiables, renommables et supprimables (pas de réordonnancement) ; bouton "Enregistrer ce filtre" :
1. À relancer cette semaine (date de prochaine action d'ici dimanche, retards inclus) ;
2. Chauds (priorité chaud, non archivés) ;
3. Réseau entrepreneuses (source Réseau entrepreneuses) ;
4. Interviews JTBD à faire (rôle interview JTBD, date vide).

### 6.4 Vues du module CRM (entrées de sous menu)

1. **Accueil** : objectifs du mois ; bloc "À faire" en trois groupes (En retard, Aujourd'hui, Sans action prévue) avec bouton "Fait" en ligne ; statistiques : nombre de fiches par étape (barres) et chiffre d'affaires encaissé par mois sur 6 mois ; rappel d'export si `dernierExport` date de plus de 30 jours ou n'existe pas ("Pense à ta sauvegarde mensuelle" avec bouton Exporter). Ajout rapide d'une fiche.
2. **Kanban** : colonnes des 6 étapes (Facture payée affiche seulement les payées du mois en cours, compteur), colonnes repliées Perdu et Pas maintenant ; carte : nom, entreprise, priorité, prochaine action et date, badge retard, montant.
3. **Liste** : tableau triable (clic sur l'en tête), compact sur ordinateur, cartes aérées sur téléphone ; export CSV des fiches filtrées.
4. **Fiche** : panneau latéral sur ordinateur, plein écran sur téléphone ; sections Identité, Suivi, Prochaine action, Rendez vous, Notes, Notes rapides, Documents, Historique (replié), RGPD, Supprimer.
5. **Réglages** : offres, secteurs, sources, filtres enregistrés, objectifs, délai de paiement, thème.

## 7. Charte graphique appliquée

Source : le site chevalier-ia.fr (`styles.css`, `tally-merci.html`, dossier `assets`). Tous les fichiers de marque sont repris tels quels (portraits, logo, polices) ; Charles n'est jamais redessiné.

1. **Polices** (fichiers locaux du site, aucune requête externe) : Poppins 500 et 700 pour les titres (interlettrage `-0.03em`), Be Vietnam Pro 400, 500, 600, 700 pour le texte. Étiquettes en capitales espacées (`letter-spacing: .14em`, 11 px) comme sur le site.
2. **Couleurs** (variables CSS définies une seule fois) :
   1. marque : jaune `#ecbc06` (actions, entrée active du menu, focus), violet `#341363`, lilas `#e3cdee`, ink `#29292c`, ink2 `#36353a`, papier `#f5f5f3`, warm `#efeee9`, ligne `#dcdcd6`, gris `#69696d` ;
   2. **thème sombre (défaut)** : fond `#1b1a1e`, panneaux `#29292c`, survol `#36353a`, texte `#ffffff`, texte secondaire `#c3c1c1`, bordures `#ffffff1a`, halo violet radial discret en haut de page ;
   3. **thème clair** : fond `#f5f5f3`, panneaux `#ffffff`, texte `#29292c`, secondaire `#69696d`, bordures `#dcdcd6` ;
   4. priorités : chaud corail, tiède jaune, froid gris ;
   5. retard : rouge doux lisible dans les deux thèmes ; contraste texte / fond au moins 4,5:1.
3. **Menu latéral** (façon console Firebase) : replié par défaut à 64 px (icônes seules, info bulle au survol) ; bouton pour l'élargir à 240 px (icône + libellé) ; état mémorisé sur l'appareil. En haut : baguette et "Chevalier IA OS". Entrées : CRM (avec sous entrées Accueil, Kanban, Liste), Réglages. En bas : bascule de thème, avatar et nom du compte, Se déconnecter. Sur téléphone (moins de 768 px) : barre supérieure avec bouton menu, panneau par dessus le contenu. Icônes : Lucide (SVG intégrés dans le code).
4. **Écran de connexion** : fond radial violet de `tally-merci.html`, Charles flottant entre deux orbites, titre "Chevalier IA OS", bouton jaune "Se connecter avec Google". Compte refusé : message "Accès refusé : ce compte n'est pas autorisé", déconnexion immédiate.
5. **Célébrations** (reprise du canvas de feu d'artifice de `tally-merci.html`, couleurs `#ecbc06`, `#ffe56c`, `#e3cdee`, `#ffffff`, `#b98ee0`), durée 2 à 3 s, clic pour fermer, désactivées si `prefers-reduced-motion` :
   1. carte en Gagné : grand feu d'artifice et Charles au centre "Bravo Jérôme !" ;
   2. Facture payée : compteur du chiffre d'affaires qui défile et pluie d'étincelles jaunes ;
   3. objectif atteint : feu d'artifice et "Objectif atteint : <libellé>" ;
   4. dernière action du jour faite : petite animation de Charles "Tout est fait pour aujourd'hui".
6. **États vides** : Charles en petit avec un message ("Aucune relance aujourd'hui, Charles veille", "Ajoute ton premier prospect").
7. **Animations** : cartes du Kanban qui glissent (transition 200 ms), barres qui se remplissent, compteurs qui défilent ; rien de bloquant.

## 8. Architecture et sécurité

1. **Code** : HTML, CSS et JavaScript en modules ES, **sans étape de compilation** pour l'appli. SDK Firebase **12.19.0** chargé depuis `https://www.gstatic.com/firebasejs/12.19.0/…` (version figée).
2. **Hébergement** : Firebase Hosting, projet `chevalier-ia-os`, adresse `https://chevalier-ia-os.web.app`. Dépôt GitHub privé `jeromechevalier-wq/chevalier-ia-os`, branche `main` ; action GitHub officielle `FirebaseExtended/action-hosting-deploy` à chaque push sur `main` (canal `live`, secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS`). Plan gratuit Spark : aucune Cloud Function, aucun Cloud Storage.
3. **Configuration Firebase** (`js/os/firebase-config.js`) :
   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSyAa04eaHNaBJwGAUwMrDampugAn1aralXc",
     authDomain: "chevalier-ia-os.web.app",
     projectId: "chevalier-ia-os",
     storageBucket: "chevalier-ia-os.firebasestorage.app",
     messagingSenderId: "96526036520",
     appId: "1:96526036520:web:d09f8ac76597dffaad0f1d"
   };
   export const COMPTES_AUTORISES = {
     "jerome.chevalier@gmail.com": { nom: "Jérôme", avatar: "assets/jerome-portrait.png" },
     "jeromebot.chevalierbot@gmail.com": { nom: "Charles", avatar: "assets/charles-portrait.png" }
   };
   ```
   `authDomain` est volontairement le domaine d'hébergement (au lieu de `firebaseapp.com`) pour que la connexion par redirection fonctionne sur iPhone. Connexion par fenêtre surgissante sur ordinateur, par redirection sur téléphone et en mode appli installée.
4. **Règles Firestore** (`firestore.rules`, déjà publiées) :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null
           && request.auth.token.email_verified == true
           && request.auth.token.email in [
                "jerome.chevalier@gmail.com",
                "jeromebot.chevalierbot@gmail.com"
              ];
       }
     }
   }
   ```
5. **Contrôle dans l'interface** : après connexion, si l'email n'est pas dans `COMPTES_AUTORISES` ou n'est pas vérifié, déconnexion immédiate et message d'accès refusé ; aucune donnée n'est demandée avant ce contrôle.
6. **Pas de mode hors ligne en V1** : cache Firestore en mémoire (réglage par défaut, pas de cache persistant). Sans réseau, bandeau "Hors ligne : reconnecte toi pour continuer" ; aucune modification n'est promise hors ligne.
7. **Lectures économes** : un écouteur `onSnapshot` par collection pour toute la session, filtrage et calculs côté navigateur.
8. **PWA sans service worker** : `manifest.webmanifest` (nom "Chevalier IA OS", nom court "Chevalier OS", `display: standalone`, couleurs du thème sombre, icônes 192, 512, maskable, apple touch à partir de la baguette) et balises Apple pour l'installation sur iPhone. **Aucun service worker, aucune mise en cache de fichiers par l'appli.** Version : fichier `version.json` (`{"version": "1.0.0"}`) ; la version chargée est inscrite dans `js/os/version.js` ; à l'ouverture et à chaque retour sur l'onglet, l'appli lit `version.json` (sans cache) et, si elle diffère, affiche le bandeau "Nouvelle version disponible" avec "Recharger". Chaque livraison augmente la version dans les deux fichiers.
9. **En têtes** (`firebase.json`) : `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive ; `Cache-Control: no-cache` pour tous les fichiers `.html`, `.js`, `.css`, `.json` et le manifeste (revalidation à chaque chargement, rien de périmé) ; cache long uniquement pour les polices et les images. `robots.txt` interdit tout. `<meta name="robots" content="noindex">`.
10. **Routage** par ancre : `#/crm/accueil` (défaut), `#/crm/kanban`, `#/crm/liste`, `#/crm/fiche/<id>`, `#/reglages`.
11. **Organisation modulaire** : la coquille (`js/os/`) ne connaît les modules que par la liste `js/os/modules.js` (id, libellé, icône, routes, fonction de montage). Ajouter un module = un dossier `js/modules/<nom>/` + une entrée dans cette liste.
12. **Mode test** : si l'appli est servie sur `localhost` avec `?emulateurs=1`, elle se connecte aux émulateurs Firebase (Auth 9099, Firestore 8080) au lieu de la production.

## 9. RGPD

1. Données hébergées en France (Firestore `europe-west9`, Paris). Accès limité à deux comptes.
2. Conservation : signalement automatique des fiches sans échange depuis 3 ans repoussé en V2 (il ne servirait pas avant 2029).
3. Bouton "Supprimer définitivement" sur chaque fiche, avec confirmation en tapant le nom.
4. Opposition à la prospection : case sur la fiche, date enregistrée, bouton email désactivé, badge sur la carte.
5. Export CSV (UTF 8 avec BOM, séparateur point virgule pour Excel en français) de toutes les fiches ou des fiches filtrées. Chaque export complet enregistre `dernierExport` ; rappel à l'Accueil après 30 jours sans export (sauvegarde mensuelle).

## 10. Arborescence des fichiers livrés

```
chevalier-ia-os/
  index.html                  coquille : conteneur, chargement des modules ES
  manifest.webmanifest        PWA
  version.json                numéro de version publié
  robots.txt                  interdiction d'indexation
  firebase.json               hébergement, en têtes, règles, émulateurs
  .firebaserc                 projet par défaut chevalier-ia-os
  firestore.rules             règles de sécurité (identiques à la console)
  .gitignore
  README.md                   mise en ligne, mise à jour, tests
  css/
    tokens.css                couleurs, thèmes sombre et clair, polices
    os.css                    coquille, menu, connexion, bandeaux
    crm.css                   styles du module CRM
  js/
    main.js                   démarrage
    os/
      firebase-config.js      configuration et comptes autorisés
      firebase.js             initialisation, émulateurs
      auth.js                 connexion Google, contrôle des comptes
      router.js               routage par ancre
      shell.js                menu latéral, thème, profil
      modules.js              liste des modules de l'OS
      objectifs.js            objectifs communs (calculés et manuels)
      celebrations.js         feu d'artifice, Charles, compteurs
      version.js              version chargée
      pwa.js                  détection de nouvelle version, bandeau hors ligne
      ui.js                   composants communs (boîtes de dialogue, toasts, icônes)
    modules/
      crm/
        index.js              montage du module et sous menu
        donnees.js            écouteurs Firestore, écritures
        logique.js            règles métier pures (retard, suggestions, calculs, CSV, RGPD)
        accueil.js            objectifs, à faire, statistiques
        kanban.js
        liste.js
        fiche.js
        reglages.js
  assets/
    charles-portrait.png, jerome-portrait.png, logo et baguette (SVG du site)
    fonts/                    polices du site
    icons/                    icônes PWA générées depuis la baguette
  docs/
    cahier-des-charges.md     ce document
  tests/                      non publiés (ignorés par firebase.json)
    package.json              dépendances de test uniquement
    regles.test.js            tests des règles de sécurité
    logique.test.js           tests unitaires de logique.js
    e2e/                      scénarios Playwright
  .github/workflows/
    firebase-hosting.yml      déploiement automatique à chaque push sur main
```

## 11. Éléments déjà prêts

1. Projet Firebase `chevalier-ia-os`, application Web déclarée (configuration en 8.3).
2. Fournisseur Google activé ; base Firestore `(default)` en `europe-west9`, mode production ; règles de la section 8.4 publiées.
3. Dépôt GitHub privé vide `jeromechevalier-wq/chevalier-ia-os`.

## 12. Périmètre

1. **Version 1** : tout ce qui est décrit dans ce document.
2. **Version 2** : mode hors ligne avec modification ; signalement RGPD après 3 ans sans échange ; modèles d'email ; envoi direct des emails par n8n (collection `crm_emails_sortants`) ; note vocale enregistrée, transcrite et résumée par n8n (audio dans Google Drive) ; sauvegarde automatique vers Google Sheets ; import CSV.
3. **Plus tard** : rappels hors de l'appli (email du matin, notification, Google Agenda) ; tâches confiées à Charles ; domaine personnalisé ; autres modules de l'OS.
4. **Abandonné** : champs personnalisés ; taux de passage entre étapes ; question automatique après un rendez vous ; détection du retour d'Apple Mail ; réordonnancement des filtres ; service worker avec mise en cache.

## 13. Critères d'acceptation et protocole de test

L'appli n'est "terminée" que lorsque **tous les tests automatiques passent** et que chaque critère ci dessous est couvert. Les tests tournent sur les émulateurs Firebase, jamais sur les données réelles. Les émulateurs utilisent l'identifiant de projet `demo-chevalier-ia-os` (le préfixe `demo-` garantit qu'aucune requête ne peut atteindre la production). Prérequis de test : Node.js 20 ou plus, Java 21 (pour les émulateurs), `firebase-tools` et Playwright (Chromium) installés en dépendances de développement dans `tests/`. Commande unique : `cd tests && npm test` (lance les émulateurs, les tests A, B, C et D, puis les arrête).

### 13.1 Tests automatiques (exécutés par l'IA avant livraison)

**A. Règles de sécurité** (`@firebase/rules-unit-testing`, émulateur Firestore) :
1. Jérôme (email vérifié) peut lire, créer, modifier, supprimer dans `crm_prospects`, `crm_parametres`, `os_objectifs`, `os_objectifs_saisies`.
2. Charles (email vérifié) : mêmes droits.
3. Un autre compte Google vérifié est refusé en lecture et en écriture sur chaque collection.
4. Un compte autorisé dont l'email n'est pas vérifié est refusé.
5. Un visiteur non connecté est refusé.

**B. Logique métier** (`node --test` sur `logique.js`, sans navigateur) :
1. En retard : vrai si la date est passée, faux aujourd'hui, faux pour une fiche archivée ou perdue.
2. Sans action : détection correcte, fiches Pas maintenant exclues.
3. Boutons de date : Demain, +3 j, +1 sem, +2 sem, y compris changement de mois et d'heure d'été.
4. Suggestions : bonne action et bonne date pour chaque étape concernée, délai de paiement réglable.
5. Objectifs : chaque calcul de 6.1 sur un jeu de fiches de test, bornes du mois en Europe/Paris.
6. Encaissements : passage en Facture payée ajoute un encaissement ; "Nouvelle affaire" le conserve.
7. Filtres : chaque filtre seul et combiné ; recherche insensible aux accents ; les 4 filtres enregistrés de départ.
8. Statistiques : comptage par étape et chiffre d'affaires par mois.
9. Export CSV (en têtes, BOM, point virgule, guillemets et retours à la ligne échappés) ; rappel d'export : affiché si aucun export ou export de plus de 30 jours, masqué sinon.

**C. Parcours dans le navigateur** (Playwright + émulateurs, Chromium ; formats 1440 × 900 et 390 × 844) :
1. Connexion avec Jérôme : arrivée sur l'Accueil, 6 objectifs affichés.
2. Connexion avec un compte non autorisé : message d'accès refusé, retour à l'écran de connexion, aucune donnée affichée.
3. Créer une fiche (champs obligatoires contrôlés), la retrouver dans la Liste, le Kanban et la recherche.
4. Glisser une carte de Premier contact à Rendez vous fixé puis revenir en arrière ; `datesEtapes` et historique à jour.
5. Passer une carte en Proposition envoyée : suggestion affichée ; la fermer ne change rien, la valider fixe l'action.
6. Passer en Gagné : célébration visible, puis fermée au clic.
7. Passer en Facture payée : carte retirée du Kanban, objectif chiffre d'affaires augmenté.
8. Bouton "Fait" sur une action du jour : la ligne disparaît, la boîte de prochaine action s'ouvre.
9. Cocher "Rendez vous tenu" : objectif rendez vous augmenté.
10. Objectif flyers : "+10" met à jour la barre et persiste après rechargement.
11. Notes : le texte libre n'est jamais modifié par une action automatique ; une note rapide ajoutée puis copiée dans Notes puis supprimée.
12. Filtres enregistrés : créer, renommer, supprimer.
13. Réglages : ajouter une offre, l'archiver ; elle reste lisible sur une fiche existante.
14. Export CSV : fichier téléchargé avec le bon nombre de lignes ; le rappel d'export disparaît de l'Accueil.
15. Opposition à la prospection : bouton email désactivé.
16. Supprimer définitivement : confirmation exigée, fiche disparue.
17. Menu : replié par défaut, élargi au clic, état conservé après rechargement ; sur 390 px, panneau par dessus le contenu.
18. Thème : bascule sombre / clair conservée après rechargement.
19. Nouvelle version : modifier `version.json` pendant que l'appli est ouverte, revenir sur l'onglet, le bandeau "Nouvelle version disponible" apparaît ; hors réseau, le bandeau "Hors ligne" apparaît.
20. Aucune erreur dans la console du navigateur sur l'ensemble des parcours ; aucun défilement horizontal à 390 px.

**D. Contrôles statiques** :
1. `manifest.webmanifest` valide, icônes présentes, aucun service worker enregistré, versions identiques dans `version.json` et `js/os/version.js`.
2. Aucune ressource chargée hors de `gstatic.com` (SDK Firebase), `googleapis.com` et domaines Google de connexion.
3. `firebase.json` : `tests/`, `docs/`, `README.md` non publiés ; en têtes présents.

### 13.2 Recette manuelle par Jérôme après mise en ligne (environ 10 minutes)

1. Sur le Mac, ouvrir `https://chevalier-ia-os.web.app`, se connecter avec jerome.chevalier@gmail.com.
2. Dans une fenêtre de navigation privée, essayer un autre compte Google : accès refusé.
3. Créer un prospect de test, le faire passer jusqu'à Gagné (feu d'artifice), puis le supprimer.
4. Sur l'iPhone, ouvrir l'adresse dans Safari, se connecter, puis Partager, "Sur l'écran d'accueil". Ouvrir l'appli installée, créer une note rapide avec la dictée.
5. Se connecter une fois avec le compte de Charles.

## 14. Actions manuelles restantes après la construction

1. Décompresser le zip et pousser son contenu à la racine du dépôt `chevalier-ia-os` (guidé pas à pas).
2. Une seule fois sur le Mac : installer Node.js LTS, puis `npm install -g firebase-tools`, `firebase login`, et dans le dossier du dépôt `firebase init hosting:github` (répondre : dépôt `jeromechevalier-wq/chevalier-ia-os`, pas de build, déploiement sur `main`). Cette commande crée le secret GitHub et le compte de service ; garder le fichier d'action fourni si elle propose de l'écraser.
3. Dans Google Cloud Console (projet chevalier-ia-os), Identifiants, client OAuth "Web client (auto created by Google Service)" : ajouter l'URI de redirection `https://chevalier-ia-os.web.app/__/auth/handler`.
4. Faire la recette manuelle de la section 13.2.

## 15. Questions encore ouvertes

1. Couleur corail exacte de Charles : relevée sur l'image au moment de la construction.
2. Délai de paiement : 30 jours par défaut, à confirmer.
3. Découpage exact des offres (jours, demi journées) : à préciser plus tard dans le catalogue.
