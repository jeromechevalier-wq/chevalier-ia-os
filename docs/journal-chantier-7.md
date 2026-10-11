# Journal du chantier 7 : modules déclarés et activés client par client

Branche `plateforme-chantier-7`. Mission : voir `docs/etude-reutilisation-coque.md` (section 8, chantier 7). Ce journal permet de reprendre sans contexte.

## Fait
- [x] `js/os/registre.js` : registre des modules (nom, écrans, collections, outils MCP, dépendances) + logique des modules actifs. Testé : `tests/registre.test.js`, `tests/registre-mcp.test.js`.
- [x] `js/os/modules.js` : construit la liste `MODULES` à partir du registre (CRM de Jérôme identique : test de comparaison avec l'ancien contenu).
- [x] Règles `firestore.plateforme.rules` : un membre LIT le document `clients/<client>` (jamais d'écriture, pas de liste). Tests Q1 à Q8.
- [x] `router.js` (préfixe `espace/<client>`), `shell.js` (options client), `espace-modules.js` (montage des seuls modules actifs), `espace.js` (lecture de la fiche), `accueil.js` (option `objectifs:false`).

## Reste à faire
- [x] Tests navigateur `tests/e2e/modules-client.spec.js` (R1 à R8), documentation, suite complète verte (117 + 366 + 52 + 177 tests, 240 parcours navigateur, 4 Storage).
- [ ] Fusion de la PR, puis déploiement « Déploiement plateforme clients » (`tout`), vérifications en ligne (voir la fin de ce journal une fois fait).

## Prochaine commande
```
gh workflow run "Déploiement plateforme clients" -f elements=tout   # après la fusion
```

## Décisions prises seul (Jérôme dort)
- **Format** : champ `modules` du document `clients/<client>`, objet `{ affaires: true, projets: false }`. Seul `true` active. Champ absent ou illisible = AUCUN module actif = l'accueil provisoire actuel (avec la phrase « Aucun écran n'est encore activé »).
- **Identifiant** : le module du CRM s'appelle `affaires` dans le registre (vocabulaire de Jérôme), mais ses routes restent `#/crm/…` et le menu de Jérôme garde le titre « CRM ». Projets : `projets`.
- **Projets sans affaires** : refusé, pas activé, avertissement dans la console du navigateur ; `verifierActivation()` renvoie l'erreur lisible pour l'outil du chantier 13.
- **Adresses** : chez un client, les écrans sont `#/espace/<client>/crm/personnes`, etc. (préfixe géré par `router.js`). Un module non actif affiche « Page introuvable » et n'est même pas chargé.
- **Pas de Réglages chez un client** pour l'instant (ils touchent aux objectifs, chantier 8) ; pas d'objectifs sur l'accueil du CRM chez un client.
- Une permission refusée à la lecture de la fiche (règles pas encore publiées) = aucun module actif, pas une erreur.
