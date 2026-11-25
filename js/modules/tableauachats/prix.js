// Onglet « Prix et hausses » de KPI 2 : calculs purs (testés dans prix.test.ts), sans React ni base.
// Tout est recalculé ici à partir des lignes de v_td_prix_lignes FILTRÉES (période, chantier, fournisseur, agence), avec les règles de la vue
// v_td_prix_evolution (migration 029) : prix d'un jour = moyenne pondérée par les quantités, variation seulement avec 2 dates,
// « peu de données » sous 3 achats. La vue v_td_prix_evolution ne donne que les attributs de l'article (référence, désignation, rapprochement).
import { normaliser, dateJourFichier } from './filtrage.js';
import { trier } from './tri.js';

/** Une ligne de facture retenue (v_td_prix_lignes). Les nombres sont déjà passés par `nombre()` à la lecture. */

/** Attributs d'un article fournisseur (v_td_prix_evolution) : jamais ses chiffres, qui sont recalculés sur la sélection. */

/** Pont automatique proposé (v_td_prix_ponts) : un article sans référence relié au seul article avec référence du même fournisseur. */

/** Une ligne du tableau : un article fournisseur, avec ses chiffres recalculés sur la sélection. */

export const SANS_CHANTIER = 'Sans chantier'
export const SANS_AGENCE = 'Sans agence'
const arrondi2 = (n) => Math.round(n * 100) / 100
const texte = (...v) => { for (const x of v) if (x && x.trim() !== '') return x.trim(); return '' }
const choix = (f, id) => { const v = f[id]; return v && v.type === 'liste' && v.choix.length ? v.choix : null }

/** Nom de chantier d'une ligne, comme dans le filtre Chantier du haut (« Sans chantier » si la facture n'en a pas). */
export const chantierDe = (l) => texte(l.chantier) || SANS_CHANTIER
/** Nom d'agence d'une ligne : « nom (ville) », sinon « Sans agence ». */
export const agenceDe = (l) => {
  if (!l.etablissement_id) return SANS_AGENCE
  const n = texte(l.nom_agence), v = texte(l.ville)
  return n && v && !normaliser(n).includes(normaliser(v)) ? `${n} (${v})` : n || v || 'Agence sans nom'
}

/** Filtre les lignes : Période (sur la date du prix, bornes comprises) et Chantier (par nom) viennent du filtre du haut ; Fournisseur (par nom, sans casse ni accents) et Agence sont propres à l'onglet. */
export function filtrerLignesPrix(lignes, f, o = {}) {
  const ch = choix(f, 'chantier'), per = f.periode && f.periode.type === 'periode' ? f.periode : null
  const fo = o.fournisseurs && o.fournisseurs.length ? new Set(o.fournisseurs.map(normaliser)) : null
  const ag = o.agences && o.agences.length ? new Set(o.agences.map(normaliser)) : null, chs = ch ? new Set(ch.map(normaliser)) : null
  return lignes.filter((l) => {
    if (chs && !chs.has(normaliser(chantierDe(l)))) return false
    if (per) { if (per.du && l.date_prix < per.du) return false; if (per.au && l.date_prix > per.au) return false }
    if (fo && !fo.has(normaliser(l.fournisseur))) return false
    if (ag && !ag.has(normaliser(agenceDe(l)))) return false
    return true
  })
}

/** Série du prix net d'un ensemble de lignes : un point par jour, du plus ancien au plus récent. Plusieurs achats le même jour = moyenne pondérée par les quantités (somme des montants / somme des quantités). */
export function seriePrix(lignes) {
  const g = new Map ()
  for (const l of lignes) {
    if (!(l.quantite > 0) || !(l.montant_ht > 0)) continue
    const e = g.get(l.date_prix) ?? { q: 0, m: 0, n: 0 }
    e.q += l.quantite; e.m += l.montant_ht; e.n += 1
    g.set(l.date_prix, e)
  }
  return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, e]) => ({ date, prix: e.m / e.q, quantite: e.q, montant_ht: e.m, nb_lignes: e.n }))
}
/** Une série par agence (pour voir si deux agences du même fournisseur vendent le même article à des prix différents), de la plus grosse dépense à la plus petite. */
export function seriesParAgence(lignes) {
  const g = new Map ()
  for (const l of lignes) { const k = agenceDe(l); const e = g.get(k); if (e) e.push(l); else g.set(k, [l]) }
  const poids = (p) => p.reduce((t, x) => t + x.montant_ht, 0)
  return [...g.entries()].map(([nom, l]) => ({ nom, points: seriePrix(l) })).filter((s) => s.points.length > 0).sort((a, b) => poids(b.points) - poids(a.points) || a.nom.localeCompare(b.nom, 'fr'))
}

/** Fenêtre par défaut du graphique : les 12 derniers mois, du même jour il y a un an jusqu'à aujourd'hui (jour de Paris, dates AAAA-MM-JJ ; le 29 février devient le 28). */
export function fenetre12Mois(aujourdhui = new Date()) {
  const au = dateJourFichier(aujourdhui)
  const du = `${Number(au.slice(0, 4)) - 1}${au.slice(4)}`
  return { du: du.endsWith('-02-29') ? `${du.slice(0, 8)}28` : du, au }
}

/** Passe les séries en base 100 : on ne garde que les points de la fenêtre [du ; au] ; le 100 est le prix du premier jour d'achat de la fenêtre (le moins cher si plusieurs agences achètent ce jour-là), le même 100 pour toutes les courbes, pour que les agences restent comparables. Rend base = null (et aucune courbe) s'il n'y a aucun achat dans la fenêtre. */
export function enBase100(series, fenetre) {
  const dedans = series.map((s) => ({ nom: s.nom, points: s.points.filter((p) => p.date >= fenetre.du && p.date <= fenetre.au) })).filter((s) => s.points.length > 0)
  const premiere = dedans.reduce ((m, s) => (m === null || s.points[0].date < m ? s.points[0].date : m), null)
  if (premiere === null) return { base: null, series: [] }
  const base = Math.min(...dedans.flatMap((s) => s.points.filter((p) => p.date === premiere).map((p) => p.prix)))
  return { base, series: dedans.map((s) => ({ nom: s.nom, points: s.points.map((p) => ({ ...p, indice: (p.prix / base) * 100 })) })) }
}

/** Séries du graphique d'un article : une courbe par agence SEULEMENT si l'article est acheté dans plusieurs agences (signal « agences différentes ») ; sinon une seule courbe « Prix net » (une facture sans agence ne fait pas une deuxième courbe). */
export function seriesDuGraphique(achats, agencesDifferentes) {
  return agencesDifferentes ? seriesParAgence(achats) : [{ nom: 'Prix net', points: seriePrix(achats) }]
}

/** Les articles de la sélection : une ligne par article fournisseur, chiffres recalculés depuis les lignes données (déjà filtrées). Les lignes sans article sont exclues. Tri par défaut : dépense décroissante. */
export function evolutionArticles(lignes, attributs) {
  const attr = new Map(attributs.map((a) => [a.article_fournisseur_id, a]))
  const g = new Map ()
  for (const l of lignes) {
    if (!l.article_fournisseur_id || !(l.quantite > 0) || !(l.montant_ht > 0)) continue
    const e = g.get(l.article_fournisseur_id); if (e) e.push(l); else g.set(l.article_fournisseur_id, [l])
  }
  const articles = []
  for (const [id, ls] of g) {
    const s = seriePrix(ls), a = attr.get(id), l0 = ls[0]
    const premier = s[0], dernier = s[s.length - 1]
    const prix = ls.map((l) => l.montant_ht / l.quantite)
    const nbAgences = new Set(ls.map((l) => l.etablissement_id).filter(Boolean)).size
    const nbUnites = new Set(ls.map((l) => l.unite_normalisee ?? '')).size
    const lr = ls.find((l) => l.rapproche)
    const coefficient = a?.coefficient ?? lr?.coefficient ?? null
    const rapproche = a ? a.rapproche : !!lr
    articles.push({
      article_fournisseur_id: id,
      fournisseur: texte(l0.fournisseur, a?.fournisseur) || 'Fournisseur inconnu',
      reference_fournisseur: texte(a?.reference_fournisseur, l0.reference_fournisseur),
      designation: texte(a?.designation, l0.designation),
      unite: texte(a?.unite, l0.unite),
      nb_achats: ls.length, nb_dates: s.length, date_premier: premier.date, date_dernier: dernier.date,
      prix_premier: premier.prix, prix_dernier: dernier.prix, prix_min: Math.min(...prix), prix_max: Math.max(...prix),
      variation_pct: s.length >= 2 && premier.prix !== 0 ? arrondi2((100 * (dernier.prix - premier.prix)) / premier.prix) : null,
      depense: ls.reduce((t, l) => t + l.montant_ht, 0), quantite_totale: ls.reduce((t, l) => t + l.quantite, 0),
      nb_agences: nbAgences, agences_differentes: nbAgences > 1, nb_unites: nbUnites, unites_differentes: nbUnites > 1, peu_de_donnees: ls.length < 3,
      article_reference_id: a?.article_reference_id ?? lr?.article_reference_id ?? null,
      libelle_reference: a?.libelle_reference ?? lr?.libelle_reference ?? null,
      unite_reference: a?.unite_reference ?? lr?.unite_reference ?? null,
      coefficient, prix_dernier_reference: rapproche && coefficient !== null ? dernier.prix * coefficient : null,
      rapproche, origine_rapprochement: rapproche ? (a?.origine_rapprochement ?? lr?.origine_rapprochement ?? null) : null,
    })
  }
  return trierArticles(articles, TRI_DEFAUT)
}

export const TRI_DEFAUT = { cle: 'depense', sens: 'desc' }
/** Tri du tableau (valeurs vides à la fin) ; à égalité, la plus grosse dépense d'abord puis la désignation, pour un ordre stable. */
export function trierArticles(articles, tri = TRI_DEFAUT) {
  const stable = [...articles].sort((a, b) => b.depense - a.depense || a.designation.localeCompare(b.designation, 'fr') || a.article_fournisseur_id.localeCompare(b.article_fournisseur_id))
  return trier(stable, tri)
}

/** Recherche sans casse ni accents sur la désignation, la référence et le fournisseur. Tous les mots doivent s'y trouver ; « HA10 » trouve aussi « HA 10 ». */
export function correspond(a, recherche) {
  const mots = normaliser(recherche).split(' ').filter(Boolean)
  if (mots.length === 0) return true
  const foin = normaliser(`${a.designation} ${a.reference_fournisseur} ${a.fournisseur}`), colle = foin.replace(/ /g, '')
  return mots.every((m) => foin.includes(m) || colle.includes(m))
}

/** Seuil d'une hausse : en dessous de 0,05 %, la variation s'affiche « = 0 % » et ne compte pas comme une hausse (même règle pour l'affichage, le filtre et le compteur). */
export const SEUIL_VARIATION = 0.05
export const variationNulle = (pct) => Math.abs(pct) < SEUIL_VARIATION
export const enHausse = (a) => a.variation_pct !== null && a.variation_pct >= SEUIL_VARIATION

/** Filtres propres au tableau : recherche, « hausses seulement » (variation calculable, d'au moins 0,05 %), « cacher peu de données » (moins de 3 achats). */
export function filtrerArticles(articles, f) {
  return articles.filter((a) => {
    if (f.haussesSeulement && !enHausse(a)) return false
    if (f.cacherPeuDeDonnees && a.peu_de_donnees) return false
    return correspond(a, f.recherche ?? '')
  })
}

/** Les autres articles rapprochés du même article de référence (comparaison entre fournisseurs), du moins cher au plus cher en unité de référence. */
export function memeReference(articles, a) {
  if (!a.rapproche || !a.article_reference_id) return []
  return articles.filter((x) => x.article_fournisseur_id !== a.article_fournisseur_id && x.rapproche && x.article_reference_id === a.article_reference_id)
    .sort((x, y) => (x.prix_dernier_reference ?? Infinity) - (y.prix_dernier_reference ?? Infinity) || x.fournisseur.localeCompare(y.fournisseur, 'fr'))
}

/** Pont automatique qui part de cet article (au plus un), appliqué ou seulement proposé. */
export const pontDe = (ponts, articleId) => ponts.find((p) => p.article_source_id === articleId) ?? null

/** Achats d'un article, du plus récent au plus ancien (détail sous le graphique). */
export const achatsDe = (lignes, articleId) =>
  lignes.filter((l) => l.article_fournisseur_id === articleId).sort((a, b) => b.date_prix.localeCompare(a.date_prix) || a.ligne_id.localeCompare(b.ligne_id))

// ------------------------------------------------------------------ ordre de lecture (la lecture page par page est faite par la couche d'accès de l'OS, voir donnees.js)

/** Lignes d'achat : les plus RÉCENTES d'abord. Si le plafond de lecture est atteint, ce sont les plus anciennes qui manquent, jamais les derniers prix. `ligne_id` rend l'ordre stable entre deux pages. */
export const ORDRE_PRIX_LIGNES = [{ col: 'date_prix', asc: false }, { col: 'ligne_id', asc: true }]
