// Construction du paquet de déploiement (Hosting) d'un projet Firebase. Aucune dépendance, ne contacte aucun serveur.
//
// Principe : le CRM de Jérôme (projet chevalier-ia-os) est publié tel quel, depuis la racine du dépôt, avec js/os/firebase-config.js
// qui reste son fichier de configuration. Pour un autre projet (la plateforme clients, chevalier-ia-app), on construit un dossier
// dist/<projet>/ : copie exacte des fichiers du site, SAUF js/os/firebase-config.js (et js/os/google-config.js), remplacés par des fichiers générés depuis
// scripts/projets/<projet>.json. Le même code, la même version (version.json et js/os/version.js sont copiés tels quels),
// une configuration par projet choisie au moment de construire, jamais devinée dans le navigateur.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ce que le paquet reprend de la racine du dépôt (le reste : tests, docs, outils, règles, fonctions… n'est jamais publié). */
export const ELEMENTS_PUBLIES = ['index.html', 'manifest.webmanifest', 'version.json', 'robots.txt', 'css', 'js', 'assets', 'espace'];

/** Dans le paquet de la plateforme : la page d'accueil neutre remplace index.html, et l'application du CRM devient app.html. */
export const MODELE_ACCUEIL = 'scripts/modeles/accueil-plateforme.html';
export const FICHIER_APPLICATION = 'app.html';

/** Projets construits par ce script. Le CRM n'y figure pas : il est publié depuis la racine, sans construction. */
export const PROJETS = {
  plateforme: { fichier: 'scripts/projets/plateforme.json', projetFirebase: 'chevalier-ia-app' },
};

const CLES_CONFIG = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const CLES_GOOGLE = ['commentaire', 'idClient', 'cleApi', 'idApp'];
const MOTIFS_SECRETS = /-----BEGIN|private_key|client_email|client_secret|service_account|"type"\s*:\s*"service_account"/i;

/** Lit et vérifie la configuration d'un projet. Lève une erreur claire au moindre doute. */
export function lireConfigProjet(projet, racine = RACINE) {
  const def = PROJETS[projet];
  if (!def) throw new Error(`Projet inconnu : « ${projet} » (projets possibles : ${Object.keys(PROJETS).join(', ')})`);
  const brut = readFileSync(join(racine, def.fichier), 'utf8');
  if (MOTIFS_SECRETS.test(brut)) throw new Error(`${def.fichier} : ressemble à une clé de compte de service. Refusé.`);
  const conf = JSON.parse(brut);
  const fb = conf.firebaseConfig || {};
  for (const cle of CLES_CONFIG) if (typeof fb[cle] !== 'string' || !fb[cle]) throw new Error(`${def.fichier} : « ${cle} » manque`);
  for (const cle of Object.keys(fb)) if (!CLES_CONFIG.includes(cle)) throw new Error(`${def.fichier} : clé inattendue « ${cle} »`);
  if (fb.projectId !== def.projetFirebase) throw new Error(`${def.fichier} : projectId « ${fb.projectId} » au lieu de « ${def.projetFirebase} »`);
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(fb.apiKey)) throw new Error(`${def.fichier} : apiKey de forme inattendue`);
  if (!fb.authDomain.startsWith(`${fb.projectId}.`)) throw new Error(`${def.fichier} : authDomain n'est pas un domaine du projet`);
  if (fb.storageBucket.split('.')[0] !== fb.projectId) throw new Error(`${def.fichier} : storageBucket n'est pas celui du projet`);
  if (!new RegExp(`^1:${fb.messagingSenderId}:web:[0-9a-f]+$`).test(fb.appId)) throw new Error(`${def.fichier} : appId incohérent avec messagingSenderId`);
  const comptes = conf.comptesAutorises ?? {};
  if (typeof comptes !== 'object' || Array.isArray(comptes)) throw new Error(`${def.fichier} : comptesAutorises doit être un objet`);
  // Google Drive (facultatif) : identifiant du client OAuth Web (public), clé de navigateur et numéro de projet si différents de Firebase.
  const brutGoogle = conf.googleDrive ?? {};
  if (typeof brutGoogle !== 'object' || Array.isArray(brutGoogle)) throw new Error(`${def.fichier} : googleDrive doit être un objet`);
  for (const cle of Object.keys(brutGoogle)) if (!CLES_GOOGLE.includes(cle)) throw new Error(`${def.fichier} : clé inattendue « googleDrive.${cle} »`);
  const googleDrive = { idClient: brutGoogle.idClient ?? '', ...(brutGoogle.cleApi ? { cleApi: brutGoogle.cleApi } : {}), ...(brutGoogle.idApp ? { idApp: brutGoogle.idApp } : {}) };
  if (typeof googleDrive.idClient !== 'string' || (googleDrive.idClient && !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleDrive.idClient))) throw new Error(`${def.fichier} : googleDrive.idClient de forme inattendue (attendu : …apps.googleusercontent.com)`);
  if (googleDrive.cleApi && !/^AIza[0-9A-Za-z_-]{35}$/.test(googleDrive.cleApi)) throw new Error(`${def.fichier} : googleDrive.cleApi de forme inattendue`);
  if (googleDrive.idApp && !/^[0-9]+$/.test(googleDrive.idApp)) throw new Error(`${def.fichier} : googleDrive.idApp doit être un numéro de projet`);
  return { firebaseConfig: fb, comptesAutorises: comptes, googleDrive };
}

/** Texte du fichier js/os/firebase-config.js d'un projet (même forme exportée que celui du CRM). */
export function contenuConfigFirebase(projet, racine = RACINE) {
  const { firebaseConfig, comptesAutorises } = lireConfigProjet(projet, racine);
  return [
    `// FICHIER GÉNÉRÉ par scripts/preparer-hebergement.js pour le projet « ${projet} » : ne pas le modifier ici.`,
    '// La configuration vient de scripts/projets/' + projet + '.json. Le fichier js/os/firebase-config.js du dépôt reste celui du CRM.',
    `export const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`,
    '// Liste fixe des comptes du CRM : vide ici. Sur la plateforme, l\'accès vient des fiches « membres » de la base, jamais d\'une liste dans le code.',
    `export const COMPTES_AUTORISES = ${JSON.stringify(comptesAutorises, null, 2)};`,
    '',
  ].join('\n');
}

/** Texte du fichier js/os/google-config.js d'un projet : l'identifiant du client OAuth Web (public, pas un secret). Vide = boutons Google cachés. */
export function contenuConfigGoogle(projet, racine = RACINE) {
  const { googleDrive } = lireConfigProjet(projet, racine);
  return [
    `// FICHIER GÉNÉRÉ par scripts/preparer-hebergement.js pour le projet « ${projet} » : ne pas le modifier ici.`,
    '// Identifiant du client OAuth Web de ce projet (public par nature, jamais le « client secret »). Vide = boutons Google cachés. Pas à pas : docs/google-drive.md.',
    `export const googleDrive = ${JSON.stringify(googleDrive, null, 2)};`,
    '',
  ].join('\n');
}

/** Construit dist/<projet>/ (efface l'ancien). Retourne le dossier de sortie. */
export function construire(projet, { racine = RACINE, sortie } = {}) {
  const config = contenuConfigFirebase(projet, racine); // vérifie avant de toucher au disque
  const configGoogle = contenuConfigGoogle(projet, racine);
  const dossier = sortie ?? join(racine, 'dist', projet);
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(dossier, { recursive: true });
  for (const element of ELEMENTS_PUBLIES) {
    const source = join(racine, element);
    if (!existsSync(source)) throw new Error(`Élément à publier introuvable : ${element}`);
    cpSync(source, join(dossier, element), { recursive: true });
  }
  // La racine de la plateforme est une page d'accueil neutre (jamais l'écran du CRM) : l'application (copie exacte de index.html) est publiée
  // dans app.html, et l'accueil y renvoie les adresses avec « # » (liens /espace/<client>). Le CRM, lui, garde son index.html.
  copyFileSync(join(racine, 'index.html'), join(dossier, FICHIER_APPLICATION));
  copyFileSync(join(racine, MODELE_ACCUEIL), join(dossier, 'index.html'));
  writeFileSync(join(dossier, 'js', 'os', 'firebase-config.js'), config);
  writeFileSync(join(dossier, 'js', 'os', 'google-config.js'), configGoogle);
  return dossier;
}

/** Liste récursive des fichiers d'un dossier (chemins relatifs). */
export function listerFichiers(dossier, base = dossier, liste = []) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) listerFichiers(chemin, base, liste);
    else liste.push(chemin.slice(base.length + 1));
  }
  return liste.sort();
}
