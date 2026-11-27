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
const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,125}$/;
const entierPositif = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** Date Firestore (Timestamp), Date ou nombre -> millisecondes ; null sinon. */
function enMs(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  return null;
}

/** Portefeuille propre à partir des données brutes du document (absent : tout à 0 ; une valeur qui n'est pas un entier positif vaut 0).
 * `version` monte de 1 à chaque écriture : l'écran garde le solde de la version la plus haute (une lecture lente n'écrase jamais un gain plus récent). */
export function portefeuilleDe(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  return { or: entierPositif(d.or), gagne: entierPositif(d.gagne), parcelles: parcellesValables(d.parcelles), version: entierPositif(d.version) };
}

/** Lit le portefeuille d'un utilisateur, dans une transaction (`tx`) ou directement. Utilisé aussi par les achats (6b) et les ramassages (7). */
export async function lirePortefeuille({ db, racine = '', uid, tx = null }) {
  const ref = db.doc(`${racine}${C_VILLAGE}/${uid}`);
  const instantane = tx ? await tx.get(ref) : await ref.get();
  return portefeuilleDe(instantane.exists ? instantane.data() : null);
}

/**
 * `db` : Firestore d'administration ; `racine` : '' (maison) ou 'clients/<client>/' ; `verifierAchat` : async (id) => 'acceptee' | 'autre' | 'trop_ancien' | 'indisponible'
 * (absent chez les clients : pas de base des achats) ; `maintenant` : () => ms ; `horodatage(ms)` : la valeur de date à écrire (Timestamp.fromMillis chez l'appelant).
 */
export function creerVillageOr({ db, racine = '', verifierAchat = null, maintenant = Date.now, horodatage }) {
  if (typeof horodatage !== 'function') throw new Error('creerVillageOr : horodatage manquant');
  if (racine !== '' && !/^clients\/[A-Za-z0-9][A-Za-z0-9_-]*\/$/.test(racine)) throw new Error('creerVillageOr : racine invalide');

  /**
   * Dernière trace du journal (crm_audit, même racine) qui a fait la bonne nouvelle, lue DANS la transaction. `requetes` : [champ, valeur] en plus de `docId`
   * (égalités seules : aucun index composé à créer) ; `garder` filtre les lignes. Rend la plus récente, ou null.
   */
  async function derniereTrace(tx, docId, requetes, garder) {
    const lignes = [];
    for (const [champ, valeur] of requetes) {
      const q = db.collection(`${racine}${COLLECTIONS.audit}`).where('docId', '==', docId).where(champ, '==', valeur);
      for (const d of (await tx.get(q)).docs) { const l = d.data(); if (garder(l)) lignes.push(l); }
    }
    lignes.sort((a, b) => (enMs(b.date) ?? 0) - (enMs(a.date) ?? 0));
    return lignes[0] ?? null;
  }
  /** « Pas d'or pour l'assistant, un collègue ne prend pas l'or d'un autre » : la dernière trace est celle de l'écran (via « ecran ») et de l'appelant lui-même. */
  const parLAppelant = (trace, acteur) => !!trace && trace.via === 'ecran' && String(trace.acteur ?? '').toLowerCase() === acteur;
  const champs = (l) => (Array.isArray(l.champsModifies) ? l.champsModifies : []);

  /** Vérifie la bonne nouvelle dans la donnée elle-même, DANS la transaction (tx.get) : rien n'est lu avant. Rend { cle } si elle rapporte, sinon { raison }. */
  async function verifierDansTx(tx, source, id, projetId, acteur) {
    const quand = maintenant();
    if (source === 'devis-signe') {
      const snap = await tx.get(db.doc(`${racine}${COLLECTIONS.devis}/${id}`));
      if (!snap.exists) return { raison: 'pas_valide' };
      const d = snap.data();
      if (d.statut !== 'accepte') return { raison: 'pas_valide' };
      if (d.test === true) return { raison: 'test' };
      if (!fraisPourGain(source, enMs(d.accepteLe), quand)) return { raison: 'trop_ancien' };
      // Signé par l'appelant, à l'écran : la ligne « devisChangerStatut » qui a posé accepteLe (le serveur l'écrit avec acteur et via : écran ou assistant).
      const trace = await derniereTrace(tx, id, [['outil', 'devisChangerStatut']], (l) => champs(l).includes('accepteLe'));
      if (!parLAppelant(trace, acteur)) return { raison: 'pas_valide' };
      // La clé vient du DOCUMENT (toutes les versions d'un devis partagent leur racine) : jamais de la demande.
      const cle = cleDeGain(source, { id: typeof d.racineId === 'string' && d.racineId ? d.racineId : id });
      return cle ? { cle } : { raison: 'pas_valide' };
    }
    // facture-payee (facture de projet)
    const snap = await tx.get(db.doc(`${racine}${COLLECTIONS.projets}/${projetId}`));
    if (!snap.exists) return { raison: 'pas_valide' };
    const p = snap.data();
    if (p.test === true) return { raison: 'test' };
    const f = Array.isArray(p.factures) ? p.factures.find((x) => x && x.id === id) : null;
    if (!f || f.statut !== 'payee') return { raison: 'pas_valide' };
    if (!paiementRecent(f.datePaiement, quand)) return { raison: 'trop_ancien' };
    // Dernier « marquer payée » du projet : l'écran (outil marquerFacturePayee ; acteur = e-mail connecté, imposé par les règles) ou l'assistant (via « mcp »).
    const trace = await derniereTrace(tx, projetId, [['outil', 'marquerFacturePayee'], ['via', 'mcp']], (l) => l.outil === 'marquerFacturePayee' || champs(l).includes('factures'));
    if (!parLAppelant(trace, acteur)) return { raison: 'pas_valide' };
    return { cle: cleDeGain(source, { id, projetId }) };
  }

  /** `acteur` : l'e-mail de l'appelant (de sa connexion, jamais de la demande). */
  async function gain({ uid, acteur, source, id, projetId, lectureSeule = false } = {}) {
    if (typeof uid !== 'string' || !UID.test(uid)) return { ok: false, raison: 'demande' };
    if (!Object.hasOwn(GAINS, source) || !cleDeGain(source, { id, projetId })) return { ok: false, raison: 'demande' };
    if (lectureSeule) return { ok: true, gagne: 0, raison: 'lecture_seule' };
    const qui = typeof acteur === 'string' ? acteur.trim().toLowerCase() : '';
    if (!EMAIL.test(qui)) return { ok: false, raison: 'demande' };
    // facture-validee : la base des achats (maison seulement), hors de Firestore ; la fraîcheur est vérifiée par le vérificateur.
    // Limite acceptée (D14) : la base ne dit pas par quelle voie (écran ou assistant) la facture a été acceptée.
    let cleAchat = null;
    if (source === 'facture-validee') {
      if (typeof verifierAchat !== 'function') return { ok: true, gagne: 0, raison: 'indisponible' };
      let etat;
      try { etat = await verifierAchat(id); } catch { etat = 'indisponible'; }
      if (etat !== 'acceptee') return { ok: true, gagne: 0, raison: etat === 'autre' ? 'pas_valide' : etat === 'trop_ancien' ? 'trop_ancien' : 'indisponible' };
      cleAchat = cleDeGain(source, { id });
    }
    const pieces = GAINS[source];
    const refPorte = db.doc(`${racine}${C_VILLAGE}/${uid}`);
    // La transaction lit tout (la donnée vérifiée, le journal, le registre, le portefeuille) puis écrit (Firestore peut la relancer : elle relit alors tout).
    // `create` : deux annonces en même temps (même de deux comptes) ne paient qu'une fois.
    return db.runTransaction(async (tx) => {
      const v = cleAchat ? { cle: cleAchat } : await verifierDansTx(tx, source, id, projetId, qui);
      if (!v.cle) return { ok: true, gagne: 0, raison: v.raison };
      const refGain = db.doc(`${racine}${C_GAINS}/${v.cle}`);
      const deja = await tx.get(refGain);
      if (deja.exists) return { ok: true, gagne: 0, raison: 'deja' };
      const p = await lirePortefeuille({ db, racine, uid, tx });
      const quand = horodatage(maintenant());
      const or = p.or + pieces;
      const version = p.version + 1;
      tx.create(refGain, { uid, source, pieces, le: quand });
      tx.set(refPorte, { or, gagne: p.gagne + pieces, parcelles: p.parcelles, version, modifieLe: quand }, { merge: true });
      return { ok: true, gagne: pieces, or, version };
    });
  }

  return { gain };
}
