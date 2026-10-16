// Ce que font les trois fonctions du module Automatisations (chantier 14, anciennement « journal »). Séparé de index.js pour pouvoir les essayer sans Cloud Functions.
//  - copieHoraire    : toutes les heures, pour tous les clients qui ont le module « automatisations » ;
//  - rafraichir      : bouton « Rafraîchir » et mise à jour automatique de l'écran ; le client vient de l'IDENTITÉ de l'appelant ;
//  - renommer        : un éditeur du client change le nom affiché d'un workflow (c'est la seule écriture venue d'un écran).
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { classer, etiquetteDuClient, MOTIF_ID_N8N, MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';
import { synchroniserClient, marquerInjoignable, raccourcir } from './synchro.js';
import { ErreurN8n } from './n8n.js';

export const MODULE_AUTOMATISATIONS = 'automatisations';
/** Ancien identifiant du module (avant le renommage) : les fiches client déjà activées avec `journal: true` continuent de marcher. Voir moduleActif(). */
export const ANCIEN_MODULE_JOURNAL = 'journal';
// Les messages des journaux Cloud gardent le préfixe « Journal : » : l'alerte e-mail de Google Cloud (créée à la main dans la console) le cherche.

/**
 * Le module est-il actif d'après le champ `modules` de la fiche client ? Même règle que js/os/registre.js (un test les compare) :
 * la nouvelle clé gagne si elle est présente (true ou false) ; sinon l'ancienne clé `journal: true` compte comme `automatisations: true`.
 */
export function moduleActif(modules) {
  if (!modules || typeof modules !== 'object') return false;
  const neuf = modules[MODULE_AUTOMATISATIONS];
  if (neuf !== undefined && neuf !== null) return neuf === true;
  return modules[ANCIEN_MODULE_JOURNAL] === true;
}
export const LONGUEUR_MAX_LIBELLE = 80;

/** Refus d'une fonction appelable ; `code` suit les codes de Firebase (unauthenticated, permission-denied, invalid-argument…). */
export class Refus extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');

/** Clients qui existent, et ceux dont la fiche active le module automatisations : { connus: Set, actifs: Set }. */
export async function lireClients(db) {
  const refs = await db.collection('clients').listDocuments();
  const connus = new Set();
  const actifs = new Set();
  if (!refs.length) return { connus, actifs };
  const fiches = await db.getAll(...refs, { fieldMask: ['modules'] });
  for (const f of fiches) {
    if (!MOTIF_IDENTIFIANT_CLIENT.test(f.id)) continue;
    connus.add(f.id);
    if (f.exists && moduleActif(f.get('modules'))) actifs.add(f.id);
  }
  return { connus, actifs };
}

/** Écrit la liste des workflows ignorés ou refusés (fiche du serveur seul, hors des clients : elle nomme des étiquettes de plusieurs clients). */
async function ecrireSignalements(db, signalements, maintenant) {
  await db.doc('plateforme_journal/signalements').set({ lastRunAt: new Date(maintenant), items: signalements });
  for (const s of signalements) logger.warn('Journal : workflow ignoré', s);
}

/** Copie horaire : un seul appel à n8n pour la liste des workflows, puis un passage par client. */
export async function copieHoraire({ db, n8n, maintenant = Date.now() }) {
  const { connus, actifs } = await lireClients(db);
  if (!actifs.size) return { clients: {} };
  let workflows;
  try {
    workflows = await n8n.workflows();
  } catch (e) {
    if (!(e instanceof ErreurN8n)) throw e;
    logger.error('Journal : liste des workflows illisible', { genre: e.genre, detail: e.message });
    await marquerInjoignable(db, [...actifs], { maintenant, message: e.message });
    return { clients: Object.fromEntries([...actifs].map((c) => [c, { resultat: 'n8n-injoignable' }])) };
  }
  const { parClient, signalements } = classer(workflows, { connus, actifs });
  await ecrireSignalements(db, signalements, maintenant);
  const clients = {};
  for (const client of actifs) { // l'un après l'autre : on ménage n8n
    clients[client] = await synchroniserClient({
      db, n8n, client, maintenant, raison: 'horaire', obtenirWorkflows: async () => parClient.get(client) ?? [],
    });
  }
  return { clients };
}

/** Fiche de membre de cet e-mail chez ce client : 'editeur', 'lecteur' ou null. */
async function roleDe(db, client, email) {
  const s = await db.doc(`clients/${client}/membres/${email}`).get();
  const role = s.exists ? s.get('role') : null;
  return role === 'editeur' || role === 'lecteur' ? role : null;
}

/** Identité de l'appelant : e-mail vérifié obligatoire, en minuscules. */
function emailDe(auth) {
  const jeton = auth?.token;
  if (!auth?.uid || !jeton || jeton.email_verified !== true || typeof jeton.email !== 'string') throw new Refus('unauthenticated', 'Connexion requise.');
  return jeton.email.toLowerCase();
}

/**
 * Bouton « Rafraîchir » / mise à jour automatique. AUCUN paramètre n'est lu : les clients de l'appelant viennent de ses fiches de membre
 * (clients/<client>/membres/<son e-mail>) et de l'activation du module automatisations sur ces clients.
 * Renvoie { resultat, lastSyncedAt } : 'mis-a-jour', 'trop-tot', 'deja-en-cours' ou 'n8n-injoignable'.
 */
export async function rafraichir({ db, n8n, auth, maintenant = Date.now() }) {
  const email = emailDe(auth);
  const { actifs } = await lireClients(db);
  const siens = [];
  for (const client of actifs) if (await roleDe(db, client, email)) siens.push(client);
  if (!siens.length) throw REFUS_NEUTRE();
  const resultats = [];
  for (const client of siens) {
    resultats.push(await synchroniserClient({
      db, n8n, client, maintenant, raison: 'manuel',
      obtenirWorkflows: async () => {
        // On ne demande à n8n que les workflows de CE client (étiquette) ; deux étiquettes de client sur un workflow = refusé.
        const tous = await n8n.workflows({ etiquette: etiquetteDuClient(client) });
        return classer(tous, { connus: new Set([client]), actifs: new Set([client]) }).parClient.get(client) ?? [];
      },
    }));
  }
  // Une seule réponse, la plus parlante : un échec n8n prime, puis une mise à jour, puis les refus.
  const ordre = ['n8n-injoignable', 'mis-a-jour', 'deja-en-cours', 'trop-tot'];
  const r = resultats.sort((a, b) => ordre.indexOf(a.resultat) - ordre.indexOf(b.resultat))[0];
  return { resultat: r.resultat, lastSyncedAt: r.lastSyncedAt ?? null };
}

/**
 * Renommer l'affichage d'un workflow. Données reçues : { client, workflowId, libelle }.
 * Le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit être ÉDITEUR de ce client (un lecteur est refusé),
 * le module automatisations doit y être actif, le workflow doit déjà exister chez ce client. Seul le champ « libelle » est écrit.
 * Un libellé vide revient au nom d'origine (celui de n8n). n8n n'est jamais modifié.
 */
export async function renommer({ db, auth, donnees }) {
  const email = emailDe(auth);
  const { client, workflowId, libelle } = donnees ?? {};
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (typeof workflowId !== 'string' || !MOTIF_ID_N8N.test(workflowId)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (typeof libelle !== 'string') throw new Refus('invalid-argument', 'Le nom doit être un texte.');
  const propre = raccourcir(libelle, 10000);
  if (propre.length > LONGUEUR_MAX_LIBELLE) throw new Refus('invalid-argument', `Le nom est trop long (${LONGUEUR_MAX_LIBELLE} caractères au plus).`);
  // Mêmes refus, mêmes mots : on ne dit pas si le client existe, si on en est membre ou si le module est actif.
  if ((await roleDe(db, client, email)) !== 'editeur') throw REFUS_NEUTRE();
  const fiche = await db.doc(`clients/${client}`).get();
  if (!fiche.exists || !moduleActif(fiche.get('modules'))) throw REFUS_NEUTRE();
  const ref = db.doc(`clients/${client}/workflows/${workflowId}`);
  if (!(await ref.get()).exists) throw new Refus('not-found', 'Cette automatisation est introuvable.');
  await ref.update({ libelle: propre === '' ? FieldValue.delete() : propre });
  return { ok: true, libelle: propre };
}
