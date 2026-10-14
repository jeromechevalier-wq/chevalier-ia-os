// La fonction de la porte pour le CRM (functions/src/porte.js) de bout en bout : vrai Firestore (émulateur), vrai serveur HTTP, FAUX n8n et faux Secret Manager.
// Vérifie surtout l'assemblage : clé d'API n8n lue au moment de l'appel, contrôle d'intégrité par GET, journal sans donnée sensible, porte fermée si la clé n8n manque.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerGestionnairePorteCrm, ligneDeJournal } from '../functions/src/porte.js';
import { genererCle, enregistrementDe, TABLE_CLES } from '../scripts/porte/cles.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-chevalier-ia-os';
const CLE_API_N8N = 'cle-api-n8n-factice-pour-les-essais';

describe('Fonction porte du CRM (émulateur, faux n8n)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm test)' }, () => {
  let app; let db; let n8n; let porte; let cle; let lectureSecret; let secretDisponible = true; const journal = []; const vusParN8n = [];

  before(async () => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-porte-fonction');
    db = getFirestore(app);
    for (const c of ['plateforme_cles', 'veille_sources', 'veille_contenus', 'veille_resumes']) await db.recursiveDelete(db.collection(c));
    cle = genererCle('interne');
    const e = enregistrementDe(cle, 'interne', new Date());
    await db.collection(TABLE_CLES).doc(e.id).set({ ...e.donnees, creeLe: Timestamp.fromDate(e.donnees.creeLe) });
    await db.doc('veille_sources/s1').set({ nom: 'Chaîne Alpha', type: 'YouTube', actif: true });
    // Faux n8n : ne répond qu'à GET /api/v1/workflows/<id> avec la bonne clé d'API ; enregistre ce qu'il reçoit.
    const workflows = { wOK: { id: 'wOK', name: 'interne-veille-collecte', tags: [{ id: 't1', name: 'interne' }, { id: 't2', name: 'domaine-marketing' }], nodes: [{ secret: 'ne doit jamais sortir' }] }, wClient: { id: 'wClient', name: 'client-audrey-x', tags: [{ name: 'client-audrey' }] } };
    n8n = createServer((req, res) => {
      vusParN8n.push({ methode: req.method, url: req.url, cle: req.headers['x-n8n-api-key'] });
      const id = req.url.split('/').pop();
      if (req.method !== 'GET' || req.headers['x-n8n-api-key'] !== CLE_API_N8N) { res.writeHead(401).end(); return; }
      if (!workflows[id]) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(workflows[id]));
    });
    await new Promise((r) => n8n.listen(0, '127.0.0.1', r));
    let lectures = 0;
    lectureSecret = () => lectures;
    const gestionnaire = creerGestionnairePorteCrm({
      db, urlN8n: `http://127.0.0.1:${n8n.address().port}`, sortie: (l) => journal.push(l),
      lireSecret: async () => { lectures++; if (!secretDisponible) throw new Error('secret absent'); return `${CLE_API_N8N}\n`; },
    });
    porte = createServer(gestionnaire);
    await new Promise((r) => porte.listen(0, '127.0.0.1', r));
  });
  after(async () => { await new Promise((r) => porte.close(r)); await new Promise((r) => n8n.close(r)); await deleteApp(app); });

  const appeler = (corps, k = cle) => fetch(`http://127.0.0.1:${porte.address().port}/porte`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` }, body: JSON.stringify(corps) });
  const ajout = (workflowId) => ({ module: 'veille', action: 'contenus.ajouter', workflowId, donnees: { contenus: [{ id: 'c1', sourceId: 's1', titre: 'Une vidéo', url: 'https://exemple.test/v' }] } });

  test('workflow interne : la clé d\'API n8n est lue, n8n est interrogé en GET seulement, et l\'écriture se fait à la racine', async () => {
    const r = await appeler(ajout('wOK'));
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).resultat, { crees: 1, existants: 0 });
    assert.equal((await db.doc('veille_contenus/c1').get()).data().sourceNom, 'Chaîne Alpha');
    assert.deepEqual(vusParN8n.map((v) => [v.methode, v.url, v.cle]), [['GET', '/api/v1/workflows/wOK', CLE_API_N8N]], 'la clé d\'API est nettoyée du retour à la ligne et envoyée à n8n seulement');
    assert.equal(lectureSecret(), 1);
  });
  test('le secret est gardé en mémoire quelques minutes, et le contrôle réussi 60 s (pas de nouvelle lecture)', async () => {
    await appeler(ajout('wOK'));
    assert.equal(lectureSecret(), 1);
    assert.equal(vusParN8n.length, 1);
  });
  test('un workflow de client est refusé dans la base 1, même avec la clé « interne »', async () => {
    const r = await appeler(ajout('wClient'));
    assert.equal(r.status, 403);
    assert.equal((await r.json()).erreur, 'workflow_refuse');
  });
  test('workflow inconnu de n8n : refusé (403) ; clé d\'API n8n absente : la porte se ferme (503), rien n\'est écrit', async () => {
    assert.equal((await appeler(ajout('wFantome'))).status, 403);
    // Nouveau gestionnaire sans secret : le cache d'intégrité et du secret sont propres à chaque instance.
    const sans = creerGestionnairePorteCrm({ db, urlN8n: `http://127.0.0.1:${n8n.address().port}`, sortie: () => {}, lireSecret: async () => { throw new Error('absent'); } });
    const s = createServer(sans);
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    try {
      const r = await fetch(`http://127.0.0.1:${s.address().port}/porte`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` }, body: JSON.stringify(ajout('wOK')) });
      assert.equal(r.status, 503);
    } finally { await new Promise((r) => s.close(r)); }
    assert.equal((await db.doc('veille_contenus/c1').get()).exists, true);
    assert.equal((await db.collection('veille_contenus').get()).size, 1, 'rien d\'écrit par les appels refusés');
  });
  test('le journal ne contient ni clé, ni titre, ni clé d\'API n8n', async () => {
    const texte = journal.join('\n');
    assert.ok(journal.length >= 3);
    for (const interdit of [cle, cle.split('.')[2], CLE_API_N8N, 'Une vidéo', 'exemple.test']) assert.ok(!texte.includes(interdit), interdit.slice(0, 20));
    for (const l of journal) assert.deepEqual(Object.keys(JSON.parse(l)).filter((k) => !['severity', 'message', 'idCourt', 'proprietaire', 'module', 'action', 'workflowId', 'statut', 'code', 'dureeMs'].includes(k)), []);
  });
  test('ligneDeJournal : liste blanche, valeurs courtes, ERROR au-dessus de 500', () => {
    const l = JSON.parse(ligneDeJournal({ statut: 503, titre: 'secret', cle: 'secret', code: 'x'.repeat(200), idCourt: 'ab12cd34' }));
    assert.deepEqual(l, { severity: 'ERROR', message: 'porte', idCourt: 'ab12cd34', statut: 503, code: 'x'.repeat(80) });
  });
});
