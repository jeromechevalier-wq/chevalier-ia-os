// Mode test, PR 3 : numéro TEST-NNN séparé, finalisation qui revérifie, « démarquer » refusé pour un TEST- finalisé, restauration, fonction appelable de l'écran.
// Accès aux données EN MÉMOIRE (modèle : devis-serveur.test.js). Les finalisations simultanées sur l'émulateur sont dans devis-serveur-firestore.test.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { basculerTest } from '../functions/src/coeur/mode-test.js';
import { restaurerOperation } from '../functions/src/coeur/restaurer.js';
import { creerAppelDevis } from '../functions/src/devis-appel.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
const ctx = (extra = {}) => ({ acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT, ...extra });

function monde({ devis = [], affaires = [{ id: 'aff1', titre: 'Chantier' }], personnes = [{ id: 'p1', nom: 'Client Essai' }], organisations = [] } = {}) {
  const collections = {
    [C.devis]: devis, [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti', entreprise: EMETTEUR_ESSAI }],
    [C.personnes]: personnes, [C.organisations]: organisations, [C.affaires]: affaires, [C.devisUsageArticles]: [], [C.audit]: [], [C.auditAvant]: [],
  };
  return { collections, donnees: creerAccesMemoire(collections) };
}
const ligne = (id, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite: 1, prixAchat: 100, ...extra });
function brouillon(id, extra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id, maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 0, margeDevis: 0 });
  return completerPourFinaliser({ ...d, sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: [ligne(`l-${id}`)] }], ...extra });
}
const fin = (m, devisId, extra = {}) => S.finaliser({ donnees: m.donnees, ctx: ctx(extra), devisId });
const leDevis = (m, id) => m.collections[C.devis].find((d) => d.id === id);
const compteur = (m, id) => m.collections[C.devisCompteurs].find((x) => x.id === id);
const versionDeux = async (m, devisId) => { await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId, action: 'marquer_envoye' }); return S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId }); };
const photo = (m) => JSON.stringify(m.collections);

describe('1 numéro TEST-', () => {
  test('1 numéro TEST- : brouillon test: true → TEST-001 ; le suivant TEST-002 ; compteur global absent, devis_compteurs/test = 2 ; test: true écrit', async () => {
    const m = monde({ devis: [brouillon('d1', { test: true }), brouillon('d2', { test: true })] });
    const r1 = await fin(m, 'd1');
    const r2 = await fin(m, 'd2');
    assert.deepEqual([r1.numero, r2.numero, r1.test, r1.nouveauNumero], ['TEST-001', 'TEST-002', true, true]);
    assert.equal(compteur(m, 'global'), undefined);
    assert.equal(compteur(m, 'test').valeur, 2);
    assert.equal(leDevis(m, 'd1').test, true);
    assert.equal(leDevis(m, 'd1').numero, 'TEST-001');
    assert.equal(S.reponsePublique(r1).test, true);
  });
});

describe('2 revérification à la finalisation', () => {
  test('2 affaire de test, organisation de test, personne de test → TEST- ; tout réel → DEV-…-001 avec test: false écrit', async () => {
    const m = monde({
      devis: [brouillon('a'), brouillon('o', { organisationId: 'o1', personneId: undefined, affaireId: 'aff2' }), brouillon('p', { personneId: 'p2', affaireId: 'aff2' }), brouillon('r', { affaireId: 'aff2' })],
      affaires: [{ id: 'aff1', titre: 'A', test: true }, { id: 'aff2', titre: 'B' }],
      personnes: [{ id: 'p1', nom: 'Réel' }, { id: 'p2', nom: 'Essai', test: true }],
      organisations: [{ id: 'o1', nom: 'Société de test', test: true }],
    });
    assert.equal((await fin(m, 'a')).numero, 'TEST-001');
    assert.equal((await fin(m, 'o')).numero, 'TEST-002');
    assert.equal((await fin(m, 'p')).numero, 'TEST-003');
    const r = await fin(m, 'r');
    assert.equal(r.numero, 'DEV-2026-10-24-001');
    assert.equal(r.test, false);
    assert.equal(leDevis(m, 'r').test, false, 'test: false écrit explicitement');
    assert.equal(compteur(m, 'test').valeur, 3);
  });
  test('3 un vrai devis juste après deux essais = DEV-…-001 (jamais 003)', async () => {
    const m = monde({ devis: [brouillon('t1', { test: true }), brouillon('t2', { test: true }), brouillon('r')] });
    await fin(m, 't1'); await fin(m, 't2');
    assert.equal((await fin(m, 'r')).numero, 'DEV-2026-10-24-001');
    assert.equal(compteur(m, 'global').valeur, 1);
  });
  test('4 version 2 : racine DEV- avec brouillon marqué test → DEV- (même numéro), test: false, compteur test intact ; racine TEST-001 avec brouillon démarqué → TEST-001, test: true', async () => {
    const m = monde({ devis: [brouillon('r'), brouillon('t', { test: true })] });
    await fin(m, 'r'); await fin(m, 't');
    const v2r = await versionDeux(m, 'r');
    const v2t = await versionDeux(m, 't');
    assert.equal(leDevis(m, v2t.devis.id).test, true, 'la copie garde le repère');
    leDevis(m, v2r.devis.id).test = true; // un navigateur a marqué le brouillon
    leDevis(m, v2t.devis.id).test = false; // ... et démarqué l'autre
    const testAvant = compteur(m, 'test').valeur;
    const a = await fin(m, v2r.devis.id);
    const b = await fin(m, v2t.devis.id);
    assert.deepEqual([a.numero, a.test, a.nouveauNumero], ['DEV-2026-10-24-001', false, false]);
    assert.deepEqual([b.numero, b.test, b.nouveauNumero], ['TEST-001', true, false]);
    assert.equal(leDevis(m, v2r.devis.id).test, false);
    assert.equal(leDevis(m, v2t.devis.id).test, true);
    assert.equal(compteur(m, 'test').valeur, testAvant);
    assert.equal(compteur(m, 'global').valeur, 1);
  });
  test('5 usage des articles : un TEST- ne compte pas ; un brouillon test: true sur racine DEV- compte (finalisé réel)', async () => {
    const avecArticle = (id, extra) => brouillon(id, { ...extra, sections: [{ id: `s-${id}`, titre: 'T', lignes: [ligne(`l-${id}`, { articleId: 'art1' })] }] });
    const m = monde({ devis: [avecArticle('t', { test: true }), avecArticle('r')] });
    await fin(m, 't');
    assert.equal(m.collections[C.devisUsageArticles].length, 0, 'un essai ne compte jamais');
    await fin(m, 'r');
    const v2 = await versionDeux(m, 'r');
    leDevis(m, v2.devis.id).test = true;
    await fin(m, v2.devis.id);
    assert.equal(leDevis(m, v2.devis.id).test, false);
    assert.ok(m.collections[C.devisUsageArticles].find((u) => u.articleId === 'art1').nombre >= 1);
  });
});

describe('6 démarquer un TEST- finalisé', () => {
  test('6 refusé (transition_interdite, rien d’écrit, aucune ligne de journal) ; marquer puis démarquer un DEV- finalisé permis, le montant de l’affaire sort puis revient', async () => {
    const m = monde({ devis: [brouillon('t', { test: true }), brouillon('r')] });
    await fin(m, 't'); await fin(m, 'r');
    const avant = photo(m);
    await assert.rejects(() => basculerTest({ donnees: m.donnees, ctx: ctx(), type: 'devis', id: 't', test: false }), (e) => e.code === 'transition_interdite' && /TEST-/.test(e.message));
    assert.equal(photo(m), avant);
    await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'r', action: 'marquer_envoye' });
    await S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'r', action: 'accepter' });
    const affaire = () => m.collections[C.affaires].find((a) => a.id === 'aff1');
    assert.equal(affaire().montantDevisHt, 100);
    await basculerTest({ donnees: m.donnees, ctx: ctx(), type: 'devis', id: 'r', test: true });
    assert.equal(leDevis(m, 'r').test, true);
    assert.equal(affaire().montantDevisHt ?? null, null, '100 € HT sortent du montant');
    await basculerTest({ donnees: m.donnees, ctx: ctx(), type: 'devis', id: 'r', test: false });
    assert.equal(affaire().montantDevisHt, 100, '100 € HT reviennent');
  });
});

describe('7 restaurer_depuis_audit', () => {
  test('7 un TEST- supprimé reste supprimé ; un DEV- supprimé se restaure avec son numéro (D18bis) ; un brouillon de test supprimé se restaure', async () => {
    const m = monde({ devis: [brouillon('t', { test: true }), brouillon('r'), brouillon('b', { test: true })] });
    await fin(m, 't'); await fin(m, 'r');
    const st = await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 't' });
    const sr = await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 'r' });
    const sb = await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 'b' });
    assert.equal(leDevis(m, 't'), undefined);
    await assert.rejects(() => restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: st.operationId, apercu: false }), (e) => e.code === 'restauration_refusee' && /reste supprimé/.test(e.message));
    assert.equal(leDevis(m, 't'), undefined);
    assert.ok(m.collections[C.auditAvant].some((a) => a.avant?.numero === 'TEST-001' || JSON.stringify(a).includes('TEST-001')), 'la copie « avant » reste lisible');
    await restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: sr.operationId, apercu: false });
    assert.equal(leDevis(m, 'r').numero, 'DEV-2026-10-24-001');
    await restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: sb.operationId, apercu: false });
    assert.equal(leDevis(m, 'b').statut, 'brouillon');
  });
  test('9 supprimer un TEST- finalisé : les versions partent, la copie « avant » reste dans le journal', async () => {
    const m = monde({ devis: [brouillon('t', { test: true })] });
    await fin(m, 't');
    const s = await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 't' });
    assert.equal(leDevis(m, 't'), undefined);
    const lignes = m.collections[C.audit].filter((l) => l.operationId === s.operationId);
    assert.ok(lignes.length >= 1 && lignes.every((l) => m.collections[C.auditAvant].some((a) => a.id === l.id)));
  });
});

describe('8 fonction appelable devisMarquerTest (porte de Jérôme)', () => {
  const requete = (email, data) => ({ auth: email === undefined ? undefined : { uid: 'u', token: { email, email_verified: true } }, data });
  test('8 marque un devis finalisé, toutes les versions, réponse publique sans le devis entier ; test non booléen, compte inconnu, TEST- démarqué refusés', async () => {
    const m = monde({ devis: [brouillon('r'), brouillon('t', { test: true })] });
    await fin(m, 'r'); await fin(m, 't');
    const appel = creerAppelDevis('marquerTest', { donnees: () => m.donnees });
    const ok = await appel(requete(ACTEUR, { devisId: 'r', test: true }));
    assert.deepEqual([ok.ok, ok.devisId, ok.test], [true, 'r', true]);
    assert.equal(ok.sections, undefined);
    assert.equal(leDevis(m, 'r').test, true);
    const encore = await appel(requete(ACTEUR, { devisId: 'r', test: true }));
    assert.deepEqual([encore.ok, encore.rien], [true, true]);
    const avant = photo(m);
    await assert.rejects(() => appel(requete(ACTEUR, { devisId: 'r', test: 'oui' })), (e) => e.code === 'invalid-argument');
    await assert.rejects(() => appel(requete('intrus@exemple.test', { devisId: 'r', test: false })), (e) => e.code === 'permission-denied');
    await assert.rejects(() => appel(requete(ACTEUR, { devisId: 't', test: false })), (e) => e.code === 'failed-precondition');
    assert.equal(photo(m), avant);
  });
});
