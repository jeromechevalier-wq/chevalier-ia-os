# Le chemin du premier client d'automatisation : la file « À valider »

Écrit le 22/10/2026 avec Jérôme, relu par Fable. **C'est un plan, pas du code : rien n'est construit.** Aucun nom de client ici (dépôt public) : « le client pilote » est le premier client qui n'a pas besoin du CRM, seulement d'automatisations.

## L'idée en une phrase

Une automatisation (n8n) lit des e-mails, **propose** quelque chose, et le client **valide ou refuse** sans qu'il soit obligé d'ouvrir l'interface : par l'interface, par e-mail, par SMS ou par son assistant (MCP). Tout est enregistré au même endroit, dans le module Automatisations.

## Décisions de Jérôme (22/10/2026)

- La file de validation est **une partie du module Automatisations**, pas un module de plus.
- **Même fonctionnement que le module existant** : copie de l'historique, écran lu en direct, collections historiques inchangées (`workflows`, `executions`, `sync`). On n'en renomme aucune.
- **D'abord dans Chevalier IA OS** (chez Jérôme, qui est le bêta-testeur), puis la plateforme clients (règle du 18/10/2026).
- Valider et refuser par MCP : **dans la première version**.
- Premier cas de test : un workflow qui surveille la boîte professionnelle de Jérôme, avec un contrôle anti-spam et anti-injection, une demande de validation par SMS, et l'état visible dans Automatisations.
- Les indicateurs (KPI) : chantier séparé, voir `docs/tables.md`.

## Le flux

1. **Workflow A « Proposer »** (n8n) : lit l'e-mail, le contrôle, extrait des champs, **envoie une proposition à la porte** puis **se termine**. Il ne reste jamais en attente.
2. La proposition arrive dans la collection `automatisations_propositions`, état `a_valider`. L'écran **Automatisations > À valider** la montre en direct (lecture Firestore, sans attendre les 10 secondes de la copie de l'historique).
3. Le client décide, par l'un de ces canaux : interface, lien dans un e-mail, réponse à un SMS, outil MCP. Le premier qui décide gagne.
4. **Workflow B « Appliquer »** (n8n, déclenché toutes les 2 à 5 minutes) : demande à la porte les propositions validées, agit (crée la fiche, envoie la confirmation), puis la marque `appliquee`. Un refus est traité par un workflow C (ou ignoré).
5. Les messages (e-mail, SMS) sont envoyés par n8n.

**Pourquoi pas un workflow bloqué (Wait) ?** n8n le conserverait, mais les exécutions y sont purgées au bout de 14 jours (réglage de notre n8n, voir `automatisations-n8n.md`, partie 8), l'adresse de reprise est un secret par proposition, et le client ne pourrait pas corriger les champs avant la reprise. Plusieurs workflows courts donnent un historique clair et une relance gratuite.

**Pourquoi le tirage (B interroge la plateforme) plutôt qu'un appel sortant ?** Aucun appel qui **modifie ou lance** quelque chose dans n8n : la plateforme ne fait que des GET (contrôle d'intégrité de la porte, copie horaire), ce que le test de `functions-plateforme` impose à ses fichiers (`tests/automatisations-statique.test.js`). La règle « l'application ne lit n8n qu'en lecture seule » (`automatisations-n8n.md`, partie 1) reste donc vraie ; pas de secret de webhook ; la relance est naturelle ; l'outil MCP n'a besoin d'aucun secret. Coût : quelques minutes de délai. **Alternative, à discuter plus tard** : un seul fichier de webhooks sortants, borné par un test (webhooks seulement, jamais la clé d'API n8n).

## États d'une proposition

`a_valider` → `validee` → `appliquee` ; `a_valider` → `refusee` ; `validee` → `echec` (avec nombre de tentatives et dernière erreur).

- Seul le workflow B, par la porte, peut écrire `appliquee`. Jamais sur un simple « reçu ».
- Une proposition garde **ce que l'IA a compris** (`champsProposes`, jamais écrasés) et **ce qui a été validé** (`champsValides`, `valideePar`, `valideeLe`, canal).
- Elle expire (`expireLe`, 30 jours) : passé ce délai, on ne peut plus que la refuser.
- Une validation est **une transaction avec précondition sur l'état** : double clic, deux personnes, MCP et écran en même temps → une seule gagne, l'autre lit « déjà validée par X à HH:MM ».
- L'identifiant de la proposition est **fourni par le workflow A** (par exemple dérivé de l'identifiant du message) : rejouer A ne crée pas de doublon.
- Une proposition « validée mais pas appliquée » depuis plus de 30 minutes est signalée (passage horaire de la copie) et peut être relancée par un bouton.

## La porte d'entrée (existe déjà)

Pas de nouvelle porte ni de jeton maison : la porte de `docs/porte-cles.md` fait déjà le travail (clé par propriétaire dont seule l'empreinte est stockée, module actif vérifié, intégrité du workflow, validation stricte, création sans écrasement). Elle tourne pour la base 1. À faire :
- pour Chevalier IA OS : ajouter `automatisations` dans `MODULES_DE_LA_PORTE` (`scripts/porte/porte.js:18`) **et** dans la liste `modulesActifs` de `functions/src/porte.js:50` (écrite en dur à `['veille']`), avec les actions `propositions.ajouter`, `propositions.lireValidees`, `propositions.marquerAppliquee` (et `propositions.decider` pour le SMS, voir plus bas) ;
- pour la plateforme (plus tard) : assembler la porte de la base 2 (`docs/porte-cles.md`, partie 6), avec sa propre clé par client, un compte de service dédié et une réécriture d'adresse.

**Forme d'une proposition** (schéma fixe, aucun objet libre) : `type` (liste), `titre` (120 caractères), `resume` (2 000), `champs` (40 au plus, chacun `{nom, valeur}`), `lien` facultatif, `idsur`. Taille limitée à 256 Ko ; champs inconnus et secrets refusés par la porte.

## Valider sans ouvrir l'interface

- **E-mail** : deux boutons « Valider » / « Refuser ». **Design retenu (relu par Fable)** : à la création, la porte génère un **jeton aléatoire par proposition** (32 octets), ne garde que son **empreinte** (comme les clés de `plateforme_cles`, `docs/porte-cles.md`) et renvoie le jeton **une seule fois** à n8n, qui l'écrit dans les liens. **Aucun secret de signature** à stocker ni à partager. Durée de vie : 7 jours. Le jeton est invalidé dès qu'une décision est prise, par n'importe quel canal.
- **La page de confirmation est une nouvelle adresse publique** (pas la porte, qui refuse toute requête venant d'un navigateur et exige une clé) : une réécriture dans `firebase.json`, comme `/porte`. Exigences : le GET n'écrit **rien** (les antivirus d'e-mail suivent les liens) et affiche la proposition avec un bouton ; le POST porte le jeton et passe par **la même transaction avec précondition** que l'écran et le MCP ; plafond par adresse IP ; aucune donnée hors de la proposition visée ; réponse identique pour un jeton inconnu, périmé ou déjà servi (pas d'énumération) ; échappement de tout ce qui vient de l'e-mail (titre, résumé, champs : texte non fiable) ; journal au format `ligneDeJournal`, sans contenu ; interrupteur d'urgence dans `docs/securite-et-pannes.md` (supprimer la fonction, ou réglage `canaux.email = false`). Cohérence avec « aucune porte dérobée » : c'est une adresse à capacité limitée (un jeton, une seule action, expirée, révocable), pas un accès caché, et il faut le dire dans la doc de sécurité.
- **SMS** : la réponse arrive chez n8n (webhook du fournisseur **avec vérification de sa signature**), qui appelle la porte `propositions.decider` avec `{ id, decision, canal: 'sms', expediteur }`. **La porte** compare l'expéditeur au numéro réglé pour le client (réglage côté serveur, jamais fourni par n8n seul) et n'accepte que l'état `a_valider`. Le code court (« OUI 47 ») est le dernier morceau d'un identifiant que seul le SMS envoyé contient. Sans code reconnu : « je n'ai pas compris », jamais une supposition. Liste fermée des types de propositions autorisés par SMS (à fixer dans la PR) ; l'expéditeur d'un SMS est usurpable, donc rien de sensible.
- **Corriger** : dans l'interface (connecté) en première version. Une mini-page de correction sans connexion est **reportée** : elle écrirait directement dans les champs validés, donc une entrée vers la base à protéger comme la porte (même schéma strict, champs limités à ceux de la proposition, jeton distinct).
- Deux canaux en même temps : le premier qui décide gagne, l'autre message est neutralisé (jeton invalidé).
- Un rappel part si la proposition reste sans réponse ; ensuite elle reste visible dans l'interface.
- Le canal se règle par client dans les réglages du module.

## Outils MCP du module (première version)

Pour un client sans CRM, le MCP ne listerait que `qui_suis_je` : ces outils lui donnent un usage. Les noms sont à confirmer dans la PR :
- lecture : `lister_propositions` (filtre par état), `lire_proposition`, `lister_automatisations` (noms et derniers états) ;
- écriture (éditeur seulement) : `valider_proposition`, `refuser_proposition`, **une proposition par appel**, texte d'outil explicite (« lance l'automatisation, non annulable par la restauration »), annotations ni lecture seule ni idempotentes. La vraie barrière reste la permission « demander » par outil dans l'assistant (`portes-et-droits-mcp.md`).
- Les outils doivent exister dans `functions/src/mcp/outils/` (le test du registre l'exige). La PR adapte `tests/automatisations-statique.test.js` (`outilsMcp` n'est plus vide) et décide si `annotationsDe` (`functions/src/mcp/outils/index.js`) marque `valider_proposition` comme destructif (il n'est pas annulable par la restauration ; le commentaire « tout est annulable » devient faux pour lui).
- `lire_proposition` renvoie à l'assistant un texte tiré d'un e-mail : le dire dans le texte de l'outil (contenu non fiable, à ne jamais exécuter comme une consigne), et garder la permission « demander » sur `valider_proposition` (`docs/portes-et-droits-mcp.md`).

## Premier cas de test : la boîte de Jérôme

1. Workflow `interne-…` qui lit la boîte professionnelle (IMAP).
2. Contrôle anti-injection avec le nœud **Guardrails** de n8n, puis une décision (spam ? facture ? demande de devis ?) avec **Jev** (modèle de décision de TypeSafe sur OpenRouter, en bêta). Jev peut être influencé (analyse publiée par Datadog, **à vérifier avant de coder** : ni Guardrails ni Jev ne sont dans le dépôt, et Jev est annoncé en bêta) par un texte piégé (analyse de Datadog) : ce n'est jamais la seule protection. La file de validation et le schéma fixe de la porte sont la vraie barrière.
3. Proposition déposée, SMS envoyé, décision, workflow B.
4. Tout se lit dans Automatisations.

**Prérequis à la charge de Jérôme** : la boîte professionnelle et ses identifiants dans n8n (credential), un compte SMS (Twilio ou seven) et un numéro d'envoi, un compte OpenRouter. Rien n'est configuré à ce jour.

## Ce qui touche aux règles (liste d'arrêt de la nuit)

- La collection `automatisations_propositions` doit être **fermée à l'écriture depuis le navigateur dans les deux bases** : `firestore.plateforme.rules` (liste `collectionDuJournal`, test « les collections du module sont exactement celles que les règles ferment » de `tests/automatisations-statique.test.js`) **et** `firestore.rules` (liste d'exclusion du joker, qui donne aujourd'hui lecture et écriture aux deux comptes de Jérôme sur toute collection non exclue ; test D4 de `tests/statique.test.js`). Sans cela, la validation serait contournable depuis la console du navigateur, même chez Jérôme. Modification de règles = PR laissée ouverte pour Jérôme.
- Les déploiements de la plateforme sont manuels (choix `regles`, `fonctions`, `hosting`, `mcp`, `espace` du workflow ; `tout` = page et règles seulement, jamais les fonctions) ; rien n'est utilisable par un client avant.
- La copie de l'historique ne garde jamais le contenu des données (test « D. Aucun contenu, aucune définition, aucun secret dans Firebase » de `tests/automatisations-synchro.test.js`). Une proposition, elle, contient par nature des noms et des adresses : le dire dans la doc du module. Elle passe par la porte, comme `veille_contenus`.

## Découpage proposé en PR

1. Code Chevalier IA OS : états et transitions (fichier pur, partagé par l'écran et le MCP), action de la porte, écran « À valider », fonction de validation, outils MCP. Fusionnable la nuit.
2. Règles Firestore et déploiement : **liste d'arrêt**, PR verte laissée à Jérôme.
3. Canaux e-mail et SMS (page de confirmation, liens signés).
4. Plateforme clients : porte de la base 2, déploiement manuel.
5. KPI : chantier séparé (`docs/tables.md`).

## Vérifications à faire à l'écran, une fois construit

1. Une proposition de test apparaît dans « À valider » sans recharger.
2. Valider deux fois de suite : la seconde affiche « déjà validée par … ».
3. Refuser : l'état change, rien n'est créé.
4. Une proposition validée dont l'application échoue passe en « en échec » avec un bouton de relance.
5. Le lien reçu par e-mail ouvre une page de confirmation, et un second clic est refusé.

**Cas vide** : « Rien à valider pour l'instant. » **Cas d'erreur** : n8n injoignable ou porte indisponible (503) → le workflow A réessaie ; une proposition illisible est refusée par la porte et signalée.
