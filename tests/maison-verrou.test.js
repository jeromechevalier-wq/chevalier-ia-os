// Verrou du chantier 0 (25/11/2026) : aucun nom de projet, adresse de fonction, réserve de fichiers, compte de service, adresse de n8n ni compte de Jérôme
// n'est écrit en dur dans le code qui tourne côté serveur et dans les règles. Le même code doit pouvoir s'installer dans N projets Google (« maisons »).
// Périmètre : functions/src, functions-plateforme/src, scripts/porte (copié dans le serveur), firestore*.rules, storage*.rules.
// Le navigateur (js/) n'est pas encore dans le périmètre : il garde sa configuration (js/os/firebase-config.js…) jusqu'à la PR « navigateur » du chantier 0.
// Les commentaires sont ignorés (ils peuvent citer un exemple d'adresse). Les motifs sont précis : un nom de projet seul (nom du serveur MCP vu par les
// assistants, functions/src/mcp/gestionnaire.js et mcp/outils/identite.js ; source des SMS, coeur/sms-direct.js) n'est PAS visé, il ne désigne aucune adresse.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPTE_JEROME, COMPTE_BOT, HOTE_N8N_ESSAI } from './_reglages-maison-essai.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const DOSSIERS = ['functions/src', 'functions-plateforme/src', 'scripts/porte'];
const REGLES = readdirSync(RACINE).filter((f) => /^(firestore|storage).*\.rules$/.test(f));

function fichiers(dossier) {
  const sortie = [];
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const chemin = join(dossier, nom);
    if (statSync(join(RACINE, chemin)).isDirectory()) sortie.push(...fichiers(chemin));
    else if (/\.(js|mjs|cjs)$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

// Le texte sans ses commentaires (lignes de commentaire, blocs « barre-étoile », fins de ligne « // … » hors des chaînes).
export function sansCommentaires(texte) {
  const sansBlocs = texte.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '));
  return sansBlocs.split('\n').map((ligne) => {
    if (/^\s*\/\//.test(ligne)) return '';
    for (let i = ligne.indexOf(' //'); i !== -1; i = ligne.indexOf(' //', i + 1)) {
      const avant = ligne.slice(0, i);
      const pair = (c) => (avant.split(c).length - 1) % 2 === 0;
      if (pair("'") && pair('"') && pair('`')) return avant;
    }
    return ligne;
  }).join('\n');
}

const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const MOTIFS_INTERDITS = [
  { nom: 'adresse dérivée d\'un nom de projet', motif: /chevalier-ia-(os|app)\.(web\.app|firebaseapp\.com|firebasestorage\.app|iam\.gserviceaccount\.com|cloudfunctions\.net|appspot\.com)/ },
  { nom: 'projet écrit en dur (projectId / projet)', motif: /\b(projectId|projet)\s*:\s*['"`][a-z]/ },
  { nom: 'projet par défaut', motif: /\|\|\s*['"`]chevalier-ia-/ },
  { nom: 'compte de Jérôme', motif: new RegExp(echapper(COMPTE_JEROME), 'i') },
  { nom: 'compte du bot', motif: new RegExp(echapper(COMPTE_BOT), 'i') },
  { nom: 'adresse Gmail', motif: /[A-Za-z0-9._%+-]+@gmail\.com/ },
  { nom: 'hôte du n8n', motif: new RegExp(echapper(HOTE_N8N_ESSAI), 'i') },
  { nom: 'compte de service complet', motif: /@[a-z0-9-]+\.iam\.gserviceaccount\.com/ },
];

/**
 * Exceptions écrites et commentées : [fichier, motif, texte exact toléré, raison].
 * Une exception qui ne sert plus fait échouer le test (elle doit être retirée).
 */
export const EXCEPTIONS = [
  ['functions-plateforme/src/espace.js', 'adresse Gmail', 'prenom@gmail.com', 'exemple d\'adresse dans un message d\'erreur montré au client (« par exemple prenom@gmail.com »)'],
];

const aVerifier = [...DOSSIERS.flatMap(fichiers), ...REGLES];

describe('Chantier 0 : rien de propre à une maison dans le code du serveur et dans les règles', () => {
  test('MV1 aucun motif interdit (adresse de projet, projet en dur, projet par défaut, comptes de Jérôme, Gmail, n8n, compte de service complet)', () => {
    assert.ok(aVerifier.length > 100, `périmètre trop petit : ${aVerifier.length} fichiers`);
    const trouves = [];
    const exceptionsVues = new Set();
    for (const f of aVerifier) {
      const lignes = sansCommentaires(readFileSync(join(RACINE, f), 'utf8')).split('\n');
      lignes.forEach((ligne, i) => {
        for (const { nom, motif } of MOTIFS_INTERDITS) {
          const m = ligne.match(motif);
          if (!m) continue;
          const exception = EXCEPTIONS.find(([fe, ne, texte]) => fe === f && ne === nom && ligne.includes(texte) && m[0] === texte);
          if (exception) { exceptionsVues.add(exception); continue; }
          trouves.push(`${f}:${i + 1} (${nom})`);
        }
      });
    }
    assert.deepEqual(trouves, [], `écrit en dur :\n${trouves.join('\n')}`);
    for (const e of EXCEPTIONS) assert.ok(exceptionsVues.has(e), `exception inutile, à retirer : ${e[0]} (${e[2]})`);
  });

  test('MV2 le détecteur voit bien ce qu\'il doit voir (sinon MV1 ne prouverait rien) et ignore les commentaires', () => {
    const vus = (t) => MOTIFS_INTERDITS.filter(({ motif }) => motif.test(sansCommentaires(t))).map((m) => m.nom);
    assert.deepEqual(vus("const a = 'https://chevalier-ia-os.web.app';"), ['adresse dérivée d\'un nom de projet']);
    assert.deepEqual(vus("serviceAccount: 'porte-serveur@chevalier-ia-app.iam.gserviceaccount.com',"), ['adresse dérivée d\'un nom de projet', 'compte de service complet']);
    assert.deepEqual(vus("initializeApp({ projectId: 'un-projet' });"), ['projet écrit en dur (projectId / projet)']);
    assert.deepEqual(vus("const p = process.env.GCLOUD_PROJECT || 'chevalier-ia-os';"), ['projet par défaut']);
    assert.deepEqual(vus(`const e = '${COMPTE_JEROME}';`), ['compte de Jérôme', 'adresse Gmail']);
    assert.deepEqual(vus(`const u = 'https://${HOTE_N8N_ESSAI}';`), ['hôte du n8n']);
    assert.deepEqual(vus("// https://chevalier-ia-os.web.app/mcp (commentaire)\nconst x = 1; // https://chevalier-ia-app.web.app"), []);
    assert.deepEqual(vus("/* https://chevalier-ia-os.web.app */ const y = 2;"), []);
    assert.deepEqual(vus("const s = 'a // https://chevalier-ia-os.web.app';"), ['adresse dérivée d\'un nom de projet'], 'un « // » dans une chaîne n\'est pas un commentaire');
    assert.deepEqual(vus("export const NOM_SERVEUR_CRM = 'chevalier-ia-os';"), [], 'le nom du serveur MCP (vu par les assistants) reste permis');
    assert.deepEqual(vus("initializeApp({ projectId: projet }, 'plateforme');"), [], 'un projet lu dans une variable est permis');
  });

  test('MV3 comptes de service : écrits « nom@ » (complétés avec le projet visé par firebase-tools au déploiement), jamais en entier', () => {
    for (const f of ['functions/src/index.js', 'functions-plateforme/src/index.js']) {
      const t = sansCommentaires(readFileSync(join(RACINE, f), 'utf8'));
      const valeurs = [...t.matchAll(/(?:serviceAccount:|const COMPTE_[A-Z_]+ =)\s*'([^']*)'/g)].map((m) => m[1]);
      assert.ok(valeurs.length >= 3, `${f} : comptes de service introuvables`);
      for (const v of valeurs) assert.match(v, /^[a-z][a-z0-9-]{4,28}@$/, `${f} : ${v}`);
    }
  });

  test('MV4 la source « pour les essais » de la fiche n\'est jamais appelée par le serveur ; le serveur ne lit plus js/os/administrateur.js', () => {
    for (const f of DOSSIERS.flatMap(fichiers)) {
      const t = readFileSync(join(RACINE, f), 'utf8');
      if (f === 'functions/src/securite/reglages-maison.js') continue;
      assert.doesNotMatch(t, /remplacerSourcePourEssais/, f);
      assert.doesNotMatch(t, /administrateur\.js'/, `${f} : « Jérôme seul » se lit dans la fiche (estJeromeSeul), plus dans js/os/administrateur.js`);
    }
    assert.doesNotMatch(readFileSync(join(RACINE, 'scripts/preparer-fonctions.js'), 'utf8'), /copyFileSync\([^)]*administrateur\.js/);
    if (existsSync(join(RACINE, 'functions/partage'))) assert.ok(!existsSync(join(RACINE, 'functions/partage/administrateur.js')), 'ancienne copie retirée par preparer-fonctions.js');
  });

  test('MV5 la fiche reglages_maison est fermée au navigateur dans les deux jeux de règles (maison : jamais ; plateforme : tout refusé par défaut)', () => {
    const r = readFileSync(join(RACINE, 'firestore.rules'), 'utf8');
    assert.match(r, /match \/reglages_maison\/\{id\} \{\s+allow get: if id == 'public' \|\| \(id == 'ecran' && compteAutorise\(\)\);\s+allow list, write: if false;\s+\}/);
    const p = sansCommentaires(readFileSync(join(RACINE, 'firestore.plateforme.rules'), 'utf8'));
    assert.doesNotMatch(p, /reglages_maison/, 'la plateforme ne l\'ouvre jamais : elle tombe dans le refus par défaut');
    assert.match(p, /match \/\{document=\*\*\} \{\s+allow read, write: if false;/);
    assert.ok(relative(RACINE, join(RACINE, 'storage.plateforme.rules')) && !/reglages_maison/.test(readFileSync(join(RACINE, 'storage.plateforme.rules'), 'utf8')));
  });
});
