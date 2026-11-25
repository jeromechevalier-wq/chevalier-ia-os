// Module Articles : vue groupée, fenêtre « Valider le groupe », refus d'un groupe, lignes d'association, convertis du dépôt d'origine SANS changer les cas ni les valeurs.
import { describe, it } from 'node:test'
import { expect, vi } from './fixtures/achats/attendre.js'
import {
  comparerGroupe, comparerPrix, corpsRenommage, estNomDejaPris, memeNom, nomPropre, TEXTE_NOM_DEJA_PRIS, verifierNomReferenceGroupe, construireListe, CRITERES_ARTICLES_VIDES, deciderEnvoiGroupe, erreurEtatChange, eurosPrix, lignesModifiees, messageLignesModifiees, signaturesGroupe, etatFenetreGroupe, executerEnSerie, filtrerArticles, grouperSuggestions,
  messageAnnulationGroupe, messageGroupeValide, messageRefusAnnule, messageRefusGroupe, messageValidationGroupe, nomLigneGroupe, phraseComparaison, phraseResumeFenetre,
  saisiesInitiales, statistiquesLignes, TEXTE_REFUS_ANNULABLE, texteCalculLigne, texteCompteurGroupes, texteCompteurValides, texteFournisseursGroupe, vueValidesActive, texteEcart, texteMorceaux, texteRefusAnnulable, texteTeteGroupe, vueGroupeeActive,
} from '../js/modules/achatsarticles/logique.js'
import { ErreurAction as ErreurDecision } from '../js/os/actions-metier.js'


const propre = (s) => s.replace(/[\s  ]/g, ' ')
const art = (id, designation, fournisseur, o = {}) =>
  ({ id, fournisseur_id: 'f-' + fournisseur, reference: null, designation, unite: 'u', fournisseurs: { nom: fournisseur }, ...o })
const ref = (id, nom, unite = 'u') => ({ id, nom, unite_reference: unite, actif: true })
const rap = (af, ar, coefficient, valide = false) =>
  ({ article_fournisseur_id: af, article_reference_id: ar, coefficient, valide_le: valide ? '2026-11-23T10:00:00Z' : null, valide_par: valide ? 'd@x.fr' : null, suggere_par_ia: true })
const prix = (af, montant) =>
  ({ id: 'l-' + af, article_fournisseur_id: af, quantite: 1, montant_ht: montant, factures: { statut: 'acceptee', type_document: 'facture', date_facture: '2026-11-01', created_at: '2026-11-01T08:00:00Z' } })

const FER = ref('r-fer', 'Fer à béton HA 10'), TUBE = ref('r-tube', 'Tube multicouche Ø16', 'ml'), ENDUIT = ref('r-enduit', 'enduit de façade', 'sac'), SEULE = ref('r-seule', 'Disjoncteur 20 A')
const ARTICLES = [
  art('a1', 'Fer HA 10 barre 12 m', 'Verdon'), art('a2', 'Fer HA 10 barre 12 m', 'Verdon', { reference: 'M006' }), art('a3', 'Fer HA10', 'Chantier Plus'),
  art('t1', 'Tube Ø16 couronne 50 m', 'Durance', { unite: 'couronne' }), art('t2', 'Tube Ø16 couronne 50 m', 'Sanitaire', { unite: 'couronne' }),
  art('e1', 'Enduit gratté sac 25 kg', 'Verdon', { unite: 'sac' }), art('e2', 'Enduit sac 25 kg', 'Chantier Plus', { unite: 'sac' }),
  art('d1', 'Disjoncteur 20 A', 'Élec'), art('x1', 'Sable', 'Verdon'),
]
const RAPPROCHEMENTS = [
  rap('a1', 'r-fer', 1), rap('a2', 'r-fer', 1), rap('a3', 'r-fer', 1),
  rap('t1', 'r-tube', 0.02), rap('t2', 'r-tube', 0.02),
  rap('e1', 'r-enduit', 1), rap('e2', 'r-enduit', 1, true), // e2 déjà VALIDÉ : il ne compte pas dans un groupe de suggestions
  rap('d1', 'r-seule', 1),
]
const PRIX = [prix('a1', 10.62), prix('a2', 10.21), prix('a3', 11.34), prix('t1', 96), prix('t2', 92), prix('e1', 18.51), prix('d1', 11.4)]
const liste = (rapprochements = RAPPROCHEMENTS, lignes = PRIX) => construireListe(ARTICLES, rapprochements, [FER, TUBE, ENDUIT, SEULE], statistiquesLignes(lignes))
const ids = (l) => l.map((x) => x.article.id)

describe('vue groupée : quand elle s’affiche', () => {
  it('G1 : seulement si le filtre État vaut SEULEMENT « Suggéré par l’IA »', () => {
    expect(vueGroupeeActive({ ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] })).toBe(true)
    expect(vueGroupeeActive({ ...CRITERES_ARTICLES_VIDES, etats: ['suggere'], fournisseurs: ['Verdon'], recherche: 'fer' })).toBe(true)
    expect(vueGroupeeActive(CRITERES_ARTICLES_VIDES)).toBe(false)
    expect(vueGroupeeActive({ ...CRITERES_ARTICLES_VIDES, etats: ['suggere', 'valide'] })).toBe(false)
    expect(vueGroupeeActive({ ...CRITERES_ARTICLES_VIDES, etats: ['refusee'] })).toBe(false)
  })
})

describe('regroupement par article de référence', () => {
  it('G2 : même référence = même groupe ; une seule ligne pour sa référence = pas de carte ; un rapprochement validé ou un article sans suggestion ne se groupe pas', () => {
    const v = grouperSuggestions(liste())
    expect(v.groupes.map((g) => [g.reference.id, ids(g.lignes)])).toEqual([['r-fer', ['a1', 'a2', 'a3']], ['r-tube', ['t1', 't2']]])
    // e1 est seule suggestion pour « enduit » (e2 est validé), d1 est seul pour sa référence, x1 n'a aucune suggestion : ils restent des lignes du tableau.
    expect(ids(v.seuls)).toEqual(['e1', 'e2', 'd1', 'x1'])
  })
  it('G3 : avec le filtre « Suggéré par l’IA », chaque suggestion est soit dans un groupe, soit seule : aucune n’est perdue ni affichée deux fois', () => {
    const filtrees = filtrerArticles(liste(), { ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] })
    const v = grouperSuggestions(filtrees)
    const tous = [...v.groupes.flatMap((g) => ids(g.lignes)), ...ids(v.seuls)]
    expect([...tous].sort()).toEqual(ids(filtrees).sort())
    // d1 est seul pour sa référence : ce n'est plus une suggestion (décision du 24/11/2026), il n'apparaît pas ici ; e1 rejoint e2, déjà validé.
    expect(ids(v.seuls)).toEqual(['e1'])
    expect(texteCompteurGroupes(v)).toBe('6 suggestions affichées, dont 5 dans 2 groupes.')
  })
  it('G4 : tri stable des groupes par nom de référence (sans accents ni casse), quel que soit l’ordre des lignes reçues ; l’ordre des lignes dans un groupe est gardé', () => {
    const a = grouperSuggestions(liste())
    const b = grouperSuggestions([...liste()].reverse())
    expect(a.groupes.map((g) => g.reference.nom)).toEqual(['Fer à béton HA 10', 'Tube multicouche Ø16'])
    expect(b.groupes.map((g) => g.reference.nom)).toEqual(['Fer à béton HA 10', 'Tube multicouche Ø16'])
    expect(ids(b.groupes[0].lignes)).toEqual(['a3', 'a2', 'a1'])
    // « enduit » (minuscule) se range avant « Fer » : la casse ne compte pas. Deux références de même nom : départagées par identifiant, toujours pareil.
    const avecEnduit = grouperSuggestions(liste(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'e2' ? rap('e2', 'r-enduit', 1) : r))))
    expect(avecEnduit.groupes.map((g) => g.reference.id)).toEqual(['r-enduit', 'r-fer', 'r-tube'])
  })
  it('G5 : une ligne validée ou refusée entre-temps quitte le groupe ; un groupe tombé à une ligne redevient une ligne seule', () => {
    const sansT2 = grouperSuggestions(liste(RAPPROCHEMENTS.filter((r) => r.article_fournisseur_id !== 't2')))
    expect(sansT2.groupes.map((g) => g.reference.id)).toEqual(['r-fer'])
    expect(ids(sansT2.seuls)).toContain('t1')
    const a2Valide = grouperSuggestions(liste(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a2' ? rap('a2', 'r-fer', 1, true) : r))))
    expect(ids(a2Valide.groupes[0].lignes)).toEqual(['a1', 'a3'])
  })
})

describe('comparaison des prix ramenés (calculés, jamais inventés)', () => {
  it('G6 : le moins cher et l’écart en euros et en % ; chaque ligne garde SON coefficient', () => {
    const c = comparerGroupe(grouperSuggestions(liste()).groupes[0])
    expect(c.lignes.map((l) => l.prix)).toEqual([10.62, 10.21, 11.34])
    expect(c.lignes.map((l) => l.moinsCher)).toEqual([false, true, false])
    expect(c.lignes.map((l) => Number((l.ecartEuros).toFixed(6)))).toEqual([0.41, 0, 1.13])
    expect(c.lignes[2].ecartPourcent).toBeCloseTo(11.07, 1)
    expect(c.lignes.map((l) => texteEcart(l)).map((t) => t && propre(t))).toEqual(['+ 0,41 € (+ 4,0 %)', 'Le moins cher', '+ 1,13 € (+ 11,1 %)'])
    // Coefficients différents dans un même groupe : bidon de 5 L (× 0,2) et seau de 15 L (× 0,0667) ramenés au litre.
    const d = comparerPrix([30.39 * 0.2, 46.8 * 0.0667])
    expect(d.lignes.map((l) => propre(eurosPrix(l.prix, d.decimales)))).toEqual(['6,08 €', '3,12 €'])
    expect(d.lignes.map((l) => l.moinsCher)).toEqual([false, true])
  })
  it('G6 : coefficient différent de 1 : couronne de 50 m à 96 € × 0,02 = 1,92 € le mètre', () => {
    const g = grouperSuggestions(liste()).groupes[1]
    expect(comparerGroupe(g).lignes.map((l) => propre(eurosPrix(l.prix)))).toEqual(['1,92 €', '1,84 €'])
    expect(propre(texteCalculLigne(g.lignes[0]))).toBe('96,00 € / couronne × 0,02')
    expect(texteTeteGroupe(g)).toBe('unité de référence : ml · 2 articles de fournisseurs')
  })
  it('G7 : prix manquant = « pas de comparaison pour cette ligne » ; il faut deux prix connus pour désigner un moins cher', () => {
    const c = comparerPrix([10, null, 12])
    expect(c.lignes[1]).toEqual({ prix: null, aVerifier: false, moinsCher: false, ecartEuros: null, ecartPourcent: null })
    expect(texteEcart(c.lignes[1])).toBeNull()
    expect(c.lignes[0].moinsCher).toBe(true)
    expect(c.nbCompares).toBe(2)
    const un = comparerPrix([10, null])
    expect(un.lignes.every((l) => !l.moinsCher && l.ecartEuros === null)).toBe(true)
    expect(texteMorceaux(phraseComparaison(['A', 'B'], un, 'u'))).toMatch(/Un seul prix connu.*Rien à comparer.*1 ligne sans prix connu/)
    const aucun = comparerPrix([null, null])
    expect(aucun.nbCompares).toBe(0)
    expect(texteMorceaux(phraseComparaison(['A', 'B'], aucun, 'u'))).toMatch(/Aucun prix connu/)
    // Dans la liste : un article jamais acheté a un prix « — » (null), jamais un zéro.
    const g = grouperSuggestions(liste(RAPPROCHEMENTS, PRIX.filter((p) => p.article_fournisseur_id !== 'a3'))).groupes[0]
    expect(comparerGroupe(g).lignes[2].prix).toBeNull()
    expect(texteCalculLigne(g.lignes[2])).toBeNull()
  })
  it('G8 : égalité au centime = aucun « + 0,00 € » ; phrases de comparaison', () => {
    const egal = comparerPrix([10.204, 10.2])
    expect(egal.lignes.map((l) => l.moinsCher)).toEqual([true, true])
    expect(propre(texteMorceaux(phraseComparaison(['A', 'B'], egal, 'sac')))).toBe('Même prix ramené partout : 10,20 € par sac.')
    const g = grouperSuggestions(liste()).groupes[0]
    expect(g.lignes.map(nomLigneGroupe)).toEqual(['Verdon', 'Verdon (réf. M006)', 'Chantier Plus'])
    expect(propre(texteMorceaux(phraseComparaison(g.lignes.map(nomLigneGroupe), comparerGroupe(g), g.reference.unite_reference))))
      .toBe('Le moins cher : Verdon (réf. M006), à 10,21 € par u. Écart avec le plus cher : 1,13 € (11,1 %).')
    // Poussière de calcul (96 × 0,02 = 1,9200000000000002) : c'est le même prix que 1,92, jamais « + 0,00 € ».
    expect(comparerPrix([96 * 0.02, 1.92]).tousEgaux).toBe(true)
  })
  it('I2 : petits prix : la comparaison et l’écart en % se font sur les prix NON arrondis ; jusqu’à 4 décimales sous 1 €', () => {
    // 0,0925 et 0,0949 : au centime ce serait « 0,09 € » des deux côtés et « même prix ». L'écart réel est de 2,6 %.
    const a = comparerPrix([0.0925, 0.0949])
    expect(a.tousEgaux).toBe(false)
    expect(a.lignes.map((l) => l.moinsCher)).toEqual([true, false])
    expect(a.decimales).toBe(4)
    expect(propre(texteEcart(a.lignes[1], a.decimales))).toBe('+ 0,0024 € (+ 2,6 %)')
    expect(propre(texteMorceaux(phraseComparaison(['A', 'B'], a, 'm')))).toBe('Le moins cher : A, à 0,0925 € par m. Écart avec le plus cher : 0,0024 € (2,6 %).')
    // 0,0149 et 0,0151 : au centime ce serait 0,01 et 0,02, soit « + 100 % ». L'écart réel est de 1,3 %.
    const b = comparerPrix([0.0149, 0.0151])
    expect(b.lignes[1].ecartPourcent).toBeCloseTo(1.342, 2)
    expect(propre(texteEcart(b.lignes[1], b.decimales))).toBe('+ 0,0002 € (+ 1,3 %)')
    // Deux prix sous 0,005 € : au centime ils valaient 0 tous les deux (« même prix », division par zéro évitée de justesse).
    const c = comparerPrix([0.002, 0.004])
    expect(c.lignes.map((l) => l.moinsCher)).toEqual([true, false])
    expect(c.lignes[1].ecartPourcent).toBeCloseTo(100, 6)
    expect(propre(texteMorceaux(phraseComparaison(['A', 'B'], c, 'u')))).toBe('Le moins cher : A, à 0,002 € par u. Écart avec le plus cher : 0,002 € (100,0 %).')
    // Affichage : 2 décimales à partir de 1 €, jusqu'à 4 en dessous, toujours au moins 2.
    expect([eurosPrix(10.21), eurosPrix(0.5), eurosPrix(0.0925), eurosPrix(1.9200000000000002)].map(propre)).toEqual(['10,21 €', '0,50 €', '0,0925 €', '1,92 €'])
    // Au-dessus de 1 €, un petit écart réel ne s'écrit jamais « + 0,00 € ».
    const d = comparerPrix([1, 1.004])
    expect(propre(texteEcart(d.lignes[1], d.decimales))).toBe('+ 0,004 € (+ 0,4 %)')
  })
  it('Mineur 1 : un prix nul ou négatif sort de la comparaison (« prix à vérifier »), il n’est jamais « Le moins cher »', () => {
    const c = comparerPrix([0, 5, 6, -3])
    expect(c.lignes.map((l) => l.aVerifier)).toEqual([true, false, false, true])
    expect(c.lignes.map((l) => l.moinsCher)).toEqual([false, true, false, false])
    expect(c.lignes[0]).toMatchObject({ prix: 0, ecartEuros: null, ecartPourcent: null })
    expect(texteEcart(c.lignes[0])).toBeNull()
    expect(c.min).toBe(5)
    expect(c.nbCompares).toBe(2)
    expect(texteMorceaux(phraseComparaison(['A', 'B', 'C', 'D'], c, 'u'))).toMatch(/Le moins cher : B.*2 lignes avec un prix à vérifier \(zéro ou négatif\) : pas de comparaison pour elles\./)
    // Un seul prix comparable à côté d'un prix à 0 : aucun moins cher désigné.
    const un = comparerPrix([0, 5])
    expect(un.lignes.some((l) => l.moinsCher)).toBe(false)
    expect(texteMorceaux(phraseComparaison(['A', 'B'], comparerPrix([0, -1]), 'u'))).toMatch(/Aucun prix comparable/)
  })
})

describe('fenêtre « Valider le groupe »', () => {
  const groupe = () => grouperSuggestions(liste()).groupes[0]
  it('G9 : au départ toutes les lignes sont gardées, chacune avec son coefficient ; le bouton compte les lignes', () => {
    const g = groupe()
    const e = etatFenetreGroupe(g.lignes, saisiesInitiales(g.lignes), 'r-fer')
    expect(e.aValider).toEqual([{ id: 'a1', coefficient: 1 }, { id: 'a2', coefficient: 1 }, { id: 'a3', coefficient: 1 }])
    expect(e.bloque).toBe(false)
    expect(e.libelleBouton).toBe('Valider les 3 lignes')
    expect(e.lignes.map((l) => l.compare?.moinsCher)).toEqual([false, true, false])
  })
  it('G10 : coefficient modifiable avec les contrôles de la fenêtre « Rapprocher » (virgule, plus grand que zéro, messages français) ; prix ramené et comparaison recalculés', () => {
    const g = groupe()
    const s = { ...saisiesInitiales(g.lignes), a3: { garde: true, coefficient: '0,5' } }
    const e = etatFenetreGroupe(g.lignes, s, 'r-fer')
    expect(e.lignes[2].coefficient).toBe(0.5)
    expect(e.lignes[2].prixRamene).toBeCloseTo(5.67, 5)
    expect(e.lignes.map((l) => l.compare?.moinsCher)).toEqual([false, false, true]) // a3 devient le moins cher
    expect(e.aValider[2]).toEqual({ id: 'a3', coefficient: 0.5 })
    for (const [texte, message] of [['0', /plus grand que zéro/], ['-2', /plus grand que zéro/], ['abc', /doit être un nombre/], ['', /Indique le coefficient/]]) {
      const k = etatFenetreGroupe(g.lignes, { ...s, a3: { garde: true, coefficient: texte } }, 'r-fer')
      expect(k.lignes[2].erreur).toMatch(message)
      expect(k.bloque).toBe(true)
      expect(texteMorceaux(phraseResumeFenetre(g.lignes.map(nomLigneGroupe), k, 'u'))).toMatch(/Corrige le coefficient/)
    }
    expect(etatFenetreGroupe(g.lignes, { ...s, a3: { garde: true, coefficient: '25/35' } }, 'r-fer').lignes[2].coefficient).toBeCloseTo(0.714285714, 8)
  })
  it('G11 : sortir une ligne douteuse : elle n’est pas envoyée, son coefficient faux ne bloque rien, la comparaison se fait sans elle', () => {
    const g = groupe()
    const s = { ...saisiesInitiales(g.lignes), a2: { garde: false, coefficient: 'n’importe quoi' } }
    const e = etatFenetreGroupe(g.lignes, s, 'r-fer')
    expect(e.aValider.map((l) => l.id)).toEqual(['a1', 'a3'])
    expect(e.bloque).toBe(false)
    expect(e.libelleBouton).toBe('Valider les 2 lignes')
    expect(e.lignes[1]).toMatchObject({ garde: false, erreur: null, compare: null })
    expect(e.lignes.map((l) => l.compare?.moinsCher ?? null)).toEqual([true, null, false]) // sans a2, le moins cher est a1
    const une = etatFenetreGroupe(g.lignes, { ...s, a3: { garde: false, coefficient: '1' } }, 'r-fer')
    expect(une.libelleBouton).toBe('Valider la ligne')
    expect(propre(texteMorceaux(phraseResumeFenetre(g.lignes.map(nomLigneGroupe), une, 'u')))).toBe('Une seule ligne gardée : 10,62 € HT par u.')
    const aucune = etatFenetreGroupe(g.lignes, Object.fromEntries(g.lignes.map((x) => [x.article.id, { garde: false, coefficient: '1' }])), 'r-fer')
    expect(aucune.bloque).toBe(true)
    expect(aucune.aValider).toEqual([])
    expect(texteMorceaux(phraseResumeFenetre(g.lignes.map(nomLigneGroupe), aucune, 'u'))).toBe('Aucune ligne gardée : rien ne sera validé.')
  })
  it('G12 : une ligne validée ou refusée entre-temps (par quelqu’un d’autre) n’est jamais envoyée ; une ligne déjà validée ici non plus', () => {
    const g = groupe()
    const s = saisiesInitiales(g.lignes)
    // a2 validé entre-temps, a3 refusé entre-temps (plus de rapprochement) : la liste relue donne leur nouvel état.
    const relue = liste(RAPPROCHEMENTS.filter((r) => r.article_fournisseur_id !== 'a3').map((r) => (r.article_fournisseur_id === 'a2' ? rap('a2', 'r-fer', 1, true) : r)))
    const lignes = g.lignes.map((x) => relue.find((y) => y.article.id === x.article.id))
    const e = etatFenetreGroupe(lignes, s, 'r-fer')
    expect(e.lignes.map((l) => l.changee)).toEqual([false, true, true])
    expect(e.aValider).toEqual([{ id: 'a1', coefficient: 1 }])
    // Suggestion passée vers une AUTRE référence entre-temps : plus dans ce groupe.
    const ailleurs = liste(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a1' ? rap('a1', 'r-tube', 1) : r)))
    expect(etatFenetreGroupe(g.lignes.map((x) => ailleurs.find((y) => y.article.id === x.article.id)), s, 'r-fer').lignes[0].changee).toBe(true)
    // Validation partielle dans la fenêtre : a1 déjà validée ici, seules a2 et a3 repartent.
    const partiel = etatFenetreGroupe(g.lignes, s, 'r-fer', ['a1'])
    expect(partiel.lignes[0]).toMatchObject({ validee: true, changee: false, garde: false })
    expect(partiel.aValider.map((l) => l.id)).toEqual(['a2', 'a3'])
  })
})

describe('I1 : ne pas écraser le travail d’un collègue (liste relue avant l’envoi)', () => {
  const groupe = () => grouperSuggestions(liste()).groupes[0]
  const aValider = [{ id: 'a1', coefficient: 1 }, { id: 'a2', coefficient: 1 }, { id: 'a3', coefficient: 1 }]
  const relue = (rapprochements) => liste(rapprochements).filter((x) => ['a1', 'a2', 'a3'].includes(x.article.id))
  it('I1 : rien n’a changé depuis l’ouverture : tout est envoyé', () => {
    const d = deciderEnvoiGroupe(aValider, signaturesGroupe(groupe().lignes), relue(RAPPROCHEMENTS))
    expect(d).toEqual({ envoyer: aValider, modifiees: [] })
    expect(messageLignesModifiees(d.modifiees, 'valider')).toBeNull()
  })
  it('I1 : une ligne validée par un collègue entre-temps : RIEN n’est envoyé (son travail n’est pas écrasé) et le message dit laquelle', () => {
    const d = deciderEnvoiGroupe(aValider, signaturesGroupe(groupe().lignes), relue(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a2' ? rap('a2', 'r-fer', 2, true) : r))))
    expect(d.envoyer).toEqual([])
    expect(d.modifiees).toEqual([{ id: 'a2', designation: 'Fer HA 10 barre 12 m', raison: 'plus_suggestion' }])
    expect(messageLignesModifiees(d.modifiees, 'valider')).toBe('« Fer HA 10 barre 12 m » a été modifiée par quelqu’un d’autre (elle n’est plus une suggestion de l’IA) : relis-la avant de valider. Rien n’a été validé.')
  })
  it('I1 : ligne refusée, ligne disparue, autre référence, autre coefficient : chaque cas est repéré et dit en français', () => {
    const vues = signaturesGroupe(groupe().lignes)
    const refusee = lignesModifiees(['a1', 'a2', 'a3'], vues, relue(RAPPROCHEMENTS.filter((r) => r.article_fournisseur_id !== 'a3')))
    expect(refusee.map((m) => [m.id, m.raison])).toEqual([['a3', 'plus_suggestion']])
    const disparue = lignesModifiees(['a1', 'a2', 'a3'], vues, relue(RAPPROCHEMENTS).filter((x) => x.article.id !== 'a1'))
    expect(disparue).toEqual([{ id: 'a1', designation: 'Fer HA 10 barre 12 m', raison: 'disparue' }])
    const ailleurs = lignesModifiees(['a1', 'a2', 'a3'], vues, relue(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a1' ? rap('a1', 'r-tube', 1) : r))))
    expect(ailleurs.map((m) => [m.id, m.raison])).toEqual([['a1', 'reference']])
    const coef = lignesModifiees(['a1', 'a2', 'a3'], vues, relue(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a3' ? rap('a3', 'r-fer', 0.5) : r))))
    expect(coef).toEqual([{ id: 'a3', designation: 'Fer HA10', raison: 'coefficient', coefficientAvant: 1, coefficientApres: 0.5 }])
    expect(messageLignesModifiees(coef, 'valider')).toBe('« Fer HA10 » a été modifiée par quelqu’un d’autre (son coefficient est passé de 1 à 0,5) : relis-la avant de valider. Rien n’a été validé.')
    expect(messageLignesModifiees([...disparue, ...ailleurs.map((m) => ({ ...m, id: 'a2' }))], 'refuser'))
      .toBe('« Fer HA 10 barre 12 m » a été modifiée par quelqu’un d’autre (elle n’est plus dans la liste) ; « Fer HA 10 barre 12 m » a été modifiée par quelqu’un d’autre (elle pointe vers un autre article de référence) : relis-les avant de refuser. Rien n’a été refusé.')
  })
  it('I1 : seules les lignes à envoyer sont contrôlées (une ligne sortie du groupe peut avoir changé sans bloquer) ; une ligne jamais vue n’est pas envoyée', () => {
    const vues = signaturesGroupe(groupe().lignes)
    const fraiches = relue(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a2' ? rap('a2', 'r-fer', 2, true) : r)))
    expect(deciderEnvoiGroupe([{ id: 'a1', coefficient: 1 }, { id: 'a3', coefficient: 1 }], vues, fraiches).envoyer.map((l) => l.id)).toEqual(['a1', 'a3'])
    expect(deciderEnvoiGroupe([{ id: 'a1', coefficient: 1 }], {}, fraiches).envoyer).toEqual([])
  })
  it('I1 : après le message, la ligne relue devient « ce que la personne a vu » : au clic suivant, les autres lignes partent', () => {
    const fraiches = relue(RAPPROCHEMENTS.map((r) => (r.article_fournisseur_id === 'a3' ? rap('a3', 'r-fer', 0.5) : r)))
    expect(deciderEnvoiGroupe(aValider, signaturesGroupe(groupe().lignes), fraiches).envoyer).toEqual([])
    expect(deciderEnvoiGroupe(aValider, signaturesGroupe(fraiches), fraiches).envoyer).toEqual(aValider)
  })
})

describe('refuser ou valider un groupe : plusieurs appels successifs, une seule annulation', () => {
  const panne = () => new ErreurDecision('Connexion impossible, réessaie.', 'reseau')
  const disparue = () => new ErreurDecision('Cette suggestion n’existe plus.', 'suggestion_introuvable')
  it('G13 : un appel par article, l’un après l’autre, dans l’ordre ; tout réussi = UN bandeau « N suggestions refusées. »', async () => {
    const journal = []
    const refuser = vi.fn(async (id) => { journal.push('début ' + id); await Promise.resolve(); journal.push('fin ' + id) })
    const r = await executerEnSerie(['a1', 'a2', 'a3'], refuser)
    expect(journal).toEqual(['début a1', 'fin a1', 'début a2', 'fin a2', 'début a3', 'fin a3'])
    expect(r).toEqual({ faits: ['a1', 'a2', 'a3'], echecs: [], nonTentes: [] })
    expect(messageRefusGroupe(r)).toBeNull()
    expect(texteRefusAnnulable(r.faits.length)).toBe('3 suggestions refusées.')
    expect(texteRefusAnnulable(1)).toBe(TEXTE_REFUS_ANNULABLE)
  })
  it('G14 : « Annuler » rappelle la reprise pour CHAQUE ligne refusée, même si l’une échoue ; le message dit ce qui est revenu et ce qui reste', async () => {
    const reprendre = vi.fn(async (id) => { if (id === 'a2') throw panne() })
    const r = await executerEnSerie(['a1', 'a2', 'a3'], reprendre, () => true)
    expect(reprendre.mock.calls.map((c) => c[0])).toEqual(['a1', 'a2', 'a3'])
    expect(r.faits).toEqual(['a1', 'a3'])
    expect(r.echecs.map((e) => e.element)).toEqual(['a2'])
    expect(messageAnnulationGroupe(r)).toBe('Le refus n’a pas été annulé en entier : 2 sur 3 suggestions sont revenues, 1 est encore refusée (Connexion impossible, réessaie).')
    const tout = await executerEnSerie(['a1', 'a2'], vi.fn(async () => {}), () => true)
    expect(messageAnnulationGroupe(tout)).toBeNull()
    expect(messageRefusAnnule(2)).toBe('Refus annulé : les 2 suggestions sont revenues.')
    expect(messageRefusAnnule(1)).toBe('Refus annulé : la suggestion est revenue.')
    const seule = await executerEnSerie(['a1'], async () => { throw panne() }, () => true)
    expect(messageAnnulationGroupe(seule)).toBe('Le refus n’a pas pu être annulé : Connexion impossible, réessaie.')
  })
  it('G15 : une panne en cours de route arrête le refus : message clair (fait, reste, où retrouver les refusées) ; les suivantes ne sont pas envoyées', async () => {
    const refuser = vi.fn(async (id) => { if (id === 'a2') throw panne() })
    const r = await executerEnSerie(['a1', 'a2', 'a3'], refuser, erreurEtatChange)
    expect(refuser).toHaveBeenCalledTimes(2)
    expect(r.faits).toEqual(['a1'])
    expect(r.nonTentes).toEqual(['a3'])
    expect(messageRefusGroupe(r)).toBe('Le groupe n’a pas été refusé en entier : 1 sur 3 suggestions est refusée. 2 restent à refuser (Connexion impossible, réessaie) : réessaie avec « Refuser le groupe ». '
      + 'Tu retrouves les suggestions refusées avec le filtre « Refusée » et le bouton « Reprendre cette suggestion ».')
    const rien = await executerEnSerie(['a1', 'a2'], async () => { throw panne() }, erreurEtatChange)
    expect(messageRefusGroupe(rien)).toBe('Le groupe n’a pas été refusé en entier : aucune des 2 suggestions n’est refusée. 2 restent à refuser (Connexion impossible, réessaie) : réessaie avec « Refuser le groupe ».')
    // Mineur 3 : quand il ne reste qu'UNE ligne, elle n'est plus un groupe : son bouton s'appelle « Refuser ».
    const presque = await executerEnSerie(['a1', 'a2'], async (id) => { if (id === 'a2') throw panne() }, erreurEtatChange)
    expect(messageRefusGroupe(presque)).toBe('Le groupe n’a pas été refusé en entier : 1 sur 2 suggestions est refusée. 1 reste à refuser (Connexion impossible, réessaie) : réessaie avec « Refuser ». '
      + 'Tu retrouves les suggestions refusées avec le filtre « Refusée » et le bouton « Reprendre cette suggestion ».')
  })
  it('G16 : un article déjà refusé ou validé par quelqu’un d’autre pendant l’affichage est passé, les autres sont refusés', async () => {
    const refuser = vi.fn(async (id) => { if (id === 'a1') throw disparue() })
    const r = await executerEnSerie(['a1', 'a2', 'a3'], refuser, erreurEtatChange)
    expect(refuser).toHaveBeenCalledTimes(3)
    expect(r.faits).toEqual(['a2', 'a3'])
    expect(messageRefusGroupe(r)).toBe('Le groupe n’a pas été refusé en entier : 2 sur 3 suggestions sont refusées. 1 avait changé entre-temps : pas touchée. '
      + 'Tu retrouves les suggestions refusées avec le filtre « Refusée » et le bouton « Reprendre cette suggestion ».')
    expect(erreurEtatChange(disparue())).toBe(true)
    expect(erreurEtatChange(panne())).toBe(false)
    expect(erreurEtatChange(new Error('x'))).toBe(false)
    expect(erreurEtatChange(null)).toBe(false)
  })
  it('G17 : valider un groupe = une validation par ligne gardée ; une erreur arrête la série, les lignes déjà validées le restent et le message le dit', async () => {
    const valider = vi.fn(async (l) => { if (l.id === 'a2') throw panne() })
    const r = await executerEnSerie([{ id: 'a1', coefficient: 1 }, { id: 'a2', coefficient: 0.5 }, { id: 'a3', coefficient: 1 }], valider)
    expect(valider.mock.calls.map((c) => c[0])).toEqual([{ id: 'a1', coefficient: 1 }, { id: 'a2', coefficient: 0.5 }])
    expect(messageValidationGroupe(r, 'Fer HA 10')).toBe('1 ligne sur 3 est validée, et elle le reste. « Fer HA 10 » n’a pas pu être validée (Connexion impossible, réessaie). 1 ligne après elle n’a pas été envoyée. Corrige, puis valide de nouveau.')
    const rien = await executerEnSerie([{ id: 'a1', coefficient: 1 }], async () => { throw panne() })
    expect(messageValidationGroupe(rien, 'Fer HA 10')).toBe('Rien n’a été validé. « Fer HA 10 » n’a pas pu être validée (Connexion impossible, réessaie). Corrige, puis valide de nouveau.')
    expect(messageGroupeValide(3)).toBe('3 rapprochements validés.')
    expect(messageGroupeValide(1)).toBe('Rapprochement validé.')
  })
  it('G18 : aucun texte de la vue groupée ne dit « fraude » ni « arnaque »', async () => {
    const r = await executerEnSerie(['a1', 'a2'], async () => { throw panne() }, () => true)
    const g = grouperSuggestions(liste()).groupes[0]
    const textes = [messageRefusGroupe(r), messageAnnulationGroupe(r), messageValidationGroupe(r, 'x'), texteMorceaux(phraseComparaison(g.lignes.map(nomLigneGroupe), comparerGroupe(g), 'u')), texteCompteurGroupes(grouperSuggestions(liste()))]
    for (const t of textes) expect(t).not.toMatch(/fraude|arnaque/i)
  })
})

// ---- groupes déjà VALIDÉS (demande du 23/11/2026) : cartes au-dessus du tableau, « N fournisseurs », compteur « N rapprochés »
describe('groupes déjà validés', () => {
  const RAP = [rap('a1', 'r-fer', 1, true), rap('a3', 'r-fer', 1, true), rap('a2', 'r-fer', 1, false), rap('e2', 'r-enduit', 1, true)]
  const L = liste(RAP)
  it('V1 : seuls les articles VALIDÉS d’une même référence forment un groupe (au moins deux) ; une suggestion ne compte pas', () => {
    const v = grouperSuggestions(L, 'valide')
    expect(v.groupes.map((g) => g.reference.id)).toEqual(['r-fer'])
    expect(ids(v.groupes[0].lignes).sort()).toEqual(['a1', 'a3'])
    expect(ids(v.seuls)).toContain('e2')
    expect(ids(v.seuls)).toContain('a2')
  })
  it('V2 : les cartes de validés s’affichent avec le filtre État vide ou contenant « Validé », pas avec « Suggéré » seul', () => {
    expect(vueValidesActive(CRITERES_ARTICLES_VIDES)).toBe(true)
    expect(vueValidesActive({ ...CRITERES_ARTICLES_VIDES, etats: ['valide'] })).toBe(true)
    expect(vueValidesActive({ ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] })).toBe(false)
    expect(vueValidesActive({ ...CRITERES_ARTICLES_VIDES, etats: ['a_rapprocher'] })).toBe(false)
  })
  it('V3 : « 2 fournisseurs » ; un seul fournisseur : « 1 fournisseur · 2 articles »', () => {
    const g = grouperSuggestions(L, 'valide').groupes[0]
    expect(texteFournisseursGroupe(g)).toBe('2 fournisseurs')
    expect(texteFournisseursGroupe({ ...g, lignes: [g.lignes[0], { ...g.lignes[0], article: { ...g.lignes[0].article, id: 'zz' } }] })).toBe('1 fournisseur · 2 articles')
  })
  it('V4 : phrase au-dessus des cartes', () => {
    expect(texteCompteurValides(grouperSuggestions(L, 'valide'))).toBe('1 groupe déjà rapproché, 2 articles de fournisseurs.')
  })
})

describe('nom de l’article de référence du groupe (renommage, 24/11/2026)', () => {
  it('N1 : nom vide, sans lettre ni chiffre ou trop long : message en français ; un vrai nom passe', () => {
    expect(verifierNomReferenceGroupe('')).toBe('Écris un nom pour l’article de référence.')
    expect(verifierNomReferenceGroupe('   ')).toBe('Écris un nom pour l’article de référence.')
    expect(verifierNomReferenceGroupe('-- ??')).toBe('Le nom doit contenir au moins une lettre ou un chiffre.')
    expect(verifierNomReferenceGroupe('a'.repeat(121))).toMatch(/trop long/)
    expect(verifierNomReferenceGroupe('Câble U1000 R2V 3G2,5 couronne 100 m')).toBeNull()
    expect(verifierNomReferenceGroupe('a'.repeat(120))).toBeNull()
  })
  it('N2 : un nom qui ne diffère que par la casse ou les espaces n’est pas un renommage', () => {
    expect(memeNom('Tube multicouche Ø16', '  tube   MULTICOUCHE Ø16 ')).toBe(true)
    expect(memeNom('Tube multicouche Ø16', 'Tube multicouche Ø20')).toBe(false)
    expect(nomPropre('  a \n  b ')).toBe('a b')
  })
  it('N3 : corps du renommage : la référence et le nom rangé, jamais d’identité', () => {
    expect(corpsRenommage('id-1', '  Gaine  ICTA 20 ')).toEqual({ article_reference_id: 'id-1', nom: 'Gaine ICTA 20' })
  })
  it('N4 : « nom déjà pris » se reconnaît au code stable de l’erreur, jamais au texte ; message sans texte technique', () => {
    expect(estNomDejaPris(Object.assign(new Error('x'), { code: 'nom_deja_pris' }))).toBe(true)
    expect(estNomDejaPris(Object.assign(new Error('Ce nom existe déjà.'), { code: 'autre' }))).toBe(false)
    expect(estNomDejaPris(new Error('nom_deja_pris'))).toBe(false)
    expect(estNomDejaPris(null)).toBe(false)
    expect(TEXTE_NOM_DEJA_PRIS).toBe('Ce nom existe déjà. Choisis un autre nom.')
    expect(TEXTE_NOM_DEJA_PRIS).not.toMatch(/_|P0001|unique/)
  })
})

// ------------------------------------------------------------------ une ligne par association (filtre « Rapprochés » seul, 24/11/2026)
import { lignesAssociations, regrouperParAssociation, textePastilleAssociation, textePrixAssociation, texteReferencesAssociation, vueAssociationsActive, TRI_ARTICLES_DEFAUT } from '../js/modules/achatsarticles/logique.js'

describe('une ligne par association', () => {
  const BAR = ref('r-bar', 'Barre HA 10', 'u'), TUBE2 = ref('r-t2', 'Tube Ø16', 'ml'), SOLO = ref('r-solo', 'Colle', 'sac')
  const articles = [
    art('b1', 'Barre fer 12 m', 'Verdon', { reference: 'M031' }), art('b2', 'Barre HA10', 'Chantier Plus', { reference: 'BAR' }), art('b3', 'Barre sans prix', 'Aaa Matériaux'),
    art('t1', 'Tube couronne 50 m', 'Durance', { unite: 'couronne' }), art('t2', 'Tube couronne', 'Sanitaire', { unite: 'couronne' }),
    art('s1', 'Colle sac', 'Verdon', { unite: 'sac' }), art('l1', 'Libre', 'Verdon'), art('g1', 'Suggéré', 'Verdon'),
]
  const rapprochements = [
    rap('b1', 'r-bar', 1, true), rap('b2', 'r-bar', 1, true), rap('b3', 'r-bar', 1, true),
    rap('t1', 'r-t2', 0.02, true), rap('t2', 'r-t2', 0.02, true), rap('s1', 'r-solo', 1, true), rap('g1', 'r-bar', 1, false),
]
  const lignesPrix = [prix('b1', 8.74), prix('b2', 8.1), prix('t1', 96), prix('t2', 96), prix('s1', 12.5)]
  const liste = construireListe(articles, rapprochements, [BAR, TUBE2, SOLO], statistiquesLignes(lignesPrix))
  const valide = { ...CRITERES_ARTICLES_VIDES, etats: ['valide'] }

  it('seul le filtre « Rapprochés » exact active la vue', () => {
    expect(vueAssociationsActive(valide)).toBe(true)
    expect(vueAssociationsActive(CRITERES_ARTICLES_VIDES)).toBe(false)
    expect(vueAssociationsActive({ ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] })).toBe(false)
    expect(vueAssociationsActive({ ...CRITERES_ARTICLES_VIDES, etats: ['valide', 'suggere'] })).toBe(false)
    expect(vueAssociationsActive({ ...CRITERES_ARTICLES_VIDES, etats: ['a_rapprocher'] })).toBe(false)
  })
  it('2 fournisseurs et plus : noms complets triés, références distinctes, fourchette du moins cher au plus cher, article sans prix ignoré', () => {
    const l = lignesAssociations(liste, valide, TRI_ARTICLES_DEFAUT).find((x) => x.referenceId === 'r-bar')
    expect(l.nom).toBe('Barre HA 10')
    expect(l.fournisseurs).toEqual(['Aaa Matériaux', 'Chantier Plus', 'Verdon'])
    expect(l.references).toEqual(['M031', 'BAR'])
    expect(l.nb).toBe(4) // 3 validés + 1 suggestion de la même référence : mêmes membres que la fenêtre Association
    expect(l.prixMin).toBeCloseTo(8.1); expect(l.prixMax).toBeCloseTo(8.74)
    expect(texteReferencesAssociation(l)).toBe('réf. M031 · BAR')
    expect(propre(textePrixAssociation(l))).toBe('8,10 € – 8,74 €')
    expect(textePastilleAssociation(l)).toBe('Groupe · 4')
  })
  it('coefficient différent de 1 : prix MULTIPLIÉ par le coefficient ; prix égaux = un seul montant', () => {
    const l = lignesAssociations(liste, valide, TRI_ARTICLES_DEFAUT).find((x) => x.referenceId === 'r-t2')
    expect(l.prixMin).toBeCloseTo(1.92); expect(l.prixMax).toBeCloseTo(1.92)
    expect(propre(textePrixAssociation(l))).toBe('1,92 €')
    expect(l.references).toEqual([])
    expect(texteReferencesAssociation(l)).toBe('')
  })
  it('aucun prix : « — » ; association d’un seul article : « Groupe · 1 » et un fournisseur', () => {
    expect(textePrixAssociation({ prixMin: null, prixMax: null })).toBe('—')
    const l = lignesAssociations(liste, valide, TRI_ARTICLES_DEFAUT).find((x) => x.referenceId === 'r-solo')
    expect(l.nb).toBe(1); expect(l.fournisseurs).toEqual(['Verdon']); expect(textePastilleAssociation(l)).toBe('Groupe · 1')
  })
  it('la recherche sur un seul membre affiche l’association entière ; le filtre fournisseur aussi', () => {
    const l = lignesAssociations(liste, { ...valide, recherche: 'HA10' }, TRI_ARTICLES_DEFAUT)
    expect(l.map((x) => x.referenceId)).toEqual(['r-bar'])
    expect(l[0].fournisseurs).toHaveLength(3)
    const f = lignesAssociations(liste, { ...valide, fournisseurs: ['Sanitaire'] }, TRI_ARTICLES_DEFAUT)
    expect(f.map((x) => x.referenceId)).toEqual(['r-t2'])
    expect(f[0].fournisseurs).toEqual(['Durance', 'Sanitaire'])
    expect(lignesAssociations(liste, { ...valide, recherche: 'zzz' }, TRI_ARTICLES_DEFAUT)).toEqual([])
  })
  it('tris : désignation = nom de l’article interne, prix = prix le plus bas (sans prix en dernier)', () => {
    const noms = (t) => lignesAssociations(liste, valide, t).map((x) => x.nom)
    expect(noms({ critere: 'designation', sens: 'asc' })).toEqual(['Barre HA 10', 'Colle', 'Tube Ø16'])
    expect(noms({ critere: 'designation', sens: 'desc' })).toEqual(['Tube Ø16', 'Colle', 'Barre HA 10'])
    expect(noms({ critere: 'prix', sens: 'asc' })).toEqual(['Tube Ø16', 'Barre HA 10', 'Colle'])
    expect(noms({ critere: 'prix', sens: 'desc' })).toEqual(['Colle', 'Barre HA 10', 'Tube Ø16'])
  })
  it('les autres filtres ne regroupent pas : filtrerArticles garde une ligne par article, regrouperParAssociation ne touche pas la liste', () => {
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] }).map((x) => x.article.id)).toEqual(['g1'])
    expect(filtrerArticles(liste, CRITERES_ARTICLES_VIDES)).toHaveLength(articles.length)
    expect(regrouperParAssociation(liste.filter((x) => !x.rapprochement))).toEqual([])
  })
})
