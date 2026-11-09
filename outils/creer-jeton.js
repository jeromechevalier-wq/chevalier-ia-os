// Génère un jeton pour un client du serveur MCP (hors ligne, sur ton Mac). Usage :
//   node outils/creer-jeton.js hermes-bibliothecaire ecriture
//   node outils/creer-jeton.js claude-code-jerome complet
//   node outils/creer-jeton.js bot-devis-essai agent-devis --client clientdemo
// Option --client <id> : jeton fixe lié à UN client de la plateforme (bot n8n). Profils permis : lecture, agent-devis, assistant-devis. La ligne va dans le secret
// MCP_JETONS_CLIENTS (projet chevalier-ia-app), pas dans MCP_JETONS ; le jeton n'ouvre que /mcp/<id>.
// Premier argument : nom du jeton (et de l'acteur écrit dans le fil et l'audit) ; second : profil (lecture, ecriture, agent-devis, assistant-devis, complet ; les anciens noms lecteur, bibliothecaire, claude-code sont acceptés et écrits sous le nom canonique).
// Le jeton est affiché UNE SEULE FOIS et n'est enregistré nulle part. Seule la ligne JSON (avec l'empreinte) va dans le
// secret MCP_JETONS de Secret Manager (une ligne par jeton, nouvelle version du secret).
import { randomBytes } from 'node:crypto';
import { PROFILS, PROFILS_JETON_CLIENT, PREFIXES_RESERVES_OAUTH, profilCanonique, empreinte } from '../functions/src/securite/jetons.js';
import { FORMAT_CLIENT } from '../functions/src/clients/config.js';

const arguments_ = process.argv.slice(2);
const i = arguments_.indexOf('--client');
const client = i === -1 ? undefined : arguments_[i + 1];
if (i !== -1) arguments_.splice(i, 2);
const [nom, profilSaisi] = arguments_;
const profil = profilCanonique(profilSaisi);
const mauvaisClient = i !== -1 && (!client || !FORMAT_CLIENT.test(client) || client === 'interne' || !PROFILS_JETON_CLIENT.includes(profil) || PREFIXES_RESERVES_OAUTH.some((p) => nom?.startsWith(p)));
if (!nom || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(nom) || profil === null || arguments_.length !== 2 || mauvaisClient) {
  console.error(`Usage : node outils/creer-jeton.js <nom> <profil> [--client <id>]\n  --client : jeton lié à UN client ; profils ${PROFILS_JETON_CLIENT.join(' | ')} seulement ; nom hors ${PREFIXES_RESERVES_OAUTH.join(', ')} ; client en minuscules, différent de « interne »\n  nom : minuscules, chiffres et tirets (2 à 41 caractères), ex. hermes-bibliothecaire\n  profil : ${PROFILS.join(' | ')} (anciens noms acceptés : lecteur, bibliothecaire, claude-code)`);
  process.exit(1);
}

const jeton = `cia_${randomBytes(32).toString('base64url')}`;
const ligne = { jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...(client ? { client } : {}), creeLe: new Date().toISOString() };

console.log('JETON (à ranger tout de suite dans le client, par exemple une variable d’environnement ; il ne sera plus jamais affiché) :\n');
console.log(`  ${jeton}\n`);
console.log(`LIGNE à ajouter dans le secret ${client ? 'MCP_JETONS_CLIENTS (projet chevalier-ia-app)' : 'MCP_JETONS'} (nouvelle version ; une ligne par jeton, ne contient PAS le jeton) :\n`);
console.log(`  ${JSON.stringify(ligne)}\n`);
console.log('Ne colle jamais le jeton dans le dépôt, dans un fichier du dossier synchronisé avec Drive ni dans une conversation.');
