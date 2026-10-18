// Le wiki local (wiki/) : généré depuis docs/*.md, sans JavaScript ni ressource externe, jamais publié.
// Sans réseau, sans émulateur : tout se passe dans des dossiers temporaires ; le dépôt n'est jamais modifié.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync, mkdirSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construire as construireWiki, verifier, generer, markdownVersHtml } from '../scripts/wiki/construire.js';
import { RACINE, ELEMENTS_PUBLIES, construire as construirePaquet, listerFichiers } from '../scripts/hebergement.js';

const DOCS = join(RACINE, 'docs');
const WIKI = join(RACINE, 'wiki');
const SOMMAIRE = join(RACINE, 'scripts', 'wiki', 'sommaire.json');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const mdDeDocs = () => readdirSync(DOCS, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name.slice(0, -3));

let temp;
before(() => { temp = mkdtempSync(join(tmpdir(), 'wiki-')); });
after(() => { rmSync(temp, { recursive: true, force: true }); });

describe('Wiki local', () => {
  test('W1 construire produit wiki/index.html, style.css et une page par docs/*.md (dans un dossier temporaire)', () => {
    const sortie = join(temp, 'w1');
    const r = construireWiki({ docs: DOCS, sortie, sommaire: SOMMAIRE });
    const noms = mdDeDocs();
    assert.ok(noms.length > 50);
    assert.ok(existsSync(join(sortie, 'index.html')));
    assert.ok(existsSync(join(sortie, 'style.css')));
    for (const n of noms) assert.ok(existsSync(join(sortie, `${n}.html`)), `${n}.html manque`);
    assert.equal(r.pages, noms.length + 1);
    assert.deepEqual(readdirSync(sortie).filter((f) => f.endsWith('.html')).length, noms.length + 1);
    assert.ok(existsSync(join(sortie, 'wiki.html')), 'docs/wiki.md est converti lui aussi');
  });

  test('W2 le premier lien après <main de index.html mène à portes-et-droits-mcp.html', () => {
    const h = generer({ docs: DOCS, sommaire: SOMMAIRE }).get('index.html');
    const apres = h.slice(h.indexOf('<main'));
    assert.equal(apres.match(/<a href="([^"]*)"/)[1], 'portes-et-droits-mcp.html');
  });

  test('W3 dans portes-et-droits-mcp.html, les deux tableaux ont un <tbody> de 2 et de 7 lignes', () => {
    const h = generer({ docs: DOCS, sommaire: SOMMAIRE }).get('portes-et-droits-mcp.html');
    const corps = [...h.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => (m[1].match(/<tr>/g) || []).length);
    assert.deepEqual(corps, [2, 7]);
    assert.equal((h.match(/<thead>/g) || []).length, 2);
    assert.equal((h.match(/<div class="tableau">/g) || []).length, 2);
    assert.match(h, /mcp\/&lt;client&gt;/, 'le HTML du texte est échappé (/mcp/<client> reste visible)');
  });

  test('W4 aucun script, aucune ressource externe ni iframe dans wiki/ ; style.css sans url() ni @import', () => {
    const fichiers = readdirSync(WIKI);
    assert.ok(fichiers.includes('style.css'));
    for (const f of fichiers.filter((x) => x.endsWith('.html'))) {
      const h = readFileSync(join(WIKI, f), 'utf8');
      assert.ok(!/<script/i.test(h), `${f} : <script`);
      assert.ok(!/\ssrc=/i.test(h), `${f} : src=`);
      assert.ok(!/<iframe/i.test(h), `${f} : <iframe`);
      assert.ok(!/<meta[^>]+http-equiv/i.test(h), `${f} : <meta http-equiv`);
      const links = h.match(/<link\b[^>]*>/gi) || [];
      assert.deepEqual(links, ['<link rel="stylesheet" href="style.css">'], `${f} : <link`);
    }
    const css = readFileSync(join(WIKI, 'style.css'), 'utf8');
    assert.ok(!/url\(/i.test(css) && !/@import/i.test(css));
    assert.match(css, /prefers-color-scheme:dark/);
  });

  test('W5 wiki n\'est jamais publié : absent de ELEMENTS_PUBLIES, wiki/** ignoré par firebase.json, absent d\'un paquet plateforme', () => {
    assert.ok(!ELEMENTS_PUBLIES.includes('wiki'));
    assert.ok(JSON.parse(lire('firebase.json')).hosting.ignore.includes('wiki/**'));
    const paquet = construirePaquet('plateforme', { sortie: join(temp, 'w5-dist') });
    assert.ok(!existsSync(join(paquet, 'wiki')));
    assert.ok(!listerFichiers(paquet).some((f) => /^wiki\//.test(f)));
  });

  test('W6 verifier passe sur le dépôt réel, puis échoue après modification d\'un doc sans régénération (copie temporaire)', () => {
    const reel = verifier({ docs: DOCS, sortie: WIKI, sommaire: SOMMAIRE });
    assert.deepEqual(reel, { ok: true, differences: [] }, 'wiki/ n\'est pas à jour : node scripts/wiki/construire.js');
    const docs = join(temp, 'w6-docs');
    const sortie = join(temp, 'w6-wiki');
    mkdirSync(docs);
    for (const n of mdDeDocs()) cpSync(join(DOCS, `${n}.md`), join(docs, `${n}.md`));
    cpSync(WIKI, sortie, { recursive: true });
    assert.equal(verifier({ docs, sortie, sommaire: SOMMAIRE }).ok, true);
    writeFileSync(join(docs, 'roadmap.md'), `${readFileSync(join(docs, 'roadmap.md'), 'utf8')}\nUne ligne ajoutée.\n`);
    const apres = verifier({ docs, sortie, sommaire: SOMMAIRE });
    assert.equal(apres.ok, false);
    assert.deepEqual(apres.differences, ['différent : roadmap.html']);
    // un document supprimé laisse un orphelin signalé, puis effacé à la construction
    rmSync(join(docs, 'roadmap.md'));
    rmSync(join(docs, 'wiki.md'));
    const sommaireReduit = join(temp, 'sommaire-reduit.json');
    writeFileSync(sommaireReduit, JSON.stringify({ titre: 'T', rubriques: [{ titre: 'R', pages: ['portes-et-droits-mcp'] }] }));
    const orphelins = verifier({ docs, sortie, sommaire: sommaireReduit }).differences.filter((d) => d.startsWith('orphelin'));
    assert.deepEqual(orphelins, ["orphelin (le document n'existe plus) : roadmap.html", "orphelin (le document n'existe plus) : wiki.html"]);
    construireWiki({ docs, sortie, sommaire: sommaireReduit });
    assert.ok(!existsSync(join(sortie, 'roadmap.html')));
    assert.equal(verifier({ docs, sortie, sommaire: sommaireReduit }).ok, true);
  });

  test('un sommaire qui cite un .md absent donne une erreur claire ; docs vide aussi ; rien n\'est écrit', () => {
    const sortie = join(temp, 'erreurs');
    const sommaire = join(temp, 'sommaire-faux.json');
    writeFileSync(sommaire, JSON.stringify({ titre: 'T', rubriques: [{ titre: 'R', pages: ['portes-et-droits-mcp', 'page-fantome'] }] }));
    assert.throws(() => construireWiki({ docs: DOCS, sortie, sommaire }), /cite « page-fantome » mais docs\/page-fantome\.md n'existe pas/);
    assert.ok(!existsSync(sortie));
    const vide = join(temp, 'docs-vide');
    mkdirSync(vide);
    assert.throws(() => construireWiki({ docs: vide, sortie, sommaire: SOMMAIRE }), /Aucun document \.md/);
    assert.ok(!existsSync(sortie));
  });

  test('le convertisseur échappe le HTML, rend un tableau mal formé en paragraphe et ne lie que les pages connues', () => {
    const h = markdownVersHtml('<script>x</script> & **gras** et `a<b`\n\n| a | b |\n|---|\n| 1 | 2 |\n\n[ok](roadmap.md) [non](inconnu.md) [web](https://exemple.fr/?a=1&b=2)\n\n- [ ] à faire\n  - sous-élément\n- [x] fait', new Set(['roadmap']));
    assert.ok(!h.includes('<script>'));
    assert.match(h, /&lt;script&gt;x&lt;\/script&gt; &amp; <strong>gras<\/strong> et <code>a&lt;b<\/code>/);
    assert.ok(!h.includes('<table'));
    assert.match(h, /<a href="roadmap\.html">ok<\/a> non <a href="https:\/\/exemple\.fr\/\?a=1&amp;b=2" rel="noopener noreferrer">web<\/a>/);
    assert.match(h, /<li><span class="case">☐<\/span> à faire\n<ul><li>sous-élément<\/li><\/ul><\/li><li><span class="case">☑<\/span> fait<\/li>/);
  });
});
