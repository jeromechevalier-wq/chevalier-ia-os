// Portail devis seul, étape 2a : la règle pure des trois groupes de l'écran « Relances » (relances.js), le menu du portail et l'envoi de l'origine. Aucun navigateur.
// Les numéros des critères continuent ceux de portail-devis.test.js (1 à 18) : ici 19 à 28.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { groupesDeRelance, libelleRelance, nombreDeRelances } from '../js/modules/devis/relances.js';
import { PORTAILS } from '../js/os/portail.js';
import { blocsDuMenu } from '../js/os/registre.js';

const JOUR = 86_400_000;
const MAINTENANT = Date.parse('2026-11-07T10:00:00Z');
const AUJOURDHUI = '2026-11-07';
const il = (jours) => new Date(MAINTENANT - jours * JOUR);
const envoye = (id, jours, plus = {}) => ({ id, statut: 'envoye', archive: false, expireLe: '2027-01-01', envoyeLe: il(jours), envois: [{ date: il(jours) }], ...plus });
const groupes = (liste, plus = {}) => groupesDeRelance(liste, { aujourdhui: AUJOURDHUI, maintenant: MAINTENANT, ...plus });
const ids = (l) => l.map((x) => x.devis.id);

describe('19 menu du portail', () => {
  test('19 le portail met Relances au menu ; chez Jérôme (sans option) le menu complet ne l\'a pas', () => {
    assert.deepEqual([...PORTAILS['portail-devis'].menu], ['devis/liste', 'devis/relances']);
    const chemins = (opt) => blocsDuMenu(['devis'], opt).flatMap((b) => b.sections.flat()).map((e) => e.chemin);
    assert.deepEqual(chemins(), ['devis/liste']);
    assert.deepEqual(chemins({ visibles: PORTAILS['portail-devis'].menu }), ['devis/liste', 'devis/relances']);
  });
});

describe('20 groupesDeRelance', () => {
  test('20 envoyé il y a 12 j -> à relancer ; relancé il y a 3 j -> déjà relancés ; envoyé il y a 4 j -> à venir', () => {
    const g = groupes([
      envoye('a12', 12),
      envoye('r3', 12, { envois: [{ date: il(12) }, { date: il(3), origine: 'relance' }] }),
      envoye('v4', 4),
    ]);
    assert.deepEqual(ids(g.aTraiter), ['a12']);
    assert.deepEqual(ids(g.dejaRelances), ['r3']);
    assert.deepEqual(ids(g.aVenir), ['v4']);
    assert.equal(g.dejaRelances[0].nbRelances, 1);
    assert.equal(g.dejaRelances[0].dansJours, 7); // délai 10 j - 3 j
    assert.equal(g.aVenir[0].dansJours, 6);
  });
  test('20 bornes à la milliseconde : 10 j pile = à relancer, 1 ms de moins = à venir', () => {
    const g = groupes([envoye('pile', 10), envoye('presque', 10, { envoyeLe: new Date(MAINTENANT - 10 * JOUR + 1), envois: [{ date: new Date(MAINTENANT - 10 * JOUR + 1) }] })]);
    assert.deepEqual(ids(g.aTraiter), ['pile']);
    assert.deepEqual(ids(g.aVenir), ['presque']);
    assert.equal(g.aVenir[0].dansJours, 1);
  });
  test('20 un devis de test, archivé, expiré ou brouillon n\'est dans aucun groupe', () => {
    const g = groupes([envoye('t', 12, { test: true }), envoye('t2', 4, { test: true }), envoye('t3', 3, { test: true, envois: [{ date: il(3), origine: 'relance' }] }),
      envoye('ar', 4, { archive: true }), envoye('ex', 4, { expireLe: '2026-11-01' }), { id: 'b', statut: 'brouillon' }]);
    assert.deepEqual([g.aTraiter, g.dejaRelances, g.aVenir].map((l) => l.length), [0, 0, 0]);
  });
  test('20 les trois groupes sont disjoints et le délai du réglage s\'applique', () => {
    const liste = [envoye('a', 12), envoye('b', 6), envoye('c', 2, { envois: [{ date: il(12) }, { date: il(2), origine: 'relance' }] })];
    const g = groupes(liste);
    const tous = [...ids(g.aTraiter), ...ids(g.dejaRelances), ...ids(g.aVenir)];
    assert.equal(new Set(tous).size, tous.length);
    assert.deepEqual(ids(groupes(liste, { delaiJours: 5 }).aTraiter), ['a', 'b']);
  });
  test('20 compteur : 1re relance, 2e relance, 3e relance', () => {
    const d = envoye('x', 12, { envois: [{ date: il(12) }, { date: il(6), origine: 'relance' }, { date: il(1), origine: 'relance' }] });
    assert.equal(nombreDeRelances(d), 2);
    assert.deepEqual([1, 2, 3].map(libelleRelance), ['1re relance', '2e relance', '3e relance']);
  });
});

describe('28 envoi de l\'origine', () => {
  test('28 enregistrerEnvoi ne transmet origine que lorsqu\'elle est fournie ; Relancé l\'envoie', () => {
    const donnees = readFileSync(new URL('../js/modules/devis/donnees.js', import.meta.url), 'utf8');
    assert.match(donnees, /enregistrerEnvoi = \(devisId, \{ destinataires, copie = \[\], origine \}\) => appeler\('enregistrerEnvoi', \{ devisId, destinataires, copie, \.\.\.\(origine \? \{ origine \} : \{\}\) \}\)/);
    const actions = readFileSync(new URL('../js/modules/devis/actions-devis.js', import.meta.url), 'utf8');
    assert.match(actions, /origine: 'relance'/);
  });
});
