# Demande d'évolution : indicateur « Chiffre d'affaires signé »

Rédigée le 10/10/2026 à la demande de Jérôme. **Statut : à valider par Jérôme. Aucun code n'est écrit.**

## Pourquoi

Jérôme suit 4 indicateurs principaux de son activité : posts LinkedIn publiés (à la main), contacts de prospection et rendez-vous / interviews JTBD réalisées (déjà dans l'outil), et le **chiffre d'affaires signé** (absent). L'Accueil ne montre aujourd'hui que le **chiffre d'affaires encaissé** (argent reçu : factures payées).

La différence compte : le signé dit si la vente marche, l'encaissé dit quand l'argent arrive. Un contrat de 3 600 € signé en octobre mais payé de novembre à avril apparaît en octobre dans le signé, et par morceaux dans l'encaissé.

## Décisions de Jérôme (10/10/2026)

- **Une vente est signée** quand le devis est accepté ou le contrat signé, c'est-à-dire quand l'affaire passe à l'étape **Gagné**.
- **Prestation étalée** (accompagnement sur plusieurs mois, abonnement) : on compte le **total du contrat en une fois**, le mois de la signature.

## Ce que l'outil contient déjà (relevé dans le code)

- Une affaire porte un champ `montant`, facultatif (peut être vide).
- Passer à Gagné écrit la date dans `datesEtapes.gagne`, et l'étape « Gagné » est la fin de la vente.
- Les factures vivent dans le **projet**, pas dans l'affaire. Elles servent à l'encaissé, pas au signé.

## Proposition

**Définition.** CA signé du mois = somme des `montant` des affaires dont la date `datesEtapes.gagne` tombe dans ce mois civil (fuseau Europe/Paris, comme les autres objectifs).

**Où l'afficher.** Un 7e objectif calculé sur l'Accueil, « Chiffre d'affaires signé », à côté de « Chiffre d'affaires encaissé » (ajout dans la liste des objectifs calculés du cahier des charges, section 6.1). Sa cible se règle dans Réglages, comme les autres. Je propose aussi un second trait dans le graphique, signé et encaissé côte à côte (à confirmer, voir questions).

**Accès par Claude (MCP).** L'outil existant de lecture des indicateurs doit renvoyer le signé en plus de l'encaissé, pour que le suivi puisse se faire depuis le téléphone ou par Charles.

## Cas particuliers à trancher

| Cas | Proposition |
|---|---|
| Affaire gagnée **sans montant** | Elle ne compte pas, et l'Accueil signale « 1 affaire gagnée sans montant » pour ne pas sous-estimer le chiffre en silence. |
| Affaire **gagnée puis perdue ou rouverte** | Elle sort du signé. Le chiffre suit l'état actuel de l'affaire. |
| **Montant modifié** après la signature | Le chiffre suit le nouveau montant. |
| Projet créé **sans affaire** | Il ne compte pas dans le signé, faute de date de signature. |
| Affaire gagnée avant le début d'activité (`reglages.debutActivite`) | Elle ne compte pas. |

## Questions ouvertes pour Jérôme

1. Les cas du tableau te conviennent-ils, en particulier « gagnée puis perdue = ça sort du signé » ?
2. Veux-tu le signé et l'encaissé dans le même graphique, ou seulement un nouvel objectif chiffré ?
3. Quelle cible mensuelle pour le signé ? Je n'ai pas de chiffre validé de ta part, donc je n'en propose pas.

## Hors périmètre

Pas de reconnaissance du chiffre d'affaires étalé dans le temps, pas de revenu récurrent séparé, pas de reprise des anciennes affaires hors règles ci-dessus.

## Travail prévu une fois validée

Une PR : règle pure dans `js/modules/crm/logique.js`, ligne dans les objectifs de l'Accueil, outil MCP, tests (règles pures, bornes du mois, cas du tableau) puis suite complète lancée dans la session, mise à jour du cahier des charges. La PR n'est fusionnée qu'après ton « fusionne ».
