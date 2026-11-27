// Écriture de « Mon espace » dans une MAISON (27/11/2026) : le nom et le logo vivent dans reglages_maison/public (lu avant la connexion).
// Seule écriture qu'un navigateur peut faire dans reglages_maison : les règles (firestore.rules, identiteMaisonValide) n'acceptent que ces deux champs (et ligne_journal),
// d'un compte de la maison (comptes_autorises ; plus seulement le titulaire depuis le 27/11/2026, accord de Jérôme), et seulement dans la maison d'un client.
// Journal : la modification, sa ligne et sa copie partent dans le MÊME lot (js/os/journal-donnees.js) ; les règles refusent une modification sans sa ligne.
// Le logo n'entre jamais dans le journal (js/os/identite-maison.js, planIdentiteMaison). Tout autre champ, toute autre fiche : refusé.
import { doc, getDoc, deleteField } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, auth } from './firebase.js';
import { planIdentiteMaison } from './identite-maison.js';
import { nouvelIdLigneJournal, modifierAvecLigneJournal } from './journal-donnees.js';

export const MESSAGE_REFUS_MAISON = 'Enregistrement refusé : ce compte ne peut pas changer le nom et le logo de cet espace pour le moment. Préviens l’administrateur.';
export const MESSAGE_PANNE_MAISON = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : ce que tu as choisi est conservé.';

/** Enregistre le nom et, si demandé, le logo : `logo` = adresse « data: » (nouveau logo), null (retirer le logo) ou undefined (ne pas y toucher). Lève une Error au message lisible. */
export async function enregistrerIdentiteMaison({ nom, logo }) {
  try {
    const ref = doc(db, 'reglages_maison', 'public');
    const lu = await getDoc(ref);
    const idLigne = nouvelIdLigneJournal();
    const acteur = auth.currentUser?.email || '';
    const plan = planIdentiteMaison({ avant: lu.exists() ? lu.data() : {}, nom, logo, acteur, idLigne, maintenant: new Date() });
    if (!plan) return; // rien n'a changé : aucune écriture, aucune ligne de journal
    const patch = { ...plan.patch };
    if (patch.logo === null) patch.logo = deleteField();
    await modifierAvecLigneJournal({ ref, patch, idLigne, ligne: plan.ligne, copie: plan.copie });
  } catch (e) {
    console.warn('Mon espace (maison) : enregistrement impossible', e?.code); // le code seul : jamais le contenu
    throw Object.assign(new Error(e?.code === 'permission-denied' ? MESSAGE_REFUS_MAISON : MESSAGE_PANNE_MAISON), { code: e?.code });
  }
}
