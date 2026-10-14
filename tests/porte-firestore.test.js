// La porte de bout en bout avec le VRAI accès Firestore (SDK d'administration) contre l'ÉMULATEUR : clés, intégrité (faux n8n), isolation entre deux clients
// et la racine, création sans écrasement, mise à jour sans création. Lancé par « npm test » (émulateurs) ; ignoré si l'émulateur n'est pas démarré.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerAdaptateur } from '../scripts/porte/adaptateur.js';
import { creerPorte } from '../scripts/porte/porte.js';
import { genererCle, enregistrementDe, TABLE_CLES } from '../scripts/porte/cles.js';
import { ErreurN8n } from '../scripts/porte/n8n.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-chevalier-ia-os';
const WORKFLOWS = {
  wA: { id: 'wA', nom: 'client-audrey-veille', etiquettes: ['client-audrey'] },
  wM: { id: 'wM', nom: 'client-martin-veille', etiquettes: ['client-martin'] },
  wI: { id: 'wI', nom: 'interne-veille', etiquettes: ['interne'] },
};

describe('Porte et Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app; let db; let donnees; let plateforme; let crm; const cles = {};
  const n8n = { async lireWorkflow(id) { if (!WORKFLOWS[id]) throw new ErreurN8n('introuvable', 'non'); return WORKFLOWS[id]; } };
  const appel = (porte, cle, action, d, workflowId) => porte({ methode: 'POST', authorization: `Bearer ${cle}`, corps: { module: 'veille', action, workflowId, donnees: d } });

  before(async () => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-porte');
    db = getFirestore(app);
    donnees = creerAdaptateur({ db });
    for (const c of ['plateforme_cles', 'veille_sources', 'veille_contenus', 'veille_resumes', 'clients']) {
      await db.recursiveDelete(db.collection(c));
    }
    for (const p of ['audrey', 'martin', 'interne']) {
      const cle = genererCle(p);
      const e = enregistrementDe(cle, p, new Date());
      await db.collection(TABLE_CLES).doc(e.id).set({ ...e.donnees, creeLe: Timestamp.fromDate(e.donnees.creeLe) });
      cles[p] = { cle, id: e.id };
    }
    await db.doc('clients/audrey/veille_sources/s1').set({ nom: 'Chaîne Alpha', type: 'YouTube', actif: true });
    await db.doc('clients/martin/veille_sources/s1').set({ nom: 'Source de Martin', actif: true });
    await db.doc('veille_sources/s1').set({ nom: 'Source de Jérôme', type: 'Podcast', actif: true });
    plateforme = creerPorte({ contexte: 'plateforme', donnees, n8n, modulesActifs: async () => ['veille'] });
    crm = creerPorte({ contexte: 'crm', donnees, n8n, modulesActifs: async () => ['veille'] });
  });
  after(async () => { await deleteApp(app); });

  const contenu = { id: 'c1', sourceId: 's1', titre: 'Une vidéo', url: 'https://exemple.test/v1', datePublication: '2026-10-10T08:00:00Z' };

  test('création sous le client, sans écrasement, avec de vraies dates', async () => {
    const r = await appel(plateforme, cles.audrey.cle, 'contenus.ajouter', { contenus: [contenu] }, 'wA');
    assert.deepEqual(r.corps.resultat, { crees: 1, existants: 0 });
    const d = (await db.doc('clients/audrey/veille_contenus/c1').get()).data();
    assert.equal(d.etat, 'nouveau');
    assert.ok(d.detecteLe instanceof Timestamp && d.datePublication instanceof Timestamp);
    await db.doc('clients/audrey/veille_contenus/c1').update({ etat: 'resume' });
    assert.deepEqual((await appel(plateforme, cles.audrey.cle, 'contenus.ajouter', { contenus: [contenu] }, 'wA')).corps.resultat, { crees: 0, existants: 1 });
    assert.equal((await db.doc('clients/audrey/veille_contenus/c1').get()).data().etat, 'resume', 'un appel répété n\'écrase rien');
  });
  test('isolation : rien chez Martin ni à la racine, et la clé d\'Audrey ne passe pas avec le workflow de Martin', async () => {
    assert.equal((await db.doc('clients/martin/veille_contenus/c1').get()).exists, false);
    assert.equal((await db.doc('veille_contenus/c1').get()).exists, false);
    assert.equal((await appel(plateforme, cles.audrey.cle, 'contenus.ajouter', { contenus: [{ ...contenu, id: 'c9' }] }, 'wM')).statut, 403);
    assert.equal((await db.doc('clients/audrey/veille_contenus/c9').get()).exists, false);
  });
  test('base 1 : la clé « interne » écrit à la racine, avec la source de Jérôme', async () => {
    const r = await appel(crm, cles.interne.cle, 'contenus.ajouter', { contenus: [contenu] }, 'wI');
    assert.equal(r.statut, 200);
    assert.equal((await db.doc('veille_contenus/c1').get()).data().sourceNom, 'Source de Jérôme');
    assert.equal((await appel(crm, cles.audrey.cle, 'sources.lire', {}, 'wA')).statut, 403, 'une clé de client n\'ouvre pas la base 1');
  });
  test('mise à jour : seulement ce qui existe (rien n\'est créé), puis résumé avec un identifiant stable', async () => {
    assert.equal((await appel(plateforme, cles.audrey.cle, 'contenus.changerEtat', { id: 'fantome', etat: 'resume' }, 'wA')).statut, 404);
    assert.equal((await db.doc('clients/audrey/veille_contenus/fantome').get()).exists, false);
    const base = { contenuId: 'c1', idExecution: '77', modele: 'deepseek/deepseek-v4-pro', coutReel: 0.002, devise: 'USD', payeur: 'jerome' };
    assert.deepEqual((await appel(plateforme, cles.audrey.cle, 'resumes.ajouter', base, 'wA')).corps.resultat, { id: 'r-c1-77', cree: true });
    assert.deepEqual((await appel(plateforme, cles.audrey.cle, 'resumes.ajouter', { ...base, coutReel: 5 }, 'wA')).corps.resultat, { id: 'r-c1-77', cree: false });
    assert.equal((await db.doc('clients/audrey/veille_resumes/r-c1-77').get()).data().coutReel, 0.002);
  });
  test('lecture : seulement ce client, filtre par état', async () => {
    await db.doc('clients/martin/veille_contenus/m1').set({ titre: 'Martin', etat: 'nouveau' });
    const r = await appel(plateforme, cles.audrey.cle, 'contenus.lire', { etat: 'resume' }, 'wA');
    assert.deepEqual(r.corps.resultat.contenus.map((c) => c.id), ['c1']);
    assert.equal(typeof r.corps.resultat.contenus[0].detecteLe, 'string');
  });
  test('dernier usage écrit dans plateforme_cles ; une clé révoquée est refusée aussitôt', async () => {
    const d = (await db.collection(TABLE_CLES).doc(cles.audrey.id).get()).data();
    assert.ok(d.dernierUsage instanceof Timestamp);
    await db.collection(TABLE_CLES).doc(cles.audrey.id).update({ actif: false });
    assert.equal((await appel(plateforme, cles.audrey.cle, 'sources.lire', {}, 'wA')).statut, 401);
  });
  test('l\'adaptateur refuse un chemin piégé et ne sait rien supprimer', async () => {
    for (const mauvais of ['clients/../x', 'a//b', 'a/b c', '', 'a/b/../c']) await assert.rejects(() => donnees.lireDoc(mauvais), /Chemin invalide/, mauvais);
    assert.equal(typeof donnees.supprimer, 'undefined');
    assert.equal(Object.keys(donnees).some((k) => /suppr|delete|efface/i.test(k)), false);
  });
});
