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
| L'état d'une affaire | **Statut** : Ouverte, Gagnée, Perdue | étiquette sous le titre | `marquer_perdue`, `rouvrir_affaire` |
| Une case du pipeline des projets (Lancement, Découverte, Livraison, Clôture) | **Phase** | fiche projet, liste « Phase » du Résumé | `changer_phase_projet` |
| L'état d'un projet | **Statut** : Actif, Terminé | étiquette sous le titre | `terminer_projet`, `rouvrir_projet` |
| Une chose à produire dans une phase de projet | **Livrable** | section « Livrables », Résumé « Avancement » | `ajouter_livrable_projet`, `terminer_livrable_projet` |
| Un événement daté dans le fil | **Activité** (type Appel, Rendez-vous, Email, **Tâche**) | onglet Activité, bloc « À faire » | `creer_activite`, `terminer_activite` |

## Titres des livrables
Dans une phase, le groupe s'appelle « Livrable <Phase> » avec 0 ou 1 livrable et « Livrables <Phase> » avec 2 ou plus, sans majuscules.

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

## Mots de l'écran changés le 23/10/2026 (aucun identifiant ni donnée ne change)
| Avant | Maintenant | Remarque |
|---|---|---|
| « Tableau de bord » (module technique : clés, sauvegardes, surveillance) | **Maintenance** | identifiant `tableaudebord`, routes `#/tableaudebord/…` et tables `tableaudebord_*` inchangés pour l'instant (renommage technique prévu, avec alias) ; « Tableau de bord » est gardé pour le futur module d'analyse des indicateurs |
| « Objectifs du mois » | **Indicateurs** | la cible chiffrée d'un indicateur reste un « objectif » |
| « Points clés » | **À faire** (activités) et **Notes épinglées** (notes) | deux blocs séparés dans la colonne de droite des fiches |
| (proposé) « Prospection » à la place de « Affaires » | **refusé** : on garde « Affaires » | une affaire gagnée n'est plus de la prospection ; vocabulaire de Pipedrive ; le bouton « + Affaire » et les fiches gardent le mot |

## À savoir
- 22/10/2026 : plus de pause (décision de Jérôme) : une affaire est ouverte, gagnée ou perdue ; un projet est actif ou terminé ; pour relancer plus tard, planifier une activité.
- « Livrables » est aussi le nom de sous-dossier proposé par défaut dans Google Drive : aucun conflit technique.
- Les mots à ne pas écrire dans ce que l'utilisateur voit : « CRM », « répertoire » (on dit « dossier »).

## Module Devis (24/10/2026)
| Mot | Sens |
|---|---|
| **Bordereau** | la liste de prix des articles (le nom affiché est un réglage) |
| **Article** | une ligne du Bordereau (référence, marque, famille, prix) |
| **Ouvrage** | un groupe d'articles réutilisable, glissé dans un devis comme un bloc |
| **Famille** | le classement d'un article (une seule, pas de sous-famille) |
| **Texte** | une ligne de devis sans prix : un paragraphe |
| **Brouillon · Finalisé · Envoyé · Signé · Refusé · Remplacé** | les statuts d'un devis ; **Expiré** s'ajoute à l'affichage quand la date de validité est passée |
| **Variante** | une autre version d'un même devis (option, autre choix) |
| **Remise** | la réduction visible par le client (différente de la marge, qui reste interne) |
| **Acompte** | la part payée à la signature, calculée sur le TTC |
| **Retenue de garantie** | 5 % du TTC gardés par le client jusqu'à la fin de la garantie |
| **Net à payer** | le montant final après acompte, primes et retenue |

