// Fonction « deploiementVerifier » (page Réglages > Déploiement), chez Jérôme (functions/src/deploiement-appel.js) et sur la plateforme (functions-plateforme/src/deploiement.js).
// Base FAUSSE en mémoire : aucun émulateur, aucun réseau. On vérifie le contrôle d'accès, qu'aucune valeur sensible ne sort, et qu'un contrôle qui plante reste isolé.
// Demande « npm run preparer » (copie du code commun dans functions-plateforme/serveur/), lancé par « npm run test:fonctions ».
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { executerControles, reponseDeploiement, membresCoherents, stockageRepond, CONTROLES_SERVEUR } from '../functions/src/coeur/deploiement.js';
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
  'clients/d': { modules: {} }, // espace créé sans champ `equipe` : les membres font foi
  [`clients/d/membres/${BOB}`]: { role: 'editeur' },
};
const auth = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });
const appelerClient = (email, donnees, fiches = FICHES, extra = {}) => verifierDeploiementClient({ db: fauxDb(fiches), auth: email === null ? null : auth(email, extra.verifie), donnees, version: '2.4.1', pdf: extra.pdf });
/** Faux stockage : getFiles réussit, ou lève l'erreur donnée. */
const fauxBucket = (erreur = null) => ({ getFiles: async () => { if (erreur) throw erreur; return [[]]; } });
const PDF_OK = { bucket: () => fauxBucket(), fonctions: () => true };
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
    assert.deepEqual(r, { ok: true, version: '2.4.1', controles: { fonctions: 'ok', membres: 'ok', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'inconnu' } });
    sansDonneeSensible(r);
  });
  test('J chez un client, les lignes du PDF : stockage qui répond et fonctions déclarées = ok ; stockage introuvable (404) = manque ; droit refusé = inconnu (jamais un faux rouge) ; fonctions absentes = manque', async () => {
    const pdf = (bucket, fonctions = true) => ({ bucket: () => bucket, fonctions: () => fonctions });
    const ok = await appelerClient(ALICE, { client: 'a' }, FICHES, { pdf: PDF_OK });
    assert.deepEqual(ok.controles, { fonctions: 'ok', membres: 'ok', 'pdf-stockage': 'ok', 'pdf-fonctions': 'ok' });
    sansDonneeSensible(ok);
    assert.equal((await appelerClient(ALICE, { client: 'a' }, FICHES, { pdf: pdf(fauxBucket(Object.assign(new Error('x'), { code: 404 }))) })).controles['pdf-stockage'], 'manque');
    assert.equal((await appelerClient(ALICE, { client: 'a' }, FICHES, { pdf: pdf(fauxBucket(Object.assign(new Error('x'), { code: 403 }))) })).controles['pdf-stockage'], 'inconnu');
    assert.equal((await appelerClient(ALICE, { client: 'a' }, FICHES, { pdf: pdf(null) })).controles['pdf-stockage'], 'manque');
    assert.equal((await appelerClient(ALICE, { client: 'a' }, FICHES, { pdf: pdf(fauxBucket(), false) })).controles['pdf-fonctions'], 'manque');
  });
  test('8 un espace SANS copie `equipe` (créé à la main) mais avec un éditeur dans `membres` : membres = ok (plus de faux rouge) ; la réponse reste ok|manque|inconnu', async () => {
    const r = await appelerClient(BOB, { client: 'd' });
    assert.equal(r.controles.membres, 'ok');
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
    assert.deepEqual(r.controles, { fonctions: 'ok', membres: 'inconnu', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'inconnu' });
  });
});

describe('8 deploiementVerifier chez Jérôme', () => {
  const appel = creerAppelDeploiement({ version: '2.4.1', comptes: [ALICE], pdf: PDF_OK });
  test('8 un compte autorisé reçoit les états ; rien de sensible', async () => {
    const r = await appel({ auth: auth(ALICE) });
    assert.deepEqual(r, { ok: true, version: '2.4.1', controles: { fonctions: 'ok', membres: 'ok', 'pdf-stockage': 'ok', 'pdf-fonctions': 'ok' } });
    sansDonneeSensible(r);
  });
  test('J chez Jérôme, sans les réglages du PDF les deux lignes valent « inconnu » ; un stockage qui plante aussi', async () => {
    assert.deepEqual((await creerAppelDeploiement({ version: '2.4.1', comptes: [ALICE] })({ auth: auth(ALICE) })).controles, { fonctions: 'ok', membres: 'ok', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'inconnu' });
    const plante = creerAppelDeploiement({ version: '2.4.1', comptes: [ALICE], pdf: { bucket: () => { throw new Error('pas de stockage'); }, fonctions: () => true } });
    assert.deepEqual((await plante({ auth: auth(ALICE) })).controles, { fonctions: 'ok', membres: 'ok', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'ok' });
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
    assert.deepEqual(r, { fonctions: 'inconnu', membres: 'inconnu', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'inconnu' });
    assert.deepEqual(await executerControles({ fonctions: async () => true }), { fonctions: 'ok', membres: 'inconnu', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'inconnu' });
    assert.deepEqual(CONTROLES_SERVEUR, ['fonctions', 'membres', 'pdf-stockage', 'pdf-fonctions']);
  });
  test('8 la réponse ne laisse passer que les états connus et une version de la forme 1.2.3', () => {
    assert.deepEqual(reponseDeploiement({ version: '1.2.3; rm', resultats: { fonctions: 'ok', membres: 'alice@exemple.test', autre: 'x' } }), { ok: true, version: 'inconnue', controles: { fonctions: 'ok', membres: 'inconnu', 'pdf-stockage': 'inconnu', 'pdf-fonctions': 'inconnu' } });
  });
  test('J stockageRepond : liste le dossier des devis sans rien écrire ; 404 = faux ; autre erreur relancée ; objet inutilisable = faux', async () => {
    assert.equal(await stockageRepond(fauxBucket()), true);
    assert.equal(await stockageRepond(fauxBucket(Object.assign(new Error('x'), { code: 404 }))), false);
    await assert.rejects(stockageRepond(fauxBucket(Object.assign(new Error('x'), { code: 403 }))));
    const debut = Date.now();
    await assert.rejects(stockageRepond({ getFiles: () => new Promise(() => {}) }, { delaiMs: 50 }), /délai/);
    assert.ok(Date.now() - debut < 1000, 'un stockage qui ne répond jamais : erreur (donc « inconnu ») sans attendre');
    assert.equal(await stockageRepond(null), false);
    assert.equal(await stockageRepond({}), false);
  });
  test('8 membresCoherents : mêmes adresses et mêmes rôles des deux côtés (sans la casse), au moins un éditeur', () => {
    assert.equal(membresCoherents([{ email: 'A@x.test', role: 'editeur' }], [{ id: 'a@x.test', role: 'editeur' }]), true);
    assert.equal(membresCoherents([{ email: 'a@x.test', role: 'lecteur' }], [{ id: 'a@x.test', role: 'lecteur' }]), false, 'aucun éditeur');
    assert.equal(membresCoherents([{ email: 'a@x.test', role: 'editeur' }], [{ id: 'a@x.test', role: 'editeur' }, { id: 'b@x.test', role: 'lecteur' }]), false, 'un membre absent de l’équipe');
    assert.equal(membresCoherents(null, []), false);
    assert.equal(membresCoherents([], []), false);
    // equipe ABSENTE : la vérité est `membres` (au moins un éditeur)
    assert.equal(membresCoherents(null, [{ id: 'a@x.test', role: 'editeur' }]), true, 'equipe absente + éditeur');
    assert.equal(membresCoherents(undefined, [{ id: 'a@x.test', role: 'editeur' }, { id: 'b@x.test', role: 'lecteur' }]), true, 'equipe non définie + éditeur');
    assert.equal(membresCoherents(null, [{ id: 'a@x.test', role: 'lecteur' }]), false, 'equipe absente sans éditeur');
    assert.equal(membresCoherents(undefined, []), false, 'equipe absente, aucun membre');
    assert.equal(membresCoherents(null, null), false);
    assert.equal(membresCoherents([{ email: 'a@x.test', role: 'lecteur' }], [{ id: 'a@x.test', role: 'editeur' }]), false, 'equipe différente (rôle)');
    assert.equal(membresCoherents([{ email: 'b@x.test', role: 'editeur' }], [{ id: 'a@x.test', role: 'editeur' }]), false, 'equipe différente (adresse)');
    assert.equal(membresCoherents([], [{ id: 'a@x.test', role: 'editeur' }]), false, 'equipe vide mais des membres');
    assert.equal(membresCoherents('x', [{ id: 'a@x.test', role: 'editeur' }]), false, 'equipe illisible');
    assert.equal(membresCoherents([{ email: ' A@X.test ', role: 'editeur' }], [{ id: 'a@x.test', role: 'editeur' }]), true, 'casse et espaces');
  });
});
