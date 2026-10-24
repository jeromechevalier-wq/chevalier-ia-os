// Adresses enregistrées sur les fiches Personne et Organisation (règles pures de js/modules/crm/logique.js).
// Chaque nom de test commence par le numéro du critère (D35, A1 à A7).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const a = (adresse, extra = {}) => ({ id: `id-${adresse}`, libelle: 'Atelier', adresse, parDefaut: false, ...extra });

describe('adresses enregistrées', () => {
  test('D35 une organisation qui n’a que l’ancienne adresse et ville est lue comme une ligne « Principale », sans rien écrire', () => {
    const ancienne = Object.freeze({ nom: 'X', adresse: '12 rue des Lilas', ville: 'Lyon' });
    const liste = L.adressesDe(ancienne);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].libelle, 'Principale');
    assert.equal(liste[0].adresse, '12 rue des Lilas\nLyon');
    assert.deepEqual(L.adressesDe({ nom: 'X', adresse: '', ville: 'Lyon' }), [], 'une ville seule n’est pas une adresse');
    assert.deepEqual(L.adressesDe({ nom: 'Sans adresse' }), []);
    assert.equal(L.adressesDe({ adresse: '12 rue des Lilas, Lyon', ville: 'lyon' })[0].adresse, '12 rue des Lilas, Lyon', 'la ville déjà dans l’adresse n’est pas répétée');
  });

  test('D35 dès qu’une liste existe, elle l’emporte sur les anciens champs', () => {
    const liste = L.adressesDe({ adresse: 'ancienne', ville: 'Lyon', adresses: [a('1 rue Neuve')] });
    assert.deepEqual(liste.map((x) => x.adresse), ['1 rue Neuve']);
  });

  test('A1 patchAdresses nettoie, pose libellé par défaut et identifiant', () => {
    const { erreur, patch } = L.patchAdresses([{ libelle: '  ', adresse: '  3 rue   Haute \n\n  06000 Nice  ' }]);
    assert.equal(erreur, '');
    assert.equal(patch.adresses.length, 1);
    assert.equal(patch.adresses[0].libelle, 'Adresse');
    assert.equal(patch.adresses[0].adresse, '3 rue Haute\n06000 Nice');
    assert.ok(patch.adresses[0].id);
    assert.equal(patch.adresses[0].parDefaut, false);
  });

  test('A2 une adresse vide, un doublon exact ou plus de 10 adresses sont refusés avec un message qui dit quoi faire', () => {
    assert.match(L.patchAdresses([a('  \n ')]).erreur, /Écrivez l’adresse/);
    assert.match(L.patchAdresses([a('1 rue Neuve'), a('1  RUE neuve', { id: 'autre' })]).erreur, /déjà dans la liste.*retirez le doublon/);
    const onze = Array.from({ length: 11 }, (_, i) => a(`${i} rue Haute`));
    assert.match(L.patchAdresses(onze).erreur, /Au plus 10 adresses/);
    assert.equal(L.patchAdresses(onze.slice(0, 10)).erreur, '');
    assert.equal(L.MAX_ADRESSES, 10);
    assert.deepEqual(L.patchAdresses([a('')]).patch, {}, 'rien à écrire en cas d’erreur');
  });

  test('A4 une seule adresse « par défaut » : la dernière cochée l’emporte', () => {
    const { patch } = L.patchAdresses([a('1 rue A', { parDefaut: true }), a('2 rue B'), a('3 rue C', { parDefaut: true })]);
    assert.deepEqual(patch.adresses.map((x) => x.parDefaut), [false, false, true]);
    assert.deepEqual(L.adressesDe({ adresses: [a('1 rue A', { parDefaut: true }), a('2 rue B', { parDefaut: true })] }).map((x) => x.parDefaut), [true, false]);
  });

  test('A7 patchAdresses ne touche jamais aux anciens champs adresse et ville', () => {
    const { patch } = L.patchAdresses(L.adressesDe({ adresse: '12 rue des Lilas', ville: 'Lyon' }));
    assert.deepEqual(Object.keys(patch), ['adresses']);
    assert.equal(patch.adresses[0].libelle, 'Principale');
  });

  test('A1 une nouvelle personne ou organisation reçoit ses adresses ; sans adresse, aucun champ n’est ajouté', () => {
    const p = L.nouvellePersonne({ nom: 'Alice Test', adresses: [a('1 rue A')] }, {});
    assert.equal(p.adresses.length, 1);
    assert.equal('adresses' in L.nouvellePersonne({ nom: 'Alice Test' }, {}), false);
    assert.equal(L.nouvelleOrganisation({ nom: 'Boutique', adresses: [a('1 rue A')] }, {}).adresses.length, 1);
    assert.equal('adresses' in L.nouvelleOrganisation({ nom: 'Boutique' }, {}), false);
  });

  test('A1 la recherche trouve une organisation ou une personne par une de ses adresses', () => {
    const orgs = [{ id: 'o1', nom: 'Boutique', adresses: [a('4 impasse des Roses')] }, { id: 'o2', nom: 'Autre', adresse: '9 quai du Port' }];
    assert.deepEqual(L.filtrerOrganisations(orgs, { recherche: 'roses' }).map((o) => o.id), ['o1']);
    assert.deepEqual(L.filtrerOrganisations(orgs, { recherche: 'quai' }).map((o) => o.id), ['o2']);
    assert.deepEqual(L.filtrerPersonnes([{ id: 'p1', nom: 'Alice', adresses: [a('4 impasse des Roses')] }], { recherche: 'impasse' }).map((p) => p.id), ['p1']);
  });

  test('A2 validerPersonne et validerOrganisation signalent une liste d’adresses refusée', () => {
    assert.ok(L.validerPersonne({ nom: 'Alice', adresses: [a('')] }).adresses);
    assert.ok(L.validerOrganisation({ nom: 'Boutique', adresses: [a('1 rue A'), a('1 rue A', { id: 'z' })] }).adresses);
    assert.deepEqual(L.validerOrganisation({ nom: 'Boutique', adresses: [a('1 rue A')] }), {});
  });
});

test('A2 deux lignes de même identifiant reçoivent des identifiants distincts', () => {
  const { patch } = L.patchAdresses([{ id: 'x', adresse: '1 rue A' }, { id: 'x', adresse: '2 rue B' }]);
  assert.equal(new Set(patch.adresses.map((a) => a.id)).size, 2);
});
