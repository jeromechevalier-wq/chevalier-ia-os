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
  test('liste vide ou absente : trois listes vides', () => {
    assert.deepEqual(L.separerPropositions([], NOW), { enPreparation: [], aValider: [], recentes: [] });
    assert.deepEqual(L.separerPropositions(undefined, NOW), { enPreparation: [], aValider: [], recentes: [] });
  });
});

describe('À valider : la zone « En préparation » et la chaîne d’étapes', () => {
  test('les lignes en préparation forment leur propre liste (la plus ancienne d’abord) ; les abandonnées vont dans les traitements récents', () => {
    const liste = [
      prop('neuve', { etat: 'en_preparation', creeLe: new Date(NOW - MIN) }),
      prop('vieille', { etat: 'en_preparation', creeLe: new Date(NOW - 9 * MIN) }),
      prop('abandonnee', { etat: 'abandonnee', creeLe: new Date(NOW - 60 * MIN) }),
      prop('ok'),
    ];
    const r = L.separerPropositions(liste, NOW);
    assert.deepEqual(r.enPreparation.map((p) => p.id), ['vieille', 'neuve']);
    assert.deepEqual(r.aValider.map((p) => p.id), ['ok']);
    assert.deepEqual(r.recentes.map((p) => p.id), ['abandonnee']);
  });
  test('une étape récente remonte la ligne dans les traitements récents', () => {
    const a = prop('a', { etat: 'abandonnee', creeLe: new Date(NOW - 60 * MIN) });
    const b = prop('b', { etat: 'echec', creeLe: new Date(NOW - 90 * MIN), etapes: [{ cle: 'x', libelle: 'X', etat: 'fait', le: new Date(NOW - MIN) }] });
    assert.deepEqual(L.separerPropositions([a, b], NOW).recentes.map((p) => p.id), ['b', 'a']);
  });
  test('etapesAffichees garde l’ordre du plan, écarte les entrées mal formées et ramène un état inconnu à « à venir »', () => {
    const r = L.etapesAffichees({ etapes: [{ cle: 'a', libelle: 'Lire', etat: 'fait', le: new Date(NOW) }, null, { libelle: 'sans clé' }, { cle: 'b', libelle: 'Écrire', etat: 'bizarre' }, { cle: 'c', etat: 'en_cours' }] });
    assert.deepEqual(r.map((e) => [e.cle, e.libelle, e.etat]), [['a', 'Lire', 'fait'], ['b', 'Écrire', 'a_venir'], ['c', 'c', 'en_cours']]);
    assert.deepEqual(L.etapesAffichees({}), []);
    assert.deepEqual(L.etapesAffichees(null), []);
  });
  test('chaque état d’étape a un mot (la couleur ne suffit pas) et la chaîne s’ouvre quand une étape tourne ou échoue', () => {
    for (const etat of ['a_venir', 'en_cours', 'fait', 'echec', 'ignoree']) assert.ok(L.MOT_ETAT_ETAPE[etat], etat);
    assert.equal(L.etapesAOuvrir([{ etat: 'fait' }, { etat: 'en_cours' }]), true);
    assert.equal(L.etapesAOuvrir([{ etat: 'fait' }, { etat: 'echec' }]), true);
    assert.equal(L.etapesAOuvrir([{ etat: 'fait' }, { etat: 'a_venir' }, { etat: 'ignoree' }]), false);
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
  test('le bouton « Classer sans suite » est gris (jamais jaune), n’existe que si la ligne est bloquée et envoie la décision « abandonner »', () => {
    assert.match(ecran, /'Classer sans suite'/);
    assert.match(ecran, /decider\(p, 'abandonner'\)/);
    assert.match(ecran, /if \(bloquee\) \{\s*boutons\.push\(h\('button', \{ type: 'button', class: 'bouton',/);
    assert.match(ecran, /Ne l’arrête pas dans n8n : ferme seulement cette ligne\./);
  });
  test('la chaîne a la structure figée (ol.etape-chaine > li.etape-noeud[data-cle][data-etat] > i.etape-point + span.etape-libelle) et le CSS respecte prefers-reduced-motion', () => {
    assert.match(ecran, /'etape-chaine'/);
    assert.match(ecran, /'etape-noeud'/);
    assert.match(ecran, /'etape-point'/);
    assert.match(ecran, /'etape-libelle'/);
    const css = lire('css/automatisations.css');
    const reduit = css.slice(css.indexOf('prefers-reduced-motion'));
    assert.match(reduit, /\.etape-noeud\[data-etat='en_cours'\] \.etape-point \{ animation: none/);
  });
  test('la case « Mise à jour automatique » de l’Historique n’est pas branchée sur cet écran', () => {
    assert.doesNotMatch(ecran, /CLE_AUTO|autom-auto|doitRafraichirAuto/);
  });
});
