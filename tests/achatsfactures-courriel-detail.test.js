import { describe, test } from 'node:test'
import { expect, espion } from './_expect-achatsfactures.js'
import { champOuTiret, estPdf, lirePiecesJointes, tailleLisible, typeLisible } from '../js/modules/achatsfactures/courriel.js'

describe('courriel complet : mise en forme', () => {
  test('taille lisible', () => {
    expect(tailleLisible(850)).toBe('850 o')
    expect(tailleLisible(12698)).toBe('12,4 Ko')
    expect(tailleLisible(1258291)).toBe('1,2 Mo')
    expect(tailleLisible(null)).toBe('')
    expect(tailleLisible(-5)).toBe('')
    expect(tailleLisible('12')).toBe('')
  })
  test('type lisible et PDF', () => {
    expect(typeLisible('application/pdf', 'a.bin')).toBe('PDF')
    expect(typeLisible(null, 'Facture.PDF')).toBe('PDF')
    expect(typeLisible('image/png', 'x.png')).toBe('Image PNG')
    expect(typeLisible('image/heic', 'x')).toBe('Image')
    expect(typeLisible(null, null)).toBe('Fichier')
    expect(estPdf({ nom: 'a.pdf', type: null })).toBe(true)
    expect(estPdf({ nom: 'a', type: 'application/pdf' })).toBe(true)
    expect(estPdf({ nom: 'a.png', type: 'image/png' })).toBe(false)
  })
  test('pièces jointes mal formées : jamais d’erreur', () => {
    expect(lirePiecesJointes(null)).toEqual([])
    expect(lirePiecesJointes('abc')).toEqual([])
    expect(lirePiecesJointes({ nom: 'a' })).toEqual([])
    expect(lirePiecesJointes([null, 3, 'x', [1]])).toEqual([])
    expect(lirePiecesJointes([{ nom: 'a.pdf', type: 'application/pdf', taille: 10, chemin: 'secret/a' }])).toEqual([{ nom: 'a.pdf', type: 'application/pdf', taille: 10 }])
    expect(lirePiecesJointes([{ taille: 'x' }])).toEqual([{ nom: 'Sans nom', type: null, taille: null }])
  })
  test('libellés vides : tiret', () => {
    expect(champOuTiret(null)).toBe('—')
    expect(champOuTiret('  ')).toBe('—')
    expect(champOuTiret(' Jean ')).toBe('Jean')
  })
})
