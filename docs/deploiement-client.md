# Déployer chez un nouveau client : la checklist

Écrit le 23/10/2026 à partir de la liste de Jérôme. Jérôme a tranché le MCP, le dossier Drive et la visio le 23/10/2026 ; **le seul point « ? » restant est l'accord écrit sur les données**. Les commandes détaillées sont dans `docs/nouveau-client.md` ; le déploiement de la plateforme est dans `docs/deploiement-plateforme.md`.

Chemin du dépôt sur le Mac de Jérôme (à utiliser dans chaque commande) : `/Users/jeromechevalier/Code-Chevalier-IA/chevalier-ia-os`.

## Avant la séance

1. **Cadrage** : ce que le client veut voir dans son espace, les modules à activer (`affaires`, `projets`, `automatisations`), qui sont les personnes à faire entrer (adresse Google de chacune, éditeur ou lecteur). ? **Accord écrit sur les données stockées** : déjà couvert par le contrat, ou à ajouter ?
2. **Récupérer l'adresse Google** de chaque personne (en minuscules). Elle doit être un compte Google : c'est ce qui sert à se connecter.
3. **Vérifier la plateforme** : si du code a changé depuis le dernier client, le workflow manuel « Déploiement plateforme clients » est à lancer par Jérôme (jamais par Claude).
4. Préparer le logo et au plus 4 images (png, jpg, webp ou gif ; 2 Mo au plus par l'outil de Jérôme, 1,5 Mo par image si le client les ajoute lui-même depuis « Mon espace ») dans un dossier du Mac, **hors du dépôt**.

## Pendant la séance

| # | Étape | Qui | Détail |
|---|---|---|---|
| 1 | **Créer l'espace client** | Jérôme, au Terminal | `nouveau-client.js` en **simulation**, relire, puis `--ecrire`. Identifiant du client : 17 caractères au plus s'il aura des automatisations. Puis `node scripts/nouveau-client.js afficher <client>`. |
| 2 | **Vérifier la connexion** | Jérôme + client | Ouvrir `https://chevalier-ia-app.web.app/espace/<client>`, se connecter avec **son** compte Google, voir son espace, créer une fiche de test puis la supprimer. Sans ça, on ne sait pas si l'espace marche. |
| 3 | **E-mail de bienvenue** | Jérôme | Modèle à rédiger une fois (adresse de l'espace, mode d'emploi court, comment demander de l'aide). Envoyé pendant ou juste après la séance. |
| 4 | **Dossier racine Google Drive**, avec lui | Jérôme + client | Créer **à la main** le dossier racine de ses projets dans **son** Drive, avec le même nom chez tous les clients (par défaut `Chevalier-IA/Projets`) ; régler le chemin dans ses Réglages. Rien à coder. |
| 5 | **Configurer le MCP** | Jérôme | **Pour tous les clients** : c'est ce qui permet au client d'utiliser Claude avec ses propres données (voir `docs/mcp-clients.md`). |
| 6 | **Installer l'appli sur son téléphone** | Jérôme + client | Ouvrir l'adresse de l'espace sur le téléphone, puis « Ajouter à l'écran d'accueil ». |
| 7 | **Raccourci épinglé sur téléphone et ordinateur** | Jérôme + client | Épingler l'adresse (marque-page ou raccourci du bureau) pour qu'elle soit à un clic. |
| 8 | **Rendez-vous de suivi** | Jérôme | À fixer **avant de partir**, par exemple dans une semaine, pour voir ce qui bloque. |

Les étapes 4, 6 et 7 se font **à deux, en visio** : Jérôme guide, le client agit sur son propre ordinateur et téléphone.

## Après la séance

- **Sauvegarde** : `node scripts/donnees-client.js exporter <client> --avec-images` (fichier hors du dépôt, jamais envoyé par message). À noter dans le dossier du client où se trouve la commande, pour le jour où il part.
- **Désactivation** (le client part) : `desactiver-client <client>` ne supprime rien ; la suppression définitive est un chemin à part (`docs/nouveau-client.md`, « Supprimer un client »).
- **Automatisations n8n** : si le client en a, créer le workflow étiqueté `client-<identifiant>` (nom commençant par `client-<identifiant>-`), avec sa propre clé de porte (`docs/porte-cles.md`). ? La porte de la base 2 n'existe pas encore : à faire avant.
- **Bouton qui lance un workflow** (« Générer devis », etc.) : voir `docs/ajouter-un-bouton-workflow.md`.
- **Noter** dans le journal des clients ce qui a été activé et la date, **sans** donnée personnelle ni secret dans le dépôt.

## Cas d'erreur courants

- « existe déjà » : normal, la commande ne crée jamais de doublon ; relancer ne casse rien.
- Le client voit « indisponible » : l'espace est désactivé, ou son adresse n'est pas dans la liste des membres (en minuscules).
- Les images échouent : voir l'étape « nom du stockage » de `docs/nouveau-client.md`.
- Le MCP du client ne répond pas : interrupteurs d'urgence dans `docs/securite-et-pannes.md`.
