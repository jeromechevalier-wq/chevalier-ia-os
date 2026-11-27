// Module Achats « Tableau de bord 2 » : téléchargement du CSV (les fichiers se fabriquent dans csv.js) et section « Sauvegarde » des Réglages.
import { h, icone, toast } from '../../os/ui.js';
import { dateJourFichier } from './filtrage.js';
import { csvDe, fichierFactures, nomFichier, TEXTE_RIEN_A_EXPORTER } from './csv.js';
import { lireDonnees } from './donnees.js';

/** Télécharge un texte comme fichier CSV (aucun envoi : le fichier est fabriqué dans le navigateur). */
export function telechargerCsv(nom, contenu) {
  const adresse = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
  const lien = h('a', { href: adresse, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

/** Exporte le tableau affiché : `fichier` = { nom, entetes, lignes }. Renvoie true si le fichier est parti. */
export function exporterFichier(fichier) {
  if (!fichier || !fichier.lignes.length) return false;
  telechargerCsv(nomFichier(fichier.nom, dateJourFichier()), csvDe(fichier));
  return true;
}

/** Lit toutes les factures du tableau de bord et fabrique le fichier de sauvegarde, sans le télécharger : { nom, contenu, message, nombre }. Lève l'erreur de lecture.
 *  Sert au bouton ci-dessous ET à la sauvegarde complète des achats (.zip) : même contenu, mêmes colonnes, jamais de coordonnées bancaires. */
export async function fichierSauvegarde({ lire = lireDonnees } = {}) {
  const { factures, message } = await lire();
  const fichier = fichierFactures(factures);
  return { nom: nomFichier(fichier.nom, dateJourFichier()), contenu: csvDe(fichier), message: message || '', nombre: factures.length };
}

/** Réglages > Tableau de bord 2 > Sauvegarde : lit toutes les factures dans la base de l'espace puis télécharge le fichier. `lire` se remplace dans les tests. */
export async function exporterFactures({ lire = lireDonnees } = {}) {
  try {
    const { nom, contenu, message, nombre } = await fichierSauvegarde({ lire });
    if (!nombre) { toast(TEXTE_RIEN_A_EXPORTER); return false; }
    telechargerCsv(nom, contenu);
    toast(message ? `Sauvegarde téléchargée. ${message}` : 'Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn('Export du tableau de bord impossible', e?.code ?? e?.message);
    toast('Export impossible : vérifie ta connexion à la base, puis réessaie.', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportTableauAchats(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-tableauachats' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde du tableau de bord'),
    h('p', { class: 'aide' }, 'Télécharge la liste de toutes les factures lues par le tableau de bord dans un fichier pour Excel (date, fournisseur, numéro, chantier, statut, montant, alertes). Les coordonnées bancaires n’y figurent jamais.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-tableauachats' }, onclick: () => exporterFactures() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
