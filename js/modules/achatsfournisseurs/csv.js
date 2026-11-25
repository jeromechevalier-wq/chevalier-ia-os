// Module Achats « Fournisseurs » : fabrication du fichier CSV (Excel français). LOGIQUE PURE (aucun réseau, aucun écran), testée par node.
// Séparateur « ; », UTF-8 avec BOM, dates JJ/MM/AAAA. Le fichier ne contient que ce que la personne voit déjà : volontairement SANS coordonnées bancaires (aucun IBAN).
import { dateFr, LIBELLE_ETAT_FOURNISSEUR } from './logique.js';

export const BOM = '\uFEFF';
export const SEPARATEUR = ';';
export const FIN_DE_LIGNE = '\r\n';
export const TEXTE_RIEN_A_EXPORTER = 'Rien à exporter';

/** Montant ou nombre : deux décimales, virgule décimale, pas d'espace de milliers (« -100,00 »). */
export const nombreCsv = (n) => n.toFixed(2).replace('.', ',');
/** Un texte qui commence par =, +, - ou @ (ou une tabulation, un retour chariot) est lu comme une formule par Excel : on le fait précéder d'une apostrophe. */
export const protegerFormule = (t) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);
/** Met entre guillemets (et double les guillemets) si la valeur contient « ; », un guillemet ou un saut de ligne. */
export const echapper = (t) => (/[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** Une cellule : du texte (protégé contre les formules Excel), un nombre (écrit tel quel, avec virgule) ou rien. */
export function formaterCellule(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return Number.isFinite(c) ? nombreCsv(c) : '';
  return echapper(protegerFormule(c));
}

/** Fichier complet : BOM, en-têtes, puis une ligne par enregistrement. */
export function construireCsv(entetes, lignes) {
  return BOM + [entetes, ...lignes].map((l) => l.map(formaterCellule).join(SEPARATEUR)).join(FIN_DE_LIGNE) + FIN_DE_LIGNE;
}

const date = (v) => (v ? dateFr(v) : '');

export const ENTETES_FOURNISSEURS = Object.freeze(['Fournisseur', 'SIREN', 'État', 'Nombre de factures', 'Dernière facture']);

/** Une ligne par fournisseur affiché ; volontairement SANS coordonnées bancaires (l'export n'en contient jamais). */
export function fournisseursCsv(lignes) {
  return construireCsv(ENTETES_FOURNISSEURS, lignes.map((l) => [l.nom, l.siren, LIBELLE_ETAT_FOURNISSEUR[l.etat], l.nbFactures === null ? null : String(l.nbFactures), date(l.derniere)]));
}

export const nomFichierFournisseurs = (jour) => `fournisseurs-${jour}.csv`;
