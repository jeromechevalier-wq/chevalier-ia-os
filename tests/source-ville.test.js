// Source et Ville (nuit du 22 au 23/10/2026) : logique pure (L3) et règles du serveur MCP (L5).
// L5 : une `source` hors de la liste des Réglages (crm_parametres/listes) est REFUSÉE, avec les sources valides dans le message.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';
import * as M from '../functions/src/coeur/metier.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';

describe('L3 villes regroupées', () => {
  test('L3 : casse, accents et espaces en trop forment une seule clé ; le libellé est la forme la plus fréquente, à égalité la première par ordre alphabétique', () => {
    const villes = L.regrouperVilles(['Manosque', 'Manosque', 'manosque', 'Manosque  ', 'Mànosque', 'Digne', '', null, '   ']);
    assert.deepEqual(villes, [{ cle: 'digne', libelle: 'Digne' }, { cle: 'manosque', libelle: 'Manosque' }]);
    // À égalité (une fois chacune) : la première par ordre alphabétique.
    assert.deepEqual(L.regrouperVilles(['manosque', 'Manosque']), [{ cle: 'manosque', libelle: 'Manosque' }]);
    assert.deepEqual(L.regrouperVilles(['Sete', 'Sète']), [{ cle: 'sete', libelle: 'Sete' }]);
  });
  test('L3 : cocher la clé retrouve toutes les variantes, y compris une ancienne valeur enregistrée telle quelle', () => {
    const personnes = ['Manosque', 'manosque', 'Manosque  ', 'Mànosque', 'Digne'].map((ville, i) => ({ id: `p${i}`, nom: `P${i}`, ville, etiquettes: [] }));
    assert.equal(L.filtrerPersonnes(personnes, { villes: ['manosque'] }).length, 4);
    assert.equal(L.filtrerPersonnes(personnes, { villes: ['Manosque'] }).length, 4);
    assert.equal(L.filtrerPersonnes(personnes, { villes: ['digne', 'manosque'] }).length, 5);
    assert.equal(L.filtrerPersonnes(personnes, {}).length, 5);
    const orgs = [{ id: 'o1', nom: 'A', ville: 'MANOSQUE', etiquettes: [] }, { id: 'o2', nom: 'B', ville: 'Digne', etiquettes: [] }];
    assert.equal(L.filtrerOrganisations(orgs, { villes: ['manosque'] }).length, 1);
  });
  test('L3 : la pastille du filtre affiche le libellé de la ville, pas sa clé', () => {
    const pastilles = L.pastillesFiltres('personnes', { villes: ['manosque'] }, { villes: L.regrouperVilles(['Manosque', 'manosque ']) });
    assert.equal(pastilles.find((p) => p.cle === 'villes').libelle, 'Ville : Manosque');
    assert.equal(L.pastillesFiltres('personnes', { villes: ['Gap'] }).find((p) => p.cle === 'villes').libelle, 'Ville : Gap');
  });
});

/** Un contexte d'écriture de pure mémoire : rend ce qui serait écrit, sans moteur. */
function essai(sources) {
  const collections = { crm_parametres: sources === undefined ? [] : [{ id: 'listes', sources, secteurs: [] }], crm_personnes: [{ id: 'p1', nom: 'Marie Durand', source: '' }], crm_affaires: [{ id: 'a1', titre: 'Site', source: '' }], crm_organisations: [] };
  const ecrites = [];
  const c = {
    donnees: creerAccesMemoire(collections), acteur: 'essai', maintenant: new Date('2026-10-22T10:00:00Z'),
    ecrire: async ({ operations }) => { ecrites.push(...operations); return { operationId: 'op1', ecritures: operations }; },
  };
  return { c, ecrites };
}
const contient = (ecrites, valeur) => JSON.stringify(ecrites).includes(JSON.stringify(valeur));

describe('L5 source = liste des Réglages (MCP)', () => {
  const LISTE = ['Réseau personnel', 'Flyer', 'Événement'];
  const refuse = async (promesse) => {
    await assert.rejects(promesse, (e) => {
      assert.equal(e.code, 'saisie_invalide');
      assert.match(e.message, /absente de la liste des Réglages/);
      assert.match(e.message, /Réseau personnel, Flyer, Événement/, 'le message liste les sources valides');
      assert.match(e.message, /note/, 'le message dit de mettre le détail dans une note');
      return true;
    });
  };

  test('L5 : creer_personne et modifier_personne refusent une source hors liste, sans rien écrire', async () => {
    const { c, ecrites } = essai(LISTE);
    await refuse(M.creerPersonne(c, { nom: 'Paul Martin', source: 'Recommandation de mon cousin Jean' }));
    await refuse(M.modifierPersonne(c, { id: 'p1', source: 'Salon du livre' }));
    assert.equal(ecrites.length, 0);
  });

  test('L5 : creer_affaire et modifier_affaire refusent une source hors liste, sans rien écrire', async () => {
    const { c, ecrites } = essai(LISTE);
    await refuse(M.creerAffaire(c, { titre: 'Nouveau site', source: 'Bouche à oreille' }));
    await refuse(M.modifierAffaire(c, { id: 'a1', source: 'Salon du livre' }));
    assert.equal(ecrites.length, 0);
  });

  test('L5 : la comparaison ignore casse, accents et espaces ; on enregistre le libellé exact de la liste', async () => {
    const { c, ecrites } = essai(LISTE);
    await M.creerPersonne(c, { nom: 'Paul Martin', source: '  reseau   PERSONNEL ' });
    assert.ok(contient(ecrites, 'Réseau personnel'));
    assert.ok(!contient(ecrites, 'reseau'));
    ecrites.length = 0;
    const r = await M.modifierAffaire(c, { id: 'a1', source: 'evenement' });
    assert.deepEqual(r.champsModifies, ['source']);
    assert.ok(contient(ecrites, 'Événement'));
    ecrites.length = 0;
    await M.modifierPersonne(c, { id: 'p1', source: 'FLYER' });
    assert.ok(contient(ecrites, 'Flyer'));
    ecrites.length = 0;
    await M.creerAffaire(c, { titre: 'Autre site', source: 'flyer' });
    assert.ok(contient(ecrites, 'Flyer'));
  });

  test('L5 : une source vide (effacer) reste permise ; un appel sans source n’est pas contrôlé', async () => {
    const { c, ecrites } = essai(LISTE);
    await M.modifierPersonne(c, { id: 'p1', source: '' });
    await M.creerPersonne(c, { nom: 'Sans Source' });
    assert.ok(ecrites.length > 0);
  });

  test('L5 cas vide : liste des Réglages vide ou absente = toute source est refusée, avec l’indication d’en ajouter dans Réglages, Sources', async () => {
    for (const sources of [[], undefined]) {
      const { c } = essai(sources);
      await assert.rejects(M.modifierPersonne(c, { id: 'p1', source: 'Flyer' }), (e) => {
        assert.equal(e.code, 'saisie_invalide');
        assert.match(e.message, /aucune : en ajouter dans Réglages, Sources/);
        return true;
      });
    }
  });
});
