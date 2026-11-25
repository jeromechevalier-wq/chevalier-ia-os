// Message de l'expéditeur et courriel complet (PR 8b, portée de l'appli BTP : lib/courriel*.ts). Fonctions pures : aucune lecture ici (la lecture est dans donnees-examiner.js).
// TOUT EST DU TEXTE : rien n'est jamais injecté comme du HTML (l'écran pose le texte comme texte, les retours à la ligne viennent du CSS).

/** Colonnes lisibles du courriel (la base n'en donne pas d'autres ici). */
export const COLONNES_COURRIEL = ['id', 'recu_le', 'date_courriel', 'expediteur', 'sujet', 'corps_texte', 'pieces_jointes', 'boite', 'destinataire', 'resultat'];

/** Au-delà, le texte est coupé à l'affichage (la base en garde 20 000 au plus). */
export const LONGUEUR_MAX_MESSAGE = 20000;

/** Texte à afficher : null si vide. Retours à la ligne normalisés, caractères de contrôle retirés, lignes vides en trop réduites, coupé s'il est très long. Ne touche jamais au HTML (il reste du texte brut). */
export function preparerMessage(texte) {
  if (typeof texte !== 'string') return null;
  let t = texte.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  if (!t) return null;
  if (t.length > LONGUEUR_MAX_MESSAGE) t = `${t.slice(0, LONGUEUR_MAX_MESSAGE).trimEnd()}…`;
  return t;
}

/** Un courriel est affichable seulement s'il a un texte non vide. */
export const courrielAffichable = (c) => !!c && preparerMessage(c.corps_texte) !== null;

/** Taille lisible : « 850 o », « 12,4 Ko », « 1,2 Mo ». Vide si inconnue ou invalide. */
export function tailleLisible(octets) {
  if (typeof octets !== 'number' || !Number.isFinite(octets) || octets < 0) return '';
  if (octets < 1024) return `${Math.round(octets)} o`;
  const f = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  if (octets < 1024 * 1024) return `${f(octets / 1024)} Ko`;
  return `${f(octets / (1024 * 1024))} Mo`;
}

const TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Image JPEG', 'image/jpg': 'Image JPEG', 'image/png': 'Image PNG', 'image/gif': 'Image GIF', 'image/webp': 'Image WebP',
  'text/plain': 'Texte', 'text/html': 'Page web', 'text/csv': 'Tableau CSV',
  'application/zip': 'Archive ZIP',
  'application/msword': 'Document Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Document Word',
  'application/vnd.ms-excel': 'Tableur Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Tableur Excel',
};

/** Type lisible d'une pièce jointe (« PDF », « Image PNG »…), déduit du type puis, à défaut, de l'extension du nom. */
export function typeLisible(type, nom) {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (t && Object.hasOwn(TYPES, t)) return TYPES[t];
  const ext = typeof nom === 'string' && nom.includes('.') ? nom.split('.').pop().toLowerCase() : '';
  if (ext === 'pdf') return 'PDF';
  if (t.startsWith('image/')) return 'Image';
  return 'Fichier';
}

export const estPdf = (p) => (p.type ?? '').trim().toLowerCase() === 'application/pdf' || /\.pdf$/i.test(p.nom);

/** Liste sûre des pièces jointes : jsonb absent, pas un tableau ou éléments mal formés donnent une liste vide ou sont ignorés. Ne lève jamais d'erreur. Le chemin de stockage n'est jamais gardé. */
export function lirePiecesJointes(valeur) {
  if (!Array.isArray(valeur)) return [];
  const sortie = [];
  for (const e of valeur) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    const nom = typeof e.nom === 'string' ? e.nom.trim() : '';
    sortie.push({
      nom: nom || 'Sans nom',
      type: typeof e.type === 'string' && e.type.trim() ? e.type.trim() : null,
      taille: typeof e.taille === 'number' && Number.isFinite(e.taille) && e.taille >= 0 ? e.taille : null,
    });
  }
  return sortie;
}

/** Texte d'un champ court (expéditeur, objet, boîte…) : « — » s'il est vide. */
export const champOuTiret = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '—');
