// Ports de « explications.test.ts » (11 cas) et « separateur.test.ts » (4 cas) de l'appli BTP : mêmes cas, mêmes valeurs ; noms et numéros fictifs.
// Différences de forme avec l'appli d'origine : `controlerFacture` reçoit aussi l'identité de l'espace (IDENT, fictive) et ses listes sont dans l'ordre (même fournisseur, IBAN ailleurs, lignes, IBAN confirmés) .
import { describe, test } from 'node:test'
import { expect } from './_expect-achatsfactures.js'
import { IDENT, IBAN_D, IBAN_E } from './_donnees-achatsfactures.js'
import { ACTIFS, BIENTOT, EXPLICATIONS, AVERTISSEMENT_COURT, AVERTISSEMENT_LONG, INFO_COMPTE } from '../js/modules/achatsfactures/explications.js'
import { CONTROLES_BIENTOT, controlerFacture } from '../js/modules/achatsfactures/controles.js'
import { bornerPart, lirePartMemorisee, partDepuisPosition, PART_DEFAUT } from '../js/modules/achatsfactures/separateur.js'

const SIREN_AUTRE = '12345670' + '2' // 9 chiffres ; sa clé de Luhn n'a pas d'importance ici (fournisseur d'une autre facture)
const vide = { nom: null, siret: null, siren: null, adresse: null }
const extraction = {
  fournisseur: { ...vide, nom: 'Matériaux Exemple', siret: IDENT.siret },
  destinataire: { ...vide, nom: IDENT.nom, siret: IDENT.siret, siren: IDENT.siren },
  numero: 'F1', date_facture: '2026-11-18', montant_ht: 100, montant_tva: 20, montant_ttc: 120, devise: 'EUR',
  annuaire: { interroge: true, disponible: true, trouve: true, actif: true, denomination: 'MATERIAUX EXEMPLE' },
  iban: IBAN_D,
}
const liee = (o) => ({ id: 'z', statut: 'acceptee', numero: 'Z', numero_normalise: 'Z', montant_ttc: 1, date_facture: '2026-01-01', fournisseur: 'X', fournisseur_siren: IDENT.siren, iban_normalise: IBAN_D, email_expediteur: 'a@exemple.example', ...o })
const controler = (f, memes, ailleurs, lignes, confirmes) => controlerFacture(f, memes, ailleurs, lignes, confirmes, IDENT)

// A1 à A4 : les neuf contrôles actifs sont les mêmes dans le calcul, la liste « Nos contrôles anti-arnaque » et les « i ».
describe('A1 : les contrôles actifs sont cohérents partout', () => {
  const calcules = controler({ extraction, extraction_erreur: null, lignes_etat: 'non_lues', email_expediteur: 'a@exemple.example' }, [liee({})], [], [], [])
  test('A1a : les identifiants du calcul, de la fenêtre « Nos contrôles » et des « i » sont les mêmes, dans le même ordre', () => {
    expect(calcules.map((c) => c.id)).toEqual(ACTIFS.map((a) => a.id))
    expect(Object.keys(EXPLICATIONS).sort()).toEqual(ACTIFS.map((a) => a.id).sort())
  })
  test('A1b : les titres de la fenêtre sont ceux affichés sur la facture', () => {
    expect(calcules.map((c) => c.titre)).toEqual(ACTIFS.map((a) => a.titre))
  })
  test('A1c : la liste validée (8 contrôles) plus « Lignes » = 9 actifs, dont les 4 contrôles de l’IBAN et de l’adresse d’envoi', () => {
    expect(ACTIFS).toHaveLength(9)
    for (const id of ['iban', 'iban-historique', 'iban-partage', 'adresse-envoi']) expect(ACTIFS.map((a) => a.id)).toContain(id)
  })
  test('A1d : chaque contrôle a ses quatre textes, non vides', () => {
    for (const a of ACTIFS) for (const champ of ['quoi', 'cas', 'limite', 'faire']) expect(EXPLICATIONS[a.id][champ].trim().length).toBeGreaterThan(20)
  })
})

describe('A2 : les trois contrôles « Bientôt » restent grisés (décision du 22/11/2026)', () => {
  test('A2a : la fenêtre et l’écran Examiner listent les mêmes trois contrôles, dans le même ordre', () => {
    expect(BIENTOT.map((b) => b.titre)).toEqual(['Taux de TVA', 'Dates', 'N° de TVA intracommunautaire'])
    expect(CONTROLES_BIENTOT.map((c) => c.titre)).toEqual(BIENTOT.map((b) => b.titre))
  })
  test('A2b : ils sont tous « indisponible » (grisés), jamais calculés', () => {
    expect(CONTROLES_BIENTOT.every((c) => c.etat === 'indisponible')).toBe(true)
  })
})

describe('A3 : vocabulaire des textes affichés au client', () => {
  const textes = [
    ...ACTIFS.map((a) => a.titre),
    ...Object.values(EXPLICATIONS).flatMap((e) => [e.quoi, e.cas, e.limite, e.faire]),
    AVERTISSEMENT_LONG, AVERTISSEMENT_COURT, INFO_COMPTE,
  ]
  test('A3a : jamais « fraude », « arnaque » ni « facture sûre » dans un titre de contrôle ni dans un texte d’explication', () => {
    for (const t of textes) expect(t).not.toMatch(/fraude|arnaque|escroc|sûre\b/i)
  })
  test('A3b : aucun chiffre de statistique (pourcentage) dans les explications', () => {
    for (const e of Object.values(EXPLICATIONS)) for (const t of [e.quoi, e.cas, e.limite, e.faire]) expect(t).not.toMatch(/\d\s*%/)
  })
  test('A3c : les phrases calculées des contrôles ne disent jamais « fraude », « arnaque » ni « sûre », dans aucun état', () => {
    const cas = [
      controler({ extraction: null, extraction_erreur: null, lignes_etat: 'non_lues' }, [], [], [], []),
      controler({ extraction: { ...extraction, iban: IBAN_E.slice(0, -2) + '91' }, extraction_erreur: null, email_expediteur: 'x@exemple.example' }, [liee({ iban_normalise: IBAN_E, email_expediteur: 'a@exemple.example' })], [liee({ fournisseur_siren: SIREN_AUTRE })], [], []),
      controler({ extraction, extraction_erreur: 'pdf_trop_gros', lignes_etat: 'non_lues' }, null, null, null, []),
    ].flat()
    for (const c of cas) expect(`${c.titre} ${c.phrase}`).not.toMatch(/fraude|arnaque|escroc|sûre\b/i)
  })
  test('A3d : les avertissements invitent à appeler le fournisseur sur un numéro connu', () => {
    expect(AVERTISSEMENT_LONG).toMatch(/aide, pas une garantie/)
    expect(AVERTISSEMENT_COURT).toMatch(/aide, pas une garantie/)
    expect(AVERTISSEMENT_LONG).toMatch(/numéro que tu connais/)
  })
})

describe('A4 : le tutoiement', () => {
  test('A4 : aucun texte d’explication ne vouvoie', () => {
    for (const e of Object.values(EXPLICATIONS)) for (const t of [e.quoi, e.cas, e.limite, e.faire]) expect(t).not.toMatch(/\b(vous|votre|vos|appelez|vérifiez|demandez)\b/i)
  })
})

describe('séparateur facture / vérifications', () => {
  test('borne entre 30 % et 75 %', () => {
    expect(bornerPart(10, 1440)).toBe(30)
    expect(bornerPart(95, 1440)).toBe(75)
    expect(bornerPart(50, 1440)).toBe(50)
  })
  test('garde 320 px aux vérifications sur un écran étroit', () => {
    const p = bornerPart(75, 900)
    expect((900 * (100 - p)) / 100 - 12).toBeGreaterThanOrEqual(319)
  })
  test('valeur invalide : proportion par défaut', () => {
    expect(bornerPart(NaN, 1440)).toBe(PART_DEFAUT)
    expect(lirePartMemorisee(null)).toBe(PART_DEFAUT)
    expect(lirePartMemorisee('abc')).toBe(PART_DEFAUT)
    expect(lirePartMemorisee('45')).toBe(45)
    expect(lirePartMemorisee('5')).toBe(30)
  })
  test('position de la souris vers proportion', () => {
    expect(partDepuisPosition(100 + 720, 100, 1440)).toBe(50)
    expect(partDepuisPosition(0, 100, 1440)).toBe(30)
  })
})
