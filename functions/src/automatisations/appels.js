// Module Automatisations côté Chevalier IA OS (projet chevalier-ia-os) : la copie de TES workflows n8n et la vue administrateur de tous les propriétaires.
// Réutilise le MÊME code que la plateforme clients (copie générée dans functions/partage/automatisations/ par scripts/preparer-fonctions.js) :
//  - lecture de n8n (GET seulement), reconnaissance du propriétaire par trois signes, copie vers Firestore avec l'historique.
// Deux fonctions s'appuient sur ce fichier (voir index.js) :
//  - copieInterne          : toutes les heures, copie tes workflows « interne » vers TA base (documents à la racine : workflows, executions, sync) ;
//  - automatisationsAdmin  : appelable par ton compte seulement. « lire » = lit, SANS JAMAIS ÉCRIRE, la base de Chevalier IA APP (clients) ; « rafraichir » = recopie tes workflows maintenant.
// La base de Chevalier IA APP n'est jamais écrite d'ici : le compte de service de la fonction n'y a que le rôle « Lecteur Cloud Datastore » (voir docs/automatisations-n8n.md, guide).
import { classer, classerInterne, classerSansEtiquette, moduleActif, MOTIF_IDENTIFIANT_CLIENT, PROPRIETAIRE_INTERNE, ETIQUETTE_INTERNE } from '../../partage/automatisations/etiquettes.js';
import { synchroniserClient, marquerInjoignable } from '../../partage/automatisations/synchro.js';
import { ErreurN8n } from '../../partage/automatisations/n8n.js';
import { estAdministrateur } from '../../partage/administrateur.js';

export const NB_MAX_EXECUTIONS = 300; // comme l'écran d'un client : les plus récentes
/** Journal Google Cloud (une ligne JSON ; « severity » est lue par Cloud Logging). Champs choisis un par un : jamais de contenu, d'en-tête ni de clé. */
const journalCloud = {
  warn: (message, champs = {}) => process.stdout.write(`${JSON.stringify({ severity: 'WARNING', message, ...champs })}\n`),
  error: (message, champs = {}) => process.stdout.write(`${JSON.stringify({ severity: 'ERROR', message, ...champs })}\n`),
};
const BASE_INTERNE = ''; // tes données sont à la RACINE de ta base (pas de clients/<client>/)

/** Refus d'une fonction appelable ; `code` suit les codes de Firebase (unauthenticated, permission-denied, invalid-argument…). */
export class Refus extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');

/** Administrateur : e-mail vérifié ET dans la liste (js/os/administrateur.js). Même message pour tous les refus d'accès. */
export function exigerAdministrateur(auth) {
  const jeton = auth?.token;
  if (!auth?.uid || !jeton) throw new Refus('unauthenticated', 'Connexion requise.');
  if (!estAdministrateur(jeton.email, jeton.email_verified)) throw REFUS_NEUTRE();
  return jeton.email.toLowerCase();
}

/**
 * Clients qui existent et ceux qui ont le module (lecture seule dans Chevalier IA APP) : { connus, actifs } ou null si la lecture est impossible
 * (droits pas encore donnés) : on ne juge alors PAS les workflows des clients (sans cette liste, tous passeraient pour « client inconnu »).
 */
async function lireClients(dbPlateforme) {
  if (!dbPlateforme) return null;
  try {
    const ids = (await dbPlateforme.collection('clients').listDocuments()).map((r) => r.id).filter((id) => MOTIF_IDENTIFIANT_CLIENT.test(id));
    const fiches = ids.length ? await dbPlateforme.getAll(...ids.map((id) => dbPlateforme.doc(`clients/${id}`)), { fieldMask: ['modules'] }) : [];
    return { connus: new Set(ids), actifs: new Set(ids.filter((id, i) => fiches[i].exists && moduleActif(fiches[i].get('modules')))) };
  } catch (e) {
    journalCloud.warn('Journal : clients illisibles depuis Chevalier IA OS', { code: e?.code });
    return null;
  }
}

/**
 * Copie TES workflows (propriétaire « interne ») vers ta base. Dans les deux cas (horaire ou bouton), la liste COMPLÈTE de n8n est lue, tous les workflows sont
 * jugés (les tiens aux trois signes ; ceux des clients comme le fait leur propre copie) et le résultat est écrit dans plateforme_journal/signalements de TA base :
 * c'est la source unique des « workflows non reconnus » et « clients sans le module » de l'écran. Seuls les tiens sont copiés.
 */
export async function copieInterne({ db, dbPlateforme = null, n8n, raison = 'horaire', maintenant = Date.now() }) {
  const clients = await lireClients(dbPlateforme);
  let workflows;
  try {
    workflows = await n8n.workflows();
  } catch (e) {
    if (!(e instanceof ErreurN8n)) throw e;
    journalCloud.error('Journal : liste des workflows illisible (interne)', { genre: e.genre, detail: e.message });
    await marquerInjoignable(db, [PROPRIETAIRE_INTERNE], { maintenant, message: e.message, base: () => BASE_INTERNE });
    return { resultat: 'n8n-injoignable', lastSyncedAt: null };
  }
  const { retenus, signalements: siens } = classerInterne(workflows, { connus: clients?.connus ?? new Set() });
  const deClients = clients ? classer(workflows, clients).signalements : [];
  const sansEtiquette = classerSansEtiquette(workflows).signalements;
  const archives = new Set(workflows.filter((w) => w.archive === true).map((w) => String(w.id))); // un workflow archivé ne tourne plus : pas de signalement
  const vus = new Set();
  const signalements = [...siens, ...deClients, ...sansEtiquette].filter((i) => !archives.has(i.workflowId) && !vus.has(i.workflowId) && vus.add(i.workflowId));
  await db.doc('plateforme_journal/signalements').set({ lastRunAt: new Date(maintenant), items: signalements });
  for (const s of signalements) journalCloud.warn('Journal : workflow ignoré (interne)', { workflowId: s.workflowId, raison: s.raison });
  return synchroniserClient({ db, n8n, client: PROPRIETAIRE_INTERNE, base: BASE_INTERNE, maintenant, raison, obtenirWorkflows: async () => retenus });
}

// ------------------------------------------------------------------ vue administrateur (lecture seule)

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : typeof t === 'number' ? t : null);
const texte = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : null);

/** Une exécution, LISTE BLANCHE de champs (aucun contenu de données n'existe dans la copie, on ne renvoie que ce que l'écran affiche). */
function exePublique(id, d) {
  return {
    id, executionId: texte(d.executionId, 64) ?? id, workflowId: texte(d.workflowId, 64), workflowLabel: texte(d.workflowLabel, 120), status: texte(d.status, 20),
    stale: d.stale === true, mode: texte(d.mode, 30), startedAt: ms(d.startedAt), stoppedAt: ms(d.stoppedAt),
    durationMs: typeof d.durationMs === 'number' ? d.durationMs : null, errorMessage: texte(d.errorMessage), failedStep: texte(d.failedStep, 120),
  };
}
const wfPublic = (id, d) => ({ id, workflowId: id, nom: texte(d.nom, 120), libelle: texte(d.libelle, 80), active: d.active === true });
const synchroPublique = (d) => (d ? { n8nOk: d.n8nOk !== false, lastSyncedAt: ms(d.lastSyncedAt), lastSuccessAt: ms(d.lastSuccessAt) } : null);

/** Signalements d'une base : [{ workflowId, nom, raison, categorie, proprietaire, message, lignes, source }] (liste blanche de champs). */
async function lireSignalements(db, source) {
  const s = await db.doc('plateforme_journal/signalements').get();
  const items = s.exists && Array.isArray(s.get('items')) ? s.get('items') : [];
  return items.map((i) => ({
    workflowId: texte(i.workflowId, 64), nom: texte(i.nom, 120) ?? '', raison: texte(i.raison, 40),
    categorie: i.categorie === 'sans-module' ? 'sans-module' : 'non-reconnu', proprietaire: texte(i.proprietaire, 40),
    etiquettes: (i.etiquettes ?? []).slice(0, 5).map((t) => texte(t, 40)), message: texte(i.message, 400) ?? '',
    lignes: (Array.isArray(i.lignes) ? i.lignes : []).slice(0, 6).map((l) => ({ signe: texte(l?.signe, 40) ?? '', ok: l?.ok === true, texte: texte(l?.texte, 400) ?? '' })),
    source,
  }));
}

/**
 * Tout ce que l'écran administrateur a besoin de savoir des CLIENTS (lecture seule dans Chevalier IA APP), plus les « À vérifier » des deux bases.
 * `proprietaire` : 'tous' (par défaut) ou l'identifiant d'un client. Tes propres workflows (interne) ne passent pas ici : l'écran les lit en direct dans ta base.
 * Renvoie { proprietaires: [{ id, nom, workflows, synchro }], workflows, executions, aVerifier, lecturePossible }.
 */
export async function lireVueAdministrateur({ db, dbPlateforme, proprietaire = 'tous' }) {
  const cible = proprietaire === 'tous' || proprietaire === undefined ? null : proprietaire;
  if (cible !== null && (typeof cible !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(cible))) throw new Refus('invalid-argument', 'Demande invalide.');
  const aVerifier = await lireSignalements(db, 'os');
  const reponse = { proprietaires: [], workflows: [], executions: [], aVerifier, lecturePossible: true };
  if (!dbPlateforme) return { ...reponse, lecturePossible: false };
  try {
    const refs = await dbPlateforme.collection('clients').listDocuments();
    const ids = refs.map((r) => r.id).filter((id) => MOTIF_IDENTIFIANT_CLIENT.test(id));
    const fiches = ids.length ? await dbPlateforme.getAll(...ids.map((id) => dbPlateforme.doc(`clients/${id}`)), { fieldMask: ['modules'] }) : [];
    const actifs = ids.filter((id, i) => fiches[i].exists && moduleActif(fiches[i].get('modules')));
    const marques = actifs.length ? await dbPlateforme.getAll(...actifs.map((id) => dbPlateforme.doc(`marques/${id}`)), { fieldMask: ['nom'] }) : [];
    const aLire = cible === null ? actifs : actifs.filter((id) => id === cible);
    const exes = [];
    for (const id of actifs) {
      const nom = marques[actifs.indexOf(id)]?.get?.('nom');
      const wfSnap = await dbPlateforme.collection(`clients/${id}/workflows`).get();
      const etat = await dbPlateforme.doc(`clients/${id}/sync/state`).get();
      reponse.proprietaires.push({ id, nom: texte(nom, 80) || id, workflows: wfSnap.size, synchro: synchroPublique(etat.exists ? etat.data() : null) });
      if (!aLire.includes(id)) continue;
      for (const d of wfSnap.docs) reponse.workflows.push({ ...wfPublic(d.id, d.data()), proprietaire: id });
      const es = await dbPlateforme.collection(`clients/${id}/executions`).orderBy('startedAt', 'desc').limit(NB_MAX_EXECUTIONS).get();
      for (const d of es.docs) exes.push({ ...exePublique(d.id, d.data()), proprietaire: id });
    }
    reponse.executions = exes.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).slice(0, NB_MAX_EXECUTIONS);
    const deja = new Set(aVerifier.map((i) => i.workflowId));
    // Ceux de la copie des clients : seulement s'ils sont au format détaillé (nom et message) ; les tiens (jugés avec la liste complète) l'emportent.
    for (const i of await lireSignalements(dbPlateforme, 'app')) if (i.nom && i.message && !deja.has(i.workflowId)) aVerifier.push(i);
  } catch (e) {
    journalCloud.error('Journal : Chevalier IA APP illisible depuis Chevalier IA OS', { code: e?.code });
    return { ...reponse, proprietaires: [], workflows: [], executions: [], lecturePossible: false };
  }
  return reponse;
}

/**
 * La fonction appelable. Actions : 'lire' (défaut) et 'rafraichir' (recopie tes workflows maintenant). Aucune autre.
 * Seul ton compte (administrateur) passe ; les autres reçoivent le même refus neutre.
 */
export async function administrateur({ db, dbPlateforme, n8n, auth, donnees, maintenant = Date.now() }) {
  exigerAdministrateur(auth);
  const d = donnees && typeof donnees === 'object' && !Array.isArray(donnees) ? donnees : {};
  const action = d.action ?? 'lire';
  if (action === 'rafraichir') {
    const r = await copieInterne({ db, dbPlateforme, n8n: n8n(), raison: 'manuel', maintenant });
    return { resultat: r.resultat, lastSyncedAt: r.lastSyncedAt ?? null };
  }
  if (action === 'lire') return lireVueAdministrateur({ db, dbPlateforme, proprietaire: d.proprietaire });
  throw new Refus('invalid-argument', 'Demande inconnue.');
}
