# Étape E : accueil, objectifs et statistiques (audit fonctionnel, version 2.3.3)

Statut : partiel (règles de calcul lues et rejouées par des essais purs ; aucun essai dans un navigateur ni sur les émulateurs, voir ci-dessous).

Périmètre : les chiffres de l'accueil sont-ils justes par rapport aux données ? Objectifs du mois (rendez-vous tenus, propositions envoyées, chiffre d'affaires encaissé, nouveaux contacts, interviews, saisies manuelles), Points clés (En retard, Aujourd'hui, Sans action prévue, tâches de projets), Statistiques (affaires par étape, graphique du chiffre d'affaires), célébrations, cas limites de dates.

Comment j'ai travaillé : lecture de `js/modules/crm/accueil.js`, `js/os/objectifs.js`, `js/os/celebrations.js`, des fonctions de statistiques, d'objectifs, de dates et de points clés de `js/modules/crm/logique.js`, des fonctions de factures, de retard et de tâches de `js/modules/projets/logique.js`, de `js/modules/crm/reglages.js`, `js/modules/crm/index.js`, `js/modules/projets/factures.js` et des docs (`cahier-des-charges-v2.0.md` 6.1 et 6.2, `projets-facturation-2-2-a.md` et `-b.md`, `projets-etape-4.md`, `crm-decisions-entretien.md`). Essais avec `node --test` et de petits scripts, tous dans le dossier hors dépôt `/tmp/claude-0/.../scratchpad/` (fichiers `essai-e1.test.mjs`, `essai-e2.test.mjs`, `essai-e3.test.mjs`, `essai-e4.test.mjs`, et `h/essai.mjs`, `h/essai2.mjs`, `h/essai3.mjs`), appelés « essai E1 », « essai E2 »… plus bas. Pour les célébrations, j'ai rejoué le vrai fichier `js/os/objectifs.js` (copie dont seules les lignes d'import sont remplacées par des faux modules Firebase), avec des données fabriquées. Les suites existantes `tests/logique.test.js` et `tests/projets.test.js` passent : 283 tests réussis, 0 échec (relancées dans la session). Aucune donnée réelle, aucun appel au MCP de production.

## Ce qui n'a pas été regardé
- Aucun essai dans un vrai navigateur (Playwright) ni sur les émulateurs Firebase. Tout ce qui dépend de l'écran (page laissée ouverte, ordre d'arrivée des données, animations des compteurs et des barres) est donc « PLAUSIBLE », ou « CONFIRMÉ » seulement au niveau de la règle ou de la fonction, et je le dis à chaque fois.
- L'ordre réel dans lequel Firestore livre les personnes, affaires, activités et projets au démarrage : non vérifié (il compte pour E-03).
- Les données réelles de Jérôme : je ne sais pas si la migration des étapes « Facture envoyée » / « Facture payée » est faite, ni si des encaissements d'avant la 2.2 existent (non vérifié). Idem pour le nombre réel de factures payées et leurs dates.
- Le serveur MCP : seulement le fait qu'il partage les mêmes fichiers de règles (`functions/partage/logique.js` et `projets.js` sont identiques à ceux de `js/`, vérifié avec `diff` : seule la ligne d'import de `projets.js` change). Ses outils ne sont pas examinés ici (autre étape).
- Les écrans de saisie des fiches (CRM, projets), le Kanban, les filtres, le journal et la restauration : autres étapes. Je n'ai relevé que ce qui change un chiffre de l'accueil.
- L'animation des barres et des compteurs (`animerCompteur`, `requestAnimationFrame`) : lue, pas observée.
- Le style (CSS), l'affichage téléphone, l'accessibilité, la sécurité.
- Les chiffres du serveur MCP éventuels (outils de statistiques) : non regardés.

## Constats

### E-01 · Une facture payée dont on efface la date de paiement disparaît du chiffre d'affaires
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E3b) ; le champ de date vidé depuis l'écran est lu dans le code, pas rejoué dans un navigateur
- **Ce qui se passe** : quand on modifie une facture déjà payée et qu'on vide sa date de paiement, l'appli l'accepte sans erreur et la garde au statut « Payée » avec une date vide. Le chiffre d'affaires de l'accueil (objectif et graphique) ne compte que les factures payées dont la date tombe dans un mois : celle-ci ne tombe dans aucun mois, elle n'est donc comptée nulle part.
- **Ce que ça change pour Jérôme** : la fiche du projet affiche « payé 1 000 € » alors que l'objectif « Chiffre d'affaires encaissé » et le graphique restent à 0 €, sans aucun message.
- **Où dans le code** : `js/modules/projets/logique.js:276` (la validation reçoit la date vide, et `validerFacture` ne la refuse que si elle est non vide, ligne 236) ; `js/modules/projets/logique.js:283` (la date vide est écrite telle quelle) ; `js/modules/crm/logique.js:1140` (`String(f.datePaiement || '').slice(0, 7) === mois` : une date vide ne vaut jamais un mois) ; `js/modules/projets/factures.js:58` (le champ de date de la fenêtre « Modifier » peut être vidé).
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` (« Marquer payée : date du paiement … » ; les factures payées comptent « dans le mois du paiement »).
- **Preuve** : essai E3b : facture de 1 000 € créée payée le 2026-10-10, puis `modifierFacture(p, id, { datePaiement: '' })` : aucune erreur, résultat `{"statut":"payee","datePaiement":""}` ; `P.totauxFactures` donne `paye: 1000` mais `CALCULS.ca_encaisse` donne 0 pour septembre, octobre et novembre 2026. Les tests B33 et B34 ne couvrent pas ce cas.

### E-02 · Une affaire Gagnée sans activité reste indéfiniment dans « Sans action prévue »
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai E5, règle) ; l'écran est lu dans le code
- **Ce qui se passe** : « Sans action prévue » liste toute affaire ouverte ou gagnée, non archivée, sans activité à faire. Depuis la 2.2, passer à Gagné n'archive plus l'affaire (elle reste dans la colonne Gagné jusqu'à ce que Jérôme l'archive), et le travail d'une affaire gagnée se suit dans les tâches du projet, pas dans des activités de l'affaire. Chaque affaire Gagnée apparaît donc dans « Sans action prévue » avec un bouton « Planifier », et fait grossir le compteur.
- **Ce que ça change pour Jérôme** : la liste « Sans action prévue » (et son nombre) se remplit d'affaires déjà gagnées qui n'ont rien à relancer, ce qui cache les vraies affaires oubliées.
- **Où dans le code** : `js/modules/crm/logique.js:1011-1013` (`estSansAction` : `estAffaireActive` et aucune activité à venir) ; `js/modules/crm/logique.js:703-705` (`estAffaireActive` accepte `gagnee`) ; `js/modules/crm/logique.js:1031` ; `js/modules/crm/accueil.js:181-185`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` section 4 point 7, ligne 178 (« affaire `ouverte` ou `gagnee` non archivée, sans aucune activité non faite »), écrite avant la 2.2 où une affaire « Facture payée » s'archivait toute seule (ligne 174) ; `docs/projets-facturation-2-2-b.md` (« Aucune étape de vente n'archive plus l'affaire »). Le même fichier note : « À décider : archiver automatiquement l'affaire quand son projet est clôturé ».
- **Preuve** : essai E5 : une affaire `{etape:'gagne', statut:'gagnee', archive:false}` sans activité sort dans `pointsCles(...).sansAction` (résultat `['ouverte_sans', 'gagnee_sans']`) ; la même affaire archivée n'y est pas. Le test B7 de `tests/logique.test.js:327` ne contient aucune affaire gagnée.

### E-03 · Un « Objectif atteint » peut se déclencher à chaque ouverture de l'appli (chiffre d'affaires venant des projets)
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai h/essai.mjs, scénario S1, avec un ordre d'arrivée des données simulé) ; l'ordre réel d'arrivée des données n'est pas vérifié
- **Ce qui se passe** : l'appli prend sa mesure de départ (pour savoir plus tard qu'un objectif « vient de franchir 100 % ») dès que les données du CRM sont prêtes. Elle n'attend pas les projets. Or le chiffre d'affaires encaissé dépend aussi des factures payées des projets. Si les projets arrivent après le CRM, la mesure de départ est sans les factures, puis le chiffre « monte » quand les projets arrivent, et l'appli croit que l'objectif vient d'être atteint.
- **Ce que ça change pour Jérôme** : à l'ouverture de l'appli, un feu d'artifice « Objectif atteint : Chiffre d'affaires encaissé » peut partir alors que rien n'a changé, chaque fois que les factures payées du mois dépassent la cible.
- **Où dans le code** : `js/modules/crm/index.js:50` (`enregistrerCalculs(calculs, { pret: D.estPret })` : seul le CRM est attendu) ; `js/modules/projets/donnees.js:20` (`estPret` des projets existe mais n'est pas utilisé ici) ; `js/os/objectifs.js:167-179` (`verifierFranchissements` : la première mesure devient la référence) ; `js/modules/crm/logique.js:1139-1143` (le calcul lit `projets`).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.1 point 4 (« Objectif atteint (passage sous puis au dessus de 100 % pendant la session) : célébration »).
- **Preuve** : essai h/essai.mjs S1 : CRM prêt, projets vides, 0 célébration ; puis un projet avec une facture payée de 1 200 € le mois courant arrive : `["Chiffre d'affaires encaissé"]` est célébré. Si les projets arrivent avant le CRM, le problème ne se produit pas : d'où la réserve sur l'ordre réel.

### E-04 · « Affaires par étape » ne compte pas les affaires restées dans une étape retirée ni celles sans étape
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essai E6, règle)
- **Ce qui se passe** : les barres ne sont faites que pour les quatre étapes actuelles. Une affaire encore dans « Facture envoyée » ou « Facture payée » (tant que la migration de la 2.2 n'est pas lancée dans Réglages) ou sans étape n'est dans aucune barre, et aucune ligne « autres » ne la signale. Le total des barres est donc plus petit que le nombre d'affaires.
- **Ce que ça change pour Jérôme** : des affaires disparaissent de la statistique sans le dire (si la migration n'a pas été faite : non vérifié).
- **Où dans le code** : `js/modules/crm/logique.js:1189-1191` (`ETAPES.map(... a.etape === e.id)`) ; `js/modules/crm/logique.js:32-35` (les étapes retirées restent lisibles ailleurs : `libelleEtape`, `statutPourEtape`) ; `js/modules/crm/accueil.js:192-206`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.2 point 4 (« nombre d'affaires par étape (barres), toutes affaires comprises ») ; `docs/projets-facturation-2-2-b.md` (les étapes disparaissent de l'Accueil « Affaires par étape » ; les affaires restantes sont migrées depuis Réglages).
- **Preuve** : essai E6 : 5 affaires (une en `facture_payee`, une en `facture_envoyee`, une sans `etape`, une perdue et une archivée en `gagne`) : barres `premier_contact=0 rdv_fixe=0 proposition_envoyee=0 gagne=2`, total des barres 2 sur 5 affaires. Aucun test ne couvre ce cas.

### E-05 · 99,5 % s'affiche « 100 % », objectif « atteint », célébration comprise
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (essais E4 et h/essai.mjs S4)
- **Ce qui se passe** : le pourcentage est arrondi (`Math.round`). À 995 € sur 1 000 € il vaut 100 %, la carte passe « atteinte » et le feu d'artifice peut partir. La valeur est aussi arrondie à l'euro à l'affichage : 999,60 € s'écrit « 1 000 € / 1 000 € · 100 % ».
- **Ce que ça change pour Jérôme** : l'objectif est annoncé atteint alors qu'il manque jusqu'à 0,5 % de la cible (5 € sur 1 000 €, 1 flyer sur 200 ou sur 300, etc.), et le graphique du chiffre d'affaires affiche des centimes que la carte des objectifs cache.
- **Où dans le code** : `js/os/objectifs.js:25-29` (`pourcentage`) ; `js/os/objectifs.js:245` (classe « atteint » dès `pct >= 100`) ; `js/os/objectifs.js:176` (célébration) ; `js/modules/crm/logique.js:1169-1173` (même formule dans `progression`) ; `js/os/objectifs.js:33-36` (valeur arrondie à l'euro, alors que `formatEuros` du graphique garde les centimes).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.1 (« passage sous puis au dessus de 100 % »).
- **Preuve** : essai E4 : `progression(995, 1000) = 100`, `progression(199, 200) = 100`, `progression(99, 100) = 99`. Essai h/essai3.mjs : `formatValeur(999.6, '€')` donne « 1 000 € » et `pourcentage(999.6, 1000)` donne 100, alors que `formatEuros(999.6)` donne « 999,60 € ».

### E-06 · Le chiffre d'affaires peut être compté deux fois (anciens encaissements d'affaire + factures de projet), sans moyen de le voir ni de le corriger
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle, essai E3c) ; le lien avec les vraies données de Jérôme n'est pas vérifié
- **Ce qui se passe** : le calcul additionne les `encaissements` des affaires et les factures payées des projets. Rien ne détecte qu'il s'agit du même argent. Les encaissements d'une affaire d'avant la 2.2 s'affichent en lecture seule et ne peuvent plus être modifiés ni supprimés depuis l'appli. La migration d'une affaire « Facture envoyée » avec projet et montant crée une facture « À payer » du montant total de l'affaire, sans tenir compte d'éventuels encaissements déjà présents sur l'affaire.
- **Ce que ça change pour Jérôme** : si un paiement d'avant la 2.2 est ressaisi comme facture payée sur le projet (ce qui est naturel, puisque la clôture du projet attend les factures), le mois est gonflé et il n'y a ni alerte ni bouton pour retirer l'ancien encaissement. Seule la consigne écrite dans la doc l'évite (« ne saisis pas deux fois le même argent »).
- **Où dans le code** : `js/modules/crm/logique.js:1136-1143` (somme des deux sources) ; `js/modules/crm/fiche-affaire.js:140-147` (encaissements en lecture seule) ; `js/modules/projets/logique.js:343-373` (migration sans contrôle des encaissements existants).
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` (« tant que la partie B n'est pas faite, ne saisis pas deux fois le même argent ») et `docs/projets-facturation-2-2-b.md` (« Ces encaissements comptent toujours dans le chiffre d'affaires du mois où ils ont eu lieu »). Le comportement « en plus » est voulu et testé (`tests/projets.test.js:1179`, B34) ; c'est l'absence de garde-fou qui est relevée.
- **Preuve** : essai E3c : un encaissement de 500 € (12/10) et une facture payée de 500 € (14/10) donnent 1 000 € pour octobre 2026.

### E-07 · Supprimer un projet fait baisser le chiffre d'affaires des mois passés, et la fenêtre de suppression n'en parle pas
- **Gravité** : GÊNANT
- **Confiance** : CONFIRMÉ (règle de suppression et de calcul, essai E3d) ; l'écran est lu dans le code
- **Ce qui se passe** : les factures vivent dans le projet. Supprimer le projet supprime ses factures, y compris les factures payées. Le chiffre d'affaires des mois déjà écoulés (objectif du mois choisi dans le sélecteur et barres du graphique) baisse alors du montant encaissé. La fenêtre de confirmation parle de « tâches, notes et événements », pas de factures ni de montant encaissé.
- **Ce que ça change pour Jérôme** : une suppression de projet qui semble anodine peut effacer de la statistique de l'argent bien réel et déjà encaissé. (Le journal permet de restaurer, d'après l'étape D : non revérifié ici.)
- **Où dans le code** : `js/modules/projets/logique.js:1013-1028` (`planSupprimerProjet` supprime le projet, donc son champ `factures`) ; `js/modules/projets/projets.js:119-132` (texte de la confirmation) ; `js/modules/crm/logique.js:1139-1143` (le calcul lit les projets existants). Même effet, plus clairement annoncé, en supprimant une facture payée : `js/modules/projets/factures.js:109-111`.
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` (les factures payées comptent « dans le mois du paiement » ; les paiements écrivent aussi un événement dans le fil du projet, supprimé avec le projet).
- **Preuve** : essai E3d : `planSupprimerProjet` pour un projet qui porte une facture payée de 500 € ne contient que `supprimer projets_projets` ; `ca_encaisse` des projets restants vaut 0.

### E-08 · Accueil laissé ouvert après minuit : le jour, les Points clés et le mois ne bougent pas
- **Gravité** : GÊNANT
- **Confiance** : PLAUSIBLE (lu dans le code, pas rejoué dans un navigateur) ; essai du 2026-10-08 : non testable ici (voir `09-confirmations.md`)
- **Ce qui se passe** : l'accueil ne se redessine que lorsqu'une donnée change. Aucun minuteur ni retour au premier plan ne le relance (les seuls `visibilitychange` et `focus` de l'appli ne vérifient que la version, `js/os/pwa.js:52-56`). Après minuit, la date du haut, les groupes « En retard » et « Aujourd'hui » et le mois des objectifs restent ceux de la veille. De plus, le mois affiché est retenu entre deux visites (`moisAffiche` est une variable de module), et le bouton « mois suivant » est désactivé d'après le mois du moment où la page a été dessinée : le 1er du mois, une page déjà ouverte continue de montrer les objectifs du mois fini comme s'ils étaient ceux du mois en cours.
- **Ce que ça change pour Jérôme** : une appli installée et rouverte le matin montre les « Aujourd'hui » d'hier tant qu'aucune donnée ne bouge, et le 1er du mois elle peut afficher les objectifs du mois précédent (le nom du mois est écrit, donc l'erreur est repérable mais non signalée).
- **Où dans le code** : `js/modules/crm/accueil.js:16` et `:19-20` (`moisAffiche`, `moisActuel` figés à chaque dessin) ; `:23` (jour figé) ; `:57` (« suivant » désactivé selon `moisActuel`) ; `:81` (seuls abonnements : données du CRM, des projets et objectifs) ; `js/modules/crm/donnees.js:62-70` (`aujourdhui` recalculé seulement quand on appelle `ctx()`, donc au prochain dessin).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.1 (calcul « mois civil, fuseau Europe/Paris ») et 6.2.
- **Preuve** : lecture du code (aucun `setInterval` autre que celui des célébrations : `grep setInterval js`). Les calculs eux-mêmes sont justes à la frontière (essai E1 : 31/10 23:30 UTC compte pour novembre, 30/09 22:30 UTC pour octobre, 25/10/2026 sans décalage d'un jour, 38 112 instants comparés entre `moisCourantParis` et `moisCourant`, 0 différence).

### E-09 · Modifier la cible d'un objectif déclenche la célébration « Objectif atteint »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai h/essai.mjs, scénario S2)
- **Ce qui se passe** : le pourcentage est recalculé à chaque changement des objectifs. Baisser une cible (de 4 à 2 rendez-vous, avec 3 faits) fait passer de 75 % à 150 %, et l'appli célèbre un objectif « atteint » alors qu'aucun rendez-vous n'a été fait.
- **Ce que ça change pour Jérôme** : un feu d'artifice injustifié quand il règle ses cibles dans Réglages.
- **Où dans le code** : `js/os/objectifs.js:90-95` (chaque changement de la collection d'objectifs appelle `notifier`) ; `js/os/objectifs.js:79-82` et `:167-179`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.1 point 4.
- **Preuve** : essai h/essai.mjs S2 : 3 rendez-vous sur une cible de 4, 0 célébration ; cible changée à 2 : `["Rendez vous tenus"]`.

### E-10 · Le premier objectif atteint après un changement de mois n'est pas célébré (page restée ouverte)
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai h/essai2.mjs, avec une horloge simulée)
- **Ce qui se passe** : la mesure de référence est rangée par mois. Quand le mois change pendant que la page est ouverte, les clés du nouveau mois n'existent pas dans la référence ; le premier changement de données du mois ne peut donc pas être vu comme un franchissement. Ne concerne que les petites cibles atteintes d'un seul coup (par exemple une cible de 1 passant de 0 à 1).
- **Ce que ça change pour Jérôme** : une célébration manquée de temps en temps, le 1er du mois, si l'appli est restée ouverte.
- **Où dans le code** : `js/os/objectifs.js:154-159` (`releve`, clés `objectif_mois`) ; `js/os/objectifs.js:174-177` (`if (avant && ...)`).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.1 point 4.
- **Preuve** : essai h/essai2.mjs : cible des rendez-vous réglée à 1, appli démarrée le 31/10 à 22 h (Paris), un rendez-vous fait le 1er novembre au matin : 0 célébration.

### E-11 · Supprimer une affaire fait baisser « Rendez vous tenus » et « Propositions envoyées » des mois passés
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (règle, essai E3 / E9)
- **Ce qui se passe** : ces deux objectifs sont recalculés à chaque fois à partir des données existantes. Supprimer une affaire supprime ses activités (rendez-vous faits compris) et ses dates d'étapes (proposition envoyée), donc les compteurs du mois concerné baissent. Archiver, marquer perdue ou mettre en pause ne les change pas (essai E2b).
- **Ce que ça change pour Jérôme** : l'historique de ses objectifs d'un mois fini peut changer après coup quand il fait du ménage.
- **Où dans le code** : `js/modules/crm/logique.js:1125` et `:1130` (calcul à la volée) ; `js/modules/crm/logique.js:1590-1601` (`planSupprimerAffaire` supprime les éléments liés).
- **Règle ou décision concernée** : aucune règle écrite sur ce point (à décider).
- **Preuve** : essai E9 : une affaire avec une proposition envoyée le 05/10 et un rendez-vous fait le 06/10 : octobre vaut `[1, 1]` avant la suppression, `[0, 0]` après.

### E-12 · Une date de paiement impossible ou lointaine est acceptée et la facture n'apparaît nulle part
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai E10)
- **Ce qui se passe** : la date de paiement est seulement vérifiée sur la forme. `2026-02-31` est accepté, `2099-01-01` aussi. Le graphique s'arrête au mois courant, et l'objectif ne regarde que le mois choisi : une facture « payée » datée de 2099 ne figure donc dans aucun chiffre visible ; une date du 31 février est comptée en février.
- **Ce que ça change pour Jérôme** : une faute de frappe sur l'année fait sortir l'argent des chiffres sans message.
- **Où dans le code** : `js/modules/projets/logique.js:51` (`estJour`), `:236` (`validerFacture`), `:290-299` (`marquerFacturePayee`).
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` (« Marquer payée : date du paiement … »).
- **Preuve** : essai E10 : `validerFacture({montant: 10, datePaiement: '2099-01-01'})` et `'2026-02-31'` renvoient `{}` (aucune erreur).

### E-13 · Vider la case d'une saisie manuelle remet le compteur à zéro sans prévenir
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (la formule est vérifiée ; l'événement de l'écran n'est pas rejoué)
- **Ce qui se passe** : le champ « saisie directe » d'un objectif manuel enregistre dès qu'on le quitte. Un champ vidé, un texte ou un nombre négatif donnent 0.
- **Ce que ça change pour Jérôme** : un clic maladroit dans la case des flyers distribués efface le total du mois.
- **Où dans le code** : `js/os/objectifs.js:134-138` (`Math.max(0, Number(valeurSaisie) || 0)`) ; `js/os/objectifs.js:196-201` (`onchange`).
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.1 (objectif manuel : « boutons +1, +10 et saisie directe »).
- **Preuve** : essai h/essai3.mjs : `Math.max(0, Number('') || 0)`, `Number('abc')` et `Number('-5')` donnent tous 0.

### E-14 · « Affaires par étape » compte aussi les affaires perdues, en pause et archivées
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai E6)
- **Ce qui se passe** : une affaire perdue ou archivée garde sa dernière étape et reste comptée dans sa barre (c'est écrit dans la spec, « toutes affaires comprises »), mais le titre de la zone ne le dit pas : la barre « Gagné » additionne les affaires gagnées en cours, archivées et perdues après l'étape Gagné.
- **Ce que ça change pour Jérôme** : les barres ne se comparent pas au Kanban (qui cache archivées et sorties).
- **Où dans le code** : `js/modules/crm/logique.js:1189-1191` ; `js/modules/crm/accueil.js:204`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.2 point 4 et 4 (une affaire perdue « conserve la dernière étape atteinte »).
- **Preuve** : essai E6 : une affaire perdue et une affaire archivée à l'étape `gagne` donnent `gagne=2`.

### E-15 · Un projet « en retard » à cause de sa date de fin n'apparaît pas dans les Points clés
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai du 2026-10-08, voir `09-confirmations.md`) ; avant : PLAUSIBLE (lecture du code)
- **Ce qui se passe** : un projet vivant dont la date de fin est dépassée reçoit une pastille rouge (« en retard »), mais les Points clés ne montrent que les tâches datées. Un projet sans tâche en retard n'y figure donc pas.
- **Ce que ça change pour Jérôme** : la pastille rouge de la liste Projets et la page d'accueil ne disent pas la même chose.
- **Où dans le code** : `js/modules/projets/logique.js:391-395` (`estProjetEnRetard` : `projet.dateFin < aujourdhui`) ; `js/modules/projets/logique.js:517-523` (`tachesPointsCles`, seulement les tâches).
- **Règle ou décision concernée** : `docs/projets-etape-4.md` (seules les tâches datées remontent dans l'Accueil).
- **Preuve** : lecture des deux fonctions ; non rejoué.

### E-16 · Une affaire dont le réveil est dépassé depuis longtemps est rangée dans « Aujourd'hui »
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (essai E5)
- **Ce qui se passe** : une affaire en pause dont la date de réveil est passée (par exemple depuis un mois) est affichée dans « Aujourd'hui » avec « Reprendre contact », et non dans « En retard ». Le compteur « En retard » ne la compte pas.
- **Ce que ça change pour Jérôme** : un réveil oublié depuis des semaines n'est pas signalé comme en retard.
- **Où dans le code** : `js/modules/crm/logique.js:1015-1017` (`estAReveiller` : `dateReveil <= aujourdhui`) ; `js/modules/crm/accueil.js:166-167`, `:172-179`.
- **Règle ou décision concernée** : `docs/cahier-des-charges-v2.0.md` 6.2 point 2 (« affaires en pause dont la date de réveil est atteinte » rangées sous Aujourd'hui) : conforme à la lettre, mais sans distinction du retard.
- **Preuve** : essai E5 : `reveils = ['pause_reveil', 'pause_reveil_vieux']` (réveils du 08/10 et du 01/09, au 08/10/2026), `enRetard` ne contient ni l'un ni l'autre.

### E-17 · Le cahier des charges 2.0 décrit encore l'ancien calcul du chiffre d'affaires et de l'accueil
- **Gravité** : MINEUR
- **Confiance** : CONFIRMÉ (comparaison du texte et des tests B34)
- **Ce qui se passe** : la ligne 204 dit « somme des `encaissements.montant` datés du mois, sur toutes les affaires » ; le code additionne aussi les factures payées des projets. D'autres passages parlent encore de six étapes de vente, de « Facture payée » qui archive l'affaire (ligne 174) et d'une suggestion « vers Facture envoyée » (ligne 182).
- **Ce que ça change pour Jérôme** : quelqu'un qui relit le cahier pour comprendre un chiffre de l'accueil est induit en erreur.
- **Où dans le code** : `docs/cahier-des-charges-v2.0.md:204`, `:174`, `:182` ; le code correct : `js/modules/crm/logique.js:1132-1143`.
- **Règle ou décision concernée** : `docs/projets-facturation-2-2-a.md` et `-b.md` (ils décrivent le nouveau comportement).
- **Preuve** : `tests/projets.test.js:1173` (B34, les factures payées comptent) contre la ligne 204 du cahier.

## Vérifié et conforme
- Mois et fuseau : les mois sont comptés à Paris. Un instant du 31/10 à 23 h 30 UTC compte pour novembre, du 30/09 à 22 h 30 UTC pour octobre ; le passage à l'heure d'hiver du 25/10/2026 ne décale pas le jour ; le 28 février 2027 est suivi du 1er mars, 2028 a un 29 février ; décembre vers janvier et janvier vers décembre sont justes (essai E1). `moisCourantParis` (objectifs) et `moisCourant` (CRM) donnent le même résultat sur 38 112 instants, de 2026 à début 2028.
- Rendez-vous tenus : comptés dans le mois où on clique « Fait » (date de réalisation, `dateFait`), pas dans le mois prévu ; un rendez-vous fait à 00 h 30 le 1er novembre compte pour novembre ; un rendez-vous « fait » sans `dateFait` n'est compté nulle part (cas non créé par l'appli : les chemins écran et MCP posent tous deux `dateFait`).
- Propositions envoyées : première date d'entrée dans l'étape gardée ; revenir en arrière puis repasser en novembre ne recompte pas ; une affaire perdue ou archivée reste comptée (essai E2b).
- Chiffre d'affaires encaissé : seules les factures payées comptent ; les factures à payer et abandonnées ne comptent jamais ; le mois est celui de la date de paiement (31/10 compte pour octobre, 01/11 pour novembre) ; le montant 0 ne change rien ; une facture remise à payer retire son montant du chiffre ; une affaire sans montant n'a pas d'effet (essai E3).
- Points clés : les activités des affaires perdues, en pause ou archivées sont ignorées ; les activités faites n'y sont pas ; les affaires en pause avant leur réveil et les archivées ne sont pas dans « Sans action prévue » ; les tâches de projets comptent seulement si elles sont datées, non faites et d'un projet actif (ni en pause, ni terminé, ni archivé) ; les tâches sans date n'y sont jamais (conforme à `docs/projets-etape-4.md`) (essais E5 et E5b).
- Pourcentages : cible 0 ou absente ou négative ne provoque pas de division par zéro (0 % ou 100 %) ; plus de 100 % s'affiche tel quel, la barre est plafonnée à 100 % ; la cible saisie dans Réglages vaut au minimum 1 (`js/os/objectifs.js:283-284`).
- Graphique du chiffre d'affaires : octobre 2026 un seul mois, puis jusqu'à six mois, fenêtre glissante à partir d'avril 2027, début invalide ramené au mois courant, passage d'une année à l'autre juste (essai E7).
- Célébrations : une seule à la fois (file `enFile`) ; la célébration de paiement ne part que si le chiffre du mois courant augmente réellement (`js/modules/projets/factures.js:48-50`) ; « Tout est fait » ne part que lorsque le nombre d'éléments restants passe de plus de zéro à zéro (`js/modules/crm/accueil.js:130-134`, `:145-149`).
- Les fichiers de règles du serveur MCP (`functions/partage/logique.js` et `projets.js`) sont des copies identiques de ceux de l'appli ; les chiffres de l'accueil et ceux que le serveur pourrait calculer ont donc la même règle.
- Tests existants relancés : `tests/logique.test.js` et `tests/projets.test.js`, 283 réussis sur 283.

## Remarques de sécurité vues en passant
Aucune.
