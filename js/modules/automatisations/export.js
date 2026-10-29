// Réglages > Automatisations > « Sauvegarde » : un fichier JSON avec les données du module (workflows, historique des exécutions, état de la copie, propositions « À valider »).
// Même présentation que Devis et Affaires. Aucune date de dernier export n'est écrite.
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';

/** Télécharge les données du module Automatisations. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterAutomatisations({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'automatisations'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde » de Réglages > Automatisations : un seul bouton, secondaire. */
export function reglagesExportAutomatisations(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-automatisations' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge tes données d’automatisations (workflows, historique des exécutions et propositions à valider) dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-automatisations' }, onclick: () => exporterAutomatisations() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
