# À faire au début de la prochaine session

## Plan du 25/10/2026 : en-tête du devis, DocuSeal, vocabulaire

Décisions de Jérôme (discussion du 25/10/2026, rien n'est codé pour l'en-tête) :

1. **Mon entreprise** (réglages du module Devis) : logo, nom, forme juridique, adresse, SIRET, n° de TVA, téléphone, e-mail, site, couleur du tableau, assurance, médiateur. Le générateur de document sait déjà les afficher (`emetteur`), mais **l'écran de réglage n'a jamais été construit** : l'éditeur ne passe aucune donnée, donc l'aperçu n'a pas de bloc entreprise. Le logo attend ce réglage (pas d'envoi d'image avant). Si un envoi d'image demande une règle de stockage : arrêt et question à Jérôme.
2. **En-tête cohérent entre édition et aperçu** : logo et bloc entreprise en haut à gauche, cadre du destinataire en haut à droite, « Devis » avec numéro, date et validité, objet, puis tableau. À préciser avec Jérôme à partir de sa capture d'un devis qu'il aime.
3. **Champ Affaire = recherche** : on tape 3 lettres, les affaires correspondantes se proposent (plus de liste déroulante).
4. **E-mails** : cases à cocher avec toutes les adresses disponibles (organisation et contacts de l'affaire), plus champs **CC** et **CCI**. L'envoi par e-mail n'existe pas encore : ces choix sont enregistrés dans le devis, prêts pour l'envoi.
5. **DocuSeal** : à reprendre avec Jérôme en direct (installation commencée, non terminée), pendant que le codage de l'en-tête est confié à des agents.
6. **Mot « Catalogue »** : le mot a remplacé « Bordereau » dans les écrans du module Devis (PR du 25/10/2026) ; il reste des « bordereau » dans les descriptions des outils MCP, les copies générées (`functions/partage`) et la documentation. À finir dans la session **Vocabulaire configurable** (`docs/vocabulaire-configurable.md`), qui ajoute la notion « catalogue » au dictionnaire. Session faite **seule**, sans autre PR ouverte sur ces fichiers (54 fichiers touchés).

## Rapport du matin : suite du 24/10/2026, éditeur de devis (version 2.29.0)

Jérôme était réveillé et a guidé le travail. Ce qui est fusionné depuis le rapport de la première nuit (plus bas) :

| Sujet | PR | État |
|---|---|---|
| Éditeur, partie 2 (menus de ligne, Bibliothèque, ajustement, Options, impression) | 243 | fusionnée seule |
| Barre des phases qui se rafraîchit au changement de phase | 244 | fusionnée seule, non relue par Fable |
| E-mail du destinataire qui suit le client choisi | 245 | fusionnée seule, non relue par Fable |
| Bouton Catalogue sur les lignes, unité verrouillée pour les lignes du catalogue | 246 | fusionnée seule, non relue par Fable |
| Éditeur compact (feuille centrée, onglets stylo et œil) | 247 | fusionnée seule |
| Marge et remise depuis « Définir un ajustement » ; condition marquée « bientôt » | 248 | fusionnée seule, non relue par Fable |
| Bouton Envoyer, croix, e-mail facultatif | 249 | fusionnée seule, non relue par Fable |
| Menus des sections et saut de page visuel | 250 | fusionnée seule, relue par Fable |
| Case « Cacher le reste à facturer » active | 251 | fusionnée seule, non relue par Fable (4 lignes) |
| Finale : version 2.29.0, documentation, wiki, ce rapport | cette PR | fusionnée seule si la coche « Tests » est verte |
| Fonction `devisPdf` (PDF) | 235 | **en pause** (choix du moteur de PDF à faire, voir ci-dessous) |

### À faire pour Jérôme demain
1. **Vocabulaire configurable** (affaire → vente, projet → chantier) : session dédiée, plan dans `docs/vocabulaire-configurable.md`. Rien n'est encore remplacé dans l'écran.
2. **Menu Options** : « garde 4 » a été compris comme « garde seulement la case 4 » (Cacher le reste à facturer). « Cacher l'annexe photos » reste grisée. Dis-moi si tu voulais garder les quatre.
3. **Choisir le moteur de PDF** : Gotenberg (PR 235, 7 étapes de console), Chromium dans la fonction Firebase (2 étapes), ou un service tiers. Avis Fable : Chromium. Le bouton Imprimer actuel est provisoire (impression du navigateur).
4. **DocuSeal** (signature) : installation en pause, à reprendre quand tu veux.
5. **Recette à l'écran** : voir les 5 vérifications dans les PR 250 et 251. Après la fusion, **recharge la page en dur** (Cmd + Maj + R) pour voir la version 2.29.0.

### Décisions prises seul pendant cette suite
- Les sous-menus « Insérer » listent 9 choix ; « Sous-section » et « Ligne libre » restent dans les boutons du bas et le menu « … ».
- Le menu de section n'a pas Monter / Descendre (la poignée sert à déplacer).
- Un ancien « Nouvelle page avant » devient une bande à la fin de la section précédente (rien pour la première section).
- Le document sans option reste identique octet pour octet à celui d'avant (empreinte testée).

### Défauts mineurs connus, non corrigés
Montant d'ajustement arrondi par le coefficient à 4 décimales ; en-tête « Prix U. HT ajusté » alors que le champ montre le prix non ajusté ; « Cacher les éléments d'ouvrage » cache aussi une description écrite à la main ; écouteurs du menu Options laissés si on ouvre un autre menu au clavier ; focus perdu après insertion d'un saut au clavier ; message « sous Salle » en fin de section à sous-sections.

### Ce qui n'a pas pu être vérifié avec le vrai système
Pagination réelle à l'impression ou en PDF ; Safari et iPhone réels (simulés) ; `devisFinaliser` réel ; rendu du PDF enregistré.

### État de la nuit GitHub
Non consulté pendant la session. Après la fusion de cette PR, relancer « Tests de nuit » à la main (`gh run list --workflow "Tests de nuit" --limit 3`). Connus : `look-compact` en téléphone rouge sur `main` à un moment ; erreur console Firestore « Listen 400 » instable dans les parcours.

---

## Rapport de la première nuit du 24/10/2026 (module Devis, version 2.28.0) : gardé tel quel
Mis à jour le 24/10/2026 au matin (nuit « GO NUIT » du module Devis). **À mettre à jour ou à supprimer une fois les points faits.**

## Rapport du matin : nuit du 24/10/2026, module Devis (version 2.28.0)

| Sujet | PR | État |
|---|---|---|
| Ouvrages | 229 | fusionnée seule, tests verts |
| Générateur de CGV (sans écran, à relire par un juriste) | 230 | fusionnée seule, tests verts |
| Chantier et réglages de l'émetteur (sans écran) | 231 | fusionnée seule, tests verts |
| Type Texte, familles d'articles, référence et marque dans le Bordereau | 232 | fusionnée seule, tests verts |
| Liste des devis (liste et tableau) | 233 | fusionnée seule, tests verts |
| Éditeur de devis (première version) | 234 | fusionnée seule, tests verts |
| Fonction `devisPdf` (PDF par Gotenberg, rangement Drive) | 235 | **à fusionner par Jérôme** (étiquette `a-fusionner-par-jerome`) : étapes de console ci-dessous |
| Finale : outils MCP du module Devis, documentation, version 2.28.0, wiki | cette PR | fusionnée seule si la coche « Tests » est verte |

### Les 6 étapes de console pour le PDF (dans l'ordre, PR 235)
La fonction répond « PDF non configuré » tant qu'elles ne sont pas faites.
1. **Cloud Run**, région `europe-west9` : déployer l'image `gotenberg/gotenberg:8` en service **privé** (« Require authentication »), avec les options `--chromium-deny-list` (plages privées, `.internal`, adresses de métadonnées) et `--chromium-disable-javascript=true`.
2. Sur ce service, donner le rôle « Demandeur Cloud Run » au compte de service de la porte (`porte-serveur@…`, nom complet dans la description de la PR 235).
3. Console Google Cloud, « API et services » : activer **Google Drive API**.
4. **Google Drive** : créer le dossier racine des devis, le partager en « Éditeur » avec ce compte de service ; noter son identifiant (fin de l'adresse du dossier).
5. Renseigner les deux paramètres de la fonction : `GOTENBERG_URL` (adresse du service, sans barre finale) et `DRIVE_RACINE_DEVIS_ID`, au déploiement ou dans `functions/.env.chevalier-ia-os` (non commité).
6. Déployer les fonctions du projet `chevalier-ia-os` (pas la plateforme clients).

Recette ensuite : finaliser un devis, appeler la fonction, trouver le PDF dans `Devis/` du dossier de l'affaire (sans prix d'achat ni marge) ; un second appel immédiat est refusé ; un brouillon est refusé.

## À faire pour Jérôme
- **Clics console du PDF** : les 6 étapes ci-dessus.
- **Faire relire les CGV par un juriste** : les points à trancher sont listés en tête de `js/modules/devis/cgv.js` ; tant que ce n'est pas fait, `CGV_RELUES_PAR_JURISTE` reste faux et l'écran avertit.
- **Expert-comptable** : faire valider l'attestation de TVA, l'autoliquidation et les mentions obligatoires.
- **Questions pour le client pilote** : prime et retenue de garantie en détail ; la marge réelle qu'il veut ; ses ouvrages.
- **Rendez-vous de lundi** : son adresse Gmail ; l'export de son catalogue et de ses anciens devis ; ce que son logiciel actuel sait exporter.
- **Nettoyer les restes d'essai** : le workflow n8n `interne-devis-essai` (id 45QyeDyOgPtwoXtt), le dossier Drive `_devis-essai`, le brouillon Gmail dans la boîte d'essai.
- **Durcir les règles Firestore** : ajouter `pdf` aux clés protégées d'un brouillon (PR de règles à part, dans la liste d'arrêt : Jérôme la fusionne).

## Suites prévues
- Éditeur : primes énergie, retenue, déchets, glisser-déposer des lignes, ajustement de marge à trois champs.
- Écran des réglages de l'entreprise avec champs rouges et bandeau « mentions manquantes ».
- Page de consultation en ligne (voir `docs/roadmap-evolutions-devis.md`).
- Liens affaire et devis : carte verrouillée pendant un brouillon, indicateurs, historique de l'affaire, déclencheurs d'automatisations.
- Import du catalogue et des anciens devis (à préparer avec `docs/deploiement-client.md`).
- Fonction `devisPdf` pour la plateforme clients.

## Ce qui n'a pas pu être vérifié
- Les fonctions du serveur réelles (`devisFinaliser`, `devisNouvelleVersion`, `devisPdf`) et les outils MCP sur une vraie base.
- Gotenberg et Google Drive réels.
- Les règles Firestore de `devis_parametres/familles` sur la vraie base.
- Le palier complet de tests : à lancer sur GitHub (suite de nuit).
- Des captures d'autres dossiers sont peut-être à régénérer.
- La relecture Fable des briefs n'a pas été faite, pour économiser le budget.

## Décisions prises seul cette nuit
- Pas de glisser-déposer dans le tableau par statut des devis : un statut change par un bouton.
- Les actions pas encore prêtes sont grisées avec « bientôt disponible », pas cachées.
- Pilotage et stocks reportés.
- Pas de sous-familles : une seule famille par article.
- Un brouillon n'a pas de PDF.
- Les anciens devis importés ne se dupliquent pas.
- `finaliser_devis` n'est pas donné au bibliothécaire.

## État de la nuit GitHub
Non consulté (commande : `gh run list --workflow "Tests de nuit" --limit 3`).

## Points précédents (avant la nuit du 24/10/2026, gardés tels quels)

## Point du 23/10/2026 soir : **remplace le point de l'après-midi sur les PR en attente**

- Fusionnées depuis : PR 210 (menu « Trier par » : « Date de création ») et PR 211 (Réglages compacts : Indicateurs −41 %, Phases des projets −38 %, Étapes des affaires ; l'explication des indicateurs est derrière l'icône « i », celle des phases sur une ligne qui grandit).
- Suite de nuit sur `main` : rouge le 23/10 à 17:50 (run 12, 1 échec `tri-uniforme` n° 5 sur ordinateur, 1 instable `source-ville` L3, tous deux des défauts de test). Corrigés par la PR 214 (n° 5 : attendre le menu de l'écran visé avant de choisir le tri) et la PR 215 (L3 : rouvrir le menu des filtres enregistrés tant que l'entrée n'est pas arrivée), fusionnées le 23/10 ; causes **supposées, non reproduites** (aucun test local possible : le Chromium du conteneur de session ne correspond pas à Playwright). **Suite de nuit verte le 24/10** (run 13, programmée, commit de la PR 215, 6 séries vertes) ; le journal du lanceur n'indique pas les tests instables (détail dans l'archive `tests-nuit` du run, conservée 14 jours). Un seul vert ne prouve pas la correction de L3 : surveiller les prochaines nuits. Alertes n°199 et n°206 fermées (avant ce point) ; non revérifiées le 24/10.
- **Abandonné par Jérôme** : afficher le chemin complet du dossier Drive parent dans les Réglages (le droit `drive.file` ne le permet pas sans élargir les droits de l'appli).
- **Décisions de Jérôme pour `docs/deploiement-client.md`** : le MCP est configuré pour **tous** les clients (pour qu'ils utilisent leurs données) ; le dossier Drive racine est créé **à la main** avec le client, rien à coder ; les étapes 4, 6 et 7 se font **à deux en visio**. Reste ouvert : l'accord écrit sur les données stockées.
- À vérifier par Jérôme : contrôle 4 de la PR 204 dans la console Firebase (`os_kpi_saisies` change, pas `os_objectifs_saisies`) ; refuser la proposition d'essai dans sa base ; regarder les Réglages Indicateurs et Phases à l'écran (5 vérifications dans la PR 211).
- Non vérifié avec le vrai système : vrai téléphone, thème clair, lecteur d'écran (PR 211).
- Consommation de tokens élevée sur la session du 22-23/10 : repartir d'une **session neuve**, un seul sous-agent par lot, relecture Fable du code seulement pour les changements d'interface.

## Point du 23/10/2026 après-midi (version 2.26.0) : **remplace les points 1 et 2 du rapport ci-dessous**

| Sujet | PR | État |
|---|---|---|
| Interrupteur `os_kpi` allumé (repli seulement si ancienne table non vide ; modification refusée en repli) | 204 | fusionnée avec l'accord de Jérôme ; sa copie (7 objectifs, 1 saisie) était faite et vérifiée |
| Téléphone : Échap ferme le tiroir du menu, zone de clic du crayon du montant | 205 | fusionnée |
| Tri uniforme (menu « Trier par » + flèche) sur Affaires, Projets, Personnes, Organisations | 207 | fusionnée |
| Tests téléphone de la nuit corrigés (S7, « À faire » ×2, C30, I18) : défauts de test | 208 | fusionnée |
| Documentation 2.26.0 : fonctionnement du travail, bouton de workflow, déploiement client, décision webhook | cette PR | à fusionner |

- **Décision de Jérôme** : le bouton « Générer devis » passera par un **webhook n8n, un workflow par client** (`docs/actions-de-fiche.md`). L'API d'administration de n8n est écartée.
- **Déjà fait par Jérôme** : la copie des objectifs sur son Mac. **À regarder à l'écran après la PR 204** (5 vérifications) : l'Accueil affiche ses 7 objectifs ; une modification s'enregistre ; elle survit au rechargement ; la console Firebase montre le changement dans `os_kpi*` et pas dans `os_objectifs*` ; chez un client rien ne change. Les anciennes tables `os_objectifs*` restent intactes ; elles ne se suppriment que sur ordre de Jérôme.
- **Suite de nuit sur `main`** : rouge le 23/10 à 05:00 (5 échecs téléphone), à 13:00 (4 échecs + 1 instable, tous des défauts de test, corrigés par la PR 208). **À relancer sur `main` après la fusion de cette PR** pour confirmer le vert (alertes GitHub n°199 et n°206 à fermer si vert).
- **À trancher avec Jérôme** : `docs/deploiement-client.md` (points « ? » : MCP du client, dossier Drive racine, qui est présent aux étapes 4, 6 et 7, accord écrit sur les données).
- **Chemin réel du dépôt sur le Mac de Jérôme** : `/Users/jeromechevalier/Code-Chevalier-IA/chevalier-ia-os` (l'ancien chemin Google Drive n'est plus à utiliser ; corrigé dans `docs/activer-desactiver-modules.md`).
- **Non vérifié avec le vrai système** : le rendu sur un vrai téléphone ; le comportement de l'Accueil sur la vraie base après la PR 204 ; l'instabilité réelle d'I18 (non reproduit).
- **Encore à faire** (rien n'est codé) : refuser à l'écran la proposition d'essai restée dans sa base ; relevé hebdomadaire des indicateurs et réglages d'Ingrid ; renommage des fonctions et du module `tableaudebord` (de jour, avec alias) ; légende de la pastille d'activité ; chaîne d'étapes visible dans l'Historique ; simplifier le doublon « à traiter » de Maintenance.

## Rapport du matin : 5e et 6e nuit « GO NUIT » (22 au 23/10/2026, version 2.25.0)

Jérôme a donné « GO NUIT » le 22/10/2026 après une longue conception avec Fable. Un sujet par PR, chaque PR relue par Fable avant la fusion, fusionnée seule quand la coche « Tests » est verte, sauf la PR des règles Firestore (liste d'arrêt), que Jérôme a publiée et fusionnée lui-même après avoir collé le texte dans la console. Plans : `docs/chemin-client-pilote.md` (file « À valider »), `docs/tables.md` (indicateurs), `docs/actions-de-fiche.md` (bouton « Générer devis », idée).

| Sujet | PR | État |
|---|---|---|
| File « À valider » : plan, états, porte, fonction + 5 outils MCP, écran, Logger, chaîne d'étapes | 187 à 193 | fusionnées (version 2.24.0) |
| Documentation 2.24.0 et wiki | 194 | fusionnée |
| Règles Firestore (`automatisations_propositions` lisible, jamais écrite par un navigateur) | 195 | fusionnée par Jérôme après publication à la main |
| Libellés : « Tableau de bord » devient « Maintenance », « Objectifs du mois » devient « Indicateurs » | 196 | fusionnée |
| Menu de gauche : une entrée par module (Veille, Automatisations, Maintenance), onglets dans la page | 197 | fusionnée |
| Pastille rouge « à valider » sur Automatisations (en direct), arrivée sur « À valider » | 198 | fusionnée |
| Maintenance en un seul écran (plus d'onglets ni de sous-onglets, bouton Filtres, historique replié) ; corrige aussi un test de style que 198 avait fait rougir | 200 | fusionnée |
| Fiches et Accueil : « Points clés » devient « À faire », section « Notes épinglées » | 201 | fusionnée |
| Renommage `os_objectifs` vers `os_kpi` : code de double lecture (interrupteur éteint) + script de copie `scripts/migrer-kpi.js` (rien lancé) | 202 | fusionnée (code éteint, rien migré, rien copié) |
| (numéro 199 : pris par une autre session, sans lien avec cette nuit ; non vérifié) | 199 | – |
| Documentation 2.25.0 et wiki | 203 | cette PR |

**Déjà en ligne chez Jérôme** (chaque fusion déploie les fonctions et le site de son CRM) : tout ce qui précède, sauf le renommage des tables (code éteint). **Pas chez Ingrid** (plateforme clients non déployée).

**À regarder à l'écran (recette de Jérôme, 5 vérifications)** : (1) le menu de gauche a 8 entrées (Accueil, Personnes, Organisations, Affaires, Projets, Veille, Automatisations, Maintenance) ; Veille, Automatisations et Maintenance ouvrent des pages à onglets ou à blocs ; (2) la pastille rouge « n » sur Automatisations (une proposition d'essai fictive attend, prénom Alex) : la valider ou la refuser la fait baisser seule ; (3) Maintenance : un seul écran, bouton « Filtres », « Historique des saisies » replié ; `#/tableaudebord/technique` ouvre le même écran ; (4) sur une fiche affaire ou projet : « Notes épinglées » (carte jaune) au-dessus de « À faire » ; (5) l'Accueil : le bloc « Indicateurs » et le bloc « À faire ». **Cas vide** : « Rien à valider pour l'instant. », « Aucune activité à faire. », pas de section « Notes épinglées » sans note épinglée. **Cas d'erreur** : lecture refusée = pas de pastille et aucun message ; lecture de Maintenance impossible = message avec « Réessayer ».

**À faire par Jérôme, dans l'ordre** :
1. **Copier ses données d'objectifs** (accord écrit du 22/10/2026) : depuis son Mac, dans le dossier du dépôt (une seule fois : `npm ci --prefix scripts/plateforme`, puis `gcloud auth application-default login`), `node scripts/migrer-kpi.js` (simulation : compte seulement), puis `node scripts/migrer-kpi.js --ecrire` (voir l'en-tête du script et la description de sa PR pour la commande exacte). Le script ne supprime rien. Puis demander la PR qui allume `TABLE_KPI_ACTIVE` (**seulement après la copie** : en repli, modifier un objectif échoue tant que son document n'est pas dans `os_kpi`). **Deux corrections à faire dans cette PR d'allumage (relecture de Fable)** : (a) le repli ne doit se faire que si l'ancienne table n'est **pas** vide, sinon rester sur la nouvelle et initialiser les objectifs de départ (espace neuf, par exemple un client) ; (b) tester le branchement avec l'interrupteur allumé dans un parcours navigateur.
2. **Trancher** : webhook n8n ou API d'administration pour le futur bouton « Générer devis » (désaccord Claude / Fable, voir `docs/actions-de-fiche.md`) ; vérifier d'abord que l'API de son n8n sait lancer un workflow.
3. **Refuser à l'écran la proposition d'essai** restée dans sa base (elle passe dans « Traitements récents ») ou la supprimer dans la console Firestore ; aucune porte ni outil MCP ne supprime.
4. Pour la plateforme clients (rien n'y a été déployé) : le choix `regles` du workflow manuel peut être lancé seul pour fermer la collection d'avance.
5. Le credential Gmail de sa propre boîte n'est **pas** nécessaire : les essais utilisent la boîte d'essai, déjà branchée dans n8n.

**Décisions prises seul pendant les nuits** : (1) les jetons `cia_` (Claude Code, Hermes) ne peuvent **ni valider ni refuser** par MCP (la validation est la barrière humaine ; seules les connexions Google peuvent décider ; à rouvrir si Jérôme veut ; l'alternative « accepter `jeton:<acteur>` comme décideur pour son seul CRM » a été proposée et écartée) ; (2) « Classer sans suite » ne dit rien à n8n ; (3) le type d'une proposition est un libellé libre ; (4) l'application réelle d'une proposition est l'affaire du workflow B ; (5) modèle d'IA des workflows : `anthropic/claude-sonnet-4.6` ; (6) les décisions MCP ne passent pas par le journal d'audit des outils ; (7) le badge est un descripteur au registre (données pures) et l'abonnement une fonction de l'API du module ; (8) dans Maintenance, un indicateur « à traiter » apparaît deux fois (en haut et dans sa famille) : Jérôme peut demander de simplifier ; (9) « Prospection » refusé (garder « Affaires »).

**Leçons de la nuit** : la coche d'une PR ne lance pas le test `look-compact` (taille et poids de texte en dur) : la PR du badge (198) l'a fait rougir sans que personne le voie jusqu'à la PR 200 ; **toute PR qui touche du CSS lance `npm run test:module look-compact`**. Le « hook » qui dit « commit non poussé » est un faux positif quand la branche de session vient d'être recréée depuis `main` : pousser la branche (identique à `main`) le calme. Fable a une limite d'usage : elle s'est déclenchée une nuit entière, la relecture a repris à la levée.

**Ce qui n'a pas pu être vérifié avec le vrai système** : tout ce qui est visuel et tactile sur un vrai téléphone (le menu, la pastille, les onglets, Maintenance) ; l'écoute en direct de la pastille sur la vraie base ; la lecture d'une **vraie** boîte par le déclencheur Gmail ; **Jev** (OpenRouter est bloqué depuis la session de travail) ; la plateforme clients.

**Questions et idées en attente (rien n'est codé)** :
- **Voir la chaîne d'étapes dans l'Historique** : aujourd'hui elle n'est que sur « À valider ». Deux pistes : relier l'exécution à la proposition (lien ou mini-chaîne sur la ligne), ou mettre la chaîne dans l'onglet Automatisations lui-même. Elle ne s'allume que pour les workflows qui annoncent leurs étapes (seul « proposer » le fait).
- **Légende de la pastille d'activité** des cartes d'affaires (verte : activité prévue, rouge : en retard, grise : aucune) : le sens ne s'affiche qu'au survol ; une légende ou un texte est possible.
- **Indicateurs** (`docs/tables.md`) : relevé hebdomadaire (dimanche soir) écrit par une fonction planifiée du serveur ; réglage « quels indicateurs afficher + cibles mensuelles » pour Ingrid (écran de Réglages « Indicateurs » à monter chez les clients, `objectifs: true`) ; module d'analyse « Tableau de bord » quand il y a 8 à 10 semaines d'historique. Le renommage des fonctions et du module `tableaudebord` se fait de jour, avec alias.
- **Bouton « Générer devis »** : `docs/actions-de-fiche.md`.
- **Plus tard** : l'animation fine de la chaîne ; la vraie action du workflow B ; les canaux e-mail et SMS (chantier de sécurité à relire) ; la porte de la base 2 ; en base 2, `crm_audit` et `mcp_codes` sont écrivables par un éditeur depuis le navigateur (à fermer) ; la plateforme clients (déploiement manuel). **Rien sur la plateforme clients ne se fait tant que tout n'a pas été testé sur la plateforme de Jérôme.**

## Rapport : suppression de la fonctionnalité « En pause » (version 2.23.0)

Décision de Jérôme (22/10/2026) : plus de pause, ni pour les affaires ni pour les projets. Une affaire est ouverte, gagnée ou perdue ; un projet est actif ou terminé ; pour relancer plus tard, on planifie une activité (comme dans Pipedrive). Retiré : bouton et menu « En pause », boîte « Date de réveil », filtre « Statut : En pause », bloc « Reprendre contact » de l'Accueil, outils MCP `mettre_en_pause`, `mettre_projet_en_pause`, `reprendre_projet` (sans alias ; 40 outils pour le profil bibliothécaire). Les 4 affaires de Jérôme qui étaient en pause ont été rouvertes avec `rouvrir_affaire` (accord écrit de Jérôme) ; Ingrid n'en a aucune. Tolérance : un document ancien au statut `en_pause` s'affiche comme ouvert (affaire) ou actif (projet), un filtre enregistré avec « En pause » se lit comme « Ouverte » / « Actif », et les anciens événements « Affaire en pause jusqu'au … » restent dans l'Historique (filtre « Affaires »). Règles Firestore non touchées.

**À regarder à l'écran** : (1) fiche d'une affaire : menu « … » = Archiver / Supprimer, plus de « En pause » ; (2) Affaires, Liste, Filtres : Statut = Ouverte, Gagnée, Perdue ; (3) Accueil : plus de « Reprendre contact » ; (4) Projets : fiche (« Terminer » seul), menu d'une carte, Filtres (Actif, Terminé) ; (5) Historique d'une affaire qui a eu une pause : l'ancienne phrase s'affiche toujours. **Pas pu vérifier** : plateforme clients réelle, téléphone, Journal des modifications sur un vieil événement. **Annotations d'audit à faire** : `docs/audit-fonctionnel/` (constats A-04, C-20, E-14 : « pause supprimée le 22/10/2026 »), `docs/roadmap.md`.

## Rapport du matin : 4e nuit « GO NUIT » (version 2.22.0)

Un seul sujet : le bouton d'enregistrement ne devient jaune qu'après la première lettre tapée (livrable, activité, note, « Planifier », livrable type) ; une activité saisie à la main ne s'enregistre plus sans titre. Une PR, relue par Fable (aucun défaut), fusionnée quand la coche « Tests » est verte. Rien sur la liste d'arrêt.

**À regarder à l'écran** : (1) activité d'une affaire ou d'un projet : bouton gris dès qu'on clique dans le champ, jaune à la 1re lettre ; (2) Entrée sur un titre vide : message « Écris au moins un mot pour l'activité. », rien n'est créé ; (3) onglet Notes : « Ajouter la note » gris tant que la note est vide ; (4) fiche projet, formulaires livrable et activité ouverts : seul « Terminer » est jaune ; (5) Accueil, « Planifier » : effacer le titre prérempli grise le bouton.

**À discuter** : « Ajouter un membre » (Mon espace) pas modifié (test clavier) ; la pastille de type d'activité choisie reste jaune pleine ; double clic rapide sur « Planifier » pouvant créer deux activités (déjà le cas avant, hors de cette PR). Les 4 phrases de Sources restent dans Réglages : Jérôme choisit de les ignorer.

## Rapport du matin : 3e nuit « GO NUIT » (version 2.21.0)

Décisions N1 à N7 de Jérôme, un sujet par PR, relues par Fable, fusionnées seules quand la coche « Tests » est verte. Rien sur la liste d'arrêt (pas de règles, pas de migration, plateforme clients non déployée).

| Sujet | PR | État |
|---|---|---|
| N3 : filtre « Événements » de l'Historique sans recoupement | 179 | fusionnée |
| N6, N7 : colonnes Perdues / En pause retirées, surtitres retirés | 180 | fusionnée |
| N1, N2 : « Livrable Lancement », bouton jaune « Enregistrer le livrable » | 181 | fusionnée |
| N5 : étiquettes à cocher, « + Nouvelle étiquette », couleur automatique | 182 | fusionnée |
| N4 : Propriétaire comme Source (valeur + crayon, clic = liste) | 183 | fusionnée |
| Docs, version 2.21.0 | cette PR | – |

**À regarder à l'écran** : (1) projet : « Livrable Lancement » sans majuscules et bouton jaune « Enregistrer le livrable » ; (2) Historique : « Événements » ne contient ni documents ni affaires ; (3) Affaires : plus de colonnes Perdues ni En pause, plus de surtitre « Commercial » (ni « Contacts », « Livraison ») ; (4) fiche personne ou organisation : Étiquettes en cases à cocher, « + Nouvelle étiquette » ; (5) affaire : Propriétaire avec un crayon, un clic ouvre la liste (Étape, Phase, Priorité inchangées).

**Cas vide / erreur** : étiquettes, aucune existante → seul « + Nouvelle étiquette » ; nom vide ou en double → message sous le champ. Livrable : « Le titre est obligatoire. ». Propriétaire : jamais vide ; en cas d'échec d'écriture, l'ancienne valeur reste.

**Pas pu vérifier avec le vrai système** : vraie base, téléphone réel, plateforme clients (Ingrid), outils MCP renommés (visibles après redéploiement et reconnexion).

**Reste à faire** : voir la liste de la nuit précédente ci-dessous (phrases de Sources dans Réglages, I16 boutons, place de `boutonFiltres`, anciens défauts de tests). Le crayon de Propriétaire reste visible sur écran tactile (seulement lui). Le focus clavier n'est pas rendu après un choix dans la liste (comportement existant de Source).

## Rapport du matin : nuit « GO NUIT » du 22 au 23/10/2026 (version 2.20.0)

Jérôme a validé ses décisions le 22/10/2026 puis écrit « GO NUIT ». Claude a codé en autonomie, un sujet par PR, relue par Fable, fusionnée seule quand la coche « Tests » est verte.

| Sujet | PR | État |
|---|---|---|
| J8, J4 : « Appel » par défaut ; pastille « Tâche » sur le projet | 169 | fusionnée |
| J7 : Source en liste fixe, Ville regroupée | 170 | fusionnée |
| J4b : tâches de projet → livrables, outils MCP renommés | 171 | fusionnée |
| J2, J9 : montant aligné, bouton « Gagnée » retiré | 172 | fusionnée |
| M1 à M3 : textes « 90 jours » retirés | 173 | fusionnée |
| J1, J5 : un seul composant de filtres ; historique à plusieurs cases | 174 | fusionnée |
| J5 : filtres de la Veille | 175 | fusionnée |
| J5 : filtres du Journal | 176 | fusionnée |
| J5 : filtres des Automatisations | 177 | fusionnée selon la coche (voir la PR) |
| Docs, version 2.20.0, vocabulaire | cette PR | – |

**À regarder à l'écran (recette de Jérôme)** : les « 5 vérifications » de chaque PR sont dans leur description (169 à 177). Les plus importantes : (1) une affaire : plus de bouton « Gagnée », le « 999 € » est à la hauteur des boutons « Perdue / En pause » ; (2) un projet : « Livrables 0/1 », « Clique ici pour ajouter un livrable… » et la pastille « Tâche » dans l'activité ; (3) l'Historique d'une fiche : « Filtres », coche deux types, la pastille indique 2, le filtre reste quand on ouvre une autre fiche ; (4) Personnes : la Source ne propose que la liste des Réglages, la Ville n'a plus de doublon ; (5) Journal, Veille, Automatisations : le même bouton « Filtres » partout.

**Données de Jérôme modifiées pendant la nuit (accord explicite de Jérôme)** : les phrases de source qui n'étaient pas dans la liste (4 affaires, 2 personnes) ont été remplacées par une valeur de la liste, et la phrase d'origine a été gardée dans une note de la fiche (le journal des modifications garde les copies « avant »). **À faire par Jérôme** : une phrase de source n'a pas pu être retrouvée sur une fiche avec les outils disponibles ; dans Personnes, filtre « Source » pour la repérer, la remplacer, puis **retirer les phrases de la liste dans Réglages, Sources** (le code ne recopie plus rien dans cette liste). Rien n'a été modifié chez Ingrid (plateforme clients non déployée : ses changements arrivent au prochain déploiement manuel).

**Ce qui n'a pas pu être vérifié avec le vrai système** : tout a été testé sur émulateurs et avec le navigateur de test ; pas de vraie base de Jérôme ni de vrai téléphone, pas de vrais clients MCP (les outils renommés `ajouter_livrable_projet` et `terminer_livrable_projet` ne sont visibles dans l'assistant qu'après redéploiement du serveur MCP et reconnexion), pas de plateforme clients. Le test J4 des Automatisations et « assistant non administrateur » échouent en local pour des causes déjà connues (fuseau du bac à sable, erreur 409 de l'émulateur) ; ils passent sur GitHub.

**Ce que la nuit a révélé** : (1) une première coche rouge de la PR 169 venait de l'émulateur Firestore (téléchargement de son fichier au démarrage) : relancée une fois, verte ; (2) l'analyse a changé d'avis en cours de route : l'idée « gagnée = simple statut » (I19) a été abandonnée parce que la dernière colonne sert au suivi après la vente ; (3) un oubli de `completerSources` aurait annulé la migration des sources : supprimé dans la PR 170.

**Reste à faire, dans l'ordre proposé** :
1. **Jérôme** : retirer les phrases de la liste Réglages > Sources (voir plus haut) ; confirmer ou non la suppression des colonnes « Perdues » / « En pause » du kanban (« trop de colonnes »).
2. **I16 : aligner les boutons restants** (liste dans `docs/consignes-ui.md`, section « Boutons »), à discuter avec Jérôme : pastilles Appel / Rendez-vous / Email / Tâche (un 4e style ?), « Créer le projet », le style discret ; zone de clic des « + Ajouter » sur téléphone (44 px).
3. Anciens défauts de tests : P1 et C12 (fenêtre 22 h–minuit UTC) ; C30 téléphone de `projets.spec.js` ; `ports-et-isolation.test.js` ; le test « assistant non administrateur » (erreur 409 à filtrer comme dans `filtres-commun.spec.js`).
4. Roadmap : `boutonFiltres` / `fenetreFiltres` vivent dans `js/modules/crm/filtres.js` mais servent à tout (leur place logique serait `js/os/ui.js`).
5. Audit de sécurité Fable (cette semaine ou la suivante, décision de Jérôme), audit des différences Jérôme / clients, configuration des types d'activité par l'utilisateur, retours d'Ingrid.

## Rapport du matin : nuit « GO NUIT » du 21 au 22/10/2026 (version 2.19.0)

Jérôme a donné « GO NUIT » le 21/10/2026 au soir ; Claude a codé les idées de `docs/idees-affaires-projets.md` (revue faite avec Jérôme) en autonomie, un sujet par PR, relue par Fable avant chaque fusion, fusionnée seule quand la coche « Tests » est verte (protocole dans `CLAUDE.md`). **Rien n'a eu besoin de la liste d'arrêt** : aucune règle Firestore, aucune migration, aucun déploiement de la plateforme clients (le CRM d'Ingrid n'a pas bougé : il ne se met à jour que par le workflow manuel).

| Sujet | PR | État |
|---|---|---|
| I2, I13, I18 : liens personne/organisation en direct, alignement, Accueil sans « + Personne » | 160 | fusionnée |
| I4, I6, I14 : bouton Modifier, liens cliquables, notes longues | 161 | fusionnée |
| I17, I12, I11 : montant fantôme, Factures et Tâches en une ligne | 162 | fusionnée |
| I7 : Propriétaire dans le Résumé | 163 | fusionnée |
| I5 (et I8) : note de départ à la place du champ description (MCP compris) | 164 | fusionnée |
| I10 : onglet Documents version 2 | 165 | fusionnée |
| I9, I15 (début) : bouton « Filtres » de l'Historique ; bouton commun | 166 | fusionnée |
| Docs, version 2.19.0, tests remis dans la liste, workflow | cette PR | – |

**À regarder à l'écran (recette de Jérôme)** : les « 5 vérifications » de chaque PR sont dans leur description (160 à 166). Les plus importantes : (1) créer une affaire : une carte « Cette affaire concerne… » grise apparaît dans les Points clés ; (2) une adresse `www.exemple.fr` dans une note est cliquable ; (3) Documents : « Dossier de travail … + Ajouter » et « Documents + Ajouter », date d'ajout ; (4) Propriétaire dans le Résumé ; (5) bouton « Filtres » de l'Historique.

**Ce qui n'a pas pu être vérifié avec le vrai système** : tout a été testé sur émulateurs et avec le navigateur de test ; pas de vraies données, pas de vrai téléphone, pas de vrai Google (Picker/Drive simulé), pas de vrais clients MCP (ChatGPT, Hermes) ; Safari et Firefox non testés (`-webkit-line-clamp` des notes longues).

**Ce que la nuit a révélé et corrigé ou noté** :
- **Régression de la PR 160** (retrait de « + Personne » sur l'Accueil) : les tests K2 (`identite-crm`) et I3 (`identite-client`) lisaient la couleur de ce bouton ; l'étage léger de la PR ne les lance pas ; corrigé dans la PR 161 (ils lisent le bouton principal de la page Personnes).
- **Coche de PR trop longue** : tout fichier sous `tests/` déclenchait la suite complète (11 à 17 minutes) ; corrigé le 21/10 (PR 158), puis `tests/package.json` aussi (cette PR) ; mesures de la nuit : 3 à 6 minutes par PR de code.
- **Fenêtre horaire 22 h–minuit UTC** : P1 (`corrections-dossiers-2`) et C12 (`parcours`) échouent sur `main` aussi, dans cette fenêtre (voir `docs/tests.md`, « Pièges connus »). À corriger dans le test, pas dans l'appli.
- **Réglages de l'environnement cloud** (faits par Jérôme le 21/10) : auto-merge, domaines du navigateur de test, Setup script : Chromium et les dépendances étaient présents dans la session de nuit.
- **Budget Fable** : relue chaque PR en entier ; budget hebdomadaire suivi (vendredi 07h00 = réinitialisation). L'audit de sécurité Fable est **décalé à la semaine prochaine** (décision de Jérôme).

**Reste à faire, dans l'ordre proposé** :
1. **Décisions de Jérôme** (liste dans `docs/idees-affaires-projets.md`, « État au matin ») : bouton « Filtres » à 44 px sur téléphone ; fenêtre « Filtres » qui propose les 6 valeurs ; date d'ajout des documents joints par l'assistant ; I15 suite (Journal, Veille, Automatisations, Tableau de bord au bouton « Filtres »).
2. **I16 : aligner les boutons restants** (liste dans `docs/consignes-ui.md`, section « Boutons »), dont la zone de clic des « + Ajouter » sur téléphone (30 px au lieu de 44).
3. Les anciens défauts de tests : P1 et C12 (fenêtre horaire) ; C30 téléphone de `projets.spec.js` (cherche `[data-section="projet-details"]`, une section qui n'existe plus) ; `ports-et-isolation.test.js` (impose le décalage 7).
4. `js/modules/crm/journal.js` ~l.172 écrit encore « gardée 90 jours » : contraire à la décision du 04/10/2026 (point 1 plus bas : « Appliquer la décision pas de RGPD »).
5. **I11 suite, I12 suite** : rien ; **I1, I3** abandonnées.
6. Audit de sécurité Fable (semaine prochaine), audit des différences Jérôme / clients, second passage du look compact, aide client publique, chantier ChatGPT sur le MCP, allègement des fiches.
7. Retours d'Ingrid (premier client réel depuis le 21/10/2026).

## État au 21/10/2026

- **Premier client réel en service (21/10/2026)** : Ingrid utilise désormais le CRM. Appel téléphonique fait par Jérôme ce jour ; les 8 tâches de préparation du projet « Accompagnement Ingrid » étaient faites. L'e-mail prévu ce jour n'est plus à envoyer (l'appel l'a remplacé). Elle remontera ce qu'elle remarque : traiter ses retours en petites PR. Aucun détail de client dans ce dépôt public.
- **Synchronisation GitHub vérifiée le 21/10/2026** : `main` est au commit 66dbc52 (PR 155), la branche de session le contient, rien n'est en retard.
- **Champ texte libre : fusionné** (PR 145 en 2.16.0, PR 149 en 2.16.2 : hauteur fixe de 4 lignes avec ascenseur, 16 px au moins sur téléphone). Plus rien à reprendre. **Reste du chantier lié** : allègement des fiches Affaires et Projets (trop de champs affichés), inventaire champ par champ (« je le regarde » / « jamais ») puis décision avec Jérôme. Pas de tags sur les affaires et projets (décision du 19/10/2026). Détail : second cerveau, fiches `Plateforme clients - décisions du module Automatisations et de la veille` et `Idée - affaires et projets dans le CRM de Chevalier IA OS`. Règle de Jérôme : une capture ou une maquette avant tout développement d'un écran.
- **Tests de PR corrigés (PR 158, fusionnée le 21/10/2026)** : un fichier de test ajouté ne déclenche plus la suite complète ; la coche = rapide + smoke + parcours de la PR. Mesure à faire sur les premières PR de code : si la coche dépasse 10 minutes, revoir avec Fable (objectif : environ 5 minutes). Les nuits des 19, 20 et 21/10 étaient rouges (issue GitHub 156, onglet Documents en format téléphone) : Jérôme a décidé de ne pas enquêter, à revoir après la nuit du 21 au 22/10.
- **Mode nuit : « GO NUIT »** (protocole dans `CLAUDE.md`). Réglages faits par Jérôme le 21/10/2026 : auto-merge activé, domaines du navigateur de test autorisés, Setup script ; **non vérifiés** dans une session (à constater la première nuit). L'audit de sécurité Fable est décalé à la semaine prochaine.
- **En premier : idées d'amélioration du module Affaires et Projets** : revue terminée, tout est dans `docs/idees-affaires-projets.md` (I1 à I18, ordre de travail et critères).
- **(ancien texte, repris)** **Idées d'amélioration du module Affaires et Projets.** Jérôme va les soumettre. Méthode convenue : (1) numéroter chaque idée (I1, I2…) ; (2) questionner Jérôme sur chacune jusqu'à la comprendre (cas vide, cas d'erreur, ce qu'il voit à l'écran) ; (3) les prioriser avec toutes les autres pistes de `roadmap.md` (audit des différences Jérôme / clients, second passage du look compact, aide client publique, audit de sécurité Fable avant le 23/10/2026 07h00, chantier ChatGPT sur le MCP, allègement des fiches). Le tableau des idées numérotées vivra dans `docs/idees-affaires-projets.md` (à créer à la première idée).
- **En attente de Jérôme** : jugement sur les captures du look compact (`~/chantiers-crm/captures-look-compact/`) ; PR 115 (CLAUDE.md, emplacement du clone).

## Vocabulaire et registre du menu (18/10/2026) : PR 127, version 2.12.0

PR A faite, en attente du « fusionne » (voir `reglages-menu-crm-unique.md`, section du 18/10/2026). **PR B fusionnée (2.13.0, nouvelle coque du menu).** **PR C faite (2.14.0, poignée de largeur du menu), en attente du « fusionne »** : voir `roadmap.md`. Reste à Jérôme : regarder les captures de `~/chantiers-crm/captures-menu-C/` (et `captures-menu-B/` : garde-t-il sa photo ? sinon rien à faire ; pour la garder, annuler le commit « avatar = initiale »). **PR D faite (2.15.0, look compact, PR 139), en attente du jugement de Jérôme sur `~/chantiers-crm/captures-look-compact/` (avant / apres) ; ne pas fusionner avant son accord.** **Plus tard** : l'audit complet des différences entre l'espace de Jérôme et ceux des clients.

## Extraction de valeur supprimée (18/10/2026)

Retirée partout (voir `cadrage-projets.md`, section « La vision de Jérôme »). **Après la fusion de la PR, Jérôme doit** : (1) déployer le MCP des clients (workflow plateforme, choix `mcp`) pour que l'outil `extraire_valeur_projet` disparaisse ; son CRM se met à jour tout seul ; (2) fermer le ticket GitHub n° 28 ; (3) si Hermes est branché, remplacer sa liste d'outils par celle de `branchement-mcp.md` (40 outils).

## Options par défaut des nouveaux espaces (18/10/2026) : PR 122

Dossier Drive et célébrations allumés par défaut chez un nouveau client ; zone « Dossier Drive parent » sous la case (Réglages > Options). PR en attente du « fusionne » de Jérôme (visible dans Réglages). **Avant de déployer la plateforme** : vérifier dans Firestore (`clients/<client>/crm_parametres/reglages`) que les espaces existants ont `celebrations` et `boutonsDepot` écrits, car les champs absents prennent la nouvelle valeur (true). Voir `roadmap.md` et `google-drive.md`.

## Deux actions pour Jérôme : tests sur GitHub (18/10/2026)

1. **Exiger la coche « Tests » avant toute fusion** : **impossible sur le forfait gratuit** (vérifié le 18/10/2026 : GitHub répond « Upgrade to GitHub Pro or make this repository public » pour les règles de branche d'un dépôt privé). Décision de Jérôme à prendre : rester en gratuit (la règle « on ne fusionne que si la coche Tests est verte » est alors tenue par Claude, sans verrou technique) ou passer à GitHub Pro (environ 4 $ par mois, résiliable à tout moment, 3 000 minutes d'Actions). Avec le Pro : https://github.com/settings/billing/plans (« Upgrade » sur la ligne Pro), puis https://github.com/jeromechevalier-wq/chevalier-ia-os/settings/rules/new?target=branch : nom « main », statut « Active », « Add target » > « Include default branch », cocher « Require status checks to pass », « Add checks » > « Tests », « Create ».
2. **Sortir le dépôt de Google Drive** : dans le Terminal, `mkdir -p ~/Code-Chevalier-IA && git clone https://github.com/jeromechevalier-wq/chevalier-ia-os.git ~/Code-Chevalier-IA/chevalier-ia-os`, puis ouvre ce dossier dans Claude Code et ne touche plus à la copie qui est dans Drive (Drive et Git se disputent les fichiers).

## Mon espace modifiable (17/10/2026) : branche mon-espace-modifiable, version 2.10.0

Code et tests écrits, **rien déployé**, PR en attente du « fusionne ». Lire `mon-espace.md` : qui peut quoi, la fonction `espaceReglages`, les **étapes de Jérôme avant le déploiement** (créer le compte de service `espace-reglages` et lui donner deux droits, vérifier le nom « Chevalier IA - Serveur 1 » en haut de chaque page de la console, puis choisir « fonctions » dans le workflow, qui publie aussi les automatisations et exige la clé n8n) et ce qui n'est pas vérifié en réel (vrai Storage, vrai appel, iPhone). Les règles Firestore et Storage ne changent pas. Captures de recette : `~/chantiers-crm/captures-mon-espace/`.

## Tests plus rapides, plusieurs sessions en même temps (17/10/2026) : branche acceleration-tests

Les tests sont maintenant en paliers (rapide, smoke, complet) et la suite complète tourne sur GitHub à chaque PR et chaque nuit : voir `docs/tests.md`. Dans la session, on ne lance que le test du module touché, puis `npm run test:rapide` et `npm run test:smoke` ; on ne lance ni n'attend la suite complète. Mode d'emploi du lanceur : `tests/README.md`.

**Reste à faire** : les scénarios `L10`, `L14` (et par moments `L16`, `L17`, `L19`, `L20`) de `liens-documents.spec.js` échouent au hasard, **déjà avant ce chantier** (L14 : 2 mesures sur 3 sur `main`). Cause trouvée : l'écran se redessine quand Firestore renvoie la fiche, parfois avant la fin de `ecrireDossier` (`js/modules/crm/lanceurs.js`) ou de `choisirDansGoogle` (`js/modules/crm/liens-documents.js`) ; la suite de l'action écrit alors sur un morceau d'écran déjà remplacé (un vrai utilisateur verrait un formulaire resté ouvert). Correctif à écrire dans l'appli (pas dans les tests) : effacer l'état du formulaire avant l'écriture, et faire lire `formulaires` par l'écran redessiné.

## Automatisations de Jérôme + vue administrateur (17/10/2026) : branche automatisations-admin, version 2.7.0

Code et tests écrits, **rien déployé**, interrupteur `AUTOMATISATIONS_EN_SERVICE = false` dans `functions/src/index.js` (une fusion déploie toutes les fonctions : il faut d'abord le secret et le compte de service). Lire `automatisations-n8n.md` parties 10 et 11 : reconnaissance par trois signes, guide pas à pas pour Jérôme, **à confirmer avec lui : le nom exact du credential `interne` dans son n8n** (prévu : « Clé n8n - interne »).

## Liens et documents, Google Drive (16/10/2026) : branche liens-documents-drive, version 2.6.1

## Tableau de bord : porte, écran et saisie (17/10/2026), version 2.9.0

**En ligne** : la porte des scripts GitHub (`docs/tableau-de-bord.md`, PR 94, 97), l'écran en lecture (PR 98), et la saisie d'une date ou d'une mesure avec l'onglet « Historique des saisies » (PR 101 : fonction appelable `tableaudebordSaisir`, lot atomique, le script quotidien n'écrase plus une saisie même en cas de course, section 7 de `docs/tableau-de-bord.md`). Les 14 indicateurs de clés sont écrits chaque jour par `interne-surveillance-cles`.

**Constats de Jérôme à traiter en premier (17/10/2026)** : (1) une échéance à moins d'un mois doit s'afficher en rouge (clignotement discret, avec `prefers-reduced-motion`) et déclencher des e-mails d'alarme : la règle actuelle (orange sous 30 jours) est à revoir avec lui ; (2) le workflow quotidien ignore les indicateurs saisis à la main, donc aucun e-mail pour une échéance saisie : ajouter une lecture seule sur la porte (`indicateurs.lire`) que le script appelle pour les évaluer ; (3) une note saisie affichait `dat" de test a v"rifier` : le texte est stocké tel quel (le `é` est devenu `"`), l'affichage est bon : retester la saisie des accents dans le champ. Brief complet : fiche du second cerveau `Reprise - Tableau de bord, suite (2026-10-17)`.

**Reste à faire, dans l'ordre** (conception : fiche « Module Tableau de bord - conception » du second cerveau ; relecture Fable du 17/10/2026) :
1. Objectifs du mois et courbes (décision de Jérôme : calcul chaque dimanche par une fonction planifiée, et à chaque arrivée sur la page par une fonction appelable ; jamais d'écriture depuis l'écran) : migrer `os_objectifs` dans les nouvelles tables (décision de Jérôme : même code partout), lecture de `tableaudebord_releves` (index composite à créer : aucun `firestore.indexes.json` aujourd'hui), tableau Général avec les objectifs.
2. (FAIT, PR 101) Saisie des dates et des mesures par une fonction serveur, historique des saisies.
3. Boutons de rafraîchissement (demande en base, fonction qui lance le workflow GitHub avec un jeton limité, le workflow accepte une cible).
4. Retrait des indicateurs disparus de la configuration ; limites par famille de clés ; lot d'écriture atomique ; frein sur les refus 401.
5. Indicateurs des sauvegardes et des copies Google dans le tableau de bord.
6. Plateforme clients : porte `tableaudebord` dans `functions-plateforme`, réécriture `/tableau-de-bord` dans `firebase.plateforme.json`, `--usage tableaudebord` pour les clients dans `scripts/porte/outil.js`, fonction d'administration pour que Jérôme lise les bases clients, point d'étape Fable avant ouverture.
Petits points notés par la relecture : aide de la méthode (auto/semi/manuel) à rendre accessible au toucher et au clavier, vocabulaire de « à traiter », échéance écrite en texte.

**Pour les tests** : un port d'émulateur pris par une autre session ? Ne rien tuer ; copie jetable sur d'autres ports avec `/private/tmp/claude-501/sync-alt.sh` si elle existe encore (sinon refaire : ports 8180, 9199, 5150). `JAVA_HOME=$HOME/.local/jdk-21/Contents/Home`.

## Veille : ajout de lien, bouton Résumer, lecture du résumé : TERMINÉ le 17/10/2026

Fusionné (PR n° 69), secret `VEILLE_JETON_RESUMER` créé, workflow n8n `interne-veille-resumer-a-la-demande-porte` publié avec le champ `html` (version `9695bfa8` ; version de retour : `9e0f1ece`), essai réel réussi par Jérôme (« Lire le résumé » apparaît). **Rien à reprendre**, sauf l'option de changer l'ancien jeton du bouton (voir `veille-ajout-et-resume.md`, fin de la partie 3). À supprimer de cette note quand Jérôme l'aura lue.

## Chantier 14 : journal d'activité des workflows (11/10/2026)

Code, tests (Google simulé) et guide écrits ; **rien déployé**. Lire `google-drive.md` : ce que Jérôme verra, les **étapes à faire par lui dans la console Google** (API Drive et Picker, ID client OAuth, écran de consentement `drive.file`, puis donner l'ID client public à Claude), les choix faits et ce qui n'est pas vérifié en réel. Tant que l'ID client est vide, les boutons Google sont cachés.

## Réglages à menu latéral + menu CRM unique (16/10/2026) : branche reglages-menu-crm-unique, version 2.6.0

Code écrit, tests écrits, **rien déployé**, PR en attente du « fusionne ». Voir `reglages-menu-crm-unique.md` : ce que Jérôme voit, le choix de la méthode A, comment un module déclare ses réglages, et ce qui reste en lecture seule chez un client (nom, logo, membres, modules : les règles Firestore interdisent l'écriture depuis le navigateur). Reste à décider avec Jérôme : si un éditeur doit pouvoir les modifier (règles ou fonction serveur). La section Drive de « Liens et documents » s'ajoute par une déclaration dans `registre.js` (point d'accroche décrit dans la doc).

## Ménage du CRM (16/10/2026) : branche menage-crm-clients, version 2.5.0

Code écrit, **tests verts** (PR n° 73). Voir `menage-crm.md` : ce qui est fait, les choix faits, ce qui touche les données de Jérôme. Reste : relecture de la PR, « fusionne » de Jérôme. Chantiers suivants : Réglages à menu latéral, fusion du menu CRM, Drive / liens.

## MCP pour tous les clients (16/10/2026) : PR en attente du « fusionne »

Construit et testé (tests verts), **rien déployé**. Lire `mcp-clients.md` : ce qui est fait, l'isolation entre clients, les trois déploiements à lancer dans l'ordre (règles, fonctions, site, par le workflow « Déploiement plateforme clients »), et ce qui n'est **pas** vérifié (vrai claude.ai, vrai ChatGPT). Première chose à faire après le déploiement : allumer le module chez un client d'essai (`activer-module <client> mcp --ecrire`) et brancher Claude sur son lien.

## Chantier 14 : module Automatisations, ex-« journal d'activité des workflows » (11/10/2026 ; renommé le 16/10/2026)

Phases 1 et 2 écrites et testées (émulateurs + faux n8n), PR en attente du « fusionne » de Jérôme. Rien déployé. **À faire par Jérôme, dans l'ordre** (pas à pas dans `automatisations-n8n.md`, partie 7) : publier règles et page (workflow, choix `tout`), déposer la clé n8n (`firebase functions:secrets:set N8N_API_KEY --project chevalier-ia-app`, sans la montrer à personne), déployer les fonctions, étiqueter un workflow de test `client-<identifiant>` et activer le module (`activer-module <client> automatisations`). Ensuite : essai réel avec un workflow lent et un workflow qui échoue, brancher l'alerte « Nous sommes prévenus ». Phase 3 (Logger, étapes) : pas commencée, `steps` est prêt.

## En attente du feu vert de Jérôme : objectif « Chiffre d'affaires signé » (10/10/2026)

Demande d'évolution rédigée et validée, **rien n'est codé** : `demande-evolution-ca-signe.md` (définition, cas particuliers, 4 points à vérifier dans le code avant de commencer, périmètre). Cible : 1 000 € par mois. Une seule PR, suite de tests complète, fusion après le « fusionne » de Jérôme. Le contexte des 4 KPI est dans la fiche « KPI principaux de Chevalier IA » du second cerveau.

## En premier : connexion Google (OAuth) du serveur MCP pour le téléphone (09/10/2026)

PR 49 **fusionnée et déployée le 10/10/2026**, règles Firestore publiées, essai réel réussi sur l'ordinateur (`qui_suis_je` → `claude-ai-jerome-chevalier`) **et sur le téléphone** (Jérôme, 10/10/2026). Chantier terminé : rien à reprendre de ce côté. Lire `mcp-oauth.md` (mise en route dans l'ordre : publier les règles Firestore, fusionner, ajouter le connecteur sur claude.ai, essayer sur le téléphone). Si l'essai échoue : les journaux Cloud Run du service `mcp` portent un champ `code` en `oauth_…` qui dit à quelle étape ça casse. Validé en réel sur l'ordinateur et sur le téléphone. Décisions de Jérôme : tous les droits, 30 jours glissants. **Pour couper l'accès d'un téléphone : pas à pas dans `mcp-oauth.md`, « Couper l'accès du téléphone ».**

## Pour mémoire : le chantier Projets est terminé (07/10/2026)

Rien à reprendre de ce côté, tout est fusionné sur `main` et le déploiement est vert : écran Projets en 7 étapes (PR #32 à #38, version 2.1.0), facturation 2.2 (PR #40 et #41, version 2.2.0 : factures dans le projet, Clôture bloquée tant qu'une facture est à payer, sortie « clôturer avec impayé », la vente s'arrête à « Gagné », migration des anciennes affaires dans Réglages) et 16 outils MCP des projets (PR #42, détail dans `mcp-projets.md`). Jérôme a essayé l'écran et dit que tout fonctionne ; **il remontera ce qu'il remarque à l'usage** : traiter ces retours en petites PR.
- **Hermes n'est pas encore configuré** (Jérôme, 07/10/2026). Au moment de le brancher, la liste des **40 outils** à autoriser (44 avant la suppression de `extraire_valeur_projet`, le 18/10/2026) est dans `branchement-mcp.md` (vérifiée par un test) : ne pas reprendre une ancienne liste (`ajouter_encaissement` n'existe plus).
- Décisions de Jérôme à ne pas rouvrir : une affaire Gagnée n'est **pas** archivée automatiquement (il l'archive à la main) ; une facture se paie en entier ; pas de délai de paiement.
- Non faits volontairement : outils MCP de modification ou de suppression de facture et de gestion des modèles (ils restent à l'écran) ; blocage du passage de phase tant que les tâches de la phase ne sont pas faites (proposé à Jérôme, pas demandé).

## 0. Migration des sauvegardes vers Backblaze : état au 04/10/2026 (soir) et suite

**À lire d'abord si Jérôme parle de sauvegardes, de Backblaze, de Drive ou de Time Machine.** Décisions et plan : `roadmap.md` (« Sauvegardes : décisions du 04/10/2026 » et « Plan de migration vers Backblaze »). Carte complète et schéma « Aujourd'hui / Cible » : dépôt `_JEROME_OS_onGIT`, fiche « Carte des sauvegardes » (la session doit avoir ce dépôt : `add_repo`, accès en écriture).

### Ce qui existe (tout fusionné sur `main` sauf mention contraire)
- **Dépôt privé `interne-sauvegardes`** (créé par Jérôme : GitHub refuse `create_repository` à Claude, 403). Contient les jobs, `README.md` (secrets, règles, activation), `LISEZ-MOI.md` (déposé en clair dans le bucket), `docs/restaurer.md`. Pour y écrire : `add_repo` avec `access: push`, puis cloner, branche, PR (le dépôt n'accepte rien sur `main` sans PR par convention).
- **Job GitHub quotidien : testé en vrai le 04/10/2026**, 8 dépôts sauvegardés (environ 119 Mo), noms chiffrés illisibles chez Backblaze, secrets masqués dans le journal.
- **Essai de restauration (mode `--github`) : réussi le 04/10/2026** : le bundle de `chevalier-ia-os` relu dans Backblaze, déchiffré, `git fsck` propre, empreinte identique. Cela confirme que la configuration rclone par l'environnement (`RCLONE_CONFIG_*`) et le chiffrement fonctionnent.
- **Écrits et testés avec un faux rclone, jamais exécutés pour de vrai** : export des bases (`scripts/bases.mjs`, `restaurer-bases.mjs`, aller-retour exact sur l'émulateur Firestore), copie de Drive (`scripts/drive.mjs`, `autoriser-drive-lecture.mjs`), surveillance (`fraicheur.mjs`), essai de restauration `--bases` et `--drive`.
- **Secrets déjà créés par Jérôme** (noms exacts) : `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `CRYPT_PASSWORD`, `CRYPT_SALT`, `JETON_LECTURE_GITHUB`. **Pas encore créés** : `CLE_FIREBASE_CHEVALIER_IA_OS`, `CLE_FIREBASE_SUIVI_PRESENCE_ELEVES`, `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`. Jamais de valeur dans la conversation, le dépôt ni un commit.
- **En attente du « fusionne » de Jérôme** : PR 2 de `_JEROME_OS_onGIT` (carte et schéma corrigés pour Time Machine : plus de disque, aucune sauvegarde du Mac). **Deux dépôts ont une PR numérotée 2** : toujours écrire le dépôt avec le numéro.
- **Les workflows planifiés sont en sommeil** tant que la variable de dépôt `SAUVEGARDE_ACTIVE` n'est pas `oui` (sinon e-mails d'échec inutiles). Les lancements manuels marchent toujours (Actions, Run workflow ; l'essai de restauration a un menu « modes » : `--github` seul avant que Drive et les bases soient prêts).
- **L'ancien système du Mac reste en place** (cron : script des `.bundle` dans Drive chaque dimanche, vérification des changements non poussés) : on n'y touche **qu'après** une semaine de succès automatiques, 8 jours d'observation de l'autorisation Google et un essai de restauration complet réussi.

### Suite, dans l'ordre
1. **Jérôme** : copie papier des deux mots de passe de chiffrement (et dans KeePassXC) si ce n'est pas fait ; merge « Conflict » du fichier KeePassXC ; copie du fichier KeePassXC hors de Drive (clé USB).
2. **Bases de données** : Jérôme crée un compte de service « Lecteur Cloud Datastore » par projet Firebase (`chevalier-ia-os`, `suivi-presence-eleves`), colle sa clé JSON dans le secret correspondant et **supprime le fichier**. Puis lancer « Bases de données vers Backblaze » à la main ; lire le journal (`get_job_logs`) ; lancer l'essai de restauration `--bases`. Vérifier si ces projets ont des fichiers dans Cloud Storage (non couverts).
3. **Drive** : ajouter la portée `drive.readonly` à l'écran de consentement du projet `chevalier-ia-os` et le passer « En production » ; Jérôme lance `node scripts/autoriser-drive-lecture.mjs` sur son Mac (fichier JSON du client OAuth dans `~/.config/interne-sauvegardes/oauth-client.json`), puis `--copier client-id`, `--copier client-secret`, `--copier jeton` vers les trois secrets. **Risque connu** : en mode « Test » le jeton expire au bout de 7 jours (le script avertit) ; repli : compte de service avec partage des dossiers. La première copie (~200 Go) est découpée et reprend toute seule d'un jour à l'autre ; point à vérifier : comment rclone traite les Google Docs natifs.
4. **Activation** : variable `SAUVEGARDE_ACTIVE` = `oui` après la recette, puis une semaine d'exécutions automatiques réussies.
5. **Bascule** (Jérôme, sur le Mac) : retirer les deux lignes du cron, ranger les scripts de `_GITHUB_BACKUP` dans `__A_SUPPRIMER` (jamais de suppression), vérifier que tout est poussé, retirer le code et le second cerveau du Mac. Puis réécrire le `CLAUDE.md` du second cerveau et « Règles de travail Git » (branche par session, ChatGPT compris ; protection de `main` des sites en production, à vérifier selon l'abonnement GitHub).
6. **Time Machine** : pas de nouveau disque pour l'instant ; décision à reprendre après la migration.

### Limites et pièges connus
- **Une session cloud ne peut pas exécuter rclone** (le réseau de la session bloque son site) : les essais réels passent par GitHub Actions ; Claude lit les journaux avec `get_job_logs` (`return_content: true`).
- **Avertissements Node 20** dans les journaux : passer `actions/checkout`, `actions/setup-node` et `actions/setup-java` à leurs versions suivantes (`setup-java` v5) dans une PR dédiée.
- Pas dans la carte des sauvegardes : Notion, n8n, iCloud Drive, fichiers du VPS.
- Prix de Backblaze : environ 1,3 $/mois pour 200 Go, relevé sur des pages de synthèse le 04/10/2026, à confirmer.

## 1. Appliquer la décision « pas de RGPD, on garde tout » (décidée le 04/10/2026)

Décision de Jérôme : base interne, aucune mesure RGPD pour l'instant ; les journaux d'audit ne s'effacent jamais, y compris les noms, e-mails et notes ; les copies « avant / après » non plus. **La règle de durée de vie (TTL) de 90 jours est déjà supprimée dans la console** (par Jérôme, le 04/10/2026) : plus rien n'efface ces copies. Il reste à aligner le code, les tests et les docs. Ne pas réintroduire le RGPD sans que Jérôme le demande.

### Où est le code concerné (état de `main` au 04/10/2026)

| Fichier | Ce qui reste de l'ancienne règle |
|---|---|
| `functions/src/coeur/ecriture.js` | `JOURS_COPIES = 90` (ligne 23) et `expireAt` écrit avec les copies (ligne ~119 et ~157) ; `tronquer(parametres)` (ligne ~39 et ~158) : le journal `crm_audit` ne garde plus les valeurs reçues |
| `js/modules/crm/logique.js` | `JOURS_COPIES_AUDIT = 90` (ligne ~1556) et `expireAt` (ligne ~1575), pour l'audit des actions de l'écran ; la copie `functions/partage/logique.js` est générée (`node scripts/preparer-fonctions.js`) |
| `firestore.rules` | la règle sur `crm_audit_avant` exige `request.resource.data.expireAt is timestamp` (ligne ~27) |
| `functions/src/coeur/restaurer.js` | message `copie_expiree` (« n'existent plus ») |
| `js/modules/crm/journal.js` | textes « elle a expiré (gardée 90 jours) » (lignes ~46 et ~166) |
| `functions/src/mcp/outils/suppression.js` | descriptions « Récupérable 90 jours » (`supprimer_note`, `supprimer_activite`) |

### Piège d'ordre à respecter

La règle Firestore **exige** `expireAt`, et l'écran comme le serveur l'écrivent. Si le code cesse de l'écrire avant que la règle soit assouplie (ou l'inverse), des écritures sont refusées. **Approche la plus sûre (recommandée)** : ne pas toucher aux règles ni au champ ; mettre `JOURS_COPIES` et `JOURS_COPIES_AUDIT` à une très grande valeur (par exemple 36 500 jours, soit 100 ans), pour que `expireAt` reste valide mais inoffensif maintenant que le TTL est supprimé. Aucune publication de règles n'est alors nécessaire. Un nettoyage complet du champ (règles, écran, serveur, tests) pourra venir plus tard, en un seul lot coordonné, si Jérôme le veut.

### À faire

1. Garder aussi les **valeurs reçues** dans `crm_audit` (paramètres, y compris noms, e-mails, notes, tronqués à 2 000 caractères comme prévu au plan 5.2), à la place des seuls noms de champs.
2. Allonger la durée des copies comme ci-dessus, adapter les textes (« gardée 90 jours », « expiré », « Récupérable 90 jours », `copie_expiree`), les descriptions d'outils et les tests.
3. Mettre à jour `plan-mcp.md` (section 5.2, écarts de l'étape 4, risque R10), `roadmap.md` (retirer « À confirmer » de l'étape 4), `securite-et-pannes.md`, `playbook-mcp-firebase.md`, `mcp-etape-4.md`, `audit-ecran.md` et `journal-ecran.md`, qui parlent encore du RGPD et des 90 jours.
4. Lancer les tests du module touché, `npm run test:rapide` et `npm run test:smoke`, puis une PR pour Jérôme (la suite complète tourne sur GitHub).

## 2. Reste du plan du serveur MCP, dans l'ordre (voir `roadmap.md`)

- **À vérifier avec Jérôme le 04/10/2026** : la première sauvegarde quotidienne de Firestore apparaît dans la console (« Reprise après sinistre », tableau « Sauvegardes », expiration à 98 jours).
- **Étape 6, fin** : brancher **Hermes** sur le VPS (jeton « bibliothécaire », sans suppression ni restauration ; Jérôme doit fournir `hermes --version`). Mettre à jour `branchement-mcp.md`.
- **Étape 5, fin (revue le 04/10/2026)** : plus d'export JSON par Drive. La base est exportée **directement dans Backblaze B2 (Europe), chiffrée**, chaque semaine, par un job (voir `roadmap.md`, « Sauvegardes : décisions du 04/10/2026 »). Reste : le job, `outils/restaurer-export.js` et un **essai de restauration** (qui crée une nouvelle base, jamais d'écrasement). Ordre convenu : compte Backblaze et clé de chiffrement gardée **hors de Drive**, job GitHub quotidien, essai de restauration, jobs des bases et de Drive, et **seulement ensuite** couper GitHub → Drive. Sauvegarde de l'autre appli (`suivi-presence-eleves`) : mercredi, 98 jours, première copie attendue le 07/10/2026. **Plan de migration approuvé le 04/10/2026** : dépôt privé `interne-sauvegardes` (jobs GitHub quotidien, Drive et bases hebdomadaires, tous chiffrés vers Backblaze, essai de restauration automatique) ; détail et ordre dans `roadmap.md` (« Plan de migration vers Backblaze »). Drive est lu avec l'autorisation Google de Jérôme (`drive.readonly`) : surveiller l'expiration à 7 jours, repli = compte de service. **Time Machine** : disque renvoyé, aucune sauvegarde du Mac, pas de nouveau disque pour l'instant.
- **Étape 7** : pièces jointes dans l'appli (par lien d'abord, puis téléversement vers Drive). Suppose le test à 8 jours du prototype Drive (autorisation à refaire sur le Mac, contrôle vers le 10/10/2026).
- **Étape 8** : recette et clôture.
- **En attente de discussion** : quatre points d'expérience utilisateur de la version 2.0.1 (`retours-ux-2026-10-04.md`).
