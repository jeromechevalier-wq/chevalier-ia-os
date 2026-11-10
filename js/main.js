// Démarrage de Chevalier IA OS.
import { demarrerPwa } from './os/pwa.js';
import { appliquerTheme, afficherConnexion, monterCoquille, ESPACE_RACINE } from './os/shell.js';
import { surveillerCompte, connecter, deconnecter, crmDisponible, MESSAGE_REFUS } from './os/auth.js';
import { routeCourante, routeDepuisHash, segments, surChangementRoute, naviguer, definirPrefixe, suivreLiensDuPrefixe, ROUTE_DEFAUT } from './os/router.js';
import { estRouteEspace } from './os/marque.js';
import { blocIntrouvablePortail } from './os/portail-introuvable.js';
import { PORTAILS, portailDeRoute, modulesDuPortail, cleEntreeDe, ecranSocleDeRoute } from './os/portail.js';
import { MODULES } from './os/modules.js';
import { demarrerObjectifs, arreterObjectifs } from './os/objectifs.js';
import { monterReglages } from './os/reglages.js';
import { demarrer as demarrerSocle, arreter as arreterSocle } from './modules/crm/donnees.js';
import { h, lirePreference, vider, remplir, toast } from './os/ui.js';

appliquerTheme(lirePreference('theme', 'sombre'));
demarrerPwa();

const racine = document.getElementById('app');
let session = null; // { compte, coquille, apis: Map(id → api), vue: { cle, quitter } }
let arretRoute = null;
let arretLiens = null;
const portail = portailDeRoute(routeDepuisHash(location.hash)); // portail devis seul chez Jérôme : null pour le CRM complet
const accueilPortail = portail ? PORTAILS[portail.id].accueil : null;

// Deux entrées : la page d'un client de la plateforme (#/espace/<client>, js/os/espace.js) ou le CRM de Jérôme (tout le reste, inchangé).
// Passer de l'une à l'autre (ou d'un client à un autre) recharge la page : chaque entrée démarre avec son propre état.
// La clé est `espace/<client>` : changer d'écran chez un même client ne recharge pas la page. (Route brute, sans le préfixe que le router ajoute chez un client.)
// Le portail devis seul (js/os/portail.js) est une entrée de plus : passer du CRM au portail, ou d'un portail à l'autre, recharge aussi la page.
const cleEntree = () => cleEntreeDe(routeDepuisHash(location.hash));
const entree = cleEntree();
window.addEventListener('hashchange', () => { if (cleEntree() !== entree) location.reload(); });

if (estRouteEspace(routeDepuisHash(location.hash))) {
  afficherChargement();
  import('./os/espace.js').then((m) => m.demarrerEspace(racine));
} else {
  demarrerCrm();
}

function demarrerCrm() {
  afficherChargement();
  // Plateforme clients : pas de CRM de Jérôme ici. Une adresse sans route d'espace (signet, onglet restauré) n'écoute pas la connexion
  // et ne déconnecte jamais personne (la connexion est partagée entre les onglets, dont l'espace d'un client).
  if (!crmDisponible()) { import('./os/espace.js').then((m) => m.pageSansEspace(racine)); return; }
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
  demarrerSocle(compte, '', { noyau: true }); // socle commun, racine ; le module Affaires démarre par-dessus en complet (cinq écouteurs, aucun doublon)
  for (const api of apis.values()) api.demarrer({ compte, cheminBase: '' }); // '' = racine (CRM de Jérôme) ; chez un client : cheminBaseClient(client)
  let modulesCoquille = MODULES;
  let apisCoquille = apis;
  let options = {};
  if (portail) {
    const ids = modulesDuPortail(portail.id, MODULES.map((m) => m.id));
    modulesCoquille = MODULES.filter((m) => ids.includes(m.id));
    apisCoquille = new Map([...apis].filter(([id]) => ids.includes(id))); // les autres modules restent montés et démarrés (Devis lit les affaires par le CRM), mais n'offrent ni « + » ni recherche
    definirPrefixe(portail.id);
    arretLiens = suivreLiensDuPrefixe();
    options = { accueil: accueilPortail, menu: PORTAILS[portail.id].menu, supplements: PORTAILS[portail.id].supplements, retour: { libelle: PORTAILS[portail.id].libelleRetour, href: '#/' + accueilPortail }, actionsRetour: (PORTAILS[portail.id].actions ?? []).map((x) => ({ ...x, surClic: () => import('./modules/devis/export.js').then((m) => m.exporterDevis()) })) }; // href hors portail : l'espace complet
  }
  const coquille = monterCoquille(racine, compte, {
    ...options,
    apis: apisCoquille,
    modules: modulesCoquille,
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
  arretLiens?.();
  arretLiens = null;
  if (portail) definirPrefixe('');
  session.vue?.quitter?.();
  session.coquille?.arreter?.();
  for (const api of session.apis.values()) api.arreter();
  arreterSocle();
  arreterObjectifs();
  import('./modules/crm/activites.js').then((m) => m.oublierFiltresHistorique()).catch(() => {}); // chargement à la demande : pas de dépendance circulaire
  import('./modules/crm/journal.js').then((m) => m.oublierFiltresJournal()).catch(() => {});
  import('./modules/veille/ecran.js').then((m) => m.oublierFiltresVeille()).catch(() => {});
  import('./modules/automatisations/ecran.js').then((m) => m.oublierFiltresAutomatisations()).catch(() => {});
  session = null;
}

const lienDuPortail = (chemin) => `#/${portail.id}/${chemin}`;

function afficherRoute(route) {
  if (!session) return;
  const segs = segments(route);
  const { coquille, apis } = session;
  if (cleEntree() !== entree) return; // la clé d'entrée a changé : la page va se recharger, aucune navigation ici
  if (portail) {
    // Dans le portail : l'accueil ramène à la liste des devis (jamais crm/accueil, qui ferait sortir du portail) ; un écran hors portail montre « Page introuvable »
    // (le même bloc que chez un client) avec un lien vers l'espace complet quand le module existe.
    const dansPortail = modulesDuPortail(portail.id, MODULES.map((m) => m.id));
    const m0 = MODULES.find((x) => x.prefixe === segs[0]);
    if (!segs.length) { naviguer(accueilPortail, { remplacer: true }); return; }
    const socle = ecranSocleDeRoute(segs); // Clients (fiches Personnes et Organisations) : le socle est toujours servi, avec ou sans le module Affaires
    if (socle) {
      if (session.vue?.cle !== 'socle') { session.vue?.quitter?.(); vider(coquille.contenu); session.vue = { cle: 'socle', quitter: null }; }
      import('./os/portail-socle.js').then((m) => {
        if (!session || session.vue?.cle !== 'socle') return; // l'utilisateur est déjà ailleurs
        vider(coquille.contenu);
        session.vue.quitter?.();
        session.vue.quitter = m.monterEcranSocle(coquille.contenu, socle);
      }).catch((e) => {
        console.warn(e);
        if (session?.vue?.cle === 'socle') { vider(coquille.contenu); coquille.contenu.append(h('p', { class: 'erreur', role: 'alert' }, 'Impossible d’ouvrir cet écran pour le moment. Réessaie.')); }
      });
      coquille.activer(segs.join('/'));
      return;
    }
    if (segs[0] !== 'reglages' && !(m0 && dansPortail.includes(m0.id))) {
      session.vue?.quitter?.();
      session.vue = { cle: 'introuvable', quitter: null };
      vider(coquille.contenu);
      coquille.contenu.append(blocIntrouvablePortail({ retourHref: lienDuPortail(accueilPortail), completHref: m0 ? `#/${segs.join('/')}` : null }));
      coquille.activer('');
      return;
    }
  }
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
