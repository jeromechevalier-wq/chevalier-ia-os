// Mode test, PR 1a-1 : le repère `test` et le libellé « [TEST] » (fonctions pures, aussi copiées au serveur).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';
import * as P from '../js/modules/projets/logique.js';
import { nouveauDevis } from '../js/modules/devis/logique.js';

const ctx = { maintenant: '2026-11-02T10:00:00.000Z', auteur: 'a@b.fr', nouvelId: (c) => `${c}-1`, config: undefined };
const constructeurs = {
  personne: (v) => L.nouvellePersonne({ nom: 'Marie Durand', ...v }, ctx),
  organisation: (v) => L.nouvelleOrganisation({ nom: 'Durand SARL', ...v }, ctx),
  affaire: (v) => L.nouvelleAffaire({ titre: 'Audit', ...v }, ctx),
  activite: (v) => L.nouvelleActivite({ type: 'appel', ...v }, ctx),
  projet: (v) => P.nouveauProjet({ titre: 'Chantier', ...v }, ctx),
  tache: (v) => P.nouvelleTache({ titre: 'Livrable', projetId: 'p1', ...v }, ctx),
  devis: (v) => { const { id, ...d } = nouveauDevis({ ...v }, { ...ctx, id: 'd1' }, {}); return d; },
};

describe('1 le repère `test` : absent = réel, gardé seulement quand on le donne', () => {
  for (const [nom, fabriquer] of Object.entries(constructeurs)) {
    test(`1 ${nom} : sans repère, le champ n’existe pas ; avec test: true il est gardé ; test: false ou autre valeur ne l’écrit pas`, () => {
      assert.equal('test' in fabriquer({}), false, 'jamais ajouté de lui-même');
      assert.equal(fabriquer({ test: true }).test, true);
      for (const faux of [false, 'true', 1, null, undefined]) assert.equal('test' in fabriquer({ test: faux }), false, String(faux));
    });
  }
  test('1 une note garde test: true quand le lien le porte, et la liste exacte de ses clés ne change pas sans lui', () => {
    assert.equal(L.nouvelleNote('x', { affaireId: 'a1', test: true }, ctx).test, true);
    assert.deepEqual(Object.keys(L.nouvelleNote('x', { affaireId: 'a1' }, ctx)).sort(), ['affaireId', 'auteur', 'organisationId', 'personneId', 'texte']);
  });
});

describe('2 libelleAvecTest : calculé à l’affichage, rien dans le nom', () => {
  test('2 « [TEST] Nom » seulement si test === true', () => {
    assert.equal(L.libelleAvecTest('Dupont', true), '[TEST] Dupont');
    for (const reel of [false, undefined, null, 'true', 1]) assert.equal(L.libelleAvecTest('Dupont', reel), 'Dupont');
  });
  test('2 un nom vide ou absent ne plante pas', () => {
    assert.equal(L.libelleAvecTest(undefined, false), '');
    assert.equal(L.libelleAvecTest(null, true), '[TEST] ');
  });
  test('2 estTest : vrai seulement pour test: true (false et absent = réel)', () => {
    assert.equal(L.estTest({ test: true }), true);
    for (const f of [{ test: false }, {}, null, undefined]) assert.equal(L.estTest(f), false);
  });
  test('2 les constructeurs ne mettent jamais « [TEST] » dans le nom stocké', () => {
    assert.equal(constructeurs.personne({ test: true }).nom, 'Marie Durand');
    assert.equal(constructeurs.affaire({ test: true }).titre, 'Audit');
    assert.equal(constructeurs.projet({ test: true }).titre, 'Chantier');
  });
});

describe('3 menu « … » d’un devis : « Marquer comme test » avant « Archiver »', async () => {
  const Li = await import('../js/modules/devis/liste.js');
  const entree = (l, cle) => l.find((e) => e.cle === cle);
  test('3 brouillon : entrée active, juste avant Archiver ; « Ce n’est plus un test » quand il est marqué', () => {
    const l = Li.entreesActionsDevis({ statut: 'brouillon' });
    const cles = l.filter((e) => e.cle).map((e) => e.cle);
    assert.ok(cles.indexOf('marquer_test') > -1 && cles.indexOf('marquer_test') < cles.indexOf('archiver'));
    assert.deepEqual([entree(l, 'marquer_test').libelle, entree(l, 'marquer_test').actif], ['Marquer comme test', true]);
    assert.equal(entree(Li.entreesActionsDevis({ statut: 'brouillon', test: true }), 'marquer_test').libelle, 'Ce n’est plus un test');
  });
  test('3 devis finalisé DEV- : entrée ACTIVE « Marquer comme test » (plus de « bientôt disponible ») ; TEST- marqué : « Ce n’est plus un test » grisée avec sa phrase', () => {
    for (const statut of ['en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace']) {
      const l = Li.entreesActionsDevis({ statut, numero: 'DEV-2026-11-05-001' });
      const e = entree(l, 'marquer_test');
      assert.deepEqual([e.actif, e.libelle], [true, 'Marquer comme test'], statut);
      assert.equal(Li.entreesActionsDevis({ statut, numero: 'DEV-2026-11-05-001', test: true }).find((x) => x.cle === 'marquer_test').libelle, 'Ce n’est plus un test');
    }
    const t = Li.entreesActionsDevis({ statut: 'en_attente_envoi', numero: 'TEST-001', test: true });
    assert.deepEqual([entree(t, 'marquer_test').actif, entree(t, 'marquer_test').libelle], [false, 'Ce n’est plus un test']);
    assert.ok(t.some((x) => x.texte === Li.MESSAGE_TEST_FINALISE_FIGE && /TEST-/.test(x.texte)));
    assert.equal(entree(Li.entreesActionsDevis({ statut: 'en_attente_envoi', numero: 'TEST-001', test: false }), 'marquer_test').actif, true, 'un TEST- non marqué (donnée incohérente) reste actionnable : le serveur tranche');
  });
  test('14 phraseFinalisationTest : essai, racine DEV- avec brouillon marqué, réel', () => {
    assert.match(Li.phraseFinalisationTest({ test: true, raison: 'affaire' }), /devis de test.*TEST-.*compteur séparé.*aucune statistique/);
    assert.match(Li.phraseFinalisationTest({ test: false, raison: null }, 'DEV-2026-11-05-001', true), /garde son numéro DEV-2026-11-05-001.*vrai devis/);
    assert.equal(Li.phraseFinalisationTest({ test: false, raison: null }, null, false), '');
    assert.match(Li.phraseFinalisationTest({ test: true, raison: 'racine' }, 'DEV-2026-11-05-001'), /reste un devis de test.*garde son numéro DEV-2026-11-05-001/);
    assert.match(Li.phraseFinalisationTest({ test: false, raison: null }, null, false, true), /peut passer en TEST-/);
  });
});
