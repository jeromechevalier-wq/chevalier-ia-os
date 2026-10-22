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
  test('S5bis sur la vraie base : une saisie validée entre la lecture et l\'écriture du script n\'est pas écrasée (vraie précondition lastUpdateTime)', async () => {
    const { saisir } = await import('../scripts/porte/saisie-tableaudebord.js');
    const { ACTIONS_TABLEAU } = await import('../scripts/porte/actions-tableaudebord.js');
    const lendemain = new Date(T0 + 86_400_000);
    const script = { id: 'cle_n8n', tableau: 'technique', famille: 'cles', nom: 'Clé API de n8n', type: 'etat', niveau: 'orange', message: 'Date à vérifier', releveLe: lendemain, methode: 'manuel' };
    const ctx = (d) => ({ base: '', donnees: d, auteur: 'github:abcd1234', maintenant: () => lendemain.getTime(), proprietaire: 'interne' });
    // La saisie arrive APRÈS la lecture du script et AVANT son écriture : on la glisse dans le premier majDoc.
    let majs = 0; let lectures = 0;
    const concurrent = {
      ...donnees,
      async lireDoc(c) { lectures++; return donnees.lireDoc(c); },
      async majDoc(c, p, o) {
        majs++;
        if (majs === 1) await saisir({ donnees, maintenant: () => T0, auteur: MAIL, demande: { indicateurId: 'cle_n8n', echeance: '2027-05-01' } });
        return donnees.majDoc(c, p, o);
      },
    };
    assert.deepEqual(await ACTIONS_TABLEAU['indicateurs.ecrire'].executer(ctx(concurrent), { indicateurs: [script] }), { ecrits: 0, ignores: 1 });
    const ind = (await db.doc(CHEM).get()).data();
    assert.equal(ind.saisiPar, MAIL, 'la saisie est intacte');
    assert.equal(ind.echeance.toDate().toISOString().slice(0, 10), '2027-05-01');
    assert.equal(ind.ecritPar, undefined, 'le script n\'a rien écrit');
    assert.equal(majs, 1);
    assert.equal(lectures, 2, 'une seule relecture');
  });
  test('majDoc : sans changement la précondition passe ; après un changement elle échoue (résultat distinct de « absent ») ; un document absent reste false sans précondition', async () => {
    const { PRECONDITION_ECHOUEE } = await import('../scripts/porte/adaptateur.js');
    const lu = await donnees.lireDoc(CHEM);
    assert.ok(lu.updateTime, 'lireDoc rend updateTime');
    assert.equal(await donnees.majDoc(CHEM, { message: 'A' }, { lastUpdateTime: lu.updateTime }), true);
    assert.equal(await donnees.majDoc(CHEM, { message: 'B' }, { lastUpdateTime: lu.updateTime }), PRECONDITION_ECHOUEE, 'le document a changé depuis la lecture');
    assert.equal((await db.doc(CHEM).get()).data().message, 'A', 'rien n\'est écrit quand la précondition échoue');
    assert.equal(await donnees.majDoc('tableaudebord_indicateurs/fantome', { a: 1 }), false);
    // Avec une précondition, Firestore répond « précondition échouée » (et non « introuvable ») pour un document absent : rien n'est créé non plus.
    assert.equal(await donnees.majDoc('tableaudebord_indicateurs/fantome', { a: 1 }, { lastUpdateTime: lu.updateTime }), PRECONDITION_ECHOUEE);
    assert.equal((await db.doc('tableaudebord_indicateurs/fantome').get()).exists, false);
    assert.equal(await donnees.majDoc(CHEM, { message: 'C' }), true, 'sans option : comme avant');
  });
});

// File « À valider » (actions propositions.*) avec le VRAI accès Firestore : création sans écrasement, vraies dates, ordre et limite, précondition, isolation entre deux propriétaires.
describe('Porte, automatisations et Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app; let db; let donnees; let plateforme; let crm; const cles = {};
  const T = Date.parse('2026-10-22T09:00:00Z');
  const flows = {
    wA: { id: 'wA', nom: 'client-audrey-propositions', etiquettes: ['client-audrey'] },
    wM: { id: 'wM', nom: 'client-martin-propositions', etiquettes: ['client-martin'] },
    wI: { id: 'wI', nom: 'interne-propositions', etiquettes: ['interne'] },
  };
  const n8n = { async lireWorkflow(id) { if (!flows[id]) throw new ErreurN8n('introuvable', 'non'); return flows[id]; } };
  const appel = (porte, cle, action, d, workflowId) => porte({ methode: 'POST', authorization: `Bearer ${cle}`, corps: { module: 'automatisations', action, workflowId, donnees: d } });
  const P = { id: 'p1', type: 'Nouveau contact', titre: 'Ajouter une personne', resume: 'Reçu par e-mail.', champs: [{ nom: 'Nom', valeur: 'Alice Exemple' }], executionId: '42' };
  const chemA = (id) => `clients/audrey/automatisations_propositions/${id}`;

  before(async () => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-porte-autom');
    db = getFirestore(app);
    donnees = creerAdaptateur({ db });
    for (const c of ['plateforme_cles', 'automatisations_propositions', 'clients']) await db.recursiveDelete(db.collection(c));
    for (const p of ['audrey', 'martin', 'interne']) {
      const cle = genererCle(p);
      const e = enregistrementDe(cle, p, new Date());
      await db.collection(TABLE_CLES).doc(e.id).set({ ...e.donnees, creeLe: Timestamp.fromDate(e.donnees.creeLe) });
      cles[p] = { cle, id: e.id };
    }
    const modulesActifs = async () => ['automatisations'];
    plateforme = creerPorte({ contexte: 'plateforme', donnees, n8n, modulesActifs, maintenant: () => T });
    crm = creerPorte({ contexte: 'crm', donnees, n8n, modulesActifs, maintenant: () => T });
  });
  after(async () => { await deleteApp(app); });

  test('1 création sans écrasement : vraies dates, rejeu sans doublon ni modification', async () => {
    const r = await appel(plateforme, cles.audrey.cle, 'propositions.ajouter', P, 'wA');
    assert.deepEqual(r.corps.resultat, { id: 'p1', cree: true, etat: 'a_valider' });
    const d = (await db.doc(chemA('p1')).get()).data();
    assert.ok(d.creeLe instanceof Timestamp && d.expireLe instanceof Timestamp);
    assert.equal(d.expireLe.toMillis() - d.creeLe.toMillis(), 30 * 86_400_000);
    assert.equal(d.etat, 'a_valider');
    await db.doc(chemA('p1')).update({ etat: 'validee', valideeLe: Timestamp.fromMillis(T - 1000) });
    const r2 = await appel(plateforme, cles.audrey.cle, 'propositions.ajouter', { ...P, titre: 'Autre' }, 'wA');
    assert.deepEqual(r2.corps.resultat, { id: 'p1', cree: false, etat: 'validee' });
    assert.equal((await db.doc(chemA('p1')).get()).data().titre, 'Ajouter une personne');
    assert.equal((await db.collection('clients/audrey/automatisations_propositions').get()).size, 1);
  });

  test('3 « lireValidees » : seulement les validées, les plus anciennes d\'abord, limite respectée, dates en texte', async () => {
    for (const [id, ms] of [['p-b', T - 2000], ['p-a', T - 9000], ['p-c', T - 500]]) {
      await appel(plateforme, cles.audrey.cle, 'propositions.ajouter', { ...P, id }, 'wA');
      await db.doc(chemA(id)).update({ etat: 'validee', valideeLe: Timestamp.fromMillis(ms) });
    }
    await appel(plateforme, cles.audrey.cle, 'propositions.ajouter', { ...P, id: 'p-attente' }, 'wA');
    const tout = (await appel(plateforme, cles.audrey.cle, 'propositions.lireValidees', {}, 'wA')).corps.resultat.propositions;
    assert.deepEqual(tout.map((p) => p.id), ['p-a', 'p-b', 'p1', 'p-c']);
    assert.equal(typeof tout[0].valideeLe, 'string');
    assert.deepEqual((await appel(plateforme, cles.audrey.cle, 'propositions.lireValidees', { limite: 2 }, 'wA')).corps.resultat.propositions.map((p) => p.id), ['p-a', 'p-b']);
  });

  test('4 « marquerAppliquee » seulement depuis « validee » ; « marquerEchec » compte les tentatives', async () => {
    const refus = await appel(plateforme, cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p-attente' }, 'wA');
    assert.equal(refus.statut, 409);
    assert.equal((await db.doc(chemA('p-attente')).get()).data().etat, 'a_valider');
    const ok = await appel(plateforme, cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p-a', executionId: '99' }, 'wA');
    assert.deepEqual(ok.corps.resultat, { id: 'p-a', etat: 'appliquee', deja: false });
    const a = (await db.doc(chemA('p-a')).get()).data();
    assert.equal(a.etat, 'appliquee');
    assert.equal(a.executions.appliquer, '99');
    assert.equal(a.executions.proposer, '42', 'le reste de « executions » est gardé');
    assert.equal(a.titre, 'Ajouter une personne', 'les autres champs ne bougent pas');
    const e = await appel(plateforme, cles.audrey.cle, 'propositions.marquerEchec', { id: 'p-b', erreur: 'Le serveur a répondu 500' }, 'wA');
    assert.deepEqual(e.corps.resultat, { id: 'p-b', etat: 'echec', tentatives: 1, deja: false });
    assert.equal((await db.doc(chemA('p-b')).get()).data().derniereErreur, 'Le serveur a répondu 500');
    assert.equal((await appel(plateforme, cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p-b' }, 'wA')).statut, 409, 'une proposition en échec doit d\'abord être relancée');
  });

  test('4 bis deux « marquerAppliquee » en même temps : une seule écriture, l\'autre appel répond deja:true (précondition sur le document lu)', async () => {
    await appel(plateforme, cles.audrey.cle, 'propositions.ajouter', { ...P, id: 'p-course' }, 'wA');
    await db.doc(chemA('p-course')).update({ etat: 'validee', valideeLe: Timestamp.fromMillis(T) });
    const rs = await Promise.all([1, 2].map((n) => appel(plateforme, cles.audrey.cle, 'propositions.marquerAppliquee', { id: 'p-course', executionId: String(n) }, 'wA')));
    assert.deepEqual(rs.map((r) => r.statut), [200, 200]);
    assert.deepEqual(rs.map((r) => r.corps.resultat.deja).sort(), [false, true]);
  });

  test('5 isolation : Martin et la racine ne voient rien d\'Audrey, et chacun écrit dans sa propre base', async () => {
    assert.equal((await appel(plateforme, cles.martin.cle, 'propositions.lireValidees', {}, 'wM')).corps.resultat.propositions.length, 0);
    assert.equal((await appel(plateforme, cles.martin.cle, 'propositions.marquerAppliquee', { id: 'p1' }, 'wM')).statut, 404);
    assert.equal((await appel(plateforme, cles.martin.cle, 'propositions.lireValidees', {}, 'wA')).statut, 403, 'le workflow d\'Audrey n\'ouvre rien avec la clé de Martin');
    assert.equal((await appel(plateforme, cles.martin.cle, 'propositions.ajouter', { ...P, titre: 'Pour Martin' }, 'wM')).statut, 200);
    assert.equal((await db.doc('clients/martin/automatisations_propositions/p1').get()).data().titre, 'Pour Martin');
    assert.equal((await db.doc(chemA('p1')).get()).data().titre, 'Ajouter une personne');
    assert.equal((await appel(crm, cles.interne.cle, 'propositions.ajouter', { ...P, titre: 'Pour Jérôme' }, 'wI')).statut, 200);
    assert.equal((await db.doc('automatisations_propositions/p1').get()).data().titre, 'Pour Jérôme');
    assert.equal((await appel(crm, cles.interne.cle, 'propositions.lireValidees', {}, 'wI')).corps.resultat.propositions.length, 0, 'rien de validé à la racine');
    assert.equal((await appel(crm, cles.audrey.cle, 'propositions.lireValidees', {}, 'wA')).statut, 403, 'une clé de client n\'ouvre pas la base 1');
  });
});
