// Règles des fichiers déposés dans l'onglet « Documents » (fichiers rangés chez nous, dans Cloud Storage) : types acceptés, taille, nom.
// Fichier pur, sans import : le MÊME code contrôle le fichier dans le navigateur (message tout de suite) et sur le serveur (le seul contrôle qui compte :
// ne jamais faire confiance à ce que dit le navigateur). Copié dans functions/partage/ par scripts/preparer-fonctions.js.
//
// Ce qui est accepté : PDF, images (PNG, JPEG, WebP, GIF, HEIC), Office (doc, docx, xls, xlsx, ppt, pptx, odt, ods), texte (txt, csv, md), zip.
// Ce qui est refusé : tout le reste, en particulier les programmes et scripts, le HTML et le SVG (qui peuvent contenir du code), et tout type inconnu.
// Le contrôle porte sur l'EXTENSION (dernière, et aussi les extensions du milieu : « x.exe.pdf »), sur le type ANNONCÉ, et sur les premiers octets du fichier (côté serveur).

export const TAILLE_DEFAUT_MO = 25;
export const TAILLE_MIN_MO = 1;
export const TAILLE_MAX_REGLAGE_MO = 25;
/** Plafond technique de l'envoi par la fonction (le corps d'un appel est limité à ~32 Mo, base64 compris). Au-delà : envoi direct, pas encore disponible. */
export const PLAFOND_APPEL_MO = 20;
export const TAILLE_NOM_MAX = 120;
/** Le MCP ne reçoit que du texte (un assistant ne peut pas émettre les octets d'un PDF) : taille maximale du texte déposé par un outil. */
export const TEXTE_MCP_MAX_OCTETS = 64 * 1024;
const OCTET_PAR_MO = 1024 * 1024;

const ZIP = ['application/zip', 'application/x-zip-compressed'];
const TEXTE = ['text/plain'];

/** extension -> { type (celui qu'on enregistre et qu'on servira), accepte (types annoncés admis), famille, signature }. */
export const TYPES = Object.freeze({
  pdf: { type: 'application/pdf', accepte: ['application/pdf'], famille: 'pdf', signature: 'pdf' },
  png: { type: 'image/png', accepte: ['image/png'], famille: 'image', signature: 'png' },
  jpg: { type: 'image/jpeg', accepte: ['image/jpeg', 'image/pjpeg'], famille: 'image', signature: 'jpeg' },
  jpeg: { type: 'image/jpeg', accepte: ['image/jpeg', 'image/pjpeg'], famille: 'image', signature: 'jpeg' },
  webp: { type: 'image/webp', accepte: ['image/webp'], famille: 'image', signature: 'webp' },
  gif: { type: 'image/gif', accepte: ['image/gif'], famille: 'image', signature: 'gif' },
  heic: { type: 'image/heic', accepte: ['image/heic', 'image/heif', 'image/heic-sequence'], famille: 'image', signature: 'heic' },
  heif: { type: 'image/heif', accepte: ['image/heic', 'image/heif', 'image/heif-sequence'], famille: 'image', signature: 'heic' },
  doc: { type: 'application/msword', accepte: ['application/msword'], famille: 'office', signature: 'ole' },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', accepte: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], famille: 'office', signature: 'zip' },
  xls: { type: 'application/vnd.ms-excel', accepte: ['application/vnd.ms-excel'], famille: 'office', signature: 'ole' },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', accepte: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], famille: 'office', signature: 'zip' },
  ppt: { type: 'application/vnd.ms-powerpoint', accepte: ['application/vnd.ms-powerpoint'], famille: 'office', signature: 'ole' },
  pptx: { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', accepte: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], famille: 'office', signature: 'zip' },
  odt: { type: 'application/vnd.oasis.opendocument.text', accepte: ['application/vnd.oasis.opendocument.text'], famille: 'office', signature: 'zip' },
  ods: { type: 'application/vnd.oasis.opendocument.spreadsheet', accepte: ['application/vnd.oasis.opendocument.spreadsheet'], famille: 'office', signature: 'zip' },
  txt: { type: 'text/plain', accepte: TEXTE, famille: 'texte', signature: 'texte' },
  csv: { type: 'text/csv', accepte: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'], famille: 'texte', signature: 'texte' },
  md: { type: 'text/markdown', accepte: ['text/markdown', 'text/x-markdown', 'text/plain'], famille: 'texte', signature: 'texte' },
  zip: { type: 'application/zip', accepte: ZIP, famille: 'archive', signature: 'zip' },
});

/** Types annoncés qui ne disent rien (certains navigateurs n'en donnent pas pour .md ou .heic) : l'extension et les premiers octets décident alors. */
const TYPES_NEUTRES = ['', 'application/octet-stream', 'binary/octet-stream'];

/** Extensions qui ne doivent apparaître NULLE PART dans le nom (« facture.exe.pdf » est refusé aussi). */
const DANGEREUSES = new Set([
  'exe', 'com', 'bat', 'cmd', 'scr', 'msi', 'dll', 'lnk', 'pif', 'jar', 'apk', 'app', 'dmg', 'deb', 'rpm', 'bin', 'cpl', 'gadget', 'hta', 'reg', 'inf', 'msp', 'sys',
  'js', 'mjs', 'cjs', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'bash', 'zsh', 'csh', 'py', 'pl', 'rb', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'swf',
  'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'xslt', 'mht', 'mhtml', 'url', 'webloc', 'iso', 'img', 'docm', 'xlsm', 'pptm', 'dotm', 'xlam',
]);

export const EXTENSIONS_ACCEPTEES = Object.freeze(Object.keys(TYPES));
/** Pour le sélecteur de fichier de l'écran (attribut accept). */
export const ACCEPT_HTML = EXTENSIONS_ACCEPTEES.map((e) => `.${e}`).join(',');

/** Phrase d'aide : ce qu'on peut déposer. */
export const TYPES_ACCEPTES_TEXTE = 'PDF, images (PNG, JPEG, WebP, GIF, HEIC), Word, Excel, PowerPoint, OpenDocument, texte (txt, csv, md) et zip';

/** Dernière extension en minuscules (sans le point), '' s'il n'y en a pas. */
export function extensionDe(nom) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(nom ?? ''));
  return m ? m[1].toLowerCase() : '';
}

/**
 * Nom propre : sans chemin (« ../x.pdf » -> « x.pdf »), sans caractères de contrôle ni caractères interdits, espaces réduits, pas de point en tête, 120 caractères au plus
 * (l'extension est gardée), accents conservés. Rend { ok: true, nom } ou { ok: false, erreur }. Refuse « . », « .. », un nom vide après nettoyage et un nom sans extension.
 */
export function nettoyerNomFichier(brut) {
  if (typeof brut !== 'string') return { ok: false, erreur: 'Le nom du fichier est manquant.' };
  let n = brut.normalize('NFC');
  n = n.split(/[\\/]/).pop(); // jamais de chemin : seul le dernier morceau compte
  n = n.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/[<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim();
  n = n.replace(/^\.+/, '').replace(/\.{2,}/g, '.').replace(/[ .]+$/, '').trim();
  if (!n || n === '.' || n === '..') return { ok: false, erreur: 'Le nom du fichier est vide ou invalide.' };
  if (n.length > TAILLE_NOM_MAX) {
    const ext = /\.[A-Za-z0-9]{1,10}$/.exec(n)?.[0] ?? '';
    n = `${n.slice(0, TAILLE_NOM_MAX - ext.length).trim()}${ext}`;
  }
  if (!extensionDe(n)) return { ok: false, erreur: 'Le fichier n\'a pas d\'extension (par exemple .pdf) : impossible de savoir de quel type il est.' };
  return { ok: true, nom: n };
}

/** Taille maximale réellement appliquée (en Mo) d'après le réglage de l'espace : valeur absente ou invalide = défaut, bornée à 1..25 ; puis plafond technique. */
export function limiteReglageMo(reglage) {
  const n = typeof reglage === 'number' ? reglage : Number.NaN;
  if (!Number.isFinite(n) || n < TAILLE_MIN_MO) return TAILLE_DEFAUT_MO;
  return Math.min(n, TAILLE_MAX_REGLAGE_MO);
}
export const limiteEffectiveMo = (reglage) => Math.min(limiteReglageMo(reglage), PLAFOND_APPEL_MO);
export const enOctets = (mo) => Math.floor(mo * OCTET_PAR_MO);

/** Valide la saisie du réglage « Taille maximale d'un fichier (Mo) » : rend { ok, valeur } ou { ok: false, erreur }. */
export function validerReglageTaille(saisie) {
  const brut = typeof saisie === 'string' ? saisie.trim().replace(',', '.') : saisie;
  const n = typeof brut === 'number' ? brut : Number(brut);
  if (brut === '' || brut === null || brut === undefined || !Number.isFinite(n)) return { ok: false, erreur: 'Indiquez un nombre de Mo (par exemple 25).' };
  if (n < TAILLE_MIN_MO || n > TAILLE_MAX_REGLAGE_MO) return { ok: false, erreur: `La taille maximale doit être entre ${TAILLE_MIN_MO} et ${TAILLE_MAX_REGLAGE_MO} Mo.` };
  return { ok: true, valeur: Math.round(n * 10) / 10 };
}

export function libelleTaille(octets) {
  const n = Number(octets);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} o`;
  if (n < OCTET_PAR_MO) return `${Math.round(n / 1024)} Ko`;
  const mo = n / OCTET_PAR_MO;
  return `${mo < 10 ? mo.toFixed(1).replace('.', ',') : Math.round(mo)} Mo`;
}

/** Famille d'icône d'un fichier : pdf | image | office | texte | archive | fichier. */
export const familleDe = (nom) => TYPES[extensionDe(nom)]?.famille ?? 'fichier';

/** Message de refus quand le fichier dépasse la limite : dit si c'est le réglage de l'espace ou le plafond technique. */
export function messageTropGros(taille, reglage) {
  const limite = limiteEffectiveMo(reglage);
  if (limiteReglageMo(reglage) > PLAFOND_APPEL_MO && limite === PLAFOND_APPEL_MO) {
    return `Ce fichier fait ${libelleTaille(taille)} : au-dessus de ${PLAFOND_APPEL_MO} Mo, l'envoi direct n'est pas encore disponible.`;
  }
  return `Ce fichier fait ${libelleTaille(taille)} : la taille maximale de l'espace est de ${String(limite).replace('.', ',')} Mo.`;
}

/**
 * Contrôle de ce que dit le navigateur : nom, type annoncé, taille. Rend { ok: true, nom, typeMime, famille } (typeMime = celui qu'on enregistre, tiré de l'extension)
 * ou { ok: false, code, erreur }. `reglage` : la valeur du réglage de l'espace (Mo), ou rien.
 */
export function controlerFichier({ nom, typeMime, taille }, reglage) {
  const propre = nettoyerNomFichier(nom);
  if (!propre.ok) return { ok: false, code: 'nom_invalide', erreur: propre.erreur };
  const segments = propre.nom.toLowerCase().split('.');
  const extension = segments[segments.length - 1];
  // Toute extension dangereuse après le premier morceau est refusée, y compris au milieu (« facture.exe.pdf »).
  const interdite = segments.slice(1).find((e) => DANGEREUSES.has(e)) ?? null;
  if (interdite) return { ok: false, code: 'type_refuse', erreur: `Les fichiers « .${interdite} » ne sont pas acceptés (programmes, scripts, pages web et SVG sont refusés).` };
  const regle = TYPES[extension];
  if (!regle) return { ok: false, code: 'type_refuse', erreur: `Ce type de fichier (.${extension}) n'est pas accepté. Types acceptés : ${TYPES_ACCEPTES_TEXTE}.` };
  const annonce = String(typeMime ?? '').split(';')[0].trim().toLowerCase();
  if (!TYPES_NEUTRES.includes(annonce) && !regle.accepte.includes(annonce)) {
    return { ok: false, code: 'type_incoherent', erreur: `Le type annoncé (${annonce.slice(0, 60)}) ne correspond pas à l'extension .${extension} : le fichier est refusé.` };
  }
  if (!Number.isFinite(taille) || taille <= 0) return { ok: false, code: 'fichier_vide', erreur: 'Le fichier est vide.' };
  if (taille > enOctets(limiteEffectiveMo(reglage))) return { ok: false, code: 'trop_gros', erreur: messageTropGros(taille, reglage) };
  return { ok: true, nom: propre.nom, typeMime: regle.type, famille: regle.famille, extension };
}

const latin1 = (o) => new TextDecoder('latin1').decode(o);
const commence = (o, ...octets) => octets.every((b, i) => o[i] === b);
/** Les premiers octets sont-ils ceux du type annoncé par l'extension ? (contrôle du contenu, côté serveur). `octets` : Uint8Array ou Buffer. */
export function signatureCoherente(extension, octets) {
  const regle = TYPES[extension];
  if (!regle || !octets || !octets.length) return false;
  const o = octets;
  switch (regle.signature) {
    case 'pdf': { // « %PDF- » dans les 1024 premiers octets (la norme tolère quelques octets avant)
      return latin1(o.slice(0, 1024)).includes('%PDF-');
    }
    case 'png': return commence(o, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpeg': return commence(o, 0xff, 0xd8, 0xff);
    case 'gif': return commence(o, 0x47, 0x49, 0x46, 0x38);
    case 'webp': return commence(o, 0x52, 0x49, 0x46, 0x46) && o.length > 12 && latin1(o.slice(8, 12)) === 'WEBP';
    case 'heic': return o.length > 12 && latin1(o.slice(4, 8)) === 'ftyp';
    case 'ole': return commence(o, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case 'zip': return commence(o, 0x50, 0x4b, 0x03, 0x04) || commence(o, 0x50, 0x4b, 0x05, 0x06);
    case 'texte': { // du texte : pas d'octet nul, et du UTF-8 valide
      const tete = o.slice(0, 8192);
      if (tete.includes(0)) return false;
      try { new TextDecoder('utf-8', { fatal: true }).decode(tete, { stream: true }); return true; } catch { return false; } // stream : un caractère coupé à la fin des 8 Ko n'est pas une erreur
    }
    default: return false;
  }
}

/** Nom affiché quand un autre fichier de la même fiche porte déjà ce nom : « rapport.pdf » -> « rapport (2).pdf ». `pris` : noms déjà utilisés. */
export function nomSansDoublon(nom, pris) {
  const utilises = new Set([...pris].map((p) => String(p).toLowerCase()));
  if (!utilises.has(nom.toLowerCase())) return nom;
  const ext = /\.[A-Za-z0-9]{1,10}$/.exec(nom)?.[0] ?? '';
  const base = ext ? nom.slice(0, -ext.length) : nom;
  for (let i = 2; i < 1000; i += 1) {
    const suffixe = ` (${i})${ext}`;
    const candidat = `${base.slice(0, Math.max(1, TAILLE_NOM_MAX - suffixe.length)).trim()}${suffixe}`;
    if (!utilises.has(candidat.toLowerCase())) return candidat;
  }
  return nom;
}
