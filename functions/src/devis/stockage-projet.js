// Le stockage des PDF du projet Firebase courant (le bucket par défaut), pour les fonctions qui signent un lien de lecture : devisPdf, devisPdfLien et la porte (devis.lireEmail).
// Rend null si le stockage est introuvable (l'appelant répond alors « PDF non configuré »).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { creerStockage } from './stockage.js';

export function stockageDuProjet() {
  if (!getApps().length) initializeApp();
  try {
    let bucket;
    try { bucket = getStorage().bucket(); } catch { bucket = getStorage().bucket(`${process.env.GCLOUD_PROJECT}.firebasestorage.app`); }
    return creerStockage({ bucket });
  } catch { return null; }
}
