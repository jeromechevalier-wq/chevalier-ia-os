// 24/10/2026 : après un « Fait », la fenêtre « Plus aucune activité prévue » n'apparaît que s'il ne reste rien à faire sur l'affaire ou le projet.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { doitProposerProchaineActivite as doit } from '../js/modules/crm/logique.js';

const act = (id, extra = {}) => ({ id, fait: false, ...extra });
const vivante = { ficheActive: true };

describe('Prochaine activité après un « Fait »', () => {
  test('dernière activité de l’affaire : on propose', () => {
    const a = act('1', { affaireId: 'x' });
    assert.equal(doit(a, [{ ...a, fait: true }], vivante), true);
  });
  test('une autre activité reste sur l’affaire : on ne propose rien', () => {
    const a = act('1', { affaireId: 'x' });
    assert.equal(doit(a, [a, act('2', { affaireId: 'x' })], vivante), false);
  });
  test('une activité restante sur une autre affaire ou déjà faite ne compte pas', () => {
    const a = act('1', { affaireId: 'x' });
    assert.equal(doit(a, [a, act('2', { affaireId: 'y' }), act('3', { affaireId: 'x', fait: true })], vivante), true);
  });
  test('projet : une autre activité ou une tâche non faite suffit pour ne rien proposer', () => {
    const a = act('1', { projetId: 'p', affaireId: 'x' });
    assert.equal(doit(a, [a], vivante), true);
    assert.equal(doit(a, [a, act('2', { projetId: 'p' })], vivante), false);
    assert.equal(doit(a, [a], { ...vivante, tachesRestantes: 1 }), false);
  });
  test('affaire gagnée ou perdue, projet terminé ou archivé : rien à proposer', () => {
    assert.equal(doit(act('1', { affaireId: 'x' }), [], { ficheActive: false }), false);
  });
  test('activité d’une personne ou d’une organisation seulement : rien à proposer', () => {
    assert.equal(doit(act('1', { personneId: 'p1' }), [], vivante), false);
    assert.equal(doit(act('1', { organisationId: 'o1' }), [], vivante), false);
  });
});
