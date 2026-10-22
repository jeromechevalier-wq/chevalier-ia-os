# Vocabulaire de Chevalier IA OS

Un mot = une seule chose. Cette page dit quel mot désigne quoi (décision de Jérôme, 22/10/2026).

## En une phrase
- Une **affaire** avance d'**étape** en **étape** (le pipeline des ventes).
- Un **projet** avance de **phase** en **phase** (le pipeline des projets).
- Une **phase** contient des **livrables** : ce qu'on remet au client.
- Une **activité** est un événement daté dans le fil d'une affaire ou d'un projet : Appel, Rendez-vous, Email ou Tâche.

## Tableau
| Ce que c'est | Mot | Où on le voit | Outils MCP |
|---|---|---|---|
| Une case du pipeline des affaires (Premier contact, Rendez-vous fixé…) | **Étape** | kanban des affaires, liste « Étape » du Résumé | `changer_etape` |
| L'état d'une affaire | **Statut** : Ouverte, Gagnée, Perdue, En pause | étiquette sous le titre | `marquer_perdue`, `mettre_en_pause`, `rouvrir_affaire` |
| Une case du pipeline des projets (Lancement, Découverte, Livraison, Clôture) | **Phase** | fiche projet, liste « Phase » du Résumé | `changer_phase_projet` |
| L'état d'un projet | **Statut** : Actif, En pause, Terminé | étiquette sous le titre | `mettre_projet_en_pause`, `reprendre_projet`, `terminer_projet`, `rouvrir_projet` |
| Une chose à produire dans une phase de projet | **Livrable** | section « Livrables », Résumé « Avancement » | `ajouter_livrable_projet`, `terminer_livrable_projet` |
| Un événement daté dans le fil | **Activité** (type Appel, Rendez-vous, Email, **Tâche**) | onglet Activité, Points clés | `creer_activite`, `terminer_activite` |

## Ce qui a changé le 22/10/2026
| Avant | Maintenant |
|---|---|
| « Tâche » d'un projet | **Livrable** (la section, « 0 / 1 livrable », « Livrable fait : … », « Confié à », « Marquer comme fait ») |
| `ajouter_tache_projet` | `ajouter_livrable_projet` (ancien nom retiré, sans alias) |
| `terminer_tache_projet` | `terminer_livrable_projet` (ancien nom retiré, sans alias) |
| clé `taches` dans `lire_projet` et `lister_modeles_projet` | clé `livrables` |
| « Tâche » dans le journal des modifications (collection projets) | « livrable de projet » |

## Ce qui ne change pas
- Le type d'activité **« Tâche »** (pastille, `creer_activite`, `terminer_activite`) : il est maintenant proposé aussi sur la fiche projet.
- Les **étapes** d'affaires et les **phases** de projets gardent leur nom.
- Ce qui est stocké ne change pas : la collection `projets_taches`, le type d'événement `tache_faite` et les identifiants. Les événements déjà dans l'Historique gardent leur ancien texte (« Tâche faite : … »). Aucune donnée n'a été migrée.

## À savoir
- « Livrables » est aussi le nom de sous-dossier proposé par défaut dans Google Drive : aucun conflit technique.
- Les mots à ne pas écrire dans ce que l'utilisateur voit : « CRM », « répertoire » (on dit « dossier »).
