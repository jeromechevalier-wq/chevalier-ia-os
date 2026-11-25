// Jeu d'essai du module Achats « Tableau de bord 2 » : des données ENTIÈREMENT FICTIVES (dépôt public : aucun nom, SIREN ni adresse réels), au format des vues lues.
// `jour(n)` : le jour civil décalé de n jours (« AAAA-MM-JJ »), donné par le test, pour que les dates restent dans les douze derniers mois quel que soit le jour d'exécution.

const moisDe = (d) => `${d.slice(0, 7)}-01`;

export const FOURNISSEURS = {
  aciers: { id: 'f-aciers', nom: 'Aciers Essai SAS', siren: '999000111' },
  beton: { id: 'f-beton', nom: 'Béton Exemple SARL', siren: '999000222' },
  quinc: { id: 'f-quinc', nom: 'Quincaillerie Fictive', siren: '999000333' },
  negoce: { id: 'f-negoce', nom: 'Négoce Imaginaire', siren: '999000444' },
};
export const CHANTIERS = {
  c1: { id: 'c-maison', nom: 'Maison Essai', client: 'Client Fictif A' },
  c2: { id: 'c-garage', nom: 'Garage Démo', client: 'Client Fictif B' },
  c3: { id: 'c-atelier', nom: 'Atelier Test', client: 'Client Fictif C' },
};

export function jeuTableauAchats(jour) {
  let n = 0;
  const facture = (fournisseur, chantier, { statut = 'acceptee', montant, jours, type = 'facture', alertes = 0, malgre = false, archivee = null } = {}) => {
    n += 1;
    const d = jour(-jours);
    const statutFr = { acceptee: 'Acceptée', a_valider: 'À valider', refusee: 'Refusée' }[statut];
    return {
      facture_id: `fa-${n}`, fournisseur: fournisseur.nom, numero: `F-${1000 + n}`, chantier_id: chantier ? chantier.id : null, chantier: chantier ? chantier.nom : null, sans_chantier: !chantier,
      client: chantier ? chantier.client : null, type_document: type, statut, statut_fr: statutFr, montant_ht: montant, date_ref: d, mois: moisDe(d), created_at: `${d}T08:00:00Z`,
      date_decision: statut === 'a_valider' ? null : `${d}T10:00:00Z`, nb_alertes: alertes, acceptee_malgre_alerte: statut === 'acceptee' ? malgre : null, jours_attente: statut === 'a_valider' ? jours : null,
      date_future: false, fournisseur_affiche: fournisseur.nom, siret_agence: null, archivee_le: archivee,
    };
  };
  const { aciers, beton, quinc, negoce } = FOURNISSEURS;
  const { c1, c2, c3 } = CHANTIERS;
  const v_td_factures = [
    facture(aciers, c1, { montant: 4200, jours: 5 }), facture(beton, c1, { montant: 1800, jours: 20, alertes: 2, malgre: true }), facture(quinc, c2, { montant: 640, jours: 40 }),
    facture(aciers, c2, { montant: 3100, jours: 70 }), facture(negoce, c1, { montant: 900, jours: 100 }), facture(beton, c2, { montant: 2400, jours: 130 }),
    facture(aciers, c3, { montant: 1500, jours: 160 }), facture(quinc, c1, { montant: 320, jours: 190 }), facture(beton, c3, { montant: 2750, jours: 220 }),
    facture(aciers, c1, { montant: 2900, jours: 250 }), facture(negoce, c2, { montant: 800, jours: 280 }), facture(beton, c1, { montant: 1200, jours: 330 }),
    facture(aciers, null, { montant: 500, jours: 15 }), // acceptée, sans chantier
    facture(beton, c1, { montant: -300, jours: 12, type: 'avoir' }), // un avoir : se retire des totaux
    facture(aciers, c1, { montant: 760, jours: 3, statut: 'a_valider' }), // à valider, récente
    facture(quinc, c2, { montant: 410, jours: 420, statut: 'a_valider' }), // à valider, plus vieille que les douze mois : cachée par la Période, jamais en silence
    facture(negoce, c1, { montant: 230, jours: 60, statut: 'refusee' }),
    facture(quinc, c1, { montant: 999, jours: 50, statut: 'refusee', archivee: `${jour(-45)}T09:00:00Z` }), // refusée puis archivée : n'apparaît nulle part
  ];
  const v_td_chantiers = [
    { chantier_id: c1.id, chantier: c1.nom, client: c1.client, statut: 'en_cours', statut_fr: 'En cours', archive: false, budget_ht: 5000, budget_renseigne: true, accepte_ht: 4750, en_attente_ht: 760, reste_ht: 250, pct_budget_consomme: 95, niveau: 'a_surveiller' },
    { chantier_id: c2.id, chantier: c2.nom, client: c2.client, statut: 'en_cours', statut_fr: 'En cours', archive: false, budget_ht: 3000, budget_renseigne: true, accepte_ht: 3300, en_attente_ht: 410, reste_ht: -300, pct_budget_consomme: 110, niveau: 'depasse' },
    { chantier_id: c3.id, chantier: c3.nom, client: c3.client, statut: 'en_cours', statut_fr: 'En cours', archive: false, budget_ht: null, budget_renseigne: false, accepte_ht: 4250, en_attente_ht: 0, reste_ht: null, pct_budget_consomme: null, niveau: 'sans_budget' },
  ];

  // Lignes d'achat et articles.
  const A = { rond: 'art-rond', rondN: 'art-rond-negoce', vis: 'art-vis', beton: 'art-beton', treillis: 'art-treillis' };
  let l = 0;
  const ligne = (art, d, quantite, montant, extra = {}) => {
    l += 1;
    const date = jour(-d);
    return {
      ligne_id: `li-${String(l).padStart(3, '0')}`, facture_id: `fa-${l}`, numero: `F-${2000 + l}`, date_prix: date, fournisseur: art.fournisseur, etablissement_id: null, nom_agence: null, ville: null, chantier_id: null, chantier: null,
      article_fournisseur_id: art.id, reference_fournisseur: art.reference, designation: art.designation, unite: art.unite, unite_normalisee: art.unite, quantite, montant_ht: montant, prix_net: montant / quantite,
      article_reference_id: art.refId ?? null, libelle_reference: art.refNom ?? null, unite_reference: art.refUnite ?? null, coefficient: art.coef ?? null, prix_unite_reference: art.coef ? (montant / quantite) * art.coef : null,
      rapproche: Boolean(art.refId), origine_rapprochement: art.origine ?? null, ...extra,
    };
  };
  const rond = { id: A.rond, fournisseur: aciers.nom, reference: 'RB10', designation: 'Rond à béton HA10', unite: 'barre', refId: 'ref-rond', refNom: 'Rond à béton 10 mm', refUnite: 'kg', coef: 0.62, origine: 'valide' };
  const rondN = { id: A.rondN, fournisseur: negoce.nom, reference: 'N-10', designation: 'Rond béton 10 (barre 12 m)', unite: 'barre', refId: 'ref-rond', refNom: 'Rond à béton 10 mm', refUnite: 'kg', coef: 0.62, origine: 'automatique' };
  const vis = { id: A.vis, fournisseur: quinc.nom, reference: 'V550', designation: 'Vis inox 5x50 (boîte)', unite: 'boîte' };
  const betonA = { id: A.beton, fournisseur: beton.nom, reference: 'BET25', designation: 'Béton C25/30', unite: 'm3' };
  const treillis = { id: A.treillis, fournisseur: aciers.nom, reference: null, designation: 'Treillis soudé ST25', unite: 'panneau' };
  const v_td_prix_lignes = [
    ligne(rond, 300, 100, 500, { chantier_id: c1.id, chantier: c1.nom }), ligne(rond, 150, 100, 550, { chantier_id: c1.id, chantier: c1.nom }), ligne(rond, 20, 100, 600, { chantier_id: c2.id, chantier: c2.nom }),
    ligne(rondN, 100, 50, 300, { chantier_id: c2.id, chantier: c2.nom }), ligne(rondN, 10, 50, 285, { chantier_id: c1.id, chantier: c1.nom }),
    ligne(vis, 30, 10, 80, { chantier_id: c3.id, chantier: c3.nom }),
    ligne(betonA, 200, 10, 1100, { etablissement_id: 'e-nord', nom_agence: 'Agence Nord', ville: 'Ville-A', chantier_id: c1.id, chantier: c1.nom }),
    ligne(betonA, 90, 10, 1200, { etablissement_id: 'e-nord', nom_agence: 'Agence Nord', ville: 'Ville-A', chantier_id: c1.id, chantier: c1.nom }),
    ligne(betonA, 40, 10, 1000, { etablissement_id: 'e-sud', nom_agence: 'Agence Sud', ville: 'Ville-B', chantier_id: c2.id, chantier: c2.nom }),
    ligne(treillis, 60, 4, 260, { chantier_id: c3.id, chantier: c3.nom }), ligne(treillis, 8, 4, 280, { chantier_id: c3.id, chantier: c3.nom }),
    // Une ligne sans article : achetée aussi, mais non suivie dans « Prix et hausses ».
    ligne({ id: null, fournisseur: aciers.nom, reference: null, designation: 'Frais de port', unite: null }, 25, 1, 40),
  ];
  const attrs = (a) => ({ article_fournisseur_id: a.id, fournisseur: a.fournisseur, reference_fournisseur: a.reference, designation: a.designation, unite: a.unite, article_reference_id: a.refId ?? null, libelle_reference: a.refNom ?? null, unite_reference: a.refUnite ?? null, coefficient: a.coef ?? null, rapproche: Boolean(a.refId), origine_rapprochement: a.origine ?? null });
  const v_td_prix_evolution = [rond, rondN, vis, betonA, treillis].map(attrs);
  const v_td_prix_ponts = [{ article_source_id: A.treillis, article_cible_id: A.rond, fournisseur: aciers.nom, designation: treillis.designation, reference_cible: 'RB10', motif: 'même fournisseur, un seul article avec référence', origine: 'automatique', cible_rapprochee: true, source_rapprochee: false, applique: false, libelle_reference: 'Rond à béton 10 mm' }];

  const v_td_fournisseurs_fiches = [
    { fournisseur_id: aciers.id, fournisseur: aciers.nom, siren: aciers.siren, nb_agences: 1 }, { fournisseur_id: beton.id, fournisseur: beton.nom, siren: beton.siren, nb_agences: 2 },
    { fournisseur_id: quinc.id, fournisseur: quinc.nom, siren: quinc.siren, nb_agences: 1 }, { fournisseur_id: negoce.id, fournisseur: negoce.nom, siren: negoce.siren, nb_agences: 0 },
  ];
  const v_td_fournisseurs_agences = [
    { etablissement_id: 'e-nord', fournisseur_id: beton.id, nom_agence: 'Agence Nord', ville: 'Ville-A', siret: '99900022200011' }, { etablissement_id: 'e-sud', fournisseur_id: beton.id, nom_agence: 'Agence Sud', ville: 'Ville-B', siret: '99900022200029' },
    { etablissement_id: 'e-acier', fournisseur_id: aciers.id, nom_agence: 'Agence Principale', ville: 'Ville-C', siret: '99900011100010' }, { etablissement_id: 'e-quinc', fournisseur_id: quinc.id, nom_agence: 'Magasin Central', ville: null, siret: '99900033300015' },
  ];
  const fournFacture = (id, numero, d, f, etab, chantier, montant, lignes, type = 'facture') => ({ facture_id: id, numero, date_ref: jour(-d), fournisseur_id: f.id, fournisseur: f.nom, siren: f.siren, etablissement_id: etab, chantier: chantier ? chantier.nom : null, type_document: type, montant_ht: montant, nb_lignes: lignes });
  const v_td_fournisseurs_factures = [
    fournFacture('ff-1', 'F-1001', 5, aciers, 'e-acier', c1, 4200, 3), fournFacture('ff-2', 'F-1002', 20, beton, 'e-nord', c1, 1800, 2), fournFacture('ff-3', 'F-1003', 40, quinc, 'e-quinc', c2, 640, 1),
    fournFacture('ff-4', 'F-1004', 70, aciers, 'e-acier', c2, 3100, 4), fournFacture('ff-6', 'F-1006', 130, beton, 'e-sud', c2, 2400, 2), fournFacture('ff-7', 'F-1007', 15, aciers, null, null, 500, 1),
    fournFacture('ff-8', 'AV-1', 12, beton, 'e-nord', c1, -300, 1, 'avoir'),
  ];
  return { v_td_factures, v_td_chantiers, v_td_prix_lignes, v_td_prix_evolution, v_td_prix_ponts, v_td_fournisseurs_fiches, v_td_fournisseurs_agences, v_td_fournisseurs_factures };
}
