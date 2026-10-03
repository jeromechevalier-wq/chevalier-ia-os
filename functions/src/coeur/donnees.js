// Accès aux données du CRM pour le serveur MCP. Deux réalisations de la même petite interface :
//  - Firestore (SDK d'administration : la fonction tourne avec l'identité du projet, sans clé) ;
//  - mémoire (tests).
// Interface : liste(collection, { champ, valeur }?) -> [{ ...données, id }] ; document(collection, id) -> { ...données, id } | null.
// Les valeurs sont rendues telles que Firestore les donne (Timestamp) : c'est serialiser() qui les met en texte pour les réponses.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const COLLECTIONS = {
  personnes: 'crm_personnes',
  organisations: 'crm_organisations',
  affaires: 'crm_affaires',
  activites: 'crm_activites',
  notes: 'crm_notes',
  evenements: 'crm_evenements',
  parametres: 'crm_parametres',
  audit: 'crm_audit',
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
  return {
    async liste(nom, filtre) {
      const ref = base().collection(nom);
      const snap = await (filtre ? ref.where(filtre.champ, '==', filtre.valeur) : ref).get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async document(nom, id) {
      const d = await base().collection(nom).doc(String(id)).get();
      return d.exists ? { ...d.data(), id: d.id } : null;
    },
  };
}

/** Réalisation en mémoire pour les tests : collections = { nom: [documents avec id] }. */
export function creerAccesMemoire(collections = {}) {
  const copie = (x) => structuredClone(x);
  return {
    async liste(nom, filtre) {
      const docs = collections[nom] || [];
      return copie(filtre ? docs.filter((d) => d[filtre.champ] === filtre.valeur) : docs);
    },
    async document(nom, id) {
      const d = (collections[nom] || []).find((x) => x.id === id);
      return d ? copie(d) : null;
    },
  };
}
