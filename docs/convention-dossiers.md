# Convention de nommage des dossiers de `Projets/`

> **Historique (16/10/2026)** : l'OS n'impose plus de convention de nommage (chantier « Liens et documents », `google-drive.md`). Ce texte ne vaut que pour le rangement du dossier `Projets/` de Jérôme.

Rédigée le 03/10/2026, **validée par Jérôme dans son principe** (cinq préfixes, un seul niveau). Rien n'est encore renommé : le tableau de la section 5 est un plan, à exécuter dossier par dossier.

Besoin : ne plus se perdre dans `Mon Drive/Chevalier-AI/Projets/`, qui doit pouvoir passer de 14 à 40 dossiers sans devenir illisible.

## 1. Le principe

**Un seul niveau, aucun sous-dossier de rangement. Le préfixe fait le tri :** dans le Finder, l'ordre alphabétique regroupe tout seul les dossiers qui ont le même préfixe.

## 2. Le nom

`préfixe-sujet`, en minuscules, avec des tirets, **sans espace, sans accent, sans parenthèse**. Exemple : `client-depannage-carrel-appli-devis`.

## 3. Les cinq préfixes

| Préfixe | Pour quoi | Exemple |
|---|---|---|
| `client-` | tout ce que tu fais pour un client, y compris son site ou son appli. Si tu le factures, c'est `client-` | `client-plongee-passion-carry` |
| `produit-` | ce que tu pourrais **vendre à plusieurs clients** (code, démo, kit marketing) | `produit-suivi-eleves-yoga` |
| `site-` | un site web à toi | `site-chevalier-ia` |
| `interne-` | Chevalier IA pour toi-même : l'OS, les outils, le marketing, la prospection | `interne-chevalier-ia-os` |
| `perso-` | ce qui est personnel | `perso-locations-reunion` |

Le préfixe `_` est réservé au système : `_JEROME_OS`, `_outils`, `_archives`. Ils ne changent pas.

**Le test pour choisir entre `produit-` et le reste** : « pourrais-je le vendre à plusieurs clients ? » Si oui, `produit-`. Sinon, `interne-` (pour toi) ou `client-` (pour un seul client).

## 4. Trois règles

1. **Un seul niveau** dans `Projets/`.
2. **Un dossier n'existe que s'il a une fiche dans l'OS** (une affaire ou un projet), ou si c'est un produit. Pas de dossier « au cas où ».
3. **Quand c'est fini, le dossier va dans `_archives/`** : un seul dossier d'archives, rien n'est supprimé.

**Quand une chose change de nature** (un projet client devient un produit) : le nom reflète ce qu'elle est **aujourd'hui**. On renomme **une seule fois**. Dans l'OS cela ne coûte rien, parce que le lien du dossier pointe par l'identifiant Drive et non par le nom.

**Un client et un produit sont deux dossiers.** Exemple : le produit de suivi des élèves de yoga (`produit-suivi-eleves-yoga`) et la relation avec une cliente (`client-audrey-shanti-yoga`, créé le jour où il y a un devis ou une facture à ranger). Dans l'OS, le produit est un **projet sans affaire** ; la relation avec la cliente est une affaire ou un projet à part.

## 5. Ton dossier `Projets/` aujourd'hui (plan, rien n'est fait)

| Aujourd'hui | Après |
|---|---|
| `_JEROME_OS`, `_outils` | inchangés |
| `chevalier-ia-os` | `interne-chevalier-ia-os` |
| `chevalier-ia (constructor)` (kit de construction de la version 1, doublon du dépôt) | `_archives/interne-chevalier-ia-os-kit-v1`, après avoir regardé le contenu de `Claude outputs` |
| `audrey-suivi-eleves` | `produit-suivi-eleves-yoga` (nom pris de l'adresse publique `app.chevalier-ia.fr/suivi-eleves-yoga/`, la seule qui ne changera pas) |
| `eliot-devis-depannage` | `client-depannage-carrel-appli-devis` |
| `plongee passion carry` | `client-plongee-passion-carry` |
| `site-chevalier-ia` | inchangé, il respecte déjà la règle |
| `site_massagesen soriel` | `site-massage-sensoriel` (ou `client-massage-sensoriel` si tu le factures) |
| `marketing - carte visite et flyer` | `interne-marketing-carte-visite-flyer` |
| `marketing - videos` | `interne-marketing-videos` |
| `projet-recherche-locations-reunion` | `perso-locations-reunion` |
| `pension alimentaire` | `perso-pension-alimentaire` |
| `audrey-suivi-eleves.zip`, `chevalier-ia-os-v1.zip`, `site-chevalier-ia.zip` | `_archives/` |

Résultat visible dans le Finder : `_archives`, `_JEROME_OS`, `_outils`, puis les `client-`, `interne-`, `perso-`, `produit-` et `site-` regroupés par ordre alphabétique.

## 6. Précautions au moment de renommer

1. **Un dossier à la fois**, avec Claude Code sur le Mac et la confirmation de Jérôme à chaque étape (règle de `_JEROME_OS/CLAUDE.md`). Jamais de suppression.
2. **Avant chaque renommage**, vérifier qu'aucun script ne cite l'ancien chemin (par exemple `Projets/_outils/publier.sh` et les fichiers `publier.conf`).
3. **Dossier qui est un clone Git** : Git ne dépend pas du nom du dossier, mais GitHub Desktop demande ensuite de « relocaliser » le dépôt.
4. **Le nom du dossier n'a pas à reprendre celui du dépôt GitHub** : l'OS garde les deux liens, `urlGithub` et `urlDossier`.

## 7. Lien avec l'OS

- **Comment on retrouve un dossier** : on ne fouille pas le Finder. On ouvre l'affaire ou le projet dans l'OS et on clique sur le lien du dossier.
- **Champ `urlDossier`** (adresse du dossier Drive, voisin de `urlGithub`) : **décidé le 03/10/2026**, sur chaque affaire et chaque projet. Facultatif, doit être une adresse de dossier Drive. Un projet issu d'une affaire reprend celui de l'affaire. Construit le 03/10/2026 pour les affaires, avec `urlGithub` (version 2.0.1) ; les projets l'auront avec l'écran Projets.
- **Bouton « Créer le répertoire »** : un nom proposé et un prompt à coller dans Claude Code, qui crée le dossier avec la structure du préfixe. Voir `modele-prompt-creation-dossier.md` (structure décidée : `PROJET.md`, `app/`, `marketing/`).
- Une URL de dossier Drive n'existe qu'une fois le dossier créé (`https://drive.google.com/drive/folders/<identifiant>`) : elle se colle à la création du dossier.
