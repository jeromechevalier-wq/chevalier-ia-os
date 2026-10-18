# Chevalier IA OS : consignes pour Claude

Ce fichier est lu au début de chaque session. Il garde les décisions de Jérôme qui doivent survivre d'une session à l'autre.

## Où est le code
Dossier de travail : **`/Users/jeromechevalier/Code-Chevalier-IA/chevalier-ia-os`**, un clone hors de Google Drive depuis le 18/10/2026 (dépôt de référence : https://github.com/jeromechevalier-wq/chevalier-ia-os). L'ancien dossier Drive est renommé « chevalier-ia-os (ancien - ne plus utiliser) » : n'y travaille pas. Les copies de session sont dans `/Users/jeromechevalier/chantiers-crm/`.

## Décisions permanentes de Jérôme (ne pas les remettre en cause de toi-même)

- **RGPD (04/10/2026)** : la base de Chevalier IA OS est **interne**. Jérôme choisit de **ne prendre aucune mesure RGPD** pour l'instant. Les journaux d'audit **ne s'effacent jamais** : on garde tout, y compris les valeurs reçues (noms, e-mails, notes) et les copies « avant ». Plus de règle de durée de vie (TTL) de 90 jours (Jérôme a supprimé la règle dans la console le 04/10/2026). **Quand le RGPD deviendra nécessaire, Jérôme le dira** : ne le réintroduis pas, ne le propose pas comme un « écart à corriger ».
- **Aucune porte dérobée** dans le code du serveur MCP (décision du 02/10/2026) : accès de secours par l'identité Google de Jérôme, interrupteurs d'urgence dans `docs/securite-et-pannes.md`.

## Façon de travailler avec Jérôme

- Explique simplement, comme à quelqu'un de 18 ans.
- Quand Jérôme doit faire quelque chose dans la console Google, GitHub ou le Terminal : donne le **lien exact** et dis **où cliquer**.
- **Fusion des PR** (accord général de Jérôme, 2026-10-16) : Claude fusionne lui-même les PR, une par étape cohérente, **uniquement par la PR** (jamais de poussée directe sur `main`), et **seulement si la coche GitHub « Tests » est verte**. Un push sur `main` met le vrai CRM de Jérôme à jour : Claude s'arrête et demande d'abord si la PR modifie des données existantes de Jérôme, les règles Firestore, ou ce que son CRM affiche de façon visible. Il ne déploie jamais la plateforme clients (workflow manuel) sans Jérôme.
- **Process de recette (2026-10-17)** : avant de coder, lis `docs/consignes-ui.md` (les règles d'interface de Jérôme). Chaque point du brief devient un critère d'acceptation observable (une phrase) avec UN test dont le nom commence par le numéro du point et UNE capture d'écran de l'état obtenu (sauvegardée et citée dans ta recette ; elle est tirée du parcours ciblé du module, en un seul format sauf si la mise en page change). Ne dis jamais « fait » pour un point sans test et capture. Les tests verts ne suffisent pas : la session principale regarde les captures avant de fusionner.
- **Avant de rendre la main** : donne une liste de recette (5 vérifications à l'écran pour Jérôme), décris le cas vide et le cas d'erreur de chaque écran, et dis ce que tu n'as pas pu vérifier avec le vrai système.
- **Puissance** : l'architecte (qui décide, écrit le brief et relit) a besoin de plus de puissance ; un exécutant peut être faible si la consigne est précise (sinon, précise d'abord la consigne). Au début d'une session, c'est toi qui juges si le niveau (modèle et effort) donné suffit, et tu le dis tout de suite si c'est trop bas.
- Jamais de jeton, de secret ni de clé dans la conversation, le dépôt ou un commit.

## Tests (décision du 18/10/2026)

- Pendant le travail : seulement les tests du module touché (`npm run test:module <nom>`).
- Avant d'ouvrir la PR : `npm run test:rapide` puis `npm run test:smoke`.
- La suite complète tourne sur GitHub, sur chaque PR et chaque nuit sur `main`. Ne jamais la lancer dans la session, ne jamais l'attendre.
- On fusionne quand la coche GitHub « Tests » est verte. Rien d'autre.
- Tout ce qui dépasse 2 minutes se lance en arrière-plan et on continue.
- Jamais deux suites de tests en même temps sur le Mac.
- Une PR, un sujet, fusionnée dans la journée. Deux chantiers en parallèle au maximum.
- `npm ci` seulement si `package-lock.json` a changé.
- Mode d'emploi pour Jérôme : `docs/tests.md`.

## Au démarrage d'une session

1. Lis `docs/roadmap.md` (état et décisions).
2. Lis `docs/reprise-prochaine-session.md` : ce qui reste à faire en premier.
3. Pour tout ce qui touche au serveur MCP : `docs/plan-mcp.md`, `docs/securite-et-pannes.md`, `docs/playbook-mcp-firebase.md`.
