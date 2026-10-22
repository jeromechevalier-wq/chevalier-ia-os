# Outils MCP des projets (07/10/2026)

Les agents (Claude Code, Hermes) peuvent maintenant lire et faire avancer les projets, leurs tâches et leurs factures, avec **exactement les règles de l'écran** : le serveur exécute les mêmes plans (`projets/logique.js`, copiés dans `functions/partage/projets.js`). Chaque écriture est **journalisée** (audit) et **restaurable** avec `restaurer_depuis_audit`.

## Les outils

**Lecture (lecteur, bibliothécaire, Claude Code)**

| Outil | Ce qu'il fait |
|---|---|
| `lister_projets` | Filtres de l'écran : phase, statut, nature, archive, affaire, personne, organisation, recherche, enRetard. Chaque ligne donne l'avancement des tâches et la facturation (facturé, payé, reste à payer, abandonné, impayé). |
| `lire_projet` | Le projet avec son affaire, sa personne, son organisation, ses tâches, ses factures ; `avecFil` ajoute le fil. |
| `lister_modeles_projet` | Les modèles (Audit, Accompagnement…) et leurs tâches types. |

`lire_reglages` donne aussi les référentiels des projets (phases, statuts, natures, assignés, statuts de facture).

**Écriture (bibliothécaire et Claude Code)**

| Outil | Règle de l'écran reprise |
|---|---|
| `creer_projet` | Titre obligatoire, modèle (tâches datées à partir du début), dates, offre. |
| `creer_projet_depuis_affaire` | « Créer le projet » d'une affaire **gagnée** : lie l'affaire (un seul projet). |
| `modifier_projet` | Titre, personne, organisation, offre, dates, dépôt, dossier. Le texte libre (`description`) n'existe plus (22/10/2026) : c'est la note épinglée du projet (`creer_projet` rend `noteEpingleeId` ; la modifier avec `modifier_note`). Un ancien client qui envoie `description` à `creer_*` la voit devenir le texte de la note de départ ; seul dans `modifier_*`, il est refusé avec ce message. |
| `changer_phase_projet` | Dans tous les sens ; **vers Clôture, refusé tant qu'une facture est à payer**. |
| `rouvrir_projet`, `archiver_projet` (la pause a été supprimée le 22/10/2026 : `mettre_projet_en_pause` et `reprendre_projet` n'existent plus) | Comme les boutons de la fiche. |
| `terminer_projet` | Clôture (statut Terminé, archivé). **Refusé tant qu'une facture est à payer** : le refus nomme les factures. Sortie : `impaye: { raison }` (les factures restantes passent à « abandonnee », le projet garde sa pastille « Impayé »). |
| `ajouter_livrable_projet`, `terminer_livrable_projet` | Phase du projet par défaut ; le livrable fait écrit son événement (« Livrable fait : … », type technique `tache_faite` inchangé). Renommés le 22/10/2026 (anciens noms `ajouter_tache_projet` / `terminer_tache_projet` retirés, sans alias) ; `lire_projet` et `lister_modeles_projet` renvoient la clé `livrables`. |
| `ajouter_facture`, `marquer_facture_payee`, `abandonner_facture` | Une ligne par échéance ; une facture payée compte dans l'encaissé du mois du paiement ; l'abandon exige une raison. |

> **Source (22/10/2026)** : le paramètre `source` de `creer_personne`, `modifier_personne`, `creer_affaire` et `modifier_affaire` doit être une valeur de la liste des Réglages (`lire_reglages`, clé `sources`) ; la comparaison ignore la casse et les accents ; un texte libre est refusé avec la liste des sources valides (le détail va dans une note) ; une chaîne vide efface la source. `creer_activite` ne sait toujours pas rattacher une activité à un projet (pas de paramètre `projetId`) : seul l'écran crée une activité « Tâche » sur un projet.

> **Outil supprimé le 18/10/2026 : `extraire_valeur_projet`** (avec la fonctionnalité « Extraction de valeur »). `changer_etape`, `marquer_perdue`, `creer_projet_depuis_affaire` et `terminer_projet` ne créent ni ne rangent plus aucun projet d'extraction et ne rendent plus de champ `extraction` ; `lire_projet` ne rend plus `extraction` ni `source`, `lister_projets` n'a plus le filtre `nature`. Les anciens projets d'extraction restent lisibles (leurs champs `nature`, `projetSourceId` sont montrés tels quels).

**Suppression (Claude Code seul)** : `supprimer_projet` (confirmation par le titre, comme l'écran) supprime le projet, ses tâches et son fil ; l'affaire d'origine est gardée, son lien vidé. Récupérable avec `restaurer_depuis_audit`.

## À savoir

- **Hermes** : la liste d'outils autorisés du guide `branchement-mcp.md` est mise à jour (43 outils pour le bibliothécaire depuis le 18/10/2026, `extraire_valeur_projet` ayant disparu). Si tu as déjà collé l'ancienne liste dans la configuration de Hermes, remplace-la par celle du guide ; sans cela, Hermes ne verra pas les nouveaux outils (le serveur, lui, refuse de toute façon tout outil hors profil).
- Il n'y a pas d'outil pour modifier ou supprimer une facture, ni pour supprimer une tâche, ni pour gérer les modèles : ça se fait à l'écran.
- Aucun outil ne contourne les règles : un projet à facture impayée ne se clôture jamais par erreur ; l'agent doit dire explicitement `impaye` avec une raison.

## Tests

`ecriture-outils.test.js` : droits par profil, création (règles, modèle, événement), projet d'une affaire gagnée, phases, fin de projet, ancien projet « extraction » lu comme un projet ordinaire, tâches, factures 30/30/40 avec refus de clôture et sortie impayé, abandon, lecture (filtres, fiche, fil, modèles, référentiels), suppression avec restauration à l'identique, restauration d'une création.
