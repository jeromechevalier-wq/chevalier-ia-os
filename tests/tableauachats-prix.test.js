import { describe, it } from 'node:test'
import { expect } from './_expect-tableauachats.js'
import { FILTRES_PAR_ONGLET, appliquerChangement, memoireParDefaut, reinitialiser } from '../js/modules/tableauachats/filtrage.js'
import { ORDRE_PRIX_LIGNES, SEUIL_VARIATION, enBase100, enHausse, fenetre12Mois, seriesDuGraphique, variationNulle } from '../js/modules/tableauachats/prix.js'
import { achatsDe, agenceDe, chantierDe, correspond, evolutionArticles, filtrerArticles, filtrerLignesPrix, memeReference, pontDe, seriePrix, seriesParAgence, trierArticles,                                                  } from '../js/modules/tableauachats/prix.js'
import * as O from '../js/modules/tableauachats/options.js'
import { formater } from '../js/modules/tableauachats/formats.js'

let n = 0
const L = (o                    )            => ({ ligne_id: `l${++n}`, facture_id: 'f1', numero: 'F-1', date_prix: '2026-06-01', fournisseur: 'Aciers du Sud', etablissement_id: 'e1', nom_agence: 'Agence Nord', ville: 'Ville A',
  chantier_id: 'c1', chantier: 'Maison', article_fournisseur_id: 'a1', reference_fournisseur: 'HA10', designation: 'Acier HA 10 barre 6 m', unite: 'kg', unite_normalisee: 'kg', quantite: 1, montant_ht: 100, prix_net: 100,
  article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, prix_unite_reference: null, rapproche: false, origine_rapprochement: null, ...o })
const A = (o                           )                   => ({ article_fournisseur_id: 'a1', fournisseur: 'Aciers du Sud', reference_fournisseur: 'HA10', designation: 'Acier HA 10 barre 6 m', unite: 'kg',
  article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, rapproche: false, origine_rapprochement: null, ...o })
const COULEURS             = { panneau: '#222', texte: '#fff', texte2: '#aaa', bordure: '#333', accent: '#ec0', serie: '#6af', bon: '#6d9', attention: '#fb6', mauvais: '#f88', neutre: '#aaa', palette: ['#1', '#2', '#3'] }

describe('Prix et hausses : calculs', () => {
  it('1 : la série de prix a un point par jour ; le même jour, moyenne pondérée par les quantités', () => {
    const s = seriePrix([L({ date_prix: '2026-06-02', quantite: 1, montant_ht: 100 }), L({ date_prix: '2026-06-02', quantite: 3, montant_ht: 360 }), L({ date_prix: '2026-05-01', quantite: 2, montant_ht: 200 })])
    expect(s.map((p) => p.date)).toEqual(['2026-05-01', '2026-06-02'])
    expect(s[1].prix).toBeCloseTo(115) // (100 + 360) / (1 + 3), pas la moyenne simple de 100 et 120
    expect(s[1].nb_lignes).toBe(2); expect(s[1].quantite).toBe(4)
  })
  it('2 : variation entre le premier et le dernier jour ; non calculable avec une seule date', () => {
    const [a] = evolutionArticles([L({ date_prix: '2026-01-10', montant_ht: 100 }), L({ date_prix: '2026-03-10', montant_ht: 110 }), L({ date_prix: '2026-06-10', montant_ht: 125 })], [A({})])
    expect(a.prix_premier).toBe(100); expect(a.prix_dernier).toBe(125); expect(a.variation_pct).toBe(25)
    expect(a.date_premier).toBe('2026-01-10'); expect(a.date_dernier).toBe('2026-06-10'); expect(a.nb_achats).toBe(3); expect(a.nb_dates).toBe(3)
    expect(a.prix_min).toBe(100); expect(a.prix_max).toBe(125); expect(a.depense).toBe(335)
    const [b] = evolutionArticles([L({ date_prix: '2026-01-10' }), L({ date_prix: '2026-01-10', montant_ht: 300, quantite: 2 })], [])
    expect(b.nb_dates).toBe(1); expect(b.variation_pct).toBeNull()
  })
  it('3 : le filtre du haut (Période, Chantier) s’applique aux lignes, et les chiffres sont RECALCULÉS sur la sélection', () => {
    const lignes = [L({ date_prix: '2025-01-10', montant_ht: 100 }), L({ date_prix: '2026-02-10', montant_ht: 200, chantier: 'Garage', chantier_id: 'c2' }), L({ date_prix: '2026-06-10', montant_ht: 220 }), L({ date_prix: '2026-07-10', montant_ht: 231, chantier: null, chantier_id: null })]
    const tout = evolutionArticles(lignes, [])[0]
    expect(tout.variation_pct).toBe(131); expect(tout.nb_achats).toBe(4); expect(tout.depense).toBe(751)
    const per = filtrerLignesPrix(lignes, { periode: { type: 'periode', libelle: 'x', du: '2026-01-01', au: '2026-12-31' } })
    const a = evolutionArticles(per, [])[0]
    expect(a.nb_achats).toBe(3); expect(a.prix_premier).toBe(200); expect(a.variation_pct).toBe(15.5); expect(a.depense).toBe(651)
    expect(filtrerLignesPrix(lignes, { chantier: { type: 'liste', choix: ['Garage'] } }).map((l) => l.date_prix)).toEqual(['2026-02-10'])
    expect(filtrerLignesPrix(lignes, { chantier: { type: 'liste', choix: ['Sans chantier'] } }).map((l) => l.date_prix)).toEqual(['2026-07-10'])
    expect(chantierDe({ chantier: '' })).toBe('Sans chantier')
    expect(filtrerLignesPrix(lignes, { periode: { type: 'periode', libelle: 'x', du: '2030-01-01', au: null } })).toEqual([])
  })
  it('4 : filtre Fournisseur par nom (sans casse ni accents) et filtre Agence', () => {
    const lignes = [L({}), L({ fournisseur: 'BÉTON  Provence', article_fournisseur_id: 'a2' }), L({ etablissement_id: 'e2', nom_agence: 'Agence Sud', ville: 'Ville B' }), L({ etablissement_id: null, nom_agence: null, ville: null })]
    expect(filtrerLignesPrix(lignes, {}, { fournisseurs: ['béton provence'] }).length).toBe(1)
    expect(filtrerLignesPrix(lignes, {}, { fournisseurs: [] }).length).toBe(4)
    expect(agenceDe(lignes[2])).toBe('Agence Sud (Ville B)'); expect(agenceDe(lignes[3])).toBe('Sans agence')
    expect(agenceDe({ etablissement_id: 'e', nom_agence: 'Dépôt de Ville B', ville: 'Ville B' })).toBe('Dépôt de Ville B')
    expect(filtrerLignesPrix(lignes, {}, { agences: ['Agence Sud (Ville B)'] }).length).toBe(1)
  })
  it('5 : signaux « agences différentes », « peu de données » (moins de 3 achats) et « unités différentes »', () => {
    const [a] = evolutionArticles([L({}), L({ etablissement_id: 'e2', unite_normalisee: 't' })], [])
    expect(a.agences_differentes).toBe(true); expect(a.nb_agences).toBe(2); expect(a.unites_differentes).toBe(true); expect(a.peu_de_donnees).toBe(true)
    const [b] = evolutionArticles([L({}), L({}), L({ etablissement_id: null })], [])
    expect(b.agences_differentes).toBe(false); expect(b.nb_agences).toBe(1) // une facture sans agence ne compte pas comme une agence
    expect(b.unites_differentes).toBe(false); expect(b.peu_de_donnees).toBe(false)
  })
  it('6 : tri par défaut = poids en euros (dépense décroissante) ; tri cliquable, vides à la fin', () => {
    const lignes = [L({ article_fournisseur_id: 'petit', designation: 'Vis', montant_ht: 10 }), L({ article_fournisseur_id: 'gros', designation: 'Béton', montant_ht: 900, date_prix: '2026-01-01' }), L({ article_fournisseur_id: 'gros', designation: 'Béton', montant_ht: 990, date_prix: '2026-02-01' }), L({ article_fournisseur_id: 'moyen', designation: 'Acier', montant_ht: 500 })]
    const a = evolutionArticles(lignes, [])
    expect(a.map((x) => x.article_fournisseur_id)).toEqual(['gros', 'moyen', 'petit'])
    expect(trierArticles(a, { cle: 'designation', sens: 'asc' }).map((x) => x.designation)).toEqual(['Acier', 'Béton', 'Vis'])
    expect(trierArticles(a, { cle: 'variation_pct', sens: 'asc' }).map((x) => x.article_fournisseur_id)).toEqual(['gros', 'moyen', 'petit']) // sans variation : à la fin, par dépense
    expect(trierArticles(a, { cle: 'variation_pct', sens: 'desc' })[0].article_fournisseur_id).toBe('gros')
  })
  it('7 : recherche sans accents ni casse sur désignation, référence et fournisseur (« HA10 » trouve « HA 10 »)', () => {
    const a = { designation: 'Acier HA 10 barre 6 m', reference_fournisseur: 'REF-778', fournisseur: 'Aciéries Générales' }
    expect(correspond(a, 'ha10')).toBe(true); expect(correspond(a, 'HA 10')).toBe(true); expect(correspond(a, 'acieries')).toBe(true)
    expect(correspond(a, 'ref-778')).toBe(true); expect(correspond(a, 'barre generales')).toBe(true); expect(correspond(a, '  ')).toBe(true)
    expect(correspond(a, 'ha12')).toBe(false); expect(correspond(a, 'acier ciment')).toBe(false)
  })
  it('8 : « hausses seulement » et « cacher peu de données »', () => {
    const lignes = [
      L({ article_fournisseur_id: 'hausse', date_prix: '2026-01-01', montant_ht: 100 }), L({ article_fournisseur_id: 'hausse', date_prix: '2026-02-01', montant_ht: 105 }), L({ article_fournisseur_id: 'hausse', date_prix: '2026-03-01', montant_ht: 110 }),
      L({ article_fournisseur_id: 'baisse', date_prix: '2026-01-01', montant_ht: 100 }), L({ article_fournisseur_id: 'baisse', date_prix: '2026-02-01', montant_ht: 90 }),
      L({ article_fournisseur_id: 'seul' }),
    ]
    const a = evolutionArticles(lignes, [])
    expect(filtrerArticles(a, { haussesSeulement: true }).map((x) => x.article_fournisseur_id)).toEqual(['hausse'])
    expect(filtrerArticles(a, { cacherPeuDeDonnees: true }).map((x) => x.article_fournisseur_id)).toEqual(['hausse'])
    expect(filtrerArticles(a, {}).length).toBe(3)
    expect(filtrerArticles(a, { recherche: 'introuvable' })).toEqual([])
  })
  it('9 : les lignes sans article sont exclues du tableau ; les attributs viennent de la vue, les chiffres des lignes', () => {
    const a = evolutionArticles([L({ article_fournisseur_id: null }), L({ designation: 'écrit sur la ligne', reference_fournisseur: null })], [A({ designation: 'Nom de la fiche', reference_fournisseur: 'R1' })])
    expect(a.length).toBe(1); expect(a[0].designation).toBe('Nom de la fiche'); expect(a[0].reference_fournisseur).toBe('R1'); expect(a[0].nb_achats).toBe(1)
    expect(evolutionArticles([], [A({})])).toEqual([])
  })
  it('10 : article rapproché : prix en unité de référence et comparaison avec les autres fournisseurs du même article de référence', () => {
    const lignes = [L({ article_fournisseur_id: 'a1', montant_ht: 50 }), L({ article_fournisseur_id: 'a2', fournisseur: 'Autre', montant_ht: 2 }), L({ article_fournisseur_id: 'a3', fournisseur: 'Tiers', montant_ht: 3 }), L({ article_fournisseur_id: 'a4' })]
    const attr = [A({ article_fournisseur_id: 'a1', rapproche: true, origine_rapprochement: 'valide', article_reference_id: 'r1', libelle_reference: 'Gaine', unite_reference: 'm', coefficient: 0.02 }),
      A({ article_fournisseur_id: 'a2', rapproche: true, origine_rapprochement: 'automatique', article_reference_id: 'r1', coefficient: 1 }), A({ article_fournisseur_id: 'a3', rapproche: true, origine_rapprochement: 'valide', article_reference_id: 'r2', coefficient: 1 }), A({ article_fournisseur_id: 'a4' })]
    const a = evolutionArticles(lignes, attr), a1 = a.find((x) => x.article_fournisseur_id === 'a1') , a4 = a.find((x) => x.article_fournisseur_id === 'a4') 
    expect(a1.prix_dernier_reference).toBeCloseTo(1) // une couronne de 50 m à 50 € : 1 € le mètre (coefficient 0,02)
    expect(a1.origine_rapprochement).toBe('valide'); expect(a4.rapproche).toBe(false); expect(a4.prix_dernier_reference).toBeNull()
    expect(memeReference(a, a1).map((x) => x.article_fournisseur_id)).toEqual(['a2'])
    expect(memeReference(a, a1)[0].origine_rapprochement).toBe('automatique')
    expect(memeReference(a, a4)).toEqual([])
  })
  it('11 : pont automatique d’un article (appliqué ou seulement proposé) et détail des achats du plus récent au plus ancien', () => {
    const ponts         = [{ article_source_id: 'a1', article_cible_id: 'a9', fournisseur: 'X', designation: 'D', reference_cible: 'R9', motif: 'Même fournisseur, même désignation', origine: 'automatique', cible_rapprochee: false, source_rapprochee: false, applique: false, libelle_reference: null }]
    expect(pontDe(ponts, 'a1')?.applique).toBe(false); expect(pontDe(ponts, 'a2')).toBeNull()
    const lignes = [L({ date_prix: '2026-01-01' }), L({ date_prix: '2026-03-01' }), L({ article_fournisseur_id: 'autre', date_prix: '2026-04-01' })]
    expect(achatsDe(lignes, 'a1').map((l) => l.date_prix)).toEqual(['2026-03-01', '2026-01-01'])
  })
  it('12 : une série par agence, et un graphique en lignes aligné sur toutes les dates (vide là où l’agence n’a pas acheté)', () => {
    const s = seriesParAgence([L({ date_prix: '2026-01-01', montant_ht: 100 }), L({ date_prix: '2026-02-01', montant_ht: 110 }), L({ date_prix: '2026-02-01', montant_ht: 90, etablissement_id: 'e2', nom_agence: 'Agence Sud', ville: null })])
    expect(s.map((x) => x.nom)).toEqual(['Agence Nord (Ville A)', 'Agence Sud'])
    const fen = { du: '2025-12-31', au: '2026-12-31' }
    const b = enBase100(s, fen)
    const o = O.prixOption(b.series, COULEURS, 'kg', fen)                                                                                                              
    expect(o.xAxis.type).toBe('time')
    expect(o.series.map((x) => x.type)).toEqual(['line', 'line'])
    expect(o.series[0].data.map((d) => Math.round(d.value[1]))).toEqual([100, 110]); expect(o.series[1].data.map((d) => d.prix)).toEqual([90])
  })
  it('12c : base 100 : le 100 est le prix le moins cher du premier jour de la fenêtre, le même pour toutes les agences ; les achats hors fenêtre sont ignorés', () => {
    const s = seriesParAgence([
      L({ date_prix: '2024-01-01', montant_ht: 50 }),
      L({ date_prix: '2026-01-10', montant_ht: 110 }), L({ date_prix: '2026-06-10', montant_ht: 121 }),
      L({ date_prix: '2026-01-10', montant_ht: 100, etablissement_id: 'e2', nom_agence: 'Agence Sud', ville: null }),
    ])
    const r = enBase100(s, { du: '2025-11-24', au: '2026-11-24' })
    expect(r.base).toBe(100)
    const nord = r.series.find((x) => x.nom === 'Agence Nord (Ville A)') , sud = r.series.find((x) => x.nom === 'Agence Sud') 
    expect(nord.points.map((p) => Math.round(p.indice))).toEqual([110, 121]); expect(sud.points.map((p) => p.indice)).toEqual([100])
    expect(enBase100(s, { du: '2030-01-01', au: '2030-12-31' })).toEqual({ base: null, series: [] })
  })
  it('12d : la fenêtre par défaut couvre les 12 derniers mois', () => {
    expect(fenetre12Mois(new Date(2026, 10, 24))).toEqual({ du: '2025-11-24', au: '2026-11-24' })
  })
  it('12b : un prix à l’unité garde ses décimales utiles ; une quantité n’est pas arrondie à l’entier', () => {
    expect(formater(0.0185, 'prix')).toMatch(/^0,0185\s€$/); expect(formater(1.1, 'prix')).toMatch(/^1,10\s€$/); expect(formater(118.456, 'prix')).toMatch(/^118,46\s€$/)
    expect(formater(12.5, 'decimal2')).toBe('12,5'); expect(formater(null, 'prix')).toBe('')
  })
  it('14 : lecture : les lignes les plus récentes d’abord (au plafond, ce sont les plus anciennes qui manquent) ; la lecture par pages (plafond dit, jamais en silence) est celle de la couche d’accès de l’OS, testée ailleurs', () => {
    expect(ORDRE_PRIX_LIGNES).toEqual([{ col: 'date_prix', asc: false }, { col: 'ligne_id', asc: true }])
  })
  it('15 : même seuil de hausse partout (0,05 %) : affichage « = 0 % », filtre « hausses seulement » et compteur', () => {
    expect(SEUIL_VARIATION).toBe(0.05)
    expect(enHausse({ variation_pct: 0.04 })).toBe(false); expect(variationNulle(0.04)).toBe(true); expect(variationNulle(-0.04)).toBe(true)
    expect(enHausse({ variation_pct: 0.05 })).toBe(true); expect(variationNulle(0.05)).toBe(false)
    expect(enHausse({ variation_pct: -3 })).toBe(false); expect(variationNulle(-3)).toBe(false); expect(enHausse({ variation_pct: null })).toBe(false)
    const lignes = [L({ article_fournisseur_id: 'infime', date_prix: '2026-01-01', quantite: 10000, montant_ht: 10000 }), L({ article_fournisseur_id: 'infime', date_prix: '2026-02-01', quantite: 10000, montant_ht: 10004 }),
      L({ article_fournisseur_id: 'vraie', date_prix: '2026-01-01', montant_ht: 100 }), L({ article_fournisseur_id: 'vraie', date_prix: '2026-02-01', montant_ht: 101 })]
    const a = evolutionArticles(lignes, [])
    expect(a.find((x) => x.article_fournisseur_id === 'infime') .variation_pct).toBe(0.04)
    expect(filtrerArticles(a, { haussesSeulement: true }).map((x) => x.article_fournisseur_id)).toEqual(['vraie'])
    expect(a.filter(enHausse).length).toBe(1)
  })
  it('16 : graphique : une courbe par agence seulement si l’article a des agences différentes (une facture sans agence ne fait pas une deuxième courbe)', () => {
    const uneAgence = [L({ date_prix: '2026-01-01' }), L({ date_prix: '2026-02-01', etablissement_id: null, nom_agence: null, ville: null })]
    const [a] = evolutionArticles(uneAgence, [])
    expect(a.agences_differentes).toBe(false)
    expect(seriesDuGraphique(uneAgence, a.agences_differentes).map((x) => x.nom)).toEqual(['Prix net'])
    expect(seriesDuGraphique(uneAgence, a.agences_differentes)[0].points.length).toBe(2)
    const deux = [L({ date_prix: '2026-01-01' }), L({ date_prix: '2026-02-01', etablissement_id: 'e2', nom_agence: 'Agence Sud', ville: null })]
    const [b] = evolutionArticles(deux, [])
    expect(seriesDuGraphique(deux, b.agences_differentes).map((x) => x.nom).sort()).toEqual(['Agence Nord (Ville A)', 'Agence Sud'])
  })
  it('13 : l’onglet « prix » a les filtres Période et Chantier, partagés avec les autres onglets', () => {
    expect(FILTRES_PAR_ONGLET.prix).toEqual(['periode', 'chantier'])
    const m = memoireParDefaut('2026-11-23')
    expect(m.prix.periode).toEqual(m.pilotage.periode) // 12 mois glissants par défaut
    const m2 = appliquerChangement(m, 'prix', { ...m.prix, chantier: { type: 'liste', choix: ['Garage'] } })
    expect(m2.pilotage.chantier).toEqual({ type: 'liste', choix: ['Garage'] }); expect(m2.liste.chantier).toEqual({ type: 'liste', choix: ['Garage'] }); expect(m2.dirigeant.chantier).toBeUndefined()
    expect(reinitialiser(m2, 'prix', '2026-11-23').prix).toEqual(m.prix)
  })
})
