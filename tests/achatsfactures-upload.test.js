// Port de « upload-facture.test.ts » de l'appli BTP (29 cas) : contrôle du fichier (14 cas, mêmes valeurs) et envoi (15 cas).
// L'envoi passe ici par la vraie couche des actions de l'OS (js/os/actions-metier.js) avec un faux réseau : il n'y a plus de `fetcher`, d'`url` ni de `jwt` à fournir (adresse réglée dans la connexion, ticket neuf demandé à la base).
import { describe, test } from 'node:test'
import { expect, espion } from './_expect-achatsfactures.js'
import { envoyerFacture, ErreurUpload, MESSAGE_INCERTAIN, TAILLE_MAX_OCTETS, verifierContenu, verifierFichierPdf, verifierMetadonnees } from '../js/modules/achatsfactures/upload.js'
import { creerActions, ErreurAction } from '../js/os/actions-metier.js'

const octets = (s) => new TextEncoder().encode(s)
const pdf = (taille = 300) => new File(['%PDF-1.4\n' + 'x'.repeat(taille) + '\n%%EOF\n'], 'facture.pdf', { type: 'application/pdf' })

describe('verifierMetadonnees', () => {
  test('accepte un PDF normal', () => expect(verifierMetadonnees({ name: 'a.pdf', type: 'application/pdf', size: 5000 })).toBeNull())
  test('accepte un PDF sans type déclaré mais avec le bon nom', () => expect(verifierMetadonnees({ name: 'a.PDF', type: '', size: 5000 })).toBeNull())
  test('refuse une image avec un message clair', () => expect(verifierMetadonnees({ name: 'a.jpg', type: 'image/jpeg', size: 5000 })).toMatch(/seuls les PDF/))
  test('refuse un fichier Word', () => expect(verifierMetadonnees({ name: 'a.docx', type: 'application/msword', size: 5000 })).toMatch(/pas un PDF/))
  test('refuse un fichier vide', () => expect(verifierMetadonnees({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/vide/))
  test('refuse un fichier minuscule', () => expect(verifierMetadonnees({ name: 'a.pdf', type: 'application/pdf', size: 20 })).toMatch(/trop petit/))
  test('refuse plus de 10 Mo', () => expect(verifierMetadonnees({ name: 'a.pdf', type: 'application/pdf', size: TAILLE_MAX_OCTETS + 1 })).toMatch(/trop gros/))
  test('accepte exactement 10 Mo', () => expect(verifierMetadonnees({ name: 'a.pdf', type: 'application/pdf', size: TAILLE_MAX_OCTETS })).toBeNull())
})

describe('verifierContenu', () => {
  test('accepte %PDF- ... %%EOF', () => expect(verifierContenu(octets('%PDF-1.7'), octets('abc\n%%EOF\n'))).toBeNull())
  test('refuse un fichier renommé en .pdf', () => expect(verifierContenu(octets('PK\u0003\u0004zip'), octets('%%EOF'))).toMatch(/pas un vrai PDF/))
  test('refuse un PDF tronqué', () => expect(verifierContenu(octets('%PDF-1.7'), octets('xxxx'))).toMatch(/abîmé/))
})

describe('verifierFichierPdf', () => {
  test('accepte un vrai PDF', async () => expect(await verifierFichierPdf(pdf())).toBeNull())
  test('refuse un faux PDF', async () => expect(await verifierFichierPdf(new File(['<html>' + 'x'.repeat(300)], 'f.pdf', { type: 'application/pdf' }))).toMatch(/pas un vrai PDF/))
  test('refuse un PDF sans fin', async () => expect(await verifierFichierPdf(new File(['%PDF-1.4' + 'x'.repeat(300)], 'f.pdf', { type: 'application/pdf' }))).toMatch(/abîmé/))
})

describe('envoyerFacture (couche des actions de l’OS, faux réseau)', () => {
  const URL_FAUSSE = ['https', '://n8n-essai.invalid/ajout-facture'].join('')
  const reponse = (status, corps) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => corps })
  /** Vraie couche des actions, faux fetch ; `ticket` null = la demande de ticket échoue (session perdue). */
  function monter(fetchImpl, { adresse = URL_FAUSSE, ticket = 'ticket-1' } = {}) {
    const actions = creerActions({
      lireConnexion: () => ({ webhooks: { ajoutFacture: adresse } }),
      demanderTicket: async () => { if (ticket === null) { const e = new Error('Reconnecte-toi.'); e.code = 'reconnexion'; throw e } return ticket },
      fetchImpl,
    })
    return actions
  }
  /** Faux « actions » direct, pour les cas qui ne dépendent pas de la couche (délai, annulation, erreur portant un identifiant). */
  const fausseAction = (impl) => ({ ajouterFacture: impl })

  test('envoie le fichier avec le ticket et rend l’identifiant', async () => {
    const f = espion(() => reponse(200, { ok: true, facture_id: 'abc', lecture: 'ok' }))
    const r = await envoyerFacture(pdf(), { actions: monter(f) })
    expect(r).toEqual({ factureId: 'abc', lectureReussie: true, lignesEcrites: true })
    const [url, init] = f.appels[0]
    expect(url).toBe(URL_FAUSSE)
    expect(init.headers.Authorization).toBe('Bearer ticket-1')
    expect(init.body.get('fichier') instanceof Blob).toBe(true)
  })
  test('signale une lecture à compléter', async () => {
    const r = await envoyerFacture(pdf(), { actions: monter(() => reponse(200, { ok: true, facture_id: 'abc', lecture: 'a_completer' })) })
    expect(r.lectureReussie).toBe(false)
  })
  test('doublon : erreur « doublon » ; l’identifiant de la fiche existante est gardé quand l’erreur le porte', async () => {
    const e = await envoyerFacture(pdf(), { actions: fausseAction(() => Promise.reject(Object.assign(new ErreurAction('x', 'doublon'), { facture_id: 'vieille' }))) }).catch((x) => x)
    expect(e instanceof ErreurUpload).toBe(true)
    expect(e.code).toBe('doublon')
    expect(e.factureId).toBe('vieille')
    // Par la vraie couche, ErreurAction ne garde que le message et le code : l'identifiant n'arrive pas (voir .github/A-FAIRE.md).
    const reel = await envoyerFacture(pdf(), { actions: monter(() => reponse(409, { ok: false, code: 'doublon', facture_id: 'vieille' })) }).catch((x) => x)
    expect(reel.code).toBe('doublon')
    expect(reel.factureId).toBeNull()
  })
  test('401 : message de session expirée', async () => {
    const e = await envoyerFacture(pdf(), { actions: monter(() => reponse(401, { ok: false, code: 'non_autorise' })) }).catch((x) => x)
    expect(e.code).toBe('session')
  })
  test('sans ticket (session perdue) : rien n’est envoyé', async () => {
    const f = espion(() => reponse(200, { ok: true, facture_id: 'a' }))
    const e = await envoyerFacture(pdf(), { actions: monter(f, { ticket: null }) }).catch((x) => x)
    expect(e.code).toBe('session')
    expect(f).toHaveBeenCalledTimes(0)
  })
  test('sans adresse de webhook ou sans couche d’actions : message clair, rien envoyé', async () => {
    const f = espion(() => reponse(200, { ok: true, facture_id: 'a' }))
    const e = await envoyerFacture(pdf(), { actions: monter(f, { adresse: '' }) }).catch((x) => x)
    expect(e.code).toBe('config')
    expect(f).toHaveBeenCalledTimes(0)
    const e2 = await envoyerFacture(pdf(), {}).catch((x) => x)
    expect(e2.code).toBe('non_configure')
  })
  test('erreur serveur : message selon le code', async () => {
    const e = await envoyerFacture(pdf(), { actions: monter(() => reponse(502, { ok: false, code: 'stockage_impossible' })) }).catch((x) => x)
    expect(e.message).toMatch(/Rien n’a été créé/)
  })
  test('réseau coupé : message « peut-être en cours de lecture »', async () => {
    const e = await envoyerFacture(pdf(), { actions: monter(() => Promise.reject(new Error('x'))) }).catch((x) => x)
    expect(e.code).toBe('reseau')
    expect(e.message).toBe(MESSAGE_INCERTAIN)
  })
  test('délai dépassé : l’attente s’arrête et le message est le même', async () => {
    const e = await envoyerFacture(pdf(), { actions: fausseAction(() => new Promise(() => {})), delaiMs: 20 }).catch((x) => x)
    expect(e.code).toBe('delai')
    expect(e.message).toBe(MESSAGE_INCERTAIN)
  })
  test('annulation par la personne : l’attente s’arrête', async () => {
    const c = new AbortController()
    const p = envoyerFacture(pdf(), { actions: fausseAction(() => new Promise(() => {})), signal: c.signal })
    c.abort()
    expect((await p.catch((x) => x)).code).toBe('delai')
  })
  test('annulation AVANT le départ : rien n’est envoyé', async () => {
    const c = new AbortController(); c.abort()
    const f = espion(() => reponse(200, { ok: true, facture_id: 'a' }))
    const e = await envoyerFacture(pdf(), { actions: monter(f), signal: c.signal }).catch((x) => x)
    expect(e.code).toBe('annule')
    expect(f).toHaveBeenCalledTimes(0)
  })
  test('coupure pendant la lecture du corps de la réponse : message « peut-être en cours de lecture »', async () => {
    const c = new AbortController()
    const f = () => Promise.resolve({ status: 200, ok: true, json: () => { c.abort(); return new Promise(() => {}) } })
    const e = await envoyerFacture(pdf(), { actions: monter(f), signal: c.signal }).catch((x) => x)
    expect(e.message).toBe(MESSAGE_INCERTAIN)
  })
  test('réponse JSON « null » : jamais d’erreur technique, message en français', async () => {
    const e = await envoyerFacture(pdf(), { actions: monter(() => reponse(200, null)) }).catch((x) => x)
    expect(e.code).toBe('reponse_inattendue')
    const e2 = await envoyerFacture(pdf(), { actions: monter(() => reponse(500, null)) }).catch((x) => x)
    expect(e2.message).toMatch(/Une erreur est survenue/)
  })
  test('lignes non écrites : signalé (la fiche existe)', async () => {
    const r = await envoyerFacture(pdf(), { actions: monter(() => reponse(200, { ok: true, facture_id: 'abc', lecture: 'ok', lignes_ecrites: false })) })
    expect(r.lignesEcrites).toBe(false)
  })
  test('200 sans ok:true n’est pas un succès', async () => {
    const e = await envoyerFacture(pdf(), { actions: monter(() => reponse(200, { hello: 1 })) }).catch((x) => x)
    expect(e.code).toBe('reponse_inattendue')
  })
})
