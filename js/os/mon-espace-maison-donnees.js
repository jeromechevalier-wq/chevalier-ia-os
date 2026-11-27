// Écriture de « Mon espace » dans une MAISON (27/11/2026) : le nom et le logo vivent dans reglages_maison/public (lu avant la connexion).
// Seule écriture qu'un navigateur peut faire dans reglages_maison : les règles (firestore.rules, identiteMaisonValide) n'acceptent que ces deux champs,
// d'un compte autorisé de la maison, et seulement dans la maison d'un client. Tout autre champ, toute autre fiche : refusé.
import { doc, updateDoc, deleteField } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';

export const MESSAGE_REFUS_MAISON = 'Enregistrement refusé : ce compte ne peut pas changer le nom et le logo de cet espace pour le moment. Préviens l’administrateur.';
export const MESSAGE_PANNE_MAISON = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : ce que tu as choisi est conservé.';

/** Enregistre le nom et, si demandé, le logo : `logo` = adresse « data: » (nouveau logo), null (retirer le logo) ou undefined (ne pas y toucher). Lève une Error au message lisible. */
export async function enregistrerIdentiteMaison({ nom, logo }) {
  const champs = { nom_espace: nom };
  if (logo === null) champs.logo = deleteField();
  else if (typeof logo === 'string') champs.logo = logo;
  try {
    await updateDoc(doc(db, 'reglages_maison', 'public'), champs);
  } catch (e) {
    console.warn('Mon espace (maison) : enregistrement impossible', e?.code); // le code seul : jamais le contenu
    throw Object.assign(new Error(e?.code === 'permission-denied' ? MESSAGE_REFUS_MAISON : MESSAGE_PANNE_MAISON), { code: e?.code });
  }
}
