// Écran « À valider » (module Automatisations) : règles d'affichage pures (tri, alerte des 30 minutes, liens) et garde-fous de sécurité du code de l'écran.
// Sans réseau ni navigateur ; le parcours à l'écran est dans tests/e2e/automatisations-a-valider.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from '../js/modules/automatisations/logique.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const MIN = 60000;
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const prop = (id, extra = {}) => ({ id, etat: 'a_valider', creeLe: new Date(NOW - 5 * MIN), expireLe: new Date(NOW + 20 * 24 * 60 * MIN), ...extra });

describe('À valider : tri de la file', () => {
  test('les propositions non périmées passent devant, les plus anciennes d’abord ; les autres états vont dans les traitements récents, le plus récent d’abord', () => {
    const liste = [
      prop('perimee', { expireLe: new Date(NOW - MIN), creeLe: new Date(NOW - 99 * MIN) }),
      prop('recente', { creeLe: new Date(NOW - MIN) }),
      prop('ancienne', { creeLe: new Date(NOW - 50 * MIN) }),
      prop('refusee', { etat: 'refusee', creeLe: new Date(NOW - 100 * MIN), refuseeLe: new Date(NOW - 30 * MIN) }),
      prop('validee', { etat: 'validee', creeLe: new Date(NOW - 100 * MIN), valideeLe: new Date(NOW - 10 * MIN) }),
      prop('echec', { etat: 'echec', creeLe: new Date(NOW - 100 * MIN), valideeLe: new Date(NOW - 20 * MIN) }),
    ];
    const r = L.separerPropositions(liste, NOW);
    assert.deepEqual(r.aValider.map((p) => p.id), ['ancienne', 'recente', 'perimee']);
    assert.deepEqual(r.recentes.map((p) => p.id), ['validee', 'echec', 'refusee']);
  });
  test('une entrée sans identifiant ou qui n’est pas un objet est ignorée', () => {
    const r = L.separerPropositions([null, 'x', { etat: 'a_valider' }, prop('ok')], NOW);
    assert.deepEqual(r.aValider.map((p) => p.id), ['ok']);
  });
  test('liste vide ou absente : deux listes vides', () => {
    assert.deepEqual(L.separerPropositions([], NOW), { aValider: [], recentes: [] });
    assert.deepEqual(L.separerPropositions(undefined, NOW), { aValider: [], recentes: [] });
  });
});

describe('À valider : validée mais pas appliquée depuis plus de 30 minutes', () => {
  test('compte depuis valideeLe, ou depuis relanceeLe quand elle existe', () => {
    assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat: 'validee', valideeLe: new Date(NOW - 31 * MIN) }, NOW), true);
    assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat: 'validee', valideeLe: new Date(NOW - 30 * MIN) }, NOW), false);
    assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat: 'validee', valideeLe: new Date(NOW - 90 * MIN), relanceeLe: new Date(NOW - 5 * MIN) }, NOW), false);
    assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat: 'validee', valideeLe: new Date(NOW - 5 * MIN), relanceeLe: new Date(NOW - 45 * MIN) }, NOW), true);
  });
  test('seulement l’état « validee » ; une date illisible ne déclenche rien', () => {
    for (const etat of ['a_valider', 'appliquee', 'refusee', 'echec']) assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat, valideeLe: new Date(NOW - 99 * MIN) }, NOW), false, etat);
    assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat: 'validee' }, NOW), false);
    assert.equal(L.nonAppliqueeDepuisTropLongtemps(null, NOW), false);
  });
  test('accepte les horodatages Firestore (toMillis)', () => {
    assert.equal(L.nonAppliqueeDepuisTropLongtemps({ etat: 'validee', valideeLe: { toMillis: () => NOW - 40 * MIN } }, NOW), true);
  });
});

describe('À valider : liens et numéros d’exécution', () => {
  test('seule une adresse https est cliquable', () => {
    assert.equal(L.lienSur('https://exemple.test/a?b=1'), 'https://exemple.test/a?b=1');
    for (const mauvais of ['http://exemple.test', 'javascript:alert(1)', 'data:text/html,x', 'ftp://exemple.test', '//exemple.test', 'exemple.test', '', null, undefined, 42]) {
      assert.equal(L.lienSur(mauvais), null, String(mauvais));
    }
  });
  test('les numéros d’exécution présents sont dits en mots, les absents sont omis', () => {
    assert.deepEqual(L.executionsAffichees({ executions: { proposer: '12', appliquer: null, refuser: null } }), ['proposée n° 12']);
    assert.deepEqual(L.executionsAffichees({ executions: { proposer: '12', appliquer: 13, refuser: '14' } }), ['proposée n° 12', 'appliquée n° 13', 'refusée n° 14']);
    assert.deepEqual(L.executionsAffichees({}), []);
    assert.deepEqual(L.executionsAffichees(null), []);
  });
});

describe('À valider : garde-fous du code de l’écran', () => {
  const ecran = lire('js/modules/automatisations/a-valider.js');
  const donnees = lire('js/modules/automatisations/donnees.js');
  test('tout texte venu d’une proposition passe par h() : ni innerHTML, ni outerHTML, ni insertAdjacentHTML, ni document.write dans l’écran', () => {
    assert.doesNotMatch(ecran, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
  test('l’écran n’écrit rien dans Firestore et n’appelle pas la copie n8n', () => {
    assert.doesNotMatch(ecran, /setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction|firebase-firestore/);
    assert.doesNotMatch(ecran, /rafraichir|automatisationsRafraichir|automatisationsAdmin/);
  });
  test('l’écoute en direct n’a ni orderBy, ni limit, ni where (le tri se fait côté client) et vise la collection du préfixe du client', () => {
    const debut = donnees.indexOf('export function ecouterPropositions');
    const bloc = donnees.slice(debut, donnees.indexOf('export async function decider'));
    assert.doesNotMatch(bloc, /orderBy|limit\(|where\(/);
    assert.match(bloc, /collection\(db, chemin\('automatisations_propositions'\)\)/);
  });
  test('la décision appelle la fonction automatisationsDecider avec seulement id, decision, champs et raison (jamais l’e-mail du décideur)', () => {
    const debut = donnees.indexOf('export async function decider');
    const bloc = donnees.slice(debut);
    assert.match(bloc, /httpsCallable\(fonctions\(\), 'automatisationsDecider'\)\(corps\)/);
    assert.match(bloc, /const corps = \{ id, decision \}/);
    assert.doesNotMatch(bloc, /email|valideePar/i);
    // Le SDK Firebase ajoute « [400] » au message du serveur : l'écran le retire pour afficher exactement « Déjà décidée par … ».
    assert.match(bloc, /replace\(\/\\s\*\\\[\\d\{3\}\\\]\\s\*\$\/, ''\)/);
  });
  test('la case « Mise à jour automatique » de l’Historique n’est pas branchée sur cet écran', () => {
    assert.doesNotMatch(ecran, /CLE_AUTO|autom-auto|doitRafraichirAuto/);
  });
});
