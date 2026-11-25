// Fausses factures du module Achats « Factures » pour les tests (25/11/2026, PR 8a). DÉPÔT PUBLIC : aucune vraie donnée.
// Tous les numéros (SIREN, SIRET, IBAN) sont inventés mais valides (clé de Luhn, clé d'IBAN), pour que les contrôles les acceptent.
// L'entreprise de l'espace (le destinataire des factures) est fictive : son identité est donnée aux contrôles par l'appelant, jamais écrite dans le code du module.
// Deux petites règles de la base (migrations 007 et 008), recopiées ici pour que ce fichier ne dépende d'aucun code du module : le lanceur e2e le charge aussi.
const normaliserIban = (v) => ((v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null);
const numeroNormalise = (n) => {
  let v = (n ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
  if (/^[0-9]+$/.test(v)) v = v.replace(/^0+/, '') || '0';
  return v || null;
};

export const IDENT = { nom: 'ENTREPRISE TEST', noms: ['ENTREPRISE TEST', 'Entreprise Test Construction'], siren: '987654324', siret: '98765432400019', adresseMots: ['rue des tests'] };
const vide = { nom: null, siret: null, siren: null, adresse: null };
const DEST = { nom: 'ENTREPRISE TEST', siret: IDENT.siret, siren: IDENT.siren, adresse: null };
export const IBAN_D = 'FR7630006000011234567890189';
export const IBAN_E = 'FR1420041010050500013M02606';
const SIRET_PP = '50000000500008';
const SIRET_FERRO = '50000002100005';
const SIRET_SERRURIER = '60000000400017';
const SIRET_PIEGE = '50000005400006';
const SIRET_PIEGE_DEUX = '60000001200010';
const annuaireOk = (nom) => ({ interroge: true, disponible: true, trouve: true, actif: true, denomination: nom.toUpperCase() });

const base = {
  type_document: 'facture', lignes_etat: 'non_lues', lignes_somme_ht: null, iban_normalise: null, email_expediteur: null, extraction: null, extraction_erreur: null, acceptee_malgre_alerte: false,
  archivee_le: null, chantiers: null, decide_par: null, date_decision: null, motif_refus: null, created_at: '2026-11-20T08:00:00Z', fournisseur_siren: null, numero_normalise: null,
};

/** Analyse fictive cohérente avec la facture (mêmes montants, même numéro). */
const extraction = (nom, siret, o = {}) => ({
  source: 'texte_openrouter', modele: 'test', fournisseur: { ...vide, nom, siret, siren: siret ? siret.slice(0, 9) : null }, destinataire: DEST,
  numero: 'N-1', date_facture: '2026-11-20', montant_ht: 100, montant_tva: 20, montant_ttc: 120, devise: 'EUR', annuaire: siret ? annuaireOk(nom ?? '') : undefined, iban: null, ...o,
});

/** Une facture de la liste, avec son analyse (sauf `sansAnalyse`). */
function facture(id, nom, siret, o = {}) {
  const { extr = {}, sansAnalyse = false, ...reste } = o;
  const numero = reste.numero ?? 'N-1';
  const f = { ...base, id, fournisseur: nom, numero, date_facture: '2026-11-20', montant_ht: 100, montant_tva: 20, montant_ttc: 120, statut: 'a_valider', ...reste };
  if (!sansAnalyse) f.extraction = extraction(nom, siret, { numero, montant_ht: f.montant_ht, montant_tva: f.montant_tva, montant_ttc: f.montant_ttc, date_facture: f.date_facture, iban: f.iban_normalise ?? null, ...extr });
  f.fournisseur_siren = siret ? siret.slice(0, 9) : null;
  f.numero_normalise = numeroNormalise(numero);
  if (f.extraction?.iban) f.iban_normalise = normaliserIban(f.extraction.iban);
  return f;
}

export function listeComplete() {
  return [
    // À valider
    facture('a1', 'Point Q Matériaux', SIRET_PP, { numero: 'FA-2026-0412', montant_ht: 1284.5, montant_tva: 256.9, montant_ttc: 1541.4, lignes_etat: 'lues', lignes_somme_ht: 1284.5 }), // sans IBAN : gris
    facture('a2', 'Loxbel Location', '50000001300002', { numero: 'L-88213', extr: { annuaire: { ...annuaireOk('Autre nom'), denomination: 'AUTRE NOM' } } }), // nom différent : orange
    facture('a3', null, null, { numero: null, montant_ht: 96.25, montant_tva: 19.25, montant_ttc: 125.5, sansAnalyse: true, extraction: { ...extraction('Entreprise fictive', '12345678901234', { numero: null, montant_ht: 96.25, montant_tva: 19.25, montant_ttc: 125.5, destinataire: { ...vide, nom: 'SARL Autre Société Fictive', siret: '98765432100012', siren: '987654321' } }) } }), // total faux, SIRET invalide, autre destinataire : rouge
    facture('a4', 'Ancienne facture sans analyse', null, { numero: 'D-1', sansAnalyse: true }), // sans analyse : gris
    facture('a5', 'Gros PDF fictif', null, { numero: 'G-9', montant_ht: null, montant_tva: null, montant_ttc: null, sansAnalyse: true, extraction_erreur: 'pdf_trop_gros' }), // illisible : gris
    // Le vrai titulaire de l'IBAN : tout vert (IBAN et adresse d'envoi connus par une facture acceptée du même SIREN, lignes lues).
    facture('a12', 'Ferronnerie du Verdon', SIRET_FERRO, { numero: 'FQ-100', iban_normalise: IBAN_D, email_expediteur: 'contact@ferronnerie.example', lignes_etat: 'lues', lignes_somme_ht: 100, extr: { iban: IBAN_D } }),
    // Même IBAN que le titulaire mais SIREN différent : jamais vert.
    facture('a13', 'Serrurerie Express', SIRET_SERRURIER, { numero: 'SE-5', iban_normalise: IBAN_E, email_expediteur: 'contact@serrurerie.example', extr: { iban: IBAN_E } }),
    // Doublon d'une facture déjà acceptée du même fournisseur : rouge.
    facture('a14', 'Point Q Matériaux', SIRET_PP, { numero: 'FA-2026-0300', extr: { iban: null } }),
    // Décidées
    facture('h1', 'Bricolo Dépôt', '50000003900007', { numero: 'BD-55102', statut: 'acceptee', date_decision: '2026-11-12T10:00:00Z', decide_par: 'test@exemple.example' }),
    facture('h2', 'Électro Services', '50000004700018', { numero: 'ES-3071', statut: 'refusee', motif_refus: 'Doublon.', date_decision: '2026-11-09T16:20:00Z', archivee_le: '2026-11-15T09:00:00Z' }),
    facture('h8', 'Ferronnerie du Verdon', SIRET_FERRO, { numero: 'FQ-099', statut: 'acceptee', iban_normalise: IBAN_D, email_expediteur: 'contact@ferronnerie.example', date_decision: '2026-10-21T09:00:00Z', extr: { iban: IBAN_D } }),
    facture('h9', 'Point Q Matériaux', SIRET_PP, { numero: 'FA-2026-0300', statut: 'acceptee', date_decision: '2026-10-22T09:00:00Z' }),
    // Facture piège REFUSÉE : l'IBAN du fournisseur « Ferronnerie » sur la facture d'un autre SIREN (elle ne doit pas accuser le vrai titulaire, a12).
    facture('h11', 'Fournisseur piège', SIRET_PIEGE, { numero: 'PIEGE-1', statut: 'refusee', motif_refus: 'IBAN suspect.', iban_normalise: IBAN_D, extr: { iban: IBAN_D }, date_decision: '2026-11-02T09:00:00Z' }),
    // Autre piège REFUSÉ avec IBAN_E : un nouveau fournisseur (a13) qui présente le même IBAN n'a pas de titulaire connu.
    facture('h12', 'Fournisseur piège deux', SIRET_PIEGE_DEUX, { numero: 'PIEGE-2', statut: 'refusee', motif_refus: 'IBAN suspect.', iban_normalise: IBAN_E, extr: { iban: IBAN_E }, date_decision: '2026-11-02T09:00:00Z' }),
  ];
}

/** Nombre de lignes lues par facture à valider (a12 : une ligne, a1 : trois). */
export const nombreLignes = () => ({ a1: 3, a12: 1 });
