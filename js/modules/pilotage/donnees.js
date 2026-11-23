// Données du module Pilotage : UN SEUL appel au serveur, la fonction `pilotageLire` (le serveur lit le réglage, interroge la base de données et rend les graphiques).
// Le navigateur ne lit ni n'écrit jamais Firestore pour ce module (table `pilotage_parametres` : serveur seulement) ; aucun écouteur, aucun cache.
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { app } from '../../os/firebase.js';
import { classerErreurAppel, lireReponse } from './logique.js';

const fonctions = () => getFunctions(app, 'europe-west9');
const appeler = (donnees) => httpsCallable(fonctions(), 'pilotageLire')(donnees);

/**
 * Lit le tableau : { titre, tuiles, erreurs, onglets, onglet, filtres?, vide }. `onglet` = identifiant de l'onglet à lire (le serveur ne lit que celui-là) ; sans lui : le premier.
 * `filtres` = les choix de l'utilisateur (forme de la requête) : la clé n'est envoyée QUE s'il y en a (sinon le serveur applique les défauts et la requête reste celle d'avant les filtres).
 * Lève une erreur au message lisible (`nonBranche` = vrai si la fonction n'existe pas sur cet espace ; `filtreRefuse` = vrai si le serveur a refusé un filtre (details.raison « filtre ») ;
 * `ongletInconnu` = vrai si le serveur ne connaît pas l'onglet demandé, un filtre refusé n'en est pas un).
 */
export async function lireTableau({ onglet, filtres } = {}) {
  try {
    return lireReponse((await appeler({ ...(onglet ? { onglet } : {}), ...(filtres && Object.keys(filtres).length ? { filtres } : {}) })).data);
  } catch (e) {
    const { nonBranche, message } = classerErreurAppel(e);
    const refus = String(e?.code ?? '').endsWith('invalid-argument');
    const filtreRefuse = refus && e?.details?.raison === 'filtre';
    throw Object.assign(new Error(message), { nonBranche, filtreRefuse, ongletInconnu: Boolean(onglet) && refus && !filtreRefuse });
  }
}

/** Le réglage tel qu'il est enregistré (export : administrateur seulement, le serveur refuse les autres). Renvoie l'objet. */
export async function lireReglagesPourExport() {
  return (await appeler({ exporter: true })).data?.reglages ?? {};
}
