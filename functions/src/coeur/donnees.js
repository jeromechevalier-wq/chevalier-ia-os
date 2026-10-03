// Accès aux données du CRM pour le serveur MCP. Deux réalisations de la même petite interface :
//  - Firestore (SDK d'administration : la fonction tourne avec l'identité du projet, sans clé) ;
//  - mémoire (tests).
// Lecture : liste(collection, { champ, valeur }?) -> [{ ...données, id }] ; document(collection, id) -> { ...données, id } | null.
// Les valeurs sont rendues telles que Firestore les donne (Timestamp) : c'est serialiser() qui les met en texte pour les réponses.
// Écriture (étape 4, uniquement utilisée par coeur/ecriture.js, coeur/restaurer.js et securite/limites.js) :
//  - nouvelId(collection) -> identifiant frais ;
//  - appliquer(ecritures, { attendus }) : applique LOT ENTIER ou rien. ecritures : [{ type: 'set' | 'update' | 'delete', collection, id, donnees }].
//    attendus (facultatif) : [{ collection, id, avant }] ; chaque document doit être EXACTEMENT dans l'état `avant` (null = absent) au moment
//    de l'écriture, sinon rien n'est écrit et l'erreur a le code `conflit` (contrôle de concurrence : quelqu'un a modifié entre-temps) ;
//  - mettreAJour(collection, id, fn) : lecture-modification-écriture atomique ; fn(courant | null) -> { ecrire: bool, donnees, ...reste } ;
//    renvoie ce que fn a renvoyé (compteurs de débit).
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { egal, sansUndefined } from './canonique.js';

export const COLLECTIONS = {
  personnes: 'crm_personnes',
  organisations: 'crm_organisations',
  affaires: 'crm_affaires',
  activites: 'crm_activites',
  notes: 'crm_notes',
  evenements: 'crm_evenements',
  parametres: 'crm_parametres',
  audit: 'crm_audit',
  auditAvant: 'crm_audit_avant',
  limites: 'mcp_limites',
};

/** Erreur de contrôle de concurrence : un document a changé entre la lecture et l'écriture. */
export class ErreurConflit extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErreurConflit';
    this.code = 'conflit';
  }
}

const verifierAttendus = (attendus, courants) => {
  attendus.forEach((a, i) => {
    if (!egal(courants[i], a.avant)) throw new ErreurConflit(`Le document ${a.collection}/${a.id} a changé entre-temps.`);
  });
};

/** `db` : instance Firestore déjà prête (tests) ; sinon la base du projet, avec l'identité de la fonction. */
export function creerAccesFirestore({ projectId, db: dbFournie = null } = {}) {
  let db = dbFournie;
  const base = () => {
    if (!db) {
      const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(projectId ? { projectId } : undefined);
      db = getFirestore(app);
    }
    return db;
  };
  const ref = (nom, id) => base().collection(nom).doc(String(id));
  const appliquerA = (cible, ecritures) => {
    for (const e of ecritures) {
      if (e.type === 'set') cible.set(ref(e.collection, e.id), sansUndefined(e.donnees));
      else if (e.type === 'update') cible.update(ref(e.collection, e.id), sansUndefined(e.donnees));
      else if (e.type === 'delete') cible.delete(ref(e.collection, e.id));
      else throw new Error(`Type d'écriture inconnu : ${e.type}`);
    }
  };
  return {
    async liste(nom, filtre) {
      const r = base().collection(nom);
      const snap = await (filtre ? r.where(filtre.champ, '==', filtre.valeur) : r).get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async document(nom, id) {
      const d = await ref(nom, id).get();
      return d.exists ? { ...d.data(), id: d.id } : null;
    },
    nouvelId(nom) {
      return base().collection(nom).doc().id;
    },
    async appliquer(ecritures, { attendus = [] } = {}) {
      if (!attendus.length) {
        const lot = base().batch();
        appliquerA(lot, ecritures);
        await lot.commit();
        return;
      }
      await base().runTransaction(async (t) => {
        const snaps = await t.getAll(...attendus.map((a) => ref(a.collection, a.id)));
        verifierAttendus(attendus, snaps.map((s) => (s.exists ? s.data() : null)));
        appliquerA(t, ecritures);
      });
    },
    async mettreAJour(nom, id, fn) {
      return base().runTransaction(async (t) => {
        const s = await t.get(ref(nom, id));
        const r = fn(s.exists ? s.data() : null);
        if (r.ecrire) t.set(ref(nom, id), sansUndefined(r.donnees));
        return r;
      });
    },
  };
}

/** Réalisation en mémoire pour les tests : collections = { nom: [documents avec id] }. Les écritures modifient `collections`. */
export function creerAccesMemoire(collections = {}) {
  const copie = (x) => structuredClone(x);
  let compteur = 0;
  const trouver = (nom, id) => (collections[nom] || []).find((x) => x.id === id);
  const contenu = (nom, id) => {
    const d = trouver(nom, id);
    return d ? copie(d) : null;
  };
  const acces = {
    async liste(nom, filtre) {
      const docs = collections[nom] || [];
      return copie(filtre ? docs.filter((d) => d[filtre.champ] === filtre.valeur) : docs);
    },
    async document(nom, id) {
      return contenu(nom, id);
    },
    nouvelId(nom) {
      compteur += 1;
      return `${nom.replace(/^crm_|^mcp_/, '').slice(0, 4)}_${compteur}`;
    },
    async appliquer(ecritures, { attendus = [] } = {}) {
      verifierAttendus(attendus, attendus.map((a) => contenu(a.collection, a.id)));
      // Tout ou rien : on travaille sur une copie des collections touchées, qu'on ne publie qu'à la fin.
      const touchees = new Set(ecritures.map((e) => e.collection));
      const travail = Object.fromEntries([...touchees].map((nom) => [nom, copie(collections[nom] || [])]));
      for (const e of ecritures) {
        const liste = travail[e.collection];
        const i = liste.findIndex((x) => x.id === String(e.id));
        if (e.type === 'set') {
          const doc = { ...copie(sansUndefined(e.donnees)), id: String(e.id) };
          if (i >= 0) liste[i] = doc; else liste.push(doc);
        } else if (e.type === 'update') {
          if (i < 0) throw Object.assign(new Error(`NOT_FOUND : ${e.collection}/${e.id}`), { code: 5 });
          liste[i] = { ...liste[i], ...copie(sansUndefined(e.donnees)) };
        } else if (e.type === 'delete') {
          if (i >= 0) liste.splice(i, 1);
        } else throw new Error(`Type d'écriture inconnu : ${e.type}`);
      }
      for (const [nom, liste] of Object.entries(travail)) collections[nom] = liste;
    },
    async mettreAJour(nom, id, fn) {
      const r = fn(contenu(nom, id));
      if (r.ecrire) await acces.appliquer([{ type: 'set', collection: nom, id, donnees: r.donnees }]);
      return r;
    },
  };
  return acces;
}
