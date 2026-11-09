# Maquettes graphiques du devis (étape 1, 09/11/2026)

Quatre propositions, **données fictives** (aucune donnée réelle, logo de remplacement en SVG). Maquettes HTML statiques, A4, filigrane « BROUILLON » conservé, réalisables avec le moteur actuel (`js/modules/devis/document.js`, CSS d'impression, aucune ressource réseau).

| N° | Fichier | Style | Palette |
|---|---|---|---|
| 1 | `1-classique.html` / `.png` | Logo carré à gauche, destinataire encadré à droite, en-tête de tableau plein, « Net à payer » en bandeau ; titres en serif | Bleu nuit #1B2A4A |
| 2 | `2-moderne.html` / `.png` | Grand « DEVIS » à droite, bloc client gris-bleu, bandeaux de section et total en bleu eau ; serif | Bleu eau #2A8FD8 + bleu nuit |
| 3 | `3-sobre-bandeau.html` / `.png` | Bandeau bleu nuit pleine largeur, logo carré sur pastille blanche, liseré bleu eau ; serif | Bleu nuit + bleu eau |
| 4 | `4-epure.html` / `.png` | Liseré vertical, beaucoup de blanc, sans serif : **palette neutre de comparaison** | Vert-de-gris |

Palette 1 à 3 prise sur le logo de MCA (marine #1B2A4A, bleu eau #2A8FD8, bleu moyen #2F6DB5, gris-bleu clair #EEF3F8) ; le logo réel n'est jamais dans le dépôt public : un logo carré de remplacement (maison, vagues) occupe son emplacement (26 mm × 26 mm). Étape 2 : la couleur du devis vient déjà de `emetteur.couleur` (Réglages > Mon entreprise > « Couleur du tableau »), donc la palette s'adapte sans code en la réglant sur le bleu du logo.

Planche comparative : `planche-comparative.png` (source `planche.html`).

## Le logo aujourd'hui (vérifié dans le code, 09/11/2026)
- Le logo que Jérôme a téléversé est celui de **l'espace** (Réglages > Mon espace, `marque.logo`, fichier https dans le stockage, ≤ 2 Mo). Le devis ne le lit **jamais** : `document.js` lit seulement `options.logo` (jamais passé) ou `emetteur.logo` (Mon entreprise), et ni l'aperçu (`html-devis.js`) ni le PDF (`pdf-service.js`) ne transmettent le logo de l'espace.
- Réglages > Devis > « Mon entreprise » n'a pas de champ logo et `validerEntreprise` (`articles.js`) jette la clé `logo` : le logo n'apparaît donc **ni à l'écran ni dans le PDF**.
- Le PDF serveur (`emetteurSansLogoExterne`) n'accepte que `data:image/png|jpeg|webp|gif;base64` ≤ 1,5 Mo ; https et SVG sont retirés (l'écran, lui, accepte aussi https et SVG : écart à unifier).
- **À corriger à l'étape 2** : le serveur lit le logo de l'espace (`marques/<client>/logo-….png`), le contrôle (type, 1,5 Mo) et l'intègre en `data:` au PDF ; l'aperçu fait pareil côté navigateur (https accepté) ; chez Jérôme comme chez les clients ; placer le logo carré (26 mm) ; test statique.
