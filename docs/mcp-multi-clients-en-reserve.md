# MCP pour les clients (chantiers 9, 10 et 11) : étude d'origine

> **Sorti de la réserve le 16/10/2026** : le MCP client est construit, voir `mcp-clients.md` (ce qui est fait, déploiement, ce qui n'est pas vérifié). Ce document garde l'étude d'origine et le plan de tests M1 à M15 (écrits dans `tests/mcp-clients.test.js`).

**Décision de Jérôme (11/10/2026)** : aucun client ne demande le MCP. On ne le développe **pas** maintenant. Cette page garde l'étude et le plan de tests pour le jour où un client le demande. Rien n'est à faire tant qu'il n'y a pas de demande.

Sources : `docs/etude-reutilisation-coque.md` (sections 5, 5 bis, 6, risques) et `docs/mcp-oauth.md`.

## Ce que ce serait
Chaque client pourrait brancher son assistant (Claude, éventuellement ChatGPT) sur **ses propres données** : lire et piloter ses automatisations en parlant. Un lien par client, du type `…/mcp/<client>`. L'écran « Autoriser … à accéder à … » prendrait les couleurs du client.

## Ce qui existe déjà (et sert tel quel)
- Le serveur MCP de Jérôme (`functions/src/mcp/`, `functions/src/securite/`) : registre d'outils avec profils (`lecteur`, `bibliothecaire`, `claude-code`), plafonds par jeton, journal, audit.
- La connexion OAuth (`functions/src/oauth/`, PR 49) : PKCE, code à usage unique de 60 s, jeton d'une heure, renouvellement, jeton rejoué = connexion coupée, seules des empreintes sont gardées, révocation immédiate.
- Le registre de modules de la plateforme (`js/os/registre.js`) : chaque module peut déclarer ses outils MCP (déclaration seulement aujourd'hui ; un test compare cette liste au serveur).

## Le risque central
Le serveur MCP lit et écrit avec les **droits d'administration**, qui **contournent les règles Firestore**. Les règles protègent l'écran, pas le serveur. Si une requête MCP n'est pas limitée à l'espace du client, elle peut lire les données d'un autre client. **L'isolation doit être écrite dans le code** :
1. le client est **déduit de l'identité authentifiée** (la connexion), **jamais** d'un paramètre envoyé par l'assistant ;
2. chaque lecture et chaque écriture est limitée à `clients/<client>/…` ;
3. aucun outil ne reçoit de chemin ou de nom de collection libre.

**Règle ferme : aucune mise en ligne du MCP pour les clients sans les tests d'étanchéité ci-dessous.**

## Ce qu'il y aurait à faire (chantier 9, gros et sensible)
1. **Les comptes** : `COMPTES_AUTORISES` (`oauth/config.js`) est une liste en dur pour Jérôme. Elle doit lire les fiches de membres `clients/<client>/membres/<e-mail>`.
2. **Le profil** : aujourd'hui toute connexion OAuth reçoit `claude-code` (tous les droits, suppression comprise). Pour un client, le profil se déduit du rôle (`lecteur` ou `editeur` → profil limité, jamais de suppression ni de restauration par défaut).
3. **L'identité du client dans la connexion** : la connexion enregistrée dans `mcp_oauth` porte l'identifiant du client ; tous les outils le lisent là.
4. **Le lien par client** `…/mcp/<client>` : un client inconnu, désactivé ou sans le module concerné reçoit un refus neutre.
5. **Les outils par module** : chaque module déclare les siens ; seuls ceux des modules **actifs** du client sont proposés.
6. **Les textes et l'émetteur** (`EMETTEUR`, `ORIGINES_AUTORISEES`, « Autoriser Claude à accéder à … ») viennent de la configuration du client.
7. **Les adresses de retour** : seules celles de Claude sont acceptées. ChatGPT n'y est pas : relever son adresse de retour et ses exigences avant de l'ajouter. **Non vérifié** (à relire avant de commencer : les exigences de ChatGPT et de Claude pour un connecteur personnalisé changent).
8. **Les noms d'acteur** (`claude-ai-<compte>`) ne disent pas quel assistant s'est connecté : à prévoir si plusieurs assistants.

## OAuth pour les clients (chantier 11, après le 9)
Comptes lus dans les membres, profil déduit du rôle, client porté par la connexion, écran d'autorisation à ses couleurs, adresse de retour de ChatGPT, noms d'acteur. À noter : la porte OAuth n'accepte aujourd'hui que la connexion Google ; si un jour un autre mode de connexion est ajouté pour les clients, ce contrôle est à assouplir.

## Plan de tests d'étanchéité (chantier 10) : à écrire en même temps que le chantier 9
Principe : deux clients de test, `client-a` et `client-b`, chacun avec des données reconnaissables (noms inventés). Tests sur l'émulateur, relancés à **chaque modification** du MCP, des outils ou des règles.

| N° | Test | Résultat attendu |
|---|---|---|
| M1 | Connexion de `client-a`, lecture de toutes les listes que ses outils proposent | uniquement des données de A |
| M2 | Connexion de A, outil appelé avec l'identifiant de B dans un paramètre (ou dans l'adresse, l'en-tête, le corps) | refus ou ignoré ; **jamais** de donnée de B |
| M3 | Connexion de A, lien `…/mcp/client-b` | refus neutre (sans dire si B existe) |
| M4 | Identifiant d'un document de B demandé par A (lecture, modification, suppression) | « introuvable », aucune écriture chez B |
| M5 | Chemin ou nom de collection libre, `..`, caractères spéciaux, majuscules dans l'identifiant | refusé ; aucun accès hors de `clients/<A>/` |
| M6 | Membre `lecteur` de A appelle un outil d'écriture | refusé |
| M7 | Membre `editeur` de A appelle un outil de suppression ou de restauration | refusé (sauf profil explicitement accordé) |
| M8 | Module non activé chez A | ses outils ne sont ni listés ni appelables |
| M9 | Client désactivé | plus aucune connexion ni aucun outil ne répond |
| M10 | Compte membre de A **et** de B | le lien utilisé choisit l'espace ; jamais un mélange |
| M11 | Jeton ou connexion de A rejoué après révocation | refusé |
| M12 | Jeton d'un client présenté sur le lien d'un autre | refusé |
| M13 | Plafonds par jeton : l'usage de A ne consomme pas le plafond de B | séparés |
| M14 | Journal et audit : chaque appel porte l'identifiant du client et le nom d'acteur | présent, et rien de B dans le journal de A |
| M15 | **Balayage final** : après tous les essais, relire toute la base ; aucune donnée de B écrite sous A et inversement | aucune trace |

Garde-fou à ajouter : un test qui échoue si un outil du MCP accepte un paramètre qui s'appelle `client`, `clientId`, `projet`, `chemin`, `collection` ou `base`.

## Avant de commencer, le jour venu
1. Un client le demande, avec son assistant précis (Claude ? ChatGPT ?).
2. Relire les exigences actuelles de cet assistant pour un connecteur personnalisé.
3. Décider les profils (lecture seule d'abord ?), les outils proposés au client et le plafond d'usage.
4. Fixer l'effort et le budget : chantier lourd, à lancer en deux sessions (construire, puis tests d'étanchéité), chacune finie par une PR.
