// Le moteur d'écriture et l'audit contre l'ÉMULATEUR Firestore (SDK d'administration réel : Timestamps, lots, transactions).
// Lancé par « npm test » (émulateurs) ; ignoré si l'émulateur n'est pas démarré. Projet de démonstration, jamais de données réelles.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerAccesFirestore } from '../functions/src/coeur/donnees.js';
import { executerEcritures, JOURS_COPIES } from '../functions/src/coeur/ecriture.js';
import { restaurerOperation } from '../functions/src/coeur/restaurer.js';
import * as metier from '../functions/src/coeur/metier.js';
import { creerLimiteur, ErreurLimite, LIMITES_PAR_DEFAUT } from '../functions/src/securite/limites.js';
import * as lecture from '../functions/src/coeur/lecture.js';
import { collections, MAINTENANT } from './_donnees-essai.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
// Projet propre à ce fichier : les fichiers de test tournent en parallèle sur le même émulateur et ne doivent pas se vider l'un l'autre.
const PROJET = 'demo-chevalier-ecriture';
const enTimestamps = (x) => (x instanceof Date ? Timestamp.fromDate(x) : Array.isArray(x) ? x.map(enTimestamps) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enTimestamps(v)])) : x);
const ctx = (extra = {}) => ({ acteur: 'hermes-bibliothecaire', jeton: 'hermes-bibliothecaire', via: 'mcp', maintenant: MAINTENANT, ...extra });
const panne = () => Object.assign(new Error('panne simulée'), { code: 14 });

describe('Moteur d’écriture et audit sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app;
  let db;
  let donnees;
  const brut = async (nom, id) => { const d = await db.collection(nom).doc(id).get(); return d.exists ? d.data() : null; };

  before(() => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-ecriture');
    db = getFirestore(app);
    donnees = creerAccesFirestore({ db });
  });
  after(async () => { await deleteApp(app); });
  beforeEach(async () => {
    const noms = [...Object.keys(collections), 'crm_audit', 'crm_audit_avant', 'mcp_limites'];
    for (const nom of noms) for (const d of (await db.collection(nom).get()).docs) await d.ref.delete();
    for (const [nom, docs] of Object.entries(collections).filter(([n]) => n !== 'crm_audit')) for (const { id, ...reste } of docs) await db.collection(nom).doc(id).set(enTimestamps(reste));
  });

  test('créer, modifier, supprimer : données, lignes « succes », copies avant et après, expiration à 90 jours (Timestamp pour la règle TTL)', async () => {
    const r = await executerEcritures({
      donnees, ctx: ctx(), outil: 'essai', parametres: { a: 1 },
      operations: [
        { type: 'creer', collection: 'crm_personnes', id: 'pNeuve', donnees: { nom: 'Nouvelle' }, horodater: ['creeLe'], signer: ['creePar'] },
        { type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 900 }, horodater: ['modifieLe'] },
        { type: 'supprimer', collection: 'crm_notes', id: 'n2' },
      ],
    });
    assert.equal((await brut('crm_personnes', 'pNeuve')).creePar, 'hermes-bibliothecaire');
    assert.equal((await brut('crm_personnes', 'pNeuve')).creeLe.toMillis(), MAINTENANT.getTime(), 'écrit comme un vrai Timestamp');
    assert.equal((await brut('crm_affaires', 'a1')).montant, 900);
    assert.equal(await brut('crm_notes', 'n2'), null);
    const lignes = (await db.collection('crm_audit').where('operationId', '==', r.operationId).get()).docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.ordre - b.ordre);
    assert.deepEqual(lignes.map((l) => l.statut), ['succes', 'succes', 'succes']);
    const copie = await brut('crm_audit_avant', lignes[2].id);
    assert.equal(copie.avant.texte, 'Premier contact par e-mail.');
    assert.equal(copie.apres, null);
    assert.ok(copie.expireAt instanceof Timestamp);
    assert.equal(copie.expireAt.toMillis(), MAINTENANT.getTime() + JOURS_COPIES * 86_400_000);
    const audit = await lecture.lireAudit(donnees, { operationId: r.operationId });
    assert.equal(audit.total, 3);
    assert.equal(audit.aVerifier, 0);
  });

  test('document modifié entre la lecture et l’écriture : la transaction refuse (conflit), rien d’écrit, audit « echec »', async () => {
    const concurrent = { ...donnees, async appliquer(ecr, opt) { if (opt?.attendus?.length) await db.collection('crm_affaires').doc('a1').update({ titre: 'Changé par l’écran' }); return donnees.appliquer(ecr, opt); } };
    let operationId;
    await assert.rejects(
      () => executerEcritures({ donnees: concurrent, ctx: ctx(), outil: 'modifier_affaire', operations: [{ type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 5 } }] }),
      (e) => { operationId = e.details.operationId; return e.code === 'conflit'; },
    );
    const a1 = await brut('crm_affaires', 'a1');
    assert.equal(a1.titre, 'Changé par l’écran');
    assert.equal(a1.montant, undefined);
    const [ligne] = (await db.collection('crm_audit').where('operationId', '==', operationId).get()).docs;
    assert.equal(ligne.data().statut, 'echec');
  });

  test('le lot de données est tout ou rien : une opération refusée au milieu n’écrit rien du paquet', async () => {
    // Le second document n'existe pas : la mise à jour échoue, la création du premier doit disparaître avec elle.
    await assert.rejects(() => donnees.appliquer([
      { type: 'set', collection: 'crm_notes', id: 'jamais', donnees: { texte: 'x' } },
      { type: 'update', collection: 'crm_notes', id: 'absente', donnees: { texte: 'y' } },
    ]));
    assert.equal(await brut('crm_notes', 'jamais'), null);
  });

  test('journal en panne (lot 1) : aucune donnée écrite ; lot 2 en panne : audit « echec », données intactes', async () => {
    const copieA1 = await brut('crm_affaires', 'a1');
    const sansJournal = { ...donnees, async appliquer(ecr, opt) { if (ecr.some((e) => e.collection === 'crm_audit')) throw panne(); return donnees.appliquer(ecr, opt); } };
    await assert.rejects(() => executerEcritures({ donnees: sansJournal, ctx: ctx(), outil: 'x', operations: [{ type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 1 } }] }), (e) => e.code === 'audit_indisponible');
    assert.deepEqual(await brut('crm_affaires', 'a1'), copieA1);
    assert.equal((await db.collection('crm_audit').get()).size, 0);

    const sansDonnees = { ...donnees, async appliquer(ecr, opt) { if (opt?.attendus?.length) throw panne(); return donnees.appliquer(ecr, opt); } };
    let operationId;
    await assert.rejects(() => executerEcritures({ donnees: sansDonnees, ctx: ctx(), outil: 'x', operations: [{ type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 1 } }] }), (e) => { operationId = e.details.operationId; return e.code === 'ecriture_echouee'; });
    assert.deepEqual(await brut('crm_affaires', 'a1'), copieA1);
    const [ligne] = (await db.collection('crm_audit').where('operationId', '==', operationId).get()).docs;
    assert.equal(ligne.data().statut, 'echec');
  });

  test('restauration sur Firestore : modification, création et suppression défaites à l’identique (dates comprises, mêmes identifiants)', async () => {
    const avantP2 = await brut('crm_personnes', 'p2');
    const avantAc4 = await brut('crm_activites', 'ac4');
    const r = await executerEcritures({
      donnees, ctx: ctx(), outil: 'essai',
      operations: [
        { type: 'modifier', collection: 'crm_personnes', id: 'p2', patch: { ville: 'Brest' }, horodater: ['modifieLe'], signer: ['modifiePar'] },
        { type: 'creer', collection: 'crm_notes', id: 'nx', donnees: { texte: 't' }, horodater: ['creeLe'] },
        { type: 'supprimer', collection: 'crm_activites', id: 'ac4' },
      ],
    });
    const apercu = await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId });
    assert.deepEqual(apercu.lignes.map((l) => l.action), ['recreer', 'supprimer', 'remplacer']);
    await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.deepEqual(await brut('crm_personnes', 'p2'), avantP2);
    assert.equal(await brut('crm_notes', 'nx'), null);
    assert.deepEqual(await brut('crm_activites', 'ac4'), avantAc4);
  });

  test('restauration refusée si le document a changé depuis (Timestamp compris) ; forcer la permet ; copie expirée : message clair', async () => {
    const r = await executerEcritures({ donnees, ctx: ctx(), outil: 'essai', operations: [{ type: 'modifier', collection: 'crm_personnes', id: 'p2', patch: { ville: 'Brest' }, horodater: ['modifieLe'] }] });
    await db.collection('crm_personnes').doc('p2').update({ ville: 'Rennes' });
    await assert.rejects(() => restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false }), (e) => e.code === 'restauration_refusee');
    await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false, forcer: true });
    assert.equal((await brut('crm_personnes', 'p2')).ville, undefined);

    const r2 = await executerEcritures({ donnees, ctx: ctx(), outil: 'essai', operations: [{ type: 'supprimer', collection: 'crm_notes', id: 'n2' }] });
    for (const d of (await db.collection('crm_audit_avant').where('operationId', '==', r2.operationId).get()).docs) await d.ref.delete();
    await assert.rejects(() => restaurerOperation({ donnees, ctx: ctx(), operationId: r2.operationId, apercu: false }), (e) => e.code === 'copie_expiree');
  });

  test('450 documents : deux paquets (transactions de 400 au plus), restauration complète', async () => {
    const operations = Array.from({ length: 450 }, (_, i) => ({ type: 'creer', collection: 'crm_notes', id: `m${i}`, donnees: { texte: `n${i}` }, horodater: ['creeLe'] }));
    const r = await executerEcritures({ donnees, ctx: ctx(), outil: 'masse', operations });
    assert.equal(r.ecritures.length, 450);
    assert.equal((await db.collection('crm_notes').get()).size, 452);
    assert.equal((await db.collection('crm_audit').where('operationId', '==', r.operationId).get()).size, 450);
    await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.equal((await db.collection('crm_notes').get()).size, 2);
  });

  test('mettreAJour (compteurs de débit) : lecture-modification-écriture atomique, 20 appels simultanés sans perte', async () => {
    await Promise.all(Array.from({ length: 20 }, () => donnees.mettreAJour('mcp_limites', 'essai', (c) => ({ ecrire: true, donnees: { n: (c?.n ?? 0) + 1 } }))));
    assert.equal((await brut('mcp_limites', 'essai')).n, 20);
  });

  test('outils sur Firestore : supprimer une personne avec ses affaires puis restaurer rend la base à l’identique, Timestamps compris', async () => {
    const instantane = async () => Object.fromEntries(await Promise.all(Object.keys(collections).filter((n) => n !== 'crm_audit').map(async (nom) => [nom, Object.fromEntries((await db.collection(nom).get()).docs.map((d) => [d.id, d.data()]))])));
    const avant = await instantane();
    const c = {
      donnees, acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', maintenant: MAINTENANT,
      ecrire: ({ operations, parametres }) => executerEcritures({ donnees, ctx: ctx({ acteur: 'claude-code-jerome', jeton: 'claude-code-jerome' }), outil: 'essai', parametres, operations }),
      restaurer: (a) => restaurerOperation({ donnees, ctx: ctx({ acteur: 'claude-code-jerome', jeton: 'claude-code-jerome' }), ...a }),
    };
    const args = { id: 'p1', choix: 'affaires', confirmationNom: 'camille durand' };
    const apercu = await metier.supprimerPersonne(c, args); // double confirmation : l'aperçu ne supprime rien, le code (stocké dans Firestore) autorise la suite
    assert.equal(apercu.apercu, true);
    assert.deepEqual(await instantane(), avant);
    const r = await metier.supprimerPersonne(c, { ...args, codeConfirmation: apercu.code });
    assert.deepEqual(r.supprimes, { crm_personnes: 1, crm_affaires: 2, crm_activites: 2, crm_notes: 2, crm_evenements: 2 });
    assert.equal(await brut('crm_personnes', 'p1'), null);
    assert.equal(await brut('crm_affaires', 'a1'), null);
    await metier.restaurer(c, { operationId: r.operationId, apercu: false });
    assert.deepEqual(await instantane(), avant);
    // création par un outil : doublon refusé, forcer accepté, propriétaire par défaut, dates en Timestamp
    await assert.rejects(() => metier.creerPersonne(c, { nom: 'Élodie  BERNARD' }), /Élodie Bernard \(id p2\)/);
    const p = await metier.creerPersonne(c, { nom: 'Élodie Bernard', forcer: true });
    const doc = await brut('crm_personnes', p.id);
    assert.equal(doc.proprietaire, 'jerome.chevalier@gmail.com');
    assert.equal(doc.via, 'mcp');
    assert.ok(doc.creeLe instanceof Timestamp);
  });

  test('plafonds sur Firestore : écritures par heure et suppressions par jour réservées dans mcp_limites, refusées au-delà sans rien compter de plus', async () => {
    const limiteur = creerLimiteur({ donnees, maintenant: () => MAINTENANT.getTime() });
    const limites = { ...LIMITES_PAR_DEFAUT, ecrituresParHeure: 3, suppressionsParJour: 2 };
    await limiteur.reserver('jeton-essai', limites, { suppressions: 1 });
    await limiteur.reserver('jeton-essai', limites, { suppressions: 1 });
    await assert.rejects(() => limiteur.reserver('jeton-essai', limites, { suppressions: 1 }), (e) => e instanceof ErreurLimite && e.limite === 'suppressions_jour');
    await limiteur.reserver('jeton-essai', limites); // une écriture ordinaire passe : 3e de l'heure
    await assert.rejects(() => limiteur.reserver('jeton-essai', limites), (e) => e instanceof ErreurLimite && e.limite === 'ecritures_heure');
    const compteur = await brut('mcp_limites', 'jeton-essai');
    assert.deepEqual([compteur.heure.n, compteur.jour.n], [3, 2]);
    // des appels simultanés ne dépassent jamais le plafond
    const limites2 = { ...LIMITES_PAR_DEFAUT, ecrituresParHeure: 5 };
    const r = await Promise.allSettled(Array.from({ length: 12 }, () => limiteur.reserver('jeton-parallele', limites2)));
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 5);
  });
});
