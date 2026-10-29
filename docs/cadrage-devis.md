# Cadrage : module Devis

Rédigé le 24/10/2026 avec Jérôme (discussion complète), relu deux fois par Fable. **État au 24/10/2026 (fin de la première nuit de code) : voir la section « Mise à jour » juste après ce paragraphe ; les sections 2 à 13 ci-dessous sont le cadrage d'origine, et la section « Mise à jour » l'emporte quand elles se contredisent.** Chaque point est marqué **Décidé** (par Jérôme), **Proposition** (choix par défaut de Claude, à confirmer) ou **À trancher**.

> **Dépôt public** : aucun nom de client, aucune donnée d'entreprise (SIRET, assurance, RIB, tarifs, modèle de devis) ne vit ici ni dans le code. Tout ce qui est propre à un client est une **donnée de son espace** (réglages du module, bordereau) ou vit dans **son** workflow n8n. Un test statique le vérifie (voir « Critères d'acceptation », D26).

## Mise à jour du 24/10/2026 (éditeur, parties 2 et 3, version 2.29.0)
Menus de ligne et de section (insérer au début, à la fin, au-dessus, en dessous ; dupliquer ; supprimer), **saut de page visuel** (une bande entre deux lignes ou deux sections, placée où l'utilisateur veut ; un ancien « Nouvelle page avant » est converti à l'ouverture), Bibliothèque d'articles, **ajustement global** de marge et de remise depuis « Définir un ajustement », menu **Options** (cases d'affichage), bouton **Envoyer** (e-mail, télécharger, imprimer) à la place de « Finaliser », e-mail du destinataire facultatif, croix pour fermer, éditeur compact (feuille centrée). Le PDF réel reste en pause (PR 235).

## Mise à jour du 24/10/2026 (après la première nuit de code)

**Ce qui est fait** : logique et totaux, remise, conditions, adresses, ouvrages, familles, chantier et émetteur, générateur de CGV, écran liste, éditeur, Bordereau, fonction de PDF, outils MCP (voir `docs/plan-mcp.md`). Ce qui reste est dans `docs/reprise-prochaine-session.md` et `docs/roadmap-evolutions-devis.md`.

**Décisions qui remplacent ou précisent le cadrage d'origine**

- **Pas de n8n en v1.** La mise en page, le PDF et le rangement ne passent plus par n8n (les sections 2 et 6 sont donc dépassées sur ce point). Le PDF = un **gabarit HTML maison** transformé par **Gotenberg** (service privé sur Cloud Run, région UE), puis rangé dans Google Drive par un **compte de service sans clé** : c'est la fonction `devisPdf`. Sa PR est ouverte et **à fusionner par Jérôme** (elle touche le déploiement) ; les étapes de console sont dans `docs/reprise-prochaine-session.md`. Un brouillon n'a pas de PDF.
- **Emplacements prévus, pas développés** : `pagesAvant` (pages de présentation avant le chiffrage) et `blocSignature` (signature en fin de PDF).
- **Remise client distincte de la marge** : la marge est interne (jamais visible du client) ; la remise est une ligne visible sur le devis.
- **Conditions** : l'acompte se calcule sur le **TTC** ; les primes (énergie) sont **déduites** ; la **retenue de garantie** est de 5 % du TTC ; le total final s'appelle **« Net à payer »**.
- **Chantier et réglages de l'émetteur** : l'identité de l'entreprise vit dans les réglages du module (donnée de l'espace, jamais dans le dépôt) ; le chantier est une adresse et une description sur le devis (pas d'entité « chantier »).
- **Ouvrages** : un ouvrage regroupe des articles et se glisse dans un devis comme un bloc.
- **Familles d'articles** : une seule famille par article, **pas de sous-familles**. Nouveau type de ligne **Texte** (paragraphe sans prix). Un article a une **référence** et une **marque**. Stocks et tarifs fournisseurs : hors v1.
- **CGV** : un générateur produit le texte ; il est **à faire relire par un juriste** (constante `CGV_RELUES_PAR_JURISTE`, faux tant que ce n'est pas fait, avec avertissement à l'écran ; points à trancher listés en tête de `js/modules/devis/cgv.js`).
- **Statuts** : Brouillon, Finalisé, Envoyé, Signé, Refusé, Remplacé ; **Expiré** se calcule à l'affichage (aucune écriture).
- **Écrans** : la **liste des devis** (liste et tableau), l'**éditeur** (Édition / Prévisualisation), le **Bordereau**. Pas de glisser-déposer dans le tableau par statut.
- **Pilotage reporté** : il nécessite la facturation.
- **Hors v1** : étiquettes, styles de tableau et de totaux, ordre de l'en-tête, QR code, numérotation et titre modifiables, points de collecte, entité chantier, glisser-déposer des lignes, primes, retenue et déchets dans l'éditeur (ils existent dans le calcul, pas encore à l'écran).
- **Outils MCP** : `lister_devis`, `lire_devis`, `creer_devis_brouillon`, `modifier_devis_brouillon`, `finaliser_devis` (en deux temps, avec code).

## 1. Le besoin

Un premier client pilote (un artisan du bâtiment) veut faire ses devis dans Chevalier IA OS, **surtout en parlant à son assistant** (MCP), aussi depuis le téléphone et le bureau. Jérôme développe d'abord pour lui-même, teste, puis ouvre le module à ce client (**même code chez Jérôme et chez les clients**, règle du 18/10/2026 : Jérôme utilise vraiment le module, sinon le bêta-test est fictif).

Ce n'est **pas** le bouton « Générer devis » de `actions-de-fiche.md` (un appel n8n depuis une fiche) : c'est un **module** qui possède ses données. Ce document remplace l'idée du bouton pour le devis ; `actions-de-fiche.md` reste valable pour d'autres actions.

Le client n'aura **ni module Projets ni facturation** : le module Devis dépend du **seul** module Affaires (`dependances: ['affaires']`).

## 2. Vue d'ensemble

1. Sur une affaire, la personne crée un **devis** (brouillon) en choisissant des **articles** dans le **bordereau de prix** (ou des lignes libres), avec une **marge**, une **TVA**, des **adresses** et des **destinataires**.
2. Elle **finalise** le devis : le serveur attribue le numéro, fige les prix, verrouille cette version et envoie à **n8n** un JSON « vue client ».
3. n8n met le devis en page (**PDF**), le range dans le dossier Drive des devis, crée un **brouillon Gmail** avec le PDF en pièce jointe, et **rappelle l'appli** (lien du PDF, empreinte, identifiant du brouillon).
4. Le client humain relit le brouillon dans Gmail, modifie le texte de l'e-mail si besoin (**pas** le PDF), l'envoie, puis clique **« Marquer comme envoyé »** dans l'appli.
5. Plus tard : **Accepté** / **Refusé** / **Expiré** ; une nouvelle **version** se crée en copie.

## 3. Décisions de Jérôme (24/10/2026)

- **Décidé** : le devis est rattaché à une **affaire** (donc à une personne et/ou une organisation) ; plusieurs **versions** par affaire ; un devis finalisé est **intouchable** (on crée la version suivante). Un brouillon est possible sans destinataire ; **finaliser exige au moins un destinataire « À » avec un e-mail** (une adresse « en copie » seule ne suffit pas).
- **Décidé** : pas de PDF construit par l'appli. L'appli affiche un **texte lisible** (lignes, totaux, TVA, marge), pas un « joli aperçu ». n8n fait la mise en page et les mentions légales du PDF.
- **Décidé** : **JSON complet « vue client »** vers n8n (jamais prix d'achat, marge ni coefficient). La règle « identifiants seulement » de `actions-de-fiche.md` est revue pour le devis : un seul fichier fait l'appel sortant, vers un chemin fixe, borné par un test.
- **Décidé** : le PDF est rangé dans **Google Drive** (jamais de PDF stocké dans la plateforme), dans un dossier **`_devis`** créé une seule fois dans le même dossier parent que les dossiers de projets (réglage `dossierParentDrive`, aujourd'hui intitulé « Google Drive : dossiers de projets » : **à renommer « Google Drive »**, car un client sans Projets le verrait). **Proposition** : l'appli crée `_devis` avec le sélecteur Google déjà présent (`js/os/google-picker.js`) ; l'identifiant est un réglage du module, envoyé dans le JSON ; le lien du PDF entre dans les **Documents** de l'affaire.
- **Décidé** : **finalisation par l'humain ET par l'assistant** (c'est l'humain qui la demande). L'assistant n'envoie jamais d'e-mail : finaliser ne crée qu'un **brouillon Gmail**.
- **Décidé** : « Envoyé » = **bouton « Marquer comme envoyé »** (modèle des boutons « Écrire un email » / « Email envoyé » de la fiche personne) + bouton **« Ouvrir le brouillon »**. La détection automatique par n8n est un **bonus** reporté, qui ne ferait qu'une proposition dans « À valider ».
- **Décidé** : un devis n'est **pas** un document légal (une facture si) : un trou dans les numéros n'est pas grave. Numéro **`DEV-AAAA-MM-JJ-NNN`** (date de finalisation + **compteur global**, 3 chiffres au moins ; la date est informative : deux numéros consécutifs peuvent avoir deux dates ; compteur global **confirmé par Jérôme le 24/10/2026**). **Les versions restent visibles**, jamais supprimées.
- **Décidé** : **marge réglée par devis, affinable par section du devis (« Toiture », « Terrasse ») puis par ligne** (Proposition : une marge par catégorie d'article, « Fourniture » ou « Main-d'œuvre », viendrait plus tard, avec un champ `categorie` sur l'article) ; recalculée tant que le devis est un brouillon, **figée à la finalisation** ; arrondi au centime **ligne par ligne**. **On ne bride pas la marge** : les marges très élevées sont permises (une pièce à 3 € revendue 20 €) et les marges **négatives** aussi (Jérôme, 24/10/2026 : si l'utilisateur a intérêt à vendre à perte, il le peut). **Proposition** : une ligne vendue sous son prix d'achat affiche seulement une mention grise « vendu à perte », jamais un blocage. **Deux modes dans les réglages du module** : majoration sur le prix d'achat (× 1,20) ou marge sur le prix de vente (le calcul du comptable : prix d'achat ÷ (1 − marge)). L'écran affiche toujours le **coefficient**. Seule limite, mathématique : dans le mode « marge sur le prix de vente », une marge de **100 % ou plus** n'a pas de sens (division par zéro ou prix négatif) et est refusée ; **toute autre valeur, négative comprise, est acceptée**, et le mode « majoration » n'a aucune limite.
- **Décidé** : **kilométrage et journée de travail = des articles du bordereau** (unités « km », « jour »), la distance est saisie à la main.
- **Décidé** : le bordereau contient des **prix d'achat**. Il est une **table de la base** ; le nom affiché (« Bordereau de prix unitaires », « Grille tarifaire », « Catalogue »…) est un **réglage** du module. Le mot pour une ligne du bordereau est **« Article »**. Un article utilisé ne se supprime jamais : il se **désactive**.
- **Décidé** : chaque ligne de devis **copie** libellé, unité, prix d'achat et code de l'article au moment de l'ajout (modifier le bordereau ne touche jamais un ancien devis), en gardant le **code de l'article** d'origine. Les **lignes libres** sont permises (« Ajouter au bordereau ? » est proposé).
- **Décidé** : **adresses** : trois adresses sur un devis (commanditaire, facturation, chantier) qui peuvent toutes être différentes. Les personnes et les organisations reçoivent une **liste d'adresses enregistrées** ; une adresse tapée dans un devis peut être **enregistrée sur la fiche** (case cochée par défaut) ; le devis garde une **copie figée**. L'adresse existante d'une organisation (`adresse` + `ville`) devient la première adresse de la liste (« Principale »), sans rien perdre. **Plusieurs e-mails par organisation : fait en 2.27.0** (PR 219).
- **Décidé** : **destinataires** en multi-choix parmi les e-mails de la personne **et** de l'organisation de l'affaire, plus des adresses **en copie** saisies dès la création.
- **Décidé** : **TVA** réglée dans le module : régime « Franchise en base » (mention « TVA non applicable, article 293 B du CGI ») ou « Assujetti » (liste des taux, taux par défaut, taux par article, modifiable par ligne). Le **régime est figé sur chaque devis à la finalisation**. Case **« Autoliquidation »** visible sur tous les devis, avec une aide (« travaux en sous-traitance auprès d'un professionnel assujetti ») : ce n'est pas à nous de décider qui est un professionnel. Tout est à faire valider par le comptable du client.
- **Décidé** : **expiration** : durée par défaut 90 jours dans les réglages, **modifiable par devis** ; la date `expireLe` est calculée **à la création** et modifiable à la main. « Expiré » se calcule à l'affichage.
- **Décidé** : **avancement de l'affaire** : les noms d'étape appartiennent à l'utilisateur ; le module fait **un seul lien** dans ses réglages : « l'étape où vivent les devis » (comme le rôle « vente gagnée »), depuis la PR 286 (avant : deux liens, « à faire » et « envoyé »). **Retiré le 28/10/2026** : c'était une erreur de rattacher les devis à une seule étape, un devis vit à toutes les étapes ; le réglage et sa ligne du contrôle de déploiement n'existent plus (l'ancienne valeur reste dans la base, intacte). Après le rendez-vous, l'affaire passe à cette étape (à la main ou par automatisation) (voir la PR 286 pour ce qui se passe ensuite). Un devis **accepté** la passe à « Gagnée » (et **rouvre** une affaire perdue). On ne recule jamais automatiquement. Refusé ou expiré : l'affaire n'est **pas** passée à « Perdue » toute seule, c'est signalé dans « À faire ». Montant de l'affaire = **somme HT des devis acceptés**, sans écraser le montant saisi à la main tant qu'aucun n'est accepté (champ `montantDevisHt`, voir D17).
- **Décidé** : **supprimer une affaire** qui a un devis finalisé est permis, avec un **avertissement très clair** qui liste les devis perdus ; le journal garde les copies. **Proposition** : cette suppression passe par une **fonction du serveur** (la règle §7 interdit au navigateur de supprimer une version finalisée) ; l'écran appelle cette fonction après l'avertissement (à confirmer, §11).
- **Décidé** : **traçabilité** : chaque étape (créer, finaliser, retour n8n, envoyé, accepté, refusé, version, archive) écrit un événement dans l'historique de l'affaire et une ligne d'audit ; le **journal affiche toutes les lignes du devis dans un tableau lisible** (jamais du JSON).
- **Décidé** : **archive** : un devis accepté ou refusé peut être archivé (bouton « Archiver », écran « Archives » comme pour les projets) pour ne pas encombrer les colonnes.
- **Décidé** : **relances** (client sans réponse, brouillon non envoyé) : mécanisme général, à discuter plus tard, qui reviendra pour les factures ; il vivra plutôt dans le module **Automatisations** (n8n, « À valider »). La place du compteur « relancé n fois » est prévue sur la carte et la fiche.
- **Décidé** : le mot du module est **« Devis »** ; jamais « CRM » à l'écran ; « dossier » (pas « répertoire »).

## 4. Données

Tables en `<module>_<table>` (`docs/tables.md`) :

| Collection | Contenu | Écriture par le navigateur |
|---|---|---|
| `devis_devis` | **un document par version** : lignes incluses | seulement tant que `statut == brouillon` (avant et après) |
| `devis_articles` | le bordereau | éditeurs |
| `devis_parametres` | réglages du module (un document) | éditeurs |
| `devis_compteurs` | compteur des numéros | jamais (serveur seul) |

**Devis (une version)** : `id`, `racineId` (même valeur pour toutes les versions d'un devis), `version` (1, 2…), `numero` (null tant que la première version n'est pas finalisée ; **partagé** par les versions), `affaireId`, `personneId`, `organisationId`, `statut` (brouillon · en_attente_envoi · envoye · accepte · refuse · remplace), `archive`, `creeLe`, `expireLe`, `finaliseLe`, `envoyeLe`, `accepteLe`…, `adresses` {commanditaire, facturation, chantier} (copies : texte + `id` d'origine), `destinataires`, `copie`, `modeMarge`, `coefficient` (du devis), `regimeTva` (figé à la finalisation), `autoliquidation`, `debutTravaux`, `dureeEstimee`, `acompte`, `conditionsPaiement`, `sections` : [{ `id`, `titre`, `coefficient?`, `lignes` : [{ `id`, `codeArticle?`, `articleId?`, `libelle`, `unite`, `quantite`, `prixAchat`, `coefficient?`, `tauxTva`, `prixVente` (figé à la finalisation) }] }], `totaux` (calculés par le code), `finalisation` { `n8n` (en_cours · ok · echec), `brouillonCree`, `pdfRange`, `urlPdf`, `sha256`, `brouillonGmailId`, `threadId` }, `envoiN8nCopie` (le JSON « vue client » exactement envoyé, gardé comme preuve), `titre` (l'objet du devis), `creePar`, `proprietaire`, `raisonRefus`. `expire` n'est **pas** un statut stocké : il se calcule à l'affichage. Pas de remise dans la première version (hors périmètre, §10).

**Article du bordereau** : `id`, `code` (unique, choisi par l'utilisateur ou généré), `libelle`, `description?`, `unite` (texte libre : u, m², ml, h, jour, km, forfait), `prixAchat`, `tauxTva?` (taux par défaut de l'article), `categorie?` (réservé), `actif`, `creeLe`, `modifieLe`.

**Personne et organisation** : `adresses` : [{ `id`, `libelle`, `adresse`, `parDefaut` }]. Migration douce : l'ancien champ `adresse` / `ville` d'une organisation reste lu tant qu'il existe (comme `urlGithub`).

**Réglages du module** : nom du bordereau, mode de marge, coefficient par défaut, **marge globale du devis** (`margeDevis`, 20 % par défaut : appliquée d'office aux **nouveaux** devis seulement, les devis existants ne changent pas ; distincte de `marge`, la marge par défaut des **articles** ; décision du 27/10/2026, PR 355), régime de TVA, taux de TVA et défaut, durée de validité, préfixe du numéro, dossier Drive `_devis` (`id`, `nom`), nombre de jours avant le rappel « brouillon non envoyé », bloc « Mon entreprise » (identité du client, **jamais dans le dépôt** ; il contient les **méthodes de paiement acceptées**, `entreprise.paiement.modes`, imprimées sur le devis et modifiables par devis dans `devis.modesPaiement`, PR 361). **Nom du devis** : champ interne `nom` (80 caractères), distinct de `objet` qui est imprimé ; jamais dans la vue client ni sur le PDF (PR 365).

**Numérotation** : compteur **global**, incrémenté par le serveur dans une **transaction**, au moment de la **première finalisation** d'un devis ; les versions suivantes gardent le numéro et ajoutent `vN`. **Décidé (24/10/2026) : compteur global** (le format `DEV-2026-10-24-017` reste lisible).

## 5. Statuts et transitions

Brouillon → **Finaliser** → En attente d'envoi → **Marquer comme envoyé** → Envoyé → Accepté / Refusé ; Expiré se calcule (date dépassée sur un devis envoyé ou en attente) ; Remplacé = une version dont une version suivante a pris la place (jamais envoyée, ou une autre acceptée).

- **Aucune transition n'est libre** : pas de glisser-déposer. Chaque transition passe par une **fonction du serveur** (journal, droits, précondition de statut).
- **Finaliser** (serveur) : vérifie que le devis est un brouillon, a au moins une ligne et un destinataire avec e-mail ; attribue le numéro ; fige les prix de vente, le régime de TVA et les totaux ; écrit le statut ; garde le JSON envoyé ; appelle n8n. **Idempotence** : une seconde demande sur la même version est refusée ; n8n reçoit une clé unique (devis + version) et ne crée jamais deux brouillons.
- **Si n8n est en échec ou muet** : le devis **reste numéroté et verrouillé**, la fiche montre un bandeau rouge « Le brouillon e-mail n'a pas pu être créé. Réessayer » ; jamais de retour en brouillon.
- **Version suivante** : copie du devis dans un nouveau brouillon (mêmes adresses, destinataires). Une version « En attente d'envoi » remplacée passe à **Remplacé** à la **finalisation** de la version suivante (même transaction), jamais à sa création (supprimer le brouillon de la v2 ne doit pas laisser la v1 remplacée par rien) ; une version envoyée reste vivante jusqu'à la réponse ; l'**acceptation** d'une version passe les autres versions du même numéro à Remplacé.
- **Accepté** : l'affaire passe à Gagnée (voir §3) ; **Refusé** : signalé dans « À faire ».

## 6. n8n : le JSON et le retour

**JSON « vue client »** (produit par une fonction pure du code, testée : aucun champ `prixAchat`, `marge`, `coefficient`, `modeMarge` n'en sort) : `formatVersion`, `espace` (identifiant), `emetteur` (identité de l'entreprise : **seulement si elle vit dans les réglages du module**, voir §11 ; sinon le JSON n'en porte pas et n8n la connaît), `devisId`, `version` du devis, `numero`, dates d'émission et de validité, destinataires et copie, trois adresses, sections et lignes (libellé, quantité, unité, prix unitaire HT, total HT, taux de TVA), totaux HT / TVA par taux / TTC, régime de TVA et autoliquidation, conditions (début des travaux, durée, acompte, paiement), `dossierDriveId`, clé d'idempotence. Le contenu du JSON n'est **pas journalisé** par le serveur (seulement client, devis, version, statut HTTP, durée) ; sa copie exacte vit dans la version du devis. **Délai** : la fonction n'attend que l'**accusé de réception** du webhook (quelques secondes) ; tout le reste revient par la porte. Sans accusé dans le délai : `finalisation.n8n = echec` et bandeau « Réessayer ».

**Retour** (porte des workflows) : action `devis.retourFinalisation` { devisId, version, brouillonGmailId, threadId, urlPdf, sha256, executionId } (accepte aussi un **retour partiel ou d'échec** `{ etape: 'pdf' | 'brouillon', etat: 'ok' | 'echec', erreur }`, pour que la mini-liste de l'écran ait de quoi s'afficher) : pose « brouillon créé », ajoute le lien dans les Documents de l'affaire (`joindreLien`), garde l'**empreinte du PDF** (le PDF qui fait foi est celui dont l'appli connaît l'empreinte, pas la pièce jointe modifiable d'un brouillon refait à la main), écrit l'événement. Rejouable. **Bonus reporté** : `devis.proposerEnvoi` ne change **jamais** le statut ; il écrit une proposition dans « À valider » que l'utilisateur confirme.

**Prérequis** : la porte connaît aujourd'hui seulement la Veille et les Automatisations (`scripts/porte/porte.js`) : le module `devis` s'y ajoute (base de Jérôme d'abord) **et** à la liste `modulesActifs` de `functions/src/porte.js` (écrite en dur) ; chez un client, `devis: true` dans la fiche de l'espace. Pour le premier client, la **porte de la plateforme** n'existe pas : prérequis absolu, **déploiement manuel** (liste d'arrêt), voir `porte-cles.md` section 6 et `actions-de-fiche.md`. En attendant : mode honnête « envoyé à n8n le …, pas encore de retour ».

**Essai avant tout code d'écran** : un workflow `interne-devis-essai` reçoit un **faux devis**, crée un brouillon Gmail avec un PDF en pièce jointe (boîte d'essai déjà branchée), range le PDF dans un dossier `_devis` d'essai (**fichier privé, pas de partage par lien**), rappelle la porte. Il vérifie les points qu'on n'a pas pu vérifier : pièce jointe sur un brouillon, identifiant de fil renvoyé, droits des membres sur le dossier.

## 7. Sécurité et règles

- **Règles Firestore** (liste d'arrêt, Jérôme les publie, dans les deux bases) : `devis_devis` : lecture par les membres ; écriture par le navigateur seulement si le statut est `brouillon` avant et après (ce qui interdit aussi de **supprimer** une version finalisée depuis la page : la suppression d'une affaire qui en a passe par une fonction du serveur ; le `create` d'une version brouillon qui porte déjà un `numero` doit rester permis, à tester) ; `devis_compteurs` fermé ; les écritures sensibles passent par des fonctions appelables : `devisFinaliser`, `devisChangerStatut` (envoyé, accepté, refusé, archivé), `devisNouvelleVersion`. L'outil MCP appelle **le même code interne** (un seul code ; les totaux ne sont jamais calculés par l'assistant).
- **Premier appel sortant de l'application** : un seul fichier, un chemin fixe, secret par client dans Secret Manager, borné par un test **sur `functions/src`** (celui de `tests/automatisations-statique.test.js` ne lit que `functions-plateforme/src` : à étendre ou à doubler, jamais supprimé) ; jamais `activate` ni `credentials`.
- **Prix d'achat et marge visibles** par tous les membres de l'espace, lecteurs compris (la règle de lecture est « membres ») : **Décidé** pour les éditeurs, **à confirmer** pour les lecteurs ; jamais dans le JSON ni dans le texte « tel qu'envoyé ».
- **Restauration** (`restaurer_depuis_audit`) : ne recrée jamais un devis finalisé sous un numéro déjà pris.

## 8. Écrans

Une **entrée de menu « Devis »** ; écrans en bascule ou en onglets, **jamais de sous-onglets** (`consignes-ui.md`). Un seul bouton jaune par écran.

1. **Devis** : bascule **Kanban / Liste / Archives** (mémorisée), comme Affaires et Projets.
   - Kanban **par statut, sans glisser-déposer** : Brouillons · À envoyer · Envoyés · Acceptés · Refusés. Expirés et Remplacés se retrouvent dans les filtres. Carte : numéro (ou « Brouillon »), affaire, client, total HT, jours restants avant expiration (rouge si dépassé), version, « relancé n fois » (plus tard), pastille rouge si n8n a échoué. Au-dessus du Kanban : une ligne **« 3 affaires à l'étape « devis à faire » sans devis  + Créer le devis »** (masquée à 0).
   - Liste : Numéro, Affaire, Client, Statut, Total HT, Créé le, Expire le, Version ; tri (`tri.devis`), filtres communs (statut, affaire, période, « versions remplacées aussi »).
   - **Cas vide** : « Aucun devis. Crée le premier depuis une affaire. » **Erreur** : message et « Réessayer ».
2. **Fiche devis** : en-tête (numéro ou « Brouillon », statut, affaire en lien, **un seul bouton jaune selon l'état** : Finaliser · Marquer comme envoyé · Accepté ; « Ouvrir le brouillon » à contour ; menu « … » : Dupliquer, Nouvelle version, Marquer refusé, Archiver, Supprimer le brouillon). Résumé : client, trois adresses (« Enregistrer sur la fiche » cochée), destinataires (cases) + « en copie », coefficient, TVA, expiration, début des travaux, durée, acompte, paiement, autoliquidation (icône « i »). Centre : sections et lignes (« Section  + Ajouter », « Article  + Ajouter » ouvre une recherche dans le bordereau ou une ligne libre), sous-totaux, totaux HT / TVA par taux / TTC. **Deux vues lisibles** : « Vue interne » (avec prix d'achat et marge) et « Tel qu'envoyé » (ce que voit le client). Après finalisation : lecture seule + bandeau « Version 1 finalisée le … ; pour corriger, crée la version 2 » ; **mini-liste** « Envoyé à n8n ✓ · Brouillon créé ✓ · PDF rangé ✓ » avec « Réessayer ». Colonne de droite : Historique du devis, Documents (le PDF).
   - **Vide** : « Aucun article. Ajoute le premier. » et « Finaliser » grisé. **Erreur** : finalisation refusée (raison dite), n8n en panne (bandeau rouge), destinataire sans e-mail (« Finaliser » grisé avec la raison).
   - **Téléphone** : une colonne, lignes en cartes, total collé en bas, boutons de 44 px, ajout d'une ligne par recherche plein écran. Le téléphone sert surtout à **lire et finaliser** ; la saisie se fait volontiers par l'assistant.
3. **Fiche affaire** : un onglet **« Devis »** (pastille de compteur) à côté de G-Drive : versions, statut, total, expiration, « Devis  + Ajouter ». Le PDF apparaît aussi dans G-Drive (un fichier, deux endroits, un seul objet).
4. **Bordereau** (nom affiché réglable) : liste triable et filtrable (catégorie, actif), colonnes Code, Libellé, Unité, Prix d'achat, Catégorie, « Utilisé dans n devis » ; « Article  + Ajouter » ; « Retirer » = désactiver. **Vide** : « Aucun article. Ajoute le premier. »
5. **Réglages du module** : Mon entreprise, Numérotation, TVA, Marge, Conditions et durée de validité, Rappels, Nom du bordereau, Liens d'étapes, Dossier Drive des devis.
6. **Fiches personne et organisation** : liste « Adresses » (composant de liste comme « Email »).
7. **Badge** du registre : nombre de brouillons finalisés mais non envoyés depuis plus de n jours ; ligne « À faire » de l'affaire (activité de type Tâche créée par le code).

## 9. Assistant (MCP)

Outils prévus (noms à fixer en respectant `vocabulaire.md`) : `lister_articles`, `chercher_article`, `creer_article`, `modifier_article`, `desactiver_article`, `lister_devis`, `lire_devis` (vue interne et vue client), `creer_devis`, `modifier_devis` (marge, validité, adresses, destinataires), `ajouter_ligne_devis`, `modifier_ligne_devis`, `retirer_ligne_devis`, `ajouter_section_devis`, `creer_version_devis`, `finaliser_devis`, `marquer_devis_envoye`, `accepter_devis`, `refuser_devis`, `archiver_devis`. Règles : l'assistant ne calcule jamais un total ; une ligne hors bordereau reçoit un prix **donné par l'humain** ; **`finaliser_devis` exige que l'assistant ait d'abord relu le devis à l'humain** (paramètre de confirmation explicite) ; aucun outil n'envoie d'e-mail.

## 10. Hors première version

Relances (devis sans réponse, brouillon oublié par e-mail) ; détection automatique de l'envoi ; modèles de devis (un devis sans affaire marqué « modèle ») ; import CSV du bordereau ; signature ou acceptation en ligne par le client ; lien public ; aperçu graphique dans l'appli ; calcul de la distance par adresse ; plusieurs devises.

## 11. À trancher et questions ouvertes

**À trancher avec Jérôme avant le code concerné** (relecture de Fable, 24/10/2026) :
1. **Suppression d'une affaire qui a des devis finalisés** : par une fonction du serveur appelée par l'écran (Proposition, §3), ou refusée à l'écran et réservée à l'assistant.
2. **Où vit l'identité de l'entreprise** (nom, SIRET, assurance, coordonnées de paiement) : dans les réglages du module et portée par le JSON (`emetteur`), ou seulement dans le workflow n8n du client.
3. **Marge intermédiaire** : par section du devis seulement en première version (Proposition, §3).
4. ~~Numéro~~ : **tranché le 24/10/2026, compteur global.**

**Réponses du client attendues lundi, non bloquantes pour coder.**

Ses exemples de devis (unités, sections, mentions, mise en page) ; son régime de TVA ; ce qu'il entend par « marge » ; où vit l'identité de son entreprise (réglages ou workflow n8n) ; le nom de son bordereau ; le compte Gmail et le dossier Drive à utiliser ; compteur global ou du jour (§4). **La structure des lignes ne se fige pas avant d'avoir vu ses exemples.**

## 12. Critères d'acceptation (un test par point, nommé par son numéro, plus une capture)

Procédure de `CLAUDE.md` : chaque point = une phrase observable, **un test dont le nom commence par son numéro**, **une capture** de l'état obtenu.

- **D1** Le module Devis ne s'active que si Affaires est actif (Projets n'est pas requis).
- **D2** Un article du bordereau se crée, se modifie, se désactive ; un article utilisé ne se supprime jamais.
- **D3** Un devis se crée depuis une affaire ; il reprend la personne, l'organisation, les adresses et les e-mails ; l'expiration est calculée à la création et modifiable.
- **D4** Une ligne copie code, libellé, unité et prix d'achat de l'article ; modifier l'article ensuite ne change pas la ligne.
- **D5** La marge se règle par devis, puis par section, puis par ligne ; la plus précise l'emporte ; l'écran montre le coefficient.
- **D6** Les deux modes de marge donnent les prix attendus (100 € d'achat à 20 % : 120 € en majoration, 125 € en marge sur le prix de vente) ; une marge négative est acceptée (mention « vendu à perte », sans blocage) ; 100 % ou plus est refusé **seulement** en mode « marge sur le prix de vente » ; l'arrondi se fait au centime par ligne.
- **D7** Les totaux HT, TVA par taux et TTC sont calculés par le code ; en franchise, la mention 293 B apparaît et la TVA est nulle.
- **D8** Le régime de TVA est figé à la finalisation ; changer le réglage ensuite ne modifie pas un devis finalisé.
- **D9** Les destinataires se choisissent parmi les e-mails de la personne et de l'organisation ; des adresses « en copie » s'ajoutent ; finaliser est refusé sans destinataire avec e-mail.
- **D10** Les trois adresses d'un devis peuvent être différentes ; « Enregistrer sur la fiche » ajoute l'adresse à la fiche de la personne ou de l'organisation ; la modification de la fiche ne change pas un devis.
- **D11** Finaliser attribue un numéro `DEV-AAAA-MM-JJ-NN`, deux finalisations simultanées donnent deux numéros différents, et la version ne peut plus être modifiée (ni par l'écran ni par une écriture directe du navigateur).
- **D12** Finaliser deux fois la même version est refusé et n'envoie rien de plus à n8n.
- **D13** Le JSON envoyé à n8n ne contient aucun prix d'achat, marge, coefficient ni mode de marge.
- **D14** Si n8n échoue ou ne répond pas, le devis reste numéroté et verrouillé, un bandeau propose « Réessayer ».
- **D15** Le retour de n8n pose « brouillon créé », range le lien du PDF dans les Documents de l'affaire et garde l'empreinte (ancien circuit n8n ; le PDF fabriqué par le serveur, lui, n'est ajouté aux Documents que si l'affaire a un dossier de travail, lien non vide, décision du 26/10/2026).
- **D16** « Marquer comme envoyé » passe le devis à Envoyé, écrit une ligne dans l'historique de l'affaire et pousse l'affaire à l'étape « devis envoyé » (sans jamais reculer).
- **D17** « Accepté » passe l'affaire à Gagnée (la rouvre si elle était perdue) ; le montant de l'affaire devient la somme HT des devis acceptés, sans écraser un montant saisi à la main tant qu'aucun n'est accepté. **Réalisé le 29/10/2026 (partie « montant »)** : le serveur écrit la somme dans `montantDevisHt` de l'affaire, dans la transaction de `changerStatut` (accepter) et d'`archiver` (devis accepté archivé ou désarchivé) de `functions/src/coeur/devis.js` (même code chez Jérôme et chez les clients) ; `montant` (l'estimé) n'est jamais touché ; l'écran lit `montantAffaire(a)` = `montantDevisHt` sinon `montant`. Un devis accepté ne peut être ni refusé, ni remplacé, ni supprimé : l'ensemble des devis acceptés ne change donc qu'à l'acceptation et à l'archivage. Aucune migration des affaires existantes. Le passage à Gagnée n'est pas encore branché.
- **D18** Une nouvelle version copie le devis ; accepter l'une passe les autres versions du même numéro à « Remplacé » ; aucune version n'est supprimée.
- **D19** Le journal montre toutes les lignes d'un devis finalisé dans un tableau lisible.
- **D20** Le Kanban Devis a les colonnes par statut, sans glisser-déposer ; la ligne « affaires sans devis » disparaît à 0 ; cas vide et cas d'erreur testés.
- **D21** La liste Devis, ses tris et ses filtres communs fonctionnent ; un devis archivé quitte les colonnes et apparaît dans Archives.
- **D22** La fiche affaire a un onglet Devis avec compteur ; supprimer une affaire qui a un devis finalisé affiche l'avertissement qui les liste, puis la suppression passe par la fonction du serveur (selon la décision §11, point 1).
- **D23** L'assistant crée un brouillon, ajoute des lignes, finalise après confirmation ; un prix hors bordereau sans valeur donnée par l'humain est refusé ; aucun outil n'envoie d'e-mail.
- **D24** Un indicateur existant (« propositions envoyées ») suit le lien d'étape « devis envoyé » : il n'y a pas deux compteurs pour la même chose.
- **D25** Sur téléphone, la fiche devis tient en une colonne sans défilement horizontal ; zones de clic de 44 px.
- **D26** Un test statique refuse dans `docs/`, `js/`, `functions/` et `scripts/` tout motif de SIRET (14 chiffres), d'IBAN (`FR76…`) et de numéro de TVA intracommunautaire (`FR` + 11 chiffres) ; il ne contient **jamais** de liste de noms de clients (ce serait la fuite qu'on veut éviter).
- **D27** `npm run test:module look-compact` passe (toute PR qui touche du CSS).
- **D28** Un lecteur de l'espace ne peut ni créer ni finaliser un devis (écran et assistant).
- **D29** La case « Autoliquidation » est visible sur tout devis avec son aide « i » ; cochée, elle met la TVA à zéro et ajoute la mention.
- **D30** La copie `envoiN8nCopie` gardée est identique au JSON parti.
- **D31** Le texte « Tel qu'envoyé » ne contient ni prix d'achat ni coefficient.
- **D32** Le rappel « brouillon non envoyé depuis n jours » crée la tâche dans « À faire » et allume le badge.
- **D33** Refusé et Expiré sont signalés dans « À faire » sans passer l'affaire à Perdue.
- **D34** `restaurer_depuis_audit` ne recrée jamais un devis finalisé sous un numéro déjà pris.
- **D35** L'ancienne `adresse` / `ville` d'une organisation s'affiche comme adresse « Principale » sans migration.
- **D36** Le journal de la fonction sortante ne contient que client, devis, version, statut HTTP et durée.
- **D37** Les collections et les outils déclarés au registre sont exactement ceux du serveur (`tests/registre-mcp.test.js`).
- **D38** Une version finalisée s'ouvre en lecture seule avec le bandeau « pour corriger, crée la version suivante ».
- **D39** Un devis envoyé s'affiche « Expiré » le lendemain de `expireLe`, sans aucune écriture en base.

## 13. Ordre des dépendances (pas un découpage en PR)

1. **Essai n8n** avec un faux devis (§6) ; il vérifie aussi qu'**un autre membre de l'espace ouvre le PDF** depuis le lien (un fichier privé ne doit pas devenir un lien mort pour les collègues).
2. Données et logique pures (calcul des marges, des totaux, du numéro, des statuts), partagées entre l'écran et le serveur ; adresses des fiches.
3. Règles Firestore et fonctions du serveur (liste d'arrêt : Jérôme publie).
4. Porte du module chez Jérôme, appel sortant borné.
5. Écrans, outils de l'assistant.
6. **Plateforme clients** : règles, fonctions, porte de la base 2, workflow du client (déploiements manuels, jamais sans Jérôme).

## Écran « Vocabulaire » (29/10/2026)
Troisième écran du module Devis (`devis/vocabulaire`, bouton « Vocabulaire » dans l'en-tête de la liste) : les mots appris par l'assistant, leur revue, l'essai d'une phrase et l'export CSV. Voir `docs/proposition-dictionnaire-vocabulaire.md`, section 8.
