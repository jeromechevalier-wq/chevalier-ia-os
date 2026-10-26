// Outil d'essai TEMPORAIRE diagnostiquer_fichiers : il ne rapporte que la FORME de ce que l'assistant envoie (jamais d'adresse complète, jamais de contenu).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { diagnostiquer_fichiers } from '../functions/src/mcp/outils/lecture.js';
import { resumerForme, phraseDe, ligneDeDiagnostic } from '../functions/src/mcp/diagnostic-fichiers.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections, MAINTENANT } from './_donnees-essai.js';

const URL_SECRETE = 'https://files.exemple-assistant.test/chemin/secret-xyz/photo.jpg?token=JETON-TRES-SECRET&sig=abc123';
const sortieComplete = (forme) => JSON.stringify(forme) + phraseDe(forme) + JSON.stringify(ligneDeDiagnostic({ forme, acteur: 'x' }, () => {}));

describe('diagnostiquer_fichiers : forme reçue', () => {
  test('tableau d\'objets avec download_url : seul le nom d\'hôte sort, avec mime_type et nom court', () => {
    const forme = resumerForme([
      { download_url: URL_SECRETE, file_id: 'file_1', mime_type: 'image/jpeg', file_name: 'photo.jpg' },
      { download_url: URL_SECRETE, mime_type: 'image/jpeg' },
      { download_url: URL_SECRETE, mime_type: 'application/pdf', file_name: 'devis.pdf' },
    ]);
    assert.equal(forme.nombre, 3);
    assert.equal(forme.elements[0].hote, 'files.exemple-assistant.test');
    assert.deepEqual(forme.elements[0].cles, ['download_url', 'file_id', 'mime_type', 'file_name']);
    const phrase = phraseDe(forme);
    assert.match(phrase, /3 liens de téléchargement \(hôte files\.exemple-assistant\.test\)/);
    assert.match(phrase, /image\/jpeg/);
    assert.match(phrase, /Rien n'a été enregistré/);
  });

  test('chaîne « chat_upload » : la phrase dit que le fichier n\'a pas été transmis', () => {
    const forme = resumerForme(['chat_upload']);
    assert.equal(forme.elements[0].mot, 'chat_upload');
    assert.match(phraseDe(forme), /le mot « chat_upload » au lieu d'un lien : l'assistant n'a pas transmis le fichier/);
  });

  test('cas vide : champ absent, tableau vide ou null donnent « aucun fichier »', () => {
    for (const v of [undefined, []]) assert.match(phraseDe(resumerForme(v)), /aucun fichier/, String(v));
    const nul = resumerForme(null);
    assert.equal(nul.nombre, 1);
    assert.deepEqual(nul.elements[0], { type: 'null' });
  });

  test('valeurs étranges : nombre, booléen, tableau imbriqué, objet vide, sans erreur', () => {
    const forme = resumerForme([42, true, [1, 2], {}, null]);
    assert.deepEqual(forme.elements.map((e) => e.type), ['number', 'boolean', 'array', 'object', 'null']);
    assert.match(phraseDe(forme), /valeur(s)? inattendue/);
  });

  test('très gros texte base64 : seule sa longueur sort', () => {
    const gros = 'QUJD'.repeat(500000); // 2 millions de caractères
    const forme = resumerForme([gros, `data:image/png;base64,${gros}`]);
    assert.equal(forme.elements[0].longueur, gros.length);
    assert.equal(forme.elements[0].genre, 'texte_long');
    assert.equal(forme.elements[1].genre, 'data_uri');
    assert.ok(sortieComplete(forme).length < 3000);
    assert.ok(!sortieComplete(forme).includes('QUJDQUJD'));
  });

  test('un seul objet (pas un tableau) est accepté ; au-delà de 20 éléments, on compte sans tout détailler', () => {
    assert.equal(resumerForme({ download_url: URL_SECRETE }).enveloppe, 'object');
    const beaucoup = resumerForme(Array.from({ length: 50 }, () => 'a'));
    assert.equal(beaucoup.nombre, 50);
    assert.equal(beaucoup.elements.length, 20);
  });

  test('file_name : au plus 80 caractères, jamais s\'il contient « :// »', () => {
    const f = resumerForme([{ file_name: 'x'.repeat(81) }, { file_name: 'https://a.test/b?t=SECRET' }, { file_name: 'court.pdf' }]);
    assert.equal(f.elements[0].file_name, undefined);
    assert.equal(f.elements[1].file_name, undefined);
    assert.equal(f.elements[2].file_name, 'court.pdf');
    assert.ok(!sortieComplete(f).includes('SECRET'));
  });
});

describe('diagnostiquer_fichiers : jamais l\'adresse complète ni le jeton', () => {
  test('ni la réponse ni la ligne de journal ne contiennent l\'URL, son chemin ni son jeton', () => {
    const formes = [
      resumerForme([{ download_url: URL_SECRETE }]),
      resumerForme([URL_SECRETE]),
      resumerForme([{ download_url: URL_SECRETE, file_name: URL_SECRETE, autre: { url: URL_SECRETE } }]),
      resumerForme({ url: `https://user:motdepasse@hote.test:8443/p?token=JETON-TRES-SECRET` }),
    ];
    for (const f of formes) {
      const tout = sortieComplete(f);
      for (const interdit of ['JETON-TRES-SECRET', 'secret-xyz', 'photo.jpg', 'abc123', 'motdepasse', '?token', '8443']) assert.ok(!tout.includes(interdit), `${interdit} dans ${tout}`);
    }
    assert.ok(sortieComplete(formes[1]).includes('files.exemple-assistant.test'));
  });

  test('l\'outil écrit une seule ligne de journal (liste blanche), sans la note, et rend un message plus la forme', async () => {
    const lignes = [];
    const ecrire = process.stdout.write.bind(process.stdout);
    process.stdout.write = (l) => { lignes.push(String(l)); return true; };
    let r;
    try { r = await diagnostiquer_fichiers.executer({ args: { fichiers: [{ download_url: URL_SECRETE }], note: 'phrase privée du client' }, acteur: 'claude-code-jerome' }); } finally { process.stdout.write = ecrire; }
    assert.equal(lignes.length, 1);
    const ligne = JSON.parse(lignes[0]);
    assert.equal(ligne.message, 'mcp_diagnostic');
    assert.equal(ligne.noteLongueur, 'phrase privée du client'.length);
    assert.ok(!lignes[0].includes('privée') && !lignes[0].includes('secret-xyz'));
    assert.equal(typeof r.message, 'string');
    assert.ok(!JSON.stringify(r).includes('secret-xyz'));
  });

  test('l\'outil est en lecture seule, ouvert aux trois profils, et déclare le champ « fichiers » à ChatGPT', () => {
    assert.deepEqual(diagnostiquer_fichiers.profils, ['lecteur', 'bibliothecaire', 'claude-code']);
    assert.deepEqual(diagnostiquer_fichiers.meta, { 'openai/fileParams': ['fichiers'] });
    assert.ok(OUTILS.includes(diagnostiquer_fichiers));
  });
});

describe('diagnostiquer_fichiers : par le vrai serveur MCP', () => {
  test('appel complet : le schéma accepte tout, _meta est annoncé, la réponse ne contient pas l\'adresse', async () => {
    const jeton = `cia_${'D'.repeat(43)}`;
    const secret = JSON.stringify([{ jeton: 'lecteur-essai', acteur: 'lecteur-essai', profil: 'lecteur', empreinte: empreinte(jeton), actif: true }]);
    const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
    const gestionnaire = creerGestionnaire({ magasin, donnees: creerAccesMemoire(collections), outils: OUTILS, maintenant: () => MAINTENANT.getTime(), journal: () => {} });
    const serveur = createServer((req, res) => {
      const m = [];
      req.on('data', (x) => m.push(x));
      req.on('end', () => { try { req.body = JSON.parse(Buffer.concat(m).toString('utf8')); } catch { req.body = undefined; } gestionnaire(req, res); });
    });
    await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
    const c = new Client({ name: 'essai', version: '1.0.0' });
    try {
      await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${serveur.address().port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${jeton}` } } }));
      const outil = (await c.listTools()).tools.find((t) => t.name === 'diagnostiquer_fichiers');
      assert.deepEqual(outil._meta, { 'openai/fileParams': ['fichiers'] });
      assert.equal(outil.annotations.readOnlyHint, true);
      const sortie = ecrireSilencieux();
      for (const fichiers of [[{ download_url: URL_SECRETE, mime_type: 'image/png' }], ['chat_upload'], undefined, 12, 'texte', [null, {}]]) {
        const r = await c.callTool({ name: 'diagnostiquer_fichiers', arguments: fichiers === undefined ? {} : { fichiers } });
        assert.ok(!r.isError, JSON.stringify(fichiers));
        assert.ok(!JSON.stringify(r).includes('secret-xyz'));
        assert.equal(typeof r.structuredContent.message, 'string');
      }
      sortie.fin();
    } finally { await c.close(); serveur.close(); }
  });
});

function ecrireSilencieux() {
  const ecrire = process.stdout.write.bind(process.stdout);
  process.stdout.write = (l, ...r) => (String(l).includes('"mcp_diagnostic"') ? true : ecrire(l, ...r));
  return { fin: () => { process.stdout.write = ecrire; } };
}
