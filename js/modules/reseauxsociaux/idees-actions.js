// Écritures du volet « Idées et inspirations » : seul point d'écriture des écrans Idées et Inspirations.
// Tout passe par `executer` (le journal commun : la donnée, sa ligne d'audit et sa copie « avant » dans le même lot), jamais de setDoc direct.
// Chaque document existant est relu FRAIS avant d'écrire (un second enregistrement rapproché, avant que l'écoute en direct n'ait rendu le premier, ne réécrit pas `creeLe`).
// Aucune écriture dans Buffer ici : la poussée d'une idée dans Buffer viendra plus tard, dans le fichier qui parle déjà à Buffer (donnees.js).
import { collection, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { executer } from '../../os/journal-donnees.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
import * as N from './inspirations-logique.js';

const nouvelId = (nom) => doc(collection(db, D.chemin(nom))).id;

async function lire(nom, id) {
  if (!id) return null;
  const lu = await getDoc(doc(db, D.chemin(nom), id));
  return lu.exists() ? { id, ...lu.data() } : null;
}

/** Crée (`id` nul) ou modifie une idée. Renvoie l'identifiant. Lève l'erreur de validation (message lisible) ou celle de l'écriture. */
export async function enregistrerIdee(id, valeurs) {
  const existante = await lire(R.COLLECTION_IDEES, id);
  if (id && !existante) throw new I.ErreurClaire('Cette idée n’existe plus.');
  const idDoc = id || nouvelId(R.COLLECTION_IDEES);
  await executer(I.planEnregistrerIdee(existante, valeurs, { id: idDoc }).ecritures);
  return idDoc;
}

/** Change l'état d'une idée. Passer à « dans_buffer » efface son texte (passage de témoin). `options.lien` = { reseau, outil, id } si on le connaît. */
export async function changerEtatIdee(id, etat, options = {}) {
  const existante = await lire(R.COLLECTION_IDEES, id);
  await executer(I.planChangerEtatIdee(existante, etat, { id }, options).ecritures);
}

/** Crée (`id` nul) ou modifie un profil d'inspiration (un nouveau profil se met en fin de liste). Renvoie l'identifiant. */
export async function enregistrerInspiration(id, valeurs) {
  const existant = await lire(R.COLLECTION_INSPIRATIONS, id);
  if (id && !existant) throw new I.ErreurClaire('Ce profil n’existe plus.');
  const idDoc = id || nouvelId(R.COLLECTION_INSPIRATIONS);
  await executer(N.planEnregistrerInspiration(existant, valeurs, { id: idDoc, autres: D.etat.inspirations }).ecritures);
  return idDoc;
}

/** Monte (-1) ou descend (+1) un profil d'une place. */
export async function deplacerInspiration(id, sens) {
  await executer(N.planDeplacerInspiration(D.etat.inspirations, id, sens).ecritures);
}

/** Crée (`id` nul) ou modifie un exemple de post (lien et analyse, jamais le texte du post). Renvoie l'identifiant. */
export async function enregistrerExemple(id, valeurs) {
  const existant = await lire(R.COLLECTION_EXEMPLES, id);
  if (id && !existant) throw new I.ErreurClaire('Cet exemple n’existe plus.');
  const idDoc = id || nouvelId(R.COLLECTION_EXEMPLES);
  await executer(N.planEnregistrerExemple(existant, valeurs, { id: idDoc }).ecritures);
  return idDoc;
}
