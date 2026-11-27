// Copie les photos de la page de connexion d'une maison dans le dossier publié par Firebase Hosting, juste avant un déploiement.
//
//   node scripts/copier-photos-maison.js <dossier source>   copie 1 à 3 photos JPEG du dossier source dans maison/ (connexion-1.jpg, -2, -3)
//   node scripts/copier-photos-maison.js --retirer           vide maison/ de ses photos (maison sans photo : la page de connexion reste sobre)
//
// Le dossier publié est la racine du dépôt (firebase.json, « public »: ".") : les photos arrivent dans maison/, dossier ignoré par git (.gitignore).
// Les photos d'un client ne vont JAMAIS dans le dépôt (public) : la source doit être HORS du dépôt (refus sinon).
// Avant chaque déploiement d'une maison, relancer ce script avec SES photos (ou --retirer) : sinon les photos de la maison d'avant partiraient avec.
// Chaque photo est contrôlée (vrai JPEG, 2 Mo au plus) et ses métadonnées (EXIF : appareil, date, position GPS…) sont retirées à la copie.
// Ne publie rien, ne contacte aucun serveur, n'exécute rien venant des fichiers.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DOSSIER_CIBLE = 'maison';
export const NOMBRE_MAX = 3;
export const OCTETS_MAX = 2 * 1024 * 1024;
const MOTIF_CIBLE = /^connexion-\d+\.jpg$/;

/** Vrai si le contenu commence comme un JPEG (FF D8 FF). */
export const estJpeg = (octets) => octets.length > 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff;

/**
 * Retire d'un JPEG les blocs de métadonnées (APP1 à APP15 : EXIF, XMP, Photoshop… et les commentaires COM), garde l'image telle quelle.
 * Lève une erreur si la structure est illisible.
 */
export function nettoyerJpeg(octets) {
  if (!estJpeg(octets)) throw new Error('ce n’est pas un JPEG');
  const morceaux = [octets.subarray(0, 2)];
  let i = 2;
  while (i < octets.length) {
    if (octets[i] !== 0xff) throw new Error('JPEG illisible');
    const marqueur = octets[i + 1];
    if (marqueur === 0xd9) { morceaux.push(octets.subarray(i, i + 2)); i += 2; break; }
    if (marqueur === 0xff) { i += 1; continue; } // octet de bourrage
    if (i + 4 > octets.length) throw new Error('JPEG tronqué');
    const longueur = octets.readUInt16BE(i + 2);
    const fin = i + 2 + longueur;
    if (longueur < 2 || fin > octets.length) throw new Error('JPEG tronqué');
    if (marqueur === 0xda) { morceaux.push(octets.subarray(i)); i = octets.length; break; } // début de l'image : tout le reste est l'image
    const metadonnee = (marqueur >= 0xe1 && marqueur <= 0xef) || marqueur === 0xfe;
    if (!metadonnee) morceaux.push(octets.subarray(i, fin));
    i = fin;
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
    if (octets.length > OCTETS_MAX) throw new Error(`${nom} : plus de 2 Mo (réduire à 1600 px de large, par exemple avec sips)`);
    return { nom, octets: nettoyerJpeg(octets) };
  });
}

/** Retire les photos déjà copiées (maison/connexion-*.jpg, copies générées). Renvoie le nombre de fichiers retirés. */
export function retirerPhotosMaison({ racine = RACINE } = {}) {
  const cible = join(racine, DOSSIER_CIBLE);
  if (!existsSync(cible)) return 0;
  const anciennes = readdirSync(cible).filter((n) => MOTIF_CIBLE.test(n));
  for (const n of anciennes) rmSync(join(cible, n));
  return anciennes.length;
}

/** Copie les photos du dossier source dans maison/ (connexion-1.jpg…), après avoir retiré les anciennes. Rien n'est touché si la source est refusée. */
export function copierPhotosMaison(source, { racine = RACINE } = {}) {
  const photos = lirePhotosSource(source, { racine });
  const cible = join(racine, DOSSIER_CIBLE);
  mkdirSync(cible, { recursive: true });
  retirerPhotosMaison({ racine });
  return photos.map(({ nom, octets }, i) => {
    const fichier = `connexion-${i + 1}.jpg`;
    writeFileSync(join(cible, fichier), octets);
    return { source: nom, fichier: `${DOSSIER_CIBLE}/${fichier}`, octets: octets.length };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  try {
    if (!arg) {
      console.error('Usage : node scripts/copier-photos-maison.js <dossier source hors du dépôt>   ou   --retirer');
      process.exit(2);
    }
    if (arg === '--retirer') {
      const n = retirerPhotosMaison();
      console.log(`${n} photo(s) retirée(s) de ${DOSSIER_CIBLE}/. Rien n'a été publié.`);
    } else {
      const copies = copierPhotosMaison(arg);
      for (const c of copies) console.log(`${c.source} -> ${c.fichier} (${Math.round(c.octets / 1024)} Ko, métadonnées retirées)`);
      console.log(`${copies.length} photo(s) prête(s) pour le prochain déploiement de la maison. Rien n'a été publié.`);
    }
  } catch (e) {
    console.error(`Échec : ${e.message}`);
    process.exit(1);
  }
}
