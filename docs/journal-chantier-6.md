# Journal du chantier 6 : retirer l'identité de Jérôme de la coque

Branche `plateforme-chantier-6`. Rien n'est fusionné ni déployé. Reprendre ici si la session est coupée.

## Inventaire (parcours client `#/espace/<client>…`)

Classement : **(1)** à remplacer par la marque du client ; **(2)** personnel à Jérôme, masqué chez un client ; **(3)** neutre, laissé.

| Où | Ce que c'est | Classe | Traitement |
|---|---|---|---|
| `css/tokens.css`, `os.css`, `crm.css` | accent jaune (boutons, menu actif, liens, pastilles, focus, onglets, barres du chiffre d'affaires) | 1 | jetons `--accent`, `--accent-survol`, `--accent-trait`, `--accent-aXX` ; valeurs par défaut = jaune d'avant (CRM identique) ; redéfinis chez un client par `identite.js` |
| `tokens.css` étapes, priorités, retard, succès, `ETAPES`, `STATUTS`, phases | couleurs sémantiques | 3 | **ne changent pas** (même `--jaune` pour l'étape « Gagné » et la priorité « tiède ») |
| `css/crm.css` étoile des favoris | jaune conventionnel de l'étoile | 3 | laissée |
| `index.html` titre, description, `apple-mobile-web-app-title`, icône, `apple-touch-icon`, manifeste | identité de Jérôme | 1 | remplacés au chargement par `identite.js` (nom, logo ou initiale, manifeste du client) ; petit script en tête de page pour que le tout premier affichage soit déjà neutre |
| `index.html` `<noscript>` | « Chevalier IA OS a besoin de JavaScript » | 1 | texte neutre pour tous (seul changement visible nulle part : il faut désactiver JavaScript pour le voir) |
| `shell.js` nom + baguette (menu, barre du haut) | marque de Jérôme | 1 | déjà remplacés par le nom/logo du client (chantier 7) ; initiale en pastille |
| `shell.js` écran de connexion (« Chevalier IA OS », « L'espace de travail de Jérôme et Charles ») | connexion du CRM | 3 | jamais montré chez un client (le client a sa propre page de connexion) |
| `accueil.js` bandeau « Pense à ta sauvegarde mensuelle » | rappel d'export de Jérôme | 2 | masqué chez un client |
| `accueil.js` « Charles veille », `charlesContent()` | mascotte Charles | 2 | texte neutre ; animation coupée |
| `celebrations.js` (Gagné « Bravo Jérôme ! », clôture, paiement « merci Charles », objectif) | célébrations de Jérôme | 2 | coupées chez un client (chantier 8 : module optionnel) |
| `composants.js` `etatVide` | image de Charles dans les écrans vides | 2 | sans image chez un client |
| `composants.js` `selectProprietaire` | liste « Jérôme / Charles » | 2 | chez un client : le propriétaire s'affiche, pas de liste |
| `taches.js` « Confiée à » (Jérôme / Charles) | assignation | 2 | champ masqué chez un client |
| `lanceurs.js` GitHub / dossier / prompts Claude Code | outils de Jérôme | 2 | masqués chez un client |
| `journal.js` « MCP (Claude Code, Hermes) » | canal | 2 | « Assistant IA (MCP) » chez un client |
| `donnees.js` réglages de départ (`proprietaireGithub`, `cheminProjets` = chemin Drive de Jérôme) | données de départ | 2 | écrits vides dans la base d'un client |
| `registre.js` menu « CRM », `crm/…` | mot du métier | 3 | laissé |
| `firebase-config.js`, `composants.js nomCompte`, `logique.js` (comptes de Jérôme/Charles) | noms de personnes | 3 | utiles seulement si Jérôme lui-même est membre |
| `crm/logique.js` objectifs, offres/étiquettes/filtres de départ (« Réseau entrepreneuses »…) | données de départ de Jérôme | 2 | **non traité** : à décider avec l'outil « nouveau client » (chantier 13) |
| `main.js` Réglages « Chevalier IA OS » | CRM | 3 | jamais chez un client |

## Fait
- Inventaire, jetons d'accent, identité de la page, masquage chez un client, tests (unitaires, navigateur), documentation.
- Suite complète verte : règles 117, logique 385, statique 52, fonctions 177, navigateur 270 (ordinateur + téléphone), Storage 4.

## Reste
- Validation de Jérôme (voir le résultat sur /espace/clientdemo après déploiement), puis fusion.
- Non testé : vrai bouton Google, installation sur téléphone (icône/nom de l'appli), rendu sur un vrai téléphone.

## Prochaine commande
```
export JAVA_HOME=$HOME/.local/jdk-21/Contents/Home PATH=$JAVA_HOME/bin:$PATH
cd tests && npm test
```

## Décisions prises seul
- **Interrupteur « chez un client »** : un drapeau (`js/os/contexte.js`) plutôt qu'une option passée écran par écran ; les écrans CRM/Projets sont nombreux et le drapeau est coupé à la fermeture. Le chantier 8 le remplacera par un vrai réglage de module.
- **Contraste** : fond de bouton ≥ 3:1 sur la surface la plus défavorable de chaque thème, texte/icônes/liens ≥ 4,5:1 ; la couleur de marque est éclaircie ou assombrie seulement si nécessaire. Résultat : en thème clair, une couleur pâle donne un bouton plus foncé que la marque.
- **Manifeste par client** : fourni dès maintenant (nom + adresse de départ du client) sans toucher au CRM, au lieu d'attendre le chantier 16 ; icône = logo ou initiale. Non essayé sur un vrai téléphone.
