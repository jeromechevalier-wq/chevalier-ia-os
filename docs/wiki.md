# Le wiki local : la documentation en pages HTML

Écrit le 18/10/2026 pour Jérôme. Le wiki est la documentation de Chevalier IA OS mise en pages lisibles (menu, rubriques, tableaux, thème clair et sombre, lisible sur téléphone). Aucun secret ici.

## Comment l'ouvrir

Dans le dossier du dépôt, ouvre le dossier `wiki/` et **double-clique sur `wiki/index.html`**. Le navigateur l'ouvre directement depuis ton ordinateur : pas besoin d'internet ni de serveur. La première rubrique, « MCP et accès », est la page de départ.

## Ce qu'il faut savoir

- **`docs/` reste la source.** C'est là que Claude lit et écrit la documentation.
- **`wiki/` est généré.** Un script le fabrique à partir de `docs/*.md`. Personne ne l'écrit à la main : une modification faite directement dans `wiki/` serait écrasée à la prochaine construction.
- **`wiki/` est commité** dans le dépôt, pour que tu n'aies aucune commande à lancer. Il se régénère **quand on peut** : il peut avoir un peu de retard sur `docs/`. Pour l'avoir à jour tout de suite : `node scripts/wiki/construire.js`.

## Comment le régénérer (quand on peut)

**Décision de Jérôme du 27/11/2026 : un wiki en retard ne bloque jamais une PR.** Avant, le test `W6` faisait échouer la coche « Tests » dès que `wiki/` n'était pas régénéré : ce n'est plus le cas.

- Construire : `node scripts/wiki/construire.js`. Le script écrit `wiki/` et efface les pages dont le document a été supprimé.
- Vérifier sans rien écrire : `node scripts/wiki/construire.js --verifier`. Il répond « à jour » ou liste ce qui diffère (code 1).
- Le test `W6` vérifie que la construction tourne sans erreur. Si `wiki/` est en retard, il affiche un **avertissement** (dans le journal du test et en annotation jaune sur GitHub), sans échouer.
- Quand on régénère, on commite le résultat avec le changement de `docs/`, de préférence au dernier commit de la PR.

Le résultat est toujours le même pour les mêmes documents : ni date ni chemin de l'ordinateur dans les pages.

## Pourquoi il n'est jamais publié sur internet

La documentation contient des détails de sécurité (portes d'entrée, jetons, pannes). Elle est donc **locale seulement** :

- `firebase.json` ignore `wiki/**` : le CRM publié depuis la racine du dépôt ne l'envoie pas.
- La plateforme clients n'envoie qu'une liste blanche de dossiers (`ELEMENTS_PUBLIES` dans `scripts/hebergement.js`) : `wiki` n'y figure pas.
- Le test `W5` garde les deux : il échoue si `wiki/**` quitte la liste d'exclusion, ou si un paquet de la plateforme contient un dossier `wiki/`.

## Ajouter ou ranger une page

- Une nouvelle page s'ajoute en créant `docs/<nom>.md` (premier niveau seulement ; les sous-dossiers comme `docs/audit-fonctionnel/` ne sont pas convertis). Son titre est la première ligne `# Titre`.
- Sans autre geste, elle apparaît dans la rubrique « Autres ».
- Pour la ranger : ouvre `scripts/wiki/sommaire.json`, ajoute son nom (sans `.md`) dans la liste `pages` de la bonne rubrique. Pour une nouvelle rubrique, ajoute un bloc `{ "titre": "…", "pages": ["…"] }`. L'ordre du fichier est l'ordre du menu.
- Si le sommaire cite un nom qui n'existe pas dans `docs/`, le script s'arrête avec une erreur claire.
- Les liens `[texte](autre.md)` deviennent des liens entre pages du wiki. Les liens vers un fichier qui n'est pas converti restent du texte simple ; les liens `https://` restent cliquables.

## Cas vide et cas d'erreur du script

- Aucun `.md` dans `docs/` : « Aucun document .md dans … : rien à construire. », code 1, rien n'est effacé.
- Le sommaire cite un document absent : « Le sommaire cite « x » mais docs/x.md n'existe pas… », code 1, rien n'est écrit.
- Un tableau mal formé dans un document s'affiche comme un paragraphe : la construction ne plante pas.
