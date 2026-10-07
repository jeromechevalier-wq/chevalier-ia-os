# Outils MCP des projets (07/10/2026)

Les agents (Claude Code, Hermes) peuvent maintenant lire et faire avancer les projets, leurs tâches et leurs factures, avec **exactement les règles de l'écran** : le serveur exécute les mêmes plans (`projets/logique.js`, copiés dans `functions/partage/projets.js`). Chaque écriture est **journalisée** (audit) et **restaurable** avec `restaurer_depuis_audit`.

## Les outils

**Lecture (lecteur, bibliothécaire, Claude Code)**

| Outil | Ce qu'il fait |
|---|---|
| `lister_projets` | Filtres de l'écran : phase, statut, nature, archive, affaire, personne, organisation, recherche, enRetard. Chaque ligne donne l'avancement des tâches et la facturation (facturé, payé, reste à payer, abandonné, impayé). |
| `lire_projet` | Le projet avec son affaire, sa personne, son organisation, ses tâches, ses factures, son extraction (ou sa source) ; `avecFil` ajoute le fil. |
| `lister_modeles_projet` | Les modèles (Audit, Accompagnement, Extraction…) et leurs tâches types. |

`lire_reglages` donne aussi les référentiels des projets (phases, statuts, natures, assignés, statuts de facture).

**Écriture (bibliothécaire et Claude Code)**

| Outil | Règle de l'écran reprise |
|---|---|
| `creer_projet` | Titre obligatoire, modèle (tâches datées à partir du début), dates, offre. |
| `creer_projet_depuis_affaire` | « Créer le projet » d'une affaire **gagnée** : lie l'affaire (un seul projet), range l'extraction faite à Gagné si rien n'y a été fait. |
| `modifier_projet` | Titre, personne, organisation, offre, dates, dépôt, dossier. |
| `changer_phase_projet` | Dans tous les sens ; **vers Clôture, refusé tant qu'une facture est à payer**. |
| `mettre_projet_en_pause`, `reprendre_projet`, `rouvrir_projet`, `archiver_projet` | Comme les boutons de la fiche. |
| `terminer_projet` | Clôture + **extraction de valeur** (une seule par projet). **Refusé tant qu'une facture est à payer** : le refus nomme les factures. Sortie : `impaye: { raison }` (les factures restantes passent à « abandonnee », le projet garde sa pastille « Impayé »). |
| `extraire_valeur_projet` | Extraction à la main, sans attendre la fin du projet ; une seule par projet (la même est rendue si elle existe). |
| `ajouter_tache_projet`, `terminer_tache_projet` | Phase du projet par défaut ; la tâche faite écrit son événement. |
| `ajouter_facture`, `marquer_facture_payee`, `abandonner_facture` | Une ligne par échéance ; une facture payée compte dans l'encaissé du mois du paiement ; l'abandon exige une raison. |

**Suppression (Claude Code seul)** : `supprimer_projet` (confirmation par le titre, comme l'écran) supprime le projet, ses tâches et son fil ; l'affaire d'origine et les extractions qui le citent sont gardées, leur lien vidé. Récupérable avec `restaurer_depuis_audit`.

## À savoir

- **Hermes** : la liste d'outils autorisés du guide `branchement-mcp.md` est mise à jour (44 outils pour le bibliothécaire). Si tu as déjà collé l'ancienne liste dans la configuration de Hermes, remplace-la par celle du guide ; sans cela, Hermes ne verra pas les nouveaux outils (le serveur, lui, refuse de toute façon tout outil hors profil).
- Il n'y a pas d'outil pour modifier ou supprimer une facture, ni pour supprimer une tâche, ni pour gérer les modèles : ça se fait à l'écran.
- Aucun outil ne contourne les règles : un projet à facture impayée ne se clôture jamais par erreur ; l'agent doit dire explicitement `impaye` avec une raison.

## Tests

`ecriture-outils.test.js` : droits par profil, création (règles, modèle, événement), projet d'une affaire gagnée, phases et pauses, fin de projet et extraction unique, extraction à la main, tâches, factures 30/30/40 avec refus de clôture et sortie impayé, abandon, lecture (filtres, fiche, fil, modèles, référentiels), suppression avec restauration à l'identique, restauration d'une création.
