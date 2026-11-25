// Configuration Firebase de la maison, lue auprès de Google (chantier 0, 26/11/2026). Aucun import de Firebase : testable seul (tests/firebase-init.test.js).
// Firebase Hosting sert, sur chaque site, l'adresse réservée /__/firebase/init.json : la configuration web du projet qui sert la page (apiKey, projectId,
// storageBucket, messagingSenderId, appId). Le domaine de connexion est forcé à <projet>.web.app (init.json donne <projet>.firebaseapp.com) : c'est
// celui qu'utilisait le CRM avant (connexion Google sur le même domaine que le site), comme la page OAuth du serveur (functions/src/oauth/page.js).

export const ADRESSE_CONFIG_HEBERGEMENT = '/__/firebase/init.json';
export const CLES_CONFIG = Object.freeze(['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']);

/** Configuration factice des émulateurs (mode test) : jamais de vraie clé, jamais d'appel réseau. Le projet "demo-…" vient des tests. */
export const CONFIG_EMULATEURS = Object.freeze({
  apiKey: 'cle-factice-emulateurs',
  authDomain: 'localhost',
  storageBucket: 'reserve-factice-emulateurs',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:0000000000000000',
});
export const PROJET_EMULATEURS_PAR_DEFAUT = 'demo-chevalier-ia-os';
export const ATTENTES_CONFIG = Object.freeze([500, 1500, 3000]);
export const MESSAGE_CONFIG_IMPOSSIBLE = 'Chargement impossible pour le moment. Vérifie ta connexion internet, puis recharge la page.';

/** Garde les six clés de la configuration web et force le domaine de connexion <projet>.web.app. Lève si la réponse n'a pas la bonne forme. */
export function configDepuisInit(init) {
  const projet = init?.projectId;
  if (typeof projet !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projet) || typeof init.apiKey !== 'string' || !init.apiKey) {
    throw Object.assign(new Error('Configuration du site illisible'), { code: 'config-illisible' });
  }
  const config = {};
  for (const cle of CLES_CONFIG) if (typeof init[cle] === 'string' && init[cle]) config[cle] = init[cle];
  config.authDomain = `${projet}.web.app`;
  return config;
}

const pauseParDefaut = (ms) => new Promise((r) => setTimeout(r, ms));

/** Message de panne dans la page (la configuration manque : rien d'autre ne peut démarrer), avec un bouton « Recharger ». */
function afficherPanneConfig(doc) {
  const racine = doc?.getElementById?.('app');
  if (!racine) return;
  const bloc = doc.createElement('div');
  bloc.className = 'chargement-panne';
  bloc.setAttribute('role', 'alert');
  const texte = doc.createElement('p');
  texte.textContent = MESSAGE_CONFIG_IMPOSSIBLE;
  const bouton = doc.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton';
  bouton.textContent = 'Recharger';
  bouton.addEventListener('click', () => doc.defaultView?.location?.reload());
  bloc.append(texte, bouton);
  racine.replaceChildren(bloc);
}

/**
 * La configuration à donner à initializeApp :
 *  - émulateurs : CONFIG_EMULATEURS avec le projet des tests (aucun appel réseau) ;
 *  - fichier déjà rempli (paquet de la plateforme, généré par scripts/hebergement.js) : ce fichier, tel quel ;
 *  - sinon (CRM) : /__/firebase/init.json, avec reprises ; panne persistante = message dans la page, puis erreur (rien ne démarre).
 */
export async function configurationDeLaMaison({ modeEmulateurs, projetEmulateurs, fichier, charger = (a, o) => fetch(a, o), attentes = ATTENTES_CONFIG, pause = pauseParDefaut, doc = globalThis.document }) {
  if (modeEmulateurs) return { ...CONFIG_EMULATEURS, projectId: projetEmulateurs || PROJET_EMULATEURS_PAR_DEFAUT };
  if (fichier && typeof fichier.projectId === 'string' && fichier.projectId) return { ...fichier };
  for (let essai = 0; ; essai++) {
    try {
      const r = await charger(ADRESSE_CONFIG_HEBERGEMENT, { cache: 'no-store' });
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { code: 'config-http' });
      return configDepuisInit(await r.json());
    } catch (e) {
      console.warn('Configuration du site impossible à lire :', e?.code || 'inconnu', `(essai ${essai + 1})`);
      if (essai >= attentes.length) {
        afficherPanneConfig(doc);
        throw e;
      }
      await pause(attentes[essai]);
    }
  }
}
