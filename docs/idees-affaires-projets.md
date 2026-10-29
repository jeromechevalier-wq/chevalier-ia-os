# Idées d'amélioration : affaires, projets, fiches (revue du 21/10/2026)

Revue faite avec Jérôme, une idée à la fois, sans code. Chaque idée a un **critère d'acceptation** (une phrase observable) : c'est la base du test (nom commençant par le numéro de l'idée) et de la capture de recette (`CLAUDE.md`, process de recette). Avant de coder : lire `docs/consignes-ui.md`. Même code chez Jérôme et chez les clients. Aucune donnée de client dans ce dépôt public.

## Abandonnées
- **I1** Chatbot dans l'interface : abandonnée (coût de l'API, inutile puisque Claude et ChatGPT accèdent au CRM par le MCP).
- **I3** Fiche épurée (n'afficher que les infos remplies, un stylo par section) : abandonnée, Jérôme épurera autrement.
- **I8** Titre du champ résumé et largeur sur téléphone : le bloc concerné était le champ description, supprimé par I5. Critère repris dans I5.

## Ordre proposé (une PR par sujet, une branche par PR depuis `main`)
1. Correctifs de fiche : I2, I13, I18.
2. Notes : I4, I6, I14.
3. I5 seule (touche les outils MCP et le contenu des fiches).
4. Ajouts cohérents : I16 (règle et inventaire), puis I17, I12, I11, I10 ; mise à jour de `consignes-ui.md`.
5. I7 : propriétaire dans le Résumé.
6. I15 puis I9 : filtres.
La montée de version et le wiki : dans la dernière PR seulement.

## État au matin du 22/10/2026 (nuit « GO NUIT » du 21 au 22/10/2026)

| N° | État | PR |
|---|---|---|
| I1, I3 | Abandonnées | – |
| I8 | Absorbée par I5 | – |
| I2, I13, I18 | **Faits** | 160 |
| I4, I6, I14 | **Faits** | 161 (corrections de tests : I3 et K2 lisent le bouton principal sur la page Personnes) |
| I17, I12, I11 | **Faits** (règle I16 appliquée à ces trois endroits) | 162 |
| I7 | **Fait** | 163 |
| I5 | **Fait** (note de départ vide ; `copieDeNoteId` ; MCP : `noteEpingleeId`, ancien paramètre `description` toléré) | 164 |
| I10 | **Fait** (`ajouteLe` sur les nouveaux documents) | 165 |
| I9 | **Fait** | 166 |
| I15 | **Partiel** : inventaire fait, bouton « Filtres » des Projets aligné ; reste Journal, Veille, Automatisations, Tableau de bord Technique, et l'unification des deux fenêtres de filtres | 166 |
| I16 | **Règle écrite** dans `docs/consignes-ui.md` (section « Boutons ») et appliquée à Factures, Tâches, Documents, Dossier de travail, Montant ; **reste à aligner** : voir la liste de cette section | 162, 165 |

Décisions que Jérôme doit encore trancher : bouton « Filtres » de l'Historique à 44 px sur téléphone (36 px aujourd'hui, comme les autres petits boutons) ; fenêtre « Filtres » qui propose les 6 valeurs même quand l'une ne peut rien donner ; date d'ajout des documents joints par l'assistant (aucune aujourd'hui) ; passage de Journal, Veille, Automatisations et Tableau de bord au bouton « Filtres » (I15 suite).

## Critères d'acceptation

**I2 (bogue).** Sur une affaire ou un projet, dès que je choisis une personne ou une organisation dans le Résumé et que je quitte la cellule, son lien apparaît en haut à côté de l'étiquette d'état, sans recharger la page (seul ce bloc se met à jour). Si je la retire avec la croix, le lien disparaît aussi tout de suite.

**I4.** La note épinglée du haut de la fiche garde sa croix pour désépingler et reçoit un seul bouton « Modifier », sous la ligne « date · heure · auteur » (toujours visible, même coupée) ; la modification se fait sur place, sans quitter la fiche.

**I5.** À la création d'une affaire ou d'un projet (écran, MCP, projet créé depuis une affaire), une note épinglée est créée, vide, avec un texte fantôme gris (« Cette affaire concerne… » / « Ce projet concerne… ») qui disparaît au clic. Un projet créé depuis une affaire reçoit une copie du texte de la note de l'affaire. Si on supprime ou désépingle la note, elle ne revient pas. Les affaires et projets déjà existants ne reçoivent pas de note. Le champ `description` n'existe plus (écran, outils MCP `creer_affaire`, `modifier_affaire`, `creer_projet`, `modifier_projet`, `creer_projet_depuis_affaire`, tests TL1 à TL6 adaptés) ; pas de reprise de données (Jérôme : tout texte déjà écrit peut disparaître ; Ingrid n'en a jamais écrit). Sur téléphone, la note épinglée prend toute la largeur, comme le bloc Factures.

**I6.** Dans une note du fil ou une note épinglée, une adresse commençant par `https://`, `http://` ou `www.` s'affiche comme un lien cliquable ouvert dans un nouvel onglet ; seule l'adresse est cliquable ; la ponctuation finale d'une phrase n'en fait pas partie ; l'affichage transforme l'adresse (les anciennes notes en profitent, la note enregistrée ne change pas) ; protection contre l'injection de code.

**I7.** Le menu « Propriétaire » quitte l'en-tête et passe dans le Résumé, en menu déroulant modifiable, sur les affaires, les projets, les personnes et les organisations (si une fiche n'a pas de Résumé : son premier bloc de champs).

**I9.** À côté du titre « Historique », un petit bouton « Filtres » de même style que celui de la liste des Personnes. Les pastilles (Tous, Activités, Notes, Documents, Affaires, Événements) sont cachées au repos et apparaissent au clic ; si un filtre autre que « Tous » est actif, un indicateur (pastille de compte) le montre. Le filtre revient sur « Tous » en quittant la fiche. Même comportement sur téléphone que le filtre des Personnes sur téléphone.

**I10.** Onglet G-Drive, ex-Documents (affaires et projets) : tout en haut, la ligne « Dossier de travail » reste dans l'onglet (elle ne passe pas dans le Résumé) ; sans dossier : « + Ajouter » qui propose « Créer un dossier dans Google Drive » ou « Lier un dossier Google Drive existant » ; avec dossier : « Ouvrir le dossier » et « Retirer ». Le titre « Liens et documents » disparaît. En dessous, une ligne « Documents  + Ajouter », toujours en haut de la liste. Chaque document affiche la date et l'heure de son ajout (les anciens documents sans date n'en affichent pas). Le bouton « Ajouter un lien web » disparaît (les adresses passent par les notes, I6) ; les liens web déjà enregistrés restent affichés. Le petit « i » d'explication est conservé. Mettre à jour les lignes 26 et 27 de `docs/consignes-ui.md`.

**I11.** Projets seulement. Dans Tâches, une seule ligne « Clique ici pour ajouter une tâche… ». Au clic, le champ s'ouvre comme celui des activités et propose tout (phase, dates rapides, champ date). Titre seul : phase en cours, sans date (une tâche sans date est valable). Le gros bouton jaune « Ajouter la tâche » disparaît.

**I12.** Bloc Factures : une ligne « Factures  + Ajouter » au même style que « Offre  + Ajouter ». Le formulaire (Libellé, Montant, Date) n'apparaît qu'après le clic. Les factures se créent une par une.

**I13.** Fiche personne, section Organisation : le nom de l'organisation et les boutons « Détacher » et « Changer » sont alignés sur la même ligne.

**I14.** Une note de plus de 20 lignes sur ordinateur (12 sur téléphone) est coupée avec « … » ; un bouton « Développer » sous la dernière ligne visible affiche toute la note, puis devient « Réduire ». Jusqu'à la limite, pas de bouton. La note épinglée du haut reste coupée à 3 lignes sur les deux formats.

**I15 (grande).** Tous les filtres de l'appli (Personnes, Organisations, Affaires, Projets, Veille, Historique…) ont le même bouton « Filtres », la même pastille de compte et le même fonctionnement, sur ordinateur et sur téléphone. Commencer par l'inventaire des filtres actuels.

**I16 (grande).** Trois styles de boutons seulement (validés par Jérôme) : (1) ajouter à une liste ou un champ = ligne « Étiquette  + Ajouter » en texte jaune, sans cadre ; (2) action principale d'un écran = bouton jaune plein, un seul par écran ; (3) autres actions = bouton à contour. Commencer par l'inventaire de tous les boutons (notamment les pastilles Appel / Rendez-vous / Email / Tâche, et l'absence de « Tâche » dans les pastilles d'activité du projet, à trancher) puis inscrire la règle dans `docs/consignes-ui.md`.

**I17.** Le Montant de l'affaire reste dans l'en-tête ; tant qu'il est vide, un tiret « — » s'affiche en gris (29/10/2026 : plus de « 999 € » inventé ; jamais compté dans les totaux ni dans l'objectif de chiffre d'affaires) ; avec des devis finalisés, « Montant accepté HT » ou « Montant proposé HT » (calculé par le serveur, infobulle détaillée) prend la place : voir `docs/montant-affaire.md` ; au clic, on saisit le montant ; rempli, il s'affiche en euros.

**I18.** Le bouton « + Personne » de l'écran Accueil est retiré (le bouton rond « + » du haut sert à créer). Vérifier avant que ce « + » permet bien de créer une personne.

## Revue du 22/10/2026 (suite) et nuit « GO NUIT » du 22/10/2026 au 23/10/2026

Jérôme a donné ses réponses le 22/10/2026 ; les sujets ont été codés la même nuit. Numérotation de cette revue (J, K, L, M, AF) pour ne pas la confondre avec I1 à I18.

| N° | Décision de Jérôme | État | PR |
|---|---|---|---|
| J1 | Historique : plusieurs filtres à la fois (cases à cocher, « ou »), mémorisés jusqu'au rechargement | **Fait** | 174 |
| J2 | Montant estimé (tiret quand vide) : même zone, alignement et espacement corrigés | **Fait** | 172 |
| J3 | Kanban « ouvertes seulement » | **Abandonné** : la dernière colonne (gagnée) sert au suivi (document signé, banque…) ; les colonnes Perdues et En pause restent. À rediscuter si « trop de colonnes » | – |
| J4 | Tâche : le mot reste le type d'activité des deux fiches | **Fait** | 169 |
| J4b | Tâches de projet → **livrables** (mots : projet → phases → livrables ; affaire → étapes) | **Fait** (outils MCP renommés, sans alias) | 171 |
| J5 | Filtres harmonisés partout (cases, pastille, mémoire jusqu'au rechargement) | **Fait** pour Personnes, Organisations, Affaires, Projets, Historique, Journal, Veille, Automatisations ; Tableau de bord : pas un filtre de liste | 174, 175, 176, 177 |
| J6 | Date d'ajout des documents : toujours automatique | Déjà vrai pour les nouveaux documents (`ajouteLe`) | 165 |
| J7 | Source = liste fixe (Réglages) ; Ville = texte libre propre | **Fait** ; migration des 4 phrases de source faite à la main avec les outils MCP (phrase d'origine gardée dans une note) | 170 |
| J8 | Type d'activité de départ = Appel dans l'affaire et le projet | **Fait** | 169 |
| J9 | Bouton « Gagnée » retiré de l'en-tête de l'affaire | **Fait** | 172 |
| M1 à M3 | Textes « 90 jours » retirés (Journal, outils MCP) | **Faits** | 173 |

Reste : **I16** (aligner les boutons ; décisions à prendre avec Jérôme sur les pastilles de choix, « Créer le projet », le style discret) ; configuration des types d'activité par l'utilisateur (« visite », « démonstration »…) : idée d'avenir.

## Autres pistes à placer
Retours d'Ingrid (premier client réel depuis le 21/10/2026) ; audit complet des différences entre l'espace de Jérôme et ceux des clients ; second passage du look compact ; aide client publique ; chantier ChatGPT sur le MCP ; **audit de sécurité Fable : décalé à la semaine prochaine** (décision de Jérôme du 21/10/2026) ; allègement des fiches.
