// Porte du module Rendez-vous (scripts/porte/actions-rdv.js) : SMS dus, réservation sans doublon, confirmation rejouable, réponses reçues (idempotentes, STOP, numéro ambigu),
// SMS écrits à la main, rendez-vous de test, passage par la porte complète. Tout en mémoire : ni Firebase ni réseau, ni ClickSend, ni n8n.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { ACTIONS_RDV, docIdMessage, RESERVATION_MS, ESSAIS_MAX } from '../scripts/porte/actions-rdv.js';
import { lancerAction } from '../scripts/porte/actions-veille.js';
import { PRECONDITION_ECHOUEE } from '../scripts/porte/adaptateur.js';
import { creerPorte } from '../scripts/porte/porte.js';
import { genererCle, enregistrementDe } from '../scripts/porte/cles.js';
import * as R from '../js/modules/rdv/logique.js';

const T0 = Date.parse('2026-11-16T10:00:00Z'); // lundi 11 h à Paris : dans la plage d'envoi
const iso = (ms) => new Date(ms).toISOString();

/** Base en mémoire, même contrat que scripts/porte/adaptateur.js (création sans écrasement, précondition sur updateTime, lot atomique). */
function creerBase() {
  const docs = new Map();
  let version = 0;
  const lire = (c) => (docs.has(c) ? { ...docs.get(c).d, id: c.split('/').pop(), updateTime: docs.get(c).v } : null);
  const dansTable = (chemin) => [...docs].filter(([c]) => c.startsWith(`${chemin}/`) && !c.slice(chemin.length + 1).includes('/'));
  const base = {
    docs,
    lireCle: async () => null, majCle: async () => {},
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
  return base;
}

const REGLAGES = { nomDansLesSms: 'Mme Martin', numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: '+33700000001', actif: true }], numeroAffiche: 'n1', relances: { delaiHeures: 24, nombre: 3 }, rappel: { actif: true, heure: '19:00' }, plage: { debut: '08:00', fin: '20:30' }, modeles: {} };

function monde({ test: estTest = false, reglages = REGLAGES } = {}) {
  const base = creerBase();
  const temps = { t: T0 };
  const ctx = (extra = {}) => ({ base: '', donnees: base, auteur: 'porte:essai', maintenant: () => temps.t, services: {}, ...extra });
  const action = (nom, donnees = {}) => lancerAction(ACTIONS_RDV[nom], donnees, ctx());
  base.docs.set('rdv_parametres/reglages', { d: { ...reglages }, v: 1 });
  const semer = (id = 'r1', extra = {}, parts = [['p1', 'M. Durand', '+33600000001'], ['p2', 'Terrassier', '+33600000002']]) => {
    base.docs.set(`rdv_rendezvous/${id}`, { v: 1, d: { client: 'M. Durand', adresse: '12 rue des Lilas', commune: 'Lyon', creneaux: [iso(T0 + 4 * 86400000), iso(T0 + 5 * 86400000)], etat: 'en_attente', archive: false, annule: false, tour: 1, envoiDemandeLe: iso(T0 - 30000), ...(estTest ? { test: true } : {}), ...extra } });
    for (const [pid, nom, tel] of parts) base.docs.set(`rdv_participants/${id}-${pid}`, { v: 1, d: { rendezVousId: id, nom, telephone: tel, role: '', etatReponse: 'attente', creneauxOk: [], reponse: '' } });
  };
  return { base, temps, action, semer };
}

describe('rdv.aEnvoyer : SMS dus et réservation', () => {
  test('le premier SMS est dû pour chaque participant, avec le texte exact et le numéro cible', async () => {
    const m = monde(); m.semer();
    const r = await m.action('rdv.aEnvoyer');
    assert.equal(r.nombre, 2);
    assert.deepEqual(r.messages.map((x) => x.typeMessage), ['confiance', 'confiance']);
    assert.deepEqual(r.messages.map((x) => x.numero).sort(), ['+33600000001', '+33600000002']);
    assert.match(r.messages[0].texte, /^Bonjour, c'est Mme Martin\./);
    assert.ok(r.messages.every((x) => x.caracteres === R.compterSms(x.texte).caracteres && x.segments <= 2 && x.texte.endsWith('Chevalier IA - Répondez STOP pour vous désabonner.')));
    const doc = m.base.docs.get(`rdv_messages/${r.messages[0].messageId}`).d;
    assert.equal(doc.etatEnvoi, 'reserve');
    assert.equal(doc.echeance, `r1:t1:confiance:${doc.participantId}`);
  });
  test('réservé 15 minutes : un second appel (même un autre workflow) ne rend rien ; réservation expirée : le même SMS revient avec le même identifiant', async () => {
    const m = monde(); m.semer();
    const premier = await m.action('rdv.aEnvoyer');
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0);
    m.temps.t = T0 + RESERVATION_MS + 1000;
    const apres = await m.action('rdv.aEnvoyer');
    const ids = apres.messages.map((x) => x.messageId);
    for (const x of premier.messages) assert.ok(ids.includes(x.messageId), 'le même SMS revient avec le même identifiant');
  });
  test('deux appels EN MÊME TEMPS : chaque SMS n\'est donné qu\'à un seul', async () => {
    const m = monde(); m.semer();
    const [a, b] = await Promise.all([m.action('rdv.aEnvoyer'), m.action('rdv.aEnvoyer')]);
    const ids = [...a.messages, ...b.messages].map((x) => x.messageId);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
  });
  test('la limite par appel est respectée, le reste vient à l\'appel suivant', async () => {
    const m = monde(); m.semer();
    const un = await m.action('rdv.aEnvoyer', { limite: 1 });
    assert.equal(un.nombre, 1);
    assert.equal((await m.action('rdv.aEnvoyer', { limite: 1 })).nombre, 1);
    assert.equal((await m.action('rdv.aEnvoyer', { limite: 1 })).nombre, 0);
  });
  test('un rendez-vous archivé, annulé ou sans demande d\'envoi n\'envoie rien', async () => {
    const m = monde();
    m.semer('a', { archive: true }); m.semer('b', { annule: true }); m.semer('d', { envoiDemandeLe: null });
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0);
  });
  test('un rendez-vous CONFIRMÉ envoie la confirmation à tous, puis le rappel de la veille à 19 h ; pas de relance', async () => {
    const m = monde();
    m.semer('r1', { etat: 'confirme', creneauChoisi: iso(Date.parse('2026-11-18T09:00:00Z')), confirmeLe: iso(T0 - 60000) });
    const conf = (await m.action('rdv.aEnvoyer')).messages;
    assert.deepEqual(conf.map((x) => x.typeMessage), ['confirmation', 'confirmation']);
    assert.match(conf[0].texte, /^RDV confirmé : M\. Durand, mer\. 18 nov\. à 10h\./);
    for (const x of conf) await m.action('rdv.confirmerEnvoi', { messageId: x.messageId, statut: 'ok' });
    m.temps.t = Date.parse('2026-11-17T17:59:00Z'); // 18 h 59 à Paris : trop tôt
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0);
    m.temps.t = Date.parse('2026-11-17T18:00:00Z'); // 19 h à Paris
    const rappels = (await m.action('rdv.aEnvoyer')).messages;
    assert.deepEqual(rappels.map((x) => x.typeMessage), ['rappel', 'rappel']);
    assert.match(rappels[0].texte, /^Rappel : demain mer\. 18 nov\. à 10h/);
    for (const x of rappels) await m.action('rdv.confirmerEnvoi', { messageId: x.messageId, statut: 'ok' });
    m.temps.t = Date.parse('2026-11-19T12:00:00Z'); // le rendez-vous est passé depuis plus de 2 jours
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0);
  });
  test('hors plage d\'envoi (3 h du matin à Paris), rien ne part avant 8 h', async () => {
    const m = monde(); m.semer('r1', { envoiDemandeLe: iso(Date.parse('2026-11-16T01:00:00Z')) });
    m.temps.t = Date.parse('2026-11-16T02:00:00Z'); // 3 h à Paris
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0);
    m.temps.t = Date.parse('2026-11-16T07:30:00Z'); // 8 h 30 à Paris
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 4, 'présentation et créneaux de chaque participant, à l\'ouverture');
  });
  test('rendez-vous de test : seulement vers le numéro de test, et rien tant qu\'il n\'est pas réglé', async () => {
    const m = monde({ test: true }); m.semer();
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0);
    const m2 = monde({ test: true, reglages: { ...REGLAGES, numeroTest: '+33600000099' } }); m2.semer();
    const r = await m2.action('rdv.aEnvoyer');
    assert.equal(r.nombre, 2);
    assert.ok(r.messages.every((x) => x.numero === '+33600000099'));
  });
  test('un champ inconnu est refusé', async () => {
    const m = monde();
    await assert.rejects(() => m.action('rdv.aEnvoyer', { numero: '+33600000001' }), /Champ inconnu/);
    await assert.rejects(() => m.action('rdv.aEnvoyer', { limite: 500 }), /nombre entre/);
  });
});

describe('rdv.confirmerEnvoi : rejouable', () => {
  test('« ok » enregistre l\'envoi, rejouer rend deja:true, le SMS n\'est plus dû', async () => {
    const m = monde(); m.semer();
    const { messages } = await m.action('rdv.aEnvoyer');
    const id = messages[0].messageId;
    const un = await m.action('rdv.confirmerEnvoi', { messageId: id, statut: 'ok', idFournisseur: 'cs-123' });
    assert.deepEqual([un.statut, un.deja], ['ok', false]);
    const doc = m.base.docs.get(`rdv_messages/${id}`).d;
    assert.deepEqual([doc.etatEnvoi, doc.idFournisseur], ['envoye', 'cs-123']);
    assert.ok(doc.envoyeLe);
    assert.equal((await m.action('rdv.confirmerEnvoi', { messageId: id, statut: 'ok' })).deja, true);
    m.temps.t = T0 + 3600000;
    const suite = await m.action('rdv.aEnvoyer');
    assert.ok(!suite.messages.some((x) => x.messageId === id), 'un SMS envoyé n\'est jamais redemandé');
  });
  test('les créneaux partent une minute après la présentation, puis les relances 24 h plus tard, une à la fois', async () => {
    const m = monde(); m.semer();
    for (const x of (await m.action('rdv.aEnvoyer')).messages) await m.action('rdv.confirmerEnvoi', { messageId: x.messageId, statut: 'ok' });
    m.temps.t = T0 + 2 * 60000;
    const creneaux = (await m.action('rdv.aEnvoyer')).messages;
    assert.deepEqual(creneaux.map((x) => x.typeMessage), ['creneaux', 'creneaux']);
    for (const x of creneaux) await m.action('rdv.confirmerEnvoi', { messageId: x.messageId, statut: 'ok' });
    assert.ok(m.base.docs.get('rdv_rendezvous/r1').d.envoiDemandeLe);
    m.temps.t = T0 + 2 * 86400000;
    const relances = (await m.action('rdv.aEnvoyer')).messages;
    assert.deepEqual([...new Set(relances.map((x) => x.typeMessage))], ['relance']);
    for (const x of relances) await m.action('rdv.confirmerEnvoi', { messageId: x.messageId, statut: 'ok' });
    assert.equal(m.base.docs.get('rdv_rendezvous/r1').d.relancesFaites, 1);
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0, 'la relance 2 attend 24 h après l\'envoi réel de la 1');
  });
  test('« echec » : le SMS revient après le délai de 10 minutes ; après 3 échecs il est abandonné', async () => {
    const m = monde(); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    const id = (await m.action('rdv.aEnvoyer')).messages[0].messageId;
    for (let i = 1; i < ESSAIS_MAX; i++) {
      const r = await m.action('rdv.confirmerEnvoi', { messageId: id, statut: 'echec', message: 'réseau' });
      assert.deepEqual([r.statut, r.essais, r.abandonne], ['echec', i, false]);
      assert.equal((await m.action('rdv.aEnvoyer')).messages.length, 0, 'pas avant le délai de 10 minutes après un échec');
      m.temps.t += 11 * 60_000;
      assert.equal((await m.action('rdv.aEnvoyer')).messages[0].messageId, id);
    }
    const dernier = await m.action('rdv.confirmerEnvoi', { messageId: id, statut: 'echec' });
    assert.equal(dernier.abandonne, true);
    assert.equal(m.base.docs.get(`rdv_messages/${id}`).d.etatEnvoi, 'abandonne');
    const apres = await m.action('rdv.aEnvoyer');
    assert.ok(!apres.messages.some((x) => x.typeMessage === 'confiance'), 'le SMS abandonné n\'est plus jamais redemandé');
    assert.deepEqual(apres.messages.map((x) => x.typeMessage), ['alerte'], 'seule l\'alerte « un SMS n\'est pas parti » est due');
  });
  test('un message inconnu ou une réponse reçue : refus clair (404)', async () => {
    const m = monde();
    await assert.rejects(() => m.action('rdv.confirmerEnvoi', { messageId: 'nexistepas', statut: 'ok' }), (e) => e.code === 'message_inconnu' && e.statut === 404);
  });
  test('l\'alerte « relances terminées » confirmée est notée sur le rendez-vous (colonne « À reprendre »)', async () => {
    const m = monde(); m.semer('r1', { envoiDemandeLe: iso(T0 - 5 * 86400000) }, [['p1', 'M. Durand', '+33600000001']]);
    const dep = T0 - 5 * 86400000;
    const base = m.base;
    const envoye = (nature, quand) => base.docs.set(`rdv_messages/${docIdMessage(`r1:t1:${nature}:r1-p1`)}`, { v: 1, d: { rendezVousId: 'r1', sens: 'sortant', echeance: `r1:t1:${nature}:r1-p1`, etatEnvoi: 'envoye', envoyeLe: iso(quand), numero: '+33600000001', texte: 'x' } });
    envoye('confiance', dep); envoye('creneaux', dep + 60000); envoye('relance1', dep + 86400000); envoye('relance2', dep + 2 * 86400000); envoye('relance3', dep + 3 * 86400000);
    // participants : l'identifiant du document est « r1-p1 » ; smsDus lit ses `id` : on réutilise le même schéma
    m.temps.t = T0; // 2 jours après la dernière relance
    const r = await m.action('rdv.aEnvoyer');
    const alerte = r.messages.find((x) => x.typeMessage === 'alerte');
    assert.ok(alerte, 'alerte de fin due');
    await m.action('rdv.confirmerEnvoi', { messageId: alerte.messageId, statut: 'ok' });
    assert.ok(base.docs.get('rdv_rendezvous/r1').d.relancesTermineesLe);
    assert.equal(base.docs.get('rdv_rendezvous/r1').d.etat, 'a_reprendre', 'le rendez-vous passe dans la colonne « À reprendre »');
    assert.equal((await m.action('rdv.confirmerEnvoi', { messageId: alerte.messageId, statut: 'ok' })).deja, true, 'rejeu : rien de plus');
  });
  test('un SMS abandonné ne bloque pas les relances des autres, et la professionnelle en est prévenue une seule fois', async () => {
    const m = monde(); m.semer('r1', { envoiDemandeLe: iso(T0 - 3 * 86400000) });
    const dep = T0 - 3 * 86400000;
    const pose = (nature, pid, quand, etatEnvoi = 'envoye') => m.base.docs.set(`rdv_messages/${docIdMessage(`r1:t1:${nature}:r1-${pid}`)}`, { v: 1, d: { rendezVousId: 'r1', participantId: `r1-${pid}`, sens: 'sortant', echeance: `r1:t1:${nature}:r1-${pid}`, typeMessage: nature, etatEnvoi, envoyeLe: iso(quand), numero: '+33600000001', texte: 'x' } });
    for (const pid of ['p1', 'p2']) { pose('confiance', pid, dep); pose('creneaux', pid, dep + 60000); }
    pose('relance1', 'p1', dep + 86400000, 'abandonne'); pose('relance1', 'p2', dep + 86400000);
    m.temps.t = dep + 2 * 86400000 + 3600000;
    const r = (await m.action('rdv.aEnvoyer')).messages;
    assert.deepEqual(r.filter((x) => x.typeMessage === 'relance').map((x) => x.rendezVousId), ['r1', 'r1'], 'la relance 2 part pour les deux, malgré l\'abandon de la relance 1 de la première personne');
    const alertes = r.filter((x) => x.typeMessage === 'alerte');
    assert.equal(alertes.length, 1);
    assert.match(alertes[0].texte, /un SMS n'est pas parti vers M\. Durand/);
    await m.action('rdv.confirmerEnvoi', { messageId: alertes[0].messageId, statut: 'ok' });
    assert.ok(!(await m.action('rdv.aEnvoyer')).messages.some((x) => x.typeMessage === 'alerte' && /n'est pas parti/.test(x.texte)), 'une seule alerte par SMS abandonné');
  });
  test('une réservation expirée sans confirmation compte comme un essai : après 3 reprises le SMS n\'est plus renvoyé seul', async () => {
    const m = monde(); m.semer('r1', {}, [['p1', 'M. Durand', '+33600000001']]);
    let id = null;
    for (let i = 0; i < ESSAIS_MAX; i++) {
      const r = await m.action('rdv.aEnvoyer');
      const conf = r.messages.find((x) => x.typeMessage === 'confiance');
      if (i < ESSAIS_MAX - 1) assert.ok(conf, `reprise ${i}`);
      if (conf) id = conf.messageId;
      m.temps.t += RESERVATION_MS + 1000;
    }
    const dernier = await m.action('rdv.aEnvoyer');
    assert.ok(!dernier.messages.some((x) => x.messageId === id), 'plus jamais renvoyé');
    assert.equal(m.base.docs.get(`rdv_messages/${id}`).d.etatEnvoi, 'abandonne');
  });
});

describe('rdv.enregistrerReponse', () => {
  const recevoir = (m, numero, texte, idFournisseur = 'cs-in-1') => m.action('rdv.enregistrerReponse', { numero, texte, idFournisseur, recuLe: iso(T0) });
  test('une réponse comprise est rattachée au bon participant et le message est gardé tel quel', async () => {
    const m = monde(); m.semer();
    const r = await recevoir(m, '+33600000001', '1 et 2');
    assert.deepEqual([r.deja, r.rattache, r.comprise], [false, 'unique', true]);
    assert.deepEqual([m.base.docs.get('rdv_participants/r1-p1').d.etatReponse, m.base.docs.get('rdv_participants/r1-p1').d.creneauxOk], ['comprise', [1, 2]]);
    const msg = m.base.docs.get(`rdv_messages/${r.messageId}`).d;
    assert.deepEqual([msg.sens, msg.texte, msg.rendezVousId, msg.comprise], ['entrant', '1 et 2', 'r1', true]);
    assert.equal(m.base.docs.get('rdv_participants/r1-p2').d.etatReponse, 'attente');
  });
  test('le numéro du fournisseur sans « + » (33…) est reconnu ; le texte est gardé avec ses retours à la ligne', async () => {
    const m = monde(); m.semer();
    const r = await recevoir(m, '33600000002', 'jeudi\nplutôt');
    assert.equal(r.rattache, 'unique');
    assert.equal(m.base.docs.get('rdv_participants/r1-p2').d.etatReponse, 'incomprise');
    assert.equal(m.base.docs.get('rdv_participants/r1-p2').d.reponse, 'jeudi\nplutôt');
  });
  test('rejouée (même identifiant du fournisseur) : deja:true, rien n\'est écrit une seconde fois', async () => {
    const m = monde(); m.semer();
    await recevoir(m, '+33600000001', '1');
    const avant = m.base.docs.size;
    const r = await recevoir(m, '+33600000001', '2');
    assert.equal(r.deja, true);
    assert.equal(m.base.docs.size, avant);
    assert.deepEqual(m.base.docs.get('rdv_participants/r1-p1').d.creneauxOk, [1]);
  });
  test('deux livraisons EN MÊME TEMPS de la même réponse : une seule est enregistrée', async () => {
    const m = monde(); m.semer();
    const [a, b] = await Promise.all([recevoir(m, '+33600000001', '1', 'cs-x'), recevoir(m, '+33600000001', '1', 'cs-x')]);
    assert.equal([a, b].filter((x) => x.deja === false).length, 1);
  });
  test('quand tout le monde a répondu, l\'état du rendez-vous est recalculé (à valider)', async () => {
    const m = monde(); m.semer();
    await recevoir(m, '+33600000001', '1', 'a');
    await recevoir(m, '+33600000002', '1 et 2', 'b');
    assert.equal(m.base.docs.get('rdv_rendezvous/r1').d.etat, 'a_valider');
  });
  test('le même numéro dans deux rendez-vous ouverts n\'est jamais deviné : non comprise pour les deux, une trace par rendez-vous', async () => {
    const m = monde(); m.semer('r1'); m.semer('r2');
    const r = await recevoir(m, '+33600000001', '1');
    assert.equal(r.rattache, 'ambigu');
    for (const id of ['r1-p1', 'r2-p1']) assert.equal(m.base.docs.get(`rdv_participants/${id}`).d.etatReponse, 'incomprise');
    assert.equal([...m.base.docs.keys()].filter((c) => c.startsWith('rdv_messages/in_')).length, 3, 'le repère « déjà vu » + une trace par rendez-vous');
    assert.equal((await recevoir(m, '+33600000001', '1')).deja, true, 'rejeu d\'une réponse ambiguë : rien de plus');
  });
  test('numéro ambigu : celui qui avait déjà répondu dans un rendez-vous garde sa réponse ; STOP garde son repère même ambigu', async () => {
    const m = monde(); m.semer('r1'); m.semer('r2');
    m.base.docs.set('rdv_participants/r1-p1', { v: 1, d: { ...m.base.docs.get('rdv_participants/r1-p1').d, etatReponse: 'comprise', creneauxOk: [2], reponse: '2' } });
    await recevoir(m, '+33600000001', 'STOP', 'cs-stop');
    assert.deepEqual([m.base.docs.get('rdv_participants/r1-p1').d.etatReponse, m.base.docs.get('rdv_participants/r1-p1').d.creneauxOk], ['comprise', [2]], 'sa réponse n\'est pas effacée');
    const autre = m.base.docs.get('rdv_participants/r2-p1').d;
    assert.deepEqual([autre.etatReponse, autre.desinscrit], ['incomprise', true]);
  });
  test('une réponse n\'est jamais rattachée à un rendez-vous dont les propositions ne sont pas parties', async () => {
    const m = monde(); m.semer('r1'); m.semer('brouillon', { envoiDemandeLe: null });
    const r = await recevoir(m, '+33600000001', '1');
    assert.equal(r.rattache, 'unique');
    assert.equal(m.base.docs.get('rdv_participants/r1-p1').d.etatReponse, 'comprise');
    assert.equal(m.base.docs.get('rdv_participants/brouillon-p1').d.etatReponse, 'attente');
  });
  test('un numéro présent dans beaucoup de rendez-vous : toutes les écritures passent (plusieurs lots), aucune coupure silencieuse', async () => {
    const m = monde();
    for (let i = 1; i <= 9; i++) m.semer(`rv${i}`);
    const r = await recevoir(m, '+33600000001', 'plutôt jeudi', 'cs-gros');
    assert.equal(r.rattache, 'ambigu');
    for (let i = 1; i <= 9; i++) assert.equal(m.base.docs.get(`rdv_participants/rv${i}-p1`).d.etatReponse, 'incomprise', `rendez-vous ${i}`);
    assert.equal([...m.base.docs.keys()].filter((c) => c.startsWith('rdv_messages/in_')).length, 10);
  });
  test('un numéro inconnu est gardé comme message orphelin, rien n\'est modifié', async () => {
    const m = monde(); m.semer();
    const r = await recevoir(m, '+33611111111', '1');
    assert.equal(r.rattache, 'inconnu');
    assert.equal(m.base.docs.get(`rdv_messages/${r.messageId}`).d.orphelin, true);
    assert.equal(m.base.docs.get('rdv_participants/r1-p1').d.etatReponse, 'attente');
  });
  test('STOP : jamais « non comprise » sans suite ; le numéro est désinscrit, plus aucun SMS ne lui part, la professionnelle est alertée', async () => {
    const m = monde(); m.semer();
    const r = await recevoir(m, '+33600000001', 'STOP');
    assert.equal(r.desinscription, true);
    assert.deepEqual(m.base.docs.get('rdv_parametres/desinscrits').d.numeros, ['+33600000001']);
    assert.equal(m.base.docs.get('rdv_participants/r1-p1').d.desinscrit, true);
    const dus = (await m.action('rdv.aEnvoyer')).messages;
    assert.ok(!dus.some((x) => x.numero === '+33600000001' && x.typeMessage !== 'alerte'), 'plus de SMS vers ce numéro');
    const alerte = dus.find((x) => x.typeMessage === 'alerte');
    assert.match(alerte.texte, /a répondu STOP/);
    assert.equal(alerte.numero, '+33700000001');
  });
  test('D1 STOP d\'un participant : les autres répondent, le rendez-vous passe « à valider » (le désinscrit ne bloque plus)', async () => {
    const m = monde(); m.semer();
    await recevoir(m, '+33600000001', 'STOP', 'cs-stop');
    assert.equal(m.base.docs.get('rdv_rendezvous/r1').d.etat, 'en_attente', 'tant que l\'autre n\'a pas répondu');
    await recevoir(m, '+33600000002', '1 et 2', 'cs-b');
    assert.equal(m.base.docs.get('rdv_rendezvous/r1').d.etat, 'a_valider');
    const parts = ['r1-p1', 'r1-p2'].map((i) => ({ id: i, ...m.base.docs.get(`rdv_participants/${i}`).d }));
    const b = R.bilanReponses(parts, 2);
    assert.deepEqual([b.complet, b.communs, b.incomprises, b.desinscrits], [true, [1, 2], 0, 1]);
    const textes = (await m.action('rdv.aEnvoyer')).messages.filter((x) => x.typeMessage === 'alerte').map((x) => x.texte);
    assert.ok(textes.some((t) => /tous dispos/.test(t)), 'l\'alerte « un créneau convient à tous » part sans attendre le désinscrit');
    assert.ok(textes.some((t) => /a répondu STOP/.test(t)));
  });
  test('D1-4 après STOP, une réponse « 1 » puis une réponse tardive : le participant reste désinscrit et n\'est jamais « OK »', async () => {
    const m = monde(); m.semer();
    await recevoir(m, '+33600000001', 'STOP', 'cs-stop');
    await recevoir(m, '+33600000001', '1', 'cs-un');
    let p = m.base.docs.get('rdv_participants/r1-p1').d;
    assert.deepEqual([p.desinscrit, p.etatReponse], [true, 'comprise']);
    assert.deepEqual(R.bilanReponses([{ ...p, id: 'a' }], 2).communs, []);
    await recevoir(m, '+33600000002', '1', 'cs-b');
    const rdv = m.base.docs.get('rdv_rendezvous/r1');
    m.base.docs.set('rdv_rendezvous/r1', { v: 9, d: { ...rdv.d, etat: 'confirme', creneauChoisi: rdv.d.creneaux[0] } });
    await recevoir(m, '+33600000001', 'empêchement', 'cs-tard');
    p = m.base.docs.get('rdv_participants/r1-p1').d;
    assert.equal(p.desinscrit, true);
    assert.equal(R.symboleCellule(p, 0), 'desinscrit');
  });
  test('D1-4 STOP puis réponse saisie par la professionnelle : un « 1 » ou un nouveau STOP du désinscrit ne l\'efface pas, sans nouvelle alerte', async () => {
    const m = monde(); m.semer();
    await recevoir(m, '+33600000001', 'STOP', 'cs-stop');
    const saisie = { etatReponse: 'saisie', creneauxOk: [2], reponse: 'STOP', ambigu: false };
    m.base.docs.set('rdv_participants/r1-p1', { v: 9, d: { ...m.base.docs.get('rdv_participants/r1-p1').d, ...saisie } });
    for (const [texte, id] of [['1', 'cs-un'], ['STOP', 'cs-stop2']]) {
      await recevoir(m, '+33600000001', texte, id);
      const p = m.base.docs.get('rdv_participants/r1-p1').d;
      assert.deepEqual([p.desinscrit, p.etatReponse, p.creneauxOk], [true, 'saisie', [2]], texte);
    }
    const msg = [...m.base.docs].filter(([c]) => c.startsWith('rdv_messages/in_cs-stop2')).map(([, x]) => x.d)[0];
    assert.equal(msg.historique, true);
    const alertes = (await m.action('rdv.aEnvoyer')).messages.filter((x) => x.typeMessage === 'alerte' && /STOP|incomprise|non compris/.test(x.texte));
    assert.equal(alertes.length, 0, 'aucune alerte STOP ni « non comprise » (la saisie a remplacé l\'état du premier STOP)');
  });
  test('champs obligatoires et identifiant trop long refusés', async () => {
    const m = monde();
    await assert.rejects(() => m.action('rdv.enregistrerReponse', { numero: '+33600000001', texte: '1' }), (e) => e.code === 'requete_invalide');
    await assert.rejects(() => m.action('rdv.enregistrerReponse', { numero: '+33600000001', texte: '1', idFournisseur: 'a'.repeat(61) }), (e) => e.code === 'requete_invalide');
  });
});

describe('SMS écrits à la main (pluie, annulation)', () => {
  test('un SMS « a_envoyer » créé par l\'appli part sans attendre la plage d\'envoi, même si le rendez-vous est annulé', async () => {
    const m = monde(); m.semer('r1', { annule: true, archive: true });
    m.temps.t = Date.parse('2026-11-16T02:00:00Z'); // 3 h à Paris
    m.base.docs.set('rdv_messages/man_1', { v: 1, d: { rendezVousId: 'r1', participantId: 'r1-p1', sens: 'sortant', manuel: true, typeMessage: 'annulation', numero: '+33600000001', texte: 'Mme Martin : RDV annulé.', caracteres: 24, segments: 1, etatEnvoi: 'a_envoyer', echeance: 'r1:man:1:p1' } });
    const r = await m.action('rdv.aEnvoyer');
    assert.deepEqual(r.messages.map((x) => [x.messageId, x.typeMessage, x.texte]), [['man_1', 'annulation', 'Mme Martin : RDV annulé.']]);
    assert.equal((await m.action('rdv.aEnvoyer')).nombre, 0, 'réservé');
    await m.action('rdv.confirmerEnvoi', { messageId: 'man_1', statut: 'ok' });
    assert.equal(m.base.docs.get('rdv_messages/man_1').d.etatEnvoi, 'envoye');
  });
  test('SMS manuel d\'un rendez-vous de TEST : vers le numéro de test seulement, rien sans lui, rien si le rendez-vous a disparu', async () => {
    const sms = (id, extra = {}) => ({ v: 1, d: { rendezVousId: 'r1', participantId: 'r1-p1', sens: 'sortant', manuel: true, typeMessage: 'pluie', numero: '+33600000001', texte: 'Pluie.', caracteres: 6, segments: 1, etatEnvoi: 'a_envoyer', echeance: `r1:man:${id}:p1`, ...extra } });
    const sansNumero = monde({ test: true }); sansNumero.semer(); sansNumero.base.docs.set('rdv_messages/man_1', sms('1'));
    assert.equal((await sansNumero.action('rdv.aEnvoyer')).messages.filter((x) => x.messageId === 'man_1').length, 0, 'pas de numéro de test : rien ne part');
    const avec = monde({ test: true, reglages: { ...REGLAGES, numeroTest: '+33600000099' } }); avec.semer(); avec.base.docs.set('rdv_messages/man_1', sms('1'));
    assert.deepEqual((await avec.action('rdv.aEnvoyer')).messages.filter((x) => x.messageId === 'man_1').map((x) => x.numero), ['+33600000099']);
    const disparu = monde({ test: true, reglages: { ...REGLAGES, numeroTest: '+33600000099' } }); disparu.base.docs.set('rdv_messages/man_1', sms('1', { test: true }));
    assert.equal((await disparu.action('rdv.aEnvoyer')).nombre, 0, 'rendez-vous introuvable : aucun SMS, surtout pas vers le vrai numéro');
  });
});

describe('docIdMessage', () => {
  test('identifiant sûr, stable et jamais plus long que 100 caractères', () => {
    assert.equal(docIdMessage('r1:t1:confiance:p1'), 'r1_t1_confiance_p1');
    const long = `r1:t1:alerte-incomprise-p1-${'x'.repeat(120)}`;
    assert.ok(docIdMessage(long).length <= 100);
    assert.equal(docIdMessage(long), docIdMessage(long));
    assert.notEqual(docIdMessage(`${long}a`), docIdMessage(`${long}b`));
  });
});

describe('par la porte complète (module « rdv »)', () => {
  test('une clé de l\'espace appelle rdv.aEnvoyer ; un module inactif ou un autre espace est refusé ; le journal ne contient ni numéro ni texte', async () => {
    const m = monde(); m.semer();
    const journaux = [];
    const cle = genererCle('interne');
    const e = enregistrementDe(cle, 'interne', new Date(T0 - 86400000));
    const cles = new Map([[e.id, e.donnees]]);
    const donnees = { ...m.base, lireCle: async (x) => cles.get(x) ?? null, majCle: async (x, p) => { cles.set(x, { ...cles.get(x), ...p }); } };
    const n8n = { lireWorkflow: async () => ({ id: 'w1', nom: 'interne-rdv-envoi', etiquettes: ['interne'] }) };
    const porte = (actifs) => creerPorte({ contexte: 'crm', donnees, n8n, modulesActifs: async () => actifs, maintenant: () => m.temps.t, journal: (x) => journaux.push(x) });
    const corps = { module: 'rdv', action: 'rdv.aEnvoyer', workflowId: 'w1', donnees: {} };
    const ok = await porte(['rdv'])({ methode: 'POST', authorization: `Bearer ${cle}`, corps });
    assert.equal(ok.statut, 200);
    assert.equal(ok.corps.resultat.nombre, 2);
    const refuse = await porte(['veille'])({ methode: 'POST', authorization: `Bearer ${cle}`, corps });
    assert.equal(refuse.statut, 403);
    assert.equal(refuse.corps.erreur, 'module_non_actif');
    assert.ok(!JSON.stringify(journaux).match(/\+336|Bonjour|Mme Martin/), 'le journal de la porte ne reçoit ni numéro ni texte');
  });
});

describe('réponse reçue après la confirmation', () => {
  test('« empêchement » après la confirmation : gardé sur le participant, rejeu idempotent, et la professionnelle est alertée une seule fois', async () => {
    const m = monde();
    m.semer('r1', { etat: 'confirme', creneauChoisi: iso(T0 + 3 * 86400000), confirmeLe: iso(T0 - 3600000) }, [['p1', 'M. Durand', '+33600000001']]);
    const envoi = { numero: '+33600000001', texte: 'Empêchement demain', idFournisseur: 'tardif1', recuLe: iso(T0) };
    const r = await m.action('rdv.enregistrerReponse', envoi);
    assert.equal(r.rattache, 'confirme');
    const p = m.base.docs.get('rdv_participants/r1-p1').d;
    assert.match(p.reponseTardive, /Empêchement/);
    const rejeu = await m.action('rdv.enregistrerReponse', envoi);
    assert.equal(rejeu.deja, true);
    const dus = await m.action('rdv.aEnvoyer', {});
    const alertes = dus.messages.filter((x) => x.typeMessage === 'alerte');
    assert.equal(alertes.length, 1);
    assert.match(alertes[0].texte, /après la confirmation/);
  });
});

describe('rdv.libererEnvoi', () => {
  test('un SMS réservé redevient « à envoyer » SANS compter d’essai et revient au tir suivant avec le même identifiant ; sinon rien ne change', async () => {
    const m = monde(); m.semer();
    const premier = await m.action('rdv.aEnvoyer');
    const { messageId } = premier.messages[0];
    assert.equal(m.base.docs.get(`rdv_messages/${messageId}`).d.etatEnvoi, 'reserve');
    assert.deepEqual(await m.action('rdv.libererEnvoi', { messageId }), { messageId, libere: true });
    const doc = m.base.docs.get(`rdv_messages/${messageId}`).d;
    assert.deepEqual([doc.etatEnvoi, doc.essais, doc.reserveJusqua], ['a_envoyer', 0, null]);
    const second = await m.action('rdv.aEnvoyer');
    assert.ok(second.messages.some((x) => x.messageId === messageId), 'le même SMS revient tout de suite');
    assert.equal(m.base.docs.get(`rdv_messages/${messageId}`).d.essais, 0);
    // déjà envoyé : on ne touche à rien
    await m.action('rdv.confirmerEnvoi', { messageId, statut: 'ok' });
    assert.deepEqual(await m.action('rdv.libererEnvoi', { messageId }), { messageId, libere: false });
    assert.equal(m.base.docs.get(`rdv_messages/${messageId}`).d.etatEnvoi, 'envoye');
  });
  test('un échec n’est pas redemandé avant 10 minutes (trois clics rapides ne brûlent pas les trois essais) ; ensuite il revient avec le même identifiant', async () => {
    const m = monde(); m.semer();
    const { messageId } = (await m.action('rdv.aEnvoyer')).messages[0];
    await m.action('rdv.confirmerEnvoi', { messageId, statut: 'echec', message: 'refus' });
    for (let k = 0; k < 3; k += 1) assert.ok(!(await m.action('rdv.aEnvoyer')).messages.some((x) => x.messageId === messageId), 'pas avant le délai');
    m.temps.t += 11 * 60_000;
    assert.ok((await m.action('rdv.aEnvoyer')).messages.some((x) => x.messageId === messageId), 'après 10 minutes, il revient');
    assert.equal(m.base.docs.get(`rdv_messages/${messageId}`).d.essais, 1);
  });
  test('message inconnu ou entrant : 404', async () => {
    const m = monde(); m.semer();
    await assert.rejects(() => m.action('rdv.libererEnvoi', { messageId: 'inconnu' }), (e) => e.code === 'message_inconnu');
    m.base.docs.set('rdv_messages/in_x', { v: 1, d: { sens: 'entrant', etatEnvoi: 'recu' } });
    await assert.rejects(() => m.action('rdv.libererEnvoi', { messageId: 'in_x' }), (e) => e.code === 'message_inconnu');
  });
});
