// Tests P (module Devis, briques serveur du PDF) : Gotenberg et rangement Drive, contre de faux serveurs locaux. node --test.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { convertirHtmlEnPdf } from '../functions/src/devis/gotenberg.js';
import { rangerPdfDevis, creerClientDrive, nomFichierDevis, nettoyerNom, echapperRequete } from '../functions/src/devis/drive.js';

const FAUX_PDF = Buffer.from('%PDF-1.4\nfaux document\n%%EOF');
const HTML_SECRET = '<html><body>CONTENU-CONFIDENTIEL-XYZ</body></html>';

/** Petit serveur local : `gerer(req, corps)` répond. Rend { url, fermer, requetes }. */
async function serveur(gerer) {
  const requetes = [];
  const s = http.createServer((req, res) => {
    const morceaux = [];
    req.on('data', (c) => morceaux.push(c));
    req.on('end', () => {
      const corps = Buffer.concat(morceaux);
      const r = { methode: req.method, url: req.url, entetes: req.headers, corps };
      requetes.push(r);
      gerer(r, res);
    });
  });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${s.address().port}`, requetes, fermer: () => { s.closeAllConnections?.(); return new Promise((ok) => s.close(ok)); } };
}

describe('P1 Gotenberg : le multipart attendu part avec le jeton, le PDF revient avec son sha256', () => {
  test('P1 champs, fichiers et Authorization', async () => {
    const s = await serveur((r, res) => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(FAUX_PDF); });
    try {
      let audience = null;
      const out = await convertirHtmlEnPdf(HTML_SECRET, { urlService: `${s.url}/`, obtenirJeton: async (a) => { audience = a; return 'JETON-ESSAI'; } });
      const r = s.requetes[0];
      assert.equal(r.methode, 'POST');
      assert.equal(r.url, '/forms/chromium/convert/html');
      assert.equal(r.entetes.authorization, 'Bearer JETON-ESSAI');
      assert.equal(audience, s.url);
      assert.match(r.entetes['content-type'], /^multipart\/form-data/);
      const txt = r.corps.toString('utf8');
      assert.match(txt, /filename="index\.html"/);
      assert.match(txt, /filename="header\.html"/);
      assert.match(txt, /filename="footer\.html"/);
      assert.ok(txt.includes('CONTENU-CONFIDENTIEL-XYZ'));
      for (const [k, v] of [['paperWidth', '8.27'], ['paperHeight', '11.7'], ['preferCssPageSize', 'false'], ['printBackground', 'true']]) {
        assert.match(txt, new RegExp(`name="${k}"\\r\\n\\r\\n${v}\\r\\n`), k);
      }
      assert.ok(/name="marginTop"/.test(txt) && /name="marginBottom"/.test(txt));
      assert.ok(txt.includes('class="pageNumber"') && txt.includes('class="totalPages"'));
      assert.deepEqual(out.pdf, FAUX_PDF);
      assert.equal(out.sha256, createHash('sha256').update(FAUX_PDF).digest('hex'));
    } finally { await s.fermer(); }
  });
});

describe('P2 Gotenberg : erreurs lisibles, sans HTML ni jeton', () => {
  const verifier = (e) => {
    assert.ok(!e.message.includes('CONTENU-CONFIDENTIEL'), 'HTML dans le message');
    assert.ok(!e.message.includes('JETON-ESSAI'), 'jeton dans le message');
    return true;
  };
  const appeler = (url, extra = {}) => convertirHtmlEnPdf(HTML_SECRET, { urlService: url, obtenirJeton: async () => 'JETON-ESSAI', ...extra });

  test('P2 statut 500', async () => {
    const s = await serveur((r, res) => { res.writeHead(500); res.end('JETON-ESSAI CONTENU-CONFIDENTIEL-XYZ'); });
    try { await assert.rejects(appeler(s.url), (e) => verifier(e) && /500/.test(e.message)); } finally { await s.fermer(); }
  });
  test('P2 corps qui n\'est pas un PDF', async () => {
    const s = await serveur((r, res) => { res.writeHead(200); res.end('<html>pas un pdf</html>'); });
    try { await assert.rejects(appeler(s.url), (e) => verifier(e) && /pas un PDF/.test(e.message)); } finally { await s.fermer(); }
  });
  test('P2 corps vide', async () => {
    const s = await serveur((r, res) => { res.writeHead(200); res.end(); });
    try { await assert.rejects(appeler(s.url), (e) => verifier(e) && /vide/.test(e.message)); } finally { await s.fermer(); }
  });
  test('P2 délai dépassé', async () => {
    const s = await serveur(() => { /* ne répond jamais */ });
    try { await assert.rejects(appeler(s.url, { delaiMs: 150 }), (e) => verifier(e) && /délai/.test(e.message)); } finally { await s.fermer(); }
  });
  test('P2 jeton impossible à obtenir', async () => {
    await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { urlService: 'http://127.0.0.1:1', obtenirJeton: async () => { throw new Error('JETON-ESSAI boum'); } }), verifier);
  });
});

/** Faux client Drive en mémoire. */
function fauxDrive(init = []) {
  const items = init.map((x, i) => ({ id: `init${i}`, ...x }));
  let n = 0;
  return {
    items,
    async chercherDossier(nom, parentId) { return items.find((x) => x.dossier && x.nom === nom && x.parent === parentId) || null; },
    async creerDossier(nom, parentId) { const it = { id: `d${++n}`, nom, parent: parentId, dossier: true }; items.push(it); return it; },
    async fichierExiste(nom, parentId) { return items.some((x) => !x.dossier && x.nom === nom && x.parent === parentId); },
    async envoyerFichier({ nom, parentId, contenu, mimeType }) { const it = { id: `f${++n}`, nom, parent: parentId, contenu, mimeType }; items.push(it); return { id: it.id }; },
  };
}

describe('P3 Drive : dossiers et fichiers', () => {
  test('P3 dossier Devis créé s\'il manque, sous le dossier de l\'affaire', async () => {
    const d = fauxDrive();
    const r = await rangerPdfDevis({ drive: d, dossierParentId: 'AFF', nomAffaire: 'X', nomFichier: 'a.pdf', pdf: FAUX_PDF });
    assert.equal(r.dossierAffaireId, 'AFF');
    const dossier = d.items.find((x) => x.dossier);
    assert.equal(dossier.nom, 'Devis'); assert.equal(dossier.parent, 'AFF');
    assert.equal(r.dossierDevisId, dossier.id);
    assert.equal(d.items.find((x) => x.id === r.fileId).parent, dossier.id);
    assert.equal(d.items.find((x) => x.id === r.fileId).mimeType, 'application/pdf');
    assert.match(r.lien, /drive\.google\.com/);
  });
  test('P3 dossier Devis réutilisé s\'il existe', async () => {
    const d = fauxDrive([{ nom: 'Devis', parent: 'AFF', dossier: true }]);
    const r = await rangerPdfDevis({ drive: d, dossierParentId: 'AFF', nomAffaire: 'X', nomFichier: 'a.pdf', pdf: FAUX_PDF });
    assert.equal(d.items.filter((x) => x.dossier).length, 1);
    assert.equal(r.dossierDevisId, 'init0');
  });
  test('P3 sans dossier de travail : dossier nommé comme l\'affaire sous la racine, puis réutilisé', async () => {
    const d = fauxDrive();
    const r1 = await rangerPdfDevis({ drive: d, dossierParentId: '', dossierRacineId: 'RACINE', nomAffaire: 'Toiture / Dupont', nomFichier: 'a.pdf', pdf: FAUX_PDF });
    const aff = d.items.find((x) => x.id === r1.dossierAffaireId);
    assert.equal(aff.nom, 'Toiture Dupont'); assert.equal(aff.parent, 'RACINE');
    const r2 = await rangerPdfDevis({ drive: d, dossierParentId: '', dossierRacineId: 'RACINE', nomAffaire: 'Toiture / Dupont', nomFichier: 'b.pdf', pdf: FAUX_PDF });
    assert.equal(r2.dossierAffaireId, r1.dossierAffaireId);
  });
  test('P3 sans dossier de travail ni racine : erreur claire', async () => {
    await assert.rejects(rangerPdfDevis({ drive: fauxDrive(), dossierParentId: '', nomAffaire: 'X', nomFichier: 'a.pdf', pdf: FAUX_PDF }), /racine/);
  });
  test('P3 un fichier existant n\'est jamais écrasé : suffixe (2), (3)', async () => {
    const d = fauxDrive();
    const base = { drive: d, dossierParentId: 'AFF', nomAffaire: 'X', nomFichier: 'DEV v1.pdf', pdf: FAUX_PDF };
    await rangerPdfDevis(base); await rangerPdfDevis(base); await rangerPdfDevis(base);
    const noms = d.items.filter((x) => !x.dossier).map((x) => x.nom);
    assert.deepEqual(noms, ['DEV v1.pdf', 'DEV v1 (2).pdf', 'DEV v1 (3).pdf']);
  });
});

describe('P4 Drive : requêtes et noms', () => {
  test('P4 apostrophes échappées', () => {
    assert.equal(echapperRequete("L'atelier d'Éric"), "L\\'atelier d\\'Éric");
    assert.equal(echapperRequete('a\\b'), 'a\\\\b');
  });
  test('P4 noms nettoyés : pas de /, 120 caractères au plus', () => {
    assert.equal(nettoyerNom('a/b\\c\nd'), 'a b c d');
    assert.ok(nettoyerNom('x'.repeat(300)).length <= 120);
  });
});

describe('P5 Drive : vrai client REST contre un faux serveur local', () => {
  test('P5 chemins, supportsAllDrives, requête échappée, envoi multipart', async () => {
    const s = await serveur((r, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (r.methode === 'GET') res.end(JSON.stringify({ files: [{ id: 'trouve', name: 'Devis' }] }));
      else if (r.url.startsWith('/upload')) res.end(JSON.stringify({ id: 'F1', webViewLink: 'https://exemple.test/F1' }));
      else res.end(JSON.stringify({ id: 'D9' }));
    });
    try {
      const c = creerClientDrive({ auth: { obtenirJeton: async () => 'ACCES-ESSAI' }, urlApi: `${s.url}/drive/v3`, urlEnvoi: `${s.url}/upload/drive/v3` });
      const dossier = await c.chercherDossier("L'atelier", 'PAR');
      assert.equal(dossier.id, 'trouve');
      const get = s.requetes[0];
      assert.equal(get.entetes.authorization, 'Bearer ACCES-ESSAI');
      const u = new URL(get.url, 'http://x');
      assert.equal(u.pathname, '/drive/v3/files');
      assert.equal(u.searchParams.get('supportsAllDrives'), 'true');
      assert.equal(u.searchParams.get('includeItemsFromAllDrives'), 'true');
      assert.equal(u.searchParams.get('q'), "name='L\\'atelier' and 'PAR' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false");

      assert.equal((await c.creerDossier('Devis', 'PAR')).id, 'D9');
      const post = s.requetes[1];
      assert.equal(post.methode, 'POST');
      assert.match(post.url, /supportsAllDrives=true/);
      assert.deepEqual(JSON.parse(post.corps.toString()), { name: 'Devis', parents: ['PAR'], mimeType: 'application/vnd.google-apps.folder' });

      const f = await c.envoyerFichier({ nom: 'a.pdf', parentId: 'PAR', contenu: FAUX_PDF, mimeType: 'application/pdf' });
      assert.equal(f.webViewLink, 'https://exemple.test/F1');
      const up = s.requetes[2];
      assert.match(up.url, /^\/upload\/drive\/v3\/files\?/);
      assert.match(up.url, /uploadType=multipart/); assert.match(up.url, /supportsAllDrives=true/);
      assert.match(up.entetes['content-type'], /^multipart\/form-data/);
      const txt = up.corps.toString('latin1');
      assert.ok(txt.includes('"name":"a.pdf"') && txt.includes('"parents":["PAR"]'));
      assert.ok(txt.includes('%PDF-1.4'));
    } finally { await s.fermer(); }
  });
  test('P5 erreur HTTP : message sans jeton', async () => {
    const s = await serveur((r, res) => { res.writeHead(403); res.end('ACCES-ESSAI'); });
    try {
      const c = creerClientDrive({ auth: { obtenirJeton: async () => 'ACCES-ESSAI' }, urlApi: s.url });
      await assert.rejects(c.chercherDossier('x', 'p'), (e) => /403/.test(e.message) && !e.message.includes('ACCES-ESSAI'));
    } finally { await s.fermer(); }
  });
});

describe('P6 nomFichierDevis', () => {
  test('P6 forme DEV-… vN - Objet.pdf', () => {
    assert.equal(nomFichierDevis({ numero: 'DEV-2026-10-24-001', version: 2, objet: 'Rénovation toiture' }), 'DEV-2026-10-24-001 v2 - Rénovation toiture.pdf');
  });
  test('P6 objet nettoyé et tronqué, sans objet', () => {
    const n = nomFichierDevis({ numero: 'DEV-1', version: 1, objet: 'a/b\\c ' + 'z'.repeat(200) });
    assert.ok(!/[\/\\]/.test(n.replace(/\.pdf$/, '')));
    assert.ok(n.length <= 124 && n.endsWith('.pdf'));
    assert.equal(nomFichierDevis({ numero: 'DEV-1', version: 3 }), 'DEV-1 v3.pdf');
  });
});
