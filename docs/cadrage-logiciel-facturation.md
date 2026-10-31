# Cadrage : finaliser un devis par le logiciel de facturation de l'utilisateur

Date : 31/10/2026 (mise à jour le soir même). Statut : **conception décidée par Jérôme, relue par Fable le matin du 31/10/2026, puis révisée le soir (plus de n8n) ; rien de codé**. Les numéros de ligne sont approximatifs (le code bouge) : chercher le nom de la fonction. Aucun secret ni nom de client dans ce fichier (dépôt public).

**Décision du 31/10/2026 (soir)** : plus de workflow n8n pour la facturation. Notre code serveur parle **directement à l'API REST du logiciel** de facturation agréé. Conséquences : plus de « porte » comme prérequis, plus de lien signé d'écriture, plus de limite de 256 Ko à contourner. La porte n8n chez les clients (PR 463, ouverte) reste utile pour « Préparer l'e-mail », les propositions et la veille, pas pour la facturation.

## 1. L'idée en trois phrases

Certains artisans ont déjà un logiciel de facturation (leur comptable ou la loi leur impose ses numéros et son PDF). Quand ils cliquent sur « Finaliser », notre **serveur** envoie le devis au **logiciel** par son API REST. Le logiciel renvoie un numéro et un PDF (ou un XML) ; **notre serveur** le range, et ce PDF devient **le** PDF du devis finalisé.

## 2. Décisions de Jérôme

- **Notre serveur appelle directement l'API REST du logiciel.** La clé d'API est **propre à chaque client**, rangée dans **Secret Manager**, jamais dans le dépôt. Le logiciel est choisi plus tard (voir §6).
- **Identifiant d'idempotence** (devis + version) envoyé à chaque appel : un second appel ne crée pas un second document. **Reprise sur panne** : si l'appel échoue ou reste sans réponse, on peut le rejouer sans doublon.
- **Le PDF (ou le XML) reçu est rangé par notre serveur** dans notre stockage ; il devient **le** PDF du devis finalisé. Aucun PDF de notre fabrication dans ce mode.
- **Réglage** « J'utilise un logiciel de facturation » (interrupteur) + **délai d'alerte** (1 h par défaut, réglable), dans Réglages > Devis. Interrupteur activé **sans clé** : la finalisation est refusée avec un message clair.
- **Notre contrôle des mentions s'applique TOUJOURS d'abord** (règles B1 à B5 des PR 457 et 459) : on n'envoie jamais un devis incomplet.
- **Vrai nouveau statut « En cours de finalisation »**.
- **Contrôle minimal du retour** (décision du 31/10) : en-tête `%PDF-` et taille raisonnable pour un PDF ; **le XML est contrôlé aussi si l'API le donne**. On ne compare pas les montants du logiciel aux nôtres.
- **Le numéro est celui du logiciel**, rangé dans `finalisation.numeroExterne`. Le nôtre est gardé, et le compteur de numéros n'est pas consommé en mode logiciel.
- **Si le logiciel refuse** : le devis revient en brouillon, avec le motif **tracé dans l'historique**.
- **Aucune annulation ni retour en brouillon une fois envoyé au logiciel.** On peut dupliquer le devis ou créer une nouvelle version pendant que l'ancien reste « en cours de finalisation ».
- **Devis qui n'a jamais reçu de réponse** : une alarme, pas de bouton pour l'utilisateur. **Décision du 31/10 : le déblocage est fait par la session principale seule, avec trace.**
- **L'alerte se calcule à l'affichage** (fonction pure comme `estExpire`, pas de tâche planifiée). La pastille « Devis : … » de la carte Kanban devient **rouge** : « en attente du logiciel depuis 2 h » (mécanisme `inscrirePastilleAffaire`, `js/modules/crm/pastilles-externes.js`).
- **Onglet Prévisualisation** (décision du 31/10) : **on garde l'aperçu actuel et on ajoute un bouton « Ouvrir le PDF du logiciel »** (lien signé de 5 minutes).
- **Onglet Éditeur d'un devis finalisé** : lisible, en lecture seule.
- **E-mail d'alerte** : plus tard.

## 3. Ce que le code fait aujourd'hui (relevé par Fable le matin du 31/10, toujours valable sauf n8n)

- **Le champ `finalisation` existe déjà** (voir `functions/src/coeur/devis.js` ~168 et ~169, et la logique pure `js/modules/devis/logique.js`).
- **Ancien cadrage** : `docs/cadrage-devis.md` (D14) disait « jamais de retour en brouillon ». Cette conception le remplace pour ce mode.
- **PDF automatique** : `devisPdfAuto` (`functions/src/index.js` ; plateforme `functions-plateforme/src/devis-pdf.js`) et `devisPdf` / `reserverPdf` (`coeur/devis.js`) **ne doivent pas fabriquer notre PDF** en mode logiciel (garde à ajouter).
- **Assistant** : `finaliserDevis` (`coeur/metier.js`, outil `finaliser_devis`) doit connaître le mode, sinon un devis resterait « en cours » pour toujours. Chez les clients, `transitionDevis` (`functions-plateforme/src/devis.js`) est générique et doit aussi connaître le mode.
- **Version 2** : finaliser une version 2 remplace la version 1 tout de suite (`coeur/devis.js`). En mode logiciel, **attendre le retour OK** avant de remplacer.
- **Nouveau statut** : il touche une quarantaine de fichiers : `TRANSITIONS` (`js/modules/devis/logique.js`), `COLONNES_TABLEAU` (`liste.js` : un statut inconnu tombe dans Brouillon), `boutonJaune` (`entete-boutons.js`), `emailPossible`, les couleurs, `pastille-affaire.js`, etc., et des tests qui énumèrent les 6 statuts actuels.
- **Règles Firestore et Storage** : rien à changer.
- **Aperçu** : l'onglet Prévisualisation rend du HTML (`rendreApercu`, `editeur-ecran.js`) ; un PDF s'ouvre par un lien signé de 5 minutes (`stockage.js`).
- **Idempotence** : modèle `noterEmailPrepare` (`functions/src/coeur/devis-email.js`) ; l'identifiant devis + version sert de clé.
- **n8n** : `functions/src/coeur/n8n-sortie.js` n'envoie que des identifiants (verrouillé par `tests/devis-email-sortie.test.js`). Ce choix **n'a plus à être rouvert** pour la facturation, puisqu'elle ne passe plus par n8n.

## 4. Règles de sécurité et de sobriété

- Clé d'API **par client**, dans Secret Manager, lue par le serveur au moment de l'appel ; jamais dans le dépôt, jamais dans un journal.
- Le retour est **validé** : numéro borné en longueur, motif de rejet de 200 caractères au plus et sans adresse e-mail.
- La finalisation reste toujours précédée de notre contrôle des mentions.
- Chez les clients, le code va dans `functions-plateforme/` dans la **même PR** que dans `functions/` (règle du 26/10/2026).

## 5. Découpage en PR (petites, dans l'ordre)

| # | PR | Fable | Liste d'arrêt |
|---|---|---|---|
| 1 | Logique pure : statut « En cours de finalisation », lecteurs, fonction de retard, tests de verrouillage | Non requise si pure, sinon oui | Non |
| 2 | Réglage : interrupteur + délai d'alerte | Retouche d'interface | Non |
| 3 | Serveur : client de l'API du logiciel choisi, finalisation en mode logiciel (`functions/` **et** `functions-plateforme/`, même PR), clé par client, idempotence, reprise | **Obligatoire** | Non (secret manquant : oui) |
| 4 | Écran : bandeau, pastille rouge du Kanban, bouton « Ouvrir le PDF du logiciel » | Oui (structure d'écran) | Non |
| 5 | Plus tard : tâche planifiée + e-mail d'alerte | Oui | Non |

(L'ancienne PR 0 « porte de la plateforme clients » et l'ancien workflow n8n modèle ne sont plus des prérequis.)

## 6. Logiciels à étudier plus tard

**Stripe est écarté** : il n'est pas conforme à la facture électronique en France.

À étudier : Pennylane, Tiime, Sellsy, Qonto, Billit, B2Brouter. Pour chacun, vérifier **au moment du choix** : le statut de plateforme agréée en France, l'existence d'une API pour les **devis** (pas seulement les factures), les formats rendus (PDF, XML), la numérotation. Rien de cela n'est vérifié aujourd'hui : « à vérifier ».

## 7. Questions encore ouvertes pour Jérôme

1. Quel logiciel (voir §6) ?
2. Un compte par client (clé d'API par client dans Secret Manager) ou un compte à nous ?
