# Vision : Chevalier IA OS (BROUILLON)

> **Statut : brouillon du 2026-10-02**, préparé par Claude à partir de ce qui est déjà écrit (cahier des charges v1.1, `crm-decisions-entretien.md`, décisions du 2026-09-30 notées dans le second cerveau). Rien ici n'est validé par Jérôme. Les passages marqués **[À compléter par Jérôme]** sont des choses que les sources ne disent pas : elles ne sont pas inventées. Ce document suit la bonne pratique « documenter chaque upgrade : cahier des charges, pourquoi, **vision**, leçons » (fiche « Bonnes pratiques communes à tous mes systèmes » du second cerveau).

## 1. Ce que Chevalier IA OS est censé être

Un **espace de travail en ligne** pour Chevalier IA, utilisé par Jérôme et Charles (l'assistant IA), conçu comme un « OS » : une coquille commune (connexion Google, menu, thèmes) dans laquelle s'ajoutent des modules (cahier des charges, section 1).

## 2. Où l'on voulait aller en v1.0 (29/09/2026)

- Un seul module, le **CRM de prospection**, pour ne perdre aucun prospect de vue, ne rater aucune relance et voir ses objectifs du mois dès l'ouverture.
- D'autres modules à terme, partageant la même base (cahier des charges, sections 1 et 12 : « autres modules de l'OS »).
- Un outil agréable, fidèle à l'identité de chevalier-ia.fr, avec Charles présent.
- Critère de succès à 3 mois : beaucoup de prospects saisis, des cartes qui avancent, les objectifs mensuels suivis.

## 3. Où la vision a bougé le 30/09/2026

Le lendemain de la mise en ligne, Jérôme a décidé que le **CRM vit dans Notion** et que l'OS devient un **agrégateur** : il va chercher des données dans les outils où elles vivent déjà (Notion pour la prospection, le Drive pour les projets actifs, plus tard la banque) et n'affiche que quelques chiffres de synthèse, avec n8n comme passerelle. Le module CRM Firestore reste en ligne, gelé, sans donnée réelle. Pourquoi : une seule interface au quotidien, rien à maintenir en code pour le suivi des prospects, et la structure du CRM de l'OS ne lui convenait pas « à l'arrivée ». Détail du raisonnement : fiche « Décision - le CRM vit dans Notion, l'OS devient un agrégateur » du second cerveau.

Ordre retenu à ce jour : CRM dans Notion et saisie des vrais prospects, puis 2 ou 3 chiffres remontés par n8n, puis le Drive, puis un Charles conversationnel, la banque en dernier et seulement si nécessaire.

## 4. Garde-fou de fond

La priorité de fond reste de **trouver des clients** (voir la fiche « Biais produit - construire avant d'avoir un client ») : l'OS est un outil interne, il ne justifie du temps que s'il rapproche du premier client qui paie.

## 5. À écrire, que seul Jérôme peut dire

- **[À compléter par Jérôme]** Ce que doit être l'OS dans un an : quels modules, pour qui (toujours Jérôme et Charles seuls, ou aussi des clients ?).
- **[À compléter par Jérôme]** À quoi l'on saura que l'OS est un succès après la bascule vers l'agrégateur : les chiffres affichés, la fréquence d'usage.
- **[À compléter par Jérôme]** Ce que l'OS ne sera jamais (limites volontaires).
- **[À compléter par Jérôme]** Le sort du module CRM Firestore gelé : réutilisé, archivé ou retiré. Point resté non tranché le 2026-09-30.

## 6. Document frère à rédiger

Un document de **leçons apprises** (`docs/lecons-apprises.md`) manque aussi : ce que la v1.0 a appris (par exemple, un CRM construit avant toute saisie de vrais prospects a été déplacé le lendemain). Il n'est pas encore rédigé.
