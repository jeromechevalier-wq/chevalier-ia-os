// Actions de la porte pour le module Veille. Chaque action déclare : son schéma d'entrée (validation stricte), si elle écrit, et ce qu'elle fait.
// Une action n'agit QUE sur les tables veille_sources / veille_contenus / veille_resumes du propriétaire de la clé (`base` : '' chez Jérôme,
// « clients/<id> » chez un client), jamais ailleurs : le nom des tables est écrit ici, pas reçu du workflow.
// Toutes les écritures sont « idempotentes » : un identifiant fixe, créé seulement s'il n'existe pas (un appel répété ne change rien).
import { valider } from './validation.js';

export const TABLES = Object.freeze({ sources: 'veille_sources', contenus: 'veille_contenus', resumes: 'veille_resumes' });
export const ETATS = ['nouveau', 'en_cours', 'resume', 'echec'];
export const TYPES = ['YouTube', 'Podcast', 'Newsletter'];
export const MAX_CONTENUS_PAR_APPEL = 100;
export const MAX_LECTURE = 200;

/** Erreur « métier » rendue au workflow avec un code et un statut HTTP clairs. */
export class ErreurAction extends Error {
  constructor(code, message, statut = 400) {
    super(message);
    this.name = 'ErreurAction';
    this.code = code;
    this.statut = statut;
  }
}

/** Firestore refuse les champs « undefined » : on les retire avant d'écrire. */
const sansIndefini = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const chemin = (base, table, id) => `${base ? `${base}/` : ''}${table}${id === undefined ? '' : `/${id}`}`;

const SCHEMA_CONTENU = {
  id: { type: 'id', requis: true },
  sourceId: { type: 'id', requis: true },
  sourceNom: { type: 'texte', max: 120 },
  titre: { type: 'texte', max: 300, min: 1, requis: true },
  url: { type: 'url' },
  type: { type: 'choix', valeurs: TYPES },
  urlAudio: { type: 'url' },
  datePublication: { type: 'date' },
};

const SCHEMA_RESUME = {
  contenuId: { type: 'id', requis: true },
  idExecution: { type: 'id', requis: true },
  modele: { type: 'modele' },
  coutReel: { type: 'nombre', min: 0, max: 1000 },
  devise: { type: 'choix', valeurs: ['USD', 'EUR'] },
  payeur: { type: 'choix', valeurs: ['jerome', 'client'] },
  cleIa: { type: 'etiquette' },
  lienHtml: { type: 'url' },
  lienCourt: { type: 'url' },
  lienTranscript: { type: 'url' },
};

/** Document → objet sans danger pour la réponse JSON (dates en texte ISO). */
function versJson(doc) {
  return JSON.parse(JSON.stringify(doc, (_, v) => (v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
}

/** ctx : { base, donnees, auteur, maintenant() }. `donnees` : voir adaptateur.js (lireDoc, creerSiAbsent, majDoc, lister). */
export const ACTIONS_VEILLE = Object.freeze({
  'sources.lire': {
    ecrit: false,
    schema: { actifSeulement: { type: 'booleen' } },
    async executer({ base, donnees }, { actifSeulement = true }) {
      const liste = await donnees.lister(chemin(base, TABLES.sources), { limite: MAX_LECTURE });
      return { sources: liste.filter((s) => !actifSeulement || s.actif === true).map(versJson) };
    },
  },

  'contenus.lire': {
    ecrit: false,
    schema: { etat: { type: 'choix', valeurs: ETATS }, limite: { type: 'nombre', min: 1, max: MAX_LECTURE } },
    async executer({ base, donnees }, { etat, limite = 100 }) {
      const liste = await donnees.lister(chemin(base, TABLES.contenus), { etat, limite: Math.floor(limite) });
      return { contenus: liste.map(versJson) };
    },
  },

  'contenus.ajouter': {
    ecrit: true,
    schema: { contenus: { type: 'liste', max: MAX_CONTENUS_PAR_APPEL, item: SCHEMA_CONTENU, requis: true } },
    async executer({ base, donnees, auteur, maintenant }, { contenus }) {
      const ids = new Set();
      for (const c of contenus) {
        if (ids.has(c.id)) throw new ErreurAction('requete_invalide', `Identifiant en double dans la liste : « ${c.id} ».`);
        ids.add(c.id);
      }
      // Les sources doivent exister (aucun contenu orphelin) : vérifié AVANT d'écrire quoi que ce soit.
      const sources = new Map();
      for (const sid of new Set(contenus.map((c) => c.sourceId))) sources.set(sid, await donnees.lireDoc(chemin(base, TABLES.sources, sid)));
      for (const [sid, doc] of sources) if (!doc) throw new ErreurAction('source_inconnue', `Source inconnue : « ${sid} ».`, 404);
      let crees = 0;
      for (const c of contenus) {
        const nom = sources.get(c.sourceId).nom;
        const donneesDoc = sansIndefini({
          ...c, sourceNom: c.sourceNom ?? nom, type: c.type ?? sources.get(c.sourceId).type ?? 'YouTube',
          etat: 'nouveau', detecteLe: new Date(maintenant()), origine: 'porte', ecritPar: auteur,
        });
        delete donneesDoc.id;
        if (await donnees.creerSiAbsent(chemin(base, TABLES.contenus, c.id), donneesDoc)) crees++;
      }
      return { crees, existants: contenus.length - crees };
    },
  },

  'contenus.changerEtat': {
    ecrit: true,
    schema: { id: { type: 'id', requis: true }, etat: { type: 'choix', valeurs: ETATS, requis: true }, etapeEchec: { type: 'texte', max: 200 } },
    async executer({ base, donnees, auteur, maintenant }, { id, etat, etapeEchec }) {
      if (etapeEchec !== undefined && etat !== 'echec') throw new ErreurAction('requete_invalide', '« etapeEchec » n\'a de sens que pour l\'état « echec ».');
      const maj = { etat, etapeEchec: etat === 'echec' ? (etapeEchec ?? null) : null, traiteLe: etat === 'resume' || etat === 'echec' ? new Date(maintenant()) : null, ecritPar: auteur };
      if (!(await donnees.majDoc(chemin(base, TABLES.contenus, id), maj))) throw new ErreurAction('contenu_inconnu', `Contenu inconnu : « ${id} ».`, 404);
      return { id, etat };
    },
  },

  'resumes.ajouter': {
    ecrit: true,
    schema: SCHEMA_RESUME,
    async executer({ base, donnees, auteur, maintenant }, d) {
      if (!(await donnees.lireDoc(chemin(base, TABLES.contenus, d.contenuId)))) throw new ErreurAction('contenu_inconnu', `Contenu inconnu : « ${d.contenuId} ».`, 404);
      const { idExecution, ...reste } = d;
      const id = `r-${d.contenuId}-${idExecution}`;
      const cree = await donnees.creerSiAbsent(chemin(base, TABLES.resumes, id), { ...reste, creeLe: new Date(maintenant()), origine: 'porte', ecritPar: auteur });
      return { id, cree };
    },
  },
});

/** Valide les données d'une action puis l'exécute. */
export async function lancerAction(action, brut, ctx) {
  const propres = valider(brut ?? {}, action.schema);
  return action.executer(ctx, propres);
}
