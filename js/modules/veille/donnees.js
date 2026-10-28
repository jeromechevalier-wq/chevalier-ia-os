// Données du module Veille : lecture en temps réel de veille_sources, veille_contenus, veille_resumes et veille_pages (page HTML d'un résumé, lue à la demande).
// L'écran n'ÉCRIT RIEN dans Firestore : ces tables sont remplies par les workflows n8n (par la « porte ») et par la fonction `veille` du serveur
// (ajout d'un lien collé, bouton Résumer), appelée avec appeler().
// Pas de tri ni de limite côté Firestore (le tri se fait dans logique.js) : aucune requête composite, aucun index à créer.
import { collection, doc, getDoc, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';

export const etat = { sources: [], contenus: [], resumes: [], pret: false };
let desabonnements = [];
let base = '';
const abonnes = new Set();
const prets = { sources: false, contenus: false, resumes: false };

export const chemin = (nom) => cheminCollection(base, nom);

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
const verifierPret = () => { etat.pret = prets.sources && prets.contenus && prets.resumes; };

function suivre(nom, cle) {
  desabonnements.push(onSnapshot(collection(db, chemin(nom)), (snap) => {
    etat[cle] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    prets[cle] = true; verifierPret(); notifier();
  }, (e) => console.warn(`${nom} indisponible`, e.code)));
}

/** Chez Jérôme, cheminBase est '' (racine de la base 1). */
export function demarrer(_compte, cheminBase = '') {
  base = cheminBase;
  suivre('veille_sources', 'sources');
  suivre('veille_contenus', 'contenus');
  suivre('veille_resumes', 'resumes');
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  Object.assign(etat, { sources: [], contenus: [], resumes: [], pret: false });
  Object.assign(prets, { sources: false, contenus: false, resumes: false });
  base = '';
}

/** Les données du module pour l'export : { veille_sources, veille_contenus, veille_resumes, veille_pages }, lues au chemin du module (racine chez Jérôme, clients/<client> chez un client). Lecture seule. */
export async function lireToutPourExport() {
  const sortie = {};
  for (const nom of ['veille_sources', 'veille_contenus', 'veille_resumes', 'veille_pages']) {
    const snap = await getDocs(collection(db, chemin(nom)));
    sortie[nom] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
  }
  return sortie;
}

const fonctions = () => getFunctions(app, 'europe-west9');

/** Appelle la fonction `veille` du serveur ({ action: 'ajouterLien', url, lancerResume } ou { action: 'resumer', contenuId }). Lève une erreur au message lisible. */
export async function appeler(demande) {
  try {
    const r = await httpsCallable(fonctions(), 'veille')(demande);
    return r.data;
  } catch (e) {
    // Un refus « métier » du serveur porte un message écrit pour être lu tel quel ; tout le reste devient une phrase simple (jamais de détail technique).
    const code = String(e?.code ?? '');
    const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
    if (code.endsWith('failed-precondition') && message) throw new Error(message);
    if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) throw new Error('Ce compte n\'a pas accès à cette action. Se reconnecter si besoin.');
    throw new Error('Le serveur ne répond pas pour le moment. Réessayer dans un instant.');
  }
}

/** Page HTML d'un résumé (table veille_pages, lue à la demande pour ne pas alourdir la liste). `null` si elle n'existe pas. */
export async function lirePage(resumeId) {
  const d = await getDoc(doc(db, chemin('veille_pages'), resumeId));
  return d.exists() && typeof d.data().html === 'string' ? d.data().html : null;
}
