// Génère le wiki local (wiki/) à partir de docs/*.md. Aucune dépendance, ne contacte aucun serveur, ne lit que docs/*.md (premier niveau),
// scripts/wiki/sommaire.json et son propre gabarit. Résultat déterministe : ni date, ni chemin absolu dans le HTML.
//
//   node scripts/wiki/construire.js             écrit wiki/
//   node scripts/wiki/construire.js --verifier  compare wiki/ avec ce que donnerait la construction, sans rien écrire (code 1 si différent)
//
// Le wiki est LOCAL : il n'est jamais publié (firebase.json l'ignore, un test le garde). Mode d'emploi : docs/wiki.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAR_DEFAUT = { docs: join(RACINE, 'docs'), sortie: join(RACINE, 'wiki'), sommaire: join(RACINE, 'scripts', 'wiki', 'sommaire.json') };

// ---------- Markdown vers HTML (seulement ce que les docs utilisent) ----------

const echapper = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const indentation = (l) => l.match(/^ */)[0].length;
const vide = (l) => l.trim() === '';
const RE_LISTE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_SEPARATEUR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Texte brut d'une ligne Markdown (pour les titres et les ancres). */
const brut = (md) => md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*~]/g, '').replace(/<(https?:[^>]*)>/g, '$1').trim();
const ancre = (t) => brut(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

/** Lien relatif x.md : devient x.html si la page existe dans le wiki, sinon simple texte. */
function lien(texte, url, ctx) {
  if (/^https?:\/\//i.test(url)) return `<a href="${url}" rel="noopener noreferrer">${texte}</a>`;
  if (url.startsWith('#')) return `<a href="${url}">${texte}</a>`;
  const m = url.match(/^(?:\.\/|(?:\.\.\/)?docs\/)?([^/#?:]+)\.md(#.*)?$/);
  if (m && ctx.noms.has(m[1])) return `<a href="${m[1]}.html${m[2] || ''}">${texte}</a>`;
  return texte;
}

/** Mise en forme dans une ligne : code, liens, gras, italique, barré. Tout le HTML du texte est échappé. */
export function enligne(texte, ctx) {
  const reserve = [];
  const garde = (html) => `\u0000${reserve.push(html) - 1}\u0000`;
  let t = texte.replace(/`([^`]+)`/g, (_, c) => garde(`<code>${echapper(c)}</code>`));
  t = t.replace(/<(https?:\/\/[^\s>]+)>/g, (_, u) => garde(`<a href="${echapper(u)}" rel="noopener noreferrer">${echapper(u)}</a>`));
  t = echapper(t);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => lien(txt, url, ctx));
  t = t.replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/~~(?=\S)(.+?)~~/g, '<del>$1</del>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => reserve[Number(n)]);
}

/** Découpe une ligne de tableau en cellules ; une barre | dans un code `…` ou précédée de \ ne coupe pas. */
function cellules(ligne) {
  let l = ligne.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  const res = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '`') code = !code;
    if (c === '\\' && l[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '|' && !code) { res.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  res.push(cur.trim());
  return res;
}

function tableau(entete, separateur, lignes, ctx) {
  const tetes = cellules(entete);
  const aligns = cellules(separateur).map((s) => (s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : ''));
  if (tetes.length !== aligns.length) return null; // mal formé : l'appelant le rend en paragraphe
  const style = (i) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : '');
  const th = tetes.map((c, i) => `<th${style(i)}>${enligne(c, ctx)}</th>`).join('');
  const corps = lignes.map((l) => {
    const c = cellules(l);
    return `<tr>${tetes.map((_, i) => `<td${style(i)}>${enligne(c[i] ?? '', ctx)}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="tableau"><table><thead><tr>${th}</tr></thead><tbody>${corps}</tbody></table></div>`;
}

function elementListe(lignes, i, ctx) {
  const base = indentation(lignes[i]);
  const m = lignes[i].match(RE_LISTE);
  const suite = [];
  const dansCode = new Set(); // lignes d'un bloc de code ouvert dans l'élément : gardées même sans retrait
  let ouvert = false;
  let j = i + 1;
  while (j < lignes.length) {
    if (ouvert) {
      if (/^\s*```/.test(lignes[j])) ouvert = false; else dansCode.add(suite.length);
      suite.push(lignes[j++]);
      continue;
    }
    if (vide(lignes[j])) {
      let k = j;
      while (k < lignes.length && vide(lignes[k])) k++;
      if (k < lignes.length && indentation(lignes[k]) > base) { while (j < k) suite.push(lignes[j++]); continue; }
      break;
    }
    if (indentation(lignes[j]) <= base) break;
    if (/^\s*```/.test(lignes[j])) ouvert = true;
    suite.push(lignes[j++]);
  }
  const retrait = Math.min(...suite.filter((l, n) => !vide(l) && !dansCode.has(n)).map(indentation), Infinity);
  const enlever = (l) => (Number.isFinite(retrait) ? l.replace(new RegExp(`^ {0,${retrait}}`), '') : l);
  let premiere = m[3];
  let case_ = '';
  const tache = premiere.match(/^\[([ xX])\]\s+(.*)$/);
  if (tache) { case_ = `<span class="case">${tache[1] === ' ' ? '☐' : '☑'}</span> `; premiere = tache[2]; }
  const html = blocs([premiere, ...suite.map((l) => (vide(l) ? '' : enlever(l)))], ctx).replace(/^<p>([\s\S]*?)<\/p>/, '$1');
  return { html: `<li>${case_}${html}</li>`, fin: j };
}

function liste(lignes, i, ctx) {
  const base = indentation(lignes[i]);
  const ordonnee = /^\d/.test(lignes[i].match(RE_LISTE)[2]);
  const debut = ordonnee ? parseInt(lignes[i].match(RE_LISTE)[2], 10) : 1;
  const items = [];
  while (i < lignes.length) {
    const m = lignes[i].match(RE_LISTE);
    if (!m || indentation(lignes[i]) !== base || /^\d/.test(m[2]) !== ordonnee || RE_HR.test(lignes[i])) break;
    const it = elementListe(lignes, i, ctx);
    items.push(it.html);
    i = it.fin;
    let k = i;
    while (k < lignes.length && vide(lignes[k])) k++; // lignes vides entre deux éléments du même niveau : la liste continue
    if (k > i && k < lignes.length && RE_LISTE.test(lignes[k]) && indentation(lignes[k]) === base) i = k;
  }
  const balise = ordonnee ? 'ol' : 'ul';
  return { html: `<${balise}${ordonnee && debut !== 1 ? ` start="${debut}"` : ''}>${items.join('')}</${balise}>`, fin: i };
}

/** Débute-t-on un autre bloc à cette ligne (donc le paragraphe s'arrête) ? */
function debutBloc(lignes, i) {
  const l = lignes[i];
  return vide(l) || /^\s*```/.test(l) || /^\s{0,3}#{1,6}\s/.test(l) || /^\s*>/.test(l) || RE_HR.test(l) || RE_LISTE.test(l)
    || (l.includes('|') && i + 1 < lignes.length && RE_SEPARATEUR.test(lignes[i + 1]) && lignes[i + 1].includes('-') && lignes[i + 1].includes('|'));
}

export function blocs(lignes, ctx) {
  const out = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (vide(l)) { i++; continue; }
    if (/^\s*```/.test(l)) {
      const code = [];
      i++;
      while (i < lignes.length && !/^\s*```/.test(lignes[i])) code.push(lignes[i++]);
      i++;
      out.push(`<pre><code>${echapper(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = l.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      let id = ancre(h[2]);
      for (let n = 2; ctx.ids.has(id); n++) id = `${ancre(h[2])}-${n}`;
      ctx.ids.add(id);
      out.push(`<h${h[1].length} id="${id}">${enligne(h[2], ctx)}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (RE_HR.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lignes.length && /^\s*>/.test(lignes[i])) q.push(lignes[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${blocs(q, ctx)}</blockquote>`);
      continue;
    }
    if (RE_LISTE.test(l)) {
      const r = liste(lignes, i, ctx);
      out.push(r.html);
      i = r.fin;
      continue;
    }
    if (l.includes('|') && i + 1 < lignes.length && RE_SEPARATEUR.test(lignes[i + 1]) && lignes[i + 1].includes('|')) {
      const corps = [];
      let j = i + 2;
      while (j < lignes.length && !vide(lignes[j]) && lignes[j].includes('|')) corps.push(lignes[j++]);
      const t = tableau(l, lignes[i + 1], corps, ctx);
      if (t) { out.push(t); i = j; continue; }
      // tableau mal formé : paragraphe, sans plantage
      out.push(`<p>${lignes.slice(i, j).map((x) => enligne(x.trim(), ctx)).join('<br>')}</p>`);
      i = j;
      continue;
    }
    const p = [l.trim()];
    i++;
    while (i < lignes.length && !debutBloc(lignes, i)) p.push(lignes[i++].trim());
    out.push(`<p>${enligne(p.join(' '), ctx)}</p>`);
  }
  return out.join('\n');
}

export function markdownVersHtml(md, noms = new Set()) {
  const ctx = { noms, ids: new Set() };
  return blocs(md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), ctx);
}

/** Premier titre # d'un document (hors blocs de code), sinon le nom du fichier. */
function titreDe(md, nom) {
  let code = false;
  for (const l of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(l)) code = !code;
    const m = !code && l.match(/^#\s+(.*?)\s*#*\s*$/);
    if (m) return brut(m[1]);
  }
  return nom;
}

// ---------- Gabarit et feuille de style ----------

const CSS = `:root{--fond:#ffffff;--texte:#1f2328;--doux:#59636e;--bord:#d1d9e0;--accent:#0b5cad;--bloc:#f6f8fa;--lateral:#f6f8fa;--code:#eff1f3;--actif:#ddebf9}
@media (prefers-color-scheme:dark){:root{--fond:#0f1419;--texte:#e6edf3;--doux:#9aa7b4;--bord:#2d3640;--accent:#6cb2ff;--bloc:#161c23;--lateral:#131920;--code:#1d252d;--actif:#1c3047}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fond);color:var(--texte);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
a{color:var(--accent)}
.page{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:100vh}
.lateral{background:var(--lateral);border-right:1px solid var(--bord);padding:20px 16px;position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto}
.marque{display:block;font-weight:700;font-size:1.05rem;color:var(--texte);text-decoration:none;margin-bottom:12px}
.menu-mobile{display:none;background:var(--lateral);border-bottom:1px solid var(--bord);padding:10px 16px}
.menu-mobile summary{cursor:pointer;font-weight:600;padding:6px 0}
.rubrique{margin:16px 0 4px;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--doux)}
.lateral ul,.menu-mobile ul{list-style:none;margin:0;padding:0}
.lateral li a,.menu-mobile li a{display:block;padding:4px 8px;border-radius:6px;color:var(--texte);text-decoration:none;font-size:.9rem;line-height:1.35}
.lateral li a:hover,.menu-mobile li a:hover{background:var(--actif)}
.lateral li a[aria-current],.menu-mobile li a[aria-current]{background:var(--actif);font-weight:600}
main{min-width:0;max-width:60rem;padding:28px 32px 56px}
main h1{font-size:1.9rem;line-height:1.25;margin:0 0 16px}
main h2{font-size:1.4rem;margin:2rem 0 .6rem;padding-bottom:.25rem;border-bottom:1px solid var(--bord)}
main h3{font-size:1.15rem;margin:1.5rem 0 .4rem}
main h4,main h5,main h6{font-size:1rem;margin:1.2rem 0 .3rem}
main p,main ul,main ol,main blockquote,main pre{margin:0 0 1rem}
main ul,main ol{padding-left:1.5rem}
main li{margin:.2rem 0}
main li>ul,main li>ol{margin:.2rem 0}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code);padding:.1em .35em;border-radius:4px}
pre{background:var(--bloc);border:1px solid var(--bord);border-radius:8px;padding:12px 14px;overflow-x:auto}
pre code{background:none;padding:0;white-space:pre;overflow-wrap:normal}
blockquote{border-left:4px solid var(--accent);background:var(--bloc);padding:.6rem 1rem;border-radius:0 8px 8px 0;color:var(--doux)}
blockquote>:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid var(--bord);margin:1.5rem 0}
.tableau{overflow-x:auto;margin:0 0 1rem;border:1px solid var(--bord);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:.93rem}
th,td{padding:8px 12px;border-bottom:1px solid var(--bord);text-align:left;vertical-align:top;min-width:6rem}
th{background:var(--bloc)}
tbody tr:last-child td{border-bottom:0}
.case{font-size:1.1em}
.source{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--bord);color:var(--doux);font-size:.85rem}
.rubriques{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:16px}
.carte{background:var(--bloc);border:1px solid var(--bord);border-radius:10px;padding:14px 16px}
.carte h2{font-size:1.05rem;margin:0 0 8px;padding:0;border:0}
.carte ul{margin:0;padding-left:1.1rem}
.carte li{margin:.35rem 0;font-size:.93rem}
.depart{border-color:var(--accent)}
@media (max-width:800px){
.page{display:block}
.lateral{display:none}
.menu-mobile{display:block}
main{padding:20px 16px 40px}
main h1{font-size:1.5rem}
}
`;

function menu(rubriques, courant) {
  return rubriques.map((r) => `<p class="rubrique">${echapper(r.titre)}</p><ul>${r.pages.map((p) => `<li><a href="${p.nom}.html"${p.nom === courant ? ' aria-current="page"' : ''}>${echapper(p.titre)}</a></li>`).join('')}</ul>`).join('');
}

function page({ titreSite, titrePage, rubriques, courant, contenu }) {
  const m = menu(rubriques, courant);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${echapper(courant === 'index' ? titreSite : `${titrePage} : ${titreSite}`)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<!-- Page générée par scripts/wiki/construire.js depuis docs/ : ne pas la modifier ici (mode d'emploi : docs/wiki.md). -->
<details class="menu-mobile"><summary>Menu</summary><a class="marque" href="index.html">${echapper(titreSite)}</a>${m}</details>
<div class="page">
<nav class="lateral" aria-label="Menu"><a class="marque" href="index.html">${echapper(titreSite)}</a>${m}</nav>
<main>
${contenu}
</main>
</div>
</body>
</html>
`;
}

// ---------- Construction ----------

function lireSommaire(chemin) {
  if (!existsSync(chemin)) throw new Error(`Sommaire introuvable : ${chemin}`);
  let s;
  try { s = JSON.parse(readFileSync(chemin, 'utf8')); } catch (e) { throw new Error(`Sommaire illisible (JSON invalide) : ${e.message}`); }
  if (!s || typeof s.titre !== 'string' || !Array.isArray(s.rubriques)) throw new Error('Sommaire : il faut un « titre » et une liste « rubriques ».');
  for (const r of s.rubriques) if (!r || typeof r.titre !== 'string' || !Array.isArray(r.pages) || r.pages.some((p) => typeof p !== 'string')) throw new Error('Sommaire : chaque rubrique a un « titre » et une liste « pages » de noms de documents.');
  return s;
}

/** Tout ce que donne la construction, en mémoire : Map nom de fichier -> contenu. N'écrit rien. */
export function generer({ docs = PAR_DEFAUT.docs, sommaire = PAR_DEFAUT.sommaire } = {}) {
  if (!existsSync(docs)) throw new Error(`Dossier de documents introuvable : ${docs}`);
  const noms = readdirSync(docs, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name.slice(0, -3)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!noms.length) throw new Error(`Aucun document .md dans ${docs} : rien à construire.`);
  if (noms.includes('index')) throw new Error('docs/index.md ne peut pas exister : la page d\'accueil du wiki s\'appelle déjà index.html.');
  const s = lireSommaire(sommaire);
  const connus = new Set(noms);
  const vus = new Set();
  for (const r of s.rubriques) for (const p of r.pages) {
    if (!connus.has(p)) throw new Error(`Le sommaire cite « ${p} » mais docs/${p}.md n'existe pas. Corrige scripts/wiki/sommaire.json.`);
    if (vus.has(p)) throw new Error(`Le sommaire cite « ${p} » deux fois.`);
    vus.add(p);
  }
  const sources = new Map(noms.map((n) => [n, readFileSync(join(docs, `${n}.md`), 'utf8')]));
  const titres = new Map(noms.map((n) => [n, titreDe(sources.get(n), n)]));
  const reste = noms.filter((n) => !vus.has(n));
  const groupes = [...s.rubriques.map((r) => ({ titre: r.titre, noms: r.pages })), ...(reste.length ? [{ titre: 'Autres', noms: reste }] : [])].filter((g) => g.noms.length);
  const rubriques = groupes.map((g) => ({ titre: g.titre, pages: g.noms.map((n) => ({ nom: n, titre: titres.get(n) })) }));

  const fichiers = new Map();
  fichiers.set('style.css', CSS);
  const gabarit = (courant, titrePage, contenu) => page({ titreSite: s.titre, titrePage, rubriques, courant, contenu });
  for (const n of noms) {
    const corps = markdownVersHtml(sources.get(n), connus);
    const contenu = `<article>\n${corps}\n</article>\n<p class="source">Page générée depuis <code>docs/${n}.md</code> : on ne la modifie pas ici.</p>`;
    fichiers.set(`${n}.html`, gabarit(n, titres.get(n), contenu));
  }
  const cartes = rubriques.map((r, i) => `<section class="carte${i === 0 ? ' depart' : ''}"><h2>${echapper(r.titre)}</h2><ul>${r.pages.map((p) => `<li><a href="${p.nom}.html">${echapper(p.titre)}</a></li>`).join('')}</ul></section>`).join('\n');
  const accueil = `<h1>${echapper(s.titre)}</h1>\n<p>Cette documentation est une copie de lecture, générée depuis le dossier <code>docs/</code> du dépôt. Elle reste sur cet ordinateur : elle n'est jamais publiée sur internet. La première rubrique est la page de départ.</p>\n<div class="rubriques">\n${cartes}\n</div>`;
  fichiers.set('index.html', gabarit('index', s.titre, accueil));
  return fichiers;
}

function fichiersExistants(sortie) {
  return existsSync(sortie) ? readdirSync(sortie, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];
}

/** Écrit le wiki dans `sortie` et efface les .html orphelins (document supprimé). Retourne { pages, ecrits, supprimes }. */
export function construire({ docs = PAR_DEFAUT.docs, sortie = PAR_DEFAUT.sortie, sommaire = PAR_DEFAUT.sommaire } = {}) {
  const fichiers = generer({ docs, sommaire }); // tout est vérifié avant de toucher au disque
  mkdirSync(sortie, { recursive: true });
  const supprimes = fichiersExistants(sortie).filter((f) => f.endsWith('.html') && !fichiers.has(f));
  for (const f of supprimes) rmSync(join(sortie, f));
  for (const [nom, contenu] of fichiers) writeFileSync(join(sortie, nom), contenu);
  return { pages: [...fichiers.keys()].filter((f) => f.endsWith('.html')).length, ecrits: fichiers.size, supprimes };
}

/** Compare octet à octet `sortie` et la construction en mémoire. N'écrit rien. Retourne { ok, differences }. */
export function verifier({ docs = PAR_DEFAUT.docs, sortie = PAR_DEFAUT.sortie, sommaire = PAR_DEFAUT.sommaire } = {}) {
  const fichiers = generer({ docs, sommaire });
  const differences = [];
  for (const [nom, contenu] of fichiers) {
    const chemin = join(sortie, nom);
    if (!existsSync(chemin)) differences.push(`manquant : ${nom}`);
    else if (!readFileSync(chemin).equals(Buffer.from(contenu))) differences.push(`différent : ${nom}`);
  }
  for (const f of fichiersExistants(sortie)) if (f.endsWith('.html') && !fichiers.has(f)) differences.push(`orphelin (le document n'existe plus) : ${f}`);
  return { ok: differences.length === 0, differences };
}

// ---------- Ligne de commande ----------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--verifier')) {
      const r = verifier();
      if (r.ok) console.log('wiki/ est à jour avec docs/.');
      else {
        console.error('wiki/ n\'est pas à jour avec docs/ :');
        for (const d of r.differences) console.error(`  - ${d}`);
        console.error('Régénère-le : node scripts/wiki/construire.js (puis commite wiki/).');
        process.exit(1);
      }
    } else {
      const r = construire();
      console.log(`wiki/ construit : ${r.pages} pages${r.supprimes.length ? `, ${r.supprimes.length} page(s) orpheline(s) effacée(s) (${r.supprimes.join(', ')})` : ''}.`);
    }
  } catch (e) {
    console.error(`Erreur : ${e.message}`);
    process.exit(1);
  }
}
