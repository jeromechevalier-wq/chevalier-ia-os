// La porte de bout en bout avec le VRAI accès Firestore (SDK d'administration) contre l'ÉMULATEUR : clés, intégrité (faux n8n), isolation entre deux clients
// et la racine, création sans écrasement, mise à jour sans création. Lancé par « npm test » (émulateurs) ; ignoré si l'émulateur n'est pas démarré.
import { test, describe, before, after, beforeEach } from 'node:test';
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

// Saisie à l'écran du tableau de bord (scripts/porte/saisie-tableaudebord.js) avec le VRAI accès Firestore : le lot est atomique (S2).
describe('Saisie du tableau de bord et Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app; let db; let donnees;
  const T0 = Date.parse('2026-10-17T10:00:00Z');
  const MAIL = 'jerome.chevalier@gmail.com';
  const IND = { tableau: 'technique', famille: 'cles', nom: 'Clé API de n8n', type: 'etat', niveau: 'orange', message: 'Date à vérifier', methode: 'manuel', echeance: Timestamp.fromDate(new Date('2026-12-01')), proprietaire: 'interne' };
  const CHEM = 'tableaudebord_indicateurs/cle_n8n';
  const HISTORIQUE = 'tableaudebord_releves/cle_n8n_20261017T100000';

  before(async () => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-saisie-tdb');
    db = getFirestore(app);
    donnees = creerAdaptateur({ db });
  });
  after(async () => { await deleteApp(app); });
  beforeEach(async () => {
    for (const c of ['tableaudebord_indicateurs', 'tableaudebord_releves']) await db.recursiveDelete(db.collection(c));
    await db.doc(CHEM).set(IND);
  });

  test('S2 une saisie écrit l\'indicateur ET l\'historique en un lot, avec de vraies dates et « avant »', async () => {
    const { saisir } = await import('../scripts/porte/saisie-tableaudebord.js');
    const r = await saisir({ donnees, maintenant: () => T0, auteur: MAIL, demande: { indicateurId: 'cle_n8n', echeance: '2027-05-01', commentaire: 'Renouvelée' } });
    assert.equal(r.niveau, 'vert');
    const ind = (await db.doc(CHEM).get()).data();
    assert.equal(ind.saisiPar, MAIL);
    assert.ok(ind.saisiLe instanceof Timestamp && ind.releveLe instanceof Timestamp && ind.echeance instanceof Timestamp);
    assert.equal(ind.echeance.toDate().toISOString().slice(0, 10), '2027-05-01');
    assert.equal(ind.nom, 'Clé API de n8n', 'les autres champs ne bougent pas');
    const h = (await db.doc(HISTORIQUE).get()).data();
    assert.equal(h.saisie, true);
    assert.equal(h.saisiPar, MAIL);
    assert.ok(h.saisiLe instanceof Timestamp);
    assert.equal(h.avant.echeance.toDate().toISOString().slice(0, 10), '2026-12-01');
    assert.equal(h.commentaire, 'Renouvelée');
  });
  test('S2 si le lot échoue (historique déjà présent, même seconde), l\'indicateur n\'est PAS modifié non plus', async () => {
    const { saisir } = await import('../scripts/porte/saisie-tableaudebord.js');
    await db.doc(HISTORIQUE).set({ indicateurId: 'cle_n8n', saisie: true, ancien: true });
    await assert.rejects(() => saisir({ donnees, maintenant: () => T0, auteur: MAIL, demande: { indicateurId: 'cle_n8n', echeance: '2027-05-01' } }));
    const ind = (await db.doc(CHEM).get()).data();
    assert.equal(ind.saisiPar, undefined);
    assert.equal(ind.niveau, 'orange');
    assert.equal(ind.echeance.toDate().toISOString().slice(0, 10), '2026-12-01');
    assert.deepEqual((await db.doc(HISTORIQUE).get()).data(), { indicateurId: 'cle_n8n', saisie: true, ancien: true }, 'l\'historique existant n\'est pas écrasé');
  });
  test('ecrireLot : une mise à jour d\'un document absent échoue et rien n\'est créé ; chemin piégé refusé ; lot vide ou inconnu refusé', async () => {
    await assert.rejects(() => donnees.ecrireLot([
      { type: 'creer', chemin: 'tableaudebord_releves/nouveau', donnees: { a: 1 } },
      { type: 'maj', chemin: 'tableaudebord_indicateurs/fantome', donnees: { a: 1 } },
    ]));
    assert.equal((await db.doc('tableaudebord_releves/nouveau').get()).exists, false);
    assert.equal((await db.doc('tableaudebord_indicateurs/fantome').get()).exists, false);
    await assert.rejects(() => donnees.ecrireLot([{ type: 'creer', chemin: 'a/../b', donnees: {} }]), /Chemin invalide/);
    await assert.rejects(() => donnees.ecrireLot([]), /Lot invalide/);
    await assert.rejects(() => donnees.ecrireLot([{ type: 'supprimer', chemin: CHEM, donnees: {} }]), /inconnue/);
    assert.equal((await db.doc(CHEM).get()).exists, true);
  });
  test('S5 sur la vraie base : la saisie résiste au relevé du script (ignores: 1) tandis qu\'un « auto » est réécrit', async () => {
    const { saisir } = await import('../scripts/porte/saisie-tableaudebord.js');
    const { ACTIONS_TABLEAU } = await import('../scripts/porte/actions-tableaudebord.js');
    await saisir({ donnees, maintenant: () => T0, auteur: MAIL, demande: { indicateurId: 'cle_n8n', echeance: '2027-05-01' } });
    const lendemain = new Date(T0 + 86_400_000);
    const script = { id: 'cle_n8n', tableau: 'technique', famille: 'cles', nom: 'Clé API de n8n', type: 'etat', niveau: 'orange', message: 'Date à vérifier', releveLe: lendemain, methode: 'manuel' };
    const ctx = { base: '', donnees, auteur: 'github:abcd1234', maintenant: () => lendemain.getTime(), proprietaire: 'interne' };
    assert.deepEqual(await ACTIONS_TABLEAU['indicateurs.ecrire'].executer(ctx, { indicateurs: [script] }), { ecrits: 0, ignores: 1 });
    assert.equal((await db.doc(CHEM).get()).data().saisiPar, MAIL);
    assert.deepEqual(await ACTIONS_TABLEAU['indicateurs.ecrire'].executer(ctx, { indicateurs: [{ ...script, methode: 'auto' }] }), { ecrits: 1, ignores: 0 });
    assert.equal((await db.doc(CHEM).get()).data().saisiPar, null);
  });
});
