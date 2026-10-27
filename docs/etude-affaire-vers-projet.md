# Étude : comment une affaire devient un projet (27/10/2026)

Question de Jérôme : une seule fiche continue ou deux fiches liées ? Que deviennent l'historique, le chiffre d'affaires, les devis, les documents et les notes ? Étude de cadrage, sans code.

## Réponse courte

- **Pipedrive garde deux fiches liées**, jamais une seule : l'affaire reste dans la liste des affaires (gagnée), le projet est une fiche à part qui pointe vers elle. L'argent (valeur, produits) reste sur l'affaire ; le projet montre les notes, fichiers et e-mails de l'affaire sans les déplacer.
- **Chez nous, c'est déjà ce modèle** (décision du 06/10/2026). Il marche. Seul écart avec Pipedrive : nous limitons à **un projet par affaire**, alors que Pipedrive en autorise plusieurs.
- **Recommandation : l'option B+ = garder les deux fiches liées, et améliorer le lien** (voir plus bas). Pas de fiche unique : cela casserait les données existantes et la décision du 03/10/2026 (données séparées).

## 1. Ce que fait Pipedrive

Sources lues (résumés de recherche sur les sites officiels) : [Deals vs. projects](https://support.pipedrive.com/en/article/projects-vs-deals), [Projects by Pipedrive](https://support.pipedrive.com/en/article/projects-by-pipedrive), [Projects : templates](https://support.pipedrive.com/en/article/projects-templates), [FAQ](https://support.pipedrive.com/en/article/projects-by-pipedrive-faq), [API Projects v1](https://developers.pipedrive.com/docs/api/v1/Projects), [API v2, 21/05/2026](https://developers.pipedrive.com/changelog/post/introducing-projects-api-v2).

- Depuis la fiche d'une affaire, on peut **marquer gagnée et créer un projet en même temps**, ou créer ou lier un projet depuis le panneau « Projets » de l'affaire, même si elle est encore ouverte. Depuis le kanban, on convertit l'affaire en projet et on choisit : la laisser ouverte ou la marquer gagnée.
- Le lien est **facultatif** : un projet peut exister avant la vente, après, ou sans affaire.
- **L'affaire reste.** Elle ne devient pas le projet ; sa fiche montre les projets liés pour suivre la livraison.
- Un projet lié reprend le contexte de l'affaire : **notes, fichiers et e-mails** (jusqu'à 50 affaires liées).
- L'interface Pipedrive et l'API prévoient **plusieurs affaires par projet et plusieurs projets par affaire** (liste `deal_ids` ; filtre par affaire).
- **Modèles de projet** : tâches et jalons planifiés à partir de la date de début ; applicables à la création ; une automatisation peut créer un projet depuis un modèle quand une affaire est gagnée.
- **Chiffre d'affaires** : les sources lues ne disent pas que le projet porte du revenu ; il reste sur l'affaire et ses produits.

**Non confirmé** : le site support.pipedrive.com et developers.pipedrive.com n'étaient pas ouvrables depuis la session (adresse non autorisée) ; je n'ai que les extraits donnés par la recherche. À vérifier : la liste exacte des champs copiés (titre, personne, organisation ?), le changement d'étape automatique de l'affaire, la règle exacte « un seul projet par affaire » (les extraits disent le contraire), et ce que devient la valeur de l'affaire.

## 2. Chez nous aujourd'hui

- Deux collections séparées (`crm_affaires`, `projets_projets`), décision du 03/10/2026. Lien dans les deux sens : `affaire.projetId` et `projet.affaireId`.
- « Créer le projet » (fiche affaire gagnée) et l'outil MCP `creer_projet_depuis_affaire` : le projet reprend titre, personne, organisation, offre, adresse GitHub et dossier ; la note épinglée de l'affaire est **copiée** dans celle du projet. On peut aussi lier un projet existant sans affaire, ou le détacher (rien n'est supprimé).
- **Au plus un projet par affaire**, et une affaire gagnée peut rester sans projet. Un projet peut naître sans affaire.
- Documents et notes de l'affaire : **montrés** dans le projet, restent sur l'affaire.
- **Devis** : rattachés à l'affaire (`affaireId`), ils y restent.
- **Chiffre d'affaires** : la vente est comptée une fois, au passage de l'affaire à « Gagnée » (montant de l'affaire). L'argent **encaissé** vient des factures payées du projet (version 2.2). Les étapes « Facture envoyée / payée » ne sont plus dans les affaires.
- Historique commercial (étapes, dates, perte, activités) : reste sur l'affaire.

## 3. Les options

**A. Une fiche continue** (l'affaire change de type et devient le projet).
- Utilisateur : une seule fiche, une seule chronologie. Mais la fiche change de nature et de vocabulaire (étapes puis phases), et le CA par étape devient flou.
- CA, devis, documents, notes : tout suit la fiche. Mais l'historique de vente se mélange à celui de la livraison.
- Effort : élevé (fusionner deux modules, migrer les données existantes, réécrire les outils MCP et les tests). Risque : élevé, touche les données de Jérôme, contredit la décision du 03/10.

**B. Deux fiches liées (aujourd'hui).**
- Utilisateur : une affaire gagnée (histoire de la vente) et un projet (livraison, factures). Il passe de l'une à l'autre par un lien.
- CA : vente sur l'affaire, encaissé sur le projet. Devis, documents, notes : sur l'affaire, montrés dans le projet.
- Effort : nul. Risque : deux endroits à regarder ; un seul projet par affaire gêne un contrat en plusieurs lots.

**C. Hybride = B+ : deux fiches liées, mais un seul fil visible.**
- Utilisateur : mêmes deux fiches, mais le projet affiche l'historique de la vente en lecture (étapes, dates, montant, devis acceptés), et l'affaire affiche l'avancement du projet (phase, % de tâches, factures payées / total). Option : plusieurs projets par affaire, comme Pipedrive.
- CA, devis, documents, notes : inchangés, simplement montrés des deux côtés. Les devis du projet viennent de l'affaire (jamais copiés).
- Effort : moyen, uniquement de l'affichage (pas de migration). Risque : faible. Si on autorise plusieurs projets par affaire, il faut revoir la règle « au plus un » (écran, MCP, tests) : risque moyen.

## 4. Recommandation

**Option C (B+)** : garder les deux fiches liées et rendre le lien visible dans les deux sens, sans rien migrer. Fidèle à Pipedrive, sans risque pour les données. Même code chez Jérôme et chez les clients, avec la même fonction branchée dans `functions/` et `functions-plateforme/` si un outil MCP bouge.

## 5. Questions pour Jérôme

1. Veux-tu **plusieurs projets pour une même affaire** (Pipedrive le permet) ou garder « un seul » ?
2. Dans le projet, veux-tu voir l'**historique de vente** et les **devis** de l'affaire ? Et sur l'affaire, l'**avancement du projet** et les factures payées ?
3. Le **chiffre d'affaires** : on garde « vente = affaire gagnée, encaissé = factures du projet » ?
4. Faut-il un bouton « **Marquer gagnée et créer le projet** » en une action, comme Pipedrive ?
5. Une affaire gagnée **sans projet** reste-t-elle permise ?
6. Autoriser Pipedrive dans le réseau de la session pour confirmer les points non vus (champs copiés, étape automatique) ?
