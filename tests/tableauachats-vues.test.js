// Vues « Par fournisseur », « Par mois » et « Par article de référence » de l'onglet « Lignes et articles » : calculs purs.
import { describe, it } from 'node:test'
import { expect } from './_expect-tableauachats.js'
import { enLigneAchat, depenseParMois, regrouperParFournisseurAchats, regrouperParReference, topFournisseurs, topReferences, SANS_REFERENCE } from '../js/modules/tableauachats/lignes.js'
import { regrouperAchats } from '../js/modules/tableauachats/lignes.js'
                                       
import * as O from '../js/modules/tableauachats/options.js'

let n = 0
const L = (o                    )            => ({ ligne_id: `v${String(++n).padStart(4, '0')}`, facture_id: 'f1', numero: 'F-1', date_prix: '2026-06-10', fournisseur: 'Aciers du Sud', etablissement_id: 'e1', nom_agence: 'Agence Nord', ville: 'Ville A',
  chantier_id: 'c1', chantier: 'Maison', article_fournisseur_id: 'a1', reference_fournisseur: 'HA10', designation: 'Acier HA 10', unite: 'kg', unite_normalisee: 'kg', quantite: 1, montant_ht: 100, prix_net: 100,
  article_reference_id: null, libelle_reference: null, unite_reference: null, coefficient: null, prix_unite_reference: null, rapproche: false, origine_rapprochement: null, ...o })
const achats = (ls             ) => ls.map((l) => enLigneAchat(l))
const COULEURS             = { panneau: '#222', texte: '#fff', texte2: '#aaa', bordure: '#333', accent: '#ec0', serie: '#6af', bon: '#6d9', attention: '#fb6', mauvais: '#f88', neutre: '#aaa', palette: ['#1', '#2', '#3'] }

describe('Lignes et articles : vues supplémentaires', () => {
  it('1 : par fournisseur : dépense, part, lignes, articles distincts, chantiers et factures ; un nom = un fournisseur (sans casse ni accents)', () => {
    const ls = achats([
      L({ montant_ht: 300, facture_id: 'f1', article_fournisseur_id: 'a1', chantier: 'Maison' }),
      L({ montant_ht: 100, facture_id: 'f2', article_fournisseur_id: 'a2', chantier: 'Garage', fournisseur: 'ACIERS DU SUD' }),
      L({ montant_ht: 50, facture_id: 'f2', article_fournisseur_id: 'a2', chantier: 'Garage' }),
      L({ montant_ht: 450, facture_id: 'f3', fournisseur: 'Béton Démo', article_fournisseur_id: 'b1', chantier: null, chantier_id: null }),
      L({ montant_ht: 100, facture_id: 'f4', fournisseur: null, article_fournisseur_id: null, designation: 'Transport' }),
    ])
    const g = regrouperParFournisseurAchats(ls)
    expect(g.map((x) => [x.nom, x.montant_ht, x.part_pct, x.nb_lignes, x.nb_articles, x.nb_chantiers, x.nb_factures])).toEqual([
      ['Aciers du Sud', 450, 45, 3, 2, 2, 2], ['Béton Démo', 450, 45, 1, 1, 1, 1], ['Fournisseur inconnu', 100, 10, 1, 1, 1, 1]])
    expect(g.reduce((t, x) => t + x.montant_ht, 0)).toBe(1000) // rien n'est perdu ni compté deux fois
    expect(topFournisseurs(g, 2)).toEqual([{ nom: 'Aciers du Sud', valeur: 450 }, { nom: 'Béton Démo', valeur: 450 }])
    expect(regrouperParFournisseurAchats([])).toEqual([]) // cas vide
    // Même contenu que « Par chantier » pour le total : la somme des fournisseurs = la somme des chantiers
    expect(regrouperAchats(ls, 'chantier').reduce((t, x) => t + x.montant_ht, 0)).toBe(1000)
  })
  it('2 : par mois : un mois vide dans la période est à zéro (pas de trou) ; sans bornes, du premier au dernier mois acheté ; passage d’année', () => {
    const ls = achats([L({ date_prix: '2026-01-15', montant_ht: 100, facture_id: 'f1' }), L({ date_prix: '2026-01-20', montant_ht: 50, facture_id: 'f2', fournisseur: 'Béton Démo' }), L({ date_prix: '2026-04-02', montant_ht: 30, facture_id: 'f3' })])
    const m = depenseParMois(ls, { du: '2026-01-01', au: '2026-05-31' })
    expect(m.map((x) => x.mois)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'])
    expect(m.map((x) => x.total_ht)).toEqual([150, 0, 0, 30, 0])
    expect(m[0]).toEqual({ mois: '2026-01-01', total_ht: 150, nb_lignes: 2, nb_factures: 2, nb_fournisseurs: 2 })
    expect(m[1]).toEqual({ mois: '2026-02-01', total_ht: 0, nb_lignes: 0, nb_factures: 0, nb_fournisseurs: 0 })
    expect(depenseParMois(ls, null).map((x) => x.mois)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
    expect(depenseParMois(achats([L({ date_prix: '2025-11-30' })]), { du: '2025-11-01', au: '2026-02-28' }).map((x) => x.mois)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'])
    expect(depenseParMois([], null)).toEqual([]) // cas vide
    const o = O.barresMensuelles(m, COULEURS)                                                  
    expect(o.series[0].type).toBe('bar'); expect(o.series[0].data).toEqual([150, 0, 0, 30, 0]) // histogramme, mois à zéro compris
  })
  it('3 : par article de référence : fournisseurs, prix le plus bas et le plus haut (prix × coefficient), écart, dépense ; les achats sans référence forment une ligne « Sans référence »', () => {
    const ref = { rapproche: true, article_reference_id: 'r1', libelle_reference: 'Sac de ciment 25 kg', unite_reference: 'sac', origine_rapprochement: 'valide'          }
    const ls = achats([
      L({ ...ref, fournisseur: 'Négoce Fictif', quantite: 10, montant_ht: 80, coefficient: 1 }), // 8 € le sac
      L({ ...ref, fournisseur: 'Brico', article_fournisseur_id: 'a2', quantite: 4, montant_ht: 40, coefficient: 25 / 35, origine_rapprochement: 'automatique' }), // 10 € le sac de 35 kg → 7,142857 € le sac de 25 kg
      L({ ...ref, fournisseur: 'Brico', article_fournisseur_id: 'a2', quantite: 2, montant_ht: 30, coefficient: 1 }), // 15 €
      L({ fournisseur: 'Négoce Démo', montant_ht: 120, article_fournisseur_id: 'z1' }),
    ])
    const g = regrouperParReference(ls)
    expect(g.length).toBe(2)
    const [c, sans] = g
    expect(c.nom).toBe('Sac de ciment 25 kg'); expect(c.unite).toBe('sac'); expect(c.nb_fournisseurs).toBe(2); expect(c.nb_lignes).toBe(3); expect(c.montant_ht).toBe(150)
    expect(c.prix_min).toBeCloseTo(7.142857, 5); expect(c.prix_max).toBe(15); expect(c.ecart_pct).toBe(110) // (15 − 7,142857) / 7,142857 = 110 %
    expect(c.part_pct).toBe(55.6)
    expect(sans.nom).toBe(SANS_REFERENCE); expect(sans.sans_reference).toBe(true); expect(sans.montant_ht).toBe(120); expect(sans.prix_min).toBeNull(); expect(sans.ecart_pct).toBeNull(); expect(sans.part_pct).toBe(44.4)
    expect(topReferences(g)).toEqual([{ nom: 'Sac de ciment 25 kg', valeur: 150 }]) // « Sans référence » n'est pas un article : pas de barre
    // Un seul prix : pas d'écart ; pas de coefficient : pas de prix (jamais 0 inventé) ; cas vide
    const seul = regrouperParReference(achats([L({ ...ref, coefficient: 2, quantite: 5, montant_ht: 50 })]))[0]
    expect(seul.prix_min).toBe(20); expect(seul.prix_max).toBe(20); expect(seul.ecart_pct).toBeNull()
    const sansCoef = regrouperParReference(achats([L({ ...ref, coefficient: null })]))[0]
    expect(sansCoef.prix_min).toBeNull(); expect(sansCoef.nb_prix).toBe(0); expect(sansCoef.montant_ht).toBe(100)
    expect(regrouperParReference([])).toEqual([]); expect(topReferences(regrouperParReference(achats([L({})])))).toEqual([])
  })
})
