// Démarrage de Chevalier IA OS.
import { demarrerPwa } from './os/pwa.js';
import { appliquerTheme, afficherConnexion, monterCoquille, boutonTheme } from './os/shell.js';
import { surveillerCompte, connecter, deconnecter, MESSAGE_REFUS } from './os/auth.js';
import { routeCourante, segments, surChangementRoute, naviguer, ROUTE_DEFAUT } from './os/router.js';
import { estRouteEspace } from './os/marque.js';
import { MODULES } from './os/modules.js';
import { demarrerObjectifs, arreterObjectifs, rendreReglagesObjectifs } from './os/objectifs.js';
import { h, icone, lirePreference, vider, remplir, toast } from './os/ui.js';

appliquerTheme(lirePreference('theme', 'sombre'));
demarrerPwa();

const racine = document.getElementById('app');
let session = null; // { compte, coquille, apis: Map(id → api), vue: { cle, quitter } }
let arretRoute = null;

// Deux entrées : la page d'un client de la plateforme (#/espace/<client>, js/os/espace.js) ou le CRM de Jérôme (tout le reste, inchangé).
// Passer de l'une à l'autre (ou d'un client à un autre) recharge la page : chaque entrée démarre avec son propre état.
const cleEntree = () => (estRouteEspace(routeCourante()) ? routeCourante().toLowerCase() : '');
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
    afficher = () => afficherReglages(coquille.contenu);
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

function afficherReglages(conteneur) {
  vider(conteneur);
  const arrets = [];
  const page = h('div', { class: 'page page-reglages' },
    h('header', { class: 'page-tete' }, h('div', {}, h('p', { class: 'etiquette' }, 'Chevalier IA OS'), h('h1', {}, 'Réglages'))));
  for (const api of session.apis.values()) {
    const r = api.reglages?.(page);
    if (typeof r === 'function') arrets.push(r);
  }
  const sectionObjectifs = h('section', { class: 'carte-section', id: 'reglages-objectifs' },
    h('h2', {}, icone('target', { taille: 18 }), 'Objectifs du mois'),
    h('p', { class: 'aide' }, 'Cibles, libellés, couleurs, ordre et affichage. Les objectifs calculés sont fixés dans le code ; tu peux ajouter des objectifs manuels.'));
  arrets.push(rendreReglagesObjectifs(sectionObjectifs));
  const sectionTheme = h('section', { class: 'carte-section', id: 'reglages-theme' },
    h('h2', {}, icone('sun', { taille: 18 }), 'Thème'),
    h('p', { class: 'aide' }, 'Le thème choisi est mémorisé sur cet appareil.'),
    boutonTheme('bouton bouton-secondaire'));
  page.append(sectionObjectifs, sectionTheme);
  conteneur.append(page);
  return () => arrets.forEach((f) => f());
}
