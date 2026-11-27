// Module Achats « Fournisseurs » : téléchargement du CSV (le fichier se fabrique dans csv.js) et section « Sauvegarde » des Réglages.
import { h, icone, toast } from '../../os/ui.js';
import { dateJourFichier, fusionner } from './logique.js';
import { fournisseursCsv, nomFichierFournisseurs, TEXTE_RIEN_A_EXPORTER } from './csv.js';
import { lireFournisseurs } from './donnees.js';

/** Télécharge un texte comme fichier CSV (aucun envoi : le fichier est fabriqué dans le navigateur). */
export function telechargerCsv(nom, contenu) {
  const adresse = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
  const lien = h('a', { href: adresse, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

/** Exporte les lignes données (la liste affichée) : renvoie true si le fichier est parti. */
export function exporterLignes(lignes) {
  if (!lignes.length) return false;
  telechargerCsv(nomFichierFournisseurs(dateJourFichier()), fournisseursCsv(lignes));
  return true;
}

/** Lit tous les fournisseurs et fabrique le fichier de sauvegarde, sans le télécharger : { nom, contenu, message, nombre }. Lève l'erreur de lecture.
 *  Sert au bouton ci-dessous ET à la sauvegarde complète des achats (.zip) : même contenu, mêmes colonnes, jamais de coordonnées bancaires. */
export async function fichierFournisseurs({ lire = lireFournisseurs } = {}) {
  const { file, confirmations, message } = await lire();
  const lignes = fusionner(file, confirmations);
  return { nom: nomFichierFournisseurs(dateJourFichier()), contenu: fournisseursCsv(lignes), message: message || '', nombre: lignes.length };
}

/** Réglages > Achats > Sauvegarde : lit tous les fournisseurs dans la base de l'espace puis télécharge le fichier. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterFournisseurs({ lire = lireFournisseurs } = {}) {
  try {
    const { nom, contenu, message, nombre } = await fichierFournisseurs({ lire });
    if (!nombre) { toast(TEXTE_RIEN_A_EXPORTER); return false; }
    telechargerCsv(nom, contenu);
    toast(message ? `Sauvegarde téléchargée. ${message}` : 'Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn('Export des fournisseurs impossible', e?.code ?? e?.message);
    toast('Export impossible : vérifie ta connexion à la base, puis réessaie.', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportFournisseurs(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-achatsfournisseurs' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde des fournisseurs'),
    h('p', { class: 'aide' }, 'Télécharge la liste des fournisseurs dans un fichier pour Excel (nom, SIREN, état, nombre de factures, dernière facture). Les coordonnées bancaires n’y figurent jamais.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-achatsfournisseurs' }, onclick: () => exporterFournisseurs() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
