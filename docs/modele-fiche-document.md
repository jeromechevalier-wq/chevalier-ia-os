# Fiche compagnon d'un document Drive (modèle et cadrage)

Rédigé le 03/10/2026, **brouillon à valider par Jérôme**. Demande de Jérôme : à chaque document déposé sur Drive (par exemple « devis 008 »), créer au même endroit un fichier `.md` du même nom qui donne la date de création, un résumé du document et tout ce qui est utile, **toujours dans le même format**, en reprenant le modèle des fiches du second cerveau.

**Précisions de Jérôme, 03/10/2026 (soir)** : (1) **rien n'est déposé à la main** dans le dossier ; tout passe par l'OS ou, pour un agent, par le MCP de l'OS (le bibliothécaire) ; (2) **le résumé s'écrit au moment où l'on attache la pièce** ; (3) l'objectif final est un **fichier index à la racine du dossier**. Les sections 4 à 7 ont été réécrites en conséquence.

Cette demande concerne les **pièces jointes des affaires et des projets** (chantier MCP, `plan-mcp.md` section 5.7), pas l'écran Projets lui-même. Un projet reçoit ses propres pièces et affiche aussi, en lecture, celles de son affaire d'origine.

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
- Affaire : {titre} · identifiant {affaireId} · {adresse de la fiche dans l'appli}
- Organisation : {nom} · identifiant {organisationId} · {adresse de la fiche}
- Personne : {nom} · identifiant {personneId} · {adresse de la fiche}
- Projet : {titre} · identifiant {projetId} · {adresse de la fiche} (s'il existe)
- Dépôt GitHub : {urlGithub de l'affaire ou du projet} (s'il est renseigné)

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

**Règles de rédaction** (reprises de tes fiches) : français, phrases courtes, une idée par ligne ; aucun chiffre qui ne soit pas dans le document ; dire ce qui n'a pas pu être lu ; pas de lien `[[…]]` (voir « Liens vers l'affaire, l'organisation et la personne » ci-dessous) ; **le modèle ne change pas d'une fiche à l'autre** (les sections vides restent présentes, sauf « Questions ouvertes » et « Liens connexes »).

### Liens vers l'affaire, l'organisation et la personne (décidé le 03/10/2026)

Question de Jérôme : sans crochets, perd-on l'information quand l'OS ou un agent lit un devis ? **Non, à condition de garder la relation, qui est ce qui compte. Les crochets n'en sont que l'écriture, et elle ne marche pas ici.**

1. **Ce que la relation doit apporter** : qu'un agent qui lit la fiche sache **à quelle affaire, quelle organisation et quelle personne** le document se rattache, et puisse aller les chercher.
2. **Pourquoi pas `[[…]]`** : un lien à crochets ne se résout que dans un vault Obsidian, et seulement si une fiche de ce nom existe. Or la fiche vit dans `Jerome IA OS Attachments`, hors du vault, et les clients du CRM (« depannage Carrel ») **n'ont pas de fiche dans le vault**. Le lien serait mort. Si la fiche était un jour copiée dans le vault, le lint de ton wiki (qui cherche les liens cassés) la signalerait. Ta propre règle des liens (« la cible est traitée dans la source **et** lire l'une aide à comprendre l'autre ») est remplie par un devis et son client, mais **il faut une cible qui existe**.
3. **Ce qu'il faut à la place, et qui est plus fort** : les **identifiants stables** (`affaireId`, `organisationId`, `personneId`, `projetId`) **et** l'adresse de la fiche dans l'appli, ensemble, dans la section « Fiche du document ». Un nom seul est ambigu (deux « Eliot », une organisation renommée) ; l'identifiant ne l'est jamais et permet à un agent d'appeler `lire_affaire` ou `lire_organisation` du MCP en un appel. L'adresse est **absolue** (`https://chevalier-ia-os.web.app/#/crm/affaires/<id>`) : elle s'ouvre d'un clic depuis Drive, un mail ou un agent.
4. **Les noms restent écrits en clair** dans le résumé (« devis pour dépannage Carrel, Eliot ») : un agent comprend le contexte sans rien appeler.
5. **L'index** reprend la même logique : titres de client et d'affaire cliquables vers l'appli.
6. **Si le bibliothécaire copie un jour une fiche dans le vault** (compilation), les crochets deviennent légitimes **pour les cibles qui existent dans le vault** (une entité déjà fichée) et seulement celles-là, selon ta règle. Rien à faire maintenant.
7. **Pendant la migration** (CRM à la fois dans Notion et dans l'OS) : une pièce ne se joint qu'à une affaire **ou un projet** de l'OS, donc les identifiants sont ceux de l'OS. Une affaire encore seulement dans Notion doit d'abord être créée dans l'OS.
8. **Pièces jointes d'un projet** (décidé le 03/10/2026) : un projet reçoit des pièces comme une affaire. La fiche porte alors `projetId` ; si le projet vient d'une affaire, elle porte aussi `affaireId` (celui de l'affaire d'origine), pour retrouver le devis signé depuis le livrable. Tant que l'écran Projets n'est pas construit (version 2.1), seules les affaires reçoivent des pièces.

## 4. Qui rédige le résumé (décidé le 03/10/2026 : au moment de l'attachement)

| Chemin | Qui écrit le résumé | Comment |
|---|---|---|
| **Agent** (bibliothécaire, ou Claude Code) | l'agent | `joindre_fichier_drive` gagne deux paramètres : **`resume`** (une ligne, obligatoire : c'est la ligne de l'index) et **`fiche`** (facultatif : type, résumé détaillé, points clés, questions ouvertes). L'agent écrit à partir de ce qu'il connaît du document ou de ce que Jérôme lui a donné. **Aucun essai de lecture n'est nécessaire** pour ce chemin : je retire la proposition précédente. |
| **Appli** (téléphone ou Mac) | **Jérôme** (décidé le 03/10/2026) | le formulaire « Téléverser un fichier » demande déjà « contenu » ; il gagne un champ **« Résumé en une phrase »**, que l'on tape ou que l'on dicte au clavier du téléphone. Obligatoire, puisque c'est la ligne de l'index |

Ce que fait le code dans les deux cas, de façon fiable : titre, date, auteur, fiche du document (type, fichier, lien, affaire, client, projet), section « À propos », création du `.md`, mise à jour de l'index. L'entrée du document dans l'affaire gagne : `resume` (la ligne), `ficheDriveId`, `ficheUrl`, `typeDocument`.

**Écarté** : un résumé écrit par une IA appelée par la fonction (clé d'API, contenu des devis envoyé à un fournisseur, formats limités). Jérôme n'en veut pas ; l'OS reste sans IA. À rouvrir seulement si le champ n'est pas rempli à l'usage.

## 5. L'index à la racine du dossier

**Oui, l'OS peut gérer cet index**, et c'est un bon endroit pour le faire, parce que toute pièce jointe passe déjà par la même fonction.

1. **Fichier** : `index.md`, à la racine de `Jerome IA OS Attachments`, créé par la fonction à la première pièce jointe ; son identifiant est gardé dans `crm_parametres/drive`, comme celui du dossier (il survit à un renommage ou un déplacement).
2. **Format**, calqué sur `wiki/index.md` de ton second cerveau (« catalogue de toutes les fiches, avec un résumé d'une ligne »), mais **sans liens `[[…]]`** puisque le fichier vit hors du vault : liens Drive à la place. Rangé par client puis par affaire, les plus récentes en haut.

```markdown
# Index des documents

Catalogue des documents joints aux affaires, avec un résumé d'une ligne. Fichier généré automatiquement par Chevalier IA OS : ne pas le modifier à la main, il serait réécrit. Dernière mise à jour : 2026-10-03 16:40.

## [depannage Carrel](adresse de la fiche organisation) · Eliot

### [création appli devis dépannage](adresse de la fiche affaire)
(les projets de ce client suivent, chacun avec son titre cliquable, sous le même titre de client)
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
3. **Coût** : aucun côté Firebase (deux petits fichiers texte écrits par document). Pas de résumé par IA : aucun coût de modèle.
4. **Contradiction à régler dans ton wiki** : `wiki/index.md` indique encore, au 02/10/2026, que « le CRM vit dans Notion » et que l'OS est un « agrégateur » (décision du 30/09/2026), alors que la roadmap du dépôt (02/10/2026) fait de Chevalier IA OS ton CRM. Le bibliothécaire lit ce wiki : il vaut mieux le mettre à jour pour qu'il ne reçoive pas deux versions. Je ne l'ai pas modifié.

## 7. Ce qu'il reste à trancher

Rien de bloquant sur la fiche et l'index. Le chantier des pièces jointes reste « en réflexion » (Jérôme, 03/10/2026) : ce document est prêt à être intégré à `plan-mcp.md` (section 5.7 et liste des outils) quand il démarrera.
