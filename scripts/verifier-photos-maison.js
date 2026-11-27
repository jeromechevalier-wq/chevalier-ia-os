// Garde-fou à lancer JUSTE AVANT chaque déploiement d'hébergement depuis le Mac (maison d'un client, ou CRM de Jérôme) :
//
//   node scripts/verifier-photos-maison.js <id du projet Firebase qu'on va déployer>
//
// Si maison/ contient des photos de connexion (connexion-*.jpg, copiées par scripts/copier-photos-maison.js), elles doivent avoir été copiées
// pour CE projet (note maison/.projet). Sinon : refus (code 1), pour ne jamais publier les photos d'une maison chez une autre.
// Sans photo : rien à vérifier (code 0). Ne publie rien, ne contacte aucun serveur.
// Le contrôle n'est pas branché dans firebase.json (« predeploy ») : ce fichier demande l'accord de Jérôme. Décision du 27/11/2026, PR 720.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RACINE, DOSSIER_CIBLE, FICHIER_PROJET, MOTIF_CIBLE, controlerProjet } from './copier-photos-maison.js';

/** Renvoie { photos, projetNote } si le déploiement de `projet` peut partir ; lève une erreur claire sinon. */
export function verifierPhotosMaison(projet, { racine = RACINE } = {}) {
  controlerProjet(projet);
  const cible = join(racine, DOSSIER_CIBLE);
  const photos = existsSync(cible) ? readdirSync(cible).filter((n) => MOTIF_CIBLE.test(n)).length : 0;
  if (!photos) return { photos: 0, projetNote: '' };
  const note = join(cible, FICHIER_PROJET);
  const projetNote = existsSync(note) ? readFileSync(note, 'utf8').trim() : '';
  const relancer = `relance « node scripts/copier-photos-maison.js --projet ${projet} <dossier de ses photos> » (ou « --retirer » pour une maison sans photo)`;
  if (!projetNote) throw new Error(`${photos} photo(s) dans ${DOSSIER_CIBLE}/ sans projet noté : impossible de savoir à quelle maison elles appartiennent ; ${relancer}`);
  if (projetNote !== projet) throw new Error(`les photos de ${DOSSIER_CIBLE}/ sont celles du projet ${projetNote}, pas de ${projet} : ne déploie pas ; ${relancer}`);
  return { photos, projetNote };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projet = process.argv[2];
  if (!projet || process.argv.length > 3) {
    console.error('Usage : node scripts/verifier-photos-maison.js <id du projet Firebase qu’on va déployer>');
    process.exit(2);
  }
  try {
    const { photos } = verifierPhotosMaison(projet);
    console.log(photos
      ? `OK : ${photos} photo(s) de connexion copiées pour ${projet}. Le déploiement peut partir.`
      : `OK : aucune photo de connexion dans ${DOSSIER_CIBLE}/ (page de connexion sobre). Le déploiement peut partir.`);
  } catch (e) {
    console.error(`Échec : ${e.message}`);
    process.exit(1);
  }
}
