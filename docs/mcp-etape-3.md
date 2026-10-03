# Étape 3 du serveur MCP : lecture du CRM (guide pour Jérôme)

Référence : `plan-mcp.md`, sections 5.1, 5.3 et 5.9. Après cette étape, **Claude Code peut lire ton CRM** par `https://chevalier-ia-os.web.app/mcp` : chercher, ouvrir une fiche, lister les affaires et les activités, lire les réglages et le journal d'audit. **Rien ne peut encore être écrit** : aucun outil d'écriture n'existe.

## Ce qui est livré

- `scripts/preparer-fonctions.js` : copie `js/modules/crm/logique.js` dans `functions/partage/` pour que le serveur applique **exactement les mêmes règles que l'écran** (recherche, filtres, fil, dates de Paris). La copie est refaite avant chaque déploiement (`predeploy` de `firebase.json`) et avant chaque test ; elle n'est jamais commitée (`functions/partage/` est ignoré par git). Un test vérifie qu'elle est identique, octet pour octet.
- `functions/src/coeur/` : accès aux données (Firestore avec l'identité du projet, ou mémoire pour les tests), mise en JSON des dates, fonctions de lecture.
- 9 outils au total, ouverts aux trois profils (lecteur, bibliothécaire, Claude Code) :

| Outil | Ce qu'il fait |
|---|---|
| `qui_suis_je` | acteur, profil, outils autorisés, version |
| `chercher` | personnes, organisations, affaires par leur nom (comme la recherche de l'écran) |
| `lire_personne`, `lire_organisation`, `lire_affaire` | la fiche avec ses liens ; `avecFil: true` ajoute le fil (activités faites, notes, événements) |
| `lister_affaires` | filtres étape, statut, archivées, personne, organisation, texte, en retard, sans action |
| `lister_activites` | par affaire, personne ou organisation ; faites ou à faire ; en retard |
| `lister_documents` | les documents joints aux affaires (libellé, adresse) |
| `lire_reglages` | offres, secteurs, sources, étiquettes, réglages et référentiels (étapes, statuts…) |
| `lire_audit` | le journal des écritures par les outils (vide tant que l'étape 4 n'est pas faite) |

Les réponses sont plafonnées à 200 lignes (le champ `tronque` le signale). Aucune réponse ne contient de Timestamp Firestore : les dates sont en texte ISO.

## Écart avec le plan (à connaître)

Le plan plaçait ici l'**extraction des enchaînements d'écriture de `donnees.js` vers `logique.js`**. Je l'ai **reportée à l'étape 4**, où les écritures en ont besoin : elle touche l'écran (98 parcours à rejouer) et n'apporte rien à la lecture. Conséquence : cette étape ne modifie **aucun fichier de l'appli** (`js/` est inchangé, la version reste 2.0.0).

## Ce que tu fais

1. **Rien dans la console Google** pour cette étape. *(Depuis le 03/10/2026, la fonction tourne avec le compte dédié `mcp-serveur`, qui a le droit « Utilisateur Cloud Datastore » : voir `securite-et-pannes.md`.)*
2. **Sur ton Mac**, dans le dossier du dépôt : `git fetch origin`, `git checkout mcp-etape-3`, `git pull`, puis `cd tests && npm install && npm run installer-fonctions && npm test` (comme dans le README). Tout doit passer. *(Si tu fusionnes sans l'avoir fait, le risque est faible : cette étape ne touche pas l'appli.)*
3. **Fusionner la PR.** Le déploiement dure environ 1 à 3 minutes.
4. **Essai avec `curl`** (ton jeton est dans la variable `CHEVALIER_MCP_TOKEN`, voir `mcp-etape-2.md`) :

```sh
curl -s -X POST https://chevalier-ia-os.web.app/mcp \
  -H "Authorization: Bearer $CHEVALIER_MCP_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lister_affaires","arguments":{"limite":3}}}'
```

Résultat attendu : tes vraies affaires (titre, étape, statut, personne, organisation). `tools/list` (à la place de `tools/call`, sans `params`) donne les 9 outils. Un problème de droit Firestore se verrait comme une erreur d'outil (`PERMISSION_DENIED`) : voir `securite-et-pannes.md`.

## Résultat (03/10/2026)

Validée en réel par Jérôme : `lister_affaires` renvoie ses vraies affaires (titre, étape, statut, personne, organisation résolus) et `tools/list` liste les outils, d'abord avec le compte par défaut, puis avec le compte dédié `mcp-serveur`. Suite complète exécutée avant la fusion : règles 112, statiques 37, jetons, MCP et lecture 49, parcours navigateur 98 sur 98.

## Ce qui a été vérifié

Tests (hors émulateurs et avec l'émulateur Firestore) : recherche, fiches, listes, réglages, audit, schémas d'arguments, plafonds, **parité avec les fonctions de l'écran** (mêmes résultats que `rechercherSuggestions` et `filtrerAffaires` sur les mêmes données), copie identique de `logique.js`, **lecture seule** (aucune écriture dans le code de lecture, interface d'accès sans méthode d'écriture), journaux sans contenu. L'accès réel à Firestore (SDK d'administration, Timestamps) donne les mêmes réponses que les données en mémoire.
**Non vérifié** : l'accès à tes vraies données depuis la fonction déployée (premier essai ci-dessus), et le comportement avec une base volumineuse (plafond de 200 lignes par réponse ; tout est chargé en mémoire par appel, à surveiller au-delà de quelques milliers de fiches).
