// Données du Journal commun (déplacées de js/modules/crm/donnees.js vers la coque le 11/11/2026, sans changer les collections ni le format).
// Une seule porte d'écriture pour tous les modules : `executer` écrit la donnée, sa ligne `crm_audit` et sa copie `crm_audit_avant` dans le MÊME lot.
// Les noms `crm_audit` et `crm_audit_avant` restent ceux d'avant (les lignes déjà écrites, le serveur MCP et les règles les connaissent).
// La coque démarre le journal (`demarrerJournal`) avant les modules, et l'arrête (`arreterJournal`) après eux. Ce fichier ne connaît aucun module :
// il ne lit que les règles pures de js/modules/crm/logique.js (construireAudit, ecrireParLots, CANAL_ECRAN), partagées avec le serveur MCP.
import {
  collection, doc, query, orderBy, limit, startAfter, getDoc, getDocs, setDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import { normaliserBase, cheminCollection } from './chemins.js';
import * as L from '../modules/crm/logique.js';

let compte = null;
let cheminBase = '';
let demarre = false;
/** Chemin complet d'une collection (préfixe de l'espace compris : '' à la racine, clients/<client> chez un client). */
const chemin = (nom) => cheminCollection(cheminBase, nom);

/** Démarre le journal pour un compte et un espace. `compte` = { email } ; `cheminBase` = '' (racine) ou clients/<client>. */
export function demarrerJournal(compteConnecte, base = '') {
  compte = compteConnecte;
  cheminBase = normaliserBase(base);
  demarre = true;
}

/** Arrête le journal (déconnexion ou changement d'espace) : plus aucune écriture possible tant qu'il n'est pas redémarré. */
export function arreterJournal() {
  compte = null;
  cheminBase = '';
  demarre = false;
}

/** Applique une écriture d'un plan à un lot. `horodater` -> heure du serveur Firebase, `signer` -> compte connecté. */
function ecrireDansLot(lot, e) {
  const ref = doc(db, chemin(e.collection), e.id);
  const marques = {};
  for (const champ of e.horodater || []) marques[champ] = serverTimestamp();
  for (const champ of e.signer || []) marques[champ] = compte?.email || '';
  if (e.type === 'creer') lot.set(ref, { ...e.donnees, ...marques });
  else if (e.type === 'modifier') lot.update(ref, { ...e.patch, ...marques });
  else lot.delete(ref);
}

/** Les documents tels qu'ils sont AVANT une modification ou une suppression (pour la copie de l'audit). */
async function lireAvants(ecritures) {
  const concernees = ecritures.filter((e) => e.type !== 'creer');
  const lus = await Promise.all(concernees.map((e) => getDoc(doc(db, chemin(e.collection), e.id))));
  return Object.fromEntries(concernees.map((e, i) => [`${e.collection}/${e.id}`, lus[i].exists() ? lus[i].data() : null]));
}

// Trois écritures par action élémentaire (la donnée, sa ligne d'audit, sa copie) : 130 actions par lot, la limite de Firestore est 500.
export const ACTIONS_PAR_LOT = 130;

/**
 * Exécute les écritures d'un plan. Chaque écriture laisse sa trace dans crm_audit (et sa copie dans crm_audit_avant) DANS LE MÊME LOT
 * que la donnée : jamais de modification sans trace, jamais de trace sans modification (un lot est atomique). `outil` nomme l'action.
 */
export async function executer(ecritures, outil = 'ecran') {
  if (!ecritures.length) return;
  if (!demarre) throw new Error('Le journal n’est pas démarré.');
  const avants = await lireAvants(ecritures);
  const operationId = doc(collection(db, chemin('crm_audit'))).id;
  const audit = L.construireAudit(ecritures, avants, {
    acteur: compte?.email || '', outil, operationId, maintenant: new Date(),
    horodatage: serverTimestamp(), nouvelId: (nom) => doc(collection(db, chemin(nom))).id,
  });
  await L.ecrireParLots(ecritures.length, ACTIONS_PAR_LOT, async (debut, fin) => {
    const lot = writeBatch(db);
    for (let k = debut; k < fin; k++) {
      ecrireDansLot(lot, ecritures[k]);
      audit[k].forEach((a) => ecrireDansLot(lot, a));
    }
    await lot.commit();
  }, async (faites) => {
    // Des lots précédents sont déjà écrits : l'opération est à moitié faite. Le Journal le dit (ligne « echec »).
    await setDoc(doc(collection(db, chemin('crm_audit'))), {
      operationId, ordre: ecritures.length + 1, acteur: compte?.email || '', jeton: L.CANAL_ECRAN, via: L.CANAL_ECRAN, outil,
      collection: 'crm_audit', docId: operationId, action: 'echec', statut: 'echec', champsModifies: [], parametresRecus: [], date: serverTimestamp(),
      erreur: `Opération arrêtée en cours de route : ${faites} éléments sur ${ecritures.length} ont été traités. Recommence-la pour la terminer.`,
    });
  });
}

// ---------------------------------------------------------------- journal (lecture seule)

/** Les `taille` lignes du journal les plus récentes (après le curseur `apres` pour la page suivante) : { lignes, curseur, fini }. */
export async function lireJournal({ taille = 200, apres = null } = {}) {
  const contraintes = [orderBy('date', 'desc'), ...(apres ? [startAfter(apres)] : []), limit(taille)];
  const snap = await getDocs(query(collection(db, chemin('crm_audit')), ...contraintes));
  return {
    lignes: snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id })),
    curseur: snap.docs.at(-1) ?? null,
    fini: snap.docs.length < taille,
  };
}

/** Copie « avant / après » d'une ligne du journal (même identifiant que la ligne) : { avant, apres } ou null si elle manque. */
export async function lireCopieJournal(idLigne) {
  const d = await getDoc(doc(db, chemin('crm_audit_avant'), idLigne));
  if (!d.exists()) return null;
  const { avant = null, apres = null } = d.data({ serverTimestamps: 'estimate' });
  return { avant, apres };
}
