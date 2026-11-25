// Module Achats « Factures » (25/11/2026, PR 8a) : tests de la logique pure de l'écran (recherche, filtres, tri, regroupement, totaux, pastilles de carte, vues, archivage), de l'export CSV,
// des favoris (étoiles) et des formats (dates, avoirs). Recopiés de l'appli d'origine avec LES MÊMES cas et LES MÊMES valeurs ; aucun réseau, aucune donnée réelle.
import { test, describe } from 'node:test';
import { expect, espion } from './_expect-achatsfactures.js';
import {
  CRITERES_VIDES, filtrer, lireTri, normaliser, nombreFiltres, pastillesCarte, pastillesFiltres, regrouper, retirerCritere, texteTete, totaux, trier, triApresClicColonne, valeursDeFiltre,
  dateFr, dateHeureFr, estAvoir, eurosFacture, montantSigne, dateJourFichier, DUREE_ANNULATION, MESSAGE_ERREUR_PAR_DEFAUT, annulerArchivage, archiverPuisRelire, textesArchivage,
} from '../js/modules/achatsfactures/logique.js';
import { BOM, construireCsv, ENTETES_FACTURES, facturesCsv, formaterCellule, nombreCsv, nomFichierExport, protegerFormule, TEXTE_RIEN_A_EXPORTER } from '../js/modules/achatsfactures/export-csv.js';
import { clesABasculer, creerMagasinFavoris, clesParNom, cleDeFavori, favorisDeListe, libelleEtoile, MESSAGE_ERREUR_FAVORI, ordonnerAvecFavoris, sirenDeSiret, cleEntreprise } from '../js/modules/achatsfactures/favoris.js';

{
let n = 0
const f = (o = {}) => ({
  id: `f${++n}`, fournisseur: 'Point Q', numero: 'FA-1', date_facture: '2026-11-10', montant_ht: 100, montant_tva: 20, montant_ttc: 120, statut: 'a_valider',
  motif_refus: null, date_decision: null, decide_par: null, created_at: '2026-11-10T08:00:00Z', extraction_erreur: null, acceptee_malgre_alerte: false, chantiers: null, extraction: null, fournisseur_siren: null, numero_normalise: null, iban_normalise: null, email_expediteur: null, ...o,
})

describe('recherche sans casse ni accents', () => {
  const liste = [f({ id: 'a', fournisseur: 'Électro Services', numero: 'ES-3071' }), f({ id: 'b', fournisseur: 'Würzel', chantiers: { nom: 'Maison Dupont, rénovation' } }), f({ id: 'c', fournisseur: null, numero: null })]
  test('trouve « electro » dans « Électro »', () => expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'electro' }).map((x) => x.id)).toEqual(['a']))
  test('trouve « ÉLECTRO » en majuscules accentuées', () => expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'ÉLECTRO' }).map((x) => x.id)).toEqual(['a']))
  test('cherche aussi dans le numéro et le chantier', () => {
    expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'es-30' }).map((x) => x.id)).toEqual(['a'])
    expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'renovation dupont' }).map((x) => x.id)).toEqual(['b'])
  })
  test('« wurzel » trouve « Würzel »', () => expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'wurzel' }).map((x) => x.id)).toEqual(['b']))
  test('recherche vide ou d’espaces : tout, y compris la facture sans fournisseur ni numéro', () => expect(filtrer(liste, { ...CRITERES_VIDES, recherche: '   ' })).toHaveLength(3))
  test('sans résultat : liste vide', () => expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'zzz' })).toEqual([]))
  test('normaliser gère null', () => expect(normaliser(null)).toBe(''))
})

describe('filtres fournisseur, chantier, période', () => {
  const liste = [
    f({ id: 'a', fournisseur: 'Loxbel', chantiers: { nom: 'Garage' }, date_facture: '2026-11-01' }),
    f({ id: 'b', fournisseur: 'Loxbel', chantiers: null, date_facture: '2026-11-15' }),
    f({ id: 'c', fournisseur: null, chantiers: { nom: 'Garage' }, date_facture: null }),
  ]
  test('par fournisseur, y compris « Fournisseur inconnu »', () => {
    expect(filtrer(liste, { ...CRITERES_VIDES, fournisseurs: ['Loxbel'] }).map((x) => x.id)).toEqual(['a', 'b'])
    expect(filtrer(liste, { ...CRITERES_VIDES, fournisseurs: ['Fournisseur inconnu'] }).map((x) => x.id)).toEqual(['c'])
  })
  test('par chantier, y compris « Chantier non affecté »', () => {
    expect(filtrer(liste, { ...CRITERES_VIDES, chantiers: ['Garage'] }).map((x) => x.id)).toEqual(['a', 'c'])
    expect(filtrer(liste, { ...CRITERES_VIDES, chantiers: ['Chantier non affecté'] }).map((x) => x.id)).toEqual(['b'])
  })
  test('période : bornes comprises, une facture sans date n’y passe pas', () => {
    expect(filtrer(liste, { ...CRITERES_VIDES, du: '2026-11-01', au: '2026-11-15' }).map((x) => x.id)).toEqual(['a', 'b'])
    expect(filtrer(liste, { ...CRITERES_VIDES, du: '2026-11-02' }).map((x) => x.id)).toEqual(['b'])
    expect(filtrer(liste, { ...CRITERES_VIDES, au: '2026-11-01' }).map((x) => x.id)).toEqual(['a'])
  })
  test('les filtres se cumulent avec la recherche', () => expect(filtrer(liste, { ...CRITERES_VIDES, recherche: 'loxbel', chantiers: ['Garage'] }).map((x) => x.id)).toEqual(['a']))
  test('valeurs proposées : sans doublon, triées sans accents', () => {
    const v = valeursDeFiltre([f({ fournisseur: 'Würzel' }), f({ fournisseur: 'Zinc' }), f({ fournisseur: 'Würzel' }), f({ fournisseur: 'Électro' }), f({ fournisseur: null })])
    expect(v.fournisseurs).toEqual(['Électro', 'Fournisseur inconnu', 'Würzel', 'Zinc'])
  })
  test('pastilles et retrait d’un filtre', () => {
    const c = { ...CRITERES_VIDES, fournisseurs: ['Loxbel'], du: '2026-11-01' }
    const p = pastillesFiltres(c, (v) => v.split('-').reverse().join('/'))
    expect(p.map((x) => x.libelle)).toEqual(['Fournisseur : Loxbel', 'Depuis le 01/11/2026'])
    expect(nombreFiltres(c)).toBe(2)
    expect(nombreFiltres(retirerCritere(retirerCritere(c, p[0]), p[1]))).toBe(0)
  })
})

describe('tri', () => {
  const liste = [
    f({ id: 'a', fournisseur: 'Zinc', montant_ttc: 50 }),
    f({ id: 'b', fournisseur: 'électro', montant_ttc: null }),
    f({ id: 'c', fournisseur: null, montant_ttc: 300 }),
    f({ id: 'd', fournisseur: 'Alpha', montant_ttc: 50 }),
  ]
  test('fournisseur croissant : sans accents, sans fournisseur en dernier', () => expect(trier(liste, { critere: 'fournisseur', sens: 'asc' }).map((x) => x.id)).toEqual(['d', 'b', 'a', 'c']))
  test('fournisseur décroissant : l’absent reste en dernier', () => expect(trier(liste, { critere: 'fournisseur', sens: 'desc' }).map((x) => x.id)).toEqual(['a', 'b', 'd', 'c']))
  test('montant décroissant : stable à égalité (a avant d), sans montant en dernier', () => expect(trier(liste, { critere: 'montant', sens: 'desc' }).map((x) => x.id)).toEqual(['c', 'a', 'd', 'b']))
  test('montant croissant : stable à égalité aussi', () => expect(trier(liste, { critere: 'montant', sens: 'asc' }).map((x) => x.id)).toEqual(['a', 'd', 'c', 'b']))
  test('ne modifie pas la liste reçue', () => { const copie = liste.map((x) => x.id); trier(liste, { critere: 'montant', sens: 'asc' }); expect(liste.map((x) => x.id)).toEqual(copie) })
  test('numéros avec chiffres : FA-2 avant FA-10', () => expect(trier([f({ id: 'x', numero: 'FA-10' }), f({ id: 'y', numero: 'FA-2' })], { critere: 'numero', sens: 'asc' }).map((x) => x.id)).toEqual(['y', 'x']))
  test('date : les plus récentes d’abord, sans date en dernier', () => {
    const l = [f({ id: 'a', date_facture: '2026-01-02' }), f({ id: 'b', date_facture: null }), f({ id: 'c', date_facture: '2026-03-01' })]
    expect(trier(l, { critere: 'date', sens: 'desc' }).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
  test('clic sur l’en-tête : même colonne = sens inversé, autre colonne = son sens d’origine', () => {
    expect(triApresClicColonne({ critere: 'date', sens: 'desc' }, 'date')).toEqual({ critere: 'date', sens: 'asc' })
    expect(triApresClicColonne({ critere: 'date', sens: 'desc' }, 'fournisseur')).toEqual({ critere: 'fournisseur', sens: 'asc' })
    expect(triApresClicColonne({ critere: 'date', sens: 'asc' }, 'montant')).toEqual({ critere: 'montant', sens: 'desc' })
  })
  test('tri mémorisé abîmé : retour au tri par défaut', () => {
    expect(lireTri('montant:asc')).toEqual({ critere: 'montant', sens: 'asc' })
    expect(lireTri('n’importe quoi')).toEqual({ critere: 'date', sens: 'desc' })
    expect(lireTri(null)).toEqual({ critere: 'date', sens: 'desc' })
  })
})

describe('regroupement par statut, compteurs et totaux', () => {
  test('trois colonnes toujours présentes, même vides', () => {
    expect(regrouper([])).toEqual({ a_valider: [], acceptee: [], refusee: [] })
    const g = regrouper([f({ statut: 'acceptee' }), f({ statut: 'a_valider' }), f({ statut: 'acceptee' })])
    expect([g.a_valider.length, g.acceptee.length, g.refusee.length]).toEqual([1, 2, 0])
  })
  test('ignore un statut inconnu au lieu de planter', () => expect(regrouper([f({ statut: 'bizarre' })]).a_valider).toEqual([]))
  test('totaux en centimes : 0,1 + 0,2 vaut exactement 0,30 €', () => {
    expect(totaux([f({ montant_ttc: 0.1 }), f({ montant_ttc: 0.2 })]).centimes).toBe(30)
    expect(totaux([f({ montant_ttc: 19.99 }), f({ montant_ttc: 19.99 }), f({ montant_ttc: 19.99 })]).centimes).toBe(5997)
  })
  test('facture sans montant : comptée, pour 0 €', () => expect(totaux([f({ montant_ttc: null }), f({ montant_ttc: 10 })])).toEqual({ nombre: 2, centimes: 1000 }))
  test('texte de tête de colonne', () => {
    expect(texteTete({ nombre: 0, centimes: 0 })).toBe('0 facture')
    expect(texteTete({ nombre: 1, centimes: 154140 })).toMatch(/^1 facture · 1\s541,40\s€$/)
    expect(texteTete({ nombre: 3, centimes: 0 })).toBe('3 factures')
  })
})

describe('pastilles de carte', () => {
  test('acceptée malgré alerte', () => expect(pastillesCarte(f({ statut: 'acceptee', acceptee_malgre_alerte: true })).map((p) => p.libelle)).toEqual(['Acceptée malgré alerte']))
  test('à valider propre : aucune pastille', () => expect(pastillesCarte(f())).toEqual([]))
  test('lecture impossible', () => expect(pastillesCarte(f({ extraction_erreur: 'pdf_trop_gros', montant_ttc: null })).map((p) => p.libelle)).toEqual(['Lecture impossible']))
  test('sans fournisseur ou sans montant', () => {
    expect(pastillesCarte(f({ fournisseur: null })).map((p) => p.libelle)).toEqual(['Informations manquantes'])
    expect(pastillesCarte(f({ montant_ttc: null })).map((p) => p.libelle)).toEqual(['Informations manquantes'])
  })
  test('totaux : comparés en centimes (0,1 + 0,2 = 0,3 sans fausse alerte)', () => {
    expect(pastillesCarte(f({ montant_ht: 0.1, montant_tva: 0.2, montant_ttc: 0.3 }))).toEqual([])
    expect(pastillesCarte(f({ montant_ht: 96.25, montant_tva: 19.25, montant_ttc: 125.5 })).map((p) => p.libelle)).toEqual(['Totaux à vérifier'])
  })
  test('une facture déjà décidée n’affiche pas les repères « à valider »', () => expect(pastillesCarte(f({ statut: 'refusee', montant_ttc: null }))).toEqual([]))
})

describe('Avoirs : les totaux soustraient, le signe vient du type du document', () => {
  test('un avoir se soustrait (les montants de la base sont positifs)', () => {
    const t = totaux([f({ montant_ttc: 120 }), f({ montant_ttc: 50 }), f({ montant_ttc: 20, type_document: 'avoir' })])
    expect(t).toEqual({ nombre: 3, centimes: 15000 })
    expect(texteTete(t)).toMatch(/3 factures · 150,00\s€/)
  })
  test('jamais inversé deux fois : un avoir déjà négatif en base reste négatif une seule fois', () => {
    expect(totaux([f({ montant_ttc: -20, type_document: 'avoir' })]).centimes).toBe(-2000)
  })
  test('le tri par montant tient compte du signe', () => {
    const r = trier([f({ id: 'a', montant_ttc: 50 }), f({ id: 'b', montant_ttc: 200, type_document: 'avoir' }), f({ id: 'c', montant_ttc: 10 })], { critere: 'montant', sens: 'asc' })
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})

}

{
describe('dateHeureFr : heure de Paris', () => {
  test('hiver (UTC+1) et été (UTC+2)', () => {
    expect(dateHeureFr('2026-11-22T13:32:00Z')).toBe('22/11/2026 à 14:32')
    expect(dateHeureFr('2026-07-01T10:05:00Z')).toBe('01/07/2026 à 12:05')
  })
  test('minuit UTC : le jour change à Paris', () => {
    expect(dateHeureFr('2026-11-21T23:59:00Z')).toBe('22/11/2026 à 00:59')
    expect(dateHeureFr('2026-11-22T00:00:00Z')).toBe('22/11/2026 à 01:00')
    expect(dateHeureFr('2026-07-01T22:30:00Z')).toBe('02/07/2026 à 00:30')
    expect(dateHeureFr('2026-06-30T21:59:00Z')).toBe('30/06/2026 à 23:59')
  })
  test('changement d’heure de mars 2026 (dimanche 29, 01:00 UTC : 02:00 devient 03:00)', () => {
    expect(dateHeureFr('2026-03-29T00:59:00Z')).toBe('29/03/2026 à 01:59')
    expect(dateHeureFr('2026-03-29T01:00:00Z')).toBe('29/03/2026 à 03:00')
  })
  test('changement d’heure d’octobre 2026 (dimanche 25, 01:00 UTC : 03:00 redevient 02:00)', () => {
    expect(dateHeureFr('2026-10-25T00:59:00Z')).toBe('25/10/2026 à 02:59')
    expect(dateHeureFr('2026-10-25T01:00:00Z')).toBe('25/10/2026 à 02:00')
  })
  test('vide : tiret', () => { expect(dateHeureFr(null)).toBe('—') })
})

describe('dateFr : date sans heure, jamais décalée', () => {
  test('AAAA-MM-JJ est écrite telle quelle', () => {
    expect(dateFr('2026-11-22')).toBe('22/11/2026')
    expect(dateFr('2026-01-01')).toBe('01/01/2026')
    expect(dateFr(null)).toBe('—')
  })
  test('un horodatage est converti en date de Paris', () => { expect(dateFr('2026-11-21T23:30:00Z')).toBe('22/11/2026') })
})

describe('avoirs : affichage en négatif', () => {
  test('un avoir s’affiche en négatif, une facture en positif', () => {
    expect(eurosFacture(100, { type_document: 'avoir' })).toMatch(/^[-−]100,00\s€$/)
    expect(eurosFacture(100, { type_document: 'facture' })).toMatch(/^100,00\s€$/)
    expect(eurosFacture(100, {})).toMatch(/^100,00\s€$/)
  })
  test('jamais inversé deux fois', () => {
    expect(montantSigne(-100, { type_document: 'avoir' })).toBe(-100)
    expect(montantSigne(100, { type_document: 'avoir' })).toBe(-100)
    expect(montantSigne(null, { type_document: 'avoir' })).toBeNull()
  })
  test('estAvoir', () => {
    expect(estAvoir({ type_document: 'avoir' })).toBe(true)
    expect(estAvoir({ type_document: 'facture' })).toBe(false)
    expect(estAvoir(null)).toBe(false)
  })
})

}

{

describe('archivage avec confirmation puis « Annuler » 8 s', () => {
  test('A1 : le délai pour annuler est de 8 secondes, comme dans Chevalier IA OS', () => {
    expect(DUREE_ANNULATION).toBe(8000)
  })

  test('A2 : la confirmation tutoie et accorde le texte (facture au féminin)', () => {
    const f = textesArchivage('Point Q')
    expect(f.titre).toBe('Archiver cette facture ?')
    expect(f.message).toBe('« Point Q » ira dans les archives. Tu pourras la désarchiver quand tu veux.')
    expect(f.fait).toBe('Facture archivée')
    const c = textesArchivage('')
    expect(c.message).toBe('Elle ira dans les archives. Tu pourras la désarchiver quand tu veux.')
    expect(c.libelleOk).toBe('Archiver')
    expect(f.desarchive).toBe('Facture désarchivée')
  })

  test('A3 : archiver appelle la fonction d’archivage existante, puis relit l’écran', async () => {
    const faire = espion(Promise.resolve({ ok: true })); const relire = espion()
    expect(await archiverPuisRelire(faire, relire)).toEqual({ ok: true, annulable: true })
    expect(faire).toHaveBeenCalledTimes(1); expect(relire).toHaveBeenCalledTimes(1)
  })

  test('A4 (cas d’erreur) : le message du serveur est renvoyé tel quel, sans « Annuler », et l’écran est relu', async () => {
    const relire = espion()
    expect(await archiverPuisRelire(() => Promise.reject(new Error('Cette facture est déjà archivée.')), relire)).toEqual({ ok: false, message: 'Cette facture est déjà archivée.' })
    expect(relire).toHaveBeenCalledTimes(1)
    expect(await archiverPuisRelire(() => Promise.reject('?'), relire)).toEqual({ ok: false, message: MESSAGE_ERREUR_PAR_DEFAUT })
    expect(MESSAGE_ERREUR_PAR_DEFAUT).toMatch(/réessaie/)
  })

  test('A5 : « Annuler » appelle le désarchivage existant, puis relit l’écran', async () => {
    const defaire = espion(Promise.resolve({ ok: true })); const relire = espion()
    expect(await annulerArchivage(defaire, relire)).toEqual({ ok: true })
    expect(defaire).toHaveBeenCalledTimes(1); expect(relire).toHaveBeenCalledTimes(1)
  })

  test('A6 (cas d’erreur) : si « Annuler » échoue, on le dit au lieu de faire croire que c’est annulé', async () => {
    const r = await annulerArchivage(() => Promise.reject(new Error('Connexion impossible, réessaie.')), espion())
    expect(r).toEqual({ ok: false, message: 'Impossible d’annuler : Connexion impossible, réessaie.' })
  })
})

}

{

const f = (o = {}) => ({
  id: '1', fournisseur: 'Point Q', numero: 'F-1', date_facture: '2026-11-05', montant_ht: 100, montant_tva: 20, montant_ttc: 120, statut: 'acceptee', motif_refus: null,
  date_decision: '2026-11-06T10:00:00Z', decide_par: 'a@b.fr', created_at: '2026-11-05T08:00:00Z', extraction_erreur: null, acceptee_malgre_alerte: false, chantiers: { nom: 'Villa' },
  type_document: 'facture', archivee_le: null, extraction: null, fournisseur_siren: '123456789', numero_normalise: 'f1', iban_normalise: 'FR7612345678901234567890123', email_expediteur: 'x@y.fr', lignes_etat: null, lignes_somme_ht: null, ...o,
})

describe('5 : cellules et injection de formule', () => {
  test('5 : le texte avec accents passe tel quel', () => { expect(formaterCellule('Électricité é à ç')).toBe('Électricité é à ç') })
  test('5 : guillemets doublés, point-virgule et saut de ligne mis entre guillemets', () => {
    expect(formaterCellule('dit "ok"')).toBe('"dit ""ok"""')
    expect(formaterCellule('a;b')).toBe('"a;b"')
    expect(formaterCellule('a\nb')).toBe('"a\nb"')
  })
  test('5 : un texte qui commence par = + - @ tabulation ou retour chariot reçoit une apostrophe', () => {
    for (const t of ['=1+1', '+33', '-5', '@SOMME(A1)', '\tx', '\rx']) expect(protegerFormule(t)).toBe(`'${t}`)
    expect(formaterCellule('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"')
    expect(protegerFormule('Normal -tiret')).toBe('Normal -tiret')
  })
  test('5 : un nombre négatif reste un nombre (pas d’apostrophe)', () => {
    expect(formaterCellule(-100)).toBe('-100,00')
    expect(formaterCellule(1234.5)).toBe('1234,50')
    expect(nombreCsv(0)).toBe('0,00')
  })
  test('5 : vide, null et nombre invalide donnent une cellule vide', () => {
    expect(formaterCellule(null)).toBe('')
    expect(formaterCellule(undefined)).toBe('')
    expect(formaterCellule(NaN)).toBe('')
    expect(formaterCellule('')).toBe('')
  })
})

describe('5 : fichier', () => {
  test('5 : BOM, séparateur « ; », fin de ligne Windows, en-têtes français', () => {
    const csv = construireCsv(['A', 'B'], [['x', 1.5]])
    expect(csv).toBe(`${BOM}A;B\r\nx;1,50\r\n`)
  })
  test('5 : liste vide = seulement les en-têtes', () => {
    expect(facturesCsv([])).toBe(`${BOM}${ENTETES_FACTURES.join(';')}\r\n`)
  })
  test('5 : une facture sort avec ses colonnes, sans IBAN', () => {
    const csv = facturesCsv([f()])
    expect(csv.split('\r\n')[1]).toBe('F-1;Point Q;123456789;05/11/2026;100,00;20,00;120,00;Facture;Acceptée;a@b.fr;06/11/2026;;Villa')
    expect(csv).not.toMatch(/FR76|iban|IBAN|alerte|agence/i)
    expect(ENTETES_FACTURES).toEqual(['Numéro', 'Fournisseur', 'SIREN', 'Date de la facture', 'HT', 'TVA', 'TTC', 'Type', 'Statut', 'Décideur', 'Date de décision', 'Motif de refus', 'Chantier'])
  })
  test('5 : un avoir sort en négatif, comme à l’écran', () => {
    const l = facturesCsv([f({ type_document: 'avoir' })]).split('\r\n')[1]
    expect(l).toContain(';-100,00;-20,00;-120,00;Avoir;')
  })
  test('5 : un fournisseur piégé et un motif avec point-virgule sont protégés', () => {
    const l = facturesCsv([f({ fournisseur: '=CMD()', motif_refus: 'trop cher; refusé', statut: 'refusee' })]).split('\r\n')[1]
    expect(l).toContain(";'=CMD();".replace("'=CMD();", "'=CMD()"))
    expect(l).toContain('"trop cher; refusé"')
  })
  test('5 : données manquantes = cellules vides', () => {
    const l = facturesCsv([f({ numero: null, fournisseur: null, date_facture: null, montant_ht: null, montant_tva: null, montant_ttc: null, date_decision: null, decide_par: null, chantiers: null, fournisseur_siren: null, statut: 'a_valider' })]).split('\r\n')[1]
    expect(l).toBe(';;;;;;;Facture;À valider;;;;')
  })
  test('5 : noms de fichier et date du jour à Paris', () => {
    expect(nomFichierExport('2026-11-23')).toBe('factures-2026-11-23.csv')
    expect(dateJourFichier(new Date('2026-11-22T23:30:00Z'))).toBe('2026-11-23') // minuit passé à Paris
    expect(dateJourFichier(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01')
  })
  test('5 : texte du bouton grisé', () => { expect(TEXTE_RIEN_A_EXPORTER).toBe('Rien à exporter') })
})

}

{
describe('F1. favoris en haut, puis les autres par ordre alphabétique (sans casse ni accents)', () => {
  test('F1a. les favoris passent devant, chaque groupe trié sans tenir compte des accents ni des majuscules', () => {
    const r = ordonnerAvecFavoris(['zèbre', 'Élan', 'abri', 'Écurie', 'Bois'], (v) => v === 'zèbre' || v === 'Écurie')
    expect(r.favoris).toEqual(['Écurie', 'zèbre'])
    expect(r.autres).toEqual(['abri', 'Bois', 'Élan'])
  })
  test('F1b. aucun favori : la liste est l’alphabétique d’avant et le groupe des favoris est vide (donc pas de trait)', () => {
    const r = ordonnerAvecFavoris(['b', 'A', 'é'], () => false)
    expect(r.favoris).toEqual([])
    expect(r.autres).toEqual(['A', 'b', 'é'])
  })
  test('F1c. tous en favori : tout est dans les favoris, aucun « autre »', () => {
    const r = ordonnerAvecFavoris(['b', 'a'], () => true)
    expect(r.favoris).toEqual(['a', 'b']); expect(r.autres).toEqual([])
  })
})

/** Appel serveur simulé : chaque appel reste en attente jusqu'à ce que le test le résolve (ou le refuse), dans l'ordre voulu. */
function serveurSimule() {
  const attentes = {}
  const appel = (genre, cle) => new Promise((ok, ko) => { attentes[`${genre}:${cle}`] = { ok, ko: () => ko(new Error('refus')) } })
  return { appel, attentes }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('F3. bascule clé par clé : un clic ne touche que sa clé (jamais une photo entière de l’état)', () => {
  const k = cleDeFavori('chantier', 'abc')
  test('F3a. le clic change l’étoile tout de suite, le serveur confirme', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const p = m.basculer('chantier', 'abc')
    expect(m.lire().has(k)).toBe(true) // avant la réponse
    sv.attentes[k].ok(true); await p
    expect([...m.lire()]).toEqual([k]); expect(m.lireErreur()).toBeNull()
  })
  test('F3b. le serveur dit « retiré » : la clé disparaît, les autres restent', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    m.charger([{ genre: 'chantier', cle: 'abc' }, { genre: 'agence', cle: '1' }])
    const p = m.basculer('chantier', 'abc'); sv.attentes[k].ok(false); await p
    expect([...m.lire()]).toEqual(['agence:1'])
  })
  test('F3c. échec : cette étoile revient, le message est exactement celui demandé, avec son genre', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    m.charger([{ genre: 'chantier', cle: 'abc' }])
    const p = m.basculer('chantier', 'abc'); expect(m.lire().has(k)).toBe(false); sv.attentes[k].ko(); await p
    expect(m.lire().has(k)).toBe(true)
    expect(m.lireErreur()).toEqual({ genre: 'chantier', message: 'Impossible d’enregistrer ton favori. Réessaie.' }); expect(MESSAGE_ERREUR_FAVORI).toBe(m.lireErreur()?.message)
  })
  test('F3d. échec lors d’un ajout : la clé n’est pas ajoutée', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const p = m.basculer('chantier', 'abc'); sv.attentes[k].ko(); await p
    expect(m.lire().size).toBe(0)
  })
  test('F3e. deux étoiles de suite, la PREMIÈRE échoue : seule la première revient, la seconde reste en favori', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const a = m.basculer('chantier', 'A'); const b = m.basculer('chantier', 'B')
    sv.attentes['chantier:A'].ko(); await a
    sv.attentes['chantier:B'].ok(true); await b
    expect([...m.lire()]).toEqual(['chantier:B'])
  })
  test('F3f. deux étoiles, la SECONDE répond en premier : les deux restent en favori', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const a = m.basculer('chantier', 'A'); const b = m.basculer('chantier', 'B')
    sv.attentes['chantier:B'].ok(true); await b
    sv.attentes['chantier:A'].ok(true); await a
    expect([...m.lire()].sort()).toEqual(['chantier:A', 'chantier:B'])
  })
  test('F3g. un nom qui regroupe deux agences : un clic = 2 appels ; si un seul échoue, seule cette agence revient', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const cles = clesParNom([{ nom: 'Bétonnerie Fictive', cle: '1' }, { nom: 'Bétonnerie Fictive', cle: '2' }])
    const liste = favorisDeListe('agence', cles, { est: (g, c) => m.lire().has(cleDeFavori(g, c)), basculer: (g, c) => m.basculer(g, c), erreur: null })
    liste.basculer('Bétonnerie Fictive')
    expect(Object.keys(sv.attentes).sort()).toEqual(['agence:1', 'agence:2'])
    expect(liste.est('Bétonnerie Fictive')).toBe(true)
    sv.attentes['agence:1'].ok(true); sv.attentes['agence:2'].ko(); await tick()
    expect([...m.lire()]).toEqual(['agence:1'])
    expect(m.lireErreur()?.genre).toBe('agence')
  })
  test('F3h. la lecture initiale qui arrive pendant un clic ne l’écrase pas', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const p = m.basculer('chantier', 'A')
    m.charger([{ genre: 'agence', cle: '9' }])
    expect([...m.lire()].sort()).toEqual(['agence:9', 'chantier:A'])
    sv.attentes['chantier:A'].ok(true); await p
  })
  test('F3i. un nouveau clic efface l’ancien message ; « effacerErreur » aussi', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const p = m.basculer('chantier', 'A'); sv.attentes['chantier:A'].ko(); await p
    expect(m.lireErreur()).not.toBeNull()
    m.effacerErreur(); expect(m.lireErreur()).toBeNull()
  })
  test('F3j. le clic suivant efface l’ancien message tout de suite', async () => {
    const sv = serveurSimule(); const m = creerMagasinFavoris(sv.appel)
    const p = m.basculer('chantier', 'A'); sv.attentes['chantier:A'].ko(); await p
    expect(m.lireErreur()).not.toBeNull()
    void m.basculer('chantier', 'B')
    expect(m.lireErreur()).toBeNull()
  })
})

describe('F4. étoile accessible', () => {
  test('F4a. le nom accessible est l’action du clic', () => {
    expect(libelleEtoile(false)).toBe('Mettre en favori'); expect(libelleEtoile(true)).toBe('Retirer des favoris')
  })
})

describe('F5. fournisseur = entreprise (SIREN) ; sans SIREN connu, pas d’étoile', () => {
  const m = clesParNom([
    { nom: 'Bétonnerie Fictive', cle: '111111111' }, { nom: 'BETONNERIE FICTIVE', cle: '111111111' }, { nom: 'Bétonnerie Fictive', cle: '111111111' },
    { nom: 'Écrit sans siren', cle: null }, { nom: '  ', cle: '333333333' },
  ])
  test('F5a. même nom (sans casse ni accents) = une seule entrée, sans doublon de clé', () => {
    expect(m.get('betonnerie fictive')).toEqual(['111111111'])
  })
  test('F5b. pas de SIREN ou pas de nom : aucune entrée', () => {
    expect(m.has('ecrit sans siren')).toBe(false); expect(m.size).toBe(1)
  })
  test('F5c. l’étoile d’un nom en favori le retire ; sinon elle le met', () => {
    expect(clesABasculer(['a', 'b'], (c) => c === 'a')).toEqual(['a'])
    expect(clesABasculer(['a', 'b'], () => false)).toEqual(['a', 'b'])
  })
  test('F5d. favorisDeListe(entreprise) : « peut » seulement avec une clé ; « est » si l’entreprise l’est ; basculer appelle le genre entreprise avec le SIREN', () => {
    const basculer = espion(async () => {})
    const f = favorisDeListe('entreprise', m, { est: (g, c) => g === 'entreprise' && c === '111111111', basculer, erreur: null })
    expect(f.peut('Écrit sans siren')).toBe(false); expect(f.peut('bétonnerie fictive')).toBe(true)
    expect(f.est('Bétonnerie Fictive')).toBe(true)
    f.basculer('Bétonnerie Fictive')
    expect(basculer).toHaveBeenCalledTimes(1); expect(basculer).toHaveBeenCalledWith('entreprise', '111111111')
  })
  test('F5e. le genre « chantier » ne se mélange pas avec « entreprise » ni avec l’ancien « agence »', () => {
    const f = favorisDeListe('chantier', m, { est: (g) => g === 'entreprise' || g === 'agence', basculer: async () => {}, erreur: null })
    expect(f.est('Bétonnerie Fictive')).toBe(false)
  })
  test('F5f. un favori « agence » d’avant ne rend pas l’entreprise favorite', () => {
    const f = favorisDeListe('entreprise', m, { est: (g) => g === 'agence', basculer: async () => {}, erreur: null })
    expect(f.est('Bétonnerie Fictive')).toBe(false)
  })
})

describe('F6. sirenDeSiret : les 9 premiers chiffres d’un SIRET valide, sinon rien', () => {
  test('F6a. SIRET de 14 chiffres -> SIREN ; espaces autour ignorés', () => {
    expect(sirenDeSiret('12345678200010')).toBe('123456782'); expect(sirenDeSiret(' 12345678200010 ')).toBe('123456782')
  })
  test('F6b. absent, trop court, trop long, ou avec des lettres -> null', () => {
    for (const v of [null, undefined, '', '7328293', '123456782000105', '1234567820007A']) expect(sirenDeSiret(v)).toBeNull()
  })
  test('F6c. deux agences d’une même entreprise donnent la même clé', () => {
    expect(sirenDeSiret('12345678200010')).toBe(sirenDeSiret('12345678200028'))
  })
})

describe('F7. cleEntreprise : le SIRET de l’agence d’abord, sinon le SIREN lu sur la facture', () => {
  test('F7a. agence reliée : son SIREN, même si le SIREN lu diffère', () => expect(cleEntreprise('12345678200010', '987654324')).toBe('123456782'))
  test('F7b. pas d’agence : le SIREN lu sur la facture (facture « à valider »)', () => expect(cleEntreprise(null, ' 123456782 ')).toBe('123456782'))
  test('F7c. ni l’un ni l’autre, ou SIREN mal formé : null', () => { for (const v of [null, '', '7328', '73282932A']) expect(cleEntreprise(null, v)).toBeNull() })
})

}