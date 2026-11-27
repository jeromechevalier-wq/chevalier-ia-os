# Accueil « village » : charte de dessin des bâtiments

Ce document sert à dessiner un nouveau bâtiment **sans deviner**. Il décrit l'accueil « village » d'une maison (26/11/2026) tel qu'il est codé :

- `js/os/village-batiments.js` : le **catalogue** des bâtiments (formes, sans DOM) ;
- `js/os/maison-village.js` : lecture des besoins, plan du terrain (4 parcelles), décor des parcelles libres ;
- `js/os/village-ecran.js` : le dessin à l'écran (SVG), les étiquettes, la bulle ;
- `js/os/village-compteurs.js` : le nombre affiché dans la pastille de la bulle ;
- tests : `tests/maison-village.test.js` (sans navigateur) et `tests/e2e/maison-village.spec.js` (captures dans `tests/e2e/captures/maison-village/`).

## 1. Le principe

- **Un bâtiment = un BESOIN du client, pas un module.** On ne dessine pas « le module Factures d'achat » : on dessine « Valider mes factures fournisseurs » (la banque). Deux besoins peuvent mener au même module, sur deux vues différentes.
- **Le terrain a toujours 4 parcelles** (un losange 2 x 2), même avec un seul besoin. Les besoins (1 à 4, au-delà les 4 premiers valables) prennent les parcelles dans un ordre fixe : **haut** (au fond), **gauche**, **droite**, **bas** (devant).
- Chaque bâtiment a **la même taille** quel que soit le nombre de besoins : avec un seul besoin, il occupe un quart du terrain.
- **Les parcelles libres sont décorées** et ne sont **ni cliquables ni atteignables au clavier** (`aria-hidden`). Dans l'ordre : la 1re parcelle libre reçoit un **champ de lavande**, la 2e un **bosquet**, la 3e un **potager**. Le dessin est le même à chaque affichage.
- Des **sentiers beige** forment une croix au milieu et relient les 4 parcelles ; un petit sentier va de chaque bâtiment au centre.
- Sous chaque bâtiment, une **étiquette permanente** : le nom seul. Au survol (ou au focus clavier ; sur téléphone : premier toucher), une **bulle** : le nom, la phrase, la pastille du compteur (s'il y en a un) et « Cliquez pour entrer ». Aucun `title` ni `<title>` SVG (l'infobulle grise du navigateur ferait doublon avec la bulle) : le nom accessible est l'`aria-label` du bâtiment.
- Sans besoins valables, rien ne change : l'accueil d'avant reste (c'est le cas chez Jérôme).

## 2. Le réglage : le champ `besoins` de `reglages_maison/ecran`

Une liste de 1 à 4 fiches :

| Champ | Obligatoire | Règle |
|---|---|---|
| `nom` | oui | texte court (40 caractères au plus, coupé au-delà) : l'étiquette permanente |
| `phrase` | non | le besoin en mots simples (90 caractères au plus) : dans la bulle |
| `batiment` | non | un identifiant du catalogue (section 6) ; absent ou inconnu : `bureau` |
| `cible` | oui | une route interne « #/module/vue » (lettres, chiffres, - et _) ; tout le reste est refusé (`javascript:`, `http`, `//`…) |
| `compteur` | non | un identifiant de la liste fermée `COMPTEURS` ; pour l'instant seulement `factures_a_valider` ; inconnu : ignoré |

Exemple (données neutres) :

```json
{
  "besoins": [
    { "nom": "Factures", "phrase": "Valider mes factures fournisseurs", "batiment": "banque", "cible": "#/achatsfactures/liste", "compteur": "factures_a_valider" },
    { "nom": "Achats", "phrase": "Payer moins cher mes articles", "batiment": "marche", "cible": "#/tableauachats/tableau" },
    { "nom": "Chantiers", "phrase": "Suivre les dépenses de mes chantiers", "batiment": "grue", "cible": "#/achatschantiers/liste" },
    { "nom": "Véhicules", "phrase": "Suivre la maintenance de mes véhicules", "batiment": "garage", "cible": "#/achatschantiers/liste" }
  ]
}
```

Le compteur `factures_a_valider` compte les factures au statut « a_valider » non archivées, par la même lecture que le module Factures d'achat (`compterFacturesAValider` dans `js/modules/achatsfactures/donnees.js`), sans route nouvelle. La lecture démarre **dès l'affichage du village** (une seule par affichage, jamais au survol) ; la base peut mettre plusieurs secondes à se réveiller au premier appel : tant que le nombre n'est pas arrivé, la bulle montre une pastille grise animée « Compte en cours », puis la pastille dès qu'il arrive (le nombre reste connu pour les survols suivants). Lecture en panne, incomplète ou plus lente que 20 secondes : l'indicateur disparaît, **pas de pastille** (jamais de chiffre inventé, jamais « 0 » en cas d'erreur). Un vrai zéro s'écrit « Rien à valider » (pastille verte).

## 3. La géométrie

Toutes les mesures sont en **unités du dessin SVG** (« px du dessin »), avant l'agrandissement à l'écran (environ x 2 sur un ordinateur 1440 x 900, x 0,6 sur un téléphone de 390 px).

- **Angle isométrique 2:1** (environ 26,57°). Un point de la grille `(gx, gy)` à la hauteur `z` (en px) se place à l'écran en `x = (gx − gy) × 16`, `y = (gx + gy) × 8 − z` (fonction `iso`, `T = 16`). `gx` va vers la droite-bas, `gy` vers la gauche-bas, `z` vers le haut.
- **Une parcelle** : un carré de 9 x 9 unités de la grille (`DEMI_PARCELLE = 4.5`), soit un losange de 288 x 144 px du dessin. Sentier entre deux parcelles : 1 unité (`DEMI_SENTIER = 0.5`). **Le terrain** : 20 x 20 unités (`DEMI_TERRAIN = 10`), un losange de 640 x 320 px, posé sur une tranche de terre de 12 px (`EPAISSEUR_TERRAIN`).
- Centres des parcelles (grille) : haut `(−5, −5)`, gauche `(−5, 5)`, droite `(5, −5)`, bas `(5, 5)`.
- **Un bâtiment** est dessiné autour de son centre `(0, 0)` :
  - **empreinte au sol** : environ 4 x 4 unités, de `−2` à `+2` sur `gx` et `gy` ; l'ombre portée va jusqu'à `gx = 2.9`, `gy = 2.6` (fonction `ombre`) ;
  - **boîte permise** (`BOITE_BATIMENT`) : `x` entre −100 et +100, `y` entre −150 (haut du toit, antenne comprise) et +50 (bas de l'ombre). Hauteur maximale : environ **120 px** de murs et toit (`z`) ; une antenne ou une flèche de grue peut monter jusqu'à 140 ;
  - **socle** : un bâtiment peut avoir une marche ou un socle de 3 à 7 px de haut, de la couleur claire de ses murs ou du bois.
- **Marges** : le cadre (`viewBox`) entoure le losange du terrain, les toits et les étiquettes avec 8 px de marge ; les coins vides sont rognés.
- **Étiquette** : 36 px sous le centre du bâtiment (`ETIQUETTE_Y`). Ordinateur : nom en 11,5 px du dessin (≈ 24 px à l'écran), cadre de 19 px de haut, coins arrondis 7. Téléphone : nom en 24 px du dessin (≈ 14 px à l'écran), cadre de 36 px, coins 12. Un nom trop long est resserré, jamais coupé.
- **Bulle** : en HTML au-dessus du dessin, centrée sur le bâtiment, sa pointe 6 px au-dessus du haut du bâtiment (jamais hors de l'écran) ; largeur 190 à 260 px.

## 4. La palette

| Usage | Couleur |
|---|---|
| Fond autour du terrain | `#DCE7BC` |
| Herbe du terrain | `#A9C46E` |
| Tranche de terre (face gauche / face droite) | `#8A6A45` / `#6F5436` |
| Sentiers et place pavée | `#EFD9AE` |
| Lavande : rangs / reflet / terre | `#9A7FC4` / `#B9A3E0` / `#B49A72` |
| Potager : terre / sillons / choux / tomates | `#9C6B43` / `#7E5432` / `#6FA24A` / `#E0703A` |
| Arbre rond : feuillage / reflet / tronc | `#7DAA5A` / `#93BF6C` / `#7A5A3E` |
| Cyprès | `#4E7A45` |
| Fleurs du pré | `#F7C548` et `#FFFDF6` |
| Ombres (au sol, sous un arbre) | `#3b2412`, opacité 0,14 |
| Bois (poteaux, palettes) | dessus `#93674A` |
| Fenêtres claires / bleues | `#FFFDF6` ou `#FFE9C7` / `#8FC1DD` ou `#79A9C4` |
| Porte | `#8A4B2F` (ou une teinte foncée de la couleur du bâtiment) |
| Pastille du compteur / pastille « rien » | `#E4572E` / `#6FA24A`, texte `#FFFDF6` |
| Étiquette : fond / texte | `#FFFDF6` / `#2A1A2C` |
| Bulle : fond / phrase / aide | `#FFFCF7` / `#6E5A63` / `#8A7680` |
| Halo au survol | `#FFF3B0` |

Couleurs de murs déjà prises (la couleur claire, celle du dessus) : banque `#F8EAD0`, marché `#EADBC3` (socle), poste `#FBD778`, phare `#DBD9D3`, grue (cabane) `#EBDABF` et acier `#F3AC50`, radio `#CD94BE`, beffroi `#DBCDEB`, maison des clients `#F4A593`, garage `#B7C9A8`, école `#F4C99B`, archives `#E8B98A`, maison commune `#9CC3D1`. Toits : rouge `#D9603B` ou `#CE5B38`, bleu `#4D86B7`, ardoise `#2F5D73`, violet `#563B85`, prune `#844A5C`.

**Règle des faces (une seule lumière, venue de la gauche)** : pour chaque volume, on part de la couleur claire.

- **dessus** = la couleur claire ;
- **face gauche** (tournée vers nous, à gauche) = **86 %** de sa lumière (chaque composante rouge, vert, bleu multipliée par 0,86) ;
- **face droite** = **70 %** de sa lumière.

La fonction `teintes('#RRGGBB')` de `js/os/village-batiments.js` fait ce calcul (`toitTeintes` pour un toit). Exemple : `teintes('#C8A064')` donne `#C8A064`, `#AC8A56`, `#8C7046`.

## 5. Le style

- **Aplats** de couleur, **jamais de contour noir**. Seul trait permis : un liseré fin de la même famille de couleur (cadran d'horloge, médaille).
- **Ombres douces** : une seule ombre au sol par bâtiment (`ombre()`), brun très transparent.
- **Détails autorisés** : fenêtres, porte, enseigne ronde ou médaille, petits accessoires qui disent le besoin (cageots, palette, boîte aux lettres, pneu, clé, graphique en barres, ondes). Trois accessoires au plus : on doit reconnaître le bâtiment en une seconde.
- **Pas de texte** dans le dessin (le nom est dans l'étiquette), pas de logo de marque, pas de personnage.
- Ordre de dessin (du fond vers l'avant) : l'ombre, le socle, les murs, les fenêtres, le toit, puis les accessoires de devant. Sur la face gauche, une fenêtre se pose avec `fenetreG(gy, a, b, z1, z2, couleur)` ; sur la face droite avec `fenetreD(gx, a, b, z1, z2, couleur)`.

## 6. Le catalogue

| Identifiant | Bâtiment | Besoin typique | Accessoires |
|---|---|---|---|
| `bureau` | Bureau (par défaut) | Gérer mon entreprise au quotidien | tour vitrée, antenne |
| `banque` | Banque | Valider mes factures fournisseurs | colonnes, toit rouge, médaille dorée |
| `marche` | Marché | Payer moins cher mes articles | auvent rayé, étal de fruits, cageots |
| `entrepot` | Entrepôt | Ne jamais manquer de matériel | grande porte en bois, caisses |
| `atelier` | Atelier | Faire un devis qui donne envie | toit en dents de scie, cheminée qui fume |
| `maison` | Maison | Mes papiers personnels | volets lavande, cheminée |
| `clients` | Maison des clients | Suivre mes clients et mes ventes | vitrine, auvent turquoise, cœur jaune |
| `poste` | Poste | Prévenir mes clients avant de venir | enveloppe rouge, boîte aux lettres jaune |
| `radio` | Radio | Me faire connaître | antenne, ondes rouges |
| `phare` | Phare (tour de guet) | Voir ce qui change dans mon métier | tour rayée, lanterne, faisceaux |
| `grue` | Grue (chantier) | Suivre mes chantiers | grue orange, palette suspendue, tas de sable |
| `beffroi` | Beffroi | Voir où en est mon entreprise | horloge, petit graphique en barres |
| `garage` | Garage | Suivre la maintenance de mes véhicules | porte ouverte, camion de maçon avec bétonnière, pneu et clé |
| `fontaine` | Fontaine | Savoir ce que pensent mes clients | bassin, jets d'eau, étoiles |
| `ecole` | École | Apprendre un nouveau savoir-faire | clocheton, cloche |
| `archives` | Archives | Retrouver mes papiers | colonnes, étagères, pile de dossiers |
| `mairie` | Maison commune | Organiser mon équipe | mât et drapeau turquoise |

Capture de tout le catalogue : `tests/e2e/captures/maison-village/V27-catalogue-ordinateur.png` (planche assemblée par le test V27).

**Choisir un bâtiment existant plutôt que d'en créer un** : lis la colonne « Besoin typique ». Si le besoin du client ressemble à l'un d'eux (même idée, même geste : compter de l'argent, recevoir et envoyer, suivre un chantier, surveiller), prends ce bâtiment. On ne crée un bâtiment que si aucun ne se reconnaît en une seconde pour ce besoin, et s'il pourra servir à d'autres clients (pas de bâtiment pour un seul client).

## 7. Recette : ajouter un bâtiment, pas à pas

Exemple complet (inventé) : le besoin « **Nettoyer mes camions bennes** » → bâtiment `station-lavage`.

1. **L'identifiant** : minuscules, lettres et tirets, stable (il est enregistré dans les réglages des clients) : `station-lavage`.
2. **Les formes**, dans `js/os/village-batiments.js`, une fonction sans DOM qui rend une liste de formes autour de `(0, 0)` :
   - l'ombre : `ombre()` ;
   - la dalle de lavage : `boite(-2, -2, 4, 4, 0, 3, teintes('#DBD9D3'))` (gris clair) ;
   - l'auvent sur quatre poteaux : `boite(gx, gy, 0.3, 0.3, 3, 36, BOIS)` aux quatre coins, puis le toit plat `boite(-2.1, -2.1, 4.2, 4.2, 39, 4, teintes('#4D86B7'))` (bleu des toits) ;
   - le camion benne sous l'auvent : cabine `boite(0.6, -0.4, 0.9, 1.0, 2, 14, teintes('#F28C28'))` (orange), benne `boite(-1.4, -0.4, 1.9, 1.0, 4, 10, teintes('#BDB6AA'))`, deux roues `{ cercle: [x, y, 3.4], fill: '#2E2A27' }` placées avec `iso(gx, gy, 2.5)`, une fenêtre `fenetreG(0.6, 0.7, 1.3, 9, 14, '#8FC1DD')` ;
   - les jets d'eau : trois `{ ligne: [[x1, y1], [x2, y2]], trait: '#8CC7DB', epaisseur: 2.4 }` qui partent du toit vers le camion, et deux gouttes `{ cercle: [x, y, 2.5], fill: '#BFE3EF' }`.
   Vérifie la règle : tout reste dans `x` −100 / +100 et `y` −150 / +50, les faces suivent `teintes`.
3. **Le catalogue** : ajoute l'entrée dans `CATALOGUE` : `'station-lavage': Object.freeze({ nom: 'Station de lavage', besoin: 'Nettoyer mes camions bennes', accessoires: 'camion benne, jets d’eau bleus', dessin: stationLavage })`. `BATIMENTS` se met à jour tout seul ; un identifiant inconnu donne toujours le bureau.
4. **Le test** : le test V6 de `tests/maison-village.test.js` vérifie déjà chaque bâtiment du catalogue (dessin sans erreur, dans sa boîte, dans sa parcelle, identifiant en minuscules). Ajoute `'station-lavage'` à la liste des identifiants attendus dans V6, pour qu'il ne disparaisse pas par erreur.
5. **La capture** : lance `npm run test:module maison-village` ; la planche `V27-catalogue-ordinateur.png` montre le nouveau bâtiment à côté des autres : vérifie à l'œil la taille, l'angle et la lumière. Ajoute cette capture à la recette de la PR.
6. **La charte** : ajoute une ligne au tableau du catalogue (section 6) et, si tu as pris une nouvelle couleur de murs, à la liste de la section 4.
7. **Le réglage du client** : `"batiment": "station-lavage"` dans la fiche du besoin (section 2).
