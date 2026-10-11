# Journal du chantier 14 (journal d'activité des workflows n8n, phases 1 et 2)

Branche `claude/chantier-14-journal-workflows-4679bc`. À lire en premier si la session est coupée.
Cahier des charges de Jérôme : https://claude.ai/artifact/DqhJ4UZ4sucD93d2z7F56H (remplace le plan « n8n pousse sa progression » de l'étude, section 7).

## Fait
- Module `journal` déclaré dans `js/os/registre.js` (réservé aux clients : `chezJerome: false`), montage dans `js/os/modules.js` (`MODULES` = CRM de Jérôme, inchangé ; `MODULES_CLIENT` = tous).
- Règles Firestore : `workflows`, `executions` (+ `steps`) et `sync` en lecture seule pour tous les navigateurs (tests J1 à J6).

## Reste (dans l'ordre)
1. Fonctions `functions-plateforme/` (copie horaire, « Rafraîchir », « Renommer », client n8n en GET seulement) + tests avec faux n8n.
2. Écran du module (`js/modules/journal/`).
3. `scripts/nouveau-client.js` (identifiant ≤ 17 caractères si le module journal est activé).
4. Workflow de déploiement (entrée « fonctions », rien lancé).
5. Docs : `docs/journal-activite-workflows.md`, étude sections 7 et 8, feuille de route.

## Décisions prises seul
- Limite d'une étiquette n8n : **24 caractères** (vérifié dans le code source public de n8n, `TagEntity`), donc `client-` + 17 caractères au plus.
