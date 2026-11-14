// Saisie de la connexion ClickSend depuis l'écran (PR B) : droits (Jérôme seul, contrôlé côté serveur), vérification de la clé, rangement dans Secret Manager, jamais de clé rendue ni journalisée.
// Tout en mémoire : faux Secret Manager, faux ClickSend, aucun réseau. Clés, identifiants et adresses ci-dessous sont inventés.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import { creerEcrivainSecrets, ErreurEcritureSecret } from '../functions/src/securite/ecrire-secret.js';
import { creerConnexionSms, ErreurConnexionSms } from '../functions/src/coeur/connexion-sms.js';
import { verifierConnexion, creerSmsDirect, lireConnexion, nomDuSecret } from '../functions/src/coeur/sms-direct.js';
import { creerAppelRdvConnexion } from '../functions/src/rdv-connexion-appel.js';
import { creerAppelRdvEtat } from '../functions/src/rdv-appel.js';
import { connexionRdv, etatRdv } from '../functions-plateforme/src/rdv.js';

const CLE = 'cle-de-test-pas-un-vrai-secret';
const ID = 'compte-test';
const JEROME = { uid: 'j', token: { email: 'jerome.chevalier@gmail.com', email_verified: true } };
const adresseDe = (espace, jeton) => `https://exemple.test/rdv/${espace}/${jeton}`;

/** Faux Secret Manager : une table nom -> texte. `erreurEcriture` : erreur à lever à l'écriture. */
function monde({ verdict = { ok: true }, erreurEcriture = null, erreurLecture = null } = {}) {
  const secrets = new Map();
  const ecritures = [];
  let n = 0;
  const connexion = creerConnexionSms({
    lireSecret: async (nom) => { if (erreurLecture) throw erreurLecture; if (!secrets.has(nom)) throw Object.assign(new Error('absent'), { code: 5 }); return secrets.get(nom); },
    ecrireSecret: async (nom, texte) => { if (erreurEcriture) throw erreurEcriture; ecritures.push(nom); secrets.set(nom, texte); },
    verifier: async () => verdict,
    adresseDe,
    aleatoire: () => `jeton-aleatoire-numero-${++n}-abcdefghij`,
  });
  return { secrets, ecritures, connexion };
}

describe('écrire un secret (Secret Manager)', () => {
  const faux = (comportement) => {
    const appels = [];
    return { appels, addSecretVersion: async (a) => { appels.push(['add', a.parent]); return comportement.add?.(appels.filter((x) => x[0] === 'add').length); }, createSecret: async (a) => { appels.push(['create', a.secretId]); return comportement.create?.(); } };
  };
  const erreur = (code) => Object.assign(new Error('detail interne avec cle-de-test-pas-un-vrai-secret'), { code });

  test('ajoute une version ; si le secret n’existe pas, le crée puis ajoute (« déjà créé » toléré)', async () => {
    const direct = faux({});
    await creerEcrivainSecrets({ projet: 'p', client: direct })('CLICKSEND_RDV', '{"a":1}');
    assert.deepEqual(direct.appels, [['add', 'projects/p/secrets/CLICKSEND_RDV']]);
    const absent = faux({ add: (k) => { if (k === 1) throw erreur(5); } });
    await creerEcrivainSecrets({ projet: 'p', client: absent })('CLICKSEND_RDV_demo', '{"a":1}');
    assert.deepEqual(absent.appels.map((a) => a[0]), ['add', 'create', 'add']);
    const course = faux({ add: (k) => { if (k === 1) throw erreur(5); }, create: () => { throw erreur(6); } });
    await creerEcrivainSecrets({ projet: 'p', client: course })('CLICKSEND_RDV', '{"a":1}');
    assert.deepEqual(course.appels.map((a) => a[0]), ['add', 'create', 'add']);
  });

  test('sans droit : erreur « permission » ; autre panne : « indisponible » ; aucun détail ni texte écrit dans l’erreur', async () => {
    for (const [code, genre] of [[7, 'permission'], [14, 'indisponible'], [undefined, 'indisponible']]) {
      await assert.rejects(() => creerEcrivainSecrets({ client: faux({ add: () => { throw erreur(code); } }) })('CLICKSEND_RDV', `{"cle":"${CLE}"}`),
        (e) => e instanceof ErreurEcritureSecret && e.genre === genre && !e.message.includes(CLE) && !/detail interne/.test(e.message));
    }
  });

  test('nom ou texte invalide refusé sans rien appeler', async () => {
    const direct = faux({});
    for (const [nom, texte] of [['../x', 'a'], ['', 'a'], ['a b', 'a'], ['CLICKSEND_RDV', ''], ['CLICKSEND_RDV', undefined]]) await assert.rejects(() => creerEcrivainSecrets({ client: direct })(nom, texte));
    assert.equal(direct.appels.length, 0);
  });
});

describe('vérifier la clé auprès de ClickSend', () => {
  test('GET sur l’adresse fixe avec l’authentification ; 401/403 = refusée ; autre erreur ou réseau coupé = indisponible', async () => {
    const appels = [];
    const avec = (reponse) => async (url, options) => { appels.push({ url, options }); if (reponse instanceof Error) throw reponse; return reponse; };
    assert.deepEqual(await verifierConnexion({ identifiant: ID, cle: CLE, fetchImpl: avec({ ok: true, status: 200 }) }), { ok: true });
    assert.equal(appels[0].url, 'https://rest.clicksend.com/v3/account');
    assert.equal(appels[0].options.method, 'GET');
    assert.equal(appels[0].options.redirect, 'error');
    assert.equal(appels[0].options.headers.Authorization, `Basic ${Buffer.from(`${ID}:${CLE}`).toString('base64')}`);
    for (const s of [401, 403]) assert.deepEqual(await verifierConnexion({ identifiant: ID, cle: CLE, fetchImpl: avec({ ok: false, status: s }) }), { ok: false, raison: 'refusee' });
    assert.deepEqual(await verifierConnexion({ identifiant: ID, cle: CLE, fetchImpl: avec({ ok: false, status: 500 }) }), { ok: false, raison: 'indisponible' });
    assert.deepEqual(await verifierConnexion({ identifiant: ID, cle: CLE, fetchImpl: avec(new Error('reseau')) }), { ok: false, raison: 'indisponible' });
  });
});

describe('enregistrer la connexion', () => {
  test('clé vérifiée puis rangée dans le secret de l’espace (JSON lisible par l’envoi) ; adresse des réponses rendue ; la clé n’est JAMAIS dans la réponse', async () => {
    const m = monde();
    const r = await m.connexion.enregistrer('interne', { identifiant: ` ${ID} `, cle: CLE, expediteur: 'Martin' });
    assert.deepEqual(m.ecritures, ['CLICKSEND_RDV']);
    assert.deepEqual(r, { ok: true, adresse: adresseDe('interne', 'jeton-aleatoire-numero-1-abcdefghij'), adresseChangee: true });
    assert.ok(!JSON.stringify(r).includes(CLE));
    assert.deepEqual(lireConnexion(m.secrets.get('CLICKSEND_RDV')), { identifiant: ID, cle: CLE, jeton: 'jeton-aleatoire-numero-1-abcdefghij', expediteur: 'Martin' });
  });

  test('un client : secret CLICKSEND_RDV_<client> ; sur la plateforme (espaceRacine null) un client « interne » garde son suffixe', async () => {
    const m = monde();
    await m.connexion.enregistrer('demo', { identifiant: ID, cle: CLE });
    assert.deepEqual(m.ecritures, ['CLICKSEND_RDV_demo']);
    const secrets = new Map();
    const plateforme = creerConnexionSms({ lireSecret: async (n) => { if (!secrets.has(n)) throw Object.assign(new Error('absent'), { code: 5 }); return secrets.get(n); }, ecrireSecret: async (n, t) => secrets.set(n, t), verifier: async () => ({ ok: true }), adresseDe, espaceRacine: null });
    await plateforme.enregistrer('interne', { identifiant: ID, cle: CLE });
    assert.deepEqual([...secrets.keys()], ['CLICKSEND_RDV_interne']);
  });

  test('le jeton est gardé tant qu’on ne demande pas de le changer (la règle ClickSend reste valable) ; « regenererAdresse » ou « regenerer » le change', async () => {
    const m = monde();
    const a = await m.connexion.enregistrer('interne', { identifiant: ID, cle: CLE });
    const b = await m.connexion.enregistrer('interne', { identifiant: ID, cle: `${CLE}-bis` });
    assert.equal(b.adresse, a.adresse);
    assert.equal(b.adresseChangee, false);
    const c = await m.connexion.enregistrer('interne', { identifiant: ID, cle: CLE, regenererAdresse: true });
    assert.notEqual(c.adresse, a.adresse);
    assert.equal(c.adresseChangee, true);
    const d = await m.connexion.regenererAdresse('interne');
    assert.notEqual(d.adresse, c.adresse);
    const contenu = lireConnexion(m.secrets.get('CLICKSEND_RDV'));
    assert.equal(contenu.identifiant, ID);
    assert.equal(contenu.cle, CLE, 'régénérer l’adresse ne touche ni l’identifiant ni la clé');
    await assert.rejects(() => monde().connexion.regenererAdresse('interne'), (e) => e instanceof ErreurConnexionSms && e.code === 'failed-precondition');
  });

  test('champs invalides refusés AVANT tout appel à ClickSend ou à Secret Manager', async () => {
    let appelsClickSend = 0;
    const ecritures = [];
    const connexion = creerConnexionSms({ lireSecret: async () => { throw Object.assign(new Error('absent'), { code: 5 }); }, ecrireSecret: async (n) => { ecritures.push(n); throw new Error('ne doit pas être appelé'); }, verifier: async () => { appelsClickSend += 1; return { ok: true }; }, adresseDe });
    for (const mauvais of [{ identifiant: '', cle: CLE }, { identifiant: ID, cle: '   ' }, { identifiant: ID, cle: 'a\nb' }, { identifiant: 'x'.repeat(201), cle: CLE }, { identifiant: ID, cle: CLE, expediteur: 'trop long expediteur !' }, { identifiant: 5, cle: CLE }, {}, undefined]) {
      await assert.rejects(() => connexion.enregistrer('interne', mauvais), (e) => e instanceof ErreurConnexionSms && e.code === 'invalid-argument' && !e.message.includes(CLE));
    }
    assert.equal(appelsClickSend, 0);
    assert.equal(ecritures.length, 0);
  });

  test('clé refusée par ClickSend ou ClickSend indisponible : rien n’est enregistré, message clair sans la clé', async () => {
    for (const [raison, extrait] of [['refusee', /refuse cet identifiant/], ['indisponible', /ne répond pas/]]) {
      const m = monde({ verdict: { ok: false, raison } });
      await assert.rejects(() => m.connexion.enregistrer('interne', { identifiant: ID, cle: CLE }), (e) => e.code === 'failed-precondition' && extrait.test(e.message) && !e.message.includes(CLE));
      assert.equal(m.ecritures.length, 0);
    }
  });

  test('le serveur n’a pas le droit d’écrire le secret : message qui renvoie à la doc, sans la clé ; panne de Secret Manager : message neutre', async () => {
    const permission = monde({ erreurEcriture: new ErreurEcritureSecret('permission') });
    await assert.rejects(() => permission.connexion.enregistrer('interne', { identifiant: ID, cle: CLE }), (e) => e.code === 'failed-precondition' && /droit d’enregistrer/.test(e.message) && /rdv-sms-clicksend/.test(e.message) && !e.message.includes(CLE));
    const panne = monde({ erreurEcriture: new Error(`panne ${CLE}`) });
    await assert.rejects(() => panne.connexion.enregistrer('interne', { identifiant: ID, cle: CLE }), (e) => e.code === 'failed-precondition' && !e.message.includes(CLE));
  });

  test('l’état dit si la connexion est enregistrée, jamais la clé ni l’adresse ; l’adresse des réponses (avec son jeton) n’est rendue que sur demande', async () => {
    const m = monde();
    assert.deepEqual(await m.connexion.etat('interne'), { enregistre: false, expediteur: '' });
    await assert.rejects(() => m.connexion.adresse('interne'), (e) => e.code === 'failed-precondition');
    await m.connexion.enregistrer('interne', { identifiant: ID, cle: CLE, expediteur: 'Martin' });
    const e = await m.connexion.etat('interne');
    assert.deepEqual(e, { enregistre: true, expediteur: 'Martin' });
    assert.ok(!JSON.stringify(e).includes(CLE) && !JSON.stringify(e).includes(ID) && !JSON.stringify(e).includes('jeton'));
    const a = await m.connexion.adresse('interne');
    assert.match(a.adresse, /jeton-aleatoire-numero-1/);
    assert.ok(!JSON.stringify(a).includes(CLE));
  });

  test('une panne de LECTURE du coffre (réseau, droits) n’est pas « pas de connexion » : erreur claire, rien n’est écrit, aucun nouveau jeton fabriqué ; seules l’absence vraie (5) et la version désactivée (9) valent « pas enregistrée »', async () => {
    for (const code of [14, 7, undefined]) {
      const m = monde({ erreurLecture: Object.assign(new Error(`panne ${CLE}`), { code }) });
      for (const appel of [() => m.connexion.etat('interne'), () => m.connexion.adresse('interne'), () => m.connexion.regenererAdresse('interne'), () => m.connexion.enregistrer('interne', { identifiant: ID, cle: CLE })]) {
        await assert.rejects(appel, (e) => e instanceof ErreurConnexionSms && e.code === 'failed-precondition' && !e.message.includes(CLE) && /rien n’a été modifié/i.test(e.message), String(code));
      }
      assert.equal(m.ecritures.length, 0);
    }
    for (const code of [5, 9]) assert.deepEqual(await monde({ erreurLecture: Object.assign(new Error('x'), { code }) }).connexion.etat('interne'), { enregistre: false, expediteur: '' });
  });

  test('l’expéditeur doit être un texte', async () => {
    for (const mauvais of [5, {}, ['a']]) await assert.rejects(() => monde().connexion.enregistrer('interne', { identifiant: ID, cle: CLE, expediteur: mauvais }), (e) => e.code === 'invalid-argument');
  });

  test('de bout en bout : la connexion saisie branche l’envoi (même secret, même format)', async () => {
    const m = monde();
    const sms = creerSmsDirect({ lireSecret: async (n) => { if (!m.secrets.has(n)) throw new Error('absent'); return m.secrets.get(n); }, donneesDe: () => ({ base: '', donnees: {} }) });
    assert.equal(await sms.brancheRdv('interne'), false);
    await m.connexion.enregistrer('interne', { identifiant: ID, cle: CLE });
    assert.equal(nomDuSecret('interne'), [...m.secrets.keys()][0]);
    const sms2 = creerSmsDirect({ lireSecret: async (n) => { if (!m.secrets.has(n)) throw new Error('absent'); return m.secrets.get(n); }, donneesDe: () => ({ base: '', donnees: {} }) });
    assert.equal(await sms2.brancheRdv('interne'), true);
  });
});

describe('rdvConnexionSms chez Jérôme : Jérôme seul, contrôlé côté serveur', () => {
  const appeler = async (auth, data, options = {}) => {
    const m = options.m ?? monde();
    const journaux = [];
    const appel = creerAppelRdvConnexion({ connexion: m.connexion, journal: (l) => journaux.push(l) });
    try { return { r: await appel({ auth, data }), journaux, m }; } catch (e) { return { e, journaux, m }; }
  };
  const demande = { action: 'enregistrer', identifiant: ID, cle: CLE };

  test('seul le compte de Jérôme (e-mail vérifié) peut enregistrer, lire l’état ou régénérer ; le compte d’assistant, un autre compte, un e-mail non vérifié, sans connexion : refusés, rien d’écrit', async () => {
    for (const auth of [
      { token: { email: 'jeromebot.chevalierbot@gmail.com', email_verified: true } },
      { token: { email: 'quelquun@exemple.test', email_verified: true } },
      { token: { email: 'jerome.chevalier@gmail.com', email_verified: false } },
      { token: { email: 'jerome.chevalier@gmail.com' } },
      { token: { email: 'jerome.chevalier@gmail.com', email_verified: 'true' } },
      { token: { email: ['jerome.chevalier@gmail.com'], email_verified: true } },
      { token: { email: 'jerome.chevalier+x@gmail.com', email_verified: true } },
      { token: {} },
    ]) {
      for (const d of [demande, { action: 'etat' }, { action: 'adresse' }, { action: 'regenerer' }]) {
        const { e, m } = await appeler(auth, d);
        assert.equal(e?.code, 'permission-denied', JSON.stringify(auth));
        assert.equal(e.message, 'Action non autorisée.');
        assert.equal(m.ecritures.length, 0);
      }
    }
    const sans = await appeler(undefined, demande);
    assert.equal(sans.e.code, 'unauthenticated');
  });

  test('Jérôme : enregistre, lit l’état (adresse), régénère ; actions inconnues refusées', async () => {
    const m = monde();
    const a = await appeler(JEROME, demande, { m });
    assert.equal(a.r.ok, true);
    const etat = await appeler(JEROME, { action: 'etat' }, { m });
    assert.deepEqual(etat.r, { enregistre: true, expediteur: '' });
    const adresse = await appeler(JEROME, { action: 'adresse' }, { m });
    assert.equal(adresse.r.adresse, a.r.adresse);
    const reg = await appeler(JEROME, { action: 'regenerer' }, { m });
    assert.notEqual(reg.r.adresse, a.r.adresse);
    for (const mauvais of [{ action: 'supprimer' }, {}, null]) assert.equal((await appeler(JEROME, mauvais, { m })).e?.code, 'invalid-argument');
  });

  test('le journal ne reçoit ni clé, ni identifiant, ni jeton, ni adresse, y compris sur un refus ou une erreur', async () => {
    const m = monde({ verdict: { ok: false, raison: 'refusee' } });
    const refus = await appeler(JEROME, demande, { m });
    assert.equal(refus.e.code, 'failed-precondition');
    const ok = await appeler(JEROME, demande);
    const casse = await appeler(JEROME, demande, { m: { connexion: { enregistrer: async () => { throw new Error(`panne ${CLE}`); } } } });
    assert.equal(casse.e.code, 'internal');
    assert.ok(!casse.e.message.includes(CLE));
    const tout = JSON.stringify([refus.journaux, ok.journaux, casse.journaux]);
    for (const secret of [CLE, ID, 'jeton-aleatoire', 'exemple.test']) assert.ok(!tout.includes(secret), secret);
  });

  test('rdvEtat dit à l’écran si ce compte peut configurer (Jérôme oui, le compte d’assistant non), sans rien révéler d’autre', async () => {
    const appel = creerAppelRdvEtat({ sortie: { brancheRdv: async () => true } });
    assert.deepEqual(await appel({ auth: JEROME }), { branche: true, peutConfigurer: true });
    assert.deepEqual(await appel({ auth: { token: { email: 'jeromebot.chevalierbot@gmail.com', email_verified: true } } }), { branche: true, peutConfigurer: false });
  });
});

describe('rdvConnexionSms chez les clients : Jérôme seul, jamais un éditeur du client', () => {
  const fauxFirestore = ({ membres = {} } = {}) => ({
    doc: (chemin) => ({ get: async () => {
      const m = /^clients\/([^/]+)\/membres\/(.+)$/.exec(chemin);
      const donnee = m ? membres[`${m[1]}/${m[2]}`] : undefined;
      return { exists: Boolean(donnee), get: (champ) => donnee?.[champ] };
    } }),
  });
  const modulesActifs = async (client) => (client === 'atelier' ? ['rdv', 'devis'] : ['devis']);
  const ED = { uid: 'e', token: { email: 'ed@exemple.test', email_verified: true } };
  const utilise = (espaces) => ({ etat: async (e) => { espaces.push(['etat', e]); return { enregistre: false, expediteur: '' }; }, adresse: async (e) => { espaces.push(['adresse', e]); return { adresse: 'x' }; }, enregistrer: async (e) => { espaces.push(['enregistrer', e]); return { ok: true, adresse: 'x', adresseChangee: true }; }, regenererAdresse: async (e) => { espaces.push(['regenerer', e]); return { ok: true }; } });

  test('un éditeur du client est refusé (le rôle ne suffit pas) ; Jérôme est accepté pour un client dont le module est actif, avec le secret DE CE client', async () => {
    const espaces = [];
    const connexion = utilise(espaces);
    await assert.rejects(() => connexionRdv({ auth: ED, donnees: { client: 'atelier', action: 'enregistrer', identifiant: ID, cle: CLE }, connexion, modulesActifs }), (e) => e.code === 'permission-denied' && e.message === 'Action non autorisée.');
    assert.deepEqual(espaces, []);
    const r = await connexionRdv({ auth: JEROME, donnees: { client: 'atelier', action: 'enregistrer', identifiant: ID, cle: CLE }, connexion, modulesActifs });
    assert.equal(r.ok, true);
    await connexionRdv({ auth: JEROME, donnees: { client: 'atelier', action: 'etat' }, connexion, modulesActifs });
    assert.deepEqual(espaces, [['enregistrer', 'atelier'], ['etat', 'atelier']]);
  });

  test('chez les clients aussi : lecteur, compte d’assistant, e-mail non vérifié ou absent, « verified » en chaîne : refusés sur CHAQUE action (enregistrer, état, adresse, régénérer), rien d’appelé ; l’e-mail de Jérôme en majuscules est accepté', async () => {
    const espaces = [];
    for (const token of [
      { email: 'lec@exemple.test', email_verified: true },
      { email: 'jeromebot.chevalierbot@gmail.com', email_verified: true },
      { email: 'jerome.chevalier@gmail.com', email_verified: false },
      { email: 'jerome.chevalier@gmail.com', email_verified: 'true' },
      { email: 'jerome.chevalier@gmail.com' },
      {},
    ]) {
      for (const action of ['enregistrer', 'etat', 'adresse', 'regenerer']) {
        await assert.rejects(() => connexionRdv({ auth: { uid: 'x', token }, donnees: { client: 'atelier', action, identifiant: ID, cle: CLE }, connexion: utilise(espaces), modulesActifs }), (e) => e.code === 'permission-denied' && e.message === 'Action non autorisée.', `${JSON.stringify(token)} ${action}`);
      }
    }
    assert.deepEqual(espaces, []);
    const ok = await connexionRdv({ auth: { uid: 'j', token: { email: ' Jerome.Chevalier@GMAIL.com ', email_verified: true } }, donnees: { client: 'atelier', action: 'etat' }, connexion: utilise(espaces), modulesActifs });
    assert.equal(ok.enregistre, false);
  });

  test('un client sans le module, inconnu ou au nom douteux : le même refus neutre, rien d’appelé ; sans connexion : « connexion requise »', async () => {
    const espaces = [];
    for (const client of ['sansrdv', 'absent', '../x', 'A B', '', undefined, 12]) {
      await assert.rejects(() => connexionRdv({ auth: JEROME, donnees: { client, action: 'etat' }, connexion: utilise(espaces), modulesActifs }), (e) => e.code === 'permission-denied' && e.message === 'Action non autorisée.', String(client));
    }
    assert.deepEqual(espaces, []);
    await assert.rejects(() => connexionRdv({ auth: undefined, donnees: { client: 'atelier', action: 'etat' }, connexion: utilise(espaces), modulesActifs }), (e) => e.code === 'unauthenticated');
  });

  test('une erreur du service est rendue lisible (sans la clé) ; une panne inattendue devient une phrase neutre', async () => {
    await assert.rejects(() => connexionRdv({ auth: JEROME, donnees: { client: 'atelier', action: 'enregistrer', identifiant: '', cle: CLE }, connexion: monde().connexion, modulesActifs }), (e) => e.code === 'invalid-argument' && !e.message.includes(CLE));
    await assert.rejects(() => connexionRdv({ auth: JEROME, donnees: { client: 'atelier', action: 'etat' }, connexion: { etat: async () => { throw new Error(`panne ${CLE}`); } }, modulesActifs }), (e) => e.code === 'internal' && !e.message.includes(CLE));
  });

  test('rdvEtat des clients : peutConfigurer vrai pour Jérôme seulement, jamais pour un éditeur du client', async () => {
    const db = fauxFirestore({ membres: { 'atelier/ed@exemple.test': { role: 'editeur' }, 'atelier/jerome.chevalier@gmail.com': { role: 'editeur' } } });
    const fiches = { atelier: { modules: { rdv: true } } };
    const dbAvecFiches = { doc: (c) => { const m = /^clients\/([^/]+)$/.exec(c); return m ? { get: async () => ({ exists: Boolean(fiches[m[1]]), get: (champ) => fiches[m[1]]?.[champ], data: () => fiches[m[1]] }) } : db.doc(c); } };
    const sortie = { brancheRdv: async () => true };
    try {
      const ed = await etatRdv({ db: dbAvecFiches, auth: ED, donnees: { client: 'atelier' }, sortie });
      assert.deepEqual(ed, { branche: true, peutConfigurer: false });
      const jerome = await etatRdv({ db: dbAvecFiches, auth: JEROME, donnees: { client: 'atelier' }, sortie });
      assert.deepEqual(jerome, { branche: true, peutConfigurer: true });
    } catch (e) {
      assert.fail(`rdvEtat des clients : ${e.message} (le faux Firestore ne suffit pas ? voir tests/rdv-envoi.test.js)`);
    }
  });
});

describe('verrous statiques', () => {
  const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
  test('seuls les deux index fabriquent l’écrivain de secrets (le service de connexion le reçoit en paramètre) ; la plateforme passe espaceRacine: null à la connexion ET à l’envoi (même nom de secret lu et écrit) ; l’adresse des réponses est propre à chaque projet', () => {
    const importeurs = [];
    const directs = [];
    const parcourir = (dossier) => {
      for (const nom of readdirSync(dossier)) {
        if (['node_modules', 'serveur', 'partage'].includes(nom)) continue;
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (nom.endsWith('.js')) {
          const texte = readFileSync(chemin, 'utf8');
          const court = chemin.replace(/^.*(functions(?:-plateforme)?\/src\/.*)$/, '$1');
          if (/creerEcrivainSecrets/.test(texte)) importeurs.push(court);
          if (/addSecretVersion|createSecret/.test(texte) && !court.endsWith('ecrire-secret.js')) directs.push(court);
        }
      }
    };
    const racine = new URL('..', import.meta.url).pathname;
    parcourir(join(racine, 'functions', 'src')); parcourir(join(racine, 'functions-plateforme', 'src'));
    assert.deepEqual(importeurs.filter((f) => !f.endsWith('ecrire-secret.js')).sort(), ['functions-plateforme/src/index.js', 'functions/src/index.js']);
    assert.deepEqual(directs, [], 'aucun autre fichier n’écrit dans Secret Manager (addSecretVersion / createSecret) que securite/ecrire-secret.js');
    const plateforme = lire('functions-plateforme/src/index.js');
    assert.equal((plateforme.match(/espaceRacine: null/g) ?? []).length, 2, 'connexion ET envoi');
    assert.match(plateforme, /europe-west9-chevalier-ia-app\.cloudfunctions\.net\/rdvReponseSms\/\$\{client\}\/\$\{jeton\}/);
    assert.match(lire('functions/src/index.js'), /europe-west9-chevalier-ia-os\.cloudfunctions\.net\/rdvReponseSms\/\$\{jeton\}/);
  });
});
