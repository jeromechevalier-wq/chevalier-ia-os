# À faire au début de la prochaine session

Écrit le 04/10/2026, à la fin d'une session, pour qu'une session neuve reprenne sans que Jérôme ait à recoller quoi que ce soit. **À mettre à jour ou à supprimer une fois les points faits.**

## 1. Appliquer la décision « pas de RGPD, on garde tout » (décidée le 04/10/2026)

Décision de Jérôme : base interne, aucune mesure RGPD pour l'instant ; les journaux d'audit ne s'effacent jamais, y compris les noms, e-mails et notes ; les copies « avant / après » non plus. **La règle de durée de vie (TTL) de 90 jours est déjà supprimée dans la console** (par Jérôme, le 04/10/2026) : plus rien n'efface ces copies. Il reste à aligner le code, les tests et les docs. Ne pas réintroduire le RGPD sans que Jérôme le demande.

### Où est le code concerné (état de `main` au 04/10/2026)

| Fichier | Ce qui reste de l'ancienne règle |
|---|---|
| `functions/src/coeur/ecriture.js` | `JOURS_COPIES = 90` (ligne 23) et `expireAt` écrit avec les copies (ligne ~119 et ~157) ; `tronquer(parametres)` (ligne ~39 et ~158) : le journal `crm_audit` ne garde plus les valeurs reçues |
| `js/modules/crm/logique.js` | `JOURS_COPIES_AUDIT = 90` (ligne ~1556) et `expireAt` (ligne ~1575), pour l'audit des actions de l'écran ; la copie `functions/partage/logique.js` est générée (`node scripts/preparer-fonctions.js`) |
| `firestore.rules` | la règle sur `crm_audit_avant` exige `request.resource.data.expireAt is timestamp` (ligne ~27) |
| `functions/src/coeur/restaurer.js` | message `copie_expiree` (« n'existent plus ») |
| `js/modules/crm/journal.js` | textes « elle a expiré (gardée 90 jours) » (lignes ~46 et ~166) |
| `functions/src/mcp/outils/suppression.js` | descriptions « Récupérable 90 jours » (`supprimer_note`, `supprimer_activite`) |

### Piège d'ordre à respecter

La règle Firestore **exige** `expireAt`, et l'écran comme le serveur l'écrivent. Si le code cesse de l'écrire avant que la règle soit assouplie (ou l'inverse), des écritures sont refusées. **Approche la plus sûre (recommandée)** : ne pas toucher aux règles ni au champ ; mettre `JOURS_COPIES` et `JOURS_COPIES_AUDIT` à une très grande valeur (par exemple 36 500 jours, soit 100 ans), pour que `expireAt` reste valide mais inoffensif maintenant que le TTL est supprimé. Aucune publication de règles n'est alors nécessaire. Un nettoyage complet du champ (règles, écran, serveur, tests) pourra venir plus tard, en un seul lot coordonné, si Jérôme le veut.

### À faire

1. Garder aussi les **valeurs reçues** dans `crm_audit` (paramètres, y compris noms, e-mails, notes, tronqués à 2 000 caractères comme prévu au plan 5.2), à la place des seuls noms de champs.
2. Allonger la durée des copies comme ci-dessus, adapter les textes (« gardée 90 jours », « expiré », « Récupérable 90 jours », `copie_expiree`), les descriptions d'outils et les tests.
3. Mettre à jour `plan-mcp.md` (section 5.2, écarts de l'étape 4, risque R10), `roadmap.md` (retirer « À confirmer » de l'étape 4), `securite-et-pannes.md`, `playbook-mcp-firebase.md`, `mcp-etape-4.md`, `audit-ecran.md` et `journal-ecran.md`, qui parlent encore du RGPD et des 90 jours.
4. Lancer la suite complète de tests dans la session (parcours Playwright compris : l'écran est touché), puis une PR pour Jérôme.

## 2. Reste du plan du serveur MCP, dans l'ordre (voir `roadmap.md`)

- **À vérifier avec Jérôme le 04/10/2026** : la première sauvegarde quotidienne de Firestore apparaît dans la console (« Reprise après sinistre », tableau « Sauvegardes », expiration à 98 jours).
- **Étape 6, fin** : brancher **Hermes** sur le VPS (jeton « bibliothécaire », sans suppression ni restauration ; Jérôme doit fournir `hermes --version`). Mettre à jour `branchement-mcp.md`.
- **Étape 5, fin** : export JSON hebdomadaire dans le Drive par le bibliothécaire, `outils/restaurer-export.js`, essai de restauration (qui crée une nouvelle base, jamais d'écrasement).
- **Étape 7** : pièces jointes dans l'appli (par lien d'abord, puis téléversement vers Drive). Suppose le test à 8 jours du prototype Drive (autorisation à refaire sur le Mac, contrôle vers le 10/10/2026).
- **Étape 8** : recette et clôture.
- **En attente de discussion** : quatre points d'expérience utilisateur de la version 2.0.1 (`retours-ux-2026-10-04.md`).
