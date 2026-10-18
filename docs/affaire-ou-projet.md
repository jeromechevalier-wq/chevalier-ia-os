# Affaire ou projet : lequel utiliser ?

Écrit le 18/10/2026 pour Jérôme, en attendant une vraie aide pour les clients. Page courte, sans jargon, à pouvoir expliquer à voix haute. Aucun secret ici.

## L'idée en deux phrases

- **Une affaire**, c'est **une vente à conclure** : on avance d'étape en étape jusqu'à « Gagné » ou « Perdu ».
- **Un projet**, c'est **un travail à organiser** : on avance de phase en phase, avec des tâches à cocher, qu'il soit lié à une vente ou non.

## Le tableau

| | Affaire | Projet |
|---|---|---|
| Question | « Va-t-on signer ? » | « Comment fait-on le travail ? » |
| Avance par | **étapes** de vente | **phases** (Lancement, Découverte, Livraison, Clôture) |
| Contient | des **activités** (appel, rendez-vous, e-mail, note) et un montant | des **tâches**, et aussi des **activités**, des notes et des factures |
| Se termine par | Gagné ou Perdu | Terminé (puis Archives) |
| Exemple | « Pizzeria de Manosque : devis site web » | « Pizzeria de Manosque : réaliser le site » |

**Les tâches n'existent que dans les projets.** Sur une affaire, un « à faire » est une **activité planifiée** (avec un type, une date et une heure).

## Comment ils s'enchaînent

1. On crée l'**affaire** quand on parle à un prospect, et on la fait avancer.
2. Quand elle passe en **Gagné**, l'appli propose de créer un **projet** avec les tâches d'un modèle.
3. Quand le **projet** se termine, l'appli crée toute seule un **projet d'extraction** pour garder ce qu'on a appris (règles, erreurs, documentation marketing). Une affaire **perdue** en crée un aussi.

## Un projet peut aussi vivre seul

Un projet n'a **pas besoin** d'une affaire : un chantier interne, un travail offert, un client déjà signé avant l'outil. Seul le titre est obligatoire. Chez Pipedrive, c'est pareil pour les données : un projet sert à organiser le travail lié à un client avant, pendant ou après une vente, et il peut être lié à une affaire ou pas. En revanche, Pipedrive ne vend pas les projets seuls : pour utiliser Projects, il faut aussi avoir l'app Deals (affaires).

## D'où vient cette façon de faire

On s'est inspiré de Pipedrive, avec nos propres mots. Ses pages d'aide officielles (en anglais) :

- [Deals vs. projects: when to use each](https://support.pipedrive.com/en/article/projects-vs-deals)
- [Projects: how to plan your project](https://support.pipedrive.com/en/article/projects-tasks-and-subtasks)
- [Activities](https://support.pipedrive.com/en/article/activities)
- [Projects: billing and subscription](https://support.pipedrive.com/en/article/projects-billing-and-subscription) (accès : Deals + Projects)

## Limite connue

Les **données** n'obligent pas un projet à avoir une affaire, mais l'**activation des modules** garde un ancien lien : dans `js/os/registre.js`, le module « Projets » déclare qu'il dépend de « Affaires ». Un espace qui ne veut que des projets doit donc allumer aussi le module « Affaires ». Chez Pipedrive aussi, Projects demande l'app Deals ; nous pourrions faire mieux. À lever dans une PR dédiée (voir la roadmap).
