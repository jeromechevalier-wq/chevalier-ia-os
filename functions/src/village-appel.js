// Fonction appelable `villageOr` d'une maison (27/11/2026, or du village) : même contrôle de l'appelant que les devis (compte Google vérifié, parmi les comptes autorisés),
// puis le cœur commun (coeur/village-or.js). L'utilisateur crédité est TOUJOURS celui de la connexion (requete.auth.uid), jamais un identifiant reçu.
// Le journal Cloud ne reçoit ni l'identifiant de l'utilisateur, ni son e-mail, ni l'identifiant d'une facture ou d'un devis : liste blanche de champs ci-dessous.
import { HttpsError } from 'firebase-functions/v2/https';
import { exigerCompteAutorise } from './devis-appel.js';

/** Actions connues (6a : le gain ; 6b : l'achat ; l'étape 7 ajoutera ramasser). */
export const ACTIONS_VILLAGE = Object.freeze(['gain', 'acheter']);
const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. */
export function ligneDeJournalVillage(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'village' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

/** `service(email)` rend { gain, acheter } (coeur/village-or.js) ; `comptes` : liste des comptes autorisés (par défaut, ceux de la fiche de la maison). */
export function creerAppelVillage({ service, comptes, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = comptes === undefined ? await exigerCompteAutorise(requete) : await exigerCompteAutorise(requete, comptes);
    const uid = requete.auth?.uid;
    if (typeof uid !== 'string' || !uid) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    const demande = requete.data && typeof requete.data === 'object' ? requete.data : {};
    const action = typeof demande.action === 'string' ? demande.action : '';
    if (!ACTIONS_VILLAGE.includes(action)) throw new HttpsError('invalid-argument', 'Demande invalide.');
    try {
      const acteur = jeton.email.toLowerCase();
      // L'uid est celui de la connexion : un `uid` reçu dans la demande est ignoré.
      const r = action === 'acheter'
        ? await service(acteur).acheter({ uid, article: demande.article, modele: demande.modele, c: demande.c, l: demande.l })
        : await service(acteur).gain({ uid, acteur, source: demande.source, id: demande.id, projetId: demande.projetId });
      journal({ action, statut: r.ok ? 'ok' : 'refus', code: r.raison, dureeMs: maintenant() - debut });
      return r;
    } catch (e) {
      journal({ action, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
