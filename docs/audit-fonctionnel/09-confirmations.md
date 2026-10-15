# Confirmations des constats plausibles (essais du 2026-10-08)

Ce fichier reprend les 26 constats qui étaient seulement « plausibles » (lus dans le code) et dit, pour chacun, si l'essai a permis de le reproduire. Les essais sont des scripts Node qui appellent le vrai code du dépôt (`js/modules/crm/logique.js`, `js/modules/projets/logique.js`, `functions/src/coeur/*.js`) avec des données inventées en mémoire : aucune donnée réelle, aucun serveur de production, aucun navigateur. Les scripts sont dans le dossier d'essais hors dépôt `scratchpad/confirm/` (`essai-a.mjs`, `essai-b.mjs`, `essai-g4.mjs`). Trois mots possibles : CONFIRMÉ (reproduit par un essai, ou établi par une lecture précise du code citée à la ligne), NON REPRODUIT (essayé, le défaut n'apparaît pas), NON TESTABLE ICI (il faudrait un navigateur, une console ou une vraie date qui change). Quand une conclusion repose sur la seule lecture du code, c'est écrit.

### C-03 · RÉSULTAT : CONFIRMÉ
- **Essai** : lecture suivie du chemin complet du clic sur la croix (aucun navigateur lancé, donc écran non rejoué) : la croix appelle `definir(null)`, qui appelle `surChoix(null)`, que l'écran de l'affaire ignore.
- **Preuve** : `js/os/ui.js:439-443` (`definir(el)` : `if (!multiple && !el) entree.value = ''` puis `surChoix(choix)` avec `null`) ; `js/modules/crm/fiche-affaire.js:92` (`if (!el || el.id === a.personneId) return;`) et `:96` (`surChoix: async (el) => { if (el && el.id !== a.organisationId) await D.majAffaire(...) }`) : dans les deux cas, un choix vide ne déclenche aucune écriture. Côté serveur, `functions/src/mcp/outils/ecriture.js:51-52` accepte `null`.
- **Gravité proposée** : inchangée

### C-07 · RÉSULTAT : CONFIRMÉ
- **Essai** : recherche de tous les appels de `majActivite`, `planMajActivite` et `activiteNonFaite` dans `js/` et `functions/src/`, puis lecture du menu d'une activité.
- **Preuve** : la recherche ne trouve que des définitions : `js/modules/crm/donnees.js:350-351` (`majActivite`), `js/modules/crm/logique.js:975` (`activiteNonFaite`) et `:1613` (`planMajActivite`) ; aucun appel nulle part. Le menu d'une activité ne contient qu'une entrée, `{ libelle: 'Supprimer', ... }` (`js/modules/crm/activites.js:99-102`) ; la ligne d'une activité faite dans l'historique n'a aucun bouton (`js/modules/crm/activites.js:232-234`). Écran non rejoué.
- **Gravité proposée** : inchangée

### C-10 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : le filtre de départ « Réseau entrepreneuses » appliqué à deux affaires, l'une avec l'ancien texte de source, l'autre avec le texte après renommage dans les Réglages. Lecture du code de renommage.
- **Preuve** : sortie `C-10 filtre enregistré {"criteres":{"sources":["Réseau entrepreneuses"]},"trouvees":["a1"],"sur":2}` : le filtre enregistré ne retrouve qu'une des deux fiches. Le renommage n'écrit que la liste des Réglages : `js/modules/crm/reglages.js:155-160` (`D.enregistrerListes({ [cle]: liste.map(...) })`, rien sur les fiches ni sur les filtres) ; filtre de départ avec le texte en dur : `js/modules/crm/logique.js:101`. Le renommage lui-même n'a pas été rejoué dans l'écran.
- **Gravité proposée** : inchangée

### D-01 · RÉSULTAT : CONFIRMÉ
- **Essai** : recensement de toutes les écritures Firestore de `js/` par recherche de `setDoc|updateDoc|writeBatch|addDoc|deleteDoc|commit`, puis lecture de `majParametre` et du texte de l'écran Journal.
- **Preuve** : hors `executer` (le seul chemin qui écrit la trace, `js/modules/crm/donnees.js:191-196`), les écritures sont : `js/modules/crm/donnees.js:377` (`await setDoc(doc(db, 'crm_parametres', id), donnees, { merge: true })`, sans trace), `js/modules/projets/donnees.js:87-92` (modèles de départ, voulu) et `js/os/objectifs.js:129,135,141,147` (voir D-02). Les réglages (`enregistrerOffres`, `enregistrerListes`, `enregistrerEtiquettes`, `enregistrerFiltres`, `enregistrerReglages`) passent tous par `majParametre`. Le texte faux est bien à `js/modules/crm/journal.js:170` (« Chaque création, modification ou suppression faite dans l’appli ou par Claude Code laisse une ligne ici »). Double écriture d'une source nouvelle : `js/modules/crm/fiche-affaire.js:136` (`await D.ajouterValeurListe('sources', v); await D.majAffaire(...)`) et `fiche-personne.js:142`. Écran non rejoué.
- **Gravité proposée** : inchangée

### D-02 · RÉSULTAT : CONFIRMÉ
- **Essai** : même recensement que D-01 et lecture des fonctions de `js/os/objectifs.js`.
- **Preuve** : `js/os/objectifs.js:128-132` (`ajouterASaisie` : `setDoc(..., { valeur: increment(delta), maj: serverTimestamp() }, { merge: true })`), `:134-138` (`definirSaisie` : `valeur: Math.max(0, Number(valeurSaisie) || 0)` écrase la valeur du mois sans garder l'ancienne), `:140-142` (`updateDoc`), `:144-149` (`setDoc` d'un objectif manuel). Aucune ne passe par `executer`, donc aucune ligne de journal ni copie « avant ». Écran non rejoué.
- **Gravité proposée** : inchangée

### E-08 · RÉSULTAT : NON TESTABLE ICI
- **Essai** : recherche des minuteurs et des retours au premier plan dans `js/`, lecture de `rendreAccueil`. Le défaut demande une page ouverte pendant le passage à minuit dans un navigateur, ce qui n'a pas été fait.
- **Preuve** : ce qui est établi par la lecture, sans le jeu en conditions réelles : le seul `setInterval` est celui des célébrations (`js/os/celebrations.js:171`) ; les seuls `visibilitychange` et `focus` de l'appli sont dans `js/os/pwa.js:53-56` (contrôle de version) ; `js/modules/crm/accueil.js:23` calcule `const jour` une fois au dessin, `:19-20` fige `moisActuel` et `:57` (`suivant.disabled = moisAffiche >= moisActuel`) s'en sert ; les seuls abonnements de redessin sont les données (`:81`). L'effet visible après minuit n'a pas été observé.
- **Gravité proposée** : inchangée

### G-02 · RÉSULTAT : CONFIRMÉ
- **Essai** : lecture complète du seul fichier de `.github/workflows` (`ls .github/workflows` : `firebase-hosting.yml` uniquement) et recherche du mot « test » dedans.
- **Preuve** : `.github/workflows/firebase-hosting.yml:5-8` (déclenché par `push` sur `main` seulement, pas de `pull_request`) ; les étapes sont `:17-18` (`npm ci --prefix functions`), `:29-36` (déploiement des fonctions), `:37` (`FirebaseExtended/action-hosting-deploy@v0`) ; la recherche du mot « test » dans le fichier ne trouve rien : aucune étape de test avant le déploiement.
- **Gravité proposée** : inchangée

### A-11 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-a.mjs` : plan de migration (`planMigrerEtapesRetirees`) pour 40 à 90 affaires « Facture envoyée », chacune avec son projet ; seul le premier paquet de 130 écritures est appliqué (le deuxième est supposé refusé), puis la migration est relancée sur l'état obtenu.
- **Preuve** : pour chaque taille essayée (40, 50, 60, 70, 80 et 90 affaires) le plan compte 4 écritures par affaire (160, 200, 240, 280, 320, 360) et la relance donne `"doubles":["pr33:2"]` : le projet de la 33e affaire (coupée entre sa facture et son changement d'étape) reçoit deux factures. Comme 130 n'est pas multiple de 4, la coupure tombe toujours au milieu d'une affaire. Le découpage vient de `js/modules/crm/donnees.js:177` et `:190-197`. Le refus réel d'un deuxième paquet par Firestore n'a pas été simulé : c'est l'hypothèse de l'essai.
- **Gravité proposée** : inchangée

### A-12 · RÉSULTAT : NON REPRODUIT
- **Essai** : `essai-a.mjs` : deux appels `ajouterFacture` du vrai code du serveur MCP lancés en même temps (`Promise.allSettled`) sur le même projet, avec le moteur d'écriture réel sur données en mémoire.
- **Preuve** : sortie `["fulfilled","rejected:Écriture refusée, rien n’a été écrit (un document a été modifié entre-temps : recommencer)."]` puis factures restantes `["Facture A"]` : le serveur refuse la deuxième écriture au lieu d'effacer la première (contrôle `attendus` de `functions/src/coeur/ecriture.js`). Le cas écran contre agent n'a pas pu être essayé sans navigateur ni émulateur : l'écran écrit sans ce contrôle (`js/modules/crm/donnees.js:183-197` ne compare pas à l'état actuel). Le risque ne vient donc que de l'écran, et reste théorique.
- **Gravité proposée** : à baisser en MINEUR

### A-13 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : `suggestionPourEtape` appelée pour les 4 étapes avec les délais 1, 30 et 365 (12 appels).
- **Preuve** : sortie `A-13 sorties distinctes ... {"distinctes":4}` : 4 résultats différents pour 12 appels, donc le délai ne change rien. Le paramètre est reçu mais jamais lu dans la fonction (`js/modules/crm/logique.js:590-599`), alors que l'écran le propose encore (`js/modules/crm/reglages.js:52-58`) et que le serveur le passe aussi (`functions/src/coeur/metier.js:29`).
- **Gravité proposée** : inchangée

### A-15 · RÉSULTAT : NON TESTABLE ICI
- **Essai** : lecture de `sectionTaches`. Le défaut demande une fiche de projet laissée ouverte après minuit dans un navigateur.
- **Preuve** : `js/modules/projets/taches.js:60` (`const aujourdhui = D.ctx().aujourdhui;` au début de la fonction, donc relue seulement quand la section est redessinée) ; effet visible après minuit non observé.
- **Gravité proposée** : inchangée

### B-12 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : les vraies fonctions de lecture du serveur (`functions/src/coeur/lecture.js`) sur des données inventées et volontairement grosses (1 500 activités et 600 notes de 20 000 caractères pour une personne ; 400 affaires avec un « besoin » de 5 000 caractères ; 400 × 5 documents).
- **Preuve** : `lire_personne` avec `avecFil` renvoie 1 500 activités et 500 entrées de fil pour 10 130 697 caractères de JSON ; `lister_affaires` renvoie 200 lignes sur 400 pour 1 078 471 caractères (plafond en nombre de lignes, pas en poids) ; `lister_documents` renvoie les 2 000 documents sans aucun plafond (226 378 caractères). Ce sont des données extrêmes inventées pour l'essai, pas un cas réel.
- **Gravité proposée** : inchangée

### B-22 · RÉSULTAT : CONFIRMÉ
- **Essai** : import de `functions/src/version.js` dans `essai-b.mjs`.
- **Preuve** : sortie `VERSION_SERVEUR 0.2.0` ; `functions/package.json:4` (`"version": "0.2.0"`) contre `version.json:1` (`{"version": "2.3.3"}`).
- **Gravité proposée** : inchangée

### C-13 · RÉSULTAT : NON TESTABLE ICI
- **Essai** : `essai-b.mjs` appelle `dateRapide('demain', '2026-10-07')` et lecture du code ; le défaut lui-même demande une fiche ouverte au passage de minuit dans un navigateur.
- **Preuve** : `dateRapide('demain', '2026-10-07')` donne `2026-10-08` (la fonction est juste ; c'est la date de référence qui serait figée). Lecture : `js/modules/crm/activites.js:13` (`const aujourdhui = D.ctx().aujourdhui;` au montage) et `:138` (`selecteurDate(D.ctx().aujourdhui)`). Effet après minuit non observé.
- **Gravité proposée** : inchangée

### C-15 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : `ajouterDocument` avec `https://` seul, puis avec deux fois la même adresse ; `changementsDocumentsJournal` sur le doublon ; résolution de l'adresse relative `www.exemple.fr` depuis une fiche de l'appli.
- **Preuve** : `https://` seul est accepté (`{"erreurs":{},"patch":{"documents":[{"libelle":"https://","url":"https://"}]}}`, regex `^https?://` à `js/modules/crm/logique.js:709`) ; le doublon donne 2 documents et le journal renvoie `[]` ; `new URL('www.exemple.fr', 'https://chevalier-ia-os.web.app/#/crm/personnes/p1')` donne `https://chevalier-ia-os.web.app/www.exemple.fr`, c'est-à-dire un lien interne à l'appli. Le lien LinkedIn et site web est posé tel quel : `js/modules/crm/composants.js:137` (`href: lienVers(courant)`) avec `lienVers: (v) => v` (`fiche-personne.js:139-140`, `fiche-organisation.js:56`). Le clic dans l'écran n'a pas été rejoué.
- **Gravité proposée** : inchangée

### C-19 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : les trois lignes du Kanban (`filtrerAffaires`, filtre « ouverte ou gagnée », une colonne par étape de `L.ETAPES`) rejouées avec une affaire en étape retirée `facture_envoyee` et une affaire normale.
- **Preuve** : sortie `C-19 {"compteurAffiche":2,"cartesDessinees":1}` : le compteur compte 2 affaires, une seule carte existe (`js/modules/crm/affaires.js:289-297`). Le dessin dans le navigateur n'a pas été rejoué, seule sa logique l'a été.
- **Gravité proposée** : inchangée

### C-21 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : une affaire gagnée avec 2 rendez-vous faits et une date de « proposition envoyée » en octobre 2026 ; calcul des objectifs avant et après `planSupprimerAffaire`.
- **Preuve** : sortie `C-21 {"avant":{"rdv":2,"props":1},"apres":{"rdv":0,"props":0}}` : « Rendez vous tenus » passe de 2 à 0 et « Propositions envoyées » de 1 à 0 après la suppression de l'affaire (`js/modules/crm/logique.js:1590-1599`).
- **Gravité proposée** : inchangée

### C-24 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : suppression d'une personne ayant 300 activités ; seul le premier lot de 130 écritures est appliqué (coupure), puis le plan est recalculé sur l'état restant et appliqué en entier.
- **Preuve** : sortie `C-24 {"ecrituresDuPlan":301,"lots":3,"apresLot1":{"personnes":1,"activites":170},"apresRelance":{"personnes":0,"activites":0}}` : après un seul lot, la personne existe encore et il reste 170 activités (suppression à moitié faite) ; la relance termine proprement. Découpage : `js/modules/crm/donnees.js:177` (`ACTIONS_PAR_LOT = 130`) et `:190-197`. Une vraie coupure réseau n'a pas été simulée.
- **Gravité proposée** : inchangée

### D-12 · RÉSULTAT : CONFIRMÉ
- **Essai** : lecture de la table `CHEMINS` du Journal et de `cheminProjet`.
- **Preuve** : `js/modules/crm/journal.js:10` (`const CHEMINS = { crm_personnes: 'personnes', crm_organisations: 'organisations', crm_affaires: 'affaires' };`) et `:38-41` (le lien « Ouvrir la fiche » n'est posé que si `CHEMINS[ligne.collection]` existe) ; l'adresse d'un projet existe pourtant : `js/modules/projets/composants.js:5` (`cheminProjet = (id) => '#/projets/projets/${id}'`). Écran non rejoué.
- **Gravité proposée** : inchangée

### D-14 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : écriture réelle par le moteur du serveur (`executerEcritures`) de 3 documents avec des valeurs reçues connues (nom, e-mail, texte), puis lecture du journal avec la vraie `lireAudit`.
- **Preuve** : les 3 lignes `crm_audit` n'ont que `parametresRecus: ["nom","email","texte"]` (les noms) ; seule la copie de la première ligne (`pers_1`) garde `parametres` avec les valeurs, les copies 2 et 3 ont `null` ; `lireAudit` renvoie `contientCamille:false, contientTexte:false`. Côté écran, `lireCopieJournal` ne lit que `avant` et `apres` (`js/modules/crm/donnees.js:451-456`) ; aucune lecture de `parametres` dans `js/modules/crm/journal.js`, `donnees.js` ni `functions/src/coeur/lecture.js`.
- **Gravité proposée** : inchangée

### E-13 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : l'expression exacte de `definirSaisie` pour une case vidée, un texte et un nombre négatif ; lecture du gestionnaire `onchange`.
- **Preuve** : sortie `E-13 {"vide":0,"texte":0,"negatif":0,"valide":7}` ; `js/os/objectifs.js:134-138` (`Math.max(0, Number(valeurSaisie) || 0)`) et `:196-201` (`onchange: ... definirSaisie(o.id, mois, e.target.value)` sans confirmation). Le geste dans l'écran n'a pas été rejoué.
- **Gravité proposée** : inchangée

### E-15 · RÉSULTAT : CONFIRMÉ
- **Essai** : `essai-b.mjs` : un projet vivant dont la date de fin est dépassée (2026-10-01) et dont l'unique tâche n'a pas de date, évalué au 2026-10-08 avec `estProjetEnRetard` et `tachesPointsCles`.
- **Preuve** : sortie `E-15 {"enRetardParLaPastille":true,"pointsCles":{"enRetard":[],"aujourdhui":[]}}` : le projet est « en retard » (pastille rouge) mais absent des Points clés. L'accueil n'appelle que `tachesPointsCles` pour les projets (`js/modules/crm/accueil.js:126` et `:161`) ; `estProjetEnRetard` n'est utilisé que dans `js/modules/projets/projets.js:291`.
- **Gravité proposée** : inchangée

### G-03 · RÉSULTAT : CONFIRMÉ
- **Essai** : décompte de `waitForTimeout` dans `tests/e2e/*.js` et lecture de `tests/playwright.config.js`.
- **Preuve** : 12 occurrences, toutes dans `tests/e2e/projets.spec.js` (lignes 883, 1026, 1067, 1096, 1238, 1245, 1303, 1310, 1332, 1340, 1408, 1558) ; 0 dans `parcours.spec.js`, `controles.spec.js`, `outils.js` et `serveur.js`. Réglages : `tests/playwright.config.js:8` (`workers: 1`), `:9` (`retries: 0`), `:10` (`timeout: 90_000`), `:11` (`expect: { timeout: 10_000 }`).
- **Gravité proposée** : inchangée

### G-04 · RÉSULTAT : NON REPRODUIT
- **Essai** : `essai-g4.mjs` : la vraie fonction `fenetreCa` (celle qui fournit les mois du graphique, `js/modules/crm/logique.js:1197`) avec le début d'activité réglé à décembre 2026 et le mois courant à octobre 2026, puis avec une horloge plus ancienne (mars 2026).
- **Preuve** : `debut 2026-12, mois actuel 2026-10 -> ["2026-12"]` : le graphique n'est pas vide, il montre le mois de début (`fin = moisActuel < debut ? debut : moisActuel`), donc `every(m >= '2026-12')` (`tests/e2e/parcours.spec.js:677`) vérifie bien une valeur ; `debut 2026-10, mois actuel 2026-03 -> ["2026-10"]` : même avec une horloge ancienne, le premier test (`:49-51`) passerait. Les deux craintes du constat ne se vérifient pas sur la fonction ; les tests de parcours eux-mêmes n'ont pas été lancés (pas de navigateur).
- **Gravité proposée** : à baisser en MINEUR

### G-06 · RÉSULTAT : CONFIRMÉ
- **Essai** : lecture de `tests/playwright.config.js` et de `tests/e2e/serveur.js` ; pas de lancement (le port 5050 est utilisé par un autre agent).
- **Preuve** : `tests/playwright.config.js:15` (`baseURL: 'http://localhost:5050'`), `:24` (`url: 'http://localhost:5050/index.html'`), `:25` (`reuseExistingServer: false`) : l'adresse est écrite en dur et un serveur déjà présent n'est pas réutilisé ; `tests/e2e/serveur.js:8` accepte une variable `PORT` mais la configuration l'ignore. Le comportement face à un port occupé n'a pas été observé.
- **Gravité proposée** : inchangée

### H-09 · RÉSULTAT : NON TESTABLE ICI
- **Essai** : recherche des trois contrôles dans `docs/roadmap.md`, `docs/reprise-prochaine-session.md` et `docs/prototype-drive.md`. Savoir si les contrôles ont été faits demande la console Google, que je n'ai pas.
- **Preuve** : les documents annoncent les contrôles (`docs/reprise-prochaine-session.md:68` « À vérifier avec Jérôme le 04/10/2026 : la première sauvegarde quotidienne de Firestore apparaît dans la console ») sans en écrire le résultat ; seul `docs/audit-fonctionnel/80-point-projet.md` parle de leur absence. Que le contrôle ait été fait ou non dans la console reste inconnu.
- **Gravité proposée** : inchangée
