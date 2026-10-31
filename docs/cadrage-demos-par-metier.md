# Cadrage : des jeux de démonstration par métier

Écrit le 31/10/2026 (**document de cadrage, aucun code, rien n'est lancé, aucune donnée touchée**). Jérôme n'a **pas encore décidé** s'il en veut : ce document aide à décider. Les choix que j'ai faits seul sont marqués **Décision prise seule**. Tout est inventé (aucun nom réel, aucune donnée de client : le dépôt est public).

## 0. Le problème en 5 lignes

1. Pour montrer le logiciel à un artisan, il faut un espace **plein et crédible pour son métier** : un plombier veut voir « receveur de douche », « siphon », pas « plaque de plâtre ».
2. Aujourd'hui il n'existe qu'**un seul jeu** : un petit catalogue fictif de 15 articles (plâtrerie, carrelage, peinture) ou la copie du catalogue réel de Jérôme.
3. Copier le catalogue réel montre les prix d'un vrai commerce à un prospect : mauvais pour la confidentialité (l'option `--masquer-prix-achat` limite le dégât, sans le supprimer).
4. Le vocabulaire (mots appris) et le « mot du métier » (ouvrage, ensemble, forfait…) ne sont jamais remplis par la démo : le prospect ne voit pas ce qui fait la force du logiciel.
5. Question centrale : combien de métiers, quel contenu minimal, comment charger et effacer sans jamais toucher un vrai client.

## 1. Ce qui existe déjà (vérifié par `grep` le 31/10/2026)

| Sujet | Où | Ce que ça fait |
|---|---|---|
| Outil de démo | `scripts/donnees-demo.js` lance `scripts/plateforme/donnees-demo.js` (602 lignes) | remplit un client de la plateforme : 15 organisations, 20 personnes, 19 affaires, 15 devis (3 par statut), 2 projets par phase ; mode d'emploi : `docs/donnees-demo.md` |
| Catalogue fictif | `CATALOGUE_EXEMPLE`, `donnees-demo.js:71` (15 articles `demo-f01`…, prix inventés) | utilisé par `--catalogue-exemple` et par les tests |
| Catalogue réel | option `--catalogue-depuis chevalier-ia-os` (`donnees-demo.js:373` `ouvrirSource`, lecture seule) | copie le catalogue de Jérôme chez le client démo |
| Marqueur | `MARQUEUR = 'donneesDemo'` (`donnees-demo.js:33`) | chaque document créé le porte ; `--retirer` ne supprime que ceux-là |
| Collections écrites | `COLLECTIONS_DEMO` (`donnees-demo.js:36`) : `crm_*` (organisations, personnes, affaires, activités, notes, événements), `projets_projets`, `projets_taches`, `devis_articles`, `devis_parametres`, `devis_devis` | **`devis_vocabulaire` n'y est pas** : la démo ne crée aucun mot appris, et `--retirer` n'en retirerait aucun |
| Garde-fous | `PROJETS_INTERDITS = ['chevalier-ia-os']` (`commun.js:14`), refus si le client a déjà des données (`COLLECTIONS_PLEINES`, `donnees-demo.js:41`), simulation par défaut | la démo ne peut viser que le projet des clients, jamais la base de Jérôme |
| Familles de départ | `js/modules/devis/familles.js:10-18` | la famille « Main d'œuvre » a déjà les sous-familles Maçon, Carreleur, Étancheur, Plaquiste, Peintre, Menuisier, Plombier, Électricien ; « Matériels » et « Fournitures » ont leurs sous-familles de plomberie et d'électricité |
| Mot du métier | `MOTS_OUVRAGE`, `js/modules/devis/ouvrages.js:21` : ouvrage, ensemble, forfait, prestation, lot, plus « Autre » ; stocké dans `devis_parametres/reglages` (`motOuvrage`, `motOuvrageAutre`) | réglage livré (PR 422 et 432) |
| Vocabulaire | collection `devis_vocabulaire` ; états `a_confirmer`, `active`, `desactivee`, champs `valideLe`, `validePar`, `revoirLe` (`vocabulaire-plans.js:14`) | écran « Vocabulaire » livré ; un mot est actif après 2 confirmations sur 2 jours séparés |
| Tests | `tests/donnees-demo.test.js` (émulateur, catalogue fictif seulement) | `npm run test:module donnees-demo` |
| Client démo | `https://chevalier-ia-app.web.app/espace/clientdemo` (Réglages > Déploiement) | un seul client démo existe ; l'outil travaille sur **un client à la fois** |

**Ce qui n'existe pas** : aucun catalogue par métier, aucun choix de métier dans l'outil, aucune démo du vocabulaire, aucun réglage du mot du métier posé par la démo, aucun drapeau « client de démonstration » sur la fiche d'un client (rien n'empêche techniquement de lancer l'outil sur un vrai client vide ; le garde-fou actuel est « le client doit être vide »).

## 2. Les options

**A. Ne rien changer** (un seul jeu général). Zéro travail. Le prospect d'un autre métier voit des articles qui ne le concernent pas. Le catalogue réel de Jérôme reste la seule façon d'avoir du « vrai ».

**B. Trois jeux métier** (recommandé) : plombier, électricien, maçon. Ce sont les trois sous-familles « Main d'œuvre » déjà prévues ; ils couvrent la plupart des démonstrations. Chaque jeu est un fichier de données fictives, relu comme du code.

**C. Six jeux ou plus** (plus étancheur, carreleur, peintre…). Trop de contenu à inventer et à tenir à jour avant d'avoir un seul prospect de ces métiers. À reporter jusqu'à une vraie demande.

**D. Un jeu par prospect, fabriqué à la demande** (Claude invente le jeu la veille de la démonstration). Plus crédible, mais personne ne relit, et un jeu écrit pour un prospect précis risque de contenir des détails réels (dépôt public). Écarté.

**Recommandation : B**, en commençant par **un seul métier (plombier)** pour juger le format avant d'écrire les deux autres. **Décision prise seule** : les contenus ci-dessous sont des exemples de format, pas des tarifs de métier ; Jérôme ou un artisan relit les libellés avant usage.

## 3. Le contenu minimal crédible d'un jeu

Pour que le prospect se dise « c'est mon métier » sans que ce soit trop long à écrire :

| Élément | Minimum | Exemple (plombier, chiffres ronds à 100 €) |
|---|---|---|
| Articles | 25, dans 4 familles (fournitures, main d'œuvre, ouvrages, divers) | « Receveur de douche 90 x 90 » acheté 100 € ; « Bonde de douche » ; « Joint silicone » ; « Heure plombier » |
| Ouvrages (le mot du métier) | 3, avec leur composition | « Remplacement de receveur » = receveur + bonde + joint + évacuation des déchets, vendu 100 € les trois pour l'exemple chiffré du cadrage |
| Devis | 3 « vedettes » écrits à la main (un brouillon, un envoyé, un signé), les autres produits par le tirage existant | « Salle de bain complète » avec 3 sections |
| Mots appris | 6 : 4 validés, 1 à confirmer, 1 désactivé | « receveur » → l'article receveur, validé ; « joint » → deux articles au choix, à confirmer |
| Mot du métier | 1 réglage | plombier : « ensemble » ; électricien : « forfait » ; maçon : « lot » (**Décision prise seule**, à corriger) |
| Réglages | « Mon entreprise » fictive (déjà faite), marge et TVA | marge de départ 25 %, TVA 10 % (logement) et 20 % |
| Personnes, organisations, affaires | déjà produites par le tirage existant | rien à ajouter |

Règles de rédaction : aucune marque réelle, aucun fournisseur réel, aucun prix relevé chez un vrai commerce (des prix inventés et arrondis), un seul exemple chiffré à 100 € (règle de Jérôme du 30/10/2026). Les libellés sont du français courant, sans le mot « CRM » ni « cible ».

## 4. Comment les charger sans toucher un vrai client

1. **Même outil, une option de plus** : `--metier plombier` à la place de `--catalogue-exemple` (les trois options s'excluent). Le reste est inchangé : simulation d'abord, `--ecrire` ensuite.
2. **Un client démo, un métier à la fois** : pour changer de métier, `--retirer --ecrire` puis un nouveau chargement. L'outil travaille déjà sur un seul client à la fois. Alternative écartée pour l'instant : un client par métier (3 clients à créer, à déployer, à garder à jour).
3. **Nouveau garde-fou recommandé** : une marque `demo: true` sur la fiche `clients/<identifiant>`, posée par `nouveau-client.js` (option `--demo`), et l'outil refuse tout client qui ne la porte pas. Aujourd'hui seul le « client vide » protège un vrai client ; un client réel créé mais pas encore rempli pourrait recevoir la démo par erreur.
4. **Le vocabulaire** : `devis_vocabulaire` entre dans `COLLECTIONS_DEMO`, chaque mot porte `donneesDemo: true`, avec `valideLe`, `validePar: 'humain'`, `revoirLe` (jeu de mots validés) et un mot `a_confirmer`. Écrit par le script (compte de service) : **aucune règle Firestore à changer** (`devis_vocabulaire` interdit la suppression au navigateur, `firestore.rules:157`, ce qui n'arrête pas l'outil d'administration).
5. **Le mot du métier** : posé dans `devis_parametres/reglages` seulement si le client n'a pas de réglages (même règle que « Mon entreprise » aujourd'hui, `docs/donnees-demo.md`, « Limites à connaître »). Il porte le marqueur : `--retirer` le supprime, le client retrouve « ouvrage ».
6. **Effacement** : celui d'aujourd'hui (marqueur `donneesDemo`, rien d'autre), étendu au vocabulaire. Les journaux d'audit écrits par le serveur ne sont jamais effacés (règle de Jérôme), même ici.
7. **Parité Jérôme / clients** : l'outil est un **outil d'administration**, pas une fonction du logiciel ; il vise le projet des clients seulement, et refuse la base de Jérôme (`PROJETS_INTERDITS`). Le code qui construit les devis est commun (`js/modules/devis/logique.js`). **Décision prise seule** : pas de chargement de démo dans la base de Jérôme (ses données sont réelles) ; Jérôme voit le résultat en ouvrant le client démo. Les jeux métier sont des fichiers de données, ce qui ne crée aucune fonctionnalité réservée aux clients.

## 5. Risques

| Risque | Parade |
|---|---|
| Des détails réels dans un jeu public (prix, marque, fournisseur) | prix inventés et arrondis, relecture, test qui cherche des noms de marque connus dans les jeux |
| La démo écrase des données d'un vrai client | marque `demo: true` obligatoire (point 3), refus si le client n'est pas vide, simulation par défaut |
| Un mot appris laissé par la démo pollue un client qui devient réel | le marqueur est sur chaque mot ; `--retirer` les supprime ; documenter « on ne transforme jamais un client démo en client réel : on en crée un nouveau » |
| Les jeux vieillissent quand le logiciel change (nouveau champ d'article) | le test construit chaque jeu avec les vraies fonctions (`ligneDepuisArticle`, `nouveauDevis`) : un champ oublié fait échouer le test |
| Trop de travail avant le premier prospect | commencer par un seul métier, juger, puis les deux autres |

## 6. Découpage en PR (petites, une par sujet)

| # | PR | Contenu | Taille | Fable | Liste d'arrêt |
|---|---|---|---|---|---|
| 1 | Jeu « plombier » et option `--metier` | un fichier de données, lecture par l'outil, tests sur l'émulateur | M | Oui (écrit des données, même fictives) | non |
| 2 | Vocabulaire et mot du métier dans la démo | `devis_vocabulaire` dans `COLLECTIONS_DEMO`, mots avec marqueur, retrait ; tests de retrait | M | Oui | non (aucune règle changée) |
| 3 | Garde-fou `demo: true` | `nouveau-client.js --demo`, refus de l'outil sur un client sans la marque ; **ne modifie aucune donnée existante** (les clients actuels n'ont pas la marque : Jérôme la pose sur le client démo à la main, commande donnée en détail) | S | Oui | non, mais une action de Jérôme sur le client démo |
| 4 | Jeux « électricien » et « maçon » | deux fichiers, mêmes tests | M | Oui | non |
| 5 | Docs | `docs/donnees-demo.md` et captures du client démo : **dans la PR de code du même sujet**, pas à part | — | non requise | non |

Aucune de ces PR ne touche les règles Firestore, le serveur MCP ni un déploiement. Chaque chargement réel est lancé par **Jérôme** dans son Terminal (comme aujourd'hui).

## 7. Questions pour Jérôme (5)

1. **Veux-tu des démos par métier ?** Réponse recommandée : oui, mais un seul métier (plombier) d'abord, pour juger le format.
2. **Quels métiers dans l'ordre ?** Recommandé : plombier, électricien, maçon (déjà dans les familles).
3. **Qui relit les libellés et les prix inventés ?** Recommandé : toi, avec un artisan de confiance si tu en as un, sur un tableau de 25 lignes (le dépôt est public, donc rien de réel).
4. **Un client démo qu'on vide et recharge, ou un client par métier ?** Recommandé : un seul client démo (moins à déployer).
5. **Pose-t-on la marque `demo: true` sur le client démo ?** Recommandé : oui, c'est la seule vraie protection d'un vrai client.

## 8. Ce qui n'est PAS fait

Aucun jeu écrit, aucune option ajoutée, aucun lancement, aucune donnée lue ou écrite chez un client ou chez Jérôme, aucune règle, aucun déploiement. Les noms d'articles de la section 3 sont des exemples de format, pas un catalogue validé.
