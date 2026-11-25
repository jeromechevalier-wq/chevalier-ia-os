// Module Achats « Tableau de bord 2 » : fabrication des fichiers CSV (Excel français). LOGIQUE PURE (aucun réseau, aucun écran), testée par node.
// Séparateur « ; », UTF-8 avec BOM, dates JJ/MM/AAAA, virgule décimale. Chaque fichier ne contient que ce que la personne voit déjà : aucun IBAN, aucune adresse e-mail.
import { formater } from './formats.js';
import { nomFournisseur } from './filtrage.js';

export const BOM = '﻿';
export const SEPARATEUR = ';';
export const FIN_DE_LIGNE = '\r\n';
export const TEXTE_RIEN_A_EXPORTER = 'Rien à exporter';

/** Montant ou nombre : deux décimales, virgule décimale, pas d'espace de milliers. */
export const nombreCsv = (n) => n.toFixed(2).replace('.', ',');
/** Un texte qui commence par =, +, - ou @ (ou une tabulation, un retour chariot) est lu comme une formule par Excel : on le fait précéder d'une apostrophe. */
export const protegerFormule = (t) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);
/** Met entre guillemets (et double les guillemets) si la valeur contient « ; », un guillemet ou un saut de ligne. */
export const echapper = (t) => (/[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** Une cellule : du texte (protégé contre les formules Excel), un nombre (écrit avec virgule) ou rien. */
export function formaterCellule(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return Number.isFinite(c) ? nombreCsv(c) : '';
  return echapper(protegerFormule(String(c)));
}

/** Fichier complet : BOM, en-têtes, puis une ligne par enregistrement. */
export function construireCsv(entetes, lignes) {
  return BOM + [entetes, ...lignes].map((l) => l.map(formaterCellule).join(SEPARATEUR)).join(FIN_DE_LIGNE) + FIN_DE_LIGNE;
}

const date = (v) => (v ? formater(v, 'date') : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Descriptions des fichiers : { nom, entetes, lignes } (un fichier par tableau affiché). */
export const fichierFactures = (factures) => ({
  nom: 'factures',
  entetes: ['Date', 'Fournisseur', 'Numéro', 'Chantier', 'Statut', 'Montant HT', 'Alertes'],
  lignes: factures.map((f) => [date(f.date_ref), nomFournisseur(f), f.numero ?? '', f.chantier ?? '', f.statut_fr ?? '', num(f.montant_ht), num(f.nb_alertes)]),
});
export const fichierChantiers = (chantiers) => ({
  nom: 'chantiers',
  entetes: ['Chantier', 'Client', 'Budget HT', 'Accepté HT', 'En attente HT', '% du budget'],
  lignes: chantiers.map((c) => [c.chantier, c.client ?? '', num(c.budget_ht), num(c.accepte_ht), num(c.en_attente_ht), num(c.pct_budget_consomme)]),
});
export const fichierArticles = (articles) => ({
  nom: 'prix-articles',
  entetes: ['Fournisseur', 'Référence', 'Désignation', 'Dépense HT', 'Premier prix', 'Dernier prix', 'Variation %', 'Achats'],
  lignes: articles.map((a) => [a.fournisseur, a.reference_fournisseur, a.designation, num(a.depense), num(a.prix_premier), num(a.prix_dernier), num(a.variation_pct), num(a.nb_achats)]),
});
export const fichierLignesAchat = (lignes) => ({
  nom: 'lignes-achat',
  entetes: ['Date', 'Fournisseur', 'Agence', 'Chantier', 'Désignation', 'Quantité', 'Prix net', 'Montant HT', 'Rapprochement'],
  lignes: lignes.map((l) => [date(l.date_prix), l.fournisseur, l.agence, l.chantier, l.designation, num(l.quantite), num(l.prix_net), num(l.montant_ht), l.rapprochement]),
});
export const fichierFournisseurs = (lignes) => ({
  nom: 'fournisseurs',
  entetes: ['Fournisseur', 'SIREN', 'Agences', 'Factures', 'Total HT', 'Lignes d’achat', 'Dernière facture', 'Part %'],
  lignes: lignes.map((l) => [l.nom, l.siren, l.nb_agences === null ? null : num(l.nb_agences), num(l.nb_factures), num(l.total_ht), num(l.nb_lignes), date(l.derniere_facture), num(l.part_pct)]),
});

export const nomFichier = (nom, jour) => `tableau-achats-${nom}-${jour}.csv`;
export const csvDe = (fichier) => construireCsv(fichier.entetes, fichier.lignes);
