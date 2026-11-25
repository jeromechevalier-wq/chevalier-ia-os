// Module Achats « Tableau de bord 2 » : les trois onglets lus dans les factures et les chantiers : Dirigeant, Pilotage, Liste des factures. Lecture seule.
// Chaque fonction reçoit le contexte de l'écran (`ctx`) et les données déjà filtrées, et rend l'élément à poser dans l'écran.
import { h } from '../../os/ui.js';
import { carte, chiffre, phrases, tableau, vide, graphique } from './composants.js';
import { formater, nombre, variation } from './formats.js';
import { nomFournisseur } from './filtrage.js';
import * as K from './calculs.js';
import * as O from './options.js';
import { fichierChantiers, fichierFactures } from './csv.js';

const euros = (v) => formater(v, 'euros_abrege');

/** Carte + graphique (ou « pas de données » / « aucun résultat avec ces filtres »). */
export function carteGraphique(ctx, { titre, aide, option, hauteur = 280, large = 'moitie', vide: estVide, filtre }) {
  return carte({ titre, aide, large, role: 'graphique-carte' }, estVide ? vide(filtre) : graphique(ctx.graphiques, option, hauteur, titre, { charger: ctx.chargerEcharts }));
}

/** Dirigeant : aucun filtre, les chiffres du jour. `d` = { factures, chantiers, aDecider, voirADecider }. */
export function rendreDirigeant(ctx, d) {
  const { factures, chantiers } = d, c = ctx.couleurs();
  const estVide = factures.length === 0;
  const mois = K.achatsParMois(factures);
  const a = K.aValider(factures), s = K.aSurveiller(chantiers), t3 = K.top3Fournisseurs(factures);
  const dernier = nombre(mois[11]?.total_ht), avant = nombre(mois[10]?.total_ht);
  const enCours = chantiers.filter((x) => x.statut === 'en_cours');
  ctx.exporter(fichierChantiers(enCours));
  return h('div', { class: 'ta-grille', dataset: { onglet: 'dirigeant' } },
    chiffre({ large: 'quart', titre: 'À décider', aide: 'Factures en attente de décision (hors taxes).', valeur: a.nb ? a.total_ht : 0, format: 'euros0', vide: estVide,
      sous: a.nb === 0 ? 'Rien n’attend.' : `${a.nb} ${a.nb === 1 ? 'facture' : 'factures'}, la plus ancienne depuis ${a.attente_max_jours} ${a.attente_max_jours <= 1 ? 'jour' : 'jours'}`, couleur: a.nb === 0 ? 'bon' : 'attention' }),
    chiffre({ large: 'quart', titre: 'Achats du mois', aide: 'Factures acceptées du mois en cours, hors taxes, comparées au mois précédent.', valeur: dernier, format: 'euros0', vide: estVide,
      variation: { pct: variation(dernier, avant), texte: `par rapport à ${formater(mois[10]?.mois, 'mois_annee')}`, mauvaiseHausse: true } }),
    chiffre({ large: 'quart', titre: 'Chantiers à surveiller', aide: 'Chantiers en cours à 90 % de leur budget ou plus.', valeur: s.length, format: 'entier', sous: s.map((x) => x.chantier).join(', ') || 'Aucun chantier à 90 %.', couleur: s.length === 0 ? 'bon' : 'attention', vide: chantiers.length === 0 }),
    chiffre({ large: 'quart', titre: 'Les 3 premiers fournisseurs', aide: 'Part des achats acceptés qui revient aux trois premiers fournisseurs.', valeur: t3.part_top3_pct, format: 'pourcent1', sous: t3.nb_fournisseurs ? `sur ${t3.nb_fournisseurs} fournisseurs` : undefined, vide: estVide }),
    phrases({ titre: 'Résumé du jour', phrases: K.resumeDuJour(factures, chantiers) }),
    d.aDecider > 0 ? h('p', { class: 'ta-rappel', style: { gridColumn: '1 / -1' } }, h('button', { type: 'button', class: 'ta-fb-bouton', dataset: { action: 'voir-a-decider' }, onclick: d.voirADecider }, `Voir les ${d.aDecider} ${d.aDecider === 1 ? 'facture' : 'factures'} à décider`)) : null,
    carteGraphique(ctx, { titre: 'Achats acceptés par mois', aide: 'Douze mois glissants, factures acceptées, hors taxes (les avoirs comptent en négatif).', option: O.barresMensuelles(mois, c), vide: estVide, filtre: false, large: 'pleine' }),
    tableau({ titre: 'Chantiers en cours', filtre: false, lignes: enCours, tri0: { cle: 'pct_budget_consomme', sens: 'desc' },
      colonnes: [{ cle: 'chantier', titre: 'Chantier' }, { cle: 'client', titre: 'Client' }, { cle: 'budget_ht', titre: 'Budget', format: 'euros0', droite: true }, { cle: 'accepte_ht', titre: 'Accepté', format: 'euros0', droite: true }, { cle: 'en_attente_ht', titre: 'En attente', format: 'euros0', droite: true },
        { cle: 'pct_budget_consomme', titre: '% du budget', format: 'pourcent1', droite: true, couleur: (l) => (l.niveau === 'depasse' ? 'mauvais' : l.niveau === 'a_surveiller' ? 'attention' : null) }] }));
}

/** Pilotage : Période et Chantier. `d` = { factures, facturesToutePeriode, chantiers, filtre }. */
export function rendrePilotage(ctx, d) {
  const { factures, facturesToutePeriode, chantiers, filtre } = d, c = ctx.couleurs();
  const estVide = factures.length === 0;
  const delai = K.delaiMedianJours(factures), sc = K.sansChantier(facturesToutePeriode), ma = K.malgreAlerteCeMois(factures);
  const avecBudget = chantiers.filter((x) => x.budget_renseigne);
  ctx.exporter(fichierChantiers(avecBudget));
  return h('div', { class: 'ta-grille', dataset: { onglet: 'pilotage' } },
    h('p', { class: 'ta-note', style: { gridColumn: '1 / -1' } }, 'Les chiffres de budget des chantiers ne suivent que le filtre Chantier, pas la Période.'),
    chiffre({ titre: 'Délai de décision', aide: 'Délai médian entre l’arrivée d’une facture et la décision, sur les 90 derniers jours.', valeur: delai.jours, format: 'jours', sous: delai.nb ? `${delai.nb} décisions` : 'Aucune décision sur les 90 derniers jours.', vide: estVide }),
    chiffre({ titre: 'Sans chantier', aide: 'Montant des factures non refusées qui n’ont aucun chantier : elles ne comptent dans aucun budget. Toutes les périodes : la Période ne s’applique pas ici (le filtre Chantier, lui, oui).', valeur: sc.montant_ht, format: 'euros0', sous: `${sc.nb} ${sc.nb === 1 ? 'facture' : 'factures'}`, couleur: sc.nb === 0 ? 'bon' : 'attention', vide: facturesToutePeriode.length === 0 }),
    chiffre({ titre: 'Acceptées malgré alerte', aide: 'Factures acceptées ce mois-ci alors qu’un contrôle avait donné une alerte.', valeur: ma, format: 'entier', couleur: ma === 0 ? 'bon' : 'attention', vide: estVide }),
    carteGraphique(ctx, { titre: 'Budget consommé par chantier', aide: 'Part du budget déjà acceptée, sur toute la vie du chantier (le filtre Chantier s’applique ; la Période ne les concerne pas).', option: O.budgetsOption(chantiers, c), hauteur: Math.max(200, 56 + avecBudget.length * 30), vide: avecBudget.length === 0, filtre, large: 'pleine' }),
    carteGraphique(ctx, { titre: 'Dépenses par mois et par chantier', aide: 'Factures acceptées, hors taxes. Les chantiers les plus petits sont regroupés dans « Autres ».', option: O.empile(K.depensesMoisChantier(factures).map((l) => ({ mois: l.mois, cle: l.chantier, valeur: l.total_ht })), c, { format: euros, max: 6 }), vide: estVide, filtre, large: 'pleine', hauteur: 320 }),
    carteGraphique(ctx, { titre: 'Factures par mois et par statut', option: O.empile(K.facturesParMoisStatut(factures).map((l) => ({ mois: l.mois, cle: l.statut_fr, valeur: l.nb_factures })), c, { format: (v) => String(v), couleurs: { Acceptée: c.bon, 'À valider': c.attention, Refusée: c.mauvais } }), vide: estVide, filtre }),
    carteGraphique(ctx, { titre: 'Taux de refus par mois', aide: 'Refusées sur décidées. Un mois sans décision n’a pas de point.', option: O.ligneTaux(K.tauxRefusParMois(factures), c), vide: estVide, filtre }),
    carteGraphique(ctx, { titre: 'Attente par ancienneté', aide: 'Factures à valider, par durée d’attente. Toutes les périodes : la Période ne s’applique pas ici, pour qu’aucune facture à valider ne soit cachée (le filtre Chantier, lui, oui).', option: O.barresSimples(K.attenteParTranche(facturesToutePeriode).map((x) => ({ nom: x.tranche, valeur: x.nb_factures })), c, 'Factures', (v) => String(v)), vide: facturesToutePeriode.length === 0, filtre }));
}

/** Liste des factures : Période, Chantier, Statut, Fournisseur. `d` = { factures, filtre }. */
export function rendreListe(ctx, d) {
  ctx.exporter(fichierFactures(d.factures));
  const lignes = d.factures.map((f) => ({ ...f, fournisseur_aff: nomFournisseur(f) }));
  return h('div', { class: 'ta-grille', dataset: { onglet: 'liste' } },
    tableau({ titre: 'Liste des factures', filtre: d.filtre, lignes, tri0: { cle: 'date_ref', sens: 'desc' },
      colonnes: [{ cle: 'date_ref', titre: 'Date', format: 'date' }, { cle: 'fournisseur_aff', titre: 'Fournisseur' }, { cle: 'numero', titre: 'N°' }, { cle: 'chantier', titre: 'Chantier' },
        { cle: 'statut_fr', titre: 'Statut', fond: true, couleur: (l) => (l.statut === 'acceptee' ? 'bon' : l.statut === 'refusee' ? 'mauvais' : 'attention') }, { cle: 'montant_ht', titre: 'HT', format: 'euros2', droite: true }, { cle: 'nb_alertes', titre: 'Alertes', format: 'entier', droite: true }] }));
}
