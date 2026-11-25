// Ports de « decision.test.ts » (12 cas), « liaison-chantier.test.ts » (6 cas) et « rouverture.test.ts » (9 cas) de l'appli BTP : mêmes cas, mêmes valeurs ; noms fictifs.
// Pour « rouverture », la partie réseau passe ici par la couche des actions de l'OS (js/os/actions-metier.js) avec un faux réseau : il n'y a plus de fonction `rouvrirFacture` ni de variable d'environnement, la couche envoie un ticket neuf.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { expect } from './_expect-achatsfactures.js'
import { alertesAffichees } from '../js/modules/achatsfactures/controles.js'
import { alerteNomFournisseur, comparerNomFournisseur, construireCorps, motifValide, CODES_LIAISON_PERIMEE, AUCUN_CHANTIER, chantierDepuisChamp, corpsLiaison, offreLiaison, valeurChampChantier, corpsRouverture, MESSAGE_MOTIF, motifRouverture, offreRouverture, PHRASE_ARCHIVEE } from '../js/modules/achatsfactures/decision.js'
import { actionArchivage, valeursDeFiltre, SANS_CHANTIER } from '../js/modules/achatsfactures/logique.js'
import { creerActions, messageServeur } from '../js/os/actions-metier.js'

const c = (id, etat, extra = {}) => ({ id, titre: `T-${id}`, etat, phrase: 'p', ...extra })

describe('alertesAffichees', () => {
  test('garde orange et rouge, ignore ok, indisponible et grisées', () => {
    const r = alertesAffichees([c('a', 'ok'), c('b', 'alerte'), c('c', 'anomalie'), c('d', 'indisponible'), c('e', 'anomalie', { bientot: true })])
    expect(r.map((x) => [x.code, x.niveau])).toEqual([['b', 'orange'], ['c', 'rouge']])
    expect(r[0].message).toBe('T-b : p')
    expect(alertesAffichees([{ id: 'doublon', titre: 'Doublon', etat: 'anomalie', phrase: 'Doublon : la facture n° 1 est déjà acceptée.' }])[0].message).toBe('Doublon : la facture n° 1 est déjà acceptée.')
  })
  test('borne les textes à 300 caractères et la liste à 20', () => {
    const r = alertesAffichees(Array.from({ length: 30 }, (_, i) => c(`x${i}`, 'alerte', { phrase: 'z'.repeat(900) })))
    expect(r).toHaveLength(20)
    expect(r[0].message.length).toBe(300)
  })
})

describe('construireCorps', () => {
  const al = [{ code: 'totaux', niveau: 'rouge', message: 'm' }]
  const choix = { chantier_id: 'ch1', etablissement_id: 'ag1' }
  test('sans alerte : facture, décision, chantier et agence', () => {
    expect(construireCorps('f1', 'accepter', undefined, undefined, choix)).toEqual({ facture_id: 'f1', decision: 'accepter', chantier_id: 'ch1', etablissement_id: 'ag1' })
    expect(construireCorps('f1', 'accepter', 'ignoré', [], choix)).toEqual({ facture_id: 'f1', decision: 'accepter', chantier_id: 'ch1', etablissement_id: 'ag1' })
  })
  test('1 : accepter sans chantier est permis : chantier_id part à null (clé jamais omise) ; sans agence : erreur claire, rien n\'est envoyé', () => {
    expect(construireCorps('f1', 'accepter', undefined, undefined, { chantier_id: null, etablissement_id: 'ag1' })).toEqual({ facture_id: 'f1', decision: 'accepter', chantier_id: null, etablissement_id: 'ag1' })
    expect(() => construireCorps('f1', 'accepter')).toThrow(/agence/)
    expect(() => construireCorps('f1', 'accepter', undefined, undefined, { chantier_id: 'ch1', etablissement_id: null })).toThrow(/agence/)
  })
  test('avec alertes : motif obligatoire', () => {
    expect(() => construireCorps('f1', 'accepter', ' ab ', al, choix)).toThrow(/pourquoi/)
    expect(construireCorps('f1', 'accepter', '  Accord du client  ', al, choix)).toEqual({ facture_id: 'f1', decision: 'accepter', chantier_id: 'ch1', etablissement_id: 'ag1', alertes: al, motif: 'Accord du client' })
  })
  test('le corps ne contient jamais d\'e-mail ni d\'identifiant de personne', () => {
    const texte = JSON.stringify(construireCorps('f1', 'accepter', 'Accord', al, choix))
    expect(texte).not.toMatch(/mail|decide_par|user|qui/i)
  })
  test('refus : alertes, chantier et agence jamais envoyés', () => {
    expect(construireCorps('f1', 'refuser', 'Doublon', al, choix)).toEqual({ facture_id: 'f1', decision: 'refuser', motif: 'Doublon' })
    expect(construireCorps('f1', 'refuser', 'Doublon')).toEqual({ facture_id: 'f1', decision: 'refuser', motif: 'Doublon' })
  })
})

describe('motifValide', () => {
  test('motif : 3 à 500 caractères après trim', () => {
    expect(motifValide('  ab ')).toBe(false)
    expect(motifValide('abc')).toBe(true)
    expect(motifValide('a'.repeat(501))).toBe(false)
  })
})

describe('5. nom de la facture et nom de l’entreprise enregistrée', () => {
  test('5a. noms différents : alerte orange « nom-fournisseur » avec les deux noms', () => {
    const a = alerteNomFournisseur('Matériaux Exemple', 'Location Fictive')
    expect(a).toMatchObject({ code: 'nom-fournisseur', niveau: 'orange' })
    expect(a?.message).toContain('Matériaux Exemple'); expect(a?.message).toContain('Location Fictive')
  })
  test('5b. noms cohérents (forme juridique et accents ignorés) : aucune alerte', () => {
    expect(alerteNomFournisseur('MATERIAUX EXEMPLE SAS', 'Matériaux Exemple')).toBeNull()
    expect(comparerNomFournisseur('MATERIAUX EXEMPLE SAS', 'Matériaux Exemple')).toBe('coherent')
  })
  test('5c. un nom manque : rien', () => {
    expect(alerteNomFournisseur(null, 'Location Fictive')).toBeNull(); expect(alerteNomFournisseur('Location Fictive', '')).toBeNull(); expect(comparerNomFournisseur(undefined, undefined)).toBeNull()
  })
  test('5d. l’alerte est envoyée au serveur à l’acceptation, avec le motif obligatoire', () => {
    const al = alerteNomFournisseur('A Béton', 'Location Fictive')
    const corps = construireCorps('f1', 'accepter', 'ok vérifié', [al], { chantier_id: null, etablissement_id: 'ag1' })
    expect(corps.alertes).toEqual([al])
    expect(() => construireCorps('f1', 'accepter', '', [al], { chantier_id: null, etablissement_id: 'ag1' })).toThrow()
  })
})

describe('3 : relier plus tard une facture acceptée à un chantier', () => {
  test('3 : le bouton n\'est offert que pour une facture acceptée, sans chantier, non archivée', () => {
    expect(offreLiaison({ statut: 'acceptee', chantier_id: null })).toBe('bouton')
    expect(offreLiaison({ statut: 'acceptee', chantier_id: null, archivee_le: null })).toBe('bouton')
    expect(offreLiaison({ statut: 'acceptee', chantier_id: null, archivee_le: '2026-11-01T10:00:00Z' })).toBe('archivee')
    expect(offreLiaison({ statut: 'acceptee', chantier_id: 'ch1' })).toBe('aucune')
    expect(offreLiaison({ statut: 'refusee', chantier_id: null })).toBe('aucune')
    expect(offreLiaison({ statut: 'a_valider', chantier_id: null })).toBe('aucune')
  })
  test('3 : le corps envoyé ne contient que la facture et le chantier (jamais d\'identité) ; sans chantier, rien n\'est envoyé', () => {
    expect(corpsLiaison('f1', 'ch1')).toEqual({ facture_id: 'f1', chantier_id: 'ch1' })
    expect(() => corpsLiaison('f1', null)).toThrow(/chantier/)
  })
  test('1 : « Aucun chantier » est une vraie option du champ : valeur null côté facture, jamais envoyée comme un identifiant', () => {
    expect(valeurChampChantier(null)).toBe(AUCUN_CHANTIER)
    expect(valeurChampChantier('ch1')).toBe('ch1')
    expect(chantierDepuisChamp(AUCUN_CHANTIER)).toBeNull()
    expect(chantierDepuisChamp('ch1')).toBe('ch1')
    expect(construireCorps('f1', 'accepter', undefined, undefined, { chantier_id: chantierDepuisChamp(AUCUN_CHANTIER), etablissement_id: 'ag1' }))
      .toEqual({ facture_id: 'f1', decision: 'accepter', chantier_id: null, etablissement_id: 'ag1' })
  })
  test('2 : une facture « à valider » ne propose jamais d\'archivage ; une facture acceptée sans chantier s\'archive', () => {
    expect(actionArchivage({ statut: 'a_valider', archivee_le: null })).toBeNull()
    expect(actionArchivage({ statut: 'acceptee', archivee_le: null })).toBe('archiver')
  })
  test('7 : le filtre « Chantier non affecté » existe dans la liste des factures dès qu\'une facture n\'a pas de chantier', () => {
    const f = (id, chantiers) => ({ id, fournisseur: 'ALPHA', chantiers })
    expect(valeursDeFiltre([f('1', null), f('2', { nom: 'Résidence' })]).chantiers).toContain(SANS_CHANTIER)
    expect(valeursDeFiltre([f('2', { nom: 'Résidence' })]).chantiers).not.toContain(SANS_CHANTIER)
  })
  test('3 : un refus « facture déjà reliée / archivée / plus acceptée / introuvable » ferme la fenêtre et relit la facture ; un chantier fermé reste dans la fenêtre', () => {
    for (const code of ['facture_deja_reliee', 'liaison_facture_archivee', 'liaison_facture_non_acceptee', 'facture_introuvable']) expect(CODES_LIAISON_PERIMEE.has(code)).toBe(true)
    for (const code of ['chantier_termine', 'chantier_suspendu', 'chantier_archive', 'chantier_introuvable']) expect(CODES_LIAISON_PERIMEE.has(code)).toBe(false)
  })
})

const ID = '11111111-1111-4111-8111-111111111111'

describe('offreRouverture : ce que l’écran propose', () => {
  test('à valider : rien à rouvrir', () => expect(offreRouverture({ statut: 'a_valider' })).toBe('aucune'))
  test('acceptée ou refusée, pas archivée : le bouton', () => {
    expect(offreRouverture({ statut: 'acceptee' })).toBe('bouton')
    expect(offreRouverture({ statut: 'refusee', archivee_le: null })).toBe('bouton')
  })
  test('archivée : la phrase « sors-la des archives », jamais le bouton', () => {
    expect(offreRouverture({ statut: 'acceptee', archivee_le: '2026-11-10T08:00:00Z' })).toBe('archivee')
    expect(offreRouverture({ statut: 'refusee', archivee_le: '2026-11-10T08:00:00Z' })).toBe('archivee')
    expect(PHRASE_ARCHIVEE).toBe('Sors-la des archives pour la rouvrir.')
  })
})

describe('motif de réouverture : 3 à 500 caractères', () => {
  test('refuse vide, espaces, trop court, trop long, avec une phrase française', () => {
    for (const m of ['', '   ', 'ab', '  a ', 'x'.repeat(501)]) expect(() => motifRouverture(m)).toThrow(MESSAGE_MOTIF)
    expect(MESSAGE_MOTIF).toMatch(/3 à 500/)
  })
  test('accepte les bornes et rogne', () => {
    expect(motifRouverture('abc')).toBe('abc')
    expect(motifRouverture('x'.repeat(500))).toHaveLength(500)
    expect(motifRouverture('  Mauvais chantier ')).toBe('Mauvais chantier')
  })
})

describe('appel du webhook « actions métier » (couche des actions de l’OS, faux réseau)', () => {
  const H = ['https', '://n8n-essai.invalid/actions'].join('')
  const monter = (statut, corps) => {
    const appels = []
    const fetchImpl = async (url, init) => { appels.push({ url, init }); return { ok: statut < 300, status: statut, json: async () => corps } }
    const a = creerActions({ lireConnexion: () => ({ webhooks: { actions: H } }), demanderTicket: async () => 'ticket-1', fetchImpl })
    // Même appel que js/modules/achatsfactures/donnees-examiner.js : appelerActionMetier('rouvrir', corpsRouverture(id, motif)).
    return { appels, rouvrir: async (id, motif) => a.appelerActionMetier('rouvrir', corpsRouverture(id, motif)) }
  }
  test('corps exact : { action, facture_id, motif }, aucune identité', async () => {
    const m = monter(200, { ok: true, facture_id: ID })
    await m.rouvrir(ID, '  Mauvais chantier ')
    expect(JSON.parse(m.appels[0].init.body)).toEqual({ action: 'rouvrir', facture_id: ID, motif: 'Mauvais chantier' })
    expect(corpsRouverture(ID, 'abc')).toEqual({ facture_id: ID, motif: 'abc' })
  })
  test('motif invalide : rien n’est envoyé', async () => {
    const m = monter(200, { ok: true })
    await assert.rejects(m.rouvrir(ID, 'ab'), { message: MESSAGE_MOTIF })
    expect(m.appels).toHaveLength(0)
  })
  test('refus du serveur : phrase française du serveur, code gardé', async () => {
    const m = monter(409, { ok: false, code: 'rouverture_facture_archivee', erreur: 'Cette facture est archivée : sors-la d’abord des archives pour la rouvrir.' })
    await assert.rejects(m.rouvrir(ID, 'Motif valable'), (e) => e.code === 'rouverture_facture_archivee' && /archives/.test(e.message))
  })
  test('erreur 500 : phrase générique, rien de technique', () => {
    expect(messageServeur(500, { erreur: 'détail technique' })).toMatch(/erreur est survenue/)
  })
})
