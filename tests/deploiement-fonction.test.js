// Fonction « deploiementVerifier » (page Réglages > Déploiement), chez Jérôme (functions/src/deploiement-appel.js) et sur la plateforme (functions-plateforme/src/deploiement.js).
// Base FAUSSE en mémoire : aucun émulateur, aucun réseau. On vérifie le contrôle d'accès, qu'aucune valeur sensible ne sort, et qu'un contrôle qui plante reste isolé.
// Demande « npm run preparer » (copie du code commun dans functions-plateforme/serveur/), lancé par « npm run test:fonctions ».
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { executerControles, reponseDeploiement, membresCoherents, CONTROLES_SERVEUR } from '../functions/src/coeur/deploiement.js';
import { creerAppelDeploiement } from '../functions/src/deploiement-appel.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const { verifierDeploiementClient } = await import('../functions-plateforme/src/deploiement.js');
const { Refus } = await import('../functions-plateforme/src/appels.js');

const ALICE = 'alice@exemple.test'; // éditrice chez a
const LEA = 'lea@exemple.test'; // lectrice chez a
const BOB = 'bob@exemple.test'; // éditeur chez b
const ZOE = 'zoe@exemple.test'; // éditrice chez c (sans aucun module, équipe incohérente)

function fauxDb(fiches) {
  return {
    doc: (chemin) => ({ get: async () => { const f = fiches[chemin]; return { exists: Boolean(f), get: (champ) => f?.[champ] }; } }),
    collection: (chemin) => ({
      get: async () => {
        if (fiches.__panne === chemin) throw new Error('base indisponible');
        const prefixe = `${chemin}/`;
        const docs = Object.entries(fiches).filter(([c]) => c.startsWith(prefixe) && !c.slice(prefixe.length).includes('/'))
          .map(([c, f]) => ({ id: c.slice(prefixe.length), get: (champ) => f[champ] }));
        return { docs };
      },
    }),
  };
}
const FICHES = {
  'clients/a': { modules: { affaires: true, devis: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] },
  [`clients/a/membres/${ALICE}`]: { role: 'editeur' },
  [`clients/a/membres/${LEA}`]: { role: 'lecteur' },
  'clients/b': { modules: { affaires: true }, equipe: [{ email: BOB, role: 'editeur' }] },
  [`clients/b/membres/${BOB}`]: { role: 'editeur' },
  'clients/c': { equipe: [{ email: ZOE, role: 'lecteur' }] }, // l'équipe dit « lecteur », la fiche d'appartenance dit « éditeur » : incohérent
  [`clients/c/membres/${ZOE}`]: { role: 'editeur' },
};
const auth = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });
const appelerClient = (email, donnees, fiches = FICHES, extra = {}) => verifierDeploiementClient({ db: fauxDb(fiches), auth: email === null ? null : auth(email, extra.verifie), donnees, version: '2.4.1' });
const refus = (promesse, code) => assert.rejects(promesse, (e) => e instanceof Refus && e.code === code && (code !== 'permission-denied' || e.message === 'Action non autorisée.'), `refus ${code}`);
/** Aucune adresse, aucun lien, aucun nom de secret : seulement des mots fixes. */
const sansDonneeSensible = (r) => {
  const texte = JSON.stringify(r);
  assert.doesNotMatch(texte, /@/, 'aucune adresse e-mail');
  assert.doesNotMatch(texte, /http/, 'aucun lien');
  assert.doesNotMatch(texte, /N8N|SECRET|JETON|KEY|clients\//i, 'aucun nom de secret ni chemin');
  assert.deepEqual(Object.keys(r).sort(), ['controles', 'ok', 'version']);
  for (const v of Object.values(r.controles)) assert.ok(['ok', 'manque', 'inconnu'].includes(v));
};

describe('8 deploiementVerifier sur la plateforme : contrôle d’accès', () => {
  test('8 une éditrice de l’espace a reçoit les états de SON espace : fonctions ok, membres ok', async () => {
    const r = await appelerClient(ALICE, { client: 'a' });
    assert.deepEqual(r, { ok: true, version: '2.4.1', controles: { fonctions: 'ok', membres: 'ok' } });
    sansDonneeSensible(r);
  });
  test('8 la page marche chez un client SANS module Devis (aucune condition de module)', async () => {
    assert.equal((await appelerClient(BOB, { client: 'b' })).controles.fonctions, 'ok');
  });
  test('8 lectrice, membre d’un autre espace, inconnu : refus neutre « Action non autorisée. » ; compte non vérifié ou absent : connexion requise', async () => {
    await refus(appelerClient(LEA, { client: 'a' }), 'permission-denied');
    await refus(appelerClient(BOB, { client: 'a' }), 'permission-denied');
    await refus(appelerClient('inconnu@exemple.test', { client: 'a' }), 'permission-denied');
    await refus(appelerClient(ALICE, { client: 'inexistant' }), 'permission-denied');
    await refus(appelerClient(ALICE, { client: 'a' }, FICHES, { verifie: false }), 'unauthenticated');
    await refus(appelerClient(null, { client: 'a' }), 'unauthenticated');
    await refus(appelerClient(ALICE, { client: '../a' }), 'invalid-argument');
    await refus(appelerClient(ALICE, {}), 'invalid-argument');
  });
  test('8 membres incohérents (l’équipe affichée et les fiches d’appartenance ne disent pas la même chose) = « manque », sans dire qui', async () => {
    const r = await appelerClient(ZOE, { client: 'c' });
    assert.equal(r.controles.membres, 'manque');
    sansDonneeSensible(r);
  });
  test('10 un contrôle qui plante (base indisponible) vaut « inconnu » ; « fonctions » reste ok', async () => {
    const r = await appelerClient(ALICE, { client: 'a' }, { ...FICHES, __panne: 'clients/a/membres' });
    assert.deepEqual(r.controles, { fonctions: 'ok', membres: 'inconnu' });
  });
});

describe('8 deploiementVerifier chez Jérôme', () => {
  const appel = creerAppelDeploiement({ version: '2.4.1', comptes: [ALICE] });
  test('8 un compte autorisé reçoit les états ; rien de sensible', async () => {
    const r = await appel({ auth: auth(ALICE) });
    assert.deepEqual(r, { ok: true, version: '2.4.1', controles: { fonctions: 'ok', membres: 'ok' } });
    sansDonneeSensible(r);
  });
  test('8 un autre compte : refus neutre « Action non autorisée. » ; sans connexion : connexion nécessaire', async () => {
    await assert.rejects(appel({ auth: auth(BOB) }), (e) => e.code === 'permission-denied' && e.message === 'Action non autorisée.');
    await assert.rejects(appel({ auth: auth(ALICE, false) }), (e) => e.code === 'permission-denied');
    await assert.rejects(appel({}), (e) => e.code === 'unauthenticated');
  });
});

describe('Code commun (functions/src/coeur/deploiement.js)', () => {
  test('10 chaque contrôle est isolé : une erreur ou une réponse étrange = « inconnu », les autres continuent', async () => {
    const r = await executerControles({ fonctions: async () => { throw new Error('x'); }, membres: async () => 'peut-être' });
    assert.deepEqual(r, { fonctions: 'inconnu', membres: 'inconnu' });
    assert.deepEqual(await executerControles({ fonctions: async () => true }), { fonctions: 'ok', membres: 'inconnu' });
    assert.deepEqual(CONTROLES_SERVEUR, ['fonctions', 'membres']);
  });
  test('8 la réponse ne laisse passer que les états connus et une version de la forme 1.2.3', () => {
    assert.deepEqual(reponseDeploiement({ version: '1.2.3; rm', resultats: { fonctions: 'ok', membres: 'alice@exemple.test', autre: 'x' } }), { ok: true, version: 'inconnue', controles: { fonctions: 'ok', membres: 'inconnu' } });
  });
  test('8 membresCoherents : mêmes adresses et mêmes rôles des deux côtés (sans la casse), au moins un éditeur', () => {
    assert.equal(membresCoherents([{ email: 'A@x.test', role: 'editeur' }], [{ id: 'a@x.test', role: 'editeur' }]), true);
    assert.equal(membresCoherents([{ email: 'a@x.test', role: 'lecteur' }], [{ id: 'a@x.test', role: 'lecteur' }]), false, 'aucun éditeur');
    assert.equal(membresCoherents([{ email: 'a@x.test', role: 'editeur' }], [{ id: 'a@x.test', role: 'editeur' }, { id: 'b@x.test', role: 'lecteur' }]), false, 'un membre absent de l’équipe');
    assert.equal(membresCoherents(null, []), false);
    assert.equal(membresCoherents([], []), false);
  });
});
