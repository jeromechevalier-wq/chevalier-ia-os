import { describe, it } from 'node:test'
import { expect } from './_expect-tableauachats.js'
import { FILTRES_PAR_ONGLET, appliquerChangement, memoireParDefaut, reinitialiser } from '../js/modules/tableauachats/filtrage.js'
                                       
import { FOURNISSEUR_INCONNU, SANS_AGENCE, agencesDuFournisseur, barresAgences, chercherFournisseurs, chiffres, enAgence, enFacture, enFiche, filtrerFacturesFournisseurs, nomAgence, regrouperParFournisseur, tableauFournisseurs, topArticlesFournisseur, totalFournisseurs,                                                                        } from '../js/modules/tableauachats/fournisseurs.js'

let n = 0
const F = (o                             )                     => ({ facture_id: `x${String(++n).padStart(4, '0')}`, numero: 'F-1', date_ref: '2026-06-01', fournisseur_id: 'alpha', fournisseur: 'Négoce Alpha', siren: '900300013',
  etablissement_id: 'e1', chantier: 'Maison', type_document: 'facture', montant_ht: 100, nb_lignes: 2, ...o })
const FICHES                     = [
  { fournisseur_id: 'alpha', fournisseur: 'Négoce Alpha', siren: '900300013', nb_agences: 2 },
  { fournisseur_id: 'beta', fournisseur: 'Bêta Location', siren: null, nb_agences: 0 },
]
const AGENCES                      = [
  { etablissement_id: 'e1', fournisseur_id: 'alpha', nom_agence: 'Alpha Ville A', ville: 'Ville A', siret: '99900099900011' },
  { etablissement_id: 'e2', fournisseur_id: 'alpha', nom_agence: 'Dépôt', ville: 'Ville B', siret: null },
  { etablissement_id: 'e9', fournisseur_id: 'autre', nom_agence: 'Ailleurs', ville: 'Loin', siret: null },
]
let m = 0
const L = (o                    )            => ({ ligne_id: `l${String(++m).padStart(4, '0')}`, facture_id: 'f1', numero: 'F-1', date_prix: '2026-06-01', fournisseur: 'Négoce Alpha', etablissement_id: 'e1', nom_agence: 'Alpha Ville A', ville: 'Ville A',
  chantier_id: 'c1', chantier: 'Maison', article_fournisseur_id: 'a1', reference_fournisseur: 'CIM', designation: 'Ciment', unite: 'sac', unite_normalisee: 'sac', quantite: 1, montant_ht: 100, prix_net: 100,
  article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, prix_unite_reference: null, rapproche: false, origine_rapprochement: null, ...o })

describe('Fournisseurs et agences : calculs', () => {
  it('1 : TOUS les fournisseurs enregistrés sont listés, même sans facture acceptée', () => {
    const t = tableauFournisseurs(FICHES, [F({})])
    expect(t.map((l) => l.nom)).toEqual(['Négoce Alpha', 'Bêta Location'])
    const beta = t[1]
    expect(beta).toMatchObject({ nb_factures: 0, total_ht: 0, nb_lignes: 0, derniere_facture: null, nb_agences: 0, siren: '', sans_fiche: false, part_pct: 0 })
    expect(tableauFournisseurs(FICHES, []).map((l) => [l.nom, l.part_pct])).toEqual([['Bêta Location', null], ['Négoce Alpha', null]]) // sans facture : par nom, part vide (jamais de division par zéro)
  })
  it('2 : nombre de factures, total HT, lignes d’achat, dernière facture, part du total ; un avoir se retire du total sans compter comme une facture', () => {
    const t = tableauFournisseurs(FICHES, [
      F({ montant_ht: 1000, nb_lignes: 2, date_ref: '2026-03-01' }), F({ montant_ht: 500, nb_lignes: 1, date_ref: '2026-05-10' }),
      F({ montant_ht: -200, nb_lignes: 0, date_ref: '2026-06-20', type_document: 'avoir' }),
      F({ fournisseur_id: 'beta', fournisseur: 'Bêta Location', siren: null, montant_ht: 700, nb_lignes: 3, date_ref: '2026-04-04', etablissement_id: null }),
    ])
    expect(t[0]).toMatchObject({ nom: 'Négoce Alpha', siren: '900300013', nb_agences: 2, nb_factures: 2, nb_avoirs: 1, total_ht: 1300, nb_lignes: 3, derniere_facture: '2026-05-10', part_pct: 65 })
    expect(t[1]).toMatchObject({ nom: 'Bêta Location', nb_factures: 1, total_ht: 700, nb_lignes: 3, derniere_facture: '2026-04-04', part_pct: 35 })
    expect(totalFournisseurs(t)).toEqual({ nb_fournisseurs: 2, nb_actifs: 1 + 1, nb_factures: 3, total_ht: 2000 })
    expect(chiffres([F({ montant_ht: 0.1 }), F({ montant_ht: 0.2 })]).total_ht).toBe(0.3) // arrondi au centime
  })
  it('3 : une facture sans fiche rejoint la fiche du même nom (sans casse ni accents) ; sinon elle forme un fournisseur « sans fiche », avec le SIREN écrit sur la facture', () => {
    const fs = [F({ montant_ht: 100 }), F({ fournisseur_id: null, fournisseur: 'NEGOCE  ALPHA', siren: null, etablissement_id: null, montant_ht: 50 }),
      F({ fournisseur_id: null, fournisseur: 'Artisan Inconnu', siren: '123456782', etablissement_id: null, montant_ht: 30 }), F({ fournisseur_id: null, fournisseur: 'artisan inconnu', siren: null, etablissement_id: null, montant_ht: 20 }),
      F({ fournisseur_id: null, fournisseur: ' ', siren: null, etablissement_id: null, montant_ht: 10 })]
    const t = tableauFournisseurs(FICHES, fs)
    expect(t.map((l) => [l.nom, l.total_ht, l.sans_fiche, l.nb_agences])).toEqual([['Négoce Alpha', 150, false, 2], ['Artisan Inconnu', 50, true, null], [FOURNISSEUR_INCONNU, 10, true, null], ['Bêta Location', 0, false, 0]])
    expect(t[1].siren).toBe('123456782')
    // Deux fiches du même nom : on ne devine pas, la facture sans fiche reste à part.
    const doubles                     = [...FICHES, { fournisseur_id: 'alpha2', fournisseur: 'négoce alpha', siren: null, nb_agences: 0 }]
    expect([...regrouperParFournisseur(doubles, fs).keys()]).toContain('n:negoce alpha')
    // Un identifiant de fournisseur inconnu des fiches (fiche écartée) ne fait pas disparaître la facture.
    expect(tableauFournisseurs(FICHES, [F({ fournisseur_id: 'fantome', fournisseur: 'Fantôme' })]).some((l) => l.nom === 'Fantôme' && l.sans_fiche)).toBe(true)
  })
  it('4 : le filtre du haut (Période sur la date de la facture, Chantier par nom) choisit les factures ; les fournisseurs restent tous listés', () => {
    const fs = [F({ date_ref: '2025-01-10' }), F({ date_ref: '2026-02-10', chantier: 'Garage' }), F({ date_ref: '2026-07-10', chantier: null })]
    const per = filtrerFacturesFournisseurs(fs, { periode: { type: 'periode', libelle: 'x', du: '2026-02-10', au: '2026-07-10' } })
    expect(per.map((x) => x.date_ref)).toEqual(['2026-02-10', '2026-07-10']) // bornes comprises
    expect(filtrerFacturesFournisseurs(fs, { chantier: { type: 'liste', choix: ['GARAGE'] } }).length).toBe(1)
    expect(filtrerFacturesFournisseurs(fs, { chantier: { type: 'liste', choix: ['Sans chantier'] } }).map((x) => x.date_ref)).toEqual(['2026-07-10'])
    expect(filtrerFacturesFournisseurs(fs, {}).length).toBe(3)
    const t = tableauFournisseurs(FICHES, filtrerFacturesFournisseurs(fs, { chantier: { type: 'liste', choix: ['Introuvable'] } }))
    expect(t.length).toBe(2); expect(t.every((l) => l.nb_factures === 0)).toBe(true)
  })
  it('5 : niveau 2 : toutes les agences du fournisseur (même sans facture), ligne « Sans agence », part du total du fournisseur', () => {
    const fs = [F({ montant_ht: 600, date_ref: '2026-03-01' }), F({ montant_ht: 200, date_ref: '2026-04-01' }), F({ etablissement_id: null, montant_ht: 150, date_ref: '2026-05-01' }), F({ etablissement_id: 'e-fusion-ailleurs', montant_ht: 50, date_ref: '2026-06-01' })]
    const a = agencesDuFournisseur('alpha', AGENCES, fs)
    expect(a.map((x) => [x.nom, x.ville, x.siret, x.nb_factures, x.total_ht, x.derniere_facture, x.part_pct])).toEqual([
      ['Alpha Ville A', 'Ville A', '99900099900011', 2, 800, '2026-04-01', 80], [SANS_AGENCE, '', '', 2, 200, '2026-06-01', 20], ['Dépôt', 'Ville B', '', 0, 0, null, 0]])
    expect(a.find((x) => x.sans_agence)?.cle).toBe('sans-agence')
    expect(agencesDuFournisseur('alpha', AGENCES, [F({})]).some((x) => x.sans_agence)).toBe(false) // pas de ligne « Sans agence » sans facture hors agence
    expect(agencesDuFournisseur(null, AGENCES, [F({ etablissement_id: null })]).map((x) => x.nom)).toEqual([SANS_AGENCE]) // fournisseur sans fiche : aucune agence
    expect(agencesDuFournisseur('beta', AGENCES, [])).toEqual([])
  })
  it('6 : graphique des dépenses par agence : seulement les totaux positifs, nom avec la ville si elle n’y est pas déjà', () => {
    const a = agencesDuFournisseur('alpha', AGENCES, [F({ montant_ht: 300 }), F({ etablissement_id: 'e2', montant_ht: -40, type_document: 'avoir' })])
    expect(barresAgences(a)).toEqual([{ nom: 'Alpha Ville A', valeur: 300 }])
    expect(nomAgence({ nom: 'Dépôt', ville: 'Ville B' })).toBe('Dépôt (Ville B)'); expect(nomAgence({ nom: 'Alpha VILLE A', ville: 'Ville A' })).toBe('Alpha VILLE A'); expect(nomAgence({ nom: SANS_AGENCE, ville: '' })).toBe(SANS_AGENCE)
  })
  it('7 : recherche sur le nom (sans casse ni accents) et sur le SIREN (espaces ignorés)', () => {
    const t = tableauFournisseurs(FICHES, [])
    expect(chercherFournisseurs(t, 'beta').map((l) => l.nom)).toEqual(['Bêta Location'])
    expect(chercherFournisseurs(t, '900 300').map((l) => l.nom)).toEqual(['Négoce Alpha'])
    expect(chercherFournisseurs(t, 'alpha negoce').length).toBe(1)
    expect(chercherFournisseurs(t, '  ').length).toBe(2); expect(chercherFournisseurs(t, 'zzz')).toEqual([])
  })
  it('8 : les articles les plus dépensés d’un fournisseur : par nom, classés par dépense, au plus 10', () => {
    const ls = [L({ montant_ht: 100 }), L({ montant_ht: 250 }), L({ article_fournisseur_id: 'a2', designation: 'Sable', reference_fournisseur: 'SAB', montant_ht: 900 }), L({ fournisseur: 'Autre', article_fournisseur_id: 'a3', designation: 'Vis', montant_ht: 5000 }),
      ...Array.from({ length: 12 }, (_, i) => L({ article_fournisseur_id: `b${i}`, designation: `Divers ${i}`, montant_ht: i + 1 }))]
    const t = topArticlesFournisseur(ls, [], 'NEGOCE alpha')
    expect(t.length).toBe(10)
    expect(t.slice(0, 2).map((x) => [x.nom, x.montant_ht, x.nb_lignes])).toEqual([['Sable', 900, 1], ['Ciment', 350, 2]])
    expect(t.some((x) => x.nom === 'Vis')).toBe(false)
    expect(topArticlesFournisseur(ls, [], 'Personne')).toEqual([])
  })
  it('9 : lecture : les valeurs de la base deviennent des nombres et des textes sûrs', () => {
    expect(enFiche({ fournisseur_id: 'a', fournisseur: 'X', siren: null, nb_agences: '3' })).toEqual({ fournisseur_id: 'a', fournisseur: 'X', siren: null, nb_agences: 3 })
    expect(enAgence({ etablissement_id: 'e', fournisseur_id: 'a', nom_agence: null, ville: 'V', siret: '1' })).toEqual({ etablissement_id: 'e', fournisseur_id: 'a', nom_agence: null, ville: 'V', siret: '1' })
    expect(enFacture({ facture_id: 'f', numero: null, date_ref: '2026-01-02', fournisseur_id: null, fournisseur: 'X', siren: null, etablissement_id: null, chantier: 'Sans chantier', type_document: 'avoir', montant_ht: '-12.50', nb_lignes: null }))
      .toMatchObject({ montant_ht: -12.5, nb_lignes: 0, fournisseur_id: null, type_document: 'avoir' })
  })
  it('10 : l’onglet a les filtres Période et Chantier, partagés avec les autres onglets', () => {
    expect(FILTRES_PAR_ONGLET.fournisseurs).toEqual(['periode', 'chantier'])
    const m0 = memoireParDefaut('2026-11-24')
    expect(m0.fournisseurs.periode).toEqual(m0.prix.periode)
    const m1 = appliquerChangement(m0, 'fournisseurs', { ...m0.fournisseurs, chantier: { type: 'liste', choix: ['Maison'] } })
    expect(m1.lignes.chantier).toEqual({ type: 'liste', choix: ['Maison'] }); expect(m1.dirigeant.chantier).toBeUndefined()
    expect(reinitialiser(m1, 'fournisseurs', '2026-11-24').fournisseurs.chantier).toBeUndefined()
  })
})
