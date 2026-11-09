# Maquettes graphiques du devis (étape 1, 09/11/2026)

Quatre propositions, **données fictives** (aucune donnée réelle, logo de remplacement en SVG). Maquettes HTML statiques, A4, filigrane « BROUILLON » conservé, réalisables avec le moteur actuel (`js/modules/devis/document.js`, CSS d'impression, aucune ressource réseau).

| N° | Fichier | Style | Couleur |
|---|---|---|---|
| 1 | `1-classique.html` / `.png` | Logo à gauche, destinataire encadré à droite, en-tête de tableau plein, « Net à payer » en bandeau | Bleu marine |
| 2 | `2-moderne.html` / `.png` | Grand « DEVIS » à droite, bloc client gris, bandeaux de section colorés (idée du 24/10/2026) | Orange bitume + anthracite |
| 3 | `3-sobre-bandeau.html` / `.png` | Bandeau plein largeur avec le logo sur pastille blanche, filets fins | Anthracite + liseré orange |
| 4 | `4-epure.html` / `.png` | Liseré vertical, beaucoup de blanc, bandeaux de section pleins | Vert-de-gris |

Planche comparative : `planche-comparative.png` (source `planche.html`).

## Le logo aujourd'hui (vérifié dans le code)
- Le document lit `emetteur.logo` (`blocEmetteur`, `logoValide`, `document.js`) : image `data:` (png, jpeg, gif, webp, svg) ou https côté navigateur.
- Le PDF serveur (`functions/src/devis/pdf-service.js`, `emetteurSansLogoExterne`) ne garde que `data:image/png|jpeg|webp|gif;base64` de 1,5 Mo au plus (le SVG et https sont retirés).
- **Manque** : Réglages > Devis > « Mon entreprise » n'a aucun champ logo, et `validerEntreprise` (`articles.js`) ne conserve pas la clé `logo` (« Pas de logo ni de CGV ici »). Un logo ne peut donc pas être téléversé ni enregistré aujourd'hui, ni à l'écran ni dans le PDF. Il faut : un bouton de téléversement, redimensionnement côté navigateur en PNG/JPEG (< 1,5 Mo) converti en data URL, `logo` ajouté à `validerEntreprise` (et aux règles de taille), même code chez Jérôme et chez les clients (`functions-plateforme/`).
- À part : le logo de l'espace (Réglages > Mon espace, clients) est un autre logo, en https dans le stockage ; il pourrait servir de source.
