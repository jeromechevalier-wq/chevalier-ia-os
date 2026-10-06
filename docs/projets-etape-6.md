# Écran Projets, étape 6 sur 7 : l'extraction de valeur (06/10/2026)

Vision de Jérôme (ticket n° 28) : extraire un maximum de valeur de chaque affaire et de chaque projet, gagnés ou perdus : tirer des règles, comprendre ses erreurs, repérer ce qui est automatisable, créer de la documentation marketing. L'extraction est **un projet comme les autres** (nature « Extraction de valeur », mêmes phases, tâches, statut, Clôture), créé **automatiquement**.

## Quand le projet d'extraction est créé

| Événement | Extraction |
|---|---|
| Une affaire passe en **Perdu** | tout de suite ; la **raison de la perte** (et sa précision) est reprise |
| Un projet est **terminé** (bouton « Terminer ») | tout de suite, pour ce projet (qu'il ait une affaire ou non) |
| Une affaire passe en **Gagné** et n'a **pas de projet** | tout de suite, pour l'affaire |

Toujours : **jamais de boucle** (terminer un projet d'extraction ne crée rien), **une seule extraction par source** (rouvrir puis perdre de nouveau, ou rouvrir puis terminer de nouveau, n'en crée pas une seconde), et l'extraction **reprend le dossier et le dépôt** de sa source ainsi que la personne, l'organisation et l'offre.

**Affaire gagnée, puis projet créé ou lié (choix de Jérôme, 06/10/2026)** : l'extraction faite à Gagné est **rangée** (archivée, retrouvable dans Archives) tant que rien n'y a été fait (aucune de ses tâches n'est faite). La fin du projet crée alors la vraie extraction : un seul projet d'extraction vivant par affaire. Si l'extraction avait déjà avancé, elle reste en vie (et la fin du projet en créera une autre : cas rare).

## Ce qui est construit

- **La règle est écrite une seule fois** (`projets/logique.js` : `planChangerEtapeAvecExtraction`, `planMarquerPerdueAvecExtraction`, `planTerminerProjetAvecExtraction`), au-dessus des plans du CRM. L'écran et le **serveur MCP** exécutent les mêmes plans : une affaire passée en Perdu ou en Gagné par un agent (`marquer_perdue`, `changer_etape`) reçoit son extraction exactement comme à l'écran, dans la même opération d'audit (donc restaurable d'un coup).
- Le serveur reçoit pour cela une **copie des règles des projets** (`functions/partage/projets.js`, faite par `scripts/preparer-fonctions.js` comme celle du CRM). Les réponses de `marquer_perdue` et `changer_etape` ont un champ `extraction` ({ id, titre } ou null).
- **Le projet d'extraction** : titre « Extraction : <titre de la source> », modèle « Extraction » (les quatre tâches, à J + 7), nature « Extraction de valeur » (badge sur les cartes). Si le modèle de la base a été modifié, c'est lui qui fait foi ; s'il a disparu, la copie livrée avec l'appli sert de repli.
- **Fiche projet d'extraction** : ligne « Source » (l'affaire ou le projet, avec lien), ligne « Raison de la perte » pour une affaire perdue, documents et notes de l'affaire montrés en lecture seule (la matière des leçons). Pas de bouton « Détacher » : l'affaire est sa source. Un projet qui a une extraction montre une ligne « Extraction » avec un lien.
- **Fiche affaire** : la section « Projet » montre aussi l'extraction (même pour une affaire perdue). L'extraction n'est **jamais « le projet » de l'affaire** : elle ne bloque pas la création d'un vrai projet, n'est pas proposée dans « Lier un projet », et l'affaire n'a pas de `projetId` vers elle.
- Un message annonce la création (« Projet d'extraction créé », avec un lien).
- **Intégrité** : supprimer l'affaire garde son extraction (lien vidé) ; supprimer le projet source garde son extraction (lien vidé, « Source supprimée »).
- Tests : règles pures (`projets.test.js`, B31), serveur MCP (création, restauration d'une opération), parcours à l'écran (C33), et deux contrôles statiques : le serveur ne contourne pas l'extraction, aucun écran n'appelle l'ancien changement d'étape direct.

## Choix faits, à contredire si besoin

- **Seule la fin du projet** (bouton Terminer) déclenche l'extraction d'un projet : archiver à la main un projet ne la déclenche pas.
- **Le titre** de l'extraction n'est pas modifiable à la création (« Extraction : … »), il se renomme ensuite comme n'importe quel projet.
- **Ce qui est extrait** (règles, erreurs, automatisable, marketing) se range à la main dans le dossier de la source (`marketing/`, second cerveau) : l'appli ne le fait pas.
- Les extractions déjà « Perdu » ou « Gagné » **avant** cette version n'en ont pas : pas de rattrapage automatique (on peut créer un projet à la main avec le modèle Extraction).

## À faire ensuite

- **Étape 7** : Archives (menu), célébration de clôture, finitions et version **2.1.0**.
- **Après la 2.1** : outils MCP pour les projets (chercher, créer, changer de phase, terminer) ; la facturation en 2.2.
