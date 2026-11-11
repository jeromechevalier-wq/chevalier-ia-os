// Écriture du classement d'un post (pilier, format, services) : seul point d'écriture de l'écran Posts.
// Document `reseauxsociaux_posts/<identifiant Buffer>` ; jamais le texte, la date, le statut ni un chiffre de Buffer (ils se relisent).
// Passe toujours par `executer` (le journal commun) : une ligne « classement de post » dans le Journal des modifications, jamais de setDoc direct.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { executer } from '../../os/journal-donnees.js';
import * as D from './donnees.js';
import * as R from './logique.js';

/**
 * Classe un post : crée le document s'il n'existe pas, le modifie sinon (jamais deux documents pour un post).
 * Le document est relu FRAIS avant d'écrire : un second enregistrement rapproché, avant que l'écoute en direct n'ait rendu le premier, ne réécrit donc pas `creeLe`.
 * `valeurs` = { pilier, format, services }. Lève l'erreur de l'écriture (l'écran la dit et garde la fenêtre ouverte).
 */
export async function classerPost(idPost, valeurs) {
  if (!R.idPostValide(idPost)) throw new Error('Identifiant de post invalide.');
  const lu = await getDoc(doc(db, D.chemin(R.COLLECTION_POSTS), idPost));
  const plan = R.planClasserPost(lu.exists() ? { id: idPost, ...lu.data() } : null, valeurs, { id: idPost });
  await executer(plan.ecritures);
}
