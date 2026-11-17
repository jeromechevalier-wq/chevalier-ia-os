// Lien d'envoi temporaire (17/11/2026) : le gestionnaire HTTP `depotdocument` (page, envoi, usage unique, expiration), sur des données fictives en mémoire et un faux stockage.
// Le lien est créé comme le fait l'outil MCP (emettreLienDepot) ; l'outil lui-même est testé dans ecriture-outils.test.js (R2d).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { creerGestionnaireDepot, emettreLienDepot, DUREE_DEPOT_MS, TAILLE_DEPOT_MAX_OCTETS } from '../functions/src/coeur/depot-lien.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1');
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

const requireFonctions = createRequire(new URL('../functions/package.json', import.meta.url));

/** Serveur qui lit le corps COMME LE FAIT la plateforme (functions-framework 5 : json, text, urlencoded puis raw sur tous les types, `rawBody` posé par ces lecteurs ; limite 1024 Mo). */
function serveurAvecLecteursDeLaPlateforme(gestionnaire) {
  const express = requireFonctions('express');
  const bodyParser = requireFonctions('body-parser');
  const app = express();
  const verify = (req, res, buf) => { req.rawBody = buf; };
  const limit = '1024mb';
  app.use(bodyParser.json({ type: 'application/cloudevents+json', limit, verify }));
  app.use(bodyParser.json({ limit, verify }));
  app.use(bodyParser.text({ limit, verify }));
  app.use(bodyParser.urlencoded({ limit, verify, extended: true }));
  app.use(bodyParser.raw({ limit, verify, type: '*/*' }));
  app.use((req, res) => gestionnaire(req, res));
  return createServer(app);
}

async function demarrer({ refusStockage = null, lecteursPlateforme = false } = {}) {
  const collections = structuredClone(base);
  const donnees = creerAccesMemoire(collections);
  const objets = new Map();
  const stockage = { deposer: async (chemin, octets, type) => { if (refusStockage) throw refusStockage; objets.set(chemin, { octets, type }); }, supprimer: async (c) => { objets.delete(c); } };
  const horloge = { t: MAINTENANT.getTime() };
  const journal = [];
  const gestionnaire = creerGestionnaireDepot({ donnees: () => donnees, stockage, journal: (e) => journal.push(e), maintenant: () => horloge.t });
  const serveur = lecteursPlateforme ? serveurAvecLecteursDeLaPlateforme(gestionnaire) : createServer((req, res) => {
    const morceaux = [];
    req.on('data', (x) => morceaux.push(x));
    req.on('end', () => { req.rawBody = Buffer.concat(morceaux); gestionnaire(req, res); });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const racine = `http://127.0.0.1:${serveur.address().port}`;
  const lien = async (cibleType = 'affaire', cibleId = 'a1') => emettreLienDepot({ donnees, cibleType, cibleId, acteur: 'claude-ai-essai', maintenant: horloge.t });
  const envoyer = async (jeton, nom, octets, methode = 'PUT', entetes = {}) => {
    const r = await fetch(`${racine}/depot/${jeton}${nom === null ? '' : `?nom=${encodeURIComponent(nom)}`}`, { method: methode, body: octets, headers: entetes });
    return { statut: r.status, corps: await r.json().catch(() => null) };
  };
  return { collections, objets, horloge, journal, lien, envoyer, racine, page: (jeton) => fetch(`${racine}/depot/${jeton}`) };
}

describe('Lien d’envoi temporaire (depotdocument)', () => {
  test('1 un PDF envoyé au lien est rangé sur la bonne affaire (fiche, fichier, journal avec l’assistant) et le lien ne sert qu’une fois', async () => {
    const s = await demarrer();
    const jeton = await s.lien();
    const r = await s.envoyer(jeton, 'pièce.pdf', PDF);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(r.corps.ok, true);
    assert.equal(r.corps.affaireId, 'a1');
    const fiche = s.collections.documents_stockes.find((f) => f.id === r.corps.id);
    assert.equal(fiche.cibleId, 'a1');
    assert.equal(fiche.creePar, 'claude-ai-essai');
    assert.deepEqual([...s.objets.get(fiche.chemin).octets], [...PDF], 'octets identiques');
    assert.ok(s.collections.crm_audit.some((l) => l.outil === 'deposer_document' && l.docId === r.corps.id && l.acteur === 'claude-ai-essai'));
    const encore = await s.envoyer(jeton, 'autre.pdf', PDF);
    assert.equal(encore.statut, 404);
    assert.match(encore.corps.erreur, /n'est plus valable/);
    assert.equal(s.collections.documents_stockes.length, 1, 'un seul fichier');
  });

  test('2 fichier refusé (type, contenu qui ne correspond pas) : explication claire, rien n’est rangé, et le lien resserve pour un bon fichier', async () => {
    const s = await demarrer();
    const jeton = await s.lien();
    const exe = await s.envoyer(jeton, 'x.exe', Buffer.from('MZ'));
    assert.equal(exe.statut, 422);
    assert.equal(exe.corps.ok, false);
    const faux = await s.envoyer(jeton, 'x.pdf', Buffer.from('pas un pdf'));
    assert.equal(faux.statut, 422);
    assert.match(faux.corps.erreur, /ne correspond pas à son extension/);
    assert.equal((s.collections.documents_stockes ?? []).length, 0);
    const bon = await s.envoyer(jeton, 'x.pdf', PDF);
    assert.equal(bon.statut, 200, JSON.stringify(bon.corps));
  });

  test('3 le lien expire (10 minutes) ; un lien inconnu, mal formé ou une autre adresse ne disent rien', async () => {
    const s = await demarrer();
    const jeton = await s.lien();
    s.horloge.t += DUREE_DEPOT_MS + 1;
    const r = await s.envoyer(jeton, 'x.pdf', PDF);
    assert.equal(r.statut, 404);
    assert.equal((s.collections.documents_stockes ?? []).length, 0);
    assert.equal((await s.envoyer('A'.repeat(43), 'x.pdf', PDF)).statut, 404);
    assert.equal((await fetch(`${s.racine}/depot/court`, { method: 'PUT', body: PDF })).status, 404);
    assert.equal((await fetch(`${s.racine}/autre`)).status, 404);
  });

  test('4 deux envois en même temps avec le même lien : un seul passe', async () => {
    const s = await demarrer();
    const jeton = await s.lien();
    const [a, b] = await Promise.all([s.envoyer(jeton, 'a.pdf', PDF), s.envoyer(jeton, 'b.pdf', PDF)]);
    assert.deepEqual([a.statut, b.statut].sort(), [200, 404]);
    assert.equal(s.collections.documents_stockes.length, 1);
  });

  test('5 demandes mal faites : sans nom, vide, trop gros, mauvaise méthode ; le lien n’est pas consommé', async () => {
    const s = await demarrer();
    const jeton = await s.lien();
    assert.equal((await s.envoyer(jeton, null, PDF)).statut, 400);
    assert.equal((await s.envoyer(jeton, 'x.pdf', Buffer.alloc(0))).statut, 400);
    const gros = await s.envoyer(jeton, 'x.pdf', Buffer.alloc(TAILLE_DEPOT_MAX_OCTETS + 1, 65));
    assert.equal(gros.statut, 413);
    assert.match(gros.corps.erreur, /trop gros/);
    assert.equal((await s.envoyer(jeton, 'x.pdf', undefined, 'DELETE')).statut, 405);
    assert.equal((await s.envoyer(jeton, 'x.pdf', PDF)).statut, 200, 'le lien servait encore');
  });

  test('6 fiche disparue ou stockage en panne : message clair, le lien est remis, aucun fichier orphelin', async () => {
    const s = await demarrer();
    const inconnue = await s.lien('affaire', 'disparue');
    const r = await s.envoyer(inconnue, 'x.pdf', PDF);
    assert.equal(r.statut, 404);
    assert.match(r.corps.erreur, /introuvable/i);
    const panne = await demarrer({ refusStockage: Object.assign(new Error('x'), { code: 403 }) });
    const jeton = await panne.lien();
    const p = await panne.envoyer(jeton, 'x.pdf', PDF);
    assert.equal(p.statut, 503);
    assert.match(p.corps.erreur, /pas le droit/);
    assert.equal((panne.collections.documents_stockes ?? []).length, 0);
    assert.ok(panne.collections.mcp_codes.some((d) => d.genre === 'depot'), 'le lien est remis');
  });

  test('7 la page : s’affiche pour un lien valable sans le consommer, dit « plus valable » sinon, ne dit jamais « CRM », n’écrit pas le lien dans ses journaux', async () => {
    const s = await demarrer();
    const jeton = await s.lien();
    const p = await s.page(jeton);
    assert.equal(p.status, 200);
    assert.match(p.headers.get('content-type'), /text\/html/);
    assert.equal(p.headers.get('cache-control'), 'no-store');
    const html = await p.text();
    assert.match(html, /type="file"/);
    assert.match(html, /Envoyer/);
    assert.ok(!/crm/i.test(html), 'le mot « CRM » n’est pas écrit à l’utilisateur');
    assert.equal((await s.page(jeton)).status, 200, 'afficher la page ne consomme pas le lien');
    await s.envoyer(jeton, 'x.pdf', PDF);
    const apres = await s.page(jeton);
    assert.equal(apres.status, 404);
    assert.match(await apres.text(), /n'est plus valable/);
    assert.ok(!JSON.stringify(s.journal).includes(jeton));
    assert.ok(s.journal.some((e) => e.action === 'depot_lien' && e.statut === 'ok'));
  });

  test('8 avec les VRAIS lecteurs de corps de la plateforme : un PDF de 2 Mo plein d’octets « & » passe avec l’en-tête de la commande rendue et celui de la page ; type PDF, image ou inconnu aussi', async () => {
    const s = await demarrer({ lecteursPlateforme: true });
    const gros = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * 1024 * 1024, 0x26)]); // 0x26 = « & » : lu comme un formulaire, il dépasserait 1000 paramètres
    for (const entetes of [{ 'Content-Type': 'application/octet-stream' }, { 'Content-Type': 'application/pdf' }]) {
      const r = await s.envoyer(await s.lien(), 'gros.pdf', gros, 'PUT', entetes);
      assert.equal(r.statut, 200, JSON.stringify(r.corps));
      assert.equal(r.corps.taille, gros.length);
    }
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
    assert.equal((await s.envoyer(await s.lien(), 'photo.jpg', jpeg, 'PUT', { 'Content-Type': 'image/jpeg' })).statut, 200);
    assert.equal((await s.envoyer(await s.lien(), 'notes.md', Buffer.from('# Titre\n'), 'PUT', { 'Content-Type': 'application/octet-stream' })).statut, 200);
    const sansEntete = await s.envoyer(await s.lien(), 'gros.pdf', gros); // curl sans -H : formulaire, refusé par la plateforme avant notre code : c'est pourquoi la commande rendue porte l'en-tête
    assert.notEqual(sansEntete.statut, 200);
  });

  test('9 les liens périmés jamais utilisés sont effacés à la création du lien suivant, et le journal d’audit garde le jeton du demandeur', async () => {
    const s = await demarrer();
    await s.lien(); await s.lien();
    assert.equal(s.collections.mcp_codes.filter((d) => d.genre === 'depot').length, 2);
    s.horloge.t += DUREE_DEPOT_MS + 1;
    const jeton = await s.lien();
    assert.equal(s.collections.mcp_codes.filter((d) => d.genre === 'depot').length, 1, 'les deux liens périmés sont partis');
    assert.equal((await s.envoyer(jeton, 'x.pdf', PDF)).statut, 200);
  });
});
