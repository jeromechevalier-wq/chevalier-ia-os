// Page d'un client de la plateforme : #/espace/<client> (chantier 5). Lit la fiche de marque (publique), applique couleurs, logo,
// images et texte d'accueil, puis propose la connexion Google. L'appartenance au client est vérifiée par surveillerCompte(…, { client }).
// Rien ici ne protège les données : la vraie protection est dans les règles Firestore (firestore.plateforme.rules).
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import { surveillerCompte, connecter, deconnecter } from './auth.js';
import { routeCourante } from './router.js';
import { modulesActifsDuClient } from './registre.js';
import { ouvrirEspaceModules } from './espace-modules.js';
import { appliquerIdentite } from './identite.js';
import { h, icone, remplir } from './ui.js';
import { routeDansEspace, normaliserMarque, styleMarque, MARQUE_NEUTRE, MESSAGE_REFUS_ESPACE } from './marque.js';

/**
 * Fiche de marque d'un client : { marque } si elle existe et est active, { marque: null } si le client est inconnu ou inactif
 * (les règles refusent la lecture dans les deux cas : on ne peut pas les distinguer), { erreur: true } si le réseau a échoué.
 */
export async function lireMarque(client) {
  try {
    const fiche = await getDoc(doc(db, 'marques', client));
    return { marque: fiche.exists() ? normaliserMarque(fiche.data()) : null };
  } catch (e) {
    if (e?.code === 'permission-denied' || e?.code === 'not-found') return { marque: null };
    return { erreur: true };
  }
}

function coquilleEspace(marque, ...enfants) {
  document.body.classList.add('page-espace');
  document.title = marque === MARQUE_NEUTRE ? 'Espace client' : marque.nom; // appliquerIdentite() fait le reste (icône, appli installée, accent)
  const hero = marque.images[0];
  return h('div', { class: 'espace', style: styleMarque(marque) },
    hero ? h('img', { class: 'espace-fond', src: hero.url, alt: hero.alt, width: '1600', height: '900', fetchpriority: 'high' }) : null,
    hero ? h('div', { class: 'espace-voile' }) : null,
    h('main', { class: 'espace-centre', id: 'contenu', tabindex: '-1' }, ...enfants));
}

/** Page neutre : client inconnu, fiche inactive, adresse mal formée. Ne dit rien de plus (aucune indication sur les autres clients). */
function pageIndisponible(racine, { reessayer = null } = {}) {
  remplir(racine, coquilleEspace(MARQUE_NEUTRE,
    h('h1', {}, reessayer ? 'Chargement impossible' : 'Espace indisponible'),
    h('p', { class: 'espace-accueil' }, reessayer
      ? 'La connexion au serveur a échoué. Vérifie ta connexion internet puis réessaie.'
      : "Cet espace n'est pas disponible. Vérifie l'adresse reçue, ou contacte la personne qui te l'a envoyée."),
    reessayer ? h('button', { type: 'button', class: 'bouton espace-bouton', onclick: reessayer }, 'Réessayer') : null));
}

function pageConnexion(racine, marque, { message = '', surConnexion }) {
  const bouton = h('button', { type: 'button', class: 'bouton espace-bouton', onclick: async () => {
    bouton.disabled = true;
    try { await surConnexion(); } finally { bouton.disabled = false; }
  } }, icone('log-in', { taille: 18 }), 'Se connecter avec Google');
  const galerie = marque.images.slice(1);
  remplir(racine, coquilleEspace(marque,
    marque.logo ? h('img', { class: 'espace-logo', src: marque.logo, alt: '', width: '160', height: '80' }) : null,
    h('h1', {}, marque.nom),
    marque.accueil ? h('p', { class: 'espace-accueil' }, marque.accueil) : null,
    message ? h('p', { class: 'message-refus', role: 'alert' }, icone('triangle-alert', { taille: 16 }), message) : null,
    bouton,
    h('p', { class: 'espace-pied' }, 'Accès réservé aux membres de cet espace.'),
    galerie.length ? h('div', { class: 'espace-galerie' }, galerie.map((i) => h('img', { src: i.url, alt: i.alt, loading: 'lazy', width: '400', height: '300' }))) : null));
}

/**
 * Modules actifs du client (chantier 7) : champ `modules` du document clients/<client>, lisible par ses membres.
 * { fiche } (fiche vide ou absente = aucun module) ; permission refusée = même chose (règles pas encore à jour : accueil provisoire) ;
 * { erreur: true } si le réseau a échoué.
 */
export async function lireFicheClient(client) {
  try {
    const fiche = await getDoc(doc(db, 'clients', client));
    return { fiche: fiche.exists() ? fiche.data() : null };
  } catch (e) {
    if (e?.code === 'permission-denied' || e?.code === 'not-found') return { fiche: null };
    return { erreur: true };
  }
}

/** Accueil provisoire : le client n'a (encore) aucun module actif. Les écrans arrivent quand Jérôme active des modules pour lui. */
function pageAccueil(racine, marque, compte) {
  remplir(racine, coquilleEspace(marque,
    marque.logo ? h('img', { class: 'espace-logo', src: marque.logo, alt: '', width: '160', height: '80' }) : null,
    h('h1', {}, marque.nom),
    h('p', { class: 'espace-accueil' }, `Bonjour ${compte.nom}, tu es connecté·e.`),
    h('p', { class: 'espace-accueil' }, "Aucun écran n'est encore activé dans cet espace."),
    h('p', { class: 'espace-pied' }, `${compte.email} · ${compte.role === 'editeur' ? 'éditeur' : 'lecteur'}`),
    h('button', { type: 'button', class: 'bouton espace-bouton', onclick: () => deconnecter() }, icone('log-out', { taille: 18 }), 'Se déconnecter')));
}

/** Point d'entrée : appelé par main.js quand la route est #/espace/…. */
export async function demarrerEspace(racine) {
  const client = routeDansEspace(routeCourante())?.client;
  appliquerIdentite(MARQUE_NEUTRE); // dès le départ : plus rien de l'identité de Jérôme (titre, icône, appli installée)
  if (!client) { pageIndisponible(racine); return; }
  remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement')));
  const lu = await lireMarque(client);
  if (lu.erreur) { pageIndisponible(racine, { reessayer: () => demarrerEspace(racine) }); return; }
  if (!lu.marque) { pageIndisponible(racine); return; }
  const marque = lu.marque;
  appliquerIdentite(marque, client);
  let fermer = null; // arrête les modules montés (déconnexion, changement de compte)
  let emailOuvert = null;
  const ouvrir = async (compte) => {
    emailOuvert = compte.email;
    remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement')));
    const lu = await lireFicheClient(client);
    if (emailOuvert !== compte.email) return; // déconnecté pendant la lecture
    if (lu.erreur) { pageIndisponible(racine, { reessayer: () => ouvrir(compte) }); return; }
    const { actifs, erreurs } = modulesActifsDuClient(lu.fiche);
    for (const e of erreurs) console.warn('Modules du client :', e);
    if (!actifs.length) { pageAccueil(racine, marque, compte); return; }
    const f = await ouvrirEspaceModules(racine, { client, marque, compte, actifs, equipe: lu.fiche?.equipe ?? null, fiche: lu.fiche, surDeconnexion: () => deconnecter() });
    if (emailOuvert === compte.email) fermer = f; else f();
  };
  surveillerCompte((ev) => {
    if (ev.etat === 'connecte') {
      if (emailOuvert === ev.compte.email) return;
      fermer?.(); fermer = null;
      ouvrir(ev.compte);
    } else {
      fermer?.(); fermer = null; emailOuvert = null;
      import('../modules/crm/activites.js').then((m) => m.oublierFiltresHistorique()).catch(() => {}); // le filtre de l'historique ne passe pas d'un compte à l'autre
      import('../modules/crm/journal.js').then((m) => m.oublierFiltresJournal()).catch(() => {});
      import('../modules/veille/ecran.js').then((m) => m.oublierFiltresVeille()).catch(() => {});
      import('../modules/automatisations/ecran.js').then((m) => m.oublierFiltresAutomatisations()).catch(() => {});
      document.body.classList.add('page-espace');
      if (ev.etat === 'deconnecte') pageConnexion(racine, marque, { message: ev.refus ? MESSAGE_REFUS_ESPACE : '', surConnexion: seConnecter });
      else if (ev.etat === 'erreur') pageConnexion(racine, marque, { message: ev.message, surConnexion: seConnecter });
    }
  }, { client });
}

async function seConnecter() {
  try { await connecter(); } catch (e) { console.warn('Connexion impossible', e?.code); }
}
