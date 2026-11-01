// Fabrication du PDF d'un devis : le travail commun au déclencheur Firestore (dès qu'un devis passe de brouillon à finalisé) et à la fonction appelable `devisPdf`.
// Tout ce qui touche au réseau est injecté (`convertir`, `stockage`) : les tests n'appellent rien de réel. Aucun secret ici.
//
// Règles (décisions de Jérôme, 25/10/2026) :
//  - la finalisation ne dépend JAMAIS du PDF : un échec est noté sur le devis (`pdf.statut = 'echec'`, message court), le devis reste finalisé ;
//  - idempotent : PDF déjà « ok » -> le même ; « en_cours » -> on répond « en cours » sans refuser ni refabriquer ; absent ou « echec » -> on fabrique ;
//  - garde-fou : au plus TENTATIVES_AUTO_MAX tentatives automatiques par version, ensuite échec définitif jusqu'à une demande explicite ;
//  - le brouillon à la demande a un nom fixe qui REMPLACE le précédent et ne touche pas `pdf` ;
//  - le serveur n'ajoute RIEN aux Documents de l'affaire (27/10/2026) : le PDF vit dans l'onglet « Devis ».
import { COLLECTIONS as C } from '../coeur/donnees.js';
import { ID_REGLAGES, reserverPdf, terminerPdf, echouerPdf, ErreurDevis, TENTATIVES_AUTO_MAX } from '../coeur/devis.js';
import * as D from '../../partage/devis.js';
import { devisHtml } from '../../partage/devis-document.js';
import { piedParDefaut } from './chromium.js';
import { nomFichierDevis, libelleDocumentDevis, cheminPdfDevis } from './stockage.js';

/** Les dates lues dans Firestore (Timestamp) deviennent des Date (les copies profondes de partage/devis.js les gardent ainsi intactes). */
export const enDates = (v) => {
  if (v && typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (Array.isArray(v)) return v.map(enDates);
  if (v && typeof v === 'object' && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enDates(x)]));
  return v;
};

// SSRF : le logo ne sert que s'il est une image intégrée (data:) de taille raisonnable. Toute adresse https est retirée avant le rendu (et Chromium bloque de toute façon tout le réseau).
const LOGO_INTEGRE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_TAILLE_MAX = 1_500_000;
export function emetteurSansLogoExterne(emetteur) {
  const { logo, ...reste } = emetteur ?? {};
  return typeof logo === 'string' && logo.length <= LOGO_TAILLE_MAX && LOGO_INTEGRE.test(logo) ? { ...reste, logo } : reste;
}

/** Message d'erreur lisible (écrit pour l'être, sans HTML ni chemin) ou, sinon, un message générique. */
export const MESSAGE_GENERIQUE = 'Une erreur est survenue. Réessaie.';
export function messageLisible(e) {
  return /^(PDF|Stockage) : /.test(String(e?.message ?? '')) ? String(e.message) : MESSAGE_GENERIQUE;
}

/** Adresse STABLE du PDF dans l'application (jamais une adresse signée qui expire, jamais une adresse publique) : l'application demande ensuite un lien signé à `devisPdfLien`. */
export function lienStablePdf(baseLien, devisId, brouillon = false, prefixeRoute = '') {
  const base = String(baseLien ?? '').replace(/\/+$/, '');
  // `prefixeRoute` : '' chez Jérôme ; 'espace/<client>' chez un client (les routes y sont sous ce préfixe de hash : js/os/router.js, routeDansEspace de js/os/marque.js).
  const prefixe = String(prefixeRoute ?? '').replace(/^\/+|\/+$/g, '');
  return `${base}/#/${prefixe ? `${prefixe}/` : ''}devis/pdf/${encodeURIComponent(devisId)}${brouillon ? '/brouillon' : ''}`;
}

/**
 * `donnees` : accès aux données DÉJÀ cadré sur le bon espace ; `espace` : '' (Jérôme) ou 'clients/<client>/' (préfixe des chemins Storage).
 * Rend { statut: 'ok' | 'en_cours' | 'echec', lien, nom?, deja?, definitif?, message?, erreur? }. Ne lève que pour un devis introuvable ou une demande refusée (brouillon).
 */
export async function fabriquerPdfDevis({ donnees, espace = '', baseLien, prefixeRoute = '', devisId, brouillon = false, explicite = false, ctx, convertir, stockage, tentativesMax = TENTATIVES_AUTO_MAX }) {
  const lien = lienStablePdf(baseLien, devisId, brouillon, prefixeRoute);
  let devis;
  if (brouillon) {
    const brut = await donnees.document(C.devis, devisId);
    if (!brut) throw new ErreurDevis('introuvable', 'Devis introuvable.');
    if (brut.statut !== 'brouillon') throw new ErreurDevis('transition_interdite', 'Ce devis est déjà finalisé : le PDF brouillon ne sert que tant que le devis est un brouillon.');
    devis = enDates(brut);
  } else {
    const r = await reserverPdf({ donnees, ctx, devisId, explicite, tentativesMax });
    devis = r.devis;
    if (r.action === 'rien') {
      return {
        statut: r.statut, lien, ...(r.statut === 'ok' ? { nom: devis.pdf?.nom, deja: true } : {}),
        ...(r.definitif ? { definitif: true, message: devis.pdf?.message } : {}),
      };
    }
  }
  try {
    const reglages = await donnees.document(C.devisParametres, ID_REGLAGES);
    const fiche = devis.organisationId ? await donnees.document(C.organisations, devis.organisationId)
      : devis.personneId ? await donnees.document(C.personnes, devis.personneId) : null;
    // « À l'attention de » : la personne n'est imprimée que si le devis a une organisation ET une personne (une fiche supprimée entre-temps : pas de ligne).
    const personne = devis.organisationId && devis.personneId ? await donnees.document(C.personnes, devis.personneId).catch(() => null) : null; // ligne facultative : une lecture qui échoue ne bloque pas le PDF
    // « Mon entreprise » est enregistrée par l'écran sous `entreprise` (donnees.js) ; `emetteur` n'est lu qu'en repli (ancien nom).
    const brutEmetteur = [reglages?.entreprise, reglages?.emetteur].find((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length);
    // Lu en direct à chaque impression (rien n'est figé, sauf le texte de la mention de TVA réduite, figé dans le devis à la finalisation : mentionTvaReduiteFigee) : « Mon entreprise » les textes « Attestation et mentions » et « Mention de TVA réduite » des réglages, comme à l'écran.
    const emetteur = D.emetteurImprime(emetteurSansLogoExterne(brutEmetteur ? enDates(brutEmetteur) : {}), reglages?.mentionEmetteur, reglages?.mentionTvaReduite);

    // Vue client : jamais de prix d'achat, de marge ni de coefficient (garanti par vueClient, vérifié par les tests).
    const vue = D.vueClient(devis, { clientNom: fiche?.nom ?? null, attentionNom: personne?.nom ?? null });
    // Réglage « Gestion des déchets » éteint (Réglages > Devis) : le bloc n'est pas imprimé. Les cases « Options » de chaque devis ne sont pas appliquées au PDF officiel (comportement inchangé).
    const sansDechets = D.gestionDechetsActive(reglages) ? {} : { affichage: { cacherDechets: true } };
    const html = devisHtml(vue, { emetteur, ...(brouillon ? { brouillon: true } : {}), ...sansDechets });
    const { pdf, sha256 } = await convertir(html, { pied: brouillon ? piedParDefaut('Brouillon', { version: devis.version ?? 1, genereLe: ctx?.maintenant ?? new Date() }) : piedParDefaut(devis.numero ?? '') });

    const chemin = cheminPdfDevis({ espace, affaireId: devis.affaireId, devisId, brouillon, nomFichier: nomFichierDevis({ numero: devis.numero, version: devis.version, objet: devis.objet }) });
    await stockage.envoyer(chemin, pdf);
    const libelle = libelleDocumentDevis({ numero: devis.numero, version: devis.version, objet: devis.objet, brouillon, date: ctx?.maintenant });
    if (brouillon) return { statut: 'ok', lien, nom: libelle, brouillon: true };
    await terminerPdf({ donnees, ctx, devisId, chemin, sha256, libelle });
    return { statut: 'ok', lien, nom: libelle };
  } catch (e) {
    const message = messageLisible(e);
    // Le devis reste finalisé ; l'échec est noté (sauf pour un brouillon à la demande, qui n'a pas d'état).
    if (!brouillon) {
      try { await echouerPdf({ donnees, ctx, devisId, message }); } catch { /* si même cette écriture échoue, l'« en cours » expirera tout seul */ }
    }
    return { statut: 'echec', lien, message, erreur: e };
  }
}
