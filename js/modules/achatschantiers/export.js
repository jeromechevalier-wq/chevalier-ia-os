// Réglages > Chantiers > « Sauvegarde » (24/11/2026, PR 6) : un bouton qui télécharge TOUS les chantiers de la base (archivés compris) dans un fichier pour tableur.
// Lecture seule : l'export n'écrit rien. Les données vivent dans la base de l'espace (pas dans Firebase) : on les lit par la couche d'accès, et on dit clairement si l'accès n'est pas prêt.
import { h, icone, toast } from '../../os/ui.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { texteAcces } from '../achatscommun/etat.js';
import { creerDonnees } from './donnees.js';
import { chantiersCsv, nomFichierExport } from './export-csv.js';
import { dateJourFichier } from './logique.js';
import { telechargerTexte } from './composants.js';

const lireParDefaut = () => creerDonnees({ client: clientBase(), actions: actionsBase() }).chargerChantiers();

/** Accès pas prêt : message lisible (montré tel quel). */
class ErreurAcces extends Error { constructor(message) { super(message); this.name = 'ErreurAcces'; this.saisie = true; } }

/** Lit tous les chantiers (archivés compris) et fabrique le fichier de sauvegarde, sans le télécharger : { nom, contenu, message }. Lève une erreur (accès pas prêt : message lisible).
 *  Sert au bouton ci-dessous ET à la sauvegarde complète des achats (.zip) : même contenu, mêmes colonnes. */
export async function fichierChantiers({ verifier = () => verifierAcces(), lire = lireParDefaut } = {}) {
  const { etat } = await verifier();
  if (etat !== 'connecte') throw new ErreurAcces(texteAcces(etat));
  const { chantiers, tronque, message } = await lire();
  return { nom: nomFichierExport(dateJourFichier()), contenu: chantiersCsv(chantiers), message: tronque ? (message || 'La liste des chantiers est peut-être incomplète.') : '' };
}

/** Lit tous les chantiers puis télécharge le fichier. `verifier` et `lire` se remplacent dans les tests. Renvoie true si le fichier est parti. */
export async function exporterChantiers({ verifier = () => verifierAcces(), lire = lireParDefaut } = {}) {
  try {
    const { nom, contenu, message } = await fichierChantiers({ verifier, lire });
    telechargerTexte(nom, contenu);
    toast(message ? `Sauvegarde téléchargée. ${message}` : 'Sauvegarde téléchargée', { type: message ? 'erreur' : 'info' });
    return true;
  } catch (e) {
    if (e instanceof ErreurAcces) { toast(e.message, { type: 'erreur' }); return false; }
    console.warn('Export des chantiers impossible', e?.code ?? e?.message);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde des chantiers » de Réglages > Achats : un seul bouton, secondaire. */
export function reglagesExportChantiers(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-achatschantiers' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde des chantiers'),
    h('p', { class: 'aide' }, 'Télécharge tous tes chantiers, archivés compris, dans un fichier pour tableur. Les chantiers sont lus dans la base de l’espace : rien n’est écrit.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-chantiers-tous' }, onclick: () => exporterChantiers() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
