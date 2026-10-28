// Réglages > Affaires et projets > « Sauvegarde des projets » : un fichier JSON avec les données du module (projets, livrables, modèles de projets).
// Même présentation que Devis et Affaires. Aucune date de dernier export n'est écrite.
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';

/** Télécharge les données du module Projets. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterProjets({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'projets'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde des projets » de Réglages > Affaires et projets (le module Projets n'a pas son propre menu : il partage celui des affaires) : un seul bouton, secondaire. */
export function reglagesExportProjets(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-projets' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde des projets'),
    h('p', { class: 'aide' }, 'Télécharge tes données de projets (projets, livrables et modèles de projets) dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-projets' }, onclick: () => exporterProjets() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
