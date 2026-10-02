# Cahier des charges : serveur MCP de Chevalier IA OS et pièces jointes

Brouillon du 02/10/2026, à valider par Jérôme avant tout code. Complète `roadmap.md`.

## 1. Objectif

Claude Code (Mac de Jérôme) et des agents (premier : **agent bibliothécaire**, sur Hermes Agent, VPS de Jérôme) lisent **et écrivent** dans la base de Chevalier IA OS (Firestore, collections `crm_*`), avec les mêmes règles métier que l'écran. Chaque action est **tracée**. Parallèlement, l'appli permet de joindre des documents à une affaire par lien ou par téléversement vers Google Drive, depuis le téléphone.

## 2. Décisions de Jérôme

1. Lecture et écriture d'emblée, **tous les droits** pour les agents, **suppression comprise**.
2. Confiance et contrôle : tout est enregistré dans une table d'audit.
3. Un seul code de serveur MCP, deux instances : **Mac** (Claude Code, lit les fichiers du Mac) et **VPS d'Hermes Agent** (agents, sans le Mac).
4. Le bibliothécaire : vérifie les liens cassés (wiki et liens de documents), range et retrouve les documents, écrit dans le CRM, **fait les sauvegardes**.
5. Pièces jointes **sur les affaires uniquement**, par lien ou par téléversement ; un seul dossier Drive `Jerome IA OS Attachments` créé par l'appli ; nommage `AAAA-MM-JJ - <affaire> - <contenu>`.

## 3. Architecture

- **Couche métier** (`mcp/coeur/`) : fonctions qui réutilisent `js/modules/crm/logique.js` (déjà testé) et écrivent dans Firestore avec le SDK d'administration. Aucune règle métier dupliquée.
- **Façade MCP** (`mcp/serveur/`) : un outil par fonction. Transport « programme local » (Claude Code) ou HTTP avec jeton (si un agent est sur une autre machine). Pour Hermes sur son VPS : le serveur tourne **sur le VPS d'Hermes**, lancé par Hermes ; il parle à Firestore par Internet avec sa clé. Aucune exposition publique.
- **Une clé de compte de service Google par instance** (Mac, VPS), révocables séparément. Jamais dans le dépôt ni dans le dossier Google Drive.
- **Acteur** : chaque instance porte un nom (`claude-code-jerome`, `hermes-bibliothecaire`). Il s'inscrit dans `auteur` du fil d'activité (comme Jérôme ou Charles aujourd'hui) et dans l'audit.

## 4. Outils (première liste)

- **Lecture** : chercher (personnes, organisations, affaires), lire une personne / organisation / affaire avec son fil, lister affaires et tâches, lister les documents joints (pour contrôle des liens), lire les réglages.
- **Écriture** : créer et modifier personne, organisation, affaire ; changer l'étape ; gagnée / perdue / en pause ; ajouter note, activité, encaissement ; terminer une activité ; joindre un document par lien ; téléverser un document dans Drive puis le joindre ; supprimer personne, organisation, affaire.
- **Sauvegarde** : exporter toutes les collections en JSON (même format que « Exporter mes données »).
- **Audit** : lire le journal d'audit ; **restaurer** un document depuis une entrée d'audit.

## 5. Journal d'audit

Collection `crm_audit`, une entrée par écriture, **créée avant** de renvoyer le succès :
`date` (serveur), `acteur`, `outil`, `collection`, `docId`, `avant` (copie complète du document avant la modification ou la suppression), `apres`, `parametres`, `resultat`.

Conséquence : une suppression est tracée **et récupérable** (le contenu est dans `avant`). Tracer ne suffit pas : sans copie de l'état d'avant, on saurait ce qui a disparu mais pas le rétablir.

**Protection du journal** : les règles actuelles de Firestore autorisent Jérôme et Charles à tout modifier. Pour que le journal ne puisse pas être modifié ni effacé depuis l'appli, il faut une **modification de `firestore.rules`** (lecture seule pour les comptes de l'appli sur `crm_audit`). Les serveurs MCP écrivent avec la clé d'administration, qui contourne les règles. Cette modification est la seule dans `firestore.rules` : elle est soumise à Jérôme et publiée par lui.

## 6. Sauvegardes

L'agent bibliothécaire déclenche l'export régulier (outil de sauvegarde) vers un dossier Drive dédié. Un agent qui a tous les droits ne doit pas être la seule protection de ses propres erreurs : en plus, activer la **récupération à un instant donné** de Firestore côté Google (indépendante des agents).

## 7. Pièces jointes dans l'appli (téléphone)

- Section « Documents » de l'affaire : bouton « Ajouter un lien » (existant) et « Téléverser un fichier » (nouveau).
- Téléversement : autorisation Google Drive limitée aux fichiers créés par l'appli (`drive.file`), demandée à l'écran. Le dossier `Jerome IA OS Attachments` est créé à la première utilisation ; son identifiant est gardé dans les réglages. Jérôme peut le renommer et le déplacer.
- Réglages Google Cloud (écran de consentement, origine autorisée) : faits par Jérôme.

## 8. Risques et points à prototyper en premier

1. **Drive côté serveur** : un compte de service n'a pas d'espace de stockage dans un Drive personnel. Pour que le serveur téléverse dans le Drive de Jérôme, il faut un jeton de Jérôme (autorisation donnée une fois). Les fichiers créés par l'appli et par le serveur ne sont visibles des deux côtés qu'avec la même application Google : **à valider par un essai** avant de s'engager.
2. **Clés secrètes** : la clé du VPS, qui a tous les droits, est la pièce la plus sensible. Droits de fichier restreints, pas de copie dans des journaux.
3. **Agents autonomes** : un agent qui se trompe peut écrire beaucoup de mauvaises données. Parades : audit, restauration, récupération à un instant donné.
4. **Cohérence** : toute évolution de `logique.js` doit rester compatible avec le serveur (les tests de la logique servent aux deux).

## 9. Ordre de travail

1. Valider ce cahier.
2. Prototypes : Drive côté serveur (point 8.1).
3. Couche métier + audit + outils de lecture, avec tests.
4. Outils d'écriture, suppression, restauration, sauvegarde.
5. Instance Mac, branchée à Claude Code.
6. Instance VPS, branchée à Hermes Agent.
7. Téléversement depuis le téléphone dans l'appli.
8. Modification de `firestore.rules` pour le journal, publiée par Jérôme.
