// Images de « Mon espace » (2.10.0), côté navigateur : contrôle du fichier choisi (PNG, JPG ou WebP seulement, jamais de SVG), réduction avant l'envoi
// (jamais agrandie, transparence du PNG conservée) et conversion pour l'envoi. Le serveur refait tous les contrôles : ceci évite seulement d'envoyer pour rien.
export const LIMITES = Object.freeze({
  logo: { octets: 2 * 1024 * 1024, largeur: 512, libelle: 'logo', mo: '2 Mo' },
  image: { octets: Math.floor(1.5 * 1024 * 1024), largeur: 1600, libelle: 'image', mo: '1,5 Mo' },
});
const OCTETS_MAX_CHOISI = 20 * 1024 * 1024; // au-delà, on ne tente même pas de décoder

/** Type d'après les premiers octets : 'png', 'jpg', 'webp' ou null. */
export function typeDesOctets(o) {
  if (o.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => o[i] === v)) return 'png';
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'jpg';
  if (o.length >= 12 && String.fromCharCode(...o.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...o.subarray(8, 12)) === 'WEBP') return 'webp';
  return null;
}
const MIMES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const formatMo = (octets) => `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

/** Un fichier choisi est-il acceptable ? { ok: true, type } ou { ok: false, message } : le message dit LEQUEL des cas et quoi faire. */
export async function verifierFichier(fichier, genre) {
  const limite = LIMITES[genre];
  const debut = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
  const texte = new TextDecoder().decode(debut).trimStart().toLowerCase();
  if (fichier.type === 'image/svg+xml' || /\.svgz?$/i.test(fichier.name || '') || texte.startsWith('<svg') || texte.startsWith('<?xml')) {
    return { ok: false, message: `Les fichiers SVG ne sont pas acceptés. Choisis un ${limite.libelle} au format PNG, JPG ou WebP (tu peux exporter ton SVG en PNG).` };
  }
  const type = typeDesOctets(debut);
  if (!type) return { ok: false, message: `Ce fichier n’est pas un PNG, un JPG ou un WebP. Choisis un autre fichier${fichier.type ? ` (celui-ci est « ${fichier.type} »)` : ''}.` };
  if (fichier.size > (genre === 'logo' ? limite.octets : OCTETS_MAX_CHOISI)) {
    return { ok: false, message: `Ce fichier pèse ${formatMo(fichier.size)} : ${limite.mo} au plus pour un ${limite.libelle}. Choisis une image plus légère.` };
  }
  return { ok: true, type };
}

const charger = (blob) => new Promise((resoudre, rejeter) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resoudre(image); };
  image.onerror = () => { URL.revokeObjectURL(url); rejeter(new Error('illisible')); };
  image.src = url;
});
const versBlob = (canvas, mime, qualite) => new Promise((resoudre) => canvas.toBlob(resoudre, mime, qualite));

/**
 * Prépare le fichier à envoyer : réduit à `largeur` au plus (jamais agrandi), même format qu'à l'origine (le PNG garde sa transparence).
 * Un fichier déjà assez petit est envoyé tel quel. Renvoie { blob, type, largeur, hauteur } ou { message } si l'image est illisible ou reste trop lourde.
 */
export async function preparerImage(fichier, genre, type) {
  const limite = LIMITES[genre];
  let image;
  try { image = await charger(fichier); } catch { return { message: 'Cette image est illisible. Choisis un autre fichier PNG, JPG ou WebP.' }; }
  const largeur = Math.min(image.naturalWidth, limite.largeur);
  const hauteur = Math.max(1, Math.round(image.naturalHeight * (largeur / image.naturalWidth)));
  if (image.naturalWidth <= limite.largeur && fichier.size <= limite.octets) return { blob: fichier, type, largeur: image.naturalWidth, hauteur: image.naturalHeight };
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  canvas.getContext('2d').drawImage(image, 0, 0, largeur, hauteur);
  for (const qualite of [0.9, 0.8, 0.7, 0.55]) {
    const blob = await versBlob(canvas, MIMES[type], qualite);
    if (blob && blob.size <= limite.octets) return { blob, type, largeur, hauteur };
    if (type === 'png') break; // un PNG ne se compresse pas par qualité
  }
  return { message: `Cette image reste trop lourde même réduite (${limite.mo} au plus). Choisis une photo plus légère, ou un JPG.` };
}

/** Octets d'un fichier en base64 (sans préfixe), pour l'appel à la fonction. */
export function enBase64(blob) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(String(lecteur.result).split(',')[1] ?? '');
    lecteur.onerror = () => rejeter(new Error('lecture impossible'));
    lecteur.readAsDataURL(blob);
  });
}
