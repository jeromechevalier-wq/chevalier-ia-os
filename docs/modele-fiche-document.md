# Fiche compagnon d'un document Drive (modèle et cadrage)

Rédigé le 03/10/2026, **brouillon à valider par Jérôme**. Demande de Jérôme : à chaque document déposé sur Drive (par exemple « devis 008 »), créer au même endroit un fichier `.md` du même nom qui donne la date de création, un résumé du document et tout ce qui est utile, **toujours dans le même format**, en reprenant le modèle des fiches du second cerveau.

**Précisions de Jérôme, 03/10/2026 (soir)** : (1) **rien n'est déposé à la main** dans le dossier ; tout passe par l'OS ou, pour un agent, par le MCP de l'OS (le bibliothécaire) ; (2) **le résumé s'écrit au moment où l'on attache la pièce** ; (3) l'objectif final est un **fichier index à la racine du dossier**. Les sections 4 à 7 ont été réécrites en conséquence.

Cette demande concerne les **pièces jointes des affaires** (chantier MCP, `plan-mcp.md` section 5.7), pas l'écran Projets. Elle servira aussi aux projets, qui afficheront les documents de leur affaire d'origine.

## 1. D'où vient le modèle

Il n'existe **pas de fichier modèle** dans `_JEROME_OS` : la recherche de « template » ne trouve que `template-email.html` et `template-rapport.html` (modèles HTML). Le format des fiches du second cerveau est **implicite**. Je l'ai relevé dans :
- `mon-second-cerveau/CLAUDE.md` (structure, règle des liens du 28/09/2026, règles de la compilation) ;
- `fiche-audit-ia-cartographie-opportunites.md` (fiche complète) et `2026-09-26-fiche-tally.md` (fiche brute).

Ce qui en ressort, et que la fiche compagnon reprend :
1. un titre `#`, puis une ligne **`AAAA-MM-JJ · @auteur`** ;
2. une section **« En une phrase »** ;
3. des sections courtes, des listes numérotées ou à puces, des tableaux seulement si utiles ;
4. une section **« Questions ouvertes »** (ou « À vérifier / à faire ») ;
5. **« Liens connexes »** facultative, avec la règle de Jérôme : **dans le doute, pas de lien** ;
6. **honnêteté sur ce qui n'a pas pu être lu** (la fiche sur l'audit dit explicitement que la vidéo n'a pas pu être lue) ; aucun chiffre non vérifié présenté comme sûr ;
7. pas de frontmatter YAML, nom de fichier en minuscules avec tirets pour les fiches du vault.

**À valider** : si tu veux que ces fiches soient d'une autre forme (frontmatter, étiquettes Obsidian), dis-le ; je suis parti du format réel de tes fiches.

## 2. Où, quand, sous quel nom

1. **Où** : dans le dossier `Jerome IA OS Attachments`, à côté du document. Ce dossier est **strictement privé** et **distinct** de `_JEROME_OS`, dont une partie est poussée sur GitHub (`_JEROME_OS_onGIT`). **La fiche ne doit jamais être déposée dans un dossier suivi par Git.**
2. **Quand** : au moment où un document est rattaché à une affaire, par l'appli (téléversement) **ou** par le MCP (`preparer_televersement` puis `joindre_fichier_drive`). Les deux chemins se terminent par **la même fonction côté serveur**, qui écrit la fiche et met à jour l'index (section 5). Un seul code, donc un seul format.
3. **Nom** : le nom du document **sans son extension**, plus `.md`. Exemple : `2026-10-02 - depannage Carrel - devis 008.pdf` donne `2026-10-02 - depannage Carrel - devis 008.md`. Même règle de doublon que les pièces jointes (` (2)`). Le nom est figé comme celui du document.
4. **Lien depuis l'appli** : l'entrée du document dans l'affaire gagne un champ `ficheUrl` (lien vers le `.md`), affiché comme « Fiche » à côté du lien du document.

## 3. Modèle

Fichier de référence que le code remplit. Les parties `{…}` sont automatiques ; les parties **à rédiger** le sont par l'agent (section 4).

```markdown
# {Nom du document}

{AAAA-MM-JJ} · @{auteur du dépôt}

## En une phrase

{À rédiger : ce qu'est ce document et à quoi il sert, en une phrase.}

## Fiche du document

- Type : {devis | rapport | compte rendu | contrat | facture | interview | autre}
- Fichier : {nom du fichier}
- Lien Drive : {url}
- Déposé le : {AAAA-MM-JJ}, par {auteur} {via MCP le cas échéant}
- Affaire : {titre de l'affaire} ({chemin de la fiche dans l'appli})
- Client : {personne} · {organisation}
- Projet : {titre du projet, s'il existe}

## Résumé

{À rédiger : trois à huit lignes, dans cet ordre : de quoi il s'agit, ce qui est demandé ou proposé, les conditions.}

## Points clés

{À rédiger, listes numérotées : montants (HT ou TTC précisé), dates et échéances, engagements de chaque partie, livrables. Rien d'inventé : ce qui n'est pas dans le document n'y figure pas.}

## Questions ouvertes

{À rédiger : ce qui manque, ce qui est ambigu, ce qui reste à vérifier ou à faire. Section absente si rien.}

## Liens connexes

{Facultatif. Seulement si la règle de Jérôme est satisfaite : la cible est explicitement traitée dans le document ET lire l'une des deux fiches aide à comprendre l'autre. Dans le doute, pas de lien.}

## À propos de cette fiche

Fiche créée automatiquement le {AAAA-MM-JJ}. {Résumé rédigé par {agent} le {date} | Résumé en attente.} {Mention obligatoire si le document n'a pas pu être lu en entier : « Le document n'a pas pu être lu (raison). Les champs ci-dessus viennent seulement des métadonnées. »}
```

**Règles de rédaction** (reprises de tes fiches) : français, phrases courtes, une idée par ligne ; aucun chiffre qui ne soit pas dans le document ; dire ce qui n'a pas pu être lu ; pas de lien `[[…]]` : la fiche vit hors du vault, donc les liens utiles sont le lien Drive et le chemin de l'affaire dans l'appli ; **le modèle ne change pas d'une fiche à l'autre** (les sections vides restent présentes, sauf « Questions ouvertes » et « Liens connexes »).

## 4. Qui rédige le résumé (décidé le 03/10/2026 : au moment de l'attachement)

| Chemin | Qui écrit le résumé | Comment |
|---|---|---|
| **Agent** (bibliothécaire, ou Claude Code) | l'agent | `joindre_fichier_drive` gagne deux paramètres : **`resume`** (une ligne, obligatoire : c'est la ligne de l'index) et **`fiche`** (facultatif : type, résumé détaillé, points clés, questions ouvertes). L'agent écrit à partir de ce qu'il connaît du document ou de ce que Jérôme lui a donné. **Aucun essai de lecture n'est nécessaire** pour ce chemin : je retire la proposition précédente. |
| **Appli** (téléphone ou Mac) | **à trancher** (question 1) | le formulaire « Téléverser un fichier » demande déjà « contenu » ; il gagnerait un champ « Résumé en une phrase » |

Ce que fait le code dans les deux cas, de façon fiable : titre, date, auteur, fiche du document (type, fichier, lien, affaire, client, projet), section « À propos », création du `.md`, mise à jour de l'index. L'entrée du document dans l'affaire gagne : `resume` (la ligne), `ficheDriveId`, `ficheUrl`, `typeDocument`.

**Pourquoi la question 1** : l'OS n'a **aucune IA intégrée**. Pour qu'il écrive seul le résumé, la fonction devrait appeler un modèle d'IA avec le contenu du fichier. C'est possible, mais c'est une dépendance nouvelle : une clé d'API gardée dans Secret Manager, le contenu du document (devis, noms de clients) envoyé au fournisseur du modèle (point RGPD à valider par Jérôme), un coût par document à mesurer (le budget de 5 € par mois du plan reste un plafond), et une lecture directe seulement pour certains formats (PDF et images ; Word et Excel demanderaient une conversion). Les fichiers audio ne sont pas lisibles ainsi.

## 5. L'index à la racine du dossier

**Oui, l'OS peut gérer cet index**, et c'est un bon endroit pour le faire, parce que toute pièce jointe passe déjà par la même fonction.

1. **Fichier** : `index.md`, à la racine de `Jerome IA OS Attachments`, créé par la fonction à la première pièce jointe ; son identifiant est gardé dans `crm_parametres/drive`, comme celui du dossier (il survit à un renommage ou un déplacement).
2. **Format**, calqué sur `wiki/index.md` de ton second cerveau (« catalogue de toutes les fiches, avec un résumé d'une ligne »), mais **sans liens `[[…]]`** puisque le fichier vit hors du vault : liens Drive à la place. Rangé par client puis par affaire, les plus récentes en haut.

```markdown
# Index des documents

Catalogue des documents joints aux affaires, avec un résumé d'une ligne. Fichier généré automatiquement par Chevalier IA OS : ne pas le modifier à la main, il serait réécrit. Dernière mise à jour : 2026-10-03 16:40.

## depannage Carrel (Eliot)

### création appli devis dépannage
- [2026-10-02 - depannage Carrel - devis 008](lien du document) · devis · 2026-10-02 — {résumé d'une ligne}. [Fiche](lien du .md)
```

3. **Source de vérité : Firestore, pas le fichier.** L'index est **régénéré en entier** à partir des pièces jointes des affaires (qui portent la ligne `resume`), jamais modifié ligne à ligne. Avantages : jamais de fichier à moitié écrit, pas besoin de relire Drive, et un outil **`reconstruire_index_documents`** (profils B et C) répare tout en une commande.
4. **Limites** :
   - **Deux pièces jointes en même temps** : Drive n'offre pas de verrou. Il est possible, très rarement, qu'une régénération écrase l'autre avec un état un peu ancien. Remède : la régénération relit Firestore juste avant d'écrire, et `reconstruire_index_documents` corrige. Risque accepté pour un usage à un utilisateur ; je le note dans la liste des risques du plan.
   - **Pièce retirée d'une affaire** (`retirer_document`) : elle sort de l'index, mais le fichier et sa fiche **restent dans Drive** (le plan interdit de supprimer le fichier). La fiche devient orpheline ; c'est voulu.
   - L'index ne liste que les documents qui ont une fiche, donc ceux joints par l'OS ou le MCP, ce qui est le cas de tout ce qui est dans le dossier.
5. **À quoi il sert** : à un agent ou à toi pour **retrouver un document sans ouvrir chaque fiche**, comme `wiki/index.md` le fait pour le vault. L'appli, elle, cherche déjà dans Firestore ; l'index est donc surtout pour Drive et les agents (un outil `chercher_document` pourrait venir plus tard).

## 6. Limites à connaître

1. **Document remplacé ou renommé hors de l'OS** : la fiche et l'index ne le savent pas. Sans objet tant que rien n'est déposé à la main, comme tu le prévois.
2. **Confidentialité** : la fiche et l'index reprennent des montants et des noms de clients. Ils restent dans le dossier privé ; l'appli ne les envoie ni vers GitHub ni vers le vault.
3. **Coût** : aucun côté Firebase (deux petits fichiers texte écrits par document). Un éventuel résumé par IA (question 1) a son propre coût.
4. **Contradiction à régler dans ton wiki** : `wiki/index.md` indique encore, au 02/10/2026, que « le CRM vit dans Notion » et que l'OS est un « agrégateur » (décision du 30/09/2026), alors que la roadmap du dépôt (02/10/2026) fait de Chevalier IA OS ton CRM. Le bibliothécaire lit ce wiki : il vaut mieux le mettre à jour pour qu'il ne reçoive pas deux versions. Je ne l'ai pas modifié.

## 7. Question pour Jérôme

1. **Résumé depuis l'appli** : (a) tu le tapes toi-même dans un champ « Résumé en une phrase » (ou tu le dictes au clavier du téléphone), ou (b) la fonction l'écrit en appelant un modèle d'IA (clé d'API, contenu envoyé au fournisseur, PDF et images seulement au départ) ? Ma recommandation : **(a) d'abord**, parce qu'il n'a aucune dépendance et que ton résumé est le plus fiable ; **(b) plus tard** si tu constates que tu ne le tapes pas. Le reste (fiche, index, chemin agent) ne change pas.
