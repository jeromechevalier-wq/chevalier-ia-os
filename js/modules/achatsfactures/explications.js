// Textes d'explication des contrôles (infobulles et fenêtre « Nos contrôles anti-arnaque »), PR 8b, portés de l'appli BTP (explications.ts).
// Règles : français simple ; aucun chiffre de statistique ; ne jamais écrire qu'un contrôle réussi prouve l'authenticité de la facture.
// Écart voulu avec l'appli d'origine : le texte du contrôle « Destinataire » dit « l'entreprise de l'espace » (le dépôt est public : aucun nom d'entreprise réelle n'y est écrit).

export const AVERTISSEMENT_LONG = 'Ces contrôles sont une aide, pas une garantie. En cas de doute, appelle le fournisseur sur un numéro que tu connais déjà, jamais celui figurant sur la facture.';
export const AVERTISSEMENT_COURT = 'Ces contrôles sont une aide, pas une garantie : en cas de doute, appelle le fournisseur sur un numéro que tu connais déjà, jamais celui de la facture.';
export const INFO_COMPTE = 'Compte bancaire : non vérifié par l’outil. Ta banque peut te signaler un nom de bénéficiaire qui ne correspond pas lors du virement.';

export const EXPLICATIONS = {
  totaux: {
    quoi: 'Vérifie que le total hors taxes plus la TVA donne bien le total TTC écrit sur la facture.',
    cas: 'Une facture de 100 € HT avec 20 € de TVA doit afficher 120 € TTC. Si elle affiche 130 €, il y a une erreur, ou le document a été modifié.',
    limite: 'Cela ne prouve pas que les prix sont justes, ni que les travaux ou les produits ont bien été fournis. L’outil a aussi pu mal lire un chiffre.',
    faire: 'Compare avec le PDF. Si l’écart est réel, demande une facture corrigée au fournisseur.',
  },
  siret: {
    quoi: 'Vérifie que le numéro SIRET du fournisseur existe dans l’annuaire officiel des entreprises, que l’entreprise est en activité et que son nom ressemble à celui écrit sur la facture. Sans aucun numéro SIREN ni SIRET sur la facture, le contrôle est rouge. Avec le SIREN seul (sans SIRET), il est orange : l’agence du fournisseur n’est pas identifiée avec certitude. Si l’annuaire officiel est indisponible, le contrôle est « non fait » : il reste à confirmer, il n’est jamais vert.',
    cas: 'Une facture porte un SIRET qui n’existe pas, ou celui d’une entreprise fermée : le numéro est faux ou recopié d’ailleurs.',
    limite: 'Un SIRET qui existe prouve seulement que cette entreprise existe. Cela ne prouve pas que la facture vient d’elle : le numéro d’une vraie entreprise peut être recopié sur une autre facture.',
    faire: 'Cherche l’entreprise toi-même et compare son nom et son adresse avec la facture. Au besoin, appelle-la sur un numéro que tu connais déjà.',
  },
  destinataire: {
    quoi: 'Vérifie que la facture est bien adressée à l’entreprise de l’espace (nom, numéro SIREN ou SIRET, adresse).',
    cas: 'Une facture adressée à une autre société, ou sans numéro d’identification, peut être destinée à quelqu’un d’autre et arriver ici par erreur.',
    limite: 'Une facture bien adressée à ton entreprise ne prouve pas que tu as commandé ou reçu ce qu’elle indique.',
    faire: 'Vérifie que cette facture correspond à un achat ou à un chantier que tu connais. Sinon, refuse-la en écrivant le motif.',
  },
  doublon: {
    quoi: 'Cherche si une facture du même fournisseur avec le même numéro a déjà été reçue ou acceptée.',
    cas: 'Un fournisseur envoie deux fois la même facture : sans ce contrôle, elle pourrait être payée deux fois.',
    limite: 'L’outil compare les numéros lus sur les factures. Si un numéro a été mal lu ou a été changé, un doublon peut passer inaperçu.',
    faire: 'Ouvre la facture déjà acceptée. Si c’est la même, refuse celle-ci avec le motif « doublon ».',
  },
  iban: {
    quoi: 'Vérifie que l’IBAN (les coordonnées bancaires) lu sur la facture est bien écrit : pays connu, bonne longueur et clé de contrôle correcte.',
    cas: 'Un IBAN avec un chiffre faux, par erreur de frappe ou parce qu’il est inventé, est repéré avant le virement.',
    limite: 'Un IBAN bien écrit ne prouve pas à qui appartient le compte : n’importe qui peut avoir un IBAN valide. L’outil ne vérifie pas le titulaire du compte.',
    faire: 'IBAN invalide : compare avec le PDF, l’outil a peut-être mal lu ; si c’est bien écrit ainsi, demande l’IBAN au fournisseur. IBAN étranger : normal pour certains fournisseurs ; si tu ne l’attendais pas, fais-le confirmer par le fournisseur.',
  },
  'iban-historique': {
    quoi: 'Compare l’IBAN de la facture avec ceux des factures déjà acceptées pour le même fournisseur (même SIREN). Seules les factures acceptées servent de référence.',
    cas: 'Quelqu’un se fait passer pour un fournisseur habituel et envoie une facture avec d’autres coordonnées bancaires : l’IBAN n’est plus celui des factures précédentes.',
    limite: 'Un fournisseur peut changer de banque pour de bonnes raisons. Un IBAN identique ne prouve pas non plus que la facture est vraie. Pour un premier IBAN, il n’y a rien à comparer.',
    faire: 'Appelle le fournisseur sur un numéro que tu connais déjà (pas celui de la facture ni de l’e-mail) pour faire confirmer l’IBAN avant d’accepter.',
  },
  'iban-partage': {
    quoi: 'Cherche si le même IBAN apparaît sur des factures d’un autre fournisseur (un autre SIREN). Facture acceptée : rouge. Facture à valider : orange. Facture refusée : ignorée si ce fournisseur est le titulaire connu du compte (il a déjà une facture acceptée avec cet IBAN), sinon orange : un refus ne doit pas effacer la mémoire d’un IBAN frauduleux ni accuser le vrai titulaire.',
    cas: 'Le même compte bancaire sur les factures de deux entreprises différentes peut indiquer que ce compte n’appartient pas au fournisseur annoncé.',
    limite: 'Cas normal possible : une société d’affacturage, qui encaisse les factures de plusieurs entreprises, ou un groupe qui paie sur un compte commun. Un IBAN qui n’est partagé avec personne ne prouve rien.',
    faire: 'Appelle le fournisseur sur un numéro que tu connais déjà et demande-lui pourquoi ce compte est utilisé.',
  },
  'adresse-envoi': {
    quoi: 'Compare l’adresse e-mail qui a envoyé la facture à l’outil avec celle des factures déjà acceptées du même fournisseur.',
    cas: 'Un fournisseur écrit toujours depuis la même adresse, puis une facture arrive d’une adresse qu’on n’a jamais vue.',
    limite: 'C’est un signal faible : un fournisseur peut changer d’adresse, et une adresse peut être imitée ou piratée. Si un collègue a transféré la facture, c’est son adresse qui est comparée.',
    faire: 'Si l’adresse est nouvelle, vérifie la facture avec le fournisseur sur un numéro que tu connais déjà.',
  },
  lignes: {
    quoi: 'Compare la somme des lignes lues sur la facture (désignation, quantité, prix) avec le total hors taxes écrit en bas de la facture. Si les lignes n’ont pas pu être lues, le contrôle reste gris.',
    cas: 'Une ligne oubliée, un prix modifié ou un total retouché : la somme des lignes ne correspond plus au total hors taxes.',
    limite: 'Une somme qui tombe juste ne prouve pas que les prix sont corrects ni que les produits ont été livrés. L’outil a aussi pu mal lire une ligne.',
    faire: 'Compare le tableau des lignes avec le PDF. Si l’écart est réel, demande une facture corrigée au fournisseur.',
  },
};

/** Contrôles à venir : ce qu'ils vérifieront. */
export const BIENTOT = [
  { id: 'bientot-taux-de-tva', titre: 'Taux de TVA', quoi: 'Vérifiera que le taux de TVA appliqué est un taux qui existe en France (par exemple 20 %, 10 % ou 5,5 %).' },
  { id: 'bientot-dates', titre: 'Dates', quoi: 'Vérifiera que la date de la facture est cohérente (pas dans le futur, pas trop ancienne).' },
  { id: 'bientot-n-de-tva-intracommunautaire', titre: 'N° de TVA intracommunautaire', quoi: 'Vérifiera que le numéro de TVA du fournisseur est valide.' },
];

/** Ordre et titres des contrôles actifs, pour la fenêtre qui les liste tous. */
export const ACTIFS = [
  { id: 'totaux', titre: 'Totaux' },
  { id: 'siret', titre: 'SIRET du fournisseur' },
  { id: 'destinataire', titre: 'Destinataire' },
  { id: 'doublon', titre: 'Doublon' },
  { id: 'iban', titre: 'IBAN' },
  { id: 'iban-historique', titre: 'IBAN et historique du fournisseur' },
  { id: 'iban-partage', titre: 'IBAN partagé' },
  { id: 'adresse-envoi', titre: 'Adresse d’envoi' },
  { id: 'lignes', titre: 'Lignes' },
];
