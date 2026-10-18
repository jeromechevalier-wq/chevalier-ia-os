# Mon espace modifiable (version 2.10.0)

**Décidé par Jérôme le 17/10/2026.** Ingrid Atamian (et tout autre client) règle elle-même le nom, le logo, les couleurs, les images et le texte d'accueil de son espace, et gère ses membres. Jérôme n'a plus à le faire pour elle.

## Qui peut quoi (à ne pas changer sans Jérôme)
| | Éditeur | Lecteur | Jérôme (administrateur) |
|---|---|---|---|
| Nom, couleur, logo, images, texte d'accueil | modifie | voit, ne modifie pas | modifie aussi (outil `nouveau-client`) |
| Membres et rôles (ajouter, retirer, changer le rôle) | oui | ne voit pas l'écran | oui |
| Modules actifs | voit seulement : « Pour changer de module, contacte ton administrateur » | ne voit pas l'écran | change les modules |

On ne retire ni ne rétrograde jamais **le dernier éditeur** (« Il faut garder au moins un éditeur. »).

## Où c'est dans l'appli
Chez un client : **Réglages > Mon espace** (un formulaire, un bouton « Enregistrer ») et **Réglages > Membres et rôles**. Le CRM de Jérôme (racine) ne change pas : sa page « Mon espace » reste en lecture seule.

- **Nom, couleur, texte d'accueil, logo choisi** : un seul bouton « Enregistrer ». Seuls les champs que tu as changés sont envoyés ; si deux éditeurs travaillent en même temps, le dernier qui enregistre gagne, champ par champ.
- **Couleur** : n'importe quelle couleur est acceptée ; si elle est trop pâle ou trop sombre, l'appli l'éclaircit ou l'assombrit toute seule pour que le texte reste lisible (l'aperçu montre le thème sombre et le thème clair).
- **Logo** : PNG, JPG ou WebP (pas de SVG), 2 Mo au plus, réduit à 512 px de large dans le navigateur (jamais agrandi). « Retirer » : confirmation, puis « Retiré · Annuler » pendant 8 secondes ; le fichier n'est supprimé qu'après ces 8 secondes.
- **Images de la page de connexion** : 4 au plus, 1,5 Mo au plus chacune (réduites à 1600 px). Elles agissent tout de suite. La première sert de fond à la page de connexion.
- **Texte d'accueil** : 500 caractères au plus, affiché comme du texte (jamais comme du code).
- **Visible par tout le monde** : le nom, le logo, les images et le texte d'accueil se voient sur la page de connexion, même sans compte. N'y mets rien de confidentiel.
- **Application immédiate** : après « Enregistrer », le menu, la barre du haut, l'onglet, l'icône et les couleurs changent tout de suite sur l'appareil qui a enregistré. Les **autres appareils** se mettent à jour au rechargement de la page.
- **Célébrations** : allumées par défaut dans un nouvel espace (2.11.6). Réglages > CRM > Célébrations (tant que l'option est allumée) a une case « Utiliser le logo de mon espace » : cochée par défaut s'il y a un logo, grisée et décochée sinon. Le logo est lu en direct dans la fiche de l'espace (jamais recopié). L'image de Charles reste réservée à l'espace de Jérôme.

## À savoir
- **Fermer l'onglet pendant les 8 secondes de « Retiré · Annuler »** (logo ou image) : le retrait n'est jamais écrit, le logo ou l'image est toujours là au retour. Rien n'est perdu ; il suffit de recommencer. Changer de page dans l'appli pendant ces 8 secondes ne change rien : le retrait suit son cours.
- Un éditeur retiré de l'espace pendant qu'il envoie une image n'écrit plus rien : le serveur revérifie son rôle à l'intérieur de chaque écriture (réglages, logo, images, membres).

## Comment c'est protégé
Les règles Firestore et Storage **ne changent pas** : un navigateur ne peut toujours rien écrire dans `marques/<client>`. Tout passe par une fonction du serveur, `espaceReglages` (Paris, `europe-west9`, `functions-plateforme/src/espace.js`), qui :
1. exige une connexion avec une adresse e-mail vérifiée (et revérifie que l'appelant est encore éditeur dans chaque écriture) ;
2. traite l'espace reçu comme une **cible à vérifier** : l'appelant doit avoir une fiche `clients/<espace>/membres/<son adresse>` avec le rôle `editeur`. Sinon, **un seul refus neutre** : « Action non autorisée. » (espace inexistant, non-membre, lecteur, espace désactivé : même mot, on ne dit rien de plus) ;
3. n'écrit que cette liste fixe : nom, couleur, texte d'accueil, logo, images de `marques/<espace>`, le nom dans `clients/<espace>`, et les membres. **Jamais** `actif`, **jamais** `modules` ;
4. construit lui-même le chemin des fichiers (`marques/<espace>/logo-<heure>.png`, `image-<heure>.jpg`…), contrôle le type d'image par ses premiers octets (PNG, JPG, WebP ; SVG refusé), la taille (2 Mo logo, 1,5 Mo image, 3 Mo par appel) et le nombre (4 images). Ordre : envoyer le nouveau fichier, écrire la fiche, supprimer l'ancien ; si l'écriture de la fiche échoue, le nouveau fichier est supprimé. La fiche ne pointe donc jamais vers un fichier absent ;
5. écrit un membre (ajout, retrait, changement de rôle) **dans une seule transaction** : le document `clients/<espace>/membres/<adresse>` **et** la liste `equipe` de `clients/<espace>`. Le contrôle « dernier éditeur » (et la limite de 20 membres, et « déjà membre ») est dans cette même transaction : deux éditeurs qui agissent en même temps ne peuvent pas laisser l'espace sans éditeur ;
6. note dans le journal du serveur : qui (adresse), quel espace, quels champs. Jamais le contenu des images ni les textes.

## À faire par Jérôme avant le déploiement (rien n'est déployé par cette PR)
> Dans la console Google, le projet **chevalier-ia-app** s'affiche **« Chevalier IA - Serveur 1 »**. **Vérifie ce nom en haut de chaque page** avant de cliquer : ne fais rien dans « Chevalier IA OS » ni dans un autre projet.

**1. Créer le compte de service dédié** `espace-reglages` (une seule fois)
- Ouvre <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=chevalier-ia-app>.
- « Nom du compte de service » : `espace-reglages`. L'identifiant devient `espace-reglages@chevalier-ia-app.iam.gserviceaccount.com` (c'est exactement ce nom que le code attend). Clique **Créer et continuer**.
- **Ne génère aucune clé** (aucune clé n'est jamais nécessaire, ni dans le dépôt).

**2. Lui donner deux droits seulement** (<https://console.cloud.google.com/iam-admin/iam?project=chevalier-ia-app>, bouton **Accorder l'accès**)
- Principal : `espace-reglages@chevalier-ia-app.iam.gserviceaccount.com`.
- Rôle 1 : **Utilisateur Cloud Datastore** (en anglais *Cloud Datastore User*) : lire et écrire dans Firestore.
- Rôle 2 : **Administrateur des objets Storage** (*Storage Object Admin*), **avec une condition** pour qu'il ne touche qu'au dossier `marques/` : clique **Ajouter une condition IAM**, titre « Seulement marques », onglet **Éditeur de condition**, colle :
  ```
  resource.type == "storage.googleapis.com/Object" && resource.name.startsWith("projects/_/buckets/chevalier-ia-app.firebasestorage.app/objects/marques/")
  ```
  puis **Enregistrer**. (Si Google refuse la condition parce que le « bucket » n'est pas en accès uniforme, dis-le à Claude : on mettra le droit sur le bucket `chevalier-ia-app.firebasestorage.app` plutôt que sur le projet.)
- Le compte de déploiement `deploiement-github` agit au nom de ce compte grâce au rôle « Utilisateur du compte de service » déjà accordé au niveau du projet (même principe que `mcp-clients`, voir `mcp-clients.md`). **Sans ce compte, le déploiement échoue** (message `serviceAccount … does not exist`).

**3. Déployer, dans cet ordre** (après fusion de la PR)
- Ouvre <https://github.com/jeromechevalier-wq/chevalier-ia-os/actions/workflows/deploiement-plateforme.yml> > bouton **Run workflow**, branche `main`.
- Choisis **fonctions**. Attention : ce choix publie **toutes** les fonctions de la plateforme, y compris celles des automatisations, qui exigent la clé n8n (`N8N_API_KEY` dans Secret Manager, voir `automatisations-n8n.md`). Si elle n'est pas en place, le déploiement s'arrête avant d'avoir publié quoi que ce soit.
- Puis choisis **hosting** (le site avec les nouveaux écrans). **Les règles ne changent pas** : inutile de choisir « regles ».

**4. Essayer** (avec Ingrid, ou avec un compte de test éditeur)
1. Ouvre `https://chevalier-ia-app.web.app/#/espace/<espace>` et connecte-toi avec le compte Google éditeur.
2. **Réglages > Mon espace** : change le nom, choisis un logo, enregistre. Le menu et l'onglet changent tout de suite.
3. Recharge la page : le nom et le logo sont toujours là. Ouvre l'espace sur un autre appareil : il les a aussi (après rechargement).
4. Déconnecte-toi : la page de connexion montre le nouveau nom, le logo et les images.
5. **Réglages > Membres et rôles** : ajoute une adresse en lecteur, puis retire-la (« Retiré · Annuler »).
6. Si une erreur « Action non autorisée. » s'affiche pour toi alors que tu es éditeur : ta fiche `clients/<espace>/membres/<ton adresse>` n'a pas le rôle `editeur`, ou l'espace est désactivé. Si c'est « Ça n’a pas abouti » : regarde dans la console Google > Cloud Functions > `espaceReglages` > Journaux (droits manquants du compte `espace-reglages` = erreur `PERMISSION_DENIED`).

## Ce qui n'a pas pu être vérifié en vrai
Les tests utilisent la **vraie logique de la fonction** sur un émulateur Firestore et un **faux Storage** : ils prouvent les règles (refus, dernier éditeur, validation, ordre des fichiers), pas l'infrastructure Google. Non essayé : le vrai compte de service et ses droits (la condition sur `marques/`), le vrai téléversement d'un logo dans Storage et son adresse publique, le vrai appel de la fonction depuis le site publié, la mise à jour sur un deuxième appareil, l'aperçu sur un vrai iPhone (photothèque, sélecteur de couleur). Premier essai réel conseillé juste après le déploiement, avec un espace de test.

## Tests
`tests/espace-reglages.test.js` (fonction : refus d'un lecteur, d'un inconnu, d'un autre espace, d'un espace désactivé ; dernier éditeur, y compris deux appels en même temps ; images ; validation ; critères M5, M7, M8, M11 à M16 côté serveur), `tests/e2e/mon-espace.spec.js` et `tests/e2e/mon-espace-racine.spec.js` (un test et une capture par critère M1 à M23, captures dans `~/chantiers-crm/captures-mon-espace/`).
