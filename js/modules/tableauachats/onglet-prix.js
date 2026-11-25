// Module Achats « Tableau de bord 2 » : onglet « Prix et hausses » : le tableau des articles achetés (un par fournisseur), puis, au clic sur une ligne, la courbe de son prix net et le détail de ses achats.
// Lecture seule. Les chiffres viennent de prix.js (recalculés sur la sélection) ; cet écran n'écrit rien et ne propose aucune modification des rapprochements.
import { h, remplir } from '../../os/ui.js';
import { carte, graphique, pagination, PAR_PAGE, alerte, filtresBarre } from './composants.js';
import { nbFiltresActifs, valeursDistinctes } from './filtrage.js';
import { formater } from './formats.js';
import { triSuivant } from './tri.js';
import * as O from './options.js';
import { TRI_DEFAUT, achatsDe, enBase100, fenetre12Mois, agenceDe, chantierDe, enHausse, evolutionArticles, filtrerArticles, filtrerLignesPrix, memeReference, pontDe, seriesDuGraphique, trierArticles, variationNulle } from './prix.js';
import { fichierArticles } from './csv.js';

const COLONNES = [
  { cle: 'fournisseur', titre: 'Fournisseur' }, { cle: 'reference_fournisseur', titre: 'Référence' }, { cle: 'designation', titre: 'Désignation' },
  { cle: 'depense', titre: 'Dépense', droite: true }, { cle: 'prix_premier', titre: 'Premier prix', droite: true }, { cle: 'prix_dernier', titre: 'Dernier prix', droite: true },
  { cle: 'variation_pct', titre: 'Variation', droite: true }, { cle: 'nb_achats', titre: 'Achats', droite: true },
];
export const AVERTISSEMENT_TRONQUE = 'Toutes les lignes d’achat n’ont pas pu être lues (les plus anciennes manquent) : les chiffres peuvent être incomplets.';
export const prixUnite = (v, unite) => (v === null ? '' : `${formater(v, 'prix')}${unite ? ` / ${unite}` : ''}`);

/** Variation du prix : une hausse est en rouge (elle coûte), une baisse en vert ; « — » si elle n'est pas calculable (une seule date d'achat). */
function variation(pct) {
  if (pct === null) return h('span', { class: 'ta-neutre', title: 'Variation non calculable : une seule date d’achat sur la sélection.' }, '—');
  if (variationNulle(pct)) return h('span', { class: 'ta-neutre' }, '= 0 %');
  return h('span', { class: pct > 0 ? 'ta-mauvais' : 'ta-bon' }, `${pct > 0 ? '▲ +' : '▼ −'}${formater(Math.abs(pct), 'pourcent1')}`);
}

/** `court` : dans une colonne déjà nommée « Rapprochement », le badge dit seulement « Validé » ou « Automatique ». */
export function badgeRapprochement(origine, court = false) {
  if (origine === 'valide') return h('span', { class: 'ta-badge ta-badge-valide', title: 'Cet article est relié à un article de référence, et ce lien a été validé.' }, court ? 'Validé' : 'Rapprochement validé');
  if (origine === 'automatique') return h('span', { class: 'ta-badge ta-badge-auto', title: 'Cet article est relié à un article de référence par un rapprochement automatique, pas encore confirmé.' }, court ? 'Automatique' : 'Rapprochement automatique');
  return null;
}
function signaux(a) {
  return h('span', { class: 'ta-badges' }, badgeRapprochement(a.origine_rapprochement),
    a.agences_differentes ? h('span', { class: 'ta-badge ta-badge-signal', title: `Acheté dans ${a.nb_agences} agences : le prix peut changer d’une agence à l’autre.` }, 'Agences différentes') : null,
    a.unites_differentes ? h('span', { class: 'ta-badge ta-badge-signal', title: 'Les factures n’écrivent pas toutes la même unité pour cet article : compare les prix avec prudence.' }, 'Unités différentes') : null,
    a.peu_de_donnees ? h('span', { class: 'ta-badge ta-badge-signal', title: 'Moins de 3 achats sur la sélection : la variation est peu fiable.' }, 'Peu de données') : null);
}

/** Détail d'un article : rapprochement, courbe du prix net, achats, et les autres fournisseurs du même article de référence. */
function detail(ctx, a, donnees, lignes, tous, { surFermer, surChoisir }) {
  const achats = achatsDe(lignes, a.article_fournisseur_id);
  const fenetre = fenetre12Mois();
  const base100 = enBase100(seriesDuGraphique(achats, a.agences_differentes), fenetre);
  const option = O.prixOption(base100.series, ctx.couleurs(), a.unite, fenetre);
  const pont0 = pontDe(donnees.ponts, a.article_fournisseur_id), pont = pont0 && !pont0.source_rapprochee ? pont0 : null;
  const autres = memeReference(tous, a);
  const titre = a.designation || 'Article sans désignation';
  return carte({ titre, large: 'pleine', role: 'detail-article' },
    h('p', { class: 'ta-sous' }, [a.fournisseur, a.reference_fournisseur ? `réf. ${a.reference_fournisseur}` : 'sans référence', a.unite ? `à l’unité « ${a.unite} »` : null].filter(Boolean).join(' · ')),
    signaux(a),
    a.rapproche ? h('p', { class: 'ta-phrase' }, 'Article de référence : ', h('strong', {}, a.libelle_reference ?? 'sans nom'), '.', a.prix_dernier_reference !== null ? [' Dernier prix : ', h('strong', {}, prixUnite(a.prix_dernier_reference, a.unite_reference)), '.'] : null) : null,
    pont ? h('p', { class: 'ta-prix-pont', role: 'note' }, h('strong', {}, 'Rapprochement automatique'), pont.applique ? '' : ' proposé (pas encore utilisé dans les prix)', ` : ${pont.motif ?? 'article relié à un article du même fournisseur'}${pont.reference_cible ? ` (réf. ${pont.reference_cible})` : ''}. À confirmer dans l’écran des articles.`) : null,
    base100.base === null
      ? h('p', { class: 'ta-phrase' }, 'Aucun achat sur les 12 derniers mois : pas de courbe. Le détail des achats est juste en dessous.')
      : graphique(ctx.graphiques, option, 260, `Évolution du prix net en base 100 : ${titre}`, { charger: ctx.chargerEcharts }),
    h('p', { class: 'ta-note ta-note-plat' }, 'Courbe en base 100 sur les 12 derniers mois : le premier prix de la période (le moins cher s’il y en a plusieurs ce jour-là', base100.base !== null ? [', soit ', h('strong', {}, prixUnite(base100.base, a.unite))] : null, ') vaut 100 %, pour toutes les agences. Passe la souris sur un point pour voir le vrai prix. Prix net = montant de la ligne divisé par la quantité. Plusieurs achats le même jour : prix moyen, pondéré par les quantités.'),
    h('div', { class: 'ta-defile' }, h('table', { class: 'ta-tableau', dataset: { role: 'achats-article' } },
      h('caption', { class: 'ta-legende' }, `Détail des achats (${achats.length})`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Agence'), h('th', { scope: 'col', class: 'ta-droite' }, 'Quantité'), h('th', { scope: 'col', class: 'ta-droite' }, 'Prix net'), a.rapproche ? h('th', { scope: 'col', class: 'ta-droite' }, 'Prix en unité de référence') : null, h('th', { scope: 'col' }, 'Chantier'), h('th', { scope: 'col' }, 'Facture'))),
      h('tbody', {}, achats.map((l) => h('tr', {},
        h('td', { dataset: { libelle: 'Date' } }, formater(l.date_prix, 'date')), h('td', { dataset: { libelle: 'Agence' } }, agenceDe(l)),
        h('td', { class: 'ta-droite', dataset: { libelle: 'Quantité' } }, `${formater(l.quantite, 'decimal2')}${l.unite ? ` ${l.unite}` : ''}`),
        h('td', { class: 'ta-droite', dataset: { libelle: 'Prix net' } }, formater(l.montant_ht / l.quantite, 'prix')),
        a.rapproche ? h('td', { class: 'ta-droite', dataset: { libelle: 'Prix en unité de référence' } }, prixUnite(l.prix_unite_reference, l.unite_reference)) : null,
        h('td', { dataset: { libelle: 'Chantier' } }, chantierDe(l)), h('td', { dataset: { libelle: 'Facture' } }, l.numero || 'Sans numéro')))))),
    a.rapproche ? (autres.length === 0 ? h('p', { class: 'ta-sous' }, 'Aucun autre fournisseur n’a cet article de référence sur cette sélection.') : h('div', { class: 'ta-defile' }, h('table', { class: 'ta-tableau', dataset: { role: 'autres-fournisseurs' } },
      h('caption', { class: 'ta-legende' }, `Le même article chez les autres fournisseurs (${a.libelle_reference ?? 'article de référence'})`),
      h('thead', {}, h('tr', {}, ['Fournisseur', 'Désignation'].map((t) => h('th', { scope: 'col' }, t)), h('th', { scope: 'col', class: 'ta-droite' }, 'Dernier prix en unité de référence'), h('th', { scope: 'col' }, 'Dernier achat'), h('th', { scope: 'col', class: 'ta-droite' }, 'Variation'), h('th', { scope: 'col' }, 'Rapprochement'))),
      h('tbody', {}, autres.map((x) => h('tr', { class: 'ta-ligne-cliquable', onclick: () => surChoisir(x.article_fournisseur_id) },
        h('td', {}, x.fournisseur), h('td', {}, h('button', { type: 'button', class: 'ta-lien-ligne' }, x.designation || 'Article sans désignation')),
        h('td', { class: 'ta-droite' }, prixUnite(x.prix_dernier_reference, x.unite_reference)), h('td', {}, formater(x.date_dernier, 'date')), h('td', { class: 'ta-droite' }, variation(x.variation_pct)), h('td', {}, badgeRapprochement(x.origine_rapprochement)))))))) : null,
    h('p', { class: 'ta-rappel' }, h('button', { type: 'button', class: 'ta-fb-bouton', onclick: surFermer }, 'Fermer le détail')));
}

/** L'onglet. `etat` : mémoire de l'onglet (recherche, tri, page, article ouvert) gardée d'un redessin à l'autre. */
export function rendrePrix(ctx, donnees, filtres) {
  const etat = ctx.etatOnglet('prix', () => ({ recherche: '', locaux: {}, hausses: false, cacherPeu: false, tri: TRI_DEFAUT, page: 0, choisi: null }));
  const lignes = filtrerLignesPrix(donnees.lignes, filtres);
  const tous = evolutionArticles(lignes, donnees.attributs);
  const sansArticle = lignes.filter((l) => !l.article_fournisseur_id).length;
  const filtreHaut = nbFiltresActifs(filtres) > 0, chantierFiltre = Boolean(filtres.chantier);
  const incomplet = donnees.tronque ? alerte(AVERTISSEMENT_TRONQUE) : null;
  const racine = h('div', { class: 'ta-grille', dataset: { onglet: 'prix' } });
  if (tous.length === 0) {
    ctx.exporter(null);
    remplir(racine, incomplet, carte({ titre: 'Prix et hausses', large: 'pleine' },
      h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, `Aucun achat sur cette sélection.${chantierFiltre ? ' Élargis la période ou retire le filtre Chantier.' : filtreHaut ? ' Élargis la période.' : ''}`),
      sansArticle > 0 ? h('p', { class: 'ta-sous' }, `${sansArticle} ${sansArticle === 1 ? 'ligne de facture n’est reliée' : 'lignes de facture ne sont reliées'} à aucun article : elles ne peuvent pas être suivies ici.`) : null));
    return racine;
  }
  const nbHausses = tous.filter(enHausse).length;
  const zoneOutils = h('div', { class: 'ta-prix-outils' });
  const zoneTable = h('div', {});
  const zoneDetail = h('div', { class: 'ta-prix-detail' });
  const champRecherche = h('input', { class: 'ta-fb-recherche ta-prix-recherche', type: 'search', placeholder: 'Recherche : désignation, référence, fournisseur', 'aria-label': 'Recherche dans les articles', value: etat.recherche, dataset: { role: 'recherche' },
    oninput: (e) => { etat.recherche = e.target.value; etat.page = 0; dessiner(false); } });
  const fournisseursChoisis = () => (etat.locaux.fournisseur && etat.locaux.fournisseur.type === 'liste' ? etat.locaux.fournisseur.choix : []);
  const calculer = () => {
    const f = fournisseursChoisis();
    const base = f.length ? evolutionArticles(filtrerLignesPrix(lignes, {}, { fournisseurs: f }), donnees.attributs) : tous;
    return trierArticles(filtrerArticles(base, { recherche: etat.recherche, haussesSeulement: etat.hausses, cacherPeuDeDonnees: etat.cacherPeu }), etat.tri);
  };
  const toutEffacer = () => { etat.recherche = ''; champRecherche.value = ''; etat.locaux = {}; etat.hausses = false; etat.cacherPeu = false; dessiner(); };
  const boutonTout = h('button', { type: 'button', class: 'ta-lien', dataset: { action: 'tout-afficher' }, onclick: toutEffacer }, 'Tout afficher');
  function dessiner(refaireOutils = true) {
    const articles = calculer();
    ctx.exporter(fichierArticles(articles));
    const pages = Math.max(1, Math.ceil(articles.length / PAR_PAGE));
    etat.page = Math.min(etat.page, pages - 1);
    if (etat.choisi && !articles.some((a) => a.article_fournisseur_id === etat.choisi)) etat.choisi = null; // le détail se ferme si son article n'est plus dans la liste
    const filtreLocal = etat.recherche.trim() !== '' || fournisseursChoisis().length > 0 || etat.hausses || etat.cacherPeu;
    if (refaireOutils) {
      const defs = [{ id: 'fournisseur', libelle: 'Fournisseur', type: 'liste', options: valeursDistinctes(lignes.filter((l) => l.article_fournisseur_id).map((l) => l.fournisseur)) }];
      remplir(zoneOutils, champRecherche,
        filtresBarre({ defs, valeurs: etat.locaux, modifie: false, surReinit: () => {}, surChangement: (v) => { etat.locaux = v; etat.page = 0; dessiner(); }, sansRepli: true, etiquette: 'Filtre fournisseur' }),
        h('label', { class: 'ta-prix-case' }, h('input', { type: 'checkbox', checked: etat.hausses, dataset: { role: 'hausses' }, onchange: (e) => { etat.hausses = e.target.checked; etat.page = 0; dessiner(); } }), ' Hausses seulement'),
        h('label', { class: 'ta-prix-case' }, h('input', { type: 'checkbox', checked: etat.cacherPeu, dataset: { role: 'cacher-peu' }, onchange: (e) => { etat.cacherPeu = e.target.checked; etat.page = 0; dessiner(); } }), ' Cacher « peu de données »'),
        boutonTout);
    }
    boutonTout.style.display = filtreLocal ? '' : 'none';
    remplir(zoneTable, articles.length === 0 ? h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, 'Aucun article avec ces filtres.') : h('div', {},
      h('div', { class: 'ta-defile' }, h('table', { class: 'ta-tableau ta-prix-tableau', dataset: { role: 'articles' } },
        h('thead', {}, h('tr', {}, COLONNES.map((col) => h('th', { scope: 'col', class: col.droite ? 'ta-droite' : '', 'aria-sort': etat.tri.cle === col.cle ? (etat.tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
          h('button', { type: 'button', onclick: () => { etat.page = 0; etat.tri = triSuivant(etat.tri, col); dessiner(false); } }, `${col.titre}${etat.tri.cle === col.cle ? (etat.tri.sens === 'asc' ? ' ▲' : ' ▼') : ''}`))), h('th', { scope: 'col' }, 'Signaux'))),
        h('tbody', {}, articles.slice(etat.page * PAR_PAGE, (etat.page + 1) * PAR_PAGE).map((a) => {
          const ouvert = a.article_fournisseur_id === etat.choisi;
          return h('tr', { class: `ta-ligne-cliquable${ouvert ? ' ta-ligne-choisie' : ''}`, dataset: { article: a.article_fournisseur_id }, onclick: () => { etat.choisi = ouvert ? null : a.article_fournisseur_id; dessiner(false); if (etat.choisi) zoneDetail.scrollIntoView?.({ block: 'nearest' }); } },
            h('td', { dataset: { libelle: 'Fournisseur' } }, a.fournisseur), h('td', { dataset: { libelle: 'Référence' } }, a.reference_fournisseur),
            h('td', { class: 'ta-prix-designation', dataset: { libelle: 'Désignation' } }, h('button', { type: 'button', class: 'ta-lien-ligne', 'aria-expanded': String(ouvert), title: ouvert ? 'Fermer le détail' : 'Voir la courbe et le détail des achats' }, a.designation || 'Article sans désignation')),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Dépense' } }, formater(a.depense, 'euros0')),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Premier prix' } }, prixUnite(a.prix_premier, a.unite), h('small', { class: 'ta-prix-date' }, `le ${formater(a.date_premier, 'date')}`)),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Dernier prix' } }, prixUnite(a.prix_dernier, a.unite), h('small', { class: 'ta-prix-date' }, `le ${formater(a.date_dernier, 'date')}`)),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Variation' } }, variation(a.variation_pct)), h('td', { class: 'ta-droite', dataset: { libelle: 'Achats' } }, formater(a.nb_achats, 'entier')),
            h('td', { dataset: { libelle: 'Signaux' } }, signaux(a)));
        })))),
      h('div', { class: 'ta-pied-tableau' }, h('span', {}, `${articles.length} ${articles.length === 1 ? 'article' : 'articles'}${sansArticle > 0 ? ` · ${sansArticle} ${sansArticle === 1 ? 'ligne de facture sans article n’est pas comptée' : 'lignes de facture sans article ne sont pas comptées'}` : ''}`), pagination(etat.page, pages, (n) => { etat.page = n; dessiner(false); }))));
    // Le détail : les graphiques de l'ancien détail sont libérés avant d'en dessiner un nouveau.
    ctx.libererGraphiques();
    const article = etat.choisi ? tous.find((a) => a.article_fournisseur_id === etat.choisi) ?? null : null;
    remplir(zoneDetail, );
    if (article) zoneDetail.append(detail(ctx, article, donnees, lignes, tous, { surFermer: () => { etat.choisi = null; dessiner(false); }, surChoisir: (id) => { if (!articles.some((a) => a.article_fournisseur_id === id)) { etat.recherche = ''; champRecherche.value = ''; etat.locaux = {}; etat.hausses = false; etat.cacherPeu = false; } etat.choisi = id; dessiner(); } }));
  }
  remplir(racine, incomplet, carte({ titre: 'Prix et hausses', aide: 'Un article par fournisseur. Factures acceptées seulement, hors avoirs. Premier et dernier prix net de la période choisie ; la variation les compare. Clique sur une ligne pour voir la courbe et le détail des achats.', large: 'pleine' },
    h('p', { class: 'ta-phrase', dataset: { role: 'resume' } }, `${tous.length} ${tous.length === 1 ? 'article acheté' : 'articles achetés'} sur la sélection, dont ${nbHausses} en hausse.`), zoneOutils, zoneTable), zoneDetail);
  dessiner();
  return racine;
}
