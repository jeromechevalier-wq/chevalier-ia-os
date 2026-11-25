// Réglages > Factures > « Sauvegarde » (25/11/2026, PR 8a) : un bouton qui télécharge TOUTES les factures de la base (archivées comprises) dans un fichier pour tableur.
// Lecture seule : l'export n'écrit rien. Les données vivent dans la base de l'espace (pas dans Firebase) : on les lit par la couche d'accès, et on dit clairement si l'accès n'est pas prêt.
import { h, icone, toast } from '../../os/ui.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { texteAcces } from '../achatscommun/etat.js';
import { creerDonnees } from './donnees.js';
import { facturesCsv, nomFichierExport } from './export-csv.js';
import { dateJourFichier } from './logique.js';
import { telechargerTexte } from './composants.js';

/** Lit toutes les factures puis télécharge le fichier. `verifier` et `lire` se remplacent dans les tests. Renvoie true si le fichier est parti. */
export async function exporterFactures({ verifier = () => verifierAcces(), lire = () => creerDonnees({ client: clientBase(), actions: actionsBase() }).chargerFactures() } = {}) {
  try {
    const { etat } = await verifier();
    if (etat !== 'connecte') { toast(texteAcces(etat), { type: 'erreur' }); return false; }
    const { liste, complete, message } = await lire();
    telechargerTexte(nomFichierExport(dateJourFichier()), facturesCsv(liste));
    toast(complete ? 'Sauvegarde téléchargée' : `Sauvegarde téléchargée. ${message || 'La liste est peut-être incomplète.'}`, { type: complete ? 'info' : 'erreur' });
    return true;
  } catch (e) {
    console.warn('Export des factures impossible', e?.code ?? e?.message);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde » de Réglages > Factures : un seul bouton, secondaire. */
export function reglagesExportFactures(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-achatsfactures' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge toutes tes factures, archivées comprises, dans un fichier pour tableur (sans les coordonnées bancaires). Les factures sont lues dans la base de l’espace : rien n’est écrit.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-factures-toutes' }, onclick: () => exporterFactures() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
