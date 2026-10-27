// PDF des devis chez un client (projet chevalier-ia-app) : les deux fonctions appelables `devisPdf` et `devisPdfLien`, et le déclencheur `devisPdfAuto`.
// Séparé de index.js pour pouvoir l'essayer sans Cloud Functions (comme devis.js) : `db`, `convertir` et `stockage` sont injectés. Le travail est dans serveur/src/devis/
// (copie de functions/src/devis/, le MÊME code que chez Jérôme). On n'importe JAMAIS pdf-appel.js (il porte les comptes autorisés de Jérôme) : les contrôles d'accès sont ceux d'ICI.
//  - le client reçu est une CIBLE à vérifier, jamais une confiance : e-mail vérifié, membre de clients/<client>/membres/<e-mail>, module « devis » actif ;
//  - fabriquer (devisPdf) : éditeurs seulement ; lire (devisPdfLien, lien signé de 5 minutes) : éditeurs ET lecteurs ;
//  - UN SEUL refus neutre « Action non autorisée. » (espace inexistant, non-membre, rôle insuffisant, module inactif) ;
//  - tout est rangé sous clients/<client>/devis/… et lu depuis clients/<client>/ : un autre client est hors d'atteinte (cheminAppartientALEspace avant de signer) ;
//  - le déclencheur ne lève jamais d'erreur et ne fabrique que si le module « devis » est actif sur la fiche du client.
import { logger } from 'firebase-functions';
import { creerAccesFirestore, avecBase, COLLECTIONS as C } from '../serveur/src/coeur/donnees.js';
import { ErreurDevis } from '../serveur/src/coeur/devis.js';
import { fabriquerPdfDevis, MESSAGE_GENERIQUE } from '../serveur/src/devis/pdf-service.js';
import { creerDeclencheurPdf, estFinalisation } from '../serveur/src/devis/pdf-declencheur.js';
import { cheminPdfDevis, cheminAppartientALEspace, DUREE_LIEN_MINUTES } from '../serveur/src/devis/stockage.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';
import { controlerAppelant, MODULE_DEVIS } from './devis.js';

/** Adresse de l'application de la plateforme ; les routes d'un client y sont sous `#/espace/<client>/…` (js/os/router.js). */
export const BASE_LIEN_PLATEFORME = 'https://chevalier-ia-app.web.app';
export const MESSAGE_PDF_NON_CONFIGURE = 'PDF non configuré : l\'espace de stockage des PDF est introuvable.';
const espaceDe = (client) => `clients/${client}/`;
const routeDe = (client) => `espace/${client}`;
const stockageDe = (s) => (typeof s === 'function' ? s() : s) ?? null;
const accesDe = ({ db, creerDonnees }, client) => (creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`));

/** Lit et contrôle la demande : { devisId, brouillon, telecharger } ou null (`telecharger` : booléen facultatif, utilisé par le lien seulement ; la fabrication le refuse si le type est invalide mais l'ignore). */
export function lireDemande(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  const ok = typeof d.devisId === 'string' && d.devisId && d.devisId.length <= 200 && !d.devisId.includes('/') && (d.brouillon === undefined || typeof d.brouillon === 'boolean') && (d.telecharger === undefined || typeof d.telecharger === 'boolean');
  return ok ? { devisId: d.devisId, brouillon: d.brouillon === true, telecharger: d.telecharger === true } : null;
}
const refusDemande = () => new Refus('invalid-argument', 'Identifiant de devis manquant ou invalide.');
const refusNonConfigure = () => new Refus('failed-precondition', MESSAGE_PDF_NON_CONFIGURE);

/**
 * `devisPdf` chez un client : relance la fabrication du PDF d'un devis finalisé (réessai à la demande) ou, avec `brouillon: true`, fabrique le PDF filigrané.
 * Donnée reçue : { client, devisId, brouillon? }. Éditeurs seulement. Rend { statut, lien, nom? } ou lève un Refus.
 * `convertir(html, { pied })` -> { pdf, sha256 } ; `stockage` : l'objet de stockage.js (ou une fonction qui le rend, ou null s'il est introuvable).
 */
export async function fabriquerPdfClient({ db, auth, donnees, convertir, stockage, creerDonnees = null, journal = () => {}, maintenant = Date.now }) {
  const debut = maintenant();
  const { email, client } = await controlerAppelant({ db, auth, client: donnees?.client, roles: ['editeur'] });
  const demande = lireDemande(donnees);
  if (!demande) throw refusDemande();
  const rangement = stockageDe(stockage);
  if (!rangement) { journal({ action: 'pdf', statut: 'refus', code: 'non_configure', dureeMs: maintenant() - debut }); throw refusNonConfigure(); }
  try {
    const ctx = { acteur: email, via: 'ecran', maintenant: new Date(maintenant()) };
    const r = await fabriquerPdfDevis({
      donnees: accesDe({ db, creerDonnees }, client), espace: espaceDe(client), baseLien: BASE_LIEN_PLATEFORME, prefixeRoute: routeDe(client),
      devisId: demande.devisId, brouillon: demande.brouillon, explicite: true, ctx, convertir, stockage: rangement,
    });
    if (r.statut === 'echec') {
      journal({ action: 'pdf', statut: 'erreur', code: String(r.erreur?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new Refus('internal', r.message || MESSAGE_GENERIQUE);
    }
    journal({ action: 'pdf', statut: r.statut === 'ok' ? 'ok' : 'en_cours', dureeMs: maintenant() - debut });
    return { statut: r.statut, lien: r.lien, ...(r.nom ? { nom: r.nom } : {}) };
  } catch (e) {
    if (e instanceof Refus) throw e;
    if (e instanceof ErreurDevis) {
      journal({ action: 'pdf', statut: 'refus', code: e.code, dureeMs: maintenant() - debut });
      throw new Refus({ demande_invalide: 'invalid-argument', introuvable: 'not-found' }[e.code] ?? 'failed-precondition', e.message);
    }
    journal({ action: 'pdf', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
    throw new Refus('internal', MESSAGE_GENERIQUE);
  }
}

/**
 * `devisPdfLien` chez un client : lien de lecture signé de 5 minutes vers le PDF. Éditeurs ET lecteurs du client.
 * Donnée reçue : { client, devisId, brouillon? }. Rend { url, expireDans, nom }. Le chemin lu sur le devis doit être dans clients/<client>/devis/, sinon rien n'est signé.
 */
export async function lienPdfClient({ db, auth, donnees, stockage, creerDonnees = null, journal = () => {}, maintenant = Date.now }) {
  const debut = maintenant();
  const { client } = await controlerAppelant({ db, auth, client: donnees?.client, roles: ['editeur', 'lecteur'] });
  const demande = lireDemande(donnees);
  if (!demande) throw refusDemande();
  const rangement = stockageDe(stockage);
  if (!rangement) { journal({ action: 'pdf_lien', statut: 'refus', code: 'non_configure', dureeMs: maintenant() - debut }); throw refusNonConfigure(); }
  const refus = (code, erreur) => { journal({ action: 'pdf_lien', statut: 'refus', code, dureeMs: maintenant() - debut }); return erreur; };
  const espace = espaceDe(client);
  try {
    const devis = await accesDe({ db, creerDonnees }, client).document(C.devis, demande.devisId);
    if (!devis) throw refus('introuvable', new Refus('not-found', 'Devis introuvable.'));
    let chemin;
    let nom;
    if (demande.brouillon) {
      chemin = cheminPdfDevis({ espace, affaireId: devis.affaireId, devisId: devis.id, brouillon: true });
      nom = 'Brouillon.pdf';
      if (!(await rangement.existe(chemin))) throw refus('absent', new Refus('not-found', 'Aucun PDF brouillon pour ce devis : crée-le d\'abord.'));
    } else {
      if (devis.statut === 'brouillon' || devis.pdf?.statut !== 'ok' || typeof devis.pdf?.chemin !== 'string') throw refus('pas_pret', new Refus('failed-precondition', 'Le PDF de ce devis n\'est pas prêt.'));
      chemin = devis.pdf.chemin;
      nom = typeof devis.pdf.nom === 'string' ? devis.pdf.nom : 'Devis.pdf';
      // Défense en profondeur : un chemin hors du dossier des devis de CE client (celui d'un autre client, par exemple) n'est jamais signé.
      if (!cheminAppartientALEspace(chemin, espace)) throw refus('chemin_refuse', new Refus('permission-denied', 'Ce PDF n\'est pas accessible.'));
    }
    const url = await rangement.lienSigne(chemin, { minutes: DUREE_LIEN_MINUTES, nomAffiche: nom, telecharger: demande.telecharger });
    journal({ action: 'pdf_lien', statut: 'ok', dureeMs: maintenant() - debut });
    return { url, expireDans: DUREE_LIEN_MINUTES * 60, nom };
  } catch (e) {
    if (e instanceof Refus) throw e;
    journal({ action: 'pdf_lien', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
    throw new Refus('internal', /^Stockage : /.test(String(e?.message)) ? e.message : MESSAGE_GENERIQUE);
  }
}

/**
 * Déclencheur `devisPdfAuto` : événement { params: { client, devisId }, data: { before, after } } sur clients/{client}/devis_devis/{devisId}.
 * Ordre : (1) seulement le passage brouillon -> finalisé (aucune lecture sinon) ; (2) identifiant du client valide ; (3) module « devis » actif sur la fiche ; (4) fabrication.
 * Ne lève jamais : un échec de fabrication est noté sur le devis (`pdf.statut = 'echec'`), le devis reste finalisé.
 */
export function creerDeclencheurPdfClient({ db, convertir, stockage, creerDonnees = null, journal = () => {}, maintenant = Date.now }) {
  return async function gestionnaire(evenement) {
    try {
      const avant = evenement?.data?.before?.data?.();
      const apres = evenement?.data?.after?.data?.();
      if (!estFinalisation(avant, apres)) return { suite: 'ignore' };
      const client = evenement?.params?.client;
      if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client) || client === 'interne') {
        journal({ action: 'pdf_auto', statut: 'refus', code: 'client_invalide', dureeMs: 0 });
        return { suite: 'ignore' };
      }
      const fiche = await db.doc(`clients/${client}`).get();
      if (!fiche.exists || fiche.get('modules')?.[MODULE_DEVIS] !== true) {
        journal({ action: 'pdf_auto', statut: 'refus', code: 'module_inactif', dureeMs: 0 });
        return { suite: 'ignore' };
      }
      return await creerDeclencheurPdf({
        donnees: () => accesDe({ db, creerDonnees }, client), espace: espaceDe(client), baseLien: BASE_LIEN_PLATEFORME, prefixeRoute: routeDe(client),
        convertir, stockage, journal, maintenant,
      })(evenement);
    } catch (e) {
      logger.error('Devis : erreur inattendue (PDF automatique)', { nom: e?.name });
      return { suite: 'erreur' };
    }
  };
}
