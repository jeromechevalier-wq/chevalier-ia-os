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

  test('W1 images : une ligne ![texte](images/nom.svg) devient une <figure>, docs/images/ est copié dans wiki/images/, verifier compare aussi les images, tout autre chemin est refusé', () => {
    // le convertisseur : seul un fichier rangé directement dans images/ donne une image
    const h = markdownVersHtml('Avant.\n\n![Un "dessin" <b>](images/dessin.svg)\n\nAprès.');
    assert.match(h, /<p>Avant\.<\/p>\n<figure><img src="images\/dessin\.svg" alt="Un &quot;dessin&quot; &lt;b&gt;"><\/figure>\n<p>Après\.<\/p>/);
    for (const refuse of ['https://exemple.fr/a.svg', '//exemple.fr/a.svg', 'images/../secret.svg', '../images/a.svg', 'images/sous/a.svg', 'images/a.html', 'images/.cache.svg', 'autre/a.svg', '/images/a.svg', 'data:image/svg+xml,x', 'images/a.svg?x=1']) {
      const r = markdownVersHtml(`![texte](${refuse})`);
      assert.ok(!r.includes('<img') && !r.includes('src='), `${refuse} doit être refusé`);
      assert.equal(r, '<p>texte</p>');
    }
    assert.equal(markdownVersHtml('![absente](images/absente.svg)', new Set(), new Set(['autre.svg'])), '<p>absente</p>', 'une image absente de docs/images/ donne son texte seul');
    // la construction : copie, comparaison, orphelin
    const docs = join(temp, 'w1i-docs');
    const sortie = join(temp, 'w1i-wiki');
    const sommaire = join(temp, 'w1i-sommaire.json');
    mkdirSync(join(docs, 'images'), { recursive: true });
    writeFileSync(sommaire, JSON.stringify({ titre: 'T', rubriques: [{ titre: 'R', pages: ['page'] }] }));
    writeFileSync(join(docs, 'page.md'), '# Page\n\n![Le dessin](images/dessin.svg)\n');
    writeFileSync(join(docs, 'images', 'dessin.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(join(docs, 'images', 'notes.txt'), 'pas une image : jamais copié');
    construireWiki({ docs, sortie, sommaire });
    assert.match(readFileSync(join(sortie, 'page.html'), 'utf8'), /<figure><img src="images\/dessin\.svg" alt="Le dessin"><\/figure>/);
    assert.deepEqual(readdirSync(join(sortie, 'images')), ['dessin.svg']);
    assert.ok(readFileSync(join(sortie, 'images', 'dessin.svg')).equals(readFileSync(join(docs, 'images', 'dessin.svg'))));
    assert.equal(verifier({ docs, sortie, sommaire }).ok, true);
    writeFileSync(join(docs, 'images', 'dessin.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><title>changé</title></svg>');
    assert.deepEqual(verifier({ docs, sortie, sommaire }).differences, ['différent : images/dessin.svg']);
    rmSync(join(sortie, 'images', 'dessin.svg'));
    assert.deepEqual(verifier({ docs, sortie, sommaire }).differences, ['manquant : images/dessin.svg']);
    construireWiki({ docs, sortie, sommaire });
    rmSync(join(docs, 'images', 'dessin.svg'));
    assert.deepEqual(verifier({ docs, sortie, sommaire }).differences, ['différent : page.html', "orphelin (l'image n'existe plus) : images/dessin.svg"]);
    assert.deepEqual(construireWiki({ docs, sortie, sommaire }).supprimes, ['images/dessin.svg']);
    assert.ok(!readFileSync(join(sortie, 'page.html'), 'utf8').includes('<img'));
    assert.equal(verifier({ docs, sortie, sommaire }).ok, true);
    // le dépôt réel : la page du schéma de déploiement montre son dessin, et le dessin ne nomme aucun client
    const reel = generer({ docs: DOCS, sommaire: SOMMAIRE });
    assert.match(reel.get('schema-deploiement.html'), /<figure><img src="images\/schema-trois-deploiements\.svg" alt="Les trois déploiements côte à côte"><\/figure>/);
    const svg = reel.get('images/schema-trois-deploiements.svg').toString('utf8');
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title[ >]/);
    assert.match(svg, /<desc[ >]/);
    assert.ok(!/scab/i.test(svg), 'aucun nom de client dans le dessin (dépôt public)');
  });

  test('W2 le premier lien après <main de index.html mène à portes-et-droits-mcp.html', () => {
    const h = generer({ docs: DOCS, sommaire: SOMMAIRE }).get('index.html');
    const apres = h.slice(h.indexOf('<main'));
    assert.equal(apres.match(/<a href="([^"]*)"/)[1], 'portes-et-droits-mcp.html');
  });

  test('W3 dans portes-et-droits-mcp.html, les deux tableaux ont un <tbody> de 2 et de 8 lignes', () => {
    const h = generer({ docs: DOCS, sommaire: SOMMAIRE }).get('portes-et-droits-mcp.html');
    const corps = [...h.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => (m[1].match(/<tr>/g) || []).length);
    assert.deepEqual(corps, [2, 8]);
    assert.equal((h.match(/<thead>/g) || []).length, 2);
    assert.equal((h.match(/<div class="tableau">/g) || []).length, 2);
    assert.match(h, /mcp\/&lt;client&gt;/, 'le HTML du texte est échappé (/mcp/<client> reste visible)');
  });

  test('W4 aucun script, aucune ressource externe ni iframe dans wiki/ (seules images : celles de wiki/images/) ; style.css sans url() ni @import', () => {
    const fichiers = readdirSync(WIKI);
    assert.ok(fichiers.includes('style.css'));
    for (const f of fichiers.filter((x) => x.endsWith('.html'))) {
      const h = readFileSync(join(WIKI, f), 'utf8');
      assert.ok(!/<script/i.test(h), `${f} : <script`);
      // seul src= admis : une image locale de wiki/images/, écrite par le générateur
      const sansImages = h.replace(/<figure><img src="images\/([^"/]+)" alt="[^"<>]*"><\/figure>/g, (_, nom) => { assert.ok(existsSync(join(WIKI, 'images', nom)), `${f} : image ${nom} absente de wiki/images/`); return ''; });
      assert.ok(!/\ssrc=/i.test(sansImages), `${f} : src=`);
      assert.ok(!/<iframe/i.test(h), `${f} : <iframe`);
      assert.ok(!/<meta[^>]+http-equiv/i.test(h), `${f} : <meta http-equiv`);
      const links = h.match(/<link\b[^>]*>/gi) || [];
      assert.deepEqual(links, ['<link rel="stylesheet" href="style.css">'], `${f} : <link`);
    }
    // les images SVG copiées : ni script, ni gestionnaire d'événement, ni ressource externe
    for (const f of existsSync(join(WIKI, 'images')) ? readdirSync(join(WIKI, 'images')).filter((x) => x.endsWith('.svg')) : []) {
      const s = readFileSync(join(WIKI, 'images', f), 'utf8');
      assert.ok(!/<script|<foreignObject|\son\w+=|javascript:/i.test(s), `images/${f} : script`);
      assert.ok(!/(href|src)="(?!#)|url\((?!#)|@import/i.test(s), `images/${f} : ressource externe`);
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

  // Décision de Jérôme du 27/11/2026 : « Je veux pas bloquer des PR pour une histoire de wiki qui n'est pas à jour. Hors de question. »
  // Un wiki/ commité en retard sur docs/ ne fait donc plus échouer la coche « Tests » : W6 affiche un AVERTISSEMENT (journal du test
  // et annotation GitHub ::warning::). Ce test n'est pas désactivé : il vérifie toujours que la construction tourne sans erreur sur les
  // vrais docs/ et que verifier() repère bien un retard (copie temporaire). W5 (wiki jamais publiable) reste bloquant : c'est de la sécurité.
  test('W6 la construction tourne sans erreur sur le dépôt réel ; un wiki/ en retard donne un avertissement (pas un échec) ; verifier repère un doc modifié (copie temporaire)', () => {
    const r = construireWiki({ docs: DOCS, sortie: join(temp, 'w6-reel'), sommaire: SOMMAIRE });
    assert.ok(r.pages > 1);
    const reel = verifier({ docs: DOCS, sortie: WIKI, sommaire: SOMMAIRE });
    if (!reel.ok) {
      const message = `wiki/ n'est pas à jour avec docs/ (${reel.differences.length} différence(s)) : lancer node scripts/wiki/construire.js quand on peut. Ne bloque pas la PR (décision de Jérôme du 27/11/2026).`;
      console.log(`AVERTISSEMENT : ${message}`);
      console.log(`::warning title=Wiki en retard::${message}`);
    }
    const docs = join(temp, 'w6-docs');
    const sortie = join(temp, 'w6-wiki');
    mkdirSync(docs);
    for (const n of mdDeDocs()) cpSync(join(DOCS, `${n}.md`), join(docs, `${n}.md`));
    cpSync(join(DOCS, 'images'), join(docs, 'images'), { recursive: true }); // les images font partie de la construction
    // part du wiki fraîchement construit (w6-reel), pas de wiki/ commité qui peut être en retard
    cpSync(join(temp, 'w6-reel'), sortie, { recursive: true });
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
