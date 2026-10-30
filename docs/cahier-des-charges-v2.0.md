# Cahier des charges : Chevalier IA OS, version 2.0 (coquille conservée, module CRM refondu)

Version 2.0 du 02/10/2026. Remplace le cahier 1.1 (`cahier-des-charges.md`, conservé pour mémoire) pour tout ce qui concerne le module CRM. Rédigé à partir des échanges avec Jérôme Chevalier après l'essai de la version 1.0.0 et l'étude des écrans de Pipedrive et de Notion. Ce document est la référence unique pour construire, tester et livrer la version 2.0.0.

---

## 1. Contexte et objectifs

1. Chevalier IA est l'entreprise solo de Jérôme Chevalier (Manosque), "Chief AI Officer externalisé". L'équipe se présente comme un duo : **Jérôme** (humain) et **Charles** (assistant IA, robot corail). L'activité démarre en octobre 2026 : aucun client, quelques dizaines de contacts au maximum.
2. **Chevalier IA OS** est l'espace de travail en ligne de Chevalier IA. Il se compose d'une coquille (connexion, menu, thèmes, déploiement) et de modules. La version 1.0.0 (en ligne) contient la coquille et un module CRM de prospection.
3. **Pourquoi une version 2.0** : le CRM de la version 1.0.0 n'est pas utilisable par Jérôme. Le formulaire de création compte 11 champs dont 6 obligatoires, tout est mélangé dans une seule fiche "prospect", et l'écran n'invite pas à saisir. Il faut qu'ajouter quelqu'un soit un plaisir de quelques secondes.
4. **Principes de la version 2.0** :
   1. **Un seul champ obligatoire** pour créer une personne : son nom. Tout le reste se complète quand on veut.
   2. **Vocabulaire et structure de Pipedrive** : Personnes, Organisations, Affaires, Activités, Étiquettes, Résumé, Détails, Historique, Points clés.
   3. **Champs de saisie intelligents** : on tape deux lettres, l'appli propose les valeurs qui existent déjà (section 8).
   4. **Ordinateur et téléphone à égalité** : le Mac est l'outil du quotidien, le téléphone sert à l'ajout rapide et à la consultation ; chaque écran est conçu et testé aux deux formats.
   5. On reprend la **structure et le vocabulaire** de Pipedrive et l'esprit des "propriétés vides" de Notion, **jamais leur marque, leurs icônes ni leurs textes** ; l'identité visuelle reste celle de Chevalier IA (section 10).
5. **Modèle en une phrase** : une **Organisation** regroupe des **Personnes** ; une Personne peut avoir plusieurs **Affaires** (la partie commerciale) ; une Affaire gagnée pourra donner un **Projet** (la partie gestion de projet, version 2.1).
6. Objectifs du CRM :
   1. ne perdre aucun contact de vue et ne rater aucune relance ;
   2. voir ses objectifs du mois et leur avancement dès l'ouverture ;
   3. avoir un outil beau, fidèle à la DA de chevalier-ia.fr, agréable et un peu ludique (Kanban animé, compteurs, célébrations avec Charles).
7. Succès à 3 mois : beaucoup de personnes saisies, des affaires qui avancent dans le Kanban, les objectifs mensuels suivis, et surtout **l'envie d'ouvrir l'outil**.
8. **Éléments déjà prêts** : projet Firebase `chevalier-ia-os` (Auth Google activé, Firestore `(default)` en `europe-west9`, règles publiées), dépôt GitHub privé `jeromechevalier-wq/chevalier-ia-os`, version 1.0.0 en ligne sur `https://chevalier-ia-os.web.app` et déployée automatiquement à chaque push sur `main`.

## 2. Utilisateurs et usages

1. **Utilisateurs autorisés** (et eux seuls) :
   1. `jerome.chevalier@gmail.com`, affiché "Jérôme", avatar `assets/jerome-portrait.png` ;
   2. `jeromebot.chevalierbot@gmail.com`, affiché "Charles", avatar `assets/charles-portrait.png` (assistant IA).
   Les deux voient et modifient les mêmes données.
2. **Appareils** : Mac au quotidien (saisie, Kanban, revue) ; téléphone (Android ou iPhone) de temps en temps : ajout rapide après une rencontre, note dictée, consultation avant un rendez vous. Appli installable sur l'écran d'accueil (PWA).
3. **Journée type** :
   1. **8 h 30, Mac** : Jérôme ouvre l'OS, arrive sur l'Accueil. Il voit ses 6 objectifs du mois et ses **Points clés** : 2 activités en retard (en rouge), 3 pour aujourd'hui. Il traite chaque ligne avec le bouton "Fait" ; l'appli lui propose la prochaine activité. Quand tout est fait, Charles le félicite.
   2. **11 h, en ville** : il rencontre une commerçante. Sur le téléphone, il appuie sur "+", "Personne", tape "Mar", choisit **ou crée** l'organisation qui s'affiche, appuie sur Enregistrer : **cinq secondes**. Il dicte une note avec le micro du clavier.
   3. **14 h, Mac** : depuis la fiche de la personne, "+ Affaire" ; il glisse la carte de "Rendez vous fixé" à "Proposition envoyée" ; l'appli propose l'activité "Relancer la proposition" à +3 jours ; il valide.
   4. **17 h** : une affaire passe en "Gagné" : feu d'artifice, Charles apparaît.
   5. **Vendredi** : revue avec la liste des affaires et les Points clés. Il ajoute "+10" à l'objectif flyers.

## 3. Modèle de données (Firestore)

Base `(default)`, région `europe-west9` (Paris). Chaque module préfixe ses collections (`crm_…`) ; les éléments communs de l'OS sont préfixés `os_`.

### 3.1 Conventions

1. **Identifiants** : générés automatiquement par Firestore (jamais l'email, jamais le nom). L'email sert à **détecter les doublons**, pas à identifier.
2. **Liens par identifiant** (`personneId`, `organisationId`, `affaireId`) ; les jointures se font dans le navigateur.
3. **Dates** : jour civil en texte `AAAA-MM-JJ` (sans fuseau), heure en `HH:MM` (Paris) ; horodatages en Timestamp Firestore (`serverTimestamp()`). Mois : `AAAA-MM`. Fuseau de calcul des mois : Europe/Paris.
4. **Éléments du fil** : toute activité, note ou événement porte `personneId`, `organisationId` et `affaireId` **chaque fois que ces liens existent** (une note écrite sur une affaire porte aussi la personne et l'organisation de l'affaire). Ainsi la même ligne apparaît dans l'historique de la personne, de l'organisation et de l'affaire.
5. **Pas d'index composite** : chaque requête ne comporte qu'une seule condition (égalité **ou** plage) ; les tris et filtres supplémentaires se font dans le navigateur. Aucun fichier d'index à publier.
6. **Chargement** : un écouteur `onSnapshot` pour toute la session sur `crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_parametres` et sur les activités non faites (`fait == false`). Notes, événements et activités faites se chargent **à l'ouverture d'une fiche** par une requête sur le lien de la fiche (égalité sur `personneId`, `organisationId` ou `affaireId`), triées dans le navigateur. L'objectif "rendez vous tenus" lit les activités faites par plage de `dateFait`.
7. **Valeurs de liste** : les listes (secteurs, sources, étiquettes, offres) sont dans `crm_parametres` ; une valeur retirée reste affichée sur les éléments qui l'utilisent.

### 3.2 Collection `crm_personnes` (un document = une personne)

| Champ | Libellé | Type | Obligatoire | Règle |
|---|---|---|---|---|
| `nom` | Nom | string | **oui** | Prénom et nom affichés partout, saisis dans **un seul champ** |
| `prenom`, `nomFamille` | Prénom, Nom de famille | string | non | Découpés à la création au premier espace ("Marie Durand" donne "Marie" et "Durand" ; un seul mot donne `nomFamille` seul). Modifiables dans Détails ; `nom` est alors recalculé (`prenom` + espace + `nomFamille`) |
| `organisationId` | Organisation | string ou null | non | Une personne a **au plus une** organisation |
| `telephones` | Téléphones | liste de {valeur, type} | non | type : `travail`, `perso`, `autre` ; lien `tel:` |
| `emails` | Emails | liste de {valeur, type} | non | mêmes types ; format vérifié ; lien email |
| `emailsNormalises` | | liste de string | auto | emails en minuscules, sans espaces, sans doublon ; sert à détecter les doublons |
| `etiquettes` | Étiquettes | liste d'identifiants | non | identifiants de `crm_parametres/etiquettes` |
| `roles` | Rôles | liste de string | non | `prospect`, `partenaire`, `interview_jtbd` ; défaut `["prospect"]` |
| `dateInterviewJtbd` | Interview JTBD faite le | date | non | vide = non faite |
| `ville`, `linkedin`, `siteWeb` | | string | non | URL pour les deux derniers |
| `source` | Source | string | non | liste `crm_parametres/listes.sources` |
| `oppositionProspection` | Opposition à la prospection | boolean | non | désactive les boutons email |
| `dateOpposition` | | timestamp | auto | |
| `archive` | | boolean | auto | faux par défaut |
| `proprietaire` | Propriétaire | string | auto | email du compte qui crée ; modifiable sur la fiche |
| `creeLe`, `modifieLe`, `creePar`, `modifiePar` | | timestamp, string | auto | |

### 3.3 Collection `crm_organisations`

| Champ | Libellé | Type | Obligatoire | Règle |
|---|---|---|---|---|
| `nom` | Nom | string | **oui** | |
| `adresse`, `ville`, `siteWeb` | | string | non | |
| `emails`, `telephones` | Email, Téléphone | liste de {valeur, type} | non | comme les personnes (types Travail, Perso, Autre ; 10 au plus ; format de l'email vérifié ; pas de doublon d'email). Les anciens champs texte `email` et `telephone` sont lus comme une première valeur tant que la liste n'existe pas ; la première écriture de la liste les vide |
| `secteur` | Secteur | string | non | liste `crm_parametres/listes.secteurs` |
| `taille` | Taille | string | non | Solo, 2 à 10, 11 à 50, Plus de 50 |
| `etiquettes` | Étiquettes | liste d'identifiants | non | |
| `archive`, `proprietaire`, `creeLe`, `modifieLe`, `creePar`, `modifiePar` | | | auto | comme les personnes |

### 3.4 Collection `crm_affaires` (la partie commerciale)

| Champ | Libellé | Type | Obligatoire | Règle |
|---|---|---|---|---|
| `titre` | Titre | string | **oui** | Prérempli avec le nom de l'organisation (sinon de la personne) : on peut enregistrer sans taper |
| `personneId` | Personne | string ou null | non | à renseigner presque toujours ; automatique quand l'affaire naît d'une fiche personne |
| `organisationId` | Organisation | string ou null | non | reprise de la personne, modifiable |
| `etape` | Étape | string | auto | une des 6 étapes (section 4) ; défaut `premier_contact` |
| `statut` | Statut | string | auto | `ouverte`, `gagnee`, `perdue` ; **dérivé** (la pause a été supprimée le 22/10/2026 : une ancienne affaire restée `en_pause` s'affiche comme ouverte) (section 4) |
| `priorite` | Priorité | string | non | `chaud`, `tiede`, `froid` ; défaut `tiede` |
| `montant` | Montant (€) | number | non | estimé, puis facturé |
| `offreId` | Offre envisagée | string | non | identifiant du catalogue `crm_parametres/offres` |
| `dureeJours` | Durée (jours) | number | non | pas de 0,5 |
| `source` | Source | string | non | liste des sources |
| `besoin` | Besoin identifié | string | non | |
| `dateEntreeEtape` | | timestamp | auto | à chaque changement d'étape |
| `datesEtapes` | | map étape vers timestamp | auto | première date de chaque étape atteinte |
| `raisonPerdue`, `raisonPerdueDetail` | Raison si perdue | string | si statut `perdue` | Prix, Pas le moment, Pas de besoin, Concurrent, Sans réponse, Autre |
| ~~`dateReveil`~~ | (supprimé le 22/10/2026 avec la pause) | | | un ancien champ est effacé au prochain changement de l'affaire |
| `encaissements` | Encaissements | liste de {date, montant, offreId} | auto | ajouté quand l'affaire passe en `facture_payee` |
| `documents` | Documents | liste de {libelle, url} | non | liens Google Drive |
| `projetId` | | string ou null | réservé | pour la version 2.1 (Projets) ; toujours vide en 2.0 |
| `archive` | | boolean | auto | vrai en `facture_payee` |
| `proprietaire`, `creeLe`, `modifieLe`, `creePar`, `modifiePar` | | | auto | |

### 3.5 Collection `crm_activites` (ce qui est à faire, ou fait)

| Champ | Libellé | Type | Obligatoire | Règle |
|---|---|---|---|---|
| `type` | Type | string | **oui** | `appel`, `rendez_vous`, `email`, `tache` |
| `titre` | Titre | string | **oui** | prérempli selon le type ("Appel", "Rendez vous", "Email", "Tâche") ; on peut le garder tel quel |
| `date` | Date | date | **oui** | défaut : aujourd'hui ; boutons de date rapide (section 5) |
| `heure` | Heure | string | non | `HH:MM` |
| `fait` | Fait | boolean | auto | faux à la création |
| `dateFait` | | timestamp | auto | renseignée par le bouton "Fait" |
| `personneId`, `organisationId`, `affaireId` | | string | non | voir 3.1.4 |
| `auteur`, `creeLe` | | | auto | |

### 3.6 Collection `crm_notes`

`texte` (string, **obligatoire**), `personneId`, `organisationId`, `affaireId` (voir 3.1.4), `auteur`, `creeLe`, `modifieLe`. Une note se modifie et se supprime ; le texte n'est **jamais** modifié par une action automatique.

### 3.7 Collection `crm_evenements` (journal automatique)

`type`, `texte` (phrase lisible), `personneId`, `organisationId`, `affaireId`, `auteur`, `date` (timestamp). Types : `personne_creee`, `organisation_creee`, `affaire_creee`, `etape_changee`, `affaire_gagnee`, `affaire_perdue`, `affaire_en_pause` (anciens événements, encore affichés ; plus créé depuis le 22/10/2026), `affaire_rouverte`, `activite_faite`, `email_envoye`, `encaissement`, `opposition`. Le journal n'enregistre **pas** chaque modification de champ (pour limiter les écritures). Limité à 500 lignes affichées par fiche (les plus récentes).

### 3.8 Collection `crm_parametres` (un document par réglage)

1. `offres` : `{ items: [{id, nom, actif, ordre}] }`, départ : Audit, Accompagnement.
2. `listes` : `{ secteurs: [...], sources: [...] }`, départ : secteurs Commerce local, Artisanat, Services, Bien être, Conseil, Associatif, Autre ; sources Réseau personnel, Réseau entrepreneuses, Commerçant local, LinkedIn, Recommandation, Événement, Flyer, Autre.
3. `etiquettes` (nouveau) : `{ items: [{id, nom, couleur, ordre}] }`, départ : Prospect chaud, Réseau entrepreneuses, Commerçant local, Partenaire. Création à la volée depuis n'importe quel champ Étiquettes.
4. `filtres` : `{ items: [{id, nom, liste, criteres, ordre}] }` (`liste` : `personnes` ou `affaires`), départ en section 9.
5. `reglages` : `{ delaiPaiementJours: 30, debutActivite: "2026-10", dernierExport: null }`.

Au premier lancement, l'appli crée les documents manquants avec ces valeurs de départ (comme la version 1.0.0).

### 3.9 Collections communes à l'OS

Inchangées : `os_objectifs` et `os_objectifs_saisies` (voir section 6).

### 3.10 Intégrité des liens (appliquée par le code, testée)

Firestore ne vérifie pas les liens entre documents ; c'est le code qui les garantit :
1. on **archive** au lieu de supprimer (case "Archivé", filtre pour les voir) ;
2. **supprimer une organisation** qui a encore des personnes ou des affaires est refusé : l'appli propose de l'archiver ou de détacher d'abord ses personnes ;
3. **supprimer une personne** qui a des affaires demande de choisir : supprimer aussi ses affaires et leurs activités, notes et événements, ou les conserver rattachées à son organisation seule ;
4. **suppression définitive** : confirmation en tapant le nom (comparé sans accents ni casse) ;
5. détacher une personne de son organisation ne supprime rien ; ses affaires gardent leur `organisationId` tant qu'on ne le change pas.

### 3.11 Anciennes données

La collection `crm_prospects` de la version 1.0.0 **n'est ni lue, ni modifiée, ni supprimée** par la version 2.0. On repart de zéro sur les données : Jérôme supprimera lui même `crm_prospects` dans la console Firebase quand il le souhaitera. Les règles Firestore (jokers sur tout le document) couvrent déjà les nouvelles collections : **aucune modification de `firestore.rules`**.

## 4. Pipeline des affaires

1. **Étapes du Kanban** (ordre, id, couleur, inchangées depuis la version 1.0.0) :
   1. Premier contact, `premier_contact`, gris lilas `#b9adc9` ;
   2. Rendez vous fixé, `rdv_fixe`, lilas `#e3cdee` ;
   3. Proposition envoyée, `proposition_envoyee`, violet clair `#b98ee0` ;
   4. Gagné, `gagne`, jaune `#ecbc06` ;
   5. Facture envoyée, `facture_envoyee`, corail `#fd6455` ;
   6. Facture payée, `facture_payee`, vert `#3fbf7f`.
2. **Statut dérivé de l'étape**, calculé par `logique.js` à chaque changement et enregistré dans `statut` :
   1. étapes 1 à 3 : `ouverte` ;
   2. étapes 4 à 6 : `gagnee` ;
   3. **Perdue** est un statut posé explicitement (boîte de dialogue) : il exige une raison. Il n'y a pas de pause (décision de Jérôme, 22/10/2026) : pour relancer plus tard, on planifie une activité ;
   4. une affaire **perdue conserve la dernière étape atteinte** (on peut ainsi mesurer où on perd les affaires) ;
   5. "Rouvrir" une affaire perdue la remet en statut dérivé de son étape et efface la raison.
3. **Facture payée** : ajoute un encaissement `{date, montant, offreId}` (montant de l'affaire, modifiable dans la boîte de dialogue), met `archive = true` après l'animation ; l'affaire disparaît du Kanban, reste dans la vue Archives et dans les statistiques. Un bouton "Nouvelle affaire" sur la fiche de la personne en crée une autre (rien n'est effacé).
4. **Sorties** : plus de colonne « Perdues » dans le Kanban depuis le 22/10/2026 (filtres de la liste). Il n'y a plus de pause ni de « Reprendre contact » : pour relancer plus tard, on planifie une activité.
5. **Glisser déposer** dans tous les sens, y compris en arrière ; sur téléphone, menu "Déplacer vers…" sur la carte.
6. **Pastille d'activité** sur chaque carte et chaque ligne de liste : rouge si une activité non faite est en retard, verte si une activité est prévue (aujourd'hui ou plus tard), grise s'il n'y en a aucune. Tri par défaut du Kanban : "Activité suivante" (la plus proche d'abord, les retards en tête).
7. **"Sans action prévue"** : affaire `ouverte` ou `gagnee` non archivée, sans aucune activité non faite.
8. **Suggestions douces** au changement d'étape : une petite boîte préremplie, que l'on peut valider, modifier ou fermer sans rien changer. Valider **crée une activité planifiée** :
   1. vers Proposition envoyée : tâche "Relancer la proposition", +3 jours ;
   2. vers Gagné : tâche "Envoyer la facture", aujourd'hui ;
   3. vers Facture envoyée : tâche "Vérifier le paiement", +`delaiPaiementJours` (30 par défaut, réglable).

## 5. Activités, notes, historique

1. **Activité** : un type (Appel, Rendez vous, Email, Tâche), un titre prérempli, une date (aujourd'hui par défaut), une heure facultative. Boutons de date rapide : Demain, +3 jours, +1 semaine, +2 semaines, et sélecteur de date. Elle se crée depuis l'onglet **Activité** d'une fiche (zone "Clique ici pour ajouter une activité…") ou depuis une suggestion.
2. **Fait** : bouton sur chaque activité. Renseigne `fait` et `dateFait`, ajoute un événement `activite_faite`, puis ouvre directement le choix de l'activité suivante (ignorable). Un rendez vous marqué fait compte pour l'objectif "Rendez vous tenus".
3. **Notes** : onglet **Notes** d'une fiche, fil de notes datées et signées (Jérôme ou Charles), texte libre long. Remplace les "Notes" et "Notes rapides" de la version 1.0.0. La dictée du clavier du téléphone fonctionne dans la zone de saisie. Une note s'enregistre au bouton "Ajouter" ; elle se modifie et se supprime ensuite.
4. **Points clés** (haut de la colonne de droite d'une fiche) : d'abord les **notes épinglées** (cartes jaunes, texte coupé à 3 lignes, bouton « Développer tout » / « Réduire tout » ; on épingle depuis la note dans l'Historique, la note épinglée reste aussi dans l'Historique ; l'épingle est sur la note : elle se voit sur toutes les fiches où la note apparaît), puis les activités non faites de la fiche, les plus proches d'abord ; en retard en rouge, aujourd'hui en vert. Sans activité à faire : « Aucune activité à faire. »
5. **Historique** : fil unique, du plus récent au plus ancien, mêlant activités faites, notes et événements ; filtres en pastilles : Tous, Activités, Notes, Affaires, Événements ; limité aux 500 lignes les plus récentes.
6. **Email** : bouton "Écrire un email" (lien `mailto:` avec l'adresse de la personne), désactivé s'il n'y a pas d'email ou si l'opposition à la prospection est cochée. À côté, "Email envoyé" ajoute un événement `email_envoye`. Pas de modèles d'email (plus tard).
7. Aucun rappel hors de l'appli.

## 6. Accueil et objectifs

### 6.1 Objectifs mensuels

| Objectif | Type | Calcul (mois civil, fuseau Europe/Paris) | Cible |
|---|---|---|---|
| Interviews JTBD réalisées | calculé | personnes avec `dateInterviewJtbd` dans le mois | 10 |
| Nouveaux contacts | calculé | personnes avec `creeLe` dans le mois | 10 |
| Rendez vous tenus | calculé | activités `rendez_vous` avec `dateFait` dans le mois | 4 |
| Propositions envoyées | calculé | affaires avec `datesEtapes.proposition_envoyee` dans le mois | 3 |
| Chiffre d'affaires encaissé | calculé | somme des `encaissements.montant` datés du mois, sur toutes les affaires | 1 000 € |
| Flyers distribués | manuel | valeur de `os_objectifs_saisies` du mois, boutons +1, +10 et saisie directe | 100 |

1. Chaque objectif : libellé, valeur / cible, barre de progression en couleur animée au chargement, compteur qui défile.
2. Cibles, libellés, couleurs, ordre et activation modifiables dans Réglages ; ajout d'objectifs **manuels** depuis Réglages (les objectifs calculés sont fixés dans le code, dans une liste facile à étendre).
3. Sélecteur de mois pour voir les mois précédents.
4. Objectif atteint (passage sous puis au dessus de 100 % pendant la session) : célébration (section 10.5).

### 6.2 Accueil

1. Objectifs du mois (6.1).
2. **Points clés** en trois groupes, avec bouton "Fait" en ligne : **En retard** (activités non faites dont la date est passée), **Aujourd'hui** (activités du jour), **Sans action prévue** (7 de la section 4, avec bouton "Planifier"). Quand tout est fait : félicitation de Charles.
3. **Graphique du chiffre d'affaires encaissé, depuis le début de l'activité** : il part du mois `reglages.debutActivite` (**octobre 2026**) et n'affiche que les mois écoulés depuis ce début, **jusqu'à 6 mois** ; la fenêtre ne glisse qu'ensuite. Aucun mois antérieur au début n'est jamais montré (pas de rangée de zéros). Au premier mois, une seule barre.
4. Statistiques : nombre d'affaires par étape (barres), toutes affaires comprises.
5. Rappel d'export : si `dernierExport` date de plus de 30 jours ou n'existe pas, message "Pense à ta sauvegarde mensuelle" avec bouton Exporter.
6. Ajout rapide : le bouton "+" de la barre supérieure (section 7).

## 7. Écrans

Modèle : les écrans de Pipedrive (voir `docs/pipedrive-reference.md`), avec le vocabulaire et l'identité de Chevalier IA. Textes en français, tutoiement.

### 7.1 Principes de saisie

1. **Un seul champ obligatoire** : le nom d'une personne ou d'une organisation, le titre d'une affaire, le texte d'une note. Aucun astérisque, aucune phrase "champs obligatoires".
2. **Pas de formulaire en sections** ("Identité", "Suivi"…). La fenêtre de création ne montre que quelques champs ; **tout le reste se complète sur la fiche**.
3. **Sur les fiches, une donnée vide s'affiche comme un "+ Ajouter…" discret** (esprit des propriétés "Vide" de Notion) ; un clic ouvre le champ. **Chaque champ s'enregistre dès qu'on le quitte**, sans bouton "Enregistrer" sur les fiches.
4. Valeurs par défaut sensées pour tout ce qu'on ne demande pas (étape, priorité, rôle, date, propriétaire).
5. Le curseur est **déjà dans le premier champ** à l'ouverture d'une fenêtre de création ; Entrée enregistre.
6. Zones tactiles d'au moins 44 px sur téléphone.

### 7.2 Navigation

1. **Menu latéral** (section 10.3) : Accueil, Personnes, Organisations, Affaires, Réglages. Pas d'entrée Projets en 2.0.
2. **Barre supérieure** : recherche globale (section 9), bouton **"+"** avec trois entrées : Personne, Organisation, Affaire.
3. Routes : `#/crm/accueil` (défaut), `#/crm/personnes`, `#/crm/personnes/<id>`, `#/crm/organisations`, `#/crm/organisations/<id>`, `#/crm/affaires`, `#/crm/affaires/<id>`, `#/reglages`.

### 7.3 Fenêtres de création

1. **Ajouter une personne** : **Nom** (obligatoire), **Organisation** (champ intelligent : choisir une existante ou "Créer « … »"), **Téléphone** et **Email** (chacun avec un type Travail / Perso et un lien "+ Ajouter un numéro" / "+ Ajouter une adresse email"), **Étiquettes** (champ intelligent à choix multiple). Boutons **Annuler** et **Enregistrer**. Le propriétaire est le compte connecté et n'est pas demandé. Un bandeau signale un doublon (section 8.3).
2. **Ajouter une organisation** : **Nom** (obligatoire), Étiquettes, Adresse. Boutons Annuler et Enregistrer.
3. **Ajouter une affaire** : **Titre** (prérempli), **Personne** (champ intelligent, prérempli quand on vient d'une fiche), Organisation (déduite de la personne, modifiable), **Montant**. Étape, priorité et statut sont posés automatiquement.
4. Après l'enregistrement : retour à la liste avec un message "Ajouté" et un lien "Ouvrir la fiche" ; depuis la fiche d'une personne, l'affaire créée apparaît dans sa section Affaires.

### 7.4 Listes (Personnes, Organisations)

1. En tête : compteur ("9 contacts"), bouton vert **"+ Personne"** (ou "+ Organisation"), recherche et filtres de la liste.
2. **Personnes** : colonnes Nom, Organisation, Email, Téléphone, Étiquettes. **Organisations** : Nom, Ville, Secteur, Personnes (nombre), Affaires en cours, Étiquettes. Choix des colonnes par un bouton engrenage ; tri par clic sur l'en tête. Menu "⋯" par ligne : Ouvrir, Archiver, Supprimer.
3. Clic sur une ligne : ouvre la fiche. Email et téléphone cliquables.
4. Sur ordinateur : tableau dense. Sur téléphone : cartes aérées (nom, organisation, étiquettes, email et téléphone en liens).
5. Filtre "Archivés" pour retrouver ce qui a été archivé.

### 7.5 Fiche personne

1. **En tête** : propriétaire (modifiable), avatar, nom en grand (modifiable), bouton vert **"+ Affaire"**, menu "⋯" (Archiver, Supprimer définitivement).
2. **Colonne de gauche**, en sections repliables :
   1. **Résumé** : étiquettes, email (avec son type), téléphone, organisation ; chaque donnée absente est un "+" discret ;
   2. **Détails** : prénom, nom de famille, rôles, interview JTBD faite le, ville, LinkedIn, site web, source, opposition à la prospection ;
   3. **Organisation** : l'organisation liée (lien) ou "+ Organisation" ;
   4. **Affaires** : affaires en cours en cartes (titre, montant, barre de progression par étape), "Voir toutes les affaires" (gagnées, perdues, archivées) ;
   5. boutons "Écrire un email" et "Email envoyé" (5.6).
3. **Colonne de droite** : onglets **Activité** et **Notes** avec leur zone de saisie ; **Points clés** ; **Historique** (filtres : Tous, Activités, Notes, Affaires, Événements).
4. **Sur téléphone** : une seule colonne, dans l'ordre : en tête, Résumé, Activité et Notes, Points clés, Affaires, Organisation, Détails, Historique.

### 7.6 Fiche organisation

Même principe. Colonne de gauche : **Résumé** (étiquettes, adresse, site web), **Détails** (secteur, taille, ville), **Personnes** (liste, "+ Personne"), **Affaires** (toutes celles de l'organisation et de ses personnes). Colonne de droite : Activité, Notes, Points clés, Historique.

### 7.7 Fiche affaire

1. **En tête** : titre (modifiable), montant (modifiable), personne et organisation (liens), **barre des 6 étapes** (clic sur une étape = changement d'étape, avec la suggestion douce de 4.8), bouton **Perdue** (boîte de la section 4 ; on gagne une affaire avec la liste « Étape »), menu "⋯" (Archiver, Rouvrir, Supprimer définitivement).
2. **Colonne de gauche** : **Résumé** (personne, organisation, offre, priorité, statut), **Détails** (besoin identifié, durée en jours, source), **Encaissements** (liste ; en statut gagné, bouton "Ajouter un encaissement"), **Documents** (liens Drive : libellé et URL).
3. **Colonne de droite** : Activité, Notes, Points clés, Historique.
4. Sur téléphone : une seule colonne, en tête avec barre d'étapes défilante.

### 7.8 Affaires

1. Barre : compteur ("6 affaires"), bouton vert **"+ Affaire"**, bascule de vue **Kanban / Liste / Archives**, tri ("Trier par : Activité suivante"), recherche et filtres (section 9).
2. **Kanban** : 6 colonnes, chacune avec son **total en euros et son nombre d'affaires** ; carte : titre, organisation, personne, montant, priorité, pastille d'activité (4.6), badge "En retard" le cas échéant ; plus de colonne Perdues (supprimée le 22/10/2026), plus de pause. "Facture payée" n'affiche que les affaires payées du mois en cours (les autres sont archivées).
3. **Liste** : tableau (Titre, Personne, Organisation, Étape, Montant, Priorité, Prochaine activité) ; compact sur ordinateur, cartes sur téléphone ; export CSV des affaires filtrées.
4. **Archives** : affaires archivées (payées, ou archivées à la main).

### 7.9 Réglages

Offres, secteurs, sources, étiquettes (ajouter, renommer, colorer, retirer), filtres enregistrés (renommer, supprimer), objectifs (section 6.1), délai de paiement (`reglages.delaiPaiementJours`), **début d'activité** (`reglages.debutActivite`, mois), thème (sombre / clair), bouton **Exporter mes données** (section 12).

### 7.10 Disposition selon la taille d'écran

**Ordinateur (à partir de 1024 px)**, à égalité avec le téléphone :
1. menu latéral replié (64 px) ou élargi (240 px) ;
2. fiches en **deux colonnes** (sections repliables à gauche ; Activité, Notes, Points clés et Historique à droite) ;
3. fenêtres de création **centrées** (pas en plein écran) ;
4. listes en **tableaux denses** triables, colonnes au choix, survol, menu "⋯" par ligne ;
5. Kanban des affaires **pleine largeur**, toutes les colonnes visibles, glisser déposer à la souris, défilement horizontal seulement si nécessaire ;
6. **raccourcis clavier** : `n` ouvre "+" (Personne), `/` place le curseur dans la recherche globale, `Échap` ferme une fenêtre ou une liste de suggestions, flèches haut et bas et Entrée dans les champs intelligents ; les raccourcis sont inactifs quand le curseur est dans un champ de texte ;
7. recherche globale toujours visible dans la barre supérieure.

**Tablette (768 à 1023 px)** : une colonne, menu replié. **Téléphone (moins de 768 px)** : une colonne, fenêtres de création en plein écran, recherche derrière une icône, menu en panneau par dessus le contenu (10.3).

## 8. Champs de saisie intelligents

Composant commun `champIntelligent` (dans `js/os/ui.js`), à ne pas dupliquer. Il remplace les listes déroulantes classiques partout où l'on choisit parmi des valeurs existantes : **Organisation, Personne, Ville, Secteur, Source, Étiquettes**, et la recherche globale.

1. **Suggestions dès 2 lettres** : l'appli propose toutes les valeurs **existantes qui contiennent** ces lettres **n'importe où** dans leur texte, sans tenir compte des accents ni des majuscules. Exemple : "ar" propose "Marie Durand", "Charles Martin" et "Bar des Arts". Pour une personne, la recherche porte aussi sur l'organisation et l'email.
2. **Classement** : d'abord les valeurs dont un mot commence par la saisie, puis les autres ; **8 résultats au plus** ; les lettres trouvées sont affichées en gras ; chaque résultat montre un sous titre utile (organisation d'une personne, ville d'une organisation).
3. **Dernière ligne "Créer « texte »"** : crée la valeur à la volée sans quitter le formulaire (nouvelle organisation, nouvelle étiquette, nouvelle ville…). Elle n'apparaît pas si une valeur identique existe déjà.
4. **Détection de doublons** à la création d'une personne : si le nom saisi (même texte, sans accents ni casse) ou un email correspond à une personne existante, un bandeau "Cette personne existe déjà" s'affiche avec un lien vers sa fiche, et le bouton Enregistrer reste disponible ("Créer quand même"). Même contrôle pour une organisation de même nom.
5. **Accessibilité et usage** : rôle `combobox` avec liste `listbox` ; flèches haut et bas, Entrée pour choisir, Échap pour fermer ; sur téléphone, liste sous le champ, lignes de 44 px, le clavier ne masque jamais la liste.
6. **Choix multiple** (Étiquettes) : les valeurs choisies s'affichent en pastilles supprimables dans le champ.
7. **Logique pure testée** : `rechercherSuggestions(texte, elements, options)` dans `logique.js` (normalisation, sous chaîne, classement, limite, option "Créer") ; le composant ne fait qu'afficher le résultat.

## 9. Recherche et filtres

1. **Recherche globale** (barre supérieure) : champ intelligent qui cherche dans les personnes (nom, email, organisation), les organisations (nom, ville) et les affaires (titre) ; résultats **groupés** (Personnes, Organisations, Affaires), 8 par groupe au plus ; Entrée ouvre le premier résultat.
2. **Recherche d'une liste** : filtre instantané dans la liste affichée, mêmes règles de normalisation.
3. **Filtres combinables** :
   1. personnes : étiquette, organisation, rôle, source, ville, interview JTBD faite ou non, archivées ;
   2. organisations : étiquette, secteur, ville, archivées ;
   3. affaires : étape, statut, priorité, offre, source, en retard, sans action prévue, personne, organisation.
4. Les filtres actifs s'affichent en pastilles supprimables ; bouton "Tout effacer".
5. **Filtres enregistrés** (personnes et affaires, chacun rattaché à sa liste), tous modifiables, renommables et supprimables ; bouton "Enregistrer ce filtre". Départ :
   1. À relancer cette semaine (activité prévue d'ici dimanche, retards inclus) ;
   2. Chaudes (priorité chaud, non archivées) ;
   3. Réseau entrepreneuses (source Réseau entrepreneuses) ;
   4. Interviews JTBD à faire : filtre de la liste des **personnes** (rôle interview_jtbd, date vide).

## 10. Charte graphique appliquée

Source : le site chevalier-ia.fr (`styles.css`, `tally-merci.html`, dossier `assets`). Tous les fichiers de marque sont repris tels quels (portraits, logo, polices) ; Charles n'est jamais redessiné.

1. **Polices** (fichiers locaux du site, aucune requête externe) : Poppins 500 et 700 pour les titres (interlettrage `-0.03em`), Be Vietnam Pro 400, 500, 600, 700 pour le texte. Étiquettes en capitales espacées (`letter-spacing: .14em`, 11 px) comme sur le site.
2. **Couleurs** (variables CSS définies une seule fois) :
   1. marque : jaune `#ecbc06` (actions, entrée active du menu, focus), violet `#341363`, lilas `#e3cdee`, ink `#29292c`, ink2 `#36353a`, papier `#f5f5f3`, warm `#efeee9`, ligne `#dcdcd6`, gris `#69696d` ;
   2. **thème sombre (défaut)** : fond `#1b1a1e`, panneaux `#29292c`, survol `#36353a`, texte `#ffffff`, texte secondaire `#c3c1c1`, bordures `#ffffff1a`, halo violet radial discret en haut de page ;
   3. **thème clair** : fond `#f5f5f3`, panneaux `#ffffff`, texte `#29292c`, secondaire `#69696d`, bordures `#dcdcd6` ;
   4. priorités : chaud corail, tiède jaune, froid gris ;
   5. retard : rouge doux lisible dans les deux thèmes ; contraste texte / fond au moins 4,5:1.
3. **Menu latéral** (façon console Firebase) : replié par défaut à 64 px (icônes seules, info bulle au survol) ; bouton pour l'élargir à 240 px (icône + libellé) ; état mémorisé sur l'appareil. En haut : baguette et "Chevalier IA OS". Entrées : Accueil, Personnes, Organisations, Affaires, Réglages (section 7.2). La barre supérieure du contenu porte la recherche globale et le bouton "+". En bas : bascule de thème, avatar et nom du compte, Se déconnecter. Sur téléphone (moins de 768 px) : barre supérieure avec bouton menu, panneau par dessus le contenu. Icônes : Lucide (SVG intégrés dans le code).
4. **Écran de connexion** : fond radial violet de `tally-merci.html`, Charles flottant entre deux orbites, titre "Chevalier IA OS", bouton jaune "Se connecter avec Google". Compte refusé : message "Accès refusé : ce compte n'est pas autorisé", déconnexion immédiate.
5. **Célébrations** (reprise du canvas de feu d'artifice de `tally-merci.html`, couleurs `#ecbc06`, `#ffe56c`, `#e3cdee`, `#ffffff`, `#b98ee0`), durée 2 à 3 s, clic pour fermer, désactivées si `prefers-reduced-motion` :
   1. affaire passée en Gagné : grand feu d'artifice et Charles au centre "Bravo Jérôme !" ;
   2. Facture payée : compteur du chiffre d'affaires qui défile et pluie d'étincelles jaunes ;
   3. objectif atteint : feu d'artifice et "Objectif atteint : <libellé>" ;
   4. dernière action du jour faite : petite animation de Charles "Tout est fait pour aujourd'hui".
6. **États vides** : Charles en petit avec un message ("Aucune relance aujourd'hui, Charles veille", "Ajoute ta première personne").
7. **Animations** : cartes du Kanban qui glissent (transition 200 ms), barres qui se remplissent, compteurs qui défilent ; rien de bloquant.

## 11. Architecture et sécurité

1. **Code** : HTML, CSS et JavaScript en modules ES, **sans étape de compilation** pour l'appli. SDK Firebase **12.19.0** chargé depuis `https://www.gstatic.com/firebasejs/12.19.0/…` (version figée).
2. **Hébergement** : Firebase Hosting, projet `chevalier-ia-os`, adresse `https://chevalier-ia-os.web.app`. Dépôt GitHub privé `jeromechevalier-wq/chevalier-ia-os`, branche `main` ; action GitHub officielle `FirebaseExtended/action-hosting-deploy` à chaque push sur `main` (canal `live`, secret `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS`). Version 2.0 sur plan gratuit Spark (aucune Cloud Function, aucun Cloud Storage) ; **depuis l'étape 2 du serveur MCP (03/10/2026), forfait Blaze avec budget d'alerte de 5 € par mois et une Cloud Function `mcp`** (dossier `functions/`, jamais publié avec le site ; voir `plan-mcp.md`). L'appli elle-même n'utilise toujours ni Cloud Function ni Cloud Storage.
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
4. **Règles Firestore** (`firestore.rules`). Inchangées de la version 1.0.0 à la version 2.0 ; **étendues le 03/10/2026 (étape 4 du serveur MCP, `plan-mcp.md` 5.5), puis le 04/10/2026 (audit des actions de l'écran, `audit-ecran.md`)** : les trois collections du serveur (`crm_audit`, `crm_audit_avant`, `mcp_limites`) sont sorties du joker ; l'appli lit le journal et ses copies et peut y **ajouter** les lignes de ses propres actions, sans jamais les modifier ni les supprimer. Pour toutes les autres collections, le comportement est identique à celui d'avant. Le serveur écrit avec le SDK d'administration, qui contourne les règles : il n'en dépend pas. Un nouvel utilisateur s'ajoute à `compteAutorise()` ici **et** dans `COMPTES_AUTORISES` (section suivante), puis les règles sont republiées par Jérôme dans la console (elles ne se déploient pas avec la fusion).
   ```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function compteAutorise() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in [
             "jerome.chevalier@gmail.com",
             "jeromebot.chevalierbot@gmail.com"
           ];
    }

    // Journal d'audit : lisible depuis l'appli. L'appli peut y AJOUTER les lignes de ses propres actions (canal « ecran », à son
    // nom), jamais les modifier ni les supprimer. Le serveur MCP écrit avec le SDK d'administration, qui contourne les règles.
    match /crm_audit/{id} {
      allow read: if compteAutorise();
      allow create: if compteAutorise()
        && request.resource.data.via == 'ecran'
        && request.resource.data.acteur == request.auth.token.email;
      allow update, delete: if false;
    }

    // Copies « avant / après » (effacées après 90 jours) : lisibles par l'appli (écran Journal), ajout seul depuis l'appli.
    match /crm_audit_avant/{id} {
      allow read: if compteAutorise();
      allow create: if compteAutorise() && request.resource.data.expireAt is timestamp;
      allow update, delete: if false;
    }

    // Compteurs de débit : réservés aux fonctions.
    match /mcp_limites/{id} {
      allow read, write: if false;
    }

    // Autorisations OAuth (connexion de Claude sur le téléphone) : empreintes de jetons, réservées aux fonctions.
    match /mcp_oauth/{id} {
      allow read, write: if false;
    }

    // Clés de la porte des workflows n8n (empreintes SHA-256, jamais les clés) : réservées aux fonctions. Aucun navigateur n'y a accès.
    match /plateforme_cles/{id} {
      allow read, write: if false;
    }

    // Tableau de bord : l'écran LIT (les deux comptes autorisés), mais n'écrit jamais lui-même. Les relevés viennent de la porte du tableau de bord (scripts GitHub)
    // et les saisies passent par une fonction serveur qui les journalise : aucune écriture depuis un navigateur.
    match /tableaudebord_indicateurs/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }
    match /tableaudebord_releves/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }
    match /tableaudebord_demandes/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // File « À valider » des automatisations : l'écran LIT (les deux comptes autorisés), les écritures passent par la porte et la fonction de validation (serveur).
    match /automatisations_propositions/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // Devis (module Devis, 24/10/2026). L'appli lit les devis et peut créer un BROUILLON neuf (sans numéro, version 1), puis le modifier TANT QU'IL RESTE un brouillon
    // (avant ET après), sans toucher à son numéro, sa racine, sa version, son statut ni sa date de finalisation. Finaliser, marquer envoyé, signer, refuser, créer la version
    // suivante et archiver passent par les fonctions du serveur (devisFinaliser…), qui contournent les règles. Aucune suppression depuis un navigateur (jamais une version finalisée).
    // Le compteur des numéros est réservé au serveur : ni lecture ni écriture.
    function devisBrouillonNeuf(id) {
      let d = request.resource.data;
      return d.get('statut', '') == 'brouillon' && d.get('numero', null) == null && !('finaliseLe' in d)
        && d.get('racineId', '') == id && d.get('version', 0) == 1;
    }
    function devisBrouillonModifie() {
      return resource.data.get('statut', '') == 'brouillon' && request.resource.data.get('statut', '') == 'brouillon'
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['numero', 'racineId', 'version', 'statut', 'finaliseLe']);
    }
    match /devis_devis/{id} {
      allow read: if compteAutorise();
      allow create: if compteAutorise() && devisBrouillonNeuf(id);
      allow update: if compteAutorise() && devisBrouillonModifie();
      allow delete: if false;
    }
    match /devis_compteurs/{id} {
      allow read, write: if false;
    }
    // Le bordereau du module Devis : un article se désactive, il ne se supprime jamais.
    match /devis_articles/{id} {
      allow read, create, update: if compteAutorise();
      allow delete: if false;
    }
    // Journal des demandes « Préparer l'e-mail » d'un devis (anti-doublon, identifiants, statuts) : écrit par le SERVEUR seulement
    // (fonction devisPreparerEmail, porte devis.noterEmailPrepare), aucun écran ne le lit. Ni lecture ni écriture depuis un navigateur (25/10/2026).
    match /crm_actions_lancements/{id} {
      allow read, write: if false;
    }

    // Fiches des fichiers déposés dans l'onglet « Documents » (28/10/2026) : les comptes autorisés LISENT ; l'écriture est réservée au SERVEUR (fonctions documentDeposer,
    // documentSupprimer, outils MCP), jamais au navigateur : sinon on pourrait y inscrire un chemin quelconque du stockage, que documentLien signerait ensuite.
    match /documents_stockes/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // « Ensembles qui reviennent » du module Devis (cadrage devis fluide, 4.4 ; 30/10/2026) : un document par ensemble, calculé de nuit par le SERVEUR (écriture par le moteur d'audit).
    // Les comptes autorisés LISENT (écran de revue) ; aucune écriture depuis un navigateur : une seule porte, le serveur. Même motif que documents_stockes.
    match /devis_habitudes/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // Dictionnaire de vocabulaire du module Devis (28/10/2026) : une règle « expression du client -> article ». Le SERVEUR apprend (compteurs, origine « apprise_* », exemples,
    // dates de confirmation) et contourne les règles ; le NAVIGATEUR ne peut que créer une règle MANUELLE (compteurs à zéro, sans conflit) puis la réviser (statut, article, note, conflit, validation humaine : valideLe, validePar, revoirLe, suggestionTraiteeLe).
    // Jamais de suppression : une règle se désactive. Passer « a_confirmer » à « active » est permis (c'est le but de la revue). Le serveur pose « via » à la création ; l'écran ne le modifie pas
    // (gardé dans la liste des clés permises).
    // Cibles d'un mot (cadrage vocabulaire-cibles, 30/10/2026) : une liste de 8 éléments au plus { genre: article|famille, id, libelle }. Un mot qui a des cibles n'a PAS d'article
    // (articleId vide) : un ancien moteur le saute au lieu d'appliquer « le premier » d'un « au choix ». Les règles n'ont pas de boucle : on contrôle les 8 positions une à une.
    function cibleValide(c) {
      return c is map && c.keys().hasOnly(['genre', 'id', 'libelle'])
        && c.get('genre', '') in ['article', 'famille']
        && c.get('id', '') is string && c.get('id', '').size() >= 1 && c.get('id', '').size() <= 100
        && c.get('libelle', '') is string && c.get('libelle', '').size() <= 120;
    }
    function ciblesValides() {
      let l = request.resource.data.cibles;
      return l is list && l.size() <= 8
        && (l.size() < 1 || cibleValide(l[0])) && (l.size() < 2 || cibleValide(l[1])) && (l.size() < 3 || cibleValide(l[2])) && (l.size() < 4 || cibleValide(l[3]))
        && (l.size() < 5 || cibleValide(l[4])) && (l.size() < 6 || cibleValide(l[5])) && (l.size() < 7 || cibleValide(l[6])) && (l.size() < 8 || cibleValide(l[7]));
    }
    function ciblesSansArticle() {
      let d = request.resource.data;
      return !d.keys().hasAny(['cibles']) || (d.cibles is list && (d.cibles.size() == 0 || d.get('articleId', '') == ''));
    }
    function vocabulaireManuelNeuf() {
      let d = request.resource.data;
      return d.get('statut', '') in ['active', 'desactivee'] && d.get('origine', '') == 'manuelle'
        && d.get('confirmations', 0) == 0 && d.get('contradictions', 0) == 0 && d.get('conflit', false) == false
        && d.get('exemples', []).size() == 0 && !d.keys().hasAny(['derniereConfirmationLe', 'derniereUtilisationLe', 'suggestion', 'suggestionTraiteeLe'])
        && d.get('validePar', 'humain') == 'humain'
        && (!d.keys().hasAny(['cibles']) || ciblesValides()) && ciblesSansArticle()
        && (!d.keys().hasAny(['valideLe']) || (d.valideLe is string && d.valideLe.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')))
        && (!d.keys().hasAny(['revoirLe']) || (d.revoirLe is string && d.revoirLe.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')));
    }
    function vocabulaireRevise() {
      let d = request.resource.data;
      let touche = d.diff(resource.data).affectedKeys();
      return touche.hasOnly(['statut', 'articleId', 'articleLibelle', 'note', 'conflit', 'modifieLe', 'modifiePar', 'via', 'valideLe', 'validePar', 'revoirLe', 'suggestionTraiteeLe', 'cibles'])
        && d.get('validePar', 'humain') in ['humain', 'reponses']
        && (!touche.hasAny(['cibles']) || ciblesValides()) && ciblesSansArticle()
        && (!touche.hasAny(['valideLe']) || (d.valideLe is string && d.valideLe.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')))
        && (!touche.hasAny(['revoirLe']) || (d.revoirLe is string && d.revoirLe.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')))
        && (!touche.hasAny(['suggestionTraiteeLe']) || (d.suggestionTraiteeLe is string && d.suggestionTraiteeLe.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')));
    }
    match /devis_vocabulaire/{id} {
      allow read: if compteAutorise();
      allow create: if compteAutorise() && vocabulaireManuelNeuf();
      allow update: if compteAutorise() && vocabulaireRevise();
      allow delete: if false;
    }

    // Compteur d'usage des articles du module Devis (cadrage vocabulaire-cibles, 2.9 ; 30/10/2026) : un document par article { articleId, nombre, derniereUtilisationLe }, tenu par le SERVEUR
    // dans la transaction de « finaliser ». Les comptes autorisés LISENT (colonne « Utilisé N fois » du catalogue) ; aucune écriture depuis un navigateur. Exclue du joker ci-dessous.
    match /devis_usage_articles/{id} {
      allow read: if compteAutorise();
      allow write: if false;
    }

    // Tout le reste : comme avant (les deux comptes autorisés), sauf les collections ci-dessus.
    match /{collection}/{document=**} {
      allow read, write: if compteAutorise()
        && !(collection in ['crm_audit', 'crm_audit_avant', 'mcp_limites', 'mcp_oauth', 'plateforme_cles', 'tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes', 'automatisations_propositions', 'devis_devis', 'devis_compteurs', 'devis_articles', 'crm_actions_lancements', 'devis_vocabulaire', 'documents_stockes', 'devis_habitudes', 'devis_usage_articles']);
    }
  }
}
```
5. **Contrôle dans l'interface** : après connexion, si l'email n'est pas dans `COMPTES_AUTORISES` ou n'est pas vérifié, déconnexion immédiate et message d'accès refusé ; aucune donnée n'est demandée avant ce contrôle.
6. **Pas de mode hors ligne en version 2.0** : cache Firestore en mémoire (réglage par défaut, pas de cache persistant). Sans réseau, bandeau "Hors ligne : reconnecte toi pour continuer" ; aucune modification n'est promise hors ligne.
7. **Lectures économes** : un écouteur `onSnapshot` par collection de listes pour toute la session, filtrage et calculs côté navigateur ; requêtes ciblées à l'ouverture d'une fiche pour notes, événements et activités faites (section 3.1.6) ; aucune requête composite, donc aucun index à publier.
8. **PWA sans service worker** : `manifest.webmanifest` (nom "Chevalier IA OS", nom court "Chevalier OS", `display: standalone`, couleurs du thème sombre, icônes 192, 512, maskable, apple touch à partir de la baguette) et balises Apple pour l'installation sur iPhone. **Aucun service worker, aucune mise en cache de fichiers par l'appli.** Version : fichier `version.json` (`{"version": "2.0.0"}`) ; la version chargée est inscrite dans `js/os/version.js` ; à l'ouverture et à chaque retour sur l'onglet, l'appli lit `version.json` (sans cache) et, si elle diffère, affiche le bandeau "Nouvelle version disponible" avec "Recharger". Chaque livraison augmente la version dans les deux fichiers.
9. **En têtes** (`firebase.json`) : `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive ; `Cache-Control: no-cache` pour tous les fichiers `.html`, `.js`, `.css`, `.json` et le manifeste (revalidation à chaque chargement, rien de périmé) ; cache long uniquement pour les polices et les images. `robots.txt` interdit tout. `<meta name="robots" content="noindex">`.
10. **Routage** par ancre : voir la section 7.2 (`#/crm/accueil` par défaut).
11. **Organisation modulaire** : la coquille (`js/os/`) ne connaît les modules que par la liste `js/os/modules.js` (id, libellé, icône, routes, fonction de montage). Ajouter un module = un dossier `js/modules/<nom>/` + une entrée dans cette liste.
12. **Mode test** : si l'appli est servie sur `localhost` avec `?emulateurs=1`, elle se connecte aux émulateurs Firebase (Auth 9099, Firestore 8080) au lieu de la production.

## 12. RGPD et sauvegarde

1. Données hébergées en France (Firestore `europe-west9`, Paris). Accès limité à deux comptes.
2. Conservation : le signalement automatique des personnes sans échange depuis 3 ans est repoussé (il ne servirait pas avant 2029).
3. Bouton "Supprimer définitivement" sur chaque fiche (personne, organisation, affaire), avec les règles d'intégrité de la section 3.10 et la confirmation en tapant le nom.
4. **Opposition à la prospection** : case sur la fiche d'une personne, date enregistrée, badge "Opposition" sur la fiche et dans la liste, boutons "Écrire un email" et "Email envoyé" désactivés.
5. **Exporter mes données** (bouton dans Réglages et dans le rappel de l'Accueil) :
   1. **un fichier JSON** `chevalier-ia-os-AAAA-MM-JJ.json` contenant toutes les collections `crm_*` (chaque document avec son identifiant) : c'est la **sauvegarde complète**, qui enregistre `reglages.dernierExport` ;
   2. **des exports CSV** par liste (Personnes, Organisations, Affaires), depuis le menu "Exporter" de chaque liste : UTF 8 avec BOM, séparateur point virgule (ouverture directe dans Excel en français), libellés de colonnes en français, nombres avec virgule, dates `JJ/MM/AAAA`, personnes et affaires avec le **nom** de leur organisation (pas l'identifiant) ; ils exportent les lignes affichées et ne mettent pas à jour `dernierExport` ;
   3. rappel à l'Accueil quand `dernierExport` date de plus de 30 jours ou n'existe pas.
6. **Copie quotidienne vers un Google Sheet par n8n** : hors de cette construction (version 2.1). Elle servira de filet de sécurité ; Firestore reste la source de vérité.

## 13. Arborescence des fichiers livrés

La coquille de la version 1.0.0 est conservée ; seuls `js/modules/crm/`, leurs styles et leurs tests sont remplacés. Les fichiers marqués (adapté) ne changent que pour les routes, le menu et le composant commun.

```
chevalier-ia-os/
  index.html                  coquille (inchangé)
  manifest.webmanifest        PWA (inchangé)
  version.json                {"version": "2.0.0"}
  robots.txt, firebase.json, .firebaserc, .gitignore
  firestore.rules             INCHANGÉ
  README.md                   mis à jour (adresse, mise en ligne, tests, version 2.0.0)
  css/
    tokens.css, os.css        (inchangés, sauf ajouts nécessaires aux fenêtres et aux suggestions)
    crm.css                   styles du module CRM (réécrits)
  js/
    main.js
    os/
      firebase-config.js, firebase.js, auth.js, router.js, celebrations.js, pwa.js   (inchangés)
      modules.js              entrées du menu : Accueil, Personnes, Organisations, Affaires (adapté)
      shell.js                menu latéral, barre supérieure avec recherche globale et "+" (adapté)
      ui.js                   composants communs, dont champIntelligent (adapté)
      objectifs.js            objectifs communs (adapté : calculs fournis par le module)
      version.js              "2.0.0"
    modules/
      crm/
        index.js              montage, routes, sous menu
        donnees.js            écouteurs Firestore, écritures, intégrité des liens
        logique.js            règles métier pures (statut, retard, suggestions, objectifs, doublons, recherche, export)
        accueil.js            objectifs, Points clés, graphique, statistiques
        personnes.js          liste et création des personnes
        organisations.js      liste et création des organisations
        affaires.js           Kanban, liste, archives, création des affaires
        fiche-personne.js
        fiche-organisation.js
        fiche-affaire.js
        activites.js          activités, notes, historique (composants partagés par les trois fiches)
        reglages.js
        export.js             export JSON et CSV
  assets/                     portraits, logo, polices, icônes PWA (inchangés)
  docs/
    cahier-des-charges-v2.0.md      ce document
    cahier-des-charges.md           version 1.1, historique
    pipedrive-reference.md          écrans de référence
    PROMPT-CONSTRUCTION-v2.0.md     prompt de lancement de la construction (dans docs/ : non publié)
    decisions-construction-v2.md    décisions prises au lancement et pendant la construction
    rapport-construction-v2.md      rapport final
  tests/                      non publiés (ignorés par firebase.json)
    package.json
    regles.test.js, logique.test.js, statique.test.js
    e2e/                      scénarios Playwright
  .github/workflows/firebase-hosting.yml    (inchangé)
```

## 14. Périmètre

1. **Version 2.0** : tout ce qui est décrit dans ce document.
2. **Version 2.1** : écran **Projets** (Kanban de phases Lancement, Découverte, Distribution, Facturation, Clôture ; modèles de projet ; tâches ; lien `projetId` depuis une affaire gagnée) ; **copie quotidienne vers Google Sheet** par n8n.
3. **Plus tard** : import CSV, fusion des doublons, prévisions en euros, envoi direct des emails depuis la fiche (n8n), modèles d'email, mode hors ligne, signalement RGPD après 3 ans, rappels hors de l'appli (email du matin, notification, Google Agenda), tâches confiées à Charles, domaine personnalisé, autres modules de l'OS.
4. **Abandonné** : champs personnalisés, taux de passage entre étapes, étape "Prospects" de Pipedrive (le rôle "prospect" suffit), Cci intelligente, séquences, marketplace, service worker avec mise en cache.

## 15. Critères d'acceptation et protocole de test

L'appli n'est "terminée" que lorsque **tous les tests automatiques passent** et que chaque critère ci dessous est couvert. Les tests tournent sur les émulateurs Firebase, **jamais sur les données réelles** (projet `demo-chevalier-ia-os`, le préfixe `demo-` garantit qu'aucune requête ne peut atteindre la production). Prérequis : Node.js 20 ou plus, Java 21 (émulateurs), `firebase-tools` et Playwright (Chromium) en dépendances de développement dans `tests/`. Commande unique : `cd tests && npm test` (lance les émulateurs, les tests A, B, C et D, puis les arrête). L'outillage de la version 1.0.0 est conservé et adapté.

### 15.1 Tests automatiques (exécutés par l'IA avant livraison)

**A. Règles de sécurité** (`@firebase/rules-unit-testing`, émulateur Firestore) :
1. Jérôme (email vérifié) peut lire, créer, modifier, supprimer dans chacune des collections : `crm_personnes`, `crm_organisations`, `crm_affaires`, `crm_activites`, `crm_notes`, `crm_evenements`, `crm_parametres`, `os_objectifs`, `os_objectifs_saisies`.
2. Charles (email vérifié) : mêmes droits.
3. Un autre compte Google vérifié est refusé en lecture et en écriture sur chaque collection.
4. Un compte autorisé dont l'email n'est pas vérifié est refusé.
5. Un visiteur non connecté est refusé.

**B. Logique métier** (`node --test` sur `logique.js`, sans navigateur) :
1. **Nom** : découpage prénom / nom de famille (deux mots, plusieurs mots, un seul mot, espaces en trop) ; `nom` recalculé après modification.
2. **Doublons** : détection par email (casse, espaces) et par nom (accents, casse) ; aucune alerte pour deux personnes différentes.
3. **Recherche intelligente** : moins de 2 lettres = aucune suggestion ; sous chaîne n'importe où ; accents et casse ignorés ; mots commençant par la saisie classés d'abord ; 8 résultats au plus ; option "Créer" présente seulement si aucune valeur identique ; recherche par email et par organisation pour les personnes.
4. **Statut dérivé** : étapes 1 à 3 donnent `ouverte`, 4 à 6 donnent `gagnee` ; perdue **conserve l'étape** ; réouverture ; raison obligatoire pour perdue ; pas de pause (supprimée le 22/10/2026).
5. **Facture payée** : ajoute un encaissement du bon montant et archive ; "Nouvelle affaire" ne supprime rien.
6. **En retard**, **sans action prévue**, pastille d'activité (rouge, verte, grise) : bornes (aujourd'hui, hier, demain), activités faites ignorées.
7. **Dates rapides** : Demain, +3 jours, +1 semaine, +2 semaines, y compris changement de mois et d'heure d'été.
8. **Suggestions** : activité et date correctes pour chaque étape concernée ; délai de paiement réglable.
9. **Objectifs** : chaque calcul de 6.1 sur un jeu de données de test, bornes du mois en Europe/Paris.
10. **Graphique du chiffre d'affaires** : avec `debutActivite = 2026-10`, en octobre 2026 : **un seul mois** ; en décembre : 3 mois ; en mars 2027 : 6 mois ; en avril 2027 : fenêtre de 6 mois glissante ; **aucun mois avant octobre 2026 n'apparaît jamais** ; changer `debutActivite` change la fenêtre.
11. **Filtres** : chaque filtre seul et combiné, pour personnes, organisations et affaires ; filtres enregistrés de départ.
12. **Intégrité** : suppression d'une organisation avec personnes ou affaires refusée ; suppression d'une personne avec les deux choix (supprimer ses affaires ou les conserver) ; archivage ; confirmation par le nom sans accents ni casse.
13. **Export** : JSON complet (toutes les collections, identifiants présents) ; CSV (BOM, point virgule, guillemets et retours à la ligne échappés, nom de l'organisation et non son identifiant) ; rappel d'export : affiché si aucun export ou export de plus de 30 jours, masqué sinon.

**C. Parcours dans le navigateur** (Playwright + émulateurs, Chromium ; **chaque parcours est rejoué à 1440 × 900 (ordinateur) et à 390 × 844 (téléphone)**, plus un contrôle de mise en page à 1024 px) :
1. Connexion avec Jérôme : arrivée sur l'Accueil, 6 objectifs affichés, graphique du chiffre d'affaires limité aux mois depuis le début d'activité.
2. Connexion avec un compte non autorisé : message d'accès refusé, retour à la connexion, aucune donnée affichée.
3. **Créer une personne en tapant seulement un nom** : enregistrée, visible dans la liste ; la fenêtre s'ouvre avec le curseur dans "Nom" ; Entrée enregistre ; aucun champ obligatoire autre que le nom.
4. **Champ intelligent** : taper 2 lettres propose les organisations existantes qui les contiennent ; choisir l'une ; taper un nom inconnu puis "Créer « … »" crée l'organisation sans quitter la fenêtre.
5. **Doublon** : créer une personne de même nom ou de même email affiche "Cette personne existe déjà" avec lien ; "Créer quand même" fonctionne.
6. Créer une organisation ; la lier à une personne depuis la fiche ; voir la personne dans la fiche de l'organisation.
7. **"+ Affaire"** depuis la fiche d'une personne : titre prérempli, enregistrer sans rien taper ; l'affaire apparaît dans la section Affaires de la personne et dans le Kanban.
8. Glisser une carte de Premier contact à Rendez vous fixé puis revenir en arrière (sur ordinateur à la souris ; sur téléphone par "Déplacer vers…") ; `datesEtapes` et événements à jour.
9. Passer en Proposition envoyée : suggestion affichée ; la fermer ne change rien ; la valider crée l'activité "Relancer la proposition".
10. Passer en Gagné : célébration visible, fermée au clic. Passer en Facture payée : affaire retirée du Kanban, visible dans Archives, objectif chiffre d'affaires augmenté.
11. **Perdue** (raison obligatoire), puis **Rouvrir** (plus de pause depuis le 22/10/2026).
12. Activité : créer, "Fait" (disparaît des Points clés, apparaît dans l'historique, boîte de prochaine activité) ; un rendez vous fait augmente l'objectif "Rendez vous tenus".
13. Notes : ajouter, modifier, supprimer ; une note écrite sur une affaire apparaît aussi dans l'historique de la personne et de l'organisation.
14. Historique : les cinq filtres.
15. Objectif flyers : "+10" met à jour la barre et persiste après rechargement.
16. **Recherche globale** : résultats groupés Personnes, Organisations, Affaires ; Entrée ouvre le premier ; sur ordinateur, `/` donne le focus et `n` ouvre "Ajouter une personne" ; `Échap` ferme.
17. Filtres : combiner deux filtres, enregistrer, renommer, supprimer un filtre enregistré.
18. Réglages : ajouter une étiquette, une offre, une source ; changer le début d'activité et voir le graphique suivre.
19. **Export** : fichier JSON téléchargé contenant toutes les collections ; CSV d'une liste avec le bon nombre de lignes ; le rappel d'export disparaît de l'Accueil.
20. Opposition à la prospection : boutons email désactivés. Supprimer définitivement : confirmation exigée, fiche disparue ; suppression refusée pour une organisation qui a des personnes.
21. Menu : replié par défaut, élargi au clic, état conservé ; sur 390 px, panneau par dessus le contenu. Fiche personne : **deux colonnes à 1440 px, une colonne à 390 px**.
22. Thème : bascule conservée après rechargement. Nouvelle version : modifier `version.json` pendant que l'appli est ouverte, le bandeau "Nouvelle version disponible" apparaît ; hors réseau, le bandeau "Hors ligne" apparaît.
23. **Aucune erreur dans la console du navigateur** sur l'ensemble des parcours ; **aucun défilement horizontal de la page à 390 px** (le défilement horizontal du Kanban à l'intérieur de sa zone est permis).

**D. Contrôles statiques** :
1. `manifest.webmanifest` valide, icônes présentes, aucun service worker, versions identiques à **2.0.0** dans `version.json` et `js/os/version.js`.
2. Aucune ressource chargée hors de `gstatic.com` (SDK Firebase), `googleapis.com` et domaines Google de connexion.
3. `firebase.json` : `tests/`, `docs/`, `README.md` non publiés ; en têtes présents. `firestore.rules` identique à celui de la version 1.0.0.
4. **Aucune requête Firestore composite** dans `donnees.js` : pas de `orderBy` combiné à un `where`, pas deux `where` sur des champs différents.
5. Aucun appel à la collection `crm_prospects`.

### 15.2 Recette manuelle par Jérôme après mise en ligne (environ 10 minutes)

1. Sur le Mac, ouvrir `https://chevalier-ia-os.web.app`, se connecter avec jerome.chevalier@gmail.com.
2. Dans une fenêtre de navigation privée, essayer un autre compte Google : accès refusé.
3. **Chronomètre** : créer une personne en ne tapant que son nom. Elle doit être enregistrée en moins de 10 secondes.
4. Créer une organisation à la volée depuis la fenêtre d'une autre personne, puis retrouver cette organisation en tapant deux lettres.
5. Depuis la fiche d'une personne, "+ Affaire", puis la faire passer jusqu'à Gagné (feu d'artifice) ; archiver ou supprimer les données de test.
6. Sur le téléphone, ouvrir l'adresse, se connecter, installer l'appli sur l'écran d'accueil, créer une personne, ajouter une note dictée.
7. Exporter les données et ouvrir un CSV dans Excel.
8. Se connecter une fois avec le compte de Charles.

## 16. Actions manuelles restantes après la construction

1. Sur GitHub, ouvrir la Pull request `v2` vers `main` (si elle n'a pas été ouverte par la construction) et la fusionner : l'action publie la version 2.0.0 sur `https://chevalier-ia-os.web.app`. Les appareils déjà ouverts affichent "Nouvelle version disponible".
2. Faire la recette manuelle (15.2).
3. Quand tu le souhaites, supprimer la collection `crm_prospects` dans la console Firebase (Firestore Database). L'appli v2 ne l'utilise pas.
4. Rien à changer côté authentification ni règles Firestore.
5. Ensuite : demander la version 2.1 (Projets, copie quotidienne vers Google Sheet par n8n).

## 17. Décisions à confirmer au lancement

Ces points sont tranchés **par défaut** comme indiqué entre crochets. Le prompt de lancement impose de les **soumettre à Jérôme au tout début**, avant toute construction ; sa réponse prévaut sur le défaut.

1. **Étapes du pipeline des affaires** : [les 6 étapes de la section 4].
2. **Délai de paiement** [30 jours] ; **début d'activité** [octobre 2026].
3. **Cibles des 6 objectifs** [10 interviews JTBD, 10 nouveaux contacts, 4 rendez vous tenus, 3 propositions, 1 000 € encaissés, 100 flyers].
4. **Listes de départ** : étiquettes [Prospect chaud, Réseau entrepreneuses, Commerçant local, Partenaire], offres [Audit, Accompagnement], secteurs et sources [ceux de 3.8].
5. **Repartir de zéro sur les données** ; `crm_prospects` laissée intacte [oui].
6. **Propriétaire non demandé à la création**, modifiable sur la fiche [oui].
7. **Notes en fil daté**, à la place de "Notes" et "Notes rapides" de la version 1.0.0 [oui].
8. **Pas d'écran Activités séparé** en 2.0 : les activités vivent dans les Points clés et les fiches [oui].
9. **Pull Request** `v2` vers `main` ouverte à la fin par la construction [non, Jérôme l'ouvre lui même].
10. **Autorisations** à demander explicitement :
    1. créer la branche `v2` depuis `main` et pousser dessus régulièrement ;
    2. remplacer ou supprimer les fichiers du module CRM de la version 1.0.0 (`fiche.js`, `kanban.js`, `liste.js`, `accueil.js`, `donnees.js`, `logique.js`, `reglages.js`, `index.js`, `css/crm.css`) et les tests qui s'y rapportent ; l'historique Git les conserve ;
    3. installer dans l'environnement cloud Java 21, Chromium (ou le Chromium déjà présent) et les paquets npm de `tests/` ;
    4. télécharger l'émulateur Firestore (si `firebase-tools` ne peut pas le faire seul) ;
    5. modifier `firestore.rules` [non, aucune modification nécessaire] ;
    6. mettre à jour `README.md`, `version.json` et `js/os/version.js` à 2.0.0 ;
    7. ne lancer **aucun** `firebase deploy`, ne publier **aucune** règle, ne **jamais** pousser sur `main`.
