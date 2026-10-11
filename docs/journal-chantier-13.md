# Journal du chantier 13 (outil « nouveau client » et outil de remise / suppression)

Branche `plateforme-chantier-13`. À lire en premier si la session est coupée.

## Fait
- `scripts/plateforme/` : paquet à part (firebase-admin + @google-cloud/storage, versions figées, `package-lock.json`), jamais publié avec le site ni avec les fonctions.
- `scripts/nouveau-client.js` (création, mise à jour, afficher, membres, rôles, modules, désactiver / réactiver un client). Simule par défaut, `--ecrire` pour écrire.
- `scripts/donnees-client.js` (`exporter`, `supprimer`). La suppression simule par défaut, exige un export à jour (comparaison document par document) et la saisie de l'identifiant.
- `tests/outil-client.test.js` : 18 tests sur émulateurs Firestore + Storage, lecture par les vraies règles ; ajouté à `npm test` (`test:outil-client`).
- Prérequis des tests : `npm run installer-outils` (une fois, comme `installer-fonctions`), puis `npm run test:outil-client`.

## Reste
- Documentation `docs/nouveau-client.md`, mise à jour de `docs/etude-reutilisation-coque.md` (section chantier 13 + feuille de route).
- Suite complète, relecture du diff, PR « prête ».

## Prochaine commande
```
export JAVA_HOME=$HOME/.local/jdk-21/Contents/Home PATH=$JAVA_HOME/bin:$PATH
cd tests && npm run test:outil-client     # puis npm test
```

## Décisions prises seul
- Outil placé dans `scripts/plateforme/` avec son propre `package.json` : `@google-cloud/storage` n'est pas installé avec `functions/` (dépendance facultative non résolue) et on ne touche pas aux dépendances déployées.
- Projet par défaut `chevalier-ia-app` ; le projet `chevalier-ia-os` (CRM) est toujours refusé. Stockage par défaut `<projet>.firebasestorage.app`, modifiable par `--bucket`.
- Adresses e-mail en majuscules REFUSÉES (message qui donne la version en minuscules), pas corrigées en silence.
- Images : png, jpg, webp, gif (pas de svg, public), 2 Mo au plus, contenu vérifié (pas seulement l'extension). Elles sont enregistrées dans la fiche de marque sous forme d'adresse https publique (`firebasestorage.googleapis.com/…?alt=media`), car la page n'accepte que des adresses https.
- Fichier d'export refusé s'il est dans le dossier du projet (le site publie « . » : risque de publier des données de client) ; défaut `~/Documents/sauvegardes-clients/`.
- Suppression : l'export doit couvrir exactement l'existant (même liste de documents, même date de dernière modification), sinon refus ; reprise possible après une coupure en refaisant un export.
- Mot de passe / jeton : jamais lus ; connexion par les identifiants de l'ordinateur (`gcloud auth application-default login`).
- Aucune écriture dans une vraie base : tous les tests tournent sur l'émulateur ; les commandes d'essai en ligne de commande sont faites avec `--hors-ligne` ou refusées avant toute lecture.
