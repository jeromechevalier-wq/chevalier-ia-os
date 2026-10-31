# Cadrage : finaliser un devis par le logiciel de facturation de l'utilisateur

Date : 31/10/2026. Statut : **conception décidée par Jérôme, relue par Fable le 31/10/2026, rien de codé**. Les numéros de ligne sont approximatifs (le code bouge) : chercher le nom de la fonction. Aucun secret ni nom de client dans ce fichier (dépôt public).

## 1. L'idée en trois phrases

Certains artisans ont déjà un logiciel de facturation (leur comptable ou la loi leur impose ses numéros et son PDF). Quand ils cliquent sur « Finaliser », notre application envoie le devis complet à un **workflow n8n propre à ce client**, qui le donne à **leur** logiciel. Le logiciel renvoie un numéro et un PDF ; ce PDF devient **le** PDF du devis finalisé.

## 2. Décisions de Jérôme

- **Un workflow n8n par client**, installé à l'onboarding, qui parle au logiciel de CE client. Le logiciel visé n'est pas un sujet bloquant : c'est l'affaire du workflow.
- **Deux workflows et deux adresses (webhooks) distincts par client** : « Préparer l'e-mail » (existe déjà) et « Finalisation par le logiciel de facturation » (nouveau). Donc deux couples de secrets.
- **Réglage** « J'utilise un logiciel de facturation » (interrupteur) + **délai d'alerte** (1 h par défaut, réglable), dans Réglages > Devis.
- **Notre contrôle des mentions s'applique TOUJOURS d'abord** (les règles B1 à B5 des PR 457 et 459) : on n'envoie jamais un devis incomplet.
- **Vrai nouveau statut « En cours de finalisation »**.
- **Le devis complet est envoyé en JSON** au workflow. Cela remplace le choix actuel « n8n ne reçoit que des identifiants » : `functions/src/coeur/n8n-sortie.js` (ligne ~7 et ~83) n'envoie que `{ action, espace, devisId, demandeId }`, et ce choix est **verrouillé par un test** (`tests/devis-email-sortie.test.js`, lignes ~27 à 47 et ~78). À re-trancher dans la PR serveur (Fable obligatoire) ; ne pas élargir le corps du message « Préparer l'e-mail ».
- **Le PDF renvoyé par l'outil DEVIENT le PDF du devis finalisé**, stocké dans notre Firebase. Aucun PDF de notre fabrication dans ce mode.
- **Le numéro est celui du logiciel**, rangé dans `finalisation.numeroExterne`. Le nôtre est gardé, et **le compteur de numéros n'est pas consommé** en mode logiciel.
- **On ne compare pas** les montants de l'outil aux nôtres.
- **Contrôle technique minimal du PDF** (commence par `%PDF-`, taille raisonnable) : à discuter.
- **Si l'outil refuse** : le devis revient en brouillon, avec le motif **tracé dans l'historique**.
- **Aucune annulation ni retour en brouillon une fois envoyé au logiciel.** On peut dupliquer le devis ou créer une nouvelle version (un autre brouillon) pendant que l'ancien reste « en cours de finalisation ».
- **Devis qui n'a jamais reçu de réponse** : une alarme, pas de bouton pour l'utilisateur. Débloquage proposé : la session principale seule, sur demande, avec trace (**à confirmer par Jérôme**).
- **L'alerte se calcule à l'affichage** (fonction pure comme `estExpire`, pas de tâche planifiée). La pastille « Devis : … » de la carte Kanban devient **rouge** : « en attente du logiciel depuis 2 h » (mécanisme `inscrirePastilleAffaire`, `js/modules/crm/pastilles-externes.js`).
- **E-mail d'alerte** : plus tard.
- **Onglet Éditeur d'un devis finalisé** : lisible, en lecture seule.
- **Onglet Prévisualisation** : à trancher. Option recommandée : garder l'aperçu actuel et ajouter un bouton « Ouvrir le PDF du logiciel » (lien signé de 5 minutes). Autre option : afficher le PDF de l'outil dans l'onglet.
- **La porte (l'entrée de n8n) est TRÈS importante et se fait en premier chez les clients** (voir §3).

## 3. Ce que le code fait aujourd'hui (relevé par Fable)

- **Envoi vers n8n** : `functions/src/coeur/n8n-sortie.js` (~7, ~83), corps fixe `{ action, espace, devisId, demandeId }`.
- **Retour de n8n** : il passe par la porte (`functions/src/index.js` ~60 à 72, `scripts/porte/porte.js` ~85 à 100), avec le `demandeId` et la clé `cle-n8n.<propriétaire>`.
- **La porte n'existe pas chez les clients** : ni dans `functions-plateforme/src/index.js`, ni dans `firebase.plateforme.json` ; `docs/porte-cles.md` (~244) l'écrit : « Pas encore fait ». C'est un **prérequis** (liste d'arrêt : déploiement des clients, avec Jérôme). Elle sert aussi à « Préparer l'e-mail » chez les clients.
- **Taille** : la porte limite le corps à 256 Ko (`scripts/porte/porte.js` ~22). Un PDF ne passe donc pas dedans : il faut un **lien signé d'écriture** (à ajouter à `functions/src/devis/stockage.js`, à côté de `lienSigne` ~137), puis l'appel de `terminerPdf` (`functions/src/coeur/devis.js` ~407).
- **Le champ `finalisation` existe déjà** (voir `functions/src/coeur/devis.js` ~168 et ~169, et la logique pure `js/modules/devis/logique.js`).
- **Ancien cadrage** : `docs/cadrage-devis.md` (D14, ~96 et ~97) disait « jamais de retour en brouillon ». Cette conception le remplace pour ce mode.
- **PDF automatique** : `devisPdfAuto` (`functions/src/index.js` ~169 ; plateforme `functions-plateforme/src/devis-pdf.js` ~115) et `devisPdf` / `reserverPdf` (`coeur/devis.js` ~386) **ne doivent pas fabriquer notre PDF** en mode logiciel (garde à ajouter).
- **Assistant** : `finaliserDevis` (`coeur/metier.js` ~1354, outil `finaliser_devis`) n'a **aucune sortie vers n8n** : sans correction, un devis resterait « en cours » pour toujours. Chez les clients, `transitionDevis` (`functions-plateforme/src/devis.js` ~70 à 91) est générique et doit aussi connaître le mode.
- **Version 2** : finaliser une version 2 remplace la version 1 tout de suite (`coeur/devis.js` ~176 et ~177). En mode logiciel, **attendre le retour OK** avant de remplacer.
- **Nouveau statut** : il touche une quarantaine de fichiers : `TRANSITIONS` (`js/modules/devis/logique.js` ~515), `COLONNES_TABLEAU` (`liste.js` ~180 : un statut inconnu tombe dans Brouillon), `boutonJaune` (`entete-boutons.js` ~17), `emailPossible`, les couleurs, `pastille-affaire.js`, etc., et des tests qui énumèrent les 6 statuts actuels.
- **Règles Firestore et Storage** : rien à changer.
- **Aperçu** : l'onglet Prévisualisation rend du HTML (`rendreApercu`, `editeur-ecran.js`) ; un PDF s'ouvre par un lien signé de 5 minutes (`stockage.js`).
- **Idempotence** : modèle `noterEmailPrepare` (`functions/src/coeur/devis-email.js` ~173 à 203) ; exiger du workflow une **clé d'idempotence devis + version**.

## 4. Règles de sécurité et de sobriété

- Secrets **paramétrés par usage** (`N8N_DEVIS_FACTURATION_*`), jamais dans le dépôt. Interrupteur activé **sans secret** : la finalisation est refusée avec un message clair.
- Le retour est **validé** : numéro borné en longueur, motif de rejet de 200 caractères au plus et sans adresse e-mail.
- La finalisation reste toujours précédée de notre contrôle des mentions.

## 5. Découpage en PR (petites, dans l'ordre)

| # | PR | Fable | Liste d'arrêt |
|---|---|---|---|
| 0 | **Porte de la plateforme clients** (utile aussi à « Préparer l'e-mail » chez les clients), avec Jérôme | Oui | Oui (déploiement des clients) |
| 1 | Logique pure : statut « En cours de finalisation », lecteurs, fonction de retard, tests de verrouillage | Non requise si pure, sinon oui | Non |
| 2 | Réglage : interrupteur + délai d'alerte | Retouche d'interface | Non |
| 3 | Serveur : finaliser en mode logiciel (`functions/` **et** `functions-plateforme/`, même PR) | **Obligatoire** | Non |
| 4 | Porte : actions de lecture et de retour de finalisation + PDF par lien signé d'écriture | **Obligatoire** | Selon l'hébergement |
| 5 | Écran : bandeau, pastille rouge du Kanban, prévisualisation | Oui (structure d'écran) | Non |
| 6 | Workflow n8n modèle + mode d'emploi d'installation chez un client (jamais de secret dans le dépôt) | Oui (workflow) | Non |
| 7 | Plus tard : tâche planifiée + e-mail d'alerte | Oui | Non |

## 6. Questions encore ouvertes pour Jérôme

1. Qui peut débloquer un devis qui n'a jamais reçu de réponse (proposé : la session principale seule, sur demande, avec trace) ?
2. Onglet Prévisualisation : bouton « Ouvrir le PDF du logiciel » (recommandé) ou PDF dans l'onglet ?
3. Contrôle technique du PDF reçu : seulement l'en-tête `%PDF-` et la taille, ou plus ?
4. Où la porte des clients est-elle déployée, et quand (PR 0) ?
