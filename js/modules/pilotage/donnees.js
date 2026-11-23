// Données du module Pilotage : UN SEUL appel au serveur, la fonction `pilotageLire` (le serveur lit le réglage, interroge la base de données et rend les graphiques).
// Le navigateur ne lit ni n'écrit jamais Firestore pour ce module (table `pilotage_parametres` : serveur seulement) ; aucun écouteur, aucun cache.
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { app } from '../../os/firebase.js';
import { classerErreurAppel, lireReponse } from './logique.js';

const fonctions = () => getFunctions(app, 'europe-west9');
const appeler = (donnees) => httpsCallable(fonctions(), 'pilotageLire')(donnees);

/** Lit le tableau : { titre, tuiles, erreurs, vide }. Lève une erreur au message lisible (`nonBranche` = vrai si la fonction n'existe pas sur cet espace). */
export async function lireTableau() {
  try {
    return lireReponse((await appeler({})).data);
  } catch (e) {
    const { nonBranche, message } = classerErreurAppel(e);
    throw Object.assign(new Error(message), { nonBranche });
  }
}

/** Le réglage tel qu'il est enregistré (export : administrateur seulement, le serveur refuse les autres). Renvoie l'objet. */
export async function lireReglagesPourExport() {
  return (await appeler({ exporter: true })).data?.reglages ?? {};
}
