// Or du village (27/11/2026, étape 6a de docs/accueil-village.md) : le cœur commun à la maison (functions/src/index.js, villageOr) et à la plateforme des clients
// (functions-plateforme/src/village.js ; ce dossier coeur/ y est copié tel quel par scripts/preparer-fonctions.js).
// L'écran ne dit jamais « donne-moi 10 pièces » : il dit « regarde telle facture » (ou tel devis). Le serveur va lire LUI-MÊME la donnée (statut, date, pas un test),
// puis crédite le portefeuille de l'utilisateur dans une transaction, une seule fois par élément pour toute la maison (registre village_gains/{clé}).
// Ce fichier n'importe ni firebase-functions, ni firebase-admin, ni rien de ../base/ (absent chez les clients) : la base Firestore, l'horloge et la fabrique de dates sont reçues.
// Jamais d'exception pour un refus métier : toujours un objet simple { ok, gagne, or?, raison? }.
import { GAINS, cleDeGain, fraisPourGain, paiementRecent, parcellesValables } from '../../partage/village-jeu-regles.js';
import { COLLECTIONS } from './donnees.js';

export const C_VILLAGE = 'village_utilisateurs';
export const C_GAINS = 'village_gains';
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const entierPositif = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** Date Firestore (Timestamp), Date ou nombre -> millisecondes ; null sinon. */
function enMs(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  return null;
}

/** Portefeuille propre à partir des données brutes du document (absent : tout à 0 ; une valeur qui n'est pas un entier positif vaut 0). */
export function portefeuilleDe(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  return { or: entierPositif(d.or), gagne: entierPositif(d.gagne), parcelles: parcellesValables(d.parcelles) };
}

/** Lit le portefeuille d'un utilisateur, dans une transaction (`tx`) ou directement. Utilisé aussi par les achats (6b) et les ramassages (7). */
export async function lirePortefeuille({ db, racine = '', uid, tx = null }) {
  const ref = db.doc(`${racine}${C_VILLAGE}/${uid}`);
  const instantane = tx ? await tx.get(ref) : await ref.get();
  return portefeuilleDe(instantane.exists ? instantane.data() : null);
}

/**
 * `db` : Firestore d'administration ; `racine` : '' (maison) ou 'clients/<client>/' ; `verifierAchat` : async (id) => 'acceptee' | 'autre' | 'indisponible'
 * (absent chez les clients : pas de base des achats) ; `maintenant` : () => ms ; `horodatage(ms)` : la valeur de date à écrire (Timestamp.fromMillis chez l'appelant).
 */
export function creerVillageOr({ db, racine = '', verifierAchat = null, maintenant = Date.now, horodatage }) {
  if (typeof horodatage !== 'function') throw new Error('creerVillageOr : horodatage manquant');
  if (racine !== '' && !/^clients\/[A-Za-z0-9][A-Za-z0-9_-]*\/$/.test(racine)) throw new Error('creerVillageOr : racine invalide');

  /** Vérifie la bonne nouvelle dans la donnée elle-même. Rend { cle } si elle rapporte, sinon { raison }. */
  async function verifier(source, id, projetId) {
    const quand = maintenant();
    if (source === 'devis-signe') {
      const snap = await db.doc(`${racine}${COLLECTIONS.devis}/${id}`).get();
      if (!snap.exists) return { raison: 'pas_valide' };
      const d = snap.data();
      if (d.statut !== 'accepte') return { raison: 'pas_valide' };
      if (d.test === true) return { raison: 'test' };
      if (!fraisPourGain(source, enMs(d.accepteLe), quand)) return { raison: 'trop_ancien' };
      // La clé vient du DOCUMENT (toutes les versions d'un devis partagent leur racine) : jamais de la demande.
      const cle = cleDeGain(source, { id: typeof d.racineId === 'string' && d.racineId ? d.racineId : id });
      return cle ? { cle } : { raison: 'pas_valide' };
    }
    if (source === 'facture-payee') {
      const snap = await db.doc(`${racine}${COLLECTIONS.projets}/${projetId}`).get();
      if (!snap.exists) return { raison: 'pas_valide' };
      const p = snap.data();
      if (p.test === true) return { raison: 'test' };
      const f = Array.isArray(p.factures) ? p.factures.find((x) => x && x.id === id) : null;
      if (!f || f.statut !== 'payee') return { raison: 'pas_valide' };
      if (!paiementRecent(f.datePaiement, quand)) return { raison: 'trop_ancien' };
      return { cle: cleDeGain(source, { id, projetId }) };
    }
    // facture-validee : la base des achats (maison seulement) ; la fraîcheur est vérifiée par le vérificateur.
    if (typeof verifierAchat !== 'function') return { raison: 'indisponible' };
    let etat;
    try { etat = await verifierAchat(id); } catch { etat = 'indisponible'; }
    if (etat === 'acceptee') return { cle: cleDeGain(source, { id }) };
    return { raison: etat === 'autre' ? 'pas_valide' : 'indisponible' };
  }

  async function gain({ uid, source, id, projetId, lectureSeule = false } = {}) {
    if (typeof uid !== 'string' || !UID.test(uid)) return { ok: false, raison: 'demande' };
    if (!Object.hasOwn(GAINS, source) || !cleDeGain(source, { id, projetId })) return { ok: false, raison: 'demande' };
    if (lectureSeule) return { ok: true, gagne: 0, raison: 'lecture_seule' };
    const v = await verifier(source, id, projetId);
    if (!v.cle) return { ok: true, gagne: 0, raison: v.raison };
    const pieces = GAINS[source];
    const refGain = db.doc(`${racine}${C_GAINS}/${v.cle}`);
    const refPorte = db.doc(`${racine}${C_VILLAGE}/${uid}`);
    // La transaction ne fait que lire puis écrire (Firestore peut la relancer). `create` : deux annonces en même temps ne paient qu'une fois.
    return db.runTransaction(async (tx) => {
      const deja = await tx.get(refGain);
      if (deja.exists) return { ok: true, gagne: 0, raison: 'deja' };
      const p = await lirePortefeuille({ db, racine, uid, tx });
      const quand = horodatage(maintenant());
      const or = p.or + pieces;
      tx.create(refGain, { uid, source, pieces, le: quand });
      tx.set(refPorte, { or, gagne: p.gagne + pieces, parcelles: p.parcelles, modifieLe: quand }, { merge: true });
      return { ok: true, gagne: pieces, or };
    });
  }

  return { gain };
}
