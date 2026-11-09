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


// Logo de l'ESPACE (Réglages > Mon espace) : le serveur le lit lui-même dans le stockage (jamais par l'adresse de la fiche : pas de requête sortante, pas de SSRF), contrôle ses premiers octets et sa taille,
// puis l'intègre en data:image. Trop lourd, d'un autre format ou illisible : le PDF est fait SANS logo et le résultat porte `avertissement` (jamais un échec du PDF).
export const LOGO_OCTETS_MAX = 2 * 1024 * 1024; // = OCTETS_LOGO de functions-plateforme/src/espace.js (plafond de l'envoi : un logo accepté par « Mon espace » passe dans le PDF ; un test le verrouille)
export const LOGO_DELAI_MS = 6000;
export const AVERTISSEMENTS_LOGO = Object.freeze({
  trop_lourd: 'Le logo de l’espace est trop lourd pour le PDF (2 Mo au plus) : le PDF est fait sans logo. Choisis un logo plus léger dans Réglages > Mon espace.',
  format: 'Le logo de l’espace n’est pas un PNG, un JPG ou un WebP : le PDF est fait sans logo. Choisis une autre image dans Réglages > Mon espace.',
  illisible: 'Le logo de l’espace n’a pas pu être lu : le PDF est fait sans logo.',
});
const octetsCommencentPar = (o, debut) => debut.every((x, i) => o[i] === x);
/** Type d'une image d'après ses PREMIERS OCTETS (jamais d'après un nom ni un type annoncé) : mime ou null. */
export function mimeDesOctets(octets) {
  if (!Buffer.isBuffer(octets)) return null;
  if (octetsCommencentPar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (octetsCommencentPar(octets, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (octets.length >= 12 && octets.subarray(0, 4).toString('latin1') === 'RIFF' && octets.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
/** Octets d'un logo -> { logo: 'data:image/…;base64,…' } ou { raison: 'trop_lourd' | 'format' | 'illisible' }. */
export function logoEnDataUrl(octets) {
  if (!Buffer.isBuffer(octets) || !octets.length) return { raison: 'illisible' };
  const mime = mimeDesOctets(octets);
  if (!mime) return { raison: 'format' };
  if (octets.length > LOGO_OCTETS_MAX) return { raison: 'trop_lourd' };
  return { logo: `data:${mime};base64,${octets.toString('base64')}` };
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
 * `lireLogo` (facultatif) : () => Promise<Buffer | { raison: 'trop_lourd' } | null>, les octets du logo de l'espace (ou { raison } si le fichier est trop gros) (chez un client) ; absent chez Jérôme, où `emetteur.logo` est la seule source.
 * `donnees` : accès aux données DÉJÀ cadré sur le bon espace ; `espace` : '' (Jérôme) ou 'clients/<client>/' (préfixe des chemins Storage).
 * Rend { statut: 'ok' | 'en_cours' | 'echec', lien, nom?, deja?, definitif?, message?, erreur? }. Ne lève que pour un devis introuvable ou une demande refusée (brouillon).
 */
export async function fabriquerPdfDevis({ donnees, espace = '', baseLien, prefixeRoute = '', devisId, brouillon = false, explicite = false, ctx, convertir, stockage, tentativesMax = TENTATIVES_AUTO_MAX, lireLogo = null, delaiLogoMs = LOGO_DELAI_MS }) {
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
    let emetteur = D.emetteurImprime(emetteurSansLogoExterne(brutEmetteur ? enDates(brutEmetteur) : {}), reglages?.mentionEmetteur, reglages?.mentionTvaReduite);
    // Logo : celui de « Mon entreprise » (data:) s'il existe, sinon celui de l'espace lu par le serveur ; tout échec donne un PDF sans logo et un avertissement.
    let avertissement;
    if (!emetteur.logo && typeof lireLogo === 'function') {
      try {
        // Délai court : un stockage qui ne répond pas donne « illisible » et un PDF sans logo, jamais un échec ni une attente sans fin.
        let minuteur;
        const octets = await Promise.race([lireLogo(), new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error('délai')), delaiLogoMs); })]).finally(() => clearTimeout(minuteur));
        if (octets?.raison && !Buffer.isBuffer(octets)) avertissement = AVERTISSEMENTS_LOGO[octets.raison] ?? AVERTISSEMENTS_LOGO.illisible;
        else if (octets) {
          const r = logoEnDataUrl(octets);
          if (r.logo) emetteur = { ...emetteur, logo: r.logo }; else avertissement = AVERTISSEMENTS_LOGO[r.raison];
        }
      } catch { avertissement = AVERTISSEMENTS_LOGO.illisible; }
    }

    // Vue client : jamais de prix d'achat, de marge ni de coefficient (garanti par vueClient, vérifié par les tests).
    const vue = D.vueClient(devis, { clientNom: fiche?.nom ?? null, attentionNom: personne?.nom ?? null });
    // Réglage « Gestion des déchets » éteint (Réglages > Devis) : le bloc n'est pas imprimé. Les cases « Options » de chaque devis ne sont pas appliquées au PDF officiel (comportement inchangé).
    const sansDechets = D.gestionDechetsActive(reglages) ? {} : { affichage: { cacherDechets: true } };
    const html = devisHtml(vue, { emetteur, ...(brouillon ? { brouillon: true } : {}), ...sansDechets });
    const { pdf, sha256 } = await convertir(html, { pied: brouillon ? piedParDefaut('Brouillon', { version: devis.version ?? 1, genereLe: ctx?.maintenant ?? new Date() }) : piedParDefaut(devis.numero ?? '') });

    const chemin = cheminPdfDevis({ espace, affaireId: devis.affaireId, devisId, brouillon, nomFichier: nomFichierDevis({ numero: devis.numero, version: devis.version, objet: devis.objet }) });
    await stockage.envoyer(chemin, pdf);
    const libelle = libelleDocumentDevis({ numero: devis.numero, version: devis.version, objet: devis.objet, brouillon, date: ctx?.maintenant });
    if (brouillon) return { statut: 'ok', lien, nom: libelle, brouillon: true, ...(avertissement ? { avertissement } : {}) };
    await terminerPdf({ donnees, ctx, devisId, chemin, sha256, libelle });
    return { statut: 'ok', lien, nom: libelle, ...(avertissement ? { avertissement } : {}) };
  } catch (e) {
    const message = messageLisible(e);
    // Le devis reste finalisé ; l'échec est noté (sauf pour un brouillon à la demande, qui n'a pas d'état).
    if (!brouillon) {
      try { await echouerPdf({ donnees, ctx, devisId, message }); } catch { /* si même cette écriture échoue, l'« en cours » expirera tout seul */ }
    }
    return { statut: 'echec', lien, message, erreur: e };
  }
}
