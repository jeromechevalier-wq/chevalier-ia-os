// Transitions des devis côté serveur (module Devis, voir docs/cadrage-devis.md §5 et §7) : finaliser, changer de statut, nouvelle version, archiver.
// Le navigateur n'a le droit d'écrire un devis que tant qu'il est un brouillon (règles Firestore) : tout le reste passe ici, dans UNE transaction
// (le numéro, le devis figé et la version remplacée sont écrits ensemble, ou pas du tout). Les règles métier sont celles de partage/devis.js
// (copie de js/modules/devis/logique.js) : ce fichier ne calcule rien lui-même.
//
// `donnees` : l'accès aux données (donnees.js) déjà cadré sur le bon espace (racine chez Jérôme, `avecBase` chez un client).
// Qui a le droit d'appeler est contrôlé AVANT, par la fonction appelable (functions/src/devis-appel.js, functions-plateforme/src/devis.js).
// Chaque écriture laisse une ligne dans le journal (crm_audit) et sa copie avant/après (crm_audit_avant), dans la même transaction que la donnée.
//
// Décisions prises seul (nuit du 24/10/2026) :
// - Le compteur de numéros (`devis_compteurs/global`) est lu et incrémenté dans la transaction de la première finalisation : deux finalisations
//   simultanées ne reçoivent jamais le même numéro (Firestore relance la perdante). Un devis invalide ne consomme AUCUN numéro.
// - Accepter une version passe aussi les autres versions vivantes (finalisée ou envoyée) de la même racine à « Remplacé » (cadrage §5).
// - Le journal n'enregistre pas le compteur lui-même (bruit) ; le numéro attribué est dans la copie du devis.
import * as D from '../../partage/devis.js';
import * as A from '../../partage/devis-articles.js';
import * as L from '../../partage/logique.js';
import { COLLECTIONS as C } from './donnees.js';
import { sansId } from './canonique.js';
import { JOURS_COPIES } from './ecriture.js';

export const ID_COMPTEUR = 'global';
export const ID_REGLAGES = A.ID_REGLAGES;
/** Actions de `devisChangerStatut` (les autres transitions ont leur propre fonction). */
export const ACTIONS_STATUT = Object.freeze({
  marquer_envoye: 'envoyeLe',
  accepter: 'accepteLe',
  refuser: 'refuseLe',
});

const CHAMPS_FIGES = ['regimeTva', 'sections', 'statut', 'numero', 'finaliseLe', 'totaux', 'finalisation'];

/** code : introuvable | transition_interdite | brouillon_existant | demande_invalide */
export class ErreurDevis extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ErreurDevis';
    this.code = code;
    this.details = details;
  }
}

const exigerId = (id) => {
  if (typeof id !== 'string' || !id || id.length > 200 || id.includes('/')) throw new ErreurDevis('demande_invalide', 'Identifiant de devis manquant ou invalide.');
  return id;
};
const racineDe = (devis) => devis.racineId ?? devis.id;

/** Les dates lues dans Firestore (Timestamp) deviennent des Date : les copies profondes de partage/devis.js (structuredClone) les gardent ainsi intactes. */
const enDates = (v) => {
  if (v && typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (Array.isArray(v)) return v.map(enDates);
  if (v && typeof v === 'object' && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enDates(x)]));
  return v;
};

async function lireDevis(tx, devisId) {
  const devis = await tx.document(C.devis, exigerId(devisId));
  if (!devis) throw new ErreurDevis('introuvable', `Devis introuvable : ${devisId}`);
  return enDates(devis);
}
const lireVersions = async (tx, devis) => (await tx.liste(C.devis, { champ: 'racineId', valeur: racineDe(devis) })).map(enDates);

/** Lignes de journal d'une série de changements `{ id, action, avant, apres, champs }` (même forme que le moteur d'écriture du MCP). */
function journal({ donnees, ctx, outil, parametres, changements }) {
  const operationId = donnees.nouvelId(C.audit);
  const expireAt = new Date(ctx.maintenant.getTime() + JOURS_COPIES * 86_400_000); // date exigée par le format, inerte (aucune règle d'effacement)
  const ecritures = [];
  changements.forEach((c, i) => {
    const auditId = donnees.nouvelId(C.audit);
    ecritures.push({
      type: 'set', collection: C.audit, id: auditId,
      donnees: {
        operationId, ordre: i + 1, date: ctx.maintenant, acteur: ctx.acteur, jeton: ctx.jeton ?? ctx.acteur, via: ctx.via || 'ecran', outil,
        collection: C.devis, docId: c.id, action: c.action, statut: 'succes', champsModifies: c.champs, parametresRecus: Object.keys(parametres ?? {}).slice(0, 40),
      },
    });
    ecritures.push({
      type: 'set', collection: C.auditAvant, id: auditId,
      donnees: { operationId, collection: C.devis, docId: c.id, avant: sansId(c.avant), apres: sansId(c.apres), expireAt, ...(i === 0 ? { parametres: JSON.stringify(parametres ?? {}).slice(0, 2000) } : {}) },
    });
  });
  return { operationId, ecritures };
}

/** Écritures d'un changement : le document, plus sa ligne de journal. `patch` = champs changés (le reste est conservé). */
function modifier(devis, patch) {
  return { id: devis.id, action: 'modifier', avant: devis, apres: { ...devis, ...patch }, champs: Object.keys(patch), ecriture: { type: 'update', collection: C.devis, id: devis.id, donnees: patch } };
}

/**
 * Fige un brouillon : attribue le numéro, fige prix, TVA et totaux, passe à « Finalisé » (`en_attente_envoi`) et met la version précédente de la même
 * racine à « Remplacé ». Un devis invalide ne change RIEN : on rend `{ ok: false, erreurs }`.
 * Renvoie `{ ok: true, devis, numero, nouveauNumero, remplaces }`.
 */
export async function finaliser({ donnees, ctx, devisId }) {
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (!D.transitionPossible(devis.statut, 'finaliser')) {
      throw new ErreurDevis('transition_interdite', 'Ce devis est déjà finalisé : pour le corriger, crée la version suivante.');
    }
    const erreurs = D.erreursFinalisation(devis);
    if (erreurs.length) return { ok: false, erreurs };
    const reglages = A.reglagesDevis(await tx.document(C.devisParametres, ID_REGLAGES));
    const versions = await lireVersions(tx, devis);

    // Une version 2 ou plus garde le numéro de sa racine (jamais un nouveau numéro).
    let numero = devis.numero ?? versions.find((v) => v.numero)?.numero ?? null;
    const ecritures = [];
    const nouveauNumero = !numero;
    if (nouveauNumero) {
      const compteur = await tx.document(C.devisCompteurs, ID_COMPTEUR);
      const suivant = (Number.isInteger(compteur?.valeur) ? compteur.valeur : 0) + 1;
      numero = D.numeroDevis(L.aujourdhuiParis(ctx.maintenant), suivant);
      ecritures.push({ type: 'set', collection: C.devisCompteurs, id: ID_COMPTEUR, donnees: { valeur: suivant, modifieLe: ctx.maintenant } });
    }

    const fige = D.figerPourFinalisation(devis, { numero, finaliseLe: ctx.maintenant, reglages });
    if (fige.erreurs.length) return { ok: false, erreurs: fige.erreurs };
    const apres = fige.devis;
    // brancher n8n ici (PR suivante) : l'appel sortant se fera APRÈS cette transaction, avec la vue client (D.vueClient) ; en attendant, rien n'est envoyé.
    apres.finalisation = { n8n: 'en_attente' };

    // Seuls les champs que la finalisation change sont écrits (les autres, dates comprises, ne sont pas retouchés).
    // Un client Firestore direct a pu poser archive ou des dates sur le brouillon : on les remet à zéro à la finalisation.
    const remisesAZero = { archive: false, archiveLe: null, envoyeLe: null, accepteLe: null, refuseLe: null, remplaceLe: null };
    const changements = [modifier(devis, { ...Object.fromEntries(CHAMPS_FIGES.map((k) => [k, apres[k]])), ...remisesAZero })];
    // Les versions plus anciennes encore vivantes (finalisée ou envoyée) sont remplacées par celle-ci, dans la même transaction.
    const remplaces = versions.filter((v) => v.id !== devis.id && (v.version ?? 1) < (devis.version ?? 1) && D.transitionPossible(v.statut, 'remplacer'));
    for (const v of remplaces) changements.push(modifier(v, { statut: D.statutApres(v.statut, 'remplacer'), remplaceLe: ctx.maintenant }));

    const j = journal({ donnees, ctx, outil: 'devisFinaliser', parametres: { devisId }, changements });
    tx.ecrire([...ecritures, ...changements.map((c) => c.ecriture), ...j.ecritures]);
    return { ok: true, devis: { ...apres, id: devis.id }, numero, nouveauNumero, remplaces: remplaces.map((v) => v.id), operationId: j.operationId };
  });
}

/** Marquer envoyé, Signé (`accepter`) ou Refusé. Une transition interdite est refusée sans rien écrire. */
export async function changerStatut({ donnees, ctx, devisId, action }) {
  const champDate = ACTIONS_STATUT[action];
  if (!champDate) throw new ErreurDevis('demande_invalide', 'Action inconnue : marquer_envoye, accepter ou refuser.');
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (!D.transitionPossible(devis.statut, action)) {
      throw new ErreurDevis('transition_interdite', `Cette action n'est pas possible pour un devis « ${D.STATUTS_DEVIS.find((s) => s.id === devis.statut)?.libelle ?? devis.statut} ».`);
    }
    const statut = D.statutApres(devis.statut, action);
    const changements = [modifier(devis, { statut, [champDate]: ctx.maintenant })];
    let remplaces = [];
    if (action === 'accepter') {
      // L'acceptation d'une version passe les autres versions vivantes du même numéro à « Remplacé » (cadrage §5).
      const versions = await lireVersions(tx, devis);
      remplaces = versions.filter((v) => v.id !== devis.id && D.transitionPossible(v.statut, 'remplacer'));
      for (const v of remplaces) changements.push(modifier(v, { statut: D.statutApres(v.statut, 'remplacer'), remplaceLe: ctx.maintenant }));
    }
    const j = journal({ donnees, ctx, outil: 'devisChangerStatut', parametres: { devisId, action }, changements });
    tx.ecrire([...changements.map((c) => c.ecriture), ...j.ecritures]);
    return { ok: true, devis: { ...devis, statut, [champDate]: ctx.maintenant }, remplaces: remplaces.map((v) => v.id), operationId: j.operationId };
  });
}

/** Crée le brouillon suivant (même racine, version + 1, même numéro). Refusé depuis un brouillon ou s'il existe déjà un brouillon de la racine. */
export async function nouvelleVersion({ donnees, ctx, devisId }) {
  return donnees.transaction(async (tx) => {
    const source = await lireDevis(tx, devisId);
    if (!D.transitionPossible(source.statut, 'nouvelle_version')) {
      throw new ErreurDevis('transition_interdite', source.statut === 'brouillon'
        ? 'Ce devis est encore un brouillon : modifie-le directement.'
        : 'On ne crée pas de nouvelle version à partir de ce devis.');
    }
    const versions = await lireVersions(tx, source);
    if (versions.some((v) => v.statut === 'brouillon')) {
      throw new ErreurDevis('brouillon_existant', 'Une version en brouillon existe déjà pour ce devis : termine-la ou supprime-la d\'abord.');
    }
    const id = donnees.nouvelId(C.devis);
    const copie = D.nouvelleVersion(source, { id, creeLe: ctx.maintenant });
    copie.version = Math.max(source.version ?? 1, ...versions.map((v) => v.version ?? 1)) + 1; // jamais deux versions de même numéro
    copie.creePar = ctx.acteur;
    delete copie.archiveLe;
    delete copie.remplaceLe;
    const j = journal({
      donnees, ctx, outil: 'devisNouvelleVersion', parametres: { devisId },
      changements: [{ id, action: 'creer', avant: null, apres: copie, champs: Object.keys(copie) }],
    });
    // La source est aussi écrite (champ anodin) : deux demandes simultanées lisent et écrivent le même document, la perdante est relancée et voit le brouillon de la première.
    tx.ecrire([
      { type: 'update', collection: C.devis, id: source.id, donnees: { versionSuivanteCreeLe: ctx.maintenant } },
      { type: 'set', collection: C.devis, id, donnees: sansId(copie) },
      ...j.ecritures,
    ]);
    return { ok: true, devis: { ...copie, id }, operationId: j.operationId };
  });
}

/** Pose (`archive: true`) ou retire (`archive: false`) le drapeau d'archive. Poser : seulement sur un devis Signé ou Refusé. */
export async function archiver({ donnees, ctx, devisId, archive }) {
  if (typeof archive !== 'boolean') throw new ErreurDevis('demande_invalide', 'Précise si le devis doit être archivé ou non.');
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (archive && !D.peutArchiver(devis)) {
      throw new ErreurDevis('transition_interdite', devis.archive === true ? 'Ce devis est déjà archivé.' : 'Seul un devis signé ou refusé peut être archivé.');
    }
    if (!archive && devis.archive !== true) throw new ErreurDevis('transition_interdite', 'Ce devis n\'est pas archivé.');
    const patch = { archive, archiveLe: archive ? ctx.maintenant : null };
    const changement = modifier(devis, patch);
    const j = journal({ donnees, ctx, outil: 'devisArchiver', parametres: { devisId, archive }, changements: [changement] });
    tx.ecrire([changement.ecriture, ...j.ecritures]);
    return { ok: true, devis: { ...devis, ...patch }, operationId: j.operationId };
  });
}

// ---------------------------------------------------------------- pour les fonctions appelables (les deux projets)
/** Quelle transition, avec quels arguments tirés de la demande. `base` : { donnees, ctx }. */
export const OPERATIONS = Object.freeze({
  finaliser: (base, d) => finaliser({ ...base, devisId: d.devisId }),
  changerStatut: (base, d) => changerStatut({ ...base, devisId: d.devisId, action: d.action }),
  nouvelleVersion: (base, d) => nouvelleVersion({ ...base, devisId: d.devisId }),
  archiver: (base, d) => archiver({ ...base, devisId: d.devisId, archive: d.archive }),
});

/** Ce que l'appelant reçoit : jamais le devis entier (son navigateur le lit déjà). Un devis refusé rend les messages à corriger, rien n'a été écrit. */
export function reponsePublique(r) {
  if (!r.ok) return { ok: false, erreurs: r.erreurs };
  return { ok: true, devisId: r.devis.id, statut: r.devis.statut, numero: r.devis.numero ?? null, ...(r.nouveauNumero !== undefined ? { nouveauNumero: r.nouveauNumero } : {}), operationId: r.operationId };
}
