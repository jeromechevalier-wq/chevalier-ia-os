/**
 * Écran « Articles » : UNE seule liste, des cases à cocher et une barre d'action (décision du 24/11/2026).
 * Tout ce fichier est de la logique pure (sans écran, sans réseau) pour être testée : pastille de chaque ligne, filtres en un clic,
 * analyse de la sélection (quel bouton proposer), préparation de l'envoi des coefficients.
 * Les écritures restent faites par n8n (une action `valider_rapprochement` par article) : voir ecran-association.js.
 */
import {
  coefficientFr, ETATS, verifierCoefficient,
} from './logique.js'

// ------------------------------------------------------------------ pastille de chaque ligne

/** Un article est « en groupe » dès qu'il a un rapprochement (suggéré ou validé) ; sinon il est libre (à rapprocher ou refusé). */
export const estEnGroupe = (x) => !!x.rapprochement && !!x.reference

/** Nombre d'articles par article de référence (un groupe = tous les articles qui pointent vers la même référence, suggérés ou validés). */
export function taillesGroupes(liste) {
  const m = new Map()
  for (const x of liste) if (estEnGroupe(x)) { const id = (x.reference).id; m.set(id, (m.get(id) ?? 0) + 1) }
  return m
}

const BADGE = Object.fromEntries(ETATS.map((e) => [e.id, e.badge]))
/**
 * Vocabulaire validé (24/11/2026) : « À rapprocher » (article libre, sans couleur forte), « ✦ À valider · groupe de N » (suggestion de l'IA),
 * « Groupe « nom » · N » (rapproché, validé ; pas d'étincelle). Un groupe validé qui avait été proposé par l'IA a une infobulle « proposé par l'IA, validé par … ».
 */
export function pastilleLigne(x, tailles) {
  if (x.etat === 'refusee') return { texte: 'Refusé', badge: BADGE.refusee, etincelle: false }
  if (!estEnGroupe(x)) return { texte: 'À rapprocher', badge: BADGE.a_rapprocher, etincelle: false }
  const ref = x.reference
  const n = tailles.get(ref.id) ?? 1
  if (x.etat !== 'valide') return { texte: `À valider · groupe de ${n}`, badge: BADGE.suggere, etincelle: true }
  const r = x.rapprochement
  const par = r?.valide_par?.trim()
  return { texte: `Groupe « ${ref.nom} » · ${n}`, badge: BADGE.valide, etincelle: false, infobulle: r?.suggere_par_ia ? `proposé par l’IA, validé par ${par || 'une personne'}` : undefined }
}

/** Les articles DÉJÀ VALIDÉS d'une référence, hors ceux de la fenêtre « Valider le groupe » : montrés en lecture seule au-dessus des lignes à valider. */
export const dejaValidesDeReference = (liste, referenceId, idsFenetre) =>
  liste.filter((y) => y.etat === 'valide' && y.reference?.id === referenceId && !idsFenetre.includes(y.article.id))

// ------------------------------------------------------------------ filtres en un clic

/** Pas de bouton « Tous » : un clic sur le bouton allumé l'éteint (tout s'affiche). « Refusés » n'est que dans la fenêtre « Filtres ». `etincelle` : l'icône du bouton « Demander des suggestions à l'IA ». */
export const FILTRES_RAPIDES = [
  { id: 'a_rapprocher', libelle: 'À rapprocher', etats: ['a_rapprocher'], etincelle: false },
  { id: 'suggere', libelle: 'Suggestions IA à valider', etats: ['suggere'], etincelle: true },
  { id: 'valide', libelle: 'Rapprochés', etats: ['valide'], etincelle: false },
]
/** Nombre d'articles de chaque filtre (sur toute la liste : la recherche et les autres filtres ne changent pas ces nombres). */
export function comptesFiltres(liste) {
  const n = (e) => liste.filter((x) => x.etat === e).length
  return { a_rapprocher: n('a_rapprocher'), suggere: n('suggere'), valide: n('valide') }
}
/** Le filtre en un clic actif (celui dont les états sont exactement ceux des critères) ; null si les critères viennent de la fenêtre « Filtres » (plusieurs états, ou « Refusée »). */
export function filtreRapideActif(c) {
  return FILTRES_RAPIDES.find((f) => f.etats.length === c.etats.length && f.etats.every((e) => c.etats.includes(e)))?.id ?? null
}
/** Un clic allume le filtre ; un second clic sur le même filtre l'éteint (tous les articles). */
export function appliquerFiltreRapide(c, id) {
  const f = FILTRES_RAPIDES.find((x) => x.id === id)
  return { ...c, etats: !f || filtreRapideActif(c) === id ? [] : [...f.etats] }
}

// ------------------------------------------------------------------ sélection : quel bouton proposer

export const TEXTE_COCHE_UN_AUTRE = 'Coche au moins un autre article.'
export const TEXTE_MEME_GROUPE = 'Ces articles sont déjà dans le même groupe : coche un article libre pour l’y ajouter.'
/** Deux groupes ou plus cochés : la fusion est interdite (décision du 24/11/2026, cas très rare) ; on dissocie puis on ajoute. */
export const TEXTE_DEUX_GROUPES = 'Tu as coché plusieurs groupes. Pour les réunir : ouvre l’un des groupes, décoche ses articles et clique sur « Enregistrer », puis coche-les avec l’autre groupe et clique sur « Ajouter au groupe ».'
export const TEXTE_COCHE_UN_LIBRE = 'Coche au moins un article libre pour l’ajouter à ce groupe.'

const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`
export function phraseSelection(nbLibres, nbEnGroupe) {
  const n = nbLibres + nbEnGroupe
  const parts = []
  if (nbEnGroupe > 0) parts.push(`${nbEnGroupe} déjà en groupe`)
  if (nbLibres > 0) parts.push(`${pluriel(nbLibres, 'libre')}`)
  return `${n} article${n > 1 ? 's' : ''} coché${n > 1 ? 's' : ''} : ${parts.join(', ')}`
}

/** Les articles de la liste dont l'identifiant est coché (un identifiant qui n'est plus dans la liste est ignoré). */
export const articlesCoches = (liste, ids) => {
  const s = new Set(ids)
  return liste.filter((x) => s.has(x.article.id))
}

/**
 * Le bouton dépend de la sélection : que des libres (au moins 2) → rapprocher ; un groupe + des libres → ajouter au groupe ;
 * deux groupes ou plus → PAS de bouton (la fusion est interdite : on dissocie, puis on ajoute) ; sinon sélection impossible : pas de bouton, un texte d'aide.
 * Les cases ne sont jamais grisées : on peut tout cocher, c'est cette analyse qui dit ce qui est possible.
 */
export function analyserSelection(liste, ids) {
  const coches = articlesCoches(liste, ids)
  const libres = coches.filter((x) => !estEnGroupe(x))
  const enGroupe = coches.filter(estEnGroupe)
  const parRef = new Map()
  for (const x of liste) if (estEnGroupe(x)) { const id = (x.reference).id; parRef.set(id, [...(parRef.get(id) ?? []), x]) }
  const idsCoches = new Set(coches.map((x) => x.article.id))
  const refs = new Map()
  for (const x of enGroupe) refs.set((x.reference).id, x.reference)
  const groupes = [...refs.values()].map((reference) => {
    const membres = parRef.get(reference.id) ?? []
    return { reference, membres, coches: membres.filter((m) => idsCoches.has(m.article.id)).length, valide: membres.some((m) => m.etat === 'valide') }
  })
  const base = { coches, libres, enGroupe, groupes, phrase: phraseSelection(libres.length, enGroupe.length) }
  const nul = { libelle: '', aide: '' }
  if (coches.length === 0) return { ...base, type: 'aucune', phrase: '', ...nul }
  if (groupes.length >= 2) return { ...base, type: 'impossible', libelle: '', aide: TEXTE_DEUX_GROUPES }
  if (groupes.length === 1) {
    if (libres.length >= 1) return { ...base, type: 'ajouter', libelle: `Ajouter au groupe « ${groupes[0].reference.nom} »`, aide: '' }
    return { ...base, type: 'impossible', libelle: '', aide: coches.length >= 2 ? TEXTE_MEME_GROUPE : TEXTE_COCHE_UN_LIBRE }
  }
  if (libres.length >= 2) return { ...base, type: 'rapprocher', libelle: `Rapprocher ces ${libres.length} articles`, aide: '' }
  return { ...base, type: 'impossible', libelle: '', aide: TEXTE_COCHE_UN_AUTRE }
}

// ------------------------------------------------------------------ fenêtre de regroupement

/**
 * Les articles dont la fenêtre demande un coefficient :
 *  - rapprocher : les articles libres cochés ;
 *  - ajouter : les articles libres cochés (les membres du groupe sont montrés, sans changement) ;
 */
export function lignesDeRegroupement(a) {
  return a.libres.map((x) => ({ x, referenceId: x.reference?.id ?? null, coefficient: x.rapprochement ? x.rapprochement.coefficient : null }))
}
/** Vrai si l'action modifie un groupe qui contient au moins un article VALIDÉ : une confirmation est alors demandée (même règle que « Corriger » un rapprochement validé). */
export const modifieUnGroupeValide = (a) => a.type === 'ajouter' && a.groupes.some((g) => g.valide)

export const TEXTE_CONFIRMER_AJOUT_VALIDE = 'Ce groupe est déjà validé : ajouter des articles le modifie. Les prix de l’historique des articles ajoutés seront ramenés à l’unité de référence.'

/**
 * Prépare l'envoi : chaque article envoyé a un coefficient valide. Un article qui est DÉJÀ dans la référence gardée avec le MÊME coefficient n'est pas renvoyé
 * (on ne touche pas ce qui ne change pas : une suggestion qu'on n'a pas modifiée reste une suggestion, on ne valide jamais à la place de la personne).
 */
export function preparerEnvoi(lignes, saisies, referenceId, dejaFaits = []) {
  const aEnvoyer = []
  const erreurs = {}
  for (const l of lignes) {
    const id = l.x.article.id
    if (dejaFaits.includes(id)) continue
    const v = verifierCoefficient(saisies[id] ?? '')
    if (v.erreur !== undefined) { erreurs[id] = v.erreur; continue }
    const inchange = l.referenceId === referenceId && l.coefficient !== null && Math.abs(l.coefficient - v.valeur) < 1e-12
    if (!inchange) aEnvoyer.push({ id, coefficient: v.valeur, designation: l.x.article.designation })
  }
  return { aEnvoyer, erreurs }
}
/** Coefficients de départ : un article déjà rapproché garde le sien ; un article libre est vide (on ne devine jamais un coefficient). */
export const saisiesDeDepart = (lignes) =>
  Object.fromEntries(lignes.map((l) => [l.x.article.id, l.coefficient === null ? '' : coefficientFr(l.coefficient)]))

/** Ce que la personne a vu de chaque article (référence, coefficient, validé ou non) : sert à refuser d'écrire si quelqu'un d'autre l'a changé entre-temps. */
export const signatureArticle = (x) =>
  `${x.rapprochement ? `${x.rapprochement.article_reference_id}|${Number(x.rapprochement.coefficient)}|${x.rapprochement.valide_le ? 'v' : 's'}` : 'libre'}`
export function articlesChanges(vus, fraiches, ignorer = []) {
  const parId = new Map(fraiches.map((x) => [x.article.id, x]))
  return vus.filter((v) => { if (ignorer.includes(v.article.id)) return false; const f = parId.get(v.article.id); return !f || signatureArticle(f) !== signatureArticle(v) })
}
export const messageArticlesChanges = (n) =>
  n > 1 ? `${n} articles ont changé depuis que tu as ouvert cette fenêtre (quelqu’un d’autre les a modifiés). Rien n’a été enregistré : ferme la fenêtre, regarde la liste à jour, puis recommence.`
    : 'Un article a changé depuis que tu as ouvert cette fenêtre (quelqu’un d’autre l’a modifié). Rien n’a été enregistré : ferme la fenêtre, regarde la liste à jour, puis recommence.'
export const TEXTE_RELECTURE_IMPOSSIBLE = 'La liste n’a pas pu être relue : rien n’a été enregistré. Vérifie ta connexion, puis réessaie.'
export const messageRegroupementTermine = (type, n) =>
  type === 'ajouter' ? `${pluriel(n, 'article ajouté', 'articles ajoutés')} au groupe.` : `Rapprochement validé (${pluriel(n, 'article')}).`
/** Message quand l'enregistrement s'arrête en route : ce qui est fait le reste, ce qui reste à faire est dit. */
export function messageRegroupementInterrompu(faits, total, designationEnEchec, raison) {
  const tete = faits === 0 ? 'Rien n’a été enregistré.' : `${faits} article${faits > 1 ? 's' : ''} sur ${total} ${faits > 1 ? 'sont enregistrés, et ils le restent' : 'est enregistré, et il le reste'}.`
  return `${tete} « ${designationEnEchec} » n’a pas pu être enregistré (${raison.replace(/\s*\.$/, '')}). Corrige, puis réessaie : seuls les articles restants seront envoyés.`
}
