# Cadrage : une conversation fluide pour créer un devis avec l'assistant

Écrit le 29/10/2026 (**document de cadrage, aucun code**). Il sert de base à plusieurs PR séparées, faites ensemble, dans l'ordre de la section 5. Les décisions de Jérôme du 29/10/2026 sont marquées **Décidé** ; ce que j'ai choisi seul est marqué **Décision prise seule** (avec la question restante à la section 10) ; le reste est **À trancher**. Tous les exemples sont inventés (« prise double », « salle de bain », « M. Dupont ») : aucun nom réel, aucune donnée de client (dépôt public).

## 0. En cinq lignes

1. **Ce qui marche déjà** : créer un devis complet avec ses sections en un seul appel (`creer_devis_brouillon` accepte déjà `sections`), la numérotation 1, 1.1, 1.2 (elle existe dans l'éditeur et le PDF, mais l'assistant ne la voit pas), le journal et la restauration, le dictionnaire de vocabulaire.
2. **Ce qui manque pour la fluidité** : l'assistant ne peut ni viser une ligne par son numéro, ni en changer plusieurs d'un coup, ni annuler d'un mot ; ses récapitulatifs sont trop lourds (prix d'achat compris) ; il ne connaît pas les anciens devis du client.
3. **Plan** : 8 PR (section 5), de la plus petite à la plus grosse ; les numéros et les modifications par numéro d'abord (ce que Jérôme verra tout de suite), l'historique ensuite, les « ensembles qui reviennent » en dernier (ils demandent de mesurer la lenteur avant).
4. **Mot « ouvrage »** : un **réglage à part** (pas le dictionnaire), avec une liste de mots prévus et leur grammaire ; les écrans ET les réponses de l'assistant l'utilisent (section 4).
5. **Garde-fous** : données du client seulement, prix du catalogue d'aujourd'hui, aucun e-mail qui part tout seul (test existant), tout ce qui est écrit reste dans le journal.

## 1. Les décisions de Jérôme du 29/10/2026

- **A. Sections et lignes numérotées.** L'assistant **invite** (sans imposer) à structurer en sections. Il propose les sections (familles du catalogue du client, puis les mots du client) et le client valide d'un mot. Numérotation 1, 1.1, 1.2 (un seul niveau côté assistant au début ; l'éditeur en connaît déjà trois), **identique à l'éditeur et au PDF**. L'assistant peut **viser, modifier ou supprimer une ligne par son numéro** (nouvel outil serveur : le serveur travaille avec l'identifiant de la ligne, le numéro est résolu au moment de l'appel, l'assistant relit toujours le devis avant de modifier, et redit la ligne en cas de changement important). Création d'un devis complet avec ses sections en **un seul appel**. Modification de **plusieurs lignes d'un coup**. **Annulation** de la dernière modification (le journal existe). Récapitulatifs **courts** : intitulé et quantité, **sans prix** sauf si le client le demande, avec le total « hors taxes » et « TTC » à la fin (jamais « HT » à l'oral). Test **à la voix** des numéros (« un point un »).
- **B. Devis qui se ressemblent.** L'assistant connaît **tous** les devis des **12 derniers mois** du client (tous statuts : acceptés, refusés, envoyés ; les refusés ne sont pas écartés, la cause du refus n'est pas forcément le contenu ; seuls les brouillons vides ou supprimés sont exclus). Il s'en sert pour : (1) trouver le devis le plus proche d'une demande (« comme le devis de M. Dupont », « une salle de bain ») et partir de lui en ne demandant que les variantes ; (2) repérer les **ensembles d'articles et de quantités qui reviennent** (calcul préparé à l'avance côté serveur, jamais en relisant 12 mois à chaque phrase : la lenteur est un point sensible, 15 à 20 secondes déjà ressenties) ; (3) proposer de transformer un ensemble récurrent en « ouvrage » du catalogue, validé d'un mot. Garde-fous : données du client seulement (isolation entre clients), **prix du catalogue d'aujourd'hui** (pas ceux de l'ancien devis), repli sur le catalogue et le dictionnaire si l'historique est mince.
- **C. Vocabulaire des métiers.** Le mot « ouvrage » ne convient pas à tous (un plombier dit « ensemble »). Étudier un réglage par client du mot affiché (ouvrage / ensemble / autre), utilisé dans les écrans ET par l'assistant, et sa place par rapport au dictionnaire (`devis_vocabulaire`).
- **D. Liste marketing** : la section 11 est tenue à jour par chaque PR de ce chantier.

## 2. Ce qui existe déjà (vérifié dans le code le 29/10/2026)

| Sujet | Ce qui existe | Où |
|---|---|---|
| **Outils Devis de l'assistant** (75 outils au total, `tests/mcp-clients.test.js`, test D1a) | Lecture : `lister_devis`, `lire_devis`, `obtenir_pdf_officiel_devis`, `lire_reglages_devis`, `lister_articles`, `chercher_article`, `rechercher_article_par_phrase`. Écriture : `creer_devis_brouillon`, `modifier_devis_brouillon`, `nouvelle_version_devis`, `archiver_devis`, `enregistrer_envoi_devis`, `preparer_email`, `changer_statut_devis`, `finaliser_devis`, `supprimer_devis`, `creer_article`, `modifier_article`, `desactiver_article`, `enregistrer_reponse_vocabulaire`, `restaurer_depuis_audit` | `functions/src/mcp/outils/lecture.js`, `ecriture.js`, `suppression.js`, `garantie.js` |
| **Un devis complet avec ses sections en un appel** | **Déjà vrai** : `creer_devis_brouillon` accepte `sections` (50 au plus, `[{ titre, lignes }]`, 200 lignes par section) et/ou `lignes` ; il rend seulement `id`, `lignes` (un nombre), `totalHT`, `totalTTC` (donc l'assistant doit rappeler `lire_devis` pour faire un récapitulatif). Un seul niveau de section, pas de sous-section, pas de ligne libre (tout vient du catalogue) | `functions/src/coeur/metier.js` (`creerDevisBrouillon`, `sectionsDepuisSaisie`) |
| **Modifier un brouillon** | `modifier_devis_brouillon` : `sections` ou `lignes` **remplacent tout** (les lignes libres faites à l'écran sont perdues, la description le dit) ; `ajouterLignes` ajoute **à la fin de la dernière section** seulement. **Aucun outil** pour changer la quantité d'une ligne, en supprimer une, ou en modifier plusieurs (confirmé par la ligne « ligne en double » de `.github/A-FAIRE.md`). Les identifiants de ligne sont **tirés de nouveau** à chaque remplacement | `metier.js` (`modifierDevisBrouillon`) |
| **Numérotation** | Une seule fonction pure, `numerosDevis(sections)` : section « 1 », lignes posées directement dessous « 1.1, 1.2 » (le compteur est partagé avec les sous-sections), sous-section « 1.2 » et ses lignes « 1.2.1 », un saut de page n'a pas de numéro, la première section sans titre compte comme « 1 ». L'éditeur l'appelle via `numerotation()`, le PDF via `vueClient` (même fonction, `logique.js` ligne 970). **`lire_devis` ne donne aucun numéro** : il renvoie `...l` (dont l'`id`) sans `numero` | `js/modules/devis/logique.js` (`numerosDevis`, `niveauSection`), `editeur-logique.js` (`numerotation`), copié sur le serveur dans `functions/partage/devis.js` |
| **Copie et nouvelle version** | `nouvelle_version_devis` (MCP) et « Nouvelle version » (écran) : même numéro, version + 1, **mêmes lignes aux mêmes prix**. « Dupliquer » (écran seulement, `dupliquerDevis` → `copieDeDevis`) : copie les lignes **telles qu'elles étaient** (prix d'achat de l'ancienne ligne), même affaire, mêmes adresses et destinataires. **Aucun outil MCP « dupliquer »**, aucune remise au prix du catalogue d'aujourd'hui | `actions-devis.js`, `editeur-logique.js` (`copieDeDevis`), `metier.js` |
| **Journal d'audit** | Chaque écriture de l'assistant écrit `crm_audit` + `crm_audit_avant` (copie « avant ») et **rend un `operationId`** ; `restaurer_depuis_audit` (aperçu par défaut) défait une modification de brouillon. Profil : **claude-code** seulement (chez un client : le rôle **éditeur**) ; le profil bibliothécaire ne l'a pas. Refuse si le devis n'est plus un brouillon ; une finalisation ou un changement de statut ne se défait pas. Les journaux ne s'effacent jamais (décision du 04/10/2026) | `functions/src/coeur/ecriture.js`, `restaurer.js`, `outils/suppression.js` |
| **Dictionnaire** | `devis_vocabulaire` : un document par expression → un article ; outil `rechercher_article_par_phrase` (décision `utiliser` / `proposer` / `demander`), `enregistrer_reponse_vocabulaire`, écran « Vocabulaire ». Le moteur pur normalise accents, pluriels, mots vides, quantités et prix (`js/modules/devis/vocabulaire.js`, copié en `devis-vocabulaire.js`) : **réutilisable** pour comparer des phrases à des devis | `docs/proposition-dictionnaire-vocabulaire.md` |
| **Ouvrage** | Le mot est un **type d'article** (`TYPE_OUVRAGE = 'ouvrage'`, libellé « Ouvrage »), une famille par défaut « Ouvrages », et environ **150 occurrences** dans 13 fichiers de `js/modules/devis/` (une quarantaine de textes visibles : bordereau, éditeur, menus, options « Cacher les éléments d'ouvrage »). Un ouvrage = des composants (articles) avec un prix de vente forcé facultatif ; **`creer_article` accepte déjà `type: 'ouvrage'` et `composants`** (30 au plus ; un ouvrage ne contient pas un ouvrage) | `articles.js`, `ouvrages.js`, `bordereau.js`, `editeur-ecran.js` |
| **Précédent d'un mot réglable** | `nomBordereau` : « Catalogue », « Bordereau de prix unitaires » ou « Grille tarifaire », liste fermée, dans les réglages du module (`devis_parametres`), lu par `titreBordereau`. Les réglages passent par le navigateur (rôle éditeur), sans règle Firestore dédiée | `articles.js`, `reglages.js` |
| **Précédents de calcul préparé à l'avance** | `onSchedule` existe des deux côtés (`automatisationsInterneHoraire` chez Jérôme, `automatisationsCopieHoraire` chez les clients : une fois par heure pour chaque client) et un déclencheur sur un devis (`devisPdfAuto`, `onDocumentUpdated`). Aucune instance « toujours chaude » (`minInstances`) : seulement `maxInstances` | `functions/src/index.js`, `functions-plateforme/src/index.js` |
| **Lecture de l'historique** | `lister_devis` lit **toute** la collection des devis du client à chaque appel (`donnees.liste(C.devis)`), filtre en mémoire, plafond de 200 lignes rendues, **aucun filtre de date**, résumé sans lignes ni prix d'achat | `functions/src/coeur/lecture.js` (`listerDevis`) |
| **Garantie e-mail** | Aucun outil n'envoie d'e-mail ; `preparer_email` crée un brouillon ; test de verrouillage | `tests/devis-garantie-email.test.js` |

**Surprise utile (leçon du 29/10 : un brief se vérifie contre le code)** : le point « création d'un devis complet avec ses sections en un seul appel » de la décision A est **déjà réalisé** pour l'essentiel. Il reste à (1) le verrouiller par un test qui porte son nom, (2) enrichir la réponse (la structure numérotée, pour que l'assistant n'ait pas à relire le devis), (3) rien d'autre. Ce n'est donc pas un chantier : c'est une ligne dans la PR 1.

## 3. Ce qui manque

1. Les **numéros dans les réponses** (`lire_devis`, création, modification) et un **résolveur** « numéro → identifiant de ligne » côté serveur.
2. Un outil pour **modifier / supprimer / ajouter des lignes par numéro**, en lot, tout ou rien.
3. Un **récapitulatif court** (intitulé, quantité, total hors taxes et TTC), fabriqué par le serveur.
4. Une **annulation** en un appel (aujourd'hui : retrouver l'`operationId`, `restaurer_depuis_audit` en aperçu, puis une deuxième fois : deux allers-retours de 11 à 13 secondes chacun).
5. Un outil **« devis proches »** (lecture de l'historique de 12 mois) et un outil **« partir d'un devis »** qui recalcule au prix du catalogue d'aujourd'hui.
6. Les **ensembles qui reviennent**, préparés à l'avance.
7. Le **mot du métier** (réglage) dans les écrans et les réponses.
8. Les **consignes de comportement** (inviter à structurer, redire une ligne, utiliser l'historique) : elles ne s'écrivent pas en dur (décision du 29/10, voir A-FAIRE, « Consignes stockées et configurables ») ; ce document en fournit le texte de départ (annexe).

## 4. Conception par sujet

### 4.1 Sections et lignes numérotées (décision A)

**Le numéro est un affichage, jamais une donnée stockée.** `numerosDevis` calcule les numéros à chaque lecture, comme l'éditeur et le PDF ; si on insère une ligne, tous les numéros suivants bougent. C'est pourquoi :

- `lire_devis` et la réponse de chaque écriture donnent `numero` pour chaque section et chaque ligne (calculé par la même fonction `numerosDevis`, jamais recopié) **et** l'`id`.
- Tout outil qui vise une ligne accepte **le numéro** (`"1.2"`, ou `"1,2"` ou `"1-2"` : un point, une virgule ou un tiret, pour que la voix ne piège pas) ; le serveur le **résout en identifiant au moment de l'appel**, sur le devis qu'il vient de relire. Il accepte aussi directement un identifiant. Il refuse `"12"` (ambigu : ligne douze ou « un point deux » ?) en disant d'écrire « 1.2 ».
- **Tous les numéros d'un même appel se lisent dans le devis tel qu'il était avant l'appel** (jamais ligne après ligne) : « supprime 1.2 et 1.3 » supprime les deux lignes que l'utilisateur a vues, même si la suppression de 1.2 décale 1.3.
- **Garde `attendu` (Décision prise seule)** : pour modifier ou supprimer, l'assistant recopie dans `attendu` le libellé de la ligne qu'il a lue. Si le serveur trouve une autre ligne à ce numéro (le client a retouché le devis à l'écran entre-temps), il refuse sans rien écrire et répond « La ligne 1.2 est maintenant « … » ». La comparaison est tolérante (les mots de `attendu` doivent figurer dans le libellé, accents, casse et pluriels ignorés, avec le moteur du dictionnaire) : une paraphrase de l'assistant ne bloque pas, une autre ligne oui. Le client ne le voit jamais ; il évite de supprimer la mauvaise ligne.

**Nouvel outil `modifier_lignes_devis`** (écriture, brouillon seulement, profils bibliothécaire et claude-code comme `modifier_devis_brouillon`), un seul appel pour une ou plusieurs opérations (30 au plus), **tout ou rien**, **une seule ligne de journal donc un seul `operationId` à défaire** :

| Opération | Arguments | Effet |
|---|---|---|
| `modifier` | `ligne`, `attendu`, `quantite?`, `prixVente?` (euros hors taxes, comme `creer_devis_brouillon`), `remplacerPar?` (article ou référence) | change la quantité, le prix, ou l'article en gardant la quantité |
| `supprimer` | `ligne`, `attendu` | retire la ligne |
| `ajouter` | `section` (numéro ou titre), `article` ou `reference`, `quantite`, `prixVente?`, `apres?` (numéro d'une ligne) | ajoute une ligne copiée de l'article, à la bonne place (et non plus seulement à la fin de la dernière section) |
| `ajouterSection` | `titre`, `apres?` | nouvelle section |
| `renommerSection` | `section`, `titre` | change le titre |
| `supprimerSection` | `section`, `attendu` | retire la section **et ses lignes** (marquée « changement important ») |

Pas dans la première version : ligne libre (le prix d'achat vient du catalogue, règle du 28/10), sous-section, déplacer une ligne (l'écran sait le faire). L'écran montrera toujours ce qui a été fait, car le devis est le même document.

**Réponse** : `operationId` (pour annuler), pour chaque opération `{ action, ligne: { id, numeroAvant, numeroApres, libelle }, avant, apres, changementImportant }`, la **structure courte** du devis (numéro, intitulé, quantité), `totalHT`, `totalTTC` et `phraseTotaux`. `changementImportant` est calculé par le serveur (constantes dans un seul endroit) : suppression, quantité multipliée ou divisée par 2 ou plus, prix de vente qui bouge de 20 % ou plus, total du devis qui bouge de 20 % ou plus. La consigne de départ dit à l'assistant de **redire la ligne** dans ce cas (annexe) ; voir la question Q3.

**Récapitulatif court.** `lire_devis` garde sa vue complète « côté artisan » (prix d'achat et marge compris : l'assistant ne doit jamais les dire, c'est une consigne de socle déjà prévue). On y ajoute un paramètre `format: 'recapitulatif'` (avec `avecPrix: true` si le client le demande) qui rend : pour chaque section son numéro et son titre, pour chaque ligne son numéro, son intitulé et sa quantité (avec l'unité), **jamais de prix d'achat ni de marge**, puis `phraseTotaux`, une phrase **fabriquée par le serveur** : « Total hors taxes : 1 250,00 €. Total TTC : 1 500,00 €. » Ainsi le mot « HT » ne dépend pas de la bonne volonté de l'assistant, et le vocabulaire (PR « Vocabulaire de l'assistant : hors taxes ») vit à un seul endroit. Les clés techniques (`totalHT`) ne changent pas (tests existants).

**Annulation.** Nouvel outil `annuler_derniere_modification_devis` (`id`) : retrouve la dernière opération d'écriture faite **par l'assistant** sur ce brouillon dans le journal, la défait avec la même logique que `restaurer_depuis_audit`, et dit en une phrase ce qui a été remis (« J'ai remis la ligne 1.2 à 3 prises »). Refuse (et explique) si : le devis n'est plus un brouillon ; la dernière écriture vient de l'écran (« la dernière modification vient de l'écran, je ne l'annule pas »), ou le devis a changé depuis (le même contrôle que `restaurer_depuis_audit`, sans `forcer`) ; il n'y a rien à annuler. **Un seul niveau** au début : annuler deux fois de suite ne remonte pas plus loin (la deuxième réponse dit « déjà annulé »). L'annulation s'écrit elle-même dans le journal (rien ne s'efface). Profils : bibliothécaire et claude-code (la restauration générale reste réservée à claude-code ; cet outil étroit ne défait que des brouillons de devis, à valider par Fable, question Q5).

**Inviter à structurer en sections** (comportement, pas code). Le bon endroit est une **consigne de départ** (annexe) livrée avec le chantier « Consignes stockées et configurables », pas une phrase en dur dans une description d'outil. Les **données** pour proposer viennent déjà de `lire_reglages_devis` (les familles du catalogue du client) ; à partir de la PR 5 elles viennent aussi de l'historique (« tes devis de salle de bain ont d'habitude : Dépose, Plomberie, Carrelage »). Les titres de sections que le client dit lui-même (« Cuisine ») l'emportent sur les familles.

**Test à la voix.** Il ne peut pas se faire en session : protocole manuel (annexe) avec ChatGPT en mode vocal et avec Claude : 6 phrases (« modifie le un point deux », « supprime le deux point un », « le un virgule trois », etc.), on note ce que l'assistant envoie au serveur. Si l'assistant dit « onze » ou « un-deux », le serveur répond « Je n'ai pas compris le numéro : dis-le avec un point (1.2) » et la consigne de départ est ajustée. **Non vérifiable en session.**

### 4.2 Devis qui se ressemblent (décision B)

**Qu'est-ce qu'un devis « de l'historique ».** Un devis (une seule version par `racineId`, la plus récente non vide) dont la date de finalisation, ou de création pour un brouillon, est dans les **12 derniers mois**, tous statuts. Exclus : les brouillons sans aucune ligne, les devis supprimés (ils n'existent plus) et **le devis en cours de construction lui-même**. Les refusés et expirés **comptent comme les autres**. Les brouillons non vides comptent mais **pèsent la moitié** dans les comptages d'ensembles (Décision prise seule : un brouillon abandonné ne doit pas fabriquer une « habitude » ; question Q6). Les versions d'un même devis ne comptent qu'une fois (sinon un devis corrigé trois fois ressemble à trois habitudes).

**Isolation.** Tout passe par `donnees` du client connecté (`avecBase`), comme `lister_devis` : aucun chemin, aucun identifiant de client en argument. À l'intérieur d'un espace, tous les membres voient déjà tous les devis ; l'assistant n'a pas plus de droits que l'écran. Les sorties ne contiennent **jamais** de prix d'achat, de marge, d'adresse ni de téléphone : intitulé, client (nom), date, statut, quantités, total hors taxes.

**(1) Trouver le devis le plus proche : `trouver_devis_proches`** (lecture, tous profils). Argument : `phrase` (« comme le devis de M. Dupont », « une salle de bain », « rénovation cuisine ») et `limite` (3 par défaut). Le serveur lit les devis de la fenêtre (une requête sur la date, pas toute la collection), construit pour chacun un texte (client, objet, nom interne, titres de sections, libellés de lignes) et le compare à la phrase avec **le moteur de normalisation du dictionnaire** (accents, pluriels, mots vides ; pas d'IA, même choix que le dictionnaire : testable et expliqué). Score = recouvrement des mots, pondéré (client et objet plus que libellés de lignes) ; départage par date récente puis identifiant ; rend au plus 3 devis avec `pourquoi` (« client Dupont », « sections : Salle de bain »), leur **structure courte numérotée**, `statut`, `date`, total hors taxes, et deux signaux : `articlesDesactives` (lignes dont l'article n'existe plus ou est désactivé : elles ne seront pas reprises) et `lignesLibres` (lignes sans article : idem). Sous un seuil, rend `[]` et la phrase « Je ne trouve aucun devis qui ressemble ; je pars du catalogue » (repli).

**Partir de lui : `creer_devis_depuis_modele`** (écriture, bibliothécaire et claude-code). Arguments : `modeleId` (le devis choisi), `affaireId?`, `organisationId?`, `personneId?`, comme `creer_devis_brouillon` (le client du **nouveau** devis, jamais celui du modèle) ; `ajustements?` : la liste d'opérations de `modifier_lignes_devis` appliquées tout de suite (« la même chose avec 12 m² au lieu de 8 »), pour que la variante tienne en **un seul appel**. Règles :
  - **Prix du catalogue d'aujourd'hui** : chaque ligne qui a un article actif est recréée par `ligneDepuisArticle(article du jour)` avec l'ancienne quantité ; un ouvrage est re-figé avec la composition du jour. L'ancien prix n'est jamais recopié. (Aujourd'hui « Dupliquer » et « Nouvelle version » gardent l'ancien prix, à raison pour une nouvelle version ; le comportement de l'écran ne change pas dans ce chantier.) Un prix dit autrefois par le client (`prixVente` forcé) n'est pas repris non plus.
  - Les lignes dont l'article est désactivé ou supprimé, et les lignes libres, **ne sont pas copiées** : la réponse les liste dans `aReviser` pour que l'assistant les demande au client.
  - Ni adresses, ni destinataires, ni chantier, ni acomptes, ni remise du modèle : ils appartiennent à l'autre client. La marge, le mode de marge et le taux de TVA viennent des réglages du jour.
  - Réponse : comme `creer_devis_brouillon` plus la **structure numérotée**, `aReviser`, `phraseTotaux`, `operationId`.
  - Tout est ajouté au journal ; annulable (suppression du brouillon récupérable).

**(2) Les ensembles qui reviennent** (calculé à l'avance). Un « ensemble » = un groupe d'au moins 2 articles qui apparaissent **ensemble** dans au moins 3 devis de la fenêtre (3 est un seuil à ajuster sur de vraies données), avec la quantité la plus fréquente de chaque article (médiane) et le nombre de devis concernés. Calcul : un parcours de la fenêtre (les devis de l'historique), comptage de paires puis agrandissement des groupes (méthode simple de co-occurrence, aucune IA), plafonné à 30 ensembles par espace. Un ensemble déjà couvert par un ouvrage du catalogue n'est pas proposé.
  - **Quand** : chaque nuit, par une fonction planifiée (précédent : `onSchedule`), au même endroit chez Jérôme et chez les clients (une fois par client chez eux). Pas à chaque transition de devis : cela toucherait le chemin de finalisation (`coeur/devis.js`) pour un gain faible.
  - **Où** : un document par espace dans une **nouvelle collection `devis_habitudes`**, écrite par le serveur seulement, lisible par les membres. **Elle demande des règles Firestore dans les deux fichiers** (liste d'arrêt, publication par Jérôme et Claude, et à ajouter à la liste exclue du joker). Alternative écartée : ranger le résultat dans `devis_parametres`, que le navigateur d'un éditeur peut écrire (le résultat doit rester propre au serveur, comme `devis_compteurs`).
  - **Comment l'assistant le reçoit sans appel de plus** : la réponse de `rechercher_article_par_phrase` et celle de `trouver_devis_proches` portent un champ `suggestions` (« avec la prise double, tu ajoutes souvent le tableau 2 rangées »), lu dans ce document de quelques kilo-octets. **Aucun appel supplémentaire.** Si le document est absent ou vieux de plus de 7 jours, le champ est vide (jamais de calcul dans la requête : la latence ne bouge pas).
  - **À mesurer d'abord** : la ligne « Lenteur » de `.github/A-FAIRE.md` mesure d'où viennent les 11 à 13 secondes (démarrage à froid, nombre d'appels, lectures). Les PR 4 et 5 ne commencent qu'**après** cette mesure : si le coût vient du nombre d'appels, `trouver_devis_proches` doit se fondre dans `rechercher_article_par_phrase` plutôt que d'être un outil de plus.

**(3) Transformer un ensemble en ouvrage.** Les pièces existent déjà : `creer_article` avec `type: 'ouvrage'` et `composants` (articles actifs, quantités à 3 décimales, un ouvrage ne contient pas un ouvrage, 30 composants au plus). Il manque seulement la **proposition** : quand un ensemble a été utilisé pour la 3e fois, `suggestions` contient `{ ensemble, articles, quantites, devisConcernes }`. L'assistant demande « Veux-tu en faire un [mot du métier] nommé … ? » et, sur « oui », appelle `creer_article`. Pas de nouvel outil. Garde-fous : le nom est proposé par l'assistant puis **validé par le client** (jamais créé sans « oui ») ; un article désactivé interrompt la proposition ; le prix de vente de l'ouvrage vient de ses composants (pas de prix forcé).

**Repli** : historique mince (moins de 5 devis dans la fenêtre) → `suggestions` vide, `trouver_devis_proches` dit « historique trop court » et l'assistant travaille avec le catalogue et le dictionnaire comme aujourd'hui. Un nouveau client n'est jamais bloqué.

### 4.3 Le mot du métier (décision C)

**Mon avis : un réglage à part, pas un mot du dictionnaire.** Le dictionnaire (`devis_vocabulaire`) fait le lien « ce que le client **dit** → tel article » : une règle apprise par questions, relue chaque mois, qui pointe vers **un article**. Le mot « ensemble » ou « ouvrage » est autre chose : un **nom de catégorie** affiché dans les écrans, avec sa grammaire (« un ensemble / des ensembles », « cet ensemble »), valable pour tout l'espace, qui ne pointe vers aucun article. Le ranger dans le dictionnaire mélangerait deux sens du mot « vocabulaire » (règle « un mot = une seule chose », `consignes-ui.md`) et le ferait dépendre de la revue mensuelle. Ce qu'on garde en commun : (a) le **moteur du dictionnaire** lit le mot choisi comme un synonyme du type « ouvrage » (« mets l'ensemble salle de bain » cherche d'abord parmi les articles de type ouvrage) ; (b) l'écran « Vocabulaire » affiche une ligne d'information qui renvoie au réglage.

**Où et comment.** Un champ `motOuvrage` dans les réglages du module (`devis_parametres`, comme `nomBordereau`), choisi dans Réglages > Devis (à côté de « Nom du catalogue de prix »). **Liste fermée avec sa grammaire** : ouvrage, ensemble, forfait, prestation, lot, plus « Autre » (singulier, pluriel, genre masculin ou féminin, validés : 2 à 30 lettres). Une liste fermée évite les phrases fausses (« Cette ensemble ») ; « Autre » contente le métier qui n'est pas dans la liste (Q2). Défaut : « ouvrage » (rien ne change pour les espaces existants, aucune migration, aucun effacement).

**Où il est utilisé.**
  - Les écrans : une fonction pure `motOuvrage(reglages)` rend `{ singulier, pluriel, genre, un, le, cet }` ; les ~40 textes visibles (bordereau, menus de l'éditeur, options « Cacher les éléments d'ouvrage », messages d'erreur du bordereau, vocabulaire) l'appellent. **L'identifiant technique reste `ouvrage`** (type d'article, famille `ouvrage`, noms de variables, `cacherElementsOuvrage`) : le changer casserait les données et les tests. Le **PDF du client** : aujourd'hui il ne contient pas le mot (le texte ne montre que le libellé de la ligne) ; à vérifier au moment de la PR (`document.js`).
  - L'assistant : les **réponses** portent le mot déjà prêt (`typeAffiche: "ensemble"` dans `lister_articles`, `chercher_article`, `rechercher_article_par_phrase`, `lire_devis`, `trouver_devis_proches`, `suggestions`) et `lire_reglages_devis` donne `vocabulaire: { ouvrage: { singulier, pluriel, genre } }`. Les **descriptions** d'outils (texte fixe, écrit une fois pour tous les clients) continuent de dire « ouvrage » (type technique) avec une phrase « le mot affiché à l'utilisateur est donné par `lire_reglages_devis` » ; la règle « dis toujours le mot du client » est la consigne de départ « parle comme le métier du client » (annexe). Raison : une description fixe par client obligerait à relire les réglages à chaque liste d'outils.
  - Le dictionnaire (moteur) : le mot choisi est reconnu comme synonyme ; aucune règle `devis_vocabulaire` n'est créée pour lui.

**Autres métiers** : le même mécanisme pourrait servir pour « article » (« référence »), « devis » (« offre ») ou « bordereau » (déjà réglable). Hors périmètre ; la fonction est écrite pour accepter d'autres mots plus tard (Q2).

## 5. Découpage en PR (ordre conseillé)

Une PR = un sujet, fusionnée dans la journée, jamais deux PR d'outils en parallèle (le compte des outils de `tests/mcp-clients.test.js`, 75 aujourd'hui, et les listes de `js/os/registre.js` sont des sources de conflits). Tailles : **S** moins de 200 lignes, **M** 200 à 500, **L** plus de 500 (code et tests).

| # | PR | Contenu | Taille | Relecture Fable | Liste d'arrêt |
|---|---|---|---|---|---|
| **0** | *(hors chantier)* Mesure de la lenteur ; PR « Vocabulaire de l'assistant : hors taxes » ; PR « Marge : vocabulaire » ; PR « Consignes stockées » | Prérequis ou parallèles : voir « Dépendances » | — | — | — |
| **1** | **Numéros partout et récapitulatif court** | `numero` dans `lire_devis` et les réponses de création/modification ; `lire_devis format: 'recapitulatif'` ; `phraseTotaux` ; structure courte dans la réponse de `creer_devis_brouillon` ; test qui nomme « un devis complet avec ses sections en un appel » | S | **Oui** (serveur) | non |
| **2** | **Modifier les lignes par numéro** | `modifier_lignes_devis` (+ résolveur de numéros, garde `attendu`, `changementImportant`, tout ou rien) ; 76 outils | L | **Oui** (serveur, données) | non |
| **3** | **Annuler la dernière modification** | `annuler_derniere_modification_devis` ; 77 outils | S à M | **Oui** | non |
| **4** | **Devis qui se ressemblent : trouver, partir d'un devis** | `trouver_devis_proches`, `creer_devis_depuis_modele`, module pur `historique` (fenêtre, déduplication, score) ; 79 outils | L | **Oui** | non |
| **5a** | **Ensembles qui reviennent : calcul de nuit** | fonction planifiée (Jérôme **et** clients), collection `devis_habitudes`, règles des deux fichiers | M à L | **Oui** | **Oui** (règles + déploiement `fonctions` chez les clients, droit « Cloud Scheduler » à vérifier) |
| **5b** | **Ensembles qui reviennent : suggestions** | `suggestions` dans `rechercher_article_par_phrase` et `trouver_devis_proches`, proposition « en faire un [mot] » | S à M | **Oui** | non |
| **6** | **Le mot du métier** | réglage `motOuvrage`, `motOuvrage()`, ~40 textes d'écran, `typeAffiche` et `vocabulaire` dans les réponses, synonyme du moteur du dictionnaire ; e2e ordinateur et téléphone, `look-compact` si CSS | M | **Oui** (réglage, serveur, texte qui change partout) | non (pas de règle : `devis_parametres` suit le joker) |
| **7** | **Docs, version, wiki** | la docs va dans la PR de code du même sujet ; une seule PR finale pour la version (`js/os/version.js`, test de version) et le wiki | S | non requise (docs) | non |

**Ordre et raisons.**
1. **1 → 2 → 3** : la fluidité que Jérôme verra tout de suite. La PR 1 est un prérequis des deux autres (les numéros).
2. **6 peut se faire à tout moment** après la PR 1 (elle ne dépend que de `lire_reglages_devis` et du dictionnaire) ; la placer **avant la 4** évite de refaire les textes de `trouver_devis_proches`.
3. **4** après la **mesure de lenteur** (si l'appel de plus coûte trop, on fond l'outil dans `rechercher_article_par_phrase`).
4. **5a → 5b** en dernier : plus de données, plus de risque, une publication de règles.

### Dépendances et conflits entre PR

| Avec | Fichiers qui se touchent | Parade |
|---|---|---|
| **« Marge : vocabulaire »** | descriptions de `creer_devis_brouillon`, `modifier_devis_brouillon`, `lire_reglages_devis` (`ecriture.js` lignes ~168 à 181, `lecture.js` ~180) | Cette PR passe **avant** les PR 1 et 2, ou les PR 1 et 2 **n'ajoutent qu'une phrase à la fin** de ces descriptions. Les outils nouveaux ont leur propre description : aucun conflit |
| **« Vocabulaire : hors taxes »** | tous les textes « HT » des descriptions et des réponses de devis | Même règle. `phraseTotaux` (PR 1) reprend le mot décidé par cette PR : l'attendre ou le paramétrer en une constante |
| **« Consignes stockées »** | la consigne de départ (annexe) | Le texte est livré en annexe ; le chantier des consignes l'intègre. Sans lui, **aucune** des PR 1 à 6 ne met de consigne de comportement en dur (les descriptions restent factuelles) |
| **« Lenteur »** | PR 4, 5 | La mesure précède ; ses leviers (appels groupés) peuvent changer la forme de `trouver_devis_proches` |
| **Autres PR d'outils en cours** | `tests/mcp-clients.test.js` (le compte, ligne 967), `tests/registre-mcp.test.js`, `js/os/registre.js` (`outilsMcp`) | Une PR d'outil à la fois ; chaque PR fusionne `origin/main` avant l'ouverture et garde **toutes** les lignes en cas de conflit |
| **Dictionnaire** | `vocabulaire.js` (normalisation réutilisée par les PR 2, 4, 6) | Importé tel quel, jamais modifié, sauf le synonyme de la PR 6 (un test du dictionnaire le verrouille) |

## 6. Parité `functions/` et `functions-plateforme/`

Règle de `CLAUDE.md` (26/10/2026) : tout ce qui s'ajoute à `functions/` est branché **dans la même PR** chez les clients.

| Élément | Chez Jérôme | Chez les clients | Action |
|---|---|---|---|
| Nouveaux outils MCP (PR 2, 3, 4) et changements de réponse (PR 1, 5b, 6) | `functions/src/mcp/outils/`, `functions/src/coeur/metier.js` | copiés par `scripts/preparer-fonctions.js` (dossiers `coeur`, `mcp`) vers `functions-plateforme/serveur/` | rien à brancher ; **vérifier** que `tests/mcp-clients.test.js` (D1a) compte les mêmes outils |
| Modules purs nouveaux (résolveur de numéros, historique, `motOuvrage`) | `js/modules/devis/` | doivent avoir leur ligne de copie dans `preparer-fonctions.js` (comme `devis-vocabulaire.js`) | une ligne par fichier, un test de copie |
| Fonction planifiée de nuit (PR 5a) | `functions/src/index.js` (`onSchedule`) | `functions-plateforme/src/index.js` : même calcul, **pour chaque client** (modèle `automatisationsCopieHoraire`) | même PR ; droit « Administrateur Cloud Scheduler » du compte de déploiement (déjà noté dans A-FAIRE) ; sans lui la PR écrit « absent chez les clients » + ligne dans A-FAIRE et dans Réglages > Déploiement |
| Règles Firestore `devis_habitudes` (PR 5a) | `firestore.rules` | `firestore.plateforme.rules` | même texte dans les deux, **liste d'arrêt**, publiées ensuite par Claude (workflows « Publier les règles » / « Déploiement plateforme clients » > regles) |
| Réglage `motOuvrage` (PR 6) | `devis_parametres` | idem (même code d'écran) | rien |
| Déploiement | automatique à la fusion | **Jérôme lance** `fonctions`, `mcp`, `hosting` ; puis « Actualiser les outils » dans ChatGPT | à écrire dans la PR |

Avant chaque démonstration chez un client : le contrôle d'écarts de `docs/audit-ecarts-fonctions.md` est à refaire.

## 7. Cas vide et cas d'erreur (par outil et par écran)

| Élément | Cas vide | Cas d'erreur |
|---|---|---|
| `lire_devis` (récapitulatif) | devis sans ligne : « Ce devis n'a encore aucune ligne. » ; total à 0,00 € | devis introuvable : message d'aujourd'hui |
| `modifier_lignes_devis` | liste d'opérations vide : refus « Aucune opération. » ; devis sans ligne : « Le devis n'a pas de ligne 1.2. » avec les numéros qui existent | numéro inconnu ; numéro ambigu (« 12 ») ; `attendu` différent de la ligne (rien écrit, la ligne actuelle est rappelée) ; quantité ≤ 0 ; prix impossible avec le mode de marge ; article désactivé ; devis finalisé (« crée la version suivante ») ; plus de 30 opérations ; une seule opération fausse = **rien d'écrit** |
| `annuler_derniere_modification_devis` | « Rien à annuler sur ce devis. » | dernière écriture venue de l'écran ; devis modifié depuis ; devis plus brouillon ; déjà annulé |
| `trouver_devis_proches` | historique vide ou mince : `devis: []` et « Je ne trouve aucun devis qui ressemble ; je pars du catalogue. » | phrase vide ; plus de devis que le plafond lu (le dit : `tronque: true`) ; lecture impossible (le message d'erreur d'aujourd'hui, jamais de blocage de la conversation) |
| `creer_devis_depuis_modele` | modèle sans ligne reprenable : brouillon vide créé + « Aucune ligne n'a pu être reprise » + `aReviser` | modèle introuvable ; modèle d'un autre espace (impossible : introuvable) ; article désactivé (`aReviser`, pas d'erreur) ; mode de marge impossible |
| `suggestions` (5b) | document absent ou plus vieux de 7 jours : champ vide, aucune erreur | document illisible : champ vide, journal serveur |
| Fonction de nuit (5a) | moins de 5 devis : écrit un document vide daté (« rien à proposer ») | échec d'un client : les autres continuent, l'échec est journalisé, l'ancien document reste |
| Réglage `motOuvrage` (6) | non réglé : « ouvrage » | « Autre » avec un champ vide ou trop long : message sous le champ, valeur réelle gardée ; mot en liste fermée absent du code : retour à « ouvrage » |

## 8. Tests à écrire

Procédure de `CLAUDE.md` : chaque point = une phrase observable, **un test dont le nom commence par son numéro**, une capture quand il y a un écran. Pendant le travail : `npm run test:module devis`, avant l'ouverture `test:rapide` et `test:smoke` ; la suite complète tourne sur GitHub. Jamais de test supprimé ou désactivé pour passer au vert.

| Numéro | Point | Fichier |
|---|---|---|
| **N1** | `lire_devis` donne le même numéro que `numerosDevis` (donc l'éditeur et le PDF) pour chaque section et chaque ligne, avec deux sections, une sous-section ajoutée à l'écran et un saut de page | `tests/devis-mcp.test.js` |
| **N2** | `creer_devis_brouillon` crée un devis de trois sections en **un seul appel** et rend la structure numérotée | idem |
| **N3** | `format: 'recapitulatif'` ne contient jamais prix d'achat, marge ni coefficient (verrou comme `lister_devis`), et `phraseTotaux` dit « hors taxes » et « TTC » | idem |
| **M1** | `"1.2"`, `"1,2"` et `"1-2"` visent la même ligne ; `"12"` est refusé | nouveau `tests/devis-lignes-mcp.test.js` |
| **M2** | modifier la quantité d'une ligne par son numéro ne touche pas les autres et garde l'identifiant de la ligne | idem |
| **M3** | plusieurs opérations dans un appel : numéros lus avant l'appel (« supprime 1.2 et 1.3 » supprime les deux lignes vues) | idem |
| **M4** | tout ou rien : une opération fausse parmi cinq n'écrit rien | idem |
| **M5** | `attendu` différent : refus, rien d'écrit ; paraphrase proche : accepté | idem |
| **M6** | `changementImportant` pour suppression, quantité × 2, prix ± 20 % | idem |
| **M7** | refusé sur un devis finalisé ; un lecteur ne peut pas | idem + `tests/ecriture-outils.test.js` |
| **M8** | un seul `operationId` par appel ; `lire_audit` le montre | idem |
| **U1** | annulation : le devis revient à l'état d'avant, l'annulation est journalisée | `tests/devis-annulation-mcp.test.js` |
| **U2** | refus si la dernière écriture vient de l'écran, si le devis a changé depuis, s'il est finalisé | idem |
| **H1** | un devis des 12 derniers mois est trouvé, un devis de 13 mois non ; un brouillon vide est exclu, un refusé est gardé ; les versions d'une racine comptent une fois | `tests/devis-historique.test.js` (module pur) |
| **H2** | deux espaces : l'historique de l'un n'apparaît jamais chez l'autre | `tests/mcp-clients.test.js` |
| **H3** | `creer_devis_depuis_modele` : prix du catalogue d'aujourd'hui (le prix du catalogue a changé depuis), article désactivé dans `aReviser`, aucune adresse ni destinataire du modèle | `tests/devis-mcp.test.js` |
| **H4** | historique mince : repli sans erreur | idem |
| **E1** | l'ensemble de 3 devis ressort avec la quantité médiane ; deux devis ne suffisent pas ; un brouillon pèse moitié | `tests/devis-historique.test.js` |
| **E2** | règles de `devis_habitudes` : un lecteur lit, un éditeur ne peut ni écrire ni supprimer, un autre client est refusé | `tests/regles.test.js`, `tests/regles-plateforme.test.js` |
| **E3** | document absent ou vieux de plus de 7 jours : `suggestions` vide | `tests/devis-mcp.test.js` |
| **V1** | `motOuvrage` : liste fermée, « Autre » validé (longueur, genre), défaut « ouvrage » | `tests/devis-vocabulaire-metier.test.js` |
| **V2** | aucun texte visible du bordereau et de l'éditeur ne contient « ouvrage » en dur quand le mot est « ensemble » (parcours ordinateur **et** `--project=telephone`, capture) | `tests/e2e/devis-mot-metier.spec.js` |
| **V3** | les réponses de l'assistant portent `typeAffiche` ; l'identifiant `ouvrage` reste inchangé | `tests/devis-mcp.test.js` |
| **V4** | le dictionnaire reconnaît « ensemble » comme synonyme du type ouvrage | `tests/devis-vocabulaire.test.js` |
| **P1** | parité : les fichiers purs nouveaux sont copiés vers `functions/partage/` et `functions-plateforme/serveur/` ; le compte d'outils est identique | `tests/devis-serveur-plateforme.test.js`, `tests/mcp-clients.test.js` |
| **G1** | `tests/devis-garantie-email.test.js` reste vert : aucun nouvel outil n'envoie d'e-mail | existant |
| **Manuel** | test à la voix des numéros (annexe) ; un vrai ChatGPT enchaîne `trouver_devis_proches` puis `creer_devis_depuis_modele` ; la lenteur mesurée avant/après | **non vérifiable en session**, à faire avec Jérôme chez le client démo |

Si du CSS est touché (PR 6) : `npm run test:module look-compact`. Avant d'ouvrir une PR qui change une liste ou un comportement existant : `grep` dans `tests/e2e/` des sélecteurs et des listes concernés (leçon du 29/10).

## 9. Risques

1. **Les numéros bougent** (insertion, suppression, modification à l'écran en même temps). Parade : résolution au moment de l'appel, garde `attendu`, numéros d'un appel lus avant l'appel, relecture du devis avant de modifier.
2. **Course entre l'écran et l'assistant.** Le devis est relu par `metier.js` puis écrit par `ecrire` (qui revérifie le statut mais pas le contenu de `sections`) : une modification d'écran entre les deux serait écrasée. La fenêtre est de quelques millisecondes, mais la PR 2 doit soit ajouter une précondition `modifieLe` à l'écriture, soit faire la résolution et l'écriture dans la même lecture ; **un test de course** est exigé (relecture Fable).
3. **L'assistant ne suit pas les consignes** (ne relit pas, ne redit pas la ligne, dit « HT »). Non vérifiable en session. Parades côté serveur : `attendu`, `changementImportant`, `phraseTotaux` tout prêt, mot du métier dans les réponses.
4. **Lenteur.** Chaque outil de plus est un aller-retour de 11 à 13 secondes. Parades : opérations groupées (`modifier_lignes_devis`, `ajustements` de `creer_devis_depuis_modele`), structure dans la réponse (pas de `lire_devis` après chaque écriture), `suggestions` sans appel, calcul de nuit. Mesurer avant la PR 4.
5. **Historique volumineux.** `lister_devis` lit toute la collection ; l'historique doit lire par date (requête bornée) et plafonner (500 devis ; au-delà, `tronque: true`). À mesurer sur un gros espace. Le coût Firestore reste faible (lectures facturées au document).
6. **Fuite entre clients ou entre devis.** Entre espaces : même mécanisme qu'aujourd'hui (`avecBase`, aucun identifiant de client en argument), test H2. Entre devis d'un même espace : le nouveau devis ne reprend ni adresses ni destinataires du modèle (test H3).
7. **Prix périmés.** Une copie qui garderait l'ancien prix serait fausse sans bruit ; test H3, et la réponse dit « prix du catalogue d'aujourd'hui ».
8. **Fausses habitudes.** Un ensemble vu 3 fois par hasard, ou issu de brouillons abandonnés. Parade : seuil de 3 devis, brouillons à demi-poids, jamais d'ouvrage créé sans « oui » du client, l'ensemble est montré avec ses devis d'origine.
9. **Une fonction de nuit de plus à déployer chez les clients** (droit Cloud Scheduler, déploiement manuel `fonctions`). Si ce n'est pas prêt, la PR 5a dit « absent chez les clients » ; 5b marche alors sans suggestions.
10. **Le mot du métier casse des textes** (accord, texte coupé sur téléphone). Liste fermée avec grammaire, parcours téléphone, `look-compact`.
11. **Descriptions d'outils partagées** (conflits avec « Marge » et « hors taxes »). Section 5, « Dépendances ».
12. **Annulation trop large.** Elle ne défait que la dernière écriture de l'assistant sur un brouillon, jamais celle de l'écran ; elle est elle-même journalisée.
13. **Profil.** Un outil d'annulation pour le profil bibliothécaire élargit ses droits (la restauration générale lui est interdite) : question Q5, Fable regarde.
14. **Rien qui contredise `CLAUDE.md`** : aucun secret ni donnée de client dans le dépôt ; aucune mesure RGPD ajoutée ; aucun journal effacé ; même code chez Jérôme et chez les clients (le module est le même, aucune fonction réservée à l'un).

## 10. Décisions restantes pour Jérôme (questions simples, avec ma recommandation)

- **Q1. Un seul niveau au début.** L'assistant ne crée que « 1, 1.1, 1.2 ». Si tu ajoutes une sous-section à l'écran (1.2.1), il la **lit** et sait la viser, mais n'en crée pas. *Recommandation : oui, comme décidé.*
- **Q2. Quels mots pour « ouvrage » ?** Liste proposée : ouvrage, ensemble, forfait, prestation, lot, plus « Autre » (tu écris le mot, son pluriel, masculin ou féminin). *Recommandation : cette liste, avec « Autre ».* Veux-tu d'autres mots d'avance (poste, article composé…) ?
- **Q3. Quand l'assistant change quelque chose d'important** (suppression, quantité doublée, prix qui bouge de 20 %) : (a) il agit puis redit la ligne, tu peux annuler d'un mot ; (b) il redemande avant d'agir. *Recommandation : (a) pour une ligne, (b) seulement pour supprimer une section entière* (moins d'allers-retours de 12 secondes ; l'annulation existe).
- **Q4. Brouillons non vides dans l'historique.** Tu as dit de n'exclure que les brouillons vides. Je les compte à moitié pour repérer les habitudes. *Recommandation : à moitié.* (Autre choix : tous pareils.)
- **Q5. Annuler : qui peut ?** L'outil d'annulation est étroit (brouillons de devis, dernière modification de l'assistant) : le donner aussi au profil bibliothécaire (l'agent de Jérôme) ou seulement à claude-code (le rôle éditeur chez les clients). *Recommandation : aux deux.*
- **Q6. Seuil des ensembles.** Un ensemble est proposé à partir de 3 devis (à ajuster sur de vraies données). *Recommandation : 3, et le règle-t-on dans les réglages plus tard.*
- **Q7. Ordre.** *Recommandation : 1 → 2 → 3, la PR 6 (mot du métier) quand les PR « Marge » et « hors taxes » sont fusionnées, puis 4 après la mesure de lenteur, puis 5a et 5b.* Tu préfères que le mot du métier passe avant les numéros ?
- **Q8. Les consignes de comportement** (inviter à structurer, redire une ligne, utiliser l'historique) : attendre le chantier « Consignes stockées » (tout est prêt dans l'annexe) ou mettre provisoirement trois phrases courtes dans les descriptions d'outils. *Recommandation : attendre* (ta décision du 29/10 : rien en dur).
- **Q9. « Partir d'un ancien devis » à l'écran aussi ?** Aujourd'hui « Dupliquer » garde les anciens prix. La nouvelle fonction (prix du jour) existerait d'abord pour l'assistant ; tu peux demander plus tard le même bouton à l'écran (« Dupliquer aux prix du jour »), conformément à « d'abord chez Jérôme ». *Recommandation : pas dans ce chantier, une ligne dans `.github/A-FAIRE.md`.*
- **Q10. Boutons d'export** (règle du 27/10) : ce chantier n'ajoute aucun nouveau module, donc aucun nouveau bouton d'export ; `devis_habitudes` est calculée (pas une donnée à exporter), mais entre dans la sauvegarde JSON du module par prudence. *Recommandation : l'exclure de l'export (donnée recalculable).* À confirmer.

## 11. Fonctions intelligentes de la conversation devis

Liste pensée pour être lue par un client non technique (une ligne claire par fonction). **« En service »** veut dire fusionné dans le code ; l'activation chez chaque client se fait avec Jérôme (déploiement). Mise à jour à chaque PR de ce chantier.

| Fonction | État |
|---|---|
| **Votre assistant apprend vos mots du métier** : vous dites « les prises doubles », il sait de quel article du catalogue vous parlez, et il retient vos corrections (dictionnaire de vocabulaire, relu par vous quand vous voulez) | En service |
| **Il vous pose une question plutôt que de deviner** quand il hésite entre deux articles | En service |
| **Il prend le prix que vous donnez** (« la prise à 25 € ») sans toucher à votre prix d'achat | En service |
| **Il ne calcule jamais un total à votre place** : les montants, la TVA et la marge sont calculés par le logiciel | En service |
| **Il vous relit le devis avant de le finaliser** et attend votre accord (aperçu, puis confirmation) | En service |
| **Le brouillon d'e-mail n'est jamais envoyé tout seul** : l'assistant prépare le message, c'est vous qui l'ouvrez et l'envoyez | En service |
| **Le PDF officiel à la demande** : l'assistant vous donne le vrai PDF du devis (lien de 5 minutes), jamais un PDF refait de son côté | En service |
| **Le montant de l'affaire suit vos devis** (acceptés, sinon le dernier proposé), avec le détail au survol | En service |
| **Tout ce que fait l'assistant est écrit dans le journal** et se retrouve | En service |
| **Les devis par sections numérotées** : l'assistant vous propose de ranger le devis en sections (les familles de votre catalogue, puis vos mots) et numérote comme votre écran et votre PDF (1, 1.1, 1.2) | En préparation (PR 1) |
| **« Change la ligne 1.2 »** : il modifie ou retire une ligne par son numéro, et plusieurs lignes d'un coup, avec une vérification pour ne jamais toucher la mauvaise | En préparation (PR 2) |
| **Récapitulatifs courts** : intitulés et quantités, pas de prix sauf si vous le demandez, puis le total hors taxes et TTC | En préparation (PR 1) |
| **« Annule ! »** : il défait sa dernière modification d'un mot | En préparation (PR 3) |
| **« Comme le devis de M. Dupont »** : il retrouve parmi vos devis des 12 derniers mois (acceptés, refusés, envoyés) le plus proche de votre demande et repart de lui, aux prix d'aujourd'hui, en ne vous demandant que ce qui change | Prévu (PR 4) |
| **Il remarque ce qui revient** (« avec une prise double, vous ajoutez souvent le tableau 2 rangées ») et vous le propose | Prévu (PR 5) |
| **Il vous propose de transformer un ensemble qui revient en élément de votre catalogue**, que vous validez d'un mot | Prévu (PR 5) |
| **Il parle votre métier** : « ensemble », « forfait », « prestation » ou « ouvrage », au choix, dans les écrans comme dans la conversation | Prévu (PR 6) |
| **Il dit « hors taxes »**, jamais « HT », à l'oral | En préparation (autre PR) |
| **Vos consignes à l'assistant** : vous réglez (avec Jérôme) la façon dont il se comporte, sans que rien soit caché | En préparation (autre chantier) |

## Annexe A. Textes de départ pour les consignes de l'assistant (à livrer par le chantier « Consignes stockées »)

À intégrer comme **consignes de Jérôme (éditeur)**, modifiables, jamais en dur. Texte court, en « tu » à l'assistant :

1. **Structurer.** « Quand un devis a plus de quatre lignes, ou plusieurs types de travaux, propose (sans l'imposer) de les ranger en sections. Propose les familles du catalogue (lire_reglages_devis) ou les titres des anciens devis proches ; le client valide d'un mot (« oui », « mets plutôt Cuisine et Salle de bain »). Crée le devis complet avec ses sections en un seul appel. »
2. **Numéros.** « Relis le devis (lire_devis) avant de modifier une ligne. Vise les lignes par leur numéro (1.2) et recopie son libellé dans `attendu`. Ne devine jamais un numéro : en cas de doute, relis. »
3. **Redire.** « Quand l'outil répond changementImportant, redis la ligne concernée ('J'ai remis la ligne 1.2, Prise double, à 4') et rappelle que tu peux annuler. »
4. **Récapitulatifs.** « Pas de prix sauf si le client en demande. Dis les intitulés et les quantités, puis lis la phrase des totaux telle que l'outil la donne. Ne parle jamais de prix d'achat ni de marge. »
5. **Historique.** « Quand le client cite un ancien devis ou un type de chantier, appelle trouver_devis_proches avant de partir du catalogue. Ne demande que les variantes. Dis les articles qui ne sont pas repris (aReviser). »
6. **Habitudes.** « Si l'outil donne des suggestions, propose-les une fois, sans insister. Pour en faire un [mot du métier], demande le nom, attends le « oui » du client avant d'appeler creer_article. »
7. **Parler comme le client.** « Utilise le mot de métier du client (lire_reglages_devis, vocabulaire) à la place d'« ouvrage ». »

## Annexe B. Protocole du test à la voix (manuel, avec Jérôme)

Sur le client démo, avec un devis de trois sections et neuf lignes, ChatGPT en mode vocal puis Claude en mode vocal. Dire, une phrase après l'autre : « Lis-moi le devis », « Change le un point deux : mets 4 », « Supprime le deux point un », « Ajoute une prise dans la section deux », « Annule », « Redis le total ». Pour chacune : noter (a) ce que l'assistant a envoyé au serveur (visible dans `lire_audit`), (b) ce qu'il a répondu à voix haute (est-ce que « 1.2 » est lu « un point deux » ?), (c) si la bonne ligne a bougé. Résultat à écrire dans `docs/reprise-prochaine-session.md` (ni nom, ni donnée de client).

## Annexe C. Revue critique par Fable

*(à compléter : voir la section « Relecture de Fable » ci-dessous une fois faite)*
