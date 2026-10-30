// Résolveur de numéros du devis (js/modules/devis/numeros-lignes.js) : M1 chaque forme de numéro, M5 la garde « attendu », P1 la copie vers le serveur et chez les clients.
// Libellés INVENTÉS.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resoudreNumero, resoudreTous, normaliserNumero, ErreurNumero } from '../js/modules/devis/numeros-lignes.js';

const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
const devis = () => [
  { id: 's1', titre: 'Cuisine', lignes: [{ id: 'l11', libelle: 'Prise double 16 A', quantite: 3 }, { id: 'sa', type: 'saut' }, { id: 'l12', libelle: 'Interrupteur va-et-vient', quantite: 2 }] },
  { id: 's2', titre: 'Salle de bain', lignes: [{ id: 'l21', libelle: 'Carrelage mural', quantite: 10 }] },
];
const refus = (f, motif) => assert.throws(f, (e) => e instanceof ErreurNumero && motif.test(e.message), `refus attendu : ${motif}`);

describe('M1 résolveur : chaque forme de numéro', () => {
  test('M1 « 1.2 », « 1,2 », « 1-2 », l’identifiant désignent la même ligne ; le saut de page ne compte pas', () => {
    for (const saisie of ['1.2', '1,2', '1-2', ' 1 . 2 ', 'l12']) {
      const r = resoudreNumero(devis(), saisie);
      assert.deepEqual([r.genre, r.id, r.numero], ['ligne', 'l12', '1.2'], String(saisie));
    }
    assert.equal(normaliserNumero('l12'), null);
    assert.equal(normaliserNumero('1 2'), null, '« 1 2 » ne devient pas « 12 »');
    refus(() => resoudreNumero(devis(), 1.1), /entre guillemets/);
  });
  test('M1 un nombre seul est la section de ce rang ; « 12 » sans section 12 est refusé en disant d’écrire 1.2', () => {
    assert.deepEqual(resoudreNumero(devis(), '2'), { genre: 'section', numero: '2', id: 's2', texte: 'Salle de bain' });
    const douze = devis();
    for (let i = 3; i <= 12; i += 1) douze.push({ id: `s${i}`, titre: `Section ${i}`, lignes: [] });
    assert.equal(resoudreNumero(douze, '12').id, 's12', 'une section de rang 12 existe : « 12 » est cette section');
    refus(() => resoudreNumero(devis(), '12'), /pas de section 12\. Pour la ligne 2 de la section 1, écris 1\.2/);
  });
  test('M1 numéro de ligne inconnu, identifiant inconnu, devis vide : messages simples avec les numéros qui existent', () => {
    refus(() => resoudreNumero(devis(), '1.5'), /pas de ligne 1\.5\. Numéros qui existent : 1, 1\.1, 1\.2, 2, 2\.1/);
    refus(() => resoudreNumero(devis(), 'zzz'), /pas compris « zzz » : dis le numéro avec un point/);
    refus(() => resoudreNumero([], '1.2'), /pas de ligne 1\.2\. Le devis est vide/);
    refus(() => resoudreNumero(devis(), ''), /Il manque le numéro/);
  });
  test('M1 l’id fourni avec le numéro doit correspondre ; tous les numéros d’un appel se lisent dans le devis d’avant l’appel', () => {
    assert.equal(resoudreNumero(devis(), '1.1', { id: 'l11' }).id, 'l11');
    refus(() => resoudreNumero(devis(), '1.1', { id: 'l21' }), /La ligne 1\.1 est maintenant « Prise double 16 A »/);
    const avant = devis();
    const r = resoudreTous(avant, [{ reference: '1.1' }, { reference: '1.2' }]); // « supprime 1.1 et 1.2 » : 1.2 reste celle que l’utilisateur a vue
    assert.deepEqual(r.map((x) => x.id), ['l11', 'l12']);
  });
});

describe('M5 garde « attendu » : mêmes mots, sinon refus avec le libellé exact', () => {
  test('M5 accents, casse, pluriels et mots vides sont ignorés : « proche » passe', () => {
    for (const attendu of ['PRISE DOUBLE 16 a', 'prises doubles 16 A', 'la prise double de 16 A']) {
      assert.equal(resoudreNumero(devis(), '1.1', { attendu }).id, 'l11', attendu);
    }
  });
  test('M5 un mot de plus ou de moins est refusé avec le libellé exact', () => {
    refus(() => resoudreNumero(devis(), '1.1', { attendu: 'Prise double' }), /La ligne 1\.1 est maintenant « Prise double 16 A »/);
    refus(() => resoudreNumero(devis(), '1.1', { attendu: 'Prise double 16 A blanche' }), /La ligne 1\.1 est maintenant « Prise double 16 A »/);
    refus(() => resoudreNumero(devis(), '2', { attendu: 'Cuisine' }), /La section 2 est maintenant « Salle de bain »/);
  });
  test('M5 attendu manquant : refusé seulement quand l’appelant l’exige (modifier, supprimer)', () => {
    assert.equal(resoudreNumero(devis(), '1.1').id, 'l11');
    refus(() => resoudreNumero(devis(), '1.1', { attenduObligatoire: true }), /recopie ce que tu as lu \(attendu\) : « Prise double 16 A »/);
  });
});

describe('P1 copie vers le serveur et chez les clients', () => {
  test('P1 scripts/preparer-fonctions.js copie numeros-lignes.js vers devis-numeros.js (imports réécrits) puis vers la plateforme clients, avant devis-vocabulaire.js', () => {
    const script = lire('scripts/preparer-fonctions.js');
    assert.ok(script.includes("'numeros-lignes.js'"), 'la source js/modules/devis/numeros-lignes.js est lue');
    assert.ok(script.includes("join(destination, 'devis-numeros.js')"), 'la copie functions/partage/devis-numeros.js est écrite');
    assert.ok(/'devis-numeros\.js', 'devis-vocabulaire\.js', 'registre\.js'/.test(script), 'la copie est dans la liste de la plateforme clients, juste avant devis-vocabulaire.js');
    assert.ok(script.includes(`.replaceAll("from './vocabulaire.js'", "from './devis-vocabulaire.js'")`));
    assert.ok(/'propositions\.js'\]/.test(script), 'propositions.js reste le dernier de la liste');
  });
  test('P1 si la copie existe (après `npm run preparer`), elle est la source avec les imports réécrits', () => {
    const copie = fileURLToPath(new URL('../functions/partage/devis-numeros.js', import.meta.url));
    if (!existsSync(copie)) return; // test:logique ne lance pas `npm run preparer`
    const attendu = lire('js/modules/devis/numeros-lignes.js').replaceAll("from './logique.js'", "from './devis.js'").replaceAll("from './vocabulaire.js'", "from './devis-vocabulaire.js'");
    assert.equal(readFileSync(copie, 'utf8'), attendu);
    const plateforme = fileURLToPath(new URL('../functions-plateforme/serveur/partage/devis-numeros.js', import.meta.url));
    if (existsSync(plateforme)) assert.equal(readFileSync(plateforme, 'utf8'), attendu);
  });
});
