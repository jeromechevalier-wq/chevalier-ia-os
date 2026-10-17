# Chevalier IA OS : consignes pour Claude

Ce fichier est lu au début de chaque session. Il garde les décisions de Jérôme qui doivent survivre d'une session à l'autre.

## Décisions permanentes de Jérôme (ne pas les remettre en cause de toi-même)

- **RGPD (04/10/2026)** : la base de Chevalier IA OS est **interne**. Jérôme choisit de **ne prendre aucune mesure RGPD** pour l'instant. Les journaux d'audit **ne s'effacent jamais** : on garde tout, y compris les valeurs reçues (noms, e-mails, notes) et les copies « avant ». Plus de règle de durée de vie (TTL) de 90 jours (Jérôme a supprimé la règle dans la console le 04/10/2026). **Quand le RGPD deviendra nécessaire, Jérôme le dira** : ne le réintroduis pas, ne le propose pas comme un « écart à corriger ».
- **Aucune porte dérobée** dans le code du serveur MCP (décision du 02/10/2026) : accès de secours par l'identité Google de Jérôme, interrupteurs d'urgence dans `docs/securite-et-pannes.md`.

## Façon de travailler avec Jérôme

- Explique simplement, comme à quelqu'un de 18 ans.
- Quand Jérôme doit faire quelque chose dans la console Google, GitHub ou le Terminal : donne le **lien exact** et dis **où cliquer**.
- **Fusion des PR** (accord général de Jérôme, 2026-10-16) : Claude fusionne lui-même les PR, une par étape cohérente, **uniquement par la PR** (jamais de poussée directe sur `main`), et **seulement si toute la suite de tests est verte**. Un push sur `main` met le vrai CRM de Jérôme à jour : Claude s'arrête et demande d'abord si la PR modifie des données existantes de Jérôme, les règles Firestore, ou ce que son CRM affiche de façon visible. Il ne déploie jamais la plateforme clients (workflow manuel) sans Jérôme.
- Jérôme ne lance pas `npm test` sur son Mac : **lance la suite complète toi-même** dans la session (`cd tests && npm install && npm run installer-fonctions && npm test`, environ 5 minutes).
- **Avant de rendre la main** : donne une liste de recette (5 vérifications à l'écran pour Jérôme), décris le cas vide et le cas d'erreur de chaque écran, et dis ce que tu n'as pas pu vérifier avec le vrai système.
- **Puissance** : l'architecte (qui décide, écrit le brief et relit) a besoin de plus de puissance ; un exécutant peut être faible si la consigne est précise (sinon, précise d'abord la consigne). Au début d'une session, c'est toi qui juges si le niveau (modèle et effort) donné suffit, et tu le dis tout de suite si c'est trop bas.
- Jamais de jeton, de secret ni de clé dans la conversation, le dépôt ou un commit.

## Au démarrage d'une session

1. Lis `docs/roadmap.md` (état et décisions).
2. Lis `docs/reprise-prochaine-session.md` : ce qui reste à faire en premier.
3. Pour tout ce qui touche au serveur MCP : `docs/plan-mcp.md`, `docs/securite-et-pannes.md`, `docs/playbook-mcp-firebase.md`.
