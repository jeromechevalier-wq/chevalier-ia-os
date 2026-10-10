# Demande d'évolution : objectif « Chiffre d'affaires signé »

Rédigée le 10/10/2026 à la demande de Jérôme. **Statut : décisions validées par Jérôme le 10/10/2026. Rien n'est codé. La réalisation attend son feu vert.**

## 1. Pourquoi

Jérôme suit 4 indicateurs principaux de son activité :

| # | Indicateur | Où il se trouve aujourd'hui |
|---|---|---|
| 1 | Posts LinkedIn publiés | À la main (Buffer / LinkedIn), hors de l'outil |
| 2 | Contacts de prospection | Déjà dans l'outil (objectif « Nouveaux contacts ») |
| 3 | Rendez-vous / premiers pas gratuits | Déjà dans l'outil (objectif « Interviews JTBD réalisées ») |
| 4 | Chiffre d'affaires signé | **Absent.** L'Accueil ne montre que le chiffre d'affaires **encaissé**. |

Le signé et l'encaissé sont deux choses différentes : le signé dit si la vente marche, l'encaissé dit quand l'argent arrive. Exemple : un contrat de 3 600 € signé en octobre et payé de novembre à avril compte 3 600 € en octobre dans le signé, et par morceaux dans l'encaissé.

## 2. Décisions de Jérôme (10/10/2026)

1. **Signée** = devis accepté ou contrat signé, c'est-à-dire l'affaire passe à l'étape **Gagné**.
2. **Prestation étalée** (accompagnement sur plusieurs mois, abonnement) : le **total du contrat** compte en une fois, le mois de la signature.
3. **Un nouvel objectif chiffré, rien de plus.** Pas de graphique, pas de courbe signé / encaissé : ce sont deux choses séparées.
4. **Cible mensuelle : 1 000 €.**
5. Les cas particuliers de la section 4 sont acceptés tels quels.

## 3. Définition

**CA signé du mois** = somme des `montant` des affaires qui sont aujourd'hui à l'étape Gagné, dont la date de passage à Gagné (`datesEtapes.gagne`) tombe dans ce mois civil, fuseau Europe/Paris (même règle de mois que les autres objectifs).

## 4. Cas particuliers (acceptés)

| Cas | Règle |
|---|---|
| Affaire gagnée **sans montant** | Elle ne compte pas. L'Accueil signale « N affaire(s) gagnée(s) sans montant » pour ne pas sous-estimer le chiffre en silence. |
| Affaire **gagnée puis perdue ou rouverte** | Elle sort du signé : le chiffre suit l'état actuel de l'affaire. |
| **Montant modifié** après la signature | Le chiffre suit le nouveau montant. |
| **Projet créé sans affaire** | Il ne compte pas (pas de date de signature). |
| Affaire gagnée **avant le début d'activité** (`reglages.debutActivite`, octobre 2026) | Elle ne compte pas. |

## 5. Ce que l'outil contient déjà (relevé dans le code le 10/10/2026)

- `js/modules/crm/logique.js`, `nouvelleAffaire` : une affaire a un champ `montant`, facultatif (`null` s'il est vide).
- Les affaires gardent la date de chaque étape dans `datesEtapes` ; `datesEtapes.gagne` existe donc.
- Les objectifs de l'Accueil sont une liste de calculs `CALCULS` (dont `ca_encaisse`) et une liste de départ `OBJECTIFS_DEPART`, avec cible, unité (€), couleur et ordre ; la cible se règle dans Réglages.
- `ca_encaisse` additionne les encaissements des affaires et les factures **payées** des projets. Il ne regarde pas le signé.
- La vente s'arrête à « Gagné » depuis la 2.2 ; les anciennes étapes « Facture envoyée » et « Facture payée » sont migrées vers « Gagné » (`ETAPES_RETIREES`).

## 6. Points techniques à vérifier avant de coder

Relevés à la lecture du code, **pas encore testés** :

1. **Objectifs déjà enregistrés.** Les objectifs semblent être stockés en base (`os_objectifs`) à partir de `OBJECTIFS_DEPART`. Si c'est le cas, ajouter une ligne dans la liste de départ ne suffit pas pour l'Accueil de Jérôme : il faudra aussi créer l'objectif dans sa base (migration ou création depuis Réglages). À confirmer dans le code de chargement des objectifs.
2. **Date de signature conservée à la première fois.** La règle qui écrit l'événement « Affaire gagnée » (`logique.js`, vers la ligne 651) n'agit que si `datesEtapes.gagne` n'existe pas encore. À vérifier : si une affaire est rouverte puis re-gagnée, la date reste-t-elle celle de la première signature ? Si oui, le signé irait dans le mauvais mois ; il faudrait réécrire la date à chaque passage à Gagné.
3. **Affaires migrées.** Les anciennes affaires « Facture payée » migrées vers Gagné gardent-elles une date `datesEtapes.gagne` ? Sinon elles sont ignorées, ce qui est cohérent avec l'activité qui commence en octobre 2026, mais à confirmer.
4. **Doublon de code.** `functions/partage/logique.js` est une copie générée de `js/modules/crm/logique.js` (`node scripts/preparer-fonctions.js`) : à régénérer après la modification.

## 7. Périmètre de la réalisation

**Dans le périmètre :**
- Un calcul `ca_signe` dans `CALCULS` et une ligne dans `OBJECTIFS_DEPART` (cible 1 000 €, unité €).
- La création de l'objectif dans la base de Jérôme (voir point 6.1).
- Le message « N affaire(s) gagnée(s) sans montant » sur l'Accueil.
- L'outil MCP de lecture des indicateurs, s'il en existe un : renvoyer aussi le signé.
- Cahier des charges : section 6.1 et tableau des objectifs.
- Tests : calcul du mois, bornes du mois (fuseau Paris), les 5 cas de la section 4, affaire sans montant.

**Hors périmètre :**
- Graphique du signé, ou signé et encaissé ensemble.
- Revenu mensuel récurrent séparé, étalement du chiffre dans le temps.
- Reprise des anciennes affaires au-delà des règles de la section 4.
- Les indicateurs 1 à 3, qui n'ont besoin d'aucune évolution.

## 8. Façon de procéder

Une PR pour cette étape cohérente. La suite complète des tests est lancée dans la session avant la PR (`cd tests && npm install && npm run installer-fonctions && npm test`). Fusion uniquement après le « fusionne » de Jérôme, jamais de poussée sur `main`.

## 9. Question ouverte

Aucune sur la définition. Le seul point à trancher se résoudra en lisant le code (section 6) : si le point 2 se confirme, la règle de date devra changer, et Jérôme en sera averti avant la PR.
