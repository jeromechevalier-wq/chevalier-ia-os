// Accès aux données du CRM pour le serveur MCP. Deux réalisations de la même petite interface :
//  - Firestore (SDK d'administration : la fonction tourne avec l'identité du projet, sans clé) ;
//  - mémoire (tests).
// Lecture : liste(collection, { champ, valeur }?, { champ, depuis }?) -> [{ ...données, id }] ; le 3e argument (facultatif) est une borne de date sur UN
//    champ : `depuis` est un Date, on garde les documents dont le champ est >= depuis (borne incluse) ; champ absent ou sans date = exclu ;
//    combinable avec le filtre d'égalité (côté Firestore, égalité + borne sur deux champs exige un index composite) ; document(collection, id) -> { ...données, id } | null.
// Les valeurs sont rendues telles que Firestore les donne (Timestamp) : c'est serialiser() qui les met en texte pour les réponses.
// Écriture (étape 4, uniquement utilisée par coeur/ecriture.js, coeur/restaurer.js et securite/limites.js) :
//  - nouvelId(collection) -> identifiant frais ;
//  - appliquer(ecritures, { attendus }) : applique LOT ENTIER ou rien. ecritures : [{ type: 'set' | 'update' | 'delete', collection, id, donnees }].
//    attendus (facultatif) : [{ collection, id, avant }] ; chaque document doit être EXACTEMENT dans l'état `avant` (null = absent) au moment
//    de l'écriture, sinon rien n'est écrit et l'erreur a le code `conflit` (contrôle de concurrence : quelqu'un a modifié entre-temps) ;
//  - mettreAJour(collection, id, fn) : lecture-modification-écriture atomique ; fn(courant | null) -> { ecrire: bool, donnees, ...reste } ;
//    renvoie ce que fn a renvoyé (compteurs de débit) ;
//  - transaction(fn) : plusieurs lectures puis plusieurs écritures dans UNE transaction (module Devis : numéro, devis, version précédente).
//    fn(tx) reçoit tx.document(collection, id), tx.liste(collection, { champ, valeur }?, { champ, depuis }?) et tx.ecrire([ecritures]) (même forme que `appliquer`) ;
//    les écritures ne partent qu'à la fin de fn, toutes ensemble ; si fn lève une erreur, rien n'est écrit. Firestore relance fn en cas de concurrence :
//    fn ne doit donc rien faire d'autre que lire et appeler tx.ecrire.
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
  projets: 'projets_projets',
  projetsTaches: 'projets_taches',
  projetsModeles: 'projets_modeles',
  devisArticles: 'devis_articles',
  devis: 'devis_devis',
  devisCompteurs: 'devis_compteurs',
  devisParametres: 'devis_parametres',
  devisVocabulaire: 'devis_vocabulaire', // règles du dictionnaire de vocabulaire (docs/proposition-dictionnaire-vocabulaire.md)
  parametres: 'crm_parametres',
  audit: 'crm_audit',
  auditAvant: 'crm_audit_avant',
  limites: 'mcp_limites',
  codes: 'mcp_codes',
  propositions: 'automatisations_propositions',
  workflows: 'workflows',
  documentsStockes: 'documents_stockes', // fiches des fichiers de l'onglet « Documents » (écrites par le serveur seulement ; le fichier est dans Cloud Storage)
  actionsLancements: 'crm_actions_lancements', // journal des demandes faites à n8n depuis un écran (une ligne par demande, jamais le contenu d'un e-mail)
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

/** Millisecondes d'une date (Date ou Timestamp Firestore) ; null sinon. Un texte n'est PAS une date : Firestore ne le compare pas à un Date, la mémoire fait pareil. */
function enMs(v) {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}
function verifierBorne(borne) {
  if (borne == null) return null;
  if (typeof borne.champ !== 'string' || !borne.champ || !(borne.depuis instanceof Date) || Number.isNaN(borne.depuis.getTime())) {
    throw new Error('Borne de date invalide : { champ, depuis: Date } attendu');
  }
  return borne;
}
/** Garde les documents dont le champ de la borne est une date >= borne.depuis. */
function dansLaBorne(docs, borne) {
  const b = verifierBorne(borne);
  if (!b) return docs;
  const min = b.depuis.getTime();
  return docs.filter((d) => { const ms = enMs(d[b.champ]); return ms !== null && ms >= min; });
}
function requete(r, filtre, borne) {
  const b = verifierBorne(borne);
  const q = filtre ? r.where(filtre.champ, '==', filtre.valeur) : r;
  return b ? q.where(b.champ, '>=', b.depuis) : q;
}

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
    async liste(nom, filtre, borne) {
      const snap = await requete(base().collection(nom), filtre, borne).get();
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
    async transaction(fn) {
      return base().runTransaction(async (t) => {
        const aEcrire = [];
        const tx = {
          async document(nom, id) {
            const s = await t.get(ref(nom, id));
            return s.exists ? { ...s.data(), id: s.id } : null;
          },
          async liste(nom, filtre, borne) {
            const snap = await t.get(requete(base().collection(nom), filtre, borne));
            return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          },
          ecrire(ecritures) { aEcrire.push(...ecritures); },
        };
        const resultat = await fn(tx);
        appliquerA(t, aEcrire);
        return resultat;
      });
    },
  };
}

/**
 * Espace d'UN client : la même interface, mais chaque collection vit sous `clients/<client>/` (la base). C'est ici que se tient l'isolation
 * entre clients du serveur MCP, qui lit et écrit avec les droits d'administration (les règles Firestore ne le protègent pas) :
 *  - la base est fixée à la création, jamais lue dans une demande ; les outils ne reçoivent ni chemin ni nom de collection libre ;
 *  - un nom de collection doit être un simple nom (lettres minuscules, chiffres, tiret bas), jamais un chemin ;
 *  - un identifiant de document contenant « / » ou valant « . » / « .. » ne désigne rien : lecture = « introuvable », écriture = refusée.
 */
export function avecBase(acces, base) {
  if (typeof base !== 'string' || !/^clients\/[a-z0-9][a-z0-9_-]{0,39}$/.test(base)) throw new Error(`Base de client invalide : « ${base} »`);
  const nom = (n) => {
    if (typeof n !== 'string' || !/^[a-z][a-z0-9_]{0,60}$/.test(n)) throw new Error(`Nom de collection invalide : « ${n} »`);
    return `${base}/${n}`;
  };
  const idSur = (id) => { const t = String(id); return t.length > 0 && t.length <= 1500 && !t.includes('/') && t !== '.' && t !== '..'; };
  const exigerId = (id) => { if (!idSur(id)) throw new Error(`Identifiant de document invalide : « ${id} »`); return id; };
  return {
    base,
    liste: (n, filtre, borne) => acces.liste(nom(n), filtre, borne),
    document: (n, id) => (idSur(id) ? acces.document(nom(n), id) : Promise.resolve(null)),
    nouvelId: (n) => acces.nouvelId(nom(n)),
    appliquer: (ecritures, { attendus = [] } = {}) => acces.appliquer(
      ecritures.map((e) => ({ ...e, collection: nom(e.collection), id: exigerId(e.id) })),
      { attendus: attendus.map((a) => ({ ...a, collection: nom(a.collection), id: exigerId(a.id) })) },
    ),
    mettreAJour: (n, id, fn) => acces.mettreAJour(nom(n), exigerId(id), fn),
    transaction: (fn) => acces.transaction((tx) => fn({
      document: (n, id) => (idSur(id) ? tx.document(nom(n), id) : Promise.resolve(null)),
      liste: (n, filtre, borne) => tx.liste(nom(n), filtre, borne),
      ecrire: (ecritures) => tx.ecrire(ecritures.map((e) => ({ ...e, collection: nom(e.collection), id: exigerId(e.id) }))),
    })),
  };
}

/** Réalisation en mémoire pour les tests : collections = { nom: [documents avec id] }. Les écritures modifient `collections`. */
export function creerAccesMemoire(collections = {}) {
  const copie = (x) => structuredClone(x);
  let compteur = 0;
  let fileTransactions = Promise.resolve();
  const trouver = (nom, id) => (collections[nom] || []).find((x) => x.id === id);
  const contenu = (nom, id) => {
    const d = trouver(nom, id);
    return d ? copie(d) : null;
  };
  const acces = {
    async liste(nom, filtre, borne) {
      const docs = collections[nom] || [];
      return copie(dansLaBorne(filtre ? docs.filter((d) => d[filtre.champ] === filtre.valeur) : docs, borne));
    },
    async document(nom, id) {
      return contenu(nom, id);
    },
    nouvelId(nom) {
      compteur += 1;
      return `${nom.split('/').pop().replace(/^crm_|^mcp_/, '').slice(0, 4)}_${compteur}`;
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
    // Les transactions passent l'une après l'autre (comme Firestore qui relance la perdante) : jamais deux en même temps.
    async transaction(fn) {
      const attente = fileTransactions;
      let libere;
      fileTransactions = new Promise((ok) => { libere = ok; });
      await attente;
      try {
        const aEcrire = [];
        const tx = {
          document: async (nom, id) => contenu(nom, id),
          liste: async (nom, filtre, borne) => {
            const docs = collections[nom] || [];
            return copie(dansLaBorne(filtre ? docs.filter((d) => d[filtre.champ] === filtre.valeur) : docs, borne));
          },
          ecrire: (ecritures) => { aEcrire.push(...ecritures); },
        };
        const resultat = await fn(tx);
        if (aEcrire.length) await acces.appliquer(aEcrire);
        return resultat;
      } finally {
        libere();
      }
    },
  };
  return acces;
}
