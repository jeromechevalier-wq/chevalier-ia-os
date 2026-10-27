// Fonctions appelables du PDF d'un devis :
//  - `devisPdf({ devisId, brouillon? })` : relance la fabrication pour un devis finalisé dont le PDF n'est pas « ok » (réessai à la demande, rattrapage des devis déjà finalisés),
//    ou, avec `brouillon: true`, fabrique un PDF filigrané « BROUILLON » (nom fixe : il remplace le précédent, le champ `pdf` du devis n'est pas touché) ;
//  - `devisPdfLien({ devisId, brouillon?, telecharger? })` : un lien de lecture signé de très courte durée (5 minutes) vers le PDF rangé dans Cloud Storage.
// Réservées aux comptes autorisés (comme les autres fonctions du module Devis). Le PDF d'un devis qui vient d'être finalisé n'est PAS fabriqué ici mais par le déclencheur (pdf-declencheur.js).
// Le journal Cloud ne reçoit jamais le contenu du devis, ni son identifiant, ni l'adresse de l'appelant, ni un lien.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from '../veille/appel.js';
import { exigerCompteAutorise, enErreurAppel } from '../devis-appel.js';
import { COLLECTIONS as C } from '../coeur/donnees.js';
import { convertirHtmlEnPdf } from './chromium.js';
import { fabriquerPdfDevis, MESSAGE_GENERIQUE } from './pdf-service.js';
import { cheminPdfDevis, cheminAppartientALEspace, DUREE_LIEN_MINUTES } from './stockage.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'dureeMs'];
export const MESSAGE_PDF_NON_CONFIGURE = 'PDF non configuré : l\'espace de stockage des PDF est introuvable.';

export function ligneDeJournalDevisPdf(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'devisPdf' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

const stockageDe = (s) => (typeof s === 'function' ? s() : s) ?? null;

/** Lit et contrôle la demande : { devisId, brouillon, telecharger }. `telecharger` (booléen facultatif) n'est utilisé que par devisPdfLien ; devisPdf l'ignore mais refuse un type invalide. */
function lireDemande(requete) {
  const d = requete.data && typeof requete.data === 'object' ? requete.data : {};
  const ok = typeof d.devisId === 'string' && d.devisId && d.devisId.length <= 200 && !d.devisId.includes('/') && (d.brouillon === undefined || typeof d.brouillon === 'boolean') && (d.telecharger === undefined || typeof d.telecharger === 'boolean');
  return ok ? { devisId: d.devisId, brouillon: d.brouillon === true, telecharger: d.telecharger === true } : null;
}

/**
 * `donnees()` : accès aux données déjà cadré sur l'espace ; `espace` : '' (Jérôme) ou 'clients/<client>/' ; `baseLien` : adresse de l'application (pour l'adresse stable du PDF).
 * `convertir(html, { pied })` -> { pdf, sha256 } ; `stockage` : { envoyer, ... } (voir stockage.js) ou fonction qui le rend, ou null si le stockage est introuvable.
 */
export function creerAppelDevisPdf({ donnees, espace = '', baseLien = '', comptes = COMPTES_AUTORISES, convertir, stockage, journal = () => {}, maintenant = Date.now }) {
  const faireConvertir = convertir ?? ((html, options) => convertirHtmlEnPdf(html, options));
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = exigerCompteAutorise(requete, comptes);
    const refuser = (code, erreur) => { journal({ action: 'pdf', statut: 'refus', code, dureeMs: maintenant() - debut }); return erreur; };
    const demande = lireDemande(requete);
    if (!demande) throw refuser('demande_invalide', new HttpsError('invalid-argument', 'Identifiant de devis manquant ou invalide.'));
    const rangement = stockageDe(stockage);
    if (!rangement) throw refuser('non_configure', new HttpsError('failed-precondition', MESSAGE_PDF_NON_CONFIGURE, { code: 'non_configure' }));
    try {
      const ctx = { acteur: String(jeton.email).toLowerCase(), via: 'ecran', maintenant: new Date(maintenant()) };
      const r = await fabriquerPdfDevis({
        donnees: donnees(), espace, baseLien, devisId: demande.devisId, brouillon: demande.brouillon, explicite: true, ctx, convertir: faireConvertir, stockage: rangement,
      });
      if (r.statut === 'echec') {
        journal({ action: 'pdf', statut: 'erreur', code: String(r.erreur?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
        throw new HttpsError('internal', r.message || MESSAGE_GENERIQUE);
      }
      journal({ action: 'pdf', statut: r.statut === 'ok' ? 'ok' : 'en_cours', dureeMs: maintenant() - debut });
      return { statut: r.statut, lien: r.lien, ...(r.nom ? { nom: r.nom } : {}) };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      const erreur = enErreurAppel(e);
      if (erreur) { journal({ action: 'pdf', statut: 'refus', code: e.code, dureeMs: maintenant() - debut }); throw erreur; }
      journal({ action: 'pdf', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', MESSAGE_GENERIQUE);
    }
  };
}

/** Lien signé de courte durée vers le PDF d'un devis. Le chemin lu sur le devis doit appartenir au dossier des devis de CET espace, sinon rien n'est signé. */
export function creerAppelDevisPdfLien({ donnees, espace = '', comptes = COMPTES_AUTORISES, stockage, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    exigerCompteAutorise(requete, comptes);
    const refuser = (code, erreur) => { journal({ action: 'pdf_lien', statut: 'refus', code, dureeMs: maintenant() - debut }); return erreur; };
    const demande = lireDemande(requete);
    if (!demande) throw refuser('demande_invalide', new HttpsError('invalid-argument', 'Identifiant de devis manquant ou invalide.'));
    const rangement = stockageDe(stockage);
    if (!rangement) throw refuser('non_configure', new HttpsError('failed-precondition', MESSAGE_PDF_NON_CONFIGURE, { code: 'non_configure' }));
    try {
      const devis = await donnees().document(C.devis, demande.devisId);
      if (!devis) throw refuser('introuvable', new HttpsError('not-found', 'Devis introuvable.'));
      let chemin;
      let nom;
      if (demande.brouillon) {
        chemin = cheminPdfDevis({ espace, affaireId: devis.affaireId, devisId: devis.id, brouillon: true });
        nom = 'Brouillon.pdf';
        if (!(await rangement.existe(chemin))) throw refuser('absent', new HttpsError('not-found', 'Aucun PDF brouillon pour ce devis : crée-le d\'abord.'));
      } else {
        if (devis.statut === 'brouillon' || devis.pdf?.statut !== 'ok' || typeof devis.pdf?.chemin !== 'string') {
          throw refuser('pas_pret', new HttpsError('failed-precondition', 'Le PDF de ce devis n\'est pas prêt.', { code: 'pas_pret' }));
        }
        chemin = devis.pdf.chemin;
        nom = typeof devis.pdf.nom === 'string' ? devis.pdf.nom : 'Devis.pdf';
        // Défense en profondeur : un chemin qui sortirait du dossier des devis de cet espace n'est jamais signé.
        if (!cheminAppartientALEspace(chemin, espace)) throw refuser('chemin_refuse', new HttpsError('permission-denied', 'Ce PDF n\'est pas accessible.'));
      }
      const url = await rangement.lienSigne(chemin, { minutes: DUREE_LIEN_MINUTES, nomAffiche: nom, telecharger: demande.telecharger });
      journal({ action: 'pdf_lien', statut: 'ok', dureeMs: maintenant() - debut });
      return { url, expireDans: DUREE_LIEN_MINUTES * 60, nom };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      journal({ action: 'pdf_lien', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', /^Stockage : /.test(String(e?.message)) ? e.message : MESSAGE_GENERIQUE);
    }
  };
}
