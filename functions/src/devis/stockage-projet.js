// Le stockage des PDF du projet Firebase courant (le bucket par défaut), pour les fonctions qui signent un lien de lecture : devisPdf, devisPdfLien et la porte (devis.lireEmail).
// Rend null si le stockage est introuvable (l'appelant répond alors « PDF non configuré »).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { creerStockage } from './stockage.js';

/** Le bucket par défaut du projet (ou celui de `<projet>.firebasestorage.app`). Lève si le stockage est introuvable. */
export function bucketDuProjet() {
  if (!getApps().length) initializeApp();
  try { return getStorage().bucket(); } catch { return getStorage().bucket(`${process.env.GCLOUD_PROJECT}.firebasestorage.app`); }
}

export function stockageDuProjet() {
  try { return creerStockage({ bucket: bucketDuProjet() }); } catch { return null; }
}
