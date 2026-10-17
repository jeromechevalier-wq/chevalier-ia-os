// Copie de l'historique n8n vers Firestore, pour UN propriétaire à la fois (chantier 14).
// Tout est écrit sous clients/<client>/… : workflows/<id>, executions/<numéro>, sync/state. Le client est TOUJOURS passé par le code
// appelant (déduit de l'identité de l'utilisateur ou de la liste des clients), jamais lu dans une donnée venant de n8n.
// Même code pour Jérôme : avec `base: ''` les mêmes documents sont écrits à la RACINE de sa base (Chevalier IA OS), sans « clients/<client>/ »
// (voir fonctions/src/automatisations/appels.js, qui reçoit une copie de ce fichier).
//
// Garanties (cahier des charges, critères de réussite) :
//  - pas de doublon : un document par numéro d'exécution, écrit avec « set / merge » (écrire deux fois la même chose ne change rien) ;
//  - un seul passage à la fois par client (verrou dans sync/state, qui expire tout seul si une copie plante) ;
//  - « à vérifier » (stale) : une exécution « en cours » depuis plus de 10 minutes ;
//  - AUCUN contenu de données, aucune définition de workflow, aucun secret n'est écrit : seulement la liste blanche ci-dessous.
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { ErreurN8n } from './n8n.js';
import { MOTIF_ID_N8N } from './etiquettes.js';

export const DELAI_STALE_MS = 10 * 60 * 1000; // « en cours » depuis plus de 10 minutes = à vérifier
export const DELAI_MINI_RAFRAICHISSEMENT_MS = 10 * 1000; // entre deux rafraîchissements demandés par un utilisateur
export const DUREE_VERROU_MS = 3 * 60 * 1000; // un verrou oublié (copie plantée) se libère tout seul après 3 minutes
export const PREMIERE_COPIE_MAX = 200; // première copie d'un workflow : ses 200 dernières exécutions
export const COPIE_MAX = 500; // par workflow et par passage
const LONGUEUR_MESSAGE = 300;
const LONGUEUR_ETAPE = 120;
const ETATS_OUVERTS = ['new', 'running', 'waiting'];

/** Texte court et propre : sans caractères de contrôle, raccourci. */
export function raccourcir(valeur, max) {
  const t = String(valeur ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** « à vérifier » : encore « en cours » (ou « démarrée ») plus de 10 minutes après son début. */
export function estStale(statut, debut, maintenant) {
  return (statut === 'running' || statut === 'new') && debut instanceof Date && maintenant - debut.getTime() > DELAI_STALE_MS;
}

/**
 * Document d'une exécution : LISTE BLANCHE de champs. Tout ce que n8n envoie d'autre est ignoré.
 * `existant` : le document déjà copié (ou null) ; `cause` : { message, etape } si on vient de lire l'erreur.
 */
export function documentExecution(exe, { libelle, existant, cause, maintenant }) {
  const doc = {
    executionId: exe.id,
    workflowId: exe.workflowId,
    workflowLabel: libelle,
    status: exe.status,
    stale: estStale(exe.status, exe.startedAt, maintenant),
    mode: exe.mode ?? null,
    startedAt: exe.startedAt,
    stoppedAt: exe.stoppedAt,
    durationMs: exe.startedAt && exe.stoppedAt ? Math.max(0, exe.stoppedAt.getTime() - exe.startedAt.getTime()) : null,
    retryOf: exe.retryOf ?? null,
    source: 'sync',
    lastSyncedAt: new Date(maintenant),
  };
  if (exe.status === 'error') {
    doc.errorMessage = cause ? raccourcir(cause.message, LONGUEUR_MESSAGE) : existant?.errorMessage ?? null;
    doc.failedStep = cause ? raccourcir(cause.etape, LONGUEUR_ETAPE) : existant?.failedStep ?? null;
  } else {
    doc.errorMessage = null;
    doc.failedStep = null;
  }
  // Réservés à la suite (suivi par groupe, durée de conservation) : vides à la création, jamais écrasés ensuite.
  if (!existant) { doc.runGroupId = null; doc.expireAt = null; }
  return doc;
}

const numero = (id) => Number(id);

/** Chemin d'un document ou d'une collection sous la base du propriétaire (`base` vide = racine de la base de Jérôme). */
export const sous = (base, chemin) => (base ? `${base}/${chemin}` : chemin);

/**
 * Copie un client. Options :
 *  db, n8n (lecteur n8n), client (nom pour les journaux), base (où écrire : `clients/<client>` par défaut, '' pour Jérôme), maintenant (ms), raison ('horaire' | 'manuel'),
 *  obtenirWorkflows : async () => [workflows de CE client] — appelée APRÈS la prise du verrou (pas d'appel à n8n si on est refusé).
 * Renvoie { resultat, ... } où resultat vaut 'mis-a-jour', 'deja-en-cours', 'trop-tot' ou 'n8n-injoignable'.
 */
export async function synchroniserClient({ db, n8n, client, base = `clients/${client}`, maintenant = Date.now(), raison, obtenirWorkflows }) {
  const refEtat = db.doc(sous(base, 'sync/state'));
  const jeton = `${maintenant}-${Math.random().toString(36).slice(2, 10)}`;

  // 1. Verrou (transaction) + délai minimal entre deux rafraîchissements demandés par un utilisateur.
  const prise = await db.runTransaction(async (t) => {
    const s = await t.get(refEtat);
    const e = s.exists ? s.data() : {};
    if (e.lockUntil && e.lockUntil.toMillis() > maintenant) return { refus: 'deja-en-cours', e };
    if (raison === 'manuel' && e.lastRunAt && maintenant - e.lastRunAt.toMillis() < DELAI_MINI_RAFRAICHISSEMENT_MS) return { refus: 'trop-tot', e };
    t.set(refEtat, { lockUntil: new Date(maintenant + DUREE_VERROU_MS), lockId: jeton, lastRunAt: new Date(maintenant) }, { merge: true });
    return { e };
  });
  if (prise.refus) return { resultat: prise.refus, lastSyncedAt: prise.e.lastSyncedAt?.toMillis() ?? null };

  try {
    const etat = prise.e;
    const workflows = await obtenirWorkflows();
    const nbCopiees = await copier({ db, n8n, client, base, workflows, curseurs: { ...(etat.curseurs ?? {}) }, maintenant, refEtat });
    return { resultat: 'mis-a-jour', lastSyncedAt: maintenant, ...nbCopiees };
  } catch (e) {
    if (!(e instanceof ErreurN8n)) throw e;
    // n8n ne répond pas (ou refuse la clé) : on garde les dernières données et on le dit à l'écran (bandeau jaune).
    logger.error('Journal : n8n injoignable ou clé refusée', { client, genre: e.genre, detail: e.message });
    await refEtat.set({ n8nOk: false, lastAttemptAt: new Date(maintenant), lastError: raccourcir(e.message, 120) }, { merge: true });
    return { resultat: 'n8n-injoignable', lastSyncedAt: (await refEtat.get()).data()?.lastSyncedAt?.toMillis() ?? null };
  } finally {
    // Libère le verrou, seulement s'il est encore le nôtre.
    await db.runTransaction(async (t) => {
      const s = await t.get(refEtat);
      if (s.exists && s.data().lockId === jeton) t.update(refEtat, { lockUntil: null, lockId: null });
    });
  }
}

async function copier({ db, n8n, client, base, workflows, curseurs, maintenant, refEtat }) {
  const racine = base; // '' = racine de la base de Jérôme
  const sures = workflows.filter((w) => MOTIF_ID_N8N.test(w.id));

  // Workflows : n8n fait foi pour le nom d'origine ; le nom choisi par le client (« libelle ») n'est JAMAIS touché ici.
  const refsWf = sures.map((w) => db.doc(sous(racine, `workflows/${w.id}`)));
  const dejaWf = refsWf.length ? await db.getAll(...refsWf) : [];
  const libelleDe = new Map();
  const lotWf = db.batch();
  sures.forEach((w, i) => {
    const ex = dejaWf[i].exists ? dejaWf[i].data() : null;
    libelleDe.set(w.id, ex?.libelle || w.name);
    const donnees = { workflowId: w.id, nom: w.name, active: w.active, lastSeenAt: new Date(maintenant) };
    if (!ex) donnees.stepsPlan = []; // étapes prévues : vide tant qu'on ne suit pas les étapes (phase 3)
    lotWf.set(refsWf[i], donnees, { merge: true });
  });
  if (sures.length) await lotWf.commit();

  // Nouvelles exécutions de chaque workflow du client.
  const aEcrire = new Map(); // numéro -> exécution résumée
  let tronque = false;
  for (const w of sures) {
    const apresId = curseurs[w.id] ?? null;
    const { executions, tronque: coupe } = await n8n.executionsDuWorkflow(w.id, { apresId, max: apresId === null ? PREMIERE_COPIE_MAX : COPIE_MAX });
    tronque ||= coupe;
    for (const e of executions) {
      // Sûreté : on ne copie que des exécutions bien rattachées au workflow demandé et à un numéro sain.
      if (e.id && MOTIF_ID_N8N.test(e.id) && e.workflowId === w.id) aEcrire.set(e.id, e);
    }
    const plusGrand = Math.max(numero(apresId ?? 0), ...executions.map((e) => numero(e.id)).filter(Number.isFinite));
    if (Number.isFinite(plusGrand) && plusGrand > 0) curseurs[w.id] = String(plusGrand);
  }

  // Exécutions encore ouvertes dans Firestore (en cours, en attente) : on redemande leur état à n8n.
  const ouvertes = await db.collection(sous(racine, 'executions')).where('status', 'in', ETATS_OUVERTS).get();
  for (const d of ouvertes.docs) {
    if (aEcrire.has(d.id)) continue;
    try {
      const e = await n8n.execution(d.id);
      // Le workflow doit être celui déjà enregistré chez ce client : jamais de changement de rattachement.
      if (e.id === d.id && e.workflowId === d.data().workflowId) aEcrire.set(d.id, e);
    } catch (err) {
      if (!(err instanceof ErreurN8n && err.genre === 'introuvable')) throw err; // effacée par n8n : on la laisse (elle passera « à vérifier »)
      await d.ref.set({ stale: estStale(d.data().status, d.data().startedAt?.toDate(), maintenant), lastSyncedAt: new Date(maintenant) }, { merge: true });
    }
  }

  // Écriture, par groupes. Pour une erreur, on lit la cause une seule fois (message et étape, courts) ; le détail est jeté aussitôt.
  const ids = [...aEcrire.keys()];
  let ecrites = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const groupe = ids.slice(i, i + 200);
    const refs = groupe.map((id) => db.doc(sous(racine, `executions/${id}`)));
    const existants = await db.getAll(...refs);
    const lot = db.batch();
    for (let j = 0; j < groupe.length; j++) {
      const exe = aEcrire.get(groupe[j]);
      const ex = existants[j].exists ? existants[j].data() : null;
      let cause = null;
      if (exe.status === 'error' && !ex?.errorMessage) {
        try { cause = await n8n.causeErreur(exe.id); } catch (err) { if (!(err instanceof ErreurN8n)) throw err; logger.warn('Journal : cause de l\'erreur illisible', { client, genre: err.genre }); }
      }
      const libelle = libelleDe.get(exe.workflowId) ?? ex?.workflowLabel ?? '';
      lot.set(refs[j], documentExecution(exe, { libelle, existant: ex, cause, maintenant }), { merge: true });
      ecrites++;
    }
    await lot.commit();
  }

  await refEtat.set({
    n8nOk: true, lastSyncedAt: new Date(maintenant), lastSuccessAt: new Date(maintenant), lastError: null,
    curseurs, tronque, copiees: ecrites,
  }, { merge: true });
  return { ecrites };
}

/** Marque tous les clients donnés « n8n injoignable » (la liste des workflows n'a pas pu être lue). */
export async function marquerInjoignable(db, clients, { maintenant = Date.now(), message, base = (c) => `clients/${c}` }) {
  await Promise.all(clients.map((c) => db.doc(sous(base(c), 'sync/state')).set(
    { n8nOk: false, lastAttemptAt: new Date(maintenant), lastError: raccourcir(message, 120) }, { merge: true })));
}

export { FieldValue };
