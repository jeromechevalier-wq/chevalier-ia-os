# Cadrage : les consignes de l'assistant, stockées et configurables

Écrit le 31/10/2026 (**document de cadrage, aucun code, rien n'est déployé, aucune règle publiée, aucune donnée touchée**). Décision de Jérôme du 29/10/2026 (ligne « Consignes de l'assistant stockées et configurables » de `.github/A-FAIRE.md`), confirmée le 30/10/2026 : « l'intelligence est de notre côté » (`CLAUDE.md`) : jamais de texte à coller chez ChatGPT ou Claude. Ce que j'ai choisi seul est marqué **Décision prise seule**.

## 0. Le problème en 5 lignes

1. Les consignes de comportement (« ne choisis jamais un article à sa place », « redis la ligne modifiée », « dis hors taxes ») sont aujourd'hui **écrites en dur dans les descriptions des outils** : Jérôme ne peut ni les voir toutes, ni les affiner, ni en supprimer une.
2. Or ces consignes sont la **valeur ajoutée** du logiciel : elles doivent se régler avec le client, une fois par mois, comme le vocabulaire.
3. Cible en trois couches : le **socle** (en dur, lisible, non modifiable), les **consignes de Jérôme** (valables pour tous les clients), les **consignes propres à chaque client**.
4. Plusieurs textes attendent ce chantier pour être livrés : `docs/consignes-assistant-marge.md` (marge, « hors taxes »), l'annexe A de `docs/cadrage-devis-fluide.md` (8 consignes : structurer, numéros, redire, récapitulatifs, historique, habitudes, dire ce qu'il a appris, parler comme le client).
5. Question à vérifier **avant tout code** : un assistant appelle-t-il vraiment un outil `lire_consignes` à chaque conversation ? Sinon, tout le chantier repose sur du vide.

## 1. Ce qui existe déjà (vérifié par `grep` le 31/10/2026)

| Sujet | Où | Constat |
|---|---|---|
| Consignes en dur | descriptions d'outils, `functions/src/mcp/outils/lecture.js` (par exemple `rechercher_article_par_phrase`, ligne 171 : « Ne choisis jamais un article à sa place… »), `ecriture.js`, et le texte de garantie `garantie.js` | elles sont mélangées aux faits ; aucune liste unique |
| Le serveur est recréé à chaque appel | `functions/src/mcp/gestionnaire.js:105` : `new McpServer({ name, version })`, **sans** l'option `instructions` du protocole | le serveur pourrait donner des consignes dès la connexion (champ `instructions` de la réponse d'initialisation) ; **non utilisé aujourd'hui**, à tester |
| Aucun outil `lire_consignes` | `functions/src/mcp/outils/index.js` ; le test `tests/mcp-clients.test.js:967` compte **81 outils** (dont 26 pour les devis, ligne 1118) | l'outil est à créer ; chaque nouvel outil change ces deux comptes |
| Textes prêts | `docs/consignes-assistant-marge.md` (38 lignes, exemple à 100 €), annexe A de `cadrage-devis-fluide.md` | publics, sans donnée de client, à devenir des « consignes de départ » |
| Modèle à imiter : le vocabulaire | collection `devis_vocabulaire` : règles `firestore.rules:157` (création `vocabulaireManuelNeuf`, modification `vocabulaireRevise`, suppression interdite), `firestore.plateforme.rules:174`, accès serveur `functions/src/coeur/donnees.js:38`, liste des collections du navigateur `js/modules/crm/donnees.js:18`, libellé du journal `js/modules/crm/logique.js:2382`, écran `js/modules/devis/vocabulaire-ecran.js`, export CSV, états proposé / validé / désactivé | le chemin d'un nouveau réglage « par espace, relu avec le client » est connu |
| Mot du métier | `devis_parametres/reglages`, `motOuvrage` (`js/modules/devis/ouvrages.js:21`) | un réglage simple dans un document existant ; modèle pour les réglages sans collection |
| Garde-fou « jamais d'envoi » | `functions/src/mcp/outils/garantie.js`, test de verrouillage | **reste dans le socle en dur**, jamais configurable |
| Journal | `crm_audit` et `crm_audit_avant` : jamais effacés (décision RGPD du 04/10/2026) | toute modification d'une consigne y est tracée, valeurs comprises |
| Lenteur | ligne « Lenteur » de `A-FAIRE.md` : 11 à 13 secondes par tour d'outils | un appel de plus coûte du temps réel |

**Ce qui n'existe pas** : ni collection de consignes, ni outil de lecture, ni écran, ni couche « Jérôme valable pour tous », ni mesure du comportement de ChatGPT ou de Claude face à un outil de consignes.

## 2. La vérification à faire d'abord (« les assistants lisent-ils les consignes ? »)

Rien n'est codé tant que ceci n'est pas répondu. Protocole (Jérôme + Claude, sur le **client démo**, pas sur un vrai client), à faire en **deux moitiés** :

1. **Essai à blanc** (aucun code serveur de production) : une version d'essai de `lire_consignes` sur le client démo qui renvoie 2 consignes de départ ; la description du socle dit « appelle d'abord `lire_consignes` ».
2. Pour chaque assistant (ChatGPT, Claude), **10 conversations neuves** sur des demandes différentes (« fais-moi un devis », « ajoute 3 prises », « montre mes devis », « quel est le statut du devis ? »). On note : l'outil est-il appelé ? à quel rang ? une fois ou à chaque tour ? la consigne est-elle suivie ensuite ?
3. **Trois moyens de livraison à comparer**, du plus léger au plus lourd :
   - **A. Le champ `instructions` du protocole** : aucun appel de plus ; à tester si ChatGPT le lit (hypothèse non vérifiée).
   - **B. Les consignes glissées dans la réponse d'un outil que l'assistant appelle déjà** (`lire_reglages_devis` est appelé pour le mot du métier et le vocabulaire) : aucun appel de plus non plus.
   - **C. Un outil `lire_consignes` à part**, imposé par le socle : un appel de plus (≈ 1 à 3 s mesurées, à vérifier).
4. **Critère de réussite** : au moins 9 conversations sur 10 où la consigne est connue **avant** la première écriture. En dessous, on garde le moyen le plus fiable **et** on met la consigne qui compte (« hors taxes », « jamais d'envoi ») aussi dans le socle.

**Décision prise seule** : recommandation de départ = B **et** C (la réponse de `lire_reglages_devis` porte un résumé des consignes actives ; `lire_consignes` donne le texte complet et reste le recours), A si l'essai le permet. L'essai décide.

## 3. La conception

**Trois couches, lues dans cet ordre, la première gagne en cas de contradiction :**

| Couche | Qui la fixe | Où elle vit | Modifiable par le client |
|---|---|---|---|
| 1. **Socle** | Claude, par PR relue | en dur dans les descriptions d'outils, **affiché** à l'écran en lecture seule | non (garanties : jamais de prix d'achat ni de marge dits au client final, rien de supprimé sans demande, jamais d'envoi d'e-mail) |
| 2. **Consignes de Jérôme** (éditeur du logiciel) | Jérôme | version 1 : texte dans le dépôt (public, sans donnée de client), copié dans la réponse ; version 2 : modifiable depuis son écran | désactivables, pas modifiables (voir question 2) |
| 3. **Consignes du client** | Jérôme avec le client, à la revue mensuelle | collection de l'espace du client | oui, par Jérôme ou un éditeur de l'espace |

**La collection** (**Décision prise seule** : `assistant_consignes` et non `devis_consignes`, car des consignes pourront concerner d'autres modules) : un document par consigne, avec `titre` (60 caractères au plus), `texte` (500 au plus), `outil` (l'outil ou le module concerné, facultatif), `actif`, `origine` (`livree` ou `ecrite`), `idLivree` (pour une consigne de couche 2 : son identifiant stable dans le dépôt), `ordre`, marques de création et de modification (`creePar`, `modifiePar`). **Plafonds** (Jérôme : « ex. 20 consignes de 500 caractères ») : 20 consignes par espace, 500 caractères chacune, **et** 6 000 caractères au total pour les consignes actives lues par l'assistant (sinon 20 × 500 = 10 000 caractères, environ 2 500 mots, à relire à chaque conversation). **Décision prise seule** : ces plafonds sont dans le code et dans les règles, comme `MAX_NOTE = 300` du vocabulaire (`vocabulaire-plans.js:16`).

**Les consignes livrées** (couche 2) : le texte vient du dépôt (identifiant `marge-vocabulaire`, `hors-taxes`, `structurer`…) ; le document de l'espace ne garde que l'**état** (`actif`, `valideLe`). Le client désactive, jamais ne modifie : un document `origine: 'livree'` n'a pas de champ `texte` modifiable (règle Firestore). S'il veut autre chose, il crée sa propre consigne (couche 3) ; l'écran lui propose « Copier et modifier ». Ainsi une consigne de Jérôme corrigée plus tard arrive chez tous sans écraser le travail d'un client.

**L'outil `lire_consignes`** (lecture, tous profils) : arguments `outil?` (filtre) ; réponse : `socle` (court rappel), `consignes` [{ titre, texte, origine }] (seulement les actives), `version` (date de la dernière modification), `compte`. Aucune écriture par l'assistant : **il n'existe pas d'outil « écrire une consigne »**, volontairement. Une consigne est du texte lu comme une instruction ; si l'assistant pouvait en écrire, un texte piégé dans un document de client (injection de consigne) pourrait s'y installer pour toujours. Seul l'écran, par un éditeur humain, écrit (règle de Jérôme : « rien d'appliqué en cachette »).

**L'écran « Consignes de l'assistant »** (module Devis, à côté de « Vocabulaire » : un seul écran, pas de sous-onglets, `docs/consignes-ui.md`) : trois blocs repliables (Socle, Livrées par Jérôme, Les tiennes), chaque ligne avec son interrupteur actif / inactif, « Modifier » (couche 3 seulement), « Copier et modifier » (livrée), « Ajouter », la date et l'auteur du dernier changement, le bouton **Exporter** (obligatoire : règle du 27/10/2026), le compteur « 4 sur 20 » et « 1 200 sur 6 000 caractères ». **« Essayer une phrase »** : le client écrit une phrase, l'écran montre **quelles consignes seraient données à l'assistant** pour cet outil (filtre par outil, calcul local, aucun appel à une IA). Il ne prédit pas ce que ChatGPT fera ; le texte de l'écran le dit.

**Revue mensuelle** : même rythme que le vocabulaire (`docs/cadrage-revue-mensuelle.md`) : la revue montre « consignes modifiées depuis le mois dernier ».

**Cas vide** : « Aucune consigne à toi pour l'instant. L'assistant suit celles de ton logiciel (affichées plus haut). » **Cas d'erreur** : lecture impossible → « La liste n'a pas pu être mise à jour » et « Réessayer » ; texte trop long → message sous le champ, rien n'est enregistré ; plafond atteint → « 20 consignes au plus : désactive-en une d'abord » ; consigne livrée disparue du dépôt → ligne grise « retirée par l'éditeur ».

## 4. Parité Jérôme / clients (règle du 26/10/2026)

- L'écran vit dans `js/` : le **même** code chez Jérôme et chez les clients (il y est bêta-testeur, règle du 18/10/2026).
- L'outil et l'accès aux données sont dans `functions/` : **branchés dans la même PR** dans `functions-plateforme/` (le script `scripts/preparer-fonctions.js` copie le code commun) ; vérifier avec `docs/audit-ecarts-fonctions.md`.
- Les règles existent en **deux fichiers** (`firestore.rules`, `firestore.plateforme.rules`) à modifier ensemble.
- Déploiement chez les clients : « Déploiement plateforme clients » > `regles`, `fonctions`, `mcp`, `hosting`, **lancé par Jérôme** un par un.

## 5. Risques

| Risque | Parade |
|---|---|
| L'assistant n'appelle pas `lire_consignes` | la vérification de la section 2 ; consignes vitales aussi dans le socle |
| Une consigne du client contredit le socle (« donne-moi les prix d'achat ») | le socle est lu avant et gagne ; les textes sont rendus comme des données précédées de « consignes du client, le socle prévaut » ; test de verrouillage sur les phrases du socle |
| Injection : un texte piégé installe une consigne | aucun outil d'écriture de consigne pour l'assistant ; écritures d'écran seulement, tracées au journal |
| Trop de texte, assistant plus lent | plafonds, filtrage par outil, mesure de la ligne « Lenteur » |
| Un client modifie une consigne livrée | impossible (règle) ; « Copier et modifier » |
| Fuite de données de client dans une consigne livrée du dépôt public | les consignes livrées sont génériques ; relecture ; recherche de noms dans les tests |
| Oubli du branchement chez les clients | PR unique « chez Jérôme ET chez les clients », audit d'écarts avant démonstration |

## 6. Découpage en PR (petites, une par sujet)

Le brief de départ prévoyait 3 PR ; **Décision prise seule** : je sépare les règles en une PR à elles, comme pour le vocabulaire (PR 424), pour que Jérôme ne fusionne que des règles dans la liste d'arrêt. Équivalence : 1 + 2 = « collection + règles + outil ».

| # | PR | Contenu | Taille | Fable | Liste d'arrêt |
|---|---|---|---|---|---|
| 0 | *(avant tout)* Essai à blanc sur le client démo | section 2 ; résultat noté dans ce document | — | non | non (aucune donnée de client réel) |
| 1 | Règles seules | `assistant_consignes` dans `firestore.rules` et `firestore.plateforme.rules`, exclue du joker, plafonds, `texte` interdit en modification d'une consigne livrée, suppression interdite ; tests `devis-vocabulaire-regles.test.js` (liste du joker, lignes 244 à 250) adaptés exprès | S | Oui | **Oui** : règles Firestore (publiées par le workflow manuel, jamais sans PR fusionnée et « Tests » vert) |
| 2 | Collection, outil, 2 consignes de départ | `COLLECTIONS` dans `coeur/donnees.js:38`, `crm/donnees.js:18`, libellé du journal `crm/logique.js:2382`, outil `lire_consignes` (82 outils, 27 pour les devis), consignes `marge-vocabulaire` et `hors-taxes` tirées de `docs/consignes-assistant-marge.md`, dans `functions/` **et** `functions-plateforme/` | M | Oui (serveur) | non, mais déploiement `fonctions` et `mcp` chez les clients par Jérôme |
| 3 | Écran et export | écran « Consignes de l'assistant », interrupteurs, « Copier et modifier », « Essayer une phrase », export CSV et sauvegarde JSON, cas vide et erreur, ordinateur et téléphone, captures | L | Oui (nouvel écran) | non |
| 4 | Couche de Jérôme | version 2 : consignes de Jérôme modifiables depuis son écran et publiées vers les clients (par un script ou un workflow manuel), les 8 consignes de l'annexe A de `cadrage-devis-fluide.md` | M | Oui | **Oui** si elle touche aux données des clients ou à un workflow |
| 5 | Docs | dans la PR de code du même sujet, pas à part | — | non requise | non |

## 7. Questions pour Jérôme (5)

1. **Qui écrit les consignes d'un client ?** Réponse recommandée : toi seul au début, avec le client à la revue mensuelle ; ses éditeurs plus tard.
2. **Les consignes que tu livres sont-elles verrouillées ?** Recommandé : oui (le client les désactive, ne les modifie pas ; « Copier et modifier » pour faire les siennes).
3. **On fait l'essai à blanc du protocole (section 2) avant de coder ?** Recommandé : oui, 30 minutes avec toi sur le client démo.
4. **Plafonds : 20 consignes de 500 caractères, et 6 000 au total ?** Recommandé : oui.
5. **Les 8 consignes de l'annexe A de `cadrage-devis-fluide.md` sont-elles toutes livrées au départ, ou seulement marge et « hors taxes » ?** Recommandé : marge et « hors taxes » d'abord, les autres au fur et à mesure que les outils qu'elles décrivent sont en service.

## 8. Ce qui n'est PAS fait

Aucune collection, aucune règle, aucun outil, aucun écran, aucun essai avec un assistant, aucune consigne supprimée des descriptions d'outils (elles y restent jusqu'au chantier), aucune modification du socle. Le champ `instructions` du protocole n'est ni utilisé ni testé. Le temps ajouté par un appel de plus n'est pas mesuré.
