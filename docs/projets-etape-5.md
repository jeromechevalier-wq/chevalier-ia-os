# Écran Projets, étape 5 sur 7 : les modèles de projet (06/10/2026)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Un modèle donne à un projet ses tâches de départ. Il se choisit à la création du projet ; pour une affaire gagnée, le modèle de son offre est proposé d'office.

## Ce qui est construit

- **Trois modèles livrés avec l'appli**, créés au premier lancement (une seule fois, sans ligne de journal) :
  - **Audit** (offre Audit) : Interview (Découverte), Créer le rapport et Débriefing avec le client (Livraison), sans date ;
  - **Accompagnement** (offre Accompagnement) : un seul « Rendez-vous de lancement » (Lancement), les suivants s'ajoutent au fil de l'eau ;
  - **Extraction** (nature « Extraction de valeur ») : Tirer les règles et Comprendre les erreurs (Découverte), Repérer ce qui est automatisable et Créer la documentation marketing (Livraison), chacune **sept jours après le début** du projet. Il servira aux projets d'extraction (étape 6).
- **Écran Modèles** (entrée de menu « Modèles », `#/projets/modeles`) : la liste (nom, offre, nature, nombre de tâches, état), « + Modèle » (le nom suffit), la fiche d'un modèle : nom modifiable, offre, nature, Activer / Désactiver, suppression (avec confirmation), et ses **tâches types par phase** : ajout rapide (titre, phase, délai en jours), modifier, monter, descendre, changer de phase, supprimer. Le délai vide veut dire « sans date » ; 0 veut dire « le jour du début » ; sinon « J + n ».
- **Créer un projet avec un modèle** :
  - « + Projet » a un champ « Modèle » (par défaut « Aucun modèle (projet vide) », comme avant) ;
  - « Créer le projet » d'une affaire gagnée ouvre une petite fenêtre : titre de l'affaire (modifiable) et modèle de l'offre **préselectionné** (modifiable, ou aucun) ;
  - le projet reçoit les tâches du modèle, dans le même lot que sa création : date = début du projet + délai, ordre repris dans chaque phase, nature du modèle ; la fiche du projet montre son modèle d'origine (lien), ou « Modèle supprimé ».
- Un modèle **inactif** n'est plus proposé. Supprimer un modèle **ne touche pas** aux projets déjà créés.
- Tout passe par des plans testés (`projets/logique.js`) et laisse sa trace dans le Journal (sauf la création des modèles de départ).

## Correctifs de l'étape 4 faits en passant

- **Enchaîner les tâches au clavier** : le champ d'ajout se vide dès l'Entrée (si l'ajout échoue, ce qui était tapé revient), et la tâche ajoutée apparaît tout de suite dans la liste, avec le compteur et l'avancement, **sans qu'il faille quitter le champ**. Avant, la liste ne se mettait à jour qu'en quittant le champ, et ce qu'on avait déjà tapé pour la tâche suivante pouvait être effacé quand la réponse du serveur arrivait. Même comportement pour les tâches d'un modèle.
- Un test statique vérifie maintenant que chaque appel d'un écran à un module de données existe vraiment (il aurait attrapé tout de suite une fonction d'arrêt supprimée par erreur pendant cette étape).

## Choix faits, à contredire si besoin

- **Phases du modèle Extraction** : les deux premières tâches en Découverte, les deux autres en Livraison (le cadrage dit seulement « rangées dans l'une des quatre phases »).
- **Un champ « nature » sur le modèle** (livraison ou extraction) : un projet créé depuis le modèle Extraction est un projet d'extraction, avec son badge.
- **Les modèles de départ ne reviennent pas** si tu les supprimes tous : un repère (`crm_parametres/modeles_projet`) évite de les recréer. Pour les retrouver, il suffit de recréer un modèle à la main.
- **Pas de modèle appliqué après coup** à un projet existant (seulement à la création).
- Les tâches d'un modèle sont rangées dans le document du modèle : si deux personnes modifient **le même modèle au même instant**, la dernière écriture l'emporte. Rare pour un modèle ; sans conséquence pour les projets déjà créés.

## À faire dans les étapes suivantes

- **Étape 6** : création automatique du projet d'extraction (affaire perdue, fin de projet, affaire gagnée sans projet) avec le modèle « Extraction », reprise du dossier, du dépôt et de la raison de la perte ; serveur MCP.
