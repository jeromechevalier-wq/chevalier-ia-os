// Mode test, PR 4 : « Supprimer tous mes tests » (docs/cadrage-mode-test.md §9). Plan pur (4), cœur serveur en mémoire (5), restauration (8).
// Exemples chiffrés : un devis de test à 100 € HT ; un devis réel à 1 200 € HT. Le nom de chaque test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { planSupprimerTests } from '../functions/partage/logique.js';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import { supprimerTousLesTests, apercuSuppressionTests } from '../functions/src/coeur/mode-test.js';
import { restaurerOperation } from '../functions/src/coeur/restaurer.js';
import { ErreurDevis } from '../functions/src/coeur/devis.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-11-05T10:00:00Z');
const ctx = () => ({ acteur: ACTEUR, jeton: ACTEUR, via: 'ecran', maintenant: MAINTENANT });
const devis = (id, extra = {}) => ({ id, racineId: id, version: 1, statut: 'brouillon', numero: null, objet: `Devis ${id}`, affaireId: null, test: true, ...extra });
const finalise = (id, numero, extra = {}) => devis(id, { statut: 'finalise', numero, totaux: { ht: 100, ttc: 120, tva: 20 }, ...extra });
const cles = (ecritures) => ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`);

/** Un monde complet : tout ce qui est de test, plus du réel relié à du test. */
function mondeComplet() {
  return {
    personnes: [{ id: 'pt', nom: 'Paul Essai', test: true, organisationId: 'ot' }, { id: 'pr', nom: 'Réelle', organisationId: null }],
    organisations: [{ id: 'ot', nom: 'Société essai', test: true }, { id: 'or', nom: 'Réelle' }],
    affaires: [{ id: 'at', titre: 'Affaire essai', test: true, personneId: 'pt', organisationId: 'ot' }, { id: 'ar', titre: 'Affaire réelle', personneId: 'pt', organisationId: 'or' }],
    projets: [{ id: 'jt', titre: 'Projet essai', test: true, affaireId: 'at' }, { id: 'jr', titre: 'Projet réel', affaireId: 'at', personneId: 'pr' }],
    taches: [{ id: 'k1', projetId: 'jt', titre: 'Tâche' }, { id: 'k2', projetId: 'jr', titre: 'Tâche réelle' }],
    activites: [{ id: 'ac1', titre: 'Appel', test: true, affaireId: 'at' }],
    notes: [{ id: 'n1', texte: 'Note de test', test: true, affaireId: 'at' }, { id: 'n2', texte: 'Note réelle', affaireId: 'at', personneId: 'pr' }],
    evenements: [{ id: 'e1', titre: 'Fil', affaireId: 'at' }, { id: 'e2', titre: 'Fil réel', affaireId: 'ar' }],
    devis: [devis('b1', { affaireId: 'at' }), finalise('t1', 'TEST-001', { affaireId: 'at' }), finalise('r1', 'DEV-2026-11-05-001', { test: undefined, ht: 1200, affaireId: 'ar' }), finalise('m1', 'DEV-2026-11-05-002', { affaireId: 'at' })],
  };
}

describe('4 plan pur : planSupprimerTests', () => {
  test('4a une personne, une organisation, une affaire, un projet avec tâche, activité, note, brouillon et TEST-001 à 100 € HT : supprimés, comptes exacts, bon ordre', () => {
    const p = planSupprimerTests({
      personnes: [{ id: 'p', nom: 'Paul Essai', test: true }], organisations: [{ id: 'o', nom: 'Org', test: true }], affaires: [{ id: 'a', titre: 'Aff', test: true }], projets: [{ id: 'j', titre: 'Pro', test: true }],
      taches: [{ id: 'k', projetId: 'j' }], activites: [{ id: 'ac', test: true }], notes: [{ id: 'n', test: true }], devis: [devis('b'), finalise('t', 'TEST-001')],
    });
    assert.deepEqual(p.comptes, { devis: 2, taches: 1, projets: 1, activites: 1, notes: 1, evenements: 0, affaires: 1, personnes: 1, organisations: 1 });
    assert.equal(p.total, 9);
    assert.deepEqual(cles(p.devisFinalises), ['supprimer:devis_devis/t']);
    assert.deepEqual(cles(p.reste), ['supprimer:devis_devis/b', 'supprimer:projets_taches/k', 'supprimer:projets_projets/j', 'supprimer:crm_activites/ac', 'supprimer:crm_notes/n', 'supprimer:crm_affaires/a', 'supprimer:crm_personnes/p', 'supprimer:crm_organisations/o']);
    assert.match(p.noms[0], /Devis b|devis_devis/);
  });
  test('4b un DEV-2026-11-05-001 marqué test n’est jamais dans les écritures et figure dans relies', () => {
    const p = planSupprimerTests({ devis: [finalise('m', 'DEV-2026-11-05-001')] });
    assert.equal(p.total, 0);
    assert.deepEqual([...p.devisFinalises, ...p.reste], []);
    assert.equal(p.relies.length, 1);
    assert.match(p.relies[0].raison, /DEV-2026-11-05-001/);
  });
  test('4c réel relié : note réelle gardée avec affaireId vidé, affaire réelle gardée avec personneId null, projet réel détaché, organisation de test avec personne réelle gardée', () => {
    const m = mondeComplet();
    const p = planSupprimerTests(m);
    const toutes = [...p.devisFinalises, ...p.reste];
    assert.ok(!cles(toutes).includes('supprimer:crm_notes/n2') && !cles(toutes).includes('supprimer:crm_affaires/ar') && !cles(toutes).includes('supprimer:projets_projets/jr'));
    assert.deepEqual(toutes.find((e) => e.collection === 'crm_notes' && e.id === 'n2').patch, { affaireId: null });
    assert.deepEqual(toutes.find((e) => e.collection === 'crm_affaires' && e.id === 'ar').patch, { personneId: null });
    assert.deepEqual(toutes.find((e) => e.collection === 'projets_projets' && e.id === 'jr').patch, { affaireId: null });
    // organisation de test qui garde une personne réelle
    const q = planSupprimerTests({ organisations: [{ id: 'o', nom: 'Org', test: true }], personnes: [{ id: 'p', nom: 'Réel', organisationId: 'o' }] });
    assert.equal(q.total, 0);
    assert.match(q.relies[0].raison, /1 personne/);
    for (const id of ['n2', 'ar', 'jr', 'm1']) assert.ok(p.relies.some((r) => r.id === id), `${id} listé`);
  });
  test('4d les événements du fil d’une affaire supprimée partent ; ceux d’une affaire réelle restent', () => {
    const p = planSupprimerTests(mondeComplet());
    const toutes = cles([...p.devisFinalises, ...p.reste]);
    assert.ok(toutes.includes('supprimer:crm_evenements/e1'));
    assert.ok(!toutes.includes('supprimer:crm_evenements/e2'));
  });
  test('4e devisFinalises ne contient que des TEST- finalisés, reste le reste, aucun doublon', () => {
    const p = planSupprimerTests(mondeComplet());
    assert.deepEqual(cles(p.devisFinalises), ['supprimer:devis_devis/t1']);
    const toutes = cles([...p.devisFinalises, ...p.reste]);
    assert.equal(new Set(toutes).size, toutes.length);
    assert.ok(toutes.includes('supprimer:devis_devis/b1'));
    assert.ok(!toutes.includes('supprimer:devis_devis/m1') && !toutes.includes('supprimer:devis_devis/r1'));
  });
  test('4f liste vide : total 0, aucune écriture', () => {
    const p = planSupprimerTests({ personnes: [{ id: 'p', nom: 'Réel' }], devis: [finalise('r', 'DEV-2026-11-05-001', { test: undefined })] });
    assert.equal(p.total, 0);
    assert.deepEqual([...p.devisFinalises, ...p.reste], []);
    assert.deepEqual(planSupprimerTests().noms, []);
  });
  test('4g compteurTestAVider : vrai quand plus aucun TEST- ne reste, faux si une racine TEST- abîmée reste', () => {
    assert.equal(planSupprimerTests({ devis: [finalise('t', 'TEST-001')] }).compteurTestAVider, true);
    assert.equal(planSupprimerTests({ devis: [finalise('m', 'DEV-2026-11-05-002')] }).compteurTestAVider, true, 'un DEV- marqué test n’empêche pas la remise à zéro');
    assert.equal(planSupprimerTests({ devis: [finalise('t', 'TEST-001'), finalise('x', 'TEST-002', { test: undefined })] }).compteurTestAVider, false);
    assert.equal(planSupprimerTests({ devis: [finalise('v1', 'TEST-001', { racineId: 'v1' }), finalise('v2', 'TEST-001', { racineId: 'v1', version: 2, test: undefined })] }).compteurTestAVider, false, 'racine à moitié marquée : gardée entière');
  });
  test('4h un événement d’un projet réel lié à une affaire de test est gardé, lien vidé ; un devis réel lié à une personne de test est listé, non supprimé ; relies sans doublon', () => {
    const p = planSupprimerTests({
      affaires: [{ id: 'a', titre: 'Aff', test: true }], projets: [{ id: 'j', titre: 'Projet réel', affaireId: 'a' }], personnes: [{ id: 'pt', nom: 'Paul Essai', test: true }],
      evenements: [{ id: 'e1', affaireId: 'a', projetId: 'j' }, { id: 'e2', affaireId: 'a' }],
      devis: [finalise('r', 'DEV-2026-11-05-001', { test: undefined, affaireId: null, personneId: 'pt' }), finalise('v1', 'DEV-2026-11-05-002', { racineId: 'v1', affaireId: 'a' }), finalise('v2', 'DEV-2026-11-05-002', { racineId: 'v1', version: 2, affaireId: 'a' })],
    });
    const toutes = [...p.devisFinalises, ...p.reste];
    assert.ok(!cles(toutes).includes('supprimer:crm_evenements/e1'), 'l’événement du projet réel reste');
    assert.deepEqual(toutes.find((e) => e.collection === 'crm_evenements' && e.id === 'e1').patch, { affaireId: null });
    assert.ok(cles(toutes).includes('supprimer:crm_evenements/e2'), 'le fil de l’affaire seule part');
    assert.ok(!cles(toutes).some((c) => c.includes('devis_devis')), 'aucun devis supprimé');
    assert.ok(p.relies.some((r) => r.id === 'r' && /sa personne/.test(r.raison)));
    assert.equal(p.relies.filter((r) => r.id === 'v1').length, 1, 'une racine gardée n’est listée qu’une fois');
    const cl = p.relies.map((r) => `${r.collection}/${r.id}`);
    assert.equal(new Set(cl).size, cl.length);
  });
});

function monde(extra = {}) {
  const m = mondeComplet();
  const collections = {
    [C.personnes]: m.personnes, [C.organisations]: m.organisations, [C.affaires]: m.affaires, [C.projets]: m.projets, [C.projetsTaches]: m.taches, [C.activites]: m.activites,
    [C.notes]: m.notes, [C.evenements]: m.evenements, [C.devis]: m.devis, [C.devisCompteurs]: [{ id: 'test', valeur: 2 }, { id: 'global', valeur: 5 }], [C.audit]: [], [C.auditAvant]: [], ...extra,
  };
  return { collections, donnees: creerAccesMemoire(collections) };
}
const photo = (m) => JSON.stringify(m.collections);
const compteur = (m, id) => m.collections[C.devisCompteurs].find((x) => x.id === id);

describe('5 cœur serveur : supprimerTousLesTests', () => {
  test('5a l’aperçu n’écrit rien ; une empreinte fausse ou absente avec apercu: false est refusée sans écrire', async () => {
    const m = monde();
    const avant = photo(m);
    const r = await supprimerTousLesTests({ donnees: m.donnees, ctx: ctx() });
    assert.equal(r.tests.apercu, true);
    assert.ok(r.tests.total > 0 && r.tests.empreinte);
    assert.equal(photo(m), avant);
    for (const empreinte of [null, 'fausse']) {
      await assert.rejects(supprimerTousLesTests({ donnees: m.donnees, ctx: ctx(), apercu: false, empreinte }), (e) => e instanceof ErreurDevis && e.code === 'demande_invalide' && /a changé/.test(e.message));
    }
    assert.equal(photo(m), avant);
    assert.equal(m.collections[C.audit].length, 0);
  });
  test('5b bonne empreinte : documents disparus, deux operationId (A : seulement des TEST- ; B : le reste), une copie « avant » par document supprimé', async () => {
    const m = monde();
    const { plan, apercu } = await apercuSuppressionTests({ donnees: m.donnees });
    const r = await supprimerTousLesTests({ donnees: m.donnees, ctx: ctx(), apercu: false, empreinte: apercu.empreinte });
    assert.equal(r.tests.supprime, true);
    const { devisFinalises, reste } = r.tests.operationIds;
    assert.ok(devisFinalises && reste && devisFinalises !== reste);
    const lotA = m.collections[C.audit].filter((l) => l.operationId === devisFinalises);
    assert.deepEqual(lotA.map((l) => `${l.collection}/${l.docId}`), ['devis_devis/t1']);
    assert.ok(lotA.every((l) => l.outil === 'supprimerTousLesTests'));
    const supprimes = m.collections[C.audit].filter((l) => l.action === 'supprimer');
    assert.equal(supprimes.length, plan.total);
    assert.equal(m.collections[C.auditAvant].filter((a) => supprimes.some((l) => l.operationId === a.operationId && l.docId === a.docId)).length, plan.total);
    for (const [coll, id] of [[C.personnes, 'pt'], [C.affaires, 'at'], [C.devis, 'b1'], [C.devis, 't1'], [C.notes, 'n1'], [C.projets, 'jt']]) assert.equal(m.collections[coll].some((d) => d.id === id), false, `${coll}/${id}`);
    for (const [coll, id] of [[C.personnes, 'pr'], [C.affaires, 'ar'], [C.notes, 'n2'], [C.devis, 'r1'], [C.devis, 'm1']]) assert.equal(m.collections[coll].some((d) => d.id === id), true, `${coll}/${id} reste`);
    assert.equal(m.collections[C.notes].find((n) => n.id === 'n2').affaireId, null);
  });
  test('5c le compteur test passe de 2 à 0 ; global reste à 5 ; un DEV- marqué test qui reste ne l’empêche pas', async () => {
    const m = monde();
    const { apercu } = await apercuSuppressionTests({ donnees: m.donnees });
    const r = await supprimerTousLesTests({ donnees: m.donnees, ctx: ctx(), apercu: false, empreinte: apercu.empreinte });
    assert.equal(r.tests.compteurTestRemis, true);
    assert.equal(compteur(m, 'test').valeur, 0);
    assert.equal(compteur(m, 'global').valeur, 5);
    assert.equal(m.collections[C.devis].some((d) => d.id === 'm1'), true);
  });
  test('5d une racine TEST- abîmée (sans repère test) qui reste : le compteur n’est pas remis ; une base sans test : rien, aucune écriture', async () => {
    const m = monde({ [C.devis]: [finalise('t1', 'TEST-001'), finalise('x', 'TEST-002', { test: undefined })] });
    const { apercu } = await apercuSuppressionTests({ donnees: m.donnees });
    const r = await supprimerTousLesTests({ donnees: m.donnees, ctx: ctx(), apercu: false, empreinte: apercu.empreinte });
    assert.equal(r.tests.compteurTestRemis, false);
    assert.equal(compteur(m, 'test').valeur, 2);
    const vide = creerAccesMemoire({ [C.devis]: [], [C.audit]: [] });
    assert.deepEqual((await supprimerTousLesTests({ donnees: vide, ctx: ctx(), apercu: false, empreinte: 'x' })).tests, { rien: true, total: 0, comptes: planSupprimerTests().comptes, relies: [] });
  });
});

describe('8 restauration', () => {
  test('8a restaurer_depuis_audit sur le lot A (devis TEST- finalisé) est refusé : un test supprimé reste supprimé', async () => {
    const m = monde();
    const { apercu } = await apercuSuppressionTests({ donnees: m.donnees });
    const r = await supprimerTousLesTests({ donnees: m.donnees, ctx: ctx(), apercu: false, empreinte: apercu.empreinte });
    await assert.rejects(restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: r.tests.operationIds.devisFinalises, apercu: false }), /test supprimé reste supprimé/);
    assert.equal(m.collections[C.devis].some((d) => d.id === 't1'), false);
  });
  test('8b restaurer le lot B : la personne, l’affaire et le brouillon de test reviennent avec test: true, la note réelle retrouve son affaireId, le compteur n’est pas touché', async () => {
    const m = monde();
    const { apercu } = await apercuSuppressionTests({ donnees: m.donnees });
    const r = await supprimerTousLesTests({ donnees: m.donnees, ctx: ctx(), apercu: false, empreinte: apercu.empreinte });
    await restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: r.tests.operationIds.reste, apercu: false });
    const lire = (coll, id) => m.collections[coll].find((d) => d.id === id);
    assert.equal(lire(C.personnes, 'pt')?.test, true);
    assert.equal(lire(C.affaires, 'at')?.test, true);
    assert.equal(lire(C.devis, 'b1')?.test, true);
    assert.equal(lire(C.notes, 'n2').affaireId, 'at');
    assert.equal(lire(C.devis, 't1'), undefined, 'le TEST- finalisé ne revient pas');
    assert.equal(compteur(m, 'test').valeur, 0, 'la restauration ne touche pas au compteur (un doublon de numéro TEST- est sans gravité, cadrage §8.4)');
  });
});
