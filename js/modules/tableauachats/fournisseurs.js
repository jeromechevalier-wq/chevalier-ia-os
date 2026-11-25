// Onglet « Fournisseurs et agences » de KPI 2 : calculs purs (testés dans fournisseurs.test.ts), sans React ni base.
// Il répond à « qui sont mes fournisseurs et leurs agences, combien de factures, combien dépensé, dernière facture » à partir des vues de la migration 030 :
// v_td_fournisseurs_fiches (TOUS les fournisseurs enregistrés, même sans facture), v_td_fournisseurs_agences (agences hors fusion) et
// v_td_fournisseurs_factures (factures ACCEPTÉES, un avoir en négatif). Le filtre du haut (Période, Chantier) choisit les FACTURES ; les fiches et les agences restent toutes listées.
import { normaliser } from './filtrage.js';
import { nombre } from './formats.js';
import { enLigneAchat, filtrerAchats, regrouperAchats } from './lignes.js';

/** Une facture acceptée. `montant_ht` : total de la facture, un avoir en négatif. `nb_lignes` : ses lignes d'achat (quantité et montant positifs). */

export const SANS_CHANTIER = 'Sans chantier'
export const SANS_AGENCE = 'Sans agence'
export const FOURNISSEUR_INCONNU = 'Fournisseur inconnu'
const texte = (v) => (v ?? '').trim()
const choix = (f, id) => { const v = f[id]; return v && v.type === 'liste' && v.choix.length ? v.choix : null }
const estAvoir = (f) => f.type_document === 'avoir'
const part = (montant, total) => (total > 0 ? Math.round((1000 * montant) / total) / 10 : null)

/** Filtre du haut : Période (sur la date de la facture, bornes comprises) et Chantier (par nom, sans casse ni accents ; « Sans chantier » pour une facture sans chantier). */
export function filtrerFacturesFournisseurs(factures, f) {
  const ch = choix(f, 'chantier'), chs = ch ? new Set(ch.map(normaliser)) : null, per = f.periode && f.periode.type === 'periode' ? f.periode : null
  return factures.filter((x) => {
    if (chs && !chs.has(normaliser(texte(x.chantier) || SANS_CHANTIER))) return false
    if (per) { if (per.du && x.date_ref < per.du) return false; if (per.au && x.date_ref > per.au) return false }
    return true
  })
}

/** Une ligne du tableau : un fournisseur, avec ses chiffres sur la sélection. `sans_fiche` : des factures portent ce nom, mais aucun fournisseur n'est enregistré sous ce nom. */

/** Range chaque facture sous son fournisseur. Clé : la fiche (`f:<id>`) ; une facture sans fiche rejoint la fiche qui porte le même nom (sans casse ni accents) quand il n'y en a qu'UNE,
 *  comme dans le Pareto (un nom = un fournisseur) ; sinon elle forme un fournisseur « sans fiche » (`n:<nom>`). Toutes les fiches ont une entrée, même vide. */
export function regrouperParFournisseur(fiches, factures) {
  const g = new Map (), parNom = new Map ()
  for (const f of fiches) { g.set(`f:${f.fournisseur_id}`, []); const k = normaliser(f.fournisseur); parNom.set(k, [...(parNom.get(k) ?? []), f.fournisseur_id]) }
  for (const x of factures) {
    let cle
    if (x.fournisseur_id && g.has(`f:${x.fournisseur_id}`)) cle = `f:${x.fournisseur_id}`
    else { const k = normaliser(texte(x.fournisseur) || FOURNISSEUR_INCONNU), memes = parNom.get(k); cle = memes && memes.length === 1 ? `f:${memes[0]}` : `n:${k}` }
    const e = g.get(cle); if (e) e.push(x); else g.set(cle, [x])
  }
  return g
}

/** Chiffres d'un lot de factures acceptées : un avoir se retire du total mais n'est pas compté comme une facture ; la dernière facture est la plus récente hors avoirs. */
export function chiffres(factures) {
  const c = { nb_factures: 0, nb_avoirs: 0, total_ht: 0, nb_lignes: 0, derniere_facture: null }
  for (const x of factures) {
    c.total_ht += x.montant_ht
    if (estAvoir(x)) { c.nb_avoirs += 1; continue }
    c.nb_factures += 1; c.nb_lignes += x.nb_lignes
    if (x.date_ref && (c.derniere_facture === null || x.date_ref > c.derniere_facture)) c.derniere_facture = x.date_ref
  }
  c.total_ht = Math.round(c.total_ht * 100) / 100
  return c
}

/** Le tableau des fournisseurs : TOUS les fournisseurs enregistrés (même sans facture sur la sélection), plus les noms de factures sans fiche.
 *  Part = part du total accepté de la sélection (vide si ce total n'est pas positif). Du plus gros total au plus petit, puis par nom. */
export function tableauFournisseurs(fiches, factures) {
  const g = regrouperParFournisseur(fiches, factures), parId = new Map(fiches.map((f) => [`f:${f.fournisseur_id}`, f]))
  const total = factures.reduce((t, x) => t + x.montant_ht, 0)
  const lignes = []
  for (const [cle, fs] of g) {
    const fiche = parId.get(cle), c = chiffres(fs)
    lignes.push({
      cle, fournisseur_id: fiche?.fournisseur_id ?? null, nom: fiche ? texte(fiche.fournisseur) || FOURNISSEUR_INCONNU : texte(fs[0]?.fournisseur) || FOURNISSEUR_INCONNU,
      siren: texte(fiche?.siren) || texte(fs.find((x) => texte(x.siren))?.siren), nb_agences: fiche ? fiche.nb_agences : null, sans_fiche: !fiche,
      ...c, part_pct: part(c.total_ht, total),
    })
  }
  return lignes.sort((a, b) => b.total_ht - a.total_ht || b.nb_factures - a.nb_factures || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.cle.localeCompare(b.cle))
}

/** Recherche libre sur le nom et le SIREN (sans casse ni accents ; tous les mots doivent s'y trouver ; les espaces d'un SIREN ne comptent pas). */
export function chercherFournisseurs(lignes, recherche) {
  const mots = normaliser(recherche).split(' ').filter(Boolean)
  if (mots.length === 0) return lignes
  const colle = normaliser(recherche).replace(/ /g, '')
  return lignes.filter((l) => { const foin = normaliser(`${l.nom} ${l.siren}`); return mots.every((m) => foin.includes(m)) || (/^\d+$/.test(colle) && l.siren.includes(colle)) })
}

/** Résumé au-dessus du tableau : nombre de fournisseurs, combien ont au moins une facture acceptée sur la sélection, nombre de factures et total. */
export function totalFournisseurs(lignes) {
  return { nb_fournisseurs: lignes.length, nb_actifs: lignes.filter((l) => l.nb_factures > 0).length, nb_factures: lignes.reduce((t, l) => t + l.nb_factures, 0), total_ht: Math.round(lignes.reduce((t, l) => t + l.total_ht, 0) * 100) / 100 }
}

/** Une agence d'un fournisseur, avec ses chiffres sur la sélection. `sans_agence` : les factures du fournisseur qui ne sont reliées à aucune de ses agences. */

/** Les agences d'un fournisseur : TOUTES ses agences enregistrées (même sans facture sur la sélection), plus une ligne « Sans agence » s'il a des factures reliées à aucune d'elles.
 *  Part = part du total du fournisseur. De la plus grosse dépense à la plus petite, puis par nom ; « Sans agence » en dernier à égalité. */
export function agencesDuFournisseur(fournisseurId, agences, facturesDuFournisseur) {
  const siennes = fournisseurId ? agences.filter((a) => a.fournisseur_id === fournisseurId) : []
  const ids = new Set(siennes.map((a) => a.etablissement_id)), total = facturesDuFournisseur.reduce((t, x) => t + x.montant_ht, 0)
  const lignes = siennes.map((a) => {
    const c = chiffres(facturesDuFournisseur.filter((x) => x.etablissement_id === a.etablissement_id))
    return { cle: a.etablissement_id, nom: texte(a.nom_agence) || 'Agence sans nom', ville: texte(a.ville), siret: texte(a.siret), sans_agence: false, nb_factures: c.nb_factures, nb_avoirs: c.nb_avoirs, total_ht: c.total_ht, derniere_facture: c.derniere_facture, part_pct: part(c.total_ht, total) }
  })
  const hors = facturesDuFournisseur.filter((x) => !x.etablissement_id || !ids.has(x.etablissement_id))
  if (hors.length > 0) { const c = chiffres(hors); lignes.push({ cle: 'sans-agence', nom: SANS_AGENCE, ville: '', siret: '', sans_agence: true, nb_factures: c.nb_factures, nb_avoirs: c.nb_avoirs, total_ht: c.total_ht, derniere_facture: c.derniere_facture, part_pct: part(c.total_ht, total) }) }
  return lignes.sort((a, b) => b.total_ht - a.total_ht || Number(a.sans_agence) - Number(b.sans_agence) || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.cle.localeCompare(b.cle))
}

/** Nom d'une agence dans le graphique : « nom (ville) » si la ville n'est pas déjà dans le nom. */
export const nomAgence = (a) => (a.ville && !normaliser(a.nom).includes(normaliser(a.ville)) ? `${a.nom} (${a.ville})` : a.nom)
/** Barres du graphique « Dépenses par agence » : seulement les agences dont le total est positif (une barre négative ou nulle ne se lit pas), dans l'ordre du tableau. */
export const barresAgences = (agences) => agences.filter((a) => a.total_ht > 0).map((a) => ({ nom: nomAgence(a), valeur: a.total_ht }))

export const TOP_ARTICLES = 10
/** Les articles les plus dépensés chez un fournisseur (par NOM, sans casse ni accents : les lignes d'achat ne portent pas l'identifiant du fournisseur), à partir des lignes d'achat déjà filtrées par le filtre du haut.
 *  Mêmes règles que « Lignes et articles » > « Par article ». Part = part des lignes d'achat de ce fournisseur. */
export function topArticlesFournisseur(lignes, attributs, nom, n = TOP_ARTICLES) {
  const fiches = new Map(attributs.map((a) => [a.article_fournisseur_id, a]))
  return regrouperAchats(filtrerAchats(lignes.map((l) => enLigneAchat(l, fiches)), { fournisseurs: [nom] }), 'article').slice(0, n)
}

// ------------------------------------------------------------------ une ligne lue dans la base devient une donnée sûre (nombres passés par `nombre()`, textes ou nul)

const texteLu = (v) => (v === null || v === undefined ? null : String(v))

export const enFiche = (x) => ({ fournisseur_id: String(x.fournisseur_id), fournisseur: String(x.fournisseur ?? ''), siren: texteLu(x.siren), nb_agences: nombre(x.nb_agences) ?? 0 })
export const enAgence = (x) => ({ etablissement_id: String(x.etablissement_id), fournisseur_id: String(x.fournisseur_id), nom_agence: texteLu(x.nom_agence), ville: texteLu(x.ville), siret: texteLu(x.siret) })
export const enFacture = (x) => ({
  facture_id: String(x.facture_id), numero: texteLu(x.numero), date_ref: String(x.date_ref ?? ''), fournisseur_id: texteLu(x.fournisseur_id), fournisseur: texteLu(x.fournisseur), siren: texteLu(x.siren),
  etablissement_id: texteLu(x.etablissement_id), chantier: texteLu(x.chantier), type_document: texteLu(x.type_document), montant_ht: nombre(x.montant_ht) ?? 0, nb_lignes: nombre(x.nb_lignes) ?? 0,
})
