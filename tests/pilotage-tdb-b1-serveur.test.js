// Tableau de bord, partie B1 (serveur des filtres) : validation du réglage (filtres, onglets, tuiles, croisement, agrégation), SQL paramétré EXACT, raccourcis de période (Europe/Paris),
// service (portée par onglet, droits, défauts, cache, listes de valeurs) et appel. Tout en mémoire : faux Postgres, aucun réseau. Noms de vues, de colonnes et adresses fictifs.
// Le nom de chaque test commence par B1 puis le numéro du point.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { validerReglages, valeurFiltre, construireRequete, construireSql, construireRequeteValeurs, ErreurPilotage } from '../functions/src/pilotage/reglages.js';
import { creerServicePilotage, filtrerOnglets } from '../functions/src/pilotage/service.js';
import { creerAppelPilotageLire, enErreurPilotage } from '../functions/src/pilotage/appel.js';
import { resoudrePeriode, resoudreFiltres, clausesDeTuile, dateParis } from '../functions/src/pilotage/filtres.js';
import { creerConnecteurPostgres } from '../functions/src/pilotage/postgres.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { ADMINISTRATEURS } from '../functions/partage/administrateur.js';
import { COMPTES_AUTORISES } from '../functions/src/veille/appel.js';

const JEROME = ADMINISTRATEURS[0];
const BOT = COMPTES_AUTORISES.find((c) => !ADMINISTRATEURS.includes(c));
const OPTION = JSON.stringify({ xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar' }] });
const refus = (fn, motif) => assert.throws(fn, (e) => e instanceof ErreurPilotage && e.code === 'invalid-argument' && (!motif || motif.test(e.message)), `attendu : refus ${motif ?? ''}`);
const T = Date.UTC(2026, 2, 31, 10, 0, 0); // 31 mars 2026, 12 h à Paris

const FILTRES = () => [
  { id: 'periode', libelle: 'Période', type: 'periode', defaut: { raccourci: '12_mois' } },
  { id: 'lieu', libelle: 'Lieu', type: 'liste', multiple: true, valeurs: { vue: 'v_exemple_lieux', colonne: 'nom' } },
  { id: 'etat', libelle: 'État', type: 'liste', choix: [{ valeur: 'ouvert', libelle: 'Ouvert' }, { valeur: 'clos', libelle: 'Clos' }] },
  { id: 'montant', libelle: 'Montant', type: 'intervalle' },
  { id: 'alerte', libelle: 'Avec alerte', type: 'oui_non' },
];
const ventes = (en = {}) => ({ id: 'ventes', titre: 'Ventes', vue: 'v_exemple_ventes', tri: { colonne: 'date_piece', sens: 'asc' }, option: OPTION, filtres: { periode: { colonne: 'date_piece' }, lieu: { colonne: 'lieu' } }, croisement: { filtre: 'lieu', colonne: 'lieu' }, ...en });
const budget = (en = {}) => ({ id: 'budget', type: 'chiffre', titre: 'Budget', vue: 'v_exemple_budget', valeur: { colonne: 'total' }, mentionNonFiltre: 'Non filtré par la période.', filtres: { lieu: { colonne: 'lieu' } }, ...en });
const classement = (en = {}) => ({
  id: 'classe', type: 'tableau', titre: 'Classement', vue: 'v_exemple_detail', grouper: ['lieu'], mesures: [{ colonne: 'montant', calcul: 'somme', nom: 'total' }, { calcul: 'nombre', nom: 'lignes' }],
  tri: { colonne: 'total', sens: 'desc' }, limite: 10, colonnes: [{ colonne: 'lieu', titre: 'Lieu' }, { colonne: 'total', titre: 'Total', format: 'euros0' }],
  filtres: { periode: { colonne: 'date_piece' }, etat: { colonne: 'etat' }, montant: { colonne: 'montant' }, alerte: { colonne: 'alerte' } }, ...en,
});
const reglage = (tuiles = [ventes(), budget(), classement()], onglets, filtres = FILTRES(), groupes = {}) => ({
  groupes,
  tableau: { titre: 'Tableau test', filtres, tuiles, onglets: onglets ?? [{ id: 'suivi', titre: 'Suivi', filtres: filtres.map((f) => f.id).filter((id) => tuiles.some((t) => Object.hasOwn(t.filtres ?? {}, id))), tuiles: tuiles.map((t) => t.id) }] },
});

describe('B1.1 le réglage sans filtres reste valide', () => {
  test('B1.1.1 aucune clé « filtres » ajoutée, y compris à la relecture tolérante', () => {
    const r = { groupes: {}, tableau: { titre: 'T', tuiles: [{ id: 'a', titre: 'A', vue: 'v_exemple_a', option: OPTION }] } };
    assert.equal(validerReglages(r).tableau.filtres, undefined);
    assert.equal(validerReglages(r, { tolerant: true }).tableau.filtres, undefined);
    assert.equal(validerReglages(r).tableau.tuiles[0].filtres, undefined);
  });
  test('B1.1.2 un réglage avec filtres est normalisé et stable (une seconde validation donne la même chose)', () => {
    const v = validerReglages(reglage());
    assert.deepEqual(v.tableau.filtres.map((f) => f.id), ['periode', 'lieu', 'etat', 'montant', 'alerte']);
    assert.deepEqual(v.tableau.onglets[0].filtres, ['periode', 'lieu', 'etat', 'montant', 'alerte']);
    assert.deepEqual(v.tableau.tuiles[0].filtres, { periode: { colonne: 'date_piece' }, lieu: { colonne: 'lieu' } });
    assert.deepEqual(v.tableau.tuiles[0].croisement, { filtre: 'lieu', colonne: 'lieu' });
    assert.equal(v.tableau.tuiles[1].mentionNonFiltre, 'Non filtré par la période.');
    assert.deepEqual(validerReglages(v, { tolerant: true }), v);
  });
});

describe('B1.2 validation des filtres déclarés', () => {
  test('B1.2.1 identifiant en double, type inconnu, libellé vide, clé interdite, trop de filtres : refusés', () => {
    const f = (i) => ({ id: `f${i}`, libelle: `F${i}`, type: 'oui_non' });
    refus(() => validerReglages(reglage([ventes({ filtres: undefined, croisement: undefined })], undefined, [f(1), f(1)])), /déjà pris/);
    refus(() => validerReglages(reglage([], undefined, [{ id: 'a', libelle: 'A', type: 'texte' }])), /type inconnu/);
    refus(() => validerReglages(reglage([], undefined, [{ id: 'a', libelle: ' ', type: 'oui_non' }])), /obligatoire/);
    refus(() => validerReglages(reglage([], undefined, [{ id: '__proto__', libelle: 'A', type: 'oui_non' }])), /identifiant/);
    refus(() => validerReglages(reglage([], undefined, Array.from({ length: 21 }, (_, i) => f(i)))), /Trop de filtres/);
  });
  test('B1.2.2 une liste a « valeurs » OU « choix » (ni les deux, ni aucun) ; vue en v_, colonne et valeurs bornées ; « multiple » seulement pour une liste', () => {
    const base = { id: 'l', libelle: 'L', type: 'liste' };
    const essai = (f) => () => validerReglages(reglage([], undefined, [f]));
    refus(essai(base), /soit « valeurs »/);
    refus(essai({ ...base, valeurs: { vue: 'v_exemple_a', colonne: 'c' }, choix: [{ valeur: 'x', libelle: 'X' }] }), /soit « valeurs »/);
    refus(essai({ ...base, valeurs: { vue: 'table_a', colonne: 'c' } }), /commencer par « v_ »/);
    refus(essai({ ...base, valeurs: { vue: 'v_exemple_a', colonne: 'C; drop' } }), /nom de colonne/);
    refus(essai({ ...base, choix: [] }), /1 à 50/);
    refus(essai({ ...base, choix: [{ valeur: 'x'.repeat(201), libelle: 'X' }] }), /court texte/);
    refus(essai({ id: 'p', libelle: 'P', type: 'periode', multiple: true }), /ne vaut que pour une liste/);
    refus(essai({ id: 'p', libelle: 'P', type: 'oui_non', valeurs: { vue: 'v_exemple_a', colonne: 'c' } }), /ne valent que pour une liste/);
  });
  test('B1.2.3 le « defaut » doit convenir au type ; un onglet ou une tuile ne cite que des filtres qui existent', () => {
    for (const [type, defaut] of [['periode', { raccourci: 'hier' }], ['periode', 'tout'], ['oui_non', 'oui'], ['intervalle', { min: 5, max: 1 }], ['liste', 'a']]) {
      refus(() => validerReglages(reglage([], undefined, [{ id: 'f', libelle: 'F', type, defaut, ...(type === 'liste' ? { choix: [{ valeur: 'a', libelle: 'A' }] } : {}) }])), /valeur par défaut/);
    }
    const r = reglage(); r.tableau.onglets[0].filtres.push('fantome'); refus(() => validerReglages(r), /n'existe pas/);
    const s = reglage(); s.tableau.tuiles[0].filtres.fantome = { colonne: 'x' }; refus(() => validerReglages(s), /n'existe pas/);
    const u = reglage(); u.tableau.tuiles[0].filtres.lieu = { colonne: 'Lieu; --' }; refus(() => validerReglages(u), /nom de colonne/);
    const w = reglage(); w.tableau.tuiles[0].filtres = { ['__proto__']: { colonne: 'x' } }; w.tableau.tuiles[0].filtres = JSON.parse('{"__proto__":{"colonne":"x"}}'); refus(() => validerReglages(w), /n'existe pas/);
  });
  test('B1.2.4 croisement : filtre de type liste affiché dans l\'onglet de la tuile ; colonne sûre ; un texte ne porte ni filtres ni croisement', () => {
    const a = reglage(); a.tableau.tuiles[0].croisement = { filtre: 'periode', colonne: 'lieu' }; refus(() => validerReglages(a), /type liste/);
    const b = reglage(); b.tableau.onglets[0].filtres = ['periode']; refus(() => validerReglages(b), /liste « filtres » de l'onglet/);
    const c = reglage(); c.tableau.tuiles[0].croisement = { filtre: 'lieu', colonne: 'Lieu' }; refus(() => validerReglages(c), /nom de colonne/);
    const d = reglage([{ id: 'x', type: 'texte', titre: 'X', texte: 'Bonjour', filtres: { lieu: { colonne: 'lieu' } } }]); refus(() => validerReglages(d), /ne lit rien en base/);
  });
  test('B1.2.5 mentionNonFiltre passe par les motifs interdits (adresse, « < »)', () => {
    refus(() => validerReglages(reglage([ventes({ mentionNonFiltre: '<b>x</b>' })])), /refusé/);
    refus(() => validerReglages(reglage([ventes({ mentionNonFiltre: 'x'.repeat(121) })])), /trop long/);
  });
  test('B1.2.6 sans onglets, des filtres sont permis : tous sont affichés (le croisement n\'a alors pas d\'onglet à vérifier)', () => {
    const r = { groupes: {}, tableau: { titre: 'T', filtres: FILTRES(), tuiles: [ventes()] } };
    assert.equal(validerReglages(r).tableau.filtres.length, 5);
  });
});

describe('B1.3 valeurs de filtre reçues (validation par type)', () => {
  const [periode, lieu, , montant, alerte] = validerReglages(reglage()).tableau.filtres;
  const etat = validerReglages(reglage()).tableau.filtres[2];
  test('B1.3.1 période : raccourci fermé OU { du, au } réels, du <= au, années 1900 à 2100 ; rien d\'autre', () => {
    assert.deepEqual(valeurFiltre(periode, { raccourci: 'annee' }), { ok: true, valeur: { raccourci: 'annee' } });
    assert.deepEqual(valeurFiltre(periode, { du: '2026-01-31', au: '2026-02-28' }), { ok: true, valeur: { du: '2026-01-31', au: '2026-02-28' } });
    for (const mal of [{ raccourci: 'hier' }, { du: '2026-02-30', au: '2026-03-01' }, { du: '2026-03-02', au: '2026-03-01' }, { du: '1899-12-31', au: '2026-01-01' }, { du: '2026-01-01', au: '2101-01-01' },
      { du: '2026-01-01' }, { raccourci: 'tout', du: '2026-01-01' }, 'tout', null, [], 12, { du: 20260101, au: 20260102 }, { du: '2026-1-1', au: '2026-1-2' }]) assert.equal(valeurFiltre(periode, mal).ok, false);
  });
  test('B1.3.2 liste : 50 valeurs au plus, texte de 200 caractères au plus ou nombre fini ; une valeur seule si pas « multiple » ; liste vide permise', () => {
    assert.equal(valeurFiltre(lieu, []).ok, true);
    assert.equal(valeurFiltre(lieu, Array.from({ length: 50 }, (_, i) => `v${i}`)).ok, true);
    assert.equal(valeurFiltre(lieu, Array.from({ length: 51 }, (_, i) => `v${i}`)).ok, false);
    assert.equal(valeurFiltre(lieu, ['x'.repeat(200)]).ok, true);
    assert.equal(valeurFiltre(lieu, ['x'.repeat(201)]).ok, false);
    assert.equal(valeurFiltre(lieu, [Infinity]).ok, false);
    assert.equal(valeurFiltre(lieu, [NaN]).ok, false);
    assert.equal(valeurFiltre(lieu, [{ a: 1 }]).ok, false);
    assert.equal(valeurFiltre(lieu, 'a').ok, false);
    assert.equal(valeurFiltre(etat, ['ouvert']).ok, true);
    assert.equal(valeurFiltre(etat, ['ouvert', 'clos']).ok, false);
  });
  test('B1.3.3 intervalle : min seul, max seul ou les deux (nombres finis, min <= max) ; oui_non : un booléen', () => {
    assert.deepEqual(valeurFiltre(montant, { min: 10 }), { ok: true, valeur: { min: 10 } });
    assert.deepEqual(valeurFiltre(montant, { max: 0 }), { ok: true, valeur: { max: 0 } });
    for (const mal of [{ min: '10' }, { min: Infinity }, { min: 5, max: 1 }, { moyen: 1 }, [1, 2], 5]) assert.equal(valeurFiltre(montant, mal).ok, false);
    assert.deepEqual(valeurFiltre(alerte, false), { ok: true, valeur: false });
    for (const mal of ['true', 1, null, {}]) assert.equal(valeurFiltre(alerte, mal).ok, false);
  });
});

describe('B1.4 SQL paramétré exact', () => {
  test('B1.4.0 liste : valeurs passées en TEXTE et comparées en texte (un nombre devient « 7 » ; une valeur d\'un autre type donne zéro ligne, jamais une erreur de conversion)', () => {
    const r = construireRequete({ vue: 'v_exemple_a', type: 'tableau', colonnes: [] }, [{ colonne: 'n', type: 'liste', valeurs: [7, 'x'] }]);
    assert.equal(r.sql, 'select * from "v_exemple_a" where "n"::text = any($1::text[]) limit 500');
    assert.deepEqual(r.valeurs, [['7', 'x']]);
  });
  test('B1.4.1 sans filtre, la sortie est EXACTEMENT celle d\'avant (construireSql et construireRequete)', () => {
    assert.equal(construireSql({ vue: 'v_exemple_a', type: 'graphique' }), 'select * from "v_exemple_a" limit 200');
    assert.equal(construireSql({ vue: 'v_exemple_a', type: 'graphique', tri: { colonne: 'mois', sens: 'asc' }, limite: 12 }), 'select * from "v_exemple_a" order by "mois" asc limit 12');
    assert.deepEqual(construireRequete({ vue: 'v_exemple_a', type: 'graphique' }), { sql: 'select * from "v_exemple_a" limit 200', valeurs: [] });
  });
  test('B1.4.2 période + liste : opérateurs fermés, valeurs en paramètres, jamais dans le texte', () => {
    const t = validerReglages(reglage()).tableau.tuiles[0];
    const r = construireRequete(t, [{ colonne: 'date_piece', type: 'periode', du: '2026-01-01', au: '2026-01-31' }, { colonne: 'lieu', type: 'liste', valeurs: ['Lieu A', "L'autre"] }]);
    assert.equal(r.sql, 'select * from "v_exemple_ventes" where "date_piece" >= $1::date and "date_piece" < ($2::date + 1) and "lieu"::text = any($3::text[]) order by "date_piece" asc limit 200');
    assert.deepEqual(r.valeurs, ['2026-01-01', '2026-01-31', ['Lieu A', "L'autre"]]);
    assert.ok(!r.sql.includes('Lieu A') && !r.sql.includes('2026-01-01'));
  });
  test('B1.4.3 intervalle (min, max, ou les deux) et oui_non (vrai et faux) ; liste vide et intervalle vide : aucune clause', () => {
    const t = { vue: 'v_exemple_a', type: 'tableau', colonnes: [] };
    assert.equal(construireRequete(t, [{ colonne: 'montant', type: 'intervalle', min: 10, max: 99.5 }]).sql, 'select * from "v_exemple_a" where "montant" >= $1::numeric and "montant" <= $2::numeric limit 500');
    assert.deepEqual(construireRequete(t, [{ colonne: 'montant', type: 'intervalle', min: 10, max: 99.5 }]).valeurs, [10, 99.5]);
    assert.equal(construireRequete(t, [{ colonne: 'montant', type: 'intervalle', max: 5 }]).sql, 'select * from "v_exemple_a" where "montant" <= $1::numeric limit 500');
    assert.deepEqual(construireRequete(t, [{ colonne: 'alerte', type: 'oui_non', valeur: false }]), { sql: 'select * from "v_exemple_a" where "alerte" = $1 limit 500', valeurs: [false] });
    assert.deepEqual(construireRequete(t, [{ colonne: 'alerte', type: 'oui_non', valeur: true }]).valeurs, [true]);
    assert.deepEqual(construireRequete(t, [{ colonne: 'lieu', type: 'liste', valeurs: [] }, { colonne: 'montant', type: 'intervalle' }]), { sql: 'select * from "v_exemple_a" limit 500', valeurs: [] });
  });
  test('B1.4.4 une colonne, un opérateur ou une date douteux ne donnent jamais de SQL', () => {
    const t = { vue: 'v_exemple_a', type: 'tableau', colonnes: [] };
    for (const c of [{ colonne: 'x"; drop', type: 'oui_non', valeur: true }, { colonne: '__proto__', type: 'oui_non', valeur: true }, { colonne: 'x', type: 'egal', valeur: 1 },
      { colonne: 'x', type: 'periode', du: "2026-01-01'; --", au: '2026-01-02' }, { colonne: 'x'.repeat(64), type: 'oui_non', valeur: true }, { type: 'oui_non', valeur: true }]) {
      assert.throws(() => construireRequete(t, [c]), (e) => e instanceof ErreurPilotage);
    }
  });
  test('B1.4.5 chiffre avec variation : l\'ordre « periodeColonne desc nulls last » est gardé après le where', () => {
    const t = { vue: 'v_exemple_a', type: 'chiffre', valeur: { colonne: 'total' }, variation: { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' } };
    assert.equal(construireRequete(t, [{ colonne: 'lieu', type: 'liste', valeurs: ['A'] }]).sql, 'select * from "v_exemple_a" where "lieu"::text = any($1::text[]) order by "mois" desc nulls last limit 2');
  });
  test('B1.4.6 requête des valeurs d\'un filtre : distinct, sans null, triée, 201 lignes lues ; vue et colonne revalidées', () => {
    assert.equal(construireRequeteValeurs({ vue: 'v_exemple_lieux', colonne: 'nom' }), 'select distinct "nom" from "v_exemple_lieux" where "nom" is not null order by 1 limit 201');
    assert.throws(() => construireRequeteValeurs({ vue: 'lieux', colonne: 'nom' }), ErreurPilotage);
    assert.throws(() => construireRequeteValeurs({ vue: 'v_exemple_lieux', colonne: 'nom"' }), ErreurPilotage);
  });
});

describe('B1.5 agrégation déclarée', () => {
  const agreg = () => validerReglages(reglage()).tableau.tuiles[2];
  test('B1.5.1 SQL exact : group by, somme et nombre, tri et limite, filtres dans le where (avant le regroupement)', () => {
    const r = construireRequete(agreg(), [{ colonne: 'date_piece', type: 'periode', du: '2026-01-01', au: '2026-03-31' }, { colonne: 'etat', type: 'liste', valeurs: ['ouvert'] }]);
    assert.equal(r.sql, 'select "lieu", sum("montant") as "total", count(*) as "lignes" from "v_exemple_detail" where "date_piece" >= $1::date and "date_piece" < ($2::date + 1) and "etat"::text = any($3::text[]) group by "lieu" order by "total" desc limit 10');
    assert.deepEqual(r.valeurs, ['2026-01-01', '2026-03-31', ['ouvert']]);
    assert.equal(construireSql(agreg()), 'select "lieu", sum("montant") as "total", count(*) as "lignes" from "v_exemple_detail" group by "lieu" order by "total" desc limit 10');
  });
  test('B1.5.2 tous les calculs (somme, nombre, moyenne, min, max) ; grouper vide = pas de group by ; la colonne d\'un filtre n\'a pas à être groupée', () => {
    const t = { vue: 'v_exemple_a', type: 'chiffre', grouper: [], mesures: [{ colonne: 'a', calcul: 'moyenne', nom: 'm1' }, { colonne: 'a', calcul: 'min', nom: 'm2' }, { colonne: 'a', calcul: 'max', nom: 'm3' }, { colonne: 'a', calcul: 'nombre', nom: 'm4' }], valeur: { colonne: 'm1' } };
    assert.equal(construireRequete(t, [{ colonne: 'etat', type: 'oui_non', valeur: true }]).sql, 'select avg("a") as "m1", min("a") as "m2", max("a") as "m3", count("a") as "m4" from "v_exemple_a" where "etat" = $1 limit 1');
  });
  test('B1.5.3 validation : 6 colonnes et 6 mesures au plus, noms uniques et différents des colonnes de groupe, calcul connu, colonne obligatoire sauf « nombre »', () => {
    const essai = (en) => () => validerReglages(reglage([classement(en)]));
    refus(essai({ grouper: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), /6 colonnes au plus/);
    refus(essai({ grouper: ['lieu', 'lieu'] }), /deux fois/);
    refus(essai({ mesures: Array.from({ length: 7 }, (_, i) => ({ calcul: 'nombre', nom: `n${i}` })) }), /1 à 6/);
    refus(essai({ mesures: [{ calcul: 'nombre', nom: 'lieu' }], tri: { colonne: 'lieu', sens: 'asc' }, colonnes: [{ colonne: 'lieu' }] }), /colonne de « grouper »/);
    refus(essai({ mesures: [{ calcul: 'nombre', nom: 'a' }, { calcul: 'nombre', nom: 'a' }] }), /déjà pris/);
    refus(essai({ mesures: [{ colonne: 'x', calcul: 'mediane', nom: 'a' }] }), /calcul/);
    refus(essai({ mesures: [{ calcul: 'somme', nom: 'a' }] }), /obligatoire/);
    refus(essai({ mesures: [{ colonne: 'x', calcul: 'somme', nom: '__proto__' }] }), /nom de colonne/);
    refus(essai({ mesures: [{ colonne: 'x"', calcul: 'somme', nom: 'a' }] }), /nom de colonne/);
    refus(essai({ mesures: undefined }), /demande aussi « mesures »/);
  });
  test('B1.5.4 les colonnes lues (tri, colonnes du tableau, valeur et variation d\'un chiffre, croisement) existent dans le résultat ; « limite » sans « tri » est refusée', () => {
    refus(() => validerReglages(reglage([classement({ tri: { colonne: 'ailleurs', sens: 'asc' } })])), /ni une colonne de « grouper »/);
    refus(() => validerReglages(reglage([classement({ colonnes: [{ colonne: 'inconnue' }] })])), /ni une colonne de « grouper »/);
    refus(() => validerReglages(reglage([classement({ tri: undefined })])), /demande un « tri »/);
    const ongletC = [{ id: 'o', titre: 'O', tuiles: ['c'] }];
    const chiffre = { id: 'c', type: 'chiffre', titre: 'C', vue: 'v_exemple_a', grouper: ['mois'], mesures: [{ colonne: 'x', calcul: 'somme', nom: 'total' }], tri: { colonne: 'mois', sens: 'desc' } };
    refus(() => validerReglages(reglage([{ ...chiffre, valeur: { colonne: 'autre' } }], ongletC, [])), /valeur/);
    refus(() => validerReglages(reglage([{ ...chiffre, valeur: { colonne: 'total' }, variation: { colonne: 'total', periodeColonne: 'total', hausse: 'bon' } }], ongletC, [])), /période.*grouper/);
    assert.ok(validerReglages(reglage([{ ...chiffre, valeur: { colonne: 'total' }, variation: { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' }, limite: undefined }], ongletC, [])));
    refus(() => validerReglages(reglage([classement(), ventes({ grouper: ['lieu'], mesures: [{ calcul: 'nombre', nom: 'n' }], tri: { colonne: 'n', sens: 'desc' }, croisement: { filtre: 'lieu', colonne: 'region' } })])), /croisement/);
  });
  test('B1.5.5 une tuile agrégée garde ses colonnes de graphique (option) et ne renvoie ni « grouper » ni « mesures » à l\'écran', async () => {
    const m = await monter(reglage([classement(), ventes()]));
    const r = await m.lire({ ...jeton(BOT), data: {} });
    const t = r.tuiles.find((x) => x.id === 'classe');
    assert.equal(t.grouper, undefined);
    assert.equal(t.mesures, undefined);
    assert.equal(JSON.stringify(r).includes('v_exemple_detail'), false);
  });
});

describe('B1.6 raccourcis de période (Europe/Paris, bornes incluses)', () => {
  test('B1.6.1 définitions exactes au 31 mars 2026', () => {
    const r = (raccourci, ms = T) => resoudrePeriode({ raccourci }, ms);
    assert.deepEqual(r('ce_mois'), { raccourci: 'ce_mois', du: '2026-03-01', au: '2026-03-31' });
    assert.deepEqual(r('mois_dernier'), { raccourci: 'mois_dernier', du: '2026-02-01', au: '2026-02-28' });
    assert.deepEqual(r('3_mois'), { raccourci: '3_mois', du: '2025-12-31', au: '2026-03-31' });
    assert.deepEqual(r('6_mois'), { raccourci: '6_mois', du: '2025-09-30', au: '2026-03-31' });
    assert.deepEqual(r('12_mois'), { raccourci: '12_mois', du: '2025-03-31', au: '2026-03-31' });
    assert.deepEqual(r('annee'), { raccourci: 'annee', du: '2026-01-01', au: '2026-12-31' });
    assert.deepEqual(r('tout'), { raccourci: 'tout' });
  });
  test('B1.6.2 le jour est celui de Paris : 31 mars 22 h 30 UTC est déjà le 1er avril à Paris ; janvier : mois dernier = décembre de l\'année d\'avant', () => {
    assert.deepEqual(dateParis(Date.UTC(2026, 2, 31, 22, 30)), { a: 2026, m: 4, j: 1 });
    assert.equal(resoudrePeriode({ raccourci: 'ce_mois' }, Date.UTC(2026, 2, 31, 22, 30)).du, '2026-04-01');
    assert.deepEqual(resoudrePeriode({ raccourci: 'mois_dernier' }, Date.UTC(2026, 0, 15, 12)), { raccourci: 'mois_dernier', du: '2025-12-01', au: '2025-12-31' });
    assert.equal(resoudrePeriode({ raccourci: '3_mois' }, Date.UTC(2026, 4, 31, 12)).du, '2026-02-28'); // 31 mai - 3 mois : février n'a pas de 31
    assert.equal(resoudrePeriode({ raccourci: '12_mois' }, Date.UTC(2024, 1, 29, 12)).du, '2023-02-28');
  });
  test('B1.6.3 une plage libre reste telle quelle', () => {
    assert.deepEqual(resoudrePeriode({ du: '2026-01-01', au: '2026-01-31' }, T), { du: '2026-01-01', au: '2026-01-31' });
  });
});

// ---------- Service ----------
const jeton = (email, verifie = true) => ({ auth: { token: { email, email_verified: verifie } } });
function fauxPostgres(lignes) {
  const etat = { ouvertures: 0, appels: [], requetes: [] };
  const defaut = (sql) => (sql.includes('select distinct') ? [{ nom: 'Lieu A' }, { nom: 'Lieu B' }] : [{ lieu: 'Lieu A', total: 100, lignes: 2, nom: 'Alpha', date_piece: '2026-01-05' }]);
  return {
    etat,
    connecter: async () => { etat.ouvertures += 1; return { interroger: async (...a) => { etat.appels.push(a); etat.requetes.push(a[0]); return (lignes ?? defaut)(a[0], a[1]); }, fermer: async () => {} }; },
  };
}
async function monter(reglages, pg = fauxPostgres(), options = {}) {
  const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglages, version: 1, modifieLe: new Date(0) }] });
  const service = creerServicePilotage({ donnees: () => donnees, connecter: pg.connecter, maintenant: () => T, ...options });
  return { pg, service, lire: creerAppelPilotageLire({ service }) };
}
const sansListes = (appels) => appels.filter(([sql]) => !sql.includes('select distinct'));
const filtreRefuse = (p) => p.then(() => null, (e) => ({ code: e.code, message: e.message, details: e.details }));

describe('B1.7 service : filtres appliqués par le serveur', () => {
  test('B1.7.1 période (plage libre) + liste : la requête de chaque tuile ne contient que SES filtres, en paramètres', async () => {
    const m = await monter(reglage());
    const r = await m.lire({ ...jeton(BOT), data: { filtres: { periode: { du: '2026-01-01', au: '2026-01-31' }, lieu: ['Lieu A'] } } });
    const appels = sansListes(m.pg.etat.appels);
    const parVue = (v) => appels.find(([sql]) => sql.includes(`"${v}"`));
    assert.deepEqual(parVue('v_exemple_ventes'), ['select * from "v_exemple_ventes" where "date_piece" >= $1::date and "date_piece" < ($2::date + 1) and "lieu"::text = any($3::text[]) order by "date_piece" asc limit 200', ['2026-01-01', '2026-01-31', ['Lieu A']]]);
    assert.deepEqual(parVue('v_exemple_budget'), ['select * from "v_exemple_budget" where "lieu"::text = any($1::text[]) limit 1', [['Lieu A']]]); // pas filtré par la période : non déclarée sur cette tuile
    assert.ok(parVue('v_exemple_detail')[0].startsWith('select "lieu", sum("montant") as "total", count(*) as "lignes" from "v_exemple_detail" where "date_piece" >= $1::date and "date_piece" < ($2::date + 1) group by'), 'la tuile agrégée n\'a pas le filtre « lieu »');
    assert.deepEqual(r.filtres.find((f) => f.id === 'periode').applique, { du: '2026-01-01', au: '2026-01-31' });
    assert.deepEqual(r.filtres.find((f) => f.id === 'lieu').applique, ['Lieu A']);
  });
  test('B1.7.2 intervalle, état (choix) et oui_non atteignent la tuile qui les déclare', async () => {
    const m = await monter(reglage());
    await m.lire({ ...jeton(BOT), data: { filtres: { periode: { raccourci: 'tout' }, etat: ['clos'], montant: { min: 100 }, alerte: false } } });
    const [sql, valeurs] = sansListes(m.pg.etat.appels).find(([s]) => s.includes('v_exemple_detail'));
    assert.equal(sql, 'select "lieu", sum("montant") as "total", count(*) as "lignes" from "v_exemple_detail" where "etat"::text = any($1::text[]) and "montant" >= $2::numeric and "alerte" = $3 group by "lieu" order by "total" desc limit 10');
    assert.deepEqual(valeurs, [['clos'], 100, false]);
  });
  test('B1.7.3 le « defaut » s\'applique quand la clé est absente et la réponse rend la valeur résolue ; « tout » explicite le supprime', async () => {
    const m = await monter(reglage());
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.filtres.find((f) => f.id === 'periode').applique, { raccourci: '12_mois', du: '2025-03-31', au: '2026-03-31' });
    assert.deepEqual(sansListes(m.pg.etat.appels).find(([s]) => s.includes('v_exemple_ventes'))[1], ['2025-03-31', '2026-03-31']);
    const m2 = await monter(reglage());
    const r2 = await m2.lire({ ...jeton(BOT), data: { filtres: { periode: { raccourci: 'tout' } } } });
    assert.deepEqual(r2.filtres.find((f) => f.id === 'periode').applique, { raccourci: 'tout' });
    assert.equal(sansListes(m2.pg.etat.appels).find(([s]) => s.includes('v_exemple_ventes'))[0], 'select * from "v_exemple_ventes" order by "date_piece" asc limit 200');
  });
  test('B1.7.4 aucun filtre demandé ni défaut : la requête est EXACTEMENT celle d\'avant les filtres (texte seul, aucune valeur transmise)', async () => {
    const r = reglage(); r.tableau.filtres[0].defaut = undefined;
    const m = await monter(r);
    await m.lire({ ...jeton(BOT), data: {} });
    const appel = sansListes(m.pg.etat.appels).find(([s]) => s.includes('v_exemple_ventes'));
    assert.deepEqual(appel, ['select * from "v_exemple_ventes" order by "date_piece" asc limit 200']);
    assert.equal(appel.length, 1);
  });
  test('B1.7.5 les filtres arrivent à la tuile par SON onglet : un filtre non listé dans l\'onglet lu est refusé ; sans onglets, tous les filtres déclarés par une tuile sont acceptés', async () => {
    const r = reglage([ventes({ croisement: undefined }), budget({ id: 'b2', filtres: { etat: { colonne: 'etat' } } })]);
    r.tableau.onglets = [{ id: 'un', titre: 'Un', filtres: ['periode', 'lieu'], tuiles: ['ventes'] }, { id: 'deux', titre: 'Deux', filtres: ['etat'], tuiles: ['b2'] }];
    const m = await monter(r);
    assert.deepEqual((await filtreRefuse(m.lire({ ...jeton(BOT), data: { onglet: 'un', filtres: { etat: ['clos'] } } }))).code, 'invalid-argument');
    assert.equal((await m.lire({ ...jeton(BOT), data: { onglet: 'deux', filtres: { etat: ['clos'] } } })).onglet, 'deux');
    const sans = { groupes: {}, tableau: { titre: 'T', filtres: FILTRES(), tuiles: [ventes({ croisement: undefined })] } };
    const m2 = await monter(sans);
    const r2 = await m2.lire({ ...jeton(BOT), data: { filtres: { lieu: ['Lieu A'] } } });
    assert.deepEqual(r2.filtres.map((f) => f.id), ['periode', 'lieu']);
    assert.equal((await filtreRefuse(m2.lire({ ...jeton(BOT), data: { filtres: { alerte: true } } }))).code, 'invalid-argument'); // déclaré mais utilisé par aucune tuile
  });
});

describe('B1.8 service : refus des filtres douteux', () => {
  test('B1.8.1 filtre inconnu, hors de l\'onglet, mauvais type, mauvaise forme : « Filtre invalide. », raison « filtre », jamais la valeur reçue', async () => {
    const m = await monter(reglage());
    const mauvais = [{ fantome: ['x'] }, { periode: 'tout' }, { periode: { raccourci: 'hier' } }, { lieu: 'Lieu A' }, { lieu: [{ a: 1 }] }, { montant: { min: 'secret-123' } }, { alerte: 'oui' }, { lieu: Array.from({ length: 51 }, () => 'a') }, ['x'], 'x', { ['__proto__']: 1 }, JSON.parse('{"__proto__":{"x":1}}')];
    for (const filtres of mauvais) {
      const e = await filtreRefuse(m.lire({ ...jeton(BOT), data: { filtres } }));
      assert.equal(e.code, 'invalid-argument', JSON.stringify(filtres));
      assert.equal(e.message, 'Filtre invalide.');
      assert.deepEqual(e.details, { code: 'invalid-argument', raison: 'filtre' });
    }
    const e = await filtreRefuse(m.lire({ ...jeton(BOT), data: { filtres: { montant: { min: 'secret-123' } } } }));
    assert.equal(JSON.stringify(e).includes('secret-123'), false);
    assert.equal(m.pg.etat.ouvertures, 0, 'aucune lecture de la base quand un filtre est refusé');
  });
  test('B1.8.2 un onglet inconnu reste « Onglet inconnu. » (sans raison « filtre »), distinct d\'un filtre refusé', async () => {
    const m = await monter(reglage());
    const e = await filtreRefuse(m.lire({ ...jeton(BOT), data: { onglet: 'nexistepas', filtres: {} } }));
    assert.equal(e.message, 'Onglet inconnu.');
    assert.equal(e.details.raison, undefined);
  });
  test('B1.8.3 une valeur absente de la liste des valeurs n\'est pas refusée (zéro ligne, aucun oracle) : la requête part avec elle', async () => {
    const m = await monter(reglage());
    await m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['Lieu inexistant'] } } });
    assert.ok(sansListes(m.pg.etat.appels).some(([, v]) => JSON.stringify(v).includes('Lieu inexistant')));
  });
  test('B1.8.4 « filtres » vide, null ou absent : aucun refus', async () => {
    const m = await monter(reglage());
    for (const filtres of [undefined, null, {}]) assert.equal((await m.lire({ ...jeton(BOT), data: { filtres } })).onglet, 'suivi');
  });
});

describe('B1.9 service : cache, aperçu, lecture unique', () => {
  test('B1.9.1 la clé du cache contient les valeurs de filtre : un autre filtre = une autre requête ; le même filtre = le cache', async () => {
    const m = await monter(reglage());
    const lire = (filtres) => m.lire({ ...jeton(BOT), data: { filtres } });
    const compte = () => sansListes(m.pg.etat.appels).filter(([s]) => s.includes('v_exemple_ventes')).length;
    await lire({ lieu: ['Lieu A'] }); assert.equal(compte(), 1);
    await lire({ lieu: ['Lieu A'] }); assert.equal(compte(), 1, 'même filtre : cache');
    await lire({ lieu: ['Lieu B'] }); assert.equal(compte(), 2, 'autre valeur : autre requête');
    await lire({ lieu: ['Lieu A'], periode: { raccourci: 'tout' } }); assert.equal(compte(), 3);
  });
  test('B1.9.2 le cache reste plafonné à 60 variantes', async () => {
    const m = await monter(reglage());
    for (let i = 0; i < 70; i += 1) await m.lire({ ...jeton(BOT), data: { filtres: { lieu: [`L${i}`] } } });
    const avant = m.pg.etat.appels.length;
    await m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['L0'] } } }); // la plus ancienne a été évincée
    assert.ok(m.pg.etat.appels.length > avant);
    const apres = m.pg.etat.appels.length;
    await m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['L69'] } } }); // la plus récente est encore là
    assert.equal(m.pg.etat.appels.length, apres);
  });
  test('B1.9.3 l\'aperçu (administrateur) accepte les filtres et n\'utilise pas le cache', async () => {
    const m = await monter({ groupes: {}, tableau: { titre: 'x', tuiles: [] } });
    const brouillon = reglage();
    const a = () => m.lire({ ...jeton(JEROME), data: { apercu: brouillon, filtres: { lieu: ['Lieu A'] } } });
    await a(); const n1 = sansListes(m.pg.etat.appels).length;
    await a(); assert.equal(sansListes(m.pg.etat.appels).length, 2 * n1);
    assert.equal((await filtreRefuse(creerAppelPilotageLire({ service: m.service })({ ...jeton(BOT), data: { apercu: brouillon, filtres: {} } }))).code, 'permission-denied');
  });
  test('B1.9.4 deux tuiles au SQL et aux valeurs identiques ne font qu\'une requête dans un appel', async () => {
    const m = await monter(reglage([ventes({ id: 'v1', croisement: undefined }), ventes({ id: 'v2', croisement: undefined })]));
    await m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['Lieu A'] } } });
    assert.equal(sansListes(m.pg.etat.appels).length, 1);
  });
});

describe('B1.10 service : droits', () => {
  test('B1.10.1 un filtre « visiblePour » n\'est ni listé, ni accepté, ni cité dans l\'onglet pour un compte non autorisé ; aucune lecture de sa liste de valeurs', async () => {
    const r = reglage(); r.tableau.filtres[1].visiblePour = [JEROME];
    const m = await monter(r);
    const lu = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(lu.filtres.map((f) => f.id), ['periode', 'etat', 'montant', 'alerte']);
    assert.equal(lu.onglets[0].filtres.includes('lieu'), false);
    assert.equal(JSON.stringify(lu).includes('"lieu"'), true); // c'est le nom de la colonne affichée par la tuile, pas celui du filtre
    assert.equal(JSON.stringify(lu.filtres).includes('Lieu'), false);
    assert.equal(m.pg.etat.requetes.some((s) => s.includes('v_exemple_lieux')), false);
    const e = await filtreRefuse(m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['Lieu A'] } } }));
    const f = await filtreRefuse(m.lire({ ...jeton(BOT), data: { filtres: { fantome: ['Lieu A'] } } }));
    assert.deepEqual([e.code, e.message, e.details], [f.code, f.message, f.details], 'interdit et inexistant : même réponse');
    const ok = await monter(r);
    assert.deepEqual((await ok.lire({ ...jeton(JEROME), data: {} })).filtres.map((x) => x.id), ['periode', 'lieu', 'etat', 'montant', 'alerte']);
  });
  test('B1.10.2 visiblePour par groupe ; groupe inconnu = personne ; liste vide = personne', async () => {
    const r = reglage(); r.groupes = { equipe: [BOT] }; r.tableau.filtres[1].visiblePour = ['equipe']; r.tableau.filtres[2].visiblePour = ['fantome']; r.tableau.filtres[3].visiblePour = [];
    const m = await monter(r);
    assert.deepEqual((await m.lire({ ...jeton(BOT), data: {} })).filtres.map((x) => x.id), ['periode', 'lieu', 'alerte']);
    assert.deepEqual((await m.lire({ ...jeton(JEROME), data: {} })).filtres.map((x) => x.id), ['periode', 'alerte']);
  });
  test('B1.10.3 une tuile interdite n\'est pas lue ; un filtre qu\'elle seule déclare disparaît (pas de liste de valeurs lue) ; son croisement n\'est pas rendu', async () => {
    const r = reglage([ventes({ visiblePour: [JEROME] }), budget(), classement()]);
    const m = await monter(r);
    const lu = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(lu.tuiles.some((t) => t.id === 'ventes'), false);
    assert.equal(lu.filtres.some((f) => f.id === 'periode'), true); // la tuile agrégée visible déclare encore la période
    assert.equal(lu.filtres.some((f) => f.id === 'lieu'), true); // le budget visible déclare « lieu »
    const r2 = reglage([ventes({ visiblePour: [JEROME] }), budget({ filtres: undefined, mentionNonFiltre: undefined }), classement({ filtres: { etat: { colonne: 'etat' } } })]);
    const m2 = await monter(r2);
    const lu2 = await m2.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(lu2.filtres.map((f) => f.id), ['etat']);
    assert.equal(m2.pg.etat.requetes.some((s) => s.includes('v_exemple_lieux')), false);
    assert.equal((await filtreRefuse(m2.lire({ ...jeton(BOT), data: { filtres: { lieu: ['x'] } } }))).code, 'invalid-argument');
    assert.deepEqual(lu2.onglets[0].filtres, ['etat']);
  });
  test('B1.10.4 le croisement est retiré d\'une tuile dont le filtre est invisible ; la réponse ne contient jamais la colonne du croisement ni celles des filtres', async () => {
    const r = reglage(); r.tableau.filtres[1].visiblePour = [JEROME];
    const m = await monter(r);
    const lu = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(lu.tuiles.find((t) => t.id === 'ventes').croisement, undefined);
    const ok = await (await monter(reglage())).lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(ok.tuiles.find((t) => t.id === 'ventes').croisement, { filtre: 'lieu' });
    assert.deepEqual(ok.tuiles.find((t) => t.id === 'ventes').filtresAppliques, ['periode', 'lieu']);
    const texte = JSON.stringify(ok);
    for (const interdit of ['v_exemple_lieux', 'v_exemple_ventes', 'visiblePour', '"filtres":{']) assert.equal(texte.includes(interdit), false, interdit);
    assert.equal(JSON.stringify(ok.tuiles.find((t) => t.id === 'ventes').croisement).includes('colonne'), false);
  });
  test('B1.10.5 filtrerOnglets : les identifiants de filtres interdits sont retirés de l\'onglet (copie par « ...reste » corrigée)', () => {
    const onglets = [{ id: 'o', titre: 'O', tuiles: ['t'], filtres: ['a', 'b'] }];
    assert.deepEqual(filtrerOnglets(onglets, new Set(['t']), new Map([['o', ['b']]])), [{ id: 'o', titre: 'O', tuiles: ['t'], filtres: ['b'] }]);
    assert.deepEqual(filtrerOnglets(onglets, new Set(['t'])), [{ id: 'o', titre: 'O', tuiles: ['t'] }]);
  });
  test('B1.10.6 un compte non autorisé ou sans adresse vérifiée est refusé avant tout filtre', async () => {
    const m = await monter(reglage());
    assert.equal((await filtreRefuse(m.lire({ ...jeton('inconnu@example.test'), data: { filtres: {} } }))).code, 'permission-denied');
    assert.equal((await filtreRefuse(m.lire({ ...jeton(BOT, false), data: { filtres: {} } }))).code, 'permission-denied');
    assert.equal((await filtreRefuse(m.lire({ data: {} }))).code, 'unauthenticated');
  });
});

describe('B1.11 service : liste des valeurs d\'un filtre', () => {
  test('B1.11.1 lue dans la vue déclarée, à la racine de la réponse, pour l\'onglet lu seulement ; les « choix » sont rendus tels quels', async () => {
    const m = await monter(reglage());
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.ok(m.pg.etat.requetes.includes('select distinct "nom" from "v_exemple_lieux" where "nom" is not null order by 1 limit 201'));
    assert.deepEqual(r.filtres.find((f) => f.id === 'lieu'), { id: 'lieu', libelle: 'Lieu', type: 'liste', multiple: true, valeurs: ['Lieu A', 'Lieu B'] });
    assert.deepEqual(r.filtres.find((f) => f.id === 'etat').choix, [{ valeur: 'ouvert', libelle: 'Ouvert' }, { valeur: 'clos', libelle: 'Clos' }]);
    assert.equal(r.onglets[0].valeurs, undefined);
    assert.equal(m.pg.etat.ouvertures, 1, 'même connexion');
  });
  test('B1.11.2 au-delà de 200 valeurs : 200 rendues et « tronquee » ; null et valeurs douteuses écartés', async () => {
    const m = await monter(reglage(), fauxPostgres((sql) => (sql.includes('select distinct') ? Array.from({ length: 201 }, (_, i) => ({ nom: `V${String(i).padStart(3, '0')}` })) : [])));
    const f = (await m.lire({ ...jeton(BOT), data: {} })).filtres.find((x) => x.id === 'lieu');
    assert.equal(f.valeurs.length, 200);
    assert.equal(f.tronquee, true);
    const m2 = await monter(reglage(), fauxPostgres((sql) => (sql.includes('select distinct') ? [{ nom: null }, { nom: 'ok' }, { nom: { a: 1 } }, { nom: 'x'.repeat(201) }, { nom: 7 }] : [])));
    assert.deepEqual((await m2.lire({ ...jeton(BOT), data: {} })).filtres.find((x) => x.id === 'lieu').valeurs, ['ok', 7]);
  });
  test('B1.11.3 liste en panne : le filtre est rendu sans valeurs, sans message de la base, et les tuiles se lisent quand même', async () => {
    const journal = [];
    const m = await monter(reglage(), fauxPostgres((sql) => { if (sql.includes('select distinct')) throw new Error('secret-de-la-base'); return [{ lieu: 'A', total: 1, lignes: 1 }]; }), { journalErreur: (...a) => journal.push(a) });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    const f = r.filtres.find((x) => x.id === 'lieu');
    assert.equal(f.valeurs, undefined);
    assert.equal(JSON.stringify(r).includes('secret-de-la-base'), false);
    assert.deepEqual(r.erreurs, []);
    assert.equal(r.tuiles.length, 3);
    assert.equal(journal.length, 1);
  });
});

describe('B1.12 contrat de la réponse', () => {
  test('B1.12.1 un réglage sans filtres rend la même réponse qu\'avant : pas de « filtres », pas de champs ajoutés', async () => {
    const m = await monter({ groupes: {}, tableau: { titre: 'T', tuiles: [{ id: 'a', titre: 'A', vue: 'v_exemple_a', option: OPTION }], onglets: [{ id: 'o', titre: 'O', tuiles: ['a'] }] } });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(Object.keys(r).sort(), ['erreurs', 'onglet', 'onglets', 'titre', 'tuiles']);
    assert.deepEqual(Object.keys(r.tuiles[0]).sort(), ['id', 'lignes', 'option', 'titre', 'type']);
    assert.deepEqual(r.onglets, [{ id: 'o', titre: 'O', tuiles: ['a'] }]);
  });
  test('B1.12.2 la mention « non filtré » et les filtres appliqués par tuile sont rendus ; une tuile en erreur garde ses champs de filtre', async () => {
    const m = await monter(reglage(), fauxPostgres((sql) => { if (sql.includes('v_exemple_budget')) throw new Error('boum'); return []; }));
    const r = await m.lire({ ...jeton(BOT), data: {} });
    const b = r.tuiles.find((t) => t.id === 'budget');
    assert.equal(b.mentionNonFiltre, 'Non filtré par la période.');
    assert.deepEqual(b.filtresAppliques, ['lieu']);
    assert.deepEqual(r.erreurs.map((e) => e.id), ['budget']);
  });
  test('B1.12.3 un défaut valide sans valeur reçue ne casse pas un onglet sans tuile filtrée', async () => {
    const r = reglage([{ id: 'a', titre: 'A', vue: 'v_exemple_a', option: OPTION }]);
    const m = await monter(r);
    const lu = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(lu.filtres, undefined);
    assert.equal(m.pg.etat.requetes.some((s) => s.includes('where')), false);
  });
  test('B1.12.4 resoudreFiltres et clausesDeTuile : la colonne vient du réglage, pas de la requête', () => {
    const decls = validerReglages(reglage()).tableau.filtres;
    const portee = new Map(decls.map((f) => [f.id, f]));
    const res = resoudreFiltres({ portee, demandes: { lieu: ['A'], periode: { raccourci: 'ce_mois' } }, maintenant: T });
    const t = validerReglages(reglage()).tableau.tuiles[0];
    assert.deepEqual(clausesDeTuile(t, portee, res), [{ colonne: 'date_piece', type: 'periode', du: '2026-03-01', au: '2026-03-31' }, { colonne: 'lieu', type: 'liste', valeurs: ['A'] }]);
  });
});

describe('B1.13 appel et connexion', () => {
  test('B1.13.1 l\'appel transmet « filtres » (valeurs seulement) au service ; apercu + filtres permis pour l\'administrateur', async () => {
    const recu = [];
    const appel = creerAppelPilotageLire({ service: { lire: async (a) => { recu.push(a); return { tuiles: [], erreurs: [] }; } } });
    await appel({ ...jeton(BOT), data: { onglet: 'o', filtres: { lieu: ['x'] }, colonne: 'secret', vue: 'v_x' } });
    assert.deepEqual(Object.keys(recu[0]).sort(), ['apercu', 'email', 'exporter', 'filtres', 'onglet']);
    assert.deepEqual(recu[0].filtres, { lieu: ['x'] });
    await appel({ ...jeton(JEROME), data: { apercu: { a: 1 }, filtres: { lieu: [] } } });
    assert.deepEqual(recu[1].apercu, { a: 1 });
    assert.deepEqual(recu[1].filtres, { lieu: [] });
  });
  test('B1.13.2 une erreur de filtre devient une erreur d\'appel avec la raison « filtre » ; une autre erreur du module n\'en a pas', () => {
    const e = enErreurPilotage(new ErreurPilotage('invalid-argument', 'Filtre invalide.', 'filtre'));
    assert.deepEqual(e.details, { code: 'invalid-argument', raison: 'filtre' });
    assert.deepEqual(enErreurPilotage(new ErreurPilotage('invalid-argument', 'Onglet inconnu.')).details, { code: 'invalid-argument' });
  });
  const SECRET = { hote: 'hote.example.test', port: '6543', base: 'b', utilisateur: 'u', mot_de_passe: 'm', ca: 'CA' };
  const fauxPg = () => {
    const vus = [];
    class Client { constructor() {} on() {} async connect() {} async query(...a) { vus.push(a); return { rows: [{ a: 1 }] }; } async end() {} }
    return { vus, pg: { Client, types: { getTypeParser: () => (x) => x } } };
  };
  test('B1.13.3 postgres.js : sans valeurs, client.query(sql) comme avant ; avec valeurs, client.query(sql, valeurs) ; jamais d\'objet { name }', async () => {
    const { pg, vus } = fauxPg();
    const c = await creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: pg })();
    await c.interroger('select 1');
    await c.interroger('select 2', []);
    await c.interroger('select * from "v_a" where "x" = $1', [5]);
    assert.deepEqual(vus, [['select 1'], ['select 2'], ['select * from "v_a" where "x" = $1', [5]]]);
    assert.ok(vus.every((a) => typeof a[0] === 'string'));
    await c.fermer();
  });
});

describe('B1.14 corrections de relecture', () => {
  test('B1.14.1 oui_non avec défaut : « null » explicite = aucune clause et le défaut ne s\'applique pas ; absent = défaut', async () => {
    const r = reglage(); r.tableau.filtres[4].defaut = true;
    const m = await monter(r);
    const detail = () => sansListes(m.pg.etat.appels).filter(([s]) => s.includes('v_exemple_detail')).at(-1);
    await m.lire({ ...jeton(BOT), data: { filtres: { alerte: null } } });
    assert.ok(!detail()[0].includes('"alerte"'));
    const lu = await m.lire({ ...jeton(BOT), data: { filtres: {} } });
    assert.ok(detail()[0].includes('"alerte" = $'));
    assert.equal(lu.filtres.find((f) => f.id === 'alerte').applique, true);
    const n = await m.lire({ ...jeton(BOT), data: { filtres: { alerte: null } } });
    assert.equal(n.filtres.find((f) => f.id === 'alerte').applique, undefined);
    assert.equal((await filtreRefuse(m.lire({ ...jeton(BOT), data: { filtres: { montant: null } } }))).code, 'invalid-argument'); // null n'est permis que pour oui_non
  });
  test('B1.14.2 les listes sont normalisées (doublons retirés, triées) : même valeur, même SQL, même clé de cache', async () => {
    const [, lieu] = validerReglages(reglage()).tableau.filtres;
    assert.deepEqual(valeurFiltre(lieu, ['B', 'A', 'B', 7, '7']).valeur, [7, 'A', 'B']);
    const m = await monter(reglage());
    const compte = () => sansListes(m.pg.etat.appels).filter(([s]) => s.includes('v_exemple_ventes')).length;
    await m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['B', 'A'] } } });
    await m.lire({ ...jeton(BOT), data: { filtres: { lieu: ['A', 'B', 'A'] } } });
    assert.equal(compte(), 1);
    assert.deepEqual(sansListes(m.pg.etat.appels).find(([s]) => s.includes('v_exemple_ventes'))[1][2], ['A', 'B']);
  });
  test('B1.14.3 la liste de valeurs rendue ne contient que des valeurs que le serveur accepte en retour (200 caractères au plus, caractères de contrôle écartés)', async () => {
    const m = await monter(reglage(), fauxPostgres((sql) => (sql.includes('select distinct') ? [{ nom: 'ok' }, { nom: 'a\nb' }, { nom: '' }, { nom: 'x'.repeat(200) }, { nom: 'x'.repeat(201) }] : [])));
    const f = (await m.lire({ ...jeton(BOT), data: {} })).filtres.find((x) => x.id === 'lieu');
    assert.deepEqual(f.valeurs, ['ok', 'x'.repeat(200)]);
    assert.equal(valeurFiltre(validerReglages(reglage()).tableau.filtres[1], f.valeurs).ok, true);
  });
  test('B1.14.4 mentionNonFiltre n\'est rendu que si l\'onglet a des filtres à l\'écran pour cet appelant', async () => {
    const r = reglage([budget()], undefined, FILTRES().map((f) => (f.id === 'lieu' ? { ...f, visiblePour: [JEROME] } : f)));
    const m = await monter(r);
    assert.equal((await m.lire({ ...jeton(BOT), data: {} })).tuiles[0].mentionNonFiltre, undefined);
    assert.equal((await m.lire({ ...jeton(JEROME), data: {} })).tuiles[0].mentionNonFiltre, 'Non filtré par la période.');
  });
  test('B1.14.5 enregistrement : une tuile ne déclare que des filtres listés par son onglet ; un onglet ne liste que des filtres qu\'une de ses tuiles déclare ; sans onglets, rien à vérifier', () => {
    const a = reglage(); a.tableau.onglets[0].filtres = a.tableau.onglets[0].filtres.filter((id) => id !== 'montant');
    refus(() => validerReglages(a), /n'est pas dans la liste « filtres » de son onglet/);
    const b = reglage([ventes({ croisement: undefined })]); b.tableau.onglets[0].filtres = ['periode', 'lieu', 'etat'];
    refus(() => validerReglages(b), /n'est déclaré par aucune de ses tuiles/);
    assert.ok(validerReglages({ groupes: {}, tableau: { titre: 'T', filtres: FILTRES(), tuiles: [ventes()] } }));
  });
  test('B1.14.6 un chiffre regroupé sans variation demande un tri ; avec tri, ou avec variation, ou sans groupe : accepté', () => {
    const c = (en) => ({ id: 'c', type: 'chiffre', titre: 'C', vue: 'v_exemple_a', valeur: { colonne: 'total' }, mesures: [{ colonne: 'x', calcul: 'somme', nom: 'total' }], ...en });
    const o = [{ id: 'o', titre: 'O', tuiles: ['c'] }];
    refus(() => validerReglages(reglage([c({ grouper: ['mois'] })], o, [])), /demande un « tri »/);
    assert.ok(validerReglages(reglage([c({ grouper: ['mois'], tri: { colonne: 'mois', sens: 'desc' } })], o, [])));
    assert.ok(validerReglages(reglage([c({ grouper: ['mois'], variation: { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' } })], o, [])));
    assert.ok(validerReglages(reglage([c({ grouper: [] })], o, [])));
  });
});
