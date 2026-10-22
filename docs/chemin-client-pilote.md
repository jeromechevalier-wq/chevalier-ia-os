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
- **Étapes en direct (22/10/2026)** : Jérôme veut voir les étapes d'une automatisation pendant qu'elle tourne, y compris à l'intérieur d'un workflow long (3 à 4 minutes). « En direct » = le rafraîchissement forcé toutes les 10 secondes **tant que la page est ouverte**, déjà en place dans le module. Le **Logger** (écriture des étapes par le workflow, via la porte) est donc **dans le premier module**, pas repoussé.
- **Qui peut valider chez Jérôme** : ses deux comptes autorisés. L'onglet s'appelle « À valider » et vit dans Automatisations.
- **Ce que fait « appliquer »** : c'est l'affaire du workflow B de chaque automatisation (écrire dans un tableur, envoyer une confirmation…), pas de la plateforme. Elle n'a aucune action qui crée une fiche CRM. Dans la première nuit, « appliquée » ne fait que changer l'état de la proposition.
- **Corriger une proposition : seulement connecté à l'interface**, jamais par SMS ni par e-mail (décision de Jérôme).
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

**Une automatisation = une ligne (phase 3 du chantier 14, décision de principe de Jérôme du 22/10/2026).** Pour le client, un traitement est **une proposition**, affichée avec une frise fixe : Reçu → Proposé → En attente de validation → Validé ou Refusé → Appliqué ou En échec. La frise vient de l'**état de la proposition** (fichier pur des transitions, partagé par l'écran, la fonction de validation et le MCP), pas d'une ligne `steps` : la frise traverse plusieurs exécutions n8n alors que `steps` est rangée sous une seule, et la validation est écrite par la fonction de validation, jamais par n8n. Les exécutions n8n qui travaillent derrière (A proposer, B appliquer, C refus) sont reliées **depuis la proposition** : champ `executions: { proposer, appliquer, refuser }` (numéros donnés par A à `propositions.ajouter` et par B à `propositions.marquerAppliquee`). Rien à lire de plus dans n8n et rien à écrire dans `executions`.

- Ce qui existe déjà du chantier 14 (cahier du 11/10/2026) : sous-collection `executions/<n>/steps` et champ `runGroupId`, vides ; `stepsPlan` des workflows, vide ; règles Firestore déjà fermées ; tests C6/C7 qui garantissent que la copie n'écrase rien. **L'écran ne lit rien de tout cela aujourd'hui** et le Logger n'a jamais été écrit. Le cahier avait mis le numéro commun de côté (« jugé trop compliqué à transmettre ») : le lien depuis la proposition le remplace.
- `runGroupId` reste vide, `steps` sert au **Logger** (décision du 22/10/2026, dans le premier module) : sous-étapes **à l'intérieur** d'une exécution (par exemple « e-mail lu », « contrôle anti-injection ok »), écrites par le workflow via la porte (action à définir, mêmes contrôles que `propositions.ajouter`). Elles s'affichent dans la frise de la ligne, avec le rafraîchissement de 10 secondes. **À trancher dans la PR** : la sous-collection `steps` est rangée sous une exécution, alors qu'un traitement en traverse plusieurs ; Fable propose de recopier au plus 10 étapes dans le document de la proposition (`etapes`) plutôt que de lire `steps` ligne par ligne (le test D3 de `tests/statique.test.js` limite les requêtes de l'écran).
- L'onglet Historique garde une ligne par exécution (inchangé). « À valider » et un onglet « Traitements » listent les propositions, chacune avec sa frise. Une proposition sans exécution liée s'affiche en ligne simple.
- **En direct** : l'écran lit `automatisations_propositions` par écoute Firestore, comme il lit déjà `executions` ; chaque changement d'état arrive sans attendre les 10 secondes. Les détails n8n (durée, erreur de B) arrivent par la copie, avec son délai. Pas de sous-collection lue ligne par ligne (le test D3 de `tests/statique.test.js` limite les requêtes de l'écran). Si des sous-étapes doivent s'afficher un jour, elles seront copiées dans le document de la proposition (`etapes`, 10 au plus).
- Le signal « validée mais pas appliquée depuis 30 minutes » est calculé à l'écran, comme « À vérifier ».
- Documents à mettre à jour dans la PR : `docs/automatisations-n8n.md`, partie 9.

## Règles de création des workflows (sinon le module ne les voit pas)

Valables pour A, B, C et tout workflow du chemin (`docs/automatisations-n8n.md`, partie 10) :
- **Étiquette n8n** : `interne` (workflows de Jérôme) ou `client-<identifiant>` (identifiant de 17 caractères au plus).
- **Nom** : commence par `interne-` ou `client-<identifiant>-` (exigé depuis le 18/10/2026).
- **Credential de la porte** : « Clé n8n - interne » (exigé pour Jérôme) ou « Clé n8n - <identifiant> » (pas exigé chez un client, mais s'il y en a un il doit être le bon). Le nom est comparé sans tenir compte des majuscules, accents, espaces et types de tiret ; l'identifiant du credential passe avant son nom.
- Un signe manquant ou qui en désigne un autre : le workflow n'est **jamais copié** et apparaît dans « À vérifier » avec la raison. Vérifié le 22/10/2026 dans le n8n de Jérôme (noms seulement, jamais les secrets) : le credential s'appelle « Clé n8n - Interne » (type en-tête HTTP), ce qui correspond à la règle (la casse ne compte pas). Il n'existe pas encore de clé pour un client.
- Un workflow du chemin qui ne respecte pas ces règles ne ferait donc pas partie de la ligne unique : à tester dès le premier workflow.

## La porte d'entrée (existe déjà)

Pas de nouvelle porte ni de jeton maison : la porte de `docs/porte-cles.md` fait déjà le travail (clé par propriétaire dont seule l'empreinte est stockée, module actif vérifié, intégrité du workflow, validation stricte, création sans écrasement). Elle tourne pour la base 1. À faire :
- pour Chevalier IA OS : ajouter `automatisations` dans `MODULES_DE_LA_PORTE` (`scripts/porte/porte.js:18`) **et** dans la liste `modulesActifs` de `functions/src/porte.js:50` (écrite en dur à `['veille']`), avec les actions `propositions.ajouter`, `propositions.lireValidees`, `propositions.marquerAppliquee` (et `propositions.decider` pour le SMS, voir plus bas) ;
- pour la plateforme (plus tard) : assembler la porte de la base 2 (`docs/porte-cles.md`, partie 6), avec sa propre clé par client, un compte de service dédié et une réécriture d'adresse.

**Forme d'une proposition** (schéma fixe, aucun objet libre) : `type` (libellé court écrit par le workflow, 40 caractères, sans liste fermée : la plateforme ne connaît aucun objet métier), `titre` (120 caractères), `resume` (2 000), `champs` (40 au plus, chacun `{nom, valeur}`), `lien` facultatif, `idsur`. Taille limitée à 256 Ko ; champs inconnus et secrets refusés par la porte.

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
- Aucune règle nouvelle pour `steps` et `runGroupId` (déjà fermés aux navigateurs, test J3). Tests à adapter dans la PR 1 : C6 et C7 de `tests/automatisations-synchro.test.js` seulement si la copie remplit `runGroupId` ; D3 de `tests/statique.test.js` pour la requête de l'écran « À valider » (un seul `where ==`, pas d'`orderBy`).
- Les déploiements de la plateforme sont manuels (choix `regles`, `fonctions`, `hosting`, `mcp`, `espace` du workflow ; `tout` = page et règles seulement, jamais les fonctions) ; rien n'est utilisable par un client avant.
- La copie de l'historique ne garde jamais le contenu des données (test « D. Aucun contenu, aucune définition, aucun secret dans Firebase » de `tests/automatisations-synchro.test.js`). Une proposition, elle, contient par nature des noms et des adresses : le dire dans la doc du module. Elle passe par la porte, comme `veille_contenus`.

## Où en est la construction (nuit du 22 au 23/10/2026, version 2.24.0)

| Sujet | PR | État |
|---|---|---|
| Documents du plan | 187 | fusionnée |
| États et transitions (fichier pur) | 188 | fusionnée |
| Actions de la porte (`propositions.*`) | 189 | fusionnée |
| Fonction `automatisationsDecider` + 5 outils MCP | 190 | fusionnée |
| Écran « À valider » | 191 | fusionnée (voir le rapport de reprise) |
| Règles Firestore (liste d'arrêt) | voir `docs/reprise-prochaine-session.md` | à fusionner par Jérôme |

**Pas fait** : le Logger (point de conception à trancher, `automatisations-n8n.md` partie 9), les canaux e-mail et SMS, la porte de la base 2 (plateforme clients), le workflow B réel (rien n'est créé dans un CRM : « appliquée » change seulement l'état), les KPI. **Rien n'est utilisable par un client avant** la publication des règles et les déploiements manuels.

## Découpage proposé en PR

1. Code Chevalier IA OS : états et transitions (fichier pur, partagé par l'écran et le MCP), action de la porte, écran « À valider », fonction de validation, outils MCP, frise d'étapes dérivée de l'état (une proposition = une ligne). Fusionnable la nuit.
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
