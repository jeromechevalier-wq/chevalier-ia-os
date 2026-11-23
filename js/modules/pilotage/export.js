// Réglages > Pilotage > « Sauvegarde » : un fichier JSON avec le réglage du tableau. Lecture seule (règle du 27/10/2026).
// La table vit côté serveur : le bouton passe par `pilotageLire({ exporter: true })`, réservé à l'administrateur.
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import { messageErreurExport } from './logique.js';
import { construireCsv, nomFichierCsv } from './filtres-logique.js';

/** Télécharge le réglage du Pilotage. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterPilotage({ lire = D.lireReglagesPourExport } = {}) {
  try {
    const reglages = await lire();
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'pilotage'), L.exportJson({ pilotage_parametres: [{ id: 'reglage', ...reglages }] }, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast(messageErreurExport(e), { type: 'erreur' });
    return false;
  }
}

/** Télécharge un tableau en CSV (point-virgule, BOM UTF-8, formules neutralisées) : les lignes sont celles déjà lues par l'écran, donc déjà filtrées. Le nom du fichier ne porte que l'identifiant de la tuile. */
export function exporterTableauCsv(idTuile, colonnes, lignes) {
  try {
    telecharger(nomFichierCsv(idTuile), construireCsv(colonnes, lignes), 'text/csv;charset=utf-8');
    toast('Tableau téléchargé');
    return true;
  } catch (e) {
    console.warn(e);
    toast('L\'export n\'a pas abouti : réessaie dans un instant.', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportPilotage(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-pilotage' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge le réglage de ton tableau de pilotage dans un fichier. Ce réglage se modifie par Claude, à ta demande : il n\'y a rien à saisir ici.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-pilotage' }, onclick: () => exporterPilotage() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
