// Démarrage de Chevalier IA OS.
import { demarrerPwa } from './os/pwa.js';
import { appliquerTheme, afficherConnexion, monterCoquille, ESPACE_RACINE, espaceRacineAffiche, nommerOngletMaison } from './os/shell.js';
import { surveillerCompte, connecter, deconnecter, preparerCrm, MESSAGE_REFUS } from './os/auth.js';
import { MESSAGE_PUBLIC_ABSENT, MESSAGE_PANNE_REGLAGES, configurationNeutre, modulesEcranBrut, besoinsEcranBrut } from './os/comptes-maison.js';
import { modulesDeLaMaison } from './os/maison-modules.js';
import { lireBesoinsMaison, ROUTE_VILLAGE, routeDuBesoin } from './os/maison-village.js';
import { monterVillage } from './os/village-ecran.js';
import { besoinsServis } from './os/village-damier.js';
import { creerDonneesVillage } from './os/village-donnees.js';
import { creerPetitesVillage } from './os/village-petites-lecture.js';
import { activerOr, lireOr, surOr, orConnu, acheterOr, parcellesConnues, ramasserOr } from './os/village-or.js';
import { routeCourante, routeDepuisHash, segments, surChangementRoute, naviguer, definirPrefixe, suivreLiensDuPrefixe, lien, ROUTE_DEFAUT } from './os/router.js';
import { estRouteEspace } from './os/marque.js';
import { blocIntrouvablePortail } from './os/portail-introuvable.js';
import { actionsDuPortail } from './os/portail-actions.js';
import { PORTAILS, portailDeRoute, modulesDuPortail, cleEntreeDe, ecranSocleDeRoute } from './os/portail.js';
import { MODULES as MODULES_TOUS } from './os/modules.js';
import { peutVoirConsole } from './modules/console/acces.js';
import { pagesTechniquesCachees } from './os/acces-reserve.js';
import { demarrerObjectifs, arreterObjectifs } from './os/objectifs.js';
import { monterReglages } from './os/reglages.js';
import { rendreJournal } from './os/journal.js';
import { demarrerJournal, arreterJournal } from './os/journal-donnees.js';
import { demarrer as demarrerSocle, arreter as arreterSocle } from './modules/crm/donnees.js';
import { objectifsDepart as objectifsNeutres, CONFIG_NEUTRE } from './modules/crm/logique.js';
import { h, icone, lirePreference, vider, remplir, toast } from './os/ui.js';

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

async function demarrerCrm() {
  afficherChargement();
  // Plateforme clients : pas de CRM de Jérôme ici (reglages_maison/public illisible). Une adresse sans route d'espace (signet, onglet restauré) n'écoute pas
  // la connexion et ne déconnecte jamais personne (la connexion est partagée entre les onglets, dont l'espace d'un client).
  // Chantier 0 (26/11/2026) : le document « public » dit si le CRM existe ; absent = message clair (jamais la page de la plateforme) ; panne = « Recharger ».
  const depart = await preparerCrm();
  if (depart.etat === 'plateforme') { import('./os/espace.js').then((m) => m.pageSansEspace(racine)); return; }
  if (depart.etat !== 'crm') { afficherPanne(depart.etat === 'absent' ? MESSAGE_PUBLIC_ABSENT : MESSAGE_PANNE_REGLAGES); return; }
  surveillerCompte(async (ev) => {
    if (ev.etat === 'connecte') {
      if (session?.compte.email === ev.compte.email) return;
      await ouvrirSession(ev.compte);
    } else if (ev.etat === 'deconnecte') {
      fermerSession();
      afficherConnexion(racine, { message: ev.refus ? MESSAGE_REFUS : '', surConnexion: lancerConnexion });
    } else if (ev.etat === 'erreur') {
      if (ev.recharger && !session) { afficherPanne(ev.message); return; } // lecture de reglages_maison/ecran impossible : le compte reste connecté, on propose de recharger
      toast(ev.message, { type: 'erreur' });
    }
  });
}

/** Message de panne au démarrage (avant toute session), avec « Recharger » : jamais de déconnexion. */
function afficherPanne(message) {
  remplir(racine, h('div', { class: 'chargement-panne', role: 'alert', dataset: { role: 'panne-demarrage' } },
    h('p', {}, message),
    h('button', { type: 'button', class: 'bouton', onclick: () => location.reload() }, 'Recharger')));
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

// Modules de la session : la Console (`seulJerome`) n'existe que pour le compte de Jérôme (le serveur recontrôle l'identité à chaque appel).
// Réglage `modules` de reglages_maison/ecran (27/11/2026, js/os/maison-modules.js) : absent = comme avant (tout ; Console et Achats pour le titulaire seul) ;
// présent = seuls les modules listés, pour tous les comptes de la maison, et la Console en plus pour le titulaire seul. `accueilMaison` : null sans réglage.
let MODULES = MODULES_TOUS;
let accueilMaison = null;
// Accueil « village » (26/11/2026, js/os/maison-village.js) : champ facultatif `besoins` de reglages_maison/ecran ; liste vide = accueil d'avant (jamais dans le portail devis).
let besoinsVillage = [];
// Or du village (27/11/2026, js/os/village-or.js) : branché seulement quand le village est allumé ; sans lui, une bonne nouvelle annoncée par un module ne fait rien.
let arretOr = null;

async function ouvrirSession(compte) {
  fermerSession();
  const choix = modulesDeLaMaison(MODULES_TOUS, { titulaire: peutVoirConsole(compte), brut: modulesEcranBrut() });
  for (const a of choix.avertissements) console.warn(a);
  MODULES = choix.modules;
  const village = portail ? { besoins: [], avertissements: [] } : lireBesoinsMaison(besoinsEcranBrut());
  for (const a of village.avertissements) console.warn(a);
  besoinsVillage = village.besoins;
  besoinsVillage = besoinsServis(village.besoins, [...MODULES.map((m) => m.prefixe), 'reglages']); // étape 2 (27/11/2026) : un besoin dont le module n'est pas allumé pour ce compte n'a jamais de maison
  accueilMaison = besoinsVillage.length ? ROUTE_VILLAGE : choix.accueil; // logo, « Retour à l'accueil » et adresse vide : le village
  afficherChargement();
  const apis = new Map();
  for (const m of MODULES) {
    const api = await m.monter();
    apis.set(m.id, api);
  }
  // Maison d'un client (reglages_maison/ecran.configuration_crm === 'neutre') : les objectifs neutres d'un nouvel espace, jamais ceux de Jérôme (« Flyers »…).
  const objectifsDepart = configurationNeutre() ? objectifsNeutres(CONFIG_NEUTRE) : [...apis.values()].flatMap((api) => api.objectifsDepart || []);
  demarrerObjectifs(compte, objectifsDepart);
  demarrerJournal(compte, ''); // le journal commun démarre avant le socle et les modules : tout ce qui écrit passe par lui
  demarrerSocle(compte, '', { noyau: true }); // socle commun, racine ; le module Affaires démarre par-dessus en complet (cinq écouteurs, aucun doublon)
  for (const api of apis.values()) api.demarrer({ compte, cheminBase: '' }); // '' = racine (CRM de Jérôme) ; chez un client : cheminBaseClient(client)
  let modulesCoquille = MODULES;
  let apisCoquille = apis;
  let options = accueilMaison ? { accueil: accueilMaison } : {}; // logo et « Retour à l'accueil » : le premier écran du réglage (jamais crm/accueil d'un CRM éteint)
  if (portail) {
    const ids = modulesDuPortail(portail.id, MODULES.map((m) => m.id));
    modulesCoquille = MODULES.filter((m) => ids.includes(m.id));
    apisCoquille = new Map([...apis].filter(([id]) => ids.includes(id))); // les autres modules restent montés et démarrés (Devis lit les affaires par le CRM), mais n'offrent ni « + » ni recherche
    definirPrefixe(portail.id);
    arretLiens = suivreLiensDuPrefixe();
    options = { accueil: accueilPortail, menu: PORTAILS[portail.id].menu, supplements: PORTAILS[portail.id].supplements, retour: { libelle: PORTAILS[portail.id].libelleRetour, href: '#/' + accueilPortail }, actionsRetour: actionsDuPortail(PORTAILS[portail.id]) }; // href hors portail : l'espace complet
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
  if (besoinsVillage.length) arretOr = activerOr({ base: '', uid: compte.uid });
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
  arreterJournal();
  arreterObjectifs();
  import('./modules/crm/activites.js').then((m) => m.oublierFiltresHistorique()).catch(() => {}); // chargement à la demande : pas de dépendance circulaire
  import('./os/journal.js').then((m) => m.oublierFiltresJournal()).catch(() => {});
  import('./modules/veille/ecran.js').then((m) => m.oublierFiltresVeille()).catch(() => {});
  import('./modules/pilotage/ecran.js').then((m) => m.oublierFiltresPilotage()).catch(() => {});
  import('./modules/reseauxsociaux/index.js').then((m) => m.oublierFiltres()).catch(() => {});
  import('./modules/rdv/index.js').then((m) => m.oublierFiltres()).catch(() => {});
  import('./modules/automatisations/ecran.js').then((m) => m.oublierFiltresAutomatisations()).catch(() => {});
  session = null;
  besoinsVillage = [];
  arretOr?.();
  arretOr = null;
}

/** « Page introuvable » (maison : module éteint, ou page technique cachée à un compte non titulaire), avec « Retour à l'accueil » vers `accueil`. */
function afficherIntrouvable(accueil) {
  const { coquille } = session;
  session.vue?.quitter?.();
  session.vue = { cle: 'introuvable', quitter: null };
  vider(coquille.contenu);
  coquille.contenu.append(h('div', { class: 'page-introuvable', dataset: { role: 'page-introuvable' } },
    h('h1', {}, 'Page introuvable'),
    h('p', { class: 'aide' }, "Cette page n'existe pas ou n'est pas disponible dans cet espace."),
    h('a', { class: 'bouton bouton-principal', href: lien(accueil) }, icone('house', { taille: 16 }), "Retour à l'accueil")));
  coquille.activer('');
}

/** Route du Journal des modifications : #/journal (écran de la coque) ou #/crm/journal (ancienne adresse, servie par le module Affaires). */
const estRouteJournal = (segs) => (segs[0] === 'journal' && segs.length === 1) || (segs[0] === 'crm' && segs[1] === 'journal');

const lienDuPortail = (chemin) => `#/${portail.id}/${chemin}`;
/** L'adresse n'a aucune route (#, #/ ou rien) : le router la lit comme ROUTE_DEFAUT (crm/accueil). */
const adresseVide = () => !String(location.hash ?? '').replace(/^#\/?/, '').replace(/\/+$/, '');

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
    if (segs[0] !== 'reglages' && !(segs[0] === 'journal' && segs.length === 1) && !(m0 && dansPortail.includes(m0.id))) {
      session.vue?.quitter?.();
      session.vue = { cle: 'introuvable', quitter: null };
      vider(coquille.contenu);
      coquille.contenu.append(blocIntrouvablePortail({ retourHref: lienDuPortail(accueilPortail), completHref: m0 ? `#/${segs.join('/')}` : null }));
      coquille.activer('');
      return;
    }
  }
  // Maison d'un client, compte non titulaire : le Journal (#/journal et l'ancienne adresse #/crm/journal du module Affaires) est une page technique cachée.
  // La plateforme des clients a son propre routeur (js/os/espace-modules.js) : #/espace/<client>/crm/journal y reste servi.
  if (estRouteJournal(segs) && pagesTechniquesCachees(session.compte)) { afficherIntrouvable(accueilMaison || ROUTE_DEFAUT); return; }
  if (besoinsVillage.length && adresseVide()) { naviguer(ROUTE_VILLAGE, { remplacer: true }); return; } // maison avec `besoins` : l'adresse vide ouvre le village
  let cle;
  let afficher;
  if (besoinsVillage.length && segs.length === 1 && segs[0] === ROUTE_VILLAGE) { // accueil village : le dessin seul (ni journal, ni carrés)
    cle = 'village';
    afficher = () => { session.vue.quitter?.(); vider(coquille.contenu); return monterVillage(coquille.contenu, besoinsVillage, { aller: (cible) => naviguer(routeDuBesoin(cible)), console: MODULES.some((m) => m.id === 'console'), donnees: creerDonneesVillage({ base: '', uid: session.compte.uid }), or: { lire: lireOr, suivre: surOr, connu: orConnu, acheter: acheterOr, parcelles: parcellesConnues, ramasser: ramasserOr }, petites: creerPetitesVillage({ modules: MODULES.map((m) => m.prefixe) }) }); };
  } else if (segs[0] === 'reglages') {
    cle = 'reglages';
    afficher = () => monterReglages(coquille.contenu, segs, {
      apis, actifs: MODULES.map((m) => m.id), chezClient: false, nomEspace: 'Chevalier IA OS', marque: null, fiche: null, compte: session.compte,
      retourVillage: besoinsVillage.length ? ROUTE_VILLAGE : null, // maison avec village : « Retour au village » en haut des Réglages (la Mairie y mène)
      surMarque: () => { coquille.majClient(espaceRacineAffiche()); nommerOngletMaison(); }, // Mon espace d'une maison : le nom et le logo enregistrés s'affichent tout de suite (menu, barre du haut, onglet)
    });
  } else if (segs[0] === 'journal' && segs.length === 1) { // Journal des modifications : écran de la coque, servi même sans le module Affaires
    cle = 'journal';
    afficher = () => rendreJournal(coquille.contenu);
  } else {
    const m = MODULES.find((x) => x.prefixe === segs[0]);
    if (!m && accueilMaison) { // maison avec réglage `modules` : adresse vide = premier écran ; module éteint ou inconnu = « Page introuvable » (comme sur la plateforme)
      if (adresseVide()) { naviguer(accueilMaison, { remplacer: true }); return; }
      afficherIntrouvable(accueilMaison);
      return;
    }
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
