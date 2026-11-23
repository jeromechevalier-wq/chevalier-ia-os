// Tableau de bord, partie B2 : le serveur accepte le format `euros4` (liste fermée des formats), partout où un format se nomme. Nom de chaque test : B2.9.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validerReglages, FORMATS, ErreurPilotage } from '../functions/src/pilotage/reglages.js';
import * as F from '../js/modules/pilotage/formats.js';

const OPTION = JSON.stringify({ xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar' }] });
const reglage = (tuiles) => ({ groupes: {}, tableau: { titre: 'T', tuiles } });

test('B2.9 euros4 est permis (valeur d\'un chiffre, colonne de tableau, formats d\'un graphique) et les listes du serveur et de l\'écran sont identiques', () => {
  assert.deepEqual([...FORMATS], [...F.FORMATS]);
  assert.ok(FORMATS.includes('euros4'));
  const v = validerReglages(reglage([
    { id: 'c', type: 'chiffre', titre: 'Coût', vue: 'v_exemple_c', valeur: { colonne: 'cout', format: 'euros4' } },
    { id: 't', type: 'tableau', titre: 'Coûts', vue: 'v_exemple_t', colonnes: [{ colonne: 'cout', titre: 'Coût', format: 'euros4' }] },
    { id: 'g', titre: 'Courbe', vue: 'v_exemple_g', option: OPTION, formats: { axeY: 'euros4' } },
  ]));
  assert.equal(v.tableau.tuiles[0].valeur.format, 'euros4');
  assert.equal(v.tableau.tuiles[1].colonnes[0].format, 'euros4');
  assert.equal(v.tableau.tuiles[2].formats.axeY, 'euros4');
  assert.throws(() => validerReglages(reglage([{ id: 'c', type: 'chiffre', titre: 'Coût', vue: 'v_exemple_c', valeur: { colonne: 'cout', format: 'euros5' } }])), (e) => e instanceof ErreurPilotage && /format inconnu/.test(e.message));
});
