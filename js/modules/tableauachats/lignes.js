// Onglet « Lignes et articles » de KPI 2 : calculs purs (testés dans lignes.test.ts), sans React ni base.
// Il répond à « qu'ai-je acheté, où, à quel prix » à partir des MÊMES lignes que l'onglet « Prix et hausses » (v_td_prix_lignes, lues une seule fois) :
// factures acceptées seulement, hors avoirs, lignes avec une quantité et un montant positifs. Ici, les lignes SANS article sont gardées (elles ont été achetées aussi).
import { normaliser } from './filtrage.js';
import { trier } from './tri.js';
import { agenceDe, chantierDe, correspond } from './prix.js';

export const RAPPROCHEMENTS = ['Validé', 'Automatique', 'Aucun']

export const rapprochementDe = (o) => (o === 'valide' ? 'Validé' : o === 'automatique' ? 'Automatique' : 'Aucun')

const texte = (v) => (v ?? '').trim()
export const FOURNISSEUR_INCONNU = 'Fournisseur inconnu'
export const SANS_DESIGNATION = 'Ligne sans désignation'

/** Une ligne du tableau : une ligne de facture, avec les noms prêts à afficher, à filtrer et à trier. */

/** Clé de regroupement « Par article ». Article rapproché : son article de référence (le même article chez plusieurs fournisseurs ne fait qu'une ligne).
 *  Sinon : l'article du fournisseur. Ligne sans article : même fournisseur et même désignation (sans casse ni accents), pour ne jamais mélanger deux fournisseurs sur un simple texte. */
export function cleArticle(l) {
  if (l.rapproche && l.article_reference_id) return `r:${l.article_reference_id}`
  if (l.article_fournisseur_id) return `a:${l.article_fournisseur_id}`
  return `d:${normaliser(l.fournisseur)}|${normaliser(l.designation)}`
}

/** `attributs` (fiche de l'article du fournisseur, par identifiant) : pour un article non rapproché, le nom et la référence du regroupement « Par article » viennent de la fiche, comme dans « Prix et hausses » ; sans fiche, de la ligne. */
export function enLigneAchat(l, attributs) {
  const designation = texte(l.designation), parReference = l.rapproche && !!l.article_reference_id
  const fiche = !parReference && l.article_fournisseur_id ? attributs?.get(l.article_fournisseur_id) : undefined
  return {
    ligne_id: l.ligne_id, facture_id: l.facture_id, numero: texte(l.numero), date_prix: l.date_prix,
    fournisseur: texte(l.fournisseur) || FOURNISSEUR_INCONNU, agence: agenceDe(l), chantier: chantierDe(l),
    designation, reference_fournisseur: texte(l.reference_fournisseur),
    quantite: l.quantite, unite: texte(l.unite), prix_net: l.quantite > 0 ? l.montant_ht / l.quantite : null, montant_ht: l.montant_ht,
    origine: l.rapproche ? l.origine_rapprochement : null, rapprochement: rapprochementDe(l.rapproche ? l.origine_rapprochement : null),
    cle_article: cleArticle(l), nom_article: (parReference ? texte(l.libelle_reference) : texte(fiche?.designation)) || designation || SANS_DESIGNATION,
    reference_article: parReference ? 'Article de référence' : texte(fiche?.reference_fournisseur) || texte(l.reference_fournisseur),
    article_reference_id: parReference ? l.article_reference_id : null, libelle_reference: parReference ? texte(l.libelle_reference) : '', unite_reference: parReference ? texte(l.unite_reference) : '',
    coefficient: parReference && l.coefficient !== null && l.coefficient > 0 ? l.coefficient : null,
  }
}

/** Filtres propres à l'onglet : recherche libre (désignation, nom de l'article ou de l'article de référence, référence, fournisseur ; sans casse ni accents, tous les mots), Fournisseur (par nom), Agence, Rapprochement (Validé / Automatique / Aucun). Une liste vide = pas de filtre. */
export function filtrerAchats(lignes, f) {
  const fo = f.fournisseurs && f.fournisseurs.length ? new Set(f.fournisseurs.map(normaliser)) : null
  const ag = f.agences && f.agences.length ? new Set(f.agences.map(normaliser)) : null
  const ra = f.rapprochements && f.rapprochements.length ? new Set(f.rapprochements) : null
  return lignes.filter((l) => {
    if (fo && !fo.has(normaliser(l.fournisseur))) return false
    if (ag && !ag.has(normaliser(l.agence))) return false
    if (ra && !ra.has(l.rapprochement)) return false
    return correspond({ designation: `${l.designation} ${l.nom_article}`, reference_fournisseur: l.reference_fournisseur, fournisseur: l.fournisseur }, f.recherche ?? '')
  })
}

export const TRI_LIGNES_DEFAUT = { cle: 'montant_ht', sens: 'desc' }
/** Tri du tableau des lignes (valeurs vides à la fin) ; à égalité : le plus gros montant, puis la plus récente, puis l'identifiant, pour un ordre stable. */
export function trierAchats(lignes, tri = TRI_LIGNES_DEFAUT) {
  const stable = [...lignes].sort((a, b) => b.montant_ht - a.montant_ht || b.date_prix.localeCompare(a.date_prix) || a.ligne_id.localeCompare(b.ligne_id))
  return trier(stable, tri)
}

/** Total de la sélection : somme des montants, nombre de lignes, de fournisseurs (un nom = un fournisseur, sans casse ni accents) et de factures. */
export function totalAchats(lignes) {
  return {
    montant_ht: lignes.reduce((t, l) => t + l.montant_ht, 0), nb_lignes: lignes.length,
    nb_fournisseurs: new Set(lignes.map((l) => normaliser(l.fournisseur))).size, nb_factures: new Set(lignes.map((l) => l.facture_id)).size,
  }
}

export const NOMS_FOURNISSEURS_MAX = 3
/** Noms de fournisseurs d'un groupe : les 3 premiers (ordre alphabétique), puis « et N autres » ; le nombre exact reste dans nb_fournisseurs. */
export function listeFournisseurs(noms) {
  const tries = [...noms].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })), reste = tries.length - NOMS_FOURNISSEURS_MAX
  return reste > 0 ? `${tries.slice(0, NOMS_FOURNISSEURS_MAX).join(', ')} et ${reste} ${reste === 1 ? 'autre' : 'autres'}` : tries.join(', ')
}

/** Une ligne d'un regroupement : la dépense d'un article ou d'un chantier sur la sélection. */

/** Dépense par article ou par chantier : somme des montants, nombre de lignes, nombre de fournisseurs, part du total. De la plus grosse dépense à la plus petite (à égalité : par nom). */
export function regrouperAchats(lignes, par) {
  const g = new Map ()
  for (const l of lignes) { const k = par === 'article' ? l.cle_article : l.chantier; const e = g.get(k); if (e) e.push(l); else g.set(k, [l]) }
  const total = lignes.reduce((t, l) => t + l.montant_ht, 0)
  const groupes = []
  for (const [cle, ls] of g) {
    // Nom de l'article : celui de sa fiche ; sans fiche, celui de la ligne la plus récente (un fournisseur peut réécrire sa désignation d'une facture à l'autre).
    const recente = [...ls].sort((a, b) => b.date_prix.localeCompare(a.date_prix) || a.ligne_id.localeCompare(b.ligne_id))[0]
    const noms = new Map (); for (const l of ls) { const k = normaliser(l.fournisseur); if (!noms.has(k)) noms.set(k, l.fournisseur) }
    const montant = ls.reduce((t, l) => t + l.montant_ht, 0)
    groupes.push({
      cle, nom: par === 'article' ? recente.nom_article : recente.chantier, reference: par === 'article' ? recente.reference_article : '',
      fournisseurs: listeFournisseurs([...noms.values()]),
      montant_ht: montant, nb_lignes: ls.length, nb_fournisseurs: noms.size, part_pct: total > 0 ? Math.round((1000 * montant) / total) / 10 : null,
    })
  }
  return groupes.sort((a, b) => b.montant_ht - a.montant_ht || a.nom.localeCompare(b.nom, 'fr') || a.cle.localeCompare(b.cle))
}

export const TOP_GRAPHIQUE = 15
/** Les plus grosses dépenses d'un regroupement, pour le graphique en barres (les groupes sont déjà triés). */
export const topGroupes = (groupes, n = TOP_GRAPHIQUE) => groupes.slice(0, n).map((x) => ({ nom: x.nom, valeur: x.montant_ht }))

// ------------------------------------------------------------------ vues « Par fournisseur », « Par mois » et « Par article de référence »
const arrondi1 = (n) => Math.round(n * 10) / 10
const arrondi2 = (n) => Math.round(n * 100) / 100
const partDe = (montant, total) => (total > 0 ? Math.round((1000 * montant) / total) / 10 : null)

/** Une ligne de « Par fournisseur » : la dépense d'un fournisseur (un nom = un fournisseur, sans casse ni accents) sur la sélection. */

/** Dépense par fournisseur : somme des montants, part du total, nombre de lignes, d'articles distincts (même clé que « Par article »), de chantiers et de factures. De la plus grosse dépense à la plus petite (à égalité : par nom). */
export function regrouperParFournisseurAchats(lignes) {
  const g = new Map ()
  for (const l of lignes) { const k = normaliser(l.fournisseur); const e = g.get(k); if (e) e.push(l); else g.set(k, [l]) }
  const total = lignes.reduce((t, l) => t + l.montant_ht, 0)
  return [...g].map(([cle, ls]) => {
    const montant = ls.reduce((t, l) => t + l.montant_ht, 0), nom = [...ls].sort((a, b) => b.date_prix.localeCompare(a.date_prix) || a.ligne_id.localeCompare(b.ligne_id))[0].fournisseur
    return { cle, nom, montant_ht: montant, part_pct: partDe(montant, total), nb_lignes: ls.length, nb_articles: new Set(ls.map((l) => l.cle_article)).size, nb_chantiers: new Set(ls.map((l) => normaliser(l.chantier))).size, nb_factures: new Set(ls.map((l) => l.facture_id)).size }
  }).sort((a, b) => b.montant_ht - a.montant_ht || a.nom.localeCompare(b.nom, 'fr') || a.cle.localeCompare(b.cle))
}

/** Une ligne de « Par mois » : `mois` est écrit AAAA-MM-01. */

const moisSuivant = (m) => { const a = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)); return n === 12 ? `${a + 1}-01-01` : `${a}-${String(n + 1).padStart(2, '0')}-01` }

/** Dépense mois par mois. Les bornes de la Période (du, au) fixent les mois affichés : un mois sans achat est à zéro, jamais un trou. Une borne vide (« Toutes les périodes ») est remplacée par le premier ou le dernier mois qui a des achats. Du plus ancien au plus récent. */
export function depenseParMois(lignes, periode) {
  const g = new Map ()
  for (const l of lignes) { const k = `${l.date_prix.slice(0, 7)}-01`; const e = g.get(k); if (e) e.push(l); else g.set(k, [l]) }
  const presents = [...g.keys()].sort()
  const debut = periode?.du ? `${periode.du.slice(0, 7)}-01` : presents[0], fin = periode?.au ? `${periode.au.slice(0, 7)}-01` : presents[presents.length - 1]
  if (!debut || !fin) return []
  const sorties = []
  for (let m = debut; m <= fin && sorties.length < 600; m = moisSuivant(m)) {
    const ls = g.get(m) ?? []
    sorties.push({ mois: m, total_ht: arrondi2(ls.reduce((t, l) => t + l.montant_ht, 0)), nb_lignes: ls.length, nb_factures: new Set(ls.map((l) => l.facture_id)).size, nb_fournisseurs: new Set(ls.map((l) => normaliser(l.fournisseur))).size })
  }
  return sorties
}

export const SANS_REFERENCE = 'Sans référence'
/** Une ligne de « Par article de référence ». Prix ramenés à l'unité de référence (prix du fournisseur × coefficient) ; vides si aucune ligne n'a de coefficient. `ecart_pct` : (plus haut − plus bas) / plus bas, seulement avec au moins deux prix. `sans_reference` : la ligne qui réunit les achats sans article de référence. */

/** Par article de référence : les lignes rapprochées (validées ou automatiques) sont réunies sous leur article de référence, tous fournisseurs et agences ensemble. Les autres forment UNE ligne « Sans référence » (sans prix), mise à part du graphique.
 *  Prix d'une ligne = montant / quantité × coefficient (la référence = le prix du fournisseur × coefficient). Du plus gros au plus petit, puis par nom ; « Sans référence » en dernier à égalité. */
export function regrouperParReference(lignes) {
  const g = new Map (), sans = [], total = lignes.reduce((t, l) => t + l.montant_ht, 0)
  for (const l of lignes) { if (l.article_reference_id) { const e = g.get(l.article_reference_id); if (e) e.push(l); else g.set(l.article_reference_id, [l]) } else sans.push(l) }
  const groupes = [...g].map(([cle, ls]) => {
    const recente = [...ls].sort((a, b) => b.date_prix.localeCompare(a.date_prix) || a.ligne_id.localeCompare(b.ligne_id))[0]
    const prix = ls.filter((l) => l.coefficient !== null && l.prix_net !== null).map((l) => (l.prix_net) * (l.coefficient))
    const bas = prix.length ? Math.min(...prix) : null, haut = prix.length ? Math.max(...prix) : null, montant = ls.reduce((t, l) => t + l.montant_ht, 0)
    return {
      cle, nom: recente.libelle_reference || SANS_DESIGNATION, unite: recente.unite_reference, sans_reference: false, nb_fournisseurs: new Set(ls.map((l) => normaliser(l.fournisseur))).size, nb_lignes: ls.length, nb_prix: prix.length,
      prix_min: bas, prix_max: haut, ecart_pct: prix.length >= 2 && bas !== null && haut !== null && bas > 0 ? arrondi1((100 * (haut - bas)) / bas) : null, montant_ht: montant, part_pct: partDe(montant, total),
    }
  })
  if (sans.length) {
    const montant = sans.reduce((t, l) => t + l.montant_ht, 0)
    groupes.push({ cle: 'sans-reference', nom: SANS_REFERENCE, unite: '', sans_reference: true, nb_fournisseurs: new Set(sans.map((l) => normaliser(l.fournisseur))).size, nb_lignes: sans.length, nb_prix: 0, prix_min: null, prix_max: null, ecart_pct: null, montant_ht: montant, part_pct: partDe(montant, total) })
  }
  return groupes.sort((a, b) => b.montant_ht - a.montant_ht || Number(a.sans_reference) - Number(b.sans_reference) || a.nom.localeCompare(b.nom, 'fr') || a.cle.localeCompare(b.cle))
}
/** Barres des articles de référence (la ligne « Sans référence » n'est pas un article : pas de barre). */
export const topReferences = (groupes, n = TOP_GRAPHIQUE) => groupes.filter((x) => !x.sans_reference).slice(0, n).map((x) => ({ nom: x.nom, valeur: x.montant_ht }))
/** Barres des fournisseurs, comme « Par chantier ». */
export const topFournisseurs = (groupes, n = TOP_GRAPHIQUE) => groupes.slice(0, n).map((x) => ({ nom: x.nom, valeur: x.montant_ht }))
