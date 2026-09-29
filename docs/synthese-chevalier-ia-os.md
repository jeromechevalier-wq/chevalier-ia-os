# Chevalier IA OS : synthèse du projet (session du 29/09/2026)

Point d'entrée du projet. Résume tout ce qui a été décidé et fait, et renvoie vers les documents détaillés.

## 1. Résultat

1. **Chevalier IA OS 1.0.0 est en ligne** : https://chevalier-ia-os.web.app
2. Contenu : la coquille de l'OS (connexion Google, menu latéral repliable, thèmes sombre et clair) et un premier module, le **CRM de prospection** (Accueil avec objectifs, Kanban, Liste, fiches, Réglages).
3. Accès réservé à deux comptes Google : jerome.chevalier@gmail.com ("Jérôme") et jeromebot.chevalierbot@gmail.com ("Charles", l'assistant IA).
4. Construction en une seule fois par Claude, à partir du cahier des charges : 152 tests automatiques réussis (sécurité, logique métier, 30 parcours sur ordinateur et téléphone, contrôles).

## 2. Architecture retenue (et pourquoi)

| Élément | Choix | Raison |
|---|---|---|
| Données | Cloud Firestore, région Paris (europe-west9) | Vraie sécurité côté serveur (règles), gratuit à ce volume ; Google Sheets écarté (sécurité, jetons courts, pas de hors ligne) |
| Hébergement | Firebase Hosting, `chevalier-ia-os.web.app` | Netlify écarté : offre gratuite limitée à environ 20 déploiements par mois |
| Connexion | Google via Firebase Authentication, deux comptes autorisés | Double contrôle : interface et règles Firestore |
| Plan | Firebase gratuit (Spark), sans carte bancaire | Aucune Cloud Function ni Cloud Storage |
| Code | HTML, CSS, JavaScript sans compilation, SDK Firebase 12.19.0 | Simple à relire et à faire évoluer |
| Déploiement | GitHub `jeromechevalier-wq/chevalier-ia-os` (privé) ; chaque fusion sur `main` publie le site (GitHub Actions) | Mise à jour automatique |
| Documents | Liens Google Drive dans les fiches, aucun fichier stocké | Le stockage de fichiers Firebase exige le plan payant |
| Emails | V1 : bouton qui ouvre Apple Mail ; V2 : envoi par n8n (SMTP Hostinger, mot de passe jamais dans l'appli) | Un site statique ne doit contenir aucun mot de passe |

Identifiants utiles : projet Firebase `chevalier-ia-os` ; secret GitHub `FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS` ; compte de service `github-action-1396565585`.

## 3. Principales décisions fonctionnelles

1. **Vision OS** : le CRM est un module parmi d'autres à venir ; chaque module a son dossier et ses collections (`crm_…`), les éléments communs sont en `os_…`.
2. **Fiche = une personne**, rôles multiples (Prospect, Partenaire, Interviewé JTBD), date d'interview JTBD, offres gérées dans l'appli (Audit, Accompagnement, durée en jours).
3. **Trois zones de notes** : Notes libres (façon Notion, jamais modifiées par l'appli), Notes rapides (dictées au téléphone), Historique automatique.
4. **Pipeline** : Premier contact, Rendez vous fixé, Proposition envoyée, Gagné, Facture envoyée, Facture payée (archivée), plus Perdu et Pas maintenant. Alerte = date de prochaine action dépassée.
5. **Objectifs mensuels** en page d'accueil : 10 interviews JTBD, 10 nouveaux contacts, 4 rendez vous tenus, 3 propositions, 1 000 € encaissés, 100 flyers (saisie manuelle). Cibles modifiables.
6. **DA** : charte de chevalier-ia.fr, thème sombre par défaut, Charles présent (connexion, états vides, célébrations façon `tally-merci.html`).
7. **Retirés pour réduire le risque** : hors ligne avec modification (V2), mise en cache par service worker, taux de passage, champs personnalisés, modèles d'email (V2), signalement RGPD à 3 ans (V2).
8. **Sauvegarde** : export CSV, rappel à l'Accueil si aucun export depuis 30 jours.

## 4. Déroulé de la session

1. Réécriture du prompt d'entretien (Netlify puis Firebase Hosting, connexion Google, recommandation Firebase plutôt que Google Sheets, vérification des quotas gratuits).
2. Configuration Firebase guidée : projet, application Web, connexion Google, Firestore à Paris, règles de sécurité.
3. Entretien en 8 blocs, puis cahier des charges avec protocole de test, relecture pour supprimer le superflu.
4. Kit de construction (cahier, ressources du site, prompt), construction par Claude, livraison du dépôt Git (branches `main` et `v1`).
5. Mise en ligne : publication avec GitHub Desktop, liaison GitHub vers Firebase Hosting (`firebase init hosting:github`), fusion de `v1` dans `main`, déploiement réussi.
6. Recette : connexion Jérôme, parcours complet jusqu'à Gagné, suppression, compte de Charles : OK.

## 5. Reste à faire

1. Recette iPhone : Safari, "Sur l'écran d'accueil", connexion dans l'appli installée, note dictée.
2. Tester le refus d'un compte Google étranger en navigation privée (couvert par les tests automatiques, pas encore vérifié à la main).
3. Ménage : dans Téléchargements, supprimer `cloud-firestore-emulator-v1.22.0.jar`, `emulateur-firestore-morceaux`, `kit.tgz`, les dossiers `chevalier-ia-os` et `kit-chevalier-ia-os-v1` en double.
4. Déplacer le dossier du dépôt hors de Google Drive (actuellement Mon Drive > Chevalier-AI > Projets > chevalier-ia-os), puis le relocaliser dans GitHub Desktop.
5. Facultatif : révoquer l'accès "Firebase CLI" à GitHub (Settings > Applications) ; supprimer les comptes de service inutilisés dans Google Cloud.
6. Plus tard : configurer jerome@chevalier-ia.fr dans Apple Mail comme compte d'envoi par défaut ; vérifier SPF, DKIM et DMARC chez Hostinger.
7. Commencer à saisir les vrais prospects et noter les retours dans `backlog-v1-1.md`.

## 6. Comment faire évoluer l'appli

1. Décrire le changement voulu (idéalement dans `backlog-v1-1.md`).
2. Faire travailler Claude sur le dépôt, sur une nouvelle branche (par exemple `v1.1`), avec `docs/cahier-des-charges.md` comme référence et `cd tests && npm test` au vert.
3. Pousser la branche, ouvrir une pull request vers `main`, fusionner : le site se met à jour tout seul, et l'appli affiche "Nouvelle version disponible".

## 7. Documents du projet

1. `synthese-chevalier-ia-os.md` : ce document.
2. `cahier-des-charges-chevalier-ia-os.md` : la référence complète (v1.1).
3. `crm-decisions-entretien.md` : toutes les décisions de l'entretien, bloc par bloc.
4. `prompt-construction-chevalier-ia-os.md` : le prompt de construction utilisé.
5. `backlog-v1-1.md` : retours de recette et idées pour la suite.
6. `prompt-cahier-des-charges-crm.md` : le prompt d'entretien d'origine (historique, dépassé par le cahier des charges).
7. Dans le dépôt GitHub : `docs/rapport-construction.md` (résultats des tests) et `docs/decisions-construction.md` (43 petites décisions de construction).
