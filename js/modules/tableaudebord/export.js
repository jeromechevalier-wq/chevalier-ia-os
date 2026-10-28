// Réglages > Maintenance > « Sauvegarde » : un fichier JSON avec les données du module (indicateurs, relevés de saisie, demandes).
// Même présentation que Devis, Affaires, Projets et Automatisations. Lecture seule : l'export n'écrit rien (aucune collection du module n'est inscriptible par le navigateur).
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';

/** Télécharge les données du module Maintenance. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterMaintenance({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'maintenance'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde » de Réglages > Maintenance : un seul bouton, secondaire. */
export function reglagesExportMaintenance(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-maintenance' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge tes données de maintenance (indicateurs, relevés et demandes) dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-maintenance' }, onclick: () => exporterMaintenance() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
