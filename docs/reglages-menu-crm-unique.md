# Réglages à menu latéral et menu CRM unique (version 2.6.0, 16/10/2026)

Chantiers 2 et 3 des décisions du 16/10/2026 (fiche « Décisions de cadrage du CRM client »). **Rien n'est déployé.** Les règles Firestore ne sont **pas** modifiées et **aucune donnée n'est déplacée** (aucune migration) : on a réorganisé l'affichage, pas ce qui est stocké.

## Ce que Jérôme voit de différent

1. *(Depuis le 18/10/2026 le bloc s'appelle « Affaires et projets », « Journal » est devenu « Journal des modifications » et « Archives » n'est plus au menu : voir la mise à jour en bas de page.)* **Un seul bloc « CRM » dans le menu**, avec les sept écrans dans cet ordre : Accueil, Personnes, Organisations, Affaires, Projets, Journal, Archives. Avant, « Projets » et « Archives » formaient un second bloc. « Modèles » reste dans les Réglages. Les adresses (`#/crm/affaires`, `#/projets/projets`…) sont **exactement les mêmes** : favoris et liens directs marchent sans rien faire.
2. **Une page Réglages à menu à gauche**, chez Jérôme **et** chez les clients :
   - **Espace** (réglages de la coque) : *Mon espace* (nom, logo, couleur, thème de l'appareil), *Membres et rôles*, *Modules actifs* ;
   - **Modules** : un élément par module allumé : *CRM*, *Veille*, *Automatisations*, *Connecter mon assistant* (anciennement *Assistant (MCP)*).
   Cliquer sur *CRM* (aujourd'hui *Affaires et projets*) montre **tous** les réglages qui existaient (étapes de vente, phases de projet, options, modèles d'affaires, modèles de projets, objectifs, offres, secteurs, sources, étiquettes, filtres, début d'activité, GitHub si l'option est allumée, sauvegarde). Des raccourcis en haut de la page permettent d'aller à une section.
3. **Sur téléphone**, le menu de la page Réglages se replie en un bouton qui montre la section ouverte ; on le touche pour voir la liste.
4. **Chez Jérôme**, en cliquant sur « Réglages » on arrive sur *Mon espace* (la première ligne du menu) : les réglages du CRM sont un clic plus loin (*CRM*). Adresse directe : `#/reglages/crm`. Le thème clair/sombre, qui était tout en bas de l'ancienne page, est maintenant dans *Mon espace*. Les objectifs du mois sont dans *CRM* (ils sont propres au CRM de Jérôme).
5. **Chez un client** (`#/espace/<client>/reglages`) : la page existe maintenant, avec les sections d'espace réservées aux éditeurs (*Membres et rôles*, *Modules actifs*) ; un **lecteur** ne les voit pas et, dans *CRM*, tout est visible mais grisé (il ne modifie rien).

## Choix du menu CRM unique : la « méthode A » (la plus simple et la plus sûre)

J'ai regardé `registre.js`, `modules.js` et `espace-modules.js` :

- **Les deux modules techniques `affaires` et `projets` restent séparés.** Les fusionner dans le code (« méthode B ») obligerait à toucher les collections, les outils du serveur MCP (qui sont rangés par module), les routes, les règles de dépendance et une grosse partie des tests : beaucoup de risque pour aucun gain visible.
- **Le regroupement se fait dans la déclaration** (`js/os/registre.js`) : chaque module peut dire `groupe: 'crm'`, et `GROUPES_MENU` décrit le bloc « CRM » (nom, icône, ordre des sept entrées, ordre des sections de Réglages). Une fonction pure, `blocsDuMenu(actifs)`, fabrique le menu ; `shell.js` l'utilise. Un client qui n'a que `affaires` voit le bloc CRM sans Projets ni Archives.
- **Les adresses ne changent pas**, donc il n'y a **aucune redirection à écrire** : `#/crm/…` reste géré par le module `affaires`, `#/projets/…` par `projets`. Le lien « affaire devient projet » et les favoris continuent de marcher parce qu'ils visent les mêmes routes. (Seul changement d'adresse : le retour depuis la fiche d'un modèle de projet va à `#/reglages/crm` au lieu de `#/reglages`.)
- **Un seul interrupteur côté client : `crm`.** Dans le champ `modules` de la fiche client (ou avec l'outil `nouveau-client`), `crm: true` allume `affaires` **et** `projets`. Ce n'est **pas** un nouveau module : aucune donnée, aucune route à lui (`INTERRUPTEURS` dans `registre.js`). Règles :
  - une valeur écrite pour `affaires` ou `projets` **l'emporte** sur `crm` : un client déjà réglé `{ affaires: true, projets: false }` ne change pas ;
  - `projets` sans `affaires` reste refusé comme avant ;
  - l'outil accepte `crm` partout où un module se nomme (`--modules crm,mcp`, `activer-module <client> crm`, `desactiver-module <client> crm`) ; il écrit toujours les deux clés `affaires` et `projets` dans la fiche, ce qui garde le serveur MCP et les anciennes lectures inchangés ;
  - dans la page Réglages, *Modules actifs* montre **un seul interrupteur « CRM »**.
- Le serveur MCP des clients lit le même `registre.js` (copié par `npm run preparer`) : l'interrupteur `crm` marche donc aussi pour lui, sans toucher au fichier des outils d'écriture.

## Comment la page Réglages est construite

- `js/os/reglages.js` (la coque) : une seule page, appelée par `main.js` (Jérôme) et par `espace-modules.js` (clients). Routes : `reglages` (arrivée sur la première section d'espace), `reglages/espace`, `reglages/membres`, `reglages/modules`, `reglages/crm`, `reglages/veille`… Une section inconnue, ou réservée aux éditeurs quand on est lecteur, ramène à l'arrivée.
- **La coque ne connaît aucun module** (un test le vérifie). Le menu de gauche vient du registre : `reglagesDesModules(actifs)` donne un élément par bloc de module actif.
- **Pour qu'un nouveau module ait ses réglages** : (1) dans `registre.js`, ajouter à sa déclaration `reglages: { sections: [{ id: 'reglages-xxx', libelle: '…' }] }` (ou `sections: []` et un `resume` s'il n'a rien à régler) ; (2) dans le module, exporter `reglages(page, ctx)` qui ajoute à `page` des `<section class="carte-section" id="reglages-xxx">` et renvoie (si besoin) une fonction qui arrête ses abonnements. `ctx = { chezClient, compte, lecture }`. Rien à toucher dans la coque. Un test vérifie que chaque section déclarée existe dans le code du module, et inversement.
- **Point d'accroche pour « Liens et documents » (Drive)** : ajouter `{ id: 'reglages-drive', libelle: '…' }` à `reglages.sections` du module `affaires` dans `registre.js`, puis créer la section dans `rendreReglagesCrm`. Rien d'autre.
- L'ordre des sections du CRM vient de `GROUPES_MENU.crm.ordreReglages` ; les sections de `affaires` et de `projets` (modèles de projets) sont mélangées dans cet ordre.
- Pour un lecteur, les sections d'un module sont dans un `<fieldset disabled>` : tout se voit, rien ne se modifie.

## Ce qui n'est pas modifiable depuis la page (et pourquoi)

Chez un client, **le nom, le logo, la couleur, les membres et les modules s'affichent mais ne se modifient pas depuis le navigateur** : les règles Firestore de la plateforme interdisent toute écriture sur `marques/<client>`, sur `clients/<client>` et sur les fiches de membres (seul l'outil `nouveau-client`, lancé par Jérôme, les écrit). Les interrupteurs de *Modules actifs* sont donc en **lecture seule** et la page le dit (« par la personne qui gère ton espace »). Les rendre modifiables par un éditeur demande **soit un changement des règles, soit une fonction serveur** : c'est une décision à prendre (sécurité), je n'y ai pas touché (contrainte du chantier).

## Fichiers touchés

- `js/os/registre.js` (groupes, sections de Réglages, interrupteur `crm`, `blocsDuMenu`, `reglagesDesModules`, sections d'espace), `js/os/reglages.js` (nouveau), `js/os/shell.js` (menu en blocs, lien Réglages avec le préfixe client), `js/main.js`, `js/os/espace-modules.js`, `js/os/espace.js` (la fiche du client est transmise à la page), `js/modules/crm/index.js` (la section des objectifs vient du CRM), `js/modules/mcp/index.js` (une carte qui renvoie vers la page Connexion), `js/modules/projets/modeles.js` (liens de retour), `css/os.css`, `scripts/plateforme/commun.js` et `scripts/plateforme/nouveau-client.js` (interrupteur `crm`).
- Version 2.6.0 : `js/os/version.js`, `version.json`, `tests/statique.test.js`.
- Non touchés (autre session) : `fiche-projet.js`, `functions/src/mcp/outils/ecriture.js`, section « Liens et documents ».

## Options par défaut d'un nouvel espace (2.11.8)

Un nouvel espace démarre avec « Créer un dossier dans Google Drive » et « Célébrations » **allumés**, « Extraction de valeur » éteinte (`OPTIONS_NEUTRES`, `js/modules/crm/logique.js`). Un booléen déjà enregistré garde la priorité. Sous la case Drive, Options du CRM montre la zone « Dossier Drive parent » (visible seulement case cochée).

## Tests

- Unitaires : `tests/registre.test.js` (menu en un bloc, interrupteur `crm`, sections déclarées = sections écrites, coque sans module, sections d'espace selon le rôle), `tests/outil-client.test.js` (A2d : `crm` dans l'outil).
- Navigateur (Playwright, ordinateur et téléphone) : `tests/e2e/modules-client.spec.js` (R9 menu unique, R10 éditeur, R11 lecteur, R12 section inconnue) ; les parcours des Réglages existants (`parcours`, `projets`, `identite-crm`) passent maintenant par *Réglages > CRM* (`allerAuxReglagesCrm` dans `tests/e2e/outils.js`).

---

## Mise à jour du 18/10/2026 (version 2.12.0) : vocabulaire et registre du menu (PR A)

Décisions de Jérôme : le mot « CRM » n'est plus écrit dans ce que l'utilisateur voit ; étapes pour les affaires, phases pour les projets. **Les adresses ne changent pas** (`#/crm/…`, `#/projets/…`, `#/reglages/crm`) : aucun signet ne casse.

- Le bloc du menu, l'élément des Réglages et l'interrupteur « Modules actifs » s'appellent **« Affaires et projets »** (identifiant technique `crm` inchangé).
- « Options du CRM » → **Options** ; « Réglages du CRM » → **Réglages** ; « Journal » → **Journal des modifications** (menu et titre de la page) ; « Étapes de vente » → **Étapes des affaires** ; « Phases de projet » → **Phases des projets**.
- **« Archives » n'est plus une entrée du menu.** La page existe toujours (`#/projets/archives`) et le bouton « Archives » de l'écran Projets y mène. Le **Journal reste au menu** tant que le menu utilisateur n'existe pas (PR B).
- Le raccourci `crm: true` d'une fiche client reste **lu** (il allume toujours affaires et projets, écrans et outils MCP) mais n'est plus proposé : pour une nouvelle fiche, écrire `affaires: true` et `projets: true` (voir `docs/activer-desactiver-modules.md`). Aucune fiche n'a été modifiée.
- Chez un client **sans le module Projets** (« affaires seules »), la page Réglages cache « Phases des projets », « Dossiers Drive des projets », « Suivi des paiements » et « Clôture bloquée ». À la racine (chez Jérôme) tout est allumé : rien ne change.
- Un test (`tests/menu-vocabulaire.test.js`) parcourt `js/**/*.js` et `index.html` et échoue si « CRM » réapparaît dans une chaîne affichée.
