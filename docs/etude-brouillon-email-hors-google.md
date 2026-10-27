# Étude : un brouillon d'e-mail hors Google (27/10/2026)

Recherche seulement, aucun code. Aucune adresse, aucun identifiant, aucun nom de client dans cette page (dépôt public).

## La question

Aujourd'hui « Préparer l'e-mail » fait créer par n8n un **brouillon Gmail** (PDF joint). L'appli et n8n n'envoient jamais : le client relit et envoie lui-même. Un client sans Google (par exemple une boîte e-mail basique chez OVH) peut-il avoir la même chose, si on donne à n8n seulement les identifiants SMTP/IMAP de sa boîte ?

## Réponse courte

**Non, pas avec les nœuds de base de n8n.** SMTP sert seulement à **envoyer** : il n'a pas de notion de brouillon, et envoyer est justement ce qu'on s'interdit. Un brouillon, c'est un message **déposé dans le dossier « Brouillons » par IMAP** (commande APPEND). Or, vérifié dans n8n : le nœud IMAP natif (« Email Trigger (IMAP) ») **ne fait que lire** les nouveaux messages, et le nœud « Send Email » ne parle que SMTP (il envoie, ou envoie puis attend une réponse). Aucun des deux ne sait écrire dans un dossier.

**Oui, la voie propre existe pour Microsoft 365 / Outlook** : le nœud natif « Microsoft Outlook » a une ressource **Brouillon > Créer** (objet, texte, destinataires, copie, pièces jointes) et même « Envoyer un brouillon » (qu'on n'utilisera jamais). C'est l'équivalent exact du nœud Gmail actuel.

## Les pistes

| Piste | Faisable ? | Ce qu'il faut côté client | Risque | Coût | Effort |
|---|---|---|---|---|---|
| **A. Microsoft 365 / Outlook, nœud natif « Brouillon > Créer »** | **Oui**, vérifié dans n8n | Une connexion Microsoft (OAuth, ou application Entra avec droit d'écrire les e-mails de la boîte). Le client accepte une fois ; les clés restent dans les identifiants n8n, jamais dans le dépôt | Faible : droit limité à la boîte ; ne jamais cocher le droit d'envoi si on peut l'éviter. Une application Entra demande parfois un administrateur du client | 0 (nœud inclus) | Petit : copie du workflow actuel, on remplace le nœud Gmail |
| **B. SMTP seul (« Send Email »)** | **Non** pour un brouillon : il envoie | Identifiants SMTP | Fort : enverrait vraiment, contre la règle « l'appli n'envoie jamais » | 0 | Sans objet |
| **C. IMAP natif (« Email Trigger »)** | **Non** : lecture seule, pas d'écriture | Identifiants IMAP | Sans objet | 0 | Sans objet |
| **D. Nœud Code avec une bibliothèque IMAP** (écrire le message par APPEND) | **Peu probable, non vérifié sur notre n8n** : le bac à sable du nœud Code n'a pas d'accès réseau, et les modules externes ne passent que s'ils sont autorisés par l'administrateur du serveur n8n | Identifiants IMAP de la boîte | Moyen : on touche à la configuration du serveur n8n partagé par tous les clients | 0 | Moyen à grand, fragile |
| **E. Petit service à nous** (nœud HTTP vers un mini-serveur qui fait l'APPEND IMAP) | **Oui, techniquement** | Identifiants IMAP, **stockés dans ce service** (donc un nouvel endroit à protéger) | Moyen : nouveau serveur à héberger, sécuriser, surveiller ; les mots de passe de boîtes e-mail de clients chez nous | Un petit hébergement | Grand : service + secrets par client + tests + règles (un seul accès sortant, etc.) |
| **F. Nœud communautaire « IMAP écriture » installé dans n8n** | **Non vérifié** : les outils MCP ne montrent aucun nœud communautaire installé ni installable ; à confirmer dans l'administration de n8n | Identifiants IMAP | Moyen : code tiers non contrôlé | 0 | Moyen, dépend de l'existence du nœud |
| **G. Repli sans brouillon : un fichier « .eml » ou un lien « mailto: »** (n8n prépare le message complet, le client l'ouvre dans son logiciel de messagerie, qui le montre en fenêtre de rédaction) | **Oui** | Rien (aucun identifiant) | Très faible. Limite : un « mailto: » ne porte pas le PDF ; un « .eml » le porte mais s'ouvre selon le logiciel installé | 0 | Petit à moyen |

## Recommandation

**Pour les clients sans Google : piste A (Microsoft 365 / Outlook).** C'est la seule piste qui donne un vrai brouillon, avec le PDF, sans serveur à nous, sans code tiers, avec le même schéma que Gmail (brouillon créé, jamais envoyé). Le workflow `client-<id>-devis-preparer-email` serait une copie de l'actuel avec le nœud Outlook à la place du nœud Gmail ; la plateforme n'a rien à changer (même webhook, mêmes actions de porte).

**Pour une boîte basique OVH (ou autre fournisseur IMAP simple) : ne pas promettre de brouillon.** Proposer la piste G (fichier à ouvrir dans le logiciel de messagerie) comme repli honnête, ou conseiller au client de passer à Microsoft 365 ou Google Workspace. La piste E n'est à envisager que si plusieurs clients en ont vraiment besoin : c'est un chantier de serveur, donc relecture Fable obligatoire et décision de Jérôme.

## Ce qu'il faudrait décider

1. Jérôme valide-t-il la piste A pour les clients Microsoft 365 (oui / non) ?
2. Pour les boîtes OVH : on dit « pas de brouillon, voici le repli (piste G) », ou on attend d'avoir un client qui paie pour la piste E ?
3. Avant de construire A : un client Microsoft 365 réel (ou un compte d'essai) pour tester ; et savoir s'il accepte de donner l'autorisation une fois (OAuth) ou s'il faut un administrateur de chez lui.
4. À vérifier plus tard sur notre n8n (pas faisable avec les outils de cette recherche) : les modules autorisés dans le nœud Code (piste D) et la présence de nœuds communautaires (piste F).

## Rappels de sécurité

- Les identifiants du client (connexion Microsoft, SMTP, IMAP) vivent **seulement dans les identifiants n8n** (ou Secret Manager pour un service à nous), **jamais dans le dépôt**.
- Quel que soit le fournisseur, le workflow ne doit **jamais envoyer** : brouillon seulement, le client relit et envoie lui-même.
- Même règles de nommage et de secrets par client que dans `docs/ajouter-un-bouton-workflow.md`. Rien n'est déployé chez les clients sans Jérôme.
