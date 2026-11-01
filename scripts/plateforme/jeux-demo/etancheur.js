// Jeu de démonstration « étancheur » : toiture-terrasse, balcon, isolation, recherche de fuite, entretien. Tout est INVENTÉ (prix de vente HT arrondis, aucune marque).
export default Object.freeze({
  id: 'etancheur',
  nom: 'Étancheur',
  motOuvrage: 'ouvrage',
  entreprise: { nom: 'Étanchéité Démo', forme: 'SARL' },
  tvaReduite: true,
  voie: 'rue des Toitures',
  dechets: true,
  // Sous-familles propres au métier ; de départ, seules celles encore pertinentes restent actives et utilisées (Échafaudage, Location d'engins, Déchets, Déplacement, Protection de chantier), les autres sont masquées.
  familles: [
    ['etanch-1', 'Toiture-terrasse', 'famille-1'], ['etanch-2', 'Isolation', 'famille-1'], ['etanch-3', 'Toiture-terrasse', 'famille-2'],
    ['etanch-4', 'Recherche de fuite et entretien', 'famille-2'], ['etanch-5', 'Prestations complètes', 'famille-3'],
  ],
  famillesMasquees:
    ['famille-1-1', 'famille-1-2', 'famille-1-3', 'famille-1-4', 'famille-1-5', 'famille-1-6', 'famille-1-7', 'famille-1-8', 'famille-1-9',
    'famille-2-1', 'famille-2-2', 'famille-2-3', 'famille-2-4', 'famille-2-5', 'famille-2-6', 'famille-2-7', 'famille-2-8', 'famille-2-9',
    'famille-3-1', 'famille-3-2', 'famille-3-3', 'famille-3-4', 'famille-3-5', 'famille-4-2', 'famille-4-3', 'famille-4-4', 'famille-4-5',
    'famille-5-2', 'famille-6-1', 'famille-6-2'],
  // [id, libellé, unité, prix de vente HT, type, famille]
  articles: [
    ['et-f01', 'Membrane bitumineuse auto-adhésive', 'm²', 20, 'fourniture', 'etanch-1'],
    ['et-f02', 'Membrane synthétique d’étanchéité', 'm²', 24, 'fourniture', 'etanch-1'],
    ['et-f03', 'Résine d’étanchéité polyuréthane (seau 15 kg)', 'u', 160, 'fourniture', 'etanch-1'],
    ['et-f04', 'Primaire d’accrochage (bidon 5 L)', 'u', 50, 'fourniture', 'etanch-1'],
    ['et-f05', 'Isolant rigide 80 mm', 'm²', 25, 'fourniture', 'etanch-2'],
    ['et-f06', 'Pare-vapeur', 'm²', 5, 'fourniture', 'etanch-2'],
    ['et-f07', 'Bande de renfort pour relevé', 'ml', 12, 'fourniture', 'etanch-1'],
    ['et-f08', 'Naissance d’évacuation des eaux de pluie', 'u', 45, 'fourniture', 'etanch-1'],
    ['et-f09', 'Gravillons de protection', 'm²', 6, 'fourniture', 'etanch-1'],
    ['et-f10', 'Joint de dilatation', 'ml', 20, 'fourniture', 'etanch-1'],
    ['et-f11', 'Mastic d’étanchéité (cartouche)', 'u', 10, 'fourniture', 'etanch-1'],
    ['et-f12', 'Peinture réfléchissante de protection', 'm²', 12, 'fourniture', 'etanch-1'],
    ['et-m01', 'Heure d’étancheur', 'h', 55, 'main_oeuvre', 'etanch-3'],
    ['et-m02', 'Heure d’aide de chantier', 'h', 38, 'main_oeuvre', 'etanch-3'],
    ['et-m03', 'Pose de membrane', 'm²', 30, 'main_oeuvre', 'etanch-3'],
    ['et-m04', 'Application de résine', 'm²', 28, 'main_oeuvre', 'etanch-3'],
    ['et-m05', 'Pose d’isolant', 'm²', 20, 'main_oeuvre', 'etanch-3'],
    ['et-m06', 'Recherche de fuite', 'forfait', 280, 'main_oeuvre', 'etanch-4'],
    ['et-m07', 'Dépannage d’une fuite', 'forfait', 190, 'main_oeuvre', 'etanch-4'],
    ['et-m08', 'Entretien annuel de toiture-terrasse', 'forfait', 240, 'main_oeuvre', 'etanch-4'],
    ['et-s01', 'Échafaudage (montage et démontage)', 'forfait', 650, 'sous_traitance', 'famille-4-1'],
    ['et-e01', 'Nacelle élévatrice (à la journée)', 'jour', 220, 'materiel', 'famille-5-1'],
    ['et-d01', 'Évacuation des anciens revêtements', 'forfait', 250, 'divers', 'famille-7-1'],
    ['et-d02', 'Protection des abords', 'forfait', 90, 'divers', 'famille-7-3'],
    ['et-d03', 'Déplacement', 'forfait', 40, 'divers', 'famille-7-2'],
  ],
  // Les « ensembles » (le mot du métier) : [id, libellé, unité, famille, [[composant, quantité]]]
  ensembles: [
    ['et-o01', 'Étanchéité de toiture-terrasse en membrane', 'm²', 'etanch-5', [['et-f01', 1.1], ['et-f04', 0.04], ['et-m03', 1]]],
    ['et-o02', 'Réfection de balcon en résine', 'm²', 'etanch-5', [['et-f03', 0.2], ['et-f04', 0.1], ['et-m04', 1]]],
    ['et-o03', 'Isolation de toiture-terrasse', 'm²', 'etanch-5', [['et-f05', 1], ['et-f06', 1], ['et-m05', 1]]],
  ],
  // Mots appris (même modèle que MOTS_EXEMPLE) : un mot pour un article, des mots pour plusieurs articles au choix, un validé par les réponses, un à confirmer, un désactivé.
  mots: [
    { expression: 'membrane', articles: ['et-f01'], statut: 'active', validation: 'humain' },
    { expression: 'résine', articles: ['et-f03', 'et-m04'], statut: 'active', validation: 'humain' },
    { expression: 'fuite', articles: ['et-m06', 'et-m07'], statut: 'active', appris: 'apprise_question', validation: 'reponses', exemple: 'il y a une fuite sur le toit' },
    { expression: 'terrasse', articles: ['et-o01'], statut: 'active', appris: 'apprise_correction', validation: 'reponses', exemple: 'refaire la terrasse du dernier étage' },
    { expression: 'balcon', articles: ['et-o02'], statut: 'active', validation: 'humain' },
    { expression: 'isolant', articles: ['et-f05'], statut: 'active', validation: 'humain' },
    { expression: 'entretien', articles: ['et-m08'], statut: 'a_confirmer', appris: 'apprise_question', exemple: 'un entretien de la toiture chaque année' },
    { expression: 'gravier', articles: ['et-f09'], statut: 'desactivee', validation: 'humain' },
  ],
  organisations: [
    ['Copropriété Les Hirondelles', 'Lyon', 'Services'], ['Résidence Le Belvédère (syndic)', 'Villeurbanne', 'Services'], ['Entrepôt Logistique du Sud', 'Vénissieux', 'Industrie'],
    ['Gymnase municipal des Prés', 'Bron', 'Associatif'], ['Centre commercial du Pont', 'Lyon', 'Commerce'], ['Clinique des Cèdres', 'Écully', 'Services'],
    ['École primaire Les Marronniers', 'Caluire-et-Cuire', 'Associatif'], ['Hôtel de la Plage', 'Lyon', 'Commerce'], ['Atelier Bois & Métal', 'Décines', 'Industrie'],
    ['Résidence Les Platanes (syndic)', 'Oullins', 'Services'], ['Supermarché de la Gare', 'Saint-Priest', 'Commerce'], ['Salle des fêtes de la Mairie', 'Tassin-la-Demi-Lune', 'Associatif'],
    ['SCI Les Tilleuls', 'Lyon', 'Services'], ['Boulangerie du Vieux Four', 'Villeurbanne', 'Commerce'], ['Foyer Les Glycines', 'Sainte-Foy-lès-Lyon', 'Associatif'],
  ],
  travaux: [
    'Étanchéité de toiture-terrasse', 'Réfection de balcon', 'Recherche de fuite en toiture', 'Isolation de toiture-terrasse', 'Reprise des relevés d’étanchéité',
    'Étanchéité de terrasse accessible', 'Traitement d’une infiltration d’eau', 'Entretien annuel de toiture-terrasse', 'Remplacement des évacuations d’eaux de pluie',
    'Résine sur loggia', 'Réfection d’étanchéité de parking', 'Étanchéité de toit végétalisé', 'Dépannage fuite urgent', 'Réfection des acrotères',
  ],
  // Devis écrits à la main : un brouillon, un finalisé, un envoyé, un signé. Les autres devis viennent du tirage habituel, sur ce catalogue.
  vedettes: [
    { statut: 'brouillon', client: 'entreprise', travaux: 'Étanchéité de toiture-terrasse', objet: 'Étanchéité de la toiture-terrasse – 120 m²', sections: [
      { titre: 'Préparation', lignes: [['et-s01', 1], ['et-d02', 1], ['et-d01', 1]] },
      { titre: 'Toiture-terrasse', lignes: [['et-o01', 120], ['et-f07', 45], ['et-f08', 4]] },
    ] },
    { statut: 'en_attente_envoi', client: 'particulier', travaux: 'Réfection de balcon', objet: 'Réfection du balcon en résine – 8 m²', sections: [
      { titre: 'Balcon', lignes: [['et-o02', 8], ['et-f10', 6], ['et-d02', 1]] },
    ] },
    { statut: 'envoye', client: 'entreprise', travaux: 'Recherche de fuite en toiture', objet: 'Recherche et réparation d’une fuite en toiture', sections: [
      { titre: 'Recherche et réparation', lignes: [['et-m06', 1], ['et-m01', 6], ['et-f11', 4], ['et-f07', 10], ['et-d03', 1]] },
    ] },
    { statut: 'accepte', client: 'entreprise', travaux: 'Isolation de toiture-terrasse', objet: 'Isolation de la toiture-terrasse – 200 m²', acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' }, sections: [
      { titre: 'Isolation', lignes: [['et-o03', 200], ['et-f12', 200], ['et-d03', 1]] },
    ] },
  ],
});
