# Fiche compagnon d'un document Drive (modèle et cadrage)

Rédigé le 03/10/2026, **brouillon à valider par Jérôme**. Demande de Jérôme : à chaque document déposé sur Drive (par exemple « devis 008 »), créer au même endroit un fichier `.md` du même nom qui donne la date de création, un résumé du document et tout ce qui est utile, **toujours dans le même format**, en reprenant le modèle des fiches du second cerveau.

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
2. **Quand** : au moment où un document est rattaché à une affaire par l'appli (téléversement) ou par l'outil `joindre_fichier_drive` du chantier MCP. Le fichier est créé tout de suite avec les champs automatiques ; le résumé suit (section 4).
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

## 4. Qui remplit quoi

| Partie | Remplie par | Quand |
|---|---|---|
| Titre, date, auteur, fiche du document, « À propos » | **le code** (fonction Firebase, même étape que le nommage) | immédiatement, de façon fiable |
| En une phrase, Résumé, Points clés, Questions ouvertes, Liens connexes | **un agent** (le bibliothécaire, ou Claude Code sur demande) | après la jointure ; en attendant, la fiche affiche « Résumé en attente » |

Raison : l'appli n'a **aucune IA** intégrée. Lire un devis et en tirer un résumé demande un agent, et il faut lui donner le contenu du fichier. Il faut donc :
1. un outil MCP pour écrire la partie rédigée (proposition : `completer_fiche_document`, profil bibliothécaire, lecture et écriture, sans suppression) ;
2. un moyen pour l'agent de **lire le contenu** du fichier. **C'est le point technique non résolu** : l'autorisation Drive de l'appli (`drive.file`) ne voit que les fichiers qu'elle a créés ou qu'on lui a présentés, et l'extraction de texte d'un PDF n'est pas triviale. Le prototype Drive du chantier MCP n'a pas testé la lecture. **Il faut un petit essai avant de promettre le résumé automatique** (par exemple : l'agent lit un PDF et un fichier Word par le connecteur Drive de Claude Code, et on mesure ce qu'il en tire).

Les formats que le connecteur Drive sait lire (relevé de l'outil de lecture) : Google Docs, Sheets et Slides, PDF, Word, Excel, PowerPoint, OpenDocument, PNG et JPEG. Les **fichiers audio** (enregistrements d'interview) ne sont pas lisibles ainsi : leur fiche aura les champs automatiques et la mention « audio non transcrit » ; la transcription par n8n est déjà prévue « plus tard » dans le CRM.

## 5. Exemple (valeurs fictives, pour montrer la forme)

```markdown
# 2026-10-02 - depannage Carrel - devis 008

2026-10-02 · @jerome

## En une phrase

Devis d'un atelier de dépannage pour la création d'une application de devis.

## Fiche du document

- Type : devis
- Fichier : 2026-10-02 - depannage Carrel - devis 008.pdf
- Lien Drive : https://drive.google.com/file/d/…
- Déposé le : 2026-10-02, par jerome
- Affaire : création appli devis dépannage (#/crm/affaires/…)
- Client : Eliot · dépannage Carrel

## Résumé

(…)

## Points clés

1. Montant : 199 € (HT ou TTC à préciser dans le document).
2. (…)

## À propos de cette fiche

Fiche créée automatiquement le 2026-10-02. Résumé en attente.
```

## 6. Limites à connaître

1. **Documents déposés à la main** dans Drive (dossier de travail du projet, lien collé dans l'affaire) : l'appli ne peut ni les voir ni écrire à côté d'eux avec l'autorisation `drive.file`. La fiche compagnon est donc **garantie pour les documents téléversés par l'appli ou présentés à `joindre_fichier_drive`**. Pour un lien collé, un agent qui a accès au Drive peut créer la fiche, mais ce n'est pas automatique.
2. **Document remplacé ou renommé** : la fiche n'est pas mise à jour toute seule ; `completer_fiche_document` peut la réécrire à la demande.
3. **Confidentialité** : la fiche reprend des montants et des noms de clients. Elle reste dans le dossier privé ; elle n'est jamais envoyée vers GitHub ni vers le vault par l'appli.
4. **Coût** : aucun côté Firebase (un petit fichier texte par document). Le coût du résumé dépend de l'agent utilisé, pas de l'appli.

## 7. Questions pour Jérôme

1. **Documents déposés à la main** : veux-tu la fiche compagnon aussi pour ceux-là (il faudra alors un agent qui parcourt le dossier de travail et crée les fiches sur demande ou chaque jour), ou seulement pour les documents joints par l'appli ?
2. **Qui rédige le résumé** : le bibliothécaire (Hermes) en arrière-plan, ou Claude Code quand tu le demandes ? Et es-tu d'accord pour **un essai de lecture** (PDF et Word) avant d'écrire le code ?
