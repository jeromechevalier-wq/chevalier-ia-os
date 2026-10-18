# Veille : ajouter un lien, résumer, lire le résumé (écrit le 2026-10-15)

Trois ajouts au module Veille, décidés avec Jérôme le 2026-10-15. Version 2.4.0.

## 1. Ce que ça fait

- **Coller un lien YouTube** dans le champ en haut de la page Contenus. L'appli reconnaît toute seule ce que c'est :
  - **un épisode** (`watch?v=`, `youtu.be/`, `shorts/`, `live/`) : deux boutons, **Ajouter** et **Ajouter et résumer**. L'épisode est rangé dans la source « Ajouts manuels » (créée au premier ajout, sans identifiant de chaîne : la collecte du lundi l'ignore) ;
  - **une chaîne** (`/@nom`, `/channel/UC…`, `/c/…`, `/user/…`) : un bouton **Suivre la chaîne**. La chaîne devient une source active et ses **5 derniers épisodes** sont ajoutés (décision de Jérôme). Jamais de résumé d'office pour une chaîne : 5 résumés coûteraient trop.
  - Relancer le même ajout ne crée aucun doublon.
- **Bouton Résumer branché de bout en bout** : c'est un vrai bouton, qui appelle le serveur. Il apparaît sur un contenu « nouveau » ou « en échec » (« Réessayer le résumé »). Le message de retour dit si le résumé est lancé, déjà en cours, déjà fait, ou pourquoi il ne part pas. **Plus aucun jeton dans la page.**
- **Lire le résumé dans l'appli** : bouton « Lire le résumé » → la page HTML du résumé s'ouvre dans une fenêtre, belle à lire, sur ordinateur comme sur téléphone. Les anciens résumés (sans page enregistrée) gardent leurs liens Drive.

## 2. Comment c'est fait

- **Fonction `veille`** (`functions/src/veille/`, appelée par l'appli) : deux actions, `ajouterLien` et `resumer`. Réservée aux deux comptes Google de Jérôme (même règle que les règles Firestore). Elle lit YouTube (oEmbed pour le titre d'un épisode, page de la chaîne puis flux pour une chaîne), écrit dans `veille_sources` et `veille_contenus`, et déclenche le workflow n8n « résumer à la demande » avec le jeton, gardé dans Secret Manager (`VEILLE_JETON_RESUMER`).
- **Reconnaissance des liens** : `js/modules/veille/lien.js`, écrit une seule fois pour l'écran et pour le serveur (copié dans `functions/partage/` par `scripts/preparer-fonctions.js`, comme les autres règles partagées).
- **Page du résumé** : la porte accepte maintenant un champ `html` dans `resumes.ajouter` (150 000 caractères au plus, retours à la ligne permis, autres caractères de contrôle refusés). La page est rangée **à part**, dans la table `veille_pages` (même identifiant que le résumé), pour ne pas alourdir la liste des résumés ; le résumé reçoit `pageDisponible: true`. Une page existante n'est jamais écrasée. `veille_pages` est dans la sauvegarde complète du CRM.
- **Sécurité de l'affichage** : la page s'affiche dans un cadre isolé (`iframe`, `sandbox` sans `allow-scripts`) : aucun script de la page ne tourne, même si le texte en contenait. Les liens s'ouvrent dans un nouvel onglet. Un test dans le navigateur le prouve.

## 3. Mise en service : à faire dans cet ordre

**Attention : la fusion dans `main` déploie les fonctions toute seule, et la fonction `veille` a besoin de son secret. Créer le secret AVANT de fusionner, sinon le déploiement échoue.**

1. **Toi : créer le secret `VEILLE_JETON_RESUMER`.** C'est le jeton du bouton Résumer : sa valeur est dans n8n, table de données `veille_jeton_bouton`, colonne `jeton`. Copie-la, puis dans le Terminal (le champ caché évite de l'afficher) :
   `read -s "K?Jeton du bouton Résumer : " && printf %s "$K" | gcloud secrets create VEILLE_JETON_RESUMER --project chevalier-ia-os --data-file=-`
2. **Toi : dire « fusionne »** pour la PR. Le déploiement envoie la fonction `veille` et la page (version 2.7.0).
3. **Nous deux : modifier le workflow n8n** `interne-veille-resumer-a-la-demande-porte`, pour que la page du résumé soit rangée dans l'appli. Dans le nœud **« Enregistrer le résumé via la porte »**, ajouter dans `donnees` : `html: $("Mettre le résumé en page HTML").first().json.fichier_html`. À tester ensemble avant de publier (jamais de publication sans ton accord).
4. **Essai réel** : coller un épisode, cliquer « Ajouter et résumer », attendre le résumé, cliquer « Lire le résumé ».

**Jeton historique** : l'ancien jeton du bouton a été écrit dans le code de la page jusqu'à cette version ; il reste visible dans l'historique de GitHub. Tu avais jugé cela peu grave (appli derrière une connexion Google). Si tu veux fermer le sujet : changer la valeur dans la table n8n et dans le secret. Optionnel.

## 4. Limites connues et suite

- **Seuls les liens YouTube** sont reconnus. Podcasts et newsletters : à ajouter plus tard (ils demandent le flux RSS).
- **Chez un client** (module Veille de la plateforme), la fonction `veille` n'est pas encore branchée : le service accepte déjà un chemin de base différent (`base`), il reste à l'appeler depuis les fonctions de la plateforme avec l'identité du client. Le formulaire et le bouton Résumer restent donc **réservés au propriétaire** pour l'instant, comme avant. La lecture d'un résumé dans l'appli, elle, marche pour tous dès que `veille_pages` est rempli.
- **Le résumé n'est pas lancé par l'appli elle-même** : elle passe par le workflow n8n existant (transcript, résumé, dépôt dans Drive, mail). C'est lui qui passe le contenu en « en cours » puis « résumé ».
- **Dépôt dans le second cerveau** : c'est déjà fait par le workflow (Drive, `RAW/Veille/`). Pour les clients, le terme neutre à employer à l'écran est « bibliothèque » ; à brancher quand le module sera ouvert aux clients.

## 5. Tests ajoutés

- `tests/veille-lien.test.js` : reconnaissance des liens (épisode, chaîne, refus) et lecture du flux.
- `tests/veille-service.test.js` : ajout d'un épisode et d'une chaîne, résumé, accès réservé, erreurs lisibles, aucun jeton dans le code (YouTube et n8n simulés).
- `tests/porte.test.js` : page HTML du résumé (rangée à part, jamais écrasée, caractères refusés).
- `tests/veille-logique.test.js` : boutons, messages, page isolée, aucun jeton dans l'appli.
- `tests/e2e/veille.spec.js` : dans le navigateur, ordinateur et téléphone (bouton Résumer, ajout, lecture du résumé dans le cadre isolé).
