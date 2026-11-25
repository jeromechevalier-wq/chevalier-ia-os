import { describe, it } from 'node:test'
import { expect } from './_expect-tableauachats.js'
import { formater, nombre, variation } from '../js/modules/tableauachats/formats.js'
import { sensInitial, trier, triSuivant } from '../js/modules/tableauachats/tri.js'
import { FILTRES_PAR_ONGLET, actionNAValider, actionToutesPeriodes, actionVoirADecider, appliquerChangement, cleFournisseur, ecarteDuDefaut, filtresParDefaut, memoireParDefaut, nomFournisseur, normaliser, rappelAValider, reinitialiser, restreindre, RACCOURCIS, filtrerChantiers, filtrerFactures, libellePlage, nbFiltresActifs, texteHorsPeriode, valeursDistinctes,                                                         } from '../js/modules/tableauachats/filtrage.js'
import * as K from '../js/modules/tableauachats/calculs.js'
import * as O from '../js/modules/tableauachats/options.js'

const F = (o                  )          => ({ facture_id: 'x', fournisseur: 'A', numero: '1', chantier_id: 'c1', chantier: 'Maison', sans_chantier: false, client: 'Dupont', type_document: 'facture', statut: 'acceptee', statut_fr: 'Acceptée',
  montant_ht: 100, date_ref: '2026-11-10', mois: '2026-11-01', created_at: '2026-11-10T08:00:00Z', date_decision: '2026-11-11T08:00:00Z', nb_alertes: 0, acceptee_malgre_alerte: false, jours_attente: null, date_future: false, ...o })
const C = (o                   )           => ({ chantier_id: 'c1', chantier: 'Maison', client: 'Dupont', statut: 'en_cours', statut_fr: 'En cours', archive: false, budget_ht: 1000, budget_renseigne: true, accepte_ht: 950, en_attente_ht: 0, reste_ht: 50, pct_budget_consomme: 95, niveau: 'a_surveiller', ...o })
const COULEURS             = { panneau: '#222', texte: '#fff', texte2: '#aaa', bordure: '#333', accent: '#ec0', serie: '#6af', bon: '#6d9', attention: '#fb6', mauvais: '#f88', neutre: '#aaa', palette: ['#1', '#2', '#3', '#4', '#5', '#6', '#7'] }

describe('formats', () => {
  it('1 : euros, pourcents et jours à la française, vide si illisible', () => {
    expect(formater(1234.5, 'euros0')).toMatch(/^1\s235\s€$/)
    expect(formater(60000, 'euros_abrege')).toBe('60 k€')
    expect(formater(95, 'pourcent0')).toBe('95 %')
    expect(formater(1, 'jours')).toBe('1 jour'); expect(formater(12, 'jours')).toBe('12 jours')
    expect(formater(null, 'euros0')).toBe(''); expect(formater('abc', 'euros0')).toBe('')
    expect(nombre('')).toBeNull(); expect(nombre('12.5')).toBe(12.5)
  })
  it('2 : une date AAAA-MM-JJ garde son jour (pas de décalage de fuseau)', () => {
    expect(formater('2026-11-01', 'date')).toBe('01/11/2026')
    expect(formater('2026-11-01', 'mois_annee')).toBe('novembre 2026')
  })
  it('3 : variation non calculable si la période précédente est à 0', () => {
    expect(variation(120, 100)).toBeCloseTo(20); expect(variation(5, 0)).toBeNull(); expect(variation(null, 3)).toBeNull()
  })
})

describe('filtres (principe Metabase)', () => {
  const t = '2026-11-23'
  const plage = (id        ) => RACCOURCIS.find((r) => r.id === id) .plage(t)
  it('4 : les raccourcis de période ne comptent pas la période en cours', () => {
    expect(plage('aujourdhui')).toEqual(['2026-11-23', '2026-11-23'])
    expect(plage('hier')).toEqual(['2026-11-22', '2026-11-22'])
    expect(plage('7j')).toEqual(['2026-11-16', '2026-11-22'])
    expect(plage('semaine')).toEqual(['2026-11-16', '2026-11-22']) // le 23/11/2026 est un lundi
    expect(plage('mois')).toEqual(['2026-10-01', '2026-10-31'])
    expect(plage('3m')).toEqual(['2026-08-01', '2026-10-31'])
    expect(plage('12m')).toEqual(['2025-12-01', '2026-11-30']) // « 12 mois glissants » : 11 mois avant + le mois en cours (seule exception, voulue)
    expect(plage('ce-mois')).toEqual(['2026-11-01', '2026-11-30']); expect(plage('annee')).toEqual(['2026-01-01', '2026-12-31'])
  })
  it('5 : chaque filtre (Période, Chantier, Statut, Fournisseur) restreint les factures, tous ensemble', () => {
    const l = [F({ facture_id: '1' }), F({ facture_id: '2', fournisseur: 'B', statut: 'refusee', statut_fr: 'Refusée', montant_ht: 500, date_ref: '2026-10-05' }), F({ facture_id: '3', chantier: 'Sans chantier', chantier_id: null, sans_chantier: true, client: null })]
    expect(filtrerFactures(l, {}).length).toBe(3)
    expect(filtrerFactures(l, { fournisseur: { type: 'liste', choix: ['B'] } }).map((x) => x.facture_id)).toEqual(['2'])
    expect(filtrerFactures(l, { statut: { type: 'liste', choix: ['Acceptée'] } }).length).toBe(2)
    expect(filtrerFactures(l, { chantier: { type: 'liste', choix: ['Sans chantier'] } }).map((x) => x.facture_id)).toEqual(['3'])
    expect(filtrerFactures(l, { periode: { type: 'periode', libelle: 'x', du: '2026-10-01', au: '2026-10-31' } }).map((x) => x.facture_id)).toEqual(['2'])
    expect(filtrerFactures(l, { fournisseur: { type: 'liste', choix: ['A', 'B'] }, statut: { type: 'liste', choix: ['Acceptée'] } }).map((x) => x.facture_id)).toEqual(['1', '3'])
  })
  it('6 : seul le filtre Chantier restreint les chantiers ; les anciens filtres (client, décideur, montant) n’existent plus', () => {
    const ch = [C({ chantier_id: 'c1' }), C({ chantier_id: 'c2', chantier: 'Garage' })]
    expect(filtrerChantiers(ch, { chantier: { type: 'liste', choix: ['Garage'] } }).map((x) => x.chantier)).toEqual(['Garage'])
    expect(filtrerChantiers(ch, {}).length).toBe(2)
    const l = [F({ facture_id: '1' }), F({ facture_id: '2', montant_ht: 900 })]
    expect(filtrerFactures(l, { montant: { type: 'liste', choix: ['x'] }, decideur: { type: 'liste', choix: ['x'] }, client: { type: 'liste', choix: ['x'] } }         ).length).toBe(2)
  })
  it('7 : libellés de plage, filtres actifs, valeurs distinctes sans vide', () => {
    expect(libellePlage('2026-10-01', '2026-10-31')).toBe('01/10/2026 – 31/10/2026')
    expect(libellePlage(null, '2026-10-31')).toBe('jusqu’au 31/10/2026')
    expect(nbFiltresActifs({ a: { type: 'liste', choix: ['x'] }, b: undefined })).toBe(1)
    expect(valeursDistinctes(['b', 'a', 'b', '', null, undefined, 'é'])).toEqual(['a', 'b', 'é'])
  })
})

describe('calculs (mêmes règles que les vues v_td_*)', () => {
  const l = [
    F({ facture_id: '1', fournisseur: 'A', montant_ht: 500 }), F({ facture_id: '2', fournisseur: 'B', montant_ht: 300, chantier: 'Garage', chantier_id: 'c2' }),
    F({ facture_id: '3', fournisseur: 'C', montant_ht: 200 }), F({ facture_id: '4', fournisseur: 'D', montant_ht: -50, type_document: 'avoir' }),
    F({ facture_id: '5', fournisseur: 'E', statut: 'a_valider', statut_fr: 'À valider', montant_ht: 900, jours_attente: 12, date_decision: null }),
    F({ facture_id: '6', fournisseur: 'F', statut: 'refusee', statut_fr: 'Refusée', montant_ht: 40 }),
  ]
  it('8 : classement des fournisseurs : seules les factures acceptées de montant positif, la ligne qui franchit 80 % compte', () => {
    const p = K.pareto(l, 'fournisseurs')
    expect(p.map((x) => x.nom)).toEqual(['A', 'B', 'C']) // l'avoir (négatif) et les autres statuts sont écartés
    expect(p.map((x) => x.cumul_pct)).toEqual([50, 80, 100])
    expect(p.map((x) => x.dans_80_pct)).toEqual([true, true, false]) // 80 % exactement atteint par la 2e ligne
  })
  it('9 : à valider, attente par tranche, 12 mois glissants avec mois vides à 0', () => {
    expect(K.aValider(l)).toEqual({ nb: 1, total_ht: 900, attente_max_jours: 12 })
    expect(K.attenteParTranche(l).map((x) => x.nb_factures)).toEqual([0, 0, 1, 0])
    const m = K.achatsParMois(l, '2026-11-23')
    expect(m.length).toBe(12); expect(m[11]).toMatchObject({ mois: '2026-11-01', total_ht: 950, nb_factures: 4 }); expect(m[0].total_ht).toBe(0)
  })
  it('10 : taux de refus : mois sans décision = vide, jamais 0 %', () => {
    const t = K.tauxRefusParMois(l, '2026-11-23')
    expect(t[11].taux_refus_pct).toBe(20); expect(t[5].taux_refus_pct).toBeNull()
  })
  it('11 : cas vide : aucune ligne, aucun plantage', () => {
    expect(K.pareto([], 'chantiers')).toEqual([]); expect(K.aValider([])).toEqual({ nb: 0, total_ht: 0, attente_max_jours: 0 })
    expect(K.delaiMedianJours([]).jours).toBeNull(); expect(K.top3Fournisseurs([]).part_top3_pct).toBeNull()
    expect(K.resumeDuJour([], [])[0]).toBe('Aucune facture à décider.')
  })
  it('12 : chantiers à surveiller et phrases du résumé', () => {
    expect(K.aSurveiller([C({}), C({ chantier: 'Autre', pct_budget_consomme: 40 })]).length).toBe(1)
    expect(K.resumeDuJour(l, [C({})])[2]).toBe('1 chantier à 90 % du budget ou plus : Maison.')
  })
})

describe('options ECharts (données, jamais du code)', () => {
  it('14 : barres empilées : au-delà du maximum, le reste est regroupé en « Autres »', () => {
    const lignes = ['a', 'b', 'c', 'd'].map((k, i) => ({ mois: '2026-11-01', cle: k, valeur: 10 - i }))
    const o = O.empile(lignes, COULEURS, { format: String, max: 3 })                                                  
    expect(o.series.map((s) => s.name)).toEqual(['a', 'b', 'Autres']); expect(o.series[2].data).toEqual([8 + 7])
  })
  it('15 : aucune option ne contient d’adresse web, de lien ni d’image', () => {
    const tout = JSON.stringify([O.barresMensuelles(K.achatsParMois([F({})]), COULEURS), O.budgetsOption([C({})], COULEURS), O.ligneTaux(K.tauxRefusParMois([F({})]), COULEURS)])
    expect(tout).not.toMatch(/https?:|image:\/\/|javascript:|<script/i)
  })
})

describe('corrections de relecture', () => {
  it('les infobulles prennent le fond du thème, pas un fond fixe', () => {
    expect((O.barresMensuelles([], COULEURS).tooltip                               ).backgroundColor).toBe(COULEURS.panneau)
  })
})

describe('E : critères d’acceptation des filtres par onglet (recommandation de l’expert, 23/11/2026)', () => {
  const t = '2026-11-23'
  const vieille = F({ facture_id: 'v', statut: 'a_valider', statut_fr: 'À valider', date_ref: '2025-01-10', mois: '2025-01-01', fournisseur: 'Z', chantier: 'Garage', chantier_id: 'c2' })
  const recente = F({ facture_id: 'r', statut: 'a_valider', statut_fr: 'À valider' })
  const ok = F({ facture_id: 'o' })
  const tout = [vieille, recente, ok]
  it('E1 Dirigeant : aucun filtre', () => { expect(FILTRES_PAR_ONGLET.dirigeant).toEqual([]); expect(restreindre({ ...filtresParDefaut(t), statut: { type: 'liste', choix: ['x'] } }, 'dirigeant')).toEqual({}) })
  it('E2 Pilotage : Période et Chantier seulement, Période par défaut = 12 mois glissants', () => {
    expect(FILTRES_PAR_ONGLET.pilotage).toEqual(['periode', 'chantier'])
    const d = filtresParDefaut(t).periode                                               
    expect(d.libelle).toBe('12 mois glissants'); expect(d.du).toBe('2025-12-01'); expect(d.au).toBe('2026-11-30')
    expect(Object.keys(restreindre({ ...filtresParDefaut(t), statut: { type: 'liste', choix: ['x'] }, fournisseur: { type: 'liste', choix: ['x'] } }, 'pilotage'))).toEqual(['periode'])
  })
  it('E3 Liste : Statut, Période, Chantier, Fournisseur ; plus de Montant, Décideur, Client', () => {
    expect(FILTRES_PAR_ONGLET.liste).toEqual(['periode', 'chantier', 'statut', 'fournisseur'])
    expect(Object.keys(restreindre({ montant: { type: 'liste', choix: ['x'] }, decideur: { type: 'liste', choix: ['x'] }, client: { type: 'liste', choix: ['x'] } }, 'liste'))).toEqual([])
  })
  it('E4 Liste : le défaut de période ne cache jamais une facture à valider ancienne sans le dire', () => {
    const r = rappelAValider(tout, filtresParDefaut(t))
    expect(r.total).toBe(2); expect(r.cachees).toBe(1)
    expect(filtrerFactures(tout, filtresParDefaut(t)).map((x) => x.facture_id)).not.toContain('v') // cachée par la période, mais signalée par le rappel
    expect(rappelAValider(tout, {}).cachees).toBe(0)
  })
  it('E5 Dirigeant : le lien « factures à décider » pose Statut = À valider sans période, dans la Liste seulement', () => {
    const m = memoireParDefaut(t), apres = actionVoirADecider(m)
    expect(apres.liste).toEqual({ statut: { type: 'liste', choix: ['À valider'] } })
    expect(filtrerFactures(tout, apres.liste).map((x) => x.facture_id)).toEqual(['v', 'r'])
    expect(apres.pilotage).toBe(m.pilotage); expect(apres.prix).toBe(m.prix) // Période et Chantier des autres onglets intacts
  })
  it('E6 classement des fournisseurs : statut fixé aux acceptées (les à valider n’y comptent pas)', () => {
    expect(FILTRES_PAR_ONGLET).not.toHaveProperty('pareto') // l'onglet Pareto 80/20 n'existe plus
    expect(K.pareto(tout, 'fournisseurs').map((x) => x.nom)).toEqual(['A'])
  })
  it('E7 Période et Chantier communs quand on les change dans la barre ; Réinitialiser visible seulement si un filtre s’écarte du défaut', () => {
    const m0 = memoireParDefaut(t)
    const m1 = appliquerChangement(m0, 'liste', { ...m0.liste, chantier: { type: 'liste', choix: ['Garage'] } })
    expect(m1.pilotage.chantier).toBeDefined(); expect(m1.liste.chantier).toBeDefined(); expect(m1.dirigeant.chantier).toBeUndefined()
    expect(ecarteDuDefaut(m0.liste, 'liste', t)).toBe(false); expect(ecarteDuDefaut(m1.liste, 'liste', t)).toBe(true); expect(ecarteDuDefaut(m1.dirigeant, 'dirigeant', t)).toBe(false)
    expect(restreindre({ ...filtresParDefaut(t), chantier: { type: 'liste', choix: ['x'] } }, 'dirigeant').chantier).toBeUndefined()
  })
  it('E8 Liste : le tri commence par les plus gros chiffres, puis s’inverse au second clic', () => {
    const l = [F({ facture_id: 'a', montant_ht: 10 }), F({ facture_id: 'b', montant_ht: 900 }), F({ facture_id: 'c', montant_ht: null })]
    const t1 = triSuivant(null, { cle: 'montant_ht', droite: true })
    expect(t1).toEqual({ cle: 'montant_ht', sens: 'desc' })
    expect(trier(l, t1).map((x) => x.facture_id)).toEqual(['b', 'a', 'c']) // le vide est toujours à la fin
    expect(trier([F({ facture_id: 'v', montant_ht: null }), F({ facture_id: 'p', montant_ht: 5 })], t1).map((x) => x.facture_id)).toEqual(['p', 'v']) // vide en PREMIÈRE position dans la liste d'origine
    expect(trier([F({ facture_id: 'p', montant_ht: 5 }), F({ facture_id: 'v', montant_ht: null })], { cle: 'montant_ht', sens: 'asc' }).map((x) => x.facture_id)).toEqual(['p', 'v']) // vide en seconde position
    const t2 = triSuivant(t1, { cle: 'montant_ht', droite: true })
    expect(t2.sens).toBe('asc'); expect(trier(l, t2).map((x) => x.facture_id)).toEqual(['a', 'b', 'c'])
    expect(sensInitial({})).toBe('asc'); expect(sensInitial({ droite: true })).toBe('desc')
    expect(triSuivant(t2, { cle: 'fournisseur' })).toEqual({ cle: 'fournisseur', sens: 'asc' })
  })
  it('E8b tri des textes : sans tenir compte des accents ni des majuscules, nombres dans l’ordre des nombres', () => {
    const l = [{ n: 'zèbre' }, { n: 'Étoile' }, { n: 'abeille' }, { n: 'Abri' }]
    expect(trier(l, { cle: 'n', sens: 'asc' }).map((x) => x.n)).toEqual(['abeille', 'Abri', 'Étoile', 'zèbre'])
    expect(trier([{ n: 'F10' }, { n: 'F9' }], { cle: 'n', sens: 'asc' }).map((x) => x.n)).toEqual(['F9', 'F10'])
    expect(trier([{ n: 'a' }, { n: 'A' }, { n: 'b' }], { cle: 'n', sens: 'asc' }).map((x) => x.n)).toEqual(['a', 'A', 'b']) // casse ignorée : a et A restent dans l'ordre d'origine
    expect(trier([{ n: 'e' }, { n: 'é' }, { n: 'E' }, { n: 'f' }, { n: 'd' }], { cle: 'n', sens: 'asc' }).map((x) => x.n)).toEqual(['d', 'e', 'é', 'E', 'f'])
    const original = [{ n: 'b' }, { n: 'a' }]; trier(original, { cle: 'n', sens: 'asc' }); expect(original[0].n).toBe('b') // la liste d'origine n'est pas modifiée
  })
})

describe('F : actions et mémoire des filtres par onglet (relecture du 23/11/2026)', () => {
  const t = '2026-11-23'
  const garage          = { chantier: { type: 'liste', choix: ['Garage'] } }
  const base = ()          => { const m0 = memoireParDefaut(t); return appliquerChangement(m0, 'pilotage', { ...m0.pilotage, ...garage }) } // Chantier = Garage dans Pilotage et Liste
  it('F1 « Voir les N factures à décider » ne touche ni la Période ni le Chantier de Pilotage et Prix', () => {
    const m = base(), a = actionVoirADecider(m)
    expect(a.pilotage).toEqual(m.pilotage); expect(a.pilotage.chantier).toBeDefined(); expect(a.pilotage.periode).toBeDefined(); expect(a.prix.periode).toBeDefined()
    expect(a.liste.chantier).toBeUndefined(); expect(a.liste.periode).toBeUndefined()
  })
  it('F2 « N à valider » : met Statut = À valider ; retire la Période de la Liste seulement si elle cache des factures', () => {
    const m = base()
    const sans = actionNAValider(m, 0), avec = actionNAValider(m, 2)
    expect(sans.liste.periode).toBeDefined(); expect(avec.liste.periode).toBeUndefined()
    expect(sans.liste.statut).toEqual({ type: 'liste', choix: ['À valider'] }); expect(avec.liste.chantier).toBeDefined() // Chantier gardé
    expect(avec.pilotage).toEqual(m.pilotage); expect(avec.prix.periode).toBeDefined()
  })
  it('F3 « Afficher toutes les périodes » : la Période de la Liste seulement', () => {
    const m = base(), a = actionToutesPeriodes(m)
    expect(a.liste.periode).toBeUndefined(); expect(a.liste.chantier).toBeDefined(); expect(a.pilotage.periode).toBeDefined(); expect(a.prix.periode).toBeDefined()
  })
  it('F4 changement dans la barre : seuls les filtres de l’onglet bougent ; Période et Chantier sont recopiés dans les onglets qui les ont', () => {
    let m = memoireParDefaut(t)
    m = appliquerChangement(m, 'liste', { ...m.liste, statut: { type: 'liste', choix: ['Refusée'] } })
    expect(m.liste.statut).toBeDefined(); expect(m.pilotage.statut).toBeUndefined()
    m = appliquerChangement(m, 'prix', { ...m.prix, periode: { type: 'periode', libelle: 'x', du: '2026-01-01', au: '2026-01-31' } })
    expect(m.liste.periode).toMatchObject({ du: '2026-01-01' }); expect(m.pilotage.periode).toMatchObject({ du: '2026-01-01' })
    expect(m.liste.statut).toBeDefined() // l'onglet Prix n'a pas touché au Statut de la Liste
    m = appliquerChangement(m, 'pilotage', { ...m.pilotage, periode: undefined })
    expect(m.liste.periode).toBeUndefined()
  })
  it('F5 « Réinitialiser » dans Pilotage garde le Statut et le Fournisseur de la Liste ; dans la Liste, remet tout à zéro', () => {
    let m = memoireParDefaut(t)
    m = appliquerChangement(m, 'liste', { ...m.liste, statut: { type: 'liste', choix: ['Refusée'] }, fournisseur: { type: 'liste', choix: ['A'] }, ...garage })
    const p = reinitialiser(m, 'pilotage', t)
    expect(p.liste.statut).toBeDefined(); expect(p.liste.fournisseur).toBeDefined(); expect(p.liste.chantier).toBeUndefined() // Chantier est commun à Pilotage et Liste
    const l = reinitialiser(m, 'liste', t)
    expect(l.liste).toEqual(memoireParDefaut(t).liste); expect(l.pilotage).toEqual(memoireParDefaut(t).pilotage)
  })
  it('F4b scénario A : après « Voir les N factures à décider », choisir un Chantier dans la Liste ne change ni Pilotage ni Prix (leur Période reste)', () => {
    let m = actionVoirADecider(memoireParDefaut(t))
    const avant = memoireParDefaut(t)
    m = appliquerChangement(m, 'liste', { ...m.liste, chantier: { type: 'liste', choix: ['Garage'] } })
    expect(m.pilotage.periode).toEqual(avant.pilotage.periode); expect(m.prix.periode).toEqual(avant.prix.periode)
    expect(m.pilotage.chantier).toBeDefined() // Chantier est commun : il est bien recopié (c'est lui qui a changé)
    expect(m.liste.periode).toBeUndefined() // la Liste garde sa période retirée
  })
  it('F4c scénario B : après « Afficher toutes les périodes » dans la Liste, choisir un Chantier dans Pilotage ne redonne pas la Période à la Liste', () => {
    let m = actionToutesPeriodes(memoireParDefaut(t))
    m = appliquerChangement(m, 'pilotage', { ...m.pilotage, chantier: { type: 'liste', choix: ['Garage'] } })
    expect(m.liste.periode).toBeUndefined(); expect(m.liste.chantier).toBeDefined(); expect(m.pilotage.periode).toBeDefined()
  })
  it('F6 avertissement « hors de la période » : seulement si la période cache vraiment des factures à valider, et le texte reste vrai pour une facture future', () => {
    const vieille = F({ facture_id: 'v', statut: 'a_valider', statut_fr: 'À valider', date_ref: '2025-01-10', mois: '2025-01-01' })
    const future = F({ facture_id: 'f', statut: 'a_valider', statut_fr: 'À valider', date_ref: '2027-03-01', mois: '2027-03-01', date_future: true })
    const l = [vieille, future, F({ facture_id: 'o' })]
    const d = filtresParDefaut(t)
    expect(rappelAValider(l, d)).toEqual({ total: 2, cachees: 2 })
    expect(rappelAValider(l, { ...d, statut: { type: 'liste', choix: ['Acceptée'] } }).cachees).toBe(0) // Statut = Acceptée : la période n'y est pour rien
    expect(rappelAValider(l, { ...d, statut: { type: 'liste', choix: ['À valider'] } }).cachees).toBe(2)
    expect(rappelAValider(l, { ...d, chantier: { type: 'liste', choix: ['Autre'] } })).toEqual({ total: 0, cachees: 0 })
    expect(texteHorsPeriode(1)).toBe('1 facture à valider hors de la période.'); expect(texteHorsPeriode(2)).toBe('2 factures à valider hors de la période.')
    expect(texteHorsPeriode(2)).not.toMatch(/ancienne/)
  })
})

describe('G : listes de valeurs et un seul fournisseur par entreprise', () => {
  it('G1 valeurs triées dans l’ordre logique, sans tenir compte des majuscules ni des accents, sans doublon de casse', () => {
    expect(valeursDistinctes(['zèbre', 'Étoile', 'abeille', 'Abri', 'étoile', ' ', ''])).toEqual(['abeille', 'Abri', 'Étoile', 'zèbre'])
    expect(valeursDistinctes(['Refusée', 'Acceptée', 'À valider'])).toEqual(['À valider', 'Acceptée', 'Refusée'])
    expect(normaliser('  BÉTON   Exemple ')).toBe('beton exemple')
  })
  it('G2 filtre Fournisseur : le nom enregistré remplace le nom écrit ; deux écritures d’une même entreprise = un seul fournisseur', () => {
    const l = [
      F({ facture_id: '1', fournisseur: 'BÉTON EXEMPLE', fournisseur_affiche: 'Béton Exemple SARL', siret_agence: '99900011100011' }),
      F({ facture_id: '2', fournisseur: 'Béton Exemple SARL', fournisseur_affiche: 'Béton Exemple SARL', siret_agence: '99900011100011' }),
      F({ facture_id: '3', fournisseur: 'BETON EXEMPLE SARL', fournisseur_affiche: null, siret_agence: null }), // sans agence : même nom sans accents ni casse
      F({ facture_id: '4', fournisseur: 'Autre SA', fournisseur_affiche: 'Autre SA', siret_agence: '1' }),
    ]
    expect(valeursDistinctes(l.map(nomFournisseur))).toEqual(['Autre SA', 'Béton Exemple SARL'])
    expect(new Set(l.map(cleFournisseur)).size).toBe(2)
    expect(filtrerFactures(l, { fournisseur: { type: 'liste', choix: ['Béton Exemple SARL'] } }).map((x) => x.facture_id)).toEqual(['1', '2', '3'])
    expect(nomFournisseur(F({ fournisseur: 'Écrit', fournisseur_affiche: '  ' }))).toBe('Écrit') // rien d'enregistré : le nom de la facture
  })
  it('G3 Pareto des fournisseurs : une seule ligne par entreprise, nom enregistré affiché', () => {
    const l = [
      F({ facture_id: '1', fournisseur: 'BÉTON EXEMPLE', fournisseur_affiche: 'Béton Exemple SARL', montant_ht: 100 }),
      F({ facture_id: '2', fournisseur: 'Béton Exemple SARL', fournisseur_affiche: 'Béton Exemple SARL', montant_ht: 200 }),
      F({ facture_id: '3', fournisseur: 'beton exemple sarl', montant_ht: 50 }),
    ]
    const p = K.pareto(l, 'fournisseurs')
    expect(p.length).toBe(1); expect(p[0]).toMatchObject({ nom: 'Béton Exemple SARL', montant_ht: 350 })
  })
})
// Les tests H1 et H2 (hauteur du cadre Metabase) ne sont pas portés : l'écran Metabase n'existe pas dans l'OS (les graphiques sont dessinés par ECharts, sans cadre).
