// Relances à faire (js/modules/devis/relances.js) : règle pure + délai réglable. Aucun navigateur. Le nom d'un test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { devisARelancer, dernierContact, derniereRelance } from '../js/modules/devis/relances.js';
import { reglagesDevis, validerReglagesDevis } from '../js/modules/devis/articles.js';
import { DELAI_RELANCE_DEFAUT } from '../js/modules/devis/logique.js';

const MAINTENANT = Date.parse('2026-11-06T10:00:00Z');
const AUJOURDHUI = '2026-11-06';
const ilYA = (jours) => new Date(MAINTENANT - jours * 86_400_000);
const devis = (id, plus = {}) => ({ id, statut: 'envoye', totalHt: 100, expireLe: '2027-01-01', envoyeLe: ilYA(12), envois: [], ...plus });
const regle = (liste, plus = {}) => devisARelancer(liste, { aujourdhui: AUJOURDHUI, maintenant: MAINTENANT, ...plus });

describe('5 réglage du délai de relance', () => {
  test('5 le délai par défaut est 10 ; il tient compte de la durée de validité ; une valeur illisible retombe sur le défaut', () => {
    assert.equal(DELAI_RELANCE_DEFAUT, 10);
    assert.equal(reglagesDevis({}).delaiRelanceJours, 10);
    assert.equal(reglagesDevis({ dureeValiditeJours: 5 }).delaiRelanceJours, 4);
    assert.equal(reglagesDevis({ dureeValiditeJours: 1 }).delaiRelanceJours, 1);
    assert.equal(reglagesDevis({ delaiRelanceJours: 'x' }).delaiRelanceJours, 10);
    assert.equal(reglagesDevis({ delaiRelanceJours: 15 }).delaiRelanceJours, 15);
    assert.equal(reglagesDevis({ delaiRelanceJours: 90 }).delaiRelanceJours, 10, 'pas plus court que la validité (90) : défaut');
  });
});

describe('6 validation du délai de relance', () => {
  test('6 0, 1,5, « abc » et 3651 sont refusés avec la phrase du nombre entier de jours', () => {
    for (const mauvais of [0, '1,5', 'abc', 3651, '']) {
      const r = validerReglagesDevis({ delaiRelanceJours: mauvais });
      assert.equal(r.reglages, null, String(mauvais));
      assert.equal(r.erreurs.delaiRelanceJours, 'Le délai de relance est un nombre entier de jours, entre 1 et 3650 (exemple : 10).', String(mauvais));
    }
  });
  test('6 un délai égal ou supérieur à la durée de validité est refusé', () => {
    const r = validerReglagesDevis({ dureeValiditeJours: 90, delaiRelanceJours: 90 });
    assert.equal(r.erreurs.delaiRelanceJours, 'Le délai de relance doit être plus court que la durée de validité du devis (ici 90 jours).');
  });
  test('6 15 est accepté et recopié ; il se relit à l’identique', () => {
    const r = validerReglagesDevis({ delaiRelanceJours: '15' });
    assert.deepEqual(r.erreurs, {});
    assert.equal(r.reglages.delaiRelanceJours, 15);
    assert.deepEqual(reglagesDevis(r.reglages), r.reglages);
  });
});

describe('7 devisARelancer', () => {
  test('7 envoyé il y a 12 jours (délai 10) : listé avec joursDepuis = 12 ; il y a 9 jours : non', () => {
    const r = regle([devis('a'), devis('b', { envoyeLe: ilYA(9) })]);
    assert.deepEqual(r.map((x) => x.devis.id), ['a']);
    assert.equal(r[0].joursDepuis, 12);
    assert.equal(r[0].derniereRelanceMs, null);
    assert.equal(regle([devis('c', { envoyeLe: ilYA(10) })]).length, 1, '10 jours pile : listé (écart en ms >= délai)');
  });
  test('7 brouillon, en attente d’envoi, accepté, refusé, remplacé, archivé et expiré ne sont pas listés', () => {
    const autres = ['brouillon', 'en_attente_envoi', 'accepte', 'refuse', 'remplace'].map((statut) => devis(statut, { statut }));
    assert.deepEqual(regle([...autres, devis('arch', { archive: true }), devis('exp', { expireLe: '2026-11-01' })]), []);
  });
  test('7 un renvoi il y a 3 jours remet le compteur à zéro ; une ligne « relance » il y a 11 jours est listée avec sa date', () => {
    assert.deepEqual(regle([devis('r', { envois: [{ date: ilYA(3), destinataires: ['b@x.fr'], copie: [] }] })]), []);
    const r = regle([devis('l', { envois: [{ date: ilYA(11), destinataires: ['b@x.fr'], copie: [], origine: 'relance' }] })]);
    assert.equal(r.length, 1);
    assert.equal(r[0].derniereRelanceMs, ilYA(11).getTime());
    assert.equal(r[0].joursDepuis, 11);
  });
  test('7 tri du contact le plus ancien au plus récent ; dates illisibles ignorées ; liste vide ou absente : []', () => {
    const r = regle([devis('recent', { envoyeLe: ilYA(11) }), devis('ancien', { envoyeLe: ilYA(40) }), devis('mauvais', { envoyeLe: 'n’importe quoi', envois: [null, { date: 'x' }] }), devis('sans', { envoyeLe: undefined })]);
    assert.deepEqual(r.map((x) => x.devis.id), ['ancien', 'recent']);
    assert.deepEqual(regle([]), []);
    assert.deepEqual(regle(undefined), []);
  });
  test('7 dates en ISO, { seconds } et { toMillis } acceptées ; les devis de test restent listés ; délai réglé à 15 jours', () => {
    const iso = devis('iso', { envoyeLe: ilYA(12).toISOString() });
    const sec = devis('sec', { envoyeLe: { seconds: Math.floor(ilYA(12).getTime() / 1000) } });
    const test_ = devis('test', { test: true });
    assert.equal(regle([iso, sec, test_]).length, 3);
    assert.equal(regle([iso], { delaiJours: 15 }).length, 0);
    assert.equal(dernierContact(devis('x', { envoyeLe: ilYA(12), envois: [{ date: ilYA(2) }] })), ilYA(2).getTime());
    assert.equal(derniereRelance(devis('y')), null);
  });
});
