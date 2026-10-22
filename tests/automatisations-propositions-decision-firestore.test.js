// La décision d'une proposition contre l'ÉMULATEUR Firestore (SDK d'administration réel : transactions, Timestamps).
// Prouve la vraie course : deux décisions lancées en même temps, une seule gagne, l'autre reçoit « Déjà décidée par … ».
// Ignoré si l'émulateur n'est pas démarré. Projet de démonstration, jamais de données réelles.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerAccesFirestore } from '../functions/src/coeur/donnees.js';
import { decider } from '../functions/src/coeur/propositions.js';
import { valider_proposition, lire_proposition } from '../functions/src/mcp/outils/propositions.js';
import { COMPTES_AUTORISES } from '../functions/src/veille/appel.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-chevalier-propositions';
const T0 = Date.parse('2026-10-22T10:00:00Z');
const [MAIL, AUTRE] = COMPTES_AUTORISES;
const DOC = {
  type: 'Essai', titre: 'Proposition de test', resume: '', champsProposes: [{ nom: 'nom', valeur: 'Alice Test' }], champsValides: null, lien: null,
  etat: 'a_valider', creeLe: Timestamp.fromMillis(T0 - 3600_000), expireLe: Timestamp.fromMillis(T0 + 29 * 86_400_000),
  valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null, tentatives: 0, derniereErreur: null,
  executions: { proposer: null, appliquer: null, refuser: null }, etapes: [], source: 'porte', ecritPar: 'porte:abcd',
};

describe('Décision d\'une proposition sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app;
  let db;
  let donnees;
  const brut = async (id) => (await db.collection('automatisations_propositions').doc(id).get()).data();

  before(() => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-propositions');
    db = getFirestore(app);
    donnees = creerAccesFirestore({ db });
  });
  after(async () => { await deleteApp(app); });
  beforeEach(async () => {
    for (const d of (await db.collection('automatisations_propositions').get()).docs) await d.ref.delete();
    await db.collection('automatisations_propositions').doc('p1').set(DOC);
  });

  test('2 dix décisions en même temps (valider / refuser) : exactement une gagne, les autres reçoivent « Déjà décidée par … », une seule décision est écrite', async () => {
    const essais = Array.from({ length: 10 }, (_, i) => decider({
      donnees, par: i % 2 ? AUTRE : MAIL, canal: i % 2 ? 'mcp' : 'interface', maintenant: T0 + i,
      demande: i % 3 ? { id: 'p1', decision: 'valider' } : { id: 'p1', decision: 'refuser', raison: `r${i}` },
    }));
    const r = await Promise.allSettled(essais);
    const gagnantes = r.filter((x) => x.status === 'fulfilled');
    assert.equal(gagnantes.length, 1);
    for (const x of r.filter((y) => y.status === 'rejected')) {
      assert.equal(x.reason.code, 'deja_decidee');
      assert.match(x.reason.message, /^Déjà décidée par \S+@\S+ à \d\d:\d\d\.$/);
    }
    const p = await brut('p1');
    assert.ok(['validee', 'refusee'].includes(p.etat));
    assert.equal(p.etat === 'validee', p.valideePar !== null);
    assert.equal(p.etat === 'refusee', p.refuseePar !== null);
    assert.ok(p.valideeLe instanceof Timestamp || p.refuseeLe instanceof Timestamp, 'horodatage = Timestamp Firestore');
    assert.equal(p.ecritPar, 'porte:abcd');
  });

  test('3 valider_proposition sur Firestore : validee, canal mcp, valideePar ; lire_proposition relit les Timestamp en texte', async () => {
    const c = { donnees, email: MAIL, maintenant: new Date(T0) };
    await valider_proposition.executer({ ...c, args: { id: 'p1' } });
    const p = await brut('p1');
    assert.deepEqual([p.etat, p.valideePar, p.canal], ['validee', MAIL, 'mcp']);
    assert.equal(p.valideeLe.toMillis(), T0);
    const lu = await lire_proposition.executer({ ...c, args: { id: 'p1' } });
    assert.equal(lu.proposition.valideeLe, new Date(T0).toISOString());
    assert.equal(lu.proposition.perimee, false);
  });

  test('une proposition inconnue n\'est pas créée par une décision', async () => {
    await assert.rejects(() => decider({ donnees, par: MAIL, canal: 'interface', maintenant: T0, demande: { id: 'fantome', decision: 'valider' } }), (e) => e.code === 'introuvable');
    assert.equal((await db.collection('automatisations_propositions').doc('fantome').get()).exists, false);
  });
});
