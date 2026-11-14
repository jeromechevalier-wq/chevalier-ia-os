// Envoi direct des SMS du module Rendez-vous par ClickSend (functions/src/coeur/sms-direct.js). Tout en mémoire : faux ClickSend, base en mémoire, aucun réseau,
// aucun vrai SMS. Les clés et numéros ci-dessous sont inventés.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import { creerSmsDirect, creerGestionnaireReponses, lireConnexion, nomDuSecret, memeJeton, ErreurSortieSms, URL_ENVOI, SECRET_CLICKSEND } from '../functions/src/coeur/sms-direct.js';
import { PRECONDITION_ECHOUEE } from '../scripts/porte/adaptateur.js';

const T0 = Date.parse('2026-11-16T10:00:00Z'); // lundi 11 h à Paris : dans la plage d'envoi
const iso = (ms) => new Date(ms).toISOString();
const JETON = 'jeton_de_test_0123456789_abcdef';
const SECRET = JSON.stringify({ identifiant: 'compte-test', cle: 'cle-de-test-pas-un-vrai-secret', jeton: JETON });

function creerBase() {
  const docs = new Map();
  let version = 0;
  const lire = (c) => (docs.has(c) ? { ...docs.get(c).d, id: c.split('/').pop(), updateTime: docs.get(c).v } : null);
  const dansTable = (chemin) => [...docs].filter(([c]) => c.startsWith(`${chemin}/`) && !c.slice(chemin.length + 1).includes('/'));
  return {
    docs,
    lireDoc: async (c) => lire(c),
    creerSiAbsent: async (c, d) => { if (docs.has(c)) return false; docs.set(c, { d: { ...d }, v: ++version }); return true; },
    majDoc: async (c, p, { lastUpdateTime } = {}) => {
      if (!docs.has(c)) return false;
      if (lastUpdateTime !== undefined && docs.get(c).v !== lastUpdateTime) return PRECONDITION_ECHOUEE;
      docs.set(c, { d: { ...docs.get(c).d, ...p }, v: ++version });
      return true;
    },
    lister: async (chemin, { limite = 100 } = {}) => dansTable(chemin).slice(0, limite).map(([c]) => lire(c)),
    listerPar: async (chemin, champ, valeur, { limite = 500 } = {}) => dansTable(chemin).filter(([, x]) => x.d[champ] === valeur).slice(0, limite).map(([c]) => lire(c)),
    ecrireLot: async (operations) => {
      for (const o of operations) {
        if (o.type === 'creer' && docs.has(o.chemin)) { const e = new Error('existe'); e.code = 6; throw e; }
        if (o.type === 'maj' && !docs.has(o.chemin)) { const e = new Error('absent'); e.code = 5; throw e; }
      }
      for (const o of operations) {
        if (o.type === 'creer') docs.set(o.chemin, { d: { ...o.donnees }, v: ++version });
        else docs.set(o.chemin, { d: { ...docs.get(o.chemin).d, ...o.donnees }, v: ++version });
      }
    },
  };
}

const REPONSE_OK = (id = 'AAAA-1111') => ({ ok: true, status: 200, json: async () => ({ http_code: 200, response_code: 'SUCCESS', data: { messages: [{ status: 'SUCCESS', message_id: id }] } }) });
const REPONSE_STATUT = (statut) => ({ ok: true, status: 200, json: async () => ({ http_code: 200, response_code: 'SUCCESS', data: { messages: [{ status: statut }] } }) });

/** Un monde : base en mémoire, un rendez-vous ouvert avec 2 participants, un faux ClickSend. `reponses` : file de réponses (ou fonction). */
function monde({ secret = SECRET, reponses = null, moduleActif = true } = {}) {
  const base = creerBase();
  const temps = { t: T0 };
  const appels = [];
  let n = 0;
  const fetchImpl = async (url, options) => {
    appels.push({ url, options, corps: JSON.parse(options.body) });
    if (typeof reponses === 'function') return reponses(appels.length, appels.at(-1));
    n += 1;
    return reponses?.[n - 1] ?? REPONSE_OK(`ID-${n}`);
  };
  const sms = creerSmsDirect({
    lireSecret: async (nom) => { if (secret === null) throw new Error('absent'); sms.nomsLus.push(nom); return secret; },
    donneesDe: () => ({ base: '', donnees: base }),
    moduleActif: async () => moduleActif,
    fetchImpl,
    maintenant: () => temps.t,
  });
  sms.nomsLus = [];
  base.docs.set('rdv_parametres/reglages', { d: { nomDansLesSms: 'Mme Martin', numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: '+33700000001', actif: true }], numeroAffiche: 'n1', relances: { delaiHeures: 24, nombre: 3 }, rappel: { actif: true, heure: '19:00' }, plage: { debut: '08:00', fin: '20:30' }, modeles: {} }, v: 1 });
  const semer = (id = 'r1', extra = {}, parts = [['p1', 'M. Durand', '+33600000001'], ['p2', 'Terrassier', '+33600000002']]) => {
    base.docs.set(`rdv_rendezvous/${id}`, { v: 1, d: { client: 'M. Durand', adresse: '12 rue des Lilas', commune: 'Lyon', creneaux: [iso(T0 + 4 * 86400000), iso(T0 + 5 * 86400000)], etat: 'en_attente', archive: false, annule: false, tour: 1, envoiDemandeLe: iso(T0 - 30000), ...extra } });
    for (const [pid, nom, tel] of parts) base.docs.set(`rdv_participants/${id}-${pid}`, { v: 1, d: { rendezVousId: id, nom, telephone: tel, role: '', etatReponse: 'attente', creneauxOk: [], reponse: '' } });
  };
  const messages = () => [...base.docs].filter(([c]) => c.startsWith('rdv_messages/')).map(([c, x]) => ({ id: c.split('/')[1], ...x.d }));
  return { base, sms, appels, temps, semer, messages };
}

describe('connexion (secret)', () => {
  test('le contenu du secret est contrôlé ; tout ce qui est douteux donne « pas branché » sans dire pourquoi', () => {
    const bon = lireConnexion(SECRET);
    assert.deepEqual(bon, { identifiant: 'compte-test', cle: 'cle-de-test-pas-un-vrai-secret', jeton: JETON });
    assert.equal(lireConnexion(JSON.stringify({ identifiant: 'a', cle: 'b', jeton: JETON, expediteur: 'Martin' })).expediteur, 'Martin');
    for (const mauvais of ['', 'pas du json', 'null', '[]',
      JSON.stringify({ identifiant: 'a', cle: 'b', jeton: 'trop-court' }),
      JSON.stringify({ identifiant: 'a', cle: 'b' }),
      JSON.stringify({ identifiant: '', cle: 'b', jeton: JETON }),
      JSON.stringify({ identifiant: 'a', cle: 'b\nc', jeton: JETON }),
      JSON.stringify({ identifiant: 'a', cle: 'b', jeton: `${JETON}/../x` }),
      JSON.stringify({ identifiant: 'a', cle: 'b', jeton: JETON, expediteur: 'trop long expediteur !' })]) assert.equal(lireConnexion(mauvais), null, mauvais);
  });
  test('nom du secret : sans suffixe chez Jérôme, « _<client> » chez un client ; un nom d’espace douteux est refusé', () => {
    assert.equal(nomDuSecret('interne'), SECRET_CLICKSEND);
    assert.equal(nomDuSecret('demo'), `${SECRET_CLICKSEND}_demo`);
    assert.equal(nomDuSecret('interne', null), `${SECRET_CLICKSEND}_interne`, 'sur la plateforme, un client nommé « interne » garde son suffixe');
    for (const mauvais of ['', 'A', '../x', 'a b', undefined, 'x'.repeat(41)]) assert.throws(() => nomDuSecret(mauvais), (e) => e instanceof ErreurSortieSms && e.genre === 'non_branche');
  });
  test('comparaison du jeton en temps constant : même longueur ou non, jamais d’erreur', () => {
    assert.equal(memeJeton(JETON, JETON), true);
    assert.equal(memeJeton(JETON, `${JETON}x`), false);
    assert.equal(memeJeton('', JETON), false);
  });
});

describe('tirer : envoi des SMS dus', () => {
  test('chaque SMS dû part vers ClickSend (adresse fixe, authentification, numéro et texte exacts) puis est confirmé « envoyé » avec l’identifiant de ClickSend', async () => {
    const m = monde(); m.semer();
    const bilan = await m.sms.tirer('interne');
    assert.deepEqual([bilan.branche, bilan.envoyes, bilan.echecs, bilan.incertains, bilan.restants], [true, 2, 0, 0, 0]);
    assert.equal(m.appels.length, 2);
    for (const a of m.appels) {
      assert.equal(a.url, URL_ENVOI);
      assert.equal(a.url, 'https://rest.clicksend.com/v3/sms/send');
      assert.equal(a.options.method, 'POST');
      assert.equal(a.options.redirect, 'error');
      assert.equal(a.options.headers.Authorization, `Basic ${Buffer.from('compte-test:cle-de-test-pas-un-vrai-secret').toString('base64')}`);
      assert.equal(a.corps.messages.length, 1);
      assert.match(a.corps.messages[0].body, /^Bonjour, c'est Mme Martin\./);
      assert.match(a.corps.messages[0].body, /Chevalier IA - Répondez STOP pour vous désabonner\.$/);
      assert.equal('from' in a.corps.messages[0], false, 'sans expéditeur réglé, ClickSend choisit le sien');
    }
    assert.deepEqual(m.appels.map((a) => a.corps.messages[0].to).sort(), ['+33600000001', '+33600000002']);
    const msgs = m.messages();
    assert.equal(msgs.length, 2);
    assert.ok(msgs.every((x) => x.etatEnvoi === 'envoye' && /^id-\d$/.test(x.idFournisseur) && x.envoyeLe), 'identifiant de ClickSend gardé, en minuscules');
    assert.ok(!JSON.stringify(bilan).includes('cle-de-test'), 'le bilan ne contient jamais la clé');
    assert.deepEqual(m.sms.nomsLus.length > 0 && [...new Set(m.sms.nomsLus)], ['CLICKSEND_RDV']);
  });

  test('un second tir tout de suite ne renvoie rien (SMS déjà envoyés ou réservés) : jamais de doublon', async () => {
    const m = monde(); m.semer();
    await m.sms.tirer('interne');
    const bilan = await m.sms.tirer('interne');
    assert.equal(bilan.envoyes, 0);
    assert.equal(m.appels.length, 2);
  });

  test('un expéditeur réglé dans la connexion est transmis à ClickSend', async () => {
    const m = monde({ secret: JSON.stringify({ identifiant: 'a', cle: 'b', jeton: JETON, expediteur: 'Martin' }) }); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    await m.sms.tirer('interne');
    assert.equal(m.appels[0].corps.messages[0].from, 'Martin');
  });

  test('pas branché (secret absent) : rien n’est lu, rien n’est envoyé, « branché » est faux', async () => {
    const m = monde({ secret: null }); m.semer();
    assert.deepEqual(await m.sms.tirer('interne'), { branche: false, envoyes: 0, echecs: 0, incertains: 0, restants: 0 });
    assert.equal(m.appels.length, 0);
    assert.equal(m.messages().length, 0, 'aucun SMS même « réservé » : rien n’est écrit');
    assert.equal(await m.sms.brancheRdv('interne'), false);
  });

  test('module inactif chez le client : même résultat que « pas branché »', async () => {
    const m = monde({ moduleActif: false }); m.semer();
    assert.equal(await m.sms.brancheRdv('demo'), false);
    assert.equal((await m.sms.tirer('demo')).branche, false);
    assert.equal(m.appels.length, 0);
  });

  test('clé refusée (401) : le tir s’arrête au premier SMS, rien n’est confirmé, rien n’est compté comme échec', async () => {
    const m = monde({ reponses: () => ({ ok: false, status: 401, json: async () => ({}) }) }); m.semer();
    const bilan = await m.sms.tirer('interne');
    assert.equal(bilan.arret, 'cle_refusee');
    assert.deepEqual([bilan.envoyes, bilan.echecs, bilan.restants], [0, 0, 2]);
    assert.equal(m.appels.length, 1, 'on ne martèle pas ClickSend avec une clé refusée');
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'reserve' && !x.essais), 'les SMS restent réservés (repris après 15 minutes), aucun essai brûlé');
  });

  test('crédit épuisé : même arrêt, sans confirmer ni abandonner', async () => {
    const m = monde({ reponses: () => REPONSE_STATUT('INSUFFICIENT_CREDIT') }); m.semer();
    const bilan = await m.sms.tirer('interne');
    assert.equal(bilan.arret, 'credit_epuise');
    assert.equal(m.appels.length, 1);
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'reserve'));
  });

  test('un numéro refusé par ClickSend : échec de CE SMS seulement, noté, les autres partent ; au troisième échec le SMS est abandonné', async () => {
    const m = monde({ reponses: (i) => (i === 1 ? REPONSE_STATUT('INVALID_RECIPIENT') : REPONSE_OK('BBB-2')) }); m.semer();
    const bilan = await m.sms.tirer('interne');
    assert.deepEqual([bilan.envoyes, bilan.echecs], [1, 1]);
    const msgs = m.messages();
    const echoue = msgs.find((x) => x.etatEnvoi === 'echec');
    assert.equal(echoue.essais, 1);
    assert.match(echoue.erreur, /INVALID_RECIPIENT/);
    assert.equal(msgs.filter((x) => x.etatEnvoi === 'envoye').length, 1);
  });

  test('réseau coupé, 5xx ou réponse illisible : « incertain », rien n’est confirmé, le SMS reste réservé (jamais déclaré envoyé ni échoué)', async () => {
    const cas = [() => { throw new Error('reseau'); }, () => ({ ok: false, status: 503, json: async () => ({}) }), () => ({ ok: true, status: 200, json: async () => { throw new Error('pas du json'); } })];
    for (const faux of cas) {
      const m = monde({ reponses: faux }); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
      const bilan = await m.sms.tirer('interne');
      assert.deepEqual([bilan.envoyes, bilan.echecs, bilan.incertains], [0, 0, 1]);
      assert.equal(m.messages()[0].etatEnvoi, 'reserve');
      assert.equal((await m.sms.tirer('interne')).envoyes, 0, 'pas de renvoi avant la fin de la réservation');
      assert.equal(m.appels.length, 1);
    }
  });

  test('« tire maintenant » (tirerRdv) passe par le même chemin ; une panne inattendue devient une erreur neutre sans détail', async () => {
    const m = monde(); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    await m.sms.tirerRdv('interne');
    assert.equal(m.messages()[0].etatEnvoi, 'envoye');
    const casse = creerSmsDirect({ lireSecret: async () => SECRET, donneesDe: () => { throw new Error('base en panne : cle-de-test-pas-un-vrai-secret'); }, fetchImpl: async () => REPONSE_OK() });
    await assert.rejects(() => casse.tirerRdv('interne'), (e) => e instanceof ErreurSortieSms && e.genre === 'indisponible' && !/cle-de-test|base en panne/.test(e.message));
  });

  test('un rendez-vous de test n’envoie qu’au numéro de test, et rien sans numéro de test', async () => {
    const m = monde(); m.semer('r1', { test: true });
    assert.equal((await m.sms.tirer('interne')).envoyes, 0);
    assert.equal(m.appels.length, 0);
    m.base.docs.set('rdv_parametres/reglages', { v: 9, d: { ...m.base.docs.get('rdv_parametres/reglages').d, numeroTest: '+33600000099' } });
    await m.sms.tirer('interne');
    assert.deepEqual([...new Set(m.appels.map((a) => a.corps.messages[0].to))], ['+33600000099']);
  });
});

describe('recevoir : réponses par SMS', () => {
  const corps = (extra = {}) => ({ from: '+33600000001', message: '1', message_id: 'IN-0001', timestamp: String(Math.floor(T0 / 1000)), ...extra });

  test('mauvais jeton, jeton absent ou espace sans connexion : 404 identique, rien d’écrit', async () => {
    const m = monde(); m.semer();
    for (const [espace, jeton] of [['interne', 'faux'], ['interne', undefined], ['interne', `${JETON}x`], ['demo', JETON]]) {
      const sansConnexion = espace === 'demo' ? monde({ secret: null }) : m;
      assert.deepEqual(await sansConnexion.sms.recevoir({ espace, jeton, corps: corps() }), { statut: 404 });
    }
    assert.equal(m.messages().length, 0);
  });

  test('une réponse « 1 » du bon numéro : message enregistré, participant mis à jour ; la même réponse rejouée ne change rien (idempotente)', async () => {
    const m = monde(); m.semer();
    assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: corps() }), { statut: 200 });
    const p = m.base.docs.get('rdv_participants/r1-p1').d;
    assert.deepEqual(p.creneauxOk, [1]);
    const avant = m.messages().length;
    assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: corps() }), { statut: 200 });
    assert.equal(m.messages().length, avant, 'pas de second message');
  });

  test('corps accepté avec « body » à la place de « message » (formulaire ClickSend), horodatage absurde ignoré', async () => {
    const m = monde(); m.semer();
    const { message, ...sans } = corps({ message_id: 'IN-0002', timestamp: '99999999999999' });
    assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: { ...sans, body: '2' } }), { statut: 200 });
    assert.deepEqual(m.base.docs.get('rdv_participants/r1-p1').d.creneauxOk, [2]);
  });

  test('« STOP » : le numéro est désinscrit et n’est plus jamais contacté', async () => {
    const m = monde(); m.semer();
    assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: corps({ message: 'STOP', message_id: 'IN-0003' }) }), { statut: 200 });
    assert.ok(m.base.docs.get('rdv_parametres/desinscrits').d.numeros.includes('+33600000001'));
    await m.sms.tirer('interne');
    assert.ok(!m.appels.some((a) => a.corps.messages[0].to === '+33600000001' && !/STOP|a répondu/.test(a.corps.messages[0].body)), 'aucun SMS ordinaire vers le numéro désinscrit');
  });

  test('corps inutilisable (numéro, texte ou identifiant manquant, texte vide) : 400, rien d’écrit', async () => {
    const m = monde(); m.semer();
    for (const mauvais of [corps({ from: '' }), corps({ message: '   ' }), corps({ message_id: '' }), {}, null]) {
      assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: mauvais }), { statut: 400 });
    }
    assert.equal(m.messages().length, 0);
  });

  test('une panne inattendue de la base LÈVE (la fonction répond 500, ClickSend pourra réessayer) ; le message d’erreur n’est pas renvoyé', async () => {
    const casse = creerSmsDirect({ lireSecret: async () => SECRET, donneesDe: () => { throw new Error('panne'); }, fetchImpl: async () => REPONSE_OK() });
    await assert.rejects(() => casse.recevoir({ espace: 'interne', jeton: JETON, corps: corps() }));
  });
});

describe('adresse des réponses (traitement HTTP)', () => {
  const requete = (methode, chemin, corps) => ({ method: methode, path: chemin, body: corps });
  const reponse = () => { const r = { statut: null, status(c) { r.statut = c; return r; }, end() { return r; } }; return r; };
  const corpsSms = { from: '+33600000001', message: '1', message_id: 'IN-9', timestamp: String(Math.floor(T0 / 1000)) };

  test('chez Jérôme : « /<jeton> » en POST est traité ; GET, chemin à deux morceaux, chemin vide ou faux jeton : 404 identique', async () => {
    const m = monde(); m.semer();
    const g = creerGestionnaireReponses({ sms: m.sms, espaceFixe: 'interne' });
    const essais = [['GET', `/${JETON}`], ['POST', `/interne/${JETON}`], ['POST', '/'], ['POST', '/faux'], ['POST', undefined]];
    for (const [methode, chemin] of essais) { const r = reponse(); await g(requete(methode, chemin, corpsSms), r); assert.equal(r.statut, 404, `${methode} ${chemin}`); }
    assert.equal(m.messages().length, 0);
    const r = reponse(); await g(requete('POST', `/${JETON}`, corpsSms), r);
    assert.equal(r.statut, 200);
    assert.equal(m.messages().length, 1);
  });

  test('sur la plateforme : « /<client>/<jeton> » ; un seul morceau est refusé', async () => {
    const m = monde(); m.semer();
    const g = creerGestionnaireReponses({ sms: m.sms });
    const un = reponse(); await g(requete('POST', `/${JETON}`, corpsSms), un);
    assert.equal(un.statut, 404);
    const deux = reponse(); await g(requete('POST', `/demo/${JETON}`, corpsSms), deux);
    assert.equal(deux.statut, 200);
  });

  test('panne inattendue : 500 et seul le nom de l’erreur est journalisé (ni numéro, ni texte, ni jeton)', async () => {
    const casse = creerSmsDirect({ lireSecret: async () => SECRET, donneesDe: () => { throw new Error(`panne ${corpsSms.from} ${JETON}`); }, fetchImpl: async () => REPONSE_OK() });
    const lignes = [];
    const r = reponse();
    await creerGestionnaireReponses({ sms: casse, espaceFixe: 'interne', journal: (l) => lignes.push(l) })(requete('POST', `/${JETON}`, corpsSms), r);
    assert.equal(r.statut, 500);
    assert.ok(!JSON.stringify(lignes).includes(JETON) && !JSON.stringify(lignes).includes('+3360000'));
  });
});

describe('ClickSend : un seul fichier du dépôt lui parle', () => {
  test('l’adresse de ClickSend n’apparaît que dans functions/src/coeur/sms-direct.js (code exécutable, hors tests, docs et copies générées)', () => {
    const racine = new URL('..', import.meta.url).pathname;
    const trouves = [];
    const parcourir = (dossier) => {
      for (const nom of readdirSync(dossier)) {
        if (['node_modules', '.git', 'tests', 'docs', 'wiki', 'partage', 'serveur'].includes(nom)) continue;
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(js|mjs|html)$/.test(nom) && /clicksend\.com/i.test(readFileSync(chemin, 'utf8'))) trouves.push(chemin.slice(racine.length));
      }
    };
    for (const d of ['functions', 'functions-plateforme', 'js', 'scripts']) parcourir(join(racine, d));
    assert.deepEqual(trouves, ['functions/src/coeur/sms-direct.js']);
  });
});
