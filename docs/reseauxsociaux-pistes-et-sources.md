# Réseaux sociaux : des sources aux pistes, aux idées et aux posts (écrit le 12/11/2026)

Écrit pour Jérôme. Version 2.44.0. Le module Réseaux sociaux sait maintenant transformer ce qui t'inspire (un profil LinkedIn, un site, un résumé de veille) en pistes de posts. Aucun secret ici.

## 1. Le chemin

**Sources → Pistes → Idées → Posts.**

- **Source** : un profil LinkedIn, un site ou un résumé de veille (écran Inspirations).
- **Piste** : un angle de post pour toi, écrit avec nos mots (200 caractères au plus). Une piste est nouvelle, retenue ou écartée. Une piste écartée n'est jamais supprimée.
- **Idée** : une piste retenue devient une idée (écran Idées), avec son lien vers la piste d'origine.
- **Post** : l'idée passe dans Buffer, puis dans l'écran Posts.

## 1 bis. Une idée élaborée (12/11/2026)

Chaque ligne de source s'ouvre sur **10 à 30 idées prêtes à servir de post** : une accroche, un **brouillon** (1 500 caractères au plus), **tous les piliers concernés** (de 1 à 4, le premier est le principal), une **proposition de visuel ou d'animation** (400 caractères au plus), la note « pourquoi ». Il n'y a plus de bouton « En tirer des idées » sur la ligne : l'appli n'appelle aucune IA (décision de Jérôme), le stock est rempli par Claude avec l'outil `ajouter_pistes` (ou par collage, lien discret dans la source quand elle a moins de 10 idées). « En faire une idée » emporte le brouillon dans l'idée.

## 2. À l'écran : prompt copié, réponse collée

1. Dans Inspirations, tu ouvres une source et tu cliques pour **copier le prompt**. Il contient la fiche de la source, les valeurs permises (pilier, format, service), tes pistes déjà en stock et le modèle de réponse.
2. Tu colles ce prompt dans Claude. Claude répond dans le format `pistes-v1`.
3. Tu **colles la réponse** dans l'appli. Un **aperçu** s'affiche d'abord : rien n'est écrit tant que tu n'as pas validé. 30 pistes au plus par collage.

## 3. La carte mentale

Un clic sur « Carte » d'une source ouvre la carte : la source au centre, une branche par pilier, les pistes au bout des branches. Au-delà de 30 pistes, la carte se replie. Elle ne fait que lire, elle n'écrit rien. Un clic sur une piste ramène à la liste, remise à zéro pour que la piste se voie.

## 4. Les 12 outils MCP

Claude peut faire la même chose sans écran. 4 outils de lecture : `lister_sources_inspiration`, `lire_source_inspiration`, `lister_pistes`, `lister_idees`. 8 outils d'écriture : `creer_source_inspiration`, `modifier_source_inspiration`, `ajouter_pistes`, `modifier_piste`, `retenir_piste`, `enregistrer_exemple`, `creer_idee`, `modifier_idee`. **Aucun outil de suppression** : une piste s'écarte, une idée s'abandonne. Ils servent à saisir les données (pistes de HeraHub, profils, résumés de veille) après ton accord.

## 5. Les garde-fous

- **Jamais le texte d'un post d'un tiers** : on garde l'adresse du post, une analyse écrite par nous, et au plus 400 caractères d'extrait.
- Liste fermée de champs : un champ inconnu est refusé.
- Le prompt ne nomme aucun auteur en dur (il prend « moi » par défaut).
- Les tables : voir `reseauxsociaux_pistes` dans [tables.md](tables.md). La table n'existe qu'à la première écriture et passe par le joker de `firestore.rules`.

## 6. Ce qui n'est pas vérifié

Les écrans (Inspirations dense, carte, aperçu du collage) n'ont pas été vus par un humain ; rien n'a été lancé avec de vraies données ; les outils MCP des pistes n'ont pas été essayés sur le serveur déployé.
