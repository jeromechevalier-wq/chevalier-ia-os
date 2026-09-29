// Initialisation de Firebase (SDK 12.19.0 depuis gstatic) et bascule vers les émulateurs en mode test.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

/** Mode test : appli servie sur localhost avec ?emulateurs=1. */
export const MODE_EMULATEURS =
  ['localhost', '127.0.0.1'].includes(location.hostname) &&
  new URLSearchParams(location.search).get('emulateurs') === '1';

// Avec les émulateurs, le projet "demo-" garantit qu'aucune requête n'atteint la production.
const config = MODE_EMULATEURS ? { ...firebaseConfig, projectId: 'demo-chevalier-ia-os' } : firebaseConfig;

export const app = initializeApp(config);
export const auth = getAuth(app);
// Cache Firestore en mémoire (pas de cache persistant, pas de mode hors ligne en V1).
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  ignoreUndefinedProperties: true,
});

if (MODE_EMULATEURS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
