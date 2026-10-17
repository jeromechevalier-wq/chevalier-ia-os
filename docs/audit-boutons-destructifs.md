# Audit des boutons qui retirent ou suppriment (version 2.7.5, 17/10/2026, mis à jour après relecture)

**Règle de l'appli (décision de Jérôme)** : tout bouton « Retirer » / « Supprimer » ouvre d'abord une **fenêtre de confirmation** ; puis, quand l'action peut être défaite, un message en bas **« Retiré · Annuler »** reste affiché **8 secondes** (`js/os/retrait.js`, `retirerAvecAnnulation`). Une action qui ne peut pas être défaite n'a que la confirmation.

| Bouton (écran) | Avant | Maintenant |
|---|---|---|
| Retirer un lien ou un document (Liens et documents, projet et affaire) | rien (retrait direct) | confirmation + « Annuler » 8 s (le fichier n'est jamais touché) |
| Retirer le dossier de travail (affaire et projet) | rien (n'existait pas ainsi) | confirmation + « Annuler » 8 s (seul le lien est retiré, rien n'est supprimé dans Drive) |
| Retirer le dossier parent Drive (Réglages) | rien | confirmation + « Annuler » 8 s |
| Retirer un sous-dossier (Réglages) | rien | confirmation + « Annuler » 8 s |
| Retirer une valeur de liste (secteurs, sources), une étiquette, supprimer un filtre enregistré, supprimer un modèle d'affaire (Réglages) | confirmation seule | confirmation + « Annuler » 8 s |
| Détacher l'organisation d'une personne (fiche personne) | rien | confirmation + « Annuler » 8 s |
| Supprimer une tâche (projet), une activité / un point clé, une note | confirmation seule (2.7.4 : le message « Annuler » ne s'affichait pas) | confirmation + « Supprimé · Annuler » 8 s : « Annuler » **recrée la fiche à l'identique** (même identifiant, mêmes champs ; seuls les champs calculés à l'affichage ne sont pas rangés) |
| Supprimer définitivement une personne, une organisation, une affaire, un projet | fenêtre de confirmation forte | inchangé (confirmation seule, récupération par le Journal du CRM) |
| Supprimer une facture ; supprimer un modèle de projet ; supprimer une tâche type | confirmation | confirmation + « Annuler » 8 s (facture : toutes les factures du projet reviennent comme avant ; modèle : recréé à l'identique ; tâche type : liste d'avant) |
| Abandonner une facture | fenêtre avec raison | inchangé : ce n'est pas une suppression, et « Remettre à payer » la défait |
| Détacher l'affaire d'un projet / le projet d'une affaire | confirmation | confirmation + « Annuler » 8 s (l'annulation relie à nouveau les deux fiches) |
| Archiver / Désarchiver ; archiver une offre | direct, réversible par le bouton inverse | inchangé |
| Retirer le logo ou une image de la page de connexion (Réglages > Mon espace, 2.10.0) | n'existait pas | confirmation + « Annuler » 8 s ; **le fichier n'est supprimé qu'après les 8 secondes** (Annuler = rien n'a été écrit) |
| Retirer un membre (Réglages > Membres et rôles, 2.10.0) | n'existait pas | confirmation + « Annuler » 8 s (Annuler recrée le membre avec le même rôle et le même nom). Se retirer soi-même : confirmation « Tu vas perdre l'accès de ce compte à l'espace », sans « Annuler » (on n'a plus accès pour le défaire). Le dernier éditeur ne se retire jamais |
| Pastilles « retirer le filtre » (listes), croix d'un champ à choix | filtre d'affichage, rien n'est supprimé | inchangé |

**Pas d'« Annuler » là où la fiche supprimée entraîne d'autres fiches ou un historique** (personnes, organisations, affaires, projets : leurs activités, notes, événements partent avec ; factures : stockées dans le projet) : seule la confirmation s'applique, et la récupération passe par le Journal du CRM. C'est dit ici plutôt que caché. Aucune suppression réelle n'est jugée irréversible dans cette liste (une facture payée supprimée revient aussi : on restaure la liste des factures du projet). Chaque retrait réversible a un test nommé « P2 … » (`tests/e2e/corrections-dossiers-2.spec.js`) qui vérifie que le message « Annuler » apparaît et restaure ; un test vérifie aussi que le message disparaît après 8 secondes.
