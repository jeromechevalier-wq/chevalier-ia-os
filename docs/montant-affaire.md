# Le montant d'une affaire : d'où vient le chiffre affiché

*Décisions de Jérôme du 29/10/2026. Cette page explique tout, simplement. Règle d'origine : D17 de `docs/cadrage-devis.md`. À lire avant de toucher au montant, à un écran qui l'affiche ou à une fonction du serveur qui change un devis.*

## En une phrase

> **Sans module Devis, le montant est un champ libre : on tape le chiffre qu'on veut. Avec le module Devis, le chiffre vient uniquement du calcul sur les devis, et l'infobulle montre les vrais devis et les vraies additions.**

## Les trois cas (ce que l'utilisateur voit en haut de la fiche d'une affaire)

| Situation de l'affaire | Libellé | Chiffre | Modifiable ? |
|---|---|---|---|
| Aucun devis qui compte (module Devis absent, aucun devis finalisé, ou tous refusés, remplacés ou archivés) | **Montant estimé** | ce qui a été tapé à la main ; un tiret gris « — » si rien n'a été tapé | **Oui** (crayon) |
| Au moins un devis **accepté** (Signé), non archivé | **Montant accepté HT** | la **somme HT** des devis acceptés | Non (calculé) |
| Pas de devis accepté, mais au moins un devis **proposé** (Finalisé ou Envoyé) | **Montant proposé HT** | le HT du devis proposé **le plus récent, seul** | Non (calculé) |

Les devis acceptés passent **avant** les devis proposés : dès qu'un devis est signé, les offres proposées ne comptent plus.

### Ce qui ne compte jamais
- **Un brouillon.** Il change à chaque frappe et n'est pas enregistré par le serveur : seul un devis **finalisé** compte.
- Un devis **refusé**, **remplacé** (une version plus récente existe) ou **archivé**.
- Un devis dont le total HT figé n'est pas un nombre (jamais un chiffre inventé).

### Pourquoi « le plus récent, seul » pour les devis proposés ?
Deux offres envoyées au même client (une « basique », une « premium ») sont des **alternatives**, pas une addition. Si on les additionnait, le total serait faux. Le plus récent est celui sur lequel on travaille. Les devis acceptés, eux, s'additionnent : ce sont des commandes qui s'ajoutent.

## L'infobulle (le petit « i » à côté du chiffre)
Elle ne donne **pas une explication générale** : elle détaille **les vrais devis et les vraies additions** de ce qui est affiché.

- Devis acceptés :
  `Devis acceptés : DEV-2026-10-27-011 : 2 148,80 € HT + DEV-2026-10-28-012 v2 : 600 € HT = 2 748,80 € HT.`
- Devis proposé :
  `Devis proposé le plus récent : DEV-2026-10-29-013 v2 : 1 200 € HT.` puis `Non compté (devis proposé plus ancien) : DEV-2026-10-26-010 : 900 € HT.` puis `Aucun devis n'est encore accepté.`
- Si un montant avait été tapé à la main : `Ton montant estimé (1 500 €) est gardé : il revient si plus aucun devis ne compte.`

Les cartes du Kanban, la liste et les mini-cartes affichent le même chiffre, suivi de **« HT »** quand il vient des devis (le montant tapé à la main n'a pas de « HT »). Le **total de colonne** du Kanban et le **chiffre d'affaires signé** utilisent le même chiffre.

## Exemples

| Ce qui se passe | Avant | Après |
|---|---|---|
| Jérôme tape 1 500 € sur une affaire neuve | tiret | **Montant estimé 1 500 €** |
| Il finalise un devis de 1 200 € HT | Montant estimé 1 500 € | **Montant proposé HT 1 200 €** (le 1 500 € est gardé) |
| Il finalise une 2e offre de 900 € HT, plus récente | 1 200 € HT | **Montant proposé HT 900 €** ; l'infobulle dit que 1 200 € n'est pas compté |
| Le client signe la première (1 200 €) | 900 € HT proposé | **Montant accepté HT 1 200 €** |
| Le client signe aussi la 2e (900 €) | 1 200 € HT | **Montant accepté HT 2 100 €** (1 200 + 900) |
| Jérôme archive le devis signé de 900 € | 2 100 € HT | **1 200 € HT** |
| Il archive aussi l'autre (plus aucun devis ne compte) | 1 200 € HT | **Montant estimé 1 500 €** (revenu) |
| Un devis envoyé est refusé, c'est le seul | Montant proposé HT 1 200 € | **Montant estimé 1 500 €** |

## Comment ça marche (pour le développeur)

**Une seule vérité, écrite par le serveur.** Le serveur écrit dans le document de l'affaire trois champs **voisins** du montant saisi :

| Champ | Contenu |
|---|---|
| `montant` | le montant **saisi à la main**. **Jamais touché** par les devis, jamais effacé. |
| `montantDevisHt` | le montant calculé d'après les devis (nombre ≥ 0 ; un devis au total négatif est ignoré), ou `null` s'il n'y a rien à compter |
| `montantDevisNature` | `'accepte'` ou `'propose'` (ou `null`) |
| `montantDevisDetail` | la liste `{ numero, version, ht, compte }` des devis qui expliquent le chiffre (20 au plus) : c'est ce qui nourrit l'infobulle, sans recharger les devis |

**Pourquoi un champ voisin et pas `montant` ?** Écraser `montant` effacerait ce que l'utilisateur a tapé (il doit revenir quand les devis disparaissent), obligerait à créer un champ « estimé » et à **migrer** toutes les affaires, et casserait les autres écrivains (écran, assistant, modèles d'affaire).

**Quand le serveur recalcule.** Dans la **même transaction** que chaque transition d'un devis qui peut changer le montant, `functions/src/coeur/devis.js` (fonction `montantDeLAffaire`) : finaliser, marquer envoyé / accepter / refuser, archiver / désarchiver. « Nouvelle version » et « supprimer un brouillon » ne recalculent rien : un brouillon ne compte jamais (supprimer reste donc restaurable par le journal) ; finaliser la v2 remplace la v1 et recalcule. Si le résultat est identique à ce qui est déjà écrit, **rien n'est écrit** (ni la donnée, ni le journal). Une affaire supprimée ou un devis sans affaire : rien n'est écrit, rien n'est recréé. Le calcul lui-même est une fonction pure, `montantDesDevis` (`js/modules/devis/logique.js`), testée seule.

**Même code chez Jérôme et chez les clients.** `functions/src/coeur/` est copié tel quel dans `functions-plateforme/serveur/` par `scripts/preparer-fonctions.js` : aucune version à maintenir en double.

**Comment les écrans lisent.** Tous passent par `montantAffaire(a)` (`js/modules/crm/logique.js`) : `montantDevisHt` s'il y en a un, sinon `montant`. `natureMontant(a)` donne `'accepte' | 'propose' | 'estime'`, `LIBELLES_MONTANT` les mots de l'écran, `detailMontant(a)` le texte de l'infobulle. Utilisé par la fiche, le Kanban (carte, tri, total de colonne), la liste, les mini-cartes, le chiffre d'affaires signé (`CALCULS.ca_signe`) et l'assistant (`lire_affaire` et `lister_affaires` rendent `montantAffiche`). Le montant vient du document de l'affaire lui-même : **rien ne clignote** au chargement.

**Le journal.** Chaque recalcul laisse une ligne d'audit pour l'affaire (collection `crm_affaires`, champs `montantDevis*`), dans la même opération que le devis. `restaurer_depuis_audit` **refuse** ces opérations (une copie entière de l'affaire effacerait ce qui a changé depuis) : on refait le geste inverse sur le devis (par exemple désarchiver), le montant est recalculé.

## Limites connues (à ne pas « corriger » sans en parler à Jérôme)
- **Aucune migration automatique** (décision du 29/10/2026). Le calcul ne s'applique qu'**aux changements à venir** : une affaire dont les devis existaient avant la mise en service garde son montant tapé tant qu'un de ses devis n'a pas changé. Pour les rattraper, il y a l'outil **`recalculer_montants_affaires`** (Claude Code seulement, accord de Jérôme du 29/10/2026) : sans code, il montre la liste des affaires à corriger (montant avant, après) et ne change rien ; avec le code à usage unique, il écrit **uniquement** `montantDevisHt`, `montantDevisNature` et `montantDevisDetail` (jamais le montant tapé), une ligne de journal par affaire (`devisRecalculMontant`), 50 affaires par appel. Il remet aussi à zéro un calcul périmé (plus aucun devis qui compte). Sans danger à relancer : une affaire déjà à jour n'est pas écrite. Ne se défait pas par `restaurer_depuis_audit` (on le relance, ou on change le devis). Il ne se lance qu'après l'accord de Jérôme sur la liste montrée.
- Le **module Devis retiré** chez un client : les champs `montantDevis*` déjà écrits restent dans les affaires et continuent de s'afficher (le serveur n'écrit plus rien). Cas rare ; une remise à zéro serait une opération de données.
- Un **devis expiré** (date de validité dépassée) reste « Envoyé » dans la base : il compte comme proposé.
- Le passage de l'affaire à « Gagnée » à l'acceptation d'un devis (D17, 1re moitié) n'est **pas** branché.
- **Un devis « Finalisé » jamais envoyé a maintenant une sortie** (décision de Jérôme, 29/10/2026) : on peut le marquer « Refusé » ou l'archiver depuis le menu « … ». Refusé ou archivé, il ne compte plus (l'archivé est ignoré, le refusé n'est plus « proposé »), et le montant de l'affaire se recalcule dans la même opération.
- Si le détail enregistré ne suffit pas à expliquer le total (plus de 20 devis acceptés, ou donnée modifiée à la main), l'infobulle écrit « détail incomplet » et donne le total, jamais une addition fausse.
- Il n'y a pas de bouton pour forcer un chiffre à la main quand des devis comptent : le chiffre calculé est la vérité ; pour changer le montant, on change les devis.

## Tests
`tests/devis-montant-affaire.test.js` (règle pure N1, chaque transition N2 à N4, lecture commune et infobulle N5, restauration refusée N6, recalcul général N7) ; `tests/devis-serveur-firestore.test.js` C8 (vraies transactions Firestore : acceptations simultanées, finalisation, espace client isolé) ; `tests/e2e/affaire-montant.spec.js` (fiche, infobulle, direct, Kanban, liste, tri, module éteint ; ordinateur et téléphone, captures dans `tests/e2e/captures/affaire-montant/`).

## Déploiement
Le **site** (hosting) suffit pour les libellés et l'infobulle. Pour que le serveur **écrive** les champs : déployer `functions/` chez Jérôme (il porte aussi le serveur MCP) et « Déploiement plateforme clients » > `fonctions` (et `mcp`) chez les clients. Pas de règle Firestore à publier.
