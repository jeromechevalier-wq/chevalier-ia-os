// C2, C3, C5, C6 sur l'ÉMULATEUR Firestore (SDK d'administration réel : vraies transactions, Timestamps) : les numéros restent uniques même
// quand dix finalisations partent en même temps, et les dates des devis restent des dates (Timestamp) après chaque transition.
// Lancé avec les émulateurs (npm run test:module devis) ; ignoré si l'émulateur n'est pas démarré. Projet de démonstration, jamais de données réelles.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerAccesFirestore, avecBase, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { nouveauDevis } from '../functions/partage/devis.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
// Projet propre à ce fichier : les fichiers de test tournent en parallèle sur le même émulateur et ne doivent pas se vider l'un l'autre.
const PROJET = 'demo-chevalier-devis-serveur';
const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
const ctx = () => ({ acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT });

/** Un brouillon complet, avec des dates en Timestamp comme Firestore les rend (et non en Date). */
function brouillon(id, extra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }] }, { id, maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20 });
  return { ...d, creeLe: Timestamp.fromDate(MAINTENANT), sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: [{ id: `l-${id}`, libelle: 'Article', unite: 'u', quantite: 2, prixAchat: 10 }] }], ...extra };
}

describe('Transitions des devis sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm run test:module devis)' }, () => {
  let app;
  let db;
  let donnees;
  const brut = async (nom, id) => { const d = await db.collection(nom).doc(id).get(); return d.exists ? d.data() : null; };
  const poser = (id, extra) => { const { id: _i, ...reste } = brouillon(id, extra); return db.collection(C.devis).doc(id).set(reste); };

  before(() => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-devis-serveur');
    db = getFirestore(app);
    donnees = creerAccesFirestore({ db });
  });
  after(async () => { await deleteApp(app); });
  beforeEach(async () => {
    for (const nom of [C.devis, C.devisCompteurs, C.devisParametres, C.audit, C.auditAvant, 'clients/a/devis_devis', 'clients/a/devis_compteurs', 'clients/a/crm_audit', 'clients/a/crm_audit_avant']) {
      for (const d of (await db.collection(nom).get()).docs) await d.ref.delete();
    }
  });

  test('C2 dix finalisations simultanées reçoivent dix numéros différents, et le compteur vaut 10', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `d${i}`);
    await Promise.all(ids.map((id) => poser(id)));
    const rs = await Promise.all(ids.map((id) => S.finaliser({ donnees, ctx: ctx(), devisId: id })));
    const numeros = rs.map((r) => r.numero).sort();
    assert.equal(new Set(numeros).size, 10);
    assert.deepEqual(numeros, ids.map((_, i) => `DEV-2026-10-24-${String(i + 1).padStart(3, '0')}`));
    assert.equal((await brut(C.devisCompteurs, 'global')).valeur, 10);
    for (const id of ids) assert.equal((await brut(C.devis, id)).statut, 'en_attente_envoi');
  });

  test('C2 les dates déjà dans le devis restent des Timestamp après la finalisation, et le journal est écrit dans la même transaction', async () => {
    await poser('d1');
    const r = await S.finaliser({ donnees, ctx: ctx(), devisId: 'd1' });
    const d = await brut(C.devis, 'd1');
    assert.ok(d.creeLe instanceof Timestamp, 'creeLe reste une date');
    assert.ok(d.finaliseLe instanceof Timestamp);
    assert.equal(d.numero, r.numero);
    const lignes = (await db.collection(C.audit).get()).docs.map((x) => x.data());
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].outil, 'devisFinaliser');
    assert.equal(lignes[0].operationId, r.operationId);
  });

  test('C3 la version 2 garde le numéro, le compteur ne bouge pas, la version 1 passe à Remplacé (dates intactes)', async () => {
    await poser('v1');
    const r1 = await S.finaliser({ donnees, ctx: ctx(), devisId: 'v1' });
    await S.changerStatut({ donnees, ctx: ctx(), devisId: 'v1', action: 'marquer_envoye' });
    const nv = await S.nouvelleVersion({ donnees, ctx: ctx(), devisId: 'v1' });
    const v2 = await brut(C.devis, nv.devis.id);
    assert.equal(v2.numero, r1.numero);
    assert.ok(v2.creeLe instanceof Timestamp || v2.creeLe instanceof Date || v2.creeLe?.toDate, 'la date de création de v2 est une vraie date');
    const r2 = await S.finaliser({ donnees, ctx: ctx(), devisId: nv.devis.id });
    assert.equal(r2.numero, r1.numero);
    assert.equal((await brut(C.devisCompteurs, 'global')).valeur, 1);
    const v1 = await brut(C.devis, 'v1');
    assert.equal(v1.statut, 'remplace');
    assert.ok(v1.creeLe instanceof Timestamp && v1.envoyeLe instanceof Timestamp && v1.finaliseLe instanceof Timestamp);
  });

  test('C4 un devis invalide : rien n’est écrit (ni compteur, ni journal)', async () => {
    const { id: _i, ...reste } = nouveauDevis({}, { id: 'vide', maintenant: MAINTENANT, auteur: ACTEUR }, {});
    await db.collection(C.devis).doc('vide').set({ ...reste, creeLe: Timestamp.fromDate(MAINTENANT) });
    const r = await S.finaliser({ donnees, ctx: ctx(), devisId: 'vide' });
    assert.equal(r.ok, false);
    assert.equal(await brut(C.devisCompteurs, 'global'), null);
    assert.equal((await db.collection(C.audit).get()).size, 0);
    assert.equal((await brut(C.devis, 'vide')).statut, 'brouillon');
  });

  test('C5 une transition interdite est refusée sans écriture ; une permise écrit la date en Timestamp', async () => {
    await poser('d1', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001' });
    await assert.rejects(() => S.changerStatut({ donnees, ctx: ctx(), devisId: 'd1', action: 'accepter' }), (e) => e.code === 'transition_interdite');
    assert.equal((await brut(C.devis, 'd1')).statut, 'en_attente_envoi');
    assert.equal((await db.collection(C.audit).get()).size, 0);
    await S.changerStatut({ donnees, ctx: ctx(), devisId: 'd1', action: 'marquer_envoye' });
    const d = await brut(C.devis, 'd1');
    assert.equal(d.statut, 'envoye');
    assert.ok(d.envoyeLe instanceof Timestamp);
  });

  test('C6 deux demandes simultanées de nouvelle version : une seule réussit', async () => {
    await poser('v1', { statut: 'envoye', numero: 'DEV-2026-10-01-001' });
    const rs = await Promise.allSettled([S.nouvelleVersion({ donnees, ctx: ctx(), devisId: 'v1' }), S.nouvelleVersion({ donnees, ctx: ctx(), devisId: 'v1' })]);
    assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
    const tous = (await db.collection(C.devis).get()).docs.map((x) => x.data());
    assert.equal(tous.filter((x) => x.statut === 'brouillon').length, 1);
  });

  test('C7 dans l’espace d’un client (clients/a), le numéro et le compteur vivent sous clients/a ; l’espace de Jérôme n’est pas touché', async () => {
    const { id: _i, ...reste } = brouillon('da');
    await db.doc('clients/a/devis_devis/da').set(reste);
    const dansA = avecBase(donnees, 'clients/a');
    const r = await S.finaliser({ donnees: dansA, ctx: { acteur: 'alice@exemple.test', via: 'ecran', maintenant: MAINTENANT }, devisId: 'da' });
    assert.equal(r.numero, 'DEV-2026-10-24-001');
    assert.equal((await db.doc('clients/a/devis_compteurs/global').get()).data().valeur, 1);
    assert.equal(await brut(C.devisCompteurs, 'global'), null);
    assert.equal((await db.collection('clients/a/crm_audit').get()).size, 1);
    assert.equal((await db.collection(C.audit).get()).size, 0);
  });
});
