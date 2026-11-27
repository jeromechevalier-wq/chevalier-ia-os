# Accueil « village » : cahier des charges (27/11/2026)

Ce document décrit la **nouvelle page d'accueil en forme de village**, décidée par Jérôme le 27/11/2026. Il prolonge l'accueil village déjà codé le 26/11/2026 (voir « Ce qui existe aujourd'hui » et `docs/village-charte.md`).

Le dépôt est public : aucun secret, aucun nom de client, aucune donnée de client dans ce fichier ni dans les exemples.

**Un mot à ne pas confondre.** Dans le code, une « maison » veut déjà dire **une installation à part d'un client** (`reglages_maison/…`, `js/os/comptes-maison.js`). Dans ce document, « maison » veut dire **un bâtiment du village**, comme Jérôme le dit. Dans le code, on écrira `batiment` pour éviter la confusion (voir point ouvert 1).

## 1. But

- Remplacer l'accueil par un **terrain (un village)** où chaque **besoin** est une maison (comme le village du 26/11). On clique sur une maison, on entre dans l'écran qui répond à ce besoin.
- Rendre le travail **agréable** : chaque bonne nouvelle (facture validée, facture payée, devis signé) rapporte des **pièces d'or** pour embellir son village.
- Chaque utilisateur a **son propre village**, qu'il range comme il veut.
- Séparer clairement deux choses : **les réglages de l'accueil** (la roue dentée) et **les réglages de l'application** (un bâtiment : la Mairie).

## 2. Ce qui existe aujourd'hui

Lu dans le code au 27/11/2026 (branche la plus récente de l'accueil village, PR 715 et suivantes).

| Élément | Ce qu'il fait aujourd'hui | Fichiers |
|---|---|---|
| Accueil habituel | Page « Bonjour … » : Indicateurs du mois, Favoris, À faire, À relancer, statistiques. Route par défaut `crm/accueil`. | `js/modules/crm/accueil.js`, `js/os/router.js` (`ROUTE_DEFAUT`) |
| Accueil village (26/11) | Terrain isométrique en SVG, **toujours 4 parcelles** (losange 2 x 2). **Un bâtiment par BESOIN** (pas par module), 1 à 4 besoins. Parcelles libres décorées (lavande, bosquet, potager), non cliquables. Étiquette sous chaque bâtiment, bulle au survol avec un compteur (ex. « 12 à valider »). Téléphone : premier toucher = bulle, second = entrer. Route `#/accueil`. | `js/os/village-ecran.js` (dessin), `js/os/maison-village.js` (lecture et plan), `js/os/village-batiments.js` (catalogue de 17 bâtiments), `js/os/village-compteurs.js`, `docs/village-charte.md` |
| Réglage du village | Champ facultatif `besoins` du document `reglages_maison/ecran`, écrit **par Jérôme pour toute une installation**, pas par l'utilisateur. Chaque besoin : nom, phrase, bâtiment, cible, compteur. Absent = accueil habituel (c'est le cas chez Jérôme). Cible : seulement une route interne `#/module/vue`. | `js/os/comptes-maison.js`, `js/main.js` (`ROUTE_VILLAGE`, `besoinsVillage`) |
| Bâtiments déjà dessinés | bureau, banque, marché, entrepôt, atelier, maison, maison des clients, poste, radio, phare, grue, beffroi, garage, fontaine, école, archives, **maison commune** (`mairie`, besoin « Organiser mon équipe »). Dessin fait main en SVG (aplats, une lumière venue de la gauche). | `js/os/village-batiments.js`, `docs/village-charte.md` §6 |
| Liste des modules | `MODULES_DECLARES` : Contacts (socle), Affaires, Projets, Devis, Veille, Réseaux sociaux, Rendez-vous, Automatisations, Tableau de bord, Maintenance, Fournisseurs, Chantiers, Articles, Factures, Tableau de bord 2, Accès MCP, Console. Modules allumés par installation : champ `modules` de `reglages_maison/ecran`. | `js/os/registre.js`, `js/os/maison-modules.js` |
| Réglages de l'application | **Pas de roue dentée sur l'accueil** aujourd'hui. Les Réglages s'ouvrent par le menu du nom du compte (en bas du menu de gauche), entrée « Réglages » avec l'icône roue dentée. Page à menu latéral : d'abord l'espace (Mon espace, Membres et rôles, Modules actifs, Déploiement, Mes tests, Connexion à la base), puis une entrée par module actif. | `js/os/shell.js` (menu du compte), `js/os/reglages.js`, `js/os/registre.js` (`SECTIONS_ESPACE`, `reglagesDesModules`) |
| Console | Module réservé à Jérôme, contrôlé par son identité côté serveur à chaque appel (décision du 16/11/2026). | `docs/console.md` |
| Roue dentée en haut à droite | Existe **dans une application de module** (Factures) : en haut à droite, l'icône statistiques puis la roue dentée = réglages de CETTE appli seulement. | `js/modules/achatsfactures/appli.js`, `docs/consignes-ui.md` (« application de module »), `js/os/shell.js` (`PAGES_APPLICATION`) |
| Animations « Validée / Refusée » | Dans la pile de Factures : après une décision réussie, un tampon « Validée » ou « Refusée », la facture glisse à gauche, la suivante arrive, « Annuler » pendant 3,2 s, bilan du jour à la fin. Coupées si le système demande moins d'animations. | `js/modules/achatsfactures/pile.js`, `js/os/ui.js` (`reduireAnimations`) |
| Célébrations | Feu d'artifice « Bravo ! », affaire gagnée, projet terminé, paiement, objectif atteint, compteurs animés. Option à allumer dans les réglages (interrupteur « Célébrations »). | `js/os/celebrations.js` |
| Images envoyées | Contrôle des images envoyées (PNG, JPG, WebP, jamais de SVG, taille maximale), utilisé par « Mon espace ». | `js/os/mon-espace-images.js` |

**Écarts entre l'existant et les décisions du 27/11** :

| Aujourd'hui (26/11) | Demain (27/11) |
|---|---|
| Un bâtiment = un besoin | **On garde** : un bâtiment = un besoin |
| 4 parcelles fixes, 1 à 4 besoins | Un damier libre ; une maison = une ou plusieurs cases |
| Rangement fixé par Jérôme pour toute l'installation | Chaque utilisateur a son village et le range lui-même ; les besoins réglés par Jérôme servent de départ (point ouvert 2) |
| 17 dessins SVG faits main | **On garde nos dessins** (décision du 27/11 après comparaison) ; on dessine dans le même style ce qui manque : Mairie, Console, enclos à cochons, champs, décorations |
| Pas de Mairie des réglages, pas de Console dans le village | Une Mairie (réglages de l'application) et, chez Jérôme seul, un bâtiment Console |

## 3. Décisions de Jérôme (27/11/2026)

**Mise à jour du 27/11/2026 (soir)** : on GARDE le village par besoins (une maison = un besoin) et non par module ; **images : on garde nos dessins** (Jérôme a comparé avec les bibliothèques gratuites et a choisi nos dessins) ; montants d'or du §7 validés ; cochons, champs, maisons et décorations occupent des cases du damier et se déplacent tous (glisser-déposer à la souris et au doigt ; pas de déplacement au clavier, décision du 27/11 : tout le monde a une souris), et le jeu est à part (pas de lien avec factures ou chantiers) ; **un double clic sur une maison ouvre ses réglages** (renommer, changer l'image, cacher, ajouter une petite maison) ; les besoins de départ sont réglés par Jérôme, chaque utilisateur cache ou ajoute un besoin parmi ceux de son entreprise ; maison lien externe : image de la bibliothèque seulement, pas de logo envoyé pour l'instant ; aucun son ; la Mairie (réglages de l'application) et la Console (village de Jérôme seul) sont deux bâtiments différents.

| N° | Décision |
|---|---|
| 1 | Accueil = un terrain (village) avec **une maison par besoin** (comme le village du 26/11), et non par module. Les maisons se posent sur un damier libre (plus de 4 parcelles fixes) : une maison = une ou plusieurs cases. |
| 2 | Pièces d'or gagnées en travaillant (pas de vrai argent) : valider une facture, facture payée, devis signé (montants validés, voir §7). L'or sert à acheter des parcelles de terrain, des enclos à cochons, des champs cultivés, des décorations. |
| 3 | Chacun son terrain : chaque utilisateur a son propre village, et le range lui-même (place, nom, maisons affichées ou cachées). **Les besoins sont réglés par Jérôme** pour l'entreprise (village de départ) ; chaque utilisateur peut cacher un besoin ou en ajouter un parmi ceux de son entreprise. |
| 4 | Petites maisons « vue filtrée » (un véhicule à côté du Garage, un chantier à côté de la maison des chantiers) : créées à la main par l'utilisateur ET automatiquement (ex. quand un chantier démarre ; elle disparaît quand il est fini). Elles sont toujours collées à leur grande maison. Un clic ouvre le module filtré sur cet élément. |
| 5 | Jeu : enclos à cochons et champs cultivés qui rapportent des pièces d'or, inspirés des jeux de ferme (mécaniques seulement, jamais de nom, personnage ou dessin d'un jeu existant). Ils occupent des **cases libres du damier**, comme dans les jeux de ferme classiques. **Simple jeu à part** : aucun lien avec les factures ni les chantiers. Maisons, champs, enclos et décorations **se déplacent tous**, par glisser-déposer (souris et doigt), directement, sans passer par un menu. Pas de déplacement au clavier. |
| 6 | Ton : uniquement des récompenses, jamais de reproche (rien ne meurt, rien ne pourrit, pas de série de jours à tenir, pas de classement, aucune notification liée au jeu, un réglage pour couper les animations). **Aucun son.** Reprendre l'esprit des animations « facture validée / refusée » existantes pour fêter les bonnes nouvelles. |
| 7 | Maison « lien externe » : l'utilisateur crée une maison qui représente un autre logiciel (site internet, par ex. un outil de suivi de chantier d'un autre éditeur) ; au clic, le site s'ouvre dans un NOUVEL onglet. Son image : **choisie seulement dans la bibliothèque d'images**. Pas d'envoi de logo pour l'instant (plus tard si nécessaire, ou image faite à la main). Attention à la sécurité des liens (https seulement, `rel="noopener noreferrer"`). |
| 8 | Roue dentée en haut à droite de l'accueil = UNIQUEMENT les réglages de la vue d'accueil : (A) déplacer les maisons, (B) réafficher une maison cachée ou ajouter un besoin de l'entreprise, (D) couper les animations, (E) décor (saison, jour ou nuit), plus « Ajouter un lien externe ». **Les réglages d'UNE maison (renommer, changer l'image, cacher, ajouter une petite maison) s'ouvrent par un double clic sur cette maison**, pas par la roue. Le déplacement se fait en glissant la maison, sans mode spécial. Plus aucun réglage de l'application derrière cette roue. |
| 9 | Un bâtiment dédié aux réglages de l'application : la MAIRIE. Tout ce qui est aujourd'hui derrière la roue dentée et qui ne concerne pas l'accueil y déménage. La Mairie des réglages et le besoin « Organiser mon équipe » ont **deux images différentes**. |
| 10 | La CONSOLE est un bâtiment à part, différent de la Mairie, **visible seulement dans le village de Jérôme**. L'accès est contrôlé par son identité côté serveur, comme la Console aujourd'hui (décision du 16/11/2026) : cacher le bâtiment ne suffit pas. |
| 11 | Téléphone : le village glisse avec le doigt, et un bouton « Liste » en haut le transforme en simple liste de maisons. |
| 12 | **Images : on garde nos dessins SVG faits main** (décision du 27/11/2026, après un tableau de comparaison avec les bibliothèques gratuites Quaternius et Kenney : style trop différent, aucun bâtiment seul, rien pour radio, phare, grue, Console). Ce qui manque (Mairie, Console, enclos à cochons, champs en plusieurs étapes, décorations) est dessiné dans le même style (`docs/village-charte.md`). Prévoir une bibliothèque d'images dans l'appli pour les vignettes, faite de nos dessins. Engins de chantier : plus tard. |
| 13 | Règles permanentes du projet à respecter : même code chez Jérôme et chez les clients (Jérôme d'abord) ; chaque module reste utilisable seul ; le mot « CRM » n'apparaît pas à l'écran. |

## 4. Découpage en étapes livrables séparément

Chaque étape = une PR, utilisable seule, d'abord chez Jérôme (décision 13). L'ordre suit la proposition de Jérôme, ajustée au code.

| Étape | Contenu | Pourquoi dans cet ordre | Relecture Fable |
|---|---|---|---|
| 1 | Roue dentée de l'accueil (réglage D seulement au début : couper les animations) + bâtiment Mairie qui ouvre la page Réglages actuelle. L'entrée « Réglages » du menu du compte mène aussi à la Mairie (même page). | Ne déplace aucune donnée : la Mairie ouvre l'écran `reglages` existant. Sépare tout de suite les deux sortes de réglages. | Oui (navigation) |
| 2 | Village par utilisateur : une maison par besoin, posée sur un damier libre ; glisser-déposer des maisons ; double clic = réglages de la maison (renommer, cacher) ; roue dentée = réafficher ou ajouter un besoin. Bâtiment Console chez Jérôme seul. Téléphone : glisser + bouton « Liste ». Remplace l'accueil habituel quand l'utilisateur l'allume. | Le cœur du village. Réutilise les besoins (`reglages_maison/ecran`) et le dessin SVG existant (`village-batiments.js`) en attendant les images. | Oui (nouvel écran, données) |
| 3 | Maison « lien externe » (https seulement, nouvel onglet, `rel="noopener noreferrer"`). Image : catalogue existant au début, bibliothèque à l'étape 5. | Petite, utile tout de suite (autres logiciels du client). | Oui (liens) |
| 4 | Petites maisons « vue filtrée » : à la main d'abord, puis automatiques (chantier démarré, disparition à la fin). | A besoin du damier (étape 2) et d'une adresse filtrée par module. | Oui |
| 5 | **Dessiner ce qui manque** dans le style actuel (Mairie, Console, enclos, champs, décorations) et bibliothèque d'images dans l'appli faite de nos dessins ; double clic > changer l'image. | Ne bloque rien : les dessins actuels servent dès l'étape 2. | Oui |
| 6 | Pièces d'or, achat de parcelles et de décorations ; fêtes des bonnes nouvelles ; décor (E) saison, jour ou nuit. | Ajoute le jeu sur un village qui marche déjà. | Oui (serveur, données) |
| 7 | Enclos à cochons et champs cultivés, posés sur des cases libres, déplaçables, qui rapportent de l'or. Simple jeu à part, sans lien avec les factures ni les chantiers. | Le plus « jeu » ; a besoin de l'or (étape 6). | Oui |

## 5. Critères d'acceptation observables

Une phrase chacun. Chaque critère aura un test dont le nom commence par son numéro et une capture d'écran (process de recette de `CLAUDE.md`).

### Étape 1 : roue dentée de l'accueil et Mairie

- **1.1** Sur l'accueil, une roue dentée est visible en haut à droite.
- **1.2** La roue dentée ouvre une fenêtre « Réglages de l'accueil » qui ne contient que des réglages de l'accueil (au début : « Animations »), jamais un réglage de l'application.
- **1.3** Couper « Animations » arrête les animations de l'accueil, et le choix est retrouvé après rechargement.
- **1.4** Le village contient un bâtiment « Mairie » ; un clic dessus ouvre la page Réglages de l'application (espace et modules).
- **1.5** L'entrée « Réglages » du menu du compte ouvre la même page que la Mairie.
- **1.6** Sur la page Réglages ouverte depuis la Mairie, un bouton « ← Retour au village » ramène à l'accueil.
- **1.7** Le même écran existe chez Jérôme et dans un espace client (décision 13).

### Étape 2 : village par utilisateur, damier, afficher ou cacher

- **2.1** L'accueil montre une maison par besoin du village de l'utilisateur, posée sur un damier visible pendant le rangement.
- **2.2** Une maison occupe une ou plusieurs cases selon sa taille.
- **2.3** On glisse une maison à la souris ou au doigt sur des cases libres, sans passer par un menu ; elle refuse de se poser sur une case prise. Un simple clic ouvre toujours le besoin.
- **2.4** Un double clic sur une maison ouvre la fenêtre de ses réglages (renommer, changer l'image, cacher, ajouter une petite maison).
- **2.5** Après rechargement, chaque maison est à l'endroit où l'utilisateur l'a laissée.
- **2.6** Deux utilisateurs du même espace voient chacun leur propre village (déplacer chez l'un ne change rien chez l'autre).
- **2.7** Double clic > « Cacher » : la maison disparaît du village, l'accès au module reste possible par le menu ; roue dentée > « Afficher ou ajouter » la fait revenir, ou ajoute un besoin de l'entreprise.
- **2.8** Double clic > « Renommer » : le nouveau nom s'affiche sous la maison ; le nom du besoin chez les autres utilisateurs et le nom du module dans le menu ne changent pas.
- **2.9** Un besoin retiré de l'installation, ou dont le module n'est pas actif dans l'espace, n'a jamais de maison, même si l'utilisateur l'avait rangé avant.
- **2.10** Sur téléphone, le village glisse avec le doigt et un bouton « Liste » en haut le transforme en liste de maisons cliquables.
- **2.11** Au clavier, chaque maison s'atteint avec Tab et s'ouvre avec Entrée.
- **2.12** Aucun texte de l'accueil ne contient le mot « CRM ».
- **2.13** Le bâtiment Console apparaît dans le village de Jérôme et jamais dans celui d'un client, d'un éditeur, d'un lecteur, d'un bot ou d'un assistant ; ouvrir son adresse à la main sans être Jérôme est refusé par le serveur.

### Étape 3 : maison « lien externe »

- **3.1** Roue dentée > « Ajouter un lien externe » crée une maison avec un nom et une adresse web.
- **3.2** Une adresse qui ne commence pas par `https://` est refusée avec un message clair.
- **3.3** Un clic sur la maison ouvre le site dans un nouvel onglet ; l'appli reste ouverte dans le premier onglet.
- **3.4** Le lien porte `rel="noopener noreferrer"` (vérifié par un test).
- **3.5** La bulle de la maison montre l'adresse du site, pour que l'utilisateur sache où il va.
- **3.6** L'image de la maison se choisit seulement dans le catalogue (puis la bibliothèque) ; aucun bouton d'envoi de fichier.

### Étape 4 : petites maisons « vue filtrée »

- **4.1** Double clic sur une grande maison > « Ajouter une petite maison » crée une petite maison collée à elle.
- **4.2** Un clic sur la petite maison ouvre le module filtré sur cet élément (ex. ce chantier seulement).
- **4.3** Quand on déplace la grande maison, ses petites maisons suivent.
- **4.4** Quand un chantier démarre, sa petite maison apparaît d'elle-même à côté de la maison du besoin « Suivre mes chantiers ».
- **4.5** Quand ce chantier est fini, sa petite maison automatique disparaît ; une petite maison créée à la main reste.
- **4.6** Une petite maison dont l'élément a été supprimé disparaît sans message d'erreur.

### Étape 5 : remplacer tous les dessins par la bibliothèque

- **5.1** Toutes les maisons du village ont le même angle et la même lumière (planche de capture de toutes les images).
- **5.2** Aucun des 17 dessins SVG faits main ne reste affiché : chaque besoin, la Mairie et la Console ont une image de la bibliothèque.
- **5.3** La Mairie des réglages et le besoin « Organiser mon équipe » ont deux images différentes.
- **5.4** Double clic > « Changer l'image » ouvre la bibliothèque d'images ; l'image choisie remplace l'ancienne.
- **5.5** Le dépôt ne contient que des images PNG rendues, aucun fichier source de modèle 3D.

### Étape 6 : pièces d'or, terrain, décor

- **6.1** Valider une facture ajoute des pièces d'or au compteur de l'utilisateur, avec une petite fête à l'écran.
- **6.2** Une facture payée et un devis signé rapportent aussi de l'or (montants du §7).
- **6.3** Une même facture ou un même devis ne rapporte de l'or qu'une fois, même après « Annuler » puis une nouvelle validation.
- **6.4** Avec assez d'or, l'utilisateur achète une parcelle de terrain ; le damier s'agrandit.
- **6.5** Avec pas assez d'or, le bouton « Acheter » est grisé et dit combien il manque, sans reproche.
- **6.6** Une décoration achetée se pose sur une case libre et se déplace comme une maison (glisser-déposer).
- **6.7** Roue dentée > « Décor » change la saison ou le jour et la nuit, sans rien changer d'autre.
- **6.8** Aucun écran du jeu ne montre de classement, de série de jours ou de notification, et aucun son n'est joué.

### Étape 7 : cochons et champs

- **7.1** Un enclos à cochons acheté se pose sur des cases libres du damier et produit des pièces d'or à ramasser d'un clic.
- **7.2** Un champ cultivé acheté se pose sur des cases libres, pousse, puis se récolte d'un clic contre des pièces d'or.
- **7.3** Un enclos ou un champ se déplace comme une maison (glisser-déposer) et refuse une case prise.
- **7.4** Un champ non récolté ne pourrit pas et un cochon non visité ne meurt pas : ils attendent, prêts.
- **7.5** Avec « Animations » coupé, la récolte se fait sans animation.
- **7.6** Valider une facture ou démarrer un chantier ne change rien aux cochons ni aux champs (jeu à part).

## 6. Données à stocker

Par **utilisateur** (décision 3), à côté des données de son espace. Chemins exacts et règles Firestore décidés à l'étape 2 (aucune règle n'est écrite ici). Le contrôle se fait dans les règles et au serveur, jamais seulement à l'écran.

| Donnée | Contenu | Qui écrit | Remarque |
|---|---|---|---|
| Besoins de l'installation | Liste des besoins (nom, phrase, bâtiment, cible, compteur) : le village de départ | Jérôme seul | Existe déjà : champ `besoins` de `reglages_maison/ecran` (`docs/village-charte.md` §2) |
| Village de l'utilisateur | Taille du damier ; pour chaque maison : identifiant du besoin, cases occupées, nom choisi, image choisie, cachée ou non | L'utilisateur lui-même | Un document par utilisateur (par exemple sous l'espace, identifié par son compte) |
| Maisons lien externe | Nom, adresse `https://`, image de la bibliothèque, cases | L'utilisateur | Adresse vérifiée à l'écran ET à la lecture |
| Petites maisons manuelles | Grande maison de rattachement, module, élément filtré (identifiant), nom | L'utilisateur | Disparaît si l'élément n'existe plus |
| Petites maisons automatiques | Calculées à l'affichage depuis les données du module (ex. chantiers en cours) | Personne | Pas stockées : rien à effacer à la fin d'un chantier (à confirmer à l'étape 4) |
| Préférences d'accueil | Animations coupées ou non, saison, jour ou nuit | L'utilisateur | Comme le thème, mais suivies d'un appareil à l'autre |
| Pièces d'or | Solde, et liste des gains déjà comptés (facture, devis : un gain par élément) | **Le serveur seul** | Sinon on pourrait s'ajouter de l'or depuis le navigateur ; règle « gagné une fois » |
| Achats | Parcelles, décorations, enclos, champs, avec leurs cases | Le serveur (achat = retrait d'or) ; la place (cases) est écrite par l'utilisateur quand il déplace | Jamais d'argent réel |
| Images de la bibliothèque | Nos dessins SVG, livrés avec l'appli | Le dépôt | Aucun fichier externe |

## 7. Montants de pièces d'or (validés)

Validés par Jérôme le 27/11/2026. Aucun lien avec le montant en euros de la facture.

| Bonne nouvelle | Pièces d'or |
|---|---|
| Facture validée | 10 |
| Facture payée | 20 |
| Devis signé | 50 |

| Achat | Prix |
|---|---|
| Décoration (arbre, fleurs, banc) | 20 |
| Champ cultivé | 100 |
| Enclos à cochons | 200 |
| Parcelle de terrain | 500 |

## 8. Cas vide et cas d'erreur

| Situation | Ce que voit l'utilisateur |
|---|---|
| Premier passage, village jamais rangé | Un village rangé d'office : la Mairie et une maison par besoin de l'installation (et la Console chez Jérôme), placées dans un ordre fixe. Une phrase : « Range ton village avec la roue dentée. » |
| Aucun besoin réglé pour l'installation | La Mairie seule, et la phrase « Ton village n'a encore aucune maison. » |
| Toutes les maisons cachées | La Mairie reste toujours visible (elle ne peut pas être cachée), avec « Affiche tes maisons avec la roue dentée. » |
| Village illisible (lecture en panne) | Le village rangé d'office s'affiche quand même, avec un bandeau « Ton rangement n'a pas pu être lu. Réessaie. » Rien n'est écrit par-dessus le vrai rangement. |
| Déplacement non enregistré | La maison (ou le champ, l'enclos, la décoration) revient à sa place d'avant, message « Le déplacement n'a pas été enregistré. Réessaie. » |
| Lien externe mal formé | Refus à la saisie : « L'adresse doit commencer par https:// ». Un lien déjà enregistré devenu invalide : la maison s'affiche grisée, sans lien. |
| Image introuvable | L'image par défaut (le bureau) s'affiche. |
| Solde d'or illisible | Le compteur d'or ne s'affiche pas (jamais un « 0 » inventé). |
| Pas assez d'or | Bouton « Acheter » grisé, phrase neutre : « Encore 30 pièces. » |
| Animations coupées ou système en « moins d'animations » | Aucune animation ; les gains d'or s'ajoutent quand même. |

## 9. Points ouverts

1. **Le mot « maison »** : à l'écran, « maison » ; dans le code, `batiment` (« maison » désigne déjà une installation de client). D'accord ?
2. **Qui choisit les besoins** : TRANCHÉ le 27/11 (décision 3) : Jérôme règle les besoins de l'entreprise ; chaque utilisateur cache ou ajoute parmi eux.
3. **Facture payée et devis signé** : aujourd'hui, quel événement exact compte (statut « payée », devis « accepté ») ? À vérifier module par module à l'étape 6.
4. **Lecteur d'un espace** : un compte en lecture seule a-t-il un village et gagne-t-il de l'or ? Proposition : village oui, or non (il ne valide rien).
5. **Taille de départ du damier**, taille d'une maison, d'un champ et d'un enclos en cases (1 x 1, 2 x 2…), et nombre de besoins au-delà des 4 actuels : à fixer à l'étape 2.
6. **Portail devis seul** : pas de village dans le portail (comme aujourd'hui) ?
7. **Logo envoyé pour une maison lien externe** : plus tard, si nécessaire (ou image faite à la main).

## 10. Sources

| Source | Ce qu'on en tire |
|---|---|
| `docs/village-charte.md` | Géométrie isométrique, palette, style, réglage `besoins`, catalogue des 17 bâtiments actuels |
| `docs/consignes-ui.md` | Règles d'interface, « application de module » (roue dentée en haut à droite), tutoiement |
| `docs/console.md` | Console réservée à Jérôme, contrôle par son identité côté serveur |
| `CLAUDE.md` (décisions permanentes) | Même code chez Jérôme et chez les clients, modules utilisables seuls, pas de « CRM » à l'écran |
| Rapport de recherche « jeux de ferme » (session du 27/11/2026, non versé dans le dépôt) | Mécaniques reprises : récolte d'un clic, enclos qui produisent, achat de terrain, objets posés et déplacés sur un damier ; jamais de nom, de personnage ni de dessin d'un jeu existant |
| Rapport de recherche « bibliothèques d'images » et tableau de comparaison (session du 27/11/2026, non versés dans le dépôt) | Quaternius et Kenney étudiés puis écartés : Jérôme garde nos dessins |
