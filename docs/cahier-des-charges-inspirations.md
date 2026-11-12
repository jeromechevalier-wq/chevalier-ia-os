# Cahier des charges : Inspirations, pistes et idées (module Réseaux sociaux)

Rédigé le 2026-11-12 pour Jérôme. Deuxième version, après ses trois décisions.
Dépôt lu : `chevalier-ia-os`, branche `origin/main` après `git fetch`, commit `d7188461` (PR 594), **version 2.42.3**. Rien n'a été modifié dans le dépôt.

## 0. Les trois décisions de Jérôme (2026-11-12)

1. **« Postée » = dès que l'idée est « Dans Buffer »** (état `dans_buffer`). Aucun appel à Buffer pour ce compteur.
2. **« En tirer des idées » propose deux voies** : à la main, ou « Demander à Claude ». « Demander à Claude » **copie un prompt** prêt à coller dans Claude, et une zone **« Coller la réponse de Claude »** lit la réponse et crée les pistes après un aperçu à valider. L'appli n'appelle toujours aucune IA.
3. **Liste dense ET carte mentale cette nuit.** La carte mentale a sa propre PR.

## 1. But et principes

**But** : transformer chaque source d'inspiration en beaucoup de pistes de posts (10 à 30 par source), tout garder, et faire descendre les meilleures jusqu'au post.

**L'entonnoir**
- **Sources** : un site, un profil LinkedIn, un résumé de veille. Ajoutables à tout moment.
- **Pistes** : le stock. Tout est gardé, classé (pilier, format, service). Rien ne s'efface.
- **Idées** : les pistes retenues. Écran actuel conservé : colonnes Idée, En rédaction, Dans Buffer, et le filtre Abandonnées.
- **Posts** : lus dans Buffer, comme aujourd'hui.

**Principes**
1. **Lien et analyse seulement.** Le texte d'un post tiers reste chez son auteur. Une piste et un exemple portent un lien et une analyse écrite par nous.
2. **Aucun champ de texte recopié sur une piste** : ni `texte`, ni `contenu`, ni `extrait`. Les outils de Claude et le collage de sa réponse n'ont pas ces champs. Le champ « extrait » d'un exemple reste réservé à la saisie de Jérôme à l'écran, comme aujourd'hui.
3. **Listes de champs fermées** partout (écran, collage, outils de Claude) : un champ en trop est ignoré, et un test le prouve.
4. **L'appli n'appelle aucune IA et aucun service de collecte.** Le prompt est copié, la réponse est collée : c'est Jérôme qui fait le pont. Apify reste côté Claude, à la demande, prix vérifié avant.
5. **Tout est gardé** : aucun outil ni bouton de suppression pour les sources et les pistes. Une piste se met « écartée », elle reste retrouvable par filtre.
6. **Respect de l'existant** : mêmes tables, même journal commun, même barre de liste (`js/modules/crm/barre-liste.js`), même code chez Jérôme et chez les clients, bouton d'export à jour.

## 2. Parcours de Jérôme

1. Jérôme ouvre **Réseaux sociaux > Inspirations**. Il voit la liste de ses sources, une ligne par source, avec un compteur : « 12 pistes, 4 retenues, 3 postées ».
2. Les **résumés de veille apparaissent tout seuls** dans cette liste (voir 6.3), même avec zéro piste (« 0 piste »).
3. Il ajoute une source par le bouton jaune « + Source » : il choisit le type (site, profil LinkedIn), colle l'adresse, écrit ce qui l'inspire.
4. Il ouvre une source et clique **« En tirer des idées »**. Une fenêtre propose deux voies :
   - **« À la main »** : saisie rapide d'une piste, plusieurs à la suite.
   - **« Demander à Claude »** : bouton « Copier le prompt ». Jérôme colle le prompt dans Claude, copie la réponse, la colle dans la zone « Coller la réponse de Claude », clique « Lire la réponse ». Un **aperçu** montre les pistes lues. Il décoche ce qu'il ne veut pas, puis clique « Créer N pistes ».
5. **Autre voie, sans passer par l'écran** : quand les outils de Claude existent (PR 3), Jérôme peut dire à Claude « traite HeraHub » ; Claude dépose le lot directement.
6. Il **trie** les pistes sur une ligne chacune : étoile = retenir, croix = écarter, sinon elle reste en stock.
7. Sur une piste, le bouton **« En faire une idée »** crée l'idée (angle, pilier, format, service et source recopiés) et lie les deux. La piste passe « retenue ».
8. L'idée suit l'écran **Idées** actuel : Idée, En rédaction, Dans Buffer.
9. **Dès que l'idée passe à « Dans Buffer », la piste est comptée « postée »** et le compteur de la source monte.
10. Le bouton **« Carte »** d'une source montre ses pistes en carte mentale (voir 4.3).
11. À tout moment : recherche, filtres (type de source, pilier, format, état), et vue « Toutes les pistes » sans regroupement.

## 3. Modèle de données (Firestore)

Cinq tables existent (`reseauxsociaux_posts`, `_imports`, `_idees`, `_inspirations`, `_exemples`). On en ajoute **une** : `reseauxsociaux_pistes`. Aucune règle Firestore à modifier (preuve en section 9, point d).

### 3.1 `reseauxsociaux_inspirations` devient la table des **sources** (on garde le nom)
Champs actuels gardés : `nom`, `url`, `pourquoi`, `piliers`, `formats`, `ordre`. Champs ajoutés :
- `type` : `profil` | `site` | `veille`. **Une fiche sans `type` vaut `profil`** : les fiches existantes restent valables telles quelles, aucune migration.
- `url` : LinkedIn obligatoire pour `profil` (règle actuelle) ; https quelconque pour `site` (`normaliserUrlWeb` existe dans `idees-logique.js`) ; vide permis pour `veille`.
- `veilleContenuId` : identifiant du contenu dans `veille_contenus` (résumés faits par n8n).
- `resume` : nom exact du fichier résumé du second cerveau (résumés faits à la main par Claude).
- `traiteLe` : jour du dernier lot de pistes déposé.
- Pour un profil : `moyenneReactions`, `moyenneCommentaires`, `nombrePostsReleves`, `releveLe` (voir 6.2).
- **Retiré par rapport au premier jet : `aTraiter`.** La file d'attente de Claude est remplacée par le prompt copié. Une source « à traiter » est simplement une source à 0 piste.

### 3.2 Nouvelle table `reseauxsociaux_pistes` (liste fermée)
- `sourceId` : identifiant de la source. Pour un résumé de veille venu de n8n : `veille-<identifiant du contenu>` (identifiant prévisible, la fiche source est créée au premier besoin).
- `sourceType`, `sourceTitre` : recopiés pour afficher et filtrer vite.
- `angle` (200 caractères) : la piste en une phrase.
- `note` (300) : pourquoi c'est une bonne piste, écrit par nous.
- `ancre` (200) : la section du site, ou les mots-clés pour retrouver le passage du résumé.
- `url` : lien facultatif (page du site, post LinkedIn).
- `exempleId` : facultatif, l'exemple de post qui a donné la piste.
- `pilier`, `format`, `service` : listes existantes (`R.PILIERS`, `R.FORMATS`, `R.SERVICES` dans `logique.js`).
- `etat` : `nouvelle` | `retenue` | `ecartee`.
- `ideeId` : l'idée créée par « En faire une idée ».
- `lot` : étiquette du lot (par exemple `2026-11-13-collage` ou `2026-11-13-claude`), pour trier un arrivage d'un coup.
- `auteur` : `claude` | `utilisateur`. Une piste créée par collage porte `claude`.
- `creeLe`, `modifieLe` (posés par le journal commun).
- **Aucun champ `texte`, `contenu` ni `extrait`.**

### 3.3 `reseauxsociaux_exemples` : trois champs ajoutés
`reactions` (entier), `commentaires` (entier), `releveLe` (jour du relevé). L'écart à la moyenne du profil est **calculé** à l'affichage, jamais stocké.

### 3.4 `reseauxsociaux_idees` : un champ ajouté
`pisteId` (facultatif). Le reste est inchangé, y compris la règle du passage de témoin (le texte s'efface du module à « Dans Buffer »).

### 3.5 Compteurs : calculés, jamais stockés
- « pistes » = nombre de pistes de la source.
- « retenues » = pistes à l'état `retenue`.
- **« postées » = pistes dont l'idée liée (`ideeId`) est à l'état `dans_buffer`** (décision 1). Si l'idée revient en arrière, le compteur redescend tout seul.

### 3.6 Listes à mettre à jour en même temps que la nouvelle table
Vérifié dans `origin/main` (détail en section 9, point b). Une table de plus oblige à toucher, **dans la même PR** :
- `js/modules/reseauxsociaux/logique.js` (`COLLECTION_PISTES`, `COLLECTIONS`) ;
- `js/os/registre.js` (`collections` du module, ligne 196) ;
- `js/modules/crm/donnees.js` (`COLLECTIONS_CRM`, ligne 30) ;
- `js/modules/reseauxsociaux/libelles-journal.js` (deux libellés : singulier, pluriel) ;
- et **cinq tests qui recopient la liste à la main** : `tests/reseauxsociaux-socle.test.js` (D3), `tests/socle-donnees.test.js` (S5, avec le nombre 25 qui devient 26), `tests/e2e/parcours.spec.js` (ligne 730), `tests/e2e/reseauxsociaux-socle.spec.js` (ligne 80), `tests/reseauxsociaux-idees-logique.test.js` (ligne 171, libellés).

## 4. Écrans

### 4.1 Liste dense, regroupée par source (écran principal)
- **Une ligne par source** : icône du type, nom, compteur « 12 · 4 · 3 », pastille « nouvelles » si un lot vient d'arriver, boutons « En tirer des idées » et « Carte ». Un clic déplie ses pistes.
- **Une ligne par piste** : pastille de couleur = pilier, l'angle (coupé si trop long), mini-étiquette de format, **marque d'état** (rond vide = en stock, étoile = retenue, crayon = en rédaction, coche = postée, tiret = écartée), puis deux petits boutons : « En faire une idée », « Écarter ».
- **Barre commune** en haut : recherche, bouton Filtres (type de source, pilier, format, état, « sans piste »), bouton jaune « + Source » (un seul bouton jaune sur l'écran).
- **Vues** : « Par source » (défaut) et « Toutes les pistes » (liste à plat, triable).
- Les exemples de posts d'un profil restent dans la source dépliée, sous un titre replié par défaut, une ligne par exemple (date, réactions, commentaires, « × 2,3 la moyenne », lien).

### 4.2 Fenêtre « En tirer des idées » : prompt copié, réponse collée

**Voie 1, à la main** : un champ angle, les trois listes (pilier, format, service), « Ajouter et continuer ».

**Voie 2, demander à Claude**, en trois temps dans la même fenêtre.

**a) Le prompt.** Fabriqué par une fonction pure (`construirePromptPistes` dans `pistes-logique.js`), donc testable sans navigateur. Il est **affiché dans une zone de texte en lecture seule** et un bouton « Copier le prompt » le met dans le presse-papiers (`navigator.clipboard.writeText`, déjà utilisé dans `js/modules/crm/composants.js` et `js/modules/mcp/ecran.js`). Si la copie est refusée par le navigateur : message « Copie impossible, sélectionne le texte », et la zone reste sélectionnable. Contenu du prompt, dans cet ordre :
1. **La demande** : « Propose entre 10 et 30 pistes de posts LinkedIn pour Jérôme Chevalier à partir de cette source. »
2. **La source** : nom, type, lien, « ce qui m'inspire » (le champ `pourquoi`). Selon le type :
   - `site` : le lien du site ;
   - `veille` : le titre du résumé et le nom exact du fichier résumé ;
   - `profil` : le lien du profil **et les analyses déjà écrites par nous** sur ses exemples (accroche, structure, pourquoi ça marche), jamais le texte d'un post.
3. **Les règles** : jamais de phrase recopiée de la source, tout est reformulé ; une piste = un angle pour Jérôme, en une phrase de 200 caractères au plus ; répondre **uniquement** par le bloc JSON, sans phrase autour.
4. **La liste fermée des champs** : `angle`, `note`, `ancre`, `url`, `pilier`, `format`, `service`. Tout autre champ sera ignoré.
5. **Les valeurs permises** de `pilier`, `format`, `service` : identifiant et libellé de chaque valeur, lus dans `R.PILIERS`, `R.FORMATS`, `R.SERVICES` au moment de la copie (jamais écrits en dur dans le prompt).
6. **Les pistes déjà en stock pour cette source** (leurs angles), avec la consigne « ne propose rien qui dise la même chose ». Plafond proposé : les 100 plus récentes, pour garder un prompt lisible. *(Proposition à régler.)*
7. **Le modèle de réponse** (ci-dessous), avec l'identifiant de la source déjà rempli.

**b) Le format de réponse : JSON strict, nommé `pistes-v1`.**
```json
{
  "format": "pistes-v1",
  "sourceId": "<identifiant de la source>",
  "pistes": [
    {
      "angle": "La piste en une phrase.",
      "note": "Pourquoi c'est une bonne piste.",
      "ancre": "Section ou mots-clés pour retrouver le passage.",
      "url": "https://…",
      "pilier": "cas_concrets",
      "format": "carrousel",
      "service": "<identifiant de service>"
    }
  ]
}
```
Seul `angle` est obligatoire. JSON est préféré à une liste à puces : une seule façon de le lire, pas d'ambiguïté sur les champs.

**c) La lecture et l'aperçu.** Fonction pure `lireReponsePistes(texte, { source, pistesExistantes })`. Elle accepte que Claude entoure le JSON d'un bloc de code ou d'une phrase (elle prend ce qui est entre la première et la dernière accolade), puis elle contrôle tout. **Rien n'est écrit avant le clic sur « Créer N pistes ».** L'aperçu montre une ligne par piste lue, avec une case à cocher, les pastilles pilier, format, service, et une remarque s'il y en a une.

**Les erreurs et ce que voit Jérôme**

| Cas | Ce que fait l'appli |
|---|---|
| Zone vide, ou texte sans JSON lisible | Message « Je n'arrive pas à lire cette réponse. Copie tout le bloc entre accolades. » Rien n'est créé. |
| `format` différent de `pistes-v1`, ou `pistes` n'est pas une liste | Même message. Rien n'est créé. |
| `sourceId` d'une autre source | Message « Cette réponse est pour une autre source. » Rien n'est créé. |
| Champ inconnu (dont `texte`, `contenu`, `extrait`) | Ignoré, jamais écrit. L'aperçu dit « N champs ignorés ». |
| `angle` vide | Piste refusée, affichée en gris avec la raison. |
| `angle`, `note` ou `ancre` trop long | Piste refusée avec la raison « trop long » (on ne coupe pas en silence). |
| `pilier`, `format` ou `service` inconnu | Piste gardée, champ laissé vide, remarque « pilier à choisir ». |
| `url` qui n'est pas en https | Lien retiré, remarque « lien retiré ». |
| **Doublon** : même angle qu'une piste déjà en stock pour cette source, ou deux fois dans la réponse (comparaison sans majuscules, sans accents, sans ponctuation) | Piste **décochée** par défaut, remarque « déjà en stock ». Jérôme peut la recocher. |
| **Trop de pistes** : plus de 30 dans la réponse | Les 30 premières valides sont cochées, les suivantes décochées avec « au-delà de 30 ». 30 cases cochées au plus par collage. |
| Texte collé énorme (proposition : plus de 60 000 caractères) | Message « Réponse trop longue », rien n'est lu. |
| Aucune piste valide | Bouton « Créer » grisé, message clair. |

Limites dites honnêtement :
- Le contrôle des doublons ne voit que les angles **identiques** (à la casse et aux accents près). Deux angles qui disent la même chose avec d'autres mots passent. C'est la consigne du prompt qui limite ce cas, et le tri de Jérôme.
- L'appli **ne peut pas vérifier** qu'une phrase n'est pas recopiée de la source : elle n'a pas le texte de la source. Les garde-fous sont la règle du prompt, l'absence de champ de texte et les longueurs courtes.
- Les seuils (30, 100, 60 000) sont des **propositions**, pas des mesures.

**À la validation** : un seul plan d'écriture (`planAjouterPistes`, le même que l'outil `ajouter_pistes` de la PR 3) crée les pistes cochées avec `etat: nouvelle`, `auteur: claude`, `lot: <jour>-collage`, et pose `traiteLe` sur la source. Chaque piste créée laisse sa ligne dans le journal commun.

### 4.3 Carte mentale d'une source (cette nuit, PR 4)
- **Ouverture** : bouton « Carte » sur chaque ligne de source. La carte s'ouvre dans une fenêtre plein écran, **sans nouvelle route** (le menu et la barre d'onglets ne changent pas).
- **Dessin** : la source au centre ; une branche par pilier, réparties à gauche et à droite ; les pistes au bout des branches, empilées. Une branche « Sans pilier » pour les pistes non classées.
- **Couleur = pilier**, **marque = état** (les mêmes marques que la liste : rond, étoile, crayon, coche, tiret).
- **Clic sur une piste** : la carte se ferme et la piste s'ouvre dans la liste.
- **Repli par branche** : un clic sur un pilier replie ou déplie sa branche ; une branche repliée affiche son nombre de pistes (« Cas concrets (42) »). **Au-delà de 30 pistes dans la source, toutes les branches s'ouvrent repliées** *(seuil proposé)* : c'est ce qui rend la carte utilisable avec des centaines de pistes.
- **Technique** : SVG écrit à la main, **aucune bibliothèque externe**. Les positions sont calculées par une fonction pure (`carte-logique.js` : hauteur fixe par piste, donc aucun besoin de mesurer l'écran), ce qui se teste sans navigateur. Le texte d'une piste est coupé dans la carte (environ 40 caractères) et l'angle complet apparaît au survol.
- **Téléphone** : la carte défile dans son cadre, la page ne déborde pas.
- **Limites** : sur téléphone, la carte se lit mais reste moins pratique que la liste ; une branche de 200 pistes dépliée fait une longue colonne.

### 4.4 Écran Idées
Inchangé, avec deux ajouts : la source d'une idée née d'une piste est cliquable (retour à la piste), et le filtre « Source » existant continue de marcher.

## 5. Outils MCP pour Claude (PR 3)

Aujourd'hui : **aucun outil** pour ce module (`outilsMcp: []`, `js/os/registre.js` ligne 197, vérifié). À créer dans un nouveau fichier `functions/src/mcp/outils/reseauxsociaux.js`, sur le modèle de `lecture.js` et `ecriture.js`.

**Lecture** (profils lecture, écriture, complet)
- `lister_sources_inspiration` : sources avec type et compteurs. Filtres : type, sans piste. Inclut les résumés de veille.
- `lire_source_inspiration` : une source, ses exemples, ses pistes.
- `lister_pistes` : filtres source, état, pilier, format, lot. 200 lignes au plus (`MAX_LIGNES` de `functions/src/coeur/lecture.js`).
- `lister_idees` : filtres état, pilier.

**Écriture** (profils écriture, complet)
- `creer_source_inspiration`, `modifier_source_inspiration` : `type`, `nom`, `url`, `pourquoi`, `piliers`, `formats`, `resume`, `veilleContenuId`, et les quatre champs de moyenne.
- `ajouter_pistes` : une source, une liste de 1 à 30 pistes (`angle`, `note`, `ancre`, `url`, `exempleId`, `pilier`, `format`, `service`), un `lot`. Pose `auteur: claude`, `etat: nouvelle`, `traiteLe` sur la source. Même plan et mêmes contrôles (doublons compris) que le collage de l'écran.
- `modifier_piste` : `angle`, `note`, `ancre`, `pilier`, `format`, `service`, `etat`.
- `retenir_piste` : crée l'idée et lie les deux (même règle que le bouton).
- `enregistrer_exemple` : `profilId`, `url`, `date`, `accroche`, `structure`, `longueur`, `pourquoi`, `format`, `pilier`, `service`, `reactions`, `commentaires`, `releveLe`. **Sans `extrait`.**
- `creer_idee`, `modifier_idee` : `angle`, `sources`, `pilier`, `format`, `service`, `etat`, `texte` (le texte d'un post de Jérôme, jamais celui d'un tiers). Les sources passées par cet outil n'ont pas de champ `extrait`.

**Aucun outil de suppression.** Total : 12 outils.

**Ce que le code impose (vérifié, section 9 points a et b)**
- Le moteur d'écriture du serveur **refuse toute table absente de sa liste** (`COLLECTIONS_ECRITES`, `functions/src/coeur/ecriture.js` ligne 19 : erreur « Collection non écrivable »). Il faut donc déclarer les quatre tables du module (`idees`, `inspirations`, `exemples`, `pistes`) dans `COLLECTIONS` (`functions/src/coeur/donnees.js`) **et** dans `COLLECTIONS_ECRITES`.
- Le journal d'audit du serveur, lui, n'a pas de liste : il note le nom de la table tel quel. Une fois la table dans `COLLECTIONS_ECRITES`, l'audit suit sans réglage.
- Les règles pures (`logique.js`, `idees-logique.js`, `inspirations-logique.js`, le futur `pistes-logique.js`) doivent être copiées côté serveur par `scripts/preparer-fonctions.js`, avec réécriture de l'import `../crm/logique.js` (les trois fichiers actuels l'importent). Aujourd'hui ce script ne copie **aucun** fichier du module Réseaux sociaux.
- Chaque outil se déclare dans `outilsMcp` du module (`js/os/registre.js`), sinon `tests/registre-mcp.test.js` échoue.
- Deux tests comptent les outils à la main : `tests/mcp-clients.test.js` ligne 1013 (`OUTILS.length` vaut 85, deviendra 97) et `tests/mcp.test.js` ligne 259 (listes LECTURE et ECRITURE du serveur de Jérôme).
- Leçon du 10/11 : le SDK **retire sans erreur** un champ inconnu. Le test vérifie donc que `extrait` et `texte` (sur une piste) ne sont **pas écrits**, et non qu'ils sont refusés.

## 6. Traitement des sources par type

### 6.1 Site internet (HeraHub, puis d'autres)
1. Jérôme crée la source (type `site`).
2. Par le prompt copié, ou par les outils : Claude lit les pages publiques du site dans sa session.
3. Claude rend 10 à 30 pistes : `angle` reformulé avec nos mots, `ancre` = page ou section, `url` = adresse de la page.
4. Garde-fous : aucune phrase recopiée du site ; `note` écrite par nous ; date du traitement dans `traiteLe`.

### 6.2 Profil LinkedIn (Graffeuil, Rapillard, puis d'autres)
1. Jérôme demande le relevé. **Claude annonce le prix Apify avant de lancer** et attend le « oui ».
2. Claude collecte dans sa session (jamais dans l'appli, jamais en automatique) : pour chaque post, lien, date, réactions, commentaires.
3. Claude garde **les posts de plus de 2 semaines** au jour du relevé (leurs chiffres sont stabilisés).
4. Claude calcule la **moyenne du profil** sur ces posts et l'écrit sur la source (`moyenneReactions`, `moyenneCommentaires`, `nombrePostsReleves`, `releveLe`).
5. Un « meilleur post » se juge **par rapport à cette moyenne**, jamais en valeur absolue. Proposition de seuil à régler : au moins 1,5 fois la moyenne (réactions + commentaires).
6. Pour chaque meilleur post : `enregistrer_exemple` (lien, date, chiffres, date du relevé, analyse). **Jamais le texte, extrait vide.**
7. Puis les pistes : chaque piste est un angle **pour Jérôme**, liée à l'exemple par `exempleId` (par les outils seulement ; le collage n'a pas ce champ).
8. Garde-fous : le texte du post collecté reste dans la session de Claude et n'est écrit nulle part.
9. **Par le prompt copié**, Claude ne peut pas lire LinkedIn à partir du seul lien : le prompt d'un profil s'appuie sur les analyses d'exemples déjà enregistrées. Sans exemple, le prompt le dit et propose de faire d'abord le relevé.

### 6.3 Résumé de veille : ce qui est faisable, honnêtement
Ce que j'ai trouvé :
- L'appli a **déjà** un module Veille avec ses tables : `veille_sources`, `veille_contenus` (titre, état), `veille_resumes` (liens des fichiers), `veille_pages` (la page du résumé). Elles sont remplies par le workflow n8n, qui dépose aussi le fichier dans `RAW/Veille/` du second cerveau.
- Le dossier `RAW/Veille/` contient **89 fichiers, soit 47 titres différents** : 41 commencent par « Résumé - », 1 par « Transcript - », 5 portent un autre nom. 42 titres ont un `.md` et un `.html`, 5 n'ont qu'un `.md`. (Compté sur les noms de fichiers seulement.)
- **Non vérifiable ici** : combien de ces 47 titres sont dans `veille_contenus`. Voir section 9, point e.

Solution la plus simple, en deux morceaux :
- **Automatique** : l'écran Inspirations **écoute directement `veille_contenus`** (état `resume`). Chaque résumé venu de n8n apparaît tout seul comme source, sans import. Le module reste utilisable seul : sans Veille, la liste est simplement sans résumés (même méthode que pour les activités LinkedIn, déjà écoutées par `js/modules/reseauxsociaux/donnees.js`).
- **Pour les résumés faits à la main** : Claude les déclare comme source (type `veille`, `resume` = nom exact du fichier). L'outil signale un doublon probable si un contenu de veille porte déjà ce titre.

Ce qui n'est **pas** faisable simplement : que l'appli lise toute seule le dossier du second cerveau (il faudrait un accès Drive ou GitHub avec un secret côté serveur : chantier lourd, écarté).

**Le prompt copié d'un résumé de veille** donne le titre et le nom du fichier. Dans Claude Code (qui a le second cerveau), Claude ouvre le fichier lui-même. Dans claude.ai, Jérôme doit joindre le fichier résumé. Le résumé est la seule porte d'entrée, jamais le transcript.

## 7. Découpage en 5 PR pour la nuit

Tailles = **estimations**, pas des mesures. Difficulté selon l'échelle de la fiche « Consommation des nuits de codage » (1 texte ; 2 écran sur composants existants ; 3 écrans neufs avec tests de bout en bout ; 4 serveur ou données avec relecture Fable ; 5 règles ou migration, liste d'arrêt).

### PR 1 : règles pures des sources, pistes et exemples (d'abord, seule)
- **Contenu** : `type` et moyennes sur les sources, table des pistes, trois champs des exemples, `pisteId` sur l'idée, plans « ajouter des pistes » et « en faire une idée », compteurs (dont « postée » = `dans_buffer`), écart à la moyenne, **`construirePromptPistes` et `lireReponsePistes`** (le prompt et la lecture de la réponse sont des règles pures : ils vont ici pour servir à la fois à l'écran et aux outils).
- **Fichiers** : `inspirations-logique.js`, `idees-logique.js`, nouveau `pistes-logique.js`, `logique.js`, `libelles-journal.js`, `js/os/registre.js` (collections), `js/modules/crm/donnees.js` (`COLLECTIONS_CRM`), `tests/package.json` (une ligne), `tests/e2e/mode-test-creation.spec.js` (ajouter `pistes-logique.js` à la liste blanche `PERMIS`, sinon ce test devient rouge).
- **Tests** : nouveau `reseauxsociaux-pistes-logique.test.js` (prompt : contient la source, les valeurs permises, les pistes existantes ; réponse : chaque ligne du tableau d'erreurs de 4.2 a son test) ; mise à jour des cinq tests de la section 3.6. **Attention : deux d'entre eux sont des parcours de bout en bout** (`parcours.spec.js`, `reseauxsociaux-socle.spec.js`) : ils sont à lancer une fois avant la PR.
- **Taille** : environ 600 à 750 lignes. **Difficulté 4** (données). **Relecture Fable obligatoire.**
- **Dépendances** : aucune.

### PR 2 : écran Inspirations dense, avec prompt copié et réponse collée (après PR 1, en parallèle de PR 3)
- **Contenu** : liste dense par source, lignes de pistes, filtres, « + Source » avec type, fenêtre « En tirer des idées » (à la main ; copier le prompt ; coller la réponse ; aperçu ; création), « En faire une idée », compteurs, résumés de veille automatiques, exemples sur une ligne avec chiffres.
- **Fichiers** : `inspirations-ecran.js` (refonte), nouveau `pistes-ecran.js`, `idees-actions.js`, `idees-ecran.js` (lien retour), `donnees.js` (écoute des pistes et de `veille_contenus`), `export.js`, `css/reseauxsociaux-idees.css`, `aujourdhui.js` si la carte « Inspirations » d'Aujourd'hui doit ignorer les sources qui ne sont pas des profils.
- **Tests** : un parcours de bout en bout (ajouter une source, copier le prompt lu dans la zone de texte, coller une réponse, voir l'aperçu avec un doublon décoché, créer, retenir une piste, voir le compteur ; puis l'idée à « Dans Buffer » et le compteur « postée »), lancé aussi en format téléphone ; une réponse mal formée = message et aucune écriture ; `npm run test:module look-compact` (CSS touché).
- **Tests existants touchés** : F8 à F13 de `tests/e2e/reseauxsociaux-idees.spec.js`, voir la liste des sélecteurs en section 9, point c. Le plus sûr : **garder ces sélecteurs** sur les nouveaux éléments, et ne réécrire que les tests dont le parcours change vraiment.
- **Taille** : environ 900 à 1 200 lignes. **Difficulté 3.** **Relecture Fable obligatoire** (structure d'écran changée, liens externes, texte collé par l'utilisateur).
- **Dépendances** : PR 1 fusionnée.

### PR 3 : outils MCP (après PR 1, en parallèle de PR 2)
- **Contenu** : les 12 outils de la section 5.
- **Fichiers** : nouveau `functions/src/mcp/outils/reseauxsociaux.js`, `functions/src/mcp/outils/index.js`, `functions/src/coeur/donnees.js` (`COLLECTIONS`), `functions/src/coeur/ecriture.js` (`COLLECTIONS_ECRITES`), `scripts/preparer-fonctions.js`, `js/os/registre.js` (`outilsMcp`), `tests/package.json`, `tests/mcp-clients.test.js`, `tests/mcp.test.js`.
- **Tests** : nouveau `reseauxsociaux-mcp.test.js` (champs fermés, extrait jamais écrit, 30 pistes au plus, doublons, aucun outil de suppression, profil lecture sans écriture, écriture sous `clients/<client>/` chez un client) ; `registre-mcp.test.js` et `registre.test.js` doivent rester verts.
- **Taille** : environ 700 à 900 lignes. **Difficulté 4.** **Relecture Fable obligatoire** (serveur), brief vérifié par Fable et par grep avant envoi.
- **Dépendances** : PR 1 fusionnée.

### PR 4 : carte mentale d'une source (après PR 2)
- **Contenu** : section 4.3.
- **Fichiers** : nouveaux `carte-logique.js` (positions, regroupement par pilier, repli), `carte-ecran.js` (dessin SVG, clics), `css/reseauxsociaux-carte.css` (fichier neuf, chargé par l'écran comme `reseauxsociaux-idees.css`) ; une retouche de `inspirations-ecran.js` ou `pistes-ecran.js` : le bouton « Carte » et son clic.
- **Tests** : `reseauxsociaux-carte-logique.test.js` (positions stables, aucune piste superposée, 300 pistes = branches repliées, pilier inconnu = branche « Sans pilier ») ; **un parcours de bout en bout minimal** : une source et trois pistes sur deux piliers, clic sur « Carte », la source est au centre, deux branches, trois pistes avec la bonne marque d'état ; replier une branche cache ses pistes ; clic sur une piste = la carte se ferme et la piste est ouverte ; en format téléphone la page ne déborde pas. Une capture.
- **Taille** : environ 450 à 650 lignes. **Difficulté 3.** **Relecture Fable obligatoire** (écran neuf).
- **Dépendances** : PR 1 pour les données ; **PR 2 fusionnée** pour poser le bouton. Pour gagner du temps, l'agent peut commencer dès la fin de PR 1 dans ses fichiers neufs, et ne brancher le bouton qu'une fois PR 2 fusionnée.

### PR 5 : version, wiki, docs, rapport du matin (la dernière, seule à toucher la version)
- **Fichiers** : `version.json` (2.42.3 devient 2.43.0), `js/os/version.js`, `tests/statique.test.js`, `wiki/`, `docs/reprise-prochaine-session.md`.
- **Taille** : environ 100 à 150 lignes. **Difficulté 1.** Sans Fable.
- **Dépendances** : PR 1 à 4 fusionnées.

### Ordre de la nuit
1. PR 1, seule.
2. PR 2 et PR 3 en parallèle ; l'agent de PR 4 peut préparer ses fichiers neufs.
3. PR 4 se branche après la fusion de PR 2.
4. PR 5 à la fin.

### Conflits prévisibles
- **`js/os/registre.js`** : PR 1 (ligne `collections`) puis PR 3 (ligne `outilsMcp`, juste en dessous). PR 3 part de `main` après PR 1 : pas de conflit si l'ordre est tenu.
- **`tests/package.json`** : PR 1, 2, 3 et 4 y ajoutent chacune une ligne de test. Conflit probable entre PR 2, 3 et 4 : **garder toutes les lignes**.
- **`inspirations-ecran.js` / `pistes-ecran.js`** : PR 2 (refonte) et PR 4 (un bouton). C'est la raison de l'ordre PR 2 puis PR 4.
- **`css/reseauxsociaux-idees.css`** : PR 2 seulement ; PR 4 a son propre fichier CSS pour éviter le conflit.
- **`tests/e2e/reseauxsociaux-idees.spec.js`** : PR 2 seulement. PR 4 écrit son parcours dans un fichier neuf.
- **Captures d'écran** (`tests/e2e/captures/reseauxsociaux-idees/`) : PR 2 en régénère ; PR 4 range les siennes dans un dossier neuf.
- **`pistes-logique.js`** : écrit par PR 1, lu par PR 2, 3 et 4. Si PR 2 ou PR 3 a besoin d'y changer une règle, conflit possible entre elles : la règle se corrige dans une seule des deux, l'autre fusionne `main`.

### Règles de nuit rappelées dans chaque brief
- Pendant le travail : `npm run test:module <nom>` seulement. Avant la PR : `test:rapide` puis `test:smoke`, une fois. Jamais la suite complète en session.
- Un `TESTS_DECALAGE` différent par agent (jamais 2 ni 7). Jamais deux suites en même temps sur le Mac.
- Un seul push par PR, corrections de relecture regroupées, `origin/main` fusionné dans ce même push. Aucune étiquette pendant que les tests tournent.
- Version, `version.js`, test de version et `wiki/` : seulement dans la PR 5.
- Fusion armée dès que la PR est prête ; surveillance toutes les 30 minutes.

### Liste d'arrêt
- **Prévu : aucune PR sur la liste d'arrêt**, car le joker des règles couvre la nouvelle table et aucune donnée existante n'est modifiée.
- **Si un agent découvre qu'il faut toucher `firestore.rules`, `firestore.plateforme.rules` ou `firebase*.json` : il s'arrête**, laisse la PR ouverte et verte avec l'étiquette `a-fusionner-par-jerome`, et le signale.
- **Les données** (pistes de HeraHub, relevés de Graffeuil et Rapillard, déclaration des résumés faits à la main) se saisissent **après** la fusion, avec l'accord écrit de Jérôme, sans rien écrire dans le dépôt public.

## 8. Risques

- **Cinq PR dans une nuit, dont quatre avec relecture Fable** : c'est plus chargé que le premier jet (quatre PR). Si la nuit déborde, la PR 4 (carte) est celle qui peut glisser sans bloquer le reste.
- **Réponse de Claude mal formée** : couverte par le tableau de 4.2. Risque restant : une réponse coupée en plein milieu (trop longue) donne un JSON illisible, donc rien n'est créé ; Jérôme redemande moins de pistes.
- **Doublons de sens** : non détectés (voir 4.2).
- **Journal** : un collage de 30 pistes écrit 30 lignes dans le journal commun. À regarder à l'usage.
- **`restaurer_depuis_audit`** (profil complet) pourra défaire un `ajouter_pistes`, donc retirer les pistes créées par cet appel. C'est une annulation, pas un outil de suppression, mais c'est à savoir face au principe « tout est gardé ».
- **Doublons de veille** : un même résumé peut exister dans la table de l'appli et en fichier. Le contrôle par titre limite le risque sans le supprimer.
- **Volume** : l'écran écoute toute la table des pistes. Confortable pour des centaines ; à surveiller au-delà de quelques milliers.
- **Briefs** : sur les nuits passées, 4 briefs sur 4 contenaient des erreurs. Ce cahier se vérifie contre le code (Fable + grep) avant de partir.
- **Prix Apify** : inconnu à ce jour pour ces relevés ; à vérifier avant chaque collecte.

## 9. Vérifié / non vérifié

Tout ce qui suit a été lu dans `origin/main` (commit `d7188461`) par `git show` et `git grep`. **Aucun test n'a été lancé.**

### a) Comment le serveur MCP lit et écrit une table hors CRM ; le journal d'audit
**Vérifié par lecture.**
- **Lecture** : `donnees.liste(nom)` et `donnees.document(nom, id)` (`functions/src/coeur/donnees.js`) acceptent n'importe quel nom de table. Chez un client, `avecBase` préfixe par `clients/<client>/` et exige un nom simple (minuscules, chiffres, tiret bas) : `reseauxsociaux_pistes` passe.
- **Écriture** : `executerEcritures` (`functions/src/coeur/ecriture.js`) **refuse** toute table absente de `COLLECTIONS_ECRITES` (ligne 19, contrôle ligne 72). Aucune table `reseauxsociaux_*` n'y est. **Il faut donc les ajouter** (PR 3). Le premier jet disait « à vérifier » : c'est maintenant tranché.
- **Journal d'audit** : pas de liste de tables ; la ligne d'audit recopie le nom de la table (`collection: l.collection`). Une nouvelle table est acceptée dès qu'elle est écrivable.
- **Non vérifié** : que les plans purs du module (`L.ecritureCreer` avec `horodater`) se branchent tels quels sur `executerEcritures` ; le format des opérations se ressemble, mais je n'ai pas lu un outil d'écriture existant de bout en bout. Non vérifié non plus : la façon dont `lire_audit` affiche le nom d'une table inconnue.

### b) Tests qui listent les collections exportées
**Vérifié par lecture.** Listes écrites à la main, à mettre à jour avec la nouvelle table :
- `tests/reseauxsociaux-socle.test.js`, test D3 (lignes 54 à 60) : liste exacte des cinq tables, et chaque nom doit être dans `js/modules/crm/donnees.js`.
- `tests/socle-donnees.test.js`, test S5 (lignes 65 à 75) : liste exacte de `COLLECTIONS_CRM` et `noms.length` égal à 25.
- `tests/e2e/parcours.spec.js`, ligne 730 : clés de l'export complet.
- `tests/e2e/reseauxsociaux-socle.spec.js`, ligne 80 : clés de l'export du module.
- `tests/reseauxsociaux-idees-logique.test.js`, ligne 171 : chaque table de `R.COLLECTIONS` doit avoir deux libellés de journal.
- À côté (outils, pas collections) : `tests/mcp-clients.test.js` ligne 1013 (85 outils), `tests/mcp.test.js` ligne 259 (listes d'outils), `tests/registre-mcp.test.js`, `tests/e2e/mode-test-creation.spec.js` ligne 211 (liste blanche des fichiers de plans purs).
- **Non vérifié** : qu'il n'existe pas d'autre liste recopiée ailleurs (recherche faite sur le motif `reseauxsociaux_` et `COLLECTIONS` dans `tests/`, pas sur tout le dépôt).

### c) Sélecteurs de `tests/e2e/reseauxsociaux-idees.spec.js` touchés par la refonte
**Vérifié par lecture** (tests F8 à F13, lignes 276 à 433 ; F1 à F7 concernent l'écran Idées, non refondu).
- Structure de carte : `.carte-inspiration`, `[data-inspiration="p1"]`, `[data-inspiration="p1"] h3` (texte attendu « Exemples de posts (1) »), `[data-inspiration="p1"] .rs-exemple`, `.page-tete .bouton-principal`.
- Actions : `[data-action="nouvelle-inspiration"]` (texte attendu « Inspiration », deviendrait « Source »), `modifier-profil`, `monter-profil`, `descendre-profil`, `nouvel-exemple`, `modifier-exemple`, `ouvrir-linkedin`, `ouvrir-post`.
- Rôles : `[data-role="nom-profil"]`, `pourquoi-profil`, `habitudes`, `exemples-vides`, `erreur-profil`, `erreur-exemple`, `accroche`, `pourquoi`, `extrait`, `date-exemple`.
- Champs de formulaire : `[data-champ="nom"]`, `url`, `pourquoi`, `accroche`, `structure`, `longueur`, `extrait`, `date`, `format`, `pilier`, `service` ; `[data-pilier="cas_concrets"]`, `[data-format="carrousel"]`.
- Textes attendus : « Ajoute les profils qui t'inspirent. », « Colle seulement le lien. Le texte du post n'est pas copié ici. », « adresse du profil », « lien du post », titre de niveau 1 « Inspirations ».
- Carte « Inspirations » de l'écran Aujourd'hui (même fichier de tests, F8 et F9) : `[data-carte="inspirations"]`, `[data-action="voir-inspirations"]`, `[data-action="ouvrir-profil"]`.
- Captures : F8, F9, F10, F11, F13 (dossier `tests/e2e/captures/reseauxsociaux-idees/`).
- Autres fichiers qui citent l'écran sans dépendre de sa structure : `reseauxsociaux-onglets-stables.spec.js` et `reseauxsociaux-socle.spec.js` (nom de l'onglet « Inspirations » et route) : intacts si l'onglet garde son nom.
- **Non vérifié** : si F11 (ranger avec ▲ ▼) et F12 gardent un sens dans la liste dense ; c'est un choix d'écran à faire dans la PR 2.

### d) Le joker des règles couvre-t-il `reseauxsociaux_pistes` ?
**Vérifié par lecture des deux fichiers de règles, et par l'existence de tests proches. Non lancé.**
- **Chez Jérôme** (`firestore.rules`, ligne 172) : `match /{collection}/{document=**}` donne lecture et écriture aux comptes autorisés, sauf une liste de 17 tables où `reseauxsociaux_pistes` ne figure pas. **Couvert.** Test existant qui le prouve pour une table inconnue : `tests/regles.test.js`, test A8 (« garde tous ses droits dans une collection inconnue », sur `crm_autre`).
- **Chez les clients** (`firestore.plateforme.rules`, ligne 182) : `match /clients/{client}/{collection}/{reste=**}` donne la lecture aux membres (éditeur, lecteur) et l'écriture à l'éditeur, sauf des listes fermées (membres, documents, journal des workflows, tableau de bord, devis, bordereau) où `reseauxsociaux_pistes` ne figure pas. **Couvert**, suppression comprise pour l'éditeur. Tests existants : `tests/regles-plateforme.test.js` (P1 à P7 sur `crm_personnes`, `crm_affaires`, `projets_projets`, `devis_parametres`, qui passent par ce même joker) et `tests/e2e/reseauxsociaux-posts-client.spec.js` (E3 : écriture réelle sous `clients/<client>/reseauxsociaux_posts` avec les règles de la plateforme chargées).
- **Limite** : aucun test ne nomme `reseauxsociaux_pistes`, puisque la table n'existe pas. La preuve est donc « même règle, autre nom de table ». Je propose d'ajouter le nom à la liste de `tests/regles-plateforme.test.js` dans la PR 1 (une ligne, sans toucher aux règles).
- **À savoir** : le joker autorise aussi la **suppression** depuis un navigateur. « Tout est gardé » repose donc sur l'absence de bouton, pas sur les règles. Le verrouiller demanderait de toucher aux règles (liste d'arrêt) : non proposé.

### e) Combien de résumés de `RAW/Veille/` sont dans `veille_contenus` ?
**Non vérifiable sans accès à la base.**
- Côté fichiers (noms seulement, lecture seule) : 89 fichiers, 47 titres, dont 41 « Résumé - … ».
- Côté base : aucun outil MCP ne lit `veille_contenus` aujourd'hui, et le dépôt ne contient pas les données. Je n'ai donc **aucun nombre** à donner pour la correspondance.
- Ce que le code dit : `veille_contenus` porte un `titre` et un état, `veille_resumes` porte des liens de fichiers (`lienHtml`). La correspondance avec un nom de fichier devra se faire par le titre. **Non vérifié** : que le titre en base et le nom du fichier sont identiques (ponctuation, « Résumé - » en tête).
- Comment le savoir ensuite : l'outil `lister_sources_inspiration` (PR 3), ou l'export du module Veille depuis l'appli.

### Autres points non vérifiés
- Les identifiants exacts de `R.FORMATS` et `R.SERVICES` (seuls ceux des piliers ont été lus : `cas_concrets`, `pedagogie`, `actu_ia`, `demarche_offre` ; `carrousel` est cité par un test).
- L'existence d'une **couleur par pilier** dans le code ou le CSS : je n'en ai pas trouvé dans `logique.js` ; à chercher dans les pastilles de la version 2.42.3 avant d'en créer une.
- Aucun dessin SVG fabriqué en JavaScript n'existe aujourd'hui dans `js/` (aucun `createElementNS`). Je n'ai pas vérifié si l'assistant de dessin `h()` sait créer du SVG : l'agent de la PR 4 devra peut-être écrire une petite aide.
- La lecture du presse-papiers dans les tests Playwright (droits du navigateur, format téléphone) : contournée en affichant le prompt dans une zone de texte que le test lit.
- La ligne exacte à ajouter dans `tests/package.json` et le nom de module pour `npm run test:module`.
- Que `preparer-fonctions.js` peut copier les quatre fichiers de règles du module sans autre réécriture d'import que `../crm/logique.js`.
- Les tailles de PR et les seuils (30, 100, 60 000, 40 caractères) : estimations et propositions.
- Le prix Apify des relevés.
