// Données du module Console : le Filet de sécurité (`console_filet/<id>` : { verifieLe, note }), l'état du serveur (fonction `consoleEtat`) et les versions des bâtiments (fonction `consoleVersions`, phase 2).
// Les écritures passent par `executer` (journal commun) : une vérification datée laisse sa trace comme toute autre écriture.
import { collection, getDocs, onSnapshot, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { executer } from '../../os/journal-donnees.js';
import { ecritureCreer, ecritureModifier } from '../crm/logique.js';
import { LIGNES_FILET } from './logique.js';

export const etat = { filet: [], pret: false, erreur: false };
let desabonnement = null;
let base = '';
const abonnes = new Set();

const chemin = (nom) => cheminCollection(base, nom);

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

/** Chez Jérôme, cheminBase est '' (racine de la base 1). */
export function demarrer(_compte, cheminBase = '') {
  base = cheminBase;
  desabonnement = onSnapshot(collection(db, chemin('console_filet')), (snap) => {
    etat.filet = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    etat.pret = true; etat.erreur = false; notifier();
  }, (e) => { console.warn('console_filet indisponible', e.code); etat.pret = true; etat.erreur = true; notifier(); });
}

export function arreter() {
  desabonnement?.();
  desabonnement = null;
  Object.assign(etat, { filet: [], pret: false, erreur: false });
  base = '';
}

/**
 * Date une vérification du filet (aujourd'hui, ou la date donnée) ; `note` facultative : sans note, une note existante est gardée.
 * Une fiche déjà là est MODIFIÉE (le journal garde la copie « avant », l'opération se défait) ; sinon elle est créée. Lève une erreur au message lisible.
 */
export async function verifierLigne(id, { note, date = new Date() } = {}) {
  if (!LIGNES_FILET.some((l) => l.id === id)) throw new Error('Cette vérification n\'existe pas.');
  const existe = etat.filet.some((f) => f.id === id);
  const verifieLe = Timestamp.fromDate(date);
  const marques = { horodater: ['majLe'], signer: ['majPar'] };
  const champNote = typeof note === 'string' ? { note: note.slice(0, 500) } : {};
  try {
    await executer([existe ? ecritureModifier('console_filet', id, { verifieLe, ...champNote }, marques)
      : ecritureCreer('console_filet', id, { verifieLe, note: champNote.note ?? '' }, marques)], 'consoleVerifierLigne');
  } catch (e) {
    console.warn(e);
    throw new Error('La vérification n\'a pas pu être enregistrée.');
  }
}

/** Relance l'écoute des données (bouton « Réessayer » après une erreur de lecture). */
export function reessayer() {
  const cheminBase = base;
  desabonnement?.();
  desabonnement = null;
  Object.assign(etat, { filet: [], pret: false, erreur: false });
  notifier();
  demarrer(null, cheminBase);
}

/** Les données du module pour l'export : { console_filet }. */
export async function lireToutPourExport() {
  const snap = await getDocs(collection(db, chemin('console_filet')));
  return { console_filet: snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id })) };
}

const fonctions = () => getFunctions(app, 'europe-west9');

/** Appelle `consoleEtat` : { version, serveur, plateforme }. Lève une erreur au message lisible (jamais de détail technique). */
export async function lireEtatServeur() {
  try {
    const r = await httpsCallable(fonctions(), 'consoleEtat')({});
    return r.data;
  } catch (e) {
    const code = String(e?.code ?? '');
    if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) throw new Error('Ce compte n\'a pas accès à la Console. Se reconnecter si besoin.');
    throw new Error('Le serveur ne répond pas pour l\'instant.');
  }
}

/**
 * Appelle `consoleVersions` (phase 2, 28/11/2026) : { version_reference, batiments: [{ cle, version, depuis, vu_le, structure_code, structure_base, etat_version, etat_structure, motif, historique }] }.
 * Lève une erreur au message lisible (jamais de détail technique).
 */
export async function lireVersions() {
  try {
    const r = await httpsCallable(fonctions(), 'consoleVersions')({});
    return r.data;
  } catch (e) {
    const code = String(e?.code ?? '');
    if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) throw new Error('Ce compte n\'a pas accès à la Console. Se reconnecter si besoin.');
    throw new Error('Les versions ne se lisent pas pour l\'instant.');
  }
}
