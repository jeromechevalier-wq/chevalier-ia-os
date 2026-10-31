// La porte des workflows n8n chez les clients (functions-plateforme/src/porte.js, projet chevalier-ia-app) : parité du code copié, déclaration de la fonction,
// refus sans lecture de données, cloisonnement entre clients, journal sans donnée sensible, aucune règle Firestore pour les clés.
// Sans émulateur : fausse base en mémoire. Exige `npm run preparer` (copie de functions/partage/porte/ vers functions-plateforme/serveur/).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { creerPortePlateforme, creerGestionnairePortePlateforme, BUCKET_PLATEFORME } from '../functions-plateforme/src/porte.js';
import { genererCle, enregistrementDe, TABLE_CLES } from '../scripts/porte/cles.js';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const maintenant = new Date();

/** Fausse base : chemin « collection/id » -> données. Note chaque lecture (`lectures`) pour prouver qu'aucune donnée n'est lue avant une clé acceptée. */
function fausseBase(depart) {
  const docs = new Map(Object.entries(depart));
  const lectures = [];
  const ref = (chemin) => ({
    path: chemin,
    get: async () => { lectures.push(chemin); return { exists: docs.has(chemin), id: chemin.split('/').pop(), data: () => structuredClone(docs.get(chemin)), updateTime: null }; },
    create: async (d) => { if (docs.has(chemin)) throw Object.assign(new Error('existe'), { code: 6 }); docs.set(chemin, structuredClone(d)); },
    update: async (p) => { if (!docs.has(chemin)) throw Object.assign(new Error('absent'), { code: 5 }); docs.set(chemin, { ...docs.get(chemin), ...p }); },
  });
  return {
    docs, lectures,
    collection: (n) => ({ doc: (id) => ref(`${n}/${id}`) }),
    doc: (chemin) => ref(chemin),
    runTransaction: async (fn) => {
      const ecritures = [];
      const t = {
        get: (r) => r.get(),
        set: (r, d) => ecritures.push(() => docs.set(r.path, d)),
        update: (r, d) => ecritures.push(() => docs.set(r.path, { ...docs.get(r.path), ...d })),
        delete: (r) => ecritures.push(() => docs.delete(r.path)),
      };
      const res = await fn(t);
      ecritures.forEach((e) => e());
      return res;
    },
  };
}

const cleDe = (proprietaire) => { const cle = genererCle(proprietaire); const e = enregistrementDe(cle, proprietaire, maintenant); return { cle, e }; };
const MODULES = { affaires: true, devis: true, automatisations: true };
const monde = () => {
  const audrey = cleDe('audrey');
  const martin = cleDe('martin');
  const revoquee = cleDe('audrey');
  return {
    audrey, martin, revoquee,
    depart: {
      [`${TABLE_CLES}/${audrey.e.id}`]: audrey.e.donnees,
      [`${TABLE_CLES}/${martin.e.id}`]: martin.e.donnees,
      [`${TABLE_CLES}/${revoquee.e.id}`]: { ...revoquee.e.donnees, actif: false, revoqueLe: maintenant },
      'marques/audrey': { actif: true, nom: 'Audrey' },
      'clients/audrey': { modules: MODULES },
      'marques/martin': { actif: true, nom: 'Martin' },
      'clients/martin': { modules: MODULES },
    },
  };
};

/** Faux n8n : un workflow par identifiant. */
function fauxN8n(workflows) {
  const appels = [];
  const fetchImpl = async (url) => {
    appels.push(String(url));
    const id = String(url).split('/').pop();
    const w = workflows[id];
    return w ? { ok: true, status: 200, json: async () => w } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, appels };
}
const WF = {
  wA: { id: 'wA', name: 'client-audrey-devis-email', tags: [{ name: 'client-audrey' }] },
};

function creer({ depart, workflows = WF, lignes = [] }) {
  const db = fausseBase(depart);
  const n8n = fauxN8n(workflows);
  const options = { db, lireSecret: async () => 'cle-api-factice', sortie: (l) => lignes.push(l), fetchImpl: n8n.fetchImpl, stockage: () => ({ lienSigne: async () => 'https://stockage.exemple.test/signe', taille: async () => 1 }) };
  return { db, n8n, lignes, porte: creerPortePlateforme(options), gestionnaire: creerGestionnairePortePlateforme(options) };
}
const appeler = (porte, cle, module, action, donnees, workflowId = 'wA') =>
  porte({ methode: 'POST', authorization: `Bearer ${cle}`, corps: { module, action, workflowId, donnees } });

/** Appel HTTP avec de faux req/res. */
async function http(gestionnaire, { methode = 'POST', url = '/porte', entetes = {}, corps = '{}' } = {}) {
  const req = { method: methode, url, headers: entetes, rawBody: Buffer.from(corps) };
  const sortie = {};
  const res = { writeHead: (s) => { sortie.statut = s; }, end: (t) => { sortie.corps = JSON.parse(t); } };
  await gestionnaire(req, res);
  return sortie;
}

describe('P1 parité : le code copié chez les clients est celui de Jérôme (après npm run preparer)', () => {
  test('P1 les 12 fichiers de la porte sont identiques, et porte-commun.js aussi', () => {
    const src = 'functions/partage/porte';
    const dst = 'functions-plateforme/serveur/partage/porte';
    const fichiers = readdirSync(new URL(`../${src}`, import.meta.url)).sort();
    assert.equal(fichiers.length, 12);
    assert.deepEqual(readdirSync(new URL(`../${dst}`, import.meta.url)).sort(), fichiers);
    for (const f of fichiers) assert.equal(lire(`${dst}/${f}`), lire(`${src}/${f}`), f);
    assert.equal(lire('functions-plateforme/serveur/src/coeur/porte-commun.js'), lire('functions/src/coeur/porte-commun.js'));
  });
  test('P1 porte-commun.js n\'importe jamais stockage-projet ni pdf-appel (comptes de Jérôme)', () => {
    const code = lire('functions/src/coeur/porte-commun.js').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /stockage-projet|pdf-appel/);
    assert.doesNotMatch(lire('functions-plateforme/src/porte.js').replace(/\/\/.*$/gm, ''), /stockage-projet|pdf-appel|contexte: 'crm'/);
  });
  test('P1 la copie du dossier de la porte est faite par preparer-fonctions.js', () => {
    assert.match(lire('scripts/preparer-fonctions.js'), /cpSync\(join\(destination, 'porte'\), join\(destinationServeur, 'partage', 'porte'\), \{ recursive: true \}\)/);
  });
});

describe('P2 déclaration de la fonction « porte » et contexte', () => {
  const index = lire('functions-plateforme/src/index.js');
  const section = index.slice(index.indexOf('export const porte = '));
  test('P2 index.js déclare porte avec les réglages attendus', () => {
    assert.match(section, /region: REGION, maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, invoker: 'public', cors: false, secrets: \[CLE_N8N\], serviceAccount: COMPTE_PDF/);
    assert.match(section, /creerGestionnairePortePlateforme\(\{ lireSecret: async \(\) => CLE_N8N\.value\(\) \}\)/);
    assert.match(index, /const COMPTE_PDF = 'devis-pdf@chevalier-ia-app\.iam\.gserviceaccount\.com'/);
    assert.ok(index.indexOf("const COMPTE_PDF") < index.indexOf('export const porte = '), 'le compte est défini avant la porte');
    assert.match(index, /const CLE_N8N = defineSecret\('N8N_API_KEY'\)/);
  });
  test('P2 le bucket de la porte est celui de index.js', () => {
    assert.match(index, new RegExp(`const BUCKET = '${BUCKET_PLATEFORME.replaceAll('.', '\\.')}'`));
  });
  test('P2 contexte « plateforme », jamais « crm »', () => {
    const code = lire('functions-plateforme/src/porte.js').replace(/\/\/.*$/gm, '');
    assert.match(code, /contexte: 'plateforme'/);
    assert.doesNotMatch(code, /'crm'/);
  });
});

describe('P3 refus avec le vrai gestionnaire HTTP : rien n\'est lu avant qu\'une clé soit acceptée', () => {
  const sansEffet = (c) => {
    assert.deepEqual(c.db.lectures.filter((l) => !l.startsWith(`${TABLE_CLES}/`)), [], 'aucune lecture de marques/ ni clients/');
    assert.equal(c.n8n.appels.length, 0, 'aucun appel à n8n');
  };
  test('P3 sans en-tête, clé inconnue, clé révoquée : 401 cle_refusee', async () => {
    const m = monde();
    const c = creer({ depart: m.depart });
    const sans = await http(c.gestionnaire, { corps: JSON.stringify({ module: 'devis', action: 'devis.lireEmail', workflowId: 'wA', donnees: {} }) });
    assert.equal(sans.statut, 401); assert.equal(sans.corps.erreur, 'cle_refusee');
    const inconnue = await http(c.gestionnaire, { entetes: { authorization: `Bearer ${genererCle('audrey')}` } });
    assert.equal(inconnue.statut, 401); assert.equal(inconnue.corps.erreur, 'cle_refusee');
    const revoquee = await http(c.gestionnaire, { entetes: { authorization: `Bearer ${m.revoquee.cle}` } });
    assert.equal(revoquee.statut, 401); assert.equal(revoquee.corps.erreur, 'cle_refusee');
    sansEffet(c);
  });
  test('P3 GET : 405 ; en-tête Origin : 403 ; corps trop gros : 413 ; autre chemin : 404', async () => {
    const m = monde();
    const c = creer({ depart: m.depart });
    const auth = { authorization: `Bearer ${m.audrey.cle}` };
    assert.equal((await http(c.gestionnaire, { methode: 'GET', entetes: auth })).statut, 405);
    assert.equal((await http(c.gestionnaire, { entetes: { ...auth, origin: 'https://exemple.test' } })).statut, 403);
    assert.equal((await http(c.gestionnaire, { entetes: { ...auth, 'content-length': '262145' } })).statut, 413);
    assert.equal((await http(c.gestionnaire, { url: '/autre', entetes: auth })).statut, 404);
    sansEffet(c);
  });
});

describe('P4 isolation entre clients', () => {
  const lireEmail = { devisId: 'dv1', demandeId: 'dem_inconnue' };
  test('P4 clé audrey + workflow client-audrey : la demande inconnue répond 404 demande_inconnue', async () => {
    const m = monde();
    const { porte } = creer({ depart: m.depart });
    const r = await appeler(porte, m.audrey.cle, 'devis', 'devis.lireEmail', lireEmail);
    assert.equal(r.statut, 404, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'demande_inconnue');
  });
  test('P4 le même workflow avec la clé de martin : 403 workflow_refuse', async () => {
    const m = monde();
    const { porte } = creer({ depart: m.depart });
    const r = await appeler(porte, m.martin.cle, 'devis', 'devis.lireEmail', lireEmail);
    assert.equal(r.statut, 403); assert.equal(r.corps.erreur, 'workflow_refuse');
  });
  test('P4 marque inactive ou absente, ou module éteint : 403 module_non_actif', async () => {
    const m = monde();
    const inactive = creer({ depart: { ...m.depart, 'marques/audrey': { actif: false, nom: 'Audrey' } } });
    const r1 = await appeler(inactive.porte, m.audrey.cle, 'devis', 'devis.lireEmail', lireEmail);
    assert.equal(r1.statut, 403); assert.equal(r1.corps.erreur, 'module_non_actif');
    const sansMarque = { ...m.depart }; delete sansMarque['marques/audrey'];
    const r2 = await appeler(creer({ depart: sansMarque }).porte, m.audrey.cle, 'devis', 'devis.lireEmail', lireEmail);
    assert.equal(r2.statut, 403); assert.equal(r2.corps.erreur, 'module_non_actif');
    const r3 = await appeler(creer({ depart: m.depart }).porte, m.audrey.cle, 'veille', 'sources.lire', {});
    assert.equal(r3.statut, 403); assert.equal(r3.corps.erreur, 'module_non_actif');
  });
  test('P4 propositions.ajouter écrit sous clients/audrey/… seulement, jamais à la racine ni chez martin', async () => {
    const m = monde();
    const c = creer({ depart: m.depart });
    const r = await appeler(c.porte, m.audrey.cle, 'automatisations', 'propositions.ajouter', { id: 'p1', type: 'Contact', titre: 'Ajouter', champs: [{ nom: 'Nom', valeur: 'X' }] });
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    const nouveaux = [...c.db.docs.keys()].filter((k) => !Object.keys(m.depart).includes(k));
    assert.deepEqual(nouveaux, ['clients/audrey/automatisations_propositions/p1']);
  });
});

describe('P5 journal : liste blanche', () => {
  test('P5 aucune clé, demandeId, titre ni adresse dans les lignes', async () => {
    const m = monde();
    const lignes = [];
    const { porte } = creer({ depart: m.depart, lignes });
    await appeler(porte, m.audrey.cle, 'automatisations', 'propositions.ajouter', { id: 'p1', type: 'Contact', titre: 'TITRE-SECRET', champs: [{ nom: 'Mail', valeur: 'marie@exemple.fr' }] });
    await appeler(porte, m.audrey.cle, 'devis', 'devis.lireEmail', { devisId: 'dv1', demandeId: 'dem_DEMANDE' });
    await appeler(porte, 'cle-n8n.audrey.mauvaise', 'devis', 'devis.lireEmail', {});
    assert.ok(lignes.length >= 3);
    const texte = lignes.join('\n');
    for (const interdit of [m.audrey.cle, 'dem_DEMANDE', 'TITRE-SECRET', 'marie@exemple.fr', 'Bearer', 'cle-api-factice']) assert.ok(!texte.includes(interdit), interdit);
    for (const l of lignes) for (const k of Object.keys(JSON.parse(l))) assert.ok(['severity', 'message', 'idCourt', 'proprietaire', 'module', 'action', 'workflowId', 'statut', 'code', 'dureeMs'].includes(k), k);
  });
});

describe('P8 aucune règle Firestore pour les clés', () => {
  test('P8 firestore.plateforme.rules ne contient aucun match /plateforme_cles', () => {
    assert.doesNotMatch(lire('firestore.plateforme.rules'), /match\s+\/plateforme_cles/);
  });
});
