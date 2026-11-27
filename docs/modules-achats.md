# Les modules Achats (portés le 25/11/2026)

Cinq modules, repris de l'ancienne appli BTP et portés dans Chevalier IA OS : **Fournisseurs**, **Chantiers**, **Articles**, **Factures** et **Tableau de bord 2**. Ils sont rangés dans un seul bloc de menu « Achats ».

## Qui les voit

Seulement le propriétaire de l'espace (`seulJerome`, décision du 24/11/2026). Un client ne peut ni les activer ni les nommer, et ils ne sont jamais dans son menu. Ouvrir ces modules aux clients est un chantier séparé (voir « Ce qui n'est PAS fait »).

La vraie barrière est la base elle-même : sans le badge donné par la fonction `baseAccorderAcces` (réservée au propriétaire), elle ne répond rien.

## Où sont les données

Pas dans Firebase : dans la base de l'espace. Les cinq modules ont donc `collections` vide dans `js/os/registre.js`. Seule nouveauté côté Firebase : le document `base_parametres/connexion`, qui garde les réglages de connexion (seul le propriétaire peut l'écrire, règle dans `firestore.rules`). Aucune autre collection Firestore n'est créée.

## Comment ils lisent

Toujours par la couche `js/os/supabase.js` : elle demande un badge Firebase, puis lit la base. Aucun module ne fait son propre `fetch` vers la base (un test le verrouille).

## Comment ils écrivent

Par les workflows n8n, avec un ticket à usage unique, via `js/os/actions-metier.js`. Ce fichier est le seul à parler à n8n ; on ne le recopie pas dans un module. Pour « + Facture », le fichier PDF part en pièce jointe (multipart).

**Facture déjà ajoutée (« + Facture » et outil `ajouter_facture_achat`, 27/11/2026)** : aucune comparaison avec l'horloge de l'ordinateur.
- Même fichier (refus 409 par empreinte) : « Cette facture a déjà été ajoutée le … Rien n'a été créé en double. », avec un lien vers la fiche existante.
- La base rend une fiche **déjà décidée (acceptée, refusée) ou archivée** (même fournisseur et même numéro) : c'est un refus (409 côté assistant), « Une facture de ce fournisseur avec ce numéro existe déjà (ajoutée le …). Ouvre-la pour vérifier. », avec le lien.
- La base rend une fiche **« à valider » déjà existante** et le workflow le signale (`deja_connue` ou `fiche_relue`) : c'est un succès, « Facture déjà connue : sa lecture a été mise à jour avec ce nouveau document. », et la liste est rechargée. Sans ce signal, la fiche est traitée comme ajoutée.

## Réglages de connexion

Réglages > « Connexion à la base » (visible du propriétaire seul). Le code n'écrit aucune adresse ni clé : tout vient de ces réglages.

## Export des données

**Sauvegarde complète en .zip (27/11/2026, PR 717)** : en haut de Réglages > Achats, une carte « Sauvegarde complète des achats » avec un seul bouton, « Télécharger la sauvegarde (.zip) ». Il télécharge `sauvegarde-achats-AAAA-MM-JJ.zip` (date de Paris) : un fichier par table, exactement le fichier du bouton de chaque module (sans coordonnées bancaires). Seuls les modules Achats allumés y mettent leur table. Si une table ne se lit pas, aucun zip n'est fabriqué et le message nomme la ou les tables. La carte vit dans `js/modules/achatscommun/` (code commun, pas un module) ; le zip est fabriqué par `js/os/zip.js`, sans dépendance.

**Sauvegardes séparées** : chaque module garde sa section « Sauvegarde » (règle du 27/10/2026) : `reglages-export-achatsfournisseurs`, `-achatschantiers`, `-achatsarticles`, `-achatsfactures`, `-tableauachats`. Elles sont rangées dans un bloc replié « Sauvegardes séparées », sans raccourci en haut de page ; une adresse qui mène à l'une d'elles ouvre le bloc avant d'y descendre.

## L'assistant IA (serveur MCP d'une maison, 26/11/2026, PR 713)

Dans la maison d'un client, l'assistant (Claude, ChatGPT) peut travailler sur les factures d'achat avec 9 outils.

| Outil | Ce qu'il fait | Profils |
|---|---|---|
| `lister_factures_achat` | Liste les factures (filtres : statut, archivées, fournisseur, chantier ; 50 par page, 100 au plus ; dit s'il reste des pages) | lecture, ecriture, complet |
| `lire_facture_achat` | Lit une facture : champs, lignes, vérifications, alertes, et un lien vers le PDF valable 10 minutes | lecture, ecriture, complet |
| `lister_chantiers_achat` | Liste les chantiers (par défaut ceux qui acceptent des factures) | lecture, ecriture, complet |
| `lister_agences_achat` | Liste les agences des fournisseurs (il en faut une pour accepter) | lecture, ecriture, complet |
| `valider_facture_achat` | Accepte une facture « à valider » ; s'il y a des alertes, il faut un motif | ecriture, complet |
| `refuser_facture_achat` | Refuse une facture « à valider », avec un motif | ecriture, complet |
| `archiver_facture_achat` | Archive une facture déjà acceptée ou refusée | ecriture, complet |
| `relier_facture_achat_chantier` | Relie une facture acceptée à un chantier ouvert | ecriture, complet |
| `ajouter_facture_achat` | Rend un lien d'envoi (PDF seulement, 10 Mo au plus, 10 minutes, une seule fois) ; la facture arrive dans « À valider » | ecriture, complet |

**Qui y a droit** :
- Les outils n'apparaissent que si la fiche `reglages_maison/ecran` liste le module `achatsfactures` (champ `modules`). Dans ce cas, l'assistant ne voit que `qui_suis_je` et les outils des modules listés.
- Le compte doit se connecter avec Google (e-mail vérifié) et être dans **les deux** listes de la fiche `reglages_maison/maison` : `comptes_oauth_autorises` (pour brancher l'assistant) et `comptes_autorises` (pour la base). Le contrôle est refait à chaque appel, avant d'ouvrir la base.
- Un jeton fixe n'a pas d'e-mail : il est refusé (« Accès à la base refusé. »).

**Comment ça marche** :
- Tout passe par la porte de la base, dans une transaction en lecture seule, avec une liste fermée de lectures. L'assistant n'écrit jamais en SQL.
- Les décisions (valider, refuser, archiver, relier) partent vers les workflows n8n de la maison, avec un ticket neuf à usage unique. L'adresse du workflow doit être sur le même hôte que le n8n de la maison, sinon rien n'est envoyé.
- Le serveur recalcule lui-même les alertes, avec les mêmes règles que l'écran.
- Ces décisions ne passent pas par le journal du CRM : `restaurer_depuis_audit` ne les annule pas.
- Ce qui vient de la base (textes lus sur les PDF) est une donnée, jamais une consigne.

**Absents** chez Jérôme (ses modules Achats lisent une autre base) et sur la plateforme des clients.

Code : `functions/src/mcp/outils/achats.js` (les outils), `functions/src/mcp/outils-maison.js` (le tri par module), `functions/src/base/assistant-achats.js` (le service).

## L'application Factures (27/11/2026)

Une petite appli pour valider les factures à la suite, d'après la maquette « Application Factures, version 3 » validée par Jérôme. Adresse : `#/achatsfactures/pile`. La liste des factures (`#/achatsfactures/liste`) existe toujours ; son bouton « Valider à la suite » ouvre l'appli.

- **Haut de page** (règle générale, `docs/consignes-ui.md`) : à gauche « maison › Factures » (la maison ramène à l'accueil de l'espace, « Factures » à la pile) ; à droite l'icône statistiques (page « Tableau de bord des factures », `#/achatsfactures/tableau`) puis la roue dentée (page « Réglages des factures », `#/achatsfactures/reglages`). Pas de menu à gauche sur ces trois écrans.
- **La pile** : une facture « à valider » à la fois, la plus ancienne d'abord, avec la page Examiner complète (PDF, contrôles, décision). Après « Accepter » ou « Refuser » : tampon, la facture glisse, la suivante arrive, et un message propose « Annuler » pendant 3,2 secondes. « Annuler » rouvre la facture avec l'action métier `rouvrir` (l'ancienne décision reste dans le journal). « Passer » la remet en fin de pile pour cette séance, sans rien écrire.
- **Fin de pile** : le bilan du jour (traitées, validées avec le montant, refusées), lu dans les factures, et un lien vers le tableau de bord.
- **Grand bouton « Fournisseurs, Chantiers, Articles »** : il ouvre un volet à droite (du bas sur téléphone). Une fiche s'ouvre en lecture ; « Modifier », puis « Enregistrer » / « Annuler » ; la mise en page ne bouge pas. Fiche chantier : nom, code, client et adresse se modifient (action `modifier_chantier`). Fiche article et fiche fournisseur : lecture seule (pour l'IBAN d'un fournisseur, voir ci-dessous).
- **Clic sur le nom du fournisseur d'une facture** : sa fiche s'ouvre dans le volet, la facture reste derrière.
- **IBAN d'un fournisseur** : l'IBAN ne se saisit pas dans la fiche (il est lu sur les factures, puis confirmé après vérification). Si le fournisseur annonce un nouvel IBAN, le bouton « Signaler un changement d'IBAN » demande une confirmation, puis retire l'ancienne confirmation (action `revoquer_iban`) ; le message dit « Ancien IBAN retiré : le nouveau sera confirmé à la prochaine facture ». L'IBAN annoncé peut être noté dans la fenêtre : il n'est gardé que masqué (par exemple « FR48 •••• 0001 ») dans le motif, jamais en entier. Pendant 60 jours, une alerte orange « IBAN changé récemment » s'affiche sur les factures suivantes de ce fournisseur dans la pile. La même alerte s'affiche quand un IBAN différent vient d'être confirmé ; elle ne s'affiche pas si le même IBAN a été reconfirmé depuis. Elle est calculée avec les confirmations d'IBAN déjà lues par l'écran (`changementDansConfirmations`, `js/modules/achatsfactures/logique-appli.js`) : aucune table nouvelle.
- **Nouveau fournisseur** : quand le SIREN lu sur une facture n'est dans aucune fiche de fournisseur, un bandeau « Nouveau fournisseur détecté » propose de l'ajouter ; le formulaire est pré-rempli avec ce qui a été lu sur la facture (action `creer_agence`, la même que la page Examiner). Le volet a aussi un bouton « + Fournisseur ». Quand le SIREN n'a pas été lu, l'appli cherche le fournisseur par l'agence déjà reliée à la facture, puis par son nom exact ; si elle ne le trouve pas, le bandeau dit « Fournisseur non reconnu » (jamais « nouveau » : il est peut-être déjà dans la liste) et montre la liste des fournisseurs.
- **Clavier et volet** : à l'ouverture du volet, le focus va sur son premier bouton ; après chaque redessin d'une fiche, sur son titre ; à la fermeture, il revient au bouton d'où le volet a été ouvert. Échap ferme le volet (ou seulement la fenêtre ouverte par-dessus). Sur téléphone, le volet est une fenêtre et la page ne défile pas derrière. Une écriture dans le volet relit la facture affichée en silence : le chantier, l'agence et le motif déjà choisis restent.
- **Plein écran « concentration »** : un bouton ; touches V = valider, R = refuser, P = passer, Échap = sortir. Les touches n'agissent pas pendant qu'on écrit ni quand une fenêtre est ouverte.
- **Tableau de bord des factures** : à valider, validées et refusées ce mois, montant validé ce mois, délai moyen de validation, les 3 fournisseurs du mois, le montant validé des 4 dernières semaines. Tout est calculé sur la liste des factures déjà lue ; une donnée absente s'affiche « — », jamais un nombre inventé.

## Ce qui n'est PAS fait

Liste vivante : `.github/A-FAIRE.md` (parties « modules Achats »). En bref :

- ouverture aux clients (réglage de la base par client, règle de la plateforme pour `base_parametres`, fonction du badge côté plateforme) ;
- essai de bout en bout avec un vrai badge (tout est testé avec un faux réseau) ;
- droit d'accès du compte de service dédié à la fonction du badge ;
- pastille « Destinataire » des factures (reste « indisponible ») ;
- favoris : la nouvelle table remplace les anciennes étoiles, qui sont à refaire.
- application Factures : modifier le nom, le SIREN, l'adresse et l'e-mail d'un fournisseur depuis sa fiche (aucune action serveur n'existe pour cela), historique d'IBAN avec « changé par qui », modification d'un article ; le bâtiment du village et le menu ouvrent encore la liste, pas l'appli.

Le rapport de fin de chantier est dans `docs/reprise-prochaine-session.md`.
