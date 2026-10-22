# Étape F : parcours utilisateur (ordinateur 1440 × 900 et téléphone 390 × 844)

> **Note du 18/10/2026 : l'« Extraction de valeur » citée dans ce document a été supprimée** (décision de Jérôme, voir `cadrage-projets.md`) : plus d'option, de création de projet d'extraction, de modèle, de badge ni d'outil MCP `extraire_valeur_projet`. Les projets déjà créés restent lisibles comme des projets ordinaires. Le texte ci-dessous est conservé comme historique.

Statut : complet pour le périmètre demandé (tous les parcours ont été faits sur les deux formats). Voir « Ce qui n'a PAS été regardé » plus bas.

Version essayée : 2.3.3, branche `claude/fervent-mayer-gme1rw`. Essais faits **uniquement sur les émulateurs locaux** (auth + firestore, projet `demo-chevalier-ia-os`), avec Chromium piloté par Playwright. Aucune donnée réelle, aucune production, rien modifié dans le code, les tests ou les règles, aucun git.

## Ce qui a été fait

- Lecture de `02-format-des-constats.md`, de `CLAUDE.md`, de `03-decisions-facturation.md` et des titres des constats A, B, C, D, E, G, H déjà écrits.
- Quatre petits scripts hors du dépôt (dossier de travail de la session), qui réutilisent `tests/e2e/outils.js` (connexion de test, écriture dans l'émulateur) :
  1. un grand parcours qui enchaîne tout, lancé sur ordinateur puis sur téléphone ;
  2. des essais complémentaires (recherche sans résultat, perdre puis rouvrir, suppression d'une tâche, fermeture d'une fenêtre, durée de création) ;
  3. un essai ciblé sur le message vert qui se pose sur un bouton (téléphone) ;
  4. des captures propres (on attend la fin des animations).
- À chaque étape, le script note : la durée, les messages de confirmation (les « toasts »), le débordement horizontal (`scrollWidth > innerWidth`), les boutons et liens de moins de 44 px, les textes coupés, et les erreurs de la console du navigateur (`console` de type `error` et `pageerror`).
- 8 captures légères (toutes sous 40 Ko) dans `docs/audit-fonctionnel/captures/`, nommées `f-….png`.

### Les parcours faits (ordinateur ET téléphone)

| # | Parcours | Résultat |
|---|---|---|
| 1 | Créer une personne (nom seul, Entrée) | marche, message « Personne ajoutée » avec lien « Ouvrir la fiche » |
| 2 | Créer une affaire (titre + montant) | marche, message « Affaire ajoutée » |
| 3 | La faire avancer (3 déplacements) puis la gagner | marche : glisser-déposer sur ordinateur, menu « Déplacer vers… » sur téléphone ; suggestion de relance, célébration |
| 4 | Créer son projet depuis l'affaire gagnée | marche, message « Projet créé » |
| 5 | Ajouter des tâches (titre seul ; avec « Demain »), en cocher une | marche, avancement « 1 / 2 tâches » |
| 6 | Ajouter deux factures, encaisser la première | marche, message « Paiement enregistré » + célébration, totaux « payé 500 € · reste à payer 700 € » |
| 7 | Clôturer avec une facture à payer | bloqué avec le message « Clôture bloquée » et les deux sorties (« Marquer payée… », « Clôturer avec impayé… ») ; sortie 1 : paye puis la clôture se fait toute seule ; sortie 2 (sur un autre projet) : raison obligatoire, projet terminé avec pastille « Impayé » |
| 8 | Perdre une affaire (raison, projet d'extraction) | marche : « La raison est obligatoire. » sans raison, puis « Projet d'extraction créé » + « Affaire marquée comme perdue » |
| 9 | ~~Mettre une affaire en pause avec date de réveil~~ | sans objet : la pause a été supprimée le 22/10/2026 (décision de Jérôme ; pour relancer plus tard, on planifie une activité) |
| 10 | Favoris : étoile d'un document d'affaire et de projet, bloc Favoris de l'accueil, retrait, remise | marche (voir « Vérifié et conforme ») |
| 11 | Recherche globale | marche (personne, affaire, projet trouvés) |
| 12 | Écran Journal (liste + détail d'une ligne) | marche |
| 13 | Réglages | s'ouvre, aucun débordement |

### Durées (indicatives : émulateur local, sans réseau réel, machine d'essai ; elles servent à comparer, pas à promettre)

| Geste | Ordinateur | Téléphone |
|---|---|---|
| Connexion de test jusqu'à l'Accueil | 2 306 ms | 1 278 ms |
| Ouvrir la fenêtre « Ajouter… » | 66 à 78 ms | 56 à 66 ms |
| Enregistrer une personne | 401 ms | 132 ms |
| Enregistrer une affaire | 185 ms (puis 285 à 445 ms sur 3 essais) | 390 ms, **mais 5 119 et 5 176 ms** sur les 2 essais suivants (voir F-01) |
| Changer l'étape d'une affaire | 258 à 481 ms | 249 à 258 ms |
| Créer le projet depuis l'affaire | 624 ms | 387 ms |
| Ajouter une tâche | 155 ms | 151 ms |
| Ajouter une facture | 156 ms | 199 ms |
| Encaisser | 174 ms | 260 ms |
| Ouvrir le Journal | 54 ms | 331 ms |
| Ouvrir les Réglages | 67 ms | 310 ms |

Rien de lent à l'usage hors cas F-01. Sur des vraies données et un vrai réseau, les durées seront différentes : non vérifié.

### Mesures transversales

- **Erreurs dans la console du navigateur** : 0 sur tous les essais (4 lancements ordinateur et téléphone, `console` de type `error` + `pageerror`).
- **Débordement horizontal de la page** (`scrollWidth > innerWidth`) : aucun, sur aucune des étapes mesurées (17 sur ordinateur, 18 sur téléphone). Les colonnes du Kanban défilent à l'intérieur de leur zone, pas la page.
- **Texte coupé** : un seul cas relevé, sur téléphone (F-07). Aucun sur ordinateur.
- **Boutons et liens de moins de 44 px** : surtout sur téléphone (F-02). Sur ordinateur, seul le menu de gauche fait 43 × 42 (1 à 2 px de moins), ce qui est sans effet à la souris.

## Ce qui n'a PAS été regardé

- Le **vrai réseau** et la vraie connexion Google (l'essai utilise la connexion de test de l'émulateur) ; les durées sont donc indicatives.
- Un **vrai téléphone** : seulement Chromium en mode téléphone (390 × 844, toucher activé). Pas de Safari iPhone, pas de tablette, pas d'autre largeur d'écran.
- Le **thème clair** (tout a été vu en thème sombre), le **menu de gauche élargi** (il était replié, seules les icônes se voient : libellés non lus), l'usage au clavier seul et avec un lecteur d'écran.
- Les écrans **Organisations**, **Archives**, **Modèles** de projet, **Liste** des affaires et des projets, **filtres enregistrés**, **export CSV et sauvegarde**, **saisie manuelle des objectifs**, **migration 2.2**, fiche d'une personne en détail (notes, activités, historique).
- La **suppression** d'une affaire, d'un projet, d'une personne (couverte par les étapes A, C, D).
- Les cas déjà couverts par d'autres étapes : paiement partiel, facture à 0 €, dates impossibles, doublons (A, C).
- Le **volume** : l'essai part d'une base vide ou presque (quelques documents) ; l'écran avec des centaines de fiches n'a pas été essayé.

## Reproduit à l'écran (constats déjà écrits, pas répétés)

- **C-11 / E-02** : une affaire « Gagné » sans activité apparaît dans « Sans action prévue » de l'Accueil (vu sur la capture de l'accueil téléphone : « Audit des Hortensias · Gagné · Planifier »).
- **D-15** : l'écran Journal dit encore « (gardée 90 jours) » dans son texte d'introduction (vu sur `f-ordinateur-journal-noms-internes.png`).
- **D-10** : le même texte renvoie à Claude Code (`restaurer_depuis_audit`) pour défaire ; aucun bouton « Défaire » dans l'appli.
- **D-12** : le détail d'une ligne du Journal concernant un projet n'offre que « Fermer » (pas d'« Ouvrir la fiche »).
- **A-13** : « Délai de paiement » est encore dans les Réglages (titre vu dans la liste des sections).
- Le projet d'extraction créé dès que l'affaire passe à « Gagné » est **voulu** (test C33 et décision de Jérôme) : pas un constat.

## Constats

### F-01 · Sur téléphone, le message vert « Ouvrir la fiche » se pose sur le bouton « Enregistrer » et le détourne
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : sur téléphone, la fenêtre « Ajouter… » occupe tout l'écran et son bouton « Enregistrer » est en bas. Si on l'ouvre dans les 5 secondes qui suivent une création (« Personne ajoutée », « Affaire ajoutée »), le message vert avec son lien « Ouvrir la fiche » est exactement au-dessus du bouton. Un toucher sur « Enregistrer » touche en fait le lien du message : la page derrière change (on part sur la fiche précédente), la fenêtre reste ouverte et rien n'est enregistré.
- **Ce que ça change pour Jérôme** : quand il enchaîne deux créations avec son téléphone (une personne puis son affaire), son premier toucher sur « Enregistrer » ne fait pas ce qu'il croit ; il doit attendre environ 5 secondes ou retaper.
- **Où dans le code** : `css/os.css:296` (le bloc des messages est à `z-index: 95`, au-dessus des fenêtres à `z-index: 80`, `css/os.css:309`) ; `css/os.css:444` (`.toast.avec-lien { pointer-events: auto; }`) ; `js/modules/crm/personnes.js:211` et `js/modules/crm/affaires.js:186` (durée 5 000 ms), `js/modules/crm/affaires.js:18` (6 000 ms pour « Projet d'extraction créé »).
- **Règle ou décision concernée** : aucune règle écrite.
- **Preuve** : essai F3 (script hors dépôt) : après « Personne ajoutée », ouverture de « Ajouter une affaire », titre rempli. Sur téléphone, `document.elementFromPoint` au centre de « Enregistrer » renvoie `A.toast-lien` (« Ouvrir la fiche ») ; un vrai toucher à cet endroit change l'adresse vers `#/crm/personnes/…`, laisse la fenêtre ouverte et crée 0 affaire. Sur ordinateur, le même essai enregistre normalement (la fenêtre est centrée, le message est en dessous). Le premier grand parcours avait déjà montré le symptôme : « Enregistrer » d'une affaire = 4 781 ms sur téléphone contre 185 ms sur ordinateur (le clic attendait que le message disparaisse), puis 5 119 et 5 176 ms sur deux essais de suite. Capture : `captures/f-telephone-toast-sur-bouton.png`.

### F-02 · Sur téléphone, beaucoup de boutons de tous les jours font moins de 44 px, dont la case « fait » d'une tâche (28 × 28)
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : la mesure sur téléphone relève 166 boutons et liens différents (comptés par nom et par taille, tous écrans confondus) de moins de 44 px de côté, et 83 champs de saisie ou listes. Les plus petits, et les plus utilisés : la case « Marquer comme faite » d'une tâche (28 × 28), le menu « Actions » d'une carte d'affaire (28 × 28), les trois boutons du haut « Ouvrir le menu », « Rechercher », « Ajouter » (36 × 36), l'étoile des favoris (36 × 36), les menus « Actions de la facture » et « Plus d'actions » (36 × 36), « Monter » et « Descendre » (36 × 36), « Mois précédent / suivant » (36 × 36), les boutons « +3 jours », « +1 semaine », « Marquer payée » (32 de haut). Des liens de 20 à 22 px de haut : « Retour » (« Projets », « Affaires »), « Ouvrir la fiche » dans les messages, les liens des favoris. Cases à cocher de 13 × 13 (Journal, « À vérifier seulement ») et 18 × 18 (Réglages des objectifs).
- **Ce que ça change pour Jérôme** : sur téléphone, il risque de toucher à côté (cocher la mauvaise tâche, ouvrir le mauvais menu).
- **Où dans le code** : `css/os.css` et `css/crm.css`, `css/projets.css` (tailles des boutons icône ; `.bouton-icone`, case `.case-fait`, boutons « petit ») : non cherché ligne par ligne, c'est une mesure à l'écran.
- **Règle ou décision concernée** : aucune règle écrite dans le dépôt ; le seuil de 44 px est celui demandé pour l'audit.
- **Preuve** : mesure du script sur 18 étapes téléphone (`getBoundingClientRect`, hauteur ou largeur < 44) ; exemples relevés : `button|Marquer comme faite : Rédiger le rapport|28x28`, `button|Ouvrir le menu|36x36`, `button|Mettre Planning en favori|36x36`, `a|Projets|358x22`, `input|18x18` (cases à cocher).

### F-03 · Les factures disent « envoyée le Hier » et « payée le Aujourd'hui »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : la ligne d'une facture écrit « envoyée le » ou « payée le » puis la date courte. Quand la date est celle d'hier, d'aujourd'hui ou de demain, la date courte est un mot (« Hier », « Aujourd'hui », « Demain »), ce qui donne « envoyée le Hier · payée le Aujourd'hui » (avec une majuscule).
- **Ce que ça change pour Jérôme** : une faute de français visible sur chaque facture du jour.
- **Où dans le code** : `js/modules/projets/factures.js:147-148` (« envoyée le », « payée le ») ; `js/modules/crm/logique.js:261-265` (`formatJourCourt` rend « Aujourd'hui »).
- **Règle ou décision concernée** : aucune.
- **Preuve** : texte lu à l'écran sur ordinateur et sur téléphone : « Acompte envoyée le Hier · payée le Aujourd'hui 300 € Payée ». Capture : `captures/f-telephone-facture-hier-aujourdhui.png`.

### F-04 · Une recherche globale sans résultat n'affiche rien
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : on tape « xyzzy » dans la recherche du haut : la liste de suggestions se cache complètement. Aucun « Aucun résultat ».
- **Ce que ça change pour Jérôme** : il ne sait pas si la recherche n'a rien trouvé ou si elle n'a pas encore répondu ; il peut croire que l'appli est lente ou cassée.
- **Où dans le code** : `js/os/ui.js:412` (`liste.hidden = aucun`) ; la recherche du haut est `js/os/shell.js:124-135`.
- **Règle ou décision concernée** : aucune.
- **Preuve** : essai F2 : après « xyzzy », `ul.suggestions[aria-label="Suggestions : Rechercher"]` a `hidden=true` et un texte vide, sur ordinateur et sur téléphone. Capture : `captures/f-telephone-recherche-sans-resultat.png`.

### F-05 · (clos le 22/10/2026 : la pause n'existe plus) La carte d'une affaire « En pause » n'affichait pas sa date de réveil
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : après « Mettre en pause », la carte, dans la colonne « En pause » du Kanban, montre seulement le titre et la personne. La date de réveil ne se lit que dans la fiche de l'affaire (« En pause jusqu'au 08/11/2026 »). La vue Liste dit seulement « En pause ». Sur le Kanban, la colonne « En pause » est de plus repliée par défaut : il faut cliquer pour voir les cartes.
- **Ce que ça change pour Jérôme** : pour savoir quand une affaire en pause revient, il doit ouvrir chaque fiche.
- **Où dans le code** : `js/modules/crm/affaires.js:217-230` (la carte n'a pas de date de réveil) ; la date n'est affichée que dans `js/modules/crm/fiche-affaire.js:105`.
- **Règle ou décision concernée** : aucune règle écrite (le message de la fenêtre dit « L'affaire reviendra dans tes Points clés à cette date »).
- **Preuve** : essai F2 et F4 : affaire en pause avec réveil dans 30 jours ; texte de la carte « Garage Marchand Marie Durand », texte de la fiche « Statut En pause jusqu'au 08/11/2026 ». Capture : `captures/f-ordinateur-carte-pause-sans-date.png`.

### F-06 · La liste du Journal ne dit pas de quel projet ou affaire il s'agit, montre un nom interne (`majProjet`) et écrit « 1 lignes »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : chaque ligne de la liste dit seulement « Modification de 1 projet », avec dessous le nom interne du geste (`majProjet`, `mettreAffaireEnPause`, `terminerProjet`). Plusieurs lignes se ressemblent (4 lignes « Modification de 1 projet » de suite après quelques factures et une étoile). Le nom du projet ou de l'affaire n'est visible qu'en ouvrant la ligne. Le pied de page dit « Tout le journal est chargé (1 lignes). ».
- **Ce que ça change pour Jérôme** : le Journal en phrases (version 2.3) reste difficile à lire d'un coup d'œil : il faut ouvrir chaque ligne pour savoir ce qui a changé.
- **Où dans le code** : `js/modules/crm/journal.js:155` (affiche `o.resume` puis `o.outil`) ; `js/modules/crm/journal.js:159` (« lignes » sans accord).
- **Règle ou décision concernée** : aucune ; version 2.3.0 « Journal en phrases » (voir H-03).
- **Preuve** : lecture à l'écran du Journal après le parcours (22 opérations, lignes « Modification de 1 projet · majProjet ») ; détail d'une ligne d'étoile : « Modification · projet pr9 · Champs touchés : documents, modifieLe, modifiePar ». Capture : `captures/f-ordinateur-journal-noms-internes.png` (« 1 lignes » visible).

### F-07 · Sur téléphone, « Proposition envoyée » est coupé en « Proposition envo… » dans les Statistiques de l'Accueil
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : dans « Affaires par étape », le libellé de l'étape est limité en largeur (texte tronqué avec « … »). Sur ordinateur il tient (150 px pour 150 px), sur téléphone il est trop large (129 px pour 120 px).
- **Ce que ça change pour Jérôme** : le nom de l'étape est tronqué ; on le devine, mais ce n'est pas propre.
- **Où dans le code** : `css/crm.css:92` (`.barre-libelle { … overflow: hidden; text-overflow: ellipsis; }`) ; `js/modules/crm/accueil.js:206`.
- **Règle ou décision concernée** : aucune.
- **Preuve** : mesure `scrollWidth 129 > clientWidth 120` sur téléphone, `150 > 150` (pas coupé) sur ordinateur. Capture : `captures/f-telephone-stats-texte-coupe.png`.

### F-08 · « Rouvrir » une affaire perdue ne dit rien (la pause n'existe plus depuis le 22/10/2026), et le projet d'extraction reste actif avec la raison de la perte
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : sur la fiche d'une affaire perdue, « Rouvrir » remet l'affaire en cours sans aucun message. Son projet d'extraction (créé à la perte) reste en place, « Actif », avec « Raison de la perte : Prix » sur sa fiche, alors que l'affaire est de nouveau ouverte. C'est cohérent avec le test C33 (« rouvrir puis perdre de nouveau n'en crée pas une seconde »), mais l'écran ne l'explique nulle part.
- **Ce que ça change pour Jérôme** : après une réouverture, il peut croire que l'extraction a disparu, ou être surpris de la retrouver dans le tableau des projets.
- **Où dans le code** : `js/modules/crm/fiche-affaire.js:77` (`onclick: () => D.rouvrir(a.id)`, pas de message) ; `js/modules/crm/donnees.js:322-324`.
- **Règle ou décision concernée** : test C33 `tests/e2e/projets.spec.js` (« une seule extraction par source »).
- **Preuve** : essai F2 : après « Marquer comme perdue » puis « Rouvrir », `rouvrir_toasts = []`, l'affaire est `ouverte`, le projet `Extraction : Atelier Boulangerie` est `actif`, `raisonPerdue: "Prix"`.

### F-09 · La date d'envoi d'une facture n'a pas d'étiquette visible
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : le formulaire d'ajout d'une facture montre trois champs : « Libellé », « Montant (€) » et un champ date « jj/mm/aaaa » sans aucun texte pour dire que c'est la date d'envoi. Le nom « Date d'envoi de la facture » n'existe que pour les lecteurs d'écran.
- **Ce que ça change pour Jérôme** : il peut hésiter sur ce que la date veut dire (envoi ? paiement ? échéance ?), et la laisser vide sans savoir.
- **Où dans le code** : `js/modules/projets/factures.js:139` (`aria-label` seulement, pas de `placeholder` ni de texte visible).
- **Règle ou décision concernée** : aucune.
- **Preuve** : capture téléphone de la fiche projet : trois champs, dont une date sans libellé. Capture : `captures/f-telephone-facture-hier-aujourdhui.png` (en bas).

### F-10 · La fenêtre « Clôturer avec impayé » dit « La facture restante sera abandonnée et ne compteront pas… »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ
- **Ce qui se passe** : avec une seule facture restante, la phrase mélange singulier et pluriel (« La facture restante sera abandonnée et ne compteront pas dans l'encaissé »).
- **Ce que ça change pour Jérôme** : une faute de français dans une fenêtre importante (sa décision d'abandonner une facture).
- **Où dans le code** : `js/modules/projets/factures.js:225` (`… et ne compteront pas dans l’encaissé`, même fin pour le singulier et le pluriel).
- **Règle ou décision concernée** : aucune.
- **Preuve** : texte lu à l'écran dans l'essai du parcours 7 : « La facture restante sera abandonnée et ne compteront pas dans l'encaissé. Le projet gardera une pastille « Impayé ». ».

## Vérifié et conforme

- **Les 13 parcours demandés se font de bout en bout**, sur ordinateur et sur téléphone, sans erreur dans la console (0 erreur sur 4 lancements).
- **Aucun débordement horizontal de la page** sur aucune étape, ni sur ordinateur ni sur téléphone, y compris fiche projet avec factures, Réglages, Journal et le menu ouvert.
- **Retours visibles** : création d'une personne, d'une affaire, d'un projet, d'une facture, d'un paiement, d'une perte, d'une clôture : un message vert à chaque fois (avec un lien « Ouvrir la fiche » / « Ouvrir le projet » quand c'est utile). Gagner, encaisser et clôturer donnent en plus une célébration qui se ferme seule (2,4 à 2,8 s) ou au clic.
- **Clôture bloquée** : avec une facture « à payer », « Terminer » ouvre « Clôture bloquée » avec la facture en cause, « Marquer payée… » et « Clôturer avec impayé… », et le projet reste « actif » tant qu'on n'a pas choisi. Sortie 1 : après paiement la clôture se fait toute seule. Sortie 2 : la raison est obligatoire (« Dis en quelques mots pourquoi. »). Capture : `captures/f-telephone-cloture-bloquee.png` (la fenêtre tient dans l'écran du téléphone).
- **Perte d'une affaire** : la raison est obligatoire (« La raison est obligatoire. »), le projet d'extraction est créé tout de suite avec son message et son lien.
- **Pause** : supprimée le 22/10/2026 (décision de Jérôme) ; ce point de l'audit n'a plus d'objet.
- **Favoris** : l'étoile d'un document d'affaire ou de projet répond en 150 à 210 ms ; les deux apparaissent sur l'Accueil par ordre alphabétique avec le nom du projet ou de l'affaire ; **le retrait depuis l'Accueil est annulable d'un geste** : le document retiré reste affiché en grisé avec une étoile vide, et un toucher sur l'étoile le remet (il n'y a pas de bouton nommé « Défaire », c'est ce geste qui défait ; le retrait n'est confirmé par aucun message). Capture : `captures/f-telephone-favori-retire.png`. Les étoiles font 36 × 36 (voir F-02).
- **Suppression d'une tâche** : demande confirmation (« Supprimer cette tâche ? ») avec « Annuler » et « Supprimer » ; « Annuler » laisse la tâche.
- **Menu d'une facture payée** : « Modifier… », « Remettre à payer », « Supprimer… ».
- **Fenêtres** : Échap les ferme ; sur ordinateur un clic en dehors aussi (le texte tapé est perdu sans avertissement ; sur téléphone la fenêtre prend tout l'écran, donc pas de clic « en dehors »). Rien d'irréparable : ce ne sont que des formulaires courts.
- **Recherche globale** : trouve personnes, affaires et projets (y compris d'extraction), groupés par type ; Entrée ouvre le premier résultat.
- **Création d'une personne** : 5 champs seulement (Nom, Organisation, Téléphone, Email, Étiquettes), aucun obligatoire sauf le nom ; Entrée enregistre.
- **Création du projet depuis l'affaire gagnée** : le titre est repris, un modèle peut être choisi, la section de l'affaire montre ensuite le projet et un bouton « Détacher le projet ».
- **Journal** : s'ouvre vite, détail d'une ligne lisible, lecture seule, bouton « Actualiser ».
- **Réglages** : s'ouvre sans erreur ni débordement.
