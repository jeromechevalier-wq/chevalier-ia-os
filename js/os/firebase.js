// Initialisation de Firebase (SDK 12.19.0 depuis gstatic) et bascule vers les émulateurs en mode test.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { configurationDeLaMaison } from './firebase-init.js';

/** Mode test : appli servie sur localhost avec ?emulateurs=1. */
export const MODE_EMULATEURS =
  ['localhost', '127.0.0.1'].includes(location.hostname) &&
  new URLSearchParams(location.search).get('emulateurs') === '1';

// Mode test seulement : les tests peuvent poser window.__emulateurs ({ projet, auth: {hote, port}, firestore: {hote, port} })
// avant le chargement pour viser un autre projet / d'autres ports (tests en parallèle). Sans cela : les valeurs habituelles.
const EMU = (MODE_EMULATEURS && window.__emulateurs) || {};
/** Crochets de test (mode émulateurs seulement, objet vide sinon) : auth.js y lit la panne simulée de reglages_maison/public. */
export const CROCHETS_TEST = EMU;

// Chantier 0 (26/11/2026) : la configuration n'est plus écrite dans le code. Le CRM la lit auprès de Firebase Hosting (/__/firebase/init.json, domaine de
// connexion forcé à <projet>.web.app comme avant) ; la plateforme garde son fichier généré (complet) ; les émulateurs, une configuration factice locale,
// sans aucun appel réseau, avec un projet "demo-" qui garantit qu'aucune requête n'atteint la production.
const config = await configurationDeLaMaison({ modeEmulateurs: MODE_EMULATEURS, projetEmulateurs: EMU.projet, fichier: firebaseConfig });
Object.assign(firebaseConfig, config); // même objet exporté qu'avant (Réglages > Déploiement, Google Picker le lisent)

export const app = initializeApp(config);
export const auth = getAuth(app);
// Cache Firestore en mémoire (pas de cache persistant, pas de mode hors ligne en V1).
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  ignoreUndefinedProperties: true,
});

if (MODE_EMULATEURS) {
  connectAuthEmulator(auth, `http://${EMU.auth?.hote || '127.0.0.1'}:${EMU.auth?.port || 9099}`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMU.firestore?.hote || '127.0.0.1', EMU.firestore?.port || 8080);
}
