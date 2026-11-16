// Données du module Console (phase 0) : le Filet de sécurité (`console_filet/<id>` : { verifieLe, note }) et l'état du serveur (fonction `consoleEtat`).
// Les écritures passent par `executer` (journal commun) : une vérification datée laisse sa trace comme toute autre écriture.
import { collection, getDocs, onSnapshot, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { executer } from '../../os/journal-donnees.js';
import { ecritureCreer } from '../crm/logique.js';
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

/** Date une vérification du filet (aujourd'hui, ou la date donnée) avec une note facultative. Lève une erreur au message lisible. */
export async function verifierLigne(id, { note = '', date = new Date() } = {}) {
  if (!LIGNES_FILET.some((l) => l.id === id)) throw new Error('Cette vérification n\'existe pas.');
  try {
    await executer([ecritureCreer('console_filet', id, { verifieLe: Timestamp.fromDate(date), note: String(note).slice(0, 500) }, { horodater: ['majLe'], signer: ['majPar'] })], 'consoleVerifierLigne');
  } catch (e) {
    console.warn(e);
    throw new Error('La vérification n\'a pas pu être enregistrée.');
  }
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
