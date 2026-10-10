// Règles Storage de la plateforme (storage.plateforme.rules) : émulateur Storage seul, projet demo-chevalier-ia-os.
// Lancé par « npm run test:storage » (config firebase.plateforme.json), jamais en parallèle d'un autre émulateur sur le même port.
import { test, describe, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, getBytes, uploadBytes, deleteObject, listAll, getMetadata } from 'firebase/storage';

const REGLES = readFileSync(fileURLToPath(new URL('../storage.plateforme.rules', import.meta.url)), 'utf8');
const [hote, port] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-chevalier-ia-os', storage: { rules: REGLES, host: hote, port: Number(port) } });
  await env.withSecurityRulesDisabled(async (c) => {
    const s = c.storage();
    await uploadBytes(ref(s, 'marques/a/logo.png'), new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
    await uploadBytes(ref(s, 'prive/secret.txt'), new Uint8Array([9]), { contentType: 'text/plain' });
  });
});
after(async () => { await env?.cleanup(); });

describe('règles Storage de la plateforme', () => {
  const contextes = () => [env.unauthenticatedContext().storage(), env.authenticatedContext('u1', { email: 'alice@exemple.test', email_verified: true }).storage()];

  test('S1 un fichier de marques/<client> se lit sans connexion et avec un compte', async () => {
    for (const s of contextes()) {
      await assertSucceeds(getBytes(ref(s, 'marques/a/logo.png')));
      await assertSucceeds(getMetadata(ref(s, 'marques/a/logo.png')));
    }
  });
  test('S2 pas de liste du dossier', async () => {
    for (const s of contextes()) {
      await assertFails(listAll(ref(s, 'marques/a')));
      await assertFails(listAll(ref(s, 'marques')));
    }
  });
  test('S3 aucune écriture ni suppression depuis un navigateur (même connecté)', async () => {
    for (const s of contextes()) {
      await assertFails(uploadBytes(ref(s, 'marques/a/logo.png'), new Uint8Array([7])));
      await assertFails(uploadBytes(ref(s, 'marques/b/nouveau.png'), new Uint8Array([7])));
      await assertFails(deleteObject(ref(s, 'marques/a/logo.png')));
    }
  });
  test('S4 tout le reste du stockage est refusé', async () => {
    for (const s of contextes()) {
      await assertFails(getBytes(ref(s, 'prive/secret.txt')));
      await assertFails(uploadBytes(ref(s, 'prive/autre.txt'), new Uint8Array([1])));
      await assertFails(getBytes(ref(s, 'logo.png')));
    }
  });
});
