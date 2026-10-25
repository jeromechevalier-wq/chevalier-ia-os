// Tests C (module Devis, conversion HTML -> PDF par Chromium dans la fonction) avec un FAUX puppeteer : aucun navigateur réel n'est lancé. node --test.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convertirHtmlEnPdf, piedParDefaut, optionsPdf } from '../functions/src/devis/chromium.js';

const FAUX_PDF = Buffer.from('%PDF-1.4\nfaux document\n%%EOF');
const HTML_SECRET = '<html><body>CONTENU-CONFIDENTIEL-XYZ</body></html>';

/** Faux puppeteer : note tout ce qu'on lui demande. `defaut` règle les pannes. */
function faux({ pdf = FAUX_PDF, echecLancement, echecContenu, echecPdf, lenteurPdfMs = 0, requetes = [] } = {}) {
  const v = { lancements: 0, fermetures: 0, js: null, interception: null, contenu: null, optionsContenu: null, optionsPdf: null, decisions: [], argsLancement: null };
  let ecouteur;
  const page = {
    async setJavaScriptEnabled(x) { v.js = x; },
    async setRequestInterception(x) { v.interception = x; },
    on(nom, f) { if (nom === 'request') ecouteur = f; },
    async setContent(html, opts) {
      v.contenu = html; v.optionsContenu = opts;
      if (echecContenu) throw new Error(`boum ${html} /var/task/interne`);
      for (const url of requetes) v.decisions.push(await new Promise((ok) => ecouteur({ url: () => url, continue: () => ok(`continue ${url}`), abort: () => ok(`abort ${url}`) })));
    },
    async pdf(opts) {
      v.optionsPdf = opts;
      if (lenteurPdfMs) await new Promise((ok) => setTimeout(ok, lenteurPdfMs));
      if (echecPdf) throw new Error(`boum ${HTML_SECRET} /var/task/interne`);
      return pdf;
    },
  };
  const navigateur = { async newPage() { return page; }, async close() { v.fermetures += 1; } };
  const puppeteer = {
    async launch(a) {
      v.lancements += 1; v.argsLancement = a;
      if (echecLancement) throw new Error('/var/task/node_modules/@sparticuz/chromium/bin introuvable');
      return navigateur;
    },
  };
  const chromium = { args: ['--no-sandbox'], async executablePath() { return '/tmp/chromium'; } };
  return { v, puppeteer, chromium };
}

describe('C1 Chromium : réglages de sécurité et d\'impression', () => {
  test('C1 JavaScript désactivé, requêtes interceptées, seul data: passe, A4 avec fonds imprimés', async () => {
    const f = faux({ requetes: ['data:image/png;base64,AAAA', 'https://exemple.test/logo.png', 'http://169.254.169.254/', 'file:///etc/passwd'] });
    const sortie = await convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium });
    assert.equal(f.v.js, false);
    assert.equal(f.v.interception, true);
    assert.deepEqual(f.v.decisions, [
      'continue data:image/png;base64,AAAA', 'abort https://exemple.test/logo.png', 'abort http://169.254.169.254/', 'abort file:///etc/passwd',
    ]);
    assert.equal(f.v.optionsContenu.waitUntil, 'load');
    assert.ok(f.v.optionsContenu.timeout > 0 && f.v.optionsContenu.timeout <= 30000);
    assert.equal(f.v.optionsPdf.format, 'A4');
    assert.equal(f.v.optionsPdf.printBackground, true);
    assert.equal(f.v.contenu, HTML_SECRET);
    assert.equal(f.v.argsLancement.headless, 'shell');
    assert.deepEqual(f.v.argsLancement.args, ['--no-sandbox']);
    assert.ok(Buffer.isBuffer(sortie.pdf) && /^[0-9a-f]{64}$/.test(sortie.sha256));
    assert.equal(sortie.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  });
  test('C1 le pied « Page n / N » est présent et celui donné par l\'appelant est repris tel quel', async () => {
    const f = faux();
    await convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium, pied: piedParDefaut('DEV-2026-0007') });
    const o = f.v.optionsPdf;
    assert.equal(o.displayHeaderFooter, true);
    assert.match(o.footerTemplate, /Page <span class="pageNumber"><\/span> \/ <span class="totalPages"><\/span>/);
    assert.match(o.footerTemplate, /DEV-2026-0007/);
    assert.match(optionsPdf().footerTemplate, /class="totalPages"/);
    assert.ok(!piedParDefaut('<b>"x"&').includes('<b>'), 'le numéro est assaini');
  });
});

describe('C2 Chromium : le navigateur est toujours fermé, un par appel', () => {
  test('C2 fermé après un succès, un navigateur par appel', async () => {
    const f = faux();
    await convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium });
    await convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium });
    assert.equal(f.v.lancements, 2);
    assert.equal(f.v.fermetures, 2);
  });
  test('C2 fermé aussi quand le chargement ou l\'impression échoue', async () => {
    for (const panne of [{ echecContenu: true }, { echecPdf: true }]) {
      const f = faux(panne);
      await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium }));
      assert.equal(f.v.fermetures, 1);
    }
  });
  test('C2 fermé même si le délai gagne', async () => {
    const f = faux({ lenteurPdfMs: 400 });
    await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium, delaiMs: 100 }), /délai/);
    assert.equal(f.v.fermetures, 1);
  });
});

describe('C3 Chromium : erreurs lisibles, sans HTML ni chemin interne', () => {
  const verifier = (e) => {
    assert.match(e.message, /^PDF : /);
    for (const interdit of ['CONTENU-CONFIDENTIEL', '/var/task', 'node_modules', 'boum', '<html']) assert.ok(!e.message.includes(interdit), `« ${interdit} » dans le message`);
    return true;
  };
  test('C3 lancement impossible, chargement en échec, impression en échec', async () => {
    for (const panne of [{ echecLancement: true }, { echecContenu: true }, { echecPdf: true }]) {
      const f = faux(panne);
      await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium }), verifier);
    }
  });
  test('C3 rendu vide, rendu qui n\'est pas un PDF, HTML vide', async () => {
    let f = faux({ pdf: Buffer.alloc(0) });
    await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium }), (e) => verifier(e) && /vide/.test(e.message));
    f = faux({ pdf: Buffer.from('<html>pas un pdf</html>') });
    await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium }), (e) => verifier(e) && /pas rendu un PDF/.test(e.message));
    f = faux();
    await assert.rejects(convertirHtmlEnPdf('', { puppeteer: f.puppeteer, chromium: f.chromium }), (e) => verifier(e) && f.v.lancements === 0);
  });
  test('C3 délai dépassé', async () => {
    const f = faux({ lenteurPdfMs: 400 });
    await assert.rejects(convertirHtmlEnPdf(HTML_SECRET, { puppeteer: f.puppeteer, chromium: f.chromium, delaiMs: 100 }), (e) => verifier(e) && /délai/.test(e.message));
  });
});
