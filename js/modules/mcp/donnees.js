// Données du module « Accès MCP » : la liste des membres de l'espace et les modules actifs, en LECTURE SEULE (les règles interdisent toute écriture).
import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { modulesActifsDuClient } from '../../os/registre.js';
import { clientDuChemin } from './logique.js';

let base = '';
let compte = null;

export const compteCourant = () => compte;
export const clientCourant = () => clientDuChemin(base);

export function demarrer(compteConnecte, cheminBase) {
  compte = compteConnecte;
  base = cheminBase;
}

export function arreter() {
  compte = null;
  base = '';
}

/** Membres de l'espace : [{ id: adresse, role, nom? }]. */
export async function lireMembres() {
  const snap = await getDocs(collection(db, cheminCollection(base, 'membres')));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/** Modules actifs du client (fiche clients/<client>, lisible par les membres). */
export async function lireModulesActifs() {
  const snap = await getDoc(doc(db, base));
  return modulesActifsDuClient(snap.exists() ? snap.data() : null).actifs;
}
