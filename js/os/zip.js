// Petit créateur d'archive .zip, en JavaScript pur (26/11/2026, sauvegarde complète des Achats) : aucune dépendance, aucun appel réseau, aucun DOM.
// Format « stored » (méthode 0, sans compression) : les fichiers sont recopiés tels quels, avec leur CRC32. Noms en UTF-8 (drapeau 11), donc accents permis.
// Limites assumées : pas de ZIP64 (moins de 65 535 fichiers et moins de 4 Go au total), largement assez pour des fichiers CSV.
// Importable par les tests Node (tests/achats-sauvegarde-zip.test.js).

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 (celui du format zip) d'une suite d'octets : un entier non signé. crc32 de « 123456789 » = 0xCBF43926. */
export function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Date et heure au format MS-DOS (heure locale, à 2 secondes près ; avant 1980 : 1er janvier 1980). */
export function dateDos(d = new Date()) {
  const annee = Math.max(1980, d.getFullYear());
  return {
    heure: ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1F),
    jour: (((annee - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F),
  };
}

const encodeur = new TextEncoder();
const enOctets = (contenu) => (contenu instanceof Uint8Array ? contenu : encodeur.encode(String(contenu ?? '')));

/**
 * Fabrique une archive .zip : `fichiers` = [{ nom, contenu }] (contenu : texte, écrit en UTF-8, ou Uint8Array). Renvoie un Uint8Array.
 * Lève une erreur si un nom est vide, en double, ou si l'archive dépasse les limites du format sans ZIP64.
 */
export function creerZip(fichiers, { date = new Date() } = {}) {
  if (!Array.isArray(fichiers)) throw new Error('creerZip : une liste de fichiers est attendue.');
  if (fichiers.length > 0xFFFE) throw new Error('creerZip : trop de fichiers pour une archive simple.');
  const { heure, jour } = dateDos(date);
  const vus = new Set();
  const entrees = fichiers.map((f) => {
    const nom = String(f?.nom ?? '');
    if (!nom) throw new Error('creerZip : un fichier n’a pas de nom.');
    if (vus.has(nom)) throw new Error(`creerZip : le fichier « ${nom} » est en double.`);
    vus.add(nom);
    const donnees = enOctets(f.contenu);
    return { nomOctets: encodeur.encode(nom), donnees, crc: crc32(donnees) };
  });
  const tailleLocaux = entrees.reduce((s, e) => s + 30 + e.nomOctets.length + e.donnees.length, 0);
  const tailleCentral = entrees.reduce((s, e) => s + 46 + e.nomOctets.length, 0);
  const total = tailleLocaux + tailleCentral + 22;
  if (total > 0xFFFFFFFF) throw new Error('creerZip : archive trop grosse pour le format simple.');
  const sortie = new Uint8Array(total);
  const vue = new DataView(sortie.buffer);
  let p = 0;
  const u16 = (v) => { vue.setUint16(p, v, true); p += 2; };
  const u32 = (v) => { vue.setUint32(p, v >>> 0, true); p += 4; };
  const octets = (o) => { sortie.set(o, p); p += o.length; };
  const DRAPEAUX = 0x0800; // bit 11 : noms en UTF-8
  const decalages = [];
  for (const e of entrees) { // en-têtes locaux + données
    decalages.push(p);
    u32(0x04034b50); u16(20); u16(DRAPEAUX); u16(0); u16(heure); u16(jour);
    u32(e.crc); u32(e.donnees.length); u32(e.donnees.length); u16(e.nomOctets.length); u16(0);
    octets(e.nomOctets); octets(e.donnees);
  }
  const debutCentral = p;
  entrees.forEach((e, i) => { // répertoire central
    u32(0x02014b50); u16(20); u16(20); u16(DRAPEAUX); u16(0); u16(heure); u16(jour);
    u32(e.crc); u32(e.donnees.length); u32(e.donnees.length); u16(e.nomOctets.length); u16(0); u16(0);
    u16(0); u16(0); u32(0); u32(decalages[i]);
    octets(e.nomOctets);
  });
  const tailleRepertoire = p - debutCentral; // calculée AVANT d'écrire la fin (p avance à chaque écriture)
  // fin du répertoire central
  u32(0x06054b50); u16(0); u16(0); u16(entrees.length); u16(entrees.length); u32(tailleRepertoire); u32(debutCentral); u16(0);
  return sortie;
}
