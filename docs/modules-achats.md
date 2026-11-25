# Les modules Achats (portés le 25/11/2026)

Cinq modules, repris de l'ancienne appli BTP et portés dans Chevalier IA OS : **Fournisseurs**, **Chantiers**, **Articles**, **Factures** et **Tableau de bord 2**. Ils sont rangés dans un seul bloc de menu « Achats ».

## Qui les voit

Seulement le propriétaire de l'espace (`seulJerome`, décision du 24/11/2026). Un client ne peut ni les activer ni les nommer, et ils ne sont jamais dans son menu. Ouvrir ces modules aux clients est un chantier séparé (voir « Ce qui n'est PAS fait »).

La vraie barrière est la base elle-même : sans le badge donné par la fonction `baseAccorderAcces` (réservée au propriétaire), elle ne répond rien.

## Où sont les données

Pas dans Firebase : dans la base de l'espace. Les cinq modules ont donc `collections` vide dans `js/os/registre.js`. Seule nouveauté côté Firebase : le document `base_parametres/connexion`, qui garde les réglages de connexion (seul le propriétaire peut l'écrire, règle dans `firestore.rules`). Aucune autre collection Firestore n'est créée.

## Comment ils lisent

Toujours par la couche `js/os/supabase.js` : elle demande un badge Firebase, puis lit la base. Aucun module ne fait son propre `fetch` vers la base (un test le verrouille).

## Comment ils écrivent

Par les workflows n8n, avec un ticket à usage unique, via `js/os/actions-metier.js`. Ce fichier est le seul à parler à n8n ; on ne le recopie pas dans un module. Pour « + Facture », le fichier PDF part en pièce jointe (multipart).

## Réglages de connexion

Réglages > « Connexion à la base » (visible du propriétaire seul). Le code n'écrit aucune adresse ni clé : tout vient de ces réglages.

## Export des données

Chaque module a sa section « Sauvegarde » dans ses réglages (règle du 27/10/2026) : `reglages-export-achatsfournisseurs`, `-achatschantiers`, `-achatsarticles`, `-achatsfactures`, `-tableauachats`.

## Ce qui n'est PAS fait

Liste vivante : `.github/A-FAIRE.md` (parties « modules Achats »). En bref :

- ouverture aux clients (réglage de la base par client, règle de la plateforme pour `base_parametres`, fonction du badge côté plateforme) ;
- essai de bout en bout avec un vrai badge (tout est testé avec un faux réseau) ;
- droit d'accès du compte de service dédié à la fonction du badge ;
- pastille « Destinataire » des factures (reste « indisponible ») ;
- lien « Ouvrir la fiche » quand une facture est en doublon ;
- favoris : la nouvelle table remplace les anciennes étoiles, qui sont à refaire.

Le rapport de fin de chantier est dans `docs/reprise-prochaine-session.md`.
