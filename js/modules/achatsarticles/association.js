/**
 * Fenêtre « Association » (écran Articles) : toute la logique pure, sans écran ni réseau, pour être testée.
 * Une association relie AU MOINS DEUX articles de fournisseurs qui sont « à peu près la même chose » ; elle porte un article interne (`articles_reference`).
 * Écritures : uniquement les actions n8n existantes (valider_rapprochement, dissocier_rapprochement, refuser_suggestion, renommer_reference, creer_article_reference).
 */
import { coefficientFr, decimalesPrix, estNomDejaPris, eurosPrix, messageReferenceRenommee, normaliserUnite, nomPropre, pourcentFr, prixRamene, SEUIL_EGALITE_POURCENT, verifierCoefficient, LIMITES_REFERENCE } from './logique.js'

/** Vrai si l'article a déjà un lien (validé ou suggéré par l'IA) dans l'association ouverte. */
export const estMembre = (x) => !!x.rapprochement
/** Vrai si le lien est VALIDÉ (colonne `valide_le` de la base : jamais l'état affiché). */
export const estLienValide = (x) => !!x.rapprochement?.valide_le

/** Départ : tout est coché ; un article lié garde son coefficient, un article libre est vide (on ne devine jamais un coefficient). */
export const saisiesDepart = (xs) =>
  Object.fromEntries(xs.map((x) => [x.article.id, { coche: true, coefficient: x.rapprochement ? coefficientFr(x.rapprochement.coefficient) : '' }]))

/** Nom proposé à la création : la désignation du premier article (rangée, 120 caractères au plus). */
export const nomPropose = (xs) => nomPropre(xs[0]?.article.designation ?? '').slice(0, LIMITES_REFERENCE.nom).trim()

/** Unité de l'article interne à la création : celle du premier article ; `commune` = tous les articles ont la même (sinon la personne la saisit). */
export function uniteDeCreation(xs) {
  const premiere = xs[0]?.article.unite?.trim() ?? ''
  const commune = premiere !== '' && xs.every((x) => normaliserUnite(x.article.unite) === normaliserUnite(premiere))
  return { unite: premiere, commune }
}

export const TEXTE_ASSOCIATION_DEFAITE = 'Il ne resterait qu’un article : l’association sera défaite, les articles redeviennent libres. Rien d’autre n’est enregistré.'
/** Même cas, quand des articles qui sortent sont des suggestions de l'IA (elles passent « Refusé », elles ne redeviennent pas libres). */
export const TEXTE_ASSOCIATION_DEFAITE_AVEC_SUGGESTIONS = 'Il ne resterait qu’un article : l’association sera défaite. Les articles validés redeviennent libres, les suggestions de l’IA sont refusées. Rien d’autre n’est enregistré.'
export const TEXTE_SUGGESTIONS_REFUSEES = ' Les suggestions de l’IA décochées sont refusées.'
export const messageDecoches = (reste) => `Les articles décochés sortent de l’association. Il reste ${reste} articles.`
export const TEXTE_COCHE_DEUX = 'Coche au moins deux articles pour faire une association.'
export const TEXTE_RIEN_A_ENREGISTRER = 'Rien à enregistrer.'
export const TEXTE_ACTION_EN_COURS = 'Un instant : l’action précédente se termine. Réessaie dans quelques secondes.'
/** Confirmation d'un simple ajout à une association déjà validée (vocabulaire de la fenêtre : association, article interne). */
export const TEXTE_AJOUT_A_ASSOCIATION_VALIDEE = 'Cette association est déjà validée : y ajouter des articles la modifie. Les prix de l’historique des articles ajoutés seront ramenés à l’unité de l’article interne.'
export const TEXTE_CORRECTION_PRIX = 'Ça change les prix de tout l’historique de cet article.'
export const TEXTE_CORRECTION_PRIX_PLURIEL = 'Ça change les prix de tout l’historique de ces articles.'
export const TEXTE_REFERENCE_ENREGISTREE_RELECTURE = 'L’article interne est enregistré, mais la liste n’a pas pu être relue. Vérifie ta connexion, puis réessaie.'
/** Texte venu des fonctions communes (« article de référence ») remis au vocabulaire de la fenêtre (« article interne »). */
export const vocabulaireAssociation = (t) => (t === null ? null : t.replace(/article de référence/g, 'article interne').replace(/Article de référence/g, 'Article interne'))

/**
 * L'état de la fenêtre à partir des cases et des coefficients.
 * `vus` : l'état RELU des articles (après une panne en route) ; `dejaFaits` : articles déjà validés pendant cette ouverture (traités comme liés ET validés).
 * Règle : décocher un article d'une association de 3 le fait sortir (il en reste 2) ; décocher un ou deux articles d'une association de 2
 * la défait (les deux sortent : un seul bout ne reste jamais). On compte les articles DÉJÀ LIÉS qui restent cochés (jamais les articles libres à ajouter).
 * Un article libre décoché n'est simplement pas ajouté. « Enregistrer » fait tout : valider les articles cochés puis, en dernier, faire sortir les articles liés décochés.
 * Association défaite (moins de 2 articles liés cochés) : seule la sortie se fait, on ne valide jamais ce qui va être dissocié.
 * Exception (décision prise seul) : une association qui n'a qu'UN article lié et aucune autre ligne reste renommable et corrigible avec une seule case cochée.
 * Sortie après une panne : si un seul article lié reste coché après des écritures déjà faites, « Enregistrer » le fait sortir.
 */
export function etatAssociation(xs, saisies, dejaFaits = [], vus = []) {
  const frais = new Map(vus.map((v) => [v.article.id, v]))
  const vue = (x) => frais.get(x.article.id) ?? x
  const membre = (x) => estMembre(vue(x)) || dejaFaits.includes(x.article.id)
  const valide = (x) => estLienValide(vue(x)) || dejaFaits.includes(x.article.id)
  const coche = (x) => saisies[x.article.id]?.coche ?? true
  const coches = xs.filter(coche)
  const membresCoches = coches.filter(membre)
  const decochees = xs.filter((x) => membre(x) && !coche(x))
  const defaite = membresCoches.length < 2 && (decochees.length > 0 || (dejaFaits.length > 0 && membresCoches.length > 0 && coches.length < 2))
  const sortants = (defaite ? xs.filter(membre) : decochees).map((x) => ({ x: vue(x), action: valide(x) ? 'dissocier' : 'refuser' }))
  const erreurs = {}
  const aEnvoyer = []
  const coefficientsChanges = []
  // Association défaite : rien n'est validé, les coefficients n'ont plus d'importance.
  for (const x of defaite ? [] : coches) {
    const id = x.article.id
    const v = verifierCoefficient(saisies[id]?.coefficient ?? '')
    if (v.erreur !== undefined) { erreurs[id] = v.erreur; continue }
    const r = vue(x).rapprochement
    const change = !!r && Math.abs(Number(r.coefficient) - v.valeur) >= 1e-12
    if (estLienValide(vue(x)) && change) coefficientsChanges.push(x)
    if (dejaFaits.includes(id)) continue
    // Un lien validé qui ne change pas n'est pas renvoyé ; un article libre ou une suggestion cochée est écrit (validé par la personne).
    if (!estLienValide(vue(x)) || change) aEnvoyer.push({ id, coefficient: v.valeur, designation: x.article.designation, suggestion: membre(x) && !valide(x) })
  }
  let message = ''
  if (decochees.length > 0 || defaite) {
    const avecRefus = sortants.some((s) => s.action === 'refuser')
    message = defaite ? (avecRefus ? TEXTE_ASSOCIATION_DEFAITE_AVEC_SUGGESTIONS : TEXTE_ASSOCIATION_DEFAITE) : messageDecoches(coches.length) + (avecRefus ? TEXTE_SUGGESTIONS_REFUSEES : '')
  }
  const seul = xs.length === 1 && membre(xs[0])
  const assezDeCoches = coches.length >= 2 || (seul && coches.length === 1)
  // Pourquoi « Enregistrer » est grisé (texte court sous la liste) : pas assez d'articles cochés.
  const aide = decochees.length === 0 && !defaite && !assezDeCoches ? TEXTE_COCHE_DEUX : ''
  return {
    nbCoches: coches.length, decochees, defaite, sortants, aEnvoyer, erreurs, coefficientsChanges, message, aide,
    enregistrerPossible: defaite ? sortants.length > 0 : assezDeCoches && Object.keys(erreurs).length === 0,
  }
}

/**
 * Plan d'écriture de « Enregistrer ». `renommage` : l'article interne existe et son nom a changé.
 * Association défaite : renommage et validations sont SAUTÉS, seule la sortie de tous les articles liés a lieu.
 * Le choix dissocier / refuser suit l'état relu (`vus`) et `dejaFaits`, jamais la photo d'ouverture.
 */
export function planEnregistrement(xs, saisies, dejaFaits, vus, renommage) {
  const e = etatAssociation(xs, saisies, dejaFaits, vus)
  const valider = e.defaite ? [] : e.aEnvoyer
  const etapes = []
  if (renommage && !e.defaite) etapes.push('renommer')
  if (valider.length > 0) etapes.push('valider')
  if (e.sortants.length > 0) etapes.push('sortir')
  return { etapes, defaite: e.defaite, valider, sortir: e.sortants }
}

/**
 * Phrases de confirmation de « Enregistrer » quand des articles sortent : ce qui va se passer, court.
 * Les liens validés qui sortent « redeviennent libres », les suggestions de l'IA sont « refusées » (jamais « libres »).
 * `suggestionsValidees` : suggestions restées cochées, validées du même clic.
 */
export function texteConfirmationEnregistrement(sortants, defaite, suggestionsValidees = 0) {
  const refus = sortants.filter((s) => s.action === 'refuser').length
  const libres = sortants.length - refus
  const phraseLibres = (n) => (n > 1 ? `${n} articles redeviennent libres` : '1 article redevient libre')
  const phraseRefus = (n) => (n > 1 ? `${n} suggestions de l’IA sont refusées` : '1 suggestion de l’IA est refusée')
  const phraseSorties = (n) => (n > 1 ? `${n} articles sortent de l’association` : '1 article sort de l’association')
  let t
  if (defaite) t = `L’association sera défaite : ${[libres > 0 ? phraseLibres(libres) : '', refus > 0 ? phraseRefus(refus) : ''].filter(Boolean).join(', ')}.`
  else t = `${[libres > 0 ? phraseSorties(libres) : '', refus > 0 ? (refus > 1 ? `${refus} suggestions de l’IA décochées sont refusées` : '1 suggestion de l’IA décochée est refusée') : ''].filter(Boolean).join(' ; ')}.`.replace(/^./, (c) => c.toUpperCase())
  if (suggestionsValidees > 0) t += suggestionsValidees > 1 ? ` ${suggestionsValidees} suggestions cochées sont validées.` : ' 1 suggestion cochée est validée.'
  if (sortants.length > 0) t += ' Le bandeau « Annuler » remet les articles sortis.'
  return t
}

/** Ce qui a déjà été écrit pendant « Enregistrer » (renommage, validations) : dit quand la sortie échoue ensuite, pour ne jamais prétendre que rien n'a été fait. */
export function resumeDejaFait(renomme, nbValides, nom) {
  const parts = []
  if (renomme) parts.push(messageReferenceRenommee(nom))
  if (nbValides > 0) parts.push(nbValides > 1 ? `${nbValides} articles sont validés.` : '1 article est validé.')
  return parts.join(' ')
}

/** Renomme l'article interne si le nom a changé. `nom_pris` : le serveur refuse (autre article interne du même nom), rien d'autre n'est à envoyer ; toute autre erreur remonte. */
export async function renommerSiBesoin(renommer, id, nom, nomEnregistre) {
  if (nomPropre(nom) === nomEnregistre) return 'inchange'
  try { await renommer(id, nomPropre(nom)) } catch (e) { if (estNomDejaPris(e)) return 'nom_pris'; throw e }
  return 'renomme'
}
/** Message final : le renommage réussi (même lors d'un premier essai interrompu) reste mentionné. */
export function messageFinal(renomme, nom, nbEcrits) {
  if (!renomme) return MESSAGE_ASSOCIATION_ENREGISTREE
  return nbEcrits === 0 ? messageReferenceRenommee(nom) : `${messageReferenceRenommee(nom)} ${MESSAGE_ASSOCIATION_ENREGISTREE}`
}
/** « Annuler » de la dissociation interrompu en route : ce qui est revenu, ce qui ne l'est pas. */
export const messageAnnulationPartielle = (faits, total, raison) =>
  `${faits === 0 ? 'La dissociation n’a pas pu être annulée' : `${faits} article${faits > 1 ? 's sont revenus' : ' est revenu'} sur ${total}, les autres non`} (${raison.replace(/\s*\.$/, '')}). Regarde la liste à jour : un article peut être resté seul.`

/** Message quand la sortie s'arrête en route : ce qui est fait le reste. */
export function messageSortieInterrompue(faits, total, designationEnEchec, raison, dejaFait = '') {
  const sorti = `${faits} article${faits > 1 ? 's' : ''} sur ${total} ${faits > 1 ? 'sont sortis' : 'est sorti'} de l’association.`
  const tete = faits === 0 ? (dejaFait ? `${dejaFait} Aucun article n’est sorti de l’association.` : 'Rien n’a été fait.') : `${dejaFait ? `${dejaFait} ` : ''}${sorti}`
  return `${tete} « ${designationEnEchec} » n’a pas pu sortir (${raison.replace(/\s*\.$/, '')}). Regarde la liste à jour${faits > 0 ? ' : un article peut être resté seul dans l’association' : ''}, puis réessaie.`
}

export const MESSAGE_ASSOCIATION_ENREGISTREE = 'Association enregistrée.'
export const TEXTE_PRIX_VILLES_INDISPONIBLES = 'Villes indisponibles'

// ------------------------------------------------------------------ villes d'achat

/** Une ligne lue dans `v_td_prix_lignes` (colonnes explicites) : l'article, l'agence et la ville de la facture. */

/** Villes (ou agences) d'achat distinctes de chaque article : le nom de l'agence s'il existe, sinon la ville. */
export function villesParArticle(lignes) {
  const res = {}
  for (const l of lignes) {
    const id = l.article_fournisseur_id
    const lieu = l.nom_agence?.trim() || l.ville?.trim()
    if (!id || !lieu) continue
    const deja = res[id] ?? (res[id] = [])
    if (!deja.some((v) => v.toLowerCase() === lieu.toLowerCase())) deja.push(lieu)
  }
  for (const id of Object.keys(res)) res[id].sort((a, b) => a.localeCompare(b, 'fr'))
  return res
}

/** Comparaison des prix dans la fenêtre : badge « Le moins cher » et bandeau d'écart (décision du 24/11/2026). */

export const TEXTE_MEME_PRIX = 'Même prix pour tous les articles.'
export const TEXTE_BADGE_MOINS_CHER = 'Le moins cher'

/**
 * Compare le prix par unité de l'article interne (dernier prix HT du fournisseur ramené par le coefficient, même formule que le message de prix : `prixRamene`).
 * Ne comptent que les articles cochés qui ont un prix ET un coefficient valide ; moins de 2 comparables = rien (null).
 */
export function comparerPrix(xs, saisies) {
  const prix = []
  for (const x of xs) {
    const s = saisies[x.article.id]
    if (!s?.coche) continue
    const v = verifierCoefficient(s.coefficient)
    if (v.valeur === undefined || v.valeur === null) continue
    const p = prixRamene(x.stats.dernierPrix, v.valeur)
    if (p === null || !(p > 0)) continue
    prix.push({ id: x.article.id, p })
  }
  if (prix.length < 2) return null
  const min = Math.min(...prix.map((a) => a.p))
  const max = Math.max(...prix.map((a) => a.p))
  const pourcent = ((max - min) / min) * 100
  const egal = pourcent < SEUIL_EGALITE_POURCENT
  const moinsChers = prix.filter((a) => egal || ((a.p - min) / min) * 100 < SEUIL_EGALITE_POURCENT).map((a) => a.id)
  return { moinsChers, egal, ecart: max - min, pourcent, decimales: decimalesPrix(min) }
}

/** Texte du bandeau de synthèse sous la liste. `unite` = unité de l'article interne. */
export function texteComparaison(c, unite) {
  if (c.egal) return TEXTE_MEME_PRIX
  const e = eurosPrix(c.ecart, c.decimales === 2 && c.ecart < 0.005 ? 4 : c.decimales)
  return `Écart entre le moins cher et le plus cher : ${e} par ${unite.trim() || 'unité'}, soit ${pourcentFr(c.pourcent)}`
}
