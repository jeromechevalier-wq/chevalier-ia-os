# Rendez-vous : les SMS par la porte et n8n

Écrit le 14/11/2026. Module « Rendez-vous » (`rdv`) : la plateforme décide de tout (qui reçoit quoi, quand, avec quel texte exact) ; **n8n ne fait qu'envoyer et recevoir** par ClickSend. Le dépôt ne parle jamais à ClickSend. Aucun secret, aucun numéro réel, aucun nom réel dans ce fichier (`<id>` = l'identifiant d'un client, donné hors dépôt).

## Le principe en une image

```
Écran ──clic "Envoyer"──► fonction rdvEnvoyer ──note la demande──► Firestore (rdv_rendezvous.envoiDemandeLe)
                                   │
                                   └─ « tire maintenant » (identifiants seulement) ──► n8n : workflow « envoyer les SMS »
Toutes les 15 minutes ───────────────────────────────────────────► n8n : même workflow (filet de sécurité)

n8n ──porte rdv.aEnvoyer──► [SMS dus : texte exact, numéro, messageId]  (chaque SMS est RÉSERVÉ 15 minutes)
n8n ──ClickSend──► envoie
n8n ──porte rdv.confirmerEnvoi──► « envoyé » (ou « échec »), rejouable

ClickSend ──règle « SMS entrants »──► n8n : workflow « recevoir une réponse » ──porte rdv.enregistrerReponse──► Firestore
```

Un seul chemin d'envoi : **la porte**. L'appel « tire maintenant » ne porte que `{ action: "rdv.tirerMaintenant", espace, rendezVousId }` (jamais un numéro ni un texte). S'il échoue, le workflow planifié envoie quand même au tour suivant.

## Les trois actions de la porte (module `rdv`)

Appelées par POST sur `/porte` avec `{ module: "rdv", action, workflowId: {{ $workflow.id }}, donnees }` et la clé de l'espace. Mêmes contrôles que les autres modules (clé, plafond, module actif, intégrité du workflow : nom et étiquette).

### `rdv.aEnvoyer`
- **Entrée** : `donnees: {}` ou `{ limite }` (1 à 40, 40 par défaut).
- **Sortie** : `resultat: { nombre, messages: [{ messageId, rendezVousId, numero, texte, caracteres, segments, typeMessage }] }`.
- Ce qui est « dû » vient des règles de `js/modules/rdv/logique.js` (`smsDus`) : présentation puis créneaux (une minute après), relances (une à la fois, 24 h après l'envoi réel de la précédente), alerte « relances terminées » (24 h après la dernière), rappel de la veille, confirmation, alertes à la professionnelle. Tout SMS automatique hors de la plage d'envoi (8 h à 20 h 30, heure de Paris) attend l'ouverture ; la confirmation et les SMS écrits à la main (pluie, annulation) partent tout de suite.
- **Réservation** : chaque SMS a un identifiant d'échéance déterministe, utilisé comme identifiant du document (`rdv_messages/<messageId>`). Un SMS déjà réservé depuis moins de 15 minutes, déjà envoyé ou abandonné n'est jamais rendu. Une réservation expirée ou un échec (moins de 3) redevient disponible, avec le même `messageId`.
- Rendez-vous de test : le numéro est remplacé par `numeroTest` (réglage) ; sans `numeroTest`, aucun SMS. Numéro désinscrit (STOP) : aucun SMS, sauf les alertes à la professionnelle.
- **Erreurs** : 400 `requete_invalide` (champ inconnu, `limite` hors bornes) ; les erreurs communes de la porte (401, 403, 429, 503).

### `rdv.confirmerEnvoi`
- **Entrée** : `{ messageId, statut: "ok" | "echec", idFournisseur?, message? }`.
- **Sortie** : `{ messageId, statut, deja }`. Rejouer un SMS déjà confirmé rend `deja: true` sans rien changer.
- `ok` : le document passe à `envoye` avec `envoyeLe` ; suites : l'alerte « relances terminées » est notée sur le rendez-vous (`relancesTermineesLe`, colonne « À reprendre »), le compteur de relances avance.
- `echec` : `essais + 1` ; au troisième échec le SMS est `abandonne` (plus jamais redemandé ; à regarder dans le Journal).
- **Erreurs** : 404 `message_inconnu` ; 409 `conflit` (le message a changé entre-temps : réessayer).

### `rdv.enregistrerReponse`
- **Entrée** : `{ numero, texte, idFournisseur, recuLe? }` (`idFournisseur` : 60 caractères au plus, en minuscules ; il sert d'identifiant du message : **idempotent**, une réponse rejouée rend `deja: true`).
- **Sortie** : `{ deja, messageId, rattache: "unique" | "ambigu" | "inconnu", comprise, desinscription }`.
- La porte déduit l'espace de la clé. Le numéro est rattaché à UN participant d'un rendez-vous ouvert (`rattacherReponse`). **Même numéro dans plusieurs rendez-vous ouverts : jamais deviné** → « non comprise » pour chacun, une trace par rendez-vous, alerte, la professionnelle tranche.
- Réponse comprise (« 1 », « 1 et 3 », « aucun »…) → participant mis à jour, état du rendez-vous recalculé. Réponse non comprise → participant « non compris », ses relances sont suspendues, alerte à la professionnelle. Numéro inconnu → message gardé comme « orphelin ».
- **STOP** (et « arrêt », « désabonner »…) : jamais une réponse « non comprise » ordinaire. Le numéro est ajouté à la liste des désinscrits (`rdv_parametres/desinscrits`) : plus aucun SMS ne lui est envoyé ; la professionnelle est alertée.

## Les workflows n8n (créés le 14/11/2026, **non publiés**)

Nommage obligatoire (sinon la porte répond 403 `workflow_refuse`) : chez Jérôme `interne-rdv-…` + étiquette `interne` ; chez un client `client-<id>-rdv-…` + étiquette `client-<id>` (17 caractères au plus pour `<id>`). Chaque espace a SES workflows, SES secrets, jamais partagés.

| Nom | Déclencheurs | Étapes |
|---|---|---|
| `interne-rdv-envoyer-les-sms` | webhook « tire maintenant » (POST) + toutes les 15 minutes | porte `rdv.aEnvoyer` → un SMS par ligne → ClickSend (`/v3/sms/send`) → si `SUCCESS` : porte `rdv.confirmerEnvoi` « ok » (avec l'identifiant ClickSend), sinon « echec » |
| `interne-rdv-recevoir-une-reponse` | webhook (règle « SMS entrants » de ClickSend) | mise en forme (`from`, `body`, `message_id`, `timestamp`) → porte `rdv.enregistrerReponse` |

### À brancher avant de publier (par Jérôme, une fois)
1. **Secret du webhook « tire maintenant »** : dans n8n, créer un secret de type « en-tête » nommé « Webhook rendez-vous » (nom de l'en-tête `X-Chevalier-Secret`, valeur longue et aléatoire), le choisir dans le webhook, passer « Authentication » sur « Header Auth ». **Tant que ce n'est pas fait, ne pas publier** (le webhook serait ouvert à tous).
2. **ClickSend** : créer dans n8n un secret « Basic Auth » (identifiant ClickSend + clé d'API) nommé « ClickSend (identifiant et clé API) » et le choisir dans l'étape « Envoyer par ClickSend ».
3. **Secret Manager** (projet `chevalier-ia-os`) : `N8N_RDV_URL` (adresse « Production URL » du webhook, chemin `/webhook/…`, hôte `n8n.chevalier-ia.fr`) et `N8N_RDV_SECRET` (même valeur que le secret de l'étape 1). Donner « Accesseur de secrets » au compte de service des fonctions. Chez un client : `N8N_RDV_URL_<id>` et `N8N_RDV_SECRET_<id>`.
4. **ClickSend, règle « SMS entrants »** : action « envoyer vers une adresse », adresse = « Production URL » du webhook de `interne-rdv-recevoir-une-reponse`. ClickSend ne signe pas ses envois : la seule protection est que l'adresse est longue, aléatoire et secrète (ne la copier nulle part ailleurs ; vérifier que la porte refuse tout ce qui n'est pas une réponse d'un numéro connu).
5. **Test avec le numéro de test seulement** : `numeroTest` (Réglages > Rendez-vous, à ajouter) puis un rendez-vous marqué test. Jamais d'envoi à un tiers avant d'avoir vu un SMS arriver sur ce numéro.
6. Publier les deux workflows. L'écran active « Envoyer » tout seul (la fonction `rdvEtat` répond « branché » quand les deux secrets de l'étape 3 existent).

## Garde-fous ajoutés après la relecture (14/11/2026)
- La confirmation et le rappel de la veille partent bien (les rendez-vous confirmés sont lus tant que le rendez-vous n'est pas passé depuis plus de 2 jours).
- Un SMS dont la confirmation d'envoi n'arrive jamais est repris au plus 3 fois, puis abandonné ; un SMS abandonné ne bloque plus les relances des autres et la professionnelle reçoit une alerte (« un SMS n'est pas parti vers … »).
- Un SMS écrit à la main sur un rendez-vous de test ne part que vers le numéro de test, et rien si le rendez-vous a disparu. Le même SMS redemandé dans les 2 minutes n'est pas recréé.
- Une réponse n'est rattachée qu'à un rendez-vous dont les propositions sont réellement parties ; un numéro présent dans plusieurs rendez-vous n'efface pas la réponse déjà donnée dans l'un d'eux.
- Une confirmation d'envoi qui arrive après l'abandon (n8n lent) est acceptée : le SMS repasse à « envoyé ». Une confirmation d'une ancienne série (rejeu) ne change rien à la série courante.
- Une réponse reçue APRÈS la confirmation (« empêchement », STOP…) est gardée sur le participant et alerte la professionnelle une seule fois.
- Après « Envoyer », les SMS « créneaux » partent dans le même tir que la présentation (la demande est notée une minute en arrière).

## Limites connues (à décider avec Jérôme)
- **Règles Firestore** : `rdv_messages`, `rdv_participants` et `rdv_parametres` sont inscriptibles par le navigateur d'un éditeur (règle joker, comme les autres tables de module). Un éditeur malveillant pourrait fabriquer un SMS « à envoyer » ; une PR de règles (liste d'arrêt : jamais sans accord) réserverait `rdv_messages` et `rdv_parametres/desinscrits` au serveur. Les rendez-vous eux-mêmes restent écrits par l'écran.
- **Réponse de ClickSend rejouée** : l'adresse du webhook « réponse » n'est protégée que par son secret (ClickSend ne signe pas) ; qui la connaît peut forger une réponse ou un STOP. Piste : un jeton dans l'adresse, vérifié par un nœud du workflow.
- **STOP simultanés** : deux STOP exactement en même temps peuvent n'en enregistrer qu'un dans `rdv_parametres/desinscrits` (rare ; le participant garde son repère).
- **Plafond** : 500 rendez-vous non archivés par espace et 50 participants par rendez-vous sont lus à chaque tir.
- **Piste** : ClickSend renvoie l'identifiant du message d'origine (`custom_string` = notre `messageId`) dans le SMS entrant ; cela lèverait l'ambiguïté du même numéro dans deux rendez-vous sans rien deviner (à vérifier sur un vrai envoi).

## Règles de conformité des SMS (décisions de Jérôme du 14/11/2026)
ClickSend a mis deux SMS d'essai en « CancelledAfterReview ». Sa page d'erreurs cite trois causes : pas de mention de désabonnement, liens courts non approuvés, contenu interdit. Son assistant demande le nom de l'entreprise dans chaque message et un moyen simple de se désabonner.

**Décidé et fait** :
- **Chaque SMS envoyé à un participant se termine par une ligne** « `<nom de l'entreprise>` - Répondez STOP pour vous désabonner. » (présentation, créneaux, relances, confirmation, rappel, pluie, annulation, SMS écrits à la main : ajoutée par le serveur si la professionnelle l'a effacée ; jamais deux fois si le texte porte déjà exactement cette ligne ; le mot « stop » dans un nom de client ne la fait pas sauter). Les alertes à la professionnelle n'en portent pas.
- **Le nom de l'entreprise est un réglage** (Réglages > Rendez-vous > « Nom de l'entreprise dans les SMS », 30 caractères, `nomEntreprise`). Valeur de départ : « Chevalier IA ». Au déploiement chez Géolucie : le changer dans ses réglages (aucun changement de code).
- **STOP** : on le propose simplement ; si quelqu'un répond STOP, la plateforme n'envoie plus aucun SMS vers ce numéro (`rdv_parametres/desinscrits`) et **prévient la professionnelle** (alerte « a répondu STOP »).
- Effet sur la longueur : la ligne ajoute 51 caractères avec « Chevalier IA » (jusqu'à 69 avec un nom de 30 caractères) ; certains modèles passent à 2 SMS (compté et affiché dans Réglages).

**À demander à ClickSend (Jérôme leur pose la question)** : (1) avec leur numéro court ou notre nom d'expéditeur, un simple « Répondez STOP » suffit-il, ou faut-il citer un numéro (« STOP au 3xxxx ») ? (2) les messages de service (confirmation, rappel de rendez-vous) doivent-ils eux aussi porter STOP ? (3) quel expéditeur utiliser en France (nom alphanumérique enregistré ou numéro court) et quelles pièces fournir ? (4) valident-ils les six modèles ? Selon leur réponse, seul le texte de `mentionStop` (`js/modules/rdv/logique.js`) change.

Sources lues le 14/11/2026 (pages de fournisseurs, pas les textes officiels) : page d'erreurs de ClickSend, page « France » de ClickSend, guides France de Telnyx, LINK Mobility et Brevo. La page « Managing opt-outs » de ClickSend n'a pas pu être lue depuis la session (domaine non autorisé).

## Ce qui n'a pas pu être vérifié avec le vrai système
- Aucun SMS réel n'a été envoyé ni reçu : les essais utilisent un faux n8n et une base en mémoire.
- Le format exact de la réponse de ClickSend (`data.messages[0].status`, `message_id`) et du SMS entrant (`from`, `body`, `message_id`, `timestamp`) est celui de leur documentation, pas relevé sur un vrai envoi.
- 153 caractères par morceau au-delà de 160 : à confirmer au premier test.
- Le déploiement chez les clients n'est pas fait (workflow manuel, avec Jérôme).
