// C7 (plateforme clients) : la fonction appelable des devis d'un espace client (functions-plateforme/src/devis.js).
// `db` est une FAUSSE base (seules les fiches de membre et du client sont lues) et l'accès aux données est en MÉMOIRE : aucun émulateur.
// Un lecteur, un membre d'un autre espace, un inconnu, un compte non vérifié, un espace sans le module « devis » : tous refusés, sans rien écrire.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const { transitionDevis } = await import('../functions-plateforme/src/devis.js');
const { Refus } = await import('../functions-plateforme/src/appels.js');

const ALICE = 'alice@exemple.test'; // éditrice chez a (module devis actif)
const LEA = 'lea@exemple.test'; // lectrice chez a
const BOB = 'bob@exemple.test'; // éditeur chez b (module devis actif)
const ZOE = 'zoe@exemple.test'; // éditrice chez c (module devis INACTIF)
const MAINTENANT = Date.parse('2026-10-24T10:00:00Z');

const FICHES = {
  'clients/a': { modules: { affaires: true, devis: true } },
  'clients/b': { modules: { affaires: true, devis: true } },
  'clients/c': { modules: { affaires: true } },
  'clients/d': { modules: { devis: true } }, // Devis seul (PR C1) : ni Affaires ni Projets
  [`clients/a/membres/${ALICE}`]: { role: 'editeur' },
  [`clients/a/membres/${LEA}`]: { role: 'lecteur' },
  [`clients/b/membres/${BOB}`]: { role: 'editeur' },
  [`clients/c/membres/${ZOE}`]: { role: 'editeur' },
  [`clients/d/membres/${ALICE}`]: { role: 'editeur' },
};
const fauxDb = { doc: (chemin) => ({ get: async () => { const f = FICHES[chemin]; return { exists: Boolean(f), get: (champ) => f?.[champ] }; } }) };
const auth = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });

function brouillon(id, affaireId = 'aff1') {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId }, { id, maintenant: new Date(MAINTENANT), auteur: ALICE }, { marge: 20, margeDevis: 20 });
  return completerPourFinaliser({ ...d, sections: [{ id: 's', titre: 'T', lignes: [{ id: 'l', libelle: 'Article', unite: 'u', quantite: 1, prixAchat: 10 }] }] });
}
function monde() {
  const collections = {};
  for (const c of ['a', 'b', 'c', 'd']) Object.assign(collections, { [`clients/${c}/devis_devis`]: [], [`clients/${c}/devis_compteurs`]: [], [`clients/${c}/crm_audit`]: [], [`clients/${c}/crm_audit_avant`]: [], [`clients/${c}/devis_parametres`]: [{ id: 'reglages', regimeTva: 'assujetti', entreprise: EMETTEUR_ESSAI }], [`clients/${c}/crm_personnes`]: [{ id: 'p1', nom: 'Client Essai' }] });
  collections['clients/a/devis_devis'].push(brouillon('da'));
  collections['clients/b/devis_devis'].push(brouillon('db'));
  collections['clients/d/devis_devis'].push(brouillon('dd', null));
  const brut = creerAccesMemoire(collections);
  return { collections, creerDonnees: (client) => avecBase(brut, `clients/${client}`) };
}
const appeler = (m, operation, email, donnees, extra = {}) => transitionDevis({ db: fauxDb, auth: email === null ? null : auth(email, extra.verifie), donnees, operation, maintenant: MAINTENANT, creerDonnees: m.creerDonnees });
const refus = async (promesse, code) => {
  await assert.rejects(promesse, (e) => e instanceof Refus && (!code || e.code === code), `refus ${code ?? ''} attendu`);
};
const OPERATIONS = { finaliser: { devisId: 'da' }, changerStatut: { devisId: 'da', action: 'marquer_envoye' }, nouvelleVersion: { devisId: 'da' }, archiver: { devisId: 'da', archive: true }, enregistrerEnvoi: { devisId: 'da', destinataires: ['client@exemple.test'] }, marquerTest: { devisId: 'da', test: true } };

describe('C7-S plateforme : l\'affaire n\'est exigée à la finalisation que si le module Affaires est actif (PR C1)', () => {
  test('C7-S client d (Devis seul) : un devis sans affaire se finalise (numéro attribué) ; client a (Affaires) : le même devis est refusé', async () => {
    const m = monde();
    m.collections['clients/a/devis_devis'].push(brouillon('da-sans', null));
    const seul = await appeler(m, 'finaliser', ALICE, { client: 'd', devisId: 'dd' });
    assert.equal(seul.ok, true);
    assert.equal(seul.numero, 'DEV-2026-10-24-001');
    assert.equal(m.collections['clients/d/devis_devis'][0].statut, 'en_attente_envoi');
    const avec = await appeler(m, 'finaliser', ALICE, { client: 'a', devisId: 'da-sans' });
    assert.equal(avec.ok, false);
    assert.deepEqual(avec.erreurs, ['Choisis l\'affaire de ce devis.']);
    assert.equal(m.collections['clients/a/devis_devis'][1].statut, 'brouillon');
  });
});

describe('C7 plateforme : qui peut appeler les fonctions de devis', () => {
  test('C7 une éditrice de l’espace a avec le module devis actif finalise son devis, dans son espace seulement', async () => {
    const m = monde();
    const r = await appeler(m, 'finaliser', ALICE, { client: 'a', devisId: 'da' });
    assert.equal(r.ok, true);
    assert.equal(r.numero, 'DEV-2026-10-24-001');
    assert.equal(m.collections['clients/a/devis_devis'][0].statut, 'en_attente_envoi');
    assert.equal(m.collections['clients/a/crm_audit'][0].acteur, ALICE);
    assert.equal(m.collections['clients/b/devis_devis'][0].statut, 'brouillon');
    assert.equal(m.collections['clients/b/devis_compteurs'].length, 0);
  });
  for (const [operation, demande] of Object.entries(OPERATIONS)) {
    test(`C7 ${operation} : un lecteur, un membre d’un autre espace, un inconnu, un compte non vérifié, un espace sans le module et un appel sans connexion sont refusés sans rien écrire`, async () => {
      const m = monde();
      const avant = JSON.stringify(m.collections);
      await refus(appeler(m, operation, LEA, { client: 'a', ...demande }), 'permission-denied'); // lecteur
      await refus(appeler(m, operation, BOB, { client: 'a', ...demande }), 'permission-denied'); // éditeur d'un AUTRE espace, vers l'espace a
      await refus(appeler(m, operation, 'inconnu@exemple.test', { client: 'a', ...demande }), 'permission-denied');
      await refus(appeler(m, operation, ALICE, { client: 'a', ...demande }, { verifie: false }), 'unauthenticated');
      await refus(appeler(m, operation, ZOE, { client: 'c', ...demande }), 'permission-denied'); // module devis inactif
      await refus(appeler(m, operation, ALICE, { client: 'espace-inexistant', ...demande }), 'permission-denied');
      await refus(appeler(m, operation, null, { client: 'a', ...demande }), 'unauthenticated');
      assert.equal(JSON.stringify(m.collections), avant);
    });
  }
  test('C7 un client mal écrit (chemin, majuscules, absent) est une demande invalide, jamais un chemin de base de données', async () => {
    const m = monde();
    for (const client of ['a/devis_devis', '../b', 'A', '', undefined, 42, { a: 1 }]) {
      await refus(appeler(m, 'finaliser', ALICE, { client, devisId: 'da' }), 'invalid-argument');
    }
    await refus(appeler(m, 'finaliser', ALICE, undefined), 'invalid-argument');
  });
  test('C7 le devis d’un autre espace est introuvable depuis le mien (même identifiant, autre espace)', async () => {
    const m = monde();
    await refus(appeler(m, 'finaliser', ALICE, { client: 'a', devisId: 'db' }), 'not-found');
    assert.equal(m.collections['clients/b/devis_devis'][0].statut, 'brouillon');
  });
  test('C7 une transition interdite devient « failed-precondition » avec un message lisible ; un devis invalide rend ok:false', async () => {
    const m = monde();
    await refus(appeler(m, 'changerStatut', ALICE, { client: 'a', devisId: 'da', action: 'accepter' }), 'failed-precondition');
    m.collections['clients/a/devis_devis'].push({ ...nouveauDevis({}, { id: 'vide', maintenant: new Date(MAINTENANT), auteur: ALICE }, {}) });
    const r = await appeler(m, 'finaliser', ALICE, { client: 'a', devisId: 'vide' });
    assert.equal(r.ok, false);
    assert.ok(r.erreurs.length >= 1); // sans ligne (l'adresse e-mail n'est plus obligatoire)
  });
});

describe('B4 plateforme : supprimer un devis à tous les statuts, chez un client', () => {
  test('B4 une éditrice supprime un devis ENVOYÉ avec toutes ses versions, dans son espace seulement ; le journal garde la copie ; le compteur ne recule pas', async () => {
    const m = monde();
    const devis = m.collections['clients/a/devis_devis'];
    devis[0] = { ...devis[0], statut: 'envoye', numero: 'DEV-2026-10-01-001', racineId: 'da', version: 1 };
    devis.push({ ...devis[0], id: 'da2', version: 2, statut: 'remplace' });
    m.collections['clients/a/devis_compteurs'].push({ id: 'global', valeur: 7 });
    const r = await appeler(m, 'supprimer', ALICE, { client: 'a', devisId: 'da' });
    assert.equal(r.ok, true);
    assert.equal(r.supprimes, 2);
    assert.equal(m.collections['clients/a/devis_devis'].length, 0);
    assert.equal(m.collections['clients/b/devis_devis'].length, 1, 'l’autre espace n’est pas touché');
    assert.equal(m.collections['clients/a/crm_audit'].filter((l) => l.outil === 'devisSupprimer').length, 2, 'une ligne de journal par version');
    assert.equal(m.collections['clients/a/devis_compteurs'][0].valeur, 7, 'le compteur ne recule pas');
  });
  test('B4 un lecteur ne supprime pas un devis envoyé (rien n’est écrit) ; un devis déjà supprimé est « not-found »', async () => {
    const m = monde();
    m.collections['clients/a/devis_devis'][0] = { ...m.collections['clients/a/devis_devis'][0], statut: 'accepte', numero: 'DEV-2026-10-01-001' };
    await refus(appeler(m, 'supprimer', LEA, { client: 'a', devisId: 'da' }), 'permission-denied');
    assert.equal(m.collections['clients/a/devis_devis'].length, 1);
    await appeler(m, 'supprimer', ALICE, { client: 'a', devisId: 'da' });
    await refus(appeler(m, 'supprimer', ALICE, { client: 'a', devisId: 'da' }), 'not-found');
  });
});

describe('11 plateforme : « marquer comme test » et numéro TEST- chez un client', () => {
  test('11 une éditrice marque un devis finalisé de son espace ; un devis test chez a reçoit TEST-001 et b garde son compteur', async () => {
    const m = monde();
    m.collections['clients/a/devis_devis'].push({ ...brouillon('dt'), test: true });
    m.collections['clients/b/devis_compteurs'].push({ id: 'global', valeur: 4 });
    await appeler(m, 'finaliser', ALICE, { client: 'a', devisId: 'da' });
    const t = await appeler(m, 'finaliser', ALICE, { client: 'a', devisId: 'dt' });
    assert.deepEqual([t.numero, t.test], ['TEST-001', true]);
    assert.equal(m.collections['clients/a/devis_compteurs'].find((c) => c.id === 'test').valeur, 1);
    assert.equal(m.collections['clients/a/devis_compteurs'].find((c) => c.id === 'global').valeur, 1);
    assert.deepEqual(m.collections['clients/b/devis_compteurs'], [{ id: 'global', valeur: 4 }], 'le compteur de b est intact');
    const r = await appeler(m, 'marquerTest', ALICE, { client: 'a', devisId: 'da', test: true });
    assert.deepEqual([r.ok, r.devisId, r.test], [true, 'da', true]);
    assert.equal(m.collections['clients/a/devis_devis'].find((d) => d.id === 'da').test, true);
    assert.equal(m.collections['clients/b/devis_devis'][0].test, undefined);
    await refus(appeler(m, 'marquerTest', ALICE, { client: 'a', devisId: 'dt', test: false }), 'failed-precondition');
    await refus(appeler(m, 'marquerTest', ALICE, { client: 'a', devisId: 'da', test: 'oui' }), 'invalid-argument');
  });
});
