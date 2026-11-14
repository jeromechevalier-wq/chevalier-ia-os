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

## Règles de conformité des SMS (à vérifier avant le premier envoi à un tiers)
ClickSend a mis deux SMS d'essai en « CancelledAfterReview ». Son assistant demande : **le nom de l'entreprise dans chaque message** et **un moyen simple de se désabonner** (« Répondez STOP pour vous désabonner », ou un lien). Les modèles par défaut ne portent pas encore « STOP » ; la réponse STOP est déjà gérée côté plateforme (ci-dessus). Page de ClickSend à lire : « Managing opt-outs ». À décider avec Jérôme : où mettre « STOP » dans les modèles (le premier SMS suffit-il ?) et l'effet sur la limite de 160 caractères.

## Ce qui n'a pas pu être vérifié avec le vrai système
- Aucun SMS réel n'a été envoyé ni reçu : les essais utilisent un faux n8n et une base en mémoire.
- Le format exact de la réponse de ClickSend (`data.messages[0].status`, `message_id`) et du SMS entrant (`from`, `body`, `message_id`, `timestamp`) est celui de leur documentation, pas relevé sur un vrai envoi.
- 153 caractères par morceau au-delà de 160 : à confirmer au premier test.
- Le déploiement chez les clients n'est pas fait (workflow manuel, avec Jérôme).
