# Audit des boutons qui retirent ou suppriment (version 2.7.4, 17/10/2026)

**Règle de l'appli (décision de Jérôme)** : tout bouton « Retirer » / « Supprimer » ouvre d'abord une **fenêtre de confirmation** ; puis, quand l'action peut être défaite, un message en bas **« Retiré · Annuler »** reste affiché **8 secondes** (`js/os/retrait.js`, `retirerAvecAnnulation`). Une action qui ne peut pas être défaite n'a que la confirmation.

| Bouton (écran) | Avant | Maintenant |
|---|---|---|
| Retirer un lien ou un document (Liens et documents, projet et affaire) | rien (retrait direct) | confirmation + « Annuler » 8 s (le fichier n'est jamais touché) |
| Retirer le dossier de travail (affaire et projet) | rien (n'existait pas ainsi) | confirmation + « Annuler » 8 s (seul le lien est retiré, rien n'est supprimé dans Drive) |
| Retirer le dossier parent Drive (Réglages) | rien | confirmation + « Annuler » 8 s |
| Retirer un sous-dossier (Réglages) | rien | confirmation + « Annuler » 8 s |
| Retirer une valeur de liste (secteurs, sources), une étiquette, supprimer un filtre enregistré, supprimer un modèle d'affaire (Réglages) | confirmation seule | confirmation + « Annuler » 8 s |
| Détacher l'organisation d'une personne (fiche personne) | rien | confirmation + « Annuler » 8 s |
| Supprimer une tâche (projet), une activité / un point clé, une note | confirmation seule | **inchangé : confirmation seule.** Pas d'« Annuler » : la suppression efface le document (la récupération passe par le Journal du CRM) ; à reprendre si Jérôme le veut |
| Supprimer définitivement une personne, une organisation, une affaire, un projet | fenêtre de confirmation forte | inchangé (confirmation seule, récupération par le Journal du CRM) |
| Supprimer une facture ; abandonner une facture ; supprimer un modèle de projet ou une tâche type | confirmation | inchangé (confirmation seule) |
| Détacher l'affaire d'un projet / le projet d'une affaire | confirmation | inchangé (confirmation seule ; l'annulation demande de relier : à reprendre) |
| Archiver / Désarchiver ; archiver une offre | direct, réversible par le bouton inverse | inchangé |
| Retirer le logo ou une image de la page de connexion (Réglages > Mon espace, 2.10.0) | n'existait pas | confirmation + « Annuler » 8 s ; **le fichier n'est supprimé qu'après les 8 secondes** (Annuler = rien n'a été écrit) |
| Retirer un membre (Réglages > Membres et rôles, 2.10.0) | n'existait pas | confirmation + « Annuler » 8 s (Annuler recrée le membre avec le même rôle et le même nom). Se retirer soi-même : confirmation « Tu vas perdre l'accès de ce compte à l'espace », sans « Annuler » (on n'a plus accès pour le défaire). Le dernier éditeur ne se retire jamais |
| Pastilles « retirer le filtre » (listes), croix d'un champ à choix | filtre d'affichage, rien n'est supprimé | inchangé |

**Pas d'« Annuler » là où il faudrait recréer un enregistrement avec son historique** (tâches, activités, notes, personnes, organisations, affaires, projets, factures) : la couche de données n'a pas (encore) de « recréer à l'identique » côté écran. C'est dit ici plutôt que caché.
