// Données du module Veille : lecture en temps réel de veille_sources, veille_contenus et veille_resumes.
// L'écran n'ÉCRIT RIEN dans Firestore : ces tables sont remplies par les workflows n8n (par la « porte » de l'étape 2).
// Pas de tri ni de limite côté Firestore (le tri se fait dans logique.js) : aucune requête composite, aucun index à créer.
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
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
