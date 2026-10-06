// Moteur d'écriture du serveur MCP : exécute une liste d'écritures en laissant une trace (audit en trois lots, plan-mcp.md 5.2).
//
//  Lot 1  lignes d'audit « en_cours » + copies « avant/après » (crm_audit_avant). Si ce lot échoue, AUCUNE donnée n'est écrite.
//  Lot 2  écritures de données, par paquets de 400 (comme l'écran), chaque paquet vérifié contre l'état lu au départ (conflit = refus).
//  Lot 3  lignes d'audit passées à « succes » (ou « echec » + message court). La réponse n'est rendue qu'après.
//
// Si le serveur s'arrête entre les lots 1 et 3, la ligne reste « en_cours » : lire_audit la signale (« à vérifier »).
// Une écriture est décrite par une opération :
//   { type: 'creer', collection, id?, donnees }        nouveau document (identifiant fourni ou tiré)
//   { type: 'modifier', collection, id, patch }        champs à changer (le reste est conservé)
//   { type: 'supprimer', collection, id }
//   { type: 'remplacer', collection, id, donnees|null } rétablir un état exact (restauration) ; null = supprimer
// Marques demandées par les règles métier (voir logique.js) : `horodater: [champs]` reçoivent l'heure de l'appel,
// `signer: [champs]` reçoivent l'acteur. `via` (canal) est posé sur chaque document CRÉÉ.
import { COLLECTIONS as C } from './donnees.js';
import { sansId } from './canonique.js';

/** Collections de données du CRM que le moteur a le droit d'écrire (jamais l'audit, les limites ni les paramètres). */
export const COLLECTIONS_ECRITES = [C.personnes, C.organisations, C.affaires, C.activites, C.notes, C.evenements, C.projets, C.projetsTaches, C.projetsModeles];
export const MAX_ECRITURES = 1000;
export const TAILLE_PAQUET_DONNEES = 400;
export const TAILLE_PAQUET_AUDIT = 200; // deux documents par ligne : 400 documents par lot
export const JOURS_COPIES = 90;
export const MAX_PARAMETRES = 2000;

/** code : plan_invalide | introuvable | conflit | audit_indisponible | ecriture_echouee | copie_expiree | restauration_refusee */
export class ErreurEcriture extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ErreurEcriture';
    this.code = code;
    this.details = details;
  }
}

const court = (e) => String(e?.message || e).replace(/\s+/g, ' ').slice(0, 200);
const paquets = (liste, taille) => Array.from({ length: Math.ceil(liste.length / taille) }, (_, i) => liste.slice(i * taille, (i + 1) * taille));

function tronquer(parametres) {
  let texte;
  try { texte = JSON.stringify(parametres ?? {}); } catch { texte = '{}'; }
  return texte.length > MAX_PARAMETRES ? `${texte.slice(0, MAX_PARAMETRES)}…` : texte;
}

/** Applique les marques (horodatage, acteur, canal) d'une opération et rend { donnees|patch } définitifs. */
function resoudre(op, ctx) {
  const marques = {};
  for (const champ of op.horodater || []) marques[champ] = ctx.maintenant;
  for (const champ of op.signer || []) marques[champ] = ctx.acteur;
  if (op.type === 'creer') {
    const donnees = { ...op.donnees, ...marques };
    if (ctx.via) donnees.via = ctx.via;
    return donnees;
  }
  if (op.type === 'modifier') return { ...op.patch, ...marques };
  return op.donnees ?? null;
}

/**
 * Contrôle et prépare les opérations : identifiants tirés, documents d'origine lus, état d'après calculé.
 * Rien n'est écrit ici. Renvoie [{ collection, id, type, action, avant, apres, ecriture, champs }].
 */
async function preparer(donnees, ctx, operations) {
  if (!Array.isArray(operations)) throw new ErreurEcriture('plan_invalide', 'Plan d’écriture invalide.');
  // Une modification sans aucun champ ne change rien : ni écriture ni trace.
  const utiles = operations.filter((op) => !(op.type === 'modifier' && !Object.keys(op.patch || {}).length));
  if (utiles.length > MAX_ECRITURES) throw new ErreurEcriture('plan_invalide', `Trop d’écritures en une opération (${utiles.length}, maximum ${MAX_ECRITURES}).`);
  const vus = new Set();
  const lignes = utiles.map((op) => {
    if (!['creer', 'modifier', 'supprimer', 'remplacer'].includes(op.type)) throw new ErreurEcriture('plan_invalide', `Type d’opération inconnu : ${op.type}`);
    if (!COLLECTIONS_ECRITES.includes(op.collection)) throw new ErreurEcriture('plan_invalide', `Collection non écrivable : ${op.collection}`);
    const id = op.id ?? (op.type === 'creer' ? donnees.nouvelId(op.collection) : null);
    if (typeof id !== 'string' || !id || id.includes('/')) throw new ErreurEcriture('plan_invalide', 'Identifiant de document manquant ou invalide.');
    const cle = `${op.collection}/${id}`;
    if (vus.has(cle)) throw new ErreurEcriture('plan_invalide', `Le document ${cle} apparaît deux fois dans la même opération.`);
    vus.add(cle);
    return { op, collection: op.collection, id, type: op.type };
  });
  const avants = await Promise.all(lignes.map((l) => donnees.document(l.collection, l.id)));
  return lignes.map((l, i) => {
    const avant = sansId(avants[i]);
    const { op, type } = l;
    const contenu = resoudre(op, ctx);
    let apres;
    let ecriture;
    if (type === 'creer') {
      if (avant) throw new ErreurEcriture('conflit', `Le document ${l.collection}/${l.id} existe déjà.`);
      apres = contenu;
      ecriture = { type: 'set', donnees: contenu };
    } else if (type === 'modifier') {
      if (!avant) throw new ErreurEcriture('introuvable', `Document introuvable : ${l.collection}/${l.id}`);
      apres = { ...avant, ...contenu };
      ecriture = { type: 'update', donnees: contenu };
    } else if (type === 'supprimer') {
      if (!avant) throw new ErreurEcriture('introuvable', `Document introuvable : ${l.collection}/${l.id}`);
      apres = null;
      ecriture = { type: 'delete' };
    } else {
      apres = contenu;
      ecriture = contenu ? { type: 'set', donnees: contenu } : { type: 'delete' };
    }
    const action = { creer: 'creer', modifier: 'modifier', supprimer: 'supprimer', remplacer: 'restaurer' }[type];
    const champs = type === 'modifier' ? Object.keys(contenu) : type === 'supprimer' || !apres ? [] : Object.keys(apres);
    return { collection: l.collection, id: l.id, type, action, avant, apres, ecriture: { ...ecriture, collection: l.collection, id: l.id }, champs };
  });
}

/**
 * Exécute les opérations avec audit. ctx : { acteur, jeton, via, maintenant: Date }.
 * Renvoie { operationId, ecritures: [{ collection, docId, action }], auditIncomplet? }.
 * Lance ErreurEcriture : plan_invalide, introuvable, conflit (avant tout lot), audit_indisponible (rien d'écrit),
 * ecriture_echouee (détails : operationId, appliquees, partiel).
 */
export async function executerEcritures({ donnees, ctx, outil, parametres = {}, operations }) {
  const lignes = await preparer(donnees, ctx, operations);
  if (!lignes.length) return { operationId: null, ecritures: [] };

  const operationId = donnees.nouvelId(C.audit);
  const expireAt = new Date(ctx.maintenant.getTime() + JOURS_COPIES * 86_400_000);
  const audits = lignes.map((l, i) => ({
    ...l,
    auditId: donnees.nouvelId(C.audit),
    ligne: {
      operationId,
      ordre: i + 1,
      date: ctx.maintenant,
      acteur: ctx.acteur,
      jeton: ctx.jeton,
      via: ctx.via || 'mcp',
      outil,
      collection: l.collection,
      docId: l.id,
      action: l.action,
      statut: 'en_cours',
      champsModifies: l.champs,
      // Les valeurs reçues peuvent contenir des données de personnes : elles vont dans la copie à durée limitée, pas ici.
      parametresRecus: Object.keys(parametres ?? {}).slice(0, 40),
    },
  }));
  const marquer = async (liste, statut, erreur) => {
    for (const lot of paquets(liste, TAILLE_PAQUET_DONNEES)) {
      await donnees.appliquer(lot.map((a) => ({ type: 'update', collection: C.audit, id: a.auditId, donnees: statut === 'succes' ? { statut } : { statut, erreur } })));
    }
  };

  // Lot 1 : sans trace, pas de donnée.
  const tracees = [];
  try {
    for (const lot of paquets(audits, TAILLE_PAQUET_AUDIT)) {
      await donnees.appliquer(lot.flatMap((a) => [
        { type: 'set', collection: C.audit, id: a.auditId, donnees: a.ligne },
        {
          type: 'set',
          collection: C.auditAvant,
          id: a.auditId,
          donnees: {
            operationId, collection: a.collection, docId: a.id, avant: a.avant, apres: a.apres, expireAt,
            ...(a.ligne.ordre === 1 ? { parametres: tronquer(parametres) } : {}),
          },
        },
      ]));
      tracees.push(...lot);
    }
  } catch (e) {
    // Les lots déjà écrits ne correspondent à aucune écriture de données : on les marque, si le journal répond encore.
    await marquer(tracees, 'echec', 'Journal indisponible : aucune donnée écrite.').catch(() => {});
    throw new ErreurEcriture('audit_indisponible', 'Le journal d’audit est indisponible : rien n’a été écrit.', { cause: court(e) });
  }

  // Lot 2 : les données, paquet par paquet ; un paquet est écrit en entier ou pas du tout.
  const appliquees = [];
  let echec = null;
  for (const lot of paquets(audits, TAILLE_PAQUET_DONNEES)) {
    try {
      await donnees.appliquer(lot.map((a) => a.ecriture), { attendus: lot.map((a) => ({ collection: a.collection, id: a.id, avant: a.avant })) });
      appliquees.push(...lot);
    } catch (e) {
      echec = e;
      break;
    }
  }

  // Lot 3 : l'audit dit ce qui s'est réellement passé.
  const restantes = audits.filter((a) => !appliquees.includes(a));
  let auditIncomplet = false;
  try {
    if (appliquees.length) await marquer(appliquees, 'succes');
    if (restantes.length) await marquer(restantes, 'echec', court(echec) || 'Écriture non effectuée.');
  } catch {
    auditIncomplet = true;
  }

  if (echec) {
    const partiel = appliquees.length > 0;
    const code = echec.code === 'conflit' ? 'conflit' : 'ecriture_echouee';
    throw new ErreurEcriture(code, partiel
      ? `Écriture interrompue : ${appliquees.length} document(s) sur ${audits.length} écrits. Opération ${operationId} : restaurer_depuis_audit peut la défaire.`
      : `Écriture refusée, rien n’a été écrit${code === 'conflit' ? ' (un document a été modifié entre-temps : recommencer)' : ''}.`,
    { operationId, appliquees: appliquees.length, total: audits.length, partiel, cause: court(echec), auditIncomplet });
  }
  return {
    operationId,
    ecritures: audits.map((a) => ({ collection: a.collection, docId: a.id, action: a.action })),
    ...(auditIncomplet ? { auditIncomplet: true, avertissement: `Écriture faite, mais le journal n’a pas pu être complété : lire_audit (incompletes) montrera l’opération ${operationId} comme « à vérifier ».` } : {}),
  };
}
