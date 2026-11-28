// Module Achats « Factures » (25/11/2026, PR 8a) : tests des contrôles automatiques (« Nos contrôles »), du score de confiance et de leurs textes.
// Recopiés de l'appli d'origine avec LES MÊMES cas et LES MÊMES valeurs. Seules les données changent : le dépôt est public, donc aucune identité réelle ;
// l'entreprise de l'espace, ses numéros et son adresse sont fictifs (clés de Luhn valides), et le contrôle « Destinataire » reçoit cette identité de l'appelant.
import { test, describe } from 'node:test';
import { expect } from './_expect-achatsfactures.js';
import {
  PREFIXE_SIRET_EXCEPTION,
  controleAdresseEnvoi, controleIban, controleIbanHistorique, controleIbanPartage, ibanValide, normaliserIban, synthese, CONTROLES_BIENTOT, controleDestinataire as controleDestinataireBrut,
  controleDoublon, numeroNormalise, sirenDe, controleSiret, controleTotaux, controleLignes, controlerFacture as controlerFactureBrut, luhnValide, siretValide, nomsCoherents, alertesAffichees, phraseApresDecision, controlesApresDecision,
} from '../js/modules/achatsfactures/controles.js';

const IDENT = { nom: 'ENTREPRISE TEST', noms: ['ENTREPRISE TEST', 'Entreprise Test Construction'], siren: '987654324', siret: '98765432400019', adresseMots: ['rue des tests'] };
const dest = (x) => controleDestinataireBrut(x, IDENT);
const controler = (f, a, b, c, d) => controlerFactureBrut(f, a, b, c, d, IDENT);

const vide = { nom: null, siret: null, siren: null, adresse: null }
const extr = (o = {}) => ({
  fournisseur: { ...vide, nom: 'Point Q Matériaux', siret: '12345678200010' },
  destinataire: { ...vide, nom: 'ENTREPRISE TEST', siret: IDENT.siret, siren: IDENT.siren },
  numero: 'F1', date_facture: '2026-11-18', montant_ht: 100, montant_tva: 20, montant_ttc: 120, devise: 'EUR',
  annuaire: { interroge: true, disponible: true, trouve: true, actif: true, denomination: 'POINT Q MATERIAUX' },
  ...o,
})

describe('Luhn et SIRET', () => {
  test('Luhn : accepte un numéro valide, refuse un numéro faux', () => {
    expect(luhnValide('12345678200010')).toBe(true)
    expect(luhnValide('12345678200011')).toBe(false)
  })
  test('SIRET : 14 chiffres exigés, espaces tolérés', () => {
    expect(siretValide('123 456 782 00010')).toBe(true)
    expect(siretValide('1234567820001')).toBe(false)
    expect(siretValide('abc')).toBe(false)
  })
  test('SIRET : exception de la règle publique (préfixe exporté par le module)', () => {
    const exception = `${PREFIXE_SIRET_EXCEPTION}12345`
    expect(luhnValide(exception)).toBe(false)
    expect(siretValide(exception)).toBe(true)
    expect(siretValide(`${PREFIXE_SIRET_EXCEPTION.replace('356', '357')}12345`)).toBe(false)
  })
})

describe('Comparaison de noms', () => {
  test('ignore majuscules, accents et forme juridique', () => {
    expect(nomsCoherents('Point Q Matériaux SAS', 'POINT Q MATERIAUX')).toBe(true)
  })
  test('accepte un nom contenu dans l’autre, refuse deux noms différents', () => {
    expect(nomsCoherents('LA POSTE - TEST FICTIF', 'LA POSTE')).toBe(true)
    expect(nomsCoherents('Bricolo Dépôt', 'Loxbel Location')).toBe(false)
  })
  test('accepte une petite faute de frappe', () => {
    expect(nomsCoherents('Electro Services', 'Electro Servises')).toBe(true)
  })
})

describe('Vérification 1 : totaux', () => {
  test('vert : HT + TVA = TTC', () => expect(controleTotaux(extr()).etat).toBe('ok'))
  test('vert : écart de 2 centimes toléré', () => expect(controleTotaux(extr({ montant_ttc: 120.02 })).etat).toBe('ok'))
  test('rouge : écart de 3 centimes', () => expect(controleTotaux(extr({ montant_ttc: 120.03 })).etat).toBe('anomalie'))
  test('rouge : total faux', () => expect(controleTotaux(extr({ montant_ttc: 130 })).etat).toBe('anomalie'))
  test('gris : un montant non lu', () => expect(controleTotaux(extr({ montant_tva: null })).etat).toBe('indisponible'))
  test('gris : pas d’extraction', () => expect(controleTotaux(null).phrase).toBe('Analyse non disponible pour cette facture.'))
  test('pas d’erreur d’arrondi (0,1 + 0,2 = 0,3)', () => expect(controleTotaux(extr({ montant_ht: 0.1, montant_tva: 0.2, montant_ttc: 0.3 })).etat).toBe('ok'))
})

describe('Vérification 2 : SIRET du fournisseur', () => {
  test('vert : valide, actif, nom cohérent', () => expect(controleSiret(extr()).etat).toBe('ok'))
  test('orange : nom différent de l’annuaire', () => {
    const x = extr({ annuaire: { interroge: true, disponible: true, trouve: true, actif: true, denomination: 'LOXBEL' } })
    expect(controleSiret(x).etat).toBe('alerte')
  })
  test('rouge : SIRET absent', () => expect(controleSiret(extr({ fournisseur: { ...vide, nom: 'X' } })).etat).toBe('anomalie'))
  test('rouge : SIRET invalide', () => expect(controleSiret(extr({ fournisseur: { ...vide, nom: 'X', siret: '12345678901234' } })).etat).toBe('anomalie'))
  test('rouge : inconnu dans l’annuaire', () => expect(controleSiret(extr({ annuaire: { interroge: true, disponible: true, trouve: false } })).etat).toBe('anomalie'))
  test('rouge : entreprise fermée', () => expect(controleSiret(extr({ annuaire: { interroge: true, disponible: true, trouve: true, actif: false, denomination: 'POINT Q' } })).etat).toBe('anomalie'))
  test('gris : annuaire indisponible', () => expect(controleSiret(extr({ annuaire: { interroge: true, disponible: false } })).etat).toBe('indisponible'))
  test('gris : pas d’extraction', () => expect(controleSiret(null).etat).toBe('indisponible'))
  test('4a. ni SIREN ni SIRET lisibles : rouge, phrase dédiée', () => {
    const c = controleSiret(extr({ fournisseur: { ...vide, nom: 'X' } }))
    expect(c.etat).toBe('anomalie'); expect(c.phrase).toBe('Aucun SIREN ni SIRET du fournisseur trouvé sur la facture.')
  })
  test('4b. SIREN valide sans SIRET : orange (agence non identifiée), phrase dédiée', () => {
    const c = controleSiret(extr({ fournisseur: { ...vide, nom: 'Point Q', siren: '123456782' } }))
    expect(c.etat).toBe('alerte'); expect(c.phrase).toContain('ne donne que le SIREN')
  })
  test('4c. SIREN invalide sans SIRET : rouge', () => {
    expect(controleSiret(extr({ fournisseur: { ...vide, nom: 'X', siren: '123456789' } })).etat).toBe('anomalie')
  })
  test('4d. SIREN seul : les autres contrôles gardent le SIREN (sirenDe)', () => {
    expect(sirenDe(extr({ fournisseur: { ...vide, nom: 'X', siren: '123456782' } }))).toBe('123456782')
  })
})

describe('Vérification 3 : destinataire', () => {
  test('vert : SIRET de l’entreprise de l’espace', () => expect(dest(extr()).etat).toBe('ok'))
  test('vert : SIREN seul', () => expect(dest(extr({ destinataire: { ...vide, siren: IDENT.siren } })).etat).toBe('ok'))
  test('orange : seul le nom correspond (avec Construction)', () =>
    expect(dest(extr({ destinataire: { ...vide, nom: 'Entreprise Test Construction' } })).etat).toBe('alerte'))
  test('orange : seule l’adresse de l’espace correspond', () =>
    expect(dest(extr({ destinataire: { ...vide, nom: 'M. Gilles', adresse: '12 rue des Tests, 99999 Villeneuve-Test' } })).etat).toBe('alerte'))
  test('rouge : une autre entreprise (autre SIREN)', () =>
    expect(dest(extr({ destinataire: { ...vide, nom: 'ENTREPRISE TEST', siren: '123456789' } })).etat).toBe('anomalie'))
  test('rouge : un autre nom sans numéro', () =>
    expect(dest(extr({ destinataire: { ...vide, nom: 'Jean Orvaline', adresse: '2 rue X, Paris' } })).etat).toBe('anomalie'))
  test('gris : destinataire non lu', () => expect(dest(extr({ destinataire: { ...vide } })).etat).toBe('indisponible'))
})

describe('controlerFacture', () => {
  test('renvoie les neuf vérifications actives (IBAN, adresse et lignes grises sans IBAN, historique ni lignes lues)', () => {
    expect(controler({ extraction: extr(), extraction_erreur: null, lignes_etat: 'non_lues' }, [], [], [], []).map((c) => c.etat)).toEqual(['ok', 'ok', 'ok', 'ok', 'indisponible', 'indisponible', 'indisponible', 'indisponible', 'indisponible'])
  })
  test('sans extraction : tout gris', () => {
    const r = controler({ extraction: null, extraction_erreur: null, lignes_etat: 'non_lues' }, [], [], [], [])
    expect(r.map((c) => c.etat)).toEqual(Array(9).fill('indisponible'))
    expect(r[0].phrase).toBe('Analyse non disponible pour cette facture.')
  })
  test('PDF trop gros : gris ; les trois lectures donnent la raison', () => {
    const r = controler({ extraction: null, extraction_erreur: 'pdf_trop_gros', lignes_etat: 'non_lues' }, [], [], [], [])
    expect(r.every((c) => c.etat === 'indisponible')).toBe(true)
    expect(r.slice(0, 3).every((c) => c.phrase.includes('trop gros'))).toBe(true)
  })
})

describe('Doublons : normalisation', () => {
  test('numéro : casse et séparateurs multiples ramenés à un seul tiret', () => {
    expect(numeroNormalise(' fa-2026/0412 ')).toBe('FA-2026-0412')
    expect(numeroNormalise('FA  2026 -- 0412')).toBe('FA-2026-0412')
    expect(numeroNormalise('---')).toBeNull()
    expect(numeroNormalise(null)).toBeNull()
  })
  test('numéro : les séparateurs comptent (« A-1 » ≠ « A1 », « 2026-1-12 » ≠ « 2026-11-2 »)', () => {
    expect(numeroNormalise('A-1')).not.toBe(numeroNormalise('A1'))
    expect(numeroNormalise('2026-1-12')).not.toBe(numeroNormalise('2026-11-2'))
  })
  test('numéro : zéros de tête retirés seulement si tout est en chiffres', () => {
    expect(numeroNormalise('0012')).toBe('12')
    expect(numeroNormalise('0012')).toBe(numeroNormalise('12'))
    expect(numeroNormalise('000')).toBe('0')
    expect(numeroNormalise('A-001')).toBe('A-001')
    expect(numeroNormalise('00-12')).toBe('00-12')
  })
  test('SIREN : 9 premiers chiffres du SIRET ; deux établissements = même SIREN', () => {
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '123 456 782 00010' } }))).toBe('123456782')
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '12345678200028' } }))).toBe('123456782')
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '1234' } }))).toBeNull()
    expect(sirenDe(null)).toBeNull()
  })
  test('SIREN : SIRET à 13 chiffres = rien ; SIREN de 9 chiffres en repli ; clé de Luhn exigée', () => {
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '1234567820001' } }))).toBeNull()
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '', siren: '123456782' } }))).toBe('123456782')
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '12345678200010', siren: null } }))).toBe('123456782')
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '123456783', siren: '123456783' } }))).toBeNull()
    expect(sirenDe(extr({ fournisseur: { ...vide, siret: '12345678300010' } }))).toBeNull()
  })
})

describe('titres neutres', () => {
  test('le titre ne dit jamais le résultat ; la phrase le dit', () => {
    const t = controler({ extraction: extr(), extraction_erreur: null, lignes_etat: 'non_lues' }, [], [], [], []).map((c) => c.titre)
    expect(t).toEqual(['Totaux', 'SIRET du fournisseur', 'Destinataire', 'Doublon', 'IBAN', 'IBAN et historique du fournisseur', 'IBAN partagé', 'Adresse d’envoi', 'Lignes'])
  })
})

describe('controleDoublon', () => {
  const lie = (o) => ({ id: 'x', statut: 'acceptee', numero: 'FA-1', numero_normalise: 'FA-1', montant_ttc: 120, date_facture: '2026-11-18', ...o })
  const moi = { id: 'me', numero: ' fa-1 ', montant_ttc: 120, date_facture: '2026-11-18', extraction: extr() }
  test('rouge : même SIREN et même numéro qu’une facture acceptée (casse et espaces ignorés)', () => {
    const r = controleDoublon(moi, [lie({ numero: 'FA-1' })])
    expect(r.etat).toBe('anomalie')
    expect(r.phrase).toBe('Doublon : la facture n° FA-1 de ce fournisseur est déjà acceptée.')
  })
  test('deux établissements du même SIREN : même fournisseur (le SIREN vient du SIRET lu)', () => {
    const autre = { ...moi, extraction: extr({ fournisseur: { ...vide, siret: '12345678200028' } }) }
    expect(controleDoublon(autre, [lie({})]).etat).toBe('anomalie')
  })
  test('orange : même numéro en attente ; ignoré si refusée ; vert sans jumelle', () => {
    expect(controleDoublon(moi, [lie({ statut: 'a_valider' })]).etat).toBe('alerte')
    expect(controleDoublon(moi, [lie({ statut: 'refusee' })]).etat).toBe('ok')
    expect(controleDoublon(moi, [lie({ numero_normalise: 'AUTRE', numero: 'AUTRE' })]).phrase).toBe('Aucun doublon trouvé.')
    expect(controleDoublon(moi, [lie({ id: 'me' })]).etat).toBe('ok')
  })
  test('numéro absent : repli orange (même TTC + même date), sinon gris', () => {
    const sans = { ...moi, numero: null, extraction: extr({ numero: null }) }
    expect(controleDoublon(sans, [lie({ numero: null, numero_normalise: null })]).etat).toBe('alerte')
    expect(controleDoublon(sans, [lie({ numero: null, numero_normalise: null, montant_ttc: 99 })]).etat).toBe('indisponible')
  })
  test('gris : SIREN non lu', () => {
    expect(controleDoublon({ ...moi, extraction: extr({ fournisseur: { ...vide, siret: null } }) }, [lie({})]).etat).toBe('indisponible')
    expect(controleDoublon({ ...moi, extraction: null }, [lie({})]).etat).toBe('indisponible')
  })
})

const IBAN_FR = 'FR7630006000011234567890189'
const IBAN_FR2 = 'FR1420041010050500013M02606'
const moiIban = (iban, o = {}) => ({ id: 'me', extraction: extr({ iban }), ...o })
const liee = (o) => ({ id: 'x', statut: 'acceptee', numero: 'A', numero_normalise: 'A', montant_ttc: 1, date_facture: null, fournisseur_siren: '123456782', iban_normalise: IBAN_FR, email_expediteur: 'compta@fournisseur.fr', fournisseur: 'Autre SA', ...o })

describe('IBAN : format', () => {
  test('valide : exemples connus de plusieurs pays, espaces et minuscules ignorés', () => {
    for (const i of [IBAN_FR, IBAN_FR2, 'DE89370400440532013000', 'GB82WEST12345698765432', 'ES9121000418450200051332', 'IT60X0542811101000000123456', 'NL91ABNA0417164300', 'BE68539007547034', 'CH9300762011623852957', 'LU280019400644750000']) expect(ibanValide(i), i).toBe(true)
    expect(ibanValide('fr76 3000 6000 0112 3456 7890 189')).toBe(true)
    expect(normaliserIban('fr76 3000-6000')).toBe('FR7630006000')
  })
  test('invalide : clé fausse, mauvaise longueur, pays inconnu, caractères', () => {
    expect(ibanValide('FR7630006000011234567890188')).toBe(false)
    expect(ibanValide('FR76300060000112345678901')).toBe(false)
    expect(ibanValide('ZZ7630006000011234567890189')).toBe(false)
    expect(ibanValide('')).toBe(false)
    expect(ibanValide('1234')).toBe(false)
  })
  test('vert : IBAN français valide (texte exact)', () => {
    const c = controleIban(moiIban(IBAN_FR))
    expect(c.etat).toBe('ok')
    expect(c.phrase).toBe('Format de l’IBAN correct. Cela ne prouve pas à qui appartient le compte.')
  })
  test('rouge : IBAN invalide, avec la mention de lecture possiblement fausse', () => {
    const c = controleIban(moiIban('FR7630006000011234567890188'))
    expect(c.etat).toBe('anomalie')
    expect(c.phrase).toContain('IBAN invalide : le format ne respecte pas la norme.')
    expect(c.phrase).toContain('mal lu')
  })
  test('orange : IBAN étranger valide (jamais rouge)', () => {
    const c = controleIban(moiIban('DE89 3704 0044 0532 0130 00'))
    expect(c.etat).toBe('alerte')
    expect(c.phrase).toContain('IBAN étranger')
  })
  test('gris : aucun IBAN lu (jamais rouge) ; anciennes factures sans le champ', () => {
    expect(controleIban(moiIban(null))).toMatchObject({ etat: 'indisponible', phrase: 'Aucun IBAN lu sur cette facture' })
    expect(controleIban({ extraction: extr() }).etat).toBe('indisponible')
    expect(controleIban({ extraction: null }).etat).toBe('indisponible')
  })
  test('lit la colonne calculée en priorité', () => {
    expect(controleIban({ iban_normalise: IBAN_FR, extraction: null }).etat).toBe('ok')
  })
})

describe('IBAN et historique du fournisseur', () => {
  const moi = moiIban(IBAN_FR)
  test('vert : identique à une facture acceptée (espaces et minuscules ignorés)', () => {
    expect(controleIbanHistorique(moiIban('fr76 3000 6000 0112 3456 7890 189'), [liee({})]).etat).toBe('ok')
  })
  test('rouge : différent des factures acceptées, avec la consigne de rappeler', () => {
    const c = controleIbanHistorique(moi, [liee({ iban_normalise: IBAN_FR2 })])
    expect(c.etat).toBe('anomalie')
    expect(c.phrase).toBe('L’IBAN a changé depuis les factures précédentes de ce fournisseur : appelle-le sur un numéro que tu connais déjà avant d’accepter.')
  })
  test('orange : premier IBAN (aucune facture)', () => {
    const c = controleIbanHistorique(moi, [])
    expect(c.etat).toBe('alerte')
    expect(c.phrase).toContain('Premier IBAN vu pour ce fournisseur')
  })
  test('une facture non acceptée (à valider ou refusée) ne compte pas comme historique', () => {
    expect(controleIbanHistorique(moi, [liee({ statut: 'a_valider' }), liee({ statut: 'refusee' })]).etat).toBe('alerte')
    expect(controleIbanHistorique(moi, [liee({ statut: 'a_valider' }), liee({ iban_normalise: IBAN_FR2 })]).etat).toBe('anomalie')
  })
  test('une facture ne se compare pas à elle-même', () => {
    expect(controleIbanHistorique(moi, [liee({ id: 'me' })]).etat).toBe('alerte')
  })
  test('acceptées sans IBAN lu (anciennes) : pas de référence, orange', () => {
    expect(controleIbanHistorique(moi, [liee({ iban_normalise: null })]).etat).toBe('alerte')
  })
  test('un ancien IBAN accepté puis un nouveau accepté : les deux sont connus', () => {
    expect(controleIbanHistorique(moi, [liee({ iban_normalise: IBAN_FR2 }), liee({})]).etat).toBe('ok')
  })
  test('même SIREN, autre établissement : même fournisseur (le SIREN vient du SIRET)', () => {
    const autre = { id: 'me', extraction: extr({ iban: IBAN_FR, fournisseur: { ...vide, siret: '12345678200028' } }) }
    expect(controleIbanHistorique(autre, [liee({})]).etat).toBe('ok')
  })
  test('gris : pas d’IBAN, ou SIREN non lu', () => {
    expect(controleIbanHistorique(moiIban(null), [liee({})]).etat).toBe('indisponible')
    expect(controleIbanHistorique({ id: 'me', extraction: extr({ iban: IBAN_FR, fournisseur: { ...vide, siret: null } }) }, [liee({})]).etat).toBe('indisponible')
  })
})

describe('IBAN partagé', () => {
  const moi = moiIban(IBAN_FR)
  test('rouge : même IBAN sur une facture ACCEPTÉE d’un autre SIREN (piège accepté par erreur), avec le nom', () => {
    const c = controleIbanPartage(moi, [liee({ statut: 'acceptee', fournisseur_siren: '222222226', fournisseur: 'Bâtiment Fictif' })])
    expect(c.etat).toBe('anomalie'); expect(c.phrase).toContain('Bâtiment Fictif')
  })
  test('orange : même IBAN seulement sur une facture encore à valider d’un autre SIREN (nom non cité)', () => {
    const c = controleIbanPartage(moi, [liee({ statut: 'a_valider', fournisseur_siren: '222222226', fournisseur: 'Bâtiment Fictif' })])
    expect(c.etat).toBe('alerte'); expect(c.phrase).not.toContain('Bâtiment Fictif')
  })
  test('vrai titulaire (facture acceptée de mon SIREN avec cet IBAN) + piège REFUSÉ chez un autre SIREN : vert', () => {
    const titulaire = liee({ id: 'ok1', statut: 'acceptee', fournisseur_siren: '123456782', iban_normalise: IBAN_FR })
    const c = controleIbanPartage(moi, [liee({ statut: 'refusee', fournisseur_siren: '222222226', fournisseur: 'Fournisseur piège' })], [titulaire])
    expect(c.etat).toBe('ok')
  })
  test('refusée sous le SIREN B, puis même IBAN sous le SIREN C (aucun titulaire connu) : jamais vert, orange', () => {
    const c = controleIbanPartage(moi, [liee({ statut: 'refusee', fournisseur_siren: '222222226' })], [])
    expect(c.etat).toBe('alerte'); expect(c.phrase).toContain('figure sur une facture refusée d’un autre fournisseur')
    expect(controleIbanPartage(moi, [liee({ statut: 'refusee', fournisseur_siren: '222222226' })], null).etat).toBe('alerte') // historique illisible : titulaire inconnu
  })
  test('une facture ACCEPTÉE chez un autre SIREN reste rouge, même si je suis le titulaire connu ; les noms viennent des acceptées seulement', () => {
    const titulaire = liee({ id: 'ok1', statut: 'acceptee', fournisseur_siren: '123456782', iban_normalise: IBAN_FR })
    const c = controleIbanPartage(moi, [liee({ id: 'v', statut: 'a_valider', fournisseur_siren: '111111118', fournisseur: 'Nom à valider' }), liee({ id: 'x', statut: 'acceptee', fournisseur_siren: '222222226', fournisseur: 'Nom accepté' })], [titulaire])
    expect(c.etat).toBe('anomalie'); expect(c.phrase).toContain('Nom accepté'); expect(c.phrase).not.toContain('Nom à valider')
  })
  test('recherche incomplète (null) : indisponible, à confirmer, jamais vert', () => {
    const c = controleIbanPartage(moi, null)
    expect(c.etat).toBe('indisponible'); expect(c.aConfirmer).toBe(true)
  })
  test('refusée + acceptée d’un autre SIREN : l’acceptée suffit (rouge)', () => {
    const c = controleIbanPartage(moi, [liee({ id: 'r', statut: 'refusee', fournisseur_siren: '222222226' }), liee({ id: 'x', statut: 'acceptee', fournisseur_siren: '999999998' })])
    expect(c.etat).toBe('anomalie')
  })
  test('vert : même IBAN seulement chez le même SIREN, ou nulle part', () => {
    expect(controleIbanPartage(moi, [liee({})]).etat).toBe('ok')
    expect(controleIbanPartage(moi, []).etat).toBe('ok')
    expect(controleIbanPartage(moi, [liee({ fournisseur_siren: '222222226', iban_normalise: IBAN_FR2 })]).etat).toBe('ok')
  })
  test('gris : pas d’IBAN ou SIREN non lu', () => {
    expect(controleIbanPartage(moiIban(null), []).etat).toBe('indisponible')
    expect(controleIbanPartage({ id: 'me', extraction: extr({ iban: IBAN_FR, fournisseur: { ...vide, siret: null } }) }, []).etat).toBe('indisponible')
  })
})

describe('Adresse d’envoi', () => {
  const moi = moiIban(IBAN_FR, { email_expediteur: 'Compta@Fournisseur.fr' })
  test('vert : adresse déjà vue sur une facture acceptée (casse ignorée)', () => expect(controleAdresseEnvoi(moi, [liee({})]).etat).toBe('ok'))
  test('orange : adresse nouvelle', () => {
    const c = controleAdresseEnvoi(moi, [liee({ email_expediteur: 'autre@x.fr' })])
    expect(c.etat).toBe('alerte')
    expect(c.phrase).toBe('À vérifier : l’e-mail d’envoi est nouveau pour ce fournisseur.')
  })
  test('gris : pas d’historique accepté, pas d’adresse, SIREN non lu', () => {
    expect(controleAdresseEnvoi(moi, []).etat).toBe('indisponible')
    expect(controleAdresseEnvoi(moi, [liee({ statut: 'a_valider' })]).etat).toBe('indisponible')
    expect(controleAdresseEnvoi(moiIban(IBAN_FR), [liee({})]).etat).toBe('indisponible')
  })
})

describe('synthèse et liste', () => {
  test('trois lignes « bientôt » seulement', () => expect(CONTROLES_BIENTOT.map((c) => c.titre)).toEqual(['Taux de TVA', 'Dates', 'N° de TVA intracommunautaire']))
  test('phrases de synthèse, jamais « sûre »', () => {
    const ok = controler({ extraction: extr({ iban: IBAN_FR }), extraction_erreur: null, email_expediteur: 'a@b.fr' }, [liee({ id: 'z', numero_normalise: 'Z', numero: 'Z', email_expediteur: 'a@b.fr' })], [], [], [])
    expect(synthese(ok)).not.toMatch(/sûr/)
    expect(synthese([{ id: 'a', titre: 'a', etat: 'alerte', phrase: '' }, { id: 'b', titre: 'b', etat: 'anomalie', phrase: '' }])).toBe('2 points à vérifier avant d’accepter (dont 1 anomalie).')
    expect(synthese([{ id: 'a', titre: 'a', etat: 'ok', phrase: '' }])).toBe('Aucun point d’attention détecté par l’outil.')
  })
  test('les nouveaux contrôles orange ou rouge partent dans les alertes du serveur', async () => {
    const c = controler({ extraction: extr({ iban: IBAN_FR }), extraction_erreur: null }, [liee({ iban_normalise: IBAN_FR2 })], [liee({ fournisseur_siren: '222222226' })], [], [])
    const codes = alertesAffichees(c).map((a) => a.code)
    expect(codes).toContain('iban-historique')
    expect(codes).toContain('iban-partage')
  })
})

describe('Doublon : jamais vert quand la vérification est impossible', () => {
  const moi = { id: 'me', numero: 'FA-1', montant_ttc: 120, date_facture: '2026-11-18', extraction: extr() }
  test('historique non lu (erreur ou limite dépassée) : gris « Vérification indisponible », à confirmer', () => {
    const c = controleDoublon(moi, null)
    expect(c).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(c.phrase).toContain('Vérification indisponible')
  })
  test('SIREN absent ou numéro absent : « Doublon non vérifiable », à confirmer', () => {
    const a = controleDoublon({ ...moi, extraction: extr({ fournisseur: { ...vide, siret: null } }) }, [])
    expect(a).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(a.phrase).toContain('Doublon non vérifiable')
    const b = controleDoublon({ ...moi, numero: null, extraction: extr({ numero: null }) }, [])
    expect(b).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(b.phrase).toContain('Doublon non vérifiable')
  })
  test('un contrôle à confirmer part dans les alertes envoyées au serveur (orange), les autres gris non', async () => {
    const c = controler({ extraction: extr(), extraction_erreur: null, lignes_etat: 'non_lues' }, null, null, [], [])
    const a = alertesAffichees(c)
    expect(a.map((x) => x.code)).toEqual(['doublon'])
    expect(a[0].niveau).toBe('orange')
    expect(synthese(c)).toMatch(/à vérifier avant d’accepter/)
  })
  test('« historique non lu » ne rend jamais « IBAN et historique » ni « IBAN partagé » verts', () => {
    const c = controler({ extraction: extr({ iban: 'FR7630006000011234567890189' }), extraction_erreur: null }, null, null, [], [])
    for (const id of ['iban-historique', 'iban-partage']) expect(c.find((x) => x.id === id)).toMatchObject({ etat: 'indisponible', aConfirmer: true })
  })
})

describe('Contrôle « Lignes » (9e contrôle actif)', () => {
  const lignes = [{ position: 1 }, { position: 2 }]
  test('titre neutre « Lignes »', () => expect(controleLignes({ lignes_etat: 'lues' }, lignes).titre).toBe('Lignes'))
  test('lignes non lues : gris simple, sans motif exigé', () => {
    const c = controleLignes({ lignes_etat: 'non_lues' }, [])
    expect(c).toMatchObject({ etat: 'indisponible' })
    expect(c.aConfirmer).toBeUndefined()
    expect(c.phrase).toContain('Lignes non lues')
  })
  test('lues : vert', () => expect(controleLignes({ lignes_etat: 'lues', lignes_somme_ht: 100, montant_ht: 100 }, lignes).etat).toBe('ok'))
  test('somme différente : orange, jamais rouge, avec l’écart', () => {
    const c = controleLignes({ lignes_etat: 'somme_ecart', lignes_somme_ht: 410, montant_ht: 420 }, lignes)
    expect(c.etat).toBe('alerte')
    expect(c.phrase).toMatch(/La somme des lignes ne correspond pas au total HT : écart de 10,00\s€\./)
  })
  test('avoir : la valeur absolue de la somme est comparée au total HT', () => {
    const c = controleLignes({ type_document: 'avoir', lignes_etat: 'somme_ecart', lignes_somme_ht: -95, montant_ht: 100 }, lignes)
    expect(c.phrase).toMatch(/écart de 5,00\s€/)
  })
  test('lignes lues mais total HT ou somme illisible : gris à confirmer, jamais vert', () => {
    expect(controleLignes({ lignes_etat: 'lues', lignes_somme_ht: 100, montant_ht: null }, lignes)).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(controleLignes({ lignes_etat: 'lues', lignes_somme_ht: null, montant_ht: 100 }, lignes)).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(controleLignes({ lignes_etat: 'somme_ecart', montant_ht: null }, lignes).phrase).toMatch(/total HT n’a pas pu être lu/)
  })
  test('état « lues » ou « somme_ecart » avec zéro ligne : gris à confirmer', () => {
    expect(controleLignes({ lignes_etat: 'lues', lignes_somme_ht: 1, montant_ht: 1 }, [])).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(controleLignes({ lignes_etat: 'somme_ecart', lignes_somme_ht: 1, montant_ht: 2 }, [])).toMatchObject({ etat: 'indisponible', aConfirmer: true })
  })
  test('lecture des lignes en échec : gris À CONFIRMER (jamais vert, motif exigé)', () => {
    expect(controleLignes({ lignes_etat: 'lues' }, null)).toMatchObject({ etat: 'indisponible', aConfirmer: true })
  })
  test('état des lignes absent de la base (colonne absente) : gris à confirmer', () => {
    expect(controleLignes({}, lignes)).toMatchObject({ etat: 'indisponible', aConfirmer: true })
    expect(controleLignes({ lignes_etat: 'bizarre' }, lignes)).toMatchObject({ etat: 'indisponible', aConfirmer: true })
  })
  test('l’orange et le gris à confirmer partent dans les alertes de la décision ; le gris simple non', async () => {
    expect(alertesAffichees([controleLignes({ lignes_etat: 'somme_ecart', lignes_somme_ht: 1, montant_ht: 2 }, lignes)]).map((a) => a.niveau)).toEqual(['orange'])
    expect(alertesAffichees([controleLignes({ lignes_etat: 'lues' }, null)]).map((a) => a.niveau)).toEqual(['orange'])
    expect(alertesAffichees([controleLignes({ lignes_etat: 'non_lues' }, [])])).toEqual([])
  })
  test('est le 9e contrôle de controlerFacture et ne contient jamais « fraude », « arnaque » ni « sûre »', () => {
    const r = controler({ extraction: extr(), extraction_erreur: null, lignes_etat: 'somme_ecart', lignes_somme_ht: 1, montant_ht: 100 }, [], [], lignes, [])
    expect(r).toHaveLength(9)
    expect(r[8].id).toBe('lignes')
    expect(r[8].phrase).not.toMatch(/fraude|arnaque|sûre/i)
  })
})

describe('Avoirs : le contrôle Totaux compare en valeur absolue', () => {
  test('un avoir lu avec des montants négatifs est cohérent', () => {
    expect(controleTotaux(extr({ montant_ht: -100, montant_tva: -20, montant_ttc: -120 }), true).etat).toBe('ok')
  })
  test('un avoir aux totaux faux reste une anomalie', () => {
    expect(controleTotaux(extr({ montant_ht: -100, montant_tva: -20, montant_ttc: -130 }), true).etat).toBe('anomalie')
  })
  test('une facture normale aux montants négatifs n’est PAS adoucie (valeur absolue seulement pour un avoir)', () => {
    expect(controleTotaux(extr({ montant_ht: -100, montant_tva: 20, montant_ttc: 120 })).etat).toBe('anomalie')
  })
  test('controlerFacture passe le type de document au contrôle Totaux', () => {
    const r = controler({ extraction: extr({ montant_ht: -100, montant_tva: -20, montant_ttc: -120 }), extraction_erreur: null, type_document: 'avoir', lignes_etat: 'non_lues' }, [], [], [], [])
    expect(r[0].etat).toBe('ok')
  })
})

describe('une facture refusée ne sert jamais de preuve', () => {
  const moi = moiIban(IBAN_FR)
  test('historique : seules les factures acceptées servent de référence (un IBAN vu sur une refusée ne compte pas)', () => {
    const c = controleIbanHistorique(moi, [liee({ statut: 'refusee', iban_normalise: IBAN_FR2, fournisseur_siren: '123456782' })])
    expect(c.etat).toBe('alerte') // « premier IBAN vu » : aucune acceptée à comparer, et pas d'accusation de changement d'IBAN
  })
  test('doublon : une facture refusée n’accuse pas l’originale', () => {
    const c = controleDoublon({ id: 'me', numero: 'A', numero_normalise: 'A', montant_ttc: 1, date_facture: null, fournisseur_siren: '123456782', extraction: null }, [liee({ statut: 'refusee', numero_normalise: 'A' })])
    expect(c.etat).toBe('ok')
  })
})

describe('5 : IBAN confirmé à la main', () => {
  const moi = moiIban(IBAN_FR)
  const conf = (o = {}) => ({ iban: IBAN_FR, siren: '123456782', revoque_le: null, ...o })
  const avecSiren = { ...moi, fournisseur_siren: '123456782' }
  const REV = '2026-11-20T10:00:00Z'
  test('5 : un IBAN confirmé pour ce SIREN est vert, même sans facture acceptée, avec la date et le moyen', () => {
    const c = controleIbanHistorique(avecSiren, [], [{ ...conf(), confirme_le: '2026-11-10T10:00:00Z', moyen_verification: 'Appel' }])
    expect(c.etat).toBe('ok')
    expect(c.phrase).toMatch(/confirmé à la main/)
  })
  test('5 : sans confirmation, le comportement d\'avant est inchangé (premier IBAN : orange)', () => {
    expect(controleIbanHistorique(avecSiren, [], []).etat).toBe('alerte')
    expect(controleIbanHistorique(avecSiren, []).etat).toBe('alerte')
  })
  test('5 : une confirmation révoquée est ROUGE (même si l\'historique est identique), avec la date et le motif', () => {
    const ancienne = liee({ statut: 'acceptee', iban_normalise: IBAN_FR })
    const c = controleIbanHistorique(avecSiren, [ancienne], [conf({ revoque_le: REV, motif_revocation: 'RIB piraté' })])
    expect(c.etat).toBe('anomalie')
    expect(c.phrase).toMatch(/révoqué le .*\(RIB piraté\) : appelle avant d’accepter/)
  })
  test('5 : révoqué puis reconfirmé : vert', () => {
    expect(controleIbanHistorique(avecSiren, [], [conf({ revoque_le: REV, motif_revocation: 'x' }), conf()]).etat).toBe('ok')
  })
  test('5 : IBAN confirmé pour un autre SIREN : rouge sur « IBAN partagé » ; révoqué chez un autre SIREN : au moins orange', () => {
    expect(controleIbanPartage(avecSiren, [], [], [conf({ siren: '222222226' })]).etat).toBe('anomalie')
    expect(controleIbanPartage(avecSiren, [], [], [conf({ siren: '222222226', revoque_le: REV })]).etat).toBe('alerte')
    expect(controleIbanPartage(avecSiren, [], [], []).etat).toBe('ok')
  })
  test('5 : confirmé pour moi ne masque pas une facture d\'un autre SIREN : acceptée = rouge, à valider = orange', () => {
    const moiConfirme = [conf()]
    expect(controleIbanPartage(avecSiren, [liee({ statut: 'acceptee', fournisseur_siren: '222222226' })], [], moiConfirme).etat).toBe('anomalie')
    expect(controleIbanPartage(avecSiren, [liee({ statut: 'a_valider', fournisseur_siren: '222222226' })], [], moiConfirme).etat).toBe('alerte')
  })
  test('5 : liste des confirmations illisible (null) : jamais de vert, mais une anomalie d\'historique reste rouge', () => {
    expect(controleIbanHistorique(avecSiren, [liee({ statut: 'acceptee', iban_normalise: IBAN_FR })], null).etat).toBe('indisponible')
    expect(controleIbanPartage(avecSiren, [], [], null).etat).toBe('indisponible')
    expect(controleIbanPartage(avecSiren, [], [], null).aConfirmer).toBe(true)
    expect(controleIbanHistorique(avecSiren, [liee({ statut: 'acceptee', iban_normalise: IBAN_FR2 })], null).etat).toBe('anomalie')
  })
  test('5 : sans SIREN, une confirmation ne rend jamais le contrôle vert', () => {
    const sansSiren = { id: 'me', extraction: extr({ iban: IBAN_FR, fournisseur: { ...vide, siret: null } }) }
    expect(controleIbanHistorique(sansSiren, [], [conf()]).etat).toBe('indisponible')
    expect(controleIbanPartage(sansSiren, [], [], [conf()]).etat).toBe('indisponible')
  })
  test('5 : controlerFacture transmet les confirmations', () => {
    const f = { id: 'me', statut: 'a_valider', numero: 'A', numero_normalise: 'A', montant_ttc: 1, date_facture: null, fournisseur_siren: '123456782', iban_normalise: IBAN_FR, extraction: extr({ iban: IBAN_FR }), extraction_erreur: null }
    expect(controler(f, [], [], [], [conf()]).find((c) => c.id === 'iban-historique')?.etat).toBe('ok')
    expect(controler(f, [], [], [], [conf({ revoque_le: REV })]).find((c) => c.id === 'iban-historique')?.etat).toBe('anomalie')
  })
})

// Corrections de l'essai réel du 28/11/2026 : textes seulement, les états (couleurs) des contrôles ne changent pas.
describe('T1 IBAN : un seul message cohérent quand le fournisseur a déjà un IBAN confirmé', () => {
  const moi = moiIban(IBAN_FR)
  const confAutre = (o = {}) => ({ id: 'k', fournisseur_id: 'fo', siren: '123456782', iban: IBAN_FR2, confirme_le: '2026-06-01T08:00:00Z', revoque_le: null, motif_revocation: null, ...o })
  test('T1 un AUTRE IBAN est confirmé pour ce fournisseur : plus de « Premier IBAN vu », la phrase dit que ce n’est pas l’IBAN confirmé (toujours orange)', () => {
    const c = controleIbanHistorique(moi, [], [confAutre()])
    expect(c.etat).toBe('alerte')
    expect(c.phrase).toBe('Cet IBAN n’est pas celui confirmé pour ce fournisseur : appelle-le sur un numéro que tu connais déjà avant d’accepter.')
  })
  test('T1 l’ancien IBAN confirmé a été retiré : « Nouvel IBAN », jamais « Premier IBAN vu » (toujours orange)', () => {
    const c = controleIbanHistorique(moi, [], [confAutre({ revoque_le: '2026-11-20T08:00:00Z', motif_revocation: 'Changement' })])
    expect(c.etat).toBe('alerte')
    expect(c.phrase).toMatch(/^Nouvel IBAN pour ce fournisseur : son ancien IBAN confirmé a été retiré/)
  })
  test('T1 aucun IBAN confirmé pour ce fournisseur (celui d’un autre SIREN ne compte pas) : « Premier IBAN vu » reste juste', () => {
    expect(controleIbanHistorique(moi, [], []).phrase).toContain('Premier IBAN vu pour ce fournisseur')
    expect(controleIbanHistorique(moi, [], [confAutre({ siren: '222222226' })]).phrase).toContain('Premier IBAN vu pour ce fournisseur')
  })
})

describe('T2 facture décidée : plus de « avant d’accepter »', () => {
  test('T2 la synthèse d’une facture décidée parle des points relevés, sans « avant d’accepter »', () => {
    const c = [{ id: 'a', titre: 'a', etat: 'alerte', phrase: '' }, { id: 'b', titre: 'b', etat: 'anomalie', phrase: '' }]
    expect(synthese(c, true)).toBe('2 points d’attention relevés par l’outil (dont 1 anomalie).')
    expect(synthese([c[0]], true)).toBe('1 point d’attention relevé par l’outil.')
    expect(synthese(c)).toBe('2 points à vérifier avant d’accepter (dont 1 anomalie).')
  })
  test('T2 les phrases gardent le constat et perdent le conseil « avant d’accepter »', () => {
    expect(phraseApresDecision('L’IBAN a changé depuis les factures précédentes de ce fournisseur : appelle-le sur un numéro que tu connais déjà avant d’accepter.')).toBe('L’IBAN a changé depuis les factures précédentes de ce fournisseur.')
    expect(phraseApresDecision('Cet IBAN a été révoqué le 01/11/2026 (RIB piraté) : appelle avant d’accepter.')).toBe('Cet IBAN a été révoqué le 01/11/2026 (RIB piraté).')
    expect(phraseApresDecision('Vérification indisponible : les lignes de cette facture n’ont pas pu être lues. Réessaie avant d’accepter.')).toBe('Vérification indisponible : les lignes de cette facture n’ont pas pu être lues.')
    expect(phraseApresDecision('Vérification indisponible : l’état de lecture des lignes est inconnu. Compare avec le PDF avant d’accepter.')).toBe('Vérification indisponible : l’état de lecture des lignes est inconnu. Compare avec le PDF.')
    expect(phraseApresDecision('Nouvel IBAN pour ce fournisseur : son ancien IBAN confirmé a été retiré et celui-ci n’est pas encore confirmé. Appelle-le sur un numéro que tu connais déjà avant d’accepter.')).toBe('Nouvel IBAN pour ce fournisseur : son ancien IBAN confirmé a été retiré et celui-ci n’est pas encore confirmé.')
    expect(phraseApresDecision('Cet IBAN n’est pas celui confirmé pour ce fournisseur : appelle-le sur un numéro que tu connais déjà avant d’accepter.')).toBe('Cet IBAN n’est pas celui confirmé pour ce fournisseur.')
    expect(phraseApresDecision('Format de l’IBAN correct. Cela ne prouve pas à qui appartient le compte.')).toBe('Format de l’IBAN correct. Cela ne prouve pas à qui appartient le compte.')
  })
  test('T2 aucune phrase des neuf contrôles d’une facture décidée ne dit « avant d’accepter », et les états ne changent pas', () => {
    const f = { id: 'me', statut: 'acceptee', fournisseur_siren: '123456782', iban_normalise: IBAN_FR, extraction: extr({ iban: IBAN_FR }), extraction_erreur: null, lignes_etat: 'inconnu' }
    const avant = controler(f, null, null, null, null)
    expect(avant.some((c) => c.phrase.includes('avant d’accepter'))).toBe(true)
    const apres = controlesApresDecision(avant)
    expect(apres.some((c) => c.phrase.includes('avant d’accepter'))).toBe(false)
    expect(apres.map((c) => c.etat)).toEqual(avant.map((c) => c.etat))
  })
  test('T2 facture REFUSÉE : même retrait du conseil (phrase « Nouvel IBAN » comprise), états inchangés', () => {
    const conf = { id: 'k', fournisseur_id: 'fo', siren: '123456782', iban: IBAN_FR2, confirme_le: '2026-06-01T08:00:00Z', revoque_le: '2026-11-20T08:00:00Z', motif_revocation: 'Changement' }
    const f = { id: 'me', statut: 'refusee', fournisseur_siren: '123456782', iban_normalise: IBAN_FR, extraction: extr({ iban: IBAN_FR }), extraction_erreur: null, lignes_etat: 'lues' }
    const avant = controler(f, [], [], [], [conf])
    const hist = avant.find((c) => c.id === 'iban-historique')
    expect(hist.phrase).toMatch(/^Nouvel IBAN pour ce fournisseur/)
    const apres = controlesApresDecision(avant)
    expect(apres.find((c) => c.id === 'iban-historique').phrase).toBe('Nouvel IBAN pour ce fournisseur : son ancien IBAN confirmé a été retiré et celui-ci n’est pas encore confirmé.')
    expect(apres.some((c) => c.phrase.includes('avant d’accepter'))).toBe(false)
    expect(apres.map((c) => c.etat)).toEqual(avant.map((c) => c.etat))
    expect(synthese(apres, true)).not.toMatch(/avant d’accepter/)
  })
})
