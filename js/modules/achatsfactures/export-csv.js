// Export CSV (Excel français) des factures : séparateur « ; », UTF-8 avec BOM, dates JJ/MM/AAAA, montants avec virgule décimale. Fonctions PURES, sans réseau :
// le bouton n'exporte que ce que la personne voit déjà. Recopié de l'appli d'origine (cellules protégées contre les formules d'un tableur).
// Volontairement SANS coordonnées bancaires : l'export n'en contient jamais.
import { dateFr, estAvoir, montantSigne, LIBELLE_STATUT } from './logique.js';

export const BOM = '﻿';
export const SEPARATEUR = ';';
export const FIN_DE_LIGNE = '\r\n';

/** Montant ou nombre : deux décimales, virgule décimale, pas d'espace de milliers (« -100,00 »). */
export const nombreCsv = (n) => n.toFixed(2).replace('.', ',');

/** Texte : un texte qui commence par =, +, - ou @ (ou une tabulation, un retour chariot) est lu comme une formule par Excel : on le fait précéder d'une apostrophe. */
export const protegerFormule = (t) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);

/** Met entre guillemets (et double les guillemets) si la valeur contient « ; », un guillemet ou un saut de ligne. */
export const echapper = (t) => (/[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

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

export const ENTETES_FACTURES = ['Numéro', 'Fournisseur', 'SIREN', 'Date de la facture', 'HT', 'TVA', 'TTC', 'Type', 'Statut', 'Décideur', 'Date de décision', 'Motif de refus', 'Chantier'];

/** Un avoir sort en négatif (montantSigne), comme à l'écran. */
export function facturesCsv(factures) {
  return construireCsv(ENTETES_FACTURES, factures.map((f) => [
    f.numero, f.fournisseur, f.fournisseur_siren, date(f.date_facture),
    montantSigne(f.montant_ht, f), montantSigne(f.montant_tva, f), montantSigne(f.montant_ttc, f),
    estAvoir(f) ? 'Avoir' : 'Facture', LIBELLE_STATUT[f.statut] ?? f.statut, f.decide_par, date(f.date_decision), f.motif_refus, f.chantiers?.nom,
  ]));
}

export const nomFichierExport = (jour) => `factures-${jour}.csv`;
export const TEXTE_RIEN_A_EXPORTER = 'Rien à exporter';
