// Module Achats « Tableau de bord 2 » : onglet « Lignes et articles » : « qu'ai-je acheté, où, à quel prix ».
// Le tableau des lignes de facture (recherche, filtres, tri), et des vues regroupées (par article de référence, article, chantier, fournisseur, mois) avec un graphique et un tableau. Lecture seule.
// Les lignes sont celles déjà lues pour « Prix et hausses » (une seule lecture) ; les chiffres viennent de lignes.js.
import { h, remplir } from '../../os/ui.js';
import { carte, graphique, tableau, pagination, PAR_PAGE, pluriel, alerte, filtresBarre, enteteTriable } from './composants.js';
import { nbFiltresActifs, valeursDistinctes } from './filtrage.js';
import { formater } from './formats.js';
import { triSuivant } from './tri.js';
import * as O from './options.js';
import { filtrerLignesPrix } from './prix.js';
import { badgeRapprochement, AVERTISSEMENT_TRONQUE } from './onglet-prix.js';
import { RAPPROCHEMENTS, TOP_GRAPHIQUE, TRI_LIGNES_DEFAUT, depenseParMois, enLigneAchat, filtrerAchats, regrouperAchats, regrouperParFournisseurAchats, regrouperParReference, topFournisseurs, topGroupes, topReferences, totalAchats, trierAchats } from './lignes.js';
import { fichierLignesAchat } from './csv.js';

const VUES = [{ cle: 'reference', libelle: 'Par article de référence' }, { cle: 'article', libelle: 'Par article' }, { cle: 'chantier', libelle: 'Par chantier' }, { cle: 'fournisseur', libelle: 'Par fournisseur' }, { cle: 'mois', libelle: 'Par mois' }, { cle: 'lignes', libelle: 'Lignes' }];
const COLONNES = [
  { cle: 'date_prix', titre: 'Date' }, { cle: 'fournisseur', titre: 'Fournisseur' }, { cle: 'agence', titre: 'Agence' }, { cle: 'chantier', titre: 'Chantier' }, { cle: 'designation', titre: 'Désignation' },
  { cle: 'quantite', titre: 'Quantité', droite: true }, { cle: 'prix_net', titre: 'Prix net', droite: true }, { cle: 'montant_ht', titre: 'Montant HT', droite: true }, { cle: 'rapprochement', titre: 'Rapprochement' },
];
const COLONNES_ARTICLE = [
  { cle: 'nom', titre: 'Article' }, { cle: 'reference', titre: 'Référence' }, { cle: 'fournisseurs', titre: 'Fournisseurs' }, { cle: 'montant_ht', titre: 'Dépense HT', format: 'euros2', droite: true },
  { cle: 'part_pct', titre: 'Part', format: 'pourcent1', droite: true }, { cle: 'nb_lignes', titre: 'Lignes', format: 'entier', droite: true }, { cle: 'nb_fournisseurs', titre: 'Nb fournisseurs', format: 'entier', droite: true },
];
const COLONNES_CHANTIER = [
  { cle: 'nom', titre: 'Chantier' }, { cle: 'montant_ht', titre: 'Dépense HT', format: 'euros2', droite: true }, { cle: 'part_pct', titre: 'Part', format: 'pourcent1', droite: true },
  { cle: 'nb_lignes', titre: 'Lignes', format: 'entier', droite: true }, { cle: 'nb_fournisseurs', titre: 'Nb fournisseurs', format: 'entier', droite: true }, { cle: 'fournisseurs', titre: 'Fournisseurs' },
];
const COLONNES_FOURNISSEUR = [
  { cle: 'nom', titre: 'Fournisseur' }, { cle: 'montant_ht', titre: 'Dépense HT', format: 'euros2', droite: true }, { cle: 'part_pct', titre: 'Part', format: 'pourcent1', droite: true },
  { cle: 'nb_lignes', titre: 'Lignes', format: 'entier', droite: true }, { cle: 'nb_articles', titre: 'Articles', format: 'entier', droite: true }, { cle: 'nb_chantiers', titre: 'Chantiers', format: 'entier', droite: true }, { cle: 'nb_factures', titre: 'Factures', format: 'entier', droite: true },
];
const COLONNES_MOIS = [
  { cle: 'mois', titre: 'Mois', format: 'mois_annee' }, { cle: 'total_ht', titre: 'Dépense HT', format: 'euros2', droite: true }, { cle: 'nb_lignes', titre: 'Lignes', format: 'entier', droite: true },
  { cle: 'nb_factures', titre: 'Factures', format: 'entier', droite: true }, { cle: 'nb_fournisseurs', titre: 'Fournisseurs', format: 'entier', droite: true },
];
const COLONNES_REFERENCE = [
  { cle: 'nom', titre: 'Article de référence' }, { cle: 'unite', titre: 'Unité' }, { cle: 'nb_fournisseurs', titre: 'Fournisseurs', format: 'entier', droite: true }, { cle: 'prix_min', titre: 'Prix le plus bas', format: 'prix', droite: true },
  { cle: 'prix_max', titre: 'Prix le plus haut', format: 'prix', droite: true }, { cle: 'ecart_pct', titre: 'Écart', format: 'pourcent1', droite: true }, { cle: 'montant_ht', titre: 'Dépense HT', format: 'euros2', droite: true }, { cle: 'part_pct', titre: 'Part', format: 'pourcent1', droite: true },
];
const AIDE_VUES = {
  article: 'Somme des montants des lignes, hors taxes. Un article rapproché est compté sous son article de référence, tous fournisseurs réunis ; les autres restent propres à leur fournisseur.',
  chantier: 'Somme des montants des lignes, hors taxes. Les lignes des factures sans chantier forment « Sans chantier ».',
  fournisseur: 'Somme des montants des lignes, hors taxes, par fournisseur. Articles : articles distincts achetés (un article rapproché compte une fois, tous fournisseurs réunis). Tu retrouves les factures, les avoirs et les agences dans l’onglet « Fournisseurs et agences ».',
  mois: 'Somme des montants des lignes, hors taxes, par mois de facture. Un mois sans achat dans la période est à zéro.',
  reference: 'Les lignes rapprochées (validées ou automatiques) sont réunies sous leur article de référence, tous fournisseurs et agences ensemble. Prix = prix du fournisseur × coefficient, ramené à l’unité de référence ; un article sans coefficient n’a pas de prix. Écart = (plus haut − plus bas) / plus bas, avec au moins deux prix. « Sans référence » réunit tous les achats sans article de référence : il n’a pas de prix et n’est pas dans le graphique.',
};
const TITRES_VUES = { article: 'Dépense par article', chantier: 'Dépense par chantier', fournisseur: 'Dépense par fournisseur', mois: 'Dépense par mois', reference: 'Dépense par article de référence' };
const AIDE = 'Les lignes des factures acceptées qui ont une quantité et un montant positifs : les avoirs, les remises et les lignes sans quantité n’y sont pas, donc le total peut être différent du total de tes factures. Prix net = montant de la ligne divisé par la quantité. La Période et le Chantier se choisissent dans les filtres du haut.';
const choix = (f, id) => { const v = f[id]; return v && v.type === 'liste' ? v.choix : []; };

export function rendreLignes(ctx, donnees, filtres) {
  const etat = ctx.etatOnglet('lignes', () => ({ vue: 'reference', recherche: '', locaux: {}, tri: TRI_LIGNES_DEFAUT, page: 0 }));
  const fiches = new Map(donnees.attributs.map((a) => [a.article_fournisseur_id, a]));
  const base = filtrerLignesPrix(donnees.lignes, filtres).map((l) => enLigneAchat(l, fiches));
  const filtreHaut = nbFiltresActifs(filtres) > 0, chantierFiltre = Boolean(filtres.chantier);
  const incomplet = donnees.tronque ? alerte(AVERTISSEMENT_TRONQUE) : null;
  const racine = h('div', { class: 'ta-grille', dataset: { onglet: 'lignes' } });
  if (base.length === 0) {
    ctx.exporter(null);
    remplir(racine, incomplet, carte({ titre: 'Lignes et articles', large: 'pleine' },
      h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, `Aucune ligne d’achat sur cette sélection.${chantierFiltre ? ' Élargis la période ou retire le filtre Chantier.' : filtreHaut ? ' Élargis la période.' : ' Les lignes apparaissent ici dès qu’une facture est acceptée.'}`)));
    return racine;
  }
  const periode = filtres.periode && filtres.periode.type === 'periode' ? filtres.periode : null;
  const mq = window.matchMedia('(max-width: 767px)');
  const champRecherche = h('input', { class: 'ta-fb-recherche ta-prix-recherche', type: 'search', placeholder: 'Recherche : désignation, article, référence, fournisseur', 'aria-label': 'Recherche dans les lignes d’achat', value: etat.recherche, dataset: { role: 'recherche' },
    oninput: (e) => { etat.recherche = e.target.value; etat.page = 0; dessiner(false); } });
  const zoneVues = h('div', { class: 'ta-bascule ta-lignes-vues', role: 'group', 'aria-label': 'Présentation' });
  const zoneOutils = h('div', { class: 'ta-prix-outils' });
  const zoneTotal = h('div', {});
  const zoneLignes = h('div', {});
  const zoneGroupes = h('div', { class: 'ta-grille ta-lignes-groupes' });
  const toutEffacer = () => { etat.recherche = ''; champRecherche.value = ''; etat.locaux = {}; dessiner(); };
  const boutonTout = h('button', { type: 'button', class: 'ta-lien', dataset: { action: 'tout-afficher' }, onclick: toutEffacer }, 'Tout afficher');
  function dessiner(refaireOutils = true) {
    const { vue } = etat;
    const selection = filtrerAchats(base, { recherche: etat.recherche, fournisseurs: choix(etat.locaux, 'fournisseur'), agences: choix(etat.locaux, 'agence'), rapprochements: choix(etat.locaux, 'rapprochement') });
    const lignes = trierAchats(selection, etat.tri);
    ctx.exporter(fichierLignesAchat(lignes));
    const total = totalAchats(selection);
    const filtreLocal = etat.recherche.trim() !== '' || nbFiltresActifs(etat.locaux) > 0;
    remplir(zoneVues, ...VUES.map((v) => h('button', { type: 'button', class: 'ta-fb-bouton', 'aria-pressed': String(etat.vue === v.cle), dataset: { vue: v.cle }, onclick: () => { etat.vue = v.cle; dessiner(); } }, v.libelle)));
    if (refaireOutils) {
      const defs = [
        { id: 'fournisseur', libelle: 'Fournisseur', type: 'liste', options: valeursDistinctes(base.map((l) => l.fournisseur)) },
        { id: 'agence', libelle: 'Agence', type: 'liste', options: valeursDistinctes(base.map((l) => l.agence)) },
        { id: 'rapprochement', libelle: 'Rapprochement', type: 'liste', options: [...RAPPROCHEMENTS] },
      ];
      remplir(zoneOutils, champRecherche,
        filtresBarre({ defs, valeurs: etat.locaux, modifie: false, surReinit: () => {}, surChangement: (v) => { etat.locaux = v; etat.page = 0; dessiner(); }, sansRepli: true, etiquette: 'Filtres des lignes d’achat' }),
        boutonTout);
    }
    boutonTout.style.display = filtreLocal ? '' : 'none';
    remplir(zoneTotal, selection.length > 0 ? h('p', { class: 'ta-phrase ta-lignes-total', role: 'status', dataset: { role: 'total' } }, 'Total de la sélection : ', h('strong', {}, `${formater(total.montant_ht, 'euros2')} HT`), ` · ${pluriel(total.nb_lignes, 'ligne', 'lignes')} · ${pluriel(total.nb_factures, 'facture', 'factures')} · ${pluriel(total.nb_fournisseurs, 'fournisseur', 'fournisseurs')}`) : null);
    // Les graphiques de la vue précédente sont libérés avant d'en dessiner un nouveau.
    ctx.libererGraphiques();
    remplir(zoneLignes, );
    remplir(zoneGroupes, );
    if (selection.length === 0) { zoneLignes.append(h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, 'Aucune ligne avec ces filtres. Change la recherche ou clique sur « Tout afficher ».')); return; }
    if (vue === 'lignes') {
      const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
      etat.page = Math.min(etat.page, pages - 1);
      zoneLignes.append(
        h('div', { class: 'ta-defile' }, h('table', { class: 'ta-tableau ta-prix-tableau', dataset: { role: 'lignes-achat' } },
          h('thead', {}, h('tr', {}, COLONNES.map((col) => enteteTriable(col, etat.tri, () => { etat.page = 0; etat.tri = triSuivant(etat.tri, col); dessiner(false); })), h('th', { scope: 'col' }, 'Facture'))),
          h('tbody', {}, lignes.slice(etat.page * PAR_PAGE, (etat.page + 1) * PAR_PAGE).map((l) => h('tr', {},
            h('td', { dataset: { libelle: 'Date' } }, formater(l.date_prix, 'date')), h('td', { dataset: { libelle: 'Fournisseur' } }, l.fournisseur), h('td', { dataset: { libelle: 'Agence' } }, l.agence), h('td', { dataset: { libelle: 'Chantier' } }, l.chantier),
            h('td', { class: 'ta-prix-designation', dataset: { libelle: 'Désignation' } }, l.designation || h('span', { class: 'ta-neutre' }, 'Sans désignation'), l.reference_fournisseur ? h('small', { class: 'ta-prix-date' }, `réf. ${l.reference_fournisseur}`) : null),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Quantité' } }, `${formater(l.quantite, 'decimal2')}${l.unite ? ` ${l.unite}` : ''}`),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Prix net' } }, formater(l.prix_net, 'prix')), h('td', { class: 'ta-droite', dataset: { libelle: 'Montant HT' } }, formater(l.montant_ht, 'euros2')),
            h('td', { dataset: { libelle: 'Rapprochement' } }, l.origine ? badgeRapprochement(l.origine, true) : h('span', { class: 'ta-neutre' }, 'Aucun')),
            h('td', { dataset: { libelle: 'Facture' } }, l.numero || 'Sans numéro')))))),
        h('div', { class: 'ta-pied-tableau' }, h('span', {}, pluriel(lignes.length, 'ligne', 'lignes')), pagination(etat.page, pages, (n) => { etat.page = n; dessiner(false); })));
      return;
    }
    const titre = TITRES_VUES[vue], filtre = filtreHaut || filtreLocal;
    const c = ctx.couleurs();
    if (vue === 'mois') {
      const mois = depenseParMois(selection, periode);
      zoneGroupes.append(
        carte({ titre: `${titre} : ${mois.length} mois`, aide: AIDE_VUES.mois, large: 'pleine' }, graphique(ctx.graphiques, O.barresMensuelles(mois, c), 260, `${titre}, mois par mois`, { charger: ctx.chargerEcharts })),
        tableau({ titre, filtre, lignes: mois, tri0: { cle: 'mois', sens: 'desc' }, colonnes: COLONNES_MOIS }));
      return;
    }
    const groupes = vue === 'article' || vue === 'chantier' ? regrouperAchats(selection, vue) : [];
    const fournisseurs = vue === 'fournisseur' ? regrouperParFournisseurAchats(selection) : [];
    const references = vue === 'reference' ? regrouperParReference(selection) : [];
    const barres = vue === 'fournisseur' ? topFournisseurs(fournisseurs) : vue === 'reference' ? topReferences(references) : topGroupes(groupes);
    const nbBarres = vue === 'fournisseur' ? fournisseurs.length : vue === 'reference' ? references.filter((x) => !x.sans_reference).length : groupes.length;
    const nbGraphique = Math.min(nbBarres, TOP_GRAPHIQUE), lesPlusGrosses = nbGraphique === 1 ? 'la plus grosse' : `les ${nbGraphique} plus grosses`;
    const option = O.barresHorizontales(barres, c, 'Dépense HT', (v) => formater(v, 'euros_abrege'), mq.matches ? 96 : 170);
    zoneGroupes.append(
      nbGraphique > 0
        ? carte({ titre: `${titre} : ${lesPlusGrosses}`, aide: AIDE_VUES[vue], large: 'pleine' }, graphique(ctx.graphiques, option, Math.max(200, 40 + nbGraphique * 30), `${titre} : ${nbGraphique === 1 ? 'la plus grosse dépense' : `${lesPlusGrosses} dépenses`}`, { charger: ctx.chargerEcharts }))
        : carte({ titre, aide: AIDE_VUES[vue], large: 'pleine' }, h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, 'Aucun article de référence sur cette sélection : tes achats ne sont rapprochés d’aucun article de référence (écran Articles).')),
      vue === 'fournisseur' ? tableau({ titre, filtre, lignes: fournisseurs, tri0: { cle: 'montant_ht', sens: 'desc' }, colonnes: COLONNES_FOURNISSEUR })
        : vue === 'reference' ? tableau({ titre, filtre, lignes: references, tri0: { cle: 'montant_ht', sens: 'desc' }, colonnes: COLONNES_REFERENCE })
          : tableau({ titre, filtre, lignes: groupes, tri0: { cle: 'montant_ht', sens: 'desc' }, colonnes: vue === 'article' ? COLONNES_ARTICLE : COLONNES_CHANTIER }));
  }
  remplir(racine, incomplet, carte({ titre: 'Lignes et articles', aide: AIDE, large: 'pleine' }, zoneVues, zoneOutils, zoneTotal, zoneLignes), zoneGroupes);
  dessiner();
  return racine;
}
