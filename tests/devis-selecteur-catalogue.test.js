// Module Devis, sélecteur du catalogue (PR C1 de docs/cadrage-vocabulaire-cibles.md) : l'arbre famille › sous-famille › articles. Articles et familles INVENTÉS.
// C1.1 le rangement ; C1.2 ce qui n'est jamais choisissable ; C1.3 le chemin à ouvrir ; C1.4 les textes ; C1.5 le composant garde son nom accessible et sa zone.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FAMILLES_PAR_DEFAUT } from '../js/modules/devis/familles.js';
import { arbreCatalogue, cheminDansArbre, ID_SANS_FAMILLE, MESSAGE_CATALOGUE_VIDE, MESSAGE_FAMILLE_SANS_ARTICLE } from '../js/modules/devis/selecteur-catalogue-logique.js';

const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
const ELECTRICITE = 'famille-1-8'; // Fournitures › Électricité (famille de départ)
const articles = [
  { id: 'a1', libelle: 'Prise double', familleId: ELECTRICITE, type: 'fourniture' },
  { id: 'a2', libelle: 'Interrupteur simple', familleId: ELECTRICITE, type: 'fourniture' },
  { id: 'a3', libelle: 'Vis', type: 'fourniture' }, // ancien article sans famille : la famille de départ de son type (Fournitures)
  { id: 'a4', libelle: 'Introduction', type: 'texte' }, // ligne de texte : jamais choisissable
  { id: 'a5', libelle: 'Ancien câble', familleId: ELECTRICITE, type: 'fourniture', actif: false }, // désactivé
  { id: 'a6', libelle: 'Orpheline', familleId: 'famille-inconnue' },
];
const trouver = (arbre, id) => arbre.flatMap((f) => [f, ...f.enfants]).find((n) => n.id === id);

describe('C1.1 arbreCatalogue : le rangement', () => {
  test('C1.1 un article va dans sa sous-famille, trié par libellé ; la famille parent le compte', () => {
    const arbre = arbreCatalogue(articles, FAMILLES_PAR_DEFAUT);
    assert.deepEqual(trouver(arbre, ELECTRICITE).articles.map((a) => a.id), ['a2', 'a1']);
    assert.equal(trouver(arbre, ELECTRICITE).niveau, 2);
    const fournitures = trouver(arbre, 'famille-1');
    assert.deepEqual(fournitures.articles.map((a) => a.id), ['a3']); // sans famille : celle de son type
    assert.equal(fournitures.nombre, 3); // 1 directement + 2 dans Électricité
    assert.deepEqual(arbre.slice(0, 7).map((f) => f.niveau), Array(7).fill(1));
  });
  test('C1.1 une famille sans article reste dans l’arbre, avec zéro', () => {
    const materiels = trouver(arbreCatalogue(articles, FAMILLES_PAR_DEFAUT), 'famille-5');
    assert.deepEqual([materiels.articles, materiels.nombre], [[], 0]);
  });
});

describe('C1.2 jamais choisissable', () => {
  test('C1.2 un texte, un article désactivé et une famille désactivée ne sont pas proposés tels quels', () => {
    const familles = FAMILLES_PAR_DEFAUT.map((f) => (f.id === ELECTRICITE ? { ...f, actif: false } : f));
    const arbre = arbreCatalogue(articles, familles);
    const tous = arbre.flatMap((f) => [...f.articles, ...f.enfants.flatMap((e) => e.articles)]).map((a) => a.id);
    assert.ok(!tous.includes('a4') && !tous.includes('a5'));
    assert.equal(trouver(arbre, ELECTRICITE), undefined); // la famille désactivée n'apparaît pas…
    assert.deepEqual(trouver(arbre, ID_SANS_FAMILLE).articles.map((a) => a.id), ['a2', 'a6', 'a1']); // …ses articles passent dans « Sans famille » (par libellé)
  });
  test('C1.2 aucune exception sur des entrées absentes ou mal formées', () => {
    assert.deepEqual(arbreCatalogue(null, null).length, 0);
    assert.doesNotThrow(() => arbreCatalogue([null, undefined, {}], [{ id: 'x' }, null].filter(Boolean)));
  });
});

describe('C1.3 cheminDansArbre', () => {
  test('C1.3 donne la famille et la sous-famille à ouvrir pour montrer un article', () => {
    const arbre = arbreCatalogue(articles, FAMILLES_PAR_DEFAUT);
    assert.deepEqual(cheminDansArbre(arbre, 'a1'), ['famille-1', ELECTRICITE]);
    assert.deepEqual(cheminDansArbre(arbre, 'a3'), ['famille-1']);
    assert.deepEqual(cheminDansArbre(arbre, 'inconnu'), []);
  });
});

describe('C1.4 / C1.5 textes et composant', () => {
  test('C1.4 les textes du cas vide (catalogue, famille)', () => {
    assert.equal(MESSAGE_CATALOGUE_VIDE, 'Ton catalogue est vide : crée tes articles dans le catalogue.');
    assert.equal(MESSAGE_FAMILLE_SANS_ARTICLE, 'Aucun article dans cette famille.');
  });
  test('C1.5 le champ garde son nom accessible et la zone « article choisi » ; l’écran n’a plus son propre sélecteur', () => {
    const composant = lire('js/modules/devis/selecteur-catalogue.js');
    assert.match(composant, /'aria-label': 'Chercher un article du catalogue'/);
    assert.match(composant, /dataset: \{ role: 'article-choisi' \}/);
    const ecran = lire('js/modules/devis/vocabulaire-ecran.js');
    assert.match(ecran, /selecteurCatalogue\(/);
    assert.doesNotMatch(ecran, /resultats-composants/);
  });
});
