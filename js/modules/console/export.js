// Réglages > Console > « Sauvegarde » : un fichier JSON avec les vérifications du filet de sécurité. Lecture seule (règle du 27/10/2026).
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';

/** Télécharge les données de la Console. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterConsole({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'console'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportConsole(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-console' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge les vérifications du filet de sécurité dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-console' }, onclick: () => exporterConsole() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
