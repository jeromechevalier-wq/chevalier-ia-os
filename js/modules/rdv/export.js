// Réglages > Rendez-vous > « Sauvegarde » : un fichier JSON avec les données du module (rendez-vous, participants, SMS, réglages). Lecture seule : l'export n'écrit rien.
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as R from './logique.js';

/** Télécharge les données du module Rendez-vous. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterRdv({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(R.nomFichierExportRdv(maintenant), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportRdv(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-rdv' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge tes rendez-vous (participants, SMS envoyés et reçus, réglages) dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-rdv' }, onclick: () => exporterRdv() }, icone('download', { taille: 16 }), 'Exporter les rendez-vous'))));
}
