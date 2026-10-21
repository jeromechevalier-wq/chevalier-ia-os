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

## Critères d'acceptation

**I2 (bogue).** Sur une affaire ou un projet, dès que je choisis une personne ou une organisation dans le Résumé et que je quitte la cellule, son lien apparaît en haut à côté de l'étiquette d'état, sans recharger la page (seul ce bloc se met à jour). Si je la retire avec la croix, le lien disparaît aussi tout de suite.

**I4.** La note épinglée du haut de la fiche garde sa croix pour désépingler et reçoit un seul bouton « Modifier », sous la ligne « date · heure · auteur » (toujours visible, même coupée) ; la modification se fait sur place, sans quitter la fiche.

**I5.** À la création d'une affaire ou d'un projet (écran, MCP, projet créé depuis une affaire), une note épinglée est créée, vide, avec un texte fantôme gris (« Cette affaire concerne… » / « Ce projet concerne… ») qui disparaît au clic. Un projet créé depuis une affaire reçoit une copie du texte de la note de l'affaire. Si on supprime ou désépingle la note, elle ne revient pas. Les affaires et projets déjà existants ne reçoivent pas de note. Le champ `description` n'existe plus (écran, outils MCP `creer_affaire`, `modifier_affaire`, `creer_projet`, `modifier_projet`, `creer_projet_depuis_affaire`, tests TL1 à TL6 adaptés) ; pas de reprise de données (Jérôme : tout texte déjà écrit peut disparaître ; Ingrid n'en a jamais écrit). Sur téléphone, la note épinglée prend toute la largeur, comme le bloc Factures.

**I6.** Dans une note du fil ou une note épinglée, une adresse commençant par `https://`, `http://` ou `www.` s'affiche comme un lien cliquable ouvert dans un nouvel onglet ; seule l'adresse est cliquable ; la ponctuation finale d'une phrase n'en fait pas partie ; l'affichage transforme l'adresse (les anciennes notes en profitent, la note enregistrée ne change pas) ; protection contre l'injection de code.

**I7.** Le menu « Propriétaire » quitte l'en-tête et passe dans le Résumé, en menu déroulant modifiable, sur les affaires, les projets, les personnes et les organisations (si une fiche n'a pas de Résumé : son premier bloc de champs).

**I9.** À côté du titre « Historique », un petit bouton « Filtres » de même style que celui de la liste des Personnes. Les pastilles (Tous, Activités, Notes, Documents, Affaires, Événements) sont cachées au repos et apparaissent au clic ; si un filtre autre que « Tous » est actif, un indicateur (pastille de compte) le montre. Le filtre revient sur « Tous » en quittant la fiche. Même comportement sur téléphone que le filtre des Personnes sur téléphone.

**I10.** Onglet Documents (affaires et projets) : tout en haut, la ligne « Dossier de travail » reste dans l'onglet (elle ne passe pas dans le Résumé) ; sans dossier : « + Ajouter » qui propose « Créer un dossier dans Google Drive » ou « Lier un dossier Google Drive existant » ; avec dossier : « Ouvrir le dossier » et « Retirer ». Le titre « Liens et documents » disparaît. En dessous, une ligne « Documents  + Ajouter », toujours en haut de la liste. Chaque document affiche la date et l'heure de son ajout (les anciens documents sans date n'en affichent pas). Le bouton « Ajouter un lien web » disparaît (les adresses passent par les notes, I6) ; les liens web déjà enregistrés restent affichés. Le petit « i » d'explication est conservé. Mettre à jour les lignes 26 et 27 de `docs/consignes-ui.md`.

**I11.** Projets seulement. Dans Tâches, une seule ligne « Clique ici pour ajouter une tâche… ». Au clic, le champ s'ouvre comme celui des activités et propose tout (phase, dates rapides, champ date). Titre seul : phase en cours, sans date (une tâche sans date est valable). Le gros bouton jaune « Ajouter la tâche » disparaît.

**I12.** Bloc Factures : une ligne « Factures  + Ajouter » au même style que « Offre  + Ajouter ». Le formulaire (Libellé, Montant, Date) n'apparaît qu'après le clic. Les factures se créent une par une.

**I13.** Fiche personne, section Organisation : le nom de l'organisation et les boutons « Détacher » et « Changer » sont alignés sur la même ligne.

**I14.** Une note de plus de 20 lignes sur ordinateur (12 sur téléphone) est coupée avec « … » ; un bouton « Développer » sous la dernière ligne visible affiche toute la note, puis devient « Réduire ». Jusqu'à la limite, pas de bouton. La note épinglée du haut reste coupée à 3 lignes sur les deux formats.

**I15 (grande).** Tous les filtres de l'appli (Personnes, Organisations, Affaires, Projets, Veille, Historique…) ont le même bouton « Filtres », la même pastille de compte et le même fonctionnement, sur ordinateur et sur téléphone. Commencer par l'inventaire des filtres actuels.

**I16 (grande).** Trois styles de boutons seulement (validés par Jérôme) : (1) ajouter à une liste ou un champ = ligne « Étiquette  + Ajouter » en texte jaune, sans cadre ; (2) action principale d'un écran = bouton jaune plein, un seul par écran ; (3) autres actions = bouton à contour. Commencer par l'inventaire de tous les boutons (notamment les pastilles Appel / Rendez-vous / Email / Tâche, et l'absence de « Tâche » dans les pastilles d'activité du projet, à trancher) puis inscrire la règle dans `docs/consignes-ui.md`.

**I17.** Le Montant de l'affaire reste dans l'en-tête ; tant qu'il est vide, un montant fantôme « 999 € » s'affiche en gris (jamais compté dans les totaux ni dans l'objectif de chiffre d'affaires) ; au clic, on saisit le montant ; rempli, il s'affiche en euros.

**I18.** Le bouton « + Personne » de l'écran Accueil est retiré (le bouton rond « + » du haut sert à créer). Vérifier avant que ce « + » permet bien de créer une personne.

## Autres pistes à placer
Retours d'Ingrid (premier client réel depuis le 21/10/2026) ; audit complet des différences entre l'espace de Jérôme et ceux des clients ; second passage du look compact ; aide client publique ; chantier ChatGPT sur le MCP ; **audit de sécurité Fable : décalé à la semaine prochaine** (décision de Jérôme du 21/10/2026) ; allègement des fiches.
