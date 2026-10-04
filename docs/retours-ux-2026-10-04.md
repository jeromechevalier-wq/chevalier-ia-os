# Retours de test du 04/10/2026 : version 2.0.1 et serveur MCP

Essai fait par Jérôme dans l'appli en ligne (version 2.0.1, PR #18 fusionnée) et dans son Terminal. **Décision de Jérôme : on ne corrige rien pour l'instant** ; ces points sont notés pour en discuter. Les causes ci-dessous ont été relevées dans le code (`js/modules/crm/lanceurs.js`, `fiche-affaire.js`, `logique.js`), pas devinées.

## Ce qui a fonctionné

| Test | Résultat |
|---|---|
| **A3** : une adresse GitHub invalide (« n'importe quoi ») | Refusée avec un message d'erreur |
| **A4** : une adresse GitHub valide | Enregistrée et affichée en lien cliquable |
| **« Créer le GitHub »** | Fenêtre de prompt, copie réussie, **dépôt réellement créé** par Jérôme avec Claude Code |
| **« Créer le répertoire »** | Idem : **dossier réellement créé** et adresse enregistrée |
| **B** : pièce jointe par lien (ajout, ouverture, retrait) | Fonctionne |
| **C** : Claude Code interroge le CRM par le serveur MCP (`claude` lance la connexion, jeton lu dans le Trousseau) | Fonctionne |

## Points d'expérience utilisateur à discuter (rien n'est modifié)

### 1. « Créer le GitHub » disparaît dès que l'adresse est enregistrée

- **Constat** : Jérôme a saisi une adresse puis cliqué sur « Enregistrer » *avant* de créer le dépôt. Le bouton « Créer le GitHub » n'a plus été proposé, alors que le dépôt n'existait pas.
- **Cause (code)** : le bouton n'est affiché que dans le mode « proposition », c'est-à-dire quand le champ est **vide** (l'écran propose alors une adresse suggérée). Une fois une adresse enregistrée, l'écran passe en mode lien + crayon, et le crayon rouvre un champ **sans** bouton de création. Le parcours prévu est : « Créer le GitHub » d'abord (avec l'adresse suggérée), coller le prompt dans Claude Code, puis revenir valider l'adresse. L'écran ne le dit pas, et rien ne vérifie que le dépôt existe.
- **À discuter** : garder le bouton accessible après enregistrement ; prévenir quand une adresse est enregistrée avant la création ; indiquer l'état (« dépôt non vérifié »). Un dépôt privé ne se vérifie pas sans l'API GitHub.

### 2. « Créer le répertoire » : même logique

Le bouton et le champ du nom du dossier n'apparaissent que tant que l'adresse du dossier est vide (`lanceurs.js`, `editerDossier`). Même remarque que pour le GitHub.

### 3. Le lien du dossier s'appelle toujours « Ouvrir le dossier »

- **Constat** : Jérôme s'attendait à voir le nom du dossier (par exemple le nom du projet).
- **Cause (code)** : le libellé est fixe. Le nom du dossier **n'est pas enregistré** (l'écran l'indique : « seule l'adresse du dossier l'est »), et une adresse Drive ne contient qu'un identifiant, pas le nom. Pour le GitHub, l'écran affiche l'adresse (`github.com/compte/nom`), donc le nom du dépôt se voit.
- **À discuter** : enregistrer le nom du dossier au moment de la création ; ou le lire dans Drive par le serveur (accès Drive prévu aux étapes 5 et 7), le nom restant alors à jour si Jérôme renomme le dossier.

### 4. L'historique ne garde pas trace des documents ni des adresses

- **Constat** : ajouter ou retirer une pièce jointe, ajouter ou retirer une adresse GitHub, ajouter ou retirer un dossier : **rien n'apparaît dans l'historique** de l'affaire. Jérôme pense que ça devrait peut-être apparaître.
- **Cause (code)** : ces actions ne font qu'un changement de champ sur l'affaire (`majAffaire`), sans événement dans le fil ; les événements existent pour la création, le changement d'étape, perdue, pause, réouverture, encaissement, activité faite, opposition, e-mail envoyé. Même chose par les outils MCP (`joindre_lien`, `retirer_document`, `modifier_affaire`) : ils laissent une ligne dans l'**audit** (`crm_audit`, restaurable), mais pas dans le **fil** de l'écran.
- **Déjà prévu au plan** (`plan-mcp.md` 5.7, étape 7) : un événement `document_ajoute` pour les pièces jointes. Rien de prévu pour les adresses GitHub et dossier.
- **À discuter** : quels événements (« Document ajouté : libellé », « Document retiré », « Adresse GitHub ajoutée, modifiée ou retirée », idem pour le dossier), contre le risque de bruit dans le fil ; et si le fil doit alors dire qui l'a fait (« via MCP » existe déjà pour ce qui est créé par un agent).

## Décisions et discussion de Jérôme (04/10/2026, après relecture)

- **Points 1 et 2 : ordre des boutons.** Jérôme remarque qu'un humain clique d'instinct sur le **premier** bouton. Sur la ligne GitHub, l'ordre actuel est « Enregistrer » puis « Créer le GitHub » (`lanceurs.js`, lignes 122 et 123) ; il propose l'inverse : **« Créer le GitHub » d'abord, « Enregistrer » ensuite**. Avis de l'assistant : d'accord. Pour le dossier, l'ordre est déjà celui-là (la ligne du nom avec « Créer le répertoire » vient avant la ligne de l'adresse avec « Enregistrer ») : la ligne GitHub est donc **incohérente** avec le dossier. Piste complémentaire : numéroter les deux actions (« 1. Créer le GitHub » puis « 2. Enregistrer l'adresse ») pour montrer l'ordre. **Rien n'est modifié** ; à faire plus tard, avec un test navigateur.
- **Point 3 : lien « Ouvrir le dossier ».** Jérôme est d'accord pour le laisser tel quel.
- **Point 4 : historique.** Jérôme est d'accord pour **ne pas ajouter de bruit** dans l'historique de l'affaire. Il veut en revanche, **si un jour quelque chose disparaît, des outils pour comprendre ce qui s'est passé** : voir la section suivante.

## Comprendre ce qui s'est passé : où est l'audit, et ce qu'il ne couvre pas

**Où Jérôme peut le lire aujourd'hui**
- **Par Claude Code** (serveur MCP) : l'outil `lire_audit`, ouvert à tous les profils. Il filtre par `acteur`, `docId` (le document touché), `operationId`, `depuis` (une date) et `incompletes` (lignes restées « à vérifier »). Chaque ligne dit : quand, quel jeton et quel acteur, via quel canal, quel outil, quelle collection et quel document, quelle action (créer, modifier, supprimer, restaurer), le statut (réussi, échoué, en cours) et les **noms des champs** modifiés. Exemple à demander à Claude Code : « Avec lire_audit, montre-moi les écritures depuis le 2026-10-03. » (Les essais du 03/10 y figurent.)
- **Dans la console Firestore** (Firestore Studio) : les collections `crm_audit` (le journal) et `crm_audit_avant` (les copies, 90 jours), en lecture ou modification manuelle, la console contournant les règles.
- **Dans l'appli** : les règles autorisent la **lecture** du journal, mais **aucun écran ne l'affiche** ; l'appli n'en lit rien.

**Ce que l'audit ne contient pas (limites)**
1. **Il ne couvre que ce qui passe par le serveur MCP** (Claude Code, Hermes). **Ce que Jérôme fait lui-même dans l'appli n'y est pas** : l'écran écrit directement dans la base (aucune référence à `crm_audit` dans `js/`). Si une fiche ou un document disparaît à la suite d'une action dans l'appli, l'audit ne dit rien. Il reste alors les champs `modifiePar` et `modifieLe` de ce qui subsiste, les sauvegardes quotidiennes Google (98 jours) et la récupération à un moment précis (7 jours), qui permettent de **restaurer dans une nouvelle base** puis de comparer.
2. **Le journal ne dit pas *quoi* a disparu, seulement *quel document*** (collection et identifiant) : le contenu (nom, texte) est volontairement dans les copies `crm_audit_avant`, que **seule la console Firestore** permet de lire ; aucun outil MCP ne les affiche (`restaurer_depuis_audit` montre un aperçu des actions, pas le contenu).
3. Les copies disparaissent après 90 jours.
4. **Texte périmé** : la description de `lire_audit` affichée aux clients dit encore « Vide tant qu'aucun outil d'écriture n'est en service », ce qui n'est plus vrai depuis l'étape 4.

**Pistes pour répondre au besoin « comprendre ce qui s'est passé »** (rien n'est décidé ni construit)
- **Un outil de lecture des copies** réservé au profil Claude Code (par exemple `lire_copie_audit` : le contenu d'un document avant et après une opération), pour répondre à « qu'est-ce qui a été supprimé, et quel était son contenu ? » sans passer par la console.
- **Un écran « Journal »** dans l'appli (lecture seule), puisque les règles l'autorisent déjà.
- **Auditer aussi ce que fait l'écran** : plus lourd (l'écran n'a pas le droit d'écrire dans l'audit : il faudrait une fonction côté serveur ou un changement de règles). À peser contre l'usage réel d'un seul utilisateur et les sauvegardes Google déjà actives.
- Corriger le texte périmé de `lire_audit` (point 4 ci-dessus).

## Reste à faire côté test

- Supprimer l'affaire de test « ZZ Essai » si ce n'est pas déjà fait.
- Le téléversement d'un fichier vers Drive (étape 7) n'existe pas encore : seules les pièces jointes **par lien** ont été testées.
