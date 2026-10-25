# Réglage « CORS » du stockage des PDF de devis (à faire une fois)

## Pourquoi
Quand on ouvre le PDF d'un devis, l'application en copie un exemplaire dans le dossier « Devis » du dossier Drive de l'affaire. Pour cela, le navigateur doit **lire** le PDF dans Cloud Storage. Par défaut, le stockage refuse cette lecture quand elle vient d'un site web : il faut lui dire quels sites ont le droit (c'est ce qu'on appelle le réglage « CORS »).

Sans ce réglage, l'écran du PDF affiche : « Le PDF n'a pas pu être lu pour la copie dans Drive… ». Le PDF, lui, s'ouvre quand même normalement.

Ce réglage se fait **une fois par projet** (un pour Chevalier IA OS, un pour chaque plateforme cliente). Il ne contient aucun secret : il liste seulement des adresses de sites et la méthode de lecture (GET).

## Le fichier d'exemple (`cors.json`)
Ne l'ajoute **pas** au dépôt : il se crée directement dans le terminal Google (voir plus bas). Adapte les adresses aux sites de l'application concernée.

```json
[
  {
    "origin": [
      "https://chevalier-ia-os.web.app",
      "https://chevalier-ia-os.firebaseapp.com"
    ],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

Pour une plateforme cliente, remplace les deux adresses par celles du client (par exemple `https://chevalier-ia-app.web.app` et `https://chevalier-ia-app.firebaseapp.com`).

## Où cliquer
1. Ouvre la liste des stockages : https://console.cloud.google.com/storage/browser (vérifie en haut de la page que le bon projet est choisi).
2. Repère le **nom du bucket** (la ligne de la liste, souvent de la forme `<projet>.firebasestorage.app`). Ne le devine pas : copie-le depuis cette liste. C'est ta valeur pour `<nom-du-bucket>`.
3. En haut à droite de la console, clique sur l'icône **Activer Cloud Shell** (le `>_`). Un terminal s'ouvre en bas de la page.
4. Crée le fichier : tape `nano cors.json`, colle le JSON ci-dessus, puis `Ctrl+O`, `Entrée`, `Ctrl+X`.
5. Applique-le avec la commande suivante (remplace `<nom-du-bucket>` par le nom copié à l'étape 2, sans `gs://` en double) :

```
gsutil cors set cors.json gs://<nom-du-bucket>
```

6. Vérifie : `gsutil cors get gs://<nom-du-bucket>` doit afficher les mêmes adresses.

## Vérifier que ça marche
Ouvre le PDF d'un devis finalisé dans l'application, appuie sur « Copier dans Drive » si on te le propose : le message vert « PDF copié dans le dossier Devis de l'affaire » doit apparaître. Le réglage met parfois une ou deux minutes à s'appliquer.

## Pour revenir en arrière
`echo '[]' > vide.json` puis `gsutil cors set vide.json gs://<nom-du-bucket>` retire tous les réglages CORS du bucket.
