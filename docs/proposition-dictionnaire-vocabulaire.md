# Proposition : le dictionnaire de vocabulaire du client (module Devis)

Écrit le 28/10/2026 (nuit 3), **document de conception** (aucune règle publiée). **PR 1 « Fondation » faite le 28/10/2026** : le moteur pur `js/modules/devis/vocabulaire.js`, son jeu d'essai (`tests/devis-vocabulaire.test.js`) et sa copie dans `preparer-fonctions.js` existent ; rien d'autre (ni outil, ni écran, ni règle Firestore, ni écriture en base). **PR 2 « Outil de recherche » faite le 28/10/2026** : l'outil de lecture `rechercher_article_par_phrase` (profils lecteur, bibliothécaire, Claude Code ; 17e outil du module Devis, 70 outils au total) et `prixVente` facultatif sur les lignes de `creer_devis_brouillon` / `modifier_devis_brouillon` ; toujours ni écran, ni règle Firestore, ni écriture dans `devis_vocabulaire`. **PR 3 « Apprentissage » faite le 28/10/2026** : l'outil d'écriture `enregistrer_reponse_vocabulaire` (18e outil du module Devis, 71 au total), journalisé ; **choix du code : option (c), pas de code** (`emettreCode` écrit dans `mcp_codes` alors que l'outil de recherche est en lecture seule, et une signature exigerait un secret) : l'outil d'écriture reçoit `phrase` et recalcule les candidats avec le moteur ; `confirme` n'est accepté que pour un article qui figure parmi eux, `autre` seulement si la décision recalculée est `proposer` ou `demander` (la correction d'une règle active passe par la revue, PR 4/5) ; la ligne de journal pour `aucun` est **reportée** (`aucun` n'écrit rien) ; `devis_vocabulaire` entre dans l'export du module ; aucune règle Firestore changée (le navigateur peut donc écrire cette collection par le joker jusqu'à la PR 4, connu et accepté). Une confirmation vers un autre article d'une règle existante la contredit (un seul document par clé) ; `expression` = la clé ; `derniereUtilisationLe` = le jour `AAAA-MM-JJ`. **PR 4 « Règles Firestore » faite le 28/10/2026** (texte écrit dans `firestore.rules` et `firestore.plateforme.rules`, tests dans `tests/devis-vocabulaire-regles.test.js` ; **règles NON publiées**, liste d'arrêt) : le navigateur ne peut plus que créer une règle manuelle puis la réviser. Les écarts pris pendant la PR 1 sont signalés « **écart PR 1** » ci-dessous. À relire par Jérôme ; les questions sont à la section 13, chacune avec la valeur que je prends si rien n'est dit. Tous les exemples sont inventés (« prise », « tableau électrique », « gaine ») : aucun nom réel, aucune donnée de client.

## 1. Le besoin en cinq lignes

Un client de Jérôme fait ses devis en discutant avec ChatGPT (ou Claude), branché sur notre serveur MCP. Il dit « mets-moi trois prises et le tableau », pas « article PR-16A-BLC ». Aujourd'hui l'assistant cherche dans le catalogue avec les mots exacts (`chercher_article`) et se débrouille seul, sans mémoire : le même malentendu revient à chaque devis. On veut que **notre application** retienne les mots du client et les relie à ses articles, dans un **dictionnaire par client**, lisible et corrigeable par un humain, qui s'enrichit à l'usage : quand c'est ambigu, l'assistant **pose une question**, et la réponse devient une règle. Toute l'intelligence vit chez nous, pas dans le prompt de l'assistant.

## 2. Architecture : qui fait quoi

| Qui | Fait | Ne fait jamais |
|---|---|---|
| **L'assistant** (ChatGPT, Claude) | Reçoit la phrase du client, appelle notre outil de recherche, lit la décision (`utiliser`, `proposer`, `demander`), pose la question telle que l'outil la lui donne, enregistre la réponse avec le second outil, puis crée le brouillon avec `creer_devis_brouillon`. | Deviner un article, inventer un prix d'achat, écrire une règle sans réponse du client. |
| **Les outils MCP** (`functions/src/mcp/outils/`) | `rechercher_article_par_phrase` (lecture) et `enregistrer_reponse_vocabulaire` (écriture, journalisée). Déclarés dans `js/os/registre.js` (`outilsMcp` du module `devis`) : un client sans module Devis ne les voit pas. | Recevoir un chemin ou un identifiant de client (le client vient du lien, comme aujourd'hui). |
| **Le moteur de correspondance** (`js/modules/devis/vocabulaire.js`, JS pur) | Normalise la phrase, sépare quantité et prix, cherche dans le dictionnaire puis dans le catalogue, donne un score et une décision. Copié dans `functions/partage/devis-vocabulaire.js` par `scripts/preparer-fonctions.js`, comme `articles.js` aujourd'hui : **une seule logique** pour l'écran (prévisualisation d'une règle) et le serveur. | Toucher à Firebase, au réseau ou au navigateur. |
| **Le serveur** (`functions/src/coeur/`) | Lit le dictionnaire et le catalogue, applique le moteur, écrit les règles apprises avec une ligne de journal (`crm_audit` + `crm_audit_avant`), calcule le prix de vente avec les réglages. | Écrire une règle `active` à partir d'une seule réponse (voir section 7). |
| **La base** (Firestore) | Collection `devis_vocabulaire` (racine chez Jérôme, `clients/<client>/devis_vocabulaire` chez un client, par `avecBase`). | — |
| **L'écran « Vocabulaire »** (module Devis) | Revue mensuelle de Jérôme et du client : activer, désactiver, corriger l'article, créer une règle à la main, exporter. | Changer les compteurs de confirmations (réservés au serveur). |

## 3. Modèle de données

Collection **`devis_vocabulaire`**, un document par règle. Identifiant du document = **la clé normalisée** de l'expression (section 5), avec les espaces remplacés par `_` (exemple : `prise_double`). Ainsi **une expression ne peut avoir qu'une règle** : c'est la base qui l'impose, pas le code.

| Champ | Type | Pourquoi |
|---|---|---|
| `expression` | texte (≤ 120) | Les mots du client, tels qu'il les a dits la première fois (« prises doubles ») : c'est ce que Jérôme lit. |
| `cle` | texte | La forme normalisée (`prise double`) ; recopiée dans le document pour les filtres et l'export. |
| `articleId` | texte | L'article du catalogue visé. **Un seul** : « un mot = un article » (deux articles pour un mot = un conflit, section 7). |
| `articleLibelle` | texte | Copie du libellé de l'article au moment de la règle, pour l'afficher même si l'article est désactivé ou renommé. |
| `statut` | `active` · `a_confirmer` · `desactivee` | `active` : utilisée sans question. `a_confirmer` : apprise mais pas encore sûre, proposée avec question. `desactivee` : gardée, jamais utilisée (on ne supprime pas, comme un article). |
| `origine` | `manuelle` · `apprise_question` · `apprise_correction` | Qui l'a créée : Jérôme ou le client à l'écran ; la réponse « oui » du client à une question ; le client qui a choisi un autre article que celui proposé. |
| `confirmations` | entier | Nombre de confirmations de ce lien (réponse ou devis finalisé), **au plus une par jour** (écart PR 1 : deux « oui » le même jour comptent pour un seul). **Écrit par le serveur seulement.** |
| `derniereConfirmationLe` | texte `AAAA-MM-JJ` | Le jour de la dernière confirmation comptée (écart PR 1 : sert à exiger « 2 jours différents » sans lire l'horloge dans le moteur). Serveur seulement. |
| `contradictions` | entier | Nombre de fois où, pour cette expression, le client a choisi un autre article. Serveur seulement. |
| `conflit` | booléen | `true` quand deux articles ont été confirmés pour la même expression : la règle sort de l'usage automatique jusqu'à la revue. |
| `exemples` | liste de textes (≤ 5, ≤ 200 car. chacun) | Les dernières phrases complètes où l'expression a servi (« mets 3 prises doubles dans la cuisine ») : aide Jérôme à comprendre. Les plus anciennes sortent. |
| `derniereUtilisationLe` | date | Pour trier la revue et repérer les règles mortes. |
| `creeLe`, `creePar`, `modifieLe`, `modifiePar`, `via` | marques habituelles (`MARQUES_CREATION` / `MARQUES_MODIFICATION` de `logique.js`) | Même forme que les autres fiches : le Journal des modifications les affiche sans rien de neuf. |
| `note` | texte (≤ 300) | Remarque de Jérôme lors de la revue (« le client dit « tableau » pour le tableau 2 rangées, jamais le 4 rangées »). |

Pas de `quantiteParDefaut` ni d'`unite` dans la règle : la quantité et le prix viennent de la phrase, l'unité de l'article.

**Journal** : chaque écriture du serveur passe par `crm_audit` / `crm_audit_avant` (canal `mcp`, outil `enregistrer_reponse_vocabulaire`), donc `restaurer_depuis_audit` défait une règle apprise. Une écriture de l'écran écrit sa ligne au canal `ecran`, comme les articles. Rien ne s'efface jamais.

## 4. Règles de sécurité Firestore (texte seulement, à publier plus tard : liste d'arrêt)

Chez Jérôme (`firestore.rules`) : lecture par `compteAutorise()` ; **création** permise si `statut` est `active` ou `desactivee`, `origine == 'manuelle'`, `confirmations == 0`, `contradictions == 0`, `conflit == false` ; **modification** permise si les clés touchées sont dans `['statut', 'articleId', 'articleLibelle', 'note', 'conflit', 'modifieLe', 'modifiePar', 'via']` (donc jamais `confirmations`, `contradictions`, `origine`, `expression`, `cle`, `exemples`, `creeLe`, `creePar`) ; **suppression** interdite. La collection s'ajoute à la liste exclue du joker final.

Chez les clients (`firestore.plateforme.rules`) : bloc `match /clients/{client}/devis_vocabulaire/{id}` ; lecture pour `editeur` et `lecteur` ; création et modification pour `editeur` avec les **mêmes conditions** ; suppression interdite ; `devis_vocabulaire` entre dans `collectionSansSuppression`.

**Contrat pour l'écran (PR 5), fixé par la PR 4** : une création manuelle porte OBLIGATOIREMENT `statut: 'active'` (ou `'desactivee'`), `origine: 'manuelle'`, `confirmations: 0`, `contradictions: 0`, `conflit: false` ; l'écran calcule `cle = cleDeExpression(expression)` et `id = identifiantDeRegle(cle)` du moteur (les règles ne peuvent pas l'imposer) et refuse la création si le document existe ; création avec `exemples: []` (un tableau non vide, `derniereConfirmationLe` ou `derniereUtilisationLe` sont refusés) ; elle peut porter `cle`, `expression`, `articleId`, `articleLibelle`, `note`, `exemples: []` et les marques `creeLe`, `creePar`, `modifieLe`, `modifiePar`. Une modification n'écrit que `statut`, `articleId` + `articleLibelle`, `note`, `conflit` et `modifieLe`, `modifiePar` (le champ `via` reste dans la liste par fidélité à la spécification, mais l'écran ne l'écrit jamais dans le document, seulement dans `crm_audit`). Interdits au navigateur en modification : `exemples`, `derniereUtilisationLe`, `derniereConfirmationLe`, `confirmations`, `contradictions`, `origine`, `expression`, `cle`, `creeLe`, `creePar`. Passer `a_confirmer` à `active` est permis (c'est le but de la revue). Les deux fichiers portent le même texte des fonctions `vocabulaireManuelNeuf()` et `vocabulaireRevise()`.

Ce que le navigateur ne peut donc pas faire seul : gonfler les compteurs pour rendre une règle « sûre », inventer une règle « apprise », réécrire l'expression d'une règle existante, supprimer une trace. Ce qu'il peut faire : créer une règle manuelle, activer, désactiver, corriger l'article, annoter, lever un conflit. Le serveur (SDK d'administration) contourne les règles : son isolation reste celle d'`avecBase`.

## 5. Algorithme de correspondance

Tout est dans une fonction pure `interpreter(phrase, { regles, articles, reglages })` qui rend `{ cle, quantite, prixVente, candidats, decision, question }`.

**Étape 1, normaliser** (reprend `normaliser` de `logique.js`, accents retirés, minuscules, `œ` → `oe`) puis : ponctuation remplacée par des espaces ; espaces réduits ; apostrophes coupées (`l'interrupteur` → `interrupteur`) ; **mots vides** retirés, eux aussi normalisés (le, la, les, un, une, des, du, de, d, a [« à »], au, aux, en, et, ou, pour, avec, sur, dans, ce, cette, ces, mon, ma, mes, je, il, me, veux, voudrais, faut, faudrait, mets, mettre, ajoute, ajouter, rajoute, aussi, encore, svp, stp, merci, euro, euros, et les restes d'apostrophe l, qu, n, s, c, j, m, t) ; un numéro collé à un code par un tiret fait un seul mot (`DJ-20` → `dj20`, côté phrase comme côté catalogue) ; **pluriels** : un `s` ou `x` final retiré si le mot a 4 lettres au moins (`prises` → `prise`, `tableaux` → `tableau` ; pas pour les mots en -os, -as, -us, -is, -ss : `gros`, `bas`, `vis` gardent leur s) ; `moi` et `toi` sont aussi des mots vides ; la règle `aux` → `al` est **abandonnée** (écart PR 1 : elle transformait `tableaux` en `tableal` au lieu de `tableau` ; `travaux` et `chevaux` perdent seulement leur `x`, les deux côtés sont normalisés pareil). Les libellés du catalogue passent par la même normalisation mais gardent leurs nombres (pas d'extraction de quantité ni de prix côté catalogue).

**Étape 2, séparer les nombres** (AVANT le retrait des mots vides, car « euro » en est un) : `(\d+(?:[.,]\d+)?)\s*(?:euros?|eur|€)` → `prixVente` (prix de vente **TTC ou HT ? HT**, c'est ce que l'éditeur manipule ; voir question Q4) ; un nombre isolé **en début de phrase** (ou `3x` / `3 x`) → `quantite` (défaut 1), sûr ; un nombre isolé **en fin de phrase** est aussi une quantité (« prise 2 » = clé `prise`, quantité 2) mais **jamais sûr** (écart PR 1, relecture Fable : « disjoncteur 32 », « câble 1,5 », « tableau 4 » sont des ampérages, sections, rangées) : (a) si le nombre fait partie d'un libellé, on le remet dans la clé et la quantité vaut 1 (« prise double 16 » → clé `prise double 16`, article « Prise double 16 A », `utiliser` possible) ; (b) sinon la décision ne dépasse jamais `proposer`, même avec une règle à 1,00 ; (c) un nombre après « à » (« câble à 25 ») est un prix dit sans « € », jamais une quantité (même plafond `proposer`) ; un « A » qui suit lui-même un nombre est l'ampère, pas « à » (« disjoncteur 20 A 3 » : 3 est la quantité). La sortie porte `quantiteIncertaine` et `prixIncertain`, et la **question cite ce qui a été deviné** (« C'est bien 32 × « Disjoncteur 20 A » ? », « … à 25 € l'unité ? »), pour qu'un « oui » n'ajoute jamais une quantité ou un prix que l'utilisateur n'a pas vus. Limites acceptées (restent des questions) : « 3 prises à 25 » donne `demander` (le prix est perdu) et « prise à 25 euros 3 » donne quantité 1. Un nombre au milieu (« tableau 2 rangées ») et les chiffres collés à un mot (`16b`) restent dans la clé ; l'unité A ou L collée à son nombre est séparée (`20A` → `20 a`) ; en fin de phrase, `a` et `l` (« prise 16 A », « peinture 10 L ») sont des unités : le nombre qui les précède n'est pas une quantité (écart PR 1). « 3 prises doubles à 25 € » → clé `prise double`, quantité 3, prix de vente 25.

**Étape 3, chercher les candidats**, chacun avec un score de 0 à 1 et un `pourquoi` :
1. **Règle active** dont la clé est égale → score **1,00** (`regle_active`).
2. **Règle à confirmer** égale → **0,70** (`regle_a_confirmer`) ; en conflit → 0,50.
3. **Article** dont le libellé, le code ou la référence normalisés sont égaux à la clé → **0,95** (`libelle_exact`).
4. **Article** dont le libellé contient tous les mots de la clé (la recherche actuelle de `filtrerArticles`) → 0,80 × (mots de la clé ÷ mots du libellé), plancher 0,60 (`libelle_complet`). « prise » contre « Prise 16 A blanche » (3 mots, le `a` est un mot vide) : 0,80 × 1/3 = 0,27 → plancher 0,60.
5. **Mots proches** (fautes de frappe) : un mot compte comme présent si la distance de Damerau-Levenshtein est ≤ 1 pour 5 lettres et plus, ≤ 2 pour 8 lettres et plus (`interupteur` ≈ `interrupteur`) ; le score de l'étape 4 (plancher compris) est alors multiplié par 0,90, **après** le plancher (`proche`).
6. **Règle active dont la clé contient tous les mots de la phrase** (le client dit « tableau », la règle est « tableau électrique ») → 0,65 (`regle_partielle`).
Les candidats sont triés par score, puis par libellé (`localeCompare(…, 'fr')` sans accents, comme `filtrerArticles`), puis par identifiant ; un article désactivé (ou une ligne de texte) n'est jamais candidat ; au plus 5 sont rendus. Une règle en conflit vaut 0,50 ; une règle désactivée est ignorée.

**Étape 4, décider** avec deux seuils :
- `utiliser` : meilleur score **≥ 0,85** ET écart avec le deuxième **≥ 0,15**. L'assistant ajoute la ligne sans question (il la relit quand même dans son récapitulatif).
- `proposer` : meilleur score **entre 0,50 (compris) et 0,85**, ou ≥ 0,85 mais écart < 0,15. L'outil fournit une question avec 2 ou 3 choix.
- `demander` : meilleur score **< 0,50** ou aucun candidat. L'outil fournit une question ouverte (« Je ne trouve pas « gaine annelée » dans ton catalogue : quel article veux-tu, ou faut-il en créer un ? »).

**Exemples chiffrés** (catalogue inventé : « Prise 16 A blanche », « Prise double 16 A », « Tableau électrique 2 rangées », « Tableau électrique 4 rangées », « Interrupteur va-et-vient »).
- « 3 prises doubles » : règle active `prise double` → 1,00 ; l'article « Prise double 16 A » seul vaudrait 0,80 × 2/3 = 0,53 → plancher **0,60** (c'est le même article, un seul candidat à 1,00). Sans la règle : 0,60 → **proposer**. Avec : **utiliser**, quantité 3.
- « une prise » sans règle : « Prise 16 A blanche » 0,60, « Prise double 16 A » 0,60 → **proposer** (« Tu veux « Prise 16 A blanche » ou « Prise double 16 A » ? »).
- « le tableau » sans règle : deux tableaux à 0,60 → **proposer**. Après deux « oui » pour « 2 rangées », règle active → **utiliser**.
- « interupteur » : mot proche de « interrupteur » (distance 1, 11 lettres) → 0,80 × 1/3 = 0,27 → plancher 0,60, **puis** × 0,90 = 0,54 → **proposer** avec un seul choix (« C'est bien « Interrupteur va-et-vient » ? ») ; le mot vide « et » est retiré du libellé aussi.
- « gaine annelée 25 » : aucun mot commun → **demander** ; 25, nombre isolé en fin de phrase, est la quantité (gardée pour la suite) ; clé `gaine annelee`.
- « prise à 25 € » sans règle : deux candidats à 0,60 → **proposer**, prix de vente 25 conservé et appliqué à la ligne choisie.

**Sans IA ou avec une aide d'IA pour les cas ambigus ?**

| Critère | Sans IA (moteur ci-dessus) | Avec un appel à un modèle pour classer les cas `proposer` |
|---|---|---|
| Coût | zéro | quelques centimes par devis, une clé d'API et un secret par projet, un budget à surveiller |
| Confidentialité | rien ne sort de chez nous | le catalogue et la phrase du client partent chez un tiers |
| Prévisibilité | même phrase, même réponse ; Jérôme peut lire pourquoi | varie d'un appel à l'autre ; une règle fausse est plus dure à expliquer |
| Testabilité | jeux d'essai en `node --test`, chiffres de précision reproductibles | tests coûteux, non déterministes, impossibles sur GitHub sans secret |
| Qualité sur les cas durs | questions un peu plus fréquentes au début | moins de questions, mais des erreurs silencieuses |

**Recommandation : sans IA dans l'application.** L'assistant qui parle au client est déjà un modèle : il reformule la question, comprend « le deuxième », « oui le double ». Notre valeur est la mémoire et la règle lisible, pas une seconde IA. Le nombre de questions baisse de lui-même avec les règles. Une aide d'IA pourra venir **plus tard, à l'écran de revue seulement** (« proposer des fusions de règles »), hors du chemin du devis ; à peser alors avec Jérôme, jamais cachée.

## 6. Contrat des outils MCP

### `rechercher_article_par_phrase` (lecture, profils L B C)

Entrées : `phrase` (texte, 1 à 300 caractères, obligatoire) ; `limite` (1 à 5, défaut 3 ; les candidats sont tronqués après la décision, sans jamais descendre sous les articles cités par `question`, 3 au plus).

Sortie : `{ cle, quantite, prixVente, quantiteIncertaine, prixIncertain, decision, question, candidats: [{ articleId, libelle, unite, prixVenteHT, score, pourquoi, regleId }], codeReponse }`.
- `prixVenteHT` : prix de vente unitaire calculé avec les réglages (marge de l'article ou des réglages, mode de marge) ; **jamais `prixAchat` ni `marge`** (règle proposée pour ce nouvel outil, voir Q1).
- `question` : la phrase prête à poser, en français, ou vide quand `decision = utiliser`.
- `codeReponse` : **abandonné en PR 3 (28/10/2026)**, remplacé par le recalcul des candidats à l'écriture (voir l'en-tête) ; texte d'origine : **reporté à la PR 3 (décision du 28/10/2026, absent de la PR 2)** : `emettreCode` ÉCRIT dans `mcp_codes`, alors qu'un outil de lecture n'écrit jamais (`readOnlyHint: true`) ; c'est la PR 3, qui crée l'outil d'écriture, qui l'exige. Durée prévue : celle de `DUREE_CODE_MS` (5 minutes), pas 30. Texte prévu : un code à usage unique de **30 minutes**, lié au jeton, à la phrase et aux candidats proposés (même mécanisme que `functions/src/securite/codes.js`, « aperçu puis code »). Il prouve, au second outil, qu'une vraie question a été posée.

Description pour l'assistant (texte final prévu pour la PR 3 ; la PR 2 livre une description sans `enregistrer_reponse_vocabulaire` ni `codeReponse`, qui n'existent pas encore) : « Avant d'ajouter une ligne à un devis à partir des mots de l'utilisateur, appelle cet outil avec la phrase telle quelle. `utiliser` : ajoute la ligne du premier candidat. `proposer` ou `demander` : pose exactement `question`, attends la réponse, puis appelle `enregistrer_reponse_vocabulaire` avec `codeReponse`. Ne choisis jamais un article à la place de l'utilisateur. »

### `enregistrer_reponse_vocabulaire` (écriture journalisée, profils B C ; éditeur chez un client)

Entrées (écart PR 3 : **pas de `codeReponse`**, `phrase` est obligatoire et sert au recalcul des candidats) : `reponse` : `confirme` (un candidat proposé) · `autre` (un article hors liste) · `aucun` (rien ne convient) ; `articleId` (obligatoire pour `confirme` et `autre`) ; `phrase` (la phrase d'origine, recopiée, pour l'exemple).

Effets : `confirme` → crée ou met à jour la règle de la clé (`origine: apprise_question`, `confirmations + 1`) ; `autre` → règle `apprise_correction`, `contradictions + 1` sur la règle qui pointait ailleurs, `conflit: true` si cette autre règle était active ; `aucun` → n'écrit rien (ligne de journal reportée). Sortie : `{ regleId, statut, confirmations, message }`. Refus : article hors des candidats pour `confirme`, décision `utiliser` ou article déjà candidat pour `autre`, article désactivé, `articleId` absent, dictionnaire plein.

### Réponse type de l'assistant

> Client : « Ajoute 3 prises doubles et le tableau. »
> Assistant : « 3 × Prise double 16 A, c'est noté (règle connue). Pour « le tableau », tu veux « Tableau électrique 2 rangées » ou « Tableau électrique 4 rangées » ? »
> Client : « Le 2 rangées. »
> Assistant : « D'accord, je m'en souviendrai. Récapitulatif avant de créer le brouillon : 3 × Prise double 16 A à 12,50 € HT, 1 × Tableau électrique 2 rangées à 180,00 € HT. Je crée ? »

### Lignes de devis avec un prix dit par le client

Aujourd'hui les lignes de `creer_devis_brouillon` et `modifier_devis_brouillon` ne portent que `articleId`/`reference` et `quantite` : « la prise à 25 € » n'a pas de chemin. Proposition : un champ facultatif `prixVente` par ligne (euros, 2 décimales), appliqué par `avecPrixVente` de `editeur-logique.js` (ce que fait déjà l'écran quand on tape un prix de vente). Aucune ligne libre sans article par l'assistant (le prix d'achat reste donné par l'humain via `creer_article`). Voir Q3.

## 7. Apprentissage

- **Sources** : (1) réponse `confirme` à une question ; (2) réponse `autre` (correction) ; (3) **devis finalisé** : à la finalisation, chaque ligne qui porte `vocabulaire: { regleId }` (posé par l'outil quand la ligne vient d'une règle ou d'une réponse) ajoute une confirmation. La source 3 arrive dans une PR à part (section 11) : elle touche `coeur/devis.js`.
- **Quand une règle devient active seule** : `confirmations ≥ 2`, `contradictions = 0`, `conflit = false`, et la clé n'est pas « trop générale » (ci-dessous). Une règle manuelle est active tout de suite. Une confirmation par jour au plus compte (deux « oui » dans la même conversation ne suffisent pas) : `decisionApprentissage(regle, evenement, maintenant, { articles })` (PR 1, fonction pure, `maintenant` = `AAAA-MM-JJ` donné par l'appelant) rend la règle mise à jour ; une confirmation ne compte que si son jour diffère de `derniereConfirmationLe`.
- **Règles fausses ou empoisonnées** : un client qui répond n'importe quoi crée au pire une règle `a_confirmer` (toujours proposée avec question, jamais appliquée seule) ; il faut deux jours différents et aucune contradiction pour qu'elle agisse seule, et Jérôme la voit dans la revue. **Deux articles pour un même mot** : la seconde confirmation vers un autre article passe la règle en `conflit`, elle redescend à `proposer` et apparaît dans « À trancher ». **Mot trop général** : une clé d'un seul mot de 3 lettres ou moins, un mot vide, ou une clé qui correspond à plus de 5 articles par l'étape 4 ne devient jamais active seule (marquée « mot trop général » dans la revue ; Jérôme peut forcer à l'écran). Le code de réponse empêche d'écrire une règle sans question posée.
- **Limites** : 500 règles actives et 300 `a_confirmer` par espace ; au-delà, l'outil refuse d'en créer et le dit (« dictionnaire plein : fais la revue ») ; une règle `a_confirmer` jamais confirmée depuis 180 jours passe `desactivee` **à la revue seulement** (bouton « Nettoyer », confirmation), jamais toute seule.
- **Annulation** : désactiver (écran ou revue), `restaurer_depuis_audit` pour une écriture du serveur, « Retiré · Annuler » 8 secondes à l'écran. Jamais de suppression.

## 8. Écran « Vocabulaire »

Troisième onglet du module Devis (barre `js/os/onglets.js`) : **Devis · Catalogue · Vocabulaire**, route `devis/vocabulaire`, une seule entrée de menu, pas de sous-onglets. Chez Jérôme comme chez les clients.

- **En haut** : phrase d'état (« 42 règles actives · 7 à confirmer · 2 à trancher ») ; bouton **« Filtres »** commun (`fenetreFiltres`) avec les groupes Statut (active, à confirmer, désactivée), Origine, « À trancher seulement », « Mot trop général » ; recherche par mot ; tri « Dernière utilisation » par défaut (`selecteurTri`).
- **Liste** (table sur ordinateur, cartes sur téléphone, 44 px) : expression, article (lien vers le catalogue), origine, confirmations / contradictions, dernière utilisation, pastille de statut, menu « … » (Activer, Désactiver, Changer l'article, Note). « Désactiver » = fenêtre de confirmation (« Cette règle ne sera plus proposée à ton assistant. Annuler ») puis « Retiré · Annuler » 8 s. « Changer l'article » = liste de recherche du catalogue (même composant que l'éditeur). Clic sur l'exemple = développer les 5 phrases.
- **Création manuelle** : ligne « Règle  + Ajouter » en texte jaune ; le formulaire (expression, article) apparaît à la place ; bouton **« Enregistrer la règle »** grisé tant que l'expression est vide, jaune au premier caractère (seul jaune de l'écran). Avant d'enregistrer, l'écran montre la clé normalisée et, si une règle existe déjà pour cette clé, propose de la modifier au lieu de la doubler.
- **Essayer** : un champ « Essayer une phrase » (icône « i » : « Montre ce que ton assistant comprendrait ») qui appelle le moteur en local (même code) et affiche la décision, sans rien enregistrer.
- **Export** : règle « chaque module a son bouton d'export » : `devis_vocabulaire` entre dans `collections` du module `devis` (`registre.js`), donc « Réglages > Devis > Sauvegarde > Exporter mes données » l'emporte ; en plus, dans le menu « … » de l'écran, **« Exporter le vocabulaire (CSV) »** (expression, article, statut, origine, confirmations, dernière utilisation) pour la revue dans un tableur.
- **Cas vide** : « Aucun mot appris pour l'instant. Les règles apparaissent quand ton assistant te pose une question, ou ajoute-en une ici. » avec la ligne « Règle  + Ajouter ». Filtre sans résultat : « Aucune règle ne correspond à ces filtres. Tout effacer ».
- **Cas d'erreur** : lecture impossible → « Connexion impossible pour le moment… Réessayer » (`lireCompteAvecReprises`, jamais de déconnexion) ; écriture refusée → message sous la ligne, valeur réelle remise ; article désactivé → pastille grise « article désactivé » et « Changer l'article ».
- **Téléphone** : cartes, menu « … » en bas de carte, formulaire plein écran, tiroir refermé avant tout clic (tests).

## 9. Parité Jérôme / clients et modules concernés

- Même code partout : moteur dans `js/modules/devis/`, copié par `preparer-fonctions.js` vers `functions/partage/` puis `functions-plateforme/serveur/partage/` ; outils dans `functions/src/mcp/outils/` (dossier `mcp/` déjà copié chez les clients) ; déclaration dans `registre.js` (`outilsMcp` et `collections` du module `devis`) : ils apparaissent chez un client dès que son module Devis est actif et après redéploiement `mcp` par Jérôme.
- Règles Firestore dans **les deux fichiers**, même PR (liste d'arrêt).
- `tests/mcp-clients.test.js` D1a : le compte passe de 69 à **71** ; les textes des outils ne citent rien de propre à Jérôme.
- Modules touchés : Devis (écran, outils, export) ; Journal des modifications (nouvelle collection affichée par son nom) ; Accès MCP (page d'information : rien à changer). Aucun changement des outils existants (`chercher_article`, `lister_articles`, `lire_devis` gardent ce qu'ils montrent).

## 10. Stratégie de tests

- **Jeu d'essai générique** (`tests/devis-vocabulaire.test.js`, à inscrire dans `test:logique` de `tests/package.json`, ou ajouté dans `tests/devis-articles.test.js` pour éviter le conflit) : un catalogue inventé de 25 articles, un dictionnaire de 10 règles, **60 phrases** avec la décision et le candidat attendus (accents, pluriels, fautes, mots vides, prix et quantité, conflit, mot trop général, règle partielle).
- **Métriques** calculées par le test et affichées : **précision des `utiliser`** (bonne ligne ÷ lignes utilisées) **= 100 %** exigée (un faux `utiliser` fait échouer le test) ; **taux de questions** (`proposer` + `demander`) ≤ 40 % sur le jeu sans règle, ≤ 15 % avec les 10 règles ; **rappel** (le bon article est dans les candidats) ≥ 95 %.
- **Déterminisme** : même entrée, même sortie, vérifié deux fois ; aucune date dans la décision.
- **Outils MCP** (`tests/devis-mcp.test.js`, accès en mémoire) : décision rendue, code exigé, code expiré refusé, règle `a_confirmer` après un « oui », active après deux « oui » de jours différents, conflit après un « autre », plafond 500, aucun `prixAchat` dans la sortie (verrou comme `lister_devis`), isolation par client (`tests/mcp-clients.test.js`).
- **Règles Firestore** (`tests/regles.test.js`, `tests/regles-plateforme.test.js`) : lecteur lit, éditeur crée une règle manuelle, refus d'une règle « apprise » depuis le navigateur, refus de toucher `confirmations`, refus de supprimer, autre client refusé.
- **Écran** (`tests/e2e/devis-vocabulaire.spec.js`, ordinateur **et** `--project=telephone`) : un test par point de la section 8, captures dans `tests/e2e/captures/devis-vocabulaire/` ; `look-compact` si du CSS est touché ; export CSV vérifié par son contenu.
- **Parité** : le test de copie (`functions/partage/` identique à la source) couvre le nouveau fichier.
- **Non vérifiable en session** : le vrai ChatGPT et le vrai claude.ai (comment ils formulent la question), le redéploiement `mcp` chez un client.

## 11. Découpage en PR (dans cet ordre, une par jour au plus)

| # | PR | Fichiers | Relecture | Liste d'arrêt |
|---|---|---|---|---|
| 1 | **Fondation** : moteur pur `js/modules/devis/vocabulaire.js` (normalisation, nombres, score, décision), jeu d'essai et métriques, copie dans `preparer-fonctions.js`, ce document mis à jour | `js/modules/devis/vocabulaire.js`, `scripts/preparer-fonctions.js`, `tests/devis-vocabulaire.test.js`, `tests/package.json`, `docs/` + `wiki/` | Fable obligatoire (code partagé serveur) | non |
| 2 | **Outil de recherche** `rechercher_article_par_phrase` (lecture, codes de réponse) + `prixVente` sur les lignes des brouillons (si Q3 = oui) | `functions/src/mcp/outils/lecture.js`, `ecriture.js`, `coeur/lecture.js`, `coeur/metier.js`, `js/os/registre.js` (`outilsMcp`), `tests/devis-mcp.test.js`, `tests/mcp-clients.test.js` (70) | Fable obligatoire | non (la collection est vide ; le serveur contourne les règles) |
| 3 | **Apprentissage** : `enregistrer_reponse_vocabulaire`, journal, plafonds, conflits | `functions/src/mcp/outils/ecriture.js`, `coeur/metier.js`, `coeur/donnees.js` (collection), `registre.js` (71), tests | Fable obligatoire | non |
| 4 | **Règles Firestore** des deux projets + `collections` du module (export) + tests de règles | `firestore.rules`, `firestore.plateforme.rules`, `registre.js`, `tests/regles*.test.js` | Fable obligatoire | **oui** (étiquette `a-fusionner-par-jerome`, publication par les workflows) |
| 5 | **Écran « Vocabulaire »** + export CSV + parcours ordinateur et téléphone + captures | `js/modules/devis/vocabulaire-ecran.js`, `index.js`, `registre.js` (écran), CSS, `tests/e2e/devis-vocabulaire.spec.js` | Fable obligatoire (nouvel écran) | non |
| 6 | **Confirmation à la finalisation** (source 3) | `functions/src/coeur/devis.js`, tests serveur | Fable obligatoire | non |

Chaque PR : `npm run test:module devis`, `test:rapide`, `test:smoke` ; la PR 4 déclenche le palier complet (fichiers sensibles). Après la PR 3 et la PR 5, Jérôme redéploie `mcp` puis `hosting` chez les clients (workflow plateforme).

## 12. Risques et alternatives écartées

- **L'assistant n'appelle pas l'outil** et choisit seul avec `chercher_article` : le dictionnaire ne sert à rien. Parade : la description de `creer_devis_brouillon` renvoie vers le nouvel outil ; à vérifier avec le vrai ChatGPT (risque non testable ici). Alternative écartée : retirer `chercher_article` (il sert aux ouvrages et à la création d'articles).
- **Trop de questions au début** : le client se lasse. Parade : seuils réglables dans le moteur (constantes), métriques du jeu d'essai, règles manuelles saisies par Jérôme à l'installation (20 mots du métier).
- **Clé trop normalisée** (« prise 2 » et « prise » donnent la même clé : c'est voulu, le 2 est une quantité) : les chiffres collés à un mot (`16a`, `2p`) et un nombre au milieu d'une expression (« tableau 2 rangées ») restent dans la clé ; seuls les nombres isolés en début ou en fin de phrase deviennent quantité, et les montants suivis de € ou euros deviennent un prix.
- **Identifiant de document = clé** : une clé très longue (> 100 caractères) est tronquée à 100 ; une expression vide est refusée.
- **Prix de vente dit par le client** sans article : on ne crée pas de ligne libre par l'assistant (prix d'achat inconnu). Alternative écartée : ligne libre à prix d'achat 0 (fausse la marge).
- **Un dictionnaire commun à tous les clients** : écarté (décision b) ; les mots d'un métier ne sont pas ceux d'un autre, et ce serait une fuite entre espaces.
- **Mettre le moteur dans le prompt de l'assistant** : écarté, l'intelligence doit être chez nous et testable.
- **Apprentissage automatique (vecteurs, modèle local)** : écarté pour la v1 (pas de dépendance, pas de serveur de calcul, pas explicable).

## 13. Questions pour Jérôme (valeur prise par défaut en gras)

- **Q1. Prix dans le nouvel outil** : (a) **prix de vente seulement, jamais prix d'achat ni marge** (règle cohérente avec `lister_devis`) ; (b) comme `chercher_article` (prix d'achat visible). Les outils existants ne changent pas dans tous les cas.
- **Q2. Activation automatique** : (a) **2 confirmations, 2 jours différents** ; (b) 3 confirmations ; (c) jamais seule, toujours par la revue.
- **Q3. `prixVente` facultatif sur les lignes des brouillons MCP** (« la prise à 25 € ») : (a) **oui, dans la PR 2** ; (b) non, le prix se change à l'écran.
- **Q4. Un prix dit par le client est** : (a) **HT** ; (b) TTC (converti avec le taux de la ligne).
- **Q5. Place de l'écran** : (a) **onglet « Vocabulaire » du module Devis** ; (b) section des Réglages > Devis.
- **Q6. Qui fait la revue chez un client** : (a) **Jérôme et l'éditeur du client (même écran)** ; (b) Jérôme seul (écran en lecture seule chez le client, mais ça viole « même code »).
- **Q7. Plafonds** : (a) **500 actives, 300 à confirmer** ; (b) autres chiffres.
- **Q8. Export CSV en plus du JSON du module** : (a) **oui** ; (b) le JSON suffit.
- **Q9. Nom de l'outil** : (a) **`rechercher_article_par_phrase`** ; (b) `comprendre_demande_devis`.
- **Q10. Ordre des PR** : (a) **1 → 6 tel quel** ; (b) l'écran (5) avant l'apprentissage (3) pour que Jérôme saisisse des règles manuelles dès le début (demande alors la PR 4 plus tôt).

## Revue critique (les failles que je vois dans ma propre proposition)

1. **Le code de réponse de 30 minutes** suppose que le client répond dans la conversation ; s'il revient le lendemain, l'assistant doit rappeler l'outil de recherche. Acceptable, mais à écrire dans la description de l'outil.
2. **Identifiant = clé** (clé vide refusée, tronquée à 100) rend impossible deux règles pour une même expression, voulu, mais aussi impossible une règle « contextuelle » (« tableau » = 2 rangées en rénovation, 4 en neuf). Hors v1 ; la note sert à Jérôme.
3. **Le seuil 0,85 / écart 0,15** est choisi à la main : seul le jeu d'essai dira s'il est bon. Les constantes doivent être dans un seul endroit et le test doit afficher les métriques pour qu'on les ajuste sans tout relire.
4. **Le plancher 0,60 de l'étape 4** met tous les articles « qui contiennent les mots » à égalité : c'est voulu (on pose la question) mais il faut une règle de départage lisible (ordre alphabétique, puis identifiant) pour que la liste des choix soit stable.
5. **La source 3 (devis finalisé)** ajoute un champ `vocabulaire` dans les lignes du devis : un ancien devis sans ce champ doit continuer de se finaliser (le code doit traiter l'absence) et la « vue client » (`document.js`) ne doit jamais l'imprimer : un test le verrouille.
6. **Les règles Firestore proposées** laissent le navigateur passer une règle à `active` sans confirmation (c'est le but de la revue). Un client éditeur peut donc activer une règle fausse pour son propre espace : son problème, journalisé ; mais si Q6 = b, les règles doivent changer.
7. **Le compte 69 → 71** et la liste `test:logique` sont des sources de conflits entre PR de la même nuit : la PR 1 ne touche que `test:logique`, les PR 2 et 3 le compte, jamais en parallèle.
8. **Je n'ai pas pu vérifier** comment ChatGPT enchaîne deux appels d'outils avec une question entre les deux ; si l'enchaînement se perd, le dictionnaire s'apprend mal : à essayer avec un vrai connecteur avant la PR 3.
9. **Le mot « règle »** est déjà employé pour les règles Firestore dans la documentation : à l'écran on dit « règle de vocabulaire » ou « mot appris » (un mot = une seule chose, `consignes-ui.md`) ; à trancher dans la PR 5.
10. **La pluralisation naïve** (`s`/`x` retirés) peut rapprocher deux mots différents (`vis`/`vi`, `bus`/`bu`) : limite acceptée, visible dans la clé que l'écran affiche avant d'enregistrer.
