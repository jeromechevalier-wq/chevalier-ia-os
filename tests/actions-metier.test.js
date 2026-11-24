// Actions métier (js/os/actions-metier.js) : faux n8n et faux tickets en mémoire, aucun réseau. Adresses et jetons : inventés (domaine réservé « .invalid »).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerActions, ErreurAction, messageServeur, CODES_A_RECHARGER, MESSAGE_REFUS_SERVEUR, MESSAGE_REPONSE_INATTENDUE } from '../js/os/actions-metier.js';

const H = (nom) => ['https', `://n8n-essai.invalid/${nom}`].join('');
const connexion = () => ({ adresseBase: 'x', clePublique: 'y', espace: 'essai', webhooks: { validation: H('v'), actions: H('a'), suggestions: H('s'), ajoutFacture: H('f') } });

function monter({ repondre, lireConnexion = connexion } = {}) {
  const appels = [];
  const tickets = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    appels.push({ url, init });
    const r = await repondre(appels.length, url, init);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => { if (r.illisible) throw new Error('pas du JSON'); return r.corps; } };
  };
  const demanderTicket = async (usage) => { n += 1; tickets.push(usage); return `ticket-${n}`; };
  return { appels, tickets, a: creerActions({ lireConnexion, demanderTicket, fetchImpl }) };
}
const ok = { status: 200, corps: { ok: true, facture_id: 'f1' } };

describe('un ticket NEUF par appel, jamais le badge', () => {
  test('en-tête Authorization: Bearer <ticket>, bon webhook selon l’usage, corps sans identité ajoutée', async () => {
    const { appels, tickets, a } = monter({ repondre: () => ok });
    await a.appelerActionMetier('archiver', { facture_id: 'f1' });
    await a.validerFacture({ facture_id: 'f1', decision: 'accepter' });
    await a.demanderSuggestions();
    await a.ajouterFacture({ x: 1 });
    assert.deepEqual(tickets, ['actions', 'validation', 'suggestions', 'ajoutFacture']);
    assert.deepEqual(appels.map((c) => c.url), [H('a'), H('v'), H('s'), H('f')]);
    assert.deepEqual(appels.map((c) => c.init.headers.Authorization), ['Bearer ticket-1', 'Bearer ticket-2', 'Bearer ticket-3', 'Bearer ticket-4']);
    assert.deepEqual(JSON.parse(appels[0].init.body), { facture_id: 'f1', action: 'archiver' });
    assert.equal(appels[0].init.method, 'POST');
  });
  test('deux appels de suite : deux tickets différents (jamais réutilisé)', async () => {
    const { appels, a } = monter({ repondre: () => ok });
    await a.demanderSuggestions();
    await a.demanderSuggestions();
    assert.notEqual(appels[0].init.headers.Authorization, appels[1].init.headers.Authorization);
  });
});

describe('401 : un seul nouvel essai avec un ticket neuf', () => {
  test('401 puis succès : réussit, deux tickets', async () => {
    const { appels, tickets, a } = monter({ repondre: (n) => (n === 1 ? { status: 401, corps: {} } : ok) });
    assert.equal((await a.appelerActionMetier('archiver', {})).ok, true);
    assert.equal(tickets.length, 2);
    assert.equal(appels[1].init.headers.Authorization, 'Bearer ticket-2');
  });
  test('401 deux fois : erreur « refus_serveur », pas de troisième essai', async () => {
    const { appels, a } = monter({ repondre: () => ({ status: 401, corps: {} }) });
    await assert.rejects(a.appelerActionMetier('archiver', {}), (e) => e instanceof ErreurAction && e.code === 'refus_serveur' && e.message === MESSAGE_REFUS_SERVEUR);
    assert.equal(appels.length, 2);
  });
});

describe('erreurs en français', () => {
  test('redirections refusées ; une erreur de la demande de ticket (plafond par minute) sort en ErreurAction, rien n’est envoyé', async () => {
    const m = monter({ repondre: () => ok });
    await m.a.demanderSuggestions();
    assert.equal(m.appels[0].init.redirect, 'error');
    const appels = [];
    const a = creerActions({ lireConnexion: connexion, fetchImpl: async (...x) => { appels.push(x); return {}; }, demanderTicket: async () => { const e = new Error('Trop de demandes, réessaie dans une minute.'); e.code = 'refus'; e.detail = 'ticket_trop_de_demandes'; throw e; } });
    await assert.rejects(a.demanderSuggestions(), (e) => e instanceof ErreurAction && e.detail === 'ticket_trop_de_demandes' && /Trop de demandes/.test(e.message));
    assert.equal(appels.length, 0);
  });
  test('un 200 sans « ok: true » n’est pas un succès (corps vide, ok faux, texte illisible)', async () => {
    for (const rep of [{ status: 200, corps: {} }, { status: 200, corps: { ok: false } }, { status: 200, corps: { ok: 'true' } }, { status: 200, corps: null }, { status: 200, illisible: true }]) {
      const { a } = monter({ repondre: () => rep });
      await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.code === 'reponse_inattendue' && e.message === MESSAGE_REPONSE_INATTENDUE);
    }
  });
  test('erreur 4xx : le message du serveur est affiché tel quel, avec son code ; 409 aussi', async () => {
    for (const statut of [400, 409, 422]) {
      const { a } = monter({ repondre: () => ({ status: statut, corps: { erreur: 'Le chantier est terminé.', code: 'chantier_termine' } }) });
      await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.message === 'Le chantier est terminé.' && e.code === 'chantier_termine');
    }
  });
  test('erreur 500 : message générique (le texte du serveur n’est pas montré) ; « deja_traitee » a son message', async () => {
    const { a } = monter({ repondre: () => ({ status: 500, corps: { erreur: 'détail interne' } }) });
    await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.message === 'Une erreur est survenue, réessaie dans un instant.');
    assert.equal(messageServeur(409, { code: 'deja_traitee', erreur: 'autre' }), 'Cette facture a déjà été traitée.');
    assert.equal(messageServeur(400, null), 'Une erreur est survenue, réessaie dans un instant.');
  });
  test('réseau coupé : « Connexion impossible, réessaie. »', async () => {
    const { a } = monter({ repondre: () => new Error('coupé') });
    await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.code === 'reseau' && e.message === 'Connexion impossible, réessaie.');
  });
  test('codes qui demandent de relire les listes', () => {
    assert.ok(CODES_A_RECHARGER.has('chantier_termine'));
    assert.ok(CODES_A_RECHARGER.has('agence_inactive'));
    assert.ok(!CODES_A_RECHARGER.has('reseau'));
  });
});

describe('adresses des webhooks : réglées et en https, sinon rien ne part', () => {
  test('webhook non réglé : message qui dit où le régler, aucun ticket demandé, aucun envoi', async () => {
    const { appels, tickets, a } = monter({ repondre: () => ok, lireConnexion: () => ({ webhooks: { actions: '' } }) });
    await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.code === 'config' && /Connexion à la base/.test(e.message));
    assert.equal(appels.length + tickets.length, 0);
  });
  test('webhook non sécurisé (http, autre protocole, illisible) : refusé, le ticket ne part jamais', async () => {
    for (const mauvaise of ['http://n8n-essai.invalid/a', 'ftp://n8n-essai.invalid/a', 'n8n-essai.invalid/a', 'javascript:alert(1)']) {
      const { appels, tickets, a } = monter({ repondre: () => ok, lireConnexion: () => ({ webhooks: { actions: mauvaise } }) });
      await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.code === 'config', mauvaise);
      assert.equal(appels.length + tickets.length, 0, mauvaise);
    }
  });
  test('connexion non réglée : l’erreur de lireConnexion remonte', async () => {
    const { a } = monter({ repondre: () => ok, lireConnexion: () => { throw new Error('Connexion à la base non réglée'); } });
    await assert.rejects(a.appelerActionMetier('x', {}), /non réglée/);
  });
  test('usage inconnu refusé', async () => {
    const { a } = monter({ repondre: () => ok });
    await assert.rejects(a.appelerWebhook('kpi', {}), (e) => e.code === 'usage');
  });
  test('MODE_EMULATEURS : aucun appel réseau réel sans faux réseau explicite', async () => {
    const a = creerActions({ lireConnexion: connexion, demanderTicket: async () => 't', modeEmulateurs: true });
    await assert.rejects(a.appelerActionMetier('x', {}), (e) => e.code === 'mode_test');
  });
});
