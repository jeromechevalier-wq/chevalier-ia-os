// Démarrage de Chevalier IA OS.
import { demarrerPwa } from './os/pwa.js';
import { appliquerTheme, afficherConnexion, monterCoquille, ESPACE_RACINE } from './os/shell.js';
import { surveillerCompte, connecter, deconnecter, MESSAGE_REFUS } from './os/auth.js';
import { routeCourante, routeDepuisHash, segments, surChangementRoute, naviguer, ROUTE_DEFAUT } from './os/router.js';
import { estRouteEspace, cleEspace } from './os/marque.js';
import { MODULES } from './os/modules.js';
import { demarrerObjectifs, arreterObjectifs } from './os/objectifs.js';
import { monterReglages } from './os/reglages.js';
import { h, lirePreference, vider, remplir, toast } from './os/ui.js';

appliquerTheme(lirePreference('theme', 'sombre'));
demarrerPwa();

const racine = document.getElementById('app');
let session = null; // { compte, coquille, apis: Map(id → api), vue: { cle, quitter } }
let arretRoute = null;

// Deux entrées : la page d'un client de la plateforme (#/espace/<client>, js/os/espace.js) ou le CRM de Jérôme (tout le reste, inchangé).
// Passer de l'une à l'autre (ou d'un client à un autre) recharge la page : chaque entrée démarre avec son propre état.
// La clé est `espace/<client>` : changer d'écran chez un même client ne recharge pas la page. (Route brute, sans le préfixe que le router ajoute chez un client.)
const cleEntree = () => (estRouteEspace(routeDepuisHash(location.hash)) ? cleEspace(routeDepuisHash(location.hash)) : '');
const entree = cleEntree();
window.addEventListener('hashchange', () => { if (cleEntree() !== entree) location.reload(); });

if (entree) {
  afficherChargement();
  import('./os/espace.js').then((m) => m.demarrerEspace(racine));
} else {
  demarrerCrm();
}

function demarrerCrm() {
  afficherChargement();
  surveillerCompte(async (ev) => {
    if (ev.etat === 'connecte') {
      if (session?.compte.email === ev.compte.email) return;
      await ouvrirSession(ev.compte);
    } else if (ev.etat === 'deconnecte') {
      fermerSession();
      afficherConnexion(racine, { message: ev.refus ? MESSAGE_REFUS : '', surConnexion: lancerConnexion });
    } else if (ev.etat === 'erreur') {
      toast(ev.message, { type: 'erreur' });
    }
  });
}

async function lancerConnexion() {
  try {
    await connecter();
  } catch (e) {
    console.warn('Connexion impossible', e?.code);
    toast('La connexion a échoué, réessaie.', { type: 'erreur' });
  }
}

function afficherChargement() {
  remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement')));
}

async function ouvrirSession(compte) {
  fermerSession();
  afficherChargement();
  const apis = new Map();
  for (const m of MODULES) {
    const api = await m.monter();
    apis.set(m.id, api);
  }
  const objectifsDepart = [...apis.values()].flatMap((api) => api.objectifsDepart || []);
  demarrerObjectifs(compte, objectifsDepart);
  for (const api of apis.values()) api.demarrer({ compte, cheminBase: '' }); // '' = racine (CRM de Jérôme) ; chez un client : cheminBaseClient(client)
  const coquille = monterCoquille(racine, compte, {
    apis,
    client: ESPACE_RACINE,
    surDeconnexion: async () => {
      fermerSession();
      await deconnecter();
    },
  });
  session = { compte, coquille, apis, vue: null };
  arretRoute = surChangementRoute(afficherRoute);
  afficherRoute(routeCourante());
}

function fermerSession() {
  if (!session) return;
  arretRoute?.();
  arretRoute = null;
  session.vue?.quitter?.();
  session.coquille?.arreter?.();
  for (const api of session.apis.values()) api.arreter();
  arreterObjectifs();
  import('./modules/crm/activites.js').then((m) => m.oublierFiltresHistorique()).catch(() => {}); // chargement à la demande : pas de dépendance circulaire
  import('./modules/automatisations/ecran.js').then((m) => m.oublierFiltresAutomatisations()).catch(() => {});
  session = null;
}

function afficherRoute(route) {
  if (!session) return;
  const segs = segments(route);
  const { coquille, apis } = session;
  let cle;
  let afficher;
  if (segs[0] === 'reglages') {
    cle = 'reglages';
    afficher = () => monterReglages(coquille.contenu, segs, {
      apis, actifs: MODULES.map((m) => m.id), chezClient: false, nomEspace: 'Chevalier IA OS', marque: null, fiche: null, compte: session.compte,
    });
  } else {
    const m = MODULES.find((x) => x.prefixe === segs[0]);
    if (!m) { naviguer(ROUTE_DEFAUT, { remplacer: true }); return; }
    cle = `module:${m.id}`;
    const api = apis.get(m.id);
    afficher = () => api.afficher(coquille.contenu, segs.slice(1), { compte: session.compte });
  }
  if (session.vue?.cle !== cle) {
    session.vue?.quitter?.();
    vider(coquille.contenu);
    session.vue = { cle, quitter: null };
  }
  const quitter = afficher();
  if (typeof quitter === 'function') session.vue.quitter = quitter;
  coquille.activer(segs.join('/'));
}
