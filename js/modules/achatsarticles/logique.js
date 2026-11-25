// Logique pure de l'écran « Articles » : états, prix, coefficient (et son SENS), création d'une référence, filtres, tri.
// Aucun appel réseau : tout est testé dans tests/achatsarticles-logique.test.js. Les écritures passent par les actions métier (js/os/actions-metier.js).
//
// SENS DU COEFFICIENT (migration 010, lignes 81 à 87) :
//   prix par unité de référence = prix par unité du fournisseur × coefficient
//   donc coefficient = nombre d'unités DU FOURNISSEUR contenues dans UNE unité de référence.
//   Exemple : référence « sac de 25 kg », fournisseur « sac de 35 kg » : coefficient = 25/35 ≈ 0,714 (et NON 1,4). À 100 € le sac de 35 kg : 71,43 €.
import { normaliser, dateFr, euros, nombreFr } from './formats.js'

// ------------------------------------------------------------------ données lues (lecture seule)
// Formes des lignes lues dans la base (les types du code d'origine, gardés ici en commentaire) :
//  ArticleFournisseur : { id, fournisseur_id, reference, designation, unite, created_at?, fournisseurs?: { nom } | null }
//  ArticleReference   : { id, nom, unite_reference, actif }
//  Rapprochement      : { article_fournisseur_id, article_reference_id, coefficient, valide_le, valide_par?, suggere_par_ia }
//  SuggestionRefusee  : suggestion de l'IA refusée par un humain, gardée pour pouvoir la reprendre : { article_fournisseur_id, refuse_par, refuse_le, article_reference_id, coefficient }
//                       (`article_reference_id` et `coefficient` sont vides pour un refus écrit avant la migration 017 : il ne peut pas être repris).
//  LignePrix          : une ligne de facture avec sa facture (pour ne garder que les factures acceptées) : { id, article_fournisseur_id, quantite, montant_ht, factures: { statut, type_document, date_facture, created_at } | null }

// ------------------------------------------------------------------ état

export const ETATS = [
  { id: 'a_rapprocher', libelle: 'À rapprocher', badge: '' },
  { id: 'suggere', libelle: 'Suggéré par l’IA', badge: 'badge-attention' },
  // « Refusée » sans « par toi » : le refus a pu être fait par un collègue. Même couleur que les factures refusées (var(--retard)).
  { id: 'refusee', libelle: 'Refusée', badge: 'badge-retard' },
  { id: 'valide', libelle: 'Validé', badge: 'badge-succes' },
]
export const libelleEtat = (e) => ETATS.find((x) => x.id === e)?.libelle ?? e
/** Vocabulaire des filtres de l'écran Articles (validé le 24/11/2026) : boutons, fenêtre « Filtres » et pastilles de filtre. */
export const LIBELLES_FILTRE = { a_rapprocher: 'À rapprocher', suggere: 'Suggestions IA à valider', valide: 'Rapprochés', refusee: 'Refusés' }
export const libelleEtatFiltre = (e) => LIBELLES_FILTRE[e]

/** Priorité : validé (valide_le non nul, même s'il venait de l'IA) > suggéré (une ligne existe) > refusée (dans suggestions_refusees) > à rapprocher. */
export function etatArticle(r, refus) {
  if (r) return r.valide_le ? 'valide' : 'suggere'
  return refus ? 'refusee' : 'a_rapprocher'
}
/** On ne refuse qu'une suggestion, jamais un rapprochement validé. */
export const peutRefuser = (e) => e === 'suggere'
/** « Reprendre cette suggestion » : seulement un article refusé dont la suggestion a été gardée (refus écrit après la migration 017). */
export const peutReprendre = (x) =>
  x.etat === 'refusee' && !!x.refus && !!x.refus.article_reference_id && x.refus.coefficient !== null && x.refus.coefficient !== undefined
/** Durée du bandeau « Suggestion refusée. [Annuler] » (décision du 23/11/2026). */
export const DUREE_ANNULATION_MS = 8000
export const TEXTE_REFUS_ANNULABLE = 'Suggestion refusée.'
export const TEXTE_AUCUNE_REFUSEE = 'Aucune suggestion refusée.'
/** Repli : la lecture des refusées a échoué (par exemple migration 017 pas encore appliquée) ; l'écran charge quand même. */
export const TEXTE_REFUSEES_INDISPONIBLES = 'Les suggestions refusées ne peuvent pas être affichées pour l’instant : ces articles apparaissent « À rapprocher ». Le reste de la liste est à jour.'
/** Lecture « de secours » : en cas d'échec, une liste vide marquée indisponible au lieu d'une erreur qui bloquerait tout l'écran. */
export async function lectureDeSecours(lire) {
  try { return { ...(await lire()), indisponible: false } } catch { return { lignes: [], tronque: false, indisponible: true } }
}
/** Libellé de la colonne « Article de référence » pour un article refusé. */
export function texteSuggestionRefusee(x) {
  if (!x.refus) return '—'
  if (!x.referenceRefusee || x.refus.coefficient === null || x.refus.coefficient === undefined) return 'Suggestion refusée non gardée (refus ancien) : rapproche-le toi-même.'
  return `Refusé : ${x.referenceRefusee.nom} · coefficient ${coefficientFr(Number(x.refus.coefficient))} · ${x.referenceRefusee.unite_reference}`
}
export const AVERTISSEMENT_CORRECTION = 'Ça change les prix de tout l’historique de cet article.'
/** Avertissement à montrer avant de valider : seulement quand on corrige un rapprochement déjà validé. */
export const avertissementAvantValidation = (e) => (e === 'valide' ? AVERTISSEMENT_CORRECTION : null)

// ------------------------------------------------------------------ lignes et prix (définitions de Metabase, 010:416 et 424)

/** Horodatage → date de Paris AAAA-MM-JJ (par dateFr de types.ts, seul endroit qui formate les dates). Une date sans heure reste telle quelle. */
export function dateParis(valeur) {
  if (!valeur) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateFr(valeur))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export const STATS_VIDES = { nbLignes: 0, dernierPrix: null, derniereDate: null }

/** Ligne comptée : facture ACCEPTÉE, type « facture » (pas un avoir), quantité > 0, montant HT connu. Prix = montant_ht / quantite (prix net). */
export function ligneComptee(l) {
  const f = l.factures
  return !!f && f.statut === 'acceptee' && f.type_document === 'facture' && typeof l.quantite === 'number' && Number.isFinite(l.quantite) && l.quantite > 0
    && typeof l.montant_ht === 'number' && Number.isFinite(l.montant_ht) && !!l.article_fournisseur_id
}

/** Nombre de lignes et dernier prix par article fournisseur. « Dernier » = date de la facture (sinon date de réception, heure de Paris), puis identifiant de la ligne, comme v_comparaison_fournisseurs. */
export function statistiquesLignes(lignes) {
  const res = new Map()
  for (const l of lignes) {
    if (!ligneComptee(l)) continue
    const id = l.article_fournisseur_id
    const date = l.factures?.date_facture ?? dateParis(l.factures?.created_at) ?? ''
    const cle = `${date}|${l.id}`
    const prix = (l.montant_ht) / (l.quantite)
    const s = res.get(id)
    if (!s) res.set(id, { nbLignes: 1, dernierPrix: prix, derniereDate: date || null, cle })
    else {
      s.nbLignes += 1
      if (cle > s.cle) { s.cle = cle; s.dernierPrix = prix; s.derniereDate = date || null }
    }
  }
  return new Map([...res].map(([k, v]) => [k, { nbLignes: v.nbLignes, dernierPrix: v.dernierPrix, derniereDate: v.derniereDate }]))
}

// ------------------------------------------------------------------ nombres et coefficient

export const COEFFICIENT_MIN = 0.000001
export const COEFFICIENT_MAX = 1000000
/** 9 chiffres significatifs (et non 6 décimales : 1/35000 = 0,0000285714… doit survivre), comme le workflow 05. */
export const arrondirCoefficient = (n) => Number(n.toPrecision(9))

/** Nombre saisi : « 0,714 », « 0.714 », « 1 000 » ; avec `fraction`, aussi « 25/35 ». null = vide ; NaN = pas un nombre. */
export function lireNombre(texte, fraction = false) {
  const t = texte.replace(/[\s  ]/g, '').replace(/,/g, '.')
  if (t === '') return null
  const simple = /^\d+(\.\d+)?$|^\.\d+$/
  if (fraction && t.includes('/')) {
    const [a, b, ...reste] = t.split('/')
    if (reste.length || !simple.test(a) || !simple.test(b)) return NaN
    const d = Number(b)
    return d === 0 ? NaN : Number(a) / d
  }
  if (!simple.test(t)) return NaN
  return Number(t)
}

/** Contrôle du coefficient (champ « Coefficient ») : { valeur } ou { erreur } en français. Virgule acceptée. */
export function verifierCoefficient(texte) {
  const n = lireNombre(texte, true)
  if (n === null) return { erreur: 'Indique le coefficient (par exemple 1 si c’est la même unité).' }
  // Un nombre précédé d'un signe moins : c'est bien un nombre, mais négatif.
  const sansSigne = texte.trim().replace(/^[-−]\s*/, '')
  if (sansSigne !== texte.trim()) { const m = lireNombre(sansSigne, true); if (m !== null && !Number.isNaN(m)) return { erreur: 'Le coefficient doit être plus grand que zéro.' } }
  if (Number.isNaN(n) || !Number.isFinite(n)) return { erreur: 'Le coefficient doit être un nombre (par exemple 0,714 ou 1).' }
  if (n <= 0) return { erreur: 'Le coefficient doit être plus grand que zéro.' }
  const v = arrondirCoefficient(n)
  if (v < COEFFICIENT_MIN || v > COEFFICIENT_MAX) return { erreur: 'Le coefficient doit être compris entre 0,000001 et 1 000 000.' }
  return { valeur: v }
}

/** Les deux façons d'écrire le rapport entre les unités dans l'aide au calcul. */

/**
 * Aide au calcul. `reference_en_fournisseur` : « 1 unité de référence = Y unités du fournisseur » → coefficient = Y (le bon sens, direct).
 * `fournisseur_en_reference` : « 1 unité du fournisseur = Y unités de référence » → coefficient = 1 / Y. Y peut s'écrire « 25/35 ».
 */
export function coefficientDepuisAide(sens, texte) {
  const y = lireNombre(texte, true)
  if (y === null) return { erreur: 'Écris combien d’unités cela fait.' }
  if (Number.isNaN(y) || !Number.isFinite(y) || y <= 0) return { erreur: 'Écris un nombre plus grand que zéro (par exemple 0,714 ou 25/35).' }
  const k = arrondirCoefficient(sens === 'reference_en_fournisseur' ? y : 1 / y)
  if (k < COEFFICIENT_MIN || k > COEFFICIENT_MAX) return { erreur: 'Le coefficient obtenu sort des limites (de 0,000001 à 1 000 000).' }
  return { valeur: k }
}

/** Prix ramené à l'unité de référence = dernier prix × coefficient (pas d'arrondi : on arrondit seulement à l'affichage). */
export const prixRamene = (dernierPrix, coefficient) =>
  dernierPrix === null || coefficient === null || !Number.isFinite(dernierPrix) || !Number.isFinite(coefficient) ? null : dernierPrix * coefficient

/** Phrase d'aperçu sous le coefficient. */
export function phraseApercu(dernierPrix, coefficient, uniteReference) {
  if (dernierPrix === null) return 'Pas encore de prix pour cet article (aucune ligne de facture acceptée) : l’aperçu viendra avec le prochain achat.'
  const p = prixRamene(dernierPrix, coefficient)
  if (p === null) return `Dernier prix : ${euros(dernierPrix)} HT par unité du fournisseur.`
  return `Au dernier prix de ${euros(dernierPrix)} HT, ça fait ${euros(p)} HT par unité de référence${uniteReference.trim() ? ` (${uniteReference.trim()})` : ''}.`
}
export const coefficientFr = (n) => nombreFr(n, 15)

// ------------------------------------------------------------------ article de référence

export const LIMITES_REFERENCE = { nom: 120, unite: 30 }
/** Même normalisation que normaliser_unite de la base (010) et que le workflow 05 : « Sacs » = « sac », « m² » = « m2 », « pièce » = « u »… */
export function normaliserUnite(t) {
  const x = normaliserNom(String(t ?? '').replace(/²/g, '2').replace(/³/g, '3')).replace(/ /g, '')
  if (['u', 'un', 'unite', 'unites', 'pce', 'pces', 'piece', 'pieces', 'pc', 'pcs', 'ea'].includes(x)) return 'u'
  if (['m', 'metre', 'metres'].includes(x)) return 'm'
  if (['ml', 'metrelineaire', 'metreslineaires'].includes(x)) return 'ml'
  if (['m2', 'metrecarre', 'metrescarres'].includes(x)) return 'm2'
  if (['m3', 'metrecube', 'metrescubes'].includes(x)) return 'm3'
  if (['kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes'].includes(x)) return 'kg'
  if (['t', 'tonne', 'tonnes'].includes(x)) return 't'
  if (['l', 'litre', 'litres'].includes(x)) return 'l'
  if (['sac', 'sacs'].includes(x)) return 'sac'
  return x
}
/** Même normalisation que normaliser_texte de la base (009) : minuscules, sans accents, œ = oe, tout ce qui n'est ni lettre ni chiffre = un espace. */
export const normaliserNom = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim()
/** Unités proposées dans le champ (texte libre permis). */
export const UNITES_PROPOSEES = ['u', 'sac', 'kg', 't', 'm', 'ml', 'm2', 'm3', 'l', 'rouleau', 'palette', 'boîte', 'paquet', 'lot']

/** Créer une référence : nom et unité obligatoires ; un nom qui existe déjà (même nom normalisé, active ou non) renvoie l'existante : on n'en crée pas d'autre. */
export function verifierNouvelleReference(nom, unite, references) {
  const n = nom.replace(/\s+/g, ' ').trim()
  const u = unite.trim()
  if (!n || normaliserNom(n) === '') return { erreur: 'Le nom de l’article de référence est obligatoire.' }
  if (n.length > LIMITES_REFERENCE.nom) return { erreur: `Le nom est trop long (${LIMITES_REFERENCE.nom} caractères au maximum).` }
  const existante = references.find((r) => normaliserNom(r.nom) === normaliserNom(n))
  if (existante) return { existante }
  if (!u) return { erreur: 'Indique l’unité de référence (par exemple sac, kg, m2 ou u).' }
  if (u.length > LIMITES_REFERENCE.unite) return { erreur: `L’unité est trop longue (${LIMITES_REFERENCE.unite} caractères au maximum).` }
  return { ok: { nom: n, unite_reference: u } }
}
export const phraseReferenceExistante = (r) =>
  `« ${r.nom} » existe déjà (unité : ${r.unite_reference})${r.actif ? '' : ', mis de côté : il sera réactivé'}. Choisis-le au lieu d’en créer un autre.`

/** Corps de l'action `valider_rapprochement` : 3 champs, coefficient en NOMBRE, jamais d'identité (elle vient de la connexion). */
export const corpsValidation = (articleFournisseurId, articleReferenceId, coefficient) =>
  ({ article_fournisseur_id: articleFournisseurId, article_reference_id: articleReferenceId, coefficient })
export const corpsCreationReference = (nom, unite) => ({ nom: nom.replace(/\s+/g, ' ').trim(), unite_reference: unite.trim() })
export const corpsRefus = (articleFournisseurId) => ({ article_fournisseur_id: articleFournisseurId })
/** Corps de `reprendre_suggestion` (et du bouton « Annuler ») : l'article seul ; la référence et le coefficient sont ceux gardés par la base. */
export const corpsReprise = (articleFournisseurId) => ({ article_fournisseur_id: articleFournisseurId })
/** Corps de `renommer_reference` (migration 033) : la référence et son nouveau nom (espaces rangés) ; jamais d'identité (elle vient de la connexion). */
export const corpsRenommage = (articleReferenceId, nom) => ({ article_reference_id: articleReferenceId, nom: nomPropre(nom) })
/** Nom rangé : espaces du début et de la fin retirés, espaces multiples réduits à un. */
export const nomPropre = (s) => s.replace(/\s+/g, ' ').trim()
/** Deux noms qui ne diffèrent que par la casse ou les espaces : aucun renommage à faire. */
export const memeNom = (a, b) => nomPropre(a).toLowerCase() === nomPropre(b).toLowerCase()
/** Contrôle du champ « Nom de l'article de référence » de la fenêtre du groupe : message en français simple, ou null si le nom est utilisable. */
export function verifierNomReferenceGroupe(nom) {
  const n = nomPropre(nom)
  if (!n) return 'Écris un nom pour l’article de référence.'
  if (normaliserNom(n) === '') return 'Le nom doit contenir au moins une lettre ou un chiffre.'
  if (n.length > LIMITES_REFERENCE.nom) return `Le nom est trop long (${LIMITES_REFERENCE.nom} caractères au maximum).`
  return null
}
export const TEXTE_NOM_DEJA_PRIS = 'Ce nom existe déjà. Choisis un autre nom.'
/** Le serveur refuse le renommage parce qu'une AUTRE référence porte déjà ce nom (code stable « nom_deja_pris »). */
export const estNomDejaPris = (e) => typeof e === 'object' && e !== null && (e).code === 'nom_deja_pris'
/** Corps de `dissocier_rapprochement` (migration 031) : l'article seul ; jamais d'identité (elle vient de la connexion). */
export const corpsDissociation = (articleFournisseurId) => ({ article_fournisseur_id: articleFournisseurId })

// ------------------------------------------------------------------ liste affichée

export const SANS_FOURNISSEUR = 'Fournisseur inconnu'

export function construireListe(articles, rapprochements, references, stats,
  refusees = []) {
  const parArticle = new Map(rapprochements.map((r) => [r.article_fournisseur_id, r]))
  // Un rapprochement relie AU MOINS DEUX articles (décision du 24/11/2026) : une suggestion non validée dont la référence n'a pas
  // d'autre article rapproché n'est pas une suggestion (ancienne « copie 1 pour 1 » de l'IA) : l'article redevient « À rapprocher ».
  // Un rapprochement VALIDÉ ne bouge jamais, même seul pour sa référence.
  const nbParReference = new Map()
  for (const r of rapprochements) nbParReference.set(r.article_reference_id, (nbParReference.get(r.article_reference_id) ?? 0) + 1)
  const refusParArticle = new Map(refusees.map((s) => [s.article_fournisseur_id, s]))
  const parId = new Map(references.map((r) => [r.id, r]))
  return articles.map((a) => {
    const brut = parArticle.get(a.id) ?? null
    const r = brut && !brut.valide_le && (nbParReference.get(brut.article_reference_id) ?? 0) < 2 ? null : brut
    const s = refusParArticle.get(a.id) ?? null
    const etat = etatArticle(r, s)
    // Le refus ne compte que si l'article n'a aucun rapprochement (un rapprochement validé le retire en base ; une suggestion passe avant).
    const refus = etat === 'refusee' && s ? { ...s, coefficient: s.coefficient === null || s.coefficient === undefined ? null : Number(s.coefficient) } : null
    return {
      article: a,
      fournisseur: a.fournisseurs?.nom?.trim() || SANS_FOURNISSEUR,
      etat,
      rapprochement: r ? { ...r, coefficient: Number(r.coefficient) } : null,
      reference: r ? parId.get(r.article_reference_id) ?? null : null,
      refus,
      referenceRefusee: refus?.article_reference_id ? parId.get(refus.article_reference_id) ?? null : null,
      stats: stats.get(a.id) ?? STATS_VIDES,
    }
  })
}

export const CRITERES_ARTICLES_VIDES = { recherche: '', etats: [], fournisseurs: [] }
export const nombreFiltresArticles = (c) => c.etats.length + c.fournisseurs.length

/** Filtres combinés (« ou » dans un groupe, « et » entre groupes ; rien de coché = tout) et recherche sans accents ni casse, mot par mot. Un espace au début de la saisie force le premier mot à commencer un mot du texte, un espace à la fin force le dernier mot à finir un mot du texte (les deux = mot entier) ; la ponctuation sépare les mots. */
export function filtrerArticles(liste, c) {
  const mots = normaliser(c.recherche).split(/\s+/).filter(Boolean)
  const debut = /^\s/.test(c.recherche) && mots.length > 0
  const fin = /\s$/.test(c.recherche) && mots.length > 0
  const bornes = debut || fin
  return liste.filter((x) => {
    if (c.etats.length && !c.etats.includes(x.etat)) return false
    if (c.fournisseurs.length && !c.fournisseurs.includes(x.fournisseur)) return false
    if (!mots.length) return true
    const texte = normaliser(`${x.fournisseur} ${x.article.designation} ${x.article.reference ?? ''} ${x.article.unite ?? ''} ${x.reference?.nom ?? ''} ${x.referenceRefusee?.nom ?? ''}`)
    if (!bornes) return mots.every((m) => texte.includes(m))
    const mn = ` ${normaliserNom(texte)} `
    return mots.every((m, i) => {
      const n = normaliserNom(m)
      if (!n) return true
      return mn.includes(`${debut && i === 0 ? ' ' : ''}${n}${fin && i === mots.length - 1 ? ' ' : ''}`)
    })
  })
}
export const fournisseursDe = (liste) =>
  [...new Set(liste.map((x) => x.fournisseur))].sort((a, b) => normaliser(a).localeCompare(normaliser(b), 'fr'))

export function pastillesArticles(c) {
  return [
    ...c.etats.map((e) => ({ cle: 'etats', valeur: e, libelle: libelleEtatFiltre(e) })),
    ...c.fournisseurs.map((f) => ({ cle: 'fournisseurs', valeur: f, libelle: f })),
]
}
export function retirerPastille(c, p) {
  return p.cle === 'etats' ? { ...c, etats: c.etats.filter((e) => e !== p.valeur) } : { ...c, fournisseurs: c.fournisseurs.filter((f) => f !== p.valeur) }
}

export const CRITERES_TRI_ARTICLES = [
  { id: 'fournisseur', libelle: 'Fournisseur', sens: 'asc' },
  { id: 'designation', libelle: 'Désignation', sens: 'asc' },
  { id: 'lignes', libelle: 'Nombre de lignes', sens: 'desc' },
  { id: 'prix', libelle: 'Dernier prix', sens: 'desc' },
]
/** Liste unique de tous les articles (décision du 24/11/2026) : plus de tri « État » dans le menu ; l'ordre de départ est alphabétique. Le critère 'etat' reste accepté par trierArticles (tests). */
export const TRI_ARTICLES_DEFAUT = { critere: 'designation', sens: 'asc' }
const RANG_ETAT = { valide: 0, a_rapprocher: 1, suggere: 2, refusee: 3 }

/** Tri. Par défaut « Validé » (demande du 23/11/2026 : voir d'abord ce qui est déjà rapproché) puis « À rapprocher » puis « Suggéré » puis « Refusée » ; à égalité : fournisseur puis désignation. Un prix absent est toujours en dernier. */
export function trierArticles(liste, tri) {
  const s = tri.sens === 'asc' ? 1 : -1
  const texte = (a, b) => normaliser(a).localeCompare(normaliser(b), 'fr')
  const departage = (a, b) => texte(a.fournisseur, b.fournisseur) || texte(a.article.designation, b.article.designation) || a.article.id.localeCompare(b.article.id)
  return [...liste].sort((a, b) => {
    switch (tri.critere) {
      case 'etat': return s * (RANG_ETAT[a.etat] - RANG_ETAT[b.etat]) || departage(a, b)
      case 'fournisseur': return s * texte(a.fournisseur, b.fournisseur) || texte(a.article.designation, b.article.designation)
      case 'designation': return s * texte(a.article.designation, b.article.designation) || texte(a.fournisseur, b.fournisseur)
      case 'lignes': return s * (a.stats.nbLignes - b.stats.nbLignes) || departage(a, b)
      case 'prix': {
        const pa = a.stats.dernierPrix, pb = b.stats.dernierPrix
        if (pa === null && pb === null) return departage(a, b)
        if (pa === null) return 1
        if (pb === null) return -1
        return s * (pa - pb) || departage(a, b)
      }
    }
  })
}

/** Compteur sous le titre : « 233 articles · 71 à rapprocher · 122 suggestions IA à valider · 40 rapprochés » (+ « · 3 refusés ») : les nombres viennent de la liste et s'additionnent. */
export function texteCompteur(liste) {
  const n = liste.length
  const k = (e) => liste.filter((x) => x.etat === e).length
  const reste = k('a_rapprocher'), suggeres = k('suggere'), rapproches = k('valide'), refuses = k('refusee')
  return `${n} article${n > 1 ? 's' : ''} · ${reste} à rapprocher${suggeres > 0 ? ` · ${suggeres} suggestion${suggeres > 1 ? 's' : ''} IA à valider` : ''}${rapproches > 0 ? ` · ${rapproches} rapproché${rapproches > 1 ? 's' : ''}` : ''}${refuses > 0 ? ` · ${refuses} refusé${refuses > 1 ? 's' : ''}` : ''}`
}
/** Liste filtrée vide : « Aucune suggestion refusée » quand on ne regarde que les refusées (sans recherche), sinon la phrase habituelle. */
export const texteAucunResultat = (c) =>
  c.etats.length === 1 && c.etats[0] === 'refusee' && !c.recherche.trim() ? TEXTE_AUCUNE_REFUSEE : 'Aucun article ne correspond à ta recherche ou à tes filtres.'

// ------------------------------------------------------------------ vue « une ligne par association » (filtre « Rapprochés » seul, 24/11/2026)

/** La liste devient « une ligne par association » seulement si le filtre État vaut EXACTEMENT « Rapprochés » ; tout autre filtre garde une ligne par article. */
export const vueAssociationsActive = (c) => c.etats.length === 1 && c.etats[0] === 'valide'

/** Une association (un article interne) et tous les articles de fournisseurs qui y sont rapprochés (mêmes membres que la fenêtre « Association »). */

/** Regroupe des articles par article interne (même `article_reference_id`). Les membres sont ceux de `liste` qui ont un rapprochement et une référence connue. */
export function regrouperParAssociation(liste) {
  const parReference = new Map()
  for (const x of liste) {
    if (!x.rapprochement || !x.reference) continue
    const g = parReference.get(x.reference.id)
    if (g) g.push(x); else parReference.set(x.reference.id, [x])
  }
  return [...parReference.entries()].map(([referenceId, articles]) => {
    const prix = articles.map((x) => prixRamene(x.stats.dernierPrix, x.rapprochement?.coefficient ?? null)).filter((p) => p !== null)
    return {
      referenceId,
      nom: (articles[0].reference).nom,
      references: [...new Set(articles.map((x) => x.article.reference?.trim() ?? '').filter(Boolean))],
      fournisseurs: [...new Set(articles.map((x) => x.fournisseur))].sort((a, b) => normaliser(a).localeCompare(normaliser(b), 'fr')),
      prixMin: prix.length ? Math.min(...prix) : null,
      prixMax: prix.length ? Math.max(...prix) : null,
      nb: articles.length,
      articles,
    }
  })
}

/**
 * Lignes de la vue « une ligne par association » : une association s'affiche si AU MOINS UN de ses articles passe la recherche et les filtres
 * (`filtrerArticles`, qui garde seulement les articles « Rapprochés ») ; la ligne montre ensuite TOUS ses articles. Triée par le même menu que la liste.
 */
export function lignesAssociations(liste, c, tri) {
  const retenues = new Set(filtrerArticles(liste, c).filter((x) => x.etat === 'valide' && x.reference).map((x) => (x.reference).id))
  const membres = liste.filter((x) => x.reference && retenues.has(x.reference.id))
  const s = tri.sens === 'asc' ? 1 : -1
  const texte = (a, b) => normaliser(a).localeCompare(normaliser(b), 'fr')
  const departage = (a, b) => texte(a.nom, b.nom) || a.referenceId.localeCompare(b.referenceId)
  const lignes = (l) => l.articles.reduce((n, x) => n + x.stats.nbLignes, 0)
  return regrouperParAssociation(membres).sort((a, b) => {
    switch (tri.critere) {
      case 'fournisseur': return s * texte(a.fournisseurs[0] ?? '', b.fournisseurs[0] ?? '') || departage(a, b)
      case 'lignes': return s * (lignes(a) - lignes(b)) || departage(a, b)
      case 'prix': {
        if (a.prixMin === null && b.prixMin === null) return departage(a, b)
        if (a.prixMin === null) return 1
        if (b.prixMin === null) return -1
        return s * (a.prixMin - b.prixMin) || departage(a, b)
      }
      default: return s * texte(a.nom, b.nom) || a.referenceId.localeCompare(b.referenceId)
    }
  })
}

/** Colonne « Prix HT » : « 8,10 € – 8,74 € » (du moins cher au plus cher), un seul montant si les prix sont égaux, « — » sans prix. */
export function textePrixAssociation(l) {
  if (l.prixMin === null || l.prixMax === null) return '—'
  const bas = eurosPrix(l.prixMin), haut = eurosPrix(l.prixMax)
  return bas === haut ? bas : `${bas} – ${haut}`
}
/** Sous le nom : « réf. M031 · BAR » (rien si aucun article n'a de référence). */
export const texteReferencesAssociation = (l) => (l.references.length ? `réf. ${l.references.join(' · ')}` : '')
/** Pastille verte de la ligne. */
export const textePastilleAssociation = (l) => `Groupe · ${l.nb}`

// ------------------------------------------------------------------ vue groupée (filtre « Suggéré par l’IA » seul)
// Décision du 23/11/2026 : comparer les prix de plusieurs fournisseurs pour une même référence.
// Écart à la base commune (le tableau devient des cartes sur ce filtre) : voir docs/ecart-vue-groupee-articles.md.

/** La vue en cartes de groupe ne s'affiche que si le filtre État vaut SEULEMENT « Suggéré par l’IA ». */
export const vueGroupeeActive = (c) => c.etats.length === 1 && c.etats[0] === 'suggere'

/** Un groupe : notre article de référence et les articles de fournisseurs (suggestions non validées) qui pointent vers lui. */

/** Une ligne peut entrer dans un groupe : suggestion non validée dont la référence est connue. */
export const estGroupable = (x, etat) => x.etat === etat && !!x.rapprochement && !!x.reference
export const estSuggestionGroupable = (x) => estGroupable(x, 'suggere')

/** Cartes des rapprochements VALIDÉS (demande du 23/11/2026) : quand le filtre État est vide ou contient « Validé », au-dessus du tableau. */
export const vueValidesActive = (c) => c.etats.length === 0 || c.etats.includes('valide')

/**
 * Regroupe les suggestions par article de référence (même `article_reference_id` = même groupe).
 * Un groupe a au moins DEUX lignes ; une ligne seule pour sa référence (ou qui n'est pas une suggestion) va dans `seuls`.
 * Groupes triés par nom de référence (sans accents ni casse, puis identifiant : ordre stable) ; dans un groupe et dans `seuls`, l'ordre reçu est gardé.
 */
export function grouperSuggestions(liste, etat = 'suggere') {
  const parReference = new Map()
  for (const x of liste) {
    if (!estGroupable(x, etat)) continue
    const ref = x.reference
    const g = parReference.get(ref.id)
    if (g) g.lignes.push(x); else parReference.set(ref.id, { reference: ref, lignes: [x] })
  }
  const groupes = [...parReference.values()].filter((g) => g.lignes.length > 1)
    .sort((a, b) => normaliser(a.reference.nom).localeCompare(normaliser(b.reference.nom), 'fr') || a.reference.id.localeCompare(b.reference.id))
  const groupees = new Set(groupes.flatMap((g) => g.lignes.map((x) => x.article.id)))
  return { groupes, seuls: liste.filter((x) => !groupees.has(x.article.id)) }
}

/** Arrondi au centime (affichage seulement : aucune comparaison ne se fait sur un prix arrondi). */
export const arrondirCentime = (n) => Math.round(n * 100) / 100
export const pourcentFr = (n) => `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} %`
/** Décimales d'affichage d'un prix : 2 à partir de 1 €, jusqu'à 4 en dessous (0,0925 € le mètre ne doit pas devenir « 0,09 € »). */
export const decimalesPrix = (n) => (n !== null && Number.isFinite(n) && Math.abs(n) < 1 ? 4 : 2)
/** Prix en euros avec au plus `decimales` décimales (toujours au moins 2). On n'arrondit QU'ICI, à l'affichage. */
export const eurosPrix = (n, decimales = decimalesPrix(n)) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: decimales })
/** Écart en euros : mêmes décimales que les prix du groupe ; un écart qui s'écrirait « 0,00 € » est écrit avec 4 décimales. */
const eurosEcart = (e, decimales) => eurosPrix(e, decimales === 2 && e < 0.005 ? 4 : decimales)
/** En dessous de cet écart (en %), deux prix sont dits égaux : il s'écrirait « 0,0 % ». Sert aussi à ignorer les poussières de calcul (96 × 0,02). */
export const SEUIL_EGALITE_POURCENT = 0.05

/**
 * Compare des prix ramenés (calculés, jamais inventés), SANS les arrondir : l'écart en % se calcule sur les vrais prix (0,0149 et 0,0151 : 1,3 %, pas 100 %).
 * Il faut au moins DEUX prix comparables pour désigner un moins cher. Un prix absent, nul ou négatif reste hors comparaison.
 */
export function comparerPrix(prixRamenes) {
  const prix = prixRamenes.map((p) => (p === null || p === undefined || !Number.isFinite(p) ? null : p))
  const comparable = (p) => p !== null && p > 0
  const hors = (p) => ({ prix: p, aVerifier: p !== null && p <= 0, moinsCher: false, ecartEuros: null, ecartPourcent: null })
  const connus = prix.filter(comparable)
  const min = connus.length ? Math.min(...connus) : null, max = connus.length ? Math.max(...connus) : null
  const decimales = decimalesPrix(min)
  if (connus.length < 2 || min === null || max === null) return { lignes: prix.map(hors), nbCompares: connus.length, min, max, tousEgaux: false, decimales }
  const pourcent = (p) => ((p - min) / min) * 100
  return {
    nbCompares: connus.length, min, max, decimales, tousEgaux: pourcent(max) < SEUIL_EGALITE_POURCENT,
    lignes: prix.map((p) => {
      if (!comparable(p)) return hors(p)
      const egal = pourcent(p) < SEUIL_EGALITE_POURCENT
      return { prix: p, aVerifier: false, moinsCher: egal, ecartEuros: egal ? 0 : p - min, ecartPourcent: egal ? 0 : pourcent(p) }
    }),
  }
}

/** Pastille d'écart d'une ligne : « Le moins cher », « + 0,41 € (+ 4,0 %) », ou rien (ligne non comparée). `decimales` : celles de la comparaison. */
export function texteEcart(l, decimales = 2) {
  if (l.ecartEuros === null) return null
  if (l.moinsCher) return 'Le moins cher'
  return `+ ${eurosEcart(l.ecartEuros, decimales)}${l.ecartPourcent === null ? '' : ` (+ ${pourcentFr(l.ecartPourcent)})`}`
}
export const TEXTE_PRIX_A_VERIFIER = 'prix à vérifier : pas comparé'

/** Nom d'une ligne dans une phrase : « Fournisseur (réf. X) ». */
export const nomLigneGroupe = (x) => x.fournisseur + (x.article.reference ? ` (réf. ${x.article.reference})` : '')

/** Morceau de phrase ; `fort` = à mettre en valeur (gras) à l'écran. */

export const texteMorceaux = (m) => m.map((x) => x.t).join('')

/** Phrase de comparaison d'un groupe (`noms[i]` et `c.lignes[i]` vont ensemble). Dit aussi quand rien ne peut être comparé. */
export function phraseComparaison(noms, c, uniteReference) {
  const par = uniteReference.trim() ? ` par ${uniteReference.trim()}` : ''
  const sansPrix = c.lignes.filter((l) => l.prix === null).length
  const aVerifier = c.lignes.filter((l) => l.aVerifier).length
  const queue = []
  if (sansPrix > 0 && c.nbCompares > 0) queue.push({ t: ` ${sansPrix} ligne${sansPrix > 1 ? 's' : ''} sans prix connu : pas de comparaison pour ${sansPrix > 1 ? 'elles' : 'elle'}.` })
  if (aVerifier > 0) queue.push({ t: ` ${aVerifier} ligne${aVerifier > 1 ? 's' : ''} avec un prix à vérifier (zéro ou négatif) : pas de comparaison pour ${aVerifier > 1 ? 'elles' : 'elle'}.` })
  if (c.nbCompares === 0 || c.min === null || c.max === null) {
    return aVerifier > 0 ? [{ t: 'Aucun prix comparable pour l’instant : rien à comparer.' }, ...queue] : [{ t: 'Aucun prix connu pour l’instant (aucune ligne de facture acceptée) : rien à comparer.' }]
  }
  const prix = (n) => eurosPrix(n, c.decimales)
  if (c.nbCompares === 1) return [{ t: 'Un seul prix connu : ' }, { t: prix(c.min), fort: true }, { t: `${par}. Rien à comparer pour l’instant.` }, ...queue]
  if (c.tousEgaux) return [{ t: 'Même prix ramené partout : ' }, { t: prix(c.min), fort: true }, { t: `${par}.` }, ...queue]
  const gagnants = noms.filter((_, i) => c.lignes[i]?.moinsCher)
  const ecart = c.max - c.min
  return [
    { t: gagnants.length > 1 ? 'Les moins chers : ' : 'Le moins cher : ' }, { t: gagnants.join(' et '), fort: true }, { t: ', à ' }, { t: prix(c.min), fort: true },
    { t: `${par}. Écart avec le plus cher : ` }, { t: eurosEcart(ecart, c.decimales), fort: true }, { t: ` (${pourcentFr((ecart / c.min) * 100)}).` }, ...queue,
]
}

/** Prix ramené d'une ligne avec SON coefficient (chaque ligne garde le sien). */
export const prixRameneLigne = (x) => prixRamene(x.stats.dernierPrix, x.rapprochement ? x.rapprochement.coefficient : null)
export const comparerGroupe = (g) => comparerPrix(g.lignes.map(prixRameneLigne))
/** Calcul écrit d'une ligne : « 96,00 € / couronne × 0,02 » ; null si le prix n'est pas connu. */
export function texteCalculLigne(x) {
  if (x.stats.dernierPrix === null || !x.rapprochement) return null
  return `${eurosPrix(x.stats.dernierPrix)}${x.article.unite?.trim() ? ` / ${x.article.unite.trim()}` : ''} × ${coefficientFr(x.rapprochement.coefficient)}`
}
/** Texte sous le nom de la référence d'une carte. */
export const texteTeteGroupe = (g) => `unité de référence : ${g.reference.unite_reference} · ${g.lignes.length} articles de fournisseurs`
/** Texte sous le nom d'un groupe VALIDÉ : « 2 fournisseurs », ou « 1 fournisseur · 2 articles » quand un seul fournisseur est dans le groupe. */
export function texteFournisseursGroupe(g) {
  const nf = new Set(g.lignes.map((x) => x.fournisseur)).size
  const f = `${nf} fournisseur${nf > 1 ? 's' : ''}`
  return nf === g.lignes.length ? f : `${f} · ${g.lignes.length} articles`
}
/** Phrase au-dessus des cartes de groupes validés : « 1 groupe déjà rapproché, 2 articles. » */
export function texteCompteurValides(v) {
  const dans = v.groupes.reduce((s, g) => s + g.lignes.length, 0)
  return `${v.groupes.length} groupe${v.groupes.length > 1 ? 's' : ''} déjà rapproché${v.groupes.length > 1 ? 's' : ''}, ${dans} articles de fournisseurs.`
}
/** Phrase sous la barre quand la vue groupée est affichée : « 9 suggestions affichées, dont 7 dans 3 groupes. » */
export function texteCompteurGroupes(v) {
  const dans = v.groupes.reduce((s, g) => s + g.lignes.length, 0)
  const n = dans + v.seuls.length
  const tete = `${n} suggestion${n > 1 ? 's' : ''} affichée${n > 1 ? 's' : ''}`
  return v.groupes.length === 0 ? `${tete}.` : `${tete}, dont ${dans} dans ${v.groupes.length} groupe${v.groupes.length > 1 ? 's' : ''}.`
}
export const TEXTE_AIDE_GROUPES = 'Une suggestion de l’IA est toujours un groupe d’au moins deux articles qui sont le même produit : tu compares leurs prix, puis tu valides ou tu refuses le groupe en une fois. Un article sans jumeau n’est pas suggéré.'
/** Titre de la liste qui suit les cartes : suggestions dont les autres articles sont déjà validés (ou masqués par la recherche ou un filtre). */
export const TITRE_SUGGESTIONS_SANS_CARTE = 'Suggestions qui rejoignent un groupe déjà validé'

// ---- fenêtre « Valider le groupe »

/** Ce que la personne a saisi pour une ligne : gardée dans le groupe ou sortie, et le texte du coefficient. */

export const saisiesInitiales = (lignes) =>
  Object.fromEntries(lignes.map((x) => [x.article.id, { garde: true, coefficient: x.rapprochement ? coefficientFr(x.rapprochement.coefficient) : '' }]))

export const TEXTE_LIGNE_SORTIE = 'Sortie du groupe : cette ligne ne sera pas validée. Elle reste « Suggéré par l’IA », seule, et tu la vérifieras à part.'
export const TEXTE_LIGNE_CHANGEE = 'Cette ligne a changé entre-temps (elle n’est plus une suggestion pour cet article) : elle n’est pas touchée.'

/**
 * État de la fenêtre « Valider le groupe », recalculé à chaque frappe : coefficient vérifié comme dans la fenêtre « Rapprocher » (verifierCoefficient),
 * prix ramené par ligne, comparaison entre les lignes GARDÉES seulement. `referenceId` : la référence du groupe ; `validees` : lignes déjà validées ici.
 */
export function etatFenetreGroupe(lignes, saisies, referenceId, validees = []) {
  const brut = lignes.map((x) => {
    const id = x.article.id
    const validee = validees.includes(id)
    const changee = !validee && !(estSuggestionGroupable(x) && x.rapprochement?.article_reference_id === referenceId)
    const s = saisies[id] ?? { garde: true, coefficient: '' }
    const garde = s.garde && !validee && !changee
    const v = verifierCoefficient(s.coefficient)
    const coefficient = v.valeur ?? null
    return { id, garde, changee, validee, coefficient, erreur: garde ? v.erreur ?? null : null, prixRamene: prixRamene(x.stats.dernierPrix, coefficient) }
  })
  const gardees = brut.filter((l) => l.garde)
  const comparaison = comparerPrix(gardees.map((l) => l.prixRamene))
  const lignesEtat = brut.map((l) => ({ ...l, compare: l.garde ? comparaison.lignes[gardees.indexOf(l)] : null }))
  const n = gardees.length
  return {
    lignes: lignesEtat, comparaison,
    aValider: gardees.filter((l) => l.coefficient !== null && !l.erreur).map((l) => ({ id: l.id, coefficient: l.coefficient })),
    bloque: n === 0 || gardees.some((l) => !!l.erreur),
    libelleBouton: n > 1 ? `Valider les ${n} lignes` : n === 1 ? 'Valider la ligne' : 'Valider',
  }
}
/** Résumé sous les lignes de la fenêtre. */
export function phraseResumeFenetre(noms, e, uniteReference) {
  const gardees = e.lignes.map((l, i) => ({ l, nom: noms[i] })).filter((x) => x.l.garde)
  if (gardees.length === 0) return [{ t: 'Aucune ligne gardée : rien ne sera validé.' }]
  if (gardees.some((x) => !!x.l.erreur)) return [{ t: 'Corrige le coefficient signalé pour voir la comparaison.' }]
  if (gardees.length === 1) {
    const p = gardees[0].l.prixRamene
    return p === null ? [{ t: 'Une seule ligne gardée : rien à comparer.' }]
      : [{ t: 'Une seule ligne gardée : ' }, { t: eurosPrix(p), fort: true }, { t: ` HT${uniteReference.trim() ? ` par ${uniteReference.trim()}` : ''}.` }]
  }
  return phraseComparaison(gardees.map((x) => x.nom), e.comparaison, uniteReference)
}

// ---- le groupe a-t-il changé pendant que la personne le regardait ? (un collègue ou l'IA a pu modifier une ligne)
// Le serveur remplace un rapprochement existant sans prévenir (valider_rapprochement) : c'est donc l'appli qui relit la liste
// à l'ouverture de la fenêtre et juste avant l'envoi, et qui n'envoie RIEN si une ligne n'est plus celle que la personne a vue.

/** Ce que la personne a vu d'une ligne : est-ce une suggestion de l'IA non validée, vers quelle référence, avec quel coefficient. */

export const signatureLigne = (x) => ({
  suggestion: estSuggestionGroupable(x), referenceId: x.rapprochement?.article_reference_id ?? null,
  coefficient: x.rapprochement ? Number(x.rapprochement.coefficient) : null, designation: x.article.designation,
})
export const signaturesGroupe = (lignes) => Object.fromEntries(lignes.map((x) => [x.article.id, signatureLigne(x)]))

/**
 * Compare ce que la personne a vu (`vues`) à la liste qui vient d'être relue (`fraiches`), pour les lignes `ids` qu'elle veut envoyer.
 * Une ligne est « modifiée » si elle a disparu, n'est plus une suggestion de l'IA (validée ou refusée entre-temps),
 * pointe vers une autre référence, ou a un autre coefficient. Une ligne jamais vue est modifiée aussi (on n'envoie pas à l'aveugle).
 */
export function lignesModifiees(ids, vues, fraiches) {
  const parId = new Map(fraiches.map((x) => [x.article.id, x]))
  const res = []
  for (const id of ids) {
    const vue = vues[id], x = parId.get(id)
    const designation = x?.article.designation ?? vue?.designation ?? 'Une ligne'
    if (!x) { res.push({ id, designation, raison: 'disparue' }); continue }
    const s = signatureLigne(x)
    if (!s.suggestion || !vue || !vue.suggestion) res.push({ id, designation, raison: 'plus_suggestion' })
    else if (s.referenceId !== vue.referenceId) res.push({ id, designation, raison: 'reference' })
    else if (s.coefficient !== vue.coefficient) res.push({ id, designation, raison: 'coefficient', coefficientAvant: vue.coefficient, coefficientApres: s.coefficient })
  }
  return res
}
/** Décision avant l'envoi d'un groupe : si UNE ligne a été modifiée entre-temps, on n'envoie rien (la personne relit d'abord). */
export function deciderEnvoiGroupe(aEnvoyer, vues, fraiches) {
  const modifiees = lignesModifiees(aEnvoyer.map((l) => l.id), vues, fraiches)
  return { envoyer: modifiees.length > 0 ? [] : aEnvoyer, modifiees }
}
const RAISON_MODIFICATION = (m) => {
  switch (m.raison) {
    case 'disparue': return 'elle n’est plus dans la liste'
    case 'plus_suggestion': return 'elle n’est plus une suggestion de l’IA'
    case 'reference': return 'elle pointe vers un autre article de référence'
    case 'coefficient': return `son coefficient est passé de ${m.coefficientAvant === null || m.coefficientAvant === undefined ? '—' : coefficientFr(m.coefficientAvant)} à ${m.coefficientApres === null || m.coefficientApres === undefined ? '—' : coefficientFr(m.coefficientApres)}`
  }
}
/** Message quand rien n'est envoyé parce que le groupe a changé. `action` : ce que la personne voulait faire. */
export function messageLignesModifiees(m, action) {
  if (m.length === 0) return null
  const detail = m.map((x) => `« ${x.designation} » a été modifiée par quelqu’un d’autre (${RAISON_MODIFICATION(x)})`).join(' ; ')
  return `${detail} : ${m.length > 1 ? 'relis-les' : 'relis-la'} avant de ${action}. Rien n’a été ${action === 'valider' ? 'validé' : 'refusé'}.`
}
export const TEXTE_RELECTURE_GROUPE_IMPOSSIBLE = 'La liste n’a pas pu être relue : rien n’a été envoyé. Vérifie ta connexion, puis réessaie.'

// ---- actions sur plusieurs lignes (une action serveur par article : plusieurs appels successifs)

/**
 * Exécute `action` pour chaque élément, L'UN APRÈS L'AUTRE. Une erreur arrête la série (les suivants restent `nonTentes`),
 * sauf si `continuer(erreur)` dit de passer au suivant (ligne changée entre-temps, ou annulation : on essaie tout).
 */
export async function executerEnSerie(elements, action, continuer = () => false) {
  const res = { faits: [], echecs: [], nonTentes: [] }
  for (let i = 0; i < elements.length; i++) {
    try { await action(elements[i]); res.faits.push(elements[i]) } catch (erreur) {
      res.echecs.push({ element: elements[i], erreur })
      if (!continuer(erreur)) { res.nonTentes = elements.slice(i + 1); break }
    }
  }
  return res
}
/** Vrai pour une erreur du serveur qui dit « la liste a changé » (voir CODES_A_RELIRE) ; `code` est lu sans dépendre de js/os/actions-metier.js. */
export const erreurEtatChange = (e) => {
  const code = e && typeof e === 'object' ? (e).code : null
  return typeof code === 'string' && CODES_A_RELIRE.includes(code)
}
/** Raison d'une erreur, sans son point final (pour la mettre entre parenthèses). */
const raisonCourte = (e) => messageErreur(e).replace(/\s*\.$/, '')
const accord = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
/** Bandeau d'annulation : « Suggestion refusée. » pour une, « 3 suggestions refusées. » pour un groupe (UN seul bandeau). */
export const texteRefusAnnulable = (n) => (n > 1 ? `${n} suggestions refusées.` : TEXTE_REFUS_ANNULABLE)
export const TEXTE_RETROUVER_REFUSEES = 'Tu retrouves les suggestions refusées avec le filtre « Refusée » et le bouton « Reprendre cette suggestion ».'

/** Message quand le refus d'un groupe ne va pas au bout : ce qui est fait, ce qui reste. null = tout est fait. */
export function messageRefusGroupe(r) {
  if (r.echecs.length === 0) return null
  const total = r.faits.length + r.echecs.length + r.nonTentes.length
  const changees = r.echecs.filter((x) => erreurEtatChange(x.erreur)).length
  const panne = r.echecs.find((x) => !erreurEtatChange(x.erreur))
  const reste = total - r.faits.length - changees
  const fait = r.faits.length === 0 ? `aucune des ${accord(total, 'suggestion')} n’est refusée` : `${r.faits.length} sur ${accord(total, 'suggestion')} ${r.faits.length > 1 ? 'sont refusées' : 'est refusée'}`
  const morceaux = [`Le groupe n’a pas été refusé en entier : ${fait}.`]
  if (changees > 0) morceaux.push(`${changees > 1 ? `${changees} avaient` : '1 avait'} changé entre-temps : pas touchée${changees > 1 ? 's' : ''}.`)
  if (panne) morceaux.push(`${reste > 1 ? `${reste} restent` : '1 reste'} à refuser (${raisonCourte(panne.erreur)}) : réessaie avec « ${reste > 1 ? 'Refuser le groupe' : 'Refuser'} ».`)
  if (r.faits.length > 0) morceaux.push(TEXTE_RETROUVER_REFUSEES)
  return morceaux.join(' ')
}
/** Message quand « Annuler » (bandeau) ne remet pas toutes les suggestions. null = tout est revenu. */
export function messageAnnulationGroupe(r) {
  if (r.echecs.length === 0) return null
  const total = r.faits.length + r.echecs.length + r.nonTentes.length
  const reste = total - r.faits.length
  const raison = raisonCourte(r.echecs[0].erreur)
  if (total === 1) return `Le refus n’a pas pu être annulé : ${messageErreur(r.echecs[0].erreur)}`
  return `Le refus n’a pas été annulé en entier : ${r.faits.length} sur ${accord(total, 'suggestion')} ${r.faits.length > 1 ? 'sont revenues' : r.faits.length === 1 ? 'est revenue' : 'revenue'}, ${reste > 1 ? `${reste} sont encore refusées` : '1 est encore refusée'} (${raison}).`
}
/** Dissocier un rapprochement validé (fenêtre « Corriger le rapprochement »). */
export const TEXTE_CONFIRMATION_DISSOCIATION = 'Dissocier ces deux articles ? Les prix de l’historique de cet article ne seront plus ramenés à l’article de référence. Il redeviendra à rapprocher.'
export const TEXTE_DISSOCIE_ANNULABLE = 'Dissocié.'
export const MESSAGE_DISSOCIATION_ANNULEE = 'Dissociation annulée : le rapprochement est revenu.'
export const messageDissociationImpossible = (e) => `La dissociation n’a pas pu être faite : ${messageErreur(e)}`
export const messageAnnulationDissociationImpossible = (e) => `La dissociation n’a pas pu être annulée : ${messageErreur(e)}`
export const TEXTE_ANNULATION_DISSOCIATION_CHANGE = 'La dissociation n’a pas été annulée : cet article a déjà un nouveau rapprochement (fait entre-temps). Vérifie-le dans la liste.'
export const messageRefusAnnule = (n) => (n > 1 ? `Refus annulé : les ${n} suggestions sont revenues.` : 'Refus annulé : la suggestion est revenue.')
/** Message quand la validation d'un groupe s'arrête en route (les lignes déjà validées le restent). null = tout est validé. */
export function messageValidationGroupe(r, designationEnEchec) {
  if (r.echecs.length === 0) return null
  const total = r.faits.length + r.echecs.length + r.nonTentes.length
  const tete = r.faits.length === 0 ? 'Rien n’a été validé.' : `${r.faits.length} ligne${r.faits.length > 1 ? 's' : ''} sur ${total} ${r.faits.length > 1 ? 'sont validées, et elles le restent' : 'est validée, et elle le reste'}.`
  const suite = r.nonTentes.length > 0 ? ` ${accord(r.nonTentes.length, 'ligne')} après elle ${r.nonTentes.length > 1 ? 'n’ont pas été envoyées' : 'n’a pas été envoyée'}.` : ''
  return `${tete} « ${designationEnEchec} » n’a pas pu être validée (${raisonCourte(r.echecs[0].erreur)}).${suite} Corrige, puis valide de nouveau.`
}
/** Nombre d'articles VALIDÉS rattachés à une référence (hors `sauf`), compté depuis les rapprochements déjà chargés par l'écran. */
export const nbValidesDeReference = (rapprochements, referenceId, sauf = []) =>
  rapprochements.filter((r) => r.valide_le && r.article_reference_id === referenceId && !sauf.includes(r.article_fournisseur_id)).length
/** Texte gris sous le champ « Article de référence » de « Corriger le rapprochement » : changer le nom renomme le groupe entier. */
export const texteRenommageGroupe = (n) =>
  `Changer ce nom renomme le groupe pour ${n > 1 ? `ses ${n} articles validés` : 'son article validé'}. L’historique des prix n’est pas touché.`
/**
 * Renommer une référence DÉJÀ validée : « invalide » (vide, sans lettre ni chiffre, trop long : bouton bloqué),
 * « identique » (nom actuel après nettoyage des espaces : rien à renommer) ou « renommer » (la casse seule compte).
 */
export function decisionRenommage(nomActuel, saisi) {
  if (verifierNomReferenceGroupe(saisi) !== null) return 'invalide'
  return nomPropre(saisi) === nomPropre(nomActuel) ? 'identique' : 'renommer'
}
export const messageReferenceRenommee = (nom) => `Renommé en « ${nomPropre(nom)} ».`
/**
 * « Corriger le rapprochement » : ce qui a vraiment changé. Le nom (renomme le groupe) et le coefficient (change les prix de l'historique de l'article)
 * sont indépendants ; la confirmation des prix ne concerne que le coefficient (comparaison numérique).
 */

export function planCorrection(nomActuel, nomSaisi, coefficientActuel, coefficientSaisi) {
  const d = decisionRenommage(nomActuel, nomSaisi)
  const erreurNom = d === 'invalide' ? verifierNomReferenceGroupe(nomSaisi) : null
  const renommer = d === 'renommer'
  const coefficient = coefficientSaisi !== null && arrondirCoefficient(coefficientSaisi) !== arrondirCoefficient(coefficientActuel)
  return { erreurNom, renommer, coefficient, rien: !erreurNom && !renommer && !coefficient }
}
/** Message final de la correction selon ce qui a changé. */
export function messageCorrectionFaite(nomRenomme, coefficient) {
  if (nomRenomme && coefficient) return `${messageReferenceRenommee(nomRenomme)} Coefficient corrigé.`
  if (nomRenomme) return messageReferenceRenommee(nomRenomme)
  return 'Rapprochement corrigé.'
}
/** Délai pendant lequel « Oui, corriger » ignore tout clic ou Entrée après l'ouverture de la confirmation : un double clic ne saute jamais la confirmation. */
export const DELAI_CONFIRMATION_MS = 400
export const confirmationPrete = (ouverteA, maintenant) => maintenant - ouverteA >= DELAI_CONFIRMATION_MS
export const messageGroupeValide = (n) => (n > 1 ? `${n} rapprochements validés.` : 'Rapprochement validé.')

// ------------------------------------------------------------------ messages

export const TEXTE_VIDE = 'Aucun article pour l’instant : ils apparaissent quand tu acceptes des factures avec leurs lignes.'
export const TEXTE_ERREUR_LECTURE = 'Impossible de charger les articles. Vérifie ta connexion, puis réessaie.'
export const TEXTE_TRONQUE = 'La liste est trop longue pour être lue en entier : seule une partie s’affiche. Préviens le support.'
export const MESSAGE_GENERIQUE = 'Une erreur est survenue, réessaie dans un instant.'
export const TEXTE_RELECTURE_REFERENCES = 'L’article de référence est enregistré, mais la liste n’a pas pu être relue. Vérifie ta connexion, puis réessaie.'

/** Message d'une erreur attrapée à l'écran : celui de l'erreur (déjà traduit par js/os/actions-metier.js : texte du serveur en 4xx, phrase générique en 5xx), sinon la phrase générique. */
export const messageErreur = (e) => (e instanceof Error && e.message.trim() ? e.message : MESSAGE_GENERIQUE)

/** Codes du serveur après lesquels la liste est relue (un autre utilisateur ou l'IA l'a changée entre-temps). */
export const CODES_A_RELIRE = ['suggestion_introuvable', 'rapprochement_deja_valide', 'article_introuvable', 'refus_introuvable', 'deja_rapproche', 'reference_introuvable', 'rapprochement_introuvable', 'rapprochement_non_valide']

/** Résultat de « Demander des suggestions à l'IA » (réponse du workflow 05). Jamais vide. */
export function phraseSuggestions(r) {
  const n = Number(r.suggestions) || 0
  const g = Number(r.groupes) || 0
  const envoyes = Math.max(Math.round(Number(r.articles_envoyes) || 0), 0)
  const i = Math.max(Math.round(Number(r.ignorees) || 0), 0)
  // « Sans jumeau » n'est vrai que si rien n'a été écarté (hors format, unité différente, refus de la base…) ; sinon on reste neutre.
  const net = i === 0 && !(Number(r.lignes_ignorees) > 0)
  const plafond = envoyes >= 400 // le catalogue est lu 400 articles à la fois : le reste réel peut être plus grand
  const pl = (k, un, plusieurs) => (k > 1 ? plusieurs : un)
  // L'IA s'est arrêtée avant la fin (limite atteinte) : les groupes complets reçus sont gardés, le reste se fait au clic suivant.
  if (r.partiel === true) {
    const reste = Math.max(Math.round(Number(r.reste) || 0), 0)
    if (g === 0) return 'L’IA s’est arrêtée avant la fin (limite atteinte) sans avoir pu proposer de groupe. Clique encore pour réessayer.'
    return `L’IA s’est arrêtée avant la fin (limite atteinte). ${g} groupe${g > 1 ? 's ont' : ' a'} été proposé${g > 1 ? 's' : ''}${reste > 0 ? `; il reste ${plafond ? 'au moins' : 'environ'} ${reste} article${reste > 1 ? 's' : ''} à traiter` : ''}. Clique encore pour continuer.`
  }
  if (n === 0 && envoyes === 1) return 'Il ne reste qu’un article à rapprocher : pas de groupe possible.'
  if (n === 0) return envoyes > 0 ? (net ? `L’IA n’a trouvé aucun groupe : aucun des ${envoyes} articles à rapprocher n’a de jumeau.` : `L’IA n’a proposé aucun groupe utilisable : une partie de sa réponse était hors format ou refusée. Les ${envoyes} articles restent à rapprocher.`) : 'Aucun nouveau groupe d’articles à rapprocher.'
  if (g === 0) return `${n} suggestion${n > 1 ? 's' : ''} IA à valider ajoutée${n > 1 ? 's' : ''}.`
  const seuls = Math.max(envoyes - n, 0)
  return `L’IA a proposé ${g} groupe${g > 1 ? 's' : ''} (${n} articles).${seuls > 0 ? (net ? ` ${seuls} article${seuls > 1 ? 's n’ont' : ' n’a'} pas de jumeau et ${pl(seuls, 'reste', 'restent')} à rapprocher.` : ` ${seuls} article${seuls > 1 ? 's restent' : ' reste'} à rapprocher (certains n’ont pas de jumeau, d’autres ont été écartés).`) : ''} Vérifie-les avant de valider.`
}

/** Ce qui s'affiche à la FIN de chaque clic (jamais rien) : le texte et s'il s'agit d'une erreur. `erreur` = ce qui a été levé, `reponse` = la réponse du workflow. */
export function resultatClic(reponse, erreur, messageParDefaut = MESSAGE_GENERIQUE) {
  if (erreur !== undefined) {
    const code = typeof erreur === 'object' && erreur !== null && 'code' in erreur ? String((erreur).code) : null
    return { texte: phraseErreurSuggestions(code) ?? `Les suggestions n’ont pas pu être demandées : ${messageParDefaut}`, erreur: true }
  }
  const r = reponse && typeof reponse === 'object' ? (reponse) : {}
  return { texte: phraseSuggestions(r), erreur: false }
}

/** Phrase claire (rien de technique) quand l'IA n'a rien pu proposer : délai dépassé ou pas de réponse. Null = autre erreur (phrase habituelle). */
export function phraseErreurSuggestions(code) {
  if (code === 'ia_delai') return 'L’IA a mis trop de temps à répondre : rien n’a été enregistré. Clique encore dans quelques minutes.'
  if (code === 'ia_indisponible') return 'L’IA n’a pas répondu : rien n’a été enregistré. Réessaie dans quelques minutes.'
  return null
}
