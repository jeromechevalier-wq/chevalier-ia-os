// Envoi direct des SMS du module Rendez-vous par ClickSend (functions/src/coeur/sms-direct.js). Tout en mémoire : faux ClickSend, base en mémoire, aucun réseau,
// aucun vrai SMS. Les clés et numéros ci-dessous sont inventés.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import { tirerPourTous } from '../functions-plateforme/src/rdv.js';
import { creerSmsDirect, creerGestionnaireReponses, lireConnexion, nomDuSecret, memeJeton, ErreurSortieSms, URL_ENVOI, SECRET_CLICKSEND } from '../functions/src/coeur/sms-direct.js';
import { PRECONDITION_ECHOUEE } from '../scripts/porte/adaptateur.js';
import { lienEcranRdv } from '../functions/src/coeur/liens.js';
import { BASE_LIEN_JEROME as BASE_SERVEUR_JEROME } from '../functions/src/mcp/gestionnaire.js';
import { BASE_LIEN_PLATEFORME as BASE_SERVEUR_PLATEFORME } from '../functions-plateforme/src/devis-pdf.js';
import * as REGLES_RDV from '../js/modules/rdv/logique.js';

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
    pauseConfirmationMs: 0,
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
    assert.deepEqual(m.sms.nomsLus, [], 'le secret n’est même pas lu pour un espace dont le module est inactif (aucun appel à Secret Manager pour un nom inventé)');
  });

  test('clé refusée (401) : le tir s’arrête au premier SMS, rien n’est confirmé, rien n’est compté comme échec', async () => {
    const m = monde({ reponses: () => ({ ok: false, status: 401, json: async () => ({}) }) }); m.semer();
    const bilan = await m.sms.tirer('interne');
    assert.equal(bilan.arret, 'cle_refusee');
    assert.deepEqual([bilan.envoyes, bilan.echecs, bilan.restants], [0, 0, 2]);
    assert.equal(m.appels.length, 1, 'on ne martèle pas ClickSend avec une clé refusée');
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'a_envoyer' && !x.essais), 'les SMS sont libérés tout de suite, aucun essai brûlé');
  });

  test('crédit épuisé : même arrêt, sans confirmer ni abandonner', async () => {
    const m = monde({ reponses: () => REPONSE_STATUT('INSUFFICIENT_CREDIT') }); m.semer();
    const bilan = await m.sms.tirer('interne');
    assert.equal(bilan.arret, 'credit_epuise');
    assert.equal(m.appels.length, 1);
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'a_envoyer' && !x.essais));
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

  test('réseau coupé ou réponse 200 illisible : « incertain », rien n’est confirmé, le SMS reste réservé (jamais déclaré envoyé ni échoué)', async () => {
    const cas = [() => { throw new Error('reseau'); }, () => ({ ok: true, status: 200, json: async () => { throw new Error('pas du json'); } })];
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

  test('corps inutilisable (numéro manquant, texte vide) : 400, rien d’écrit', async () => {
    const m = monde(); m.semer();
    for (const mauvais of [corps({ from: '' }), corps({ message: '   ' }), {}, null]) {
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

describe('pannes passagères : rien n’est abandonné, rien n’est perdu', () => {
  test('crédit épuisé pendant 45 minutes puis rechargé : quatre tirs espacés de 15 minutes, aucun essai brûlé, les SMS partent dès que le crédit revient', async () => {
    let credit = false;
    const m = monde({ reponses: () => (credit ? REPONSE_OK('OK') : REPONSE_STATUT('INSUFFICIENT_CREDIT')) }); m.semer();
    for (let k = 0; k < 4; k += 1) { const b = await m.sms.tirer('interne'); assert.equal(b.arret, 'credit_epuise'); m.temps.t += 15 * 60_000; }
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'a_envoyer' && !x.essais), 'après 4 tirs en panne : toujours « à envoyer », zéro essai');
    credit = true;
    const b = await m.sms.tirer('interne');
    assert.equal(b.arret, undefined);
    assert.equal(b.envoyes, m.messages().length, 'présentation et créneaux de chaque participant partent tous');
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'envoye' && !x.essais));
  });

  test('ClickSend limite (429) quatre fois de suite : aucun SMS abandonné, aucun essai brûlé', async () => {
    const m = monde({ reponses: () => ({ ok: false, status: 429, json: async () => ({}) }) }); m.semer();
    for (let k = 0; k < 4; k += 1) { await m.sms.tirer('interne'); m.temps.t += 15 * 60_000; }
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'a_envoyer' && !x.essais));
  });

  test('un problème de COMPTE (expéditeur non enregistré, compte non activé, identifiants manquants, limitation) arrête le tir sans rien brûler, même après trois clics de suite', async () => {
    for (const statut of ['INVALID_SENDER_ID', 'ACCOUNT_NOT_ACTIVATED', 'MISSING_CREDENTIALS', 'THROTTLED', 'USAGE_LIMIT_EXCEEDED']) {
      const m = monde({ reponses: () => REPONSE_STATUT(statut) }); m.semer();
      for (let k = 0; k < 3; k += 1) { const b = await m.sms.tirer('interne'); assert.equal(b.arret, `compte_${statut.toLowerCase()}`); m.temps.t += 2000; }
      assert.ok(m.messages().every((x) => x.etatEnvoi === 'a_envoyer' && !x.essais), statut);
      assert.equal(m.appels.length, 3, `${statut} : un appel par tir, on ne martèle pas`);
    }
  });

  test('un refus propre à UN SMS (pays fermé, statut inconnu, 4xx) : échec compté de CE SMS seulement, repris au plus tôt 10 minutes plus tard, 3 échecs = abandon ; les autres partent (jamais de blocage de tout l’espace)', async () => {
    const m = monde({ reponses: (n, a) => (a.corps.messages[0].to === '+33600000001' ? REPONSE_STATUT('COUNTRY_NOT_ENABLED') : REPONSE_OK(`OK-${n}`)) });
    m.semer('r1', {}, [['p1', 'Refuse', '+33600000001'], ['p2', 'B', '+33600000002'], ['p3', 'C', '+33600000003']]);
    const b = await m.sms.tirer('interne');
    assert.equal(b.arret, undefined, 'aucun arrêt : chaque SMS est traité seul');
    assert.deepEqual([b.envoyes, b.echecs], [2, 1]);
    const versRefuse = () => m.appels.filter((a) => a.corps.messages[0].to === '+33600000001').length;
    assert.equal(versRefuse(), 1);
    for (let k = 0; k < 3; k += 1) { m.temps.t += 2000; await m.sms.tirer('interne'); }
    assert.equal(versRefuse(), 1, 'trois clics rapides : pas de nouvel essai avant 10 minutes');
    for (let k = 0; k < 8; k += 1) { m.temps.t += 15 * 60_000; await m.sms.tirer('interne'); }
    const msgs = m.messages();
    const refuses = msgs.filter((x) => x.numero === '+33600000001' && x.typeMessage !== 'alerte');
    assert.ok(refuses.length >= 2 && refuses.every((x) => x.etatEnvoi === 'abandonne' && x.essais === 3), 'présentation et créneaux du numéro refusé : abandonnés après 3 échecs (alerte à la professionnelle)');
    assert.ok(versRefuse() <= 6, `3 essais au plus par SMS (2 SMS) : ${versRefuse()}`);
    const autres = msgs.filter((x) => x.numero !== '+33600000001' && x.typeMessage !== 'alerte');
    assert.ok(autres.length >= 4 && autres.every((x) => x.etatEnvoi === 'envoye'), 'les autres participants reçoivent tout (présentation et créneaux), à chaque tir');
  });

  test('statut inconnu pour TOUS les SMS (erreur de réglage de ClickSend) : trois clics rapides n’abandonnent rien ; ce n’est abandonné et signalé qu’après des échecs espacés de plus de 10 minutes', async () => {
    const m = monde({ reponses: () => REPONSE_STATUT('UN_STATUT_INCONNU') }); m.semer();
    for (let k = 0; k < 3; k += 1) { await m.sms.tirer('interne'); m.temps.t += 2000; }
    assert.equal(m.appels.length, 2, 'un essai par SMS, puis le délai de 10 minutes s’applique');
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'echec' && x.essais === 1));
    for (let k = 0; k < 4; k += 1) { m.temps.t += 11 * 60_000; await m.sms.tirer('interne'); }
    assert.ok(m.messages().filter((x) => x.typeMessage !== 'alerte').every((x) => x.etatEnvoi === 'abandonne' && x.essais === 3));
  });

  test('panne de ClickSend annoncée en 200 (INTERNAL_ERROR) ou délai du serveur (408) : jamais compté comme refus du SMS ; le SMS peut être parti : douteux, borné à 3 tentatives', async () => {
    for (const reponse of [() => REPONSE_STATUT('INTERNAL_ERROR'), () => ({ ok: false, status: 408, json: async () => ({}) })]) {
      const m = monde({ reponses: reponse }); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
      const b = await m.sms.tirer('interne');
      assert.equal(b.echecs, 0);
      assert.equal(m.messages()[0].etatEnvoi, 'reserve', 'ni échec compté ni libéré : douteux');
    }
  });

  test('crédit signalé par le code de réponse (« insufficient ») avec un statut de message inattendu : raison « credit_epuise »', async () => {
    const m = monde({ reponses: () => ({ ok: true, status: 200, json: async () => ({ response_code: 'INSUFFICIENT_CREDIT', data: { messages: [{ status: 'INVALID_RECIPIENT' }] } }) }) }); m.semer();
    assert.equal((await m.sms.tirer('interne')).arret, 'credit_epuise');
  });

  test('« QUEUED » ou « SCHEDULED » avec succès HTTP : accepté (pas un échec, aucun renvoi)', async () => {
    const m = monde({ reponses: () => REPONSE_STATUT('QUEUED') }); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    const b = await m.sms.tirer('interne');
    assert.deepEqual([b.envoyes, b.echecs], [1, 0]);
    assert.equal(m.messages()[0].etatEnvoi, 'envoye');
  });

  test('seuls les refus du destinataire ou du SMS comptent : INVALID_RECIPIENT trois fois, espacés de plus de 10 minutes = abandon de ce SMS', async () => {
    const m = monde({ reponses: () => REPONSE_STATUT('INVALID_RECIPIENT') }); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    for (let k = 0; k < 3; k += 1) { await m.sms.tirer('interne'); m.temps.t += 11 * 60_000; }
    const x = m.messages().find((y) => y.numero === '+33600000001' && y.typeMessage === 'confiance');
    assert.equal(x.etatEnvoi, 'abandonne');
    assert.equal(x.essais, 3);
  });

  test('ClickSend indisponible : 503 (rien n’est parti) libère tout sans essai ; 504 (la passerelle a peut-être accepté) laisse le SMS en cours réservé et douteux : au plus 3 tentatives par SMS, puis abandon et alerte', async () => {
    const m503 = monde({ reponses: () => ({ ok: false, status: 503, json: async () => ({}) }) }); m503.semer();
    for (let k = 0; k < 4; k += 1) { await m503.sms.tirer('interne'); m503.temps.t += 15 * 60_000; }
    assert.ok(m503.messages().every((x) => x.etatEnvoi === 'a_envoyer' && !x.essais), '503 : rien brûlé');
    const m = monde({ reponses: () => ({ ok: false, status: 504, json: async () => ({}) }) }); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    const premier = await m.sms.tirer('interne');
    assert.deepEqual([premier.arret, premier.incertains], ['clicksend_indisponible', 1]);
    assert.equal(m.messages().filter((x) => x.etatEnvoi === 'reserve').length, 1, 'le SMS en cours reste réservé (pas libéré)');
    for (let k = 0; k < 14; k += 1) { m.temps.t += 15 * 60_000; await m.sms.tirer('interne'); }
    assert.ok(m.appels.length <= 3 * m.messages().length, `chaque SMS est tenté 3 fois au plus : ${m.appels.length} appels pour ${m.messages().length} SMS`);
    assert.ok(m.messages().every((x) => x.etatEnvoi === 'abandonne'), 'à la fin, plus rien n’est tenté : tout est abandonné et signalé');
  });

  test('SMS accepté par ClickSend mais confirmation en panne : confirmée au deuxième essai, jamais renvoyé ; si tout échoue, il reste réservé (aucun double SMS avant 15 minutes)', async () => {
    const m = monde(); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    let pannes = 1;
    const majDoc = m.base.majDoc;
    m.base.majDoc = async (c, p, o) => { if (p.etatEnvoi === 'envoye' && pannes > 0) { pannes -= 1; throw new Error('panne Firestore'); } return majDoc(c, p, o); };
    const b = await m.sms.tirer('interne');
    assert.deepEqual([b.envoyes, b.incertains], [1, 0], 'la confirmation en panne est rejouée, le SMS n’est pas renvoyé');
    assert.equal(m.messages()[0].etatEnvoi, 'envoye');
    assert.equal(m.appels.length, 1);

    const m2 = monde(); m2.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    const majDoc2 = m2.base.majDoc;
    m2.base.majDoc = async (c, p, o) => { if (p.etatEnvoi === 'envoye') throw new Error('panne Firestore'); return majDoc2(c, p, o); };
    const b2 = await m2.sms.tirer('interne');
    assert.deepEqual([b2.envoyes, b2.incertains], [0, 1]);
    assert.equal(m2.messages()[0].etatEnvoi, 'reserve');
    m2.temps.t += 20_000; // avant l’échéance des « créneaux » (une minute après la présentation) : seul le SMS réservé pourrait être renvoyé
    await m2.sms.tirer('interne');
    assert.equal(m2.appels.length, 1, 'pas de renvoi tant que la réservation de 15 minutes court');
  });

  test('budget de temps : un tir n’ouvre jamais un envoi qui pourrait dépasser le budget ; les SMS restants sont libérés sans essai', async () => {
    const parts = [1, 2, 3, 4, 5].map((n) => [`p${n}`, `Personne ${n}`, `+3360000000${n}`]);
    const m = monde(); m.semer('r1', {}, parts);
    // chaque envoi dure 14 s sur l'horloge de l'essai ; budget 30 s, délai maximal par SMS 15 s : 2 envois (0 + 15 <= 30, 14 + 15 <= 30), le 3e (28 + 15 > 30) n'est pas ouvert
    const sms = creerSmsDirect({
      lireSecret: async () => SECRET, donneesDe: () => ({ base: '', donnees: m.base }), maintenant: () => m.temps.t,
      fetchImpl: async () => { m.temps.t += 14_000; return REPONSE_OK('B'); },
    });
    const b = await sms.tirer('interne', { budgetMs: 30_000 });
    assert.equal(b.arret, 'budget_depasse');
    assert.equal(b.envoyes, 2);
    assert.equal(b.restants, 3);
    const etats = m.messages().map((x) => x.etatEnvoi).sort();
    assert.deepEqual(etats, ['a_envoyer', 'a_envoyer', 'a_envoyer', 'envoye', 'envoye']);
    assert.ok(m.messages().every((x) => !x.essais));
  });

  test('l’heure de chaque envoi est celle de l’envoi, pas celle du début du tir', async () => {
    const m = monde(); m.semer('r1', {}, [['p1', 'A', '+33600000001'], ['p2', 'B', '+33600000002']]);
    const sms = creerSmsDirect({ lireSecret: async () => SECRET, donneesDe: () => ({ base: '', donnees: m.base }), maintenant: () => m.temps.t, fetchImpl: async () => { m.temps.t += 10_000; return REPONSE_OK('H'); } });
    await sms.tirer('interne');
    const heures = m.messages().map((x) => new Date(x.envoyeLe).getTime()).sort();
    assert.ok(heures[1] > heures[0]);
  });

  test('tirerRdv rend le bilan (arrêt compris) : l’écran ne dit jamais « envoyé » quand rien n’est parti', async () => {
    const m = monde({ reponses: () => ({ ok: false, status: 401, json: async () => ({}) }) }); m.semer();
    const bilan = await m.sms.tirerRdv('interne');
    assert.equal(bilan.arret, 'cle_refusee');
  });
});

describe('réponses : identifiant et texte jamais perdus', () => {
  const corpsSms = (extra = {}) => ({ from: '+33600000001', message: '1', message_id: 'IN-7', timestamp: String(Math.floor(T0 / 1000)), ...extra });
  test('sans identifiant ClickSend (ou identifiant commençant par un tiret) : une empreinte le remplace, la réponse est enregistrée une seule fois', async () => {
    for (const message_id of ['', '---', undefined, '_-_']) {
      const m = monde(); m.semer();
      assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: corpsSms({ message_id }) }), { statut: 200 }, String(message_id));
      const avant = m.messages().length;
      assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: corpsSms({ message_id }) }), { statut: 200 });
      assert.equal(m.messages().length, avant, 'rejeu : pas de second message');
      assert.deepEqual(m.base.docs.get('rdv_participants/r1-p1').d.creneauxOk, [1]);
    }
  });
  test('un caractère de contrôle dans le texte est retiré, la réponse est comprise quand même', async () => {
    const m = monde(); m.semer();
    assert.deepEqual(await m.sms.recevoir({ espace: 'interne', jeton: JETON, corps: corpsSms({ message: '1\u0007\u0000' }) }), { statut: 200 });
    assert.deepEqual(m.base.docs.get('rdv_participants/r1-p1').d.creneauxOk, [1]);
  });
});

describe('filet planifié des clients (tirerPourTous)', () => {
  const dbDe = (ids) => ({ collection: () => ({ get: async () => ({ docs: ids.map((id) => ({ id })) }) }) });
  test('chaque client actif et branché est tiré ; un client en panne, sans module ou non branché n’arrête pas les autres ; le bilan ne nomme aucun client', async () => {
    const appeles = [];
    const sortie = { tirer: async (client, { budgetMs }) => {
      appeles.push([client, budgetMs]);
      if (client === 'panne') throw new Error('base en panne');
      if (client === 'nonbranche') return { branche: false, envoyes: 0, echecs: 0, incertains: 0, restants: 0 };
      if (client === 'credit') return { branche: true, envoyes: 0, echecs: 0, incertains: 0, restants: 4, arret: 'credit_epuise' };
      return { branche: true, envoyes: 2, echecs: 1, incertains: 0, restants: 0 };
    } };
    const modulesActifs = async (client) => (client === 'sansmodule' ? ['devis'] : ['rdv', 'devis']);
    const bilan = await tirerPourTous({ db: dbDe(['a', 'sansmodule', 'panne', 'nonbranche', 'credit', 'b']), sortie, modulesActifs, maintenant: () => 0 });
    assert.deepEqual(appeles.map(([c]) => c), ['a', 'panne', 'nonbranche', 'credit', 'b']);
    assert.deepEqual([bilan.clients, bilan.branches, bilan.envoyes, bilan.echecs, bilan.restants, bilan.interrompu], [6, 3, 4, 2, 4, false]);
    assert.deepEqual(bilan.arrets, [{ code: 'credit_epuise' }]);
    assert.ok(!['nonbranche', 'sansmodule', 'panne'].some((nom) => JSON.stringify(bilan).includes(nom)), 'aucun nom de client dans le bilan');
    assert.ok(appeles.every(([, budget]) => budget > 0 && budget <= 90_000));
  });
  test('rotation : le point de départ change à chaque quart d’heure (un client lent ne prive pas toujours les mêmes clients de leur tour)', async () => {
    const ordre = async (t) => {
      const appeles = [];
      await tirerPourTous({ db: dbDe(['a', 'b', 'c']), sortie: { tirer: async (c) => { appeles.push(c); return { branche: false }; } }, modulesActifs: async () => ['rdv'], maintenant: () => t });
      return appeles.join('');
    };
    assert.equal(await ordre(0), 'abc');
    assert.equal(await ordre(900_000), 'bca');
    assert.equal(await ordre(1_800_000), 'cab');
  });
  test('le temps total est borné : au-delà de la durée de la fonction, les clients restants sont laissés au tour suivant', async () => {
    let t = 0;
    const appeles = [];
    const sortie = { tirer: async (client) => { appeles.push(client); t += 100_000; return { branche: true, envoyes: 1, echecs: 0, incertains: 0, restants: 0 }; } };
    const bilan = await tirerPourTous({ db: dbDe(['a', 'b', 'c', 'd']), sortie, modulesActifs: async () => ['rdv'], maintenant: () => t, dureeMaxMs: 270_000 });
    assert.equal(bilan.interrompu, true);
    assert.ok(appeles.length >= 1 && appeles.length < 4);
  });
});

describe('B2 lien du rendez-vous dans l’alerte « un créneau convient à tous »', () => {
  const JEROME = 'https://chevalier-ia-os.web.app';
  const PLATEFORME = 'https://chevalier-ia-app.web.app';

  test('B2 les adresses d’exemple de l’aperçu (logique.js) sont celles du serveur : si une adresse change, l’aperçu ne compte plus faux sans que ce test le dise', () => {
    assert.equal(REGLES_RDV.BASE_LIEN_JEROME, BASE_SERVEUR_JEROME);
    assert.equal(REGLES_RDV.BASE_LIEN_PLATEFORME, BASE_SERVEUR_PLATEFORME);
    assert.equal(REGLES_RDV.lienExempleRdv('demo').replace(/aB3dE5gH7jK9mN1pQ3sT$/, 'x'), lienEcranRdv({ baseLien: BASE_SERVEUR_PLATEFORME, client: 'demo' }, 'x'));
    assert.equal(REGLES_RDV.lienExempleRdv('').replace(/aB3dE5gH7jK9mN1pQ3sT$/, 'x'), lienEcranRdv({ baseLien: BASE_SERVEUR_JEROME, client: '' }, 'x'));
  });
  test('B2 lienEcranRdv : Jérôme sans espace, un client sous espace/<client>/ ; base non https, espace ou identifiant mal formés : pas de lien', () => {
    assert.equal(lienEcranRdv({ baseLien: JEROME, client: '' }, 'abc123'), `${JEROME}/#/rdv/liste/abc123`);
    assert.equal(lienEcranRdv({ baseLien: `${PLATEFORME}/`, client: 'demo' }, 'abc123'), `${PLATEFORME}/#/espace/demo/rdv/liste/abc123`);
    for (const [base, client, id] of [['', '', 'a'], ['http://x.test', '', 'a'], [JEROME, 'Mauvais/../x', 'a'], [JEROME, '', ''], [JEROME, '', 'a/b'], [JEROME, '', 'a?b=1'], [JEROME, '', undefined], [`${JEROME}/chemin`, '', 'a']]) {
      assert.equal(lienEcranRdv({ baseLien: base, client }, id), undefined, `${base} ${client} ${id}`);
    }
  });

  test('B2 chez Jérôme : le SMS d’alerte porte l’adresse de l’appli, sur sa propre ligne, et rien de secret', async () => {
    const m = monde();
    m.semer('rdvAbc123');
    for (const pid of ['p1', 'p2']) m.base.docs.set(`rdv_participants/rdvAbc123-${pid}`, { v: 2, d: { rendezVousId: 'rdvAbc123', nom: pid, telephone: pid === 'p1' ? '+33600000001' : '+33600000002', role: '', etatReponse: 'comprise', creneauxOk: [1], reponse: '1', reponseLe: iso(T0 - 3600_000) } });
    const sms = creerSmsDirect({ lireSecret: async () => SECRET, donneesDe: () => ({ base: '', donnees: m.base }), maintenant: () => m.temps.t, fetchImpl: async (url, options) => { m.appels.push({ corps: JSON.parse(options.body) }); return REPONSE_OK('X'); }, pauseConfirmationMs: 0, baseLien: JEROME });
    await sms.tirer('interne');
    const alerte = m.appels.map((a) => a.corps.messages[0]).find((x) => x.to === '+33700000001');
    assert.ok(alerte, 'une alerte est partie vers le numéro d’alerte');
    assert.ok(alerte.body.endsWith(`\n${JEROME}/#/rdv/liste/rdvAbc123`), alerte.body);
    assert.doesNotMatch(alerte.body, new RegExp(`${JETON}|${SECRET_CLICKSEND}|cle-de-test`));
    const aucunLien = m.appels.map((a) => a.corps.messages[0]).filter((x) => x.to !== '+33700000001');
    assert.ok(aucunLien.every((x) => !/https?:/.test(x.body)), 'aucun lien dans les SMS des participants');
  });

  test('B2 chez un client : adresse de la plateforme sous espace/<client>/ ; sans adresse de base (ancien branchement) : l’alerte part sans lien', async () => {
    for (const [baseLien, attendu] of [[PLATEFORME, `${PLATEFORME}/#/espace/demo/rdv/liste/rdvAbc123`], ['', null]]) {
      const m = monde();
      m.semer('rdvAbc123');
      for (const pid of ['p1', 'p2']) m.base.docs.set(`rdv_participants/rdvAbc123-${pid}`, { v: 2, d: { rendezVousId: 'rdvAbc123', nom: pid, telephone: pid === 'p1' ? '+33600000001' : '+33600000002', role: '', etatReponse: 'comprise', creneauxOk: [1], reponse: '1', reponseLe: iso(T0 - 3600_000) } });
      const sms = creerSmsDirect({ lireSecret: async () => SECRET, donneesDe: () => ({ base: 'clients/demo', donnees: m.base }), maintenant: () => m.temps.t, fetchImpl: async (url, options) => { m.appels.push({ corps: JSON.parse(options.body) }); return REPONSE_OK('X'); }, pauseConfirmationMs: 0, baseLien, espaceRacine: null });
      // la base en mémoire n'a pas de sous-dossier : on range les documents sous clients/demo
      for (const [c, x] of [...m.base.docs]) if (!c.startsWith('clients/')) { m.base.docs.set(`clients/demo/${c}`, x); m.base.docs.delete(c); }
      await sms.tirer('demo');
      const alerte = m.appels.map((a) => a.corps.messages[0]).find((x) => x.to === '+33700000001');
      assert.ok(alerte, 'une alerte est partie');
      if (attendu) assert.ok(alerte.body.endsWith(`\n${attendu}`), alerte.body);
      else assert.doesNotMatch(alerte.body, /https|\{|\n$/);
    }
  });
});
