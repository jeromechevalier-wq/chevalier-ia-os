// C7 (plateforme clients) : la fonction appelable des devis d'un espace client (functions-plateforme/src/devis.js).
// `db` est une FAUSSE base (seules les fiches de membre et du client sont lues) et l'accès aux données est en MÉMOIRE : aucun émulateur.
// Un lecteur, un membre d'un autre espace, un inconnu, un compte non vérifié, un espace sans le module « devis » : tous refusés, sans rien écrire.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { nouveauDevis } from '../functions/partage/devis.js';

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
  [`clients/a/membres/${ALICE}`]: { role: 'editeur' },
  [`clients/a/membres/${LEA}`]: { role: 'lecteur' },
  [`clients/b/membres/${BOB}`]: { role: 'editeur' },
  [`clients/c/membres/${ZOE}`]: { role: 'editeur' },
};
const fauxDb = { doc: (chemin) => ({ get: async () => { const f = FICHES[chemin]; return { exists: Boolean(f), get: (champ) => f?.[champ] }; } }) };
const auth = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });

function brouillon(id) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }] }, { id, maintenant: new Date(MAINTENANT), auteur: ALICE }, { marge: 20 });
  return { ...d, sections: [{ id: 's', titre: 'T', lignes: [{ id: 'l', libelle: 'Article', unite: 'u', quantite: 1, prixAchat: 10 }] }] };
}
function monde() {
  const collections = {};
  for (const c of ['a', 'b', 'c']) Object.assign(collections, { [`clients/${c}/devis_devis`]: [], [`clients/${c}/devis_compteurs`]: [], [`clients/${c}/crm_audit`]: [], [`clients/${c}/crm_audit_avant`]: [], [`clients/${c}/devis_parametres`]: [] });
  collections['clients/a/devis_devis'].push(brouillon('da'));
  collections['clients/b/devis_devis'].push(brouillon('db'));
  const brut = creerAccesMemoire(collections);
  return { collections, creerDonnees: (client) => avecBase(brut, `clients/${client}`) };
}
const appeler = (m, operation, email, donnees, extra = {}) => transitionDevis({ db: fauxDb, auth: email === null ? null : auth(email, extra.verifie), donnees, operation, maintenant: MAINTENANT, creerDonnees: m.creerDonnees });
const refus = async (promesse, code) => {
  await assert.rejects(promesse, (e) => e instanceof Refus && (!code || e.code === code), `refus ${code ?? ''} attendu`);
};
const OPERATIONS = { finaliser: { devisId: 'da' }, changerStatut: { devisId: 'da', action: 'marquer_envoye' }, nouvelleVersion: { devisId: 'da' }, archiver: { devisId: 'da', archive: true } };

describe('C7 plateforme : qui peut appeler les quatre fonctions de devis', () => {
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
    assert.ok(r.erreurs.length >= 2);
  });
});
