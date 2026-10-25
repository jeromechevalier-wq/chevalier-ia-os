# La page « Déploiement » des Réglages

Écrit le 25/10/2026. La page existe dans **chaque** espace, chez Jérôme comme chez chaque client (même code) : Réglages > **Déploiement** (adresse `#/reglages/deploiement`, ou `#/espace/<client>/reglages/deploiement`). Elle est réservée aux éditeurs de l'espace.

## À quoi elle sert

Elle reprend la checklist de `docs/deploiement-client.md`, étape par étape, et dit pour **cet** espace ce qui est en ordre :

- **Vert** : vérifié automatiquement, ou coché « C'est fait » (avec la date).
- **Rouge** « À réparer » : le contrôle a trouvé un manque. Une phrase simple dit comment réparer, avec le lien exact (le réglage de l'appli, le mode d'emploi dans `docs/`, ou la page de la console Google du projet).
- **Orange** « Impossible de vérifier » : le contrôle n'a pas abouti (serveur injoignable, données pas encore lues). Clique sur « Revérifier ».
- **Gris** « À vérifier à la main » : une étape humaine ou un réglage que l'appli ne peut pas lire (e-mail de bienvenue, utilisateurs test de Gmail, MCP…). On la fait, puis on coche « C'est fait ».

En tête : le résumé (« 11 sur 14 vertes ») et le bouton **Revérifier**. Les contrôles se lancent aussi à l'ouverture de la page. Si un jour quelque chose ne marche plus chez un client, ouvre cette page chez lui : toutes les cases doivent être vertes.

Ce qui est contrôlé tout seul aujourd'hui : les fonctions du serveur répondent ; les personnes autorisées sont cohérentes (chez un client, la liste affichée et les fiches d'appartenance disent la même chose, avec au moins un éditeur) ; le dossier Google Drive racine des projets est choisi ; avec le module Devis : « Mon entreprise » complète (le même calcul que le point rouge), l'étape où vivent les devis réglée et existante, au moins un article au catalogue, et le réglage CORS du stockage (le navigateur lit un fichier qui n'existe pas : si la réponse est lisible, le réglage est fait).

## Ce qu'elle n'affiche jamais

Aucune valeur de secret ni de clé, aucune adresse e-mail, aucun nom ni identifiant de dossier, aucun chemin de stockage : seulement « vérifié / à réparer / impossible de vérifier ». La fonction du serveur `deploiementVerifier` ne renvoie que des états fixes et la version du serveur ; elle ne lit aucun secret et n'écrit rien. Les cases cochées sont rangées dans `crm_parametres/deploiement` de l'espace, sous la forme `{ <étape>: { fait: true, le: 'AAAA-MM-JJ' } }`, sans nom de personne.

## Ajouter une étape quand on livre une fonctionnalité

La liste est **écrite dans le code** : elle ne se modifie pas à l'écran.

- Étape commune à tous les espaces : l'ajouter à `ETAPES_COQUE` dans `js/os/deploiement.js`.
- Étape d'un module : l'ajouter dans le fichier `deploiement.js` du module (`js/modules/devis/deploiement.js`, `js/modules/crm/deploiement.js`) avec `module: '<id>'` : elle n'apparaît que si le module est actif. Le module la donne à la page par son API, `controlesDeploiement()` (dans son `index.js`), qui rend `{ etapes, verifier }`. Un nouveau module fait pareil ; la coque ne cite jamais un module.
- Chaque étape a : un identifiant, un moment (`avant`, `pendant`, `google`, `apres`), un libellé, un type (`auto` ou `manuel`), une phrase « comment réparer », et un lien `https://` (`{projet}` = le projet Google de l'espace) ou une route de l'appli. Le test `tests/deploiement-logique.test.js` refuse une étape incomplète, et le mot « CRM ».
- Un contrôle automatique rend seulement `ok`, `manque` ou `inconnu` ; s'il plante, il vaut `inconnu` et les autres continuent.
- Un contrôle qui a besoin du serveur s'ajoute à `CONTROLES_SERVEUR` (`functions/src/coeur/deploiement.js`, code commun aux deux projets), puis dans `functions/src/deploiement-appel.js` (chez Jérôme) et `functions-plateforme/src/deploiement.js` (clients). **Jamais de secret déclaré** dans les options de la fonction : un secret absent ferait échouer le déploiement de toutes les fonctions.

## Ce que la page ne fait pas (pour l'instant)

- Pas de vue « tous mes clients » chez Jérôme.
- Pas de suivi pas à pas « où j'en suis pour ce nouveau client » (une seconde PR plus tard).
- Pas de contrôle de nuit : seulement à l'ouverture et avec « Revérifier ».
- Pas de lecture des secrets n8n ni du MCP : « Préparer l'e-mail » et « Assistant (MCP) configuré » restent des cases à cocher.
- Le bouton « Revérifier » ne répare rien : il relit l'état.

## À savoir

- La fonction `deploiementVerifier` de la plateforme ne se publie qu'avec le workflow **manuel** « Déploiement plateforme clients » (par Jérôme). Tant qu'elle n'est pas publiée, chez un client les deux lignes du serveur restent orange et la page dit « Impossible de vérifier pour le moment » ; le reste marche.
- L'essai CORS n'a pas encore été vérifié contre le vrai stockage Google : si la ligne reste rouge alors que le réglage est fait, vérifier avec « Copier dans Drive » sur un devis et le signaler à Claude.
