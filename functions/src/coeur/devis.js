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
// - Montant de l'affaire (29/10/2026, règle D17, expliquée dans docs/montant-affaire.md) : le montant calculé d'après les devis (somme HT des acceptés, sinon le HT du devis proposé le plus récent)
//   est écrit dans `montantDevisHt` et `montantDevisNature` de l'affaire, DANS la transaction de chaque transition qui peut le changer (finaliser, changer de statut, archiver ; ni « nouvelle version » ni « supprimer » : un brouillon ne compte jamais). Un brouillon ne compte
//   jamais : il est écrit par le navigateur, hors de ces transactions. Le montant saisi à la main (`montant`) n'est jamais touché. Aucune migration : une affaire n'est recalculée que lorsqu'un de ses devis change.
import * as D from '../../partage/devis.js';
import * as A from '../../partage/devis-articles.js';
import * as L from '../../partage/logique.js';
import { COLLECTIONS as C } from './donnees.js';
import { sansId } from './canonique.js';
import { JOURS_COPIES } from './ecriture.js';
import { ecrituresUsage, usageDepuisLesDevis, idValable } from './usage-articles.js';

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

export async function lireDevis(tx, devisId) {
  const devis = await tx.document(C.devis, exigerId(devisId));
  if (!devis) throw new ErreurDevis('introuvable', `Devis introuvable : ${devisId}`);
  return enDates(devis);
}
const lireVersions = async (tx, devis) => (await tx.liste(C.devis, { champ: 'racineId', valeur: racineDe(devis) })).map(enDates);

/** Lignes de journal d'une série de changements `{ id, action, avant, apres, champs }` (même forme que le moteur d'écriture du MCP). */
export function journal({ donnees, ctx, outil, parametres, changements }) {
  const operationId = donnees.nouvelId(C.audit);
  const expireAt = new Date(ctx.maintenant.getTime() + JOURS_COPIES * 86_400_000); // date exigée par le format, inerte (aucune règle d'effacement)
  const ecritures = [];
  changements.forEach((c, i) => {
    const auditId = donnees.nouvelId(C.audit);
    ecritures.push({
      type: 'set', collection: C.audit, id: auditId,
      donnees: {
        operationId, ordre: i + 1, date: ctx.maintenant, acteur: ctx.acteur, jeton: ctx.jeton ?? ctx.acteur, via: ctx.via || 'ecran', outil,
        collection: c.collection ?? C.devis, docId: c.id, action: c.action, statut: 'succes', champsModifies: c.champs, parametresRecus: Object.keys(parametres ?? {}).slice(0, 40),
      },
    });
    ecritures.push({
      type: 'set', collection: C.auditAvant, id: auditId,
      donnees: { operationId, collection: c.collection ?? C.devis, docId: c.id, avant: sansId(c.avant), apres: sansId(c.apres), expireAt, ...(i === 0 ? { parametres: JSON.stringify(parametres ?? {}).slice(0, 2000) } : {}) },
    });
  });
  return { operationId, ecritures };
}

/** Écritures d'un changement : le document, plus sa ligne de journal. `patch` = champs changés (le reste est conservé). */
export function modifier(devis, patch, collection = C.devis) {
  return { id: devis.id, collection, action: 'modifier', avant: devis, apres: { ...devis, ...patch }, champs: Object.keys(patch), ecriture: { type: 'update', collection, id: devis.id, donnees: patch } };
}

/**
 * Modification d'un brouillon décidée à partir du devis lu DANS la transaction (aucune fenêtre de course avec l'écran) : `calculer(tx, devis)` rend `{ patch, reponse }`
 * (ou refuse en levant : rien n'est alors écrit) ; le devis et UNE ligne de journal (un seul operationId) sont écrits ensemble. Utilisée par modifier_lignes_devis.
 */
export async function modifierEnTransaction({ donnees, ctx, devisId, outil, parametres, calculer }) {
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    const { patch, reponse } = await calculer(tx, devis);
    const changements = [modifier(devis, patch)];
    const j = journal({ donnees, ctx, outil, parametres, changements });
    tx.ecrire([...changements.map((x) => x.ecriture), ...j.ecritures]);
    return { operationId: j.operationId, reponse: { ...reponse, operationId: j.operationId } };
  });
}

/**
 * Écriture du montant calculé d'après les devis dans l'affaire du devis (`montantDevisHt` + `montantDevisNature` + `montantDevisDetail`), ou null s'il n'y a rien à changer (pas d'affaire, affaire supprimée, mêmes valeurs).
 * `retouches` : { idDevis: champs | null } = ce que la transaction en cours change sur ses devis (null : le devis disparaît), appliqué en mémoire avant le calcul (les écritures ne partent qu'à la fin).
 * À appeler AVANT `tx.ecrire` (Firestore veut toutes les lectures d'abord). Ne crée jamais l'affaire. Règle : `montantDesDevis` (partage/devis.js).
 */
/** Même détail ? Comparé ligne par ligne, champ par champ : Firestore range les champs d'une map par nom, un JSON.stringify verrait une différence à chaque fois. */
const memeDetail = (a, b) => {
  const x = Array.isArray(a) ? a : null;
  const y = Array.isArray(b) ? b : null;
  if (!x || !y) return x === y;
  return x.length === y.length && x.every((l, i) => l?.numero === y[i].numero && l?.version === y[i].version && l?.ht === y[i].ht && l?.compte === y[i].compte);
};

async function montantDeLAffaire(tx, devis, retouches) {
  const affaireId = devis.affaireId;
  if (typeof affaireId !== 'string' || !affaireId || affaireId.includes('/')) return null;
  const affaire = await tx.document(C.affaires, affaireId);
  if (!affaire) return null;
  const liste = (await tx.liste(C.devis, { champ: 'affaireId', valeur: affaireId })).map(enDates);
  if (devis.id && !liste.some((d) => d.id === devis.id) && retouches[devis.id] !== null) liste.push(devis);
  const calcule = D.montantDesDevis(liste.filter((d) => retouches[d.id] !== null).map((d) => ({ ...d, ...(retouches[d.id] ?? {}) })));
  const patch = { montantDevisHt: calcule?.montant ?? null, montantDevisNature: calcule?.nature ?? null, montantDevisDetail: calcule?.detail ?? null };
  const meme = (typeof affaire.montantDevisHt === 'number' ? affaire.montantDevisHt : null) === patch.montantDevisHt && (affaire.montantDevisNature ?? null) === patch.montantDevisNature
    && memeDetail(affaire.montantDevisDetail, patch.montantDevisDetail);
  return meme ? null : modifier(affaire, patch, C.affaires);
}
/** Les retouches d'une transaction : le patch de chaque changement de devis (les lignes d'une autre collection n'en font pas partie). */
const retouchesDe = (changements) => Object.fromEntries(changements.filter((c) => c.collection === C.devis).map((c) => [c.id, c.ecriture.donnees]));

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
    const remisesAZero = { archive: false, archiveLe: null, envoyeLe: null, accepteLe: null, refuseLe: null, remplaceLe: null, pdf: null, envois: null, emailPrepare: null };
    const changements = [modifier(devis, { ...Object.fromEntries(CHAMPS_FIGES.map((k) => [k, apres[k]])), ...remisesAZero })];
    // Les versions plus anciennes encore vivantes (finalisée ou envoyée) sont remplacées par celle-ci, dans la même transaction.
    const remplaces = versions.filter((v) => v.id !== devis.id && (v.version ?? 1) < (devis.version ?? 1) && D.transitionPossible(v.statut, 'remplacer'));
    for (const v of remplaces) changements.push(modifier(v, { statut: D.statutApres(v.statut, 'remplacer'), remplaceLe: ctx.maintenant }));
    // Le devis finalisé devient « proposé » : le montant de l'affaire le suit (règle D17), dans la même transaction.
    const montant = await montantDeLAffaire(tx, devis, retouchesDe(changements));
    if (montant) changements.push(montant);

    // Compteur d'usage des articles (cadrage vocabulaire-cibles, 2.9) : dans la MÊME transaction, sans ligne de journal (comme le compteur de numéros). Les lectures se font ici, avant l'écriture unique.
    ecritures.push(...await ecrituresUsage(tx, { devis: apres, versions, maintenant: ctx.maintenant }));

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
    // Un devis archivé ne change plus de statut (un finalisé archivé, passé à Signé, serait ignoré par le montant de l'affaire) : on le sort des archives d'abord.
    if (devis.archive === true) throw new ErreurDevis('transition_interdite', 'Ce devis est archivé : sors-le des archives avant de changer son statut.');
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
    // Envoyé, signé ou refusé : le montant de l'affaire suit (règle D17), dans la même transaction.
    const montant = await montantDeLAffaire(tx, devis, retouchesDe(changements));
    if (montant) changements.push(montant);
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
    // Le nouveau brouillon ne compte jamais dans le montant de l'affaire (règle D17) et la source ne change pas de statut : rien à recalculer ici.
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
    delete copie.pdf;
    delete copie.envois; // l'historique des envois par e-mail reste sur la version envoyée
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

/** Pose (`archive: true`) ou retire (`archive: false`) le drapeau d'archive. Poser : seulement sur un devis Finalisé (jamais envoyé), Signé ou Refusé. */
export async function archiver({ donnees, ctx, devisId, archive }) {
  if (typeof archive !== 'boolean') throw new ErreurDevis('demande_invalide', 'Précise si le devis doit être archivé ou non.');
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (archive && !D.peutArchiver(devis)) {
      throw new ErreurDevis('transition_interdite', devis.archive === true ? 'Ce devis est déjà archivé.' : 'Seul un devis finalisé, signé ou refusé peut être archivé.');
    }
    if (!archive && devis.archive !== true) throw new ErreurDevis('transition_interdite', 'Ce devis n\'est pas archivé.');
    const patch = { archive, archiveLe: archive ? ctx.maintenant : null };
    const changement = modifier(devis, patch);
    // Un devis accepté archivé ne compte plus dans le montant de l'affaire ; désarchivé, il compte de nouveau (règle D17).
    const montant = await montantDeLAffaire(tx, devis, { [devis.id]: patch });
    const changements = montant ? [changement, montant] : [changement];
    const j = journal({ donnees, ctx, outil: 'devisArchiver', parametres: { devisId, archive }, changements });
    tx.ecrire([...changements.map((c) => c.ecriture), ...j.ecritures]);
    return { ok: true, devis: { ...devis, ...patch }, operationId: j.operationId };
  });
}

/**
 * Supprime un BROUILLON (jamais un devis finalisé : il a un numéro, des documents et des versions liées). La copie « avant » reste dans le journal
 * (crm_audit_avant) : un devis supprimé par erreur peut être retrouvé et rétabli avec `restaurer_depuis_audit`.
 * Supprimer un brouillon ne touche JAMAIS aux documents de l'affaire ni aux fichiers du stockage (décision de Jérôme, 26/10/2026) : un « Devis brouillon – … .pdf » déjà joint à l'affaire y reste.
 */
export async function supprimer({ donnees, ctx, devisId }) {
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (devis.statut !== 'brouillon') throw new ErreurDevis('transition_interdite', 'Seul un brouillon peut être supprimé. Un devis finalisé se garde ; tu peux l’archiver s’il est finalisé (jamais envoyé), signé ou refusé.');
    const changement = { id: devis.id, collection: C.devis, action: 'supprimer', avant: devis, apres: null, champs: [], ecriture: { type: 'delete', collection: C.devis, id: devis.id } };
    // Un brouillon ne compte jamais dans le montant de l'affaire (règle D17) : supprimer ne touche pas à l'affaire, et l'opération reste restaurable par le journal.
    const j = journal({ donnees, ctx, outil: 'devisSupprimer', parametres: { devisId }, changements: [changement] });
    tx.ecrire([changement.ecriture, ...j.ecritures]);
    return { ok: true, devis, operationId: j.operationId };
  });
}

// ---------------------------------------------------------------- historique des envois par e-mail (25/10/2026)
// L'appli crée un brouillon Gmail dans la boîte de l'utilisateur ; c'est LUI qui l'envoie. Après son clic « Marquer comme envoyé », l'écran appelle
// `changerStatut` (statut « Envoyé », `envoyeLe` = date du PREMIER envoi) puis cette opération, qui AJOUTE une ligne à `envois` : { date, destinataires, copie }.
// Un renvoi garde donc les deux dates. Le navigateur n'écrit jamais `envois` (les règles Firestore ne lui laissent que le brouillon) : tout passe ici, journal compris.
export const MAX_ENVOIS = 100;
export const MAX_ADRESSES_ENVOI = 10;
/** D'où est parti l'e-mail enregistré (29/10/2026, sans migration : les anciennes lignes n'ont pas ce champ). Le logiciel ne fait que PRÉPARER un brouillon ; l'envoi est toujours fait par la personne. */
export const ORIGINES_ENVOI = Object.freeze(['brouillon_logiciel', 'hors_logiciel']);

/** Liste d'adresses nettoyée (espaces ôtés, doublons ignorés sans tenir compte de la casse). Une adresse invalide refuse toute la demande. */
function adressesDeEnvoi(valeur, { nom, minimum }) {
  if (valeur === undefined || valeur === null) valeur = [];
  if (!Array.isArray(valeur)) throw new ErreurDevis('demande_invalide', `${nom} : une liste d'adresses e-mail est attendue.`);
  const vues = new Set();
  const liste = [];
  for (const brute of valeur) {
    if (typeof brute !== 'string' || brute.length > 254) throw new ErreurDevis('demande_invalide', `${nom} : une adresse e-mail n'est pas valide.`);
    const a = brute.trim();
    if (D.emailValide(a) && !(/^[\x21-\x7e]+$/.test(a) && !/[()"<>\\,]/.test(a.slice(0, a.lastIndexOf('@'))))) throw new ErreurDevis('demande_invalide', `${nom} : l'adresse « ${a.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60)} » contient des caractères que Gmail n'accepte pas ici.`);
    if (!D.emailValide(a) || /[\u0000-\u001f\u007f]/.test(a)) throw new ErreurDevis('demande_invalide', `${nom} : l'adresse « ${a.slice(0, 60)} » n'est pas valide.`);
    if (vues.has(a.toLowerCase())) continue;
    vues.add(a.toLowerCase());
    liste.push(a);
  }
  if (liste.length < minimum) throw new ErreurDevis('demande_invalide', `${nom} : au moins une adresse e-mail est nécessaire.`);
  if (liste.length > MAX_ADRESSES_ENVOI) throw new ErreurDevis('demande_invalide', `${nom} : ${MAX_ADRESSES_ENVOI} adresses au plus.`);
  return liste;
}

/** Ajoute un envoi à l'historique d'un devis « Envoyé ». Le statut ne change pas (c'est `changerStatut` qui le pose) et `envoyeLe` garde la date du premier envoi. */
export async function enregistrerEnvoi({ donnees, ctx, devisId, destinataires, copie, origine }) {
  if (origine !== undefined && origine !== null && !ORIGINES_ENVOI.includes(origine)) throw new ErreurDevis('demande_invalide', `Origine de l'envoi : « ${ORIGINES_ENVOI.join(' » ou « ')} » attendu.`);
  const a = adressesDeEnvoi(destinataires, { nom: 'Destinataires', minimum: 1 });
  const cc = adressesDeEnvoi(copie, { nom: 'Copie', minimum: 0 }).filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()));
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (devis.statut !== 'envoye') throw new ErreurDevis('transition_interdite', 'Marque d\'abord le devis comme envoyé : l\'historique des envois ne se tient que pour un devis envoyé.');
    const avant = Array.isArray(devis.envois) ? devis.envois : [];
    if (avant.length >= MAX_ENVOIS) throw new ErreurDevis('transition_interdite', `L'historique des envois est plein (${MAX_ENVOIS} envois).`);
    const envois = [...avant, { date: ctx.maintenant, destinataires: a, copie: cc, ...(origine ? { origine } : {}) }];
    const changement = modifier(devis, { envois });
    const j = journal({ donnees, ctx, outil: 'devisEnregistrerEnvoi', parametres: { devisId, destinataires: a, copie: cc, ...(origine ? { origine } : {}) }, changements: [changement] });
    tx.ecrire([changement.ecriture, ...j.ecritures]);
    return { ok: true, devis: { ...devis, envois }, operationId: j.operationId };
  });
}

/**
 * Change le destinataire et la copie d'un devis FINALISÉ ou ENVOYÉ (décision de Jérôme, 29/10/2026, option A) : ces deux champs ne sont pas imprimés sur le PDF et ne changent
 * pas le contenu du devis, mais sans eux « Préparer l'e-mail » est impossible et un devis finalisé ne se modifie plus. N'écrit QUE `destinataires` et `copie` ; le journal garde l'avant et l'après.
 */
export async function modifierDestinataires({ donnees, ctx, devisId, destinataires, copie }) {
  const a = adressesDeEnvoi(destinataires, { nom: 'Destinataires', minimum: 1 });
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (!['en_attente_envoi', 'envoye'].includes(devis.statut)) throw new ErreurDevis('transition_interdite', devis.statut === 'brouillon'
      ? 'Ce devis est encore un brouillon : change son destinataire directement dans le devis.'
      : 'Le destinataire ne se change que sur un devis finalisé ou envoyé.');
    // Copie non donnée : celle du devis reste TELLE QUELLE (non revalidée : la finalisation l'a déjà acceptée), sans l'adresse devenue destinataire. Donnée : validée, elle remplace l'ancienne.
    const existante = (Array.isArray(devis.copie) ? devis.copie : []).map((x) => String(typeof x === 'string' ? x : x?.email ?? '').trim()).filter(Boolean);
    const cc = (copie === undefined ? existante : adressesDeEnvoi(copie, { nom: 'Copie', minimum: 0 })).filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()));
    const changement = modifier(devis, { destinataires: a, copie: cc });
    const j = journal({ donnees, ctx, outil: 'devisModifierDestinataires', parametres: { devisId, destinataires: a, copie: cc }, changements: [changement] });
    tx.ecrire([changement.ecriture, ...j.ecritures]);
    return { ok: true, devis: { ...devis, destinataires: a, copie: cc }, operationId: j.operationId };
  });
}

// ---------------------------------------------------------------- PDF du devis (25/10/2026) : états, idempotence. Le PDF vit dans l'onglet « Devis » de l'affaire : le serveur n'ajoute plus rien aux Documents de l'affaire (décision de Jérôme, 27/10/2026)
// Le PDF d'un devis finalisé est fabriqué par le serveur (déclencheur Firestore ou demande explicite), jamais par le navigateur. Le champ `pdf` du devis dit où on en est :
//   pdf = { statut: 'en_cours' | 'ok' | 'echec', tentatives, demarreLe?, chemin?, sha256?, nom?, genereLe?, message?, echecLe? }
// La finalisation ne dépend JAMAIS du PDF : un échec laisse le devis finalisé, avec `pdf.statut = 'echec'` (l'écran affichera plus tard une alerte tant que `pdf.statut !== 'ok'`).
// Écrire `pdf` ne change pas le statut du devis : le déclencheur (brouillon -> finalisé) ne se relance donc jamais sur ces écritures.
export const TENTATIVES_AUTO_MAX = 3;
/** Un « en cours » plus vieux que cela est abandonné (la fonction a planté ou dépassé son délai) : la fabrication peut recommencer. */
export const DELAI_EN_COURS_MS = 10 * 60_000;

/** Message court pour `pdf.message` : pas de HTML, pas de chemin (ni « / »), 200 caractères au plus. */
export function messagePdfCourt(m) {
  const t = String(m ?? '').replace(/[<>]/g, '').replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return t || 'La fabrication du PDF a échoué.';
}

/** Un devis finalisé dont le PDF n'est pas prêt : l'écran affichera l'avertissement (et le bouton « Réessayer »). */
export const pdfAReessayer = (devis) => !!devis && devis.statut !== 'brouillon' && devis.pdf?.statut !== 'ok';

/**
 * Premier temps de la fabrication : décide, dans une transaction, si ce passage fabrique le PDF (un seul à la fois, un seul par devis).
 *  - PDF déjà « ok » : rien à faire (`action: 'rien'`, on renvoie le même) ;
 *  - « en_cours » depuis moins de DELAI_EN_COURS_MS : rien à faire, ni refus ni seconde fabrication ;
 *  - absent ou « echec » : on fabrique, sauf si les tentatives automatiques ont atteint le maximum (échec définitif jusqu'à une demande explicite).
 * `explicite` (demande de l'utilisateur) remet le compteur à zéro. Un brouillon est refusé. Rien d'autre que `pdf` n'est écrit.
 */
export async function reserverPdf({ donnees, ctx, devisId, explicite = false, tentativesMax = TENTATIVES_AUTO_MAX }) {
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (devis.statut === 'brouillon') throw new ErreurDevis('transition_interdite', 'Ce devis est encore un brouillon : finalise-le avant de créer le PDF.');
    const pdf = devis.pdf ?? null;
    if (pdf?.statut === 'ok') return { action: 'rien', statut: 'ok', devis };
    const age = pdf?.demarreLe instanceof Date ? ctx.maintenant.getTime() - pdf.demarreLe.getTime() : Infinity;
    if (pdf?.statut === 'en_cours' && Math.abs(age) < DELAI_EN_COURS_MS) return { action: 'rien', statut: 'en_cours', devis };
    const avant = explicite ? 0 : (Number.isInteger(pdf?.tentatives) ? pdf.tentatives : 0);
    if (!explicite && avant >= tentativesMax) return { action: 'rien', statut: 'echec', definitif: true, devis };
    const suivant = { statut: 'en_cours', tentatives: avant + 1, demarreLe: ctx.maintenant };
    tx.ecrire([modifier(devis, { pdf: suivant }).ecriture]);
    return { action: 'fabriquer', statut: 'en_cours', tentatives: avant + 1, devis: { ...devis, pdf: suivant } };
  });
}

/** Dernier temps (succès) : `pdf = ok` + journal, en UNE transaction. N'écrit rien dans l'affaire. Un PDF déjà « ok » n'est jamais réécrit. */
export async function terminerPdf({ donnees, ctx, devisId, chemin, sha256, libelle }) {
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (devis.statut === 'brouillon') throw new ErreurDevis('transition_interdite', 'Ce devis est encore un brouillon : finalise-le avant de créer le PDF.');
    if (devis.pdf?.statut === 'ok') return { ok: true, deja: true, devis };
    const pdf = { statut: 'ok', chemin, sha256, nom: libelle, tentatives: Number.isInteger(devis.pdf?.tentatives) ? devis.pdf.tentatives : 1, genereLe: ctx.maintenant };
    const changement = modifier(devis, { pdf });
    const j = journal({ donnees, ctx, outil: 'devisPdf', parametres: { devisId }, changements: [changement] });
    tx.ecrire([changement.ecriture, ...j.ecritures]);
    return { ok: true, deja: false, devis: { ...devis, pdf }, operationId: j.operationId };
  });
}

/** Dernier temps (échec) : `pdf = echec` avec un message court. Le devis reste finalisé. Un PDF déjà « ok » n'est jamais écrasé. */
export async function echouerPdf({ donnees, ctx, devisId, message }) {
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    if (devis.pdf?.statut === 'ok') return { ok: true, deja: true, devis };
    const pdf = { statut: 'echec', message: messagePdfCourt(message), tentatives: Number.isInteger(devis.pdf?.tentatives) ? devis.pdf.tentatives : 1, echecLe: ctx.maintenant };
    const changement = modifier(devis, { pdf });
    const j = journal({ donnees, ctx, outil: 'devisPdf', parametres: { devisId }, changements: [changement] });
    tx.ecrire([changement.ecriture, ...j.ecritures]);
    return { ok: true, deja: false, devis: { ...devis, pdf }, operationId: j.operationId };
  });
}

/** Nombre maximum d'affaires corrigées par appel (au-delà : un nouvel aperçu, un nouveau code). */
export const MAX_RECALCUL = 50;
const montantLu = (a) => ({ ht: typeof a.montantDevisHt === 'number' ? a.montantDevisHt : null, nature: a.montantDevisNature ?? null });

/**
 * Recalcul général du montant des affaires d'après leurs devis (règle D17, docs/montant-affaire.md) pour celles que le serveur n'a pas encore calculées
 * (devis envoyé avant la règle) ou dont le calcul est périmé. N'écrit QUE `montantDevisHt`, `montantDevisNature` et `montantDevisDetail` ; le montant saisi n'est jamais touché.
 * Idempotent : une affaire déjà à jour n'est ni écrite ni journalisée. `appliquer: false` : aperçu, rien n'est écrit. Une transaction et une ligne de journal par affaire.
 * Rend `{ total, lignes: [{ affaireId, avant, apres, nature }], operations }` (`lignes` : les MAX_RECALCUL premières, par identifiant).
 */
export async function recalculerMontantsAffaires({ donnees, ctx, appliquer = false, affaireIds = null }) {
  const aCorriger = new Map();
  if (Array.isArray(affaireIds)) {
    // Écriture d'après un aperçu fait dans le même appel : on ne reprend que ces affaires (chacune est relue dans sa transaction, et rien n'est écrit si elle est déjà à jour).
    for (const affaireId of affaireIds) aCorriger.set(affaireId, { affaireId });
  } else {
    const ids = new Set();
    for (const d of await donnees.liste(C.devis)) if (typeof d.affaireId === 'string' && d.affaireId && !d.affaireId.includes('/')) ids.add(d.affaireId);
    for (const a of await donnees.liste(C.affaires)) if (a.montantDevisNature != null || a.montantDevisHt != null) ids.add(a.id); // un calcul périmé (plus aucun devis) se remet à zéro aussi
    for (const affaireId of [...ids].sort()) {
      await donnees.transaction(async (tx) => {
        const changement = await montantDeLAffaire(tx, { id: null, affaireId }, {});
        if (changement) aCorriger.set(affaireId, { affaireId, avant: montantLu(changement.avant), apres: { ht: changement.apres.montantDevisHt, nature: changement.apres.montantDevisNature } });
      });
    }
  }
  const total = aCorriger.size;
  const lignes = [...aCorriger.values()].slice(0, MAX_RECALCUL);
  const operations = [];
  if (appliquer) {
    for (const { affaireId } of lignes) {
      // L'identifiant d'opération est RENDU par la transaction (Firestore la rejoue en cas de contention : un effet de bord dans la fonction compterait des opérations jamais écrites).
      const operationId = await donnees.transaction(async (tx) => {
        const changement = await montantDeLAffaire(tx, { id: null, affaireId }, {});
        if (!changement) return null;
        const j = journal({ donnees, ctx, outil: 'devisRecalculMontant', parametres: { affaireId }, changements: [changement] });
        tx.ecrire([changement.ecriture, ...j.ecritures]);
        return j.operationId;
      });
      if (operationId) operations.push(operationId);
    }
  }
  return { total, lignes, operations };
}

/** Nombre maximum de documents d'usage écrits par transaction du recalcul (la limite de Firestore est de 500 écritures). */
export const LOT_RECALCUL = 100;
/** Nombre de lignes listées dans l'aperçu du recalcul du compteur d'usage. */
export const MAX_APERCU = 50;

/**
 * Recalcul du compteur d'après les devis existants. `appliquer: false` (par défaut) : APERÇU, rien n'est écrit.
 * `appliquer: true` : écrit les documents d'usage qui diffèrent (par lots, `set`), UNIQUEMENT la collection d'usage, jamais un devis. Un document d'usage dont l'article n'est plus compté passe à 0.
 * Idempotent : un document déjà juste n'est pas réécrit. À lancer quand aucune finalisation n'est en cours (le recalcul remplace la valeur, il n'ajoute pas).
 * Rend `{ total, lignes: [{ articleId, avant, apres }], ecrits, ignores }` (`ignores` : compteurs qui ont bougé depuis l'aperçu, sautés : relancer) (`lignes` : les MAX_APERCU premières, par identifiant).
 */
export async function recalculerUsageArticles({ donnees, ctx, appliquer = false }) {
  const voulu = usageDepuisLesDevis(await donnees.liste(C.devis));
  const existants = new Map((await donnees.liste(C.devisUsageArticles)).map((u) => [u.id, u]));
  const diffs = [];
  for (const id of [...new Set([...voulu.keys(), ...existants.keys()])].sort()) {
    if (!idValable(id)) continue;
    const apres = voulu.get(id)?.nombre ?? 0;
    const avant = Number.isInteger(existants.get(id)?.nombre) ? existants.get(id).nombre : 0;
    if (apres !== avant) diffs.push({ articleId: id, avant, apres, derniereUtilisationLe: voulu.get(id)?.derniereUtilisationLe ?? existants.get(id)?.derniereUtilisationLe ?? null });
  }
  const lignes = diffs.slice(0, MAX_APERCU).map(({ articleId, avant, apres }) => ({ articleId, avant, apres }));
  let ecrits = 0;
  let ignores = 0;
  if (appliquer) {
    for (let i = 0; i < diffs.length; i += LOT_RECALCUL) {
      const lot = diffs.slice(i, i + LOT_RECALCUL);
      // Chaque document est RELU dans la transaction : si une finalisation est passée depuis l'aperçu (le nombre n'est plus celui de l'aperçu), on ne l'écrase pas, on le saute (Firestore relance si le document bouge pendant la transaction).
      const ecritsLot = await donnees.transaction(async (tx) => {
        const courants = await Promise.all(lot.map((x) => tx.document(C.devisUsageArticles, x.articleId)));
        const aEcrire = lot.filter((x, k) => (Number.isInteger(courants[k]?.nombre) ? courants[k].nombre : 0) === x.avant);
        tx.ecrire(aEcrire.map((x) => ({ type: 'set', collection: C.devisUsageArticles, id: x.articleId, donnees: { articleId: x.articleId, nombre: x.apres, derniereUtilisationLe: x.derniereUtilisationLe } })));
        return aEcrire.length;
      });
      ecrits += ecritsLot;
      ignores += lot.length - ecritsLot;
    }
  }
  return { total: diffs.length, lignes, ecrits, ignores };
}

// ---------------------------------------------------------------- pour les fonctions appelables (les deux projets)
/** Quelle transition, avec quels arguments tirés de la demande. `base` : { donnees, ctx }. */
export const OPERATIONS = Object.freeze({
  finaliser: (base, d) => finaliser({ ...base, devisId: d.devisId }),
  changerStatut: (base, d) => changerStatut({ ...base, devisId: d.devisId, action: d.action }),
  nouvelleVersion: (base, d) => nouvelleVersion({ ...base, devisId: d.devisId }),
  archiver: (base, d) => archiver({ ...base, devisId: d.devisId, archive: d.archive }),
  supprimer: (base, d) => supprimer({ ...base, devisId: d.devisId }),
  enregistrerEnvoi: (base, d) => enregistrerEnvoi({ ...base, devisId: d.devisId, destinataires: d.destinataires, copie: d.copie, origine: d.origine }),
  modifierDestinataires: (base, d) => modifierDestinataires({ ...base, devisId: d.devisId, destinataires: d.destinataires, copie: d.copie }),
});

/** Ce que l'appelant reçoit : jamais le devis entier (son navigateur le lit déjà). Un devis refusé rend les messages à corriger, rien n'a été écrit. */
export function reponsePublique(r) {
  if (!r.ok) return { ok: false, erreurs: r.erreurs };
  return { ok: true, devisId: r.devis.id, statut: r.devis.statut, numero: r.devis.numero ?? null, ...(r.nouveauNumero !== undefined ? { nouveauNumero: r.nouveauNumero } : {}), operationId: r.operationId };
}
