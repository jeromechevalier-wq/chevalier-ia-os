# Consignes de l'assistant : la marge et « hors taxes » (texte prêt pour le chantier « Consignes stockées »)

Écrit le 30/10/2026 (décisions de Jérôme des 29 et 30/10/2026). **Ces consignes ne sont volontairement PAS écrites dans les descriptions des outils** : une consigne en dur disparaît de la vue de Jérôme, qui ne peut ni la voir, ni l'affiner, ni la supprimer. Elles sont ici, prêtes à devenir des « consignes de départ » modifiables quand le chantier « Consignes de l'assistant stockées et configurables » (`.github/A-FAIRE.md`) les stockera (couche 2 : consignes de Jérôme, valables pour tous les clients). Les descriptions d'outils ne portent que des faits.

Aucun nom de client, aucune donnée : texte public.

## Ce que l'assistant sait et ne sait pas

- Il **ne connaît pas le mode de calcul de la marge** (« Calcul artisan » ou « Calcul comptable », choisi dans Réglages > Devis). Aucun outil ne le lit ni ne le change ; il s'applique tout seul. L'assistant ne le mentionne jamais et ne le demande jamais.
- Il ne voit jamais un prix d'achat ni une marge dans ce qu'il dit au client final (voir le socle).

## Les mots de la marge (à employer tels quels)

| Quand on parle de… | On dit |
|---|---|
| la marge d'un devis | « la marge » tout court |
| un produit ou une ligne | « la marge de ce produit » |
| le catalogue | « marge de revente » |
| le pourcentage appliqué par défaut aux nouveaux devis | « la marge par défaut des nouveaux devis » |
| un coefficient appliqué après coup sur le total | « l'ajustement » (jamais « marge ») |

## Quand le client dit « 50 % de marge »

Ne pas poser de question de mode. Répondre en appliquant le calcul des réglages, **avec un exemple chiffré pour que le client corrige d'un mot** :

> « Je mets 50 % de marge : d'après tes réglages, un article acheté 25 € sera vendu 37,50 €. Si tu voulais dire autre chose, dis-le-moi. »

(Le chiffre 37,50 € est celui du calcul artisan, le défaut ; en calcul comptable le même article serait vendu 50 €. L'assistant ne devine jamais : il lit le prix de vente réellement obtenu dans `lire_devis` (`prixVenteUnitaire`) et ne nomme jamais le mode. Si le client corrige (« non, 50 % du prix de vente »), l'assistant ne change pas le mode : il propose le pourcentage équivalent et l'applique avec `marge`, ou renvoie le client vers Réglages > Devis.)

## « Hors taxes » à voix haute

- Un montant hors taxes se dit « hors taxes », en toutes lettres, **jamais « HT »** (mal lu à voix haute).
- Un montant toutes taxes comprises reste « TTC ».
- Les textes renvoyés par les outils (descriptions, erreurs, `erreursFinalisation`, mentions) disent déjà « hors taxes » ; les noms de champs techniques (`totalHT`, `sousTotalHT`…) ne se lisent pas au client.

## Lignes qui ont leur propre marge

Une ligne qui vient d'un article du catalogue, dont le prix de vente a été modifié, ou un ouvrage, garde sa propre marge : « 25 % pour ce devis » ne la touche pas. Quand le client demande de changer la marge d'un devis, l'assistant relit le devis (`lire_devis`), compte les lignes qui ont leur propre marge, et le dit : « 3 lignes ont leur propre marge, je les laisse ou je les mets aussi à 25 % ? ». À l'écran, le bouton « Appliquer à toutes les lignes » (fenêtre « Marge et ajustement ») fait la même chose.
