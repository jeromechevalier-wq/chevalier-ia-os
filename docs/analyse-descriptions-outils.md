# Analyse : alléger ce que le serveur MCP envoie au bot (profil `assistant-devis`)

Étape 1 (analyse seule, aucun code modifié). Rédigé le 09/11/2026. Aucune donnée réelle, aucun secret.

## 0. Constat important avant de choisir

Mesure faite en lançant le vrai serveur MCP (SDK, `tools/list`) en mémoire, avec 3,5 caractères par token (ordre de grandeur pour du français et du JSON ; le vrai compteur du modèle peut donner 20 % de plus) :

| Profil | Outils | Caractères envoyés | Tokens estimés |
|---|---|---|---|
| `assistant-devis` | 24 | 60 815 | environ 17 400 |
| `agent-devis` | 21 | environ 52 000 | environ 15 000 |
| `lecture` | 24 | environ 27 000 | environ 7 700 |
| `complet` (ChatGPT, Claude, Gemini en OAuth) | 85 | 148 357 | environ 42 400 |

Le bot en expose 15 sur les 24 : cela devrait faire **moins de 17 000 tokens, pas 38 000**. Un chiffre de 38 000 correspond plutôt à la liste du profil **complet** (85 outils, 42 000). Trois pistes à vérifier AVANT de coder (30 minutes, sans risque) :

1. Le jeton du bot est-il bien `assistant-devis` ? Une erreur de profil dans la ligne du secret `MCP_JETONS` (ou un bot branché par OAuth, donc profil `complet`) enverrait 85 outils. Test : un appel `qui_suis_je` depuis le bot, ou le champ profil du journal.
2. Le nœud n8n envoie-t-il la liste des outils deux fois (une fois dans les « tools » du modèle, une fois recopiée dans la consigne système) ? Le filtre « 15 outils » est-il appliqué avant l'envoi au modèle, ou seulement à l'exécution ?
3. Les 38 000 tokens contiennent-ils aussi l'historique de conversation, la consigne du bot et les réponses des outils (`lire_devis` rend de gros JSON) ?

Si la piste 1 ou 2 se confirme, le gain est immédiat et gratuit. Ensuite, alléger les descriptions reste utile (voir ci-dessous) mais ne fera pas passer seul de 8-60 s à moins de 6 s : la durée dépend surtout du modèle choisi dans n8n et du nombre d'allers-retours.

## 1. Où est construit ce que le serveur envoie dans `tools/list`

- Les outils sont déclarés dans `functions/src/mcp/outils/` (`lecture.js`, `ecriture.js`, `identite.js`, `propositions.js`, `suppression.js`). Chacun a `nom`, `description`, `schema` (objet zod), `profils`.
- `functions/src/mcp/outils/index.js` : `OUTILS` = tous les outils, passés par `avecGarantie`. `outilsAutorises(profil)` filtre par `profils`.
- `functions/src/mcp/outils/garantie.js` : `avecGarantie` ajoute la phrase « RÈGLE ABSOLUE… » (607 caractères) à la fin de la description de **tout outil dont le nom contient `devis`** et de `preparer_email`. Elle est présente dans 12 outils de ce profil : **7 284 caractères répétés**.
- `functions/src/coeur/liens.js` : `CONSIGNE_LIEN_ECRAN` (278 caractères) est recopiée dans 10 descriptions : **2 780 caractères répétés**.
- `functions/src/mcp/gestionnaire.js` (l. 138 et 172) : `permis = outilsAutorises(jeton.profil)` puis `serveur.registerTool(nom, { description, annotations, inputSchema })` pour chaque outil permis. Le SDK (`@modelcontextprotocol/sdk` 1.32.0) convertit le schéma zod en JSON Schema et fabrique la réponse `tools/list` : c'est le seul endroit où `description` et `schema` quittent le serveur. Il n'y a pas de consigne système côté serveur.

## 2. Poids par outil du profil `assistant-devis` (caractères ; tokens = caractères / 3,5)

Du plus lourd au plus léger (description + schéma JSON, avant le texte ajouté par le SDK) :

| # | Outil | Description | Schéma | Total | Tokens |
|---|---|---|---|---|---|
| 1 | `modifier_devis_brouillon` | 2 284 | 4 617 | 6 901 | 1 972 |
| 2 | `creer_devis_brouillon` | 2 409 | 3 814 | 6 223 | 1 778 |
| 3 | `modifier_lignes_devis` | 2 987 | 2 472 | 5 459 | 1 560 |
| 4 | `preparer_email` | 3 021 | 1 099 | 4 120 | 1 177 |
| 5 | `lire_devis` | 2 313 | 565 | 2 878 | 822 |
| 6 | `finaliser_devis` | 2 449 | 364 | 2 813 | 804 |
| 7 | `lister_devis` | 1 745 | 1 023 | 2 768 | 791 |
| 8 | `creer_affaire` | 490 | 2 246 | 2 736 | 782 |
| 9 | `creer_personne` | 247 | 2 281 | 2 528 | 722 |
| 10 | `modifier_destinataires_devis` | 1 810 | 662 | 2 472 | 706 |
| 11 | `creer_organisation` | 235 | 2 023 | 2 258 | 645 |
| 12 | `rechercher_article_par_phrase` | 1 702 | 397 | 2 099 | 600 |
| 13 | `obtenir_pdf_officiel_devis` | 1 810 | 227 | 2 037 | 582 |
| 14 | `annuler_derniere_modification_devis` | 1 595 | 231 | 1 826 | 522 |
| 15 | `lire_reglages_devis` | 1 537 | 90 | 1 627 | 465 |
| 16 | `nouvelle_version_devis` | 1 359 | 228 | 1 587 | 453 |
| 17 | `lister_affaires` | 194 | 1 225 | 1 419 | 405 |
| 18 | `chercher` | 379 | 783 | 1 162 | 332 |
| 19 | `lister_articles` | 493 | 309 | 802 | 229 |
| 20 | `chercher_article` | 426 | 324 | 750 | 214 |
| 21 | `lire_affaire` | 130 | 334 | 464 | 133 |
| 22 | `lire_organisation` | 115 | 339 | 454 | 130 |
| 23 | `lire_personne` | 114 | 336 | 450 | 129 |
| 24 | `qui_suis_je` | 103 | 33 | 136 | 39 |
| | **Total** | **29 947** | **26 022** | **55 969** | **15 991** |

(Le `tools/list` réel fait 60 815 caractères : le SDK ajoute `$schema`, `additionalProperties` et les annotations.)

Ce qui pèse vraiment :
- Les 12 garanties d'e-mail (7 284) et les 10 consignes de lien (2 780) = **10 064 caractères, soit 18 % du total**, du texte identique répété.
- Le schéma de ligne de devis (`ligneDevis`, avec sa longue description) est recopié trois fois dans `modifier_devis_brouillon` (`lignes`, `sections`, `ajouterLignes`) et deux fois dans `creer_devis_brouillon`.
- `creer_personne`, `creer_organisation`, `creer_affaire`, `lister_affaires` : des schémas de 1 200 à 2 300 caractères pour des fiches dont un bot de devis n'utilise que le nom, l'e-mail et le téléphone.
- Les descriptions de `modifier_lignes_devis`, `preparer_email`, `lire_devis`, `finaliser_devis` décrivent aussi ce que la réponse renvoie : c'est du texte que la réponse de l'outil dit déjà.

## 3. Garde-fous à ne jamais perdre

Chacun doit rester vrai pour le profil `assistant-devis` après toute option, avec un test qui le prouve :

1. `finaliser_devis` : le premier appel ne finalise rien et rend un aperçu + un code ; le second appel (mêmes arguments + `codeConfirmation`) finalise ; l'assistant ne demande jamais le code à l'utilisateur ; l'avertissement « sans affaire » est redit.
2. Refus pour un devis finalisé (`modifier_devis_brouillon`, `modifier_lignes_devis`) → « créer la version suivante avec `nouvelle_version_devis` ».
3. `modifier_lignes_devis` : `attendu` obligatoire (libellé lu dans `lire_devis`), tout ou rien, numéros lus AVANT l'appel, refus si la ligne a changé.
4. `modifier_devis_brouillon` : `lignes` et `sections` REMPLACENT tout le contenu (les lignes libres de l'écran sont perdues) ; on ajoute avec `ajouterLignes`.
5. La garantie « aucun e-mail ne part tout seul » (décision du 29/10/2026) : ne jamais fabriquer un PDF, ne jamais envoyer, brouillon seulement.
6. `lienEcran` : donner le lien tel quel, ne jamais en construire un.
7. `changementImportant` / `totalChangementImportant` : redire à l'utilisateur.

Principe : **une règle qui protège les données est d'abord dans le code du serveur (refus, `attendu`, code de confirmation), la description n'est que le rappel**. Les points 1 à 3 sont déjà appliqués par le serveur, quelle que soit la description. Les points 4, 5, 6 et 7 sont des consignes de comportement : ils doivent rester écrits dans la description ou dans la réponse de l'outil.

## 4. Trois façons de réduire le poids, pour ce profil seulement

Mécanisme commun aux trois : un fichier `functions/src/mcp/outils/variantes-assistant-devis.js` qui contient, par nom d'outil, une `description` courte et éventuellement un `schema` allégé ; une fonction `varianteDuProfil(outil, profil)` appelée dans `gestionnaire.js` juste après `outilsAutorises` (l. 138). Pour tout autre profil elle rend **l'outil lui-même, sans copie** (même objet). `executer`, la validation et les profils autorisés ne changent pas.

### Option A : descriptions courtes servies au profil `assistant-devis` (garde-fous gardés en phrase courte)

- Pour chaque outil, 250 à 600 caractères : à quoi sert l'outil, les 1 à 3 règles de comportement, et « le détail revient dans la réponse ».
- La garantie e-mail : une version courte (environ 230 caractères : « Jamais de PDF fabriqué par toi, jamais d'envoi ni de transfert sans le « oui » de l'utilisateur ; brouillon seulement via preparer_email, l'utilisateur l'envoie lui-même ») sur les outils qui parlent d'e-mail ou de PDF ; le texte complet reste sur `preparer_email`, `obtenir_pdf_officiel_devis` et `finaliser_devis`. La consigne de lien : une fois en 90 caractères.
- Gain estimé : descriptions de 29 947 à environ 9 000 caractères, soit **environ 21 000 caractères, 6 000 tokens (-35 % du total)**.
- Risque : une consigne de comportement oubliée dans le résumé, que le modèle suivait avant. Atténuation : les 7 garde-fous ci-dessus sont des phrases obligatoires, vérifiées par un test (voir plus bas).
- Fichiers : `variantes-assistant-devis.js` (nouveau), `gestionnaire.js` (une ligne), `garantie.js` (exporter la version courte et son texte), docs `plan-mcp.md`.

### Option B : schémas allégés (moins de champs, moins de texte par champ)

- `modifier_devis_brouillon` : le profil ne reçoit plus `lignes` ni `sections` (seul `ajouterLignes` reste) ; l'interdiction de remplacer tout le contenu devient **structurelle** : le champ n'existe pas pour ce profil, et le serveur le refuse s'il est envoyé quand même (test). `ligneDevis` : description réduite à une phrase.
- `creer_personne`, `creer_organisation`, `creer_affaire`, `lister_affaires` : seulement les champs utiles à un devis (nom, e-mail, téléphone, adresse de facturation, filtres de base). Les autres champs facultatifs restent acceptés si envoyés (le schéma d'exécution n'est pas modifié), ils ne sont simplement plus annoncés.
- `creer_devis_brouillon` : `lignes` ou `sections` (un seul des deux annoncé), descriptions raccourcies.
- Gain estimé : schémas de 26 022 à environ 13 000 caractères, soit **environ 13 000 caractères, 3 700 tokens (-21 % du total)**.
- Risque : le plus élevé des trois. Annoncer moins que ce que le serveur accepte oblige à tenir DEUX schémas (affichage et exécution) : si on les laisse diverger, un champ utile peut disparaître sans bruit. Il faut un test qui compare les deux.
- Fichiers : `variantes-assistant-devis.js`, `gestionnaire.js` (annoncer le schéma allégé, exécuter avec le schéma complet), tests.

### Option C : déplacer les règles de retour dans la réponse des outils (qui existe déjà)

- Les descriptions de `modifier_lignes_devis` (« Renvoie l'operationId, pour chaque opération la ligne…, changementImportant… »), `lire_devis`, `finaliser_devis`, `preparer_email` décrivent leur propre réponse. Ce texte passe dans un champ `consignes` ajouté à la réponse (ex. « Si changementImportant est vrai, redis la ligne à l'utilisateur en une phrase. »), vu seulement au moment où il compte, une seule fois par appel, avec les chiffres réels.
- Gain estimé : **environ 5 000 à 6 000 caractères, 1 500 tokens (-9 %)**, mais ajoute quelques tokens à chaque réponse d'outil.
- Risque : une règle dite après l'appel arrive trop tard si elle porte sur la façon d'appeler (par exemple « recopie `attendu` »). On ne déplace que les règles sur la lecture du résultat. Les réponses de ce profil changent (champ en plus) : le bot n8n doit l'ignorer sans casser.
- Fichiers : `ecriture.js` / `lecture.js` / `coeur/metier.js` (réponses), variantes, tests.

### Combinaison

A + B ensemble : environ **-34 000 caractères, -9 700 tokens, de 17 400 à environ 7 700 (-56 %)**. A + B + C : environ 7 000 tokens (-60 %). Sous les 15 outils réellement exposés au bot, le résultat tombe à environ 5 000 tokens, soit le niveau du profil `lecture`.

## 5. Les autres profils restent strictement inchangés

- `varianteDuProfil(outil, profil)` rend `outil` tel quel (même référence) pour tout profil différent de `assistant-devis`. Aucun fichier de description existant n'est modifié ; les variantes vivent dans un fichier à part, lu seulement pour ce profil.
- `avecGarantie` et `outilsAutorises` ne sont pas modifiés.
- Test d'invariance (`tests/mcp-variantes-profil.test.js`, à écrire) :
  1. Avant tout changement, figer dans un fichier `tests/fixtures/tools-list-<profil>.json` (committé) la liste complète `tools/list` (nom, description, inputSchema, annotations) de `complet`, `ecriture`, `lecture`, `agent-devis` produite par le vrai serveur en mémoire (le script de mesure de cette analyse fait déjà ce montage). Le test compare octet pour octet après la PR : **toute différence = test rouge**. Ces fichiers ne contiennent que des descriptions d'outils, aucune donnée.
  2. Un jeton OAuth (profil `complet`) et un rôle éditeur / lecteur de client reçoivent la même liste qu'avant (cas `mcp-clients.test.js`).
  3. Les alias `claude-code`, `lecteur`, `bibliothecaire` (`ALIAS_PROFILS`) donnent la liste de leur profil actuel, inchangée.
- Le profil `agent-devis` partage les mêmes outils que `assistant-devis` : il garde le texte COMPLET (c'est la raison de la comparaison du point 1).

## 6. Tests à écrire pour `assistant-devis`

1. **Garde-fous présents** : pour chacun des 7 points du chapitre 3, la description servie au profil contient la phrase clé (liste figée dans le test, une expression par garde-fou). Un garde-fou retiré rend le test rouge.
2. **Comportement serveur intact** (les tests existants ne changent pas : `devis-mcp`, `devis-lignes-mcp`, `devis-annulation-mcp`, `devis-garantie-email`, `devis-lien-ecran`, `jetons`, `mcp`, `lecture`) : aperçu + code de `finaliser_devis`, refus pour devis finalisé, `attendu`, `lignes` refusé dans `modifier_devis_brouillon`.
3. **Poids plafonné** : `tools/list` du profil sous un budget (par exemple 30 000 caractères après option A, 20 000 après A + B). Un outil ajouté plus tard qui dépasse fait rougir le test avec un message qui explique quoi faire.
4. **Cohérence description / exécution** (option B) : tout champ obligatoire du schéma d'exécution est annoncé dans le schéma allégé.
5. **Même liste d'outils** : les noms de `tools/list` pour `assistant-devis` sont les 24 d'avant (liste figée).

## 7. Recommandation

1. **D'abord la vérification du chapitre 0** (le profil réel du bot, la double copie dans n8n, l'historique), sans code : elle peut expliquer à elle seule l'écart entre 17 000 et 38 000 tokens.
2. **Ensuite l'option A seule** : -35 %, risque faible, mécanisme réutilisable, les garde-fous en phrases courtes verrouillés par test. C'est la meilleure part de gain pour le moins de risque, et elle ne touche aucun autre profil.
3. **L'option B seulement pour `modifier_devis_brouillon`** (retirer `lignes` / `sections` du schéma annoncé) : elle transforme une interdiction écrite en interdiction structurelle, et c'est le plus gros schéma. Les fiches (personne, organisation, affaire) sont à traiter en dernier, si les mesures après A le justifient.
4. **L'option C : non pour l'instant** (gain faible, chaque réponse grossit).

Relecture Fable obligatoire pour l'étape 2 (serveur, MCP, sécurité) : le brief et la PR.
