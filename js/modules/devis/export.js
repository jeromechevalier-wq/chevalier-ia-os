// Réglages > Devis > « Sauvegarde » : un fichier JSON avec les données du module (devis de toutes les versions, catalogue, familles, réglages et « Mon entreprise »).
// Même présentation que la sauvegarde du module Affaires (qui, elle, contient tout) ; ici seulement le module Devis. Aucune date de dernier export n'est écrite.
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';

/** Télécharge les données du module Devis. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterDevis({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'devis'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde » de Réglages > Devis : un seul bouton, secondaire (le jaune reste à « Enregistrer »). */
export function reglagesExportDevis(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-devis' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge tes données de devis (devis, catalogue, familles, réglages et informations de ton entreprise) dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-devis' }, onclick: () => exporterDevis() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
