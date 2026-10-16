# Ménage du CRM avant déploiement chez les clients (version 2.5.0, 16/10/2026)

Chantier 1 des décisions du 16/10/2026 (fiche « Décisions de cadrage du CRM client »). **Rien n'est déployé.** Les règles Firestore ne sont **pas** modifiées.

## Ce qui est fait

1. **Étapes de vente et phases de projet configurables** : six emplacements fixes (nom, description avec l'icône « i », couleur, utilisé ou non). Rôles « vente gagnée » (étapes) et « clôture » (phases) au choix ; l'emplacement qui porte un rôle ne se désactive pas. On ne désactive un emplacement que s'il ne contient aucune fiche (archivées et perdues comprises), au moins 3 restent utilisés. Le Kanban montre toutes les étapes actives, même vides. Colonnes Perdues / En pause inchangées.
2. **Valeurs neutres** pour tout nouvel espace client (étapes, phases, offres vides, secteurs, sources, filtres, étiquettes, modèles). Les valeurs de Jérôme (`PROFIL JÉRÔME` dans `logique.js` : `CONFIG_JEROME`, `REGLAGES_JEROME`, `*_JEROME`) ne servent qu'à la racine.
3. **Objectifs** : départ neutre (nouveaux contacts, rendez-vous tenus, « Passages à l'étape : [choix] »), chiffre d'affaires signé / facturé / encaissé à ajouter au choix, « Flyers » reste chez Jérôme, un texte « Comment c'est calculé » en lecture seule par indicateur.
4. **Suivi des paiements** : interrupteur (éteint par défaut chez un client), règle « clôture bloquée » réglable, et suppression de la section Encaissements de la fiche affaire, du réglage Délai de paiement et du bloc Migration 2.2.
5. **Extraction de valeur** : interrupteur lu par `logique.js` (donc écran **et** serveur MCP). Éteint : plus de création, plus de bloc, bouton, badge, modèle ; l'outil MCP `extraire_valeur_projet` refuse.
6. **Action suggérée** : les deux règles en dur ont disparu. Chaque étape / phase peut porter une action (type, titre, délai) ; fenêtre Accepter / Refuser, jamais automatique. Aucune par défaut.
7. **Modèles** : plus dans le menu, dans les Réglages : « Modèles d'affaires » (nouveau) et « Modèles de projets ».
8. **Célébrations** : option ; message neutre « Bravo ! », prénom et image en réglage (chez Jérôme : « Jérôme » et l'image de Charles).
9. **Tâches** : « Confiée à » vient des membres de l'espace ; membre retiré = son nom + « (ancien membre) », tâches jamais supprimées ; un seul membre = pas de choix ; le dernier éditeur ne peut plus être retiré (ni rétrogradé) par l'outil `nouveau-client`.
10. **GitHub / dossier** : boutons « Créer le GitHub / Créer le répertoire » et réglages GitHub derrière l'interrupteur « Dépôt de code et dossier » (allumé chez Jérôme, éteint par défaut chez un client). Le chantier Drive / liens reste à faire.

## Où sont stockées les choses (aucune nouvelle collection)

- `crm_parametres/etapes` et `crm_parametres/phases` : `{ items: [6 emplacements], roleGagnee | roleCloture }`.
- `crm_parametres/modeles_affaire` : `{ items: [...] }`.
- Interrupteurs : champs du document existant `crm_parametres/reglages` (`suiviPaiements`, `clotureBloquee`, `extractionValeur`, `celebrations`, `boutonsDepot`, `prenomCelebration`, `imageCelebration`).
- Membres assignables d'un espace client : champ `equipe` de la fiche `clients/<client>` (adresse + rôle), écrit par l'outil `nouveau-client` en même temps que les fiches d'appartenance (les règles interdisent de lister les membres depuis un navigateur).

## Ce qui touche les données existantes de Jérôme

- **Rien à faire de sa part.** Au premier chargement, l'écran crée les documents manquants avec ses valeurs historiques : `etapes` (premier_contact, rdv_fixe, proposition_envoyee, gagne + 2 emplacements libres), `phases` (lancement, decouverte, livraison, cloture + 2 libres), `modeles_affaire` (vide), et ajoute au document `reglages` les interrupteurs manquants, tous allumés. Les affaires, projets, factures, objectifs existants ne sont pas modifiés.
- Tant que le serveur MCP n'a pas vu ces documents, il applique les mêmes valeurs de Jérôme (même fonction).
- Les anciens encaissements saisis sur des affaires (avant la 2.2) restent comptés dans le chiffre d'affaires encaissé (historique), mais la section n'existe plus sur la fiche.
- L'objectif « Propositions envoyées » de Jérôme continue de fonctionner (indicateur conservé) ; « Chiffre d'affaires signé » s'ajoute depuis Réglages > Objectifs.
- Les tâches existantes gardent `assigneA: jerome / charles` (inchangé).

## Choix faits sans poser de question

- Emplacements : Jérôme garde ses identifiants + `etape_5`, `etape_6`, `phase_5`, `phase_6` ; un client a `etape_1…6` et `phase_1…6` (rôles : 5e étape, 4e phase). Noms neutres : Nouveau contact, Échange en cours, Proposition, Négociation, Gagné / À démarrer, En cours, À valider, Terminé.
- Offres neutres : liste vide. Un modèle d'affaire et un modèle de projet génériques. Filtres : « À relancer cette semaine », « Chaudes ».
- **Date de signature** : l'étape « vente gagnée » garde la date du **dernier** passage (pas du premier) pour que le chiffre signé tombe dans le bon mois si l'affaire est rouverte puis regagnée. L'événement « Affaire gagnée » reste écrit une seule fois.
- CA signé : montant des affaires actuellement gagnées, au mois de la date de signature (fuseau Paris), rien avant le début d'activité, une affaire sans montant ne compte pas.
- Objectifs de départ d'un client : cibles 5 / 2 / 2 ; « Passages à l'étape » démarre sur la 3e étape active. Les objectifs facturé / encaissé n'existent que si le suivi des paiements est allumé ; un objectif « Passages à l'étape » dont l'étape est désactivée est indisponible.
- Phase d'arrivée d'une action suggérée : l'action d'une phase est toujours une **tâche du projet** (dans cette phase) ; celle d'une étape est une activité (appel, rendez-vous, e-mail, tâche).
- « Confiée à » : seuls les **éditeurs** sont proposés ; le nom affiché vient de l'adresse (partie avant @), car les fiches d'appartenance ne portent pas de nom. Le nom est mémorisé sur la tâche (`assigneNom`) pour l'afficher après un retrait.
- Célébrations éteintes par défaut chez un client (option activable).
- Les modèles d'affaires ne sont pas encore proposés par le serveur MCP (écran seulement) ; le plan `planCreerAffaire` accepte déjà un modèle.
- Le graphique du chiffre d'affaires encaissé de l'Accueil n'est montré que si le suivi des paiements est allumé.
- Les pages `#/projets/modeles/<id>` (fiche d'un modèle) existent toujours ; seule l'entrée de menu a disparu (retour vers les Réglages).

## Pour la session « multi-clients MCP »

`functions/src/coeur/config.js` : `lireConfig(donnees, { racine, membres })`. Le serveur ne sert que la racine (`racine: true`, valeurs de Jérôme à défaut de documents). Pour un espace client : passer `racine: false` et la liste `membres` (voir `equipe` de la fiche client), via `c.racine` / `c.membres` du contexte d'écriture et `lireReglages(donnees, espace)`.
