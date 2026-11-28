// Script scripts/donner-or-village.js (28/11/2026) : cadeau de pièces d'or à une personne, depuis le Mac. Seules les parties sans réseau sont testées ici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireArguments, entierDe, nouvelleEcriture, adresseEcriture, cheminPortefeuille, PIECES_MAX } from '../scripts/donner-or-village.js';

const base = ['--projet', 'projet-essai', '--compte', 'a@exemple.fr'];

test('arguments valables : essai à blanc par défaut, --oui pour écrire', () => {
  assert.deepEqual(lireArguments([...base, '--pieces', '1000']), { oui: false, client: '', projet: 'projet-essai', compte: 'a@exemple.fr', pieces: 1000 });
  assert.equal(lireArguments([...base, '--pieces', '5', '--oui']).oui, true);
});

test('arguments refusés : pièces hors bornes, projet ou adresse invalides, argument inconnu', () => {
  for (const p of ['0', '-3', '1.5', 'abc', '1e3', '0x10', ' 5 ', String(PIECES_MAX + 1)]) assert.throws(() => lireArguments([...base, '--pieces', p]));
  assert.throws(() => lireArguments(['--projet', 'X', '--compte', 'a@exemple.fr', '--pieces', '5']));
  assert.throws(() => lireArguments(['--projet', 'projet-essai', '--compte', 'pas-une-adresse', '--pieces', '5']));
  assert.throws(() => lireArguments([...base, '--pieces', '5', '--tout']));
  assert.throws(() => lireArguments([...base, '--pieces', '5', '--client', '../autre']));
});

test('nouveau solde = ancien + pièces, version + 1, « gagne » jamais touché', () => {
  const e = nouvelleEcriture({ or: { integerValue: '10' }, version: { integerValue: '3' }, gagne: { integerValue: '10' } }, 1000, '2026-11-28T09:00:00.000Z');
  assert.equal(e.or, 1010);
  assert.equal(e.version, 4);
  assert.deepEqual(e.masque, ['or', 'version', 'modifieLe']);
  assert.equal(e.corps.fields.gagne, undefined);
});

test('portefeuille absent ou valeurs abîmées : on part de 0', () => {
  assert.equal(nouvelleEcriture(null, 7, 'x').or, 7);
  assert.equal(entierDe({ integerValue: '-4' }), 0);
  assert.equal(entierDe({ stringValue: '12' }), 0);
});

test('adresse de l\'écriture : précondition updateTime si le portefeuille existe, exists=false sinon ; chemin maison ou plateforme', () => {
  const e = nouvelleEcriture(null, 5, 'x');
  assert.equal(adresseEcriture('D', e, { existe: true, updateTime: '2026-11-28T09:00:00.1Z' }),
    'D?updateMask.fieldPaths=or&updateMask.fieldPaths=version&updateMask.fieldPaths=modifieLe&currentDocument.updateTime=2026-11-28T09%3A00%3A00.1Z');
  assert.match(adresseEcriture('D', e, { existe: false }), /&currentDocument\.exists=false$/);
  assert.equal(cheminPortefeuille('', 'U1'), 'village_utilisateurs/U1');
  assert.equal(cheminPortefeuille('c1', 'U1'), 'clients/c1/village_utilisateurs/U1');
});
