# Rendez-vous : les SMS par ClickSend (envoi direct)

Écrit le 14/11/2026, remplace l'ancienne version qui passait par n8n. Module « Rendez-vous » (`rdv`) : la plateforme décide de tout (qui reçoit quoi, quand, avec quel texte exact) et **le serveur envoie lui-même par l'API de ClickSend**. Plus de workflow n8n pour ce module. Aucun secret, aucun numéro réel, aucun nom réel dans ce fichier (`<client>` = l'identifiant d'un client, donné hors dépôt).

## Le principe en une image

```
Écran ──clic "Envoyer"──► fonction rdvEnvoyer ──note la demande──► Firestore (rdv_rendezvous.envoiDemandeLe)
                                   │
                                   └─ « tire maintenant » ──► coeur/sms-direct.js
Toutes les 15 minutes ─► fonction rdvEnvoiPlanifie ──────────────► coeur/sms-direct.js (filet de sécurité)

coeur/sms-direct.js ──porte rdv.aEnvoyer──► [SMS dus : texte exact, numéro, messageId]  (chaque SMS est RÉSERVÉ 15 minutes)
coeur/sms-direct.js ──API ClickSend──► envoie, un SMS par appel
coeur/sms-direct.js ──porte rdv.confirmerEnvoi──► « envoyé » (ou « échec »), rejouable

Participant répond ──ClickSend, règle « SMS entrants »──► fonction rdvReponseSms ──porte rdv.enregistrerReponse──► Firestore
```

Un seul chemin d'envoi : la porte. Un seul fichier parle à ClickSend : `functions/src/coeur/sms-direct.js` (un test le borne). Chez les clients, le même code est copié (`functions-plateforme/serveur/`), avec une connexion PAR CLIENT.

## La connexion ClickSend (une fois par espace)

Elle vit dans **Secret Manager**, jamais dans le dépôt, jamais dans Firestore (les réglages du module sont lisibles par le navigateur de tous les éditeurs, et le journal garde les valeurs pour toujours).

| Espace | Projet | Nom du secret |
|---|---|---|
| Jérôme | `chevalier-ia-os` | `CLICKSEND_RDV` |
| Un client | `chevalier-ia-app` | `CLICKSEND_RDV_<client>` |

Contenu du secret (une seule valeur, au format JSON) :

```json
{ "identifiant": "<nom d'utilisateur ClickSend>", "cle": "<clé d'API ClickSend>", "jeton": "<texte aléatoire de 24 à 100 caractères : lettres, chiffres, _ et ->", "expediteur": "<facultatif : nom d'expéditeur enregistré chez ClickSend (11 caractères au plus) ou numéro>" }
```

1. Le jeton est le « mot de passe » de l'adresse des réponses. Pour en fabriquer un, dans le Terminal :

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

2. Créer le secret : https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os (chez un client : `project=chevalier-ia-app`) > « Créer un secret » > nom ci-dessus > coller le JSON > Créer.
3. Donner « Accesseur de secrets » (Secret Manager Secret Accessor) au compte de service qui exécute les fonctions : `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com` chez Jérôme ; chez un client, le compte qui lit déjà les secrets du client (voir `docs/deploiement-client.md`).
4. Le bouton « Envoyer » s'active tout seul (la fonction `rdvEtat` répond « branché » quand le secret existe et est lisible). Attendre une minute au plus (cache de 60 secondes).

### Depuis l'écran (Jérôme seul) : Réglages > Rendez-vous > « Connexion SMS (ClickSend) »
C'est le chemin recommandé : l'écran range la connexion dans le même secret, sans passer par la console, et vérifie la clé auprès de ClickSend avant de l'enregistrer (une mauvaise clé n'est jamais rangée).
- **Qui** : seul le compte de Jérôme (e-mail Google vérifié). Le contrôle est fait par le SERVEUR à chaque appel (`rdvConnexionSms`) : un éditeur d'un client, un lecteur, le compte d'assistant ou un jeton de bot reçoivent « Action non autorisée. ». Les autres comptes voient seulement l'état (« branché » ou non), sans champ de saisie.
- **Où** : chez Jérôme dans son espace ; chez un client, dans l'écran Réglages de CE client (le serveur range la connexion dans `CLICKSEND_RDV_<client>`, jamais dans le secret d'un autre). **Chez un client, la carte de saisie n'apparaît que si ton compte est aussi éditeur de l'espace de ce client** (l'écran lit l'état par le même contrôle d'accès que « Envoyer ») ; sinon elle dit « réglée par l'administrateur de la plateforme ». Le serveur, lui, n'exige que ton identité.
- **Délai** : le serveur garde la connexion en mémoire 60 secondes au plus par instance : après un enregistrement, « Envoyer » peut mettre jusqu'à une minute à s'activer (l'écran redemande l'état tout de suite puis encore une fois après 65 secondes), et après un changement d'adresse l'ancienne peut encore être acceptée pendant ce temps (chaque fonction a sa propre mémoire de 60 secondes).
- **Droits à donner une fois (version prudente, la seule recommandée)** : le compte qui exécute les fonctions ne doit pouvoir toucher QU'À ce secret. (1) Créer le secret à la main : https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os (chez un client : `project=chevalier-ia-app`) > « Créer un secret » > nom `CLICKSEND_RDV` (chez un client `CLICKSEND_RDV_<client>`) > valeur provisoire quelconque (par exemple `a`) > Créer. (2) Ouvrir ce secret > onglet « Autorisations » > « Accorder l'accès » > compte `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com` (chez un client : le compte qui lit déjà les secrets du client, voir `docs/deploiement-client.md`) > rôles **Accesseur de secrets** et **Ajouteur de versions de secret** (Secret Manager Secret Version Adder) > Enregistrer. **Ne pas** donner « Administrateur Secret Manager » au niveau du projet : ce compte exécute aussi des fonctions publiques, il pourrait alors lire, écrire et supprimer tous les secrets du projet (MCP, n8n, OAuth). Sans ces droits, l'écran répond « Le serveur n'a pas le droit d'enregistrer la connexion » et rien n'est perdu. Les anciennes versions du secret (anciennes clés) restent actives : après un changement de clé, désactiver les anciennes versions dans la console.
- **Ce que fait « Enregistrer la connexion »** : vérifie l'identifiant et la clé auprès de ClickSend (lecture du compte, aucun SMS, aucun frais), range `{ identifiant, clé, jeton, expéditeur }` dans le secret, vide les champs. **La clé n'est jamais affichée, jamais gardée dans la page, jamais journalisée.** Le jeton de l'adresse des réponses est fabriqué par le serveur (aléatoire) et gardé quand on remplace la clé : la règle de ClickSend reste valable.
- **Adresse des réponses** : affichée à l'enregistrement, puis seulement sur demande (« Afficher l'adresse des réponses » : le serveur ne la rend qu'à ce moment-là) ; « Changer l'adresse des réponses » fabrique un nouveau jeton (il faut alors recoller la nouvelle adresse dans ClickSend). Format : `https://europe-west9-chevalier-ia-os.cloudfunctions.net/rdvReponseSms/<jeton>` (chez un client : `https://europe-west9-chevalier-ia-app.cloudfunctions.net/rdvReponseSms/<client>/<jeton>`). Si cette adresse ne répond pas, copier l'adresse de la fonction dans la console Firebase et y ajouter `/<jeton>` (ou `/<client>/<jeton>`).
- **Secours** : la création du secret à la main (étapes ci-dessus) reste valable et donne exactement le même résultat.

## L'adresse des réponses (une fois par espace)

ClickSend doit appeler notre serveur quand quelqu'un répond. Dans la console Firebase > Functions, ouvrir `rdvReponseSms` et copier son adresse. L'adresse complète à donner à ClickSend est :
- chez Jérôme : `<adresse de la fonction>/<jeton>` ;
- chez un client : `<adresse de la fonction>/<client>/<jeton>`.

Dans ClickSend, créer une règle « SMS entrants » (Inbound SMS rule) qui envoie chaque réponse vers cette adresse (action « URL », méthode POST). ClickSend ne signe pas ses envois : **la seule protection est le jeton**. Ne jamais le copier ailleurs que dans le secret et dans cette règle. Tout appel avec un mauvais jeton, un mauvais chemin ou une autre méthode reçoit le même 404, sans rien dire.

## Tester avec le vrai ClickSend (dans cet ordre)

1. Réglages > Rendez-vous : « Numéro des SMS de test » = TON mobile. Nom de l'entreprise réglé.
2. Créer un rendez-vous, le marquer comme **test**, un participant (n'importe quel nom), « Envoyer les propositions » : le SMS arrive sur TON numéro de test seulement (un rendez-vous de test n'écrit jamais au participant).
3. Répondre « 1 » : la fiche montre la réponse et la coche. Répondre « STOP » : plus aucun SMS ne part vers ce numéro et la professionnelle est prévenue.
4. Seulement après : un vrai rendez-vous. **Jamais d'envoi à un tiers avant d'avoir vu un SMS arriver sur le numéro de test.**
5. Si « Envoyer » reste grisé : le secret est absent, mal écrit (JSON invalide, jeton trop court) ou illisible par le compte de service ; le journal des fonctions ne dit rien de plus à dessein.
6. **Pannes et refus** (ce que fait le serveur ; chaque SMS est traité SEUL) :
   - **problème de compte** : clé refusée (401/403), crédit épuisé, limitation (429), expéditeur non enregistré (`INVALID_SENDER_ID`), compte non activé, identifiants manquants, ClickSend indisponible (502/503 : rien n'est parti) : le tir **s'arrête**, tous les SMS sont **libérés sans compter d'essai** (`rdv.libererEnvoi`) et repartent au tir suivant, une fois le problème réglé. Rien n'est abandonné pour un réglage à corriger ;
   - **refus propre à un SMS** (mauvais numéro `INVALID_RECIPIENT`, pays fermé `COUNTRY_NOT_ENABLED`, statut inconnu, autre refus 4xx) : échec de CE SMS seulement, compté ; il n'est pas redemandé avant **10 minutes** (trois clics rapides ne brûlent donc jamais les trois essais) ; au troisième échec il est abandonné et la professionnelle est alertée. Il ne bloque jamais les autres SMS ;
   - ClickSend accepte (`SUCCESS`, `QUEUED` ou `SCHEDULED`) : le SMS est « envoyé » ;
   - ClickSend en panne avec doute (500 ou 504 : la passerelle a peut-être accepté avant d'expirer) : le tir s'arrête ; le SMS en cours reste **réservé** et compte comme douteux (3 tentatives au plus, puis abandon avec alerte, jamais de renvoi sans fin) ; les autres sont libérés sans essai ;
   - doute réel (réseau coupé, délai de 15 secondes dépassé, réponse 200 illisible) : rien n'est confirmé ni libéré ; la réservation de 15 minutes expire puis le SMS est repris en comptant un essai (3 au plus, puis abandon avec alerte) ;
   - la confirmation « envoyé » est rejouée 3 fois (avec une pause) : un SMS parti dont la confirmation se perd serait renvoyé (double SMS réel) ;
   - temps : « tire maintenant » dure au plus 45 secondes (lecture de la connexion et des SMS dus comprise), le filet 200 secondes (300 pour la fonction) ; chez les clients, le temps total est partagé (270 s), les clients sont parcourus en rotation (point de départ différent à chaque quart d'heure) et les restants sont repris au tour suivant. Un envoi qui pourrait dépasser le budget n'est pas ouvert.
   La raison d'un arrêt est dans le journal de `rdvEnvoiPlanifie` (chez Jérôme) ou dans un avertissement `arret` (chez les clients), sans clé, sans numéro, sans nom de client.

## Les quatre actions de la porte (module `rdv`)

Depuis le 14/11/2026 elles sont appelées **directement par le serveur** (`functions/src/coeur/sms-direct.js`), sans réseau ni clé. Elles restent aussi disponibles par la porte HTTP (`/porte`, module `rdv`) avec les contrôles habituels, mais plus aucun workflow n8n ne les utilise.

### `rdv.aEnvoyer`
- **Entrée** : `donnees: {}` ou `{ limite }` (1 à 40, 40 par défaut).
- **Sortie** : `resultat: { nombre, messages: [{ messageId, rendezVousId, numero, texte, caracteres, segments, typeMessage }] }`.
- Ce qui est « dû » vient des règles de `js/modules/rdv/logique.js` (`smsDus`) : présentation puis créneaux (une minute après), relances (une à la fois, 24 h après l'envoi réel de la précédente), alerte « relances terminées » (24 h après la dernière), rappel de la veille, confirmation, alertes à la professionnelle. Tout SMS automatique hors de la plage d'envoi (8 h à 20 h 30, heure de Paris) attend l'ouverture ; la confirmation et les SMS écrits à la main (pluie, annulation) partent tout de suite.
- **Réservation** : chaque SMS a un identifiant d'échéance déterministe, utilisé comme identifiant du document (`rdv_messages/<messageId>`). Un SMS déjà réservé depuis moins de 15 minutes, déjà envoyé ou abandonné n'est jamais rendu. Une réservation expirée ou un échec (moins de 3) redevient disponible, avec le même `messageId`.
- Rendez-vous de test : le numéro est remplacé par `numeroTest` (réglage) ; sans `numeroTest`, aucun SMS. Numéro désinscrit (STOP) : aucun SMS, sauf les alertes à la professionnelle.
- **Erreurs** : 400 `requete_invalide` (champ inconnu, `limite` hors bornes) ; les erreurs communes de la porte (401, 403, 429, 503).

### `rdv.libererEnvoi`
- **Entrée** : `{ messageId }`. **Sortie** : `{ messageId, libere }`.
- Rend un SMS **réservé** à « à envoyer » **sans compter d'essai** : l'appelant sait que rien n'est parti (clé refusée, crédit épuisé, limitation, budget de temps dépassé). Un SMS déjà envoyé, échoué ou abandonné n'est pas touché (`libere: false`). **Erreur** : 404 `message_inconnu`.

### `rdv.confirmerEnvoi`
- **Entrée** : `{ messageId, statut: "ok" | "echec", idFournisseur?, message? }`.
- **Sortie** : `{ messageId, statut, deja }`. Rejouer un SMS déjà confirmé rend `deja: true` sans rien changer.
- `ok` : le document passe à `envoye` avec `envoyeLe` ; suites : l'alerte « relances terminées » est notée sur le rendez-vous (`relancesTermineesLe`, colonne « À reprendre »), le compteur de relances avance.
- `echec` : `essais + 1` ; le SMS n'est pas redemandé avant 10 minutes (`reessaiApres`) ; au troisième échec il est `abandonne` (plus jamais redemandé ; alerte à la professionnelle ; à regarder dans le Journal).
- **Erreurs** : 404 `message_inconnu` ; 409 `conflit` (le message a changé entre-temps : réessayer).

### `rdv.enregistrerReponse`
- **Entrée** : `{ numero, texte, idFournisseur, recuLe? }` (`idFournisseur` : 60 caractères au plus, en minuscules ; il sert d'identifiant du message : **idempotent**, une réponse rejouée rend `deja: true`).
- **Sortie** : `{ deja, messageId, rattache: "unique" | "ambigu" | "inconnu", comprise, desinscription }`.
- La porte déduit l'espace de la clé. Le numéro est rattaché à UN participant d'un rendez-vous ouvert (`rattacherReponse`). **Même numéro dans plusieurs rendez-vous ouverts : jamais deviné** → « non comprise » pour chacun, une trace par rendez-vous, alerte, la professionnelle tranche.
- Réponse comprise (« 1 », « 1 et 3 », « aucun »…) → participant mis à jour, état du rendez-vous recalculé. Réponse non comprise → participant « non compris », ses relances sont suspendues, alerte à la professionnelle. Numéro inconnu → message gardé comme « orphelin ».
- **STOP** (et « arrêt », « désabonner »…) : jamais une réponse « non comprise » ordinaire ; la fiche affiche « Désinscrit (STOP) » (PR 641) : un désinscrit ne bloque ni la confirmation ni les relances des autres, et n'est jamais « OK » (sauf si la professionnelle a saisi sa réponse à sa place). Le numéro est ajouté à la liste des désinscrits (`rdv_parametres/desinscrits`) : plus aucun SMS ne lui est envoyé ; la professionnelle est alertée. Un SMS qu'on aurait dû envoyer à ce numéro laisse une ligne « SMS non envoyé : numéro désinscrit (STOP) » dans l'historique (message d'état `stop_<échéance>`, sans texte ni numéro) ; un SMS manuel en attente passe « bloqué » et ne repart jamais. Réglages > Rendez-vous > « Numéros désinscrits (STOP) » liste les numéros (masqués) avec « Réautoriser » (action `reautoriser` de `rdvEnvoyer`, PR 648) : le numéro quitte la liste, la fiche n'est plus « Désinscrit », aucun message n'est touché ; les SMS automatiques encore dus repartent au prochain passage du serveur. Le rappel écrit sur la carte dit de vider aussi la liste d'opt-out de ClickSend.

## Garde-fous ajoutés après la relecture (14/11/2026)
- La confirmation et le rappel de la veille partent bien (les rendez-vous confirmés sont lus tant que le rendez-vous n'est pas passé depuis plus de 2 jours).
- Un SMS dont la confirmation d'envoi n'arrive jamais est repris au plus 3 fois, puis abandonné ; un SMS abandonné ne bloque plus les relances des autres et la professionnelle reçoit une alerte (« un SMS n'est pas parti vers … »).
- Un SMS écrit à la main sur un rendez-vous de test ne part que vers le numéro de test, et rien si le rendez-vous a disparu. Le même SMS redemandé dans les 2 minutes n'est pas recréé.
- Une réponse n'est rattachée qu'à un rendez-vous dont les propositions sont réellement parties ; un numéro présent dans plusieurs rendez-vous n'efface pas la réponse déjà donnée dans l'un d'eux.
- Une confirmation d'envoi qui arrive après l'abandon (réponse lente) est acceptée : le SMS repasse à « envoyé ». Une confirmation d'une ancienne série (rejeu) ne change rien à la série courante.
- Une réponse reçue APRÈS la confirmation (« empêchement », STOP…) est gardée sur le participant et alerte la professionnelle une seule fois.
- Après « Envoyer », les SMS « créneaux » partent dans le même tir que la présentation (la demande est notée une minute en arrière).

## Limites connues (à décider avec Jérôme)
- **Réautoriser un numéro** : par la carte « Numéros désinscrits (STOP) » (PR 648). Elle ne touche pas à la liste d'opt-out de ClickSend (à vider à la main chez eux). Même effet pour ton propre numéro si tu réponds « STOP » pendant un test.
- **Liste des statuts de ClickSend à vérifier sur un vrai envoi** : la plateforme connaît `SUCCESS`, `QUEUED`, `SCHEDULED` (accepté), `INVALID_RECIPIENT`, `BLACKLISTED`, `BLOCKED`, `OPTED_OUT`, `UNSUBSCRIBED` (refus du SMS), `INVALID_SENDER_ID`, `ACCOUNT_NOT_ACTIVATED`, `MISSING_CREDENTIALS`, `INVALID_CREDENTIALS`, `THROTTLED`, `USAGE_LIMIT_EXCEEDED`, `INSUFFICIENT_CREDIT` (problème de compte), `INTERNAL_ERROR`, `SOMETHING_IS_WRONG` (panne). Cette liste vient de ma mémoire de la documentation, pas d'un essai : elle n'a pas pu être vérifiée depuis la session. Tout autre statut est traité comme un refus de CE SMS (compté, repris après 10 minutes, abandonné au 3e échec avec alerte). **Un refus général non listé (erreur de réglage du compte) abandonne donc tous les SMS d'un espace en environ 30 minutes** : le garde-fou est l'essai sur le numéro de test (étape 2 ci-dessus) AVANT tout vrai rendez-vous ; on corrige alors la liste (`STATUTS_COMPTE` dans `sms-direct.js`).
- **À décider** : un SMS « créneaux » ou « présentation » abandonné laisse-t-il quand même partir les relances de ce participant ? Aujourd'hui oui (un SMS abandonné compte comme « fait » pour le calendrier, règle ancienne) ; il n'y a pas non plus de bouton pour renvoyer un SMS abandonné (nouvelle série ou SMS écrit à la main).
- **Le jeton de l'adresse des réponses apparaît dans les journaux de requêtes de Google** (Cloud Run enregistre l'adresse complète de chaque appel à `rdvReponseSms`, donc `/<jeton>`). C'est inhérent à un jeton placé dans le chemin (ClickSend ne signe pas ses envois). Les journaux de Google ne sont lisibles que par les comptes du projet. Si le jeton fuite : changer `jeton` dans le secret et mettre à jour la règle ClickSend. À décider : l'accepter, ou exclure ces journaux.
- **La porte HTTP `rdv.aEnvoyer` reste ouverte** à un porteur de clé du module `rdv` (clés de la porte) : il pourrait réserver des SMS sans les envoyer ; la libération (`rdv.libererEnvoi`) ou l'expiration de la réservation les remet en circuit. Plus aucun workflow n'utilise ces actions : à fermer quand Jérôme le décide.
- **Expéditeur** : un nom d'expéditeur alphanumérique que la France ne reconnaît pas donne `INVALID_SENDER_ID` chez ClickSend (le tir s'arrête sans rien abandonner) : laisser `expediteur` vide tant que ClickSend n'a pas validé le sien.
- **Règles Firestore** : `rdv_messages`, `rdv_participants` et `rdv_parametres` sont inscriptibles par le navigateur d'un éditeur (règle joker, comme les autres tables de module). Un éditeur malveillant pourrait fabriquer un SMS « à envoyer » ; une PR de règles (liste d'arrêt : jamais sans accord) réserverait `rdv_messages` et `rdv_parametres/desinscrits` au serveur. Les rendez-vous eux-mêmes restent écrits par l'écran.
- **Adresse des réponses** : elle n'est protégée que par son jeton secret (ClickSend ne signe pas ses envois) ; qui connaît l'adresse complète peut forger une réponse ou un STOP. Le jeton est comparé en temps constant, jamais journalisé ; pour le changer, modifier `jeton` dans le secret puis mettre à jour la règle dans ClickSend.
- **STOP simultanés** : deux STOP exactement en même temps peuvent n'en enregistrer qu'un dans `rdv_parametres/desinscrits` (rare ; le participant garde son repère).
- **Plafond** : 500 rendez-vous non archivés par espace et 50 participants par rendez-vous sont lus à chaque tir.
- **Piste** : ClickSend renvoie l'identifiant du message d'origine (`custom_string` = notre `messageId`) dans le SMS entrant ; cela lèverait l'ambiguïté du même numéro dans deux rendez-vous sans rien deviner (à vérifier sur un vrai envoi).

## Règles de conformité des SMS (décisions de Jérôme du 14/11/2026)
ClickSend a mis deux SMS d'essai en « CancelledAfterReview ». Sa page d'erreurs cite trois causes : pas de mention de désabonnement, liens courts non approuvés, contenu interdit. Son assistant demande le nom de l'entreprise dans chaque message et un moyen simple de se désabonner.

**Décidé et fait** :
- **Chaque SMS envoyé à un participant se termine par une ligne** « `<nom de l'entreprise>` - Répondez STOP pour vous désabonner. » (présentation, créneaux, relances, confirmation, rappel, pluie, annulation, SMS écrits à la main : ajoutée par le serveur si la professionnelle l'a effacée ; jamais deux fois si le texte porte déjà exactement cette ligne ; le mot « stop » dans un nom de client ne la fait pas sauter). Les alertes à la professionnelle n'en portent pas.
- **Le nom de l'entreprise est un réglage** (Réglages > Rendez-vous > « Nom de l'entreprise dans les SMS », 30 caractères, `nomEntreprise`). Valeur de départ : « Mon entreprise ». Au déploiement chez Géolucie : le changer dans ses réglages (aucun changement de code).
- **STOP** : on le propose simplement ; si quelqu'un répond STOP, la plateforme n'envoie plus aucun SMS vers ce numéro (`rdv_parametres/desinscrits`) et **prévient la professionnelle** (alerte « a répondu STOP »).
- Effet sur la longueur : la ligne ajoute 53 caractères avec « Mon entreprise » (jusqu'à 69 avec un nom de 30 caractères) ; certains modèles passent à 2 SMS (compté et affiché dans Réglages).

**À demander à ClickSend (Jérôme leur pose la question)** : (1) avec leur numéro court ou notre nom d'expéditeur, un simple « Répondez STOP » suffit-il, ou faut-il citer un numéro (« STOP au 3xxxx ») ? (2) les messages de service (confirmation, rappel de rendez-vous) doivent-ils eux aussi porter STOP ? (3) quel expéditeur utiliser en France (nom alphanumérique enregistré ou numéro court) et quelles pièces fournir ? (4) valident-ils les six modèles ? Selon leur réponse, seul le texte de `mentionStop` (`js/modules/rdv/logique.js`) change.

Sources lues le 14/11/2026 (pages de fournisseurs, pas les textes officiels) : page d'erreurs de ClickSend, page « France » de ClickSend, guides France de Telnyx, LINK Mobility et Brevo. La page « Managing opt-outs » de ClickSend n'a pas pu être lue depuis la session (domaine non autorisé).

## Ce qui n'a pas pu être vérifié avec le vrai système
- Aucun SMS réel n'a été envoyé ni reçu : les essais utilisent un faux ClickSend et une base en mémoire.
- Le format exact de la réponse de ClickSend à un envoi (`data.messages[0].status`, `message_id`) et du SMS entrant (`from`, `message` ou `body`, `message_id`, `timestamp`, en JSON ou en formulaire) est celui de leur documentation, pas relevé sur un vrai envoi : si le premier test montre un autre champ, c'est `recevoir` ou `envoyerUn` qu'on ajuste.
- 153 caractères par morceau au-delà de 160 : à confirmer au premier test.
- Le déploiement chez les clients n'est pas fait (workflow manuel, avec Jérôme).
- Le nom exact des menus de ClickSend (règle « SMS entrants ») n'a pas pu être vérifié depuis la session.

## Solde ClickSend et alertes de solde bas (PR 640, 15/11/2026)

- `lireSolde` (`functions/src/coeur/sms-direct.js`, seul fichier qui parle à ClickSend) lit `GET /v3/account` : `data.balance` (texte) et `data._currency` ; champ absent ou illisible = « solde indisponible », jamais une erreur ; devise absente = euro, autre devise = indisponible.
- Lecture : dans les deux tirs planifiés seulement (après les SMS, jamais après une clé refusée), cache de 60 s ; à la demande par l'action `solde` de `rdvEnvoyer` (compte autorisé chez Jérôme, éditeurs chez un client). Le solde n'est jamais stocké ; seul l'état d'alerte (`soldeAlerte` dans `rdv_parametres/reglages`) l'est.
- Trois seuils réglables (défauts 10, 5 et 2 €, décroissants, de 0 à 1 000 €) : un SMS par seuil franchi (strictement inférieur), jamais deux fois le même tant que le solde ne les a pas quittés : quand le solde remonte (recharge, même partielle), les seuils qu'il ne franchit plus sont oubliés et peuvent alerter à nouveau s'il rebaisse ; un seuil encore franchi ne repart pas, à condition qu'un SMS soit réellement parti pour lui (champ `partis` de l'état `soldeAlerte`, ou message « envoyé » ou « réservé » du cycle ; sinon le seuil est oublié et une alerte est recréée au solde courant) ; plusieurs seuils franchis d'un coup = un seul SMS (le plus bas). Modèle modifiable `alerte-solde-bas` (`{solde}`, `{seuil}`, `{lien}` de recharge `https://dashboard.clicksend.com/portal/billing#add-credit`, **à vérifier**).
- Limites : alertes après les SMS de rendez-vous ; panne non journalisée (détail : `docs/reprise-prochaine-session.md`).
- Le bilan « Prêt à passer en vrai ? » (première carte de Réglages > Rendez-vous) ne stocke rien et n'envoie aucun SMS.
