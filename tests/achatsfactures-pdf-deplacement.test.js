import { describe, test } from 'node:test'
import { expect, espion } from './_expect-achatsfactures.js'
import { positionApresGlissement } from '../js/modules/achatsfactures/pdf-deplacement.js'

const debut = { x: 100, y: 100, gauche: 200, haut: 300 }
const max = { x: 500, y: 900 }

describe('glisser la feuille du PDF', () => {
  test('la feuille suit la main dans les quatre directions', () => {
    expect(positionApresGlissement(debut, { x: 150, y: 100 }, max)).toEqual({ gauche: 150, haut: 300 }) // main à droite : on voit la gauche
    expect(positionApresGlissement(debut, { x: 50, y: 100 }, max)).toEqual({ gauche: 250, haut: 300 })
    expect(positionApresGlissement(debut, { x: 100, y: 160 }, max)).toEqual({ gauche: 200, haut: 240 })
    expect(positionApresGlissement(debut, { x: 100, y: 40 }, max)).toEqual({ gauche: 200, haut: 360 })
  })
  test('reste borné entre 0 et le maximum', () => {
    expect(positionApresGlissement(debut, { x: 900, y: 900 }, max)).toEqual({ gauche: 0, haut: 0 })
    expect(positionApresGlissement(debut, { x: -900, y: -2000 }, max)).toEqual({ gauche: 500, haut: 900 })
  })
  test('pas de défilement possible (zoom 100 %) : reste à 0 sur cet axe', () => {
    expect(positionApresGlissement(debut, { x: 0, y: 100 }, { x: 0, y: 900 })).toEqual({ gauche: 0, haut: 300 })
  })
  test('un simple clic (aucun mouvement) ne change rien', () => {
    expect(positionApresGlissement(debut, { x: 100, y: 100 }, max)).toEqual({ gauche: 200, haut: 300 })
  })
})

import { defilementApresZoom, estDoubleAppui, zoomApresDoubleClic } from '../js/modules/achatsfactures/pdf-deplacement.js'

describe('zoom au double-clic', () => {
  test('100 % → 200 %, puis retour à 100 %', () => {
    expect(zoomApresDoubleClic(1)).toBe(2)
    expect(zoomApresDoubleClic(0.75)).toBe(2)
    expect(zoomApresDoubleClic(2)).toBe(1)
    expect(zoomApresDoubleClic(1.25)).toBe(1)
  })
  test('le point cliqué reste sous le curseur', () => {
    // Point à 100 px du bord gauche et 50 px du haut, non défilé, zoom ×2 : le contenu sous le curseur passe de 100 à 200 px, il faut défiler de 100.
    expect(defilementApresZoom({ zoom: 1, gauche: 0, haut: 0 }, { x: 100, y: 50 }, 2, { x: 1000, y: 1000 })).toEqual({ gauche: 100, haut: 50 })
    // Déjà défilé : (300 + 100) × 2 − 100 = 700.
    expect(defilementApresZoom({ zoom: 1, gauche: 300, haut: 0 }, { x: 100, y: 0 }, 2, { x: 1000, y: 1000 }).gauche).toBe(700)
    // Retour à 100 % : on revient au contenu d'origine.
    expect(defilementApresZoom({ zoom: 2, gauche: 100, haut: 50 }, { x: 100, y: 50 }, 1, { x: 0, y: 0 })).toEqual({ gauche: 0, haut: 0 })
  })
  test('borné par le défilement maximal', () => {
    expect(defilementApresZoom({ zoom: 1, gauche: 0, haut: 0 }, { x: 600, y: 600 }, 2, { x: 300, y: 200 })).toEqual({ gauche: 300, haut: 200 })
  })
  test('double-appui au doigt : vite et au même endroit seulement', () => {
    const a = { t: 1000, x: 50, y: 50 }
    expect(estDoubleAppui(a, { t: 1200, x: 55, y: 52 })).toBe(true)
    expect(estDoubleAppui(a, { t: 1600, x: 50, y: 50 })).toBe(false)
    expect(estDoubleAppui(a, { t: 1100, x: 200, y: 50 })).toBe(false)
    expect(estDoubleAppui(null, a)).toBe(false)
  })
})

describe('zoom centré avec marge de centrage et espace entre pages', () => {
  const g = { largeur: 600, hauteurPage: 800, vue: 600, ecart: 10 }
  const grand = { x: 9999, y: 99999 }
  test('sans marge ni espace : même résultat que le rapport simple', () => {
    const sans = { ...g, ecart: 0 }
    expect(defilementApresZoom({ zoom: 1, gauche: 0, haut: 100 }, { x: 100, y: 50 }, 2, grand, sans)).toEqual(defilementApresZoom({ zoom: 1, gauche: 0, haut: 100 }, { x: 100, y: 50 }, 2, grand))
  })
  test('feuille centrée sous 100 % : la marge de gauche disparaît au zoom, le point reste sous le curseur', () => {
    // Zoom 0,5 : feuille de 300 px centrée dans 600 (marge 150). Curseur à x = 300 (milieu) → fraction 0,5 de la feuille.
    const r = defilementApresZoom({ zoom: 0.5, gauche: 0, haut: 0 }, { x: 300, y: 0 }, 1, grand, g)
    // Zoom 1 : feuille de 600, marge 0 ; le milieu (300) doit rester à x = 300 : défilement 0.
    expect(r.gauche).toBe(0)
    const r2 = defilementApresZoom({ zoom: 1, gauche: 0, haut: 0 }, { x: 150, y: 0 }, 0.5, grand, g)
    // Zoom 0,5 : marge 150, fraction 0,25 → x' = 75 + 150 = 225 sur la feuille ; le curseur est à 150 → défilement 75 (puis borné par max).
    expect(r2.gauche).toBe(75)
  })
  test('l’espace entre pages garde sa taille', () => {
    // Début de la 2e page (y = 810 au zoom 1) : au zoom 2 elle commence à 1610 ; le curseur en haut de la zone la garde en haut.
    expect(defilementApresZoom({ zoom: 1, gauche: 0, haut: 810 }, { x: 0, y: 0 }, 2, grand, g).haut).toBe(1610)
    // Dans l'espace entre deux pages (y = 805) : on reste dans l'espace (1600 + 5).
    expect(defilementApresZoom({ zoom: 1, gauche: 0, haut: 805 }, { x: 0, y: 0 }, 2, grand, g).haut).toBe(1605)
  })
  test('borné', () => {
    expect(defilementApresZoom({ zoom: 1, gauche: 0, haut: 0 }, { x: 600, y: 0 }, 2, { x: 300, y: 100 }, g).gauche).toBe(300)
  })
})
