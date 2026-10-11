// Contrôles sans réseau ni émulateur du journal d'activité (chantier 14) : lecture seule vers n8n, aucun secret, cohérence entre
// le registre, les règles Firestore, les fonctions et la configuration de déploiement.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleDeclare, IDS_MODULES } from '../js/os/registre.js';
import { MOTIF_IDENTIFIANT_CLIENT, LONGUEUR_MAX_ETIQUETTE_N8N, LONGUEUR_MAX_IDENTIFIANT_JOURNAL, PREFIXE_ETIQUETTE } from '../functions-plateforme/src/etiquettes.js';
import { MODULE_JOURNAL } from '../functions-plateforme/src/appels.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const SRC = join(RACINE, 'functions-plateforme', 'src');
const fichiers = readdirSync(SRC).filter((f) => f.endsWith('.js'));
/** Code sans commentaires (// et /* *​/) ni textes entre guillemets : pour chercher des appels réels, pas des mots dans une explication. */
const code = (f) => lire(`functions-plateforme/src/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

describe('Lecture seule vers n8n : seulement des requêtes GET', () => {
  test('le seul fichier qui parle à n8n est n8n.js, et il n\'emploie que le verbe GET', () => {
    for (const f of fichiers) {
      const c = code(f);
      const parle = /\bfetch\s*\(|fetchImpl\s*\(|https?\.request|XMLHttpRequest|axios|node-fetch|\bgot\s*\(|undici|\.request\s*\(/.test(c);
      assert.equal(parle, f === 'n8n.js', `${f} ${parle ? 'parle' : 'ne parle pas'} au réseau`);
    }
    const n8n = code('n8n.js');
    const verbes = [...n8n.matchAll(/method\s*:\s*['"`]([A-Za-z]+)['"`]/g)].map((m) => m[1]);
    assert.deepEqual(verbes, ['GET'], 'un seul appel réseau, en GET');
    assert.equal((n8n.match(/\bfetchImpl\s*\(/g) || []).length, 1, 'un seul point de sortie vers n8n');
  });
  test('aucun autre verbe HTTP nulle part dans le code des fonctions (POST, PUT, PATCH, DELETE, HEAD, OPTIONS)', () => {
    for (const f of fichiers) assert.ok(!/['"`](POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]|\.(post|put|patch|delete)\s*\(\s*['"`/]/i.test(code(f).replace(/\.delete\(\)/g, '')), f);
  });
  test('le code ne construit jamais de chemin de lancement ou de modification de n8n', () => {
    const n8n = code('n8n.js');
    assert.ok(!/\/run|\/activate|\/deactivate|\/retry|\/stop|\/transfer|\/credentials|\/users|\/variables/.test(n8n));
    const chemins = [...n8n.matchAll(/(?:lire|parcourir)\(\s*[`'"](\/[a-z/${}A-Z.]*)/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ':id'));
    assert.deepEqual([...new Set(chemins)].sort(), ['/executions', '/executions/${encodeURIComponent', '/workflows']); // lecture de la liste des exécutions, d'une exécution, des workflows
  });
  test('l\'adresse de n8n est celle de la production en https ; index.js n\'en passe pas d\'autre', () => {
    assert.match(code('n8n.js'), /URL_N8N = 'https:\/\/n8n\.chevalier-ia\.fr'/);
    assert.ok(!/url\s*:/.test(code('index.js')));
  });
});

describe('Aucun secret dans le dépôt', () => {
  test('la clé n8n n\'est lue que par defineSecret, au moment d\'un appel, et jamais écrite ni affichée', () => {
    const index = code('index.js');
    assert.match(index, /defineSecret\('N8N_API_KEY'\)/);
    assert.match(index, /const lecteur = \(\) => creerLecteurN8n\(\{ cle: CLE_N8N\.value\(\) \}\)/);
    assert.equal((index.match(/CLE_N8N\.value\(\)/g) || []).length, 1);
    for (const f of fichiers) assert.ok(!/console\.|logger\.\w+\([^)]*\bcle\b/.test(code(f)), `${f} n'affiche pas la clé`);
    assert.ok(!/process\.env/.test(code('n8n.js')));
  });
  test('aucun fichier de cette étape ne contient de clé, de jeton ou de clé privée', () => {
    const liste = [];
    const marcher = (d) => { for (const n of readdirSync(d)) { if (n === 'node_modules') continue; const c = join(d, n); statSync(c).isDirectory() ? marcher(c) : liste.push(c); } };
    marcher(join(RACINE, 'functions-plateforme'));
    for (const f of ['tests/_faux-n8n.js', 'docs/journal-activite-workflows.md', 'docs/journal-chantier-14.md']) liste.push(join(RACINE, f));
    for (const c of liste) {
      if (c.endsWith('package-lock.json')) continue;
      let t; try { t = readFileSync(c, 'utf8'); } catch { continue; }
      assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|github_pat_|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(t), c);
    }
  });
});

describe('Cohérence : registre, règles, fonctions, déploiement', () => {
  test('le module « journal » du registre est celui que les fonctions cherchent, réservé aux clients', () => {
    assert.equal(MODULE_JOURNAL, 'journal');
    const m = moduleDeclare('journal');
    assert.equal(m.reserveAuxClients, true);
    assert.ok(IDS_MODULES.includes('journal'));
    assert.deepEqual(m.dependances, []);
    assert.deepEqual(m.outilsMcp, []);
    assert.deepEqual(m.ecrans.map((e) => e.route), ['journal/historique']);
  });
  test('les collections du module sont exactement celles que les règles ferment à l\'écriture', () => {
    const m = moduleDeclare('journal');
    const regles = lire('firestore.plateforme.rules');
    const liste = regles.match(/collection in \[([^\]]*)\]/)[1].match(/'([a-z_]+)'/g).map((x) => x.replace(/'/g, ''));
    assert.deepEqual([...liste].sort(), [...m.collections].sort());
    assert.match(regles, /!collectionDuJournal\(collection\) && roleDe\(client\) == 'editeur'/);
  });
  test('les fonctions n\'écrivent que dans les collections déclarées (et le signalement du serveur)', () => {
    const m = moduleDeclare('journal');
    const chemins = new Set();
    for (const f of fichiers) for (const x of code(f).matchAll(/\$\{(?:racine|client)\}\/([a-z_]+)|clients\/\$\{client\}\/([a-z_]+)|`clients\/\$\{client\}\/([a-z_]+)/g)) chemins.add(x[1] || x[2] || x[3]);
    for (const c of chemins) assert.ok([...m.collections, 'membres'].includes(c), `collection inattendue : ${c}`);
  });
  test('étiquette n8n : 24 caractères au plus, donc identifiant de client de 17 caractères au plus pour ce module', () => {
    assert.equal(LONGUEUR_MAX_ETIQUETTE_N8N, 24);
    assert.equal(PREFIXE_ETIQUETTE, 'client-');
    assert.equal(LONGUEUR_MAX_IDENTIFIANT_JOURNAL, 17);
    assert.equal(`${PREFIXE_ETIQUETTE}${'a'.repeat(17)}`.length, 24);
    assert.ok(MOTIF_IDENTIFIANT_CLIENT.test('a'.repeat(40)), 'les identifiants de clients vont jusqu\'à 40');
  });
  test('les fonctions sont dans leur propre dossier, versions figées, Node 22, région de Paris', () => {
    const p = JSON.parse(lire('functions-plateforme/package.json'));
    assert.equal(p.engines.node, '22');
    for (const v of Object.values(p.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(Object.keys(p.dependencies).sort(), ['firebase-admin', 'firebase-functions']);
    assert.equal((code('index.js').match(/region:\s*REGION/g) || []).length, 3);
    assert.match(code('index.js'), /REGION = 'europe-west9'/);
    assert.match(code('index.js'), /schedule: '0 \* \* \* \*'/);
  });
  test('seule la copie et le renommage touchent à Firestore pour écrire ; l\'écran n\'écrit jamais lui-même', () => {
    for (const f of readdirSync(join(RACINE, 'js/modules/journal'))) {
      const t = lire(`js/modules/journal/${f}`).replace(/\/\/.*$/gm, '');
      assert.ok(!/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/.test(t), `${f} écrit dans Firestore`);
    }
  });
});

describe('Les fonctions se chargent comme Firebase les chargera', () => {
  test('trois fonctions, région de Paris, planifiée toutes les heures, clé n8n liée par secret sur les deux qui lisent n8n, aucun secret pour « renommer »', async () => {
    process.env.GCLOUD_PROJECT ??= 'demo-chevalier-ia-os';
    const m = await import('../functions-plateforme/src/index.js');
    assert.deepEqual(Object.keys(m).sort(), ['journalCopieHoraire', 'journalRafraichir', 'journalRenommer']);
    for (const f of Object.values(m)) assert.deepEqual(f.__endpoint.region, ['europe-west9']);
    assert.equal(m.journalCopieHoraire.__endpoint.scheduleTrigger.schedule, '0 * * * *');
    assert.deepEqual(m.journalCopieHoraire.__endpoint.secretEnvironmentVariables, [{ key: 'N8N_API_KEY' }]);
    assert.deepEqual(m.journalRafraichir.__endpoint.secretEnvironmentVariables, [{ key: 'N8N_API_KEY' }]);
    assert.equal(m.journalRenommer.__endpoint.secretEnvironmentVariables, undefined);
  });
});
