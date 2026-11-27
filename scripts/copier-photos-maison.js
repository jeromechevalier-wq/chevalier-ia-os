// Copie les photos de la page de connexion d'une maison dans le dossier publié par Firebase Hosting, juste avant un déploiement.
//
//   node scripts/copier-photos-maison.js --projet <id du projet Firebase> <dossier source>
//        copie 1 à 3 photos JPEG du dossier source dans maison/ (connexion-1.jpg, -2, -3) et note le projet dans maison/.projet
//   node scripts/copier-photos-maison.js --retirer           vide maison/ de ses photos (maison sans photo : la page de connexion reste sobre)
//
// Le dossier publié est la racine du dépôt (firebase.json, « public »: ".") : les photos arrivent dans maison/, dossier ignoré par git (.gitignore).
// maison/.projet n'est jamais publié (firebase.json ignore les fichiers qui commencent par un point, « **/.* ») : il sert au garde-fou
// scripts/verifier-photos-maison.js <id du projet>, à lancer juste avant chaque déploiement d'hébergement depuis le Mac (photos d'une autre maison = refus).
// Les photos d'un client ne vont JAMAIS dans le dépôt (public) : la source doit être HORS du dépôt (refus sinon).
// Chaque photo est contrôlée (vrai JPEG, 2 Mo au plus une fois nettoyée, orientation normale) ; à la copie, on retire les blocs de métadonnées
// APP1 (EXIF, XMP : appareil, date, position GPS…), APP13 (Photoshop, IPTC) et les commentaires, et tout ce qui suit la fin de l'image principale
// (seconde image ou petite vidéo des téléphones récents). Le profil de couleur (APP2) et l'en-tête Adobe (APP14) sont gardés.
// Ne publie rien, ne contacte aucun serveur, n'exécute rien venant des fichiers.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DOSSIER_CIBLE = 'maison';
/** Fichier (non publié : il commence par un point) qui note le projet Firebase pour lequel les photos de maison/ ont été copiées. */
export const FICHIER_PROJET = '.projet';
export const NOMBRE_MAX = 3;
export const OCTETS_MAX = 2 * 1024 * 1024;
export const MOTIF_CIBLE = /^connexion-\d+\.jpg$/;
/** Identifiant d'un projet Firebase (Google Cloud) : 6 à 30 caractères, minuscules, chiffres et tirets, commence par une lettre. */
export const MOTIF_PROJET = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/** Vrai si le contenu commence comme un JPEG (FF D8 FF). */
export const estJpeg = (octets) => octets.length > 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff;

/**
 * Orientation EXIF (étiquette 0x0112) d'un bloc APP1, ou 1 si le bloc n'est pas un EXIF lisible ou n'a pas d'orientation.
 * `contenu` = le bloc APP1 sans son marqueur ni sa longueur (commence par « Exif\0\0 »).
 */
export function orientationExif(contenu) {
  if (contenu.length < 14 || contenu.toString('latin1', 0, 6) !== 'Exif\0\0') return 1;
  const tiff = contenu.subarray(6);
  const ordre = tiff.toString('latin1', 0, 2);
  if (ordre !== 'II' && ordre !== 'MM') return 1;
  const le = ordre === 'II';
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (u16(2) !== 0x2a) return 1;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const nombre = u16(ifd);
  for (let k = 0; k < nombre; k += 1) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > tiff.length) return 1;
    if (u16(e) === 0x0112) return u16(e + 8) || 1;
  }
  return 1;
}

/** Blocs retirés : APP1 (EXIF, XMP), APP13 (Photoshop, IPTC), COM (commentaire). APP0, APP2 (profil de couleur), APP14 (Adobe) et les autres restent. */
const RETIRES = new Set([0xe1, 0xed, 0xfe]);

/**
 * Nettoie un JPEG : retire les blocs APP1, APP13 et COM, garde l'image principale telle quelle et coupe tout ce qui suit sa fin (FF D9).
 * Refuse une photo dont l'orientation EXIF n'est pas normale (elle s'afficherait couchée une fois l'EXIF retiré).
 * Lève une erreur si la structure est illisible.
 */
export function nettoyerJpeg(octets) {
  if (!estJpeg(octets)) throw new Error('ce n’est pas un JPEG');
  const morceaux = [octets.subarray(0, 2)];
  let i = 2;
  for (;;) {
    if (i + 2 > octets.length) throw new Error('JPEG tronqué (pas de fin d’image)');
    if (octets[i] !== 0xff) throw new Error('JPEG illisible');
    const marqueur = octets[i + 1];
    if (marqueur === 0xff) { i += 1; continue; } // octet de bourrage
    if (marqueur === 0xd9) { morceaux.push(octets.subarray(i, i + 2)); break; } // fin de l'image principale : la suite (seconde image, vidéo) est coupée
    if (i + 4 > octets.length) throw new Error('JPEG tronqué');
    const longueur = octets.readUInt16BE(i + 2);
    const fin = i + 2 + longueur;
    if (longueur < 2 || fin > octets.length) throw new Error('JPEG tronqué');
    if (marqueur === 0xe1) {
      const orientation = orientationExif(octets.subarray(i + 4, fin));
      if (orientation !== 1) throw new Error(`photo tournée par l’appareil (orientation EXIF ${orientation}) : elle s’afficherait couchée. Tourne la photo avec Aperçu (Outils > Faire pivoter), enregistre-la, puis réessaie`);
    }
    if (!RETIRES.has(marqueur)) morceaux.push(octets.subarray(i, fin));
    i = fin;
    if (marqueur === 0xda) {
      // Données de l'image (entropie) : on avance jusqu'au marqueur suivant. FF 00 (octet échappé), FF D0 à D7 (redémarrage) et FF FF (bourrage)
      // font partie des données ; tout autre FF xx est un marqueur (nouvelle passe d'un JPEG progressif, ou fin d'image).
      let j = i;
      while (j + 1 < octets.length) {
        if (octets[j] === 0xff) {
          const b = octets[j + 1];
          if (b !== 0x00 && b !== 0xff && !(b >= 0xd0 && b <= 0xd7)) break;
        }
        j += 1;
      }
      if (j + 1 >= octets.length) throw new Error('JPEG tronqué (pas de fin d’image)');
      morceaux.push(octets.subarray(i, j));
      i = j;
    }
  }
  return Buffer.concat(morceaux);
}

function dansLeDepot(chemin, racine) {
  const rel = relative(realpathSync(racine), realpathSync(chemin));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Liste et contrôle les photos d'un dossier source (fichiers .jpg ou .jpeg, par ordre de nom). Lève une erreur claire au moindre doute. */
export function lirePhotosSource(source, { racine = RACINE } = {}) {
  if (!source) throw new Error('dossier source manquant');
  const dossier = resolve(source);
  if (!existsSync(dossier) || !statSync(dossier).isDirectory()) throw new Error(`dossier introuvable : ${source}`);
  if (dansLeDepot(dossier, racine)) throw new Error('le dossier source est dans le dépôt : les photos d’un client doivent rester hors du dépôt (public)');
  const noms = readdirSync(dossier).filter((n) => !n.startsWith('.') && ['.jpg', '.jpeg'].includes(extname(n).toLowerCase())).sort();
  if (!noms.length) throw new Error('aucune photo .jpg ou .jpeg dans le dossier source');
  if (noms.length > NOMBRE_MAX) throw new Error(`${noms.length} photos : ${NOMBRE_MAX} au plus`);
  return noms.map((nom) => {
    const chemin = join(dossier, nom);
    if (!statSync(chemin).isFile()) throw new Error(`${nom} : pas un fichier`);
    const octets = readFileSync(chemin);
    if (!estJpeg(octets)) throw new Error(`${nom} : ce n’est pas un JPEG`);
    let propre;
    try { propre = nettoyerJpeg(octets); } catch (e) { throw new Error(`${nom} : ${e.message}`); }
    if (propre.length > OCTETS_MAX) throw new Error(`${nom} : plus de 2 Mo (réduire à 1600 px de large, par exemple avec sips)`);
    return { nom, octets: propre };
  });
}

/** Vérifie l'identifiant d'un projet Firebase (refus clair sinon). */
export function controlerProjet(projet) {
  if (!projet) throw new Error('identifiant du projet Firebase manquant (--projet <id>) : il sert à ne jamais publier les photos d’une maison chez une autre');
  if (!MOTIF_PROJET.test(projet)) throw new Error(`identifiant de projet Firebase invalide : ${projet}`);
  return projet;
}

/** Retire les photos déjà copiées (maison/connexion-*.jpg, copies générées) et la note du projet. Renvoie le nombre de photos retirées. */
export function retirerPhotosMaison({ racine = RACINE } = {}) {
  const cible = join(racine, DOSSIER_CIBLE);
  if (!existsSync(cible)) return 0;
  rmSync(join(cible, FICHIER_PROJET), { force: true });
  const anciennes = readdirSync(cible).filter((n) => MOTIF_CIBLE.test(n));
  for (const n of anciennes) rmSync(join(cible, n));
  return anciennes.length;
}

/**
 * Copie les photos du dossier source dans maison/ (connexion-1.jpg…), après avoir retiré les anciennes, et note le projet dans maison/.projet
 * (écrit en dernier : une copie interrompue laisse des photos sans note, que le garde-fou refuse). Rien n'est touché si la source ou le projet est refusé.
 */
export function copierPhotosMaison(source, { racine = RACINE, projet } = {}) {
  controlerProjet(projet);
  const photos = lirePhotosSource(source, { racine });
  const cible = join(racine, DOSSIER_CIBLE);
  mkdirSync(cible, { recursive: true });
  retirerPhotosMaison({ racine });
  const copies = photos.map(({ nom, octets }, i) => {
    const fichier = `connexion-${i + 1}.jpg`;
    writeFileSync(join(cible, fichier), octets);
    return { source: nom, fichier: `${DOSSIER_CIBLE}/${fichier}`, octets: octets.length };
  });
  writeFileSync(join(cible, FICHIER_PROJET), `${projet}\n`);
  return copies;
}

/** Lit la ligne de commande : --projet <id>, --retirer, et un dossier source. */
export function lireArguments(args) {
  const r = { projet: '', retirer: false, source: '' };
  for (let k = 0; k < args.length; k += 1) {
    if (args[k] === '--projet') { r.projet = args[k + 1] || ''; k += 1; }
    else if (args[k] === '--retirer') r.retirer = true;
    else if (!r.source) r.source = args[k];
    else throw new Error(`argument en trop : ${args[k]}`);
  }
  return r;
}

const USAGE = 'Usage : node scripts/copier-photos-maison.js --projet <id du projet Firebase> <dossier source hors du dépôt>   ou   --retirer';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { projet, retirer, source } = lireArguments(process.argv.slice(2));
    if (retirer) {
      const n = retirerPhotosMaison();
      console.log(`${n} photo(s) retirée(s) de ${DOSSIER_CIBLE}/. Rien n'a été publié.`);
    } else if (!source) {
      console.error(USAGE);
      process.exit(2);
    } else {
      const copies = copierPhotosMaison(source, { projet });
      for (const c of copies) console.log(`${c.source} -> ${c.fichier} (${Math.round(c.octets / 1024)} Ko, métadonnées retirées)`);
      console.log(`${copies.length} photo(s) prête(s) pour le prochain déploiement de la maison ${projet}. Rien n'a été publié.`);
      console.log(`Juste avant le déploiement : node scripts/verifier-photos-maison.js ${projet}`);
    }
  } catch (e) {
    console.error(`Échec : ${e.message}`);
    process.exit(1);
  }
}
