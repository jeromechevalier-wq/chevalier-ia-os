// PR A « vocabulaire et registre du menu » (18/10/2026) : points 3, 4 et 6 du brief, sans navigateur ni émulateur.
// (Les points 1, 2, 3 à l'écran et 5 ont leurs tests dans tests/e2e/menu-vocabulaire*.spec.js, avec leurs captures.)
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import {
  MODULES_DECLARES, GROUPES_MENU, INTERRUPTEURS, modulesDeNom, modulesActifsDuClient, blocsDuMenu, moduleDeRoute, lireModulesDemandes,
} from '../js/os/registre.js';
import { MODULES } from '../js/os/modules.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/** Textes des chaînes entre quotes (' " `) d'un fichier JavaScript, commentaires et expressions régulières exclus. { texte, ligne }. */
export function chainesDe(source) {
  const chaines = [];
  let i = 0;
  let ligne = 1;
  let dernier = ''; // dernier caractère significatif hors espaces : décide si « / » ouvre une expression régulière
  const n = source.length;
  const lireChaine = (quote, profondeur = 0) => {
    const debutLigne = ligne;
    let texte = '';
    i += 1;
    while (i < n) {
      const c = source[i];
      if (c === '\\') { texte += source.slice(i, i + 2); if (source[i + 1] === '\n') ligne += 1; i += 2; continue; }
      if (c === '\n') ligne += 1;
      if (c === quote) { i += 1; break; }
      if (quote === '`' && c === '$' && source[i + 1] === '{') { // expression d'un gabarit : son code est analysé comme du code
        i += 2;
        let niveau = 1;
        while (i < n && niveau > 0) {
          const d = source[i];
          if (d === '{') { niveau += 1; i += 1; } else if (d === '}') { niveau -= 1; i += 1; } else if (d === '\n') { ligne += 1; i += 1; } else if (d === '\'' || d === '"' || d === '`') lireChaine(d, profondeur + 1); else i += 1;
        }
        continue;
      }
      texte += c;
      i += 1;
    }
    chaines.push({ texte, ligne: debutLigne });
  };
  while (i < n) {
    const c = source[i];
    if (c === '\n') { ligne += 1; i += 1; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i += 1; continue; }
    if (c === '/' && source[i + 1] === '*') { const fin = source.indexOf('*/', i + 2); const bloc = source.slice(i, fin === -1 ? n : fin + 2); ligne += (bloc.match(/\n/g) || []).length; i += bloc.length; continue; }
    if (c === '\'' || c === '"' || c === '`') { lireChaine(c); dernier = '"'; continue; }
    if (c === '/' && (dernier === '' || '(,=:[!&|?{};+-*%<>~^'.includes(dernier))) { // expression régulière
      i += 1;
      let classe = false;
      while (i < n && (source[i] !== '/' || classe) && source[i] !== '\n') {
        if (source[i] === '\\') i += 1; else if (source[i] === '[') classe = true; else if (source[i] === ']') classe = false;
        i += 1;
      }
      i += 1;
      dernier = ')';
      continue;
    }
    if (!/\s/.test(c)) dernier = c;
    i += 1;
  }
  return chaines;
}

function fichiers(dossier, extension) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === 'node_modules' ? [] : fichiers(chemin, extension);
    return chemin.endsWith(extension) ? [chemin] : [];
  });
}

// Exceptions : aucune pour l'instant. Une chaîne qui doit garder « CRM » (identifiant technique) s'ajoute ici avec sa raison, en texte exact.
// Les adresses #/crm/…, 'crm', crm_…, reglages-…, css/crm.css et l'alias `CRM.` (import * as CRM) sont en minuscules ou ne sont pas des chaînes : elles ne sont pas visées.
const EXCEPTIONS = new Set([]);
/** Ce qui ne doit plus s'écrire dans une chaîne visible : le mot CRM et les anciens noms « Étapes de vente » / « Phases de projet » (singulier). */
const interdit = (t) => /CRM/.test(t) || /tapes de vente|hases de projet\b/i.test(t);

describe('3 plus de mot « CRM » visible', () => {
  test('3 l’analyseur de chaînes ignore les commentaires, les expressions régulières et lit les gabarits', () => {
    const src = ['// "CRM" en commentaire', '/* \'CRM\' */ const a = \'ok\';', 'const r = /"CRM"/.test(x);', 'const b = `Bonjour ${nom + "CRM1"} fin`;', 'const c = "Mon CRM";'].join('\n');
    assert.deepEqual(chainesDe(src).filter((x) => x.texte.includes('CRM')).map((x) => [x.texte, x.ligne]), [['CRM1', 4], ['Mon CRM', 5]]);
  });

  test('3 le manifeste de l’application ne dit pas « CRM »', () => {
    const m = JSON.parse(readFileSync(join(RACINE, 'manifest.webmanifest'), 'utf8'));
    for (const [cle, valeur] of Object.entries(m)) if (typeof valeur === 'string') assert.ok(!interdit(valeur), `manifest.webmanifest ${cle} : ${valeur}`);
  });

  test('3 aucune chaîne de js/**/*.js ni de index.html ne contient « CRM », « Étapes de vente » ni « Phases de projet » (commentaires exclus)', () => {
    const trouves = [];
    for (const f of fichiers(join(RACINE, 'js'), '.js')) {
      for (const c of chainesDe(readFileSync(f, 'utf8'))) {
        if (interdit(c.texte) && !EXCEPTIONS.has(c.texte)) trouves.push(`${relative(RACINE, f)}:${c.ligne} « ${c.texte.slice(0, 80)} »`);
      }
    }
    // index.html : le texte de la page (hors commentaires HTML) et les chaînes de ses scripts en ligne (leurs commentaires sont exclus).
    const html = readFileSync(join(RACINE, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const texte = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/g, '');
    texte.split('\n').forEach((l, k) => { if (interdit(l)) trouves.push(`index.html (page) ligne ${k + 1} ${l.trim().slice(0, 80)}`); });
    for (const code of scripts) for (const c of chainesDe(code)) if (interdit(c.texte)) trouves.push(`index.html (script) « ${c.texte.slice(0, 80)} »`);
    assert.deepEqual(trouves, [], 'le mot « CRM » ne doit plus être écrit dans ce que l’utilisateur voit');
  });
});

describe('4 le raccourci « crm » reste lu, n’est plus proposé', () => {
  test('4 une fiche `crm: true` allume affaires et projets (les deux modules, donc leurs écrans et leurs outils MCP)', () => {
    const { actifs, erreurs } = modulesActifsDuClient({ modules: { crm: true } });
    assert.deepEqual(actifs, ['affaires', 'projets']);
    assert.deepEqual(erreurs, []);
    assert.deepEqual(lireModulesDemandes({ modules: { crm: true } }).demandes, ['affaires', 'projets']);
    const outils = MODULES_DECLARES.filter((m) => actifs.includes(m.id)).flatMap((m) => m.outilsMcp);
    assert.ok(outils.includes('creer_affaire') && outils.includes('creer_projet'));
    assert.deepEqual(blocsDuMenu(actifs)[0].modules, ['affaires', 'projets']);
  });
  test('4 INTERRUPTEURS et modulesDeNom existent toujours ; une valeur précise l’emporte sur le raccourci', () => {
    assert.deepEqual(INTERRUPTEURS.crm, ['affaires', 'projets']);
    assert.deepEqual(modulesDeNom('crm'), ['affaires', 'projets']);
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: true, projets: false } }).actifs, ['affaires']);
  });
  test('4 la documentation dit d’écrire affaires: true + projets: true', () => {
    for (const f of ['docs/activer-desactiver-modules.md', 'docs/nouveau-client.md']) {
      const t = readFileSync(join(RACINE, f), 'utf8');
      assert.match(t, /affaires/);
      assert.match(t, /projets/);
      assert.match(t, /plus (proposé|écrire)/, f);
    }
    assert.match(readFileSync(join(RACINE, 'docs/activer-desactiver-modules.md'), 'utf8'), /`affaires: true` \*\*et\*\* `projets: true`/);
  });
  test('4 l’aide de l’outil nouveau-client ne propose plus « crm » et l’affiche « affaires,projets »', () => {
    const src = readFileSync(join(RACINE, 'scripts/plateforme/nouveau-client.js'), 'utf8');
    const aide = src.slice(src.indexOf('export const AIDE'), src.indexOf('`;', src.indexOf('export const AIDE')));
    assert.doesNotMatch(aide, /--modules crm|activer-module <identifiant> crm/);
    assert.match(aide, /--modules affaires,projets/);
    assert.match(src, /concernes\.join\(','\)/);
  });
});

describe('6 commentaire de js/os/modules.js', () => {
  test('6 le commentaire ne dit plus qu’automatisations n’est pas chez Jérôme, et le menu de la racine l’a bien', () => {
    const src = readFileSync(join(RACINE, 'js/os/modules.js'), 'utf8');
    assert.doesNotMatch(src, /n'est plus depuis le 16\/10/);
    assert.match(src, /automatisations » existe chez Jérôme/);
    const ids = MODULES.map((m) => m.id);
    assert.ok(ids.includes('automatisations'), 'automatisations est monté à la racine');
    assert.ok(ids.includes('mcp'), 'mcp (Connecter mon assistant) est monté à la racine depuis la PR B');
  });
});

describe('1 et 2 registre', () => {
  test('1 projets/archives n’est plus une entrée de menu mais le module projets sert toujours cette route', () => {
    const projets = MODULES_DECLARES.find((m) => m.id === 'projets');
    assert.ok(!projets.ecrans.some((e) => e.route === 'projets/archives'));
    assert.ok(!GROUPES_MENU[0].ordreMenu.includes('projets/archives'));
    assert.equal(moduleDeRoute('projets').id, 'projets');
    const index = readFileSync(join(RACINE, 'js/modules/projets/index.js'), 'utf8');
    assert.match(index, /archives/, 'le module garde son écran archives');
  });
  test('2 le groupe garde l’id « crm » mais s’appelle « Affaires et projets »', () => {
    assert.equal(GROUPES_MENU[0].id, 'crm');
    assert.equal(GROUPES_MENU[0].nom, 'Affaires et projets');
    assert.equal(GROUPES_MENU[0].libelleMenu, 'Affaires et projets');
    assert.equal(MODULES_DECLARES.find((m) => m.id === 'affaires').libelleMenu, 'Affaires et projets');
    assert.equal(MODULES_DECLARES.find((m) => m.id === 'affaires').prefixe, 'crm');
  });
});
