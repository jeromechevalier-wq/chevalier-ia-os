// Actions de la porte pour le module Automatisations : la file « À valider ». Une action n'agit QUE sur la table automatisations_propositions du propriétaire
// de la clé (`base` : '' chez Jérôme, « clients/<id> » chez un client) : le nom de la table est écrit ici, jamais reçu. Aucune suppression.
//  - propositions.ajouter        : un workflow DÉPOSE une proposition (créée seulement si elle n'existe pas : rejouer ne change rien) ;
//  - propositions.lireValidees   : les propositions validées par le propriétaire, les plus anciennes d'abord (pour que le workflow les applique) ;
//  - propositions.marquerAppliquee / propositions.marquerEchec : le workflow dit ce qu'il est advenu d'une proposition validée.
// Les transitions viennent du fichier pur js/modules/automatisations/propositions.js (jamais recopiées ici). Il n'existe PAS d'action « décider » :
// valider ou refuser se fait à l'écran ou par MCP, jamais par un workflow. Le propriétaire vient de la clé, jamais du corps.
// Le journal de la porte ne reçoit jamais le titre, le résumé, les champs ni le lien (liste blanche dans functions/src/porte.js).
import { ErreurAction } from './actions-veille.js';
// Dans functions/partage/porte/, cet import est réécrit en '../propositions.js' (scripts/preparer-fonctions.js).
import { DUREE_VALIDITE_MS, ETATS, enMs, marquerAppliquee, marquerEchec } from '../../js/modules/automatisations/propositions.js';

export const TABLE_PROPOSITIONS = 'automatisations_propositions';
export const MAX_CHAMPS = 40;
export const MAX_LECTURE_VALIDEES = 100;

const chemin = (base, id) => `${base ? `${base}/` : ''}${TABLE_PROPOSITIONS}${id === undefined ? '' : `/${id}`}`;

const SCHEMA_AJOUT = {
  id: { type: 'idsur', requis: true },
  type: { type: 'libre', max: 40, min: 1, requis: true },
  titre: { type: 'libre', max: 120, min: 1, requis: true },
  resume: { type: 'libre', max: 2000 },
  champs: { type: 'liste', max: MAX_CHAMPS, item: { nom: { type: 'libre', max: 40, min: 1, requis: true }, valeur: { type: 'libre', max: 500, requis: true } }, requis: true },
  lien: { type: 'url' },
  executionId: { type: 'id' },
};

/** Document → objet sans danger pour la réponse JSON (dates en texte ISO). */
function versJson(doc) {
  const { proprietaire, ecritPar, ...reste } = doc;
  return JSON.parse(JSON.stringify(reste, (_, v) => (v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
}

/**
 * Lit la proposition, applique la transition PURE, écrit seulement les champs qui changent avec la précondition « le document n'a pas changé depuis ma lecture ».
 * Si la précondition échoue (une décision est arrivée entre-temps), on relit UNE fois et on réapplique la règle ; un deuxième échec est une erreur claire.
 */
async function transition({ base, donnees, auteur }, id, appliquer, champsEcrits) {
  const chem = chemin(base, id);
  for (let essai = 1; essai <= 2; essai++) {
    const existant = await donnees.lireDoc(chem);
    if (!existant) throw new ErreurAction('proposition_inconnue', 'Proposition inconnue.', 404);
    const { updateTime, ...proposition } = existant;
    const r = appliquer(proposition);
    if (!r.ok) throw new ErreurAction(r.code, r.message, 409);
    const maj = { ...Object.fromEntries(champsEcrits.map((c) => [c, r.proposition[c]])), ecritPar: auteur };
    const ecrit = await donnees.majDoc(chem, maj, updateTime ? { lastUpdateTime: updateTime } : undefined);
    if (ecrit === false) throw new ErreurAction('proposition_inconnue', 'Proposition inconnue.', 404);
    if (ecrit?.preconditionEchouee === true) continue;
    return r.proposition;
  }
  throw new ErreurAction('conflit_ecriture', 'La proposition a changé pendant l\'écriture : réessayer.', 409);
}

/** ctx : { base, donnees, auteur, maintenant() }. `donnees` : voir adaptateur.js (lireDoc, creerSiAbsent, majDoc, lister). */
export const ACTIONS_AUTOMATISATIONS = Object.freeze({
  'propositions.ajouter': {
    ecrit: true,
    schema: SCHEMA_AJOUT,
    async executer({ base, donnees, auteur, maintenant }, d) {
      const noms = new Set();
      for (const c of d.champs) {
        if (noms.has(c.nom)) throw new ErreurAction('requete_invalide', 'Deux champs portent le même nom.');
        noms.add(c.nom);
      }
      const creeLe = maintenant();
      const doc = {
        type: d.type, titre: d.titre, resume: d.resume ?? '',
        champsProposes: d.champs, champsValides: null, lien: d.lien ?? null,
        etat: ETATS.A_VALIDER, creeLe: new Date(creeLe), expireLe: new Date(creeLe + DUREE_VALIDITE_MS),
        valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null,
        tentatives: 0, derniereErreur: null,
        executions: { proposer: d.executionId ?? null, appliquer: null, refuser: null },
        etapes: [], source: 'porte', ecritPar: auteur,
      };
      if (await donnees.creerSiAbsent(chemin(base, d.id), doc)) return { id: d.id, cree: true, etat: doc.etat };
      const existante = await donnees.lireDoc(chemin(base, d.id));
      return { id: d.id, cree: false, etat: existante?.etat ?? null };
    },
  },

  'propositions.lireValidees': {
    ecrit: false,
    schema: { limite: { type: 'nombre', min: 1, max: MAX_LECTURE_VALIDEES } },
    async executer({ base, donnees }, { limite = 50 }) {
      // Un seul filtre (état) et une limite : aucun index composite. On lit toujours le maximum permis puis on trie en mémoire, pour que « limite » garde bien les plus anciennes.
      const liste = await donnees.lister(chemin(base), { etat: ETATS.VALIDEE, limite: MAX_LECTURE_VALIDEES });
      liste.sort((a, b) => (enMs(a.valideeLe) ?? 0) - (enMs(b.valideeLe) ?? 0));
      return { propositions: liste.slice(0, Math.floor(limite)).map(versJson) };
    },
  },

  'propositions.marquerAppliquee': {
    ecrit: true,
    schema: { id: { type: 'idsur', requis: true }, executionId: { type: 'id' } },
    async executer(ctx, { id, executionId }) {
      const p = await transition(ctx, id, (x) => marquerAppliquee(x, { executionId }), ['etat', 'executions', 'derniereErreur']);
      return { id, etat: p.etat };
    },
  },

  'propositions.marquerEchec': {
    ecrit: true,
    schema: { id: { type: 'idsur', requis: true }, erreur: { type: 'texte', max: 1000, min: 1, requis: true } },
    async executer(ctx, { id, erreur }) {
      const p = await transition(ctx, id, (x) => marquerEchec(x, { erreur }), ['etat', 'tentatives', 'derniereErreur']);
      return { id, etat: p.etat, tentatives: p.tentatives };
    },
  },
});
