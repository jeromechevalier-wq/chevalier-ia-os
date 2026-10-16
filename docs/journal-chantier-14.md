# Journal du chantier 14 (module Automatisations, ex-« journal d'activité des workflows n8n », phases 1 et 2)

> **Mise à jour du 16/10/2026** : le module `journal` est devenu `automatisations` (identifiant, routes, dossiers, fonctions, tests) et n'est plus réservé aux clients. Les noms ci-dessous sont ceux **de l'époque** ; la correspondance et la suite sont dans `docs/automatisations-n8n.md` (encadré en tête et partie 10).

Branche `claude/chantier-14-journal-workflows-4679bc`, PR n° 61. À lire en premier si la session est coupée.
Cahier des charges de Jérôme : <https://claude.ai/artifact/DqhJ4UZ4sucD93d2z7F56H> (remplace le plan « n8n pousse sa progression avec un jeton », étude section 7). Guide complet : `docs/automatisations-n8n.md` (ex-`journal-activite-workflows.md`).

## Fait (tout vert le 11/10/2026 : `npm test` complet, code 0)
- Module `journal` dans `js/os/registre.js` (`reserveAuxClients: true`), `MODULES` (CRM, inchangé) et `MODULES_CLIENT` dans `js/os/modules.js`, montage dans `espace-modules.js`.
- Règles Firestore : `workflows`, `executions` (+ `steps`), `sync` en lecture seule pour tous les navigateurs (tests J1 à J6).
- `functions-plateforme/` : lecteur n8n en GET seulement, étiquettes, copie, rafraîchir, renommer ; faux n8n `tests/_faux-n8n.js`.
- Écran `js/modules/journal/` + `css/journal.css`.
- Outil « nouveau client » : module `journal`, refus au-delà de 17 caractères d'identifiant ; comparaison sans ordre des clés.
- Déploiement préparé (`firebase.plateforme.json`, choix `fonctions` du workflow), non lancé.
- Docs : guide, étude (sections 7 et 8), feuille de route, reprise.
- Tests ajoutés : `journal-synchro`, `journal-appels`, `journal-statique`, `journal-logique`, `e2e/journal.spec.js`, règles J, outil A2b. `npm test` les lance (`test:journal`).

## Reste
- Rien côté code pour les phases 1 et 2. Phase 3 (Logger, frise d'étapes) : non faite.
- Pour Jérôme : dire « fusionne », puis `automatisations-n8n.md` partie 7 (règles/page, clé n8n dans Secret Manager, déploiement des fonctions, workflow de test étiqueté).

## Prérequis des tests (une fois)
```
export JAVA_HOME=$HOME/.local/jdk-21/Contents/Home PATH=$JAVA_HOME/bin:$PATH
cd tests && npm ci && npm run installer-fonctions && npm run installer-fonctions-plateforme && npm run installer-outils
npm test            # environ 7 minutes
npm run test:journal   # seulement le journal (émulateur Firestore + faux n8n)
```

## Décisions prises seul
- Limite d'une étiquette n8n : **24 caractères** (code source public de n8n, `TagEntity`) donc identifiant ≤ 17 caractères pour ce module ; l'outil refuse au-delà.
- Fonctions dans un dossier à part (`functions-plateforme/`, codebase `plateforme`) pour ne jamais être déployées avec le CRM ; le `firebase.json` du CRM ne publie pas ce dossier.
- Collections sans préfixe (`workflows`, `executions`, `sync`) comme demandé ; fermées à l'écriture par les règles. Signalements (étiquettes refusées) dans `plateforme_journal/signalements`, hors des clients (ils nomment plusieurs clients).
- `sync/state` porte le verrou, le délai de 10 s, les curseurs par workflow et l'état « n8n injoignable ».
- Un lecteur peut rafraîchir (c'est une lecture) ; seul un éditeur renomme.
- « Rafraîchir » traite tous les clients (avec le module) dont l'appelant est membre ; en pratique un seul.
- Le choix `fonctions` du workflow n'est jamais inclus dans `tout`.
- Dans `tests/package.json` : `preparer` est lancé avant `test:statique` (un test statique lisait un fichier généré par `preparer`, d'où un échec sur un dépôt neuf).
- `statique.test.js` : exceptions précises pour le journal (un `orderBy` + `limit` sur `startedAt`, deux appels de fonctions) ; `identite-client.test.js` a imposé de ne pas écrire « Jérôme » dans un nom de champ.

## Non testé
Vrai n8n, déploiement Google Cloud, vrai SDK appelant les vraies fonctions, alerte e-mail (branchée le 11/10/2026, testée avec une fausse erreur ; phrase « Nous sommes prévenus » retirée).
