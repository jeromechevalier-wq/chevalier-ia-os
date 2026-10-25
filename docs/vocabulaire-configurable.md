# Vocabulaire configurable : plan pour la session dédiée

Demande de Jérôme (24/10/2026) : chaque client choisit ses mots. Pour le client pilote : « affaire » devient « vente », « projet » devient « chantier », partout. Même code pour tout le monde (pas de version « client »).

## Inventaire (mesuré le 24/10/2026)
- `js/` : 54 fichiers contiennent « affaire » ou « projet » (les plus chargés : `crm/logique.js`, `projets/logique.js`, `crm/affaires.js`, `projets/projets.js`, `crm/donnees.js`, `devis/editeur-ecran.js`, `crm/fiche-affaire.js`, `crm/reglages-config.js`, `os/registre.js`).
- `functions/` : 27 fichiers ; `functions-plateforme/` : 27 fichiers (serveur MCP : noms et descriptions des outils, messages d'erreur, e-mails).
- `docs/` : 91 fichiers (à traiter en dernier, par une phrase de principe plutôt qu'une réécriture).
- Accords les plus fréquents dans l'écran : « une affaire » (58), « l'affaire » (26), « de l'affaire » (21), « d'affaires » (21), « des affaires » (16), « les affaires » (14), « nouvelle affaire », « cette affaire », « au projet ».

## Le piège : le genre
« affaire » est féminin, « vente » aussi. « projet » est masculin, « chantier » aussi. Pour ces deux paires, un simple remplacement de mot suffit. Mais un autre client pourrait choisir « dossier » (masculin) pour « affaire » : « une nouvelle affaire » devrait alors devenir « un nouveau dossier ». Il faut donc que chaque mot porte son genre.

## Mots proposés dans le réglage (tableau reçu de Jérôme le 24/10/2026)
Le tableau compare des mots possibles pour le « dossier global » selon le métier (maçon, plombier, électricien, étancheur). Le réglage proposera ces mots en suggestions, avec leur genre, et laissera aussi écrire un mot libre :
- Affaire (f), Chantier (m), Dossier chantier (m), Projet (m), Commande (f), Dossier client (m), Dossier travaux (m), Suivi commercial (m), Intervention (f), Installation (f).
- Lecture du tableau : « Affaire » et « Chantier » sont « très adaptés » pour les quatre métiers ; « Intervention » est très adapté pour plombier, électricien et étancheur mais seulement « possible » pour un maçon. Cela confirme qu'il faut un réglage par client et non un mot unique.
- Nos deux notions : le premier mot (aujourd'hui « affaire ») désigne la vente en cours ; le second (aujourd'hui « projet ») le travail une fois la vente gagnée. Le client pilote : « vente » puis « chantier ». Un autre métier pourra choisir « intervention » pour le second.

## Conception
1. **Un dictionnaire** `js/os/vocabulaire.js` : pour chaque notion (`affaire`, `projet`, plus plus tard `devis`, `phase`, `étape`…) : singulier, pluriel, genre (`f`/`m`), mot par défaut. Le réglage du client vient de `reglages` (champ `vocabulaire`, valeurs par défaut = mots actuels, donc **aucun changement visible tant que rien n'est réglé**).
2. **Une fonction `mot(notion, {pluriel, article})`** : `mot('affaire', {article:'un'})` donne « une vente » ou « un dossier ». Articles gérés : le/la/l', un/une, de/du/de la/de l', ce/cette, nouveau/nouvelle, au/à la/à l'.
3. **Les textes deviennent des modèles** : `` `Nouvelle ${mot('affaire')}` `` ou `t('Nouvelle {affaire}')`. Un script de contrôle liste les textes encore en dur (« affaire » / « projet » hors de ce fichier) : c'est la liste de ce qui reste à faire, et un test empêche d'en ajouter de nouveaux.
4. **Réglages** : page « Vocabulaire » (deux champs au début : le mot pour affaire, le mot pour projet, avec genre) avec aperçu « Nouvelle vente ».
5. **Ce qui ne change JAMAIS** : identifiants stockés (collections `affaires`, `projets`, champs), noms des outils MCP (`creer_affaire`…), URLs. Seuls les textes affichés changent. Les outils MCP exposent le mot du client dans leurs descriptions (lues au démarrage depuis les réglages), pas dans leurs noms.
6. **Ordre de passage** (une PR par bloc, test e2e avec un vocabulaire « vente / chantier » pour chacun) : dictionnaire + réglage + test ; Accueil et menus ; liste et kanban des affaires ; fiche affaire ; liste et fiche des projets ; Réglages ; devis (l'éditeur parle d'« Affaire ») ; e-mails et documents générés ; serveur MCP (descriptions) ; docs.
7. **Pas fait cette nuit** : le remplacement lui-même (volume trop grand pour une nuit sans relecture humaine, risque de textes mal accordés). Cette nuit : ce plan et l'inventaire seulement.

## Critères d'acceptation de la session dédiée
- Avec le réglage « vente / chantier », aucune page ne montre plus « affaire » ni « projet » (test qui parcourt les écrans et cherche ces mots).
- Sans réglage, rien ne change (captures identiques).
- Accords corrects (« une nouvelle vente », « un nouveau chantier », « au chantier »).
- Cas vide : réglage absent = mots d'origine. Cas d'erreur : mot vide refusé.
