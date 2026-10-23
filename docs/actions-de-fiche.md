# Boutons d'action sur les fiches (idée du 23/10/2026, rien n'est codé)

**Exemple de départ** : une cliente voudrait un bouton « Générer devis » dans sa fiche « Affaire ». Le devis doit être créé par un workflow n8n qui lui appartient, déposé **en brouillon dans sa boîte e-mail**, avec **une copie en document joint** de la fiche (onglet Documents). Tout ce qui est propre à la cliente (numéro d'entreprise, banque, tarifs, modèle) reste dans **son** workflow n8n et ses identifiants n8n : **jamais dans le dépôt** (il est public).

## Principe (avis de Fable et de Claude, discuté avec Jérôme ; rien n'est tranché ni codé)
- **Pas de branche par client, pas de module sur mesure par défaut** (règle du 18/10/2026 : même code partout). Un module sur mesure activé pour un seul client ne se justifie que pour un besoin d'écran vraiment complexe.
- **Le mécanisme est général, le contenu est une donnée** : une table par espace `crm_actions` (`<module>_<table>`) : `{ id, libelle, cible: 'affaire'|'projet'|'personne', workflowId, actif, confirmation }`. La fiche lit les lignes dont la `cible` correspond et dessine un bouton à contour par ligne (jamais jaune : l'action principale reste celle de la fiche). Chez Jérôme : même écran, même table, avec un workflow `interne-…`.
- **Configuration** : par Jérôme seul, avec l'outil en ligne de commande des clients (`scripts/nouveau-client.js`, simulation puis `--ecrire`), par exemple « ajouter-action <client> --cible affaire --libelle … --workflow <identifiant> ». Un éditeur client ne choisit **jamais** le `workflowId` (il pourrait viser le workflow d'un autre). Plus tard : un écran de Réglages où l'éditeur peut seulement allumer, éteindre et renommer un bouton (`workflowId` et `cible` écrits par le serveur seulement ; 10 actions au plus par espace).
- **Déclenchement** : le bouton n'appelle jamais n8n directement. Une fonction appelable du serveur (`crmLancerAction { actionId, ficheId }`) relit la ligne `crm_actions` **elle-même** (jamais le `workflowId` envoyé par la page), vérifie le rôle (éditeur) et `actif`, journalise (liste blanche : client, action, fiche, statut, durée), puis appelle n8n. Le workflow reçoit seulement `{ client, ficheId, actionId, demandePar, demandeLe }`, **jamais le contenu de la fiche** : il la relit par la porte du client.
- **Retour** : le brouillon e-mail est l'affaire du workflow ; la copie en document joint passe par une nouvelle action de la porte (`affaires.joindreLien`, qui réutilise `joindreLien` du serveur MCP : l'onglet Documents existe déjà) ; l'état du bouton (« Devis demandé », « Devis joint ») vient d'une table fermée aux navigateurs (`crm_actions_lancements`) que la fonction écrit et que le workflow clôt par la porte. Pas de passage par « À valider » : c'est la personne qui a cliqué. Protection contre les doublons : un lancement en cours désactive le bouton quelques minutes.

## Décision de Jérôme à prendre avant de construire (désaccord à trancher)
Aujourd'hui l'application ne fait **aucun appel sortant vers n8n** (règle « lecture seule » et un test dans `tests/automatisations-statique.test.js`). Le bouton demande d'en ouvrir **un seul**, dans **un seul fichier**, borné par un test (seul ce fichier fait un POST, vers un chemin fixe, avec un identifiant lu dans `crm_actions`). Deux façons :
1. **Webhook n8n par workflow** (avis de Claude : le plus courant et le plus simple à tester). Inconvénient : une adresse + un secret à ranger côté serveur **par client** (Secret Manager), jamais dans la page.
2. **API d'administration de n8n** avec la clé déjà rangée (avis de Fable : pas de secret de plus par client). **À vérifier d'abord dans le n8n de Jérôme** que l'API permet bien de lancer un workflow à la demande ; sinon seul le webhook reste.

## Prérequis, dans l'ordre (Fable)
1. **La porte des workflows côté plateforme clients (base 2)** : elle n'existe pas encore (`docs/porte-cles.md` section 6). Prérequis absolu, déploiement manuel (liste d'arrêt).
2. Actions de porte `affaires.lire` et `affaires.joindreLien` (d'abord chez Jérôme, avec un workflow `interne-…`).
3. Table `crm_actions`, bouton sur la fiche et commande de configuration, d'abord chez Jérôme avec un faux devis.
4. Fonction de lancement, décision sur l'appel sortant, état du bouton.
5. Déploiement plateforme (règles, fonctions, hébergement, MCP : quatre lancements du workflow manuel), clé du client, workflow du client étiqueté `client-<identifiant>`.

## Risques à éviter
`workflowId` ou adresse de webhook dans la page ; contenu de la fiche envoyé à n8n par la fonction ; « n'importe quel POST » vers n8n (jamais `activate` ni `credentials`) ; confondre action demandée par une personne et proposition de l'IA (deux circuits, même journal) ; doublons de brouillons ; SIRET, RIB, tarif ou nom de banque dans le dépôt.
