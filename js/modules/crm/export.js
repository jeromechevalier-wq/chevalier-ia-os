// Export des données : sauvegarde complète en JSON (toutes les collections du CRM).
import { toast } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { telecharger } from './composants.js';

/** Télécharge toutes les collections du CRM en un fichier JSON et note la date de l'export. */
export async function exporterToutesLesDonnees() {
  try {
    const collections = await D.toutesLesCollections();
    telecharger(L.nomFichierExport(new Date(), 'complet'), L.exportJson(collections, new Date()), 'application/json;charset=utf-8');
    await D.noterExportComplet();
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}
