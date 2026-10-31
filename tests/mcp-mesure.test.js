// Mesure de la lenteur du serveur MCP (brief « nuit-mesure-mcp ») : démarrage à froid, durée d'authentification, durée de l'outil, lectures.
// Un test par point : 1 froid (Jérôme), 2 froid (clients), 3 durées d'un tools/call, 4 compte exact des lectures, 5 liste blanche, 6 résumeur, 7 champs numériques.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { Client } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { creerGestionnaireClients } from '../functions/src/clients/gestionnaire.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { CHAMPS, CHAMPS_MESURE, journaliser } from '../functions/src/securite/journaux.js';
import { compterLectures } from '../functions/src/securite/mesure.js';
import { avecBase, creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { resumer, formater } from '../scripts/mcp/resumer-journal.js';
import { collections } from './_donnees-essai.js';

const JETON = `cia_${'M'.repeat(43)}`;
const SECRET = JSON.stringify([{ jeton: 'mesure-essai', acteur: 'mesure-essai', profil: 'claude-code', empreinte: empreinte(JETON), actif: true }]);
const magasin = () => creerMagasin({ lire: async () => SECRET, dureeCacheMs: 0 });
const faux = (extra = {}) => {
  const res = new EventEmitter();
  Object.assign(res, { statusCode: 200, headersSent: false, writeHead(s) { res.statusCode = s; }, end() { res.headersSent = true; res.emit('finish'); } });
  return { req: { headers: {}, method: 'POST', url: '/mcp/a', body: undefined, ...extra }, res };
};
const horloge = () => { let t = 1000; return () => (t += 1); };

describe('1 et 2 : démarrage à froid', () => {
  test('1 Jérôme : la première requête porte froid:true et demarrageMs entier ≥ 0 ; la deuxième n\'a pas le champ', async () => {
    const lignes = [];
    const g = creerGestionnaire({ magasin: magasin(), donnees: creerAccesMemoire({}), journal: (l) => lignes.push(l), maintenant: horloge() });
    for (let i = 0; i < 2; i += 1) { const { req, res } = faux({ headers: { origin: 'https://exemple.test' } }); await g(req, res); }
    assert.equal(lignes[0].froid, true);
    assert.ok(Number.isInteger(lignes[0].demarrageMs) && lignes[0].demarrageMs >= 0);
    assert.ok(!('froid' in lignes[1]) && !('demarrageMs' in lignes[1]));
    assert.equal(lignes[0].dureeAuthMs, undefined, 'refus avant l\'auth : pas de dureeAuthMs');
    assert.equal(lignes[0].lectures, undefined);
  });
  test('2 clients : idem, par gestionnaire', async () => {
    const lignes = [];
    const oauth = { traiter: async () => false, verifierAcces: async () => null };
    const g = creerGestionnaireClients({ donnees: creerAccesMemoire({}), oauth, journal: (l) => lignes.push(l), maintenant: horloge() });
    for (let i = 0; i < 2; i += 1) { const { req, res } = faux(); await g(req, res); }
    assert.equal(lignes[0].code, 'jeton');
    assert.equal(lignes[0].froid, true);
    assert.ok(Number.isInteger(lignes[0].demarrageMs) && lignes[0].demarrageMs >= 0);
    assert.ok(!('froid' in lignes[1]));
    assert.equal(lignes[1].dureeAuthMs, undefined);
  });
});

describe('3 et 4 : durées et lectures d\'un appel d\'outil', () => {
  let serveur, base, lignes, lecturesReelles;
  before(async () => {
    lignes = [];
    lecturesReelles = 0;
    const brut = creerAccesMemoire(structuredClone(collections));
    const espion = { ...brut, liste: (...a) => { lecturesReelles += 1; return brut.liste(...a); }, document: (...a) => { lecturesReelles += 1; return brut.document(...a); } };
    const g = creerGestionnaire({ magasin: magasin(), donnees: espion, journal: (l) => lignes.push(l), maintenant: horloge() });
    serveur = createServer((req, res) => {
      const m = [];
      req.on('data', (x) => m.push(x));
      req.on('end', () => { try { req.body = JSON.parse(Buffer.concat(m).toString('utf8')); } catch { req.body = undefined; } g(req, res); });
    });
    await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${serveur.address().port}/mcp`;
  });
  after(() => serveur.close());
  const connecter = async () => {
    const c = new Client({ name: 'essai', version: '1.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers: { Authorization: `Bearer ${JETON}` } } }));
    return c;
  };
  test('3 tools/call : dureeAuthMs, dureeOutilMs, lectures entiers, dureeOutilMs ≤ dureeMs ; tools/list n\'a ni dureeOutilMs ni lectures', async () => {
    const c = await connecter();
    lignes.length = 0;
    await c.callTool({ name: 'lire_personne', arguments: { id: 'p1' } });
    await c.listTools();
    await c.close();
    const appel = lignes.find((l) => l.outil === 'lire_personne');
    for (const k of ['dureeAuthMs', 'dureeOutilMs', 'lectures']) assert.ok(Number.isInteger(appel[k]) && appel[k] >= 0, k);
    assert.ok(appel.dureeOutilMs <= appel.dureeMs);
    const liste = lignes.find((l) => l.methodeMcp === 'tools/list');
    assert.ok(liste && !('dureeOutilMs' in liste) && !('lectures' in liste));
    assert.ok(Number.isInteger(liste.dureeAuthMs));
  });
  test('3 bis une erreur d\'outil garde dureeOutilMs et lectures', async () => {
    const c = await connecter();
    lignes.length = 0;
    await c.callTool({ name: 'lire_personne', arguments: { id: 'inexistant' } }).catch(() => {});
    await c.close();
    const appel = lignes.find((l) => l.outil === 'lire_personne');
    assert.ok(Number.isInteger(appel.dureeOutilMs) && Number.isInteger(appel.lectures));
  });
  test('4 lectures compte exactement les lectures de base de lire_personne (mesuré par un espion indépendant)', async () => {
    const c = await connecter();
    lignes.length = 0;
    lecturesReelles = 0;
    await c.callTool({ name: 'lire_personne', arguments: { id: 'p1' } });
    await c.close();
    const appel = lignes.find((l) => l.outil === 'lire_personne');
    assert.ok(appel.lectures > 0);
    assert.equal(appel.lectures, lecturesReelles);
  });
  test('4 compterLectures garde base (avecBase), compte liste/document/mettreAJour/transaction et ne change aucun résultat', async () => {
    const mem = creerAccesMemoire({ 'clients/a/crm_personnes': [{ id: 'p1', nom: 'X' }] });
    const compteur = { lectures: 0 };
    const d = compterLectures(avecBase(mem, 'clients/a'), compteur);
    assert.equal(d.base, 'clients/a');
    assert.equal((await d.document('crm_personnes', 'p1')).nom, 'X');
    assert.equal((await d.liste('crm_personnes')).length, 1);
    await d.mettreAJour('crm_personnes', 'p1', (x) => ({ ecrire: true, donnees: { ...x, nom: 'Y' } }));
    await d.transaction(async (tx) => { await tx.document('crm_personnes', 'p1'); await tx.liste('crm_personnes'); });
    d.nouvelId('crm_personnes');
    assert.equal(compteur.lectures, 5);
    assert.equal((await d.document('crm_personnes', 'p1')).nom, 'Y');
  });
});

describe('5 à 7 : liste blanche, résumeur, champs numériques', () => {
  test('5 le journal garde les 5 champs de mesure et refuse tout le reste (jeton en clair, e-mail, arguments)', () => {
    const sorties = [];
    journaliser({ outil: 'x', froid: true, demarrageMs: 12, dureeAuthMs: 3, dureeOutilMs: 4, lectures: 2, dureeMs: 9, statut: 200, email: 'secret@exemple.test', arguments: { a: 1 } }, (l) => sorties.push(JSON.parse(l)));
    assert.deepEqual(Object.keys(sorties[0]).sort(), ['dureeAuthMs', 'dureeMs', 'dureeOutilMs', 'demarrageMs', 'froid', 'lectures', 'message', 'outil', 'severity', 'statut'].sort());
  });
  test('5 bis un champ de mesure qui n\'est pas un nombre ou un booléen est écarté, jamais écrit', () => {
    const sorties = [];
    journaliser({ outil: 'x', lectures: 'texte-fuite', froid: 'oui', dureeOutilMs: NaN, dureeAuthMs: 3 }, (l) => sorties.push(JSON.parse(l)));
    assert.deepEqual(Object.keys(sorties[0]).sort(), ['dureeAuthMs', 'message', 'outil', 'severity']);
  });
  test('6 résumer : n, médiane, p90, lectures moyennes et part de froid justes ; vide sans erreur ; ligne sans outil ignorée', () => {
    const r = resumer([
      { outil: 'a', dureeMs: 100, dureeOutilMs: 40, lectures: 2, dureeAuthMs: 10, froid: true },
      { outil: 'a', dureeMs: 200, dureeOutilMs: 60, lectures: 4, dureeAuthMs: 20 },
      { jsonPayload: { outil: 'b', dureeMs: 50, dureeOutilMs: 5, lectures: 1, dureeAuthMs: 30 } },
      { methodeMcp: 'tools/list', dureeMs: 700, froid: true, demarrageMs: 900 },
    ]);
    const a = r.parOutil.find((o) => o.outil === 'a');
    assert.deepEqual([a.n, a.medianeMs, a.p90Ms, a.medianeOutilMs, a.lecturesMoyennes, a.partFroid], [2, 100, 200, 40, 3, 0.5]);
    assert.equal(r.parOutil.length, 2);
    assert.equal(r.medianeAuthMs, 20);
    assert.deepEqual(r.froid, { n: 2, medianeDemarrageMs: 900, medianeDureeMs: 100 }, 'le froid se compte sur toutes les lignes, même sans outil');
    assert.match(formater(r), /^outil\s+n\s+med total/);
    assert.deepEqual(resumer([]), { parOutil: [], medianeAuthMs: null, froid: { n: 0, medianeDemarrageMs: null, medianeDureeMs: null } });
    assert.doesNotThrow(() => formater(resumer([])));
  });
  test('7 les champs ajoutés à la liste blanche sont tous numériques ou booléens (jamais une chaîne)', () => {
    const anciens = ['client', 'jeton', 'acteur', 'profil', 'role', 'methodeMcp', 'outil', 'operationId', 'dureeMs', 'statut', 'code'];
    const nouveaux = CHAMPS.filter((c) => !anciens.includes(c));
    assert.deepEqual(nouveaux.sort(), Object.keys(CHAMPS_MESURE).sort());
    for (const t of Object.values(CHAMPS_MESURE)) assert.ok(['number', 'boolean'].includes(t));
  });
});
