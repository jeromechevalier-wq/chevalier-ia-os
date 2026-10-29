# Déployer chez un nouveau client : la checklist

> **Un deuxième serveur de plateforme** (nouveau projet Google) : liste complète dans l'ordre dans [deploiement-nouveau-serveur-plateforme.md](deploiement-nouveau-serveur-plateforme.md).

Écrit le 23/10/2026 à partir de la liste de Jérôme. Jérôme a tranché le MCP, le dossier Drive et la visio le 23/10/2026 ; **le seul point « ? » restant est l'accord écrit sur les données**. Les commandes détaillées sont dans `docs/nouveau-client.md` ; le déploiement de la plateforme est dans `docs/deploiement-plateforme.md`.

**Page « Déploiement » de l'appli** : dans chaque espace (chez Jérôme comme chez chaque client), Réglages > Déploiement reprend ces étapes une à une, avec un contrôle automatique quand c'est possible et une case « C'est fait » sinon (mode d'emploi : `docs/page-deploiement.md`). Si un jour quelque chose ne marche plus chez un client, ouvre cette page chez lui : toutes les cases doivent être vertes.

Chemin du dépôt sur le Mac de Jérôme (à utiliser dans chaque commande) : `/Users/jeromechevalier/Code-Chevalier-IA/chevalier-ia-os`.

## Avant la séance

1. **Cadrage** : ce que le client veut voir dans son espace, les modules à activer (`affaires`, `projets`, `automatisations`), qui sont les personnes à faire entrer (adresse Google de chacune, éditeur ou lecteur). ? **Accord écrit sur les données stockées** : déjà couvert par le contrat, ou à ajouter ?
2. **Récupérer l'adresse Google** de chaque personne (en minuscules). Elle doit être un compte Google : c'est ce qui sert à se connecter.
3. **Vérifier la plateforme** : si du code a changé depuis le dernier client, le workflow manuel « Déploiement plateforme clients » est à lancer par Jérôme (jamais par Claude). Le choix `hosting` publie la page ; `regles` publie les règles Firestore et Storage ; `tout` les deux. **Les fonctions du serveur de la plateforme** (celles du module Devis : finaliser, statut, nouvelle version, archiver, supprimer, enregistrer un envoi) se publient avec la plateforme : si le code des devis a changé (ex. `devisEnregistrerEnvoi`), vérifier avec Jérôme qu'elles sont à jour **avant** la séance. **Le PDF des devis** (`devisPdf`, `devisPdfLien`, `devisPdfAuto`, fabriqué par le serveur à la finalisation) se publie avec elles, mais demande un compte de service `devis-pdf` à créer d'abord : **tant qu'il n'existe pas, ne lance pas le choix `fonctions`** (il publie toutes les fonctions et elles échoueraient ensemble). Mode d'emploi : `docs/pdf-clients.md`.
4. Préparer le logo et au plus 4 images (png, jpg, webp ou gif ; 2 Mo au plus par l'outil de Jérôme, 1,5 Mo par image si le client les ajoute lui-même depuis « Mon espace ») dans un dossier du Mac, **hors du dépôt**.
5. **Si le module Devis est activé : récupérer ses données existantes auprès du client** : le catalogue d'articles (tableur ou CSV) et **tous ses anciens devis** (gagnés, perdus, en attente ; en PDF si c'est le seul format), avec si possible un tableau récapitulatif (numéro, date, client, montant, statut). Sans eux, l'espace est vide le premier jour. Les fichiers restent **hors du dépôt**. Le client doit aussi avoir **une adresse Google** : s'il n'en a pas, lui en faire créer une avant la séance.
6. **Si le module Devis est activé : préparer les informations de « Mon entreprise »** : nom, forme juridique, SIRET, TVA intracommunautaire, adresse, téléphone, e-mail, site, registre des métiers, assurance professionnelle (garantie, assureur, zone) et médiateur de la consommation. Sans elles, les devis du client partent sans mentions légales (l'écran affiche « Mentions manquantes »). Régime de TVA (franchise en base ou assujetti) : à valider avec son comptable.
7. **Vérifier les réglages Google du projet de la plateforme** (une seule fois pour **tous** les clients, pas par client) : voir la section « Réglages Google du projet de la plateforme » plus bas. Si l'un manque, le faire avant la séance.

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
| 9 | **Importer le catalogue et les anciens devis** | Jérôme | Seulement si le module Devis est activé. Le catalogue va dans le Bordereau. Les anciens devis sont importés comme « importés » (lecture seule, numéro et statut d'origine) ; les chiffres d'affaires par mois alimentent les indicateurs. Toujours un essai à blanc d'abord ; écriture seulement avec l'accord de Jérôme. |
| 10 | **(supprimée le 27/10/2026)** Autoriser Gmail pour les personnes du client | — | Le navigateur ne parle plus à Gmail (plus de portée `gmail.compose`), donc plus d'utilisateurs test, plus de limite de 100 personnes, plus d'expiration de 7 jours et plus de vérification Google à prévoir. Le brouillon d'e-mail est préparé par n8n (« Préparer l'e-mail »), **absent chez les clients pour l'instant** (`.github/A-FAIRE.md`). |
| 11 | **Régler le module Devis avec lui** | Jérôme + client | Seulement si le module Devis est activé. Réglages > Devis : « Mon entreprise » (voir l'étape 6 d'avant la séance), régime de TVA, **deux marges** (« Marge par défaut des articles (%) », pour le catalogue, et « Marge globale du devis (%) », 20 % d'office appliqués aux nouveaux devis, retirable devis par devis), méthodes de paiement acceptées (dans « Mon entreprise »), durée de validité, taux de TVA, familles d'articles. Le point rouge sur la pastille « Mon entreprise » doit avoir disparu. |
| 12 | **Essai de bout en bout du devis** | Jérôme + client | Seulement si le module Devis est activé. Sur une affaire de test : créer un devis, le finaliser (le PDF se fabrique et se range chez nous : onglet « Devis » de l'affaire, ouvrir le devis, « … » > « Télécharger le PDF » ; il n'y a plus d'écran du PDF depuis le 28/10/2026), « Préparer l'e-mail » (seulement si c'est branché pour ce client : le brouillon Gmail se crée avec le PDF, l'appli n'envoie jamais ; l'assistant a le même bouton : l'outil `preparer_email`, qui répond « pas encore branché » tant que le workflow n8n du client n'existe pas), « Devis envoyé », puis archiver l'essai (un devis finalisé a un vrai numéro et ne se supprime pas : le dire au client, ou faire l'essai seulement jusqu'au PDF brouillon). |
| 13 | **Vérifier le MCP des devis** | Jérôme | Seulement si le module Devis est activé. Demander à l'assistant du client : « liste mes devis », puis « lis le devis X » : on voit copie, envois et état du PDF, jamais les prix d'achat. Les actions (statut, archivage, suppression) demandent un aperçu et un code quand elles ne se défont pas avec le journal. |
| 14 | **Lire la garantie e-mail au client** | Jérôme + client | Seulement si le module Devis est activé. Texte à lire tel quel : « Le logiciel ne peut pas envoyer d'e-mail. Il prépare seulement un brouillon que tu relis et envoies toi-même. Nous ne contrôlons pas le connecteur Gmail (ou autre messagerie) que ton assistant peut avoir par ailleurs : règle-le en lecture ou en brouillon seulement, jamais en envoi. » Même texte dans Réglages > Déploiement (ligne « Garantie lue »). Détail technique : `docs/securite-et-pannes.md`, section 12. |

Les étapes 4, 6, 7, 11, 12 et 14 se font **à deux, en visio** : Jérôme guide, le client agit sur son propre ordinateur et téléphone. L'étape 10 se fait par Jérôme seul, dans la console Google, **avant** que le client essaie l'envoi par e-mail.

## Réglages Google du projet de la plateforme (une seule fois, pour tous les clients)

La plateforme est **un seul** projet Google (`chevalier-ia-app`) : ces réglages ne se refont pas pour chaque client. À vérifier une fois, puis à ne revoir que si une étape de la séance échoue. Le CRM de Jérôme (`chevalier-ia-os`) a les mêmes réglages de son côté, dans son propre projet. Vérifier toujours le nom du projet en haut de la page de la console.

| Réglage | À quoi il sert | Où | Mode d'emploi |
|---|---|---|---|
| **API Drive et Picker activées** | Choisir un dossier Drive, créer les dossiers de projets (le PDF d'un devis n'est plus copié dans Drive depuis le 27/10/2026) | Console Google, « API et services » > « Bibliothèque » | `docs/google-drive.md`, étapes 1 à 4 |
| **Origine autorisée** de la connexion Google | Ouvrir les fenêtres Google (Drive) depuis le site | Identifiants > « Web client » > Origines JavaScript autorisées | `https://chevalier-ia-app.web.app` (voir `docs/google-drive.md`, étape 3) |


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
- « Préparer l'e-mail » grisé avec « pas encore branchée » : normal tant que la porte des workflows n'existe pas pour cet espace (`.github/A-FAIRE.md`).
- Sur l'ordinateur d'une autre personne : demander la **navigation privée** et lire l'adresse affichée dans la fenêtre Google avant d'autoriser (un autre compte Gmail pourrait être déjà connecté dans ce navigateur).
- Le MCP du client ne répond pas : interrupteurs d'urgence dans `docs/securite-et-pannes.md`.
