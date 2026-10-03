# Cadrage : écran Projets (version 2.1)

Rédigé le 03/10/2026, **révisé le même jour après les décisions de Jérôme** (section 1). À partir du cahier 2.0, du code du module CRM, de la roadmap, de `pipedrive-reference.md` et du plan MCP. **Brouillon** : rien n'est construit. Marquages : **Décidé** (par Jérôme), **Repris** (déjà écrit dans un document), **Proposition** (mon choix par défaut), **À trancher**.

## 1. Décisions de Jérôme du 03/10/2026

1. **Décidé** : les **phases sont configurables** : ajouter, supprimer et renommer à sa guise.
2. **Décidé** : une affaire et un projet sont, techniquement, **la même chose** ; ils ne diffèrent que par la présentation. Ils partagent **la même collection** Firestore (`crm_affaires`) et un champ `type` dit lequel est lequel.

Conséquence : l'écran Projets n'est plus un nouveau module avec ses propres données. C'est une **seconde vue sur la même collection**, dans le module CRM, qui réutilise la fiche, les activités, les notes, l'historique et les documents. La section 3 dit ce que cela implique, y compris les pièges.

## 2. Ce qui est déjà décidé ailleurs

| Point | Source |
|---|---|
| Kanban de phases (Lancement, Découverte, Distribution, Facturation, Clôture **en départ**, désormais modifiables) | cahier 2.0, 14.2 ; `pipedrive-reference.md` |
| Modèles de projet, tâches, lien depuis une affaire gagnée | cahier 2.0, 14.2 ; roadmap |
| Menu de référence : Projets, Modèles, Archives | `pipedrive-reference.md` |
| Carte : barre de couleur, titre, date de début, date de fin, cercle de progression, propriétaire | `pipedrive-reference.md` |
| Documents = liens Drive ; dossiers de travail par projet restent à la main | roadmap |
| Principes d'écran du CRM : un seul champ obligatoire, « + Ajouter », enregistrement à la sortie du champ, ordinateur et téléphone à égalité, DA chevalier-ia.fr | cahier 2.0, 4 et 7 |

## 3. Une seule table : ce que ça implique

### 3.1 Confirmation, avec les différences à garder en tête

**Oui, je confirme.** Les deux ont un titre, une personne, une organisation, un propriétaire, une position dans une liste ordonnée (étape ou phase), un montant éventuel, des documents, des activités, des notes et un historique. Tout ce code existe déjà. Ce qui diffère :

| | Affaire | Projet |
|---|---|---|
| Liste d'étapes | 6 étapes **qui portent des règles** (voir 3.4) | phases **libres**, sans règle |
| Statut | `ouverte`, `gagnee`, `perdue`, `en_pause` | `ouverte` (affichée « En cours »), `en_pause`, `terminee` |
| Encaissements, raison perdue, objectifs | oui | non |
| Dates de début et de fin, progression, modèle | non | oui |

### 3.2 Champs ajoutés à `crm_affaires`

| Champ | Type | Règle |
|---|---|---|
| `type` | string | `affaire` ou `projet`. **Les documents existants n'en ont pas : l'absence vaut `affaire`**, donc aucune migration |
| `affaireOrigineId` | string ou null | projet seulement : l'affaire dont il vient |
| `dateDebut`, `dateFin` | date | projet seulement ; début préremplie à aujourd'hui |
| `modeleId` | string ou null | projet seulement : modèle d'origine, pour information |

`projetId` (déjà sur l'affaire, réservé) sert à l'affaire pour pointer vers son projet. Les champs existants sont réutilisés tels quels : `etape` porte l'identifiant de la phase, `dateEntreeEtape` et `datesEtapes` suivent les changements de phase, `statut`, `archive`, `personneId`, `organisationId`, `documents`, `proprietaire`, etc.

### 3.3 Affaire et projet : deux documents liés, ou un seul qui change de type ?

- **Proposition : deux documents liés.** À la signature, on **crée** un projet (type `projet`, `affaireOrigineId` = l'affaire) ; l'affaire reste. Raison : l'affaire doit rester une affaire gagnée pour les encaissements, le graphique de chiffre d'affaires, les objectifs et les statistiques, et elle s'archive à « Facture payée » alors que le projet continue souvent bien après.
- **Autre option : un seul document qui change de type** à Gagné. Plus simple en apparence, mais l'affaire disparaîtrait du Kanban des affaires avant d'être facturée et payée, et ses encaissements n'auraient plus de lieu clair.
- **À confirmer** : deux documents liés.

### 3.4 Phases configurables (et étapes des affaires)

- **Phases des projets : stockées dans `crm_parametres/phases_projet`** `{ items: [{id, nom, couleur, ordre}] }`, même mécanisme que les offres et les étiquettes. Écran dans **Réglages** : ajouter, renommer, colorer, **réordonner**, supprimer. Identifiants générés (jamais le nom), donc renommer ne casse rien. **Départ** : Lancement, Découverte, Distribution, Facturation, Clôture (reprises de Pipedrive, à ajuster par toi).
- **Supprimer une phase qui contient des projets** : **Proposition** : l'appli demande vers quelle phase déplacer les projets ; au moins une phase doit rester. Les modèles qui citent la phase retombent sur la première.
- **Les étapes des affaires ne peuvent pas être libres aussi simplement** : trois d'entre elles portent une règle métier dans le code. « Proposition envoyée » alimente l'objectif « Propositions envoyées » ; « Gagné » donne le statut gagné ; « Facture payée » crée l'encaissement et archive. Les supprimer casserait les objectifs et le graphique.
- **À trancher** (question 2) : veux-tu la même liberté pour les affaires ? **Proposition** : **renommer** et **recolorer** les six étapes, et **ajouter** des étapes intermédiaires, oui ; **supprimer** les trois étapes à règle, non ; les autres, oui. Sans réponse, les affaires gardent leurs six étapes fixes en 2.1.

### 3.5 Les calculs existants doivent ignorer les projets

C'est **le risque principal** de la table unique. Aujourd'hui tout ce qui lit `crm_affaires` compte toutes les lignes. Sans filtre sur `type`, un projet serait compté comme une affaire : chiffre d'affaires, propositions, statistiques, Kanban des affaires, filtres, « sans action prévue », export CSV, nombre d'affaires d'une organisation.

- **Règle** : une seule fonction `affairesCommerciales()` et une seule `projets()` dans `logique.js`, qui filtrent sur `type` ; **plus aucun calcul ne lit la liste brute**. L'absence de `type` vaut `affaire`.
- **Tests** (méthode du cahier, `node --test`) : jeu de données mêlant affaires et projets ; les six objectifs, le graphique de chiffre d'affaires, les statistiques par étape, chaque filtre et l'export CSV donnent **exactement le même résultat qu'avant** quand on ajoute des projets. Test sur documents anciens sans `type`.
- La recherche globale gagne un groupe **Projets**.

### 3.6 Tâches et activités : la même collection aussi

Comme projet et affaire partagent la table, leurs tâches partagent aussi `crm_activites` : une tâche de projet est une activité de type `tache` avec `affaireId` = le projet (et, comme toujours, la personne et l'organisation du projet). Conséquences, toutes positives :
- les tâches de projet en retard ou du jour apparaissent **déjà** dans « En retard » et « Aujourd'hui » de l'Accueil et dans les Points clés : une seule liste le matin ;
- « Fait », date rapide, notes et historique fonctionnent sans code nouveau.

Deux champs facultatifs à ajouter à une activité : `phase` (identifiant de phase, pour regrouper les tâches du projet) et `ordre` (pour les réordonner). **Contrepartie** : les Points clés d'une personne montrent aussi les tâches de ses projets. **Proposition** : c'est voulu (tout ce qui concerne le client au même endroit).

### 3.7 Modèles de projet

- Un modèle = nom, offre liée (facultative), liste de tâches types {titre, phase, délai en jours après le début}. Créer un projet depuis un modèle crée ses tâches avec leurs dates.
- **Stockage** : `crm_parametres/modeles_projet` `{ items: [...] }` (même mécanisme que les offres), géré dans un écran **Modèles**, pas besoin de nouvelle collection.
- À la création depuis une affaire, le modèle de son offre (Audit, Accompagnement) est préselectionné, modifiable.
- **À fournir par Jérôme** : les tâches types de l'Audit et de l'Accompagnement. Livrés vides sinon.

## 4. Comment naît un projet

**Proposition**, même esprit que les suggestions douces du cahier (4.8) :
1. Quand une affaire passe en **Gagné**, une boîte préremplie propose « Créer le projet » ; elle se valide, se modifie ou se ferme sans rien changer.
2. Bouton **« Créer le projet »** sur la fiche d'une affaire gagnée (une affaire donne **au plus un projet**) ; une fois lié, il devient « Ouvrir le projet ».
3. Bouton **« + Projet »** sur l'écran Projets : projet **sans affaire** permis (chantier interne, client déjà signé avant l'outil), le titre est le seul champ obligatoire.

Le projet reprend titre, personne, organisation et offre de l'affaire, plus le modèle préselectionné.

## 5. Écrans

Tout reste dans le **module CRM** (je retire ma proposition précédente d'un module à part : avec une table commune, un module séparé obligerait à dupliquer la fiche).

1. **Menu** : une cinquième entrée **Projets** (route `#/crm/projets`), puis Modèles et Archives en onglets de cet écran. Icône Lucide à choisir (`folder-kanban`) : `briefcase` est pris par Affaires.
2. **Projets** : barre (compteur, **« + Projet »**, bascule Kanban / Liste / Archives, recherche, filtres : phase, statut, personne, organisation, en retard). **Kanban d'une colonne par phase configurée**, nombre de projets par colonne ; carte : barre de couleur, titre, organisation, début et fin, cercle de progression (tâches faites / tâches du projet), pastille d'activité, propriétaire. Glisser déposer dans tous les sens ; « Déplacer vers… » sur téléphone. Liste : Titre, Personne, Organisation, Phase, Début, Fin, Avancement.
3. **Fiche projet** : même composant que la fiche affaire, qui s'adapte au `type`. Route `#/crm/projets/<id>` ; une affaire ouverte par erreur dans la mauvaise route redirige vers la bonne.
   - **En tête** : titre, personne et organisation cliquables, lien « Affaire d'origine », **barre des phases configurées**, boutons **Terminer** et **En pause** (à la place de Gagnée, Perdue, En pause) ; pas de montant ni d'encaissements ;
   - **Gauche** : Résumé (affaire d'origine, personne, organisation, offre, statut, dates), **Tâches par phase** (cocher, ajouter, réordonner, date rapide), Documents ; **les documents de l'affaire d'origine s'affichent en lecture** (le devis signé) sans être copiés ;
   - **Droite** : Activité, Notes, Points clés, Historique (inchangés).
4. **Réglages** : section **Phases des projets** (3.4) ; section **Modèles de projet** (3.7).
5. **Fiche affaire** : section « Projet » (lien ou « Créer le projet »). **Fiches personne et organisation** : section « Projets ».
6. **Bouton « + »** : entrée Projet. **Recherche globale** : groupe Projets.
7. **Déjà demandé le 03/10/2026, fait dans le code** : sur la fiche affaire, les noms de la personne et de l'organisation (en-tête) sont soulignés, et une icône « Ouvrir la fiche » est ajoutée à côté de chacun dans le Résumé (voir le commit associé).

## 6. Règles de cohérence

1. **Affaire gagnée, payée puis archivée** : le projet reste visible et lié ; archiver l'affaire n'archive jamais le projet.
2. **Affaire perdue ou en pause après création du projet** : le projet n'est pas touché ; une pastille signale « Affaire perdue » ou « en pause » sur la fiche projet.
3. **Supprimer une affaire qui a un projet** : refusé, avec proposition de détacher d'abord (le projet garde son contenu, `affaireOrigineId` devient vide).
4. **Supprimer un projet** : confirmation en tapant le titre ; supprime ses activités, notes et événements propres, vide `projetId` de l'affaire ; **l'archivage reste la voie normale**.
5. **Terminer un projet** : statut `terminee`, archivage, petite célébration de Charles (le feu d'artifice reste réservé au « Gagné »).
6. **Journal** : événements `projet_cree`, `phase_changee`, `projet_termine` dans `crm_evenements` (même table, mêmes liens : l'historique de la personne et de l'organisation affiche aussi « Projet créé »).
7. **Retard** d'un projet : date de fin prévue dépassée sans qu'il soit terminé, ou tâche en retard.
8. Aucune requête composite ; tris et filtres dans le navigateur (`type` se filtre dans le navigateur, sur la liste déjà chargée).

## 7. Dépendances et séquence

1. **Chantier MCP** (branche `mcp`, `plan-mcp.md` ; état au 03/10/2026 : prototype Drive fait, squelette des fonctions en place dans `functions/`, outils métier pas encore écrits). Il extrait les enchaînements de `donnees.js` dans `logique.js` et restructure les règles Firestore. **Proposition** : terminer cette extraction d'abord, puis écrire Projets dans la nouvelle forme. Les outils MCP de projets seront ceux des affaires avec un paramètre `type` (étape suivante, pas la 2.1).
2. **Copie quotidienne vers Google Sheet par n8n** : autre chantier de la 2.1, indépendant ; une feuille « Projets » s'y ajoutera.
3. Règles Firestore : aucun changement propre à Projets.

## 8. Découpage proposé

1. **Socle** : champ `type` et fonctions de filtrage, **tests de non régression des calculs** (3.5), phases configurables et leur écran de Réglages.
2. **Kanban et fiche projet** : liste, Kanban, fiche adaptée au `type`, statuts, dates.
3. **Création depuis une affaire** : suggestion douce, section « Projet » sur les fiches, liens.
4. **Tâches** : tâches par phase (`phase`, `ordre`), progression, remontée Accueil.
5. **Modèles** : écran, création depuis un modèle.
6. **Finitions** : Archives, recherche, « + », célébration, parcours Playwright à 1440 × 900 et 390 × 844, version **2.1.0**.

## 9. Critères d'acceptation (esquisse)

Mêmes exigences que le cahier 2.0 (15). Parcours propres à Projets :
1. Créer un projet en ne tapant que son titre.
2. Passer une affaire en Gagné : la boîte propose « Créer le projet » ; la fermer ne change rien ; la valider crée un projet lié avec le modèle de l'offre.
3. **Ajouter, renommer, réordonner et supprimer une phase** dans Réglages ; le Kanban suit ; supprimer une phase non vide demande où déplacer les projets.
4. Glisser un projet d'une phase à l'autre et revenir ; le journal est à jour.
5. Cocher une tâche : la progression avance ; une tâche en retard apparaît dans « En retard » de l'Accueil avec le nom du projet.
6. Archiver l'affaire (Facture payée) : le projet reste visible et lié.
7. Terminer un projet : célébration, archivage, présence dans Archives.
8. Supprimer un projet : confirmation par le titre, `projetId` de l'affaire vidé.
9. **Non régression** : avec des projets présents, objectifs, graphique de chiffre d'affaires, statistiques et export CSV des affaires restent inchangés.

## 10. Questions pour Jérôme

1. **Deux documents liés** (affaire et projet distincts, 3.3) ou un seul qui change de type ? Je recommande deux.
2. **Étapes des affaires** (3.4) : même liberté de renommer, ajouter et supprimer, sauf les trois qui portent une règle ?
3. **Suppression d'une phase non vide** : « déplacer vers… » te convient-il ?
4. **Modèles** (3.7) : peux-tu me donner les tâches types de l'Audit et de l'Accompagnement ?
5. **Calendrier** : Projets avant ou après l'extraction de logique du chantier MCP ? Je conseille après.
