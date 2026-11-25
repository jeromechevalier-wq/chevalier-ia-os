// Module Articles : comparaison des prix dans la fenêtre « Association », convertie du dépôt d'origine SANS changer les cas ni les valeurs.
import { describe, it } from 'node:test'
import { expect } from './fixtures/achats/attendre.js'
import { STATS_VIDES, } from '../js/modules/achatsarticles/logique.js'
import { comparerPrix, texteComparaison, } from '../js/modules/achatsarticles/association.js'

const x = (id, prix) => ({
  article: { id, fournisseur_id: 'f', reference: id, designation: id, unite: 'sac', fournisseurs: { nom: 'ALPHA' } },
  fournisseur: 'ALPHA', stats: { ...STATS_VIDES, nbLignes: 1, dernierPrix: prix },
})
const s = (...k) => Object.fromEntries(k.map((v, i) => [`a${i + 1}`, { coche: Array.isArray(v) ? v[1] : true, coefficient: Array.isArray(v) ? v[0] : v }]))
const sans = (c) => texteComparaison(c, 'u').replace(/\s/g, ' ')

describe('comparaison des prix', () => {
  it('deux prix différents : le moins cher est marqué, écart 0,10 € soit 1,8 %', () => {
    const c = comparerPrix([x('a1', 5.72), x('a2', 5.62)], s('1', '1'))
    expect(c.moinsChers).toEqual(['a2'])
    expect(c.egal).toBe(false)
    expect(c.ecart).toBeCloseTo(0.1, 6)
    expect(sans(c)).toBe('Écart entre le moins cher et le plus cher : 0,10 € par u, soit 1,8 %')
  })
  it('égalité : tous sont « le moins cher » et le texte dit même prix', () => {
    const c = comparerPrix([x('a1', 5.62), x('a2', 5.62)], s('1', '1'))
    expect(c.moinsChers).toEqual(['a1', 'a2'])
    expect(c.egal).toBe(true)
    expect(texteComparaison(c, 'u')).toBe('Même prix pour tous les articles.')
  })
  it('trois articles : écart entre le plus bas et le plus haut', () => {
    const c = comparerPrix([x('a1', 6), x('a2', 5), x('a3', 5.5)], s('1', '1', '1'))
    expect(c.moinsChers).toEqual(['a2'])
    expect(c.ecart).toBeCloseTo(1, 6)
    expect(c.pourcent).toBeCloseTo(20, 6)
    expect(sans(c)).toBe('Écart entre le moins cher et le plus cher : 1,00 € par u, soit 20,0 %')
  })
  it('deux articles à égalité et un plus cher : les deux premiers ont le badge', () => {
    const c = comparerPrix([x('a1', 5), x('a2', 5), x('a3', 6)], s('1', '1', '1'))
    expect(c.moinsChers).toEqual(['a1', 'a2'])
  })
  it('coefficient différent de 1 : le prix est ramené à l’unité de l’article interne (même formule que le message de prix)', () => {
    // 10 € avec coefficient 0,5 = 5 € ; 6 € avec coefficient 1 = 6 €
    const c = comparerPrix([x('a1', 10), x('a2', 6)], s('0,5', '1'))
    expect(c.moinsChers).toEqual(['a1'])
    expect(c.ecart).toBeCloseTo(1, 6)
  })
  it('un article sans prix ou sans coefficient valide est ignoré (ni badge ni compte)', () => {
    const c = comparerPrix([x('a1', 5), x('a2', null), x('a3', 4), x('a4', 3)], s('1', '1', '1', 'abc'))
    expect(c.moinsChers).toEqual(['a3'])
    expect(comparerPrix([x('a1', 5), x('a2', 3)], s('1', ''))).toBeNull()
  })
  it('moins de deux articles comparables : rien', () => {
    expect(comparerPrix([x('a1', 5)], s('1'))).toBeNull()
    expect(comparerPrix([x('a1', 5), x('a2', null)], s('1', '1'))).toBeNull()
    expect(comparerPrix([], {})).toBeNull()
  })
  it('les articles décochés sont ignorés ; recalcul en direct quand on coche ou change un coefficient', () => {
    const xs = [x('a1', 5), x('a2', 4), x('a3', 6)]
    expect(comparerPrix(xs, s('1', ['1', false], '1')) .moinsChers).toEqual(['a1'])
    expect(comparerPrix(xs, s('1', ['1', false], ['1', false]))).toBeNull()
    expect(comparerPrix(xs, s('0,5', '1', '1')) .moinsChers).toEqual(['a1'])
  })
})
