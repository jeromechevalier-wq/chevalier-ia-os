// Module Achats « Tableau de bord 2 » : onglet « Fournisseurs et agences » : « qui sont mes fournisseurs et leurs agences, combien de factures, combien dépensé, dernière facture ».
// Niveau 1 : le tableau de TOUS les fournisseurs enregistrés. Niveau 2 (clic sur une ligne) : ses agences, un graphique des dépenses par agence et ses articles les plus dépensés.
// Lecture seule. Les chiffres viennent de fournisseurs.js (recalculés sur la sélection) ; les articles viennent des lignes d'achat lues pour « Prix et hausses » (lecture à part, avec sa propre erreur).
import { h, remplir } from '../../os/ui.js';
import { carte, graphique, tableau, pagination, PAR_PAGE, pluriel, alerte, enteteTriable } from './composants.js';
import { nbFiltresActifs } from './filtrage.js';
import { formater } from './formats.js';
import { trier, triSuivant } from './tri.js';
import * as O from './options.js';
import { filtrerLignesPrix } from './prix.js';
import { TOP_ARTICLES, agencesDuFournisseur, barresAgences, chercherFournisseurs, filtrerFacturesFournisseurs, regrouperParFournisseur, tableauFournisseurs, topArticlesFournisseur, totalFournisseurs } from './fournisseurs.js';
import { fichierFournisseurs } from './csv.js';

const COLONNES = [
  { cle: 'nom', titre: 'Fournisseur' }, { cle: 'siren', titre: 'SIREN' }, { cle: 'nb_agences', titre: 'Agences', droite: true }, { cle: 'nb_factures', titre: 'Factures', droite: true },
  { cle: 'total_ht', titre: 'Total HT', droite: true }, { cle: 'nb_lignes', titre: 'Lignes d’achat', droite: true }, { cle: 'derniere_facture', titre: 'Dernière facture', droite: true }, { cle: 'part_pct', titre: 'Part', droite: true },
];
const COLONNES_AGENCES = [
  { cle: 'nom', titre: 'Agence' }, { cle: 'ville', titre: 'Ville' }, { cle: 'siret', titre: 'SIRET' }, { cle: 'nb_factures', titre: 'Factures', format: 'entier', droite: true },
  { cle: 'total_ht', titre: 'Total HT', format: 'euros2', droite: true }, { cle: 'derniere_facture', titre: 'Dernière facture', format: 'date', droite: true },
];
const COLONNES_ARTICLES = [
  { cle: 'nom', titre: 'Article' }, { cle: 'reference', titre: 'Référence' }, { cle: 'montant_ht', titre: 'Dépense HT', format: 'euros2', droite: true },
  { cle: 'part_pct', titre: 'Part', format: 'pourcent1', droite: true }, { cle: 'nb_lignes', titre: 'Lignes', format: 'entier', droite: true },
];
const TRI_DEFAUT = { cle: 'total_ht', sens: 'desc' };
const AIDE = 'Tous tes fournisseurs enregistrés, même ceux qui n’ont aucune facture sur la période. Seules les factures acceptées comptent, hors taxes ; un avoir se retire du total et n’est pas compté comme une facture. Lignes d’achat : les lignes de facture avec une quantité et un montant positifs. Clique sur une ligne pour voir les agences du fournisseur.';
const AVERTISSEMENT = 'Toutes les factures n’ont pas pu être lues (les plus anciennes manquent) : les chiffres peuvent être incomplets.';

/** Niveau 2 : les agences d'un fournisseur, le graphique des dépenses par agence et ses articles les plus dépensés. `prix` : { donnees, erreur, chargement } (lecture à part). */
function detail(ctx, f, donnees, factures, prix, filtres, filtre, surFermer) {
  const agences = agencesDuFournisseur(f.fournisseur_id, donnees.agences, factures);
  const barres = barresAgences(agences);
  const mq = window.matchMedia('(max-width: 767px)');
  const option = O.barresHorizontales(barres, ctx.couleurs(), 'Total HT', (v) => formater(v, 'euros_abrege'), mq.matches ? 96 : 170);
  const articles = prix.donnees ? topArticlesFournisseur(filtrerLignesPrix(prix.donnees.lignes, filtres), prix.donnees.attributs, f.nom) : [];
  const titreArticles = `${f.nom} : ${articles.length > 1 ? `ses ${articles.length} articles les plus dépensés` : 'son article le plus dépensé'}`;
  const carteArticles = prix.erreur && !prix.donnees
    ? carte({ titre: `${f.nom} : ses articles`, large: 'pleine', role: 'articles-fournisseur' }, alerte('Les lignes d’achat n’ont pas pu être lues : les articles de ce fournisseur ne sont pas affichés.'), h('p', { class: 'ta-rappel' }, h('button', { type: 'button', class: 'ta-fb-bouton', dataset: { action: 'reessayer-prix' }, onclick: () => ctx.relirePrix() }, 'Réessayer')))
    : !prix.donnees
      ? carte({ titre: `${f.nom} : ses articles`, large: 'pleine', role: 'articles-fournisseur' }, h('p', { class: 'ta-tuile-vide', role: 'status' }, 'Chargement des articles…'))
      : articles.length === 0
        ? carte({ titre: `${f.nom} : ses articles`, large: 'pleine', role: 'articles-fournisseur' }, h('p', { class: 'ta-tuile-vide', role: 'status' }, 'Aucune ligne d’achat lisible pour ce fournisseur sur cette sélection.'))
        : tableau({ titre: titreArticles, aide: `Au plus ${TOP_ARTICLES} articles, classés par dépense. Somme des lignes d’achat (quantité et montant positifs), hors taxes : ce total peut être différent du total des factures. Part = part des lignes d’achat de ce fournisseur. Le détail complet est dans « Lignes et articles ».`, filtre, lignes: articles, tri0: { cle: 'montant_ht', sens: 'desc' }, colonnes: COLONNES_ARTICLES });
  return h('div', { class: 'ta-grille', dataset: { role: 'detail-fournisseur' } },
    carte({ titre: f.nom, large: 'pleine' },
      h('p', { class: 'ta-sous' }, [f.siren ? `SIREN ${f.siren}` : 'SIREN inconnu', f.sans_fiche ? 'pas encore enregistré comme fournisseur' : pluriel(f.nb_agences ?? 0, 'agence', 'agences'), pluriel(f.nb_factures, 'facture acceptée', 'factures acceptées'), `${formater(f.total_ht, 'euros2')} HT`, f.derniere_facture ? `dernière facture le ${formater(f.derniere_facture, 'date')}` : null].filter(Boolean).join(' · ')),
      f.nb_avoirs > 0 ? h('p', { class: 'ta-note ta-note-plat' }, `${pluriel(f.nb_avoirs, 'avoir est déjà retiré', 'avoirs sont déjà retirés')} du total.`) : null,
      f.nb_factures === 0 ? h('p', { class: 'ta-note ta-note-plat' }, `Aucune facture acceptée sur cette sélection${filtre ? ' : élargis la période ou retire le filtre Chantier pour voir ses montants' : ''}.`) : null,
      h('p', { class: 'ta-rappel' }, h('button', { type: 'button', class: 'ta-fb-bouton', onclick: surFermer }, 'Fermer le détail'))),
    agences.length === 0
      ? carte({ titre: `${f.nom} : ses agences`, large: 'pleine' }, h('p', { class: 'ta-tuile-vide', role: 'status' }, 'Aucune agence enregistrée pour ce fournisseur.'))
      : tableau({ titre: `${f.nom} : ses agences`, aide: 'Toutes les agences enregistrées de ce fournisseur, même sans facture sur la sélection. « Sans agence » : ses factures qui ne sont reliées à aucune agence.', filtre, lignes: agences, tri0: { cle: 'total_ht', sens: 'desc' }, colonnes: COLONNES_AGENCES }),
    barres.length > 0 ? carte({ titre: `${f.nom} : dépenses par agence`, aide: 'Factures acceptées, hors taxes, sur la sélection. Une agence sans dépense n’a pas de barre.', large: 'pleine' },
      graphique(ctx.graphiques, option, Math.max(140, 40 + barres.length * 34), `Dépenses par agence : ${f.nom}`, { charger: ctx.chargerEcharts })) : null,
    carteArticles);
}

export function rendreFournisseurs(ctx, donnees, prix, filtres) {
  const etat = ctx.etatOnglet('fournisseurs', () => ({ recherche: '', tri: TRI_DEFAUT, page: 0, choisi: null }));
  const factures = filtrerFacturesFournisseurs(donnees.factures, filtres);
  const tous = tableauFournisseurs(donnees.fiches, factures);
  const parFournisseur = regrouperParFournisseur(donnees.fiches, factures);
  const total = totalFournisseurs(tous);
  const filtre = nbFiltresActifs(filtres) > 0;
  const incomplet = donnees.tronque ? alerte(AVERTISSEMENT) : null;
  const racine = h('div', { class: 'ta-grille', dataset: { onglet: 'fournisseurs' } });
  if (tous.length === 0) {
    ctx.exporter(null);
    remplir(racine, incomplet, carte({ titre: 'Fournisseurs et agences', large: 'pleine' },
      h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, 'Aucun fournisseur enregistré pour l’instant. Ils apparaissent ici dès qu’une facture est reliée à un fournisseur.')));
    return racine;
  }
  const zoneTable = h('div', {});
  const zoneDetail = h('div', { class: 'ta-prix-detail ta-fourn-detail' });
  const champRecherche = h('input', { class: 'ta-fb-recherche ta-prix-recherche', type: 'search', placeholder: 'Recherche : nom du fournisseur ou SIREN', 'aria-label': 'Recherche dans les fournisseurs', value: etat.recherche, dataset: { role: 'recherche' },
    oninput: (e) => { etat.recherche = e.target.value; etat.page = 0; dessiner(); } });
  const zoneOutils = h('div', { class: 'ta-prix-outils' });
  function dessiner() {
    const lignes = trier(chercherFournisseurs(tous, etat.recherche), etat.tri);
    ctx.exporter(fichierFournisseurs(lignes));
    const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
    etat.page = Math.min(etat.page, pages - 1);
    if (etat.choisi && !lignes.some((l) => l.cle === etat.choisi)) etat.choisi = null; // le détail se ferme quand son fournisseur n'est plus dans la liste
    remplir(zoneOutils, champRecherche, etat.recherche.trim() !== '' ? h('button', { type: 'button', class: 'ta-lien', dataset: { action: 'tout-afficher' }, onclick: () => { etat.recherche = ''; champRecherche.value = ''; dessiner(); } }, 'Tout afficher') : null);
    remplir(zoneTable, lignes.length === 0 ? h('p', { class: 'ta-tuile-vide', role: 'status', dataset: { role: 'tuile-vide' } }, 'Aucun fournisseur avec cette recherche. Change-la ou clique sur « Tout afficher ».') : h('div', {},
      h('div', { class: 'ta-defile' }, h('table', { class: 'ta-tableau ta-prix-tableau ta-fourn-tableau', dataset: { role: 'fournisseurs' } },
        h('thead', {}, h('tr', {}, COLONNES.map((col) => enteteTriable(col, etat.tri, () => { etat.page = 0; etat.tri = triSuivant(etat.tri, col); dessiner(); })), h('th', { scope: 'col', class: 'ta-fleche-col' }, h('span', { class: 'ta-sr' }, 'Ouvrir le détail')))),
        h('tbody', {}, lignes.slice(etat.page * PAR_PAGE, (etat.page + 1) * PAR_PAGE).map((l) => {
          const ouvert = l.cle === etat.choisi;
          return h('tr', { class: `ta-ligne-cliquable${ouvert ? ' ta-ligne-choisie' : ''}`, dataset: { fournisseur: l.cle }, onclick: () => { etat.choisi = ouvert ? null : l.cle; dessiner(); if (etat.choisi) zoneDetail.scrollIntoView?.({ block: 'nearest' }); } },
            h('td', { class: 'ta-fourn-nom', dataset: { libelle: 'Fournisseur' } }, h('button', { type: 'button', class: 'ta-lien-ligne', 'aria-expanded': String(ouvert), title: ouvert ? 'Fermer le détail' : 'Voir ses agences et ses articles' }, l.nom), l.sans_fiche ? h('small', { class: 'ta-prix-date' }, 'pas encore enregistré comme fournisseur') : null),
            h('td', { dataset: { libelle: 'SIREN' } }, l.siren || h('span', { class: 'ta-neutre' }, '—')),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Agences' } }, l.nb_agences === null ? '—' : formater(l.nb_agences, 'entier')),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Factures' } }, formater(l.nb_factures, 'entier')), h('td', { class: 'ta-droite', dataset: { libelle: 'Total HT' } }, formater(l.total_ht, 'euros2')),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Lignes d’achat' } }, formater(l.nb_lignes, 'entier')), h('td', { class: 'ta-droite', dataset: { libelle: 'Dernière facture' } }, l.derniere_facture ? formater(l.derniere_facture, 'date') : '—'),
            h('td', { class: 'ta-droite', dataset: { libelle: 'Part' } }, l.part_pct === null ? '—' : formater(l.part_pct, 'pourcent1')),
            h('td', { class: 'ta-fleche-col', 'aria-hidden': 'true' }, h('span', { class: 'ta-fleche' }, '›')));
        })))),
      h('div', { class: 'ta-pied-tableau' }, h('span', {}, pluriel(lignes.length, 'fournisseur', 'fournisseurs')), pagination(etat.page, pages, (n) => { etat.page = n; dessiner(); }))));
    ctx.libererGraphiques();
    remplir(zoneDetail, );
    const f = etat.choisi ? tous.find((l) => l.cle === etat.choisi) ?? null : null;
    if (f) zoneDetail.append(detail(ctx, f, donnees, parFournisseur.get(f.cle) ?? [], prix, filtres, filtre, () => { etat.choisi = null; dessiner(); }));
  }
  remplir(racine, incomplet, carte({ titre: 'Fournisseurs et agences', aide: AIDE, large: 'pleine' },
    h('p', { class: 'ta-phrase', role: 'status', dataset: { role: 'resume' } }, `${pluriel(total.nb_fournisseurs, 'fournisseur', 'fournisseurs')}, dont ${total.nb_actifs} avec au moins une facture acceptée sur la sélection · ${pluriel(total.nb_factures, 'facture', 'factures')} · `, h('strong', {}, `${formater(total.total_ht, 'euros2')} HT`)),
    h('p', { class: 'ta-note ta-note-plat' }, 'La Période et le Chantier du haut s’appliquent aux factures, aux montants et aux articles. La liste des fournisseurs et le nombre d’agences, eux, ne changent pas avec ces filtres.'),
    total.nb_factures === 0 ? alerte(`Aucune facture acceptée sur cette sélection.${filtres.chantier ? ' Élargis la période ou retire le filtre Chantier.' : filtre ? ' Élargis la période.' : ''}`) : null,
    h('p', { class: 'ta-invitation' }, 'Clique sur un fournisseur pour voir ses agences, ses factures et ses prix.'), zoneOutils, zoneTable), zoneDetail);
  dessiner();
  return racine;
}
