// Tri uniforme (nuit du 23/10/2026) : logique pure (js/modules/crm/tri.js). Chaque test commence par le numéro du critère du brief.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../js/modules/crm/tri.js';
import * as L from '../js/modules/crm/logique.js';

const stockage = (valeurs) => (cle) => (cle in valeurs ? valeurs[cle] : null);
const noms = (lignes) => lignes.map((l) => l.nom);

describe('1 à 4 : table des critères de chaque écran', () => {
  const ids = (ecran, tout = false) => T.TRIS[ecran].criteres.filter((c) => tout || c.menu !== false).map((c) => c.id);
  test('1 projets : le menu propose Titre, Date de création, Début, Fin prévue (Phase et Statut restent des colonnes)', () => {
    assert.deepEqual(ids('projets'), ['titre', 'creation', 'debut', 'fin']);
    assert.ok(ids('projets', true).includes('phase') && ids('projets', true).includes('statut'));
  });
  test('2 affaires : le menu garde Activité suivante, Montant, Titre, Date de création', () => {
    assert.deepEqual(ids('affaires'), ['activite', 'montant', 'titre', 'creation']);
    assert.deepEqual(T.TRIS.affaires.criteres.slice(0, 4).map((c) => c.libelle), ['Activité suivante', 'Montant', 'Titre', 'Date de création']);
  });
  test('3 personnes : le menu propose Nom, Organisation, Ville, Date de création', () => {
    assert.deepEqual(ids('personnes'), ['nom', 'organisation', 'ville', 'creation']);
  });
  test('4 organisations : le menu propose Nom, Ville, Secteur, Affaires en cours, Création', () => {
    assert.deepEqual(ids('organisations'), ['nom', 'ville', 'secteur', 'affaires', 'creation']);
    assert.equal(T.critereDe('organisations', 'affaires').libelle, 'Affaires en cours');
  });
  test('1 un critère de colonne seulement apparaît dans le menu tant qu\'il est choisi', () => {
    assert.ok(!T.optionsMenu('projets', 'titre').some((o) => o.id === 'phase'));
    assert.ok(T.optionsMenu('projets', 'phase').some((o) => o.id === 'phase'));
  });
  test('1 les identifiants de critères sont uniques dans chaque écran', () => {
    for (const ecran of Object.keys(T.TRIS)) assert.equal(new Set(ids(ecran, true)).size, ids(ecran, true).length, ecran);
  });
});

describe('5 mémorisation et valeurs de départ', () => {
  test('5 valeur de départ de chaque écran : affaires Activité suivante, les autres Nom ou Titre croissant', () => {
    assert.deepEqual(T.triParDefaut('affaires'), { critere: 'activite', sens: 'asc' });
    assert.deepEqual(T.triParDefaut('projets'), { critere: 'titre', sens: 'asc' });
    assert.deepEqual(T.triParDefaut('personnes'), { critere: 'nom', sens: 'asc' });
    assert.deepEqual(T.triParDefaut('organisations'), { critere: 'nom', sens: 'asc' });
  });
  test('5 rien d\'enregistré : le tri de départ', () => {
    for (const e of Object.keys(T.TRIS)) assert.deepEqual(T.lireTriMemorise(e, stockage({})), T.triParDefaut(e));
  });
  test('5 un tri enregistré est relu à l\'identique (clé distincte par écran)', () => {
    const projets = { critere: 'fin', sens: 'desc' };
    const lire = stockage({ 'tri.projets': T.texteTri(projets) });
    assert.deepEqual(T.lireTriMemorise('projets', lire), projets);
    assert.deepEqual(T.lireTriMemorise('personnes', lire), T.triParDefaut('personnes'));
  });
  test('5 lecture défensive : texte abîmé, critère inconnu ou sens inconnu', () => {
    assert.deepEqual(T.lireTriMemorise('projets', stockage({ 'tri.projets': 'pas du json' })), T.triParDefaut('projets'));
    assert.deepEqual(T.lireTriMemorise('projets', stockage({ 'tri.projets': '{"critere":"inconnu","sens":"asc"}' })), T.triParDefaut('projets'));
    assert.deepEqual(T.lireTriMemorise('projets', stockage({ 'tri.projets': '{"critere":"fin","sens":"bizarre"}' })), { critere: 'fin', sens: 'asc' });
    assert.deepEqual(T.lireTriMemorise('projets', stockage({ 'tri.projets': 'null' })), T.triParDefaut('projets'));
    assert.deepEqual(T.lireTriMemorise('projets', stockage({ 'tri.projets': '42' })), T.triParDefaut('projets'));
  });
  test('5 affaires : l\'ancienne clé tri.kanban est reprise sans perte (Montant = plus gros d\'abord, Création = récent d\'abord)', () => {
    assert.deepEqual(T.lireTriMemorise('affaires', stockage({ 'tri.kanban': 'montant' })), { critere: 'montant', sens: 'desc' });
    assert.deepEqual(T.lireTriMemorise('affaires', stockage({ 'tri.kanban': 'creation' })), { critere: 'creation', sens: 'desc' });
    assert.deepEqual(T.lireTriMemorise('affaires', stockage({ 'tri.kanban': 'titre' })), { critere: 'titre', sens: 'asc' });
    assert.deepEqual(T.lireTriMemorise('affaires', stockage({ 'tri.kanban': 'nimporte' })), T.triParDefaut('affaires'));
  });
  test('5 affaires : tri.affaires l\'emporte sur tri.kanban', () => {
    const lire = stockage({ 'tri.kanban': 'montant', 'tri.affaires': '{"critere":"titre","sens":"desc"}' });
    assert.deepEqual(T.lireTriMemorise('affaires', lire), { critere: 'titre', sens: 'desc' });
  });
  test('5 tri.kanban n\'est lu que pour les affaires', () => {
    assert.deepEqual(T.lireTriMemorise('projets', stockage({ 'tri.kanban': 'montant' })), T.triParDefaut('projets'));
  });
});

describe('2 et 3 : un seul état pour le menu, la flèche et la colonne', () => {
  test('2 le choix dans le menu prend le sens de départ du critère', () => {
    assert.deepEqual(T.triApresChoix('affaires', 'montant'), { critere: 'montant', sens: 'desc' });
    assert.deepEqual(T.triApresChoix('personnes', 'ville'), { critere: 'ville', sens: 'asc' });
  });
  test('2 clic sur la colonne active : le sens s\'inverse ; sur une autre colonne : son sens de départ', () => {
    assert.deepEqual(T.triApresClicColonne('personnes', { critere: 'nom', sens: 'asc' }, 'nom'), { critere: 'nom', sens: 'desc' });
    assert.deepEqual(T.triApresClicColonne('personnes', { critere: 'nom', sens: 'desc' }, 'ville'), { critere: 'ville', sens: 'asc' });
    assert.deepEqual(T.triApresClicColonne('affaires', { critere: 'titre', sens: 'asc' }, 'montant'), { critere: 'montant', sens: 'desc' });
  });
  test('3 inverser deux fois redonne le même état', () => {
    const e = { critere: 'creation', sens: 'desc' };
    assert.deepEqual(T.inverserSens(T.inverserSens(e)), e);
    assert.equal(T.inverserSens(e).sens, 'asc');
  });
});

describe('3 ordre : accents, valeurs vides en dernier, sens, stabilité', () => {
  const cles = { nom: (l) => L.normaliser(l.nom), creation: T.cleCreation, nombre: (l) => (l.n ?? null) };
  test('3 insensible aux accents et à la casse', () => {
    const lignes = [{ nom: 'Zoé' }, { nom: 'élodie' }, { nom: 'Adam' }, { nom: 'Eric' }];
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'nom', sens: 'asc' }, cles)), ['Adam', 'élodie', 'Eric', 'Zoé']);
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'nom', sens: 'desc' }, cles)), ['Zoé', 'Eric', 'élodie', 'Adam']);
  });
  test('3 Création : récent d\'abord par défaut, ancien d\'abord si on inverse, sans date toujours à la fin', () => {
    const lignes = [
      { nom: 'vieille', creeLe: new Date('2024-01-01T10:00:00Z') },
      { nom: 'sansdate' },
      { nom: 'recente', creeLe: new Date('2026-05-01T10:00:00Z') },
      { nom: 'nulle', creeLe: null },
      { nom: 'firestore', creeLe: { seconds: Math.floor(new Date('2025-03-01T10:00:00Z').getTime() / 1000), nanoseconds: 0 } },
    ];
    const defaut = T.triApresChoix('personnes', 'creation');
    assert.deepEqual(noms(T.trierSelon(lignes, defaut, cles)).slice(0, 3), ['recente', 'firestore', 'vieille']);
    assert.deepEqual(noms(T.trierSelon(lignes, defaut, cles)).slice(3).sort(), ['nulle', 'sansdate']);
    const inverse = T.inverserSens(defaut);
    assert.deepEqual(noms(T.trierSelon(lignes, inverse, cles)).slice(0, 3), ['vieille', 'firestore', 'recente']);
    assert.deepEqual(noms(T.trierSelon(lignes, inverse, cles)).slice(3).sort(), ['nulle', 'sansdate']);
  });
  test('3 un nombre à zéro n\'est pas « vide » ; les vides restent à la fin dans les deux sens', () => {
    const lignes = [{ nom: 'a', n: 0 }, { nom: 'b' }, { nom: 'c', n: 3 }, { nom: 'd', n: 1 }];
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'nombre', sens: 'asc' }, cles)), ['a', 'd', 'c', 'b']);
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'nombre', sens: 'desc' }, cles)), ['c', 'd', 'a', 'b']);
  });
  test('3 tri stable : à clé égale, l\'ordre d\'origine est gardé (dans les deux sens)', () => {
    const lignes = [{ nom: 'x1', n: 1 }, { nom: 'x2', n: 1 }, { nom: 'x3', n: 1 }];
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'nombre', sens: 'asc' }, cles)), ['x1', 'x2', 'x3']);
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'nombre', sens: 'desc' }, cles)), ['x1', 'x2', 'x3']);
  });
  test('3 liste vide et critère sans clé : aucune erreur, ordre d\'origine, tableau d\'origine intact', () => {
    assert.deepEqual(T.trierSelon([], { critere: 'nom', sens: 'asc' }, cles), []);
    const lignes = [{ nom: 'b' }, { nom: 'a' }];
    assert.deepEqual(noms(T.trierSelon(lignes, { critere: 'phase', sens: 'asc' }, cles)), ['b', 'a']);
    T.trierSelon(lignes, { critere: 'nom', sens: 'asc' }, cles);
    assert.deepEqual(noms(lignes), ['b', 'a']);
  });
});

describe('6 un seul composant, le même vocabulaire', () => {
  const source = (f) => readFileSync(new URL(`../js/modules/${f}`, import.meta.url), 'utf8');
  test('6 les quatre écrans utilisent selecteurTri et aucun ne reconstruit son propre menu « Trier par »', () => {
    for (const f of ['crm/affaires.js', 'crm/personnes.js', 'crm/organisations.js', 'projets/projets.js']) {
      assert.match(source(f), /selecteurTri\(\{/, f);
      assert.doesNotMatch(source(f), /Trier par/, f);
    }
    assert.equal((source('crm/composants.js').match(/'Trier par'/g) || []).length, 1);
  });
  test('6 les libellés de critères ne contiennent jamais le mot CRM', () => {
    for (const e of Object.values(T.TRIS)) for (const c of e.criteres) assert.ok(!/crm/i.test(c.libelle), c.libelle);
  });
});
