// Réglages > Factures > « Sauvegarde » (25/11/2026, PR 8a) : un bouton qui télécharge TOUTES les factures de la base (archivées comprises) dans un fichier pour tableur.
// Lecture seule : l'export n'écrit rien. Les données vivent dans la base de l'espace (pas dans Firebase) : on les lit par la couche d'accès, et on dit clairement si l'accès n'est pas prêt.
import { h, icone, toast } from '../../os/ui.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { texteAcces } from '../achatscommun/etat.js';
import { creerDonnees } from './donnees.js';
import { facturesCsv, nomFichierExport } from './export-csv.js';
import { dateJourFichier } from './logique.js';
import { telechargerTexte } from './composants.js';

const lireParDefaut = () => creerDonnees({ client: clientBase(), actions: actionsBase() }).chargerFactures();

/** Accès pas prêt : message lisible (montré tel quel). */
class ErreurAcces extends Error { constructor(message) { super(message); this.name = 'ErreurAcces'; this.saisie = true; } }

/** Lit toutes les factures (archivées comprises) et fabrique le fichier de sauvegarde, sans le télécharger : { nom, contenu, message }. Lève une erreur (accès pas prêt : message lisible).
 *  Sert au bouton ci-dessous ET à la sauvegarde complète des achats (.zip) : même contenu, mêmes colonnes, jamais de coordonnées bancaires. */
export async function fichierFactures({ verifier = () => verifierAcces(), lire = lireParDefaut } = {}) {
  const { etat } = await verifier();
  if (etat !== 'connecte') throw new ErreurAcces(texteAcces(etat));
  const { liste, complete, message } = await lire();
  return { nom: nomFichierExport(dateJourFichier()), contenu: facturesCsv(liste), message: complete ? '' : (message || 'La liste des factures est peut-être incomplète.') };
}

/** Lit toutes les factures puis télécharge le fichier. `verifier` et `lire` se remplacent dans les tests. Renvoie true si le fichier est parti. */
export async function exporterFactures({ verifier = () => verifierAcces(), lire = lireParDefaut } = {}) {
  try {
    const { nom, contenu, message } = await fichierFactures({ verifier, lire });
    telechargerTexte(nom, contenu);
    toast(message ? `Sauvegarde téléchargée. ${message}` : 'Sauvegarde téléchargée', { type: message ? 'erreur' : 'info' });
    return true;
  } catch (e) {
    if (e instanceof ErreurAcces) { toast(e.message, { type: 'erreur' }); return false; }
    console.warn('Export des factures impossible', e?.code ?? e?.message);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** La section « Sauvegarde des factures » de Réglages > Achats : un seul bouton, secondaire. */
export function reglagesExportFactures(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-achatsfactures' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde des factures'),
    h('p', { class: 'aide' }, 'Télécharge toutes tes factures, archivées comprises, dans un fichier pour tableur (sans les coordonnées bancaires). Les factures sont lues dans la base de l’espace : rien n’est écrit.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-factures-toutes' }, onclick: () => exporterFactures() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
