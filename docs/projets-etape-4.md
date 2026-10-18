# Écran Projets, étape 4 sur 7 : les tâches des projets (06/10/2026)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Une tâche appartient à un projet et à une phase. Les tâches **datées et non faites** d'un projet **vivant** remontent dans « En retard » et « Aujourd'hui » de l'Accueil, avec le nom du projet : une seule liste du matin, sans mélanger les modèles de données (collection séparée `projets_taches`).

## Ce qui est construit

- **Section « Tâches » de la fiche projet** : une liste par phase (seules les phases qui ont des tâches s'affichent), avec le nombre de faites sur le total. Ajout rapide : titre (obligatoire), phase (celle du projet par défaut), date facultative avec les boutons Demain, +3 jours, +1 semaine, +2 semaines. Chaque tâche a une case à cocher, son titre, un badge « En retard » ou « Aujourd'hui », sa date, la personne à qui elle est confiée si ce n'est pas Jérôme, et un menu : Modifier… (titre, date, heure, confiée à Jérôme ou Charles, « Sans date »), Monter, Descendre, Déplacer vers une autre phase, Supprimer (avec confirmation).
- **Cocher une tâche** : elle passe à « faite » avec sa date, un événement « Tâche faite : … » entre dans l'historique du projet, on peut la décocher. Une tâche déplacée dans une autre phase se place à la fin de cette phase.
- **Avancement** : une ligne « Avancement » dans le Résumé du projet (« 2 / 5 tâches » et un cercle), et un **cercle d'avancement sur la carte** du Kanban (il n'existe que si le projet a des tâches).
- **Retard** : un projet actif est « en retard » si sa fin prévue est dépassée **ou** si une de ses tâches non faites a une date passée (badge « En retard » et pastille rouge sur la carte, filtre « En retard »).
- **Accueil** : les tâches en retard et du jour apparaissent parmi les activités du CRM, mêlées par date et heure, avec un lien vers le projet. « Fait » les coche (et Charles félicite quand tout est fait, comme pour les activités). Ne comptent pas : les tâches sans date, à venir, déjà faites, et celles d'un projet en pause, terminé ou archivé.
- Toutes les écritures passent par des plans testés (`projets/logique.js`) et laissent leur trace dans le Journal. Supprimer un projet supprime ses tâches. Les tâches sont déjà dans l'export JSON complet.

## Choix faits, à contredire si besoin

- **Monter / Descendre par le menu** plutôt que glisser déposer pour réordonner : cela marche pareil sur téléphone et au clavier. Le glisser déposer pourra venir si tu le veux.
- **Toutes les tâches sont montrées à Jérôme comme à Charles** dans l'Accueil (comme les activités du CRM) : le champ « confiée à » est enregistré et affiché, mais ne filtre rien pour l'instant.
- Les tâches d'un projet **en pause** ne remontent pas dans l'Accueil (comme les activités d'une affaire en pause) ; elles y reviennent à la reprise.
- Pas de tâche sans projet, pas d'heure sans date (l'heure est effacée avec la date).

## À faire dans les étapes suivantes

- **Étape 5** : modèles de projet (les tâches d'un modèle sont créées avec le projet, dates calculées d'après le démarrage).
- **Étape 6** : l'extraction de valeur utilise ces tâches (modèle « Extraction » à quatre tâches).
