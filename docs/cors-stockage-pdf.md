# Réglage « CORS » du stockage des PDF de devis (à faire une fois par projet Google)

## Pourquoi
Quand on ouvre le PDF d'un devis, l'application en copie un exemplaire dans le dossier « Devis » du dossier Drive de l'affaire. Pour cela, le navigateur doit **lire** le PDF dans Cloud Storage. Par défaut, le stockage refuse cette lecture quand elle vient d'un site web : il faut lui dire quels sites ont le droit (c'est ce qu'on appelle le réglage « CORS »).

Il sert à deux choses : copier le PDF dans Drive, et le joindre au brouillon Gmail de l'e-mail du devis. Sans ce réglage, l'écran du PDF affiche : « Le PDF n'a pas pu être lu pour la copie dans Drive… ». Le PDF, lui, s'ouvre quand même normalement.

Ce réglage se fait **une fois par projet Google** (un par plateforme, jamais un par client). Il ne contient aucun secret : il liste seulement des adresses de sites et la méthode de lecture (GET).

## État du réglage

| Projet Google | Réglage CORS | Date | Preuve |
|---|---|---|---|
| `chevalier-ia-os` (Chevalier IA OS, chez Jérôme) | Fait | 27/10/2026 | Vérifié avec `gsutil cors get` : les deux adresses s'affichent (bucket `chevalier-ia-os.firebasestorage.app`) |
| `chevalier-ia-app` (plateforme des clients) | Fait | 27/10/2026 | Vérifié avec `gsutil cors get gs://chevalier-ia-app.firebasestorage.app` : `https://chevalier-ia-app.web.app` et `https://chevalier-ia-app.firebaseapp.com`, GET, 3600 |
| Toute nouvelle plateforme | À faire à la mise en place | | Voir « Nouvelle plateforme » plus bas |

Mets ce tableau à jour à chaque fois que tu fais ou vérifies le réglage.

## Le fichier d'exemple (`cors.json`)
Ne l'ajoute **pas** au dépôt : il se crée directement dans le terminal Google (voir plus bas). Remplace `<PROJET>` par l'identifiant du projet (par exemple `chevalier-ia-os`).

```json
[
  {
    "origin": [
      "https://<PROJET>.web.app",
      "https://<PROJET>.firebaseapp.com"
    ],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

Ce fichier fait 11 lignes : c'est le chiffre que nano affichera à l'enregistrement.

## Pas à pas
Tout se passe dans ton navigateur, sur la console Google. Compte environ 10 minutes.

1. **Ouvre la liste des stockages** : `https://console.cloud.google.com/storage/browser?project=<PROJET>` (remplace `<PROJET>` par l'identifiant du projet).
2. **Vérifie le projet affiché en haut de la page** (à gauche, à côté du logo « Google Cloud »). Attention : la console affiche parfois un nom lisible (par exemple « Chevalier IA - Serveur 1 ») et pas l'identifiant. Si ce n'est pas le bon projet, clique dessus et choisis le bon.
3. **Recopie le nom du bucket** depuis la liste. Il a la forme `<projet>.firebasestorage.app` ou, pour les projets plus anciens, `<projet>.appspot.com`. Ne le devine pas : copie-le depuis la liste (ignore les buckets `gcf-v2-*` : ce sont ceux des fonctions). Pour les projets `chevalier-ia-os` et `chevalier-ia-app`, c'est `<projet>.firebasestorage.app`. Ce nom est ta valeur pour `<nom-du-bucket>` plus bas.
4. **Ouvre Cloud Shell**, le terminal de Google : clique sur l'icône **« >_ »** dans la barre du haut, entre la zone « Recherche » et le rond vert des notifications (à droite de l'étoile Gemini). Autre accès, si tu ne la trouves pas : `https://shell.cloud.google.com/?project=<PROJET>`. Un terminal s'ouvre en bas de la page. Si Google demande d'autoriser Cloud Shell, accepte.
5. **Vérifie l'invite du terminal** : elle doit afficher `(<PROJET>)` entre parenthèses, avec l'identifiant du bon projet. Sinon tu es dans le mauvais projet : retourne à l'étape 2, ou tape `gcloud config set project <PROJET>` puis Entrée (l'invite change au bout d'un instant).
6. **Efface l'ancien fichier** (il peut rester d'un essai précédent) : tape `rm cors.json` puis Entrée. Si le terminal répond « No such file or directory », c'est normal et sans importance. Sans cette ligne, tu risques de coller le nouveau texte **par-dessus** l'ancien.
7. **Crée le fichier.** Piège : ne colle **jamais** le JSON directement dans le terminal sans avoir ouvert nano (ou la méthode ci-dessous) : tu verrais des erreurs « command not found », sans danger mais inutiles. Deux méthodes, au choix :
   - **Sans nano (recommandée)** : colle ces lignes d'un coup, avec le bon identifiant à la place de `<PROJET>`. Le terminal range tout dans `cors.json` jusqu'à la ligne `EOF`. Puis passe directement à l'étape 9.
     ```
     cat > cors.json <<'EOF'
     [{"origin": ["https://<PROJET>.web.app", "https://<PROJET>.firebaseapp.com"], "method": ["GET"], "maxAgeSeconds": 3600}]
     EOF
     ```
   - **Avec nano** : tape `nano cors.json`, puis Entrée. Colle le JSON ci-dessus (avec le bon identifiant), puis fais l'étape 8.
8. **(Avec nano seulement) Enregistre, avec deux gestes** :
   - `Ctrl+O` (lettre O). Nano demande en bas « File Name to Write: cors.json ». **Rien n'est enregistré tant que tu n'as pas appuyé sur Entrée.** Appuie sur Entrée : le message « Wrote 11 lines » apparaît.
   - Puis `Ctrl+X` pour sortir de nano.
9. **Applique le réglage** : tape la commande suivante, en remplaçant `<nom-du-bucket>` par le nom copié à l'étape 3, **sans** ajouter un deuxième `gs://` (le nom copié ne doit pas déjà commencer par `gs://`).

```
gsutil cors set cors.json gs://<nom-du-bucket>
```

   Copie **seulement la commande**, jamais l'invite qui la précède (le début de ligne du genre `nom@cloudshell:~ (projet)$`) : sinon tu obtiens « syntax error near unexpected token ».

   Si Google demande d'autoriser Cloud Shell à utiliser tes identifiants, accepte, puis relance la commande si besoin.
10. **Vérifie** : tape `gsutil cors get gs://<nom-du-bucket>`. Le terminal doit afficher **les deux adresses** (`.web.app` et `.firebaseapp.com`), la méthode `GET` et `3600`. Si la réponse est vide ou `[]`, le réglage n'est pas pris : reprends à l'étape 6.

### Messages que tu peux voir
- « Setting CORS on gs://…/... » sans erreur derrière : c'est **appliqué**.
- Pour retrouver le nom du bucket depuis le terminal : `gsutil ls -p <PROJET>` liste les buckets. Prends celui en `<projet>.firebasestorage.app`, ignore ceux en `gcf-v2-*`.
- « Google recommends using Gcloud storage CLI… » : c'est une simple suggestion de Google. **Ignore-la**, la commande a bien fonctionné.
- `AccessDeniedException` : tu n'as pas le droit sur ce projet. Vérifie le projet choisi en haut de la page (étape 2) et le `(<PROJET>)` de l'invite (étape 5), puis vérifie que tu es connecté avec le compte Google propriétaire du projet.
- « No such file or directory » après `rm cors.json` : normal, le fichier n'existait pas.

## Vérifier que ça marche
Attends **une à deux minutes** (le réglage met un peu de temps à s'appliquer). Puis, dans l'application :

1. Ouvre une affaire **qui a un dossier Drive** (sinon la copie n'a pas de destination et le test ne prouve rien).
2. Ouvre un devis **finalisé** et son PDF.
3. Appuie sur « Copier dans Drive » si on te le propose : le message vert **« PDF copié dans le dossier Devis de l'affaire »** doit apparaître.

Si le message d'erreur « Le PDF n'a pas pu être lu… » apparaît encore : attends encore deux minutes, recharge la page, réessaie. Puis relis l'étape 10 (`gsutil cors get`).

## Nouvelle plateforme
Le jour où tu déploies une **nouvelle plateforme** (un nouveau projet Google, sur le modèle de `chevalier-ia-app`), ce réglage est **à refaire pour ce projet** : il ne se transmet pas d'un projet à l'autre.

- **Un réglage par projet Google**, donc un par plateforme. Pas un par client : tous les clients d'une même plateforme partagent le même stockage et le même réglage.
- Suis le pas à pas ci-dessus avec l'identifiant du **nouveau** projet à la place de `<PROJET>`, et le nom du bucket du nouveau projet.
- Si la plateforme a un **domaine personnalisé** (par exemple `https://app.exemple.fr`), ajoute-le **aussi** dans la liste `origin`, sans quoi la copie échouera sur ce domaine (même si elle marche sur `.web.app`). Modèle :

```json
[
  {
    "origin": [
      "https://<PROJET>.web.app",
      "https://<PROJET>.firebaseapp.com",
      "https://<DOMAINE-PERSONNALISE>"
    ],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

  Sans domaine personnalisé, garde le modèle à deux adresses. Une adresse s'écrit entière : `https://`, pas de `/` à la fin.
- **Où ça se place dans la mise en place** : après l'activation de Storage et la publication des règles (le bucket doit exister), et **avant** le premier essai de devis avec copie dans Drive. Dans la liste complète d'un nouveau serveur, c'est l'étape 16 de `docs/deploiement-nouveau-serveur-plateforme.md` ; dans la checklist d'un client, c'est le tableau « Réglages Google du projet de la plateforme » de `docs/deploiement-client.md`.
- Une fois fait, note-le dans le tableau « État du réglage » plus haut, avec la date.

## Pour revenir en arrière
`echo '[]' > vide.json` puis `gsutil cors set vide.json gs://<nom-du-bucket>` retire tous les réglages CORS du bucket.
