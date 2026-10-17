// Règles d'affichage du module Automatisations (js/modules/automatisations/logique.js) : sans réseau, sans navigateur.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as L from '../js/modules/automatisations/logique.js';

const T = new Date(2026, 9, 11, 10, 0, 0).getTime();
const MIN = 60000;
const exe = (id, status, ago, extra = {}) => ({ id: String(id), executionId: String(id), workflowId: 'w1', status, startedAt: new Date(T - ago), stoppedAt: status === 'running' ? null : new Date(T - ago + 1000), ...extra });

describe('états et compteurs', () => {
  test('« en cours » depuis plus de 10 minutes = à vérifier ; avant, non ; le champ stale du serveur compte aussi', () => {
    assert.equal(L.etatAffiche(exe(1, 'running', 5 * MIN), T), 'running');
    assert.equal(L.etatAffiche(exe(1, 'running', 10 * MIN + 1), T), 'stale');
    assert.equal(L.etatAffiche(exe(1, 'running', MIN, { stale: true }), T), 'stale');
    assert.equal(L.etatAffiche(exe(1, 'new', 11 * MIN), T), 'stale');
    assert.equal(L.etatAffiche(exe(1, 'waiting', 99 * MIN), T), 'waiting');
    assert.equal(L.etatAffiche(exe(1, 'success', 99 * MIN), T), 'success');
    assert.equal(L.etatAffiche(exe(1, 'zzz', 1), T), 'unknown');
    assert.equal(L.etatAffiche(null, T), 'unknown');
  });
  test('quatre compteurs : en cours (démarrées comprises), en erreur, à vérifier, terminées', () => {
    const l = [exe(1, 'running', MIN), exe(2, 'new', 1000), exe(3, 'error', MIN), exe(4, 'running', 20 * MIN), exe(5, 'success', MIN), exe(6, 'success', MIN), exe(7, 'canceled', MIN), exe(8, 'waiting', MIN)];
    assert.deepEqual(L.compteurs(l, T), { enCours: 2, erreur: 1, averifier: 1, terminees: 2 });
  });
  test('filtres par automatisation et par état, plus récentes d\'abord', () => {
    const l = [exe(1, 'success', 3 * MIN), exe(2, 'error', MIN), exe(3, 'running', 2 * MIN, { workflowId: 'w2' }), exe(4, 'running', 30 * MIN)];
    assert.deepEqual(L.filtrer(l, {}, T).map((e) => e.id), ['2', '3', '1', '4']);
    assert.deepEqual(L.filtrer(l, { etat: 'running' }, T).map((e) => e.id), ['3']);
    assert.deepEqual(L.filtrer(l, { etat: 'stale' }, T).map((e) => e.id), ['4']);
    assert.deepEqual(L.filtrer(l, { workflowId: 'w2' }, T).map((e) => e.id), ['3']);
    assert.deepEqual(L.filtrer(l, { workflowId: 'w1', etat: 'error' }, T).map((e) => e.id), ['2']);
    assert.deepEqual(L.filtrer(l, { workflowId: 'inconnu' }, T), []);
  });
});

describe('textes', () => {
  test('libellés du cahier des charges', () => {
    assert.deepEqual(Object.values(L.OPTIONS_ETAT).map((o) => o.libelle), ['Tous les états', 'En cours', 'Terminées', 'En erreur', 'Exécutions à vérifier']);
    assert.equal(L.LIBELLES_ETAT.stale, 'À vérifier');
    assert.equal(L.LIBELLES_ETAT.error, 'En erreur');
    assert.equal(L.LIBELLES_ETAT.success, 'Terminée');
  });
  test('bandeau jaune : seulement si n8n est injoignable, avec l\'heure des dernières données', () => {
    assert.equal(L.texteBandeau(null), null);
    assert.equal(L.texteBandeau({ n8nOk: true }), null);
    assert.equal(L.texteBandeau({ n8nOk: false, lastSuccessAt: new Date(2026, 9, 11, 9, 5, 7) }), 'n8n ne répond pas pour le moment. Vous voyez les données de 09:05:07.');
    assert.match(L.texteBandeau({ n8nOk: false }), /données de —\./);
  });
  test('durées et dates', () => {
    assert.equal(L.formaterDuree(800), '0,8 s');
    assert.equal(L.formaterDuree(24000), '24 s');
    assert.equal(L.formaterDuree(125000), '2 min 05 s');
    assert.equal(L.formaterDuree(3 * 3600000 + 2 * MIN), '3 h 02 min');
    assert.equal(L.depuis(T - 12000, T), 'il y a 12 s');
    assert.equal(L.depuis(T - 5 * MIN, T), 'il y a 5 min');
    assert.equal(L.depuis(new Date(2026, 9, 11, 8, 15).getTime(), T), 'aujourd’hui 08:15');
    assert.equal(L.depuis(new Date(2026, 9, 10, 18, 2).getTime(), T), 'hier 18:02');
    assert.equal(L.texteDuree(exe(1, 'running', 3 * MIN), T).texte, 'depuis 3 min 00 s');
    assert.equal(L.texteDuree(exe(1, 'success', MIN, { durationMs: 840 }), T).texte, 'durée 0,8 s');
    assert.equal(L.texteMiseAJour({ lastSyncedAt: new Date(T - 40000) }, T), 'Mis à jour il y a 40 s');
    assert.equal(L.texteMiseAJour(null, T), 'Mis à jour…');
  });
  test('nom affiché : nom choisi, sinon nom n8n, sinon nom recopié dans l\'exécution', () => {
    const w = new Map([['w1', { nom: 'Nom n8n', libelle: 'Mon nom' }], ['w2', { nom: 'Seul n8n' }]]);
    assert.equal(L.nomAffiche('w1', w), 'Mon nom');
    assert.equal(L.nomAffiche('w2', w), 'Seul n8n');
    assert.equal(L.nomAffiche('w9', w, { workflowLabel: 'Recopié' }), 'Recopié');
    assert.equal(L.nomAffiche('w9', w), 'Automatisation');
    assert.deepEqual(L.optionsAutomatisations(w, [{ workflowId: 'w9', workflowLabel: 'Ancien' }]).map((o) => o.nom), ['Ancien', 'Mon nom', 'Seul n8n']);
  });
});

describe('rafraîchissement', () => {
  test('délai de 10 s entre deux clics', () => {
    assert.equal(L.attenteRafraichir(T, T + 1000), 9);
    assert.equal(L.attenteRafraichir(T, T + 10000), 0);
    assert.equal(L.attenteRafraichir(0, T), 0);
  });
  test('mise à jour automatique : seulement page visible, case cochée, 10 s écoulées, rien en cours', () => {
    const base = { active: true, visible: true, derniereDemande: T - 10000, maintenant: T, enCours: false };
    assert.equal(L.doitRafraichirAuto(base), true);
    assert.equal(L.doitRafraichirAuto({ ...base, visible: false }), false);
    assert.equal(L.doitRafraichirAuto({ ...base, active: false }), false);
    assert.equal(L.doitRafraichirAuto({ ...base, derniereDemande: T - 9999 }), false);
    assert.equal(L.doitRafraichirAuto({ ...base, enCours: true }), false);
  });
});

describe('Vue administrateur : fusion des propriétaires, options du filtre, bandeau', async () => {
  const M = await import('../js/modules/automatisations/logique.js');
  const interne = { executions: [{ id: '1', workflowId: 'w1' }], workflows: new Map([['w1', { nom: 'interne-a' }]]) };
  const admin = { executions: [{ id: '1', workflowId: 'w2', proprietaire: 'audrey' }, { id: '2', workflowId: 'w3', proprietaire: 'boris' }], workflows: [{ id: 'w2', nom: 'A' }, { id: 'w3', nom: 'B' }], proprietaires: [{ id: 'audrey', nom: 'Audrey Conseil', synchro: { n8nOk: false, lastSuccessAt: Date.parse('2026-10-17T08:00:00Z') } }], aVerifier: [], charge: true, lecturePossible: true };
  test('tous = toi + clients, ids uniques même si deux propriétaires ont le même numéro ; interne = toi seul ; un client = lui seul', () => {
    const tous = M.fusionnerVues(interne, admin, 'tous');
    assert.deepEqual(tous.executions.map((e) => e.id), ['1', 'audrey/1', 'boris/2']);
    assert.deepEqual(M.fusionnerVues(interne, admin, 'interne').executions.map((e) => e.proprietaire), ['interne']);
    assert.deepEqual(M.fusionnerVues(interne, admin, 'boris').executions.map((e) => e.id), ['boris/2']);
    assert.equal(M.fusionnerVues(interne, admin, 'interne-seul').proprietaire, false);
  });
  test('options du filtre et noms', () => {
    const o = M.optionsProprietaires(admin.proprietaires, 3);
    assert.deepEqual(o.map((x) => x.libelle), ['Tous les propriétaires', 'Interne (toi)', 'Audrey Conseil', 'Workflows non reconnus (3)']);
    assert.equal(M.optionsProprietaires([], 0, 2).at(-1).libelle, 'Clients sans le module (2)');
    assert.equal(M.nomProprietaire('interne', []), 'Interne');
    assert.equal(M.nomProprietaire('zoe', []), 'zoe');
  });
  test('bandeau : n8n d\'un client, base des clients illisible, rien à signaler', () => {
    assert.match(M.texteBandeauAdmin({ synchroInterne: { n8nOk: true }, admin, filtre: 'tous' }), /Audrey Conseil : n8n ne répond pas/);
    assert.equal(M.texteBandeauAdmin({ synchroInterne: { n8nOk: true }, admin, filtre: 'interne' }), null);
    assert.match(M.texteBandeauAdmin({ synchroInterne: null, admin: { ...admin, erreur: true }, filtre: 'tous' }), /pas lisibles/);
    assert.match(M.texteBandeauAdmin({ synchroInterne: null, admin: { ...admin, lecturePossible: false, proprietaires: [] }, filtre: 'tous' }), /droit de lecture/);
  });
});
