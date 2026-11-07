// Génère un jeton pour un client du serveur MCP (hors ligne, sur ton Mac). Usage :
//   node outils/creer-jeton.js hermes-bibliothecaire ecriture
//   node outils/creer-jeton.js claude-code-jerome complet
// Premier argument : nom du jeton (et de l'acteur écrit dans le fil et l'audit) ; second : profil (lecture, ecriture, agent-devis, complet ; les anciens noms lecteur, bibliothecaire, claude-code sont acceptés et écrits sous le nom canonique).
// Le jeton est affiché UNE SEULE FOIS et n'est enregistré nulle part. Seule la ligne JSON (avec l'empreinte) va dans le
// secret MCP_JETONS de Secret Manager (une ligne par jeton, nouvelle version du secret).
import { randomBytes } from 'node:crypto';
import { PROFILS, profilCanonique, empreinte } from '../functions/src/securite/jetons.js';

const [nom, profilSaisi] = process.argv.slice(2);
const profil = profilCanonique(profilSaisi);
if (!nom || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(nom) || profil === null) {
  console.error(`Usage : node outils/creer-jeton.js <nom> <profil>\n  nom : minuscules, chiffres et tirets (2 à 41 caractères), ex. hermes-bibliothecaire\n  profil : ${PROFILS.join(' | ')} (anciens noms acceptés : lecteur, bibliothecaire, claude-code)`);
  process.exit(1);
}

const jeton = `cia_${randomBytes(32).toString('base64url')}`;
const ligne = { jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, creeLe: new Date().toISOString() };

console.log('JETON (à ranger tout de suite dans le client, par exemple une variable d’environnement ; il ne sera plus jamais affiché) :\n');
console.log(`  ${jeton}\n`);
console.log('LIGNE à ajouter dans le secret MCP_JETONS (nouvelle version ; une ligne par jeton, ne contient PAS le jeton) :\n');
console.log(`  ${JSON.stringify(ligne)}\n`);
console.log('Ne colle jamais le jeton dans le dépôt, dans un fichier du dossier synchronisé avec Drive ni dans une conversation.');
