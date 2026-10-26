// Appartenance par client : logique pure (js/os/membres.js) et branchement dans auth.js (CRM de Jérôme inchangé).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROLES, cheminMembre, compteMembre, emailNormalise, lireCompteAvecReprises, ATTENTES_LECTURE_MEMBRE } from '../js/os/membres.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const user = { email: 'Alice@Exemple.test', emailVerified: true, uid: 'u1' };

describe('membres : appartenance par client', () => {
  test('chemin de la fiche : clients/<client>/membres/<e-mail en minuscules>', () => {
    assert.equal(cheminMembre('acme', 'Alice@Exemple.test'), 'clients/acme/membres/alice@exemple.test');
    assert.equal(emailNormalise('  Bob@X.fr '), 'bob@x.fr');
    assert.throws(() => cheminMembre('../crm', 'a@b.fr'));
    assert.throws(() => cheminMembre('acme', 'a/b@c.fr'));
    assert.throws(() => cheminMembre('acme', ''));
  });
  test('deux rôles seulement : éditeur (lit et écrit) et lecteur (lit)', () => {
    assert.deepEqual(Object.keys(ROLES).sort(), ['editeur', 'lecteur']);
    assert.deepEqual(compteMembre(user, 'acme', { role: 'editeur' }).ecrit, true);
    assert.deepEqual(compteMembre(user, 'acme', { role: 'lecteur' }).ecrit, false);
  });
  test('compte refusé : sans fiche, rôle inconnu, e-mail non vérifié, pas de compte', () => {
    assert.equal(compteMembre(user, 'acme', null), null);
    assert.equal(compteMembre(user, 'acme', {}), null);
    assert.equal(compteMembre(user, 'acme', { role: 'toString' }), null);
    assert.equal(compteMembre(user, 'acme', { role: 'administrateur' }), null);
    assert.equal(compteMembre({ ...user, emailVerified: false }, 'acme', { role: 'editeur' }), null);
    assert.equal(compteMembre(null, 'acme', { role: 'editeur' }), null);
  });
  test('compte accepté : porte le client et le rôle', () => {
    const c = compteMembre(user, 'acme', { role: 'lecteur', nom: 'Alice' });
    assert.equal(c.client, 'acme');
    assert.equal(c.role, 'lecteur');
    assert.equal(c.email, 'alice@exemple.test');
    assert.equal(c.nom, 'Alice');
  });
  test('auth.js : sans option, le CRM de Jérôme garde sa liste fixe ; avec { client }, on lit l\'appartenance', () => {
    const auth = lire('js/os/auth.js');
    assert.match(auth, /export function compteAutorise\(user\)/);
    assert.match(auth, /COMPTES_AUTORISES\[email\]/);
    assert.match(auth, /surveillerCompte\(rappel, \{ client = null \} = \{\}\)/);
    assert.match(auth, /await compteDuClient\(user, client\)/);
    assert.match(auth, /compte = compteAutorise\(user\)/);
    assert.match(lire('js/main.js'), /surveillerCompte\(async \(ev\) => \{/); // l'appel de la coque ne change pas
  });
  test('firestore.rules (CRM) ne parle pas des clients ; firestore.plateforme.rules refuse tout le reste', () => {
    assert.doesNotMatch(lire('firestore.rules'), /clients|membres/);
    assert.match(lire('firestore.plateforme.rules'), /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});

describe('lecture de la fiche d\'appartenance : une panne ne déconnecte jamais', () => {
  const erreur = (code) => Object.assign(new Error('x'), { code });
  const lancer = (sequence) => {
    const appels = { lire: 0, pauses: [], journal: [] };
    const lire = async () => { const s = sequence[Math.min(appels.lire++, sequence.length - 1)]; if (s instanceof Error) throw s; return s; };
    const r = lireCompteAvecReprises({ user, client: 'acme', lire, attentes: [1, 2, 3], pause: async (ms) => { appels.pauses.push(ms); }, journal: (...a) => appels.journal.push(a.join(' ')) });
    return r.then((resultat) => ({ resultat, appels }));
  };
  test('attentes par défaut : 400, 1200, 2500 ms (3 reprises)', () => {
    assert.deepEqual([...ATTENTES_LECTURE_MEMBRE], [400, 1200, 2500]);
  });
  test('fiche valide : connecté, une seule lecture', async () => {
    const { resultat, appels } = await lancer([{ role: 'editeur' }]);
    assert.equal(resultat.etat, 'ok');
    assert.equal(resultat.compte.role, 'editeur');
    assert.equal(appels.lire, 1);
  });
  test('fiche absente : refus (signOut côté appelant), sans reprise', async () => {
    const { resultat, appels } = await lancer([null]);
    assert.equal(resultat.etat, 'refus');
    assert.equal(appels.lire, 1);
  });
  test('permission-denied : refus, sans reprise', async () => {
    const { resultat, appels } = await lancer([erreur('permission-denied')]);
    assert.equal(resultat.etat, 'refus');
    assert.equal(appels.lire, 1);
  });
  test('erreur passagère puis succès : connecté (pas de refus)', async () => {
    const { resultat, appels } = await lancer([erreur('unavailable'), erreur('deadline-exceeded'), { role: 'lecteur' }]);
    assert.equal(resultat.etat, 'ok');
    assert.equal(appels.lire, 3);
    assert.deepEqual(appels.pauses, [1, 2]);
  });
  test('erreur persistante : état erreur après 4 lectures, jamais refus', async () => {
    const { resultat, appels } = await lancer([erreur('failed-precondition')]);
    assert.equal(resultat.etat, 'erreur');
    assert.equal(appels.lire, 4);
    assert.deepEqual(appels.pauses, [1, 2, 3]);
  });
  test('le journal donne le code d\'erreur, jamais l\'e-mail', async () => {
    const { appels } = await lancer([erreur('unavailable'), { role: 'editeur' }]);
    assert.match(appels.journal[0], /unavailable/);
    assert.doesNotMatch(appels.journal.join(' '), /exemple\.test/i);
  });
  test('compte non vérifié : refus sans lecture', async () => {
    let lu = 0;
    const r = await lireCompteAvecReprises({ user: { ...user, emailVerified: false }, client: 'acme', lire: async () => { lu++; return { role: 'editeur' }; } });
    assert.equal(r.etat, 'refus');
    assert.equal(lu, 0);
  });
  test('auth.js : l\'état erreur ne passe jamais par signOut', () => {
    const auth = lire('js/os/auth.js');
    assert.match(auth, /lu\.etat === 'erreur'\) \{ rappel\(\{ etat: 'erreur'[^\n]*return; \}/);
  });
});
