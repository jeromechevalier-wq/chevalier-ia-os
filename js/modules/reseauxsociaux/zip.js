// Lecteur de fichiers ZIP pour l'import LinkedIn, tout dans le navigateur (rien n'est envoyé hors de la machine).
// Le fichier n'est jamais chargé en entier : on lit la fin (table centrale de l'archive), puis seulement les entrées utiles, par `Blob.slice`.
// Décompression : `DecompressionStream('deflate-raw')` (méthode 8) ou copie (méthode 0). ZIP64, entrées chiffrées et archives de plus de 300 Mo sont refusés avec un message lisible.
// Aucune dépendance Firebase ni DOM : importable par les tests Node (Blob et DecompressionStream existent dans Node).

export const TAILLE_MAX_ARCHIVE = 300 * 1024 * 1024;
/** Garde-fou contre une entrée qui se déploierait à l'infini (« bombe » de compression) : au-delà, l'entrée est refusée. */
export const TAILLE_MAX_ENTREE = 600 * 1024 * 1024;

/** Erreur dont le message est fait pour être montré tel quel à l'écran. */
export class ErreurArchive extends Error {
  constructor(message, code) { super(message); this.name = 'ErreurArchive'; this.code = code; this.saisie = true; }
}

const MESSAGES = {
  pasUnZip: 'Ce fichier n’est pas une archive .zip lisible.',
  tronque: 'Cette archive est incomplète (le téléchargement a dû s’interrompre). Télécharge-la de nouveau.',
  trop: 'Cette archive est trop grosse : demande l’archive rapide à LinkedIn (messages et relations seulement).',
  zip64: 'Cette archive utilise un format trop récent (ZIP64) : demande l’archive rapide à LinkedIn (messages et relations seulement).',
  chiffre: 'Cette archive est protégée par un mot de passe : télécharge-la de nouveau sans protection.',
  methode: 'Cette archive utilise un mode de compression que je ne sais pas lire.',
  abime: 'Cette archive est abîmée (une partie est illisible). Télécharge-la de nouveau.',
};
const erreur = (code) => new ErreurArchive(MESSAGES[code], code);

const lire = async (blob, debut, fin) => new DataView(await blob.slice(debut, fin).arrayBuffer());

/** Lit la table centrale : { taille, entrees: [{ nom, methode, crc, octetsComprimes, octets, decalage, chiffre }], repertoire: ArrayBuffer }. */
export async function ouvrirZip(blob, { tailleMax = TAILLE_MAX_ARCHIVE } = {}) {
  if (!blob || typeof blob.size !== 'number' || typeof blob.slice !== 'function') throw erreur('pasUnZip');
  if (blob.size > tailleMax) throw erreur('trop');
  if (blob.size < 22) throw erreur('pasUnZip');
  const debutQueue = Math.max(0, blob.size - 65557);
  const queue = await lire(blob, debutQueue, blob.size);
  let fin = -1;
  for (let i = queue.byteLength - 22; i >= 0; i--) {
    if (queue.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw erreur('pasUnZip');
  if (fin >= 20 && queue.getUint32(fin - 20, true) === 0x07064b50) throw erreur('zip64');
  const total = queue.getUint16(fin + 10, true);
  const tailleRep = queue.getUint32(fin + 12, true);
  const decalageRep = queue.getUint32(fin + 16, true);
  if (total === 0xFFFF || tailleRep === 0xFFFFFFFF || decalageRep === 0xFFFFFFFF) throw erreur('zip64');
  if (decalageRep + tailleRep > blob.size) throw erreur('tronque');
  const brut = await blob.slice(decalageRep, decalageRep + tailleRep).arrayBuffer();
  const rep = new DataView(brut);
  const octets = new Uint8Array(brut);
  const decodeur = new TextDecoder('utf-8');
  const entrees = [];
  let p = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > rep.byteLength || rep.getUint32(p, true) !== 0x02014b50) throw erreur('abime');
    const drapeaux = rep.getUint16(p + 8, true);
    const longNom = rep.getUint16(p + 28, true);
    const longExtra = rep.getUint16(p + 30, true);
    const longCommentaire = rep.getUint16(p + 32, true);
    if (p + 46 + longNom > rep.byteLength) throw erreur('abime');
    const taille = rep.getUint32(p + 24, true);
    const comprimee = rep.getUint32(p + 20, true);
    const decalage = rep.getUint32(p + 42, true);
    if (taille === 0xFFFFFFFF || comprimee === 0xFFFFFFFF || decalage === 0xFFFFFFFF) throw erreur('zip64');
    entrees.push({
      nom: decodeur.decode(octets.subarray(p + 46, p + 46 + longNom)),
      methode: rep.getUint16(p + 10, true),
      crc: rep.getUint32(p + 16, true),
      octetsComprimes: comprimee,
      octets: taille,
      decalage,
      chiffre: (drapeaux & 1) === 1,
    });
    p += 46 + longNom + longExtra + longCommentaire;
  }
  return { taille: blob.size, entrees, repertoire: brut };
}

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
export function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflater(octets, maxOctets) {
  const lecteur = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const morceaux = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > maxOctets) { await lecteur.cancel(); throw erreur('trop'); }
    morceaux.push(value);
  }
  const sortie = new Uint8Array(total);
  let p = 0;
  for (const m of morceaux) { sortie.set(m, p); p += m.length; }
  return sortie;
}

/** Contenu d'une entrée (octets décompressés). Refuse une entrée chiffrée, trop grosse, tronquée ou dont la somme de contrôle ne correspond pas. */
export async function lireEntree(blob, entree, { maxOctets = TAILLE_MAX_ENTREE } = {}) {
  if (entree.chiffre) throw erreur('chiffre');
  if (entree.octets > maxOctets) throw erreur('trop');
  const tete = entree.decalage + 30;
  if (tete > blob.size) throw erreur('tronque');
  const local = await lire(blob, entree.decalage, tete);
  if (local.getUint32(0, true) !== 0x04034b50) throw erreur('abime');
  const debut = tete + local.getUint16(26, true) + local.getUint16(28, true);
  if (debut + entree.octetsComprimes > blob.size) throw erreur('tronque');
  const brut = new Uint8Array(await blob.slice(debut, debut + entree.octetsComprimes).arrayBuffer());
  let sortie;
  if (entree.methode === 0) sortie = brut;
  else if (entree.methode === 8) {
    try { sortie = await deflater(brut, maxOctets); } catch (e) { throw e instanceof ErreurArchive ? e : erreur('abime'); }
  } else throw erreur('methode');
  if (sortie.length !== entree.octets || crc32(sortie) !== entree.crc) throw erreur('abime');
  return sortie;
}

/** Dernier élément d'un chemin, en minuscules (« Export/Messages.CSV » -> « messages.csv »). */
export const nomDeFichier = (chemin) => String(chemin ?? '').split(/[\\/]/).pop().toLowerCase();

/**
 * Lit les seules entrées utiles, cherchées par nom de fichier (n'importe quel dossier, majuscules ou non) ; aucune autre entrée n'est lue.
 * Rend { 'messages.csv': Uint8Array | undefined, … } et la liste des noms trouvés. Entre deux fichiers de même nom, le moins profond gagne.
 */
export async function lireFichiersUtiles(blob, noms, ouverture = null) {
  const zip = ouverture ?? await ouvrirZip(blob);
  const trouves = {};
  for (const e of zip.entrees) {
    if (e.nom.endsWith('/')) continue;
    const n = nomDeFichier(e.nom);
    if (!noms.includes(n)) continue;
    const profondeur = e.nom.split(/[\\/]/).length;
    if (!trouves[n] || profondeur < trouves[n].profondeur) trouves[n] = { entree: e, profondeur };
  }
  const contenus = {};
  for (const n of noms) contenus[n] = trouves[n] ? await lireEntree(blob, trouves[n].entree) : undefined;
  return contenus;
}

/**
 * Empreinte de l'archive (SHA-256 hexadécimal) : taille + table centrale (noms, tailles et sommes de contrôle de TOUTES les entrées).
 * Même contenu = même empreinte, sans lire les 300 Mo en mémoire.
 */
export async function empreinteArchive(zip) {
  const taille = new TextEncoder().encode(`${zip.taille}:`);
  const rep = new Uint8Array(zip.repertoire);
  const tout = new Uint8Array(taille.length + rep.length);
  tout.set(taille, 0);
  tout.set(rep, taille.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', tout));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}
