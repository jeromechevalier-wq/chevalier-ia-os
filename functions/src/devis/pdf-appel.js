// Fonction appelable `devisPdf({ devisId })` : fabrique le PDF d'un devis finalisé, le range dans Drive et note le résultat sur le devis.
// Branche les briques déjà écrites : le document HTML (partage/devis-document.js), Chromium dans la fonction (chromium.js) et Drive (drive.js).
// Tout ce qui touche au réseau est injecté (`convertir`, `ranger`) : les tests n'appellent rien de réel. Aucun secret ici.
// Le journal Cloud ne reçoit jamais le contenu du devis, ni son identifiant, ni l'adresse de l'appelant.
//
// Décisions prises seul :
// - Un brouillon est refusé (pas de PDF « brouillon » filigrané dans cette version).
// - L'identité de l'entreprise est le champ `emetteur` du document `devis_parametres/reglages` (objet vide s'il est absent).
// - Le champ `pdf` est écrit par cette fonction seule, avec une ligne de journal (comme les autres transitions de devis).
// - Le dossier Drive de l'affaire est celui de son « dossier de travail » (`urlDossier`) s'il pointe vers Drive ; sinon un dossier à son nom est créé sous le dossier racine.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from '../veille/appel.js';
import { exigerCompteAutorise } from '../devis-appel.js';
import { COLLECTIONS as C } from '../coeur/donnees.js';
import { enregistrerPdf, ID_REGLAGES } from '../coeur/devis.js';
import * as D from '../../partage/devis.js';
import { devisHtml } from '../../partage/devis-document.js';
import { convertirHtmlEnPdf, piedParDefaut } from './chromium.js';
import { rangerPdfDevis, nomFichierDevis, creerClientDrive, authGoogleDrive } from './drive.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'dureeMs'];
export const MESSAGE_PDF_NON_CONFIGURE = 'PDF non configuré : le dossier Drive racine des devis manque.';
// Même motif que js/os/google-drive.js (idDossierDrive) : un dossier Drive reconnu à son adresse.
const MOTIF_DOSSIER_DRIVE = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})(?:[/?#]\S*)?$/;

export function ligneDeJournalDevisPdf(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'devisPdf' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

/** Les dates lues dans Firestore (Timestamp) deviennent des Date (les copies profondes de partage/devis.js les gardent ainsi intactes). */
const enDates = (v) => {
  if (v && typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (Array.isArray(v)) return v.map(enDates);
  if (v && typeof v === 'object' && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enDates(x)]));
  return v;
};

// SSRF : le logo ne sert que s'il est une image intégrée (data:) de taille raisonnable. Toute adresse https est retirée avant le rendu (et Chromium bloque de toute façon tout le réseau).
const LOGO_INTEGRE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_TAILLE_MAX = 1_500_000;
export const DELAI_ENTRE_PDF_MS = 60_000;
export function emetteurSansLogoExterne(emetteur) {
  const { logo, ...reste } = emetteur ?? {};
  return typeof logo === 'string' && logo.length <= LOGO_TAILLE_MAX && LOGO_INTEGRE.test(logo) ? { ...reste, logo } : reste;
}
const idDossierDrive = (url) => MOTIF_DOSSIER_DRIVE.exec(String(url ?? '').trim())?.[1] ?? '';

/**
 * `config` : { driveRacineId } (lus dans l'environnement de la fonction).
 * `convertir(html, { pied })` -> { pdf, sha256 } ; `ranger({ dossierParentId, dossierRacineId, nomAffaire, nomFichier, pdf })` -> { fileId, lien }.
 * Sans ces deux fonctions injectées, ce sont les vraies (Chromium dans la fonction et API Drive, avec l'identité du compte de service de la fonction).
 */
export function creerAppelDevisPdf({ donnees, config = {}, comptes = COMPTES_AUTORISES, convertir, ranger, journal = () => {}, maintenant = Date.now }) {
  const faireConvertir = convertir ?? ((html, options) => convertirHtmlEnPdf(html, options));
  const faireRanger = ranger ?? ((args) => rangerPdfDevis({ drive: creerClientDrive({ auth: authGoogleDrive() }), ...args }));
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = exigerCompteAutorise(requete, comptes);
    const devisId = requete.data && typeof requete.data === 'object' ? requete.data.devisId : undefined;
    const refuser = (code, erreur) => { journal({ action: 'pdf', statut: 'refus', code, dureeMs: maintenant() - debut }); return erreur; };
    if (typeof devisId !== 'string' || !devisId || devisId.length > 200 || devisId.includes('/')) {
      throw refuser('demande_invalide', new HttpsError('invalid-argument', 'Identifiant de devis manquant ou invalide.'));
    }
    if (!config.driveRacineId) {
      throw refuser('non_configure', new HttpsError('failed-precondition', MESSAGE_PDF_NON_CONFIGURE, { code: 'non_configure' }));
    }
    try {
      const base = donnees();
      const brut = await base.document(C.devis, devisId);
      if (!brut) throw refuser('introuvable', new HttpsError('not-found', 'Devis introuvable.'));
      const devis = enDates(brut);
      if (devis.statut === 'brouillon') {
        throw refuser('brouillon', new HttpsError('failed-precondition', 'Ce devis est encore un brouillon : finalise-le avant de créer le PDF.', { code: 'brouillon' }));
      }
      // Double génération : un PDF posé il y a moins d'une minute fait refuser la demande.
      const ecoule = devis.pdf?.genereLe instanceof Date ? maintenant() - devis.pdf.genereLe.getTime() : Infinity;
      if (ecoule >= 0 && ecoule < DELAI_ENTRE_PDF_MS) {
        throw refuser('trop_tot', new HttpsError('failed-precondition', 'PDF déjà en cours ou généré à l\'instant, réessaie dans une minute.', { code: 'trop_tot' }));
      }
      const affaire = devis.affaireId ? await base.document(C.affaires, devis.affaireId) : null;
      const reglages = await base.document(C.devisParametres, ID_REGLAGES);
      const fiche = devis.organisationId ? await base.document(C.organisations, devis.organisationId)
        : devis.personneId ? await base.document(C.personnes, devis.personneId) : null;
      const emetteur = emetteurSansLogoExterne(reglages?.emetteur && typeof reglages.emetteur === 'object' ? enDates(reglages.emetteur) : {});
      const dossierParentId = idDossierDrive(affaire?.urlDossier);

      // Vue client : jamais de prix d'achat, de marge ni de coefficient (garanti par vueClient, vérifié par les tests).
      const vue = D.vueClient(devis, { clientNom: fiche?.nom ?? null, dossierDriveId: dossierParentId || null });
      const html = devisHtml(vue, { emetteur });
      const { pdf, sha256 } = await faireConvertir(html, { pied: piedParDefaut(devis.numero ?? '') });
      const nomFichier = nomFichierDevis({ numero: devis.numero, version: devis.version, objet: devis.objet });
      const { fileId, lien } = await faireRanger({
        dossierParentId: dossierParentId || undefined, dossierRacineId: config.driveRacineId,
        nomAffaire: affaire?.nom ?? affaire?.titre ?? '', nomFichier, pdf,
      });

      // Écriture du seul champ `pdf` (et sa ligne de journal), à la fin : rien n'est noté si la conversion ou le rangement ont échoué.
      const ctx = { acteur: String(jeton.email).toLowerCase(), via: 'ecran', maintenant: new Date(maintenant()) };
      await enregistrerPdf({ donnees: base, ctx, devisId, pdf: { fileId, lien, sha256 } });
      journal({ action: 'pdf', statut: 'ok', dureeMs: maintenant() - debut });
      return { lien, fileId };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      journal({ action: 'pdf', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      // Les messages des briques PDF (« PDF : … », « Drive : … ») sont écrits pour être lus et ne contiennent ni HTML ni jeton.
      const lisible = /^(PDF|Drive) : /.test(String(e?.message ?? ''));
      throw new HttpsError('internal', lisible ? e.message : 'Une erreur est survenue. Réessaie.');
    }
  };
}
