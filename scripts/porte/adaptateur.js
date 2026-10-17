// Accès aux données de la porte, avec le SDK d'administration de Firestore (`db` est fourni par la fonction : ce fichier n'importe rien).
// Il contourne les règles Firestore (comme le serveur MCP) : toute l'isolation est donc dans la porte (clé -> propriétaire -> chemin).
// Garde-fous ici : chaque chemin est composé de segments simples (lettres, chiffres, tirets), les créations ne peuvent pas écraser
// (`create`), les mises à jour ne créent rien (`update`), et il n'existe aucune suppression. `ecrireLot` : plusieurs créations/mises à jour en un lot atomique.
import { TABLE_CLES } from './cles.js';

const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const DEJA_EXISTANT = [6, 'already-exists', 'ALREADY_EXISTS'];
const INTROUVABLE = [5, 'not-found', 'NOT_FOUND'];

function sur(chemin) {
  const segments = String(chemin).split('/');
  if (!segments.every((s) => SEGMENT.test(s))) throw new Error('Chemin invalide');
  return chemin;
}

export function creerAdaptateur({ db }) {
  return {
    async lireCle(empreinte) {
      const d = await db.collection(TABLE_CLES).doc(sur(empreinte)).get();
      return d.exists ? d.data() : null;
    },
    async majCle(empreinte, partiel) {
      await db.collection(TABLE_CLES).doc(sur(empreinte)).update(partiel);
    },
    async lireDoc(chemin) {
      const d = await db.doc(sur(chemin)).get();
      return d.exists ? { ...d.data(), id: d.id } : null;
    },
    /** Crée le document seulement s'il n'existe pas. Renvoie true s'il vient d'être créé. */
    async creerSiAbsent(chemin, donnees) {
      try { await db.doc(sur(chemin)).create(donnees); return true; } catch (e) { if (DEJA_EXISTANT.includes(e?.code)) return false; throw e; }
    },
    /** Met à jour un document qui existe. Renvoie false s'il n'existe pas (rien n'est créé). */
    async majDoc(chemin, partiel) {
      try { await db.doc(sur(chemin)).update(partiel); return true; } catch (e) { if (INTROUVABLE.includes(e?.code)) return false; throw e; }
    },
    /**
     * Écrit plusieurs documents EN UN SEUL LOT atomique (tout ou rien). `operations` : [{ type: 'creer' | 'maj', chemin, donnees }].
     * « creer » échoue si le document existe, « maj » échoue s'il n'existe pas : dans les deux cas rien n'est écrit. Aucune suppression ni remplacement.
     */
    async ecrireLot(operations) {
      if (!Array.isArray(operations) || operations.length < 1 || operations.length > 20) throw new Error('Lot invalide');
      const lot = db.batch();
      for (const { type, chemin, donnees } of operations) {
        const ref = db.doc(sur(chemin));
        if (type === 'creer') lot.create(ref, donnees);
        else if (type === 'maj') lot.update(ref, donnees);
        else throw new Error('Opération de lot inconnue');
      }
      await lot.commit();
    },
    /** Documents d'une table : { id, ...champs }. Au plus une condition (`etat`) et une limite : aucun index composite. */
    async lister(chemin, { etat, limite = 100 } = {}) {
      let q = db.collection(sur(chemin));
      if (etat) q = q.where('etat', '==', etat);
      const snap = await q.limit(limite).get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
  };
}
