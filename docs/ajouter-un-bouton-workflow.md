# Ajouter un bouton qui lance un workflow (mode d'emploi)

Écrit le 23/10/2026. **Rien de tout cela n'est codé pour le bouton général « sur une fiche »** (le cas réel de « Préparer l'e-mail » d'un devis, codé le 25/10/2026, est décrit à la fin de cette page) : c'est la marche à suivre le jour où un client (par exemple Ingrid) demande « un bouton Générer devis sur la fiche Affaire ». Le plan technique et les raisons sont dans `docs/actions-de-fiche.md` ; cette page dit **comment s'y prendre, dans l'ordre, et qui fait quoi**.

## Ce qu'il faut comprendre d'abord

- Un bouton n'appelle **jamais** n8n depuis la page. Il demande à une fonction du serveur, qui relit sa configuration, vérifie que la personne est éditeur, note la demande dans un journal, puis appelle l'**adresse web (webhook)** du workflow du client.
- **Un workflow par client**, avec **son** adresse secrète. Rien de propre au client (SIRET, banque, tarifs, modèle de devis) n'est dans le dépôt : tout est dans **son** workflow n8n et ses identifiants n8n. Le dépôt est public.
- Le webhook reçoit du **texte structuré (JSON)** : l'identifiant du client, de l'action et de la fiche. Le workflow **relit la fiche lui-même** par la porte (`docs/porte-cles.md`), donc toujours à jour. Des champs de texte en plus sont possibles seulement dans une **liste fermée choisie à la configuration** (à décider au moment de coder).
- Le retour (brouillon de devis, document joint à la fiche) est **l'affaire du workflow** : il écrit par la porte. Rien n'est envoyé au client final tant que la personne ne valide pas elle-même.
- Un site internet ou un fichier Excel du client peut aussi appeler un webhook, mais **chaque porte d'entrée a son propre webhook et son propre secret**, avec le minimum de droits. Ne jamais mettre le secret du bouton dans une page web ou un Excel partagé.

## Prérequis (à vérifier avant de promettre une date)

1. **La porte des workflows côté plateforme clients (base 2)** : elle n'existe pas encore (`docs/porte-cles.md`, partie 6). Prérequis absolu ; déploiement manuel, liste d'arrêt.
2. Les actions de porte `affaires.lire` et `affaires.joindreLien` (d'abord chez Jérôme, avec un workflow `interne-…`).
3. Un workflow n8n du client respectant les règles de nommage (`docs/chemin-client-pilote.md`, « Règles de création des workflows ») : étiquette `client-<identifiant>`, nom `client-<identifiant>-…`, identifiant de 17 caractères au plus.

## Les étapes, dans l'ordre

| # | Étape | Qui |
|---|---|---|
| 1 | **Cadrer avec le client** : sur quelle fiche (affaire, projet, personne), ce que doit produire le workflow, où le résultat doit atterrir (brouillon d'e-mail, document joint, nouvelle fiche), qui a le droit de cliquer (éditeurs seulement). Écrire le cahier des charges **sans** SIRET, RIB ni tarif. | Jérôme |
| 2 | **Construire d'abord chez Jérôme** (règle du 18/10/2026 : toute fonctionnalité existe d'abord dans son interface) avec un workflow `interne-…` et un **faux devis**. | Claude |
| 3 | **Table `crm_actions`** (une ligne par bouton : libellé, cible, workflow, actif, confirmation), bouton à contour sur la fiche, commande de configuration dans `scripts/nouveau-client.js` (simulation puis `--ecrire`). | Claude (sous-agent), relu par Fable |
| 4 | **Fonction de lancement** `crmLancerAction` : relit la ligne elle-même, vérifie le rôle, journalise (client, action, fiche, statut, durée), appelle le webhook. **Un seul fichier** a le droit de faire un POST vers n8n, vers un chemin fixe ; un test le borne. | Claude |
| 5 | **Adresse et secret du webhook** du client : le secret va dans Secret Manager (côté serveur), **jamais** dans la page ni dans le dépôt. | Jérôme |
| 6 | **Workflow du client** dans le n8n de Jérôme : webhook protégé par secret, lit la fiche par la porte, crée le brouillon, joint la copie, clôt le lancement par la porte. | Claude + Jérôme (identifiants) |
| 7 | **Déploiement de la plateforme** (règles, fonctions, hébergement, MCP : quatre lancements du workflow manuel « Déploiement plateforme clients »). Liste d'arrêt : jamais sans Jérôme. | Jérôme |
| 8 | **Configurer le bouton** pour ce client : `ajouter-action <client> --cible affaire --libelle "Générer devis" --workflow <identifiant>` (simulation, relire, `--ecrire`). | Jérôme |
| 9 | **Essai avec le client** : un clic, le brouillon arrive, la copie est jointe. Vérifier le cas d'erreur (workflow éteint : message clair, pas de double devis). | Jérôme + client |

## Ce qu'un éditeur client ne peut jamais faire

Choisir le `workflowId`, voir l'adresse du webhook, ou lancer un workflow d'un autre client. Plus tard, un écran de Réglages pourra seulement **allumer, éteindre et renommer** un bouton.

## À éviter (liste de `docs/actions-de-fiche.md`)

Mettre `workflowId` ou l'adresse du webhook dans la page ; envoyer le contenu de la fiche à n8n par la fonction ; accepter « n'importe quel POST » vers n8n (jamais `activate` ni `credentials`) ; confondre action demandée par une personne et proposition de l'IA (deux circuits, même journal) ; doublons de brouillons (un lancement en cours désactive le bouton quelques minutes) ; SIRET, RIB, tarif ou nom de banque dans le dépôt.

## Cas vide et cas d'erreur à prévoir dans chaque écran

- **Aucune action configurée** : aucun bouton, aucun espace vide.
- **Lancement en cours** : bouton désactivé, texte « Devis demandé ».
- **Workflow injoignable ou en erreur** : message clair avec « Réessayer », rien d'envoyé au client final, ligne dans le journal.

---

# Cas réel : « Préparer l'e-mail » d'un devis (25/10/2026)

C'est le premier bouton qui lance un workflow. Il est déjà codé (chez Jérôme d'abord, même code pour les clients). **Rien n'est déployé chez les clients** (workflow manuel, avec Jérôme).

## Ce que ça fait

Dans le menu **« Envoyer »** d'un devis finalisé, l'entrée **« Préparer l'e-mail »** : **c'est le seul chemin de l'e-mail du devis** (décision de Jérôme, 27/10/2026 : l'ancien « Envoyer par e-mail », qui créait le brouillon Gmail depuis le navigateur avec la portée Google restreinte `gmail.compose`, est supprimé). Un clic, une confirmation (« Le brouillon sera créé dans ton Gmail avec le PDF. Rien n'est envoyé. »), puis un workflow n8n crée un **brouillon** dans le Gmail branché dans n8n, PDF joint. **Ni l'appli ni n8n n'envoient jamais l'e-mail** : la personne relit le brouillon et l'envoie elle-même depuis Gmail, puis touche « Devis envoyé » dans le devis (l'historique des envois garde alors les destinataires et les adresses en copie du devis). Le résultat se lit dans le panneau **Historique** du devis (« E-mail préparé dans Gmail le … ») et, côté n8n, dans **Automatisations > Historique** (copie des exécutions du workflow, déjà fournie).

## Le chemin d'une demande

1. L'écran appelle la fonction `devisPreparerEmail` `{ devisId }` (jamais n8n directement).
2. La fonction vérifie la personne (éditeur ; module Devis actif chez un client), le devis (finalisé, au moins un destinataire, PDF « ok »), refuse une 2e demande pour le même devis pendant 3 minutes (sauf après un échec), écrit une ligne dans le journal `crm_actions_lancements` (client, devis, `demandeId`, statut, durée ; **jamais** le contenu de l'e-mail), puis fait **un POST** vers le webhook n8n : `{ "action": "devis.preparerEmail", "espace": "interne" ou l'identifiant du client, "devisId": "…", "demandeId": "…" }`, avec l'en-tête `X-Chevalier-Secret`. Réponse à l'écran : `{ ok, demandeId }`.
3. Le workflow répond tout de suite « reçu » (200), puis appelle la **porte** : `devis.lireEmail` `{ devisId, demandeId }` pour obtenir adresses, sujet, message et lien du PDF (valable 10 minutes) ; il télécharge le PDF, crée le brouillon Gmail ; enfin `devis.noterEmailPrepare` `{ devisId, demandeId, statut: "ok", brouillonGmailId }` (ou `"echec"` avec un court `message`). Le serveur écrit `emailPrepare` sur le devis ; l'écran se met à jour tout seul. Dès la demande, le devis porte `emailPrepare.statut = "demandee"` : l'Historique dit « Préparation de l'e-mail en cours… », puis, si le workflow reste muet plus de 15 minutes, « Aucune réponse du workflow depuis plus de 15 minutes. Tu peux réessayer. » (on peut redemander dès 3 minutes).
4. Le détail des actions de la porte est dans `docs/porte-cles.md`, partie 13.

## Ce que Jérôme doit faire à la main (rien n'est branché tant que ce n'est pas fait)

Tant que les deux secrets n'existent pas, la fonction répond « La préparation de l'e-mail n'est pas encore branchée » et **le bouton reste masqué**. Rien ne casse le déploiement.

1. **Créer les deux secrets** dans Secret Manager du projet `chevalier-ia-os` (https://console.cloud.google.com/security/secret-manager?project=chevalier-ia-os, « Créer un secret ») :
   - `N8N_DEVIS_EMAIL_URL` : l'adresse complète du webhook du workflow (elle commence par `https://n8n.chevalier-ia.fr/webhook/`). Elle ne doit **jamais** être écrite dans le dépôt (public) ;
   - `N8N_DEVIS_EMAIL_SECRET` : un mot de passe long et aléatoire, **le même** que celui que le webhook n8n attend dans l'en-tête `X-Chevalier-Secret` (authentification par en-tête dans le nœud Webhook).
2. **Donner le droit de lire ces deux secrets** au compte de service `porte-serveur@chevalier-ia-os.iam.gserviceaccount.com` : sur chaque secret, onglet « Autorisations », « Accorder l'accès », rôle **Accesseur de secrets Secret Manager**.
3. **La clé de porte** : la clé `interne` existante suffit (le module `devis` est ajouté aux modules de la porte du CRM). Si la clé n'existe pas encore : `node scripts/cles.js creer --projet crm --proprietaire interne --ecrire` (partie 4 de `docs/porte-cles.md`), puis la mettre dans le workflow n8n (jamais dans le dépôt). Le workflow doit s'appeler `interne-…` et porter l'étiquette `interne`.
4. **Chez un client** (plus tard, avec Jérôme, déploiement manuel de la plateforme) : un workflow `client-<id>-…`, deux secrets **par client** dans le projet `chevalier-ia-app` : `N8N_DEVIS_EMAIL_URL_<id>` et `N8N_DEVIS_EMAIL_SECRET_<id>`, le droit « Accesseur de secrets » pour le compte de service des fonctions de la plateforme, et la porte de la base 2 (qui n'existe pas encore).

## Cas vide et cas d'erreur

- **Pas branché** (réponse du serveur) : l'entrée « Préparer l'e-mail » **reste dans le menu, grisée**, avec la phrase « La préparation de l'e-mail n'est pas encore branchée sur cet espace : préviens l'administrateur de ton espace. » (depuis le 27/10/2026 c'est le seul chemin de l'e-mail : le menu ne doit pas se vider). **Chez les clients c'est le cas aujourd'hui** : voir « Chez un client » plus haut, la porte des workflows de la base 2 n'existe pas encore.
- **Brouillon de devis** : « Finaliser d'abord ». **Sans destinataire** : « Ce devis n'a pas de destinataire : ajoute une adresse e-mail dans le devis, puis réessaie. » **PDF pas prêt** : le message habituel avec « Réessayer ».
- **Deuxième clic trop vite** : « Une préparation est déjà en cours pour ce devis : patiente quelques instants (3 minutes au plus), puis réessaie. » ; après un brouillon réussi : « Un brouillon vient d'être créé pour ce devis : regarde dans ton Gmail. »
- **n8n refuse le secret (401/403)** : « La préparation de l'e-mail n'est pas bien configurée. Préviens Jérôme. » (vérifier `N8N_DEVIS_EMAIL_SECRET` et l'authentification du nœud Webhook).
- **n8n éteint ou en panne** : la fenêtre reste ouverte avec le message et « Réessayer » ; rien n'est créé dans Gmail ; la ligne du journal passe à `echec`.
- **Le workflow échoue après avoir répondu « reçu »** : il doit appeler `devis.noterEmailPrepare` avec `statut: "echec"` ; l'Historique du devis dit alors « La préparation de l'e-mail a échoué … Tu peux réessayer. » et la copie des exécutions (Automatisations > Historique) montre l'erreur.

## À ne pas faire

Mettre l'adresse du webhook ou le secret dans le dépôt, la page ou une variable d'environnement ; ajouter un deuxième fichier qui parle à n8n (un test l'interdit : `tests/devis-email-sortie.test.js`) ; envoyer l'e-mail depuis le workflow (le nœud Gmail doit **créer un brouillon**, jamais envoyer) ; envoyer le contenu du devis dans le POST (il ne contient que des identifiants) ; modifier `envois` ou le statut du devis depuis n8n.
