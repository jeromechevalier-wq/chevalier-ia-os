// Appartenance par client : logique pure (js/os/membres.js) et branchement dans auth.js (CRM de Jérôme inchangé).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROLES, cheminMembre, compteMembre, emailNormalise } from '../js/os/membres.js';

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
    assert.match(auth, /client \? await compteDuClient\(user, client\) : compteAutorise\(user\)/);
    assert.match(lire('js/main.js'), /surveillerCompte\(async \(ev\) => \{/); // l'appel de la coque ne change pas
  });
  test('firestore.rules (CRM) ne parle pas des clients ; firestore.plateforme.rules refuse tout le reste', () => {
    assert.doesNotMatch(lire('firestore.rules'), /clients|membres/);
    assert.match(lire('firestore.plateforme.rules'), /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});
