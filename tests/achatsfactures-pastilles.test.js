// Module Achats « Factures » (25/11/2026, PR 8a) : tests de la pastille des contrôles (couleur, texte, jamais vert à tort) et du score de confiance.
// Les cas sont ceux de l'appli d'origine (mêmes noms, mêmes valeurs) ; seules les fausses données changent (tests/_donnees-achatsfactures.js : aucune vraie identité, dépôt public).
import { test, describe } from 'node:test';
import { expect } from './_expect-achatsfactures.js';
import { calculerPastilles as calculerBrut, niveauPastille, PASTILLE_INCONNUE } from '../js/modules/achatsfactures/pastilles.js';
import { controleSiret, controlerFacture, normaliserIban, sirenDe } from '../js/modules/achatsfactures/controles.js';
import { scoreConfiance, presentationScore, POIDS_CONTROLES } from '../js/modules/achatsfactures/score.js';
import { IDENT, IBAN_D, IBAN_E, listeComplete, nombreLignes } from './_donnees-achatsfactures.js';

const calculer = (toutes, lignes, complete, analyses, ibans) => calculerBrut(toutes, lignes, complete, analyses, ibans, IDENT);
const c = (etat, o = {}) => ({ id: `x${Math.random()}`, titre: 'T', etat, phrase: 'phrase', ...o });
const neufs = (etat = 'ok') => Array.from({ length: 9 }, () => c(etat));
const AV = { statut: 'a_valider', extraction: {}, extraction_erreur: null };

describe('niveau de la pastille', () => {
  test('9 contrôles verts : vert', () => expect(niveauPastille(neufs(), AV).niveau).toBe('ok'))
  test('une anomalie : danger rouge', () => {
    const p = niveauPastille([...neufs().slice(1), c('anomalie', { titre: 'Doublon', phrase: 'Doublon : déjà acceptée.' })], AV)
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(true); expect(p.texte).toContain('Anomalie : ')
  })
  test('seulement une alerte : danger orange (premier IBAN vu par exemple)', () => {
    const p = niveauPastille([...neufs().slice(1), c('alerte')], AV)
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(false)
  })
  test('un « à confirmer » gris : danger orange, jamais vert', () => {
    const p = niveauPastille([...neufs().slice(1), c('indisponible', { aConfirmer: true })], AV)
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(false)
  })
  test('un contrôle indisponible simple : jamais vert, gris', () => {
    const p = niveauPastille([...neufs().slice(1), c('indisponible')], AV)
    expect(p.niveau).toBe('neutre'); expect(p.texte).toBe('Rien de spécial')
  })
  test('les contrôles « Bientôt » sont ignorés', () => {
    expect(niveauPastille([...neufs(), c('indisponible', { bientot: true })], AV).niveau).toBe('ok')
  })
  test('l’infobulle cite 2 points au plus', () => {
    const p = niveauPastille([c('anomalie', { phrase: 'T : un' }), c('anomalie', { phrase: 'T : deux' }), c('alerte', { phrase: 'T : trois' }), ...neufs().slice(3)], AV)
    expect(p.texte).toContain('un'); expect(p.texte).toContain('deux'); expect(p.texte).not.toContain('trois'); expect(p.texte).toContain('1 autre')
  })
  test('facture illisible : gris avec la phrase dédiée', () => {
    expect(niveauPastille(neufs('indisponible'), { statut: 'a_valider', extraction: null, extraction_erreur: 'pdf_trop_gros' }).texte).toBe('Contrôles non faits : à regarder à la main')
  })
  test('facture décidée : toujours gris', () => {
    const p = niveauPastille([c('anomalie')], { ...AV, statut: 'acceptee' })
    expect(p.niveau).toBe('neutre')
  })
})

describe('6. SIRET : annuaire indisponible', () => {
  test('6 : pastille orange (danger non rouge), jamais verte, avec « n’a pas été fait »', () => {
    const x = { fournisseur: { nom: 'Point Q', siret: '50000000500008', siren: null, adresse: null }, annuaire: { interroge: false } }
    const siret = controleSiret(x)
    expect(siret.etat).toBe('indisponible'); expect(siret.aConfirmer).toBe(true)
    const p = niveauPastille([...neufs().slice(1), siret], AV)
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(false); expect(p.texte).toContain('n’a pas été fait')
  })
})

describe('calcul pour toute la liste', () => {
  const aValider = (liste) => liste.filter((x) => x.statut === 'a_valider');
  test('un calcul qui échoue donne une pastille grise, sans casser la liste', () => {
    const mauvaise = { id: 'z', statut: 'a_valider', get extraction() { throw new Error('boum') } }
    const r = calculer([mauvaise], {}, true, true, [])
    expect(r.z.niveau).toBe('neutre'); expect(r.z.texte).toContain('Contrôles non faits')
  })
  test('lignes null : jamais vert, et aucune carte ne passe en danger à cause des lignes', () => {
    const liste = listeComplete()
    const avec = calculer(liste, nombreLignes(), true, true, [])
    const sans = calculer(liste, null, true, true, [])
    expect(Object.values(sans).some((p) => p.niveau === 'ok')).toBe(false)
    for (const f of aValider(liste)) {
      // Un danger sans les lignes existe déjà avec les lignes (mêmes 8 autres contrôles) ; les lignes seules ne créent rien.
      if (sans[f.id].niveau === 'danger') expect(avec[f.id].niveau).toBe('danger')
      expect(sans[f.id].texte).not.toContain('Lignes :')
    }
    // a12 est verte avec les lignes ; sans elles, gris explicite (jamais vert, jamais orange).
    expect(avec.a12.niveau).toBe('ok')
    expect(sans.a12.niveau).toBe('neutre'); expect(sans.a12.texte).toContain('Lignes non vérifiées')
  })
  test('analyses non lues : les factures à valider restent grises, « Contrôles non faits »', () => {
    const liste = listeComplete()
    const r = calculer(liste, nombreLignes(), true, false, [])
    for (const f of aValider(liste)) { expect(r[f.id].niveau).toBe('neutre'); expect(r[f.id].texte).toContain('Contrôles non faits') }
  })
  test('liste incomplète : factures liées inconnues, jamais vert', () => {
    expect(Object.values(calculer(listeComplete(), nombreLignes(), false, true, [])).some((p) => p.niveau === 'ok')).toBe(false)
  })
  test('sans l’identité de l’espace (destinataire non vérifié) : jamais vert', () => {
    const r = calculerBrut(listeComplete(), nombreLignes(), true, true, [], null)
    expect(Object.values(r).some((p) => p.niveau === 'ok')).toBe(false)
    expect(r.a12.niveau).toBe('neutre')
  })
  test('une facture décidée a toujours la pastille grise « déjà décidée »', () => {
    const r = calculer(listeComplete(), nombreLignes(), true, true, [])
    expect(r.h1).toEqual({ niveau: 'neutre', rouge: false, texte: 'Facture déjà décidée : rien à contrôler' })
  })
  test('une facture inconnue de la liste a la pastille grise par défaut', () => {
    expect(PASTILLE_INCONNUE.niveau).toBe('neutre'); expect(PASTILLE_INCONNUE.texte).toContain('Contrôles non faits')
  })
})

describe('même résultat que l’écran Examiner (fausses données)', () => {
  test('chaque facture à valider : la pastille égale le calcul de l’Examiner', () => {
    const liste = listeComplete()
    const pastilles = calculer(liste, nombreLignes(), true, true, [])
    let compte = 0
    for (const f of liste.filter((x) => x.statut === 'a_valider')) {
      const siren = f.fournisseur_siren ?? sirenDe(f.extraction)
      const iban = f.iban_normalise ?? normaliserIban(f.extraction?.iban)
      const memes = siren ? liste.filter((a) => a.fournisseur_siren === siren && a.id !== f.id) : []
      const ailleurs = siren && iban ? liste.filter((a) => a.id !== f.id && a.iban_normalise === iban && !!a.fournisseur_siren && a.fournisseur_siren !== siren) : []
      const lignes = Array.from({ length: nombreLignes()[f.id] ?? 0 }, (_, i) => ({ position: i + 1 }))
      const attendu = niveauPastille(controlerFacture(f, memes, ailleurs, lignes, [], IDENT), f)
      expect(pastilles[f.id]).toEqual(attendu)
      compte++
    }
    expect(compte).toBeGreaterThan(5)
  })
  test('les fausses données montrent les trois couleurs, rouge et orange comprises', () => {
    const r = Object.values(calculer(listeComplete(), nombreLignes(), true, true, []))
    expect(r.some((p) => p.niveau === 'ok')).toBe(true)
    expect(r.some((p) => p.niveau === 'neutre')).toBe(true)
    expect(r.some((p) => p.niveau === 'danger' && p.rouge)).toBe(true)
    expect(r.some((p) => p.niveau === 'danger' && !p.rouge)).toBe(true)
  })
  test('le doublon d’une facture déjà acceptée est rouge, et la pastille le dit', () => {
    const p = calculer(listeComplete(), nombreLignes(), true, true, []).a14
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(true); expect(p.texte).toContain('Doublon')
  })
})

describe('facture piège (IBAN du fournisseur sur la facture d’un autre) : niveaux de la pastille', () => {
  const piege = (statut) => {
    const liste = listeComplete()
    const sain = liste.find((f) => f.id === 'a12')
    const trap = { ...sain, id: 'piege', statut, fournisseur: 'Fournisseur piège', fournisseur_siren: '500000005', iban_normalise: sain.iban_normalise, numero: 'PIEGE-9', numero_normalise: 'PIEGE-9' }
    return [...liste.filter((f) => f.id !== 'h11'), trap]
  }
  test('piège refusé : la facture saine du vrai titulaire reste verte', () => {
    expect(calculer(piege('refusee'), nombreLignes(), true, true, []).a12.niveau).toBe('ok')
  })
  test('piège encore à valider d’un autre SIREN : alerte orange', () => {
    const p = calculer(piege('a_valider'), nombreLignes(), true, true, []).a12
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(false)
  })
  test('piège accepté par erreur : rouge', () => {
    const p = calculer(piege('acceptee'), nombreLignes(), true, true, []).a12
    expect(p.niveau).toBe('danger'); expect(p.rouge).toBe(true)
  })
  test('fausses données : piège refusé h11 — le vrai titulaire a12 reste vert, un autre SIREN avec le même IBAN (a13) n’est jamais vert', () => {
    const r = calculer(listeComplete(), nombreLignes(), true, true, [])
    expect(r.a12.niveau).toBe('ok')
    expect(r.a13.niveau).toBe('danger'); expect(r.a13.rouge).toBe(false)
  })
})

describe('5 : pastille et IBAN confirmés', () => {
  const IBAN = IBAN_D
  const facture = {
    id: 'p1', statut: 'a_valider', fournisseur_siren: '500000021', iban_normalise: IBAN, numero: 'A1', numero_normalise: 'A1', montant_ttc: 120, date_facture: '2026-11-01', extraction_erreur: null,
    extraction: { fournisseur: { nom: 'X', siret: '50000002100005', siren: '500000021', adresse: null }, destinataire: { nom: null, siret: null, siren: null, adresse: null }, numero: 'A1', date_facture: '2026-11-01', montant_ht: 100, montant_tva: 20, montant_ttc: 120, devise: 'EUR', iban: IBAN, annuaire: { interroge: false } },
  }
  test('5 : IBAN révoqué : pastille rouge qui cite la révocation ; confirmé : plus de point sur l’IBAN ; liste illisible (null) : jamais de vert', () => {
    const revoque = calculer([facture], {}, true, true, [{ iban: IBAN, siren: '500000021', revoque_le: '2026-11-20T10:00:00Z', motif_revocation: 'RIB piraté' }]).p1
    expect(revoque.niveau).toBe('danger'); expect(revoque.rouge).toBe(true); expect(revoque.texte).toContain('révoqué')
    const confirme = calculer([facture], {}, true, true, [{ iban: IBAN, siren: '500000021', revoque_le: null }]).p1
    expect(confirme.texte).not.toContain('révoqué'); expect(confirme.texte).not.toContain('Premier IBAN')
    expect(calculer([facture], {}, true, true, null).p1.niveau).not.toBe('ok')
  })
})

// ---------------------------------------------------------------- score de confiance (lib/score-confiance de l'appli d'origine)
const tous = (etat = 'ok', surcharge = {}) => Object.keys(POIDS_CONTROLES).map((id) => ({ id, titre: id, etat, phrase: 'x', ...surcharge[id] }))

describe('score de confiance', () => {
  test('1 : tout vert = 100, jamais écrit comme une garantie', () => {
    const s = scoreConfiance(tous())
    expect(s.score).toBe(100); expect(s.niveau).toBe('eleve'); expect(s.texte).toContain('pas une garantie')
  })
  test('2 : une anomalie plafonne à 40', () => {
    const s = scoreConfiance(tous('ok', { totaux: { etat: 'anomalie' } }))
    expect(s.score).toBeLessThanOrEqual(40); expect(s.niveau).toBe('faible')
  })
  test('3 : SIRET non fait (annuaire en panne) : score plafonné à 70 et cité comme non fait, jamais 100', () => {
    const s = scoreConfiance(tous('ok', { siret: { etat: 'indisponible', aConfirmer: true } }))
    expect(s.score).toBeLessThanOrEqual(70); expect(s.nonFaits).toEqual(['siret']); expect(s.texte).toContain('non faits : siret')
  })
  test('4 : un contrôle non fait pèse sur le score même sans « à confirmer »', () => {
    expect(scoreConfiance(tous('ok', { lignes: { etat: 'indisponible' } })).score).toBeLessThan(100)
  })
  test('5 : trop peu de contrôles faits : pas de score', () => {
    const s = scoreConfiance(tous('indisponible'))
    expect(s.score).toBeNull(); expect(s.niveau).toBe('non_evalue')
  })
  test('6 : les alertes baissent le score sans le mettre à zéro', () => {
    const s = scoreConfiance(tous('alerte'))
    expect(s.score).toBe(40)
  })
  test('7 : les contrôles « bientôt » sont ignorés', () => {
    expect(scoreConfiance([...tous(), { id: 'futur', titre: 'f', etat: 'indisponible', phrase: '', bientot: true }]).score).toBe(100)
  })
  test('8a : une seule alerte : jamais vert', () => {
    const s = scoreConfiance(tous('ok', { iban: { etat: 'alerte' } }))
    expect(s.score).toBeLessThanOrEqual(84); expect(s.niveau).not.toBe('eleve')
  })
  test('8b : montants illisibles (totaux non fait) : jamais vert', () => {
    expect(scoreConfiance(tous('ok', { totaux: { etat: 'indisponible' } })).niveau).not.toBe('eleve')
  })
  test('8c : destinataire illisible : jamais vert', () => {
    expect(scoreConfiance(tous('ok', { destinataire: { etat: 'indisponible' } })).niveau).not.toBe('eleve')
  })
  test('8d : facture sans IBAN (contrôle non fait) : jamais vert, c’est voulu', () => {
    expect(scoreConfiance(tous('ok', { iban: { etat: 'indisponible' } })).score).toBeLessThanOrEqual(84)
  })
  test('8e : SIREN seul (SIRET en alerte) : 70 au plus', () => {
    expect(scoreConfiance(tous('ok', { siret: { etat: 'alerte' } })).score).toBeLessThanOrEqual(70)
  })
  test('8f : alerte de l’écran (nom différent) : pas vert, phrase non rassurante', () => {
    const r = scoreConfiance(tous(), 1)
    expect(r.score).toBeLessThanOrEqual(84)
    const p = presentationScore(r, 1)
    expect(p.couleur).not.toBe('vert'); expect(p.phrase).not.toContain('aucun point'); expect(p.phrase).toContain('1 alerte')
  })
  test('8g : tout vert sans rien : 100 et vert', () => {
    const r = scoreConfiance(tous())
    expect(r.score).toBe(100); expect(presentationScore(r).couleur).toBe('vert')
  })
})

const r = (o) => ({ score: 90, niveau: 'eleve', couverture: 100, nonFaits: [], alertes: [], anomalie: false, texte: '', ...o })

describe('1. barre de score de confiance (présentation)', () => {
  test('1a. couleur par seuil : vert 85+, orange 60-84, rouge en dessous', () => {
    expect(presentationScore(r({ score: 85, niveau: 'eleve' })).couleur).toBe('vert')
    expect(presentationScore(r({ score: 72, niveau: 'moyen', nonFaits: ['SIRET'] })).couleur).toBe('orange')
    expect(presentationScore(r({ score: 59, niveau: 'faible' })).couleur).toBe('rouge')
  })
  test('1b. non calculé : gris, phrase dédiée', () => {
    const p = presentationScore(r({ score: null, niveau: 'non_evalue' }))
    expect(p.couleur).toBe('gris'); expect(p.phrase).toBe('Non calculé : trop peu de contrôles faits')
  })
  test('1c. phrases : élevée, moyenne avec raison, faible avec anomalie', () => {
    expect(presentationScore(r({})).phrase).toBe('Élevée : aucun point d’attention')
    expect(presentationScore(r({ score: 72, niveau: 'moyen', nonFaits: ['SIRET'] })).phrase).toBe('Moyenne : 1 contrôle non fait (SIRET)')
    expect(presentationScore(r({ score: 30, niveau: 'faible', anomalie: true })).phrase).toBe('Faible : une anomalie à regarder')
  })
  test('1d. la valeur s’écrit « 72 / 100 »', () => {
    expect(presentationScore(r({ score: 72, niveau: 'moyen', nonFaits: ['SIRET'] })).valeur).toBe('72 / 100')
  })
  test('1e. le résultat réel de scoreConfiance alimente la présentation sans erreur', () => {
    expect(presentationScore(scoreConfiance([])).couleur).toBe('gris')
  })
})
