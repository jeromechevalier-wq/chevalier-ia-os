import { describe, it } from 'node:test'
import { expect } from './_expect-tableauachats.js'
import { FILTRES_PAR_ONGLET, appliquerChangement, memoireParDefaut, reinitialiser } from '../js/modules/tableauachats/filtrage.js'
import { filtrerLignesPrix,                                       } from '../js/modules/tableauachats/prix.js'
import { FOURNISSEUR_INCONNU, SANS_DESIGNATION, TOP_GRAPHIQUE, TRI_LIGNES_DEFAUT, cleArticle, enLigneAchat, filtrerAchats, listeFournisseurs, rapprochementDe, regrouperAchats, topGroupes, totalAchats, trierAchats } from '../js/modules/tableauachats/lignes.js'
import * as O from '../js/modules/tableauachats/options.js'

let n = 0
const L = (o                    )            => ({ ligne_id: `l${String(++n).padStart(4, '0')}`, facture_id: 'f1', numero: 'F-1', date_prix: '2026-06-01', fournisseur: 'Aciers du Sud', etablissement_id: 'e1', nom_agence: 'Agence Nord', ville: 'Ville A',
  chantier_id: 'c1', chantier: 'Maison', article_fournisseur_id: 'a1', reference_fournisseur: 'HA10', designation: 'Acier HA 10 barre 6 m', unite: 'kg', unite_normalisee: 'kg', quantite: 1, montant_ht: 100, prix_net: 100,
  article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, prix_unite_reference: null, rapproche: false, origine_rapprochement: null, ...o })
const achats = (ls             , fiches                                ) => ls.map((l) => enLigneAchat(l, fiches))
const COULEURS             = { panneau: '#222', texte: '#fff', texte2: '#aaa', bordure: '#333', accent: '#ec0', serie: '#6af', bon: '#6d9', attention: '#fb6', mauvais: '#f88', neutre: '#aaa', palette: ['#1', '#2', '#3'] }

describe('Lignes et articles : calculs', () => {
  it('1 : une ligne de facture devient une ligne du tableau (noms prêts, prix net = montant / quantité)', () => {
    const a = enLigneAchat(L({ quantite: 4, montant_ht: 460, prix_net: 999, numero: null, chantier: null, chantier_id: null, etablissement_id: null, fournisseur: ' ', designation: null, reference_fournisseur: null, unite: null, article_fournisseur_id: null }))
    expect(a.prix_net).toBe(115) // recalculé, jamais la valeur lue
    expect(a.chantier).toBe('Sans chantier'); expect(a.agence).toBe('Sans agence'); expect(a.fournisseur).toBe(FOURNISSEUR_INCONNU)
    expect(a.designation).toBe(''); expect(a.nom_article).toBe(SANS_DESIGNATION); expect(a.numero).toBe(''); expect(a.unite).toBe('')
    expect(enLigneAchat(L({ nom_agence: 'Dépôt', ville: 'Ville B' })).agence).toBe('Dépôt (Ville B)')
  })
  it('2 : rapprochement : Validé, Automatique ou Aucun ; une ligne non rapprochée est toujours « Aucun »', () => {
    expect(rapprochementDe('valide')).toBe('Validé'); expect(rapprochementDe('automatique')).toBe('Automatique'); expect(rapprochementDe(null)).toBe('Aucun')
    expect(enLigneAchat(L({ rapproche: true, article_reference_id: 'r1', origine_rapprochement: 'automatique' })).rapprochement).toBe('Automatique')
    const incoherente = enLigneAchat(L({ rapproche: false, origine_rapprochement: 'valide' }))
    expect(incoherente.rapprochement).toBe('Aucun'); expect(incoherente.origine).toBeNull()
  })
  it('3 : recherche libre sans casse ni accents, sur la désignation, la référence et le fournisseur ; tous les mots doivent s’y trouver', () => {
    const ls = achats([L({ designation: 'Béton C25/30 livré', reference_fournisseur: 'C2530', fournisseur: 'Béton Démo' }), L({}), L({ designation: 'Fer à béton HA 10', reference_fournisseur: 'ACI-HA10', fournisseur: 'Négoce Démo' })])
    expect(filtrerAchats(ls, { recherche: 'BETON' }).length).toBe(2) // désignation OU fournisseur, accents ignorés
    expect(filtrerAchats(ls, { recherche: 'ha10' }).length).toBe(2) // référence « HA10 » et désignation « HA 10 »
    expect(filtrerAchats(ls, { recherche: 'negoce fer' }).map((l) => l.fournisseur)).toEqual(['Négoce Démo'])
    expect(filtrerAchats(ls, { recherche: 'aciers du sud' }).length).toBe(1)
    expect(filtrerAchats(ls, { recherche: 'introuvable' })).toEqual([])
    expect(filtrerAchats(ls, { recherche: '   ' }).length).toBe(3)
  })
  it('4 : filtres Fournisseur (par nom, sans casse ni accents), Agence et Rapprochement ; une liste vide ne filtre pas', () => {
    const ls = achats([
      L({ fournisseur: 'Béton Démo', nom_agence: 'Centrale', ville: 'Ville A', etablissement_id: 'e9' }),
      L({ fournisseur: 'BETON DEMO', etablissement_id: null }),
      L({ rapproche: true, article_reference_id: 'r1', origine_rapprochement: 'valide' }),
      L({ rapproche: true, article_reference_id: 'r1', origine_rapprochement: 'automatique' }),
    ])
    expect(filtrerAchats(ls, { fournisseurs: ['béton démo'] }).length).toBe(2)
    expect(filtrerAchats(ls, { agences: ['Sans agence'] }).length).toBe(1)
    expect(filtrerAchats(ls, { agences: ['CENTRALE  (ville a)'] }).length).toBe(1) // agence comparée sans casse ni accents
    expect(filtrerAchats(ls, { agences: ['Centrale (Ville A)', 'Sans agence'] }).length).toBe(2)
    expect(filtrerAchats(ls, { rapprochements: ['Aucun'] }).length).toBe(2)
    expect(filtrerAchats(ls, { rapprochements: ['Validé', 'Automatique'] }).length).toBe(2)
    expect(filtrerAchats(ls, { rapprochements: ['Automatique'], fournisseurs: ['Béton Démo'] })).toEqual([])
    expect(filtrerAchats(ls, { fournisseurs: [], agences: [], rapprochements: [] }).length).toBe(4)
  })
  it('5 : le filtre du haut (Période, Chantier par nom) choisit les lignes AVANT les filtres de l’onglet ; les lignes sans article restent', () => {
    const brutes = [L({ date_prix: '2025-01-10' }), L({ date_prix: '2026-02-10', chantier: 'Garage', chantier_id: 'c2', article_fournisseur_id: null }), L({ date_prix: '2026-07-10', chantier: null, chantier_id: null })]
    const per = filtrerLignesPrix(brutes, { periode: { type: 'periode', libelle: 'x', du: '2026-01-01', au: '2026-12-31' } })
    expect(achats(per).map((l) => l.date_prix)).toEqual(['2026-02-10', '2026-07-10'])
    expect(achats(filtrerLignesPrix(brutes, { chantier: { type: 'liste', choix: ['Garage'] } })).map((l) => l.chantier)).toEqual(['Garage'])
    expect(achats(filtrerLignesPrix(brutes, { chantier: { type: 'liste', choix: ['Sans chantier'] } })).length).toBe(1)
    expect(filtrerLignesPrix(brutes, { chantier: { type: 'liste', choix: ['GARAGE'] } }).length).toBe(1) // chantier et agence comparés sans casse ni accents
    expect(filtrerLignesPrix(brutes, {}, { agences: ['agence nord (ville a)'] }).length).toBe(3)
  })
  it('6 : tri par défaut = montant décroissant ; tri cliquable sur chaque colonne, valeurs vides à la fin, ordre stable', () => {
    const ls = achats([L({ montant_ht: 50, date_prix: '2026-01-01', fournisseur: 'Zinc' }), L({ montant_ht: 300, date_prix: '2026-03-01', fournisseur: 'acier' }), L({ montant_ht: 300, date_prix: '2026-05-01', fournisseur: 'Béton' }), L({ montant_ht: 120, quantite: 0, fournisseur: 'Dalle' })])
    expect(TRI_LIGNES_DEFAUT).toEqual({ cle: 'montant_ht', sens: 'desc' })
    expect(trierAchats(ls).map((l) => l.montant_ht)).toEqual([300, 300, 120, 50])
    expect(trierAchats(ls).map((l) => l.date_prix).slice(0, 2)).toEqual(['2026-05-01', '2026-03-01']) // à égalité de montant : la plus récente d'abord
    expect(trierAchats(ls, { cle: 'fournisseur', sens: 'asc' }).map((l) => l.fournisseur)).toEqual(['acier', 'Béton', 'Dalle', 'Zinc'])
    expect(trierAchats(ls, { cle: 'date_prix', sens: 'asc' })[0].date_prix).toBe('2026-01-01')
    const parPrix = trierAchats(ls, { cle: 'prix_net', sens: 'asc' })
    expect(parPrix[0].prix_net).toBe(50); expect(parPrix[3].prix_net).toBeNull() // quantité 0 : pas de prix, rangé à la fin
    expect(trierAchats(ls, { cle: 'prix_net', sens: 'desc' })[3].prix_net).toBeNull()
    expect(ls.map((l) => l.montant_ht)).toEqual([50, 300, 300, 120]) // la liste d'origine n'est pas modifiée
  })
  it('7 : total de la sélection : montant, lignes, factures, fournisseurs (un nom = un fournisseur, sans casse ni accents)', () => {
    const t = totalAchats(achats([L({ montant_ht: 100.1, facture_id: 'f1' }), L({ montant_ht: 200.2, facture_id: 'f1', fournisseur: 'Béton Démo' }), L({ montant_ht: 50, facture_id: 'f2', fournisseur: 'BETON  DEMO' })]))
    expect(t.montant_ht).toBeCloseTo(350.3); expect(t.nb_lignes).toBe(3); expect(t.nb_factures).toBe(2); expect(t.nb_fournisseurs).toBe(2)
    expect(totalAchats([])).toEqual({ montant_ht: 0, nb_lignes: 0, nb_fournisseurs: 0, nb_factures: 0 })
  })
  it('8 : clé d’article : article de référence si rapproché, sinon article du fournisseur, sinon fournisseur + désignation', () => {
    expect(cleArticle(L({ rapproche: true, article_reference_id: 'r1' }))).toBe('r:r1')
    expect(cleArticle(L({ rapproche: false, article_reference_id: 'r1' }))).toBe('a:a1') // référence sans rapprochement : ignorée
    expect(cleArticle(L({ article_fournisseur_id: null, fournisseur: 'Négoce DÉMO', designation: ' Transport ' }))).toBe('d:negoce demo|transport')
    expect(cleArticle(L({ article_fournisseur_id: null, fournisseur: 'Autre', designation: 'Transport' }))).not.toBe(cleArticle(L({ article_fournisseur_id: null, fournisseur: 'Négoce Démo', designation: 'Transport' })))
  })
  it('9 : dépense par article : somme, nombre de lignes, nombre de fournisseurs, part ; le même article de référence réunit les fournisseurs', () => {
    const ls = achats([
      L({ montant_ht: 300, rapproche: true, article_reference_id: 'r1', libelle_reference: 'Acier HA 10', origine_rapprochement: 'valide' }),
      L({ montant_ht: 200, article_fournisseur_id: 'a2', fournisseur: 'Négoce Démo', designation: 'Fer HA10 botte', rapproche: true, article_reference_id: 'r1', libelle_reference: 'Acier HA 10', origine_rapprochement: 'automatique' }),
      L({ montant_ht: 400, article_fournisseur_id: 'a3', fournisseur: 'Béton Démo', designation: 'Béton C25/30', reference_fournisseur: 'C2530', date_prix: '2026-01-01' }),
      L({ montant_ht: 50, article_fournisseur_id: 'a3', fournisseur: 'Béton Démo', designation: 'Béton C25/30 livré', reference_fournisseur: 'C2530', date_prix: '2026-08-01' }),
      L({ montant_ht: 50, article_fournisseur_id: null, fournisseur: 'Béton Démo', designation: 'Transport', reference_fournisseur: null }),
    ])
    const g = regrouperAchats(ls, 'article')
    expect(g.map((x) => [x.nom, x.montant_ht, x.nb_lignes, x.nb_fournisseurs])).toEqual([['Acier HA 10', 500, 2, 2], ['Béton C25/30 livré', 450, 2, 1], ['Transport', 50, 1, 1]])
    expect(g[0].reference).toBe('Article de référence'); expect(g[0].fournisseurs).toBe('Aciers du Sud, Négoce Démo')
    expect(g[1].reference).toBe('C2530') // nom = désignation de la ligne la plus récente
    expect(g.map((x) => x.part_pct)).toEqual([50, 45, 5])
    expect(g.reduce((t, x) => t + x.montant_ht, 0)).toBe(totalAchats(ls).montant_ht) // rien n'est perdu ni compté deux fois
  })
  it('10 : dépense par chantier : « Sans chantier » est un groupe comme les autres ; tri par dépense décroissante puis par nom', () => {
    const ls = achats([L({ montant_ht: 100 }), L({ montant_ht: 150, chantier: null, chantier_id: null, fournisseur: 'Béton Démo' }), L({ montant_ht: 50, fournisseur: 'Béton Démo' }), L({ montant_ht: 150, chantier: 'Garage', chantier_id: 'c2' })])
    const g = regrouperAchats(ls, 'chantier')
    expect(g.map((x) => [x.nom, x.montant_ht, x.nb_lignes, x.nb_fournisseurs])).toEqual([['Garage', 150, 1, 1], ['Maison', 150, 2, 2], ['Sans chantier', 150, 1, 1]])
    expect(g[0].reference).toBe('')
    expect(regrouperAchats([], 'chantier')).toEqual([]); expect(regrouperAchats([], 'article')).toEqual([])
  })
  it('11 : le graphique garde les 15 plus grosses dépenses, dans l’ordre', () => {
    const ls = achats(Array.from({ length: 20 }, (_, i) => L({ article_fournisseur_id: `x${i}`, designation: `Article ${i}`, montant_ht: 10 + i })))
    const top = topGroupes(regrouperAchats(ls, 'article'))
    expect(TOP_GRAPHIQUE).toBe(15); expect(top.length).toBe(15)
    expect(top[0]).toEqual({ nom: 'Article 19', valeur: 29 }); expect(top[14]).toEqual({ nom: 'Article 5', valeur: 15 })
    expect(topGroupes(regrouperAchats(ls.slice(0, 3), 'article')).length).toBe(3)
  })
  it('12 : option du graphique en barres : une barre par groupe, la plus grosse en haut, deux noms identiques restent deux barres', () => {
    const o = O.barresHorizontales([{ nom: 'Transport', valeur: 300 }, { nom: 'Transport', valeur: 120 }], COULEURS, 'Dépense HT', (v) => `${v} €`)                                                                                                                                        
    expect(o.series[0].type).toBe('bar'); expect(o.series[0].data).toEqual([300, 120])
    expect(o.yAxis.inverse).toBe(true); expect(o.yAxis.data.map((d) => d.value)).toEqual(['1. Transport', '2. Transport'])
    expect(o.yAxis.axisLabel.width).toBe(170)
    expect((O.barresHorizontales([], COULEURS, 'x', String, 96)                                               ).yAxis.axisLabel.width).toBe(96) // téléphone : libellés plus étroits
  })
  it('14 : la recherche trouve aussi le nom de l’article de référence et celui de la fiche article (vue « Par article »)', () => {
    const fiches = new Map                          ([['a3', { article_fournisseur_id: 'a3', fournisseur: 'Béton Démo', reference_fournisseur: 'C2530', designation: 'Béton prêt à l’emploi C25/30', unite: 'm3', article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, rapproche: false, origine_rapprochement: null }]])
    const ls = achats([
      L({ designation: 'Fer HA10 botte', rapproche: true, article_reference_id: 'r1', libelle_reference: 'Acier haute adhérence 10', origine_rapprochement: 'valide' }),
      L({ article_fournisseur_id: 'a3', fournisseur: 'Béton Démo', designation: 'BPE C25', reference_fournisseur: null }),
    ], fiches)
    expect(filtrerAchats(ls, { recherche: 'haute adherence' }).map((l) => l.designation)).toEqual(['Fer HA10 botte'])
    expect(filtrerAchats(ls, { recherche: 'pret a l’emploi' }).map((l) => l.designation)).toEqual(['BPE C25'])
    expect(filtrerAchats(ls, { recherche: 'fer botte' }).length).toBe(1) // la désignation écrite sur la ligne reste cherchée
  })
  it('15 : « Par article » : un article non rapproché prend le nom et la référence de sa fiche ; un article rapproché garde son article de référence', () => {
    const fiches = new Map                          ([['a3', { article_fournisseur_id: 'a3', fournisseur: 'Béton Démo', reference_fournisseur: 'C2530', designation: 'Béton C25/30', unite: 'm3', article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, rapproche: false, origine_rapprochement: null }],
      ['a1', { article_fournisseur_id: 'a1', fournisseur: 'Aciers du Sud', reference_fournisseur: 'HA10', designation: 'Fiche acier', unite: 'kg', article_reference_id: 'r1', libelle_reference: 'Acier HA 10', unite_reference: 'kg', coefficient: 1, rapproche: true, origine_rapprochement: 'valide' }]])
    const g = regrouperAchats(achats([
      L({ montant_ht: 400, article_fournisseur_id: 'a3', designation: 'beton livre le 3', reference_fournisseur: null, date_prix: '2026-08-01' }),
      L({ montant_ht: 100, rapproche: true, article_reference_id: 'r1', libelle_reference: 'Acier HA 10', origine_rapprochement: 'valide' }),
      L({ montant_ht: 50, article_fournisseur_id: 'a9', designation: 'Sans fiche', reference_fournisseur: 'X1' }),
    ], fiches), 'article')
    expect(g.map((x) => [x.nom, x.reference])).toEqual([['Béton C25/30', 'C2530'], ['Acier HA 10', 'Article de référence'], ['Sans fiche', 'X1']])
  })
  it('16 : colonne Fournisseurs : 3 noms au plus, puis « et N autres » ; le nombre de fournisseurs reste exact', () => {
    expect(listeFournisseurs(['Zinc', 'acier', 'Béton'])).toBe('acier, Béton, Zinc')
    expect(listeFournisseurs(['D', 'C', 'B', 'A'])).toBe('A, B, C et 1 autre')
    expect(listeFournisseurs(['E', 'D', 'C', 'B', 'A'])).toBe('A, B, C et 2 autres')
    expect(listeFournisseurs([])).toBe('')
    const [g] = regrouperAchats(achats(['A', 'B', 'C', 'D', 'E'].map((f) => L({ fournisseur: f }))), 'chantier')
    expect(g.fournisseurs).toBe('A, B, C et 2 autres'); expect(g.nb_fournisseurs).toBe(5)
  })
  it('13 : l’onglet a les filtres Période et Chantier du haut, partagés avec les autres onglets', () => {
    expect(FILTRES_PAR_ONGLET.lignes).toEqual(['periode', 'chantier'])
    const m = memoireParDefaut('2026-11-24')
    expect(m.lignes.periode).toEqual(m.prix.periode) // 12 mois glissants par défaut
    const m2 = appliquerChangement(m, 'lignes', { ...m.lignes, chantier: { type: 'liste', choix: ['Garage'] } })
    expect(m2.prix.chantier).toEqual(m2.lignes.chantier); expect(m2.pilotage.chantier).toEqual(m2.lignes.chantier); expect(m2.dirigeant.chantier).toBeUndefined()
    expect(reinitialiser(m2, 'lignes', '2026-11-24').lignes).toEqual(m.lignes)
  })
})
