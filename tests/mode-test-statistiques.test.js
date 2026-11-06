// Mode test, PR 1b : un élément de test (`test: true`) n'entre dans AUCUN chiffre (cadrage §7). `sansTests` est appliquée à l'ENTRÉE des calculs, jamais à l'affichage.
// Les noms des tests commencent par le numéro du critère (docs/cadrage-mode-test.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';
import { readFileSync } from 'node:fs';

const MOIS = '2026-10';
const D = (j) => new Date(`2026-10-${j}T10:00:00Z`);

describe('mode test : statistiques', () => {
  test('1 sansTests est pure et stricte', () => {
    const entree = [{ id: 1, test: true }, { id: 2, test: false }, { id: 3 }, { id: 4, test: 'true' }];
    assert.deepEqual(L.sansTests(entree).map((x) => x.id), [2, 3, 4]);
    assert.equal(entree.length, 4, 'la liste d’origine ne bouge pas');
    assert.deepEqual(L.sansTests(undefined), []);
    assert.deepEqual(L.sansTests(null), []);
  });

  test('2 compterParEtape ignore les tests', () => {
    const affaires = [{ id: 'r', etape: 'rdv_fixe' }, { id: 't', etape: 'rdv_fixe', test: true }];
    assert.equal(L.compterParEtape(affaires, L.CONFIG_JEROME).find((e) => e.id === 'rdv_fixe').nombre, 1);
    assert.equal(L.compterParEtape([affaires[1]], L.CONFIG_JEROME).find((e) => e.id === 'rdv_fixe').nombre, 0);
  });

  test('3a nouveaux_contacts : un essai ne change pas la valeur', () => {
    const reel = { id: 'r', creeLe: D('05') };
    assert.equal(L.CALCULS.nouveaux_contacts.calculer({ personnes: [reel] }, MOIS), 1);
    assert.equal(L.CALCULS.nouveaux_contacts.calculer({ personnes: [reel, { id: 't', creeLe: D('06'), test: true }] }, MOIS), 1);
  });
  test('3b rdv_tenus : un essai ne change pas la valeur', () => {
    const rdv = { type: 'rendez_vous', fait: true, dateFait: D('10') };
    assert.equal(L.CALCULS.rdv_tenus.calculer({ activites: [{ id: 'r', ...rdv }, { id: 't', ...rdv, test: true }] }, MOIS), 1);
  });
  test('3c passages_etape : un essai ne change pas la valeur', () => {
    const a = { datesEtapes: { rdv_fixe: D('10') } };
    const objectif = { calcul: 'passages_etape', etapeId: 'rdv_fixe' };
    assert.equal(L.CALCULS.passages_etape.calculer({ affaires: [{ id: 'r', ...a }, { id: 't', ...a, test: true }] }, MOIS, objectif), 1);
  });
  test('3d ca_signe : une affaire de test à 100 € ne change pas la valeur', () => {
    const gagnee = L.configDe(L.CONFIG_JEROME).roleGagnee;
    const a = { etape: gagnee, statut: 'gagnee', datesEtapes: { [gagnee]: D('10') } };
    const reel = { id: 'r', ...a, montant: 1000 };
    assert.equal(L.CALCULS.ca_signe.calculer({ affaires: [reel], config: L.CONFIG_JEROME }, MOIS), 1000);
    assert.equal(L.CALCULS.ca_signe.calculer({ affaires: [reel, { id: 't', ...a, montant: 100, test: true }], config: L.CONFIG_JEROME }, MOIS), 1000);
  });
  test('3e propositions_envoyees : un essai ne change pas la valeur', () => {
    const a = { datesEtapes: { proposition_envoyee: D('10') } };
    assert.equal(L.CALCULS.propositions_envoyees.calculer({ affaires: [{ id: 'r', ...a }, { id: 't', ...a, test: true }] }, MOIS), 1);
  });
  test('3f ca_facture : une facture de 100 € sur un projet de test ne change pas la valeur', () => {
    const facture = { statut: 'a_payer', dateEnvoi: '2026-10-10', montant: 100 };
    assert.equal(L.CALCULS.ca_facture.calculer({ projets: [{ id: 'r', factures: [facture] }] }, MOIS), 100);
    assert.equal(L.CALCULS.ca_facture.calculer({ projets: [{ id: 'r', factures: [facture] }, { id: 't', test: true, factures: [facture] }] }, MOIS), 100);
  });
  test('3g ca_encaisse : un encaissement ou une facture payée de 100 € sur un essai ne change pas la valeur', () => {
    const payee = { statut: 'payee', datePaiement: '2026-10-10', montant: 100 };
    const reel = { projets: [{ id: 'r', factures: [payee] }], affaires: [{ id: 'ar', encaissements: [{ date: D('10'), montant: 100 }] }] };
    assert.equal(L.CALCULS.ca_encaisse.calculer(reel, MOIS), 200);
    const avecEssais = { projets: [...reel.projets, { id: 't', test: true, factures: [payee] }], affaires: [...reel.affaires, { id: 'at', test: true, encaissements: [{ date: D('10'), montant: 100 }] }] };
    assert.equal(L.CALCULS.ca_encaisse.calculer(avecEssais, MOIS), 200);
  });

  test('4 caParMois : la facture payée d’un projet de test ne remplit pas la colonne', () => {
    const payee = { statut: 'payee', datePaiement: '2026-10-10', montant: 100 };
    assert.deepEqual(L.caParMois([], [MOIS], [{ id: 't', test: true, factures: [payee] }]).map((x) => x.montant), [0]);
    assert.deepEqual(L.caParMois([], [MOIS], [{ id: 'r', factures: [payee] }]).map((x) => x.montant), [100]);
  });

  test('5 totauxColonne : le montant réel exclut les tests, le total des tests est à part, le nombre compte les cartes affichées', () => {
    const affaires = [{ id: 'r', montant: 2000 }, { id: 't', montant: 100, test: true }];
    assert.deepEqual(L.totauxColonne(affaires), { nombre: 2, montant: 2000, nombreTests: 1, montantTests: 100 });
    assert.deepEqual(L.totauxColonne([affaires[1]]), { nombre: 1, montant: 0, nombreTests: 1, montantTests: 100 });
    assert.deepEqual(L.totauxColonne([affaires[0]]), { nombre: 1, montant: 2000, nombreTests: 0, montantTests: 0 });
    assert.deepEqual(L.totauxColonne([{ id: 's', test: true }]), { nombre: 1, montant: 0, nombreTests: 1, montantTests: 0 });
  });

  test('5d verrouillage : l’en-tête de colonne des affaires a sa ligne « tests : » et aucun « essai » visible', () => {
    const src = readFileSync(new URL('../js/modules/crm/affaires.js', import.meta.url), 'utf8');
    assert.ok(src.includes('colonne-totaux-tests') && src.includes('tests : '));
    assert.ok(!/(['"`])[^'"`\n]*\bessai/i.test(src.replace(/réessai|bloc-essai|essai-/gi, '')));
  });

  test('8 exportJson garde test: true (la « colonne test » de l’export est le champ lui-même)', () => {
    const json = JSON.parse(L.exportJson({ crm_affaires: [{ id: 't', titre: 'Essai', test: true }, { id: 'r', titre: 'Réel' }] }, new Date('2026-11-05T10:00:00Z')));
    assert.equal(json.collections.crm_affaires[0].test, true);
    assert.equal('test' in json.collections.crm_affaires[1], false);
  });

  test('9 pointsCles garde une affaire et une activité de test (une liste d’actions, pas une statistique)', () => {
    const aff = { id: 't', titre: 'Essai', etape: 'rdv_fixe', statut: 'ouverte', test: true };
    const act = { id: 'x', titre: 'Relancer', date: '2026-10-01', fait: false, affaireId: 't', test: true };
    const r = L.pointsCles({ activites: [act], affaires: [aff] }, '2026-10-05');
    assert.equal(r.enRetard.length, 1);
  });
});
