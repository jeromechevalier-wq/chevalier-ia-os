// Réglages > Veille > « Sauvegarde » : un fichier JSON avec les données du module (sources, contenus, résumés, pages des résumés).
// Même présentation que Devis, Affaires et Projets. Lecture seule : l'export n'écrit rien (pas même une date de dernier export).
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';

/** Télécharge les données du module Veille. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterVeille({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'veille'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde » de Réglages > Veille : un seul bouton, secondaire. */
export function reglagesExportVeille(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-veille' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge tes données de veille (sources, contenus et résumés) dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-veille' }, onclick: () => exporterVeille() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
