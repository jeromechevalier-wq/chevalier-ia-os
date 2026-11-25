// Export CSV (Excel français) des chantiers : séparateur « ; », UTF-8 avec BOM, dates JJ/MM/AAAA, montants avec virgule décimale. Fonctions PURES, sans réseau :
// le bouton n'exporte que ce que la personne voit déjà. Recopié de l'appli d'origine (cellules protégées contre les formules d'un tableur).
import { dateFr, libelleStatutChantier } from './logique.js';

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

export const ENTETES_CHANTIERS = ['Code', 'Nom', 'Client', 'Statut', 'Budget HT', 'Date de début', 'Date de fin prévue', 'Date de fin réelle', 'Adresse', 'Archivé'];

export function chantiersCsv(chantiers) {
  return construireCsv(ENTETES_CHANTIERS, chantiers.map((c) => [
    c.code, c.nom, c.client, libelleStatutChantier(c.statut), c.budget_ht ?? null, date(c.date_debut), date(c.date_fin_prevue), date(c.date_fin_reelle), c.adresse, c.archive === true ? 'Oui' : 'Non',
  ]));
}

export const nomFichierExport = (jour) => `chantiers-${jour}.csv`;
export const TEXTE_RIEN_A_EXPORTER = 'Rien à exporter';
