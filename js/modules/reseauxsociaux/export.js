// Réglages > Réseaux sociaux > « Sauvegarde » : un fichier JSON avec les données du module (classement des posts, historique des imports LinkedIn, idées, sources d'inspiration, leurs exemples et leurs pistes).
// Même présentation que la Veille. Lecture seule : l'export n'écrit rien. Les posts eux-mêmes restent dans Buffer (ils ne sont pas copiés ici).
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import { nomFichierExportReseauxSociaux } from './logique.js';

/** Télécharge les données du module. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterReseauxSociaux({ lire = D.lireToutPourExport } = {}) {
  try {
    const collections = await lire();
    const maintenant = new Date();
    telecharger(nomFichierExportReseauxSociaux(maintenant), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde » de Réglages > Réseaux sociaux : un seul bouton, secondaire. */
export function reglagesExportReseauxSociaux(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-reseauxsociaux' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge le classement de tes posts, l’historique de tes imports, tes idées, tes sources d’inspiration, leurs exemples et leurs pistes dans un fichier. Les textes des posts restent dans Buffer.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-reseauxsociaux' }, onclick: () => exporterReseauxSociaux() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
