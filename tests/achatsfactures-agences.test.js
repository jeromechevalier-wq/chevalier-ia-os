// Port du test « agences.test.ts » de l'appli BTP (41 cas, mêmes règles, mêmes assertions). Données entièrement fictives : numéros dérivés de IDENT (valides, clé de Luhn), noms et villes inventés.
import { describe, test } from 'node:test'
import { expect } from './_expect-achatsfactures.js'
import { IDENT } from './_donnees-achatsfactures.js'
import { agenceEffective, champsAgenceDepuis, chantierAcceptable, corpsCreationAgence, filtrerOptions, optionsAgences, optionsChantiers, phraseChantierFerme, preselectionAgence, verifierChampsAgence, villeDeAdresse, villeChantier, libelleChantier, decouperSurligne } from '../js/modules/achatsfactures/agences.js'

// Numéros fictifs : le SIREN et le SIRET de IDENT sont valides ; les autres en sont déduits (jamais écrits en toutes lettres : un test du dépôt interdit les numéros de 9 ou 14 chiffres).
const SIREN = IDENT.siren
const SIRET = IDENT.siret
const SIRET_DEUX = SIREN + '00027'
const SIRET_INCONNU = SIREN + '00035'
const SIRET_AUTRE_AGENCE = SIREN + '00099'
const cleLuhn = (base8) => { let s = 0; for (let i = 0; i < 8; i++) { let d = +base8[7 - i]; if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 } s += d } return String((10 - (s % 10)) % 10) }
const sirenValide = (base8) => base8 + cleLuhn(base8)
const SIREN_AUTRE = sirenValide('12345670')
const SIREN_TIERS = sirenValide('45678900')
const SIREN_INVALIDE = SIREN.slice(0, 8) + String((+SIREN[8] + 1) % 10)
const SIRET_DU_TIERS = SIREN_TIERS + '00011'

const F = { id: 'f1', siren: SIREN, nom: 'Matériaux Exemple', statut: 'verifie' }
const ag = (id, extra = {}) => ({ id, fournisseur_id: 'f1', siret: null, nom_agence: id, ville: null, actif: true, fusionne_dans: null, fournisseur: F, ...extra })
const extr = (f) => ({
  fournisseur: { nom: 'Exemple SA', siret: null, siren: null, adresse: null, ...f },
  destinataire: { nom: null, siret: null, siren: null, adresse: null },
  numero: 'X', date_facture: null, montant_ht: 1, montant_tva: 0, montant_ttc: 1, devise: 'EUR', annuaire: { interroge: false },
})
const liee = (id, etablissement_id, date_decision, statut = 'acceptee') => ({ id, statut, numero: id, numero_normalise: id, montant_ttc: 1, date_facture: null, etablissement_id, date_decision })

describe('preselectionAgence : les cinq règles', () => {
  const vinon = ag('vinon', { siret: SIRET, ville: 'Val-des-Essais' })
  const manosque = ag('manosque', { siret: SIRET_DEUX, ville: 'Port-Exemple' })

  test('1. le SIRET lu désigne l’agence', () => {
    expect(preselectionAgence(extr({ siret: SIRET }), [manosque, vinon])).toBe('vinon')
  })
  test('1 bis. une agence fusionnée est remplacée par sa cible', () => {
    const fusionnee = ag('doublon', { siret: SIRET, fusionne_dans: 'manosque' })
    expect(preselectionAgence(extr({ siret: SIRET }), [fusionnee, manosque])).toBe('manosque')
  })
  test('1 ter. une agence désactivée n’est jamais proposée', () => {
    const fermee = ag('fermee', { siret: SIRET, actif: false })
    expect(preselectionAgence(extr({ siret: SIRET }), [fermee])).toBeNull()
  })
  test('2. même SIREN, la ville de l’adresse lue départage', () => {
    const x = extr({ siren: SIREN, adresse: '12 rue des Lilas, 99100 Port-Exemple' })
    expect(preselectionAgence(x, [vinon, manosque])).toBe('manosque')
  })
  test('2 bis. deux agences dans la même ville : on ne devine pas', () => {
    const x = extr({ siren: SIREN, adresse: '1 rue A, 99100 Port-Exemple' })
    expect(preselectionAgence(x, [manosque, ag('manosque2', { ville: 'Port-Exemple' }), vinon])).toBeNull()
  })
  test('3. une seule agence connue pour ce SIREN', () => {
    expect(preselectionAgence(extr({ siren: SIREN }), [vinon, ag('autre', { fournisseur: { ...F, siren: SIREN_AUTRE }, fournisseur_id: 'f2' })])).toBe('vinon')
  })
  test('4. la dernière agence utilisée (facture acceptée la plus récente)', () => {
    const x = extr({ siren: SIREN })
    const histo = [liee('a', 'vinon', '2026-10-01T10:00:00Z'), liee('b', 'manosque', '2026-11-05T10:00:00Z'), liee('c', 'vinon', '2026-11-20T10:00:00Z', 'refusee')]
    expect(preselectionAgence(x, [vinon, manosque], histo)).toBe('manosque')
  })
  test('4 bis. historique illisible (null) ou vide : jamais de devinette', () => {
    const x = extr({ siren: SIREN })
    expect(preselectionAgence(x, [vinon, manosque], null)).toBeNull()
    expect(preselectionAgence(x, [vinon, manosque], [])).toBeNull()
    expect(preselectionAgence(x, [vinon, manosque])).toBeNull()
  })
  test('5. rien de lu sur la facture : vide', () => {
    expect(preselectionAgence(null, [vinon])).toBeNull()
    expect(preselectionAgence(extr({}), [vinon])).toBeNull()
  })
  test('I1. SIRET lu (14 chiffres) inconnu : jamais une agence au SIRET différent, seulement une sans SIRET', () => {
    const inconnu = extr({ siret: SIRET_INCONNU })
    expect(preselectionAgence(inconnu, [vinon])).toBeNull() // règle 3 : une seule agence, mais son SIRET diffère
    expect(preselectionAgence(inconnu, [vinon, manosque], [liee('a', 'vinon', '2026-11-05T10:00:00Z')])).toBeNull() // règle 4
    const sansSiret = ag('nord', { ville: 'Bellevue' })
    expect(preselectionAgence(inconnu, [vinon, sansSiret])).toBe('nord')
  })
  test('I2. la ville se compare à celle qui suit le code postal, pas à toute l’adresse', () => {
    const autre = ag('hautbourg', { ville: 'Hautbourg' })
    const x = extr({ siren: SIREN, adresse: '12 rue de Hautbourg, 99100 Port-Exemple' })
    expect(preselectionAgence(x, [autre, manosque])).toBe('manosque')
    // Sans code postal : toute l'adresse sert encore
    expect(preselectionAgence(extr({ siren: SIREN, adresse: 'Zone industrielle de Port-Exemple' }), [vinon, manosque])).toBe('manosque')
  })
  test('agenceEffective suit la fusion', () => {
    expect(agenceEffective(ag('x', { fusionne_dans: 'manosque' }), [manosque]).id).toBe('manosque')
  })
})

describe('liste déroulante filtrable', () => {
  const agences = [
    ag('a', { nom_agence: 'Exemple Val-des-Essais', ville: 'Val-des-Essais', siret: SIRET }),
    ag('b', { nom_agence: 'Exemple Port-Exemple', ville: 'Port-Exemple' }),
    ag('c', { nom_agence: 'Location Montmirail', ville: 'Montmirail-Test', fournisseur: { ...F, nom: 'Loue-Tout Location', siren: SIREN_TIERS }, fusionne_dans: 'a' }),
    ag('d', { nom_agence: 'Location Fermée', ville: 'Clairefontaine', actif: false }),
  ]
  const options = optionsAgences(agences)
  test('seules les agences actives et non fusionnées sont proposées', () => expect(options.map((o) => o.id).sort()).toEqual(['a', 'b']))
  test('moins de 3 lettres : toute la liste', () => expect(filtrerOptions(options, 'ma').options).toHaveLength(2))
  test('3 lettres : filtre sur nom d’agence, ville, SIRET, entreprise (sans accents ni casse)', () => {
    expect(filtrerOptions(options, 'PORT').options.map((o) => o.id)).toEqual(['b'])
    expect(filtrerOptions(options, 'val-des').options.map((o) => o.id)).toEqual(['a'])
    expect(filtrerOptions(options, SIRET.slice(0, 10)).options.map((o) => o.id)).toEqual(['a'])
    expect(filtrerOptions(options, 'materiaux exemple').options).toHaveLength(2)
    expect(filtrerOptions(options, 'zzz').options).toEqual([])
  })
  test('cleFavori d’une agence = le SIREN de son entreprise (agences de la même entreprise : même clé ; sans SIRET : SIREN de la fiche)', () => {
    const deux = optionsAgences([
      ag('p', { nom_agence: 'Pt P', ville: 'Val-des-Essais', siret: SIRET }),
      ag('q', { nom_agence: 'Pt Q', ville: 'Port-Exemple', siret: SIRET_AUTRE_AGENCE }),
      ag('r', { nom_agence: 'Pt R', ville: 'Clairefontaine' }),
    ])
    expect(deux.find((o) => o.id === 'p')?.cleFavori).toBe(SIRET.slice(0, 9))
    expect(deux.find((o) => o.id === 'q')?.cleFavori).toBe(SIRET.slice(0, 9))
    expect(deux.find((o) => o.id === 'r')?.cleFavori).toBe(F.siren)
  })
  test('la liste est bornée à 50 et le dit', () => {
    const beaucoup = Array.from({ length: 80 }, (_, i) => ({ id: `o${i}`, libelle: `Option ${i}` }))
    const r = filtrerOptions(beaucoup, '')
    expect(r.options).toHaveLength(50)
    expect(r.tronque).toBe(true)
  })
})

describe('chantiers : seuls les chantiers ouverts se choisissent', () => {
  const ch = (id, statut, extra = {}) => ({ id, nom: `Chantier ${id}`, statut, ...extra })
  test('en préparation et en cours : acceptables ; terminé, suspendu, archivé : non', () => {
    expect(chantierAcceptable(ch('a', 'en_preparation'))).toBe(true)
    expect(chantierAcceptable(ch('b', 'en_cours'))).toBe(true)
    expect(chantierAcceptable(ch('c', 'termine'))).toBe(false)
    expect(chantierAcceptable(ch('d', 'suspendu'))).toBe(false)
    expect(chantierAcceptable(ch('e', 'en_cours', { archive: true }))).toBe(false)
  })
  test('colonne archive absente (migration 011 pas encore appliquée) = non archivé', () => {
    expect(chantierAcceptable(ch('a', 'en_cours', { archive: undefined }))).toBe(true)
  })
  test('un chantier fermé est grisé avec sa raison', () => {
    const o = optionsChantiers([ch('a', 'en_cours'), ch('b', 'termine'), ch('c', 'suspendu'), ch('d', 'en_preparation', { archive: true })])
    expect(Object.fromEntries(o.map((x) => [x.id, x.grise ?? null]))).toEqual({ a: null, b: 'terminé', c: 'suspendu', d: 'archivé' })
  })
  test('phrase d’explication', () => {
    expect(phraseChantierFerme(ch('b', 'termine'))).toBe('Ce chantier est terminé : choisis un autre chantier.')
    expect(phraseChantierFerme(ch('a', 'en_cours'))).toBeNull()
  })
  test('filtre sur le nom, le code et le client', () => {
    const o = optionsChantiers([ch('a', 'en_cours', { nom: 'Maison Dupont', code: 'CH-001', client: 'Famille Durand' }), ch('b', 'en_cours', { nom: 'Garage', code: 'CH-002', client: 'Martin SARL' })])
    expect(filtrerOptions(o, 'dup').options.map((x) => x.id)).toEqual(['a'])
    expect(filtrerOptions(o, 'ch-002').options.map((x) => x.id)).toEqual(['b'])
    expect(filtrerOptions(o, 'martin').options.map((x) => x.id)).toEqual(['b'])
  })
})

describe('création d’une agence', () => {
  test('ville de l’adresse lue', () => {
    expect(villeDeAdresse('1141 Route du Test, 99560 Val-des-Essais')).toBe('Val-des-Essais')
    expect(villeDeAdresse(null)).toBeNull()
    expect(villeDeAdresse('sans code postal')).toBeNull()
  })
  test('la fenêtre est pré-remplie avec ce que l’IA a lu', () => {
    const espaces = `${SIREN.slice(0, 3)} ${SIREN.slice(3, 6)} ${SIREN.slice(6)} ${SIRET.slice(9)}`
    const c = champsAgenceDepuis(extr({ nom: 'Matériaux Exemple', siret: espaces, adresse: '1 rue A, 99560 Val-des-Essais' }))
    expect(c).toEqual({ nom_fournisseur: 'Matériaux Exemple', siret: SIRET, siren: SIREN, nom_agence: '', ville: 'Val-des-Essais' })
  })
  test('contrôles avant l’envoi : SIRET, SIREN, nom seul', () => {
    const c = { nom_fournisseur: 'Exemple', siret: '', siren: '', nom_agence: '', ville: '' }
    expect(verifierChampsAgence({ ...c, siret: SIRET })).toBeNull()
    expect(verifierChampsAgence({ ...c, siren: SIREN, nom_agence: 'Agence Sud' })).toBeNull()
    expect(verifierChampsAgence({ ...c, siren: SIREN })).toMatch(/nom de l’agence/) // sans SIRET, la base exige le nom de l'agence
    expect(verifierChampsAgence({ ...c, nom_agence: 'Agence Nord', ville: 'Bellevue' })).toBeNull()
    expect(verifierChampsAgence(c)).toMatch(/SIRET/)
    expect(verifierChampsAgence({ ...c, nom_agence: 'Agence Nord' })).toMatch(/SIRET/)
    expect(verifierChampsAgence({ ...c, siret: '123' })).toMatch(/14 chiffres/)
    expect(verifierChampsAgence({ ...c, siren: '12345' })).toMatch(/9 chiffres/)
    expect(verifierChampsAgence({ ...c, siren: SIREN_INVALIDE })).toMatch(/pas valide/)
    expect(verifierChampsAgence({ ...c, siret: SIRET, siren: SIREN_AUTRE })).toMatch(/commencer par le SIREN/)
    expect(verifierChampsAgence({ ...c, nom_fournisseur: '', siret: SIRET })).toMatch(/nom de l’entreprise/)
  })
  test('corps de l’action : seulement les champs remplis, jamais d’identité', () => {
    const espaces = `${SIREN.slice(0, 3)} ${SIREN.slice(3, 6)} ${SIREN.slice(6)} ${SIRET.slice(9)}`
    const corps = corpsCreationAgence({ nom_fournisseur: ' Exemple ', siret: espaces, siren: '', nom_agence: '', ville: ' Val ' })
    expect(corps).toEqual({ nom_fournisseur: 'Exemple', siret: SIRET, ville: 'Val' })
    expect(JSON.stringify(corps)).not.toMatch(/mail|qui|user/i)
  })
})

describe('recherche d’un chantier (nom, code, client, adresse, ville)', () => {
  const ch = (id, statut, extra = {}) => ({ id, nom: `Chantier ${id}`, statut, ...extra })
  const o = optionsChantiers([
    ch('a', 'en_cours', { nom: 'Villa Lefèvre', code: 'CH-0007', client: 'M. Lefèvre', adresse: 'Lotissement Les Restanques, 99560 Valmoran' }),
    ch('b', 'en_cours', { nom: 'Garage', code: 'CH-0002', client: 'Martin SARL', adresse: 'ZA Les Essarts, 99210 Brevelle' }),
    ch('c', 'en_cours', { nom: 'Sans adresse', code: 'CH-0003', client: null, adresse: null }),
  ])
  const ids = (q) => filtrerOptions(o, q).options.map((x) => x.id)
  test('par la ville, même en morceaux, sans accents ni casse', () => {
    expect(ids('Valm')).toEqual(['a']); expect(ids('VALMORAN')).toEqual(['a']); expect(ids('valm oran')).toEqual(['a']); expect(ids('brevelle')).toEqual(['b'])
  })
  test('par l’adresse, le code et le client', () => {
    expect(ids('restanques')).toEqual(['a']); expect(ids('CH-0002')).toEqual(['b']); expect(ids('martin')).toEqual(['b']); expect(ids('lefevre')).toEqual(['a'])
  })
  test('tous les mots doivent être présents', () => {
    expect(ids('restanques brevelle')).toEqual([]); expect(ids('les restanques valmo')).toEqual(['a'])
  })
  test('aucun résultat', () => expect(ids('zzzzz')).toEqual([]))
  test('moins de 3 lettres : toute la liste', () => expect(ids('gi').sort()).toEqual(['a', 'b', 'c']))
  test('la ligne montre code · client · adresse ; sans adresse elle reste comme avant', () => {
    expect(o.find((x) => x.id === 'a').detail).toBe('CH-0007 · M. Lefèvre · Lotissement Les Restanques, 99560 Valmoran')
    expect(o.find((x) => x.id === 'c').detail).toBe('CH-0003')
  })
})

describe('ville du chantier et mise en évidence', () => {
  test('ville : après le code postal, sinon dernier segment après la virgule, sinon rien', () => {
    expect(villeChantier('Lotissement Les Restanques, 99560 Valmoran')).toBe('Valmoran')
    expect(villeChantier('Lotissement Les Restanques, Valmoran')).toBe('Valmoran')
    expect(villeChantier('12 rue des Oliviers')).toBeNull()
    expect(villeChantier('Chemin X, 12')).toBeNull()
    expect(villeChantier(null)).toBeNull()
    expect(villeChantier('')).toBeNull()
  })
  test('première ligne : « Nom · Ville » ; sans adresse, le nom seul', () => {
    expect(libelleChantier({ nom: 'Villa Lefèvre', adresse: 'Lotissement Les Restanques, Valmoran' })).toBe('Villa Lefèvre · Valmoran')
    expect(libelleChantier({ nom: 'Villa Lefèvre', adresse: null })).toBe('Villa Lefèvre')
  })
  test('mise en évidence sans accents ni casse, en morceaux, plusieurs mots', () => {
    const t = (txt, q) => decouperSurligne(txt, q).filter((s) => s.trouve).map((s) => s.texte)
    expect(t('Villa Lefèvre · Valmoran', 'valm')).toEqual(['Valm'])
    expect(t('Villa Lefèvre · Valmoran', 'VALM ran')).toEqual(['Valm', 'ran'])
    expect(t('Villa Lefèvre', 'lefevre')).toEqual(['Lefèvre'])
    expect(t('Villa Lefèvre', 'xx')).toEqual([])
    expect(decouperSurligne('Villa', 'vi')).toEqual([{ texte: 'Villa', trouve: false }])
    expect(decouperSurligne('Villa', 'zzz')).toEqual([{ texte: 'Villa', trouve: false }])
    expect(decouperSurligne('Villa', 'villa').map((s) => s.texte).join('')).toBe('Villa')
  })
})

describe('ville du chantier : cas particuliers', () => {
  test('Cedex retiré ; bât, lot, zone, ZA, ZI, France refusés', () => {
    expect(villeChantier('3 rue X, 99100 Montclair-Test Cedex 03')).toBe('Montclair-Test')
    expect(villeChantier('12 rue X, Bât A')).toBeNull()
    expect(villeChantier('12 rue X, Lot 4')).toBeNull()
    expect(villeChantier('Route X, ZA Les Essarts')).toBeNull()
    expect(villeChantier('Route X, Zone industrielle')).toBeNull()
    expect(villeChantier('12 rue X, France')).toBeNull()
  })
  test('pas de ville en double quand le nom la contient', () => {
    expect(libelleChantier({ nom: 'Villa Valmoran', adresse: 'Lotissement X, 99560 Valmoran' })).toBe('Villa Valmoran')
  })
  test('œ et æ : « coeur » trouve « Cœur », « caesar » trouve « Cæsar » (filtre et surlignage)', () => {
    const o = optionsChantiers([{ id: 'a', nom: 'Cœur de village', statut: 'en_cours' }, { id: 'b', nom: 'Cæsar', statut: 'en_cours' }])
    expect(filtrerOptions(o, 'coeur').options.map((x) => x.id)).toEqual(['a'])
    expect(filtrerOptions(o, 'caesar').options.map((x) => x.id)).toEqual(['b'])
    expect(decouperSurligne('Cœur de village', 'coeur').filter((s) => s.trouve).map((s) => s.texte)).toEqual(['Cœur'])
  })
  test('mots d’une lettre ignorés au surlignage', () => {
    expect(decouperSurligne('Villa de Valmoran', 'valm d').filter((s) => s.trouve).map((s) => s.texte)).toEqual(['Valm'])
  })
  test('texte déjà décomposé (NFD) : le surlignage tient', () => {
    const t = 'Lefèvre'.normalize('NFD')
    expect(decouperSurligne(t, 'lefevre').filter((s) => s.trouve).map((s) => s.texte).join('')).toBe('Lefèvre'.normalize('NFC'))
  })
})

describe('4e. présélection avec un SIREN seul', () => {
  test('une seule agence pour ce SIREN : proposée', () => {
    const x = { fournisseur: { nom: 'X', siret: null, siren: SIREN, adresse: null } }
    expect(preselectionAgence(x, [ag('a1', { fournisseur: { ...F, siren: SIREN } })])).toBe('a1')
  })
})
