# Cadrage : adresse de facturation et adresse de chantier sur la fiche d'une personne

Écrit le 31/10/2026 (**document de cadrage, aucun code, aucune règle, aucune donnée touchée**). Demande de Jérôme du 29/10/2026 (`.github/A-FAIRE.md`, ligne « Fiche d'une personne : ajouter une adresse de facturation et une adresse de chantier »). Les lignes de code citées ont été relues sur `origin/main` le 31/10/2026. Ce que j'ai choisi seul est marqué **Décision prise seule**. Exemples inventés.

## 1. Constat : c'est déjà fait à environ 80 %

| Sujet | Où | État |
|---|---|---|
| Liste d'adresses sur la fiche d'une **personne** et d'une **organisation** : `adresses: [{ id, libelle, adresse, parDefaut }]`, 10 au plus, libellé libre, un seul « par défaut » | `js/modules/crm/logique.js:967-1047` (`MAX_ADRESSES` l.970, `adressesDe` l.1011, `patchAdresses` l.1030, doublon exact refusé via `cleAdresse` l.978) | livré |
| Composant d'écran | `champAdresses`, `js/modules/crm/composants.js:708-790` (champ « libellé » : l.733, composant **partagé** par les fiches personne et organisation) ; utilisé par `fiche-personne.js:97` et `fiche-organisation.js:55` | livré |
| Tests | `tests/adresses-logique.test.js`, `tests/e2e/adresses.spec.js` | livrés |
| Le devis porte trois adresses : `adresses { commanditaire, facturation, chantier }` | `js/modules/devis/logique.js:880` et `:1059-1063` | livré |
| Préremplissage d'un devis à l'écran | `editeur-ecran.js:1287-1300` (`appliquerClient`) reçoit **une seule** adresse texte, fabriquée avant dans `editeur-ecran.js:77` et `:83` (`clientParCle`) puis posée par `valeursDeCreation` (`editeur-logique.js:482-492`) ; la copie dans commanditaire et facturation, et dans chantier si le chantier était vide ou égal à l'adresse automatique précédente | livré, mais **ne distingue pas** les adresses de la fiche |
| Préremplissage côté serveur (assistant) | `functions/src/coeur/metier.js:938` (création) et `appliquerClientAuBrouillon` (`:963-978`, changement de client d'un brouillon par `modifier_devis_brouillon`, verrouillé par le test R2 `tests/devis-mcp.test.js:448-460`) ; `adresseDuClient` (`:956`) : adresse **par défaut**, sinon la première | livré, même limite |
| PDF | `js/modules/devis/document.js:131` (bloc client = facturation, sinon commanditaire) et `:225-226` (ligne « Adresse du chantier » si `adresses.chantier` existe **et** que le bloc Chantier n'a pas d'adresse ; en pratique `appliquerClient` écrit aussi `travail.chantier.adresse`, l.1298, donc c'est le bloc Chantier qui porte l'adresse) | livré |
| Assistant (MCP) | `creer_personne` / `modifier_personne` acceptent `adresses` avec `libelle` : `functions/src/mcp/outils/ecriture.js:16-19, 63, 67-68` ; lecture `functions/src/coeur/lecture.js:80` (personne) et `:97` (organisation) | livré |
| Export | le JSON emporte la fiche entière ; **le vCard n'exporte que la ville** (`logique.js:2627`, `ADR;TYPE=HOME:;;;ville`) | manque |
| « Enregistrer sur la fiche » (adresse tapée sur un devis ajoutée à la fiche) | décidé dans `docs/cadrage-devis.md:59` et D10 (l.168) | **décidé, pas fait** |

**Ce qui manque vraiment** : rien ne dit **quelle adresse de la fiche est la facturation** et **laquelle est le chantier**. Le devis reçoit toujours la même adresse (la « par défaut ») partout.

## 2. Recommandation (Décision prise seule)

**Pas de nouveaux champs** (pas de migration, pas de règle Firestore). On réserve **deux libellés** dans la liste existante : `Facturation` et `Chantier`. Le libellé reste libre : l'écran propose seulement ces deux mots (puces ou liste de suggestions dans `champAdresses`, constante `LIBELLES_ADRESSE_SUGGERES`), et la comparaison ignore la casse et les accents. `cleAdresse` (`logique.js:978`) n'est **pas exportée** : il faut un nouvel utilitaire exporté (par exemple `cleLibelle`). La suggestion se fait sur le champ libellé de `composants.js:733` (par exemple un `datalist`) ; elle vaut donc **aussi pour les organisations** (même composant, et le client d'un devis peut être une organisation : `editeur-ecran.js:1013`, `metier.js:935`).

Variante écartée : deux champs dédiés (`adresseFacturation`, `adresseChantier`) sur la fiche. Elle ajoute des champs aux données existantes, double l'écran déjà livré, oblige à migrer les fiches qui ont une liste, et ne sert qu'à une personne avec un seul chantier.

**Les libellés réservés valent pour les personnes ET les organisations.** Exemple : Mme Martin a trois adresses : « Principale » (rue A), « Facturation » (rue B), « Chantier » (rue C). Un nouveau devis part avec commanditaire = rue A, facturation = rue B, chantier = rue C. Une fiche sans libellé réservé se comporte **exactement comme aujourd'hui**. **Décision prise seule : la règle est rétroactive** : une fiche qui porte déjà « Facturation » ou « Chantier » (tapé à la main) change de comportement dès la fusion ; avant la fusion, Jérôme (ou Claude, en lecture seule avec `chercher` / `lire_personne`, sans rien écrire dans le dépôt) regarde si de telles fiches existent. S'il y a plusieurs « Facturation », la première est retenue, comme pour « Chantier ».

## 3. Règle de préremplissage

Une **fonction pure** `adressesPourDevis(fiche)`, placée dans `js/modules/crm/logique.js` à côté de `adressesDe` : ce fichier est **déjà copié** pour le serveur par `scripts/preparer-fonctions.js` (un fichier nouveau obligerait à modifier le script en deux endroits : la copie et la liste de la plateforme). Elle est utilisée par l'écran **et** par le serveur, et rend `{ commanditaire, facturation, chantier }` :
- **commanditaire** = l'adresse « par défaut », sinon la première **sans libellé réservé**, sinon la première (sinon une fiche dont la seule première adresse est « Chantier » donnerait la même rue partout) ;
- **facturation** = l'adresse au libellé `Facturation`, sinon le commanditaire ;
- **chantier** = l'adresse au libellé `Chantier`, sinon le commanditaire.

Garde-fous : une adresse de chantier **écrite à la main** n'est jamais écrasée. **Piège** : la règle `aRemplacer` (`editeur-ecran.js:1291-1293`, et `precedente` côté serveur, `metier.js:971`) compare le chantier actuel à l'adresse unique mémorisée ; avec la nouvelle règle le chantier automatique est la rue C alors que la mémoire garde la rue A, et l'adresse de chantier de l'ancien client resterait sur le devis du nouveau. Il faut donc mémoriser **l'adresse de chantier automatique** (`ref.adresseAuto = adressesPourDevis(fiche).chantier` ; serveur : `precedente = adressesPourDevis(ancienne).chantier`) ; modifier la fiche ne change jamais un devis existant (D10) ; s'il y a plusieurs adresses « Chantier », la première est retenue (voir question 2).

## 4. PDF

Rien à changer : le bloc client lit déjà la facturation puis le commanditaire (`document.js:131`), et la ligne chantier s'affiche déjà quand elle diffère (`:226-227`). **Risque** : avec une facturation distincte, le bloc client affiche la rue B et l'adresse du commanditaire (rue A) n'apparaît plus nulle part sur le PDF. **Question 1** : faut-il une ligne « Adresse de facturation » distincte quand elle diffère du commanditaire ? Recommandé : **oui** si l'écart se voit en pratique ; sinon la rue A disparaît du PDF sans avertissement. Cette ligne serait une PR à part (le PDF est un gros écran).

## 5. Assistant (MCP) et export

- Compléter la **description** de `adresses` dans `ecriture.js:16-19` : « libellés `Facturation` et `Chantier` reconnus pour préremplir un devis ». Aucun nouvel outil ; le nombre d'outils (81) ne change pas.
- vCard : une ligne `ADR` par adresse enregistrée, à la place de la seule ville (`logique.js:2627`). **Attention** : `ADR;TYPE=<libellé>` est invalide en vCard 3.0 (les valeurs de `TYPE` sont des jetons : HOME, WORK, PREF…, un libellé libre casse l'import). Utiliser `TYPE=HOME` (et `PREF` pour l'adresse par défaut), le libellé par la convention `item1.ADR…` / `item1.X-ABLabel:Facturation`, l'adresse entière échappée par `echapperVcf` dans la 3e partie ; garder la `ville` seule pour une fiche sans liste. **PR séparée** (retouche d'export, relecture Fable non requise), avec une assertion `ADR` à ajouter dans `tests/logique.test.js` (il n'en a aucune aujourd'hui).

## 6. Migration, règles, parité, démonstration

- **Migration : aucune** (aucun champ ajouté, les listes existantes restent lisibles). **Règles Firestore : aucune à changer** (joker `firestore.rules:172-174`). Aucune donnée de Jérôme modifiée.
- **Parité** (règle du 26/10/2026) : l'écran est dans `js/` (même code partout) ; la fonction pure et son appel côté serveur vont dans `functions/` **et** `functions-plateforme/` dans la même PR ; vérifier avec `docs/audit-ecarts-fonctions.md`. Déploiement chez les clients : `fonctions` et `hosting`, lancés par Jérôme.
- **Données de démonstration** : `scripts/donnees-demo.js` n'écrit aujourd'hui **aucune** `adresses` ; l'ajout de deux fiches de démo avec des adresses « Facturation » et « Chantier » inventées est une modification du script (voir `docs/cadrage-demos-par-metier.md`). Le script ne vise que le projet des clients : aucune donnée de Jérôme touchée.

## 7. Critères d'acceptation de la future PR d'écran (un par phrase, un test chacun)

1. Dans « Ajouter une adresse », l'utilisateur voit deux suggestions de libellé, « Facturation » et « Chantier », et peut toujours écrire un autre libellé.
2. Un devis créé pour une personne qui a ces deux libellés reprend la facturation et le chantier dans les bons champs.
3. Une fiche sans libellé réservé donne le même devis qu'avant (aucune régression) ; une fiche qui en porte déjà un suit la nouvelle règle (voir section 2).
4. Une adresse de chantier saisie à la main n'est pas écrasée quand on change de client puis qu'on revient.
5. Le serveur donne le même résultat que l'écran, avec la même fonction, à la **création** d'un devis et au **changement de client** d'un brouillon par l'assistant.
5 bis. Changer de client remplace un chantier qui venait de la fiche précédente (écran ET serveur), et laisse un chantier écrit à la main.
5 ter. Les libellés réservés fonctionnent pour une organisation comme pour une personne.
6. Le vCard exporte une ligne `ADR` par adresse.
7. Cas vide : une fiche sans adresse laisse les trois champs du devis vides. Cas d'erreur : au-delà de 10 adresses, le message existant s'affiche (`logique.js:1039`).

Tests qui verrouillent l'existant et à adapter : `tests/e2e/devis-choix-client.spec.js` (tests 2 et 4 ; sélecteur `[data-champ="chantier-adresse"]`), `tests/devis-editeur.test.js:199-205` (`valeursDeCreation`, cas vide l.204), `tests/devis-mcp.test.js:448-460` (R2), `tests/adresses-logique.test.js`, `tests/logique.test.js` (vCard). `tests/devis-logique.test.js`, `tests/devis-document.test.js` et `tests/e2e/devis-editeur-menus.spec.js` n'utilisent que des adresses figées : à relancer, sans changement attendu. Tout test d'écran se lance aussi en format téléphone.

## 8. Questions pour Jérôme (avec réponse recommandée)

1. **Libellés exacts** : « Facturation » et « Chantier » ? Recommandé : oui.
2. **Plusieurs chantiers pour une même personne** ? Recommandé : oui, le premier « Chantier » est retenu, la saisie à la main reste possible.
3. **« Enregistrer sur la fiche » dans la même PR ?** Recommandé : non, PR suivante (c'est la décision D10 de `cadrage-devis.md`).
4. **Un sélecteur « choisir parmi les adresses de la fiche » dans le devis ?** Recommandé : oui, PR suivante.
5. **Ligne « Adresse de facturation » distincte sur le PDF** (section 4) ? Recommandé : non pour l'instant.

## 9. Taille et PR

Une PR principale : écran (suggestions de libellé), fonction pure et mémoire du chantier automatique, serveur (création et changement de client), description MCP. Taille **M**. Le vCard est une **PR séparée** (section 5). **Relecture Fable obligatoire** (elle touche au serveur et à l'éditeur du devis). Pas de liste d'arrêt (ni règle, ni migration, ni déploiement par la PR elle-même). Les PR 3 et 4 de la question ci-dessus viennent ensuite, une par sujet. La documentation va dans la PR de code, pas à part.

## 10. Ce qui n'est PAS fait

Aucun libellé réservé, aucune fonction `adressesPourDevis`, aucune suggestion dans l'écran, aucun changement de vCard, aucune donnée touchée, aucun déploiement.
