// Fonction `baseAccorderAcces` (24/11/2026) : réservée à Jérôme par son identité, un compte à la fois, fusion des mentions Firebase.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { creerAppelAccorderAcces, COMPTES_BASE, EFFET } from '../functions/src/base/acces-appel.js';

const JEROME = COMPTES_BASE[0];
const demande = (token, data = { email: 'cible@client-fictif.example', espace: 'espace-test' }) => ({ auth: token === undefined ? undefined : { token }, data });
const jeromeOk = { email: JEROME, email_verified: true };

function fauxAuth(comptes = {}) {
  const ecritures = [];
  return {
    ecritures,
    async getUserByEmail(email) {
      if (!comptes[email]) throw Object.assign(new Error('x'), { code: 'auth/user-not-found' });
      return comptes[email];
    },
    async setCustomUserClaims(uid, claims) { ecritures.push({ uid, claims }); },
  };
}
const compteCible = (extra = {}) => ({ 'cible@client-fictif.example': { uid: 'u1', emailVerified: true, customClaims: { autre: 'garde', admin: true }, ...extra } });
const refus = (appel, requete, code) => assert.rejects(() => appel(requete), (e) => e.code === code, `attendu ${code}`);

describe('baseAccorderAcces : accès côté serveur', () => {
  test('sans connexion : refusé', async () => {
    const auth = fauxAuth(compteCible());
    await refus(creerAppelAccorderAcces({ auth }), demande(undefined), 'unauthenticated');
    assert.equal(auth.ecritures.length, 0);
  });

  test('bot, éditeur client, lecteur, assistant, e-mail non vérifié, jeton sans e-mail : refusés, rien écrit', async () => {
    const auth = fauxAuth(compteCible());
    const appel = creerAppelAccorderAcces({ auth });
    for (const email of ['jeromebot.chevalierbot@gmail.com', 'editeur@client-fictif.example', 'lecteur@client-fictif.example', 'assistant@client-fictif.example']) {
      await refus(appel, demande({ email, email_verified: true }), 'permission-denied');
    }
    await refus(appel, demande({ email: JEROME, email_verified: false }), 'permission-denied');
    await refus(appel, demande({ email: JEROME }), 'permission-denied');
    await refus(appel, demande({ email_verified: true }), 'permission-denied');
    await refus(appel, demande({ sub: 'bot', role: 'complet', email_verified: true }), 'permission-denied');
    assert.equal(auth.ecritures.length, 0);
  });

  test('la liste des comptes ne contient que Jérôme', () => {
    assert.deepEqual([...COMPTES_BASE], [JEROME]);
  });
});

describe('baseAccorderAcces : poser et retirer', () => {
  test('donner : pose les deux mentions en gardant les autres, répond { ok, effetAu }', async () => {
    const auth = fauxAuth(compteCible());
    const r = await creerAppelAccorderAcces({ auth })(demande(jeromeOk));
    assert.deepEqual(r, { ok: true, effetAu: EFFET });
    assert.deepEqual(auth.ecritures, [{ uid: 'u1', claims: { autre: 'garde', admin: true, role: 'authenticated', espace_base: 'espace-test' } }]);
  });

  test('donner sur un compte sans aucune mention : seulement les deux', async () => {
    const auth = fauxAuth({ 'cible@client-fictif.example': { uid: 'u2', emailVerified: true } });
    await creerAppelAccorderAcces({ auth })(demande(jeromeOk));
    assert.deepEqual(auth.ecritures[0].claims, { role: 'authenticated', espace_base: 'espace-test' });
  });

  test('retirer : ne retire que ces deux clés', async () => {
    const auth = fauxAuth(compteCible({ customClaims: { autre: 'garde', role: 'authenticated', espace_base: 'espace-test' } }));
    const r = await creerAppelAccorderAcces({ auth })(demande(jeromeOk, { email: 'cible@client-fictif.example', retirer: true }));
    assert.deepEqual(r, { ok: true, effetAu: EFFET });
    assert.deepEqual(auth.ecritures[0].claims, { autre: 'garde' });
  });

  test('retirer reste possible si l\'e-mail du compte n\'est plus vérifié', async () => {
    const auth = fauxAuth(compteCible({ emailVerified: false }));
    await creerAppelAccorderAcces({ auth })(demande(jeromeOk, { email: 'cible@client-fictif.example', retirer: true }));
    assert.equal(auth.ecritures.length, 1);
  });
});

describe('baseAccorderAcces : refus de la cible et des entrées', () => {
  test('compte cible à e-mail non vérifié : refusé, rien écrit', async () => {
    const auth = fauxAuth(compteCible({ emailVerified: false }));
    await refus(creerAppelAccorderAcces({ auth }), demande(jeromeOk), 'failed-precondition');
    assert.equal(auth.ecritures.length, 0);
  });

  test('adresse sans compte : not-found', async () => {
    const auth = fauxAuth({});
    await refus(creerAppelAccorderAcces({ auth }), demande(jeromeOk), 'not-found');
  });

  test('entrées invalides : e-mail, espace (majuscule, espace, vide), tableau d\'e-mails (pas de lot)', async () => {
    const auth = fauxAuth(compteCible());
    const appel = creerAppelAccorderAcces({ auth });
    await refus(appel, demande(jeromeOk, { email: 'pas-un-email', espace: 'espace-test' }), 'invalid-argument');
    await refus(appel, demande(jeromeOk, { email: ['a@b.example', 'c@d.example'], espace: 'espace-test' }), 'invalid-argument');
    for (const espace of ['Espace', 'a b', '', 'a/b', undefined]) {
      await refus(appel, demande(jeromeOk, { email: 'cible@client-fictif.example', espace }), 'invalid-argument');
    }
    assert.equal(auth.ecritures.length, 0);
  });

  test('erreur d\'écriture : message lisible, sans détail technique', async () => {
    const auth = fauxAuth(compteCible());
    auth.setCustomUserClaims = async () => { throw new Error('PERMISSION_DENIED detail interne'); };
    await assert.rejects(() => creerAppelAccorderAcces({ auth })(demande(jeromeOk)), (e) => e.code === 'internal' && !/detail interne/.test(e.message));
  });

  test('ni la réponse ni le journal ne contiennent d\'e-mail', async () => {
    const lignes = [];
    const auth = fauxAuth(compteCible());
    const r = await creerAppelAccorderAcces({ auth, journal: (e) => lignes.push(JSON.stringify(e)) })(demande(jeromeOk));
    assert.deepEqual(Object.keys(r).sort(), ['effetAu', 'ok']);
    assert.ok(![JSON.stringify(r), ...lignes].some((t) => /@/.test(t)));
  });
});

describe('baseAccorderAcces : branchement', () => {
  test('exportée par functions/src/index.js, absente de la plateforme', () => {
    const jerome = readFileSync(new URL('../functions/src/index.js', import.meta.url), 'utf8');
    const clients = readFileSync(new URL('../functions-plateforme/src/index.js', import.meta.url), 'utf8');
    assert.match(jerome, /^export const baseAccorderAcces = onCall\(/m);
    assert.doesNotMatch(clients, /baseAccorderAcces/);
  });
});
