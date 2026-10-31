# Cadrage : ne plus pouvoir faire le lien entre le dépôt public et l'activité commerciale

Écrit le 31/10/2026 (**document de cadrage, aucun code, aucun renommage, aucune stratégie exécutée**). Le dépôt est public depuis le 20/10/2026 (`docs/securite-et-pannes.md`, journal du 20/10/2026). Jérôme veut qu'on ne puisse plus relier ce dépôt à son activité commerciale (demande du 29/10/2026, décision de piste du 30/10/2026 : « se cacher dans la forêt », ligne (c) de `.github/A-FAIRE.md`). Ce document compare les stratégies et dit ce qui **ne pourra pas** être caché. Pour ne pas aggraver le problème, il n'écrit **ni le nom du compte GitHub, ni les noms de domaine, ni aucune adresse e-mail** : il parle de « le nom de l'entreprise » et de catégories.

## 0. Le problème en 5 lignes

1. Quiconque ouvre le dépôt peut lire le nom de l'entreprise partout : nom du dépôt, du compte, des projets Firebase, adresses web, comptes de service, variables.
2. Mesure du 31/10/2026 sur la version actuelle : le nom apparaît dans **377 fichiers sur 2 182** (contrôle du 29/10/2026 : 360 sur 1 833). Répartition : `tests/` 122, `wiki/` 99, `docs/` 72, `functions/` 21, `js/` 18, `scripts/` 14, `functions-plateforme/` 8, `.github/` 6, `outils/` 4.
3. Les occurrences les plus fréquentes ne sont pas des mots du texte : ce sont des **identifiants techniques** (les deux projets Firebase, leurs adresses `.web.app`, leurs comptes de service, deux noms de secrets GitHub, les domaines personnalisés du site et de n8n, le nom du compte GitHub, l'adresse e-mail de Jérôme dans le code et les tests).
4. L'**historique** de Git contient les mêmes mots, plus les noms et adresses e-mail des auteurs de chaque commit. Nettoyer les fichiers d'aujourd'hui ne les efface pas.
5. Une partie de ces identifiants est **imposée** (un projet Firebase ne se renomme pas) et une autre est **déjà vue** par des clients : tout masquer est impossible, seul « moins visible » est possible.

## 1. Ce qui existe déjà (vérifié par `grep` le 31/10/2026)

| Sujet | Où | Constat |
|---|---|---|
| Deux projets Firebase | `.firebaserc` (`default` et `plateforme`) | l'identifiant d'un projet **ne peut pas être changé** une fois créé ; seul le nom affiché peut l'être |
| Adresses `.web.app` | plus de 200 lignes dans une centaine de fichiers (ordre de grandeur, à recompter par le script de la PR 1 ; hébergement du CRM de Jérôme et de la plateforme des clients) | un site d'hébergement a aussi un identifiant fixe ; on peut en créer un nouveau dans le projet, pas renommer l'ancien |
| Comptes de service | `…iam.gserviceaccount.com`, une centaine de lignes (ordre de grandeur) | ils portent l'identifiant du projet ; non renommables |
| Secrets de CI | `.github/workflows/*.yml` : `FIREBASE_SERVICE_ACCOUNT_…` (deux secrets, une dizaine d'usages dans les trois workflows) | les secrets sont **propres à un dépôt** : un nouveau dépôt les perd |
| Domaines personnalisés | environ 50 occurrences (site, n8n) | adresses publiques de Jérôme, déjà utilisées par des outils |
| Compte GitHub | `js/os/deploiement.js:12`, `js/modules/crm/logique.js:158`, `PROMPT-CONSTRUCTION.md`, des tests | le nom du compte est écrit en dur dans des liens et dans une constante |
| Nom du produit | `README.md`, `CLAUDE.md`, `package.json`, `wiki/` | le nom du produit contient celui de l'entreprise, comme le nom du dépôt |
| Historique | 50 commits visibles dans ce clone **partiel** (dépôt cloné en profondeur 50) ; le nombre réel est plus grand | auteurs et adresses e-mail de tous les commits, tous les anciens fichiers |
| Clés web Firebase | restreintes aux sites web (journal du 20/10/2026) | publiques par conception ; la restriction par adresse en dépend |
| Décision de départ | `.github/A-FAIRE.md`, ligne (c) du 30/10/2026 | nouveau dépôt sous un nom neutre, historique vidé après nettoyage du code, code lisible gardé, **pas d'obfuscation**, le nom de famille seul toléré ; marquée « À cadrer » |

## 2. Les stratégies comparées (aucune n'est exécutée)

### (a) Laisser tel quel, ne rien ajouter de nouveau

- **Fait** : seulement la discipline des nouveaux fichiers (pas de nouvel identifiant, pas de nom dans les nouvelles docs).
- **Coût** : nul. **Gain** : presque nul (les 377 fichiers et l'historique restent lisibles).
- **Risque** : le lien existe déjà et ne disparaît jamais.

### (b) Renommer ce qui se renomme

Possible : le nom du dépôt (GitHub garde une redirection de l'ancien nom, ce qui conserve le lien visible), le nom du compte GitHub (même remarque), les textes (README, docs, wiki, `CLAUDE.md`), le nom affiché des projets Firebase, les noms de variables et de secrets.
Impossible : les identifiants des projets Firebase, des sites d'hébergement et des comptes de service.
- **Conséquences** : les liens vers le dépôt écrits en dur changent (`deploiement.js:12`, la constante du compte, les tests) ; les secrets GitHub à recréer si le dépôt change de compte ; les clés web restreintes à revoir si une adresse change.
- **Gain** : moyen. Les identifiants techniques, eux, restent. Quelqu'un qui connaît le dépôt retrouve l'ancien nom par la redirection tant qu'elle existe.

### (c) Nouveau dépôt propre / historique vidé

Un nouveau dépôt, sous un compte et un nom neutres, avec un seul commit initial fait de l'état nettoyé du code.
- **Pour** : seule voie qui efface les auteurs, les adresses e-mail et les anciens fichiers de l'historique ; c'est la décision de piste du 30/10/2026.
- **Risques** :
  1. **Perte d'historique** : plus de `git blame`, de PR passées, de journal de décisions dans les commits. Le dossier `docs/` en garde l'essentiel (c'est son rôle).
  2. **Ce qui est déjà publié** : le dépôt actuel est public depuis 11 jours. Il a pu être cloné, forké, indexé par des moteurs de recherche, copié par des archives publiques. Supprimer l'ancien dépôt n'efface **pas** les clones, ni les forks (un fork reste, tant que le propriétaire ne le supprime pas), ni les caches. Seul un signalement à GitHub peut retirer des vues en cache de contenu sensible.
  3. **Secrets déjà publiés** : le balayage du 20/10/2026 n'a trouvé aucune clé privée ni jeton ; les deux clés web sont publiques par conception. Rien à révoquer de ce côté.
  4. **Rupture de la chaîne de publication** : les secrets de CI, les droits d'écriture des règles (`publier-regles.yml`), le déploiement (`firebase-hosting.yml`, `deploiement-plateforme.yml`) sont à recréer dans le nouveau dépôt. Le suivi des PR (abonnements de session, étiquettes, auto-fusion) repart de zéro.
  5. **Le nettoyage du code doit passer avant** : sinon on recopie le nom dans le nouveau dépôt. Il faut une liste fermée de ce qu'on renomme et de ce qu'on laisse (identifiants techniques imposés).
- **Gain** : le plus fort possible pour le dépôt lui-même, **sans effet** sur les adresses web.

### (d) Dépôt privé quand les minutes le permettent

Remettre le dépôt en privé (les minutes d'Actions gratuites sont épuisées en privé, c'est la raison du passage en public le 20/10/2026). **Décision permanente de Jérôme : ne pas le remettre en privé de ta propre initiative.**
- **Gain** : arrête la publication future. Ne retire rien de ce qui a déjà été copié.
- **Coût** : minutes d'Actions payantes ou un autre exécuteur de tests ; à chiffrer.
- **Se combine** avec (c) : un dépôt neutre peut aussi être privé le jour où le budget le permet.

### Comparaison

| | (a) tel quel | (b) renommer | (c) nouveau dépôt | (d) privé |
|---|---|---|---|---|
| Efface le nom des fichiers | non | en partie | oui, si nettoyé avant | non |
| Efface l'historique et les adresses e-mail des auteurs | non | non | **oui** | non (masqué, pas effacé) |
| Efface les adresses `.web.app` | non | non | non | non |
| Stoppe ce qui sera publié demain | non | non | oui (nouveau nom neutre) | **oui** |
| Efface ce qui est déjà copié | non | non | non | non |
| Travail | aucun | moyen | élevé | faible, mais coût mensuel |
| Réversible | oui | en partie | non (l'ancien dépôt supprimé ne revient pas) | oui |

**Recommandation** : (c) en ordre sûr, précédée du nettoyage, avec (d) en option plus tard. Concrètement : (1) un **inventaire fermé** des occurrences, classées « à renommer » / « imposé, on le garde » / « à supprimer » ; (2) le nettoyage du code et des docs dans le dépôt actuel, par PR petites ; (3) le nouveau dépôt, créé par Jérôme ; (4) bascule de la CI ; (5) l'ancien dépôt **archivé en privé** (pas supprimé) pendant une période, pour garder une sortie de secours. **Décision prise seule** : ne jamais supprimer l'ancien dépôt dans la même journée.

## 3. Ce qui ne peut PAS être caché

| Élément | Pourquoi |
|---|---|
| Adresses `.web.app` des deux projets déjà déployées chez des clients | un client les voit dans son navigateur et dans ses connecteurs (ChatGPT, Claude) ; changer l'adresse casse ces connecteurs |
| Identifiants des projets Firebase et des comptes de service | immuables ; visibles dans les adresses `.web.app` et dans les messages d'erreur de Google |
| Les clés web Firebase | publiques par conception : elles sont dans le code envoyé au navigateur de tout visiteur |
| Domaines personnalisés déjà utilisés (site, n8n) | publics par nature (DNS, certificats publiés dans les registres de transparence) |
| Clones, forks, caches, archives faits entre le 20/10/2026 et la bascule | hors de portée |
| Le texte de ce que voit un client (nom du produit à l'écran, PDF, e-mails) | si le produit s'appelle comme l'entreprise, le lien est dans le produit |
| Les décisions des commits déjà vus dans des PR publiques | idem, gardées par des copies tierces |

**Honnêtement** : (c) rend le lien **difficile à trouver par hasard**, pas impossible à établir pour quelqu'un qui cherche (ouvrir un site client suffit à lire l'adresse `.web.app`). Pour supprimer aussi ça, il faudrait de nouveaux projets Firebase, donc **migrer les données de tous les clients** : liste d'arrêt, hors de ce cadrage.

## 4. Risques

| Risque | Parade |
|---|---|
| Casser un déploiement en renommant à moitié | inventaire fermé, jamais de renommage « à la volée » ; les tests statiques vérifient les adresses attendues |
| Perdre de l'historique utile | `docs/` reste la mémoire ; l'ancien dépôt archivé en privé |
| Croire que c'est caché alors que ça ne l'est pas | la section 3 est recopiée dans la PR et dans le rapport |
| Un secret oublié dans l'historique d'un fork | le balayage du 20/10/2026 est refait avant la bascule, sur tout l'historique, avec la recherche de secrets de GitHub |
| Renommer le compte GitHub : l'ancien nom redevient libre (fin de la redirection), quelqu'un peut le reprendre | garder le nom réservé (compte de repli) ou ne pas renommer ; non résolu par un renommage |
| Renommer des secrets = modifier `.github/workflows/*.yml` | liste d'arrêt (workflows) : Jérôme fusionne |
| Casser les connecteurs des clients (changement d'adresse) | aucune adresse déjà déployée ne change dans ce chantier |
| Le travail ralentit les autres chantiers | une seule PR « nettoyage » à la fois, fusionnée dans la journée |

## 5. Découpage en PR (rien n'est fait)

| # | PR | Contenu | Fable | Liste d'arrêt |
|---|---|---|---|---|
| 1 | Inventaire fermé | un script en lecture seule qui compte les occurrences par catégorie ; un tableau dans `docs/` (sans écrire les noms) | non requise | non |
| 2 | Textes : README, docs, `CLAUDE.md`, wiki | remplacer le nom dans les phrases ; régénérer `wiki/` ; ne pas toucher aux identifiants techniques | Oui si `CLAUDE.md` ou un brief d'agent change | non |
| 3 | Constantes : compte GitHub et liens (**avant** la PR 4, jamais en parallèle : `js/modules/crm/logique.js:158` et `:159` sont voisines) | `deploiement.js:12`, `logique.js:158`, tests : une seule constante lue partout | Oui (liens et adresses : règle de Jérôme du 26/10/2026) | non |
| 4 | Adresses e-mail dans les **tests et les textes affichés** seulement | les remplacer par des adresses de test `exemple.test` ; `tests/mcp-clients.test.js:963` utilise l'adresse réelle comme garde-fou négatif : à remplacer par un motif. **Pas les adresses fonctionnelles** : plusieurs sont des contrôles de sécurité (liste des comptes autorisés du MCP et de la veille, administrateurs, propriétaire par défaut, configuration du navigateur) ; les remplacer casserait la connexion MCP et les droits d'administration, et l'accès de secours par l'identité Google de Jérôme (décision du 02/10/2026) | Oui | non |
| 4 bis | Identités fonctionnelles hors du dépôt | document Firestore de configuration ou secret de déploiement, à la place des adresses écrites dans le code ; PR « sécurité » à part | Oui | **Oui** (secret, sécurité) |
| 5 | Nouveau dépôt et CI | création par Jérôme, secrets recréés, workflows rejoués | Oui (workflows) | **Oui** : secrets, workflows, déploiements |
| 6 | Archivage de l'ancien dépôt | par Jérôme, en privé | non | **Oui** |

## 6. Questions pour Jérôme (5)

1. **Veux-tu confirmer (c) comme cible, (d) plus tard ?** Recommandé : oui.
2. **Le produit change-t-il de nom à l'écran ?** Recommandé : décision séparée, après le nettoyage des fichiers (l'écran n'est pas dans ce chantier).
3. **Es-tu d'accord que les adresses `.web.app` déjà en service ne changent pas ?** Recommandé : oui (sinon migration de tous les clients).
4. **Quelle adresse e-mail pour les commits du nouveau dépôt ?** Recommandé : une adresse neutre dédiée, ou l'adresse de redirection que GitHub propose (`noreply`).
5. **Archiver l'ancien dépôt en privé 3 mois, puis décider ?** Recommandé : oui.

## 7. Ce qui n'est PAS fait

Aucun renommage, aucun nouveau dépôt, aucun changement de CI, aucune réécriture d'historique, aucun signalement à GitHub, aucun changement de visibilité, aucune donnée touchée. Les chiffres sont des comptes de lignes faits le 31/10/2026 ; ils changent à chaque PR.
