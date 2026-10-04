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

## Reste à faire côté test

- Supprimer l'affaire de test « ZZ Essai » si ce n'est pas déjà fait.
- Le téléversement d'un fichier vers Drive (étape 7) n'existe pas encore : seules les pièces jointes **par lien** ont été testées.
