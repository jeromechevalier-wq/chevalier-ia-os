import { describe, test } from 'node:test'
import { expect, espion } from './_expect-achatsfactures.js'
import { courrielAffichable, LONGUEUR_MAX_MESSAGE, preparerMessage } from '../js/modules/achatsfactures/courriel.js'

describe('préparer le message de l’expéditeur', () => {
  test('vide, espaces ou absent : rien à afficher', () => {
    expect(preparerMessage(null)).toBeNull()
    expect(preparerMessage(undefined)).toBeNull()
    expect(preparerMessage('')).toBeNull()
    expect(preparerMessage('  \n\r\n  ')).toBeNull()
    expect(preparerMessage(42)).toBeNull()
  })
  test('garde les retours à la ligne et réduit les lignes vides en trop', () => {
    expect(preparerMessage('Bonjour\r\nVoici la facture.\r\n\r\n\r\n\r\nMerci')).toBe('Bonjour\nVoici la facture.\n\nMerci')
  })
  test('très long : coupé avec des points de suspension', () => {
    const t = preparerMessage('a'.repeat(LONGUEUR_MAX_MESSAGE + 500))
    expect(t.length).toBe(LONGUEUR_MAX_MESSAGE + 1)
    expect(t.endsWith('…')).toBe(true)
  })
  test('caractères spéciaux : le HTML reste du texte brut, rien n’est transformé ni interprété', () => {
    const brut = '<script>alert(1)</script> <b>gras</b> & "guillemets" é à €'
    expect(preparerMessage(brut)).toBe(brut)
  })
  test('retire les caractères de contrôle', () => {
    expect(preparerMessage('a\u0000b\u0007c')).toBe('abc')
  })
  test('courrielAffichable : faux sans texte', () => {
    expect(courrielAffichable(null)).toBe(false)
    expect(courrielAffichable({ corps_texte: ' ' })).toBe(false)
    expect(courrielAffichable({ corps_texte: 'Bonjour' })).toBe(true)
  })
})

