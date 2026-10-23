# Module Tableau de bord : la porte des scripts GitHub (étape 3 du chantier)

> **Depuis le 23/10/2026, ce module s'affiche « Maintenance »** (identifiant, routes, tables et fonctions inchangés), en **un seul écran** sans onglets : phrase d'état, « À traiter en premier », « Tous les indicateurs » par famille (blocs repliables, bouton « Filtres »), « Historique des saisies » replié en bas. Les adresses `technique`, `finance`, `stocks` et `historique` ouvrent le même écran. Le nom « Tableau de bord » est réservé au futur module d'analyse des indicateurs (voir `docs/tables.md`).

> **État au 2026-10-17 : code et tests écrits, rien déployé.** Conception complète : fiche « Module Tableau de bord - conception » du second cerveau (modèle d'un indicateur, historique, objectifs mois par mois, rafraîchissement, traçabilité).

## 1. À quoi ça sert
Les scripts GitHub du dépôt `interne-sauvegardes` (surveillance des clés, plus tard celle des sauvegardes) **écrivent leurs relevés dans la base de Chevalier IAOS**. L'écran « Tableau de bord » les lira (étape suivante). Aucun identifiant Google n'est donné à GitHub : il n'a qu'**une clé**, révocable, qui ne sait faire que deux choses.

```
script GitHub ──(clé cle-tdb.interne.…)──▶ POST https://chevalier-ia-os.web.app/tableau-de-bord ──▶ fonction « tableaudebord » (Paris, compte porte-serveur)
                                                    1. la clé existe, est active, est d'usage « tableaudebord » ?
                                                    2. plafond de 120 requêtes par minute et par clé
                                                    3. action connue ? données valides, sans rien qui ressemble à un secret ?
                                                    4. écriture dans tableaudebord_indicateurs ou tableaudebord_releves, jamais ailleurs
```

## 2. Les deux actions
| Action | Ce qu'elle fait |
|---|---|
| `indicateurs.ecrire` | Écrit la **situation actuelle** de 1 à 100 indicateurs (un document par indicateur, mis à jour à chaque relevé ; les champs absents sont remis à `null`). |
| `releves.ajouter` | Ajoute 1 à 200 **points d'historique** (identifiant `<indicateur>_<date>`, créé seulement s'il n'existe pas : un appel répété ne change rien). Chaque point garde l'objectif en vigueur ce mois-là. |

Le propriétaire (`interne`) et l'auteur (`github:<identifiant court de la clé>`) viennent de la clé, jamais du corps de la requête. Aucune suppression n'existe. Un texte (nom, message…) qui ressemble à une clé ou à un secret est refusé.

## 3. Ce qui est dans le code
- `scripts/porte/cles-tableau.js` : clés `cle-tdb.<propriétaire>.<43 caractères>` (une clé n8n n'ouvre pas cette porte, et inversement).
- `scripts/porte/actions-tableaudebord.js`, `porte-tableau.js` : les actions et les contrôles. `functions/src/tableaudebord.js` : l'assemblage Firestore, la fonction `tableaudebord` dans `functions/src/index.js`, la réécriture `/tableau-de-bord` dans `firebase.json`.
- `scripts/cles.js creer … --usage tableaudebord` : crée la clé (3 clés actives au plus **par usage**).
- `firestore.rules` : les trois collections `tableaudebord_*` sont **lisibles** par tes deux comptes et **jamais modifiables depuis un navigateur**.
- Tests : `tests/tableaudebord.test.js` (27 + 5 cas), règles ajoutées à `tests/regles.test.js` et `tests/statique.test.js`.

## 4. Mise en service, dans l'ordre (à faire par Jérôme)
1. **Publier les règles Firestore** (elles ne se déploient pas avec la fusion) : copier le texte de `firestore.rules` dans https://console.firebase.google.com/project/chevalier-ia-os/firestore/rules puis **Publier**. Le seul ajout : le bloc `tableaudebord_*` (lecture seule).
2. **Fusionner la PR** : le workflow déploie la fonction `tableaudebord`, puis Hosting (la réécriture `/tableau-de-bord`). Contrôle : `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://chevalier-ia-os.web.app/tableau-de-bord` doit répondre `401`.
3. **Créer la clé** (Terminal du Mac, comme pour la porte n8n ; elle est copiée dans le presse-papiers, jamais affichée) :
   ```bash
   node scripts/cles.js creer --projet crm --proprietaire interne --usage tableaudebord --ecrire
   ```
4. **La coller dans GitHub** tout de suite, sans rien copier d'autre avant :
   ```bash
   pbpaste | gh secret set CLE_TABLEAU_DE_BORD --repo jeromechevalier-wq/interne-sauvegardes
   ```
5. **Essai** : lancer à la main le workflow `interne-surveillance-cles` (GitHub › Actions), puis ouvrir la collection `tableaudebord_indicateurs` dans https://console.firebase.google.com/project/chevalier-ia-os/firestore/data : une ligne par clé surveillée.

## 5. Couper l'accès
Révoquer la clé (`node scripts/cles.js revoquer --projet crm --proprietaire interne --cle <identifiant court> --ecrire`, effet immédiat) ou supprimer la fonction (`firebase functions:delete tableaudebord --project chevalier-ia-os`). L'écran et le reste du CRM ne dépendent pas de cette porte.

## 6. Pas testé avec le vrai système
Les tests tournent en mémoire (faux Firestore). Les règles Firestore (émulateur), le déploiement et l'appel réel depuis GitHub n'ont pas pu être essayés dans la session de construction (pas de Java pour l'émulateur) : l'essai du point 5 les vérifie.

## 7. Saisie d'une date ou d'une valeur à l'écran (fonction `tableaudebordSaisir`)
Pour un indicateur de méthode `manuel` ou `semi`, l'écran montre « Saisir la date » (état) ou « Saisir la valeur » (mesure). L'écran n'écrit jamais dans la base : il appelle la fonction `tableaudebordSaisir` (`functions/src/tableaudebord-saisie.js`, logique pure dans `scripts/porte/saisie-tableaudebord.js`), qui contrôle l'appelant (mêmes comptes que `veille`), la forme de la demande, la méthode de l'indicateur et le type de donnée, calcule le niveau (vert à 30 jours ou plus, orange à moins de 30 jours, rouge si dépassée), puis écrit **en un seul lot atomique** l'indicateur (`echeance` ou `valeur`, `niveau`, `message` = « Saisi par <adresse> », `saisiPar`, `saisiLe`, `perimeApresMinutes` = 100 jours) ET une ligne de `tableaudebord_releves` (`saisie: true`, `avant`, `commentaire`). Elle est déclarée dans `functions/src/index.js` (région Paris, compte `porte-serveur`) : **à déployer avec la fusion**, rien d'autre à créer.
- **Le script quotidien n'écrase pas une saisie** : si l'indicateur porte `saisiPar` et que le script l'envoie en `manuel` ou `semi`, il est ignoré (compté dans `ignores`). Un indicateur `auto` est toujours réécrit, et perd alors sa trace de saisie. Les champs `saisie`, `saisiPar`, `saisiLe` sont refusés à un script.
- **100 jours** (choix) : passé ce délai sans nouvelle saisie, l'indicateur passe en gris « Relevé trop ancien », même si l'échéance saisie est lointaine.
- Le bloc replié « Historique des saisies » (`#/tableaudebord/historique` l'ouvre et y descend) liste les 200 dernières saisies : date et heure, adresse, indicateur, « avant → après », note.
