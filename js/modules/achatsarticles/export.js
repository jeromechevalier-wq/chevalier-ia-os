// Export des données du module Articles (règle du 27/10/2026 : chaque module a son bouton) : un fichier CSV lisible dans Excel en français
// (séparateur « ; », UTF-8 avec marque d'ordre, dates JJ/MM/AAAA, nombres avec virgule). Le bouton de l'écran exporte ce qui est affiché ; le bouton de Réglages > Articles > Sauvegarde exporte tous les articles.
// Fonctions pures + un petit téléchargement : aucun appel réseau ici.
import { h, icone, toast } from '../../os/ui.js';
import { construireListe, libelleEtat, statistiquesLignes } from './logique.js';
import { dateFr } from './formats.js';

export const BOM = '\uFEFF';
export const SEPARATEUR = ';';
export const FIN_DE_LIGNE = '\r\n';
export const ENTETES = ['Fournisseur', 'Référence', 'Désignation', 'Unité', 'Dernier prix HT', 'Date du dernier prix', 'Nombre de lignes', 'Rapprochement', 'Article interne', 'Unité de l’article interne', 'Coefficient'];

/** Nombre : au plus 6 décimales, virgule décimale, sans espace de milliers. */
export const nombreCsv = (n) => String(Math.round(n * 1e6) / 1e6).replace('.', ',');
/** Un texte qui commence par =, +, - ou @ (ou une tabulation, un retour chariot) serait lu comme une formule par Excel : on le fait précéder d'une apostrophe. */
export const protegerFormule = (t) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);
export const echapper = (t) => (/[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
export function formaterCellule(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return Number.isFinite(c) ? nombreCsv(c) : '';
  return echapper(protegerFormule(String(c)));
}
export const construireCsv = (entetes, lignes) => BOM + [entetes, ...lignes].map((l) => l.map(formaterCellule).join(SEPARATEUR)).join(FIN_DE_LIGNE) + FIN_DE_LIGNE;

/** Un article de la liste affichée → une ligne du fichier. */
export function ligneCsv(x) {
  return [
    x.fournisseur, x.article.reference ?? '', x.article.designation, x.article.unite ?? '',
    x.stats.dernierPrix, x.stats.derniereDate ? dateFr(x.stats.derniereDate) : '', x.stats.nbLignes,
    libelleEtat(x.etat), x.reference?.nom ?? x.referenceRefusee?.nom ?? '', x.reference?.unite_reference ?? x.referenceRefusee?.unite_reference ?? '',
    x.rapprochement ? x.rapprochement.coefficient : (x.refus && x.refus.coefficient !== null && x.refus.coefficient !== undefined ? x.refus.coefficient : null),
  ];
}
export const articlesCsv = (liste) => construireCsv(ENTETES, liste.map(ligneCsv));

/** Nom du fichier : articles-AAAA-MM-JJ.csv (date de Paris). */
export function nomFichier(maintenant = new Date()) {
  const [j, m, a] = maintenant.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }).split('/');
  return `articles-${a}-${m}-${j}.csv`;
}

export function telechargerCsv(nom, contenu) {
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: nom });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Liste complète à partir de ce qui a été lu (même construction que l'écran). */
export const listeDepuisDonnees = (d) => construireListe(d.articles, d.rapprochements, d.references, statistiquesLignes(d.lignes), d.refusees);

/** Exporte `liste` (déjà construite). Renvoie true si le fichier est parti. */
export function exporterListe(liste, { telecharger = telechargerCsv, maintenant = new Date(), prevenir = toast } = {}) {
  try {
    telecharger(nomFichier(maintenant), articlesCsv(liste));
    prevenir(`${liste.length} article${liste.length > 1 ? 's' : ''} exporté${liste.length > 1 ? 's' : ''}`);
    return true;
  } catch (e) {
    console.warn(e);
    prevenir('Export impossible', { type: 'erreur' });
    return false;
  }
}

/** Lit tous les articles et fabrique le fichier de sauvegarde, sans le télécharger : { nom, contenu, message }. Lève l'erreur de lecture.
 *  Sert à la sauvegarde complète des achats (.zip) : même contenu et mêmes colonnes que le bouton ci-dessous. */
export async function fichierArticles({ lire, maintenant = new Date() } = {}) {
  const donnees = await lire();
  return { nom: nomFichier(maintenant), contenu: articlesCsv(listeDepuisDonnees(donnees)), message: donnees.tronque ? 'La liste des articles est trop longue pour être lue en entier : le fichier est incomplet.' : '' };
}

/** Réglages > Articles > « Sauvegarde » : relit tous les articles puis les exporte. `lire` se remplace dans les tests. */
export async function exporterTout({ lire, telecharger = telechargerCsv, maintenant = new Date(), prevenir = toast } = {}) {
  try {
    const donnees = await lire();
    if (donnees.tronque) prevenir('La liste est trop longue pour être lue en entier : le fichier est incomplet.', { type: 'erreur', duree: 6000 });
    return exporterListe(listeDepuisDonnees(donnees), { telecharger, maintenant, prevenir });
  } catch (e) {
    console.warn(e);
    prevenir('Export impossible : vérifie ta connexion à la base, puis réessaie.', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportArticles(page, { lire }) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-achatsarticles' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde des articles'),
    h('p', { class: 'aide' }, 'Télécharge tous les articles, avec leur rapprochement et leur coefficient, dans un fichier lisible dans Excel.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-achatsarticles' }, onclick: () => exporterTout({ lire }) }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
