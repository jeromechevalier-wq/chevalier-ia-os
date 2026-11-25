// Pilotage : lignes pointillées de plafond (repères) et arbre des coûts, côté serveur. Tout en mémoire : faux Postgres, aucun réseau. Vues fictives (v_exemple_…).
// P1 : repères d'un graphique ; P2 : tuile « arbre » (validation, requête, colonnes rendues).
import './_fiche-essai.js'; // chantier 0 : fiche reglages_maison des essais (comptes d'avant), branchée en mémoire sur le serveur
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { validerReglages, ErreurPilotage } from '../functions/src/pilotage/reglages.js';
import { creerServicePilotage } from '../functions/src/pilotage/service.js';
import { creerAppelPilotageLire } from '../functions/src/pilotage/appel.js';
import { creerAssistantPilotage } from '../functions/src/pilotage/assistant.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { ADMINISTRATEURS } from '../js/os/administrateur.js';

const JEROME = ADMINISTRATEURS[0];
const OPTION = JSON.stringify({ dataset: { dimensions: ['cle_nom', 'part_pct'] }, xAxis: { type: 'category' }, yAxis: { type: 'value', max: 120 }, series: [{ type: 'bar', encode: { x: 'cle_nom', y: 'part_pct' } }] });
const refus = (fn, motif) => assert.throws(fn, (e) => e instanceof ErreurPilotage && e.code === 'invalid-argument' && (!motif || motif.test(e.message)));
const graphique = (en = {}) => ({ id: 'g', titre: 'Plafonds', vue: 'v_exemple_cles', option: OPTION, ...en });
const arbre = (en = {}) => ({ id: 'a', type: 'arbre', titre: 'Coûts', vue: 'v_exemple_arbre', grouper: ['a_qui', 'ou', 'module'], mesures: [{ colonne: 'cout_eur', calcul: 'somme', nom: 'cout' }], valeur: { colonne: 'cout', format: 'euros2' }, tri: { colonne: 'cout', sens: 'desc' }, ...en });
const reglage = (tuiles) => ({ groupes: {}, tableau: { titre: 'Essai', tuiles } });

describe('P1 repères : lignes pointillées d\'un graphique', () => {
  test('P1.1 des repères valides sont conservés (valeur, axe, libellé, couleur)', () => {
    const t = validerReglages(reglage([graphique({ reperes: [{ valeur: 80, libelle: '80 %', couleur: 'attention' }, { valeur: 100, axe: 'y', libelle: 'Plafond', couleur: 'mauvais' }] })])).tableau.tuiles[0];
    assert.deepEqual(t.reperes, [{ valeur: 80, libelle: '80 %', couleur: 'attention' }, { valeur: 100, axe: 'y', libelle: 'Plafond', couleur: 'mauvais' }]);
  });
  test('P1.2 refus : pas un nombre, axe inconnu, couleur inconnue, adresse dans le libellé, trop de lignes, liste vide, sur un autre type', () => {
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: '80' }] })])), /nombre/);
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: 80, axe: 'z' }] })])), /axe/);
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: 80, couleur: 'rose' }] })])), /couleur/);
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: 80, libelle: 'https://exemple.test' }] })])), /refusé/);
    refus(() => validerReglages(reglage([graphique({ reperes: Array.from({ length: 7 }, (_, i) => ({ valeur: i })) })])), /1 à 6/);
    refus(() => validerReglages(reglage([graphique({ reperes: [] })])), /1 à 6/);
    refus(() => validerReglages(reglage([{ id: 'c', type: 'chiffre', titre: 'C', vue: 'v_exemple_c', valeur: { colonne: 'total' }, reperes: [{ valeur: 1 }] }])), /graphique/);
  });
  test('P1.2b refus : libellé de plus de 40 caractères, valeur infinie, première série ni barres ni courbe', () => {
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: 80, libelle: 'x'.repeat(41) }] })])), /trop long/);
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: Infinity }] })])), /nombre/);
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: 1 }], option: JSON.stringify({ series: [{ type: 'pie' }] }) })])), /première série/);
    refus(() => validerReglages(reglage([graphique({ reperes: [{ valeur: 1 }], option: JSON.stringify({ xAxis: {} }) })])), /première série/);
    assert.ok(validerReglages(reglage([graphique({ reperes: [{ valeur: 1 }], option: JSON.stringify({ series: [{ type: 'line' }] }) })])));
  });
  test('P1.3 le serveur rend les repères avec la tuile', async () => {
    const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglage([graphique({ reperes: [{ valeur: 100, libelle: 'Plafond' }] })]), version: 1, modifieLe: new Date(0) }] });
    const requetes = [];
    const service = creerServicePilotage({ donnees: () => donnees, connecter: async () => ({ interroger: async (sql) => { requetes.push(sql); return [{ cle_nom: 'cle-a', part_pct: 50 }]; }, fermer: async () => {} }), maintenant: () => 1_000_000 });
    const r = await creerAppelPilotageLire({ service })({ auth: { token: { email: JEROME, email_verified: true } }, data: {} });
    assert.deepEqual(r.tuiles[0].reperes, [{ valeur: 100, libelle: 'Plafond' }]);
  });
});

describe('P2 arbre : à qui, puis où, puis module', () => {
  test('P2.1 un arbre valide garde ses niveaux (l\'ordre de grouper), sa valeur et sa racine', () => {
    const t = validerReglages(reglage([arbre({ racine: 'Tous les coûts' })])).tableau.tuiles[0];
    assert.equal(t.type, 'arbre');
    assert.deepEqual(t.grouper, ['a_qui', 'ou', 'module']);
    assert.deepEqual(t.valeur, { colonne: 'cout', format: 'euros2' });
    assert.equal(t.racine, 'Tous les coûts');
  });
  test('P2.2 refus : un seul niveau, plus de 4, pas de tri, valeur qui n\'est pas une mesure, option, format inconnu', () => {
    refus(() => validerReglages(reglage([arbre({ grouper: ['a_qui'] })])), /2 à 4/);
    refus(() => validerReglages(reglage([arbre({ grouper: ['a', 'b', 'c', 'd', 'e'] })])), /2 à 4/);
    refus(() => validerReglages(reglage([arbre({ tri: undefined })])), /tri/);
    refus(() => validerReglages(reglage([arbre({ valeur: { colonne: 'a_qui' } })])), /mesure/);
    refus(() => validerReglages(reglage([arbre({ option: OPTION })])), /pas d'option/);
    refus(() => validerReglages(reglage([arbre({ valeur: { colonne: 'cout', format: 'bizarre' } })])), /format/);
    refus(() => validerReglages(reglage([arbre({ mesures: undefined })])), /mesures/);
  });
  test('P2.2b refus : racine avec HTML ou adresse, valeur en moyenne/min/max, limite sous 10, croisement', () => {
    refus(() => validerReglages(reglage([arbre({ racine: '<b>Tout</b>' })])), /refusé/);
    refus(() => validerReglages(reglage([arbre({ racine: 'https://exemple.test' })])), /refusé/);
    for (const calcul of ['moyenne', 'min', 'max']) refus(() => validerReglages(reglage([arbre({ mesures: [{ colonne: 'cout_eur', calcul, nom: 'cout' }] })])), /somme/);
    assert.ok(validerReglages(reglage([arbre({ mesures: [{ calcul: 'nombre', nom: 'cout' }] })])));
    refus(() => validerReglages(reglage([arbre({ limite: 5 })])), /au moins 10/);
    assert.ok(validerReglages(reglage([arbre({ limite: 10 })])));
    refus(() => validerReglages(reglage([arbre({ croisement: { filtre: 'f', colonne: 'a_qui' } })])), /croisement/);
  });
  test('P2.3 la requête somme par niveau avec tri et limite de 500 ; le serveur ne rend que les niveaux et la valeur (pas les autres colonnes)', async () => {
    const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglage([arbre()]), version: 1, modifieLe: new Date(0) }] });
    const requetes = [];
    const service = creerServicePilotage({ donnees: () => donnees, connecter: async () => ({ interroger: async (sql) => { requetes.push(sql); return [{ a_qui: 'interne', ou: 'os', module: 'devis', cout: 3.5, secret: 'non' }]; }, fermer: async () => {} }), maintenant: () => 1_000_000 });
    const r = await creerAppelPilotageLire({ service })({ auth: { token: { email: JEROME, email_verified: true } }, data: {} });
    assert.equal(requetes.length, 1);
    assert.match(requetes[0], /^select "?a_qui"?, "?ou"?, "?module"?, sum\(.*\) as "cout" from "v_exemple_arbre" group by .* order by "cout" desc limit 500$/);
    const t = r.tuiles[0];
    assert.equal(t.type, 'arbre');
    assert.deepEqual(t.niveaux, ['a_qui', 'ou', 'module']);
    assert.deepEqual(t.lignes, [{ a_qui: 'interne', ou: 'os', module: 'devis', cout: 3.5 }]);
    assert.equal(t.limite, 500);
    assert.equal(t.option, undefined);
  });
});

describe('P3 assistant : un arbre et un graphique à repères sont lus sans plantage', () => {
  test('P3.1 l\'arbre est rendu (type, lignes lues) ; les repères et l\'option ne sont pas renvoyés', async () => {
    const reglages = reglage([arbre({ limite: 10 }), graphique({ reperes: [{ valeur: 100, libelle: 'Ligne-maison' }] })]);
    const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglages, version: 1, modifieLe: new Date(0) }] });
    const dix = Array.from({ length: 10 }, (_, i) => ({ a_qui: `q${i}`, ou: 'os', module: 'devis', cout: i + 1, secret: 'non' }));
    const service = creerServicePilotage({ donnees: () => donnees, maintenant: () => 1_000_000,
      connecter: async () => ({ interroger: async (sql) => (sql.includes('v_exemple_arbre') ? dix : [{ cle_nom: 'a', part_pct: 50 }]), fermer: async () => {} }) });
    const r = await creerAssistantPilotage({ service }).lire({ email: JEROME });
    const a = r.tuiles.find((t) => t.id === 'a');
    assert.equal(a.type, 'arbre');
    assert.equal(a.lignes.length, 10);
    assert.equal(a.lignes[0].secret, undefined); // seules les colonnes déclarées sortent
    const g = r.tuiles.find((t) => t.id === 'g');
    assert.deepEqual(g.lignes, [{ cle_nom: 'a', part_pct: 50 }]);
    const json = JSON.stringify(r);
    for (const interdit of ['reperes', 'Ligne-maison', 'option', 'v_exemple_arbre', 'markLine']) assert.ok(!json.includes(interdit), interdit);
  });
});
