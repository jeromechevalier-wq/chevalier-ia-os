// Données du module Réseaux sociaux. Ce que le module écoute lui-même (il marche même quand le module Affaires est éteint, où le CRM ne charge ni les activités ni les étiquettes) :
//  - reseauxsociaux_posts et reseauxsociaux_imports (les deux tables du module) ;
//  - les activités LinkedIn et les rendez-vous du CRM (UNE condition par requête, tri dans le navigateur) ;
//  - le document des étiquettes du CRM (lecture seule, sauf `creerCategories`, au clic).
// Les posts viennent de Buffer, lus par la fonction `reseauxsociauxBuffer` du serveur (lecture seule) et gardés cinq minutes en mémoire.
// Toute écriture passe par `executer` (le journal commun) ; jamais de setDoc direct. Aucun orderBy, aucun limit : le tri se fait dans le navigateur (règle D4).
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { estChezClient } from '../../os/contexte.js';
import { executer } from '../../os/journal-donnees.js';
import * as L from '../crm/logique.js';
import * as R from './logique.js';

const vierge = () => ({
  posts: [], imports: [], activitesLinkedin: [], rendezVous: [],
  etiquettes: [], etiquettesDisponibles: null, // null = pas encore lues ; false = illisibles ou absentes ; true = lues
  pret: false,
  buffer: { posts: [], lueLe: null, canal: null, erreur: null, chargement: false },
});
export const etat = vierge();

let desabonnements = [];
let base = '';
const abonnes = new Set();
const prets = { posts: false, imports: false, activitesLinkedin: false, rendezVous: false };

export const chemin = (nom) => cheminCollection(base, nom);

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
const verifierPret = () => { etat.pret = Object.values(prets).every(Boolean); };

function suivre(nom, cle, requete = null) {
  desabonnements.push(onSnapshot(requete ?? collection(db, chemin(nom)), (snap) => {
    etat[cle] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    prets[cle] = true; verifierPret(); notifier();
  }, (e) => {
    // Table illisible : l'écran affiche « vide », pas une erreur technique (la table n'existe qu'à la première écriture).
    console.warn(`${nom} indisponible`, e.code);
    prets[cle] = true; verifierPret(); notifier();
  }));
}

/** Lit le document des étiquettes du CRM (lecture seule). Faux = absent ou illisible : les catégories ne sont pas disponibles. */
export async function chargerEtiquettes() {
  const lecteur = base;
  try {
    const d = await getDoc(doc(db, cheminCollection(lecteur, 'crm_parametres'), 'etiquettes'));
    if (lecteur !== base) return; // l'espace a changé pendant la lecture
    etat.etiquettes = d.exists() && Array.isArray(d.data().items) ? [...d.data().items].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)) : [];
    etat.etiquettesDisponibles = d.exists();
  } catch (e) {
    console.warn('étiquettes indisponibles', e?.code);
    if (lecteur !== base) return;
    etat.etiquettes = [];
    etat.etiquettesDisponibles = false;
  }
  notifier();
}

/** Chez Jérôme, cheminBase est '' (racine de la base 1) ; chez un client, clients/<client>. */
export function demarrer(_compte, cheminBase = '') {
  base = cheminBase;
  suivre(R.COLLECTION_POSTS, 'posts');
  suivre(R.COLLECTION_IMPORTS, 'imports');
  suivre('crm_activites', 'activitesLinkedin', query(collection(db, chemin('crm_activites')), where('type', '==', 'linkedin')));
  suivre('crm_activites', 'rendezVous', query(collection(db, chemin('crm_activites')), where('type', '==', 'rendez_vous')));
  chargerEtiquettes();
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  Object.assign(etat, vierge());
  Object.assign(prets, { posts: false, imports: false, activitesLinkedin: false, rendezVous: false });
  derniereLecture = 0;
  enCours = null;
  base = '';
}

/** Les activités qui comptent pour la suite des échanges (LinkedIn et rendez-vous), toutes personnes confondues. */
export const activitesDesRelations = () => [...etat.activitesLinkedin, ...etat.rendezVous];

/** Les données du module pour l'export : { reseauxsociaux_posts, reseauxsociaux_imports }, lues au chemin du module. Lecture seule. */
export async function lireToutPourExport() {
  const sortie = {};
  for (const nom of R.COLLECTIONS) {
    const snap = await getDocs(collection(db, chemin(nom)));
    sortie[nom] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
  }
  return sortie;
}

// ---------------------------------------------------------------- catégories des contacts

/**
 * Crée dans le CRM les catégories manquantes (étiquettes) : à n'appeler qu'au clic de Jérôme, jamais par une migration.
 * Le document des étiquettes est relu FRAIS, puis écrit en UN SEUL `executer` (journal) avec les étiquettes existantes inchangées + les manquantes.
 * (Ce n'est pas `creerEtiquette` du CRM : il réécrit tout le tableau depuis son état en mémoire, vide quand Affaires est éteint, et effacerait les étiquettes existantes.)
 * Document absent ou illisible : refus, rien d'écrit. Renvoie { creees: [noms], existantes: [noms] }.
 */
export async function creerCategories(noms = R.CATEGORIES.map((c) => c.nom)) {
  let d;
  try { d = await getDoc(doc(db, chemin('crm_parametres'), 'etiquettes')); } catch (e) { console.warn(e); throw new Error('Les catégories ne sont pas disponibles pour le moment.'); }
  if (!d.exists() || !Array.isArray(d.data().items)) throw new Error('Ouvre une fois Affaires pour préparer les catégories.');
  const { items, creees } = R.categoriesManquantes(d.data().items, noms);
  if (creees.length) await executer([L.ecritureModifier('crm_parametres', 'etiquettes', { items })]);
  await chargerEtiquettes();
  return { creees: creees.map((c) => c.nom), existantes: noms.filter((n) => !creees.some((c) => c.nom === n)) };
}

// ---------------------------------------------------------------- lecture de Buffer (fonction du serveur, lecture seule)

const fonctions = () => getFunctions(app, 'europe-west9');

/** Appelle la fonction `reseauxsociauxBuffer` ({ action: 'lirePosts', limite? }). Lève une erreur au message lisible (voir R.messageErreurBuffer). */
export async function appeler(demande) {
  try {
    const r = await httpsCallable(fonctions(), 'reseauxsociauxBuffer')(demande);
    return r.data;
  } catch (e) {
    throw new Error(R.messageErreurBuffer(e, estChezClient()));
  }
}

let derniereLecture = 0;
let enCours = null;

/**
 * Charge les posts de Buffer. Une lecture réussie est gardée cinq minutes : un second appel rapproché ne rappelle pas le serveur (sauf `force: true`).
 * Deux appels en même temps partagent la même lecture. Une erreur n'est pas gardée en mémoire (le prochain appel réessaie). Renvoie `etat.buffer`.
 */
export async function chargerBuffer({ force = false, maintenant = Date.now } = {}) {
  if (enCours) return enCours;
  if (!force && etat.buffer.lueLe && !etat.buffer.erreur && maintenant() - derniereLecture < R.DUREE_CACHE_BUFFER_MS) return etat.buffer;
  const lecteur = base;
  etat.buffer.chargement = true; etat.buffer.erreur = null; notifier();
  enCours = (async () => {
    try {
      const r = await appeler({ action: 'lirePosts' });
      if (lecteur !== base) return etat.buffer; // l'espace a changé pendant la lecture : on jette le résultat
      etat.buffer.posts = Array.isArray(r?.posts) ? r.posts : [];
      etat.buffer.lueLe = r?.lueLe ?? null;
      etat.buffer.canal = r?.canal ?? null;
      derniereLecture = maintenant();
    } catch (e) {
      if (lecteur === base) { etat.buffer.erreur = e?.message || R.MESSAGE_BUFFER_ABSENT; etat.buffer.lueLe = null; }
    } finally {
      enCours = null;
      if (lecteur === base) { etat.buffer.chargement = false; notifier(); }
    }
    return etat.buffer;
  })();
  return enCours;
}
