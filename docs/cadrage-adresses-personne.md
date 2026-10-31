# Cadrage : adresse de facturation et adresse de chantier sur la fiche d'une personne

Écrit le 31/10/2026 (**document de cadrage, aucun code, aucune règle, aucune donnée touchée**). Demande de Jérôme du 29/10/2026 (`.github/A-FAIRE.md`, ligne « Fiche d'une personne : ajouter une adresse de facturation et une adresse de chantier »). Les lignes de code citées ont été relues sur `origin/main` le 31/10/2026. Ce que j'ai choisi seul est marqué **Décision prise seule**. Exemples inventés.

## 1. Constat : c'est déjà fait à environ 80 %

| Sujet | Où | État |
|---|---|---|
| Liste d'adresses sur la fiche d'une **personne** et d'une **organisation** : `adresses: [{ id, libelle, adresse, parDefaut }]`, 10 au plus, libellé libre, un seul « par défaut » | `js/modules/crm/logique.js:967-1047` (`MAX_ADRESSES` l.970, `adressesDe` l.1011, `patchAdresses` l.1030, doublon exact refusé via `cleAdresse` l.978) | livré |
| Composant d'écran | `champAdresses`, `js/modules/crm/composants.js:708-770` ; utilisé par `fiche-personne.js:97` et `fiche-organisation.js:55` | livré |
| Tests | `tests/adresses-logique.test.js`, `tests/e2e/adresses.spec.js` | livrés |
| Le devis porte trois adresses : `adresses { commanditaire, facturation, chantier }` | `js/modules/devis/logique.js:880` et `:1059-1063` | livré |
| Préremplissage d'un devis à l'écran | `editeur-ecran.js:1287-1300` (`appliquerClient`) : reçoit **une seule** adresse texte, la copie dans commanditaire et facturation, et dans chantier si le chantier était vide ou égal à l'adresse automatique précédente | livré, mais **ne distingue pas** les adresses de la fiche |
| Préremplissage côté serveur (assistant) | `functions/src/coeur/metier.js:938` (création) et `adresseDuClient`, `:956` : adresse **par défaut**, sinon la première | livré, même limite |
| PDF | `js/modules/devis/document.js:131` (bloc client = facturation, sinon commanditaire) et `:226-227` (ligne « Adresse du chantier » si elle diffère) | livré |
| Assistant (MCP) | `creer_personne` / `modifier_personne` acceptent `adresses` avec `libelle` : `functions/src/mcp/outils/ecriture.js:16-19, 63, 67-68` ; lecture `lecture.js:80` | livré |
| Export | le JSON emporte la fiche entière ; **le vCard n'exporte que la ville** (`logique.js:2627`, `ADR;TYPE=HOME:;;;ville`) | manque |
| « Enregistrer sur la fiche » (adresse tapée sur un devis ajoutée à la fiche) | décidé dans `docs/cadrage-devis.md:59` et D10 (l.168) | **décidé, pas fait** |

**Ce qui manque vraiment** : rien ne dit **quelle adresse de la fiche est la facturation** et **laquelle est le chantier**. Le devis reçoit toujours la même adresse (la « par défaut ») partout.

## 2. Recommandation (Décision prise seule)

**Pas de nouveaux champs** (pas de migration, pas de règle Firestore). On réserve **deux libellés** dans la liste existante : `Facturation` et `Chantier`. Le libellé reste libre : l'écran propose seulement ces deux mots (puces ou liste de suggestions dans `champAdresses`, constante `LIBELLES_ADRESSE_SUGGERES`), et la comparaison ignore la casse et les accents, comme `cleAdresse`.

Variante écartée : deux champs dédiés (`adresseFacturation`, `adresseChantier`) sur la fiche. Elle ajoute des champs aux données existantes, double l'écran déjà livré, oblige à migrer les fiches qui ont une liste, et ne sert qu'à une personne avec un seul chantier.

Exemple : Mme Martin a trois adresses : « Principale » (rue A), « Facturation » (rue B), « Chantier » (rue C). Un nouveau devis part avec commanditaire = rue A, facturation = rue B, chantier = rue C. Une fiche sans libellé réservé se comporte **exactement comme aujourd'hui**.

## 3. Règle de préremplissage

Une **fonction pure** `adressesPourDevis(fiche)`, utilisée par l'écran **et** par le serveur (copiée dans `functions/partage/` et `functions-plateforme/` par `scripts/preparer-fonctions.js`, comme les autres fonctions pures), rend `{ commanditaire, facturation, chantier }` :
- **commanditaire** = l'adresse « par défaut », sinon la première ;
- **facturation** = l'adresse au libellé `Facturation`, sinon le commanditaire ;
- **chantier** = l'adresse au libellé `Chantier`, sinon le commanditaire.

Garde-fous : une adresse de chantier **écrite à la main** n'est jamais écrasée (la règle `aRemplacer` de `editeur-ecran.js:1287-1300` est gardée) ; modifier la fiche ne change jamais un devis existant (D10) ; s'il y a plusieurs adresses « Chantier », la première est retenue (voir question 2).

## 4. PDF

Rien à changer : le bloc client lit déjà la facturation puis le commanditaire (`document.js:131`), et la ligne chantier s'affiche déjà quand elle diffère (`:226-227`). **Question 1** : faut-il une ligne « Adresse de facturation » distincte quand elle diffère du commanditaire ? Recommandé : non pour l'instant (aujourd'hui la facturation remplace l'adresse du bloc client).

## 5. Assistant (MCP) et export

- Compléter la **description** de `adresses` dans `ecriture.js:16-19` : « libellés `Facturation` et `Chantier` reconnus pour préremplir un devis ». Aucun nouvel outil ; le nombre d'outils (81) ne change pas.
- vCard : une ligne `ADR` par adresse enregistrée (libellé en `TYPE`), à la place de la seule ville (`logique.js:2627`). **PR d'écran séparée**, avec test d'export.

## 6. Migration, règles, parité, démonstration

- **Migration : aucune** (aucun champ ajouté, les listes existantes restent lisibles). **Règles Firestore : aucune à changer** (joker `firestore.rules:172-174`). Aucune donnée de Jérôme modifiée.
- **Parité** (règle du 26/10/2026) : l'écran est dans `js/` (même code partout) ; la fonction pure et son appel côté serveur vont dans `functions/` **et** `functions-plateforme/` dans la même PR ; vérifier avec `docs/audit-ecarts-fonctions.md`. Déploiement chez les clients : `fonctions` et `hosting`, lancés par Jérôme.
- **Données de démonstration** (`docs/donnees-demo.md`) : deux fiches de démo reçoivent des adresses « Facturation » et « Chantier » inventées, pour montrer la fonction (voir aussi `docs/cadrage-demos-par-metier.md`).

## 7. Critères d'acceptation de la future PR d'écran (un par phrase, un test chacun)

1. Dans « Ajouter une adresse », l'utilisateur voit deux suggestions de libellé, « Facturation » et « Chantier », et peut toujours écrire un autre libellé.
2. Un devis créé pour une personne qui a ces deux libellés reprend la facturation et le chantier dans les bons champs.
3. Une personne sans libellé réservé donne le même devis qu'avant (aucune régression).
4. Une adresse de chantier saisie à la main n'est pas écrasée quand on change de client puis qu'on revient.
5. Le serveur (création par l'assistant) donne le même résultat que l'écran, avec la même fonction.
6. Le vCard exporte une ligne `ADR` par adresse.
7. Cas vide : une fiche sans adresse laisse les trois champs du devis vides. Cas d'erreur : au-delà de 10 adresses, le message existant s'affiche (`logique.js:1039`).

Tests qui verrouillent l'existant et à adapter : `tests/devis-logique.test.js`, `tests/devis-mcp.test.js`, `tests/devis-document.test.js`, `tests/e2e/devis-editeur-menus.spec.js` (à lancer aussi en format téléphone).

## 8. Questions pour Jérôme (avec réponse recommandée)

1. **Libellés exacts** : « Facturation » et « Chantier » ? Recommandé : oui.
2. **Plusieurs chantiers pour une même personne** ? Recommandé : oui, le premier « Chantier » est retenu, la saisie à la main reste possible.
3. **« Enregistrer sur la fiche » dans la même PR ?** Recommandé : non, PR suivante (c'est la décision D10 de `cadrage-devis.md`).
4. **Un sélecteur « choisir parmi les adresses de la fiche » dans le devis ?** Recommandé : oui, PR suivante.
5. **Ligne « Adresse de facturation » distincte sur le PDF** (section 4) ? Recommandé : non pour l'instant.

## 9. Taille et PR

Une PR : écran (suggestions de libellé), fonction pure, serveur, description MCP, vCard. Taille **M**. **Relecture Fable obligatoire** (elle touche au serveur et à l'éditeur du devis). Pas de liste d'arrêt (ni règle, ni migration, ni déploiement par la PR elle-même). Les PR 3 et 4 de la question ci-dessus viennent ensuite, une par sujet. La documentation va dans la PR de code, pas à part.

## 10. Ce qui n'est PAS fait

Aucun libellé réservé, aucune fonction `adressesPourDevis`, aucune suggestion dans l'écran, aucun changement de vCard, aucune donnée touchée, aucun déploiement.
