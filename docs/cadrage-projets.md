# Cadrage : écran Projets (version 2.1)

Rédigé le 03/10/2026 à partir du cahier 2.0, du code du module CRM, de la roadmap, de `pipedrive-reference.md` et du plan MCP. **Brouillon à valider par Jérôme** : rien n'est construit. Chaque point est marqué **Repris** (déjà écrit dans un document existant), **Proposition** (mon choix par défaut, que tu peux changer) ou **À trancher** (je n'ai pas assez d'éléments).

## 1. Pourquoi, et ce que ça change

1. Aujourd'hui, le CRM s'arrête à la signature : une affaire passe en « Gagné », puis « Facture envoyée », puis « Facture payée », et sort du Kanban. Rien ne dit où suivre le **travail** une fois la commande signée.
2. **Repris** : « une Affaire gagnée pourra donner un Projet (la partie gestion de projet, version 2.1) » (cahier 2.0, 1.5). Le champ `projetId` existe déjà sur chaque affaire, toujours vide (`logique.js:557`).
3. **But** : à partir d'une affaire gagnée, ouvrir un projet en un clic, suivre ses phases et ses tâches, et ne jamais perdre le lien avec la commande d'origine (client, montant, devis).
4. **Ce que Projets ne fait pas** : il ne remplace pas le CRM et ne gère pas la prospection. Le chiffre d'affaires et les encaissements restent sur l'affaire (voir 3.1).

## 2. Ce qui est déjà décidé (à ne pas rouvrir)

| Point | Source |
|---|---|
| Écran Projets en Kanban de **phases** : Lancement, Découverte, Distribution, Facturation, Clôture | cahier 2.0, 14.2 |
| Modèles de projet, tâches, lien `projetId` depuis une affaire gagnée | cahier 2.0, 14.2 ; roadmap |
| Menu Pipedrive de référence : Projets, Modèles, Archives ; Tâches | `pipedrive-reference.md` |
| Carte : barre de couleur, titre, date de début, date de fin, cercle de progression, propriétaire | `pipedrive-reference.md` |
| Vues Kanban et liste, avec filtre | `pipedrive-reference.md` |
| Pas d'entrée Projets en 2.0 ; un seul dossier Drive `Jerome IA OS Attachments`, les dossiers de travail par projet restent à la main et se relient **par lien** | cahier 2.0, 7.2 ; roadmap |
| Mêmes principes d'écran que le CRM : un seul champ obligatoire, champs vides en « + Ajouter », enregistrement à la sortie du champ, ordinateur et téléphone à égalité, DA chevalier-ia.fr | cahier 2.0, 4 et 7 |

## 3. Points à trancher avant de construire

Ce sont les décisions qui changent l'écran ou les données. Pour chacune : ma proposition, la raison, l'autre option.

### 3.1 Les cinq phases sont-elles les tiennes ?

- Les cinq phases viennent de **l'écran Pipedrive** étudié, pas d'un entretien. **À trancher** : correspondent-elles à ta façon de travailler (Audit, Accompagnement) ?
- **Chevauchement à régler** : « Facturation » existe déjà dans le CRM (étapes « Facture envoyée » et « Facture payée »). Deux endroits pour la même chose créeraient de la confusion.
- **Proposition** : garder les cinq colonnes pour démarrer, mais « Facturation » est une **phase de travail** (préparer la facture, relancer) ; le montant encaissé reste dans les encaissements de l'affaire. Si tu n'y vois pas d'utilité, on passe à quatre phases (Lancement, Découverte, Distribution, Clôture).
- **Proposition** : phases fixes dans le code en 2.1 (comme les six étapes des affaires), modifiables plus tard seulement si le besoin apparaît. Pas de pipelines multiples.

### 3.2 Comment naît un projet ?

- **Proposition** : trois voies, la même logique que les « suggestions douces » du cahier (4.8).
  1. Quand une affaire passe en **Gagné**, une petite boîte préremplie propose « Créer le projet » ; elle se valide, se modifie ou se ferme sans rien changer.
  2. Bouton **« Créer le projet »** sur la fiche d'une affaire gagnée (section Résumé), pour celles déjà gagnées.
  3. Bouton **« + Projet »** dans la barre de l'écran Projets, pour un projet sans affaire (voir 3.3).
- **Règles** : une affaire donne **au plus un projet** (`projetId` est une valeur unique, pas une liste) ; une fois lié, le bouton devient « Ouvrir le projet ». Le projet reprend le titre, la personne et l'organisation de l'affaire ; le modèle est préselectionné d'après l'offre (voir 3.4).
- **Autre option** : création automatique à Gagné, sans boîte. Écartée : elle crée des projets que tu n'as pas voulus, et le cahier a choisi la douceur partout ailleurs.

### 3.3 Un projet sans affaire est-il permis ?

- Exemples : un chantier interne (le site chevalier-ia.fr), un projet offert, un travail pour un client déjà signé avant l'outil.
- **Proposition** : **oui**, `affaireId` facultatif. Un seul champ obligatoire : le titre. C'est cohérent avec le principe « un seul champ obligatoire ».
- **À surveiller** : un projet sans affaire n'a ni client ni montant ; la fiche affiche alors des « + Ajouter… » pour la personne et l'organisation.

### 3.4 Modèles de projet

- **Un modèle** = un nom, une offre liée (facultative) et une liste de tâches types (titre, phase, délai en jours après le démarrage). Créer un projet depuis un modèle crée ses tâches, avec leurs dates calculées.
- **Proposition** : un modèle peut être lié à une offre du catalogue (Audit, Accompagnement) ; à la création d'un projet depuis une affaire, le modèle de l'offre est préselectionné, modifiable. Sans modèle, le projet démarre vide.
- **À fournir par Jérôme** : le contenu réel des modèles Audit et Accompagnement (tâches et phases). Je ne l'invente pas : livrés vides, ils se remplissent dans l'appli.
- **Proposition** : les modèles se gèrent dans l'appli (menu **Modèles**, comme chez Pipedrive), pas dans Réglages, parce qu'ils sont longs à éditer.
- **Piste, pas en 2.1** : durée type et montant type dans le modèle.

### 3.5 Tâches de projet : même liste que les activités du CRM ?

C'est la décision la plus structurante. Aujourd'hui, Accueil et Points clés montrent les `crm_activites` non faites (en retard, aujourd'hui, sans action prévue).

- **Option A, recommandée : collection séparée `projets_taches`**, avec leur propre écran, mais **les tâches datées et non faites remontent dans « En retard » et « Aujourd'hui » de l'Accueil**, avec la mention du projet. Une seule liste du matin pour toi, sans mélanger les modèles de données (une tâche de projet a une phase, un ordre, un modèle d'origine ; une activité CRM a un type appel / rendez vous / email).
- **Option B : réutiliser `crm_activites`** avec un `projetId`. Moins de code, mais la collection devient fourre-tout, les « Points clés » d'une personne se remplissent de tâches de production, et le filtre « sans action prévue » perd son sens.
- **Option C : deux listes totalement séparées.** Écartée : tu devrais regarder deux endroits le matin, ce que le cahier cherche à éviter.
- **À trancher** : A (recommandée), B ou C ?
- **Règles communes (A)** : titre obligatoire ; date facultative ; heure facultative ; case « Fait » (`dateFait`) ; phase ; ordre dans la phase ; assigné à Jérôme ou Charles (le champ est prêt pour « tâches confiées à Charles », prévu « plus tard »).

### 3.6 Où vit Projets dans le code et dans le menu ?

- **Proposition** : un **module à part**, `js/modules/projets/`, enregistré dans `js/os/modules.js`. C'est le mécanisme prévu (« Ajouter un module = un dossier + une entrée »), la coquille sait déjà le faire (menu, « + », recherche globale viennent de chaque module). Ça garde « le CRM s'arrête à la signature » et laisse le CRM intact.
- Entrées de menu : **Projets** (Kanban), **Modèles**, **Archives**. Icône Lucide à choisir (`folder-kanban` ou `layout-dashboard` ; `briefcase` est déjà pris par Affaires).
- Collections : préfixe `projets_` (`projets_projets`, `projets_taches`, `projets_modeles`), comme `crm_` pour le CRM. Aucun changement de `firestore.rules` (jokers), **mais** voir 6 (restructuration des règles par le chantier MCP).
- **Autre option** : une cinquième entrée dans le module CRM. Plus rapide, mais mélange deux domaines et rend le CRM plus lourd ; pas recommandée.
- Le module Projets **lit** les données du CRM (affaires, personnes, organisations) par `crm/donnees.js` ; il n'y **écrit** qu'un seul champ : `projetId` sur l'affaire, à la création du projet.

### 3.7 Que devient l'affaire quand elle est payée ?

- Aujourd'hui, « Facture payée » **archive** l'affaire (elle quitte le Kanban). Le projet peut durer bien plus longtemps que le règlement.
- **Proposition** : le lien `projetId` **survit à l'archivage** ; la fiche projet affiche l'affaire même archivée ; l'archivage de l'affaire n'archive jamais le projet. Un projet s'archive seulement à la main ou quand il est terminé (voir 3.8).
- **Proposition** : si une affaire passe en « Perdue » ou « En pause » après la création de son projet, le projet n'est pas touché ; une pastille d'alerte sur la fiche projet signale « Affaire perdue » ou « En pause ».

### 3.8 Statut et avancement

- **Proposition** : un projet a un **statut** `actif`, `en_pause`, `termine` (dérivé : `termine` quand il est archivé en Clôture) et une **phase** (une des cinq). Le cercle de progression de la carte = tâches faites divisé par tâches du projet.
- **À trancher** : faut-il un statut « Annulé » ? Proposition : non, on archive.
- Retard : un projet est « en retard » si sa **date de fin prévue** est dépassée sans qu'il soit terminé, ou si une de ses tâches est en retard (même logique de pastille rouge, verte, grise que les affaires, calculée dans le navigateur).

### 3.9 Documents et dossier Drive

- **Repris** : les documents sont des **liens Drive** (libellé et URL), le dossier de travail par projet reste à la main. **Proposition** : même section « Documents » que sur l'affaire, avec le même code, sur la fiche projet.
- **Proposition** : les documents de l'affaire d'origine sont **affichés en lecture** sur la fiche projet (le devis signé, par exemple), sans les copier.
- Le téléversement Drive depuis le téléphone (chantier MCP, étape pièces jointes) viendra plus tard ; Projets s'en servira ensuite sans modification du modèle de données.

### 3.10 Objectifs et célébrations

- **À trancher** : veux-tu un objectif mensuel lié aux projets (par exemple « projets lancés » ou « projets clôturés ») ? **Proposition** : non en 2.1 ; les objectifs calculés se branchent facilement après coup (`enregistrerCalculs`).
- **Proposition** : une célébration réduite à la **clôture d'un projet** (petite animation de Charles « Projet terminé »), pour rester dans l'esprit de l'outil ; le feu d'artifice reste réservé au « Gagné ».

## 4. Modèle de données proposé

Conventions du cahier 2.0 (3.1) reprises telles quelles : identifiants automatiques, liens par identifiant, dates `AAAA-MM-JJ`, horodatages `serverTimestamp()`, **aucune requête composite** (une seule condition par requête, tris et filtres dans le navigateur), archivage plutôt que suppression.

### 4.1 `projets_projets`

| Champ | Libellé | Type | Obligatoire | Règle |
|---|---|---|---|---|
| `titre` | Titre | string | **oui** | prérempli avec le titre de l'affaire |
| `affaireId` | Affaire | string ou null | non | au plus un projet par affaire ; voir 3.3 |
| `personneId`, `organisationId` | | string ou null | non | repris de l'affaire à la création, modifiables |
| `phase` | Phase | string | auto | `lancement`, `decouverte`, `distribution`, `facturation`, `cloture` ; défaut `lancement` |
| `statut` | Statut | string | auto | `actif`, `en_pause`, `termine` |
| `dateDebut`, `dateFin` | Début, Fin prévue | date | non | début préremplie à aujourd'hui |
| `modeleId` | Modèle d'origine | string ou null | non | pour information |
| `offreId` | Offre | string ou null | non | reprise de l'affaire |
| `dateEntreePhase`, `datesPhases` | | timestamp, map | auto | comme `dateEntreeEtape` et `datesEtapes` |
| `documents` | Documents | liste de {libelle, url} | non | liens Drive |
| `archive` | | boolean | auto | faux par défaut |
| `proprietaire`, `creeLe`, `modifieLe`, `creePar`, `modifiePar` | | | auto | comme les affaires |

### 4.2 `projets_taches`

`titre` (**obligatoire**), `projetId` (**obligatoire**, une tâche n'existe pas hors projet), `phase`, `ordre` (nombre, pour trier dans la phase), `date` et `heure` (facultatives), `fait` et `dateFait` (comme les activités), `assigneA` (`jerome` ou `charles`), `auteur`, `creeLe`. Les tâches d'un projet se chargent à l'ouverture de sa fiche (égalité sur `projetId`) ; les tâches **non faites** se suivent pour toute la session (`fait == false`), comme les activités, pour alimenter l'Accueil.

### 4.3 `projets_modeles`

`nom` (**obligatoire**), `offreId` (facultatif), `taches` : liste de {titre, phase, delaiJours, ordre}, `actif`, `ordre`.

### 4.4 Journal des événements

Le journal du CRM (`crm_evenements`) porte `personneId`, `organisationId`, `affaireId`. **Proposition** : y ajouter les événements de projet (`projet_cree`, `phase_changee`, `projet_termine`, `projet_archive`) avec un champ `projetId` supplémentaire et les trois liens existants, pour que l'historique de la personne, de l'organisation et de l'affaire affiche aussi « Projet créé ». **À trancher** : sinon un journal séparé `projets_evenements`. La première option est plus utile (une seule histoire du client) ; la seconde isole mieux les deux modules.

### 4.5 Champ ajouté sur l'affaire

Aucune migration : `projetId` existe déjà. Le module Projets l'écrit à la création du projet et le vide à la suppression du projet.

## 5. Écrans

Même modèle que le CRM (Pipedrive pour la structure, DA chevalier-ia.fr pour l'identité), textes en français, tutoiement.

1. **Projets** (`#/projets/projets`) :
   - barre : compteur (« 4 projets »), bouton vert **« + Projet »**, bascule **Kanban / Liste**, recherche, filtres (phase, statut, offre, personne, organisation, en retard) ;
   - **Kanban de 5 colonnes** (les phases), chacune avec son nombre de projets ; carte : barre de couleur, titre, organisation, date de début et date de fin, cercle de progression, propriétaire, pastille d'alerte ;
   - glisser déposer dans tous les sens, y compris en arrière ; sur téléphone, menu « Déplacer vers… » comme les affaires ;
   - **Liste** : Titre, Personne, Organisation, Phase, Début, Fin, Avancement ; cartes sur téléphone.
2. **Fiche projet** (`#/projets/projets/<id>`) : deux colonnes sur ordinateur, une sur téléphone, mêmes composants que la fiche affaire.
   - **En tête** : titre modifiable, personne et organisation (liens), lien « Affaire d'origine », **barre des 5 phases** (clic = changement de phase), boutons **Terminer** et **En pause**, menu « ⋯ » (Archiver, Supprimer définitivement) ;
   - **Gauche** : Résumé (affaire, personne, organisation, offre, statut, dates) ; **Tâches** par phase (cocher, ajouter, glisser pour réordonner, date rapide : Demain, +3 jours, +1 semaine) ; Documents ;
   - **Droite** : Activité et Notes (les notes se rattachent au projet **et** à ses liens), Points clés, Historique.
3. **Modèles** (`#/projets/modeles`) : liste ; fiche d'un modèle avec ses tâches par phase.
4. **Archives** (`#/projets/archives`) : projets archivés.
5. **Accueil du CRM** : les tâches de projet en retard ou du jour s'ajoutent aux groupes « En retard » et « Aujourd'hui », avec le nom du projet (option A de 3.5).
6. **Fiche affaire** : section « Projet » (lien ou bouton « Créer le projet »). **Fiche personne et fiche organisation** : section « Projets » (liste des projets liés).
7. **Bouton « + » de la barre supérieure** : entrée **Projet**. **Recherche globale** : groupe **Projets**.
8. **Suggestions douces** au changement de phase (vers Facturation : « Préparer la facture », vers Clôture : « Faire le point avec le client ») : **À trancher**, je n'en propose pas sans ton accord, pour ne pas inventer ta méthode.

## 6. Contraintes techniques et dépendances

1. **Pas de compilation, SDK Firebase 12.19.0, aucune requête composite** : toutes les règles du cahier 2.0 (11) s'appliquent. Les tests statiques D4 et D5 doivent être étendus au nouveau module.
2. **Logique pure dans `projets/logique.js`**, testée avec `node --test` : phase, statut, progression, retard, création depuis un modèle (dates), création depuis une affaire, intégrité des liens. Même méthode que le CRM : l'écran ne contient pas de règle métier.
3. **Intégrité des liens** (comme 3.10 du cahier) :
   1. supprimer une affaire qui a un projet : refusé, ou proposition de détacher d'abord (le projet garde son contenu, `affaireId` devient vide) ;
   2. supprimer un projet : confirmation en tapant son titre, supprime ses tâches, détache l'affaire (`projetId` vide) ; l'archivage est la voie normale ;
   3. supprimer une personne ou une organisation liée à un projet : le projet est conservé, le lien est vidé (même règle que les affaires conservées).
4. **Chantier MCP** (branche `mcp`, `plan-mcp.md` ; état au 03/10/2026 : prototype Drive fait, squelette des fonctions en place dans `functions/`, outils métier pas encore écrits) : il restructure les règles Firestore, extrait les enchaînements de `donnees.js` dans `logique.js` et ajoute un journal d'audit. **Proposition de séquence** : terminer d'abord cette extraction, puis écrire Projets directement dans la nouvelle forme, pour ne pas le refaire. Les outils MCP de Projets (chercher, créer, changer de phase, ajouter une tâche) seraient une deuxième étape, pas dans la 2.1.
5. **Copie quotidienne vers Google Sheet par n8n** : autre chantier de la 2.1, indépendant ; une feuille « Projets » s'ajoutera à la copie une fois l'écran livré.
6. **Hors ligne, import, fusion de doublons** : toujours hors périmètre.

## 7. Découpage proposé

Chaque étape se livre et se teste seule ; Jérôme valide à la fin de chacune.

1. **Socle** : module `projets`, collections, `logique.js` et ses tests, règles et tests de sécurité adaptés, intégrité des liens.
2. **Kanban et fiche projet** : liste, Kanban, fiche avec phases, statut, documents, notes.
3. **Création depuis une affaire** : suggestion douce à Gagné, section « Projet » sur les fiches, sections « Projets » sur personne et organisation, `projetId`.
4. **Tâches** : tâches par phase, remontée dans l'Accueil du CRM, pastilles.
5. **Modèles** : écran Modèles, création d'un projet depuis un modèle, modèles de départ (vides ou remplis avec ton contenu).
6. **Finitions** : Archives, recherche globale, bouton « + », célébration de clôture, parcours Playwright à 1440 × 900 et 390 × 844, version **2.1.0**.

## 8. Critères d'acceptation (esquisse)

Mêmes exigences que le cahier 2.0 (15) : tous les tests automatiques passent sur les émulateurs (projet `demo-chevalier-ia-os`), chaque parcours est rejoué sur ordinateur et téléphone, aucune erreur de console, aucun défilement horizontal de la page à 390 px. Parcours propres à Projets :

1. Créer un projet en ne tapant que son titre.
2. Passer une affaire en Gagné : la boîte propose « Créer le projet » ; la fermer ne change rien ; la valider crée le projet lié, avec le modèle de l'offre.
3. Glisser un projet de Lancement à Découverte puis revenir en arrière ; le journal est à jour.
4. Cocher une tâche : le cercle de progression avance ; une tâche en retard apparaît dans « En retard » de l'Accueil avec le nom du projet.
5. Archiver l'affaire (Facture payée) : le projet reste visible et lié.
6. Terminer un projet : célébration, archivage, présence dans Archives.
7. Supprimer un projet : confirmation par le titre, tâches supprimées, `projetId` de l'affaire vidé.
8. Recherche globale et « + » : le groupe et l'entrée Projet apparaissent.

## 9. Questions pour Jérôme (par ordre d'importance)

1. **Phases** (3.1) : les cinq phases te conviennent-elles, et « Facturation » reste-t-elle une phase de travail ?
2. **Tâches** (3.5) : option A (collection séparée qui remonte dans l'Accueil), B ou C ?
3. **Création** (3.2) et **projet sans affaire** (3.3) : la suggestion douce à Gagné, plus les boutons, te convient-elle ; un projet sans affaire est-il permis ?
4. **Modèles** (3.4) : peux-tu me donner les tâches types de l'Audit et de l'Accompagnement ?
5. **Module à part** (3.6) : d'accord pour un module `projets` séparé ?
6. **Journal** (4.4) : événements de projet dans `crm_evenements` (proposé) ou journal séparé ?
7. **Objectif mensuel** (3.10) et **suggestions de phase** (5.8) : veux-tu l'un ou l'autre ?
8. **Calendrier** : Projets avant ou après l'extraction de logique du chantier MCP (6.4) ?
